/**
 * Offline-aware fetch/mutation helpers used by all components.
 *
 * cachedGet    – try API, cache on success, fall back to cache on fail/offline
 * queueMutation – call API directly when online; queue to syncQueue when offline or on failure
 */

import apiClient from './apiClient';
import { offlineDB } from './offline-db';

const DEFAULT_TTL = 6 * 60 * 60 * 1000; // 6 h

/**
 * GET with automatic offline caching.
 * Returns the `data` field (res.data.data), never an AxiosResponse.
 */
export async function cachedGet<T = any>(
  url: string,
  params?: Record<string, any>,
  cacheKey?: string
): Promise<T> {
  const key = cacheKey ?? url + (params ? JSON.stringify(params) : '');

  if (!navigator.onLine) {
    const hit = await offlineDB.getCachedData(key);
    return (hit ?? []) as T;
  }

  try {
    const res = await apiClient.get(url, params ? { params } : undefined);
    const data: T = res.data?.data ?? res.data ?? ([] as any);
    await offlineDB.setCachedData(key, data, DEFAULT_TTL);
    return data;
  } catch {
    const hit = await offlineDB.getCachedData(key);
    return (hit ?? []) as T;
  }
}

/**
 * Mutation (POST / PUT / PATCH / DELETE) with automatic offline queuing.
 * Returns { queued: true } when the request was saved for later sync,
 * { queued: false, data } when the API responded successfully.
 */
export async function queueMutation<T = any>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: any,
  type: string = 'generic',
  priority: number = 5
): Promise<{ queued: boolean; data: T | null }> {
  const enqueue = async (): Promise<{ queued: true; data: null }> => {
    await offlineDB.enqueue({
      operationId: crypto.randomUUID(),
      type,
      url,
      method,
      payload,
      maxRetries: 5,
      priority,
      headers: {},
    });
    return { queued: true, data: null };
  };

  if (!navigator.onLine) return enqueue();

  try {
    let res: any;
    switch (method) {
      case 'POST':   res = await apiClient.post(url, payload); break;
      case 'PUT':    res = await apiClient.put(url, payload); break;
      case 'PATCH':  res = await apiClient.patch(url, payload); break;
      case 'DELETE': res = await apiClient.delete(url); break;
    }
    // apiClient may queue on network loss and return 202 + _syncPending (already in sync queue)
    if (res?.status === 202 || res?.data?._syncPending === true) {
      return { queued: true, data: (res?.data?.data ?? null) as T | null };
    }
    return { queued: false, data: res?.data?.data ?? res?.data ?? null };
  } catch {
    return enqueue();
  }
}
