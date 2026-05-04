"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import { Plus, MousePointer2, Trash2, Pencil, X, CloudUpload, Loader2 } from "lucide-react";
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
  // Default fields for any new layer
  const [fields] = useState<string[]>(["Nama", "Keterangan", "Kategori"]);

  const createEmptyLayer = () => {
    if (!newLayerName) {
      toast.error("Nama layer tidak boleh kosong");
      return;
    }
    const id = `local-${Date.now()}`;
    const newLayer = {
      id,
      name: newLayerName,
      style: { color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.2, weight: 2 },
    };
    
    setLayers(prev => [newLayer, ...prev]);
    cacheLayerGeojson(id, { type: "FeatureCollection", features: [] });
    setNewLayerName("");
    toast.success(`Layer ${newLayerName} berhasil dibuat!`);
  };

  const toggleDigitize = (layerId: string) => {
    if (activeDigitizingLayerId === layerId) {
      setActiveDigitizingLayerId(null);
      map?.pm.disableDraw();
      toast.info("Mode digitasi dinonaktifkan");
    } else {
      setActiveDigitizingLayerId(layerId);
      map?.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 20,
      });
      toast.success(`Mode digitasi Poligon aktif untuk ${layers.find(l => l.id === layerId)?.name}`);
    }
  };

  const publishLayer = async (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    const fc = layerGeojsonCache[layerId];
    if (!layer || !fc || fc.features.length === 0) {
      toast.error("Tidak ada data untuk disimpan ke database");
      return;
    }

    try {
      setIsPublishing(layerId);
      toast.loading("Menyimpan layer ke Supabase...", { id: "publish" });
      const project = await getOrCreateDefaultProject();
      const dbLayer = await uploadLayerToSupabase(project.id, layer.name, fc);
      
      // Update layers: remove local, add the real one from DB
      setLayers(prev => prev.filter(l => l.id !== layerId).concat(dbLayer));
      setActiveDigitizingLayerId(null);
      
      toast.success("Layer berhasil disimpan secara permanen di Supabase!", { id: "publish" });
    } catch (err: any) {
      toast.error("Gagal menyimpan: " + err.message, { id: "publish" });
    } finally {
      setIsPublishing(null);
    }
  };

  const handleSaveAttributes = async (updatedProps: any) => {
    if (!activeEditFeature) return;
    const { layerId, featureIndex } = activeEditFeature;

    // Sinkron ke Supabase jika ini adalah fitur dari database
    const db_id = updatedProps.db_id;
    if (db_id) {
      try {
        toast.loading("Menyinkronkan ke Supabase...", { id: "attr" });
        await updateFeaturePropertiesInSupabase(db_id, updatedProps);
        toast.success("Data berhasil tersimpan di database!", { id: "attr" });
      } catch (err: any) {
        toast.error("Gagal sinkron database: " + err.message, { id: "attr" });
        return; // Jangan update lokal jika gagal ke server
      }
    }

    const fc = { ...layerGeojsonCache[layerId] };
    if (fc && fc.features[featureIndex]) {
      fc.features[featureIndex].properties = updatedProps;
      cacheLayerGeojson(layerId, fc);
      setLayers(prev => [...prev]);
      setActiveEditFeature(null);
      if (!db_id) toast.success("Atribut diperbarui (Lokal)");
    }
  };

  const localLayers = layers.filter(l => l.id?.startsWith('local-'));

  return (
    <div className="bg-card text-card-foreground border rounded-xl p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b pb-3">
        <Pencil className="w-4 h-4 text-primary" />
        <h2 className="font-bold text-sm tracking-tight">Digitasi & Atribut</h2>
      </div>

      {/* Create Layer Form */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Buat Layer Baru</label>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Nama layer (misal: Persil)..."
            className="flex-1 bg-muted border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            value={newLayerName}
            onChange={(e) => setNewLayerName(e.target.value)}
          />
          <button 
            onClick={createEmptyLayer}
            className="bg-primary text-primary-foreground p-1.5 rounded-md hover:opacity-90 transition-opacity"
            title="Tambah Layer Kosong"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Layer List for Digitizing */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Daftar Layer Digitasi</label>
        {localLayers.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic bg-muted/30 p-3 rounded-md border border-dashed text-center">Belum ada layer lokal. Buat satu di atas.</p>
        )}
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
          {localLayers.map(layer => (
            <div key={layer.id} className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${activeDigitizingLayerId === layer.id ? 'bg-primary/10 border-primary shadow-sm' : 'bg-muted/50 border-transparent hover:border-muted-foreground/20'}`}>
              <div className="flex flex-col">
                <span className="font-semibold text-xs truncate max-w-[130px]">{layer.name}</span>
                <span className="text-[9px] text-muted-foreground uppercase">{layerGeojsonCache[layer.id!]?.features?.length || 0} fitur</span>
              </div>
              <div className="flex gap-1.5">
                <button 
                  onClick={() => publishLayer(layer.id!)}
                  disabled={isPublishing === layer.id}
                  className="p-2 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 shadow-sm transition-all"
                  title="Simpan Permanen ke Supabase"
                >
                  {isPublishing === layer.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                </button>
                <button 
                  onClick={() => toggleDigitize(layer.id!)}
                  className={`p-2 rounded-md transition-all ${activeDigitizingLayerId === layer.id ? 'bg-primary text-primary-foreground shadow-md' : 'bg-background hover:bg-muted text-muted-foreground border shadow-sm'}`}
                  title="Mulai Gambar Poligon"
                >
                  <MousePointer2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Attribute Editor Form */}
      {activeEditFeature && (
        <div className="mt-2 p-4 bg-primary/5 rounded-xl border border-primary/30 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-primary rounded-full"></div>
              <span className="text-[10px] font-black uppercase text-primary tracking-widest">Edit Atribut</span>
            </div>
            <button 
              onClick={() => setActiveEditFeature(null)}
              className="p-1 hover:bg-red-100 hover:text-red-500 rounded-full transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {fields.map(f => (
              <div key={f} className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider ml-1">{f}</label>
                <input 
                  type="text"
                  defaultValue={activeEditFeature.properties[f] || ""}
                  className="bg-background border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none shadow-sm"
                  onBlur={(e) => {
                    const newProps = { ...activeEditFeature.properties, [f]: e.target.value };
                    setActiveEditFeature({ ...activeEditFeature, properties: newProps });
                  }}
                />
              </div>
            ))}
            <button 
              onClick={() => handleSaveAttributes(activeEditFeature.properties)}
              className="mt-2 w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-md active:scale-95"
            >
              Simpan Perubahan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
