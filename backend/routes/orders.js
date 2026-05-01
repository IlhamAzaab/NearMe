/**
 * Orders Routes
 * Production-grade order placement and management
 *
 * Uses JWT-based Supabase client for RLS compliance
 * Uses supabaseAdmin only for operations that require elevated permissions
 *
 * Endpoints:
 * - POST /orders/place - Place a new order (customer)
 * - GET /orders/my-orders - Get customer's orders
 * - GET /orders/:id - Get order details
 * - GET /orders/restaurant/orders - Get restaurant orders (admin)
 * - PATCH /orders/restaurant/orders/:id/status - Update order status (admin)
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { getCartItemPrices } from "../utils/commission.js";
import { calculateCustomerETA } from "../utils/etaCalculator.js";
import {
  sendNewDeliveryNotificationToDrivers,
  sendNewOrderNotification,
  sendOrderStatusNotification,
} from "../utils/pushNotificationService.js";
import {
  broadcastNewDelivery,
  getLatestDriverLiveLocation,
  notifyAdmin,
  notifyCustomer,
} from "../utils/socketManager.js";
import {
  calculateDeliveryFeeFromConfig,
  calculateServiceFeeFromConfig,
  getSystemConfig,
  getLaunchPromoConfig,
} from "../utils/systemConfig.js";
import { getOSRMRoute } from "../utils/osrmService.js";
import { getSriLankaDayRange } from "../utils/sriLankaTime.js";

const router = express.Router();

// ============================================================================
// HELPER: Create Supabase client with user's JWT
// ============================================================================

function getSupabaseClient(userToken) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ============================================================================
// HELPER FUNCTIONS
//
function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const hint = String(error?.hint || "").toLowerCase();
  const target = String(columnName || "").toLowerCase();

  if (!target) {
    return false;
  }

  return (
    error?.code === "42703" ||
    message.includes(`column ${target}`) ||
    message.includes(`'${target}'`) ||
    details.includes(target) ||
    hint.includes(target)
  );
}

async function getDriverDisplayInfo(driverId) {
  const cleanDriverId = String(driverId || "").trim();
  if (!cleanDriverId) return null;

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
      .eq("id", cleanDriverId)
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
      .eq("driver_id", cleanDriverId)
      .maybeSingle(),
  ]);

  if (driverError) {
    console.error("[DriverInfo] drivers fetch failed:", {
      driverId: cleanDriverId,
      message: driverError.message,
      code: driverError.code,
      details: driverError.details,
    });
  }

  if (vehicleError) {
    console.error("[DriverInfo] vehicle fetch failed:", {
      driverId: cleanDriverId,
      message: vehicleError.message,
      code: vehicleError.code,
      details: vehicleError.details,
    });
  }

  let authUser = null;

  if (!driver?.full_name || !driver?.phone) {
    try {
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.getUserById(cleanDriverId);

      if (authError) {
        console.warn("[DriverInfo] auth user fetch failed:", {
          driverId: cleanDriverId,
          message: authError.message,
        });
      } else {
        authUser = authData?.user || null;
      }
    } catch (error) {
      console.warn("[DriverInfo] auth lookup exception:", error?.message);
    }
  }

  // Important:
  // If driver_id exists in deliveries, NEVER return null.
  // Return at least fallback object so frontend can display assigned driver state.
  const fullName =
    driver?.full_name ||
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    authUser?.email ||
    "Assigned Driver";

  const phone = driver?.phone || authUser?.phone || "";
  const photoUrl = driver?.profile_photo_url || "";

  const vehicleType =
    vehicle?.vehicle_type ||
    driver?.driver_type ||
    "";

  const vehicleModel = vehicle?.vehicle_model || "";
  const vehicleNumber = vehicle?.vehicle_number || "";

  const driverInfo = {
    id: cleanDriverId,
    driver_id: cleanDriverId,

    // Main frontend fields
    full_name: fullName,
    phone,
    photo_url: photoUrl,
    profile_photo_url: photoUrl,
    vehicle_type: vehicleType,
    vehicle_model: vehicleModel,
    vehicle_number: vehicleNumber,

    // Backward-compatible aliases
    driver_name: fullName,
    driver_phone: phone,
    driver_photo: photoUrl,
    driver_vehicle_type: vehicleType,
    driver_vehicle_model: vehicleModel,
    driver_vehicle_number: vehicleNumber,

    // Debug-safe availability flags
    has_driver_profile: Boolean(driver),
    has_vehicle_profile: Boolean(vehicle),
  };

  console.log("[DriverInfo] Resolved driver display info:", {
    driverId: cleanDriverId,
    full_name: driverInfo.full_name,
    phone_present: Boolean(driverInfo.phone),
    vehicle_number: driverInfo.vehicle_number,
    vehicle_type: driverInfo.vehicle_type,
    vehicle_model: driverInfo.vehicle_model,
    has_driver_profile: driverInfo.has_driver_profile,
    has_vehicle_profile: driverInfo.has_vehicle_profile,
  });

  return driverInfo;
}

/**
 * Calculate service fee based on subtotal
 * Uses DB config tiers, falls back to hardcoded defaults
 */
async function calculateServiceFee(subtotal) {
  try {
    const config = await getSystemConfig();
    return calculateServiceFeeFromConfig(subtotal, config);
  } catch {
    // Fallback to hardcoded defaults
    if (subtotal < 300) return 0;
    if (subtotal >= 300 && subtotal < 1000) return 31;
    if (subtotal >= 1000 && subtotal < 1500) return 42;
    if (subtotal >= 1500 && subtotal < 2500) return 56;
    return 62;
  }
}

/**
 * Calculate delivery fee based on distance in km
 * Uses DB config tiers, falls back to hardcoded defaults
 */
async function calculateDeliveryFee(distanceKm) {
  if (distanceKm === null || distanceKm === undefined) return null;
  try {
    const config = await getSystemConfig();
    return calculateDeliveryFeeFromConfig(distanceKm, config);
  } catch {
    // Fallback to hardcoded defaults
    if (distanceKm <= 1) return 50;
    if (distanceKm <= 2) return 80;
    if (distanceKm <= 2.5) return 87;
    const extraMeters = (distanceKm - 2.5) * 1000;
    const extra100mUnits = Math.ceil(extraMeters / 100);
    return 87 + extra100mUnits * 2.3;
  }
}

/**
 * Calculate launch promotion delivery fee (first order only)
 * Formula (requested):
 * - distance <= max_km: distance * first_km_rate
 * - distance > max_km:
 *   (max_km * first_km_rate) + ((distance - max_km) * beyond_km_rate)
 */
function calculateLaunchPromoDeliveryFee(distanceKm, promoConfig) {
  if (distanceKm === null || distanceKm === undefined) return null;

  const distance = Math.max(0, Number(distanceKm));
  const maxKm = Math.max(0, Number(promoConfig.max_km));
  const firstKmRate = Math.max(0, Number(promoConfig.first_km_rate));
  const beyondRate = Math.max(0, Number(promoConfig.beyond_km_rate));

  const fee =
    distance <= maxKm
      ? distance * firstKmRate
      : maxKm * firstKmRate + (distance - maxKm) * beyondRate;

  return Number(fee.toFixed(2));
}

/**
 * Detect production schema drift for launch promo columns on orders table.
 * This allows safe fallback inserts when DB migrations were not applied yet.
 */
