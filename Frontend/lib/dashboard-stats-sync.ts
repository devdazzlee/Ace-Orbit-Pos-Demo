import apiClient, { offlineRequestCacheKey } from "./apiClient";
import { offlineDB } from "./offline-db";
import { isAdminRole, normalizeBranchId } from "./branch-utils";

const DASHBOARD_STATS_PATHS = [
  "/dashboard/stats",
  "/dashboard/collections",
  "/sale/recent",
  "/products/best-selling",
] as const;

export const DASHBOARD_STATS_REFRESH_EVENT = "dashboard-stats-refresh";

function collectDashboardCacheKeys(): string[] {
  const keys = new Set<string>();

  for (const path of DASHBOARD_STATS_PATHS) {
    keys.add(offlineRequestCacheKey("GET", path, undefined));

    if (typeof window !== "undefined") {
      const branchId = normalizeBranchId(localStorage.getItem("branch"));
      if (branchId) {
        keys.add(offlineRequestCacheKey("GET", path, { branchId }));
      }
    }
  }

  return [...keys];
}

export async function invalidateDashboardStatsCaches(): Promise<void> {
  const keys = collectDashboardCacheKeys();
  await Promise.all(keys.map((key) => offlineDB.deleteCachedData(key).catch(() => undefined)));
}

/** Admin users have no branch — always fetch org-wide totals. */
export function getDashboardStatsParams(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;

  const role = localStorage.getItem("role");
  if (isAdminRole(role)) return undefined;

  const branchId = normalizeBranchId(localStorage.getItem("branch"));
  return branchId ? { branchId } : undefined;
}

/** Fresh dashboard stats (skips offline GET cache). */
export async function fetchDashboardStatsFresh() {
  const params = getDashboardStatsParams();
  const response = await apiClient.get("/dashboard/stats", {
    params,
    headers: { "X-Skip-Offline-Cache": "true" },
  });
  return response?.data?.data ?? null;
}

export function notifyDashboardStatsChanged(): void {
  if (typeof window === "undefined") return;
  void invalidateDashboardStatsCaches();
  window.dispatchEvent(new Event(DASHBOARD_STATS_REFRESH_EVENT));
}
