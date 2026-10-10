"use client";

import { useMemo, useState, useEffect } from "react";
import { useMapContext } from "@/lib/MapContext";
import { toast } from "sonner";
import {
  Loader2,
  Wrench,
  CheckSquare,
  Square,
  MapPin,
  Save,
  Download,
  Trash2,
  Sparkles,
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

// ---------- Types for the backend result ----------

type AutofixReport = {
  invalid_fixed?: number;
  vertices_snapped?: number;
  slivers_removed?: number;
  slivers_merged?: number;
  overlaps_fixed?: number;
  overlap_area_m2_total?: number;
  gaps_filled?: number;
  gap_area_m2_total?: number;
  features_in?: number;
  features_out?: number;
  crs_used_epsg?: number | string;
};

type AutofixChange = {
  feature_index?: number;
  id?: string | number | null;
  action?: string;
  detail?: string;
  area_delta_m2?: number;
};

type AutofixResult = {
  geojson: any;
  report: AutofixReport;
  changes: AutofixChange[];
};

const MAX_CHANGES_SHOWN = 500;

// ---------- Formatting helpers ----------

const formatCount = (value: number | undefined | null) =>
  (Number(value) || 0).toLocaleString("id-ID");

const formatArea = (m2: number | undefined | null) => {
  const value = Number(m2) || 0;
  if (Math.abs(value) > 10000) {
    return `${(value / 10000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} Ha`;
  }
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²`;
};

const formatAreaDelta = (m2: number | undefined | null) => {
  const value = Number(m2) || 0;
  if (value === 0) return "±0 m²";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatArea(Math.abs(value))}`;
};

const actionBadgeClass = (action: string) => {
  const a = action.toLowerCase();
  if (a.includes("invalid") || a.includes("valid")) return "bg-rose-500/15 text-rose-300";
  if (a.includes("snap")) return "bg-indigo-500/15 text-indigo-300";
  if (a.includes("sliver")) return "bg-amber-500/15 text-amber-300";
  if (a.includes("overlap")) return "bg-orange-500/15 text-orange-300";
  if (a.includes("gap")) return "bg-cyan-500/15 text-cyan-300";
  return "bg-emerald-500/15 text-emerald-300";
};

/** Normalise backend progress (0–1 or 0–100) into integer percent. */
const toPercent = (raw: unknown) => {
  const n = Number(raw) || 0;
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
};

// ---------- Small presentational pieces (hoisted so inputs keep focus) ----------

function OptionCheckbox({
  label,
  checked,
  onToggle,
  description,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  description: string;
}) {
  return (
    <div
      className="flex items-start gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
      onClick={onToggle}
    >
      <div className="mt-0.5">
        {checked ? (
          <CheckSquare className="w-4 h-4 text-emerald-500" />
        ) : (
          <Square className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase">{label}</label>
      <input
        type="number"
        step={step ?? 0.1}
        min={min ?? 0}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-emerald-500/50"
      />
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function TopologyAutofixButton() {
  const { layers, layerGeojsonCache, setZoomFeature, fetchLayers,
    selectedLayerId: focusedLayerId,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [targetLayerId, setTargetLayerId] = useState("");
  // Pre-fill from the layer focused in the Layer Manager when the dialog opens.
  useEffect(() => {
    if (isOpen && focusedLayerId && !targetLayerId) setTargetLayerId(focusedLayerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, focusedLayerId]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
  const [result, setResult] = useState<AutofixResult | null>(null);

  // Settings
  const [options, setOptions] = useState({
    fix_invalid: true,
    snap: true,
    remove_slivers: true,
    fix_overlaps: true,
    fix_gaps: true,
  });
  const [snapToleranceM, setSnapToleranceM] = useState(0.5);
  const [sliverMinAreaM2, setSliverMinAreaM2] = useState(1);
  const [sliverThinness, setSliverThinness] = useState(0.05);
  const [idField, setIdField] = useState("NIB");

  const toggleOption = (key: keyof typeof options) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isPolygonFc = (layer: { geometryType?: string; id?: string }, fc: any) => {
    if (layer.geometryType === "Polygon") return true;
    const firstType = fc?.features?.[0]?.geometry?.type;
    return firstType === "Polygon" || firstType === "MultiPolygon";
  };

  const availableLayers = useMemo(
    () =>
      layers.filter((l) => {
        if (!l.id || !layerGeojsonCache[l.id]) return false;
        return isPolygonFc(l, layerGeojsonCache[l.id]);
      }),
    [layers, layerGeojsonCache],
  );

  const selectedLayer = layers.find((l) => l.id === targetLayerId);
  const fc = targetLayerId ? layerGeojsonCache[targetLayerId] : null;
  const featureCount = fc?.features?.length || 0;

  const report = result?.report || {};
  const changes = result?.changes || [];
  const shownChanges = changes.slice(0, MAX_CHANGES_SHOWN);
  const isTruncated = changes.length > MAX_CHANGES_SHOWN;

  const handleProgress = (status: JobStatus) => {
    setProgress({
      percent: toPercent(status.progress),
      message:
        status.message ||
        (status.status === "queued" ? "Menunggu antrean..." : status.status === "running" ? "Memproses..." : ""),
    });
  };

  const runAutofix = async () => {
    if (!targetLayerId || !selectedLayer) {
      toast.error("Pilih layer bidang tanah yang ingin diperbaiki!");
      return;
    }
    if (!fc?.features?.length) {
      toast.error("Tidak ada data pada layer ini.");
      return;
    }
    if (!isPolygonFc(selectedLayer, fc)) {
      toast.error("Auto-fix topologi hanya bisa digunakan pada layer Polygon/MultiPolygon.");
      return;
    }

    setIsProcessing(true);
    setResult(null);
    setProgress({ percent: 0, message: "Mengunggah data ke server..." });

    try {
      const fd = new FormData();
      fd.append("file", geojsonToFile(fc, `${selectedLayer.name}.geojson`));
      fd.append("fix_invalid", String(options.fix_invalid));
      fd.append("snap", String(options.snap));
      fd.append("snap_tolerance_m", String(snapToleranceM));
      fd.append("remove_slivers", String(options.remove_slivers));
      fd.append("sliver_min_area_m2", String(sliverMinAreaM2));
      fd.append("sliver_thinness", String(sliverThinness));
      fd.append("fix_overlaps", String(options.fix_overlaps));
      fd.append("fix_gaps", String(options.fix_gaps));
      fd.append("id_field", idField || "NIB");

      const data = await runJob("/topology/autofix", fd, handleProgress);

      if (!data?.geojson?.features) {
        throw new Error("Server tidak mengembalikan GeoJSON hasil perbaikan.");
      }

      setResult({
        geojson: data.geojson,
        report: data.report || {},
        changes: Array.isArray(data.changes) ? data.changes : [],
      });
      setProgress(null);
      toast.success(
        `Auto-fix selesai: ${formatCount(Array.isArray(data.changes) ? data.changes.length : 0)} perubahan pada ${formatCount(data.report?.features_out ?? data.geojson.features.length)} bidang.`,
      );
    } catch (err: any) {
      console.error("Autofix error:", err);
      toast.error(`Gagal menjalankan auto-fix: ${err?.message || err}`);
      setProgress(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const zoomToChange = (change: AutofixChange) => {
    const index = change.feature_index;
    if (!Number.isInteger(index) || !result?.geojson?.features) return;
    const feature = result.geojson.features[index as number];
    if (!feature?.geometry) {
      toast.error("Geometri fitur hasil tidak tersedia (mungkin dihapus).");
      return;
    }
    setZoomFeature(feature);
  };

  const saveAsNewLayer = async () => {
    if (!result?.geojson || !selectedLayer) return;
    setIsSaving(true);
    try {
      const newName = `${selectedLayer.name} (fixed)`;
      await saveLayer(newName, result.geojson, "Polygon");
      await fetchLayers();
      toast.success(`Layer "${newName}" berhasil disimpan. Layer asli tidak diubah.`);
    } catch (err: any) {
      console.error("Save autofix layer error:", err);
      toast.error(`Gagal menyimpan layer: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadReport = () => {
    if (!result || !selectedLayer) return;
    try {
      const payload = {
        layer: selectedLayer.name,
        generated_at: new Date().toISOString(),
        parameters: {
          ...options,
          snap_tolerance_m: snapToleranceM,
          sliver_min_area_m2: sliverMinAreaM2,
          sliver_thinness: sliverThinness,
          id_field: idField,
        },
        report: result.report,
        changes: result.changes,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedLayer.name.replace(/[^\w\-]+/g, "_")}_autofix_report.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(`Gagal mengunduh laporan: ${err?.message || err}`);
    }
  };

  const opt = (key: keyof typeof options) => ({
    checked: options[key],
    onToggle: () => toggleOption(key),
  });

  const summaryTiles: { label: string; value: string; tone: string }[] = [
    { label: "Geometri diperbaiki", value: formatCount(report.invalid_fixed), tone: "border-rose-400/15 bg-rose-500/10 text-rose-200" },
    { label: "Vertex di-snap", value: formatCount(report.vertices_snapped), tone: "border-indigo-400/15 bg-indigo-500/10 text-indigo-200" },
    { label: "Sliver dihapus", value: formatCount(report.slivers_removed), tone: "border-amber-400/15 bg-amber-500/10 text-amber-200" },
    { label: "Sliver digabung", value: formatCount(report.slivers_merged), tone: "border-amber-400/15 bg-amber-500/10 text-amber-200" },
    { label: "Overlap diperbaiki", value: `${formatCount(report.overlaps_fixed)} · ${formatArea(report.overlap_area_m2_total)}`, tone: "border-orange-400/15 bg-orange-500/10 text-orange-200" },
    { label: "Gap diisi", value: `${formatCount(report.gaps_filled)} · ${formatArea(report.gap_area_m2_total)}`, tone: "border-cyan-400/15 bg-cyan-500/10 text-cyan-200" },
    { label: "Fitur masuk → keluar", value: `${formatCount(report.features_in)} → ${formatCount(report.features_out)}`, tone: "border-white/10 bg-black/15 text-white/85" },
    { label: "CRS (EPSG)", value: report.crs_used_epsg ? String(report.crs_used_epsg) : "-", tone: "border-emerald-400/15 bg-emerald-500/10 text-emerald-200" },
  ];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (isProcessing && !open) return;
        setIsOpen(open);
      }}
    >
      <DialogTrigger
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all outline-none ${
          availableLayers.length === 0
            ? "border-border/40 text-muted-foreground/30 cursor-not-allowed"
            : result
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/10"
              : "border-border text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
        }`}
        disabled={availableLayers.length === 0}
        title="Auto-fix Topologi"
      >
        <Wrench className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="w-[min(1000px,calc(100vw-1rem))] max-w-5xl sm:max-w-5xl overflow-hidden bg-card text-card-foreground border-border max-h-[calc(100dvh-2rem)] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-400" />
            Auto-fix Topologi Bidang Tanah
          </DialogTitle>
          <DialogDescription>
            Perbaiki geometri tidak valid, snap vertex, hapus sliver, serta selesaikan overlap dan gap antar bidang secara otomatis. Hasil disimpan sebagai layer baru; layer asli tidak diubah.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          {/* LEFT: Settings */}
          <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer Bidang</label>
                <select
                  value={targetLayerId}
                  onChange={(e) => {
                    setTargetLayerId(e.target.value);
                    setResult(null);
                    setProgress(null);
                  }}
                  disabled={isProcessing}
                  className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="">— Pilih Layer —</option>
                  {availableLayers.map((l) => {
                    const type = l.geometryType || layerGeojsonCache[l.id!]?.features?.[0]?.geometry?.type || "Polygon";
                    const count = layerGeojsonCache[l.id!]?.features?.length || 0;
                    return (
                      <option key={l.id} value={l.id}>
                        {l.name} ({type}, {formatCount(count)} fitur)
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Field ID Bidang/NIB</label>
                <input
                  value={idField}
                  onChange={(e) => setIdField(e.target.value)}
                  disabled={isProcessing}
                  className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="Contoh: NIB"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Langkah Perbaikan</label>
              <div className="flex-1 overflow-y-auto border rounded-lg p-2 bg-background/50">
                <div className="space-y-1">
                  <OptionCheckbox
                    label="Perbaiki geometri tidak valid"
                    {...opt("fix_invalid")}
                    description="Memperbaiki self-intersection, ring tidak tertutup, dan geometri rusak (make valid)."
                  />

                  <OptionCheckbox
                    label="Snap vertex antar bidang"
                    {...opt("snap")}
                    description="Menempelkan vertex yang berdekatan ke batas bidang tetangga agar batas berimpit."
                  />
                  {options.snap && (
                    <div className="grid grid-cols-2 gap-3 px-9 pb-2">
                      <NumberField
                        label="Toleransi Snap (m)"
                        value={snapToleranceM}
                        onChange={setSnapToleranceM}
                        step={0.1}
                        disabled={isProcessing}
                        hint="Jarak maksimum vertex dipindahkan."
                      />
                    </div>
                  )}

                  <OptionCheckbox
                    label="Hapus sliver"
                    {...opt("remove_slivers")}
                    description="Poligon sangat kecil/tipis dihapus atau digabung ke bidang tetangga terbesar."
                  />
                  {options.remove_slivers && (
                    <div className="grid grid-cols-2 gap-3 px-9 pb-2">
                      <NumberField
                        label="Luas Min. Sliver (m²)"
                        value={sliverMinAreaM2}
                        onChange={setSliverMinAreaM2}
                        step={0.5}
                        disabled={isProcessing}
                        hint="Poligon di bawah luas ini dianggap sliver."
                      />
                      <NumberField
                        label="Rasio Ketipisan"
                        value={sliverThinness}
                        onChange={setSliverThinness}
                        step={0.01}
                        disabled={isProcessing}
                        hint="0–1; makin kecil makin tipis (4π·Luas/Keliling²)."
                      />
                    </div>
                  )}

                  <OptionCheckbox
                    label="Perbaiki overlap antar bidang"
                    {...opt("fix_overlaps")}
                    description="Area tumpang tindih dipotong dari salah satu bidang sehingga tidak ada bidang yang saling menimpa."
                  />

                  <OptionCheckbox
                    label="Isi gap/celah antar bidang"
                    {...opt("fix_gaps")}
                    description="Celah kecil di antara bidang yang bertetangga digabungkan ke bidang di sekitarnya."
                  />
                </div>
              </div>
            </div>

            {selectedLayer && (
              <div className="text-[10px] text-muted-foreground">
                Layer <b className="text-foreground">{selectedLayer.name}</b> · {formatCount(featureCount)} bidang akan dikirim ke server untuk diproses.
              </div>
            )}
          </div>

          {/* RIGHT: Results */}
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            {progress && (
              <div className="flex flex-col gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-500/20 rounded-md p-2.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="flex-1 truncate">{progress.message || "Memproses..."}</span>
                  <span className="font-bold tabular-nums">{progress.percent}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-950/60">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {result ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Hasil Auto-fix
                  </span>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400"
                    title="Bersihkan hasil"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  {summaryTiles.map((tile) => (
                    <div key={tile.label} className={`rounded-lg border px-2 py-2 ${tile.tone}`}>
                      <span className="block uppercase tracking-wider opacity-60">{tile.label}</span>
                      <strong className="mt-0.5 block text-sm">{tile.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="text-[10px] text-emerald-200/75">
                  {formatCount(changes.length)} perubahan tercatat.
                  {isTruncated && ` Menampilkan ${formatCount(MAX_CHANGES_SHOWN)} pertama; unduh laporan untuk daftar lengkap.`}
                  {" "}Setiap fitur hasil memiliki atribut <code className="rounded bg-black/30 px-1">_fix_notes</code>.
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {shownChanges.length === 0 && (
                    <div className="rounded-lg border border-dashed border-emerald-400/20 p-4 text-center text-[10px] text-emerald-200/60">
                      Tidak ada perubahan — topologi layer sudah bersih.
                    </div>
                  )}
                  {shownChanges.map((change, i) => {
                    const action = change.action || "fix";
                    const hasFeature =
                      Number.isInteger(change.feature_index) &&
                      !!result.geojson?.features?.[change.feature_index as number]?.geometry;
                    return (
                      <div key={`${action}-${change.feature_index}-${i}`} className="rounded-lg border border-emerald-500/20 bg-black/20 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${actionBadgeClass(action)}`}>
                                {action}
                              </span>
                              {change.id !== undefined && change.id !== null && change.id !== "" && (
                                <span className="text-[10px] font-bold text-white/70">
                                  {idField || "ID"}: <b className="text-white/90">{String(change.id)}</b>
                                </span>
                              )}
                            </div>
                            {change.detail && (
                              <div className="mt-1 text-xs leading-relaxed text-white/85">{change.detail}</div>
                            )}
                          </div>
                          <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                            #{Number.isInteger(change.feature_index) ? (change.feature_index as number) + 1 : "-"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-white/55">
                            Δ Luas:{" "}
                            <b className={`${(change.area_delta_m2 || 0) > 0 ? "text-emerald-300" : (change.area_delta_m2 || 0) < 0 ? "text-rose-300" : "text-white/80"}`}>
                              {formatAreaDelta(change.area_delta_m2)}
                            </b>
                          </span>
                          <button
                            type="button"
                            disabled={!hasFeature}
                            onClick={() => zoomToChange(change)}
                            className="flex items-center gap-1 rounded-md border border-indigo-400/20 bg-indigo-500/10 px-2 py-1 text-[10px] font-bold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={hasFeature ? "Zoom ke fitur hasil" : "Fitur tidak tersedia di hasil"}
                          >
                            <MapPin className="h-3 w-3" /> Zoom
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : selectedLayer ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300/20 bg-emerald-500/[0.04] p-6 text-center">
                <Wrench className="h-8 w-8 text-emerald-300/70" />
                <strong className="mt-3 text-sm text-white/85">Siap memperbaiki topologi</strong>
                <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-white/45">
                  Jalankan auto-fix untuk melihat ringkasan perbaikan dan daftar perubahan per bidang. Layer asli tetap aman.
                </p>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                Pilih layer Polygon/MultiPolygon untuk memulai.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-4 flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>
            Tutup
          </Button>
          {result && (
            <>
              <Button variant="outline" onClick={downloadReport} disabled={isProcessing || isSaving}>
                <Download className="w-4 h-4 mr-2" /> Unduh laporan (JSON)
              </Button>
              <Button
                onClick={saveAsNewLayer}
                disabled={isProcessing || isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[200px]"
              >
                {isSaving ? (
                  <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</span>
                ) : (
                  <span className="flex items-center"><Save className="w-4 h-4 mr-2" /> Simpan sebagai layer baru</span>
                )}
              </Button>
            </>
          )}
          <Button
            onClick={runAutofix}
            disabled={isProcessing || isSaving || !targetLayerId}
            variant={result ? "outline" : "default"}
            className={result ? "min-w-[160px]" : "bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]"}
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</span>
            ) : (
              <span className="flex items-center"><Wrench className="w-4 h-4 mr-2" /> {result ? "Jalankan Ulang" : "Jalankan Auto-fix"}</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
