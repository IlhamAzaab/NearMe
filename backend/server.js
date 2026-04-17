import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import smsHookRoutes from "./routes/smsHookRoutes.js";

dotenv.config({ path: "../.env" });

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, status: "ok" });
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Meezo backend is running"
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