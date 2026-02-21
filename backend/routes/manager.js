import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import { generateTempPassword } from "../utils/password.js";
import { sendAdminInviteEmail, sendDriverInviteEmail } from "../utils/email.js";
import {
  getSystemConfig,
  invalidateConfigCache,
} from "../utils/systemConfig.js";
import { broadcastNewDelivery } from "../utils/socketManager.js";
import {
  sendAdminApprovalNotification,
  sendDriverApprovalNotification,
  sendTipDeliveryNotificationToDrivers,
} from "../utils/pushNotificationService.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

/**
 * GET /manager/me
 * Get manager profile
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from("managers")
      .select("user_id, username, email, mobile_number")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return res.status(404).json({ message: "Manager profile not found" });
    }

    return res.json({ manager: data });
  } catch (e) {
    console.error("/manager/me error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /manager/add-admin
 * Manager creates a new admin user
 */
router.post("/add-admin", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }

    // Generate username from email (everything before @)
    const username = email.split("@")[0];
    const tempPassword = generateTempPassword();
    const loginUrl =
      process.env.MANAGER_LOGIN_URL || "http://localhost:5173/login";

    // 0) Check for orphaned records and clean them up
    const { data: existingAdmin } = await supabaseAdmin
      .from("admins")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingAdmin) {
      console.log(`Found orphaned admin record for ${email}, cleaning up...`);
      // Delete orphaned admin record
      await supabaseAdmin.from("admins").delete().eq("email", email);
      // Delete orphaned user record if exists
      await supabaseAdmin.from("users").delete().eq("id", existingAdmin.id);
      console.log("Orphaned records cleaned up");
    }

    // 1) Create Auth user
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

    if (authError || !authData?.user?.id) {
      console.error("Auth create error", authError);

      // Handle duplicate email specifically
      if (authError?.code === "email_exists" || authError?.status === 422) {
        return res.status(409).json({
          message: `Email ${email} is already registered. Please use a different email or delete the existing user from Supabase Auth.`,
        });
      }

      return res.status(500).json({
        message: "Failed to create auth user",
        error: authError?.message,
      });
    }

    const userId = authData.user.id;
    console.log(`Created auth user with ID: ${userId}`);

    // Helper to rollback auth/user if downstream fails
    const cleanup = async () => {
      try {
        await supabaseAdmin.from("users").delete().eq("id", userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        console.log("Cleaned up failed admin creation");
      } catch (e) {
        console.error("Cleanup failed", e);
      }
    };

    // 2) Insert into users table
    const { error: userInsertError } = await supabaseAdmin
      .from("users")
      .insert({ id: userId, role: "admin" });

    if (userInsertError) {
      console.error("users insert error", userInsertError);
      await cleanup();
      return res.status(500).json({
        message: "Failed to insert user role",
        error: userInsertError?.message,
      });
    }

    console.log("Inserted user role");

    // 3) Insert into admins table
    const { error: adminInsertError } = await supabaseAdmin
      .from("admins")
      .insert({
        id: userId,
        email,
        force_password_change: true,
        profile_completed: false,
      });

    if (adminInsertError) {
      console.error("admins insert error", adminInsertError);
      await cleanup();
      return res.status(500).json({
        message: "Failed to insert admin profile",
        error: adminInsertError?.message,
      });
    }

    console.log("Inserted admin profile");

    // 4) Send email (non-blocking)
    try {
      console.log(`Sending admin invite → email: ${email}`);
      await sendAdminInviteEmail({ to: email, tempPassword, loginUrl });
      console.log(`Admin invite send complete for ${email}`);
    } catch (e) {
      console.error("Email send error (non-blocking):", e.message);
      // Log but don't fail; admin is already created and can reset password via forgot link
    }

    console.log(`Successfully created admin: ${email}`);
    return res
      .status(201)
      .json({ message: "Admin created successfully", userId });
  } catch (err) {
    console.error("Unexpected error in /manager/add-admin:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
});

/**
 * POST /manager/add-driver
 * Manager creates a new driver user (email-only; driver completes profile on first login)
 */
router.post("/add-driver", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }

    const username = email.split("@")[0];
    const tempPassword = generateTempPassword();
    const loginUrl =
      process.env.MANAGER_LOGIN_URL || "http://localhost:5173/login";

    console.log("================ DRIVER CREATION ================");
    console.log(`Email: ${email}`);
    console.log(`Username: ${username}`);
    console.log("================================================");

    // Clean up orphaned driver records
    const { data: existingDriver } = await supabaseAdmin
      .from("drivers")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingDriver) {
      console.log(`Found orphaned driver record for ${email}, cleaning up...`);
      await supabaseAdmin.from("drivers").delete().eq("email", email);
      await supabaseAdmin.from("users").delete().eq("id", existingDriver.id);
      console.log("Orphaned driver records cleaned up");
    }

    // Create Auth user
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

    if (authError || !authData?.user?.id) {
      console.error("Driver auth create error", authError);

      if (authError?.code === "email_exists" || authError?.status === 422) {
        return res.status(409).json({
          message: `Email ${email} is already registered. Please use a different email or delete the existing user from Supabase Auth.`,
        });
      }

      return res.status(500).json({
        message: "Failed to create auth user",
        error: authError?.message,
      });
    }

    const userId = authData.user.id;
    console.log(`Created driver auth user with ID: ${userId}`);

    const cleanup = async () => {
      try {
        await supabaseAdmin.from("users").delete().eq("id", userId);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        console.log("Cleaned up failed driver creation");
      } catch (e) {
        console.error("Driver cleanup failed", e);
      }
    };

    // Insert into users table
    const { error: userInsertError } = await supabaseAdmin
      .from("users")
      .insert({ id: userId, role: "driver" });

    if (userInsertError) {
      console.error("driver users insert error", userInsertError);
      await cleanup();
      return res.status(500).json({
        message: "Failed to insert user role",
        error: userInsertError?.message,
      });
    }

    console.log("Inserted driver user role");

    // Insert into drivers table (schema column id)
    const { error: driverInsertError } = await supabaseAdmin
      .from("drivers")
      .insert({
        id: userId,
        email,
        force_password_change: true,
        profile_completed: false,
        driver_status: "pending",
      });

    if (driverInsertError) {
      console.error("drivers insert error", driverInsertError);
      await cleanup();
      return res.status(500).json({
        message: "Failed to insert driver profile",
        error: driverInsertError?.message,
      });
    }

    console.log("Inserted driver profile");

    // Send invite email
    try {
      console.log(`Sending driver invite → email: ${email}`);
      await sendDriverInviteEmail({ to: email, tempPassword, loginUrl });
      console.log(`Driver invite send complete for ${email}`);
    } catch (e) {
      console.error("Driver email send error (non-blocking):", e.message);
    }

    console.log(`Successfully created driver: ${email}`);
    return res
      .status(201)
      .json({ message: "Driver created successfully", userId });
  } catch (err) {
    console.error("Unexpected error in /manager/add-driver:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
});

