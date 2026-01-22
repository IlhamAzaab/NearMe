import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

/**
 * Middleware to authenticate JWT tokens
 * Validates Bearer token and attaches user payload to req.user
 */
export function authenticate(req, res, next) {
  const auth = req.headers.authorization || "";
  
  console.log("🔐 Auth middleware - Authorization header:", auth ? `Bearer ${auth.substring(7, 20)}...` : "MISSING");
  
  if (!auth.startsWith("Bearer ")) {
    console.log("❌ Auth failed: No Bearer token");
    return res.status(401).json({ message: "Unauthorized - No token provided" });
  }
  
  const token = auth.split(" ")[1];
  
  if (!token || token === "null" || token === "undefined") {
    console.log("❌ Auth failed: Token is null/undefined");
    return res.status(401).json({ message: "Unauthorized - Invalid token format" });
  }
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Auth success - User:", { id: payload.id, role: payload.role });
    req.user = payload; // { id, role }
    next();
  } catch (err) {
    console.log("❌ Auth failed: JWT verification error -", err.message);
    return res.status(401).json({ message: "Invalid token - " + err.message });
  }
}
