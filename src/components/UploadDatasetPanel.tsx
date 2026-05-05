"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { UploadCloud, CheckCircle2, AlertTriangle, FileUp, Trash2, Check, ChevronsUpDown, Loader2, DownloadCloud, Layers, Info, Palette, Filter, ArrowUp, ArrowDown } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { PROJECTIONS, reprojectCoords } from "./ExportLayerDialog";
import { cn } from "@/lib/utils";
import { OverlapAnalysisButton } from "./OverlapAnalysisPanel";
import { ClipAnalysisButton } from "./ClipAnalysisPanel";
import { MergeAnalysisButton } from "./MergeAnalysisPanel";
import { BufferAnalysisButton } from "./BufferAnalysisPanel";
import { UnionAnalysisButton } from "./UnionAnalysisPanel";
import { DissolveAnalysisButton } from "./DissolveAnalysisPanel";

const PdfOverlayPanel = dynamic(() => import("./PdfOverlayPanel").then(mod => mod.PdfOverlayPanel), { ssr: false });

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
    <div className="bg-card/70 backdrop-blur-xl text-card-foreground border border-border/50 shadow-2xl rounded-2xl overflow-hidden flex flex-col transition-all duration-300">
      <div className="bg-cyan-pastel/80 dark:bg-[#25282c]/80 p-4 border-b border-border/50 flex flex-col gap-4">
        {/* Row 1: Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/40 dark:bg-orange-500/20 rounded-xl shadow-sm border border-white/30">
            <UploadCloud className="w-4.5 h-4.5 text-navy dark:text-orange-500" />
          </div>
          <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-navy dark:text-white leading-none">Dataset & Analisis</h3>
        </div>

        {/* Row 2: Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex items-center bg-black/10 dark:bg-black/40 rounded-xl p-1 border border-black/5 dark:border-white/5 shadow-inner grow max-w-[200px] overflow-hidden">
            {/* Animated Background Pill */}
            <div 
              className="absolute h-[calc(100%-8px)] bg-white dark:bg-orange-500/80 shadow-lg shadow-black/5 dark:shadow-orange-500/20 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{ 
                width: 'calc(33.33% - 5.33px)',
                left: '4px',
                transform: `translateX(${areaUnit === 'Ha' ? '0%' : areaUnit === 'm2' ? '108%' : '216%'})`
              }}
            />

            {(['Ha', 'm2', 'km2'] as const).map((unit) => (
              <button
                key={unit}
                onClick={(e) => {
                  e.stopPropagation();
                  setAreaUnit(unit);
                }}
                className={`flex-1 relative z-10 px-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-colors duration-300 active:scale-95 ${
                  areaUnit === unit
                    ? 'text-navy dark:text-white'
                    : 'text-navy/30 dark:text-white/30 hover:text-navy/60 dark:hover:text-white/60'
                }`}
              >
                {unit === 'Ha' ? 'Ha' : unit === 'm2' ? 'm²' : 'km²'}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-1.5 bg-white/30 dark:bg-white/5 px-3 py-2 rounded-xl border border-white/30 dark:border-white/10 shadow-sm shrink-0">
             <span className="text-[11px] font-black text-navy dark:text-white/80">{layers.length}</span>
             <span className="text-[8px] font-black text-navy/40 dark:text-white/30 tracking-widest uppercase">Layer</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">

      <ScrollArea className="h-40 rounded-xl border border-border bg-muted/30 dark:bg-black/20 p-2">
        {layers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground flex-col gap-2 opacity-50 pt-8">
            <Layers className="w-8 h-8" />
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

      {/* PDF Map Overlay (Avenza Style) */}
      <PdfOverlayPanel />

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
          "relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-[11px] font-black uppercase tracking-wider transition-all",
          isDragging 
            ? "border-cyan-500 bg-cyan-500/10 text-navy dark:text-cyan-400 scale-[1.02] shadow-lg" 
            : "border-border bg-muted/50 text-muted-foreground hover:border-cyan-500/50 hover:bg-cyan-500/5 hover:text-navy dark:hover:text-cyan-400"
        )}
      >
        {isUploading ? (
          <div className="animate-spin w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full" />
        ) : (
          <FileUp className="w-4 h-4" />
        )}
        <span>{isUploading ? "Memproses..." : (isDragging ? "Lepaskan File!" : "Unggah Data Baru (.SHP/.ZIP/.KML)")}</span>
        <input
          type="file"
          className="hidden"
          accept=".zip,.rar,.kml,.kmz,.geojson,.json,.gdb.zip"
          onChange={handleFileUpload}
          disabled={isUploading}
        />
      </label>

      {/* Toolbar Analisis */}
      <div className="bg-muted/30 dark:bg-white/5 p-3 rounded-xl border border-border flex items-center gap-2 flex-wrap">
        <BufferAnalysisButton />
        <ClipAnalysisButton />
        <OverlapAnalysisButton />
        <UnionAnalysisButton />
        <DissolveAnalysisButton />
        <MergeAnalysisButton />
        <LayoutPetaButton />
        <DownloadAllResultsButton />
      </div>

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

  // State lokal untuk form definition query
  const [defField, setDefField] = useState(layer.style?.definition_query?.field || "");
  const [defOperator, setDefOperator] = useState(layer.style?.definition_query?.operator || "=");
  const [defValue, setDefValue] = useState(layer.style?.definition_query?.value || "");

  const handleApplyDefinitionQuery = async () => {
    if (!defField || !defOperator || !defValue) return;
    const newQuery = { field: defField, operator: defOperator, value: defValue };
    const newStyle = { ...style, definition_query: newQuery };
    updateLayerStyle(layer.id, newStyle);
    if (layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
  };

  const handleClearDefinitionQuery = async () => {
    setDefField("");
    setDefOperator("=");
    setDefValue("");
    const newStyle = { ...style };
    delete newStyle.definition_query;
    updateLayerStyle(layer.id, newStyle);
    if (layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
  };

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
      className="flex flex-col gap-2 bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-border/50 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group cursor-pointer"
      onDoubleClick={() => {
        if (layer.id) triggerZoomToLayer(layer.id);
      }}
      title="Double klik untuk Zoom ke layer ini"
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10 dark:border-white/10 shadow-sm" 
          style={{ backgroundColor: style.fillColor }} 
        />
        <span className="flex-1 font-bold text-[11px] text-navy dark:text-white/90 truncate" title={layer.name}>
          {layer.name}
        </span>
        <button onClick={onDelete} className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div className="flex items-center bg-muted/30 dark:bg-black/20 rounded-lg p-0.5">
          <button onClick={async (e) => { e.stopPropagation(); reorderLayer(layer.id, "up"); setTimeout(syncOrder, 100); }} className="p-1.5 hover:bg-white dark:hover:bg-muted rounded-md text-navy/60 dark:text-muted-foreground hover:text-navy dark:hover:text-foreground transition-all">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={async (e) => { e.stopPropagation(); reorderLayer(layer.id, "down"); setTimeout(syncOrder, 100); }} className="p-1.5 hover:bg-white dark:hover:bg-muted rounded-md text-navy/60 dark:text-muted-foreground hover:text-navy dark:hover:text-foreground transition-all">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger className="p-1.5 hover:bg-muted rounded-lg text-navy/60 dark:text-muted-foreground hover:text-navy dark:hover:text-foreground transition-all outline-none">
              <Info className="w-3.5 h-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4 flex flex-col gap-3 bg-card/90 backdrop-blur-xl text-card-foreground border border-border/50 shadow-2xl z-50 rounded-xl">
              <h4 className="font-black text-[11px] uppercase tracking-widest border-b border-border/50 pb-2 text-navy dark:text-white">Informasi Layer</h4>
              <div className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-muted-foreground shrink-0">Nama File:</span>
                  <span className="font-bold text-navy dark:text-white text-right break-all">{layer.name}</span>
                </div>

                <div className="flex flex-col gap-1 pt-2 border-t border-border/50 mt-1">
                   <span className="text-[9px] uppercase font-black text-muted-foreground/60 mb-1 tracking-wider">Metrik Area</span>
                   <div className="flex justify-between items-center gap-2">
                     <span className="text-muted-foreground shrink-0">WGS 84</span>
                     <span className="font-black text-primary text-right">{metrics ? formatUnit(metrics.wgs84_sqm) : "..."}</span>
                   </div>
                   {metrics && (
                     <>
                       <div className="flex justify-between items-center gap-2">
                         <span className="text-muted-foreground shrink-0 text-[9px]">UTM ({metrics.utm_epsg})</span>
                         <span className="font-bold text-navy dark:text-white text-right">{metrics.utm_sqm ? formatUnit(metrics.utm_sqm) : "-"}</span>
                       </div>
                       {metrics.tm3_epsg && (
                         <div className="flex justify-between items-center gap-2">
                           <span className="text-muted-foreground shrink-0 text-[9px]">TM-3 ({metrics.tm3_epsg})</span>
                           <span className="font-bold text-navy dark:text-white text-right">{metrics.tm3_sqm ? formatUnit(metrics.tm3_sqm) : "-"}</span>
                         </div>
                       )}
                     </>
                   )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Popover>
            <PopoverTrigger className="p-1.5 hover:bg-muted rounded-lg text-navy/60 dark:text-muted-foreground hover:text-navy dark:hover:text-foreground transition-all outline-none">
              <Palette className="w-3.5 h-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-56 p-4 flex flex-col gap-4 bg-card/90 backdrop-blur-xl text-card-foreground border border-border/50 shadow-2xl z-50 rounded-xl">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Warna Vektor</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={style.color} 
                    onChange={handleColorChange} 
                    className="w-8 h-8 rounded-lg shrink-0 cursor-pointer p-0 border-0 bg-transparent"
                  />
                  <span className="text-xs text-navy dark:text-white font-black">{style.color}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Transparansi ({Math.round(style.fillOpacity * 100)}%)</label>
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
            </PopoverContent>
          </Popover>

          {availableKeys.length > 0 && (
            <Popover>
              <PopoverTrigger className={`p-1.5 hover:bg-muted rounded-lg transition-all outline-none ${layer.style?.definition_query ? 'text-primary bg-primary/10' : 'text-navy/60 dark:text-muted-foreground hover:text-navy dark:hover:text-foreground'}`} title="Filter Layer">
                <Filter className="w-3.5 h-3.5" />
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4 flex flex-col gap-3 bg-card/90 backdrop-blur-xl text-card-foreground border border-border/50 shadow-2xl z-50 rounded-xl">
                <h4 className="text-[11px] font-black uppercase tracking-widest border-b border-border/50 pb-2 text-navy dark:text-white">Filter Layer</h4>
                <div className="flex flex-col gap-2">
                  <select value={defField} onChange={e => setDefField(e.target.value)} className="w-full text-xs p-2 rounded-lg bg-white/50 dark:bg-black/20 border border-border/50 text-navy dark:text-white outline-none focus:ring-1 focus:ring-primary">
                    <option value="">-- Pilih Kolom --</option>
                    {availableKeys.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input 
                    type="text" 
                    value={defValue} 
                    onChange={e => setDefValue(e.target.value)} 
                    placeholder="Masukkan Nilai..." 
                    className="w-full text-xs p-2 rounded-lg bg-white/50 dark:bg-black/20 border border-border/50 text-navy dark:text-white outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <Button size="sm" onClick={handleApplyDefinitionQuery} className="bg-primary text-primary-foreground font-bold h-8 rounded-lg">Terapkan Filter</Button>
              </PopoverContent>
            </Popover>
          )}

          <ExportLayerDialog layer={layer} />
        </div>
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
      className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
    >
      <LayoutGrid className="w-4 h-4" />
      Layout Peta
    </button>
  );
}

/**
 * Tombol kompak untuk mengunduh semua hasil analisis (Overlap, Clip, Merge).
 * Selalu tampil agar pengguna tahu fitur ini ada.
 */
function DownloadAllResultsButton() {
  const { overlapResult, clipResult, mergeResult, bufferResult, unionResult, dissolveResult } = useMapContext();

  const results: { geojson: any; filename: string }[] = [];

  if (overlapResult) {
    results.push({
      geojson: overlapResult.geojson,
      filename: `overlap_${overlapResult.layerAName}_x_${overlapResult.layerBName}.geojson`.replace(/\s+/g, "_"),
    });
  }
  if (clipResult) {
    results.push({
      geojson: clipResult.geojson,
      filename: `clip_${clipResult.inputLayerName}_by_${clipResult.clipLayerName}.geojson`.replace(/\s+/g, "_"),
    });
  }
  if (mergeResult) {
    const names = mergeResult.sourceLayerNames.map((n) => n.replace(/\.[^/.]+$/, "")).join("_");
    results.push({
      geojson: mergeResult.geojson,
      filename: `merge_${names}.geojson`.replace(/\s+/g, "_"),
    });
  }
  if (bufferResult) {
    results.push({
      geojson: bufferResult.geojson,
      filename: `buffer_${bufferResult.inputLayerName}_${bufferResult.distance}${bufferResult.unit}.geojson`.replace(/\s+/g, "_"),
    });
  }
  if (unionResult) {
    const names = unionResult.sourceLayerNames.map((n) => n.replace(/\.[^/.]+$/, "")).join("_");
    results.push({
      geojson: unionResult.geojson,
      filename: `union_${names}.geojson`.replace(/\s+/g, "_"),
    });
  }
  if (dissolveResult) {
    results.push({
      geojson: dissolveResult.geojson,
      filename: `dissolve_${dissolveResult.inputLayerName}_by_${dissolveResult.dissolveProperty || "all"}.geojson`.replace(/\s+/g, "_"),
    });
  }

  const hasResults = results.length > 0;

  const handleDownloadAll = () => {
    if (!hasResults) return;
    for (const result of results) {
      const blob = new Blob([JSON.stringify(result.geojson, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    toast.success(`${results.length} file hasil analisis berhasil diunduh!`);
  };

  return (
    <button
      onClick={handleDownloadAll}
      disabled={!hasResults}
      className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border-2 transition-all active:scale-95 ${
        hasResults
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-lg shadow-emerald-500/10"
          : "bg-muted/30 text-muted-foreground/30 border-muted/50 cursor-not-allowed"
      }`}
      title={hasResults ? `Unduh ${results.length} hasil analisis` : "Jalankan analisis dulu"}
    >
      <DownloadCloud className="w-4 h-4" />
      <span>Unduh</span>
      {hasResults && (
        <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black bg-emerald-500 text-white">
          {results.length}
        </span>
      )}
    </button>
  );
}
