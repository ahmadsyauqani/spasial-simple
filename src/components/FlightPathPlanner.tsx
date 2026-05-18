"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  X, Plus, Trash2, Download, Map, Settings, RefreshCw,
  ChevronRight, ChevronDown, Layers, Navigation2, Crosshair,
  FileDown, Route, Camera, Wind, Clock, Image, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DEFAULT_PARAMS, FlightParams, Waypoint,
  generateLawnmowerGrid, calcGSD, calcFootprint,
  exportToKML, exportToMavlink, exportToGeoJSON,
  haversineM,
} from "@/lib/flightPlanner";
import { useMapContext } from "@/lib/MapContext";
import { saveLayer } from "@/lib/database";

// ── Leaflet dynamic import (SSR safe) ────────────────────────────────────────
const MapContainer   = dynamic(() => import("react-leaflet").then(m => m.MapContainer),   { ssr: false });
const TileLayer      = dynamic(() => import("react-leaflet").then(m => m.TileLayer),      { ssr: false });
const Polyline       = dynamic(() => import("react-leaflet").then(m => m.Polyline),       { ssr: false });
const Polygon        = dynamic(() => import("react-leaflet").then(m => m.Polygon),        { ssr: false });
const CircleMarker   = dynamic(() => import("react-leaflet").then(m => m.CircleMarker),   { ssr: false });

