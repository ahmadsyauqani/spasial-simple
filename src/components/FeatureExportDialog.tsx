"use client";

import { useEffect, useMemo, useState } from "react";
import { DownloadCloud, FileJson, FileText, Loader2, Map as MapIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROJECTIONS, reprojectCoords } from "./ExportLayerDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import * as turf from "@turf/turf";
import tokml from "tokml";

type ExportFormat = "geojson" | "kml" | "csv";
type ExportRequest = { feature: any; fileName: string } | null;

function download(content: BlobPart, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function FeatureExportDialogHost() {
  const [request, setRequest] = useState<ExportRequest>(null);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<ExportRequest>).detail;
      if (detail?.feature) setRequest(detail);
    };
    window.addEventListener("sakagis:export-feature", handle);
    return () => window.removeEventListener("sakagis:export-feature", handle);
  }, []);

  return <FeatureExportDialog request={request} onClose={() => setRequest(null)} />;
}

function FeatureExportDialog({ request, onClose }: { request: ExportRequest; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>("geojson");
  const [projection, setProjection] = useState("4326");
  const [customEpsg, setCustomEpsg] = useState("");
  const [fileName, setFileName] = useState("");
  const [includeInternal, setIncludeInternal] = useState(false);
  const [prettyJson, setPrettyJson] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (request) {
      setFormat("geojson");
      setProjection("4326");
      setCustomEpsg("");
      setFileName(request.fileName.replace(/\.[^/.]+$/, ""));
      setIncludeInternal(false);
      setPrettyJson(true);
    }
  }, [request]);

  const selectedProjection = useMemo(
    () => PROJECTIONS.flatMap((group) => group.items).find((item) => item.value === projection)?.label || "WGS 84 (EPSG:4326)",
    [projection]
  );

  const handleExport = async () => {
    if (!request) return;
    const code = projection === "custom" ? customEpsg.trim().replace(/^EPSG:/i, "") : projection;
    if (!code) {
      toast.error("Kode EPSG belum diisi.");
      return;
    }
    if (format === "kml" && code !== "4326") {
      toast.error("KML harus menggunakan WGS84/EPSG:4326.");
      return;
    }

    setIsExporting(true);
    try {
      const source = request.feature;
      const properties = { ...(source.properties || {}) };
      if (!includeInternal) {
        delete properties.db_id;
        delete properties.FID;
      }

      let targetProjection = "EPSG:4326";
      if (code !== "4326") {
        const response = await fetch(`https://epsg.io/${code}.proj4`);
        if (!response.ok) throw new Error(`EPSG:${code} tidak ditemukan.`);
        targetProjection = await response.text();
      }

      const geojson = {
        type: "Feature",
        properties,
        geometry: code === "4326" ? source.geometry : {
          ...source.geometry,
          coordinates: reprojectCoords(source.geometry.coordinates, "EPSG:4326", targetProjection),
        },
        ...(code !== "4326" ? { crs: { type: "name", properties: { name: `urn:ogc:def:crs:EPSG::${code}` } } } : {}),
      };

      const safeName = (fileName || "feature").replace(/[^a-z0-9_-]+/gi, "_");
      if (format === "geojson") {
        download(JSON.stringify(geojson, null, prettyJson ? 2 : 0), `${safeName}_EPSG${code}.geojson`, "application/geo+json");
      } else if (format === "kml") {
        download(tokml({ type: "FeatureCollection", features: [geojson] }), `${safeName}.kml`, "application/vnd.google-earth.kml+xml");
      } else {
        const centroid = turf.centroid(source).geometry.coordinates;
        const area = turf.area(source);
        const perimeter = source.geometry.type === "Polygon" || source.geometry.type === "MultiPolygon" ? turf.length(turf.polygonToLine(source), { units: "meters" }) : 0;
        const row = { ...properties, geometry_type: source.geometry.type, longitude: centroid[0], latitude: centroid[1], area_m2: area, perimeter_m: perimeter };
        const keys = Object.keys(row);
        const csvValue = (value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        download(`${keys.join(",")}\n${keys.map((key) => csvValue(row[key])).join(",")}\n`, `${safeName}.csv`, "text/csv;charset=utf-8");
      }
      toast.success("Fitur berhasil diekspor.");
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Gagal mengekspor fitur.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[88vh] overflow-y-auto bg-card/95 backdrop-blur-xl text-card-foreground border-border/50 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DownloadCloud className="h-5 w-5 text-cyan-400" /> Export Studio</DialogTitle>
          <DialogDescription>Export satu bidang dengan format, proyeksi, dan atribut sesuai kebutuhan.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            {([['geojson', 'GeoJSON', FileJson], ['kml', 'KML', MapIcon], ['csv', 'CSV', FileText]] as const).map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setFormat(key)} className={cn("flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-bold transition-all", format === key ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-300" : "border-border text-muted-foreground hover:bg-muted")}><Icon className="h-4 w-4" />{label}</button>)}
          </div>

          <div><label className="mb-1.5 block text-xs font-bold text-muted-foreground">Nama file</label><Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="nama_bidang" /></div>

          <div><label className="mb-1.5 block text-xs font-bold text-muted-foreground">Proyeksi output</label><select value={projection} onChange={(e) => setProjection(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-cyan-400"><option value="4326">WGS 84 (EPSG:4326) - Derajat Satelit Baku</option>{PROJECTIONS.slice(1).map((group) => <optgroup key={group.group} label={group.group}>{group.items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}</select></div>
          {projection === "custom" && <Input value={customEpsg} onChange={(e) => setCustomEpsg(e.target.value)} placeholder="Contoh: 32748" />}

          <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3 text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeInternal} onChange={(e) => setIncludeInternal(e.target.checked)} /> Sertakan field internal (db_id/FID)</label>
            {format === "geojson" && <label className="flex items-center gap-2"><input type="checkbox" checked={prettyJson} onChange={(e) => setPrettyJson(e.target.checked)} /> JSON rapi/terformat</label>}
            <div className="border-t border-border pt-2 text-muted-foreground">Format CSV otomatis menambahkan centroid, luas m², dan keliling meter.</div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button variant="ghost" onClick={onClose} disabled={isExporting}>Batal</Button><Button onClick={handleExport} disabled={isExporting} className="bg-cyan-600 text-white hover:bg-cyan-700">{isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}Export</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
