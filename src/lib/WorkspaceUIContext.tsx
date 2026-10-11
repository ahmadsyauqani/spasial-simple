"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Feature } from "geojson";
import type { Path, PathOptions } from "leaflet";
import { useMapContext } from "./MapContext";

export type Drawer = "inspector" | "results" | null;
export type FeatureSelection = { layerId: string; layerName: string; feature: Feature; featureIndex: number; path: Path };
export type WorkspaceRequest = { target: "analysis" | "digitize"; toolKey?: string; token: number };
type ExportRequest = { feature: Feature; fileName: string } | null;
type WorkspaceUI = {
  activeDrawer: Drawer; setActiveDrawer: (drawer: Drawer) => void;
  selection: FeatureSelection | null; selectFeature: (selection: FeatureSelection) => void;
  clearSelection: () => void; releaseFeature: (path: Path) => void; fitSelected: () => void;
  request: WorkspaceRequest | null; openWorkspace: (target: WorkspaceRequest["target"], toolKey?: string) => void; consumeRequest: (token: number) => void;
  exportRequest: ExportRequest; setExportRequest: (request: ExportRequest) => void;
};
const WorkspaceUIContext = createContext<WorkspaceUI | null>(null);
export function WorkspaceUIProvider({ children }: { children: ReactNode }) {
  const { layers, mapInstance } = useMapContext();
  const [activeDrawer, setActiveDrawer] = useState<Drawer>(null);
  const [selection, setSelection] = useState<FeatureSelection | null>(null);
  const current = useRef<{ selection: FeatureSelection; style: PathOptions } | null>(null);
  const [request, setRequest] = useState<WorkspaceRequest | null>(null);
  const sequence = useRef(0);
  const [exportRequest, setExportRequest] = useState<ExportRequest>(null);
  const clearSelection = useCallback(() => {
    const previous = current.current;
    current.current = null;
    if (previous) {
      previous.selection.path.setStyle(previous.style);
      previous.selection.path.getElement()?.classList.remove("parcel-selected");
    }
    setSelection(null);
    setActiveDrawer(value => value === "inspector" ? null : value);
  }, []);
  const selectFeature = useCallback((next: FeatureSelection) => {
    clearSelection();
    current.current = { selection: next, style: { ...next.path.options } };
    next.path.setStyle({ color: "#a7cec1", weight: 4, fillColor: "#8fc7b7", fillOpacity: 0.34 });
    next.path.getElement()?.classList.add("parcel-selected");
    next.path.bringToFront();
    setSelection(next);
    setActiveDrawer("inspector");
  }, [clearSelection]);
  const releaseFeature = useCallback((path: Path) => {
    if (current.current?.selection.path === path) clearSelection();
  }, [clearSelection]);
  const fitSelected = useCallback(() => {
    const path = current.current?.selection.path as (Path & { getBounds?: () => import("leaflet").LatLngBounds; getLatLng?: () => import("leaflet").LatLng }) | undefined;
    if (!mapInstance || !path) return;
    const bounds = path.getBounds?.();
    if (bounds?.isValid()) mapInstance.fitBounds(bounds, {padding:[48,48],maxZoom:19,animate:false});
    else if (path.getLatLng) mapInstance.setView(path.getLatLng(), 19, {animate:false});
  }, [mapInstance]);
  const openWorkspace = useCallback((target: WorkspaceRequest["target"], toolKey?: string) => {
    setActiveDrawer(null);
    setRequest({ target, toolKey, token: ++sequence.current });
  }, []);
  const consumeRequest = useCallback((token: number) => setRequest(value => value?.token === token ? null : value), []);
  useEffect(() => {
    if (selection && !layers.some(layer => layer.id === selection.layerId && layer.visible !== false)) clearSelection();
  }, [layers, selection, clearSelection]);
  useEffect(() => {
    if (!mapInstance) return;
    mapInstance.on("click", clearSelection);
    return () => { mapInstance.off("click", clearSelection); };
  }, [mapInstance, clearSelection]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]') || document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (event.key === "Escape") { clearSelection(); setActiveDrawer(null); }
      if (event.key.toLowerCase() === "f" && current.current) { event.preventDefault(); fitSelected(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [clearSelection, fitSelected]);
  const value = useMemo(() => ({ activeDrawer, setActiveDrawer, selection, selectFeature, clearSelection, releaseFeature, fitSelected, request, openWorkspace, consumeRequest, exportRequest, setExportRequest }), [activeDrawer, selection, selectFeature, clearSelection, releaseFeature, fitSelected, request, openWorkspace, consumeRequest, exportRequest]);
  return <WorkspaceUIContext.Provider value={value}>{children}</WorkspaceUIContext.Provider>;
}
export function useWorkspaceUI() {
  const value = useContext(WorkspaceUIContext);
  if (!value) throw new Error("useWorkspaceUI requires WorkspaceUIProvider");
  return value;
}
