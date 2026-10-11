import { supabase } from './supabase';
import { validateGeometryOptions } from './geometryCalculation';

/** Merge one numeric field against fresh server properties, with optimistic concurrency. */
export async function saveCalculatedAttribute(layerId: string, featureId: string, field: string, value: number) {
  validateGeometryOptions({ metric: 'area', unit: 'm2', field, precision: 2 });
  if (!Number.isFinite(value)) throw new Error('Nilai atribut bukan angka yang valid.');
  const { data: current, error: readError } = await supabase.from('geometries')
    .select('id,properties').eq('id', featureId).eq('layer_id', layerId).maybeSingle();
  if (readError || !current) throw new Error(readError?.message || 'Fitur tidak tersedia atau izin tidak mencukupi.');
  const properties = { ...(current.properties || {}), [field]: value };
  const { data: saved, error } = await supabase.from('geometries')
    .update({ properties })
    .eq('id', featureId)
    .eq('layer_id', layerId)
    .select('id,properties')
    .maybeSingle();
  if (error || !saved) throw new Error(error?.message || 'Data berubah di server atau tidak dapat diperbarui. Muat ulang lalu coba lagi.');
  if (saved.properties?.[field] !== value) throw new Error('Nilai tersimpan tidak cocok. Muat ulang layer untuk memeriksa hasil.');
}
