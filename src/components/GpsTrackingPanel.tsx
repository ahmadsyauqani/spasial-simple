"use client";

import { useState, useEffect } from "react";
import { useMapContext } from "@/lib/MapContext";
import { Navigation, Play, Square, Save, RotateCcw, Activity, MapPin } from "lucide-react";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { saveLayer } from "@/lib/database";

// COMPONENT 1: The Trigger Button (To be placed next to SAKAGIS)
export function GpsTrackingTrigger() {
  const { isGpsPanelOpen, setIsGpsPanelOpen, isTracking } = useMapContext();
  
  return (
    <button 
      onClick={() => setIsGpsPanelOpen(!isGpsPanelOpen)}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 border ${isGpsPanelOpen ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
      title="GPS Tracking"
    >
      <Navigation className={`w-4 h-4 ${isTracking ? 'animate-pulse text-white' : ''}`} />
    </button>
  );
}

// COMPONENT 2: The Statistics Panel (To be placed at root level for fixed positioning)
export function GpsTrackingPanel() {
  const { 
    isTracking, setIsTracking, 
    trackingPath, setTrackingPath, 
    trackingDistance, setTrackingDistance,
    fetchLayers,
    isGpsPanelOpen, setIsGpsPanelOpen
  } = useMapContext();

  const [watchId, setWatchId] = useState<number | null>(null);

  const startTracking = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation tidak didukung browser ini.");
      return;
    }

    setIsTracking(true);
    setTrackingPath([]);
    setTrackingDistance(0);

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newPoint: [number, number] = [latitude, longitude];

        setTrackingPath((prev: any[]) => {
          const newPath = [...prev, newPoint];
          if (newPath.length > 1) {
            const line = turf.lineString(newPath.map(p => [p[1], p[0]]));
            const length = turf.length(line, { units: "kilometers" });
            setTrackingDistance(length);
          }
          return newPath;
        });
      },
      (error) => {
        console.error("GPS Error:", error);
        toast.error("Gagal mendapatkan lokasi GPS.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    setWatchId(id);
    toast.success("Mulai merekam jejak GPS...");
  };

  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsTracking(false);
    toast.info("Perekaman berhenti.");
  };

  const resetTracking = () => {
    stopTracking();
    setTrackingPath([]);
    setTrackingDistance(0);
    toast.info("Data tracking dibersihkan.");
  };

  const handleSaveTrack = async () => {
    if (trackingPath.length < 2) {
      toast.error("Jejak terlalu pendek untuk disimpan.");
      return;
    }

    try {
      const geojson = turf.lineString(trackingPath.map(p => [p[1], p[0]]));
      const layerName = `Track_${new Date().toLocaleString("id-ID")}`;
      
      await saveLayer(layerName, geojson, "LineString");
      toast.success("Jejak GPS berhasil disimpan ke database!");
      
      if (fetchLayers) await fetchLayers();
      resetTracking();
    } catch (err: any) {
      toast.error("Gagal menyimpan: " + err.message);
    }
  };

  if (!isGpsPanelOpen) return null;

  return (
    <div 
      className="fixed top-4 bg-[#0f1115]/98 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] animate-in slide-in-from-right-4 fade-in duration-300 z-[9999] w-[calc(100vw-2rem)] sm:w-80"
      style={{ right: '1rem' }}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-0.5 bg-indigo-500/10 rounded-lg overflow-hidden">
              <img src="/logo-sakagis.png" alt="S" className="w-6 h-6 object-contain mix-blend-multiply dark:invert dark:mix-blend-screen" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">Field Tracker</h3>
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Avenza Mode</p>
            </div>
          </div>
          <button 
            onClick={() => setIsGpsPanelOpen(false)}
            className="p-1 hover:bg-white/5 rounded-md text-gray-500 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 rotate-45" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-1">
            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Distance</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-white tracking-tighter">{trackingDistance.toFixed(3)}</span>
              <span className="text-[8px] font-bold text-indigo-400">KM</span>
            </div>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-1">
            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Points</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-white tracking-tighter">{trackingPath.length}</span>
              <span className="text-[8px] font-bold text-indigo-400">PTS</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {!isTracking ? (
            <button 
              onClick={startTracking}
              className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-500/20 transition-all group"
            >
              <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Start Recording</span>
            </button>
          ) : (
            <button 
              onClick={stopTracking}
              className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-red-500/20 transition-all group"
            >
              <Square className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Stop Recording</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={resetTracking}
              className="py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button 
              onClick={handleSaveTrack}
              disabled={isTracking || trackingPath.length < 2}
              className="py-2.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white disabled:opacity-30 disabled:hover:bg-emerald-500/10 disabled:hover:text-emerald-500 border border-emerald-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              <Save className="w-3 h-3" />
              Save Layer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
