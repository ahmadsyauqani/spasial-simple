"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/AuthContext";
import { useMapContext } from "@/lib/MapContext";
import { saveLayer } from "@/lib/database";
import { db } from "@/lib/offlineDb";

export type AnalysisResultStatus = "queued" | "running" | "completed" | "error";
export type AnalysisResultOrigin = "client" | "server" | "validation";

export type Feature = {
  type: "Feature";
  geometry?: any;
  properties?: Record<string, unknown> | null;
  id?: string | number;
};

export type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
  [key: string]: unknown;
};

export type AnalysisResultRecord = {
  id: string;
  timestamp: string;
  label: string;
  operation?: string;
  origin: AnalysisResultOrigin;
  status: AnalysisResultStatus;
  sourceNames: string[];
  geojson?: FeatureCollection;
  originalGeojson?: FeatureCollection;
  diffGeojson?: FeatureCollection;
  summary?: unknown;
  report?: unknown;
  error?: string;
  progress?: number;
  message?: string;
  /** Optional action supplied by a tool that can be run again. */
  rerun?: () => void | Promise<void>;
};

export type AnalysisResultInput = Omit<AnalysisResultRecord, "id" | "timestamp"> & {
  id?: string;
  timestamp?: string;
};

export type AnalysisJobInput = {
  label: string;
  operation?: string;
  sourceNames?: string[];
  rerun?: () => void | Promise<void>;
};

export type AnalysisHistoryContextValue = {
  results: AnalysisResultRecord[];
  activePreview: AnalysisResultRecord | null;
  selectedResult: AnalysisResultRecord | null;
  addResult: (input: AnalysisResultInput) => string;
  updateResult: (id: string, patch: Partial<AnalysisResultRecord>) => void;
  removeResult: (id: string) => void;
  clearHistory: () => void;
  selectResult: (id: string | null) => void;
  previewResult: (id: string | null) => void;
  discardPreview: () => void;
  startJob: (input: AnalysisJobInput) => string;
  updateJob: (id: string, status: AnalysisResultStatus, patch?: Partial<AnalysisResultRecord>) => void;
  completeJob: (id: string, patch: Pick<AnalysisResultRecord, "geojson"> & Partial<AnalysisResultRecord>) => void;
  failJob: (id: string, error: string, patch?: Partial<AnalysisResultRecord>) => void;
  saveResultAsLayer: (id: string, name?: string) => Promise<string | null>;
};

export const MAX_ANALYSIS_HISTORY_ITEMS = 40;

const emptyCollection = (features: Feature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

/**
 * Normalize both GeoJSON shapes emitted by client tools and Python jobs.
 * A missing geometry is retained in the feature list so reports remain
 * inspectable, but callers can still decide whether saving is appropriate.
 */
export function normalizeFeatureCollection(value: unknown): FeatureCollection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, any>;
  if (candidate.type === "FeatureCollection" && Array.isArray(candidate.features)) {
    return {
      ...candidate,
      type: "FeatureCollection",
      features: candidate.features.filter(Boolean).map((feature: any) => ({
        ...feature,
        type: "Feature",
        properties: feature?.properties ?? {},
      })),
    };
  }
  if (candidate.type === "Feature") {
    return emptyCollection([{ ...candidate, type: "Feature", properties: candidate.properties ?? {} }]);
  }
  if (candidate.geojson) return normalizeFeatureCollection(candidate.geojson);
  return null;
}

function featureCollectionFromResult(value: any) {
  return normalizeFeatureCollection(value?.geojson ?? value);
}

function geometryTypeOf(collection: FeatureCollection): "Point" | "Line" | "Polygon" {
  const types = collection.features.map((feature) => String(feature.geometry?.type || "").toLowerCase());
  if (types.some((type) => type.includes("polygon"))) return "Polygon";
  if (types.some((type) => type.includes("line"))) return "Line";
  return "Point";
}

function makeId(counter: { current: number }) {
  counter.current += 1;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `analysis-${crypto.randomUUID()}`;
  }
  return `analysis-${counter.current}`;
}

