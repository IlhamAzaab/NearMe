import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const router = express.Router();

// ============================================================================
// SRI LANKA TIMEZONE UTILITIES
// ============================================================================

/**
 * Get Sri Lanka time boundaries for a given date
 * Sri Lanka is UTC+5:30 (no DST)
 * @param {string} dateType - 'today' or 'yesterday'
 * @returns {Object} - { todayStart, tomorrowStart, dateStr }
 */
function getSriLankaTimeBoundaries(dateType = "today") {
  const now = new Date();
  // Sri Lanka offset: UTC+5:30 = 5.5 hours
  const sriLankaOffsetMs = 5.5 * 60 * 60 * 1000;

  // Get current time in Sri Lanka
  const sriLankaTime = new Date(now.getTime() + sriLankaOffsetMs);
  const sriLankaDateStr = sriLankaTime.toISOString().split("T")[0];

  let targetDateStr;
  if (dateType === "yesterday") {
    const yesterday = new Date(sriLankaTime);
    yesterday.setDate(yesterday.getDate() - 1);
    targetDateStr = yesterday.toISOString().split("T")[0];
  } else {
    targetDateStr = sriLankaDateStr;
  }

  // Calculate start of target day in UTC
  // Sri Lanka midnight = UTC 18:30 previous day
  const [year, month, day] = targetDateStr.split("-").map(Number);
  const startOfDaySL = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  // Subtract Sri Lanka offset to get UTC time
  const startOfDayUTC = new Date(startOfDaySL.getTime() - sriLankaOffsetMs);

  // Start of next day
  const nextDay = new Date(startOfDayUTC);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  return {
    todayStart: startOfDayUTC.toISOString(),
    tomorrowStart: nextDay.toISOString(),
    dateStr: targetDateStr,
    sriLankaDateStr,
  };
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Role-based middleware
const driverOnly = (req, res, next) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ message: "Access denied. Drivers only." });
  }
  next();
};

const managerOnly = (req, res, next) => {
  if (req.user.role !== "manager") {
    return res.status(403).json({ message: "Access denied. Managers only." });
  }
  next();
};

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed.",
        ),
      );
    }
  },
});

// ============================================================================
// DRIVER ENDPOINTS
// ============================================================================

/**
 * GET /driver/deposits/manager-bank-details
 * Get the designated manager's bank account details for deposit
 */
