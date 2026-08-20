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
import { RefreshCcw, Database, UploadCloud, Pin, Cpu, X, BarChart3, LayoutGrid, HardDrive } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import AuthGuard from "@/components/AuthGuard";
import { useMapContext } from "@/lib/MapContext";
import { AttributeTablePanel } from "@/components/AttributeTablePanel";
import { Table2 } from "lucide-react";
import { UserProfileWidget } from "@/components/UserProfileWidget";

export default function Home() {
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"digitize" | "dataset">("digitize");
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDeviceHubOpen, setIsDeviceHubOpen] = useState(false);
  const [isFlightPlannerOpen, setIsFlightPlannerOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<"data" | "digitize" | "analysis" | "layout" | "device">("digitize");
  const { isAttributeTableOpen, setIsAttributeTableOpen, setLayoutComposerOpen } = useMapContext();

  const isPanelVisible = isSidebarPinned || isHovered;
  const openPanel = (tab: "digitize" | "dataset", tool: "data" | "digitize" | "analysis") => {
    setActiveTool(tool);
    setActiveTab(tab);
    setIsSidebarPinned(true);
    setIsHovered(true);
  };

  return (
    <AuthGuard>
    <main className="relative w-full h-screen overflow-hidden touch-manipulation">
        <UserProfileWidget />
        <MapWrapper />
      <SearchControl />
      <ClockWidget />

      {/* ── Icon Rail: compact pill, always visible, h-fit ── */}
      <div
        className="absolute top-4 left-4 z-20 hidden md:flex flex-col items-center gap-1 py-2 px-1.5 rounded-2xl border border-border/50 bg-card/85 backdrop-blur-2xl shadow-xl w-[52px] overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Accent line */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl transition-all duration-500",
          activeTab === "digitize"
            ? "bg-gradient-to-r from-orange-500 via-orange-400/50 to-transparent"
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
          activeTab === "digitize" ? "bg-orange-500/40" : "bg-cyan-500/40"
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
          onClick={() => { setActiveTool("layout"); setLayoutComposerOpen(true); }}
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
          onClick={() => { setActiveTool("device"); setIsDeviceHubOpen(true); }}
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
          onClick={() => setIsAttributeTableOpen(!isAttributeTableOpen)}
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
          className="md:hidden fixed inset-0 z-[15] bg-black/40 backdrop-blur-[2px]"
          onClick={() => setIsSidebarPinned(false)}
        />
      )}

      {/* ── Content Panel: side panel (desktop) / bottom sheet (mobile) ── */}
      <div
        className={cn(
          "absolute z-[20] flex flex-col rounded-2xl border border-border/50 bg-card/85 backdrop-blur-2xl shadow-xl overflow-hidden",
          "left-2 right-2 bottom-[calc(76px+env(safe-area-inset-bottom))] max-h-[62vh]",
          "md:left-[68px] md:right-auto md:top-4 md:bottom-auto md:w-[320px] md:max-w-[320px] md:max-h-[75vh]",
          "transition-all duration-300 ease-out",
          isPanelVisible
            ? "opacity-100 translate-x-0 translate-y-0 pointer-events-auto"
            : "opacity-0 pointer-events-none translate-y-full md:translate-y-0 md:-translate-x-3"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Accent line */}
        <div className={cn(
          "h-[2px] shrink-0 transition-all duration-500",
          activeTab === "digitize"
            ? "bg-gradient-to-r from-orange-500 via-orange-400/50 to-transparent"
            : "bg-gradient-to-r from-cyan-400 via-cyan-400/50 to-transparent"
        )} />

        {/* Brand header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/20 shrink-0">
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
              onClick={() => setIsSidebarPinned(false)}
              className="md:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
              title="Tutup Panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/20 bg-black/10 shrink-0">
          <button
            onClick={() => setActiveTab("digitize")}
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
            onClick={() => setActiveTab("dataset")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200",
              activeTab === "dataset"
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Dataset
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-border/40 scrollbar-track-transparent">
          <div className={activeTab === "digitize" ? "block" : "hidden"}>
            <DigitizePanel />
          </div>
          <div className={activeTab === "dataset" ? "block" : "hidden"}>
            <UploadDatasetPanel />
          </div>
        </div>
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch bg-card/95 backdrop-blur-xl border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => { setActiveTool("digitize"); setActiveTab("digitize"); setIsSidebarPinned(true); }}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            activeTab === "digitize" && isSidebarPinned ? "text-orange-400" : "text-muted-foreground"
          )}
        >
          <Database className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Digitasi</span>
        </button>
        <button
          onClick={() => { setActiveTool("data"); setActiveTab("dataset"); setIsSidebarPinned(true); }}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            activeTab === "dataset" && isSidebarPinned ? "text-cyan-400" : "text-muted-foreground"
          )}
        >
          <UploadCloud className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Dataset</span>
        </button>
        <button
          onClick={() => { setActiveTool("analysis"); setActiveTab("dataset"); setIsSidebarPinned(true); }}
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
          onClick={() => { setActiveTool("layout"); setLayoutComposerOpen(true); }}
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
          onClick={() => setIsAttributeTableOpen(!isAttributeTableOpen)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
            isAttributeTableOpen ? "text-purple-400" : "text-muted-foreground"
          )}
        >
          <Table2 className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wide">Tabel</span>
        </button>
        <button
          onClick={() => { setActiveTool("device"); setIsDeviceHubOpen(true); }}
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
    </main>
    </AuthGuard>
  );
}
