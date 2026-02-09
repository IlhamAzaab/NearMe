import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import cron from "node-cron";
import { supabaseAdmin } from "./supabaseAdmin.js";
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
import authRoutes from "./routes/auth.js";
import managerRoutes from "./routes/manager.js";
import adminRoutes from "./routes/admin.js";
import driverRoutes from "./routes/driver.js";
import driverDeliveryRoutes from "./routes/driverDelivery.js";
import driverDepositsRoutes from "./routes/driverDeposits.js";
import driverPaymentsRoutes from "./routes/driverPayments.js";
import adminPaymentsRoutes from "./routes/adminPayments.js";
import onboardingRoutes from "./routes/onboarding.js";
import restaurantOnboardingRoutes from "./routes/restaurantOnboarding.js";
import publicRoutes from "./routes/public.js";
import cartRoutes from "./routes/cart.js";
import ordersRoutes from "./routes/orders.js";
import customerRoutes from "./routes/customer.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is running" });
});

// Routes
app.use("/auth", authRoutes);
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res
    .status(500)
    .json({ message: "Internal server error", error: err.message });
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
    },
  );
  console.log(
    `⏰ Daily snapshot scheduler active (runs at midnight Sri Lanka time / 18:30 UTC)`,
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

    // Check if yesterday's snapshot exists
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
