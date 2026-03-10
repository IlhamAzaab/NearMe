import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import cron from "node-cron";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { runManagerChecks } from "./utils/managerNotificationChecker.js";
import {
  runRestaurantScheduler,
  runFoodAvailabilityScheduler,
} from "./utils/restaurantScheduler.js";
import { initializeSocket } from "./utils/socketManager.js";

// Load .env file only if NODE_ENV is not production and .env exists
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

// Verify Supabase configuration on startup
console.log("\n🔍 Checking Supabase configuration...");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing");
console.log(
  "SUPABASE_SERVICE_ROLE_KEY:",
  process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓ Set (hidden)" : "✗ Missing",
);

// Auth configuration
console.log("\n📧 Auth email delivery: Supabase built-in");
console.log(
  "BACKEND_URL:",
  process.env.BACKEND_URL || "✗ Missing (will use fallback)",
);
console.log(
  "FRONTEND_URL:",
  process.env.FRONTEND_URL || "✗ Missing (will use fallback)",
);
console.log(
  "SUPABASE_ANON_KEY:",
  process.env.SUPABASE_ANON_KEY ? "✓ Set" : "✗ Missing",
);

// Test Supabase connection
(async () => {
  try {
    console.log("\n🔗 Testing Supabase connection...");
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id")
      .limit(1);

    if (error) {
      console.error("❌ Supabase connection test failed:", error.message);
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("fetch failed")
      ) {
        console.error("⚠️  This appears to be a network connectivity issue.");
        console.error("   Please check:");
        console.error("   1. Your internet connection");
        console.error("   2. Firewall settings");
        console.error("   3. DNS configuration");
        console.error("   4. Supabase URL in .env file");
      }
    } else {
      console.log("✅ Supabase connection successful!");
    }
  } catch (err) {
    console.error("❌ Supabase connection test error:", err.message);
  }
  console.log("");
})();

// Import routes
import adminRoutes from "./routes/admin.js";
import adminPaymentsRoutes from "./routes/adminPayments.js";
import authRoutes from "./routes/auth.js";
import cartRoutes from "./routes/cart.js";
import customerRoutes from "./routes/customer.js";
import driverRoutes from "./routes/driver.js";
import driverDeliveryRoutes from "./routes/driverDelivery.js";
import driverDepositsRoutes from "./routes/driverDeposits.js";
import driverPaymentsRoutes from "./routes/driverPayments.js";
import managerRoutes from "./routes/manager.js";
import onboardingRoutes from "./routes/onboarding.js";
import ordersRoutes from "./routes/orders.js";
import publicRoutes from "./routes/public.js";
import pushNotificationRoutes from "./routes/pushNotification.js";
import reportsRoutes from "./routes/reports.js";
import restaurantOnboardingRoutes from "./routes/restaurantOnboarding.js";

const app = express();

// --- CORS: only allow your own frontend origins ---
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
  "http://localhost:5179",
];

// Add any extra allowed origins from environment (comma-separated)
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(",").forEach((o) => {
    const trimmed = o.trim();
    if (trimmed) allowedOrigins.push(trimmed);
  });
}

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);
      // Exact match or match *.vercel.app deployments
      if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// --- Security headers ---
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Prevent referrer leakage
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Remove Express fingerprint
  res.removeHeader("X-Powered-By");
  next();
});

// --- Body size limits (10MB for image uploads, not 50MB) ---
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// --- Global rate limiter: 500 requests per minute per IP ---
// Increased from 200 to handle web + mobile + dev hot reloads on same IP
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for frequently-polled driver dashboard endpoints
    skip: (req) => {
      const skipPaths = [
        "/driver/stats/today",
        "/driver/stats/monthly",
        "/driver/deliveries/recent",
        "/driver/deliveries/active",
        "/driver/working-hours-status",
        "/driver/profile",
        "/driver/me",
        "/driver/status-info",
        "/driver/notifications",
        "/driver/deposits/balance",
        "/driver/deposits/history",
        "/health",
      ];
      return skipPaths.some(
        (p) => req.path === p || req.path.startsWith(p + "?"),
      );
    },
    message: { message: "Too many requests, please try again later" },
  }),
);

