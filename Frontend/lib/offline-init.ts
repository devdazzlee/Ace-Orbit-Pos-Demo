/**
 * Initialize offline functionality
 * This should be called when the app starts
 */

'use client';

import { offlineDB } from './offline-db';
import { syncManager } from './offline-sync';
import { offlineAPIClient } from './offline-api-client';
import apiClient from './apiClient';

export async function initializeOfflineMode() {
  try {
    console.log('🔄 Initializing offline mode...');

    // Only initialize if user is logged in
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      console.log('⏭️ Skipping offline mode initialization (not logged in)');
      return true;
    }

    // Check if we have data in offline storage
    const stats = await offlineDB.getStats();
    console.log('📊 Offline storage stats:', stats);

    // Seed IndexedDB + GET cache when online (also refreshes empty product store)
    if (navigator.onLine) {
      console.log('📥 Fetching initial data for offline use...');
      await fetchInitialData();
    }

    // Start sync manager
    console.log('✅ Offline mode initialized');

    // If online, trigger sync
    if (navigator.onLine) {
      setTimeout(() => {
        syncManager.triggerSync();
      }, 2000);
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize offline mode:', error);
    return false;
  }
}

async function warmApiGetCache() {
  const paths: { url: string; params?: Record<string, unknown> }[] = [
    { url: '/branches', params: { fetch_all: true } },
    { url: '/suppliers' },
    { url: '/taxes' },
    { url: '/units' },
    { url: '/subcategories' },
    { url: '/dashboard/stats' },
    { url: '/sale/recent' },
    { url: '/products/best-selling' },
    { url: '/employee' },
    { url: '/employee/types' },
    { url: '/inventory/dashboard' },
    { url: '/sizes', params: { search: '' } },
    { url: '/colors', params: { search: '' } },
    { url: '/brands', params: { search: '' } },
  ];
  await Promise.allSettled(
    paths.map((p) => apiClient.get(p.url, p.params ? { params: p.params } : undefined))
  );
}

async function fetchInitialData() {
  try {
    await Promise.allSettled([
      apiClient.get('/products', { params: { fetch_all: true } }).then(async (res) => {
        const raw = res.data?.data;
        if (Array.isArray(raw) && raw.length > 0) {
          await offlineDB.saveProducts(raw);
          console.log(`✅ Cached ${raw.length} products`);
        }
      }),
      apiClient.get('/customer').then(async (res) => {
        const raw = res.data?.data;
        if (Array.isArray(raw) && raw.length > 0) {
          await offlineDB.saveCustomers(raw);
          await offlineDB.setCachedData('customers', raw);
          console.log(`✅ Cached ${raw.length} customers`);
        }
      }),
    ]);

    const catRes = await apiClient.get('/categories').catch(() => null);
    if (catRes?.data?.data && Array.isArray(catRes.data.data)) {
      const categories = [{ id: 'all', name: 'All' }, ...catRes.data.data];
      await offlineDB.setCachedData('categories', categories);
    }

    await warmApiGetCache();
  } catch (error) {
    console.error('❌ Failed to fetch initial data:', error);
  }
}

export { offlineDB, syncManager, offlineAPIClient };


