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
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  getDriverRouteContext,
  insertDeliveryStopsIntoRoute,
  getFormattedActiveDeliveries,
  removeDeliveryStops,
} from "../utils/driverRouteContext.js";
import { getAvailableDeliveriesForDriver } from "../utils/availableDeliveriesLogic.js";

const router = express.Router();

// ============================================================================
// Helper: Calculate distance using Haversine formula (fallback)
// ============================================================================
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
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
// Helper: Fetch with timeout and improved retry logic
// ============================================================================
async function fetchWithTimeout(
  url,
  options = {},
  timeout = 15000,
  retries = 3,
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

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      console.log(
        `[OSRM] Retry ${i + 1}/${retries} after ${delay}ms - Error: ${error.message}`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// ============================================================================
// Helper: Get route from OSRM (Public Server) with caching and retry
// ============================================================================
async function getRouteDistance(
  startLng,
  startLat,
  endLng,
  endLat,
  overview = "false",
) {
  try {
    const cacheKey = getCacheKey(startLng, startLat, endLng, endLat);

    // Check cache first
    const cached = getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=${overview}${
      overview === "full" ? "&geometries=geojson" : ""
    }`;

    console.log(
      `[OSRM] Requesting route: (${startLng},${startLat}) → (${endLng},${endLat})`,
    );

    // Use public OSRM with 15 second timeout and 3 retries
    const response = await fetchWithTimeout(url, {}, 15000, 3);

    if (!response.ok) {
      console.error(
        `[OSRM] HTTP Error: ${response.status} ${response.statusText}`,
      );
      throw new Error(`OSRM HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.code === "Ok" && data.routes?.[0]) {
      console.log(
        `[OSRM] ✅ Success: Distance=${(data.routes[0].distance / 1000).toFixed(2)}km, Duration=${(data.routes[0].duration / 60).toFixed(0)}min`,
      );

      // Cache the result
      setCache(cacheKey, data.routes[0]);

      return data.routes[0];
    }

    console.warn(
      `[OSRM] ⚠️ Invalid response: code=${data.code}, message=${data.message}`,
    );
    throw new Error(`OSRM code: ${data.code} - ${data.message}`);
  } catch (error) {
    console.error(`[OSRM] ❌ All retries failed - Error: ${error.message}`);

    // Fallback to Haversine only if OSRM completely fails
    console.log(`[HAVERSINE] Using fallback calculation...`);

    const distance = calculateHaversineDistance(
      startLat,
      startLng,
      endLat,
      endLng,
    );

    console.log(
      `[HAVERSINE] Distance=${(distance / 1000).toFixed(2)}km (estimated)`,
    );

    return {
      distance: distance * 1.3, // Add 30% for road routing approximation
      duration: (distance * 1.3) / 10, // Approximate 10 m/s average speed
      geometry:
        overview === "full"
          ? {
              coordinates: [
                [startLng, startLat],
                [endLng, endLat],
              ],
            }
          : undefined,
      isEstimate: true, // Mark as fallback estimate
    };
  }
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

// ============================================================================
// GET /driver/deliveries/pending - Get all pending deliveries
// Shows deliveries with delivery_status = 'pending'
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

      const { data: deliveries, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
          id,
          order_id,
          status,
          created_at,
          orders!inner (
            id,
            order_number,
            status,
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
            order_status: d.orders.status,
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
// ============================================================================

router.post(
  "/deliveries/:id/accept",
  authenticate,
  driverOnly,
  async (req, res) => {
    const deliveryId = req.params.id;
    const { driver_latitude, driver_longitude, earnings_data } = req.body;

    console.log(`\n${"=".repeat(80)}`);
    console.log(`[ACCEPT DELIVERY] ✅ Accepting delivery: ${deliveryId}`);
    console.log(`[DRIVER] ${req.user.id}`);
    console.log(`[EARNINGS DATA] ${JSON.stringify(earnings_data)}`);
    console.log(`${"=".repeat(80)}`);

    try {
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

      if (deliveringCheck && deliveringCheck.length > 0) {
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

      // Step 2: Atomically assign the delivery with earnings data
      console.log(
        `[ACCEPT DELIVERY] → Step 2: Update delivery status to 'accepted' with earnings`,
      );

      // Prepare earnings fields
      const earningsFields = earnings_data
        ? {
            delivery_sequence: earnings_data.delivery_sequence || 1,
            base_amount: earnings_data.base_amount || 0,
            extra_earnings: earnings_data.extra_earnings || 0,
            bonus_amount: earnings_data.bonus_amount || 0,
            r0_distance_km: earnings_data.r0_distance_km || null,
            r1_distance_km: earnings_data.r1_distance_km || null,
            extra_distance_km: earnings_data.extra_distance_km || 0,
            total_distance_km: earnings_data.total_distance_km || 0,
            // Calculate total driver_earnings
            driver_earnings:
              earnings_data.delivery_sequence === 1
                ? earnings_data.base_amount || 0
                : (earnings_data.extra_earnings || 0) +
                  (earnings_data.bonus_amount || 0),
          }
        : {};

      const { data: updated, error } = await supabaseAdmin
        .from("deliveries")
        .update({
          driver_id: req.user.id,
          status: "accepted",
          assigned_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
          current_latitude: driver_latitude || null,
          current_longitude: driver_longitude || null,
          last_location_update: new Date().toISOString(),
          ...earningsFields,
        })
        .eq("id", deliveryId)
        .is("driver_id", null)
        .eq("status", "pending")
        .select(
          `id, order_id, status, assigned_at, delivery_sequence, base_amount, extra_earnings, bonus_amount, driver_earnings, total_distance_km, orders (
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
        ), drivers!driver_id (full_name, phone, profile_photo_url)`,
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
        `[ACCEPT DELIVERY]   💰 Earnings stored: Rs.${updated.driver_earnings} (base: ${updated.base_amount}, extra: ${updated.extra_earnings}, bonus: ${updated.bonus_amount})`,
      );

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
      const driverInfo = {
        driver_id: req.user.id,
        driver_name: updated.drivers?.full_name || "Driver",
        driver_phone: updated.drivers?.phone,
        driver_photo: updated.drivers?.profile_photo_url,
      };

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

      if (notifications.length > 0) {
        await supabaseAdmin.from("notifications").insert(notifications);
      }

      console.log(`[ACCEPT DELIVERY]   ✓ Notifications sent`);

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
          orders (
            id,
            order_number,
            status,
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

          return {
            delivery_id: d.id,
            order_id: d.order_id,
            order_number: d.orders.order_number,
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
            distance_meters: route.distance || 0,
            distance_km: ((route.distance || 0) / 1000).toFixed(2),
            estimated_time_minutes: Math.ceil((route.duration || 0) / 60),
            estimated_time_seconds: route.duration || 0,
            route_geometry: route.geometry,
            customer_route_geometry: customerRoute?.geometry,
            accepted_at: d.accepted_at,
          };
        }),
      );

      // Sort by shortest distance (1st pickup = minimum distance)
      pickupsWithDistances.sort(
        (a, b) => a.distance_meters - b.distance_meters,
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
          orders (
            id,
            order_number,
            status,
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

          return {
            delivery_id: d.id,
            order_id: d.order_id,
            order_number: d.orders.order_number,
            status: d.status,
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
            distance_meters: route.distance || 0,
            distance_km: ((route.distance || 0) / 1000).toFixed(2),
            estimated_time_minutes: Math.ceil((route.duration || 0) / 60),
            estimated_time_seconds: route.duration || 0,
            route_geometry: route.geometry,
            picked_up_at: d.picked_up_at,
          };
        }),
      );

      // Sort by shortest distance (1st delivery = minimum distance)
      deliveriesWithDistances.sort(
        (a, b) => a.distance_meters - b.distance_meters,
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
            coordinates: restaurantRoute.geometry?.coordinates || [
              [driverLng, driverLat],
              [restaurantLng, restaurantLat],
            ],
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
            coordinates: restaurantCustomerRoute.geometry?.coordinates || [
              [restaurantLng, restaurantLat],
              [customerLng, customerLat],
            ],
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
            coordinates: customerRoute.geometry?.coordinates || [
              [driverLng, driverLat],
              [customerLng, customerLat],
            ],
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
// PATCH /driver/deliveries/:id/location - Update driver location
// ============================================================================

router.patch(
  "/deliveries/:id/location",
  authenticate,
  driverOnly,
  async (req, res) => {
    const deliveryId = req.params.id;
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "Location coordinates required" });
    }

    // Validate coordinates
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({ message: "Invalid coordinates" });
    }

    try {
      // Update driver location in deliveries table
      const { data: updated, error } = await supabaseAdmin
        .from("deliveries")
        .update({
          current_latitude: latitude,
          current_longitude: longitude,
          last_location_update: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id)
        .select("id, order_id, status")
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

      return res.json({
        message: "Location updated",
        delivery: {
          id: updated.id,
          status: updated.status,
          location: { latitude, longitude },
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
    const { status, latitude, longitude } = req.body || {};

    const validStatuses = [
      "picked_up",
      "on_the_way",
      "at_customer",
      "delivered",
    ];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    try {
      // Fetch current delivery to validate state transition
      const { data: currentDelivery, error: fetchError } = await supabaseAdmin
        .from("deliveries")
        .select(
          "status, order_id, current_latitude, current_longitude, orders (customer_id, restaurant_id, order_number, restaurant_latitude, restaurant_longitude, delivery_latitude, delivery_longitude)",
        )
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id)
        .single();

      if (fetchError || !currentDelivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      // Validate state transitions
      const validTransitions = {
        accepted: ["picked_up"],
        picked_up: ["on_the_way"],
        on_the_way: ["at_customer"],
        at_customer: ["delivered"],
      };

      const allowedNextStates = validTransitions[currentDelivery.status] || [];
      if (!allowedNextStates.includes(status)) {
        return res.status(400).json({
          message: `Cannot transition from '${currentDelivery.status}' to '${status}'`,
        });
      }

      const updateData = { status };

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
      if (status === "picked_up") {
        updateData.picked_up_at = timestamp;
      } else if (status === "on_the_way") {
        updateData.on_the_way_at = timestamp;
      } else if (status === "at_customer") {
        updateData.arrived_customer_at = timestamp;
      } else if (status === "delivered") {
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

      // Update order status if delivered
      if (status === "delivered") {
        await supabaseAdmin
          .from("orders")
          .update({ status: "delivered", delivered_at: timestamp })
          .eq("id", delivery.order_id);
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

      const messages = statusMessages[status];
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
              status,
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
              status,
              order_number: currentDelivery.orders.order_number,
            }),
          });
        }
      }

      if (notifications.length > 0) {
        await supabaseAdmin.from("notifications").insert(notifications);
      }

      // Helper: promote the nearest picked_up delivery to on_the_way when no active on_the_way/at_customer exists
      const promoteNextPickedUp = async (referenceLat, referenceLng) => {
        const hasReference =
          Number.isFinite(referenceLat) && Number.isFinite(referenceLng);

        // If there's already an active on_the_way or at_customer, skip
        const { data: hasActive } = await supabaseAdmin
          .from("deliveries")
          .select("id")
          .eq("driver_id", req.user.id)
          .in("status", ["on_the_way", "at_customer"])
          .limit(1);
        if (hasActive && hasActive.length > 0) return null;

        // Find remaining picked_up deliveries
        const { data: nextList } = await supabaseAdmin
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

        if (!nextList || nextList.length === 0) return null;

        // If we have a valid reference point, pick the nearest customer; otherwise fall back to oldest picked_up
        let next;
        if (hasReference) {
          const routes = await Promise.all(
            nextList.map(async (n) => {
              const cLat = parseFloat(n.orders.delivery_latitude);
              const cLng = parseFloat(n.orders.delivery_longitude);
              const route = await getRouteDistance(
                referenceLng,
                referenceLat,
                cLng,
                cLat,
                "false",
              );
              return {
                id: n.id,
                order_id: n.order_id,
                distance: route?.distance || Number.POSITIVE_INFINITY,
                customer_id: n.orders.customer_id,
                restaurant_id: n.orders.restaurant_id,
                order_number: n.orders.order_number,
              };
            }),
          );

          routes.sort((a, b) => a.distance - b.distance);
          next = routes[0];
        } else {
          // No coordinates to compare; use earliest picked_up as a safe default
          const first = nextList[0];
          next = {
            id: first.id,
            order_id: first.order_id,
            distance: 0,
            customer_id: first.orders.customer_id,
            restaurant_id: first.orders.restaurant_id,
            order_number: first.orders.order_number,
          };
        }

        if (next && isFinite(next.distance)) {
          const ts = new Date().toISOString();
          const { data: promoted } = await supabaseAdmin
            .from("deliveries")
            .update({ status: "on_the_way", on_the_way_at: ts })
            .eq("id", next.id)
            .eq("driver_id", req.user.id)
            .select("id, order_id")
            .maybeSingle();

          const nextMsgs = statusMessages["on_the_way"];
          const followups = [];
          if (nextMsgs) {
            if (next.customer_id) {
              followups.push({
                recipient_id: next.customer_id,
                type: "delivery_status_update",
                title: "Order Update",
                message: nextMsgs.customer,
                metadata: JSON.stringify({
                  order_id: promoted?.order_id || next.order_id,
                  delivery_id: promoted?.id || next.id,
                  status: "on_the_way",
                  order_number: next.order_number,
                }),
              });
            }
            if (next.restaurant_id) {
              followups.push({
                recipient_id: next.restaurant_id,
                type: "delivery_status_update",
                title: "Delivery Update",
                message: nextMsgs.restaurant,
                metadata: JSON.stringify({
                  order_id: promoted?.order_id || next.order_id,
                  delivery_id: promoted?.id || next.id,
                  status: "on_the_way",
                  order_number: next.order_number,
                }),
              });
            }
          }
          if (followups.length > 0) {
            await supabaseAdmin.from("notifications").insert(followups);
          }

          // Return promoted delivery info so frontend can update immediately
          return {
            id: promoted?.id || next.id,
            order_id: promoted?.order_id || next.order_id,
            status: "on_the_way",
          };
        }

        return null;
      };

      // Auto-promote cases
      let promotedDelivery = null;
      if (status === "delivered") {
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

      if (status === "picked_up") {
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
        assigned_at,
        picked_up_at,
        current_latitude,
        current_longitude,
        driver_id,
        orders (
          id,
          order_number,
          status,
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
      .order("assigned_at", { ascending: false });

    if (error && error.code !== "PGRST116") {
      console.error("Fetch active deliveries error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch active deliveries" });
    }

    if (!deliveries || deliveries.length === 0) {
      return res.json({ deliveries: [] });
    }

    // Calculate total distance for each delivery
    const formattedDeliveries = await Promise.all(
      deliveries.map(async (d) => {
        let totalDistance = 0;

        try {
          // Use driver's initial location (when accepted) or restaurant as fallback
          const driverLat = d.current_latitude || d.orders.restaurant_latitude;
          const driverLng =
            d.current_longitude || d.orders.restaurant_longitude;
          const restaurantLat = parseFloat(d.orders.restaurant_latitude);
          const restaurantLng = parseFloat(d.orders.restaurant_longitude);
          const customerLat = parseFloat(d.orders.delivery_latitude);
          const customerLng = parseFloat(d.orders.delivery_longitude);

          // Fetch driver → restaurant distance
          const restaurantRoute = await getRouteDistance(
            driverLng,
            driverLat,
            restaurantLng,
            restaurantLat,
            "false",
          );
          if (restaurantRoute) {
            totalDistance += restaurantRoute.distance;
          }

          // Fetch restaurant → customer distance
          const customerRoute = await getRouteDistance(
            restaurantLng,
            restaurantLat,
            customerLng,
            customerLat,
            "false",
          );
          if (customerRoute) {
            totalDistance += customerRoute.distance;
          }
        } catch (error) {
          console.error("Error calculating total distance:", error);
          // Use fallback calculation even on error
          const restaurantDist = calculateHaversineDistance(
            driverLat,
            driverLng,
            restaurantLat,
            restaurantLng,
          );
          const customerDist = calculateHaversineDistance(
            restaurantLat,
            restaurantLng,
            customerLat,
            customerLng,
          );
          totalDistance = (restaurantDist + customerDist) * 1.3; // Add 30% for road routing
        }

        return {
          id: d.id,
          order_id: d.order_id,
          status: d.status,
          driver_location: {
            latitude: d.current_latitude,
            longitude: d.current_longitude,
          },
          assigned_at: d.assigned_at,
          picked_up_at: d.picked_up_at,
          total_distance: totalDistance, // in meters
          order: {
            order_number: d.orders.order_number,
            status: d.orders.status,
            restaurant: {
              name: d.orders.restaurant_name,
              address: d.orders.restaurant_address,
              latitude: parseFloat(d.orders.restaurant_latitude),
              longitude: parseFloat(d.orders.restaurant_longitude),
            },
            delivery: {
              address: d.orders.delivery_address,
              city: d.orders.delivery_city,
              latitude: parseFloat(d.orders.delivery_latitude),
              longitude: parseFloat(d.orders.delivery_longitude),
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
      }),
    );

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
          delivery_status,
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
      .eq("delivery_status", "accepted") // ✅ IMPORTANT
      .single();

    if (error || !data) {
      return res.status(404).json({
        message: "Active delivery not found",
      });
    }

    return res.json({
      delivery: {
        id: data.id,
        delivery_status: data.delivery_status,
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
        assigned_at,
        picked_up_at,
        delivered_at,
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

      return res.json({ deliveries: deliveries || [] });
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
    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("recipient_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (unread_only === "true") {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error } = await query;

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
    const notificationId = req.params.id;

    try {
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("recipient_id", req.user.id);

      if (error) {
        console.error("Mark notification read error:", error);
        return res
          .status(500)
          .json({ message: "Failed to update notification" });
      }

      return res.json({ message: "Notification marked as read" });
    } catch (error) {
      console.error("Update notification error:", error);
      return res.status(500).json({ message: "Server error" });
    }
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
    try {
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_id", req.user.id)
        .eq("is_read", false);

      if (error) {
        console.error("Mark all notifications read error:", error);
        return res
          .status(500)
          .json({ message: "Failed to mark all notifications as read" });
      }

      return res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Mark all notifications error:", error);
      return res.status(500).json({ message: "Server error" });
    }
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

router.get(
  "/deliveries/available/v2",
  authenticate,
  driverOnly,
  async (req, res) => {
    const driverId = req.user.id;
    const { driver_latitude, driver_longitude } = req.query;

    console.log(`\n\n${"=".repeat(100)}`);
    console.log(`[ENDPOINT] GET /driver/deliveries/available/v2`);
    console.log(`[DRIVER] ${driverId}`);
    console.log(`[LOCATION] lat=${driver_latitude}, lng=${driver_longitude}`);
    console.log(`${"=".repeat(100)}`);

    try {
      const availableDeliveries = await getAvailableDeliveriesForDriver(
        driverId,
        driver_latitude ? parseFloat(driver_latitude) : null,
        driver_longitude ? parseFloat(driver_longitude) : null,
        getRouteDistance, // Pass the OSRM helper function
      );

      console.log(
        `[ENDPOINT] ✅ Returning ${availableDeliveries.available_deliveries?.length || 0} available deliveries`,
      );
      return res.json(availableDeliveries);
    } catch (error) {
      console.error(`[ENDPOINT] ❌ Error: ${error.message}`);
      console.error(error.stack);
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
    const formattedEarnings = earnings.map((e) => ({
      delivery_id: e.id,
      order_id: e.order_id,
      order_number: e.orders?.order_number,
      customer_name: e.orders?.customer_name,
      customer_address: e.orders?.delivery_address,
      restaurant_name: e.orders?.restaurant_name,
      delivery_sequence: e.delivery_sequence,
      base_amount: parseFloat(e.base_amount || 0),
      extra_earnings: parseFloat(e.extra_earnings || 0),
      bonus_amount: parseFloat(e.bonus_amount || 0),
      tip_amount: parseFloat(e.tip_amount || 0),
      driver_earnings: parseFloat(e.driver_earnings || 0),
      total_distance_km: parseFloat(e.total_distance_km || 0),
      extra_distance_km: parseFloat(e.extra_distance_km || 0),
      accepted_at: e.accepted_at,
      delivered_at: e.delivered_at,
      status: e.status,
    }));

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

// GET /driver/earnings/summary - Get earnings summary (today/week/month)
router.get("/earnings/summary", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;
  const { period = "today" } = req.query;

  console.log(
    `\n[EARNINGS SUMMARY] 📊 Fetching ${period} summary for driver: ${driverId}`,
  );

  try {
    // Build date filter based on period
    let dateFilter = "";
    const now = new Date();

    switch (period) {
      case "today":
        dateFilter = now.toISOString().split("T")[0]; // YYYY-MM-DD
        break;
      case "week":
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
        dateFilter = weekStart.toISOString().split("T")[0];
        break;
      case "month":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = monthStart.toISOString().split("T")[0];
        break;
      case "all":
        dateFilter = null;
        break;
    }

    let query = supabaseAdmin
      .from("deliveries")
      .select(
        "base_amount, extra_earnings, bonus_amount, tip_amount, driver_earnings, total_distance_km",
      )
      .eq("driver_id", driverId)
      .eq("status", "delivered");

    if (dateFilter) {
      query = query.gte("delivered_at", dateFilter);
    }

    const { data: deliveries, error } = await query;

    if (error) {
      console.error(`[EARNINGS SUMMARY] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch summary" });
    }

    // Calculate summary
    const summary = {
      total_deliveries: deliveries.length,
      total_distance_km: deliveries.reduce(
        (sum, d) => sum + parseFloat(d.total_distance_km || 0),
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
        (sum, d) =>
          sum +
          parseFloat(d.driver_earnings || 0) +
          parseFloat(d.tip_amount || 0),
        0,
      ),
      avg_per_delivery:
        deliveries.length > 0
          ? deliveries.reduce(
              (sum, d) =>
                sum +
                parseFloat(d.driver_earnings || 0) +
                parseFloat(d.tip_amount || 0),
              0,
            ) / deliveries.length
          : 0,
    };

    console.log(
      `[EARNINGS SUMMARY] ✅ ${period}: ${summary.total_deliveries} deliveries, Rs.${summary.total_earnings.toFixed(2)} total`,
    );
    return res.json({ success: true, summary, period });
  } catch (error) {
    console.error(`[EARNINGS SUMMARY] ❌ Error: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch summary" });
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
        return res
          .status(500)
          .json({
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
        customer.total_earned +=
          parseFloat(d.driver_earnings || 0) + parseFloat(d.tip_amount || 0);
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

export default router;
