const AVAILABLE_DELIVERIES_CACHE_TTL_MS = 60 * 1000;

function getAvailableDeliveriesCacheKey(userId) {
  return `available_deliveries_cache_${userId || "default"}`;
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;

  const fetchedAt = Number(raw.fetchedAt);

  return {
    deliveries: Array.isArray(raw.deliveries) ? raw.deliveries : [],
    currentRoute: raw.currentRoute || {
      total_stops: 0,
      active_deliveries: 0,
    },
    driverLocation: raw.driverLocation || null,
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null,
  };
}

export function getAvailableDeliveriesQueryKey(userId) {
  return ["driver", "available-deliveries", userId || "default"];
}

export function readAvailableDeliveriesCache(
  userId,
  maxAgeMs = AVAILABLE_DELIVERIES_CACHE_TTL_MS,
) {
  try {
    const raw = localStorage.getItem(getAvailableDeliveriesCacheKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || !parsed?.data) return null;

    if (Date.now() - parsed.timestamp > maxAgeMs) {
      return null;
    }

    return normalizeSnapshot(parsed.data);
  } catch {
    return null;
  }
}

export function writeAvailableDeliveriesCache(userId, snapshot) {
  try {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) return;

    const withTimestamp = {
      ...normalized,
      fetchedAt: normalized.fetchedAt || Date.now(),
    };

    localStorage.setItem(
      getAvailableDeliveriesCacheKey(userId),
      JSON.stringify({
        data: withTimestamp,
        timestamp: Date.now(),
      }),
    );
  } catch {
    // Ignore cache write failures.
  }
}

export function getAvailableDeliveriesSnapshot(queryClient, userId) {
  const queryKey = getAvailableDeliveriesQueryKey(userId);
  const queryData = queryClient.getQueryData(queryKey);
  const normalizedQueryData = normalizeSnapshot(queryData);

  if (normalizedQueryData) {
    return normalizedQueryData;
  }

  return readAvailableDeliveriesCache(userId);
}

export function setAvailableDeliveriesSnapshot(queryClient, userId, snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) return;

  const withTimestamp = {
    ...normalized,
    fetchedAt: normalized.fetchedAt || Date.now(),
  };

  const queryKey = getAvailableDeliveriesQueryKey(userId);
  queryClient.setQueryData(queryKey, withTimestamp);
  writeAvailableDeliveriesCache(userId, withTimestamp);
}
