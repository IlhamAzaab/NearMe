import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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

// Middleware: only managers
const managerOnly = async (req, res, next) => {
  if (req.user.role !== "manager") {
    return res.status(403).json({ success: false, message: "Managers only" });
  }
  next();
};

/**
 * GET /manager/driver-payments/summary
 * Get overall payment summary:
 *   - total_to_pay: sum of all drivers' withdrawal balances
 *   - paid_today: sum of payments made today
 */
router.get("/summary", authenticate, managerOnly, async (req, res) => {
  try {
    // Get Sri Lanka time for "today"
    const now = new Date();
    const sriLankaOffset = 5.5 * 60 * 60 * 1000;
    const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
    const todayStr = sriLankaDate.toISOString().split("T")[0];

    // Get all active drivers
    const { data: drivers, error: driversErr } = await supabaseAdmin
      .from("drivers")
      .select("id")
      .eq("driver_status", "active");

    if (driversErr) throw driversErr;

    const driverIds = (drivers || []).map((d) => d.id);

    if (driverIds.length === 0) {
      return res.json({
        success: true,
        summary: { total_to_pay: 0, paid_today: 0, driver_count: 0 },
      });
    }

    // Total earnings for all drivers (from delivered deliveries)
    // tip_amount is already included in driver_earnings
    const { data: earningsData } = await supabaseAdmin
      .from("deliveries")
      .select("driver_earnings")
      .in("driver_id", driverIds)
      .eq("status", "delivered");

    const totalEarnings = (earningsData || []).reduce(
      (sum, d) => sum + parseFloat(d.driver_earnings || 0),
      0,
    );

    // Total paid to all drivers (all time)
    const { data: allPayments } = await supabaseAdmin
      .from("driver_payments")
      .select("amount")
      .in("driver_id", driverIds);

    const totalPaid = (allPayments || []).reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0,
    );

    // Paid today
    const { data: todayPayments } = await supabaseAdmin
      .from("driver_payments")
      .select("amount")
      .in("driver_id", driverIds)
      .gte("created_at", todayStr + "T00:00:00+05:30")
      .lt("created_at", todayStr + "T23:59:59+05:30");

    const paidToday = (todayPayments || []).reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0,
    );

    const totalToPay = Math.max(0, totalEarnings - totalPaid);

    return res.json({
      success: true,
      summary: {
        total_to_pay: totalToPay,
        paid_today: paidToday,
        total_earnings: totalEarnings,
        total_paid: totalPaid,
        driver_count: driverIds.length,
      },
    });
  } catch (error) {
    console.error("[DRIVER-PAYMENTS] Summary error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /manager/driver-payments/drivers
 * Get all drivers with their earnings and withdrawal balances
 * Returns list sorted by withdrawal_balance descending (highest owed first)
 */
router.get("/drivers", authenticate, managerOnly, async (req, res) => {
  try {
    // Get all active drivers
    const { data: drivers, error: driversErr } = await supabaseAdmin
      .from("drivers")
      .select(
        "id, full_name, user_name, phone, profile_photo_url, driver_type, driver_status",
      )
      .eq("driver_status", "active")
      .order("full_name");

    if (driversErr) throw driversErr;
    if (!drivers || drivers.length === 0) {
      return res.json({ success: true, drivers: [] });
    }

    const driverIds = drivers.map((d) => d.id);

    // Get earnings per driver (tip_amount is already included in driver_earnings)
    const { data: deliveries } = await supabaseAdmin
      .from("deliveries")
      .select("driver_id, driver_earnings")
      .in("driver_id", driverIds)
      .eq("status", "delivered");

    // Group earnings by driver
    const earningsByDriver = {};
    (deliveries || []).forEach((d) => {
      if (!earningsByDriver[d.driver_id]) earningsByDriver[d.driver_id] = 0;
      earningsByDriver[d.driver_id] += parseFloat(d.driver_earnings || 0);
    });

    // Count deliveries per driver
    const deliveryCountByDriver = {};
    (deliveries || []).forEach((d) => {
      if (!deliveryCountByDriver[d.driver_id])
        deliveryCountByDriver[d.driver_id] = 0;
      deliveryCountByDriver[d.driver_id]++;
    });

    // Get total paid per driver
    const { data: payments } = await supabaseAdmin
      .from("driver_payments")
      .select("driver_id, amount")
      .in("driver_id", driverIds);

    const paidByDriver = {};
    (payments || []).forEach((p) => {
      if (!paidByDriver[p.driver_id]) paidByDriver[p.driver_id] = 0;
      paidByDriver[p.driver_id] += parseFloat(p.amount || 0);
    });

    // Get driver_balances for pending_deposit (used for verified badge)
    const { data: balances } = await supabaseAdmin
      .from("driver_balances")
      .select("driver_id, pending_deposit")
      .in("driver_id", driverIds);

    const pendingDepositByDriver = {};
    (balances || []).forEach((b) => {
      pendingDepositByDriver[b.driver_id] = parseFloat(b.pending_deposit || 0);
    });

    // Build response
    const driverList = drivers.map((driver) => {
      const totalEarnings = earningsByDriver[driver.id] || 0;
      const totalPaid = paidByDriver[driver.id] || 0;
      const withdrawalBalance = Math.max(0, totalEarnings - totalPaid);
      const pendingDeposit = pendingDepositByDriver[driver.id] || 0;
      const deliveryCount = deliveryCountByDriver[driver.id] || 0;

      return {
        id: driver.id,
        full_name: driver.full_name,
        user_name: driver.user_name,
        phone: driver.phone,
        profile_photo_url: driver.profile_photo_url,
        driver_type: driver.driver_type,
        driver_status: driver.driver_status,
        total_earnings: totalEarnings,
        total_paid: totalPaid,
        withdrawal_balance: withdrawalBalance,
        pending_deposit: pendingDeposit,
        delivery_count: deliveryCount,
        is_verified: pendingDeposit <= 100,
      };
    });

    // Sort by withdrawal balance descending (highest owed first)
    driverList.sort((a, b) => b.withdrawal_balance - a.withdrawal_balance);

    return res.json({ success: true, drivers: driverList });
  } catch (error) {
    console.error("[DRIVER-PAYMENTS] Drivers list error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /manager/driver-payments/driver/:driverId
 * Get detailed payment info for a specific driver
 */
router.get("/driver/:driverId", authenticate, managerOnly, async (req, res) => {
  const { driverId } = req.params;

  try {
    // Get driver details
    const { data: driver, error: driverErr } = await supabaseAdmin
      .from("drivers")
      .select(
        "id, full_name, user_name, phone, profile_photo_url, driver_type, driver_status",
      )
      .eq("id", driverId)
      .single();

    if (driverErr || !driver) {
      return res
        .status(404)
        .json({ success: false, message: "Driver not found" });
    }

    // Get total earnings (tip_amount is already included in driver_earnings)
    const { data: deliveries } = await supabaseAdmin
      .from("deliveries")
      .select("driver_earnings")
      .eq("driver_id", driverId)
      .eq("status", "delivered");

    const totalEarnings = (deliveries || []).reduce(
      (sum, d) => sum + parseFloat(d.driver_earnings || 0),
      0,
    );

    // Get total paid
    const { data: payments } = await supabaseAdmin
      .from("driver_payments")
      .select("amount")
      .eq("driver_id", driverId);

    const totalPaid = (payments || []).reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0,
    );

    const withdrawalBalance = Math.max(0, totalEarnings - totalPaid);

    // Get pending_deposit for verified badge
    const { data: balance } = await supabaseAdmin
      .from("driver_balances")
      .select("pending_deposit")
      .eq("driver_id", driverId)
      .single();

    const pendingDeposit = parseFloat(balance?.pending_deposit || 0);

    return res.json({
      success: true,
      driver: {
        ...driver,
        total_earnings: totalEarnings,
        total_paid: totalPaid,
        withdrawal_balance: withdrawalBalance,
        pending_deposit: pendingDeposit,
        is_verified: pendingDeposit <= 100,
      },
    });
  } catch (error) {
    console.error("[DRIVER-PAYMENTS] Driver detail error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /manager/driver-payments/driver/:driverId/history
 * Get payment history for a specific driver
 */
router.get(
  "/driver/:driverId/history",
  authenticate,
  managerOnly,
  async (req, res) => {
    const { driverId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    try {
      const { data: payments, error } = await supabaseAdmin
        .from("driver_payments")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (error) throw error;

      return res.json({ success: true, payments: payments || [] });
    } catch (error) {
      console.error("[DRIVER-PAYMENTS] History error:", error.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

/**
 * POST /manager/driver-payments/pay/:driverId
 * Process a payment to a driver
 * Upload proof (image/PDF via Cloudinary), enter amount, complete transfer
 *
 * On submit:
 * - Upload proof to Cloudinary
 * - Insert into driver_payments
 * - The withdrawal_balance is derived (total_earnings - total_paid), so inserting
 *   a new payment automatically reduces the withdrawal_balance on next query
 */
router.post(
  "/pay/:driverId",
  authenticate,
  managerOnly,
  upload.single("proof"),
  async (req, res) => {
    const { driverId } = req.params;
    const { amount, note } = req.body;
    const file = req.file;
    const managerId = req.user.id;

    try {
      // Validate amount
      const payAmount = parseFloat(amount);
      if (isNaN(payAmount) || payAmount <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid amount" });
      }

      // Validate file
      if (!file) {
        return res.status(400).json({
          success: false,
          message: "Payment receipt is required",
        });
      }

      // Check driver exists
      const { data: driver } = await supabaseAdmin
        .from("drivers")
        .select("id, full_name")
        .eq("id", driverId)
        .single();

      if (!driver) {
        return res
          .status(404)
          .json({ success: false, message: "Driver not found" });
      }

      // Check that amount doesn't exceed withdrawal balance
      const { data: deliveries } = await supabaseAdmin
        .from("deliveries")
        .select("driver_earnings")
        .eq("driver_id", driverId)
        .eq("status", "delivered");

      const totalEarnings = (deliveries || []).reduce(
        (sum, d) => sum + parseFloat(d.driver_earnings || 0),
        0,
      );

      const { data: existingPayments } = await supabaseAdmin
        .from("driver_payments")
        .select("amount")
        .eq("driver_id", driverId);

      const totalPaid = (existingPayments || []).reduce(
        (sum, p) => sum + parseFloat(p.amount || 0),
        0,
      );

      const currentBalance = Math.max(0, totalEarnings - totalPaid);

      if (payAmount > currentBalance) {
        return res.status(400).json({
          success: false,
          message: `Amount exceeds withdrawal balance. Current balance: Rs.${currentBalance.toFixed(2)}`,
        });
      }

      // Upload proof to Cloudinary
      let proofUrl;
      let proofType;
      const isPdf = file.mimetype === "application/pdf";
      proofType = isPdf ? "pdf" : "image";

      try {
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataURI = `data:${file.mimetype};base64,${b64}`;

        const uploadResult = await cloudinary.uploader.upload(dataURI, {
          folder: `nearme/driver-payments/${driverId}`,
          public_id: `payment_${Date.now()}`,
          resource_type: "image", // Use "image" for both - enables PDF rendering as image preview
          overwrite: true,
          access_mode: "public",
        });

        proofUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("[DRIVER-PAYMENTS] Upload error:", uploadError.message);
        return res.status(500).json({
          success: false,
          message: "Failed to upload receipt. Please try again.",
        });
      }

      // Insert payment record
      const { data: payment, error: insertError } = await supabaseAdmin
        .from("driver_payments")
        .insert({
          driver_id: driverId,
          amount: payAmount,
          proof_url: proofUrl,
          proof_type: proofType,
          paid_by: managerId,
          note: note || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[DRIVER-PAYMENTS] Insert error:", insertError.message);
        return res.status(500).json({
          success: false,
          message: "Failed to record payment",
        });
      }

      // Calculate new balance after payment
      const newBalance = currentBalance - payAmount;

      console.log(
        `[DRIVER-PAYMENTS] ✅ Paid Rs.${payAmount} to ${driver.full_name}. New balance: Rs.${newBalance.toFixed(2)}`,
      );

      return res.json({
        success: true,
        message: `Payment of Rs.${payAmount.toFixed(2)} to ${driver.full_name} recorded successfully`,
        payment,
        new_withdrawal_balance: newBalance,
      });
    } catch (error) {
      console.error("[DRIVER-PAYMENTS] Pay error:", error.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

// ============================================================================
// DRIVER-SIDE ENDPOINTS
// These are mounted under /driver/withdrawals
// ============================================================================

const driverOnly = (req, res, next) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({ success: false, message: "Drivers only" });
  }
  next();
};

/**
 * GET /driver/withdrawals/summary
 * Get the driver's own withdrawal summary:
 *   - total_earnings: all-time earnings from deliveries
 *   - total_withdrawals: sum of all manager payments to this driver
 *   - remaining_balance: total_earnings - total_withdrawals
 *   - payment count
 */
router.get("/my/summary", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;

  try {
    // Total earnings from delivered deliveries
    const { data: deliveries } = await supabaseAdmin
      .from("deliveries")
      .select("driver_earnings")
      .eq("driver_id", driverId)
      .eq("status", "delivered");

    const totalEarnings = (deliveries || []).reduce(
      (sum, d) => sum + parseFloat(d.driver_earnings || 0),
      0,
    );

    // Total withdrawals (manager payments to this driver)
    const { data: payments } = await supabaseAdmin
      .from("driver_payments")
      .select("amount, created_at")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });

    const totalWithdrawals = (payments || []).reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0,
    );

    const remainingBalance = Math.max(0, totalEarnings - totalWithdrawals);

    // Today's withdrawals
    const now = new Date();
    const sriLankaOffset = 5.5 * 60 * 60 * 1000;
    const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
    const todayStr = sriLankaDate.toISOString().split("T")[0];

    const todayWithdrawals = (payments || [])
      .filter((p) => {
        const payDate = new Date(
          new Date(p.created_at).getTime() + sriLankaOffset,
        );
        return payDate.toISOString().split("T")[0] === todayStr;
      })
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    return res.json({
      success: true,
      summary: {
        total_earnings: totalEarnings,
        total_withdrawals: totalWithdrawals,
        remaining_balance: remainingBalance,
        today_withdrawals: todayWithdrawals,
        payment_count: (payments || []).length,
      },
    });
  } catch (error) {
    console.error("[DRIVER-WITHDRAWALS] Summary error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /driver/withdrawals/history
 * Get the driver's payment history (all payments manager made to them)
 * Returns proof_url so driver can verify each payment
 */
router.get("/my/history", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;
  const { limit = 50, offset = 0 } = req.query;

  try {
    const { data: payments, error } = await supabaseAdmin
      .from("driver_payments")
      .select("id, amount, proof_url, proof_type, note, created_at")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    return res.json({ success: true, payments: payments || [] });
  } catch (error) {
    console.error("[DRIVER-WITHDRAWALS] History error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
