"use client";

import { useMapContext } from "@/lib/MapContext";
import { useState, useMemo, useEffect, useRef } from "react";
import { X, Search, Table2, Layers, SearchX, GripHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function AttributeTablePanel() {
  const {
    isAttributeTableOpen,
    setIsAttributeTableOpen,
    layers,
    layerGeojsonCache,
    activeTableLayerId,
    setActiveTableLayerId,
    setZoomFeature,
    cacheLayerGeojson,
  } = useMapContext();

  const [searchTerm, setSearchTerm] = useState("");
  const [panelHeight, setPanelHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [editingCell, setEditingCell] = useState<{ originalIndex: number, key: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight >= 200 && newHeight <= window.innerHeight * 0.8) {
        setPanelHeight(newHeight);
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

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

  const handleEditSave = async (f: any, key: string, originalIndex: number) => {
    if (!activeTableLayerId || !activeGeoJson) return;
    
    // Check if value actually changed
    const currentValue = f.properties?.[key] !== undefined && f.properties?.[key] !== null ? String(f.properties[key]) : "";
    if (currentValue === editValue) {
      setEditingCell(null);
      return;
    }

    try {
      // 1. Update backend if db_id exists
      if (f.properties.db_id) {
        const { updateFeaturePropertiesInSupabase } = await import('@/lib/database');
        const newProps = { ...f.properties, [key]: editValue };
        await updateFeaturePropertiesInSupabase(f.properties.db_id, newProps);
      }

      // 2. Update local cache
      const updatedFC = { ...activeGeoJson };
      if (!updatedFC.features[originalIndex].properties) {
        updatedFC.features[originalIndex].properties = {};
      }
      updatedFC.features[originalIndex].properties[key] = editValue;
      cacheLayerGeojson(activeTableLayerId, updatedFC);
      
      toast.success(`Atribut diperbarui`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menyimpan: ${err.message}`);
    } finally {
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, f: any, key: string, originalIndex: number) => {
    if (e.key === 'Enter') {
      handleEditSave(f, key, originalIndex);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  if (!isAttributeTableOpen) return null;

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border/50 shadow-[0_-8px_32px_rgba(0,0,0,0.4)] flex flex-col"
      style={{ height: `${panelHeight}px` }}
    >
      {/* ── Drag Handle ── */}
      <div 
        className="w-full h-1.5 bg-border/20 hover:bg-orange-500/50 cursor-row-resize flex items-center justify-center transition-colors shrink-0"
        onMouseDown={() => setIsResizing(true)}
      >
        <GripHorizontal className="w-4 h-4 text-white/20" />
      </div>

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
                <th className="px-4 py-3 font-bold text-muted-foreground whitespace-nowrap bg-black/20 w-12 text-center">Aksi</th>
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
                  className="border-b border-border/30 hover:bg-white/5 transition-colors group"
                >
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground text-center">
                    {f._originalIndex + 1}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-center">
                    <button
                      onClick={() => {
                        if (activeTableLayerId) setZoomFeature(f);
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/40 transition-colors"
                      title="Zoom ke fitur ini di peta"
                    >
                      Zoom
                    </button>
                  </td>
                  {headers.map(h => {
                    const isEditing = editingCell?.originalIndex === f._originalIndex && editingCell?.key === h;
                    const val = f.properties?.[h] !== undefined && f.properties?.[h] !== null ? String(f.properties[h]) : '';

                    return (
                      <td 
                        key={h} 
                        className={cn(
                          "px-4 py-2 whitespace-nowrap max-w-[200px] truncate border-l border-white/5 cursor-text",
                          isEditing ? "p-1" : "hover:bg-white/10"
                        )}
                        onDoubleClick={() => {
                          if (h !== "db_id" && h !== "FID") {
                            setEditingCell({ originalIndex: f._originalIndex, key: h });
                            setEditValue(val);
                          } else {
                            toast.warning("ID Internal tidak bisa diedit.");
                          }
                        }}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              ref={inputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, f, h, f._originalIndex)}
                              onBlur={() => handleEditSave(f, h, f._originalIndex)}
                              className="w-full bg-black/60 border border-orange-500/50 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                            />
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          </div>
                        ) : (
                          <span className="text-foreground/80 block w-full" title="Double click untuk edit">
                            {val || <span className="text-muted-foreground/30 italic">-</span>}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
