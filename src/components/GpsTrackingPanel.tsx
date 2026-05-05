
"use client";

import { useState, useEffect, useRef } from "react";
import { useMapContext } from "@/lib/MapContext";
import { Navigation, Play, Square, Trash2, Save, Activity, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as turf from "@turf/turf";
import { saveLayer } from "@/lib/database";

export function GpsTrackingPanel() {
  const [isMounted, setIsMounted] = useState(false);
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

        setTrackingPath(prev => {
          const newPath = [...prev, newPoint];
          
          // Calculate distance if we have more than 1 point
          if (newPath.length > 1) {
            const line = turf.lineString(newPath.map(p => [p[1], p[0]]));
            const length = turf.length(line, { units: 'kilometers' });
            setTrackingDistance(length);
          }

          return newPath;
        });

        // Optionally follow the user on the map
        if (mapInstance) {
          mapInstance.panTo(newPoint);
        }
      },
      (error) => {
        console.error("GPS Error:", error);
        toast.error("Gagal mendapatkan lokasi: " + error.message);
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
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
      
      // Create GeoJSON FeatureCollection
      const line = turf.lineString(trackingPath.map(p => [p[1], p[0]]), {
        name,
        distance_km: trackingDistance.toFixed(3),
        timestamp: new Date().toISOString()
      });
      const fc = turf.featureCollection([line]);

      await saveLayer(name, fc, "LineString");
      
      toast.success("Jejak GPS berhasil disimpan sebagai layer!");
      await fetchLayers();
      clearTracking();
    } catch (err: any) {
      toast.error("Gagal menyimpan jejak: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
           <div className="p-2 bg-indigo-500/20 rounded-lg">
             <Navigation className={`w-4 h-4 text-indigo-400 ${isTracking ? 'animate-pulse' : ''}`} />
           </div>
           <div>
             <h3 className="text-sm font-bold text-white tracking-tight">GPS Tracking</h3>
             <p className="text-[10px] text-gray-500 font-medium">Rekam jejak lapangan real-time</p>
           </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1a1c20] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[8px] text-gray-500 font-bold uppercase tracking-widest">
            <Activity className="w-2.5 h-2.5 text-emerald-400" />
            <span>Jarak Tempuh</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black text-white">{trackingDistance.toFixed(3)}</span>
            <span className="text-[9px] text-gray-500 font-bold">KM</span>
          </div>
        </div>
        <div className="bg-[#1a1c20] border border-white/5 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[8px] text-gray-500 font-bold uppercase tracking-widest">
            <MapPin className="w-2.5 h-2.5 text-indigo-400" />
            <span>Titik Jejak</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black text-white">{trackingPath.length}</span>
            <span className="text-[9px] text-gray-500 font-bold">PTS</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-2.5 pt-2">
        {!isTracking ? (
          <button 
            onClick={startTracking}
            className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-wider shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Mulai Rekam Jejak
          </button>
        ) : (
          <button 
            onClick={stopTracking}
            className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-2"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            Hentikan Rekaman
          </button>
        )}

        <div className="flex gap-2">
          <button 
            onClick={clearTracking}
            disabled={trackingPath.length === 0}
            className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl font-black text-[9px] uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-30"
          >
            <Trash2 className="w-3 h-3" />
            Hapus
          </button>
          <button 
            onClick={saveTrackAsLayer}
            disabled={trackingPath.length < 2 || isSaving}
            className="flex-[2] py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-[9px] uppercase shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Simpan ke Layer
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
        <p className="text-[9px] text-indigo-300/70 leading-relaxed italic text-center">
          "Gunakan fitur ini saat berada di lapangan. Pastikan izin lokasi (GPS) di browser/HP Anda sudah diizinkan."
        </p>
      </div>
    </div>
  );
}
