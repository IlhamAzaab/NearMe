/**
 * Driver Delivery Routes
 * Production-grade delivery management for drivers
 *
 * Uses supabaseAdmin since we handle auth via custom JWT middleware
 *
 * Endpoints:
 * - GET /driver/deliveries/available - Get available deliveries
 * - POST /driver/deliveries/:id/accept - Accept a delivery (atomic)
 * - PATCH /driver/deliveries/:id/location - Update driver location
 * - PATCH /driver/deliveries/:id/status - Update delivery status
 * - GET /driver/deliveries/active - Get driver's active delivery
 * - GET /driver/deliveries/history - Get completed deliveries
 * - GET /driver/notifications - Get driver notifications
 */

import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  getDriverRouteContext,
  insertDeliveryStopsIntoRoute,
  getFormattedActiveDeliveries,
  removeDeliveryStops,
} from "../utils/driverRouteContext.js";
import {
  getAvailableDeliveriesForDriver,
  DRIVER_EARNINGS,
  loadConfigConstants,
  calculateRTCEarnings,
} from "../utils/availableDeliveriesLogic.js";
import {
  broadcastDeliveryTaken,
  notifyAdmin,
  notifyCustomer,
} from "../utils/socketManager.js";
import {
  calculateCustomerETA,
  calculateAllCustomerETAs,
} from "../utils/etaCalculator.js";
import {
  sendDriverAssignedNotification,
  sendDeliveryStatusNotification,
  sendDeliveryStatusToAdmin,
} from "../utils/pushNotificationService.js";
import {
  getSriLankaDayRange,
  getSriLankaDayRangeFromDateStr,
  getSriLankaDateKey,
  shiftSriLankaDateString,
} from "../utils/sriLankaTime.js";

const router = express.Router();

// Configure Cloudinary (for delivery proof uploads)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function getDriverProfileForRequest(req) {
  const driverId = String(req.user?.id || "").trim();

  if (!driverId) {
    return {
      driverData: null,
      errorResponse: {
        status: 401,
        body: {
          message: "Invalid driver token",
          error_code: "DRIVER_ID_MISSING",
        },
      },
    };
  }

  const { data: driverData, error: driverError } = await supabaseAdmin
    .from("drivers")
    .select(
      `
      id,
      full_name,
      email,
      phone,
      driver_status,
      driver_type,
      working_time,
      profile_completed,
      onboarding_completed,
      current_latitude,
      current_longitude,
      manual_status_override
    `,
    )
    .eq("id", driverId)
    .maybeSingle();

  if (driverError) {
    console.error("[DriverProfile] Failed to fetch driver profile:", {
      driverId,
      message: driverError.message,
      code: driverError.code,
      details: driverError.details,
    });

    return {
      driverData: null,
      errorResponse: {
        status: 500,
        body: {
          message: "Could not verify driver profile",
          error_code: "DRIVER_PROFILE_LOOKUP_FAILED",
          error: driverError.message,
        },
      },
    };
  }

  if (!driverData) {
    console.error(
      "[DriverProfile] Driver profile missing for authenticated user:",
      {
        driverId,
        role: req.user?.role,
        type: req.user?.type,
      },
    );

    return {
      driverData: null,
      errorResponse: {
        status: 404,
        body: {
          message:
            "Driver profile not found. Please logout and login again, or contact manager to recreate driver profile.",
          error_code: "DRIVER_PROFILE_MISSING",
          driver_id: driverId,
        },
      },
    };
  }

  return { driverData, errorResponse: null };
}

async function getDriverDisplayInfo(driverId) {
  if (!driverId) return null;

  const [
    { data: driver, error: driverError },
    { data: vehicle, error: vehicleError },
  ] = await Promise.all([
    supabaseAdmin
      .from("drivers")
      .select(
        `
            id,
            full_name,
            phone,
            profile_photo_url,
            driver_type,
            current_latitude,
            current_longitude
          `,
      )
      .eq("id", driverId)
      .maybeSingle(),

    supabaseAdmin
      .from("driver_vehicle_license")
      .select(
        `
            driver_id,
            vehicle_number,
            vehicle_type,
            vehicle_model
          `,
      )
      .eq("driver_id", driverId)
      .maybeSingle(),
  ]);

  if (driverError) {
    console.error("[DriverInfo] Failed to fetch driver:", driverError.message);
  }

  if (vehicleError) {
    console.warn(
      "[DriverInfo] Failed to fetch vehicle info:",
      vehicleError.message,
    );
  }

  if (!driver && !vehicle) {
    return {
      driver_id: driverId,
      id: driverId,
      full_name: "Assigned Driver",
      driver_name: "Assigned Driver",
      phone: "",
      driver_phone: "",
      photo_url: "",
      profile_photo_url: "",
      driver_photo: "",
      vehicle_number: "",
      vehicle_type: "",
      vehicle_model: "",
    };
  }

  const fullName = driver?.full_name || "Assigned Driver";
  const phone = driver?.phone || "";
  const photoUrl = driver?.profile_photo_url || "";
  const vehicleType = vehicle?.vehicle_type || driver?.driver_type || "";
  const vehicleModel = vehicle?.vehicle_model || "";
  const vehicleNumber = vehicle?.vehicle_number || "";

  return {
    id: driverId,
    driver_id: driverId,
    full_name: fullName,
    phone,
    photo_url: photoUrl,
    profile_photo_url: photoUrl,
    vehicle_type: vehicleType,
    vehicle_model: vehicleModel,
    vehicle_number: vehicleNumber,
    driver_name: fullName,
    driver_phone: phone,
    driver_photo: photoUrl,
    driver_vehicle_type: vehicleType,
    driver_vehicle_model: vehicleModel,
    driver_vehicle_number: vehicleNumber,
  };
}

// ============================================================================
// Helper: Calculate distance using Haversine formula
// IMPORTANT: This is ONLY for geometric proximity detection (50m/100m thresholds)
// NOT for route distance calculations - those must use OSRM-only
// ============================================================================
function calculateHaversineDistanceForProximity(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

const buildDeliveriesFromStops = (stops = []) => {
  const deliveries = new Map();

  for (const stop of stops || []) {
    if (!stop?.delivery_id) continue;
    if (!deliveries.has(stop.delivery_id)) {
      deliveries.set(stop.delivery_id, { delivery_id: stop.delivery_id });
    }

    const entry = deliveries.get(stop.delivery_id);
    if (stop.stop_type === "restaurant") {
      entry.restaurant = {
        lat: stop.latitude,
        lng: stop.longitude,
      };
    }
    if (stop.stop_type === "customer") {
      entry.customer = {
        lat: stop.latitude,
        lng: stop.longitude,
      };
    }
  }

  return Array.from(deliveries.values()).filter(
    (delivery) => delivery.restaurant && delivery.customer,
  );
};

const sumRtcDistanceKm = async (deliveries = [], label = "RTC") => {
  let totalKm = 0;

  for (const delivery of deliveries) {
    const route = await getRouteDistance(
      delivery.restaurant.lng,
      delivery.restaurant.lat,
      delivery.customer.lng,
      delivery.customer.lat,
      "false",
    );

    const km = Number.isFinite(route.distance) ? route.distance / 1000 : 0;

    totalKm += km;
  }

  if (label) {
    console.log(`[RTC] ${label}: ${totalKm.toFixed(3)} km`);
  }

  return totalKm;
};

// ============================================================================
// Helper: Simple in-memory cache for OSRM responses (avoid duplicate calls)
// ============================================================================
const osrmCache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds

function getCacheKey(startLng, startLat, endLng, endLat) {
  return `${startLng},${startLat};${endLng},${endLat}`;
}

function getFromCache(key) {
  const cached = osrmCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[OSRM CACHE] ✓ Hit: ${key}`);
    return cached.data;
  }
  osrmCache.delete(key);
  return null;
}

function setCache(key, data) {
  osrmCache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// OSRM Circuit Breaker: Skip OSRM entirely when it's consistently failing
// ============================================================================
let osrmCircuitOpen = false;
let osrmLastFailTime = 0;
const OSRM_CIRCUIT_COOLDOWN = 60000; // 60s before retrying OSRM after circuit opens
let osrmConsecutiveFailures = 0;
const OSRM_FAILURE_THRESHOLD = 3; // Open circuit after 3 consecutive failures

function isOsrmAvailable() {
  if (!osrmCircuitOpen) return true;
  // Check if cooldown has elapsed
  if (Date.now() - osrmLastFailTime > OSRM_CIRCUIT_COOLDOWN) {
    console.log("[OSRM] Circuit breaker: cooldown elapsed, retrying OSRM");
    osrmCircuitOpen = false;
    osrmConsecutiveFailures = 0;
    return true;
  }
  return false;
}

function recordOsrmFailure() {
  osrmConsecutiveFailures++;
  if (osrmConsecutiveFailures >= OSRM_FAILURE_THRESHOLD) {
    osrmCircuitOpen = true;
    osrmLastFailTime = Date.now();
    console.log(
      `[OSRM] Circuit breaker OPEN: ${osrmConsecutiveFailures} consecutive failures. Will retry in ${OSRM_CIRCUIT_COOLDOWN / 1000}s`,
    );
  }
}

function recordOsrmSuccess() {
  osrmConsecutiveFailures = 0;
  osrmCircuitOpen = false;
}

// ============================================================================
// Helper: Fetch with timeout and retry (reduced: 5s timeout, 1 retry)
// ============================================================================
async function fetchWithTimeout(
  url,
  options = {},
  timeout = 5000,
  retries = 1,
) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error;

      if (i === retries) {
        throw lastError;
      }

      const delay = 1000; // Single 1s retry
      console.log(
        `[OSRM] Retry ${i + 1}/${retries} after ${delay}ms - Error: ${error.message}`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ============================================================================
// Helper: Get route from OSRM (Public Server) - OSRM-ONLY (no Haversine fallback)
// Uses retry strategy: multiple profiles, backup server, exponential backoff
// ============================================================================
const OSRM_PRIMARY = "https://router.project-osrm.org";
const OSRM_BACKUP = "https://routing.openstreetmap.de/routed-foot";
const OSRM_PROFILES = ["foot"]; // Foot profile: shortest path distance for earnings calculations
// NOTE: ETA calculations (travel time) use "driving" profile in etaCalculator.js

async function getRouteDistance(
  startLng,
  startLat,
  endLng,
  endLat,
  overview = "false",
) {
  const cacheKey = getCacheKey(startLng, startLat, endLng, endLat);

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  // Circuit breaker: instead of blocking, reset and retry fresh.
  // If OSRM is consistently failing we still try every call rather than
  // returning null distance values that break earnings calculations.
  if (!isOsrmAvailable()) {
    console.log(
      "[OSRM] Circuit breaker was open — resetting and retrying fresh",
    );
    osrmCircuitOpen = false;
    osrmConsecutiveFailures = 0;
    osrmLastFailTime = 0;
    // Continue into the retry loop below
  }

  // OSRM-only retry strategy: try multiple servers and profiles
  const servers = [OSRM_PRIMARY, OSRM_BACKUP];
  const RETRY_BACKOFFS = [0, 1000, 2000]; // Retry delays in ms

  for (const serverUrl of servers) {
    for (let retry = 0; retry < RETRY_BACKOFFS.length; retry++) {
      if (retry > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BACKOFFS[retry]),
        );
      }

      for (const profile of OSRM_PROFILES) {
        try {
          const url = `${serverUrl}/route/v1/${profile}/${startLng},${startLat};${endLng},${endLat}?overview=${overview}${
            overview === "full" ? "&geometries=geojson" : ""
          }`;

          const response = await fetchWithTimeout(
            url,
            {},
            5000 + retry * 1000,
            0,
          );

          if (!response.ok) {
            continue; // Try next profile
          }

          const data = await response.json();

          if (data.code === "Ok" && data.routes?.[0]) {
            // Success! Cache and return
            setCache(cacheKey, data.routes[0]);
            recordOsrmSuccess();
            console.log(
              `[OSRM] ✓ Route found via ${profile}@${serverUrl.includes("openstreetmap") ? "backup" : "primary"}`,
            );
            return data.routes[0];
          }
        } catch (error) {
          console.log(
            `[OSRM] ${profile}@${serverUrl.includes("openstreetmap") ? "backup" : "primary"} attempt ${retry + 1} failed: ${error.message}`,
          );
        }
      }
    }
  }

  // All retries exhausted - record failure and return unavailable state
  recordOsrmFailure();
  console.log(
    "[OSRM] ❌ All servers/profiles/retries exhausted - returning unavailable state",
  );

  return {
    distance: null,
    duration: null,
    geometry: null,
    isUnavailable: true,
    unavailableReason: "All OSRM servers failed after retries",
  };
}

// ============================================================================
// Middleware: Driver Only
// ============================================================================

const driverOnly = (req, res, next) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Drivers only" });
  }
  next();
};

const SUSPENDED_DEPOSIT_MESSAGE =
  "Deposit the collected money to the Meezo platform before accepting new deliveries.";

const normalizeDriverStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const ACTIVE_DRIVER_STATUSES = new Set(["active", "approved", "online"]);
const BLOCKED_DRIVER_STATUSES = new Set([
  "suspended",
  "rejected",
  "pending",
  "inactive",
  "disabled",
]);

const resolveDriverStatus = (driverData) => {
  const normalized = normalizeDriverStatus(
    driverData?.driver_status || driverData?.status,
  );

  return {
    normalizedStatus: normalized || null,
    isActive: Boolean(normalized && ACTIVE_DRIVER_STATUSES.has(normalized)),
    isBlocked:
      Boolean(normalized) &&
      (BLOCKED_DRIVER_STATUSES.has(normalized) ||
        !ACTIVE_DRIVER_STATUSES.has(normalized)),
  };
};

async function notifyRestaurantAdminsOrderStatus(restaurantId, payload) {
  if (!restaurantId) return;

  try {
    const { data: admins, error } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("restaurant_id", restaurantId);

    if (error) {
      console.error(
        "[Socket] Failed to fetch restaurant admins:",
        error.message,
      );
      return;
    }

    (admins || []).forEach((admin) => {
      notifyAdmin(admin.id, "order:status_changed", {
        ...payload,
        timestamp: Date.now(),
      });
    });
  } catch (error) {
    console.error(
      "[Socket] Failed to notify restaurant admins about order status:",
      error?.message || error,
    );
  }
}

// ============================================================================
// GET /driver/deliveries/pending - Get all pending deliveries
// Shows deliveries with delivery_status = 'pending'
// Only returns deliveries if driver_status is 'active'
// Inactive drivers can still access dashboard, just get empty deliveries list
// ============================================================================
router.get(
  "/deliveries/pending",
  authenticate,
  driverOnly,
  async (req, res) => {
    try {
      // Check Supabase connection first
      if (!process.env.SUPABASE_URL) {
        console.error("❌ SUPABASE_URL not configured");
        return res.status(500).json({
          message: "Database configuration error",
          error: "SUPABASE_URL not set",
        });
      }

      // Check if driver is active before showing pending deliveries
      const { data: driverData, error: driverError } = await supabaseAdmin
        .from("drivers")
        .select("driver_status, status, working_time")
        .eq("id", req.user.id)
        .single();

      if (driverError) {
        console.error("Driver status check error:", driverError);
        // Don't block dashboard access, just return empty deliveries
        return res.json({
          deliveries: [],
          message: "Could not verify driver status",
        });
      }

      if (!driverData) {
        return res.json({
          deliveries: [],
          message: "Driver not found",
        });
      }

      // Only show deliveries if driver status is active/approved/online
      const statusInfo = resolveDriverStatus(driverData);
      if (statusInfo.isBlocked) {
        const suspended = statusInfo.normalizedStatus === "suspended";
        return res.json({
          deliveries: [],
          message: suspended
            ? SUSPENDED_DEPOSIT_MESSAGE
            : "You must be online (active) to see available deliveries",
          driver_status:
            statusInfo.normalizedStatus || driverData.driver_status,
          working_time: driverData.working_time || "full_time",
        });
      }

      const { data: deliveries, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
          id,
          order_id,
          status,
          tip_amount,
          created_at,
          orders!inner (
            id,
            order_number,
            restaurant_id,
            restaurant_name,
            restaurant_address,
            restaurant_phone,
            restaurant_latitude,
            restaurant_longitude,
            delivery_address,
            delivery_city,
            delivery_latitude,
            delivery_longitude,
            delivery_fee,
            service_fee,
            subtotal,
            total_amount,
            customer_id,
            customer_name,
            customer_phone,
            payment_method,
            placed_at,
            order_items (
              id,
              food_id,
              food_name,
              quantity,
              size
            )
          )
        `,
        )
        .eq("status", "pending")
        .is("driver_id", null)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Fetch pending deliveries error:", {
          message: error.message,
          details: error.details || error.toString(),
          hint: error.hint || "",
          code: error.code || "",
        });

        // Check if it's a network error
        if (
          error.message?.includes("fetch failed") ||
          error.message?.includes("ENOTFOUND")
        ) {
          return res.status(503).json({
            message:
              "Database connection error. Please check your internet connection.",
            error: "Network connectivity issue with database",
            retry: true,
          });
        }

        return res.status(500).json({
          message: "Failed to fetch deliveries",
          error: error.message,
        });
      }

      // Get driver location from query params or from database
      const { driver_latitude, driver_longitude } = req.query;

      let driverLat = driver_latitude ? parseFloat(driver_latitude) : null;
      let driverLng = driver_longitude ? parseFloat(driver_longitude) : null;

      // If not in query params, get from most recent active delivery
      if (!driverLat || !driverLng) {
        const { data: driverLocation } = await supabaseAdmin
          .from("deliveries")
          .select("current_latitude, current_longitude")
          .eq("driver_id", req.user.id)
          .not("status", "in", "(delivered,cancelled)")
          .order("last_location_update", { ascending: false })
          .limit(1)
          .maybeSingle();

        driverLat = driverLocation?.current_latitude || 8.5017; // Default to Kinniya
        driverLng = driverLocation?.current_longitude || 81.186;
      }

      // Calculate distances and earnings for each delivery
      const deliveriesWithDetails = await Promise.all(
        (deliveries || []).map(async (d) => {
          const restaurantLat = parseFloat(d.orders.restaurant_latitude);
          const restaurantLng = parseFloat(d.orders.restaurant_longitude);
          const customerLat = parseFloat(d.orders.delivery_latitude);
          const customerLng = parseFloat(d.orders.delivery_longitude);

          // Calculate both routes in PARALLEL for faster response
          const [driverToRestaurantRoute, restaurantToCustomerRoute] =
            await Promise.all([
              getRouteDistance(
                driverLng,
                driverLat,
                restaurantLng,
                restaurantLat,
                "full",
              ),
              getRouteDistance(
                restaurantLng,
                restaurantLat,
                customerLng,
                customerLat,
                "full",
              ),
            ]);

          const totalDistance =
            (driverToRestaurantRoute.distance || 0) +
            (restaurantToCustomerRoute.distance || 0);
          const totalDuration =
            (driverToRestaurantRoute.duration || 0) +
            (restaurantToCustomerRoute.duration || 0);

          // Calculate driver earnings (delivery fee + service fee)
          const earnings =
            parseFloat(d.orders.delivery_fee || 0) +
            parseFloat(d.orders.service_fee || 0);

          return {
            delivery_id: d.id,
            order_id: d.order_id,
            order_number: d.orders.order_number,
            order_status: d.status,
            delivery_status: d.status,
            restaurant: {
              id: d.orders.restaurant_id,
              name: d.orders.restaurant_name,
              address: d.orders.restaurant_address,
              phone: d.orders.restaurant_phone,
              latitude: restaurantLat,
              longitude: restaurantLng,
            },
            delivery: {
              address: d.orders.delivery_address,
              city: d.orders.delivery_city,
              latitude: customerLat,
              longitude: customerLng,
            },
            customer: {
              id: d.orders.customer_id,
              name: d.orders.customer_name,
              phone: d.orders.customer_phone,
            },
            order_items: d.orders.order_items || [],
            pricing: {
              subtotal: parseFloat(d.orders.subtotal || 0),
              delivery_fee: parseFloat(d.orders.delivery_fee || 0),
              service_fee: parseFloat(d.orders.service_fee || 0),
              total: parseFloat(d.orders.total_amount || 0),
              driver_earnings: earnings,
              tip_amount: parseFloat(d.tip_amount || 0),
            },
            distance_km: (totalDistance / 1000).toFixed(2),
            distance_meters: totalDistance,
            estimated_time_minutes: Math.ceil(totalDuration / 60),
            estimated_time_seconds: totalDuration,
            driver_to_restaurant_route: driverToRestaurantRoute.geometry,
            restaurant_to_customer_route: restaurantToCustomerRoute.geometry,
            placed_at: d.orders.placed_at,
            created_at: d.created_at,
          };
        }),
      );

      // Sort: tipped deliveries appear first so drivers are incentivized
      deliveriesWithDetails.sort((a, b) => {
        const tipA = a.pricing.tip_amount || 0;
        const tipB = b.pricing.tip_amount || 0;
        if (tipA > 0 && tipB <= 0) return -1;
        if (tipB > 0 && tipA <= 0) return 1;
        return 0;
      });

      return res.json({
        deliveries: deliveriesWithDetails,
        driver_location:
          driverLat && driverLng
            ? {
                latitude: driverLat,
                longitude: driverLng,
              }
            : null,
      });
    } catch (error) {
      console.error("Get pending deliveries error:", error);

      // Check if it's a network/connection error
      if (
        error.code === "ENOTFOUND" ||
        error.code === "ETIMEDOUT" ||
        error.message?.includes("fetch failed") ||
        error.message?.includes("network")
      ) {
        return res.status(503).json({
          message:
            "Database connection failed. Please check your internet connection and try again.",
          error: "Network connectivity issue",
          retry: true,
        });
      }

      return res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  },
);