const clientResultDefinitions = [
  { key: "overlap", label: "Overlap", source: (value: any) => [value.layerAName, value.layerBName] },
  { key: "clip", label: "Clip", source: (value: any) => [value.inputLayerName, value.clipLayerName] },
  { key: "merge", label: "Merge", source: (value: any) => value.sourceLayerNames },
  { key: "buffer", label: "Buffer", source: (value: any) => [value.inputLayerName] },
  { key: "union", label: "Union", source: (value: any) => value.sourceLayerNames },
  { key: "dissolve", label: "Dissolve", source: (value: any) => [value.inputLayerName] },
  { key: "spatialJoin", label: "Spatial Join", source: (value: any) => [value.targetLayerName, value.sourceLayerName] },
  { key: "sliver", label: "Sliver Detection", source: (value: any) => [value.layerAName, value.layerBName] },
] as const;

const cleanSourceNames = (names: unknown) =>
  Array.from(new Set((Array.isArray(names) ? names : [names]).filter((name): name is string => Boolean(name)).map(String)));

const statusFromJob = (status: string): AnalysisResultStatus => {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "done" || status === "completed") return "completed";
  return "error";
};

const AnalysisHistoryContext = createContext<AnalysisHistoryContextValue | undefined>(undefined);

export function AnalysisHistoryProvider({ children }: { children: ReactNode }) {
  const map = useMapContext();
  const { isGuest, user } = useAuth();
  const [results, setResults] = useState<AnalysisResultRecord[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const idCounter = useRef(0);
  const seenClientObjects = useRef(new WeakMap<object, string>());
  const seenValidationObjects = useRef(new WeakSet<object>());

  const addResult = useCallback((input: AnalysisResultInput) => {
    const id = input.id ?? makeId(idCounter);
    const record: AnalysisResultRecord = {
      ...input,
      id,
      timestamp: input.timestamp ?? new Date().toISOString(),
      sourceNames: cleanSourceNames(input.sourceNames),
      origin: input.origin ?? "client",
      status: input.status ?? "completed",
    };
    setResults((previous) => [record, ...previous.filter((item) => item.id !== id)].slice(0, MAX_ANALYSIS_HISTORY_ITEMS));
    return id;
  }, []);

  const updateResult = useCallback((id: string, patch: Partial<AnalysisResultRecord>) => {
    setResults((previous) => previous.map((item) => item.id === id ? { ...item, ...patch, sourceNames: patch.sourceNames ? cleanSourceNames(patch.sourceNames) : item.sourceNames } : item));
  }, []);

  const removeResult = useCallback((id: string) => {
    setResults((previous) => previous.filter((item) => item.id !== id));
    setSelectedResultId((previous) => previous === id ? null : previous);
    setActivePreviewId((previous) => previous === id ? null : previous);
  }, []);

  const clearHistory = useCallback(() => {
    setResults([]);
    setSelectedResultId(null);
    setActivePreviewId(null);
  }, []);

  const startJob = useCallback((input: AnalysisJobInput) => addResult({
    label: input.label,
    operation: input.operation,
    origin: "server",
    status: "queued",
    sourceNames: input.sourceNames ?? [],
    progress: 0,
    message: "Menunggu antrean server...",
    rerun: input.rerun,
  }), [addResult]);

  const updateJob = useCallback((id: string, status: AnalysisResultStatus, patch: Partial<AnalysisResultRecord> = {}) => {
    updateResult(id, { ...patch, status });
  }, [updateResult]);

  const completeJob = useCallback((id: string, patch: Pick<AnalysisResultRecord, "geojson"> & Partial<AnalysisResultRecord>) => {
    updateResult(id, { ...patch, status: "completed", progress: 100, message: patch.message ?? "Selesai" });
  }, [updateResult]);

  const failJob = useCallback((id: string, error: string, patch: Partial<AnalysisResultRecord> = {}) => {
    updateResult(id, { ...patch, status: "error", error, progress: 100, message: patch.message ?? "Gagal" });
  }, [updateResult]);

  const selectResult = useCallback((id: string | null) => setSelectedResultId(id), []);
  const previewResult = useCallback((id: string | null) => {
    setActivePreviewId(id);
    setSelectedResultId(id);
  }, []);
  const discardPreview = useCallback(() => setActivePreviewId(null), []);

  // Observe the eight legacy MapContext slots without changing their ownership.
  // Object identity is intentional: a fresh result object is a distinct run even
  // when a deterministic tool happens to return identical GeoJSON.
  useEffect(() => {
    clientResultDefinitions.forEach((definition) => {
      const value = (map as any)[`${definition.key}Result`];
      if (!value || typeof value !== "object") return;
      const geojson = featureCollectionFromResult(value);
      if (!geojson) return;
      const objectKey = `${definition.key}:${value.geojson?.features?.length ?? ""}:${value.featureCount ?? ""}:${value.inputLayerName ?? ""}:${value.distance ?? ""}`;
      if (seenClientObjects.current.get(value) === objectKey) return;
      seenClientObjects.current.set(value, objectKey);
      addResult({
        label: definition.label,
        operation: definition.key,
        origin: "client",
        status: "completed",
        sourceNames: cleanSourceNames(definition.source(value)),
        geojson,
        summary: value.stats ?? value.summary,
        report: value.report,
      });
    });
  }, [addResult, map.overlapResult, map.clipResult, map.mergeResult, map.bufferResult, map.unionResult, map.dissolveResult, map.spatialJoinResult, map.sliverResult]);

  // Topology validation is a client-side report rather than one of the eight
  // geometry slots. Keeping it here makes the report available after its dialog
  // closes without editing the validation tool.
  useEffect(() => {
    const validation = map.topologyErrors;
    if (!validation || typeof validation !== "object" || seenValidationObjects.current.has(validation)) return;
    const geojson = normalizeFeatureCollection(validation);
    if (!geojson) return;
    seenValidationObjects.current.add(validation);
    const errors = geojson.features.filter((feature) => String(feature.properties?.severity ?? "error") === "error").length;
    addResult({
      label: "Validasi Topologi",
      operation: "topology-validation",
      origin: "validation",
      status: "completed",
      sourceNames: map.layers.filter((layer) => layer.id === validation.layerId).map((layer) => layer.name),
      geojson,
      report: { issueCount: geojson.features.length, errorCount: errors, warningCount: geojson.features.length - errors },
      summary: { issueCount: geojson.features.length },
    });
  }, [addResult, map.layers, map.topologyErrors]);

  const saveResultAsLayer = useCallback(async (id: string, requestedName?: string) => {
    const record = results.find((item) => item.id === id);
    if (!record?.geojson) return null;
    const name = requestedName?.trim() || `${record.label} (hasil)`;
    const geometryType = geometryTypeOf(record.geojson);

    // A guest or an account that has not finished auth initialization never
    // reaches the cloud writer. Full GeoJSON is kept in the existing IndexedDB
    // cache, not localStorage, and the source record is never mutated.
    if (isGuest) {
      const localId = `local-${makeId(idCounter).replace(/^analysis-/, "")}`;
      const layer = {
        id: localId,
        name,
        geometryType,
        visible: true,
        syncStatus: "local" as const,
        data: record.geojson,
      };
      map.setLayers((previous) => [...previous, layer as any]);
      map.cacheLayerGeojson(localId, record.geojson);
      await db.layers.put({ id: localId, name, geojson: record.geojson, lastUpdated: Date.now() });
      return localId;
    }

    if (!user) throw new Error("Masuk atau mulai sesi Guest sebelum menyimpan.");
    const saved = await saveLayer(name, record.geojson, geometryType);
    await map.fetchLayers();
    return saved?.id ? String(saved.id) : name;
  }, [isGuest, map, results, user]);

  const activePreview = useMemo(() => results.find((item) => item.id === activePreviewId) ?? null, [activePreviewId, results]);
  const selectedResult = useMemo(() => results.find((item) => item.id === selectedResultId) ?? null, [results, selectedResultId]);

  const value = useMemo<AnalysisHistoryContextValue>(() => ({
    results,
    activePreview,
    selectedResult,
    addResult,
    updateResult,
    removeResult,
    clearHistory,
    selectResult,
    previewResult,
    discardPreview,
    startJob,
    updateJob,
    completeJob,
    failJob,
    saveResultAsLayer,
  }), [results, activePreview, selectedResult, addResult, updateResult, removeResult, clearHistory, selectResult, previewResult, discardPreview, startJob, updateJob, completeJob, failJob, saveResultAsLayer]);

  return <AnalysisHistoryContext.Provider value={value}>{children}</AnalysisHistoryContext.Provider>;
}

export function useAnalysisHistory() {
  const context = useContext(AnalysisHistoryContext);
  if (!context) throw new Error("useAnalysisHistory must be used within an AnalysisHistoryProvider");
  return context;
}

/** Convert the Python job vocabulary into the history vocabulary. */
export function normalizeJobStatus(status: string): AnalysisResultStatus {
  return statusFromJob(status);
}
