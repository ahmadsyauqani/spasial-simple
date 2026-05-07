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
      <DialogContent className="sm:max-width-[600px] bg-slate-950/90 backdrop-blur-xl border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <RefreshCcw className="w-5 h-5 text-emerald-400" />
            Spatial Converter Studio
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Konversi format spasial (SHP, KML, DXF) dengan transformasi koordinat TM-3 Indonesia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Upload Zone */}
          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 rounded-xl p-10 flex flex-col items-center justify-center gap-4 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer group"
            >
              <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileUp className="w-8 h-8 text-slate-400 group-hover:text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="font-medium text-slate-200">Klik atau drag file ke sini</p>
                <p className="text-sm text-slate-500">Mendukung .zip (SHP), .kml, .dxf, .geojson</p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".zip,.kml,.dxf,.json,.geojson"
              />
            </div>
          ) : (
            <Card className="bg-slate-900/50 border-slate-800 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200 truncate max-w-[200px]">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFile(null)}
                className="text-slate-400 hover:text-rose-400"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </Card>
          )}

          {/* Settings Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Target Format
              </label>
              <select
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value as SpatialFormat)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="shp">ESRI Shapefile (.shp)</option>
                <option value="kml">Keyhole Markup Language (.kml)</option>
                <option value="dxf">AutoCAD Exchange (.dxf)</option>
                <option value="geojson">GeoJSON (.json)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Transformasi Koordinat
              </label>
              <select
                value={targetCrs}
                onChange={(e) => setTargetCrs(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <optgroup label="Standar">
                  <option value="EPSG:4326">WGS 84 (Geografis)</option>
                  <option value="EPSG:3857">Web Mercator (Meter)</option>
                </optgroup>
                <optgroup label="TM-3 Indonesia">
                  {TM3_ZONES.map((z) => (
                    <option key={z.epsg} value={`EPSG:${z.epsg}`}>
                      TM-3 Zona {z.zone} (EPSG:{z.epsg})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 flex items-start gap-3">
            <MapPin className="w-4 h-4 text-emerald-400 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              Konversi ke **SHP** akan menghasilkan file .zip. Untuk **DXF**, disarankan untuk tidak menggunakan data dengan jutaan titik agar browser tetap responsif.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100"
          >
            Batal
          </Button>
          <Button
            onClick={handleConvert}
            disabled={!file || isProcessing}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 px-6"
          >
            {isProcessing ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Proses & Unduh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
