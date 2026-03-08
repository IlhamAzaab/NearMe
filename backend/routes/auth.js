import express from "express";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { authenticate } from "../middleware/authenticate.js";

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

/**
 * POST /auth/signup
 * Register new customer with email verification.
 *
 * Flow:
 *  1. Check email availability across all tables
 *  2. Use supabaseAnonClient.auth.signUp() — Supabase sends the verification email
 *  3. NO record in public.users until email is confirmed
 *
 * Supabase handles email delivery (SMTP is blocked on Render).
 * After user clicks the link, Supabase redirects to our /auth/email-verified endpoint.
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

    // The redirect URL after email verification — goes to OUR backend
    const backendUrl =
      process.env.BACKEND_URL || "https://meezo-backend-d3gw.onrender.com";
    const emailRedirectTo = `${backendUrl}/auth/email-verified`;

    // Sign up via Supabase Anon client — this triggers Supabase's built-in email
    const { data: authData, error: authError } =
      await supabaseAnonClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
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

    // Check if Supabase returned a user (it should)
    if (!authData?.user) {
      return res.status(500).json({
        message: "Signup failed. Please try again.",
      });
    }

    // Supabase returns a "fake" user with empty identities when email already exists
    // (security measure to prevent email enumeration)
    if (authData.user.identities && authData.user.identities.length === 0) {
      return res.status(400).json({
        message:
          "This email is already registered. Please login or check your email for the verification link.",
      });
    }

    console.log(
      `✅ Signup: ${email} registered (userId: ${authData.user.id}). Supabase will send verification email.`,
    );

    // DO NOT insert into public.users — happens in /auth/email-verified after confirmation
    res.status(201).json({
      message:
        "Signup successful! Please check your email to verify your account.",
      userId: authData.user.id,
      emailSent: true,
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
 * Protected: validates the userId matches a real Supabase user via access_token
 */
