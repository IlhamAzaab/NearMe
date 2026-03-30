import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { notifyAdmin } from "../utils/socketManager.js";
import { sendPushNotification } from "../utils/pushNotificationService.js";

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

const getPdfFirstPageImageUrl = (url, publicId) => {
  if (publicId) {
    return cloudinary.url(publicId, {
      resource_type: "image",
      format: "jpg",
      page: 1,
      secure: true,
    });
  }

  if (!url) return url;

  let imageUrl = url;
  if (imageUrl.includes("/raw/upload/")) {
    imageUrl = imageUrl.replace("/raw/upload/", "/image/upload/");
  }
  if (imageUrl.includes("/upload/")) {
    imageUrl = imageUrl.replace("/upload/", "/upload/pg_1/");
  }

  return imageUrl.replace(/\.pdf(\?|$)/i, ".jpg$1");
};

const normalizeAdminPaymentProof = (payment) => {
  if (!payment?.proof_url) return payment;

  const isPdfProof =
    payment.proof_type === "pdf" || /\.pdf(\?|$)/i.test(payment.proof_url);

  if (!isPdfProof) return payment;

  return {
    ...payment,
    proof_url: getPdfFirstPageImageUrl(payment.proof_url),
    proof_type: "image",
  };
};

// Middleware: only managers
const managerOnly = async (req, res, next) => {
  if (req.user.role !== "manager") {
    return res.status(403).json({ success: false, message: "Managers only" });
  }
  next();
};

/**
 * GET /manager/admin-payments/summary
 * Get overall payment summary for all restaurants:
 *   - total_to_pay: sum of all restaurants' withdrawal balances
 *   - paid_today: sum of payments made today
 */
