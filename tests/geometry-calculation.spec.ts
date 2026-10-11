import { test, expect } from '@playwright/test';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { calculateGeometryAttributes, applyGeometryValues, validateGeometryOptions, type GeometryCalculationOptions } from '../src/lib/geometryCalculation';
import { persistGeometryValues } from '../src/lib/geometryAttributePersistence';

test('attribute persistence saves local results only after durable write and reports verified partial cloud success', async () => {
  const input = fc(feature(square(),{db_id:'a',owner:'Budi'}),feature(square(),{db_id:'b'}),feature(square(),{db_id:'c'}));
  const rows = (await calculateGeometryAttributes(input,[0,1,2],options)).values;
  const writes: number[] = [];
  const cloud = await persistGeometryValues(input,rows,'luas_m2',false,true,{
    saveLocal: async () => { throw new Error('not local'); },
    writeCloud: async (_feature,row) => { if (row.index === 1) throw new Error('network failure'); writes.push(row.index); },
  });
  expect(writes).toEqual([0]);
  expect(cloud.savedCount).toBe(1);
  expect(cloud.error).toContain('network failure');
  expect(cloud.collection.features[0].properties?.luas_m2).toBeGreaterThan(0);
  expect(cloud.collection.features[1].properties?.luas_m2).toBeUndefined();
  let saved: FeatureCollection | null = null;
  const local = await persistGeometryValues(input,rows,'luas_m2',true,false,{
    saveLocal: async data => { saved = data; },
    writeCloud: async () => { throw new Error('Guest must not write cloud'); },
  });
  expect(local.collection).toBe(saved);
  expect(local.savedCount).toBe(3);
  await expect(persistGeometryValues(input,rows,'luas_m2',true,false,{
    saveLocal: async () => { throw new Error('disk full'); }, writeCloud: async () => {},
  })).rejects.toThrow('disk full');
});

test('cloud permissions and missing/duplicate db IDs block all writes, never pretend saved locally', async () => {
  const input = fc(feature(square()),feature(square(),{db_id:'a'}));
  const rows = (await calculateGeometryAttributes(input,[0,1],options)).values;
  let calls = 0;
  const writers = { saveLocal: async () => { calls++; }, writeCloud: async () => { calls++; } };
  await expect(persistGeometryValues(input,rows,'luas_m2',false,false,writers)).rejects.toThrow('Guest');
  await expect(persistGeometryValues(input,rows,'luas_m2',false,true,writers)).rejects.toThrow('ID database');
  const dup = fc(feature(square(),{db_id:'a'}),feature(square(),{db_id:'a'}));
  await expect(persistGeometryValues(dup,rows,'luas_m2',false,true,writers)).rejects.toThrow('duplikat');
  expect(calls).toBe(0);
});

type TestFeature = Omit<Feature, 'geometry'> & { geometry: Geometry | null };
const feature = (geometry: Geometry | null, properties: Record<string, unknown> = {}): TestFeature => ({ type: 'Feature', geometry, properties });
const square = (x = 0, y = 0, size = 1): Geometry => ({ type: 'Polygon', coordinates: [[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]] });
const fc = (...features: TestFeature[]): FeatureCollection => ({ type: 'FeatureCollection', features: features as Feature[] });
const options: GeometryCalculationOptions = { metric: 'area', unit: 'm2', field: 'luas_m2', precision: 2 };

// Independent spherical reference: one-degree rectangle on the equator.
const radians = Math.PI / 180;
const equatorialArea = 6371008.8 ** 2 * radians * Math.sin(radians);

test('area is numeric in m², ha and km²; properties and geometry stay immutable', async () => {
  const input = fc(feature(square(), { NIB: 'A', owner: 'Budi' }));
  const original = JSON.stringify(input);
  for (const [unit, divisor] of [['m2',1], ['ha',10000], ['km2',1000000]] as const) {
    const result = await calculateGeometryAttributes(input, [0], { ...options, unit });
    expect(result.values[0].value).toBeCloseTo(equatorialArea / divisor, 2);
    const updated = applyGeometryValues(input, result.values, options.field);
    expect(typeof updated.features[0].properties?.luas_m2).toBe('number');
    expect(updated.features[0].properties?.NIB).toBe('A');
    expect(updated.features[0].geometry).toBe(input.features[0].geometry);
  }
  expect(JSON.stringify(input)).toBe(original);
});

