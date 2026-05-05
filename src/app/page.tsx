"use client";

import dynamic from "next/dynamic";
import MapWrapper from "@/components/MapWrapper";
import { CommandPalette } from "@/components/CommandPalette";
import { UploadDatasetPanel } from "@/components/UploadDatasetPanel";
import { DigitizePanel } from "@/components/DigitizePanel";
import { GpsTrackingTrigger, GpsTrackingPanel } from "@/components/GpsTrackingPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden">
      {/* Background Map: Fills 100% of viewport */}
      <MapWrapper />

      {/* Floating UI Elements */}
      <div className="absolute top-4 left-4 z-10 w-[calc(100vw-2rem)] sm:w-80 flex flex-col gap-2 sm:gap-4 max-h-[85vh] sm:max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
        <div className="bg-card/95 backdrop-blur-md text-card-foreground border border-border rounded-2xl p-4 shadow-xl flex items-center justify-between gap-2">
          <h1 className="text-xl font-black tracking-tighter text-navy dark:text-white">SAKAGIS</h1>
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
