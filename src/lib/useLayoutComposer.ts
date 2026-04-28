"use client";

import { useState, useCallback } from "react";

// Paper sizes in mm
export const PAPER_SIZES: Record<string, { width: number; height: number; label: string }> = {
  A4: { width: 210, height: 297, label: "A4 (210 × 297 mm)" },
  A3: { width: 297, height: 420, label: "A3 (297 × 420 mm)" },
  A2: { width: 420, height: 594, label: "A2 (420 × 594 mm)" },
  A1: { width: 594, height: 841, label: "A1 (594 × 841 mm)" },
  A0: { width: 841, height: 1189, label: "A0 (841 × 1189 mm)" },
  Letter: { width: 216, height: 279, label: "Letter (216 × 279 mm)" },
  Legal: { width: 216, height: 356, label: "Legal (216 × 356 mm)" },
};

export type LayoutElementType =
  | "mapFace"
  | "legend"
  | "scaleBar"
  | "northArrow"
  | "infoBlock"
  | "neatline"
  | "freeText"
  | "title";

export type LayoutElement = {
  id: string;
  type: LayoutElementType;
  x: number;      // % from canvas left
  y: number;      // % from canvas top
  width: number;  // % of canvas width
  height: number; // % of canvas height
  zIndex: number;
  locked: boolean;
  config: Record<string, any>;
};

export type PaperSize = keyof typeof PAPER_SIZES | "Custom";
export type Orientation = "portrait" | "landscape";

export type LayoutState = {
  paperSize: PaperSize;
  orientation: Orientation;
  customWidth: number;
  customHeight: number;
  margins: { top: number; right: number; bottom: number; left: number };
  backgroundColor: string;
  elements: LayoutElement[];
  selectedElementId: string | null;
  canvasZoom: number;
  layoutTitle: string;
  mapMetersPerPixel: number;
};

let _idCounter = 0;
function generateId() {
  return `el_${Date.now()}_${++_idCounter}`;
}

// Default template with standard cartographic elements
function createDefaultElements(): LayoutElement[] {
  return [
    {
      id: generateId(),
      type: "neatline",
      x: 2, y: 2, width: 96, height: 96,
      zIndex: 0,
      locked: false,
      config: { borderWidth: 2, borderColor: "#1a1a2e", doubleLine: true },
    },
    {
      id: generateId(),
      type: "title",
      x: 5, y: 3.5, width: 90, height: 5,
      zIndex: 10,
      locked: false,
      config: { text: "PETA LOKASI", fontSize: 22, fontWeight: "bold", textAlign: "center", color: "#1a1a2e" },
    },
    {
      id: generateId(),
      type: "mapFace",
      x: 5, y: 9, width: 90, height: 62,
      zIndex: 1,
      locked: false,
      config: { centerLat: -6.2, centerLng: 106.8, zoom: 12, showBasemap: true },
    },
    {
      id: generateId(),
      type: "legend",
      x: 5, y: 73, width: 28, height: 18,
      zIndex: 5,
      locked: false,
      config: { title: "LEGENDA", fontSize: 10, showAllLayers: true },
    },
    {
      id: generateId(),
      type: "scaleBar",
      x: 36, y: 73, width: 22, height: 7,
      zIndex: 5,
      locked: false,
      config: { unit: "km", style: "bar", segments: 4 },
    },
    {
      id: generateId(),
      type: "northArrow",
      x: 36, y: 81, width: 8, height: 10,
      zIndex: 5,
      locked: false,
      config: { style: "compass" },
    },
    {
      id: generateId(),
      type: "infoBlock",
      x: 60, y: 73, width: 35, height: 18,
      zIndex: 5,
      locked: false,
      config: {
        judul: "PETA LOKASI",
        subtitle: "Peta Bidang Tanah",
        dibuatOleh: "Kantor Pertanahan",
        tanggal: new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
        instansi: "Badan Pertanahan Nasional",
        keterangan: "Sumber data: SAKAGIS",
        proyeksi: "WGS 84 / EPSG:4326",
      },
    },
  ];
}

