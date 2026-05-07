"use client";

import { useState, useEffect } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { Database, Loader2, Trash2, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

/**
 * Spatial Join & Relationship Analysis
 * Connects two layers spatially (e.g., Point in Polygon)
 */
export function SpatialJoinButton() {
  const {
    layers,
    layerGeojsonCache,
    spatialJoinResult,
    setSpatialJoinResult,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [targetLayerId, setTargetLayerId] = useState("");
  const [sourceLayerId, setSourceLayerId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  
  // Stats options
  const [joinType, setJoinType] = useState<'count' | 'sum' | 'avg'>('count');
  const [numericField, setNumericField] = useState("");
  const [availableFields, setAvailableFields] = useState<string[]>([]);

  // Load fields for source layer when it changes
  useEffect(() => {
    async function loadFields() {
      if (!sourceLayerId) return;
      const { data } = await supabase.from('geometries').select('properties').eq('layer_id', sourceLayerId).limit(1).single();
      if (data && data.properties) {
        const keys = Object.keys(data.properties).filter(k => typeof data.properties[k] === 'number');
        setAvailableFields(keys);
      }
    }
    if (joinType !== 'count') loadFields();
  }, [sourceLayerId, joinType]);

  const availableLayers = layers.filter((l) => l.id && layerGeojsonCache[l.id]);

  const runSpatialJoin = async () => {
    if (!targetLayerId || !sourceLayerId) {
      toast.error("Pilih layer target dan layer sumber!");
      return;
    }

    const geojsonTarget = layerGeojsonCache[targetLayerId];
    const geojsonSource = layerGeojsonCache[sourceLayerId];

    if (!geojsonTarget || !geojsonSource) {
      toast.error("Data geometri belum siap.");
      return;
    }

    setIsProcessing(true);
    setProgress("Menganalisis hubungan spasial...");

    setTimeout(() => {
      try {
        const targetFeatures = geojsonTarget.features || [];
        const sourceFeatures = geojsonSource.features || [];

        const joinedFeatures = targetFeatures.map((targetFeat: any) => {
          if (!targetFeat.geometry) return targetFeat;

          // Find features from source that are inside this target feature
          const internalFeatures = sourceFeatures.filter((sourceFeat: any) => {
            if (!sourceFeat.geometry) return false;
            
            // If target is Polygon, we check if source (Point/Poly) is inside/intersects
            try {
              if (sourceFeat.geometry.type === 'Point') {
                 return turf.booleanPointInPolygon(sourceFeat, targetFeat);
              } else {
                 return !turf.booleanDisjoint(targetFeat, sourceFeat);
              }
            } catch (e) {
              return false;
            }
          });

          // Calculate metrics
          const count = internalFeatures.length;
          let resultValue = count;

          if (joinType === 'sum' && numericField) {
            resultValue = internalFeatures.reduce((acc, f) => acc + (Number(f.properties?.[numericField]) || 0), 0);
          } else if (joinType === 'avg' && numericField) {
            const sum = internalFeatures.reduce((acc, f) => acc + (Number(f.properties?.[numericField]) || 0), 0);
            resultValue = count > 0 ? sum / count : 0;
          }

          const propKey = joinType === 'count' ? 'join_count' : `join_${joinType}_${numericField}`;
          
          return {
            ...targetFeat,
            properties: {
              ...targetFeat.properties,
              [propKey]: resultValue,
              join_details: `${count} objek terdeteksi`
            }
          };
        });

        const resultFC = turf.featureCollection(joinedFeatures);
        const targetLayerName = layers.find(l => l.id === targetLayerId)?.name || "Target";
        const sourceLayerName = layers.find(l => l.id === sourceLayerId)?.name || "Source";

        setSpatialJoinResult({
          geojson: resultFC,
          targetLayerName,
          sourceLayerName,
          joinType,
          featureCount: joinedFeatures.length
        });

        toast.success(`Analisis selesai! ${joinedFeatures.length} bidang telah dihubungkan.`);
        setIsProcessing(false);
        setProgress("");
      } catch (e: any) {
        console.error("Spatial Join Error:", e);
        toast.error("Gagal menjalankan analisis: " + e.message);
        setIsProcessing(false);
        setProgress("");
      }
    }, 100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all outline-none ${
          availableLayers.length < 2
            ? "border-border/40 text-muted-foreground/30 cursor-not-allowed"
            : spatialJoinResult
              ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 shadow-sm shadow-indigo-500/10"
              : "border-border text-muted-foreground hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400"
        }`}
        disabled={availableLayers.length < 2}
        title="Spatial Join & Relationship"
      >
        <GitMerge className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-indigo-400" />
            Spatial Join
          </DialogTitle>
          <DialogDescription>
            Menghitung hubungan antara dua layer. Contoh: Menghitung jumlah pohon (titik) di dalam persil (poligon).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer Target (Poligon)</label>
            <select
              value={targetLayerId}
              onChange={(e) => setTargetLayerId(e.target.value)}
              className="w-full text-sm p-2.5 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="">— Pilih Layer Target —</option>
              {availableLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer Sumber (Titik/Poligon)</label>
            <select
              value={sourceLayerId}
              onChange={(e) => setSourceLayerId(e.target.value)}
              className="w-full text-sm p-2.5 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="">— Pilih Layer Sumber —</option>
              {availableLayers.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-4 mt-2">
            <div className="flex flex-col gap-2">
               <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Jenis Hitungan</label>
               <select
                 value={joinType}
                 onChange={(e: any) => setJoinType(e.target.value)}
                 className="w-full text-xs p-2 rounded-md bg-background border border-border text-foreground"
               >
                 <option value="count">Jumlah (Count)</option>
                 <option value="sum">Total (Sum)</option>
                 <option value="avg">Rata-rata (Avg)</option>
               </select>
            </div>
            {joinType !== 'count' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kolom Angka</label>
                <select
                  value={numericField}
                  onChange={(e) => setNumericField(e.target.value)}
                  className="w-full text-xs p-2 rounded-md bg-background border border-border text-foreground"
                >
                  <option value="">— Pilih Kolom —</option>
                  {availableFields.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}
          </div>

          {progress && (
            <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-900/20 border border-indigo-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {spatialJoinResult && (
            <div className="flex flex-col gap-2 bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  ✅ Hasil Spatial Join
                </span>
                <button
                  onClick={() => { setSpatialJoinResult(null); toast.info("Hasil analisis dihapus."); }}
                  className="p-1 hover:bg-indigo-500/20 rounded text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[11px] text-indigo-200/70">
                Data dari <span className="text-white font-bold">{spatialJoinResult.sourceLayerName}</span> telah disatukan ke <span className="text-white font-bold">{spatialJoinResult.targetLayerName}</span>.
              </div>
              <p className="text-[10px] text-muted-foreground italic">Klik bidang poligon di peta untuk melihat hasil hitungan baru di popup.</p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>Tutup</Button>
          <Button
            onClick={runSpatialJoin}
            disabled={isProcessing || !targetLayerId || !sourceLayerId}
            className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memproses...</span>
            ) : (
              <span className="flex items-center"><GitMerge className="w-4 h-4 mr-2" /> Jalankan Join</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
