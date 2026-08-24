"use client";

import MapWrapper from "@/components/MapWrapper";
import { CommandPalette } from "@/components/CommandPalette";
import { UploadDatasetPanel } from "@/components/UploadDatasetPanel";
import { DigitizePanel } from "@/components/DigitizePanel";
import { GpsTrackingTrigger, GpsTrackingPanel } from "@/components/GpsTrackingPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchControl } from "@/components/SearchControl";
import { ClockWidget } from "@/components/ClockWidget";
import SpatialConverterModal from "@/components/SpatialConverter";
import { DeviceHubPanel } from "@/components/DeviceHubPanel";
import { DraggableAssistant } from "@/components/DraggableAssistant";
import dynamic from "next/dynamic";
const FlightPathPlanner = dynamic(
  () => import("@/components/FlightPathPlanner").then(m => m.FlightPathPlanner),
  { ssr: false }
);
import { RefreshCcw, Database, UploadCloud, Pin, Cpu, X, BarChart3, LayoutGrid, HardDrive, Undo2, Check, MousePointer2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Map as LeafletMap } from "leaflet";
import AuthGuard from "@/components/AuthGuard";
import { useMapContext } from "@/lib/MapContext";
import { AttributeTablePanel } from "@/components/AttributeTablePanel";
import { Table2 } from "lucide-react";
import { UserProfileWidget } from "@/components/UserProfileWidget";
import { AnalysisResultsPanel } from "@/components/AnalysisResultsPanel";
import { FeatureExportDialogHost } from "@/components/FeatureExportDialog";

