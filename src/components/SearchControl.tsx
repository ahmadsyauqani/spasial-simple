"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, MapPin, X, Loader2, Navigation, Copy, History, SlidersHorizontal, Check } from "lucide-react";
import proj4 from "proj4";
import { useMapContext } from "@/lib/MapContext";
import { TM3_ZONES } from "@/lib/crs";
import { toast } from "sonner";

type CoordinateMode = "wgs84" | "utm" | "tm3";
type HistoryItem = { label: string; lat: number; lng: number; mode: CoordinateMode };

const HISTORY_KEY = "sakagis-search-history";

function parsePair(value: string) {
  const parts = value.trim().split(/[\s,;]+/).map(Number);
  return parts.length >= 2 && parts.every(Number.isFinite) ? [parts[0], parts[1]] as [number, number] : null;
}

function getProjectedOutputs(lat: number, lng: number) {
  const utmZone = Math.floor((lng + 180) / 6) + 1;
  const hemisphere = lat < 0 ? "S" : "N";
  const utmDef = `+proj=utm +zone=${utmZone} ${hemisphere === "S" ? "+south" : ""} +datum=WGS84 +units=m +no_defs`;
  const [utmX, utmY] = proj4("EPSG:4326", utmDef, [lng, lat]);
  const tm3 = TM3_ZONES.reduce((closest, zone) =>
    Math.abs(zone.cm - lng) < Math.abs(closest.cm - lng) ? zone : closest
  );
  const tm3Def = `+proj=tmerc +lat_0=0 +lon_0=${tm3.cm} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +units=m +no_defs`;
  const [tm3X, tm3Y] = proj4("EPSG:4326", tm3Def, [lng, lat]);

  return {
    wgs84: `${lat.toFixed(7)}, ${lng.toFixed(7)}`,
    utm: `Zona ${utmZone}${hemisphere}: E ${utmX.toFixed(3)}, N ${utmY.toFixed(3)}`,
    tm3: `Zona ${tm3.zone}: X ${tm3X.toFixed(3)}, Y ${tm3Y.toFixed(3)}`,
  };
}

