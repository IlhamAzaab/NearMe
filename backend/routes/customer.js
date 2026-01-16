import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { supabaseAdmin } from "../supabaseAdmin.js";

const router = express.Router();

/**
 * GET /customer/notifications
 * Get notifications for customer
 */
router.get("/notifications", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const customerId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("recipient_id", customerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Customer notifications fetch error:", error);
      return res.status(500).json({ message: "Failed to fetch notifications" });
    }

    return res.json({ notifications: data || [] });
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

    const notifId = req.params.id;
    const customerId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notifId)
      .eq("recipient_id", customerId)
      .select()
      .single();

    if (error) {
      console.error("Mark read error:", error);
      return res.status(500).json({ message: "Failed to mark as read" });
    }

    return res.json({ notification: data });
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

    const customerId = req.user.id;

    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", customerId)
      .eq("is_read", false);

    if (error) {
      console.error("Mark all read error:", error);
      return res.status(500).json({ message: "Failed to mark all as read" });
    }

    return res.json({ message: "All notifications marked as read" });
  } catch (e) {
    console.error("/customer/notifications/mark-all-read error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
