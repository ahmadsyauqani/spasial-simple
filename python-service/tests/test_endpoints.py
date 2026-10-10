"""Integration tests for the async geo endpoints (TestClient + synthetic data)."""
import json
import os
import sys
import time

import geopandas as gpd
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Polygon, box

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import app  # noqa: E402

client = TestClient(app)


def wait_job(job_id: str, timeout: float = 60.0) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = client.get(f"/jobs/{job_id}")
        assert r.status_code == 200, r.text
        last = r.json()
        assert set(last) >= {"status", "progress", "message"}
        if last["status"] in ("done", "error"):
            return last
        time.sleep(0.1)
    raise AssertionError(f"job timed out, last={last}")


def sq(x, y, s=20.0):
    return box(x, y, x + s, y + s)


# ---------------------------------------------------------------------------
# (a) CRS inspect: TM-3 zone 49.1 without .prj -> EPSG:23835
# ---------------------------------------------------------------------------
def test_crs_inspect_guess_tm3_49_1(tmp_path):
    # Build parcels in EPSG:23835 (TM-3 49.1, Central Java area), then strip CRS.
    pts = gpd.GeoSeries([Polygon([(110.4, -7.0), (110.41, -7.0), (110.41, -6.99), (110.4, -6.99)])], crs=4326)
    tm3 = pts.to_crs(23835)
    gdf = gpd.GeoDataFrame({"NIB": ["001"]}, geometry=tm3, crs=23835)
    gdf = gdf.set_crs(None, allow_override=True)  # simulate missing .prj
    # geojson has no crs info at all
    fc = json.loads(gdf.to_json())
    fc.pop("crs", None)

    # Without a location hint the TM-3 zone is inherently ambiguous (all zones share the same false
    # easting/northing): expect a TM-3 guess with 23835 among the ranked candidates.
    r = client.post("/crs/inspect-reproject", json={"geojson": fc, "sample_only": True})
    assert r.status_code == 202
    job = wait_job(r.json()["job_id"])
    assert job["status"] == "done", job
    res = job["result"]
    assert res["confidence"] == "guessed"
    assert 23830 <= res["detected_crs"]["epsg"] <= 23845, res["detected_crs"]
    assert 23835 in [c["epsg"] for c in res["crs_candidates"]]
    assert "Zona lain yang juga mungkin" in res["guess_reason"]
    assert "geojson" not in res
    assert res["feature_count"] == 1
    assert res["geometry_types"] == ["Polygon"]

    # With an approximate location (e.g. from the province picker) the guess resolves to 49.1 exactly.
    r = client.post("/crs/inspect-reproject", json={"geojson": fc, "sample_only": True,
                                                   "hint_lon": 110.0, "hint_lat": -7.0})
    job = wait_job(r.json()["job_id"])
    assert job["status"] == "done", job
    res = job["result"]
    assert res["detected_crs"]["epsg"] == 23835, res
    assert res["confidence"] == "guessed"
    assert "49.1" in res["guess_reason"]
    assert res["crs_candidates"][0]["epsg"] == 23835

    # also via a gpkg upload with no CRS -> same guess and reprojected output
    gpkg = tmp_path / "tm3.gpkg"
    gdf.to_file(gpkg, driver="GPKG")
    with open(gpkg, "rb") as f:
        r = client.post("/crs/inspect-reproject", files={"file": ("tm3.gpkg", f, "application/octet-stream")},
                        data={"target_epsg": "4326", "hint_lon": "110.4", "hint_lat": "-7"})
    assert r.status_code == 202
    job = wait_job(r.json()["job_id"])
    assert job["status"] == "done", job
    res = job["result"]
    assert res["detected_crs"]["epsg"] == 23835
    assert res["confidence"] == "guessed"
    coords = res["geojson"]["features"][0]["geometry"]["coordinates"][0][0]
    assert 110.3 < coords[0] < 110.5 and -7.1 < coords[1] < -6.9
    assert res["layers"], res


