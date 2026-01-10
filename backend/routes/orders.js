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

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";

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
// ============================================================================

/**
 * Calculate service fee based on subtotal
 * Must match frontend calculation
 */
function calculateServiceFee(subtotal) {
  if (subtotal < 300) return 0;
  if (subtotal >= 300 && subtotal < 1000) return 31;
  if (subtotal >= 1000 && subtotal < 1500) return 42;
  if (subtotal >= 1500 && subtotal < 2500) return 56;
  return 62; // above 2500
}

/**
 * Calculate delivery fee based on distance in km
 * Must match frontend calculation
 */
function calculateDeliveryFee(distanceKm) {
  if (distanceKm === null || distanceKm === undefined) return null;

  if (distanceKm <= 1) return 50;
  if (distanceKm <= 2) return 80;
  if (distanceKm <= 2.5) return 87;

  // Above 2.5km: Rs.87 + Rs.2.3 per 100m
  const extraMeters = (distanceKm - 2.5) * 1000;
  const extra100mUnits = Math.ceil(extraMeters / 100);
  return 87 + extra100mUnits * 2.3;
}

/**
 * Generate order number
 * Format: ORD-YYYYMMDD-XXXX
 */
async function generateOrderNumber() {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, "0") +
    today.getDate().toString().padStart(2, "0");

  // Get count of orders placed today
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("orders")
    .select("*", { count: "exact", head: true })
    .gte("placed_at", startOfDay.toISOString());

  if (error) {
    console.error("Error counting orders:", error);
  }

  const seqNum = (count || 0) + 1;
  return `ORD-${dateStr}-${seqNum.toString().padStart(4, "0")}`;
}

/**
 * Valid order status transitions
 */
