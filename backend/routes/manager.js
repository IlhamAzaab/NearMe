import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";
import { generateTempPassword } from "../utils/password.js";
import { sendAdminInviteEmail, sendDriverInviteEmail } from "../utils/email.js";
import {
  getSystemConfig,
  invalidateConfigCache,
} from "../utils/systemConfig.js";
import {
  broadcastNewDelivery,
  notifyCustomer,
  notifyAdmin,
  notifyDriver,
} from "../utils/socketManager.js";
import {
  sendAdminApprovalNotification,
  sendDriverApprovalNotification,
  sendTipDeliveryNotificationToDrivers,
  sendPushNotification,
  sendBroadcastNotification,
} from "../utils/pushNotificationService.js";
import {
  getSriLankaDayRange,
  getSriLankaDayRangeFromDateStr,
  getSriLankaDateKey,
  shiftSriLankaDateString,
} from "../utils/sriLankaTime.js";
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

const router = express.Router();

// Short-lived in-memory cache for heavy manager analytics endpoints.
// This reduces repeated aggregation load from frequent dashboard polling.
const MANAGER_ANALYTICS_CACHE_TTL_MS = 30 * 1000;
const managerAnalyticsCache = new Map();

function getCachedManagerAnalytics(key) {
  const entry = managerAnalyticsCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    managerAnalyticsCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedManagerAnalytics(key, value) {
  managerAnalyticsCache.set(key, {
    value,
    expiresAt: Date.now() + MANAGER_ANALYTICS_CACHE_TTL_MS,
  });
}

function buildCacheKey(path, req) {
  const queryPart = new URLSearchParams(req.query || {}).toString();
  return `${path}?${queryPart}`;
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const hint = String(error?.hint || "").toLowerCase();
  const target = String(columnName || "").toLowerCase();

  if (!target) {
    return false;
  }

  return (
    error?.code === "42703" ||
    message.includes(`column ${target}`) ||
    message.includes(`'${target}'`) ||
    details.includes(target) ||
    hint.includes(target)
  );
}

function isSchemaVariantError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();

  return (
    code === "42703" ||
    code === "PGRST204" ||
    code === "23502" ||
    message.includes("column") ||
    message.includes("schema cache") ||
    details.includes("null value")
  );
}

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const target = String(relationName || "").toLowerCase();

  return (
    error?.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes(target) ||
    details.includes(target)
  );
}

function getUsernameFromEmail(email) {
  const localPart = String(email || "").split("@")[0] || "admin";
  return localPart.slice(0, 64);
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

async function findExistingAdminByEmail(email) {
  let result = await supabaseAdmin
    .from("admins")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (result.error && isMissingColumnError(result.error, "id")) {
    result = await supabaseAdmin
      .from("admins")
      .select("user_id, email")
      .eq("email", email)
      .maybeSingle();
  }

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    return null;
  }

  return {
    email: result.data.email,
    userId: result.data.id || result.data.user_id || null,
  };
}

async function insertAdminProfileWithFallback({ userId, email }) {
  const attempts = [
    {
      id: userId,
      email,
      force_password_change: true,
      profile_completed: false,
    },
    {
      user_id: userId,
      username: getUsernameFromEmail(email),
      email,
      force_password_change: true,
      profile_completed: false,
    },
    {
      user_id: userId,
      username: getUsernameFromEmail(email),
      email,
    },
  ];

  let lastError = null;

  for (const payload of attempts) {
    const { error } = await supabaseAdmin.from("admins").insert(payload);
    if (!error) {
      return null;
    }

    lastError = error;
    if (!isSchemaVariantError(error)) {
      return error;
    }
  }

  return lastError;
}