router.get(
  "/manager-bank-details",
  authenticate,
  driverOnly,
  async (req, res) => {
    try {
      // Fetch the specific manager's bank details
      const { data: manager, error } = await supabaseAdmin
        .from("managers")
        .select("account_holder_name, bank_name, branch_name, account_number")
        .eq("email", "mimilhamazaab51@gmail.com")
        .single();

      if (error || !manager) {
        console.error("[DEPOSITS] Manager bank details error:", error?.message);
        return res.json({
          success: true,
          bankDetails: null,
          message: "Manager bank details not configured",
        });
      }

      return res.json({
        success: true,
        bankDetails: {
          account_holder_name: manager.account_holder_name,
          bank_name: manager.bank_name,
          branch_name: manager.branch_name,
          account_number: manager.account_number,
        },
      });
    } catch (error) {
      console.error("[DEPOSITS] Manager bank details error:", error.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

/**
 * GET /driver/deposits/balance
 * Get driver's current pending deposit balance
 */
router.get("/balance", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;

  console.log(`\n[DEPOSITS] 💰 Getting balance for driver: ${driverId}`);

  try {
    // Get driver balance
    const { data: balance, error } = await supabaseAdmin
      .from("driver_balances")
      .select("*")
      .eq("driver_id", driverId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found
      console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch balance" });
    }

    // Get pending deposit (awaiting manager approval)
    const { data: pendingDeposits } = await supabaseAdmin
      .from("driver_deposits")
      .select("amount")
      .eq("driver_id", driverId)
      .eq("status", "pending");

    const pendingApproval = (pendingDeposits || []).reduce(
      (sum, d) => sum + parseFloat(d.amount || 0),
      0,
    );

    // Calculate hours until midnight
    const now = new Date();
    const hoursUntilMidnight = 24 - now.getHours() - now.getMinutes() / 60;

    const result = {
      pending_deposit: parseFloat(balance?.pending_deposit || 0),
      total_collected: parseFloat(balance?.total_collected || 0),
      total_approved: parseFloat(balance?.total_approved || 0),
      pending_approval: pendingApproval,
      hours_until_midnight: Math.floor(hoursUntilMidnight),
    };

    console.log(
      `[DEPOSITS] ✅ Balance: Rs.${result.pending_deposit.toFixed(2)} pending`,
    );

    return res.json({ success: true, balance: result });
  } catch (error) {
    console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /driver/deposits/history
 * Get driver's deposit history
 */
router.get("/history", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;
  const { limit = 20, status } = req.query;

  console.log(
    `\n[DEPOSITS] 📜 Getting deposit history for driver: ${driverId}`,
  );

  try {
    let query = supabaseAdmin
      .from("driver_deposits")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq("status", status);
    }

    const { data: deposits, error } = await query;

    if (error) {
      console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch history" });
    }

    console.log(`[DEPOSITS] ✅ Found ${deposits.length} deposits`);

    return res.json({ success: true, deposits });
  } catch (error) {
    console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * POST /driver/deposits/submit
 * Submit a new deposit with proof
 */
router.post(
  "/submit",
  authenticate,
  driverOnly,
  upload.single("proof"),
  async (req, res) => {
    const driverId = req.user.id;
    const { amount, collection_date } = req.body;
    const file = req.file;

    console.log(
      `\n[DEPOSITS] 📤 New deposit submission from driver: ${driverId}`,
    );
    console.log(`[DEPOSITS]   Amount: Rs.${amount}`);

    try {
      // Validate amount
      const depositAmount = parseFloat(amount);
      if (isNaN(depositAmount) || depositAmount <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid deposit amount" });
      }

      // Validate file
      if (!file) {
        return res
          .status(400)
          .json({ success: false, message: "Proof of transfer is required" });
      }

      // Get current pending balance
      const { data: balance } = await supabaseAdmin
        .from("driver_balances")
        .select("pending_deposit")
        .eq("driver_id", driverId)
        .single();

      const currentPending = parseFloat(balance?.pending_deposit || 0);

      // Get total amount of pending (in-process) deposits
      const { data: pendingDeposits } = await supabaseAdmin
        .from("driver_deposits")
        .select("amount")
        .eq("driver_id", driverId)
        .eq("status", "pending");

      const totalPendingSubmissions = (pendingDeposits || []).reduce(
        (sum, d) => sum + parseFloat(d.amount || 0),
        0,
      );

      // Check if this new submission would exceed the current pending balance
      const totalAfterSubmission = totalPendingSubmissions + depositAmount;
      if (totalAfterSubmission > currentPending) {
        const availableToSubmit = Math.max(
          0,
          currentPending - totalPendingSubmissions,
        );
        return res.status(400).json({
          success: false,
          message: `Cannot submit Rs.${depositAmount.toFixed(2)}. You have Rs.${totalPendingSubmissions.toFixed(2)} in pending submissions. Available to submit: Rs.${availableToSubmit.toFixed(2)}`,
        });
      }

      // Upload file to Cloudinary
      let proofUrl;
      let proofType;
      const isPdf = file.mimetype === "application/pdf";
      proofType = isPdf ? "pdf" : "image";

      try {
        // Convert buffer to base64 data URI (same approach as onboarding)
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataURI = `data:${file.mimetype};base64,${b64}`;

        // Upload to Cloudinary
        // For PDFs: use resource_type "image" so Cloudinary can render them as images for preview
        // For images: use resource_type "image" as normal
        const uploadResult = await cloudinary.uploader.upload(dataURI, {
          folder: `nearme/deposit-proofs/${driverId}`,
          public_id: `deposit_${Date.now()}`,
          resource_type: "image", // Use "image" for both - enables PDF rendering as image preview
          overwrite: true,
          access_mode: "public",
        });

        proofUrl = uploadResult.secure_url;
        console.log(
          `[DEPOSITS] ✅ Uploaded to Cloudinary: ${proofUrl}, Type: ${proofType}`,
        );
      } catch (uploadError) {
        console.error(
          `[DEPOSITS] ❌ Cloudinary upload failed: ${uploadError.message}`,
        );
        return res.status(500).json({
          success: false,
          message: "Failed to upload proof. Please try again.",
        });
      }

      // Create deposit record
      const { data: deposit, error: insertError } = await supabaseAdmin
        .from("driver_deposits")
        .insert({
          driver_id: driverId,
          amount: depositAmount,
          proof_url: proofUrl,
          proof_type: proofType,
          collection_date:
            collection_date || new Date().toISOString().split("T")[0],
          status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        console.error(`[DEPOSITS] ❌ Insert error: ${insertError.message}`);
        return res
          .status(500)
          .json({ success: false, message: "Failed to create deposit" });
      }

      console.log(`[DEPOSITS] ✅ Deposit created: ${deposit.id}`);

      return res.json({
        success: true,
        message:
          "Deposit submitted successfully. Waiting for manager approval.",
        deposit,
      });
    } catch (error) {
      console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

// ============================================================================
// MANAGER ENDPOINTS
// ============================================================================

/**
 * GET /driver/deposits/manager/pending
 * Get all pending deposits for manager review
 */
router.get("/manager/pending", authenticate, managerOnly, async (req, res) => {
  console.log(`\n[DEPOSITS] 👔 Manager fetching pending deposits`);

  try {
    // Fetch pending deposits
    const { data: deposits, error } = await supabaseAdmin
      .from("driver_deposits")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch deposits" });
    }

    // Get unique driver IDs
    const driverIds = [...new Set(deposits.map((d) => d.driver_id))];
    let driverMap = {};
    let balanceMap = {};

    if (driverIds.length > 0) {
      // Fetch driver details from drivers table
      const { data: drivers } = await supabaseAdmin
        .from("drivers")
        .select("id, full_name, phone, email, user_name")
        .in("id", driverIds);

      (drivers || []).forEach((d) => {
        driverMap[d.id] = d;
      });

      // Fetch driver balances
      const { data: balances } = await supabaseAdmin
        .from("driver_balances")
        .select("driver_id, pending_deposit")
        .in("driver_id", driverIds);

      (balances || []).forEach((b) => {
        balanceMap[b.driver_id] = parseFloat(b.pending_deposit || 0);
      });
    }

    // Add driver info and balance to deposits
    const depositsWithDetails = deposits.map((d) => ({
      ...d,
      driver: driverMap[d.driver_id] || {
        id: d.driver_id,
        full_name: "Unknown Driver",
      },
      driver_pending_balance: balanceMap[d.driver_id] || 0,
    }));

    console.log(`[DEPOSITS] ✅ Found ${deposits.length} pending deposits`);

    return res.json({
      success: true,
      deposits: depositsWithDetails,
      count: deposits.length,
    });
  } catch (error) {
    console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * POST /driver/deposits/manager/review/:depositId
 * Approve or reject a deposit
 */
router.post(
  "/manager/review/:depositId",
  authenticate,
  managerOnly,
  async (req, res) => {
    const { depositId } = req.params;
    const { action, approved_amount, review_note } = req.body;
    const managerId = req.user.id;

    console.log(
      `\n[DEPOSITS] 👔 Manager reviewing deposit: ${depositId}, Action: ${action}`,
    );

    try {
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Invalid action. Use 'approve' or 'reject'",
        });
      }

      // Get the deposit
      const { data: deposit, error: fetchError } = await supabaseAdmin
        .from("driver_deposits")
        .select("*")
        .eq("id", depositId)
        .single();

      if (fetchError || !deposit) {
        return res
          .status(404)
          .json({ success: false, message: "Deposit not found" });
      }

      if (deposit.status !== "pending") {
        return res
          .status(400)
          .json({ success: false, message: "Deposit already reviewed" });
      }

      // Prepare update data
      const newStatus = action === "approve" ? "approved" : "rejected";
      const updateData = {
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: managerId,
        review_note: review_note || null,
      };

      // If approving, set the approved_amount
      // NOTE: The database trigger 'trigger_deduct_approved_deposit' automatically
      // deducts approved_amount from pending_deposit when status changes to 'approved'
      if (action === "approve") {
        const finalAmount = parseFloat(approved_amount || deposit.amount);
        if (isNaN(finalAmount) || finalAmount <= 0) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid approved amount" });
        }
        updateData.approved_amount = finalAmount;

        console.log(
          `[DEPOSITS] ℹ️ Setting approved_amount to Rs.${finalAmount} - DB trigger will handle deduction`,
        );
      }

      // Update the deposit (DB trigger will handle balance deduction for approvals)
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("driver_deposits")
        .update(updateData)
        .eq("id", depositId)
        .select()
        .single();

      if (updateError) {
        console.error(`[DEPOSITS] ❌ Update error: ${updateError.message}`);
        return res
          .status(500)
          .json({ success: false, message: "Failed to update deposit" });
      }

      console.log(`[DEPOSITS] ✅ Deposit ${newStatus}: ${depositId}`);

      return res.json({
        success: true,
        message: `Deposit ${newStatus} successfully`,
        deposit: updated,
      });
    } catch (error) {
      console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

/**
 * GET /driver/deposits/manager/all
 * Get all deposits with filters
 */
router.get("/manager/all", authenticate, managerOnly, async (req, res) => {
  const { status, driver_id, limit = 50, offset = 0 } = req.query;

  try {
    let query = supabaseAdmin
      .from("driver_deposits")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq("status", status);
    if (driver_id) query = query.eq("driver_id", driver_id);

    const { data: deposits, error, count } = await query;

    if (error) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch deposits" });
    }

    // Get driver details for all deposits
    const driverIds = [...new Set(deposits.map((d) => d.driver_id))];
    let driverMap = {};

    if (driverIds.length > 0) {
      const { data: drivers } = await supabaseAdmin
        .from("drivers")
        .select("id, full_name, phone, email, user_name")
        .in("id", driverIds);

      (drivers || []).forEach((d) => {
        driverMap[d.id] = d;
      });
    }

    const depositsWithDrivers = deposits.map((d) => ({
      ...d,
      driver: driverMap[d.driver_id] || {
        id: d.driver_id,
        full_name: "Unknown Driver",
      },
    }));

    return res.json({
      success: true,
      deposits: depositsWithDrivers,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /driver/deposits/manager/drivers
 * Get all drivers with pending balances
 */
router.get("/manager/drivers", authenticate, managerOnly, async (req, res) => {
  try {
    const { data: balances, error } = await supabaseAdmin
      .from("driver_balances")
      .select("*")
      .gt("pending_deposit", 0)
      .order("pending_deposit", { ascending: false });

    if (error) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch drivers" });
    }

    // Get driver details
    const driverIds = balances.map((b) => b.driver_id);
    let driverMap = {};

    if (driverIds.length > 0) {
      const { data: drivers } = await supabaseAdmin
        .from("drivers")
        .select("id, full_name, phone, email, user_name")
        .in("id", driverIds);

      (drivers || []).forEach((d) => {
        driverMap[d.id] = d;
      });
    }

    const balancesWithDrivers = balances.map((b) => ({
      ...b,
      driver: driverMap[b.driver_id] || {
        id: b.driver_id,
        full_name: "Unknown Driver",
      },
    }));

    return res.json({ success: true, drivers: balancesWithDrivers });
  } catch (error) {
    console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /driver/deposits/manager/summary
 * Get deposit summary for manager dashboard
 *
 * Query params:
 *   period: 'today' (default) | 'yesterday'
 *
 * DEFINITIONS (Sri Lanka Time - Asia/Colombo, UTC+5:30):
 * - Today's Sales = Sum of COD delivered orders where delivered_at >= today 00:00 SL
 * - Previous Pending = Total unpaid driver balances BEFORE today 00:00 SL
 * - Paid Today = Total deposits approved today (approved_at >= today 00:00 SL)
 * - Pending = prev_pending + today_sales - paid_today
 *
 * FORMULA: total_pending = prev_pending + today_sales - paid_today
 */
router.get("/manager/summary", authenticate, managerOnly, async (req, res) => {
  const period = req.query.period || "today";
  console.log(`\n[DEPOSITS] 📊 Manager fetching summary (period: ${period})`);

  // Only allow 'today' and 'yesterday' periods
  if (period !== "today" && period !== "yesterday") {
    return res.status(400).json({
      success: false,
      message: "Invalid period. Only 'today' and 'yesterday' are allowed.",
    });
  }

  try {
    // Get Sri Lanka time boundaries for the selected period
    const { todayStart, tomorrowStart, dateStr } =
      getSriLankaTimeBoundaries(period);

    console.log(`[DEPOSITS] 📅 Period: ${period}, Date: ${dateStr}`);
    console.log(`[DEPOSITS] 📅 Range: ${todayStart} to ${tomorrowStart}`);

    // 1. TODAY'S SALES: Sum of COD delivered orders in the period
    const { data: periodDeliveries, error: salesError } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
        id,
        driver_id,
        orders!inner (
          id,
          total_amount,
          payment_method,
          status
        )
      `,
      )
      .eq("status", "delivered")
      .eq("orders.payment_method", "cash")
      .eq("orders.status", "delivered")
      .gte("updated_at", todayStart)
      .lt("updated_at", tomorrowStart);

    if (salesError) {
      console.error(`[DEPOSITS] ❌ Sales query error: ${salesError.message}`);
    }

    const todaysSales = (periodDeliveries || []).reduce(
      (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
      0,
    );

    // 2. PAID TODAY: Sum of approved deposits in the period
    const { data: periodApproved, error: paidError } = await supabaseAdmin
      .from("driver_deposits")
      .select("id, approved_amount")
      .eq("status", "approved")
      .gte("reviewed_at", todayStart)
      .lt("reviewed_at", tomorrowStart);

    if (paidError) {
      console.error(`[DEPOSITS] ❌ Paid query error: ${paidError.message}`);
    }

    const paidToday = (periodApproved || []).reduce(
      (sum, d) => sum + parseFloat(d.approved_amount || 0),
      0,
    );

    // 3. PREVIOUS PENDING: All COD collected BEFORE period start - All deposits approved BEFORE period start
    // Total collected before period
    const { data: prevDeliveries, error: prevSalesError } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
        id,
        orders!inner (
          total_amount,
          payment_method,
          status
        )
      `,
      )
      .eq("status", "delivered")
      .eq("orders.payment_method", "cash")
      .eq("orders.status", "delivered")
      .lt("updated_at", todayStart);

    if (prevSalesError) {
      console.error(
        `[DEPOSITS] ❌ Prev sales error: ${prevSalesError.message}`,
      );
    }

    const totalCollectedBefore = (prevDeliveries || []).reduce(
      (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
      0,
    );

    // Total approved before period
    const { data: prevApproved, error: prevPaidError } = await supabaseAdmin
      .from("driver_deposits")
      .select("id, approved_amount")
      .eq("status", "approved")
      .lt("reviewed_at", todayStart);

    if (prevPaidError) {
      console.error(`[DEPOSITS] ❌ Prev paid error: ${prevPaidError.message}`);
    }

    const totalApprovedBefore = (prevApproved || []).reduce(
      (sum, d) => sum + parseFloat(d.approved_amount || 0),
      0,
    );

    // Previous pending = collected before - approved before
    const prevPending = Math.max(0, totalCollectedBefore - totalApprovedBefore);

    // 4. TOTAL PENDING: prev_pending + today_sales - paid_today
    const totalPending = Math.max(0, prevPending + todaysSales - paidToday);

    // 5. PENDING DEPOSITS COUNT (deposits awaiting review - always current)
    const { count: pendingCount } = await supabaseAdmin
      .from("driver_deposits")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const summary = {
      total_sales_today: todaysSales + prevPending, // Total liability
      todays_sales: todaysSales, // Sales in this period
      prev_pending: prevPending, // Carried over from before
      pending: totalPending, // Current pending balance
      paid: paidToday, // Paid in this period
      pending_deposits_count: pendingCount || 0,
      period,
      date: dateStr,
    };

    console.log(`[DEPOSITS] ✅ Summary (${period}):`, summary);
    return res.json({ success: true, summary });
  } catch (error) {
    console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /driver/deposits/manager/drivers-detailed
 * Get all drivers with their daily collection/payment breakdown
 *
 * Returns for EACH driver:
 * - name, phone, email
 * - total_collected_today: COD orders delivered today
 * - total_paid_today: Deposits approved today
 * - pending_balance: All-time (total collected - total approved)
 */
router.get(
  "/manager/drivers-detailed",
  authenticate,
  managerOnly,
  async (req, res) => {
    const period = req.query.period || "today";

    // Only allow 'today' and 'yesterday' periods
    if (period !== "today" && period !== "yesterday") {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Only 'today' and 'yesterday' are allowed.",
      });
    }

    console.log(
      `\n[DEPOSITS] 📊 Manager fetching drivers detailed (period: ${period})`,
    );

    try {
      const { todayStart, tomorrowStart, dateStr } =
        getSriLankaTimeBoundaries(period);

      // 1. Get all drivers
      const { data: drivers, error: driversError } = await supabaseAdmin
        .from("drivers")
        .select("id, full_name, phone, email, user_name")
        .eq("driver_status", "active");

      if (driversError) {
        console.error(`[DEPOSITS] ❌ Drivers error: ${driversError.message}`);
        return res
          .status(500)
          .json({ success: false, message: "Failed to fetch drivers" });
      }

      if (!drivers || drivers.length === 0) {
        return res.json({ success: true, drivers: [] });
      }

      // 2. Get all deliveries for the period (grouped by driver)
      const { data: periodDeliveries } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
        id,
        driver_id,
        orders!inner (
          total_amount,
          payment_method,
          status
        )
      `,
        )
        .eq("status", "delivered")
        .eq("orders.payment_method", "cash")
        .eq("orders.status", "delivered")
        .gte("updated_at", todayStart)
        .lt("updated_at", tomorrowStart);

      // 3. Get all deposits for the period (grouped by driver)
      const { data: periodDeposits } = await supabaseAdmin
        .from("driver_deposits")
        .select("id, driver_id, approved_amount")
        .eq("status", "approved")
        .gte("reviewed_at", todayStart)
        .lt("reviewed_at", tomorrowStart);

      // 4. Get all-time collections per driver
      const { data: allTimeDeliveries } = await supabaseAdmin
        .from("deliveries")
        .select(
          `
        id,
        driver_id,
        orders!inner (
          total_amount,
          payment_method,
          status
        )
      `,
        )
        .eq("status", "delivered")
        .eq("orders.payment_method", "cash")
        .eq("orders.status", "delivered");

      // 5. Get all-time approved deposits per driver
      const { data: allTimeDeposits } = await supabaseAdmin
        .from("driver_deposits")
        .select("id, driver_id, approved_amount")
        .eq("status", "approved");

      // Calculate totals per driver
      const driverCollectedToday = {};
      const driverPaidToday = {};
      const driverTotalCollected = {};
      const driverTotalPaid = {};

      // Period deliveries
      (periodDeliveries || []).forEach((d) => {
        const driverId = d.driver_id;
        const amount = parseFloat(d.orders?.total_amount || 0);
        driverCollectedToday[driverId] =
          (driverCollectedToday[driverId] || 0) + amount;
      });

      // Period deposits
      (periodDeposits || []).forEach((d) => {
        const driverId = d.driver_id;
        const amount = parseFloat(d.approved_amount || 0);
        driverPaidToday[driverId] = (driverPaidToday[driverId] || 0) + amount;
      });

      // All-time deliveries
      (allTimeDeliveries || []).forEach((d) => {
        const driverId = d.driver_id;
        const amount = parseFloat(d.orders?.total_amount || 0);
        driverTotalCollected[driverId] =
          (driverTotalCollected[driverId] || 0) + amount;
      });

      // All-time deposits
      (allTimeDeposits || []).forEach((d) => {
        const driverId = d.driver_id;
        const amount = parseFloat(d.approved_amount || 0);
        driverTotalPaid[driverId] = (driverTotalPaid[driverId] || 0) + amount;
      });

      // Build driver list with balances
      const driversWithBalances = drivers
        .map((driver) => {
          const collectedToday = driverCollectedToday[driver.id] || 0;
          const paidToday = driverPaidToday[driver.id] || 0;
          const totalCollected = driverTotalCollected[driver.id] || 0;
          const totalPaid = driverTotalPaid[driver.id] || 0;
          const pendingBalance = Math.max(0, totalCollected - totalPaid);

          return {
            id: driver.id,
            full_name: driver.full_name,
            phone: driver.phone,
            email: driver.email,
            user_name: driver.user_name,
            total_collected_today: collectedToday,
            total_paid_today: paidToday,
            pending_balance: pendingBalance,
            total_collected: totalCollected,
            total_paid: totalPaid,
          };
        })
        .filter(
          (d) =>
            d.total_collected_today > 0 ||
            d.total_paid_today > 0 ||
            d.pending_balance > 0,
        )
        .sort((a, b) => b.pending_balance - a.pending_balance);

      // Calculate totals
      const totalPendingBalance = driversWithBalances.reduce(
        (sum, d) => sum + d.pending_balance,
        0,
      );
      const totalCollectedToday = driversWithBalances.reduce(
        (sum, d) => sum + d.total_collected_today,
        0,
      );
      const totalPaidToday = driversWithBalances.reduce(
        (sum, d) => sum + d.total_paid_today,
        0,
      );

      console.log(
        `[DEPOSITS] ✅ Found ${driversWithBalances.length} drivers with activity`,
      );

      return res.json({
        success: true,
        drivers: driversWithBalances,
        totals: {
          total_pending_balance: totalPendingBalance,
          total_collected_today: totalCollectedToday,
          total_paid_today: totalPaidToday,
        },
        period,
        date: dateStr,
      });
    } catch (error) {
      console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

/**
 * GET /driver/deposits/manager/deposit/:depositId
 * Get a single deposit by ID for verification
 */
router.get(
  "/manager/deposit/:depositId",
  authenticate,
  managerOnly,
  async (req, res) => {
    const { depositId } = req.params;

    console.log(`\n[DEPOSITS] 👔 Manager fetching deposit: ${depositId}`);

    try {
      const { data: deposit, error } = await supabaseAdmin
        .from("driver_deposits")
        .select("*")
        .eq("id", depositId)
        .single();

      if (error || !deposit) {
        console.error(`[DEPOSITS] ❌ Deposit not found: ${depositId}`);
        return res
          .status(404)
          .json({ success: false, message: "Deposit not found" });
      }

      // Get driver details
      const { data: driver } = await supabaseAdmin
        .from("drivers")
        .select("id, full_name, phone, email, user_name")
        .eq("id", deposit.driver_id)
        .single();

      // Get driver's current pending balance
      const { data: balance } = await supabaseAdmin
        .from("driver_balances")
        .select("pending_deposit, total_collected, total_approved")
        .eq("driver_id", deposit.driver_id)
        .single();

      const result = {
        ...deposit,
        driver: driver || {
          id: deposit.driver_id,
          full_name: "Unknown Driver",
        },
        driver_pending_balance: parseFloat(balance?.pending_deposit || 0),
        driver_total_collected: parseFloat(balance?.total_collected || 0),
        driver_total_approved: parseFloat(balance?.total_approved || 0),
      };

      console.log(`[DEPOSITS] ✅ Found deposit: ${depositId}`);

      return res.json({ success: true, deposit: result });
    } catch (error) {
      console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

/**
 * POST /driver/deposits/cron/daily-snapshot
 * Create daily deposit snapshot (called by external scheduler at midnight Sri Lanka time)
 * This endpoint should be protected by a secret key in production
 *
 * SNAPSHOT LOGIC (uses snapshot boundary, not date range):
 * - Gets the most recent snapshot's created_at as boundary
 * - today's sales = deliveries AFTER the last snapshot
 * - today's approved = deposits approved AFTER the last snapshot
 * - prev_pending = last snapshot's ending_pending
 * - ending_pending = (today's sales + prev_pending) - today's approved
 * - This ending_pending becomes the next period's prev_pending
 */
router.post("/cron/daily-snapshot", async (req, res) => {
  const { secret } = req.body;

  // Require CRON_SECRET env var — no fallback default
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  console.log(`\n[DEPOSITS] ⏰ Running daily snapshot cron job`);

  try {
    // Get Sri Lanka timezone date
    const now = new Date();
    const sriLankaOffset = 5.5 * 60 * 60 * 1000;
    const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
    const todayStr = sriLankaDate.toISOString().split("T")[0];

    // Get the most recent snapshot as boundary
    let prevPending = 0;
    let snapshotBoundary = null;

    const { data: lastSnapshot } = await supabaseAdmin
      .from("daily_deposit_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .single();

    if (lastSnapshot) {
      prevPending = parseFloat(lastSnapshot.ending_pending || 0);
      snapshotBoundary = lastSnapshot.created_at;
    }

    // Calculate sales AFTER the last snapshot
    let salesQuery = supabaseAdmin
      .from("deliveries")
      .select(
        `
        id,
        order_id,
        orders!inner (
          total_amount,
          payment_method
        )
      `,
      )
      .eq("status", "delivered")
      .eq("orders.payment_method", "cash");

    if (snapshotBoundary) {
      salesQuery = salesQuery.gt("updated_at", snapshotBoundary);
    }

    const { data: todayCashDeliveries } = await salesQuery;

    const totalSales = (todayCashDeliveries || []).reduce(
      (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
      0,
    );

    // Calculate approved deposits AFTER the last snapshot
    let approvedQuery = supabaseAdmin
      .from("driver_deposits")
      .select("approved_amount")
      .eq("status", "approved");

    if (snapshotBoundary) {
      approvedQuery = approvedQuery.gt("reviewed_at", snapshotBoundary);
    }

    const { data: todayApproved } = await approvedQuery;

    const totalApproved = (todayApproved || []).reduce(
      (sum, d) => sum + parseFloat(d.approved_amount || 0),
      0,
    );

    // Calculate totals
    const totalSalesToday = totalSales + prevPending;
    const endingPending = Math.max(0, totalSalesToday - totalApproved);

    // Count pending deposits
    const { count: pendingCount } = await supabaseAdmin
      .from("driver_deposits")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    // Insert or update snapshot
    const { data: snapshot, error } = await supabaseAdmin
      .from("daily_deposit_snapshots")
      .upsert(
        {
          snapshot_date: todayStr,
          ending_pending: endingPending,
          total_sales: totalSales,
          total_approved: totalApproved,
          pending_deposits_count: pendingCount || 0,
          created_at: new Date().toISOString(),
        },
        { onConflict: "snapshot_date" },
      )
      .select()
      .single();

    if (error) {
      console.error(`[DEPOSITS] ❌ Snapshot error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "Failed to create snapshot" });
    }

    console.log(`[DEPOSITS] ✅ Daily snapshot created for ${todayStr}:`, {
      prev_pending: prevPending,
      total_sales: totalSales,
      total_sales_today: totalSalesToday,
      total_approved: totalApproved,
      ending_pending: endingPending,
      pending_deposits_count: pendingCount,
    });

    return res.json({ success: true, snapshot });
  } catch (error) {
    console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * POST /driver/deposits/test/simulate-snapshot
 * Test endpoint to simulate snapshot and optionally apply it as yesterday's snapshot
 * This helps test the prev_pending logic without waiting for midnight
 *
 * Body params:
 * - applyAsYesterday: boolean - if true, saves snapshot with yesterday's date
 */
router.post(
  "/test/simulate-snapshot",
  authenticate,
  managerOnly,
  async (req, res) => {
    const { applyAsYesterday = false } = req.body;

    console.log(`\n[DEPOSITS] 🧪 Testing snapshot simulation`);

    try {
      // Get Sri Lanka timezone date
      const now = new Date();
      const sriLankaOffset = 5.5 * 60 * 60 * 1000;
      const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
      const todayStr = sriLankaDate.toISOString().split("T")[0];

      // Get the most recent snapshot as boundary
      let currentPrevPending = 0;
      let snapshotBoundary = null;

      const { data: lastSnapshot } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .select("*")
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      if (lastSnapshot) {
        currentPrevPending = parseFloat(lastSnapshot.ending_pending || 0);
        snapshotBoundary = lastSnapshot.created_at;
      }

      // Calculate sales AFTER the last snapshot
      let salesQuery = supabaseAdmin
        .from("deliveries")
        .select(
          `
          id,
          order_id,
          orders!inner (
            total_amount,
            payment_method
          )
        `,
        )
        .eq("status", "delivered")
        .eq("orders.payment_method", "cash");

      if (snapshotBoundary) {
        salesQuery = salesQuery.gt("updated_at", snapshotBoundary);
      }

      const { data: todayCashDeliveries } = await salesQuery;

      const totalSales = (todayCashDeliveries || []).reduce(
        (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
        0,
      );

      // Calculate approved deposits AFTER the last snapshot
      let approvedQuery = supabaseAdmin
        .from("driver_deposits")
        .select("approved_amount")
        .eq("status", "approved");

      if (snapshotBoundary) {
        approvedQuery = approvedQuery.gt("reviewed_at", snapshotBoundary);
      }

      const { data: todayApproved } = await approvedQuery;

      const totalApproved = (todayApproved || []).reduce(
        (sum, d) => sum + parseFloat(d.approved_amount || 0),
        0,
      );

      // Calculate derived values
      const totalSalesToday = totalSales + currentPrevPending;
      const endingPending = Math.max(0, totalSalesToday - totalApproved);

      // Count pending deposits
      const { count: pendingCount } = await supabaseAdmin
        .from("driver_deposits")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      const simulatedSnapshot = {
        snapshot_date: todayStr,
        ending_pending: endingPending,
        total_sales: totalSales,
        total_approved: totalApproved,
        pending_deposits_count: pendingCount || 0,
      };

      // What would happen after this snapshot
      const afterSnapshot = {
        prev_pending: endingPending,
        todays_sales: 0,
        total_sales_today: endingPending,
        paid: 0,
        pending: endingPending,
      };

      // Save the snapshot (this creates the new boundary)
      const { data: saved, error } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .upsert(
          {
            ...simulatedSnapshot,
            created_at: new Date().toISOString(),
          },
          { onConflict: "snapshot_date" },
        )
        .select()
        .single();

      if (error) {
        console.error(`[DEPOSITS] ❌ Save error: ${error.message}`);
        return res
          .status(500)
          .json({ success: false, message: "Failed to save snapshot" });
      }

      console.log(
        `[DEPOSITS] ✅ Snapshot created for ${todayStr}:`,
        simulatedSnapshot,
      );

      return res.json({
        success: true,
        message: `Snapshot created for ${todayStr}. Refresh the deposits page to see the reset.`,
        saved_snapshot: saved,
        before_snapshot: {
          todays_sales: totalSales,
          prev_pending: currentPrevPending,
          total_sales_today: totalSalesToday,
          paid: totalApproved,
          pending: endingPending,
        },
        after_snapshot_refresh: afterSnapshot,
      });
    } catch (error) {
      console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

export default router;
