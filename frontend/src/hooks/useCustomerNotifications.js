import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "../config";

const MINUTE = 60 * 1000;

function getCustomerAuth() {
	const token = localStorage.getItem("token");
	const role = localStorage.getItem("role");
	return {
		token,
		role,
		isCustomer: Boolean(token) && role === "customer",
	};
}

async function fetchJson(url, options = {}) {
	const response = await fetch(url, options);
	const data = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error(data?.message || "Request failed");
	}

	return data;
}

export const customerQueryKeys = {
	root: ["customer"],
	homeRestaurants: (search = "") => ["customer", "home", "restaurants", search],
	homeFoods: (search = "") => ["customer", "home", "foods", search],
	cart: ["customer", "cart"],
	cartCount: ["customer", "cart", "count"],
	notifications: ["customer", "notifications"],
	notificationUnreadCount: ["customer", "notifications", "unread-count"],
	profile: ["customer", "profile"],
	orders: ["customer", "orders"],
	order: (orderId) => ["customer", "orders", orderId],
	launchPromotion: ["customer", "launch-promotion"],
	feeConfig: ["customer", "fee-config"],
	restaurant: (restaurantId) => ["customer", "restaurant", restaurantId],
	restaurantFoods: (restaurantId, search = "") => ["customer", "restaurant", restaurantId, "foods", search],
	foodDetail: (restaurantId, foodId) => ["customer", "restaurant", restaurantId, "food", foodId],
};

export function useCustomerCartQuery(options = {}) {
	const { isCustomer } = getCustomerAuth();

	return useQuery({
		queryKey: customerQueryKeys.cart,
		enabled: isCustomer && (options.enabled ?? true),
		staleTime: 20 * 1000,
		gcTime: 20 * MINUTE,
		queryFn: async () => {
			const data = await fetchJson(`${API_URL}/cart`);
			return data?.carts || [];
		},
		...options,
	});
}

export function useCustomerCartCount(options = {}) {
	return useCustomerCartQuery({
		...options,
		select: (carts = []) =>
			carts.reduce(
				(sum, cart) =>
					sum +
					(cart.items || []).reduce(
						(itemSum, item) => itemSum + (item.quantity || 0),
						0,
					),
				0,
			),
	});
}

export function useCustomerNotificationsQuery(options = {}) {
	const { isCustomer } = getCustomerAuth();

	return useQuery({
		queryKey: customerQueryKeys.notifications,
		enabled: isCustomer && (options.enabled ?? true),
		staleTime: 30 * 1000,
		gcTime: 20 * MINUTE,
		queryFn: async () => {
			const data = await fetchJson(`${API_URL}/customer/notifications?limit=100`);
			return data?.notifications || [];
		},
		...options,
	});
}

export function useCustomerUnreadNotificationsCount(options = {}) {
	return useCustomerNotificationsQuery({
		...options,
		select: (notifications = []) => notifications.filter((n) => !n.is_read).length,
	});
}

export function useCustomerProfileQuery(options = {}) {
	const { isCustomer } = getCustomerAuth();

	return useQuery({
		queryKey: customerQueryKeys.profile,
		enabled: isCustomer && (options.enabled ?? true),
		staleTime: 2 * MINUTE,
		gcTime: 30 * MINUTE,
		queryFn: async () => {
			const data = await fetchJson(`${API_URL}/customer/me`);
			return data?.customer || data;
		},
		...options,
	});
}

export function useCustomerOrdersQuery(options = {}) {
	const { isCustomer } = getCustomerAuth();

	return useQuery({
		queryKey: customerQueryKeys.orders,
		enabled: isCustomer && (options.enabled ?? true),
		staleTime: 20 * 1000,
		gcTime: 20 * MINUTE,
		queryFn: async () => {
			const data = await fetchJson(`${API_URL}/orders/my-orders`);
			return data?.orders || [];
		},
		...options,
	});
}

export function useCustomerOrderQuery(orderId, options = {}) {
	const { isCustomer } = getCustomerAuth();

	return useQuery({
		queryKey: customerQueryKeys.order(orderId),
		enabled: isCustomer && Boolean(orderId) && (options.enabled ?? true),
		staleTime: 15 * 1000,
		gcTime: 20 * MINUTE,
		queryFn: async () => {
			const data = await fetchJson(`${API_URL}/orders/${orderId}`);
			return data?.order || null;
		},
		...options,
	});
}

export function usePublicRestaurantsQuery(search = "", options = {}) {
	return useQuery({
		queryKey: customerQueryKeys.homeRestaurants(search),
		staleTime: 60 * 1000,
		gcTime: 20 * MINUTE,
		queryFn: async () => {
			const url = new URL(`${API_URL}/public/restaurants`);
			if (search) {
				url.searchParams.append("search", search);
			}

			const data = await fetchJson(url.toString());
			return data?.restaurants || [];
		},
		...options,
	});
}

export function usePublicFoodsQuery(search = "", options = {}) {
	return useQuery({
		queryKey: customerQueryKeys.homeFoods(search),
		staleTime: 60 * 1000,
		gcTime: 20 * MINUTE,
		queryFn: async () => {
			const url = new URL(`${API_URL}/public/foods`);
			if (search) {
				url.searchParams.append("search", search);
			}

			const data = await fetchJson(url.toString());
			return data?.foods || [];
		},
		...options,
	});
}

