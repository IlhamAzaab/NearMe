import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import { generateTempPassword } from "../utils/password.js";
import { sendAdminInviteEmail, sendDriverInviteEmail } from "../utils/email.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

/**
 * GET /manager/me
 * Get manager profile
 */
router.get("/me", authenticate, async (req, res) => {
  try {
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

    console.log(`Creating admin for email: ${email}, username: ${username}`);

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
      await sendAdminInviteEmail({ to: email, tempPassword, loginUrl });
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

    console.log(`Creating driver for email: ${email}, username: ${username}`);

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
      await sendDriverInviteEmail({ to: email, tempPassword, loginUrl });
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
         restaurants:restaurant_id (id, restaurant_name, logo_url)`
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("admin_status", status);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`email.ilike.${term},full_name.ilike.${term}`);
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
        `id, full_name, email, phone, city, driver_type, driver_status, profile_completed, created_at`
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("driver_status", status);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`email.ilike.${term},full_name.ilike.${term}`);
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

    try {
      await supabaseAdmin.from("driver_status_log").insert({
        driver_id: driverId,
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
         admin_id, admins:admin_id (id, email, full_name, phone)`
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("restaurant_status", status);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`restaurant_name.ilike.${term},city.ilike.${term}`);
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
  }
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
      `
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

    // Log the status change
    await supabaseAdmin.from("driver_status_log").insert({
      driver_id: driverId,
      old_status: "pending",
      new_status: newStatus,
      changed_by: req.user.id,
      change_reason:
        reason ||
        (action === "approve" ? "Manager approved" : "Manager rejected"),
    });

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
          "id, email, full_name, phone, home_address, profile_photo_url, nic_front, nic_back"
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
  }
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
  }
);

export default router;