// --- Strict rate limiter for auth endpoints ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  // Skip CORS preflight requests — browsers send OPTIONS before POST,
  // which would double-count each login attempt.
  // Also skip GET requests for email verification links (clicked from email,
  // not login attempts) and polling endpoints.
  skip: (req) => {
    if (req.method === "OPTIONS") return true;
    if (
      req.method === "GET" &&
      ["/confirm-email", "/email-verified", "/check-email-verified"].some(
        (p) => req.path === p || req.path.startsWith(p + "?"),
      )
    )
      return true;
    return false;
  },
  message: {
    message: "Too many login attempts, please try again after 15 minutes",
  },
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is running" });
});

// Routes
app.use("/auth", authLimiter, authRoutes);
app.use("/manager", managerRoutes);
app.use("/admin", adminRoutes);
app.use("/driver", driverRoutes);
app.use("/driver", driverDeliveryRoutes); // Delivery-specific driver routes
app.use("/driver/deposits", driverDepositsRoutes); // Driver deposits routes
app.use("/manager/driver-payments", driverPaymentsRoutes); // Manager pays drivers
app.use("/driver/withdrawals", driverPaymentsRoutes); // Driver views their withdrawals
app.use("/manager/admin-payments", adminPaymentsRoutes); // Manager pays restaurant admins
app.use("/admin/withdrawals", adminPaymentsRoutes); // Admin views their withdrawals
app.use("/onboarding", onboardingRoutes);
app.use("/restaurant-onboarding", restaurantOnboardingRoutes);
app.use("/public", publicRoutes);
app.use("/cart", cartRoutes);
app.use("/orders", ordersRoutes);
app.use("/customer", customerRoutes);
app.use("/manager/reports", reportsRoutes);
app.use("/push", pushNotificationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

// Server
const PORT = process.env.PORT || 5000;

// Create HTTP server and initialize Socket.io
const httpServer = createServer(app);
const io = initializeSocket(httpServer);

// Make io available to routes
app.set("io", io);

const server = httpServer.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`🔌 WebSocket server ready for real-time notifications`);

  // ============================================================================
  // DAILY DEPOSIT SNAPSHOT SCHEDULER
  // Runs at midnight Sri Lanka time (UTC+5:30) = 18:30 UTC
  // ============================================================================
  cron.schedule(
    "30 18 * * *",
    async () => {
      console.log(
        `\n[CRON] ⏰ Running daily deposit snapshot (midnight Sri Lanka time)`,
      );
      try {
        await createDailySnapshot();
      } catch (err) {
        console.error(`[CRON] ❌ Snapshot failed:`, err.message);
      }
    },
    {
      timezone: "UTC",
      runMissedSchedules: false,
    },
  );
  console.log(
    `⏰ Daily snapshot scheduler active (runs at midnight Sri Lanka time / 18:30 UTC)`,
  );

  // ============================================================================
  // MANAGER NOTIFICATION CHECKER
  // Runs every 60 seconds to detect unassigned deliveries & milestones
  // ============================================================================
  setInterval(async () => {
    try {
      await runManagerChecks();
    } catch (err) {
      console.error("[ManagerChecker] ❌ Check cycle error:", err.message);
    }
  }, 60 * 1000); // every 60 seconds

  // Run once on startup after a short delay
  setTimeout(() => {
    runManagerChecks().catch((err) =>
      console.error("[ManagerChecker] ❌ Initial check error:", err.message),
    );
  }, 5000);
  console.log(`📋 Manager notification checker active (runs every 60s)`);

  // ============================================================================
  // RESTAURANT AUTO OPEN/CLOSE SCHEDULER
  // Checks every minute to auto-open/close restaurants based on operating hours
  // ============================================================================
  setInterval(async () => {
    try {
      await runRestaurantScheduler();
    } catch (err) {
      console.error("[RestaurantScheduler] ❌ Check cycle error:", err.message);
    }
  }, 60 * 1000); // every 60 seconds

  // Run once on startup after a short delay
  setTimeout(() => {
    runRestaurantScheduler().catch((err) =>
      console.error(
        "[RestaurantScheduler] ❌ Initial check error:",
        err.message,
      ),
    );
  }, 8000);
  console.log(
    `🕐 Restaurant auto open/close scheduler active (runs every 60s)`,
  );

  // ============================================================================
  // FOOD AVAILABILITY SCHEDULER
  // Checks every 60 seconds to auto-toggle food is_available based on time slots
  // breakfast(5am-11:59am), lunch(12:01pm-6pm), dinner(6pm-5am)
  // ============================================================================
  setInterval(async () => {
    try {
      await runFoodAvailabilityScheduler();
    } catch (err) {
      console.error("[FoodScheduler] ❌ Check cycle error:", err.message);
    }
  }, 60 * 1000); // every 60 seconds

  // Run once on startup after a short delay
  setTimeout(() => {
    runFoodAvailabilityScheduler().catch((err) =>
      console.error("[FoodScheduler] ❌ Initial check error:", err.message),
    );
  }, 10000);
  console.log(`🍽️ Food availability scheduler active (runs every 60s)`);

  // ============================================================================
  // NOTIFICATION LOG CLEANUP — Auto-delete records older than 24 hours
  // Runs every hour at minute 0
  // ============================================================================
  cron.schedule(
    "0 * * * *",
    async () => {
      console.log(`\n[CRON] 🧹 Running notification cleanup`);
      try {
        // 1) Delete notification_log records older than 24 hours
        const logCutoff = new Date(
          Date.now() - 24 * 60 * 60 * 1000,
        ).toISOString();

        const { data: logDeleted, error: logError } = await supabaseAdmin
          .from("notification_log")
          .delete()
          .lt("sent_at", logCutoff)
          .select("id", { count: "exact" });

        if (logError) {
          console.error(
            `[CRON] ❌ notification_log cleanup error:`,
            logError.message,
          );
        } else {
          const logCount = logDeleted?.length || 0;
          console.log(
            `[CRON] ✅ notification_log cleanup: ${logCount} old record(s) deleted (cutoff: ${logCutoff})`,
          );
        }

        // 2) Delete scheduled_notifications older than 72 hours (3 days) from sent_at
        const schedCutoff = new Date(
          Date.now() - 72 * 60 * 60 * 1000,
        ).toISOString();

        const { data: schedDeleted, error: schedError } = await supabaseAdmin
          .from("scheduled_notifications")
          .delete()
          .eq("status", "sent")
          .lt("sent_at", schedCutoff)
          .select("id", { count: "exact" });

        if (schedError) {
          console.error(
            `[CRON] ❌ scheduled_notifications cleanup error:`,
            schedError.message,
          );
        } else {
          const schedCount = schedDeleted?.length || 0;
          console.log(
            `[CRON] ✅ scheduled_notifications cleanup: ${schedCount} old record(s) deleted (cutoff: ${schedCutoff})`,
          );
        }
      } catch (err) {
        console.error(`[CRON] ❌ Notification cleanup failed:`, err.message);
      }
    },
    {
      timezone: "UTC",
      runMissedSchedules: false,
    },
  );
  console.log(
    `🧹 Notification cleanup active (runs hourly — notification_log: 24h, scheduled_notifications: 72h)`,
  );

  // On startup, check if we missed a snapshot and create one if needed
  checkAndCreateMissedSnapshot();
});

