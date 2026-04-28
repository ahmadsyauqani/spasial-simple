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
        <div className="absolute top-4 left-4 z-10 w-80 flex flex-col gap-4 max-h-[calc(100vh-2rem)]">
          <div className="bg-card text-card-foreground border rounded-xl p-5 shadow-sm flex flex-col gap-3">
            <h1 className="text-xl font-bold tracking-tight">SAKAGIS</h1>
            <div className="flex flex-col gap-2 mt-1">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Analisis vektor via browser. Tekan <kbd className="inline-flex items-center justify-center rounded bg-muted border mx-1 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-sm whitespace-nowrap">Ctrl + K</kbd> untuk menu cepat.
              </p>
            </div>
          </div>

          <UploadDatasetPanel />
        </div>

        <CommandPalette />
      </main>
    </MapProvider>
  );
}
