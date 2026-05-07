"use client";

import dynamic from "next/dynamic";
import MapWrapper from "@/components/MapWrapper";
import { CommandPalette } from "@/components/CommandPalette";
import { UploadDatasetPanel } from "@/components/UploadDatasetPanel";
import { DigitizePanel } from "@/components/DigitizePanel";
import { GpsTrackingTrigger, GpsTrackingPanel } from "@/components/GpsTrackingPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchControl } from "@/components/SearchControl";

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden">
      {/* Background Map: Fills 100% of viewport */}
      <MapWrapper />

      {/* Search Control - Top Center */}
      <SearchControl />

      {/* Floating UI Elements */}
      <div className="absolute top-4 left-4 z-10 w-[calc(100vw-2rem)] sm:w-80 flex flex-col gap-2 sm:gap-4 max-h-[85vh] sm:max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
        <div className="bg-card/70 backdrop-blur-xl text-card-foreground border border-border/50 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-2 group transition-all duration-300 hover:border-orange-500/30">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <img 
                src="/logo-sakagis.png" 
                alt="Logo" 
                className="relative w-10 h-10 object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-110 mix-blend-multiply dark:invert dark:mix-blend-screen" 
              />
            </div>
            <div className="flex flex-col -gap-1">
              <h1 className="text-xl font-black tracking-tighter bg-gradient-to-br from-navy to-navy/70 dark:from-white dark:to-white/60 bg-clip-text text-transparent">
                SAKAGIS
              </h1>
              <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-orange-500 opacity-80">
                Spatial Studio
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <GpsTrackingTrigger />
          </div>
        </div>

        <DigitizePanel />
        <UploadDatasetPanel />
      </div>

      <CommandPalette />
      <GpsTrackingPanel />
    </main>
  );
}

