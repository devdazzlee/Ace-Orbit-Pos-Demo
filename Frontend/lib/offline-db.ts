import Dexie, { Table } from 'dexie';

export interface Product {
  id: string;
  name: string;
  sku?: string;
  price: number;
  stock?: number;
  category?: string;
  data: any;
  lastSync: number;
}

export interface Sale {
  id: string;
  products: any[];
  total: number;
  customer?: any;
  payment: any;
  timestamp: number;
  synced: boolean;
  employeeId?: string;
  branchId?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  data: any;
  lastSync: number;
}

export type SyncItemStatus = 'pending' | 'processing' | 'synced' | 'failed';

export interface SyncQueueItem {
  id: string;
  operationId: string;
  type: string;
  url: string;
  method: string;
  payload?: any;
  headers?: Record<string, string>;
  status: SyncItemStatus;
  retryCount: number;
  maxRetries: number;
  priority: number;
  createdAt: number;
  lastAttemptAt: number | null;
  errorMessage: string | null;
}

export interface CachedData {
  key: string;
  data: any;
  timestamp: number;
  expiresAt?: number;
}

interface LegacyPendingRequest {
  id: string;
  url: string;
  method: string;
  body?: any;
  headers?: any;
  timestamp: number;
  retries: number;
  priority: number;
}

class OfflineDatabase extends Dexie {
  products!: Table<Product>;
  sales!: Table<Sale>;
  customers!: Table<Customer>;
  syncQueue!: Table<SyncQueueItem>;
  cachedData!: Table<CachedData>;

  constructor() {
    super('ManpasandPOSDB');

    this.version(1).stores({
      products: 'id, name, sku, category, lastSync',
      sales: 'id, timestamp, synced, employeeId, branchId',
      customers: 'id, name, email, phone, lastSync',
      pendingRequests: 'id, timestamp, priority, retries',
      cachedData: 'key, timestamp, expiresAt',
    });

    this.version(2)
      .stores({
        products: 'id, name, sku, category, lastSync',
        sales: 'id, timestamp, synced, employeeId, branchId',
        customers: 'id, name, email, phone, lastSync',
        pendingRequests: null,
        syncQueue: 'id, operationId, status, priority, createdAt',
        cachedData: 'key, timestamp, expiresAt',
      })
      .upgrade(async (tx) => {
        try {
          const old = await tx.table<LegacyPendingRequest>('pendingRequests').toArray();
          if (old.length > 0) {
            const items: SyncQueueItem[] = old.map((req) => ({
              id: req.id,
              operationId: `migrated_${req.id}`,
              type: 'generic',
              url: req.url,
              method: req.method,
              payload: req.body,
              headers: req.headers ?? {},
              status: 'pending',
              retryCount: req.retries ?? 0,
              maxRetries: 5,
              priority: req.priority ?? 5,
              createdAt: req.timestamp ?? Date.now(),
              lastAttemptAt: null,
              errorMessage: null,
            }));
            await tx.table<SyncQueueItem>('syncQueue').bulkAdd(items);
          }
        } catch {
          // No pendingRequests to migrate
        }
      });
  }
}

export const db = new OfflineDatabase();

// Reset any stuck 'processing' items on startup (crash recovery)
db.open()
  .then(() => {
    db.syncQueue
      .where('status')
      .equals('processing')
      .modify({ status: 'pending', lastAttemptAt: null });
  })
  .catch(() => {});

