"use client";

import { useState } from "react";
import { useMapContext } from "@/lib/MapContext";
import * as turf from "@turf/turf";
import { toast } from "sonner";
import { Loader2, Trash2, ShieldCheck, AlertTriangle, CheckSquare, Square, MapPin, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { updateGeometryInSupabase } from "@/lib/database";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TopologyValidationButton() {
  const {
    layers,
    layerGeojsonCache,
    topologyErrors,
    setTopologyErrors,
    setZoomFeature,
    cacheLayerGeojson,
  } = useMapContext();

  const [isOpen, setIsOpen] = useState(false);
  const [targetLayerId, setTargetLayerId] = useState("");
  const [referenceLayerId, setReferenceLayerId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");

  // States for 17 Rules
  const [rules, setRules] = useState({
    pointDuplicate: true,
    pointInsidePolygon: true,
    pointCoveredByPolygon: false,
    pointNotOverlap: true,
    pointMinDistance: true,
    pointNotNull: true,
    pointValid: true,
    pointNotMultipart: true,
    pointPrecision: false,
    pointHasAttribute: false,
    pointUniqueId: true,
    pointSnap: false,
    pointWithinBoundary: false,
    pointZValue: false,
    pointTemporal: false,
    pointOnLine: false,
    pointOnBoundary: false,
    polygonSelfIntersection: true,
    polygonClosed: true,
    polygonValid: true,
    polygonNotMultipart: false,
    polygonDuplicateId: true,
    polygonOverlap: true,
    polygonGap: false,
  });

  // States for parameters
  const [minDistance, setMinDistance] = useState(1); // meters
  const [precisionDecimals, setPrecisionDecimals] = useState(6);
  const [requiredFieldName, setRequiredFieldName] = useState("");
  const [dateFieldName, setDateFieldName] = useState("");
  const [snapTolerance, setSnapTolerance] = useState(1); // meters
  const [parcelIdField, setParcelIdField] = useState("NIB");
  const [isFixing, setIsFixing] = useState(false);

  const toggleRule = (ruleKey: keyof typeof rules) => {
    setRules(prev => ({ ...prev, [ruleKey]: !prev[ruleKey] }));
  };

  const availableLayers = layers.filter((l) => l.id && layerGeojsonCache[l.id]);
  const selectedLayer = layers.find(l => l.id === targetLayerId);
  
  const fc = targetLayerId ? layerGeojsonCache[targetLayerId] : null;
  const isPointLayer = 
    selectedLayer?.geometryType === 'Point' || 
    fc?.features?.[0]?.geometry?.type === 'Point' || 
    fc?.features?.[0]?.geometry?.type === 'MultiPoint' ||
    selectedLayer?.name?.toLowerCase().includes('point') ||
    selectedLayer?.name?.toLowerCase().includes('titik');
  const isPolygonLayer =
    selectedLayer?.geometryType === 'Polygon' ||
    fc?.features?.[0]?.geometry?.type === 'Polygon' ||
    fc?.features?.[0]?.geometry?.type === 'MultiPolygon';
  const pointReferenceRuleActive = isPointLayer && (
    rules.pointInsidePolygon || rules.pointCoveredByPolygon || rules.pointWithinBoundary ||
    rules.pointSnap || rules.pointOnLine || rules.pointOnBoundary
  );
  const referenceRequired = pointReferenceRuleActive || (isPolygonLayer && rules.polygonGap);

  const countDecimals = (num: number) => {
    if (Math.floor(num) === num) return 0;
    const parts = num.toString().split(".");
    return parts[1] ? parts[1].length : 0;
  };

  const formatDistance = (meters: number) => meters >= 1000
    ? `${(meters / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} km`
    : `${meters.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m`;

  const getFeatureMetrics = (feature: any) => {
    const type = feature?.geometry?.type;
    let area = 0;
    let length = 0;
    try {
      if (type === 'Polygon' || type === 'MultiPolygon') {
        area = turf.area(feature);
        length = turf.length(turf.polygonToLine(feature), { units: 'meters' });
      } else if (type === 'LineString' || type === 'MultiLineString') {
        length = turf.length(feature, { units: 'meters' });
      }
    } catch (_) {}
    return { area, length };
  };

  const closeGeometryRings = (geometry: any) => {
    const closeRing = (ring: any[]) => {
      if (!Array.isArray(ring) || ring.length < 3) return ring;
      const first = ring[0];
      const last = ring[ring.length - 1];
      return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, [...first]];
    };
    if (geometry?.type === 'Polygon') {
      return { ...geometry, coordinates: geometry.coordinates.map(closeRing) };
    }
    if (geometry?.type === 'MultiPolygon') {
      return { ...geometry, coordinates: geometry.coordinates.map((polygon: any[]) => polygon.map(closeRing)) };
    }
    return geometry;
  };

  const canAutoRepair = (error: any) => ['polygon-not-closed', 'self-intersection'].includes(error.properties?.type);

  const zoomToValidationError = (error: any) => {
    if (!error?.geometry) return;
    setZoomFeature({ type: 'Feature', properties: error.properties || {}, geometry: error.geometry });
  };

  const repairValidationError = async (error: any, errorIndex: number) => {
    if (!targetLayerId || !fc || !canAutoRepair(error)) return;
    const featureIndex = error.properties?.featureIndex;
    const original = Number.isInteger(featureIndex) ? fc.features[featureIndex] : null;
    if (!original?.geometry) {
      toast.error("Geometri sumber tidak ditemukan.");
      return;
    }

    setIsFixing(true);
    try {
      let repairedGeometry = closeGeometryRings(original.geometry);
      if (error.properties?.type === 'self-intersection') {
        const unkinked = (turf as any).unkinkPolygon({ ...original, geometry: repairedGeometry });
        if (unkinked?.features?.length === 1) {
          repairedGeometry = unkinked.features[0].geometry;
        } else if (unkinked?.features?.length > 1) {
          repairedGeometry = {
            type: 'MultiPolygon',
            coordinates: unkinked.features.map((part: any) => part.geometry.coordinates).flat(),
          };
        }
      }

      const updatedFeature = { ...original, geometry: repairedGeometry };
      const updatedFeatures = [...fc.features];
      updatedFeatures[featureIndex] = updatedFeature;
      cacheLayerGeojson(targetLayerId, { ...fc, features: updatedFeatures });

      if (original.properties?.db_id) {
        await updateGeometryInSupabase(original.properties.db_id, repairedGeometry);
      }

      setTopologyErrors((previous: any) => {
        if (!previous?.features) return null;
        const remaining = previous.features.filter((_: any, index: number) => index !== errorIndex);
        return remaining.length > 0 ? { ...previous, features: remaining } : null;
      });
      toast.success("Geometri berhasil diperbaiki.");
    } catch (err: any) {
      toast.error(`Gagal memperbaiki geometri: ${err.message || err}`);
    } finally {
      setIsFixing(false);
    }
  };

  const runValidation = async () => {
    if (!targetLayerId) {
      toast.error("Pilih layer yang ingin divalidasi!");
      return;
    }

    if (!fc || !fc.features || fc.features.length === 0) {
      toast.error("Tidak ada data untuk divalidasi pada layer ini.");
      return;
    }

    if (!isPointLayer && !isPolygonLayer) {
      toast.error("Validasi bidang hanya bisa digunakan pada layer Polygon/MultiPolygon.");
      return;
    }

    if (referenceRequired && !referenceLayerId) {
      toast.error("Pilih layer referensi untuk aturan spasial yang aktif!");
      return;
    }

    const refFc = referenceLayerId ? layerGeojsonCache[referenceLayerId] : null;
    if (referenceRequired && !refFc?.features?.length) {
      toast.error("Data layer referensi belum tersedia atau masih kosong.");
      return;
    }

    setIsProcessing(true);
    setProgress("Memulai validasi topologi...");

    setTimeout(() => {
      try {
        const errors: any[] = [];
        const features = fc.features;
        if (isPointLayer) {
          // ==========================================
          // POINT VALIDATION (17 Rules)
          // ==========================================
          
          features.forEach((pI: any, i: number) => {
            const geomI = pI.geometry;
            const propsI = pI.properties || {};

            // 6. Point Geometry Not Null
            if (!geomI || !Array.isArray(geomI.coordinates)) {
              if (rules.pointNotNull) {
                errors.push({
                  type: 'point-null-geometry',
                  featureIndex: i,
                  message: `Titik #${i + 1} memiliki geometri kosong (Null).`
                });
              }
              return; // Other point checks need usable coordinates.
            }

            // 7. Point Geometry Valid
            if (rules.pointValid) {
              if (typeof geomI.coordinates[0] !== 'number' || typeof geomI.coordinates[1] !== 'number') {
                errors.push({
                  type: 'point-invalid-geometry',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} memiliki koordinat tidak valid.`
                });
              }
            }

            // 8. Point Must Not Be Multipart
            if (rules.pointNotMultipart) {
              if (geomI.type === 'MultiPoint') {
                errors.push({
                  type: 'point-multipart',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} bertipe MultiPoint (Multipart tidak diperbolehkan).`
                });
              }
            }

            // 14. Point Z Value Check
            if (rules.pointZValue) {
              if (geomI.coordinates.length < 3 || geomI.coordinates[2] === undefined) {
                errors.push({
                  type: 'point-missing-z',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} tidak memiliki nilai elevasi (Z).`
                });
              }
            }

            // 9. Point Coordinate Precision Check
            if (rules.pointPrecision) {
              const decX = countDecimals(geomI.coordinates[0]);
              const decY = countDecimals(geomI.coordinates[1]);
              if (decX > precisionDecimals || decY > precisionDecimals) {
                errors.push({
                  type: 'point-precision-error',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} melebihi presisi koordinat (${decX}, ${decY} > ${precisionDecimals}).`
                });
              }
            }

            // 10. Point Must Have Attribute
            if (rules.pointHasAttribute && requiredFieldName) {
              if (propsI[requiredFieldName] === undefined || propsI[requiredFieldName] === "") {
                errors.push({
                  type: 'point-missing-attribute',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} tidak memiliki atribut wajib '${requiredFieldName}'.`
                });
              }
            }

            // 15. Point Temporal Check
            if (rules.pointTemporal && dateFieldName) {
              const dateVal = propsI[dateFieldName];
              if (!dateVal || isNaN(Date.parse(dateVal))) {
                errors.push({
                  type: 'point-temporal-error',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} memiliki field tanggal '${dateFieldName}' yang tidak valid.`
                });
              }
            }

            // Spatial Checks with Reference Layer
            if (refFc && refFc.features.length > 0) {
              // 2, 3, 13. Inside / Covered By / Within Boundary
              let inside = false;
              refFc.features.forEach((poly: any) => {
                if (poly.geometry.type === 'Polygon' || poly.geometry.type === 'MultiPolygon') {
                  if (turf.booleanPointInPolygon(pI, poly)) {
                    inside = true;
                  }
                }
              });

              if (rules.pointInsidePolygon && !inside) {
                errors.push({
                  type: 'point-outside-polygon',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} berada di luar poligon referensi.`
                });
              }
              if (rules.pointCoveredByPolygon && !inside) {
                errors.push({
                  type: 'point-not-covered',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} tidak tercakup oleh area kerja poligon.`
                });
              }
              if (rules.pointWithinBoundary && !inside) {
                errors.push({
                  type: 'point-outside-boundary',
                  featureIndex: i,
                  geometry: geomI,
                  message: `Titik #${i + 1} keluar dari batas administrasi.`
                });
              }

              // 12. Point Snap Check
              if (rules.pointSnap) {
                let snapped = false;
                refFc.features.forEach((refFeat: any) => {
                  const refCoords = refFeat.geometry.type === 'Point' 
                    ? [refFeat.geometry.coordinates] 
                    : turf.explode(refFeat).features.map(f => f.geometry.coordinates);
                  
                  refCoords.forEach((coord: any) => {
                    const dist = turf.distance(geomI.coordinates, coord, { units: 'meters' });
                    if (dist <= snapTolerance) {
                      snapped = true;
                    }
                  });
                });

                if (!snapped) {
                  errors.push({
                    type: 'point-not-snapped',
                    featureIndex: i,
                    geometry: geomI,
                    message: `Titik #${i + 1} tidak menempel pada objek referensi (Toleransi: ${snapTolerance}m).`
                  });
                }
              }

              // 16. Point Must Be On Line
              if (rules.pointOnLine) {
                let onLine = false;
                refFc.features.forEach((lineFeat: any) => {
                  if (lineFeat.geometry.type === 'LineString' || lineFeat.geometry.type === 'MultiLineString') {
                    const dist = turf.pointToLineDistance(pI, lineFeat, { units: 'meters' });
                    if (dist <= snapTolerance) {
                      onLine = true;
                    }
                  }
                });
                if (!onLine) {
                  errors.push({
                    type: 'point-not-on-line',
                    featureIndex: i,
                    geometry: geomI,
                    message: `Titik #${i + 1} tidak berada di atas garis referensi.`
                  });
                }
              }

              // 17. Point Must Be On Boundary of Polygon
              if (rules.pointOnBoundary) {
                let onBoundary = false;
                refFc.features.forEach((polyFeat: any) => {
                  if (polyFeat.geometry.type === 'Polygon' || polyFeat.geometry.type === 'MultiPolygon') {
                    try {
                      const boundary = turf.polygonToLine(polyFeat);
                      const boundaryFeatures = (boundary as any).type === 'FeatureCollection' ? (boundary as any).features : [boundary];
                      
                      boundaryFeatures.forEach((bFeat: any) => {
                        const dist = turf.pointToLineDistance(pI, bFeat, { units: 'meters' });
                        if (dist <= snapTolerance) {
                          onBoundary = true;
                        }
                      });
                    } catch(e) {
                      console.error("Error converting polygon to line:", e);
                    }
                  }
                });
                if (!onBoundary) {
                  errors.push({
                    type: 'point-not-on-boundary',
                    featureIndex: i,
                    geometry: geomI,
                    message: `Titik #${i + 1} tidak berada di garis batas poligon.`
                  });
                }
              }
            }

            // Loop for comparisons with other features (Duplicates and Min Distance)
            for (let j = i + 1; j < features.length; j++) {
              const pJ = features[j];
              const geomJ = pJ.geometry;

              if (geomI.type === 'Point' && geomJ.type === 'Point') {
                // 1 & 4. Point Duplicate / Overlap
                if (rules.pointDuplicate || rules.pointNotOverlap) {
                  if (geomI.coordinates[0] === geomJ.coordinates[0] && geomI.coordinates[1] === geomJ.coordinates[1]) {
                    errors.push({
                      type: 'point-duplicate',
                      featureIndices: [i, j],
                      geometry: geomI,
                      message: `Titik #${i + 1} duplikat dengan Titik #${j + 1} (Koordinat sama).`
                    });
                  }
                }

                // 5. Point Minimum Distance
                if (rules.pointMinDistance) {
                  const distance = turf.distance(pI, pJ, { units: 'meters' });
                  if (distance < minDistance && distance > 0) {
                    errors.push({
                      type: 'point-too-close',
                      featureIndices: [i, j],
                      geometry: geomI,
                      message: `Jarak Titik #${i + 1} dan Titik #${j + 1} terlalu dekat (${distance.toFixed(2)}m < ${minDistance}m).`
                    });
                  }
                }
              }
            }

            // 11. Unique ID Check (Requires full scan, so we do it per feature vs all)
            if (rules.pointUniqueId) {
              const idI = propsI.id || propsI.ID || pI.id;
              if (idI !== undefined) {
                const dupIdx = features.findIndex((f: any, idx: number) => {
                  const idJ = f.properties?.id || f.properties?.ID || f.id;
                  return idx !== i && idJ === idI;
                });
                if (dupIdx !== -1 && dupIdx > i) { // Only report once
                  errors.push({
                    type: 'point-duplicate-id',
                    featureIndices: [i, dupIdx],
                    geometry: geomI,
                    message: `Titik #${i + 1} memiliki ID duplikat dengan Titik #${dupIdx + 1}: '${idI}'.`
                  });
                }
              }
            }
          });

        } else {
          // POLYGON / PARCEL VALIDATION
          const polygonFeatures = features.filter((feature: any) => {
            const type = feature.geometry?.type;
            return type === 'Polygon' || type === 'MultiPolygon';
          });
          const idBuckets = new Map<string, number[]>();

          const ringsOf = (geometry: any): any[][] => {
            if (geometry?.type === 'Polygon') return geometry.coordinates || [];
            if (geometry?.type === 'MultiPolygon') return (geometry.coordinates || []).flat();
            return [];
          };

          const samePosition = (a: any, b: any) => Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];

          features.forEach((feature: any, idx: number) => {
            const geom = feature.geometry;
            const props = feature.properties || {};
            const type = geom?.type;

            if (rules.polygonValid && (!geom || !['Polygon', 'MultiPolygon'].includes(type))) {
              errors.push({
                type: 'polygon-invalid-geometry',
                featureIndex: idx,
                geometry: geom,
                message: `Fitur #${idx + 1} bukan Polygon/MultiPolygon atau geometrinya kosong.`
              });
              return;
            }

            if (type !== 'Polygon' && type !== 'MultiPolygon') return;

            if (rules.polygonNotMultipart && type === 'MultiPolygon') {
              errors.push({
                type: 'polygon-multipart',
                featureIndex: idx,
                geometry: geom,
                message: `Fitur #${idx + 1} bertipe MultiPolygon (multipart).`
              });
            }

            const rings = ringsOf(geom);
            if (rules.polygonClosed) {
              const openRing = rings.find((ring: any[]) => ring.length < 4 || !samePosition(ring[0], ring[ring.length - 1]));
              if (openRing) {
                errors.push({
                  type: 'polygon-not-closed',
                  featureIndex: idx,
                  geometry: geom,
                  message: `Fitur #${idx + 1} memiliki ring yang belum tertutup.`
                });
              }
            }

            if (rules.polygonValid) {
              let invalidCoordinate = false;
              try {
                turf.coordEach(feature, (coord: any) => {
                  if (!Array.isArray(coord) || !Number.isFinite(coord[0]) || !Number.isFinite(coord[1])) invalidCoordinate = true;
                });
              } catch (_) {
                invalidCoordinate = true;
              }
              if (invalidCoordinate) {
                errors.push({
                  type: 'polygon-invalid-coordinate',
                  featureIndex: idx,
                  geometry: geom,
                  message: `Fitur #${idx + 1} memiliki koordinat yang tidak valid.`
                });
              }
            }

            if (rules.polygonSelfIntersection) {
              try {
                const kinks = (turf as any).kinks(feature);
                if (kinks.features.length > 0) {
                  errors.push({
                    type: 'self-intersection',
                    featureIndex: idx,
                    geometry: kinks.features[0].geometry,
                    message: `Fitur #${idx + 1} menyilang sendiri.`
                  });
                }
              } catch (_) {
                errors.push({
                  type: 'polygon-invalid-topology',
                  featureIndex: idx,
                  geometry: geom,
                  message: `Fitur #${idx + 1} gagal diperiksa topologinya.`
                });
              }
            }

            const parcelId = props[parcelIdField] ?? props[parcelIdField.toUpperCase()] ?? props.NIB ?? props.nib;
            if (rules.polygonDuplicateId && parcelId !== undefined && parcelId !== null && String(parcelId).trim() !== '') {
              const key = String(parcelId).trim().toLowerCase();
              idBuckets.set(key, [...(idBuckets.get(key) || []), idx]);
            }
          });

          if (rules.polygonDuplicateId) {
            idBuckets.forEach((indices, id) => {
              if (indices.length > 1) {
                const first = indices[0];
                errors.push({
                  type: 'polygon-duplicate-id',
                  featureIndex: first,
                  featureIndices: indices,
                  geometry: features[first].geometry,
                  message: `ID ${parcelIdField} '${id}' muncul ${indices.length} kali.`
                });
              }
            });
          }

          if (rules.polygonOverlap) {
            const indexedFeatures = polygonFeatures.map((feature: any) => ({ ...feature }));
            const featureIndexByIndexedFeature = new Map<any, number>();
            indexedFeatures.forEach((feature: any, index: number) => featureIndexByIndexedFeature.set(feature, index));
            const spatialIndex = turf.geojsonRbush();
            spatialIndex.load(indexedFeatures);

            for (let i = 0; i < polygonFeatures.length; i++) {
              const a = polygonFeatures[i];
              const candidateFeatures = spatialIndex.search(a).features;
              for (const indexedB of candidateFeatures) {
                const j = featureIndexByIndexedFeature.get(indexedB);
                if (j === undefined || j <= i) continue;

                const b = polygonFeatures[j];
                try {
                  if (!turf.booleanIntersects(a, b)) continue;
                  const intersection = turf.intersect(turf.featureCollection([a, b]));
                  if (intersection && turf.area(intersection) > 0.01) {
                    const indexA = features.indexOf(a);
                    const indexB = features.indexOf(b);
                    errors.push({
                      type: 'polygon-overlap',
                      featureIndex: indexA,
                      featureIndices: [indexA, indexB],
                      geometry: intersection.geometry,
                      message: `Bidang #${indexA + 1} tumpang tindih dengan bidang #${indexB + 1}.`
                    });
                  }
                } catch (_) {}
              }
            }
          }

          if (rules.polygonGap && refFc?.features?.length) {
            refFc.features.forEach((reference: any, referenceIndex: number) => {
              let remainder = reference;
              for (const parcel of polygonFeatures) {
                if (!remainder) break;
                try {
                  if (turf.booleanIntersects(remainder, parcel)) {
                    remainder = turf.difference(turf.featureCollection([remainder, parcel]));
                  }
                } catch (_) {}
              }
              if (remainder && turf.area(remainder) > 0.01) {
                errors.push({
                  type: 'polygon-gap',
                  featureIndex: 0,
                  geometry: remainder.geometry,
                  message: `Ditemukan gap/celah pada batas referensi #${referenceIndex + 1}.`
                });
              }
            });
          }
        }

        if (errors.length === 0) {
          toast.success("Validasi selesai. Tidak ditemukan kesalahan topologi! 🎉");
          setTopologyErrors(null);
        } else {
          toast.warning(`Ditemukan ${errors.length} kesalahan topologi!`);
          const errorFC = {
            type: "FeatureCollection",
            features: errors.map(err => ({
              type: "Feature",
              properties: { ...err },
              geometry: err.geometry
            }))
          };
          setTopologyErrors(errorFC);
        }

        setIsProcessing(false);
        setProgress("");
      } catch (e: any) {
        console.error("Validation error:", e);
        toast.error("Gagal melakukan validasi: " + e.message);
        setIsProcessing(false);
        setProgress("");
      }
    }, 100);
  };

  const RuleCheckbox = ({ label, ruleKey, description }: { label: string, ruleKey: keyof typeof rules, description: string }) => (
    <div className="flex items-start gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer" onClick={() => toggleRule(ruleKey)}>
      <div className="mt-0.5">
        {rules[ruleKey] ? (
          <CheckSquare className="w-4 h-4 text-amber-500" />
        ) : (
          <Square className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-all outline-none ${
          availableLayers.length === 0
            ? "border-border/40 text-muted-foreground/30 cursor-not-allowed"
            : topologyErrors
              ? "border-amber-500/50 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 shadow-sm shadow-amber-500/10"
              : "border-border text-muted-foreground hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
        }`}
        disabled={availableLayers.length === 0}
        title="Validasi Topologi"
      >
        <ShieldCheck className="w-5 h-5" />
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl bg-card text-card-foreground border-border max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            Validasi Topologi & Bidang Tanah
          </DialogTitle>
          <DialogDescription>
            Periksa geometry, batas bidang, overlap, gap, dan duplikasi ID dalam satu proses.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 flex-1 overflow-hidden">
          {/* Layer Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer Subjek</label>
              <select
                value={targetLayerId}
                onChange={(e) => {
                  setTargetLayerId(e.target.value);
                  setReferenceLayerId("");
                  setTopologyErrors(null);
                }}
                className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                <option value="">— Pilih Layer —</option>
                {availableLayers.map((l) => {
                  const type = l.geometryType || layerGeojsonCache[l.id!]?.features?.[0]?.geometry?.type || "Unknown";
                  return (
                    <option key={l.id} value={l.id}>{l.name} ({type})</option>
                  );
                })}
              </select>
            </div>

            {referenceRequired && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layer Referensi</label>
                <select
                  value={referenceLayerId}
                  onChange={(e) => {
                    setReferenceLayerId(e.target.value);
                    setTopologyErrors(null);
                  }}
                  className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground outline-none focus:ring-2 focus:ring-amber-500/50"
                >
                  <option value="">— Pilih Layer Referensi —</option>
                  {availableLayers
                    .map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.geometryType || "Unknown"})</option>
                    ))
                  }
                </select>
              </div>
            )}
          </div>

          {/* Parameters Grid */}
          {isPointLayer && (
            <div className="grid grid-cols-2 gap-3 border-t border-b border-border/50 py-3">
              {rules.pointMinDistance && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">5. Jarak Minimum (m)</label>
                  <input type="number" value={minDistance} onChange={(e) => setMinDistance(parseFloat(e.target.value) || 0)} className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground" />
                </div>
              )}
              {rules.pointPrecision && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">9. Jumlah Desimal</label>
                  <input type="number" value={precisionDecimals} onChange={(e) => setPrecisionDecimals(parseInt(e.target.value) || 0)} className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground" />
                </div>
              )}
              {rules.pointHasAttribute && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">10. Nama Field Wajib</label>
                  <input type="text" value={requiredFieldName} onChange={(e) => setRequiredFieldName(e.target.value)} className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground" placeholder="Contoh: id_bidang" />
                </div>
              )}
              {rules.pointTemporal && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">15. Field Tanggal</label>
                  <input type="text" value={dateFieldName} onChange={(e) => setDateFieldName(e.target.value)} className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground" placeholder="Contoh: tgl_ukur" />
                </div>
              )}
              {(rules.pointSnap || rules.pointOnLine || rules.pointOnBoundary) && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Toleransi Snap (m)</label>
                  <input type="number" value={snapTolerance} onChange={(e) => setSnapTolerance(parseFloat(e.target.value) || 0)} className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground" />
                </div>
              )}
            </div>
          )}

          {/* Rules List with ScrollArea */}
          {isPointLayer ? (
            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aturan Validasi (Urut Nomor)</label>
              <div className="flex-1 overflow-y-auto border rounded-lg p-2 bg-background/50 max-h-[350px]">
                <div className="space-y-1">
                  <RuleCheckbox label="1. Point Duplicate" ruleKey="pointDuplicate" description="Koordinat tidak boleh sama persis." />
                  <RuleCheckbox label="2. Point Must Be Inside Polygon" ruleKey="pointInsidePolygon" description="Titik harus di dalam poligon referensi." />
                  <RuleCheckbox label="3. Point Must Be Covered By Polygon" ruleKey="pointCoveredByPolygon" description="Titik wajib tercakup area kerja." />
                  <RuleCheckbox label="4. Point Must Not Overlap" ruleKey="pointNotOverlap" description="Titik tidak boleh bertumpuk." />
                  <RuleCheckbox label="5. Point Minimum Distance" ruleKey="pointMinDistance" description="Antar titik memiliki jarak minimum." />
                  <RuleCheckbox label="6. Point Geometry Not Null" ruleKey="pointNotNull" description="Geometri tidak boleh kosong." />
                  <RuleCheckbox label="7. Point Geometry Valid" ruleKey="pointValid" description="Koordinat harus berupa angka valid." />
                  <RuleCheckbox label="8. Point Must Not Be Multipart" ruleKey="pointNotMultipart" description="Tidak boleh bertipe MultiPoint." />
                  <RuleCheckbox label="9. Point Coordinate Precision Check" ruleKey="pointPrecision" description="Presisi koordinat harus sesuai standar." />
                  <RuleCheckbox label="10. Point Must Have Attribute" ruleKey="pointHasAttribute" description="Field tertentu wajib terisi." />
                  <RuleCheckbox label="11. Point Unique ID Check" ruleKey="pointUniqueId" description="ID objek tidak boleh sama." />
                  <RuleCheckbox label="12. Point Snap Check" ruleKey="pointSnap" description="Titik harus menempel pada objek referensi." />
                  <RuleCheckbox label="13. Point Within Boundary" ruleKey="pointWithinBoundary" description="Titik tidak boleh keluar batas administrasi." />
                  <RuleCheckbox label="14. Point Z Value Check" ruleKey="pointZValue" description="Nilai elevasi/Z harus valid." />
                  <RuleCheckbox label="15. Point Temporal Check" ruleKey="pointTemporal" description="Tanggal/waktu data harus valid." />
                  <RuleCheckbox label="16. Point Must Be On Line" ruleKey="pointOnLine" description="Titik harus berada di atas garis referensi." />
                  <RuleCheckbox label="17. Point Must Be On Boundary of Polygon" ruleKey="pointOnBoundary" description="Titik harus berada di garis batas poligon." />
                </div>
              </div>
            </div>
          ) : isPolygonLayer ? (
            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Validasi Bidang Tanah</label>
              <div className="flex flex-col gap-1.5 border-b border-border/50 pb-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Field ID Bidang/NIB</label>
                <input value={parcelIdField} onChange={(e) => setParcelIdField(e.target.value)} className="w-full text-sm p-2 rounded-md bg-background border border-border text-foreground" placeholder="Contoh: NIB" />
              </div>
              <div className="flex-1 overflow-y-auto border rounded-lg p-2 bg-background/50 max-h-[350px]">
                <div className="space-y-1">
                  <RuleCheckbox label="Self-intersection" ruleKey="polygonSelfIntersection" description="Batas bidang tidak boleh menyilang dirinya sendiri." />
                  <RuleCheckbox label="Polygon harus tertutup" ruleKey="polygonClosed" description="Ring harus memiliki minimal 4 titik dan titik awal=akhir." />
                  <RuleCheckbox label="Geometry valid" ruleKey="polygonValid" description="Koordinat dan tipe geometri harus valid." />
                  <RuleCheckbox label="Multipart check" ruleKey="polygonNotMultipart" description="Tandai fitur MultiPolygon/multipart." />
                  <RuleCheckbox label="Duplikasi NIB/ID" ruleKey="polygonDuplicateId" description="ID bidang tidak boleh muncul lebih dari satu kali." />
                  <RuleCheckbox label="Overlap antar bidang" ruleKey="polygonOverlap" description="Deteksi area bidang yang saling tumpang tindih." />
                  <RuleCheckbox label="Gap/celah terhadap referensi" ruleKey="polygonGap" description="Cari area kosong di dalam layer batas referensi." />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Pilih layer Polygon/MultiPolygon untuk validasi bidang.
            </div>
          )}

          {progress && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-500/20 rounded-md p-2.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {topologyErrors && (
            <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  ⚠️ Hasil Validasi
                </span>
                <button onClick={() => setTopologyErrors(null)} className="p-1 hover:bg-amber-500/20 rounded text-amber-400">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="text-xs text-amber-200">{topologyErrors.features.length} kesalahan ditemukan. Pilih item untuk zoom dan tindakan.</div>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {topologyErrors.features.map((error: any, errorIndex: number) => {
                  const props = error.properties || {};
                  const featureIndex = Number.isInteger(props.featureIndex) ? props.featureIndex : -1;
                  const original = featureIndex >= 0 ? fc?.features?.[featureIndex] : null;
                  const metrics = getFeatureMetrics(original || error);
                  const idValue = original?.properties?.[parcelIdField] ?? original?.properties?.NIB ?? original?.properties?.nib;
                  return (
                    <div key={`${props.type}-${errorIndex}`} className="rounded-lg border border-amber-500/20 bg-black/20 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-wider text-rose-300">{props.type || "error"}</div>
                          <div className="mt-1 text-xs leading-relaxed text-white/85">{props.message || "Kesalahan geometri"}</div>
                        </div>
                        <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">#{featureIndex >= 0 ? featureIndex + 1 : "-"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/55">
                        {idValue !== undefined && <span>ID: <b className="text-white/80">{String(idValue)}</b></span>}
                        {metrics.area > 0 && <span>Luas: <b className="text-white/80">{(metrics.area / 10000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} Ha</b></span>}
                        {metrics.length > 0 && <span>Panjang/Keliling: <b className="text-white/80">{formatDistance(metrics.length)}</b></span>}
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        <button type="button" onClick={() => zoomToValidationError(error)} className="flex items-center gap-1 rounded-md border border-indigo-400/20 bg-indigo-500/10 px-2 py-1 text-[10px] font-bold text-indigo-300 hover:bg-indigo-500/20">
                          <MapPin className="h-3 w-3" /> Zoom
                        </button>
                        {canAutoRepair(error) && (
                          <button type="button" disabled={isFixing} onClick={() => repairValidationError(error, errorIndex)} className="flex items-center gap-1 rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                            <Wrench className="h-3 w-3" /> Perbaiki
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isProcessing}>Tutup</Button>
          <Button
            onClick={runValidation}
            disabled={isProcessing || !targetLayerId}
            className="bg-amber-600 hover:bg-amber-700 text-white min-w-[160px]"
          >
            {isProcessing ? (
              <span className="flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Memvalidasi...</span>
            ) : (
              <span className="flex items-center"><ShieldCheck className="w-4 h-4 mr-2" /> Jalankan Validasi</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
