"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Crosshair,
  Gauge,
  MapPin,
  Mountain,
  Navigation2,
  Play,
  RotateCcw,
  Satellite,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TrackerStatus = "idle" | "searching" | "active" | "error";

type GpsSample = {
  accuracy: number;
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

function getQuality(accuracy: number | null) {
  if (accuracy === null) {
    return {
      label: "Belum diukur",
      description: "Mulai pemeriksaan untuk membaca kualitas GPS.",
      color: "text-white/45",
      bar: "bg-white/20",
    };
  }
  if (accuracy <= 3) {
    return {
      label: "Sangat presisi",
      description: "Sangat baik untuk pengukuran lapangan.",
      color: "text-emerald-300",
      bar: "bg-emerald-400",
    };
  }
  if (accuracy <= 8) {
    return {
      label: "Presisi baik",
      description: "Cukup stabil untuk pemetaan umum.",
      color: "text-cyan-300",
      bar: "bg-cyan-400",
    };
  }
  if (accuracy <= 20) {
    return {
      label: "Cukup presisi",
      description: "Pertimbangkan menunggu posisi lebih stabil.",
      color: "text-amber-300",
      bar: "bg-amber-400",
    };
  }
  return {
    label: "Sinyal lemah",
    description: "Pindah ke area terbuka dan tunggu pembaruan GPS.",
    color: "text-red-300",
    bar: "bg-red-400",
  };
}

function statusLabel(status: TrackerStatus) {
  if (status === "searching") return "Mencari sinyal";
  if (status === "active") return "Realtime aktif";
  if (status === "error") return "GPS bermasalah";
  return "Belum dimulai";
}

function formatMetric(value: number | null | undefined, unit: string) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "--"
    : `${value.toFixed(1)} ${unit}`;
}

function formatCoordinate(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "--"
    : value.toFixed(6);
}

