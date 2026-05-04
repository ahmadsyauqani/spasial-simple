"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, ZoomControl, GeoJSON, CircleMarker, Circle, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import * as turf from "@turf/turf";
import proj4 from "proj4";
import { useMapContext, BASEMAP_OPTIONS, BasemapType } from "@/lib/MapContext";
import { Layers, LocateFixed, Loader2, Lock, Magnet } from "lucide-react";

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

export default function MapArea() {
  const { activeFeatureToZoom, layers, activeBasemap, setActiveBasemap } = useMapContext();
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
      {/* Bottom-left controls: Basemap + My Location */}
      <div className="absolute bottom-28 sm:bottom-6 left-4 sm:left-6 z-[1000] flex items-end gap-2">
        {/* Basemap Selector */}
        <div className="flex flex-col gap-2 group">
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

        {/* My Location Button */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          className={`bg-card text-card-foreground border rounded-full p-2.5 shadow-md transition-all flex items-center justify-center ${
            isLocating
              ? 'animate-pulse border-blue-500/50'
              : locationActive
                ? 'border-blue-500/70 bg-blue-500/15 shadow-blue-500/20 shadow-lg'
                : 'hover:bg-muted'
          }`}
          title={locationActive ? "Nonaktifkan lokasi" : "Temukan lokasi saya"}
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          ) : (
            <LocateFixed className={`w-5 h-5 transition-colors ${locationActive ? 'text-blue-400' : 'text-primary'}`} />
          )}
        </button>
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
        <ClipLayer />
        <MergeLayer />
        <BufferLayer />
        <UnionLayer />
        <DissolveLayer />

        {/* User Location Marker */}
        {userLocation && locationActive && (
          <LocationMarker location={userLocation} />
        )}
        
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
// CURSOR COORDINATES — Real-time display of cursor position
// ──────────────────────────────────────────────────────
function CursorCoordinates() {
  const map = useMap();
  const { layers, layerGeojsonCache } = useMapContext();
  const [coords, setCoords] = useState<{lat: number, lng: number} | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isSnapEnabled, setIsSnapEnabled] = useState(false);
  const [snapPoint, setSnapPoint] = useState<{lat: number, lng: number} | null>(null);
  
  const isLockedRef = useRef(isLocked);
  const isSnapEnabledRef = useRef(isSnapEnabled);

  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    isSnapEnabledRef.current = isSnapEnabled;
  }, [isSnapEnabled]);

  useEffect(() => {
    const handleMouseMove = (e: L.LeafletMouseEvent) => {
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
    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('click', handleMapClick);
    };
  }, [map]);

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
      <div className={`absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100vw-2rem)] sm:w-auto ${isLocked ? 'bg-primary/95 border-primary/50 shadow-primary/20' : 'bg-card/90 border-border/50'} backdrop-blur-md border rounded-xl px-3 sm:px-5 py-2 sm:py-2.5 shadow-xl flex flex-col sm:flex-row gap-1.5 sm:gap-6 text-[10px] sm:text-xs select-none transition-all duration-300 pointer-events-auto`}>
        <div className="absolute -top-10 left-0 flex gap-2 sm:static sm:mr-4">
          <button 
            onClick={() => setIsSnapEnabled(!isSnapEnabled)}
            className={`p-2 rounded-full shadow-lg border transition-all duration-300 ${isSnapEnabled ? 'bg-indigo-500 text-white border-indigo-400 animate-pulse' : 'bg-card text-muted-foreground border-border hover:bg-muted'}`}
            title={isSnapEnabled ? "Matikan Snap" : "Aktifkan Snap ke Vertex"}
          >
            <Magnet className="w-4 h-4" />
          </button>
        </div>
        
        {isLocked && (
          <button 
            onClick={handleUnlock}
            className="absolute -top-3 -right-2 sm:-right-3 bg-red-500 text-white rounded-full p-1 shadow-lg flex items-center justify-center animate-in zoom-in duration-300 border border-white hover:bg-red-600 transition-colors pointer-events-auto"
            title="Buka Kunci (Kembali ke mode kursor)"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        )}
      <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-center w-full">
        <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider mb-0 sm:mb-0.5 whitespace-nowrap ${isLocked ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>WGS 84</span>
        <div className="flex flex-col items-end sm:items-center">
          <span className={`font-mono font-medium whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-card-foreground'}`}>{toDMS(lat, true)}</span>
          <span className={`font-mono font-medium whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-card-foreground'}`}>{toDMS(lng, false)}</span>
        </div>
      </div>
      <div className="hidden sm:block w-px bg-border/70"></div>
      <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-center w-full border-t sm:border-t-0 border-border/40 pt-1.5 sm:pt-0">
        <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider mb-0 sm:mb-0.5 whitespace-nowrap ${isLocked ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>UTM {utmZone}{isSouth ? 'S' : 'N'}</span>
        <div className="flex flex-col items-end sm:items-center">
          <span className={`font-mono font-medium whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-card-foreground'}`}>X: {utmResult.x.toFixed(2)}</span>
          <span className={`font-mono font-medium whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-card-foreground'}`}>Y: {utmResult.y.toFixed(2)}</span>
        </div>
      </div>
      <div className="hidden sm:block w-px bg-border/70"></div>
      <div className="flex flex-row sm:flex-col items-center justify-between sm:justify-center w-full border-t sm:border-t-0 border-border/40 pt-1.5 sm:pt-0">
        <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider mb-0 sm:mb-0.5 whitespace-nowrap ${isLocked ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>TM-3 {tm3ZoneDisplay}</span>
        <div className="flex flex-col items-end sm:items-center">
          <span className={`font-mono font-medium whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-card-foreground'}`}>X: {tm3Result.x.toFixed(2)}</span>
          <span className={`font-mono font-medium whitespace-nowrap ${isLocked ? 'text-primary-foreground' : 'text-card-foreground'}`}>Y: {tm3Result.y.toFixed(2)}</span>
        </div>
      </div>
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
      if (layer.id?.startsWith('local-')) {
        setFeatureCollection(layerGeojsonCache[layer.id]);
        return;
      }
      setFeatureCollection(null); // Paksa Leaflet menghapus peta lama selama loading
      const dissolveKey = layer.style?.dissolve_key;
      const { data, error } = await supabase.rpc('get_layer_feature_collection', {
        p_layer_id: layer.id,
        p_group_key: dissolveKey || 'none'
      });

      if (!error && data) {
        let finalData: any = data;
        
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
      } else if (error) {
        console.error("Fetch Geometry Error:", JSON.stringify(error, null, 2));
        toast.error("Gagal memuat geometri: " + (error.message || JSON.stringify(error)));
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

  const formatUnit = (sqm: number) => {
    if (areaUnit === 'Ha') return `${(sqm / 10000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ha`;
    if (areaUnit === 'km2') return `${(sqm / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} km²`;
    return `${sqm.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m²`;
  };

  const onEachFeature = (feature: any, mapLayer: any) => {
    // Digitizing Edit Trigger
    mapLayer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      const isLocal = layer.id?.startsWith('local-');
      
      if (isLocal) {
        const fc = layerGeojsonCache[layer.id];
        if (fc) {
           const featureIndex = fc.features.findIndex((f: any) => 
             JSON.stringify(f.geometry.coordinates) === JSON.stringify(feature.geometry.coordinates)
           );
           if (featureIndex !== -1) {
             setActiveEditFeature({
               layerId: layer.id,
               featureIndex,
               properties: feature.properties || {}
             });
             setIsDigitizePanelExpanded(true);
             toast.info(`Mengedit atribut fitur di ${layer.name}`);
           }
        }
      } else {
        // DB Layer
        setActiveEditFeature({ 
          layerId: layer.id, 
          featureIndex: -1, 
          properties: feature.properties || {} 
        });
        setIsDigitizePanelExpanded(true);
        toast.info(`Mengedit atribut database: ${layer.name}`);
      }
    });

    if (feature.properties) {
      
      // Hitung luas ruang poligon spesifik menggunakan Turf di tempat
      let localAreaHtml = "";
      try {
         const wgsSqM = turf.area(feature);
         
         // Kalau nilainya 0, ini berarti layer Titik (Point) atau Garis (LineString), bukan Area.
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
                 <span class="text-gray-300">WGS 84</span>
                 <span class="font-mono text-primary font-bold">${formatUnit(wgsSqM)}</span>
              </div>
              <div class="flex justify-between items-center mt-1">
                 <span class="text-gray-300">UTM${utm_epsg}</span>
                 <span class="font-mono text-gray-100">${formatUnit(utmSqM)}</span>
              </div>
              <div class="flex justify-between items-center mt-1">
                 <span class="text-gray-300">TM-3${tm3_epsg}</span>
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
      key={`${layer.id}-${featureCollection?.features?.length || 0}-${JSON.stringify(style)}-${areaUnit}`}
      style={() => style}
      pointToLayer={(feature, latlng) => {
        return L.circleMarker(latlng, style);
      }}
      onEachFeature={onEachFeature}
    />
  );
}
