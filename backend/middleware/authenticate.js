import jwt from "jsonwebtoken";
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

/**
 * Middleware to authenticate JWT tokens
 * Validates Bearer token and attaches user payload to req.user
 */
export function authenticate(req, res, next) {
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
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