test('professional planar methods calculate in projected meters and preserve the original WGS84 geometry', async () => {
  const input = fc(feature({ type: 'Polygon', coordinates: [[[110,-7],[110.001,-7],[110.001,-6.999],[110,-6.999],[110,-7]]] }));
  const original = JSON.stringify(input);
  const wgs = await calculateGeometryAttributes(input, [0], { ...options, method: 'wgs84' });
  const utm = await calculateGeometryAttributes(input, [0], { ...options, method: 'utm' });
  const tm3 = await calculateGeometryAttributes(input, [0], { ...options, method: 'tm3' });
  expect(wgs.values[0].value).toBeGreaterThan(0);
  expect(utm.values[0].value).toBeGreaterThan(0);
  expect(tm3.values[0].value).toBeGreaterThan(0);
  expect(utm.values[0].value).toBeCloseTo(tm3.values[0].value, -1);
  expect(JSON.stringify(input)).toBe(original);
  const degrees = await calculateGeometryAttributes(input, [0], { ...options, method: 'utm', metric: 'longitude', unit: 'degrees', field: 'centroid_x', precision: 6 });
  expect(degrees.values[0].value).toBeCloseTo(110.0005, 4);
});


test('polygon holes and multipart perimeters include every ring without bridging components', async () => {
  const outer = [[0,0],[1,0],[1,1],[0,1],[0,0]];
  const hole = [[0.2,0.2],[0.2,0.3],[0.3,0.3],[0.3,0.2],[0.2,0.2]];
  const input = fc(feature({ type: 'Polygon', coordinates: [outer, hole] }));
  const all = await calculateGeometryAttributes(input, [0], { ...options, metric: 'perimeter', unit: 'm' });
  const parts = await calculateGeometryAttributes(fc(feature({type:'LineString',coordinates:outer}), feature({type:'LineString',coordinates:hole})), [0,1], {...options, metric:'length',unit:'m',precision:6});
  expect(all.values[0].value).toBeCloseTo(parts.values.reduce((sum, row) => sum + row.value, 0), 2);
  const area = await calculateGeometryAttributes(input, [0], options);
  const expectedHole = 6371008.8 ** 2 * (0.1 * radians) * (Math.sin(0.3*radians)-Math.sin(0.2*radians));
  expect(area.values[0].value).toBeCloseTo(equatorialArea - expectedHole, 2);
  const multi = fc(feature({ type:'MultiPolygon',coordinates: [(square() as any).coordinates,(square(3) as any).coordinates] }));
  const multiArea = await calculateGeometryAttributes(multi,[0],options);
  expect(multiArea.values[0].value).toBeCloseTo(equatorialArea * 2, 2);
});

test('length and vertex-centroid coordinates support multipart lines and points', async () => {
  const line = fc(feature({type:'MultiLineString',coordinates:[[[0,0],[1,0]],[[2,0],[3,0]]]}));
  const length = await calculateGeometryAttributes(line,[0],{...options,metric:'length',unit:'km',precision:5});
  expect(length.values[0].value).toBeCloseTo(2 * 6371008.8 * radians / 1000, 5);
  const pts = fc(feature({type:'MultiPoint',coordinates:[[110,-7],[112,-9]]}));
  for (const [metric, expected] of [['longitude',111],['latitude',-8]] as const) {
    const result = await calculateGeometryAttributes(pts,[0],{...options,metric,unit:'degrees',precision:6});
    expect(result.values[0].value).toBe(expected);
  }
});

test('null, incompatible, self-crossed and projected coordinates are skipped, not replaced with zero', async () => {
  const input = fc(feature(null,{luas_m2:7}),feature({type:'Point',coordinates:[110,-7]}),feature(square(500000,9000000)),feature({type:'Polygon',coordinates:[[[0,0],[1,1],[0,1],[1,0],[0,0]]]}));
  const result = await calculateGeometryAttributes(input,[0,1,2,3],options);
  expect(result.values).toHaveLength(0);
  expect(result.skipped).toHaveLength(4);
  expect(applyGeometryValues(input,result.values,options.field).features[0].properties?.luas_m2).toBe(7);
});

test('selection uses original indices, deduplicates and ignores excluded rows', async () => {
  const input = fc(feature(square(),{NIB:'A',luas_m2:99}),feature(square(),{NIB:'B',luas_m2:88}),feature(square(),{NIB:'C'}));
  const result = await calculateGeometryAttributes(input,[2,0,2],options);
  expect(result.values.map(row=>row.index)).toEqual([2,0]);
  expect(result.overwriteCount).toBe(1);
  const next = applyGeometryValues(input,result.values,options.field);
  expect(next.features[1]).toBe(input.features[1]);
  expect(next.features[1].properties?.luas_m2).toBe(88);
  expect(next.features[2].properties?.luas_m2).toBeGreaterThan(0);
  await expect(calculateGeometryAttributes(input,[99],options)).rejects.toThrow();
});

test('invalid field names/internal IDs, mismatched units and precision are rejected', () => {
  for (const field of ['','__proto__','constructor','prototype','db_id','FID','id','nama layer']) {
    expect(() => validateGeometryOptions({...options,field})).toThrow();
  }
  expect(() => validateGeometryOptions({...options,precision:9})).toThrow();
  expect(() => validateGeometryOptions({...options,precision:NaN})).toThrow();
  expect(() => validateGeometryOptions({...options,unit:'km'})).toThrow();
});
