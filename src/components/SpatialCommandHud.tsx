"use client";

import { Activity, Database, Layers3, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useMapContext } from "@/lib/MapContext";

export function SpatialCommandHud() {
  const {
    layers,
    layerGeojsonCache,
    mapViewState,
    activeDigitizingLayerId,
    activeEditFeature,
  } = useMapContext();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  const loadedLayers = layers.filter((layer) => layer.id && layerGeojsonCache[layer.id]);
  const totalFeatures = loadedLayers.reduce(
    (total, layer) => total + (layerGeojsonCache[layer.id!]?.features?.length || 0),
    0
  );
  const activeLayer = layers.find((layer) =>
    layer.id === activeDigitizingLayerId || layer.id === activeEditFeature?.layerId
  );
  const activeFeatureCount = activeLayer?.id
    ? layerGeojsonCache[activeLayer.id]?.features?.length || 0
    : totalFeatures;

  return (
    <section className="spatial-command-hud pointer-events-none absolute bottom-[calc(84px+env(safe-area-inset-bottom))] left-3 right-3 z-[18] lg:bottom-5 lg:left-1/2 lg:right-auto lg:w-[min(760px,calc(100vw-460px))] lg:-translate-x-1/2">
      <div className="overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#0b1118]/88 shadow-[0_16px_40px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-300">
              <Activity className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-[10px] font-black uppercase tracking-[0.18em] text-white/90">
                Spatial Command Center
              </strong>
              <span className="block truncate text-[9px] text-white/40">
                Default Project{activeLayer ? ` · ${activeLayer.name}` : " · Workspace siap"}
              </span>
            </div>
          </div>
          <span className={`flex shrink-0 items-center gap-1 text-[9px] font-black uppercase tracking-wider ${isOnline ? "text-emerald-300" : "text-amber-300"}`}>
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        <div className="grid grid-cols-3 divide-x divide-white/10 lg:grid-cols-5">
          <div className="flex min-w-0 items-center gap-1.5 px-3 py-2.5">
            <Layers3 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            <div className="min-w-0">
              <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Layer</span>
              <strong className="block truncate text-xs text-white/85">{loadedLayers.length}</strong>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 px-3 py-2.5">
            <Database className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            <div className="min-w-0">
              <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Fitur aktif</span>
              <strong className="block truncate text-xs text-white/85">{activeFeatureCount.toLocaleString("id-ID")}</strong>
            </div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Total fitur</span>
            <strong className="block truncate text-xs text-white/85">{totalFeatures.toLocaleString("id-ID")}</strong>
          </div>
          <div className="hidden min-w-0 px-3 py-2.5 lg:block">
            <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">CRS kerja</span>
            <strong className="block truncate text-[10px] text-white/85">WGS 84 · EPSG:4326</strong>
          </div>
          <div className="hidden min-w-0 px-3 py-2.5 lg:block">
            <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Zoom</span>
            <strong className="block truncate text-xs text-white/85">z{mapViewState.zoom.toFixed(1)}</strong>
          </div>
          <div className="col-span-3 grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 lg:hidden">
            <div className="min-w-0 px-3 py-2">
              <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">CRS kerja</span>
              <strong className="block truncate text-[10px] text-white/85">WGS 84 · EPSG:4326</strong>
            </div>
            <div className="min-w-0 px-3 py-2">
              <span className="block text-[8px] font-black uppercase tracking-wider text-white/35">Zoom</span>
              <strong className="block truncate text-xs text-white/85">z{mapViewState.zoom.toFixed(1)}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
