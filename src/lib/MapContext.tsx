"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type LayerStyle = {
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
  dissolve_key?: string;
  definition_query?: {
    field: string;
    operator: string; // '=', '!=', '>', '<', '>=', '<=', 'LIKE'
    value: string;
  };
};

type GeoJsonLayer = {
  id?: string;
  name: string;
  data?: any; // GeoJSON (optional, only loaded actively initially or lazily fetched)
  style?: LayerStyle;
  sort_order?: number;
};

export type AreaUnit = 'Ha' | 'm2' | 'km2';

export type BasemapType = "dark" | "citra" | "hybrid" | "citra_terang" | "osm";

export const BASEMAP_OPTIONS: Record<BasemapType, { url: string, attribution: string, name: string }> = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CartoDB</a>',
    name: "Peta Gelap"
  },
  citra: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    name: "Citra Satelit (Esri)"
  },
  hybrid: {
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "&copy; Google",
    name: "Hibrida (Google)"
  },
  citra_terang: {
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attribution: "&copy; Google",
    name: "Citra Satelit (Google)"
  },
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
    name: "OpenStreetMap"
  }
};

export type AreaMetrics = {
  wgs84_sqm: number; // base internal storage in Square Meters
  utm_sqm?: number;
  utm_epsg?: string;
  tm3_sqm?: number;
  tm3_epsg?: string;
};

export type OverlapResult = {
  geojson: any; // FeatureCollection of intersection polygons
  areaMetrics: AreaMetrics;
  layerAName: string;
  layerBName: string;
} | null;

export type ClipResult = {
  geojson: any; // FeatureCollection of clipped polygons
  areaMetrics: AreaMetrics;
  inputLayerName: string;
  clipLayerName: string;
  featureCount: number;
} | null;

export type MergeResult = {
  geojson: any; // FeatureCollection of all merged features
  areaMetrics: AreaMetrics;
  sourceLayerNames: string[];
  featureCount: number;
  allAttributeKeys: string[];
} | null;

export type BufferResult = {
  geojson: any; // FeatureCollection of buffered polygons
  areaMetrics: AreaMetrics;
  inputLayerName: string;
  distance: number;
  unit: string;
  featureCount: number;
} | null;

export type UnionResult = {
  geojson: any; // FeatureCollection of unioned polygons
  areaMetrics: AreaMetrics;
  sourceLayerNames: string[];
  featureCount: number;
} | null;

export type DissolveResult = {
  geojson: any; // FeatureCollection of dissolved polygons
  areaMetrics: AreaMetrics;
  inputLayerName: string;
  dissolveProperty: string | null;
  featureCount: number;
} | null;

export type MapViewState = {
  center: [number, number]; // [lat, lng]
  zoom: number;
};

interface MapContextType {
  layers: GeoJsonLayer[];
  setLayers: React.Dispatch<React.SetStateAction<GeoJsonLayer[]>>;
  activeFeatureToZoom: any | null; // GeoJSON object to zoom to
  setZoomFeature: (geojson: any) => void;
  updateLayerStyle: (id: string, style: LayerStyle) => void;
  reorderLayer: (id: string, direction: "up" | "down") => void;
  layerAreas: Record<string, AreaMetrics>;
  setLayerArea: (id: string, metrics: AreaMetrics) => void;
  areaUnit: AreaUnit;
  setAreaUnit: (unit: AreaUnit) => void;
  zoomToLayerId: string | null;
  triggerZoomToLayer: (id: string | null) => void;
  layerGeojsonCache: Record<string, any>;
  cacheLayerGeojson: (id: string, geojson: any) => void;
  overlapResult: OverlapResult;
  setOverlapResult: (result: OverlapResult) => void;
  clipResult: ClipResult;
  setClipResult: (result: ClipResult) => void;
  mergeResult: MergeResult;
  setMergeResult: (result: MergeResult) => void;
  bufferResult: BufferResult;
  setBufferResult: (result: BufferResult) => void;
  unionResult: UnionResult;
  setUnionResult: (result: UnionResult) => void;
  dissolveResult: DissolveResult;
  setDissolveResult: (result: DissolveResult) => void;
  isLayoutComposerOpen: boolean;
  setLayoutComposerOpen: (open: boolean) => void;
  mapViewState: MapViewState;
  setMapViewState: (state: MapViewState) => void;
  activeBasemap: BasemapType;
  setActiveBasemap: (basemap: BasemapType) => void;
  activeDigitizingLayerId: string | null;
  setActiveDigitizingLayerId: (id: string | null) => void;
  activeEditFeature: { layerId: string, featureIndex: number, properties: any } | null;
  setActiveEditFeature: (data: { layerId: string, featureIndex: number, properties: any } | null) => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export function MapProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<GeoJsonLayer[]>([]);
  const [activeFeatureToZoom, setActiveFeatureToZoom] = useState<any | null>(null);

