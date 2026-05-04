"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { CircleDot, Loader2, Trash2, DownloadCloud, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function BufferAnalysisButton() {
  const {
    layers,
    layerGeojsonCache,
    areaUnit,
    bufferResult,
    setBufferResult,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [bufferDistance, setBufferDistance] = useState<number>(100);
  const [bufferUnit, setBufferUnit] = useState<turf.Units>("meters");
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

  const handleDownloadResult = () => {
    if (!bufferResult?.geojson) return;
    const blob = new Blob([JSON.stringify(bufferResult.geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buffer_${bufferResult.inputLayerName}_${bufferResult.distance}${bufferResult.unit}.geojson`.replace(/\s+/g, "_");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Hasil buffer berhasil diunduh!");
  };

  const runBufferAnalysis = () => {
    if (!selectedLayerId) {
      toast.error("Pilih layer untuk di-buffer!");
      return;
    }

    if (bufferDistance <= 0) {
      toast.error("Jarak buffer harus lebih dari 0!");
      return;
    }

    setIsProcessing(true);
    setProgress("Membangun zona buffer...");

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

        // Jalankan buffer
        const buffered = turf.buffer(geojson, bufferDistance, { units: bufferUnit });
        
        if (!buffered) {
          throw new Error("Gagal membuat zona buffer.");
        }

        setProgress("Menghitung luas area buffer...");
        const totalAreaSqm = turf.area(buffered);

        let utm_sqm = totalAreaSqm * 0.9992;
        let tm3_sqm = totalAreaSqm * 0.9998;
        let utm_epsg: string | undefined;
        let tm3_epsg: string | undefined;

        try {
          const centroid = turf.centroid(buffered).geometry.coordinates;
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

        // Hitung jumlah fitur valid (tidak null)
        let featureCount = 0;
        if ((buffered as any).type === "FeatureCollection") {
            featureCount = (buffered as any).features.filter((f: any) => f !== null && f !== undefined).length;
        } else if ((buffered as any).type === "Feature") {
            featureCount = 1;
        }

        setBufferResult({
          geojson: buffered,
          areaMetrics: { wgs84_sqm: totalAreaSqm, utm_sqm, utm_epsg, tm3_sqm, tm3_epsg },
          inputLayerName: layerName,
          distance: bufferDistance,
          unit: bufferUnit,
          featureCount: featureCount,
        });

        toast.success(`Buffer berhasil! Dihasilkan ${featureCount} area zona kedekatan.`);
        setProgress("");
        setIsProcessing(false);
        setIsOpen(false);
      } catch (e: any) {
        console.error("Buffer error:", e);
        toast.error("Gagal menjalankan buffer: " + e.message);
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
            : bufferResult
              ? "border-sky-500/50 bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 shadow-sm shadow-sky-500/10"
              : "border-border text-muted-foreground hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-400"
        }`}
        disabled={availableLayers.length < 1}
        title="Buffer Analysis"
      >
        <CircleDot className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDot className="w-5 h-5 text-sky-400" />
            Buffer Analysis
          </DialogTitle>
          <DialogDescription>
            Membuat zona jangkauan (proximity) pada radius tertentu dari fitur input.
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
                          ? "bg-sky-500/15 border border-sky-500/30 text-sky-200"
                          : "hover:bg-white/5 text-card-foreground border border-transparent"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-all ${
                          isSelected
                            ? "bg-sky-500 border-sky-400"
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

          {/* Distance Input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Jarak Buffer
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={bufferDistance}
                onChange={(e) => setBufferDistance(Number(e.target.value))}
                min={0.01}
                step={1}
                className="bg-background font-mono"
              />
              <select
                value={bufferUnit}
                onChange={(e) => setBufferUnit(e.target.value as turf.Units)}
                className="h-10 px-3 rounded-md border border-input bg-background text-sm outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="meters">Meter (m)</option>
                <option value="kilometers">Kilometer (km)</option>
                <option value="miles">Mil (mi)</option>
                <option value="feet">Kaki (ft)</option>
              </select>
            </div>
          </div>

          {/* Progress */}
          {progress && (
            <div className="flex items-center gap-2 text-xs text-sky-400 bg-sky-900/20 border border-sky-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {/* Hasil inline */}
          {bufferResult && !isProcessing && (
            <div className="flex flex-col gap-2 bg-sky-950/30 border border-sky-500/20 rounded-lg p-3 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CircleDot className="w-3 h-3" /> Hasil Buffer
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDownloadResult}
                    className="p-1 hover:bg-sky-500/20 rounded text-sky-400 hover:text-sky-300 transition-colors"
                    title="Unduh hasil buffer"
                  >
                    <DownloadCloud className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { setBufferResult(null); toast.info("Hasil buffer dihapus dari peta."); }}
                    className="p-1 hover:bg-sky-500/20 rounded text-sky-400 hover:text-sky-300 transition-colors"
                    title="Hapus hasil dari peta"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground">
                <span className="font-mono text-sky-300">{bufferResult.inputLayerName}</span>
                <span className="mx-1 text-sky-500/50">+{bufferResult.distance} {bufferResult.unit}</span>
              </div>

              <div className="flex flex-col gap-1 text-xs mt-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WGS 84</span>
                  <span className="font-mono font-bold text-sky-300">{formatAreaUnit(bufferResult.areaMetrics.wgs84_sqm)}</span>
                </div>
                {bufferResult.areaMetrics.utm_sqm && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UTM ({bufferResult.areaMetrics.utm_epsg})</span>
                    <span className="font-mono">{formatAreaUnit(bufferResult.areaMetrics.utm_sqm)}</span>
                  </div>
                )}
                {bufferResult.areaMetrics.tm3_sqm && bufferResult.areaMetrics.tm3_epsg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TM-3 ({bufferResult.areaMetrics.tm3_epsg})</span>
                    <span className="font-mono">{formatAreaUnit(bufferResult.areaMetrics.tm3_sqm)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>Tutup</Button>
          <Button
            onClick={runBufferAnalysis}
            disabled={isProcessing || !selectedLayerId}
            className="bg-sky-600 hover:bg-sky-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</span>
            ) : (
              <span className="flex items-center"><CircleDot className="w-4 h-4 mr-2" /> Jalankan Buffer</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
