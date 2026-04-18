import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import smsHookRoutes from "./routes/smsHookRoutes.js";

dotenv.config({ path: "../.env" });

const app = express();

const allowedOrigins = new Set(
  (
    process.env.CORS_ALLOWED_ORIGINS ||
    "http://localhost:5173,http://localhost:3000,https://meezo-eta.vercel.app,https://www.meezo.lk,https://meezo.lk"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-device-id"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, status: "ok" });
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Meezo backend is running",
  });
});
// Mount route: POST /auth/send-sms-hook
app.use("/auth", smsHookRoutes);

app.use((err, _req, res, _next) => {
  console.error("[SERVER] Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
  console.log(`[SERVER] Listening on port ${port}`);
});
console.log("Backend started - ECS CI/CD test");
