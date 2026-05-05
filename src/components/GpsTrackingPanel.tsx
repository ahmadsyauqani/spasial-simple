
"use client";

import { useState, useEffect, useRef } from "react";
import { useMapContext } from "@/lib/MapContext";
import { Navigation, Play, Square, Trash2, Save, Activity, MapPin, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import * as turf from "@turf/turf";
import { saveLayer } from "@/lib/database";

export function GpsTrackingPanel() {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  const { 
    isTracking, setIsTracking, 
    trackingPath, setTrackingPath,
    trackingDistance, setTrackingDistance,
    mapInstance, fetchLayers
  } = useMapContext();

  const [isSaving, setIsSaving] = useState(false);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  if (!isMounted) return null;

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error("GPS tidak didukung oleh browser ini");
      return;
    }

    setIsTracking(true);
    toast.success("Mulai merekam jejak GPS...");

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newPoint: [number, number] = [latitude, longitude];

        setTrackingPath((prev: any[]) => {
          const newPath = [...prev, newPoint];
          if (newPath.length > 1) {
            const line = turf.lineString(newPath.map(p => [p[1], p[0]]));
            const length = turf.length(line, { units: 'kilometers' });
            setTrackingDistance(length);
          }
          return newPath;
        });

        if (mapInstance) {
          mapInstance.panTo(newPoint);
        }
      },
      (error) => {
        toast.error("Gagal mendapatkan lokasi: " + error.message);
        stopTracking();
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
    toast.info("Tracking dihentikan");
  };

  const clearTracking = () => {
    if (isTracking) stopTracking();
    setTrackingPath([]);
    setTrackingDistance(0);
    toast.info("Data tracking dihapus");
  };

  const saveTrackAsLayer = async () => {
    if (trackingPath.length < 2) {
      toast.error("Jejak terlalu pendek untuk disimpan");
      return;
    }

    try {
      setIsSaving(true);
      const name = `Track GPS ${new Date().toLocaleString('id-ID')}`;
      const line = turf.lineString(trackingPath.map(p => [p[1], p[0]]), {
        name,
        distance_km: trackingDistance.toFixed(3),
        timestamp: new Date().toISOString()
      });
      const fc = turf.featureCollection([line]);
      await saveLayer(name, fc, "LineString");
      toast.success("Jejak GPS berhasil disimpan!");
      await fetchLayers();
      clearTracking();
      setIsOpen(false);
    } catch (err: any) {
      toast.error("Gagal menyimpan jejak: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-3 pointer-events-auto">
      {/* The Floating Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 border ${isOpen ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-[#1a1c20]/95 backdrop-blur-md border-white/10 text-gray-400 hover:text-white'}`}
        title="GPS Tracking"
      >
        <Navigation className={`w-5 h-5 ${isTracking ? 'animate-pulse text-white' : ''}`} />
      </button>

      {/* The Collapsible Panel */}
      {isOpen && (
        <div className="w-[calc(100vw-2rem)] sm:w-80 bg-[#0f1115]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] animate-in zoom-in slide-in-from-bottom-4 duration-300">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="p-2.5 bg-indigo-500/20 rounded-2xl">
                   <Activity className={`w-4 h-4 text-indigo-400 ${isTracking ? 'animate-pulse' : ''}`} />
                 </div>
                 <div>
                   <h3 className="text-sm font-black text-white tracking-tight uppercase">Field Tracker</h3>
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Avenza Mode</p>
                 </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors">
                 <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
                <div className="text-[8px] text-gray-500 font-black uppercase tracking-[0.2em]">Distance</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-white font-mono">{trackingDistance.toFixed(3)}</span>
                  <span className="text-[9px] text-gray-500 font-bold">KM</span>
                </div>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
                <div className="text-[8px] text-gray-500 font-black uppercase tracking-[0.2em]">Points</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-white font-mono">{trackingPath.length}</span>
                  <span className="text-[9px] text-gray-500 font-bold">PTS</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-3 pt-2">
              {!isTracking ? (
                <button 
                  onClick={startTracking}
                  className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-3 group"
                >
                  <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
                  Start Recording
                </button>
              ) : (
                <button 
                  onClick={stopTracking}
                  className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop Tracking
                </button>
              )}

              <div className="flex gap-3">
                <button 
                  onClick={clearTracking}
                  disabled={trackingPath.length === 0}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-400 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button 
                  onClick={saveTrackAsLayer}
                  disabled={trackingPath.length < 2 || isSaving}
                  className="flex-[1.5] py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-20"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Layer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
