"use client";

import { useState, useEffect } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle, FileUp, Trash2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { parseSpatialFile } from "@/lib/spatialEngine";
import { getOrCreateDefaultProject, uploadLayerToSupabase, fetchActiveLayers, deleteLayerFromSupabase, updateLayerStyleInSupabase, updateLayerOrderInSupabase } from "@/lib/database";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useMapContext } from "@/lib/MapContext";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PROJECTIONS, reprojectCoords } from "./ExportLayerDialog";
import { cn } from "@/lib/utils";
import { OverlapAnalysisButton } from "./OverlapAnalysisPanel";
import { ClipAnalysisButton } from "./ClipAnalysisPanel";

export function UploadDatasetPanel() {
  const { layers, setLayers, setZoomFeature, areaUnit, setAreaUnit } = useMapContext();
  const [isUploading, setIsUploading] = useState(false);

  const [metricPayload, setMetricPayload] = useState<{ file: File, geojson: any } | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedProjection, setSelectedProjection] = useState("");
  const [customEpsg, setCustomEpsg] = useState("");
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    fetchActiveLayers()
      .then((data) => {
        if (data) setLayers(data);
      })
      .catch((err) => console.error("Gagal load layers awal:", err));
  }, [setLayers]);

  const handleDeleteLayer = async (id: string, name: string) => {
    try {
      if (!id) return;
      await deleteLayerFromSupabase(id);
      setLayers(layers.filter(l => l.id !== id));
      toast.success(`Layer ${name} berhasil dihapus.`);
    } catch (err: any) {
      toast.error(`Gagal menghapus layer: ${err.message}`);
    }
  };

  const executeUpload = async (file: File, geojsonData: any) => {
    toast.info(`Mulai mengunggah ${file.name} ke Supabase...`);
    const project = await getOrCreateDefaultProject();
    const newLayer = await uploadLayerToSupabase(project.id, file.name, geojsonData);
    setLayers((prev) => [...prev, newLayer]);
    setZoomFeature(geojsonData);
    toast.success(`Layer ${file.name} sukses tersimpan di Supabase!`);
  };

  const [isDragging, setIsDragging] = useState(false);

  const processSelectedFile = async (file: File) => {
    setIsUploading(true);
    toast.info(`Memproses file ${file.name} di The Satpam...`);
    try {
      const geojsonData = await parseSpatialFile(file);
      if (!geojsonData) throw new Error("File kosong atau tidak terbaca.");
      await executeUpload(file, geojsonData);
    } catch (error: any) {
      if (error.isMetric && error.geojsonData) {
        toast.warning("Terdeteksi Sistem Proyeksi Metrik!");
        setMetricPayload({ file, geojson: error.geojsonData });
      } else {
        toast.error(`Gagal memuat ${file.name}: ${error.message}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await processSelectedFile(file);
    if (event.target) event.target.value = "";
  };

  return (
    <div className="bg-card text-card-foreground border shadow-sm rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Layer</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted/50 rounded-md p-0.5 gap-0.5">
            {(['Ha', 'm2', 'km2'] as const).map((unit) => (
              <button
                key={unit}
                onClick={() => setAreaUnit(unit)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                  areaUnit === unit
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {unit === 'Ha' ? 'Ha' : unit === 'm2' ? 'm²' : 'km²'}
              </button>
            ))}
          </div>
          <Badge variant="secondary">{layers.length} Layer</Badge>
        </div>
      </div>

      <ScrollArea className="h-32 rounded-md border border-white/10 bg-black/20 p-2">
        {layers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground flex-col gap-2 opacity-50 pt-4">
            <LayersIcon />
            <span>Belum ada layer diunggah</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {layers.map((layer, index) => (
              <LayerControlItem 
                key={layer.id || index} 
                layer={layer} 
                onDelete={() => handleDeleteLayer(layer.id!, layer.name)} 
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <label 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !isUploading) processSelectedFile(file);
        }}
        className={cn(
          "relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm font-medium transition-colors",
          isDragging 
            ? "border-primary bg-primary/20 text-primary scale-[1.02] shadow-primary/20 shadow-lg" 
            : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
        )}
      >
        {isUploading ? (
          <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
        ) : (
          <FileUp className="w-4 h-4" />
        )}
        <span>{isUploading ? "Memproses..." : (isDragging ? "Lepaskan File Disini!" : "Unggah File (SHP/RAR/KML/GeoJSON)")}</span>
        <input
          type="file"
          className="hidden"
          accept=".zip,.rar,.kml,.kmz,.geojson,.json"
          onChange={handleFileUpload}
          disabled={isUploading}
        />
      </label>

      {/* Toolbar Analisis */}
      <div className="flex items-center gap-2">
        <OverlapAnalysisButton />
        <ClipAnalysisButton />
        <LayoutPetaButton />
      </div>

      {/* DIALOG KONFIRMASI ADAPTIF REPROJECTION */}
      <Dialog open={!!metricPayload} onOpenChange={(open) => !open && !isFixing && setMetricPayload(null)}>
        <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Sistem Proyeksi Metrik Terdeteksi!
            </DialogTitle>
            <DialogDescription>
              File <b className="text-foreground">{metricPayload?.file.name}</b> menggunakan koordinat raksasa (Meter).<br/>
              Harap konfirmasi asal-usul proyeksinya agar mesin dapat menerjemahkannya kembali ke standar Satelit WGS84.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-foreground">Asal Sistem Proyeksi Koordinat</label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger
                  aria-expanded={popoverOpen}
                  className="w-full flex justify-between items-center text-sm font-normal text-left truncate overflow-hidden h-10 px-3 py-2 rounded-md bg-background border border-border text-foreground hover:bg-accent hover:text-accent-foreground outline-none focus:ring-2 focus:ring-primary shadow-sm"
                >
                  <span className="truncate">{PROJECTIONS.flatMap(g => g.items).find(i => i.value === selectedProjection)?.label || "Pilih Proyeksi Asal..."}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Cari Proyeksi Asal... (Misal: 3857 atau Jabar)" />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>EPSG Code Kosong.</CommandEmpty>
                      {PROJECTIONS.map((group) => (
                        <CommandGroup key={group.group} heading={group.group}>
                          {group.items.map((item) => (
                            <CommandItem
                              key={item.value}
                              value={item.label}
                              onSelect={() => {
                                setSelectedProjection(item.value);
                                setPopoverOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check className={cn("mr-2 h-4 w-4", selectedProjection === item.value ? "opacity-100" : "opacity-0")} />
                              {item.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedProjection === "custom" && (
              <div className="flex flex-col gap-2 mt-2 p-3 bg-muted/50 border rounded-md">
                <label className="text-xs font-semibold text-muted-foreground">Ketik Kode EPSG Custom</label>
                <Input 
                  value={customEpsg} 
                  onChange={(e) => setCustomEpsg(e.target.value)}
                  placeholder="Contoh: 32648"
                  className="bg-background"
                  autoFocus
                />
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4 flex gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setMetricPayload(null)} disabled={isFixing}>
              Batalkan
            </Button>
            <Button 
              onClick={async () => {
                const activeEpsg = selectedProjection === "custom" ? customEpsg : selectedProjection;
                if (!activeEpsg || !metricPayload) return;
                setIsFixing(true);
                try {
                  const code = activeEpsg.trim().replace(/^EPSG:/i, ''); 
                  const projRes = await fetch(`https://epsg.io/${code}.proj4`);
                  if (!projRes.ok) throw new Error(`Sistem Proyeksi (EPSG:${code}) tidak ditemukan.`);
                  const sourceProjConfig = await projRes.text();

                  toast.info(`Kalkulasi pemurnian dari EPSG:${code} ke WGS84...`);
                  
                  const geojson = metricPayload.geojson;
                  const reprojectedFeatures = geojson.features.map((feat: any) => {
                    if (!feat.geometry || !feat.geometry.coordinates) return feat;
                    try {
                      return {
                        ...feat,
                        geometry: { ...feat.geometry, coordinates: reprojectCoords(feat.geometry.coordinates, sourceProjConfig, "EPSG:4326") }
                      };
                    } catch (e) {
                      return feat;
                    }
                  });
                  
                  const fixedGeojson = { ...geojson, features: reprojectedFeatures };
                  setMetricPayload(null);
                  await executeUpload(metricPayload.file, fixedGeojson);
                } catch (error: any) {
                  toast.error(`Gagal Reverse-Reproject: ${error.message}`);
                } finally {
                  setIsFixing(false);
                }
              }} 
              disabled={isFixing || (!(selectedProjection === "custom" ? customEpsg : selectedProjection))} 
              className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px]"
            >
              {isFixing ? <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menghitung...</span> : <span className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2" /> Perbaiki & Unggah</span>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LayersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
  );
}

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { ArrowUp, ArrowDown, Palette, Info } from "lucide-react";
import { ExportLayerDialog } from "./ExportLayerDialog";