router.get("/summary", authenticate, managerOnly, async (req, res) => {
  try {
    // Get Sri Lanka time for "today"
    const now = new Date();
    const sriLankaOffset = 5.5 * 60 * 60 * 1000;
    const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
    const todayStr = sriLankaDate.toISOString().split("T")[0];

    // Get all approved restaurants with admin
    const { data: restaurants, error: restaurantsErr } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("restaurant_status", "active")
      .not("admin_id", "is", null);

    if (restaurantsErr) throw restaurantsErr;

    const restaurantIds = (restaurants || []).map((r) => r.id);

    if (restaurantIds.length === 0) {
      return res.json({
        success: true,
        summary: { total_to_pay: 0, paid_today: 0, restaurant_count: 0 },
      });
    }

    // Total earnings for all restaurants (from restaurant_payments view)
    const { data: paymentsData } = await supabaseAdmin
      .from("restaurant_payments")
      .select("amount_to_pay")
      .in("restaurant_id", restaurantIds);

    const totalEarnings = (paymentsData || []).reduce(
      (sum, p) => sum + parseFloat(p.amount_to_pay || 0),
      0,
    );

    // Total paid to all restaurants (all time)
    const { data: allPayments } = await supabaseAdmin
      .from("admin_payments")
      .select("amount")
      .in("restaurant_id", restaurantIds);

    const totalPaid = (allPayments || []).reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0,
    );

    // Paid today
    const { data: todayPayments } = await supabaseAdmin
      .from("admin_payments")
      .select("amount")
      .in("restaurant_id", restaurantIds)
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
        restaurant_count: restaurantIds.length,
      },
    });
  } catch (error) {
    console.error("[ADMIN-PAYMENTS] Summary error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /manager/admin-payments/restaurants
 * Get all restaurants with their earnings and withdrawal balances
 * Returns list sorted by withdrawal_balance descending (highest owed first)
 */
router.get("/restaurants", authenticate, managerOnly, async (req, res) => {
  try {
    // Get all active restaurants with admin
    const { data: restaurants, error: restaurantsErr } = await supabaseAdmin
      .from("restaurants")
      .select(
        "id, restaurant_name, address, city, logo_url, restaurant_status, admin_id",
      )
      .eq("restaurant_status", "active")
      .not("admin_id", "is", null)
      .order("restaurant_name");

    if (restaurantsErr) throw restaurantsErr;
    if (!restaurants || restaurants.length === 0) {
      return res.json({ success: true, restaurants: [] });
    }

    const restaurantIds = restaurants.map((r) => r.id);

    // Get admin emails
    const adminIds = restaurants
      .map((r) => r.admin_id)
      .filter((id) => id !== null);
    const { data: admins } = await supabaseAdmin
      .from("admins")
      .select("id, email")
      .in("id", adminIds);

    const adminEmailMap = {};
    (admins || []).forEach((a) => {
      adminEmailMap[a.id] = a.email;
    });

    // Get earnings per restaurant from restaurant_payments view
    const { data: payments } = await supabaseAdmin
      .from("restaurant_payments")
      .select("restaurant_id, amount_to_pay, order_count")
      .in("restaurant_id", restaurantIds);

    // Group earnings by restaurant
    const earningsByRestaurant = {};
    const orderCountByRestaurant = {};
    (payments || []).forEach((p) => {
      if (!earningsByRestaurant[p.restaurant_id])
        earningsByRestaurant[p.restaurant_id] = 0;
      if (!orderCountByRestaurant[p.restaurant_id])
        orderCountByRestaurant[p.restaurant_id] = 0;

      earningsByRestaurant[p.restaurant_id] += parseFloat(p.amount_to_pay || 0);
      orderCountByRestaurant[p.restaurant_id] += parseInt(
        p.order_count || 0,
        10,
      );
    });

    // Get total paid per restaurant
    const { data: adminPayments } = await supabaseAdmin
      .from("admin_payments")
      .select("restaurant_id, amount")
      .in("restaurant_id", restaurantIds);

    const paidByRestaurant = {};
    (adminPayments || []).forEach((p) => {
      if (!paidByRestaurant[p.restaurant_id])
        paidByRestaurant[p.restaurant_id] = 0;
      paidByRestaurant[p.restaurant_id] += parseFloat(p.amount || 0);
    });

    // Build result
    const result = restaurants.map((r) => {
      const totalEarnings = earningsByRestaurant[r.id] || 0;
      const totalPaid = paidByRestaurant[r.id] || 0;
      const withdrawalBalance = Math.max(0, totalEarnings - totalPaid);
      const orderCount = orderCountByRestaurant[r.id] || 0;

      return {
        id: r.id,
        name: r.restaurant_name,
        address: r.address,
        city: r.city,
        logo_url: r.logo_url,
        restaurant_status: r.restaurant_status,
        admin_id: r.admin_id,
        admin_email: adminEmailMap[r.admin_id] || null,
        total_earnings: totalEarnings,
        total_paid: totalPaid,
        withdrawal_balance: withdrawalBalance,
        order_count: orderCount,
      };
    });

    // Sort by withdrawal_balance descending
    result.sort((a, b) => b.withdrawal_balance - a.withdrawal_balance);

    return res.json({ success: true, restaurants: result });
  } catch (error) {
    console.error("[ADMIN-PAYMENTS] Restaurants list error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /manager/admin-payments/restaurant/:restaurantId
 * Get detailed payment info for a specific restaurant
 */
router.get(
  "/restaurant/:restaurantId",
  authenticate,
  managerOnly,
  async (req, res) => {
    const { restaurantId } = req.params;

    try {
      // Get restaurant info
      const { data: restaurant, error: restaurantErr } = await supabaseAdmin
        .from("restaurants")
        .select(
          "id, restaurant_name, address, city, logo_url, restaurant_status, admin_id",
        )
        .eq("id", restaurantId)
        .single();

      if (restaurantErr || !restaurant) {
        return res
          .status(404)
          .json({ success: false, message: "Restaurant not found" });
      }

      // Get admin details
      let adminEmail = null;
      let adminName = null;
      let adminPhone = null;
      if (restaurant.admin_id) {
        const { data: admin } = await supabaseAdmin
          .from("admins")
          .select("email, full_name, phone")
          .eq("id", restaurant.admin_id)
          .single();
        adminEmail = admin?.email || null;
        adminName = admin?.full_name || null;
        adminPhone = admin?.phone || null;
      }

      // Get restaurant bank account details
      let bankDetails = null;
      if (restaurant.admin_id) {
        const { data: bankAccount } = await supabaseAdmin
          .from("restaurant_bank_accounts")
          .select("account_holder_name, bank_name, branch, account_number")
          .eq("admin_id", restaurant.admin_id)
          .single();
        if (bankAccount) {
          bankDetails = {
            account_holder_name: bankAccount.account_holder_name,
            bank_name: bankAccount.bank_name,
            branch_name: bankAccount.branch,
            account_number: bankAccount.account_number,
          };
        }
      }

      // Get total earnings from restaurant_payments view
      const { data: payments } = await supabaseAdmin
        .from("restaurant_payments")
        .select("amount_to_pay, order_count")
        .eq("restaurant_id", restaurantId);

      const totalEarnings = (payments || []).reduce(
        (sum, p) => sum + parseFloat(p.amount_to_pay || 0),
        0,
      );

      const orderCount = (payments || []).reduce(
        (sum, p) => sum + parseInt(p.order_count || 0, 10),
        0,
      );

      // Get total paid
      const { data: adminPayments } = await supabaseAdmin
        .from("admin_payments")
        .select("amount")
        .eq("restaurant_id", restaurantId);

      const totalPaid = (adminPayments || []).reduce(
        (sum, p) => sum + parseFloat(p.amount || 0),
        0,
      );

      const withdrawalBalance = Math.max(0, totalEarnings - totalPaid);

      return res.json({
        success: true,
        restaurant: {
          id: restaurant.id,
          name: restaurant.restaurant_name,
          address: restaurant.address,
          city: restaurant.city,
          logo_url: restaurant.logo_url,
          restaurant_status: restaurant.restaurant_status,
          admin_id: restaurant.admin_id,
          admin_email: adminEmail,
          admin_name: adminName,
          admin_phone: adminPhone,
          total_earnings: totalEarnings,
          total_paid: totalPaid,
          withdrawal_balance: withdrawalBalance,
          order_count: orderCount,
          bank_details: bankDetails,
        },
      });
    } catch (error) {
      console.error("[ADMIN-PAYMENTS] Restaurant detail error:", error.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

/**
 * GET /manager/admin-payments/restaurant/:restaurantId/history
 * Get payment history for a specific restaurant
 */
router.get(
  "/restaurant/:restaurantId/history",
  authenticate,
  managerOnly,
  async (req, res) => {
    const { restaurantId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    try {
      const { data: payments, error } = await supabaseAdmin
        .from("admin_payments")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (error) throw error;

      const normalizedPayments = (payments || []).map(normalizeAdminPaymentProof);
      return res.json({ success: true, payments: normalizedPayments });
    } catch (error) {
      console.error("[ADMIN-PAYMENTS] History error:", error.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

/**
 * POST /manager/admin-payments/pay/:restaurantId
 * Process a payment to a restaurant admin
 * Upload proof (image/PDF via Cloudinary), enter amount, complete transfer
 */
router.post(
  "/pay/:restaurantId",
  authenticate,
  managerOnly,
  upload.single("proof"),
  async (req, res) => {
    const { restaurantId } = req.params;
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

      // Check restaurant exists
      const { data: restaurant } = await supabaseAdmin
        .from("restaurants")
        .select("id, restaurant_name, admin_id")
        .eq("id", restaurantId)
        .single();

      if (!restaurant) {
        return res
          .status(404)
          .json({ success: false, message: "Restaurant not found" });
      }

      // Check that amount doesn't exceed withdrawal balance
      const { data: payments } = await supabaseAdmin
        .from("restaurant_payments")
        .select("amount_to_pay")
        .eq("restaurant_id", restaurantId);

      const totalEarnings = (payments || []).reduce(
        (sum, p) => sum + parseFloat(p.amount_to_pay || 0),
        0,
      );

      const { data: existingPayments } = await supabaseAdmin
        .from("admin_payments")
        .select("amount")
        .eq("restaurant_id", restaurantId);

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

      // Upload proof to Cloudinary.
      // If receipt is a PDF, store only the first page as an image URL.
      let proofUrl;
      let proofType;
      const isPdf = file.mimetype === "application/pdf";
      proofType = "image";

      try {
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataURI = `data:${file.mimetype};base64,${b64}`;

        if (isPdf) {
          const uploadResult = await cloudinary.uploader.upload(dataURI, {
            folder: `nearme/admin-payments/${restaurantId}`,
            public_id: `payment_${Date.now()}`,
            resource_type: "raw",
            overwrite: true,
            access_mode: "public",
          });

          proofUrl = getPdfFirstPageImageUrl(
            uploadResult.secure_url,
            uploadResult.public_id,
          );
        } else {
          const uploadResult = await cloudinary.uploader.upload(dataURI, {
            folder: `nearme/admin-payments/${restaurantId}`,
            public_id: `payment_${Date.now()}`,
            resource_type: "image",
            overwrite: true,
            access_mode: "public",
          });

          proofUrl = uploadResult.secure_url;
        }
      } catch (uploadError) {
        console.error("[ADMIN-PAYMENTS] Upload error:", uploadError.message);
        return res.status(500).json({
          success: false,
          message: "Failed to upload receipt. Please try again.",
        });
      }

      // Insert payment record
      const { data: payment, error: insertError } = await supabaseAdmin
        .from("admin_payments")
        .insert({
          restaurant_id: restaurantId,
          amount: payAmount,
          proof_url: proofUrl,
          proof_type: proofType,
          paid_by: managerId,
          note: note || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[ADMIN-PAYMENTS] Insert error:", insertError.message);
        return res.status(500).json({
          success: false,
          message: "Failed to record payment",
        });
      }

      // Calculate new balance after payment
      const newBalance = currentBalance - payAmount;

      console.log(
        `[ADMIN-PAYMENTS] ✅ Paid Rs.${payAmount} to ${restaurant.restaurant_name}. New balance: Rs.${newBalance.toFixed(2)}`,
      );

      // Real-time notify restaurant admin about received payment with proof details
      if (restaurant.admin_id) {
        notifyAdmin(restaurant.admin_id, "admin:payment_received", {
          type: "payment_received",
          title: "Payment Received",
          message: `Manager sent Rs.${payAmount.toFixed(2)} with IMAGE receipt.`,
          payment_id: payment.id,
          restaurant_id: restaurantId,
          restaurant_name: restaurant.restaurant_name,
          amount: payAmount,
          proof_type: "image",
          proof_url: proofUrl,
          note: note || null,
          created_at: payment.created_at,
        });

        // Push for mobile app parity (works when app is background/closed)
        sendPushNotification(restaurant.admin_id, {
          title: "💸 Payment Received",
          body: `Manager sent Rs.${payAmount.toFixed(2)} to your account.`,
          sound: "default",
          channelId: "payments",
          data: {
            type: "admin_payment_received",
            paymentId: String(payment.id),
            amount: String(payAmount),
            proofType: "image",
            screen: "AdminWithdrawals",
            channelId: "payments",
          },
        }).catch((err) =>
          console.error("[ADMIN-PAYMENTS] Admin push notify error:", err),
        );
      }

      return res.json({
        success: true,
        message: `Payment of Rs.${payAmount.toFixed(2)} to ${restaurant.restaurant_name} recorded successfully`,
        payment: normalizeAdminPaymentProof(payment),
        new_withdrawal_balance: newBalance,
      });
    } catch (error) {
      console.error("[ADMIN-PAYMENTS] Pay error:", error.message);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  },
);

// ============================================================================
// ADMIN-SIDE ENDPOINTS
// These are mounted under /admin/withdrawals
// ============================================================================

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admins only" });
  }
  next();
};

/**
 * GET /admin/withdrawals/summary
 * Get the admin's own restaurant withdrawal summary:
 *   - total_earnings: all-time earnings from restaurant_payments
 *   - total_withdrawals: sum of all manager payments to this restaurant
 *   - remaining_balance: total_earnings - total_withdrawals
 *   - payment count
 */
router.get("/admin/summary", authenticate, adminOnly, async (req, res) => {
  const adminId = req.user.id;

  try {
    // Get restaurant for this admin
    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("admin_id", adminId)
      .single();

    if (!restaurant) {
      return res.json({
        success: true,
        summary: {
          total_earnings: 0,
          total_withdrawals: 0,
          remaining_balance: 0,
          previous_balance: 0,
          today_earnings: 0,
          today_withdrawals: 0,
          last_30_days_earnings: 0,
          last_30_days_withdrawals: 0,
          payment_count: 0,
        },
      });
    }

    const restaurantId = restaurant.id;

    // Total earnings from restaurant_payments view
    const { data: payments } = await supabaseAdmin
      .from("restaurant_payments")
      .select("amount_to_pay, order_date")
      .eq("restaurant_id", restaurantId);

    const totalEarnings = (payments || []).reduce(
      (sum, p) => sum + parseFloat(p.amount_to_pay || 0),
      0,
    );

    // Total withdrawals (manager payments to this restaurant)
    const { data: adminPayments } = await supabaseAdmin
      .from("admin_payments")
      .select("amount, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    const totalWithdrawals = (adminPayments || []).reduce(
      (sum, p) => sum + parseFloat(p.amount || 0),
      0,
    );

    const remainingBalance = Math.max(0, totalEarnings - totalWithdrawals);

    // Sri Lanka date helpers for daily and 30-day metrics
    const now = new Date();
    const sriLankaOffset = 5.5 * 60 * 60 * 1000;
    const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
    const todayStr = sriLankaDate.toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(sriLankaDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const todayEarnings = (payments || [])
      .filter((p) => p.order_date === todayStr)
      .reduce((sum, p) => sum + parseFloat(p.amount_to_pay || 0), 0);

    const last30DaysEarnings = (payments || [])
      .filter(
        (p) => p.order_date >= thirtyDaysAgoStr && p.order_date <= todayStr,
      )
      .reduce((sum, p) => sum + parseFloat(p.amount_to_pay || 0), 0);

    // Today's withdrawals

    const todayWithdrawals = (adminPayments || [])
      .filter((p) => {
        const payDate = new Date(
          new Date(p.created_at).getTime() + sriLankaOffset,
        );
        return payDate.toISOString().split("T")[0] === todayStr;
      })
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    const last30DaysWithdrawals = (adminPayments || [])
      .filter((p) => {
        const payDate = new Date(
          new Date(p.created_at).getTime() + sriLankaOffset,
        )
          .toISOString()
          .split("T")[0];
        return payDate >= thirtyDaysAgoStr && payDate <= todayStr;
      })
      .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    const previousBalance = Math.max(0, remainingBalance - todayEarnings);

    return res.json({
      success: true,
      summary: {
        total_earnings: totalEarnings,
        total_withdrawals: totalWithdrawals,
        remaining_balance: remainingBalance,
        previous_balance: previousBalance,
        today_earnings: todayEarnings,
        today_withdrawals: todayWithdrawals,
        last_30_days_earnings: last30DaysEarnings,
        last_30_days_withdrawals: last30DaysWithdrawals,
        payment_count: (adminPayments || []).length,
      },
    });
  } catch (error) {
    console.error("[ADMIN-WITHDRAWALS] Summary error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /admin/withdrawals/history
 * Get the admin's payment history (all payments manager made to their restaurant)
 * Returns proof_url so admin can verify each payment
 */
router.get("/admin/history", authenticate, adminOnly, async (req, res) => {
  const adminId = req.user.id;
  const { limit = 50, offset = 0 } = req.query;

  try {
    // Get restaurant for this admin
    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("admin_id", adminId)
      .single();

    if (!restaurant) {
      return res.json({ success: true, payments: [] });
    }

    const { data: payments, error } = await supabaseAdmin
      .from("admin_payments")
      .select("id, amount, proof_url, proof_type, note, created_at")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    const normalizedPayments = (payments || []).map(normalizeAdminPaymentProof);
    return res.json({ success: true, payments: normalizedPayments });
  } catch (error) {
    console.error("[ADMIN-WITHDRAWALS] History error:", error.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