/**
 * GET /manager/admins
 * List admins with optional status/search filters
 */
router.get("/admins", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { status, search } = req.query;

    let query = supabaseAdmin
      .from("admins")
      .select(
        `id, email, full_name, phone, admin_status, profile_completed, created_at, verified, restaurant_id,
         restaurants:restaurant_id (id, restaurant_name, logo_url)`,
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("admin_status", status);
    }

    if (search) {
      const safe = search.replace(/[,()]/g, "").trim();
      if (safe) {
        const term = `%${safe}%`;
        query = query.or(`email.ilike.${term},full_name.ilike.${term}`);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Fetch admins error:", error);
      return res.status(500).json({ message: "Failed to fetch admins" });
    }

    return res.json({ admins: data || [] });
  } catch (e) {
    console.error("/manager/admins error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /manager/admins/:adminId/status
 * Update an admin's status
 */
router.patch("/admins/:adminId/status", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { adminId } = req.params;
    const { status, reason } = req.body || {};
    const allowedStatuses = ["active", "suspended", "rejected", "pending"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("admins")
      .select("admin_status")
      .eq("id", adminId)
      .maybeSingle();

    if (fetchError) {
      console.error("Fetch admin before update error:", fetchError);
      return res.status(500).json({ message: "Failed to update admin" });
    }

    if (!existing) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("admins")
      .update({
        admin_status: status,
        updated_at: new Date().toISOString(),
        rejection_reason: status === "rejected" ? reason || null : null,
      })
      .eq("id", adminId);

    if (updateError) {
      console.error("Update admin status error:", updateError);
      return res.status(500).json({ message: "Failed to update admin" });
    }

    return res.json({
      message: "Admin status updated",
      newStatus: status,
    });
  } catch (e) {
    console.error("/manager/admins/:adminId/status error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/drivers
 * List drivers with optional status/search filters
 */
router.get("/drivers", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { status, search } = req.query;

    let query = supabaseAdmin
      .from("drivers")
      .select(
        `id, full_name, email, phone, city, driver_type, driver_status, profile_completed, created_at`,
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("driver_status", status);
    }

    if (search) {
      const safe = search.replace(/[,()]/g, "").trim();
      if (safe) {
        const term = `%${safe}%`;
        query = query.or(`email.ilike.${term},full_name.ilike.${term}`);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Fetch drivers error:", error);
      return res.status(500).json({ message: "Failed to fetch drivers" });
    }

    return res.json({ drivers: data || [] });
  } catch (e) {
    console.error("/manager/drivers error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /manager/drivers/:driverId/status
 * Update a driver's status
 */
router.patch("/drivers/:driverId/status", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { driverId } = req.params;
    const { status, reason } = req.body || {};
    const allowedStatuses = ["active", "suspended", "rejected", "pending"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const { data: driver, error: fetchError } = await supabaseAdmin
      .from("drivers")
      .select("driver_status")
      .eq("id", driverId)
      .maybeSingle();

    if (fetchError) {
      console.error("Fetch driver before update error:", fetchError);
      return res.status(500).json({ message: "Failed to update driver" });
    }

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    const oldStatus = driver.driver_status;

    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        driver_status: status,
        updated_at: new Date().toISOString(),
        rejection_reason: status === "rejected" ? reason || null : null,
      })
      .eq("id", driverId);

    if (updateError) {
      console.error("Update driver status error:", updateError);
      return res.status(500).json({ message: "Failed to update driver" });
    }

    return res.json({
      message: "Driver status updated",
      newStatus: status,
    });
  } catch (e) {
    console.error("/manager/drivers/:driverId/status error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/restaurants
 * List restaurants with optional status/search filters and admin info
 */
router.get("/restaurants", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { status, search } = req.query;

    let query = supabaseAdmin
      .from("restaurants")
      .select(
        `id, restaurant_name, business_registration_number, address, city, postal_code,
         opening_time, close_time, logo_url, cover_image_url, restaurant_status, created_at, updated_at,
         admin_id, admins:admin_id (id, email, full_name, phone)`,
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("restaurant_status", status);
    }

    if (search) {
      const safe = search.replace(/[,().]/g, "").trim();
      if (safe) {
        const term = `%${safe}%`;
        query = query.or(`restaurant_name.ilike.${term},city.ilike.${term}`);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Fetch restaurants error:", error);
      return res.status(500).json({ message: "Failed to fetch restaurants" });
    }

    return res.json({ restaurants: data || [] });
  } catch (e) {
    console.error("/manager/restaurants error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /manager/restaurants/:restaurantId/status
 * Update a restaurant's status
 */
router.patch(
  "/restaurants/:restaurantId/status",
  authenticate,
  async (req, res) => {
    try {
      if (req.user.role !== "manager") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { restaurantId } = req.params;
      const { status, reason } = req.body || {};
      const allowedStatuses = ["active", "suspended", "rejected", "pending"];

      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      const { data: restaurant, error: fetchError } = await supabaseAdmin
        .from("restaurants")
        .select("restaurant_status, admin_id")
        .eq("id", restaurantId)
        .maybeSingle();

      if (fetchError) {
        console.error("Fetch restaurant before update error:", fetchError);
        return res.status(500).json({ message: "Failed to update restaurant" });
      }

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const oldStatus = restaurant.restaurant_status;

      const { error: updateError } = await supabaseAdmin
        .from("restaurants")
        .update({
          restaurant_status: status,
          updated_at: new Date().toISOString(),
          rejection_reason: status === "rejected" ? reason || null : null,
        })
        .eq("id", restaurantId);

      if (updateError) {
        console.error("Update restaurant status error:", updateError);
        return res.status(500).json({ message: "Failed to update restaurant" });
      }

      // Update admin status to match
      if (restaurant.admin_id) {
        await supabaseAdmin
          .from("admins")
          .update({
            admin_status: status,
            verified: status === "active",
            verified_at: status === "active" ? new Date().toISOString() : null,
            verified_by: status === "active" ? req.user.id : null,
          })
          .eq("id", restaurant.admin_id);
      }

      try {
        await supabaseAdmin.from("restaurant_status_log").insert({
          restaurant_id: restaurantId,
          old_status: oldStatus,
          new_status: status,
          changed_by: req.user.id,
          change_reason:
            reason || (status === "active" ? "Activated by manager" : null),
        });
      } catch (logError) {
        console.warn("Status log insert skipped:", logError.message);
      }

      return res.json({
        message: "Restaurant status updated",
        newStatus: status,
      });
    } catch (e) {
      console.error("/manager/restaurants/:restaurantId/status error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

/**
 * GET /manager/pending-drivers
 * Get all drivers pending verification
 */
router.get("/pending-drivers", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { data: drivers, error } = await supabaseAdmin
      .from("drivers")
      .select(
        `
        id,
        email,
        phone,
        full_name,
        nic_number,
        city,
        driver_type,
        driver_status,
        onboarding_completed,
        onboarding_step,
        created_at
      `,
      )
      .eq("onboarding_completed", true)
      .eq("driver_status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch pending drivers error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch pending drivers" });
    }

    return res.json({ drivers: drivers || [] });
  } catch (e) {
    console.error("/manager/pending-drivers error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/driver-details/:driverId
 * Get complete driver details for verification
 */
router.get("/driver-details/:driverId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { driverId } = req.params;

    // Get driver basic info
    const { data: driver, error: driverError } = await supabaseAdmin
      .from("drivers")
      .select("*")
      .eq("id", driverId)
      .single();

    if (driverError || !driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    // Get vehicle and license details
    const { data: vehicleLicense } = await supabaseAdmin
      .from("driver_vehicle_license")
      .select("*")
      .eq("driver_id", driverId)
      .single();

    // Get documents
    const { data: documents } = await supabaseAdmin
      .from("driver_documents")
      .select("*")
      .eq("driver_id", driverId);

    // Get bank account
    const { data: bankAccount } = await supabaseAdmin
      .from("driver_bank_accounts")
      .select("*")
      .eq("driver_id", driverId)
      .single();

    // Get contract
    const { data: contract } = await supabaseAdmin
      .from("driver_contracts")
      .select("*")
      .eq("driver_id", driverId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .single();

    return res.json({
      driver,
      vehicleLicense,
      documents: documents || [],
      bankAccount,
      contract,
    });
  } catch (e) {
    console.error("/manager/driver-details error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /manager/verify-driver/:driverId
 * Approve or reject driver after verification
 */
router.post("/verify-driver/:driverId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { driverId } = req.params;
    const { action, reason } = req.body; // action: 'approve' or 'reject'

    if (!action || !["approve", "reject"].includes(action)) {
      return res
        .status(400)
        .json({ message: "Invalid action. Must be 'approve' or 'reject'" });
    }

    const newStatus = action === "approve" ? "active" : "rejected";

    // Update driver status
    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        driver_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", driverId);

    if (updateError) {
      console.error("Update driver status error:", updateError);
      return res
        .status(500)
        .json({ message: "Failed to update driver status" });
    }

    // If approving, update all driver documents and bank account to verified
    if (action === "approve") {
      const verificationData = {
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: req.user.id,
      };

      // Update driver documents
      const { error: docsError } = await supabaseAdmin
        .from("driver_documents")
        .update(verificationData)
        .eq("driver_id", driverId);

      if (docsError) {
        console.error("Update driver documents error:", docsError);
        // Continue even if document update fails
      }

      // Update driver bank account
      const { error: bankError } = await supabaseAdmin
        .from("driver_bank_accounts")
        .update(verificationData)
        .eq("driver_id", driverId);

      if (bankError) {
        console.error("Update driver bank account error:", bankError);
        // Continue even if bank account update fails
      }
    }

    // Send push notification to driver's mobile device
    try {
      // Get driver name for notification
      const { data: driverData } = await supabaseAdmin
        .from("drivers")
        .select("full_name")
        .eq("id", driverId)
        .single();

      const driverName = driverData?.full_name || "Driver";
      const isApproved = action === "approve";

      await sendDriverApprovalNotification(driverId, driverName, isApproved);
      console.log(
        `📱 Push notification sent to driver ${driverId} (${isApproved ? "approved" : "rejected"})`,
      );
    } catch (pushError) {
      console.error("Push notification error (non-fatal):", pushError.message);
      // Don't fail the request if push notification fails
    }

    return res.json({
      message: `Driver ${
        action === "approve" ? "approved" : "rejected"
      } successfully`,
      newStatus,
    });
  } catch (e) {
    console.error("/manager/verify-driver error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /manager/verify-document/:documentId
 * Verify or reject individual document
 */
router.post("/verify-document/:documentId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { documentId } = req.params;
    const { verified, rejectionReason } = req.body;

    const updateData = {
      verified: verified === true,
      verified_at: verified ? new Date().toISOString() : null,
      verified_by: verified ? req.user.id : null,
      rejection_reason: rejectionReason || null,
    };

    const { error } = await supabaseAdmin
      .from("driver_documents")
      .update(updateData)
      .eq("id", documentId);

    if (error) {
      console.error("Document verification error:", error);
      return res.status(500).json({ message: "Failed to verify document" });
    }

    return res.json({ message: "Document updated successfully" });
  } catch (e) {
    console.error("/manager/verify-document error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// RESTAURANT VERIFICATION ENDPOINTS
// ============================================================================

/**
 * GET /manager/pending-restaurants
 * Get all restaurants pending approval
 */
router.get("/pending-restaurants", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { data, error } = await supabaseAdmin
      .from("restaurants")
      .select("id, restaurant_name, city, restaurant_status, created_at")
      .eq("restaurant_status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch pending restaurants error:", error);
      return res.status(500).json({ message: "Failed to fetch restaurants" });
    }

    return res.json({ restaurants: data || [] });
  } catch (e) {
    console.error("/manager/pending-restaurants error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/restaurant-details/:restaurantId
 * Get complete restaurant details for verification
 */
router.get(
  "/restaurant-details/:restaurantId",
  authenticate,
  async (req, res) => {
    try {
      if (req.user.role !== "manager") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { restaurantId } = req.params;

      // Get restaurant basic info
      const { data: restaurant, error: restaurantError } = await supabaseAdmin
        .from("restaurants")
        .select("*")
        .eq("id", restaurantId)
        .single();

      if (restaurantError || !restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // Get documents
      const { data: documents } = await supabaseAdmin
        .from("restaurant_documents")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("document_type");

      // Get bank account
      const { data: bankAccount } = await supabaseAdmin
        .from("restaurant_bank_accounts")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_primary", true)
        .single();

      // Get menu categories
      const { data: categories } = await supabaseAdmin
        .from("restaurant_menu_categories")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("display_order");

      // Get admin info (the restaurant stores admin_id)
      const { data: admin } = await supabaseAdmin
        .from("admins")
        .select(
          "id, email, full_name, phone, home_address, profile_photo_url, nic_front, nic_back",
        )
        .eq("id", restaurant.admin_id)
        .maybeSingle();

      return res.json({
        restaurant,
        documents: documents || [],
        bankAccount,
        categories: categories || [],
        admin,
      });
    } catch (e) {
      console.error("/manager/restaurant-details error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

/**
 * POST /manager/verify-restaurant/:restaurantId
 * Approve or reject restaurant after verification
 */
router.post(
  "/verify-restaurant/:restaurantId",
  authenticate,
  async (req, res) => {
    try {
      if (req.user.role !== "manager") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { restaurantId } = req.params;
      const { action, reason } = req.body; // action: 'approve' or 'reject'

      if (!action || !["approve", "reject"].includes(action)) {
        return res
          .status(400)
          .json({ message: "Invalid action. Must be 'approve' or 'reject'" });
      }

      const newStatus = action === "approve" ? "active" : "rejected";

      // Get admin_id for this restaurant
      const { data: restaurant } = await supabaseAdmin
        .from("restaurants")
        .select("admin_id")
        .eq("id", restaurantId)
        .single();

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // Update restaurant status
      const { error: updateError } = await supabaseAdmin
        .from("restaurants")
        .update({
          restaurant_status: newStatus,
          rejection_reason: action === "reject" ? reason : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", restaurantId);

      if (updateError) {
        console.error("Update restaurant status error:", updateError);
        return res
          .status(500)
          .json({ message: "Failed to update restaurant status" });
      }

      // Update admin status
      await supabaseAdmin
        .from("admins")
        .update({
          admin_status: newStatus,
          verified: action === "approve",
          verified_at: action === "approve" ? new Date().toISOString() : null,
          verified_by: action === "approve" ? req.user.id : null,
        })
        .eq("id", restaurant.admin_id);

      // If approving, update bank account verification status
      if (action === "approve") {
        await supabaseAdmin
          .from("restaurant_bank_accounts")
          .update({
            verified: true,
            verified_at: new Date().toISOString(),
            verified_by: req.user.id,
          })
          .eq("admin_id", restaurant.admin_id);
      }

      // Log the status change (if restaurant_status_log table exists)
      try {
        await supabaseAdmin.from("restaurant_status_log").insert({
          restaurant_id: restaurantId,
          old_status: "pending",
          new_status: newStatus,
          changed_by: req.user.id,
          change_reason:
            reason ||
            (action === "approve" ? "Manager approved" : "Manager rejected"),
        });
      } catch (logError) {
        // Ignore if table doesn't exist
        console.log("Status log insert skipped (table may not exist)");
      }

      // Send push notification to admin's mobile device
      try {
        // Get restaurant name for notification
        const { data: restaurantDetails } = await supabaseAdmin
          .from("restaurants")
          .select("restaurant_name")
          .eq("id", restaurantId)
          .single();

        const restaurantName =
          restaurantDetails?.restaurant_name || "Your Restaurant";
        const isApproved = action === "approve";

        await sendAdminApprovalNotification(
          restaurant.admin_id,
          restaurantName,
          isApproved,
        );
        console.log(
          `📱 Push notification sent to admin ${restaurant.admin_id} (${isApproved ? "approved" : "rejected"})`,
        );
      } catch (pushError) {
        console.error(
          "Push notification error (non-fatal):",
          pushError.message,
        );
        // Don't fail the request if push notification fails
      }

      return res.json({
        message: `Restaurant ${
          action === "approve" ? "approved" : "rejected"
        } successfully`,
        newStatus,
      });
    } catch (e) {
      console.error("/manager/verify-restaurant error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ============================================================================
// MANAGER DASHBOARD STATS
// ============================================================================

/**
 * GET /manager/dashboard-stats
 * All-in-one dashboard data: today earnings, sales, orders, driver/restaurant payments, graphs
 */
router.get("/dashboard-stats", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // ---- 1. Today's delivered orders with earnings ----
    const { data: todayDeliveries, error: delErr } = await supabaseAdmin
      .from("deliveries")
      .select("order_id, driver_earnings, status, driver_id")
      .eq("status", "delivered");

    if (delErr) {
      console.error("Dashboard deliveries error:", delErr);
      return res.status(500).json({ message: "Failed to fetch deliveries" });
    }

    const allOrderIds = (todayDeliveries || []).map((d) => d.order_id);
    const deliveriesMap = {};
    for (const d of todayDeliveries || []) {
      deliveriesMap[d.order_id] = {
        driver_earnings: parseFloat(d.driver_earnings || 0),
        driver_id: d.driver_id,
      };
    }

    // Get today's orders (placed today with delivered status)
    let todayOrders = [];
    if (allOrderIds.length > 0) {
      const { data: ordersData } = await supabaseAdmin
        .from("orders")
        .select(
          "id, subtotal, admin_subtotal, commission_total, delivery_fee, service_fee, total_amount, placed_at, restaurant_id, restaurant_name",
        )
        .in("id", allOrderIds)
        .gte("placed_at", todayStart.toISOString())
        .lte("placed_at", todayEnd.toISOString());
      todayOrders = ordersData || [];
    }

    // Calculate today's totals
    let todaySales = 0;
    let todayEarnings = 0;
    let todayDriverPayTotal = 0;
    let todayRestaurantPayTotal = 0;
    const todayDriverSet = new Set();
    const todayRestaurantMap = {};

    for (const order of todayOrders) {
      const totalCollected = parseFloat(order.total_amount || 0);
      const restaurantPay = parseFloat(order.admin_subtotal || 0);
      const driverPay = deliveriesMap[order.id]?.driver_earnings || 0;
      const driverId = deliveriesMap[order.id]?.driver_id;
      const managerEarning = totalCollected - restaurantPay - driverPay;

      todaySales += totalCollected;
      todayEarnings += managerEarning;
      todayDriverPayTotal += driverPay;
      todayRestaurantPayTotal += restaurantPay;

      if (driverId) todayDriverSet.add(driverId);
      if (order.restaurant_id) {
        todayRestaurantMap[order.restaurant_id] =
          (todayRestaurantMap[order.restaurant_id] || 0) + restaurantPay;
      }
    }

    // ---- 2. Pending amount from drivers (cash collected not yet deposited) ----
    // Use the same logic as deposits/manager/summary
    const { data: latestSnapshot } = await supabaseAdmin
      .from("daily_deposit_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .single();

    let prevPending = 0;
    let snapshotBoundary = null;
    if (latestSnapshot) {
      prevPending = parseFloat(latestSnapshot.ending_pending || 0);
      snapshotBoundary = latestSnapshot.created_at;
    }

    // Cash deliveries after snapshot
    let cashQuery = supabaseAdmin
      .from("deliveries")
      .select("id, order_id, orders!inner(total_amount, payment_method)")
      .eq("status", "delivered")
      .eq("orders.payment_method", "cash");
    if (snapshotBoundary) {
      cashQuery = cashQuery.gt("updated_at", snapshotBoundary);
    }
    const { data: cashDeliveries } = await cashQuery;
    const cashSales = (cashDeliveries || []).reduce(
      (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
      0,
    );

    // Approved deposits after snapshot
    let approvedQuery = supabaseAdmin
      .from("driver_deposits")
      .select("approved_amount")
      .eq("status", "approved");
    if (snapshotBoundary) {
      approvedQuery = approvedQuery.gt("reviewed_at", snapshotBoundary);
    }
    const { data: approvedDeposits } = await approvedQuery;
    const paidAmount = (approvedDeposits || []).reduce(
      (sum, d) => sum + parseFloat(d.approved_amount || 0),
      0,
    );

    const totalPendingFromDrivers = Math.max(
      0,
      cashSales + prevPending - paidAmount,
    );

    // ---- 3. Last 7 days graph data ----
    const graphDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      graphDays.push({
        date: d.toISOString().split("T")[0],
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        start: new Date(d),
        end: new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          23,
          59,
          59,
          999,
        ),
      });
    }

    // Fetch all delivered orders for the last 7 days
    const weekStart = graphDays[0].start;
    let weekOrders = [];
    if (allOrderIds.length > 0) {
      const { data: weekData } = await supabaseAdmin
        .from("orders")
        .select("id, total_amount, admin_subtotal, placed_at")
        .in("id", allOrderIds)
        .gte("placed_at", weekStart.toISOString())
        .lte("placed_at", todayEnd.toISOString());
      weekOrders = weekData || [];
    }

    const earningsGraph = graphDays.map((day) => {
      const dayOrders = weekOrders.filter((o) => {
        const placed = new Date(o.placed_at);
        return placed >= day.start && placed <= day.end;
      });
      let sales = 0;
      let earnings = 0;
      for (const order of dayOrders) {
        const total = parseFloat(order.total_amount || 0);
        const restPay = parseFloat(order.admin_subtotal || 0);
        const driverPay = deliveriesMap[order.id]?.driver_earnings || 0;
        sales += total;
        earnings += total - restPay - driverPay;
      }
      return {
        label: day.label,
        date: day.date,
        earnings: parseFloat(earnings.toFixed(2)),
        sales: parseFloat(sales.toFixed(2)),
        orders: dayOrders.length,
      };
    });

    // ---- Respond ----
    return res.json({
      success: true,
      todayEarnings: parseFloat(todayEarnings.toFixed(2)),
      todaySales: parseFloat(todaySales.toFixed(2)),
      todayOrders: todayOrders.length,
      totalPendingFromDrivers: parseFloat(totalPendingFromDrivers.toFixed(2)),
      driverPayment: parseFloat(todayDriverPayTotal.toFixed(2)),
      driverCount: todayDriverSet.size,
      restaurantPayment: parseFloat(todayRestaurantPayTotal.toFixed(2)),
      restaurantCount: Object.keys(todayRestaurantMap).length,
      earningsGraph,
    });
  } catch (e) {
    console.error("/manager/dashboard-stats error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// MANAGER EARNINGS & FINANCIAL REPORTS
// ============================================================================

/**
 * GET /manager/earnings/summary
 * Get manager earnings summary (daily, weekly, monthly)
 */
router.get("/earnings/summary", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { period = "daily", from, to } = req.query;

    // Calculate date range
    let startDate, endDate;
    const now = new Date();

    if (from && to) {
      startDate = new Date(from);
      endDate = new Date(to);
    } else if (period === "daily") {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === "weekly") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
    } else if (period === "monthly") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    // Manager earnings only count when delivery is completed (delivered)
    // Money is collected from customer only after driver delivers the food
    const { data: deliveries, error: delError } = await supabaseAdmin
      .from("deliveries")
      .select("order_id, driver_earnings, status, delivered_at")
      .eq("status", "delivered");

    if (delError) {
      console.error("Deliveries fetch error:", delError);
      return res.status(500).json({ message: "Failed to fetch deliveries" });
    }

    // Get order IDs from qualifying deliveries
    const orderIds = (deliveries || []).map((d) => d.order_id);

    // Build deliveries map for driver earnings
    let deliveriesMap = {};
    for (const d of deliveries || []) {
      deliveriesMap[d.order_id] = {
        driver_earnings: parseFloat(d.driver_earnings || 0),
        status: d.status,
      };
    }

    // Get orders for those deliveries within date range
    let orders = [];
    if (orderIds.length > 0) {
      const { data: ordersData, error: ordersError } = await supabaseAdmin
        .from("orders")
        .select(
          `
          id,
          order_number,
          restaurant_id,
          restaurant_name,
          subtotal,
          admin_subtotal,
          commission_total,
          delivery_fee,
          service_fee,
          total_amount,
          status,
          placed_at,
          delivered_at
        `,
        )
        .in("id", orderIds)
        .gte("placed_at", startDate.toISOString())
        .lte("placed_at", endDate.toISOString());

      if (ordersError) {
        console.error("Orders fetch error:", ordersError);
        return res.status(500).json({ message: "Failed to fetch orders" });
      }
      orders = ordersData || [];
    }

    // Calculate totals - only for orders with qualifying deliveries
    const summary = {
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      total_orders: orders.length,
      delivered_orders: orders.filter(
        (o) => deliveriesMap[o.id]?.status === "delivered",
      ).length,

      // Customer payments
      customer_food_total: 0,
      delivery_fees_collected: 0,
      service_fees_collected: 0,
      total_collected: 0,

      // Restaurant payouts
      admin_total: 0,

      // Manager earnings
      food_commission: 0,
      service_fee_earning: 0,
      total_driver_earnings: 0,
      total_earning: 0,
    };

    for (const order of orders) {
      summary.customer_food_total += parseFloat(order.subtotal || 0);
      summary.delivery_fees_collected += parseFloat(order.delivery_fee || 0);
      summary.service_fees_collected += parseFloat(order.service_fee || 0);
      summary.total_collected += parseFloat(order.total_amount || 0);
      summary.admin_total += parseFloat(order.admin_subtotal || 0);
      summary.food_commission += parseFloat(order.commission_total || 0);
      summary.total_driver_earnings +=
        deliveriesMap[order.id]?.driver_earnings || 0;
    }

    // Service fee goes to manager
    summary.service_fee_earning = summary.service_fees_collected;
    // Manager earning = total_collected - restaurant_payment - driver_earnings
    summary.total_earning =
      summary.total_collected -
      summary.admin_total -
      summary.total_driver_earnings;

    // Round all values
    Object.keys(summary).forEach((key) => {
      if (
        typeof summary[key] === "number" &&
        key !== "total_orders" &&
        key !== "delivered_orders"
      ) {
        summary[key] = parseFloat(summary[key].toFixed(2));
      }
    });

    return res.json({ summary });
  } catch (e) {
    console.error("/manager/earnings/summary error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/earnings/orders
 * Get detailed order list with earnings breakdown
 */
router.get("/earnings/orders", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const {
      from,
      to,
      restaurant_id,
      status,
      limit = 50,
      offset = 0,
    } = req.query;

    let query = supabaseAdmin
      .from("orders")
      .select(
        `
        id,
        order_number,
        restaurant_id,
        restaurant_name,
        customer_name,
        subtotal,
        admin_subtotal,
        commission_total,
        delivery_fee,
        service_fee,
        total_amount,
        status,
        placed_at,
        delivered_at
      `,
      )
      .order("placed_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (from) {
      query = query.gte("placed_at", new Date(from).toISOString());
    }
    if (to) {
      query = query.lte("placed_at", new Date(to).toISOString());
    }
    if (restaurant_id) {
      query = query.eq("restaurant_id", restaurant_id);
    }
    // Note: We don't filter by orders.status. Delivery status filtering
    // is handled by the deliveries join below (only delivered deliveries count).

    const { data: orders, error } = await query;

    if (error) {
      console.error("Orders fetch error:", error);
      return res.status(500).json({ message: "Failed to fetch orders" });
    }

    // Fetch driver earnings from deliveries for these orders
    // Only include delivered orders for manager earnings
    const orderIds = (orders || []).map((o) => o.id);
    let deliveriesMap = {};
    if (orderIds.length > 0) {
      const { data: deliveries, error: delError } = await supabaseAdmin
        .from("deliveries")
        .select(
          "order_id, driver_earnings, status, driver_id, drivers(full_name, phone)",
        )
        .in("order_id", orderIds)
        .eq("status", "delivered");

      if (!delError && deliveries) {
        for (const d of deliveries) {
          deliveriesMap[d.order_id] = {
            driver_earning: parseFloat(d.driver_earnings || 0),
            driver_name: d.drivers?.full_name || null,
            driver_phone: d.drivers?.phone || null,
            delivery_status: d.status,
          };
        }
      }
    }

    // Add calculated earnings to each order
    const ordersWithEarnings = (orders || []).map((order) => {
      const deliveryInfo = deliveriesMap[order.id] || {};
      const driverEarning = deliveryInfo.driver_earning || 0;
      const totalCollected = parseFloat(order.total_amount || 0);
      const restaurantPayout = parseFloat(order.admin_subtotal || 0);
      const managerEarning = totalCollected - restaurantPayout - driverEarning;

      return {
        ...order,
        // Override status with delivery status
        status: deliveryInfo.delivery_status || order.status,
        total_collected: totalCollected,
        restaurant_payout: restaurantPayout,
        driver_earning: driverEarning,
        driver_name: deliveryInfo.driver_name || null,
        driver_phone: deliveryInfo.driver_phone || null,
        manager_earning: parseFloat(managerEarning.toFixed(2)),
      };
    });

    return res.json({ orders: ordersWithEarnings });
  } catch (e) {
    console.error("/manager/earnings/orders error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/restaurant-payouts
 * Get pending payouts to restaurants
 */
router.get("/restaurant-payouts", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { from, to } = req.query;

    let query = supabaseAdmin
      .from("deliveries")
      .select(
        `
        order_id,
        status,
        orders!inner (
          restaurant_id,
          restaurant_name
        )
      `,
      )
      .eq("status", "delivered");

    if (from) {
      query = query.gte("orders.delivered_at", new Date(from).toISOString());
    }
    if (to) {
      query = query.lte("orders.delivered_at", new Date(to).toISOString());
    }

    // Get unique restaurants from delivered deliveries
    const { data: deliveredDeliveries, error } = await query;

    if (error) {
      console.error("Restaurant payouts fetch error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch restaurant payouts" });
    }

    // Group by restaurant and calculate totals
    const restaurantMap = {};

    for (const del of deliveredDeliveries || []) {
      const restId = del.orders.restaurant_id;
      const restName = del.orders.restaurant_name;
      if (!restaurantMap[restId]) {
        restaurantMap[restId] = {
          restaurant_id: restId,
          restaurant_name: restName,
          total_orders: 0,
          total_payout: 0,
        };
      }
      restaurantMap[restId].total_orders += 1;
    }

    // Now get the actual amounts for each restaurant (via delivered deliveries)
    for (const restaurantId of Object.keys(restaurantMap)) {
      let amountQuery = supabaseAdmin
        .from("deliveries")
        .select("orders!inner(admin_subtotal, restaurant_id, delivered_at)")
        .eq("orders.restaurant_id", restaurantId)
        .eq("status", "delivered");

      if (from) {
        amountQuery = amountQuery.gte(
          "orders.delivered_at",
          new Date(from).toISOString(),
        );
      }
      if (to) {
        amountQuery = amountQuery.lte(
          "orders.delivered_at",
          new Date(to).toISOString(),
        );
      }

      const { data: amountData } = await amountQuery;

      restaurantMap[restaurantId].total_payout = (amountData || []).reduce(
        (sum, d) => sum + parseFloat(d.orders?.admin_subtotal || 0),
        0,
      );
    }

    const payouts = Object.values(restaurantMap).sort(
      (a, b) => b.total_payout - a.total_payout,
    );

    return res.json({ payouts });
  } catch (e) {
    console.error("/manager/restaurant-payouts error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ============================================================================
// PENDING DELIVERIES (no driver accepted > 10 min after restaurant accepted)
// ============================================================================

/**
 * GET /manager/pending-deliveries
 * Fetch deliveries where status='pending', driver_id IS NULL,
 * and the restaurant accepted the order more than 10 minutes ago.
 */
router.get("/pending-deliveries", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { data, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
        id, order_id, status, tip_amount, created_at, res_accepted_at,
        orders (
          id, order_number, customer_name, customer_phone,
          restaurant_name, restaurant_address, restaurant_phone,
          restaurant_latitude, restaurant_longitude,
          delivery_address, delivery_city,
          delivery_latitude, delivery_longitude,
          subtotal, delivery_fee, service_fee, total_amount,
          admin_subtotal, commission_total, distance_km,
          estimated_duration_min, payment_method,
          placed_at,
          order_items (
            id, food_name, food_image_url, size, quantity, unit_price, total_price
          )
        )
      `,
      )
      .eq("status", "pending")
      .is("driver_id", null);

    if (error) {
      console.error("Pending deliveries fetch error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch pending deliveries" });
    }

    // Filter: restaurant accepted > configurable minutes ago (from system_config)
    const config = await getSystemConfig();
    const pendingMinutes = config.pending_alert_minutes || 10;
    const thresholdAgo = new Date(Date.now() - pendingMinutes * 60 * 1000);
    const filtered = (data || []).filter((d) => {
      // Use deliveries.res_accepted_at (restaurant acceptance time)
      if (!d.res_accepted_at) return false;
      // Check delivery status (deliveries.status is source of truth)
      const deliveryStatus = d.status;
      if (!["preparing", "ready", "pending"].includes(deliveryStatus))
        return false;
      return new Date(d.res_accepted_at) < thresholdAgo;
    });

    // Sort: tipped deliveries first, then by longest waiting
    filtered.sort((a, b) => {
      const tipA = parseFloat(a.tip_amount || 0);
      const tipB = parseFloat(b.tip_amount || 0);
      // Tipped first
      if (tipA > 0 && tipB <= 0) return -1;
      if (tipB > 0 && tipA <= 0) return 1;
      // Then by res_accepted_at ascending (longest waiting first)
      return new Date(a.res_accepted_at) - new Date(b.res_accepted_at);
    });

    // Enrich with computed fields
    const result = filtered.map((d) => {
      const totalAmount = parseFloat(d.orders.total_amount || 0);
      const adminSubtotal = parseFloat(d.orders.admin_subtotal || 0);
      const tipAmount = parseFloat(d.tip_amount || 0);
      const waitingMs = Date.now() - new Date(d.res_accepted_at).getTime();

      return {
        ...d,
        waiting_minutes: Math.floor(waitingMs / 60000),
        // Manager earning = total collected - restaurant payout - tip (driver earnings are 0 since unassigned)
        manager_earning: totalAmount - adminSubtotal - tipAmount,
        gross_earning: totalAmount - adminSubtotal,
      };
    });

    return res.json({
      success: true,
      deliveries: result,
      count: result.length,
    });
  } catch (err) {
    console.error("Pending deliveries error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /manager/pending-deliveries/count
 * Lightweight count-only endpoint for badge display
 */
router.get("/pending-deliveries/count", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { data, error } = await supabaseAdmin
      .from("deliveries")
      .select("id, status, res_accepted_at")
      .eq("status", "pending")
      .is("driver_id", null);

    if (error) {
      return res.status(500).json({ message: "Failed to fetch count" });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const count = (data || []).filter((d) => {
      if (!d.res_accepted_at) return false;
      // Check delivery status (deliveries.status is source of truth)
      const deliveryStatus = d.status;
      if (!["preparing", "ready", "pending"].includes(deliveryStatus))
        return false;
      return new Date(d.res_accepted_at) < tenMinutesAgo;
    }).length;

    return res.json({ success: true, count });
  } catch (err) {
    console.error("Pending deliveries count error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * PATCH /manager/pending-deliveries/:deliveryId/tip
 * Set or update tip_amount on a pending delivery to incentivize drivers.
 * The tip is deducted from manager earnings and added to driver earnings on delivery.
 */
router.patch(
  "/pending-deliveries/:deliveryId/tip",
  authenticate,
  async (req, res) => {
    try {
      if (req.user.role !== "manager") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { deliveryId } = req.params;
      const { tip_amount } = req.body;

      if (
        tip_amount === undefined ||
        tip_amount === null ||
        parseFloat(tip_amount) < 0
      ) {
        return res.status(400).json({ message: "Invalid tip amount" });
      }

      const tipValue = parseFloat(tip_amount);

      // Verify delivery exists and is still pending with no driver
      const { data: delivery, error: fetchError } = await supabaseAdmin
        .from("deliveries")
        .select("id, status, driver_id, tip_amount")
        .eq("id", deliveryId)
        .maybeSingle();

      if (fetchError || !delivery) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      if (delivery.driver_id) {
        return res
          .status(400)
          .json({ message: "Delivery already assigned to a driver" });
      }

      if (delivery.status !== "pending") {
        return res
          .status(400)
          .json({ message: "Delivery is no longer pending" });
      }

      // Update tip_amount
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("deliveries")
        .update({
          tip_amount: tipValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId)
        .select("id, tip_amount, order_id")
        .single();

      if (updateError) {
        console.error("Tip update error:", updateError);
        return res.status(500).json({ message: "Failed to update tip amount" });
      }

      // 📡 BROADCAST: Notify all drivers about the tip update via WebSocket
      if (tipValue > 0 && updated.order_id) {
        try {
          // Fetch order details for the notification
          const { data: orderData } = await supabaseAdmin
            .from("orders")
            .select(
              "order_number, restaurant_name, restaurant_address, restaurant_latitude, restaurant_longitude, delivery_address, delivery_city, delivery_latitude, delivery_longitude, distance_km, estimated_duration_min, total_amount",
            )
            .eq("id", updated.order_id)
            .single();

          if (orderData) {
            const { broadcastTipUpdate } =
              await import("../utils/socketManager.js");
            broadcastTipUpdate({
              delivery_id: deliveryId,
              order_id: updated.order_id,
              order_number: orderData.order_number,
              type: "tip_update",
              restaurant_name: orderData.restaurant_name,
              restaurant_address: orderData.restaurant_address,
              restaurant_latitude: orderData.restaurant_latitude,
              restaurant_longitude: orderData.restaurant_longitude,
              customer_address: orderData.delivery_address,
              customer_city: orderData.delivery_city,
              customer_latitude: orderData.delivery_latitude,
              customer_longitude: orderData.delivery_longitude,
              distance_km: parseFloat(orderData.distance_km || 0),
              estimated_time: parseFloat(orderData.estimated_duration_min || 0),
              total_amount: parseFloat(orderData.total_amount || 0),
              tip_amount: tipValue,
            });

            // 📱 PUSH NOTIFICATION: Notify all drivers about tipped delivery (persistent)
            sendTipDeliveryNotificationToDrivers({
              deliveryId,
              orderNumber: orderData.order_number,
              restaurantName: orderData.restaurant_name,
              totalAmount: parseFloat(orderData.total_amount || 0),
              tipAmount: tipValue,
            }).catch((err) =>
              console.error("Push tip notification error:", err),
            );
          }
        } catch (broadcastErr) {
          console.error("Tip broadcast error:", broadcastErr);
          // Don't fail the request, just log
        }
      }

      return res.json({
        success: true,
        message:
          tipValue > 0
            ? `Tip of Rs.${tipValue.toFixed(2)} set successfully`
            : "Tip removed",
        delivery: updated,
      });
    } catch (err) {
      console.error("Tip update error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ============================================================================
// SYSTEM CONFIGURATION (Operations Page)
// ============================================================================

/**
 * GET /manager/system-config
 * Fetch all system configuration values
 */
router.get("/system-config", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const config = await getSystemConfig(true); // force fresh read
    return res.json({ config });
  } catch (err) {
    console.error("System config fetch error:", err);
    return res.status(500).json({ message: "Failed to fetch system config" });
  }
});

/**
 * PUT /manager/system-config
 * Update system configuration (single row upsert)
 */
router.put("/system-config", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const {
      rate_per_km,
      max_driver_to_restaurant_km,
      max_driver_to_restaurant_amount,
      max_restaurant_proximity_km,
      second_delivery_bonus,
      additional_delivery_bonus,
      max_extra_time_minutes,
      max_extra_distance_km,
      max_active_deliveries,
      service_fee_tiers,
      delivery_fee_tiers,
      pending_alert_minutes,
      day_shift_start,
      day_shift_end,
      night_shift_start,
      night_shift_end,
      order_distance_constraints,
      max_order_distance_km,
    } = req.body;

    const updatePayload = {
      rate_per_km,
      max_driver_to_restaurant_km,
      max_driver_to_restaurant_amount,
      max_restaurant_proximity_km,
      second_delivery_bonus,
      additional_delivery_bonus,
      max_extra_time_minutes,
      max_extra_distance_km,
      max_active_deliveries,
      service_fee_tiers,
      delivery_fee_tiers,
      pending_alert_minutes,
      day_shift_start,
      day_shift_end,
      night_shift_start,
      night_shift_end,
      order_distance_constraints,
      max_order_distance_km,
      updated_by: req.user.id,
    };

    // Remove undefined fields
    Object.keys(updatePayload).forEach(
      (key) => updatePayload[key] === undefined && delete updatePayload[key],
    );

    const { data, error } = await supabaseAdmin
      .from("system_config")
      .upsert({ id: 1, ...updatePayload }, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("System config update error:", error);
      return res
        .status(500)
        .json({ message: "Failed to update system config" });
    }

    // Invalidate cache so all modules pick up new values
    invalidateConfigCache();

    console.log("✅ System config updated by manager:", req.user.id);
    return res.json({
      message: "System configuration updated successfully",
      config: data,
    });
  } catch (err) {
    console.error("System config update error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
