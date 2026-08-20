/**
 * Serialize / restore multipart bodies for the offline sync queue (e.g. product image upload).
 */

export type MultipartQueueEntry =
  | { kind: "field"; key: string; value: string }
  | { kind: "file"; key: string; fileName: string; mime: string; base64: string };

export type MultipartQueuePayload = {
  __offlineMultipart: true;
  entries: MultipartQueueEntry[];
};

export const PENDING_IMG_RE = /^__PENDING_IMG_([0-9a-f-]{36})__$/i;

export function makePendingImageUrl(operationId: string): string {
  return `__PENDING_IMG_${operationId}__`;
}

export function isPendingImageUrl(url: string): boolean {
  return PENDING_IMG_RE.test(url);
}

export function isMultipartQueuePayload(p: unknown): p is MultipartQueuePayload {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as MultipartQueuePayload).__offlineMultipart === true &&
    Array.isArray((p as MultipartQueuePayload).entries)
  );
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || "application/octet-stream" });
}

export async function serializeFormDataForQueue(fd: FormData): Promise<MultipartQueuePayload> {
  const entries: MultipartQueueEntry[] = [];
  for (const [key, value] of fd.entries()) {
    if (value instanceof File) {
      const buf = await value.arrayBuffer();
      entries.push({
        kind: "file",
        key,
        fileName: value.name,
        mime: value.type || "application/octet-stream",
        base64: arrayBufferToBase64(buf),
      });
    } else {
      entries.push({ kind: "field", key, value: String(value) });
    }
  }
  return { __offlineMultipart: true, entries };
}

export function buildFormDataFromQueuePayload(p: MultipartQueuePayload): FormData {
  const fd = new FormData();
  for (const e of p.entries) {
    if (e.kind === "field") {
      fd.append(e.key, e.value);
    } else {
      fd.append(e.key, base64ToBlob(e.base64, e.mime), e.fileName);
    }
  }
  return fd;
}

/** Cached binary GET (Excel export, PDF download from API, etc.) */
export type BlobCacheEnvelope = {
  __offlineBlobCache: true;
  base64: string;
  contentType: string;
};

export function isBlobCacheEnvelope(x: unknown): x is BlobCacheEnvelope {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as BlobCacheEnvelope).__offlineBlobCache === true &&
    typeof (x as BlobCacheEnvelope).base64 === "string"
  );
}

export function cacheEnvelopeToBlob(env: BlobCacheEnvelope): Blob {
  return base64ToBlob(env.base64, env.contentType);
}

export async function blobToCacheEnvelope(blob: Blob): Promise<BlobCacheEnvelope> {
  const buf = await blob.arrayBuffer();
  return {
    __offlineBlobCache: true,
    base64: arrayBufferToBase64(buf),
    contentType: blob.type || "application/octet-stream",
  };
}

export function arrayBufferToCacheEnvelope(
  buf: ArrayBuffer,
  contentType: string
): BlobCacheEnvelope {
  return {
    __offlineBlobCache: true,
    base64: arrayBufferToBase64(buf),
    contentType: contentType || "application/octet-stream",
  };
}
