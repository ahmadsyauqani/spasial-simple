"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, ZoomControl, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import * as turf from "@turf/turf";
import { useMapContext, BASEMAP_OPTIONS, BasemapType } from "@/lib/MapContext";
import { Layers } from "lucide-react";

// Fix for default Leaflet markers in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { updateGeometryInSupabase } from "@/lib/database";
import { toast } from "sonner";

function MapController() {
  const map = useMap();
  const { activeFeatureToZoom, setMapViewState } = useMapContext();

  useEffect(() => {
    // Add Geoman controls for editing and snapping
    map.pm.addControls({
      position: 'topright',
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
      editMode: true,
      dragMode: false,
      removalMode: false,
    });
    
    // Global snap settings
    map.pm.setGlobalOptions({ snapDistance: 20, allowSelfIntersection: false });

    // Handle Edit event
    const handleEdit = async (e: any) => {
      const layer = e.layer;
      const db_id = layer.feature?.properties?.db_id;
      if (db_id) {
        try {
          const geojsonData = layer.toGeoJSON().geometry;
          await updateGeometryInSupabase(db_id, geojsonData);
          toast.success("Vertex berhasil disimpan secara permanen!");
        } catch (err: any) {
          toast.error("Gagal menyimpan vertex: " + err.message);
        }
      }
    };

    map.on('pm:edit', handleEdit);

    // Track map view state for Layout Composer
    const syncViewState = () => {
      const c = map.getCenter();
      setMapViewState({ center: [c.lat, c.lng], zoom: map.getZoom() });
    };
    map.on('moveend', syncViewState);
    map.on('zoomend', syncViewState);
    // Sync initial state
    syncViewState();

    return () => {
      map.pm.removeControls();
      map.off('pm:edit', handleEdit);
      map.off('moveend', syncViewState);
      map.off('zoomend', syncViewState);
    };
  }, [map, setMapViewState]);

  useEffect(() => {
    if (activeFeatureToZoom) {
      try {
        const bbox = turf.bbox(activeFeatureToZoom);
        map.flyToBounds([
          [bbox[1], bbox[0]], // SouthWest
          [bbox[3], bbox[2]], // NorthEast
        ], { padding: [50, 50], duration: 1.5 });
      } catch (e) {
        console.error("Gagal mendapatkan bbox:", e);
      }
    }
  }, [activeFeatureToZoom, map]);

  return null;
}

