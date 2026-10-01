"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type Map as SceneMap, type StyleSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { ArrowLeft, Box, Compass, Layers3, Loader2, Mountain, RotateCcw, Satellite, Sun, Moon } from "lucide-react";
import { useMapContext } from "@/lib/MapContext";
import type { SceneDestination } from "./StudioOverview";

const DESTINATIONS = {
  bromo: { name: "Bromo", center: [112.953, -7.9425] as [number, number], zoom: 12.4, bearing: -25 },
  rinjani: { name: "Rinjani", center: [116.414, -8.411] as [number, number], zoom: 11.8, bearing: 30 },
  toba: { name: "Danau Toba", center: [98.82, 2.61] as [number, number], zoom: 10, bearing: -20 },
};

const SCENE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
    terrain: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], tileSize: 256, encoding: "terrarium", maxzoom: 15, attribution: 'Elevation © <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen / AWS Open Data</a>' },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#101f26" } },
    { id: "satellite", type: "raster", source: "satellite", paint: { "raster-saturation": -0.15, "raster-contrast": 0.08 } },
  ],
  terrain: { source: "terrain", exaggeration: 1.3 },
  sky: { "sky-color": "#a4c7cf", "horizon-color": "#e3ebd7", "fog-color": "#b8cdca", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.65 },
};

