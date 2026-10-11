"use client";

import { useEffect, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { Calculator, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useMapContext } from '@/lib/MapContext';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/offlineDb';
import { calculateGeometryAttributes, GEOMETRY_METHODS, GEOMETRY_METRICS, GEOMETRY_UNITS, type GeometryMethod, type GeometryMetric, type GeometryUnit, type GeometryCalculation, type GeometryCalculationOptions } from '@/lib/geometryCalculation';
import { persistGeometryValues } from '@/lib/geometryAttributePersistence';
import { saveCalculatedAttribute } from '@/lib/saveCalculatedAttribute';
import styles from './CalculateGeometryDialog.module.css';

type Scope = 'all' | 'filtered' | 'selected';
type Preview = { data: FeatureCollection; result: GeometryCalculation; options: GeometryCalculationOptions };

export function CalculateGeometryDialog({ layerId, filteredIndices, selectedIndices }: {
  layerId: string; filteredIndices: number[]; selectedIndices: number[];
}) {
  const { layers, layerGeojsonCache, cacheLayerGeojson } = useMapContext();
  const { isGuest, user } = useAuth();
  const layer = layers.find(item => item.id === layerId);
  const data = layerGeojsonCache[layerId] as FeatureCollection | undefined;
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<GeometryMetric>('area');
  const [method, setMethod] = useState<GeometryMethod>('wgs84');
  const [unit, setUnit] = useState<GeometryUnit>('m2');
  const [field, setField] = useState('luas_m2');
  const [precision, setPrecision] = useState(2);
  const [scope, setScope] = useState<Scope>('all');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'calculate' | 'save' | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const abort = useRef<AbortController | null>(null);
  const currentData = useRef(data);
  currentData.current = data;
  const local = layerId.startsWith('local-') || layer?.syncStatus === 'local';
  const canSave = local || (!isGuest && Boolean(user));
  const filteredKey = filteredIndices.join(',');
  const selectedKey = selectedIndices.join(',');
  const indices = scope === 'selected' ? selectedIndices : scope === 'filtered' ? filteredIndices : (data?.features.map((_, index) => index) ?? []);

  useEffect(() => {
    setPreview(null);
    setConfirmed(false);
  }, [data, metric, method, unit, field, precision, scope, filteredKey, selectedKey]);
  useEffect(() => () => { abort.current?.abort(); }, []);

  const changeMetric = (next: GeometryMetric) => {
    const nextUnit = GEOMETRY_METRICS[next].units[0];
    setMetric(next);
    setUnit(nextUnit);
    setField(`${GEOMETRY_METRICS[next].field}${nextUnit === 'degrees' ? '' : `_${nextUnit}`}`);
    setPrecision(nextUnit === 'degrees' ? 6 : 2);
  };

  const calculate = async () => {
    if (!data || !indices.length) return;
    setError(''); setStatus(''); setPreview(null); setConfirmed(false);
    const controller = new AbortController();
    abort.current = controller;
    const options = { metric, method, unit, field: field.trim(), precision };
    setBusy('calculate');
    try {
      const result = await calculateGeometryAttributes(data, indices, options,
        (done, total) => setProgress(`Menghitung ${done.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} fitur`), controller.signal);
      if (controller.signal.aborted) return;
      if (currentData.current !== data) throw new Error('Data berubah saat perhitungan. Hitung ulang pratinjau.');
      setPreview({ data, result, options });
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(null); setProgress(''); }
  };

  const save = async () => {
    if (!preview || !layer || !canSave || !preview.result.values.length) return;
    if (preview.result.overwriteCount && !confirmed) return;
    if (currentData.current !== preview.data) { setError('Data berubah. Hitung ulang pratinjau sebelum menyimpan.'); setPreview(null); return; }
    setBusy('save'); setError(''); setStatus('');
    const { options, result, data: source } = preview;
    try {
      const outcome = await persistGeometryValues(source, result.values, options.field, local, !isGuest && Boolean(user), {
        saveLocal: async next => { await db.layers.put({ id: layerId, name: layer.name, geojson: next, lastUpdated: Date.now() }); },
        writeCloud: async (feature, row) => { await saveCalculatedAttribute(layerId, feature.properties!.db_id, options.field, row.value); },
      }, (done, total) => setProgress(`Menyimpan ${done.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} fitur`));
      if (outcome.savedCount) cacheLayerGeojson(layerId, outcome.collection);
      setPreview(null);
      const summary = `${outcome.savedCount.toLocaleString('id-ID')} fitur tersimpan ke kolom ${options.field} (${local ? 'lokal' : 'cloud'}). ${result.skipped.length} dilewati.`;
      setStatus(summary);
      if (outcome.error) setError(`Proses berhenti: ${outcome.error} ${result.values.length - outcome.savedCount} fitur belum tersimpan. Muat ulang layer sebelum mencoba lagi.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); setProgress(''); }
  };

  return <Dialog open={open} onOpenChange={value => {
    if (busy === 'save') return;
    if (!value) abort.current?.abort();
    setOpen(value);
    if (value) { setPreview(null); setError(''); setStatus(''); }
  }}>
    <DialogTrigger className={styles.trigger} disabled={!data?.features.length} aria-label="Calculate Geometry"><Calculator size={15} />Calculate Geometry</DialogTrigger>
    <DialogContent className={styles.dialog} showCloseButton={busy !== 'save'}>
      <DialogHeader>
        <DialogTitle>Calculate Geometry</DialogTitle>
        <DialogDescription>Hitung geometri lalu simpan sebagai kolom angka di atribut. Bentuk bidang dan atribut lainnya tidak diubah.</DialogDescription>
      </DialogHeader>
      <div className={styles.layer}><span>{layer?.name}</span><small>{data?.features.length.toLocaleString('id-ID')} fitur · {local ? 'Penyimpanan lokal' : 'Layer cloud'}</small></div>
      <fieldset disabled={Boolean(busy)} className={styles.form}>
        <label>Cakupan fitur<select value={scope} onChange={event => setScope(event.target.value as Scope)}>
          <option value="all">Seluruh layer ({data?.features.length ?? 0})</option>
          <option value="filtered">Hasil filter tabel ({filteredIndices.length})</option>
          <option value="selected">Fitur terpilih ({selectedIndices.length})</option>
        </select></label>
        <label>Jenis perhitungan<select value={metric} onChange={event => changeMetric(event.target.value as GeometryMetric)}>
          {Object.entries(GEOMETRY_METRICS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
        </select></label>
        <label>Metode pengukuran<select value={method} disabled={metric === 'longitude' || metric === 'latitude'} onChange={event => setMethod(event.target.value as GeometryMethod)}>
          {Object.entries(GEOMETRY_METHODS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
        </select><small>{metric === 'longitude' || metric === 'latitude' ? 'Centroid selalu dihitung sebagai koordinat X/Y WGS84.' : GEOMETRY_METHODS[method].description}</small></label>
        <label>Satuan hasil<select value={unit} onChange={event => setUnit(event.target.value as GeometryUnit)}>
          {GEOMETRY_METRICS[metric].units.map(key => <option key={key} value={key}>{GEOMETRY_UNITS[key]}</option>)}
        </select></label>
        <label>Jumlah desimal<input type="number" min={0} max={8} step={1} value={Number.isNaN(precision) ? '' : precision} onChange={event => setPrecision(event.target.value === '' ? NaN : Number(event.target.value))} /></label>
        <label className={styles.wide}>Nama kolom tujuan<input value={field} onChange={event => setField(event.target.value)} maxLength={63} list={`geometry-fields-${layerId}`} placeholder="Contoh: luas_ha" />
          <datalist id={`geometry-fields-${layerId}`}>{[...new Set(data?.features.flatMap(feature => Object.keys(feature.properties ?? {})) ?? [])].filter(key => !['db_id','FID','id'].includes(key)).map(key=><option key={key} value={key} />)}</datalist>
        </label>
      </fieldset>
      <p className={styles.note}>Metode <strong>{GEOMETRY_METHODS[method].label}</strong>. Luas/keliling/panjang memakai perhitungan {method === 'wgs84' ? 'geodesik permukaan bumi' : 'planar berbasis proyeksi lokal meter'}. Keliling mencakup ring luar dan lubang. Centroid = rata-rata vertex, bukan pusat massa; titik selalu X/Y WGS84. Nilai tidak dihitung ulang otomatis setelah geometri diedit.</p>
      {!canSave && <p className={styles.note}>Guest boleh melihat pratinjau, tetapi tidak dapat mengubah atribut layer cloud.</p>}
      {busy && <div className={styles.progress} aria-live="polite"><Loader2 size={16} className="animate-spin" />{progress || 'Menyiapkan…'}</div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {status && <p role="status" className={styles.success}>{status}</p>}
      {preview && <section className={styles.preview} aria-label="Pratinjau hasil geometri">
        <strong data-testid="geometry-preview-summary">{preview.result.values.length} dihitung · {preview.result.skipped.length} dilewati</strong>
        <small>Metode {GEOMETRY_METHODS[preview.options.method ?? 'wgs84'].label} · kolom {preview.options.field} · {GEOMETRY_UNITS[preview.options.unit]} · {preview.options.precision} desimal. Pratinjau maksimal 8 baris.</small>
        <div className={styles.tableWrap}><table><thead><tr><th>Fitur</th><th>Nilai lama</th><th>Hasil baru</th></tr></thead><tbody>
          {preview.result.values.slice(0,8).map(row=><tr key={row.index}><td>#{row.index+1}</td><td>{row.previous === undefined || row.previous === null ? '—' : String(row.previous)}</td><td>{row.value.toLocaleString('id-ID', { maximumFractionDigits: 8 })}</td></tr>)}
        </tbody></table></div>
        {preview.result.skipped.length > 0 && <details><summary>Alasan fitur dilewati ({preview.result.skipped.length})</summary><ul>{preview.result.skipped.slice(0,20).map(row=><li key={row.index}>#{row.index+1}: {row.reason}</li>)}</ul>{preview.result.skipped.length > 20 && <small>20 alasan pertama ditampilkan.</small>}</details>}
        {preview.result.overwriteCount > 0 && <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={Boolean(busy)} onChange={event=>setConfirmed(event.target.checked)} />Saya setuju menimpa nilai kolom yang sudah ada<span>({preview.result.overwriteCount} fitur)</span></label>}
      </section>}
      <footer className={styles.footer}>
        <button onClick={() => { abort.current?.abort(); setOpen(false); }} disabled={busy === 'save'}>Tutup</button>
        <button onClick={calculate} disabled={Boolean(busy) || !indices.length}>Hitung pratinjau</button>
        <button className={styles.primary} onClick={save} disabled={Boolean(busy) || !canSave || !preview?.result.values.length || (preview.result.overwriteCount > 0 && !confirmed)}>Simpan ke atribut</button>
      </footer>
    </DialogContent>
  </Dialog>;
}