// ============================================================================
// SNAPSHOT CREATION LOGIC
// ============================================================================
async function createDailySnapshot() {
  const now = new Date();
  const sriLankaOffset = 5.5 * 60 * 60 * 1000;
  const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
  const todayStr = sriLankaDate.toISOString().split("T")[0];

  console.log(`[SNAPSHOT] Creating snapshot for date: ${todayStr}`);

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
    console.log(
      `[SNAPSHOT] Last snapshot: ${lastSnapshot.snapshot_date}, ending_pending: ${prevPending}`,
    );
  } else {
    console.log(`[SNAPSHOT] No previous snapshot found, starting fresh`);
  }

  // Calculate sales AFTER the last snapshot
  let salesQuery = supabaseAdmin
    .from("deliveries")
    .select(`id, order_id, orders!inner(total_amount, payment_method)`)
    .eq("status", "delivered")
    .eq("orders.payment_method", "cash");

  if (snapshotBoundary) {
    salesQuery = salesQuery.gt("updated_at", snapshotBoundary);
  }

  const { data: cashDeliveries } = await salesQuery;
  const totalSales = (cashDeliveries || []).reduce(
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

  const { data: approvedDeposits } = await approvedQuery;
  const totalApproved = (approvedDeposits || []).reduce(
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
    console.error(`[SNAPSHOT] ❌ Error:`, error.message);
    throw error;
  }

  console.log(`[SNAPSHOT] ✅ Snapshot created for ${todayStr}:`, {
    prev_pending: prevPending,
    total_sales: totalSales,
    total_approved: totalApproved,
    ending_pending: endingPending,
  });

  return snapshot;
}

