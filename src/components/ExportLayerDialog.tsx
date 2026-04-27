import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DownloadCloud, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import proj4 from "proj4";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const PROJECTIONS = [
  {
    group: "🌐 Standar Global",
    items: [
      { value: "4326", label: "WGS 84 (EPSG:4326) - Derajat Satelit Baku" },
      { value: "3857", label: "Web Mercator (EPSG:3857) - Google/OSM Murni" },
    ]
  },
  {
    group: "📍 UTM Indonesia",
    items: [
      { value: "32746", label: "UTM Zone 46S (EPSG:32746) - Sumatera Barat, Bengkulu" },
      { value: "32747", label: "UTM Zone 47S (EPSG:32747) - Sumatera Selatan, Lampung" },
      { value: "32748", label: "UTM Zone 48S (EPSG:32748) - DKI, Jabar, Jateng, Kalteng" },
      { value: "32749", label: "UTM Zone 49S (EPSG:32749) - Jatim, Bali, NTB, Kalsel" },
      { value: "32750", label: "UTM Zone 50S (EPSG:32750) - NTT, Sulsel, Sultra" },
      { value: "32751", label: "UTM Zone 51S (EPSG:32751) - Maluku, Timor" },
      { value: "32752", label: "UTM Zone 52S (EPSG:32752) - Papua Barat" },
      { value: "32753", label: "UTM Zone 53S (EPSG:32753) - Papua Tengah" },
      { value: "32754", label: "UTM Zone 54S (EPSG:32754) - Papua Timur Raya" },
    ]
  },
  {
    group: "🗺️ TM-3 Nasional (ATR/BPN)",
    items: [
      { value: "23830", label: "TM-3 Zone 48.1 (EPSG:23830) - Jabar Bag. Barat" },
      { value: "23831", label: "TM-3 Zone 48.2 (EPSG:23831) - Jabar Bag. Timur" },
      { value: "23832", label: "TM-3 Zone 49.1 (EPSG:23832) - Jatim Bag. Barat" },
      { value: "23833", label: "TM-3 Zone 49.2 (EPSG:23833) - Jatim Bag. Timur" },
      { value: "23834", label: "TM-3 Zone 50.1 (EPSG:23834) - Bali, Lombok" },
      { value: "23835", label: "TM-3 Zone 50.2 (EPSG:23835) - Sumbawa, Flores" },
    ]
  },
  {
    group: "⚙️ Lanjutan",
    items: [
      { value: "custom", label: "🔍 Masukkan Kode EPSG Manual..." },
    ]
  }
];

// Rekursif mengganti koordinat Array [long, lat]
export function reprojectCoords(coords: any[], fromProj: string, toProj: string): any[] {
  if (typeof coords[0] === 'number') {
    const p = proj4(fromProj, toProj, [coords[0], coords[1]]);
    return Array.from(p);
  }
  return coords.map(c => reprojectCoords(c, fromProj, toProj));
}

export function ExportLayerDialog({ layer }: { layer: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedProjection, setSelectedProjection] = useState("4326");
  const [customEpsg, setCustomEpsg] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const activeEpsg = selectedProjection === "custom" ? customEpsg : selectedProjection;
  const selectedLabel = PROJECTIONS.flatMap(g => g.items).find(i => i.value === selectedProjection)?.label;

  const handleExport = async () => {
    if (!activeEpsg) {
      toast.error("Kode EPSG tidak boleh kosong!");
      return;
    }
    setIsExporting(true);
    try {
      const code = activeEpsg.trim().replace(/^EPSG:/i, ''); 
      let targetProjConfig = "EPSG:4326";

      if (code !== "4326") {
        const projRes = await fetch(`https://epsg.io/${code}.proj4`);
        if (!projRes.ok) throw new Error(`Sistem Proyeksi Koordinat (EPSG:${code}) tidak ditemukan.`);
        targetProjConfig = await projRes.text();
      }

      toast.info("Sedang menarik & mencerna geometri layer...");
      
      const dissolveKey = layer.style?.dissolve_key;
      const { data, error } = await supabase.rpc('get_layer_feature_collection', {
        p_layer_id: layer.id,
        p_group_key: dissolveKey || 'none'
      });

      if (error) throw new Error("Gagal mengambil dataset: " + error.message);
      if (!data || !data.features) throw new Error("Dataset kosong.");

      let geojsonToExport = data;

      if (code !== "4326") {
        toast.info(`Mengkonversi koordinat ke EPSG:${code}...`);
        const reprojectedFeatures = data.features.map((feat: any) => {
          if (!feat.geometry || !feat.geometry.coordinates) return feat;
          try {
            return {
              ...feat,
              geometry: { ...feat.geometry, coordinates: reprojectCoords(feat.geometry.coordinates, "EPSG:4326", targetProjConfig) }
            };
          } catch (e) {
            return feat;
          }
        });
        
        geojsonToExport = { 
          ...data, 
          features: reprojectedFeatures,
          crs: {
            type: "name",
            properties: {
              name: `urn:ogc:def:crs:EPSG::${code}`
            }
          }
        };
      }

      const blob = new Blob([JSON.stringify(geojsonToExport, null, 2)], { type: "application/geo+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${layer.name}_EPSG_${code}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("File Peta berhasil dikonversi dan diunduh!");
      setIsOpen(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Gagal mengekspor data.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground outline-none transition-colors" title="Export & Unduh Peta">
        <DownloadCloud className="w-3.5 h-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DownloadCloud className="w-5 h-5 text-primary" />
            Export & Reprojection Studio
          </DialogTitle>
          <DialogDescription>
            Ubah proyeksi data Anda dari standar satelit (WGS84) menjadi format metrik teknis (UTM / TM-3 BPN) untuk keperluan pengukuran akurat.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-foreground">Sistem Proyeksi Koordinat</label>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger
                aria-expanded={popoverOpen}
                className="w-full flex justify-between items-center text-sm font-normal text-left truncate overflow-hidden h-10 px-3 py-2 rounded-md bg-background border border-border text-foreground hover:bg-accent hover:text-accent-foreground outline-none focus:ring-2 focus:ring-primary shadow-sm"
              >
                <span className="truncate">{selectedLabel || "Pilih Proyeksi..."}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[380px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cari Proyeksi... (Misal: 32748 atau Jabar)" />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>EPSG Code Kosong.</CommandEmpty>
                    {PROJECTIONS.map((group) => (
                      <CommandGroup key={group.group} heading={group.group}>
                        {group.items.map((item) => (
                          <CommandItem
                            key={item.value}
                            value={item.label} // Kita taruh isi di value supaya bisa diSearch lewat filter cmdk
                            onSelect={() => {
                              setSelectedProjection(item.value);
                              setPopoverOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedProjection === item.value ? "opacity-100" : "opacity-0"
                              )}
                            />
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
              <span className="text-[10px] text-muted-foreground">Parameter proyeksi akan ditarik otomatis dari satelit epsg.io</span>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isExporting}>
            Tutup
          </Button>
          <Button onClick={handleExport} disabled={isExporting || (!activeEpsg)} className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px]">
            {isExporting ? <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menghitung...</span> : <span className="flex items-center"><DownloadCloud className="w-4 h-4 mr-2" /> Konversi & Unduh</span>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
