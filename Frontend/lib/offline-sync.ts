import { offlineDB, SyncQueueItem } from './offline-db';
import apiClient from './apiClient';
import { API_BASE } from '../config/constants';
import {
  buildFormDataFromQueuePayload,
  isMultipartQueuePayload,
  PENDING_IMG_RE,
} from './offline-queue-payload';

async function resolvePendingImageUrlsInPayload(payload: unknown): Promise<unknown> {
  if (payload == null) return payload;
  if (typeof payload === 'string') {
    const m = payload.match(PENDING_IMG_RE);
    if (m) {
      const resolved = await offlineDB.getResolvedUpload(m[1]);
      return resolved ?? payload;
    }
    return payload;
  }
  if (Array.isArray(payload)) {
    return Promise.all(payload.map((x) => resolvePendingImageUrlsInPayload(x)));
  }
  if (typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = await resolvePendingImageUrlsInPayload(o[k]);
    }
    return out;
  }
  return payload;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: number;
  pendingCount: number;
  failedCount: number;
}

class OfflineSyncManager {
  private syncInterval: NodeJS.Timeout | null = null;
  private listeners: ((status: SyncStatus) => void)[] = [];
  private status: SyncStatus = {
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSync: 0,
    pendingCount: 0,
    failedCount: 0,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      this.startPeriodicSync();
      offlineDB.resetStuckItems().catch(() => {});
      this.updateCounts();
    }
  }

  private handleOnline = () => {
    this.status.isOnline = true;
    this.notifyListeners();
    this.syncAll();
  };

  private handleOffline = () => {
    this.status.isOnline = false;
    this.notifyListeners();
  };

  private startPeriodicSync() {
    this.syncInterval = setInterval(() => {
      if (this.status.isOnline && !this.status.isSyncing) {
        this.syncAll();
      }
    }, 30_000);
  }

  private async updateCounts() {
    const [pending, failed] = await Promise.all([
      offlineDB.getPendingCount(),
      offlineDB.getFailedCount(),
    ]);
    this.status.pendingCount = pending;
    this.status.failedCount = failed;
    this.notifyListeners();
  }

  async syncAll() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (this.status.isSyncing || !this.status.isOnline || !token) return;

    this.status.isSyncing = true;
    this.notifyListeners();

    try {
      await this.processSyncQueue(token);
      await this.pullFreshData();
      this.status.lastSync = Date.now();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      this.status.isSyncing = false;
      await this.updateCounts();
    }
  }

  private async processSyncQueue(token: string) {
    const items = await offlineDB.getPendingItems();
    if (items.length === 0) return;

    console.log(`Syncing ${items.length} queued items`);
    for (const item of items) {
      await this.processItem(item, token);
    }
  }

  private async processItem(item: SyncQueueItem, token: string) {
    await offlineDB.markProcessing(item.id);

    const url = item.url.startsWith('http') ? item.url : `${API_BASE}${item.url}`;

    try {
      const isMultipart = item.payload != null && isMultipartQueuePayload(item.payload);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'X-Operation-Id': item.operationId,
      };

      let body: BodyInit | undefined;
      if (isMultipart) {
        body = buildFormDataFromQueuePayload(item.payload);
      } else if (item.payload !== undefined && item.payload !== null) {
        headers['Content-Type'] = 'application/json';
        const resolved = await resolvePendingImageUrlsInPayload(item.payload);
        body = JSON.stringify(resolved);
      }

      if (item.headers) {
        Object.assign(headers, item.headers);
      }
      if (isMultipart) {
        delete headers['Content-Type'];
      }

      const response = await fetch(url, {
        method: item.method,
        headers,
        body:
          item.method === 'GET' || item.method === 'HEAD'
            ? undefined
            : body,
      });

      if (response.ok) {
        if (item.url.includes('/products/upload-image')) {
          try {
            const ct = response.headers.get('content-type');
            if (ct?.includes('application/json')) {
              const j = await response.json();
              const cloudUrl = j?.data?.url ?? j?.data?.data?.url ?? j?.url;
              if (cloudUrl && item.operationId) {
                await offlineDB.saveResolvedUpload(item.operationId, cloudUrl);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        }
        await offlineDB.markSynced(item.id);
        if (item.url.includes('/customer')) {
          const { refreshCustomerListGlobally } = await import('./customer-list-sync');
          await refreshCustomerListGlobally().catch(() => undefined);
        }
        if (
          item.url.includes('/sale') ||
          item.url.includes('/customer-ledger') ||
          item.url.includes('/supplier-ledger') ||
          item.url.includes('/expenses')
        ) {
          const { notifyDashboardStatsChanged } = await import('./dashboard-stats-sync');
          notifyDashboardStatsChanged();

          // A queued sale only moves a balance once it lands on the server, so the
          // customer's due is stale everywhere until this point.
          const syncedCustomerId = (item.payload as { customerId?: string } | undefined)?.customerId;
          if (syncedCustomerId) {
            const { notifyCustomerLedgerChanged } = await import('./customer-ledger-sync');
            notifyCustomerLedgerChanged(syncedCustomerId);
          }
        }
        console.log(`Synced: ${item.method} ${item.url}`);
      } else {
        await offlineDB.markFailed(item.id, `HTTP ${response.status}`);
      }
    } catch (error: any) {
      await offlineDB.markFailed(item.id, error?.message || 'Network error');
    }
  }

  private async pullFreshData() {
    const results = await Promise.allSettled([
      apiClient.get('/products', { params: { fetch_all: true } }),
      apiClient.get('/customer'),
      apiClient.get('/branches', { params: { fetch_all: true } }),
      apiClient.get('/categories'),
      apiClient.get('/suppliers'),
      apiClient.get('/taxes'),
      apiClient.get('/units'),
      apiClient.get('/subcategories'),
      apiClient.get('/dashboard/stats'),
      apiClient.get('/sale/recent'),
      apiClient.get('/products/best-selling'),
      apiClient.get('/employee'),
      apiClient.get('/employee/types'),
      apiClient.get('/inventory/dashboard'),
      apiClient.get('/sizes', { params: { search: '' } }),
      apiClient.get('/colors', { params: { search: '' } }),
      apiClient.get('/brands', { params: { search: '' } }),
    ]);

    const [productsResult, customersResult, , categoriesResult] = results;

    if (productsResult.status === 'fulfilled') {
      const raw = productsResult.value?.data?.data;
      if (Array.isArray(raw) && raw.length > 0) {
        await offlineDB.saveProducts(raw);
      }
    }

    if (customersResult.status === 'fulfilled') {
      const raw = customersResult.value?.data?.data;
      if (Array.isArray(raw) && raw.length > 0) {
        await offlineDB.saveCustomers(raw);
        await offlineDB.setCachedData('customers', raw);
      }
    }

    if (categoriesResult.status === 'fulfilled') {
      const list = categoriesResult.value?.data?.data;
      if (Array.isArray(list) && list.length > 0) {
        const categories = [{ id: 'all', name: 'All' }, ...list];
        await offlineDB.setCachedData('categories', categories);
      }
    }
  }

  async retryFailed() {
    await offlineDB.retryFailed();
    await this.updateCounts();
    if (this.status.isOnline) this.syncAll();
  }

  subscribe(listener: (status: SyncStatus) => void) {
    this.listeners.push(listener);
    listener({ ...this.status });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l({ ...this.status }));
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  canMakeRequest(): boolean {
    return this.status.isOnline;
  }

  async triggerSync() {
    if (this.status.isOnline) await this.syncAll();
  }

  destroy() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }
}

export const syncManager = new OfflineSyncManager();
export default syncManager;
