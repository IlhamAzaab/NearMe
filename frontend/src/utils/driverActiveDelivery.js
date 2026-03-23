import { API_URL } from "../config";

const ACTIVE_DELIVERY_STALE_MS = 30000;

export const buildDriverActiveMapPath = (deliveryId) =>
  deliveryId
    ? `/driver/delivery/active/${deliveryId}/map`
    : "/driver/delivery/active/map";

export const getDriverActiveDeliveryQueryKey = (userId = "default") => [
  "driver",
  "active-delivery",
  userId,
];

const normalizeActiveDeliveryId = (delivery) =>
  delivery?.delivery_id || delivery?.id || null;

const pickCurrentActiveDeliveryId = (deliveries) => {
  if (!Array.isArray(deliveries) || deliveries.length === 0) return null;
  return normalizeActiveDeliveryId(deliveries[0]);
};

export const fetchActiveDeliverySnapshot = async ({ token, signal }) => {
  if (!token) {
    return {
      deliveryId: null,
      deliveriesCount: 0,
      fetchedAt: Date.now(),
    };
  }

  const response = await fetch(`${API_URL}/driver/deliveries/active`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch active deliveries (${response.status})`);
  }

  const data = await response.json();
  const activeDeliveries = Array.isArray(data?.deliveries) ? data.deliveries : [];

  return {
    deliveryId: pickCurrentActiveDeliveryId(activeDeliveries),
    deliveriesCount: activeDeliveries.length,
    fetchedAt: Date.now(),
  };
};

export const cacheDriverActiveDeliveryId = (
  queryClient,
  { userId = "default", deliveryId },
) => {
  if (!queryClient || !deliveryId) return;
  queryClient.setQueryData(getDriverActiveDeliveryQueryKey(userId), {
    deliveryId,
    deliveriesCount: 1,
    fetchedAt: Date.now(),
  });
};

export const resolveDriverActiveMapPath = async ({
  queryClient,
  token,
  userId = "default",
  forceRefresh = false,
}) => {
  const fallbackPath = buildDriverActiveMapPath(null);
  const queryKey = getDriverActiveDeliveryQueryKey(userId);

  try {
    const cached = queryClient?.getQueryData(queryKey);
    if (
      !forceRefresh &&
      cached?.deliveryId &&
      Date.now() - (cached.fetchedAt || 0) < ACTIVE_DELIVERY_STALE_MS
    ) {
      return buildDriverActiveMapPath(cached.deliveryId);
    }

    const snapshot = queryClient
      ? await queryClient.fetchQuery({
          queryKey,
          staleTime: ACTIVE_DELIVERY_STALE_MS,
          queryFn: ({ signal }) =>
            fetchActiveDeliverySnapshot({ token, signal }),
        })
      : await fetchActiveDeliverySnapshot({ token });

    return buildDriverActiveMapPath(snapshot?.deliveryId);
  } catch (error) {
    console.error("[Driver Active Map] Resolver failed:", error);
    return fallbackPath;
  }
};
