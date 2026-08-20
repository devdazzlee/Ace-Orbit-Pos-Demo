import { API_BASE } from "@/config/constants";
import axios, { AxiosHeaders, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { offlineDB } from "./offline-db";
import {
  arrayBufferToCacheEnvelope,
  blobToCacheEnvelope,
  cacheEnvelopeToBlob,
  isBlobCacheEnvelope,
  makePendingImageUrl,
  serializeFormDataForQueue,
} from "./offline-queue-payload";

const OFFLINE_GET_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — same spirit as offline-helpers
/** Skip caching huge exports to avoid IndexedDB bloat (base64 expands ~4/3). */
const MAX_BINARY_GET_CACHE_BYTES = 20 * 1024 * 1024;

type GetCacheMode = "json" | "binary" | null;

/** Path-only API path (shared with sync queue). Exported first for cache keys. */
export function normalizeQueuePath(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  let u = rawUrl.trim().split("?")[0];
  if (!u) return null;
  try {
    if (u.startsWith("http://") || u.startsWith("https://")) {
      const base = API_BASE.replace(/\/$/, "");
      const nu = u.replace(/\/$/, "");
      if (nu.startsWith(base)) {
        let path = nu.slice(base.length);
        if (!path.startsWith("/")) path = "/" + path;
        return path || "/";
      }
      return null;
    }
    return u.startsWith("/") ? u : "/" + u;
  } catch {
    return null;
  }
}

/** Stable key for GET response cache (used by store fallbacks and interceptors). */
export function offlineRequestCacheKey(
  method: string,
  url: string,
  params?: Record<string, unknown>
): string {
  const path = normalizeQueuePath(url) ?? url;
  const p = params !== undefined && params !== null ? JSON.stringify(params) : "";
  return `${method.toUpperCase()}:${path}:${p}`;
}

function skipOfflineGetCache(config: InternalAxiosRequestConfig): boolean {
  const h = config.headers as AxiosHeaders | undefined;
  if (!h) return false;
  const v = h.get?.("X-Skip-Offline-Cache") ?? (h as any)["X-Skip-Offline-Cache"];
  return v === true || v === "true" || v === "1";
}

function getGetResponseCacheMode(config: InternalAxiosRequestConfig): GetCacheMode {
  if ((config.method || "get").toLowerCase() !== "get") return null;
  if (skipOfflineGetCache(config)) return null;
  const u = config.url || "";
  if (u.includes("/auth/")) return null;
  const rt = (config.responseType || "json") as string;
  if (rt === "json" || !config.responseType) return "json";
  if (rt === "blob" || rt === "arraybuffer") return "binary";
  return null;
}

function skipOfflineMutationQueue(config: InternalAxiosRequestConfig): boolean {
  const h = config.headers as AxiosHeaders | undefined;
  if (!h) return false;
  const v = h.get?.("X-Skip-Offline-Queue") ?? (h as any)["X-Skip-Offline-Queue"];
  return v === true || v === "true" || v === "1";
}

function shouldCacheGet(config: InternalAxiosRequestConfig): boolean {
  return getGetResponseCacheMode(config) !== null;
}

async function buildAxiosResponseFromGetCache(
  config: InternalAxiosRequestConfig,
  hit: unknown
): Promise<AxiosResponse | null> {
  const mode = getGetResponseCacheMode(config);
  if (mode === "json" && hit !== null && hit !== undefined && !isBlobCacheEnvelope(hit)) {
    return {
      data: hit,
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config: config as InternalAxiosRequestConfig,
      request: {},
    };
  }
  if (mode === "binary" && isBlobCacheEnvelope(hit)) {
    const blob = cacheEnvelopeToBlob(hit);
    let data: unknown = blob;
    if (config.responseType === "arraybuffer") {
      data = await blob.arrayBuffer();
    }
    return {
      data,
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config: config as InternalAxiosRequestConfig,
      request: {},
    };
  }
  return null;
}

function isMutatingMethod(config: InternalAxiosRequestConfig): boolean {
  const m = (config.method || "get").toLowerCase();
  return m === "post" || m === "put" || m === "patch" || m === "delete";
}

/** Routes that must keep custom client-side offline handling (avoid double-queue / wrong UX). */
function bypassGlobalMutationQueue(config: InternalAxiosRequestConfig): boolean {
  if (skipOfflineMutationQueue(config)) return true;
  const path = normalizeQueuePath(config.url);
  if (!path) return true;
  if (path.startsWith("/auth/")) return true;
  const m = (config.method || "get").toLowerCase();
  if (m === "post" && path === "/sale") return true;
  return false;
}

function canQueueMutationBody(config: InternalAxiosRequestConfig): boolean {
  const d = config.data as unknown;
  if (d === undefined || d === null) return true;
  if (typeof FormData !== "undefined" && d instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && d instanceof URLSearchParams) return false;
  if (typeof Blob !== "undefined" && d instanceof Blob) return false;
  if (typeof ArrayBuffer !== "undefined" && d instanceof ArrayBuffer) return false;
  if (typeof d === "string") {
    try {
      JSON.parse(d);
      return true;
    } catch {
      return false;
    }
  }
  return typeof d === "object";
}

async function serializeMutationPayloadAsync(
  config: InternalAxiosRequestConfig
): Promise<unknown | undefined> {
  const d = config.data as unknown;
  if (d === undefined || d === null) return undefined;
  if (typeof FormData !== "undefined" && d instanceof FormData) {
    return serializeFormDataForQueue(d);
  }
  if (typeof d === "string") return JSON.parse(d);
  return d;
}

function inferMutationPriority(path: string): number {
  if (path.includes("/sale")) return 10;
  if (path.includes("/purchases") || path.includes("/purchase")) return 9;
  if (path.includes("/stock") || path.includes("/transfers")) return 8;
  if (path.includes("/products/upload-image")) return 7;
  if (path.includes("/customer")) return 7;
  if (path.includes("/products")) return 6;
  if (path.includes("/cashflows")) return 6;
  return 5;
}

async function enqueueMutationFromConfig(
  config: InternalAxiosRequestConfig,
  operationId: string
): Promise<void> {
  const path = normalizeQueuePath(config.url);
  if (!path) return;
  const method = (config.method || "POST").toUpperCase() as SyncQueueMethod;
  let payload: unknown;
  try {
    payload = await serializeMutationPayloadAsync(config);
  } catch {
    return;
  }
  const type = path.split("/").filter(Boolean)[0] || "generic";
  const priority = inferMutationPriority(path);
  await offlineDB.enqueue({
    operationId,
    type,
    url: path,
    method,
    payload: payload as any,
    maxRetries: 8,
    priority,
    headers: {},
  });
}

type SyncQueueMethod = "POST" | "PUT" | "PATCH" | "DELETE";

function buildSyntheticMutationResponse(
  config: InternalAxiosRequestConfig,
  operationId: string
): AxiosResponse {
  const method = (config.method || "post").toLowerCase();
  const path = normalizeQueuePath(config.url) || "";
  const data = config.data;

  if (
    method === "post" &&
    path.includes("/products/upload-image") &&
    typeof FormData !== "undefined" &&
    data instanceof FormData
  ) {
    return {
      data: {
        data: { url: makePendingImageUrl(operationId) },
        _syncPending: true,
        success: true,
        message: "Saved locally; will sync when you are back online.",
      },
      status: 202,
      statusText: "Accepted",
      headers: new AxiosHeaders(),
      config: config as InternalAxiosRequestConfig,
      request: {},
    };
  }

  if (typeof FormData !== "undefined" && data instanceof FormData) {
    return {
      data: {
        data: { success: true, _operationId: operationId, _syncPending: true },
        _syncPending: true,
        success: true,
        message: "Saved locally; will sync when you are back online.",
      },
      status: 202,
      statusText: "Accepted",
      headers: new AxiosHeaders(),
      config: config as InternalAxiosRequestConfig,
      request: {},
    };
  }

  // Bulk upload: live API returns data: RowResult[]. Generic POST handling spread { products } into
  // data.data so the client saw a non-array and dropped every row in that batch (only other batches showed).
  if (method === "post" && path.endsWith("/products/bulk-upload")) {
    try {
      const payloadRaw = config.data;
      const payload =
        payloadRaw == null
          ? undefined
          : typeof payloadRaw === "string"
            ? JSON.parse(payloadRaw as string)
            : (payloadRaw as { products?: unknown[] });
      const products = Array.isArray(payload?.products) ? payload.products : [];
      const rowResults = products.map((prod: any, idx: number) => ({
        success: true,
        name: String(prod?.name ?? prod?.Name ?? "").trim() || `Row ${idx + 1}`,
        sku: prod?.sku ?? prod?.SKU,
        _syncPending: true,
        _operationId: operationId,
      }));
      return {
        data: {
          data: rowResults,
          _syncPending: true,
          success: true,
          message: "Saved locally; will sync when you are back online.",
        },
        status: 202,
        statusText: "Accepted",
        headers: new AxiosHeaders(),
        config: config as InternalAxiosRequestConfig,
        request: {},
      };
    } catch {
      /* fall through */
    }
  }

  let inner: Record<string, unknown>;
  try {
    const payloadRaw = config.data;
    const payload =
      payloadRaw == null
        ? undefined
        : typeof payloadRaw === "string"
          ? JSON.parse(payloadRaw as string)
          : (payloadRaw as Record<string, unknown>);
    const tempId = `pending_${operationId.slice(0, 10)}`;
    if (method === "delete") {
      const parts = path.split("/").filter(Boolean);
      inner = {
        success: true,
        id: parts[parts.length - 1],
        _syncPending: true,
        _operationId: operationId,
      };
    } else if (method === "post") {
      inner = {
        ...(typeof payload === "object" && payload ? payload : {}),
        id: (payload as any)?.id ?? tempId,
        _syncPending: true,
        _operationId: operationId,
      };
    } else {
      inner = {
        ...(typeof payload === "object" && payload ? payload : {}),
        _syncPending: true,
        _operationId: operationId,
      };
    }
  } catch {
    inner = { _syncPending: true, _operationId: operationId };
  }

  return {
    data: {
      data: inner,
      _syncPending: true,
      success: true,
      message: "Saved locally; will sync when you are back online.",
    },
    status: 202,
    statusText: "Accepted",
    headers: new AxiosHeaders(),
    config: config as InternalAxiosRequestConfig,
    request: {},
  };
}

function isNetworkFailure(error: unknown): boolean {
  const e = error as any;
  return (
    !e?.response ||
    e?.code === "ERR_NETWORK" ||
    e?.code === "ECONNABORTED"
  );
}

/** Axios uses ECONNABORTED for timeouts — must not queue/offline-fake success or we show "done" while the server is still working (and sync duplicates the request). */
function isLikelyAxiosTimeoutOrAbort(error: unknown): boolean {
  const e = error as any;
  const msg = String(e?.message ?? "").toLowerCase();
  if (msg.includes("timeout")) return true;
  if (e?.code === "ECONNABORTED" && msg.includes("exceeded")) return true;
  return axios.isCancel?.(error) === true;
}

function isQueueableNetworkFailure(error: unknown): boolean {
  if (!isNetworkFailure(error)) return false;
  if (isLikelyAxiosTimeoutOrAbort(error)) return false;
  return true;
}

/** Use on `apiClient.post(..., { timeout: BULK_UPLOAD_AXIOS_TIMEOUT_MS })` — bulk work can exceed the default client cap. */
export const BULK_UPLOAD_AXIOS_TIMEOUT_MS = 0;

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes – large base64 image payloads need more time
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Offline mutations: queue + synthetic success (JSON + FormData, except bypass list)
    if (
      typeof navigator !== "undefined" &&
      !navigator.onLine &&
      isMutatingMethod(config) &&
      !bypassGlobalMutationQueue(config) &&
      canQueueMutationBody(config) &&
      token
    ) {
      const operationId = crypto.randomUUID();
      await enqueueMutationFromConfig(config, operationId);
      const syn = buildSyntheticMutationResponse(config, operationId);
      config.adapter = async () => syn;
      return config;
    }

    // Offline: serve last successful GET from IndexedDB so all screens keep working
    if (
      typeof navigator !== "undefined" &&
      !navigator.onLine &&
      shouldCacheGet(config)
    ) {
      const key = offlineRequestCacheKey(
        "GET",
        config.url || "",
        config.params as Record<string, unknown> | undefined
      );
      const hit = await offlineDB.getCachedData(key);
      const cachedRes = await buildAxiosResponseFromGetCache(config, hit);
      if (cachedRes) {
        config.adapter = async () => cachedRes;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor — no automatic logout on 401.
apiClient.interceptors.response.use(
  async (response: AxiosResponse) => {
    const cfg = response.config;
    if (response.status === 200 && shouldCacheGet(cfg)) {
      const key = offlineRequestCacheKey(
        "GET",
        cfg.url || "",
        cfg.params as Record<string, unknown> | undefined
      );
      const mode = getGetResponseCacheMode(cfg);
      try {
        if (mode === "json") {
          await offlineDB.setCachedData(key, response.data, OFFLINE_GET_TTL_MS);
        } else if (mode === "binary") {
          const ct =
            (response.headers?.["content-type"] as string) || "application/octet-stream";
          if (response.data instanceof Blob) {
            if (response.data.size <= MAX_BINARY_GET_CACHE_BYTES) {
              const env = await blobToCacheEnvelope(response.data);
              await offlineDB.setCachedData(key, env, OFFLINE_GET_TTL_MS);
            }
          } else if (response.data instanceof ArrayBuffer) {
            if (response.data.byteLength <= MAX_BINARY_GET_CACHE_BYTES) {
              const env = arrayBufferToCacheEnvelope(response.data, ct);
              await offlineDB.setCachedData(key, env, OFFLINE_GET_TTL_MS);
            }
          }
        }
      } catch {
        /* ignore cache write errors */
      }
    }
    return response;
  },
  async (error) => {
    const config = error.config as InternalAxiosRequestConfig | undefined;
    if (!config) return Promise.reject(error);

    const queueableNet = isQueueableNetworkFailure(error);
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

    if (
      queueableNet &&
      isMutatingMethod(config) &&
      !bypassGlobalMutationQueue(config) &&
      canQueueMutationBody(config) &&
      token
    ) {
      try {
        const operationId = crypto.randomUUID();
        await enqueueMutationFromConfig(config, operationId);
        return buildSyntheticMutationResponse(config, operationId);
      } catch {
        /* fall through */
      }
    }

    if (shouldCacheGet(config) && isNetworkFailure(error)) {
      const key = offlineRequestCacheKey(
        "GET",
        config.url || "",
        config.params as Record<string, unknown> | undefined
      );
      try {
        const hit = await offlineDB.getCachedData(key);
        const cached = await buildAxiosResponseFromGetCache(config, hit);
        if (cached) return cached;
      } catch {
        /* ignore */
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
