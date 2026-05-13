"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("./MiniMap"), { ssr: false });
import { UploadCloud, CheckCircle2, AlertTriangle, FileUp, Trash2, Check, ChevronsUpDown, Loader2, DownloadCloud, Layers, Info, Palette, Filter, ArrowUp, ArrowDown, Maximize, LayoutGrid, Settings2 } from "lucide-react";
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
import { SpatialJoinButton } from "./SpatialJoinPanel";

const PdfOverlayPanel = dynamic(() => import("./PdfOverlayPanel").then(mod => mod.PdfOverlayPanel), { ssr: false });

export function UploadDatasetPanel() {
  const { layers, setLayers, setZoomFeature, areaUnit, setAreaUnit } = useMapContext();
  const [isUploading, setIsUploading] = useState(false);

  const [metricPayload, setMetricPayload] = useState<{ file: File, geojson: any } | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedProjection, setSelectedProjection] = useState("");
  const [customEpsg, setCustomEpsg] = useState("");
  const [isFixing, setIsFixing] = useState(false);

  // State untuk Fitur Upload Koordinat (CSV/TXT)
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewData, setCsvPreviewData] = useState<string[][]>([]);
  const [csvFullText, setCsvFullText] = useState<string>("");
  const [previewCoords, setPreviewCoords] = useState<[number, number][]>([]);
  const [activeSlot, setActiveSlot] = useState<'colCode' | 'colX' | 'colY' | null>(null);
  const [csvSettings, setCsvSettings] = useState({
    projection: 'geografis', // 'geografis', 'utm', 'tm3'
    zone: '48.1', // Default zone untuk TM3
    colCode: '',
    colX: '',
    colY: ''
  });

  useEffect(() => {
    fetchActiveLayers()
      .then((data) => {
        if (data) setLayers(data);
      })
      .catch((err) => console.error("Gagal load layers awal:", err));
  }, [setLayers]);


  useEffect(() => {
    if (!csvFullText || !csvSettings.colX || !csvSettings.colY) {
      setPreviewCoords([]);
      return;
    }

    const calculatePreview = async () => {
      try {
        const lines = csvFullText.split('\n');
        if (lines.length <= 1) return;

        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/\r$/, ''));

        const idxX = headers.indexOf(csvSettings.colX);
        const idxY = headers.indexOf(csvSettings.colY);

        if (idxX === -1 || idxY === -1) return;

        const coordinates: [number, number][] = [];

        // Ambil maksimal 1000 titik saja untuk preview agar tidak lambat
        const maxLines = Math.min(lines.length, 1000);
        
        for (let i = 1; i < maxLines; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const vals = line.split(delimiter);
          const x = parseFloat(vals[idxX]);
          const y = parseFloat(vals[idxY]);

          if (!isNaN(x) && !isNaN(y)) {
            coordinates.push([x, y]);
          }
        }

        if (coordinates.length < 3) return;

        // Otomatis tutup poligon jika belum
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          coordinates.push([first[0], first[1]]);
        }

        // Konversi koordinat jika bukan geografis
        let finalCoords = coordinates;
        if (csvSettings.projection !== 'geografis') {
          const proj4 = (await import('proj4')).default;
          const { TM3_ZONES } = await import('@/lib/crs');

          let sourceDef = "";
          if (csvSettings.projection === 'utm') {
            const zoneNum = parseInt(csvSettings.zone);
            const isSouth = csvSettings.zone.toUpperCase().endsWith('S');
            if (!isNaN(zoneNum)) {
              sourceDef = `+proj=utm +zone=${zoneNum} ${isSouth ? '+south' : ''} +datum=WGS84 +units=m +no_defs`;
            }
          } else if (csvSettings.projection === 'tm3') {
            const zoneObj = TM3_ZONES.find(z => z.zone === csvSettings.zone);
            if (zoneObj) {
              sourceDef = `+proj=tmerc +lat_0=0 +lon_0=${zoneObj.cm} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +units=m +no_defs`;
            }
          }

          if (sourceDef) {
            finalCoords = coordinates.map(coord => {
              const [x, y] = coord;
              try {
                const [lon, lat] = proj4(sourceDef, "EPSG:4326", [x, y]);
                return [lon, lat] as [number, number];
              } catch (e) {
                return [0, 0] as [number, number];
              }
            }).filter(c => c[0] !== 0 || c[1] !== 0) as [number, number][];
          }
        }

        setPreviewCoords(finalCoords);
      } catch (err) {
        console.error("Gagal menghitung preview coords:", err);
      }
    };

    calculatePreview();
  }, [csvFullText, csvSettings.colX, csvSettings.colY, csvSettings.projection, csvSettings.zone]);

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
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    // Khusus untuk file koordinat (CSV/TXT)
    if (extension === 'csv' || extension === 'txt') {
      setCsvFile(file);
      setIsCsvModalOpen(true);
      
      // Baca 1MB pertama untuk pratinjau (Optimasi Memori!)
      const previewSlice = file.slice(0, 1024 * 1024);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setCsvFullText(text);
        const lines = text.split('\n');
        if (lines.length > 0) {
          // Deteksi pembatas: Tab, Semicolon, atau Koma
          const firstLine = lines[0];
          const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
          const headers = firstLine.split(delimiter).map(h => h.trim().replace(/\r$/, ''));
          setCsvHeaders(headers);
          
          // Baca 5 baris pertama untuk pratinjau
          const previewRows = lines.slice(1, 6).map(line => {
            if (!line.trim()) return [];
            return line.split(delimiter).map(v => v.trim().replace(/\r$/, ''));
          }).filter(row => row.length > 0);
          setCsvPreviewData(previewRows);
          
          // Tebak kolom
          const colCode = headers.find(h => /kode|id|titik/i.test(h)) || '';
          const colX = headers.find(h => /x|lon|east|bujur/i.test(h)) || '';
          const colY = headers.find(h => /y|lat|north|lintang/i.test(h)) || '';
          
          setCsvSettings({
            projection: 'geografis',
            zone: '48.1',
            colCode,
            colX,
            colY
          });
        }
      };
      reader.readAsText(previewSlice);
      return; // Stop di sini, biarkan modal yang melanjutkan
    }

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
            <UploadCloud className="w-5 h-5 text-navy dark:text-orange-500" />
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
        <span>{isUploading ? "Memproses..." : (isDragging ? "Lepaskan File!" : "Unggah Data Baru (.SHP/.KML/.GPKG/.CSV/.TXT)")}</span>
        <input
          type="file"
          className="hidden"
          accept=".zip,.rar,.kml,.kmz,.geojson,.json,.gdb.zip,.gpkg,.csv,.txt"
          onChange={handleFileUpload}
          disabled={isUploading}
        />
      </label>

      {/* Analysis Tools & More (The Grid) */}
      <div className="flex flex-col gap-3 pt-2 border-t border-border/30">
        <div className="flex flex-wrap gap-2 p-2 bg-black/20 dark:bg-black/40 rounded-2xl border border-white/5 shadow-inner justify-center">
          <div className="flex flex-col items-center gap-1">
            <BufferAnalysisButton />
            <span className="text-[7px] font-bold uppercase text-muted-foreground/60">Buffer</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ClipAnalysisButton />
            <span className="text-[7px] font-bold uppercase text-muted-foreground/60">Clip</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <UnionAnalysisButton />
            <span className="text-[7px] font-bold uppercase text-muted-foreground/60">Union</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <MergeAnalysisButton />
            <span className="text-[7px] font-bold uppercase text-muted-foreground/60">Merge</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <OverlapAnalysisButton />
            <span className="text-[7px] font-bold uppercase text-muted-foreground/60">Overlap</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <DissolveAnalysisButton />
            <span className="text-[7px] font-bold uppercase text-muted-foreground/60">Dissolve</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <SpatialJoinButton />
            <span className="text-[7px] font-bold uppercase text-indigo-400">Join</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LayoutPetaButton />
          <DownloadAllResultsButton />
        </div>
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

      {/* DIALOG PENGATURAN CSV/TXT KOORDINAT */}
      <Dialog open={isCsvModalOpen} onOpenChange={setIsCsvModalOpen}>
        <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Settings2 className="w-5 h-5" />
              Pengaturan File Koordinat
            </DialogTitle>
            <DialogDescription>
              Silakan tentukan sistem proyeksi dan sesuaikan kolom yang berisi koordinat.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {/* Pratinjau Tabel */}
            {csvPreviewData.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-foreground">Pratinjau Data (5 Baris Pertama)</label>
                <div className="overflow-x-auto border rounded-lg border-border/50 bg-muted/30">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-black/10 dark:bg-white/5">
                      <tr>
                        {csvHeaders.map((h, idx) => (
                          <th key={idx} className={`px-2 py-1.5 font-bold ${
                            h === csvSettings.colX ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400' :
                            h === csvSettings.colY ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400' :
                            ''
                          }`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreviewData.map((row, rIdx) => (
                        <tr key={rIdx} className="border-t border-border/20">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className={`px-2 py-1 ${
                              csvHeaders[cIdx] === csvSettings.colX ? 'bg-cyan-500/10' :
                              csvHeaders[cIdx] === csvSettings.colY ? 'bg-orange-500/10' :
                              ''
                            }`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pilihan Proyeksi */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-foreground">Sistem Proyeksi</label>
              <select 
                value={csvSettings.projection} 
                onChange={(e) => setCsvSettings(prev => ({ ...prev, projection: e.target.value }))}
                className="w-full text-xs p-2 rounded-lg bg-white/50 dark:bg-black/20 border border-border/50 text-navy dark:text-white"
              >
                <option value="geografis">Geografis (WGS84)</option>
                <option value="utm">UTM (Universal Transverse Mercator)</option>
                <option value="tm3">TM3 (Transverse Mercator 3 Degree)</option>
              </select>
            </div>

            {/* Input Zona jika UTM atau TM3 */}
            {csvSettings.projection !== 'geografis' && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-foreground">Zona {csvSettings.projection === 'utm' ? 'UTM' : 'TM3'}</label>
                <Input 
                  value={csvSettings.zone} 
                  onChange={(e) => setCsvSettings(prev => ({ ...prev, zone: e.target.value }))}
                  placeholder={csvSettings.projection === 'utm' ? "Contoh: 48S" : "Contoh: 48.1"}
                  className="bg-background"
                />
              </div>
            )}

            {/* Pemetaan Kolom */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-foreground">Pemetaan Kolom (Klik Slot &rarr; Klik Chip)</label>
              
              {/* Slots */}
              <div className="grid grid-cols-3 gap-2">
                <div 
                  onClick={() => setActiveSlot('colCode')}
                  className={`cursor-pointer p-2 rounded-lg border-2 transition-all ${
                    activeSlot === 'colCode' ? 'border-primary bg-primary/10' : 'border-border/50 bg-muted/30'
                  }`}
                >
                  <label className="text-xs text-muted-foreground block mb-1">Kode Titik</label>
                  <div className="text-xs font-bold truncate">
                    {csvSettings.colCode || <span className="text-muted-foreground/50">-- Pilih --</span>}
                  </div>
                </div>
                
                <div 
                  onClick={() => setActiveSlot('colX')}
                  className={`cursor-pointer p-2 rounded-lg border-2 transition-all ${
                    activeSlot === 'colX' ? 'border-cyan-500 bg-cyan-500/10' : 'border-border/50 bg-muted/30'
                  }`}
                >
                  <label className="text-xs text-muted-foreground block mb-1">
                    {csvSettings.projection === 'geografis' ? 'Longitude' : 'X (Easting)'}
                  </label>
                  <div className="text-xs font-bold truncate text-cyan-600 dark:text-cyan-400">
                    {csvSettings.colX || <span className="text-muted-foreground/50">-- Pilih --</span>}
                  </div>
                </div>
                
                <div 
                  onClick={() => setActiveSlot('colY')}
                  className={`cursor-pointer p-2 rounded-lg border-2 transition-all ${
                    activeSlot === 'colY' ? 'border-orange-500 bg-orange-500/10' : 'border-border/50 bg-muted/30'
                  }`}
                >
                  <label className="text-xs text-muted-foreground block mb-1">
                    {csvSettings.projection === 'geografis' ? 'Latitude' : 'Y (Northing)'}
                  </label>
                  <div className="text-xs font-bold truncate text-orange-600 dark:text-orange-400">
                    {csvSettings.colY || <span className="text-muted-foreground/50">-- Pilih --</span>}
                  </div>
                </div>
              </div>

              {/* Chips (Daftar Kolom) */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {csvHeaders.map((h, idx) => {
                  const isCurrent = activeSlot && csvSettings[activeSlot] === h;
                  
                  return (
                    <button
                      key={`${h}-${idx}`}
                      onClick={() => {
                        if (activeSlot) {
                          setCsvSettings(prev => ({ ...prev, [activeSlot]: h }));
                          setActiveSlot(null); // Reset slot setelah memilih
                        }
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        isCurrent ? 'bg-primary text-primary-foreground border-primary' :
                        h === csvSettings.colX ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/50' :
                        h === csvSettings.colY ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/50' :
                        h === csvSettings.colCode ? 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/50' :
                        'bg-background hover:bg-muted border-border/50'
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Mini Map Preview */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-foreground">Pratinjau Spasial</label>
              <MiniMap coordinates={previewCoords} />
            </div>
          </div>

          <DialogFooter className="border-t pt-4 flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setIsCsvModalOpen(false)}>
              Batalkan
            </Button>
            <Button 
              onClick={async () => {
                if (!csvFile || !csvSettings.colX || !csvSettings.colY) {
                  toast.error("Kolom X dan Y harus dipilih!");
                  return;
                }
                setIsCsvModalOpen(false);
                setIsUploading(true);
                
                try {
                  toast.info("Membaca file koordinat...");
                  const reader = new FileReader();
                  reader.onload = async (e) => {
                    const text = e.target?.result as string;
                    const lines = text.split('\n');
                    if (lines.length <= 1) throw new Error("File kosong atau hanya berisi header.");
                    
                    const firstLine = lines[0];
                    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
                    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/\r$/, ''));
                    
                    const idxX = headers.indexOf(csvSettings.colX);
                    const idxY = headers.indexOf(csvSettings.colY);
                    
                    if (idxX === -1 || idxY === -1) throw new Error("Kolom X atau Y tidak ditemukan.");
                    
                    const coordinates: [number, number][] = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                      const line = lines[i].trim();
                      if (!line) continue;
                      const vals = line.split(delimiter);
                      const x = parseFloat(vals[idxX]);
                      const y = parseFloat(vals[idxY]);
                      
                      if (!isNaN(x) && !isNaN(y)) {
                        coordinates.push([x, y]);
                      }
                    }
                    
                    if (coordinates.length < 3) throw new Error("Butuh minimal 3 titik untuk membentuk poligon.");
                    
                    // Otomatis tutup poligon jika belum
                    const first = coordinates[0];
                    const last = coordinates[coordinates.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) {
                      coordinates.push([first[0], first[1]]);
                    }
                    
                    // Konversi koordinat jika bukan geografis
                    let finalCoords = coordinates;
                    if (csvSettings.projection !== 'geografis') {
                      toast.info(`Mengonversi koordinat dari ${csvSettings.projection.toUpperCase()}...`);
                      const proj4 = (await import('proj4')).default;
                      const { TM3_ZONES } = await import('@/lib/crs');
                      
                      let sourceDef = "";
                      if (csvSettings.projection === 'utm') {
                        const zoneNum = parseInt(csvSettings.zone);
                        const isSouth = csvSettings.zone.toUpperCase().endsWith('S');
                        if (isNaN(zoneNum)) throw new Error("Zona UTM tidak valid.");
                        sourceDef = `+proj=utm +zone=${zoneNum} ${isSouth ? '+south' : ''} +datum=WGS84 +units=m +no_defs`;
                      } else if (csvSettings.projection === 'tm3') {
                        const zoneObj = TM3_ZONES.find(z => z.zone === csvSettings.zone);
                        if (!zoneObj) throw new Error(`Zona TM3 ${csvSettings.zone} tidak ditemukan di crs.ts.`);
                        sourceDef = `+proj=tmerc +lat_0=0 +lon_0=${zoneObj.cm} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +units=m +no_defs`;
                      }
                      
                      finalCoords = coordinates.map(coord => {
                        const [x, y] = coord;
                        // proj4(from, to, [x, y])
                        const [lon, lat] = proj4(sourceDef, "EPSG:4326", [x, y]);
                        return [lon, lat];
                      });
                    }
                    
                    // Buat GeoJSON Polygon
                    const geojson = {
                      type: "FeatureCollection",
                      features: [{
                        type: "Feature",
                        properties: {
                          nama: csvFile.name.replace(/\.[^/.]+$/, "")
                        },
                        geometry: {
                          type: "Polygon",
                          coordinates: [finalCoords]
                        }
                      }]
                    };
                    
                    await executeUpload(csvFile, geojson);
                  };
                  reader.readAsText(csvFile);
                } catch (err: any) {
                  toast.error(`Gagal memproses file koordinat: ${err.message}`);
                } finally {
                  setIsUploading(false);
                }
              }} 
              className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px]"
            >
              Proses & Gambar
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
  const colorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    const newStyle = { ...style, color: newColor, fillColor: newColor };
    
    // Update local state immediately for smooth UI
    updateLayerStyle(layer.id, newStyle);
    
    // Debounce database update
    if (colorTimeoutRef.current) {
      clearTimeout(colorTimeoutRef.current);
    }
    
    colorTimeoutRef.current = setTimeout(async () => {
      if (layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
    }, 500); // 500ms debounce
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
          <button 
            onClick={(e) => { e.stopPropagation(); triggerZoomToLayer(layer.id!); }} 
            className="p-1.5 hover:bg-muted rounded-lg text-navy/60 dark:text-muted-foreground hover:text-navy dark:hover:text-foreground transition-all outline-none"
            title="Zoom ke Layer"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>

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
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => { handleApplyDefinitionQuery(); }} 
                    className="flex-1 bg-primary text-primary-foreground font-bold h-8 rounded-lg"
                  >
                    Terapkan
                  </Button>
                  {layer.style?.definition_query && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={handleClearDefinitionQuery} 
                      className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10 font-bold"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <ExportLayerDialog layer={layer} />
        </div>
      </div>
    </div>
  );
}

function LayoutPetaButton() {
  const { setLayoutComposerOpen } = useMapContext();
  return (
    <button
      onClick={() => setLayoutComposerOpen(true)}
      className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-2.5 rounded-xl bg-white/5 dark:bg-white/5 border border-white/10 hover:bg-primary/20 hover:border-primary/30 text-navy/70 dark:text-white/80 hover:text-primary transition-all active:scale-95 group shadow-sm"
    >
      <img src="/logo-sakagis.png" alt="S" className="w-4 h-4 object-contain mix-blend-multiply dark:invert dark:mix-blend-screen group-hover:scale-110 transition-transform" />
      <span>Layout</span>
    </button>
  );
}

function DownloadAllResultsButton() {
  const { overlapResult, clipResult, mergeResult, bufferResult, unionResult, dissolveResult, spatialJoinResult } = useMapContext();
  const results: { geojson: any; filename: string }[] = [];

  if (overlapResult) results.push({ geojson: overlapResult.geojson, filename: `overlap_${overlapResult.layerAName}_x_${overlapResult.layerBName}.geojson`.replace(/\s+/g, "_") });
  if (clipResult) results.push({ geojson: clipResult.geojson, filename: `clip_${clipResult.inputLayerName}_by_${clipResult.clipLayerName}.geojson`.replace(/\s+/g, "_") });
  if (mergeResult) results.push({ geojson: mergeResult.geojson, filename: `merge_${mergeResult.sourceLayerNames.join("_")}.geojson`.replace(/\s+/g, "_") });
  if (bufferResult) results.push({ geojson: bufferResult.geojson, filename: `buffer_${bufferResult.inputLayerName}_${bufferResult.distance}${bufferResult.unit}.geojson`.replace(/\s+/g, "_") });
  if (unionResult) results.push({ geojson: unionResult.geojson, filename: `union_${unionResult.sourceLayerNames.join("_")}.geojson`.replace(/\s+/g, "_") });
  if (dissolveResult) results.push({ geojson: dissolveResult.geojson, filename: `dissolve_${dissolveResult.inputLayerName}.geojson`.replace(/\s+/g, "_") });
  if (spatialJoinResult) results.push({ geojson: spatialJoinResult.geojson, filename: `spatial_join_${spatialJoinResult.targetLayerName}_with_${spatialJoinResult.sourceLayerName}.geojson`.replace(/\s+/g, "_") });

  const hasResults = results.length > 0;

  const handleDownloadAll = () => {
    if (!hasResults) return;
    results.forEach(result => {
      const blob = new Blob([JSON.stringify(result.geojson, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    toast.success(`${results.length} file hasil analisis berhasil diunduh!`);
  };

  return (
    <button
      onClick={handleDownloadAll}
      disabled={!hasResults}
      className={`flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-2.5 rounded-xl border transition-all active:scale-95 shadow-sm ${
        hasResults
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-emerald-500/10"
          : "bg-black/5 dark:bg-white/5 text-navy/20 dark:text-white/10 border-white/5 cursor-not-allowed"
      }`}
    >
      <DownloadCloud className={`w-3.5 h-3.5 ${hasResults ? 'animate-bounce' : ''}`} />
      <span>Unduh</span>
      {hasResults && (
        <span className="flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full text-[8px] font-black bg-emerald-500 text-white ml-0.5">
          {results.length}
        </span>
      )}
    </button>
  );
}
