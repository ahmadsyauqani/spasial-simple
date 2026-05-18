// Flight Planner utility functions — no React, pure math
// All calculations based on standard photogrammetry formulas.

export interface FlightParams {
  altitude: number;       // meters AGL
  overlapFront: number;   // % (60-90 typical)
  overlapSide: number;    // % (60-80 typical)
  cameraFovH: number;     // horizontal FOV degrees (DJI Mavic3 = 84°)
  cameraFovV: number;     // vertical FOV degrees (DJI Mavic3 = 57°)
  speed: number;          // m/s drone speed
  cameraSensorW: number;  // mm
  cameraSensorH: number;  // mm
  focalLength: number;    // mm
}

export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  altitude: number;
  action: "photo" | "hover" | "rtl";
  heading?: number;
}

export interface FlightPlan {
  waypoints: Waypoint[];
  totalDistanceM: number;
  estimatedTimeSec: number;
  photoCount: number;
  gsd: number;            // cm/px
  coverageArea: number;   // sq meters
  footprintW: number;     // meters per photo footprint width
  footprintH: number;     // meters per photo footprint height
}

export const DEFAULT_PARAMS: FlightParams = {
  altitude: 80,
  overlapFront: 80,
  overlapSide: 70,
  cameraFovH: 84,
  cameraFovV: 57,
  speed: 8,
  cameraSensorW: 17.3,
  cameraSensorH: 13,
  focalLength: 12.29,
};

/** Ground sampling distance in cm/pixel (sensor width 17.3mm, image width 5280px for Mavic3) */
export function calcGSD(params: FlightParams): number {
  const imageWidthPx = 5280;
  // GSD = (sensorW * altitude) / (focalLength * imageW) * 100  (cm)
  return (params.cameraSensorW * params.altitude * 100) / (params.focalLength * imageWidthPx);
}

/** Footprint of a single photo at given altitude (meters) */
export function calcFootprint(params: FlightParams): { w: number; h: number } {
  const w = 2 * params.altitude * Math.tan((params.cameraFovH * Math.PI) / 360);
  const h = 2 * params.altitude * Math.tan((params.cameraFovV * Math.PI) / 360);
  return { w, h };
}

/** Degrees to radians */
function toRad(deg: number) { return (deg * Math.PI) / 180; }

/** Haversine distance in meters */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Offset lat/lng by meters (approx) */
function offsetLatLng(lat: number, lng: number, dNorth: number, dEast: number): [number, number] {
  const R = 6371000;
  const newLat = lat + (dNorth / R) * (180 / Math.PI);
  const newLng = lng + (dEast / R) * (180 / Math.PI) / Math.cos(toRad(lat));
  return [newLat, newLng];
}

/**
 * Generate lawnmower (boustrophedon) grid waypoints for a bounding box defined by polygon.
 * Returns an ordered list of waypoints covering the area.
 */