// Helper blob download
function downloadBlob(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Map click handler (inner component) ──────────────────────────────────────
// Must be a direct child of MapContainer, so we lazily import the hook.
function MapClickHandler({ mode, onAreaPoint, onWaypoint }: {
  mode: "area" | "waypoint" | "none";
  onAreaPoint: (lat: number, lng: number) => void;
  onWaypoint:  (lat: number, lng: number) => void;
}) {
  // Dynamic import of hook at runtime (client only)
  const [useMapEventsHook, setHook] = useState<any>(null);
  useEffect(() => {
    import("react-leaflet").then(m => setHook(() => m.useMapEvents));
  }, []);

  // Inner component that uses the hook once available
  if (!useMapEventsHook) return null;
  return <MapClickInner mode={mode} onAreaPoint={onAreaPoint} onWaypoint={onWaypoint} useMapEventsHook={useMapEventsHook} />;
}

function MapClickInner({ mode, onAreaPoint, onWaypoint, useMapEventsHook }: {
  mode: "area" | "waypoint" | "none";
  onAreaPoint: (lat: number, lng: number) => void;
  onWaypoint:  (lat: number, lng: number) => void;
  useMapEventsHook: any;
}) {
  useMapEventsHook({
    click(e: any) {
      if (mode === "area")     onAreaPoint(e.latlng.lat, e.latlng.lng);
      if (mode === "waypoint") onWaypoint(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, unit, color = "text-violet-400" }: {
  label: string; value: string | number; unit: string; color?: string;
}) {
  return (
    <div className="bg-black/20 border border-white/10 rounded-xl p-3 space-y-1">
      <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-base font-black text-white">{value}</span>
        <span className={cn("text-[9px] font-black", color)}>{unit}</span>
      </div>
    </div>
  );
}

// ── Param Input ──────────────────────────────────────────────────────────────
function ParamInput({ label, value, unit, min, max, onChange }: {
  label: string; value: number; unit: string;
  min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] text-white/50 uppercase tracking-wider shrink-0">{label}</span>
      <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1">
        <input
          type="number" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-12 bg-transparent text-[11px] font-black text-white text-right focus:outline-none"
        />
        <span className="text-[9px] text-violet-400 font-bold shrink-0">{unit}</span>
      </div>
    </div>
  );
}

// ── Main FlightPathPlanner Component ─────────────────────────────────────────
export function FlightPathPlanner({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { mapViewState, fetchLayers } = useMapContext();
  const [params, setParams] = useState<FlightParams>(DEFAULT_PARAMS);
  const [drawMode, setDrawMode] = useState<"area" | "waypoint" | "none">("none");
  const [areaPoints, setAreaPoints] = useState<[number, number][]>([]);
  const [manualWPs, setManualWPs] = useState<Waypoint[]>([]);
  const [plan, setPlan] = useState<ReturnType<typeof generateLawnmowerGrid> | null>(null);
  const [activeTab, setActiveTab] = useState<"params" | "waypoints">("params");
  const [isSaving, setIsSaving] = useState(false);

  const setParam = (k: keyof FlightParams, v: number) => setParams(p => ({ ...p, [k]: v }));

  // Auto-generate when area or params change
  useEffect(() => {
    if (areaPoints.length >= 3) {
      const newPlan = generateLawnmowerGrid(areaPoints, params);
      setPlan(newPlan);
    } else {
      setPlan(null);
    }
  }, [areaPoints, params]);

  const handleAreaPoint = useCallback((lat: number, lng: number) => {
    setAreaPoints(prev => [...prev, [lat, lng]]);
  }, []);

  const handleManualWP = useCallback((lat: number, lng: number) => {
    setManualWPs(prev => [...prev, {
      id: `manual-${Date.now()}`,
      lat, lng,
      altitude: params.altitude,
      action: "photo",
    }]);
  }, [params.altitude]);

  const resetArea = () => { setAreaPoints([]); setPlan(null); setDrawMode("none"); };

  const handleExportKML = () => {
    if (!plan) return toast.error("Generate flight plan dulu!");
    downloadBlob(exportToKML(plan, "SAKAGIS Flight Plan"), "flight_plan.kml", "application/vnd.google-earth.kml+xml");
    toast.success("KML berhasil diexport!");
  };

  const handleExportMavlink = () => {
    if (!plan) return toast.error("Generate flight plan dulu!");
    downloadBlob(exportToMavlink(plan), "waypoints.waypoints");
    toast.success("MAVLink waypoints berhasil diexport!");
  };

  const handleSaveLayer = async () => {
    if (!plan || plan.waypoints.length === 0) return toast.error("Tidak ada waypoint untuk disimpan.");
    setIsSaving(true);
    try {
      const geojson = exportToGeoJSON(plan);
      await saveLayer(`FlightPlan_${new Date().toLocaleString("id-ID")}`, geojson, "LineString");
      if (fetchLayers) await fetchLayers();
      toast.success("Flight plan berhasil disimpan ke layer!");
    } catch (e: any) {
      toast.error("Gagal simpan: " + e.message);
    }
    setIsSaving(false);
  };

  if (!isOpen) return null;

  // Build polyline from grid
  const gridPolyline = plan?.waypoints
    .filter(w => w.action === "photo")
    .map(w => [w.lat, w.lng] as [number, number]) ?? [];

  const allWPs = [...(plan?.waypoints.filter(w => w.action === "photo") ?? []), ...manualWPs];

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-[#0f1014]/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#13151a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/20 rounded-xl border border-violet-500/30">
            <Route className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Flight Path Planner</h2>
            <p className="text-[9px] text-violet-400/80 font-bold uppercase tracking-widest">SAKAGIS · UAV Mission Designer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportKML}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
          >
            <FileDown className="w-3.5 h-3.5" /> KML
          </button>
          <button
            onClick={handleExportMavlink}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
          >
            <FileDown className="w-3.5 h-3.5" /> MAVLink
          </button>
          <button
            onClick={handleSaveLayer}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-400 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
          >
            <Layers className="w-3.5 h-3.5" /> {isSaving ? "Saving..." : "Save Layer"}
          </button>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ─── Left: Parameters ──────────────────────────────────────── */}
        <div className="w-64 shrink-0 flex flex-col border-r border-white/10 bg-[#13151a] overflow-y-auto">
          {/* Tab switcher */}
          <div className="flex border-b border-white/10">
            {(["params", "waypoints"] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest transition-all",
                  activeTab === t
                    ? "text-violet-400 border-b-2 border-violet-400"
                    : "text-white/30 hover:text-white/60"
                )}
              >
                {t === "params" ? "⚙ Param" : "📍 Waypoints"}
              </button>
            ))}
          </div>

          {activeTab === "params" && (
            <div className="p-4 space-y-5">
              {/* Flight params */}
              <div className="space-y-3">
                <label className="text-[8px] font-black uppercase tracking-widest text-violet-400/70">Flight Parameters</label>
                <ParamInput label="Altitude" value={params.altitude} unit="m" min={10} max={500} onChange={v => setParam("altitude", v)} />
                <ParamInput label="Speed" value={params.speed} unit="m/s" min={1} max={20} onChange={v => setParam("speed", v)} />
              </div>
              <div className="space-y-3">
                <label className="text-[8px] font-black uppercase tracking-widest text-violet-400/70">Coverage Overlap</label>
                <ParamInput label="Front ↕" value={params.overlapFront} unit="%" min={50} max={95} onChange={v => setParam("overlapFront", v)} />
                <ParamInput label="Side ↔" value={params.overlapSide} unit="%" min={50} max={95} onChange={v => setParam("overlapSide", v)} />
              </div>
              <div className="space-y-3">
                <label className="text-[8px] font-black uppercase tracking-widest text-violet-400/70">Camera Settings</label>
                <ParamInput label="FOV H" value={params.cameraFovH} unit="°" min={40} max={120} onChange={v => setParam("cameraFovH", v)} />
                <ParamInput label="FOV V" value={params.cameraFovV} unit="°" min={30} max={90} onChange={v => setParam("cameraFovV", v)} />
                <ParamInput label="Focal" value={params.focalLength} unit="mm" min={5} max={50} onChange={v => setParam("focalLength", v)} />
              </div>
              {/* Camera presets */}
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase tracking-widest text-violet-400/70">Camera Presets</label>
                {[
                  { name: "DJI Mavic 3", fovH: 84, fovV: 57, focal: 12.29, sW: 17.3, sH: 13 },
                  { name: "DJI Mini 3 Pro", fovH: 82.1, fovV: 63.5, focal: 9.7, sW: 9.6, sH: 7.2 },
                  { name: "Phantom 4 Pro", fovH: 84, fovV: 60, focal: 8.8, sW: 13.2, sH: 8.8 },
                  { name: "Custom", fovH: params.cameraFovH, fovV: params.cameraFovV, focal: params.focalLength, sW: params.cameraSensorW, sH: params.cameraSensorH },
                ].slice(0, 3).map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => setParams(p => ({ ...p, cameraFovH: preset.fovH, cameraFovV: preset.fovV, focalLength: preset.focal, cameraSensorW: preset.sW, cameraSensorH: preset.sH }))}
                    className="w-full text-left px-3 py-2 bg-white/5 hover:bg-violet-500/10 border border-white/5 hover:border-violet-500/20 rounded-lg text-[9px] font-bold text-white/60 hover:text-violet-300 transition-all"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "waypoints" && (
            <div className="p-4 space-y-3">
              <label className="text-[8px] font-black uppercase tracking-widest text-violet-400/70">Manual Waypoints</label>
              {manualWPs.length === 0 && (
                <p className="text-[9px] text-white/30 italic">Klik tombol "Add WP" lalu klik di peta</p>
              )}
              {manualWPs.map((wp, i) => (
                <div key={wp.id} className="flex items-center justify-between bg-black/20 border border-white/10 rounded-xl px-3 py-2">
                  <div>
                    <span className="text-[9px] font-black text-violet-400">WP {i + 1}</span>
                    <p className="text-[8px] text-white/40">{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}</p>
                  </div>
                  <button onClick={() => setManualWPs(prev => prev.filter(w => w.id !== wp.id))}
                    className="p-1 hover:text-red-400 text-white/30 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Center: Map ───────────────────────────────────────────── */}
        <div className="flex-1 relative">
          {/* Map toolbar */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-[#13151a]/90 backdrop-blur border border-white/10 rounded-2xl p-1.5 shadow-2xl">
            <button
              onClick={() => setDrawMode(drawMode === "area" ? "none" : "area")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all",
                drawMode === "area"
                  ? "bg-violet-500 text-white shadow-lg shadow-violet-500/30"
                  : "text-white/50 hover:bg-white/10 hover:text-white"
              )}
            >
              <Crosshair className="w-3.5 h-3.5" /> Gambar Area
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => setDrawMode(drawMode === "waypoint" ? "none" : "waypoint")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all",
                drawMode === "waypoint"
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                  : "text-white/50 hover:bg-white/10 hover:text-white"
              )}
            >
              <Plus className="w-3.5 h-3.5" /> Add WP
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={resetArea}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>

          {/* Draw mode indicator */}
          {drawMode !== "none" && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 bg-violet-500/20 border border-violet-500/30 rounded-full text-[9px] font-black text-violet-300 uppercase tracking-widest animate-pulse">
              {drawMode === "area" ? "🖱 Klik peta untuk menentukan area terbang" : "🖱 Klik peta untuk tambah waypoint"}
            </div>
          )}

          <MapContainer
            center={[mapViewState.center[0], mapViewState.center[1]]}
            zoom={mapViewState.zoom}
            style={{ height: "100%", width: "100%", background: "#0f1014" }}
            zoomControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

            {/* Area polygon */}
            {areaPoints.length >= 2 && (
              <Polygon
                positions={areaPoints}
                pathOptions={{ color: "#a78bfa", fillColor: "#7c3aed", fillOpacity: 0.15, weight: 2, dashArray: "6 4" }}
              />
            )}
            {areaPoints.map((pt, i) => (
              <CircleMarker key={i} center={pt} radius={5}
                pathOptions={{ color: "#a78bfa", fillColor: "#7c3aed", fillOpacity: 1, weight: 2 }}
              />
            ))}

            {/* Grid flight path */}
            {gridPolyline.length > 1 && (
              <Polyline positions={gridPolyline}
                pathOptions={{ color: "#60a5fa", weight: 1.5, opacity: 0.8, dashArray: "4 3" }}
              />
            )}

            {/* Photo waypoints (small dots) */}
            {(plan?.waypoints.filter(w => w.action === "photo") ?? []).map((w, i) => (
              <CircleMarker key={w.id} center={[w.lat, w.lng]} radius={3}
                pathOptions={{ color: "#60a5fa", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 1 }}
              />
            ))}

            {/* Manual waypoints */}
            {manualWPs.map((w, i) => (
              <CircleMarker key={w.id} center={[w.lat, w.lng]} radius={6}
                pathOptions={{ color: "#f59e0b", fillColor: "#d97706", fillOpacity: 1, weight: 2 }}
              />
            ))}

            <MapClickHandler
              mode={drawMode}
              onAreaPoint={handleAreaPoint}
              onWaypoint={handleManualWP}
            />
          </MapContainer>

          {/* Area points counter */}
          {areaPoints.length > 0 && areaPoints.length < 3 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full text-[9px] font-black text-amber-300 uppercase tracking-widest">
              ⚠ Butuh minimal 3 titik — sudah {areaPoints.length} titik
            </div>
          )}
        </div>

        {/* ─── Right: Statistics ─────────────────────────────────────── */}
        <div className="w-56 shrink-0 flex flex-col border-l border-white/10 bg-[#13151a] overflow-y-auto">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-violet-400">Mission Stats</h3>
          </div>

          {plan && plan.waypoints.length > 0 ? (
            <div className="p-4 space-y-3">
              <StatCard label="Total Distance" value={(plan.totalDistanceM / 1000).toFixed(2)} unit="km" color="text-blue-400" />
              <StatCard label="Flight Time" value={Math.round(plan.estimatedTimeSec / 60)} unit="min" color="text-emerald-400" />
              <StatCard label="Photo Count" value={plan.photoCount} unit="foto" color="text-amber-400" />
              <StatCard label="GSD" value={plan.gsd.toFixed(2)} unit="cm/px" color="text-violet-400" />
              <StatCard label="Coverage" value={(plan.coverageArea / 10000).toFixed(1)} unit="Ha" color="text-cyan-400" />
              <StatCard label="Altitude" value={params.altitude} unit="m AGL" color="text-orange-400" />

              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <label className="text-[8px] font-black uppercase tracking-widest text-white/30">Footprint per foto</label>
                <div className="text-[10px] text-white/60">
                  {plan.footprintW.toFixed(0)}m × {plan.footprintH.toFixed(0)}m
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-2">
                <label className="text-[8px] font-black uppercase tracking-widest text-white/30">GSD Quality</label>
                <div className={cn(
                  "text-[9px] font-black px-2 py-1 rounded-lg text-center",
                  plan.gsd < 2 ? "bg-emerald-500/20 text-emerald-400" :
                  plan.gsd < 5 ? "bg-blue-500/20 text-blue-400" :
                  "bg-amber-500/20 text-amber-400"
                )}>
                  {plan.gsd < 2 ? "🟢 Ultra High Res" : plan.gsd < 5 ? "🔵 High Res" : "🟡 Standard"}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-3">
              <div className="p-4 bg-violet-500/10 rounded-2xl border border-violet-500/20">
                <Route className="w-8 h-8 text-violet-400/50" />
              </div>
              <p className="text-[9px] text-white/30 leading-relaxed">
                Gambar area terbang<br/>di peta untuk melihat<br/>statistik misi
              </p>
            </div>
          )}

          {/* Export actions */}
          <div className="p-4 border-t border-white/10 space-y-2 mt-auto">
            <button onClick={handleExportKML} disabled={!plan}
              className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all",
                plan ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" : "bg-white/5 border border-white/5 text-white/20 cursor-not-allowed"
              )}>
              <FileDown className="w-3.5 h-3.5" /> Export KML
            </button>
            <button onClick={handleExportMavlink} disabled={!plan}
              className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all",
                plan ? "bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20" : "bg-white/5 border border-white/5 text-white/20 cursor-not-allowed"
              )}>
              <FileDown className="w-3.5 h-3.5" /> MAVLink WPT
            </button>
            <button onClick={handleSaveLayer} disabled={!plan || isSaving}
              className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all",
                plan ? "bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20" : "bg-white/5 border border-white/5 text-white/20 cursor-not-allowed"
              )}>
              <Layers className="w-3.5 h-3.5" /> {isSaving ? "Saving..." : "Save Layer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