router.post("/complete-profile", async (req, res) => {
  try {
    const {
      userId,
      username,
      email,
      phone,
      nic_number,
      address,
      city,
      latitude,
      longitude,
      access_token,
    } = req.body;

    // Validate required fields
    if (!userId || !username || !email || !phone) {
      return res.status(400).json({
        message: "Username, email, and phone are required",
      });
    }

    // Verify the caller owns this userId via Supabase access token
    if (!access_token) {
      return res.status(401).json({ message: "Access token is required" });
    }
    const { data: tokenUser, error: tokenError } =
      await supabaseAdmin.auth.getUser(access_token);
    if (tokenError || !tokenUser?.user || tokenUser.user.id !== userId) {
      return res
        .status(403)
        .json({ message: "Access denied — token does not match userId" });
    }

    // Validate location
    if (!latitude || !longitude) {
      return res.status(400).json({
        message: "Location is required",
      });
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

    // Create customer profile
    const { error: customerError } = await supabaseAdmin
      .from("customers")
      .insert({
        id: userId,
        username,
        email,
        phone,
        nic_number,
        address,
        city,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
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

    // Generate JWT token for the customer
    const token = jwt.sign(
      { id: userId, role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      message: "Profile completed successfully",
      token, // Return token for immediate login
      role: "customer",
      userId: userId,
      userName: username,
      customer: {
        id: userId,
        username,
        email,
        phone,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
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

      // Generate JWT token
      const token = jwt.sign(
        { id: userId, role: roleData.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );

      return res.json({
        token,
        role: roleData.role,
        profileCompleted: true,
        userId: userId,
        userName: customerProfile.username,
      });
    }

    // Generate JWT token for non-customer roles
    const token = jwt.sign(
      { id: userId, role: roleData.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      role: roleData.role,
      profileCompleted: true,
      userId: userId,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Server error during login",
    });
  }
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
  const frontendUrl =
    process.env.FRONTEND_URL || "https://meezo-eta.vercel.app";
  const mobileScheme = "nearmemobile";

  // Helper to send an HTML response
  const sendPage = (title, icon, iconBg, heading, msg, buttons) => {
    const btnHtml = buttons
      .map((b) => `<a class="btn ${b.cls}" href="${b.href}">${b.text}</a>`)
      .join("");
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
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
      background:${iconBg}}
h2{font-size:24px;font-weight:800;color:#111827;margin-bottom:8px}
p{color:#6b7280;font-size:14px;line-height:1.5;margin-bottom:16px}
.btn{display:block;width:100%;padding:14px;border:none;border-radius:14px;
     font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;
     text-align:center;transition:all .2s;margin-top:10px}
.btn-green{background:linear-gradient(to right,#22c55e,#10b981);color:#fff}
.btn-green:hover{opacity:.9;transform:scale(1.02)}
.btn-gray{background:#f3f4f6;color:#374151}
.btn-gray:hover{background:#e5e7eb}
</style></head><body><div class="card">
<div class="icon">${icon}</div>
<h2>${heading}</h2>
<p>${msg}</p>
${btnHtml}
</div></body></html>`);
  };

  try {
    const { token } = req.query;

    if (!token) {
      return sendPage(
        "NearMe – Invalid Link",
        "✕",
        "linear-gradient(135deg,#ef4444,#dc2626)",
        "Invalid Link",
        "No verification token found. Please use the link from your email.",
        [
          {
            cls: "btn-green",
            href: `${frontendUrl}/signup`,
            text: "Back to Signup",
          },
        ],
      );
    }

    // Verify our own JWT
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      const isExpired = jwtErr.name === "TokenExpiredError";
      return sendPage(
        "NearMe – Verification Failed",
        "✕",
        "linear-gradient(135deg,#ef4444,#dc2626)",
        isExpired ? "Link Expired" : "Invalid Link",
        isExpired
          ? "This verification link has expired. Please sign up again to get a new link."
          : "This verification link is invalid. Please check your email for the correct link.",
        [
          {
            cls: "btn-green",
            href: `${frontendUrl}/signup`,
            text: "Back to Signup",
          },
          {
            cls: "btn-gray",
            href: `${frontendUrl}/login`,
            text: "Go to Login",
          },
        ],
      );
    }

    if (payload.purpose !== "email_verification" || !payload.userId) {
      return sendPage(
        "NearMe – Invalid Link",
        "✕",
        "linear-gradient(135deg,#ef4444,#dc2626)",
        "Invalid Link",
        "This link is not a valid email verification link.",
        [
          {
            cls: "btn-green",
            href: `${frontendUrl}/signup`,
            text: "Back to Signup",
          },
        ],
      );
    }

    // Confirm email in Supabase auth via admin API
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(payload.userId, {
        email_confirm: true,
      });

    if (updateError) {
      console.error("Failed to confirm email in auth:", updateError.message);
      return sendPage(
        "NearMe – Verification Failed",
        "✕",
        "linear-gradient(135deg,#ef4444,#dc2626)",
        "Verification Failed",
        "Could not verify your email. The account may not exist. Please try signing up again.",
        [
          {
            cls: "btn-green",
            href: `${frontendUrl}/signup`,
            text: "Back to Signup",
          },
        ],
      );
    }

    // Create record in public.users (if not already there)
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", payload.userId)
      .maybeSingle();

    if (!existingUser) {
      const { error: insertError } = await supabaseAdmin.from("users").insert({
        id: payload.userId,
        role: "customer",
        email: payload.email,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("Users table insert failed:", insertError.message);
        // Non-fatal — login self-healing can recover
      } else {
        console.log(
          `✅ Created users record for ${payload.email} after email confirmation`,
        );
      }
    }

    console.log(
      `✅ Email confirmed for ${payload.email} (userId: ${payload.userId})`,
    );

    // Success page
    sendPage(
      "NearMe – Email Verified!",
      "✓",
      "linear-gradient(135deg,#22c55e,#16a34a)",
      "Email Verified!",
      "Your email has been confirmed successfully. You can now close this page and go back to the app to login.",
      [
        {
          cls: "btn-green",
          href: `${frontendUrl}/login`,
          text: "Open NearMe →",
        },
      ],
    );
  } catch (error) {
    console.error("Confirm email error:", error);
    sendPage(
      "NearMe – Error",
      "✕",
      "linear-gradient(135deg,#ef4444,#dc2626)",
      "Something Went Wrong",
      "An unexpected error occurred. Please try again later.",
      [
        {
          cls: "btn-green",
          href: `${frontendUrl}/signup`,
          text: "Back to Signup",
        },
        { cls: "btn-gray", href: `${frontendUrl}/login`, text: "Go to Login" },
      ],
    );
  }
});

/**
 * GET /auth/email-verified
 * Supabase redirects here after user clicks the verification link in their email.
 * Supabase appends tokens as a URL hash fragment: #access_token=...&type=signup
 * OR returns errors: #error=access_denied&error_code=otp_expired...
 *
 * Since hash fragments are NOT sent to the server, we serve a lightweight HTML page
 * whose JavaScript extracts the access_token or error, calls POST /auth/verify-token,
 * and shows a success/failure UI.
 */
router.get("/email-verified", (req, res) => {
  // HARDCODED frontend URLs — don't depend on env vars which may not be properly configured
  const frontendUrl = "https://meezo-eta.vercel.app";
  const backendUrl = "https://meezo-backend-d3gw.onrender.com";

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>NearMe – Verifying Email…</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
     min-height:100vh;display:flex;align-items:center;justify-content:center;
     background:linear-gradient(135deg,#f0fdf4,#fff,#ecfdf5);padding:16px}
.card{max-width:400px;width:100%;background:#fff;border-radius:24px;
      padding:32px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.08);
      border:1px solid #d1fae5}
.icon{width:80px;height:80px;border-radius:50%;display:flex;align-items:center;
      justify-content:center;margin:0 auto 20px;font-size:40px;color:#fff}
.icon-loading{background:linear-gradient(135deg,#3b82f6,#2563eb);animation:pulse 1.5s infinite}
.icon-success{background:linear-gradient(135deg,#22c55e,#16a34a)}
.icon-error{background:linear-gradient(135deg,#ef4444,#dc2626)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
h2{font-size:24px;font-weight:800;color:#111827;margin-bottom:8px}
p{color:#6b7280;font-size:14px;line-height:1.5;margin-bottom:16px}
.debug{font-size:12px;color:#9ca3af;margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;font-family:monospace;word-break:break-all}
.btn{display:block;width:100%;padding:14px;border:none;border-radius:14px;
     font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;
     text-align:center;transition:all .2s;margin-top:10px}
.btn-green{background:linear-gradient(to right,#22c55e,#10b981);color:#fff}
.btn-green:hover{opacity:.9;transform:scale(1.02)}
.btn-gray{background:#f3f4f6;color:#374151}
.btn-gray:hover{background:#e5e7eb}
.hidden{display:none}
</style></head><body>
<div class="card">
  <div id="loading">
    <div class="icon icon-loading">⏳</div>
    <h2>Verifying your email…</h2>
    <p>Please wait a moment.</p>
  </div>
  <div id="success" class="hidden">
    <div class="icon icon-success">✓</div>
    <h2>Email Verified!</h2>
    <p>Your email has been confirmed successfully. You can now login to NearMe.</p>
    <a class="btn btn-green" href="${frontendUrl}/login">Open NearMe →</a>
  </div>
  <div id="error" class="hidden">
    <div class="icon icon-error">✕</div>
    <h2 id="errTitle">Verification Failed</h2>
    <p id="errMsg">Something went wrong during verification.</p>
    <div id="debugInfo" class="debug"></div>
    <a class="btn btn-green" href="${frontendUrl}/signup">Back to Signup</a>
    <a class="btn btn-gray" href="${frontendUrl}/login">Go to Login</a>
  </div>
</div>
<script>
(function(){
  var hash = window.location.hash.substring(1);
  if(!hash){
    showError("Invalid Link","No verification data found. Please use the link from your email.");
    return;
  }
  
  var params = new URLSearchParams(hash);
  
  // Check for Supabase error first
  var supabaseError = params.get("error");
  var errorCode = params.get("error_code");
  var errorDesc = params.get("error_description");
  
  if(supabaseError || errorCode){
    var msg = errorDesc ? decodeURIComponent(errorDesc) : "Link is invalid or has expired";
    if(errorCode === "otp_expired"){
      msg = "Your verification link has expired. This can happen if you wait too long to click the link or if there's a configuration issue.\\n\\nPossible fixes:\\n" +
            "1. Check that Supabase Site URL is set to: https://meezo-backend-d3gw.onrender.com/auth/email-verified\\n" +
            "2. Make sure Supabase has your recovery email configured\\n" +
            "3. Try signing up again to get a fresh verification email";
    }
    showError("Verification Error (" + errorCode + ")", msg);
    return;
  }
  
  var accessToken = params.get("access_token");
  if(!accessToken){
    showError("Invalid Link","No access token found in verification link. Please check your email for the correct link.");
    return;
  }
  
  // Call our backend to verify the token and create public.users record
  fetch("${backendUrl}/auth/verify-token",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token:accessToken})
  })
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,status:r.status,data:d}})})
  .then(function(res){
    if(res.ok && res.data.emailConfirmed){
      document.getElementById("loading").classList.add("hidden");
      document.getElementById("success").classList.remove("hidden");
    } else {
      showError("Verification Failed", res.data.message || "Could not verify your email. Please try again.", "Status: " + res.status);
    }
  })
  .catch(function(err){
    showError("Verification Failed","Network error: " + err.message, "Please check your connection and try again.");
  });
  
  function showError(title, msg, debug){
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("errTitle").textContent = title;
    document.getElementById("errMsg").textContent = msg;
    if(debug){
      document.getElementById("debugInfo").textContent = debug;
    }
    document.getElementById("error").classList.remove("hidden");
  }
})();
</script>
</body></html>`);
});

export default router;
