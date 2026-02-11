import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import { getSystemConfig } from "../utils/systemConfig.js";

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
        "id, full_name, user_name, email, phone, nic_number, driver_status, driver_type, city, address, force_password_change, profile_completed, onboarding_completed, onboarding_step",
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("/driver/me database error:", error);
      return res
        .status(500)
        .json({ message: "Database error", error: error.message });
    }

    if (!data) {
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
      { password: newPassword },
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

/**
 * Helper function to check if current time is within driver's working hours
 * Uses DB config for shift times, falls back to defaults
 * @param {string} workingTime - 'full_time', 'day', or 'night'
 * @returns {Promise<boolean>} - true if within working hours
 */
async function isWithinWorkingHours(workingTime) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTime = currentHour + currentMinutes / 60;

  // Load shift times from DB config
  let dayStart = 5.0,
    dayEnd = 19.0,
    nightStart = 18.0,
    nightEnd = 6.0;
  try {
    const config = await getSystemConfig();
    dayStart = parseFloat(config.day_shift_start ?? 5.0);
    dayEnd = parseFloat(config.day_shift_end ?? 19.0);
    nightStart = parseFloat(config.night_shift_start ?? 18.0);
    nightEnd = parseFloat(config.night_shift_end ?? 6.0);
  } catch (err) {
    console.error(
      "Failed to load working hours config, using defaults:",
      err.message,
    );
  }

  switch (workingTime) {
    case "full_time":
      return true; // Always active

    case "day":
      return currentTime >= dayStart && currentTime < dayEnd;

    case "night":
      // Crosses midnight: check if >= nightStart OR < nightEnd
      return currentTime >= nightStart || currentTime < nightEnd;

    default:
      return false;
  }
}

/**
 * GET /driver/profile
 * Get driver profile with photo
 * Inactive drivers can still access their profile
 */
