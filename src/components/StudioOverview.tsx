"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, ChevronRight, Layers3, Mountain, ScanLine, UploadCloud, X } from "lucide-react";
import { useMapContext } from "@/lib/MapContext";

export type SceneDestination = "current" | "bromo" | "rinjani" | "toba";

const DISMISS_KEY = "sakagis-overview-dismissed";
const AUTO_HIDE_MS = 6000;

export function StudioOverview({ onExplore, onUpload }: {
  onExplore: (destination: SceneDestination) => void;
  onUpload: () => void;
}) {
  const { layers, mapInstance } = useMapContext();
  // Collapsed on the server and on return visits; expands once on a fresh first visit.
  const [collapsed, setCollapsed] = useState(true);
  const dismissedRef = useRef(false);

  const collapse = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setCollapsed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
  }, []);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(DISMISS_KEY) === "1"; } catch {}
    if (seen) { dismissedRef.current = true; return; }
    setCollapsed(false);
    const timer = setTimeout(collapse, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [collapse]);

  // Any map interaction means the user is working; get out of the way.
  useEffect(() => {
    if (!mapInstance || collapsed) return;
    const events = ["dragstart", "zoomstart", "click"] as const;
    events.forEach(event => mapInstance.on(event, collapse));
    return () => { events.forEach(event => mapInstance.off(event, collapse)); };
  }, [mapInstance, collapsed, collapse]);

  // Explicit tool intent takes precedence over onboarding, including keyboard use.
  useEffect(() => {
    if (collapsed) return;
    const onToolIntent = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.map-action-controls, .map-instrument-dock')) collapse();
    };
    document.addEventListener('click', onToolIntent, true);
    return () => document.removeEventListener('click', onToolIntent, true);
  }, [collapsed, collapse]);

  if (collapsed) {
    return (
      <button className="studio-overview-fab" onClick={() => onExplore("current")} aria-label="Buka explorer 3D">
        <Box size={16} /><span>Explorer 3D</span>
      </button>
    );
  }

  const run = (action: () => void) => () => { collapse(); action(); };

  return (
    <section className="studio-overview" aria-label="Ringkasan workspace">
      <div className="studio-overview-heading">
        <span className="studio-eyebrow"><span className="studio-status-dot" /> YOUR SPATIAL WORKSPACE</span>
        <button aria-label="Tutup ringkasan workspace" onClick={collapse}><X size={15} /></button>
      </div>
      <h1>Perspektif baru.<br /><span>Eksplorasi tanpa batas.</span></h1>
      <p>Petakan ide, analisis wilayah, dan temukan dimensi baru dari data spasialmu.</p>
      <button className="studio-scene-card" onClick={run(() => onExplore("bromo"))} aria-label="Jelajahi Bromo dalam 3D">
          <div className="studio-terrain-art" aria-hidden="true">
            <div className="studio-terrain-grid" />
            <svg viewBox="0 0 300 140"><path d="M25 104 107 32 157 67 199 13 279 97 177 135Z" fill="#1b3b40" /><path d="m25 104 82-72 11 67 59 36Z" fill="#38756d" /><path d="m107 32 50 35-39 32Z" fill="#a2c6a0" /><path d="m118 99 81-86-3 78-19 44Z" fill="#528b7d" /><path d="m199 13 80 84-83-6Z" fill="#254d51" /><path d="m162 52 37-39 21 22-21-8-17 29Z" fill="#d6e3bd" /><path d="m25 104 82-72 50 35 42-54 80 84-102 38Z" fill="none" stroke="#b9e9c0" strokeOpacity=".35" /><path d="m61 110 49-58 5 63m21 8 63-84 43 70m-206-5 66-16 97 3 62 10m-179-29 38 8 74-16 35 9" fill="none" stroke="#b9e9c0" strokeOpacity=".22" /></svg>
            <span className="studio-art-pin"><ScanLine size={15} /></span>
            <span className="studio-art-label">7.9425° S · 112.9530° E</span>
          </div>
        <div className="studio-scene-caption"><span><small>FEATURED LANDSCAPE</small><strong>Bromo, Jawa Timur</strong></span><span className="studio-round-arrow"><ChevronRight size={18} /></span></div>
      </button>
      <button className="studio-primary" onClick={run(() => onExplore("current"))} aria-label="Buka explorer 3D"><Box size={17} /> Buka explorer 3D <ChevronRight size={16} /></button>
      <div className="studio-overview-footer"><span><Layers3 size={14} /> {layers.length} layer workspace</span><button onClick={run(onUpload)}><UploadCloud size={14} /> Impor data</button></div>
      <div className="studio-destinations"><span><Mountain size={13} /> Jelajah cepat</span><button onClick={run(() => onExplore("rinjani"))}>Rinjani ↗</button><button onClick={run(() => onExplore("toba"))}>Toba ↗</button></div>
    </section>
  );
}

export function StudioClock() {
  const [time, setState] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const update = () => setState(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
    update();
    timer.current = setInterval(update, 60_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);
  return <span className="studio-time">{time}<span>LOCAL TIME</span></span>;
}
