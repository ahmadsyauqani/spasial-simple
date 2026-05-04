"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import { 
  Plus, MousePointer2, Trash2, Pencil, X, 
  CloudUpload, Loader2, Settings, 
  Database, LayoutList, ChevronRight, Save,
  MapPin, Share2, Square
} from "lucide-react";
import { toast } from "sonner";
import { getOrCreateDefaultProject, uploadLayerToSupabase, updateFeaturePropertiesInSupabase } from "@/lib/database";

export function DigitizePanel() {
  const { 
    layers, setLayers, 
    layerGeojsonCache, cacheLayerGeojson,
    activeDigitizingLayerId, setActiveDigitizingLayerId,
    activeEditFeature, setActiveEditFeature,
    mapInstance: map
  } = useMapContext();

  const [isPublishing, setIsPublishing] = useState<string | null>(null);
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerType, setNewLayerType] = useState<'Point' | 'Line' | 'Polygon'>('Polygon');
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [isMainExpanded, setIsMainExpanded] = useState(false);

  const createEmptyLayer = () => {
    if (!newLayerName) {
      toast.error("Nama layer tidak boleh kosong");
      return;
    }
    const id = `local-${Date.now()}`;
    const newLayer = {
      id,
      name: newLayerName,
      geometryType: newLayerType,
      style: { 
        color: newLayerType === 'Point' ? '#ef4444' : (newLayerType === 'Line' ? '#10b981' : '#6366f1'), 
        fillColor: newLayerType === 'Point' ? '#ef4444' : (newLayerType === 'Line' ? '#10b981' : '#6366f1'), 
        fillOpacity: 0.2, 
        weight: 2 
      },
      fields: ["Nama", "Keterangan", "Kategori"]
    };
    
    setLayers(prev => [newLayer, ...prev]);
    cacheLayerGeojson(id, { type: "FeatureCollection", features: [] });
    setNewLayerName("");
    toast.success(`Layer ${newLayerName} (${newLayerType}) berhasil dibuat!`);
  };

  const addField = (layerId: string) => {
    if (!newFieldName) return;
    setLayers(prev => prev.map(l => {
      if (l.id === layerId) {
        const fields = l.fields || ["Nama", "Keterangan", "Kategori"];
        if (fields.includes(newFieldName)) {
           toast.error("Kolom sudah ada");
           return l;
        }
        return { ...l, fields: [...fields, newFieldName] };
      }
      return l;
    }));
    setNewFieldName("");
  };

  const removeField = (layerId: string, fieldName: string) => {
    setLayers(prev => prev.map(l => {
      if (l.id === layerId) {
        const fields = l.fields || ["Nama", "Keterangan", "Kategori"];
        return { ...l, fields: fields.filter(f => f !== fieldName) };
      }
      return l;
    }));
  };

  const renameField = (layerId: string, oldName: string, newName: string) => {
    if (!newName || oldName === newName) return;
    setLayers(prev => prev.map(l => {
      if (l.id === layerId) {
        const fields = l.fields || ["Nama", "Keterangan", "Kategori"];
        if (fields.includes(newName)) {
          toast.error("Nama kolom baru sudah ada");
          return l;
        }
        return { ...l, fields: fields.map(f => f === oldName ? newName : f) };
      }
      return l;
    }));
  };

  const toggleDigitize = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;

    if (activeDigitizingLayerId === layerId) {
      setActiveDigitizingLayerId(null);
      // Try to finish any active drawing before disabling
      if (map?.pm.Draw.getActiveMode()) {
        (map.pm.Draw as any).getActiveShape()?.finish?.();
      }
      map?.pm.disableDraw();
      toast.info("Mode digitasi dinonaktifkan");
    } else {
      setActiveDigitizingLayerId(layerId);
      
      const drawMode = layer.geometryType === 'Point' ? 'Marker' : (layer.geometryType === 'Line' ? 'Polyline' : 'Polygon');
      
      map?.pm.enableDraw(drawMode, {
        snappable: true,
        snapDistance: 20,
      });
      toast.success(`Mode gambar ${layer.geometryType} aktif`);
    }
  };

  const publishLayer = async (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    const fc = layerGeojsonCache[layerId];
    if (!layer || !fc || fc.features.length === 0) {
      toast.error("Tidak ada data untuk disimpan");
      return;
    }

    try {
      setIsPublishing(layerId);
      toast.loading("Publishing to Supabase...", { id: "publish" });
      const project = await getOrCreateDefaultProject();
      const dbLayer = await uploadLayerToSupabase(project.id, layer.name, fc);
      
      setLayers(prev => prev.filter(l => l.id !== layerId).concat({
        ...dbLayer,
        fields: layer.fields,
        geometryType: layer.geometryType
      }));
      setActiveDigitizingLayerId(null);
      toast.success("Layer berhasil disimpan di Supabase!", { id: "publish" });
    } catch (err: any) {
      toast.error("Gagal: " + err.message, { id: "publish" });
    } finally {
      setIsPublishing(null);
    }
  };

  const handleSaveAttributes = async (updatedProps: any) => {
    if (!activeEditFeature) return;
    const { layerId, featureIndex } = activeEditFeature;
    const db_id = updatedProps.db_id;

    if (db_id) {
      try {
        toast.loading("Updating database...", { id: "attr" });
        await updateFeaturePropertiesInSupabase(db_id, updatedProps);
        toast.success("Sinkron Supabase Berhasil", { id: "attr" });
      } catch (err: any) {
        toast.error("Gagal sinkron: " + err.message, { id: "attr" });
        return;
      }
    }

    const fc = { ...layerGeojsonCache[layerId] };
    if (fc && fc.features[featureIndex]) {
      fc.features[featureIndex].properties = updatedProps;
      cacheLayerGeojson(layerId, fc);
      setLayers(prev => [...prev]);
      setActiveEditFeature(null);
      if (!db_id) toast.success("Atribut Tersimpan (Lokal)");
    }
  };

  const localLayers = layers.filter(l => l.id?.startsWith('local-'));

  const getGeomIcon = (type?: string) => {
    switch(type) {
      case 'Point': return <MapPin className="w-3 h-3" />;
      case 'Line': return <Share2 className="w-3 h-3" />;
      default: return <Square className="w-3 h-3" />;
    }
  };

  return (
    <div className="bg-[#1a1c1e] text-gray-200 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300">
      {/* Header - Clickable to expand */}
      <div 
        className="bg-[#25282c] px-4 py-3.5 border-b border-white/10 flex items-center justify-between cursor-pointer hover:bg-[#2a2d31] transition-colors"
        onClick={() => setIsMainExpanded(!isMainExpanded)}
      >
         <div className="flex items-center gap-2.5">
           <div className="p-1.5 bg-orange-500/20 rounded-lg">
             <Database className="w-4 h-4 text-orange-500" />
           </div>
           <h2 className="text-[11px] font-black uppercase tracking-[0.1em] text-white">Spatial Data Editor</h2>
         </div>
         <div className="flex items-center gap-2">
           <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${isMainExpanded ? 'rotate-90 text-orange-500' : ''}`} />
           <Settings className="w-3.5 h-3.5 text-gray-500 hover:text-white transition-colors" />
         </div>
      </div>

      {isMainExpanded && (
        <div className="p-5 flex flex-col gap-6 overflow-y-auto max-h-[75vh] scrollbar-thin scrollbar-thumb-white/10 animate-in slide-in-from-top-4 duration-300">
          
          {/* Create Layer Section */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] ml-1">New Dataset</label>
            
            {/* Geometry Type Selector */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-[#25282c] rounded-xl border border-white/5">
              {(['Point', 'Line', 'Polygon'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setNewLayerType(type)}
                  className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg transition-all ${newLayerType === type ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                >
                  {getGeomIcon(type)}
                  <span className="text-[9px] font-bold uppercase tracking-wider">{type}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Layer Name..."
                className="flex-1 bg-[#2a2d31] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all shadow-inner"
                value={newLayerName}
                onChange={(e) => setNewLayerName(e.target.value)}
              />
              <button 
                onClick={createEmptyLayer}
                className="bg-orange-500 text-white p-2.5 rounded-xl hover:bg-orange-600 transition-all shadow-lg active:scale-95"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Layer List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em]">Active Layers</label>
              <span className="text-[9px] px-2 py-0.5 bg-white/5 rounded-full text-gray-400">{localLayers.length} total</span>
            </div>
            
            <div className="space-y-2.5">
              {localLayers.map(layer => (
                <div key={layer.id} className={`group flex flex-col rounded-2xl border transition-all duration-300 ${expandedLayerId === layer.id ? 'bg-[#25282c] border-orange-500/30 shadow-xl' : 'bg-[#212327] border-white/5 hover:border-white/10'}`}>
                  <div className="flex items-center justify-between p-3.5 cursor-pointer" onClick={() => setExpandedLayerId(expandedLayerId === layer.id ? null : (layer.id as string))}>
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${activeDigitizingLayerId === layer.id ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-500'}`}>
                        {getGeomIcon(layer.geometryType)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-100 group-hover:text-white transition-colors">{layer.name}</span>
                        <span className="text-[9px] text-gray-500 font-medium uppercase tracking-tight">{layer.geometryType} • {layerGeojsonCache[layer.id!]?.features?.length || 0} Features</span>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform duration-300 ${expandedLayerId === layer.id ? 'rotate-90 text-orange-500' : ''}`} />
                  </div>

                  {expandedLayerId === layer.id && (
                    <div className="px-4 pb-4 pt-1 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleDigitize(layer.id!); }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${activeDigitizingLayerId === layer.id ? 'bg-orange-500 text-white shadow-lg' : 'bg-white/5 hover:bg-white/10 text-gray-300'}`}
                        >
                          <MousePointer2 className="w-3.5 h-3.5" />
                          {activeDigitizingLayerId === layer.id ? 'Drawing ON' : `Draw ${layer.geometryType}`}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); publishLayer(layer.id!); }}
                          disabled={isPublishing === layer.id}
                          className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 transition-all flex items-center justify-center"
                        >
                          {isPublishing === layer.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Schema Management */}
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Fields (Schema)</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="text" 
                              placeholder="Add Column..."
                              className="bg-transparent border-b border-white/10 text-[9px] py-0.5 focus:border-orange-500 focus:outline-none w-20 text-white"
                              value={newFieldName}
                              onChange={(e) => setNewFieldName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && addField(layer.id!)}
                            />
                            <Plus className="w-3 h-3 text-orange-500 cursor-pointer hover:scale-125 transition-transform" onClick={() => addField(layer.id!)} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {(layer.fields || ["Nama", "Keterangan", "Kategori"]).map(field => (
                            <div key={field} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/5 rounded-full group/field hover:border-white/20 transition-all">
                              <span 
                                className="text-[9px] text-gray-400 font-medium cursor-text focus:outline-none focus:text-orange-400 min-w-[20px]"
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => renameField(layer.id!, field, e.currentTarget.textContent || "")}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                              >
                                {field}
                              </span>
                              <X className="w-2.5 h-2.5 text-gray-600 hover:text-red-500 cursor-pointer hidden group-hover/field:block" onClick={() => removeField(layer.id!, field)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Feature Inspector */}
          {activeEditFeature && (
            <div className="mt-2 flex flex-col gap-0 rounded-2xl border border-orange-500/40 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="bg-[#2a2d31] px-4 py-3 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <Pencil className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-[10px] font-black uppercase text-white tracking-widest">Attribute Inspector</span>
                </div>
                <button onClick={() => setActiveEditFeature(null)} className="p-1 hover:bg-white/10 rounded-full">
                  <X className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
              
              <div className="bg-[#1e2023] p-5 space-y-4">
                 <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
                   {(layers.find(l => l.id === activeEditFeature.layerId)?.fields || ["Nama", "Keterangan", "Kategori"]).map(f => (
                     <div key={f} className="space-y-1.5 group">
                       <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.1em] ml-1 group-focus-within:text-orange-500 transition-colors">{f}</label>
                       <textarea 
                         rows={f === "Keterangan" ? 3 : 1}
                         defaultValue={activeEditFeature.properties[f] || ""}
                         className="w-full bg-[#2a2d31] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all resize-none shadow-inner"
                         onBlur={(e) => {
                           const newProps = { ...activeEditFeature.properties, [f]: e.target.value };
                           setActiveEditFeature({ ...activeEditFeature, properties: newProps });
                         }}
                       />
                     </div>
                   ))}
                 </div>

                 <button 
                   onClick={() => handleSaveAttributes(activeEditFeature.properties)}
                   className="w-full bg-orange-500 text-white py-3.5 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
                 >
                   <Save className="w-4 h-4" />
                   Apply Changes
                 </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
