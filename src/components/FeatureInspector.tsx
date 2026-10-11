"use client";
import { useMemo } from "react";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { useWorkspaceUI } from "@/lib/WorkspaceUIContext";
import { useMapContext } from "@/lib/MapContext";
import styles from "./FeatureInspector.module.css";

export function FeatureInspector({ hidden = false }: { hidden?: boolean }) {
  const { selection, activeDrawer, clearSelection, fitSelected, openWorkspace, setExportRequest } = useWorkspaceUI();
  const { setActiveEditFeature, setIsDigitizePanelExpanded } = useMapContext();
  const metrics = useMemo(() => {
    if (!selection) return null;
    try {
      const feature = selection.feature;
      const polygon = feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon";
      const line = feature.geometry?.type === "LineString" || feature.geometry?.type === "MultiLineString";
      const area = polygon ? turf.area(feature) : null;
      const length = polygon ? turf.length(turf.polygonToLine(feature as any), { units: "meters" }) : line ? turf.length(feature as any, { units: "meters" }) : null;
      return { area, length, polygon };
    } catch { return null; }
  }, [selection]);
  if (hidden || !selection || activeDrawer !== "inspector") return null;
  const { feature, layerName, layerId, featureIndex } = selection;
  const props = feature.properties ?? {};
  const id = String(props.NIB ?? props.nib ?? props.id_bidang ?? feature.id ?? props.ID ?? props.FID ?? "Tanpa ID");
  const format = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const edit = () => {
    if (layerId.startsWith("local-") && featureIndex < 0) { toast.error("Fitur sumber tidak ditemukan."); return; }
    setActiveEditFeature({ layerId, featureIndex, properties: { ...props } });
    setIsDigitizePanelExpanded(true);
    openWorkspace("digitize");
  };
  return <aside className={styles.drawer} aria-label="Inspektur fitur" data-layer-id={layerId}>
    <header><div><small>INSPEKTUR FITUR</small><h2>{id}</h2><p>{layerName} · {feature.geometry?.type}</p></div><button onClick={clearSelection} aria-label="Tutup inspektur">×</button></header>
    <section aria-label="Metrik geodesik"><h3>Geodesik · WGS 84 / Turf</h3>{metrics ? <dl>{metrics.area !== null && <><dt>Luas</dt><dd data-testid="feature-area" data-value={metrics.area}>{format(metrics.area)} m²</dd></>}{metrics.length !== null && <><dt>{metrics.polygon ? "Keliling" : "Panjang"}</dt><dd data-testid="feature-length" data-value={metrics.length}>{format(metrics.length)} m</dd></>}</dl> : <p>Metrik tidak tersedia untuk geometri ini.</p>}<small>Bukan luas proyeksi UTM/TM-3 atau hasil survei kadastral.</small></section>
    <nav aria-label="Aksi fitur"><button onClick={fitSelected}>Zoom <kbd>F</kbd></button><button onClick={async () => { try { await navigator.clipboard.writeText(id); toast.success("ID bidang disalin."); } catch { toast.error("Clipboard tidak tersedia."); } }}>Copy ID</button><button onClick={() => setExportRequest({feature, fileName:id})}>Export</button><button onClick={edit}>Edit</button></nav>
    <section className={styles.attributes}><h3>Atribut</h3><dl>{Object.entries(props).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value === null ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></section>
  </aside>;
}
