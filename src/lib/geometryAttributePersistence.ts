import type { Feature, FeatureCollection } from 'geojson';
import { applyGeometryValues, type GeometryValue } from './geometryCalculation';

/** Explicit partial-success semantics: never update unsaved rows in the UI. */
export async function persistGeometryValues(
  collection: FeatureCollection,
  values: GeometryValue[],
  field: string,
  local: boolean,
  canWriteCloud: boolean,
  writers: {
    saveLocal: (next: FeatureCollection) => Promise<void>;
    writeCloud: (feature: Feature, value: GeometryValue) => Promise<void>;
  },
  onProgress?: (saved: number, total: number) => void,
): Promise<{ collection: FeatureCollection; savedCount: number; error?: string }> {
  const next = applyGeometryValues(collection, values, field);
  if (local) {
    await writers.saveLocal(next);
    onProgress?.(values.length, values.length);
    return { collection: next, savedCount: values.length };
  }
  if (!canWriteCloud) throw new Error('Guest tidak dapat mengubah layer cloud. Gunakan layer lokal.');
  const ids = values.map(row => collection.features[row.index]?.properties?.db_id);
  if (ids.some(id => typeof id !== 'string' || !id)) throw new Error('ID database tidak tersedia. Muat ulang layer tanpa dissolve sebelum menyimpan.');
  if (new Set(ids).size !== ids.length) throw new Error('ID database duplikat. Muat ulang layer sebelum menyimpan.');
  const saved: GeometryValue[] = [];
  let error: string | undefined;
  for (const row of values) {
    try {
      await writers.writeCloud(collection.features[row.index], row);
      saved.push(row);
      onProgress?.(saved.length, values.length);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      break;
    }
  }
  return { collection: applyGeometryValues(collection, saved, field), savedCount: saved.length, error };
}
