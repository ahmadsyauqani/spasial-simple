"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { Loader2, Trash2, Scissors, MapPin } from "lucide-react";
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
 * Menghitung Thinness Ratio (Polsby-Popper):
 * ratio = (4π × area) / perimeter²
 * Lingkaran = 1.0, Sliver mendekati 0.0
 */
function thinnessRatio(feature: any): number {
  try {
    const area = turf.area(feature);
    const perimeter = turf.length(feature, { units: "meters" });
    if (perimeter === 0) return 0;
    return (4 * Math.PI * area) / (perimeter * perimeter);
  } catch {
    return 1;
  }
}

/**
 * Menghitung rasio lebar/panjang dari Minimum Bounding Rectangle
 */
function bboxElongationRatio(feature: any): number {
  try {
    const bbox = turf.bbox(feature);
    const width = Math.abs(bbox[2] - bbox[0]);
    const height = Math.abs(bbox[3] - bbox[1]);
    if (width === 0 || height === 0) return 0;
    return Math.min(width, height) / Math.max(width, height);
  } catch {
    return 1;
  }
}

/**
 * Buffer-Collapse test: apakah polygon hilang setelah negative buffer?
 */
function isCollapsible(feature: any, distanceMeters: number): boolean {
  try {
    // Konversi meter ke derajat (kasar)
    const distDeg = distanceMeters / 111320;
    const buffered = turf.buffer(feature, -distDeg, { units: "degrees" });
    if (!buffered || !buffered.geometry) return true;
    const area = turf.area(buffered);
    return area < 0.01; // Hampir hilang
  } catch {
    return true;
  }
}

