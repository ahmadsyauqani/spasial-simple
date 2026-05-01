"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { Combine, Loader2, Trash2, DownloadCloud, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Merge Analysis — Gabungkan fitur dari 2+ layer menjadi 1 layer baru.
 * Identik dengan operasi Merge di ArcGIS:
 * - Semua fitur dari layer terpilih digabungkan
 * - Kolom atribut di-union-kan (gabung semua kolom unik)
 * - Fitur yang tidak memiliki kolom tertentu akan diisi null
 */
export function MergeAnalysisButton() {
  const {
    layers,
    layerGeojsonCache,
    areaUnit,
    mergeResult,
    setMergeResult,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");

  const formatUnit = (sqm: number) => {
    if (areaUnit === "Ha")
      return `${(sqm / 10000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === "km2")
      return `${(sqm / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString("id-ID", { maximumFractionDigits: 0 })} m²`;
  };

  const availableLayers = layers.filter((l) => l.id && layerGeojsonCache[l.id]);

  const toggleLayer = (id: string) => {
    setSelectedLayerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDownloadResult = () => {
    if (!mergeResult?.geojson) return;
    const names = mergeResult.sourceLayerNames.map(n => n.replace(/\.[^/.]+$/, "")).join("_");
    const blob = new Blob([JSON.stringify(mergeResult.geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `merge_${names}.geojson`.replace(/\s+/g, "_");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Hasil merge berhasil diunduh!");
  };

  const runMergeAnalysis = () => {
    if (selectedLayerIds.length < 2) {
      toast.error("Pilih minimal 2 layer untuk di-merge!");
      return;
    }

    setIsProcessing(true);
    setProgress("Mengumpulkan fitur dari semua layer...");

    setTimeout(() => {
      try {
        const allFeatures: any[] = [];
        const allKeys = new Set<string>();
        const sourceNames: string[] = [];

        for (let i = 0; i < selectedLayerIds.length; i++) {
          const layerId = selectedLayerIds[i];
          const geojson = layerGeojsonCache[layerId];
          const layerMeta = layers.find((l) => l.id === layerId);
          const layerName = layerMeta?.name || `Layer ${i + 1}`;
          sourceNames.push(layerName);

          if (!geojson?.features) continue;

          setProgress(`Memproses ${layerName} (${geojson.features.length} fitur)...`);

          for (const feature of geojson.features) {
            // Kumpulkan semua kunci atribut
            if (feature.properties) {
              Object.keys(feature.properties).forEach((k) => {
                if (k !== "db_id" && k !== "FID") allKeys.add(k);
              });
            }

            // Tambahkan kolom _source_layer untuk identifikasi asal
            allFeatures.push({
              ...feature,
              properties: {
                ...feature.properties,
                _source_layer: layerName,
              },
            });
          }
        }

        if (allFeatures.length === 0) {
          toast.info("Tidak ada fitur yang ditemukan di layer terpilih.");
          setIsProcessing(false);
          setProgress("");
          return;
        }

        setProgress("Menormalisasi atribut...");

        // Normalisasi: pastikan semua fitur memiliki semua kolom (isi null jika tidak ada)
        const allKeysArr = Array.from(allKeys);
        allKeysArr.push("_source_layer");

        for (const feature of allFeatures) {
          for (const key of allKeysArr) {
            if (!(key in (feature.properties || {}))) {
              if (!feature.properties) feature.properties = {};
              feature.properties[key] = null;
            }
          }
        }

        setProgress("Menghitung luas area gabungan...");

        const resultFC = turf.featureCollection(allFeatures);
        const totalAreaSqm = turf.area(resultFC);

        let utm_sqm = totalAreaSqm * 0.9992;
        let tm3_sqm = totalAreaSqm * 0.9998;
        let utm_epsg: string | undefined;
        let tm3_epsg: string | undefined;

        try {
          const centroid = turf.centroid(resultFC).geometry.coordinates;
          const lng = centroid[0];
          const lat = centroid[1];
          const utmZone = Math.floor((lng + 180) / 6) + 1;
          const isSouth = lat < 0;
          utm_epsg = `${isSouth ? 32700 + utmZone : 32600 + utmZone}`;
          const tm3Index = Math.round((lng - 94.5) / 3);
          if (tm3Index >= 0 && tm3Index <= 20) {
            tm3_epsg = `${23826 + tm3Index}`;
          }
        } catch (e) {}

        setMergeResult({
          geojson: resultFC,
          areaMetrics: { wgs84_sqm: totalAreaSqm, utm_sqm, utm_epsg, tm3_sqm, tm3_epsg },
          sourceLayerNames: sourceNames,
          featureCount: allFeatures.length,
          allAttributeKeys: allKeysArr,
        });

        toast.success(
          `Merge berhasil! ${allFeatures.length} fitur dari ${sourceNames.length} layer digabungkan. Total: ${formatUnit(totalAreaSqm)}`
        );
        setProgress("");
        setIsProcessing(false);
      } catch (e: any) {
        console.error("Merge error:", e);
        toast.error("Gagal menjalankan merge: " + e.message);
        setIsProcessing(false);
        setProgress("");
      }
    }, 100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all outline-none ${
          availableLayers.length < 2
            ? "border-border/40 text-muted-foreground/30 cursor-not-allowed"
            : mergeResult
              ? "border-violet-500/50 bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 shadow-sm shadow-violet-500/10"
              : "border-border text-muted-foreground hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-400"
        }`}
        disabled={availableLayers.length < 2}
        title="Merge Layers"
      >
        <Combine className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Combine className="w-5 h-5 text-violet-400" />
            Merge Layers
          </DialogTitle>
          <DialogDescription>
            Gabungkan fitur dari beberapa layer menjadi satu — seperti Merge di ArcGIS. Seluruh kolom atribut akan disatukan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Layer Selection (multi-select checklist) */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Pilih Layer untuk Digabungkan (min. 2)
            </label>
            <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto rounded-md border border-border bg-background p-2">
              {availableLayers.length === 0 ? (
                <span className="text-xs text-muted-foreground italic p-2">Belum ada layer yang ter-load di peta.</span>
              ) : (
                availableLayers.map((l) => {
                  const isSelected = selectedLayerIds.includes(l.id!);
                  const style = l.style || { fillColor: "#3b82f6" };
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLayer(l.id!)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-all ${
                        isSelected
                          ? "bg-violet-500/15 border border-violet-500/30 text-violet-200"
                          : "hover:bg-white/5 text-card-foreground border border-transparent"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-all ${
                          isSelected
                            ? "bg-violet-500 border-violet-400"
                            : "border-border bg-white/5"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div
                        className="w-3 h-3 rounded-full shrink-0 border border-black/20"
                        style={{ backgroundColor: style.fillColor }}
                      />
                      <span className="truncate text-xs font-medium">{l.name}</span>
                    </button>
                  );
                })
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {selectedLayerIds.length} layer terpilih
              {selectedLayerIds.length >= 2 && " ✓"}
            </span>
          </div>

          {/* Progress */}
          {progress && (
            <div className="flex items-center gap-2 text-xs text-violet-400 bg-violet-900/20 border border-violet-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {/* Hasil inline */}
          {mergeResult && (
            <div className="flex flex-col gap-2 bg-violet-950/30 border border-violet-500/20 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                  🔗 Hasil Merge
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDownloadResult}
                    className="p-1 hover:bg-violet-500/20 rounded text-violet-400 hover:text-violet-300 transition-colors"
                    title="Unduh hasil merge"
                  >
                    <DownloadCloud className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { setMergeResult(null); toast.info("Hasil merge dihapus dari peta."); }}
                    className="p-1 hover:bg-violet-500/20 rounded text-violet-400 hover:text-violet-300 transition-colors"
                    title="Hapus hasil dari peta"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground flex flex-wrap gap-1">
                {mergeResult.sourceLayerNames.map((name, i) => (
                  <span key={i}>
                    <span className="font-mono text-violet-300">{name.replace(/\.[^/.]+$/, "")}</span>
                    {i < mergeResult.sourceLayerNames.length - 1 && <span className="text-violet-500/50 mx-1">+</span>}
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jumlah Fitur:</span>
                  <span className="font-mono font-bold text-violet-300">{mergeResult.featureCount} fitur</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kolom Atribut:</span>
                  <span className="font-mono font-bold text-violet-300">{mergeResult.allAttributeKeys.length} kolom</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WGS 84</span>
                  <span className="font-mono font-bold text-violet-300">{formatUnit(mergeResult.areaMetrics.wgs84_sqm)}</span>
                </div>
                {mergeResult.areaMetrics.utm_sqm && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UTM ({mergeResult.areaMetrics.utm_epsg})</span>
                    <span className="font-mono">{formatUnit(mergeResult.areaMetrics.utm_sqm)}</span>
                  </div>
                )}
                {mergeResult.areaMetrics.tm3_sqm && mergeResult.areaMetrics.tm3_epsg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TM-3 ({mergeResult.areaMetrics.tm3_epsg})</span>
                    <span className="font-mono">{formatUnit(mergeResult.areaMetrics.tm3_sqm)}</span>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-violet-400/70 mt-1">Klik fitur ungu di peta untuk detail atribut.</p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>Tutup</Button>
          <Button
            onClick={runMergeAnalysis}
            disabled={isProcessing || selectedLayerIds.length < 2}
            className="bg-violet-600 hover:bg-violet-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menggabung...</span>
            ) : (
              <span className="flex items-center"><Combine className="w-4 h-4 mr-2" /> Jalankan Merge</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
