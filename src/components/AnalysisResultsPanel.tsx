"use client";

import { useMemo, useState } from "react";
import { Download, Eye, FileText, History, Loader2, Maximize2, Play, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useMapContext } from "@/lib/MapContext";
import { useAnalysisHistory, type AnalysisResultRecord } from "@/lib/AnalysisHistoryContext";
import { useWorkspaceUI } from "@/lib/WorkspaceUIContext";
import styles from "./AnalysisResultsPanel.module.css";

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\-_]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "analysis-result";
}

function downloadJson(value: unknown, name: string, mime = "application/json") {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function featureCount(record: AnalysisResultRecord) {
  return record.geojson?.features.length ?? 0;
}

function statusLabel(status: AnalysisResultRecord["status"]) {
  if (status === "queued") return "Menunggu";
  if (status === "running") return "Berjalan";
  if (status === "error") return "Gagal";
  return "Selesai";
}

function statusClass(status: AnalysisResultRecord["status"]) {
  if (status === "queued") return styles.queued;
  if (status === "running") return styles.running;
  if (status === "error") return styles.error;
  return styles.completed;
}

function ResultCard({ record, expanded, onExpand }: { record: AnalysisResultRecord; expanded: boolean; onExpand: () => void }) {
  const { setZoomFeature } = useMapContext();
  const { openWorkspace, setActiveDrawer } = useWorkspaceUI();
  const toolKey = ({spatialJoin: "join", "topology-validation": "validasi", "topology-autofix": "autofix", "change-detection": "change", "crs-inspect": "crs", "crs-reproject": "crs", "crs-reproject-download": "crs"} as Record<string,string>)[record.operation || ""] || record.operation;
  const { previewResult, removeResult, saveResultAsLayer } = useAnalysisHistory();
  const [saving, setSaving] = useState(false);
  const sources = record.sourceNames.length > 0 ? record.sourceNames.join(" · ") : "Sumber tidak dicatat";
  const isReady = record.status === "completed" && Boolean(record.geojson);

  const inspect = () => {
    onExpand();
    if (record.geojson) setZoomFeature(record.geojson);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveResultAsLayer(record.id);
      toast.success("Hasil disimpan sebagai layer baru. Layer asli tidak diubah.");
    } catch (error) {
      toast.error(`Gagal menyimpan hasil: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const downloadResult = () => {
    if (!record.geojson) return;
    downloadJson(record.geojson, `${safeFileName(record.label)}.geojson`, "application/geo+json");
  };

  const downloadReport = () => {
    const report = record.report ?? record.summary;
    if (report === undefined) {
      toast.info("Laporan belum tersedia untuk hasil ini.");
      return;
    }
    downloadJson({ label: record.label, timestamp: record.timestamp, sourceNames: record.sourceNames, status: record.status, report }, `${safeFileName(record.label)}_report.json`);
  };

  return (
    <article className={`${styles.card} ${expanded ? styles.cardExpanded : ""}`} data-result-id={record.id}>
      <div className={styles.cardHeader}>
        <button type="button" className={styles.cardTitle} onClick={onExpand} aria-expanded={expanded}>
          <span className={`${styles.statusDot} ${statusClass(record.status)}`} aria-hidden="true" />
          <span className={styles.titleText}>
            <strong>{record.label}</strong>
            <small>{new Date(record.timestamp).toLocaleString("id-ID")} · {record.origin === "server" ? "server" : "sesi ini"}</small>
          </span>
        </button>
        <div className={styles.headerActions}>
          <span className={`${styles.status} ${statusClass(record.status)}`}>{statusLabel(record.status)}</span>
          <button type="button" className={styles.iconButton} onClick={() => removeResult(record.id)} aria-label={`Hapus ${record.label}`} title="Hapus dari riwayat"><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      </div>
      <div className={styles.meta}>{sources}</div>
      {(record.status === "queued" || record.status === "running") && (
        <div className={styles.progressBlock} aria-label={`Kemajuan ${record.label}`}>
          <div className={styles.progressLine}><Loader2 className={styles.spinner} size={13} aria-hidden="true" /><span>{record.message || "Memproses…"}</span><b>{Math.round(record.progress ?? 0)}%</b></div>
          <div className={styles.progressTrack}><span style={{ width: `${Math.max(0, Math.min(100, record.progress ?? 0))}%` }} /></div>
        </div>
      )}
      {record.status === "error" && <div className={styles.errorMessage}>{record.error || record.message || "Proses tidak berhasil."}</div>}
      {record.status === "completed" && <div className={styles.stats}><span>Fitur <b>{featureCount(record).toLocaleString("id-ID")}</b></span>{Boolean(record.report) && <span>Laporan <b>tersedia</b></span>}{Boolean(record.summary) && !record.report && <span>Ringkasan <b>tersedia</b></span>}</div>}
      {expanded && (
        <div className={styles.detail}>
          {record.report !== undefined && <pre className={styles.report}>{JSON.stringify(record.report, null, 2)}</pre>}
          {record.summary !== undefined && record.report === undefined && <pre className={styles.report}>{JSON.stringify(record.summary, null, 2)}</pre>}
          <div className={styles.cardActions}>
            <button type="button" onClick={inspect} disabled={!record.geojson} className={styles.secondaryButton}><Maximize2 size={13} /> Inspeksi</button>
            <button type="button" onClick={() => { previewResult(record.id); setActiveDrawer(null); }} disabled={!isReady} className={styles.secondaryButton}><Eye size={13} /> Pratinjau</button>
            <button type="button" onClick={downloadResult} disabled={!record.geojson} className={styles.secondaryButton}><Download size={13} /> GeoJSON</button>
            <button type="button" onClick={downloadReport} disabled={record.report === undefined && record.summary === undefined} className={styles.secondaryButton}><FileText size={13} /> Laporan</button>
            <button type="button" onClick={save} disabled={!isReady || saving} className={styles.primaryButton}><Save size={13} /> {saving ? "Menyimpan…" : "Simpan layer baru"}</button>
            {toolKey && <button type="button" onClick={() => openWorkspace("analysis", toolKey)} className={styles.secondaryButton}><Play size={13} /> Jalankan ulang</button>}
          </div>
        </div>
      )}
    </article>
  );
}

/** Compact trigger and the single results drawer. */
export function AnalysisResultsPanel({ hidden = false }: { hidden?: boolean }) {
  const workspaceUi = useWorkspaceUI();
  const { activeDrawer, setActiveDrawer } = workspaceUi;
  const { results, clearHistory } = useAnalysisHistory();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isActive = activeDrawer === "results" && !hidden;
  const completedCount = useMemo(() => results.filter((result) => result.status === "completed").length, [results]);
  const toggle = () => setActiveDrawer(isActive ? null : "results");

  return (
    <>
      <button type="button" className={styles.trigger} onClick={toggle} aria-expanded={isActive} aria-controls="analysis-results-drawer" aria-label={`Hasil analisis${results.length ? ` (${results.length})` : ""}`}>
        <History size={15} aria-hidden="true" /><span>Hasil</span><b aria-label={`${results.length} hasil`}>{results.length}</b>
      </button>
      {isActive && (
        <aside id="analysis-results-drawer" className={styles.drawer} aria-label="Hasil analisis" data-result-count={results.length}>
          <div className={styles.drawerHeader}><div><h2>Hasil analisis</h2><p>{results.length ? `${results.length} hasil dalam sesi ini · ${completedCount} selesai` : "Belum ada hasil tersimpan"}</p></div><button type="button" className={styles.iconButton} onClick={() => setActiveDrawer(null)} aria-label="Tutup hasil"><X size={16} /></button></div>
          {results.length === 0 ? <div className={styles.empty}><History size={25} aria-hidden="true" /><strong>Hasil analisis akan muncul di sini</strong><p>Jalankan buffer, overlay, validasi, atau analisis server. Riwayat ini hanya untuk sesi aktif.</p></div> : <div className={styles.list}>{results.map((record) => <ResultCard key={record.id} record={record} expanded={expandedId === record.id} onExpand={() => setExpandedId((previous) => previous === record.id ? null : record.id)} />)}</div>}
          {results.length > 0 && <div className={styles.drawerFooter}><button type="button" onClick={clearHistory} className={styles.clearButton}><Trash2 size={13} /> Bersihkan riwayat sesi</button><span>Riwayat dibatasi 40 item; data besar tidak disimpan di localStorage.</span></div>}
        </aside>
      )}
    </>
  );
}

export default AnalysisResultsPanel;