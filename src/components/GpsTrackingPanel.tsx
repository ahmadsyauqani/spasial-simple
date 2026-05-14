"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import { Navigation, Play, Square, Save, RotateCcw, Activity, X } from "lucide-react";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { saveLayer } from "@/lib/database";
import { cn } from "@/lib/utils";

// COMPONENT 1: Trigger button — diletakkan di brand header sidebar
export function GpsTrackingTrigger() {
  const { isGpsPanelOpen, setIsGpsPanelOpen, isTracking } = useMapContext();

  return (
    <button
      onClick={() => setIsGpsPanelOpen(!isGpsPanelOpen)}
      title="GPS Field Tracker"
      className={cn(
        "p-1.5 rounded-lg transition-all duration-200",
        isGpsPanelOpen
          ? "bg-orange-500/20 text-orange-400 shadow-inner"
          : "text-muted-foreground hover:bg-white/10 hover:text-white"
      )}
    >
      <Navigation className={cn("w-3.5 h-3.5", isTracking && "animate-pulse text-orange-400")} />
    </button>
  );
}

// COMPONENT 2: GPS Tracking Panel — fixed di kanan atas, tidak tumpang tindih
export function GpsTrackingPanel() {
  const {
    isTracking, setIsTracking,
    trackingPath, setTrackingPath,
    trackingDistance, setTrackingDistance,
    fetchLayers,
    isGpsPanelOpen, setIsGpsPanelOpen,
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
            const line = turf.lineString(newPath.map((p) => [p[1], p[0]]));
            setTrackingDistance(turf.length(line, { units: "kilometers" }));
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
      const geojson = turf.lineString(trackingPath.map((p) => [p[1], p[0]]));
      const layerName = `Track_${new Date().toLocaleString("id-ID")}`;
      await saveLayer(layerName, geojson, "LineString");
      toast.success("Jejak GPS berhasil disimpan!");
      if (fetchLayers) await fetchLayers();
      resetTracking();
    } catch (err: any) {
      toast.error("Gagal menyimpan: " + err.message);
    }
  };

  if (!isGpsPanelOpen) return null;

  return (
    <div
      className={cn(
        // Posisi: top-4, right-4 — tidak nabrak sidebar kiri
        "fixed top-4 right-4 z-[9999] w-72",
        "rounded-2xl border border-border/50 bg-card/90 backdrop-blur-2xl shadow-2xl overflow-hidden",
        "animate-in slide-in-from-right-3 fade-in duration-300"
      )}
    >
      {/* Accent line — orange saat idle, merah saat tracking */}
      <div className={cn(
        "h-[2px] transition-all duration-500",
        isTracking
          ? "bg-gradient-to-r from-red-500 via-red-400/60 to-transparent"
          : "bg-gradient-to-r from-orange-500 via-orange-400/60 to-transparent"
      )} />

      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "p-1.5 rounded-xl border transition-all duration-300",
              isTracking
                ? "bg-red-500/15 border-red-500/30"
                : "bg-orange-500/15 border-orange-500/20"
            )}>
              <Activity className={cn(
                "w-4 h-4 transition-colors",
                isTracking ? "text-red-400 animate-pulse" : "text-orange-400"
              )} />
            </div>
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground">
                Field Tracker
              </h3>
              <p className={cn(
                "text-[8px] font-black uppercase tracking-[0.2em] transition-colors",
                isTracking ? "text-red-400" : "text-muted-foreground"
              )}>
                {isTracking ? "● Recording..." : "Avenza Mode"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsGpsPanelOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/30 border border-border/30 rounded-xl p-3 space-y-0.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
              Distance
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black tracking-tighter text-foreground">
                {trackingDistance.toFixed(3)}
              </span>
              <span className={cn(
                "text-[8px] font-black transition-colors",
                isTracking ? "text-red-400" : "text-orange-400"
              )}>KM</span>
            </div>
          </div>
          <div className="bg-muted/30 border border-border/30 rounded-xl p-3 space-y-0.5">
            <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
              Points
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black tracking-tighter text-foreground">
                {trackingPath.length}
              </span>
              <span className={cn(
                "text-[8px] font-black transition-colors",
                isTracking ? "text-red-400" : "text-orange-400"
              )}>PTS</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          {!isTracking ? (
            <button
              onClick={startTracking}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all duration-200 active:scale-[0.98] group"
            >
              <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Start Recording</span>
            </button>
          ) : (
            <button
              onClick={stopTracking}
              className="w-full py-3 bg-red-500 hover:bg-red-400 text-white rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 transition-all duration-200 active:scale-[0.98] group"
            >
              <Square className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Stop Recording</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={resetTracking}
              className="py-2.5 bg-muted/40 hover:bg-muted border border-border/30 text-muted-foreground hover:text-foreground rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button
              onClick={handleSaveTrack}
              disabled={isTracking || trackingPath.length < 2}
              className={cn(
                "py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 border",
                isTracking || trackingPath.length < 2
                  ? "bg-muted/20 border-border/20 text-muted-foreground/40 cursor-not-allowed"
                  : "bg-orange-500/10 hover:bg-orange-500 border-orange-500/30 text-orange-400 hover:text-white hover:shadow-lg hover:shadow-orange-500/20"
              )}
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
