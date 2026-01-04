import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Import routes
import authRoutes from "./routes/auth.js";
import managerRoutes from "./routes/manager.js";
import adminRoutes from "./routes/admin.js";
import driverRoutes from "./routes/driver.js";
import onboardingRoutes from "./routes/onboarding.js";
import restaurantOnboardingRoutes from "./routes/restaurantOnboarding.js";
import publicRoutes from "./routes/public.js";

dotenv.config();

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
app.use("/onboarding", onboardingRoutes);
app.use("/restaurant-onboarding", restaurantOnboardingRoutes);
app.use("/public", publicRoutes);

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
