"use client";

import { useState, useEffect, useRef, useId, useMemo } from "react";
import "./layer-workspace.css";
import { AnalysisCatalog } from "./LayerWorkspaceAnalysisCatalog";
import { LayerExportButton } from "./LayerExportButton";
import { createDemoGeojson, DEMO_LAYER_ID, DEMO_LAYER_NAME } from "./layer-workspace-data";
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("./MiniMap"), { ssr: false });
import { UploadCloud, CheckCircle2, AlertTriangle, FileUp, Trash2, Check, X, ChevronsUpDown, Loader2, DownloadCloud, Layers, Info, ArrowUp, ArrowDown, Maximize, LayoutGrid, Settings2, Pin, Eye, EyeOff, Search, Table2, PenLine, BarChart3 } from "lucide-react";
import { parseSpatialFile } from "@/lib/spatialEngine";
import * as turf from "@turf/turf";
import { getOrCreateDefaultProject, uploadLayerToSupabase, fetchActiveLayers, deleteLayerFromSupabase, updateLayerStyleInSupabase, updateLayerOrderInSupabase } from "@/lib/database";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useMapContext } from "@/lib/MapContext";
import { useAuth } from "@/lib/AuthContext";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { PROJECTIONS, reprojectCoords } from "./ExportLayerDialog";
import { getProj4Def } from "@/lib/crs";
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
import { CrsReprojectButton } from "./CrsReprojectPanel";
import { TopologyAutofixButton } from "./TopologyAutofixPanel";
import { ChangeDetectionButton } from "./ChangeDetectionPanel";

const PdfOverlayPanel = dynamic(() => import("./PdfOverlayPanel").then(mod => mod.PdfOverlayPanel), { ssr: false });

