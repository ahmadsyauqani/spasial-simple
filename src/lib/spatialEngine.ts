import * as turf from "@turf/turf";
import shp from "shpjs";
import { kml } from "@tmcw/togeojson";

/**
 * Convert GeoPackage geometry object to GeoJSON geometry
 */
export function parseGeoPackageGeometry(geom: any): any {
  if (!geom) return null;

  if (typeof geom.toGeoJSON === 'function') {
    return geom.toGeoJSON();
  }

  const geomType = geom.geometryType || geom.type;

  if (geomType === 'Point' || geomType === 0) {
    return {
      type: 'Point',
      coordinates: [geom.x, geom.y, ...(geom.z !== undefined ? [geom.z] : [])],
    };
  }

  // Fallback untuk Point jika geometryType tidak terdefinisi tapi punya x dan y
  if (geom.x !== undefined && geom.y !== undefined) {
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

  if (geomType === 'GeometryCollection' || geomType === 6) {
    const geometries = (geom.geometries || [])
      .map((g: any) => parseGeoPackageGeometry(g))
      .filter(Boolean);
    return { type: 'GeometryCollection', geometries };
  }

  return null;
}

export async function parseSpatialFile(file: File): Promise<any> {
  let extension = file.name.split(".").pop()?.toLowerCase();
  
  // Deteksi khusus jika ekstensi gdb.zip
  if (file.name.toLowerCase().endsWith(".gdb.zip")) {
    extension = "gdbzip";
  }

  let geojson = null;

  try {
    if (extension === "gdbzip") {
      const buffer = await file.arrayBuffer();
      geojson = await processGdb(buffer);
    } else if (extension === "zip") {
      // Assuming Shapefile inside ZIP
      const buffer = await file.arrayBuffer();
      try {
        geojson = await shp(buffer.slice(0));
      } catch (err: any) {
        if (err.message && err.message.toLowerCase().includes("no layers")) {
           // Fallback to GDB
           try {
             geojson = await processGdb(buffer.slice(0));
           } catch(e) {
             throw new Error("Gagal membaca .zip sebagai Shapefile maupun File Geodatabase. Pastikan file valid.");
           }
        } else {
          throw err;
        }
      }
    } else if (extension === "rar") {
      const buffer = await file.arrayBuffer();
      try {
        const unrar = require('unrar.js/lib/Unrar');
        const JSZip = require('jszip');
        const files = unrar(buffer);
        const zip = new JSZip();
        
        let hasFiles = false;
        for (const f of files) {
          if (f.fileData && f.filename) {
            zip.file(f.filename, f.fileData);
            hasFiles = true;
          }
        }
        
        if (!hasFiles) throw new Error("File RAR kosong atau format tidak didukung (RAR5 tidak disupport).");
        
        const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
        geojson = await shp(zipBuffer);
      } catch (err: any) {
        throw new Error("Gagal mengekstrak RAR. Kemungkinan format RAR5 baru atau password-protected. Mohon ekstrak dan jadikan .zip: " + err.message);
      }
    } else if (extension === "gpkg") {
      // GeoPackage: kirim ke Python API untuk konversi (Opsi 2)
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        // Coba ambil URL API dari environment, jika tidak ada fallback ke localhost
        const apiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8000';
        
        const response = await fetch(`${apiUrl}/convert-gpkg`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Server error: ${response.status}`);
        }
        
        geojson = await response.json();
      } catch (err: any) {
        console.error("GeoPackage API error:", err);
        throw new Error(`Gagal mengonversi GeoPackage melalui Python API: ${err.message || 'Unknown error'}. Pastikan server Python berjalan.`);
      }
    } else if (extension === "kmz") {
      try {
        const formData = new FormData();
        formData.append("file", file);
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_PYTHON_API_URL}/convert-kmz`, {
          method: "POST",
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        geojson = data.geojson;
        console.log("[spatialEngine] Received KMZ GeoJSON from Python:", geojson);
        console.log("[spatialEngine] Debug logs from Python:", data.debug_logs);
      } catch (err: any) {
        console.error("KMZ API error:", err);
        throw new Error(`Gagal mengonversi KMZ melalui Python API: ${err.message || 'Unknown error'}`);
      }
    } else if (extension === "kml") {
      const text = await file.text();
      const dom = new DOMParser().parseFromString(text, "text/xml");
      geojson = kml(dom);
    } else if (extension === "geojson" || extension === "json") {
      const text = await file.text();
      geojson = JSON.parse(text);
    } else if (extension === "dxf") {
      throw new Error("DXF parsing is not fully implemented yet.");
      // Will require dxf-parser and turf.polygonize
    } else {
      throw new Error("Format tidak didukung. Unggah .zip (Shapefile), .gdb.zip (File Geodatabase), .rar, .kml, .kmz, .gpkg (GeoPackage), .geojson, atau .json");
    }

    // Normalize to single FeatureCollection
    if (Array.isArray(geojson)) {
      geojson = {
        type: "FeatureCollection",
        features: geojson.flatMap((g: any) => g.features || []),
      };
    } else if (geojson.type !== "FeatureCollection") {
      geojson = turf.featureCollection([geojson as any]);
    }

    // Memeriksa rentang koordinat untuk memastikan format adalah derajat WGS 84
    const bounds = turf.bbox(geojson);
    if (bounds[0] < -181 || bounds[1] < -91 || bounds[2] > 181 || bounds[3] > 91) {
      const metricError = new Error("File menggunakan koordinat sistem Meter (UTM/TM-3/WebMercator dsb). Sangat butuh kalibrasi proyeksi asal.");
      (metricError as any).isMetric = true;
      (metricError as any).geojsonData = geojson;
      throw metricError;
    }

    // Topology Check: The Satpam 
    // (Kami rubah dari Error keras menjadi Peringatan lembut, karena database PostGIS 
    // sebenarnya mampu menampung & memperbaiki cacat Self-Intersection secara otomatis 
    // menggunakan ST_MakeValid/ST_Buffer ke depannya).
    const validationErrors = checkTopology(geojson);
    if (validationErrors.length > 0) {
      console.warn(`Peringatan: Ditemukan ${validationErrors.length} fitur dengan potensi cacat topologi (kinks/self-intersection). Melanjutkan proses...`);
    }

    return geojson;
  } catch (error: any) {
    throw new Error(error.message || "Gagal memproses file spasial.");
  }
}

function checkTopology(geojson: any) {
  const errors: any[] = [];
  turf.featureEach(geojson, (currentFeature, featureIndex) => {
    if (currentFeature.geometry.type === "Polygon" || currentFeature.geometry.type === "MultiPolygon") {
      const kinks = turf.kinks(currentFeature as any);
      if (kinks.features.length > 0) {
        errors.push({
          index: featureIndex,
          kinks: kinks,
        });
      }
    }
  });
  return errors;
}

async function processGdb(buffer: ArrayBuffer) {
  const fgdb = require('fgdb');
  const gdbData = await fgdb(buffer);
  
  const allFeatures: any[] = [];
  if (typeof gdbData === 'object' && gdbData !== null) {
    Object.values(gdbData).forEach((collection: any) => {
      if (collection && collection.type === 'FeatureCollection' && Array.isArray(collection.features)) {
         allFeatures.push(...collection.features);
      }
    });
  }
  
  if (allFeatures.length === 0) {
     throw new Error("Gagal mengekstrak GDB atau GDB tidak memiliki fitur geometri yang valid.");
  }
  
  return turf.featureCollection(allFeatures);
}
