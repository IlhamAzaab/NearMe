import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";

const router = express.Router();

/**
 * GET /driver/me
 * Get driver profile
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select(
        "id, full_name, user_name, email, phone, nic_number, driver_status, driver_type, city, address, force_password_change, profile_completed, onboarding_completed, onboarding_step"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({ message: "Driver profile not found" });
    }

    return res.json({ driver: data });
  } catch (e) {
    console.error("/driver/me error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /driver/update-profile
 * Update driver profile (one-time only)
 */
router.put("/update-profile", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const userId = req.user.id;
    const { userName, newPassword } = req.body || {};

    const { data: currentProfile, error: fetchError } = await supabaseAdmin
      .from("drivers")
      .select("profile_completed")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError || !currentProfile) {
      return res.status(404).json({ message: "Driver profile not found" });
    }

    if (currentProfile.profile_completed) {
      return res.status(400).json({
        message: "Profile already completed. No further changes allowed.",
      });
    }

    if (!userName || userName.trim().length < 3) {
      return res
        .status(400)
        .json({ message: "userName is required (min 3 characters)" });
    }

    if (!newPassword) {
      return res.status(400).json({ message: "newPassword is required" });
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (authError) {
      console.error("Driver password update error:", authError);
      return res.status(500).json({ message: "Failed to update password" });
    }

    const { data: updatedData, error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        user_name: userName.trim(),
        force_password_change: false,
        driver_status: "pending",
      })
      .eq("id", userId)
      .select();

    if (updateError) {
      console.error("Driver profile update error:", updateError);
      return res.status(500).json({
        message: "Failed to update profile",
        error: updateError.message,
        details: updateError,
      });
    }

    return res.json({
      message: "Profile updated successfully. No further changes allowed.",
      driver: updatedData?.[0],
    });
  } catch (e) {
    console.error("/driver/update-profile error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
/**
 * GET /driver/notifications
 * Fetch driver notifications
 */
router.get("/notifications", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const limit = parseInt(req.query.limit || "50", 10);

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("recipient_id", driverId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Fetch driver notifications error:", error);
      return res.status(500).json({ message: "Failed to fetch notifications" });
    }

    return res.json({ notifications: data || [] });
  } catch (e) {
    console.error("/driver/notifications error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});
