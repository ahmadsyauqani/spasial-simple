"use client";

import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MiniMapProps {
  coordinates: [number, number][]; // WGS84 [lon, lat]
}

function ChangeView({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [10, 10] });
    }
  }, [bounds, map]);
  return null;
}

export default function MiniMap({ coordinates }: MiniMapProps) {
  if (!coordinates || coordinates.length < 3) {
    return (
      <div className="w-full h-[150px] rounded-lg bg-muted/30 flex items-center justify-center border border-border/50">
        <span className="text-xs text-muted-foreground">Peta pratinjau akan muncul setelah kolom X & Y dipilih</span>
      </div>
    );
  }

  // Leaflet butuh [lat, lon]
  const latLngs = coordinates.map(c => [c[1], c[0]] as [number, number]);
  const bounds = L.latLngBounds(latLngs);

  return (
    <div className="w-full h-[150px] rounded-lg overflow-hidden border border-border/50 relative">
      <MapContainer 
        bounds={bounds} 
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Polygon 
          positions={latLngs} 
          pathOptions={{ 
            color: '#06b6d4', // cyan-500
            fillColor: '#06b6d4', 
            fillOpacity: 0.2,
            weight: 2
          }} 
        />
        <ChangeView bounds={bounds} />
      </MapContainer>
      <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
        Pratinjau
      </div>
    </div>
  );
}
