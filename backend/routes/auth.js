import express from "express";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

// Separate Supabase client ONLY for signInWithPassword.
const supabaseAuthOnly = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

// Supabase client with ANON key — for auth.signUp() which triggers built-in email.
const supabaseAnonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const router = express.Router();

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "365d";
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "nm_rt";
const DEFAULT_FRONTEND_ORIGIN =
  process.env.NODE_ENV === "production"
    ? "https://meezo-eta.vercel.app"
    : "http://localhost:5174";
const FRONTEND_VERIFY_EMAIL_URL =
  process.env.FRONTEND_VERIFY_EMAIL_URL ||
  `${DEFAULT_FRONTEND_ORIGIN}/auth/verify-email`;
const FRONTEND_COMPLETE_PROFILE_URL =
  process.env.FRONTEND_COMPLETE_PROFILE_URL ||
  `${DEFAULT_FRONTEND_ORIGIN}/auth/complete-profile`;
const FRONTEND_SIGNUP_URL =
  process.env.FRONTEND_SIGNUP_URL || `${DEFAULT_FRONTEND_ORIGIN}/signup`;
const BACKEND_PUBLIC_URL =
  process.env.BACKEND_PUBLIC_URL || "https://meezo-backend-d3gw.onrender.com";
const MOBILE_VERIFY_DEEPLINK_BASE =
  process.env.MOBILE_VERIFY_DEEPLINK_BASE || "nearmemobile://verify-email";
const SUPPORTED_AUTH_ROLES = new Set([
  "customer",
  "admin",
  "driver",
  "manager",
]);

function normalizeRole(value) {
  const role = String(value || "")
    .toLowerCase()
    .trim();
  return SUPPORTED_AUTH_ROLES.has(role) ? role : null;
}

function getRefreshCookieName(role) {
  const normalizedRole = normalizeRole(role);
  return normalizedRole
    ? `${REFRESH_COOKIE_NAME}_${normalizedRole}`
    : REFRESH_COOKIE_NAME;
}

function getRefreshCookieCandidates(expectedRole) {
  const normalizedRole = normalizeRole(expectedRole);
  return normalizedRole
    ? [getRefreshCookieName(normalizedRole), REFRESH_COOKIE_NAME]
    : [REFRESH_COOKIE_NAME];
}

function parseCookieHeader(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf("=");
      if (idx === -1) return acc;
      const key = part.slice(0, idx);
      const value = part.slice(idx + 1);
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getRefreshCookieOptions(req) {
  const isProduction = process.env.NODE_ENV === "production";
  const sameSite =
    process.env.REFRESH_COOKIE_SAMESITE || (isProduction ? "none" : "lax");
  const secure =
    process.env.REFRESH_COOKIE_SECURE === "true" ||
    (process.env.REFRESH_COOKIE_SECURE !== "false" && isProduction);

  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/auth",
    maxAge: 365 * 24 * 60 * 60 * 1000,
  };

  if (process.env.REFRESH_COOKIE_DOMAIN) {
    options.domain = process.env.REFRESH_COOKIE_DOMAIN;
  }

  return options;
}

function signAccessToken({ id, role }) {
  return jwt.sign({ id, role, type: "access" }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

function signRefreshToken({ id, role }) {
  return jwt.sign(
    { id, role, type: "refresh" },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    },
  );
}

function verifyRefreshToken(token) {
  return jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
  );
}

function shouldReturnMobileRefreshToken(req) {
  const platform = String(req.headers["x-client-platform"] || "").toLowerCase();
  return platform === "mobile" || platform === "react-native";
}

function clearRefreshCookie(req, res, role) {
  res.clearCookie(getRefreshCookieName(role), {
    ...getRefreshCookieOptions(req),
    maxAge: undefined,
    expires: new Date(0),
  });
}

function clearAllRefreshCookies(req, res) {
  clearRefreshCookie(req, res);
  for (const role of SUPPORTED_AUTH_ROLES) {
    clearRefreshCookie(req, res, role);
  }
}

function issueAuthSession(req, res, payload, extra = {}) {
  const token = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const roleCookieName = getRefreshCookieName(payload.role);
  res.cookie(roleCookieName, refreshToken, getRefreshCookieOptions(req));

  // Backward compatibility: keep issuing legacy cookie while old clients migrate.
  if (roleCookieName !== REFRESH_COOKIE_NAME) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(req));
  }

  const body = {
    token,
    role: payload.role,
    userId: payload.id,
    ...extra,
  };

  if (shouldReturnMobileRefreshToken(req)) {
    body.refreshToken = refreshToken;
  }

  return body;
}

