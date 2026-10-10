/**
 * Minimal client for the Python analysis job API (async job pattern).
 * Contract: POST <path> -> 202 { job_id }, then GET /jobs/<job_id> -> JobStatus.
 */

export const PYTHON_API_URL: string =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_PYTHON_API_URL) || "http://localhost:8000";

export const MAX_UPLOAD_BYTES: number = 200 * 1024 * 1024; // 200 MB

export type JobStatus = {
  status: "queued" | "running" | "done" | "error";
  progress: number;
  message: string;
  result?: any;
  error?: string;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.detail || data?.error || data?.message || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function startJob(path: string, body: FormData | Record<string, unknown>): Promise<string> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(`${PYTHON_API_URL}${path}`, {
    method: "POST",
    body: isForm ? (body as FormData) : JSON.stringify(body),
    headers: isForm ? undefined : { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const jobId = data?.job_id ?? data?.id;
  if (!jobId) throw new Error("Server tidak mengembalikan job_id.");
  return String(jobId);
}

export async function pollJob(
  jobId: string,
  onProgress?: (s: JobStatus) => void,
  opts?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<any> {
  const intervalMs = opts?.intervalMs ?? 1200;
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000;
  const started = Date.now();

  while (true) {
    if (opts?.signal?.aborted) throw new Error("Proses dibatalkan.");
    if (Date.now() - started > timeoutMs) throw new Error("Waktu tunggu proses habis.");

    const res = await fetch(`${PYTHON_API_URL}/jobs/${encodeURIComponent(jobId)}`, { signal: opts?.signal });
    if (!res.ok) throw new Error(await readError(res));
    const status = (await res.json()) as JobStatus;
    onProgress?.(status);

    if (status.status === "done") return status.result;
    if (status.status === "error") throw new Error(status.error || status.message || "Proses gagal.");

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export async function runJob(
  path: string,
  body: FormData | Record<string, unknown>,
  onProgress?: (s: JobStatus) => void,
  opts?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<any> {
  const jobId = await startJob(path, body);
  return pollJob(jobId, onProgress, opts);
}

export function geojsonToFile(geojson: any, name = "layer.geojson"): File {
  const text = typeof geojson === "string" ? geojson : JSON.stringify(geojson);
  const blob = new Blob([text], { type: "application/geo+json" });
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Ukuran data (${(blob.size / 1024 / 1024).toFixed(1)} MB) melebihi batas unggah.`);
  }
  return new File([blob], name, { type: "application/geo+json" });
}