export function UploadDatasetPanel({ mode = "dataset" }: { mode?: "dataset" | "analysis" }) {
  const { layers, setLayers, setZoomFeature, cacheLayerGeojson, areaUnit, setAreaUnit, selectedLayerId, setSelectedLayerId } = useMapContext();
  const focusedLayer = selectedLayerId ? layers.find((layer) => layer.id === selectedLayerId) : undefined;
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
  const uploadInputRef = useRef<HTMLInputElement>(null);


  const filteredLayers = layers.filter((layer) => layer.name?.toLowerCase().includes(layerQuery.toLowerCase()));
  const allLayersVisible = layers.length > 0 && layers.every((layer) => layer.visible !== false);
  const analysisTools = [
    { key: "buffer", label: "Buffer", category: "Olah geometri", description: "Buat zona jarak di sekitar fitur.", icon: "◎", component: <BufferAnalysisButton /> },
    { key: "clip", label: "Clip", category: "Potong & gabung", description: "Potong layer memakai batas layer lain.", icon: "✂", component: <ClipAnalysisButton /> },
    { key: "union", label: "Union", category: "Potong & gabung", description: "Gabungkan geometri dua layer.", icon: "◈", component: <UnionAnalysisButton /> },
    { key: "merge", label: "Merge", category: "Olah geometri", description: "Gabungkan fitur menjadi layer baru.", icon: "⊕", component: <MergeAnalysisButton /> },
    { key: "overlap", label: "Overlap", category: "Periksa kualitas", description: "Temukan area yang bertumpuk.", icon: "◌", component: <OverlapAnalysisButton /> },
    { key: "validasi", label: "Validasi", category: "Periksa kualitas", description: "Periksa topologi dan bidang tanah.", icon: "✓", component: <TopologyValidationButton /> },
    { key: "dissolve", label: "Dissolve", category: "Olah geometri", description: "Satukan fitur berdasarkan atribut.", icon: "◉", component: <DissolveAnalysisButton /> },
    { key: "join", label: "Spatial Join", category: "Hubungkan & bandingkan", description: "Hubungkan atribut secara spasial.", icon: "⌘", component: <SpatialJoinButton /> },
    { key: "sliver", label: "Sliver", category: "Periksa kualitas", description: "Deteksi gap dan overlap tipis.", icon: "△", component: <SliverDetectionButton /> },
    { key: "autofix", label: "Auto-fix", category: "Periksa kualitas", description: "Perbaiki gap, sliver, overlap otomatis (server).", icon: "⚒", component: <TopologyAutofixButton /> },
    { key: "crs", label: "CRS", category: "Olah geometri", description: "Cek & reproyeksi CRS file besar (server).", icon: "⊚", component: <CrsReprojectButton /> },
    { key: "change", label: "Perubahan", category: "Hubungkan & bandingkan", description: "Bandingkan dua snapshot bidang (server).", icon: "⇄", component: <ChangeDetectionButton /> },
  ];
  const loadDemoLayer = () => {
    const geojson = createDemoGeojson();
    setLayers((previous) => previous.some((layer) => layer.id === DEMO_LAYER_ID) ? previous : [...previous, {
      id: DEMO_LAYER_ID, name: DEMO_LAYER_NAME, data: geojson, geojson,
      geometryType: "Polygon", visible: true, syncStatus: "local",
      style: { color: "#78a898", fillColor: "#78a898", fillOpacity: 0.25, weight: 2 },
    }]);
    cacheLayerGeojson(DEMO_LAYER_ID, geojson);
    setZoomFeature(geojson);
    toast.success(`${geojson.features.length} bidang sintetis untuk belajar dimuat lokal. Bukan data pertanahan nyata.`);
  };

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
        if (data) setLayers((previous) => [...data, ...previous.filter((layer) => layer.syncStatus === "local" || layer.id?.startsWith("local-"))]);
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
      const layer = layers.find((item) => item.id === id);
      if (layer?.syncStatus === "local" || id.startsWith("local-")) {
        setLayers((previous) => previous.filter((item) => item.id !== id));
        if (selectedLayerId === id) setSelectedLayerId(null);
        toast.success(`Layer lokal ${name} dihapus dari sesi.`);
        return;
      }
      if (isGuest) {
        toast.error("Akses Ditolak: Guest tidak diizinkan menghapus data yang sudah ada di sistem SAKAGIS.");
        return;
      }
      
      await deleteLayerFromSupabase(id);
      if (selectedLayerId === id) setSelectedLayerId(null);
      setLayers((previous) => previous.filter(l => l.id !== id));
      toast.success(`Layer ${name} berhasil dihapus.`);
    } catch (err: any) {
      toast.error(`Gagal menghapus layer: ${err.message}`);
    }
  };

  const executeUpload = async (file: File, geojsonData: any, layerStyle = wizardStyle) => {
    if (isGuest) {
      toast.info(`Memuat ${file.name} ke sesi Guest...`);
      const newLayer = {
        id: `local-${crypto.randomUUID()}`,
        name: file.name,
        geojson: geojsonData,
        geometryType: geojsonData.features?.[0]?.geometry?.type || "Vector",
        style: layerStyle,
        visible: true,
        syncStatus: 'local'
      };
      setLayers((prev) => [...prev, newLayer as any]);
      // Guest layers must also enter the analysis cache; analysis tools read from it.
      cacheLayerGeojson(newLayer.id, geojsonData);
      setZoomFeature(geojsonData);
      toast.success(`Layer ${file.name} sukses dimuat secara lokal!`);
      return;
    }

    toast.info(`Mulai mengunggah ${file.name} ke Supabase...`);
    const project = await getOrCreateDefaultProject();
    const newLayer = await uploadLayerToSupabase(project.id, file.name, geojsonData);
    const styledLayer = { ...newLayer, style: layerStyle, syncStatus: 'syncing' as const };
    setLayers((prev) => [...prev, styledLayer]);
    if (newLayer?.id) await updateLayerStyleInSupabase(newLayer.id, layerStyle);
    const cloudLayer = { ...styledLayer, syncStatus: 'cloud' as const };
    setLayers((prev) => prev.map((layer) => layer.id === cloudLayer.id ? cloudLayer : layer));
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
      const color = geometryType.includes("Line") ? "#4e8266" : geometryType.includes("Point") ? "#bd6270" : "#3b82f6";
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
    <div className={cn("dataset-panel layer-workspace text-card-foreground overflow-hidden flex flex-col", mode === "analysis" && "dataset-panel-analysis")}>
      <div className="analysis-workspace analysis-workspace-primary" hidden={mode !== "analysis"}>
          <div className="analysis-workspace-header">
            <div>
              <strong>Analisis Spasial</strong>
              <span>Alur yang sama untuk setiap tool. Data asli tidak pernah ditimpa.</span>
            </div>
            <span className="analysis-layer-status">{layers.length} layer</span>
          </div>
          <ol className="analysis-flow" aria-label="Alur analisis">
            <li><b>1</b> Pilih data</li>
            <li><b>2</b> Atur parameter</li>
            <li><b>3</b> Jalankan</li>
            <li><b>4</b> Tinjau hasil</li>
          </ol>
          <div className={cn("analysis-focus", focusedLayer ? "is-set" : "")} data-testid="analysis-focus">
            {focusedLayer ? (
              <>
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate"><small>Layer fokus</small>{focusedLayer.name}</span>
                <button type="button" onClick={() => setSelectedLayerId(null)} aria-label="Lepas layer fokus"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <>
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1"><small>Tip</small>Pilih layer di Layer Manager agar tool langsung terisi.</span>
              </>
            )}
          </div>
          <AnalysisCatalog tools={analysisTools} />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <LayoutPetaButton />
            <DownloadAllResultsButton />
          </div>
        </div>
      <div className="layer-manager-heading">
        <div>
          <strong>Layer Manager</strong>
          <span>Pilih layer untuk tindakan. Detail menyimpan pengaturan lanjutan.</span>
        </div>
        <Layers className="h-4 w-4 text-cyan-300" />
      </div>
      <div className="dataset-unit-bar flex items-center justify-between px-3 py-2 border-b border-border/20">
        <span>Satuan luas</span>
        <div className="flex gap-1" aria-label="Satuan luas">{(["Ha", "m2", "km2"] as const).map((unit) => <button type="button" key={unit} aria-pressed={areaUnit === unit} onClick={() => setAreaUnit(unit)} className="rounded px-2">{unit === "m2" ? "m²" : unit === "km2" ? "km²" : unit}</button>)}</div>
        <span>{layers.length} layer</span>
      </div>

      <div className="p-3 space-y-3">

      <div className="layer-workspace-search">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={layerQuery}
            onChange={(e) => setLayerQuery(e.target.value)}
            placeholder="Cari layer..."
            aria-label="Cari layer"
            className="w-full rounded-lg border border-border bg-background/60 py-2 pl-8 pr-2 text-[10px] text-foreground outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowLegend((value) => !value)}
          className={cn("flex h-8 items-center gap-1 rounded-lg border px-2 text-[9px] font-bold uppercase", showLegend ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted")}
          title="Tampilkan legenda otomatis"
          aria-pressed={showLegend}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Legenda
        </button>
        <button
          type="button"
          onClick={() => setLayers((prev) => prev.map((layer) => ({ ...layer, visible: !allLayersVisible })))}
          className="flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-[9px] font-bold uppercase text-muted-foreground hover:bg-muted"
          title={allLayersVisible ? "Sembunyikan semua layer" : "Tampilkan semua layer"}
          aria-label={allLayersVisible ? "Sembunyikan semua layer" : "Tampilkan semua layer"}
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

      <div className="layer-workspace-list" aria-label="Daftar layer">
        {layers.length === 0 ? (
          <div className="layer-workspace-empty">
            <strong>Mulai dari satu layer</strong>
            <span>Impor file, gambar bidang, atau coba data edukasi lokal.</span>
            <div className="layer-workspace-empty-actions">
              <button type="button" onClick={() => uploadInputRef.current?.click()}>Impor data</button>
              <button type="button" onClick={() => document.dispatchEvent(new CustomEvent("sakagis:open-digitize"))}>Buka digitasi</button>
              <button type="button" onClick={loadDemoLayer}>Muat contoh data</button>
            </div>
            <small>Contoh sintetis, bukan data pertanahan nyata. Tidak dikirim ke cloud.</small>
          </div>
        ) : filteredLayers.length === 0 ? (
          <div className="layer-workspace-empty">Layer tidak ditemukan.<button type="button" onClick={() => setLayerQuery("")}>Reset pencarian</button></div>
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
                    const updates = newLayers.map((l, idx) => ({ ...l, sort_order: idx })).filter((l) => l.id && l.syncStatus !== "local" && !l.id.startsWith("local-")).map((l) => ({ id: l.id!, sort_order: l.sort_order }));
                    if (!isGuest) updateLayerOrderInSupabase(updates).catch(() => toast.error("Urutan berubah lokal; sinkronisasi cloud gagal."));
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
      </div>

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
        <span>{isUploading ? "Memproses..." : (isDragging ? "Lepaskan File!" : "Impor file spasial")}</span>
        <input
          type="file"
          ref={uploadInputRef}
          aria-label="Impor file spasial"
          className="sr-only"
          accept=".zip,.rar,.kml,.kmz,.geojson,.json,.gdb.zip,.gpkg,.csv,.txt"
          onChange={handleFileUpload}
          disabled={isUploading}
        />
      </label>
      <p className="layer-workspace-context-note">SHP (ZIP/RAR), KML/KMZ, GeoJSON, GDB (ZIP), GPKG, CSV/TXT. Peta PDF tersedia di atas.</p>

      {mode === "dataset" && <button type="button" className="layer-workspace-more-button" onClick={() => document.dispatchEvent(new CustomEvent("sakagis:open-analysis"))}><span><BarChart3 size={14} />Buka katalog analisis</span><span>{analysisTools.length} alat</span></button>}
      {mode === "dataset" && <div className="grid grid-cols-2 gap-2"><LayoutPetaButton /><DownloadAllResultsButton /></div>}

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
                   const localProjection = getProj4Def(`EPSG:${code}`);
                   let sourceProjConfig: any = localProjection;
                   if (!sourceProjConfig) {
                     const projRes = await fetch(`https://epsg.io/${code}.proj4`);
                     if (!projRes.ok) throw new Error(`Sistem Proyeksi (EPSG:${code}) tidak ditemukan.`);
                     sourceProjConfig = await projRes.text();
                   }

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



function LayerControlItem({ layer, onDelete }: { layer: any, onDelete: () => void }) {
  const { updateLayerStyle, layers, layerAreas, areaUnit, triggerZoomToLayer, layerGeojsonCache, setLayers, topologyErrors, activeDigitizingLayerId, selectedLayerId, setSelectedLayerId, setIsAttributeTableOpen, setActiveTableLayerId, setActiveDigitizingLayerId } = useMapContext();
  const { isGuest } = useAuth();
  const style = layer.style || { color: '#78a898', fillColor: '#78a898', fillOpacity: 0.2, weight: 2, dissolve_key: 'none' };
  const [moreOpen, setMoreOpen] = useState(false);
  const styleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [cloudKeys, setCloudKeys] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const actionId = useId();
  const geojson = layerGeojsonCache[layer.id] || layer.geojson || layer.data;
  const isLocal = layer.syncStatus === "local" || String(layer.id || "").startsWith("local-");
  const isVisible = layer.visible !== false;
  const isSelected = Boolean(layer.id) && selectedLayerId === layer.id;
  const isActive = activeDigitizingLayerId === layer.id;
  const features = geojson?.features;
  const featureCount = Array.isArray(features) ? features.length : undefined;
  const geometryType = layer.geometryType || features?.[0]?.geometry?.type || layer.geometry_type || "Vektor";
  const cachedKeys = useMemo(() => Array.from(new Set<string>((features || []).flatMap((feature: any) => Object.keys(feature.properties || {})))).filter((key) => key !== "FID" && key !== "db_id"), [features]);
  const availableKeys = cachedKeys.length ? cachedKeys : cloudKeys;
  const metrics = layerAreas[layer.id];
  const validationCount = topologyErrors?.layerId === layer.id ? topologyErrors?.features?.length : undefined;
  const [defField, setDefField] = useState(layer.style?.definition_query?.field || "");
  const [defValue, setDefValue] = useState(layer.style?.definition_query?.value || "");
  const [defOperator, setDefOperator] = useState(layer.style?.definition_query?.operator || "=");

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    if (!moreOpen || isLocal || !layer.id || cachedKeys.length) return;
    let cancelled = false;
    supabase.from("geometries").select("properties").eq("layer_id", layer.id).limit(1).maybeSingle().then(({ data, error }) => {
      if (!cancelled && !error) setCloudKeys(Object.keys(data?.properties || {}).filter((key) => key !== "FID" && key !== "db_id"));
    });
    return () => { cancelled = true; };
  }, [moreOpen, isLocal, layer.id, cachedKeys.length]);

  const saveStyle = (next: typeof style) => {
    updateLayerStyle(layer.id, next);
    if (!isGuest && !isLocal && layer.id) {
      if (styleTimer.current) clearTimeout(styleTimer.current);
      styleTimer.current = setTimeout(async () => {
        try { await updateLayerStyleInSupabase(layer.id, next); }
        catch { toast.error("Tampilan berubah lokal; penyimpanan cloud gagal. Coba lagi."); }
      }, 500);
    }
  };
  const reorder = async (direction: number) => {
    const index = layers.findIndex((item) => item.id === layer.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return;
    const next = [...layers]; [next[index], next[target]] = [next[target], next[index]];
    const ordered = next.map((item, order) => ({ ...item, sort_order: order }));
    setLayers(ordered);
    if (!isGuest) {
      try { await updateLayerOrderInSupabase(ordered.filter((item) => item.id && item.syncStatus !== "local" && !item.id.startsWith("local-")).map((item) => ({ id: item.id!, sort_order: item.sort_order }))); }
      catch { toast.error("Urutan berubah lokal; sinkronisasi cloud gagal."); }
    }
  };
  const formatUnit = (sqm: number) => areaUnit === "Ha" ? `${(sqm / 10000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} Ha` : areaUnit === "km2" ? `${(sqm / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} km²` : `${sqm.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²`;
  const area = metrics?.wgs84_sqm ?? (() => { try { return geojson ? turf.area(geojson) : null; } catch { return null; } })();
  const status = isLocal ? "Lokal · hanya perangkat ini" : layer.syncStatus === "syncing" ? "Menyinkronkan" : !isOnline || layer.syncStatus === "unsynced" ? "Belum sinkron" : "Cloud";

  return (
    <article className="layer-workspace-row" data-selected={isSelected} aria-label={`Layer ${layer.name}`}>
      <div className="layer-workspace-row-main layer-card-main">
        <button type="button" className="layer-workspace-select" data-testid="layer-selection-button" aria-label={`Pilih layer ${layer.name}`} aria-pressed={isSelected} aria-expanded={isSelected || isPinned} aria-controls={actionId}
          onClick={() => setSelectedLayerId(isSelected ? null : layer.id)} onDoubleClick={() => triggerZoomToLayer(layer.id)}>
          <span aria-hidden="true" style={{ backgroundColor: style.fillColor, borderRadius: String(geometryType).includes("Point") ? "50%" : 2, width: 13, height: String(geometryType).includes("Line") ? 3 : 13, flexShrink: 0 }} />
          <span className="layer-workspace-select-copy"><strong title={layer.name}>{layer.name}</strong><small><span>{geometryType}</span><span>{featureCount === undefined ? "Memuat fitur…" : `${featureCount.toLocaleString("id-ID")} fitur`}</span>{isActive && <span>Digitasi aktif</span>}</small></span>
        </button>
        <button type="button" className="layer-workspace-visibility" aria-label={`${isVisible ? "Sembunyikan" : "Tampilkan"} layer ${layer.name}`} aria-pressed={isVisible} onClick={() => setLayers((previous) => previous.map((item) => item.id === layer.id ? { ...item, visible: !isVisible } : item))}>{isVisible ? <Eye size={16} /> : <EyeOff size={16} />}</button>
      </div>
      {(isSelected || isPinned) && <div id={actionId} className="layer-workspace-context" data-testid="layer-context-actions">
        <div className="layer-workspace-context-grid">
          <button type="button" aria-label={`Zoom layer ${layer.name}`} onClick={() => triggerZoomToLayer(layer.id)}><Maximize size={14} />Zoom</button>
          <button type="button" aria-label={`Buka tabel atribut ${layer.name}`} onClick={() => { setActiveTableLayerId(layer.id); setIsAttributeTableOpen(true); }}><Table2 size={14} />Tabel atribut</button>
          <button type="button" aria-label={`Mulai digitasi ${layer.name}`} onClick={() => { setActiveDigitizingLayerId(layer.id); document.dispatchEvent(new CustomEvent("sakagis:open-digitize", { detail: { layerId: layer.id } })); }}><PenLine size={14} />Digitasi</button>
          <button type="button" aria-label={`Buka analisis ${layer.name}`} onClick={() => { setSelectedLayerId(layer.id); document.dispatchEvent(new CustomEvent("sakagis:open-analysis", { detail: { layerId: layer.id } })); }}><BarChart3 size={14} />Analisis</button>
        </div>
        <Popover open={moreOpen} onOpenChange={(open) => { setMoreOpen(open); if (!open) setConfirmDelete(false); }}>
          <PopoverTrigger className="layer-workspace-more-button" aria-label={`Lainnya untuk ${layer.name}`}><span><Settings2 size={14} />Lainnya / Detail</span><ChevronsUpDown size={13} /></PopoverTrigger>
          <PopoverContent align="start" className="layer-workspace-menu" aria-label={`Detail layer ${layer.name}`} data-testid="layer-more-menu">
            <strong>Detail layer</strong>
            <dl><dt>Nama</dt><dd>{layer.name}</dd><dt>Penyimpanan</dt><dd>{status}</dd><dt>Koneksi</dt><dd>{isOnline ? "Online" : "Offline"}</dd><dt>Luas WGS84</dt><dd>{area === null ? "Belum tersedia" : formatUnit(area)}</dd>{metrics?.utm_sqm !== undefined && <><dt>UTM {metrics.utm_epsg}</dt><dd>{formatUnit(metrics.utm_sqm)}</dd></>}{metrics?.tm3_sqm !== undefined && <><dt>TM-3 {metrics.tm3_epsg}</dt><dd>{formatUnit(metrics.tm3_sqm)}</dd></>}<dt>Validasi</dt><dd>{validationCount === undefined ? "Belum diperiksa" : `${validationCount} temuan`}</dd></dl>
            <fieldset><legend>Tampilan</legend>
              <label>Warna layer<input type="color" aria-label="Warna layer" value={style.color} onChange={(event) => saveStyle({ ...style, color: event.target.value, fillColor: event.target.value })} /></label>
              <label>Opasitas isi ({Math.round((style.fillOpacity ?? 0.2) * 100)}%)<input type="range" aria-label="Opasitas isi" min={0} max={100} step={5} value={(style.fillOpacity ?? 0.2) * 100} onChange={(event) => saveStyle({ ...style, fillOpacity: Number(event.target.value) / 100 })} /></label>
              <label>Ketebalan garis<input type="number" min={1} max={10} value={style.weight} onChange={(event) => saveStyle({ ...style, weight: Math.min(10, Math.max(1, Number(event.target.value) || 1)) })} /></label>
            </fieldset>
            <fieldset><legend>Filter atribut</legend>{availableKeys.length ? <>
              <label>Kolom filter<select value={defField} onChange={(event) => setDefField(event.target.value)}><option value="">Pilih kolom</option>{availableKeys.map((key) => <option key={key}>{key}</option>)}</select></label>
              <label>Operator<select value={defOperator} onChange={(event) => setDefOperator(event.target.value)}>{["=", "!=", ">", "<", ">=", "<=", "LIKE"].map((operator) => <option key={operator}>{operator}</option>)}</select></label>
              <label>Nilai filter<input value={defValue} onChange={(event) => setDefValue(event.target.value)} /></label>
              <div className="layer-workspace-menu-actions"><button className="layer-workspace-menu-action" type="button" disabled={!defField || !defValue} onClick={() => saveStyle({ ...style, definition_query: { field: defField, operator: defOperator, value: defValue } })}>Terapkan filter</button><button className="layer-workspace-menu-action" type="button" disabled={!style.definition_query} onClick={() => { const next = { ...style }; delete next.definition_query; saveStyle(next); setDefField(""); setDefValue(""); }}>Reset filter</button></div>
            </> : <span>Belum ada kolom atribut yang tersedia.</span>}</fieldset>
            <fieldset><legend>Urutan & tindakan</legend><div className="layer-workspace-menu-actions"><button type="button" className="layer-workspace-menu-action" aria-label="Naikkan urutan layer" disabled={layers[0]?.id === layer.id} onClick={() => reorder(-1)}><ArrowUp size={14} />Naik</button><button type="button" className="layer-workspace-menu-action" aria-label="Turunkan urutan layer" disabled={layers[layers.length - 1]?.id === layer.id} onClick={() => reorder(1)}><ArrowDown size={14} />Turun</button><button type="button" className="layer-workspace-menu-action" aria-pressed={isPinned} onClick={() => setIsPinned(!isPinned)}><Pin size={14} />{isPinned ? "Lepas pin tindakan" : "Pin tindakan"}</button></div>
              <LayerExportButton layer={layer} geojson={geojson} />
              <button type="button" className="layer-workspace-menu-action" disabled={isGuest && !isLocal} onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Hapus layer</button>
              {isGuest && !isLocal && <span>Guest tidak dapat menghapus layer cloud.</span>}
              {confirmDelete && <div><p>Hapus {layer.name}? Tindakan ini tidak dapat dibatalkan.</p><div className="layer-workspace-menu-actions"><button type="button" className="layer-workspace-menu-action" onClick={onDelete}>Ya, hapus layer</button><button type="button" className="layer-workspace-menu-action" onClick={() => setConfirmDelete(false)}>Batal</button></div></div>}
            </fieldset>
          </PopoverContent>
        </Popover>
        {style.definition_query && <span className="layer-workspace-context-note">Filter aktif: {style.definition_query.field} {style.definition_query.operator} {style.definition_query.value}</span>}
      </div>}
    </article>
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
      <DownloadCloud className="w-3.5 h-3.5" />
      <span>Unduh</span>
      {hasResults && (
        <span className="flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full text-[8px] font-black bg-emerald-500 text-white ml-0.5">
          {results.length}
        </span>
      )}
    </button>
  );
}