export function usePublicRestaurantQuery(restaurantId, options = {}) {
	return useQuery({
		queryKey: customerQueryKeys.restaurant(restaurantId),
		enabled: Boolean(restaurantId) && (options.enabled ?? true),
		staleTime: 2 * MINUTE,
		gcTime: 30 * MINUTE,
		queryFn: async () => {
			const data = await fetchJson(`${API_URL}/public/restaurants/${restaurantId}`);
			return data?.restaurant || null;
		},
		...options,
	});
}

export function usePublicRestaurantFoodsQuery(restaurantId, search = "", options = {}) {
	return useQuery({
		queryKey: customerQueryKeys.restaurantFoods(restaurantId, search),
		enabled: Boolean(restaurantId) && (options.enabled ?? true),
		staleTime: 60 * 1000,
		gcTime: 20 * MINUTE,
		queryFn: async () => {
			const foodsUrl = new URL(`${API_URL}/public/restaurants/${restaurantId}/foods`);
			if (search) {
				foodsUrl.searchParams.append("search", search);
			}

			const data = await fetchJson(foodsUrl.toString());
			return data?.foods || [];
		},
		...options,
	});
}

export function usePublicFoodDetailQuery(restaurantId, foodId, options = {}) {
	return useQuery({
		queryKey: customerQueryKeys.foodDetail(restaurantId, foodId),
		enabled: Boolean(restaurantId && foodId) && (options.enabled ?? true),
		staleTime: 2 * MINUTE,
		gcTime: 30 * MINUTE,
		queryFn: async () => {
			const data = await fetchJson(
				`${API_URL}/public/restaurants/${restaurantId}/foods/${foodId}`,
			);
			return data?.food || null;
		},
		...options,
	});
}

export function useLaunchPromotionStatusQuery(options = {}) {
	const { isCustomer } = getCustomerAuth();

	return useQuery({
		queryKey: customerQueryKeys.launchPromotion,
		enabled: isCustomer && (options.enabled ?? true),
		staleTime: 60 * 1000,
		gcTime: 20 * MINUTE,
		queryFn: async () => fetchJson(`${API_URL}/customer/launch-promotion`),
		...options,
	});
}

export function useFeeConfigQuery(options = {}) {
	return useQuery({
		queryKey: customerQueryKeys.feeConfig,
		staleTime: 10 * MINUTE,
		gcTime: 30 * MINUTE,
		queryFn: async () => fetchJson(`${API_URL}/public/fee-config`),
		...options,
	});
}

export function useAddToCartMutation(options = {}) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload) =>
			fetchJson(`${API_URL}/cart/add`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}),
		onSuccess: async (...args) => {
			await queryClient.invalidateQueries({ queryKey: customerQueryKeys.cart });
			await queryClient.invalidateQueries({ queryKey: customerQueryKeys.orders });
			if (options.onSuccess) {
				await options.onSuccess(...args);
			}
		},
		...options,
	});
}

export function useUpdateCartItemMutation(options = {}) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ itemId, quantity }) =>
			fetchJson(`${API_URL}/cart/item/${itemId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ quantity }),
			}),
		onSuccess: async (...args) => {
			await queryClient.invalidateQueries({ queryKey: customerQueryKeys.cart });
			if (options.onSuccess) {
				await options.onSuccess(...args);
			}
		},
		...options,
	});
}

export function useRemoveCartItemMutation(options = {}) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (itemId) =>
			fetchJson(`${API_URL}/cart/item/${itemId}`, {
				method: "DELETE",
			}),
		onSuccess: async (...args) => {
			await queryClient.invalidateQueries({ queryKey: customerQueryKeys.cart });
			if (options.onSuccess) {
				await options.onSuccess(...args);
			}
		},
		...options,
	});
}

export function useRemoveCartMutation(options = {}) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (cartId) =>
			fetchJson(`${API_URL}/cart/${cartId}`, {
				method: "DELETE",
			}),
		onSuccess: async (...args) => {
			await queryClient.invalidateQueries({ queryKey: customerQueryKeys.cart });
			if (options.onSuccess) {
				await options.onSuccess(...args);
			}
		},
		...options,
	});
}

export function useAcknowledgeLaunchPromotionMutation(options = {}) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () =>
			fetchJson(`${API_URL}/customer/launch-promotion/acknowledge`, {
				method: "POST",
			}),
		onSuccess: async (...args) => {
			await queryClient.invalidateQueries({ queryKey: customerQueryKeys.launchPromotion });
			if (options.onSuccess) {
				await options.onSuccess(...args);
			}
		},
		...options,
	});
}

export function estimateCustomerQueryCacheUsage(queryClient) {
	const allQueries = queryClient.getQueryCache().findAll({
		predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "customer",
	});

	let totalBytes = 0;
	const entries = allQueries.map((query) => {
		let bytes = 0;
		try {
			bytes = new Blob([JSON.stringify(query.state.data ?? null)]).size;
		} catch {
			bytes = 0;
		}
		totalBytes += bytes;
		return {
			key: query.queryKey,
			bytes,
			updatedAt: query.state.dataUpdatedAt || 0,
			observers: query.getObserversCount(),
			isStale: query.isStale(),
		};
	});

	return {
		queryCount: allQueries.length,
		estimatedBytes: totalBytes,
		estimatedKB: Number((totalBytes / 1024).toFixed(2)),
		entries: entries.sort((a, b) => b.bytes - a.bytes),
	};
}
