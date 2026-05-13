"use client";

import { useState, useEffect } from "react";
import { Search, MapPin, X, Loader2, Navigation } from "lucide-react";
import { useMapContext } from "@/lib/MapContext";
import { toast } from "sonner";

export function SearchControl() {
  const { setSearchResult, searchResult } = useMapContext();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setShowResults(true);

    // 1. Check if it's a coordinate pattern: "lat, lng" or "lat lng"
    const coordRegex = /^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$|^(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)$/;
    const match = query.trim().match(coordRegex);

    if (match) {
      const lat = parseFloat(match[1] || match[5]);
      const lng = parseFloat(match[3] || match[7]);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        setSearchResult({
          lat,
          lng,
          label: `Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
        });
        setIsSearching(false);
        setShowResults(false);
        return;
      }
    }

    // 2. Otherwise, use Nominatim API
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
      );
      const data = await response.json();
      setResults(data);
    } catch (err) {
      toast.error("Gagal melakukan pencarian alamat.");
    } finally {
      setIsSearching(false);
    }
  };

  const selectResult = (res: any) => {
    setSearchResult({
      lat: parseFloat(res.lat),
      lng: parseFloat(res.lon),
      label: res.display_name
    });
    setShowResults(false);
    setQuery("");
  };

  const clearSearch = () => {
    setSearchResult(null);
    setQuery("");
    setShowResults(false);
  };

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[40] w-[90%] max-w-[450px]">
      <form 
        onSubmit={handleSearch}
        className="relative group"
      >
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          {isSearching ? (
            <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-indigo-400 transition-colors" />
          )}
        </div>
        
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length > 0 && setShowResults(true)}
          placeholder="Cari alamat atau koordinat..."
          className="block w-full pl-10 pr-12 py-2.5 bg-card/80 backdrop-blur-3xl border border-white/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] shadow-indigo-500/10 text-sm text-white placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all hover:border-white/30"
        />

        <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
          {searchResult && (
             <button
               type="button"
               onClick={clearSearch}
               className="p-1.5 hover:bg-white/10 rounded-full text-muted-foreground hover:text-red-400 transition-colors"
               title="Bersihkan hasil"
             >
               <X className="h-4 w-4" />
             </button>
          )}
          <button
            type="submit"
            className="p-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 rounded-xl transition-all active:scale-90"
          >
            <Navigation className="h-4 w-4 fill-indigo-400/20" />
          </button>
        </div>
      </form>

      {/* Results Dropdown */}
      {showResults && (results.length > 0 || isSearching) && (
        <div className="absolute top-full mt-2 w-full bg-card/80 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {isSearching ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Mencari lokasi...
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto py-2">
              {results.map((res, i) => (
                <button
                  key={i}
                  onClick={() => selectResult(res)}
                  className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors border-b border-white/5 last:border-0"
                >
                  <MapPin className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span className="text-xs text-white font-medium truncate">{res.display_name}</span>
                    <span className="text-[10px] text-muted-foreground truncate italic">
                       {res.lat}, {res.lon}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
