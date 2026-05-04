"use client";

import { useState, useEffect, useRef } from "react";
import { useMapContext } from "@/lib/MapContext";
import { 
  Plus, MousePointer2, Trash2, Pencil, X, 
  CloudUpload, Loader2, Settings, 
  Database, LayoutList, ChevronRight, Save,
  MapPin, Share2, Square, GripVertical
} from "lucide-react";
import { toast } from "sonner";
import { getOrCreateDefaultProject, uploadLayerToSupabase, updateFeaturePropertiesInSupabase } from "@/lib/database";
import Draggable from 'react-draggable';

export function DigitizePanel() {
  const { 
    layers, setLayers, 
    layerGeojsonCache, cacheLayerGeojson,
    activeDigitizingLayerId, setActiveDigitizingLayerId,
    activeEditFeature, setActiveEditFeature,
    mapInstance: map,
    isDigitizePanelExpanded: isMainExpanded,
    setIsDigitizePanelExpanded: setIsMainExpanded,
    digitizeSettings, setDigitizeSettings
  } = useMapContext();

  const [isPublishing, setIsPublishing] = useState<string | null>(null);
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerType, setNewLayerType] = useState<'Point' | 'Line' | 'Polygon'>('Polygon');
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const nodeRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

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
      if (map?.pm.Draw.getActiveMode()) {
        (map.pm.Draw as any).getActiveShape()?.finish?.();
      }
      map?.pm.disableDraw();
      toast.info("Mode digitasi dinonaktifkan");
    } else {
      setActiveDigitizingLayerId(layerId);
      const drawMode = layer.geometryType === 'Point' ? 'Marker' : (layer.geometryType === 'Line' ? 'Polyline' : 'Polygon');
      map?.pm.enableDraw(drawMode, { 
        snappable: digitizeSettings.snapping, 
        snapDistance: digitizeSettings.snapDistance 
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
      setLayers(prev => prev.filter(l => l.id !== layerId).concat({ ...dbLayer, fields: layer.fields, geometryType: layer.geometryType }));
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
    <>
      <div className="bg-[#1a1c1e] text-gray-200 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300">
        {/* Sidebar Header */}
        <div 
          className="bg-[#25282c] px-4 py-3.5 border-b border-white/10 flex items-center justify-between cursor-pointer hover:bg-[#2a2d31] transition-colors"
          onClick={() => setIsMainExpanded(!isMainExpanded)}
        >
           <div className="flex items-center gap-2.5">
             <div className="p-1.5 bg-orange-500/20 rounded-lg">
               <Database className="w-4 h-4 text-orange-500" />
             </div>
             <h2 className="text-[11px] font-black uppercase tracking-[0.1em] text-white">New Layer</h2>
           </div>
           <div className="flex items-center gap-2">
             <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${isMainExpanded ? 'rotate-90 text-orange-500' : ''}`} />
             <Settings 
               className={`w-3.5 h-3.5 transition-colors ${showSettings ? 'text-orange-500 rotate-90' : 'text-gray-500 hover:text-white'}`} 
               onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); if(!isMainExpanded) setIsMainExpanded(true); }}
             />
           </div>
        </div>

        {isMainExpanded && (
          <div className="p-5 flex flex-col gap-6 overflow-y-auto max-h-[75vh] scrollbar-thin scrollbar-thumb-white/10 animate-in slide-in-from-top-4 duration-300">
            
            {/* Global Digitize Settings */}
            {showSettings && (
              <div className="bg-[#25282c] p-4 rounded-xl border border-orange-500/20 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <Settings className="w-3 h-3 text-orange-500" />
                    <span className="text-[10px] font-black uppercase text-white tracking-widest">Digitizing Options</span>
                  </div>
                  <X className="w-3 h-3 text-gray-600 cursor-pointer hover:text-white" onClick={() => setShowSettings(false)} />
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between group">
                     <span className="text-[9px] text-gray-400 group-hover:text-gray-200 transition-colors">Snapping Mode</span>
                     <button 
                       onClick={() => setDigitizeSettings({...digitizeSettings, snapping: !digitizeSettings.snapping})}
                       className={`w-8 h-4 rounded-full relative transition-colors ${digitizeSettings.snapping ? 'bg-orange-500' : 'bg-gray-700'}`}
                     >
                       <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${digitizeSettings.snapping ? 'left-[18px]' : 'left-0.5'}`}></div>
                     </button>
                  </div>

                  <div className="flex items-center justify-between group">
                     <span className="text-[9px] text-gray-400 group-hover:text-gray-200 transition-colors">Live Area Display</span>
                     <button 
                       onClick={() => setDigitizeSettings({...digitizeSettings, showLiveArea: !digitizeSettings.showLiveArea})}
                       className={`w-8 h-4 rounded-full relative transition-colors ${digitizeSettings.showLiveArea ? 'bg-orange-500' : 'bg-gray-700'}`}
                     >
                       <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${digitizeSettings.showLiveArea ? 'left-[18px]' : 'left-0.5'}`}></div>
                     </button>
                  </div>

                  <div className="space-y-1.5 pt-1">
                     <div className="flex justify-between text-[8px] text-gray-500 uppercase tracking-widest font-bold">
                       <span>Snap Tolerance</span>
                       <span className="text-orange-500">{digitizeSettings.snapDistance}px</span>
                     </div>
                     <input 
                       type="range" min="5" max="50" step="5"
                       value={digitizeSettings.snapDistance}
                       onChange={(e) => setDigitizeSettings({...digitizeSettings, snapDistance: parseInt(e.target.value)})}
                       className="w-full accent-orange-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                     />
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => { localStorage.clear(); window.location.reload(); }}
                    className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[8px] font-black uppercase tracking-widest border border-red-500/20 rounded-lg transition-all"
                  >
                    Clear Local Cache & Reset
                  </button>
                </div>
              </div>
            )}
            
            {/* Create Layer Section */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] ml-1">New Dataset</label>
              
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
                <button onClick={createEmptyLayer} className="bg-orange-500 text-white p-2.5 rounded-xl hover:bg-orange-600 transition-all shadow-lg active:scale-95">
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
                                type="text" placeholder="Add Column..."
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
                                <span className="text-[9px] text-gray-400 font-medium cursor-text focus:outline-none focus:text-orange-400 min-w-[20px]" contentEditable suppressContentEditableWarning onBlur={(e) => renameField(layer.id!, field, e.currentTarget.textContent || "")} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}>{field}</span>
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
          </div>
        )}
      </div>

      {/* Floating Draggable Attribute Inspector */}
      {activeEditFeature && (
        <Draggable handle=".inspector-handle" bounds="body" nodeRef={nodeRef}>
          <div ref={nodeRef} className="fixed top-24 left-[380px] z-[9999] w-[350px] bg-[#1a1c1e] text-gray-200 border border-orange-500/40 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            {/* Window Header / Drag Handle */}
            <div className="inspector-handle bg-[#25282c] px-4 py-3.5 flex items-center justify-between border-b border-white/10 cursor-grab active:cursor-grabbing">
              <div className="flex items-center gap-2.5">
                <GripVertical className="w-3.5 h-3.5 text-gray-600" />
                <div className="p-1 bg-orange-500/20 rounded">
                  <Pencil className="w-3 h-3 text-orange-500" />
                </div>
                <span className="text-[10px] font-black uppercase text-white tracking-[0.2em]">Attribute Inspector</span>
              </div>
              <button onClick={() => setActiveEditFeature(null)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-4 h-4 text-gray-500 hover:text-white" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
               <div className="flex flex-col gap-1.5 bg-white/5 p-3 rounded-xl border border-white/5">
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Active Target</span>
                  <span className="text-[11px] text-orange-400 font-bold">{layers.find(l => l.id === activeEditFeature.layerId)?.name}</span>
               </div>

               <div className="space-y-5 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                 {(() => {
                   const layer = layers.find(l => l.id === activeEditFeature.layerId);
                   const props = activeEditFeature.properties || {};
                   const fieldsToShow = (layer?.fields && layer.fields.length > 0) 
                     ? layer.fields 
                     : Object.keys(props).filter(k => !['db_id', 'FID', 'id', 'geometry'].includes(k));

                   return fieldsToShow.map(f => (
                     <div key={f} className="space-y-2 group">
                       <div className="flex items-center justify-between px-1">
                         <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-focus-within:text-orange-500 transition-colors">{f}</label>
                         <span className="text-[8px] text-gray-700 font-mono italic">String/Number</span>
                       </div>
                       <textarea 
                         rows={1}
                         defaultValue={props[f] || ""}
                         placeholder={`Value for ${f}...`}
                         className="w-full bg-[#2a2d31] border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 transition-all resize-none shadow-inner"
                         onBlur={(e) => {
                           const newProps = { ...activeEditFeature.properties, [f]: e.target.value };
                           setActiveEditFeature({ ...activeEditFeature, properties: newProps });
                         }}
                       />
                     </div>
                   ));
                 })()}
               </div>

               <button 
                 onClick={() => handleSaveAttributes(activeEditFeature.properties)}
                 className="w-full bg-orange-500 text-white py-4 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 active:scale-[0.98] flex items-center justify-center gap-2 group"
               >
                 <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                 Simpan Perubahan
               </button>
            </div>
            
            <div className="bg-[#1e2023] px-4 py-2 border-t border-white/5 flex justify-center">
               <span className="text-[8px] text-gray-600 font-medium">SAKAGIS Pro Inspector • Floating Mode</span>
            </div>
          </div>
        </Draggable>
      )}
    </>
  );
}