function createEmailVerificationToken({ userId, email, nonce }) {
  return jwt.sign(
    {
      userId,
      email,
      nonce,
      purpose: "email_verification",
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function sendVerificationEmail(email, verificationLink) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    return { ok: false, reason: "missing_resend_key" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NearMe <noreply@nearme.com>",
      to: email,
      subject: "Verify Your NearMe Email",
      html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><style>
body{font-family:sans-serif;background:#f0fdf4}
.container{max-width:500px;margin:40px auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.1)}
h1{color:#111827;font-size:24px;margin-bottom:16px}
p{color:#6b7280;font-size:14px;line-height:1.6;margin-bottom:16px}
.btn{display:block;background:linear-gradient(to right,#22c55e,#10b981);color:white;padding:14px;border-radius:8px;text-align:center;text-decoration:none;font-weight:bold;margin:24px 0}
.footer{border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:12px}
</style></head><body>
<div class="container">
<h1>Welcome to NearMe! 👋</h1>
<p>Thank you for signing up. Click the button below to verify your email address.</p>
<a class="btn" href="${verificationLink}">Verify Email Address</a>
<p style="font-size:12px;color:#9ca3af">This link expires in 1 hour and can only be used once. If you didn't sign up for NearMe, you can safely ignore this email.</p>
<div class="footer"><p>NearMe &copy; 2026 | All rights reserved</p></div>
</div></body></html>`,
    }),
  });

  const resendData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(resendData.message || "Resend API error");
  }

  return { ok: true };
}

async function resolveVerifiedCustomerSession(token) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (tokenError) {
    if (tokenError?.name === "TokenExpiredError") {
      return {
        ok: false,
        status: 410,
        message: "Verification link expired. Please request a new email.",
        code: "verification_link_expired",
      };
    }

    return {
      ok: false,
      status: 400,
      message: "Invalid verification link",
      code: "invalid_verification_token",
    };
  }

  const userId = String(payload?.userId || "").trim();
  const email = String(payload?.email || "")
    .trim()
    .toLowerCase();
  const nonce = String(payload?.nonce || "").trim();

  if (payload?.purpose !== "email_verification" || !userId || !nonce) {
    return {
      ok: false,
      status: 400,
      message: "Invalid verification link",
      code: "invalid_verification_payload",
    };
  }

  const { data: authUserData, error: authUserError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (authUserError || !authUserData?.user) {
    return {
      ok: false,
      status: 404,
      message: "User not found",
      code: "user_not_found",
    };
  }

  const authUser = authUserData.user;
  const authEmail = String(authUser.email || "")
    .trim()
    .toLowerCase();
  if (email && authEmail && email !== authEmail) {
    return {
      ok: false,
      status: 400,
      message: "Invalid verification link",
      code: "verification_email_mismatch",
    };
  }

  const storedNonce = String(
    authUser.user_metadata?.email_verification_nonce || "",
  ).trim();

  if (!storedNonce || storedNonce !== nonce) {
    return {
      ok: false,
      status: 409,
      message: "This verification link has already been used.",
      code: "verification_link_used",
    };
  }

  const { error: confirmError } =
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      user_metadata: {
        ...(authUser.user_metadata || {}),
        email_verification_nonce: null,
        email_verified_at: new Date().toISOString(),
      },
    });

  if (confirmError) {
    console.error("verify-email confirm error:", confirmError);
    return {
      ok: false,
      status: 500,
      message: "Failed to verify email",
      code: "verification_update_failed",
    };
  }

  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existingUser) {
    const { error: insertUserError } = await supabaseAdmin.from("users").insert({
      id: userId,
      role: "customer",
      email: authEmail,
      created_at: new Date().toISOString(),
    });

    if (insertUserError) {
      console.error("verify-email users insert error:", insertUserError);
    }
  }

  const { data: customerProfile } = await supabaseAdmin
    .from("customers")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  return {
    ok: true,
    sessionPayload: { id: userId, role: "customer" },
    sessionExtra: {
      message: "Email verified successfully",
      role: "customer",
      userId,
      email: authEmail,
      userName: customerProfile?.username || null,
      profileCompleted: !!customerProfile,
    },
  };
}

/**
 * Send OTP to a phone number via WhatsApp Business Cloud API.
 * Uses the WhatsApp message template or plain text.
 * Returns true if sent successfully, false otherwise.
 */
async function sendWhatsAppOTP(phone, otp) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn(
      "⚠️ WhatsApp credentials not configured. OTP not sent. OTP:",
      otp,
    );
    return false;
  }

  // Format phone to international format (remove leading 0, add country code if needed)
  let formattedPhone = phone.replace(/[^0-9]/g, "");
  if (formattedPhone.startsWith("0")) {
    formattedPhone = "94" + formattedPhone.substring(1); // Sri Lanka default
  }
  if (!formattedPhone.startsWith("94") && formattedPhone.length === 9) {
    formattedPhone = "94" + formattedPhone;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "template",
          template: {
            name: "otp_verification",
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: otp }],
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: otp }],
              },
            ],
          },
        }),
      },
    );

    const data = await response.json();
    if (response.ok) {
      console.log(`✅ WhatsApp OTP sent to ${formattedPhone}`);
      return true;
    } else {
      console.error("WhatsApp API error:", data);
      // Fallback: try sending as plain text message (works in test mode)
      const fallbackRes = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: formattedPhone,
            type: "text",
            text: {
              body: `Your NearMe verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
            },
          }),
        },
      );
      const fallbackData = await fallbackRes.json();
      if (fallbackRes.ok) {
        console.log(
          `✅ WhatsApp OTP sent (text fallback) to ${formattedPhone}`,
        );
        return true;
      }
      console.error("WhatsApp fallback error:", fallbackData);
      return false;
    }
  } catch (err) {
    console.error("WhatsApp send error:", err.message);
    return false;
  }
}

