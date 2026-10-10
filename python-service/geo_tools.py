"""
Geo-processing helpers for SAKAGIS python-service.

Contains:
  - in-memory async job store (ThreadPoolExecutor, 2 workers)
  - streaming upload -> GeoDataFrame loader (gpkg / zip-shp / geojson / json / kml)
  - CRS inspection + guessing (Indonesian TM-3 and UTM zones)
  - topology auto-fix for land parcels (bidang tanah)
  - parcel change detection between two snapshots

User-facing strings (progress/warnings) are in Indonesian; comments in English.
"""
from __future__ import annotations

import json
import math
import os
import shutil
import tempfile
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import geopandas as gpd
import shapely
from shapely import STRtree
from shapely.geometry import (
    GeometryCollection,
    MultiPolygon,
    Polygon,
    shape,
)
from shapely.ops import transform as shp_transform, unary_union
from pyproj import CRS, Transformer

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB
JOB_TTL_SECONDS = 30 * 60
INDONESIA_BBOX = (94.0, -12.0, 142.0, 7.0)  # lon_min, lat_min, lon_max, lat_max
ALLOWED_EXTENSIONS = {".gpkg", ".zip", ".geojson", ".json", ".kml"}

# ---------------------------------------------------------------------------
# Job store
# ---------------------------------------------------------------------------
_executor = ThreadPoolExecutor(max_workers=2)
_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()


def _cleanup_old_jobs() -> None:
    now = time.time()
    with _jobs_lock:
        stale = [k for k, v in _jobs.items() if now - v.get("created_at", now) > JOB_TTL_SECONDS]
        for k in stale:
            _jobs.pop(k, None)


def create_job() -> str:
    _cleanup_old_jobs()
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Menunggu antrian...",
            "result": None,
            "error": None,
            "created_at": time.time(),
        }
    return job_id


def update_job(job_id: str, progress: Optional[int] = None, message: Optional[str] = None, **kw) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        if progress is not None:
            job["progress"] = int(max(0, min(100, progress)))
        if message is not None:
            job["message"] = message
        job.update(kw)


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def delete_job(job_id: str) -> None:
    with _jobs_lock:
        _jobs.pop(job_id, None)


def job_public_view(job: Dict[str, Any]) -> Dict[str, Any]:
    out = {"status": job["status"], "progress": job["progress"], "message": job["message"]}
    if job["status"] == "done":
        out["result"] = job["result"]
    elif job["status"] == "error":
        out["error"] = job["error"]
    return out


def submit_job(job_id: str, fn: Callable[..., Any], *args, cleanup_paths: Optional[List[str]] = None) -> None:
    """Run fn(job_id, *args) in the pool; store result/error; remove temp paths afterwards."""

    def _runner():
        update_job(job_id, status="running", progress=1, message="Memulai pemrosesan...")
        try:
            result = fn(job_id, *args)
            update_job(job_id, status="done", progress=100, message="Selesai", result=result)
        except Exception as e:  # noqa: BLE001
            update_job(job_id, status="error", progress=100, message="Gagal", error=str(e))
        finally:
            for p in cleanup_paths or []:
                try:
                    if os.path.isdir(p):
                        shutil.rmtree(p, ignore_errors=True)
                    elif os.path.exists(p):
                        os.unlink(p)
                except OSError:
                    pass

    _executor.submit(_runner)


# ---------------------------------------------------------------------------
# Upload handling / loading
# ---------------------------------------------------------------------------
def stream_upload_to_tmp(upload_file, tmpdir: str, field_name: str = "file") -> str:
    """Stream an UploadFile to disk with shutil.copyfileobj (bounded RAM). Returns path."""
    filename = os.path.basename(upload_file.filename or f"{field_name}.bin")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Format file '{ext or filename}' tidak didukung. Gunakan .gpkg, .zip (shapefile), .geojson, .json, atau .kml"
        )
    dest = os.path.join(tmpdir, f"{field_name}{ext}")
    with open(dest, "wb") as out:
        shutil.copyfileobj(upload_file.file, out, length=1024 * 1024)
    try:
        upload_file.file.close()
    except Exception:  # noqa: BLE001
        pass
    return dest


def _drop_z(geom):
    if geom is None:
        return None
    if geom.has_z:
        return shp_transform(lambda x, y, z=None: (x, y), geom)
    return geom