export default function Home() {
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"digitize" | "dataset">("digitize");
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDeviceHubOpen, setIsDeviceHubOpen] = useState(false);
  const [isFlightPlannerOpen, setIsFlightPlannerOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<"data" | "digitize" | "analysis" | "layout" | "device">("digitize");
  const {
    isAttributeTableOpen, setIsAttributeTableOpen, setLayoutComposerOpen,
    activeDigitizingLayerId, setActiveDigitizingLayerId, mapInstance,
    layers, layerGeojsonCache,
  } = useMapContext();

  const isDrawing = Boolean(activeDigitizingLayerId);
  const isPanelVisible = !isDrawing && (isSidebarPinned || isHovered);

  const stopDrawing = () => {
    try {
      mapInstance?.pm?.disableDraw();
    } catch (error) {
      console.warn("Geoman disableDraw error:", error);
    }
    setActiveDigitizingLayerId(null);
  };

  const openPanel = (tab: "digitize" | "dataset", tool: "data" | "digitize" | "analysis") => {
    if (isDrawing && tool !== "digitize") stopDrawing();
    setIsDeviceHubOpen(false);
    setIsAttributeTableOpen(false);
    setLayoutComposerOpen(false);
    setActiveTool(tool);
    setActiveTab(tab);
    setIsSidebarPinned(true);
    setIsHovered(true);
  };

  return (
    <AuthGuard>
    <main className={cn("sakagis-app relative w-full h-screen overflow-hidden touch-manipulation", isDrawing && "digitizing-active")}>
        <UserProfileWidget />
        <MapWrapper />
      <SearchControl />
      <AnalysisResultsPanel />
      <FeatureExportDialogHost />
      <ClockWidget />

      {/* ── Icon Rail: compact pill, always visible, h-fit ── */}
      <div
        className="desktop-tool-rail absolute top-4 left-4 z-20 hidden lg:flex flex-col items-center gap-1 py-2 px-1.5 rounded-2xl border border-border/50 bg-card/85 backdrop-blur-2xl shadow-xl w-[52px] overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Accent line */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl transition-all duration-500",
          activeTool === "digitize"
            ? "bg-gradient-to-r from-orange-500 via-orange-400/50 to-transparent"
            : activeTool === "analysis"
              ? "bg-gradient-to-r from-emerald-500 via-emerald-400/50 to-transparent"
              : "bg-gradient-to-r from-cyan-400 via-cyan-400/50 to-transparent"
        )} />

        {/* Logo */}
        <div className="relative p-1 group/logo mt-1">
          <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full scale-150 opacity-0 group-hover/logo:opacity-100 transition-opacity duration-500" />
          <img
            src="/logo-sakagis.png"
            alt="SAKAGIS"
            className="relative w-7 h-7 object-contain mix-blend-multiply dark:invert dark:mix-blend-screen"
          />
        </div>

        {/* Colored divider */}
        <div className={cn(
          "w-5 h-px rounded-full transition-colors duration-300 my-0.5",
          activeTool === "digitize" ? "bg-orange-500/40" : activeTool === "analysis" ? "bg-emerald-500/40" : "bg-cyan-500/40"
        )} />

        {/* Digitize button */}
        <button
          onClick={() => openPanel("digitize", "digitize")}
          title="Digitasi Data"
          aria-label="Digitasi Data"
          className={cn(
            "p-2.5 rounded-xl transition-all duration-200 w-full flex justify-center",
            activeTool === "digitize"
              ? "bg-orange-500/20 text-orange-400"
              : "text-muted-foreground hover:bg-white/10 hover:text-white"
          )}
        >
          <Database className="w-[17px] h-[17px]" />
        </button>

        {/* Dataset button */}
        <button
          onClick={() => openPanel("dataset", "data")}
          title="Data & Layer"
          aria-label="Data dan Layer"
          className={cn(
            "p-2.5 rounded-xl transition-all duration-200 w-full flex justify-center",
            activeTool === "data"
              ? "bg-cyan-500/20 text-cyan-400"
              : "text-muted-foreground hover:bg-white/10 hover:text-white"
          )}
        >
          <UploadCloud className="w-[17px] h-[17px]" />
        </button>

        <button
          onClick={() => openPanel("dataset", "analysis")}
          title="Analisis Spasial"
          aria-label="Analisis Spasial"
          className={cn(
            "p-2.5 rounded-xl transition-all duration-200 w-full flex justify-center",
            activeTool === "analysis"
              ? "bg-emerald-500/20 text-emerald-400"
              : "text-muted-foreground hover:bg-white/10 hover:text-white"
          )}
        >
          <BarChart3 className="w-[17px] h-[17px]" />
        </button>

        <button
          onClick={() => { if (isDrawing) stopDrawing(); setActiveTool("layout"); setIsSidebarPinned(false); setIsHovered(false); setIsDeviceHubOpen(false); setIsAttributeTableOpen(false); setLayoutComposerOpen(true); }}
          title="Layout Peta"
          aria-label="Layout Peta"
          className={cn(
            "p-2.5 rounded-xl transition-all duration-200 w-full flex justify-center",
            activeTool === "layout"
              ? "bg-violet-500/20 text-violet-400"
              : "text-muted-foreground hover:bg-white/10 hover:text-white"
          )}
        >
          <LayoutGrid className="w-[17px] h-[17px]" />
        </button>

        {/* Gray divider */}
        <div className="w-5 h-px bg-border/25 rounded-full my-0.5" />

        {/* Device Hub button */}
        <button
          onClick={() => { if (isDrawing) stopDrawing(); setActiveTool("device"); setIsSidebarPinned(false); setIsHovered(false); setIsAttributeTableOpen(false); setLayoutComposerOpen(false); setIsDeviceHubOpen(true); }}
          title="Perangkat dan GPS"
          aria-label="Perangkat dan GPS"
          className={cn(
            "p-2.5 rounded-xl transition-all duration-200 w-full flex justify-center",
            activeTool === "device"
              ? "bg-amber-500/20 text-amber-400"
              : "text-muted-foreground hover:bg-white/10 hover:text-white"
          )}
        >
          <HardDrive className="w-[17px] h-[17px]" />
        </button>

        {/* Thin divider */}
        <div className="w-5 h-px bg-border/25 rounded-full my-0.5" />

        {/* Attribute Table Toggle */}
        <button
          onClick={() => { if (isDrawing) stopDrawing(); setActiveTool("data"); setIsSidebarPinned(false); setIsDeviceHubOpen(false); setLayoutComposerOpen(false); setIsAttributeTableOpen(!isAttributeTableOpen); }}
          title="Tabel Atribut"
          className={cn(
            "p-2.5 rounded-xl transition-all duration-200 w-full flex justify-center",
            isAttributeTableOpen
              ? "bg-purple-500/20 text-purple-400"
              : "text-muted-foreground hover:bg-white/10 hover:text-white"
          )}
        >
          <Table2 className="w-[17px] h-[17px]" />
        </button>

        {/* Thin divider */}
        <div className="w-5 h-px bg-border/25 rounded-full my-0.5" />

        {/* Pin button */}
        <button
          onClick={() => setIsSidebarPinned(!isSidebarPinned)}
          title={isSidebarPinned ? "Lepas Pin" : "Pin Panel"}
          className={cn(
            "p-2 rounded-xl transition-all duration-200 w-full flex justify-center mb-1",
            isSidebarPinned
              ? "bg-orange-500/20 text-orange-400"
              : "text-muted-foreground/40 hover:bg-white/10 hover:text-white"
          )}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Mobile backdrop for bottom sheet ── */}
      {isPanelVisible && (
        <div
          className="workspace-backdrop lg:hidden fixed inset-0 z-[15] bg-black/40 backdrop-blur-[2px]"
          onClick={() => { setIsSidebarPinned(false); setIsHovered(false); }}
        />
      )}

      {/* ── Content Panel: side panel (desktop) / bottom sheet (mobile) ── */}
      <div
        className={cn(
          "workspace-panel absolute z-[20] flex flex-col rounded-2xl border border-border/50 bg-card/85 backdrop-blur-2xl shadow-xl overflow-hidden",
          "left-2 right-2 bottom-[calc(76px+env(safe-area-inset-bottom))] max-h-[62vh]",
          "lg:left-[68px] lg:right-auto lg:top-4 lg:bottom-auto lg:w-[320px] lg:max-w-[320px] lg:max-h-[75vh]",
          "transition-all duration-300 ease-out",
          isPanelVisible
            ? "opacity-100 translate-x-0 translate-y-0 pointer-events-auto"
            : "opacity-0 pointer-events-none translate-y-full lg:translate-y-0 lg:-translate-x-3"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Accent line */}
        <div className={cn(
          "h-[2px] shrink-0 transition-all duration-500",
          activeTool === "digitize"
            ? "bg-gradient-to-r from-orange-500 via-orange-400/50 to-transparent"
            : activeTool === "analysis"
              ? "bg-gradient-to-r from-emerald-500 via-emerald-400/50 to-transparent"
              : "bg-gradient-to-r from-cyan-400 via-cyan-400/50 to-transparent"
        )} />

        {/* Brand header */}
        <div className="workspace-panel-header flex items-center justify-between px-3 py-2.5 border-b border-border/20 shrink-0">
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-tighter bg-gradient-to-br from-navy to-navy/70 dark:from-white dark:to-white/60 bg-clip-text text-transparent leading-tight">
              SAKAGIS
            </span>
            <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-orange-500/80">
              Spatial Studio
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsConverterOpen(true)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-emerald-400"
              title="Spatial Converter"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
            <ThemeToggle />
            <GpsTrackingTrigger />
            <button
               onClick={() => { setIsSidebarPinned(false); setIsHovered(false); }}
              className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
              title="Tutup Panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="workspace-panel-tabs flex items-center gap-1 px-2 py-1.5 border-b border-border/20 bg-black/10 shrink-0">
          <button
             onClick={() => { setActiveTool("digitize"); setActiveTab("digitize"); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200",
              activeTab === "digitize"
                ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            <Database className="w-3.5 h-3.5" />
            Digitasi
          </button>
          <button
             onClick={() => { setActiveTool("data"); setActiveTab("dataset"); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200",
              activeTool === "data"
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Dataset
          </button>
          <button
            onClick={() => { setActiveTool("analysis"); setActiveTab("dataset"); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200",
              activeTool === "analysis"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Analisis
          </button>
        </div>

        {/* Panel content */}
        <div className="workspace-panel-scroll flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-border/40 scrollbar-track-transparent">
          <div className={activeTab === "digitize" ? "block" : "hidden"}>
            <DigitizePanel />
          </div>
          <div className={activeTab === "dataset" ? "block" : "hidden"}>
             <UploadDatasetPanel mode={activeTool === "analysis" ? "analysis" : "dataset"} />
          </div>
        </div>
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="mobile-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch bg-card/95 backdrop-blur-xl border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => openPanel("digitize", "digitize")}
          aria-label="Buka menu digitasi"
          aria-current={activeTool === "digitize" && isSidebarPinned ? "page" : undefined}
          data-active={activeTool === "digitize" && isSidebarPinned}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            activeTool === "digitize" && isSidebarPinned ? "text-orange-400" : "text-muted-foreground"
          )}
        >
          <Database className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Digitasi</span>
        </button>
        <button
          onClick={() => openPanel("dataset", "data")}
          aria-label="Buka menu dataset"
          aria-current={activeTool === "data" && isSidebarPinned ? "page" : undefined}
          data-active={activeTool === "data" && isSidebarPinned}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            activeTool === "data" && isSidebarPinned ? "text-cyan-400" : "text-muted-foreground"
          )}
        >
          <UploadCloud className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Dataset</span>
        </button>
        <button
          onClick={() => openPanel("dataset", "analysis")}
          aria-label="Buka menu analisis spasial"
          aria-current={activeTool === "analysis" && isSidebarPinned ? "page" : undefined}
          data-active={activeTool === "analysis" && isSidebarPinned}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            activeTool === "analysis" && isSidebarPinned ? "text-emerald-400" : "text-muted-foreground"
          )}
          title="Analisis Spasial"
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Analisis</span>
        </button>
        <button
          onClick={() => { if (isDrawing) stopDrawing(); setActiveTool("layout"); setIsSidebarPinned(false); setIsHovered(false); setIsDeviceHubOpen(false); setIsAttributeTableOpen(false); setLayoutComposerOpen(true); }}
          aria-label="Buka layout peta"
          data-active={activeTool === "layout"}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            activeTool === "layout" ? "text-violet-400" : "text-muted-foreground"
          )}
          title="Layout Peta"
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Layout</span>
        </button>
        <button
          onClick={() => { if (isDrawing) stopDrawing(); setActiveTool("data"); setIsSidebarPinned(false); setIsDeviceHubOpen(false); setLayoutComposerOpen(false); setIsAttributeTableOpen(!isAttributeTableOpen); }}
          aria-label="Buka tabel atribut"
          data-active={isAttributeTableOpen}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            isAttributeTableOpen ? "text-purple-400" : "text-muted-foreground"
          )}
        >
          <Table2 className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Tabel</span>
        </button>
        <button
          onClick={() => { if (isDrawing) stopDrawing(); setActiveTool("device"); setIsSidebarPinned(false); setIsHovered(false); setIsAttributeTableOpen(false); setLayoutComposerOpen(false); setIsDeviceHubOpen(true); }}
          aria-label="Buka device hub"
          data-active={isDeviceHubOpen}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            isDeviceHubOpen ? "text-violet-400" : "text-muted-foreground"
          )}
        >
          <Cpu className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Device</span>
        </button>
      </nav>

      <CommandPalette />
      <GpsTrackingPanel />
      <DraggableAssistant />
      <DeviceHubPanel
        isOpen={isDeviceHubOpen}
        onClose={() => setIsDeviceHubOpen(false)}
        onOpenFlightPlanner={() => { setIsFlightPlannerOpen(true); setIsDeviceHubOpen(false); }}
      />
      <FlightPathPlanner
        isOpen={isFlightPlannerOpen}
        onClose={() => setIsFlightPlannerOpen(false)}
      />
      <SpatialConverterModal
        isOpen={isConverterOpen}
        onClose={() => setIsConverterOpen(false)}
      />
      <AttributeTablePanel />
      {isDrawing && (
        <DigitizingStatusBar
          layer={layers.find((item) => item.id === activeDigitizingLayerId)}
          map={mapInstance}
          featureCount={activeDigitizingLayerId ? layerGeojsonCache[activeDigitizingLayerId]?.features?.length || 0 : 0}
          onCancel={stopDrawing}
        />
      )}
    </main>
    </AuthGuard>
  );
}