export function SearchControl() {
  const { setSearchResult, searchResult } = useMapContext();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showCoordinateTools, setShowCoordinateTools] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [mode, setMode] = useState<CoordinateMode>("wgs84");
  const [coordinateInput, setCoordinateInput] = useState("");
  const [utmZone, setUtmZone] = useState("48");
  const [utmHemisphere, setUtmHemisphere] = useState<"N" | "S">("S");
  const [tm3Zone, setTm3Zone] = useState("48.1");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved)) setHistory(saved.slice(0, 8));
    } catch (_) {}
  }, []);

  const outputs = useMemo(() => {
    if (!searchResult) return null;
    try { return getProjectedOutputs(searchResult.lat, searchResult.lng); } catch (_) { return null; }
  }, [searchResult]);

  const saveHistory = (item: HistoryItem) => {
    const next = [item, ...history.filter((old) => old.label !== item.label)].slice(0, 8);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const selectCoordinate = (lat: number, lng: number, label: string, sourceMode: CoordinateMode) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error("Koordinat di luar rentang WGS84.");
      return;
    }
    const item = { lat, lng, label, mode: sourceMode };
    setSearchResult(item);
    saveHistory(item);
    setShowResults(false);
    setShowCoordinateTools(false);
  };

  const handleCoordinateSearch = () => {
    try {
      if (mode === "wgs84") {
        const pair = parsePair(coordinateInput);
        if (!pair) throw new Error("Format: latitude, longitude");
        selectCoordinate(pair[0], pair[1], `WGS84: ${pair[0].toFixed(7)}, ${pair[1].toFixed(7)}`, mode);
        return;
      }

      const pair = parsePair(coordinateInput);
      if (!pair) throw new Error("Format: X, Y");
      let sourceDef = "";
      let label = "";
      if (mode === "utm") {
        const zone = Number(utmZone);
        if (!Number.isInteger(zone) || zone < 1 || zone > 60) throw new Error("Zona UTM harus 1-60.");
        sourceDef = `+proj=utm +zone=${zone} ${utmHemisphere === "S" ? "+south" : ""} +datum=WGS84 +units=m +no_defs`;
        label = `UTM Zona ${zone}${utmHemisphere}: E ${pair[0]}, N ${pair[1]}`;
      } else {
        const zone = TM3_ZONES.find((item) => item.zone === tm3Zone);
        if (!zone) throw new Error("Zona TM-3 tidak valid.");
        sourceDef = `+proj=tmerc +lat_0=0 +lon_0=${zone.cm} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +units=m +no_defs`;
        label = `TM-3 Zona ${zone.zone}: X ${pair[0]}, Y ${pair[1]}`;
      }
      const [lng, lat] = proj4(sourceDef, "EPSG:4326", [pair[0], pair[1]]);
      selectCoordinate(lat, lng, label, mode);
    } catch (err: any) {
      toast.error(err.message || "Format koordinat tidak valid.");
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    const pair = parsePair(query);
    if (pair && pair[0] >= -90 && pair[0] <= 90 && pair[1] >= -180 && pair[1] <= 180) {
      selectCoordinate(pair[0], pair[1], `WGS84: ${pair[0].toFixed(7)}, ${pair[1].toFixed(7)}`, "wgs84");
      return;
    }

    setIsSearching(true);
    setShowResults(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
      setResults(await response.json());
    } catch (err) {
      toast.error("Gagal melakukan pencarian alamat.");
    } finally {
      setIsSearching(false);
    }
  };

  const selectResult = (res: any) => {
    selectCoordinate(parseFloat(res.lat), parseFloat(res.lon), res.display_name, "wgs84");
    setQuery("");
  };

  const clearSearch = () => {
    setSearchResult(null);
    setQuery("");
    setShowResults(false);
  };

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} disalin.`);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[40] w-[min(78vw,380px)] sm:w-[min(70vw,420px)]">
      <form onSubmit={handleSearch} className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          {isSearching ? <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" /> : <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-indigo-400 transition-colors" />}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length > 0 && setShowResults(true)}
          placeholder="Cari alamat atau koordinat..."
          className="block w-full pl-10 pr-24 py-2 bg-card/75 backdrop-blur-3xl border border-white/15 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.35)] shadow-indigo-500/10 text-sm text-white placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all hover:border-white/30"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
          {searchResult && <button type="button" onClick={clearSearch} className="p-1.5 hover:bg-white/10 rounded-full text-muted-foreground hover:text-red-400 transition-colors" title="Bersihkan hasil"><X className="h-4 w-4" /></button>}
          <button type="button" onClick={() => setShowCoordinateTools((value) => !value)} className={showCoordinateTools ? "p-1.5 bg-indigo-500/30 text-indigo-300 rounded-xl" : "p-1.5 hover:bg-white/10 text-muted-foreground rounded-xl"} title="Pencarian koordinat"><SlidersHorizontal className="h-4 w-4" /></button>
          <button type="submit" className="p-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 rounded-xl transition-all active:scale-90"><Navigation className="h-4 w-4 fill-indigo-400/20" /></button>
        </div>
      </form>

      {showCoordinateTools && (
        <div className="absolute top-full mt-2 w-full bg-card/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl p-3 space-y-3">
          <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Koordinat</span><button type="button" onClick={() => setShowCoordinateTools(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button></div>
          <div className="grid grid-cols-3 gap-1 bg-black/30 rounded-xl p-1">
            {([['wgs84', 'WGS84'], ['utm', 'UTM'], ['tm3', 'TM-3']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setMode(key)} className={mode === key ? "rounded-lg bg-indigo-500/30 text-indigo-200 py-1.5 text-[10px] font-bold" : "rounded-lg text-white/40 py-1.5 text-[10px] font-bold hover:text-white"}>{label}</button>)}
          </div>
          <div className="flex gap-2">
            {mode === "utm" && <><select value={utmZone} onChange={(e) => setUtmZone(e.target.value)} className="w-20 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-xs text-white"><option value="48">Zona 48</option><option value="49">Zona 49</option><option value="50">Zona 50</option><option value="51">Zona 51</option><option value="52">Zona 52</option><option value="53">Zona 53</option><option value="54">Zona 54</option></select><select value={utmHemisphere} onChange={(e) => setUtmHemisphere(e.target.value as "N" | "S")} className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-xs text-white"><option>N</option><option>S</option></select></>}
            {mode === "tm3" && <select value={tm3Zone} onChange={(e) => setTm3Zone(e.target.value)} className="w-24 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-xs text-white">{TM3_ZONES.map((zone) => <option key={zone.zone} value={zone.zone}>{zone.zone}</option>)}</select>}
            <input value={coordinateInput} onChange={(e) => setCoordinateInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCoordinateSearch())} placeholder={mode === "wgs84" ? "lat, lon" : "X, Y"} className="min-w-0 flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30" />
            <button type="button" onClick={handleCoordinateSearch} className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-bold text-white">Cari</button>
          </div>
          {outputs && <div className="space-y-1 border-t border-white/10 pt-2">{Object.entries(outputs).map(([key, value]) => <button type="button" key={key} onClick={() => copyValue(value, key.toUpperCase())} className="w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10"><span className="text-[10px] text-white/50 uppercase">{key}</span><span className="truncate font-mono text-[10px] text-white/80">{value}</span><Copy className="w-3 h-3 shrink-0 text-indigo-300" /></button>)}</div>}
        </div>
      )}

      {history.length > 0 && !showCoordinateTools && !showResults && (
        <div className="absolute top-full mt-2 w-full bg-card/90 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl p-2">
          <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/40"><History className="w-3 h-3" /> Riwayat lokasi</div>
          {history.slice(0, 4).map((item) => <button type="button" key={`${item.lat}-${item.lng}`} onClick={() => selectCoordinate(item.lat, item.lng, item.label, item.mode)} className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[10px] text-white/70 hover:bg-white/10">{item.label}</button>)}
        </div>
      )}

      {showResults && (results.length > 0 || isSearching) && !showCoordinateTools && (
        <div className="absolute top-full mt-2 w-full bg-card/80 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {isSearching ? <div className="p-4 text-center text-xs text-muted-foreground">Mencari lokasi...</div> : <div className="max-h-[300px] overflow-y-auto py-2">{results.map((res, i) => <button key={i} onClick={() => selectResult(res)} className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors border-b border-white/5 last:border-0"><MapPin className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" /><div className="flex flex-col gap-0.5 overflow-hidden"><span className="text-xs text-white font-medium truncate">{res.display_name}</span><span className="text-[10px] text-muted-foreground truncate italic">{res.lat}, {res.lon}</span></div></button>)}</div>}
        </div>
      )}
    </div>
  );
}