# ---------------------------------------------------------------------------
# (b) autofix: merge a sliver and remove an overlap
# ---------------------------------------------------------------------------
def test_autofix_sliver_and_overlap():
    # Work in UTM 49S (EPSG:32749) around Semarang, then export in 4326
    x0, y0 = 437000.0, 9225000.0
    a = sq(x0, y0)                        # 20x20 = 400 m2
    b = sq(x0 + 20 + 0.0, y0)             # adjacent; shifted left by 2m to overlap A
    b = box(x0 + 18, y0, x0 + 38, y0 + 20)  # overlaps A by 2x20 = 40 m2
    sliver = box(x0, y0 + 20, x0 + 20, y0 + 20.2)  # 20 x 0.2 = 4 m2, thin, touching A on top
    gdf = gpd.GeoDataFrame({"NIB": ["A", "B", "S"]}, geometry=[a, b, sliver], crs=32749).to_crs(4326)
    fc = json.loads(gdf.to_json())

    r = client.post("/topology/autofix", json={
        "geojson": fc, "snap_tolerance_m": 0.01, "sliver_min_area_m2": 1.0,
        "sliver_thinness": 0.05, "id_field": "NIB",
    })
    assert r.status_code == 202
    job = wait_job(r.json()["job_id"])
    assert job["status"] == "done", job
    res = job["result"]
    rep = res["report"]
    assert rep["features_in"] == 3
    assert rep["features_out"] == 2
    assert rep["slivers_merged"] == 1
    assert rep["overlaps_fixed"] == 1
    assert 35 < rep["overlap_area_m2_total"] < 45
    assert rep["crs_used_epsg"] == 32749
    actions = {c["action"] for c in res["changes"]}
    assert {"sliver_merged", "overlap_fixed"} <= actions
    ids = {c["id"] for c in res["changes"] if c["action"] == "sliver_merged"}
    assert ids == {"S"}

    out = gpd.GeoDataFrame.from_features(res["geojson"]["features"], crs=4326).to_crs(32749)
    out_by = {p["NIB"]: g for p, g in zip(out.drop(columns="geometry").to_dict("records"), out.geometry)}
    assert "merged_sliver" in [p for p in out["_fix_notes"] if p][0] or any("merged_sliver" in n for n in out["_fix_notes"])
    # A kept the overlap and absorbed the sliver: 400 + 4 = 404 ; B lost 40: 360
    assert abs(out_by["A"].area - 404) < 1.0
    assert abs(out_by["B"].area - 360) < 1.0
    assert out_by["A"].intersection(out_by["B"]).area < 0.01


# ---------------------------------------------------------------------------
# (c) change detection 4 old / 4 new
# ---------------------------------------------------------------------------
def test_change_detection_counts():
    x0, y0 = 437000.0, 9225000.0
    old = gpd.GeoDataFrame(
        {"NIB": ["1", "2", "3", "4"], "pemilik": ["A", "B", "C", "D"]},
        geometry=[sq(x0, y0), sq(x0 + 30, y0), sq(x0 + 60, y0), sq(x0 + 90, y0)],
        crs=32749,
    ).to_crs(4326)
    new = gpd.GeoDataFrame(
        {"NIB": ["1", "2", "3", "5"], "pemilik": ["A", "B", "C", "E"]},
        geometry=[
            sq(x0, y0),                                   # unchanged
            box(x0 + 30, y0, x0 + 30 + 30, y0 + 20),      # geometry_changed (20x20 -> 30x20)
            sq(x0 + 60, y0),                              # unchanged
            sq(x0 + 200, y0),                             # added (NIB 5); NIB 4 removed
        ],
        crs=32749,
    ).to_crs(4326)
    # Make parcel 3 ALSO unchanged: expected 2 unchanged? Spec wants 1 unchanged, so change its attribute.
    new.loc[2, "pemilik"] = "C2"  # -> attribute_changed

    r = client.post("/change-detection", json={
        "old_geojson": json.loads(old.to_json()),
        "new_geojson": json.loads(new.to_json()),
        "id_field": "NIB",
    })
    assert r.status_code == 202
    job = wait_job(r.json()["job_id"])
    assert job["status"] == "done", job
    res = job["result"]
    s = res["summary"]
    assert s["added"] == 1
    assert s["removed"] == 1
    assert s["geometry_changed"] == 1
    assert s["unchanged"] == 1
    assert s["attribute_changed"] == 1
    assert s["old_count"] == 4 and s["new_count"] == 4
    assert abs(s["area_added_m2"] - 400) < 1
    assert abs(s["area_removed_m2"] - 400) < 1
    assert abs(s["area_net_delta_m2"] - 200) < 1  # +400 -400 +200 (parcel 2 grew)

    feats = res["geojson"]["features"]
    assert len(feats) == 5  # 4 new + 1 removed
    by_id = {f["properties"]["_id"]: f["properties"] for f in feats}
    assert by_id["2"]["_change"] == "geometry_changed"
    assert by_id["3"]["_change"] == "attribute_changed" and by_id["3"]["_changed_fields"] == ["pemilik"]
    assert by_id["4"]["_change"] == "removed"
    assert by_id["5"]["_change"] == "added"
    assert by_id["1"]["_iou"] >= 0.99
    diffs = [f["properties"]["_diff"] for f in res["diff_geojson"]["features"]]
    assert diffs == ["gain"]

    # geometric fallback without id_field: parcel 2 shrunk slightly still matches by IoU
    r = client.post("/change-detection", json={
        "old_geojson": json.loads(old.to_json()),
        "new_geojson": json.loads(new.to_json()),
    })
    job = wait_job(r.json()["job_id"])
    assert job["status"] == "done", job
    s2 = job["result"]["summary"]
    assert s2["added"] == 1 and s2["removed"] == 1 and s2["geometry_changed"] == 1


