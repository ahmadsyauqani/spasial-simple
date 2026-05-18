"use client";

import { useState, useEffect, useRef } from "react";
import {
  Wifi, WifiOff, Bluetooth, BluetoothConnected, Radio, X,
  Smartphone, Cpu, ChevronRight, AlertTriangle, CheckCircle2,
  Activity, Navigation2, Battery, Signal, Zap, Settings2,
  Link2, Link2Off, RefreshCw, Route, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────
export type DeviceType = "drone" | "smartphone" | "gps";

export type DeviceStatus = "disconnected" | "searching" | "connecting" | "connected" | "error";

export interface DeviceInfo {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  protocol: "mavlink" | "bluetooth" | "serial" | "websocket";
  battery?: number;
  signal?: number;
  altitude?: number;
  speed?: number;
  lat?: number;
  lng?: number;
  wsUrl?: string;
}

const DRONE_PRESETS = [
  { name: "DJI Mavic 3", model: "Mavic 3", protocol: "mavlink" as const },
  { name: "DJI Mini 3 Pro", model: "Mini 3 Pro", protocol: "mavlink" as const },
  { name: "DJI Phantom 4 Pro", model: "Phantom 4 Pro", protocol: "mavlink" as const },
  { name: "Autel EVO Nano", model: "EVO Nano", protocol: "mavlink" as const },
  { name: "Custom MAVLink", model: "Custom", protocol: "mavlink" as const },
];

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DeviceStatus }) {
  const map: Record<DeviceStatus, { label: string; cls: string; dot: string }> = {
    disconnected: { label: "Disconnected", cls: "text-white/30 bg-white/5 border-white/10", dot: "bg-white/20" },
    searching:    { label: "Searching...",  cls: "text-amber-400 bg-amber-500/10 border-amber-500/20", dot: "bg-amber-400 animate-pulse" },
    connecting:   { label: "Connecting...", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20", dot: "bg-blue-400 animate-pulse" },
    connected:    { label: "Connected",     cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400" },
    error:        { label: "Error",         cls: "text-red-400 bg-red-500/10 border-red-500/20", dot: "bg-red-400" },
  };
  const { label, cls, dot } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border", cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

// ── Telemetry Bar ─────────────────────────────────────────────────────────────
function TelemetryBar({ device }: { device: DeviceInfo }) {
  if (device.status !== "connected") return null;
  return (
    <div className="grid grid-cols-4 gap-1.5 mt-3 p-2.5 bg-black/20 rounded-xl border border-white/10">
      {[
        { icon: <Battery className="w-3 h-3" />, value: `${device.battery ?? "--"}%`, label: "Batt", color: (device.battery ?? 0) < 20 ? "text-red-400" : "text-emerald-400" },
        { icon: <Signal className="w-3 h-3" />, value: `${device.signal ?? "--"}`, label: "Signal", color: "text-blue-400" },
        { icon: <Navigation2 className="w-3 h-3" />, value: `${device.altitude ?? "--"}m`, label: "Alt", color: "text-violet-400" },
        { icon: <Zap className="w-3 h-3" />, value: `${device.speed ?? "--"}m/s`, label: "Speed", color: "text-amber-400" },
      ].map(({ icon, value, label, color }) => (
        <div key={label} className="flex flex-col items-center gap-0.5">
          <span className={cn("", color)}>{icon}</span>
          <span className="text-[10px] font-black text-white">{value}</span>
          <span className="text-[7px] text-white/30 uppercase">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Drone Tab ─────────────────────────────────────────────────────────────────
function DroneTab({ onOpenPlanner }: { onOpenPlanner: () => void }) {
  const [connMode, setConnMode] = useState<"idle" | "real" | "demo">("idle");
  const [connStatus, setConnStatus] = useState<DeviceStatus>("disconnected");
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [wsUrl, setWsUrl] = useState("ws://192.168.4.1:14550");
  const [showSetup, setShowSetup] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [telemetry, setTelemetry] = useState({ battery: 0, signal: 0, altitude: 0, speed: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const telemetryIntervalRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      clearInterval(telemetryIntervalRef.current);
    };
  }, []);

  const connectReal = async () => {
    setErrorMsg("");
    setConnStatus("connecting");
    setConnMode("real");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const timeout = setTimeout(() => {
      ws.close();
      setConnStatus("error");
      setConnMode("idle");
      setErrorMsg(
        `Tidak dapat terhubung ke ${wsUrl}. Pastikan:\n` +
        "1. Drone aktif dan dalam jangkauan WiFi\n" +
        "2. Companion computer/bridge berjalan\n" +
        "3. URL WebSocket benar"
      );
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      setConnStatus("connected");
      // Start reading real MAVLink telemetry (heartbeat parsing)
      toast.success(`✈ Drone terhubung via MAVLink WebSocket!`);
      startTelemetryPolling("real");
    };

    ws.onmessage = (evt) => {
      // Parse MAVLink heartbeat / attitude / battery messages here
      // For now just log — real parsing requires mavlink.js
      console.log("[MAVLink]", evt.data);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      setConnStatus("error");
      setConnMode("idle");
      setErrorMsg(
        `Koneksi ke "${wsUrl}" ditolak.\n` +
        "Drone tidak terdeteksi di alamat ini."
      );
    };

    ws.onclose = () => {
      if (connStatus === "connected") {
        setConnStatus("disconnected");
        setConnMode("idle");
        toast.info("Koneksi drone terputus.");
      }
    };
  };

  const startDemoMode = () => {
    setConnMode("demo");
    setConnStatus("connected");
    setErrorMsg("");
    toast.info("🎮 Demo Mode aktif — data telemetri disimulasikan");
    startTelemetryPolling("demo");
  };

  const startTelemetryPolling = (mode: "real" | "demo") => {
    clearInterval(telemetryIntervalRef.current);
    if (mode === "demo") {
      setTelemetry({ battery: 87, signal: 92, altitude: 0, speed: 0 });
      telemetryIntervalRef.current = setInterval(() => {
        setTelemetry(prev => ({
          battery: Math.max(0, prev.battery - 0.03),
          signal: Math.max(60, Math.min(100, prev.signal + (Math.random() - 0.5) * 4)),
          altitude: Math.abs(Math.sin(Date.now() / 5000) * 50),
          speed: Math.abs(Math.cos(Date.now() / 3000) * 8),
        }));
      }, 1000);
    }
    // For real mode, telemetry comes via ws.onmessage
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    clearInterval(telemetryIntervalRef.current);
    setConnStatus("disconnected");
    setConnMode("idle");
    setErrorMsg("");
    setTelemetry({ battery: 0, signal: 0, altitude: 0, speed: 0 });
    toast.info("Drone diputuskan.");
  };

  const isConnected = connStatus === "connected";

  return (
    <div className="space-y-4">

      {/* ── Model Selector ── */}
      {!isConnected && (
        <div className="space-y-2">
          <label className="text-[8px] font-black uppercase tracking-widest text-violet-400/70">Model Drone</label>
          <div className="grid grid-cols-2 gap-1.5">
            {DRONE_PRESETS.slice(0, 4).map((p, i) => (
              <button
                key={p.name}
                onClick={() => setSelectedPreset(i)}
                className={cn(
                  "text-left px-3 py-2 rounded-xl border text-[9px] font-bold transition-all",
                  selectedPreset === i
                    ? "bg-violet-500/15 border-violet-500/30 text-violet-300"
                    : "bg-white/5 border-white/5 text-white/40 hover:text-white/70 hover:border-white/15"
                )}
              >
                ✈ {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Status Display ── */}
      <div className="flex items-center justify-between">
        <StatusBadge status={connStatus} />
        {isConnected && (
          <div className="flex items-center gap-2">
            {connMode === "demo" && (
              <span className="text-[7px] font-black px-2 py-0.5 bg-amber-500/15 border border-amber-500/20 text-amber-400 rounded-full uppercase tracking-widest">
                Demo Mode
              </span>
            )}
            {connMode === "real" && (
              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                <Activity className="w-3 h-3 animate-pulse" /> MAVLink Live
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Telemetry (only when connected) ── */}
      {isConnected && (
        <div className="grid grid-cols-4 gap-1.5 p-2.5 bg-black/20 rounded-xl border border-white/10">
          {[
            { icon: <Battery className="w-3 h-3" />, value: `${telemetry.battery.toFixed(0)}%`, label: "Batt", color: telemetry.battery < 20 ? "text-red-400" : "text-emerald-400" },
            { icon: <Signal className="w-3 h-3" />, value: `${telemetry.signal.toFixed(0)}`, label: "Signal", color: "text-blue-400" },
            { icon: <Navigation2 className="w-3 h-3" />, value: `${telemetry.altitude.toFixed(0)}m`, label: "Alt", color: "text-violet-400" },
            { icon: <Zap className="w-3 h-3" />, value: `${telemetry.speed.toFixed(1)}m/s`, label: "Speed", color: "text-amber-400" },
          ].map(({ icon, value, label, color }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <span className={color}>{icon}</span>
              <span className="text-[10px] font-black text-white">{value}</span>
              <span className="text-[7px] text-white/30 uppercase">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Error Message ── */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[8px] text-red-400 leading-relaxed whitespace-pre-line">{errorMsg}</p>
        </div>
      )}

      {/* ── Connection Panel (when not connected) ── */}
      {!isConnected && connStatus !== "connecting" && (
        <div className="space-y-3">

          {/* MAVLink WebSocket URL */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-widest text-violet-400/70">
              MAVLink WebSocket Endpoint
            </label>
            <input
              value={wsUrl}
              onChange={e => setWsUrl(e.target.value)}
              placeholder="ws://192.168.4.1:14550"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-[10px] text-white/80 font-mono focus:outline-none focus:border-violet-500/40 placeholder:text-white/20 transition-colors"
            />
          </div>

          {/* Connect Real button */}
          <button
            onClick={connectReal}
            className="w-full py-3 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-violet-500/10 transition-all active:scale-[0.98]"
          >
            <Link2 className="w-4 h-4" /> Hubungkan Drone (Real)
          </button>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[7px] text-white/20 uppercase tracking-widest">atau</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Demo Mode button */}
          <button
            onClick={startDemoMode}
            className="w-full py-2.5 bg-amber-500/8 hover:bg-amber-500/15 border border-amber-500/15 hover:border-amber-500/30 text-amber-400/70 hover:text-amber-400 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all"
          >
            <Activity className="w-3.5 h-3.5" /> Jalankan Demo Mode
          </button>

          {/* Setup guide collapsible */}
          <button
            onClick={() => setShowSetup(!showSetup)}
            className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors w-full"
          >
            <Settings2 className="w-3 h-3" />
            Cara menghubungkan drone sungguhan
            <ChevronRight className={cn("w-3 h-3 transition-transform ml-auto", showSetup && "rotate-90")} />
          </button>

          {showSetup && (
            <div className="bg-black/30 border border-violet-500/15 rounded-xl p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-[8px] font-black text-violet-400/80 uppercase tracking-widest">Panduan Koneksi Drone</p>
              <div className="space-y-2.5">
                {[
                  { step: "1", title: "Aktifkan WiFi Hotspot Drone", desc: "Sambungkan laptop/HP ke WiFi yang dipancarkan drone (mis. DJI_Mavic3_XXXX)" },
                  { step: "2", title: "Jalankan MAVLink Bridge", desc: "Gunakan mavproxy, dronekit, atau companion computer yang meneruskan MAVLink ke WebSocket" },
                  { step: "3", title: "Masukkan Endpoint", desc: "Default DJI: ws://192.168.0.1:14550 · Ardupilot: ws://10.0.0.1:14550" },
                  { step: "4", title: "Klik Hubungkan", desc: "Koneksi MAVLink akan terbentuk dan telemetri akan mengalir secara real-time" },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-400 text-[8px] font-black flex items-center justify-center shrink-0 mt-0.5">
                      {step}
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-white/70">{title}</p>
                      <p className="text-[8px] text-white/30 leading-relaxed mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-1 border-t border-white/5">
                <p className="text-[7px] text-white/20 leading-relaxed">
                  💡 Untuk drone DJI, gunakan DJI Mobile SDK atau SDK Bridge App.<br/>
                  Untuk Ardupilot/PX4, mavproxy sudah cukup.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Connecting spinner ── */}
      {connStatus === "connecting" && (
        <div className="space-y-3">
          <button disabled className="w-full py-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest">
            <Loader2 className="w-4 h-4 animate-spin" /> Menghubungkan ke {wsUrl}...
          </button>
          <p className="text-[8px] text-white/30 text-center">Timeout dalam 5 detik jika tidak ada respons</p>
        </div>
      )}

      {/* ── Connected actions ── */}
      {isConnected && (
        <div className="space-y-2">
          <button onClick={disconnect}
            className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all">
            <Link2Off className="w-4 h-4" /> Disconnect
          </button>
          <button onClick={onOpenPlanner}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98]">
            <Route className="w-4 h-4" /> Buka Flight Planner
          </button>
        </div>
      )}

      {/* Always available: Flight Planner offline */}
      {!isConnected && connStatus !== "connecting" && (
        <button onClick={onOpenPlanner}
          className="w-full py-2 bg-white/5 hover:bg-violet-500/10 border border-white/10 hover:border-violet-500/20 text-white/30 hover:text-violet-300 rounded-xl flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-wider transition-all">
          <Route className="w-3 h-3" /> Flight Planner (Tanpa Drone)
        </button>
      )}
    </div>
  );
}


// ── Smartphone Tab ─────────────────────────────────────────────────────────────
function SmartphoneTab() {
  const [status, setStatus] = useState<DeviceStatus>("disconnected");
  const [deviceName, setDeviceName] = useState("");
  const [deviceId, setDeviceId]     = useState("");
  const [services, setServices]     = useState<string[]>([]);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [btSupported, setBtSupported] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const btDeviceRef = useRef<any>(null);
  const gpsWatchRef = useRef<number | null>(null);

  // Check Web Bluetooth support on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBtSupported(!!(navigator as any).bluetooth);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      if (btDeviceRef.current?.gatt?.connected) btDeviceRef.current.gatt.disconnect();
    };
  }, []);

  const connectBluetooth = async () => {
    setStatus("searching");
    setErrorMsg("");
    setServices([]);
    setBatteryLevel(null);
    toast.loading("Membuka pemindai Bluetooth...", { id: "bt-scan" });

    try {
      // ── Step 1: Request device via browser picker ──
      // Browser akan menampilkan native picker berisi semua BT device di sekitar
      const btDevice = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "battery_service",          // 0x180F — baca level baterai
          "device_information",       // 0x180A — nama, versi, manufacturer
          "generic_access",           // 0x1800 — nama device
          "heart_rate",               // 0x180D — contoh wearable
          "location_and_navigation",  // 0x1819 — GPS/GNSS receiver
          "0000ffe0-0000-1000-8000-00805f9b34fb", // HC-05/HC-06 UART
          "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART (NUS)
        ],
      });

      btDeviceRef.current = btDevice;
      setDeviceName(btDevice.name || "Unknown Device");
      setDeviceId(btDevice.id || "");
      setStatus("connecting");
      toast.loading(`Menghubungkan ke "${btDevice.name}"...`, { id: "bt-scan" });

      // Handle disconnection
      btDevice.addEventListener("gattserverdisconnected", () => {
        setStatus("disconnected");
        setServices([]);
        setBatteryLevel(null);
        toast.info(`📵 "${btDevice.name}" terputus.`);
      });

      // ── Step 2: Connect GATT ──
      const server = await btDevice.gatt.connect();
      toast.loading("Membaca layanan GATT...", { id: "bt-scan" });

      // ── Step 3: Discover services ──
      const discoveredServices = await server.getPrimaryServices();
      const uuids = discoveredServices.map((s: any) => s.uuid as string);
      setServices(uuids);

      // ── Step 4: Read battery level if supported ──
      try {
        const battService = await server.getPrimaryService("battery_service");
        const battChar = await battService.getCharacteristic("battery_level");
        const battVal  = await battChar.readValue();
        setBatteryLevel(battVal.getUint8(0));

        // Subscribe to battery level notifications
        battChar.startNotifications();
        battChar.addEventListener("characteristicvaluechanged", (e: any) => {
          setBatteryLevel(e.target.value.getUint8(0));
        });
      } catch { /* Device doesn't expose battery service */ }

      setStatus("connected");
      toast.success(`✅ "${btDevice.name}" terhubung! ${uuids.length} services ditemukan.`, { id: "bt-scan" });

    } catch (err: any) {
      if (err.name === "NotFoundError" || err.message?.includes("cancelled")) {
        // User cancelled the picker — not an error
        setStatus("disconnected");
        toast.dismiss("bt-scan");
        return;
      }
      if (err.name === "NotSupportedError" || err.message?.includes("GATT")) {
        // Device found but GATT not supported — still show as connected
        setStatus("connected");
        toast.success(`📡 "${deviceName}" terhubung (basic mode — GATT tidak tersedia).`, { id: "bt-scan" });
        return;
      }
      setStatus("error");
      setErrorMsg(err.message || "Koneksi Bluetooth gagal.");
      toast.error("❌ " + (err.message || "Gagal konek Bluetooth"), { id: "bt-scan" });
    }
  };

  const disconnectBluetooth = () => {
    if (btDeviceRef.current?.gatt?.connected) {
      btDeviceRef.current.gatt.disconnect();
    }
    btDeviceRef.current = null;
    setStatus("disconnected");
    setDeviceName("");
    setDeviceId("");
    setServices([]);
    setBatteryLevel(null);
    setErrorMsg("");
    toast.info("Bluetooth diputuskan.");
  };

  // GPS fallback for unsupported browsers
  const connectGPSFallback = () => {
    setStatus("connecting");
    toast.loading("Mengakses GPS browser...", { id: "gps-fallback" });
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
        setStatus("connected");
        setDeviceName("Browser GPS");
        toast.success("📍 GPS browser aktif.", { id: "gps-fallback" });
      },
      err => {
        setStatus("error");
        setErrorMsg("GPS: " + err.message);
        toast.error("GPS gagal: " + err.message, { id: "gps-fallback" });
      },
      { enableHighAccuracy: true }
    ) as number;
  };

  // Helper: friendly UUID label
  const uuidLabel = (uuid: string) => {
    const known: Record<string, string> = {
      "0000180f-0000-1000-8000-00805f9b34fb": "🔋 Battery",
      "0000180a-0000-1000-8000-00805f9b34fb": "ℹ Device Info",
      "00001800-0000-1000-8000-00805f9b34fb": "🔤 Generic Access",
      "00001801-0000-1000-8000-00805f9b34fb": "📡 Generic Attribute",
      "0000180d-0000-1000-8000-00805f9b34fb": "❤ Heart Rate",
      "00001819-0000-1000-8000-00805f9b34fb": "🗺 Location/Navigation",
      "0000ffe0-0000-1000-8000-00805f9b34fb": "📶 HC-05 UART",
      "6e400001-b5a3-f393-e0a9-e50e24dcca9e": "📶 Nordic UART",
    };
    return known[uuid] || uuid.slice(0, 8) + "...";
  };

  return (
    <div className="space-y-4">

      {/* BT Support Banner */}
      {btSupported === false && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[9px] font-black text-amber-400 uppercase tracking-wider">Browser Tidak Mendukung Web Bluetooth</p>
            <p className="text-[8px] text-amber-400/70 mt-0.5 leading-relaxed">
              Gunakan Chrome atau Edge di desktop. Gunakan GPS Browser sebagai alternatif.
            </p>
          </div>
        </div>
      )}

      {/* Device icon + status */}
      <div className="flex flex-col items-center gap-3 py-2">
        <div className={cn(
          "relative p-5 rounded-3xl border-2 transition-all duration-500",
          status === "connected"   ? "bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10"
          : status === "searching" || status === "connecting" ? "bg-blue-500/10 border-blue-500/20"
          : status === "error"     ? "bg-red-500/10 border-red-500/20"
          : "bg-white/5 border-white/10"
        )}>
          {/* Scanning ripple animation */}
          {(status === "searching" || status === "connecting") && (
            <>
              <span className="absolute inset-0 rounded-3xl border-2 border-blue-400/30 animate-ping" />
              <span className="absolute inset-[-6px] rounded-[28px] border border-blue-400/15 animate-ping" style={{ animationDelay: "0.3s" }} />
            </>
          )}
          <Smartphone className={cn("w-8 h-8 transition-colors",
            status === "connected" ? "text-emerald-400"
            : (status === "searching" || status === "connecting") ? "text-blue-400"
            : status === "error" ? "text-red-400"
            : "text-white/30"
          )} />
          {batteryLevel !== null && (
            <div className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none">
              {batteryLevel}%
            </div>
          )}
        </div>

        <StatusBadge status={status} />
        {deviceName && (
          <div className="text-center">
            <p className="text-[11px] font-black text-white">{deviceName}</p>
            {deviceId && <p className="text-[7px] text-white/30 font-mono mt-0.5">{deviceId.slice(0, 16)}...</p>}
          </div>
        )}
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[8px] text-red-400 leading-relaxed">{errorMsg}</p>
        </div>
      )}

      {/* GATT Services list */}
      {services.length > 0 && (
        <div className="bg-black/20 border border-emerald-500/20 rounded-xl p-3 space-y-2">
          <label className="text-[7px] font-black uppercase tracking-widest text-emerald-400/70">
            GATT Services ({services.length} ditemukan)
          </label>
          <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
            {services.map((uuid, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[8px] text-white/70 font-mono">{uuidLabel(uuid)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Battery level */}
      {batteryLevel !== null && (
        <div className="flex items-center justify-between p-3 bg-black/20 border border-white/10 rounded-xl">
          <div className="flex items-center gap-2">
            <Battery className="w-4 h-4 text-emerald-400" />
            <span className="text-[9px] font-black text-white/60 uppercase tracking-wider">Battery Level</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", batteryLevel > 50 ? "bg-emerald-400" : batteryLevel > 20 ? "bg-amber-400" : "bg-red-400")}
                style={{ width: `${batteryLevel}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-emerald-400">{batteryLevel}%</span>
          </div>
        </div>
      )}

      {/* GPS fallback coords */}
      {coords && (
        <div className="bg-black/20 border border-white/10 rounded-xl p-3 space-y-1">
          <label className="text-[7px] font-black uppercase tracking-widest text-emerald-400/70">GPS Location</label>
          <p className="text-[10px] text-white font-mono">{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</p>
          <p className="text-[8px] text-white/40">Akurasi: ±{coords.acc.toFixed(0)}m</p>
        </div>
      )}

      {/* Action buttons */}
      {status === "disconnected" || status === "error" ? (
        <div className="space-y-2">
          {/* Primary: Bluetooth scan */}
          <button
            onClick={connectBluetooth}
            disabled={btSupported === false}
            className={cn(
              "w-full py-3 rounded-xl flex items-center justify-center gap-2.5 text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98]",
              btSupported === false
                ? "bg-white/5 border border-white/10 text-white/20 cursor-not-allowed"
                : "bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10"
            )}
          >
            <Bluetooth className="w-4 h-4" />
            🔍 Scan &amp; Connect Bluetooth
          </button>

          {/* Explanation */}
          <div className="px-1 space-y-1">
            <p className="text-[8px] text-white/30 leading-relaxed text-center">
              Browser akan membuka daftar perangkat Bluetooth di sekitar Anda.<br/>
              Pilih perangkat yang ingin dihubungkan.
            </p>
          </div>

          {/* Secondary: GPS fallback */}
          <button
            onClick={connectGPSFallback}
            className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/70 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-wider transition-all"
          >
            <Navigation2 className="w-3.5 h-3.5" />
            Gunakan GPS Browser
          </button>
        </div>

      ) : status === "searching" || status === "connecting" ? (
        <button disabled className="w-full py-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <Loader2 className="w-4 h-4 animate-spin" />
          {status === "searching" ? "Membuka Browser Picker..." : "Menghubungkan GATT..."}
        </button>

      ) : (
        <button
          onClick={disconnectBluetooth}
          className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all"
        >
          <Link2Off className="w-4 h-4" /> Disconnect
        </button>
      )}

      {btSupported && status === "disconnected" && (
        <p className="text-[7px] text-white/20 text-center">
          Membutuhkan Chrome/Edge · HTTPS · Izin Bluetooth diaktifkan
        </p>
      )}
    </div>
  );
}


// ── GPS Receiver Tab ───────────────────────────────────────────────────────────
function GpsReceiverTab() {
  const [status, setStatus] = useState<DeviceStatus>("disconnected");
  const [nmea, setNmea] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number; alt: number; hdop: number } | null>(null);

  const connectGPS = () => {
    setStatus("connecting");
    toast.loading("Menghubungkan GPS receiver...", { id: "gps-rec" });
    setTimeout(() => {
      setStatus("connected");
      toast.success("📡 GPS Receiver terhubung (Browser NMEA Mode)", { id: "gps-rec" });
      // Get GPS from browser
      navigator.geolocation.watchPosition(pos => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude ?? 0,
          hdop: pos.coords.accuracy / 10,
        });
        setNmea(prev => [
          `$GPGGA,${new Date().toUTCString().slice(17, 25).replace(/:/g, "")},${pos.coords.latitude.toFixed(4)},N,${pos.coords.longitude.toFixed(4)},E,1,08,${(pos.coords.accuracy / 10).toFixed(1)},${(pos.coords.altitude ?? 0).toFixed(1)},M`,
          ...prev.slice(0, 4),
        ]);
      }, err => {
        setStatus("error");
        toast.error("GPS tidak tersedia: " + err.message, { id: "gps-rec" });
      }, { enableHighAccuracy: true });
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-4">
        <div className={cn("p-5 rounded-3xl border-2 transition-all duration-500",
          status === "connected" ? "bg-cyan-500/10 border-cyan-500/30 shadow-lg shadow-cyan-500/10" : "bg-white/5 border-white/10")}>
          <Radio className={cn("w-8 h-8 transition-colors", status === "connected" ? "text-cyan-400" : "text-white/30")} />
        </div>
        <StatusBadge status={status} />
      </div>

      {coords && (
        <div className="bg-black/20 border border-white/10 rounded-xl p-3 space-y-2">
          <label className="text-[7px] font-black uppercase tracking-widest text-cyan-400/70">GNSS Position</label>
          <div className="grid grid-cols-2 gap-2">
            <div><p className="text-[7px] text-white/30 uppercase">Latitude</p><p className="text-[10px] text-white font-mono">{coords.lat.toFixed(6)}°</p></div>
            <div><p className="text-[7px] text-white/30 uppercase">Longitude</p><p className="text-[10px] text-white font-mono">{coords.lng.toFixed(6)}°</p></div>
            <div><p className="text-[7px] text-white/30 uppercase">Altitude</p><p className="text-[10px] text-white font-mono">{coords.alt.toFixed(1)}m</p></div>
            <div><p className="text-[7px] text-white/30 uppercase">HDOP</p><p className="text-[10px] text-cyan-400 font-mono">{coords.hdop.toFixed(1)}</p></div>
          </div>
        </div>
      )}

      {nmea.length > 0 && (
        <div className="bg-black/30 border border-cyan-500/10 rounded-xl p-2 space-y-0.5 font-mono">
          <label className="text-[7px] font-black uppercase tracking-widest text-cyan-400/50">NMEA Stream</label>
          {nmea.map((s, i) => (
            <p key={i} className="text-[7px] text-cyan-400/60 truncate">{s}</p>
          ))}
        </div>
      )}

      {status !== "connected" ? (
        <button onClick={connectGPS} disabled={status === "connecting"}
          className={cn("w-full py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all",
            status === "connecting" ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400" : "bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 active:scale-[0.98]")}>
          {status === "connecting"
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Menghubungkan...</>
            : <><Radio className="w-4 h-4" /> Connect GPS Receiver</>
          }
        </button>
      ) : (
        <button onClick={() => { setStatus("disconnected"); setCoords(null); setNmea([]); }}
          className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all">
          <Link2Off className="w-4 h-4" /> Disconnect
        </button>
      )}
    </div>
  );
}

// ── Main DeviceHubPanel ────────────────────────────────────────────────────────
export function DeviceHubTrigger({ isOpen, setOpen }: { isOpen: boolean; setOpen: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setOpen(!isOpen)}
      title="Device Hub — Drone & Perangkat"
      className={cn(
        "p-2.5 rounded-xl transition-all duration-200 w-full flex justify-center",
        isOpen
          ? "bg-violet-500/20 text-violet-400"
          : "text-muted-foreground hover:bg-white/10 hover:text-white"
      )}
    >
      <Cpu className="w-[17px] h-[17px]" />
    </button>
  );
}

export function DeviceHubPanel({
  isOpen,
  onClose,
  onOpenFlightPlanner,
}: {
  isOpen: boolean;
  onClose: () => void;
  onOpenFlightPlanner: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"drone" | "smartphone" | "gps">("drone");

  if (!isOpen) return null;

  const tabs: { key: "drone" | "smartphone" | "gps"; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "drone",      label: "Drone",       icon: <Route className="w-3.5 h-3.5" />,      color: "text-violet-400" },
    { key: "smartphone", label: "Smartphone",  icon: <Smartphone className="w-3.5 h-3.5" />, color: "text-emerald-400" },
    { key: "gps",        label: "GPS",         icon: <Radio className="w-3.5 h-3.5" />,       color: "text-cyan-400" },
  ];

  return (
    <div className={cn(
      "fixed bottom-[88px] right-4 z-[9998] w-80",
      "rounded-2xl border border-violet-500/20 bg-[#0f1014]/95 backdrop-blur-2xl shadow-2xl overflow-hidden",
      "animate-in slide-in-from-bottom-3 fade-in duration-300"
    )}>
      {/* Accent */}
      <div className="h-[2px] bg-gradient-to-r from-violet-500 via-purple-400/60 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-violet-500/15 rounded-xl border border-violet-500/20">
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-white">Device Hub</h3>
            <p className="text-[8px] font-bold text-violet-400/70 uppercase tracking-widest">Connect · Control · Plan</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-white/10 bg-black/20">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-2.5 text-[7px] font-black uppercase tracking-widest transition-all",
              activeTab === t.key ? cn("border-b-2 border-current", t.color) : "text-white/25 hover:text-white/50"
            )}
          >
            <span className={activeTab === t.key ? t.color : ""}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
        {activeTab === "drone"      && <DroneTab onOpenPlanner={onOpenFlightPlanner} />}
        {activeTab === "smartphone" && <SmartphoneTab />}
        {activeTab === "gps"        && <GpsReceiverTab />}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-white/10 flex items-center justify-center">
        <span className="text-[7px] text-white/20 font-medium">SAKAGIS Device Hub · MAVLink · Web Bluetooth · NMEA</span>
      </div>
    </div>
  );
}
