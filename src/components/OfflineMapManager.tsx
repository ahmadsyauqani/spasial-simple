"use client";

import { useState, useEffect } from "react";
import { useMapContext } from "@/lib/MapContext";
import { DownloadCloud, Trash2, Database, Loader2, Check, X } from "lucide-react";
import { db } from "@/lib/offlineDb";
import { toast } from "sonner";
import * as L from "leaflet";

export function OfflineMapManager() {
  const { mapInstance, activeBasemap, BASEMAP_OPTIONS } = useMapContext();
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ tileCount: 0 });
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    updateStats();
  }, []);

  const updateStats = async () => {
    const count = await db.tiles.count();
    setStats({ tileCount: count });
  };

  const downloadCurrentView = async () => {
    if (!mapInstance) return;

    const bounds = mapInstance.getBounds();
    const currentZoom = mapInstance.getZoom();
    const zooms = [currentZoom, currentZoom + 1, currentZoom + 2]; // Download 3 levels
    const urlTemplate = BASEMAP_OPTIONS[activeBasemap].url;

    setIsDownloading(true);
    setProgress(0);

    try {
      let tilesToDownload: { z: number, x: number, y: number }[] = [];

      zooms.forEach(z => {
        const nw = bounds.getNorthWest();
        const se = bounds.getSouthEast();
        
        // Simple tile calculation
        const xMin = long2tile(nw.lng, z);
        const xMax = long2tile(se.lng, z);
        const yMin = lat2tile(nw.lat, z);
        const yMax = lat2tile(se.lat, z);

        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            tilesToDownload.push({ z, x, y });
          }
        }
      });

      if (tilesToDownload.length > 500) {
        if (!confirm(`Area ini mengandung ${tilesToDownload.length} kepingan peta. Lanjutkan download?`)) {
          setIsDownloading(false);
          return;
        }
      }

      setTotal(tilesToDownload.length);
      let count = 0;

      for (const t of tilesToDownload) {
        const tileId = `${t.z}-${t.x}-${t.y}-${urlTemplate}`;
        const exists = await db.tiles.get(tileId);

        if (!exists) {
          const url = urlTemplate
            .replace('{z}', t.z.toString())
            .replace('{x}', t.x.toString())
            .replace('{y}', t.y.toString())
            .replace('{s}', 'a') // default subdomain
            .replace('{r}', '');

          try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            await db.tiles.put({
              id: tileId,
              tile: blob,
              expires: Date.now() + 1000 * 60 * 60 * 24 * 30 // 30 days
            });
          } catch (e) {
            console.error("Gagal download tile:", tileId);
          }
        }
        count++;
        setProgress(count);
      }

      toast.success("Area peta berhasil disimpan offline!");
      updateStats();
    } catch (err) {
      toast.error("Gagal menyimpan area offline.");
    } finally {
      setIsDownloading(false);
    }
  };

  const clearCache = async () => {
    if (confirm("Hapus semua data peta offline?")) {
      await db.tiles.clear();
      updateStats();
      toast.info("Cache peta dibersihkan.");
    }
  };

  // Helper functions for tile math
  function long2tile(lon: number, zoom: number) { return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom))); }
  function lat2tile(lat: number, zoom: number) { return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))); }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className={`w-10 h-10 rounded-full border transition-all flex items-center justify-center ${isPanelOpen ? 'bg-orange-500/20 border-orange-500/50 text-orange-500' : 'bg-card text-card-foreground border-white/10 hover:bg-muted text-orange-500/70 hover:text-orange-500'}`}
        title="Offline Map Manager"
      >
        <Database className="w-5 h-5" />
      </button>

      {isPanelOpen && (
        <div className="absolute bottom-12 left-0 w-64 bg-[#0f1115] border border-white/10 rounded-xl p-4 shadow-2xl z-[2000] animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Offline Manager</h3>
            <button onClick={() => setIsPanelOpen(false)}><X className="w-3 h-3 text-gray-500" /></button>
          </div>

          <div className="space-y-4">
            <div className="bg-white/5 rounded-lg p-3">
              <div className="flex items-center justify-between text-[8px] font-bold text-gray-500 uppercase mb-1">
                <span>Storage Use</span>
                <span className="text-amber-400">{stats.tileCount} Tiles</span>
              </div>
              <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, stats.tileCount / 10)}%` }}></div>
              </div>
            </div>

            {isDownloading ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[9px] text-amber-400 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Downloading Tiles... {progress}/{total}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${(progress/total)*100}%` }}></div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={downloadCurrentView}
                  className="flex flex-col items-center justify-center gap-2 p-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span className="text-[8px] font-black uppercase">Simpan Area</span>
                </button>
                <button 
                  onClick={clearCache}
                  className="flex flex-col items-center justify-center gap-2 p-3 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-[8px] font-black uppercase">Hapus Cache</span>
                </button>
              </div>
            )}

            <p className="text-[7px] text-gray-500 leading-tight italic">
              *Simpan area peta di tampilan saat ini untuk digunakan tanpa internet.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