  const [layerAreas, setLayerAreas] = useState<Record<string, AreaMetrics>>({});
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('Ha');
  const [zoomToLayerId, setZoomToLayerId] = useState<string | null>(null);
  const [layerGeojsonCache, setLayerGeojsonCache] = useState<Record<string, any>>({});
  const [overlapResult, setOverlapResult] = useState<OverlapResult>(null);
  const [clipResult, setClipResult] = useState<ClipResult>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult>(null);
  const [bufferResult, setBufferResult] = useState<BufferResult>(null);
  const [unionResult, setUnionResult] = useState<UnionResult>(null);
  const [dissolveResult, setDissolveResult] = useState<DissolveResult>(null);
  const [isLayoutComposerOpen, setLayoutComposerOpen] = useState(false);
  const [mapViewState, setMapViewState] = useState<MapViewState>({ center: [-0.789275, 113.921327], zoom: 5 });
  const [activeBasemap, setActiveBasemap] = useState<BasemapType>("dark");
  const [activeDigitizingLayerId, setActiveDigitizingLayerId] = useState<string | null>(null);
  const [activeEditFeature, setActiveEditFeature] = useState<{ layerId: string, featureIndex: number, properties: any } | null>(null);

  const cacheLayerGeojson = (id: string, geojson: any) => {
    setLayerGeojsonCache((prev) => ({ ...prev, [id]: geojson }));
  };

  const setZoomFeature = (geojson: any) => {
    setActiveFeatureToZoom(geojson);
  };

  const updateLayerStyle = (id: string, style: LayerStyle) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, style } : l)));
  };

  const setLayerArea = (id: string, metrics: AreaMetrics) => {
    setLayerAreas((prev) => ({ ...prev, [id]: metrics }));
  };

  const reorderLayer = (id: string, direction: "up" | "down") => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index < 0) return prev;
      if (direction === "up" && index > 0) {
        const newLayers = [...prev];
        [newLayers[index - 1], newLayers[index]] = [newLayers[index], newLayers[index - 1]];
        // Update sort_order explicitly based on index
        return newLayers.map((l, i) => ({ ...l, sort_order: i }));
      }
      if (direction === "down" && index < prev.length - 1) {
        const newLayers = [...prev];
        [newLayers[index + 1], newLayers[index]] = [newLayers[index], newLayers[index + 1]];
        return newLayers.map((l, i) => ({ ...l, sort_order: i }));
      }
      return prev;
    });
  };

  return (
    <MapContext.Provider value={{ 
      layers, setLayers, 
      activeFeatureToZoom, setZoomFeature, 
      updateLayerStyle, reorderLayer, 
      layerAreas, setLayerArea, 
      areaUnit, setAreaUnit, 
      zoomToLayerId, triggerZoomToLayer: setZoomToLayerId, 
      layerGeojsonCache, cacheLayerGeojson, 
      overlapResult, setOverlapResult, 
      clipResult, setClipResult, 
      mergeResult, setMergeResult, 
      bufferResult, setBufferResult, 
      unionResult, setUnionResult, 
      dissolveResult, setDissolveResult, 
      isLayoutComposerOpen, setLayoutComposerOpen, 
      mapViewState, setMapViewState, 
      activeBasemap, setActiveBasemap,
      activeDigitizingLayerId, setActiveDigitizingLayerId,
      activeEditFeature, setActiveEditFeature
    }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapContext() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useMapContext must be used within a MapProvider");
  }
  return context;
}
