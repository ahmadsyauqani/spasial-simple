"use client";

import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileUp, RefreshCcw, Download, Trash2, Layers, MapPin } from "lucide-react";
import { SpatialConverter, SpatialFormat } from "@/lib/spatialConverter";
import { TM3_ZONES } from "@/lib/crs";

interface SpatialConverterProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpatialConverterModal({ isOpen, onClose }: SpatialConverterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<SpatialFormat>("shp");
  const [targetCrs, setTargetCrs] = useState<string>("EPSG:4326");
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleConvert = async () => {
    if (!file) {
      toast.error("Pilih file terlebih dahulu!");
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading("Sedang memproses konversi...");

    try {
      // 1. Parse to GeoJSON
      const geojson = await SpatialConverter.parseToGeoJSON(file);
      
      // 2. Transform if needed
      const transformed = SpatialConverter.transform(geojson, {
        targetCrs: targetCrs
      });

      // 3. Export to target format
      const blob = await SpatialConverter.export(transformed, targetFormat);

      // 4. Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
      a.href = url;
      a.download = `${baseName}_converted.${targetFormat === 'shp' ? 'zip' : targetFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Konversi berhasil!", { id: toastId });
      setFile(null);
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal: ${err.message}`, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] bg-slate-950/95 backdrop-blur-2xl border-slate-800 text-slate-100 shadow-[0_0_50px_-12px_rgba(16,185,129,0.15)] p-0 overflow-hidden">
        <div className="p-6 space-y-6">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <RefreshCcw className="w-6 h-6 text-emerald-400" />
                </div>
                Spatial Converter Studio
              </DialogTitle>
            </div>
            <DialogDescription className="text-slate-400 text-sm font-medium">
              Konversi format spasial antar SHP, KML, dan DXF dengan transformasi koordinat TM-3 Indonesia yang akurat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* File Upload Zone */}
            {!file ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="relative group overflow-hidden"
              >
                <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
                <div className="relative border-2 border-dashed border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 hover:border-emerald-500/40 hover:bg-emerald-500/[0.02] transition-all cursor-pointer">
                  <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:scale-110 group-hover:border-emerald-500/30 transition-all duration-500 shadow-xl">
                    <FileUp className="w-10 h-10 text-slate-500 group-hover:text-emerald-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-bold text-lg text-slate-200">Klik atau seret file ke sini</p>
                    <p className="text-xs text-slate-500 font-medium px-8 leading-relaxed">
                      Mendukung .zip (SHP), .kml, .dxf, .geojson. Pastikan file SHP dikompres dalam satu file .zip.
                    </p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".zip,.kml,.dxf,.json,.geojson"
                  />
                </div>
              </div>
            ) : (
              <Card className="bg-slate-900/40 border-slate-800 p-5 flex items-center justify-between gap-4 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner">
                    <Layers className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-100 truncate max-w-[250px]">
                      {file.name}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB &bull; Siap dikonversi
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFile(null)}
                  className="rounded-xl h-10 w-10 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </Card>
            )}

            {/* Settings Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                  Format Output
                </label>
                <div className="relative group">
                  <select
                    value={targetFormat}
                    onChange={(e) => setTargetFormat(e.target.value as SpatialFormat)}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 hover:border-slate-700 transition-all appearance-none cursor-pointer"
                  >
                    <option value="shp">ESRI Shapefile (.shp)</option>
                    <option value="kml">Keyhole Markup Language (.kml)</option>
                    <option value="dxf">AutoCAD Exchange (.dxf)</option>
                    <option value="geojson">GeoJSON (.json)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-emerald-400 transition-colors">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                  Transformasi Koordinat
                </label>
                <div className="relative group">
                  <select
                    value={targetCrs}
                    onChange={(e) => setTargetCrs(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 hover:border-slate-700 transition-all appearance-none cursor-pointer pr-10"
                  >
                    <optgroup label="Standar Internasional" className="bg-slate-950">
                      <option value="EPSG:4326">WGS 84 (Geografis)</option>
                      <option value="EPSG:3857">Web Mercator (Meter)</option>
                    </optgroup>
                    <optgroup label="WGS 84 / UTM (Utara)" className="bg-slate-950">
                      {[46, 47, 48, 49, 50, 51, 52, 53, 54].map(z => (
                        <option key={`utm-n-${z}`} value={`EPSG:${32600 + z}`}>
                          UTM Zone {z}N (EPSG:{32600 + z})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="WGS 84 / UTM (Selatan)" className="bg-slate-950">
                      {[46, 47, 48, 49, 50, 51, 52, 53, 54].map(z => (
                        <option key={`utm-s-${z}`} value={`EPSG:${32700 + z}`}>
                          UTM Zone {z}S (EPSG:{32700 + z})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="TM-3 Indonesia (BPN)" className="bg-slate-950">
                      {TM3_ZONES.map((z) => (
                        <option key={z.epsg} value={`EPSG:${z.epsg}`}>
                          TM-3 Zona {z.zone} (EPSG:{z.epsg})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-emerald-400 transition-colors">
                    <MapPin className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-emerald-500/[0.03] border border-emerald-500/10 rounded-2xl p-4 flex items-start gap-4">
              <div className="mt-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              </div>
              <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                Catatan: Konversi ke <span className="text-emerald-400 font-bold">SHP</span> akan menghasilkan file .zip. Untuk <span className="text-emerald-400 font-bold">DXF</span>, disarankan untuk tidak menggunakan data dengan jutaan titik koordinat agar performa browser tetap optimal.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/30 border-t border-slate-800 p-6 flex items-center justify-end gap-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-100 transition-all"
          >
            Batal
          </Button>
          <Button
            onClick={handleConvert}
            disabled={!file || isProcessing}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 px-8 h-12 rounded-xl font-bold shadow-lg shadow-emerald-500/10 transition-all active:scale-95 disabled:opacity-50"
          >
            {isProcessing ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Mulai Konversi
          </Button>
        </div>
      </DialogContent>
    </Dialog>

  );
}
