import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import { getSystemConfig } from "../utils/systemConfig.js";
import {
  getSriLankaDayRange,
  getSriLankaDateString,
} from "../utils/sriLankaTime.js";

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
        "id, full_name, email, phone, nic_number, date_of_birth, driver_status, driver_type, city, address, profile_photo_url, working_time, force_password_change, profile_completed, onboarding_completed, onboarding_step",
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

    // Fetch vehicle/license details from driver_vehicle_license table
    let vehicleDetails = null;
    try {
      const { data: vehicleData } = await supabaseAdmin
        .from("driver_vehicle_license")
        .select(
          "vehicle_number, vehicle_type, vehicle_model, insurance_expiry, vehicle_license_expiry, driving_license_number, license_expiry_date",
        )
        .eq("driver_id", userId)
        .maybeSingle();
      vehicleDetails = vehicleData || null;
    } catch (vErr) {
      console.error("Vehicle fetch error:", vErr);
    }

    return res.json({
      driver: {
        ...data,
        profile_picture: data.profile_photo_url,
        vehicle_number: vehicleDetails?.vehicle_number || null,
        vehicle_type: vehicleDetails?.vehicle_type || null,
        vehicle_model: vehicleDetails?.vehicle_model || null,
        insurance_expiry: vehicleDetails?.insurance_expiry || null,
        vehicle_license_expiry: vehicleDetails?.vehicle_license_expiry || null,
        driving_license_number: vehicleDetails?.driving_license_number || null,
        license_expiry_date: vehicleDetails?.license_expiry_date || null,
        vehicle: vehicleDetails,
      },
    });
  } catch (e) {
    console.error("/driver/me error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /driver/bank-account
 * Return latest bank account details for logged-in driver.
 */
router.get("/bank-account", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { data: bankAccount, error } = await supabaseAdmin
      .from("driver_bank_accounts")
      .select(
        "id, driver_id, account_holder_name, bank_name, branch, account_number, verified, verified_at, created_at",
      )
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("/driver/bank-account fetch error:", error);
      return res.status(500).json({ message: "Failed to load bank details" });
    }

    if (!bankAccount) {
      return res.status(404).json({ message: "Bank details not found" });
    }

    return res.json({ bankAccount });
  } catch (e) {
    console.error("/driver/bank-account error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /driver/contract
 * Return latest accepted contract data for logged-in driver.
 */
router.get("/contract", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { data: contract, error } = await supabaseAdmin
      .from("driver_contracts")
      .select(
        "id, driver_id, contract_version, accepted_at, ip_address, user_agent, contract_html, created_at",
      )
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("/driver/contract fetch error:", error);
      return res.status(500).json({ message: "Failed to load contract" });
    }

    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    return res.json({ contract });
  } catch (e) {
    console.error("/driver/contract error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /driver/documents
 * Return uploaded documents for logged-in driver.
 */
router.get("/documents", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { data: documents, error } = await supabaseAdmin
      .from("driver_documents")
      .select(
        "id, driver_id, document_type, document_url, uploaded_at, verified, verified_at, rejection_reason",
      )
      .eq("driver_id", driverId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("/driver/documents fetch error:", error);
      return res.status(500).json({ message: "Failed to load documents" });
    }

    return res.json({ documents: documents || [] });
  } catch (e) {
    console.error("/driver/documents error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /driver/documents
 * Upsert a single driver document record.
 */
router.post("/documents", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { documentType, documentUrl } = req.body || {};

    const allowedTypes = new Set([
      "license_front",
      "license_back",
      "insurance",
      "revenue_license",
    ]);

    if (!allowedTypes.has(String(documentType || "").trim())) {
      return res.status(400).json({
        message:
          "Invalid document type. Allowed values: license_front, license_back, insurance, revenue_license",
      });
    }

    if (!documentUrl || typeof documentUrl !== "string") {
      return res.status(400).json({ message: "documentUrl is required" });
    }

    const payload = {
      driver_id: driverId,
      document_type: String(documentType).trim(),
      document_url: documentUrl.trim(),
      uploaded_at: new Date().toISOString(),
      verified: false,
      verified_at: null,
      rejection_reason: null,
    };

    const { data, error } = await supabaseAdmin
      .from("driver_documents")
      .upsert(payload, { onConflict: "driver_id,document_type" })
      .select(
        "id, driver_id, document_type, document_url, uploaded_at, verified, verified_at, rejection_reason",
      )
      .maybeSingle();

    if (error) {
      console.error("/driver/documents upsert error:", error);
      return res.status(500).json({ message: "Failed to save document" });
    }

    return res.json({
      message: "Document saved successfully",
      document: data,
    });
  } catch (e) {
    console.error("/driver/documents error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /driver/vehicle-expiry
 * Update vehicle-related expiry dates for logged-in driver.
 */
router.put("/vehicle-expiry", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const { insuranceExpiry, vehicleLicenseExpiry, licenseExpiryDate } =
      req.body || {};

    if (!insuranceExpiry || !vehicleLicenseExpiry || !licenseExpiryDate) {
      return res.status(400).json({
        message:
          "insuranceExpiry, vehicleLicenseExpiry and licenseExpiryDate are required",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const insuranceDate = new Date(insuranceExpiry);
    const vehicleLicenseDate = new Date(vehicleLicenseExpiry);
    const drivingLicenseDate = new Date(licenseExpiryDate);

    if (
      Number.isNaN(insuranceDate.getTime()) ||
      Number.isNaN(vehicleLicenseDate.getTime()) ||
      Number.isNaN(drivingLicenseDate.getTime())
    ) {
      return res.status(400).json({
        message: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    if (insuranceDate < today) {
      return res
        .status(400)
        .json({ message: "Insurance expiry cannot be in the past" });
    }
    if (vehicleLicenseDate < today) {
      return res
        .status(400)
        .json({ message: "Vehicle license expiry cannot be in the past" });
    }
    if (drivingLicenseDate < today) {
      return res
        .status(400)
        .json({ message: "Driving license expiry cannot be in the past" });
    }

    const { data: currentVehicle, error: fetchError } = await supabaseAdmin
      .from("driver_vehicle_license")
      .select("driver_id")
      .eq("driver_id", driverId)
      .maybeSingle();

    if (fetchError) {
      console.error("/driver/vehicle-expiry fetch error:", fetchError);
      return res.status(500).json({ message: "Failed to load vehicle details" });
    }

    if (!currentVehicle) {
      return res.status(404).json({
        message: "Vehicle details not found for this driver",
      });
    }

    const { data: vehicleDetails, error: updateError } = await supabaseAdmin
      .from("driver_vehicle_license")
      .update({
        insurance_expiry: insuranceExpiry,
        vehicle_license_expiry: vehicleLicenseExpiry,
        license_expiry_date: licenseExpiryDate,
      })
      .eq("driver_id", driverId)
      .select(
        "driver_id, vehicle_number, vehicle_type, vehicle_model, insurance_expiry, vehicle_license_expiry, driving_license_number, license_expiry_date",
      )
      .maybeSingle();

    if (updateError) {
      console.error("/driver/vehicle-expiry update error:", updateError);
      return res.status(500).json({ message: "Failed to update expiry dates" });
    }

    return res.json({
      message: "Expiry dates updated successfully",
      vehicle: vehicleDetails,
    });
  } catch (e) {
    console.error("/driver/vehicle-expiry error:", e);
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
    const { newPassword } = req.body || {};

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
        force_password_change: false,
        driver_status: "pending",
        profile_completed: true,
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
        "id, full_name, email, phone, nic_number, driver_status, driver_type, city, address, profile_photo_url, working_time, manual_status_override, force_password_change, profile_completed, onboarding_completed, onboarding_step",
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
 * GET /driver/stats/monthly
 * Get current month's stats (earnings and deliveries)
 */
router.get("/stats/monthly", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const todayStr = getSriLankaDateString();
    const monthStartStr = `${todayStr.slice(0, 7)}-01`;
    const monthStart = `${monthStartStr}T00:00:00+05:30`;

    const { data: deliveries, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        "driver_earnings, delivery_sequence, tip_amount, base_amount, extra_earnings, bonus_amount",
      )
      .eq("driver_id", driverId)
      .eq("status", "delivered")
      .gte("delivered_at", monthStart);

    if (error) {
      console.error("Fetch monthly stats error:", error);
      return res.status(500).json({ message: "Failed to fetch monthly stats" });
    }

    const totalEarnings = (deliveries || []).reduce((sum, d) => {
      const stored = parseFloat(d.driver_earnings || 0);
      const fallback =
        parseInt(d.delivery_sequence || 1, 10) === 1
          ? parseFloat(d.base_amount || 0) + parseFloat(d.tip_amount || 0)
          : parseFloat(d.extra_earnings || 0) +
            parseFloat(d.bonus_amount || 0) +
            parseFloat(d.tip_amount || 0);
      const earnings = stored || fallback;
      return sum + earnings;
    }, 0);

    return res.json({
      earnings: totalEarnings,
      deliveries: deliveries?.length || 0,
    });
  } catch (e) {
    console.error("/driver/stats/monthly error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /driver/deliveries/recent
 * Get recent completed deliveries for the driver
 */
router.get("/deliveries/recent", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const limit = parseInt(req.query.limit || "5", 10);

    const { data: deliveries, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        `id, status, driver_earnings, delivery_sequence, tip_amount, base_amount, extra_earnings, bonus_amount, delivered_at, created_at,
        orders!inner ( order_number, restaurant_name )`,
      )
      .eq("driver_id", driverId)
      .eq("status", "delivered")
      .order("delivered_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Fetch recent deliveries error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch recent deliveries" });
    }

    const formatted = (deliveries || []).map((d) => {
      const stored = parseFloat(d.driver_earnings || 0);
      const fallback =
        parseInt(d.delivery_sequence || 1, 10) === 1
          ? parseFloat(d.base_amount || 0) + parseFloat(d.tip_amount || 0)
          : parseFloat(d.extra_earnings || 0) +
            parseFloat(d.bonus_amount || 0) +
            parseFloat(d.tip_amount || 0);
      const earnings = stored || fallback;
      return {
        id: d.id,
        order_number: d.orders?.order_number || "N/A",
        restaurant_name: d.orders?.restaurant_name || "Restaurant",
        driver_earnings: earnings,
        delivered_at: d.delivered_at || d.created_at,
      };
    });

    return res.json({ deliveries: formatted });
  } catch (e) {
    console.error("/driver/deliveries/recent error:", e);
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
    const { start: todayStart } = getSriLankaDayRange();

    // Get today's completed deliveries with earnings
    const { data: deliveries, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        "driver_earnings, tip_amount, base_amount, extra_earnings, bonus_amount",
      )
      .eq("driver_id", driverId)
      .eq("status", "delivered")
      .gte("delivered_at", todayStart);

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

    if (driverData.driver_status === "suspended") {
      return res.status(403).json({
        message:
          "Deposit the collected money to the Meezo platform before accepting new deliveries.",
        driver_status: "suspended",
        hint: "Please contact your manager after settling your pending amount.",
      });
    }

    if (driverData.driver_status === "rejected") {
      return res.status(403).json({
        message: "Your driver account is rejected. Contact your manager.",
        driver_status: "rejected",
      });
    }

    if (driverData.driver_status === "pending") {
      return res.status(403).json({
        message: "Your account is still under verification.",
        driver_status: "pending",
      });
    }

    // Default working_time to full_time if not set
    const workingTime = driverData.working_time || "full_time";

    // Suspension lock: only manager can reactivate suspended/rejected/pending drivers.
    if (
      status === "active" &&
      ["suspended", "rejected", "pending"].includes(
        String(driverData.driver_status || "").toLowerCase(),
      )
    ) {
      const isSuspended =
        String(driverData.driver_status || "").toLowerCase() === "suspended";
      return res.status(403).json({
        message: isSuspended
          ? "Deposit the collected money to the Meezo platform before accepting new deliveries."
          : "Your account is not active. Please contact your manager to reactivate your account.",
        driver_status: driverData.driver_status,
      });
    }

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
 * Fetch driver notifications from notification_log + scheduled_notifications
 */
router.get("/notifications", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const driverId = req.user.id;
    const limit = parseInt(req.query.limit || "50", 10);

    // 1) Fetch from notification_log (individual notifications for this driver)
    const { data: logData, error: logError } = await supabaseAdmin
      .from("notification_log")
      .select("*")
      .eq("user_id", driverId)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (logError) {
      console.error("notification_log fetch error:", logError);
    }

    // 2) Fetch from scheduled_notifications (sent broadcasts targeting driver role)
    const { data: scheduledData, error: schedError } = await supabaseAdmin
      .from("scheduled_notifications")
      .select("*")
      .eq("role", "driver")
      .eq("status", "sent")
      .or(`recipient_ids.is.null,recipient_ids.cs.{${driverId}}`)
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
    console.error("/driver/notifications error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /driver/notifications/mark-all-read
 * Mark all notifications as read (no-op, notification_log is read-only)
 */
router.patch("/notifications/mark-all-read", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ message: "Forbidden" });
    }
    return res.json({ success: true, updated: 0 });
  } catch (e) {
    console.error("/driver/notifications/mark-all-read error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