function isMissingLaunchPromoOrderColumnError(error) {
  if (!error) return false;

  const text =
    `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();

  return (
    text.includes("launch_promo_") &&
    (text.includes("column") ||
      text.includes("schema cache") ||
      text.includes("not found") ||
      text.includes("does not exist"))
  );
}

/**
 * Generate order number
 * Format: YYMMDD-SEQ[L]
 * Example: 260324-071W, 260324-1000P
 * Rules:
 * - Date uses Sri Lanka day boundary
 * - First order of each day starts from 071
 * - Sequence rolls from 3 digits to 4 digits after 999
 * - Random uppercase suffix letter is added for each order
 */
async function generateOrderNumber() {
  const { dateStr, start, end } = getSriLankaDayRange();
  const compactDate = `${dateStr.slice(2, 4)}${dateStr.slice(5, 7)}${dateStr.slice(8, 10)}`;

  // Count orders in the current Sri Lanka day.
  // Sequence starts from 071 for the first order each day.
  const BASE_SEQUENCE = 71;

  const { count, error } = await supabaseAdmin
    .from("orders")
    .select("*", { count: "exact", head: true })
    .gte("placed_at", start)
    .lte("placed_at", end);

  if (error) {
    console.error("Error counting orders:", error);
  }

  const sequenceNumber = (count || 0) + BASE_SEQUENCE;
  const sequenceText =
    sequenceNumber > 999
      ? sequenceNumber.toString().padStart(4, "0")
      : sequenceNumber.toString().padStart(3, "0");

  const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));

  return `${compactDate}-${sequenceText}${randomLetter}`;
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate road distance using OSRM routing API
 */
async function calculateRouteDistance(lat1, lon1, lat2, lon2) {
  try {
    const route = await getOSRMRoute(
      [
        { lat: lat1, lng: lon1, label: "Customer" },
        { lat: lat2, lng: lon2, label: "Restaurant" },
      ],
      "Order placement distance",
      { useSingleMode: true, optimize: false },
    );

    if (
      route &&
      route.isUnavailable !== true &&
      Number.isFinite(route.distance) &&
      Number.isFinite(route.duration)
    ) {
      return {
        distance: route.distance / 1000, // Convert meters to kilometers
        duration: route.duration / 60, // Convert seconds to minutes
        success: true,
      };
    }
    return {
      success: false,
      error: route?.unavailableReason || "No route found",
    };
  } catch (error) {
    console.error("OSRM routing error:", error);
    return { success: false, error: error.message };
  }
}

async function calculateRouteDistanceWithRetry(lat1, lon1, lat2, lon2) {
  const maxAttempts = 3;
  let lastError = "OSRM route unavailable";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await calculateRouteDistance(lat1, lon1, lat2, lon2);
    if (result.success) {
      return result;
    }

    lastError = result.error || lastError;
    if (attempt < maxAttempts) {
      await delay(400 * attempt);
    }
  }

  return { success: false, error: lastError };
}

const CHECKOUT_OSRM_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.CHECKOUT_OSRM_TIMEOUT_MS || "12000", 10) || 12000,
);

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(
      () =>
        resolve({
          success: false,
          error: timeoutMessage || `Timed out after ${timeoutMs}ms`,
          timedOut: true,
        }),
      timeoutMs,
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function resolveDurationFromDistance(distanceKm, durationHintMin = null) {
  const parsedHint = Number(durationHintMin);
  if (Number.isFinite(parsedHint) && parsedHint > 0) {
    return Math.max(1, Math.ceil(parsedHint));
  }

  const parsedDistance = Number(distanceKm);
  if (!Number.isFinite(parsedDistance) || parsedDistance <= 0) {
    return 10;
  }

  const minutes = (parsedDistance / 24) * 60;
  return Math.max(5, Math.ceil(minutes));
}

async function resolveCheckoutRouteMetrics({
  deliveryLat,
  deliveryLng,
  restaurantLat,
  restaurantLng,
  clientDistanceHintKm,
  clientDurationHintMin,
}) {
  const geodesicKm = haversineDistanceKm(
    deliveryLat,
    deliveryLng,
    restaurantLat,
    restaurantLng,
  );
  const parsedClientDistance = Number(clientDistanceHintKm);

  // Never trust a lower-than-geodesic client hint.
  const fallbackDistanceKm = Number(
    (Number.isFinite(parsedClientDistance) && parsedClientDistance > 0
      ? Math.max(parsedClientDistance, geodesicKm)
      : geodesicKm
    ).toFixed(2),
  );
  const fallbackDurationMin = resolveDurationFromDistance(
    fallbackDistanceKm,
    clientDurationHintMin,
  );

  const routeResult = await withTimeout(
    calculateRouteDistanceWithRetry(
      deliveryLat,
      deliveryLng,
      restaurantLat,
      restaurantLng,
    ),
    CHECKOUT_OSRM_TIMEOUT_MS,
    "OSRM timeout",
  );

  if (
    routeResult?.success &&
    Number.isFinite(Number(routeResult.distance)) &&
    Number.isFinite(Number(routeResult.duration))
  ) {
    return {
      distanceKm: Number(Number(routeResult.distance).toFixed(2)),
      durationMin: Math.max(1, Math.ceil(Number(routeResult.duration))),
      source: "osrm",
      fallbackUsed: false,
    };
  }

  console.warn(
    `[orders] Route fallback used (${routeResult?.error || "unknown error"})`,
  );

  return {
    distanceKm: fallbackDistanceKm,
    durationMin: fallbackDurationMin,
    source: "fallback",
    fallbackUsed: true,
    fallbackReason: routeResult?.error || "osrm_unavailable",
  };
}

/**
 * Valid delivery status transitions (deliveries table is source of truth)
 * Timestamp meanings:
 *   - res_accepted_at: Admin/restaurant accepted (status G�� pending)
 *   - accepted_at: Driver accepted (status G�� accepted)
 *   - rejected_at: Admin rejected (status G�� failed)
 *   - picked_up_at: Driver picked up (status G�� picked_up)
 *   - on_the_way_at: Driver on the way (status G�� on_the_way)
 *   - arrived_customer_at: Driver at customer (status G�� at_customer)
 *   - delivered_at: Delivered (status G�� delivered)
 *   - cancelled_at: Cancelled (status G�� cancelled)
 */
const VALID_DELIVERY_TRANSITIONS = {
  placed: ["pending", "failed", "cancelled"], // admin accepts G�� pending (not accepted!)
  pending: ["accepted", "failed", "cancelled"], // waiting for driver; driver can accept
  accepted: ["picked_up", "failed", "cancelled"], // driver accepted, can pick up or fail
  picked_up: ["on_the_way", "failed"],
  on_the_way: ["at_customer", "delivered", "failed"],
  at_customer: ["delivered", "failed"],
  preparing: ["ready", "failed", "cancelled"], // restaurant is preparing
  ready: ["pending", "failed", "cancelled"], // ready for driver assignment
};

const ORDER_QUOTE_VERSION = 1;
const ORDER_QUOTE_DEFAULT_TTL_MS = 5 * 60 * 1000;
const ORDER_QUOTE_TTL_MS = Math.max(
  60 * 1000,
  Number.parseInt(
    process.env.ORDER_QUOTE_TTL_MS || `${ORDER_QUOTE_DEFAULT_TTL_MS}`,
    10,
  ) || ORDER_QUOTE_DEFAULT_TTL_MS,
);

function getOrderQuoteSigningSecret() {
  return (
    process.env.ORDER_QUOTE_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

function buildCartFingerprint(cartItems = []) {
  const normalized = cartItems
    .map((item) => {
      const size = String(item?.size || "regular").toLowerCase();
      return `${String(item?.id || "")}:${String(item?.food_id || "")}:${size}:${Number(item?.quantity || 0)}`;
    })
    .sort()
    .join("|");

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function signOrderQuotePayload(encodedPayload) {
  const secret = getOrderQuoteSigningSecret();
  if (!secret) {
    throw new Error(
      "ORDER_QUOTE_SECRET (or JWT_SECRET) is required for quote signing",
    );
  }

  return crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

function createOrderQuoteToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signOrderQuotePayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyOrderQuoteToken(token) {
  if (!token || typeof token !== "string") {
    return { valid: false, error_type: "quote_invalid" };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error_type: "quote_invalid" };
  }

  const [encodedPayload, providedSignature] = parts;

  try {
    const expectedSignature = signOrderQuotePayload(encodedPayload);
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return { valid: false, error_type: "quote_invalid" };
    }

    const parsedPayload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );

    if (Number(parsedPayload?.version) !== ORDER_QUOTE_VERSION) {
      return { valid: false, error_type: "quote_invalid" };
    }

    const expiresAtMs = Date.parse(parsedPayload?.expires_at || "");
    if (!Number.isFinite(expiresAtMs)) {
      return { valid: false, error_type: "quote_invalid" };
    }

    if (Date.now() > expiresAtMs) {
      return {
        valid: false,
        error_type: "quote_expired",
        payload: parsedPayload,
      };
    }

    return { valid: true, payload: parsedPayload };
  } catch (error) {
    console.error("Quote token verification error:", error);
    return { valid: false, error_type: "quote_invalid" };
  }
}

function mapProcessedItemToQuoteItem(item) {
  return {
    food_id: item.food_id,
    food_name: item.food_name,
    food_image_url: item.food_image_url || null,
    size: item.size || "regular",
    quantity: Number(item.quantity || 1),
    customer_unit_price: roundMoney(item.customer_unit_price),
    customer_total_price: roundMoney(item.customer_total_price),
    admin_unit_price: roundMoney(item.admin_unit_price),
    admin_total_price: roundMoney(item.admin_total_price),
    commission_per_item: roundMoney(item.commission_per_item),
  };
}

// ============================================================================
// POST /orders/quote - Create server-side checkout quote snapshot
// ============================================================================

router.post("/quote", authenticate, async (req, res) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Only customers can get quotes" });
  }

  const customerId = req.user.id;
  let {
    cartId,
    delivery_latitude,
    delivery_longitude,
    delivery_address,
    delivery_city,
    payment_method,
  } = req.body;

  if (!cartId) {
    return res.status(400).json({ message: "Cart ID is required" });
  }

  if (!payment_method) {
    payment_method = "cash";
  }

  if (!["cash", "card"].includes(payment_method)) {
    return res
      .status(400)
      .json({ message: "Valid payment method is required" });
  }

  try {
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select(
        `
        id,
        customer_id,
        restaurant_id,
        status
      `,
      )
      .eq("id", cartId)
      .eq("customer_id", customerId)
      .single();

    if (cartError || !cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    if (cart.status === "completed") {
      const { data: existingOrder } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, total_amount, placed_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return res.status(409).json({
        message: "This order has already been placed",
        order: existingOrder || null,
      });
    }

    if (cart.status !== "active") {
      return res.status(400).json({ message: "Cart is not active" });
    }

    const { data: cartItems, error: itemsError } = await supabaseAdmin
      .from("cart_items")
      .select(
        `
        id,
        food_id,
        food_name,
        food_image_url,
        size,
        quantity,
        unit_price,
        total_price,
        admin_unit_price,
        admin_total_price,
        commission_per_item,
        foods (
          id,
          regular_price,
          offer_price,
          extra_price,
          extra_offer_price,
          is_available
        )
      `,
      )
      .eq("cart_id", cartId);

    if (itemsError) {
      console.error("Cart items fetch error:", itemsError);
      return res.status(500).json({ message: "Failed to fetch cart items" });
    }

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const unavailableFoodIds = cartItems
      .filter((item) => item.foods && !item.foods.is_available)
      .map((item) => item.food_name);
    if (unavailableFoodIds.length > 0) {
      return res.status(400).json({
        message: `Cannot place order. The following item(s) are currently unavailable: ${unavailableFoodIds.join(", ")}. Please remove them from your cart first.`,
        unavailable_items: unavailableFoodIds,
      });
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .select(
        `
        id,
        restaurant_name,
        address,
        city,
        latitude,
        longitude
      `,
      )
      .eq("id", cart.restaurant_id)
      .single();

    if (restaurantError || !restaurant) {
      console.error("Restaurant fetch error:", restaurantError);
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select(
        "id, username, phone, email, address, city, latitude, longitude, launch_promo_acknowledged, launch_promo_acknowledged_at",
      )
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      console.error("Customer fetch error:", customerError);
      return res.status(404).json({ message: "Customer not found" });
    }

    const { count: previousOrdersCount, error: previousOrdersError } =
      await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId);

    if (previousOrdersError) {
      console.error("Previous orders count error:", previousOrdersError);
    }

    const isFirstOrder = (previousOrdersCount || 0) === 0;

    const parsedDeliveryLat = Number(delivery_latitude);
    const parsedDeliveryLng = Number(delivery_longitude);
    const hasProvidedCoords =
      Number.isFinite(parsedDeliveryLat) && Number.isFinite(parsedDeliveryLng);

    const parsedCustomerLat = Number(customer.latitude);
    const parsedCustomerLng = Number(customer.longitude);
    const hasStoredCoords =
      Number.isFinite(parsedCustomerLat) && Number.isFinite(parsedCustomerLng);

    const payloadAddress = String(delivery_address || "").trim();
    const payloadCity = String(delivery_city || "").trim();
    const storedAddress = String(customer.address || "").trim();
    const storedCity = String(customer.city || "").trim();

    if (isFirstOrder) {
      if (!hasProvidedCoords || !payloadAddress || !payloadCity) {
        return res.status(400).json({
          message:
            "For your first order, delivery location, address, and city are required.",
          error_type: "first_order_location_required",
        });
      }
    }

    if (hasProvidedCoords) {
      delivery_latitude = parsedDeliveryLat;
      delivery_longitude = parsedDeliveryLng;
    } else if (hasStoredCoords) {
      delivery_latitude = parsedCustomerLat;
      delivery_longitude = parsedCustomerLng;
    } else {
      return res.status(400).json({
        message:
          "Delivery location is required. Please set your location before placing the order.",
        error_type: "location_required",
      });
    }

    if (
      !Number.isFinite(delivery_latitude) ||
      !Number.isFinite(delivery_longitude) ||
      delivery_latitude < -90 ||
      delivery_latitude > 90 ||
      delivery_longitude < -180 ||
      delivery_longitude > 180
    ) {
      return res.status(400).json({
        message: "Valid delivery coordinates are required",
        error_type: "invalid_delivery_coordinates",
      });
    }

    delivery_address = payloadAddress || storedAddress;
    delivery_city = payloadCity || storedCity;

    if (!delivery_address) {
      return res.status(400).json({
        message: "Delivery address is required",
        error_type: "address_required",
      });
    }

    if (!delivery_city) {
      return res.status(400).json({
        message: "Delivery city is required",
        error_type: "city_required",
      });
    }

    const routeMetrics = await resolveCheckoutRouteMetrics({
      deliveryLat: delivery_latitude,
      deliveryLng: delivery_longitude,
      restaurantLat: Number(restaurant.latitude),
      restaurantLng: Number(restaurant.longitude),
      clientDistanceHintKm: null,
      clientDurationHintMin: null,
    });

    const distanceKm = Number(routeMetrics.distanceKm);
    const estimatedDurationMin = Number(routeMetrics.durationMin);

    let customerSubtotal = 0;
    let adminSubtotal = 0;
    let commissionTotal = 0;
    const processedItems = [];

    for (const item of cartItems) {
      const food = item.foods;
      let adminPrice;
      let customerPrice;
      let commission;

      if (food) {
        const prices = await getCartItemPrices(food, item.size);
        adminPrice = prices.adminPrice;
        customerPrice = prices.customerPrice;
        commission = prices.commission;
      } else {
        adminPrice = parseFloat(item.admin_unit_price || item.unit_price);
        customerPrice = parseFloat(item.unit_price);
        commission = parseFloat(item.commission_per_item || 0);
      }

      const adminTotal = adminPrice * item.quantity;
      const customerTotal = customerPrice * item.quantity;
      const itemCommission = commission * item.quantity;

      adminSubtotal += adminTotal;
      customerSubtotal += customerTotal;
      commissionTotal += itemCommission;

      processedItems.push({
        ...item,
        admin_unit_price: adminPrice,
        admin_total_price: adminTotal,
        customer_unit_price: customerPrice,
        customer_total_price: customerTotal,
        commission_per_item: commission,
        total_commission: itemCommission,
      });
    }

    const subtotal = customerSubtotal;

    const config = await getSystemConfig();
    let orderDistanceConstraints;
    try {
      orderDistanceConstraints =
        typeof config.order_distance_constraints === "string"
          ? JSON.parse(config.order_distance_constraints)
          : config.order_distance_constraints || [];
    } catch {
      orderDistanceConstraints = [
        { min_km: 0, max_km: 5, min_subtotal: 300 },
        { min_km: 5, max_km: 10, min_subtotal: 1000 },
        { min_km: 10, max_km: 15, min_subtotal: 2000 },
        { min_km: 15, max_km: 25, min_subtotal: 3000 },
      ];
    }
    const maxOrderDistanceKm = parseFloat(config.max_order_distance_km || 25);

    if (distanceKm > maxOrderDistanceKm) {
      return res.status(400).json({
        message: `Restaurant is too far away (${distanceKm.toFixed(1)} km). Maximum ordering distance is ${maxOrderDistanceKm} km.`,
        error_type: "distance_exceeded",
        distance_km: parseFloat(distanceKm.toFixed(2)),
        max_distance_km: maxOrderDistanceKm,
      });
    }

    const sortedConstraints = [...orderDistanceConstraints].sort(
      (a, b) => a.min_km - b.min_km,
    );
    let requiredMinSubtotal = 300;
    for (const constraint of sortedConstraints) {
      if (distanceKm >= constraint.min_km && distanceKm <= constraint.max_km) {
        requiredMinSubtotal = constraint.min_subtotal;
        break;
      }
    }

    if (subtotal < requiredMinSubtotal) {
      return res.status(400).json({
        message: `Minimum order amount is Rs. ${requiredMinSubtotal} for distance ${distanceKm.toFixed(1)} km`,
        error_type: "min_subtotal",
        required_subtotal: requiredMinSubtotal,
        current_subtotal: parseFloat(subtotal.toFixed(2)),
        distance_km: parseFloat(distanceKm.toFixed(2)),
      });
    }

    const serviceFee = await calculateServiceFee(subtotal);
    const normalDeliveryFee = await calculateDeliveryFee(distanceKm);

    if (!Number.isFinite(Number(normalDeliveryFee))) {
      return res.status(503).json({
        message:
          "Unable to calculate delivery fee right now. Please retry in a few seconds.",
        error_type: "delivery_fee_unavailable",
      });
    }

    const launchPromoConfig = getLaunchPromoConfig(config);
    const launchPromoEligible =
      launchPromoConfig.enabled &&
      isFirstOrder &&
      Boolean(customer.launch_promo_acknowledged);

    let deliveryFee = normalDeliveryFee;
    let launchPromoApplied = false;
    let launchPromoDiscount = 0;

    if (launchPromoEligible) {
      const promoDeliveryFee = calculateLaunchPromoDeliveryFee(
        distanceKm,
        launchPromoConfig,
      );
      if (promoDeliveryFee !== null && Number.isFinite(promoDeliveryFee)) {
        deliveryFee = promoDeliveryFee;
        launchPromoApplied = true;
        launchPromoDiscount = Number(
          Math.max(0, normalDeliveryFee - promoDeliveryFee).toFixed(2),
        );
      }
    }

    const subtotalAmount = Number(subtotal.toFixed(2));
    const serviceFeeAmount = Number(serviceFee.toFixed(2));
    const deliveryFeeAmount = Number(deliveryFee.toFixed(2));
    const totalAmount = Number(
      (subtotalAmount + serviceFeeAmount + deliveryFeeAmount).toFixed(2),
    );

    const quoteItems = processedItems.map(mapProcessedItemToQuoteItem);
    const generatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ORDER_QUOTE_TTL_MS).toISOString();
    const quoteId = crypto.randomUUID();
    const cartFingerprint = buildCartFingerprint(cartItems);

    const quotePayload = {
      version: ORDER_QUOTE_VERSION,
      quote_id: quoteId,
      generated_at: generatedAt,
      expires_at: expiresAt,
      customer_id: customerId,
      cart_id: String(cart.id),
      restaurant_id: String(restaurant.id),
      payment_method,
      cart_fingerprint: cartFingerprint,
      delivery: {
        latitude: Number(delivery_latitude),
        longitude: Number(delivery_longitude),
        address: delivery_address,
        city: delivery_city,
      },
      route: {
        distance_km: Number(distanceKm.toFixed(2)),
        estimated_duration_min: Math.ceil(estimatedDurationMin),
      },
      pricing: {
        subtotal: subtotalAmount,
        admin_subtotal: Number(adminSubtotal.toFixed(2)),
        commission_total: Number(commissionTotal.toFixed(2)),
        service_fee: serviceFeeAmount,
        delivery_fee: deliveryFeeAmount,
        total_amount: totalAmount,
        normal_delivery_fee: Number(normalDeliveryFee.toFixed(2)),
        launch_promo_applied: launchPromoApplied,
        launch_promo_discount: Number(launchPromoDiscount.toFixed(2)),
      },
      items: quoteItems,
    };

    const quoteToken = createOrderQuoteToken(quotePayload);

    return res.json({
      message: "Checkout quote generated",
      quote: {
        quote_id: quoteId,
        quote_token: quoteToken,
        generated_at: generatedAt,
        expires_at: expiresAt,
        payment_method,
        distance_km: quotePayload.route.distance_km,
        estimated_duration_min: quotePayload.route.estimated_duration_min,
        route_source: routeMetrics.source,
        delivery: quotePayload.delivery,
        pricing: {
          subtotal: subtotalAmount,
          service_fee: serviceFeeAmount,
          delivery_fee: deliveryFeeAmount,
          total_amount: totalAmount,
          admin_subtotal: Number(adminSubtotal.toFixed(2)),
          commission_total: Number(commissionTotal.toFixed(2)),
        },
        required_min_subtotal: requiredMinSubtotal,
        launch_promo: {
          applied: launchPromoApplied,
          discount_amount: Number(launchPromoDiscount.toFixed(2)),
          normal_delivery_fee: Number(normalDeliveryFee.toFixed(2)),
          applied_delivery_fee: deliveryFeeAmount,
        },
      },
    });
  } catch (error) {
    console.error("Quote generation error:", error);
    return res
      .status(500)
      .json({ message: "Server error generating checkout quote" });
  }
});

// ============================================================================
// POST /orders/place - Place a new order
// ============================================================================

router.post("/place", authenticate, async (req, res) => {
  // Only customers can place orders
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Only customers can place orders" });
  }

  const customerId = req.user.id;
  let {
    cartId,
    delivery_latitude,
    delivery_longitude,
    delivery_address,
    delivery_city,
    payment_method,
    distance_km,
    estimated_duration_min,
    checkout_subtotal,
    checkout_service_fee,
    checkout_delivery_fee,
    checkout_total_amount,
    quote_token,
  } = req.body;

  // Validate required fields
  if (!cartId) {
    return res.status(400).json({ message: "Cart ID is required" });
  }

  // Payment method defaults to cash
  if (!payment_method) {
    payment_method = "cash";
  }

  if (!["cash", "card"].includes(payment_method)) {
    return res
      .status(400)
      .json({ message: "Valid payment method is required" });
  }

  let validatedQuote = null;
  if (typeof quote_token === "string" && quote_token.trim()) {
    const quoteVerification = verifyOrderQuoteToken(quote_token.trim());
    if (!quoteVerification.valid) {
      const errorType = quoteVerification.error_type || "quote_invalid";
      const message =
        errorType === "quote_expired"
          ? "Checkout quote expired. Please refresh checkout and place again."
          : "Checkout quote is invalid. Please refresh checkout and try again.";

      return res.status(409).json({
        message,
        error_type: errorType,
      });
    }

    validatedQuote = quoteVerification.payload;
  }

  let cartLocked = false;
  let pricingAdjusted = false;
  let checkoutPricingSnapshot = null;
  let serverPricingSnapshot = null;

  try {
    // ========================================================================
    // STEP 1: Fetch and validate cart (with atomic check)
    // ========================================================================

    // First, fetch the cart to validate it exists and is active
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select(
        `
        id,
        customer_id,
        restaurant_id,
        status
      `,
      )
      .eq("id", cartId)
      .eq("customer_id", customerId)
      .single();

    if (cartError || !cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Check if cart is already completed (duplicate order prevention)
    if (cart.status === "completed") {
      // Try to find the existing order for this customer
      const { data: existingOrder } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, total_amount, placed_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return res.status(409).json({
        message: "This order has already been placed",
        order: existingOrder || null,
      });
    }

    if (cart.status !== "active") {
      return res.status(400).json({ message: "Cart is not active" });
    }

    if (validatedQuote) {
      if (String(validatedQuote.customer_id) !== String(customerId)) {
        return res.status(403).json({
          message: "Quote does not belong to this customer",
          error_type: "quote_invalid",
        });
      }

      if (String(validatedQuote.cart_id) !== String(cartId)) {
        return res.status(400).json({
          message: "Quote does not match the selected cart",
          error_type: "quote_invalid",
        });
      }

      if (String(validatedQuote.restaurant_id) !== String(cart.restaurant_id)) {
        return res.status(409).json({
          message: "Quote is stale. Please refresh checkout and try again.",
          error_type: "quote_invalid",
        });
      }

      if (
        validatedQuote.payment_method &&
        String(validatedQuote.payment_method) !== String(payment_method)
      ) {
        return res.status(400).json({
          message:
            "Payment method changed after quote generation. Please refresh checkout.",
          error_type: "quote_invalid",
        });
      }

      const { data: currentCartItems, error: currentItemsError } =
        await supabaseAdmin
          .from("cart_items")
          .select(
            `
            id,
            food_id,
            food_name,
            food_image_url,
            size,
            quantity,
            foods (
              id,
              is_available
            )
          `,
          )
          .eq("cart_id", cartId);

      if (currentItemsError) {
        console.error("Current cart items fetch error:", currentItemsError);
        return res.status(500).json({ message: "Failed to fetch cart items" });
      }

      if (!currentCartItems || currentCartItems.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }

      const unavailableFoodIds = currentCartItems
        .filter((item) => item.foods && !item.foods.is_available)
        .map((item) => item.food_name);
      if (unavailableFoodIds.length > 0) {
        return res.status(400).json({
          message: `Cannot place order. The following item(s) are currently unavailable: ${unavailableFoodIds.join(", ")}. Please remove them from your cart first.`,
          unavailable_items: unavailableFoodIds,
        });
      }

      const currentCartFingerprint = buildCartFingerprint(currentCartItems);
      if (
        !validatedQuote.cart_fingerprint ||
        validatedQuote.cart_fingerprint !== currentCartFingerprint
      ) {
        return res.status(409).json({
          message:
            "Your cart changed after the quote was generated. Please review checkout and place again.",
          error_type: "quote_cart_changed",
        });
      }

      const quoteDelivery = validatedQuote.delivery || {};
      const quotedLat = Number(quoteDelivery.latitude);
      const quotedLng = Number(quoteDelivery.longitude);
      const quotedAddress = String(quoteDelivery.address || "").trim();
      const quotedCity = String(quoteDelivery.city || "").trim();

      if (
        !Number.isFinite(quotedLat) ||
        !Number.isFinite(quotedLng) ||
        quotedLat < -90 ||
        quotedLat > 90 ||
        quotedLng < -180 ||
        quotedLng > 180 ||
        !quotedAddress ||
        !quotedCity
      ) {
        return res.status(409).json({
          message: "Checkout quote is invalid. Please refresh checkout.",
          error_type: "quote_invalid",
        });
      }

      const quoteRoute = validatedQuote.route || {};
      const quotedDistanceKm = Number(quoteRoute.distance_km);
      const quotedEtaMin = Number(quoteRoute.estimated_duration_min);
      if (
        !Number.isFinite(quotedDistanceKm) ||
        quotedDistanceKm < 0 ||
        !Number.isFinite(quotedEtaMin) ||
        quotedEtaMin < 0
      ) {
        return res.status(409).json({
          message: "Checkout quote is invalid. Please refresh checkout.",
          error_type: "quote_invalid",
        });
      }

      const quoteItemsRaw = Array.isArray(validatedQuote.items)
        ? validatedQuote.items
        : [];
      if (quoteItemsRaw.length === 0) {
        return res.status(409).json({
          message: "Checkout quote is invalid. Please refresh checkout.",
          error_type: "quote_invalid",
        });
      }

      const processedItems = quoteItemsRaw.map((item) => {
        const quantity = Number(item.quantity || 1);
        const customerUnitPrice = roundMoney(item.customer_unit_price);
        const adminUnitPrice = roundMoney(item.admin_unit_price);
        const customerTotalPrice = roundMoney(
          item.customer_total_price ?? customerUnitPrice * quantity,
        );
        const adminTotalPrice = roundMoney(
          item.admin_total_price ?? adminUnitPrice * quantity,
        );
        const commissionPerItem = roundMoney(
          item.commission_per_item ?? customerUnitPrice - adminUnitPrice,
        );

        return {
          food_id: item.food_id,
          food_name: String(item.food_name || "Item"),
          food_image_url: item.food_image_url || null,
          size: item.size || "regular",
          quantity,
          customer_unit_price: customerUnitPrice,
          customer_total_price: customerTotalPrice,
          admin_unit_price: adminUnitPrice,
          admin_total_price: adminTotalPrice,
          commission_per_item: commissionPerItem,
        };
      });

      const hasInvalidQuoteItems = processedItems.some(
        (item) =>
          !item.food_id ||
          !Number.isFinite(item.quantity) ||
          item.quantity < 1 ||
          !Number.isFinite(item.customer_unit_price) ||
          !Number.isFinite(item.customer_total_price) ||
          !Number.isFinite(item.admin_unit_price) ||
          !Number.isFinite(item.admin_total_price) ||
          !Number.isFinite(item.commission_per_item),
      );

      if (hasInvalidQuoteItems) {
        return res.status(409).json({
          message: "Checkout quote is invalid. Please refresh checkout.",
          error_type: "quote_invalid",
        });
      }

      const computedCustomerSubtotal = roundMoney(
        processedItems.reduce(
          (sum, item) => sum + item.customer_total_price,
          0,
        ),
      );
      const computedAdminSubtotal = roundMoney(
        processedItems.reduce((sum, item) => sum + item.admin_total_price, 0),
      );
      const computedCommissionTotal = roundMoney(
        processedItems.reduce(
          (sum, item) => sum + item.commission_per_item * item.quantity,
          0,
        ),
      );

      const quotePricing = validatedQuote.pricing || {};
      const subtotalAmount = roundMoney(quotePricing.subtotal);
      const adminSubtotal = roundMoney(
        quotePricing.admin_subtotal ?? computedAdminSubtotal,
      );
      const commissionTotal = roundMoney(
        quotePricing.commission_total ?? computedCommissionTotal,
      );
      const serviceFeeAmount = roundMoney(quotePricing.service_fee);
      const deliveryFeeAmount = roundMoney(quotePricing.delivery_fee);
      const totalAmount = roundMoney(quotePricing.total_amount);

      if (
        !Number.isFinite(subtotalAmount) ||
        !Number.isFinite(adminSubtotal) ||
        !Number.isFinite(commissionTotal) ||
        !Number.isFinite(serviceFeeAmount) ||
        !Number.isFinite(deliveryFeeAmount) ||
        !Number.isFinite(totalAmount)
      ) {
        return res.status(409).json({
          message: "Checkout quote is invalid. Please refresh checkout.",
          error_type: "quote_invalid",
        });
      }

      const computedTotalFromPricing = roundMoney(
        subtotalAmount + serviceFeeAmount + deliveryFeeAmount,
      );
      if (
        Math.abs(subtotalAmount - computedCustomerSubtotal) > 0.05 ||
        Math.abs(adminSubtotal - computedAdminSubtotal) > 0.05 ||
        Math.abs(commissionTotal - computedCommissionTotal) > 0.05 ||
        Math.abs(totalAmount - computedTotalFromPricing) > 0.05
      ) {
        return res.status(409).json({
          message: "Checkout quote is invalid. Please refresh checkout.",
          error_type: "quote_invalid",
        });
      }

      const launchPromoApplied = Boolean(quotePricing.launch_promo_applied);
      const launchPromoDiscount = roundMoney(
        quotePricing.launch_promo_discount || 0,
      );
      const normalDeliveryFee = roundMoney(
        quotePricing.normal_delivery_fee ?? deliveryFeeAmount,
      );

      if (
        !Number.isFinite(launchPromoDiscount) ||
        !Number.isFinite(normalDeliveryFee)
      ) {
        return res.status(409).json({
          message: "Checkout quote is invalid. Please refresh checkout.",
          error_type: "quote_invalid",
        });
      }

      const { data: restaurant, error: restaurantError } = await supabaseAdmin
        .from("restaurants")
        .select(
          `
          id,
          restaurant_name,
          address,
          city,
          latitude,
          longitude
        `,
        )
        .eq("id", cart.restaurant_id)
        .single();

      if (restaurantError || !restaurant) {
        console.error("Restaurant fetch error:", restaurantError);
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const { data: customer, error: customerError } = await supabaseAdmin
        .from("customers")
        .select(
          "id, username, phone, email, address, city, latitude, longitude",
        )
        .eq("id", customerId)
        .single();

      if (customerError || !customer) {
        console.error("Customer fetch error:", customerError);
        return res.status(404).json({ message: "Customer not found" });
      }

      const { data: lockedCart, error: lockError } = await supabaseAdmin
        .from("carts")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", cartId)
        .eq("customer_id", customerId)
        .eq("status", "active")
        .select("id")
        .maybeSingle();

      if (lockError) {
        console.error("Cart lock error:", lockError);
        return res
          .status(409)
          .json({ message: "Order is being processed, please wait" });
      }

      if (!lockedCart) {
        const { data: existingOrder } = await supabaseAdmin
          .from("orders")
          .select("id, order_number, status, total_amount, placed_at")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        return res.status(409).json({
          message: "This order has already been placed",
          order: existingOrder || null,
        });
      }

      cartLocked = true;

      const orderNumber = await generateOrderNumber();

      delivery_latitude = quotedLat;
      delivery_longitude = quotedLng;
      delivery_address = quotedAddress;
      delivery_city = quotedCity;
      distance_km = quotedDistanceKm;
      estimated_duration_min = quotedEtaMin;

      const baseOrderPayload = {
        cart_id: cartId,
        order_number: orderNumber,
        customer_id: customerId,
        customer_name: customer.username || "Customer",
        customer_phone: customer.phone || "",
        customer_email: customer.email,
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.restaurant_name,
        restaurant_address: restaurant.address,
        restaurant_latitude: restaurant.latitude,
        restaurant_longitude: restaurant.longitude,
        delivery_address: delivery_address,
        delivery_city: delivery_city || "",
        delivery_latitude: delivery_latitude,
        delivery_longitude: delivery_longitude,
        subtotal: subtotalAmount.toFixed(2),
        admin_subtotal: adminSubtotal.toFixed(2),
        commission_total: commissionTotal.toFixed(2),
        delivery_fee: deliveryFeeAmount.toFixed(2),
        service_fee: serviceFeeAmount.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        distance_km: distance_km.toFixed(2),
        estimated_duration_min: Math.ceil(estimated_duration_min),
        payment_method: payment_method,
        payment_status: payment_method === "cash" ? "pending" : "pending",
        placed_at: new Date().toISOString(),
      };

      const orderPayloadWithPromo = {
        ...baseOrderPayload,
        launch_promo_applied: launchPromoApplied,
        launch_promo_discount: launchPromoDiscount.toFixed(2),
        launch_promo_delivery_fee: launchPromoApplied
          ? deliveryFeeAmount.toFixed(2)
          : null,
      };

      let orderInsertResult = await supabaseAdmin
        .from("orders")
        .insert(orderPayloadWithPromo)
        .select()
        .single();

      if (isMissingLaunchPromoOrderColumnError(orderInsertResult.error)) {
        orderInsertResult = await supabaseAdmin
          .from("orders")
          .insert(baseOrderPayload)
          .select()
          .single();
      }

      const { data: order, error: orderError } = orderInsertResult;

      if (orderError) {
        console.error("Order insert error:", orderError);
        await supabaseAdmin
          .from("carts")
          .update({ status: "active" })
          .eq("id", cartId);
        cartLocked = false;
        return res.status(500).json({ message: "Failed to create order" });
      }

      const orderItems = processedItems.map((item) => ({
        order_id: order.id,
        food_id: item.food_id,
        food_name: item.food_name,
        food_image_url: item.food_image_url,
        size: item.size || "regular",
        quantity: item.quantity,
        unit_price: item.customer_unit_price,
        total_price: item.customer_total_price,
        admin_unit_price: item.admin_unit_price,
        admin_total_price: item.admin_total_price,
        commission_per_item: item.commission_per_item,
      }));

      const { error: itemsInsertError } = await supabaseAdmin
        .from("order_items")
        .insert(orderItems);

      if (itemsInsertError) {
        console.error("Order items insert error:", itemsInsertError);
        await supabaseAdmin.from("orders").delete().eq("id", order.id);
        await supabaseAdmin
          .from("carts")
          .update({ status: "active" })
          .eq("id", cartId);
        cartLocked = false;
        return res
          .status(500)
          .json({ message: "Failed to create order items" });
      }

      const { error: deliveryError } = await supabaseAdmin
        .from("deliveries")
        .insert({
          order_id: order.id,
          status: "placed",
        });

      if (deliveryError) {
        console.error("Delivery insert error:", deliveryError);
      }

      const { data: admins } = await supabaseAdmin
        .from("admins")
        .select("id")
        .eq("restaurant_id", restaurant.id);

      if (admins && admins.length > 0) {
        const itemsSummary = processedItems
          .map((item) => {
            const size =
              item.size && item.size !== "regular" ? ` (${item.size})` : "";
            return `${item.quantity}x ${item.food_name}${size}`;
          })
          .join(", ");

        const itemDetails = processedItems.map((item) => ({
          food_name: item.food_name,
          size: item.size || "regular",
          quantity: Number(item.quantity || 1),
          unit_price: Number(item.admin_unit_price || 0),
          total_price: Number(item.admin_total_price || 0),
          food_image: item.food_image_url || null,
        }));

        const firstItemImage = processedItems[0]?.food_image_url || null;
        const firstItemSize = processedItems[0]?.size || "regular";

        for (const admin of admins) {
          notifyAdmin(admin.id, "order:new_order", {
            type: "new_order",
            title: "New Order Arrived!",
            message: itemsSummary,
            order_id: order.id,
            order_number: orderNumber,
            items_summary: itemsSummary,
            items_count: processedItems.length,
            items_details: itemDetails,
            first_item_size: firstItemSize,
            restaurant_total: parseFloat(adminSubtotal || 0),
            total_amount: totalAmount,
            customer_name: customer.username,
            food_image: firstItemImage,
            restaurant_id: restaurant.id,
          });
        }

        const adminIds = admins.map((a) => a.id);
        try {
          const pushResult = await sendNewOrderNotification(
            restaurant.id,
            {
              orderId: order.id,
              orderNumber,
              customerName: customer.username,
              itemsCount: processedItems.length,
              totalAmount,
              restaurantAmount: adminSubtotal,
              itemsSummary,
            },
            adminIds,
          );
          console.log("Push notification result:", JSON.stringify(pushResult));
        } catch (err) {
          console.error("Push notify error (non-fatal):", err);
        }
      }

      return res.status(201).json({
        message: "Order placed successfully",
        order: {
          id: order.id,
          order_number: order.order_number,
          restaurant_name: restaurant.restaurant_name,
          items_count: processedItems.length,
          subtotal: parseFloat(order.subtotal),
          delivery_fee: parseFloat(order.delivery_fee),
          service_fee: parseFloat(order.service_fee),
          total_amount: parseFloat(order.total_amount),
          launch_promo: {
            applied: launchPromoApplied,
            discount_amount: launchPromoDiscount,
            normal_delivery_fee: Number(normalDeliveryFee.toFixed(2)),
            applied_delivery_fee: Number(deliveryFeeAmount.toFixed(2)),
          },
          pricing_source: "quote",
          quote_id: validatedQuote.quote_id || null,
          pricing_adjusted: false,
          checkout_pricing: null,
          server_pricing: null,
          payment_method: order.payment_method,
          estimated_duration_min: order.estimated_duration_min,
          placed_at: order.placed_at,
        },
      });
    }

    // NOTE: Cart lock intentionally happens after all validations/pricing checks.
    // This avoids leaving carts stuck as "completed" when validation fails.

    // ========================================================================
    // STEP 2: Fetch cart items with food details and commission info
    // ========================================================================
    const { data: cartItems, error: itemsError } = await supabaseAdmin
      .from("cart_items")
      .select(
        `
        id,
        food_id,
        food_name,
        food_image_url,
        size,
        quantity,
        unit_price,
        total_price,
        admin_unit_price,
        admin_total_price,
        commission_per_item,
        foods (
          id,
          regular_price,
          offer_price,
          extra_price,
          extra_offer_price,
          is_available
        )
      `,
      )
      .eq("cart_id", cartId);

    if (itemsError) {
      console.error("Cart items fetch error:", itemsError);
      return res.status(500).json({ message: "Failed to fetch cart items" });
    }

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Check if any cart items have unavailable foods
    const unavailableFoodIds = cartItems
      .filter((item) => item.foods && !item.foods.is_available)
      .map((item) => item.food_name);
    if (unavailableFoodIds.length > 0) {
      return res.status(400).json({
        message: `Cannot place order. The following item(s) are currently unavailable: ${unavailableFoodIds.join(", ")}. Please remove them from your cart first.`,
        unavailable_items: unavailableFoodIds,
      });
    }

    // ========================================================================
    // STEP 3: Fetch restaurant details
    // ========================================================================
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .select(
        `
        id,
        restaurant_name,
        address,
        city,
        latitude,
        longitude
      `,
      )
      .eq("id", cart.restaurant_id)
      .single();

    if (restaurantError || !restaurant) {
      console.error("Restaurant fetch error:", restaurantError);
      console.error("Cart restaurant_id:", cart.restaurant_id);
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // ========================================================================
    // STEP 4: Fetch customer details
    // ========================================================================
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select(
        "id, username, phone, email, address, city, latitude, longitude, launch_promo_acknowledged, launch_promo_acknowledged_at",
      )
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      console.error("Customer fetch error:", customerError);
      return res.status(404).json({ message: "Customer not found" });
    }

    // ========================================================================
    // STEP 4.5: Resolve delivery location/address and enforce first-order input
    // ========================================================================
    const { count: previousOrdersCount, error: previousOrdersError } =
      await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId);

    if (previousOrdersError) {
      console.error("Previous orders count error:", previousOrdersError);
    }

    const isFirstOrder = (previousOrdersCount || 0) === 0;

    const parsedDeliveryLat = Number(delivery_latitude);
    const parsedDeliveryLng = Number(delivery_longitude);
    const hasProvidedCoords =
      Number.isFinite(parsedDeliveryLat) && Number.isFinite(parsedDeliveryLng);

    const parsedCustomerLat = Number(customer.latitude);
    const parsedCustomerLng = Number(customer.longitude);
    const hasStoredCoords =
      Number.isFinite(parsedCustomerLat) && Number.isFinite(parsedCustomerLng);

    const payloadAddress = String(delivery_address || "").trim();
    const payloadCity = String(delivery_city || "").trim();
    const storedAddress = String(customer.address || "").trim();
    const storedCity = String(customer.city || "").trim();

    if (isFirstOrder) {
      if (!hasProvidedCoords || !payloadAddress || !payloadCity) {
        return res.status(400).json({
          message:
            "For your first order, delivery location, address, and city are required.",
          error_type: "first_order_location_required",
        });
      }
    }

    if (hasProvidedCoords) {
      delivery_latitude = parsedDeliveryLat;
      delivery_longitude = parsedDeliveryLng;
    } else if (hasStoredCoords) {
      delivery_latitude = parsedCustomerLat;
      delivery_longitude = parsedCustomerLng;
    } else {
      return res.status(400).json({
        message:
          "Delivery location is required. Please set your location before placing the order.",
        error_type: "location_required",
      });
    }

    if (
      !Number.isFinite(delivery_latitude) ||
      !Number.isFinite(delivery_longitude) ||
      delivery_latitude < -90 ||
      delivery_latitude > 90 ||
      delivery_longitude < -180 ||
      delivery_longitude > 180
    ) {
      return res.status(400).json({
        message: "Valid delivery coordinates are required",
        error_type: "invalid_delivery_coordinates",
      });
    }

    delivery_address = payloadAddress || storedAddress;
    delivery_city = payloadCity || storedCity;

    if (!delivery_address) {
      return res.status(400).json({
        message: "Delivery address is required",
        error_type: "address_required",
      });
    }

    if (!delivery_city) {
      return res.status(400).json({
        message: "Delivery city is required",
        error_type: "city_required",
      });
    }

    // ========================================================================
    // STEP 4.6: Server-side OSRM distance calculation (non-quote path only)
    // NOTE: When quote_token is provided (handled above), distance already comes
    // from the signed JWT — execution never reaches this point.
    // For the non-quote fallback we ALWAYS call OSRM server-side.
    // Client-sent distance_km is logged only for debugging, never trusted.
    // ========================================================================
    const clientDistanceHint = Number(distance_km);
    if (Number.isFinite(clientDistanceHint) && clientDistanceHint > 0) {
      console.log(
        `[orders/place] Client distance hint: ${clientDistanceHint.toFixed(2)} km (not trusted, computing server-side)`,
      );
    }

    const routeMetrics = await resolveCheckoutRouteMetrics({
      deliveryLat: delivery_latitude,
      deliveryLng: delivery_longitude,
      restaurantLat: Number(restaurant.latitude),
      restaurantLng: Number(restaurant.longitude),
      clientDistanceHintKm: clientDistanceHint,
      clientDurationHintMin: Number(estimated_duration_min),
    });

    distance_km = Number(routeMetrics.distanceKm);
    estimated_duration_min = Number(routeMetrics.durationMin);
    console.log(
      `[orders/place] Route (${routeMetrics.source}): ${distance_km.toFixed(2)} km, ${estimated_duration_min.toFixed(1)} min`,
    );

    // ========================================================================
    // STEP 5: Compute item commissions + fees entirely server-side
    // Financial amounts are NEVER trusted from the client.
    // The quote_token path (above) already handled secure cases with signed pricing.
    // This fallback path computes everything from scratch on the server.
    // ========================================================================

    // Re-compute item prices from current food prices (prevents price tampering)
    let customerSubtotal = 0;
    let adminSubtotal = 0;
    let commissionTotal = 0;

    const processedItems = [];
    for (const item of cartItems) {
      const food = item.foods;
      let adminPrice, customerPrice, commission;

      if (food) {
        const prices = await getCartItemPrices(food, item.size);
        adminPrice = prices.adminPrice;
        customerPrice = prices.customerPrice;
        commission = prices.commission;
      } else {
        adminPrice = parseFloat(item.admin_unit_price || item.unit_price);
        customerPrice = parseFloat(item.unit_price);
        commission = parseFloat(item.commission_per_item || 0);
      }

      const adminTotal = adminPrice * item.quantity;
      const customerTotal = customerPrice * item.quantity;
      const itemCommission = commission * item.quantity;

      adminSubtotal += adminTotal;
      customerSubtotal += customerTotal;
      commissionTotal += itemCommission;

      processedItems.push({
        ...item,
        admin_unit_price: adminPrice,
        admin_total_price: adminTotal,
        customer_unit_price: customerPrice,
        customer_total_price: customerTotal,
        commission_per_item: commission,
        total_commission: itemCommission,
      });
    }

    const subtotal = customerSubtotal;

    // Validate distance constraints
    const config = await getSystemConfig();
    let orderDistanceConstraints;
    try {
      orderDistanceConstraints =
        typeof config.order_distance_constraints === "string"
          ? JSON.parse(config.order_distance_constraints)
          : config.order_distance_constraints || [];
    } catch {
      orderDistanceConstraints = [
        { min_km: 0, max_km: 5, min_subtotal: 300 },
        { min_km: 5, max_km: 10, min_subtotal: 1000 },
        { min_km: 10, max_km: 15, min_subtotal: 2000 },
        { min_km: 15, max_km: 25, min_subtotal: 3000 },
      ];
    }
    const maxOrderDistanceKm = parseFloat(config.max_order_distance_km || 25);

    if (distance_km > maxOrderDistanceKm) {
      return res.status(400).json({
        message: `Restaurant is too far away (${distance_km.toFixed(1)} km). Maximum ordering distance is ${maxOrderDistanceKm} km.`,
        error_type: "distance_exceeded",
        distance_km: parseFloat(distance_km.toFixed(2)),
        max_distance_km: maxOrderDistanceKm,
      });
    }

    const sortedConstraints = [...orderDistanceConstraints].sort(
      (a, b) => a.min_km - b.min_km,
    );
    let requiredMinSubtotal = 300;
    for (const constraint of sortedConstraints) {
      if (
        distance_km >= constraint.min_km &&
        distance_km <= constraint.max_km
      ) {
        requiredMinSubtotal = constraint.min_subtotal;
        break;
      }
    }

    if (subtotal < requiredMinSubtotal) {
      return res.status(400).json({
        message: `Minimum order amount is Rs. ${requiredMinSubtotal} for distance ${distance_km.toFixed(1)} km`,
        error_type: "min_subtotal",
        required_subtotal: requiredMinSubtotal,
        current_subtotal: parseFloat(subtotal.toFixed(2)),
        distance_km: parseFloat(distance_km.toFixed(2)),
      });
    }

    // Compute all fees server-side — client-sent pricing values are ignored entirely
    const serviceFee = await calculateServiceFee(subtotal);
    const normalDeliveryFee = await calculateDeliveryFee(distance_km);

    const launchPromoConfig = getLaunchPromoConfig(config);
    const launchPromoEligible =
      launchPromoConfig.enabled &&
      isFirstOrder &&
      Boolean(customer.launch_promo_acknowledged);

    let deliveryFee = normalDeliveryFee;
    let launchPromoApplied = false;
    let launchPromoDiscount = 0;

    if (launchPromoEligible) {
      const promoDeliveryFee = calculateLaunchPromoDeliveryFee(
        distance_km,
        launchPromoConfig,
      );
      if (promoDeliveryFee !== null && Number.isFinite(promoDeliveryFee)) {
        deliveryFee = promoDeliveryFee;
        launchPromoApplied = true;
        launchPromoDiscount = Number(
          Math.max(0, normalDeliveryFee - promoDeliveryFee).toFixed(2),
        );
      }
    }

    const subtotalAmount = Number(subtotal.toFixed(2));
    const serviceFeeAmount = Number(serviceFee.toFixed(2));
    const deliveryFeeAmount = Number(deliveryFee.toFixed(2));
    const totalAmount = Number(
      (subtotalAmount + serviceFeeAmount + deliveryFeeAmount).toFixed(2),
    );

    serverPricingSnapshot = {
      subtotal: subtotalAmount,
      service_fee: serviceFeeAmount,
      delivery_fee: deliveryFeeAmount,
      total_amount: totalAmount,
      distance_km: Number(distance_km.toFixed(2)),
      estimated_duration_min: Math.ceil(estimated_duration_min),
      route_source: routeMetrics.source,
    };

    console.log(
      `[orders/place] Server-computed amounts: subtotal=${subtotalAmount}, service=${serviceFeeAmount}, delivery=${deliveryFeeAmount}, total=${totalAmount}`,
    );

    // ========================================================================
    // STEP 6: Acquire cart lock (atomic idempotency gate)
    // ========================================================================
    const { data: lockedCart, error: lockError } = await supabaseAdmin
      .from("carts")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", cartId)
      .eq("customer_id", customerId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (lockError) {
      console.error("Cart lock error:", lockError);
      return res
        .status(409)
        .json({ message: "Order is being processed, please wait" });
    }

    if (!lockedCart) {
      const { data: existingOrder } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, status, total_amount, placed_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      return res.status(409).json({
        message: "This order has already been placed",
        order: existingOrder || null,
      });
    }

    cartLocked = true;

    // ========================================================================
    // STEP 7: Generate order number
    // ========================================================================
    const orderNumber = await generateOrderNumber();

    // ========================================================================
    // STEP 8: Create order (atomic transaction using Supabase)
    // ========================================================================

    // Insert order
    const baseOrderPayload = {
      cart_id: cartId,
      order_number: orderNumber,
      customer_id: customerId,
      customer_name: customer.username || "Customer",
      customer_phone: customer.phone || "",
      customer_email: customer.email,
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.restaurant_name,
      restaurant_address: restaurant.address,
      restaurant_latitude: restaurant.latitude,
      restaurant_longitude: restaurant.longitude,
      delivery_address: delivery_address,
      delivery_city: delivery_city || "",
      delivery_latitude: delivery_latitude,
      delivery_longitude: delivery_longitude,
      subtotal: subtotalAmount.toFixed(2),
      admin_subtotal: adminSubtotal.toFixed(2),
      commission_total: commissionTotal.toFixed(2),
      delivery_fee: deliveryFeeAmount.toFixed(2),
      service_fee: serviceFeeAmount.toFixed(2),
      total_amount: totalAmount.toFixed(2),
      distance_km: distance_km.toFixed(2),
      estimated_duration_min: Math.ceil(estimated_duration_min),
      payment_method: payment_method,
      payment_status: payment_method === "cash" ? "pending" : "pending",
      placed_at: new Date().toISOString(),
    };

    const orderPayloadWithPromo = {
      ...baseOrderPayload,
      launch_promo_applied: launchPromoApplied,
      launch_promo_discount: launchPromoDiscount.toFixed(2),
      launch_promo_delivery_fee: launchPromoApplied
        ? deliveryFeeAmount.toFixed(2)
        : null,
    };

    let orderInsertResult = await supabaseAdmin
      .from("orders")
      .insert(orderPayloadWithPromo)
      .select()
      .single();

    if (isMissingLaunchPromoOrderColumnError(orderInsertResult.error)) {
      console.warn(
        "Launch promo columns missing on orders table; retrying order insert without promo snapshot fields.",
      );
      orderInsertResult = await supabaseAdmin
        .from("orders")
        .insert(baseOrderPayload)
        .select()
        .single();
    }

    const { data: order, error: orderError } = orderInsertResult;

    if (orderError) {
      console.error("Order insert error:", orderError);
      // Rollback: reset cart status to active
      await supabaseAdmin
        .from("carts")
        .update({ status: "active" })
        .eq("id", cartId);
      cartLocked = false;
      return res.status(500).json({ message: "Failed to create order" });
    }

    // ========================================================================
    // STEP 9: Insert order items with commission data (snapshot from cart)
    // ========================================================================
    const orderItems = processedItems.map((item) => ({
      order_id: order.id,
      food_id: item.food_id,
      food_name: item.food_name,
      food_image_url: item.food_image_url,
      size: item.size || "regular",
      quantity: item.quantity,
      unit_price: item.customer_unit_price,
      total_price: item.customer_total_price,
      admin_unit_price: item.admin_unit_price,
      admin_total_price: item.admin_total_price,
      commission_per_item: item.commission_per_item,
    }));

    const { error: itemsInsertError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems);

    if (itemsInsertError) {
      console.error("Order items insert error:", itemsInsertError);
      // Rollback: delete the order and reset cart status
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      await supabaseAdmin
        .from("carts")
        .update({ status: "active" })
        .eq("id", cartId);
      cartLocked = false;
      return res.status(500).json({ message: "Failed to create order items" });
    }

    // ========================================================================
    // STEP 10: Create delivery record
    // ========================================================================
    const { error: deliveryError } = await supabaseAdmin
      .from("deliveries")
      .insert({
        order_id: order.id,
        status: "placed",
      });

    if (deliveryError) {
      console.error("Delivery insert error:", deliveryError);
      // Continue anyway, delivery record can be created later
    }

    // ========================================================================
    // STEP 11: Create notification for restaurant
    // ========================================================================

    // Get restaurant admin IDs
    const { data: admins, error: adminsError } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("restaurant_id", restaurant.id);

    console.log("=��� Found admins for restaurant:", {
      restaurant_id: restaurant.id,
      admins,
      error: adminsError,
    });

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin) => ({
        recipient_id: admin.id,
        recipient_role: "admin",
        type: "new_order",
        title: "New Order Received!",
        message: `Order ${orderNumber} - ${
          cartItems.length
        } item(s) - Rs. ${totalAmount.toFixed(2)}`,
        order_id: order.id,
        restaurant_id: restaurant.id,
        is_read: false,
        metadata: {
          order_number: orderNumber,
          customer_name: customer.username,
          items_count: cartItems.length,
          total_amount: totalAmount,
        },
      }));

      console.log("=��� Creating notifications:", notifications);

      // Notifications are now handled by push notification service
      // which automatically logs to notification_log table
      // const { data: insertedNotifs, error: notifError } = await supabaseAdmin
      //   .from("notifications")
      //   .insert(notifications)
      //   .select();

      // if (notifError) {
      //   console.error("G�� Notification insert error:", notifError);
      //   // Continue anyway
      // } else {
      //   console.log("G�� Notifications created successfully:", insertedNotifs);
      // }

      // =��� WebSocket: Notify each online admin in real-time
      const itemsSummary = processedItems
        .map((item) => {
          const size =
            item.size && item.size !== "regular" ? ` (${item.size})` : "";
          return `${item.quantity}x ${item.food_name}${size}`;
        })
        .join(", ");
      const itemDetails = processedItems.map((item) => ({
        food_name: item.food_name,
        size: item.size || "regular",
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.admin_unit_price || item.unit_price || 0),
        total_price: Number(item.admin_total_price || item.total_price || 0),
        food_image: item.food_image_url || null,
      }));
      const firstItemImage = processedItems[0]?.food_image_url || null;
      const firstItemSize = processedItems[0]?.size || "regular";

      for (const admin of admins) {
        notifyAdmin(admin.id, "order:new_order", {
          type: "new_order",
          title: "New Order Arrived!",
          message: itemsSummary,
          order_id: order.id,
          order_number: orderNumber,
          items_summary: itemsSummary,
          items_count: processedItems.length,
          items_details: itemDetails,
          first_item_size: firstItemSize,
          restaurant_total: parseFloat(adminSubtotal || 0),
          total_amount: totalAmount,
          customer_name: customer.username,
          food_image: firstItemImage,
          restaurant_id: restaurant.id,
        });
      }

      // =��� PUSH NOTIFICATION: Notify admin even when app is closed/phone locked
      // Pass admin IDs directly to avoid redundant DB lookup
      const adminIds = admins.map((a) => a.id);
      console.log(
        "=��� Calling sendNewOrderNotification for restaurant:",
        restaurant.id,
        "admins:",
        adminIds,
      );
      try {
        const pushResult = await sendNewOrderNotification(
          restaurant.id,
          {
            orderId: order.id,
            orderNumber,
            customerName: customer.username,
            itemsCount: processedItems.length,
            totalAmount,
            restaurantAmount: adminSubtotal, // restaurant's share (excl. commission/fees)
            itemsSummary,
          },
          adminIds,
        );
        console.log(
          "G�� Push notification result:",
          JSON.stringify(pushResult),
        );
      } catch (err) {
        console.error("G�� Push notify error (non-fatal):", err);
      }
    } else {
      console.log("G��n+� No admins found for restaurant");
    }

    // ========================================================================
    // STEP 12: Return success response
    // (Cart was already marked as completed at the start for idempotency)
    // ========================================================================
    return res.status(201).json({
      message: "Order placed successfully",
      order: {
        id: order.id,
        order_number: order.order_number,
        restaurant_name: restaurant.restaurant_name,
        items_count: cartItems.length,
        subtotal: parseFloat(order.subtotal),
        delivery_fee: parseFloat(order.delivery_fee),
        service_fee: parseFloat(order.service_fee),
        total_amount: parseFloat(order.total_amount),
        launch_promo: {
          applied: launchPromoApplied,
          discount_amount: launchPromoDiscount,
          normal_delivery_fee: Number(normalDeliveryFee.toFixed(2)),
          applied_delivery_fee: Number(deliveryFeeAmount.toFixed(2)),
        },
        pricing_adjusted: pricingAdjusted,
        checkout_pricing: pricingAdjusted ? checkoutPricingSnapshot : null,
        server_pricing: pricingAdjusted ? serverPricingSnapshot : null,
        payment_method: order.payment_method,
        estimated_duration_min: order.estimated_duration_min,
        placed_at: order.placed_at,
      },
    });
  } catch (error) {
    console.error("Place order error:", error);

    if (cartLocked) {
      try {
        await supabaseAdmin
          .from("carts")
          .update({ status: "active" })
          .eq("id", cartId);
      } catch (rollbackError) {
        console.error("Cart rollback error after place-order failure:", {
          cartId,
          rollbackError,
        });
      }
    }

    return res.status(500).json({ message: "Server error placing order" });
  }
});

// ============================================================================
// POST /orders/:id/cancel - Cancel a customer order
// ============================================================================

router.post("/:id/cancel", authenticate, async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;
  const { cancelled_reason } = req.body;

  if (userRole !== "customer") {
    return res
      .status(403)
      .json({ message: "Only customers can cancel orders" });
  }

  if (!orderId || !cancelled_reason?.trim()) {
    return res.status(400).json({
      message: "Order ID and cancelled_reason are required",
    });
  }

  try {
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_id,
        restaurant_id,
        cancelled_at,
        cancellation_reason,
        deliveries (
          id,
          status,
          driver_id,
          cancelled_at,
          cancelled_reason
        )
      `,
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.customer_id !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const delivery = order.deliveries?.[0] || order.deliveries;
    if (!delivery) {
      return res.status(400).json({ message: "Order has no delivery record" });
    }

    if (
      order.cancelled_at ||
      delivery.cancelled_at ||
      delivery.status === "cancelled"
    ) {
      return res
        .status(409)
        .json({ message: "This order has already been cancelled" });
    }

    const cancellableStatuses = new Set(["placed", "pending"]);
    if (!cancellableStatuses.has(delivery.status)) {
      return res.status(409).json({
        message: `Cannot cancel order in ${delivery.status} status`,
      });
    }

    const now = new Date().toISOString();
    const cleanReason = cancelled_reason.trim();

    const { error: orderUpdateError } = await supabaseAdmin
      .from("orders")
      .update({
        cancelled_at: now,
        cancellation_reason: cleanReason,
        updated_at: now,
      })
      .eq("id", orderId);

    if (orderUpdateError) {
      console.error("Order cancel update error:", orderUpdateError);
      return res.status(500).json({ message: "Failed to cancel order" });
    }

    const { error: deliveryUpdateError } = await supabaseAdmin
      .from("deliveries")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_reason: cleanReason,
        updated_at: now,
      })
      .eq("id", delivery.id);

    if (deliveryUpdateError) {
      console.error("Delivery cancel update error:", deliveryUpdateError);
      return res.status(500).json({ message: "Failed to cancel order" });
    }

    const { data: admins } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("restaurant_id", order.restaurant_id);

    if (admins && admins.length > 0) {
      admins.forEach((admin) => {
        notifyAdmin(admin.id, "order:status_update", {
          type: "order_cancelled",
          title: "Order Cancelled",
          message: `Order ${order.order_number} was cancelled by the customer.`,
          order_id: orderId,
          order_number: order.order_number,
          status: "cancelled",
          reason: cleanReason,
          customer_id: userId,
          restaurant_id: order.restaurant_id,
        });
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order: {
        id: orderId,
        order_number: order.order_number,
        status: "cancelled",
        cancelled_at: now,
        cancellation_reason: cleanReason,
      },
    });
  } catch (error) {
    console.error("Order cancel error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});
// ============================================================================
// GET /orders/my-orders - Get customer's orders
// ============================================================================

router.get("/my-orders", authenticate, async (req, res) => {
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Access denied" });
  }

  const customerId = req.user.id;
  const { status, limit = 20, offset = 0 } = req.query;

  try {
    let query = supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        order_number,
        restaurant_id,
        restaurant_name,
        restaurant_latitude,
        restaurant_longitude,
        subtotal,
        delivery_fee,
        service_fee,
        total_amount,
        payment_method,
        payment_status,
        distance_km,
        estimated_duration_min,
        delivery_address,
        delivery_city,
        delivery_latitude,
        delivery_longitude,
        placed_at,
        delivered_at,
        order_items (
          id,
          food_name,
          food_image_url,
          size,
          quantity,
          unit_price,
          total_price
        ),
        deliveries (
          id,
          status,
          driver_id,
          picked_up_at,
          delivered_at
        ),
        restaurants (
          logo_url
        )
      `,
      )
      .eq("customer_id", customerId)
      .order("placed_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Note: We don't filter by orders.status here.
    // Status is determined by deliveries.status (via effective_status) on the client.

    const { data: orders, error } = await query;

    if (error) {
      console.error("Fetch orders error:", error);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }

    // Transform orders to include delivery status and combined status for navigation
    const transformedOrders = (orders || []).map((order) => {
      const delivery = order.deliveries?.[0] || order.deliveries;
      const deliveryStatus = delivery?.status || "placed";

      // Determine the effective status for UI navigation
      // Map delivery statuses to navigation statuses
      let effectiveStatus = deliveryStatus;
      if (deliveryStatus === "pending") {
        effectiveStatus = "pending"; // Delivery created but no driver yet
      } else if (
        deliveryStatus === "accepted" ||
        deliveryStatus === "driver_assigned"
      ) {
        effectiveStatus = "accepted"; // Driver assigned/accepted
      } else if (deliveryStatus === "picked_up") {
        effectiveStatus = "picked_up";
      } else if (
        deliveryStatus === "on_the_way" ||
        deliveryStatus === "at_customer"
      ) {
        effectiveStatus = "on_the_way";
      } else if (deliveryStatus === "delivered") {
        effectiveStatus = "delivered";
      } else if (deliveryStatus === "failed") {
        effectiveStatus = "rejected";
      } else if (deliveryStatus === "cancelled") {
        effectiveStatus = "cancelled";
      }

      return {
        ...order,
        delivery_status: deliveryStatus,
        effective_status: effectiveStatus,
        restaurant_logo: order.restaurants?.logo_url || null,
        deliveries: undefined, // Remove raw deliveries from response
        restaurants: undefined, // Remove raw restaurants from response
      };
    });

    return res.json({ orders: transformedOrders });
  } catch (error) {
    console.error("Get orders error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// GET /orders/:id - Get single order details
// ============================================================================

router.get("/:id", authenticate, async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        `
        *,
        order_items (*),
        deliveries (*)
      `,
      )
      .eq("id", orderId)
      .single();

    if (error || !order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify access
    if (userRole === "customer" && order.customer_id !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (userRole === "driver") {
      // Driver can only see orders assigned to them via deliveries
      const delivery = order.deliveries?.[0] || order.deliveries;
      if (!delivery || delivery.driver_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    if (userRole === "admin") {
      const { data: admin } = await supabaseAdmin
        .from("admins")
        .select("restaurant_id")
        .eq("id", userId)
        .single();

      if (!admin || admin.restaurant_id !== order.restaurant_id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Transform order for admin view - show admin prices (without commission)
      const adminItems = (order.order_items || []).map((item) => ({
        ...item,
        // Override with admin prices for admin view
        unit_price: item.admin_unit_price || item.unit_price,
        total_price: item.admin_total_price || item.total_price,
      }));

      const adminOrder = {
        ...order,
        order_items: adminItems,
        // Show admin_subtotal as the subtotal (what admin will receive)
        subtotal: order.admin_subtotal || order.subtotal,
        admin_total: parseFloat(order.admin_subtotal || order.subtotal),
      };

      return res.json({ order: adminOrder });
    }

    return res.json({ order });
  } catch (error) {
    console.error("Get order error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// GET /orders/:id/delivery-status - Get delivery status for real-time tracking
// ============================================================================

router.get("/:id/delivery-status", authenticate, async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  try {
    // 1) Fetch order without depending on nested driver joins
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        `
          id,
          customer_id,
          restaurant_id,
          order_number,
          restaurant_name,
          restaurant_latitude,
          restaurant_longitude,
          delivery_address,
          delivery_city,
          delivery_latitude,
          delivery_longitude,
          estimated_duration_min
        `,
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      console.error("[DELIVERY STATUS] Order fetch error:", {
        orderId,
        message: orderError.message,
        code: orderError.code,
        details: orderError.details,
      });
      return res.status(500).json({ message: "Failed to fetch order" });
    }

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 2) Access control
    if (userRole === "customer" && String(order.customer_id) !== String(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (userRole === "admin") {
      const { data: admin, error: adminError } = await supabaseAdmin
        .from("admins")
        .select("restaurant_id")
        .eq("id", userId)
        .maybeSingle();

      if (adminError) {
        console.error("[DELIVERY STATUS] Admin fetch error:", adminError.message);
        return res.status(500).json({ message: "Failed to verify admin" });
      }

      if (!admin || String(admin.restaurant_id) !== String(order.restaurant_id)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    // 3) Fetch delivery directly from deliveries table
    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
          id,
          order_id,
          driver_id,
          status,
          accepted_at,
          picked_up_at,
          on_the_way_at,
          arrived_customer_at,
          delivered_at,
          current_latitude,
          current_longitude,
          last_location_update
        `,
      )
      .eq("order_id", orderId)
      .maybeSingle();

    if (deliveryError) {
      console.error("[DELIVERY STATUS] Delivery fetch error:", {
        orderId,
        message: deliveryError.message,
        code: deliveryError.code,
        details: deliveryError.details,
      });
      return res.status(500).json({ message: "Failed to fetch delivery" });
    }

    if (userRole === "driver") {
      if (!delivery || String(delivery.driver_id) !== String(userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const deliveryStatus = delivery?.status || "placed";

    // 4) Fetch restaurant logo separately
    let restaurantLogo = null;
    if (order.restaurant_id) {
      const { data: restaurant, error: restaurantError } = await supabaseAdmin
        .from("restaurants")
        .select("logo_url")
        .eq("id", order.restaurant_id)
        .maybeSingle();

      if (restaurantError) {
        console.warn(
          "[DELIVERY STATUS] Restaurant logo fetch failed:",
          restaurantError.message,
        );
      }

      restaurantLogo = restaurant?.logo_url || null;
    }

    // 5) Fetch driver details using delivery.driver_id
    const driverInfo = delivery?.driver_id
      ? await getDriverDisplayInfo(delivery.driver_id)
      : null;

    console.log("[DELIVERY STATUS DEBUG]", {
      orderId,
      userId,
      userRole,
      delivery_id: delivery?.id || null,
      delivery_driver_id: delivery?.driver_id || null,
      delivery_status: deliveryStatus,
      driverInfo,
    });

    // 6) Resolve driver location
    const socketLiveDriverLocation = delivery?.driver_id
      ? getLatestDriverLiveLocation(delivery.driver_id)
      : null;

    const hasSocketDriverCoords =
      Number.isFinite(Number(socketLiveDriverLocation?.latitude)) &&
      Number.isFinite(Number(socketLiveDriverLocation?.longitude));

    const hasDeliveryDriverCoords =
      Number.isFinite(Number(delivery?.current_latitude)) &&
      Number.isFinite(Number(delivery?.current_longitude));

    const resolvedDriverLocation = hasSocketDriverCoords
      ? {
          latitude: Number(socketLiveDriverLocation.latitude),
          longitude: Number(socketLiveDriverLocation.longitude),
          lastUpdate: socketLiveDriverLocation.timestamp || null,
        }
      : hasDeliveryDriverCoords
        ? {
            latitude: Number(delivery.current_latitude),
            longitude: Number(delivery.current_longitude),
            lastUpdate: delivery.last_location_update || null,
          }
        : null;

    // 7) Calculate ETA
    let eta = null;
    if (
      delivery?.driver_id &&
      ["accepted", "picked_up", "on_the_way", "at_customer"].includes(
        deliveryStatus,
      )
    ) {
      const driverLoc = resolvedDriverLocation
        ? {
            latitude: resolvedDriverLocation.latitude,
            longitude: resolvedDriverLocation.longitude,
          }
        : null;

      eta = await calculateCustomerETA(orderId, driverLoc);
    }

    if (!eta && order.estimated_duration_min) {
      const baseMins = Number(order.estimated_duration_min) || 10;
      eta = {
        etaMinutes: baseMins,
        etaRangeMin: baseMins,
        etaRangeMax: baseMins + 10,
        etaDisplay: `${baseMins} - ${baseMins + 10} min`,
        stopsBeforeCustomer: 0,
        driverStatus: deliveryStatus,
        isExact: false,
      };
    }

    // 8) Return full driver object and flat aliases
    return res.json({
      api_version: "orders-delivery-status-v3-driver-debug",
      orderId: order.id,
      order_id: order.id,
      orderStatus: deliveryStatus,
      status: deliveryStatus,

      deliveryId: delivery?.id || null,
      delivery_id: delivery?.id || null,

      driverId: driverInfo?.driver_id || delivery?.driver_id || null,
      driver_id: driverInfo?.driver_id || delivery?.driver_id || null,

      pickedUpAt: delivery?.picked_up_at || null,
      picked_up_at: delivery?.picked_up_at || null,
      deliveredAt: delivery?.delivered_at || null,
      delivered_at: delivery?.delivered_at || null,

      // Main driver objects for frontend
      driver: driverInfo,
      driver_info: driverInfo,
      driverInfo,

      // Flat fallback fields for older frontend code
      driver_name: driverInfo?.full_name || null,
      driver_phone: driverInfo?.phone || null,
      driver_photo: driverInfo?.photo_url || null,
      vehicle_number: driverInfo?.vehicle_number || null,
      vehicle_type: driverInfo?.vehicle_type || null,
      vehicle_model: driverInfo?.vehicle_model || null,

      driverLocation: resolvedDriverLocation,
      driver_location: resolvedDriverLocation,

      customerLocation: {
        latitude: Number(order.delivery_latitude),
        longitude: Number(order.delivery_longitude),
        address: order.delivery_address || "",
        city: order.delivery_city || "",
      },
      customer_location: {
        latitude: Number(order.delivery_latitude),
        longitude: Number(order.delivery_longitude),
        address: order.delivery_address || "",
        city: order.delivery_city || "",
      },

      restaurantLocation: {
        latitude: Number(order.restaurant_latitude),
        longitude: Number(order.restaurant_longitude),
      },
      restaurant_location: {
        latitude: Number(order.restaurant_latitude),
        longitude: Number(order.restaurant_longitude),
      },

      restaurantName: order.restaurant_name,
      restaurant_name: order.restaurant_name,
      restaurantLogo,
      restaurant_logo: restaurantLogo,

      estimatedDuration: order.estimated_duration_min,
      estimated_duration_min: order.estimated_duration_min,
      eta,
    });
  } catch (error) {
    console.error("[DELIVERY STATUS] Server error:", {
      orderId,
      message: error?.message,
      stack: error?.stack,
    });

    return res.status(500).json({
      message: "Server error fetching delivery status",
      error: error?.message,
    });
  }
});

// ============================================================================
// GET /orders/restaurant/orders - Get restaurant orders (admin)
// ============================================================================

router.get("/restaurant/orders", authenticate, async (req, res) => {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Only restaurant admins can access" });
  }

  const adminId = req.user.id;
  const { status, limit = 1000, offset = 0 } = req.query;

  try {
    // Get admin's restaurant
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .single();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    let query = supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_city,
        delivery_latitude,
        delivery_longitude,
        subtotal,
        admin_subtotal,
        delivery_fee,
        service_fee,
        total_amount,
        distance_km,
        estimated_duration_min,
        payment_method,
        payment_status,
        placed_at,
        delivered_at,
        order_items (
          id,
          food_name,
          food_image_url,
          size,
          quantity,
          unit_price,
          total_price,
          admin_unit_price,
          admin_total_price
        ),
        deliveries (
          id,
          status,
          driver_id,
          res_accepted_at,
          accepted_at,
          picked_up_at,
          on_the_way_at,
          arrived_customer_at,
          delivered_at,
          created_at,
          drivers (
            id,
            full_name,
            phone,
            latitute,
            longitute
          )
        )
      `,
      )
      .eq("restaurant_id", admin.restaurant_id)
      .order("placed_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Note: We don't filter by orders.status here.
    // Status filtering is done client-side using deliveries.status (via getDeliveryStatus).

    const { data: orders, error } = await query;

    if (error) {
      console.error("Fetch restaurant orders error:", error);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }

    // Transform orders for admin view - show admin prices (without commission)
    const adminOrders = (orders || []).map((order) => {
      // Transform order items to show admin prices
      const adminItems = (order.order_items || []).map((item) => ({
        ...item,
        // Override unit_price and total_price with admin prices for admin view
        unit_price: item.admin_unit_price || item.unit_price,
        total_price: item.admin_total_price || item.total_price,
      }));

      return {
        ...order,
        order_items: adminItems,
        // Show admin_subtotal as the subtotal for admin (what they will receive)
        subtotal: order.admin_subtotal || order.subtotal,
        // Calculate admin's total (admin_subtotal only, no fees)
        admin_total: parseFloat(order.admin_subtotal || order.subtotal),
        // Original customer total for reference (hidden from admin UI)
        customer_total: order.total_amount,
      };
    });

    if (error) {
      console.error("Fetch restaurant orders error:", error);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }

    // Get counts by delivery status (not orders.status)
    const { data: deliveryStatusCounts } = await supabaseAdmin
      .from("deliveries")
      .select("status, orders!inner(restaurant_id)")
      .eq("orders.restaurant_id", admin.restaurant_id);

    const dsCounts = deliveryStatusCounts || [];
    const counts = {
      all: dsCounts.length,
      placed: dsCounts.filter((d) => d.status === "placed").length,
      pending: dsCounts.filter((d) => d.status === "pending").length,
      accepted: dsCounts.filter((d) => d.status === "accepted").length,
      picked_up: dsCounts.filter((d) => d.status === "picked_up").length,
      on_the_way: dsCounts.filter((d) => d.status === "on_the_way").length,
      at_customer: dsCounts.filter((d) => d.status === "at_customer").length,
      delivered: dsCounts.filter((d) => d.status === "delivered").length,
      cancelled: dsCounts.filter((d) => d.status === "cancelled").length,
      rejected: dsCounts.filter((d) => d.status === "rejected").length,
    };

    return res.json({
      orders: adminOrders,
      counts,
      restaurant_id: admin.restaurant_id,
    });
  } catch (error) {
    console.error("Get restaurant orders error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// PATCH /orders/restaurant/orders/:id/status - Update order status (admin)
// ============================================================================

router.patch(
  "/restaurant/orders/:id/status",
  authenticate,
  async (req, res) => {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only restaurant admins can update" });
    }

    const orderId = req.params.id;
    const adminId = req.user.id;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    try {
      // Get admin's restaurant
      const { data: admin, error: adminError } = await supabaseAdmin
        .from("admins")
        .select("restaurant_id")
        .eq("id", adminId)
        .single();

      if (adminError || !admin?.restaurant_id) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // Get current order with its delivery status
      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .select(
          `id, customer_id, order_number, restaurant_name, restaurant_address,
          restaurant_latitude, restaurant_longitude,
          delivery_address, delivery_city, delivery_latitude, delivery_longitude,
          total_amount, distance_km, estimated_duration_min,
          deliveries!inner(id, status)
        `,
        )
        .eq("id", orderId)
        .eq("restaurant_id", admin.restaurant_id)
        .single();

      if (orderError || !order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const delivery = order.deliveries?.[0] || order.deliveries;
      if (!delivery) {
        return res.status(404).json({ message: "Delivery record not found" });
      }

      const currentDeliveryStatus = delivery.status;
      const deliveryId = delivery.id;

      // Map admin's status names to deliveries table status
      // Admin "accepted" G�� deliveries "pending" (waiting for driver)
      // Admin "rejected" G�� deliveries "failed"
      let targetDeliveryStatus = status;
      if (status === "rejected") {
        targetDeliveryStatus = "failed";
      } else if (status === "accepted") {
        targetDeliveryStatus = "pending"; // Admin accepts G�� pending (not accepted!)
      }

      // Validate status transition using delivery status
      const validTransitions =
        VALID_DELIVERY_TRANSITIONS[currentDeliveryStatus];
      if (
        !validTransitions ||
        !validTransitions.includes(targetDeliveryStatus)
      ) {
        return res.status(400).json({
          message: `Cannot transition from '${currentDeliveryStatus}' to '${targetDeliveryStatus}'`,
          valid_transitions: validTransitions || [],
          current_status: currentDeliveryStatus,
        });
      }

      // G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��
      // PRIMARY: Update deliveries table (single source of truth)
      // G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��G��
      const now = new Date().toISOString();
      const deliveryUpdate = {
        status: targetDeliveryStatus,
        updated_at: now,
      };

      // Set timestamps for status transitions
      // Each timestamp corresponds to when that status is reached
      switch (targetDeliveryStatus) {
        case "pending":
          // Admin/restaurant accepted the order
          deliveryUpdate.res_accepted_at = now;
          break;
        case "failed":
          // Admin rejected the order
          deliveryUpdate.rejected_at = now;
          if (reason) deliveryUpdate.rejection_reason = reason;
          break;
        case "cancelled":
          // Order was cancelled
          deliveryUpdate.cancelled_at = now;
          break;
        // Note: Driver status transitions (accepted, picked_up, etc.) are handled in driverDelivery.js
        // Note: preparing_at and ready_at are not needed per requirements
      }

      const { error: updateError } = await supabaseAdmin
        .from("deliveries")
        .update(deliveryUpdate)
        .eq("id", deliveryId);

      if (updateError) {
        console.error("Delivery update error:", updateError);
        return res.status(500).json({ message: "Failed to update status" });
      }

      console.log(
        `G�� Delivery ${deliveryId} status updated: ${currentDeliveryStatus} G�� ${targetDeliveryStatus}`,
      );

      try {
        const { data: restaurantAdmins, error: restaurantAdminsError } =
          await supabaseAdmin
            .from("admins")
            .select("id")
            .eq("restaurant_id", admin.restaurant_id);

        if (restaurantAdminsError) {
          console.error(
            "Failed to fetch restaurant admins for realtime status event:",
            restaurantAdminsError,
          );
        } else {
          (restaurantAdmins || []).forEach((restaurantAdmin) => {
            notifyAdmin(restaurantAdmin.id, "order:status_changed", {
              type: "order_status_update",
              order_id: orderId,
              delivery_id: deliveryId,
              order_number: order.order_number,
              status: targetDeliveryStatus,
              previous_status: currentDeliveryStatus,
              reason: reason || null,
              source: "admin_status_update",
            });
          });
        }
      } catch (emitError) {
        console.error(
          "Failed to emit realtime order status event to admins:",
          emitError,
        );
      }

      // Create notification for customer
      // Map back to user-friendly status names
      const notificationTypes = {
        accepted: "order_accepted",
        failed: "order_rejected",
        preparing: "order_preparing",
        ready: "order_ready",
        cancelled: "order_cancelled",
      };

      const notificationTitles = {
        accepted: "Order Accepted",
        failed: "Order Rejected",
        preparing: "Order Being Prepared",
        ready: "Order Ready",
        cancelled: "Order Cancelled",
      };

      const notificationMessages = {
        accepted: `Your order has been accepted by the restaurant and is being prepared.`,
        failed: `Your order ${order.order_number} was rejected. ${
          reason || ""
        }`,
        preparing: `Your order ${order.order_number} is being prepared!`,
        ready: `Your order ${order.order_number} is ready for pickup!`,
        cancelled: `Your order ${order.order_number} was cancelled.`,
      };

      // Use original 'status' parameter (accepted/rejected) for notification lookup
      // NOT targetDeliveryStatus (pending/failed) which won't match the maps
      if (notificationTypes[status]) {
        // =��� REAL-TIME WEBSOCKET: Notify customer instantly
        if (order.customer_id) {
          notifyCustomer(order.customer_id, "order:status_update", {
            type: notificationTypes[status],
            title: notificationTitles[status],
            message: notificationMessages[status],
            order_id: orderId,
            order_number: order.order_number,
            status: targetDeliveryStatus, // Send actual delivery status
            originalStatus: status, // Include original for reference
          });
          console.log(
            `=��� WebSocket: Customer ${order.customer_id} notified of ${status} (delivery status: ${targetDeliveryStatus})`,
          );

          // =��� PUSH NOTIFICATION: Reach customer even when app is closed/locked
          sendOrderStatusNotification(order.customer_id, {
            orderId,
            orderNumber: order.order_number,
            status: status === "accepted" ? "accepted" : status, // Use user-friendly status
            restaurantName: order.restaurant_name,
          }).catch((err) =>
            console.error("Push order status error (non-fatal):", err),
          );
        }
      }

      // ====================================================================
      // NOTIFY ALL ACTIVE DRIVERS when admin accepts order (status=pending)
      // ====================================================================
      if (targetDeliveryStatus === "pending") {
        try {
          // Delivery record should already exist and was just updated above
          // This block just handles driver notifications

          // Get all active drivers
          const { data: activeDrivers, error: driversError } =
            await supabaseAdmin
              .from("drivers")
              .select("id")
              .eq("driver_status", "active");

          if (!driversError && activeDrivers && activeDrivers.length > 0) {
            console.log(
              `=��� Notifying ${activeDrivers.length} active drivers...`,
            );

            // Notifications are now handled by push notification service
            // which automatically logs to notification_log table
            // and by WebSocket broadcast below

            // ================================================================
            // =��� REAL-TIME WEBSOCKET BROADCAST - Fair Instant Notification
            // All online drivers receive this at EXACTLY the same time
            // ================================================================

            // Fetch tip_amount from the delivery record
            const { data: deliveryTipData } = await supabaseAdmin
              .from("deliveries")
              .select("tip_amount")
              .eq("id", delivery.id)
              .single();
            const deliveryTipAmount = parseFloat(
              deliveryTipData?.tip_amount || 0,
            );

            const broadcastResult = await broadcastNewDelivery({
              delivery_id: delivery.id,
              order_id: orderId,
              order_number: order.order_number,
              restaurant: {
                id: admin.restaurant_id,
                name: order.restaurant_name,
                address: order.restaurant_address,
                latitude: order.restaurant_latitude,
                longitude: order.restaurant_longitude,
              },
              customer: {
                latitude: order.delivery_latitude,
                longitude: order.delivery_longitude,
                address: order.delivery_address,
                city: order.delivery_city,
              },
              total_amount: parseFloat(order.total_amount || 0),
              distance_km: parseFloat(order.distance_km || 0),
              estimated_time: parseFloat(order.estimated_duration_min || 0),
              tip_amount: deliveryTipAmount,
              created_at: new Date().toISOString(),
            });

            console.log(
              `=��� WebSocket broadcast result: ${broadcastResult.driversNotified} drivers notified instantly`,
            );

            // =��� PUSH: Also notify drivers who are offline / app closed.
            // Await here to avoid dropping notifications in local/dev restarts.
            try {
              const pushResult = await sendNewDeliveryNotificationToDrivers({
                deliveryId: delivery.id,
                orderNumber: order.order_number,
                restaurantName: order.restaurant_name,
                totalAmount: parseFloat(order.total_amount || 0),
                tipAmount: deliveryTipAmount,
              });
              console.log("=��� Driver push broadcast result:", pushResult);
            } catch (err) {
              console.error("Push driver broadcast error (non-fatal):", err);
            }
          } else {
            console.log("G��n+� No active drivers found");
          }
        } catch (err) {
          console.error("G�� Error in driver notification flow:", err);
          // Don't fail the request, just log the error
        }
      }

      return res.json({
        message: "Order status updated",
        order: {
          id: orderId,
          status: targetDeliveryStatus,
          previous_status: currentDeliveryStatus,
        },
      });
    } catch (error) {
      console.error("Update order status error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

export default router;
