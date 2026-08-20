"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("./MiniMap"), { ssr: false });
import { UploadCloud, CheckCircle2, AlertTriangle, FileUp, Trash2, Check, X, ChevronsUpDown, Loader2, DownloadCloud, Layers, Info, Palette, Filter, ArrowUp, ArrowDown, Maximize, LayoutGrid, Settings2, Pin, Eye, EyeOff, Search, GripVertical } from "lucide-react";
import { parseSpatialFile } from "@/lib/spatialEngine";
import * as turf from "@turf/turf";
import { getOrCreateDefaultProject, uploadLayerToSupabase, fetchActiveLayers, deleteLayerFromSupabase, updateLayerStyleInSupabase, updateLayerOrderInSupabase } from "@/lib/database";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useMapContext } from "@/lib/MapContext";
import { useAuth } from "@/lib/AuthContext";

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
import { TopologyValidationButton } from "./TopologyValidationPanel";
import { SliverDetectionButton } from "./SliverDetectionPanel";

const PdfOverlayPanel = dynamic(() => import("./PdfOverlayPanel").then(mod => mod.PdfOverlayPanel), { ssr: false });

export function UploadDatasetPanel() {
  const { layers, setLayers, setZoomFeature, areaUnit, setAreaUnit } = useMapContext();
  const { isGuest } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(2);
  const [wizardFile, setWizardFile] = useState<File | null>(null);
  const [wizardGeojson, setWizardGeojson] = useState<any>(null);
  const [wizardCrs, setWizardCrs] = useState("WGS84 / EPSG:4326");
  const [wizardStyle, setWizardStyle] = useState({ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.2, weight: 2 });
  const [layerQuery, setLayerQuery] = useState("");
  const [showLegend, setShowLegend] = useState(false);
  const [analysisQuery, setAnalysisQuery] = useState("");
  const [analysisCategory, setAnalysisCategory] = useState("Semua");

  const filteredLayers = layers.filter((layer) => layer.name?.toLowerCase().includes(layerQuery.toLowerCase()));
  const allLayersVisible = layers.length > 0 && layers.every((layer) => layer.visible !== false);
  const analysisTools = [
    { key: "buffer", label: "Buffer", category: "Geometry", description: "Buat zona jarak di sekitar fitur.", icon: "◎", component: <BufferAnalysisButton /> },
    { key: "clip", label: "Clip", category: "Overlay", description: "Potong layer memakai batas layer lain.", icon: "✂", component: <ClipAnalysisButton /> },
    { key: "union", label: "Union", category: "Overlay", description: "Gabungkan geometri dua layer.", icon: "◈", component: <UnionAnalysisButton /> },
    { key: "merge", label: "Merge", category: "Geometry", description: "Gabungkan fitur menjadi layer baru.", icon: "⊕", component: <MergeAnalysisButton /> },
    { key: "overlap", label: "Overlap", category: "Quality", description: "Temukan area yang bertumpuk.", icon: "◌", component: <OverlapAnalysisButton /> },
    { key: "validasi", label: "Validasi", category: "Quality", description: "Cek topology dan bidang tanah.", icon: "✓", component: <TopologyValidationButton /> },
    { key: "dissolve", label: "Dissolve", category: "Geometry", description: "Satukan fitur berdasarkan atribut.", icon: "◉", component: <DissolveAnalysisButton /> },
    { key: "join", label: "Spatial Join", category: "Relation", description: "Hubungkan atribut secara spasial.", icon: "⌘", component: <SpatialJoinButton /> },
    { key: "sliver", label: "Sliver", category: "Quality", description: "Deteksi gap dan overlap tipis.", icon: "△", component: <SliverDetectionButton /> },
  ];
  const analysisCategories = ["Semua", "Overlay", "Geometry", "Quality", "Relation"];
  const visibleAnalysisTools = analysisTools.filter((tool) =>
    (analysisCategory === "Semua" || tool.category === analysisCategory) &&
    `${tool.label} ${tool.description}`.toLowerCase().includes(analysisQuery.toLowerCase())
  );

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
      if (isGuest) {
        toast.error("Akses Ditolak: Guest tidak diizinkan menghapus data yang sudah ada di sistem SAKAGIS.");
        return;
      }
      
      await deleteLayerFromSupabase(id);
      setLayers(layers.filter(l => l.id !== id));
      toast.success(`Layer ${name} berhasil dihapus.`);
    } catch (err: any) {
      toast.error(`Gagal menghapus layer: ${err.message}`);
    }
  };

  const executeUpload = async (file: File, geojsonData: any, layerStyle = wizardStyle) => {
    if (isGuest) {
      toast.info(`Memuat ${file.name} ke sesi Guest...`);
      const newLayer = {
        id: crypto.randomUUID(),
        name: file.name,
        geojson: geojsonData,
        geometryType: geojsonData.features?.[0]?.geometry?.type || "Vector",
        style: layerStyle,
        visible: true
      };
      setLayers((prev) => [...prev, newLayer as any]);
      setZoomFeature(geojsonData);
      toast.success(`Layer ${file.name} sukses dimuat secara lokal!`);
      return;
    }

    toast.info(`Mulai mengunggah ${file.name} ke Supabase...`);
    const project = await getOrCreateDefaultProject();
    const newLayer = await uploadLayerToSupabase(project.id, file.name, geojsonData);
    const styledLayer = { ...newLayer, style: layerStyle };
    if (newLayer?.id) await updateLayerStyleInSupabase(newLayer.id, layerStyle);
    setLayers((prev) => [...prev, styledLayer]);
    setZoomFeature(geojsonData);
    toast.success(`Layer ${file.name} sukses tersimpan di Supabase!`);
  };

  const [isDragging, setIsDragging] = useState(false);
  const [isPanelPinned, setIsPanelPinned] = useState(false);
  const [isToolsPinned, setIsToolsPinned] = useState(false);

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
          const colCode = headers.find(h => /\b(kode|id|titik|no|nomor|code|nama)\b/i.test(h)) || '';
          const colX = headers.find(h => /\b(longitude|lon|lng|east|easting|bujur|x)\b/i.test(h)) || '';
          const colY = headers.find(h => /\b(latitude|lat|ltd|north|northing|lintang|y)\b/i.test(h)) || '';
          
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
      const firstFeature = geojsonData.features?.find((feature: any) => feature.geometry);
      const geometryType = firstFeature?.geometry?.type || "Vector";
      const color = geometryType.includes("Line") ? "#10b981" : geometryType.includes("Point") ? "#ef4444" : "#3b82f6";
      setWizardFile(file);
      setWizardGeojson(geojsonData);
      setWizardCrs(geojsonData.detected_crs || "WGS84 / EPSG:4326");
      setWizardStyle({ color, fillColor: color, fillOpacity: geometryType.includes("Point") ? 0.9 : 0.2, weight: 2 });
      setWizardStep(2);
      setWizardOpen(true);
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

  const wizardFeatures = wizardGeojson?.features || [];
  const wizardFirstFeature = wizardFeatures.find((feature: any) => feature.geometry);
  const wizardGeometryType = wizardFirstFeature?.geometry?.type || "Vector";
  const wizardBbox = wizardGeojson ? (() => {
    try { return turf.bbox(wizardGeojson); } catch (_) { return null; }
  })() : null;
  const wizardFields = wizardFirstFeature?.properties ? Object.keys(wizardFirstFeature.properties).filter((key) => key !== "db_id" && key !== "FID") : [];

  const saveWizardLayer = async () => {
    if (!wizardFile || !wizardGeojson) return;
    setIsUploading(true);
    setWizardStep(5);
    try {
      await executeUpload(wizardFile, wizardGeojson, wizardStyle);
      setWizardOpen(false);
      setWizardFile(null);
      setWizardGeojson(null);
      setWizardStep(2);
    } catch (error: any) {
      toast.error(`Gagal menyimpan layer: ${error.message || error}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="text-card-foreground overflow-hidden flex flex-col">
      <div className="layer-manager-heading">
        <div>
          <strong>Layer Manager</strong>
          <span>Atur tampilan, urutan, filter, dan legenda</span>
        </div>
        <Layers className="h-4 w-4 text-cyan-300" />
      </div>
      {/* Area unit switcher — compact top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 bg-black/10">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Satuan Luas</span>
        <div className="relative flex items-center bg-black/30 rounded-lg p-0.5 border border-white/5 shadow-inner overflow-hidden">
          <div 
            className="absolute h-[calc(100%-4px)] bg-orange-500/80 shadow-lg rounded-md transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ 
              width: 'calc(33.33% - 2px)',
              left: '2px',
              transform: `translateX(${areaUnit === 'Ha' ? '0%' : areaUnit === 'm2' ? '106%' : '212%'})`
            }}
          />
          {(['Ha', 'm2', 'km2'] as const).map((unit) => (
            <button
              key={unit}
              onClick={(e) => { e.stopPropagation(); setAreaUnit(unit); }}
              className={`flex-1 relative z-10 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter transition-colors duration-300 ${
                areaUnit === unit ? 'text-white' : 'text-white/30 hover:text-white/60'
              }`}
            >
              {unit === 'Ha' ? 'Ha' : unit === 'm2' ? 'm²' : 'km²'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
          <span className="text-[10px] font-black text-white/80">{layers.length}</span>
          <span className="text-[8px] text-white/30 uppercase font-bold">Layer</span>
        </div>
      </div>

      <div className="p-3 space-y-3">

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={layerQuery}
            onChange={(e) => setLayerQuery(e.target.value)}
            placeholder="Cari layer..."
            className="w-full rounded-lg border border-border bg-background/60 py-2 pl-8 pr-2 text-[10px] text-foreground outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowLegend((value) => !value)}
          className={cn("flex h-8 items-center gap-1 rounded-lg border px-2 text-[9px] font-bold uppercase", showLegend ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted")}
          title="Tampilkan legenda otomatis"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Legenda
        </button>
        <button
          type="button"
          onClick={() => setLayers((prev) => prev.map((layer) => ({ ...layer, visible: !allLayersVisible })))}
          className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[9px] font-bold uppercase text-muted-foreground hover:bg-muted"
          title={allLayersVisible ? "Sembunyikan semua layer" : "Tampilkan semua layer"}
        >
          {allLayersVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>

      {showLegend && (
        <div className="rounded-xl border border-border bg-background/50 p-2">
          <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Legenda layer</div>
          <div className="grid grid-cols-1 gap-1">
            {layers.filter((layer) => layer.visible !== false).map((layer) => {
              const style = layer.style || { fillColor: "#3b82f6", fillOpacity: 0.2 };
              return <div key={layer.id} className="flex items-center gap-2 text-[10px] text-foreground/80"><span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: style.fillColor, opacity: style.fillOpacity ?? 0.5 }} /><span className="truncate">{layer.name}</span></div>;
            })}
          </div>
        </div>
      )}

      <ScrollArea className="h-52 rounded-xl border border-border bg-muted/30 dark:bg-black/20 p-2">
        {layers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground flex-col gap-2 opacity-50 pt-8">
            <Layers className="w-8 h-8" />
            <span>Belum ada layer diunggah</span>
          </div>
        ) : filteredLayers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Layer tidak ditemukan.</div>
        ) : (
          <div className="flex flex-col gap-2">
             {filteredLayers.map((layer) => {
               const index = layers.findIndex((item) => item.id === layer.id);
               return (
              <div 
                key={layer.id || index}
                draggable
                onDragStart={(e) => {
                  (e.target as HTMLDivElement).style.opacity = "0.5";
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", index.toString());
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  (e.target as HTMLDivElement).style.opacity = "1";
                  const fromIdx = parseInt(e.dataTransfer.getData("text/plain"));
                  const toIdx = index;
                  if (fromIdx !== toIdx && !isNaN(fromIdx)) {
                    const newLayers = [...layers];
                    const draggedLayer = newLayers[fromIdx];
                    newLayers.splice(fromIdx, 1);
                    newLayers.splice(toIdx, 0, draggedLayer);
                    setLayers(newLayers);
                    // Sync order to database
                    const updates = newLayers.map((l, idx) => ({ id: l.id!, sort_order: idx }));
                    updateLayerOrderInSupabase(updates);
                  }
                }}
                onDragEnd={(e) => {
                  (e.target as HTMLDivElement).style.opacity = "1";
                }}
              >
                <LayerControlItem 
                  layer={layer} 
                  onDelete={() => handleDeleteLayer(layer.id!, layer.name)} 
                />
              </div>
               );
             })}
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

      {/* Unified Analysis Workspace */}
      <div className="analysis-workspace">
        <div className="analysis-workspace-header">
          <div>
            <strong>Analysis Workspace</strong>
            <span>Pilih tool, atur parameter, lalu simpan hasil sebagai layer baru.</span>
          </div>
          <span className="analysis-layer-status">{layers.length} layer</span>
        </div>
        <div className="analysis-workspace-search">
          <Search className="h-3.5 w-3.5" />
          <input value={analysisQuery} onChange={(e) => setAnalysisQuery(e.target.value)} placeholder="Cari tool analisis..." />
        </div>
        <div className="analysis-category-tabs">
          {analysisCategories.map((category) => (
            <button key={category} type="button" onClick={() => setAnalysisCategory(category)} className={analysisCategory === category ? "active" : ""}>{category}</button>
          ))}
        </div>
        <div className="analysis-workspace-grid">
          {visibleAnalysisTools.map((tool) => (
            <div className="analysis-tool-card" key={tool.key}>
              <div className="analysis-tool-icon">{tool.icon}</div>
              <div className="analysis-tool-copy">
                <strong>{tool.label}</strong>
                <span>{tool.description}</span>
                <small>{tool.category}</small>
              </div>
              <div className="analysis-tool-trigger">{tool.component}</div>
            </div>
          ))}
        </div>
        {visibleAnalysisTools.length === 0 && <div className="analysis-empty">Tool tidak ditemukan.</div>}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <LayoutPetaButton />
          <DownloadAllResultsButton />
        </div>
      </div>

      </div>


      <Dialog open={wizardOpen} onOpenChange={(open) => !isUploading && setWizardOpen(open)}>
        <DialogContent className="sm:max-w-2xl bg-card text-card-foreground border-border max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-cyan-400"><UploadCloud className="w-5 h-5" /> Upload Data Wizard</DialogTitle>
            <DialogDescription>{wizardFile?.name || "Siapkan layer baru"}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-5 gap-1 py-2">
            {["Pilih File", "Deteksi CRS", "Preview", "Atur Style", "Simpan"].map((label, index) => {
              const step = index + 1;
              const active = wizardStep === step;
              const complete = wizardStep > step;
              return <div key={label} className={cn("flex flex-col items-center gap-1 text-center", active ? "text-cyan-300" : complete ? "text-emerald-400" : "text-muted-foreground/40")}><span className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-black", active ? "border-cyan-400 bg-cyan-500/20" : complete ? "border-emerald-400 bg-emerald-500/15" : "border-border")}>{complete ? "✓" : step}</span><span className="text-[8px] font-bold uppercase tracking-wider">{label}</span></div>;
            })}
          </div>

          <div className="min-h-[280px] flex-1 overflow-y-auto rounded-xl border border-border bg-background/40 p-4">
            {wizardStep === 1 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <FileUp className="h-10 w-10 text-cyan-400" />
                <strong className="text-sm text-foreground">Pilih file spasial</strong>
                <span className="text-xs">SHP, KML, GPKG, GeoJSON, KMZ, atau format yang didukung.</span>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <div><h3 className="text-sm font-black uppercase tracking-wider text-foreground">Dataset berhasil dibaca</h3><p className="mt-1 text-xs text-muted-foreground">Periksa sistem koordinat dan ringkasan data sebelum lanjut.</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-muted/30 p-3"><span className="text-[9px] uppercase text-muted-foreground">Format</span><strong className="mt-1 block text-sm">{wizardFile?.name.split('.').pop()?.toUpperCase()}</strong></div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3"><span className="text-[9px] uppercase text-muted-foreground">Geometry</span><strong className="mt-1 block text-sm">{wizardGeometryType}</strong></div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3"><span className="text-[9px] uppercase text-muted-foreground">Jumlah fitur</span><strong className="mt-1 block text-sm">{wizardFeatures.length.toLocaleString('id-ID')}</strong></div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3"><span className="text-[9px] uppercase text-muted-foreground">CRS terdeteksi</span><strong className="mt-1 block text-sm text-cyan-300">{wizardCrs}</strong></div>
                </div>
                {wizardBbox && <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">BBox: <span className="font-mono text-foreground">{wizardBbox.map((value: number) => value.toFixed(6)).join(' · ')}</span></div>}
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <div><h3 className="text-sm font-black uppercase tracking-wider text-foreground">Preview atribut</h3><p className="mt-1 text-xs text-muted-foreground">Contoh data yang akan disimpan sebagai layer.</p></div>
                {wizardFields.length > 0 ? <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-xs"><thead className="bg-muted/50"><tr>{wizardFields.slice(0, 6).map((field) => <th key={field} className="whitespace-nowrap px-3 py-2 font-bold text-muted-foreground">{field}</th>)}</tr></thead><tbody>{wizardFeatures.slice(0, 5).map((feature: any, index: number) => <tr key={index} className="border-t border-border/50"><>{wizardFields.slice(0, 6).map((field) => <td key={field} className="max-w-[180px] truncate px-3 py-2 text-foreground/80">{String(feature.properties?.[field] ?? '-')}</td>)}</></tr>)}</tbody></table></div> : <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">Tidak ada atribut tambahan.</div>}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">Geometri akan tetap disimpan dalam WGS84/EPSG:4326 setelah validasi.</div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-5">
                <div><h3 className="text-sm font-black uppercase tracking-wider text-foreground">Atur tampilan layer</h3><p className="mt-1 text-xs text-muted-foreground">Style ini bisa diubah lagi dari Layer Manager.</p></div>
                <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4"><div className="h-16 w-24 rounded-xl border border-white/10" style={{ backgroundColor: wizardStyle.fillColor, opacity: wizardStyle.fillOpacity }} /><div className="text-xs text-muted-foreground"><strong className="block text-foreground">{wizardFile?.name}</strong><span>{wizardGeometryType} · {wizardFeatures.length} fitur</span></div></div>
                <div className="grid grid-cols-2 gap-4"><div><label className="layout-props-label">Warna</label><input type="color" value={wizardStyle.color} onChange={(e) => setWizardStyle((style) => ({ ...style, color: e.target.value, fillColor: e.target.value }))} className="h-10 w-full cursor-pointer rounded-lg border-0 bg-transparent" /></div><div><label className="layout-props-label">Ketebalan garis</label><input type="number" min={1} max={10} value={wizardStyle.weight} onChange={(e) => setWizardStyle((style) => ({ ...style, weight: Number(e.target.value) || 1 }))} className="layout-props-input" /></div></div>
                <div><div className="mb-2 flex justify-between"><label className="layout-props-label">Opacity isi</label><span className="text-xs font-mono text-cyan-300">{Math.round(wizardStyle.fillOpacity * 100)}%</span></div><Slider value={[wizardStyle.fillOpacity * 100]} max={100} step={5} onValueChange={(value) => { const next = Array.isArray(value) ? value[0] : value; setWizardStyle((style) => ({ ...style, fillOpacity: Number(next || 0) / 100 })); }} /></div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><Loader2 className="h-8 w-8 animate-spin text-cyan-400" /><strong className="text-sm">Menyimpan layer...</strong><span className="text-xs text-muted-foreground">Menulis metadata, geometry, dan style ke workspace.</span></div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => wizardStep > 2 ? setWizardStep((step) => step - 1) : setWizardOpen(false)} disabled={isUploading}>Kembali</Button>
            {wizardStep < 4 ? <Button onClick={() => setWizardStep((step) => step + 1)} disabled={!wizardGeojson} className="bg-cyan-600 text-white hover:bg-cyan-700">Lanjut</Button> : wizardStep === 4 ? <Button onClick={saveWizardLayer} disabled={isUploading} className="bg-cyan-600 text-white hover:bg-cyan-700"><CheckCircle2 className="mr-2 h-4 w-4" />Simpan Layer</Button> : <span className="text-xs text-muted-foreground">Proses selesai</span>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  className={`cursor-pointer p-2.5 rounded-xl border-2 transition-all ${
                    csvSettings.colCode ? 'border-purple-500 bg-purple-500/10 dark:bg-purple-500/5' :
                    activeSlot === 'colCode' ? 'border-purple-500/50 bg-purple-500/5 animate-pulse' : 
                    'border-border/50 bg-muted/30 hover:border-purple-500/30'
                  }`}
                >
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Kode Titik</label>
                  <div className="text-xs font-bold truncate">
                    {csvSettings.colCode || <span className="text-muted-foreground/30">-- Pilih --</span>}
                  </div>
                </div>
                
                <div 
                  onClick={() => setActiveSlot('colX')}
                  className={`cursor-pointer p-2.5 rounded-xl border-2 transition-all ${
                    csvSettings.colX ? 'border-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/5' :
                    activeSlot === 'colX' ? 'border-cyan-500/50 bg-cyan-500/5 animate-pulse' : 
                    'border-border/50 bg-muted/30 hover:border-cyan-500/30'
                  }`}
                >
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                    {csvSettings.projection === 'geografis' ? 'Longitude' : 'X (Easting)'}
                  </label>
                  <div className="text-xs font-bold truncate text-cyan-600 dark:text-cyan-400">
                    {csvSettings.colX || <span className="text-muted-foreground/30">-- Pilih --</span>}
                  </div>
                </div>
                
                <div 
                  onClick={() => setActiveSlot('colY')}
                  className={`cursor-pointer p-2.5 rounded-xl border-2 transition-all ${
                    csvSettings.colY ? 'border-orange-500 bg-orange-500/10 dark:bg-orange-500/5' :
                    activeSlot === 'colY' ? 'border-orange-500/50 bg-orange-500/5 animate-pulse' : 
                    'border-border/50 bg-muted/30 hover:border-orange-500/30'
                  }`}
                >
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                    {csvSettings.projection === 'geografis' ? 'Latitude' : 'Y (Northing)'}
                  </label>
                  <div className="text-xs font-bold truncate text-orange-600 dark:text-orange-400">
                    {csvSettings.colY || <span className="text-muted-foreground/30">-- Pilih --</span>}
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
                          // Auto advance ke slot berikutnya agar lebih cepat
                          if (activeSlot === 'colX') setActiveSlot('colY');
                          else if (activeSlot === 'colY') setActiveSlot('colCode');
                          else setActiveSlot(null);
                        }
                      }}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 font-medium ${
                        isCurrent ? 'ring-2 ring-primary ring-offset-1 dark:ring-offset-black' : ''
                      } ${
                        h === csvSettings.colX ? 'bg-cyan-500 text-white border-cyan-500 shadow-lg shadow-cyan-500/20' :
                        h === csvSettings.colY ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20' :
                        h === csvSettings.colCode ? 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/20' :
                        'bg-muted/50 hover:bg-muted border-border/50 text-foreground'
                      }`}
                    >
                      <span>{h}</span>
                      {h === csvSettings.colX && <span className="text-[9px] font-black bg-white/20 px-1 rounded">X</span>}
                      {h === csvSettings.colY && <span className="text-[9px] font-black bg-white/20 px-1 rounded">Y</span>}
                      {h === csvSettings.colCode && <span className="text-[9px] font-black bg-white/20 px-1 rounded">ID</span>}
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
            <Button 
              variant="ghost" 
              onClick={() => setIsCsvModalOpen(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              <span>Batalkan</span>
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
              className="bg-orange-500 hover:bg-orange-600 text-white min-w-[140px] shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Proses & Gambar</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { ExportLayerDialog } from "./ExportLayerDialog";

function LayerControlItem({ layer, onDelete }: { layer: any, onDelete: () => void }) {
  const { updateLayerStyle, reorderLayer, layers, layerAreas, areaUnit, triggerZoomToLayer, layerGeojsonCache, setLayers } = useMapContext();
  const { isGuest } = useAuth();
  const style = layer.style || { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2, dissolve_key: 'none' };
  const colorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);
  const isVisible = layer.visible !== false;

  const handleToggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !isVisible } : l));
  };

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
           if (!isGuest) updateLayerStyleInSupabase(layer.id, newStyle);
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
    if (!isGuest && layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
  };

  const handleClearDefinitionQuery = async () => {
    setDefField("");
    setDefOperator("=");
    setDefValue("");
    const newStyle = { ...style };
    delete newStyle.definition_query;
    updateLayerStyle(layer.id, newStyle);
    if (!isGuest && layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
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
      if (!isGuest && layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
    }, 500); // 500ms debounce
  };

  const handleOpacityChange = async (val: number[]) => {
    const newStyle = { ...style, fillOpacity: val[0] / 100 };
    updateLayerStyle(layer.id, newStyle);
    if (!isGuest && layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
  };

  const handleDissolveChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStyle = { ...style, dissolve_key: e.target.value };
    updateLayerStyle(layer.id, newStyle);
    if (!isGuest && layer.id) await updateLayerStyleInSupabase(layer.id, newStyle);
    // Refresh layer visually by triggering a re-render/re-fetch internally via MapArea dependency later
  };

  const syncOrder = async () => {
    // Free tier debounce not fully needed for occasional clicks
    if (isGuest) return;
    const updates = layers.map((l, idx) => ({ id: l.id!, sort_order: idx }));
    await updateLayerOrderInSupabase(updates);
  };

  const metrics = layer.id ? layerAreas[layer.id] : undefined;

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 3 })} m²`;
  };

  const renderGeometryIcon = () => {
    const type = layer.geometryType || layerGeojsonCache[layer.id!]?.features?.[0]?.geometry?.type;
    
    if (type === 'Point' || type === 'MultiPoint') {
      return (
        <div 
          className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10 dark:border-white/10 shadow-sm" 
          style={{ backgroundColor: style.fillColor }} 
        />
      );
    } else if (type === 'LineString' || type === 'MultiLineString') {
      return (
        <div className="w-4 h-3 flex items-center justify-center shrink-0">
          <div 
            className="w-4 h-1 rounded-none border border-black/10 dark:border-white/10 shadow-sm" 
            style={{ backgroundColor: style.fillColor }} 
          />
        </div>
      );
    } else { // Polygon or MultiPolygon or default
      return (
        <div 
          className="w-3.5 h-3.5 rounded-none shrink-0 border border-black/10 dark:border-white/10 shadow-sm" 
          style={{ backgroundColor: style.fillColor, opacity: style.fillOpacity || 0.5 }} 
        />
      );
    }
  };

  return (
    <div 
      className={cn(
        "flex flex-col gap-0 rounded-2xl border transition-all duration-300 group cursor-pointer overflow-hidden",
        "bg-white dark:bg-white/5 shadow-sm",
        isPinned
          ? "border-primary/40 shadow-primary/10 shadow-md"
          : "border-border/60 hover:border-primary/30 hover:shadow-md"
      )}
      onDoubleClick={() => { if (layer.id) triggerZoomToLayer(layer.id); }}
      title="Double klik untuk Zoom ke layer ini"
    >
      {/* Accent bar top */}
      <div className={cn(
        "h-0.5 w-full transition-all duration-300",
        isPinned
          ? "bg-gradient-to-r from-primary via-primary/50 to-transparent"
          : "bg-transparent group-hover:bg-gradient-to-r group-hover:from-primary/40 group-hover:via-primary/20 group-hover:to-transparent"
      )} />

      {/* Main row */}
      <div className="layer-card-main flex items-center gap-3 px-3 py-3 relative">
        <div className="layer-drag-handle" title="Geser untuk mengubah urutan layer">
          <GripVertical className="h-4 w-4" />
        </div>
        {/* Geometry icon with colored bg (Click to change color) */}
        <label 
          className="layer-card-thumbnail shrink-0 rounded-xl flex items-center justify-center shadow-sm relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all group/icon" 
          style={{ backgroundColor: (style.fillColor || '#3b82f6') + '28' }}
          title="Ubah Warna Layer"
          onClick={(e) => e.stopPropagation()} // Prevent triggering zoom/drag
        >
          <input 
            type="color" 
            value={style.fillColor || '#3b82f6'} 
            onChange={handleColorChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
          />
          <span className="layer-thumb-grid" />
          <span className="relative z-10">{renderGeometryIcon()}</span>
        </label>

        <div className="flex-1 min-w-0 pr-1">
          <span className="block font-bold text-[12px] text-navy dark:text-white/95 truncate leading-tight" title={layer.name}>
            {layer.name}
          </span>
          <span className="text-[9px] text-muted-foreground/70 font-medium uppercase tracking-wider">
            {layer.geometryType || 'Vector'} · {layerGeojsonCache[layer.id!]?.features?.length || 0} fitur
          </span>
        </div>

        {/* Action buttons (Absolute on hover) */}
        <div className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 shrink-0 transition-opacity duration-200",
          "bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-sm p-1 rounded-xl shadow-sm border border-border/40",
          "opacity-100 pointer-events-auto md:opacity-0 md:group-hover:opacity-100 md:pointer-events-none md:group-hover:pointer-events-auto"
        )}>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsPinned(!isPinned); }} 
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
              isPinned 
                ? "text-primary bg-primary/15 hover:bg-primary/25" 
                : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
            )}
            title={isPinned ? "Lepas Pin" : "Pin Menu"}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={handleToggleVisibility} 
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
              isVisible 
                ? "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                : "text-orange-500 bg-orange-500/10 hover:bg-orange-500/20" 
            )}
            title={isVisible ? "Sembunyikan Layer" : "Tampilkan Layer"}
          >
            {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button 
            onClick={onDelete} 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:bg-red-500/10 hover:text-red-500 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      {/* Expandable action tray */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        isPinned 
          ? "max-h-24 opacity-100" 
          : "max-h-0 opacity-0 group-hover:max-h-24 group-hover:opacity-100"
      )}>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/20 bg-muted/20 dark:bg-black/10">
          {/* Reorder */}
          <div className="flex items-center bg-muted/40 dark:bg-black/20 rounded-xl p-0.5 gap-0.5">
            <button onClick={async (e) => { e.stopPropagation(); reorderLayer(layer.id, "up"); setTimeout(syncOrder, 100); }} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white dark:hover:bg-muted text-navy/60 dark:text-muted-foreground hover:text-navy dark:hover:text-foreground transition-all">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={async (e) => { e.stopPropagation(); reorderLayer(layer.id, "down"); setTimeout(syncOrder, 100); }} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white dark:hover:bg-muted text-navy/60 dark:text-muted-foreground hover:text-navy dark:hover:text-foreground transition-all">
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
