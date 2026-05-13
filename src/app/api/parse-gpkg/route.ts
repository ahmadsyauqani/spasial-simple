import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return Response.json(
        { error: 'File .gpkg tidak ditemukan dalam request.' },
        { status: 400 }
      );
    }

    // Dynamic import to ensure it only runs on server (Node.js)
    const { GeoPackageAPI, CanvasKitCanvasAdapter } = await import('@ngageoint/geopackage');

    // Bypass CanvasKit initialization as we only need feature data (GeoJSON)
    // and not tile rendering which requires canvas.
    try {
      if (CanvasKitCanvasAdapter) {
        CanvasKitCanvasAdapter.initialized = true;
      }
    } catch (e) {
      console.warn('Failed to set CanvasKitCanvasAdapter.initialized:', e);
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Open the GeoPackage from buffer
    const geoPackage = await GeoPackageAPI.open(uint8);

    const allFeatures: any[] = [];

    // Get all feature table names
    const featureTableNames = geoPackage.getFeatureTables();

    for (const tableName of featureTableNames) {
      const featureDao = geoPackage.getFeatureDao(tableName);
      const featureRows = featureDao.queryForAll();

      for (const row of featureRows) {
        try {
          const geometry = row.geometry;
          if (!geometry || !geometry.geometry) continue;

          const geom = geometry.geometry;
          const geojsonGeom = parseGeoPackageGeometry(geom);
          if (!geojsonGeom) continue;

          // Extract properties (non-geometry columns)
          const properties: Record<string, any> = {};
          const columnNames = row.columnNames;
          for (const col of columnNames) {
            if (col === featureDao.geometryColumnName || col === 'id') continue;
            properties[col] = row.getValue(col);
          }

          allFeatures.push({
            type: 'Feature',
            properties,
            geometry: geojsonGeom,
          });
        } catch (featureErr) {
          // Skip broken features
          console.warn(`Skipping feature in table ${tableName}:`, featureErr);
        }
      }
    }

    // Also check for tile tables (informational)
    const tileTables = geoPackage.getTileTables();

    geoPackage.close();

    if (allFeatures.length === 0 && tileTables.length > 0) {
      return Response.json(
        { error: `GeoPackage ini hanya berisi tile/raster (${tileTables.join(', ')}), tidak ada data vektor/fitur.` },
        { status: 400 }
      );
    }

    if (allFeatures.length === 0) {
      return Response.json(
        { error: 'GeoPackage tidak memiliki fitur geometri yang valid.' },
        { status: 400 }
      );
    }

    const geojson = {
      type: 'FeatureCollection',
      features: allFeatures,
    };

    return Response.json(geojson);
  } catch (err: any) {
    console.error('GeoPackage parse error:', err);
    return Response.json(
      { error: `Gagal membaca GeoPackage: ${err.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}

/**
 * Convert GeoPackage geometry object to GeoJSON geometry
 */
function parseGeoPackageGeometry(geom: any): any {
  if (!geom) return null;

  // The @ngageoint/geopackage library provides geometry objects with
  // a toGeoJSON() method in most cases
  if (typeof geom.toGeoJSON === 'function') {
    return geom.toGeoJSON();
  }

  // Fallback: manual extraction based on geometry type
  const geomType = geom.geometryType || geom.type;

  if (geomType === 'Point' || geomType === 0) {
    return {
      type: 'Point',
      coordinates: [geom.x, geom.y, ...(geom.z !== undefined ? [geom.z] : [])],
    };
  }

  if (geomType === 'LineString' || geomType === 1) {
    const coords = (geom.points || []).map((p: any) => [p.x, p.y]);
    return { type: 'LineString', coordinates: coords };
  }

  if (geomType === 'Polygon' || geomType === 2) {
    const rings = (geom.rings || []).map((ring: any) =>
      (ring.points || ring).map((p: any) => [p.x, p.y])
    );
    return { type: 'Polygon', coordinates: rings };
  }

  if (geomType === 'MultiPoint' || geomType === 3) {
    const coords = (geom.points || geom.geometries || []).map((p: any) => [p.x, p.y]);
    return { type: 'MultiPoint', coordinates: coords };
  }

  if (geomType === 'MultiLineString' || geomType === 4) {
    const lines = (geom.lineStrings || geom.geometries || []).map((ls: any) =>
      (ls.points || ls).map((p: any) => [p.x, p.y])
    );
    return { type: 'MultiLineString', coordinates: lines };
  }

  if (geomType === 'MultiPolygon' || geomType === 5) {
    const polygons = (geom.polygons || geom.geometries || []).map((poly: any) =>
      (poly.rings || [poly]).map((ring: any) =>
        (ring.points || ring).map((p: any) => [p.x, p.y])
      )
    );
    return { type: 'MultiPolygon', coordinates: polygons };
  }

  // GeometryCollection
  if (geomType === 'GeometryCollection' || geomType === 6) {
    const geometries = (geom.geometries || [])
      .map((g: any) => parseGeoPackageGeometry(g))
      .filter(Boolean);
    return { type: 'GeometryCollection', geometries };
  }

  return null;
}