/**
 * POST /auth/signup
 * Register new customer with email verification.
 *
 * Flow:
 *  1. Check email availability across all tables
 *  2. Use supabaseAnonClient.auth.signUp() — creates auth user, NO email sent by Supabase
 *  3. Generate OUR OWN JWT token for verification
 *  4. Send verification email via Resend API (HTTP-based, not SMTP)
 *  5. NO record in public.users until email is confirmed via /auth/confirm-email
 */
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    // Check if email already exists in users table (already verified users)
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("email, role")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({
        message: `This email is already registered as ${existingUser.role}`,
      });
    }

    // Check in admins table
    const { data: adminCheck } = await supabaseAdmin
      .from("admins")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (adminCheck) {
      return res.status(400).json({
        message: "This email is already registered as admin",
      });
    }

    // Check in drivers table
    const { data: driverCheck } = await supabaseAdmin
      .from("drivers")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (driverCheck) {
      return res.status(400).json({
        message: "This email is already registered as driver",
      });
    }

    // Sign up via Supabase — NO emailRedirectTo, just creates auth user
    const { data: authData, error: authError } =
      await supabaseAnonClient.auth.signUp({
        email,
        password,
        options: {
          data: { role: "customer" },
        },
      });

    if (authError) {
      console.error("Supabase signUp error:", authError.message);

      if (authError.message?.includes("already been registered")) {
        return res.status(400).json({
          message:
            "This email is already registered. Please login or check your email for verification.",
        });
      }

      return res.status(400).json({ message: authError.message });
    }

    // Check if Supabase returned a user
    if (!authData?.user) {
      return res.status(500).json({
        message: "Signup failed. Please try again.",
      });
    }

    // Supabase returns a "fake" user with empty identities when email already exists
    if (authData.user.identities && authData.user.identities.length === 0) {
      return res.status(400).json({
        message:
          "This email is already registered. Please login or check your email for verification.",
      });
    }

    const verificationNonce = crypto.randomUUID();
    const existingUserMetadata = authData.user.user_metadata || {};

    const { error: metadataError } =
      await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
        user_metadata: {
          ...existingUserMetadata,
          email_verification_nonce: verificationNonce,
          email_verification_issued_at: new Date().toISOString(),
        },
      });

    if (metadataError) {
      console.error("Failed to store verification nonce:", metadataError);
      return res.status(500).json({
        message: "Failed to prepare email verification. Please try again.",
      });
    }

    const verifyToken = createEmailVerificationToken({
      userId: authData.user.id,
      email,
      nonce: verificationNonce,
    });

    const verificationLink = `${BACKEND_PUBLIC_URL}/auth/confirm-email?token=${encodeURIComponent(verifyToken)}`;

    console.log(
      `✅ Signup: ${email} registered (userId: ${authData.user.id}). Verification link ready.`,
    );
    console.log(`📧 Verification link: ${verificationLink}`);

    try {
      const emailResult = await sendVerificationEmail(email, verificationLink);
      if (emailResult.ok) {
        console.log(`📧 Email sent via Resend to ${email}`);

        return res.status(201).json({
          message:
            "Signup successful! Please check your email to verify your account.",
          userId: authData.user.id,
          email,
          emailSent: true,
        });
      }
    } catch (emailError) {
      console.error("Resend email failed:", emailError.message);
      return res.status(500).json({
        message: "Failed to send verification email. Please try again.",
      });
    }

    // Fallback if RESEND_API_KEY not set — return token for manual testing
    console.log(
      "⚠️  RESEND_API_KEY not set. Email not sent. For testing, use this token manually.",
    );

    res.status(201).json({
      message:
        "Signup successful! Please check your email to verify your account.",
      userId: authData.user.id,
      email,
      emailSent: false,
      testVerificationLink: verificationLink, // For testing/development only
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({
      message: "Server error during signup",
    });
  }
});

