import { area, booleanValid, centroid, coordEach, kinks, length, polygonToLine } from '@turf/turf';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import proj4 from 'proj4';
import { TM3_ZONES, registerProjections } from './crs';

export type GeometryMetric = 'area' | 'perimeter' | 'length' | 'longitude' | 'latitude';
export type GeometryUnit = 'm2' | 'ha' | 'km2' | 'm' | 'km' | 'degrees';
export type GeometryMethod = 'wgs84' | 'utm' | 'tm3';
export type GeometryCalculationOptions = { metric: GeometryMetric; unit: GeometryUnit; field: string; precision: number; method?: GeometryMethod };
export type GeometryValue = { index: number; value: number; previous: unknown };
export type GeometryCalculation = { values: GeometryValue[]; skipped: { index: number; reason: string }[]; overwriteCount: number };

export const GEOMETRY_METRICS: Record<GeometryMetric, { label: string; units: GeometryUnit[]; field: string }> = {
  area: { label: 'Luas poligon', units: ['m2', 'ha', 'km2'], field: 'luas' },
  perimeter: { label: 'Keliling poligon (termasuk lubang)', units: ['m', 'km'], field: 'keliling' },
  length: { label: 'Panjang garis', units: ['m', 'km'], field: 'panjang' },
  longitude: { label: 'Longitude centroid / X titik', units: ['degrees'], field: 'longitude' },
  latitude: { label: 'Latitude centroid / Y titik', units: ['degrees'], field: 'latitude' },
};
export const GEOMETRY_UNITS: Record<GeometryUnit, string> = { m2: 'm²', ha: 'ha', km2: 'km²', m: 'meter', km: 'kilometer', degrees: 'derajat (°)' };
export const GEOMETRY_METHODS: Record<GeometryMethod, { label: string; description: string }> = {
  wgs84: { label: 'WGS84 geodesik', description: 'Akurat di permukaan bumi; cocok untuk perhitungan umum.' },
  utm: { label: 'UTM lokal', description: 'Metode planar meter berdasarkan zona UTM centroid fitur.' },
  tm3: { label: 'TM-3 lokal', description: 'Metode planar meter sesuai strip TM-3 ATR/BPN Indonesia.' },
};

export function validateGeometryOptions(options: GeometryCalculationOptions) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(options.field) ||
      ['db_id','fid','id','__proto__','constructor','prototype'].includes(options.field.toLowerCase())) {
    throw new Error('Nama kolom: awali huruf, gunakan huruf/angka/underscore (maks. 63). ID internal dilindungi.');
  }
  if (!Number.isInteger(options.precision) || options.precision < 0 || options.precision > 8) {
    throw new Error('Jumlah desimal harus bilangan bulat 0–8.');
  }
  if (!GEOMETRY_METRICS[options.metric]?.units.includes(options.unit)) {
    throw new Error('Satuan tidak sesuai dengan pengukuran.');
  }
  if (options.method && !GEOMETRY_METHODS[options.method]) throw new Error('Metode perhitungan tidak dikenali.');
}

function localProjection(feature: Feature, method: GeometryMethod) {
  if (method === 'wgs84') return null;
  const center = centroid(feature).geometry.coordinates;
  const [lng, lat] = center;
  registerProjections();
  if (method === 'utm') {
    const zone = Math.floor((lng + 180) / 6) + 1;
    if (zone < 1 || zone > 60) throw new Error('Zona UTM tidak valid.');
    const definition = `+proj=utm +zone=${zone} ${lat < 0 ? '+south' : ''} +datum=WGS84 +units=m +no_defs`;
    return { epsg: lat < 0 ? 32700 + zone : 32600 + zone, definition, project: (coordinate: [number, number]) => proj4('EPSG:4326', definition, coordinate) as [number, number] };
  }
  const tm3 = TM3_ZONES.reduce((closest, item) => Math.abs(item.cm - lng) < Math.abs(closest.cm - lng) ? item : closest);
  if (lng < 94.5 || lng > 117.5 || lat < -12 || lat > 7) throw new Error('TM-3 hanya tersedia untuk area Indonesia yang didukung.');
  const definition = `TM3_ZONA_${tm3.zone}`;
  return { epsg: tm3.epsg, definition, project: (coordinate: [number, number]) => proj4('EPSG:4326', definition, coordinate) as [number, number] };
}

function planarGeometry(feature: Feature, method: GeometryMethod) {
  const projection = localProjection(feature, method);
  if (!projection || !feature.geometry || feature.geometry.type === 'GeometryCollection') return feature;
  const projectCoordinates = (coordinates: unknown): unknown => {
    if (Array.isArray(coordinates) && typeof coordinates[0] === 'number') {
      return projection.project([coordinates[0], coordinates[1]]);
    }
    return (coordinates as unknown[]).map(projectCoordinates);
  };
  return { ...feature, geometry: { ...feature.geometry, coordinates: projectCoordinates(feature.geometry.coordinates) } } as Feature;
}

function ringLength(ring: [number, number][]) {
  let total = 0;
  for (let index = 1; index < ring.length; index++) {
    total += Math.hypot(ring[index][0] - ring[index - 1][0], ring[index][1] - ring[index - 1][1]);
  }
  return total;
}

function ringArea(ring: [number, number][]) {
  let total = 0;
  for (let index = 1; index < ring.length; index++) {
    total += ring[index - 1][0] * ring[index][1] - ring[index][0] * ring[index - 1][1];
  }
  return Math.abs(total) / 2;
}