export const offlineDB = {
  // ---- Products ----
  async saveProducts(products: any[]) {
    if (!Array.isArray(products)) return 0;
    const timestamp = Date.now();
    const rows = products.map((p) => ({
      id: p.id || p._id || String(p.product_id),
      name: p.name || p.product_name,
      sku: p.sku,
      price: p.price || p.sale_price || 0,
      stock: p.stock || p.quantity,
      category: p.category?.name || p.category_name,
      data: p,
      lastSync: timestamp,
    }));
    await db.products.bulkPut(rows);
    return rows.length;
  },

  async getProducts() {
    return db.products.toArray();
  },

  async getProduct(id: string) {
    return db.products.get(id);
  },

  async searchProducts(query: string) {
    const q = query.toLowerCase();
    return db.products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false)
      )
      .toArray();
  },

  // ---- Sales ----
  async saveSale(sale: any) {
    const row: Sale = {
      id: sale.id || `sale_${Date.now()}_${Math.random()}`,
      products: sale.products || sale.items || [],
      total: sale.total || sale.amount || 0,
      customer: sale.customer,
      payment: sale.payment,
      timestamp: Date.now(),
      synced: false,
      employeeId: sale.employeeId || sale.employee_id,
      branchId: sale.branchId || sale.branch_id,
    };
    await db.sales.put(row);
    return row;
  },

  async getUnsyncedSales() {
    return db.sales.filter((s) => !s.synced).toArray();
  },

  async markSaleSynced(id: string) {
    await db.sales.update(id, { synced: true });
  },

  async getAllSales() {
    return db.sales.orderBy('timestamp').reverse().toArray();
  },

  // ---- Customers ----
  async saveCustomers(customers: any[]) {
    const timestamp = Date.now();
    const rows = customers.map((c) => ({
      id: c.id || c._id || String(c.customer_id),
      name: c.name || c.customer_name,
      email: c.email,
      phone: c.phone || c.mobile || c.phone_number,
      data: c,
      lastSync: timestamp,
    }));
    await db.customers.bulkPut(rows);
    return rows.length;
  },

  async getCustomers() {
    return db.customers.toArray();
  },

  async searchCustomers(query: string) {
    const q = query.toLowerCase();
    return db.customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false) ||
          (c.phone?.includes(query) ?? false)
      )
      .toArray();
  },

  // ---- Sync Queue ----
  async enqueue(
    item: Omit<SyncQueueItem, 'id' | 'retryCount' | 'status' | 'createdAt' | 'lastAttemptAt' | 'errorMessage'>
  ): Promise<SyncQueueItem> {
    const row: SyncQueueItem = {
      ...item,
      id: crypto.randomUUID(),
      retryCount: 0,
      status: 'pending',
      createdAt: Date.now(),
      lastAttemptAt: null,
      errorMessage: null,
    };
    await db.syncQueue.add(row);
    return row;
  },

  async getPendingItems(): Promise<SyncQueueItem[]> {
    const now = Date.now();
    const all = await db.syncQueue.where('status').equals('pending').toArray();
    return all
      .filter((item) => {
        if (!item.lastAttemptAt) return true;
        const backoff = Math.min(1000 * Math.pow(2, item.retryCount), 60_000);
        return now - item.lastAttemptAt >= backoff;
      })
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  },

  async markProcessing(id: string) {
    await db.syncQueue.update(id, { status: 'processing', lastAttemptAt: Date.now() });
  },

  async markSynced(id: string) {
    await db.syncQueue.update(id, { status: 'synced', errorMessage: null });
  },

  async markFailed(id: string, errorMessage: string) {
    const item = await db.syncQueue.get(id);
    if (!item) return;
    if (item.retryCount >= item.maxRetries) {
      await db.syncQueue.update(id, { status: 'failed', errorMessage });
    } else {
      await db.syncQueue.update(id, {
        status: 'pending',
        retryCount: item.retryCount + 1,
        errorMessage,
        lastAttemptAt: Date.now(),
      });
    }
  },

  async retryFailed() {
    await db.syncQueue
      .where('status')
      .equals('failed')
      .modify({ status: 'pending', retryCount: 0, errorMessage: null, lastAttemptAt: null });
  },

  async resetStuckItems() {
    await db.syncQueue
      .where('status')
      .equals('processing')
      .modify({ status: 'pending', lastAttemptAt: null });
  },

  async getPendingCount(): Promise<number> {
    return db.syncQueue.where('status').anyOf(['pending', 'processing']).count();
  },

  async getFailedCount(): Promise<number> {
    return db.syncQueue.where('status').equals('failed').count();
  },

  /** After a queued image upload syncs, map operationId → real URL for product create/patch payloads. */
  async saveResolvedUpload(operationId: string, url: string) {
    await db.cachedData.put({
      key: `resolved-upload:${operationId}`,
      data: url,
      timestamp: Date.now(),
    });
  },

  async getResolvedUpload(operationId: string): Promise<string | null> {
    const row = await db.cachedData.get(`resolved-upload:${operationId}`);
    if (row?.data == null) return null;
    return typeof row.data === 'string' ? row.data : null;
  },

  // ---- Cached Data ----
  async setCachedData(key: string, data: any, ttl?: number) {
    await db.cachedData.put({
      key,
      data,
      timestamp: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : undefined,
    });
  },

  async getCachedData(key: string) {
    const cached = await db.cachedData.get(key);
    if (!cached) return null;
    if (cached.expiresAt && cached.expiresAt < Date.now()) {
      await db.cachedData.delete(key);
      return null;
    }
    return cached.data;
  },

  async deleteCachedData(key: string) {
    await db.cachedData.delete(key);
  },

  async clearExpiredCache() {
    const now = Date.now();
    await db.cachedData
      .filter((item) => !!item.expiresAt && item.expiresAt < now)
      .delete();
  },

  // ---- Database management ----
  async clearAll() {
    await Promise.all([
      db.products.clear(),
      db.sales.clear(),
      db.customers.clear(),
      db.syncQueue.clear(),
      db.cachedData.clear(),
    ]);
  },

  async getStats() {
    const [products, sales, customers, pendingRequests, failedRequests, cachedData] =
      await Promise.all([
        db.products.count(),
        db.sales.count(),
        db.customers.count(),
        offlineDB.getPendingCount(),
        offlineDB.getFailedCount(),
        db.cachedData.count(),
      ]);
    return { products, sales, customers, pendingRequests, failedRequests, cachedData };
  },
};

export default offlineDB;