router.get("/profile", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select(
        "id, full_name, user_name, email, phone, nic_number, driver_status, driver_type, city, address, profile_photo_url, working_time, manual_status_override, force_password_change, profile_completed, onboarding_completed, onboarding_step",
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("/driver/profile database error:", error);
      return res
        .status(500)
        .json({ message: "Database error", error: error.message });
    }

    if (!data) {
      return res.status(404).json({ message: "Driver profile not found" });
    }

    // Check if driver should be active based on working_time
    // Default to full_time if working_time is not set
    const workingTime = data.working_time || "full_time";
    const withinWorkingHours = await isWithinWorkingHours(workingTime);
    const manualOverride = data.manual_status_override || false;
    const canBeActive = withinWorkingHours || manualOverride;

    return res.json({
      driver: {
        ...data,
        working_time: workingTime,
        manual_status_override: manualOverride,
        profile_picture: data.profile_photo_url,
        within_working_hours: withinWorkingHours,
        can_be_active: canBeActive,
      },
    });
  } catch (e) {
    console.error("/driver/profile error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /driver/stats/today
 * Get today's stats (earnings and deliveries)
 */
router.get("/stats/today", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's completed deliveries with earnings
    const { data: deliveries, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        "driver_earnings, tip_amount, base_amount, extra_earnings, bonus_amount",
      )
      .eq("driver_id", driverId)
      .eq("status", "delivered")
      .gte("delivered_at", today.toISOString());

    if (error) {
      console.error("Fetch today's stats error:", error);
      return res.status(500).json({ message: "Failed to fetch stats" });
    }

    // Calculate total earnings
    // driver_earnings already includes tip_amount
    const totalEarnings = (deliveries || []).reduce((sum, d) => {
      const earnings =
        parseFloat(d.driver_earnings || 0) ||
        parseFloat(d.base_amount || 0) +
          parseFloat(d.extra_earnings || 0) +
          parseFloat(d.bonus_amount || 0) +
          parseFloat(d.tip_amount || 0);
      return sum + earnings;
    }, 0);

    return res.json({
      earnings: totalEarnings,
      deliveries: deliveries?.length || 0,
    });
  } catch (e) {
    console.error("/driver/stats/today error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /driver/status
 * Update driver online/offline status with working time validation
 * Inactive drivers CAN still access dashboard, they just can't get deliveries
 */
router.patch("/status", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { status, manualOverride } = req.body; // status: 'active' or 'inactive', manualOverride: boolean

    if (!status || !["active", "inactive"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Invalid status. Use 'active' or 'inactive'" });
    }

    // Get driver's working_time to check if they can go active
    const { data: driverData, error: fetchError } = await supabaseAdmin
      .from("drivers")
      .select("working_time, driver_status")
      .eq("id", driverId)
      .single();

    if (fetchError || !driverData) {
      console.error("Driver fetch error:", fetchError);
      return res.status(404).json({ message: "Driver not found" });
    }

    // Default working_time to full_time if not set
    const workingTime = driverData.working_time || "full_time";

    // Check if driver is trying to go active
    if (status === "active") {
      const withinWorkingHours = await isWithinWorkingHours(workingTime);

      // If outside working hours and not manually overriding, deny the request
      if (!withinWorkingHours && !manualOverride) {
        return res.status(400).json({
          message: "Cannot go active outside your working hours",
          working_time: workingTime,
          within_working_hours: false,
          hint: "Set manualOverride: true to override working hours restriction",
        });
      }

      // Update driver status to active
      const { data, error } = await supabaseAdmin
        .from("drivers")
        .update({ driver_status: "active" })
        .eq("id", driverId)
        .select()
        .single();

      if (error) {
        console.error("Update driver status error:", error);
        return res.status(500).json({ message: "Failed to update status" });
      }

      return res.json({
        message: "Status updated to active",
        status: "active",
        manual_override: !withinWorkingHours && manualOverride,
        within_working_hours: withinWorkingHours,
      });
    } else {
      // Setting to inactive - always allowed
      const { data, error } = await supabaseAdmin
        .from("drivers")
        .update({
          driver_status: "inactive",
        })
        .eq("id", driverId)
        .select()
        .single();

      if (error) {
        console.error("Update driver status error:", error);
        return res.status(500).json({ message: "Failed to update status" });
      }

      return res.json({
        message: "Status updated to inactive",
        status: "inactive",
        manual_override: false,
      });
    }
  } catch (e) {
    console.error("/driver/status error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /driver/working-hours-status
 * Check if driver should be active based on current time and working_time
 */
router.get("/working-hours-status", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;

    const { data: driverData, error } = await supabaseAdmin
      .from("drivers")
      .select("working_time, driver_status, manual_status_override")
      .eq("id", driverId)
      .single();

    if (error || !driverData) {
      console.error("Working hours status error:", error);
      return res.status(404).json({ message: "Driver not found" });
    }

    // Default to full_time if working_time is not set
    const workingTime = driverData.working_time || "full_time";
    const manualOverride = driverData.manual_status_override || false;
    const withinWorkingHours = await isWithinWorkingHours(workingTime);
    const shouldBeActive = withinWorkingHours || manualOverride;

    // If driver is active but should not be (outside working hours and no manual override)
    // Auto-update them to inactive (only if working_time is set and not full_time)
    if (
      driverData.driver_status === "active" &&
      !shouldBeActive &&
      driverData.working_time &&
      driverData.working_time !== "full_time"
    ) {
      await supabaseAdmin
        .from("drivers")
        .update({
          driver_status: "inactive",
        })
        .eq("id", driverId);

      return res.json({
        working_time: workingTime,
        within_working_hours: withinWorkingHours,
        driver_status: "inactive",
        manual_override: false,
        auto_updated: true,
        message: "Status automatically set to inactive (outside working hours)",
      });
    }

    return res.json({
      working_time: workingTime,
      within_working_hours: withinWorkingHours,
      driver_status: driverData.driver_status,
      manual_override: manualOverride,
      auto_updated: false,
    });
  } catch (e) {
    console.error("/driver/working-hours-status error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

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

export default router;
