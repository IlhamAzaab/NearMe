import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import { v2 as cloudinary } from "cloudinary";
import {
  getSriLankaDayRange,
  getSriLankaDayRangeFromDateStr,
  getSriLankaDateKey,
  shiftSriLankaDateString,
} from "../utils/sriLankaTime.js";

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * GET /admin/me
 * Get admin profile
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from("admins")
      .select(
        "id, email, phone, force_password_change, profile_completed, onboarding_step, onboarding_completed, admin_status, restaurant_id",
      )
      .eq("id", adminId)
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({ message: "Admin profile not found" });
    }

    return res.json({ admin: data });
  } catch (e) {
    console.error("/admin/me error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/restaurant
 * Get the logged-in admin's restaurant details
 */
router.get("/restaurant", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Fetch restaurant details
    const { data: restaurant, error } = await supabaseAdmin
      .from("restaurants")
      .select("*")
      .eq("id", admin.restaurant_id)
      .maybeSingle();

    if (error || !restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    return res.json({ restaurant });
  } catch (e) {
    console.error("/admin/restaurant GET error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/restaurant
 * Update the logged-in admin's restaurant details
 */
router.patch("/restaurant", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const updateData = req.body || {};

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Build update object with only provided fields
    const cleanData = {};
    if (updateData.restaurant_name !== undefined)
      cleanData.restaurant_name = updateData.restaurant_name;
    if (updateData.address !== undefined)
      cleanData.address = updateData.address;
    if (updateData.city !== undefined) cleanData.city = updateData.city;
    if (updateData.postal_code !== undefined)
      cleanData.postal_code = updateData.postal_code;
    if (updateData.opening_time !== undefined)
      cleanData.opening_time = updateData.opening_time;
    if (updateData.close_time !== undefined)
      cleanData.close_time = updateData.close_time;
    if (updateData.logo_url !== undefined)
      cleanData.logo_url = updateData.logo_url;
    if (updateData.cover_image_url !== undefined)
      cleanData.cover_image_url = updateData.cover_image_url;
    if (updateData.latitude !== undefined)
      cleanData.latitude = updateData.latitude;
    if (updateData.longitude !== undefined)
      cleanData.longitude = updateData.longitude;
    if (updateData.is_open !== undefined)
      cleanData.is_open = !!updateData.is_open;
    if (updateData.is_manually_overridden !== undefined)
      cleanData.is_manually_overridden = !!updateData.is_manually_overridden;

    cleanData.updated_at = new Date().toISOString();

    // Update restaurant
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("restaurants")
      .update(cleanData)
      .eq("id", admin.restaurant_id)
      .select()
      .maybeSingle();

    if (updateError || !updated) {
      console.error("Update error:", updateError);
      return res.status(500).json({ message: "Failed to update restaurant" });
    }

    return res.json({ restaurant: updated });
  } catch (e) {
    console.error("/admin/restaurant PATCH error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/restaurant/toggle-open
 * Toggle the restaurant's is_open status (manual override)
 */
router.patch("/restaurant/toggle-open", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Get current status
    const { data: restaurant, error: fetchError } = await supabaseAdmin
      .from("restaurants")
      .select("is_open")
      .eq("id", admin.restaurant_id)
      .maybeSingle();

    if (fetchError || !restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const newIsOpen = !restaurant.is_open;

    // Update is_open and set manual override
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("restaurants")
      .update({
        is_open: newIsOpen,
        is_manually_overridden: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", admin.restaurant_id)
      .select()
      .maybeSingle();

    if (updateError || !updated) {
      console.error("Toggle error:", updateError);
      return res
        .status(500)
        .json({ message: "Failed to toggle restaurant status" });
    }

    return res.json({ restaurant: updated, is_open: newIsOpen });
  } catch (e) {
    console.error("/admin/restaurant/toggle-open error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/update-profile", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { username, phone, newPassword } = req.body || {};

    // Check if profile already completed
    const { data: currentProfile, error: fetchError } = await supabaseAdmin
      .from("admins")
      .select("profile_completed")
      .eq("id", adminId)
      .maybeSingle();

    if (fetchError || !currentProfile) {
      return res.status(404).json({ message: "Admin profile not found" });
    }

    if (currentProfile.profile_completed) {
      return res.status(400).json({
        message: "Profile already completed. No further changes allowed.",
      });
    }

    // Validate required fields
    if (!username || !phone || !newPassword) {
      return res
        .status(400)
        .json({ message: "username, phone, and newPassword are required" });
    }

    // Update password in Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      adminId,
      { password: newPassword },
    );

    if (authError) {
      console.error("Password update error:", authError);
      return res.status(500).json({ message: "Failed to update password" });
    }

    // Update admins table
    const { error: updateError } = await supabaseAdmin
      .from("admins")
      .update({
        phone,
        force_password_change: false,
        profile_completed: true,
      })
      .eq("id", adminId);

    if (updateError) {
      console.error("Profile update error:", updateError);
      return res.status(500).json({ message: "Failed to update profile" });
    }

    return res.json({
      message: "Profile updated successfully. No further changes allowed.",
    });
  } catch (e) {
    console.error("/admin/update-profile error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/stats
 * Enhanced dashboard metrics for admin
 */
router.get("/stats", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Get admin's restaurant_id to scope all queries
    const { data: adminProfile } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .single();

    if (!adminProfile?.restaurant_id) {
      return res
        .status(400)
        .json({ message: "No restaurant linked to this admin" });
    }

    const restId = adminProfile.restaurant_id;

    // Total orders (scoped to this restaurant)
    const { count: ordersCount, error: ordersErr } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restId);

    if (ordersErr) throw ordersErr;

    // Total revenue (scoped)
    const { data: revenueData, error: revenueErr } = await supabaseAdmin
      .from("orders")
      .select("total_amount")
      .eq("restaurant_id", restId);

    const totalRevenue =
      revenueData?.reduce(
        (sum, order) => sum + (parseFloat(order.total_amount) || 0),
        0,
      ) || 0;

    // Today's orders and revenue (scoped)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const { data: todayOrders, error: todayErr } = await supabaseAdmin
      .from("orders")
      .select("total_amount")
      .eq("restaurant_id", restId)
      .gte("created_at", todayISO);

    const todayOrdersCount = todayOrders?.length || 0;
    const todayRevenue =
      todayOrders?.reduce(
        (sum, order) => sum + (parseFloat(order.total_amount) || 0),
        0,
      ) || 0;

    // Foods count (scoped to this restaurant)
    const { count: foodsCount, error: foodsErr } = await supabaseAdmin
      .from("foods")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restId);

    // Available foods (scoped)
    const { count: availableFoods, error: availErr } = await supabaseAdmin
      .from("foods")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restId)
      .eq("is_available", true);

    // Unique customers who ordered from this restaurant
    const { data: customerData, error: custErr } = await supabaseAdmin
      .from("orders")
      .select("customer_id")
      .eq("restaurant_id", restId);
    const uniqueCustomers = new Set(
      (customerData || []).map((o) => o.customer_id),
    ).size;

    // Calculate average order value
    const avgOrderValue = ordersCount > 0 ? totalRevenue / ordersCount : 0;

    return res.json({
      stats: {
        totalOrders: ordersCount || 0,
        totalRevenue: totalRevenue,
        totalProducts: foodsCount || 0,
        availableProducts: availableFoods || 0,
        activeCustomers: uniqueCustomers,
        todayOrders: todayOrdersCount,
        todayRevenue: todayRevenue,
        avgOrderValue: avgOrderValue,
      },
    });
  } catch (e) {
    console.error("/admin/stats error:", e);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

/**
 * GET /admin/dashboard-stats
 * Combined endpoint for the restructured admin dashboard.
 * Returns today performance (with yesterday comparison), lifetime totals,
 * products info, and chart data — all using admin earnings (restaurant_payment).
 * Query params: chartPeriod (week|month|year) default: week
 */
router.get("/dashboard-stats", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { chartPeriod = "week" } = req.query;

    // Get restaurant ID
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .maybeSingle();

    if (adminError || !adminData?.restaurant_id) {
      return res
        .status(404)
        .json({ message: "Restaurant not found for admin" });
    }

    const restaurantId = adminData.restaurant_id;

    // Get qualifying deliveries (picked_up or later = admin earned)
    const { data: qualifyingDeliveries, error: qualDelError } =
      await supabaseAdmin
        .from("deliveries")
        .select("order_id")
        .in("status", ["picked_up", "on_the_way", "at_customer", "delivered"]);

    if (qualDelError) {
      console.error("Qualifying deliveries error:", qualDelError);
      return res
        .status(500)
        .json({ message: "Failed to fetch dashboard data" });
    }

    const qualifyingOrderIds = (qualifyingDeliveries || []).map(
      (d) => d.order_id,
    );

    // --- Time calculations ---
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // Yesterday at same time = from yesterday midnight to exactly 24h ago
    const yesterdaySameTime = new Date(now);
    yesterdaySameTime.setDate(yesterdaySameTime.getDate() - 1);

    // Helper to build a scoped query on order_financial_details
    const buildQuery = (selectFields) => {
      let q = supabaseAdmin
        .from("order_financial_details")
        .select(selectFields)
        .eq("restaurant_id", restaurantId);
      if (qualifyingOrderIds.length > 0) {
        q = q.in("order_id", qualifyingOrderIds);
      } else {
        return null; // no qualifying orders
      }
      return q;
    };

    // --- Today's data (from midnight to now) ---
    let todaySales = 0,
      todayOrders = 0,
      todayAvg = 0;
    const todayQ = buildQuery("restaurant_payment");
    if (todayQ) {
      const { data: todayData } = await todayQ.gte(
        "placed_at",
        todayStart.toISOString(),
      );
      todayOrders = todayData?.length || 0;
      todaySales = (todayData || []).reduce(
        (s, o) => s + parseFloat(o.restaurant_payment || 0),
        0,
      );
      todayAvg = todayOrders > 0 ? todaySales / todayOrders : 0;
    }

    // --- Yesterday at same time (from yesterday midnight to yesterday same hour/minute) ---
    let yesterdaySales = 0,
      yesterdayOrders = 0,
      yesterdayAvg = 0;
    const yesterdayQ = buildQuery("restaurant_payment");
    if (yesterdayQ) {
      const { data: yesterdayData } = await yesterdayQ
        .gte("placed_at", yesterdayStart.toISOString())
        .lte("placed_at", yesterdaySameTime.toISOString());
      yesterdayOrders = yesterdayData?.length || 0;
      yesterdaySales = (yesterdayData || []).reduce(
        (s, o) => s + parseFloat(o.restaurant_payment || 0),
        0,
      );
      yesterdayAvg = yesterdayOrders > 0 ? yesterdaySales / yesterdayOrders : 0;
    }

    // --- Percentage changes ---
    const calcChange = (today, yesterday) => {
      if (yesterday === 0) return today > 0 ? 100 : 0;
      return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
    };

    const salesChange = calcChange(todaySales, yesterdaySales);
    const ordersChange = calcChange(todayOrders, yesterdayOrders);
    const avgChange = calcChange(todayAvg, yesterdayAvg);

    // --- Last 30 days totals (using admin earnings) ---
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // --- Previous 30 days (days 31-60) for comparison ---
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    sixtyDaysAgo.setHours(0, 0, 0, 0);

    let last30Revenue = 0,
      last30Orders = 0;
    const last30Q = buildQuery("restaurant_payment");
    if (last30Q) {
      const { data: last30Data } = await last30Q.gte(
        "placed_at",
        thirtyDaysAgo.toISOString(),
      );
      last30Orders = last30Data?.length || 0;
      last30Revenue = (last30Data || []).reduce(
        (s, o) => s + parseFloat(o.restaurant_payment || 0),
        0,
      );
    }

    let prev30Revenue = 0;
    const prev30Q = buildQuery("restaurant_payment");
    if (prev30Q) {
      const { data: prev30Data } = await prev30Q
        .gte("placed_at", sixtyDaysAgo.toISOString())
        .lt("placed_at", thirtyDaysAgo.toISOString());
      prev30Revenue = (prev30Data || []).reduce(
        (s, o) => s + parseFloat(o.restaurant_payment || 0),
        0,
      );
    }

    const last30Change =
      prev30Revenue === 0
        ? last30Revenue > 0
          ? 100
          : 0
        : Math.round(((last30Revenue - prev30Revenue) / prev30Revenue) * 1000) /
          10;

    // --- Products info ---
    const { count: totalProducts } = await supabaseAdmin
      .from("foods")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId);

    const { count: availableProducts } = await supabaseAdmin
      .from("foods")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true);

    // --- Chart data ---
    let chartStartDate = new Date(now);
    let groupBy = "day"; // day or month

    switch (chartPeriod) {
      case "week":
        chartStartDate.setDate(chartStartDate.getDate() - 7);
        groupBy = "day";
        break;
      case "month":
        chartStartDate.setDate(chartStartDate.getDate() - 30);
        groupBy = "day";
        break;
      case "year":
        chartStartDate.setFullYear(chartStartDate.getFullYear() - 1);
        groupBy = "month";
        break;
      default:
        chartStartDate.setDate(chartStartDate.getDate() - 7);
        groupBy = "day";
    }

    let chartData = [];
    const chartQ = buildQuery("restaurant_payment, placed_at");
    if (chartQ) {
      const { data: chartOrders } = await chartQ
        .gte("placed_at", chartStartDate.toISOString())
        .order("placed_at", { ascending: true });

      const grouped = {};
      (chartOrders || []).forEach((order) => {
        const d = new Date(order.placed_at);
        const key =
          groupBy === "month"
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
            : d.toISOString().split("T")[0];
        if (!grouped[key]) grouped[key] = { amount: 0, orders: 0 };
        grouped[key].amount += parseFloat(order.restaurant_payment || 0);
        grouped[key].orders += 1;
      });

      // Fill missing dates/months with zero values
      if (groupBy === "day") {
        const cursor = new Date(chartStartDate);
        cursor.setHours(0, 0, 0, 0);
        const endDate = new Date(now);
        endDate.setHours(0, 0, 0, 0);
        while (cursor <= endDate) {
          const key = cursor.toISOString().split("T")[0];
          if (!grouped[key]) grouped[key] = { amount: 0, orders: 0 };
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        const cursor = new Date(chartStartDate);
        const endMonth = now.getFullYear() * 12 + now.getMonth();
        while (cursor.getFullYear() * 12 + cursor.getMonth() <= endMonth) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          if (!grouped[key]) grouped[key] = { amount: 0, orders: 0 };
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      chartData = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          amount: Math.round(data.amount),
          orders: data.orders,
        }));
    }

    return res.json({
      today: {
        sales: Math.round(todaySales),
        orders: todayOrders,
        avgOrderValue: Math.round(todayAvg),
      },
      yesterday: {
        sales: Math.round(yesterdaySales),
        orders: yesterdayOrders,
        avgOrderValue: Math.round(yesterdayAvg),
      },
      changes: {
        salesChange,
        ordersChange,
        avgChange,
      },
      lifetime: {
        totalRevenue: Math.round(last30Revenue),
        totalOrders: last30Orders,
        revenueChange: last30Change,
      },
      products: {
        total: totalProducts || 0,
        available: availableProducts || 0,
      },
      chartData,
      chartPeriod,
    });
  } catch (e) {
    console.error("/admin/dashboard-stats error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/orders
 * Get recent orders for admin dashboard
 */
router.get("/orders", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const limit = parseInt(req.query.limit) || 10;

    // Get admin's restaurant_id
    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (!admin?.restaurant_id) {
      return res.json({ orders: [] });
    }

    // Fetch orders with financial details including restaurant_payment
    const { data: orders, error } = await supabaseAdmin
      .from("order_financial_details")
      .select("*")
      .eq("restaurant_id", admin.restaurant_id)
      .order("placed_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Get order items for each order
    const orderIds = (orders || []).map((o) => o.order_id);
    const { data: orderItems } = await supabaseAdmin
      .from("order_items")
      .select("order_id, food_name, quantity, size, unit_price, total_price")
      .in("order_id", orderIds);

    // Get delivery statuses for each order
    const { data: deliveries } = await supabaseAdmin
      .from("deliveries")
      .select("order_id, status")
      .in("order_id", orderIds);

    const deliveryStatusByOrder = (deliveries || []).reduce((acc, d) => {
      acc[d.order_id] = d.status;
      return acc;
    }, {});

    // Group items by order_id
    const itemsByOrder = (orderItems || []).reduce((acc, item) => {
      if (!acc[item.order_id]) acc[item.order_id] = [];
      acc[item.order_id].push(item);
      return acc;
    }, {});

    // Transform orders for dashboard display
    const transformed = (orders || []).map((o) => ({
      id: o.order_id,
      order_number: o.order_number,
      customer: o.customer_name || "Unknown",
      items:
        (itemsByOrder[o.order_id] || [])
          .map((item) => `${item.quantity}x ${item.food_name}`)
          .join(", ") || "No items",
      item_details: (itemsByOrder[o.order_id] || []).map((item) => ({
        food_name: item.food_name,
        quantity: Number(item.quantity || 0),
        size: item.size || "regular",
        unit_price: Number(item.unit_price || 0),
        total_price: Number(item.total_price || 0),
      })),
      amount: parseFloat(o.restaurant_payment || 0),
      total_price: (itemsByOrder[o.order_id] || []).reduce(
        (sum, item) => sum + Number(item.total_price || 0),
        0,
      ),
      status: o.status,
      delivery_status: deliveryStatusByOrder[o.order_id] || null,
      time: new Date(o.placed_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      created_at: o.placed_at,
    }));

    return res.json({ orders: transformed });
  } catch (e) {
    console.error("/admin/orders error:", e);
    return res.status(500).json({ message: "Failed to load orders" });
  }
});

/**
 * PUT /admin/change-password
 * Change admin password (for forced password change)
 */
router.put("/change-password", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { username, newPassword } = req.body;

    // Validation
    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    // Update password in Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      adminId,
      { password: newPassword },
    );

    if (authError) {
      console.error("Password update error:", authError);
      return res.status(500).json({ message: "Failed to update password" });
    }

    // Update admins table - clear force_password_change flag
    const { error: updateError } = await supabaseAdmin
      .from("admins")
      .update({
        force_password_change: false,
      })
      .eq("id", adminId);

    if (updateError) {
      console.error("Admin update error:", updateError);
      return res.status(500).json({ message: "Failed to update admin record" });
    }

    return res.json({
      message: "Password changed successfully",
    });
  } catch (e) {
    console.error("/admin/change-password error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/foods
 * List all foods for the admin's restaurant
 */
router.get("/foods", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const { data: foods, error } = await supabaseAdmin
      .from("foods")
      .select(
        "id, name, description, image_url, is_available, available_time, regular_size, regular_portion, regular_price, offer_price, extra_size, extra_portion, extra_price, extra_offer_price, stars, created_at",
      )
      .eq("restaurant_id", admin.restaurant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch foods error:", error);
      return res.status(500).json({ message: "Failed to fetch foods" });
    }

    return res.json({ foods: foods || [] });
  } catch (e) {
    console.error("/admin/foods error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /admin/foods
 * Add a new food/product
 */
router.post("/foods", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Get admin's restaurant_id
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (adminError || !admin?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const {
      name,
      description,
      image_url,
      available_time,
      regular_size,
      regular_portion,
      regular_price,
      offer_price,
      extra_size,
      extra_portion,
      extra_price,
      extra_offer_price,
    } = req.body || {};

    // Validate required fields
    if (
      !name ||
      !regular_price ||
      !available_time ||
      available_time.length === 0
    ) {
      return res.status(400).json({
        message: "name, regular_price, and available_time are required",
      });
    }

    const { data: food, error } = await supabaseAdmin
      .from("foods")
      .insert({
        restaurant_id: admin.restaurant_id,
        name: name.trim(),
        description: description?.trim() || null,
        image_url: image_url || null,
        available_time,
        regular_size: regular_size?.trim() || null,
        regular_portion: regular_portion?.trim() || null,
        regular_price: parseFloat(regular_price),
        offer_price: offer_price ? parseFloat(offer_price) : null,
        extra_size: extra_size?.trim() || null,
        extra_portion: extra_portion?.trim() || null,
        extra_price: extra_price ? parseFloat(extra_price) : null,
        extra_offer_price: extra_offer_price
          ? parseFloat(extra_offer_price)
          : null,
        is_available: true,
      })
      .select();

    if (error) {
      console.error("Create food error:", error);
      return res.status(500).json({ message: "Failed to create food" });
    }

    return res
      .status(201)
      .json({ message: "Food added successfully", food: food[0] });
  } catch (e) {
    console.error("/admin/foods POST error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/foods/:foodId
 * Get a specific food details
 */
router.get("/foods/:foodId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { foodId } = req.params;

    const { data: food, error } = await supabaseAdmin
      .from("foods")
      .select("*")
      .eq("id", foodId)
      .maybeSingle();

    if (error || !food) {
      return res.status(404).json({ message: "Food not found" });
    }

    // Verify admin owns this restaurant
    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (food.restaurant_id !== admin.restaurant_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    return res.json({ food });
  } catch (e) {
    console.error("/admin/foods/:foodId GET error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/foods/:foodId
 * Update a food/product
 */
router.patch("/foods/:foodId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { foodId } = req.params;
    const updateData = req.body || {};

    // Verify admin owns this food
    const { data: food, error: foodError } = await supabaseAdmin
      .from("foods")
      .select("restaurant_id")
      .eq("id", foodId)
      .maybeSingle();

    if (foodError || !food) {
      return res.status(404).json({ message: "Food not found" });
    }

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (food.restaurant_id !== admin.restaurant_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Build update object
    const cleanData = {};
    if (updateData.name !== undefined) cleanData.name = updateData.name.trim();
    if (updateData.description !== undefined)
      cleanData.description = updateData.description?.trim() || null;
    if (updateData.image_url !== undefined)
      cleanData.image_url = updateData.image_url;
    if (updateData.is_available !== undefined) {
      cleanData.is_available = updateData.is_available;
      // When admin toggles availability, set the manual flag accordingly
      // is_manually_unavailable = true means admin explicitly turned it off
      // is_manually_unavailable = false means scheduler can control it
      cleanData.is_manually_unavailable = !updateData.is_available;
    }
    if (updateData.available_time !== undefined)
      cleanData.available_time = updateData.available_time;
    if (updateData.regular_size !== undefined)
      cleanData.regular_size = updateData.regular_size?.trim() || null;
    if (updateData.regular_portion !== undefined)
      cleanData.regular_portion = updateData.regular_portion?.trim() || null;
    if (updateData.regular_price !== undefined)
      cleanData.regular_price = parseFloat(updateData.regular_price);
    if (updateData.offer_price !== undefined)
      cleanData.offer_price = updateData.offer_price
        ? parseFloat(updateData.offer_price)
        : null;
    if (updateData.extra_size !== undefined)
      cleanData.extra_size = updateData.extra_size?.trim() || null;
    if (updateData.extra_portion !== undefined)
      cleanData.extra_portion = updateData.extra_portion?.trim() || null;
    if (updateData.extra_price !== undefined)
      cleanData.extra_price = updateData.extra_price
        ? parseFloat(updateData.extra_price)
        : null;
    if (updateData.extra_offer_price !== undefined)
      cleanData.extra_offer_price = updateData.extra_offer_price
        ? parseFloat(updateData.extra_offer_price)
        : null;

    cleanData.updated_at = new Date().toISOString();

    const { data: updatedFood, error } = await supabaseAdmin
      .from("foods")
      .update(cleanData)
      .eq("id", foodId)
      .select();

    if (error) {
      console.error("Update food error:", error);
      return res.status(500).json({ message: "Failed to update food" });
    }

    return res.json({
      message: "Food updated successfully",
      food: updatedFood[0],
    });
  } catch (e) {
    console.error("/admin/foods/:foodId PATCH error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /admin/foods/:foodId
 * Delete a food/product
 */
router.delete("/foods/:foodId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { foodId } = req.params;

    // Verify admin owns this food
    const { data: food, error: foodError } = await supabaseAdmin
      .from("foods")
      .select("restaurant_id")
      .eq("id", foodId)
      .maybeSingle();

    if (foodError || !food) {
      return res.status(404).json({ message: "Food not found" });
    }

    const { data: admin } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", req.user.id)
      .maybeSingle();

    if (food.restaurant_id !== admin.restaurant_id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { error } = await supabaseAdmin
      .from("foods")
      .delete()
      .eq("id", foodId);

    if (error) {
      console.error("Delete food error:", error);
      return res.status(500).json({ message: "Failed to delete food" });
    }

    return res.json({ message: "Food deleted successfully" });
  } catch (e) {
    console.error("/admin/foods/:foodId DELETE error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /admin/upload-image
 * Upload image to Cloudinary and return URL
 */
router.post("/upload-image", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ message: "Image data is required" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(imageData, {
      folder: "nearme/food-products",
      resource_type: "auto",
    });

    return res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (e) {
    console.error("/admin/upload-image error:", e);
    return res.status(500).json({ message: "Failed to upload image" });
  }
});

/**
 * GET /admin/notifications
 * Get notifications for admin from notification_log + scheduled_notifications
 */
router.get("/notifications", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    // 1) Fetch from notification_log (individual notifications for this user)
    const { data: logData, error: logError } = await supabaseAdmin
      .from("notification_log")
      .select("*")
      .eq("user_id", adminId)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (logError) {
      console.error("notification_log fetch error:", logError);
    }

    // 2) Fetch from scheduled_notifications (sent broadcasts targeting admin role)
    const { data: scheduledData, error: schedError } = await supabaseAdmin
      .from("scheduled_notifications")
      .select("*")
      .eq("role", "admin")
      .eq("status", "sent")
      .or(`recipient_ids.is.null,recipient_ids.cs.{${adminId}}`)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (schedError) {
      console.error("scheduled_notifications fetch error:", schedError);
    }

    // Normalize notification_log entries
    const normalizedLog = (logData || []).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      data: n.data || {},
      status: n.status,
      created_at: n.sent_at,
      source: "notification_log",
    }));

    // Normalize scheduled_notifications entries
    const normalizedScheduled = (scheduledData || []).map((s) => ({
      id: s.id,
      title: s.title,
      body: s.body,
      data: s.data || {},
      status: s.status,
      created_at: s.sent_at || s.created_at,
      source: "scheduled",
    }));

    // Merge, sort by time desc, limit
    const all = [...normalizedLog, ...normalizedScheduled]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    return res.json({ notifications: all });
  } catch (e) {
    console.error("/admin/notifications error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/notifications/mark-all-read
 * Mark all unread notifications as read
 * IMPORTANT: This must come BEFORE /:id/read route
 */
router.patch("/notifications/mark-all-read", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // notification_log table doesn't have is_read field - it's read-only
    // Just return success since notifications are auto-read when fetched
    return res.json({ success: true, updated: 0 });
  } catch (e) {
    console.error("/admin/notifications/mark-all-read error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /admin/notifications/:id/read
 * Mark notification as read
 */
router.patch("/notifications/:id/read", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // notification_log table doesn't have is_read field - it's read-only
    // Just return success since notifications are auto-read when fetched
    return res.json({ success: true });
  } catch (e) {
    console.error("/admin/notifications/:id/read error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// ADMIN EARNINGS & FINANCIAL REPORTS
// ============================================================================

/**
 * GET /admin/earnings
 * Get admin earnings summary (restaurant_payment from order_financial_details view)
 * Query params: period (today, week, month, year, all, custom), startDate, endDate
 */
router.get("/earnings", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const { period = "all", startDate, endDate } = req.query;

    // Get restaurant ID for this admin
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .maybeSingle();

    if (adminError || !adminData?.restaurant_id) {
      return res
        .status(404)
        .json({ message: "Restaurant not found for admin" });
    }

    const restaurantId = adminData.restaurant_id;

    // Admin earnings are counted at actual delivery completion time.
    const now = new Date();
    const {
      dateStr: todayDateStr,
      start: todayStart,
      end: todayEnd,
    } = getSriLankaDayRange(now);

    const inRange = (timestamp, start, end) => {
      if (!timestamp) return false;
      if (start && timestamp < start) return false;
      if (end && timestamp > end) return false;
      return true;
    };

    let periodStart = null;
    let periodEnd = null;

    switch (period) {
      case "today":
        periodStart = todayStart;
        periodEnd = todayEnd;
        break;
      case "week": {
        const weekStartDateStr = shiftSriLankaDateString(todayDateStr, -6);
        periodStart = getSriLankaDayRangeFromDateStr(weekStartDateStr).start;
        periodEnd = todayEnd;
        break;
      }
      case "month": {
        const monthStartDateStr = `${todayDateStr.slice(0, 7)}-01`;
        periodStart = getSriLankaDayRangeFromDateStr(monthStartDateStr).start;
        periodEnd = todayEnd;
        break;
      }
      case "year": {
        const yearStartDateStr = `${todayDateStr.slice(0, 4)}-01-01`;
        periodStart = getSriLankaDayRangeFromDateStr(yearStartDateStr).start;
        periodEnd = todayEnd;
        break;
      }
      case "custom": {
        if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
          periodStart = getSriLankaDayRangeFromDateStr(startDate).start;
        } else if (startDate) {
          periodStart = new Date(startDate).toISOString();
        }
        if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
          periodEnd = getSriLankaDayRangeFromDateStr(endDate).end;
        } else if (endDate) {
          periodEnd = new Date(endDate).toISOString();
        }
        break;
      }
      default:
        break;
    }

    const { data: deliveredRows, error: deliveredError } = await supabaseAdmin
      .from("deliveries")
      .select(
        "order_id, delivered_at, orders!inner(restaurant_id, admin_subtotal)",
      )
      .eq("status", "delivered")
      .eq("orders.restaurant_id", restaurantId)
      .not("delivered_at", "is", null);

    if (deliveredError) {
      console.error("Delivered rows fetch error:", deliveredError);
      return res.status(500).json({ message: "Failed to fetch earnings data" });
    }

    const records = (deliveredRows || []).map((row) => ({
      delivered_at: row.delivered_at,
      amount: parseFloat(row.orders?.admin_subtotal || 0),
    }));

    const periodRecords = records.filter((r) =>
      inRange(r.delivered_at, periodStart, periodEnd),
    );

    const totalRevenue = periodRecords.reduce((sum, r) => sum + r.amount, 0);
    const totalOrders = periodRecords.length;

    const todayRecords = records.filter((r) =>
      inRange(r.delivered_at, todayStart, todayEnd),
    );
    const todaySales = todayRecords.reduce((sum, r) => sum + r.amount, 0);
    const todayOrderCount = todayRecords.length;

    const weekStartDateStr = shiftSriLankaDateString(todayDateStr, -6);
    const weekStart = getSriLankaDayRangeFromDateStr(weekStartDateStr).start;
    const thisWeekRecords = records.filter((r) =>
      inRange(r.delivered_at, weekStart, todayEnd),
    );
    const thisWeekRevenue = thisWeekRecords.reduce(
      (sum, r) => sum + r.amount,
      0,
    );

    // Calculate previous period revenue for comparison (period-aware)
    let previousRevenue = 0;
    let prevStart = null;
    let prevEnd = null;

    switch (period) {
      case "today": {
        const yesterdayDateStr = shiftSriLankaDateString(todayDateStr, -1);
        const yesterdayRange = getSriLankaDayRangeFromDateStr(yesterdayDateStr);
        prevStart = yesterdayRange.start;
        prevEnd = yesterdayRange.end;
        break;
      }
      case "week": {
        const prevWeekStartStr = shiftSriLankaDateString(todayDateStr, -13);
        const prevWeekEndStr = shiftSriLankaDateString(todayDateStr, -7);
        prevStart = getSriLankaDayRangeFromDateStr(prevWeekStartStr).start;
        prevEnd = getSriLankaDayRangeFromDateStr(prevWeekEndStr).end;
        break;
      }
      case "month": {
        const prevMonthStartStr = shiftSriLankaDateString(todayDateStr, -59);
        const prevMonthEndStr = shiftSriLankaDateString(todayDateStr, -30);
        prevStart = getSriLankaDayRangeFromDateStr(prevMonthStartStr).start;
        prevEnd = getSriLankaDayRangeFromDateStr(prevMonthEndStr).end;
        break;
      }
      case "year": {
        const prevYearStartStr = shiftSriLankaDateString(todayDateStr, -730);
        const prevYearEndStr = shiftSriLankaDateString(todayDateStr, -366);
        prevStart = getSriLankaDayRangeFromDateStr(prevYearStartStr).start;
        prevEnd = getSriLankaDayRangeFromDateStr(prevYearEndStr).end;
        break;
      }
      default:
        break;
    }

    if (prevStart && prevEnd) {
      previousRevenue = records
        .filter((r) => inRange(r.delivered_at, prevStart, prevEnd))
        .reduce((sum, r) => sum + r.amount, 0);
    }

    // Calculate percentage change based on period-aware comparison
    let percentageChange = 0;
    if (previousRevenue > 0) {
      percentageChange =
        ((totalRevenue - previousRevenue) / previousRevenue) * 100;
    } else if (totalRevenue > 0 && period !== "all") {
      percentageChange = 100; // new revenue where there was none before
    }

    // Get daily earnings for chart (last 30 Sri Lanka days)
    const chartStartDateStr = shiftSriLankaDateString(todayDateStr, -29);
    const chartStart = getSriLankaDayRangeFromDateStr(chartStartDateStr).start;

    const dailyEarnings = {};
    records
      .filter((r) => inRange(r.delivered_at, chartStart, todayEnd))
      .forEach((record) => {
        const date = getSriLankaDateKey(record.delivered_at);
        if (!dailyEarnings[date]) {
          dailyEarnings[date] = 0;
        }
        dailyEarnings[date] += record.amount;
      });

    // Convert to array for chart
    const chartData = Object.entries(dailyEarnings).map(([date, amount]) => ({
      date,
      amount: Math.round(amount),
    }));

    return res.json({
      earnings: {
        totalRevenue: Math.round(totalRevenue),
        totalOrders,
        todaySales: Math.round(todaySales),
        todayOrderCount,
        thisWeekRevenue: Math.round(thisWeekRevenue),
        previousRevenue: Math.round(previousRevenue),
        percentageChange: Math.round(percentageChange * 10) / 10,
        chartData,
        period,
      },
    });
  } catch (e) {
    console.error("/admin/earnings error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /admin/payouts
 * Get admin payout history using order_financial_details view
 * Returns completed orders with restaurant_payment as the payout amount
 */
router.get("/payouts", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    // Get restaurant ID
    const { data: adminData } = await supabaseAdmin
      .from("admins")
      .select("restaurant_id")
      .eq("id", adminId)
      .maybeSingle();

    if (!adminData?.restaurant_id) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // Get delivered orders as payouts using the view
    const { data: payouts, error } = await supabaseAdmin
      .from("order_financial_details")
      .select("order_id, order_number, restaurant_payment, placed_at, status")
      .eq("restaurant_id", adminData.restaurant_id)
      .eq("status", "delivered")
      .order("placed_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Payouts fetch error:", error);
      return res.status(500).json({ message: "Failed to fetch payouts" });
    }

    // Format as payout records - restaurant_payment is what admin receives
    const formattedPayouts = (payouts || []).map((order) => ({
      id: order.order_id,
      order_number: order.order_number,
      amount: parseFloat(order.restaurant_payment || 0),
      date: order.placed_at,
      status: "processed", // Since delivered orders are considered paid
      type: "order_payment",
    }));

    return res.json({ payouts: formattedPayouts });
  } catch (e) {
    console.error("/admin/payouts error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