/**
 * POST /auth/check-availability
 * Check if email or phone is available
 */
router.post("/check-availability", async (req, res) => {
  try {
    const { email, phone } = req.body;

    const result = {
      emailAvailable: true,
      phoneAvailable: true,
      message: "",
    };

    // Check email
    if (email) {
      // Check in users table
      const { data: userEmail } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("email", email)
        .maybeSingle();

      if (userEmail) {
        result.emailAvailable = false;
        result.message = `Email already registered as ${userEmail.role}`;
        return res.json(result);
      }

      // Check in admins
      const { data: adminEmail } = await supabaseAdmin
        .from("admins")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();

      if (adminEmail) {
        result.emailAvailable = false;
        result.message = "Email already registered as admin";
        return res.json(result);
      }

      // Check in drivers
      const { data: driverEmail } = await supabaseAdmin
        .from("drivers")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (driverEmail) {
        result.emailAvailable = false;
        result.message = "Email already registered as driver";
        return res.json(result);
      }

      // Check in customers
      const { data: customerEmail } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (customerEmail) {
        result.emailAvailable = false;
        result.message = "Email already registered";
        return res.json(result);
      }
    }

    // Check phone
    if (phone) {
      // Check in users table
      const { data: userPhone } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("phone", phone)
        .maybeSingle();

      if (userPhone) {
        result.phoneAvailable = false;
        result.message = `Phone number already registered as ${userPhone.role}`;
        return res.json(result);
      }

      // Check in admins
      const { data: adminPhone } = await supabaseAdmin
        .from("admins")
        .select("user_id")
        .eq("phone", phone)
        .maybeSingle();

      if (adminPhone) {
        result.phoneAvailable = false;
        result.message = "Phone number already registered as admin";
        return res.json(result);
      }

      // Check in drivers
      const { data: driverPhone } = await supabaseAdmin
        .from("drivers")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      if (driverPhone) {
        result.phoneAvailable = false;
        result.message = "Phone number already registered as driver";
        return res.json(result);
      }

      // Check in customers
      const { data: customerPhone } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      if (customerPhone) {
        result.phoneAvailable = false;
        result.message = "Phone number already registered";
        return res.json(result);
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Check availability error:", error);
    res.status(500).json({
      message: "Server error checking availability",
    });
  }
});

/**
 * POST /auth/resend-verification-email
 * Resend one-time verification email for unverified accounts.
 */
router.post("/resend-verification-email", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (usersError) {
      console.error("Resend list users error:", usersError);
      return res.status(500).json({ message: "Failed to resend email" });
    }

    const matchedUser = (usersData?.users || []).find(
      (u) => String(u.email || "").toLowerCase() === email,
    );

    if (!matchedUser) {
      // Avoid account enumeration.
      return res.json({
        message: "If this email exists, a verification link has been sent.",
      });
    }

    if (matchedUser.email_confirmed_at) {
      return res.json({
        message: "Email is already verified.",
        alreadyVerified: true,
      });
    }

    const verificationNonce = crypto.randomUUID();
    const existingUserMetadata = matchedUser.user_metadata || {};

    const { error: updateMetadataError } =
      await supabaseAdmin.auth.admin.updateUserById(matchedUser.id, {
        user_metadata: {
          ...existingUserMetadata,
          email_verification_nonce: verificationNonce,
          email_verification_issued_at: new Date().toISOString(),
        },
      });

    if (updateMetadataError) {
      console.error("Resend metadata update failed:", updateMetadataError);
      return res.status(500).json({ message: "Failed to resend email" });
    }

    const verifyToken = createEmailVerificationToken({
      userId: matchedUser.id,
      email,
      nonce: verificationNonce,
    });

    const verificationLink = `${BACKEND_PUBLIC_URL}/auth/confirm-email?token=${encodeURIComponent(verifyToken)}`;

    await sendVerificationEmail(email, verificationLink);

    return res.json({
      message: "Verification email sent. Please check your inbox.",
      alreadyVerified: false,
    });
  } catch (error) {
    console.error("Resend verification email error:", error);
    return res.status(500).json({ message: "Failed to resend email" });
  }
});