function getActiveDrawInstance(map: any) {
  const draw = map?.pm?.Draw;
  if (!draw) return null;

  const activeShape = draw.getActiveShape?.();
  if (activeShape && typeof activeShape === "object") return activeShape;
  if (typeof activeShape === "string" && draw[activeShape]) return draw[activeShape];

  const activeShapeName = Object.keys(draw).find((key) => draw[key]?._enabled === true);
  return activeShapeName ? draw[activeShapeName] : null;
}

function getVertexCount(map: any) {
  const activeShape = getActiveDrawInstance(map);
  const latlngs = activeShape?._layer?.getLatLngs?.();
  if (!Array.isArray(latlngs)) return 0;
  const count = (items: any[]): number => items.reduce((total, item) => Array.isArray(item) ? total + count(item) : total + 1, 0);
  return count(latlngs);
}

function DigitizingStatusBar({
  layer,
  map,
  featureCount,
  onCancel,
}: {
  layer?: { name: string; geometryType?: string };
  map: LeafletMap | null;
  featureCount: number;
  onCancel: () => void;
}) {
  const [vertexCount, setVertexCount] = useState(0);

  useEffect(() => {
    if (!map) return;
    const update = () => setVertexCount(getVertexCount(map));
    const events = ["pm:drawstart", "pm:vertexadded", "pm:drawend", "pm:create"];
    events.forEach((event) => map.on(event, update));
    update();
    return () => events.forEach((event) => map.off(event, update));
  }, [map]);

  const undoVertex = () => {
    const activeShape = getActiveDrawInstance(map);
    if (!activeShape?._removeLastVertex) return;
    try {
      activeShape._removeLastVertex();
      setVertexCount(getVertexCount(map));
    } catch (error) {
      console.warn("Undo vertex error:", error);
    }
  };

  const finishDrawing = () => {
    const activeShape = getActiveDrawInstance(map);
    if (!activeShape) return;
    try {
      if (activeShape.finish) activeShape.finish();
      else if (activeShape._finishShape) activeShape._finishShape();
      else toast.info("Tambahkan minimal titik lalu ketuk titik pertama untuk menutup polygon.");
    } catch (error) {
      console.warn("Finish drawing error:", error);
      toast.info("Tambahkan minimal titik lalu ketuk titik pertama untuk menutup polygon.");
    }
  };

  return (
    <div className="digitize-status-bar fixed z-[35] rounded-2xl border border-orange-400/35 bg-[#111318]/95 px-3 py-2.5 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="digitize-status-pulse" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MousePointer2 className="h-4 w-4 shrink-0 text-orange-300" />
            <strong className="truncate text-[11px] font-black uppercase tracking-wider">Mode gambar aktif</strong>
          </div>
          <p className="mt-1 truncate text-[10px] text-white/55">
            {layer?.name || "Layer aktif"} · {layer?.geometryType || "Vector"} · {vertexCount} titik sementara · {featureCount} fitur tersimpan
          </p>
          <p className="mt-1 text-[10px] text-orange-200/80">Ketuk peta untuk menambah titik. Ketuk titik pertama untuk menutup.</p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <button type="button" onClick={undoVertex} className="digitize-action-button digitize-action-muted">
          <Undo2 className="h-4 w-4" /> Undo
        </button>
        <button type="button" onClick={finishDrawing} className="digitize-action-button digitize-action-primary">
          <Check className="h-4 w-4" /> Selesai
        </button>
        <button type="button" onClick={onCancel} className="digitize-action-button digitize-action-danger">
          <X className="h-4 w-4" /> Batal
        </button>
      </div>
    </div>
  );
}
