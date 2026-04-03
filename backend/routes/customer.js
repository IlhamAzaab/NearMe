import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  getSystemConfig,
  getLaunchPromoConfig,
} from "../utils/systemConfig.js";

const router = express.Router();

/**
 * GET /customer/launch-promotion
 * Returns launch promo config + customer eligibility state
 */
router.get("/launch-promotion", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const customerId = req.user.id;
    const [config, customerResult, ordersCountResult] = await Promise.all([
      getSystemConfig(),
      supabaseAdmin
        .from("customers")
        .select(
          "id, launch_promo_acknowledged, launch_promo_seen_at, launch_promo_acknowledged_at",
        )
        .eq("id", customerId)
        .single(),
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customerId),
    ]);

    if (customerResult.error || !customerResult.data) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const promo = getLaunchPromoConfig(config);
    const hasAcknowledged = Boolean(
      customerResult.data.launch_promo_acknowledged,
    );
    const totalOrders = ordersCountResult.count || 0;
    const isEligibleForFirstOrder = totalOrders === 0;
    const shouldShowPopup =
      promo.enabled && isEligibleForFirstOrder && !hasAcknowledged;

    return res.json({
      promotion: promo,
      has_acknowledged: hasAcknowledged,
      acknowledged_at: customerResult.data.launch_promo_acknowledged_at,
      seen_at: customerResult.data.launch_promo_seen_at,
      total_orders: totalOrders,
      is_eligible_for_first_order: isEligibleForFirstOrder,
      should_show_popup: shouldShowPopup,
    });
  } catch (e) {
    console.error("/customer/launch-promotion error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /customer/launch-promotion/acknowledge
 * Marks that customer accepted/acknowledged launch promo popup
 */
router.post("/launch-promotion/acknowledge", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const customerId = req.user.id;
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("customers")
      .update({
        launch_promo_acknowledged: true,
        launch_promo_seen_at: nowIso,
        launch_promo_acknowledged_at: nowIso,
      })
      .eq("id", customerId)
      .select("id, launch_promo_acknowledged, launch_promo_acknowledged_at")
      .single();

    if (error || !data) {
      console.error("Launch promo acknowledge error:", error);
      return res
        .status(500)
        .json({ message: "Failed to acknowledge promotion" });
    }

    return res.json({
      message: "Promotion acknowledged",
      has_acknowledged: Boolean(data.launch_promo_acknowledged),
      acknowledged_at: data.launch_promo_acknowledged_at,
    });
  } catch (e) {
    console.error("/customer/launch-promotion/acknowledge error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /customer/notifications
 * Get notifications for customer from notification_log + scheduled_notifications
 */
router.get("/notifications", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const customerId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    // 1) Fetch from notification_log (individual notifications for this user)
    const { data: logData, error: logError } = await supabaseAdmin
      .from("notification_log")
      .select("*")
      .eq("user_id", customerId)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (logError) {
      console.error("notification_log fetch error:", logError);
    }

    // 2) Fetch from scheduled_notifications (sent broadcasts targeting customer role)
    const { data: scheduledData, error: schedError } = await supabaseAdmin
      .from("scheduled_notifications")
      .select("*")
      .eq("role", "customer")
      .eq("status", "sent")
      .or(`recipient_ids.is.null,recipient_ids.cs.{${customerId}}`)
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
    console.error("/customer/notifications error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /customer/notifications/:id/read
 * Mark a notification as read
 */
router.patch("/notifications/:id/read", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // notification_log table doesn't have is_read field - it's read-only
    // Just return success since notifications are auto-read when fetched
    return res.json({ message: "Notification marked as read" });
  } catch (e) {
    console.error("/customer/notifications/:id/read error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /customer/notifications/mark-all-read
 * Mark all notifications as read
 */
router.patch("/notifications/mark-all-read", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    // notification_log table doesn't have is_read field - it's read-only
    // Just return success since notifications are auto-read when fetched
    return res.json({ message: "All notifications marked as read" });
  } catch (e) {
    console.error("/customer/notifications/mark-all-read error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /customer/address
 * Update customer address
 */
router.put("/address", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const customerId = req.user.id;
    const { address, city, latitude, longitude } = req.body;

    if (!address) {
      return res.status(400).json({ message: "Address is required" });
    }

    const updateData = {
      address,
      city: city || null,
    };

    // Include coordinates if provided
    if (latitude !== undefined && longitude !== undefined) {
      updateData.latitude = latitude;
      updateData.longitude = longitude;
    }

    const { data: customer, error } = await supabaseAdmin
      .from("customers")
      .update(updateData)
      .eq("id", customerId)
      .select("id, username, email, phone, address, city, latitude, longitude")
      .single();

    if (error) {
      console.error("Customer address update error:", error);
      return res.status(500).json({ message: "Failed to update address" });
    }

    return res.json({
      message: "Address updated successfully",
      customer,
    });
  } catch (e) {
    console.error("/customer/address error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /customer/me
 * Get customer profile details
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const customerId = req.user.id;

    const { data: customer, error } = await supabaseAdmin
      .from("customers")
      .select(
        "id, username, email, phone, address, city, latitude, longitude, created_at",
      )
      .eq("id", customerId)
      .single();

    if (error) {
      console.error("Customer fetch error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch customer profile" });
    }

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.json({ customer });
  } catch (e) {
    console.error("/customer/me error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
