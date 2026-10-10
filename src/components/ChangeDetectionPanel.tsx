"use client";

import { useEffect, useMemo, useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import { toast } from "sonner";
import {
  Loader2,
  GitCompareArrows,
  MapPin,
  Save,
  Download,
  Trash2,
  Layers,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveLayer } from "@/lib/database";
import { runJob, geojsonToFile, type JobStatus } from "@/lib/pythonJobs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChangeClass =
  | "added"
  | "removed"
  | "unchanged"
  | "geometry_changed"
  | "attribute_changed"
  | "both_changed"
  | "split"
  | "merged";

type ChangeFeatureProps = {
  _change: ChangeClass;
  _id?: string | number | null;
  _iou?: number | null;
  _area_old_m2?: number | null;
  _area_new_m2?: number | null;
  _area_delta_m2?: number | null;
  _changed_fields?: string[];
  _matched_index?: number | null;
  [key: string]: unknown;
};

type ChangeSummary = {
  added: number;
  removed: number;
  unchanged: number;
  geometry_changed: number;
  attribute_changed: number;
  both_changed: number;
  split: number;
  merged: number;
  area_added_m2: number;
  area_removed_m2: number;
  area_net_delta_m2: number;
  old_count: number;
  new_count: number;
};

type ChangeDetectionResult = {
  geojson: { type: "FeatureCollection"; features: Array<{ type: "Feature"; geometry: any; properties: ChangeFeatureProps }> };
  summary: ChangeSummary;
  diff_geojson: { type: "FeatureCollection"; features: any[] };
};

const NO_ID_FIELD = "__none__";
const MAX_LISTED = 500;

// ---------------------------------------------------------------------------
// Labels / colours
// ---------------------------------------------------------------------------

const CLASS_META: Record<ChangeClass, { label: string; badge: string }> = {
  added: { label: "Bertambah", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20" },
  removed: { label: "Berkurang", badge: "bg-rose-500/15 text-rose-300 border-rose-400/20" },
  geometry_changed: { label: "Berubah geometri", badge: "bg-amber-500/15 text-amber-300 border-amber-400/20" },
  attribute_changed: { label: "Berubah atribut", badge: "bg-cyan-500/15 text-cyan-300 border-cyan-400/20" },
  both_changed: { label: "Berubah geometri & atribut", badge: "bg-orange-500/15 text-orange-300 border-orange-400/20" },
  unchanged: { label: "Tidak berubah", badge: "bg-white/5 text-white/60 border-white/10" },
  split: { label: "Pecah", badge: "bg-violet-500/15 text-violet-300 border-violet-400/20" },
  merged: { label: "Gabung", badge: "bg-violet-500/15 text-violet-300 border-violet-400/20" },
};

const CLASS_ORDER: ChangeClass[] = [
  "added",
  "removed",
  "geometry_changed",
  "attribute_changed",
  "both_changed",
  "split",
  "merged",
  "unchanged",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isPolygonLayerLike = (layer: { geometryType?: string }, fc: any) => {
  const t = fc?.features?.[0]?.geometry?.type;
  return layer.geometryType === "Polygon" || t === "Polygon" || t === "MultiPolygon";
};

const fmtNum = (n: number, digits = 0) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("id-ID", { maximumFractionDigits: digits });

const fmtArea = (m2: number | null | undefined) => {
  const v = Number(m2) || 0;
  const abs = Math.abs(v);
  if (abs >= 10000) return `${fmtNum(v / 10000, 3)} Ha`;
  return `${fmtNum(v, 1)} m²`;
};

const fmtDelta = (m2: number | null | undefined) => {
  const v = Number(m2) || 0;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${fmtArea(Math.abs(v))}`;
};

const csvEscape = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const s = Array.isArray(value) ? value.join("|") : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadBlob = (content: string, filename: string, mime: string) => {
  const blob = new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const safeFileName = (s: string) => s.replace(/[^\w\-]+/g, "_").slice(0, 80);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChangeDetectionButton() {
  const { layers, layerGeojsonCache, setZoomFeature, fetchLayers } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [oldLayerId, setOldLayerId] = useState("");
  const [newLayerId, setNewLayerId] = useState("");
  const [idField, setIdField] = useState<string>(NO_ID_FIELD);
  const [iouThreshold, setIouThreshold] = useState(0.9);
  const [minMatchIou, setMinMatchIou] = useState(0.3);
  const [compareAttributes, setCompareAttributes] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>(null);
  const [result, setResult] = useState<ChangeDetectionResult | null>(null);
  const [filter, setFilter] = useState<ChangeClass | null>(null);
  const [isSaving, setIsSaving] = useState<"result" | "diff" | null>(null);

  const polygonLayers = useMemo(
    () =>
      layers.filter((l) => {
        if (!l.id) return false;
        const fc = layerGeojsonCache[l.id];
        return !!fc && isPolygonLayerLike(l, fc);
      }),
    [layers, layerGeojsonCache],
  );

  const oldLayer = polygonLayers.find((l) => l.id === oldLayerId);
  const newLayer = polygonLayers.find((l) => l.id === newLayerId);
  const oldFc = oldLayerId ? layerGeojsonCache[oldLayerId] : null;
  const newFc = newLayerId ? layerGeojsonCache[newLayerId] : null;

  // Intersection of property keys of first features of both layers.
  const commonFields = useMemo(() => {
    const keysOf = (fc: any): string[] => Object.keys(fc?.features?.[0]?.properties || {});
    if (!oldFc || !newFc) return [];
    const newKeys = new Set(keysOf(newFc));
    return keysOf(oldFc).filter((k) => newKeys.has(k));
  }, [oldFc, newFc]);

  // Default id field: 'NIB' if present else first key.
  useEffect(() => {
    if (commonFields.length === 0) {
      setIdField(NO_ID_FIELD);
      return;
    }
    setIdField((prev) => {
      if (prev !== NO_ID_FIELD && commonFields.includes(prev)) return prev;
      const nib = commonFields.find((k) => k.toUpperCase() === "NIB");
      return nib ?? commonFields[0];
    });
  }, [commonFields]);

  const resetResult = () => {
    setResult(null);
    setFilter(null);
  };

  // ------------------------------------------------------------------
  // Run
  // ------------------------------------------------------------------

  const runDetection = async () => {
    if (!oldLayerId || !newLayerId) {
      toast.error("Pilih layer lama dan layer baru terlebih dahulu.");
      return;
    }
    if (oldLayerId === newLayerId) {
      toast.error("Layer lama dan layer baru tidak boleh sama.");
      return;
    }
    if (!oldFc?.features?.length || !newFc?.features?.length) {
      toast.error("Salah satu layer tidak memiliki fitur untuk dibandingkan.");
      return;
    }
    if (minMatchIou > iouThreshold) {
      toast.error("Ambang pencocokan geometri tidak boleh lebih besar dari ambang kesamaan geometri.");
      return;
    }

    setIsProcessing(true);
    resetResult();
    setProgress({ pct: 0, message: "Menyiapkan data snapshot..." });

    try {
      const fd = new FormData();
      fd.append("old_file", geojsonToFile(oldFc, "old.geojson"));
      fd.append("new_file", geojsonToFile(newFc, "new.geojson"));
      if (idField !== NO_ID_FIELD) fd.append("id_field", idField);
      fd.append("iou_threshold", String(iouThreshold));
      fd.append("min_match_iou", String(minMatchIou));
      fd.append("compare_attributes", compareAttributes ? "true" : "false");

      const onProgress = (s: JobStatus) => {
        const pct = Math.max(0, Math.min(100, Math.round((s.progress ?? 0) <= 1 ? (s.progress ?? 0) * 100 : s.progress)));
        const message =
          s.message ||
          (s.status === "queued"
            ? "Menunggu antrean server..."
            : s.status === "running"
              ? "Membandingkan bidang..."
              : s.status === "done"
                ? "Selesai."
                : "Memproses...");
        setProgress({ pct, message });
      };

      const res = (await runJob("/change-detection", fd, onProgress)) as ChangeDetectionResult;

      if (!res?.geojson?.features || !res?.summary) {
        throw new Error("Server mengembalikan hasil yang tidak lengkap.");
      }

      setResult(res);
      const s = res.summary;
      const changed = s.added + s.removed + s.geometry_changed + s.attribute_changed + s.both_changed + s.split + s.merged;
      if (changed === 0) {
        toast.success("Deteksi selesai. Tidak ada perubahan bidang yang terdeteksi.");
      } else {
        toast.success(`Deteksi selesai. ${fmtNum(changed)} perubahan ditemukan.`);
      }
    } catch (err: any) {
      console.error("Change detection error:", err);
      toast.error(`Gagal mendeteksi perubahan: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const layerBaseName = () => `${oldLayer?.name ?? "lama"} → ${newLayer?.name ?? "baru"}`;

  const saveResultLayer = async () => {
    if (!result) return;
    setIsSaving("result");
    try {
      await saveLayer(`Perubahan ${layerBaseName()}`, result.geojson, "Polygon");
      await fetchLayers();
      toast.success("Hasil deteksi perubahan disimpan sebagai layer baru.");
    } catch (err: any) {
      toast.error(`Gagal menyimpan layer: ${err?.message || err}`);
    } finally {
      setIsSaving(null);
    }
  };

  const saveDiffLayer = async () => {
    if (!result) return;
    if (!result.diff_geojson?.features?.length) {
      toast.error("Tidak ada selisih area (gain/loss) untuk disimpan.");
      return;
    }
    setIsSaving("diff");
    try {
      await saveLayer(`Selisih ${layerBaseName()}`, result.diff_geojson, "Polygon");
      await fetchLayers();
      toast.success("Selisih area (gain/loss) disimpan sebagai layer baru.");
    } catch (err: any) {
      toast.error(`Gagal menyimpan layer selisih: ${err?.message || err}`);
    } finally {
      setIsSaving(null);
    }
  };

  const downloadCsv = () => {
    if (!result) return;
    try {
      const header = ["_id", "_change", "_iou", "_area_old_m2", "_area_new_m2", "_area_delta_m2", "_changed_fields"];
      const rows = result.geojson.features.map((f) => {
        const p = f.properties || ({} as ChangeFeatureProps);
        return [
          csvEscape(p._id),
          csvEscape(p._change),
          csvEscape(p._iou ?? ""),
          csvEscape(p._area_old_m2 ?? ""),
          csvEscape(p._area_new_m2 ?? ""),
          csvEscape(p._area_delta_m2 ?? ""),
          csvEscape(p._changed_fields ?? []),
        ].join(",");
      });
      const csv = [header.join(","), ...rows].join("\n");
      downloadBlob(csv, `ringkasan_perubahan_${safeFileName(layerBaseName())}.csv`, "text/csv;charset=utf-8");
      toast.success("Ringkasan CSV diunduh.");
    } catch (err: any) {
      toast.error(`Gagal membuat CSV: ${err?.message || err}`);
    }
  };

  const zoomTo = (feature: any) => {
    if (!feature?.geometry) {
      toast.error("Fitur tidak memiliki geometri untuk di-zoom.");
      return;
    }
    setZoomFeature({ type: "Feature", properties: feature.properties || {}, geometry: feature.geometry });
  };

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------

  const summary = result?.summary;
  const changedTotal = summary
    ? summary.added + summary.removed + summary.geometry_changed + summary.attribute_changed + summary.both_changed + summary.split + summary.merged
    : 0;

  const listed = useMemo(() => {
    if (!result) return [] as ChangeDetectionResult["geojson"]["features"];
    const feats = result.geojson.features;
    const filtered = filter ? feats.filter((f) => f.properties?._change === filter) : feats.filter((f) => f.properties?._change !== "unchanged");
    const source = filtered.length > 0 || filter ? filtered : feats;
    // Sort: biggest absolute area delta first, unchanged last.
    return [...source]
      .sort((a, b) => {
        const au = a.properties?._change === "unchanged" ? 1 : 0;
        const bu = b.properties?._change === "unchanged" ? 1 : 0;
        if (au !== bu) return au - bu;
        return Math.abs(Number(b.properties?._area_delta_m2) || 0) - Math.abs(Number(a.properties?._area_delta_m2) || 0);
      })
      .slice(0, MAX_LISTED);
  }, [result, filter]);

  const filteredTotal = useMemo(() => {
    if (!result) return 0;
    const feats = result.geojson.features;
    if (filter) return feats.filter((f) => f.properties?._change === filter).length;
    const changed = feats.filter((f) => f.properties?._change !== "unchanged").length;
    return changed > 0 ? changed : feats.length;
  }, [result, filter]);

  const classCount = (c: ChangeClass) => (summary ? Number(summary[c as keyof ChangeSummary]) || 0 : 0);

  const disabled = polygonLayers.length < 2;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const selectClass =
    "w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-violet-500/50";

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all outline-none ${
          disabled
            ? "border-border/40 text-muted-foreground/30 cursor-not-allowed"
            : result
              ? "border-violet-500/50 bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 shadow-sm shadow-violet-500/10"
              : "border-border text-muted-foreground hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-400"
        }`}
        disabled={disabled}
        title={disabled ? "Deteksi Perubahan Bidang (butuh minimal 2 layer poligon)" : "Deteksi Perubahan Bidang"}
      >
        <GitCompareArrows className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="w-[min(1100px,calc(100vw-1rem))] max-w-6xl sm:max-w-6xl overflow-hidden bg-card text-card-foreground border-border max-h-[calc(100dvh-2rem)] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5 text-violet-400" />
            Deteksi Perubahan Bidang
          </DialogTitle>
          <DialogDescription>
            Bandingkan dua snapshot layer bidang tanah untuk menemukan bidang yang bertambah, berkurang, berubah geometri/atribut, pecah, atau gabung.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
          {/* ------------------------------------------------------------ */}
          {/* LEFT: inputs                                                   */}
          {/* ------------------------------------------------------------ */}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer lama (snapshot awal)</label>
                <select
                  value={oldLayerId}
                  onChange={(e) => {
                    setOldLayerId(e.target.value);
                    resetResult();
                  }}
                  className={selectClass}
                  disabled={isProcessing}
                >
                  <option value="">— Pilih Layer —</option>
                  {polygonLayers.map((l) => (
                    <option key={l.id} value={l.id} disabled={l.id === newLayerId}>
                      {l.name} ({layerGeojsonCache[l.id!]?.features?.length ?? 0} fitur)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer baru (snapshot terbaru)</label>
                <select
                  value={newLayerId}
                  onChange={(e) => {
                    setNewLayerId(e.target.value);
                    resetResult();
                  }}
                  className={selectClass}
                  disabled={isProcessing}
                >
                  <option value="">— Pilih Layer —</option>
                  {polygonLayers.map((l) => (
                    <option key={l.id} value={l.id} disabled={l.id === oldLayerId}>
                      {l.name} ({layerGeojsonCache[l.id!]?.features?.length ?? 0} fitur)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Field ID bidang (NIB)</label>
              <select
                value={idField}
                onChange={(e) => {
                  setIdField(e.target.value);
                  resetResult();
                }}
                className={selectClass}
                disabled={isProcessing || !oldFc || !newFc}
              >
                <option value={NO_ID_FIELD}>(tanpa ID — cocokkan geometri)</option>
                {commonFields.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground">
                {oldFc && newFc
                  ? commonFields.length > 0
                    ? `${commonFields.length} field yang sama ditemukan pada kedua layer.`
                    : "Tidak ada field yang sama. Pencocokan akan dilakukan berdasarkan geometri."
                  : "Pilih kedua layer untuk melihat field yang tersedia."}
              </span>
            </div>

            <div className="flex flex-col gap-4 border-t border-b border-border/50 py-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ambang kesamaan geometri</label>
                  <span className="text-xs font-bold text-violet-300">{Math.round(iouThreshold * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={iouThreshold}
                  onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
                  disabled={isProcessing}
                  className="w-full accent-violet-500"
                />
                <span className="text-[10px] text-muted-foreground">
                  IoU di atas nilai ini dianggap geometri <b>tidak berubah</b>. Semakin tinggi, semakin sensitif terhadap pergeseran kecil.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ambang pencocokan geometri</label>
                  <span className="text-xs font-bold text-violet-300">{Math.round(minMatchIou * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.01}
                  value={minMatchIou}
                  onChange={(e) => setMinMatchIou(parseFloat(e.target.value))}
                  disabled={isProcessing}
                  className="w-full accent-violet-500"
                />
                <span className="text-[10px] text-muted-foreground">
                  IoU minimum agar dua bidang dianggap <b>bidang yang sama</b> saat ID tidak tersedia/tidak cocok. Di bawah nilai ini dianggap bertambah/berkurang.
                </span>
              </div>

              <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={compareAttributes}
                  onChange={(e) => setCompareAttributes(e.target.checked)}
                  disabled={isProcessing}
                  className="mt-0.5 accent-violet-500"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">Bandingkan atribut</span>
                  <span className="text-xs text-muted-foreground">Tandai bidang yang nilai atributnya berubah meskipun geometrinya sama.</span>
                </div>
              </label>
            </div>

            {oldFc && newFc && (
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-2">
                  <span className="block uppercase tracking-wider text-white/45">Snapshot awal</span>
                  <strong className="mt-0.5 block text-sm text-white/85 truncate" title={oldLayer?.name}>{oldLayer?.name}</strong>
                  <span className="text-white/55">{fmtNum(oldFc.features?.length ?? 0)} bidang</span>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-2">
                  <span className="block uppercase tracking-wider text-white/45">Snapshot terbaru</span>
                  <strong className="mt-0.5 block text-sm text-white/85 truncate" title={newLayer?.name}>{newLayer?.name}</strong>
                  <span className="text-white/55">{fmtNum(newFc.features?.length ?? 0)} bidang</span>
                </div>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------ */}
          {/* RIGHT: progress + result                                       */}
          {/* ------------------------------------------------------------ */}
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            {progress && (
              <div className="flex flex-col gap-2 text-xs text-violet-300 bg-violet-900/20 border border-violet-500/20 rounded-md p-2.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="flex-1 truncate">{progress.message}</span>
                  <span className="font-bold">{progress.pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-black/30 overflow-hidden">
                  <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${progress.pct}%` }} />
                </div>
              </div>
            )}

            {result && summary ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-violet-500/20 bg-violet-950/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
                    <GitCompareArrows className="h-3.5 w-3.5" /> Hasil Deteksi
                  </span>
                  <button onClick={resetResult} className="p-1 hover:bg-violet-500/20 rounded text-violet-400" title="Hapus hasil">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Summary tiles */}
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <SummaryTile label="Bertambah" value={summary.added} tone="emerald" active={filter === "added"} onClick={() => setFilter(filter === "added" ? null : "added")} />
                  <SummaryTile label="Berkurang" value={summary.removed} tone="rose" active={filter === "removed"} onClick={() => setFilter(filter === "removed" ? null : "removed")} />
                  <SummaryTile label="Berubah geometri" value={summary.geometry_changed + summary.both_changed} tone="amber" active={filter === "geometry_changed"} onClick={() => setFilter(filter === "geometry_changed" ? null : "geometry_changed")} />
                  <SummaryTile label="Berubah atribut" value={summary.attribute_changed + summary.both_changed} tone="cyan" active={filter === "attribute_changed"} onClick={() => setFilter(filter === "attribute_changed" ? null : "attribute_changed")} />
                  <SummaryTile label="Tidak berubah" value={summary.unchanged} tone="muted" active={filter === "unchanged"} onClick={() => setFilter(filter === "unchanged" ? null : "unchanged")} />
                  <SummaryTile label="Pecah / Gabung" value={summary.split + summary.merged} tone="violet" active={filter === "split" || filter === "merged"} onClick={() => setFilter(filter === "split" ? "merged" : filter === "merged" ? null : "split")} />
                </div>

                {/* Area totals */}
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <div className="rounded-lg border border-emerald-400/15 bg-emerald-500/10 px-2 py-1.5">
                    <span className="block uppercase tracking-wider text-emerald-200/60">Luas bertambah</span>
                    <strong className="block text-xs text-emerald-200">{fmtArea(summary.area_added_m2)}</strong>
                  </div>
                  <div className="rounded-lg border border-rose-400/15 bg-rose-500/10 px-2 py-1.5">
                    <span className="block uppercase tracking-wider text-rose-200/60">Luas berkurang</span>
                    <strong className="block text-xs text-rose-200">{fmtArea(summary.area_removed_m2)}</strong>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-1.5">
                    <span className="block uppercase tracking-wider text-white/45">Selisih bersih</span>
                    <strong className="block text-xs text-white/85">{fmtDelta(summary.area_net_delta_m2)}</strong>
                  </div>
                </div>

                <div className="text-[10px] text-violet-200/75">
                  {fmtNum(summary.old_count)} bidang (awal) → {fmtNum(summary.new_count)} bidang (terbaru). {fmtNum(changedTotal)} perubahan terdeteksi.
                </div>

                {/* Filter chips */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilter(null)}
                    className={`rounded-full border px-2 py-1 text-[9px] font-bold transition-colors ${
                      filter === null ? "border-violet-400/40 bg-violet-500/20 text-violet-200" : "border-white/10 bg-black/20 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    Semua perubahan
                  </button>
                  {CLASS_ORDER.map((c) => {
                    const count = classCount(c);
                    if (count === 0) return null;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFilter(filter === c ? null : c)}
                        className={`rounded-full border px-2 py-1 text-[9px] font-bold transition-colors ${
                          filter === c ? CLASS_META[c].badge : "border-white/10 bg-black/20 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        {CLASS_META[c].label} <b>{fmtNum(count)}</b>
                      </button>
                    );
                  })}
                </div>

                {/* Feature list */}
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {listed.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-white/50 p-4 text-center">
                      Tidak ada bidang pada kategori ini.
                    </div>
                  ) : (
                    listed.map((f, idx) => {
                      const p = f.properties || ({} as ChangeFeatureProps);
                      const meta = CLASS_META[p._change] ?? CLASS_META.unchanged;
                      const iou = typeof p._iou === "number" ? p._iou : null;
                      const fields = Array.isArray(p._changed_fields) ? p._changed_fields : [];
                      return (
                        <div key={`${p._change}-${p._id ?? idx}-${idx}`} className="rounded-lg border border-violet-500/20 bg-black/20 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${meta.badge}`}>{meta.label}</span>
                                <span className="text-[11px] font-bold text-white/85 truncate">
                                  {p._id !== undefined && p._id !== null && String(p._id) !== "" ? String(p._id) : "(tanpa ID)"}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/55">
                                {iou !== null && (
                                  <span>
                                    IoU: <b className="text-white/80">{fmtNum(iou * 100, 1)}%</b>
                                  </span>
                                )}
                                {p._area_old_m2 !== undefined && p._area_old_m2 !== null && (
                                  <span>
                                    Luas awal: <b className="text-white/80">{fmtArea(p._area_old_m2)}</b>
                                  </span>
                                )}
                                {p._area_new_m2 !== undefined && p._area_new_m2 !== null && (
                                  <span>
                                    Luas baru: <b className="text-white/80">{fmtArea(p._area_new_m2)}</b>
                                  </span>
                                )}
                                {p._area_delta_m2 !== undefined && p._area_delta_m2 !== null && Number(p._area_delta_m2) !== 0 && (
                                  <span>
                                    Δ Luas:{" "}
                                    <b className={Number(p._area_delta_m2) > 0 ? "text-emerald-300" : "text-rose-300"}>{fmtDelta(p._area_delta_m2)}</b>
                                  </span>
                                )}
                              </div>
                              {fields.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {fields.slice(0, 8).map((fld) => (
                                    <span key={fld} className="rounded bg-cyan-500/10 border border-cyan-400/15 px-1.5 py-0.5 text-[9px] text-cyan-200">
                                      {fld}
                                    </span>
                                  ))}
                                  {fields.length > 8 && <span className="text-[9px] text-white/45">+{fields.length - 8} lainnya</span>}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => zoomTo(f)}
                              className="shrink-0 flex items-center gap-1 rounded-md border border-indigo-400/20 bg-indigo-500/10 px-2 py-1 text-[10px] font-bold text-indigo-300 hover:bg-indigo-500/20"
                            >
                              <MapPin className="h-3 w-3" /> Zoom
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {filteredTotal > MAX_LISTED && (
                    <div className="text-center text-[10px] text-white/45 py-1">
                      Menampilkan {fmtNum(MAX_LISTED)} dari {fmtNum(filteredTotal)} bidang. Simpan sebagai layer atau unduh CSV untuk melihat semuanya.
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 border-t border-violet-500/15 pt-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={isSaving !== null}
                      onClick={saveResultLayer}
                      className="flex items-center gap-1 rounded-md border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
                    >
                      {isSaving === "result" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Simpan hasil sebagai layer
                    </button>
                    <button
                      type="button"
                      disabled={isSaving !== null || !result.diff_geojson?.features?.length}
                      onClick={saveDiffLayer}
                      className="flex items-center gap-1 rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      {isSaving === "diff" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />} Simpan selisih area (gain/loss)
                    </button>
                    <button
                      type="button"
                      onClick={downloadCsv}
                      className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <Download className="h-3 w-3" /> Unduh ringkasan (CSV)
                    </button>
                  </div>
                  <div className="flex items-start gap-1.5 text-[10px] text-white/50">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      Setelah disimpan, atur simbologi layer berdasarkan field <code className="text-violet-200">_change</code> agar setiap kategori perubahan tampil dengan warna berbeda.
                      Layer selisih menggunakan field <code className="text-violet-200">_diff</code> (gain/loss).
                    </span>
                  </div>
                </div>
              </div>
            ) : oldLayerId && newLayerId ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-violet-300/20 bg-violet-500/[0.04] p-6 text-center">
                <GitCompareArrows className="h-8 w-8 text-violet-300/70" />
                <strong className="mt-3 text-sm text-white/85">Siap membandingkan snapshot</strong>
                <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-white/45">
                  Jalankan deteksi untuk melihat bidang yang bertambah, berkurang, berubah, pecah, atau gabung antara kedua snapshot.
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 p-6 text-center">
                <Layers className="h-8 w-8 text-white/30" />
                <strong className="mt-3 text-sm text-white/70">Pilih dua layer poligon</strong>
                <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-white/45">
                  Pilih layer snapshot awal dan snapshot terbaru di panel kiri untuk memulai.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>
            Tutup
          </Button>
          <Button
            onClick={runDetection}
            disabled={isProcessing || !oldLayerId || !newLayerId || oldLayerId === newLayerId}
            className="bg-violet-600 hover:bg-violet-700 text-white min-w-[180px]"
          >
            {isProcessing ? (
              <span className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mendeteksi...
              </span>
            ) : (
              <span className="flex items-center">
                <GitCompareArrows className="w-4 h-4 mr-2" /> Jalankan Deteksi
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Summary tile
// ---------------------------------------------------------------------------

type Tone = "emerald" | "rose" | "amber" | "cyan" | "violet" | "muted";

const TONE_CLASSES: Record<Tone, { box: string; label: string; value: string; active: string }> = {
  emerald: { box: "border-emerald-400/15 bg-emerald-500/10", label: "text-emerald-200/60", value: "text-emerald-200", active: "ring-1 ring-emerald-400/60" },
  rose: { box: "border-rose-400/15 bg-rose-500/10", label: "text-rose-200/60", value: "text-rose-200", active: "ring-1 ring-rose-400/60" },
  amber: { box: "border-amber-400/15 bg-amber-500/10", label: "text-amber-200/60", value: "text-amber-200", active: "ring-1 ring-amber-400/60" },
  cyan: { box: "border-cyan-400/15 bg-cyan-500/10", label: "text-cyan-200/60", value: "text-cyan-200", active: "ring-1 ring-cyan-400/60" },
  violet: { box: "border-violet-400/15 bg-violet-500/10", label: "text-violet-200/60", value: "text-violet-200", active: "ring-1 ring-violet-400/60" },
  muted: { box: "border-white/10 bg-black/15", label: "text-white/45", value: "text-white/85", active: "ring-1 ring-white/40" },
};

function SummaryTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2 py-2 text-left transition-all hover:brightness-110 ${t.box} ${active ? t.active : ""}`}
    >
      <span className={`block uppercase tracking-wider ${t.label}`}>{label}</span>
      <strong className={`mt-0.5 block text-base ${t.value}`}>{fmtNum(value)}</strong>
    </button>
  );
}
