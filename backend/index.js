import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { supabaseAdmin } from "./supabaseAdmin.js";

// Load .env file only if NODE_ENV is not production and .env exists
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

// Verify Supabase configuration on startup
console.log("\n🔍 Checking Supabase configuration...");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing");
console.log(
  "SUPABASE_SERVICE_ROLE_KEY:",
  process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓ Set (hidden)" : "✗ Missing"
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
const server = app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

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
