"use client";

import { DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import { ExportLayerDialog } from "./ExportLayerDialog";

export function LayerExportButton({ layer, geojson }: { layer: any; geojson: any }) {
  const isLocal = layer.syncStatus === "local" || String(layer.id || "").startsWith("local-");

  if (!isLocal) {
    return <div className="layer-workspace-cloud-export"><ExportLayerDialog layer={layer} /><span>Ekspor & proyeksi</span></div>;
  }

  const downloadLocalLayer = () => {
    if (!geojson?.features) {
      toast.error("Data lokal belum siap untuk diekspor.");
      return;
    }
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(layer.name || "layer").replace(/[^\w\-]+/g, "_")}.geojson`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Layer lokal berhasil diekspor.");
  };

  return (
    <button
      type="button"
      className="layer-workspace-menu-action"
      aria-label={`Ekspor layer ${layer.name}`}
      onClick={downloadLocalLayer}
    >
      <DownloadCloud className="h-3.5 w-3.5" /> Ekspor layer
    </button>
  );
}