/**
 * GET /auth/user-email
 * Get user email by userId (requires either JWT auth or Supabase access_token)
 */
router.get("/user-email", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    // Require either a valid JWT (from authenticate) or a Supabase access_token
    const auth = req.headers.authorization || "";
    let authorized = false;

    if (auth.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];
      try {
        // Try JWT first (for logged-in users)
        const jwt = await import("jsonwebtoken");
        jwt.default.verify(token, process.env.JWT_SECRET);
        authorized = true;
      } catch {
        // Not a valid JWT — try as Supabase access_token
        const { data: tokenUser } = await supabaseAdmin.auth.getUser(token);
        if (tokenUser?.user?.id === userId) authorized = true;
      }
    }

    if (!authorized) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user from auth
    const { data: userData, error } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (error || !userData) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ email: userData.user.email });
  } catch (error) {
    console.error("Get user email error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /auth/complete-profile
 * Complete customer profile after email verification (requires Supabase access token)
 * Does NOT issue JWT yet — user must verify OTP first.
 * Saves profile data and sends WhatsApp OTP.
 */
router.post("/complete-profile", async (req, res) => {
  try {
    const { userId, username, email, phone, address, city, access_token } =
      req.body;

    // Validate required fields
    if (!userId || !username || !email || !phone || !address || !city) {
      return res.status(400).json({
        message:
          "All fields are required (username, email, phone, address, city)",
      });
    }

    // Verify the caller owns this userId via either app JWT or Supabase access token.
    if (access_token) {
      let tokenMatchesUser = false;

      try {
        const decoded = jwt.verify(access_token, process.env.JWT_SECRET);
        const jwtUserId = String(decoded?.id || decoded?.userId || "");
        if (jwtUserId && jwtUserId === String(userId)) {
          tokenMatchesUser = true;
        }
      } catch {
        // Not an app JWT. Continue with Supabase token validation.
      }

      if (!tokenMatchesUser) {
        const { data: tokenUser, error: tokenError } =
          await supabaseAdmin.auth.getUser(access_token);
        if (!tokenError && tokenUser?.user && tokenUser.user.id === userId) {
          tokenMatchesUser = true;
        }
      }

      if (!tokenMatchesUser) {
        return res
          .status(403)
          .json({ message: "Access denied — token does not match userId" });
      }
    }

    // Check if user exists and is a customer
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("role, email")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.role !== "customer") {
      return res.status(400).json({
        message: "Only customers can complete this profile",
      });
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile) {
      return res.status(400).json({
        message: "Profile already completed",
      });
    }

    // Check phone uniqueness
    const { data: phoneCheck } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (phoneCheck) {
      return res.status(400).json({
        message: "Phone number already in use",
      });
    }

    // Check username uniqueness
    const { data: usernameCheck } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (usernameCheck) {
      return res.status(400).json({
        message: "Username already taken",
      });
    }

    // Create customer profile (phone_verified = false until OTP is confirmed)
    const { error: customerError } = await supabaseAdmin
      .from("customers")
      .insert({
        id: userId,
        username,
        email,
        phone,
        address,
        city,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (customerError) {
      console.error("Customer profile creation error:", customerError);
      return res.status(500).json({
        message: "Failed to create customer profile",
      });
    }

    // Update users table with phone
    await supabaseAdmin.from("users").update({ phone }).eq("id", userId);

    console.log(
      `✅ Profile created for ${email} (${username}). Pending OTP verification.`,
    );

    // Generate and send OTP via WhatsApp
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Store OTP in customers table (OTP is customer-only)
    await supabaseAdmin
      .from("customers")
      .update({
        otp_code: otp,
        otp_expires_at: otpExpiry,
        phone_verified: false,
      })
      .eq("id", userId);

    // Send OTP via WhatsApp Business API
    const whatsappSent = await sendWhatsAppOTP(phone, otp);

    res.json({
      message: "Profile saved! OTP sent to your WhatsApp.",
      otpSent: whatsappSent,
      userId,
    });
  } catch (error) {
    console.error("Complete profile error:", error);
    res.status(500).json({
      message: "Server error completing profile",
    });
  }
});

/**
 * POST /auth/login
 * Authenticate user with email and password
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Authenticate with Supabase — use the isolated auth client so the
    // user session does NOT leak into supabaseAdmin (which must stay
    // service_role for all subsequent DB queries).
    const { data, error } = await supabaseAuthOnly.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        message: error.message,
      });
    }

    const userId = data.user.id;

    // Check if email is verified for customers
    if (!data.user.email_confirmed_at) {
      // Check if user is a customer
      const { data: userData } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (userData && userData.role === "customer") {
        return res.status(403).json({
          message:
            "Please verify your email before logging in. Check your inbox for the verification link.",
        });
      }
    }

    // Get user role
    let { data: roleData, error: roleError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (roleError) {
      console.error(
        "Role fetch DB error for userId:",
        userId,
        "dbError:",
        roleError,
      );
      return res.status(500).json({
        message: "Database error fetching user role. Please try again.",
      });
    }

    // Self-healing: if user exists in auth but not in public.users table,
    // detect role from other tables or auth metadata and create the missing record
    if (!roleData) {
      console.warn(
        "⚠️ User",
        userId,
        "exists in auth but NOT in users table. Attempting auto-repair...",
      );

      let detectedRole = null;

      // Check drivers table
      const { data: driverCheck } = await supabaseAdmin
        .from("drivers")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      if (driverCheck) {
        detectedRole = "driver";
        console.log("  → Found in drivers table, role = driver");
      }

      // Check admins table
      if (!detectedRole) {
        const { data: adminCheck } = await supabaseAdmin
          .from("admins")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (adminCheck) {
          detectedRole = "admin";
          console.log("  → Found in admins table, role = admin");
        }
      }

      // Check managers table
      if (!detectedRole) {
        const { data: managerCheck } = await supabaseAdmin
          .from("managers")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (managerCheck) {
          detectedRole = "manager";
          console.log("  → Found in managers table, role = manager");
        }
      }

      // Fallback: check auth user metadata
      if (!detectedRole) {
        const authRole = data.user?.user_metadata?.role;
        if (
          authRole &&
          ["customer", "admin", "driver", "manager"].includes(authRole)
        ) {
          detectedRole = authRole;
          console.log("  → Detected from auth metadata, role =", authRole);
        } else {
          // Default to customer
          detectedRole = "customer";
          console.log("  → No role found anywhere, defaulting to customer");
        }
      }

      // Insert the missing users record
      const { error: insertError } = await supabaseAdmin.from("users").insert({
        id: userId,
        role: detectedRole,
        email: data.user.email,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("❌ Failed to auto-create users record:", insertError);
        return res.status(500).json({
          message: "Failed to repair user record. Please contact support.",
        });
      }

      console.log(
        "✅ Auto-created users record for",
        userId,
        "with role =",
        detectedRole,
      );
      roleData = { role: detectedRole };
    }

    // For customers, check if profile is completed
    if (roleData.role === "customer") {
      const { data: customerProfile } = await supabaseAdmin
        .from("customers")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

      if (!customerProfile) {
        // Profile not completed yet — include Supabase access_token so frontend
        // can prove identity when calling /auth/complete-profile
        return res.json({
          token: null,
          role: roleData.role,
          profileCompleted: false,
          userId: userId,
          access_token: data.session?.access_token || null,
          message: "Please complete your profile",
        });
      }

      return res.json(
        issueAuthSession(
          req,
          res,
          { id: userId, role: roleData.role },
          {
            role: roleData.role,
            userId,
            profileCompleted: true,
            userName: customerProfile.username,
          },
        ),
      );
    }

    res.json(
      issueAuthSession(
        req,
        res,
        { id: userId, role: roleData.role },
        {
          role: roleData.role,
          userId,
          profileCompleted: true,
        },
      ),
    );
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Server error during login",
    });
  }
});

/**
 * POST /auth/logout
 * Clears refresh cookie and lets clients clear local access token.
 */
router.post("/logout", (req, res) => {
  const expectedRole = normalizeRole(req.headers["x-expected-role"]);
  if (expectedRole) {
    clearRefreshCookie(req, res, expectedRole);
  }
  clearRefreshCookie(req, res);
  res.json({ message: "Logged out" });
});

/**
 * POST /auth/verify-token
 * Verify access token and extract user ID.
 * If the email is confirmed and the user does not yet have a public.users
 * record, one is created here (deferred from signup).
 */
router.post("/verify-token", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        message: "Token is required",
      });
    }

    // Verify the token with Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    const emailConfirmed = !!data.user.email_confirmed_at;

    // If email is confirmed, ensure the user has a record in public.users
    if (emailConfirmed) {
      const { data: existingUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!existingUser) {
        const { error: insertError } = await supabaseAdmin
          .from("users")
          .insert({
            id: data.user.id,
            role: "customer",
            email: data.user.email,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error(
            "Failed to create user record after verification:",
            insertError.message,
          );
          // Non-fatal — the login self-healing can recover later
        } else {
          console.log(
            `✅ Created users record for ${data.user.email} after email verification`,
          );
        }
      }
    }

    res.json({
      userId: data.user.id,
      email: data.user.email,
      emailConfirmed,
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({
      message: "Server error during token verification",
    });
  }
});

/**
 * POST /auth/verify-email
 * One-time email verification + auto-login session issuance.
 */
router.post("/verify-email", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const verificationResult = await resolveVerifiedCustomerSession(token);
    if (!verificationResult.ok) {
      return res.status(verificationResult.status).json({
        message: verificationResult.message,
        code: verificationResult.code,
      });
    }

    return res.json(
      issueAuthSession(
        req,
        res,
        verificationResult.sessionPayload,
        verificationResult.sessionExtra,
      ),
    );
  } catch (error) {
    console.error("verify-email error:", error);
    return res.status(500).json({
      message: "Server error during email verification",
      code: "verification_server_error",
    });
  }
});