export function generateLawnmowerGrid(
  polygonLatLngs: [number, number][],
  params: FlightParams
): FlightPlan {
  if (polygonLatLngs.length < 3) {
    return { waypoints: [], totalDistanceM: 0, estimatedTimeSec: 0, photoCount: 0, gsd: 0, coverageArea: 0, footprintW: 0, footprintH: 0 };
  }

  const { w: footW, h: footH } = calcFootprint(params);
  const stepAlongTrack = footH * (1 - params.overlapFront / 100);  // distance between photos
  const stepAcrossTrack = footW * (1 - params.overlapSide / 100);  // distance between strips

  // Bounding box
  const lats = polygonLatLngs.map(p => p[0]);
  const lngs = polygonLatLngs.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  // Center of bounding box
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Height and width in meters
  const heightM = haversineM(minLat, centerLng, maxLat, centerLng);
  const widthM  = haversineM(centerLat, minLng, centerLat, maxLng);

  // Number of strips (across) and shots (along)
  const numStrips = Math.ceil(widthM / stepAcrossTrack) + 1;
  const numShots  = Math.ceil(heightM / stepAlongTrack) + 1;

  const waypoints: Waypoint[] = [];
  let totalDist = 0;
  let prev: [number, number] | null = null;

  for (let i = 0; i < numStrips; i++) {
    const dEast = -widthM / 2 + i * stepAcrossTrack;
    const isEven = i % 2 === 0;
    for (let j = 0; j < numShots; j++) {
      const jj = isEven ? j : numShots - 1 - j;
      const dNorth = -heightM / 2 + jj * stepAlongTrack;
      const [lat, lng] = offsetLatLng(centerLat, centerLng, dNorth, dEast);
      const wp: Waypoint = {
        id: `wp-${i}-${j}`,
        lat,
        lng,
        altitude: params.altitude,
        action: "photo",
        heading: isEven ? 0 : 180,
      };
      waypoints.push(wp);
      if (prev) totalDist += haversineM(prev[0], prev[1], lat, lng);
      prev = [lat, lng];
    }
  }

  // Add RTL at end
  if (waypoints.length > 0) {
    waypoints.push({ ...waypoints[0], id: "wp-rtl", action: "rtl" });
    totalDist += haversineM(
      waypoints[waypoints.length - 2].lat,
      waypoints[waypoints.length - 2].lng,
      waypoints[0].lat,
      waypoints[0].lng
    );
  }

  const estimatedTimeSec = totalDist / params.speed + waypoints.length * 0.5; // 0.5s shutter per photo
  const photoCount = numStrips * numShots;

  return {
    waypoints,
    totalDistanceM: totalDist,
    estimatedTimeSec,
    photoCount,
    gsd: calcGSD(params),
    coverageArea: widthM * heightM,
    footprintW: footW,
    footprintH: footH,
  };
}

/** Export waypoints to KML string */
export function exportToKML(plan: FlightPlan, name = "Flight Plan"): string {
  const placemarks = plan.waypoints
    .filter(w => w.action === "photo")
    .map((w, i) => `
    <Placemark>
      <name>WP ${i + 1}</name>
      <Point><coordinates>${w.lng},${w.lat},${w.altitude}</coordinates></Point>
    </Placemark>`)
    .join("\n");

  const coords = plan.waypoints
    .filter(w => w.action === "photo")
    .map(w => `${w.lng},${w.lat},${w.altitude}`)
    .join(" ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Placemark>
      <name>Flight Path</name>
      <LineString>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
    ${placemarks}
  </Document>
</kml>`;
}

/** Export waypoints to QGroundControl/Mission Planner .waypoints format */
export function exportToMavlink(plan: FlightPlan): string {
  const lines = ["QGC WPL 110"];
  plan.waypoints.forEach((w, i) => {
    const isHome = i === 0 ? 1 : 0;
    const command = w.action === "rtl" ? 20 : (w.action === "photo" ? 16 : 16);
    // index, current, frame, command, param1-4, lat, lng, alt, autocontinue
    lines.push(`${i}\t${isHome}\t3\t${command}\t0\t0\t0\t0\t${w.lat.toFixed(8)}\t${w.lng.toFixed(8)}\t${w.altitude}\t1`);
  });
  return lines.join("\n");
}

/** Export to GeoJSON FeatureCollection */
export function exportToGeoJSON(plan: FlightPlan): any {
  const features = plan.waypoints
    .filter(w => w.action === "photo")
    .map((w, i) => ({
      type: "Feature",
      properties: { name: `WP ${i + 1}`, altitude: w.altitude, action: w.action },
      geometry: { type: "Point", coordinates: [w.lng, w.lat, w.altitude] }
    }));

  const lineCoords = plan.waypoints.filter(w => w.action === "photo").map(w => [w.lng, w.lat, w.altitude]);
  if (lineCoords.length > 1) {
    features.push({
      type: "Feature",
      properties: { name: "Flight Path", type: "route" },
      geometry: { type: "LineString", coordinates: lineCoords }
    } as any);
  }

  return { type: "FeatureCollection", features };
}
