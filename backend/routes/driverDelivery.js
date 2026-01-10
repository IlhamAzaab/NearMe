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
      // Get pending deliveries with order details
      const { data: deliveries, error } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
        id,
        order_id,
        status,
        created_at,
        driver_id,
        orders!inner (
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
          total_amount,
          distance_km,
          estimated_duration_min,
          customer_name,
          placed_at
        )
      `
        )
        .eq("status", "pending")
        .filter("driver_id", "is", "null")
        .in("orders.status", ["accepted", "preparing", "ready"])
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Fetch available deliveries error:", error);
        return res.status(500).json({ message: "Failed to fetch deliveries" });
      }

      // Transform data for frontend
      const available = (deliveries || []).map((d) => ({
        delivery_id: d.id,
        order_id: d.order_id,
        order_number: d.orders.order_number,
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
        customer_name: d.orders.customer_name,
        total_amount: parseFloat(d.orders.total_amount),
        distance_km: parseFloat(d.orders.distance_km),
        estimated_duration_min: d.orders.estimated_duration_min,
        placed_at: d.orders.placed_at,
        order_status: d.orders.status,
      }));

      return res.json({ deliveries: available });
    } catch (error) {
      console.error("Get available deliveries error:", error);
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
          status: "assigned",
          assigned_at: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .is("driver_id", null)
        .eq("status", "pending")
        .select(
          `id, order_id, status, assigned_at, orders (
          order_number, restaurant_name, restaurant_address, restaurant_latitude, restaurant_longitude,
          delivery_address, delivery_city, delivery_latitude, delivery_longitude, total_amount, distance_km, customer_name, customer_phone
        )`
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
        },
      });
    } catch (error) {
      console.error("Accept delivery error:", error);
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

    if (!latitude || !longitude) {
      return res
        .status(400)
        .json({ message: "Latitude and longitude required" });
    }

    try {
      // Update driver location directly
      const { error } = await supabaseAdmin
        .from("deliveries")
        .update({
          driver_latitude: latitude,
          driver_longitude: longitude,
          location_updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id);

      if (error) {
        console.error("Update location error:", error);
        return res.status(500).json({ message: "Failed to update location" });
      }

      return res.json({ message: "Location updated" });
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
      "picking_up",
      "picked_up",
      "delivering",
      "delivered",
    ];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    try {
      // Update delivery status
      const { error } = await supabaseAdmin
        .from("deliveries")
        .update({
          status: status,
          ...(status === "picked_up" && {
            picked_up_at: new Date().toISOString(),
          }),
          ...(status === "delivered" && {
            delivered_at: new Date().toISOString(),
          }),
        })
        .eq("id", deliveryId)
        .eq("driver_id", req.user.id);

      if (error) {
        console.error("Update status error:", error);
        return res.status(500).json({ message: "Failed to update status" });
      }

      // Also update order status if needed
      if (status === "picked_up") {
        await supabaseAdmin
          .from("orders")
          .update({ status: "out_for_delivery" })
          .eq(
            "id",
            (
              await supabaseAdmin
                .from("deliveries")
                .select("order_id")
                .eq("id", deliveryId)
                .single()
            ).data?.order_id
          );
      } else if (status === "delivered") {
        const { data: del } = await supabaseAdmin
          .from("deliveries")
          .select("order_id")
          .eq("id", deliveryId)
          .single();
        if (del?.order_id) {
          await supabaseAdmin
            .from("orders")
            .update({ status: "delivered" })
            .eq("id", del.order_id);
        }
      }

      return res.json({ message: "Status updated", status });
    } catch (error) {
      console.error("Update status error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// ============================================================================
// GET /driver/deliveries/active - Get driver's active delivery
// ============================================================================

router.get("/deliveries/active", authenticate, driverOnly, async (req, res) => {
  try {
    const { data: delivery, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
        id,
        order_id,
        status,
        assigned_at,
        picked_up_at,
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
          total_amount,
          distance_km,
          payment_method,
          order_items (
            id,
            food_name,
            quantity,
            size
          )
        ),
        drivers:driver_id (latitude, longitude)
      `
      )
      .eq("driver_id", req.user.id)
      .not("status", "in", "(delivered,failed)")
      .order("assigned_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Fetch active delivery error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch active delivery" });
    }

    if (!delivery) {
      return res.json({ delivery: null });
    }

    return res.json({
      delivery: {
        id: delivery.id,
        order_id: delivery.order_id,
        status: delivery.status,
        driver_location: {
          latitude: delivery.drivers?.latitude
            ? parseFloat(delivery.drivers.latitude)
            : null,
          longitude: delivery.drivers?.longitude
            ? parseFloat(delivery.drivers.longitude)
            : null,
        },
        assigned_at: delivery.assigned_at,
        picked_up_at: delivery.picked_up_at,
        order: {
          order_number: delivery.orders.order_number,
          status: delivery.orders.status,
          restaurant: {
            name: delivery.orders.restaurant_name,
            address: delivery.orders.restaurant_address,
            latitude: parseFloat(delivery.orders.restaurant_latitude),
            longitude: parseFloat(delivery.orders.restaurant_longitude),
          },
          delivery: {
            address: delivery.orders.delivery_address,
            city: delivery.orders.delivery_city,
            latitude: parseFloat(delivery.orders.delivery_latitude),
            longitude: parseFloat(delivery.orders.delivery_longitude),
          },
          customer: {
            name: delivery.orders.customer_name,
            phone: delivery.orders.customer_phone,
          },
          total_amount: parseFloat(delivery.orders.total_amount),
          distance_km: parseFloat(delivery.orders.distance_km),
          payment_method: delivery.orders.payment_method,
          items: delivery.orders.order_items,
        },
      },
    });
  } catch (error) {
    console.error("Get active delivery error:", error);
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
      .select("full_name, phone, status, vehicle_type, vehicle_number")
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
