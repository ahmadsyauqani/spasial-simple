import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import DxfParser from 'dxf-parser';
import tokml from 'tokml';
import * as shpwrite from 'shp-write';
import DxfWriter from 'dxf-writer';
import { reproject } from 'reproject';
import proj4 from 'proj4';
import { registerProjections } from './crs';
import { parseGeoPackageGeometry } from './spatialEngine';

// Ensure projections are registered
registerProjections();

export type SpatialFormat = 'geojson' | 'kml' | 'shp' | 'dxf';

export interface ConversionOptions {
  sourceCrs?: string;
  targetCrs: string;
}

/**
 * Spatial Converter Engine
 */
export class SpatialConverter {
  /**
   * Parse an uploaded file to GeoJSON
   */
  static async parseToGeoJSON(file: File): Promise<any> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    switch (extension) {
      case 'zip': // Likely Shapefile
        return await shp(arrayBuffer);
      
      case 'kml':
        const kmlText = new TextDecoder().decode(arrayBuffer);
        const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');
        return kml(kmlDom);

      case 'dxf':
        const dxfText = new TextDecoder().decode(arrayBuffer);
        const parser = new DxfParser();
        const dxf = parser.parseSync(dxfText);
        return this.dxfToGeoJSON(dxf);

      case 'json':
      case 'geojson':
        return JSON.parse(new TextDecoder().decode(arrayBuffer));

      case 'gpkg': {
        // GeoPackage: parse di sisi client untuk menghindari limit Vercel
        try {
          const { GeoPackageAPI } = await import('@ngageoint/geopackage');
          
          const uint8 = new Uint8Array(arrayBuffer);
          const geoPackage = await GeoPackageAPI.open(uint8);
          const allFeatures: any[] = [];
          const featureTableNames = geoPackage.getFeatureTables();
          
          for (const tableName of featureTableNames) {
            const featureDao = geoPackage.getFeatureDao(tableName) as any;
            const featureRows = featureDao.queryForAll();
            
            for (const row of featureRows) {
              try {
                const rowAny = row as any;
                
                // Coba gunakan toGeoJSON bawaan jika ada
                if (typeof rowAny.toGeoJSON === 'function') {
                  try {
                    const feature = rowAny.toGeoJSON();
                    if (feature && feature.geometry) {
                      allFeatures.push(feature);
                      continue;
                    }
                  } catch (e) {
                    console.warn("row.toGeoJSON failed, falling back:", e);
                  }
                }
                
                // Coba berbagai cara untuk mendapatkan data geometri
                let geometry = rowAny.geometry;
                if (!geometry && typeof rowAny.getGeometry === 'function') {
                  geometry = rowAny.getGeometry();
                }
                if (!geometry && featureDao.geometryColumnName) {
                  geometry = rowAny.getValue(featureDao.geometryColumnName);
                }
                
                if (!geometry) continue;
                
                // Fleksibel: gunakan geometry.geometry jika ada, atau geometry itu sendiri
                const geom = geometry.geometry || geometry;
                
                const geojsonGeom = parseGeoPackageGeometry(geom);
                if (!geojsonGeom) continue;
                
                const properties: Record<string, any> = {};
                const columnNames = rowAny.columnNames;
                for (const col of columnNames) {
                  if (col === featureDao.geometryColumnName || col === 'id') continue;
                  properties[col] = rowAny.getValue(col);
                }
                
                allFeatures.push({
                  type: 'Feature',
                  properties,
                  geometry: geojsonGeom,
                });
              } catch (featureErr) {
                console.warn(`Skipping feature in table ${tableName}:`, featureErr);
              }
            }
          }
          
          geoPackage.close();
          
          if (allFeatures.length === 0) {
            throw new Error('GeoPackage tidak memiliki fitur geometri yang valid.');
          }
          
          return {
            type: 'FeatureCollection',
            features: allFeatures,
          };
        } catch (err: any) {
          console.error("GeoPackage parse error:", err);
          throw new Error(`Gagal membaca GeoPackage di browser: ${err.message || 'Unknown error'}`);
        }
      }

      default:
        throw new Error(`Format file .${extension} tidak didukung.`);
    }
  }

  /**
   * Transform GeoJSON coordinates from source to target CRS
   */
  static transform(geojson: any, options: ConversionOptions): any {
    const source = options.sourceCrs || 'EPSG:4326';
    const target = options.targetCrs;

    if (source === target) return geojson;

    return reproject(geojson, source, target, proj4.defs);
  }

  /**
   * Export GeoJSON to the requested format as a Blob
   */
  static async export(geojson: any, format: SpatialFormat): Promise<Blob> {
    switch (format) {
      case 'geojson':
        return new Blob([JSON.stringify(geojson)], { type: 'application/json' });

      case 'kml':
        const kmlString = tokml(geojson);
        return new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });

      case 'shp':
        // shp-write usually returns a zip blob
        const shpBuffer = await new Promise<any>((resolve) => {
          shpwrite.zip(geojson, { outputType: 'blob' }).then(resolve);
        });
        return shpBuffer;

      case 'dxf':
        const dxfString = this.geoJSONToDxf(geojson);
        return new Blob([dxfString], { type: 'application/dxf' });

      default:
        throw new Error(`Format output ${format} tidak didukung.`);
    }
  }

  /**
   * Simple DXF to GeoJSON converter (Entities to Features)
   */
  private static dxfToGeoJSON(dxf: any): any {
    const features: any[] = [];
    
    dxf.entities.forEach((entity: any) => {
      let geometry: any = null;
      
      if (entity.type === 'LINE') {
        geometry = {
          type: 'LineString',
          coordinates: [
            [entity.vertices[0].x, entity.vertices[0].y],
            [entity.vertices[1].x, entity.vertices[1].y]
          ]
        };
      } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
        geometry = {
          type: 'LineString',
          coordinates: entity.vertices.map((v: any) => [v.x, v.y])
        };
      } else if (entity.type === 'POINT') {
        geometry = {
          type: 'Point',
          coordinates: [entity.position.x, entity.position.y]
        };
      } else if (entity.type === 'CIRCLE') {
         // Simple approximation or center point
         geometry = {
            type: 'Point',
            coordinates: [entity.center.x, entity.center.y]
         };
      }

      if (geometry) {
        features.push({
          type: 'Feature',
          properties: { 
            layer: entity.layer,
            handle: entity.handle,
            type: entity.type
          },
          geometry
        });
      }
    });

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Simple GeoJSON to DXF converter
   */
  private static geoJSONToDxf(geojson: any): string {
    const drawing = new DxfWriter();
    
    const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
    
    features.forEach((f: any) => {
      const g = f.geometry;
      if (!g) return;

      if (g.type === 'Point') {
        drawing.drawPoint(g.coordinates[0], g.coordinates[1]);
      } else if (g.type === 'LineString') {
        const points = g.coordinates.map((c: any) => [c[0], c[1]]);
        drawing.drawPolyline(points);
      } else if (g.type === 'Polygon') {
        // Multi-line for polygon rings
        g.coordinates.forEach((ring: any) => {
          const points = ring.map((c: any) => [c[0], c[1]]);
          drawing.drawPolyline(points, true); // Closed
        });
      } else if (g.type === 'MultiLineString') {
        g.coordinates.forEach((line: any) => {
          const points = line.map((c: any) => [c[0], c[1]]);
          drawing.drawPolyline(points);
        });
      }
    });

    return drawing.toDxfString();
  }
}
