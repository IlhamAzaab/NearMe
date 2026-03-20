import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  getSriLankaDateString,
  getSriLankaDayRangeFromDateStr,
  shiftSriLankaDateString,
} from "../utils/sriLankaTime.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const router = express.Router();

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
 *   period: 'today' (default) | 'yesterday' | 'this_week' | 'this_month' | 'all_time'
 *
 * LOGIC (for "today"):
 * - prev_pending = most recent snapshot's ending_pending (the carried-over unpaid amount)
 * - today's sales = cash deliveries delivered AFTER the most recent snapshot
 * - total sales today = today's sales + prev_pending
 * - paid = deposits approved AFTER the most recent snapshot
 * - pending = total sales today - paid
 *
 * The snapshot acts as a reset point. Everything before the snapshot is "yesterday".
 * Everything after the snapshot is "today".
 */
router.get("/manager/summary", authenticate, managerOnly, async (req, res) => {
  const period = req.query.period || "today";
  console.log(`\n[DEPOSITS] 📊 Manager fetching summary (period: ${period})`);

  try {
    // Use stable Sri Lanka local date keys/windows to avoid UTC drift
    const todayStr = getSriLankaDateString();
    const { start: todayStartIso } = getSriLankaDayRangeFromDateStr(todayStr);

    if (period === "today") {
      // ===== TODAY =====
      // prev_pending should be the carry-over at start of today.
      // That's today's snapshot row (created at local midnight) when available.
      let { data: latestSnapshot } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .select("snapshot_date, ending_pending")
        .eq("snapshot_date", todayStr)
        .single();

      if (!latestSnapshot) {
        // Fallback: latest snapshot before today (if today's snapshot not yet created)
        const { data: fallbackSnapshot } = await supabaseAdmin
          .from("daily_deposit_snapshots")
          .select("snapshot_date, ending_pending")
          .lt("snapshot_date", todayStr)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .single();

        latestSnapshot = fallbackSnapshot;
      }

      let prevPending = 0;

      if (latestSnapshot) {
        prevPending = parseFloat(latestSnapshot.ending_pending || 0);
      }

      // Today's sales/paid should always use today's Sri Lanka day window.
      // This keeps results correct even if snapshot is re-run later in the day.
      const { data: todayCashDeliveries } = await supabaseAdmin
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
        .eq("orders.payment_method", "cash")
        .gte("updated_at", todayStartIso);

      const todaysSales = (todayCashDeliveries || []).reduce(
        (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
        0,
      );

      const { data: todayApproved } = await supabaseAdmin
        .from("driver_deposits")
        .select("approved_amount")
        .eq("status", "approved")
        .gte("reviewed_at", todayStartIso);

      const paidToday = (todayApproved || []).reduce(
        (sum, d) => sum + parseFloat(d.approved_amount || 0),
        0,
      );

      // Authoritative pending amount is the live sum of driver balances.
      // This avoids drift if old snapshots were generated with stale boundaries.
      const { data: liveDriverBalances } = await supabaseAdmin
        .from("driver_balances")
        .select("pending_deposit")
        .gt("pending_deposit", 0);

      const livePendingTotal = (liveDriverBalances || []).reduce(
        (sum, b) => sum + parseFloat(b.pending_deposit || 0),
        0,
      );

      // Calculate derived values
      const effectivePrevPending = Math.max(0, livePendingTotal - todaysSales);
      const totalSalesToday = todaysSales + effectivePrevPending;
      const pendingAmount = livePendingTotal;

      // Pending deposits count (awaiting review - always current)
      const { count: pendingCount } = await supabaseAdmin
        .from("driver_deposits")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      const summary = {
        total_sales_today: totalSalesToday,
        todays_sales: todaysSales,
        prev_pending: effectivePrevPending,
        pending: pendingAmount,
        paid: paidToday,
        pending_deposits_count: pendingCount || 0,
        period: "today",
        snapshot_date: latestSnapshot?.snapshot_date || null,
      };

      console.log(`[DEPOSITS] ✅ Summary (today):`, summary);
      return res.json({ success: true, summary });
    } else if (period === "yesterday") {
      // ===== YESTERDAY: Try snapshot first, fallback to calculating from data =====
      const yesterdayStr = shiftSriLankaDateString(todayStr, -1);

      // Get yesterday's snapshot
      const { data: snapshot } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .select("*")
        .eq("snapshot_date", yesterdayStr)
        .single();

      if (snapshot) {
        // Snapshot exists - use snapshot data
        // IMPORTANT: Snapshot N is created at midnight of day N, capturing sales from day N-1.
        // So yesterday's snapshot has day-before-yesterday's sales, NOT yesterday's sales.
        // We need TODAY's snapshot for yesterday's actual sales data.
        //
        // yesterday's snapshot.ending_pending = pending at start of yesterday (prev_pending)
        // today's snapshot.total_sales = yesterday's actual sales
        // today's snapshot.total_approved = yesterday's actual approved
        // today's snapshot.ending_pending = pending at end of yesterday

        // prev_pending = pending at START of yesterday = yesterday's snapshot ending_pending
        const prevPending = parseFloat(snapshot.ending_pending || 0);

        // Get today's snapshot for yesterday's actual sales data
        const { data: todaySnapshot } = await supabaseAdmin
          .from("daily_deposit_snapshots")
          .select("*")
          .eq("snapshot_date", todayStr)
          .single();

        if (todaySnapshot) {
          // Today's snapshot exists — use it for yesterday's sales
          const todaysSales = parseFloat(todaySnapshot.total_sales || 0);
          const paidAmount = parseFloat(todaySnapshot.total_approved || 0);
          const totalSales = todaysSales + prevPending;
          const pendingAmount = parseFloat(todaySnapshot.ending_pending || 0);

          const summary = {
            total_sales_today: totalSales,
            todays_sales: todaysSales,
            prev_pending: prevPending,
            pending: pendingAmount,
            paid: paidAmount,
            pending_deposits_count: 0,
            period: "yesterday",
            snapshot_date: yesterdayStr,
          };

          console.log(
            `[DEPOSITS] ✅ Summary (yesterday from today's snapshot):`,
            summary,
          );
          return res.json({ success: true, summary });
        }

        // Today's snapshot doesn't exist yet — calculate yesterday's sales from live data
        // Yesterday's boundaries: from yesterday's snapshot created_at to today's midnight
        const todayMidnightSL = new Date(todayStr + "T00:00:00+05:30");
        const snapshotBoundary = snapshot.created_at;

        let salesQuery = supabaseAdmin
          .from("deliveries")
          .select(`id, order_id, orders!inner(total_amount, payment_method)`)
          .eq("status", "delivered")
          .eq("orders.payment_method", "cash")
          .lt("updated_at", todayMidnightSL.toISOString());
        if (snapshotBoundary) {
          salesQuery = salesQuery.gt("updated_at", snapshotBoundary);
        }

        const { data: cashDeliveries } = await salesQuery;
        const todaysSales = (cashDeliveries || []).reduce(
          (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
          0,
        );

        let approvedQuery = supabaseAdmin
          .from("driver_deposits")
          .select("approved_amount")
          .eq("status", "approved")
          .lt("reviewed_at", todayMidnightSL.toISOString());
        if (snapshotBoundary) {
          approvedQuery = approvedQuery.gt("reviewed_at", snapshotBoundary);
        }

        const { data: approvedDeposits } = await approvedQuery;
        const paidAmount = (approvedDeposits || []).reduce(
          (sum, d) => sum + parseFloat(d.approved_amount || 0),
          0,
        );

        const totalSales = todaysSales + prevPending;
        const pendingAmount = Math.max(0, totalSales - paidAmount);

        const summary = {
          total_sales_today: totalSales,
          todays_sales: todaysSales,
          prev_pending: prevPending,
          pending: pendingAmount,
          paid: paidAmount,
          pending_deposits_count: 0,
          period: "yesterday",
          snapshot_date: yesterdayStr,
          calculated_from_live_data: true,
        };

        console.log(
          `[DEPOSITS] ✅ Summary (yesterday calculated from live data):`,
          summary,
        );
        return res.json({ success: true, summary });
      }

      // No snapshot for yesterday - calculate from actual data
      console.log(
        `[DEPOSITS] ⚠️ No snapshot for ${yesterdayStr}, calculating from data...`,
      );

      // Yesterday's time boundaries in Sri Lanka time
      const { start: yesterdayStartIso, end: yesterdayEndIso } =
        getSriLankaDayRangeFromDateStr(yesterdayStr);
      const yesterdayStart = new Date(yesterdayStartIso);

      // Get the snapshot before yesterday for prev_pending and as boundary
      const { data: prevSnapshot } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .select("*")
        .lt("snapshot_date", yesterdayStr)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      let prevPending = 0;
      let snapshotBoundary = null;

      if (prevSnapshot) {
        prevPending = parseFloat(prevSnapshot.ending_pending || 0);
        snapshotBoundary = prevSnapshot.created_at;
      }

      // Yesterday's cash sales: delivered cash orders within yesterday's date range
      // Use the later of snapshotBoundary and yesterdayStart as the lower bound
      let salesQuery = supabaseAdmin
        .from("deliveries")
        .select(`id, order_id, orders!inner(total_amount, payment_method)`)
        .eq("status", "delivered")
        .eq("orders.payment_method", "cash")
        .lte("updated_at", yesterdayEndIso);

      if (snapshotBoundary && new Date(snapshotBoundary) > yesterdayStart) {
        salesQuery = salesQuery.gt("updated_at", snapshotBoundary);
      } else {
        salesQuery = salesQuery.gte("updated_at", yesterdayStartIso);
      }

      const { data: yesterdayCashDeliveries } = await salesQuery;
      const yesterdaySales = (yesterdayCashDeliveries || []).reduce(
        (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
        0,
      );

      // Yesterday's approved deposits
      let approvedQuery = supabaseAdmin
        .from("driver_deposits")
        .select("approved_amount")
        .eq("status", "approved")
        .lte("reviewed_at", yesterdayEndIso);

      if (snapshotBoundary && new Date(snapshotBoundary) > yesterdayStart) {
        approvedQuery = approvedQuery.gt("reviewed_at", snapshotBoundary);
      } else {
        approvedQuery = approvedQuery.gte("reviewed_at", yesterdayStartIso);
      }

      const { data: yesterdayApproved } = await approvedQuery;
      const paidYesterday = (yesterdayApproved || []).reduce(
        (sum, d) => sum + parseFloat(d.approved_amount || 0),
        0,
      );

      const totalSalesYesterday = yesterdaySales + prevPending;
      const pendingYesterday = Math.max(0, totalSalesYesterday - paidYesterday);

      const summary = {
        total_sales_today: totalSalesYesterday,
        todays_sales: yesterdaySales,
        prev_pending: prevPending,
        pending: pendingYesterday,
        paid: paidYesterday,
        pending_deposits_count: 0,
        period: "yesterday",
        snapshot_date: yesterdayStr,
        calculated_from_data: true,
      };

      console.log(`[DEPOSITS] ✅ Summary (yesterday calculated):`, summary);
      return res.json({ success: true, summary });
    } else if (
      period === "this_week" ||
      period === "this_month" ||
      period === "all_time"
    ) {
      // ===== RANGE-BASED: Aggregate over a date range =====
      let startDate;
      const endDate = todayStr;

      if (period === "this_week") {
        const weekStart = new Date(`${todayStr}T00:00:00+05:30`);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
        startDate = getSriLankaDateString(weekStart);
      } else if (period === "this_month") {
        startDate = `${todayStr.substring(0, 7)}-01`; // First of month
      } else {
        startDate = "2000-01-01"; // All time
      }

      const rangeStart = new Date(`${startDate}T00:00:00+05:30`).toISOString();
      const rangeEnd = new Date(`${endDate}T23:59:59+05:30`).toISOString();

      // Get prev_pending from snapshot before the range
      const dayBeforeStartStr = shiftSriLankaDateString(startDate, -1);

      const { data: beforeSnapshot } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .select("ending_pending")
        .lte("snapshot_date", dayBeforeStartStr)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      const prevPending = beforeSnapshot
        ? parseFloat(beforeSnapshot.ending_pending || 0)
        : 0;

      // Sales in range
      const { data: rangeDeliveries } = await supabaseAdmin
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
        .eq("orders.payment_method", "cash")
        .gte("updated_at", rangeStart)
        .lte("updated_at", rangeEnd);

      const rangeSales = (rangeDeliveries || []).reduce(
        (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
        0,
      );

      // Approved in range
      const { data: rangeApproved } = await supabaseAdmin
        .from("driver_deposits")
        .select("approved_amount")
        .eq("status", "approved")
        .gte("reviewed_at", rangeStart)
        .lte("reviewed_at", rangeEnd);

      const rangePaid = (rangeApproved || []).reduce(
        (sum, d) => sum + parseFloat(d.approved_amount || 0),
        0,
      );

      const totalSales = rangeSales + prevPending;
      const pendingAmount = Math.max(0, totalSales - rangePaid);

      const summary = {
        total_sales_today: totalSales,
        todays_sales: rangeSales,
        prev_pending: prevPending,
        pending: pendingAmount,
        paid: rangePaid,
        pending_deposits_count: 0,
        period,
        snapshot_date: `${startDate} to ${endDate}`,
      };

      console.log(`[DEPOSITS] ✅ Summary (${period}):`, summary);
      return res.json({ success: true, summary });
    }

    return res.status(400).json({ success: false, message: "Invalid period" });
  } catch (error) {
    console.error(`[DEPOSITS] ❌ Error: ${error.message}`);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

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
 * SNAPSHOT LOGIC (Sri Lanka day windows):
 * - Snapshot date N stores closing totals for day N-1
 * - prev_pending comes from snapshot for day N-1
 * - sales/approved are aggregated within N-1 local day window
 * - ending_pending = (sales + prev_pending) - approved
 * - Snapshot boundary timestamp is fixed to local midnight of date N
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
    // Snapshot row for date N contains end-of-day totals from N-1.
    const todayStr = getSriLankaDateString();
    const yesterdayStr = shiftSriLankaDateString(todayStr, -1);
    const { start: yesterdayStartIso, end: yesterdayEndIso } =
      getSriLankaDayRangeFromDateStr(yesterdayStr);

    // prev_pending comes from snapshot captured at start of yesterday
    let prevPending = 0;

    const { data: lastSnapshot } = await supabaseAdmin
      .from("daily_deposit_snapshots")
      .select("ending_pending")
      .eq("snapshot_date", yesterdayStr)
      .single();

    if (lastSnapshot) {
      prevPending = parseFloat(lastSnapshot.ending_pending || 0);
    } else {
      const { data: fallbackSnapshot } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .select("ending_pending")
        .lt("snapshot_date", todayStr)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      prevPending = parseFloat(fallbackSnapshot?.ending_pending || 0);
    }

    // Yesterday's sales window in Sri Lanka time
    const { data: todayCashDeliveries } = await supabaseAdmin
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
      .eq("orders.payment_method", "cash")
      .gte("updated_at", yesterdayStartIso)
      .lte("updated_at", yesterdayEndIso);

    const totalSales = (todayCashDeliveries || []).reduce(
      (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
      0,
    );

    const { data: todayApproved } = await supabaseAdmin
      .from("driver_deposits")
      .select("approved_amount")
      .eq("status", "approved")
      .gte("reviewed_at", yesterdayStartIso)
      .lte("reviewed_at", yesterdayEndIso);

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
          // Keep snapshot boundary fixed at Sri Lanka midnight for this date.
          created_at: new Date(`${todayStr}T00:00:00+05:30`).toISOString(),
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
      const todayStr = getSriLankaDateString();

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