// ============================================================================
// POST /driver/deliveries/:id/accept - Accept a delivery (ATOMIC)
// Changes delivery_status from 'pending' to 'accepted'
// Only allows active drivers to accept deliveries
// ============================================================================

router.post(
  "/deliveries/:id/accept",
  authenticate,
  driverOnly,
  async (req, res) => {
    const deliveryId = req.params.id;
    const { driver_latitude, driver_longitude, earnings_data } = req.body;
    let acceptedDriverLat = driver_latitude
      ? parseFloat(driver_latitude)
      : null;
    let acceptedDriverLng = driver_longitude
      ? parseFloat(driver_longitude)
      : null;

    console.log(`\n${"=".repeat(80)}`);
    console.log(`[ACCEPT DELIVERY] ✅ Accepting delivery: ${deliveryId}`);
    console.log(`[DRIVER] ${req.user.id}`);
    console.log(`[EARNINGS DATA] ${JSON.stringify(earnings_data)}`);
    console.log(`${"=".repeat(80)}`);

    try {
      // Step 0: Check if driver is active
      console.log(`[ACCEPT DELIVERY] → Step 0: Check if driver is active`);
      const { driverData, errorResponse } =
        await getDriverProfileForRequest(req);

      if (errorResponse) {
        return res.status(errorResponse.status).json(errorResponse.body);
      }

      const statusInfo = resolveDriverStatus(driverData);
      if (statusInfo.isBlocked) {
        const suspended = statusInfo.normalizedStatus === "suspended";
        console.log(
          `[ACCEPT DELIVERY]   ⚠️  Driver is not active (status: ${statusInfo.normalizedStatus || driverData.driver_status})`,
        );
        return res.status(403).json({
          message: suspended
            ? SUSPENDED_DEPOSIT_MESSAGE
            : "You must be online (active) to accept deliveries",
          driver_status:
            statusInfo.normalizedStatus || driverData.driver_status,
          hint: suspended
            ? "Settle the pending collected amount and ask manager to reactivate your account."
            : "Go online from the dashboard to accept deliveries",
        });
      }

      console.log(`[ACCEPT DELIVERY]   ✓ Driver is active`);

      // Step 1: Check if driver is in delivering mode
      console.log(
        `[ACCEPT DELIVERY] → Step 1: Check if driver is in delivering mode`,
      );
      const { data: deliveringCheck } = await supabaseAdmin
        .from("deliveries")
        .select("id, status")
        .eq("driver_id", req.user.id)
        .in("status", ["picked_up", "on_the_way", "at_customer"])
        .limit(1);

      const { data: acceptedPickupsCheck } = await supabaseAdmin
        .from("deliveries")
        .select("id, status")
        .eq("driver_id", req.user.id)
        .eq("status", "accepted")
        .limit(1);

      const hasDeliveringStatuses =
        Array.isArray(deliveringCheck) && deliveringCheck.length > 0;
      const hasPendingPickupStatuses =
        Array.isArray(acceptedPickupsCheck) && acceptedPickupsCheck.length > 0;

      // A driver is considered in delivery mode only when there are no
      // remaining accepted pickups. If at least one delivery is still accepted,
      // the driver is still in pickup mode and can accept another eligible order.
      if (hasDeliveringStatuses && !hasPendingPickupStatuses) {
        console.log(
          `[ACCEPT DELIVERY]   ⚠️  Driver is in delivering mode, cannot accept`,
        );
        return res.status(400).json({
          message:
            "Cannot accept new deliveries while in delivering mode. Complete current deliveries first.",
          in_delivering_mode: true,
        });
      }

      console.log(`[ACCEPT DELIVERY]   ✓ Driver can accept deliveries`);

      // Step 2: Atomically assign the delivery with earnings metadata (NOT actual earnings yet)
      console.log(
        `[ACCEPT DELIVERY] → Step 2: Update delivery status to 'accepted' (earnings stored on delivery)`,
      );

      // ─── SERVER-SIDE: Always determine delivery_sequence from DB ───────────
      const { data: activeDeliveries } = await supabaseAdmin
        .from("deliveries")
        .select("id, pending_earnings, delivery_sequence, driver_earnings")
        .eq("driver_id", req.user.id)
        .in("status", ["accepted", "picked_up", "on_the_way", "at_customer"]);

      const serverDeliverySequence = (activeDeliveries?.length || 0) + 1;
      const isFirstDelivery = serverDeliverySequence === 1;

      console.log(
        `[ACCEPT DELIVERY]   📊 Server-calculated delivery_sequence: ${serverDeliverySequence}`,
      );
      console.log(
        `[ACCEPT DELIVERY]   📊 Active deliveries: ${activeDeliveries?.length || 0}`,
      );

      // Fetch delivery with order details for earnings calculation
      const { data: deliveryRecord } = await supabaseAdmin
        .from("deliveries")
        .select(
          `tip_amount, orders (
            restaurant_latitude, restaurant_longitude,
            delivery_latitude, delivery_longitude,
            delivery_fee, service_fee, distance_km, order_number
          )`,
        )
        .eq("id", deliveryId)
        .single();
      const tipAmount = parseFloat(deliveryRecord?.tip_amount || 0);

      // ─── EARNINGS CALCULATION ──────────────────────────────────────────────
      // Load earnings config from DB (or defaults) once.
      const { earnings: earningsConfigLoaded } = await loadConfigConstants();
      const earningsConfig = earningsConfigLoaded || DRIVER_EARNINGS;

      // SECURITY: Never trust client-provided earnings_data for persisted payouts.
      if (earnings_data) {
        console.log(
          `[ACCEPT DELIVERY]   🔒 Ignoring client earnings_data; using server-authoritative calculation only`,
        );
      }

      const frontendEarningsData = null;
      let earningsData = null;

      // Always calculate server-side first so persisted earnings are authoritative.
      try {
        // Determine driver location (from request body or DB fallback)
        let driverLat = Number.isFinite(acceptedDriverLat)
          ? acceptedDriverLat
          : null;
        let driverLng = Number.isFinite(acceptedDriverLng)
          ? acceptedDriverLng
          : null;

        if (!driverLat || !driverLng) {
          const { data: lastLoc } = await supabaseAdmin
            .from("deliveries")
            .select("current_latitude, current_longitude")
            .eq("driver_id", req.user.id)
            .not("status", "in", "(delivered,cancelled,failed)")
            .order("last_location_update", { ascending: false })
            .limit(1)
            .maybeSingle();
          driverLat = lastLoc?.current_latitude || null;
          driverLng = lastLoc?.current_longitude || null;
        }

        if (!driverLat || !driverLng) {
          // Final fallback: get from drivers table or use default
          const { data: driverProfile } = await supabaseAdmin
            .from("drivers")
            .select("current_latitude, current_longitude")
            .eq("id", req.user.id)
            .single();
          driverLat = driverProfile?.current_latitude || 8.5017;
          driverLng = driverProfile?.current_longitude || 81.186;
        }

        acceptedDriverLat = Number.isFinite(Number(driverLat))
          ? Number(driverLat)
          : acceptedDriverLat;
        acceptedDriverLng = Number.isFinite(Number(driverLng))
          ? Number(driverLng)
          : acceptedDriverLng;

        const restaurantLat = parseFloat(
          deliveryRecord?.orders?.restaurant_latitude,
        );
        const restaurantLng = parseFloat(
          deliveryRecord?.orders?.restaurant_longitude,
        );
        const customerLat = parseFloat(
          deliveryRecord?.orders?.delivery_latitude,
        );
        const customerLng = parseFloat(
          deliveryRecord?.orders?.delivery_longitude,
        );

        if (isFirstDelivery) {
          // ═══ FIRST DELIVERY: RTC-only earnings ═══
          console.log(
            `[ACCEPT DELIVERY]   🚗 Calculating FIRST delivery earnings server-side`,
          );

          const rtcRoute = await getRouteDistance(
            restaurantLng,
            restaurantLat,
            customerLng,
            customerLat,
            "false",
          );
          const rtcDistanceKm = Number.isFinite(rtcRoute.distance)
            ? rtcRoute.distance / 1000
            : 0;
          const baseAmount = calculateRTCEarnings(
            rtcDistanceKm,
            earningsConfig,
          );
          const totalDistKm = rtcDistanceKm;

          earningsData = {
            delivery_sequence: serverDeliverySequence,
            base_amount: baseAmount,
            extra_earnings: 0,
            bonus_amount: 0,
            r0_distance_km: null,
            r1_distance_km: totalDistKm,
            extra_distance_km: 0,
            total_distance_km: totalDistKm,
          };

          console.log(
            `[ACCEPT DELIVERY]   ✅ 1st delivery earnings: base=Rs.${baseAmount.toFixed(2)}, total_dist=${totalDistKm.toFixed(3)}km`,
          );
        } else {
          // ═══ 2nd+ DELIVERY: extra_earnings + bonus ═══
          console.log(
            `[ACCEPT DELIVERY]   🚗 Calculating SUBSEQUENT delivery (#${serverDeliverySequence}) earnings server-side`,
          );

          // Get route context for current deliveries
          const routeContext = await getDriverRouteContext(
            req.user.id,
            driverLat,
            driverLng,
          );

          const currentDeliveries = buildDeliveriesFromStops(
            routeContext.stops,
          );

          const r0DistanceKm = await sumRtcDistanceKm(
            currentDeliveries,
            "R0 - Accept Server Calc",
          );

          const r1DistanceKm = await sumRtcDistanceKm(
            [
              ...currentDeliveries,
              {
                delivery_id: deliveryId,
                restaurant: { lat: restaurantLat, lng: restaurantLng },
                customer: { lat: customerLat, lng: customerLng },
              },
            ],
            "R1 - Accept Server Calc",
          );

          const extraDistanceKm = Math.max(0, r1DistanceKm - r0DistanceKm);
          const extraEarnings = calculateRTCEarnings(
            extraDistanceKm,
            earningsConfig,
          );

          let bonusAmount = 0;
          if (serverDeliverySequence === 2) {
            bonusAmount = earningsConfig.DELIVERY_BONUS.SECOND_DELIVERY;
          } else if (serverDeliverySequence >= 3) {
            bonusAmount = earningsConfig.DELIVERY_BONUS.ADDITIONAL_DELIVERY;
          }

          earningsData = {
            delivery_sequence: serverDeliverySequence,
            base_amount: 0,
            extra_earnings: extraEarnings,
            bonus_amount: bonusAmount,
            r0_distance_km: r0DistanceKm,
            r1_distance_km: r1DistanceKm,
            extra_distance_km: extraDistanceKm,
            total_distance_km: extraDistanceKm,
          };

          console.log(
            `[ACCEPT DELIVERY]   ✅ Subsequent delivery earnings: extra=Rs.${extraEarnings.toFixed(2)}, bonus=Rs.${bonusAmount.toFixed(2)}, extra_dist=${extraDistanceKm.toFixed(3)}km`,
          );
        }
      } catch (calcError) {
        console.error(
          `[ACCEPT DELIVERY]   ❌ Server earnings calculation failed:`,
          calcError.message,
        );

        const frontendGross = frontendEarningsData
          ? isFirstDelivery
            ? frontendEarningsData.base_amount
            : frontendEarningsData.extra_earnings +
              frontendEarningsData.bonus_amount
          : 0;

        if (frontendEarningsData && frontendGross > 0) {
          earningsData = { ...frontendEarningsData };
          console.log(
            `[ACCEPT DELIVERY]   ⚠️ Falling back to frontend earnings_data after server calc failure`,
          );
        } else if (isFirstDelivery) {
          // Last-resort fallback for first delivery: use order distance-based estimate.
          const orderDistanceKm = Math.max(
            0,
            parseFloat(deliveryRecord?.orders?.distance_km || 0),
          );
          const fallbackBase = Math.max(
            calculateRTCEarnings(orderDistanceKm, earningsConfig),
          );

          earningsData = {
            delivery_sequence: serverDeliverySequence,
            base_amount: fallbackBase,
            extra_earnings: 0,
            bonus_amount: 0,
            r0_distance_km: null,
            r1_distance_km: orderDistanceKm || null,
            extra_distance_km: 0,
            total_distance_km: orderDistanceKm,
          };

          console.log(
            `[ACCEPT DELIVERY]   ⚠️ Using first-delivery fallback base=Rs.${fallbackBase.toFixed(2)} from order distance ${orderDistanceKm.toFixed(3)}km`,
          );
        } else {
          // Last-resort fallback for subsequent deliveries: ensure at least bonus is stored.
          let fallbackBonus = 0;
          if (serverDeliverySequence === 2) {
            fallbackBonus = earningsConfig.DELIVERY_BONUS.SECOND_DELIVERY ?? 20;
          } else if (serverDeliverySequence >= 3) {
            fallbackBonus =
              earningsConfig.DELIVERY_BONUS.ADDITIONAL_DELIVERY ?? 30;
          }

          earningsData = {
            delivery_sequence: serverDeliverySequence,
            base_amount: 0,
            extra_earnings: 0,
            bonus_amount: fallbackBonus,
            r0_distance_km: null,
            r1_distance_km: null,
            extra_distance_km: 0,
            total_distance_km: 0,
          };

          console.log(
            `[ACCEPT DELIVERY]   ⚠️ Using subsequent-delivery fallback bonus=Rs.${fallbackBonus.toFixed(2)}`,
          );
        }
      }

      // If server result is non-positive but frontend had a valid positive value,
      // keep the positive fallback to avoid persisting zero earnings.
      if (frontendEarningsData) {
        const serverGross = isFirstDelivery
          ? parseFloat(earningsData?.base_amount || 0)
          : parseFloat(earningsData?.extra_earnings || 0) +
            parseFloat(earningsData?.bonus_amount || 0);
        const frontendGross = isFirstDelivery
          ? frontendEarningsData.base_amount
          : frontendEarningsData.extra_earnings +
            frontendEarningsData.bonus_amount;

        if (serverGross <= 0 && frontendGross > 0) {
          earningsData = { ...frontendEarningsData };
          console.log(
            `[ACCEPT DELIVERY]   ⚠️ Replaced non-positive server earnings with frontend fallback to prevent zero persistence`,
          );
        }
      }

      earningsData.delivery_sequence = serverDeliverySequence;

      // ─── BUILD EARNINGS FIELDS FOR DB ────────────────────────────────────
      const deliverySequence = earningsData.delivery_sequence;

      // Enforce component rules by delivery sequence.
      // 1st delivery: base + tip
      // 2nd+ delivery: extra + bonus + tip (base excluded)
      const normalizedBaseAmount = isFirstDelivery
        ? earningsData.base_amount || 0
        : 0;
      const normalizedExtraEarnings = isFirstDelivery
        ? 0
        : earningsData.extra_earnings || 0;
      const normalizedBonusAmount = isFirstDelivery
        ? 0
        : earningsData.bonus_amount || 0;

      const driverEarningsAmount = isFirstDelivery
        ? normalizedBaseAmount + tipAmount
        : normalizedExtraEarnings + normalizedBonusAmount + tipAmount;

      const earningsFields = {
        delivery_sequence: deliverySequence,
        // Store metadata for distance calculations
        r0_distance_km: earningsData.r0_distance_km || null,
        r1_distance_km: earningsData.r1_distance_km || null,
        extra_distance_km: earningsData.extra_distance_km || 0,
        total_distance_km: earningsData.total_distance_km || 0,
        // Store pending earnings data as JSON (will be applied when delivered)
        pending_earnings: JSON.stringify({
          base_amount: normalizedBaseAmount,
          extra_earnings: normalizedExtraEarnings,
          bonus_amount: normalizedBonusAmount,
          tip_amount: tipAmount,
          driver_earnings: driverEarningsAmount,
        }),
        // Store as 0 until delivery is completed
        base_amount: 0,
        extra_earnings: 0,
        bonus_amount: 0,
        driver_earnings: 0,
      };

      console.log(
        `[ACCEPT DELIVERY]   💰 Pending earnings: driver_earnings=Rs.${driverEarningsAmount.toFixed(2)}, seq=${deliverySequence}`,
      );

      const { data: updated, error } = await supabaseAdmin
        .from("deliveries")
        .update({
          driver_id: req.user.id,
          status: "accepted",
          accepted_at: new Date().toISOString(), // Driver acceptance timestamp
          current_latitude: Number.isFinite(acceptedDriverLat)
            ? acceptedDriverLat
            : null,
          current_longitude: Number.isFinite(acceptedDriverLng)
            ? acceptedDriverLng
            : null,
          last_location_update: new Date().toISOString(),
          ...earningsFields,
        })
        .eq("id", deliveryId)
        .is("driver_id", null)
        .eq("status", "pending")
        .select(
          `id, order_id, status, accepted_at, delivery_sequence, base_amount, extra_earnings, bonus_amount, driver_earnings, total_distance_km, orders (
          id,
          order_number,
          restaurant_name,
          restaurant_address,
          restaurant_latitude,
          restaurant_longitude,
          delivery_address,
          delivery_city,
          delivery_latitude,
          delivery_longitude,
          total_amount,
          distance_km,
          customer_id,
          customer_name,
          customer_phone,
          restaurant_id
        ), drivers!driver_id (
          id,
          full_name,
          phone,
          profile_photo_url,
          driver_type,
          current_latitude,
          current_longitude
        )`,
        )
        .maybeSingle();

      if (error) {
        console.error(`[ACCEPT DELIVERY] ❌ Database error: ${error.message}`);
        return res.status(500).json({ message: "Failed to accept delivery" });
      }

      if (!updated) {
        console.log(
          `[ACCEPT DELIVERY] ⚠️  Delivery already taken or not available`,
        );
        return res
          .status(409)
          .json({ message: "Delivery already taken or not available" });
      }

      console.log(
        `[ACCEPT DELIVERY]   ✓ Delivery status updated to 'accepted'`,
      );
      console.log(
        `[ACCEPT DELIVERY]   💰 Earnings pending (will be stored on delivery completion)`,
      );

      // Invalidate available deliveries cache for ALL drivers (this delivery is no longer available)
      availableDeliveriesCache.clear();

      // Step 3: Insert delivery stops into driver's route
      console.log(
        `[ACCEPT DELIVERY] → Step 3: Insert stops into driver's route`,
      );

      const restaurantLat = parseFloat(updated.orders.restaurant_latitude);
      const restaurantLng = parseFloat(updated.orders.restaurant_longitude);
      const customerLat = parseFloat(updated.orders.delivery_latitude);
      const customerLng = parseFloat(updated.orders.delivery_longitude);

      console.log(
        `[ACCEPT DELIVERY]   Restaurant coords: (${restaurantLat}, ${restaurantLng})`,
      );
      console.log(
        `[ACCEPT DELIVERY]   Customer coords: (${customerLat}, ${customerLng})`,
      );

      try {
        const stopsResult = await insertDeliveryStopsIntoRoute(
          req.user.id,
          updated.id,
          restaurantLat,
          restaurantLng,
          customerLat,
          customerLng,
        );
        console.log(
          `[ACCEPT DELIVERY]   ✓ Stops inserted into delivery_stops table`,
        );
        console.log(
          `[ACCEPT DELIVERY]   Stop orders: Restaurant=${stopsResult.restaurant_stop_order}, Customer=${stopsResult.customer_stop_order}`,
        );
      } catch (stopsError) {
        console.error(
          `[ACCEPT DELIVERY] ⚠️  Error inserting stops: ${stopsError.message}`,
        );
        console.error(`[ACCEPT DELIVERY]   Full error:`, stopsError);
        // Continue anyway - delivery is accepted even if stops insertion fails
      }

      // Step 4: Send notifications
      console.log(`[ACCEPT DELIVERY] → Step 4: Send notifications`);

      const notifications = [];
      const driverInfo = await getDriverDisplayInfo(req.user.id);

      if (updated.orders?.customer_id) {
        notifications.push({
          recipient_id: updated.orders.customer_id,
          type: "driver_assigned",
          title: "Driver Assigned!",
          message: `${driverInfo.driver_name} has accepted your order #${updated.orders.order_number}.`,
          metadata: JSON.stringify({
            order_id: updated.order_id,
            driver: driverInfo,
          }),
        });
      }
      if (updated.orders?.restaurant_id) {
        notifications.push({
          recipient_id: updated.orders.restaurant_id,
          type: "driver_assigned",
          title: "Driver on the way",
          message: `${driverInfo.driver_name} is coming to pick up order #${updated.orders.order_number}.`,
          metadata: JSON.stringify({
            order_id: updated.order_id,
            driver: driverInfo,
          }),
        });
      }

      // Notifications are now handled by push notification service
      // which automatically logs to notification_log table
      // if (notifications.length > 0) {
      //   await supabaseAdmin.from("notifications").insert(notifications);
      // }

      console.log(`[ACCEPT DELIVERY]   ✓ Notifications sent`);

      // 📡 REAL-TIME WEBSOCKET: Notify customer that driver accepted their order
      if (updated.orders?.customer_id) {
        // Calculate initial ETA for customer
        let etaData = null;
        if (
          Number.isFinite(acceptedDriverLat) &&
          Number.isFinite(acceptedDriverLng)
        ) {
          etaData = await calculateCustomerETA(updated.order_id, {
            latitude: acceptedDriverLat,
            longitude: acceptedDriverLng,
          });
        }

        notifyCustomer(updated.orders.customer_id, "order:status_update", {
          type: "driver_assigned",
          title: "Driver Accepted!",
          message: `${driverInfo.driver_name} has accepted your order and is heading to the restaurant.`,
          order_id: updated.order_id,
          order_number: updated.orders.order_number,
          status: "accepted",
          driver: driverInfo,
          eta: etaData
            ? {
                etaMinutes: etaData.etaMinutes,
                etaRangeMin: etaData.etaRangeMin,
                etaRangeMax: etaData.etaRangeMax,
                etaDisplay: etaData.etaDisplay,
                stopsBeforeCustomer: etaData.stopsBeforeCustomer,
              }
            : null,
        });

        // If driver has other active deliveries, update those customers' ETAs too
        if (
          serverDeliverySequence > 1 &&
          Number.isFinite(acceptedDriverLat) &&
          Number.isFinite(acceptedDriverLng)
        ) {
          const allETAs = await calculateAllCustomerETAs(req.user.id, {
            latitude: acceptedDriverLat,
            longitude: acceptedDriverLng,
          });
          for (const etaInfo of allETAs) {
            if (etaInfo.customer_id !== updated.orders.customer_id) {
              notifyCustomer(etaInfo.customer_id, "order:status_update", {
                type: "eta_update",
                title: "ETA Updated",
                message: `Your driver accepted another delivery. Updated ETA: ${etaInfo.etaDisplay}`,
                order_id: etaInfo.order_id,
                order_number: etaInfo.order_number,
                eta: {
                  etaMinutes: etaInfo.etaMinutes,
                  etaRangeMin: etaInfo.etaRangeMin,
                  etaRangeMax: etaInfo.etaRangeMax,
                  etaDisplay: etaInfo.etaDisplay,
                },
              });
            }
          }
        }
        console.log(
          `[ACCEPT DELIVERY]   📡 WebSocket: Customer notified with ETA`,
        );

        // 📱 PUSH: Reach customer even when app is closed/locked
        sendDriverAssignedNotification(updated.orders.customer_id, {
          orderNumber: updated.orders.order_number,
          driverName: driverInfo.driver_name,
        }).catch((err) =>
          console.error("Push driver assigned error (non-fatal):", err),
        );
      }

      await notifyRestaurantAdminsOrderStatus(updated.orders?.restaurant_id, {
        type: "driver_assigned",
        order_id: updated.order_id,
        delivery_id: updated.id,
        order_number: updated.orders?.order_number,
        status: "accepted",
        driver_id: req.user.id,
        source: "driver_accept",
      });

      // ======================================================================
      // 📡 BROADCAST: Notify all other drivers that this delivery is taken
      // This allows real-time removal from their available deliveries list
      // ======================================================================
      broadcastDeliveryTaken(updated.id, req.user.id);
      console.log(`[ACCEPT DELIVERY]   📡 Broadcast sent: delivery taken`);

      console.log(`[ACCEPT DELIVERY] ✅ Delivery accepted successfully`);
      console.log(`${"=".repeat(80)}\n`);

      // Return delivery details
      return res.json({
        message: "Delivery accepted successfully",
        delivery: {
          delivery_id: updated.id,
          order_id: updated.order_id,
          order_number: updated.orders.order_number,
          restaurant: {
            name: updated.orders.restaurant_name,
            address: updated.orders.restaurant_address,
            latitude: restaurantLat,
            longitude: restaurantLng,
          },
          delivery: {
            address: updated.orders.delivery_address,
            latitude: customerLat,
            longitude: customerLng,
          },
          customer: {
            name: updated.orders.customer_name,
            phone: updated.orders.customer_phone,
          },
          driver: driverInfo,
        },
      });
    } catch (error) {
      console.error(`[ACCEPT DELIVERY] ❌ Error: ${error.message}`);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ============================================================================
// GET /driver/deliveries/pickups - Get optimized pickup list
// For drivers who have accepted multiple orders
// Returns restaurants sorted by shortest distance using OSRM
// ============================================================================
router.get(
  "/deliveries/pickups",
  authenticate,
  driverOnly,
  async (req, res) => {
    try {
      const { driver_latitude, driver_longitude } = req.query;

      if (!driver_latitude || !driver_longitude) {
        return res.status(400).json({
          message: "Driver location (latitude and longitude) required",
        });
      }

      const driverLat = parseFloat(driver_latitude);
      const driverLng = parseFloat(driver_longitude);

      // Validate parsed coordinates - reject 0,0 and NaN values
      if (
        isNaN(driverLat) ||
        isNaN(driverLng) ||
        (driverLat === 0 && driverLng === 0)
      ) {
        return res.status(400).json({
          message:
            "Valid driver location required. Cannot use (0,0) coordinates.",
          received: {
            driver_latitude,
            driver_longitude,
            parsed: { driverLat, driverLng },
          },
        });
      }

      // Fetch all accepted deliveries (not yet picked up)
      const { data: deliveries, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
          id,
          order_id,
          status,
          accepted_at,
          pending_earnings,
          delivery_sequence,
          orders (
            id,
            order_number,
            restaurant_id,
            restaurant_name,
            restaurant_address,
            restaurant_phone,
            restaurant_latitude,
            restaurant_longitude,
            delivery_address,
            delivery_city,
            delivery_latitude,
            delivery_longitude,
            delivery_fee,
            service_fee,
            subtotal,
            total_amount,
            customer_id,
            customer_name,
            customer_phone,
            order_items (
              id,
              food_id,
              food_name,
              quantity,
              size
            )
          )
        `,
        )
        .eq("driver_id", req.user.id)
        .eq("status", "accepted")
        .order("accepted_at", { ascending: true });

      if (error) {
        console.error("Fetch pickups error:", error);
        return res.status(500).json({ message: "Failed to fetch pickups" });
      }

      if (!deliveries || deliveries.length === 0) {
        return res.json({ pickups: [], total_deliveries: 0 });
      }

      // Calculate distances from driver to each restaurant
      const pickupsWithDistances = await Promise.all(
        deliveries.map(async (d) => {
          const restaurantLat = parseFloat(d.orders.restaurant_latitude);
          const restaurantLng = parseFloat(d.orders.restaurant_longitude);
          const customerLat = parseFloat(d.orders.delivery_latitude);
          const customerLng = parseFloat(d.orders.delivery_longitude);

          // Calculate both routes in PARALLEL for faster response
          const routePromises = [
            getRouteDistance(
              driverLng,
              driverLat,
              restaurantLng,
              restaurantLat,
              "full",
            ),
          ];

          // Only fetch customer route if coordinates exist
          if (customerLat && customerLng) {
            routePromises.push(
              getRouteDistance(
                restaurantLng,
                restaurantLat,
                customerLng,
                customerLat,
                "full",
              ),
            );
          }

          const [route, customerRoute] = await Promise.all(routePromises);

          // Parse pending earnings for display (driver can see what they'll earn)
          let pendingEarningsData = null;
          if (d.pending_earnings) {
            try {
              pendingEarningsData =
                typeof d.pending_earnings === "string"
                  ? JSON.parse(d.pending_earnings)
                  : d.pending_earnings;
            } catch (e) {
              console.error("Error parsing pending_earnings:", e);
            }
          }

          return {
            delivery_id: d.id,
            order_id: d.order_id,
            order_number: d.orders.order_number,
            delivery_sequence: d.delivery_sequence,
            restaurant: {
              id: d.orders.restaurant_id,
              name: d.orders.restaurant_name,
              address: d.orders.restaurant_address,
              phone: d.orders.restaurant_phone,
              latitude: restaurantLat,
              longitude: restaurantLng,
            },
            customer: {
              id: d.orders.customer_id,
              name: d.orders.customer_name,
              phone: d.orders.customer_phone,
              address: d.orders.delivery_address,
              city: d.orders.delivery_city,
              latitude: customerLat,
              longitude: customerLng,
            },
            order_items: d.orders.order_items || [],
            distance_meters: Number.isFinite(route.distance)
              ? route.distance
              : null,
            distance_km: Number.isFinite(route.distance)
              ? (route.distance / 1000).toFixed(2)
              : null,
            estimated_time_minutes: Number.isFinite(route.duration)
              ? Math.ceil(route.duration / 60)
              : null,
            estimated_time_seconds: Number.isFinite(route.duration)
              ? route.duration
              : null,
            route_geometry: route.geometry || null,
            route_unavailable: !!route.isUnavailable,
            customer_route_geometry: customerRoute?.geometry,
            accepted_at: d.accepted_at,
            // Include pending earnings so driver can see expected earnings
            pending_earnings: pendingEarningsData,
          };
        }),
      );

      // Sort by shortest distance (1st pickup = minimum distance)
      pickupsWithDistances.sort(
        (a, b) =>
          (Number.isFinite(a.distance_meters)
            ? a.distance_meters
            : Number.POSITIVE_INFINITY) -
          (Number.isFinite(b.distance_meters)
            ? b.distance_meters
            : Number.POSITIVE_INFINITY),
      );

      return res.json({
        pickups: pickupsWithDistances,
        total_deliveries: pickupsWithDistances.length,
        driver_location: {
          latitude: driverLat,
          longitude: driverLng,
        },
      });
    } catch (error) {
      console.error("Get pickups error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ============================================================================
// GET /driver/deliveries/deliveries-route - Get optimized delivery route
// For deliveries that have been picked up
// Returns customers sorted by shortest distance
// ============================================================================
router.get(
  "/deliveries/deliveries-route",
  authenticate,
  driverOnly,
  async (req, res) => {
    try {
      const { driver_latitude, driver_longitude } = req.query;

      if (!driver_latitude || !driver_longitude) {
        return res.status(400).json({
          message: "Driver location (latitude and longitude) required",
        });
      }

      const driverLat = parseFloat(driver_latitude);
      const driverLng = parseFloat(driver_longitude);

      // Validate parsed coordinates - reject 0,0 and NaN values
      if (
        isNaN(driverLat) ||
        isNaN(driverLng) ||
        (driverLat === 0 && driverLng === 0)
      ) {
        return res.status(400).json({
          message:
            "Valid driver location required. Cannot use (0,0) coordinates.",
          received: {
            driver_latitude,
            driver_longitude,
            parsed: { driverLat, driverLng },
          },
        });
      }

      // Fetch all picked up deliveries (ready for customer delivery)
      const { data: deliveries, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
          id,
          order_id,
          status,
          picked_up_at,
          pending_earnings,
          delivery_sequence,
          orders (
            id,
            order_number,
            restaurant_name,
            delivery_address,
            delivery_city,
            delivery_latitude,
            delivery_longitude,
            delivery_fee,
            service_fee,
            subtotal,
            total_amount,
            customer_id,
            customer_name,
            customer_phone,
            payment_method,
            order_items (
              id,
              food_id,
              food_name,
              quantity,
              size
            )
          )
        `,
        )
        .eq("driver_id", req.user.id)
        .in("status", ["picked_up", "on_the_way", "at_customer"])
        .order("picked_up_at", { ascending: true });

      if (error) {
        console.error("Fetch delivery route error:", error);
        return res
          .status(500)
          .json({ message: "Failed to fetch delivery route" });
      }

      if (!deliveries || deliveries.length === 0) {
        return res.json({ deliveries: [], total_deliveries: 0 });
      }

      // Calculate distances from driver to each customer
      const deliveriesWithDistances = await Promise.all(
        deliveries.map(async (d) => {
          const customerLat = parseFloat(d.orders.delivery_latitude);
          const customerLng = parseFloat(d.orders.delivery_longitude);

          const route = await getRouteDistance(
            driverLng,
            driverLat,
            customerLng,
            customerLat,
            "full",
          );

          // Parse pending earnings for display
          let pendingEarningsData = null;
          if (d.pending_earnings) {
            try {
              pendingEarningsData =
                typeof d.pending_earnings === "string"
                  ? JSON.parse(d.pending_earnings)
                  : d.pending_earnings;
            } catch (e) {
              console.error("Error parsing pending_earnings:", e);
            }
          }

          return {
            delivery_id: d.id,
            order_id: d.order_id,
            order_number: d.orders.order_number,
            status: d.status,
            delivery_sequence: d.delivery_sequence,
            customer: {
              id: d.orders.customer_id,
              name: d.orders.customer_name,
              phone: d.orders.customer_phone,
              address: d.orders.delivery_address,
              city: d.orders.delivery_city,
              latitude: customerLat,
              longitude: customerLng,
            },
            pricing: {
              subtotal: parseFloat(d.orders.subtotal || 0),
              delivery_fee: parseFloat(d.orders.delivery_fee || 0),
              service_fee: parseFloat(d.orders.service_fee || 0),
              total: parseFloat(d.orders.total_amount || 0),
            },
            payment_method: d.orders.payment_method,
            restaurant_name: d.orders.restaurant_name,
            items: d.orders.order_items || [],
            distance_meters: Number.isFinite(route.distance)
              ? route.distance
              : null,
            distance_km: Number.isFinite(route.distance)
              ? (route.distance / 1000).toFixed(2)
              : null,
            estimated_time_minutes: Number.isFinite(route.duration)
              ? Math.ceil(route.duration / 60)
              : null,
            estimated_time_seconds: Number.isFinite(route.duration)
              ? route.duration
              : null,
            route_geometry: route.geometry || null,
            route_unavailable: !!route.isUnavailable,
            picked_up_at: d.picked_up_at,
            // Include pending earnings so driver can see expected earnings
            pending_earnings: pendingEarningsData,
          };
        }),
      );

      // Sort by shortest distance (1st delivery = minimum distance)
      deliveriesWithDistances.sort(
        (a, b) =>
          (Number.isFinite(a.distance_meters)
            ? a.distance_meters
            : Number.POSITIVE_INFINITY) -
          (Number.isFinite(b.distance_meters)
            ? b.distance_meters
            : Number.POSITIVE_INFINITY),
      );

      return res.json({
        deliveries: deliveriesWithDistances,
        total_deliveries: deliveriesWithDistances.length,
        driver_location: {
          latitude: driverLat,
          longitude: driverLng,
        },
      });
    } catch (error) {
      console.error("Get delivery route error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ============================================================================
// GET /driver/deliveries/:id/map - Get map data for delivery tracking
// ============================================================================

router.get(
  "/deliveries/:id/map",
  authenticate,
  driverOnly,
  async (req, res) => {
    const deliveryId = req.params.id;

    try {
      // Fetch delivery with all location data
      const { data: delivery, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
          id,
          order_id,
          status,
          current_latitude,
          current_longitude,
          accepted_at,
          picked_up_at,
          on_the_way_at,
          arrived_customer_at,
          delivered_at,
          orders (
            order_number,
            restaurant_name,
            restaurant_address,
            restaurant_latitude,
            restaurant_longitude,
            delivery_address,
            delivery_city,
            delivery_latitude,
            delivery_longitude,
            customer_name,
            customer_phone
          )
        `,
        )
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id)
        .single();

      if (error) {
        console.error("Fetch delivery map error:", error);
        return res.status(404).json({ message: "Delivery not found" });
      }

      // Use driver's current location or restaurant location as fallback
      const driverLat =
        delivery.current_latitude || delivery.orders.restaurant_latitude;
      const driverLng =
        delivery.current_longitude || delivery.orders.restaurant_longitude;

      const restaurantLat = parseFloat(delivery.orders.restaurant_latitude);
      const restaurantLng = parseFloat(delivery.orders.restaurant_longitude);
      const customerLat = parseFloat(delivery.orders.delivery_latitude);
      const customerLng = parseFloat(delivery.orders.delivery_longitude);

      // Fetch routes from OSRM (Open Source Routing Machine)
      let driverToRestaurantRoute = null;
      let driverToCustomerRoute = null;
      let restaurantToCustomerRoute = null;
      let totalDistance = 0;
      let totalDuration = 0;

      try {
        // Driver → Restaurant route
        const restaurantRoute = await getRouteDistance(
          driverLng,
          driverLat,
          restaurantLng,
          restaurantLat,
          "full",
        );

        if (restaurantRoute) {
          driverToRestaurantRoute = {
            coordinates: restaurantRoute.geometry?.coordinates || null,
            distance: restaurantRoute.distance, // meters
            duration: restaurantRoute.duration, // seconds
          };
          totalDistance += restaurantRoute.distance;
          totalDuration += restaurantRoute.duration;
        }

        // Restaurant → Customer route (for total distance calculation)
        const restaurantCustomerRoute = await getRouteDistance(
          restaurantLng,
          restaurantLat,
          customerLng,
          customerLat,
          "full",
        );

        if (restaurantCustomerRoute) {
          restaurantToCustomerRoute = {
            coordinates: restaurantCustomerRoute.geometry?.coordinates || null,
            distance: restaurantCustomerRoute.distance,
            duration: restaurantCustomerRoute.duration,
          };
          totalDistance += restaurantCustomerRoute.distance;
          totalDuration += restaurantCustomerRoute.duration;
        }

        // Driver → Customer route (direct, for display on map)
        const customerRoute = await getRouteDistance(
          driverLng,
          driverLat,
          customerLng,
          customerLat,
          "full",
        );

        if (customerRoute) {
          driverToCustomerRoute = {
            coordinates: customerRoute.geometry?.coordinates || null,
            distance: customerRoute.distance,
            duration: customerRoute.duration,
          };
        }
      } catch (routeError) {
        console.error("Route calculation error:", routeError);
        // Continue without routes - frontend will handle
      }

      return res.json({
        delivery: {
          id: delivery.id,
          order_id: delivery.order_id,
          status: delivery.status,
          order_number: delivery.orders.order_number,
          timestamps: {
            accepted_at: delivery.accepted_at,
            picked_up_at: delivery.picked_up_at,
            on_the_way_at: delivery.on_the_way_at,
            arrived_customer_at: delivery.arrived_customer_at,
            delivered_at: delivery.delivered_at,
          },
          total_distance: totalDistance, // Total distance in meters (driver→restaurant + restaurant→customer)
          total_duration: totalDuration, // Total duration in seconds
        },
        locations: {
          driver: {
            latitude: parseFloat(driverLat),
            longitude: parseFloat(driverLng),
          },
          restaurant: {
            name: delivery.orders.restaurant_name,
            address: delivery.orders.restaurant_address,
            latitude: restaurantLat,
            longitude: restaurantLng,
          },
          customer: {
            name: delivery.orders.customer_name,
            phone: delivery.orders.customer_phone,
            address: delivery.orders.delivery_address,
            city: delivery.orders.delivery_city,
            latitude: customerLat,
            longitude: customerLng,
          },
        },
        routes: {
          driver_to_restaurant: driverToRestaurantRoute,
          driver_to_customer: driverToCustomerRoute,
          restaurant_to_customer: restaurantToCustomerRoute,
        },
      });
    } catch (error) {
      console.error("Get delivery map error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ============================================================================
// ============================================================================
// Proximity notification throttle — only send once per delivery
// ============================================================================
const proximityNotifiedDeliveries = new Set();

// ============================================================================
// ETA update throttle — only recalculate/broadcast every 30 seconds per driver
// ============================================================================
const lastEtaBroadcast = new Map(); // driverId -> timestamp
const ETA_BROADCAST_INTERVAL_MS = 30000; // 30 seconds
const realtimeLocationEtaCache = new Map(); // deliveryId -> eta payload
const lastRealtimeLocationEtaAt = new Map(); // deliveryId -> timestamp
const REALTIME_LOCATION_ETA_INTERVAL_MS = 10000;

async function getRealtimeEtaSnapshot(
  orderId,
  deliveryId,
  driverLocation,
  status,
) {
  const normalizedDeliveryId = String(deliveryId || "").trim();
  if (!orderId || !normalizedDeliveryId || !driverLocation) {
    return null;
  }

  const now = Date.now();
  const lastAt = lastRealtimeLocationEtaAt.get(normalizedDeliveryId) || 0;

  if (
    now - lastAt < REALTIME_LOCATION_ETA_INTERVAL_MS &&
    realtimeLocationEtaCache.has(normalizedDeliveryId)
  ) {
    return realtimeLocationEtaCache.get(normalizedDeliveryId);
  }

  try {
    const eta = await calculateCustomerETA(orderId, driverLocation);
    const etaPayload = eta
      ? {
          etaMinutes: eta.etaMinutes,
          etaRangeMin: eta.etaRangeMin,
          etaRangeMax: eta.etaRangeMax,
          etaDisplay: eta.etaDisplay,
          stopsBeforeCustomer: eta.stopsBeforeCustomer,
          driverStatus: status || eta.driverStatus || null,
          isExact: eta.isExact || false,
        }
      : null;

    if (etaPayload) {
      realtimeLocationEtaCache.set(normalizedDeliveryId, etaPayload);
    }
    lastRealtimeLocationEtaAt.set(normalizedDeliveryId, now);

    return etaPayload;
  } catch {
    return realtimeLocationEtaCache.get(normalizedDeliveryId) || null;
  }
}

// PATCH /driver/deliveries/:id/location - Update driver location
// ============================================================================

router.patch(
  "/deliveries/:id/location",
  authenticate,
  driverOnly,
  async (req, res) => {
    const deliveryId = req.params.id;
    const { latitude, longitude, heading, speed, timestamp } = req.body;

    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedHeading = Number(heading);
    const parsedSpeed = Number(speed);

    const locationTimestamp =
      Number.isFinite(Number(timestamp)) && Number(timestamp) > 0
        ? Number(timestamp)
        : Date.now();

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "Location coordinates required" });
    }

    // Validate coordinates
    if (
      !Number.isFinite(parsedLatitude) ||
      !Number.isFinite(parsedLongitude) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90 ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      return res.status(400).json({ message: "Invalid coordinates" });
    }

    try {
      // Fetch current delivery to check target stop
      const { data: delivery, error: fetchError } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
          id,
          status,
          driver_id,
          order_id,
          arrived_restaurant_at,
          arrived_customer_at,
          orders (
            restaurant_latitude,
            restaurant_longitude,
            delivery_latitude,
            delivery_longitude,
            customer_id,
            order_number
          )
        `,
        )
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id)
        .maybeSingle();

      if (fetchError || !delivery) {
        return res
          .status(404)
          .json({ message: "Delivery not found or not assigned to you" });
      }

      // Check proximity to target stop (50m threshold)
      const updateData = {
        current_latitude: parsedLatitude,
        current_longitude: parsedLongitude,
        last_location_update: new Date().toISOString(),
      };

      // If driver is heading to restaurant and within 50m, set arrival timestamp
      if (
        delivery.status === "accepted" &&
        !delivery.arrived_restaurant_at &&
        delivery.orders?.restaurant_latitude &&
        delivery.orders?.restaurant_longitude
      ) {
        const restaurantLat = parseFloat(delivery.orders.restaurant_latitude);
        const restaurantLng = parseFloat(delivery.orders.restaurant_longitude);
        const distanceToRestaurant = calculateHaversineDistanceForProximity(
          parsedLatitude,
          parsedLongitude,
          restaurantLat,
          restaurantLng,
        );

        // Within 50m: driver has "arrived" at restaurant — set timestamp for overtime tracking
        if (distanceToRestaurant <= 50) {
          updateData.arrived_restaurant_at = new Date().toISOString();
          console.log(
            `📍 Driver ${req.user.id} arrived at restaurant (${Math.round(distanceToRestaurant)}m) - delivery ${deliveryId}`,
          );
        }
      }

      // If driver is heading to customer and within 50m, set arrival timestamp
      if (
        (delivery.status === "picked_up" ||
          delivery.status === "on_the_way" ||
          delivery.status === "at_customer") &&
        !delivery.arrived_customer_at &&
        delivery.orders?.delivery_latitude &&
        delivery.orders?.delivery_longitude
      ) {
        const customerLat = parseFloat(delivery.orders.delivery_latitude);
        const customerLng = parseFloat(delivery.orders.delivery_longitude);
        const distanceToCustomer = calculateHaversineDistanceForProximity(
          parsedLatitude,
          parsedLongitude,
          customerLat,
          customerLng,
        );

        // Within 50m: driver has "arrived" at customer \u2014 set timestamp for overtime tracking
        if (distanceToCustomer <= 50) {
          updateData.arrived_customer_at = new Date().toISOString();
          console.log(
            `\u{1F4CD} Driver ${req.user.id} arrived at customer (${Math.round(distanceToCustomer)}m) - delivery ${deliveryId}`,
          );
        }
      }

      // Update driver location in deliveries table
      const { data: updated, error } = await supabaseAdmin
        .from("deliveries")
        .update(updateData)
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id)
        .select(
          "id, order_id, status, orders (customer_id, order_number, delivery_latitude, delivery_longitude)",
        )
        .maybeSingle();

      if (error) {
        console.error("Update location error:", error);
        return res.status(500).json({ message: "Failed to update location" });
      }
      if (!updated) {
        return res
          .status(404)
          .json({ message: "Delivery not found or not assigned to you" });
      }

      // Also update the drivers table so fallback location chain stays fresh
      // (fire-and-forget — don't block the response)
      // Column names confirmed: drivers table uses current_latitude / current_longitude
      supabaseAdmin
        .from("drivers")
        .update({
          current_latitude: parsedLatitude,
          current_longitude: parsedLongitude,
          last_location_update: updateData.last_location_update,
        })
        .eq("id", req.user.id)
        .then(({ error: driverUpdateError }) => {
          if (driverUpdateError) {
            console.error(
              "[Location] drivers table update error (non-fatal):",
              driverUpdateError.message,
            );
          }
        })
        .catch(() => {});

      // 📡 Check proximity to customer and notify if < 100m
      if (
        updated.status === "on_the_way" &&
        updated.orders?.customer_id &&
        updated.orders?.delivery_latitude &&
        updated.orders?.delivery_longitude
      ) {
        const customerLat = parseFloat(updated.orders.delivery_latitude);
        const customerLng = parseFloat(updated.orders.delivery_longitude);
        const distance = calculateHaversineDistanceForProximity(
          parsedLatitude,
          parsedLongitude,
          customerLat,
          customerLng,
        );

        if (distance < 100 && !proximityNotifiedDeliveries.has(deliveryId)) {
          proximityNotifiedDeliveries.add(deliveryId);
          notifyCustomer(updated.orders.customer_id, "order:status_update", {
            type: "driver_nearby",
            title: "Your Food is Arriving!",
            message: "Your driver is just around the corner. Get ready!",
            order_id: updated.order_id,
            order_number: updated.orders.order_number,
            delivery_id: updated.id,
            status: "nearby",
            distance_meters: Math.round(distance),
          });
          console.log(
            `📡 WebSocket: Customer notified - driver is ${Math.round(distance)}m away`,
          );

          // Clean up after 10 minutes
          setTimeout(
            () => proximityNotifiedDeliveries.delete(deliveryId),
            600000,
          );
        }
      }

      // 📡 Broadcast updated ETA to all customers (throttled: every 30s)
      const driverId = req.user.id;
      const now = Date.now();
      const lastBroadcast = lastEtaBroadcast.get(driverId) || 0;
      if (
        now - lastBroadcast >= ETA_BROADCAST_INTERVAL_MS &&
        ["accepted", "picked_up", "on_the_way"].includes(updated.status)
      ) {
        lastEtaBroadcast.set(driverId, now);
        // Fire-and-forget: don't block response
        calculateAllCustomerETAs(driverId, {
          latitude: parsedLatitude,
          longitude: parsedLongitude,
        })
          .then((allETAs) => {
            for (const etaInfo of allETAs) {
              notifyCustomer(etaInfo.customer_id, "order:status_update", {
                type: "eta_update",
                title: "ETA Updated",
                message: `Estimated arrival: ${etaInfo.etaDisplay}`,
                order_id: etaInfo.order_id,
                order_number: etaInfo.order_number,
                eta: {
                  etaMinutes: etaInfo.etaMinutes,
                  etaRangeMin: etaInfo.etaRangeMin,
                  etaRangeMax: etaInfo.etaRangeMax,
                  etaDisplay: etaInfo.etaDisplay,
                },
              });
            }
          })
          .catch((e) => console.error("[ETA] Broadcast error:", e.message));
      }

      const hasCustomerCoords =
        Number.isFinite(Number(updated.orders?.delivery_latitude)) &&
        Number.isFinite(Number(updated.orders?.delivery_longitude));

      const distanceMeters = hasCustomerCoords
        ? calculateHaversineDistanceForProximity(
            parsedLatitude,
            parsedLongitude,
            Number(updated.orders.delivery_latitude),
            Number(updated.orders.delivery_longitude),
          )
        : null;

      const etaSnapshot = await getRealtimeEtaSnapshot(
        updated.order_id,
        updated.id,
        {
          latitude: parsedLatitude,
          longitude: parsedLongitude,
        },
        updated.status,
      );

      if (updated.orders?.customer_id) {
        notifyCustomer(updated.orders.customer_id, "order:driver_location", {
          type: "driver_location_update",
          order_id: updated.order_id,
          order_number: updated.orders.order_number,
          delivery_id: updated.id,
          status: updated.status,
          driver_location: {
            latitude: parsedLatitude,
            longitude: parsedLongitude,
            heading: Number.isFinite(parsedHeading) ? parsedHeading : 0,
            speed: Number.isFinite(parsedSpeed) ? parsedSpeed : null,
            timestamp: locationTimestamp,
            last_update: updateData.last_location_update,
          },
          distance_meters: Number.isFinite(distanceMeters)
            ? Math.round(distanceMeters)
            : null,
          distance_km: Number.isFinite(distanceMeters)
            ? Number((distanceMeters / 1000).toFixed(2))
            : null,
          eta: etaSnapshot,
          source: "driver_location_patch",
        });
      }

      return res.json({
        message: "Location updated",
        delivery: {
          id: updated.id,
          status: updated.status,
          location: {
            latitude: parsedLatitude,
            longitude: parsedLongitude,
            heading: Number.isFinite(parsedHeading) ? parsedHeading : 0,
            speed: Number.isFinite(parsedSpeed) ? parsedSpeed : null,
            timestamp: locationTimestamp,
          },
        },
      });
    } catch (error) {
      console.error("Update location error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ============================================================================
// PATCH /driver/deliveries/:id/status - Update delivery status
// ============================================================================

router.patch(
  "/deliveries/:id/status",
  authenticate,
  driverOnly,
  async (req, res) => {
    const deliveryId = req.params.id;
    const requestedStatus = String(req.body?.status || "")
      .trim()
      .toLowerCase();
    const { latitude, longitude } = req.body || {};

    const validStatuses = [
      "picked_up",
      "on_the_way",
      "at_customer",
      "delivered",
    ];

    if (!requestedStatus || !validStatuses.includes(requestedStatus)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    try {
      // Fetch current delivery to validate state transition
      const { data: currentDelivery, error: fetchError } = await supabaseAdmin
        .from("deliveries")
        .select(
          "status, order_id, picked_up_at, on_the_way_at, arrived_customer_at, current_latitude, current_longitude, orders (customer_id, restaurant_id, order_number, restaurant_latitude, restaurant_longitude, delivery_latitude, delivery_longitude)",
        )
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id)
        .single();

      if (fetchError || !currentDelivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      const currentStatus = String(currentDelivery.status || "")
        .trim()
        .toLowerCase();

      // Idempotent success: duplicate updates can happen on touch/mouse gesture retries.
      if (currentStatus === requestedStatus) {
        return res.json({
          message: "Status already up to date",
          delivery: {
            id: deliveryId,
            status: currentStatus,
          },
          promotedDelivery: null,
        });
      }

      // Validate state transitions
      const validTransitions = {
        accepted: ["picked_up"],
        picked_up: ["on_the_way", "delivered"],
        on_the_way: ["at_customer", "delivered"],
        at_customer: ["delivered"],
      };

      const allowedNextStates = validTransitions[currentStatus] || [];
      if (!allowedNextStates.includes(requestedStatus)) {
        return res.status(400).json({
          message: `Cannot transition from '${currentStatus}' to '${requestedStatus}'`,
        });
      }

      const updateData = { status: requestedStatus };

      // If the driver sent a fresh location with the status update, persist it for routing
      const hasLat = Number.isFinite(Number(latitude));
      const hasLng = Number.isFinite(Number(longitude));
      if (hasLat && hasLng) {
        updateData.current_latitude = Number(latitude);
        updateData.current_longitude = Number(longitude);
        updateData.last_location_update = new Date().toISOString();
      }

      // Set timestamps for status transitions
      const timestamp = new Date().toISOString();
      if (requestedStatus === "picked_up") {
        updateData.picked_up_at = timestamp;
      } else if (requestedStatus === "on_the_way") {
        updateData.on_the_way_at = timestamp;
      } else if (requestedStatus === "at_customer") {
        updateData.arrived_customer_at = timestamp;
      } else if (requestedStatus === "delivered") {
        // Allow mobile fast-finish flow: if intermediate states were skipped,
        // stamp them so timeline data remains complete.
        if (!currentDelivery.on_the_way_at) {
          updateData.on_the_way_at = timestamp;
        }
        updateData.delivered_at = timestamp;
      }

      // Update delivery status
      const { data: delivery, error } = await supabaseAdmin
        .from("deliveries")
        .update(updateData)
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id)
        .select("id, order_id, status")
        .maybeSingle();

      if (error) {
        console.error("Update status error:", error);
        return res.status(500).json({ message: "Failed to update status" });
      }

      if (!delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      // Update order payment status when delivered
      if (requestedStatus === "delivered") {
        await supabaseAdmin
          .from("orders")
          .update({
            delivered_at: timestamp,
            payment_status: "paid", // mark payment settled on delivery
          })
          .eq("id", delivery.order_id);

        // Apply pending_earnings to actual columns on delivery completion
        console.log(
          `[DELIVERED] 💰 Finalizing earnings for delivery ${deliveryId}`,
        );

        // Fetch the delivery to get pending_earnings
        const { data: deliveryWithPending } = await supabaseAdmin
          .from("deliveries")
          .select(
            "order_id, pending_earnings, delivery_sequence, driver_earnings, base_amount, extra_earnings, bonus_amount, tip_amount, orders(distance_km)",
          )
          .eq("id", deliveryId)
          .single();

        if (deliveryWithPending && deliveryWithPending.pending_earnings) {
          try {
            const pendingEarnings =
              typeof deliveryWithPending.pending_earnings === "string"
                ? JSON.parse(deliveryWithPending.pending_earnings)
                : deliveryWithPending.pending_earnings;

            const { error: earningsError } = await supabaseAdmin
              .from("deliveries")
              .update({
                base_amount: pendingEarnings.base_amount || 0,
                extra_earnings: pendingEarnings.extra_earnings || 0,
                bonus_amount: pendingEarnings.bonus_amount || 0,
                tip_amount: pendingEarnings.tip_amount || 0,
                driver_earnings: pendingEarnings.driver_earnings || 0,
                pending_earnings: null,
              })
              .eq("id", deliveryId);

            if (earningsError) {
              console.error(
                `[DELIVERED] ❌ Error storing earnings:`,
                earningsError,
              );
            } else {
              console.log(
                `[DELIVERED] ✅ Earnings applied from pending: Rs.${pendingEarnings.driver_earnings} (base: ${pendingEarnings.base_amount || 0}, extra: ${pendingEarnings.extra_earnings}, bonus: ${pendingEarnings.bonus_amount}, tip: ${pendingEarnings.tip_amount || 0})`,
              );
            }
          } catch (parseError) {
            console.error(
              `[DELIVERED] ❌ Error parsing pending_earnings:`,
              parseError,
            );
          }
        } else {
          console.log(
            `[DELIVERED] ⚠️ No pending_earnings found for delivery ${deliveryId}, earnings columns already set: Rs.${deliveryWithPending?.driver_earnings}`,
          );

          // Safety net: never finalize a delivered order with zero earnings.
          const existingDriverEarnings = parseFloat(
            deliveryWithPending?.driver_earnings || 0,
          );
          if (existingDriverEarnings <= 0) {
            try {
              const { earnings: earningsConfigLoaded } =
                await loadConfigConstants();
              const earningsConfig = earningsConfigLoaded || DRIVER_EARNINGS;

              const sequence = parseInt(
                deliveryWithPending?.delivery_sequence || 1,
                10,
              );
              const existingBase = parseFloat(
                deliveryWithPending?.base_amount || 0,
              );
              const existingExtra = parseFloat(
                deliveryWithPending?.extra_earnings || 0,
              );
              const existingBonus = parseFloat(
                deliveryWithPending?.bonus_amount || 0,
              );
              const existingTip = parseFloat(
                deliveryWithPending?.tip_amount || 0,
              );

              let fallbackBase = existingBase;
              let fallbackExtra = existingExtra;
              let fallbackBonus = existingBonus;

              if (sequence <= 1) {
                const orderDistanceKm = Math.max(
                  0,
                  parseFloat(deliveryWithPending?.orders?.distance_km || 0),
                );
                fallbackBase = Math.max(
                  fallbackBase,
                  calculateRTCEarnings(orderDistanceKm, earningsConfig),
                );
                fallbackExtra = 0;
                fallbackBonus = 0;
              } else if (fallbackExtra + fallbackBonus <= 0) {
                fallbackBase = 0;
                fallbackExtra = 0;
                if (sequence === 2) {
                  fallbackBonus =
                    earningsConfig.DELIVERY_BONUS.SECOND_DELIVERY ?? 20;
                } else {
                  fallbackBonus =
                    earningsConfig.DELIVERY_BONUS.ADDITIONAL_DELIVERY ?? 30;
                }
              }

              const fallbackDriverEarnings =
                sequence <= 1
                  ? fallbackBase + existingTip
                  : fallbackExtra + fallbackBonus + existingTip;

              if (fallbackDriverEarnings > 0) {
                const { error: fallbackApplyError } = await supabaseAdmin
                  .from("deliveries")
                  .update({
                    base_amount: fallbackBase,
                    extra_earnings: fallbackExtra,
                    bonus_amount: fallbackBonus,
                    tip_amount: existingTip,
                    driver_earnings: fallbackDriverEarnings,
                    pending_earnings: null,
                  })
                  .eq("id", deliveryId);

                if (fallbackApplyError) {
                  console.error(
                    `[DELIVERED] ❌ Failed to apply fallback earnings for delivery ${deliveryId}:`,
                    fallbackApplyError,
                  );
                } else {
                  console.log(
                    `[DELIVERED] ✅ Applied fallback earnings for delivery ${deliveryId}: Rs.${fallbackDriverEarnings.toFixed(2)}`,
                  );
                }
              }
            } catch (fallbackErr) {
              console.error(
                `[DELIVERED] ❌ Error while applying delivered-time fallback earnings:`,
                fallbackErr,
              );
            }
          }
        }

        // ======================================================================
        // CLEANUP: Delete delivery_stops for this delivery
        // ======================================================================
        console.log(
          `[DELIVERED] 🧹 Cleaning up delivery_stops for delivery ${deliveryId}`,
        );

        // Check if driver has any other active deliveries
        const { data: remainingDeliveries } = await supabaseAdmin
          .from("deliveries")
          .select("id")
          .eq("driver_id", req.user.id)
          .not("status", "in", "(delivered,cancelled,failed)");

        const hasRemainingDeliveries =
          remainingDeliveries && remainingDeliveries.length > 0;

        if (hasRemainingDeliveries) {
          // Driver still has active deliveries - only delete stops for this specific delivery
          const { error: deleteError } = await supabaseAdmin
            .from("delivery_stops")
            .delete()
            .eq("delivery_id", deliveryId);

          if (deleteError) {
            console.error(
              `[DELIVERED] ❌ Error deleting stops for delivery ${deliveryId}:`,
              deleteError,
            );
          } else {
            console.log(
              `[DELIVERED] ✅ Deleted delivery_stops for delivery ${deliveryId} (driver has ${remainingDeliveries.length} active deliveries remaining)`,
            );
          }
        } else {
          // Driver has no remaining active deliveries - delete ALL stops for this driver
          const { error: deleteError } = await supabaseAdmin
            .from("delivery_stops")
            .delete()
            .eq("driver_id", req.user.id);

          if (deleteError) {
            console.error(
              `[DELIVERED] ❌ Error deleting all stops for driver:`,
              deleteError,
            );
          } else {
            console.log(
              `[DELIVERED] ✅ Deleted ALL delivery_stops for driver (all deliveries completed)`,
            );
          }
        }
      }

      // Send notifications for status changes
      const notifications = [];
      const statusMessages = {
        picked_up: {
          customer: "Your order has been picked up from the restaurant",
          restaurant: "Order has been picked up by driver",
        },
        on_the_way: {
          customer: "Driver is on the way to your location",
          restaurant: "Driver is delivering the order to customer",
        },
        at_customer: {
          customer: "Driver has arrived at your location",
          restaurant: "Driver has reached the delivery address",
        },
        delivered: {
          customer: "Your order has been delivered. Enjoy your meal!",
          restaurant: "Order has been successfully delivered",
        },
      };

      const messages = statusMessages[requestedStatus];
      if (messages && currentDelivery.orders) {
        if (currentDelivery.orders.customer_id) {
          notifications.push({
            recipient_id: currentDelivery.orders.customer_id,
            type: "delivery_status_update",
            title: "Order Update",
            message: messages.customer,
            metadata: JSON.stringify({
              order_id: delivery.order_id,
              delivery_id: delivery.id,
              status: requestedStatus,
              order_number: currentDelivery.orders.order_number,
            }),
          });
        }
        if (currentDelivery.orders.restaurant_id) {
          notifications.push({
            recipient_id: currentDelivery.orders.restaurant_id,
            type: "delivery_status_update",
            title: "Delivery Update",
            message: messages.restaurant,
            metadata: JSON.stringify({
              order_id: delivery.order_id,
              delivery_id: delivery.id,
              status: requestedStatus,
              order_number: currentDelivery.orders.order_number,
            }),
          });
        }
      }

      // Notifications are now handled by push notification service
      // which automatically logs to notification_log table
      // if (notifications.length > 0) {
      //   await supabaseAdmin.from("notifications").insert(notifications);
      // }

      // 📡 REAL-TIME WEBSOCKET: Notify customer of delivery status change
      if (messages && currentDelivery.orders?.customer_id) {
        const wsStatusTitles = {
          picked_up: "Order Picked Up!",
          on_the_way: "Driver On The Way!",
          at_customer: "Your Food is Arriving!",
          delivered: "Order Delivered!",
        };

        // Calculate updated ETA on status change
        let etaData = null;
        if (requestedStatus !== "delivered") {
          const dLat = hasLat
            ? Number(latitude)
            : parseFloat(currentDelivery.current_latitude);
          const dLng = hasLng
            ? Number(longitude)
            : parseFloat(currentDelivery.current_longitude);
          if (dLat && dLng) {
            etaData = await calculateCustomerETA(delivery.order_id, {
              latitude: dLat,
              longitude: dLng,
            });
          }
        }

        notifyCustomer(
          currentDelivery.orders.customer_id,
          "order:status_update",
          {
            type: "delivery_status_update",
            title: wsStatusTitles[requestedStatus] || "Order Update",
            message: messages.customer,
            order_id: delivery.order_id,
            delivery_id: delivery.id,
            order_number: currentDelivery.orders.order_number,
            status: requestedStatus,
            eta: etaData
              ? {
                  etaMinutes: etaData.etaMinutes,
                  etaRangeMin: etaData.etaRangeMin,
                  etaRangeMax: etaData.etaRangeMax,
                  etaDisplay: etaData.etaDisplay,
                  stopsBeforeCustomer: etaData.stopsBeforeCustomer,
                }
              : null,
          },
        );

        // Also broadcast updated ETAs to ALL customers of this driver
        if (requestedStatus !== "delivered") {
          const dLat2 = hasLat
            ? Number(latitude)
            : parseFloat(currentDelivery.current_latitude);
          const dLng2 = hasLng
            ? Number(longitude)
            : parseFloat(currentDelivery.current_longitude);
          if (dLat2 && dLng2) {
            const allETAs = await calculateAllCustomerETAs(req.user.id, {
              latitude: dLat2,
              longitude: dLng2,
            });
            for (const etaInfo of allETAs) {
              if (etaInfo.customer_id !== currentDelivery.orders.customer_id) {
                notifyCustomer(etaInfo.customer_id, "order:status_update", {
                  type: "eta_update",
                  title: "ETA Updated",
                  message: `Estimated arrival: ${etaInfo.etaDisplay}`,
                  order_id: etaInfo.order_id,
                  order_number: etaInfo.order_number,
                  eta: {
                    etaMinutes: etaInfo.etaMinutes,
                    etaRangeMin: etaInfo.etaRangeMin,
                    etaRangeMax: etaInfo.etaRangeMax,
                    etaDisplay: etaInfo.etaDisplay,
                  },
                });
              }
            }
          }
        }

        console.log(
          `📡 WebSocket: Customer ${currentDelivery.orders.customer_id} notified of status: ${requestedStatus}`,
        );

        // 📱 PUSH: Reach customer even when app is closed/phone locked
        sendDeliveryStatusNotification(currentDelivery.orders.customer_id, {
          orderId: delivery.order_id,
          orderNumber: currentDelivery.orders.order_number,
          status: requestedStatus,
        }).catch((err) =>
          console.error("Push delivery status error (non-fatal):", err),
        );

        // 📱 PUSH: Also notify restaurant admin of key delivery events
        if (
          ["picked_up", "delivered"].includes(requestedStatus) &&
          currentDelivery.orders.restaurant_id
        ) {
          sendDeliveryStatusToAdmin(currentDelivery.orders.restaurant_id, {
            orderNumber: currentDelivery.orders.order_number,
            status: requestedStatus,
          }).catch((err) =>
            console.error("Push admin delivery error (non-fatal):", err),
          );
        }
      }

      await notifyRestaurantAdminsOrderStatus(
        currentDelivery.orders?.restaurant_id,
        {
          type: "delivery_status_update",
          order_id: delivery.order_id,
          delivery_id: delivery.id,
          order_number: currentDelivery.orders?.order_number,
          status: requestedStatus,
          source: "driver_status_update",
        },
      );

      // Helper: promote the next picked_up delivery to on_the_way
      // Business logic:
      // 1 active delivery only:
      //   accepted -> picked_up -> on_the_way immediately
      // Multiple active deliveries:
      //   accepted pickups all must be completed first
      //   after last restaurant pickup, first/nearest picked_up customer delivery becomes on_the_way
      const promoteNextPickedUp = async (referenceLat, referenceLng) => {
        const hasReference =
          Number.isFinite(Number(referenceLat)) &&
          Number.isFinite(Number(referenceLng));

        // If there is already an active customer delivery, do not promote another one.
        const { data: hasActive, error: activeCheckError } = await supabaseAdmin
          .from("deliveries")
          .select("id")
          .eq("driver_id", req.user.id)
          .in("status", ["on_the_way", "at_customer"])
          .limit(1);

        if (activeCheckError) {
          console.error("[AUTO PROMOTE] Active check error:", activeCheckError);
        }

        if (hasActive && hasActive.length > 0) {
          console.log(
            "[AUTO PROMOTE] Skipped: already has on_the_way/at_customer",
          );
          return null;
        }

        // If any accepted pickup remains, driver is still in pickup mode.
        // Do not start customer delivery until all restaurant pickups are done.
        const { data: hasAccepted, error: acceptedCheckError } =
          await supabaseAdmin
            .from("deliveries")
            .select("id")
            .eq("driver_id", req.user.id)
            .eq("status", "accepted")
            .limit(1);

        if (acceptedCheckError) {
          console.error(
            "[AUTO PROMOTE] Accepted check error:",
            acceptedCheckError,
          );
        }

        if (hasAccepted && hasAccepted.length > 0) {
          console.log(
            "[AUTO PROMOTE] Skipped: accepted pickups still remaining",
          );
          return null;
        }

        // Find all picked_up deliveries waiting for customer delivery.
        const { data: nextList, error: nextListError } = await supabaseAdmin
          .from("deliveries")
          .select(
            `
            id,
            order_id,
            status,
            picked_up_at,
            orders (
              order_number,
              delivery_latitude,
              delivery_longitude,
              customer_id,
              restaurant_id
            )
          `,
          )
          .eq("driver_id", req.user.id)
          .eq("status", "picked_up")
          .order("picked_up_at", { ascending: true });

        if (nextListError) {
          console.error(
            "[AUTO PROMOTE] Fetch picked_up list error:",
            nextListError,
          );
          return null;
        }

        if (!nextList || nextList.length === 0) {
          console.log("[AUTO PROMOTE] Skipped: no picked_up deliveries found");
          return null;
        }

        let next = null;

        // Prefer nearest customer if location + OSRM works.
        if (hasReference) {
          try {
            const routes = await Promise.all(
              nextList.map(async (n) => {
                const cLat = Number.parseFloat(n.orders?.delivery_latitude);
                const cLng = Number.parseFloat(n.orders?.delivery_longitude);

                if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) {
                  return {
                    id: n.id,
                    order_id: n.order_id,
                    distance: Number.POSITIVE_INFINITY,
                    customer_id: n.orders?.customer_id,
                    restaurant_id: n.orders?.restaurant_id,
                    order_number: n.orders?.order_number,
                  };
                }

                const route = await getRouteDistance(
                  Number(referenceLng),
                  Number(referenceLat),
                  cLng,
                  cLat,
                  "false",
                );

                return {
                  id: n.id,
                  order_id: n.order_id,
                  distance: Number.isFinite(Number(route?.distance))
                    ? Number(route.distance)
                    : Number.POSITIVE_INFINITY,
                  customer_id: n.orders?.customer_id,
                  restaurant_id: n.orders?.restaurant_id,
                  order_number: n.orders?.order_number,
                };
              }),
            );

            routes.sort((a, b) => a.distance - b.distance);
            next = routes[0] || null;
          } catch (routeError) {
            console.error(
              "[AUTO PROMOTE] OSRM route sort failed, falling back to oldest picked_up:",
              routeError?.message || routeError,
            );
            next = null;
          }
        }

        // Fallback: OSRM failed or no reference location.
        // Use earliest picked_up delivery. This prevents picked_up from getting stuck forever.
        if (!next) {
          const first = nextList[0];
          next = {
            id: first.id,
            order_id: first.order_id,
            distance: null,
            customer_id: first.orders?.customer_id,
            restaurant_id: first.orders?.restaurant_id,
            order_number: first.orders?.order_number,
          };
        }

        if (!next?.id) {
          console.log(
            "[AUTO PROMOTE] Skipped: next delivery could not be resolved",
          );
          return null;
        }

        const ts = new Date().toISOString();

        const { data: promoted, error: promoteError } = await supabaseAdmin
          .from("deliveries")
          .update({
            status: "on_the_way",
            on_the_way_at: ts,
          })
          .eq("id", next.id)
          .eq("driver_id", req.user.id)
          .eq("status", "picked_up")
          .select("id, order_id, status")
          .maybeSingle();

        if (promoteError) {
          console.error("[AUTO PROMOTE] Promotion DB error:", promoteError);
          return null;
        }

        if (!promoted) {
          console.log(
            "[AUTO PROMOTE] Promotion skipped: delivery already changed",
          );
          return null;
        }

        const nextMsgs = statusMessages["on_the_way"];

        // Notify customer
        if (next.customer_id) {
          notifyCustomer(next.customer_id, "order:status_update", {
            type: "delivery_status_update",
            title: "Driver On The Way!",
            message:
              nextMsgs?.customer || "Driver is on the way to your location",
            order_id: promoted.order_id || next.order_id,
            delivery_id: promoted.id || next.id,
            order_number: next.order_number,
            status: "on_the_way",
          });

          sendDeliveryStatusNotification(next.customer_id, {
            orderId: promoted.order_id || next.order_id,
            orderNumber: next.order_number,
            status: "on_the_way",
          }).catch((err) =>
            console.error("Push auto on_the_way error (non-fatal):", err),
          );
        }

        // Notify restaurant admins
        await notifyRestaurantAdminsOrderStatus(next.restaurant_id, {
          type: "delivery_status_update",
          order_id: promoted.order_id || next.order_id,
          delivery_id: promoted.id || next.id,
          order_number: next.order_number,
          status: "on_the_way",
          source: "driver_auto_promote",
        });

        console.log(
          `[AUTO PROMOTE] ✅ Delivery ${promoted.id} promoted to on_the_way`,
        );

        return {
          id: promoted.id,
          order_id: promoted.order_id,
          status: "on_the_way",
        };
      };

      // Auto-promote cases
      let promotedDelivery = null;
      if (requestedStatus === "delivered") {
        const refLat = hasLat
          ? Number(latitude)
          : Number.parseFloat(
              currentDelivery.current_latitude ||
                currentDelivery.orders.delivery_latitude,
            );
        const refLng = hasLng
          ? Number(longitude)
          : Number.parseFloat(
              currentDelivery.current_longitude ||
                currentDelivery.orders.delivery_longitude,
            );
        promotedDelivery = await promoteNextPickedUp(refLat, refLng);
      }

      if (requestedStatus === "picked_up") {
        const refLat = Number.parseFloat(
          currentDelivery.orders.restaurant_latitude ||
            currentDelivery.current_latitude,
        );
        const refLng = Number.parseFloat(
          currentDelivery.orders.restaurant_longitude ||
            currentDelivery.current_longitude,
        );
        promotedDelivery = await promoteNextPickedUp(refLat, refLng);
      }

      if (["delivered", "failed", "cancelled"].includes(requestedStatus)) {
        const cacheKey = String(delivery.id || deliveryId || "").trim();
        if (cacheKey) {
          realtimeLocationEtaCache.delete(cacheKey);
          lastRealtimeLocationEtaAt.delete(cacheKey);
        }
        proximityNotifiedDeliveries.delete(deliveryId);
      }

      return res.json({
        message: "Status updated successfully",
        delivery: {
          id: delivery.id,
          status: delivery.status,
        },
        promotedDelivery: promotedDelivery || null,
      });
    } catch (error) {
      console.error("Update status error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ============================================================================
// GET /driver/deliveries/active - Get all active deliveries
// ============================================================================

router.get("/deliveries/active", authenticate, driverOnly, async (req, res) => {
  try {
    const { data: deliveries, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
        id,
        order_id,
        status,
        accepted_at,
        picked_up_at,
        current_latitude,
        current_longitude,
        driver_id,
        orders (
          id,
          order_number,
          restaurant_name,
          restaurant_address,
          restaurant_latitude,
          restaurant_longitude,
          delivery_address,
          delivery_city,
          delivery_latitude,
          delivery_longitude,
          customer_name,
          customer_phone,
          customer_id,
          restaurant_id,
          total_amount,
          distance_km,
          payment_method,
          order_items (
            id,
            food_name,
            quantity,
            size
          )
        )
      `,
      )
      .eq("driver_id", req.user.id)
      .not("status", "in", "(delivered,failed,cancelled)")
      .order("accepted_at", { ascending: false });

    if (error && error.code !== "PGRST116") {
      console.error("Fetch active deliveries error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch active deliveries" });
    }

    if (!deliveries || deliveries.length === 0) {
      return res.json({ deliveries: [] });
    }

    // OSRM-ONLY: This is a fast overview endpoint - use stored distance_km from order
    // Detailed OSRM routes are fetched by /pickups and /deliveries-route endpoints.
    // We no longer calculate Haversine estimates here.
    const formattedDeliveries = deliveries.map((d) => {
      const restaurantLat = parseFloat(d.orders.restaurant_latitude);
      const restaurantLng = parseFloat(d.orders.restaurant_longitude);
      const customerLat = parseFloat(d.orders.delivery_latitude);
      const customerLng = parseFloat(d.orders.delivery_longitude);

      // Use stored distance from order (calculated via OSRM at checkout)
      // Convert km to meters for consistency with other endpoints
      const storedDistanceKm = parseFloat(d.orders.distance_km) || null;
      const totalDistance = storedDistanceKm ? storedDistanceKm * 1000 : null;

      return {
        id: d.id,
        order_id: d.order_id,
        status: d.status,
        driver_location: {
          latitude: d.current_latitude,
          longitude: d.current_longitude,
        },
        accepted_at: d.accepted_at,
        picked_up_at: d.picked_up_at,
        total_distance: totalDistance, // in meters (from OSRM at checkout), null if unavailable
        total_distance_unavailable: totalDistance === null,
        order: {
          order_number: d.orders.order_number,
          status: d.status,
          restaurant: {
            name: d.orders.restaurant_name,
            address: d.orders.restaurant_address,
            latitude: restaurantLat,
            longitude: restaurantLng,
          },
          delivery: {
            address: d.orders.delivery_address,
            city: d.orders.delivery_city,
            latitude: customerLat,
            longitude: customerLng,
          },
          customer: {
            id: d.orders.customer_id,
            name: d.orders.customer_name,
            phone: d.orders.customer_phone,
          },
          restaurant_id: d.orders.restaurant_id,
          total_amount: parseFloat(d.orders.total_amount),
          distance_km: parseFloat(d.orders.distance_km),
          payment_method: d.orders.payment_method,
          items: d.orders.order_items,
        },
      };
    });

    return res.json({ deliveries: formattedDeliveries });
  } catch (error) {
    console.error("Get active deliveries error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// GET /driver/deliveries/:id - Fetch single accepted delivery for driver
// ============================================================================

router.get("/deliveries/:id", authenticate, driverOnly, async (req, res) => {
  const deliveryId = req.params.id;
  const driverId = req.user.id;

  try {
    const { data, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
          id,
          status,
          driver_id,
          current_latitude,
          current_longitude,
          orders (
            order_number,
            restaurant_name,
            restaurant_address,
            restaurant_latitude,
            restaurant_longitude,
            delivery_address,
            delivery_latitude,
            delivery_longitude,
            customer_name,
            customer_phone
          )
        `,
      )
      .eq("id", deliveryId)
      .eq("driver_id", driverId)
      .in("status", ["accepted", "picked_up", "on_the_way", "at_customer"])
      .single();

    if (error || !data) {
      return res.status(404).json({
        message: "Active delivery not found",
      });
    }

    return res.json({
      delivery: {
        id: data.id,
        status: data.status,
        driver_location: {
          latitude: data.current_latitude,
          longitude: data.current_longitude,
        },
        order: {
          order_number: data.orders.order_number,
          restaurant: {
            name: data.orders.restaurant_name,
            address: data.orders.restaurant_address,
            latitude: data.orders.restaurant_latitude,
            longitude: data.orders.restaurant_longitude,
          },
          delivery: {
            address: data.orders.delivery_address,
            latitude: data.orders.delivery_latitude,
            longitude: data.orders.delivery_longitude,
          },
          customer: {
            name: data.orders.customer_name,
            phone: data.orders.customer_phone,
          },
        },
      },
    });
  } catch (err) {
    console.error("Fetch delivery error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// GET /driver/deliveries/history - Get completed deliveries
// ============================================================================

router.get(
  "/deliveries/history",
  authenticate,
  driverOnly,
  async (req, res) => {
    const { limit = 20, offset = 0 } = req.query;

    try {
      const { data: deliveries, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
        id,
        order_id,
        status,
        accepted_at,
        picked_up_at,
        delivered_at,
        delivery_sequence,
        driver_earnings,
        base_amount,
        extra_earnings,
        bonus_amount,
        tip_amount,
        pending_earnings,
        orders (
          order_number,
          restaurant_name,
          delivery_address,
          total_amount,
          distance_km
        )
      `,
        )
        .eq("driver_id", req.user.id)
        .in("status", ["delivered", "failed"])
        .order("delivered_at", { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (error) {
        console.error("Fetch delivery history error:", error);
        return res.status(500).json({ message: "Failed to fetch history" });
      }

      const normalizedDeliveries = (deliveries || []).map((d) => {
        let pending = null;
        if (d.pending_earnings) {
          try {
            pending =
              typeof d.pending_earnings === "string"
                ? JSON.parse(d.pending_earnings)
                : d.pending_earnings;
          } catch {
            pending = null;
          }
        }

        const storedEarnings = parseFloat(d.driver_earnings || 0);
        const componentEarnings =
          parseFloat(d.base_amount || 0) +
          parseFloat(d.extra_earnings || 0) +
          parseFloat(d.bonus_amount || 0) +
          parseFloat(d.tip_amount || 0);
        const pendingEarnings = parseFloat(pending?.driver_earnings || 0);

        // Prefer finalized stored value, then computed components, then pending snapshot.
        const finalDriverEarnings =
          storedEarnings > 0
            ? storedEarnings
            : componentEarnings > 0
              ? componentEarnings
              : pendingEarnings;

        return {
          ...d,
          driver_earnings: finalDriverEarnings,
        };
      });

      return res.json({ deliveries: normalizedDeliveries });
    } catch (error) {
      console.error("Get delivery history error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ============================================================================
// GET /driver/notifications - Get driver notifications
// ============================================================================

router.get("/notifications", authenticate, driverOnly, async (req, res) => {
  const { limit = 50, unread_only = false } = req.query;

  try {
    // notification_log has no is_read field, so unread_only is ignored
    const { data: notifications, error } = await supabaseAdmin
      .from("notification_log")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      console.error("Fetch notifications error:", error);
      return res.status(500).json({ message: "Failed to fetch notifications" });
    }

    return res.json({ notifications: notifications || [] });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// PATCH /driver/notifications/:id/read - Mark notification as read
// ============================================================================

router.patch(
  "/notifications/:id/read",
  authenticate,
  driverOnly,
  async (req, res) => {
    // notification_log is read-only, no mark-as-read functionality
    // Return success for backward compatibility
    return res.json({ message: "Notification marked as read" });
  },
);

// ============================================================================
// PATCH /driver/notifications/mark-all-read - Mark all notifications as read
// ============================================================================

router.patch(
  "/notifications/mark-all-read",
  authenticate,
  driverOnly,
  async (req, res) => {
    // notification_log is read-only, no mark-as-read functionality
    // Return success for backward compatibility
    return res.json({ message: "All notifications marked as read" });
  },
);

// ============================================================================
// GET /driver/stats - Get driver statistics
// ============================================================================

router.get("/stats", authenticate, driverOnly, async (req, res) => {
  try {
    // Get total completed deliveries
    const { count: totalDeliveries } = await supabaseAdmin
      .from("deliveries")
      .select("*", { count: "exact", head: true })
      .eq("driver_id", req.user.id)
      .eq("status", "delivered");

    // Get today's deliveries
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: todayDeliveries } = await supabaseAdmin
      .from("deliveries")
      .select("*", { count: "exact", head: true })
      .eq("driver_id", req.user.id)
      .eq("status", "delivered")
      .gte("delivered_at", today.toISOString());

    // Get driver profile
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("full_name, phone, status, driver_type")
      .eq("id", req.user.id)
      .single();

    return res.json({
      stats: {
        total_deliveries: totalDeliveries || 0,
        today_deliveries: todayDeliveries || 0,
      },
      driver: driver || null,
    });
  } catch (error) {
    console.error("Get driver stats error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// NEW V2 ENDPOINTS - ROUTE-BASED DELIVERY SYSTEM
// ============================================================================

// ============================================================================
// GET /driver/deliveries/available/v2
// ============================================================================
// NEW VERSION: Shows available deliveries as route extensions
// Returns only deliveries that fit within driver's current route
//
// Response:
// {
//   available_deliveries: [
//     {
//       delivery_id,
//       order_number,
//       restaurant,
//       customer,
//       route_impact: { extra_distance_km, extra_time_minutes, extra_earnings }
//     }
//   ],
//   total_available,
//   driver_location,
//   current_route
// }

// ============================================================================
// AVAILABLE DELIVERIES RESPONSE CACHE
// ============================================================================
// Caches per-driver results for 30 seconds. Invalidated when:
//   - Driver moves >200m from cached position
//   - Cache TTL expires (30s)
//   - Pending delivery count changes
// This prevents repeated OSRM calls when frontend polls frequently.
// ============================================================================
const availableDeliveriesCache = new Map();
const AVAILABLE_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const AVAILABLE_CACHE_MOVE_THRESHOLD_M = 200; // Only recalculate if driver moved 200m+
const AVAILABLE_RECALCULATION_TIMEOUT_MS = 15000;
const AVAILABLE_STALE_FALLBACK_TTL_MS = 10 * 60 * 1000;

const ACTIVE_DELIVERY_STATUSES = [
  "accepted",
  "picked_up",
  "on_the_way",
  "at_customer",
];

function buildPendingSignature(rows = []) {
  return rows
    .map((row) => {
      const acceptedAt = row?.res_accepted_at || "";
      const tipAmount = Number.parseFloat(row?.tip_amount || 0).toFixed(2);
      return `${row.id}:${acceptedAt}:${tipAmount}`;
    })
    .sort()
    .join("|");
}

function buildActiveSignature(rows = []) {
  return rows
    .map((row) => {
      const acceptedAt = row?.accepted_at || "";
      return `${row.id}:${row.status || ""}:${acceptedAt}`;
    })
    .sort()
    .join("|");
}

function haversineDistanceSimple(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function withComputationTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new Error(timeoutMessage || "Computation timed out");
      timeoutError.name = "ComputationTimeout";
      reject(timeoutError);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

router.get(
  "/deliveries/available/v2",
  authenticate,
  driverOnly,
  async (req, res) => {
    console.log("[AVAILABLE V2 AUTH DEBUG]", {
      userId: req.user?.id,
      role: req.user?.role,
      type: req.user?.type,
    });
    const driverId = req.user.id;
    const { driver_latitude, driver_longitude, trigger_reason } = req.query;
    const normalizedTriggerReason = String(trigger_reason || "")
      .trim()
      .toLowerCase();
    const fullRecalculationTriggers = new Set(["delivery_accepted"]);
    const forceFullRecalculationByTrigger = fullRecalculationTriggers.has(
      normalizedTriggerReason,
    );
    const lat = driver_latitude ? parseFloat(driver_latitude) : null;
    const lng = driver_longitude ? parseFloat(driver_longitude) : null;

    // Check driver status first: suspended/rejected/pending drivers should not receive new requests.
    const { driverData, errorResponse } = await getDriverProfileForRequest(req);

    if (errorResponse) {
      return res.status(errorResponse.status).json(errorResponse.body);
    }

    const statusInfo = resolveDriverStatus(driverData);
    if (statusInfo.isBlocked) {
      const suspended = statusInfo.normalizedStatus === "suspended";
      return res.json({
        available_deliveries: [],
        total_available: 0,
        current_route: {
          total_stops: 0,
          active_deliveries: 0,
        },
        message: suspended
          ? SUSPENDED_DEPOSIT_MESSAGE
          : "You must be online (active) to see available deliveries",
        driver_status: statusInfo.normalizedStatus || driverData.driver_status,
        working_time: driverData.working_time || "full_time",
      });
    }

    let pendingSignature = "";
    let activeSignature = "";

    // Build lightweight signatures so we can skip expensive recompute
    // when there is no new pending delivery and route context is unchanged.
    const [pendingMetaResult, activeMetaResult] = await Promise.all([
      supabaseAdmin
        .from("deliveries")
        .select("id, res_accepted_at, tip_amount")
        .eq("status", "pending")
        .is("driver_id", null),
      supabaseAdmin
        .from("deliveries")
        .select("id, status, accepted_at")
        .eq("driver_id", driverId)
        .in("status", ACTIVE_DELIVERY_STATUSES),
    ]);

    if (pendingMetaResult.error || activeMetaResult.error) {
      return res.status(500).json({
        message: "Failed to evaluate delivery trigger state",
      });
    }

    pendingSignature = buildPendingSignature(pendingMetaResult.data || []);
    activeSignature = buildActiveSignature(activeMetaResult.data || []);

    // Check response cache first
    const cached = availableDeliveriesCache.get(driverId);
    let cacheHit = false;
    let movedMeters = null;
    let pendingChanged = false;
    let activeChanged = false;

    if (cached && lat && lng) {
      const age = Date.now() - cached.timestamp;
      const moved = haversineDistanceSimple(cached.lat, cached.lng, lat, lng);
      movedMeters = moved;
      pendingChanged = cached.pendingSignature !== pendingSignature;
      activeChanged = cached.activeSignature !== activeSignature;
      if (
        age < AVAILABLE_CACHE_TTL_MS &&
        moved < AVAILABLE_CACHE_MOVE_THRESHOLD_M &&
        !pendingChanged &&
        !activeChanged &&
        !forceFullRecalculationByTrigger
      ) {
        cacheHit = true;
        console.log(
          `[ENDPOINT] GET /available/v2 → CACHED (age=${Math.round(age / 1000)}s, moved=${Math.round(moved)}m, trigger=${normalizedTriggerReason || "none"})`,
        );
        return res.json({
          ...cached.result,
          telemetry: {
            ...(cached.result?.telemetry || {}),
            trigger_reason: normalizedTriggerReason || "none",
            cache_hit: true,
            moved_meters:
              typeof movedMeters === "number" ? Math.round(movedMeters) : null,
            pending_changed: pendingChanged,
            active_changed: activeChanged,
          },
        });
      }
    }

    console.log(`\n\n${"=".repeat(100)}`);
    console.log(`[ENDPOINT] GET /driver/deliveries/available/v2`);
    console.log(`[DRIVER] ${driverId}`);
    console.log(`[LOCATION] lat=${driver_latitude}, lng=${driver_longitude}`);
    console.log(`${"=".repeat(100)}`);

    try {
      const availableDeliveries = await withComputationTimeout(
        getAvailableDeliveriesForDriver(
          driverId,
          lat,
          lng,
          getRouteDistance, // Pass the OSRM helper function
          {
            trigger: {
              pendingSignature,
              activeSignature,
              reason: normalizedTriggerReason,
              forceRecalculateAll:
                forceFullRecalculationByTrigger ||
                (cached && lat && lng
                  ? haversineDistanceSimple(cached.lat, cached.lng, lat, lng) >=
                    AVAILABLE_CACHE_MOVE_THRESHOLD_M
                  : false),
            },
          },
        ),
        AVAILABLE_RECALCULATION_TIMEOUT_MS,
        "Available deliveries computation timed out",
      );

      // Store in cache
      if (lat && lng) {
        availableDeliveriesCache.set(driverId, {
          result: availableDeliveries,
          lat,
          lng,
          pendingSignature,
          activeSignature,
          timestamp: Date.now(),
        });
      }

      const responseWithTelemetry = {
        ...availableDeliveries,
        telemetry: {
          ...(availableDeliveries?.telemetry || {}),
          trigger_reason: normalizedTriggerReason || "none",
          cache_hit: cacheHit,
          moved_meters:
            typeof movedMeters === "number" ? Math.round(movedMeters) : null,
          pending_changed: pendingChanged,
          active_changed: activeChanged,
        },
      };

      console.log(
        `[ENDPOINT] ✅ Returning ${availableDeliveries.available_deliveries?.length || 0} available deliveries | trigger=${responseWithTelemetry.telemetry.trigger_reason} | cache_hit=${responseWithTelemetry.telemetry.cache_hit} | reused=${responseWithTelemetry.telemetry.reused_evaluations_count || 0} | new=${responseWithTelemetry.telemetry.new_evaluations_count || 0}`,
      );
      console.log("[ENDPOINT] Available deliveries debug:", {
        candidate_count: responseWithTelemetry.telemetry?.candidate_count,
        returned_count: responseWithTelemetry.available_deliveries?.length || 0,
        total_available: responseWithTelemetry.total_available,
        current_route: responseWithTelemetry.current_route,
      });
      return res.json(responseWithTelemetry);
    } catch (error) {
      console.error(`[ENDPOINT] ❌ Error: ${error.message}`);
      console.error(error.stack);

      const cachedAge = cached ? Date.now() - cached.timestamp : null;
      const canServeStaleCache =
        cached &&
        cached.result &&
        typeof cachedAge === "number" &&
        cachedAge < AVAILABLE_STALE_FALLBACK_TTL_MS;

      if (canServeStaleCache) {
        console.warn(
          `[ENDPOINT] ⚠️ Serving stale available deliveries cache (age=${Math.round(cachedAge / 1000)}s) due to error: ${error.message}`,
        );
        return res.json({
          ...cached.result,
          telemetry: {
            ...(cached.result?.telemetry || {}),
            trigger_reason: normalizedTriggerReason || "none",
            cache_hit: true,
            stale_cache: true,
            fallback_reason: error.message,
            cache_age_seconds: Math.round(cachedAge / 1000),
          },
        });
      }

      if (error?.name === "ComputationTimeout") {
        return res.json({
          available_deliveries: [],
          total_available: 0,
          driver_location:
            Number.isFinite(lat) && Number.isFinite(lng)
              ? {
                  latitude: lat,
                  longitude: lng,
                }
              : null,
          current_route: {
            total_stops: 0,
            active_deliveries: 0,
          },
          message: "Temporarily unable to recalculate available deliveries",
          telemetry: {
            trigger_reason: normalizedTriggerReason || "none",
            cache_hit: false,
            degraded_mode: true,
            fallback_reason: error.message,
          },
        });
      }

      return res.status(500).json({
        message: "Failed to fetch available deliveries",
        error: error.message,
      });
    }
  },
);

// ============================================================================
// GET /driver/deliveries/active/v2
// ============================================================================
// NEW VERSION: Returns active deliveries with properly ordered stops
//
// Response:
// {
//   driver_location,
//   active_deliveries: [
//     {
//       delivery_id,
//       order_number,
//       delivery_status,
//       restaurant,
//       customer,
//       stops: [
//         { stop_order, stop_type, latitude, longitude }
//       ]
//     }
//   ],
//   total_deliveries,
//   total_stops
// }

router.get(
  "/deliveries/active/v2",
  authenticate,
  driverOnly,
  async (req, res) => {
    const driverId = req.user.id;
    const { driver_latitude, driver_longitude } = req.query;

    console.log(`\n${"=".repeat(80)}`);
    console.log(`[ACTIVE DELIVERIES V2] 📦 Fetching active deliveries`);
    console.log(`[DRIVER] ${driverId}`);
    console.log(`${"=".repeat(80)}`);

    try {
      const formattedDeliveries = await getFormattedActiveDeliveries(
        driverId,
        driver_latitude ? parseFloat(driver_latitude) : null,
        driver_longitude ? parseFloat(driver_longitude) : null,
      );

      console.log(`${"=".repeat(80)}\n`);
      return res.json(formattedDeliveries);
    } catch (error) {
      console.error(`[ACTIVE DELIVERIES V2] ❌ Error: ${error.message}`);
      return res.status(500).json({
        message: "Failed to fetch active deliveries",
        error: error.message,
      });
    }
  },
);

// ============================================================================
// GET /driver/route-context
// ============================================================================
// Debug endpoint: Returns raw route context data
// Useful for frontend debugging and understanding driver's current route

router.get("/route-context", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;

  console.log(
    `\n[ROUTE CONTEXT] 🔍 Debug endpoint called for driver: ${driverId}`,
  );

  try {
    const routeContext = await getDriverRouteContext(driverId);
    return res.json(routeContext);
  } catch (error) {
    console.error(`[ROUTE CONTEXT] ❌ Error: ${error.message}`);
    return res.status(500).json({
      message: "Failed to fetch route context",
      error: error.message,
    });
  }
});

// ============================================================================
// DRIVER EARNINGS ENDPOINTS
// ============================================================================

// GET /driver/earnings/history - Get driver's earnings history
router.get("/earnings/history", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;
  const {
    status = "delivered",
    start_date,
    end_date,
    limit = 50,
    offset = 0,
  } = req.query;

  console.log(
    `\n[EARNINGS HISTORY] 💰 Fetching earnings for driver: ${driverId}`,
  );

  try {
    let query = supabaseAdmin
      .from("deliveries")
      .select(
        `
        id,
        order_id,
        delivery_sequence,
        base_amount,
        extra_earnings,
        bonus_amount,
        tip_amount,
        driver_earnings,
        total_distance_km,
        extra_distance_km,
        r0_distance_km,
        r1_distance_km,
        accepted_at,
        delivered_at,
        status,
        orders (
          order_number,
          customer_name,
          delivery_address,
          restaurant_name,
          total_amount
        )
      `,
      )
      .eq("driver_id", driverId);

    // Apply status filter
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Apply date filters
    if (start_date) {
      query = query.gte("delivered_at", start_date);
    }
    if (end_date) {
      query = query.lte("delivered_at", end_date);
    }

    // Apply pagination and ordering
    query = query
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .order("accepted_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data: earnings, error } = await query;

    if (error) {
      console.error(`[EARNINGS HISTORY] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch earnings" });
    }

    // Format the response
    const formattedEarnings = earnings.map((e) => {
      const baseAmount = parseFloat(e.base_amount || 0);
      const extraEarnings = parseFloat(e.extra_earnings || 0);
      const bonusAmount = parseFloat(e.bonus_amount || 0);
      const tipAmount = parseFloat(e.tip_amount || 0);
      const storedEarnings = parseFloat(e.driver_earnings || 0);
      const componentEarnings =
        baseAmount + extraEarnings + bonusAmount + tipAmount;

      return {
        delivery_id: e.id,
        order_id: e.order_id,
        order_number: e.orders?.order_number,
        customer_name: e.orders?.customer_name,
        customer_address: e.orders?.delivery_address,
        restaurant_name: e.orders?.restaurant_name,
        delivery_sequence: e.delivery_sequence,
        base_amount: baseAmount,
        extra_earnings: extraEarnings,
        bonus_amount: bonusAmount,
        tip_amount: tipAmount,
        driver_earnings:
          storedEarnings > 0 ? storedEarnings : componentEarnings,
        total_distance_km: parseFloat(e.total_distance_km || 0),
        extra_distance_km: parseFloat(e.extra_distance_km || 0),
        accepted_at: e.accepted_at,
        delivered_at: e.delivered_at,
        status: e.status,
      };
    });

    console.log(
      `[EARNINGS HISTORY] ✅ Found ${formattedEarnings.length} earnings records`,
    );
    return res.json({ success: true, earnings: formattedEarnings });
  } catch (error) {
    console.error(`[EARNINGS HISTORY] ❌ Error: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch earnings" });
  }
});

// GET /driver/earnings/summary - Get earnings summary (today/yesterday/week/last30)
router.get("/earnings/summary", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;
  const { period = "all" } = req.query; // Default to "all" for total earnings

  console.log(
    `\n[EARNINGS SUMMARY] 📊 Fetching ${period} summary for driver: ${driverId}`,
  );

  try {
    // Build date filter based on period
    let periodStart = null;
    let periodEnd = null;
    const { dateStr: todayDateStr, start: todayStart } = getSriLankaDayRange();

    switch (period) {
      case "today":
        periodStart = todayStart;
        break;
      case "yesterday":
        {
          const yesterdayRange = getSriLankaDayRangeFromDateStr(
            shiftSriLankaDateString(todayDateStr, -1),
          );
          periodStart = yesterdayRange.start;
          periodEnd = yesterdayRange.end;
        }
        break;
      case "week":
        // Last 7 Sri Lanka calendar days including today.
        periodStart = getSriLankaDayRangeFromDateStr(
          shiftSriLankaDateString(todayDateStr, -6),
        ).start;
        break;
      case "last30":
        periodStart = getSriLankaDayRangeFromDateStr(
          shiftSriLankaDateString(todayDateStr, -29),
        ).start;
        break;
      case "month":
        // Backward compatibility for older clients.
        periodStart = getSriLankaDayRangeFromDateStr(
          shiftSriLankaDateString(todayDateStr, -29),
        ).start;
        break;
      case "all":
        periodStart = null;
        break;
    }

    // Main query for selected period
    let query = supabaseAdmin
      .from("deliveries")
      .select(
        "base_amount, extra_earnings, bonus_amount, tip_amount, driver_earnings, total_distance_km, extra_distance_km",
      )
      .eq("driver_id", driverId)
      .eq("status", "delivered");

    if (periodStart) {
      query = query.gte("delivered_at", periodStart);
    }
    if (periodEnd) {
      query = query.lte("delivered_at", periodEnd);
    }

    const { data: deliveries, error } = await query;

    if (error) {
      console.error(`[EARNINGS SUMMARY] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch summary" });
    }

    // Also fetch today's data separately (for Today's Performance section)
    const { data: todayDeliveries, error: todayError } = await supabaseAdmin
      .from("deliveries")
      .select(
        "base_amount, extra_earnings, bonus_amount, tip_amount, driver_earnings, total_distance_km, extra_distance_km",
      )
      .eq("driver_id", driverId)
      .eq("status", "delivered")
      .gte("delivered_at", todayStart);

    if (todayError) {
      console.error(`[EARNINGS SUMMARY] ❌ Today error: ${todayError.message}`);
    }

    // Calculate summary for selected period
    const getFinalDeliveryEarnings = (d) => {
      const stored = parseFloat(d.driver_earnings || 0);
      if (stored > 0) return stored;
      return (
        parseFloat(d.base_amount || 0) +
        parseFloat(d.extra_earnings || 0) +
        parseFloat(d.bonus_amount || 0) +
        parseFloat(d.tip_amount || 0)
      );
    };

    const summary = {
      total_deliveries: deliveries.length,
      total_distance_km: deliveries.reduce(
        (sum, d) =>
          sum + parseFloat(d.total_distance_km ?? d.extra_distance_km ?? 0),
        0,
      ),
      total_base: deliveries.reduce(
        (sum, d) => sum + parseFloat(d.base_amount || 0),
        0,
      ),
      total_extra: deliveries.reduce(
        (sum, d) => sum + parseFloat(d.extra_earnings || 0),
        0,
      ),
      total_bonus: deliveries.reduce(
        (sum, d) => sum + parseFloat(d.bonus_amount || 0),
        0,
      ),
      total_tips: deliveries.reduce(
        (sum, d) => sum + parseFloat(d.tip_amount || 0),
        0,
      ),
      total_earnings: deliveries.reduce(
        (sum, d) => sum + getFinalDeliveryEarnings(d),
        0,
      ),
      avg_per_delivery:
        deliveries.length > 0
          ? deliveries.reduce(
              (sum, d) => sum + getFinalDeliveryEarnings(d),
              0,
            ) / deliveries.length
          : 0,
    };

    // Calculate today's performance (always included regardless of period)
    const todayPerformance = {
      deliveries: todayDeliveries?.length || 0,
      earnings: (todayDeliveries || []).reduce(
        (sum, d) => sum + getFinalDeliveryEarnings(d),
        0,
      ),
      distance_km: (todayDeliveries || []).reduce(
        (sum, d) =>
          sum + parseFloat(d.total_distance_km ?? d.extra_distance_km ?? 0),
        0,
      ),
    };

    console.log(
      `[EARNINGS SUMMARY] ✅ ${period}: ${summary.total_deliveries} deliveries, Rs.${summary.total_earnings.toFixed(2)} total`,
    );
    console.log(
      `[EARNINGS SUMMARY] ✅ Today: ${todayPerformance.deliveries} deliveries, Rs.${todayPerformance.earnings.toFixed(2)}, ${todayPerformance.distance_km.toFixed(1)}km`,
    );

    return res.json({
      success: true,
      summary,
      period,
      today: todayPerformance,
    });
  } catch (error) {
    console.error(`[EARNINGS SUMMARY] ❌ Error: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch summary" });
  }
});

// GET /driver/earnings/chart - Weekly/monthly/yearly earnings chart
router.get("/earnings/chart", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;
  const { chartPeriod = "week" } = req.query;

  try {
    const { dateStr: todayDateStr } = getSriLankaDayRange();
    const currentSriLankaDate = new Date(`${todayDateStr}T00:00:00+05:30`);
    let queryStart = null;

    if (chartPeriod === "week") {
      queryStart = getSriLankaDayRangeFromDateStr(
        shiftSriLankaDateString(todayDateStr, -6),
      ).start;
    } else if (chartPeriod === "month") {
      queryStart = getSriLankaDayRangeFromDateStr(
        shiftSriLankaDateString(todayDateStr, -29),
      ).start;
    } else {
      const oldestMonthDate = new Date(currentSriLankaDate);
      oldestMonthDate.setDate(1);
      oldestMonthDate.setMonth(oldestMonthDate.getMonth() - 11);
      const oldestMonthDateStr = `${getSriLankaDateKey(oldestMonthDate.toISOString()).slice(0, 7)}-01`;
      queryStart = getSriLankaDayRangeFromDateStr(oldestMonthDateStr).start;
    }

    const { data: deliveries, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        "delivered_at, driver_earnings, base_amount, extra_earnings, bonus_amount, tip_amount",
      )
      .eq("driver_id", driverId)
      .eq("status", "delivered")
      .not("delivered_at", "is", null)
      .gte("delivered_at", queryStart)
      .order("delivered_at", { ascending: true });

    if (error) {
      console.error(`[EARNINGS CHART] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch chart data" });
    }

    const rows = deliveries || [];
    const getFinalDeliveryEarnings = (row) => {
      const stored = parseFloat(row.driver_earnings || 0);
      if (stored > 0) return stored;
      return (
        parseFloat(row.base_amount || 0) +
        parseFloat(row.extra_earnings || 0) +
        parseFloat(row.bonus_amount || 0) +
        parseFloat(row.tip_amount || 0)
      );
    };
    let chartData = [];

    if (chartPeriod === "year") {
      const deduped = [];
      for (let i = 11; i >= 0; i -= 1) {
        const d = new Date(currentSriLankaDate);
        d.setMonth(d.getMonth() - i);
        const monthKey = getSriLankaDateKey(d.toISOString()).slice(0, 7);
        deduped.push(monthKey);
      }

      const grouped = {};
      for (const key of deduped) grouped[key] = 0;

      for (const row of rows) {
        const dayKey = getSriLankaDateKey(row.delivered_at);
        const monthKey = dayKey ? dayKey.slice(0, 7) : null;
        if (monthKey && grouped[monthKey] !== undefined) {
          grouped[monthKey] += getFinalDeliveryEarnings(row);
        }
      }

      chartData = deduped.map((monthKey) => ({
        date: monthKey,
        amount: Math.round(grouped[monthKey] || 0),
      }));
    } else {
      const rangeDays = chartPeriod === "week" ? 7 : 30;
      const dayKeys = [];
      for (let i = rangeDays - 1; i >= 0; i -= 1) {
        dayKeys.push(shiftSriLankaDateString(todayDateStr, -i));
      }

      const grouped = {};
      for (const key of dayKeys) grouped[key] = 0;

      for (const row of rows) {
        const dayKey = getSriLankaDateKey(row.delivered_at);
        if (dayKey && grouped[dayKey] !== undefined) {
          grouped[dayKey] += getFinalDeliveryEarnings(row);
        }
      }

      chartData = dayKeys.map((dayKey) => ({
        date: dayKey,
        amount: Math.round(grouped[dayKey] || 0),
      }));
    }

    return res.json({ success: true, chartPeriod, chartData });
  } catch (error) {
    console.error(`[EARNINGS CHART] ❌ Error: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch chart data" });
  }
});

// GET /driver/earnings/by-customer - Get earnings grouped by customer
router.get(
  "/earnings/by-customer",
  authenticate,
  driverOnly,
  async (req, res) => {
    const driverId = req.user.id;
    const { limit = 20 } = req.query;

    console.log(
      `\n[EARNINGS BY CUSTOMER] 👥 Fetching customer earnings for driver: ${driverId}`,
    );

    try {
      const { data: deliveries, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
        driver_earnings,
        tip_amount,
        delivered_at,
        orders (
          customer_id,
          customer_name,
          delivery_address
        )
      `,
        )
        .eq("driver_id", driverId)
        .eq("status", "delivered")
        .order("delivered_at", { ascending: false });

      if (error) {
        console.error(`[EARNINGS BY CUSTOMER] ❌ Error: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch customer earnings",
        });
      }

      // Group by customer
      const customerMap = new Map();

      deliveries.forEach((d) => {
        const customerId = d.orders?.customer_id;
        if (!customerId) return;

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer_id: customerId,
            customer_name: d.orders.customer_name,
            customer_address: d.orders.delivery_address,
            delivery_count: 0,
            total_earned: 0,
            total_tips: 0,
            last_delivery: null,
          });
        }

        const customer = customerMap.get(customerId);
        customer.delivery_count++;
        customer.total_earned += parseFloat(d.driver_earnings || 0);
        customer.total_tips += parseFloat(d.tip_amount || 0);
        if (
          !customer.last_delivery ||
          new Date(d.delivered_at) > new Date(customer.last_delivery)
        ) {
          customer.last_delivery = d.delivered_at;
        }
      });

      // Convert to array and sort by total earned
      const customerEarnings = Array.from(customerMap.values())
        .map((c) => ({
          ...c,
          avg_per_delivery:
            c.delivery_count > 0 ? c.total_earned / c.delivery_count : 0,
        }))
        .sort((a, b) => b.total_earned - a.total_earned)
        .slice(0, parseInt(limit));

      console.log(
        `[EARNINGS BY CUSTOMER] ✅ Found ${customerEarnings.length} customers`,
      );
      return res.json({ success: true, earnings: customerEarnings });
    } catch (error) {
      console.error(`[EARNINGS BY CUSTOMER] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch customer earnings" });
    }
  },
);

// GET /driver/earnings/delivery/:deliveryId - Get specific delivery earnings
router.get(
  "/earnings/delivery/:deliveryId",
  authenticate,
  driverOnly,
  async (req, res) => {
    const driverId = req.user.id;
    const { deliveryId } = req.params;

    console.log(
      `\n[DELIVERY EARNINGS] 💵 Fetching earnings for delivery: ${deliveryId}`,
    );

    try {
      const { data: delivery, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
        id,
        order_id,
        delivery_sequence,
        base_amount,
        extra_earnings,
        bonus_amount,
        tip_amount,
        driver_earnings,
        total_distance_km,
        extra_distance_km,
        r0_distance_km,
        r1_distance_km,
        accepted_at,
        picked_up_at,
        delivered_at,
        status,
        orders (
          order_number,
          customer_name,
          customer_phone,
          delivery_address,
          restaurant_name,
          restaurant_address,
          total_amount
        )
      `,
        )
        .eq("id", deliveryId)
        .eq("driver_id", driverId)
        .single();

      if (error || !delivery) {
        console.error(`[DELIVERY EARNINGS] ❌ Not found or unauthorized`);
        return res
          .status(404)
          .json({ success: false, message: "Delivery not found" });
      }

      const earning = {
        delivery_id: delivery.id,
        order_id: delivery.order_id,
        order_number: delivery.orders?.order_number,
        customer_name: delivery.orders?.customer_name,
        customer_phone: delivery.orders?.customer_phone,
        customer_address: delivery.orders?.delivery_address,
        restaurant_name: delivery.orders?.restaurant_name,
        restaurant_address: delivery.orders?.restaurant_address,
        order_total: parseFloat(delivery.orders?.total_amount || 0),
        delivery_sequence: delivery.delivery_sequence,
        base_amount: parseFloat(delivery.base_amount || 0),
        extra_earnings: parseFloat(delivery.extra_earnings || 0),
        bonus_amount: parseFloat(delivery.bonus_amount || 0),
        tip_amount: parseFloat(delivery.tip_amount || 0),
        driver_earnings: parseFloat(delivery.driver_earnings || 0),
        total_distance_km: parseFloat(delivery.total_distance_km || 0),
        extra_distance_km: parseFloat(delivery.extra_distance_km || 0),
        r0_distance_km: delivery.r0_distance_km
          ? parseFloat(delivery.r0_distance_km)
          : null,
        r1_distance_km: delivery.r1_distance_km
          ? parseFloat(delivery.r1_distance_km)
          : null,
        accepted_at: delivery.accepted_at,
        picked_up_at: delivery.picked_up_at,
        delivered_at: delivery.delivered_at,
        status: delivery.status,
      };

      console.log(
        `[DELIVERY EARNINGS] ✅ Found earnings: Rs.${earning.driver_earnings}`,
      );
      return res.json({ success: true, earning });
    } catch (error) {
      console.error(`[DELIVERY EARNINGS] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch delivery earnings" });
    }
  },
);

// ============================================================================
// POST /driver/deliveries/:id/proof - Upload delivery proof photo
// ============================================================================
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

router.post(
  "/deliveries/:id/proof",
  authenticate,
  driverOnly,
  proofUpload.single("file"),
  async (req, res) => {
    const deliveryId = req.params.id;
    const driverId = req.user.id;

    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // Verify this delivery belongs to the driver
      const { data: delivery, error: fetchError } = await supabaseAdmin
        .from("deliveries")
        .select("id, driver_id")
        .eq("id", deliveryId)
        .eq("driver_id", driverId)
        .maybeSingle();

      if (fetchError || !delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      // Upload to Cloudinary
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;

      const result = await cloudinary.uploader.upload(dataURI, {
        folder: `nearme/delivery-proofs/${driverId}`,
        public_id: `proof_${deliveryId}_${Date.now()}`,
        resource_type: "image",
        overwrite: true,
        access_mode: "public",
        transformation: [
          { width: 1200, height: 1200, crop: "limit", quality: "auto" },
        ],
      });

      // Save URL to delivery record
      const { error: updateError } = await supabaseAdmin
        .from("deliveries")
        .update({ delivery_proof_url: result.secure_url })
        .eq("id", deliveryId);

      if (updateError) {
        console.error("Update delivery proof error:", updateError);
        return res
          .status(500)
          .json({ message: "Failed to save proof URL to delivery" });
      }

      console.log(
        `[DELIVERY PROOF] ✅ Uploaded proof for delivery ${deliveryId}`,
      );
      return res.json({
        message: "Delivery proof uploaded",
        url: result.secure_url,
      });
    } catch (error) {
      console.error(`[DELIVERY PROOF] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ message: "Failed to upload delivery proof" });
    }
  },
);

export default router;
