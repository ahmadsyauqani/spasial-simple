"use client";

import { useState, useEffect, useRef } from "react";
import { useMapContext } from "@/lib/MapContext";
import { FileUp, Map as MapIcon, X, Eye, EyeOff, Trash2, Sliders, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as pdfjs from "pdfjs-dist";
import { 
  getOrCreateDefaultProject, uploadPdfImage, savePdfOverlay, 
  fetchPdfOverlays, deletePdfOverlayFromSupabase, updatePdfOverlaySettings 
} from "@/lib/database";

// Set worker source for pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export function PdfOverlayPanel() {
  const { pdfOverlays, setPdfOverlays, mapInstance } = useMapContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPdfOverlays()
      .then(data => setPdfOverlays(data))
      .catch(err => console.error("Error loading PDF overlays:", err));
  }, []);

  // Temporary state for georeferencing
  const [pendingOverlay, setPendingOverlay] = useState<{ url: string, name: string } | null>(null);
  const [bounds, setBounds] = useState({
    swLat: "", swLng: "",
    neLat: "", neLng: ""
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Hanya file PDF yang didukung");
      return;
    }

    try {
      setIsProcessing(true);
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await (page as any).render({ canvasContext: context, viewport }).promise;
        const imageUrl = canvas.toDataURL("image/png");
        setPendingOverlay({ url: imageUrl, name: file.name });
        toast.success("PDF berhasil di-render. Silakan masukkan koordinat.");
      }
    } catch (err: any) {
      toast.error("Gagal membaca PDF: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const addOverlay = async () => {
    if (!pendingOverlay) return;
    
    const sw = [parseFloat(bounds.swLat), parseFloat(bounds.swLng)];
    const ne = [parseFloat(bounds.neLat), parseFloat(bounds.neLng)];

    if (sw.some(isNaN) || ne.some(isNaN)) {
      toast.error("Koordinat tidak valid");
      return;
    }

    try {
      setIsSaving(true);
      toast.info("Sedang mengunggah gambar peta ke storage...");
      
      const project = await getOrCreateDefaultProject();
      const fileId = `pdf-${Date.now()}`;
      
      // 1. Upload image to Storage
      const publicUrl = await uploadPdfImage(fileId, pendingOverlay.url);
      
      const newOverlayData = {
        name: pendingOverlay.name,
        url: publicUrl,
        bounds: [sw, ne],
        visible: true,
        opacity: 0.7
      };

      // 2. Save to DB
      const savedOverlay = await savePdfOverlay(project.id, newOverlayData);

      setPdfOverlays([...pdfOverlays, savedOverlay]);
      setPendingOverlay(null);
      setBounds({ swLat: "", swLng: "", neLat: "", neLng: "" });
      toast.success("Peta PDF berhasil dipasang dan tersimpan!");

      if (mapInstance) {
        mapInstance.fitBounds(savedOverlay.bounds as any);
      }
    } catch (err: any) {
      toast.error("Gagal menyimpan overlay: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const removeOverlay = async (id: string) => {
    try {
      await deletePdfOverlayFromSupabase(id);
      setPdfOverlays(pdfOverlays.filter(o => o.id !== id));
      toast.info("Overlay dihapus");
    } catch (err: any) {
      toast.error("Gagal menghapus: " + err.message);
    }
  };

  const toggleVisibility = async (id: string) => {
    const overlay = pdfOverlays.find(o => o.id === id);
    if (!overlay) return;
    
    const newVisible = !overlay.visible;
    setPdfOverlays(pdfOverlays.map(o => 
      o.id === id ? { ...o, visible: newVisible } : o
    ));
    
    await updatePdfOverlaySettings(id, { visible: newVisible });
  };

  const updateOpacity = async (id: string, opacity: number) => {
    setPdfOverlays(pdfOverlays.map(o => 
      o.id === id ? { ...o, opacity } : o
    ));
  };

  const handleOpacityCommit = async (id: string, opacity: number) => {
    await updatePdfOverlaySettings(id, { opacity });
  };

  return (
    <div className="bg-muted/30 text-gray-200 border border-border/50 rounded-xl overflow-hidden transition-all duration-300">
      {/* Header */}
      <div 
        className="bg-muted/50 px-3 py-2.5 border-b border-border/50 flex items-center justify-between cursor-pointer hover:bg-muted transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 bg-indigo-500/20 rounded-md">
            <MapIcon className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-foreground">PDF Map Overlay</h2>
        </div>
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180 text-indigo-400' : ''}`} />
      </div>

      {isExpanded && (
        <div className="p-4 space-y-5 animate-in slide-in-from-top-4 duration-300">
          
          {/* Upload Section */}
          {!pendingOverlay ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all group"
            >
              <div className="p-4 bg-white/5 rounded-full group-hover:scale-110 transition-transform">
                {isProcessing ? <FileUp className="w-8 h-8 text-indigo-400 animate-bounce" /> : <FileUp className="w-8 h-8 text-gray-600 group-hover:text-indigo-400" />}
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-gray-300">Upload Peta PDF</p>
                <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">GeoPDF / Scan Peta</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="space-y-5 animate-in zoom-in-95 duration-300">
               <div className="bg-indigo-500/10 p-4 rounded-xl border border-indigo-500/20">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Peta Terdeteksi</p>
                  <p className="text-xs text-white font-bold truncate">{pendingOverlay.name}</p>
               </div>

               <div className="space-y-4">
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">Georeferensi (Bounding Box)</label>
                  
                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1.5">
                        <span className="text-[8px] text-gray-500 uppercase font-bold ml-1">SW Latitude</span>
                        <input 
                          type="number" placeholder="-6.123" 
                          className="w-full bg-[#2a2d31] border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={bounds.swLat} onChange={e => setBounds({...bounds, swLat: e.target.value})}
                        />
                     </div>
                     <div className="space-y-1.5">
                        <span className="text-[8px] text-gray-500 uppercase font-bold ml-1">SW Longitude</span>
                        <input 
                          type="number" placeholder="106.123" 
                          className="w-full bg-[#2a2d31] border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={bounds.swLng} onChange={e => setBounds({...bounds, swLng: e.target.value})}
                        />
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1.5">
                        <span className="text-[8px] text-gray-500 uppercase font-bold ml-1">NE Latitude</span>
                        <input 
                          type="number" placeholder="-6.000" 
                          className="w-full bg-[#2a2d31] border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={bounds.neLat} onChange={e => setBounds({...bounds, neLat: e.target.value})}
                        />
                     </div>
                     <div className="space-y-1.5">
                        <span className="text-[8px] text-gray-500 uppercase font-bold ml-1">NE Longitude</span>
                        <input 
                          type="number" placeholder="106.300" 
                          className="w-full bg-[#2a2d31] border border-white/5 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={bounds.neLng} onChange={e => setBounds({...bounds, neLng: e.target.value})}
                        />
                     </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                     <button 
                       onClick={() => setPendingOverlay(null)}
                       className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-400 text-[10px] font-black uppercase hover:bg-white/10 transition-all"
                     >
                        Batal
                     </button>
                     <button 
                       onClick={addOverlay}
                       disabled={isSaving}
                       className="flex-[2] py-2.5 rounded-xl bg-indigo-500 text-white text-[10px] font-black uppercase shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
                     >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {isSaving ? "Menyimpan..." : "Pasang di Peta"}
                     </button>
                  </div>
               </div>
            </div>
          )}

          {/* Overlay List */}
          {pdfOverlays.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-white/5">
               <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block ml-1">Active Overlays</label>
               <div className="space-y-2.5">
                  {pdfOverlays.map(overlay => (
                    <div key={overlay.id} className="bg-[#212327] border border-white/5 rounded-xl p-3 space-y-3 group">
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 max-w-[150px]">
                             <MapIcon className="w-3 h-3 text-indigo-400 shrink-0" />
                             <span className="text-xs font-bold text-gray-200 truncate">{overlay.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                             <button onClick={() => toggleVisibility(overlay.id)} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all">
                                {overlay.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                             </button>
                             <button onClick={() => removeOverlay(overlay.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                             </button>
                          </div>
                       </div>
                       
                       <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[8px] text-gray-500 uppercase font-bold tracking-tighter">
                             <div className="flex items-center gap-1">
                                <Sliders className="w-2.5 h-2.5" />
                                <span>Opacity</span>
                             </div>
                             <span>{Math.round(overlay.opacity * 100)}%</span>
                          </div>
                          <input 
                            type="range" min="0" max="1" step="0.1"
                            value={overlay.opacity}
                            onChange={(e) => updateOpacity(overlay.id, parseFloat(e.target.value))}
                            onMouseUp={() => handleOpacityCommit(overlay.id, overlay.opacity)}
                            onTouchEnd={() => handleOpacityCommit(overlay.id, overlay.opacity)}
                            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
