import MapWrapper from "@/components/MapWrapper";
import { CommandPalette } from "@/components/CommandPalette";
import { UploadDatasetPanel } from "@/components/UploadDatasetPanel";
import { MapProvider } from "@/lib/MapContext";

export default function Home() {
  return (
    <MapProvider>
      <main className="relative w-full h-screen overflow-hidden">
        {/* Background Map: Fills 100% of viewport */}
        <MapWrapper />

        {/* Floating UI Elements */}
        <div className="absolute top-4 left-4 z-10 w-[calc(100vw-2rem)] sm:w-80 flex flex-col gap-2 sm:gap-4 max-h-[45vh] sm:max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="bg-card text-card-foreground border rounded-xl p-5 shadow-sm flex flex-col gap-3">
            <h1 className="text-xl font-bold tracking-tight">SAKAGIS</h1>
          </div>

          <UploadDatasetPanel />
        </div>

        <CommandPalette />
      </main>
    </MapProvider>
  );
}