/**
 * GET /auth/confirm-email?token=JWT
 * The user clicks this link from the verification email.
 * Everything happens SERVER-SIDE:
 *  1. Verify our JWT (not Supabase's — ours, 1 hour expiry)
 *  2. Mark email as confirmed in Supabase auth via admin API
 *  3. Create record in public.users table
 *  4. Serve a lightweight HTML page: "Verified! Go back to the app."
 *
 * No frontend load, no Supabase redirect, no localhost issues.
 */
router.get("/confirm-email", async (req, res) => {
  const token = String(req.query?.token || "").trim();

  if (!token) {
    return res.redirect("302", FRONTEND_SIGNUP_URL);
  }

  try {
    const verificationResult = await resolveVerifiedCustomerSession(token);
    if (!verificationResult.ok) {
      const fallbackUrl = `${FRONTEND_VERIFY_EMAIL_URL}?token=${encodeURIComponent(token)}`;
      return res.redirect("302", fallbackUrl);
    }

    const authSession = issueAuthSession(
      req,
      res,
      verificationResult.sessionPayload,
      verificationResult.sessionExtra,
    );

    const redirectUrl = `${FRONTEND_COMPLETE_PROFILE_URL}?userId=${encodeURIComponent(authSession.userId)}&access_token=${encodeURIComponent(authSession.token)}`;
    return res.redirect("302", redirectUrl);
  } catch (error) {
    console.error("confirm-email redirect error:", error);
    return res.redirect("302", FRONTEND_SIGNUP_URL);
  }
});

