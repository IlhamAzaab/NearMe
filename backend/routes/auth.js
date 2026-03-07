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
// signInWithPassword sets a user-session on the client it is called on,
// which would cause subsequent DB queries on that client to run under the
// "authenticated" Postgres role instead of "service_role", triggering RLS
// violations. Isolating it here keeps supabaseAdmin clean for DB ops.
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

// Supabase client with ANON key for auth.signUp() — Supabase's GoTrue server
// automatically sends the verification email when called with the anon key and
// email confirmations are enabled in the Supabase dashboard.
const supabaseAnonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
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
 * User is created in Supabase auth only. NO record is written to the
 * public.users or customers tables until the email is verified
 * (handled by /auth/verify-token).
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

    // Build the redirect URL that Supabase puts in the verification email
    const redirectUrl = `${
      process.env.FRONTEND_URL || "https://meezo-eta.vercel.app"
    }/auth/verify-email`;

    // Use auth.signUp() via the anon-key client so Supabase's GoTrue server
    // automatically sends the confirmation email (requires "Confirm email"
    // to be ON in Supabase Dashboard → Auth → Email).
    const { data: signUpData, error: signUpError } =
      await supabaseAnonClient.auth.signUp({
        email,
        password,
        options: {
          data: { role: "customer" },
          emailRedirectTo: redirectUrl,
        },
      });

    if (signUpError) {
      console.error("Signup failed:", signUpError.message);
      return res.status(400).json({
        message: signUpError.message,
      });
    }

    // If identities array is empty, the email already exists in auth.users
    // (unverified or previously registered through a different method).
    if (
      signUpData.user &&
      (!signUpData.user.identities || signUpData.user.identities.length === 0)
    ) {
      return res.status(400).json({
        message:
          "This email is already registered. Please login or check your email for verification.",
      });
    }

    console.log(
      `✅ Signup: verification email sent to ${email} (userId: ${signUpData.user?.id})`,
    );

    // DO NOT insert into public.users table here — that happens in
    // /auth/verify-token after the email is confirmed.
    res.status(201).json({
      message:
        "Signup successful! Please check your email to verify your account.",
      userId: signUpData.user?.id,
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

export default router;
