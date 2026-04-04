/**
 * Driver Dashboard Page
 *
 * Features:
 * - Online/Offline status toggle with working time validation
 * - Today's earnings and deliveries stats
 * - Active time tracking
 * - Nearby delivery requests
 * - Bottom navigation
 * - Working time based status (full_time, day, night)
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import DriverLayout from "../../components/DriverLayout";
import { API_URL } from "../../config";
import { useDriverDeliveryNotifications } from "../../context/DriverDeliveryNotificationContext";
import {
  buildDriverActiveMapPath,
  cacheDriverActiveDeliveryId,
  resolveDriverActiveMapPath,
} from "../../utils/driverActiveDelivery";
import {
  getAvailableDeliveriesQueryKey,
  getAvailableDeliveriesSnapshot,
  setAvailableDeliveriesSnapshot,
} from "../../utils/availableDeliveriesCache";

// Material Symbols CSS
const MaterialSymbolsCSS = () => (
  <link
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
    rel="stylesheet"
  />
);

// Working time display labels
const WORKING_TIME_LABELS = {
  full_time: "Full Time",
  day: "Day Shift (5AM - 7PM)",
  night: "Night Shift (6PM - 6AM)",
};

const DRIVER_DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_LOCATION = { latitude: 8.5017, longitude: 81.2377 };

const getDriverDashboardCacheKey = () => {
  const userId = localStorage.getItem("userId") || "default";
  return `driver_dashboard_cache_${userId}`;
};

const readDriverDashboardCache = () => {
  try {
    const raw = localStorage.getItem(getDriverDashboardCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.cachedAt) return null;
    if (Date.now() - parsed.cachedAt > DRIVER_DASHBOARD_CACHE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeDriverDashboardCache = (snapshot) => {
  try {
    localStorage.setItem(
      getDriverDashboardCacheKey(),
      JSON.stringify({ ...snapshot, cachedAt: Date.now() }),
    );
  } catch {
    // Ignore cache write failures.
  }
};

export default function DriverDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = localStorage.getItem("userId") || "default";
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const cachedDashboard = readDriverDashboardCache();
  const nearbySnapshot = getAvailableDeliveriesSnapshot(queryClient, userId);
  const nearbyRequestsQueryKey = getAvailableDeliveriesQueryKey(userId);
  const [isOnline, setIsOnline] = useState(
    () => cachedDashboard?.isOnline ?? false,
  );
  const [stats, setStats] = useState(
    () =>
      cachedDashboard?.stats || {
        todayEarnings: 0,
        todayDeliveries: 0,
      },
  );
  const [monthlyStats, setMonthlyStats] = useState(
    () =>
      cachedDashboard?.monthlyStats || {
        earnings: 0,
        deliveries: 0,
      },
  );
  const [recentDeliveries, setRecentDeliveries] = useState(
    () => cachedDashboard?.recentDeliveries || [],
  );
  const [availableDeliveries, setAvailableDeliveries] = useState(
    () =>
      nearbySnapshot?.deliveries || cachedDashboard?.availableDeliveries || [],
  );
  const [activeDeliveries, setActiveDeliveries] = useState(
    () => cachedDashboard?.activeDeliveries || [],
  );
  const [loading, setLoading] = useState(() => !cachedDashboard);
  const [driverProfile, setDriverProfile] = useState(
    () => cachedDashboard?.driverProfile || null,
  );
  const [driverLocation, setDriverLocation] = useState(
    () => nearbySnapshot?.driverLocation || null,
  );
  const [acceptingOrder, setAcceptingOrder] = useState(null);
  const [withinWorkingHours, setWithinWorkingHours] = useState(
    () => cachedDashboard?.withinWorkingHours ?? true,
  );
  const [manualOverrideActive, setManualOverrideActive] = useState(
    () => cachedDashboard?.manualOverrideActive ?? false,
  );
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();

  // Driver notification context - to sync online status
  const { setDriverOnline } = useDriverDeliveryNotifications();

  const workingHoursCheckRef = useRef(null);
  const autoOnlineInFlightRef = useRef(false);

  const { data: nearbyRequestsSnapshot } = useQuery({
    queryKey: nearbyRequestsQueryKey,
    enabled: !!token && role === "driver",
    staleTime: 60 * 1000,
    queryFn: async () => getAvailableDeliveriesSnapshot(queryClient, userId),
    initialData: nearbySnapshot || undefined,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!nearbyRequestsSnapshot) return;
    setAvailableDeliveries(nearbyRequestsSnapshot.deliveries || []);
    if (nearbyRequestsSnapshot.driverLocation) {
      setDriverLocation(nearbyRequestsSnapshot.driverLocation);
    }
  }, [nearbyRequestsSnapshot]);

  const { data: withdrawalsSummary } = useQuery({
    queryKey: ["driver", "withdrawals", "summary", userId],
    enabled: !!token && role === "driver",
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/driver/withdrawals/my/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data?.summary) {
        throw new Error(data?.message || "Failed to load withdrawals summary");
      }
      return data.summary;
    },
  });

  const balanceToReceive = Number(withdrawalsSummary?.remaining_balance || 0);

  const forceOnlineIfWithinWorkingHours = useCallback(async () => {
    if (!withinWorkingHours || isOnline || autoOnlineInFlightRef.current)
      return;

    autoOnlineInFlightRef.current = true;
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch(`${API_URL}/driver/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "active", manualOverride: false }),
      });

      if (res.ok) {
        const data = await res.json();
        const online = data.status === "active";
        setIsOnline(online);
        setManualOverrideActive(data.manual_override || false);

        const prev = readDriverDashboardCache() || {};
        writeDriverDashboardCache({
          ...prev,
          isOnline: online,
          withinWorkingHours,
          manualOverrideActive: data.manual_override || false,
        });
      }
    } catch (error) {
      console.error("Auto-online enforcement error:", error);
    } finally {
      autoOnlineInFlightRef.current = false;
    }
  }, [isOnline, withinWorkingHours]);

  // ============================================================================
  // SYNC ONLINE STATUS TO NOTIFICATION CONTEXT
  // ============================================================================

  useEffect(() => {
    setDriverOnline(isOnline);
  }, [isOnline, setDriverOnline]);

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
    }
  }, [navigate]);

  // ============================================================================
  // FETCH DRIVER PROFILE
  // ============================================================================

  const fetchDriverProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }
      const res = await fetch(`${API_URL}/driver/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Handle authentication errors - redirect to login
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        navigate("/login");
        return;
      }

      // Handle rate limiting - just skip, don't redirect
      if (res.status === 429) {
        console.warn("Profile fetch rate limited (429) - skipping");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const fetchedIsOnline = data.driver.driver_status === "active";
        const fetchedWithinWorkingHours =
          data.driver.within_working_hours !== false;

        setDriverProfile(data.driver);
        setIsOnline(fetchedIsOnline);
        setWithinWorkingHours(data.driver.within_working_hours);
        setManualOverrideActive(data.driver.manual_status_override || false);

        const prev = readDriverDashboardCache() || {};
        writeDriverDashboardCache({
          ...prev,
          driverProfile: data.driver,
          isOnline: fetchedIsOnline,
          withinWorkingHours: fetchedWithinWorkingHours,
          manualOverrideActive: data.driver.manual_status_override || false,
        });

        if (fetchedWithinWorkingHours && !fetchedIsOnline) {
          forceOnlineIfWithinWorkingHours();
        }
      }
    } catch (error) {
      console.error("Profile fetch error:", error);
      // Network error - redirect to login
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      navigate("/login");
    }
  }, [forceOnlineIfWithinWorkingHours, navigate]);

  // ============================================================================
  // CHECK WORKING HOURS STATUS
  // ============================================================================

  const checkWorkingHoursStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/driver/working-hours-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const fetchedWithinWorkingHours = data.within_working_hours !== false;
        setWithinWorkingHours(data.within_working_hours);
        setManualOverrideActive(data.manual_override);

        const prev = readDriverDashboardCache() || {};
        writeDriverDashboardCache({
          ...prev,
          isOnline,
          withinWorkingHours: fetchedWithinWorkingHours,
          manualOverrideActive: data.manual_override || false,
        });

        // If status was auto-updated, refresh the profile
        if (data.auto_updated) {
          const online = data.driver_status === "active";
          setIsOnline(online);

          const next = readDriverDashboardCache() || {};
          writeDriverDashboardCache({
            ...next,
            isOnline: online,
          });

          setStatusMessage(
            data.message || "Status changed due to working hours",
          );
          // Clear message after 5 seconds
          setTimeout(() => setStatusMessage(""), 5000);
        }

        if (fetchedWithinWorkingHours && data.driver_status !== "active") {
          forceOnlineIfWithinWorkingHours();
        }
      }
    } catch (error) {
      console.error("Working hours check error:", error);
    }
  }, [forceOnlineIfWithinWorkingHours, isOnline]);

  // ============================================================================
  // FETCH DASHBOARD DATA
  // ============================================================================

  const fetchDashboardData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      let currentLocation =
        driverLocation || nearbySnapshot?.driverLocation || DEFAULT_LOCATION;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 30000,
            });
          });
          currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setDriverLocation(currentLocation);
        } catch {
          // Keep fallback location to avoid blocking dashboard requests.
        }
      }

      // Use Promise.allSettled to fetch all data in parallel (reduces sequential latency)
      const headers = { Authorization: `Bearer ${token}` };
      const deliveriesUrl = `${API_URL}/driver/deliveries/available/v2?driver_latitude=${currentLocation.latitude}&driver_longitude=${currentLocation.longitude}`;

      const [
        statsRes,
        monthlyStatsRes,
        recentRes,
        activeDeliveriesRes,
        availableRes,
      ] = await Promise.allSettled([
        fetch(`${API_URL}/driver/stats/today`, { headers }),
        fetch(`${API_URL}/driver/stats/monthly`, { headers }),
        fetch(`${API_URL}/driver/deliveries/recent?limit=5`, { headers }),
        fetch(`${API_URL}/driver/deliveries/active`, { headers }),
        fetch(deliveriesUrl, { headers }),
      ]);

      // Check for 429 on any response — if so, skip processing and back off
      const allResults = [
        statsRes,
        monthlyStatsRes,
        recentRes,
        activeDeliveriesRes,
        availableRes,
      ];
      const got429 = allResults.some(
        (r) => r.status === "fulfilled" && r.value.status === 429,
      );
      if (got429) {
        console.warn("Rate limited (429) — backing off for next poll cycle");
        if (typeof rateLimitedRef !== "undefined") {
          rateLimitedRef.current = true;
        }
        return;
      }

      // Process stats
      let nextStats = null;
      let nextMonthlyStats = null;
      let nextRecentDeliveries = null;
      let nextActiveDeliveries = null;
      let nextAvailableDeliveries = null;

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const statsData = await statsRes.value.json();
        nextStats = {
          todayEarnings: statsData.earnings || 0,
          todayDeliveries: statsData.deliveries || 0,
        };
        setStats(nextStats);
      }

      // Process monthly stats
      if (monthlyStatsRes.status === "fulfilled" && monthlyStatsRes.value.ok) {
        const monthlyData = await monthlyStatsRes.value.json();
        nextMonthlyStats = {
          earnings: monthlyData.earnings || 0,
          deliveries: monthlyData.deliveries || 0,
        };
        setMonthlyStats(nextMonthlyStats);
      }

      // Process recent deliveries
      if (recentRes.status === "fulfilled" && recentRes.value.ok) {
        const recentData = await recentRes.value.json();
        nextRecentDeliveries = recentData.deliveries || [];
        setRecentDeliveries(nextRecentDeliveries);
      }

      // Process active deliveries
      if (
        activeDeliveriesRes.status === "fulfilled" &&
        activeDeliveriesRes.value.ok
      ) {
        const activeDeliveriesData = await activeDeliveriesRes.value.json();
        nextActiveDeliveries = activeDeliveriesData.deliveries || [];
        setActiveDeliveries(nextActiveDeliveries);
      }

      if (availableRes.status === "fulfilled" && availableRes.value.ok) {
        const deliveriesData = await availableRes.value.json();
        nextAvailableDeliveries =
          deliveriesData.available_deliveries ||
          deliveriesData.deliveries ||
          [];

        setAvailableDeliveries(nextAvailableDeliveries);
        setAvailableDeliveriesSnapshot(queryClient, userId, {
          deliveries: nextAvailableDeliveries,
          currentRoute: deliveriesData.current_route || {
            total_stops: 0,
            active_deliveries: 0,
          },
          driverLocation: deliveriesData.driver_location || currentLocation,
          fetchedAt: Date.now(),
        });
      }

      const prev = readDriverDashboardCache() || {};
      writeDriverDashboardCache({
        ...prev,
        stats: nextStats || prev.stats,
        monthlyStats: nextMonthlyStats || prev.monthlyStats,
        recentDeliveries: nextRecentDeliveries || prev.recentDeliveries,
        availableDeliveries:
          nextAvailableDeliveries ||
          prev.availableDeliveries ||
          availableDeliveries,
        activeDeliveries: nextActiveDeliveries || prev.activeDeliveries,
      });
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [
    availableDeliveries,
    driverLocation,
    navigate,
    nearbySnapshot?.driverLocation,
    queryClient,
    userId,
  ]);

  // Track if we're rate limited to back off
  const rateLimitedRef = useRef(false);
  useQuery({
    queryKey: ["driver", "dashboard", "snapshot", userId],
    enabled: !!token && role === "driver",
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    initialData: cachedDashboard || undefined,
    queryFn: async () => {
      if (rateLimitedRef.current) {
        // Back off one cycle after 429, matching previous behavior.
        rateLimitedRef.current = false;
        return readDriverDashboardCache() || {};
      }

      await fetchDriverProfile();
      await fetchDashboardData();
      return readDriverDashboardCache() || {};
    },
  });

  // ============================================================================
  // WORKING HOURS CHECK (every minute)
  // ============================================================================

  useEffect(() => {
    // Check working hours status every minute
    workingHoursCheckRef.current = setInterval(checkWorkingHoursStatus, 60000);

    return () => {
      if (workingHoursCheckRef.current) {
        clearInterval(workingHoursCheckRef.current);
      }
    };
  }, [checkWorkingHoursStatus]);

  // ============================================================================
  // TOGGLE ONLINE STATUS
  // ============================================================================

  const handleToggleOnline = async (manualOverride = false) => {
    try {
      const token = localStorage.getItem("token");
      const newStatus = !isOnline;

      // If trying to go online and outside working hours, show modal
      if (newStatus && !withinWorkingHours && !manualOverride) {
        setShowOverrideModal(true);
        return;
      }

      const res = await fetch(`${API_URL}/driver/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus ? "active" : "inactive",
          manualOverride: manualOverride,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const online = data.status === "active";
        setIsOnline(online);
        setManualOverrideActive(data.manual_override || false);

        const prev = readDriverDashboardCache() || {};
        writeDriverDashboardCache({
          ...prev,
          isOnline: online,
          withinWorkingHours,
          manualOverrideActive: data.manual_override || false,
        });

        // Refresh deliveries after status change
        fetchDashboardData();
      } else {
        const errorData = await res.json();
        showError(errorData.message || "Failed to update status");
      }
    } catch (error) {
      console.error("Status toggle error:", error);
    }
  };

  // Handle manual override confirmation
  const handleManualOverrideConfirm = () => {
    setShowOverrideModal(false);
    handleToggleOnline(true);
  };

  const openActiveMap = useCallback(async () => {
    const token = localStorage.getItem("token");
    const path = await resolveDriverActiveMapPath({
      queryClient,
      token,
      userId,
    });
    navigate(path);
  }, [navigate, queryClient, userId]);

  // ============================================================================
  // ACCEPT DELIVERY REQUEST
  // ============================================================================

  const handleAcceptDelivery = async (deliveryId) => {
    setAcceptingOrder(deliveryId);
    try {
      const token = localStorage.getItem("token");
      let acceptLocation = driverLocation;

      if (!acceptLocation && navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 30000,
            });
          });

          acceptLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setDriverLocation(acceptLocation);
        } catch {
          // Keep null payload fields if location isn't available yet.
        }
      }

      const body = {
        driver_latitude: acceptLocation?.latitude,
        driver_longitude: acceptLocation?.longitude,
      };

      const res = await fetch(
        `${API_URL}/driver/deliveries/${deliveryId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (res.ok) {
        cacheDriverActiveDeliveryId(queryClient, { userId, deliveryId });
        navigate(buildDriverActiveMapPath(deliveryId));
      } else {
        const data = await res.json();
        if (data?.driver_status === "suspended") {
          window.alert(
            data.message ||
              "Deposit the collected money to the Meezo platform before accepting new deliveries.",
          );
        }
        showError(data.message || "Failed to accept delivery");
      }
    } catch (error) {
      console.error("Accept delivery error:", error);
      showError("Failed to accept delivery");
    } finally {
      setAcceptingOrder(null);
    }
  };

  // ============================================================================
  // CALCULATE DISTANCE - Use route_impact values like AvailableDeliveries
  // ============================================================================

  const calculateDistance = (delivery) => {
    // Route-based shortest distance only (no straight-line fallback)
    const routeImpact = delivery.route_impact || {};

    if (Number.isFinite(Number(delivery.total_delivery_distance_km))) {
      return Number(delivery.total_delivery_distance_km).toFixed(1);
    }

    if (Number.isFinite(Number(routeImpact.total_distance_km))) {
      return Number(routeImpact.total_distance_km).toFixed(1);
    }

    if (Number.isFinite(Number(routeImpact.r1_distance_km))) {
      return Number(routeImpact.r1_distance_km).toFixed(1);
    }

    const dtrKm = Number(routeImpact.driver_to_restaurant_km);
    const rtcKm = Number(routeImpact.restaurant_to_customer_km);
    if (Number.isFinite(dtrKm) && Number.isFinite(rtcKm)) {
      return (dtrKm + rtcKm).toFixed(1);
    }

    return null;
  };

  // Get earnings breakdown from delivery
  const getEarningsBreakdown = (delivery) => {
    const routeImpact = delivery.route_impact || {};
    const pricing = delivery.pricing || {};
    const sequence = Number(routeImpact.delivery_sequence || 0);
    const hasRouteExtraSignals =
      Number(routeImpact.extra_distance_km || 0) > 0 ||
      Number(routeImpact.extra_time_minutes || 0) > 0 ||
      Number(routeImpact.extra_earnings || 0) > 0 ||
      Number(routeImpact.bonus_amount || 0) > 0;
    const hasActiveDeliveries = Number(activeDeliveries?.length || 0) > 0;
    const isStacked =
      routeImpact.is_first_delivery === false ||
      sequence > 1 ||
      hasRouteExtraSignals ||
      hasActiveDeliveries;
    const isFirst = !isStacked;

    const baseAmount = parseFloat(
      routeImpact.base_amount ||
        pricing.base_amount ||
        pricing.total_trip_earnings ||
        routeImpact.total_trip_earnings ||
        0,
    );
    const extraEarnings = parseFloat(
      routeImpact.extra_earnings || pricing.extra_earnings || 0,
    );
    const bonusAmount = parseFloat(
      routeImpact.bonus_amount || pricing.bonus_amount || 0,
    );
    const tipAmount = parseFloat(pricing.tip_amount || 0);

    // Primary earning (base for 1st, extra for 2nd+)
    const primaryEarning = isFirst ? baseAmount : extraEarnings;

    // Total driver earnings for this delivery
    const totalEarnings = isFirst
      ? baseAmount + tipAmount
      : extraEarnings + bonusAmount + tipAmount;

    return {
      isFirst,
      baseAmount,
      extraEarnings,
      bonusAmount,
      tipAmount,
      primaryEarning,
      totalEarnings,
    };
  };

  // Get total delivery earnings (for display)
  const getDeliveryEarnings = (delivery) => {
    const { totalEarnings } = getEarningsBreakdown(delivery);
    return totalEarnings.toFixed(2);
  };

  // Get estimated time from delivery
  const getEstimatedTime = (delivery) => {
    const routeImpact = delivery.route_impact || {};
    return (
      routeImpact.estimated_time_minutes || delivery.estimated_time_minutes || 0
    );
  };

  const getPickupAddress = (delivery) => {
    return (
      delivery?.restaurant?.address ||
      delivery?.orders?.restaurant_address ||
      delivery?.restaurant_address ||
      "Pickup address unavailable"
    );
  };

  const getDropoffAddress = (delivery) => {
    return (
      delivery?.delivery?.address ||
      delivery?.customer?.address ||
      delivery?.orders?.delivery_address ||
      delivery?.delivery_address ||
      "Drop-off address unavailable"
    );
  };

  const getDistanceAndTimeSummary = (delivery) => {
    const routeImpact = delivery.route_impact || {};
    const deliverySequence = Number(routeImpact.delivery_sequence || 0);
    const hasRouteExtraSignals =
      Number(routeImpact.extra_distance_km || 0) > 0 ||
      Number(routeImpact.extra_time_minutes || 0) > 0 ||
      Number(routeImpact.extra_earnings || 0) > 0 ||
      Number(routeImpact.bonus_amount || 0) > 0;
    const hasActiveDeliveries = Number(activeDeliveries?.length || 0) > 0;
    const isStackedDelivery =
      routeImpact.is_first_delivery === false ||
      deliverySequence > 1 ||
      hasRouteExtraSignals ||
      hasActiveDeliveries;
    const isFirstDelivery = !isStackedDelivery;
    const totalDistance = Number(
      delivery.total_delivery_distance_km ||
        routeImpact.total_distance_km ||
        routeImpact.r1_distance_km ||
        delivery.distance_km ||
        0,
    );
    const routeDistanceFallback = Number(calculateDistance(delivery) || 0);
    const extraDistance = Number(routeImpact.extra_distance_km || 0);
    const totalMinutes = Number(
      routeImpact.estimated_time_minutes ||
        routeImpact.estimated_time ||
        delivery.estimated_time_minutes ||
        delivery.estimated_time ||
        0,
    );
    const extraMinutes = Number(routeImpact.extra_time_minutes || 0);

    const primaryDistance = isFirstDelivery
      ? totalDistance > 0
        ? totalDistance
        : routeDistanceFallback > 0
          ? routeDistanceFallback
          : extraDistance
      : extraDistance;

    const primaryMinutes = isFirstDelivery
      ? totalMinutes > 0
        ? totalMinutes
        : primaryDistance > 0
          ? Math.round(primaryDistance * 2)
          : 0
      : extraMinutes;

    return {
      isFirstDelivery,
      totalDistance: Number.isFinite(totalDistance) ? totalDistance : 0,
      extraDistance: Number.isFinite(extraDistance) ? extraDistance : 0,
      totalMinutes: Number.isFinite(totalMinutes) ? totalMinutes : 0,
      extraMinutes: Number.isFinite(extraMinutes) ? extraMinutes : 0,
      primaryDistance: Number.isFinite(primaryDistance) ? primaryDistance : 0,
      primaryMinutes: Number.isFinite(primaryMinutes) ? primaryMinutes : 0,
    };
  };

  const getPickupRestaurantWithCity = (delivery) => {
    const restaurantName =
      delivery?.restaurant?.name ||
      delivery?.orders?.restaurant_name ||
      delivery?.restaurant_name ||
      "Restaurant";
    const city =
      delivery?.restaurant?.city ||
      delivery?.orders?.restaurant_city ||
      delivery?.delivery?.city ||
      delivery?.customer?.city ||
      delivery?.orders?.delivery_city ||
      null;

    return city ? `${restaurantName} (${city})` : restaurantName;
  };

  const nearbyDeliveries = useMemo(() => {
    const seen = new Set();
    const unique = [];

    for (const delivery of availableDeliveries || []) {
      const id = delivery?.delivery_id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(delivery);
    }

    return unique;
  }, [availableDeliveries]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <DriverLayout>
      <div className="bg-slate-50 font-['Work_Sans',sans-serif]">
        <MaterialSymbolsCSS />
        <AnimatedAlert alert={alertState} visible={alertVisible} />

        {/* Manual Override Modal */}
        {showOverrideModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <div className="flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-amber-600">
                  schedule
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 text-center mb-2">
                Outside Working Hours
              </h3>
              <p className="text-slate-600 text-center text-sm mb-4">
                Your working time is set to{" "}
                <strong>
                  {WORKING_TIME_LABELS[driverProfile?.working_time] ||
                    "Unknown"}
                </strong>
                . You are currently outside your scheduled working hours.
              </p>
              <p className="text-slate-500 text-center text-sm mb-6">
                Do you want to go online anyway?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowOverrideModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-medium active:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualOverrideConfirm}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#22c55e] text-white font-medium active:bg-[#16a34a]"
                >
                  Go Online
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Message Toast */}
        {statusMessage && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] animate-fade-in">
            <div className="bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400">
                info
              </span>
              <span className="text-sm">{statusMessage}</span>
            </div>
          </div>
        )}

        {/* Main Container */}
        <div className="relative flex h-auto min-h-screen w-full flex-col max-w-md mx-auto overflow-x-hidden border-x border-slate-200 bg-[#fdfdfd]">
          {/* Top App Bar */}
          <div className="flex items-center bg-white/90 p-4 pb-2 justify-between sticky top-0 z-50 border-b border-slate-100 backdrop-blur-md">
            <button
              onClick={() => navigate("/driver/profile")}
              className="flex items-center flex-1 active:opacity-60 transition-opacity"
            >
              <div className="flex size-10 shrink-0 items-center overflow-hidden">
                <div
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-9 ring-2 ring-primary/10 bg-slate-200"
                  style={{
                    backgroundImage: driverProfile?.profile_picture
                      ? `url("${driverProfile.profile_picture}")`
                      : "none",
                  }}
                >
                  {!driverProfile?.profile_picture && (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">
                      <span className="material-symbols-outlined text-xl">
                        person
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 ml-3 text-left">
                <h2 className="text-slate-900 text-[17px] font-bold leading-tight tracking-tight">
                  {driverProfile?.full_name || "Driver"}
                </h2>
                <p className="text-slate-500 text-xs">
                  {WORKING_TIME_LABELS[driverProfile?.working_time] || ""}
                </p>
              </div>
            </button>
            <div className="flex w-10 items-center justify-end">
              <button
                onClick={() => navigate("/driver/notifications")}
                className="relative flex cursor-pointer items-center justify-center rounded-full h-10 w-10 bg-slate-50 text-slate-600 active:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[24px]">
                  notifications
                </span>
                <span className="absolute top-2.5 right-2.5 flex h-2 w-2 rounded-full bg-[#22c55e] ring-2 ring-white"></span>
              </button>
            </div>
          </div>

          {/* Online/Offline Toggle with Working Hours Info */}
          <div className="p-4">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <p className="text-slate-900 text-base font-bold leading-tight">
                    Status: {isOnline ? "Online" : "Offline"}
                  </p>
                  <p className="text-slate-500 text-sm font-normal leading-normal">
                    {isOnline
                      ? "Receiving requests nearby"
                      : "Not receiving requests"}
                  </p>
                </div>
                <label className="relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full border-none bg-slate-200 p-0.5 transition-colors duration-200 has-[:checked]:bg-[#22c55e]">
                  <input
                    checked={isOnline}
                    onChange={() => handleToggleOnline(false)}
                    className="sr-only peer"
                    type="checkbox"
                  />
                  <div className="h-[27px] w-[27px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"></div>
                </label>
              </div>

              {/* Working Hours Status */}
              {driverProfile?.working_time &&
                driverProfile.working_time !== "full_time" && (
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      withinWorkingHours
                        ? "bg-green-50 border border-green-200"
                        : manualOverrideActive
                          ? "bg-amber-50 border border-amber-200"
                          : "bg-slate-50 border border-slate-200"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-lg ${
                        withinWorkingHours
                          ? "text-green-600"
                          : manualOverrideActive
                            ? "text-amber-600"
                            : "text-slate-500"
                      }`}
                    >
                      {withinWorkingHours
                        ? "check_circle"
                        : manualOverrideActive
                          ? "schedule"
                          : "schedule"}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        withinWorkingHours
                          ? "text-green-700"
                          : manualOverrideActive
                            ? "text-amber-700"
                            : "text-slate-600"
                      }`}
                    >
                      {withinWorkingHours
                        ? "Within working hours"
                        : manualOverrideActive
                          ? "Manual override active (outside working hours)"
                          : "Outside working hours"}
                    </span>
                  </div>
                )}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="px-4">
            <div className="flex gap-3 py-2">
              {/* Earnings Card */}
              <div className="flex flex-1 flex-col gap-2 rounded-xl p-5 bg-white border border-slate-100 shadow-sm">
                <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  Today's Earnings
                </p>
                <p className="text-[#22c55e] tracking-tight text-2xl font-bold leading-tight">
                  Rs. {stats.todayEarnings.toFixed(0)}
                </p>
              </div>

              {/* Deliveries Card */}
              <div className="flex flex-1 flex-col gap-2 rounded-xl p-5 bg-white border border-slate-100 shadow-sm">
                <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                  Today's Deliveries
                </p>
                <p className="text-slate-900 tracking-tight text-2xl font-bold leading-tight">
                  {stats.todayDeliveries}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-xl p-5 bg-white border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                Balance to Receive
              </p>
              <p className="text-[#f97316] tracking-tight text-2xl font-bold leading-tight mt-2">
                Rs. {balanceToReceive.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Active Deliveries Section - Shows for both online and offline drivers */}
          {activeDeliveries.length > 0 && (
            <>
              <div className="flex items-center justify-between px-4 pt-6 pb-2">
                <h2 className="text-slate-900 text-[18px] font-bold leading-tight">
                  Active Deliveries ({activeDeliveries.length})
                </h2>
                <button
                  onClick={openActiveMap}
                  className="text-[#22c55e] text-sm font-bold active:opacity-60 transition-opacity"
                >
                  View All
                </button>
              </div>
              <div className="flex flex-col gap-3 px-4">
                {activeDeliveries.slice(0, 3).map((delivery) => (
                  <div
                    key={delivery.id}
                    onClick={openActiveMap}
                    className="flex items-center gap-4 rounded-xl bg-amber-50 border border-amber-200 p-4 cursor-pointer active:bg-amber-100 transition-colors"
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100">
                      <span className="material-symbols-outlined text-amber-600">
                        {delivery.status === "accepted"
                          ? "restaurant"
                          : delivery.status === "picked_up"
                            ? "directions_bike"
                            : delivery.status === "on_the_way"
                              ? "local_shipping"
                              : "location_on"}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-900 font-semibold text-sm">
                        {["picked_up", "on_the_way", "at_customer"].includes(
                          delivery.status,
                        )
                          ? delivery.order?.delivery?.address ||
                            delivery.orders?.delivery_address ||
                            "Customer Address"
                          : delivery.order?.restaurant?.name ||
                            delivery.orders?.restaurant_name ||
                            "Restaurant"}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        Order #
                        {delivery.order?.order_number ||
                          delivery.orders?.order_number ||
                          "N/A"}
                      </p>
                      <p className="text-amber-600 text-xs font-medium mt-1 capitalize">
                        {delivery.status?.replace(/_/g, " ")}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-slate-400">
                      chevron_right
                    </span>
                  </div>
                ))}
              </div>
              {!isOnline && activeDeliveries.length > 0 && (
                <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-600 text-lg">
                      info
                    </span>
                    <p className="text-amber-700 text-xs">
                      You're offline but have active deliveries. Complete these
                      deliveries to receive your earnings.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Nearby Requests Header */}
          <div className="flex items-center justify-between px-4 pt-6 pb-2">
            <h2 className="text-slate-900 text-[18px] font-bold leading-tight">
              Nearby Requests ({nearbyDeliveries.length})
            </h2>
            <button
              onClick={() => navigate("/driver/deliveries")}
              className="text-[#22c55e] text-sm font-bold active:opacity-60 transition-opacity"
            >
              View All
            </button>
          </div>

          {/* Nearby Requests List */}
          <div className="flex flex-col gap-4 pb-28">
            {loading ? (
              <div className="px-4 space-y-3">
                {[...Array(3)].map((_, idx) => (
                  <div
                    key={`nearby-skeleton-${idx}`}
                    className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 animate-pulse"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-4 w-24 bg-slate-200 rounded" />
                      <div className="h-4 w-16 bg-slate-200 rounded" />
                    </div>
                    <div className="h-7 w-28 bg-slate-200 rounded mb-3" />
                    <div className="space-y-2 mb-3">
                      <div className="h-3 w-full bg-slate-100 rounded" />
                      <div className="h-3 w-3/4 bg-slate-100 rounded" />
                    </div>
                    <div className="h-10 w-full bg-slate-200 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : !isOnline && activeDeliveries.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">
                  wifi_off
                </span>
                <p className="text-slate-500 font-medium">
                  You're currently offline
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  Go online to receive delivery requests
                </p>
              </div>
            ) : nearbyDeliveries.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">
                  inventory_2
                </span>
                <p className="text-slate-500 font-medium">No nearby requests</p>
                <p className="text-slate-400 text-sm mt-1">
                  New requests will appear here automatically
                </p>
                <button
                  onClick={() => navigate("/driver/deliveries")}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#22c55e] text-white text-sm font-semibold active:opacity-80"
                >
                  View Available Deliveries
                </button>
              </div>
            ) : (
              nearbyDeliveries.slice(0, 5).map((delivery, index) => {
                const breakdown = getEarningsBreakdown(delivery);
                const tripSummary = getDistanceAndTimeSummary(delivery);
                const earningChips = breakdown.isFirst
                  ? [
                      `Delivery Rs. ${breakdown.baseAmount.toFixed(0)}`,
                      breakdown.tipAmount > 0
                        ? `Tip Rs. ${breakdown.tipAmount.toFixed(0)}`
                        : null,
                    ].filter(Boolean)
                  : [
                      `Delivery Rs. ${breakdown.extraEarnings.toFixed(0)}`,
                      `Bonus Rs. ${breakdown.bonusAmount.toFixed(0)}`,
                      breakdown.tipAmount > 0
                        ? `Tip Rs. ${breakdown.tipAmount.toFixed(0)}`
                        : null,
                    ].filter(Boolean);

                return (
                  <div key={delivery.delivery_id} className="px-4">
                    <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col gap-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            {index === 0 && (
                              <span className="bg-[#22c55e]/10 text-[#22c55e] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                New Order
                              </span>
                            )}
                            {delivery.orders?.length > 1 && (
                              <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Bulk Order
                              </span>
                            )}
                          </div>
                          <p className="text-[#22c55e] text-2xl font-bold leading-tight">
                            Rs. {getDeliveryEarnings(delivery)}
                          </p>
                          {earningChips.length > 0 && (
                            <p className="text-slate-900 text-xs font-semibold">
                              {earningChips.join(" • ")}
                            </p>
                          )}

                          <div className="mt-1 flex items-center gap-4 text-slate-700 text-xs font-semibold">
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-base text-slate-500">
                                route
                              </span>
                              <span>
                                {tripSummary.primaryDistance > 0
                                  ? `${
                                      breakdown.isFirst ? "" : "+"
                                    }${tripSummary.primaryDistance.toFixed(1)} km`
                                  : "0"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-base text-slate-500">
                                schedule
                              </span>
                              <span>
                                {tripSummary.primaryMinutes > 0
                                  ? `${
                                      breakdown.isFirst ? "" : "+"
                                    }${Math.round(tripSummary.primaryMinutes)} min`
                                  : "0"}
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 space-y-1 text-xs">
                            <p className="text-slate-500">
                              <span className="font-semibold text-slate-700">
                                Pickup:
                              </span>{" "}
                              {getPickupRestaurantWithCity(delivery)}
                            </p>
                            <p className="text-slate-500">
                              <span className="font-semibold text-slate-700">
                                Drop-off:
                              </span>{" "}
                              {getDropoffAddress(delivery)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          handleAcceptDelivery(delivery.delivery_id)
                        }
                        disabled={acceptingOrder === delivery.delivery_id}
                        className="flex w-full cursor-pointer items-center justify-center rounded-xl h-12 bg-[#22c55e] text-white gap-2 text-base font-bold shadow-md shadow-[#22c55e]/20 active:bg-[#16a34a] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {acceptingOrder === delivery.delivery_id ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Accepting...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[22px]">
                              check_circle
                            </span>
                            <span>Accept Request</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Monthly Performance Section */}
          <div className="px-4 pt-6 pb-2">
            <h2 className="text-slate-900 text-[18px] font-bold leading-tight mb-3">
              Monthly Performance
            </h2>
            <div className="flex gap-3">
              {/* Monthly Earnings */}
              <div className="flex flex-1 flex-col gap-2 rounded-xl p-5 bg-gradient-to-br from-green-50 to-green-100 border border-green-200 shadow-sm">
                <p className="text-green-700 text-[11px] font-bold uppercase tracking-wider">
                  Month Earnings
                </p>
                <p className="text-green-700 tracking-tight text-2xl font-bold leading-tight">
                  Rs. {monthlyStats.earnings.toFixed(0)}
                </p>
              </div>

              {/* Monthly Deliveries */}
              <div className="flex flex-1 flex-col gap-2 rounded-xl p-5 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 shadow-sm">
                <p className="text-blue-700 text-[11px] font-bold uppercase tracking-wider">
                  Month Deliveries
                </p>
                <p className="text-blue-700 tracking-tight text-2xl font-bold leading-tight">
                  {monthlyStats.deliveries}
                </p>
              </div>
            </div>
          </div>

          {/* Recent Deliveries Section */}
          {recentDeliveries.length > 0 && (
            <>
              <div className="flex items-center justify-between px-4 pt-6 pb-2">
                <h2 className="text-slate-900 text-[18px] font-bold leading-tight">
                  Recent Deliveries
                </h2>
              </div>
              <div className="flex flex-col gap-3 px-4 pb-28">
                {recentDeliveries.map((delivery) => (
                  <div
                    key={delivery.id}
                    className="flex items-center gap-4 rounded-xl bg-white border border-slate-100 p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
                      <span className="material-symbols-outlined text-green-600">
                        check_circle
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-900 font-semibold text-sm">
                        {delivery.restaurant_name || "Restaurant"}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        Order #{delivery.order_number || "N/A"}
                      </p>
                      <p className="text-green-600 text-xs font-medium mt-1">
                        Rs.{" "}
                        {parseFloat(delivery.driver_earnings || 0).toFixed(0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-400 text-xs">
                        {delivery.delivered_at
                          ? new Date(delivery.delivered_at).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" },
                            )
                          : ""}
                      </p>
                      <p className="text-slate-400 text-xs">
                        {delivery.delivered_at
                          ? new Date(delivery.delivered_at).toLocaleTimeString(
                              "en-US",
                              { hour: "2-digit", minute: "2-digit" },
                            )
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Bottom Navigation removed - provided by DriverLayout */}
        </div>

        {/* Custom styles */}
        <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      </div>
    </DriverLayout>
  );
}