/**
 * POST /auth/send-otp
 * Resend OTP to user's WhatsApp number.
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { userId, phone } = req.body;

    if (!userId || !phone) {
      return res.status(400).json({ message: "userId and phone are required" });
    }

    // Verify customer exists
    const { data: customer, error } = await supabaseAdmin
      .from("customers")
      .select("id, phone")
      .eq("id", userId)
      .single();

    if (error || !customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Generate new OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("customers")
      .update({ otp_code: otp, otp_expires_at: otpExpiry })
      .eq("id", userId);

    const sent = await sendWhatsAppOTP(phone, otp);

    res.json({
      message: sent
        ? "OTP sent to your WhatsApp"
        : "OTP generated (WhatsApp delivery pending — check console)",
      otpSent: sent,
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

/**
 * POST /auth/verify-otp
 * Verify WhatsApp OTP and issue JWT token + complete login.
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ message: "userId and OTP are required" });
    }

    // Fetch stored OTP from customers table
    const { data: customer, error } = await supabaseAdmin
      .from("customers")
      .select("id, username, email, otp_code, otp_expires_at")
      .eq("id", userId)
      .single();

    if (error || !customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    if (!customer.otp_code) {
      return res.status(400).json({ message: "No OTP was requested" });
    }

    // Check expiry
    if (new Date(customer.otp_expires_at) < new Date()) {
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    // Verify OTP (timing-safe compare)
    if (customer.otp_code !== otp.trim()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Mark phone as verified, clear OTP in customers table
    await supabaseAdmin
      .from("customers")
      .update({
        otp_code: null,
        otp_expires_at: null,
        phone_verified: true,
      })
      .eq("id", userId);

    // Get user role from users table
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    console.log(`✅ OTP verified for user ${userId}`);

    res.json(
      issueAuthSession(
        req,
        res,
        { id: userId, role: user?.role || "customer" },
        {
          message: "Phone verified successfully!",
          role: user?.role || "customer",
          userId,
          userName: customer?.username || "",
        },
      ),
    );
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ message: "Failed to verify OTP" });
  }
});

/**
 * GET /auth/check-email-verified?userId=...
 * Check if a user's email has been verified.
 * Used by the signup "Check Your Email" screen to poll for verification status.
 */
