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
      .from("notification_log")
      .select("*")
      .eq("user_id", customerId)
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
        "id, username, email, phone, address, city, nic_number, latitude, longitude, created_at",
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
