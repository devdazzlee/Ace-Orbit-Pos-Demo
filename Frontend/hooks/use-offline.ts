'use client';

import { useEffect, useState, useCallback } from 'react';
import { syncManager, SyncStatus } from '@/lib/offline-sync';
import { offlineDB } from '@/lib/offline-db';

export function useOnlineStatus() {
  const [status, setStatus] = useState<SyncStatus>(() => syncManager.getStatus());

  useEffect(() => {
    const unsubscribe = syncManager.subscribe(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sync = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    try {
      await syncManager.triggerSync();
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const retryFailed = useCallback(async () => {
    await syncManager.retryFailed();
  }, []);

  return { sync, retryFailed, isSyncing, error };
}

export function useOfflineStats() {
  const [stats, setStats] = useState({
    products: 0,
    sales: 0,
    customers: 0,
    pendingRequests: 0,
    failedRequests: 0,
    cachedData: 0,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const newStats = await offlineDB.getStats();
      setStats(newStats);
    } catch (error) {
      console.error('Failed to get offline stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}

export function useOfflineStorage() {
  const saveProducts = useCallback(async (products: any[]) => {
    return offlineDB.saveProducts(products);
  }, []);

  const saveCustomers = useCallback(async (customers: any[]) => {
    return offlineDB.saveCustomers(customers);
  }, []);

  const saveSale = useCallback(async (sale: any) => {
    return offlineDB.saveSale(sale);
  }, []);

  const getProducts = useCallback(async () => {
    return offlineDB.getProducts();
  }, []);

  const getCustomers = useCallback(async () => {
    return offlineDB.getCustomers();
  }, []);

  const getSales = useCallback(async () => {
    return offlineDB.getAllSales();
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    return offlineDB.searchProducts(query);
  }, []);

  const searchCustomers = useCallback(async (query: string) => {
    return offlineDB.searchCustomers(query);
  }, []);

  return {
    saveProducts,
    saveCustomers,
    saveSale,
    getProducts,
    getCustomers,
    getSales,
    searchProducts,
    searchCustomers,
  };
}

export function useOfflineReady() {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function checkReady() {
      const stats = await offlineDB.getStats();
      const hasData = stats.products > 0 || stats.customers > 0;
      setIsReady(hasData);

      let progressValue = 0;
      if (stats.products > 0) progressValue += 50;
      if (stats.customers > 0) progressValue += 30;
      if (stats.cachedData > 0) progressValue += 20;
      setProgress(Math.min(progressValue, 100));
    }

    checkReady();
    const interval = setInterval(checkReady, 5000);
    return () => clearInterval(interval);
  }, []);

  return { isReady, progress };
}
