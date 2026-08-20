import apiClient from './apiClient';
import { offlineDB } from './offline-db';
import { syncManager } from './offline-sync';

export interface OfflineAPIOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data?: any;
  headers?: Record<string, string>;
  priority?: number;
  type?: string;
  cacheStrategy?: 'network-first' | 'cache-first' | 'network-only' | 'cache-only';
  cacheTTL?: number;
}

class OfflineAPIClient {
  async request<T = any>(options: OfflineAPIOptions): Promise<T | null> {
    const {
      method,
      url,
      data,
      headers,
      priority = 5,
      type = 'generic',
      cacheStrategy = 'network-first',
      cacheTTL,
    } = options;

    const isOnline = syncManager.canMakeRequest();

    if (cacheStrategy === 'cache-only') {
      return this.getFromCache(url);
    }

    if (cacheStrategy === 'cache-first') {
      const cached = await this.getFromCache(url);
      if (cached) return cached;
      if (!isOnline) return null;
    }

    if (!isOnline && method !== 'GET') {
      const operationId = crypto.randomUUID();
      await offlineDB.enqueue({ operationId, type, url, method, payload: data, headers, maxRetries: 5, priority });
      return this.optimisticResponse(method, data, operationId);
    }

    if (!isOnline && method === 'GET') {
      return this.getFromCache(url);
    }

    try {
      let response: any;
      switch (method) {
        case 'GET':    response = await apiClient.get(url); break;
        case 'POST':   response = await apiClient.post(url, data); break;
        case 'PUT':    response = await apiClient.put(url, data); break;
        case 'DELETE': response = await apiClient.delete(url); break;
        case 'PATCH':  response = await apiClient.patch(url, data); break;
      }

      if (method === 'GET' && response) {
        await this.setCache(url, response, cacheTTL);
      }

      return response;
    } catch (error: any) {
      if (method !== 'GET') {
        const operationId = crypto.randomUUID();
        await offlineDB.enqueue({ operationId, type, url, method, payload: data, headers, maxRetries: 5, priority });
        return this.optimisticResponse(method, data, operationId);
      }

      const cached = await this.getFromCache(url);
      if (cached) return cached;
      throw error;
    }
  }

  async get<T = any>(url: string, options?: Partial<OfflineAPIOptions>): Promise<T | null> {
    return this.request<T>({ method: 'GET', url, ...options });
  }

  async post<T = any>(url: string, data?: any, options?: Partial<OfflineAPIOptions>): Promise<T | null> {
    return this.request<T>({ method: 'POST', url, data, ...options });
  }

  async put<T = any>(url: string, data?: any, options?: Partial<OfflineAPIOptions>): Promise<T | null> {
    return this.request<T>({ method: 'PUT', url, data, ...options });
  }

  async delete<T = any>(url: string, options?: Partial<OfflineAPIOptions>): Promise<T | null> {
    return this.request<T>({ method: 'DELETE', url, ...options });
  }

  async patch<T = any>(url: string, data?: any, options?: Partial<OfflineAPIOptions>): Promise<T | null> {
    return this.request<T>({ method: 'PATCH', url, data, ...options });
  }

  private async getFromCache(url: string): Promise<any> {
    return offlineDB.getCachedData(url);
  }

  private async setCache(url: string, data: any, ttl?: number): Promise<void> {
    await offlineDB.setCachedData(url, data, ttl);
  }

  private optimisticResponse(method: string, data: any, operationId: string): any {
    return {
      success: true,
      _pending: true,
      _operationId: operationId,
      data: method === 'POST' && data ? { ...data, id: `temp_${Date.now()}`, _pending: true } : undefined,
      message: 'Request queued for sync when online',
    };
  }
}

export const offlineAPIClient = new OfflineAPIClient();
export default offlineAPIClient;
