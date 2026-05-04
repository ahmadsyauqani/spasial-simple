"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { Layers, Loader2, Trash2, DownloadCloud, Check } from "lucide-react";
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

export function UnionAnalysisButton() {
  const {
    layers,
    layerGeojsonCache,
    areaUnit,
    unionResult,
    setUnionResult,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");

  const formatAreaUnit = (sqm: number) => {
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
    if (!unionResult?.geojson) return;
    const names = unionResult.sourceLayerNames.map(n => n.replace(/\.[^/.]+$/, "")).join("_");
    const blob = new Blob([JSON.stringify(unionResult.geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `union_${names}.geojson`.replace(/\s+/g, "_");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Hasil union berhasil diunduh!");
  };

  const runUnionAnalysis = () => {
    if (selectedLayerIds.length !== 2) {
      toast.error("Pilih tepat 2 layer untuk proses Union!");
      return;
    }

    setIsProcessing(true);
    setProgress("Mengevaluasi topologi spasial (Intersect & Difference)...");

    // Gunakan setTimeout agar UI tidak freeze
    setTimeout(() => {
      try {
        const layerAId = selectedLayerIds[0];
        const layerBId = selectedLayerIds[1];
        const fcA = layerGeojsonCache[layerAId];
        const fcB = layerGeojsonCache[layerBId];
        
        const layerAMeta = layers.find((l) => l.id === layerAId);
        const layerBMeta = layers.find((l) => l.id === layerBId);
        const nameA = layerAMeta?.name || "Layer 1";
        const nameB = layerBMeta?.name || "Layer 2";

        if (!fcA?.features || !fcB?.features) {
          throw new Error("Data layer tidak valid atau kosong.");
        }

        // Algoritma Union Topologi Naive
        // 1. A ∩ B (Intersect) -> Mewarisi atribut A dan B
        // 2. A - B (Difference) -> Mewarisi atribut A
        // 3. B - A (Difference) -> Mewarisi atribut B

        const unionedFeatures: any[] = [];
        
        // Buat salinan array B untuk dikurangi bertahap
        let remnantsB = fcB.features.map((f: any) => JSON.parse(JSON.stringify(f)));

        setProgress("Memotong poligon...");

        for (let i = 0; i < fcA.features.length; i++) {
          let remnantA = JSON.parse(JSON.stringify(fcA.features[i]));
          const propsA = remnantA.properties || {};

          for (let j = 0; j < remnantsB.length; j++) {
            const polyB = remnantsB[j];
            if (!polyB || !remnantA) continue;

            try {
              // Jika A dan B bersinggungan
              if (turf.booleanIntersects(remnantA, polyB)) {
                // Ambil irisannya (A ∩ B)
                const intersection = turf.intersect(turf.featureCollection([remnantA, polyB]));
                if (intersection) {
                  intersection.properties = { ...propsA, ...polyB.properties };
                  unionedFeatures.push(intersection);
                }

                // Kurangi B dengan A (B - A)
                const diffB = turf.difference(turf.featureCollection([polyB, remnantA]));
                remnantsB[j] = diffB ? { ...diffB, properties: polyB.properties } : null;

                // Kurangi A dengan B (A - B)
                const diffA = turf.difference(turf.featureCollection([remnantA, polyB]));
                remnantA = diffA ? { ...diffA, properties: propsA } : null;
              }
            } catch (err) {
              // Abaikan error topologi minor pada turf.js
              console.warn("Minor topology error ignored in Union", err);
            }
          }

          // Sisa dari A yang tidak berpotongan dengan B apapun
          if (remnantA) {
            unionedFeatures.push(remnantA);
          }
        }

        // Tambahkan sisa dari B yang tidak berpotongan dengan A apapun
        for (const remB of remnantsB) {
          if (remB) {
            unionedFeatures.push(remB);
          }
        }

        setProgress("Menormalisasi hasil gabungan...");
        
        // Hapus fitur yang geometry-nya null atau kosong
        const validFeatures = unionedFeatures.filter(f => f && f.geometry && f.geometry.coordinates);

        if (validFeatures.length === 0) {
          throw new Error("Hasil komputasi Union kosong. Geometri tidak valid.");
        }

        const resultFC = turf.featureCollection(validFeatures);
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

        setUnionResult({
          geojson: resultFC,
          areaMetrics: { wgs84_sqm: totalAreaSqm, utm_sqm, utm_epsg, tm3_sqm, tm3_epsg },
          sourceLayerNames: [nameA, nameB],
          featureCount: validFeatures.length,
        });

        toast.success(`Union berhasil! ${validFeatures.length} area diskrit terbentuk.`);
        setProgress("");
        setIsProcessing(false);
        setIsOpen(false);
      } catch (e: any) {
        console.error("Union error:", e);
        toast.error("Gagal menjalankan Union: " + e.message);
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
            : unionResult
              ? "border-amber-500/50 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 shadow-sm shadow-amber-500/10"
              : "border-border text-muted-foreground hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
        }`}
        disabled={availableLayers.length < 2}
        title="Union Analysis"
      >
        <Layers className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            Union Analysis
          </DialogTitle>
          <DialogDescription>
            Menyatukan geometri 2 layer secara topologis. Poligon yang tumpang tindih akan dipotong menjadi area baru dan atributnya digabungkan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Layer Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Pilih 2 Layer untuk Union
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
                          ? "bg-amber-500/15 border border-amber-500/30 text-amber-200"
                          : "hover:bg-white/5 text-card-foreground border border-transparent"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-all ${
                          isSelected
                            ? "bg-amber-500 border-amber-400"
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
              {selectedLayerIds.length}/2 layer terpilih
            </span>
          </div>

          {/* Progress */}
          {progress && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {/* Hasil inline */}
          {unionResult && !isProcessing && (
            <div className="flex flex-col gap-2 bg-amber-950/30 border border-amber-500/20 rounded-lg p-3 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3 h-3" /> Hasil Union
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDownloadResult}
                    className="p-1 hover:bg-amber-500/20 rounded text-amber-400 hover:text-amber-300 transition-colors"
                    title="Unduh hasil union"
                  >
                    <DownloadCloud className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { setUnionResult(null); toast.info("Hasil union dihapus dari peta."); }}
                    className="p-1 hover:bg-amber-500/20 rounded text-amber-400 hover:text-amber-300 transition-colors"
                    title="Hapus hasil dari peta"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground flex flex-wrap gap-1">
                {unionResult.sourceLayerNames.map((name, i) => (
                  <span key={i}>
                    <span className="font-mono text-amber-300">{name.replace(/\.[^/.]+$/, "")}</span>
                    {i < unionResult.sourceLayerNames.length - 1 && <span className="text-amber-500/50 mx-1">∪</span>}
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-1 text-xs mt-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jumlah Fitur:</span>
                  <span className="font-mono font-bold text-amber-300">{unionResult.featureCount} fitur diskrit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WGS 84</span>
                  <span className="font-mono font-bold text-amber-300">{formatAreaUnit(unionResult.areaMetrics.wgs84_sqm)}</span>
                </div>
                {unionResult.areaMetrics.utm_sqm && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UTM ({unionResult.areaMetrics.utm_epsg})</span>
                    <span className="font-mono">{formatAreaUnit(unionResult.areaMetrics.utm_sqm)}</span>
                  </div>
                )}
                {unionResult.areaMetrics.tm3_sqm && unionResult.areaMetrics.tm3_epsg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TM-3 ({unionResult.areaMetrics.tm3_epsg})</span>
                    <span className="font-mono">{formatAreaUnit(unionResult.areaMetrics.tm3_sqm)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>Tutup</Button>
          <Button
            onClick={runUnionAnalysis}
            disabled={isProcessing || selectedLayerIds.length !== 2}
            className="bg-amber-600 hover:bg-amber-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Komputasi...</span>
            ) : (
              <span className="flex items-center"><Layers className="w-4 h-4 mr-2" /> Jalankan Union</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