async function createSingleAdminAccount({ email, loginUrl }) {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return {
      ok: false,
      status: 400,
      email: normalizedEmail || String(email || "").trim(),
      message: "Invalid email format",
    };
  }

  const existingAdmin = await findExistingAdminByEmail(normalizedEmail);
  if (existingAdmin) {
    return {
      ok: false,
      status: 409,
      email: normalizedEmail,
      message: `Email ${normalizedEmail} is already registered as an admin.`,
    };
  }

  const { data: existingUser, error: existingUserError } = await supabaseAdmin
    .from("users")
    .select("id, role")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingUserError) {
    return {
      ok: false,
      status: 500,
      email: normalizedEmail,
      message: "Failed to check existing user",
      error: existingUserError?.message,
    };
  }

  if (existingUser) {
    return {
      ok: false,
      status: 409,
      email: normalizedEmail,
      message: `Email ${normalizedEmail} is already in use by a ${existingUser.role || "user"}.`,
    };
  }

  const tempPassword = generateTempPassword();
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
    });

  if (authError || !authData?.user?.id) {
    if (authError?.code === "email_exists" || authError?.status === 422) {
      return {
        ok: false,
        status: 409,
        email: normalizedEmail,
        message: `Email ${normalizedEmail} is already registered in auth.`,
      };
    }

    return {
      ok: false,
      status: 500,
      email: normalizedEmail,
      message: "Failed to create auth user",
      error: authError?.message,
    };
  }

  const userId = authData.user.id;

  const cleanup = async () => {
    try {
      await supabaseAdmin.from("admins").delete().eq("id", userId);
      await supabaseAdmin.from("admins").delete().eq("user_id", userId);
      await supabaseAdmin.from("admins").delete().eq("email", normalizedEmail);
      await supabaseAdmin.from("users").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch (cleanupError) {
      console.error("Admin cleanup failed:", cleanupError);
    }
  };

  const { error: userInsertError } = await supabaseAdmin.from("users").insert({
    id: userId,
    role: "admin",
    email: normalizedEmail,
    profile_completed: false,
  });

  if (userInsertError) {
    await cleanup();
    return {
      ok: false,
      status: 500,
      email: normalizedEmail,
      message: "Failed to insert user role",
      error: userInsertError?.message,
    };
  }

  const adminInsertError = await insertAdminProfileWithFallback({
    userId,
    email: normalizedEmail,
  });

  if (adminInsertError) {
    await cleanup();
    return {
      ok: false,
      status: 500,
      email: normalizedEmail,
      message: "Failed to insert admin profile",
      error: adminInsertError?.message,
    };
  }

  try {
    await sendAdminInviteEmail({
      to: normalizedEmail,
      tempPassword,
      loginUrl,
    });
  } catch (sendError) {
    console.error(`Email send error for ${normalizedEmail}:`, sendError);
    await cleanup();
    return {
      ok: false,
      status: 502,
      email: normalizedEmail,
      message: "Failed to send invite email",
      error: sendError?.message || "Email send failed",
    };
  }

  return {
    ok: true,
    status: 201,
    email: normalizedEmail,
    userId,
    tempPassword,
    loginUrl,
    emailSent: true,
    emailError: null,
    message: "Admin created successfully",
  };
}

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

    const { email, emails } = req.body || {};
    const loginUrl =
      process.env.MANAGER_LOGIN_URL || "https://www.meezo.lk/login";

    const requestedEmails = Array.isArray(emails)
      ? emails
      : String(email || "")
          .split(/[\n,;]/)
          .map((value) => value.trim())
          .filter(Boolean);

    if (!requestedEmails.length) {
      return res.status(400).json({ message: "email or emails is required" });
    }

    const uniqueEmails = Array.from(
      new Set(requestedEmails.map((value) => normalizeEmail(value))),
    ).filter(Boolean);

    const results = [];
    for (const itemEmail of uniqueEmails) {
      const result = await createSingleAdminAccount({
        email: itemEmail,
        loginUrl,
      });
      results.push(result);
    }

    if (uniqueEmails.length === 1) {
      const singleResult = results[0];
      if (!singleResult.ok) {
        return res.status(singleResult.status || 500).json({
          message: singleResult.message,
          error: singleResult.error || null,
          email: singleResult.email,
        });
      }

      return res.status(201).json({
        message: singleResult.message,
        userId: singleResult.userId,
        email: singleResult.email,
        emailSent: singleResult.emailSent,
        emailError: singleResult.emailError,
        loginUrl: singleResult.loginUrl,
      });
    }

    const successCount = results.filter((item) => item.ok).length;
    const failed = results.filter((item) => !item.ok);

    return res.status(200).json({
      message: `Processed ${uniqueEmails.length} admin request(s): ${successCount} success, ${failed.length} failed.`,
      summary: {
        requested: uniqueEmails.length,
        success: successCount,
        failed: failed.length,
      },
      results,
    });
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

    const tempPassword = generateTempPassword();
    const loginUrl =
      process.env.MANAGER_LOGIN_URL || "https://www.meezo.lk/login";

    console.log("================ DRIVER CREATION ================");
    console.log(`Email: ${email}`);
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
        await supabaseAdmin.from("drivers").delete().eq("id", userId);
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
      .insert({
        id: userId,
        role: "driver",
        email,
        profile_completed: false,
      });

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
      console.error("Driver email send error:", e.message);
      await cleanup();
      return res.status(502).json({
        message: "Failed to send invite email",
        error: e?.message || "Email send failed",
      });
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
    const { status } = req.body || {};
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

    const { error: updateError } = await supabaseAdmin
      .from("drivers")
      .update({
        driver_status: status,
        updated_at: new Date().toISOString(),
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
 * GET /manager/renewed-documents
 * List renewed document submissions from drivers for manager review.
 */
router.get("/renewed-documents", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const requestedStatus = String(
      req.query?.status || "pending",
    ).toLowerCase();
    const allowedStatuses = new Set(["pending", "approved", "rejected", "all"]);
    const effectiveStatus = allowedStatuses.has(requestedStatus)
      ? requestedStatus
      : "pending";

    let query = supabaseAdmin
      .from("driver_document_renewals")
      .select(
        "id, driver_id, document_type, proposed_document_url, status, submitted_at, reviewed_at, reviewed_by, review_reason",
      )
      .order("submitted_at", { ascending: false });

    if (effectiveStatus !== "all") {
      query = query.eq("status", effectiveStatus);
    }

    const { data: renewals, error } = await query;

    if (error) {
      console.error("/manager/renewed-documents fetch error:", error);
      if (isMissingRelationError(error, "driver_document_renewals")) {
        return res.status(500).json({
          message:
            "Renewed document workflow table is missing. Please run the latest database migration.",
        });
      }

      return res
        .status(500)
        .json({ message: "Failed to load renewed documents" });
    }

    const renewalList = renewals || [];
    const driverIds = [
      ...new Set(renewalList.map((item) => item.driver_id).filter(Boolean)),
    ];

    let driverMap = new Map();
    if (driverIds.length > 0) {
      const { data: drivers, error: driversError } = await supabaseAdmin
        .from("drivers")
        .select("id, full_name, email, phone")
        .in("id", driverIds);

      if (driversError) {
        console.error(
          "/manager/renewed-documents drivers fetch error:",
          driversError,
        );
        return res
          .status(500)
          .json({ message: "Failed to load renewed document owners" });
      }

      driverMap = new Map((drivers || []).map((driver) => [driver.id, driver]));
    }

    const items = renewalList.map((item) => ({
      ...item,
      driver: driverMap.get(item.driver_id)
        ? {
            id: driverMap.get(item.driver_id).id,
            full_name: driverMap.get(item.driver_id).full_name,
            email: driverMap.get(item.driver_id).email,
            phone: driverMap.get(item.driver_id).phone,
          }
        : null,
    }));

    return res.json({ renewedDocuments: items });
  } catch (e) {
    console.error("/manager/renewed-documents error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /manager/renewed-documents/:renewalId/review
 * Approve/reject a renewed document request.
 * On approval, replace the current driver document_url with proposed_document_url.
 */
router.post(
  "/renewed-documents/:renewalId/review",
  authenticate,
  async (req, res) => {
    try {
      if (req.user.role !== "manager") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { renewalId } = req.params;
      const { action, reason } = req.body || {};
      const normalizedAction = String(action || "").toLowerCase();

      if (!["approve", "reject"].includes(normalizedAction)) {
        return res.status(400).json({
          message: "Invalid action. Must be 'approve' or 'reject'",
        });
      }

      const { data: renewal, error: renewalError } = await supabaseAdmin
        .from("driver_document_renewals")
        .select(
          "id, driver_id, document_type, proposed_document_url, status, submitted_at",
        )
        .eq("id", renewalId)
        .maybeSingle();

      if (renewalError) {
        console.error(
          "/manager/renewed-documents review fetch error:",
          renewalError,
        );
        return res
          .status(500)
          .json({ message: "Failed to load renewal request" });
      }

      if (!renewal) {
        return res.status(404).json({ message: "Renewal request not found" });
      }

      if (renewal.status !== "pending") {
        return res.status(400).json({
          message: `Renewal request is already ${renewal.status}`,
        });
      }

      const reviewTimestamp = new Date().toISOString();

      if (normalizedAction === "approve") {
        const documentPayload = {
          driver_id: renewal.driver_id,
          document_type: renewal.document_type,
          document_url: renewal.proposed_document_url,
          uploaded_at: reviewTimestamp,
          verified: true,
          verified_at: reviewTimestamp,
          verified_by: req.user.id,
          rejection_reason: null,
        };

        const { error: replaceError } = await supabaseAdmin
          .from("driver_documents")
          .upsert(documentPayload, { onConflict: "driver_id,document_type" });

        if (replaceError) {
          console.error(
            "/manager/renewed-documents document replace error:",
            replaceError,
          );
          return res
            .status(500)
            .json({ message: "Failed to replace driver document" });
        }
      }

      const { error: reviewError } = await supabaseAdmin
        .from("driver_document_renewals")
        .update({
          status: normalizedAction === "approve" ? "approved" : "rejected",
          reviewed_at: reviewTimestamp,
          reviewed_by: req.user.id,
          review_reason:
            normalizedAction === "reject"
              ? String(reason || "").trim() || null
              : null,
        })
        .eq("id", renewalId);

      if (reviewError) {
        console.error(
          "/manager/renewed-documents review update error:",
          reviewError,
        );
        return res
          .status(500)
          .json({ message: "Failed to update renewal request status" });
      }

      return res.json({
        message:
          normalizedAction === "approve"
            ? "Renewed document approved and live document replaced"
            : "Renewed document rejected",
      });
    } catch (e) {
      console.error("/manager/renewed-documents review error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

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
          "id, email, full_name, phone, home_address, nic_number, date_of_birth, profile_photo_url, nic_front, nic_back",
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

      const { data: adminIdentity } = await supabaseAdmin
        .from("admins")
        .select("id, user_id")
        .eq("id", restaurant.admin_id)
        .maybeSingle();

      // Keep auth-facing profile state in sync once manager approves onboarding.
      if (action === "approve") {
        const userIdsToUpdate = Array.from(
          new Set(
            [
              restaurant.admin_id,
              adminIdentity?.user_id,
              adminIdentity?.id,
            ].filter(Boolean),
          ),
        );

        if (userIdsToUpdate.length) {
          const { error: userProfileError } = await supabaseAdmin
            .from("users")
            .update({ profile_completed: true })
            .in("id", userIdsToUpdate);

          if (userProfileError) {
            console.error(
              "Users profile_completed sync error (non-fatal):",
              userProfileError,
            );
          }
        }
      }

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

      // Get restaurant name once for both push and realtime notifications.
      const { data: restaurantDetails } = await supabaseAdmin
        .from("restaurants")
        .select("restaurant_name")
        .eq("id", restaurantId)
        .single();

      const restaurantName =
        restaurantDetails?.restaurant_name || "Your Restaurant";
      const isApproved = action === "approve";

      // Resolve both auth user ID and admin profile user_id so push targets remain valid
      // across deployments where admins table PK can differ from auth.users id.
      const notifyAdminTargets = Array.from(
        new Set(
          [
            restaurant.admin_id,
            adminIdentity?.user_id,
            adminIdentity?.id,
          ].filter(Boolean),
        ),
      );

      // Send push notification to admin's mobile device.
      try {
        for (const adminTargetId of notifyAdminTargets) {
          await sendAdminApprovalNotification(
            adminTargetId,
            restaurantName,
            isApproved,
          );
        }
        console.log(
          `[NOTIFY] Push notification sent to admin target(s): ${notifyAdminTargets.join(", ")} (${isApproved ? "approved" : "rejected"})`,
        );
      } catch (pushError) {
        console.error(
          "Push notification error (non-fatal):",
          pushError.message,
        );
      }

      // Send realtime website notification to admin dashboard.
      try {
        const realtimeTitle = isApproved
          ? "Restaurant Approval Confirmed"
          : "Restaurant Verification Update";
        const realtimeMessage = isApproved
          ? `${restaurantName} has been approved by the Meezo operations team. You can now start receiving orders.`
          : `${restaurantName} was not approved. Please review the feedback and update your onboarding details.`;

        for (const adminTargetId of notifyAdminTargets) {
          notifyAdmin(adminTargetId, "admin:restaurant_verification", {
            type: isApproved ? "restaurant_approval" : "restaurant_rejection",
            title: realtimeTitle,
            message: realtimeMessage,
            restaurant_id: restaurantId,
            restaurant_name: restaurantName,
            status: newStatus,
          });
        }
      } catch (socketError) {
        console.error(
          "Realtime admin notification error (non-fatal):",
          socketError.message,
        );
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

    const cacheKey = buildCacheKey("/dashboard-stats", req);
    const cached = getCachedManagerAnalytics(cacheKey);
    if (cached) {
      res.set("Cache-Control", "private, max-age=10");
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const now = new Date();
    const {
      dateStr: todayDateStr,
      start: todayStart,
      end: todayEnd,
    } = getSriLankaDayRange(now);

    // ---- 1. Today's delivered orders with earnings ----
    const { data: todayDeliveries, error: delErr } = await supabaseAdmin
      .from("deliveries")
      .select(
        "order_id, driver_earnings, base_amount, extra_earnings, bonus_amount, tip_amount, status, driver_id, delivered_at",
      )
      .eq("status", "delivered")
      .gte("delivered_at", todayStart)
      .lte("delivered_at", todayEnd);

    if (delErr) {
      console.error("Dashboard deliveries error:", delErr);
      return res.status(500).json({ message: "Failed to fetch deliveries" });
    }

    const allOrderIds = (todayDeliveries || []).map((d) => d.order_id);
    const getFinalDriverEarnings = (d) => {
      const stored = parseFloat(d.driver_earnings || 0);
      if (stored > 0) return stored;
      return (
        parseFloat(d.base_amount || 0) +
        parseFloat(d.extra_earnings || 0) +
        parseFloat(d.bonus_amount || 0) +
        parseFloat(d.tip_amount || 0)
      );
    };
    const deliveriesMap = {};
    for (const d of todayDeliveries || []) {
      deliveriesMap[d.order_id] = {
        driver_earnings: getFinalDriverEarnings(d),
        driver_id: d.driver_id,
      };
    }

    // Get orders for today's deliveries (no date filter on orders - delivery date matters)
    let todayOrders = [];
    if (allOrderIds.length > 0) {
      const { data: ordersData } = await supabaseAdmin
        .from("orders")
        .select(
          "id, subtotal, admin_subtotal, commission_total, delivery_fee, service_fee, total_amount, placed_at, restaurant_id, restaurant_name",
        )
        .in("id", allOrderIds);
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

    // ---- 2a. Balance payment pending for drivers and restaurants ----
    // Balance = Total owed - Total approved/paid
    // Get ALL delivered deliveries for computing balance payments
    const { data: allDeliveries } = await supabaseAdmin
      .from("deliveries")
      .select(
        "order_id, driver_earnings, base_amount, extra_earnings, bonus_amount, tip_amount, driver_id, status",
      )
      .eq("status", "delivered");

    const allDeliveriesOrderIds = (allDeliveries || []).map((d) => d.order_id);
    const allDeliveriesMap = {};
    const allDriverSet = new Set();
    let totalDriverEarnings = 0;

    for (const d of allDeliveries || []) {
      const finalDriverEarnings = getFinalDriverEarnings(d);
      allDeliveriesMap[d.order_id] = {
        driver_earnings: finalDriverEarnings,
      };
      totalDriverEarnings += finalDriverEarnings;
      if (d.driver_id) {
        allDriverSet.add(d.driver_id);
      }
    }

    let totalRestaurantOwed = 0;
    const allRestaurantMap = {};

    if (allDeliveriesOrderIds.length > 0) {
      const { data: allOrdersData } = await supabaseAdmin
        .from("orders")
        .select("id, admin_subtotal, restaurant_id, restaurant_name")
        .in("id", allDeliveriesOrderIds);

      for (const order of allOrdersData || []) {
        const restaurantPay = parseFloat(order.admin_subtotal || 0);
        totalRestaurantOwed += restaurantPay;

        if (order.restaurant_id) {
          allRestaurantMap[order.restaurant_id] =
            (allRestaurantMap[order.restaurant_id] || 0) + restaurantPay;
        }
      }
    }

    // Get APPROVED driver deposits to subtract from total driver earnings
    const { data: approvedDeposits } = await supabaseAdmin
      .from("driver_deposits")
      .select("approved_amount")
      .eq("status", "approved");

    const totalApprovedDeposits = (approvedDeposits || []).reduce(
      (sum, d) => sum + parseFloat(d.approved_amount || 0),
      0,
    );

    // Calculate balance payments
    const driverPaymentBalance = Math.max(
      0,
      totalDriverEarnings - totalApprovedDeposits,
    );

    // Get total payments already made to restaurants via admin_payments
    const { data: adminPayments } = await supabaseAdmin
      .from("admin_payments")
      .select("amount");

    const totalPaidToRestaurants = (adminPayments || []).reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0,
    );

    const restaurantPaymentBalance = Math.max(
      0,
      totalRestaurantOwed - totalPaidToRestaurants,
    );

    // ---- 2b. Pending amount from drivers (cash collected not yet deposited) ----
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
      cashQuery = cashQuery.gt("delivered_at", snapshotBoundary);
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
    const { data: approvedDepositsAfterSnapshot } = await approvedQuery;
    const paidAmount = (approvedDepositsAfterSnapshot || []).reduce(
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
      const dayDateStr = shiftSriLankaDateString(todayDateStr, -i);
      const dayRange = getSriLankaDayRangeFromDateStr(dayDateStr);
      const dayStart = new Date(dayRange.start);
      graphDays.push({
        date: dayDateStr,
        label: dayStart.toLocaleDateString("en-US", {
          weekday: "short",
          timeZone: "Asia/Colombo",
        }),
        start: dayRange.start,
        end: dayRange.end,
      });
    }

    // Fetch all delivered deliveries for the last 7 days (by delivered_at)
    const weekStart = graphDays[0].start;
    const { data: weekDeliveries } = await supabaseAdmin
      .from("deliveries")
      .select(
        "order_id, driver_earnings, base_amount, extra_earnings, bonus_amount, tip_amount, delivered_at",
      )
      .eq("status", "delivered")
      .gte("delivered_at", weekStart)
      .lte("delivered_at", todayEnd);

    const weekOrderIds = (weekDeliveries || []).map((d) => d.order_id);
    const weekDeliveriesMap = {};
    for (const d of weekDeliveries || []) {
      weekDeliveriesMap[d.order_id] = {
        driver_earnings: getFinalDriverEarnings(d),
        delivered_at: d.delivered_at,
      };
    }

    let weekOrders = [];
    if (weekOrderIds.length > 0) {
      const { data: weekData } = await supabaseAdmin
        .from("orders")
        .select("id, total_amount, admin_subtotal")
        .in("id", weekOrderIds);
      weekOrders = weekData || [];
    }

    const earningsGraph = graphDays.map((day) => {
      // Filter by Sri Lanka delivery date, not by UTC day.
      const dayOrders = weekOrders.filter((o) => {
        const deliveredAt = weekDeliveriesMap[o.id]?.delivered_at;
        if (!deliveredAt) return false;
        return getSriLankaDateKey(deliveredAt) === day.date;
      });
      let sales = 0;
      let earnings = 0;
      for (const order of dayOrders) {
        const total = parseFloat(order.total_amount || 0);
        const restPay = parseFloat(order.admin_subtotal || 0);
        const driverPay = weekDeliveriesMap[order.id]?.driver_earnings || 0;
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
    const responsePayload = {
      success: true,
      todayEarnings: parseFloat(todayEarnings.toFixed(2)),
      todaySales: parseFloat(todaySales.toFixed(2)),
      todayOrders: todayOrders.length,
      totalPendingFromDrivers: parseFloat(totalPendingFromDrivers.toFixed(2)),
      driverPayment: parseFloat(driverPaymentBalance.toFixed(2)),
      driverCount: allDriverSet.size,
      restaurantPayment: parseFloat(restaurantPaymentBalance.toFixed(2)),
      restaurantCount: Object.keys(allRestaurantMap).length,
      earningsGraph,
    };

    setCachedManagerAnalytics(cacheKey, responsePayload);
    res.set("Cache-Control", "private, max-age=10");
    res.set("X-Cache", "MISS");
    return res.json(responsePayload);
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

    const cacheKey = buildCacheKey("/earnings/summary", req);
    const cached = getCachedManagerAnalytics(cacheKey);
    if (cached) {
      res.set("Cache-Control", "private, max-age=10");
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    const { period = "daily", from, to } = req.query;

    // Calculate date range
    let startDate, endDate;
    const now = new Date();

    if (from && to) {
      startDate = new Date(from);
      endDate = new Date(to);
    } else if (period === "daily") {
      const todayRange = getSriLankaDayRange(now);
      startDate = new Date(todayRange.start);
      endDate = new Date(todayRange.end);
    } else if (period === "yesterday") {
      const yesterdayDateStr = shiftSriLankaDateString(
        getSriLankaDayRange(now).dateStr,
        -1,
      );
      const yesterdayRange = getSriLankaDayRangeFromDateStr(yesterdayDateStr);
      startDate = new Date(yesterdayRange.start);
      endDate = new Date(yesterdayRange.end);
    } else if (period === "weekly") {
      const weekStartDateStr = shiftSriLankaDateString(
        getSriLankaDayRange(now).dateStr,
        -6,
      );
      startDate = new Date(
        getSriLankaDayRangeFromDateStr(weekStartDateStr).start,
      );
      endDate = new Date(now);
    } else if (period === "monthly") {
      const todayDateStr = getSriLankaDayRange(now).dateStr;
      const monthStartDateStr = `${todayDateStr.slice(0, 7)}-01`;
      startDate = new Date(
        getSriLankaDayRangeFromDateStr(monthStartDateStr).start,
      );
      endDate = new Date(getSriLankaDayRangeFromDateStr(todayDateStr).end);
    }

    // Manager earnings only count when delivery is completed (delivered)
    // Money is collected from customer only after driver delivers the food
    // Filter by delivered_at within date range (consistent with dashboard)
    // Only delivered status (cancelled/failed orders excluded automatically)
    let delQuery = supabaseAdmin
      .from("deliveries")
      .select(
        "order_id, driver_earnings, base_amount, extra_earnings, bonus_amount, tip_amount, status, delivered_at",
      )
      .eq("status", "delivered");

    if (startDate) {
      delQuery = delQuery.gte("delivered_at", startDate.toISOString());
    }
    if (endDate) {
      delQuery = delQuery.lte("delivered_at", endDate.toISOString());
    }

    const { data: deliveries, error: delError } = await delQuery;

    if (delError) {
      console.error("Deliveries fetch error:", delError);
      return res.status(500).json({ message: "Failed to fetch deliveries" });
    }

    // Get order IDs from qualifying deliveries
    const orderIds = (deliveries || []).map((d) => d.order_id);

    // Build deliveries map for driver earnings
    let deliveriesMap = {};
    const getFinalDriverEarnings = (d) => {
      const stored = parseFloat(d.driver_earnings || 0);
      if (stored > 0) return stored;
      return (
        parseFloat(d.base_amount || 0) +
        parseFloat(d.extra_earnings || 0) +
        parseFloat(d.bonus_amount || 0) +
        parseFloat(d.tip_amount || 0)
      );
    };
    for (const d of deliveries || []) {
      deliveriesMap[d.order_id] = {
        driver_earnings: getFinalDriverEarnings(d),
        status: d.status,
      };
    }

    // Get orders for those deliveries (no date filter on orders - delivery date matters)
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
          placed_at,
          delivered_at
        `,
        )
        .in("id", orderIds);

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

    const responsePayload = { summary };
    setCachedManagerAnalytics(cacheKey, responsePayload);
    res.set("Cache-Control", "private, max-age=10");
    res.set("X-Cache", "MISS");
    return res.json(responsePayload);
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
      limit = 100,
      offset = 0,
    } = req.query;

    // Strategy: Show ALL orders (delivered and non-delivered) in correct period
    // - Delivered orders appear in period when delivered (delivered_at)
    // - Non-delivered orders appear in period when placed (placed_at)
    // - Cancelled orders are excluded entirely
    // - Only delivered orders have earnings calculated

    // Fetch ALL deliveries except cancelled
    const { data: allDeliveries, error: delError } = await supabaseAdmin
      .from("deliveries")
      .select(
        "order_id, driver_earnings, status, delivered_at, driver_id, drivers(full_name, phone)",
      )
      .neq("status", "cancelled");

    if (delError) {
      console.error("Deliveries fetch error:", delError);
      return res.status(500).json({ message: "Failed to fetch deliveries" });
    }

    // Build deliveries map
    const orderIds = (allDeliveries || []).map((d) => d.order_id);
    let deliveriesMap = {};
    for (const d of allDeliveries || []) {
      deliveriesMap[d.order_id] = {
        driver_earning:
          d.status === "delivered" ? parseFloat(d.driver_earnings || 0) : 0,
        driver_name: d.drivers?.full_name || null,
        driver_phone: d.drivers?.phone || null,
        delivery_status: d.status,
        delivered_at: d.delivered_at,
      };
    }

    // Fetch orders for these deliveries
    let orders = [];
    if (orderIds.length > 0) {
      let orderQuery = supabaseAdmin
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
        placed_at,
        delivered_at
      `,
        )
        .in("id", orderIds);

      if (restaurant_id) {
        orderQuery = orderQuery.eq("restaurant_id", restaurant_id);
      }

      const { data: ordersData, error } = await orderQuery;

      if (error) {
        console.error("Orders fetch error:", error);
        return res.status(500).json({ message: "Failed to fetch orders" });
      }
      orders = ordersData || [];
    }

    // Filter orders by period based on their relevant timestamp
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    const filteredOrders = orders.filter((order) => {
      const deliveryInfo = deliveriesMap[order.id];
      if (!deliveryInfo) return false;

      // Determine which timestamp to use for period filtering
      let relevantDate;
      if (
        deliveryInfo.delivery_status === "delivered" &&
        deliveryInfo.delivered_at
      ) {
        relevantDate = new Date(deliveryInfo.delivered_at);
      } else {
        relevantDate = new Date(order.placed_at);
      }

      // Apply date range filter
      if (fromDate && relevantDate < fromDate) return false;
      if (toDate && relevantDate > toDate) return false;
      return true;
    });

    // Sort by relevant date (delivered_at for delivered, placed_at otherwise) descending
    filteredOrders.sort((a, b) => {
      const aInfo = deliveriesMap[a.id];
      const bInfo = deliveriesMap[b.id];

      const aDate =
        aInfo.delivery_status === "delivered" && aInfo.delivered_at
          ? new Date(aInfo.delivered_at)
          : new Date(a.placed_at);

      const bDate =
        bInfo.delivery_status === "delivered" && bInfo.delivered_at
          ? new Date(bInfo.delivered_at)
          : new Date(b.placed_at);

      return bDate - aDate;
    });

    // Apply pagination
    const paginatedOrders = filteredOrders.slice(
      parseInt(offset),
      parseInt(offset) + parseInt(limit),
    );

    // Add calculated earnings to each order
    const ordersWithEarnings = paginatedOrders.map((order) => {
      const deliveryInfo = deliveriesMap[order.id] || {};
      const driverEarning = deliveryInfo.driver_earning || 0;
      const totalCollected = parseFloat(order.total_amount || 0);
      const restaurantPayout = parseFloat(order.admin_subtotal || 0);
      const managerEarning = totalCollected - restaurantPayout - driverEarning;

      return {
        ...order,
        // Use delivery status (orders table doesn't have status)
        status: deliveryInfo.delivery_status || "pending",
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
            await broadcastTipUpdate({
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
      rtc_rate_below_5km,
      rtc_rate_above_5km,
      max_driver_to_restaurant_km,
      max_driver_to_restaurant_amount,
      max_restaurant_proximity_km,
      second_delivery_bonus,
      additional_delivery_bonus,
      max_extra_time_minutes,
      max_extra_distance_km,
      max_active_deliveries,
      commission_percentage,
      service_fee_tiers,
      delivery_fee_tiers,
      pending_alert_minutes,
      day_shift_start,
      day_shift_end,
      night_shift_start,
      night_shift_end,
      order_distance_constraints,
      max_order_distance_km,
      launch_promo_enabled,
      launch_promo_first_km_rate,
      launch_promo_max_km,
      launch_promo_beyond_km_rate,
    } = req.body;

    const updatePayload = {
      rate_per_km,
      rtc_rate_below_5km,
      rtc_rate_above_5km,
      max_driver_to_restaurant_km,
      max_driver_to_restaurant_amount,
      max_restaurant_proximity_km,
      second_delivery_bonus,
      additional_delivery_bonus,
      max_extra_time_minutes,
      max_extra_distance_km,
      max_active_deliveries,
      commission_percentage,
      service_fee_tiers,
      delivery_fee_tiers,
      pending_alert_minutes,
      day_shift_start,
      day_shift_end,
      night_shift_start,
      night_shift_end,
      order_distance_constraints,
      max_order_distance_km,
      launch_promo_enabled,
      launch_promo_first_km_rate,
      launch_promo_max_km,
      launch_promo_beyond_km_rate,
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

/**
 * GET /manager/launch-promotion/customers
 * List customers who acknowledged launch promotion popup
 */
router.get("/launch-promotion/customers", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    const { data: customers, error } = await supabaseAdmin
      .from("customers")
      .select(
        "id, username, email, phone, created_at, launch_promo_acknowledged_at",
      )
      .eq("launch_promo_acknowledged", true)
      .order("launch_promo_acknowledged_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Launch promo customers fetch error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch launch promo customers" });
    }

    const customerIds = (customers || []).map((c) => c.id);
    let orderStatsByCustomer = new Map();

    if (customerIds.length > 0) {
      const { data: ordersData, error: ordersError } = await supabaseAdmin
        .from("orders")
        .select("id, customer_id, placed_at")
        .in("customer_id", customerIds)
        .order("placed_at", { ascending: true });

      if (ordersError) {
        console.error("Launch promo orders stats error:", ordersError);
      } else {
        for (const order of ordersData || []) {
          const prev = orderStatsByCustomer.get(order.customer_id) || {
            orders_count: 0,
            first_order_at: null,
          };
          prev.orders_count += 1;
          if (!prev.first_order_at) {
            prev.first_order_at = order.placed_at;
          }
          orderStatsByCustomer.set(order.customer_id, prev);
        }
      }
    }

    const customersWithStats = (customers || []).map((customer) => {
      const stats = orderStatsByCustomer.get(customer.id) || {
        orders_count: 0,
        first_order_at: null,
      };
      return {
        ...customer,
        ...stats,
      };
    });

    return res.json({
      customers: customersWithStats,
      total: customersWithStats.length,
    });
  } catch (err) {
    console.error("Launch promo customers route error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── SEND NOTIFICATION SYSTEM ────────────────────────────────

/**
 * GET /manager/customers
 * List all customers for recipient selection
 */
router.get("/customers", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { search } = req.query;

    let query = supabaseAdmin
      .from("customers")
      .select("id, username, email, phone, city")
      .order("created_at", { ascending: false });

    if (search) {
      const safe = search.replace(/[,()]/g, "").trim();
      if (safe) {
        const term = `%${safe}%`;
        query = query.or(`email.ilike.${term},username.ilike.${term}`);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Fetch customers error:", error);
      return res.status(500).json({ message: "Failed to fetch customers" });
    }

    return res.json({ customers: data || [] });
  } catch (e) {
    console.error("/manager/customers error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /manager/send-notification
 * Send push + socket notification to selected recipients
 *
 * Body: {
 *   role: "customer" | "admin" | "driver",
 *   title: string,
 *   body: string,
 *   scheduledTime: ISO string | null (null = send now),
 *   recipientIds: string[] | "all"
 * }
 */
router.post("/send-notification", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { role, title, body, scheduledTime, recipientIds } = req.body;

    // Validate
    if (!role || !["customer", "admin", "driver"].includes(role)) {
      return res
        .status(400)
        .json({ message: "Invalid role. Must be customer, admin, or driver." });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Title is required." });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ message: "Body is required." });
    }

    const notification = {
      title: title.trim(),
      body: body.trim(),
      data: {
        type: "manager_notification",
        role,
        sentBy: req.user.id,
        sentAt: new Date().toISOString(),
      },
    };

    // Check if scheduled for later
    if (scheduledTime) {
      const scheduledDate = new Date(scheduledTime);
      const now = new Date();
      if (scheduledDate > now) {
        // Store scheduled notification
        const { data: scheduled, error: schedError } = await supabaseAdmin
          .from("scheduled_notifications")
          .insert({
            role,
            title: notification.title,
            body: notification.body,
            data: notification.data,
            scheduled_at: scheduledTime,
            recipient_ids: recipientIds === "all" ? null : recipientIds,
            created_by: req.user.id,
            status: "pending",
          })
          .select()
          .single();

        if (schedError) {
          console.error("Schedule notification error:", schedError);
          // Fallback: send immediately if scheduling fails
          console.log("Falling back to immediate send...");
        } else {
          return res.json({
            success: true,
            message: `Notification scheduled for ${scheduledDate.toLocaleString()}`,
            scheduled,
          });
        }
      }
    }

    // Send immediately
    const results = { push: [], socket: [], failed: [] };
    let totalRecipients = 0;

    // Get the table name for this role
    const tableMap = {
      customer: "customers",
      admin: "admins",
      driver: "drivers",
    };

    // Socket notifier map
    const socketNotify = {
      customer: notifyCustomer,
      admin: notifyAdmin,
      driver: notifyDriver,
    };

    if (recipientIds === "all") {
      // Broadcast to all users of this role
      console.log(`📢 Broadcasting notification to all ${role}s`);

      // Get all user IDs of this role
      const { data: users } = await supabaseAdmin
        .from(tableMap[role])
        .select("id");

      if (users && users.length > 0) {
        totalRecipients = users.length;

        // Send push + log to each user individually (sendPushNotification logs to notification_log)
        for (const user of users) {
          try {
            const pushResult = await sendPushNotification(
              user.id,
              notification,
            );
            results.push.push({ userId: user.id, ...pushResult });

            // Socket notification for web real-time
            socketNotify[role](user.id, "manager_notification", {
              title: notification.title,
              body: notification.body,
              data: notification.data,
            });
            results.socket.push(user.id);
          } catch (err) {
            console.error(`Failed to notify ${user.id}:`, err);
            results.failed.push({ userId: user.id, error: err.message });
          }
        }
      }
    } else if (Array.isArray(recipientIds) && recipientIds.length > 0) {
      // Send to specific users
      totalRecipients = recipientIds.length;
      console.log(`📤 Sending notification to ${totalRecipients} ${role}(s)`);

      for (const userId of recipientIds) {
        try {
          const pushResult = await sendPushNotification(userId, notification);
          results.push.push({ userId, ...pushResult });

          // Socket notification for web real-time
          socketNotify[role](userId, "manager_notification", {
            title: notification.title,
            body: notification.body,
            data: notification.data,
          });
          results.socket.push(userId);
        } catch (err) {
          console.error(`Failed to notify ${userId}:`, err);
          results.failed.push({ userId, error: err.message });
        }
      }
    } else {
      return res
        .status(400)
        .json({ message: "recipientIds must be 'all' or a non-empty array." });
    }

    // Store in scheduled_notifications (with status "sent") so recipient
    // notification pages and manager history can find it
    const { error: schedInsertErr } = await supabaseAdmin
      .from("scheduled_notifications")
      .insert({
        role,
        title: notification.title,
        body: notification.body,
        data: {
          ...notification.data,
          recipientCount: totalRecipients,
          recipientIds,
        },
        scheduled_at: new Date().toISOString(),
        recipient_ids: recipientIds === "all" ? null : recipientIds,
        created_by: req.user.id,
        status: "sent",
        sent_at: new Date().toISOString(),
      });

    if (schedInsertErr) {
      console.error(
        "Failed to log to scheduled_notifications:",
        schedInsertErr,
      );
    }

    // Log the manager's own broadcast action
    await supabaseAdmin.from("notification_log").insert({
      user_id: req.user.id,
      user_type: "manager",
      title: `[Broadcast to ${role}s] ${notification.title}`,
      body: notification.body,
      data: {
        ...notification.data,
        recipientCount: totalRecipients,
        recipientIds,
      },
      status: "sent",
    });

    console.log(
      `✅ Manager notification sent to ${totalRecipients} ${role}(s)`,
    );

    return res.json({
      success: true,
      message: `Notification sent to ${totalRecipients} ${role}(s)`,
      totalRecipients,
      results: {
        pushSent: results.push.length,
        socketSent: results.socket.length,
        failed: results.failed.length,
      },
    });
  } catch (e) {
    console.error("/manager/send-notification error:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /manager/notification-history
 * Get history of notifications sent by managers (from both notification_log + scheduled_notifications)
 */
router.get("/notification-history", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const managerId = req.user.id;

    // 1) Fetch from notification_log (manager's sent notifications)
    const { data: logData, error: logError } = await supabaseAdmin
      .from("notification_log")
      .select("*")
      .eq("user_type", "manager")
      .order("sent_at", { ascending: false })
      .limit(50);

    if (logError) {
      console.error("notification_log history fetch error:", logError);
    }

    // 2) Fetch from scheduled_notifications (all scheduled by this manager)
    const { data: scheduledData, error: schedError } = await supabaseAdmin
      .from("scheduled_notifications")
      .select("*")
      .eq("created_by", managerId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (schedError) {
      console.error("scheduled_notifications history fetch error:", schedError);
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
      role: s.role,
      scheduled_at: s.scheduled_at,
      sent_at: s.sent_at,
      created_at: s.sent_at || s.created_at,
      source: "scheduled",
    }));

    // Merge and sort by time desc
    const all = [...normalizedLog, ...normalizedScheduled]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 100);

    return res.json({ notifications: all });
  } catch (e) {
    console.error("/manager/notification-history error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
