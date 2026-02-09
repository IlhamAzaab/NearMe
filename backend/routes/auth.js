import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { sendVerificationEmail } from "../utils/email.js";

dotenv.config();

const router = express.Router();

/**
 * POST /auth/signup
 * Register new customer with email verification
 */
router.post("/signup", async (req, res) => {
  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║           NEW SIGNUP REQUEST RECEIVED                        ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝",
  );

  try {
    const { email, password } = req.body;

    console.log("Request body received:");
    console.log("  Email:", email);
    console.log(
      "  Password:",
      password ? "***" + password.slice(-3) : "not provided",
    );
    console.log("  Password length:", password?.length || 0);

    // Validate input
    if (!email || !password) {
      console.log("❌ Validation failed: Missing email or password");
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    if (password.length < 6) {
      console.log("❌ Validation failed: Password too short");
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    console.log("✅ Basic validation passed");
    console.log("\nChecking email availability across all tables...");

    // Check if email already exists in users table
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("email, role")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      console.log(
        "❌ Email already exists in users table as:",
        existingUser.role,
      );
      return res.status(400).json({
        message: `This email is already registered as ${existingUser.role}`,
      });
    }
    console.log("✅ Email not in users table");

    // Check in admins table
    const { data: adminCheck } = await supabaseAdmin
      .from("admins")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (adminCheck) {
      console.log("❌ Email already exists in admins table");
      return res.status(400).json({
        message: "This email is already registered as admin",
      });
    }
    console.log("✅ Email not in admins table");

    // Check in drivers table
    const { data: driverCheck } = await supabaseAdmin
      .from("drivers")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (driverCheck) {
      console.log("❌ Email already exists in drivers table");
      return res.status(400).json({
        message: "This email is already registered as driver",
      });
    }
    console.log("✅ Email not in drivers table");
    console.log("✅ Email is available!\n");

    console.log("Creating user in Supabase Auth...");
    // Create user in Supabase Auth with email confirmation required
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // Require email confirmation
        user_metadata: {
          role: "customer",
        },
      });

    if (authError) {
      console.error("❌ Supabase Auth user creation failed!");
      console.error("Auth error:", authError);
      return res.status(400).json({
        message: authError.message,
      });
    }

    console.log("✅ Supabase Auth user created successfully");
    console.log("  User ID:", authData.user.id);
    console.log(
      "  Email confirmed:",
      authData.user.email_confirmed_at ? "Yes" : "No (needs verification)",
    );

    console.log("\nInserting user record into users table...");
    // Create user record in users table
    const { error: userError } = await supabaseAdmin.from("users").insert({
      id: authData.user.id,
      role: "customer",
      email: email,
      created_at: new Date().toISOString(),
    });

    if (userError) {
      console.error("❌ Users table insert failed!");
      console.error("User table insert error:", userError);
      // Rollback: delete auth user
      console.log("Rolling back: Deleting auth user...");
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({
        message: "Failed to create user record",
      });
    }

    console.log("✅ Users table record created successfully");

    // Generate email verification link and send email
    console.log("\n========== EMAIL VERIFICATION PROCESS START ==========");
    console.log("Step 1: User created successfully");
    console.log("User ID:", authData.user.id);
    console.log("User Email:", email);
    console.log("Step 2: Attempting to generate verification link...");

    try {
      const redirectUrl = `${
        process.env.FRONTEND_URL || "http://localhost:5174"
      }/auth/verify-email`;
      console.log("Redirect URL:", redirectUrl);
      console.log("FRONTEND_URL from .env:", process.env.FRONTEND_URL);

      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "signup",
          email: email,
          options: {
            redirectTo: redirectUrl,
          },
        });

      console.log("\nStep 3: generateLink() response received");
      console.log(
        "Link Error:",
        linkError ? JSON.stringify(linkError, null, 2) : "null",
      );
      console.log(
        "Link Data:",
        linkData ? JSON.stringify(linkData, null, 2) : "null",
      );

      if (linkError) {
        console.error("\n❌ EMAIL GENERATION FAILED!");
        console.error("Error details:", JSON.stringify(linkError, null, 2));
        console.log(
          "========== EMAIL VERIFICATION PROCESS END (FAILED) ==========\n",
        );
        // User is created but email failed - still return success
        // User can request resend later
        return res.status(201).json({
          message:
            "Account created but email sending failed. Please contact support.",
          userId: authData.user.id,
          emailSent: false,
        });
      }

      console.log("\n✅ EMAIL LINK GENERATED SUCCESSFULLY!");
      console.log(
        "Action Link:",
        linkData.properties?.action_link || "Not provided",
      );
      console.log(
        "Hashed Token:",
        linkData.properties?.hashed_token || "Not provided",
      );
      console.log(
        "Redirect URL:",
        linkData.properties?.redirect_to || "Not provided",
      );

      // Step 4: Actually SEND the verification email
      console.log("\nStep 4: Sending verification email via SMTP...");
      const actionLink = linkData.properties?.action_link;

      if (!actionLink) {
        console.error("\n❌ No action link returned from generateLink()");
        console.log(
          "========== EMAIL VERIFICATION PROCESS END (FAILED) ==========\n",
        );
        return res.status(201).json({
          message:
            "Account created but email sending failed. Please contact support.",
          userId: authData.user.id,
          emailSent: false,
        });
      }

      try {
        // Send the verification email with the action link
        await sendVerificationEmail({
          to: email,
          verificationLink: actionLink,
        });

        console.log("\n✅ VERIFICATION EMAIL SENT SUCCESSFULLY!");
        console.log("Email sent to:", email);
        console.log("Expected delivery time: 1-5 minutes");
        console.log("\n⚠️ IMPORTANT: Check your email inbox and spam folder!");
        console.log(
          "========== EMAIL VERIFICATION PROCESS END (SUCCESS) ==========\n",
        );

        res.status(201).json({
          message:
            "Signup successful! Please check your email to verify your account.",
          userId: authData.user.id,
          emailSent: true,
        });
      } catch (smtpError) {
        console.error("\n❌ SMTP EMAIL SENDING FAILED!");
        console.error("SMTP Error:", smtpError.message);
        console.error("Full error:", smtpError);
        console.log(
          "========== EMAIL VERIFICATION PROCESS END (FAILED) ==========\n",
        );

        res.status(201).json({
          message:
            "Account created but email sending failed. Please contact support.",
          userId: authData.user.id,
          emailSent: false,
        });
      }
    } catch (emailError) {
      console.error("\n❌ EXCEPTION DURING EMAIL VERIFICATION PROCESS!");
      console.error("Exception details:", emailError);
      console.error("Error message:", emailError.message);
      console.error("Error stack:", emailError.stack);
      console.log(
        "========== EMAIL VERIFICATION PROCESS END (EXCEPTION) ==========\n",
      );
      // User is created but email failed
      res.status(201).json({
        message:
          "Account created but email sending failed. Please contact support.",
        userId: authData.user.id,
        emailSent: false,
      });
    }
  } catch (error) {
    console.error(
      "\n╔══════════════════════════════════════════════════════════════╗",
    );
    console.error(
      "║           SIGNUP ERROR - UNEXPECTED EXCEPTION                ║",
    );
    console.error(
      "╚══════════════════════════════════════════════════════════════╝",
    );
    console.error("Signup error:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error(
      "╚══════════════════════════════════════════════════════════════╝\n",
    );
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
 * Get user email by userId
 */
router.get("/user-email", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
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
 * Complete customer profile after email verification
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
    } = req.body;

    // Validate required fields
    if (!userId || !username || !email || !phone) {
      return res.status(400).json({
        message: "Username, email, and phone are required",
      });
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

    // Generate JWT token for the customer (1 year expiration)
    const token = jwt.sign(
      { id: userId, role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "1y" },
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

    // Authenticate with Supabase
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
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
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (roleError || !roleData) {
      console.error("Role fetch error:", roleError);
      return res.status(404).json({
        message: "User role not found. Please contact support.",
      });
    }

    // For customers, check if profile is completed
    if (roleData.role === "customer") {
      const { data: customerProfile } = await supabaseAdmin
        .from("customers")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

      if (!customerProfile) {
        // Profile not completed yet
        return res.json({
          token: null,
          role: roleData.role,
          profileCompleted: false,
          userId: userId,
          message: "Please complete your profile",
        });
      }

      // Generate JWT token (1 year expiration)
      const token = jwt.sign(
        { id: userId, role: roleData.role },
        process.env.JWT_SECRET,
        { expiresIn: "1y" },
      );

      return res.json({
        token,
        role: roleData.role,
        profileCompleted: true,
        userId: userId,
        userName: customerProfile.username,
      });
    }

    // Generate JWT token for non-customer roles (1 year expiration)
    const token = jwt.sign(
      { id: userId, role: roleData.role },
      process.env.JWT_SECRET,
      { expiresIn: "1y" },
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
 * Verify access token and extract user ID
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

    res.json({
      userId: data.user.id,
      email: data.user.email,
      emailConfirmed: !!data.user.email_confirmed_at,
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({
      message: "Server error during token verification",
    });
  }
});

export default router;
