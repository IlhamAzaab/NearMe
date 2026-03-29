import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const rootEnvPath = path.resolve(backendDir, "..", ".env");

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

function redacted(value) {
  const v = String(value || "").trim();
  if (!v) return "<empty>";
  if (v.length <= 12) return `${v.slice(0, 2)}...${v.slice(-2)}`;
  return `${v.slice(0, 6)}...${v.slice(-6)}`;
}

function readCurrentJwtSecret() {
  return String(process.env.JWT_SECRET || "").trim();
}

function generateSecretHex(byteLength = 64) {
  return crypto.randomBytes(byteLength).toString("hex");
}

const currentSecret = readCurrentJwtSecret();
const nextSecret = generateSecretHex(64);

console.log("\n=== JWT Rotation Helper ===");
console.log("Project:", path.resolve(backendDir, ".."));
console.log("Current JWT secret present:", Boolean(currentSecret));
console.log("Current JWT secret length:", currentSecret.length || 0);
console.log("Current JWT secret preview:", redacted(currentSecret));
console.log("\nNew JWT secret generated (copy this to production JWT_SECRET):");
console.log(nextSecret);

console.log("\n--- Deploy Step 1 (start rotation) ---");
console.log("Set these in production backend environment:");
console.log("JWT_SECRET=", nextSecret);
console.log("JWT_SECRET_PREVIOUS=", currentSecret || "<put current production JWT_SECRET here>");
console.log("WEB_ACCESS_TOKEN_EXPIRES_IN=", process.env.WEB_ACCESS_TOKEN_EXPIRES_IN || "14d");
console.log(
  "MOBILE_ACCESS_TOKEN_EXPIRES_IN=",
  process.env.MOBILE_ACCESS_TOKEN_EXPIRES_IN || process.env.ACCESS_TOKEN_EXPIRES_IN || "180d",
);
console.log("Then redeploy backend.");

console.log("\n--- Deploy Step 2 (finish rotation) ---");
console.log("After 1-2 weeks, remove JWT_SECRET_PREVIOUS from production and redeploy again.");

console.log("\n--- Verification ---");
console.log("On startup logs you should see:");
console.log("- JWT_SECRET: ✓ Set (... chars)");
console.log("- JWT_SECRET_PREVIOUS: ✓ Set (rotation mode active...) during transition");
console.log("- JWT_SECRET_PREVIOUS: ✗ Not set after cleanup redeploy\n");
