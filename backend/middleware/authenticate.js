import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { supabaseAdmin } from "../supabaseAdmin.js";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

/**
 * Middleware to authenticate JWT tokens
 * Validates Bearer token and attaches user payload to req.user
 */
export async function authenticate(req, res, next) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Unauthorized - No token provided" });
  }

  const token = auth.split(" ")[1];

  if (!token || token === "null" || token === "undefined") {
    return res
      .status(401)
      .json({ message: "Unauthorized - Invalid token format" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role }
    next();
  } catch (err) {
    // Fallback: accept Supabase access token for auth.users-based flows
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = {
      id: data.user.id,
      role: data.user.user_metadata?.role || null,
    };
    next();
  }
}
