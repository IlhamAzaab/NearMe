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
// Helper: Fetch with timeout and retry logic
// ============================================================================
async function fetchWithTimeout(
  url,
  options = {},
  timeout = 5000,
  retries = 2
) {
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
      if (i === retries) {
        throw error;
      }
      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// ============================================================================
// Helper: Get route from OSRM with fallback
// ============================================================================
async function getRouteDistance(
  startLng,
  startLat,
  endLng,
  endLat,
  overview = "false"
) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=${overview}${
      overview === "full" ? "&geometries=geojson" : ""
    }`;

    const response = await fetchWithTimeout(url, {}, 5000, 1);
    const data = await response.json();

    if (data.code === "Ok" && data.routes?.[0]) {
      return data.routes[0];
    }

    // Fallback to Haversine if OSRM fails
    const distance = calculateHaversineDistance(
      startLat,
      startLng,
      endLat,
      endLng
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
    };
  } catch (error) {
    // Fallback to Haversine calculation
    const distance = calculateHaversineDistance(
      startLat,
      startLng,
      endLat,
      endLng
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
// GET /driver/deliveries/available - Get available deliveries for drivers
// ============================================================================
router.get(
  "/deliveries/available",
  authenticate,
  driverOnly,
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
          id,
          order_id,
          created_at,
          driver_id,
          orders!inner (
            order_number,
            status,
            restaurant_name,
            restaurant_address,
            delivery_address,
            delivery_city,
            total_amount,
            placed_at,
            distance_km,
            estimated_duration_min,
            restaurant_latitude,
            restaurant_longitude,
            delivery_latitude,
            delivery_longitude
          )
        `
        )
        .is("driver_id", null)
        .in("orders.status", ["accepted", "preparing", "ready"])
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Fetch available deliveries error:", error);
        return res.status(500).json({ message: "Failed to fetch deliveries" });
      }

      // Transform for frontend
      const deliveries = (data || []).map((d) => ({
        delivery_id: d.id,
        order_id: d.order_id,
        order_number: d.orders.order_number,
        restaurant: {
          name: d.orders.restaurant_name,
          address: d.orders.restaurant_address,
          latitude: d.orders.restaurant_latitude,
          longitude: d.orders.restaurant_longitude,
        },
        delivery: {
          address: d.orders.delivery_address,
          city: d.orders.delivery_city,
          latitude: d.orders.delivery_latitude,
          longitude: d.orders.delivery_longitude,
        },
        total_amount: Number(d.orders.total_amount),
        placed_at: d.orders.placed_at,
        order_status: d.orders.status,
        distance_km: d.orders.distance_km,
        estimated_duration_min: d.orders.estimated_duration_min,
      }));

      return res.json({ deliveries });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// ============================================================================
// POST /driver/deliveries/:id/accept - Accept a delivery (ATOMIC)
// ============================================================================

router.post(
  "/deliveries/:id/accept",
  authenticate,
  driverOnly,
  async (req, res) => {
    const deliveryId = req.params.id;

    try {
      // Atomically assign the delivery to this driver if unassigned and still pending
      const { data: updated, error } = await supabaseAdmin
        .from("deliveries")
        .update({
          driver_id: req.user.id,
          status: "accepted",
          assigned_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .is("driver_id", null)
        .eq("status", "pending")
        .select(
          `id, order_id, status, assigned_at, orders (
          order_number, restaurant_name, restaurant_address, restaurant_latitude, restaurant_longitude,
          delivery_address, delivery_city, delivery_latitude, delivery_longitude, total_amount, distance_km, customer_name, customer_phone, customer_id, restaurant_id
        ), drivers!driver_id (full_name, phone, profile_photo_url)`
        )
        .maybeSingle();

      if (error) {
        console.error("Accept delivery error:", error);
        return res.status(500).json({ message: "Failed to accept delivery" });
      }
      if (!updated) {
        return res
          .status(409)
          .json({ message: "Delivery already taken or not available" });
      }

      // Notify customer and restaurant with driver details
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
            latitude: parseFloat(updated.orders.restaurant_latitude),
            longitude: parseFloat(updated.orders.restaurant_longitude),
          },
          delivery: {
            address: updated.orders.delivery_address,
            latitude: parseFloat(updated.orders.delivery_latitude),
            longitude: parseFloat(updated.orders.delivery_longitude),
          },
          customer: {
            name: updated.orders.customer_name,
            phone: updated.orders.customer_phone,
          },
          driver: driverInfo,
        },
      });
    } catch (error) {
      console.error("Accept delivery error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
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
        `
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
          "full"
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
          "full"
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
          "full"
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
  }
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
  }
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
    const { status } = req.body;

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
          "status, order_id, orders (customer_id, restaurant_id, order_number)"
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

      return res.json({
        message: "Status updated successfully",
        delivery: {
          id: delivery.id,
          status: delivery.status,
        },
      });
    } catch (error) {
      console.error("Update status error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
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
      `
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
            "false"
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
            "false"
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
            restaurantLng
          );
          const customerDist = calculateHaversineDistance(
            restaurantLat,
            restaurantLng,
            customerLat,
            customerLng
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
      })
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
        `
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
      `
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
  }
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
  }
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
  }
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

export default router;