const VALID_TRANSITIONS = {
  placed: ["accepted", "rejected"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up"],
  picked_up: ["on_the_way"],
  on_the_way: ["delivered"],
};

// ============================================================================
// POST /orders/place - Place a new order
// ============================================================================

router.post("/place", authenticate, async (req, res) => {
  // Only customers can place orders
  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Only customers can place orders" });
  }

  const customerId = req.user.id;
  const {
    cartId,
    delivery_latitude,
    delivery_longitude,
    delivery_address,
    delivery_city,
    payment_method,
    distance_km,
    estimated_duration_min,
  } = req.body;

  // Validate required fields
  if (!cartId) {
    return res.status(400).json({ message: "Cart ID is required" });
  }

  if (!delivery_latitude || !delivery_longitude) {
    return res.status(400).json({ message: "Delivery location is required" });
  }

  if (!delivery_address) {
    return res.status(400).json({ message: "Delivery address is required" });
  }

  if (!payment_method || !["cash", "card"].includes(payment_method)) {
    return res
      .status(400)
      .json({ message: "Valid payment method is required" });
  }

  if (!distance_km || distance_km <= 0) {
    return res.status(400).json({ message: "Valid distance is required" });
  }

  if (!estimated_duration_min || estimated_duration_min <= 0) {
    return res.status(400).json({ message: "Valid duration is required" });
  }

  try {
    // ========================================================================
    // STEP 1: Fetch and validate cart
    // ========================================================================
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select(
        `
        id,
        customer_id,
        restaurant_id,
        status
      `
      )
      .eq("id", cartId)
      .eq("customer_id", customerId)
      .eq("status", "active")
      .single();

    if (cartError || !cart) {
      return res.status(404).json({ message: "Active cart not found" });
    }

    // ========================================================================
    // STEP 2: Fetch cart items with food details
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
        total_price
      `
      )
      .eq("cart_id", cartId);

    if (itemsError) {
      console.error("Cart items fetch error:", itemsError);
      return res.status(500).json({ message: "Failed to fetch cart items" });
    }

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
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
      `
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
      .select("id, username, phone, email")
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      console.error("Customer fetch error:", customerError);
      return res.status(404).json({ message: "Customer not found" });
    }

    // ========================================================================
    // STEP 5: Calculate pricing (server-side validation)
    // ========================================================================
    const subtotal = cartItems.reduce(
      (sum, item) => sum + parseFloat(item.total_price),
      0
    );

    // Validate minimum order
    if (subtotal < 300) {
      return res.status(400).json({
        message: "Minimum order amount is Rs. 300",
      });
    }

    const serviceFee = calculateServiceFee(subtotal);
    const deliveryFee = calculateDeliveryFee(distance_km);
    const totalAmount = subtotal + serviceFee + deliveryFee;

    // ========================================================================
    // STEP 6: Generate order number
    // ========================================================================
    const orderNumber = await generateOrderNumber();

    // ========================================================================
    // STEP 7: Create order (atomic transaction using Supabase)
    // ========================================================================

    // Insert order
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
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
        subtotal: subtotal.toFixed(2),
        delivery_fee: deliveryFee.toFixed(2),
        service_fee: serviceFee.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        distance_km: distance_km.toFixed(2),
        estimated_duration_min: Math.ceil(estimated_duration_min),
        payment_method: payment_method,
        payment_status: payment_method === "cash" ? "pending" : "pending",
        status: "placed",
        placed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order insert error:", orderError);
      return res.status(500).json({ message: "Failed to create order" });
    }

    // ========================================================================
    // STEP 8: Insert order items (snapshot from cart)
    // ========================================================================
    const orderItems = cartItems.map((item) => ({
      order_id: order.id,
      food_id: item.food_id,
      food_name: item.food_name,
      food_image_url: item.food_image_url,
      size: item.size || "regular",
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
    }));

    const { error: itemsInsertError } = await supabaseAdmin
      .from("order_items")
      .insert(orderItems);

    if (itemsInsertError) {
      console.error("Order items insert error:", itemsInsertError);
      // Rollback: delete the order
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      return res.status(500).json({ message: "Failed to create order items" });
    }

    // ========================================================================
    // STEP 9: Create delivery record
    // ========================================================================
    const { error: deliveryError } = await supabaseAdmin
      .from("deliveries")
      .insert({
        order_id: order.id,
        status: "pending",
      });

    if (deliveryError) {
      console.error("Delivery insert error:", deliveryError);
      // Continue anyway, delivery record can be created later
    }

    // ========================================================================
    // STEP 10: Log initial status in history
    // ========================================================================
    const { error: historyError } = await supabaseAdmin
      .from("order_status_history")
      .insert({
        order_id: order.id,
        from_status: null,
        to_status: "placed",
        changed_by: customerId,
        changed_by_role: "customer",
      });

    if (historyError) {
      console.error("Status history insert error:", historyError);
      // Continue anyway
    }

    // ========================================================================
    // STEP 11: Create notification for restaurant
    // ========================================================================

    // Get restaurant admin IDs
    const { data: admins } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("restaurant_id", restaurant.id);

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
          customer_name: customer.full_name,
          items_count: cartItems.length,
          total_amount: totalAmount,
        },
      }));

      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("Notification insert error:", notifError);
        // Continue anyway
      }
    }

    // ========================================================================
    // STEP 12: Mark cart as completed
    // ========================================================================
    const { error: cartUpdateError } = await supabaseAdmin
      .from("carts")
      .update({ status: "completed" })
      .eq("id", cartId);

    if (cartUpdateError) {
      console.error("Cart update error:", cartUpdateError);
      // Continue anyway - order is placed
    }

    // ========================================================================
    // STEP 13: Return success response
    // ========================================================================
    return res.status(201).json({
      message: "Order placed successfully",
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        restaurant_name: restaurant.restaurant_name,
        items_count: cartItems.length,
        subtotal: parseFloat(order.subtotal),
        delivery_fee: parseFloat(order.delivery_fee),
        service_fee: parseFloat(order.service_fee),
        total_amount: parseFloat(order.total_amount),
        payment_method: order.payment_method,
        estimated_duration_min: order.estimated_duration_min,
        placed_at: order.placed_at,
      },
    });
  } catch (error) {
    console.error("Place order error:", error);
    return res.status(500).json({ message: "Server error placing order" });
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
        status,
        restaurant_id,
        restaurant_name,
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
        placed_at,
        accepted_at,
        preparing_at,
        ready_at,
        picked_up_at,
        delivered_at,
        order_items (
          id,
          food_name,
          food_image_url,
          size,
          quantity,
          unit_price,
          total_price
        )
      `
      )
      .eq("customer_id", customerId)
      .order("placed_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Fetch orders error:", error);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }

    return res.json({ orders: orders || [] });
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
      `
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

    if (userRole === "admin") {
      const { data: admin } = await supabaseAdmin
        .from("admins")
        .select("restaurant_id")
        .eq("id", userId)
        .single();

      if (!admin || admin.restaurant_id !== order.restaurant_id) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    return res.json({ order });
  } catch (error) {
    console.error("Get order error:", error);
    return res.status(500).json({ message: "Server error" });
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
  const { status, limit = 50, offset = 0 } = req.query;

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
        status,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_city,
        delivery_latitude,
        delivery_longitude,
        subtotal,
        delivery_fee,
        service_fee,
        total_amount,
        distance_km,
        estimated_duration_min,
        payment_method,
        payment_status,
        placed_at,
        accepted_at,
        preparing_at,
        ready_at,
        picked_up_at,
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
          drivers (
            id,
            full_name,
            phone,
            latitute,
            longitute
          )
        )
      `
      )
      .eq("restaurant_id", admin.restaurant_id)
      .order("placed_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Fetch restaurant orders error:", error);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }

    // Get counts by status
    const { data: statusCounts } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("restaurant_id", admin.restaurant_id);

    const counts = {
      all: statusCounts?.length || 0,
      placed: statusCounts?.filter((o) => o.status === "placed").length || 0,
      accepted:
        statusCounts?.filter((o) => o.status === "accepted").length || 0,
      preparing:
        statusCounts?.filter((o) => o.status === "preparing").length || 0,
      ready: statusCounts?.filter((o) => o.status === "ready").length || 0,
      picked_up:
        statusCounts?.filter((o) => o.status === "picked_up").length || 0,
      delivered:
        statusCounts?.filter((o) => o.status === "delivered").length || 0,
      cancelled:
        statusCounts?.filter((o) => o.status === "cancelled").length || 0,
      rejected:
        statusCounts?.filter((o) => o.status === "rejected").length || 0,
    };

    return res.json({
      orders: orders || [],
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

      // Get current order
      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .select("id, status, customer_id, order_number")
        .eq("id", orderId)
        .eq("restaurant_id", admin.restaurant_id)
        .single();

      if (orderError || !order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Validate status transition
      const validTransitions = VALID_TRANSITIONS[order.status];
      if (!validTransitions || !validTransitions.includes(status)) {
        return res.status(400).json({
          message: `Cannot transition from '${order.status}' to '${status}'`,
          valid_transitions: validTransitions || [],
        });
      }

      // Prepare update data
      const updateData = { status };
      const now = new Date().toISOString();

      switch (status) {
        case "accepted":
          updateData.accepted_at = now;
          break;
        case "rejected":
          updateData.rejected_at = now;
          break;
        case "preparing":
          updateData.preparing_at = now;
          break;
        case "ready":
          updateData.ready_at = now;
          break;
        case "cancelled":
          updateData.cancelled_at = now;
          break;
      }

      // Update order
      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update(updateData)
        .eq("id", orderId);

      if (updateError) {
        console.error("Order update error:", updateError);
        return res.status(500).json({ message: "Failed to update order" });
      }

      // Log status change
      await supabaseAdmin.from("order_status_history").insert({
        order_id: orderId,
        from_status: order.status,
        to_status: status,
        changed_by: adminId,
        changed_by_role: "admin",
        reason: reason || null,
      });

      // Create notification for customer
      const notificationTypes = {
        accepted: "order_accepted",
        rejected: "order_rejected",
        preparing: "order_preparing",
        ready: "order_ready",
        cancelled: "order_cancelled",
      };

      const notificationMessages = {
        accepted: `Your order ${order.order_number} has been accepted!`,
        rejected: `Your order ${order.order_number} was rejected. ${
          reason || ""
        }`,
        preparing: `Your order ${order.order_number} is being prepared!`,
        ready: `Your order ${order.order_number} is ready for pickup!`,
        cancelled: `Your order ${order.order_number} was cancelled.`,
      };

      if (notificationTypes[status]) {
        await supabaseAdmin.from("notifications").insert({
          recipient_id: order.customer_id,
          recipient_role: "customer",
          type: notificationTypes[status],
          title:
            status === "rejected" || status === "cancelled"
              ? "Order Update"
              : "Good News!",
          message: notificationMessages[status],
          order_id: orderId,
          is_read: false,
        });
      }

      // ====================================================================
      // NOTIFY ALL DRIVERS when order is accepted
      // ====================================================================
      if (status === "accepted") {
        // Call the database function to notify all active drivers
        const { data: notifyResult, error: notifyError } =
          await supabaseAdmin.rpc("notify_drivers_new_order", {
            p_order_id: orderId,
          });

        if (notifyError) {
          console.error("Failed to notify drivers:", notifyError);
          // Don't fail the request, just log the error
        } else {
          console.log("Drivers notified:", notifyResult);
        }
      }

      return res.json({
        message: "Order status updated",
        order: {
          id: orderId,
          status: status,
          previous_status: order.status,
        },
      });
    } catch (error) {
      console.error("Update order status error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