def _clean_gdf(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf[~gdf.geometry.isna()].copy()
    gdf = gdf[~gdf.geometry.is_empty].copy()
    if len(gdf) and gdf.geometry.has_z.any():
        gdf["geometry"] = gdf.geometry.apply(_drop_z)
    gdf = gdf.reset_index(drop=True)
    return gdf


def load_gdf(path: Optional[str] = None, geojson: Optional[dict] = None) -> Tuple[gpd.GeoDataFrame, List[str]]:
    """Load either a file path (gpkg/zip-shp/geojson/json/kml) or a GeoJSON dict.

    Returns (GeoDataFrame, layers). For multi-layer sources the first layer is used.
    """
    layers: List[str] = []
    if geojson is not None:
        if isinstance(geojson, str):
            geojson = json.loads(geojson)
        if geojson.get("type") == "Feature":
            geojson = {"type": "FeatureCollection", "features": [geojson]}
        feats = geojson.get("features", [])
        if not feats:
            raise ValueError("GeoJSON tidak memiliki fitur")
        gdf = gpd.GeoDataFrame.from_features(feats)
        crs = geojson.get("crs")
        epsg = None
        if isinstance(crs, dict):
            name = str(crs.get("properties", {}).get("name", ""))
            if "EPSG" in name.upper():
                try:
                    epsg = int(name.upper().split("EPSG")[-1].strip(":/ "))
                except ValueError:
                    epsg = None
        gdf = gdf.set_crs(epsg or 4326, allow_override=True)
        layers = ["geojson"]
        return _clean_gdf(gdf), layers

    if path is None:
        raise ValueError("Tidak ada data masukan (file atau geojson)")

    ext = os.path.splitext(path)[1].lower()
    read_path = path
    if ext == ".zip":
        extract_dir = os.path.join(os.path.dirname(path), "shp_extract")
        os.makedirs(extract_dir, exist_ok=True)
        with zipfile.ZipFile(path) as zf:
            for member in zf.infolist():
                # guard against zip-slip
                target = os.path.realpath(os.path.join(extract_dir, member.filename))
                if not target.startswith(os.path.realpath(extract_dir)):
                    continue
                zf.extract(member, extract_dir)
        shp_files = []
        for root, _, files in os.walk(extract_dir):
            shp_files += [os.path.join(root, f) for f in files if f.lower().endswith(".shp")]
        if not shp_files:
            # maybe the zip contains gpkg/geojson/kml instead
            others = []
            for root, _, files in os.walk(extract_dir):
                others += [os.path.join(root, f) for f in files if os.path.splitext(f)[1].lower() in ALLOWED_EXTENSIONS - {".zip"}]
            if not others:
                raise ValueError("ZIP tidak berisi shapefile (.shp) atau file spasial lain yang didukung")
            read_path = others[0]
        else:
            shp_files.sort()
            read_path = shp_files[0]
            layers = [os.path.splitext(os.path.basename(s))[0] for s in shp_files]
    if ext == ".kml":
        try:
            import fiona  # noqa: F401

            fiona.drvsupport.supported_drivers["KML"] = "rw"
            fiona.drvsupport.supported_drivers["LIBKML"] = "rw"
        except Exception:  # noqa: BLE001
            pass

    if not layers:
        try:
            import pyogrio

            layers = [str(l[0]) for l in pyogrio.list_layers(read_path)]
        except Exception:  # noqa: BLE001
            try:
                import fiona

                layers = list(fiona.listlayers(read_path))
            except Exception:  # noqa: BLE001
                layers = []

    if layers and ext in {".gpkg", ".kml"}:
        gdf = gpd.read_file(read_path, layer=layers[0])
    else:
        gdf = gpd.read_file(read_path)
    if gdf.empty:
        raise ValueError("Tidak ada fitur yang bisa dibaca dari file")
    return _clean_gdf(gdf), layers


def gdf_to_geojson(gdf: gpd.GeoDataFrame) -> dict:
    """Serialize to a GeoJSON FeatureCollection dict (handles numpy/datetime via to_json)."""
    return json.loads(gdf.to_json(drop_id=True))


# ---------------------------------------------------------------------------
# CRS helpers
# ---------------------------------------------------------------------------
def crs_info(crs: Optional[CRS]) -> Optional[dict]:
    if crs is None:
        return None
    crs = CRS.from_user_input(crs)
    epsg = crs.to_epsg()
    units = None
    try:
        units = crs.axis_info[0].unit_name if crs.axis_info else None
    except Exception:  # noqa: BLE001
        units = None
    try:
        proj4 = crs.to_proj4()
    except Exception:  # noqa: BLE001
        proj4 = None
    return {
        "epsg": epsg,
        "name": crs.name,
        "is_geographic": bool(crs.is_geographic),
        "units": units,
        "proj4": proj4,
    }


def _in_indonesia(lon: float, lat: float) -> bool:
    return INDONESIA_BBOX[0] <= lon <= INDONESIA_BBOX[2] and INDONESIA_BBOX[1] <= lat <= INDONESIA_BBOX[3]


# Coarse land boxes of the main Indonesian islands (lon_min, lat_min, lon_max, lat_max).
# Used only to rank CRS candidates: a centroid over land is more plausible than one over open sea.
INDONESIA_LAND_BOXES = [
    (95.0, -6.0, 106.5, 6.0),      # Sumatra
    (105.0, -8.8, 115.8, -5.8),    # Java + Madura + Bali
    (115.5, -10.5, 125.5, -8.0),   # Nusa Tenggara
    (108.5, -4.2, 119.5, 4.5),     # Kalimantan
    (118.5, -6.0, 125.5, 2.0),     # Sulawesi
    (125.0, -8.5, 135.0, 3.0),     # Maluku
    (130.5, -9.2, 141.5, -0.3),    # Papua
]


def _on_indonesia_land(lon: float, lat: float) -> bool:
    return any(b[0] <= lon <= b[2] and b[1] <= lat <= b[3] for b in INDONESIA_LAND_BOXES)


def _tm3_zone_label(epsg: int) -> str:
    # EPSG 23830 = zone 46.2, 23831 = 47.1, 23832 = 47.2 ... 23845 = 54.1
    idx = epsg - 23830  # 0..15
    zone = 46 + (idx + 1) // 2
    half = 2 if (idx % 2 == 0) else 1
    return f"{zone}.{half}"


def guess_crs_from_bounds(
    bounds: Tuple[float, float, float, float],
    hint_lon: Optional[float] = None,
    hint_lat: Optional[float] = None,
) -> Tuple[Optional[int], str, List[dict]]:
    """Guess an EPSG code from raw coordinate bounds.

    Returns (epsg or None, reason, candidates). `candidates` lists every zone whose inverse-transformed
    centroid falls inside Indonesia, ranked (best first), so the UI can offer alternatives.

    TM-3 zones all share the same false easting/northing, so a parcel's coordinates look identical in every
    zone; without an approximate location (hint_lon/hint_lat) the zone choice is inherently ambiguous.
    """
    has_hint = hint_lon is not None and hint_lat is not None
    minx, miny, maxx, maxy = bounds
    cx, cy = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    if abs(minx) <= 180 and abs(maxx) <= 180 and abs(miny) <= 90 and abs(maxy) <= 90:
        return 4326, "Koordinat berada dalam rentang derajat (|x|<=180, |y|<=90), diasumsikan WGS 84 (EPSG:4326)", [
            {"epsg": 4326, "kind": "GEOGRAPHIC", "lon": cx, "lat": cy, "on_land": _on_indonesia_land(cx, cy)}
        ]

    candidates: List[Tuple[str, int]] = []
    candidates += [("TM3", e) for e in range(23830, 23846)]
    candidates += [("UTM-S", e) for e in range(32746, 32755)]
    candidates += [("UTM-N", e) for e in range(32646, 32655)]

    matches: List[dict] = []
    for kind, epsg in candidates:
        try:
            tr = Transformer.from_crs(CRS.from_epsg(epsg), CRS.from_epsg(4326), always_xy=True)
            lon, lat = tr.transform(cx, cy)
        except Exception:  # noqa: BLE001
            continue
        if not (math.isfinite(lon) and math.isfinite(lat)):
            continue
        if _in_indonesia(lon, lat):
            matches.append({
                "epsg": epsg, "kind": kind, "lon": round(lon, 5), "lat": round(lat, 5),
                "on_land": _on_indonesia_land(lon, lat),
                "zone": _tm3_zone_label(epsg) if kind == "TM3" else f"{epsg % 100}{'S' if kind == 'UTM-S' else 'N'}",
            })

    if not matches:
        return None, "Tidak ada zona TM-3 atau UTM Indonesia yang cocok dengan koordinat; CRS tidak dapat ditebak", []

    tm3_in_range = 0 <= cx <= 400000 and any(m["kind"] == "TM3" for m in matches)

    def rank(m: dict):
        # prefer: TM-3 when x is in TM-3 easting range; closest to the user hint (if any);
        # centroid over land; lower zone number (deterministic)
        dist = math.hypot(m["lon"] - hint_lon, m["lat"] - hint_lat) if has_hint else 0.0
        return (
            0 if (m["kind"] == "TM3") == tm3_in_range else 1,
            round(dist, 3),
            0 if m["on_land"] else 1,
            m["epsg"],
        )

    matches.sort(key=rank)
    best = matches[0]
    ambiguous = [m for m in matches if m["kind"] == best["kind"] and m["on_land"] == best["on_land"]]
    label = f"TM-3 zona {best['zone']}" if best["kind"] == "TM3" else f"UTM zona {best['zone']}"
    reason = (
        f"Titik tengah data jatuh di {'daratan' if best['on_land'] else 'wilayah'} Indonesia "
        f"(lon {best['lon']:.3f}, lat {best['lat']:.3f}) untuk {label} (EPSG:{best['epsg']})"
    )
    if tm3_in_range and best["kind"] == "TM3":
        reason = "Koordinat x dalam rentang TM-3 (0..400000); " + reason
    if has_hint:
        reason += f"; dipilih zona terdekat dengan lokasi petunjuk (lon {hint_lon:.3f}, lat {hint_lat:.3f})"
    elif len(ambiguous) > 1:
        alt = ", ".join(f"EPSG:{m['epsg']}" for m in ambiguous[1:6])
        reason += f". Zona lain yang juga mungkin: {alt} — verifikasi dengan lokasi sebenarnya"
    return best["epsg"], reason, matches


def _coords_plausible_for_crs(gdf: gpd.GeoDataFrame) -> bool:
    """Check whether the raw coordinates plausibly match the declared CRS."""
    crs = gdf.crs
    minx, miny, maxx, maxy = gdf.total_bounds
    if crs.is_geographic:
        return abs(minx) <= 180 and abs(maxx) <= 180 and abs(miny) <= 90 and abs(maxy) <= 90
    # projected: coordinates in degrees range are suspicious
    if abs(minx) <= 180 and abs(maxx) <= 180 and abs(miny) <= 90 and abs(maxy) <= 90:
        return False
    try:
        tr = Transformer.from_crs(crs, CRS.from_epsg(4326), always_xy=True)
        lon, lat = tr.transform((minx + maxx) / 2, (miny + maxy) / 2)
        return math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90
    except Exception:  # noqa: BLE001
        return False


def utm_epsg_for_lonlat(lon: float, lat: float) -> int:
    zone = int((lon + 180) // 6) + 1
    zone = max(1, min(60, zone))
    return (32600 if lat >= 0 else 32700) + zone


def to_metric(gdf: gpd.GeoDataFrame) -> Tuple[gpd.GeoDataFrame, int]:
    """Reproject to a local UTM zone based on the data centroid. Returns (gdf_metric, epsg)."""
    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    wgs = gdf.to_crs(4326) if not gdf.crs.equals(CRS.from_epsg(4326)) else gdf
    minx, miny, maxx, maxy = wgs.total_bounds
    epsg = utm_epsg_for_lonlat((minx + maxx) / 2, (miny + maxy) / 2)
    return wgs.to_crs(epsg), epsg


# ---------------------------------------------------------------------------
# Task 1: CRS inspect / reproject
# ---------------------------------------------------------------------------
def run_crs_inspect(job_id: str, path: Optional[str], geojson: Optional[dict], params: dict) -> dict:
    target_epsg = int(params.get("target_epsg") or 4326)
    source_epsg = params.get("source_epsg")
    source_epsg = int(source_epsg) if source_epsg not in (None, "", 0, "0") else None
    sample_only = bool(params.get("sample_only", False))
    hint_lon = params.get("hint_lon")
    hint_lat = params.get("hint_lat")
    hint_lon = float(hint_lon) if hint_lon not in (None, "") else None
    hint_lat = float(hint_lat) if hint_lat not in (None, "") else None

    update_job(job_id, 5, "Membaca data spasial...")
    gdf, layers = load_gdf(path=path, geojson=geojson)
    warnings: List[str] = []

    update_job(job_id, 30, "Memeriksa sistem koordinat (CRS)...")
    raw_bounds = [float(v) for v in gdf.total_bounds]
    confidence = "unknown"
    guess_reason = ""
    crs_candidates: List[dict] = []

    if source_epsg:
        gdf = gdf.set_crs(source_epsg, allow_override=True)
        confidence = "declared"
        guess_reason = f"CRS sumber ditetapkan manual oleh pengguna: EPSG:{source_epsg}"
    elif gdf.crs is not None:
        confidence = "declared"
        guess_reason = "CRS dibaca dari metadata file (.prj / gpkg_spatial_ref_sys / GeoJSON)"
        if not _coords_plausible_for_crs(gdf):
            declared = gdf.crs.to_epsg()
            g_epsg, reason, cands = guess_crs_from_bounds(tuple(raw_bounds), hint_lon, hint_lat)
            crs_candidates = cands
            if g_epsg and g_epsg != declared:
                warnings.append(
                    f"Koordinat tidak sesuai dengan CRS yang dideklarasikan (EPSG:{declared}); "
                    f"CRS diganti menjadi tebakan EPSG:{g_epsg}"
                )
                gdf = gdf.set_crs(g_epsg, allow_override=True)
                confidence = "guessed"
                guess_reason = reason
            else:
                warnings.append(
                    f"Koordinat tampak tidak sesuai dengan CRS yang dideklarasikan (EPSG:{declared}) dan tidak dapat ditebak"
                )
    else:
        g_epsg, reason, crs_candidates = guess_crs_from_bounds(tuple(raw_bounds), hint_lon, hint_lat)
        guess_reason = reason
        if g_epsg:
            gdf = gdf.set_crs(g_epsg, allow_override=True)
            confidence = "guessed"
            warnings.append(f"File tidak memiliki informasi CRS; ditebak EPSG:{g_epsg}. Periksa kembali hasilnya.")
        else:
            confidence = "unknown"
            warnings.append("File tidak memiliki informasi CRS dan tidak dapat ditebak; tentukan source_epsg secara manual")

    detected = crs_info(gdf.crs) if gdf.crs is not None else None

    update_job(job_id, 50, "Memvalidasi geometri...")
    geom_types = sorted({str(t) for t in gdf.geom_type.dropna().unique()})
    invalid_count = int((~gdf.geometry.is_valid).sum())
    if invalid_count > 0:
        warnings.append(f"Terdapat {invalid_count} geometri tidak valid (self-intersection, dll.)")

    bounds_wgs84 = None
    if gdf.crs is not None:
        try:
            bounds_wgs84 = [float(v) for v in gdf.to_crs(4326).total_bounds]
            if not _in_indonesia((bounds_wgs84[0] + bounds_wgs84[2]) / 2, (bounds_wgs84[1] + bounds_wgs84[3]) / 2):
                warnings.append("Titik tengah data berada di luar wilayah Indonesia; periksa CRS sumber")
        except Exception as e:  # noqa: BLE001
            warnings.append(f"Gagal menghitung bounds WGS84: {e}")

    result: Dict[str, Any] = {
        "detected_crs": detected,
        "confidence": confidence,
        "guess_reason": guess_reason,
        "bounds_source": raw_bounds,
        "bounds_wgs84": bounds_wgs84,
        "feature_count": int(len(gdf)),
        "geometry_types": geom_types,
        "layers": layers,
        "warnings": warnings,
        "crs_candidates": crs_candidates,
        "target_epsg": target_epsg,
    }

    if not sample_only:
        if gdf.crs is None:
            raise ValueError("CRS sumber tidak diketahui; tidak dapat melakukan reproyeksi. Tentukan source_epsg.")
        update_job(job_id, 70, f"Mereproyeksi ke EPSG:{target_epsg}...")
        out = gdf.to_crs(target_epsg)
        update_job(job_id, 90, "Menyusun GeoJSON...")
        result["geojson"] = gdf_to_geojson(out)
    return result


# ---------------------------------------------------------------------------
# Task 2: Topology autofix
# ---------------------------------------------------------------------------
def _polygonal_only(geom):
    """Keep only polygonal parts of a geometry; return None when nothing remains."""
    if geom is None or geom.is_empty:
        return None
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    if isinstance(geom, GeometryCollection):
        polys = []
        for g in geom.geoms:
            if isinstance(g, Polygon):
                polys.append(g)
            elif isinstance(g, MultiPolygon):
                polys.extend(list(g.geoms))
        if not polys:
            return None
        return polys[0] if len(polys) == 1 else MultiPolygon(polys)
    return None


def _thinness(geom) -> float:
    if geom is None or geom.is_empty or geom.length == 0:
        return 0.0
    return 4.0 * math.pi * geom.area / (geom.length ** 2)


def _shared_boundary_length(a, b) -> float:
    try:
        inter = a.boundary.intersection(b.boundary)
        return float(inter.length)
    except Exception:  # noqa: BLE001
        return 0.0


def run_topology_autofix(job_id: str, path: Optional[str], geojson: Optional[dict], params: dict) -> dict:
    snap_tol = float(params.get("snap_tolerance_m", 0.5) or 0.0)
    sliver_min_area = float(params.get("sliver_min_area_m2", 1.0) or 0.0)
    sliver_thin = float(params.get("sliver_thinness", 0.05) or 0.0)
    fix_overlaps = bool(params.get("fix_overlaps", True))
    fix_gaps = bool(params.get("fix_gaps", True))
    fix_invalid = bool(params.get("fix_invalid", True))
    id_field = params.get("id_field") or None

    update_job(job_id, 5, "Membaca data bidang tanah...")
    gdf, layers = load_gdf(path=path, geojson=geojson)
    if gdf.crs is None:
        g_epsg, _, _ = guess_crs_from_bounds(tuple(gdf.total_bounds))
        gdf = gdf.set_crs(g_epsg or 4326)
    gdf = gdf[gdf.geom_type.isin(["Polygon", "MultiPolygon"])].reset_index(drop=True)
    features_in = int(len(gdf))
    if features_in == 0:
        raise ValueError("Tidak ada geometri poligon dalam data")

    update_job(job_id, 12, "Mereproyeksi ke CRS metrik lokal (UTM)...")
    m, crs_epsg = to_metric(gdf)
    geoms: List[Any] = list(m.geometry.values)
    props = m.drop(columns=[m.geometry.name]).to_dict("records")
    notes: List[List[str]] = [[] for _ in range(len(geoms))]
    changes: List[dict] = []
    report = {
        "invalid_fixed": 0,
        "vertices_snapped": 0,
        "slivers_removed": 0,
        "slivers_merged": 0,
        "overlaps_fixed": 0,
        "overlap_area_m2_total": 0.0,
        "gaps_filled": 0,
        "gap_area_m2_total": 0.0,
        "features_in": features_in,
        "features_out": 0,
        "crs_used_epsg": crs_epsg,
    }

    def fid(i: int):
        if id_field and id_field in props[i]:
            v = props[i][id_field]
            return None if v is None else str(v)
        return None

    def add_change(i: int, action: str, detail: str, delta: float) -> None:
        if len(changes) < 2000:
            changes.append(
                {
                    "feature_index": int(i),
                    "id": fid(i),
                    "action": action,
                    "detail": detail,
                    "area_delta_m2": round(float(delta), 3),
                }
            )

    alive = [True] * len(geoms)

    # (a) make_valid
    if fix_invalid:
        update_job(job_id, 20, "Memperbaiki geometri tidak valid...")
        for i, g in enumerate(geoms):
            if g is None or g.is_valid:
                continue
            before = g.area
            fixed = _polygonal_only(shapely.make_valid(g))
            if fixed is None:
                alive[i] = False
                add_change(i, "invalid_removed", "Geometri tidak valid dan tidak dapat diperbaiki; dihapus", -before)
                continue
            geoms[i] = fixed
            report["invalid_fixed"] += 1
            notes[i].append("make_valid")
            add_change(i, "invalid_fixed", "Geometri diperbaiki dengan make_valid", fixed.area - before)

    # (b) snap vertices (precision grid; neighbours become coincident at the same grid)
    if snap_tol > 0:
        update_job(job_id, 35, f"Menyelaraskan simpul (snap {snap_tol} m)...")
        for i, g in enumerate(geoms):
            if not alive[i] or g is None:
                continue
            snapped = shapely.set_precision(g, snap_tol, mode="pointwise")
            snapped = _polygonal_only(shapely.make_valid(snapped)) if not snapped.is_valid else snapped
            snapped = _polygonal_only(snapped)
            if snapped is None or snapped.is_empty:
                continue
            if not snapped.equals_exact(g, 1e-9):
                report["vertices_snapped"] += 1
                notes[i].append("snapped")
                add_change(i, "snapped", f"Simpul diselaraskan ke grid {snap_tol} m", snapped.area - g.area)
            geoms[i] = snapped

    def live_tree() -> Tuple[STRtree, List[int]]:
        idxs = [i for i in range(len(geoms)) if alive[i] and geoms[i] is not None]
        return STRtree([geoms[i] for i in idxs]), idxs

    # (c) slivers
    if sliver_min_area > 0 or sliver_thin > 0:
        update_job(job_id, 50, "Mendeteksi dan menggabungkan sliver...")
        tree, idxs = live_tree()
        sliver_ids = [
            i for i in idxs
            if (geoms[i].area < sliver_min_area) or (_thinness(geoms[i]) < sliver_thin)
        ]
        for i in sliver_ids:
            if not alive[i]:
                continue
            g = geoms[i]
            cand = [idxs[j] for j in tree.query(g, predicate="intersects")]
            cand = [c for c in cand if c != i and alive[c] and c not in sliver_ids]
            if not cand:
                cand = [idxs[j] for j in tree.query(g, predicate="intersects")]
                cand = [c for c in cand if c != i and alive[c]]
            best, best_len = None, -1.0
            for c in cand:
                L = _shared_boundary_length(g, geoms[c])
                if L > best_len:
                    best_len, best = L, c
            if best is not None and best_len > 0:
                merged = _polygonal_only(unary_union([geoms[best], g]))
                if merged is not None:
                    geoms[best] = merged
                    alive[i] = False
                    report["slivers_merged"] += 1
                    notes[best].append(f"merged_sliver:{i}")
                    add_change(i, "sliver_merged", f"Sliver digabungkan ke fitur indeks {best}", -g.area)
                    add_change(best, "sliver_absorbed", f"Menerima sliver dari indeks {i}", g.area)
                    continue
            alive[i] = False
            report["slivers_removed"] += 1
            add_change(i, "sliver_removed", "Sliver tanpa tetangga; dihapus", -g.area)

    # (d) overlaps
    if fix_overlaps:
        update_job(job_id, 65, "Menghilangkan tumpang tindih (overlap)...")
        tree, idxs = live_tree()
        pairs = tree.query(tree.geometries, predicate="intersects")  # shape (2, n)
        seen = set()
        for a_loc, b_loc in zip(pairs[0], pairs[1]):
            a, b = idxs[a_loc], idxs[b_loc]
            if a >= b:
                continue
            key = (a, b)
            if key in seen:
                continue
            seen.add(key)
            if not (alive[a] and alive[b]):
                continue
            ga, gb = geoms[a], geoms[b]
            inter = ga.intersection(gb)
            inter = _polygonal_only(inter)
            if inter is None or inter.area <= 1e-6:
                continue
            # the LATER index loses the overlap; earlier keeps it
            loser, keeper = b, a
            new_loser = _polygonal_only(geoms[loser].difference(inter))
            area_ov = float(inter.area)
            if new_loser is None or new_loser.is_empty:
                alive[loser] = False
                add_change(loser, "overlap_removed_feature", f"Fitur sepenuhnya tertutup oleh indeks {keeper}; dihapus", -geoms[loser].area)
            else:
                geoms[loser] = new_loser
                notes[loser].append(f"overlap_cut_by:{keeper}")
                add_change(loser, "overlap_fixed", f"Overlap {area_ov:.2f} m² dengan indeks {keeper} dipotong", -area_ov)
            report["overlaps_fixed"] += 1
            report["overlap_area_m2_total"] += area_ov

    # (e) gaps
    if fix_gaps:
        update_job(job_id, 80, "Menutup celah (gap) antar bidang...")
        tree, idxs = live_tree()
        union = unary_union([geoms[i] for i in idxs])
        max_gap_area = max(sliver_min_area * 50.0, 50.0)
        polys = [union] if isinstance(union, Polygon) else list(getattr(union, "geoms", []))
        for poly in polys:
            if not isinstance(poly, Polygon):
                continue
            for ring in poly.interiors:
                hole = Polygon(ring)
                if hole.area <= 0 or hole.area > max_gap_area:
                    continue
                cand = [idxs[j] for j in tree.query(hole, predicate="intersects")]
                best, best_len = None, -1.0
                for c in cand:
                    if not alive[c]:
                        continue
                    L = _shared_boundary_length(hole, geoms[c])
                    if L > best_len:
                        best_len, best = L, c
                if best is None:
                    continue
                merged = _polygonal_only(unary_union([geoms[best], hole]))
                if merged is None:
                    continue
                geoms[best] = merged
                report["gaps_filled"] += 1
                report["gap_area_m2_total"] += float(hole.area)
                notes[best].append("gap_filled")
                add_change(best, "gap_filled", f"Celah {hole.area:.2f} m² ditutup", hole.area)

    update_job(job_id, 92, "Mereproyeksi kembali ke WGS 84 dan menyusun hasil...")
    keep = [i for i in range(len(geoms)) if alive[i] and geoms[i] is not None and not geoms[i].is_empty]
    out_props = []
    for i in keep:
        p = dict(props[i])
        p["_fix_notes"] = ";".join(notes[i])
        out_props.append(p)
    out = gpd.GeoDataFrame(out_props, geometry=[geoms[i] for i in keep], crs=f"EPSG:{crs_epsg}")
    out = out.to_crs(4326)
    report["features_out"] = int(len(out))
    report["overlap_area_m2_total"] = round(report["overlap_area_m2_total"], 3)
    report["gap_area_m2_total"] = round(report["gap_area_m2_total"], 3)
    return {"geojson": gdf_to_geojson(out), "report": report, "changes": changes, "layers": layers}


# ---------------------------------------------------------------------------
# Task 3: Change detection
# ---------------------------------------------------------------------------
def _norm_id(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if v.is_integer():
            v = int(v)
    s = str(v).strip()
    return s or None


def _iou(a, b) -> float:
    try:
        inter = a.intersection(b).area
        if inter <= 0:
            return 0.0
        uni = a.union(b).area
        return float(inter / uni) if uni > 0 else 0.0
    except Exception:  # noqa: BLE001
        return 0.0


def _json_safe(v):
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return None if np.isnan(v) else float(v)
    if isinstance(v, float) and math.isnan(v):
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def _attrs_equal(a: dict, b: dict, skip: set) -> List[str]:
    """Return list of differing field names (ignoring skip set)."""
    diffs = []
    keys = set(a.keys()) | set(b.keys())
    for k in sorted(keys):
        if k in skip or k.startswith("_"):
            continue
        va, vb = _json_safe(a.get(k)), _json_safe(b.get(k))
        if isinstance(va, float) and isinstance(vb, float):
            if not math.isclose(va, vb, rel_tol=1e-9, abs_tol=1e-9):
                diffs.append(k)
        elif str(va) != str(vb):
            diffs.append(k)
    return diffs


def run_change_detection(
    job_id: str,
    old_path: Optional[str],
    old_geojson: Optional[dict],
    new_path: Optional[str],
    new_geojson: Optional[dict],
    params: dict,
) -> dict:
    id_field = params.get("id_field") or None
    iou_threshold = float(params.get("iou_threshold", 0.9))
    min_match_iou = float(params.get("min_match_iou", 0.3))
    compare_attributes = bool(params.get("compare_attributes", True))

    update_job(job_id, 5, "Membaca data lama...")
    old, _ = load_gdf(path=old_path, geojson=old_geojson)
    update_job(job_id, 15, "Membaca data baru...")
    new, _ = load_gdf(path=new_path, geojson=new_geojson)
    for name, g in (("lama", old), ("baru", new)):
        if g.crs is None:
            e, _, _ = guess_crs_from_bounds(tuple(g.total_bounds))
            g.set_crs(e or 4326, inplace=True)

    update_job(job_id, 25, "Mereproyeksi ke CRS metrik lokal...")
    # Use the combined extent to pick a single UTM zone for both datasets
    old_w = old.to_crs(4326)
    new_w = new.to_crs(4326)
    b1, b2 = old_w.total_bounds, new_w.total_bounds
    cx = (min(b1[0], b2[0]) + max(b1[2], b2[2])) / 2
    cy = (min(b1[1], b2[1]) + max(b1[3], b2[3])) / 2
    epsg = utm_epsg_for_lonlat(cx, cy)
    old_m = old_w.to_crs(epsg)
    new_m = new_w.to_crs(epsg)

    og = list(old_m.geometry.values)
    ng = list(new_m.geometry.values)
    oprops = old_m.drop(columns=[old_m.geometry.name]).to_dict("records")
    nprops = new_m.drop(columns=[new_m.geometry.name]).to_dict("records")

    old_ids = [_norm_id(p.get(id_field)) if id_field else None for p in oprops]
    new_ids = [_norm_id(p.get(id_field)) if id_field else None for p in nprops]
    use_ids = bool(id_field) and (id_field in old_m.columns) and (id_field in new_m.columns)

    match_new_to_old: Dict[int, int] = {}
    matched_old: set = set()
    match_kind: Dict[int, str] = {}

    # 1) id matching
    if use_ids:
        update_job(job_id, 35, "Mencocokkan fitur berdasarkan ID...")
        old_by_id: Dict[str, int] = {}
        for i, oid in enumerate(old_ids):
            if oid is not None and oid not in old_by_id:
                old_by_id[oid] = i
        for j, nid in enumerate(new_ids):
            if nid is not None and nid in old_by_id and old_by_id[nid] not in matched_old:
                i = old_by_id[nid]
                match_new_to_old[j] = i
                matched_old.add(i)
                match_kind[j] = "id"

    # 2) geometric fallback (greedy one-to-one by IoU)
    update_job(job_id, 45, "Mencocokkan fitur berdasarkan geometri (IoU)...")
    tree = STRtree(og)
    unmatched_new = [j for j in range(len(ng)) if j not in match_new_to_old]
    cand_pairs: List[Tuple[float, int, int]] = []
    for j in unmatched_new:
        for i in tree.query(ng[j], predicate="intersects"):
            i = int(i)
            if i in matched_old:
                continue
            iou = _iou(ng[j], og[i])
            if iou >= min_match_iou:
                cand_pairs.append((iou, j, i))
    cand_pairs.sort(reverse=True)
    for iou, j, i in cand_pairs:
        if j in match_new_to_old or i in matched_old:
            continue
        match_new_to_old[j] = i
        matched_old.add(i)
        match_kind[j] = "geom"

    # best-effort split / merged detection among unmatched leftovers
    update_job(job_id, 60, "Mendeteksi pemecahan/penggabungan bidang...")
    split_old: Dict[int, List[int]] = {}
    merged_new: Dict[int, List[int]] = {}
    leftover_new = [j for j in range(len(ng)) if j not in match_new_to_old]
    leftover_old = [i for i in range(len(og)) if i not in matched_old]
    if leftover_new and leftover_old:
        lo_tree = STRtree([og[i] for i in leftover_old])
        # split: one old covered by 2+ new (new parts mostly inside old)
        cover_map: Dict[int, List[int]] = {}
        for j in leftover_new:
            for loc in lo_tree.query(ng[j], predicate="intersects"):
                i = leftover_old[int(loc)]
                inter = ng[j].intersection(og[i]).area
                if ng[j].area > 0 and inter / ng[j].area >= 0.8:
                    cover_map.setdefault(i, []).append(j)
        for i, js in cover_map.items():
            if len(js) >= 2:
                split_old[i] = js
        # merged: one new covering 2+ old
        ln_tree = STRtree([ng[j] for j in leftover_new])
        cover_map2: Dict[int, List[int]] = {}
        for i in leftover_old:
            for loc in ln_tree.query(og[i], predicate="intersects"):
                j = leftover_new[int(loc)]
                inter = ng[j].intersection(og[i]).area
                if og[i].area > 0 and inter / og[i].area >= 0.8:
                    cover_map2.setdefault(j, []).append(i)
        for j, iss in cover_map2.items():
            if len(iss) >= 2:
                merged_new[j] = iss

    update_job(job_id, 75, "Mengklasifikasikan perubahan...")
    summary = {
        "added": 0, "removed": 0, "unchanged": 0, "geometry_changed": 0,
        "attribute_changed": 0, "both_changed": 0, "split": 0, "merged": 0,
        "area_added_m2": 0.0, "area_removed_m2": 0.0, "area_net_delta_m2": 0.0,
        "old_count": int(len(og)), "new_count": int(len(ng)),
    }
    skip_fields = {id_field} if id_field else set()
    out_geoms: List[Any] = []
    out_props: List[dict] = []
    diff_geoms: List[Any] = []
    diff_props: List[dict] = []

    def add_out(geom, base_props: dict, extra: dict):
        p = {k: _json_safe(v) for k, v in base_props.items()}
        p.update(extra)
        out_geoms.append(geom)
        out_props.append(p)

    split_new_ids = {j for js in split_old.values() for j in js}
    merged_old_ids = {i for iss in merged_new.values() for i in iss}

    for j in range(len(ng)):
        area_new = float(ng[j].area)
        nid = new_ids[j] if use_ids else None
        if j in match_new_to_old:
            i = match_new_to_old[j]
            area_old = float(og[i].area)
            iou = _iou(ng[j], og[i])
            geom_same = iou >= iou_threshold
            changed_fields = _attrs_equal(oprops[i], nprops[j], skip_fields) if compare_attributes else []
            if geom_same and not changed_fields:
                cls = "unchanged"
            elif geom_same and changed_fields:
                cls = "attribute_changed"
            elif not geom_same and not changed_fields:
                cls = "geometry_changed"
            else:
                cls = "both_changed"
            summary[cls] += 1
            summary["area_net_delta_m2"] += area_new - area_old
            add_out(ng[j], nprops[j], {
                "_change": cls, "_id": nid if nid is not None else (old_ids[i] if use_ids else None),
                "_iou": round(iou, 4), "_area_old_m2": round(area_old, 3),
                "_area_new_m2": round(area_new, 3), "_area_delta_m2": round(area_new - area_old, 3),
                "_changed_fields": changed_fields, "_matched_index": int(i), "_match_kind": match_kind.get(j),
            })
            if not geom_same:
                gain = _polygonal_only(ng[j].difference(og[i]))
                loss = _polygonal_only(og[i].difference(ng[j]))
                if gain is not None and gain.area > 1e-6:
                    diff_geoms.append(gain)
                    diff_props.append({"_diff": "gain", "_id": nid, "_new_index": j, "_old_index": int(i), "_area_m2": round(gain.area, 3)})
                if loss is not None and loss.area > 1e-6:
                    diff_geoms.append(loss)
                    diff_props.append({"_diff": "loss", "_id": nid, "_new_index": j, "_old_index": int(i), "_area_m2": round(loss.area, 3)})
        else:
            if j in merged_new:
                cls = "merged"
                matched_idx = merged_new[j]
            elif j in split_new_ids:
                cls = "split"
                matched_idx = [i for i, js in split_old.items() if j in js]
            else:
                cls = "added"
                matched_idx = None
            summary[cls] += 1
            summary["area_added_m2"] += area_new
            summary["area_net_delta_m2"] += area_new
            add_out(ng[j], nprops[j], {
                "_change": cls, "_id": nid, "_iou": None, "_area_old_m2": None,
                "_area_new_m2": round(area_new, 3), "_area_delta_m2": round(area_new, 3),
                "_changed_fields": [], "_matched_index": matched_idx, "_match_kind": None,
            })

    for i in range(len(og)):
        if i in matched_old:
            continue
        area_old = float(og[i].area)
        oid = old_ids[i] if use_ids else None
        if i in split_old or i in merged_old_ids:
            # old counterpart of split/merged; output as removed geometry but tag relation
            cls = "removed"
            rel = "split_source" if i in split_old else "merged_source"
            matched_idx = split_old.get(i) or [j for j, iss in merged_new.items() if i in iss]
        else:
            cls = "removed"
            rel = None
            matched_idx = None
        summary["removed"] += 1
        summary["area_removed_m2"] += area_old
        summary["area_net_delta_m2"] -= area_old
        add_out(og[i], oprops[i], {
            "_change": cls, "_id": oid, "_iou": None, "_area_old_m2": round(area_old, 3),
            "_area_new_m2": None, "_area_delta_m2": round(-area_old, 3), "_changed_fields": [],
            "_matched_index": matched_idx, "_match_kind": rel,
        })

    for k in ("area_added_m2", "area_removed_m2", "area_net_delta_m2"):
        summary[k] = round(summary[k], 3)

    update_job(job_id, 90, "Menyusun GeoJSON hasil...")
    out = gpd.GeoDataFrame(out_props, geometry=out_geoms, crs=f"EPSG:{epsg}").to_crs(4326) if out_geoms else gpd.GeoDataFrame({"geometry": []}, geometry="geometry", crs=4326)
    diff = gpd.GeoDataFrame(diff_props, geometry=diff_geoms, crs=f"EPSG:{epsg}").to_crs(4326) if diff_geoms else None
    return {
        "geojson": gdf_to_geojson(out),
        "summary": summary,
        "diff_geojson": gdf_to_geojson(diff) if diff is not None else {"type": "FeatureCollection", "features": []},
        "crs_used_epsg": epsg,
    }
