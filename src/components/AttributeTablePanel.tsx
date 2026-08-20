"use client";

import { useMapContext } from "@/lib/MapContext";
import { useState, useMemo, useEffect, useRef } from "react";
import { X, Search, Table2, Layers, SearchX, Check, Minus, Maximize2, Minimize2, GripVertical, Pencil, Save, Merge, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Draggable from "react-draggable";
import { supabase } from "@/lib/supabase";
import { deleteGeometriesFromSupabase, insertGeometryToSupabase } from "@/lib/database";

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
  const [panelWidth, setPanelWidth] = useState(720);
  const [panelHeight, setPanelHeight] = useState(360);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [resizeDir, setResizeDir] = useState<null | "e" | "s" | "se">(null);
  const [editingCell, setEditingCell] = useState<{ originalIndex: number, key: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingFeature, setEditingFeature] = useState<{ originalIndex: number, values: Record<string, string> } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ x: number, y: number, w: number, h: number } | null>(null);
  const positionedRef = useRef(false);

  // Center the window on first open
  useEffect(() => {
    if (!isAttributeTableOpen) {
      positionedRef.current = false;
      return;
    }
    if (!positionedRef.current && typeof window !== "undefined") {
      positionedRef.current = true;
      setPosition({
        x: Math.max(16, Math.round((window.innerWidth - panelWidth) / 2)),
        y: Math.max(80, Math.round((window.innerHeight - panelHeight) / 3)),
      });
    }
  }, [isAttributeTableOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize handlers (right = width, bottom = height, corner = both)
  const beginResize = (dir: "e" | "s" | "se") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: panelWidth, h: panelHeight };
    setResizeDir(dir);
  };

  useEffect(() => {
    if (!resizeDir) return;
    const move = (e: MouseEvent) => {
      const s = resizeStartRef.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (resizeDir === "e" || resizeDir === "se") {
        setPanelWidth(Math.max(360, Math.min(window.innerWidth - 20, s.w + dx)));
      }
      if (resizeDir === "s" || resizeDir === "se") {
        setPanelHeight(Math.max(220, Math.min(window.innerHeight - 20, s.h + dy)));
      }
    };
    const up = () => {
      setResizeDir(null);
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, [resizeDir]);

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

  // Reset selection when switching layer
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTableLayerId]);

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

    const currentValue = f.properties?.[key] !== undefined && f.properties?.[key] !== null ? String(f.properties[key]) : "";
    if (currentValue === editValue) {
      setEditingCell(null);
      return;
    }

    try {
      if (f.properties.db_id) {
        const { updateFeaturePropertiesInSupabase } = await import('@/lib/database');
        const newProps = { ...f.properties, [key]: editValue };
        await updateFeaturePropertiesInSupabase(f.properties.db_id, newProps);
      }

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

  const openEditDialog = (f: any) => {
    const values: Record<string, string> = {};
    headers.forEach(h => {
      if (h === "db_id" || h === "FID") return;
      const v = f.properties?.[h];
      values[h] = v !== undefined && v !== null ? String(v) : "";
    });
    setEditingFeature({ originalIndex: f._originalIndex, values });
  };

  const saveEditDialog = async () => {
    if (!editingFeature || !activeTableLayerId || !activeGeoJson) return;
    const f = activeGeoJson.features[editingFeature.originalIndex];
    try {
      const newProps = { ...(f.properties || {}), ...editingFeature.values };

      if (f.properties?.db_id) {
        const { updateFeaturePropertiesInSupabase } = await import('@/lib/database');
        await updateFeaturePropertiesInSupabase(f.properties.db_id, newProps);
      }

      const updatedFC = { ...activeGeoJson };
      updatedFC.features[editingFeature.originalIndex].properties = newProps;
      cacheLayerGeojson(activeTableLayerId, updatedFC);

      toast.success("Atribut diperbarui");
      setEditingFeature(null);
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menyimpan: ${err.message}`);
    }
  };

  if (!isAttributeTableOpen) return null;

  const toggleSelect = (idx: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const selectedFeatures = filteredFeatures.filter((f: any) => selectedIds.has(f._originalIndex));
  const selectedCount = selectedFeatures.length;
  const canMerge = selectedCount >= 2 && selectedFeatures.every((f: any) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");
  const canSplit = selectedCount === 1 && selectedFeatures[0]?.geometry?.type === "MultiPolygon";
  const allSelected = filteredFeatures.length > 0 && filteredFeatures.every((f: any) => selectedIds.has(f._originalIndex));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allSelected) return new Set();
      return new Set(filteredFeatures.map((f: any) => f._originalIndex));
    });
  };

  const refetchLayerGeometry = async () => {
    if (!activeTableLayerId) return;
    const { data, error } = await supabase.rpc('get_layer_feature_collection', { p_layer_id: activeTableLayerId, p_group_key: 'none' });
    if (!error && data) cacheLayerGeojson(activeTableLayerId, data);
  };

  const mergeSelectedFeatures = async () => {
    if (!activeTableLayerId || !activeGeoJson) return;
    const selected = filteredFeatures.filter((f: any) => selectedIds.has(f._originalIndex));
    if (selected.length < 2) return;

    const polys: any[] = [];
    for (const f of selected) {
      if (f.geometry?.type === "Polygon") polys.push(f.geometry.coordinates);
      else if (f.geometry?.type === "MultiPolygon") polys.push(...f.geometry.coordinates);
      else { toast.error("Hanya Polygon/MultiPolygon yang bisa digabung."); return; }
    }

    const mergedGeom = { type: "MultiPolygon", coordinates: polys };
    const props = { ...(selected[0].properties || {}) };
    delete props.db_id;
    delete props.FID;

    const remaining = activeGeoJson.features.filter((_: any, i: number) => !selectedIds.has(i));
    const mergedFeature = { type: "Feature", properties: props, geometry: mergedGeom };
    cacheLayerGeojson(activeTableLayerId, { ...activeGeoJson, features: [...remaining, mergedFeature] });
    setSelectedIds(new Set());

    try {
      const removedIds = selected.map((f: any) => f.properties?.db_id).filter(Boolean);
      if (removedIds.length) await deleteGeometriesFromSupabase(removedIds);
      await insertGeometryToSupabase(activeTableLayerId, props, mergedGeom);
      await refetchLayerGeometry();
      toast.success(`${selected.length} fitur digabung jadi MultiPolygon`);
    } catch (err: any) {
      toast.error(`Gagal menggabung: ${err.message || err}`);
    }
  };

  const splitFeature = async (f: any) => {
    if (!activeTableLayerId || !activeGeoJson) return;
    if (f.geometry?.type !== "MultiPolygon") return;

    const parts = f.geometry.coordinates.map((poly: any, i: number) => ({
      type: "Feature",
      properties: { ...(f.properties || {}), _part: i + 1 },
      geometry: { type: "Polygon", coordinates: poly }
    }));

    const remaining = activeGeoJson.features.filter((_: any, i: number) => i !== f._originalIndex);
    cacheLayerGeojson(activeTableLayerId, { ...activeGeoJson, features: [...remaining, ...parts] });
    setSelectedIds(new Set());

    try {
      if (f.properties?.db_id) await deleteGeometriesFromSupabase([f.properties.db_id]);
      for (const p of parts) {
        const props = { ...p.properties };
        delete props.db_id;
        delete props.FID;
        await insertGeometryToSupabase(activeTableLayerId, props, p.geometry);
      }
      await refetchLayerGeometry();
      toast.success(`MultiPolygon dipecah jadi ${parts.length} polygon`);
    } catch (err: any) {
      toast.error(`Gagal memecah: ${err.message || err}`);
    }
  };

  const headerBar = (
    <div className="attr-header flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50 bg-black/20 shrink-0 cursor-grab active:cursor-grabbing select-none">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 text-orange-400 shrink-0">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40" />
          <Table2 className="w-4 h-4" />
          <span className="font-bold text-xs tracking-wide">Attribute Table</span>
        </div>

        <div className="w-px h-4 bg-border/50 shrink-0" />

        <div className="flex items-center gap-1.5 shrink-0">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={activeTableLayerId || ""}
            onChange={(e) => setActiveTableLayerId(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md py-1 px-2 text-xs text-white focus:outline-none focus:border-orange-500/50 max-w-[160px]"
          >
            <option value="" disabled>Pilih Layer...</option>
            {layers.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {selectedCount > 0 && (
          <>
            <div className="w-px h-4 bg-border/50 shrink-0" />
            <div className="flex items-center gap-1.5 shrink-0">
              {canMerge && (
                <button
                  onClick={mergeSelectedFeatures}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/40 transition-colors"
                  title="Gabung fitur terpilih jadi MultiPolygon"
                >
                  <Merge className="w-3 h-3" /> Gabung ({selectedCount})
                </button>
              )}
              {canSplit && (
                <button
                  onClick={() => splitFeature(selectedFeatures[0])}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/40 transition-colors"
                  title="Pecah MultiPolygon jadi polygon terpisah"
                >
                  <Unlink className="w-3 h-3" /> Pecah
                </button>
              )}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[10px] px-2 py-1 rounded text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
                title="Batalkan pilihan"
              >
                Batal
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative hidden sm:block">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari data..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-full py-1 pl-8 pr-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 w-[150px] transition-all"
          />
        </div>

        <button
          onClick={() => setIsMinimized(v => !v)}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-white"
          title={isMinimized ? "Kembalikan" : "Minimize"}
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsMaximized(v => !v)}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-white"
          title={isMaximized ? "Kembalikan Ukuran" : "Maximize"}
        >
          {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setIsAttributeTableOpen(false)}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-white"
          title="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const minimizedHeader = (
    <div className="attr-header flex items-center justify-between gap-2 px-3 py-1.5 bg-black/20 shrink-0 cursor-grab active:cursor-grabbing select-none">
      <div className="flex items-center gap-2 text-orange-400">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40" />
        <Table2 className="w-4 h-4" />
        <span className="font-bold text-xs tracking-wide">Attribute Table</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setIsMinimized(false)}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-white"
          title="Kembalikan"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsAttributeTableOpen(false)}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-white"
          title="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const tableBody = (
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
              <th className="px-2 py-3 font-bold text-muted-foreground bg-black/20 w-8 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="accent-orange-500 cursor-pointer"
                  title="Pilih semua"
                />
              </th>
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
                <td className="px-2 py-2 whitespace-nowrap text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(f._originalIndex)}
                    onChange={() => toggleSelect(f._originalIndex)}
                    className="accent-orange-500 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground text-center">
                  {f._originalIndex + 1}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => {
                        if (activeTableLayerId) setZoomFeature(f);
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/40 transition-colors"
                      title="Zoom ke fitur ini di peta"
                    >
                      Zoom
                    </button>
                    <button
                      onClick={() => openEditDialog(f)}
                      className="text-[10px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/40 transition-colors"
                      title="Edit atribut fitur ini"
                    >
                      Edit
                    </button>
                  </div>
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
  );

  // Edit dialog (modal) for editing all attributes of a feature
  const editDialog = editingFeature ? (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={() => setEditingFeature(null)}
    >
      <div
        className="bg-card border border-border/50 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-black/20">
          <div className="flex items-center gap-2 text-orange-400">
            <Pencil className="w-4 h-4" />
            <span className="font-bold text-sm">Edit Atribut</span>
          </div>
          <button
            onClick={() => setEditingFeature(null)}
            className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {Object.entries(editingFeature.values).map(([key, value]) => (
            <label key={key} className="block">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">{key}</span>
              <input
                type="text"
                value={value}
                onChange={(e) => setEditingFeature(prev => prev ? { ...prev, values: { ...prev.values, [key]: e.target.value } } : prev)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50"
              />
            </label>
          ))}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border/50 bg-black/20">
          <button
            onClick={() => setEditingFeature(null)}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:bg-white/10 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={saveEditDialog}
            className="flex-[2] py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            Simpan
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // Maximized: full-screen window
  if (isMaximized) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl flex flex-col">
          {headerBar}
          {tableBody}
        </div>
        {editDialog}
      </>
    );
  }

  // Floating draggable + resizable window
  return (
    <>
      <Draggable
        handle=".attr-header"
        bounds="body"
        nodeRef={nodeRef}
        position={position}
        onDrag={(e, data) => setPosition({ x: data.x, y: data.y })}
        cancel="input, button, select, textarea"
      >
        <div
          ref={nodeRef}
          className="fixed z-40 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
          style={{ width: panelWidth, height: isMinimized ? "auto" : panelHeight }}
        >
          {isMinimized ? minimizedHeader : headerBar}

          {!isMinimized && tableBody}

          {!isMinimized && (
            <>
              <div
                onMouseDown={beginResize("e")}
                className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize hover:bg-orange-500/50 z-10"
              />
              <div
                onMouseDown={beginResize("s")}
                className="absolute bottom-0 left-0 h-1.5 w-full cursor-ns-resize hover:bg-orange-500/50 z-10"
              />
              <div
                onMouseDown={beginResize("se")}
                className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize z-20"
              />
            </>
          )}
        </div>
      </Draggable>
      {editDialog}
    </>
  );
}
