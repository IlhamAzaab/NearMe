import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const AdminCacheContext = createContext(null);

// Cache keys for different admin data types
export const CACHE_KEYS = {
  DASHBOARD: "admin_dashboard",
  RESTAURANT: "admin_restaurant",
  PRODUCTS: "admin_products",
  CATEGORIES: "admin_categories",
  ORDERS: "admin_orders",
  EARNINGS: "admin_earnings",
  NOTIFICATIONS: "admin_notifications",
  WITHDRAWALS: "admin_withdrawals",
  PROFILE: "admin_profile",
};

// In-memory cache with localStorage backup
const memoryCache = new Map();

// Helper to get cached data
function getCachedData(key) {
  // First check memory cache
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  // Then check localStorage
  try {
    const stored = localStorage.getItem(`cache_${key}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Check if cache is not too old (max 24 hours for localStorage)
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        memoryCache.set(key, parsed.data);
        return parsed.data;
      }
    }
  } catch (e) {
    console.error("Cache read error:", e);
  }
  return null;
}

// Helper to set cached data
function setCachedData(key, data) {
  memoryCache.set(key, data);
  try {
    localStorage.setItem(
      `cache_${key}`,
      JSON.stringify({ data, timestamp: Date.now() }),
    );
  } catch (e) {
    console.error("Cache write error:", e);
  }
}

// Helper to clear specific cache
function clearCachedData(key) {
  memoryCache.delete(key);
  try {
    localStorage.removeItem(`cache_${key}`);
  } catch (e) {
    console.error("Cache clear error:", e);
  }
}

export function AdminCacheProvider({ children }) {
  const [cacheVersion, setCacheVersion] = useState(0);

  // Get cached data
  const getCache = useCallback((key) => {
    return getCachedData(key);
  }, []);

  // Set cached data
  const setCache = useCallback((key, data) => {
    setCachedData(key, data);
    setCacheVersion((v) => v + 1);
  }, []);

  // Clear specific cache
  const clearCache = useCallback((key) => {
    clearCachedData(key);
    setCacheVersion((v) => v + 1);
  }, []);

  // Clear all admin cache
  const clearAllCache = useCallback(() => {
    Object.values(CACHE_KEYS).forEach((key) => {
      clearCachedData(key);
    });
    setCacheVersion((v) => v + 1);
  }, []);

  // Invalidate cache (mark as stale but keep data)
  const invalidateCache = useCallback((key) => {
    const data = getCachedData(key);
    if (data) {
      setCachedData(key, { ...data, _stale: true });
    }
  }, []);

  return (
    <AdminCacheContext.Provider
      value={{
        getCache,
        setCache,
        clearCache,
        clearAllCache,
        invalidateCache,
        cacheVersion,
      }}
    >
      {children}
    </AdminCacheContext.Provider>
  );
}

export function useAdminCache() {
  const context = useContext(AdminCacheContext);
  if (!context) {
    throw new Error("useAdminCache must be used within AdminCacheProvider");
  }
  return context;
}

/**
 * Hook for fetching admin data with caching
 * Shows cached data immediately, fetches fresh data in background
 *
 * @param {string} cacheKey - The cache key to use
 * @param {Function} fetchFn - Async function that fetches the data
 * @param {Object} options - Additional options
 * @returns {Object} { data, loading, refreshing, error, refresh }
 */
export function useAdminData(cacheKey, fetchFn, options = {}) {
  const { getCache, setCache } = useAdminCache();
  const queryClient = useQueryClient();
  const cached = getCache(cacheKey);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["admin", "cache", cacheKey],
    staleTime: options.staleTime ?? 60 * 1000,
    initialData: cached ?? undefined,
    queryFn: async () => {
      const result = await fetchFn();
      setCache(cacheKey, result);
      return result;
    },
  });

  const refresh = useCallback(() => {
    return queryClient.invalidateQueries({
      queryKey: ["admin", "cache", cacheKey],
    });
  }, [cacheKey, queryClient]);

  return {
    data,
    loading: isLoading && !data,
    refreshing: isFetching,
    error: error?.message || null,
    refresh,
    hasAnimated: !!cached,
    setData: (newData) => {
      setCache(cacheKey, newData);
      queryClient.setQueryData(["admin", "cache", cacheKey], newData);
    },
  };
}

export default AdminCacheContext;