function LayerControlItem({ layer, onDelete }: { layer: any, onDelete: () => void }) {
  const { updateLayerStyle, reorderLayer, layers, layerAreas, areaUnit, triggerZoomToLayer } = useMapContext();
  const style = layer.style || { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2, dissolve_key: 'none' };
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);

  useEffect(() => {
    async function loadKeys() {
      if (!layer.id) return;
      const { data } = await supabase.from('geometries').select('properties').eq('layer_id', layer.id).limit(1).single();
      if (data && data.properties) {
        const keys = Object.keys(data.properties).filter(k => k !== 'FID' && k !== 'db_id');
        setAvailableKeys(keys);

        if (keys.length > 0 && layer.style?.dissolve_key === undefined) {
           const newStyle = { ...style, dissolve_key: 'none' };
           updateLayerStyle(layer.id, newStyle);
           updateLayerStyleInSupabase(layer.id, newStyle);
        }
      }
    }
    loadKeys();
  }, [layer.id, layer.style?.dissolve_key]);

  const handleColorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    const newStyle = { ...style, color: newColor, fillColor: newColor };
    updateLayerStyle(layer.id, newStyle);
    if (layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
  };

  const handleOpacityChange = async (val: number[]) => {
    const newStyle = { ...style, fillOpacity: val[0] / 100 };
    updateLayerStyle(layer.id, newStyle);
    if (layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
  };

  const handleDissolveChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStyle = { ...style, dissolve_key: e.target.value };
    updateLayerStyle(layer.id, newStyle);
    if (layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
    // Refresh layer visually by triggering a re-render/re-fetch internally via MapArea dependency later
  };

  const syncOrder = async () => {
    // Free tier debounce not fully needed for occasional clicks
    const updates = layers.map((l, idx) => ({ id: l.id!, sort_order: idx }));
    await updateLayerOrderInSupabase(updates);
  };

  const metrics = layer.id ? layerAreas[layer.id] : undefined;

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  return (
    <div 
      className="flex items-start gap-2 text-sm bg-card p-2 rounded-md border shadow-xs group cursor-pointer hover:border-primary/50 transition-colors relative"
      onDoubleClick={() => {
        if (layer.id) triggerZoomToLayer(layer.id);
      }}
      title="Double klik untuk Zoom (Extend) ke layer ini"
    >
      <div 
        className="w-3 h-3 rounded-full shrink-0 border mt-1" 
        style={{ backgroundColor: style.fillColor, opacity: Math.max(0.2, Number(style.fillOpacity) || 0.2) }} 
      />
      <span className="flex-1 font-medium break-all whitespace-normal text-xs leading-relaxed">{layer.name}</span>
      
      <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 bg-card/90 backdrop-blur pl-2 rounded-l-md shadow-[0_0_10px_theme(colors.card)]">
        <button onClick={async (e) => { e.stopPropagation(); reorderLayer(layer.id, "up"); setTimeout(syncOrder, 100); }} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={async (e) => { e.stopPropagation(); reorderLayer(layer.id, "down"); setTimeout(syncOrder, 100); }} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        
        <Popover>
          <PopoverTrigger className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground outline-none">
            <Info className="w-3.5 h-3.5" />
          </PopoverTrigger>
          <PopoverContent className="w-72 p-4 flex flex-col gap-3 bg-popover text-popover-foreground border shadow-lg z-50 rounded-lg">
            <h4 className="font-semibold text-sm border-b pb-2">Informasi Layer</h4>
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between items-start gap-2">
                <span className="text-muted-foreground shrink-0">Nama File:</span>
                <span className="font-mono text-right break-all">{layer.name}</span>
              </div>

              <div className="flex flex-col gap-1 pt-2 border-t border-border mt-1">
                 <span className="text-[10px] uppercase font-bold text-muted-foreground/80 mb-1 tracking-wider">Perbandingan Luas Area</span>
                 <div className="flex justify-between items-center gap-2">
                   <span className="text-muted-foreground shrink-0">WGS 84 (Sferis)</span>
                   <span className="font-mono font-bold text-primary text-right">{metrics ? formatUnit(metrics.wgs84_sqm) : "Menghitung..."}</span>
                 </div>
                 {metrics && (
                   <>
                     <div className="flex justify-between items-center gap-2">
                       <span className="text-muted-foreground shrink-0" title={`UTM Planar Zone: EPSG ${metrics.utm_epsg}`}>UTM ({metrics.utm_epsg})</span>
                       <span className="font-mono text-right font-medium">{metrics.utm_sqm ? formatUnit(metrics.utm_sqm) : "N/A"}</span>
                     </div>
                     {metrics.tm3_epsg && (
                       <div className="flex justify-between items-center gap-2">
                         <span className="text-muted-foreground shrink-0" title={`TM-3 Cartesian Zone: EPSG ${metrics.tm3_epsg}`}>BPN TM-3 ({metrics.tm3_epsg})</span>
                         <span className="font-mono text-right font-medium">{metrics.tm3_sqm ? formatUnit(metrics.tm3_sqm) : "N/A"}</span>
                       </div>
                     )}
                   </>
                 )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipe Data:</span>
                <span className="font-medium text-primary">{layer.geometry_type || 'Custom Vektor'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Proyeksi (CRS):</span>
                <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground">EPSG:4326 (WGS 84)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Waktu Unggah:</span>
                <span className="text-right">{new Date(layer.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            
            <div className="pt-2 border-t flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Kolom Atribut ({availableKeys.length}):</span>
              <div className="flex flex-wrap gap-1">
                {availableKeys.length > 0 ? availableKeys.map(k => (
                  <Badge key={k} variant="secondary" className="text-[9px] px-1.5 py-0 font-mono tracking-tight">{k}</Badge>
                )) : <span className="text-[10px] italic text-muted-foreground">Tidak memiliki atribut.</span>}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        <Popover>
          <PopoverTrigger className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground outline-none">
            <Palette className="w-3.5 h-3.5" />
          </PopoverTrigger>
          <PopoverContent className="w-56 p-4 flex flex-col gap-4 bg-popover text-popover-foreground border shadow-lg z-50">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold">Warna Layer</label>
              <div className="flex items-center gap-2">
                <input 
                  type="color" 
                  value={style.color} 
                  onChange={handleColorChange} 
                  className="w-8 h-8 rounded shrink-0 cursor-pointer p-0 border-0 bg-transparent"
                />
                <span className="text-xs text-muted-foreground uppercase font-mono">{style.color}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold">Transparansi ({Math.round(style.fillOpacity * 100)}%)</label>
              <Slider 
                value={[Number(style.fillOpacity) * 100 || 20]} 
                max={100} 
                step={5}
                onValueChange={(val: any) => {
                  const numVal = Array.isArray(val) ? val[0] : val;
                  updateLayerStyle(layer.id, { ...style, fillOpacity: (numVal || 0) / 100 });
                }}
                onPointerUp={() => handleOpacityChange([style.fillOpacity * 100])}
                onTouchEnd={() => handleOpacityChange([style.fillOpacity * 100])}
              />
            </div>
            {availableKeys.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <label className="text-xs font-semibold">Gabungkan Berdasarkan (Dissolve)</label>
                <select 
                  value={style.dissolve_key || 'none'} 
                  onChange={handleDissolveChange}
                  className="w-full text-xs p-2 rounded bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="none">-- Tampilkan Normal (Patahan) --</option>
                  {availableKeys.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <span className="text-[10px] text-muted-foreground leading-tight">Menyatukan seluruh patahan kotak map ke dalam bentuk 1 wilayah jika atributnya bernilai sama.</span>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <ExportLayerDialog layer={layer} />

        <button onClick={onDelete} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

import { LayoutGrid } from "lucide-react";

function LayoutPetaButton() {
  const { setLayoutComposerOpen } = useMapContext();
  return (
    <button
      onClick={() => setLayoutComposerOpen(true)}
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-colors"
    >
      <LayoutGrid className="w-3.5 h-3.5" />
      Layout Peta
    </button>
  );
}

