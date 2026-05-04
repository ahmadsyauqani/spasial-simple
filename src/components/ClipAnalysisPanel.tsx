"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { Scissors, Loader2, Trash2, DownloadCloud } from "lucide-react";
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
 * Clip Analysis — Potong layer input menggunakan batas layer pemotong (clip).
 * Identik dengan operasi Clip di ArcGIS:
 * - Input Layer: data yang ingin dipotong
 * - Clip Layer: batas area pemotong (cookie cutter)
 * - Hasil: bagian input yang jatuh di dalam clip
 */
export function ClipAnalysisButton() {
  const {
    layers,
    layerGeojsonCache,
    areaUnit,
    clipResult,
    setClipResult,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [inputLayerId, setInputLayerId] = useState("");
  const [clipLayerId, setClipLayerId] = useState("");
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

  const handleDownloadResult = () => {
    if (!clipResult?.geojson) return;
    const blob = new Blob([JSON.stringify(clipResult.geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clip_result_${clipResult.inputLayerName}_by_${clipResult.clipLayerName}.geojson`.replace(/\s+/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Hasil clip berhasil diunduh!");
  };

  const runClipAnalysis = async () => {
    if (!inputLayerId || !clipLayerId) {
      toast.error("Pilih Input Layer dan Clip Layer terlebih dahulu!");
      return;
    }
    if (inputLayerId === clipLayerId) {
      toast.error("Input Layer dan Clip Layer harus berbeda!");
      return;
    }

    const geojsonInput = layerGeojsonCache[inputLayerId];
    const geojsonClip = layerGeojsonCache[clipLayerId];

    if (!geojsonInput || !geojsonClip) {
      toast.error("Geometri layer belum ter-load. Pastikan kedua layer sudah tampil di peta.");
      return;
    }

    setIsProcessing(true);
    setProgress("Mempersiapkan data geometri...");

    // Jalankan di setTimeout agar UI tidak freeze
    setTimeout(() => {
      try {
        const inputFeatures = geojsonInput.features || [];
        const clipFeatures = geojsonClip.features || [];

        setProgress(`Memotong ${inputFeatures.length} fitur input dengan ${clipFeatures.length} batas clip...`);

        const clippedFeatures: any[] = [];

        // Untuk setiap fitur input, clip dengan semua fitur clip layer
        for (let i = 0; i < inputFeatures.length; i++) {
          const fInput = inputFeatures[i];
          if (!fInput.geometry || 
              (fInput.geometry.type !== "Polygon" && fInput.geometry.type !== "MultiPolygon")) {
            // Point dan Line langsung masuk jika berada di dalam clip area
            if (fInput.geometry && (fInput.geometry.type === "Point" || fInput.geometry.type === "MultiPoint")) {
              // Cek apakah titik berada di dalam salah satu clip polygon
              for (const fClip of clipFeatures) {
                if (!fClip.geometry || (fClip.geometry.type !== "Polygon" && fClip.geometry.type !== "MultiPolygon")) continue;
                try {
                  if (turf.booleanPointInPolygon(fInput, fClip)) {
                    clippedFeatures.push({ ...fInput });
                    break; // Sudah masuk, tidak perlu cek clip polygon lain
                  }
                } catch (e) {}
              }
            }
            // LineString: clip line by polygon
            if (fInput.geometry && (fInput.geometry.type === "LineString" || fInput.geometry.type === "MultiLineString")) {
              for (const fClip of clipFeatures) {
                if (!fClip.geometry || (fClip.geometry.type !== "Polygon" && fClip.geometry.type !== "MultiPolygon")) continue;
                try {
                  // Use lineSplit or booleanIntersects approach
                  const clipped = turf.lineSplit(fInput, fClip);
                  if (clipped && clipped.features) {
                    for (const seg of clipped.features) {
                      // Cek apakah midpoint segment berada di dalam clip polygon
                      try {
                        const mid = turf.along(seg, turf.length(seg) / 2);
                        if (turf.booleanPointInPolygon(mid, fClip)) {
                          clippedFeatures.push({
                            ...seg,
                            properties: { ...fInput.properties },
                          });
                        }
                      } catch (e) {}
                    }
                  }
                } catch (e) {}
              }
            }
            continue;
          }

          // Polygon vs Polygon clip: intersect
          for (let j = 0; j < clipFeatures.length; j++) {
            const fClip = clipFeatures[j];
            if (!fClip.geometry || 
                (fClip.geometry.type !== "Polygon" && fClip.geometry.type !== "MultiPolygon")) continue;

            try {
              const clipped = turf.intersect(turf.featureCollection([fInput, fClip]));
              if (clipped) {
                // Pertahankan properti input layer (bukan clip layer)
                clipped.properties = { ...fInput.properties };
                clippedFeatures.push(clipped);
              }
            } catch (e) {}
          }

          // Update progress setiap 10 fitur
          if (i % 10 === 0 && i > 0) {
            setProgress(`Memproses fitur ${i}/${inputFeatures.length}...`);
          }
        }

        if (clippedFeatures.length === 0) {
          toast.info("Tidak ada geometri yang berada di dalam area clip. Kedua layer tidak bersinggungan.");
          setClipResult(null);
          setIsProcessing(false);
          setProgress("");
          return;
        }

        setProgress("Menghitung luas hasil clip...");

        const resultFC = turf.featureCollection(clippedFeatures);
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
            const baseZone = 46 + Math.floor((tm3Index + 1) / 2);
            const subZone = (tm3Index % 2 === 0) ? 2 : 1;
            tm3_epsg = `${23826 + tm3Index} (Zona ${baseZone}-${subZone})`;
          }
        } catch (e) {}

        const inputLayerName = layers.find((l) => l.id === inputLayerId)?.name || "Input";
        const clipLayerName = layers.find((l) => l.id === clipLayerId)?.name || "Clip";

        setClipResult({
          geojson: resultFC,
          areaMetrics: { wgs84_sqm: totalAreaSqm, utm_sqm, utm_epsg, tm3_sqm, tm3_epsg },
          inputLayerName,
          clipLayerName,
          featureCount: clippedFeatures.length,
        });

        toast.success(`Clip berhasil! ${clippedFeatures.length} fitur terpotong. Total: ${formatUnit(totalAreaSqm)}`);
        setProgress("");
        setIsProcessing(false);
      } catch (e: any) {
        console.error("Clip error:", e);
        toast.error("Gagal menjalankan clip: " + e.message);
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
            : clipResult
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/10"
              : "border-border text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
        }`}
        disabled={availableLayers.length < 2}
        title="Clip Analysis"
      >
        <Scissors className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-emerald-400" />
            Clip Analysis
          </DialogTitle>
          <DialogDescription>
            Potong layer input menggunakan batas layer pemotong — seperti Clip di ArcGIS. Properti dari input layer akan dipertahankan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Input Layer */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              🗂️ Input Layer (Data yang Dipotong)
            </label>
            <select
              value={inputLayerId}
              onChange={(e) => setInputLayerId(e.target.value)}
              className="w-full text-sm p-2.5 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <option value="">— Pilih Layer —</option>
              {availableLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Visual separator */}
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-px w-12 bg-border" />
              <span className="text-[10px] font-bold uppercase tracking-widest">✂️ Dipotong Oleh</span>
              <div className="h-px w-12 bg-border" />
            </div>
          </div>

          {/* Clip Layer */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              📐 Clip Layer (Batas Pemotong)
            </label>
            <select
              value={clipLayerId}
              onChange={(e) => setClipLayerId(e.target.value)}
              className="w-full text-sm p-2.5 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <option value="">— Pilih Layer —</option>
              {availableLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Progress */}
          {progress && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {/* Hasil inline */}
          {clipResult && (
            <div className="flex flex-col gap-2 bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  ✂️ Hasil Clip
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDownloadResult}
                    className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
                    title="Unduh hasil clip"
                  >
                    <DownloadCloud className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => { setClipResult(null); toast.info("Hasil clip dihapus dari peta."); }}
                    className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
                    title="Hapus hasil dari peta"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground">
                <span className="font-mono text-emerald-300">{clipResult.inputLayerName}</span>
                {" ✂️ "}
                <span className="font-mono text-emerald-300">{clipResult.clipLayerName}</span>
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jumlah Fitur:</span>
                  <span className="font-mono font-bold text-emerald-300">{clipResult.featureCount} fitur</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WGS 84</span>
                  <span className="font-mono font-bold text-emerald-300">{formatUnit(clipResult.areaMetrics.wgs84_sqm)}</span>
                </div>
                {clipResult.areaMetrics.utm_sqm && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UTM ({clipResult.areaMetrics.utm_epsg})</span>
                    <span className="font-mono">{formatUnit(clipResult.areaMetrics.utm_sqm)}</span>
                  </div>
                )}
                {clipResult.areaMetrics.tm3_sqm && clipResult.areaMetrics.tm3_epsg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TM-3 ({clipResult.areaMetrics.tm3_epsg})</span>
                    <span className="font-mono">{formatUnit(clipResult.areaMetrics.tm3_sqm)}</span>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-emerald-400/70 mt-1">Klik area hijau di peta untuk detail per fitur.</p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>Tutup</Button>
          <Button
            onClick={runClipAnalysis}
            disabled={isProcessing || !inputLayerId || !clipLayerId}
            className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memotong...</span>
            ) : (
              <span className="flex items-center"><Scissors className="w-4 h-4 mr-2" /> Jalankan Clip</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
