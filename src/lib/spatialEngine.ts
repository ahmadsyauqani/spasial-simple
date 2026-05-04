import * as turf from "@turf/turf";
import shp from "shpjs";
import { kml } from "@tmcw/togeojson";

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
      throw new Error("Format tidak didukung. Unggah .zip (Shapefile), .gdb.zip (File Geodatabase), .rar, .kml, .geojson, atau .json");
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
