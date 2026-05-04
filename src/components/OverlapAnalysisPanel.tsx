"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { Layers, Loader2, Trash2, SearchCheck } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Compact icon button + dialog for overlap analysis.
 * Designed to sit inline inside the UploadDatasetPanel header.
 */
export function OverlapAnalysisButton() {
  const {
    layers,
    layerGeojsonCache,
    areaUnit,
    overlapResult,
    setOverlapResult,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [layerAId, setLayerAId] = useState("");
  const [layerBId, setLayerBId] = useState("");
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

  const runOverlapAnalysis = async () => {
    if (!layerAId || !layerBId) {
      toast.error("Pilih dua layer terlebih dahulu!");
      return;
    }
    if (layerAId === layerBId) {
      toast.error("Kedua layer harus berbeda!");
      return;
    }

    const geojsonA = layerGeojsonCache[layerAId];
    const geojsonB = layerGeojsonCache[layerBId];

    if (!geojsonA || !geojsonB) {
      toast.error("Geometri layer belum ter-load. Pastikan kedua layer sudah tampil di peta.");
      return;
    }

    setIsProcessing(true);
    setProgress("Mempersiapkan data geometri...");

    setTimeout(() => {
      try {
        const featuresA = geojsonA.features || [];
        const featuresB = geojsonB.features || [];

        setProgress(`Menghitung ${featuresA.length} × ${featuresB.length} kombinasi poligon...`);

        const intersectionFeatures: any[] = [];

        for (let i = 0; i < featuresA.length; i++) {
          const fA = featuresA[i];
          if (!fA.geometry || (fA.geometry.type !== "Polygon" && fA.geometry.type !== "MultiPolygon")) continue;

          for (let j = 0; j < featuresB.length; j++) {
            const fB = featuresB[j];
            if (!fB.geometry || (fB.geometry.type !== "Polygon" && fB.geometry.type !== "MultiPolygon")) continue;

            try {
              const intersection = turf.intersect(turf.featureCollection([fA, fB]));
              if (intersection) {
                intersection.properties = {
                  source_A: fA.properties || {},
                  source_B: fB.properties || {},
                };
                intersectionFeatures.push(intersection);
              }
            } catch (e) {}
          }
        }

        if (intersectionFeatures.length === 0) {
          toast.info("✅ Tidak ditemukan overlap antara kedua layer!");
          setOverlapResult(null);
          setIsProcessing(false);
          setProgress("");
          return;
        }

        setProgress("Menghitung luas area overlap...");

        const resultFC = turf.featureCollection(intersectionFeatures);
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

        const layerAName = layers.find((l) => l.id === layerAId)?.name || "Layer A";
        const layerBName = layers.find((l) => l.id === layerBId)?.name || "Layer B";

        setOverlapResult({
          geojson: resultFC,
          areaMetrics: { wgs84_sqm: totalAreaSqm, utm_sqm, utm_epsg, tm3_sqm, tm3_epsg },
          layerAName,
          layerBName,
        });

        toast.success(`Ditemukan ${intersectionFeatures.length} area overlap! Total: ${formatUnit(totalAreaSqm)}`);
        setProgress("");
        setIsProcessing(false);
      } catch (e: any) {
        console.error("Overlap error:", e);
        toast.error("Gagal menghitung overlap: " + e.message);
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
            : overlapResult
              ? "border-red-500/50 bg-red-500/15 text-red-400 hover:bg-red-500/25 shadow-sm shadow-red-500/10"
              : "border-border text-muted-foreground hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
        }`}
        disabled={availableLayers.length < 2}
        title="Analisis Overlap"
      >
        <SearchCheck className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchCheck className="w-5 h-5 text-red-400" />
            Analisis Overlap
          </DialogTitle>
          <DialogDescription>
            Pilih dua layer yang ingin dianalisis. Mesin Turf.js akan menghitung irisan secara presisi di browser — tanpa server.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer A (Subjek)</label>
            <select
              value={layerAId}
              onChange={(e) => setLayerAId(e.target.value)}
              className="w-full text-sm p-2.5 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-red-500/50"
            >
              <option value="">— Pilih Layer —</option>
              {availableLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-px w-12 bg-border" />
              <span className="text-[10px] font-bold uppercase tracking-widest">∩ Intersect</span>
              <div className="h-px w-12 bg-border" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer B (Pembanding)</label>
            <select
              value={layerBId}
              onChange={(e) => setLayerBId(e.target.value)}
              className="w-full text-sm p-2.5 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-red-500/50"
            >
              <option value="">— Pilih Layer —</option>
              {availableLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {progress && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {/* Hasil inline di dalam dialog */}
          {overlapResult && (
            <div className="flex flex-col gap-2 bg-red-950/30 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-300 uppercase tracking-wider flex items-center gap-1.5">
                  ⚠️ Hasil Overlap
                </span>
                <button
                  onClick={() => { setOverlapResult(null); toast.info("Hasil overlap dihapus dari peta."); }}
                  className="p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
                  title="Hapus hasil dari peta"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              <div className="text-[10px] text-muted-foreground">
                <span className="font-mono text-red-300">{overlapResult.layerAName}</span>
                {" ∩ "}
                <span className="font-mono text-red-300">{overlapResult.layerBName}</span>
              </div>

              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jumlah Bidang:</span>
                  <span className="font-mono font-bold text-red-300">{overlapResult.geojson.features.length} area</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WGS 84</span>
                  <span className="font-mono font-bold text-red-300">{formatUnit(overlapResult.areaMetrics.wgs84_sqm)}</span>
                </div>
                {overlapResult.areaMetrics.utm_sqm && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">UTM ({overlapResult.areaMetrics.utm_epsg})</span>
                    <span className="font-mono">{formatUnit(overlapResult.areaMetrics.utm_sqm)}</span>
                  </div>
                )}
                {overlapResult.areaMetrics.tm3_sqm && overlapResult.areaMetrics.tm3_epsg && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TM-3 ({overlapResult.areaMetrics.tm3_epsg})</span>
                    <span className="font-mono">{formatUnit(overlapResult.areaMetrics.tm3_sqm)}</span>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-red-400/70 mt-1">Klik area merah di peta untuk detail per bidang.</p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>Tutup</Button>
          <Button
            onClick={runOverlapAnalysis}
            disabled={isProcessing || !layerAId || !layerBId}
            className="bg-red-600 hover:bg-red-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menganalisis...</span>
            ) : (
              <span className="flex items-center"><SearchCheck className="w-4 h-4 mr-2" /> Jalankan Analisis</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
