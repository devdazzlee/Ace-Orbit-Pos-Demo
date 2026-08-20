/**
 * Keeps customer lists in sync across tabs (Customers, New Sale, Sales, etc.).
 * Without this, each screen uses its own cache and new customers only appear after refresh.
 */

import apiClient, { offlineRequestCacheKey } from './apiClient';
import { offlineDB } from './offline-db';
import { useStore, type Customer } from './store';

const CUSTOMER_LIST_CACHE_KEYS = [
  'customers-mgmt',
  'customers-sales',
  'customers-stock-out',
  'customers',
] as const;

export async function invalidateCustomerListCaches(): Promise<void> {
  const keys = [
    ...CUSTOMER_LIST_CACHE_KEYS,
    offlineRequestCacheKey('GET', '/customer', undefined),
  ];
  await Promise.all(keys.map((key) => offlineDB.deleteCachedData(key).catch(() => undefined)));
  useStore.setState({ lastCustomersFetch: null });
}

/** Merge one customer into the global POS store (instant UI update). */
export function upsertCustomerInStore(customer: Customer): void {
  if (!customer?.id) return;
  const state = useStore.getState();
  const idx = state.customers.findIndex((c) => c.id === customer.id);
  const customers =
    idx >= 0
      ? state.customers.map((c, i) => (i === idx ? { ...c, ...customer } : c))
      : [...state.customers, customer];
  useStore.setState({ customers, lastCustomersFetch: Date.now() });
  void offlineDB.saveCustomers(customers);
}

/**
 * After create/update/delete: bust all caches and reload the shared store.
 */
export async function refreshCustomerListGlobally(): Promise<Customer[]> {
  await invalidateCustomerListCaches();
  await useStore.getState().fetchCustomers(true);
  return useStore.getState().customers;
}

/** Fetch latest list from API and mirror into cachedGet keys used by Customers tab. */
export async function fetchCustomersForManagementTab(): Promise<Customer[]> {
  await invalidateCustomerListCaches();
  try {
    const res = await apiClient.get('/customer', {
      headers: { 'X-Skip-Offline-Cache': 'true' },
    });
    const list: Customer[] = res.data?.data ?? [];
    await offlineDB.saveCustomers(list);
    await offlineDB.setCachedData('customers-mgmt', list, 6 * 60 * 60 * 1000);
    useStore.setState({
      customers: list,
      lastCustomersFetch: Date.now(),
      customersLoading: false,
    });
    return list;
  } catch {
    const cached = await offlineDB.getCustomers();
    if (cached.length > 0) {
      const list = cached.map((c) => (c.data || c) as Customer);
      useStore.setState({ customers: list, customersLoading: false });
      return list;
    }
    throw new Error('Failed to load customers');
  }
}
