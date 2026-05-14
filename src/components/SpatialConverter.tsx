"use client";

import React, { useState, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileUp, RefreshCcw, Download, Trash2, Layers, MapPin, ArrowRightLeft } from "lucide-react";
import { SpatialConverter, SpatialFormat } from "@/lib/spatialConverter";
import { TM3_ZONES } from "@/lib/crs";
import { cn } from "@/lib/utils";

interface SpatialConverterProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpatialConverterModal({ isOpen, onClose }: SpatialConverterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<SpatialFormat>("shp");
  const [targetCrs, setTargetCrs] = useState<string>("EPSG:4326");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
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
      const geojson = await SpatialConverter.parseToGeoJSON(file);
      const transformed = SpatialConverter.transform(geojson, { targetCrs });
      const blob = await SpatialConverter.export(transformed, targetFormat);

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
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border border-border/50 bg-card/95 backdrop-blur-2xl shadow-2xl rounded-2xl [&>button]:hidden">

        {/* ── Accent line top ── */}
        <div className="h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/60 to-transparent" />

        {/* ── Header ── */}
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
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* ── Deskripsi ── */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Konversi format spasial antar <span className="text-orange-400 font-bold">SHP</span>, <span className="text-orange-400 font-bold">KML</span>, <span className="text-orange-400 font-bold">DXF</span>, dan <span className="text-orange-400 font-bold">GeoPackage</span> dengan transformasi koordinat TM-3 Indonesia yang akurat.
          </p>

          {/* ── File Upload Zone ── */}
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 py-10",
                isDragging
                  ? "border-orange-500/60 bg-orange-500/8 scale-[1.01]"
                  : "border-border/40 hover:border-orange-500/40 hover:bg-orange-500/[0.03]"
              )}
            >
              <div className={cn(
                "w-16 h-16 rounded-2xl border flex items-center justify-center transition-all duration-300 shadow-lg",
                isDragging
                  ? "bg-orange-500/20 border-orange-500/40 scale-110"
                  : "bg-muted/50 border-border/30 group-hover:bg-orange-500/10 group-hover:border-orange-500/30 group-hover:scale-105"
              )}>
                <FileUp className={cn(
                  "w-8 h-8 transition-colors duration-300",
                  isDragging ? "text-orange-400" : "text-muted-foreground group-hover:text-orange-400"
                )} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-foreground">
                  {isDragging ? "Lepaskan file di sini!" : "Klik atau seret file ke sini"}
                </p>
                <p className="text-[11px] text-muted-foreground font-medium leading-relaxed max-w-xs mx-auto">
                  Mendukung .zip (SHP), .kml, .dxf, .gpkg, .geojson<br />
                  Pastikan file SHP dikompres dalam satu file .zip
                </p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".zip,.kml,.dxf,.json,.geojson,.gpkg"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-orange-500/8 border border-orange-500/20">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-orange-500/15 border border-orange-500/20 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground truncate max-w-[260px]">{file.name}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-500/70 mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB · Siap dikonversi
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFile(null)}
                className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Format & CRS Settings ── */}
          <div className="grid grid-cols-2 gap-4">
            {/* Format Output */}
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                Format Output
              </label>
              <div className="relative">
                <select
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value as SpatialFormat)}
                  className="w-full bg-muted/40 border border-border/50 rounded-xl px-3.5 py-3 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 hover:border-border transition-all appearance-none cursor-pointer"
                >
                  <option value="shp">ESRI Shapefile (.shp)</option>
                  <option value="kml">Keyhole Markup Language (.kml)</option>
                  <option value="dxf">AutoCAD Exchange (.dxf)</option>
                  <option value="geojson">GeoJSON (.json)</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            {/* Transformasi Koordinat */}
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />
                Transformasi Koordinat
              </label>
              <div className="relative">
                <select
                  value={targetCrs}
                  onChange={(e) => setTargetCrs(e.target.value)}
                  className="w-full bg-muted/40 border border-border/50 rounded-xl px-3.5 py-3 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 hover:border-border transition-all appearance-none cursor-pointer pr-8"
                >
                  <optgroup label="Standar Internasional">
                    <option value="EPSG:4326">WGS 84 (Geografis)</option>
                    <option value="EPSG:3857">Web Mercator (Meter)</option>
                  </optgroup>
                  <optgroup label="WGS 84 / UTM (Utara)">
                    {[46, 47, 48, 49, 50, 51, 52, 53, 54].map(z => (
                      <option key={`utm-n-${z}`} value={`EPSG:${32600 + z}`}>
                        UTM Zone {z}N (EPSG:{32600 + z})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="WGS 84 / UTM (Selatan)">
                    {[46, 47, 48, 49, 50, 51, 52, 53, 54].map(z => (
                      <option key={`utm-s-${z}`} value={`EPSG:${32700 + z}`}>
                        UTM Zone {z}S (EPSG:{32700 + z})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="TM-3 Indonesia (BPN)">
                    {TM3_ZONES.map((z) => (
                      <option key={z.epsg} value={`EPSG:${z.epsg}`}>
                        TM-3 Zona {z.zone} (EPSG:{z.epsg})
                      </option>
                    ))}
                  </optgroup>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
          </div>

          {/* ── Info note ── */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/30 border border-border/30">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Konversi ke <span className="text-orange-400 font-bold">SHP</span> menghasilkan file .zip. Untuk <span className="text-orange-400 font-bold">DXF</span>, hindari data dengan jutaan titik koordinat agar performa browser tetap optimal.
            </p>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/20 bg-black/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleConvert}
            disabled={!file || isProcessing}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95",
              !file || isProcessing
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20"
            )}
          >
            {isProcessing ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isProcessing ? "Memproses..." : "Mulai Konversi"}
          </button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