export function SliverDetectionButton() {
  const {
    layers,
    layerGeojsonCache,
    areaUnit,
    sliverResult,
    setSliverResult,
    setZoomFeature,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [layerAId, setLayerAId] = useState("");
  const [layerBId, setLayerBId] = useState("");
  const [mode, setMode] = useState<"gap" | "overlap" | "both">("both");
  const [maxAreaSqm, setMaxAreaSqm] = useState(100);
  const [thinnessThreshold, setThinnessThreshold] = useState(0.3);
  const [collapseDistance, setCollapseDistance] = useState(0.5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");

  const formatUnit = (sqm: number) => {
    if (areaUnit === "Ha")
      return `${(sqm / 10000).toLocaleString("id-ID", { maximumFractionDigits: 5 })} Ha`;
    if (areaUnit === "km2")
      return `${(sqm / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 5 })} km²`;
    return `${sqm.toLocaleString("id-ID", { maximumFractionDigits: 5 })} m²`;
  };

  const availableLayers = layers.filter((l) => l.id && layerGeojsonCache[l.id]);

  const runSliverDetection = async () => {
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
    setProgress("Mempersiapkan analisis sliver...");

    // setTimeout agar UI tidak freeze
    setTimeout(() => {
      try {
        const sliverFeatures: any[] = [];
        const featuresA = (geojsonA.features || []).filter(
          (f: any) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
        );
        const featuresB = (geojsonB.features || []).filter(
          (f: any) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
        );

        // ═══════════════════════════════════════════
        // PHASE 1: Gap Detection (celah antar polygon)
        // ═══════════════════════════════════════════
        if (mode === "gap" || mode === "both") {
          setProgress(`Mendeteksi celah (gap) antar ${featuresA.length} × ${featuresB.length} polygon...`);

          for (let i = 0; i < featuresA.length; i++) {
            for (let j = 0; j < featuresB.length; j++) {
              try {
                // Cek apakah mereka berdekatan (bbox bersinggungan)
                const bboxA = turf.bbox(featuresA[i]);
                const bboxB = turf.bbox(featuresB[j]);
                // Buffer bbox sedikit untuk menangkap gap kecil
                const margin = 0.001; // ~111m
                if (
                  bboxA[2] + margin < bboxB[0] ||
                  bboxB[2] + margin < bboxA[0] ||
                  bboxA[3] + margin < bboxB[1] ||
                  bboxB[3] + margin < bboxA[1]
                ) continue; // Terlalu jauh, skip

                const diff = turf.difference(turf.featureCollection([featuresA[i], featuresB[j]]));
                if (diff) {
                  const area = turf.area(diff);
                  if (area > 0 && area < maxAreaSqm) {
                    const tr = thinnessRatio(diff);
                    const br = bboxElongationRatio(diff);
                    const collapsed = isCollapsible(diff, collapseDistance);

                    if (tr < thinnessThreshold || br < 0.1 || collapsed) {
                      sliverFeatures.push({
                        ...diff,
                        properties: {
                          sliver_type: "gap",
                           area_sqm: area,
                           thinness_ratio: tr,
                           bbox_ratio: br,
                          collapsed: collapsed,
                          source_A: featuresA[i].properties?.nama || featuresA[i].properties?.NAMA || `A-${i + 1}`,
                          source_B: featuresB[j].properties?.nama || featuresB[j].properties?.NAMA || `B-${j + 1}`,
                        },
                      });
                    }
                  }
                }
              } catch (e) {
                // Skip invalid geometry pairs
              }
            }
          }
        }

        // ═══════════════════════════════════════════
        // PHASE 2: Overlap Sliver Detection
        // ═══════════════════════════════════════════
        if (mode === "overlap" || mode === "both") {
          setProgress(`Mendeteksi overlap tipis antar polygon...`);

          for (let i = 0; i < featuresA.length; i++) {
            for (let j = 0; j < featuresB.length; j++) {
              try {
                const intersection = turf.intersect(turf.featureCollection([featuresA[i], featuresB[j]]));
                if (intersection) {
                  const area = turf.area(intersection);
                  if (area > 0 && area < maxAreaSqm) {
                    const tr = thinnessRatio(intersection);
                    const br = bboxElongationRatio(intersection);
                    const collapsed = isCollapsible(intersection, collapseDistance);

                    if (tr < thinnessThreshold || br < 0.1 || collapsed) {
                      sliverFeatures.push({
                        ...intersection,
                        properties: {
                          sliver_type: "overlap",
                           area_sqm: area,
                           thinness_ratio: tr,
                           bbox_ratio: br,
                          collapsed: collapsed,
                          source_A: featuresA[i].properties?.nama || featuresA[i].properties?.NAMA || `A-${i + 1}`,
                          source_B: featuresB[j].properties?.nama || featuresB[j].properties?.NAMA || `B-${j + 1}`,
                        },
                      });
                    }
                  }
                }
              } catch (e) {
                // Skip invalid geometry pairs
              }
            }
          }
        }

        // ═══════════════════════════════════════════
        // PHASE 3: Compile Results
        // ═══════════════════════════════════════════
        if (sliverFeatures.length === 0) {
          toast.success("✅ Tidak ditemukan sliver antara kedua layer! Data sudah bersih.");
          setSliverResult(null);
          setIsProcessing(false);
          setProgress("");
          return;
        }

        setProgress("Menghitung statistik...");

        const resultFC = turf.featureCollection(sliverFeatures);
        const totalAreaSqm = sliverFeatures.reduce((sum, f) => sum + (f.properties?.area_sqm || 0), 0);
        const gaps = sliverFeatures.filter((f) => f.properties?.sliver_type === "gap").length;
        const overlaps = sliverFeatures.filter((f) => f.properties?.sliver_type === "overlap").length;
        const avgThinness =
          sliverFeatures.reduce((sum, f) => sum + (f.properties?.thinness_ratio || 0), 0) / sliverFeatures.length;

        // Area metrics
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
            const subZone = tm3Index % 2 === 0 ? 2 : 1;
            tm3_epsg = `${23826 + tm3Index} (Zona ${baseZone}-${subZone})`;
          }
        } catch (e) {}

        const layerAName = layers.find((l) => l.id === layerAId)?.name || "Layer A";
        const layerBName = layers.find((l) => l.id === layerBId)?.name || "Layer B";

        setSliverResult({
          geojson: resultFC,
          areaMetrics: { wgs84_sqm: totalAreaSqm, utm_sqm, utm_epsg, tm3_sqm, tm3_epsg },
          layerAName,
          layerBName,
          mode,
          stats: {
            totalSlivers: sliverFeatures.length,
            gaps,
            overlaps,
             avgThinness,
             totalAreaSqm,
          },
        });

        toast.success(`Ditemukan ${sliverFeatures.length} sliver! (${gaps} gap, ${overlaps} overlap)`);
        setProgress("");
        setIsProcessing(false);
      } catch (e: any) {
        console.error("Sliver detection error:", e);
        toast.error("Gagal mendeteksi sliver: " + e.message);
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
            : sliverResult
              ? "border-yellow-500/50 bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 shadow-sm shadow-yellow-500/10"
              : "border-border text-muted-foreground hover:border-yellow-500/40 hover:bg-yellow-500/10 hover:text-yellow-400"
        }`}
        disabled={availableLayers.length < 2}
        title="Deteksi Sliver"
      >
        <Scissors className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-yellow-400" />
            Deteksi Sliver (Polygon Tipis)
          </DialogTitle>
          <DialogDescription>
            Mendeteksi celah (gap) dan tumpang tindih tipis (overlap sliver) antar dua layer polygon menggunakan 4
            metode: Thinness Ratio, Gap/Overlap, Buffer-Collapse, dan Elongation Ratio.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Layer Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer A</label>
              <select
                value={layerAId}
                onChange={(e) => setLayerAId(e.target.value)}
                className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-yellow-500/50"
              >
                <option value="">— Pilih Layer —</option>
                {availableLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer B</label>
              <select
                value={layerBId}
                onChange={(e) => setLayerBId(e.target.value)}
                className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-yellow-500/50"
              >
                <option value="">— Pilih Layer —</option>
                {availableLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode Deteksi</label>
            <div className="grid grid-cols-3 gap-2">
              {(["both", "gap", "overlap"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                    mode === m
                      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                      : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-yellow-500/10"
                  }`}
                >
                  {m === "both" ? "Gap + Overlap" : m === "gap" ? "Gap Saja" : "Overlap Saja"}
                </button>
              ))}
            </div>
          </div>

          {/* Thresholds */}
          <div className="grid grid-cols-3 gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Maks. Area (m²)
              </label>
              <input
                type="number"
                value={maxAreaSqm}
                onChange={(e) => setMaxAreaSqm(parseFloat(e.target.value) || 100)}
                className="text-sm p-1.5 rounded-md bg-background border border-border text-foreground w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Thinness &lt; 
              </label>
              <input
                type="number"
                step="0.05"
                value={thinnessThreshold}
                onChange={(e) => setThinnessThreshold(parseFloat(e.target.value) || 0.3)}
                className="text-sm p-1.5 rounded-md bg-background border border-border text-foreground w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                Collapse (m)
              </label>
              <input
                type="number"
                step="0.1"
                value={collapseDistance}
                onChange={(e) => setCollapseDistance(parseFloat(e.target.value) || 0.5)}
                className="text-sm p-1.5 rounded-md bg-background border border-border text-foreground w-full"
              />
            </div>
          </div>

          {/* Progress */}
          {progress && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {/* Results */}
          {sliverResult && (
            <div className="flex flex-col gap-2 bg-yellow-950/30 border border-yellow-500/20 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-yellow-300 uppercase tracking-wider flex items-center gap-1.5">
                  ⚠️ Sliver Terdeteksi
                </span>
                <button
                  onClick={() => {
                    setSliverResult(null);
                    toast.info("Hasil sliver dihapus dari peta.");
                  }}
                  className="p-1 hover:bg-yellow-500/20 rounded text-yellow-400 hover:text-yellow-300 transition-colors"
                  title="Hapus hasil dari peta"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              <div className="text-[10px] text-muted-foreground">
                <span className="font-mono text-yellow-300">{sliverResult.layerAName}</span>
                {" ↔ "}
                <span className="font-mono text-yellow-300">{sliverResult.layerBName}</span>
              </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Sliver:</span>
                  <span className="font-mono font-bold text-yellow-300">{sliverResult.stats.totalSlivers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Area:</span>
                  <span className="font-mono font-bold text-yellow-300">
                    {formatUnit(sliverResult.stats.totalAreaSqm)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gap:</span>
                  <span className="font-mono text-orange-400">{sliverResult.stats.gaps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overlap:</span>
                  <span className="font-mono text-red-400">{sliverResult.stats.overlaps}</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">Avg. Thinness Ratio:</span>
                  <span className="font-mono text-yellow-200">{sliverResult.stats.avgThinness}</span>
                  </div>
                </div>

                <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto border-t border-yellow-500/15 pt-2">
                  {sliverResult.geojson.features.map((feature: any, index: number) => {
                    const props = feature.properties || {};
                    return (
                      <div key={index} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
                        <div className="min-w-0 text-[10px]">
                          <div className={props.sliver_type === 'gap' ? 'font-bold text-orange-300' : 'font-bold text-red-300'}>{props.sliver_type === 'gap' ? 'Gap' : 'Overlap'} #{index + 1}</div>
                          <div className="truncate text-white/50">Area: {Number(props.area_sqm || 0).toLocaleString('id-ID', { minimumFractionDigits: 5, maximumFractionDigits: 5 })} m² · Thinness: {Number(props.thinness_ratio || 0).toFixed(5)}</div>
                        </div>
                        <button type="button" onClick={() => setZoomFeature(feature)} className="flex shrink-0 items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-1 text-[9px] font-bold text-indigo-300 hover:bg-indigo-500/25" title="Zoom ke sliver"><MapPin className="h-3 w-3" /> Zoom</button>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[10px] text-yellow-400/70 mt-1">
                 Klik Zoom untuk fokus ke sliver tertentu. Popup di peta menampilkan metrik lengkap.
                </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>
            Tutup
          </Button>
          <Button
            onClick={runSliverDetection}
            disabled={isProcessing || !layerAId || !layerBId}
            className="bg-yellow-600 hover:bg-yellow-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menganalisis...
              </span>
            ) : (
              <span className="flex items-center">
                <Scissors className="w-4 h-4 mr-2" /> Deteksi Sliver
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