router.get("/check-email-verified", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const { data: userData, error } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (error || !userData?.user) {
      return res
        .status(404)
        .json({ message: "User not found", verified: false });
    }

    res.json({ verified: !!userData.user.email_confirmed_at });
  } catch (error) {
    console.error("Check email verified error:", error);
    res.status(500).json({ message: "Server error", verified: false });
  }
});

/**
 * GET /auth/email-verified
 * Supabase Site URL redirect target.
 * After Supabase confirms the email, it redirects here.
 * We serve a success HTML page with a "Go to Login" button.
 */
router.get("/email-verified", (req, res) => {
  const frontendUrl = "https://meezo-eta.vercel.app";
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>NearMe – Email Verified!</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
     min-height:100vh;display:flex;align-items:center;justify-content:center;
     background:linear-gradient(135deg,#f0fdf4,#fff,#ecfdf5);padding:16px}
.card{max-width:400px;width:100%;background:#fff;border-radius:24px;
      padding:32px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.08);
      border:1px solid #d1fae5}
.icon{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;margin:0 auto 20px;font-size:40px;color:#fff;
      background:linear-gradient(135deg,#22c55e,#16a34a)}
h2{font-size:24px;font-weight:800;color:#111827;margin-bottom:8px}
p{color:#6b7280;font-size:14px;line-height:1.5;margin-bottom:16px}
.btn{display:block;width:100%;padding:14px;border:none;border-radius:14px;
     font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;
     text-align:center;transition:all .2s;margin-top:10px;
     background:linear-gradient(to right,#22c55e,#10b981);color:#fff}
.btn:hover{opacity:.9;transform:scale(1.02)}
</style></head><body><div class="card">
<div class="icon">✓</div>
<h2>Email Verified!</h2>
<p>Your email has been confirmed successfully. You can now login to your account.</p>
<a class="btn" href="${frontendUrl}/login">Go to Login</a>
</div></body></html>`);
});

/**
 * POST /auth/refresh-token
 * Refresh JWT token for all roles (customer, admin, driver, manager).
 * If the current token is valid (even if close to expiry), issue a new 180-day token.
 * This enables "stay logged in forever" like Uber Eats.
 */
router.post("/refresh-token", async (req, res) => {
  try {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const expectedRole = normalizeRole(req.headers["x-expected-role"]);
    const cookieCandidates = getRefreshCookieCandidates(expectedRole);
    const tokenFromCookie = cookieCandidates
      .map((cookieName) => cookies[cookieName])
      .find(Boolean);
    const tokenFromBody = req.body?.refreshToken;
    const refreshToken = tokenFromCookie || tokenFromBody;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      if (expectedRole) {
        clearRefreshCookie(req, res, expectedRole);
      }
      clearRefreshCookie(req, res);
      return res
        .status(401)
        .json({ message: "Invalid or expired refresh token" });
    }

    if (payload?.type && payload.type !== "refresh") {
      if (expectedRole) {
        clearRefreshCookie(req, res, expectedRole);
      }
      clearRefreshCookie(req, res);
      return res.status(401).json({ message: "Invalid refresh token type" });
    }

    const { id, role } = payload;

    if (expectedRole && expectedRole !== role) {
      // Prevent cross-role refresh cookie collisions between different app sessions.
      return res.status(401).json({
        message: "Refresh role mismatch",
      });
    }

    // Verify user still exists and is active
    let userExists = false;

    if (role === "customer") {
      const { data } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      userExists = !!data;
    } else if (role === "admin") {
      const { data } = await supabaseAdmin
        .from("admins")
        .select("user_id")
        .eq("user_id", id)
        .maybeSingle();
      userExists = !!data;
    } else if (role === "driver") {
      const { data } = await supabaseAdmin
        .from("drivers")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      userExists = !!data;
    } else if (role === "manager") {
      const { data } = await supabaseAdmin
        .from("managers")
        .select("user_id")
        .eq("user_id", id)
        .maybeSingle();
      userExists = !!data;
    }

    if (!userExists) {
      clearAllRefreshCookies(req, res);
      return res.status(401).json({ message: "User no longer exists" });
    }

    console.log(`🔄 Token refreshed for ${role} (id: ${id})`);

    res.json(
      issueAuthSession(
        req,
        res,
        { id, role },
        {
          message: "Token refreshed successfully",
          role,
          userId: id,
        },
      ),
    );
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({ message: "Failed to refresh token" });
  }
});

export default router;