export function useLayoutComposer() {
  const [state, setState] = useState<LayoutState>({
    paperSize: "A4",
    orientation: "landscape",
    customWidth: 210,
    customHeight: 297,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    backgroundColor: "#ffffff",
    elements: createDefaultElements(),
    selectedElementId: null,
    canvasZoom: 0.7,
    layoutTitle: "Layout Peta",
    mapMetersPerPixel: 0,
  });

  // Get effective paper dimensions (mm) accounting for orientation
  const getEffectiveDimensions = useCallback(() => {
    const size = PAPER_SIZES[state.paperSize] || { width: state.customWidth, height: state.customHeight };
    if (state.orientation === "landscape") {
      return { width: Math.max(size.width, size.height), height: Math.min(size.width, size.height) };
    }
    return { width: Math.min(size.width, size.height), height: Math.max(size.width, size.height) };
  }, [state.paperSize, state.orientation, state.customWidth, state.customHeight]);

  const setPaperSize = useCallback((size: PaperSize) => {
    setState((s) => ({ ...s, paperSize: size }));
  }, []);

  const setOrientation = useCallback((o: Orientation) => {
    setState((s) => ({ ...s, orientation: o }));
  }, []);

  const setCanvasZoom = useCallback((zoom: number) => {
    setState((s) => ({ ...s, canvasZoom: Math.max(0.2, Math.min(2, zoom)) }));
  }, []);

  const selectElement = useCallback((id: string | null) => {
    setState((s) => ({ ...s, selectedElementId: id }));
  }, []);

  const setMapMetersPerPixel = useCallback((mpp: number) => {
    setState((s) => ({ ...s, mapMetersPerPixel: mpp }));
  }, []);

  const addElement = useCallback((type: LayoutElementType) => {
    const defaults: Record<LayoutElementType, Partial<LayoutElement>> = {
      mapFace: { x: 10, y: 10, width: 60, height: 50, config: { centerLat: -6.2, centerLng: 106.8, zoom: 12, showBasemap: true, showGrid: false, gridType: 'geographic', gridInterval: 0 } },
      legend: { x: 5, y: 75, width: 25, height: 15, config: { title: "LEGENDA", fontSize: 10, showAllLayers: true } },
      scaleBar: { x: 35, y: 85, width: 20, height: 6, config: { unit: "km", style: "bar", segments: 4 } },
      northArrow: { x: 80, y: 15, width: 8, height: 10, config: { style: "compass" } },
      infoBlock: { x: 60, y: 75, width: 35, height: 18, config: {
        judul: "JUDUL PETA", subtitle: "", dibuatOleh: "", tanggal: new Date().toLocaleDateString("id-ID"),
        instansi: "", keterangan: "", proyeksi: "WGS 84",
      }},
      neatline: { x: 2, y: 2, width: 96, height: 96, config: { borderWidth: 2, borderColor: "#1a1a2e", doubleLine: true } },
      freeText: { x: 20, y: 50, width: 30, height: 5, config: { text: "Teks", fontSize: 14, fontWeight: "normal", textAlign: "left", color: "#1a1a2e" } },
      title: { x: 10, y: 4, width: 80, height: 5, config: { text: "JUDUL PETA", fontSize: 22, fontWeight: "bold", textAlign: "center", color: "#1a1a2e" } },
    };
    const def = defaults[type];
    const el: LayoutElement = {
      id: generateId(),
      type,
      x: def.x ?? 10,
      y: def.y ?? 10,
      width: def.width ?? 30,
      height: def.height ?? 20,
      zIndex: state.elements.length + 1,
      locked: false,
      config: def.config ?? {},
    };
    setState((s) => ({ ...s, elements: [...s.elements, el], selectedElementId: el.id }));
  }, [state.elements.length]);

  const updateElement = useCallback((id: string, updates: Partial<LayoutElement>) => {
    setState((s) => ({
      ...s,
      elements: s.elements.map((el) => (el.id === id ? { ...el, ...updates } : el)),
    }));
  }, []);

  const updateElementConfig = useCallback((id: string, configUpdates: Record<string, any>) => {
    setState((s) => ({
      ...s,
      elements: s.elements.map((el) =>
        el.id === id ? { ...el, config: { ...el.config, ...configUpdates } } : el
      ),
    }));
  }, []);

  const removeElement = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      elements: s.elements.filter((el) => el.id !== id),
      selectedElementId: s.selectedElementId === id ? null : s.selectedElementId,
    }));
  }, []);

  const setBackgroundColor = useCallback((color: string) => {
    setState((s) => ({ ...s, backgroundColor: color }));
  }, []);

  const resetToDefault = useCallback(() => {
    setState((s) => ({
      ...s,
      elements: createDefaultElements(),
      selectedElementId: null,
    }));
  }, []);

  return {
    state,
    setState,
    getEffectiveDimensions,
    setPaperSize,
    setOrientation,
    setCanvasZoom,
    selectElement,
    addElement,
    updateElement,
    updateElementConfig,
    removeElement,
    setBackgroundColor,
    resetToDefault,
    setMapMetersPerPixel,
  };
}