# ---------------------------------------------------------------------------
# (d) job polling flow + guards
# ---------------------------------------------------------------------------
def test_job_polling_flow_and_errors():
    r = client.get("/jobs/does-not-exist")
    assert r.status_code == 404

    # 413 on oversize content-length before body is read
    r = client.post("/crs/inspect-reproject", content=b"{}",
                    headers={"content-length": str(300 * 1024 * 1024), "content-type": "application/json"})
    assert r.status_code == 413

    # missing input -> 400
    r = client.post("/topology/autofix", json={"snap_tolerance_m": 1})
    assert r.status_code == 400

    # bad extension -> 400
    r = client.post("/crs/inspect-reproject", files={"file": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 400

    # job that errors (empty FeatureCollection) ends with status=error
    r = client.post("/crs/inspect-reproject", json={"geojson": {"type": "FeatureCollection", "features": []}})
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "queued" and body["poll_url"] == f"/jobs/{body['job_id']}"
    job = wait_job(body["job_id"])
    assert job["status"] == "error" and job["error"] and "result" not in job

    # happy path: statuses progress to done with result and 100%
    fc = json.loads(gpd.GeoDataFrame({"a": [1]}, geometry=[box(110.4, -7.0, 110.41, -6.99)], crs=4326).to_json())
    r = client.post("/crs/inspect-reproject", json={"geojson": fc, "target_epsg": 32749})
    job = wait_job(r.json()["job_id"])
    assert job["status"] == "done" and job["progress"] == 100 and "result" in job
    assert job["result"]["confidence"] == "declared"
    assert job["result"]["detected_crs"]["epsg"] == 4326
    x = job["result"]["geojson"]["features"][0]["geometry"]["coordinates"][0][0][0]
    assert 400000 < x < 500000  # UTM easting


def _wait_done(job_id, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/jobs/{job_id}")
        if r.status_code == 200 and r.json()["status"] in ("done", "error"):
            return r.json()
        time.sleep(0.1)
    raise AssertionError("job did not finish")


def test_done_job_is_released_after_first_fetch():
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": box(112.95, -7.94, 112.951, -7.939).__geo_interface__}]}
    r = client.post("/crs/inspect-reproject", json={"geojson": fc, "sample_only": True})
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    first = _wait_done(job_id)
    assert first["status"] == "done" and "result" in first
    # Memory is freed once the terminal state has been delivered.
    assert client.get(f"/jobs/{job_id}").status_code == 404


def test_cors_allowlist():
    ok = client.options("/jobs/x", headers={"Origin": "https://spasial-simple.vercel.app",
                                             "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "https://spasial-simple.vercel.app"
    preview = client.options("/jobs/x", headers={"Origin": "https://spasial-simple-git-feat-abc.vercel.app",
                                                  "Access-Control-Request-Method": "GET"})
    assert preview.headers.get("access-control-allow-origin") == "https://spasial-simple-git-feat-abc.vercel.app"
    bad = client.options("/jobs/x", headers={"Origin": "https://evil.example",
                                              "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers
