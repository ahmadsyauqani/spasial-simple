"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GeoJSON, useMap } from "react-leaflet";
import * as L from "leaflet";
import { useWorkspaceUI } from "@/lib/WorkspaceUIContext";
import { Eye, EyeOff, Layers3, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useAnalysisHistory, type AnalysisResultRecord, type Feature } from "@/lib/AnalysisHistoryContext";
import styles from "./AnalysisPreviewLayer.module.css";

const CHANGE_COLORS: Record<string, string> = {
  added: "#4ade80",
  removed: "#fb7185",
  geometry_changed: "#fbbf24",
  attribute_changed: "#22d3ee",
  both_changed: "#fb923c",
  split: "#c084fc",
  merged: "#a78bfa",
  unchanged: "#94a3b8",
};

const DIFF_COLORS: Record<string, string> = {
  gain: "#4ade80",
  loss: "#fb7185",
};

function featureColor(feature: Feature) {
  const properties = feature.properties ?? {};
  const change = String(properties._change ?? "");
  if (change && CHANGE_COLORS[change]) return CHANGE_COLORS[change];
  const diff = String(properties._diff ?? "");
  if (diff && DIFF_COLORS[diff]) return DIFF_COLORS[diff];
  return "#9fb3a8";
}

function featureStyle(feature: Feature, original = false) {
  const color = featureColor(feature);
  return {
    color: original ? "#cbd5e1" : color,
    weight: original ? 1 : 2,
    opacity: original ? 0.35 : 0.95,
    fillColor: original ? "#94a3b8" : color,
    fillOpacity: original ? 0.08 : 0.38,
  };
}

function legendFor(record: AnalysisResultRecord) {
  const features = record.geojson?.features ?? [];
  const changes = new Set(features.map((feature) => String(feature.properties?._change ?? "")).filter(Boolean));
  const diffs = new Set([...(record.diffGeojson?.features ?? []), ...features].map((feature) => String(feature.properties?._diff ?? "")).filter(Boolean));
  const changeItems = [...changes].filter((key) => CHANGE_COLORS[key]).map((key) => ({ key: `change-${key}`, label: key.replaceAll("_", " "), color: CHANGE_COLORS[key] }));
  const diffItems = [...diffs].filter((key) => DIFF_COLORS[key]).map((key) => ({ key: `diff-${key}`, label: `diff: ${key}`, color: DIFF_COLORS[key] }));
  if (changeItems.length > 0 || diffItems.length > 0) return [...changeItems, ...diffItems];
  return [{ key: "result", label: "Hasil analisis", color: "#9fb3a8" }];
}

function PreviewControls({
  record,
  showOriginal,
  setShowOriginal,
}: {
  record: AnalysisResultRecord;
  showOriginal: boolean;
  setShowOriginal: (value: boolean) => void;
}) {
  const { discardPreview, saveResultAsLayer } = useAnalysisHistory();
  const [saving, setSaving] = useState(false);
  const legend = useMemo(() => legendFor(record), [record]);

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

  return (
    <div className={`${styles.controls} analysis-preview-controls`} role="region" aria-label="Kontrol pratinjau hasil">
      <div className={styles.controlHeader}>
        <div className={styles.titleWrap}>
          <Layers3 aria-hidden="true" size={14} />
          <strong>{record.label}</strong>
        </div>
        <button type="button" className={styles.iconButton} onClick={discardPreview} aria-label="Buang pratinjau" title="Buang pratinjau">
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      <div className={styles.legend} aria-label="Legenda hasil">
        {legend.map((item) => (
          <span key={item.key} className={styles.legendItem}>
            <i aria-hidden="true" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionButton}
          disabled={!record.originalGeojson}
          aria-pressed={showOriginal}
          onClick={() => setShowOriginal(!showOriginal)}
          title={record.originalGeojson ? "Tampilkan atau redupkan sumber asli" : "Sumber asli tidak tersedia untuk hasil ini"}
        >
          {showOriginal ? <EyeOff aria-hidden="true" size={13} /> : <Eye aria-hidden="true" size={13} />}
          {showOriginal ? "Redupkan sumber" : "Tampilkan sumber"}
        </button>
        <button type="button" className={styles.actionButton} onClick={save} disabled={saving || !record.geojson}>
          <Save aria-hidden="true" size={13} />
          {saving ? "Menyimpan…" : "Simpan layer baru"}
        </button>
        <button type="button" className={styles.discardButton} onClick={discardPreview}>
          Buang
        </button>
      </div>
    </div>
  );
}

/**
 * Unified, reversible map preview. Render this as a child of MapContainer.
 * It never edits the source FeatureCollection or the legacy MapContext result.
 */
export default function AnalysisPreviewLayer() {
  const map = useMap();
  const { activePreview } = useAnalysisHistory();
  const { activeDrawer } = useWorkspaceUI();
  const [showOriginal, setShowOriginal] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setShowOriginal(false);
  }, [activePreview?.id]);

  useEffect(() => {
    const mapContainer = map.getContainer();
    const element = document.createElement("div");
    element.className = styles.host;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
    mapContainer.appendChild(element);
    setHost(element);
    return () => {
      element.remove();
      setHost(null);
    };
  }, [map]);

  useEffect(() => {
    if (!activePreview?.geojson) return;
    const bounds = L.geoJSON(activePreview.geojson as any).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, {padding:[40,40], maxZoom:18, animate:false});
  }, [activePreview?.id, map]);

  if (!activePreview?.geojson) return null;

  const original = activePreview.originalGeojson;
  return (
    <>
      {showOriginal && original && (
        <GeoJSON
          key={`analysis-original-${activePreview.id}`}
          data={original as any}
          style={(feature) => featureStyle(feature as Feature, true)}
        />
      )}
      <GeoJSON
        key={`analysis-preview-${activePreview.id}`}
        data={activePreview.geojson as any}
        style={(feature) => featureStyle(feature as Feature)}
      />
      {activePreview.diffGeojson && activePreview.diffGeojson.features.length > 0 && (
        <GeoJSON
          key={`analysis-preview-diff-${activePreview.id}`}
          data={activePreview.diffGeojson as any}
          style={(feature) => featureStyle(feature as Feature)}
        />
      )}
      {host && !activeDrawer && createPortal(<PreviewControls record={activePreview} showOriginal={showOriginal} setShowOriginal={setShowOriginal} />, host)}
    </>
  );
}