export function GpsAccuracyTab() {
  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [position, setPosition] = useState<GpsSample | null>(null);
  const [samples, setSamples] = useState<GpsSample[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const watchIdRef = useRef<number | null>(null);

  const stopWatching = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus("idle");
  };

  useEffect(() => () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
  }, []);

  const startWatching = () => {
    if (!navigator.geolocation) {
      setStatus("error");
      setErrorMessage("Browser ini tidak menyediakan layanan GPS.");
      return;
    }
    if (watchIdRef.current !== null) return;

    setStatus("searching");
    setErrorMessage("");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (nextPosition) => {
        const nextSample: GpsSample = {
          accuracy: nextPosition.coords.accuracy,
          latitude: nextPosition.coords.latitude,
          longitude: nextPosition.coords.longitude,
          altitude: nextPosition.coords.altitude,
          speed: nextPosition.coords.speed,
          heading: nextPosition.coords.heading,
          timestamp: nextPosition.timestamp,
        };
        setPosition(nextSample);
        setSamples((previous) => [...previous, nextSample].slice(-40));
        setStatus("active");
      },
      (error) => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        setStatus("error");
        setErrorMessage(
          error.code === error.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan izin lokasi browser untuk melanjutkan."
            : error.message || "Lokasi belum tersedia. Coba lagi di area terbuka."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );
  };

  const reset = () => {
    stopWatching();
    setPosition(null);
    setSamples([]);
    setErrorMessage("");
  };

  const currentAccuracy = position?.accuracy ?? null;
  const quality = getQuality(currentAccuracy);
  const statistics = useMemo(() => {
    if (samples.length === 0) return { min: null, average: null, max: null };
    const values = samples.map((sample) => sample.accuracy);
    return {
      min: Math.min(...values),
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      max: Math.max(...values),
    };
  }, [samples]);

  const chartPoints = useMemo(() => {
    if (samples.length === 0) return "";
    const chartWidth = 320;
    const chartHeight = 102;
    const maxAccuracy = Math.max(20, ...samples.map((sample) => sample.accuracy));
    return samples
      .map((sample, index) => {
        const x = samples.length === 1 ? chartWidth / 2 : (index / (samples.length - 1)) * chartWidth;
        const y = 8 + (sample.accuracy / maxAccuracy) * (chartHeight - 20);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [samples]);

  const qualityBarWidth = currentAccuracy === null
    ? 0
    : Math.max(5, Math.min(100, 100 - (currentAccuracy / 100) * 100));

  return (
    <div className="gps-accuracy-tab space-y-4">
      <div className="gps-accuracy-header">
        <div className="gps-accuracy-heading">
          <div className={cn("gps-accuracy-icon", status === "active" && "is-active")}>
            <Satellite className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="gps-accuracy-eyebrow">Pemeriksaan perangkat</p>
            <h3>Akurasi GPS</h3>
            <p>Pantau ketelitian posisi Anda secara realtime.</p>
          </div>
        </div>
        <span className={cn("gps-accuracy-status", status === "active" && "is-active", status === "error" && "is-error")}>
          <span /> {statusLabel(status)}
        </span>
      </div>

      {errorMessage && (
        <div className="gps-accuracy-error">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="gps-accuracy-reading">
        <div className="gps-accuracy-orb">
          <span className="gps-accuracy-orb-ring ring-one" />
          <span className="gps-accuracy-orb-ring ring-two" />
          <span className="gps-accuracy-orb-dot" />
          <strong>{currentAccuracy === null ? "--" : currentAccuracy.toFixed(1)}</strong>
          <span>meter</span>
        </div>
        <div className="gps-accuracy-quality">
          <p className="gps-accuracy-eyebrow">Ketelitian saat ini</p>
          <strong className={quality.color}>{quality.label}</strong>
          <p>{quality.description}</p>
          <div className="gps-accuracy-progress">
            <span className={quality.bar} style={{ width: `${qualityBarWidth}%` }} />
          </div>
          <small>Semakin kecil nilai meter, semakin teliti.</small>
        </div>
      </div>

      <div className="gps-accuracy-stats">
        {[
          { label: "Minimum", value: formatMetric(statistics.min, "m"), icon: <Gauge className="h-3.5 w-3.5" /> },
          { label: "Rata-rata", value: formatMetric(statistics.average, "m"), icon: <Activity className="h-3.5 w-3.5" /> },
          { label: "Terburuk", value: formatMetric(statistics.max, "m"), icon: <AlertTriangle className="h-3.5 w-3.5" /> },
        ].map((item) => (
          <div className="gps-accuracy-stat" key={item.label}>
            <span>{item.icon} {item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="gps-accuracy-chart-card">
        <div className="gps-accuracy-section-heading">
          <div>
            <strong>Riwayat ketelitian</strong>
            <span>{samples.length} pembaruan terakhir · realtime</span>
          </div>
          <span className="gps-accuracy-chart-hint">lebih rendah lebih baik</span>
        </div>
        <div className="gps-accuracy-chart-wrap">
          <svg viewBox="0 0 320 102" preserveAspectRatio="none" role="img" aria-label="Grafik perubahan akurasi GPS">
            <line x1="0" y1="8" x2="320" y2="8" />
            <line x1="0" y1="49" x2="320" y2="49" />
            <line x1="0" y1="90" x2="320" y2="90" />
            {chartPoints && (
              <>
                <polygon points={`0,102 ${chartPoints} 320,102`} className="gps-accuracy-chart-fill" />
                <polyline points={chartPoints} className="gps-accuracy-chart-line" />
              </>
            )}
          </svg>
          {!chartPoints && <div className="gps-accuracy-chart-empty">Grafik akan muncul setelah GPS mendapat pembaruan.</div>}
        </div>
      </div>

      <div className="gps-accuracy-section">
        <div className="gps-accuracy-section-heading">
          <div>
            <strong>Data posisi realtime</strong>
            <span>Diterima dari GPS browser dengan high accuracy.</span>
          </div>
          <MapPin className="h-4 w-4 text-cyan-300" />
        </div>
        <div className="gps-accuracy-data-grid">
          <div><span>Latitude</span><strong>{formatCoordinate(position?.latitude)}</strong></div>
          <div><span>Longitude</span><strong>{formatCoordinate(position?.longitude)}</strong></div>
          <div><span>Altitud</span><strong>{formatMetric(position?.altitude, "m")}</strong></div>
          <div><span>Kecepatan</span><strong>{formatMetric(position?.speed, "m/s")}</strong></div>
          <div><span>Arah</span><strong>{formatMetric(position?.heading, "deg")}</strong></div>
          <div><span>Pembaruan</span><strong>{position ? new Date(position.timestamp).toLocaleTimeString("id-ID") : "--"}</strong></div>
        </div>
      </div>

      <div className="gps-accuracy-actions">
        {status === "active" || status === "searching" ? (
          <button type="button" onClick={stopWatching} disabled={status === "searching"} className="gps-accuracy-button gps-accuracy-button-stop">
            <Square className="h-4 w-4 fill-current" /> Hentikan
          </button>
        ) : (
          <button type="button" onClick={startWatching} className="gps-accuracy-button gps-accuracy-button-start">
            <Play className="h-4 w-4 fill-current" /> Mulai cek GPS
          </button>
        )}
        <button type="button" onClick={reset} className="gps-accuracy-button gps-accuracy-button-reset">
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </div>

      <div className="gps-accuracy-note">
        <Mountain className="h-4 w-4 shrink-0 text-cyan-300" />
        <span>Akurasi adalah radius perkiraan dari browser, bukan error absolut. Bangunan tinggi, pepohonan, dan cuaca dapat memengaruhi hasil.</span>
        <Navigation2 className="h-4 w-4 shrink-0 text-white/25" />
      </div>
    </div>
  );
}