function planarPolygonArea(feature: Feature) {
  const coordinates = feature.geometry?.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
  return coordinates.reduce((total, polygon) => total + ringArea(polygon[0] as [number, number][]) - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring as [number, number][]), 0), 0);
}

function planarPolygonPerimeter(feature: Feature) {
  const coordinates = feature.geometry?.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
  return coordinates.reduce((total, polygon) => total + polygon.reduce((perimeter, ring) => perimeter + ringLength(ring as [number, number][]), 0), 0);
}

function planarLineLength(feature: Feature) {
  const lines = feature.geometry?.type === 'LineString'
    ? [feature.geometry.coordinates]
    : feature.geometry?.type === 'MultiLineString' ? feature.geometry.coordinates : [];
  return lines.reduce((total, line) => total + ringLength(line as [number, number][]), 0);
}

function checkFeature(feature: Feature): asserts feature is Feature<Geometry> {
  if (!feature.geometry) throw new Error('Geometri kosong.');
  if (feature.geometry.type === 'GeometryCollection') throw new Error('GeometryCollection belum didukung. Pisahkan geometri dahulu.');
  let count = 0;
  coordEach(feature, position => {
    count++;
    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1]) || Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) {
      throw new Error('Koordinat tidak valid atau bukan WGS84. Reproyeksi dahulu.');
    }
  });
  if (!count || !booleanValid(feature)) throw new Error('Geometri tidak valid. Jalankan validasi topologi dahulu.');
  if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
    if (kinks(feature as Feature<Polygon | MultiPolygon>).features.length) throw new Error('Poligon menyilang sendiri. Perbaiki topologi dahulu.');
  }
}

function measure(feature: Feature, options: GeometryCalculationOptions): number {
  checkFeature(feature);
  const geometry = feature.geometry;
  const isPolygon = geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
  const method = options.method ?? 'wgs84';
  const measuredFeature = options.metric === 'longitude' || options.metric === 'latitude' || method === 'wgs84' ? feature : planarGeometry(feature, method);
  let value: number;
  switch (options.metric) {
    case 'area':
      if (!isPolygon) throw new Error('Luas hanya untuk Polygon/MultiPolygon.');
      value = method === 'wgs84' ? area(feature) : planarPolygonArea(measuredFeature);
      value /= options.unit === 'ha' ? 10_000 : options.unit === 'km2' ? 1_000_000 : 1;
      break;
    case 'perimeter':
      if (!isPolygon) throw new Error('Keliling hanya untuk Polygon/MultiPolygon.');
      value = method === 'wgs84'
        ? length(polygonToLine(feature as Feature<Polygon | MultiPolygon>), { units: 'meters' })
        : planarPolygonPerimeter(measuredFeature);
      value /= options.unit === 'km' ? 1000 : 1;
      break;
    case 'length':
      if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') throw new Error('Panjang hanya untuk LineString/MultiLineString.');
      value = method === 'wgs84' ? length(feature, { units: 'meters' }) : planarLineLength(measuredFeature);
      value /= options.unit === 'km' ? 1000 : 1;
      break;
    default: {
      const point = centroid(feature).geometry.coordinates;
      value = point[options.metric === 'longitude' ? 0 : 1];
    }
  }
  if (!Number.isFinite(value)) throw new Error('Hasil tidak terhingga; geometri perlu diperiksa.');
  return Number(value.toFixed(options.precision));
}

function planarLength(feature: Feature) {
  const coordinates: [number, number][] = [];
  coordEach(feature, coordinate => coordinates.push([coordinate[0], coordinate[1]]));
  let total = 0;
  for (let index = 1; index < coordinates.length; index++) {
    const dx = coordinates[index][0] - coordinates[index - 1][0];
    const dy = coordinates[index][1] - coordinates[index - 1][1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/** Pure calculation, no writes. Chunk boundaries yield to the UI for large selections. */
export async function calculateGeometryAttributes(
  collection: FeatureCollection,
  indices: number[],
  options: GeometryCalculationOptions,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<GeometryCalculation> {
  validateGeometryOptions(options);
  const unique = [...new Set(indices)];
  if (unique.some(index => !Number.isInteger(index) || index < 0 || index >= collection.features.length)) {
    throw new Error('Pilihan fitur sudah berubah. Buka ulang pratinjau.');
  }
  const result: GeometryCalculation = { values: [], skipped: [], overwriteCount: 0 };
  for (let i = 0; i < unique.length; i++) {
    if (signal?.aborted) throw new Error('Perhitungan dibatalkan.');
    const index = unique[i];
    const feature = collection.features[index];
    try {
      const value = measure(feature, options);
      const previous = feature.properties?.[options.field];
      result.values.push({ index, value, previous });
      if (Object.prototype.hasOwnProperty.call(feature.properties ?? {}, options.field)) result.overwriteCount++;
    } catch (error) {
      result.skipped.push({ index, reason: error instanceof Error ? error.message : 'Geometri tidak dapat dihitung.' });
    }
    if ((i + 1) % 250 === 0) {
      onProgress?.(i + 1, unique.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  onProgress?.(unique.length, unique.length);
  return result;
}

/** Returns a new collection and properties; untouched rows/geometry retain their identity. */
export function applyGeometryValues(collection: FeatureCollection, values: GeometryValue[], field: string): FeatureCollection {
  validateGeometryOptions({ metric: 'area', unit: 'm2', field, precision: 2 });
  const byIndex = new Map(values.map(row => [row.index, row.value]));
  return {
    ...collection,
    features: collection.features.map((feature, index) => byIndex.has(index)
      ? { ...feature, properties: { ...feature.properties, [field]: byIndex.get(index)! } }
      : feature),
  };
}