async function checkAndCreateMissedSnapshot() {
  try {
    console.log(`\n[SNAPSHOT] 🔍 Checking for missed snapshots...`);

    const now = new Date();
    const sriLankaOffset = 5.5 * 60 * 60 * 1000;
    const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
    const todayStr = sriLankaDate.toISOString().split("T")[0];

    // Calculate yesterday's date in Sri Lanka timezone
    const yesterday = new Date(sriLankaDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // --- Step 1: Check and create yesterday's snapshot if missing ---
    const { data: yesterdaySnapshot } = await supabaseAdmin
      .from("daily_deposit_snapshots")
      .select("snapshot_date")
      .eq("snapshot_date", yesterdayStr)
      .single();

    if (!yesterdaySnapshot) {
      console.log(
        `[SNAPSHOT] ⚠️ Missing snapshot for yesterday (${yesterdayStr}). Creating now...`,
      );

      // We need to create yesterday's snapshot
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

      // Calculate yesterday's midnight in Sri Lanka time as the cutoff
      // Yesterday ended at today 00:00 Sri Lanka time = yesterday 18:30 UTC
      const todayMidnightSL = new Date(todayStr + "T00:00:00+05:30");

      // Sales AFTER last snapshot AND BEFORE today midnight Sri Lanka
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
      const totalSales = (cashDeliveries || []).reduce(
        (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
        0,
      );

      // Approved deposits AFTER last snapshot AND BEFORE today midnight
      let approvedQuery = supabaseAdmin
        .from("driver_deposits")
        .select("approved_amount")
        .eq("status", "approved")
        .lt("reviewed_at", todayMidnightSL.toISOString());

      if (snapshotBoundary) {
        approvedQuery = approvedQuery.gt("reviewed_at", snapshotBoundary);
      }

      const { data: approvedDeposits } = await approvedQuery;
      const totalApproved = (approvedDeposits || []).reduce(
        (sum, d) => sum + parseFloat(d.approved_amount || 0),
        0,
      );

      const totalSalesDay = totalSales + prevPending;
      const endingPending = Math.max(0, totalSalesDay - totalApproved);

      const { count: pendingCount } = await supabaseAdmin
        .from("driver_deposits")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      // Create yesterday's snapshot
      const { data: snapshot, error } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .upsert(
          {
            snapshot_date: yesterdayStr,
            ending_pending: endingPending,
            total_sales: totalSales,
            total_approved: totalApproved,
            pending_deposits_count: pendingCount || 0,
            created_at: todayMidnightSL.toISOString(),
          },
          { onConflict: "snapshot_date" },
        )
        .select()
        .single();

      if (error) {
        console.error(
          `[SNAPSHOT] ❌ Failed to create missed snapshot:`,
          error.message,
        );
      } else {
        console.log(
          `[SNAPSHOT] ✅ Missed snapshot created for ${yesterdayStr}:`,
          {
            prev_pending: prevPending,
            total_sales: totalSales,
            total_approved: totalApproved,
            ending_pending: endingPending,
          },
        );
      }
    } else {
      console.log(
        `[SNAPSHOT] ✅ Yesterday's snapshot (${yesterdayStr}) exists. All good.`,
      );
    }

    // --- Step 2: Check and create today's snapshot if missing ---
    // This is critical! If the midnight cron didn't run (e.g., backend was down),
    // today's snapshot won't exist and the deposits page will show yesterday's data
    // as "today" because the boundary is wrong.
    const { data: todaySnapshot } = await supabaseAdmin
      .from("daily_deposit_snapshots")
      .select("snapshot_date")
      .eq("snapshot_date", todayStr)
      .single();

    if (!todaySnapshot) {
      console.log(
        `[SNAPSHOT] ⚠️ Missing snapshot for today (${todayStr}). Creating now...`,
      );

      // Get the most recent snapshot as boundary (should be yesterday's after step 1)
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

      // Today's midnight in Sri Lanka time = the boundary between yesterday and today
      const todayMidnightSL = new Date(todayStr + "T00:00:00+05:30");

      // Cash sales AFTER last snapshot AND BEFORE today midnight
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
      const totalSales = (cashDeliveries || []).reduce(
        (sum, d) => sum + parseFloat(d.orders?.total_amount || 0),
        0,
      );

      // Approved deposits AFTER last snapshot AND BEFORE today midnight
      let approvedQuery = supabaseAdmin
        .from("driver_deposits")
        .select("approved_amount")
        .eq("status", "approved")
        .lt("reviewed_at", todayMidnightSL.toISOString());

      if (snapshotBoundary) {
        approvedQuery = approvedQuery.gt("reviewed_at", snapshotBoundary);
      }

      const { data: approvedDeposits } = await approvedQuery;
      const totalApproved = (approvedDeposits || []).reduce(
        (sum, d) => sum + parseFloat(d.approved_amount || 0),
        0,
      );

      const totalSalesDay = totalSales + prevPending;
      const endingPending = Math.max(0, totalSalesDay - totalApproved);

      const { count: pendingCount } = await supabaseAdmin
        .from("driver_deposits")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      // Create today's snapshot (with created_at = today midnight so boundary is correct)
      const { data: snapshot, error } = await supabaseAdmin
        .from("daily_deposit_snapshots")
        .upsert(
          {
            snapshot_date: todayStr,
            ending_pending: endingPending,
            total_sales: totalSales,
            total_approved: totalApproved,
            pending_deposits_count: pendingCount || 0,
            created_at: todayMidnightSL.toISOString(),
          },
          { onConflict: "snapshot_date" },
        )
        .select()
        .single();

      if (error) {
        console.error(
          `[SNAPSHOT] ❌ Failed to create today's snapshot:`,
          error.message,
        );
      } else {
        console.log(
          `[SNAPSHOT] ✅ Today's missed snapshot created for ${todayStr}:`,
          {
            prev_pending: prevPending,
            total_sales: totalSales,
            total_approved: totalApproved,
            ending_pending: endingPending,
          },
        );
      }
    } else {
      console.log(
        `[SNAPSHOT] ✅ Today's snapshot (${todayStr}) exists. All good.`,
      );
    }
  } catch (err) {
    console.error(`[SNAPSHOT] ❌ Startup check error:`, err.message);
  }
}

// Handle server errors
server.on("error", (error) => {
  console.error("Server error:", error);
  process.exit(1);
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});
