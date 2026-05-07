import proj4 from 'proj4';

/**
 * TM-3 Indonesia Coordinate Reference System Definitions
 * Based on BPN/ATR Standard (Transverse Mercator, Scale Factor 0.9999, FE 200k, FN 1.5M)
 */
export const TM3_ZONES = [
  { zone: "46.1", cm: 93.0, epsg: 23826 },
  { zone: "46.2", cm: 94.5, epsg: 23827 },
  { zone: "47.1", cm: 96.0, epsg: 23828 },
  { zone: "47.2", cm: 97.5, epsg: 23829 },
  { zone: "48.1", cm: 99.0, epsg: 23830 },
  { zone: "48.2", cm: 100.5, epsg: 23831 },
  { zone: "49.1", cm: 102.0, epsg: 23832 },
  { zone: "49.2", cm: 103.5, epsg: 23833 },
  { zone: "50.1", cm: 105.0, epsg: 23834 },
  { zone: "50.2", cm: 106.5, epsg: 23835 },
  { zone: "51.1", cm: 108.0, epsg: 23836 },
  { zone: "51.2", cm: 109.5, epsg: 23837 },
  { zone: "52.1", cm: 111.0, epsg: 23838 },
  { zone: "52.2", cm: 112.5, epsg: 23839 },
  { zone: "53.1", cm: 114.0, epsg: 23840 },
  { zone: "53.2", cm: 115.5, epsg: 23841 },
  { zone: "54.1", cm: 117.0, epsg: 23842 },
];

/**
 * Register TM-3 zones to proj4
 */
export function registerProjections() {
  // WGS 84 (Standard)
  proj4.defs("EPSG:4326", "+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs");

  // TM-3 Zones
  TM3_ZONES.forEach((z) => {
    const def = `+proj=tmerc +lat_0=0 +lon_0=${z.cm} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +units=m +no_defs`;
    proj4.defs(`EPSG:${z.epsg}`, def);
    proj4.defs(`TM3_ZONA_${z.zone}`, def);
  });
}

/**
 * Get Proj4 string for a specific EPSG
 */
export function getProj4Def(epsg: string | number) {
  const epsgStr = typeof epsg === 'number' ? `EPSG:${epsg}` : epsg;
  return proj4.defs(epsgStr);
}

// Initial registration
registerProjections();
