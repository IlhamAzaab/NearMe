import dotenv from "dotenv";
import {
  getValidatedAuthConfig,
  verifyJwtWithRotation,
} from "../utils/authConfig.js";
import { extractTokenFromCookies } from "../utils/authCookies.js";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

getValidatedAuthConfig();

/**
 * Middleware to authenticate JWT tokens
 * Validates Bearer token and attaches user payload to req.user
 */
export async function authenticate(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const bearerToken = auth.startsWith("Bearer ") ? auth.split(" ")[1] : null;
  const cookieToken = extractTokenFromCookies(req);
  const token = String(bearerToken || cookieToken || "").trim();

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized - No token provided",
      code: "auth_token_missing",
    });
  }

  if (!token || token === "null" || token === "undefined") {
    return res.status(401).json({
      message: "Unauthorized - Invalid token format",
      code: "auth_token_invalid",
    });
  }

  try {
    const payload = verifyJwtWithRotation(token);
    req.user = payload; // { id, role }
    next();
  } catch (err) {
    const isExpired = err?.name === "TokenExpiredError";
    return res.status(401).json({
      message: isExpired ? "Token expired" : "Invalid or expired token",
      code: isExpired ? "auth_token_expired" : "auth_token_invalid",
    });
  }
}
