"use client";

import { ChevronDown, Download, Layers3, Maximize2, X } from "lucide-react";
import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";

export function AnalysisResultsPanel() {
  const [expanded, setExpanded] = useState(true);
  const {
    overlapResult, setOverlapResult,
    clipResult, setClipResult,
    mergeResult, setMergeResult,
    bufferResult, setBufferResult,
    unionResult, setUnionResult,
    dissolveResult, setDissolveResult,
    spatialJoinResult, setSpatialJoinResult,
    sliverResult, setSliverResult,
    setZoomFeature,
  } = useMapContext();

  const results = [
    { key: "overlap", label: "Overlap", color: "#f43f5e", result: overlapResult, clear: setOverlapResult },
    { key: "clip", label: "Clip", color: "#10b981", result: clipResult, clear: setClipResult },
    { key: "merge", label: "Merge", color: "#a78bfa", result: mergeResult, clear: setMergeResult },
    { key: "buffer", label: "Buffer", color: "#38bdf8", result: bufferResult, clear: setBufferResult },
    { key: "union", label: "Union", color: "#f59e0b", result: unionResult, clear: setUnionResult },
    { key: "dissolve", label: "Dissolve", color: "#e879f9", result: dissolveResult, clear: setDissolveResult },
    { key: "join", label: "Spatial Join", color: "#818cf8", result: spatialJoinResult, clear: setSpatialJoinResult },
    { key: "sliver", label: "Sliver", color: "#facc15", result: sliverResult, clear: setSliverResult },
  ].filter((item) => item.result?.geojson);

  if (results.length === 0) return null;

  const downloadResult = (label: string, geojson: any) => {
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${label.toLowerCase().replace(/\s+/g, "_")}_result.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className={`fixed right-4 top-24 z-[9000] w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-card/90 shadow-2xl backdrop-blur-2xl ${expanded ? "" : "analysis-results-collapsed"}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
        <button onClick={() => setExpanded((value) => !value)} className="flex items-center gap-2 text-left"><Layers3 className="h-4 w-4 text-cyan-300" /><div><strong className="block text-[10px] font-black uppercase tracking-widest text-white/90">Analysis Results</strong><span className="text-[9px] text-white/40">{results.length} hasil aktif di peta</span></div></button>
        <button onClick={() => setExpanded((value) => !value)} className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white" title={expanded ? "Ciutkan" : "Buka hasil"}><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`} /></button>
      </div>
      {expanded && <div className="max-h-[55vh] space-y-2 overflow-y-auto p-2">
        {results.map((item: any) => {
          const result = item.result;
          const featureCount = result.featureCount ?? result.stats?.totalSlivers ?? result.geojson?.features?.length ?? 0;
          const area = result.areaMetrics?.wgs84_sqm;
          return (
            <div key={item.key} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 10px ${item.color}` }} /><strong className="text-xs text-white/90">{item.label}</strong></div>
                <button onClick={() => item.clear(null)} className="rounded-md p-1 text-white/30 hover:bg-red-500/10 hover:text-red-300" title="Hapus hasil"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px]">
                <span className="rounded-md bg-black/20 px-2 py-1 text-white/50">Fitur <b className="text-white/80">{featureCount}</b></span>
                {area !== undefined && <span className="rounded-md bg-black/20 px-2 py-1 text-white/50">Area <b className="text-white/80">{(area / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha</b></span>}
              </div>
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => setZoomFeature(result.geojson)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-500/15 px-2 py-1.5 text-[9px] font-bold text-indigo-300 hover:bg-indigo-500/25"><Maximize2 className="h-3 w-3" /> Lihat di peta</button>
                <button onClick={() => downloadResult(item.label, result.geojson)} className="flex items-center justify-center rounded-lg bg-white/5 px-2 py-1.5 text-white/55 hover:bg-white/10 hover:text-white" title="Unduh GeoJSON"><Download className="h-3 w-3" /></button>
              </div>
            </div>
          );
        })}
      </div>}
    </aside>
  );
}
