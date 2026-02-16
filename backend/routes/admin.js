import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import { v2 as cloudinary } from "cloudinary";

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

    // --- Lifetime totals (all time, using admin earnings) ---
    let lifetimeRevenue = 0,
      lifetimeOrders = 0;
    const lifetimeQ = buildQuery("restaurant_payment");
    if (lifetimeQ) {
      const { data: lifetimeData } = await lifetimeQ;
      lifetimeOrders = lifetimeData?.length || 0;
      lifetimeRevenue = (lifetimeData || []).reduce(
        (s, o) => s + parseFloat(o.restaurant_payment || 0),
        0,
      );
    }

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
        totalRevenue: Math.round(lifetimeRevenue),
        totalOrders: lifetimeOrders,
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
      .select("order_id, food_name, quantity")
      .in("order_id", orderIds);

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
      amount: parseFloat(o.restaurant_payment || 0),
      status: o.status,
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
        "id, name, description, image_url, is_available, available_time, regular_size, regular_portion, regular_price, offer_price, extra_size, extra_portion, extra_price, stars, created_at",
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
    if (updateData.is_available !== undefined)
      cleanData.is_available = updateData.is_available;
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
 * Get notifications for admin
 */
router.get("/notifications", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const adminId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("recipient_id", adminId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Notifications fetch error:", error);
      return res.status(500).json({ message: "Failed to fetch notifications" });
    }

    return res.json({ notifications: data || [] });
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

    const adminId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", adminId)
      .eq("is_read", false)
      .select();

    if (error) {
      console.error("Mark all read error:", error);
      return res.status(500).json({ message: "Failed to mark all as read" });
    }

    return res.json({ success: true, updated: data?.length || 0 });
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

    const adminId = req.user.id;
    const notificationId = req.params.id;

    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_id", adminId);

    if (error) {
      console.error("Mark read error:", error);
      return res.status(500).json({ message: "Failed to mark as read" });
    }

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

    // Calculate date ranges
    const now = new Date();
    let dateFilter = null;

    switch (period) {
      case "today":
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        dateFilter = { start: todayStart.toISOString() };
        break;
      case "week":
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        dateFilter = { start: weekStart.toISOString() };
        break;
      case "month":
        const monthStart = new Date(now);
        monthStart.setDate(monthStart.getDate() - 30);
        dateFilter = { start: monthStart.toISOString() };
        break;
      case "year":
        const yearStart = new Date(now);
        yearStart.setFullYear(yearStart.getFullYear() - 1);
        dateFilter = { start: yearStart.toISOString() };
        break;
      case "custom":
        if (startDate)
          dateFilter = { start: new Date(startDate).toISOString() };
        if (endDate)
          dateFilter = { ...dateFilter, end: new Date(endDate).toISOString() };
        break;
      default:
        // all - no filter
        break;
    }

    // Admin (restaurant) earns when driver picks up the order
    // First get order IDs where delivery status is picked_up or later
    const { data: qualifyingDeliveries, error: qualDelError } =
      await supabaseAdmin
        .from("deliveries")
        .select("order_id")
        .in("status", ["picked_up", "on_the_way", "at_customer", "delivered"]);

    if (qualDelError) {
      console.error("Qualifying deliveries fetch error:", qualDelError);
      return res.status(500).json({ message: "Failed to fetch earnings data" });
    }

    const qualifyingOrderIds = (qualifyingDeliveries || []).map(
      (d) => d.order_id,
    );

    // Use order_financial_details view for consistent financial data
    // restaurant_payment = admin_subtotal (what admin receives)
    // Only count orders where driver has picked up (delivery status >= picked_up)
    let totalQuery = supabaseAdmin
      .from("order_financial_details")
      .select("restaurant_payment, placed_at, status")
      .eq("restaurant_id", restaurantId);

    // Only include orders with qualifying deliveries
    if (qualifyingOrderIds.length > 0) {
      totalQuery = totalQuery.in("order_id", qualifyingOrderIds);
    } else {
      // No qualifying orders, return empty earnings
      return res.json({
        earnings: {
          totalRevenue: 0,
          totalOrders: 0,
          todaySales: 0,
          todayOrderCount: 0,
          thisWeekRevenue: 0,
          lastWeekRevenue: 0,
          percentageChange: 0,
          chartData: [],
          period,
        },
      });
    }

    if (dateFilter?.start) {
      totalQuery = totalQuery.gte("placed_at", dateFilter.start);
    }
    if (dateFilter?.end) {
      totalQuery = totalQuery.lte("placed_at", dateFilter.end);
    }

    const { data: orders, error: ordersError } = await totalQuery;

    if (ordersError) {
      console.error("Orders fetch error:", ordersError);
      return res.status(500).json({ message: "Failed to fetch earnings data" });
    }

    // Calculate totals using restaurant_payment (what admin receives)
    const totalRevenue = (orders || []).reduce((sum, order) => {
      return sum + parseFloat(order.restaurant_payment || 0);
    }, 0);

    const totalOrders = orders?.length || 0;

    // Get today's sales separately
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    let todayQuery = supabaseAdmin
      .from("order_financial_details")
      .select("restaurant_payment")
      .eq("restaurant_id", restaurantId)
      .gte("placed_at", todayStart.toISOString());

    if (qualifyingOrderIds.length > 0) {
      todayQuery = todayQuery.in("order_id", qualifyingOrderIds);
    }

    const { data: todayOrders, error: todayError } = await todayQuery;

    const todaySales = (todayOrders || []).reduce((sum, order) => {
      return sum + parseFloat(order.restaurant_payment || 0);
    }, 0);

    const todayOrderCount = todayOrders?.length || 0;

    // Get last week's revenue for comparison
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(lastWeekStart.getDate() - 14);
    const lastWeekEnd = new Date(now);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

    let lastWeekQuery = supabaseAdmin
      .from("order_financial_details")
      .select("restaurant_payment")
      .eq("restaurant_id", restaurantId)
      .gte("placed_at", lastWeekStart.toISOString())
      .lt("placed_at", lastWeekEnd.toISOString());

    if (qualifyingOrderIds.length > 0) {
      lastWeekQuery = lastWeekQuery.in("order_id", qualifyingOrderIds);
    }

    const { data: lastWeekOrders } = await lastWeekQuery;

    const lastWeekRevenue = (lastWeekOrders || []).reduce((sum, order) => {
      return sum + parseFloat(order.restaurant_payment || 0);
    }, 0);

    // Calculate this week's revenue
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);

    let thisWeekQuery = supabaseAdmin
      .from("order_financial_details")
      .select("restaurant_payment")
      .eq("restaurant_id", restaurantId)
      .gte("placed_at", thisWeekStart.toISOString());

    if (qualifyingOrderIds.length > 0) {
      thisWeekQuery = thisWeekQuery.in("order_id", qualifyingOrderIds);
    }

    const { data: thisWeekOrders } = await thisWeekQuery;

    const thisWeekRevenue = (thisWeekOrders || []).reduce((sum, order) => {
      return sum + parseFloat(order.restaurant_payment || 0);
    }, 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (lastWeekRevenue > 0) {
      percentageChange =
        ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100;
    }

    // Get daily earnings for chart (last 30 days)
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let chartQuery = supabaseAdmin
      .from("order_financial_details")
      .select("restaurant_payment, placed_at")
      .eq("restaurant_id", restaurantId)
      .gte("placed_at", thirtyDaysAgo.toISOString())
      .order("placed_at", { ascending: true });

    if (qualifyingOrderIds.length > 0) {
      chartQuery = chartQuery.in("order_id", qualifyingOrderIds);
    }

    const { data: chartOrders } = await chartQuery;

    // Group by date for chart
    const dailyEarnings = {};
    (chartOrders || []).forEach((order) => {
      const date = new Date(order.placed_at).toISOString().split("T")[0];
      if (!dailyEarnings[date]) {
        dailyEarnings[date] = 0;
      }
      dailyEarnings[date] += parseFloat(order.restaurant_payment || 0);
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
        lastWeekRevenue: Math.round(lastWeekRevenue),
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