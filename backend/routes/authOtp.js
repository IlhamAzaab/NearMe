import express from "express";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  completeCustomerProfile,
  getCurrentUser,
} from "../services/authService.js";
import { validateCompleteProfile } from "../validators/authValidation.js";

const router = express.Router();

function ok(res, { message, data, code, status = 200 }) {
  return res.status(status).json({
    success: true,
    message,
    code: code || null,
    data,
  });
}

function fail(res, error) {
  const statusCode = Number(error?.statusCode || error?.status || 500);
  const details = error?.details || null;
  const message = error?.message || "Request failed";
  return res.status(statusCode).json({
    success: false,
    message,
    code: error?.code || "REQUEST_FAILED",
    details,
  });
}

function getTokenFromHeader(req) {
  const auth = String(req.headers.authorization || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return auth.slice(7).trim();
}

function issueAppSessionToken(user) {
  if (!process.env.JWT_SECRET) {
    return null;
  }

  return jwt.sign(
    {
      id: user.id,
      role: user.role || "customer",
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
}

async function requireAuthUserId(req) {
  const token = getTokenFromHeader(req);
  if (!token) {
    const error = new Error("Authorization token is required");
    error.statusCode = 401;
    error.code = "TOKEN_REQUIRED";
    throw error;
  }

  if (!process.env.JWT_SECRET) {
    const error = new Error("JWT secret is not configured");
    error.statusCode = 500;
    error.code = "JWT_SECRET_MISSING";
    throw error;
  }

  // Accept app JWT if present
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.id) {
      const error = new Error("Invalid token payload");
      error.statusCode = 401;
      error.code = "INVALID_TOKEN";
      throw error;
    }
    return decoded.id;
  } catch (error) {
    if (error?.code === "INVALID_TOKEN") {
      throw error;
    }
  }

  // Fallback: accept Supabase access token
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) {
    const authError = new Error("Invalid or expired token");
    authError.statusCode = 401;
    authError.code = "INVALID_TOKEN";
    throw authError;
  }

  return data.user.id;
}

router.post("/complete-profile", async (req, res) => {
  try {
    const userId = await requireAuthUserId(req);
    const payload = validateCompleteProfile(req.body || {});
    const updatedUser = await completeCustomerProfile({
      userId,
      name: payload.name,
      email: payload.email,
      password: payload.password,
      city: payload.city,
      address: payload.address,
      latitude: payload.latitude,
      longitude: payload.longitude,
    });

    const sessionToken = issueAppSessionToken({
      id: userId,
      role: updatedUser.role,
    });

    return ok(res, {
      message: "Profile completed successfully",
      code: "PROFILE_COMPLETED",
      data: {
        ...updatedUser,
        token: sessionToken,
      },
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/session/exchange", async (req, res) => {
  try {
    const userId = await requireAuthUserId(req);
    const user = await getCurrentUser(userId);
    const token = issueAppSessionToken({ id: userId, role: user.role });

    return ok(res, {
      message: "Session exchanged successfully",
      code: "SESSION_EXCHANGED",
      data: {
        token,
        user,
      },
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.get("/me", async (req, res) => {
  try {
    const userId = await requireAuthUserId(req);
    const user = await getCurrentUser(userId);

    return ok(res, {
      message: "User fetched successfully",
      code: "ME_FETCHED",
      data: user,
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/logout", async (_req, res) => {
  return ok(res, {
    message: "Logged out successfully",
    code: "LOGOUT_SUCCESS",
    data: { loggedOut: true },
  });
});

export default router;
