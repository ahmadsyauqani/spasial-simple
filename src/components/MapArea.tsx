"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, ZoomControl, GeoJSON, CircleMarker, Circle, Marker, useMap, ImageOverlay, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import * as turf from "@turf/turf";
import proj4 from "proj4";
import { useMapContext, BASEMAP_OPTIONS, BasemapType } from "@/lib/MapContext";
import { Layers, LocateFixed, Loader2, Lock, Unlock, Magnet, MousePointer2, Settings2, Crosshair, Activity, Maximize, Compass, Ruler, Square } from "lucide-react";
import { createOfflineTileLayer } from "@/lib/OfflineTileLayer";
import { OfflineMapManager } from "./OfflineMapManager";

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
  const { 
    activeFeatureToZoom, setMapViewState, 
    activeDigitizingLayerId, layerGeojsonCache, 
    cacheLayerGeojson, setLayers, setMapInstance 
  } = useMapContext();

  useEffect(() => {
    setMapInstance(map);
    return () => setMapInstance(null);
  }, [map, setMapInstance]);

  const activeDigitizingLayerIdRef = useRef(activeDigitizingLayerId);
  useEffect(() => { activeDigitizingLayerIdRef.current = activeDigitizingLayerId; }, [activeDigitizingLayerId]);

  const cacheRef = useRef(layerGeojsonCache);
  useEffect(() => { cacheRef.current = layerGeojsonCache; }, [layerGeojsonCache]);

  useEffect(() => {
    // Add Geoman controls for editing and snapping
    map.pm.addControls({
      position: 'topright',
      drawMarker: true,
      drawPolygon: true,
      drawPolyline: true,
      drawCircleMarker: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
      editMode: true,
      dragMode: false,
      removalMode: true,
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

    const handleCreate = (e: any) => {
      const { layer } = e;
      const activeId = activeDigitizingLayerIdRef.current;
      if (activeId) {
        const fc = { ...cacheRef.current[activeId] };
        if (fc) {
          const newFeature = layer.toGeoJSON();
          newFeature.properties = {};
          fc.features.push(newFeature);
          cacheLayerGeojson(activeId, fc);
          setLayers(prev => [...prev]);
          layer.remove();
          toast.success("Fitur berhasil ditambahkan ke layer!");
        }
      }
    };

    map.on('pm:edit', handleEdit);
    map.on('pm:create', handleCreate);

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
      map.off('pm:create', handleCreate);
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

function TileLayerWithOffline({ url, attribution }: { url: string, attribution: string }) {
  const map = useMap();
  
  useEffect(() => {
    const layer = createOfflineTileLayer(url, {
      attribution,
      maxZoom: 20,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, url, attribution]);

  return null;
}

export default function MapArea() {
  const { 
    activeFeatureToZoom, layers, activeBasemap, setActiveBasemap, pdfOverlays,
    isTracking, trackingPath
  } = useMapContext();
  const currentBasemap = BASEMAP_OPTIONS[activeBasemap];
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationActive, setLocationActive] = useState(false);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Browser Anda tidak mendukung Geolocation.");
      return;
    }

    // If already active, toggle off
    if (locationActive && userLocation) {
      setLocationActive(false);
      setUserLocation(null);
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setUserLocation(loc);
        setLocationActive(true);
        setIsLocating(false);
        toast.success(
          `Lokasi ditemukan! ${loc.lat.toFixed(6)}°, ${loc.lng.toFixed(6)}° (±${Math.round(loc.accuracy)}m)`,
          { duration: 4000 }
        );
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error("Akses lokasi ditolak. Harap izinkan akses lokasi di pengaturan browser Anda.");
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Informasi lokasi tidak tersedia.");
            break;
          case error.TIMEOUT:
            toast.error("Permintaan lokasi timeout. Silakan coba lagi.");
            break;
          default:
            toast.error("Gagal mendapatkan lokasi: " + error.message);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, [locationActive, userLocation]);

  return (
    <div className="w-full h-full bg-background absolute inset-0 z-0">
      {/* Bottom-left controls: Basemap + My Location (Moved to clear sidebar) */}
      <div 
        className="absolute bottom-28 sm:bottom-6 left-4 sm:left-[340px] flex items-end gap-2 transition-all duration-300"
        style={{ zIndex: 9999 }}
      >
        {/* Basemap Selector */}
        <div className="flex flex-col gap-2 group">
          <button className="bg-card/70 backdrop-blur-xl text-card-foreground border border-border/50 rounded-full p-2.5 shadow-2xl hover:bg-muted/80 transition-colors flex items-center justify-center">
            <Layers className="w-5 h-5 text-primary" />
          </button>
          <div className="absolute bottom-full left-0 mb-3 bg-card/70 backdrop-blur-xl border border-border/50 rounded-xl p-1.5 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col gap-0.5 min-w-[140px]">
            <div className="text-[9px] font-black text-muted-foreground px-2 py-1 uppercase tracking-widest mb-1 opacity-50">Peta Dasar</div>
            {(Object.keys(BASEMAP_OPTIONS) as BasemapType[]).map((key) => (
              <button
                key={key}
                onClick={() => setActiveBasemap(key)}
                className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeBasemap === key ? 'bg-primary/20 text-primary' : 'hover:bg-muted/80 text-card-foreground/80 hover:text-card-foreground'}`}
              >
                {BASEMAP_OPTIONS[key].name}
              </button>
            ))}
          </div>
        </div>

        {/* My Location Button */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          className={`bg-card/70 backdrop-blur-xl text-card-foreground border border-border/50 rounded-full p-2.5 shadow-2xl transition-all flex items-center justify-center ${
            isLocating
              ? 'animate-pulse border-blue-500/50'
              : locationActive
                ? 'border-blue-500/70 bg-blue-500/15 shadow-blue-500/20 shadow-lg'
                : 'hover:bg-muted/80'
          }`}
          title={locationActive ? "Nonaktifkan lokasi" : "Temukan lokasi saya"}
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          ) : (
            <LocateFixed className={`w-5 h-5 transition-colors ${locationActive ? 'text-blue-400' : 'text-primary'}`} />
          )}
        </button>

        {/* Offline Map Manager */}
        <OfflineMapManager />
      </div>

      <MapContainer
        center={[-0.789275, 113.921327]} // Center of Indonesia
        zoom={5}
        zoomControl={false}
        className="w-full h-full"
        style={{ background: "transparent" }}
      >
        <TileLayerWithOffline 
          key={activeBasemap}
          url={currentBasemap.url} 
          attribution={currentBasemap.attribution} 
        />
        <ZoomControl position="bottomright" />
        <MapController />
        
        {layers.map(layer => (
          <LayerFeature key={layer.id!} layer={layer} />
        ))}

        <OverlapLayer />
        <ClipLayer />
        <MergeLayer />
        <BufferLayer />
        <UnionLayer />
        <DissolveLayer />
        <SpatialJoinLayer />
        <SearchResultMarker />

        {/* User Location Marker */}
        {userLocation && locationActive && (
          <LocationMarker location={userLocation} />
        )}
        
        {/* PDF Map Overlays (Avenza-style) */}
        {pdfOverlays.map(overlay => overlay.visible && (
          <ImageOverlay
            key={overlay.id}
            url={overlay.url}
            bounds={overlay.bounds as any}
            opacity={overlay.opacity || 0.7}
            zIndex={100}
            className={`${overlay.blendMode === 'multiply' ? 'mix-blend-multiply' : ''} pdf-overlay-image`}
            // Use CSS transform for rotation and scale
            {...({ style: { 
              transform: `rotate(${overlay.rotation || 0}deg) scale(${overlay.scale || 1})`,
              clipPath: overlay.margins ? `inset(${overlay.margins.top}% ${overlay.margins.right}% ${overlay.margins.bottom}% ${overlay.margins.left}%)` : 'none'
            } } as any)}
          />
        ))}

        {/* GPS Tracking Path */}
        {trackingPath.length > 1 && (
          <Polyline 
            positions={trackingPath} 
            pathOptions={{ 
              color: '#6366f1', 
              weight: 4, 
              opacity: 0.8,
              dashArray: '10, 10'
            }} 
          />
        )}
        
        {/* Tracking Current Position Marker */}
        {isTracking && trackingPath.length > 0 && (
          <CircleMarker 
            center={trackingPath[trackingPath.length - 1]} 
            radius={6}
            pathOptions={{ 
              color: 'white', 
              fillColor: '#6366f1', 
              fillOpacity: 1, 
              weight: 2 
            }}
          >
            <Popup>Lokasi Anda Sekarang</Popup>
          </CircleMarker>
        )}

        <PdfEditMarkers />
        <CursorCoordinates />
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

// Komponen render hasil clip di peta
function ClipLayer() {
  const { clipResult, areaUnit } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (clipResult?.geojson) {
      try {
        const bounds = L.geoJSON(clipResult.geojson).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch(e) {}
    }
  }, [clipResult, map]);

  if (!clipResult?.geojson) return null;

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const clipStyle = {
    color: '#10b981',
    fillColor: '#10b981',
    fillOpacity: 0.4,
    weight: 2.5,
    dashArray: '6, 3'
  };

  const onEachClip = (feature: any, mapLayer: any) => {
    const areaSqm = turf.area(feature);
    let html = `<div class="p-2 min-w-[200px]">`;
    html += `<h4 class="font-bold text-base border-b border-emerald-400/30 pb-1 mb-2 text-emerald-300">✂️ Hasil Clip</h4>`;
    
    if (areaSqm > 1) {
      html += `<div class="bg-emerald-900/30 p-2 rounded border border-emerald-500/20 text-xs mb-2">`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">WGS 84</span><span class="font-mono text-emerald-300 font-bold">${formatUnit(areaSqm)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">UTM</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9992)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">TM-3</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9998)}</span></div>`;
      html += `</div>`;
    }

    // Tampilkan properti input layer
    if (feature.properties) {
      html += `<div class="max-h-32 overflow-y-auto text-xs">`;
      html += `<table class="w-full text-left border-collapse"><tbody>`;
      for (const key in feature.properties) {
        if (key === "db_id" || key === "FID") continue;
        const value = feature.properties[key];
        html += `<tr class="border-b border-white/10 last:border-0"><td class="py-1 pr-2 font-medium text-gray-300 w-1/3">${key}</td><td class="py-1 text-white font-mono">${value === null ? "null" : value}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }

    html += `<div class="text-[10px] text-gray-400 mt-2">${clipResult.inputLayerName} ✂️ ${clipResult.clipLayerName}</div>`;
    html += `</div>`;
    mapLayer.bindPopup(html, { className: 'custom-popup-dark', maxWidth: 300 });
  };

  return (
    <GeoJSON
      data={clipResult.geojson}
      key={`clip-${Date.now()}`}
      style={() => clipStyle}
      onEachFeature={onEachClip}
    />
  );
}

// Komponen render hasil merge di peta
function MergeLayer() {
  const { mergeResult, areaUnit } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (mergeResult?.geojson) {
      try {
        const bounds = L.geoJSON(mergeResult.geojson).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch(e) {}
    }
  }, [mergeResult, map]);

  if (!mergeResult?.geojson) return null;

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const mergeStyle = {
    color: '#8b5cf6',
    fillColor: '#8b5cf6',
    fillOpacity: 0.35,
    weight: 2,
  };

  const onEachMerge = (feature: any, mapLayer: any) => {
    const areaSqm = turf.area(feature);
    let html = `<div class="p-2 min-w-[200px]">`;
    html += `<h4 class="font-bold text-base border-b border-violet-400/30 pb-1 mb-2 text-violet-300">🔗 Merged Feature</h4>`;

    if (feature.properties?._source_layer) {
      html += `<div class="text-[10px] text-violet-400 mb-2">Asal: <span class="font-mono font-bold">${feature.properties._source_layer}</span></div>`;
    }

    if (areaSqm > 1) {
      html += `<div class="bg-violet-900/30 p-2 rounded border border-violet-500/20 text-xs mb-2">`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">WGS 84</span><span class="font-mono text-violet-300 font-bold">${formatUnit(areaSqm)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">UTM</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9992)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">TM-3</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9998)}</span></div>`;
      html += `</div>`;
    }

    if (feature.properties) {
      html += `<div class="max-h-32 overflow-y-auto text-xs">`;
      html += `<table class="w-full text-left border-collapse"><tbody>`;
      for (const key in feature.properties) {
        if (key === "db_id" || key === "FID") continue;
        const value = feature.properties[key];
        const isSource = key === '_source_layer';
        html += `<tr class="border-b border-white/10 last:border-0"><td class="py-1 pr-2 font-medium ${isSource ? 'text-violet-400' : 'text-gray-300'} w-1/3">${key}</td><td class="py-1 text-white font-mono">${value === null ? '<span class="text-white/20 italic">null</span>' : value}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }

    html += `</div>`;
    mapLayer.bindPopup(html, { className: 'custom-popup-dark', maxWidth: 300 });
  };

  return (
    <GeoJSON
      data={mergeResult.geojson}
      key={`merge-${Date.now()}`}
      style={() => mergeStyle}
      onEachFeature={onEachMerge}
    />
  );
}

// Komponen render hasil Buffer di peta
function BufferLayer() {
  const { bufferResult, areaUnit } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (bufferResult?.geojson) {
      try {
        const bounds = L.geoJSON(bufferResult.geojson).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch(e) {}
    }
  }, [bufferResult, map]);

  if (!bufferResult?.geojson) return null;

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const bufferStyle = {
    color: '#0ea5e9',
    fillColor: '#0ea5e9',
    fillOpacity: 0.3,
    weight: 2,
    dashArray: '5, 5'
  };

  const onEachBuffer = (feature: any, mapLayer: any) => {
    const areaSqm = turf.area(feature);
    let html = `<div class="p-2 min-w-[200px]">`;
    html += `<h4 class="font-bold text-base border-b border-sky-400/30 pb-1 mb-2 text-sky-300">🎯 Zona Buffer</h4>`;
    html += `<div class="text-[10px] text-sky-400 mb-2">Jarak: <span class="font-mono font-bold">${bufferResult.distance} ${bufferResult.unit}</span></div>`;

    if (areaSqm > 1) {
      html += `<div class="bg-sky-900/30 p-2 rounded border border-sky-500/20 text-xs mb-2">`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">WGS 84</span><span class="font-mono text-sky-300 font-bold">${formatUnit(areaSqm)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">UTM</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9992)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">TM-3</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9998)}</span></div>`;
      html += `</div>`;
    }

    html += `<div class="text-[10px] text-gray-400 mt-1">Source: ${bufferResult.inputLayerName}</div>`;
    html += `</div>`;
    mapLayer.bindPopup(html, { className: 'custom-popup-dark', maxWidth: 300 });
  };

  return (
    <GeoJSON
      data={bufferResult.geojson}
      key={`buffer-${Date.now()}`}
      style={() => bufferStyle}
      onEachFeature={onEachBuffer}
    />
  );
}

// Komponen render hasil Union di peta
function UnionLayer() {
  const { unionResult, areaUnit } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (unionResult?.geojson) {
      try {
        const bounds = L.geoJSON(unionResult.geojson).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch(e) {}
    }
  }, [unionResult, map]);

  if (!unionResult?.geojson) return null;

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const unionStyle = {
    color: '#f59e0b',
    fillColor: '#f59e0b',
    fillOpacity: 0.4,
    weight: 2,
  };

  const onEachUnion = (feature: any, mapLayer: any) => {
    const areaSqm = turf.area(feature);
    let html = `<div class="p-2 min-w-[200px]">`;
    html += `<h4 class="font-bold text-base border-b border-amber-400/30 pb-1 mb-2 text-amber-300">🧩 Hasil Union</h4>`;

    if (areaSqm > 1) {
      html += `<div class="bg-amber-900/30 p-2 rounded border border-amber-500/20 text-xs mb-2">`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">WGS 84</span><span class="font-mono text-amber-300 font-bold">${formatUnit(areaSqm)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">UTM</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9992)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">TM-3</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9998)}</span></div>`;
      html += `</div>`;
    }

    if (feature.properties) {
      html += `<div class="max-h-32 overflow-y-auto text-xs">`;
      html += `<table class="w-full text-left border-collapse"><tbody>`;
      for (const key in feature.properties) {
        if (key === "db_id" || key === "FID") continue;
        const value = feature.properties[key];
        html += `<tr class="border-b border-white/10 last:border-0"><td class="py-1 pr-2 font-medium text-gray-300 w-1/3">${key}</td><td class="py-1 text-white font-mono">${value === null ? '<span class="text-white/20 italic">null</span>' : value}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }

    html += `</div>`;
    mapLayer.bindPopup(html, { className: 'custom-popup-dark', maxWidth: 300 });
  };

  return (
    <GeoJSON
      data={unionResult.geojson}
      key={`union-${Date.now()}`}
      style={() => unionStyle}
      onEachFeature={onEachUnion}
    />
  );
}

// Komponen render hasil Dissolve di peta
function DissolveLayer() {
  const { dissolveResult, areaUnit } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (dissolveResult?.geojson) {
      try {
        const bounds = L.geoJSON(dissolveResult.geojson).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch(e) {}
    }
  }, [dissolveResult, map]);

  if (!dissolveResult?.geojson) return null;

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const dissolveStyle = {
    color: '#d946ef',
    fillColor: '#d946ef',
    fillOpacity: 0.35,
    weight: 2.5,
  };

  const onEachDissolve = (feature: any, mapLayer: any) => {
    const areaSqm = turf.area(feature);
    let html = `<div class="p-2 min-w-[200px]">`;
    html += `<h4 class="font-bold text-base border-b border-fuchsia-400/30 pb-1 mb-2 text-fuchsia-300">🌫️ Hasil Dissolve</h4>`;

    if (dissolveResult.dissolveProperty) {
      html += `<div class="text-[10px] text-fuchsia-400 mb-2">Berdasarkan: <span class="font-mono font-bold">${dissolveResult.dissolveProperty}</span></div>`;
    }

    if (areaSqm > 1) {
      html += `<div class="bg-fuchsia-900/30 p-2 rounded border border-fuchsia-500/20 text-xs mb-2">`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">WGS 84</span><span class="font-mono text-fuchsia-300 font-bold">${formatUnit(areaSqm)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">UTM</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9992)}</span></div>`;
      html += `<div class="flex justify-between mt-1"><span class="text-gray-300">TM-3</span><span class="font-mono text-gray-100">${formatUnit(areaSqm * 0.9998)}</span></div>`;
      html += `</div>`;
    }

    if (feature.properties) {
      html += `<div class="max-h-32 overflow-y-auto text-xs">`;
      html += `<table class="w-full text-left border-collapse"><tbody>`;
      for (const key in feature.properties) {
        if (key === "db_id" || key === "FID") continue;
        const value = feature.properties[key];
        html += `<tr class="border-b border-white/10 last:border-0"><td class="py-1 pr-2 font-medium text-gray-300 w-1/3">${key}</td><td class="py-1 text-white font-mono">${value === null ? '<span class="text-white/20 italic">null</span>' : value}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }

    html += `</div>`;
    mapLayer.bindPopup(html, { className: 'custom-popup-dark', maxWidth: 300 });
  };

  return (
    <GeoJSON
      data={dissolveResult.geojson}
      key={`dissolve-${Date.now()}`}
      style={() => dissolveStyle}
      onEachFeature={onEachDissolve}
    />
  );
}

import { supabase } from "@/lib/supabase";

// ──────────────────────────────────────────────────────
// LOCATION MARKER — Pulsing blue dot with accuracy circle
// ──────────────────────────────────────────────────────
function LocationMarker({ location }: { location: { lat: number; lng: number; accuracy: number } }) {
  const map = useMap();

  // Fly to location on mount
  useEffect(() => {
    map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), 16), { duration: 1.5 });
  }, [location.lat, location.lng, map]);

  const pulsingIcon = L.divIcon({
    html: `<div class="my-location-dot">
             <div class="my-location-dot-core"></div>
             <div class="my-location-dot-pulse"></div>
           </div>`,
    className: 'my-location-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  return (
    <>
      {/* Accuracy circle */}
      <Circle
        center={[location.lat, location.lng]}
        radius={location.accuracy}
        pathOptions={{
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.08,
          weight: 1.5,
          dashArray: '6, 4',
          opacity: 0.4,
        }}
        interactive={false}
      />
      {/* Pulsing dot */}
      <Marker
        position={[location.lat, location.lng]}
        icon={pulsingIcon}
        interactive={false}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────
// PDF EDIT MARKERS — Draggable handles for georeferencing
// ──────────────────────────────────────────────────────
function PdfEditMarkers() {
  const { editingPdfId, pdfOverlays, updatePdfOverlayBounds } = useMapContext();
  
  if (!editingPdfId) return null;
  
  const overlay = pdfOverlays.find(o => o.id === editingPdfId);
  if (!overlay) return null;

  const [sw, ne] = overlay.bounds;

  const handleDragSW = (e: any) => {
    const newPos = e.target.getLatLng();
    updatePdfOverlayBounds(editingPdfId, [[newPos.lat, newPos.lng], ne]);
  };

  const handleDragNE = (e: any) => {
    const newPos = e.target.getLatLng();
    updatePdfOverlayBounds(editingPdfId, [sw, [newPos.lat, newPos.lng]]);
  };

  return (
    <>
      <Marker 
        position={sw as any} 
        draggable={true} 
        eventHandlers={{ drag: handleDragSW }}
        icon={L.divIcon({
          html: '<div class="w-4 h-4 bg-red-500 border-2 border-white rounded-full shadow-lg"></div>',
          className: '',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        })}
      />
      <Marker 
        position={ne as any} 
        draggable={true} 
        eventHandlers={{ drag: handleDragNE }}
        icon={L.divIcon({
          html: '<div class="w-4 h-4 bg-green-500 border-2 border-white rounded-full shadow-lg"></div>',
          className: '',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        })}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────
// CURSOR COORDINATES — Real-time display of cursor position
// ──────────────────────────────────────────────────────
function CursorCoordinates() {
  const map = useMap();
  const { 
    layers, layerGeojsonCache, 
    isTracking, trackingPath,
    setActiveDigitizingLayerId, areaUnit
  } = useMapContext();
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isSnapEnabled, setIsSnapEnabled] = useState(false);
  const [snapPoint, setSnapPoint] = useState<{lat: number, lng: number} | null>(null);
  const [zoom, setZoom] = useState(13); // Default safely
  const [scale, setScale] = useState(0);
  
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureType, setMeasureType] = useState<'distance' | 'area'>('distance');

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const formatLength = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} km`;
    return `${meters.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m`;
  };

  const calculateScale = (z: number, l: number) => {
    const metersPerPixel = 156543.03392 * Math.cos(l * Math.PI / 180) / Math.pow(2, z);
    const rawScale = Math.round(metersPerPixel / 0.00026);
    
    // Standard professional scales list
    const standardScales = [
      10, 20, 50, 100, 200, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 
      100000, 200000, 250000, 500000, 1000000, 2000000, 2500000, 5000000, 10000000
    ];

    // Find nearest standard scale
    const nearest = standardScales.reduce((prev, curr) => {
      return (Math.abs(curr - rawScale) < Math.abs(prev - rawScale) ? curr : prev);
    });

    return nearest;
  };
  
  const isLockedRef = useRef(isLocked);
  const isSnapEnabledRef = useRef(isSnapEnabled);

  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    isSnapEnabledRef.current = isSnapEnabled;
  }, [isSnapEnabled]);

  useEffect(() => {
    const handleZoom = () => {
      setZoom(map.getZoom());
      setScale(calculateScale(map.getZoom(), map.getCenter().lat));
    };

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      // Update scale on move just in case center changed
      setScale(calculateScale(map.getZoom(), map.getCenter().lat));
      if (isLockedRef.current) return;

      let targetLatLng = e.latlng;
      let currentSnap: {lat: number, lng: number} | null = null;

      if (isSnapEnabledRef.current) {
        let minDistance = Infinity;
        const snapThreshold = 25; // pixels (increased for easier snapping)
        const cursorPoint = map.latLngToContainerPoint(e.latlng);

        layers.forEach((layer) => {
          const fc = layerGeojsonCache[layer.id || ""];
          if (!fc) return;

          // Optimization: Check bounds first if available
          try {
             // For large FCs, we could use a spatial index, but turf.coordEach is okay for medium data
             turf.coordEach(fc, (coord) => {
               const latLng = L.latLng(coord[1], coord[0]);
               
               // Quick bounding box check in pixels to avoid expensive distanceTo for far points
               const p = map.latLngToContainerPoint(latLng);
               if (Math.abs(p.x - cursorPoint.x) < snapThreshold && Math.abs(p.y - cursorPoint.y) < snapThreshold) {
                 const dist = p.distanceTo(cursorPoint);
                 if (dist < minDistance && dist < snapThreshold) {
                   minDistance = dist;
                   currentSnap = { lat: latLng.lat, lng: latLng.lng };
                 }
               }
             });
          } catch(err) {}
        });

        if (currentSnap) {
          const s = currentSnap as { lat: number, lng: number };
          targetLatLng = L.latLng(s.lat, s.lng);
        }
      }

      setSnapPoint(currentSnap);
      setCoords(targetLatLng);
    };
    
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      setCoords(e.latlng);
      setIsLocked(true);
    };
    
    // Set initial coords to center
    setCoords(map.getCenter());
    
    map.on('mousemove', handleMouseMove);
    map.on('click', handleMapClick);
    map.on('zoomend', handleZoom);
    handleZoom(); // Initial calculation

    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('click', handleMapClick);
      map.off('zoomend', handleZoom);
    };
  }, [map, layers, layerGeojsonCache]);

  useEffect(() => {
    if (!isMeasuring) return;

    const handleMeasureCreate = (e: any) => {
      const { layer } = e;
      const geojson = layer.toGeoJSON();
      toast.info(`Tipe Geometri: ${geojson.geometry.type}`, { id: "measure-debug" });
      
      if (measureType === 'distance') {
        try {
          const coords = geojson.geometry.coordinates;
          let lengthM = 0;
          for (let i = 0; i < coords.length - 1; i++) {
            lengthM += turf.distance(turf.point(coords[i]), turf.point(coords[i+1]), { units: 'meters' });
          }
          toast.success(`Panjang: ${formatLength(lengthM)}`, { id: "measure", duration: 5000 });
        } catch (err: any) {
          console.error("Gagal menghitung panjang:", err);
          toast.error("Gagal menghitung panjang", { id: "measure" });
        }
      } else {
        try {
          const area = turf.area(geojson);
          let perimeterM = 0;
          try {
            const coords = geojson.geometry.coordinates[0]; // Exterior ring for polygon
            for (let i = 0; i < coords.length - 1; i++) {
              perimeterM += turf.distance(turf.point(coords[i]), turf.point(coords[i+1]), { units: 'meters' });
            }
          } catch(err) {
            console.warn("Gagal menghitung keliling:", err);
          }
          toast.success(`Luas: ${formatUnit(area)} | Keliling: ${formatLength(perimeterM)}`, { id: "measure", duration: 5000 });
        } catch (err: any) {
          console.error("Gagal menghitung luas:", err);
          toast.error("Gagal menghitung luas", { id: "measure" });
        }
      }
      
      setTimeout(() => {
        layer.remove();
      }, 2000);
      
      setIsMeasuring(false);
      try { map.pm.disableDraw(); } catch(e) {}
    };

    map.on('pm:create', handleMeasureCreate);
    return () => {
      map.off('pm:create', handleMeasureCreate);
    };
  }, [map, isMeasuring, measureType, areaUnit]);

  const handleUnlock = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLocked(false);
  };

  if (!coords) return null;

  const { lat, lng } = coords;

  const toDMS = (coord: number, isLat: boolean) => {
    const absolute = Math.abs(coord);
    const degrees = Math.floor(absolute);
    const minutes = Math.floor((absolute - degrees) * 60);
    const seconds = Math.max(0, (absolute - degrees - minutes / 60) * 3600);
    const direction = isLat ? (coord >= 0 ? "N" : "S") : (coord >= 0 ? "E" : "W");
    
    const pMinutes = minutes.toString().padStart(2, '0');
    const pSeconds = seconds.toFixed(2).padStart(5, '0');
    
    return `${degrees}° ${pMinutes}' ${pSeconds}" ${direction}`;
  };

  // Removed single string wgs84 to use separate Lat/Lng display for better alignment

  const utmZone = Math.floor((lng + 180) / 6) + 1;
  const isSouth = lat < 0;
  const utmProjString = `+proj=utm +zone=${utmZone} ${isSouth ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;
  let utmResult = { x: 0, y: 0 };
  let tm3Result = { x: 0, y: 0 };
  let tm3ZoneDisplay = "-";

  try {
    const utmCoords = proj4('WGS84', utmProjString, [lng, lat]);
    utmResult = { x: utmCoords[0], y: utmCoords[1] };
  } catch (e) {}

  const tm3Index = Math.round((lng - 94.5) / 3);
  if (tm3Index >= 0 && tm3Index <= 20) {
    const cm = 94.5 + (tm3Index * 3);
    const tm3ProjString = `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
    try {
      const tm3Coords = proj4('WGS84', tm3ProjString, [lng, lat]);
      tm3Result = { x: tm3Coords[0], y: tm3Coords[1] };
      const baseZone = 46 + Math.floor((tm3Index + 1) / 2);
      const subZone = (tm3Index % 2 === 0) ? 2 : 1;
      tm3ZoneDisplay = `Zona ${baseZone}-${subZone}`;
    } catch (e) {}
  }

  const customIcon = L.divIcon({
    html: `
      <div class="flex items-center justify-center">
        <div class="w-8 h-8 bg-primary/30 rounded-full animate-ping absolute"></div>
        <div class="w-4 h-4 bg-primary border-2 border-white rounded-full shadow-lg z-10"></div>
      </div>
    `,
    className: 'custom-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  return (
    <>
      {isSnapEnabled && snapPoint && !isLocked && (
        <CircleMarker 
          center={[snapPoint.lat, snapPoint.lng]} 
          radius={6} 
          pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.6, weight: 2 }}
        />
      )}
      {isLocked && coords && (
        <Marker position={[coords.lat, coords.lng]} icon={customIcon} />
      )}
      {/* ── Coordinate Bar ── */}
      <div className={`absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-[400] w-[calc(100vw-2rem)] sm:w-auto ${isLocked ? 'bg-primary/80 border-primary/50 shadow-primary/20' : 'bg-slate-950/85 border-white/[0.06]'} backdrop-blur-2xl border rounded-2xl px-4 py-2.5 shadow-2xl flex items-center gap-3 text-[10px] sm:text-xs select-none transition-all duration-300 pointer-events-auto`}>

        {/* Tool Buttons — Inline */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            onClick={() => setIsSnapEnabled(!isSnapEnabled)}
            className={`p-2 rounded-xl transition-all duration-200 ${isSnapEnabled ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/40' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
            title={isSnapEnabled ? "Matikan Snap" : "Aktifkan Snap ke Vertex"}
          >
            <Magnet className="w-3.5 h-3.5" />
          </button>

          <button 
            onClick={() => {
              if (isMeasuring && measureType === 'distance') {
                try { map.pm.disableDraw(); } catch(e) {}
                setIsMeasuring(false);
              } else {
                setActiveDigitizingLayerId(null);
                setIsMeasuring(true);
                setMeasureType('distance');
                try {
                  map.pm.enableDraw('Line', { snappable: isSnapEnabled, finishOn: 'dblclick' });
                } catch(e) {
                  console.warn('Geoman enableDraw fallback:', e);
                  try { map.pm.enableDraw('Polyline', { snappable: isSnapEnabled, finishOn: 'dblclick' }); } catch(e2) {}
                }
                toast.info("Mode Ukur Jarak Aktif. Klik di peta. Double-click untuk selesai.", { id: "measure-info" });
              }
            }}
            className={`px-2.5 py-1.5 rounded-xl transition-all duration-200 flex items-center gap-1.5 ${isMeasuring && measureType === 'distance' ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
            title={isMeasuring && measureType === 'distance' ? "Batal Ukur" : "Ukur Jarak (Panjang)"}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span className="text-[9px] font-bold uppercase tracking-wide hidden sm:inline">Jarak</span>
          </button>

          <button 
            onClick={() => {
              if (isMeasuring && measureType === 'area') {
                try { map.pm.disableDraw(); } catch(e) {}
                setIsMeasuring(false);
              } else {
                setActiveDigitizingLayerId(null);
                setIsMeasuring(true);
                setMeasureType('area');
                try {
                  map.pm.enableDraw('Polygon', { snappable: isSnapEnabled, finishOn: 'dblclick' });
                } catch(e) {
                  console.warn('Geoman enableDraw Polygon error:', e);
                }
                toast.info("Mode Ukur Luas Aktif. Klik di peta. Double-click untuk selesai.", { id: "measure-info" });
              }
            }}
            className={`px-2.5 py-1.5 rounded-xl transition-all duration-200 flex items-center gap-1.5 ${isMeasuring && measureType === 'area' ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' : 'text-white/30 hover:text-white/60 hover:bg-white/5'}`}
            title={isMeasuring && measureType === 'area' ? "Batal Ukur" : "Ukur Luas & Keliling"}
          >
            <Square className="w-3.5 h-3.5" />
            <span className="text-[9px] font-bold uppercase tracking-wide hidden sm:inline">Luas</span>
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10 shrink-0"></div>

        {/* Scale & Zoom */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-center">
            <span className="text-[7px] text-white/25 uppercase font-black tracking-widest leading-none">Scale</span>
            <span className="font-mono font-black text-white/80 text-[11px] leading-tight">1:{new Intl.NumberFormat('id-ID').format(scale)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[7px] text-white/25 uppercase font-black tracking-widest leading-none">Zoom</span>
            <span className="font-mono font-black text-indigo-400 text-[11px] leading-tight">{zoom}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10 shrink-0 hidden sm:block"></div>

        {/* WGS 84 */}
        <div className="hidden sm:flex flex-col items-center">
          <span className={`text-[8px] uppercase font-bold tracking-wider leading-none mb-1 ${isLocked ? 'text-primary-foreground/60' : 'text-white/25'}`}>WGS 84</span>
          <span className={`font-mono text-[10px] leading-tight whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-white/80'}`}>{toDMS(lat, true)}</span>
          <span className={`font-mono text-[10px] leading-tight whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-white/80'}`}>{toDMS(lng, false)}</span>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10 shrink-0 hidden sm:block"></div>

        {/* UTM */}
        <div className="hidden sm:flex flex-col items-center">
          <span className={`text-[8px] uppercase font-bold tracking-wider leading-none mb-1 ${isLocked ? 'text-primary-foreground/60' : 'text-white/25'}`}>UTM {utmZone}{isSouth ? 'S' : 'N'}</span>
          <span className={`font-mono text-[10px] leading-tight whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-white/80'}`}>X: {utmResult.x.toFixed(2)}</span>
          <span className={`font-mono text-[10px] leading-tight whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-white/80'}`}>Y: {utmResult.y.toFixed(2)}</span>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-white/10 shrink-0 hidden sm:block"></div>

        {/* TM-3 */}
        <div className="hidden sm:flex flex-col items-center">
          <span className={`text-[8px] uppercase font-bold tracking-wider leading-none mb-1 ${isLocked ? 'text-primary-foreground/60' : 'text-white/25'}`}>TM-3 {tm3ZoneDisplay}</span>
          <span className={`font-mono text-[10px] leading-tight whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-white/80'}`}>X: {tm3Result.x.toFixed(2)}</span>
          <span className={`font-mono text-[10px] leading-tight whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-white/80'}`}>Y: {tm3Result.y.toFixed(2)}</span>
        </div>

        {/* Lock Badge */}
        {isLocked && (
          <button 
            onClick={handleUnlock}
            className="ml-1 p-1.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-all ring-1 ring-red-500/30 shrink-0"
            title="Buka Kunci Koordinat"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </>
  );
}

function LayerFeature({ layer }: { layer: any }) {
  const [featureCollection, setFeatureCollection] = useState<any>(null);
  const { 
    setLayerArea, areaUnit, zoomToLayerId, triggerZoomToLayer, 
    cacheLayerGeojson, layerGeojsonCache, setActiveEditFeature,
    setIsDigitizePanelExpanded 
  } = useMapContext();
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
      let finalData: any = null;
      
      if (layer.id?.startsWith('local-')) {
        finalData = layerGeojsonCache[layer.id];
      } else {
        const dissolveKey = layer.style?.dissolve_key;
        const { data, error } = await supabase.rpc('get_layer_feature_collection', {
          p_layer_id: layer.id,
          p_group_key: dissolveKey || 'none'
        });
        if (error) {
          console.error("Fetch Geometry Error:", JSON.stringify(error, null, 2));
          toast.error("Gagal memuat geometri: " + (error.message || JSON.stringify(error)));
          return;
        }
        finalData = data;
      }

      if (finalData) {
        // 1. Terapkan Definition Query jika ada
        const defQuery = layer.style?.definition_query;
        if (defQuery && finalData.features) {
          const { field, operator, value } = defQuery;
          const filteredFeatures = finalData.features.filter((f: any) => {
            const props = f.properties || {};
            const pVal = props[field];
            if (pVal === undefined || pVal === null) return false;
            
            const strVal = String(pVal).toLowerCase();
            const targetVal = String(value).toLowerCase();
            const numVal = Number(pVal);
            const numTarget = Number(value);

            switch (operator) {
              case '=': return strVal === targetVal;
              case '!=': return strVal !== targetVal;
              case '>': return !isNaN(numVal) && !isNaN(numTarget) ? numVal > numTarget : strVal > targetVal;
              case '<': return !isNaN(numVal) && !isNaN(numTarget) ? numVal < numTarget : strVal < targetVal;
              case '>=': return !isNaN(numVal) && !isNaN(numTarget) ? numVal >= numTarget : strVal >= targetVal;
              case '<=': return !isNaN(numVal) && !isNaN(numTarget) ? numVal <= numTarget : strVal <= targetVal;
              case 'LIKE': return strVal.includes(targetVal);
              default: return true;
            }
          });
          
          finalData = { ...finalData, features: filteredFeatures };
        }

        setFeatureCollection(finalData);
        cacheLayerGeojson(layer.id, finalData);
        // Menghitung Luas Area
        
        try {
          const areaSqMeters = turf.area(finalData);
          const wgs84_sqm = areaSqMeters;
          
          let utm_epsg = undefined;
          let tm3_epsg = undefined;
          let utm_sqm = undefined;
          let tm3_sqm = undefined;

          // Estimasi Planar Area berdasarkan Centroid untuk Proyeksi Lokal Indonesia
          try {
            const centroid = turf.centroid(finalData).geometry.coordinates; // [lng, lat]
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
              const baseZone = 46 + Math.floor((tm3Index + 1) / 2);
              const subZone = (tm3Index % 2 === 0) ? 2 : 1;
              tm3_epsg = `${23826 + tm3Index} (Zona ${baseZone}-${subZone})`;
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
      }
    }
    
    loadGeometry();
  }, [layer.id, layer.style?.dissolve_key, layer.style?.definition_query]); // areaUnit is intentionally excluded to prevent refetching geometry from SQL when unit changes

  // Update feature collection if cache changes for local layers
  useEffect(() => {
    if (layer.id?.startsWith('local-')) {
      setFeatureCollection(layerGeojsonCache[layer.id]);
    }
  }, [layerGeojsonCache, layer.id]);

  if (!featureCollection) return null;

  const style = layer.style || { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2 };

  console.log(`[MapArea] Rendering layer ${layer.id}:`, featureCollection);
  if (featureCollection?.features?.length > 0) {
    console.log(`[MapArea] First feature geometry:`, featureCollection.features[0].geometry);
  }

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };
  };

  const formatLength = (meters: number) => {
    if (meters >= 1000) return `${(meters / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} km`;
    return `${meters.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m`;
  };

  const onEachFeature = (feature: any, mapLayer: any) => {
    // Digitizing Edit Trigger
    mapLayer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      // Klik sekarang hanya membuka popup standar. 
      // Fitur edit dipindahkan ke dalam tombol di popup agar tidak mengganggu navigasi.
    });

    if (feature.properties) {
      
      // Hitung luas, panjang, keliling menggunakan Turf
      let localAreaHtml = "";
      try {
         const geomType = feature.geometry.type;
         
         if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
            const wgsSqM = turf.area(feature);
            let perimeterM = 0;
            try {
              perimeterM = turf.length(feature, { units: 'meters' });
            } catch(e) {
              console.warn("Gagal menghitung keliling:", e);
            }

            if (wgsSqM > 1) { 
               let utmSqM = wgsSqM * 0.9992;
               let tm3SqM = wgsSqM * 0.9998;
               
               let utm_epsg = "";
               let tm3_epsg = "";
               try {
                 const centroid = turf.centroid(feature).geometry.coordinates; // [lng, lat]
                 const lng = centroid[0];
                 const lat = centroid[1];
                 const utmZone = Math.floor((lng + 180) / 6) + 1;
                 utm_epsg = ` Zona ${utmZone}`;
                 const tm3Index = Math.round((lng - 94.5) / 3);
                 if (tm3Index >= 0 && tm3Index <= 20) {
                   const baseZone = 46 + Math.floor((tm3Index + 1) / 2);
                   const subZone = (tm3Index % 2 === 0) ? 2 : 1;
                   tm3_epsg = ` Zona ${baseZone}-${subZone}`;
                 }
               } catch(e) {}
                
               localAreaHtml += `
               <div class="mb-2 bg-black/40 p-2 text-xs rounded border border-primary/20">
                 <span class="text-[10px] uppercase font-bold text-white/50 mb-1 block tracking-wider">📐 Area Poligon</span>
                 <div class="flex justify-between items-center mt-1">
                    <span class="text-gray-300">Luas (WGS 84)</span>
                    <span class="font-mono text-primary font-bold">${formatUnit(wgsSqM)}</span>
                 </div>
                 <div class="flex justify-between items-center mt-1">
                    <span class="text-gray-300">Luas (UTM${utm_epsg})</span>
                    <span class="font-mono text-gray-100">${formatUnit(utmSqM)}</span>
                 </div>
                 <div class="flex justify-between items-center mt-1">
                    <span class="text-gray-300">Luas (TM-3${tm3_epsg})</span>
                    <span class="font-mono text-gray-100">${formatUnit(tm3SqM)}</span>
                 </div>
                 <div class="flex justify-between items-center mt-1 border-t border-white/10 pt-1">
                    <span class="text-gray-300">Keliling</span>
                    <span class="font-mono text-indigo-400 font-bold">${formatLength(perimeterM)}</span>
                 </div>
               </div>`;
            }
         } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
            const lengthM = turf.length(feature, { units: 'meters' });
            
            localAreaHtml += `
            <div class="mb-2 bg-black/40 p-2 text-xs rounded border border-primary/20">
              <span class="text-[10px] uppercase font-bold text-white/50 mb-1 block tracking-wider">📏 Garis</span>
              <div class="flex justify-between items-center mt-1">
                 <span class="text-gray-300">Panjang</span>
                 <span class="font-mono text-primary font-bold">${formatLength(lengthM)}</span>
              </div>
            </div>`;
         }
      } catch(e) {
         console.warn("Gagal menghitung dimensi:", e);
      }

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
      
      const btnId = `edit-btn-${Math.random().toString(36).substr(2, 9)}`;
      popupContent += `</tbody></table></div>`;
      
      // Tambahkan tombol Edit di bagian bawah popup
      popupContent += `
        <div class="mt-3 pt-2 border-t border-white/10 flex justify-end">
          <button id="${btnId}" class="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all shadow-lg shadow-orange-500/20 active:scale-95">
             Edit Atribut
          </button>
        </div>
      `;

      popupContent += `</div>`;
      mapLayer.bindPopup(popupContent, {
        className: "custom-popup-dark",
        maxWidth: 300
      });

      // Efek Visual (Highlight) ketika di-klik / popup terbuka
      mapLayer.on('popupopen', (e: any) => {
        // Bind event ke tombol edit di dalam popup
        const editBtn = document.getElementById(btnId);
        if (editBtn) {
          editBtn.onclick = (ev) => {
            ev.stopPropagation();
            const isLocal = layer.id?.startsWith('local-');
            if (isLocal) {
              const fc = layerGeojsonCache[layer.id];
              const featureIndex = fc?.features.findIndex((f: any) => 
                JSON.stringify(f.geometry.coordinates) === JSON.stringify(feature.geometry.coordinates)
              );
              setActiveEditFeature({
                layerId: layer.id,
                featureIndex: featureIndex !== undefined ? featureIndex : -1,
                properties: feature.properties || {}
              });
            } else {
              setActiveEditFeature({ 
                layerId: layer.id, 
                featureIndex: -1, 
                properties: feature.properties || {} 
              });
            }
            setIsDigitizePanelExpanded(true);
            mapLayer.closePopup();
          };
        }

        const l = e.target;
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
      key={`${layer.id}-${featureCollection?.features?.length || 0}-${JSON.stringify(style)}-${areaUnit}`}
      style={() => style}
      pointToLayer={(feature, latlng) => {
        return L.circleMarker(latlng, style);
      }}
      onEachFeature={onEachFeature}
    />
  );
}
// Komponen render hasil Spatial Join di peta
function SpatialJoinLayer() {
  const { spatialJoinResult } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (spatialJoinResult?.geojson) {
      try {
        const bounds = L.geoJSON(spatialJoinResult.geojson).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } catch(e) {}
    }
  }, [spatialJoinResult, map]);

  if (!spatialJoinResult?.geojson) return null;

  const joinStyle = {
    color: '#6366f1',
    fillColor: '#6366f1',
    fillOpacity: 0.4,
    weight: 3,
    dashArray: '10, 5'
  };

  const onEachJoin = (feature: any, mapLayer: any) => {
    let html = `<div class="p-2 min-w-[200px]">`;
    html += `<h4 class="font-bold text-base border-b border-indigo-400/30 pb-1 mb-2 text-indigo-300">🔗 Hasil Spatial Join</h4>`;
    
    // Tampilkan properti baru (hasil join)
    const props = feature.properties || {};
    const joinKey = Object.keys(props).find(k => k.startsWith('join_') && k !== 'join_details');
    
    if (joinKey) {
      const label = joinKey === 'join_count' ? 'Jumlah Objek' : `Total ${joinKey.replace('join_sum_', '')}`;
      html += `
        <div class="mb-3 bg-indigo-900/30 p-2 rounded border border-indigo-500/20">
          <span class="text-[10px] uppercase font-bold text-indigo-400/60 block tracking-widest mb-1">Hasil Analisis</span>
          <div class="flex justify-between items-center">
            <span class="text-gray-300 text-xs">${label}</span>
            <span class="font-mono text-white font-black text-lg">${props[joinKey]}</span>
          </div>
        </div>
      `;
    }

    // Tampilkan properti asli poligon
    html += `<div class="max-h-40 overflow-y-auto text-xs">`;
    html += `<table class="w-full text-left border-collapse"><tbody>`;
    for (const key in props) {
      if (key === "db_id" || key === "FID" || key.startsWith('join_')) continue;
      const value = props[key];
      html += `
        <tr class="border-b border-white/10 last:border-0 hover:bg-white/5">
          <td class="py-1.5 pr-2 font-medium text-gray-400 w-1/3 align-top">${key}</td>
          <td class="py-1.5 text-white font-mono break-words">${value === null ? "null" : value}</td>
        </tr>
      `;
    }
    html += `</tbody></table></div>`;
    
    html += `<div class="text-[9px] text-gray-500 mt-3 pt-2 border-t border-white/5 uppercase tracking-tighter">Target: ${spatialJoinResult.targetLayerName} <br/> Source: ${spatialJoinResult.sourceLayerName}</div>`;
    html += `</div>`;

    mapLayer.bindPopup(html, { className: 'custom-popup-dark', maxWidth: 320 });
  };

  return (
    <GeoJSON
      data={spatialJoinResult.geojson}
      key={`spatial-join-${Date.now()}`}
      style={() => joinStyle}
      onEachFeature={onEachJoin}
    />
  );
}

// Komponen penanda hasil pencarian
function SearchResultMarker() {
  const { searchResult, setSearchResult } = useMapContext();
  const map = useMap();

  useEffect(() => {
    if (searchResult) {
      map.flyTo([searchResult.lat, searchResult.lng], 16, {
        duration: 2,
        easeLinearity: 0.25
      });
    }
  }, [searchResult, map]);

  if (!searchResult) return null;

  const searchIcon = L.divIcon({
    html: `
      <div class="relative flex items-center justify-center pointer-events-none">
        <div class="absolute w-10 h-10 bg-indigo-500/30 rounded-full animate-ping"></div>
        <div class="relative z-10 p-2 bg-indigo-600 rounded-full shadow-2xl border-2 border-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </div>
      </div>
    `,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  return (
    <Marker 
      position={[searchResult.lat, searchResult.lng]} 
      icon={searchIcon}
    >
      <Popup className="custom-popup-dark">
        <div className="p-2 min-w-[150px]">
          <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Lokasi Ditemukan</h4>
          <p className="text-xs text-white leading-relaxed mb-3">{searchResult.label}</p>
          <button 
            onClick={() => setSearchResult(null)}
            className="w-full py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-white transition-colors border border-white/10"
          >
            Hapus Penanda
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

