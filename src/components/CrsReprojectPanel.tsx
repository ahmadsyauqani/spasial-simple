"use client";

import { useRef, useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import { toast } from "sonner";
import {
  Globe2,
  Loader2,
  Upload,
  Layers,
  Download,
  Search,
  MapPinned,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveLayer } from "@/lib/database";
import { runJob, geojsonToFile, MAX_UPLOAD_BYTES, type JobStatus } from "@/lib/pythonJobs";
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
// Types (backend contract: POST /crs/inspect-reproject)
// ---------------------------------------------------------------------------

type DetectedCrs = {
  epsg: number | null;
  name?: string;
  is_geographic?: boolean;
  units?: string;
  proj4?: string;
} | null;

type Confidence = "declared" | "guessed" | "unknown";

type CrsCandidate = { epsg: number; kind: string; zone?: string | number; lon?: number; lat?: number; on_land?: boolean };

type InspectResult = {
  detected_crs: DetectedCrs;
  confidence: Confidence;
  guess_reason?: string | null;
  crs_candidates?: CrsCandidate[];
  bounds_source?: number[] | null;
  bounds_wgs84?: number[] | null;
  feature_count?: number;
  geometry_types?: string[];
  layers?: string[];
  warnings?: string[];
  geojson?: any;
};

type SourceMode = "layer" | "file";

// ---------------------------------------------------------------------------
// Target CRS options
// ---------------------------------------------------------------------------

type EpsgOption = { epsg: number; label: string; group: string };

const UTM_OPTIONS: EpsgOption[] = Array.from({ length: 9 }, (_, i) => {
  const zone = 46 + i;
  return { epsg: 32700 + zone, label: `UTM Zona ${zone}S (EPSG:${32700 + zone})`, group: "UTM (WGS84)" };
});

const TM3_OPTIONS: EpsgOption[] = [
  ["46.2", 23830], ["47.1", 23831], ["47.2", 23832], ["48.1", 23833],
  ["48.2", 23834], ["49.1", 23835], ["49.2", 23836], ["50.1", 23837],
  ["50.2", 23838], ["51.1", 23839], ["51.2", 23840], ["52.1", 23841],
  ["52.2", 23842], ["53.1", 23843], ["53.2", 23844], ["54.1", 23845],
].map(([zone, epsg]) => ({
  epsg: epsg as number,
  label: `TM-3 Zona ${zone} (EPSG:${epsg})`,
  group: "TM-3 (DGN95)",
}));

const EPSG_OPTIONS: EpsgOption[] = [
  { epsg: 4326, label: "WGS 84 Geografis (EPSG:4326)", group: "Geografis" },
  ...UTM_OPTIONS,
  ...TM3_OPTIONS,
];

const CUSTOM_EPSG_VALUE = "custom";

const ACCEPTED_EXT = [".gpkg", ".zip", ".geojson", ".json", ".kml"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatBounds(bounds?: number[] | null, digits = 4) {
  if (!bounds || bounds.length < 4) return "-";
  return bounds
    .slice(0, 4)
    .map((v) => (Number.isFinite(v) ? v.toLocaleString("id-ID", { maximumFractionDigits: digits }) : "?"))
    .join(", ");
}

function confidenceStyle(confidence: Confidence | undefined) {
  switch (confidence) {
    case "declared":
      return { cls: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300", label: "CRS Terdeklarasi" };
    case "guessed":
      return { cls: "border-amber-400/30 bg-amber-500/15 text-amber-300", label: "CRS Ditebak" };
    default:
      return { cls: "border-rose-400/30 bg-rose-500/15 text-rose-300", label: "CRS Tidak Diketahui" };
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80) || "layer";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function inferGeometryType(geojson: any, hint?: string[]): "Point" | "Line" | "Polygon" {
  const types = new Set<string>();
  (hint || []).forEach((t) => types.add(String(t)));
  const first = geojson?.features?.[0]?.geometry?.type;
  if (first) types.add(String(first));
  const list = Array.from(types).map((t) => t.toLowerCase());
  if (list.some((t) => t.includes("polygon"))) return "Polygon";
  if (list.some((t) => t.includes("line"))) return "Line";
  return "Point";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CrsReprojectButton() {
  const { layers, layerGeojsonCache, fetchLayers } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<SourceMode>("layer");
  const [sourceLayerId, setSourceLayerId] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [targetChoice, setTargetChoice] = useState<string>("4326");
  const [customEpsg, setCustomEpsg] = useState("");
  const [sourceEpsgOverride, setSourceEpsgOverride] = useState("");

  const [activeTask, setActiveTask] = useState<"inspect" | "save" | "download" | null>(null);
  const [progress, setProgress] = useState<JobStatus | null>(null);

  const availableLayers = layers.filter((l) => l.id && layerGeojsonCache[l.id]);
  const selectedLayer = layers.find((l) => l.id === sourceLayerId);
  const isBusy = activeTask !== null;

  const targetEpsg: number | null = (() => {
    if (targetChoice === CUSTOM_EPSG_VALUE) {
      const n = parseInt(customEpsg, 10);
      return Number.isInteger(n) && n > 0 ? n : null;
    }
    const n = parseInt(targetChoice, 10);
    return Number.isInteger(n) ? n : null;
  })();

  const targetLabel =
    EPSG_OPTIONS.find((o) => o.epsg === targetEpsg)?.label || (targetEpsg ? `EPSG:${targetEpsg}` : "-");

  const hasSource =
    sourceMode === "layer" ? Boolean(sourceLayerId && layerGeojsonCache[sourceLayerId]) : Boolean(sourceFile);

  const sourceName = (() => {
    if (sourceMode === "layer") return selectedLayer?.name || "layer";
    if (sourceFile) return sourceFile.name.replace(/\.[^.]+$/, "");
    return "layer";
  })();

  const resetResult = () => {
    setInspectResult(null);
    setSourceEpsgOverride("");
    setProgress(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!ACCEPTED_EXT.some((ext) => lower.endsWith(ext))) {
      toast.error("Format file tidak didukung. Gunakan .gpkg, .zip (shapefile), .geojson, atau .kml.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Ukuran file ${formatBytes(file.size)} melebihi batas 200 MB.`);
      e.target.value = "";
      return;
    }
    setSourceFile(file);
    resetResult();
  };

  /** Build the multipart body for /crs/inspect-reproject. */
  const buildForm = (opts: { targetEpsg: number; sampleOnly: boolean }) => {
    const form = new FormData();
    if (sourceMode === "layer") {
      const fc = layerGeojsonCache[sourceLayerId];
      if (!fc) throw new Error("Data layer belum tersedia di cache.");
      form.append("file", geojsonToFile(fc, `${sanitizeFileName(sourceName)}.geojson`));
    } else {
      if (!sourceFile) throw new Error("Belum ada file yang dipilih.");
      form.append("file", sourceFile);
    }
    form.append("target_epsg", String(opts.targetEpsg));
    form.append("sample_only", opts.sampleOnly ? "true" : "false");
    const override = parseInt(sourceEpsgOverride, 10);
    if (Number.isInteger(override) && override > 0) {
      form.append("source_epsg", String(override));
    }
    return form;
  };

  const onProgress = (s: JobStatus) => setProgress(s);

  const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

  // Step 1 ------------------------------------------------------------------
  const runInspect = async () => {
    if (!hasSource) {
      toast.error("Pilih layer atau unggah file terlebih dahulu.");
      return;
    }
    setActiveTask("inspect");
    setProgress({ status: "queued", progress: 0, message: "Menyiapkan data..." });
    try {
      const form = buildForm({ targetEpsg: 4326, sampleOnly: true });
      const result = (await runJob("/crs/inspect-reproject", form, onProgress)) as InspectResult;
      setInspectResult(result);
      if (result?.confidence === "unknown") {
        toast.warning("CRS sumber tidak terdeteksi. Isi 'Paksa CRS sumber' sebelum reproyeksi.");
      } else if (result?.confidence === "guessed") {
        toast.info("CRS sumber hanya ditebak. Periksa kembali sebelum reproyeksi.");
      } else {
        toast.success("Pemeriksaan CRS selesai.");
      }
    } catch (err) {
      toast.error(`Gagal memeriksa CRS: ${errorMessage(err)}`);
    } finally {
      setActiveTask(null);
      setProgress(null);
    }
  };

  // Step 2a: save to map (always WGS84) -----------------------------------
  const runSaveToMap = async () => {
    if (!hasSource) {
      toast.error("Pilih layer atau unggah file terlebih dahulu.");
      return;
    }
    setActiveTask("save");
    setProgress({ status: "queued", progress: 0, message: "Menyiapkan reproyeksi ke WGS84..." });
    try {
      const form = buildForm({ targetEpsg: 4326, sampleOnly: false });
      const result = (await runJob("/crs/inspect-reproject", form, onProgress)) as InspectResult;
      if (!result?.geojson?.features) {
        throw new Error("Server tidak mengembalikan GeoJSON hasil reproyeksi.");
      }
      const geometryType = inferGeometryType(result.geojson, result.geometry_types);
      await saveLayer(`${sourceName} (WGS84)`, result.geojson, geometryType);
      await fetchLayers();
      toast.success(
        `Layer "${sourceName} (WGS84)" berhasil disimpan ke peta (${(result.feature_count ?? result.geojson.features.length).toLocaleString("id-ID")} fitur).`,
      );
    } catch (err) {
      toast.error(`Gagal menyimpan ke peta: ${errorMessage(err)}`);
    } finally {
      setActiveTask(null);
      setProgress(null);
    }
  };

  // Step 2b: download in chosen target EPSG --------------------------------
  const runDownload = async () => {
    if (!hasSource) {
      toast.error("Pilih layer atau unggah file terlebih dahulu.");
      return;
    }
    if (!targetEpsg) {
      toast.error("Masukkan kode EPSG target yang valid.");
      return;
    }
    setActiveTask("download");
    setProgress({ status: "queued", progress: 0, message: `Menyiapkan reproyeksi ke EPSG:${targetEpsg}...` });
    try {
      const form = buildForm({ targetEpsg, sampleOnly: false });
      const result = (await runJob("/crs/inspect-reproject", form, onProgress)) as InspectResult;
      if (!result?.geojson) {
        throw new Error("Server tidak mengembalikan GeoJSON hasil reproyeksi.");
      }
      const blob = new Blob([JSON.stringify(result.geojson)], { type: "application/geo+json" });
      downloadBlob(blob, `${sanitizeFileName(sourceName)}_EPSG${targetEpsg}.geojson`);
      toast.success(`GeoJSON EPSG:${targetEpsg} berhasil diunduh.`);
    } catch (err) {
      toast.error(`Gagal mengunduh hasil: ${errorMessage(err)}`);
    } finally {
      setActiveTask(null);
      setProgress(null);
    }
  };

  const detected = inspectResult?.detected_crs;
  const confidence = inspectResult?.confidence;
  const confStyle = confidenceStyle(confidence);
  const showSourceOverride = Boolean(inspectResult && confidence !== "declared");
  const needsOverride = confidence === "unknown" && !parseInt(sourceEpsgOverride, 10);

  const taskLabel =
    activeTask === "inspect" ? "Memeriksa CRS..." : activeTask === "save" ? "Menyimpan ke peta..." : "Menyiapkan unduhan...";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (isBusy) return;
        setIsOpen(open);
      }}
    >
      <DialogTrigger
        className="w-10 h-10 flex items-center justify-center rounded-lg border transition-all outline-none border-border text-muted-foreground hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-400"
        title="Reproyeksi & Cek CRS"
      >
        <Globe2 className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="w-[min(900px,calc(100vw-1rem))] max-w-4xl sm:max-w-4xl overflow-hidden bg-card text-card-foreground border-border max-h-[calc(100dvh-2rem)] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-cyan-400" />
            Reproyeksi & Cek CRS
          </DialogTitle>
          <DialogDescription>
            Deteksi sistem koordinat (CRS) data spasial, lalu reproyeksi ke WGS84 untuk peta atau ke EPSG pilihan untuk diunduh.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 py-2 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          {/* ------------------------------------------------------------ */}
          {/* LEFT: source + target                                         */}
          {/* ------------------------------------------------------------ */}
          <div className="flex min-h-0 flex-col gap-4">
            {/* Source selector */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sumber Data</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background/60 p-1">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setSourceMode("layer");
                    resetResult();
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                    sourceMode === "layer"
                      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30"
                      : "text-muted-foreground hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Layer di Peta
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setSourceMode("file");
                    resetResult();
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                    sourceMode === "file"
                      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30"
                      : "text-muted-foreground hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> Unggah File
                </button>
              </div>

              {sourceMode === "layer" ? (
                <select
                  value={sourceLayerId}
                  disabled={isBusy}
                  onChange={(e) => {
                    setSourceLayerId(e.target.value);
                    resetResult();
                  }}
                  className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="">— Pilih Layer —</option>
                  {availableLayers.map((l) => {
                    const type = l.geometryType || layerGeojsonCache[l.id!]?.features?.[0]?.geometry?.type || "Unknown";
                    const count = layerGeojsonCache[l.id!]?.features?.length ?? 0;
                    return (
                      <option key={l.id} value={l.id}>
                        {l.name} ({type}, {count.toLocaleString("id-ID")} fitur)
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXT.join(",")}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-cyan-300/30 bg-cyan-500/[0.04] px-3 py-4 text-center transition-colors hover:bg-cyan-500/10 disabled:opacity-50"
                  >
                    <Upload className="w-5 h-5 text-cyan-300/80" />
                    <span className="text-xs font-semibold text-foreground">
                      {sourceFile ? "Ganti file" : "Pilih file spasial"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      .gpkg, .zip (shapefile), .geojson, .kml — maks. 200 MB
                    </span>
                  </button>
                  {sourceFile && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{sourceFile.name}</div>
                        <div className="text-[10px] text-muted-foreground">{formatBytes(sourceFile.size)}</div>
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setSourceFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                          resetResult();
                        }}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        title="Hapus file"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 1 */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Langkah 1 · Periksa CRS</div>
                <div className="text-[10px] text-muted-foreground">
                  Deteksi CRS, cakupan, jumlah fitur, dan peringatan tanpa memproses seluruh data.
                </div>
              </div>
              <Button
                size="sm"
                onClick={runInspect}
                disabled={isBusy || !hasSource}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {activeTask === "inspect" ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-1.5" />
                )}
                Periksa CRS
              </Button>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Langkah 2 · Reproyeksi</div>
                <div className="text-[10px] text-muted-foreground">
                  Pilih CRS target untuk file unduhan. Layer peta selalu disimpan dalam WGS84.
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">EPSG Target</label>
                  <select
                    value={targetChoice}
                    disabled={isBusy}
                    onChange={(e) => setTargetChoice(e.target.value)}
                    className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    {["Geografis", "UTM (WGS84)", "TM-3 (DGN95)"].map((group) => (
                      <optgroup key={group} label={group}>
                        {EPSG_OPTIONS.filter((o) => o.group === group).map((o) => (
                          <option key={o.epsg} value={String(o.epsg)}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label="Lainnya">
                      <option value={CUSTOM_EPSG_VALUE}>Kode EPSG lain…</option>
                    </optgroup>
                  </select>
                </div>

                {targetChoice === CUSTOM_EPSG_VALUE && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kode EPSG</label>
                    <input
                      type="number"
                      min={1}
                      value={customEpsg}
                      disabled={isBusy}
                      onChange={(e) => setCustomEpsg(e.target.value)}
                      placeholder="Contoh: 3857"
                      className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </div>
                )}

                {showSourceOverride && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                      Paksa CRS Sumber (EPSG) {confidence === "unknown" ? "— wajib" : "— opsional"}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={sourceEpsgOverride}
                      disabled={isBusy}
                      onChange={(e) => setSourceEpsgOverride(e.target.value)}
                      placeholder={detected?.epsg ? `Terdeteksi: ${detected.epsg}` : "Contoh: 23835"}
                      className="w-full text-sm p-2 rounded-md bg-background border border-amber-400/30 text-foreground outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      Gunakan jika CRS sumber tidak terdeteksi atau tebakan server salah.
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-md border border-cyan-400/15 bg-cyan-500/[0.06] p-2.5 text-[10px] leading-relaxed text-cyan-100/80">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                <span>
                  Peta menampilkan data dalam <b>WGS84 (EPSG:4326)</b>, sehingga tombol <b>Simpan ke Peta</b> selalu
                  mereproyeksi ke WGS84. CRS target yang Anda pilih ({targetLabel}) dipakai untuk tombol{" "}
                  <b>Unduh GeoJSON</b>, yang menjalankan proses terpisah.
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  onClick={runSaveToMap}
                  disabled={isBusy || !hasSource || needsOverride}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  {activeTask === "save" ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <MapPinned className="w-4 h-4 mr-1.5" />
                  )}
                  Simpan ke Peta (WGS84)
                </Button>
                <Button
                  variant="outline"
                  onClick={runDownload}
                  disabled={isBusy || !hasSource || !targetEpsg || needsOverride}
                  className="border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200"
                >
                  {activeTask === "download" ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-1.5" />
                  )}
                  Unduh GeoJSON (EPSG:{targetEpsg ?? "…"})
                </Button>
              </div>
              {needsOverride && (
                <div className="text-[10px] text-rose-300">
                  CRS sumber tidak diketahui. Isi "Paksa CRS Sumber" untuk melanjutkan reproyeksi.
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* RIGHT: progress + inspect result                               */}
          {/* ------------------------------------------------------------ */}
          <div className="flex min-h-0 flex-col gap-3">
            {isBusy && (
              <div className="flex flex-col gap-2 rounded-md border border-cyan-500/20 bg-cyan-900/20 p-3 text-xs text-cyan-300">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="font-semibold">{taskLabel}</span>
                  <span className="ml-auto tabular-nums">{Math.round(progress?.progress ?? 0)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, progress?.progress ?? 0))}%` }}
                  />
                </div>
                <span className="text-[10px] text-cyan-100/70">{progress?.message || "Menunggu server..."}</span>
              </div>
            )}

            {inspectResult ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-cyan-500/20 bg-cyan-950/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe2 className="h-3.5 w-3.5" /> Hasil Pemeriksaan
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${confStyle.cls}`}>
                    {confStyle.label}
                  </span>
                </div>

                {/* Detected CRS card */}
                <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-white/45">CRS Terdeteksi</div>
                  {detected?.epsg ? (
                    <>
                      <div className="mt-0.5 text-base font-bold text-white/90">EPSG:{detected.epsg}</div>
                      <div className="text-xs text-white/70">{detected.name || "-"}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px]">
                        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-white/60">
                          {detected.is_geographic ? "Geografis" : "Terproyeksi"}
                        </span>
                        {detected.units && (
                          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-white/60">
                            Satuan: {detected.units}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="mt-0.5 text-sm font-semibold text-rose-300">Tidak terdeteksi</div>
                  )}
                  {inspectResult.guess_reason && (
                    <div className="mt-2 text-[10px] leading-relaxed text-amber-200/80">
                      <b>Alasan:</b> {inspectResult.guess_reason}
                    </div>
                  )}
                  {/* TM-3 zones share identical false easting/northing, so the server
                      cannot pick one reliably; let the user choose from ranked candidates. */}
                  {confidence !== "declared" && (inspectResult.crs_candidates?.length ?? 0) > 1 && (
                    <div className="mt-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
                        Pilih zona sumber yang benar
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {inspectResult.crs_candidates!.slice(0, 8).map((c) => {
                          const active = String(c.epsg) === sourceEpsgOverride;
                          const label = c.kind === "TM3" ? `TM-3 ${c.zone}` : c.kind.startsWith("UTM") ? `UTM ${c.zone}${c.kind.endsWith("S") ? "S" : "N"}` : "WGS84";
                          return (
                            <button
                              key={c.epsg}
                              type="button"
                              disabled={isBusy}
                              onClick={() => setSourceEpsgOverride(String(c.epsg))}
                              title={c.lon != null && c.lat != null ? `Pusat data ≈ ${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}${c.on_land ? " · di darat" : " · di laut"}` : undefined}
                              className={`rounded-full border px-2 py-1 text-[10px] font-bold transition-colors ${active ? "border-amber-400/60 bg-amber-500/20 text-amber-100" : "border-white/10 bg-black/20 text-white/70 hover:bg-white/10"}`}
                            >
                              {label} <span className="font-mono opacity-70">{c.epsg}</span>
                              {c.on_land === false && <span className="ml-1 text-rose-300">⚠</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {detected?.proj4 && (
                    <div className="mt-2 break-all rounded bg-black/30 p-1.5 font-mono text-[9px] text-white/50">
                      {detected.proj4}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="rounded-lg border border-cyan-400/15 bg-cyan-500/10 px-2 py-2">
                    <span className="block uppercase tracking-wider text-cyan-200/60">Jumlah fitur</span>
                    <strong className="mt-0.5 block text-base text-cyan-200">
                      {(inspectResult.feature_count ?? 0).toLocaleString("id-ID")}
                    </strong>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-2">
                    <span className="block uppercase tracking-wider text-white/45">Tipe geometri</span>
                    <strong className="mt-0.5 block text-xs text-white/85 break-words">
                      {inspectResult.geometry_types?.length ? inspectResult.geometry_types.join(", ") : "-"}
                    </strong>
                  </div>
                </div>

                {/* Bounds */}
                <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-[10px]">
                  <div className="uppercase tracking-wider text-white/45">Cakupan (minX, minY, maxX, maxY)</div>
                  <div className="mt-1 flex flex-col gap-1 font-mono text-white/75">
                    <div>
                      <span className="text-white/45">Sumber: </span>
                      {formatBounds(inspectResult.bounds_source, detected?.is_geographic ? 5 : 2)}
                    </div>
                    <div>
                      <span className="text-white/45">WGS84: </span>
                      {formatBounds(inspectResult.bounds_wgs84, 5)}
                    </div>
                  </div>
                </div>

                {inspectResult.layers && inspectResult.layers.length > 0 && (
                  <div className="text-[10px] text-white/60">
                    <span className="uppercase tracking-wider text-white/45">Layer dalam file: </span>
                    {inspectResult.layers.join(", ")}
                  </div>
                )}

                {/* Warnings */}
                {inspectResult.warnings && inspectResult.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/30 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> Peringatan ({inspectResult.warnings.length})
                    </div>
                    <ul className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-amber-100/80">
                      {inspectResult.warnings.map((w, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-amber-400">•</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              !isBusy && (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-cyan-300/20 bg-cyan-500/[0.04] p-6 text-center">
                  <Globe2 className="h-8 w-8 text-cyan-300/70" />
                  <strong className="mt-3 text-sm text-white/85">
                    {hasSource ? "Siap memeriksa CRS" : "Pilih sumber data"}
                  </strong>
                  <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-white/45">
                    {hasSource
                      ? "Jalankan Langkah 1 untuk mendeteksi sistem koordinat sebelum reproyeksi."
                      : "Pilih layer di peta atau unggah file .gpkg/.zip/.geojson/.kml untuk memulai."}
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isBusy}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