export default function SceneExplorer({ destination, onClose }: { destination: SceneDestination; onClose: () => void }) {
  const { mapViewState, mapInstance, layers, layerGeojsonCache } = useMapContext();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<SceneMap | null>(null);
  const initialView = useRef(mapViewState);
  const initialDestination = useRef(destination);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [tileWarning, setTileWarning] = useState(false);
  const [activeDestination, setActiveDestination] = useState<SceneDestination>(destination);
  const [pitch, setPitch] = useState(60);
  const [exaggeration, setExaggeration] = useState(1.3);
  const [showLayers, setShowLayers] = useState(true);
  const [night, setNight] = useState(false);
  const [camera, setCamera] = useState({ lat: mapViewState.center[0], lng: mapViewState.center[1], zoom: mapViewState.zoom });

  const data = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: layers.filter(layer => layer.visible !== false).flatMap(layer => {
      const source = (layer.id && layerGeojsonCache[layer.id]) || layer.data;
      const features = source?.type === "FeatureCollection" ? source.features : source?.type === "Feature" ? [source] : [];
      return (features as FeatureCollection["features"]).filter(feature => feature.geometry).map(feature => ({
        ...feature,
        properties: { ...feature.properties, _sceneColor: layer.style?.fillColor || layer.style?.color || "#8fc7b7" },
      }));
    }),
  }), [layers, layerGeojsonCache]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: SceneMap;
    const preset = initialDestination.current === "current" ? null : DESTINATIONS[initialDestination.current];
    try {
      // Webpack cannot bundle MapLibre's module worker; serve it from public/ (see scripts/copy-maplibre-worker.cjs).
      setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
      map = new MapLibreMap({
        container: containerRef.current,
        style: SCENE_STYLE,
        center: preset?.center || [initialView.current.center[1], initialView.current.center[0]],
        zoom: preset?.zoom ?? initialView.current.zoom,
        bearing: preset?.bearing ?? -20,
        pitch: 60,
        maxPitch: 75,
        maxZoom: 18,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        canvasContextAttributes: { antialias: true },
        attributionControl: { compact: true },
      });
    } catch {
      setError("WebGL tidak tersedia. Aktifkan akselerasi grafis browser atau lanjutkan dengan peta 2D.");
      return;
    }
    mapRef.current = map;
    const timeout = setTimeout(() => setError("Scene belum berhasil dimuat. Periksa koneksi internet lalu buka kembali explorer."), 45000);
    const syncCamera = () => {
      const center = map.getCenter();
      setPitch(Math.round(map.getPitch()));
      setCamera({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
    };
    map.on("load", () => {
      clearTimeout(timeout);
      map.addSource("workspace", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "workspace-polygons", type: "fill-extrusion", source: "workspace", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-extrusion-color": ["get", "_sceneColor"], "fill-extrusion-height": ["max", 0, ["min", 10000, ["to-number", ["get", "height"], 30]]], "fill-extrusion-opacity": 0.75 } });
      map.addLayer({ id: "workspace-lines", type: "line", source: "workspace", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": ["get", "_sceneColor"], "line-width": 3 } });
      map.addLayer({ id: "workspace-points", type: "circle", source: "workspace", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": ["get", "_sceneColor"], "circle-radius": 6, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
      setError("");
      setReady(true);
      syncCamera();
    });
    map.on("error", () => setTileWarning(true));
    map.on("moveend", syncCamera);
    map.on("pitchend", syncCamera);
    const canvas = map.getCanvas();
    const lost = () => setError("Konteks grafis terputus. Kembali ke 2D lalu buka explorer lagi.");
    canvas.addEventListener("webglcontextlost", lost);
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) (mapRef.current?.getSource("workspace") as GeoJSONSource | undefined)?.setData(data);
  }, [data, ready]);

  const goTo = (id: SceneDestination) => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setActiveDestination(id);
    const preset = id === "current" ? null : DESTINATIONS[id];
    map.flyTo({ center: preset?.center || [initialView.current.center[1], initialView.current.center[0]], zoom: preset?.zoom ?? initialView.current.zoom, bearing: preset?.bearing ?? 0, pitch: 60, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1800 });
  };

  const toggleLayers = () => {
    const visible = !showLayers;
    setShowLayers(visible);
    ["workspace-polygons", "workspace-lines", "workspace-points"].forEach(id => mapRef.current?.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
  };

  const toggleLight = () => {
    const next = !night;
    setNight(next);
    mapRef.current?.setPaintProperty("satellite", "raster-brightness-max", next ? 0.45 : 1);
    mapRef.current?.setSky({ "sky-color": next ? "#071723" : "#a4c7cf", "horizon-color": next ? "#273e4e" : "#e3ebd7", "fog-color": next ? "#192f39" : "#b8cdca", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.65 });
  };

  return (
    <dialog ref={dialogRef} className="scene-dialog" aria-label="Explorer 3D" onCancel={onClose}>
      <div className="scene-shell">
        <header className="scene-header">
          <button className="scene-back" onClick={onClose} aria-label="Kembali ke peta 2D"><ArrowLeft size={17} /><span>Peta 2D</span></button>
          <div className="scene-brand"><Box size={21} /><span>SAKAGIS <strong>Explorer 3D</strong></span></div>
          <span className="scene-header-badge">TERRAIN EXPLORER</span>
        </header>
        <div className="scene-viewport" ref={containerRef} aria-label="Peta terrain tiga dimensi" />
        <aside className="scene-panel">
          <span className="studio-eyebrow">A DIFFERENT POINT OF VIEW</span>
          <h2>Ruang untuk<br /><em>perspektif baru.</em></h2>
          <p>Jelajahi bentang alam dengan elevasi nyata, citra satelit, dan data workspace.</p>
          <div className="scene-preset-grid">
            <button disabled={!ready} onClick={() => goTo("current")} aria-pressed={activeDestination === "current"}><ScanIcon />Area kerja</button>
            {(Object.entries(DESTINATIONS) as [Exclude<SceneDestination, "current">, typeof DESTINATIONS.bromo][]).map(([id, preset]) => <button key={id} disabled={!ready} onClick={() => goTo(id)} aria-pressed={activeDestination === id}><Mountain size={15} />{preset.name}</button>)}
          </div>
          <div className="scene-settings">
            <label htmlFor="scene-pitch"><span>Kemiringan kamera</span><output>{pitch}°</output></label>
            <input id="scene-pitch" type="range" min="0" max="75" value={pitch} disabled={!ready} onChange={event => { const value = Number(event.target.value); setPitch(value); mapRef.current?.setPitch(value); }} />
            <label htmlFor="scene-elevation"><span>Penguatan relief</span><output>{exaggeration.toFixed(1)}×</output></label>
            <input id="scene-elevation" type="range" min="0" max="3" step="0.1" value={exaggeration} disabled={!ready} onChange={event => { const value = Number(event.target.value); setExaggeration(value); mapRef.current?.setTerrain({ source: "terrain", exaggeration: value }); }} />
            <div className="scene-toggle-row"><button disabled={!ready} onClick={toggleLayers} aria-pressed={showLayers}><Layers3 size={15} />Layer data</button><button disabled={!ready} onClick={toggleLight} aria-pressed={night}>{night ? <Moon size={15} /> : <Sun size={15} />}{night ? "Malam" : "Siang"}</button></div>
          </div>
          <div className="scene-data-note"><Layers3 size={16} /><span><strong>{data.features.length} fitur termuat</strong><small>Polygon: atribut height (meter), atau ekstrusi ilustratif 30 m. PDF dan hasil analisis sementara tetap di 2D.</small></span></div>
          <button className="scene-sync" disabled={!ready} onClick={() => { const map = mapRef.current; if (map) { const center = map.getCenter(); mapInstance?.setView([center.lat, center.lng], map.getZoom(), { animate: false }); } onClose(); }}>Buka lokasi ini di 2D <ArrowLeft size={14} /></button>
        </aside>
        {!ready && !error && <div className="scene-loading" role="status"><Loader2 className="animate-spin" size={26} /><strong>Menyiapkan perspektif baru…</strong><span>Mengunduh citra dan elevasi terrain</span></div>}
        {error && <div className="scene-loading scene-error" role="alert"><Mountain size={26} /><strong>Scene tidak tersedia</strong><p>{error}</p><button className="studio-primary" onClick={onClose}>Kembali ke peta 2D</button></div>}
        <div className="scene-status" role="status"><span className="studio-status-dot" /><span>{ready ? "Scene siap" : "Memuat scene"}</span><span className="scene-status-coordinates">{camera.lat.toFixed(4)}°, {camera.lng.toFixed(4)}° · Z {camera.zoom.toFixed(1)}</span></div>
        <div className="scene-map-caption"><Satellite size={14} /><span>CITRA SATELIT + ELEVASI</span><button disabled={!ready} onClick={() => { mapRef.current?.easeTo({ bearing: 0, pitch: 60, duration: 0 }); }} aria-label="Reset orientasi"><RotateCcw size={14} /></button></div>
        {tileWarning && !error && <div className="scene-network-warning" role="status">Sebagian tile gagal dimuat. Detail peta mungkin belum lengkap.</div>}
        <div className="scene-gesture-hint">Geser untuk berpindah · Scroll untuk zoom · Klik kanan + geser untuk rotasi</div>
      </div>
    </dialog>
  );
}

function ScanIcon() { return <Compass size={15} />; }
