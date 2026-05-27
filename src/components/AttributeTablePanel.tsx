"use client";

import { useMapContext } from "@/lib/MapContext";
import { useState, useMemo, useEffect } from "react";
import { X, Search, Table2, Layers, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";

export function AttributeTablePanel() {
  const {
    isAttributeTableOpen,
    setIsAttributeTableOpen,
    layers,
    layerGeojsonCache,
    activeTableLayerId,
    setActiveTableLayerId,
    setZoomFeature,
  } = useMapContext();

  const [searchTerm, setSearchTerm] = useState("");

  // Default select the first available layer if none is selected
  useEffect(() => {
    if (isAttributeTableOpen && !activeTableLayerId && layers.length > 0) {
      setActiveTableLayerId(layers[0].id || null);
    }
  }, [isAttributeTableOpen, activeTableLayerId, layers, setActiveTableLayerId]);

  const activeGeoJson = activeTableLayerId ? layerGeojsonCache[activeTableLayerId] : null;

  // Extract all unique headers (property keys) from the features
  const headers = useMemo(() => {
    if (!activeGeoJson || !activeGeoJson.features) return [];
    const keys = new Set<string>();
    activeGeoJson.features.forEach((f: any) => {
      if (f.properties) {
        Object.keys(f.properties).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [activeGeoJson]);

  // Filter features based on search term
  const filteredFeatures = useMemo(() => {
    if (!activeGeoJson || !activeGeoJson.features) return [];
    if (!searchTerm) return activeGeoJson.features.map((f: any, i: number) => ({ ...f, _originalIndex: i }));

    const lowerSearch = searchTerm.toLowerCase();
    return activeGeoJson.features
      .map((f: any, i: number) => ({ ...f, _originalIndex: i }))
      .filter((f: any) => {
        if (!f.properties) return false;
        return Object.values(f.properties).some(val => 
          String(val).toLowerCase().includes(lowerSearch)
        );
      });
  }, [activeGeoJson, searchTerm]);

  if (!isAttributeTableOpen) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border/50 shadow-[0_-8px_32px_rgba(0,0,0,0.4)] flex flex-col transition-transform duration-300 h-[35vh] max-h-[500px] min-h-[200px]">
      
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-black/20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-orange-400">
            <Table2 className="w-5 h-5" />
            <span className="font-bold text-sm tracking-wide">Attribute Table</span>
          </div>

          <div className="w-px h-5 bg-border/50" />

          {/* Layer Selector */}
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <select
              value={activeTableLayerId || ""}
              onChange={(e) => setActiveTableLayerId(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-md py-1 px-2 text-xs text-white focus:outline-none focus:border-orange-500/50"
            >
              <option value="" disabled>Pilih Layer...</option>
              {layers.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-full py-1 pl-8 pr-4 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 w-[200px] transition-all"
            />
          </div>

          <button
            onClick={() => setIsAttributeTableOpen(false)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-black/10">
        {!activeGeoJson ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Layers className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm">Tidak ada layer aktif yang dipilih.</p>
          </div>
        ) : filteredFeatures.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <SearchX className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm">Data tidak ditemukan.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
              <tr>
                <th className="px-4 py-3 font-bold text-muted-foreground whitespace-nowrap bg-black/20 w-12 text-center">No</th>
                {headers.map(h => (
                  <th key={h} className="px-4 py-3 font-bold text-muted-foreground whitespace-nowrap bg-black/20 uppercase tracking-wider text-[10px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredFeatures.map((f: any, idx: number) => (
                <tr 
                  key={idx} 
                  className="border-b border-border/30 hover:bg-white/5 transition-colors cursor-pointer group"
                  onClick={() => {
                    if (activeTableLayerId) {
                      setZoomFeature(f);
                    }
                  }}
                  title="Klik untuk zoom ke lokasi"
                >
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground text-center group-hover:text-orange-400">
                    {f._originalIndex + 1}
                  </td>
                  {headers.map(h => (
                    <td key={h} className="px-4 py-2 whitespace-nowrap text-foreground/80 max-w-[200px] truncate">
                      {f.properties?.[h] !== undefined && f.properties?.[h] !== null ? String(f.properties[h]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