export default function MapArea() {
  const { activeFeatureToZoom, layers, activeBasemap, setActiveBasemap } = useMapContext();
  const currentBasemap = BASEMAP_OPTIONS[activeBasemap];

  return (
    <div className="w-full h-full bg-background absolute inset-0 z-0">
      {/* Basemap Selector UI */}
      <div className="absolute bottom-6 left-6 z-[1000] flex flex-col gap-2 group">
        <button className="bg-card text-card-foreground border rounded-full p-2.5 shadow-md hover:bg-muted transition-colors flex items-center justify-center">
          <Layers className="w-5 h-5 text-primary" />
        </button>
        <div className="absolute bottom-full left-0 mb-2 bg-card/95 backdrop-blur-md border rounded-xl p-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col gap-1 min-w-[150px]">
          <div className="text-xs font-bold text-muted-foreground px-2 py-1 uppercase tracking-wider mb-1">Peta Dasar</div>
          {(Object.keys(BASEMAP_OPTIONS) as BasemapType[]).map((key) => (
            <button
              key={key}
              onClick={() => setActiveBasemap(key)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeBasemap === key ? 'bg-primary/20 text-primary font-medium' : 'hover:bg-white/10 text-card-foreground'}`}
            >
              {BASEMAP_OPTIONS[key].name}
            </button>
          ))}
        </div>
      </div>

      <MapContainer
        center={[-0.789275, 113.921327]} // Center of Indonesia
        zoom={5}
        zoomControl={false}
        className="w-full h-full"
        style={{ background: "transparent" }}
      >
        <TileLayer
          key={activeBasemap}
          attribution={currentBasemap.attribution}
          url={currentBasemap.url}
          maxZoom={20}
        />
        <ZoomControl position="bottomright" />
        <MapController />
        
        {layers.map(layer => (
          <LayerFeature key={layer.id!} layer={layer} />
        ))}

        <OverlapLayer />
      </MapContainer>
    </div>
  );
}

// Komponen render hasil tumpang tindih di peta
function OverlapLayer() {
  const { overlapResult, areaUnit } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (overlapResult?.geojson) {
      try {
        const bounds = L.geoJSON(overlapResult.geojson).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch(e) {}
    }
  }, [overlapResult, map]);

  if (!overlapResult?.geojson) return null;

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const overlapStyle = {
    color: '#ef4444',
    fillColor: '#ef4444',
    fillOpacity: 0.45,
    weight: 3,
    dashArray: '8, 4'
  };

  const onEachOverlap = (feature: any, mapLayer: any) => {
    const areaSqm = turf.area(feature);
    let html = `<div class="p-2 min-w-[200px]">`;
    html += `<h4 class="font-bold text-base border-b border-red-400/30 pb-1 mb-2 text-red-300">⚠️ Area Tumpang Tindih</h4>`;
    html += `<div class="bg-red-900/30 p-2 rounded border border-red-500/20 text-xs mb-2">`;
    html += `<div class="flex justify-between mt-1"><span class="text-gray-300">WGS 84</span><span class="font-mono text-red-300 font-bold">${formatUnit(areaSqm)}</span></div>`;
    html += `<div class="flex justify-between mt-1"><span class="text-gray-300">UTM</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9992)}</span></div>`;
    html += `<div class="flex justify-between mt-1"><span class="text-gray-300">TM-3</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9998)}</span></div>`;
    html += `</div>`;
    html += `<div class="text-[10px] text-gray-400">${overlapResult.layerAName} ∩ ${overlapResult.layerBName}</div>`;
    html += `</div>`;
    mapLayer.bindPopup(html, { className: 'custom-popup-dark', maxWidth: 300 });
  };

  return (
    <GeoJSON
      data={overlapResult.geojson}
      key={`overlap-${Date.now()}`}
      style={() => overlapStyle}
      onEachFeature={onEachOverlap}
    />
  );
}

import { useState } from "react";
import { supabase } from "@/lib/supabase";

function LayerFeature({ layer }: { layer: any }) {
  const [featureCollection, setFeatureCollection] = useState<any>(null);
  const { setLayerArea, areaUnit, zoomToLayerId, triggerZoomToLayer, cacheLayerGeojson } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (zoomToLayerId === layer.id && featureCollection) {
      setTimeout(() => {
         try {
           const bounds = L.geoJSON(featureCollection).getBounds();
           if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
         } catch(e) {}
      }, 50);
      triggerZoomToLayer(null);
    }
  }, [zoomToLayerId, featureCollection, layer.id, map, triggerZoomToLayer]);

  useEffect(() => {
    // If the layer just got uploaded, it might have data temporarily.
    // Otherwise, we fetch it all from supabase.
    async function loadGeometry() {
      setFeatureCollection(null); // Paksa Leaflet menghapus peta lama selama loading
      const dissolveKey = layer.style?.dissolve_key;
      const { data, error } = await supabase.rpc('get_layer_feature_collection', {
        p_layer_id: layer.id,
        p_group_key: dissolveKey || 'none'
      });

      if (!error && data) {
        setFeatureCollection(data as any);
        cacheLayerGeojson(layer.id, data);
        // Menghitung Luas Area
        
        try {
          const areaSqMeters = turf.area(data as any);
          const wgs84_sqm = areaSqMeters;
          
          let utm_epsg = undefined;
          let tm3_epsg = undefined;
          let utm_sqm = undefined;
          let tm3_sqm = undefined;

          // Estimasi Planar Area berdasarkan Centroid untuk Proyeksi Lokal Indonesia
          try {
            const centroid = turf.centroid(data as any).geometry.coordinates; // [lng, lat]
            const lng = centroid[0];
            const lat = centroid[1];
            
            // UTM Zone Calculation (Universal)
            const utmZone = Math.floor((lng + 180) / 6) + 1;
            const isSouth = lat < 0;
            utm_epsg = `${isSouth ? 32700 + utmZone : 32600 + utmZone}`;
            utm_sqm = wgs84_sqm * 0.9992;
            
            // TM-3 Zone Calculation (Khusus ATR/BPN Indonesia)
            // CM Dasar Indonesia: Sabang 94.5 (EPSG:23826 Zone 46.1)
            const tm3Index = Math.round((lng - 94.5) / 3);
            if (tm3Index >= 0 && tm3Index <= 20) {
              tm3_epsg = `${23826 + tm3Index}`;
              tm3_sqm = wgs84_sqm * 0.9998;
            }
          } catch (internalE) {
             console.warn("Gagal kalkulasi centroid lokal", internalE);
          }

          setLayerArea(layer.id, {
            wgs84_sqm,
            utm_sqm,
            utm_epsg,
            tm3_sqm,
            tm3_epsg
          });
        } catch (e) {
          console.warn("Gagal menghitung luas Turf:", e);
        }
      } else if (error) {
        console.error("Fetch Geometry Error:", JSON.stringify(error, null, 2));
        toast.error("Gagal memuat geometri: " + (error.message || JSON.stringify(error)));
      }
    }
    
    loadGeometry();
  }, [layer.id, layer.style?.dissolve_key]); // areaUnit is intentionally excluded to prevent refetching geometry from SQL when unit changes

  if (!featureCollection) return null;

  const style = layer.style || { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2 };

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const onEachFeature = (feature: any, mapLayer: any) => {
    if (feature.properties) {
      
      // Hitung luas ruang poligon spesifik menggunakan Turf di tempat
      let localAreaHtml = "";
      try {
         const wgsSqM = turf.area(feature);
         
         // Kalau nilainya 0, ini berarti layer Titik (Point) atau Garis (LineString), bukan Area.
         if (wgsSqM > 1) { 
            let utmSqM = wgsSqM * 0.9992;
            let tm3SqM = wgsSqM * 0.9998;
             
            localAreaHtml += `
            <div class="mb-2 bg-black/40 p-2 text-xs rounded border border-primary/20">
              <span class="text-[10px] uppercase font-bold text-white/50 mb-1 block tracking-wider">📐 Area Poligon</span>
              <div class="flex justify-between items-center mt-1">
                 <span class="text-gray-300">WGS 84</span>
                 <span class="font-mono text-primary font-bold">${formatUnit(wgsSqM)}</span>
              </div>
              <div class="flex justify-between items-center mt-1">
                 <span class="text-gray-300">UTM Planar</span>
                 <span class="font-mono text-gray-100">${formatUnit(utmSqM)}</span>
              </div>
              <div class="flex justify-between items-center mt-1">
                 <span class="text-gray-300">BPN TM-3</span>
                 <span class="font-mono text-gray-100">${formatUnit(tm3SqM)}</span>
              </div>
            </div>`;
         }
      } catch(e) {}

      // Build an elegant HTML table for the properties
      let popupContent = `<div class="p-2 min-w-[200px] flex flex-col gap-2">`;
      popupContent += `<h4 class="font-bold text-base border-b border-white/20 pb-1 mb-1 text-white">Atribut Data</h4>`;
      popupContent += localAreaHtml;
      popupContent += `<div class="max-h-48 overflow-y-auto pr-2 text-sm">`;
      popupContent += `<table class="w-full text-left border-collapse"><tbody>`;
      for (const key in feature.properties) {
        if (key === "db_id" || key === "FID") continue; // Sembunyikan field internal
        const value = feature.properties[key];
        popupContent += `
          <tr class="border-b border-white/10 last:border-0 hover:bg-white/10 transition-colors">
            <td class="py-1.5 pr-3 font-medium text-gray-300 w-1/3 align-top">${key}</td>
            <td class="py-1.5 text-white font-mono break-words">${value === null ? "null" : value}</td>
          </tr>
        `;
      }
      
      popupContent += `</tbody></table></div></div>`;
      mapLayer.bindPopup(popupContent, {
        className: "custom-popup-dark",
        maxWidth: 300
      });

      // Efek Visual (Highlight) ketika di-klik / popup terbuka
      mapLayer.on('popupopen', (e: any) => {
        const layer = e.target;
        layer.setStyle({
          weight: 4,
          color: '#ffffff',
          fillOpacity: 0.6,
          dashArray: '5, 10'
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          layer.bringToFront();
        }
      });

      // Kembalikan seperti semula ketika popup ditutup
      mapLayer.on('popupclose', (e: any) => {
        e.target.setStyle(style);
      });
    }
  };

  return (
    <GeoJSON 
      data={featureCollection}
      key={`${layer.id}-${JSON.stringify(style)}-${areaUnit}`}
      style={() => style}
      onEachFeature={onEachFeature}
    />
  );
}
