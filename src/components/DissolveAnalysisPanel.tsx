"use client";

import { useState, useEffect } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { Blend, Loader2, Trash2, DownloadCloud, Check } from "lucide-react";
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

export function DissolveAnalysisButton() {
  const {
    layers,
    layerGeojsonCache,
    areaUnit,
    dissolveResult,
    setDissolveResult,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [availableAttributes, setAvailableAttributes] = useState<string[]>([]);
  const [selectedAttribute, setSelectedAttribute] = useState<string>("none");
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

  useEffect(() => {
    if (selectedLayerId && layerGeojsonCache[selectedLayerId]) {
      const geojson = layerGeojsonCache[selectedLayerId];
      const keys = new Set<string>();
      if (geojson.features) {
        for (const feature of geojson.features) {
          if (feature.properties) {
            Object.keys(feature.properties).forEach(k => {
              if (k !== "db_id" && k !== "FID") keys.add(k);
            });
          }
        }
      }
      setAvailableAttributes(Array.from(keys));
      setSelectedAttribute("none");
    } else {
      setAvailableAttributes([]);
    }
  }, [selectedLayerId, layerGeojsonCache]);

  const handleDownloadResult = () => {
    if (!dissolveResult?.geojson) return;
    const blob = new Blob([JSON.stringify(dissolveResult.geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dissolve_${dissolveResult.inputLayerName}_by_${dissolveResult.dissolveProperty || "all"}.geojson`.replace(/\s+/g, "_");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Hasil dissolve berhasil diunduh!");
  };

  const runDissolveAnalysis = () => {
    if (!selectedLayerId) {
      toast.error("Pilih layer untuk di-dissolve!");
      return;
    }

    setIsProcessing(true);
    setProgress("Memproses peleburan poligon...");

    setTimeout(() => {
      try {
        const layerMeta = layers.find((l) => l.id === selectedLayerId);
        const geojson = layerGeojsonCache[selectedLayerId];
        const layerName = layerMeta?.name || "Layer Target";

        if (!geojson || !geojson.features || geojson.features.length === 0) {
          toast.error("Layer target tidak memiliki fitur valid.");
          setIsProcessing(false);
          setProgress("");
          return;
        }

        // Jalankan dissolve
        let dissolved: any;
        if (selectedAttribute !== "none") {
          dissolved = turf.dissolve(geojson, { propertyName: selectedAttribute });
        } else {
          // Jika none, jadikan satu geometri raksasa
          dissolved = turf.dissolve(geojson);
        }
        
        if (!dissolved) {
          throw new Error("Gagal melakukan dissolve geometri.");
        }

        setProgress("Menghitung luas area dissolve...");
        const totalAreaSqm = turf.area(dissolved);

        let utm_sqm = totalAreaSqm * 0.9992;
        let tm3_sqm = totalAreaSqm * 0.9998;
        let utm_epsg: string | undefined;
        let tm3_epsg: string | undefined;

        try {
          const centroid = turf.centroid(dissolved).geometry.coordinates;
          const lng = centroid[0];
          const lat = centroid[1];
          const utmZone = Math.floor((lng + 180) / 6) + 1;
          const isSouth = lat < 0;
          utm_epsg = `${isSouth ? 32700 + utmZone : 32600 + utmZone}`;
          const tm3Index = Math.round((lng - 94.5) / 3);
          if (tm3Index >= 0 && tm3Index <= 20) {
            const baseZone = 46 + Math.floor((tm3Index + 1) / 2);
            const subZone = (tm3Index % 2 === 0) ? 2 : 1;
            tm3_epsg = `${23826 + tm3Index} (Zona ${baseZone}-${subZone})`;
          }
        } catch (e) {}

        let featureCount = 0;
        if (dissolved.type === "FeatureCollection") {
            featureCount = dissolved.features.length;
        }

        setDissolveResult({
          geojson: dissolved,
          areaMetrics: { wgs84_sqm: totalAreaSqm, utm_sqm, utm_epsg, tm3_sqm, tm3_epsg },
          inputLayerName: layerName,
          dissolveProperty: selectedAttribute === "none" ? null : selectedAttribute,
          featureCount: featureCount,
        });

        toast.success(`Dissolve berhasil! Menghasilkan ${featureCount} fitur agregasi.`);
        setProgress("");
        setIsProcessing(false);
        setIsOpen(false);
      } catch (e: any) {
        console.error("Dissolve error:", e);
        toast.error("Gagal menjalankan dissolve: " + e.message);
        setIsProcessing(false);
        setProgress("");
      }
    }, 100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all outline-none ${
          availableLayers.length < 1
            ? "border-border/40 text-muted-foreground/30 cursor-not-allowed"
            : dissolveResult
              ? "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 shadow-sm shadow-fuchsia-500/10"
              : "border-border text-muted-foreground hover:border-fuchsia-500/40 hover:bg-fuchsia-500/10 hover:text-fuchsia-400"
        }`}
        disabled={availableLayers.length < 1}
        title="Dissolve Analysis"
      >
        <Blend className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Blend className="w-5 h-5 text-fuchsia-400" />
            Dissolve Analysis
          </DialogTitle>
          <DialogDescription>
            Meleburkan poligon yang tumpang tindih atau bersinggungan berdasarkan kesamaan nilai atribut.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Layer Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Pilih Layer Target
            </label>
            <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto rounded-md border border-border bg-background p-2">
              {availableLayers.length === 0 ? (
                <span className="text-xs text-muted-foreground italic p-2">Belum ada layer yang ter-load di peta.</span>
              ) : (
                availableLayers.map((l) => {
                  const isSelected = selectedLayerId === l.id;
                  const style = l.style || { fillColor: "#3b82f6" };
                  return (
                    <button
                      key={l.id}
                      onClick={() => setSelectedLayerId(l.id!)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-all ${
                        isSelected
                          ? "bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-200"
                          : "hover:bg-white/5 text-card-foreground border border-transparent"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-all ${
                          isSelected
                            ? "bg-fuchsia-500 border-fuchsia-400"
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
          </div>

          {/* Attribute Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Pilih Field/Atribut (Opsional)
            </label>
            <select
              value={selectedAttribute}
              onChange={(e) => setSelectedAttribute(e.target.value)}
              className="w-full text-sm p-2.5 rounded-md bg-background border border-input text-foreground outline-none focus:ring-1 focus:ring-fuchsia-500 disabled:opacity-50"
              disabled={!selectedLayerId || availableAttributes.length === 0}
            >
              <option value="none">-- Lebur Semua Poligon (Dissolve All) --</option>
              {availableAttributes.map(attr => (
                <option key={attr} value={attr}>{attr}</option>
              ))}
            </select>
            <span className="text-[10px] text-muted-foreground">Pilih field untuk menggabungkan poligon yang memiliki nilai sama pada field tersebut.</span>
          </div>

          {/* Progress */}
          {progress && (
            <div className="flex items-center gap-2 text-xs text-fuchsia-400 bg-fuchsia-900/20 border border-fuchsia-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {/* Hasil inline */}
          {dissolveResult && !isProcessing && (
            <div className="flex flex-col gap-2 bg-fuchsia-950/30 border border-fuchsia-500/20 rounded-lg p-3 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Blend className="w-3 h-3" /> Hasil Dissolve
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDownloadResult}
                    className="p-1 hover:bg-fuchsia-500/20 rounded text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                    title="Unduh hasil dissolve"
                  >
                    <DownloadCloud className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { setDissolveResult(null); toast.info("Hasil dissolve dihapus dari peta."); }}
                    className="p-1 hover:bg-fuchsia-500/20 rounded text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                    title="Hapus hasil dari peta"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground">
                <span className="font-mono text-fuchsia-300">{dissolveResult.inputLayerName}</span>
                <span className="mx-1 text-fuchsia-500/50">by {dissolveResult.dissolveProperty || "ALL"}</span>
              </div>

              <div className="flex flex-col gap-1 text-xs mt-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jumlah Fitur Baru:</span>
                  <span className="font-mono font-bold text-fuchsia-300">{dissolveResult.featureCount} fitur</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WGS 84</span>
                  <span className="font-mono font-bold text-fuchsia-300">{formatAreaUnit(dissolveResult.areaMetrics.wgs84_sqm)}</span>
                </div>
                {dissolveResult.areaMetrics.utm_sqm && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UTM ({dissolveResult.areaMetrics.utm_epsg})</span>
                    <span className="font-mono">{formatAreaUnit(dissolveResult.areaMetrics.utm_sqm)}</span>
                  </div>
                )}
                {dissolveResult.areaMetrics.tm3_sqm && dissolveResult.areaMetrics.tm3_epsg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TM-3 ({dissolveResult.areaMetrics.tm3_epsg})</span>
                    <span className="font-mono">{formatAreaUnit(dissolveResult.areaMetrics.tm3_sqm)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>Tutup</Button>
          <Button
            onClick={runDissolveAnalysis}
            disabled={isProcessing || !selectedLayerId}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</span>
            ) : (
              <span className="flex items-center"><Blend className="w-4 h-4 mr-2" /> Jalankan Dissolve</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
