"use client";

import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileUp, RefreshCcw, Download, Trash2, Layers, MapPin, ArrowRightLeft, CheckCircle2, Map as MapIcon, ChevronLeft } from "lucide-react";
import { SpatialConverter, SpatialFormat } from "@/lib/spatialConverter";
import { TM3_ZONES } from "@/lib/crs";
import { cn } from "@/lib/utils";
import { useMapContext } from "@/lib/MapContext";

interface SpatialConverterProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpatialConverterModal({ isOpen, onClose }: SpatialConverterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<SpatialFormat>("shp");
  const [targetCrs, setTargetCrs] = useState<string>("EPSG:4326");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<"upload" | "converting" | "success">("upload");
  const [progress, setProgress] = useState(0);
  const [convertedBlobUrl, setConvertedBlobUrl] = useState<string | null>(null);
  const [convertedFileName, setConvertedFileName] = useState<string>("");
  const [convertedGeojson, setConvertedGeojson] = useState<any>(null);
  const [detectedCrs, setDetectedCrs] = useState<string | null>(null);
  const [isDetectingCrs, setIsDetectingCrs] = useState(false);

  const { setLayers, triggerZoomToLayer } = useMapContext();

  useEffect(() => {
    if (!isOpen) {
      if (convertedBlobUrl) URL.revokeObjectURL(convertedBlobUrl);
      setTimeout(() => {
        setStep("upload");
        setFile(null);
        setDetectedCrs(null);
        setProgress(0);
        setConvertedBlobUrl(null);
        setConvertedGeojson(null);
      }, 300);
    }
  }, [isOpen]);

  const validateFile = (file: File) => {
    const validExtensions = ['.zip', '.kml', '.dxf', '.json', '.geojson', '.gpkg'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(extension)) {
      toast.error(`Format ${extension} tidak didukung!`, {
        description: "Gunakan file .zip (SHP), .kml, .dxf, .gpkg, atau .geojson",
      });
      return false;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Ukuran file terlalu besar!", {
        description: "Maksimal ukuran file adalah 50MB",
      });
      return false;
    }
    
    toast.success("File siap dikonversi!", {
      description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
    });
    return true;
  };

  const detectCrs = async (fileToDetect: File) => {
    setIsDetectingCrs(true);
    setDetectedCrs(null);
    try {
      const ext = fileToDetect.name.substring(fileToDetect.name.lastIndexOf('.')).toLowerCase();
      if (ext === '.kml' || ext === '.json' || ext === '.geojson') {
        setDetectedCrs("WGS 84 (EPSG:4326)");
      } else if (ext === '.zip') {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(fileToDetect);
        const prjFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.prj') && !f.includes('MACOSX'));
        
        if (prjFiles.length > 0) {
          const prjContent = await zip.files[prjFiles[0]].async("string");
          if (prjContent.includes('WGS_1984_UTM_Zone_')) {
            const zoneMatch = prjContent.match(/Zone_(\d+)([NS])/);
            if (zoneMatch) setDetectedCrs(`UTM Zona ${zoneMatch[1]}${zoneMatch[2]} (WGS 84)`);
            else setDetectedCrs("UTM (WGS 84)");
          } else if (prjContent.includes('GCS_WGS_1984') || prjContent.includes('WGS 84')) {
            setDetectedCrs("WGS 84 (Geografis)");
          } else if (prjContent.includes('DGN_1995') || prjContent.includes('TM3') || prjContent.includes('TM-3')) {
            setDetectedCrs("TM-3 Indonesia");
          } else {
             const nameMatch = prjContent.match(/PROJCS\["([^"]+)"/);
             if (nameMatch) setDetectedCrs(nameMatch[1]);
             else setDetectedCrs("Custom Projection");
          }
        } else {
          setDetectedCrs("Tidak ada file .prj");
        }
      } else {
        setDetectedCrs("Tidak diketahui (Bawaan)");
      }
    } catch (e) {
      console.error(e);
      setDetectedCrs("Gagal membaca CRS");
    } finally {
      setIsDetectingCrs(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
        detectCrs(selectedFile);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selectedFile = e.dataTransfer.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
        detectCrs(selectedFile);
      }
    }
  };

  const handleConvert = async () => {
    if (!file) {
      toast.error("Pilih file terlebih dahulu!");
      return;
    }

    setStep("converting");
    setProgress(5);
    
    const progressInterval = setInterval(() => {
      setProgress(p => p < 60 ? p + Math.random() * 15 : p);
    }, 400);

    try {
      const geojson = await SpatialConverter.parseToGeoJSON(file);
      setProgress(65);
      
      const transformed = SpatialConverter.transform(geojson, { targetCrs });
      setProgress(85);
      
      const blob = await SpatialConverter.export(transformed, targetFormat);
      clearInterval(progressInterval);
      setProgress(100);

      const url = URL.createObjectURL(blob);
      const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
      
      setConvertedBlobUrl(url);
      setConvertedFileName(`${baseName}_converted.${targetFormat === 'shp' ? 'zip' : targetFormat}`);
      setConvertedGeojson(transformed);

      setTimeout(() => {
        setStep("success");
      }, 600);

    } catch (err: any) {
      console.error(err);
      clearInterval(progressInterval);
      toast.error(`Gagal: ${err.message}`);
      setStep("upload");
    }
  };

  const handlePreview = () => {
    if (!convertedGeojson) return;
    const newId = `preview-${Date.now()}`;
    const nameStr = `[Preview] ${convertedFileName}`;
    
    setLayers(prev => [...prev, {
      id: newId,
      name: nameStr,
      data: convertedGeojson,
      style: { color: "#f97316", fillColor: "#f97316", fillOpacity: 0.2, weight: 2 }
    }]);
    
    triggerZoomToLayer(newId);
    onClose();
    toast.success("File berhasil ditampilkan di peta!");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border border-border/50 bg-card/95 backdrop-blur-2xl shadow-2xl rounded-2xl [&>button]:hidden">
        <div className="h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/60 to-transparent" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/15 border border-orange-500/20 shadow-inner">
              <ArrowRightLeft className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-foreground">
                Spatial Converter Studio
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-500/70">
                Format & Koordinat Transform
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all">✕</button>
        </div>

        {step === "upload" && (
          <>
            <div className="px-6 py-5 space-y-5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Konversi format spasial antar <span className="text-orange-400 font-bold">SHP</span>, <span className="text-orange-400 font-bold">KML</span>, <span className="text-orange-400 font-bold">DXF</span>, dan <span className="text-orange-400 font-bold">GeoPackage</span> dengan transformasi koordinat TM-3 Indonesia yang akurat.
              </p>

              {!file ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 py-10",
                    isDragging ? "border-orange-500/60 bg-orange-500/8 scale-[1.01]" : "border-border/40 hover:border-orange-500/40 hover:bg-orange-500/[0.03]"
                  )}
                >
                  <div className={cn("w-16 h-16 rounded-2xl border flex items-center justify-center transition-all duration-300 shadow-lg", isDragging ? "bg-orange-500/20 border-orange-500/40 scale-110" : "bg-muted/50 border-border/30 group-hover:bg-orange-500/10 group-hover:border-orange-500/30 group-hover:scale-105")}>
                    <FileUp className={cn("w-8 h-8 transition-colors duration-300", isDragging ? "text-orange-400" : "text-muted-foreground group-hover:text-orange-400")} />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-bold text-foreground">{isDragging ? "Lepaskan file di sini!" : "Klik atau seret file ke sini"}</p>
                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed max-w-xs mx-auto">Mendukung .zip (SHP), .kml, .dxf, .gpkg, .geojson<br />Pastikan file SHP dikompres dalam satu file .zip</p>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".zip,.kml,.dxf,.json,.geojson,.gpkg" />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-orange-500/8 border border-orange-500/20">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-orange-500/15 border border-orange-500/20 flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground truncate max-w-[260px]">{file.name}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-orange-500/70 mt-0.5 flex items-center gap-1.5">
                        {(file.size / 1024).toFixed(1)} KB
                        <span className="text-orange-500/30">•</span>
                        <span className="text-orange-400">{isDetectingCrs ? <span className="animate-pulse">Mendeteksi CRS...</span> : (detectedCrs || "Siap dikonversi")}</span>
                      </p>
                    </div>
                  </div>
                  <button onClick={() => { setFile(null); setDetectedCrs(null); }} className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5"><Layers className="w-3 h-3" />Format Output</label>
                  <select value={targetFormat} onChange={(e) => setTargetFormat(e.target.value as SpatialFormat)} className="w-full bg-muted/40 border border-border/50 rounded-xl px-3.5 py-3 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 hover:border-border transition-all appearance-none cursor-pointer">
                    <option value="shp">ESRI Shapefile (.shp)</option>
                    <option value="kml">Keyhole Markup Language (.kml)</option>
                    <option value="dxf">AutoCAD Exchange (.dxf)</option>
                    <option value="geojson">GeoJSON (.json)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3 h-3" />Transformasi Koordinat</label>
                  <select value={targetCrs} onChange={(e) => setTargetCrs(e.target.value)} className="w-full bg-muted/40 border border-border/50 rounded-xl px-3.5 py-3 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 hover:border-border transition-all appearance-none cursor-pointer">
                    <optgroup label="Standar Internasional">
                      <option value="EPSG:4326">WGS 84 (Geografis)</option>
                      <option value="EPSG:3857">Web Mercator (Meter)</option>
                    </optgroup>
                    <optgroup label="TM-3 Indonesia (BPN)">
                      {TM3_ZONES.map((z) => <option key={z.epsg} value={`EPSG:${z.epsg}`}>TM-3 Zona {z.zone} (EPSG:{z.epsg})</option>)}
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/20 bg-black/10">
              <button onClick={onClose} className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Batal</button>
              <button onClick={handleConvert} disabled={!file} className={cn("flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95", !file ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20")}>
                <RefreshCcw className="w-4 h-4" /> Mulai Konversi
              </button>
            </div>
          </>
        )}

        {step === "converting" && (
          <div className="px-6 py-16 flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-muted flex items-center justify-center">
                <RefreshCcw className="w-8 h-8 text-orange-500 animate-spin" />
              </div>
              <div className="absolute inset-0 border-4 border-orange-500 rounded-full animate-ping opacity-20" />
            </div>
            <div className="text-center space-y-2 w-full max-w-xs">
              <h3 className="text-lg font-bold text-foreground">Sedang Memproses...</h3>
              <div className="w-full h-2 bg-muted rounded-full mt-4 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-300 ease-out" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
              </div>
              <p className="text-[10px] font-bold text-orange-500/80 mt-1">{Math.round(progress)}% Selesai</p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="px-6 py-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.2)] border border-emerald-500/30">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-black text-foreground tracking-tight mb-2">Konversi Selesai!</h3>
              <p className="text-sm text-muted-foreground mb-6">File Anda berhasil dikonversi ke format <span className="font-bold text-white uppercase">{targetFormat}</span>.</p>
              <div className="w-full p-4 rounded-xl bg-black/20 border border-border/50 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 overflow-hidden">
                  <Layers className="w-6 h-6 text-emerald-500 shrink-0" />
                  <div className="text-left truncate">
                    <p className="text-xs font-bold text-foreground truncate">{convertedFileName}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Siap diunduh</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 px-6 py-4 border-t border-border/20 bg-black/10 mt-auto">
              <button onClick={() => setStep("upload")} className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl transition-colors flex items-center justify-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Konversi Lagi
              </button>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {convertedBlobUrl && (
                  <a href={convertedBlobUrl} download={convertedFileName} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-muted text-foreground hover:bg-muted/80 transition-all border border-border/50">
                    <Download className="w-4 h-4" /> Unduh
                  </a>
                )}
                <button onClick={handlePreview} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20 transition-all active:scale-95">
                  <MapIcon className="w-4 h-4" /> Lihat di Peta
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
