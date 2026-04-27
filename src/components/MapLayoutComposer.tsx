"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  X, Map, LayoutGrid, Download, FileImage, FileText, Plus,
  Compass, Ruler, Type, Info, Square, Minus, ZoomIn, ZoomOut,
  RotateCcw, Trash2, Lock, Unlock, Move, ChevronDown, Printer
} from "lucide-react";
import { useMapContext } from "@/lib/MapContext";
import {
  useLayoutComposer, PAPER_SIZES, type LayoutElement, type LayoutElementType, type PaperSize
} from "@/lib/useLayoutComposer";
import { exportToPNG, exportToPDF, downloadBlob, type ExportDPI } from "@/lib/layoutExport";
import { toast } from "sonner";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

// ──────────────────────────────────────────────────────
// MAIN COMPOSER COMPONENT
// ──────────────────────────────────────────────────────
export default function MapLayoutComposer() {
  const { isLayoutComposerOpen, setLayoutComposerOpen, layers, layerGeojsonCache } = useMapContext();
  const composer = useLayoutComposer();
  const { state, getEffectiveDimensions, selectElement } = composer;
  const canvasRef = useRef<HTMLDivElement>(null);
  const printableRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDpi, setExportDpi] = useState<ExportDPI>(300);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLayoutComposerOpen(false);
      if (e.key === "Delete" && state.selectedElementId) {
        composer.removeElement(state.selectedElementId);
      }
    };
    if (isLayoutComposerOpen) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [isLayoutComposerOpen, state.selectedElementId, composer, setLayoutComposerOpen]);

  if (!isLayoutComposerOpen) return null;

  const dims = getEffectiveDimensions();
  // Canvas pixel dimensions (scaled). We use 3px per mm as base.
  const PX_PER_MM = 3;
  const canvasW = dims.width * PX_PER_MM * state.canvasZoom;
  const canvasH = dims.height * PX_PER_MM * state.canvasZoom;

  const handleExportPNG = async () => {
    if (!printableRef.current) return;
    setIsExporting(true);
    try {
      toast.info("Mengekspor layout ke PNG...");
      const blob = await exportToPNG(printableRef.current, exportDpi);
      downloadBlob(blob, `${state.layoutTitle.replace(/\s+/g, "_")}_layout.png`);
      toast.success("Layout berhasil diekspor sebagai PNG!");
    } catch (err: any) {
      toast.error("Gagal export PNG: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!printableRef.current) return;
    setIsExporting(true);
    try {
      toast.info("Mengekspor layout ke PDF...");
      const blob = await exportToPDF(
        printableRef.current,
        state.paperSize,
        state.orientation,
        state.customWidth,
        state.customHeight,
        exportDpi
      );
      downloadBlob(blob, `${state.layoutTitle.replace(/\s+/g, "_")}_layout.pdf`);
      toast.success("Layout berhasil diekspor sebagai PDF!");
    } catch (err: any) {
      toast.error("Gagal export PDF: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="layout-composer-overlay">
      {/* ── HEADER ── */}
      <div className="layout-header">
        <div className="layout-header-left">
          <LayoutGrid className="w-5 h-5 text-orange-400" />
          <span className="layout-header-title">Map Layout Composer</span>
          <span className="layout-header-subtitle">
            {PAPER_SIZES[state.paperSize]?.label ?? `Custom (${state.customWidth}×${state.customHeight} mm)`}
            {" · "}
            {state.orientation === "landscape" ? "Landscape" : "Portrait"}
          </span>
        </div>
        <div className="layout-header-right">
          {/* DPI Select */}
          <div className="layout-dpi-select">
            <span className="text-[10px] text-white/40 mr-1">DPI</span>
            <select
              value={exportDpi}
              onChange={(e) => setExportDpi(Number(e.target.value) as ExportDPI)}
              className="layout-select-mini"
            >
              <option value={72}>72</option>
              <option value={150}>150</option>
              <option value={300}>300</option>
            </select>
          </div>
          <button
            className="layout-export-btn"
            onClick={handleExportPNG}
            disabled={isExporting}
          >
            <FileImage className="w-4 h-4" />
            <span>PNG</span>
          </button>
          <button
            className="layout-export-btn layout-export-btn-primary"
            onClick={handleExportPDF}
            disabled={isExporting}
          >
            <Printer className="w-4 h-4" />
            <span>PDF</span>
          </button>
          <button
            className="layout-close-btn"
            onClick={() => setLayoutComposerOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="layout-body">
        {/* ── LEFT TOOLBAR ── */}
        <ToolPanel composer={composer} />

        {/* ── CANVAS AREA ── */}
        <div className="layout-canvas-area" ref={canvasRef} onClick={() => selectElement(null)}>
          {/* Zoom Controls */}
          <div className="layout-zoom-controls">
            <button onClick={() => composer.setCanvasZoom(state.canvasZoom + 0.1)} title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-white/60 font-mono w-10 text-center">
              {Math.round(state.canvasZoom * 100)}%
            </span>
            <button onClick={() => composer.setCanvasZoom(state.canvasZoom - 0.1)} title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={() => composer.setCanvasZoom(0.7)} title="Fit" className="text-[10px] text-white/50">
              Fit
            </button>
          </div>

          {/* THE PAPER */}
          <div
            ref={printableRef}
            className="layout-paper"
            style={{
              width: canvasW,
              height: canvasH,
              backgroundColor: state.backgroundColor,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {state.elements.map((el) => (
              <DraggableElement
                key={el.id}
                element={el}
                composer={composer}
                canvasW={canvasW}
                canvasH={canvasH}
                layers={layers}
                layerGeojsonCache={layerGeojsonCache}
              />
            ))}
          </div>
        </div>

        {/* ── RIGHT PROPERTIES PANEL ── */}
        <PropertiesPanel composer={composer} layers={layers} />
      </div>

      {/* ── STATUS BAR ── */}
      <div className="layout-statusbar">
        <span>{dims.width} × {dims.height} mm</span>
        <span>·</span>
        <span>{state.elements.length} elemen</span>
        <span>·</span>
        <span>Zoom {Math.round(state.canvasZoom * 100)}%</span>
        {state.selectedElementId && (
          <>
            <span>·</span>
            <span className="text-orange-400">
              {state.elements.find((e) => e.id === state.selectedElementId)?.type ?? ""}
            </span>
          </>
        )}
      </div>

      {/* Export Spinner Overlay */}
      {isExporting && (
        <div className="layout-exporting-overlay">
          <div className="layout-exporting-spinner" />
          <span>Mengekspor layout peta...</span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// LEFT TOOL PANEL
// ──────────────────────────────────────────────────────
function ToolPanel({ composer }: { composer: ReturnType<typeof useLayoutComposer> }) {
  const tools: { type: LayoutElementType; icon: React.ReactNode; label: string }[] = [
    { type: "mapFace", icon: <Map className="w-4 h-4" />, label: "Muka Peta" },
    { type: "legend", icon: <LayoutGrid className="w-4 h-4" />, label: "Legenda" },
    { type: "scaleBar", icon: <Ruler className="w-4 h-4" />, label: "Skala" },
    { type: "northArrow", icon: <Compass className="w-4 h-4" />, label: "Arah Utara" },
    { type: "infoBlock", icon: <Info className="w-4 h-4" />, label: "Info Peta" },
    { type: "neatline", icon: <Square className="w-4 h-4" />, label: "Garis Tepi" },
    { type: "title", icon: <Type className="w-4 h-4" />, label: "Judul" },
    { type: "freeText", icon: <FileText className="w-4 h-4" />, label: "Teks" },
  ];

  return (
    <div className="layout-tool-panel">
      <div className="layout-tool-panel-header">
        <Plus className="w-3.5 h-3.5 text-orange-400" />
        <span>Elemen</span>
      </div>
      {tools.map((t) => (
        <button
          key={t.type}
          className="layout-tool-btn"
          onClick={() => composer.addElement(t.type)}
          title={`Tambah ${t.label}`}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
      <div className="mt-auto pt-4 border-t border-white/10">
        <button
          className="layout-tool-btn text-red-400 hover:!bg-red-500/10"
          onClick={() => composer.resetToDefault()}
          title="Reset ke template default"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// DRAGGABLE ELEMENT WRAPPER
// ──────────────────────────────────────────────────────
function DraggableElement({
  element, composer, canvasW, canvasH, layers, layerGeojsonCache
}: {
  element: LayoutElement;
  composer: ReturnType<typeof useLayoutComposer>;
  canvasW: number;
  canvasH: number;
  layers: any[];
  layerGeojsonCache: Record<string, any>;
}) {
  const { state, selectElement, updateElement } = composer;
  const isSelected = state.selectedElementId === element.id;
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, elX: 0, elY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, elX: 0, elY: 0, handle: "" });

  const left = (element.x / 100) * canvasW;
  const top = (element.y / 100) * canvasH;
  const width = (element.width / 100) * canvasW;
  const height = (element.height / 100) * canvasH;

  // ── DRAG LOGIC ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (element.locked) return;
    e.stopPropagation();
    e.preventDefault();
    selectElement(element.id);
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, elX: element.x, elY: element.y };

    const onMove = (me: MouseEvent) => {
      const dx = ((me.clientX - dragStart.current.x) / canvasW) * 100;
      const dy = ((me.clientY - dragStart.current.y) / canvasH) * 100;
      updateElement(element.id, {
        x: Math.max(0, Math.min(100 - element.width, dragStart.current.elX + dx)),
        y: Math.max(0, Math.min(100 - element.height, dragStart.current.elY + dy)),
      });
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [element, canvasW, canvasH, selectElement, updateElement]);

  // ── RESIZE LOGIC ──
  const onResizeDown = useCallback((e: React.MouseEvent, handle: string) => {
    if (element.locked) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStart.current = {
      x: e.clientX, y: e.clientY,
      w: element.width, h: element.height,
      elX: element.x, elY: element.y,
      handle,
    };

    const onMove = (me: MouseEvent) => {
      const dx = ((me.clientX - resizeStart.current.x) / canvasW) * 100;
      const dy = ((me.clientY - resizeStart.current.y) / canvasH) * 100;
      const s = resizeStart.current;
      let nx = s.elX, ny = s.elY, nw = s.w, nh = s.h;

      if (handle.includes("e")) nw = Math.max(5, s.w + dx);
      if (handle.includes("w")) { nw = Math.max(5, s.w - dx); nx = s.elX + dx; }
      if (handle.includes("s")) nh = Math.max(3, s.h + dy);
      if (handle.includes("n")) { nh = Math.max(3, s.h - dy); ny = s.elY + dy; }

      updateElement(element.id, { x: nx, y: ny, width: nw, height: nh });
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [element, canvasW, canvasH, updateElement]);

  return (
    <div
      ref={ref}
      className={`layout-element ${isSelected ? "layout-element-selected" : ""} ${isDragging ? "layout-element-dragging" : ""}`}
      style={{
        position: "absolute",
        left, top, width, height,
        zIndex: element.zIndex,
        cursor: element.locked ? "default" : "move",
      }}
      onMouseDown={onMouseDown}
      onClick={(e) => { e.stopPropagation(); selectElement(element.id); }}
    >
      {/* Render content based on type */}
      <ElementContent element={element} composer={composer} layers={layers} layerGeojsonCache={layerGeojsonCache} width={width} height={height} />

      {/* Resize Handles (only when selected) */}
      {isSelected && !element.locked && (
        <>
          {["nw", "ne", "sw", "se", "n", "s", "e", "w"].map((handle) => (
            <div
              key={handle}
              className={`layout-handle layout-handle-${handle}`}
              onMouseDown={(e) => onResizeDown(e, handle)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// ELEMENT CONTENT RENDERERS
// ──────────────────────────────────────────────────────
function ElementContent({ element, composer, layers, layerGeojsonCache, width, height }: {
  element: LayoutElement;
  composer: ReturnType<typeof useLayoutComposer>;
  layers: any[];
  layerGeojsonCache: Record<string, any>;
  width: number;
  height: number;
}) {
  switch (element.type) {
    case "mapFace":
      return <MapFaceElement element={element} composer={composer} layers={layers} layerGeojsonCache={layerGeojsonCache} width={width} height={height} />;
    case "legend":
      return <LegendElement element={element} layers={layers} />;
    case "scaleBar":
      return <ScaleBarElement element={element} composer={composer} width={width} />;
    case "northArrow":
      return <NorthArrowElement element={element} width={width} height={height} />;
    case "infoBlock":
      return <InfoBlockElement element={element} />;
    case "neatline":
      return <NeatlineElement element={element} />;
    case "title":
    case "freeText":
      return <TextElement element={element} />;
    default:
      return <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">?</div>;
  }
}

// MAP FACE — synced with the main working map
function MapFaceElement({ element, composer, layers, layerGeojsonCache, width, height }: {
  element: LayoutElement;
  composer: ReturnType<typeof useLayoutComposer>;
  layers: any[];
  layerGeojsonCache: Record<string, any>;
  width: number;
  height: number;
}) {
  const { mapViewState } = useMapContext();
  const cfg = element.config;

  // Only render map if has minimum size
  if (width < 30 || height < 30) {
    return <div className="w-full h-full bg-slate-100 flex items-center justify-center text-xs text-slate-400 border border-slate-300">Peta (terlalu kecil)</div>;
  }

  // Collect all available geojson for fitting bounds
  const allGeojsons = layers
    .map((l) => layerGeojsonCache[l.id!])
    .filter(Boolean);

  // Use the main map's current center/zoom as initial position
  const initialCenter: [number, number] = mapViewState.center;
  const initialZoom = mapViewState.zoom;

  return (
    <div className="w-full h-full overflow-hidden border border-slate-300" style={{ pointerEvents: "auto" }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        zoomControl={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%", background: "#1a1a1a" }}
        dragging={true}
        scrollWheelZoom={true}
        key={`mapface-${element.id}`}
      >
        {cfg.showBasemap !== false && (
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution=""
          />
        )}
        {layers.map((layer) => {
          const geojson = layerGeojsonCache[layer.id!];
          if (!geojson) return null;
          const style = layer.style || { color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.3, weight: 2 };
          return (
            <GeoJSON
              key={`layout-${layer.id}-${JSON.stringify(style)}`}
              data={geojson}
              style={() => ({ color: style.color, fillColor: style.fillColor, fillOpacity: style.fillOpacity, weight: style.weight })}
            />
          );
        })}
        {/* Auto-fit to layer bounds on mount */}
        <FitBoundsController geojsons={allGeojsons} />
        <MapFaceController composer={composer} />
      </MapContainer>
    </div>
  );
}

// Helper: auto-fit map bounds to all layers on mount
function FitBoundsController({ geojsons }: { geojsons: any[] }) {
  const map = useMap();

  useEffect(() => {
    if (geojsons.length === 0) return;
    try {
      const featureGroup = L.featureGroup();
      geojsons.forEach((gj) => {
        L.geoJSON(gj).addTo(featureGroup);
      });
      const bounds = featureGroup.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
      }
    } catch (e) {
      console.warn("Layout map: gagal fit bounds", e);
    }
  }, [map, geojsons.length]);

  return null;
}

// Controller to compute actual scale in meters per pixel
function MapFaceController({ composer }: { composer: ReturnType<typeof useLayoutComposer> }) {
  const map = useMap();

  useEffect(() => {
    const updateScale = () => {
      try {
        const y = map.getSize().y / 2;
        const p1 = map.containerPointToLatLng([0, y]);
        const p2 = map.containerPointToLatLng([100, y]); // Use 100px reference
        const dist = map.distance(p1, p2);
        const mpp = dist / 100;
        composer.setMapMetersPerPixel(mpp);
      } catch (e) {
        // map might not be fully initialized
      }
    };
    
    map.on('move', updateScale);
    map.on('zoom', updateScale);
    // run once on mount
    updateScale();

    return () => {
      map.off('move', updateScale);
      map.off('zoom', updateScale);
    };
  }, [map, composer]);

  return null;
}

// LEGEND
function LegendElement({ element, layers }: { element: LayoutElement; layers: any[] }) {
  const cfg = element.config;
  return (
    <div className="w-full h-full bg-white border border-slate-300 p-2 overflow-hidden flex flex-col">
      <div className="font-bold text-center border-b border-slate-200 pb-1 mb-1" style={{ fontSize: cfg.fontSize || 10, color: "#1a1a2e" }}>
        {cfg.title || "LEGENDA"}
      </div>
      <div className="flex flex-col gap-1 overflow-auto flex-1">
        {layers.length === 0 ? (
          <span className="text-[9px] text-gray-400 italic">Tidak ada layer</span>
        ) : (
          layers.map((layer) => {
            const style = layer.style || { fillColor: "#3b82f6" };
            return (
              <div key={layer.id} className="flex items-center gap-1.5">
                <div
                  className="w-4 h-3 rounded-sm border border-black/20 shrink-0"
                  style={{ backgroundColor: style.fillColor, opacity: style.fillOpacity ?? 0.6 }}
                />
                <span className="text-[9px] text-slate-700 truncate leading-tight">{layer.name?.replace(/\.[^/.]+$/, "")}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// SCALE BAR
function ScaleBarElement({ element, composer, width }: { element: LayoutElement; composer: ReturnType<typeof useLayoutComposer>; width: number }) {
  const cfg = element.config;
  const style = cfg.style || "bar";
  const mpp = composer.state.mapMetersPerPixel || 0;

  if (style === "numeric") {
      const scaleValue = mpp > 0 ? Math.round(mpp * 3000 * composer.state.canvasZoom) : 0;
      const formattedScale = scaleValue > 0 ? `1 : ${scaleValue.toLocaleString("id-ID")}` : "1 : -";
      
      return (
        <div className="w-full h-full bg-white border border-slate-300 flex items-center justify-center p-1">
           <span style={{ fontSize: cfg.fontSize || 14, fontWeight: "bold", color: "#1a1a2e", fontFamily: "monospace" }}>
               {formattedScale}
           </span>
        </div>
      );
  }

  const segments = cfg.segments || 4;
  const maxBarWidth = Math.max(60, width - 20); // available width in px
  
  let displayVal = 0;
  let unit = "m";
  let finalBarWidth = maxBarWidth;

  if (mpp > 0) {
      const maxMeters = maxBarWidth * mpp;
      
      const pow10 = Math.pow(10, (Math.floor(maxMeters) + '').length - 1);
      let d = maxMeters / pow10;
      d = d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1;
      const roundedMeters = pow10 * d;
      
      finalBarWidth = roundedMeters / mpp; // adjust width so it exactly matches roundedMeters
      
      if (roundedMeters >= 1000) {
         displayVal = roundedMeters / 1000;
         unit = "km";
      } else {
         displayVal = roundedMeters;
         unit = "m";
      }
  } else {
      finalBarWidth = 100;
      displayVal = 1;
      unit = "km";
  }

  return (
    <div className="w-full h-full bg-white border border-slate-300 flex flex-col items-center justify-center p-1">
      <div className="flex items-end" style={{ width: finalBarWidth }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className="h-2 border border-black/80"
            style={{
              width: `${100 / segments}%`,
              backgroundColor: i % 2 === 0 ? "#1a1a2e" : "#ffffff",
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-0.5 px-1" style={{ width: finalBarWidth }}>
        <span className="text-[8px] text-slate-600 font-mono">0</span>
        <span className="text-[8px] text-slate-600 font-mono">{displayVal} {unit}</span>
      </div>
      <div className="text-[7px] text-slate-400 mt-0.5">Skala Grafis</div>
    </div>
  );
}

// NORTH ARROW
function NorthArrowElement({ element, width, height }: { element: LayoutElement; width: number; height: number }) {
  const size = Math.min(width, height) * 0.8;
  return (
    <div className="w-full h-full bg-white border border-slate-300 flex items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}>
        {/* Outer circle */}
        <circle cx="50" cy="50" r="46" fill="none" stroke="#1a1a2e" strokeWidth="1.5" />
        {/* N letter */}
        <text x="50" y="16" textAnchor="middle" fill="#1a1a2e" fontSize="12" fontWeight="bold" fontFamily="serif">N</text>
        {/* Arrow up (dark) */}
        <polygon points="50,20 58,55 50,48 42,55" fill="#1a1a2e" />
        {/* Arrow down (light) */}
        <polygon points="50,80 58,55 50,62 42,55" fill="#b0b0b0" stroke="#1a1a2e" strokeWidth="0.5" />
        {/* Center dot */}
        <circle cx="50" cy="55" r="3" fill="#c0392b" />
        {/* S letter */}
        <text x="50" y="96" textAnchor="middle" fill="#888" fontSize="9" fontFamily="serif">S</text>
        <text x="6" y="54" textAnchor="middle" fill="#888" fontSize="9" fontFamily="serif">W</text>
        <text x="94" y="54" textAnchor="middle" fill="#888" fontSize="9" fontFamily="serif">E</text>
      </svg>
    </div>
  );
}

// INFO BLOCK
function InfoBlockElement({ element }: { element: LayoutElement }) {
  const cfg = element.config;
  const rows = [
    { label: "Judul", value: cfg.judul },
    { label: "Subtitle", value: cfg.subtitle },
    { label: "Dibuat Oleh", value: cfg.dibuatOleh },
    { label: "Tanggal", value: cfg.tanggal },
    { label: "Instansi", value: cfg.instansi },
    { label: "Proyeksi", value: cfg.proyeksi },
    { label: "Keterangan", value: cfg.keterangan },
  ].filter((r) => r.value);

  return (
    <div className="w-full h-full bg-white border border-slate-300 overflow-hidden">
      <table className="w-full h-full border-collapse text-[9px]">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-200 last:border-0">
              <td className="px-1.5 py-0.5 font-semibold text-slate-500 bg-slate-50 whitespace-nowrap align-top border-r border-slate-200 w-20">
                {row.label}
              </td>
              <td className="px-1.5 py-0.5 text-slate-800 align-top">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// NEATLINE (Border Frame)
function NeatlineElement({ element }: { element: LayoutElement }) {
  const cfg = element.config;
  const bw = cfg.borderWidth || 2;
  const bc = cfg.borderColor || "#1a1a2e";
  const double = cfg.doubleLine;

  return (
    <div className="w-full h-full pointer-events-none" style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `${bw}px solid ${bc}`,
          pointerEvents: "none",
        }}
      />
      {double && (
        <div
          style={{
            position: "absolute",
            inset: bw + 2,
            border: `${Math.max(1, bw - 1)}px solid ${bc}`,
            opacity: 0.5,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

// TEXT (Title & Free Text)
function TextElement({ element }: { element: LayoutElement }) {
  const cfg = element.config;
  return (
    <div
      className="w-full h-full flex items-center overflow-hidden"
      style={{
        justifyContent: cfg.textAlign === "center" ? "center" : cfg.textAlign === "right" ? "flex-end" : "flex-start",
      }}
    >
      <span
        style={{
          fontSize: cfg.fontSize || 14,
          fontWeight: cfg.fontWeight || "normal",
          color: cfg.color || "#1a1a2e",
          textAlign: cfg.textAlign || "left",
          width: "100%",
          lineHeight: 1.2,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: cfg.fontWeight === "bold" ? "0.05em" : "normal",
        }}
      >
        {cfg.text || "Teks"}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// RIGHT PROPERTIES PANEL
// ──────────────────────────────────────────────────────
function PropertiesPanel({ composer, layers }: { composer: ReturnType<typeof useLayoutComposer>; layers: any[] }) {
  const { state, setPaperSize, setOrientation, setBackgroundColor, updateElementConfig, removeElement, updateElement } = composer;
  const selectedEl = state.elements.find((e) => e.id === state.selectedElementId);

  return (
    <div className="layout-props-panel">
      {/* ── PAPER SETTINGS (always visible) ── */}
      <div className="layout-props-section">
        <div className="layout-props-header">
          <FileText className="w-3.5 h-3.5 text-orange-400" />
          <span>Pengaturan Halaman</span>
        </div>

        <label className="layout-props-label">Ukuran Kertas</label>
        <select
          value={state.paperSize}
          onChange={(e) => setPaperSize(e.target.value as PaperSize)}
          className="layout-props-select"
        >
          {Object.entries(PAPER_SIZES).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
          <option value="Custom">Custom</option>
        </select>

        <label className="layout-props-label">Orientasi</label>
        <div className="layout-props-toggle">
          <button
            className={`layout-props-toggle-btn ${state.orientation === "portrait" ? "active" : ""}`}
            onClick={() => setOrientation("portrait")}
          >
            Portrait
          </button>
          <button
            className={`layout-props-toggle-btn ${state.orientation === "landscape" ? "active" : ""}`}
            onClick={() => setOrientation("landscape")}
          >
            Landscape
          </button>
        </div>

        <label className="layout-props-label">Warna Latar</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={state.backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
          />
          <span className="text-[10px] text-white/40 font-mono uppercase">{state.backgroundColor}</span>
        </div>
      </div>

      {/* ── ELEMENT PROPERTIES (context-sensitive) ── */}
      {selectedEl ? (
        <div className="layout-props-section flex-1 overflow-y-auto">
          <div className="layout-props-header">
            <Move className="w-3.5 h-3.5 text-orange-400" />
            <span>{getElementLabel(selectedEl.type)}</span>
            <button
              className="ml-auto p-1 rounded hover:bg-red-500/10 text-white/40 hover:text-red-400"
              onClick={() => removeElement(selectedEl.id)}
              title="Hapus elemen"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Position & Size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="layout-props-label">X (%)</label>
              <input type="number" value={Math.round(selectedEl.x)} onChange={(e) => updateElement(selectedEl.id, { x: Number(e.target.value) })} className="layout-props-input" step={1} />
            </div>
            <div>
              <label className="layout-props-label">Y (%)</label>
              <input type="number" value={Math.round(selectedEl.y)} onChange={(e) => updateElement(selectedEl.id, { y: Number(e.target.value) })} className="layout-props-input" step={1} />
            </div>
            <div>
              <label className="layout-props-label">Lebar (%)</label>
              <input type="number" value={Math.round(selectedEl.width)} onChange={(e) => updateElement(selectedEl.id, { width: Number(e.target.value) })} className="layout-props-input" step={1} />
            </div>
            <div>
              <label className="layout-props-label">Tinggi (%)</label>
              <input type="number" value={Math.round(selectedEl.height)} onChange={(e) => updateElement(selectedEl.id, { height: Number(e.target.value) })} className="layout-props-input" step={1} />
            </div>
          </div>

          {/* Lock */}
          <button
            className={`mt-2 flex items-center gap-1.5 text-xs px-2 py-1 rounded ${selectedEl.locked ? "bg-orange-500/20 text-orange-300" : "bg-white/5 text-white/50"} hover:bg-white/10 transition-colors`}
            onClick={() => updateElement(selectedEl.id, { locked: !selectedEl.locked })}
          >
            {selectedEl.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {selectedEl.locked ? "Terkunci" : "Tidak Terkunci"}
          </button>

          {/* Type-specific config */}
          <div className="mt-3 pt-3 border-t border-white/10">
            <ElementConfigEditor element={selectedEl} composer={composer} />
          </div>
        </div>
      ) : (
        <div className="layout-props-section flex-1 flex flex-col items-center justify-center text-white/20 text-xs text-center gap-2">
          <Move className="w-8 h-8 opacity-30" />
          <span>Klik elemen di canvas<br />untuk mengatur propertinya</span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// CONFIG EDITOR PER ELEMENT TYPE
// ──────────────────────────────────────────────────────
function ElementConfigEditor({ element, composer }: { element: LayoutElement; composer: ReturnType<typeof useLayoutComposer> }) {
  const { updateElementConfig } = composer;
  const cfg = element.config;

  switch (element.type) {
    case "title":
    case "freeText":
      return (
        <div className="flex flex-col gap-2">
          <label className="layout-props-label">Teks</label>
          <input value={cfg.text || ""} onChange={(e) => updateElementConfig(element.id, { text: e.target.value })} className="layout-props-input" />
          <label className="layout-props-label">Ukuran Font</label>
          <input type="number" value={cfg.fontSize || 14} onChange={(e) => updateElementConfig(element.id, { fontSize: Number(e.target.value) })} className="layout-props-input" min={6} max={72} />
          <label className="layout-props-label">Tebal</label>
          <select value={cfg.fontWeight || "normal"} onChange={(e) => updateElementConfig(element.id, { fontWeight: e.target.value })} className="layout-props-select">
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
          </select>
          <label className="layout-props-label">Posisi Teks</label>
          <select value={cfg.textAlign || "left"} onChange={(e) => updateElementConfig(element.id, { textAlign: e.target.value })} className="layout-props-select">
            <option value="left">Kiri</option>
            <option value="center">Tengah</option>
            <option value="right">Kanan</option>
          </select>
          <label className="layout-props-label">Warna</label>
          <input type="color" value={cfg.color || "#1a1a2e"} onChange={(e) => updateElementConfig(element.id, { color: e.target.value })} className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent" />
        </div>
      );

    case "mapFace":
      return (
        <div className="flex flex-col gap-2">
          <label className="layout-props-label">Latitude Pusat</label>
          <input type="number" value={cfg.centerLat || -6.2} onChange={(e) => updateElementConfig(element.id, { centerLat: Number(e.target.value) })} className="layout-props-input" step={0.01} />
          <label className="layout-props-label">Longitude Pusat</label>
          <input type="number" value={cfg.centerLng || 106.8} onChange={(e) => updateElementConfig(element.id, { centerLng: Number(e.target.value) })} className="layout-props-input" step={0.01} />
          <label className="layout-props-label">Zoom Level</label>
          <input type="number" value={cfg.zoom || 12} onChange={(e) => updateElementConfig(element.id, { zoom: Number(e.target.value) })} className="layout-props-input" min={1} max={20} />
          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer mt-1">
            <input type="checkbox" checked={cfg.showBasemap !== false} onChange={(e) => updateElementConfig(element.id, { showBasemap: e.target.checked })} className="rounded" />
            Tampilkan Basemap
          </label>
        </div>
      );

    case "legend":
      return (
        <div className="flex flex-col gap-2">
          <label className="layout-props-label">Judul Legenda</label>
          <input value={cfg.title || "LEGENDA"} onChange={(e) => updateElementConfig(element.id, { title: e.target.value })} className="layout-props-input" />
          <label className="layout-props-label">Ukuran Font</label>
          <input type="number" value={cfg.fontSize || 10} onChange={(e) => updateElementConfig(element.id, { fontSize: Number(e.target.value) })} className="layout-props-input" min={6} max={24} />
        </div>
      );

    case "scaleBar":
      return (
        <div className="flex flex-col gap-2">
          <label className="layout-props-label">Jenis Skala</label>
          <select value={cfg.style || "bar"} onChange={(e) => updateElementConfig(element.id, { style: e.target.value })} className="layout-props-select">
            <option value="bar">Skala Grafis (Bar)</option>
            <option value="numeric">Skala Angka (1:X)</option>
          </select>
          {cfg.style === "numeric" ? (
             <>
               <label className="layout-props-label">Ukuran Font</label>
               <input type="number" value={cfg.fontSize || 14} onChange={(e) => updateElementConfig(element.id, { fontSize: Number(e.target.value) })} className="layout-props-input" min={6} max={72} />
             </>
          ) : (
             <>
                <label className="layout-props-label">Jumlah Segmen</label>
                <input type="number" value={cfg.segments || 4} onChange={(e) => updateElementConfig(element.id, { segments: Number(e.target.value) })} className="layout-props-input" min={2} max={10} />
             </>
          )}
        </div>
      );

    case "northArrow":
      return (
        <div className="flex flex-col gap-2">
          <label className="layout-props-label">Gaya</label>
          <select value={cfg.style || "compass"} onChange={(e) => updateElementConfig(element.id, { style: e.target.value })} className="layout-props-select">
            <option value="compass">Kompas</option>
            <option value="simple">Panah Sederhana</option>
          </select>
        </div>
      );

    case "infoBlock":
      return (
        <div className="flex flex-col gap-2">
          {[
            { key: "judul", label: "Judul Peta" },
            { key: "subtitle", label: "Subtitle" },
            { key: "dibuatOleh", label: "Dibuat Oleh" },
            { key: "tanggal", label: "Tanggal" },
            { key: "instansi", label: "Instansi" },
            { key: "proyeksi", label: "Sistem Proyeksi" },
            { key: "keterangan", label: "Keterangan" },
          ].map((field) => (
            <div key={field.key}>
              <label className="layout-props-label">{field.label}</label>
              <input
                value={cfg[field.key] || ""}
                onChange={(e) => updateElementConfig(element.id, { [field.key]: e.target.value })}
                className="layout-props-input"
              />
            </div>
          ))}
        </div>
      );

    case "neatline":
      return (
        <div className="flex flex-col gap-2">
          <label className="layout-props-label">Ketebalan (px)</label>
          <input type="number" value={cfg.borderWidth || 2} onChange={(e) => updateElementConfig(element.id, { borderWidth: Number(e.target.value) })} className="layout-props-input" min={1} max={10} />
          <label className="layout-props-label">Warna</label>
          <input type="color" value={cfg.borderColor || "#1a1a2e"} onChange={(e) => updateElementConfig(element.id, { borderColor: e.target.value })} className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent" />
          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer mt-1">
            <input type="checkbox" checked={cfg.doubleLine || false} onChange={(e) => updateElementConfig(element.id, { doubleLine: e.target.checked })} className="rounded" />
            Garis Ganda (Double Line)
          </label>
        </div>
      );

    default:
      return null;
  }
}

function getElementLabel(type: LayoutElementType): string {
  const map: Record<LayoutElementType, string> = {
    mapFace: "Muka Peta",
    legend: "Legenda",
    scaleBar: "Skala",
    northArrow: "Arah Utara",
    infoBlock: "Informasi Peta",
    neatline: "Garis Tepi",
    freeText: "Teks Bebas",
    title: "Judul",
  };
  return map[type] || type;
}
