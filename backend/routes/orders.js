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
import {
  getCartItemPrices,
  calculateCustomerPrice,
} from "../utils/commission.js";
import {
  broadcastNewDelivery,
  broadcastDeliveryTaken,
  notifyCustomer,
  notifyAdmin,
} from "../utils/socketManager.js";
import {
  getSystemConfig,
  calculateServiceFeeFromConfig,
  calculateDeliveryFeeFromConfig,
} from "../utils/systemConfig.js";
import { calculateCustomerETA } from "../utils/etaCalculator.js";

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
 * Calculate road distance using OSRM routing API
 */
async function calculateRouteDistance(lat1, lon1, lat2, lon2) {
  try {
    // Use FOOT profile for shortest distance (motorcycles can use walking paths in town)
    const url = `https://router.project-osrm.org/route/v1/foot/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distance: route.distance / 1000, // Convert meters to kilometers
        duration: route.duration / 60, // Convert seconds to minutes
        success: true,
      };
    }
    return { success: false, error: "No route found" };
  } catch (error) {
    console.error("OSRM routing error:", error);
    return { success: false, error: error.message };
  }
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
  let {
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

  // Payment method defaults to cash
  if (!payment_method) {
    payment_method = "cash";
  }

  if (!["cash", "card"].includes(payment_method)) {
    return res
      .status(400)
      .json({ message: "Valid payment method is required" });
  }

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

    // Immediately mark cart as completed to prevent duplicate orders
    // This is the atomic lock - if another request tries to do the same,
    // they'll fail because status is no longer 'active'
    const { error: lockError } = await supabaseAdmin
      .from("carts")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", cartId)
      .eq("status", "active"); // Only update if still active

    if (lockError) {
      console.error("Cart lock error:", lockError);
      return res
        .status(409)
        .json({ message: "Order is being processed, please wait" });
    }

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
          extra_offer_price
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
      .select("id, username, phone, email, address, city, latitude, longitude")
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      console.error("Customer fetch error:", customerError);
      return res.status(404).json({ message: "Customer not found" });
    }

    // ========================================================================
    // STEP 4.5: Get delivery location from customer if not provided
    // ========================================================================
    if (!delivery_latitude || !delivery_longitude) {
      if (customer.latitude && customer.longitude) {
        delivery_latitude = parseFloat(customer.latitude);
        delivery_longitude = parseFloat(customer.longitude);
      } else {
        return res.status(400).json({
          message:
            "Delivery location is required. Please set your location in profile.",
        });
      }
    }

    if (!delivery_address) {
      if (customer.address) {
        delivery_address = customer.address;
        delivery_city = customer.city || "";
      } else {
        return res
          .status(400)
          .json({ message: "Delivery address is required" });
      }
    }

    // ========================================================================
    // STEP 4.6: Calculate distance and duration if not provided
    // ========================================================================
    if (
      !distance_km ||
      !estimated_duration_min ||
      distance_km <= 0 ||
      estimated_duration_min <= 0
    ) {
      const routeResult = await calculateRouteDistance(
        delivery_latitude,
        delivery_longitude,
        parseFloat(restaurant.latitude),
        parseFloat(restaurant.longitude),
      );

      if (routeResult.success) {
        distance_km = routeResult.distance;
        estimated_duration_min = routeResult.duration;
      } else {
        // Fallback: calculate straight-line distance
        const R = 6371; // Earth's radius in km
        const dLat =
          ((parseFloat(restaurant.latitude) - delivery_latitude) * Math.PI) /
          180;
        const dLon =
          ((parseFloat(restaurant.longitude) - delivery_longitude) * Math.PI) /
          180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((delivery_latitude * Math.PI) / 180) *
            Math.cos((parseFloat(restaurant.latitude) * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance_km = R * c * 1.3; // Add 30% for road distance approximation
        estimated_duration_min = distance_km * 3; // Rough estimate: 3 min per km
      }
    }

    // ========================================================================
    // STEP 5: Calculate pricing with commission (server-side validation)
    // ========================================================================

    // Recalculate prices with commission from current food prices
    let customerSubtotal = 0;
    let adminSubtotal = 0;
    let commissionTotal = 0;

    const processedItems = cartItems.map((item) => {
      const food = item.foods;
      let adminPrice, customerPrice, commission;

      if (food) {
        // Recalculate from current food prices
        const prices = getCartItemPrices(food, item.size);
        adminPrice = prices.adminPrice;
        customerPrice = prices.customerPrice;
        commission = prices.commission;
      } else {
        // Fallback to stored values
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

      return {
        ...item,
        admin_unit_price: adminPrice,
        admin_total_price: adminTotal,
        customer_unit_price: customerPrice,
        customer_total_price: customerTotal,
        commission_per_item: commission,
        total_commission: itemCommission,
      };
    });

    const subtotal = customerSubtotal; // Customer subtotal includes commission

    // Validate distance and minimum order based on distance constraints from config
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

    // Check if restaurant is too far
    if (distance_km > maxOrderDistanceKm) {
      return res.status(400).json({
        message: `Restaurant is too far away (${distance_km.toFixed(1)} km). Maximum ordering distance is ${maxOrderDistanceKm} km.`,
        error_type: "distance_exceeded",
        distance_km: parseFloat(distance_km.toFixed(2)),
        max_distance_km: maxOrderDistanceKm,
      });
    }

    // Find the matching constraint tier for this distance
    const sortedConstraints = [...orderDistanceConstraints].sort(
      (a, b) => a.min_km - b.min_km,
    );
    let requiredMinSubtotal = 300; // default fallback
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

    const serviceFee = await calculateServiceFee(subtotal);
    const deliveryFee = await calculateDeliveryFee(distance_km);
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
        admin_subtotal: adminSubtotal.toFixed(2),
        commission_total: commissionTotal.toFixed(2),
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
      // Rollback: reset cart status to active
      await supabaseAdmin
        .from("carts")
        .update({ status: "active" })
        .eq("id", cartId);
      return res.status(500).json({ message: "Failed to create order" });
    }

    // ========================================================================
    // STEP 8: Insert order items with commission data (snapshot from cart)
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
      return res.status(500).json({ message: "Failed to create order items" });
    }

    // ========================================================================
    // STEP 9: Create delivery record
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
    // STEP 10: Log initial status in history
    // ========================================================================
    const { error: historyError } = await supabaseAdmin
      .from("order_status_history")
      .insert({
        order_id: order.id,
        previous_status: null,
        new_status: "placed",
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
    const { data: admins, error: adminsError } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("restaurant_id", restaurant.id);

    console.log("🔍 Found admins for restaurant:", {
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

      console.log("📤 Creating notifications:", notifications);

      const { data: insertedNotifs, error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert(notifications)
        .select();

      if (notifError) {
        console.error("❌ Notification insert error:", notifError);
        // Continue anyway
      } else {
        console.log("✅ Notifications created successfully:", insertedNotifs);
      }

      // 🔔 WebSocket: Notify each online admin in real-time
      const itemsSummary = processedItems
        .map((item) => `${item.quantity}x ${item.food_name}`)
        .join(", ");
      const firstItemImage = processedItems[0]?.food_image_url || null;

      for (const admin of admins) {
        notifyAdmin(admin.id, "order:new_order", {
          type: "new_order",
          title: "New Order Arrived!",
          message: itemsSummary,
          order_id: order.id,
          order_number: orderNumber,
          items_summary: itemsSummary,
          items_count: processedItems.length,
          total_amount: totalAmount,
          customer_name: customer.username,
          food_image: firstItemImage,
          restaurant_id: restaurant.id,
        });
      }
    } else {
      console.log("⚠️ No admins found for restaurant");
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
      const deliveryStatus = delivery?.status || null;

      // Determine the effective status for UI navigation
      // Priority: delivery status (if exists) > order status
      let effectiveStatus = order.status;
      if (deliveryStatus) {
        // Map delivery statuses to navigation statuses
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
        }
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

  try {
    // Fetch order with delivery info including driver location
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        customer_id,
        restaurant_id,
        restaurant_name,
        status,
        delivery_address,
        delivery_latitude,
        delivery_longitude,
        estimated_duration_min,
        deliveries (
          id,
          status,
          driver_id,
          current_latitude,
          current_longitude,
          last_location_update,
          picked_up_at,
          delivered_at
        ),
        restaurants (
          logo_url
        )
      `,
      )
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify access - customer can only see their own orders
    if (userRole === "customer" && order.customer_id !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Admin can only see their own restaurant's orders
    if (userRole === "admin") {
      const { data: adminData } = await supabaseAdmin
        .from("admins")
        .select("restaurant_id")
        .eq("id", userId)
        .single();
      if (!adminData || adminData.restaurant_id !== order.restaurant_id) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    // Driver can only track deliveries assigned to them
    if (userRole === "driver") {
      const delivery = order.deliveries?.[0] || order.deliveries;
      if (!delivery || delivery.driver_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    // Get delivery status
    const delivery = order.deliveries?.[0] || order.deliveries;
    const deliveryStatus = delivery?.status || "placed";

    // Fetch restaurant logo if not included in the join
    let restaurantLogo = order.restaurants?.logo_url || null;
    if (!restaurantLogo && order.restaurant_id) {
      const { data: restaurant } = await supabaseAdmin
        .from("restaurants")
        .select("logo_url")
        .eq("id", order.restaurant_id)
        .single();

      restaurantLogo = restaurant?.logo_url || null;
    }

    // Fetch driver info if driver is assigned
    let driverInfo = null;
    if (delivery?.driver_id) {
      // Get driver details
      const { data: driver } = await supabaseAdmin
        .from("drivers")
        .select("id, full_name, phone, driver_type, profile_photo_url")
        .eq("id", delivery.driver_id)
        .single();

      if (driver) {
        // Get vehicle info
        const { data: vehicle } = await supabaseAdmin
          .from("driver_vehicle_license")
          .select("vehicle_number, vehicle_type, vehicle_model")
          .eq("driver_id", delivery.driver_id)
          .single();

        driverInfo = {
          id: driver.id,
          full_name: driver.full_name,
          phone: driver.phone,
          driver_type: driver.driver_type,
          profile_photo_url: driver.profile_photo_url,
          vehicle_number: vehicle?.vehicle_number || null,
          vehicle_type: vehicle?.vehicle_type || driver.driver_type,
          vehicle_model: vehicle?.vehicle_model || null,
        };
      }
    }

    // Calculate dynamic ETA for customer
    let eta = null;
    if (
      delivery?.driver_id &&
      ["accepted", "picked_up", "on_the_way", "at_customer"].includes(
        deliveryStatus,
      )
    ) {
      const driverLoc =
        delivery?.current_latitude && delivery?.current_longitude
          ? {
              latitude: parseFloat(delivery.current_latitude),
              longitude: parseFloat(delivery.current_longitude),
            }
          : null;
      eta = await calculateCustomerETA(orderId, driverLoc);
    }

    // Fallback ETA from order's estimated_duration_min when no driver yet
    if (!eta && order.estimated_duration_min) {
      const baseMins = order.estimated_duration_min;
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

    return res.json({
      orderId: order.id,
      orderStatus: order.status,
      status: deliveryStatus,
      driverId: delivery?.driver_id || null,
      pickedUpAt: delivery?.picked_up_at || null,
      deliveredAt: delivery?.delivered_at || null,
      driver: driverInfo,
      // Location data for live tracking
      driverLocation:
        delivery?.current_latitude && delivery?.current_longitude
          ? {
              latitude: parseFloat(delivery.current_latitude),
              longitude: parseFloat(delivery.current_longitude),
              lastUpdate: delivery.last_location_update,
            }
          : null,
      customerLocation: {
        latitude: order.delivery_latitude
          ? parseFloat(order.delivery_latitude)
          : null,
        longitude: order.delivery_longitude
          ? parseFloat(order.delivery_longitude)
          : null,
        address: order.delivery_address,
      },
      restaurantName: order.restaurant_name,
      restaurantLogo: restaurantLogo,
      estimatedDuration: order.estimated_duration_min,
      // Dynamic ETA
      eta: eta
        ? {
            etaMinutes: eta.etaMinutes,
            etaRangeMin: eta.etaRangeMin,
            etaRangeMax: eta.etaRangeMax,
            etaDisplay: eta.etaDisplay,
            stopsBeforeCustomer: eta.stopsBeforeCustomer,
            driverStatus: eta.driverStatus,
            isExact: eta.isExact || false,
          }
        : null,
    });
  } catch (error) {
    console.error("Get delivery status error:", error);
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
        admin_subtotal,
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
          total_price,
          admin_unit_price,
          admin_total_price
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

      // Create notification for customer using RPC (SECURITY DEFINER)
      const notificationTypes = {
        accepted: "order_accepted",
        rejected: "order_rejected",
        preparing: "order_preparing",
        ready: "order_ready",
        cancelled: "order_cancelled",
      };

      const notificationTitles = {
        accepted: "Order Accepted",
        rejected: "Order Update",
        preparing: "Order Being Prepared",
        ready: "Order Ready",
        cancelled: "Order Update",
      };

      const notificationMessages = {
        accepted: `Your order has been accepted by the restaurant and is being prepared.`,
        rejected: `Your order ${order.order_number} was rejected. ${
          reason || ""
        }`,
        preparing: `Your order ${order.order_number} is being prepared!`,
        ready: `Your order ${order.order_number} is ready for pickup!`,
        cancelled: `Your order ${order.order_number} was cancelled.`,
      };

      if (notificationTypes[status]) {
        const { error: notifError } = await supabaseAdmin
          .from("notifications")
          .insert({
            recipient_id: order.customer_id,
            recipient_role: "customer",
            order_id: orderId,
            restaurant_id: admin.restaurant_id,
            type: notificationTypes[status],
            title: notificationTitles[status],
            message: notificationMessages[status],
            metadata: {
              order_number: order.order_number,
              status: status,
            },
          });

        if (notifError) {
          console.error("❌ Customer notification error:", notifError);
        } else {
          console.log("✅ Customer notified successfully");
        }

        // 📡 REAL-TIME WEBSOCKET: Notify customer instantly
        if (order.customer_id) {
          notifyCustomer(order.customer_id, "order:status_update", {
            type: notificationTypes[status],
            title: notificationTitles[status],
            message: notificationMessages[status],
            order_id: orderId,
            order_number: order.order_number,
            status: status,
          });
          console.log(
            `📡 WebSocket: Customer ${order.customer_id} notified of status: ${status}`,
          );
        }
      }

      // ====================================================================
      // NOTIFY ALL ACTIVE DRIVERS when order is accepted
      // ====================================================================
      if (status === "accepted") {
        try {
          // Check if delivery already exists
          const { data: existingDelivery } = await supabaseAdmin
            .from("deliveries")
            .select("id")
            .eq("order_id", orderId)
            .maybeSingle();

          let delivery = existingDelivery;

          // Create delivery record only if it doesn't exist
          if (!existingDelivery) {
            const { data: newDelivery, error: deliveryError } =
              await supabaseAdmin
                .from("deliveries")
                .insert({
                  order_id: orderId,
                  status: "pending",
                  res_accepted_at: new Date().toISOString(), // Restaurant acceptance timestamp
                })
                .select("id")
                .single();

            if (deliveryError) {
              console.error("❌ Delivery creation error:", deliveryError);
              return res.json({
                message: "Order status updated but delivery creation failed",
                order: { id: orderId, status: status },
              });
            }
            delivery = newDelivery;
            console.log("✅ Delivery record created:", delivery.id);
          } else {
            console.log("ℹ️ Delivery already exists:", delivery.id);
            // Ensure delivery resets to pending (waiting for driver assignment)
            const { error: deliveryUpdateError } = await supabaseAdmin
              .from("deliveries")
              .update({
                status: "pending",
                driver_id: null,
                res_accepted_at: new Date().toISOString(), // Restaurant acceptance timestamp
                accepted_at: null,
                rejected_at: null,
                picked_up_at: null,
                on_the_way_at: null,
                arrived_customer_at: null,
                delivered_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq("order_id", orderId);

            if (deliveryUpdateError) {
              console.error(
                "❌ Failed to reset delivery to pending:",
                deliveryUpdateError,
              );
            }
          }

          // Get all active drivers
          const { data: activeDrivers, error: driversError } =
            await supabaseAdmin
              .from("drivers")
              .select("id")
              .eq("driver_status", "active");

          if (!driversError && activeDrivers && activeDrivers.length > 0) {
            console.log(
              `📤 Notifying ${activeDrivers.length} active drivers...`,
            );

            // Notify each driver (direct insert with service_role)
            const notificationPromises = activeDrivers.map((driver) =>
              supabaseAdmin.from("notifications").insert({
                recipient_id: driver.id,
                recipient_role: "driver",
                order_id: orderId,
                restaurant_id: admin.restaurant_id,
                type: "new_delivery",
                title: "New Delivery Available",
                message:
                  "A new delivery is available. Check available deliveries.",
                metadata: {
                  order_id: orderId,
                  delivery_id: delivery.id,
                  order_number: order.order_number,
                },
              }),
            );

            const results = await Promise.allSettled(notificationPromises);
            const successCount = results.filter(
              (r) => r.status === "fulfilled",
            ).length;
            const failCount = results.filter(
              (r) => r.status === "rejected",
            ).length;

            console.log(
              `✅ Notified ${successCount} drivers successfully${
                failCount > 0 ? `, ${failCount} failed` : ""
              }`,
            );

            // ================================================================
            // 🚀 REAL-TIME WEBSOCKET BROADCAST - Fair Instant Notification
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

            const broadcastResult = broadcastNewDelivery({
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
              `📡 WebSocket broadcast result: ${broadcastResult.driversNotified} drivers notified instantly`,
            );
          } else {
            console.log("⚠️ No active drivers found");
          }
        } catch (err) {
          console.error("❌ Error in driver notification flow:", err);
          // Don't fail the request, just log the error
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
  },
);

export default router;
