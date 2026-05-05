"use client";

import dynamic from "next/dynamic";
import MapWrapper from "@/components/MapWrapper";
import { CommandPalette } from "@/components/CommandPalette";
import { MapProvider } from "@/lib/MapContext";
const GpsTrackingPanel = dynamic(() => import("@/components/GpsTrackingPanel").then(mod => mod.GpsTrackingPanel), { ssr: false });
const DigitizePanel = dynamic(() => import("@/components/DigitizePanel").then(mod => mod.DigitizePanel), { ssr: false });
const UploadDatasetPanel = dynamic(() => import("@/components/UploadDatasetPanel").then(mod => mod.UploadDatasetPanel), { ssr: false });

export default function Home() {
  return (
    <MapProvider>
      <main className="relative w-full h-screen overflow-hidden">
        {/* Background Map: Fills 100% of viewport */}
        <MapWrapper />

        {/* Floating UI Elements (Sidebar) */}
        <div className="absolute top-4 left-4 z-10 w-[calc(100vw-2rem)] sm:w-80 flex flex-col gap-2 sm:gap-4 max-h-[85vh] sm:max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 pointer-events-auto">
          <div className="bg-card/95 backdrop-blur-md text-card-foreground border border-white/10 rounded-xl p-5 shadow-xl flex flex-col gap-3">
            <h1 className="text-xl font-bold tracking-tight">SAKAGIS</h1>
          </div>

          <DigitizePanel />
          <UploadDatasetPanel />
        </div>

        {/* GPS Tracking Floating Button (Avenza Style) */}
        {/* <div className="absolute bottom-16 left-4 z-[1001] pointer-events-auto">
           <GpsTrackingPanel />
        </div> */}

        <CommandPalette />
      </main>
    </MapProvider>
  );
}
