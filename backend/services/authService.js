import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  buildPhoneLookupCandidates,
  generateOtpCode,
  getOtpExpiryDate,
  hashOtpCode,
  isSriLankaPhone,
  normalizeSriLankaPhone,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from "./otpService.js";
import { sendOtpSms } from "./smslenzService.js";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_SALT_ROUNDS = Number.parseInt(
  process.env.BCRYPT_SALT_ROUNDS || "12",
  10,
);
const CUSTOMER_AUTH_SELECT =
  "id, email, phone, password_hash, role, address, profile_completed, phone_verified, phone_otp_code_hash, phone_otp_expires_at, phone_otp_attempts, phone_otp_last_sent_at, phone_otp_verified_at";
const LOGIN_SELECT =
  "id, email, phone, role, address, profile_completed, phone_verified, password_hash";

function authLog(event, payload = {}) {
  console.log(`[Auth] ${event}`, payload);
}

function appError(statusCode, message, code, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const hint = String(error?.hint || "").toLowerCase();
  const target = String(columnName || "").toLowerCase();

  if (!target) {
    return false;
  }

  return (
    error?.code === "42703" ||
    message.includes(`column ${target}`) ||
    message.includes(`'${target}'`) ||
    details.includes(target) ||
    hint.includes(target)
  );
}

function sanitizeUser(user) {
  return {
    id: user.id,
    role: user.role,
    email: user.email || null,
    phone: user.phone || null,
    address: user.address || null,
    phoneVerified: Boolean(user.phone_verified),
    profileCompleted: Boolean(user.profile_completed),
  };
}

function issueAccessToken(user) {
  if (!process.env.JWT_SECRET) {
    throw appError(500, "JWT_SECRET is missing", "JWT_SECRET_MISSING");
  }

  return jwt.sign(
    {
      id: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function pickBestPhoneMatch(users, candidates) {
  const rank = new Map(
    candidates.map((value, index) => [value, candidates.length - index]),
  );

  return [...users].sort(
    (a, b) => (rank.get(b.phone) || 0) - (rank.get(a.phone) || 0),
  )[0];
}

async function canonicalizeUserPhone(userId, normalizedPhone) {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ phone: normalizedPhone })
    .eq("id", userId)
    .neq("phone", normalizedPhone);

  if (error) {
    throw appError(
      500,
      "Failed to normalize stored phone",
      "PHONE_NORMALIZE_SAVE_FAILED",
    );
  }
}

async function findUserByPhone(phone, { role, selectFields, logTag }) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    return null;
  }

  const candidates = buildPhoneLookupCandidates(normalizedPhone);
  let query = supabaseAdmin
    .from("users")
    .select(selectFields)
    .in("phone", candidates)
    .limit(10);
  if (role) {
    query = query.eq("role", role);
  }

  const { data, error } = await query;
  if (error) {
    throw appError(500, "Failed to query user by phone", "DB_QUERY_FAILED", {
      dbMessage: error.message,
      dbHint: error.hint || null,
      dbDetails: error.details || null,
      dbCode: error.code || null,
    });
  }

  const matchedUser = data?.length
    ? pickBestPhoneMatch(data, candidates)
    : null;
  authLog(logTag || "phone_lookup", {
    normalizedPhone,
    candidates,
    found: Boolean(matchedUser),
    userId: matchedUser?.id || null,
    role: matchedUser?.role || null,
    storedPhone: matchedUser?.phone || null,
  });

  if (matchedUser && matchedUser.phone !== normalizedPhone) {
    await canonicalizeUserPhone(matchedUser.id, normalizedPhone);
    matchedUser.phone = normalizedPhone;
    authLog("phone_canonicalized", {
      userId: matchedUser.id,
      normalizedPhone,
    });
  }

  return matchedUser;
}

async function updateOtpForUser(userId, phone) {
  const otp = generateOtpCode();
  const otpHash = hashOtpCode(otp);
  const now = new Date();
  const expiresAt = getOtpExpiryDate(now);

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      phone_otp_code_hash: otpHash,
      phone_otp_expires_at: expiresAt.toISOString(),
      phone_otp_attempts: 0,
      phone_otp_last_sent_at: now.toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    throw appError(500, "Failed to save OTP", "OTP_SAVE_FAILED", {
      dbMessage: updateError.message,
      dbHint: updateError.hint || null,
      dbDetails: updateError.details || null,
      dbCode: updateError.code || null,
    });
  }

  authLog("otp_hash_update_result", {
    userId,
    phone,
    expiresAt: expiresAt.toISOString(),
  });

  const smsResult = await sendOtpSms({ phone, otp });
  const smsDelivered = Boolean(smsResult?.delivered);
  const smsSkipped = Boolean(smsResult?.skipped);
  const shouldExposeDevOtp =
    process.env.NODE_ENV !== "production" && smsSkipped;
  authLog("sms_send_result", {
    userId,
    phone,
    delivered: smsDelivered,
    skipped: smsSkipped,
    reason: smsResult?.reason || null,
  });

  return {
    expiresAt: expiresAt.toISOString(),
    resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    devOtp: shouldExposeDevOtp ? otp : undefined,
    smsDelivered,
    smsSkipped,
    smsSkipReason: smsResult?.reason || null,
  };
}

export async function startCustomerSignup({ phone, password }) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    throw appError(400, "Invalid phone format", "INVALID_PHONE");
  }

  authLog("signup_start_phone", {
    normalizedPhone,
  });

  const existingUser = await findUserByPhone(normalizedPhone, {
    role: "customer",
    selectFields: CUSTOMER_AUTH_SELECT,
    logTag: "existing_user_lookup_result",
  });
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  if (existingUser) {
    if (existingUser.phone_verified) {
      throw appError(
        409,
        "Phone number is already registered",
        "DUPLICATE_PHONE",
      );
    }

    const { error: reuseError } = await supabaseAdmin
      .from("users")
      .update({
        phone: normalizedPhone,
        password_hash: passwordHash,
        role: "customer",
        phone_verified: false,
        profile_completed: false,
      })
      .eq("id", existingUser.id);

    if (reuseError) {
      throw appError(
        500,
        "Failed to reuse pending signup record",
        "USER_REUSE_FAILED",
      );
    }

    authLog("user_insert_result", {
      action: "reuse_pending_customer",
      userId: existingUser.id,
      normalizedPhone,
    });

    const otpMeta = await updateOtpForUser(existingUser.id, normalizedPhone);
    return {
      phone: normalizedPhone,
      reusedUser: true,
      ...otpMeta,
    };
  }

  const anyRolePhone = await findUserByPhone(normalizedPhone, {
    selectFields: "id, role, phone",
    logTag: "existing_any_role_lookup_result",
  });

  if (anyRolePhone && anyRolePhone.role !== "customer") {
    throw appError(409, "Phone number is already in use", "DUPLICATE_PHONE");
  }

  const userId = crypto.randomUUID();

  const { error: insertError } = await supabaseAdmin.from("users").insert({
    id: userId,
    phone: normalizedPhone,
    password_hash: passwordHash,
    role: "customer",
    phone_verified: false,
    profile_completed: false,
  });

  if (insertError) {
    throw appError(500, "Failed to create customer", "USER_CREATE_FAILED", {
      dbMessage: insertError.message,
      dbHint: insertError.hint || null,
      dbDetails: insertError.details || null,
      dbCode: insertError.code || null,
    });
  }

  authLog("user_insert_result", {
    action: "new_customer",
    userId,
    normalizedPhone,
  });

  const otpMeta = await updateOtpForUser(userId, normalizedPhone);

  return {
    phone: normalizedPhone,
    reusedUser: false,
    ...otpMeta,
  };
}

export async function verifyCustomerOtp({ phone, otp }) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    throw appError(400, "Invalid phone format", "INVALID_PHONE");
  }

  const user = await findUserByPhone(normalizedPhone, {
    role: "customer",
    selectFields: CUSTOMER_AUTH_SELECT,
    logTag: "otp_verify_lookup_result",
  });

  if (!user) {
    throw appError(404, "Customer signup record not found", "USER_NOT_FOUND");
  }

  if (user.phone_verified) {
    const token = issueAccessToken(user);
    return {
      token,
      user: sanitizeUser(user),
      alreadyVerified: true,
      nextStep: user.profile_completed ? "home" : "complete_profile",
    };
  }

  if (!user.phone_otp_code_hash || !user.phone_otp_expires_at) {
    throw appError(
      400,
      "OTP not generated. Please request a new OTP.",
      "OTP_MISSING",
    );
  }

  const attempts = Number(user.phone_otp_attempts || 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    throw appError(
      429,
      "Maximum OTP attempts exceeded. Please resend OTP.",
      "OTP_LIMIT_EXCEEDED",
    );
  }

  if (new Date(user.phone_otp_expires_at).getTime() <= Date.now()) {
    throw appError(400, "OTP expired. Please resend OTP.", "OTP_EXPIRED");
  }

  const providedOtpHash = hashOtpCode(otp);
  if (providedOtpHash !== user.phone_otp_code_hash) {
    const nextAttempts = attempts + 1;

    await supabaseAdmin
      .from("users")
      .update({ phone_otp_attempts: nextAttempts })
      .eq("id", user.id);

    authLog("otp_verify_result", {
      userId: user.id,
      normalizedPhone,
      success: false,
      attemptsUsed: nextAttempts,
      attemptsRemaining: Math.max(OTP_MAX_ATTEMPTS - nextAttempts, 0),
    });

    throw appError(400, "Invalid OTP", "OTP_INVALID", {
      attemptsUsed: nextAttempts,
      attemptsRemaining: Math.max(OTP_MAX_ATTEMPTS - nextAttempts, 0),
    });
  }

  const now = new Date().toISOString();
  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      phone: normalizedPhone,
      phone_verified: true,
      phone_otp_verified_at: now,
      phone_otp_code_hash: null,
      phone_otp_expires_at: null,
      phone_otp_attempts: 0,
    })
    .eq("id", user.id)
    .select(
      "id, email, phone, role, address, profile_completed, phone_verified",
    )
    .single();

  if (updateError || !updatedUser) {
    throw appError(500, "Failed to verify OTP", "OTP_VERIFY_FAILED");
  }

  authLog("otp_verify_result", {
    userId: updatedUser.id,
    normalizedPhone,
    success: true,
  });

  const token = issueAccessToken(updatedUser);
  return {
    token,
    user: sanitizeUser(updatedUser),
    alreadyVerified: false,
    nextStep: updatedUser.profile_completed ? "home" : "complete_profile",
  };
}

export async function resendCustomerOtp({ phone }) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    throw appError(400, "Invalid phone format", "INVALID_PHONE");
  }

  const user = await findUserByPhone(normalizedPhone, {
    role: "customer",
    selectFields: CUSTOMER_AUTH_SELECT,
    logTag: "otp_resend_lookup_result",
  });

  if (!user) {
    throw appError(404, "Customer signup record not found", "USER_NOT_FOUND");
  }

  if (user.phone_verified) {
    throw appError(400, "Phone already verified", "PHONE_ALREADY_VERIFIED");
  }

  if (user.phone_otp_last_sent_at) {
    const diffSeconds = Math.floor(
      (Date.now() - new Date(user.phone_otp_last_sent_at).getTime()) / 1000,
    );

    if (diffSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
      throw appError(
        429,
        `Please wait ${OTP_RESEND_COOLDOWN_SECONDS - diffSeconds}s before requesting another OTP`,
        "OTP_RESEND_COOLDOWN",
        {
          retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS - diffSeconds,
        },
      );
    }
  }

  const otpMeta = await updateOtpForUser(user.id, normalizedPhone);
  return {
    phone: normalizedPhone,
    ...otpMeta,
  };
}

export async function loginUser({ identifier, password }) {
  const trimmedIdentifier = String(identifier || "").trim();
  const loginByEmail = trimmedIdentifier.includes("@");
  let user = null;

  if (loginByEmail) {
    const email = trimmedIdentifier.toLowerCase();
    const { data, error } = await supabaseAdmin
      .from("users")
      .select(LOGIN_SELECT)
      .ilike("email", email)
      .maybeSingle();

    if (error) {
      throw appError(500, "Failed to query user", "DB_QUERY_FAILED");
    }

    user = data;
  } else {
    if (!isSriLankaPhone(trimmedIdentifier)) {
      throw appError(
        400,
        "Identifier must be a valid email or Sri Lankan phone number",
        "INVALID_IDENTIFIER",
      );
    }

    const normalizedPhone = normalizeSriLankaPhone(trimmedIdentifier);
    if (!normalizedPhone) {
      throw appError(400, "Invalid phone format", "INVALID_PHONE");
    }

    user = await findUserByPhone(normalizedPhone, {
      selectFields: LOGIN_SELECT,
      logTag: "login_lookup_result",
    });
  }

  authLog("login_lookup_result", {
    identifierType: loginByEmail ? "email" : "phone",
    found: Boolean(user),
    userId: user?.id || null,
    role: user?.role || null,
  });

  if (!user || !user.password_hash) {
    throw appError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    throw appError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  if (user.role === "customer" && !user.phone_verified) {
    throw appError(
      403,
      "Phone is not verified yet. Please complete OTP verification.",
      "PHONE_NOT_VERIFIED",
      { phone: user.phone },
    );
  }

  const token = issueAccessToken(user);
  return {
    token,
    user: sanitizeUser(user),
    nextStep:
      user.role === "customer" && !user.profile_completed
        ? "complete_profile"
        : "home",
  };
}

export async function completeCustomerProfile({
  userId,
  name,
  email,
  password,
  city,
  address,
  latitude,
  longitude,
}) {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPassword = String(password || "");
  const normalizedCity = String(city || "").trim();
  const normalizedAddress = address.trim();
  const normalizedLatitude = Number(latitude);
  const normalizedLongitude = Number(longitude);

  async function ensureLegacyUserRow() {
    const { error: upsertError } = await supabaseAdmin.from("users").upsert(
      {
        id: userId,
        role: "customer",
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      throw appError(
        500,
        "Failed to initialize user record",
        "USER_INIT_FAILED",
        {
          dbMessage: upsertError.message,
          dbHint: upsertError.hint || null,
          dbDetails: upsertError.details || null,
          dbCode: upsertError.code || null,
        },
      );
    }
  }

  async function insertCustomerProfile() {
    const generatedUsername = normalizedName || `user_${userId.slice(0, 8)}`;
    return supabaseAdmin
      .from("customers")
      .insert({
        id: userId,
        username: generatedUsername,
        email: normalizedEmail,
        phone: normalizedPhone,
        city: normalizedCity,
        address: normalizedAddress,
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, username, email, phone, city, address, latitude, longitude")
      .single();
  }

  const { data: authUserData, error: authUserError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (authUserError || !authUserData?.user) {
    throw appError(404, "User not found", "USER_NOT_FOUND");
  }

  const authUser = authUserData.user;
  const role = authUser.user_metadata?.role || "customer";
  if (role !== "customer") {
    throw appError(
      403,
      "Only customer profile can be completed here",
      "FORBIDDEN_ROLE",
    );
  }

  if (!authUser.phone_confirmed_at) {
    throw appError(
      403,
      "Phone verification required before profile completion",
      "PHONE_NOT_VERIFIED",
    );
  }

  const normalizedPhone = normalizeSriLankaPhone(authUser.phone || "");
  if (!normalizedPhone) {
    throw appError(
      400,
      "Verified phone number is required in auth.users",
      "AUTH_PHONE_MISSING",
    );
  }

  const { data: duplicateEmail, error: duplicateError } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("email", normalizedEmail)
    .neq("id", userId)
    .maybeSingle();

  if (duplicateError) {
    throw appError(500, "Failed to validate email", "DB_QUERY_FAILED", {
      dbMessage: duplicateError.message,
      dbHint: duplicateError.hint || null,
      dbDetails: duplicateError.details || null,
      dbCode: duplicateError.code || null,
    });
  }

  if (duplicateEmail) {
    throw appError(409, "Email is already in use", "DUPLICATE_EMAIL");
  }

  // Set email/password in auth.users first so customer can log in with email+password.
  const { error: authCredsUpdateError } =
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: normalizedEmail,
      password: normalizedPassword,
      email_confirm: true,
    });

  if (authCredsUpdateError) {
    throw appError(
      500,
      "Failed to update auth credentials",
      "AUTH_CREDENTIALS_UPDATE_FAILED",
      {
        providerMessage: authCredsUpdateError.message,
        providerStatus: authCredsUpdateError.status || null,
      },
    );
  }

  // Keep a compatibility row in public.users because customers.id has FK dependency.
  await ensureLegacyUserRow();

  const { data: existingProfile, error: existingProfileError } =
    await supabaseAdmin
      .from("customers")
      .select("id, username")
      .eq("id", userId)
      .maybeSingle();

  if (existingProfileError) {
    throw appError(500, "Failed to read customer profile", "DB_QUERY_FAILED", {
      dbMessage: existingProfileError.message,
      dbHint: existingProfileError.hint || null,
      dbDetails: existingProfileError.details || null,
      dbCode: existingProfileError.code || null,
    });
  }

  let customerProfile;

  if (existingProfile) {
    const { data: updatedProfile, error: updateProfileError } =
      await supabaseAdmin
        .from("customers")
        .update({
          username: normalizedName,
          email: normalizedEmail,
          city: normalizedCity,
          address: normalizedAddress,
          phone: normalizedPhone,
          latitude: normalizedLatitude,
          longitude: normalizedLongitude,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select(
          "id, username, email, phone, city, address, latitude, longitude",
        )
        .single();

    if (updateProfileError || !updatedProfile) {
      throw appError(
        500,
        "Failed to complete profile",
        "PROFILE_UPDATE_FAILED",
        {
          dbMessage: updateProfileError?.message || null,
          dbHint: updateProfileError?.hint || null,
          dbDetails: updateProfileError?.details || null,
          dbCode: updateProfileError?.code || null,
        },
      );
    }

    customerProfile = updatedProfile;
  } else {
    let { data: insertedProfile, error: insertProfileError } =
      await insertCustomerProfile();

    // In some environments a stale/missing public.users row can still race; upsert and retry once.
    if (
      insertProfileError?.code === "23503" &&
      String(insertProfileError?.message || "").includes("customers_id_fkey")
    ) {
      await ensureLegacyUserRow();
      const retry = await insertCustomerProfile();
      insertedProfile = retry.data;
      insertProfileError = retry.error;
    }

    if (insertProfileError || !insertedProfile) {
      throw appError(
        500,
        "Failed to create customer profile",
        "PROFILE_CREATE_FAILED",
        {
          dbMessage: insertProfileError?.message || null,
          dbHint: insertProfileError?.hint || null,
          dbDetails: insertProfileError?.details || null,
          dbCode: insertProfileError?.code || null,
        },
      );
    }

    customerProfile = insertedProfile;
  }

  const mergedMetadata = {
    ...(authUser.user_metadata || {}),
    role,
    email: normalizedEmail,
    name: normalizedName,
    city: normalizedCity,
    address: normalizedAddress,
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    profile_completed: true,
  };

  const { data: updatedAuthData, error: updatedAuthError } =
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: mergedMetadata,
    });

  if (updatedAuthError) {
    throw appError(
      500,
      "Failed to update auth user metadata",
      "AUTH_USER_UPDATE_FAILED",
      {
        providerMessage: updatedAuthError.message,
        providerStatus: updatedAuthError.status || null,
      },
    );
  }

  const updatedAuthUser = updatedAuthData?.user || {
    ...authUser,
    user_metadata: mergedMetadata,
  };

  const { error: legacyUpdateError } = await supabaseAdmin
    .from("users")
    .update({
      role: "customer",
      email: normalizedEmail,
      phone: normalizedPhone,
      profile_completed: true,
    })
    .eq("id", userId);

  if (legacyUpdateError) {
    throw appError(
      500,
      "Failed to finalize user record",
      "USER_FINALIZE_FAILED",
      {
        dbMessage: legacyUpdateError.message,
        dbHint: legacyUpdateError.hint || null,
        dbDetails: legacyUpdateError.details || null,
        dbCode: legacyUpdateError.code || null,
      },
    );
  }

  return {
    id: userId,
    role,
    name: customerProfile.username || normalizedName || null,
    email:
      customerProfile.email ||
      updatedAuthUser.email ||
      mergedMetadata.email ||
      null,
    phone: normalizedPhone,
    city: customerProfile.city || normalizedCity || null,
    address: customerProfile.address || mergedMetadata.address || null,
    latitude: customerProfile.latitude ?? mergedMetadata.latitude ?? null,
    longitude: customerProfile.longitude ?? mergedMetadata.longitude ?? null,
    phoneVerified: Boolean(updatedAuthUser.phone_confirmed_at),
    profileCompleted: true,
  };
}

export async function getCurrentUser(userId) {
  const { data: authUserData, error: authUserError } =
    await supabaseAdmin.auth.admin.getUserById(userId);
  const authUser = authUserError ? null : authUserData?.user || null;

  const { data: userRow, error: userRowError } = await supabaseAdmin
    .from("users")
    .select("id, role, email, phone")
    .eq("id", userId)
    .maybeSingle();

  if (userRowError) {
    throw appError(500, "Failed to fetch user role", "DB_QUERY_FAILED", {
      dbMessage: userRowError.message,
      dbHint: userRowError.hint || null,
      dbDetails: userRowError.details || null,
      dbCode: userRowError.code || null,
    });
  }

  if (!authUser && !userRow) {
    throw appError(404, "User not found", "USER_NOT_FOUND");
  }

  const { data: customerProfile, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("id, username, email, phone, city, address, latitude, longitude")
    .eq("id", userId)
    .maybeSingle();

  if (customerError) {
    throw appError(500, "Failed to fetch customer profile", "DB_QUERY_FAILED", {
      dbMessage: customerError.message,
      dbHint: customerError.hint || null,
      dbDetails: customerError.details || null,
      dbCode: customerError.code || null,
    });
  }

  const role = userRow?.role || authUser?.user_metadata?.role || "customer";

  let roleProfile = null;
  if (role === "admin") {
    const { data, error } = await supabaseAdmin
      .from("admins")
      .select("email, phone, profile_completed, admin_status, verified")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw appError(500, "Failed to fetch admin profile", "DB_QUERY_FAILED", {
        dbMessage: error.message,
        dbHint: error.hint || null,
        dbDetails: error.details || null,
        dbCode: error.code || null,
      });
    }

    roleProfile = data;
  } else if (role === "driver") {
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select("email, phone, address, city, profile_completed, driver_status")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw appError(500, "Failed to fetch driver profile", "DB_QUERY_FAILED", {
        dbMessage: error.message,
        dbHint: error.hint || null,
        dbDetails: error.details || null,
        dbCode: error.code || null,
      });
    }

    roleProfile = data;
  } else if (role === "manager") {
    let managerResult = await supabaseAdmin
      .from("managers")
      .select("email, mobile_number")
      .eq("user_id", userId)
      .maybeSingle();

    if (
      managerResult.error &&
      isMissingColumnError(managerResult.error, "mobile_number")
    ) {
      managerResult = await supabaseAdmin
        .from("managers")
        .select("email, phone")
        .eq("user_id", userId)
        .maybeSingle();
    }

    if (managerResult.error) {
      throw appError(
        500,
        "Failed to fetch manager profile",
        "DB_QUERY_FAILED",
        {
          dbMessage: managerResult.error.message,
          dbHint: managerResult.error.hint || null,
          dbDetails: managerResult.error.details || null,
          dbCode: managerResult.error.code || null,
        },
      );
    }

    roleProfile = managerResult.data
      ? {
          ...managerResult.data,
          phone:
            managerResult.data.phone ||
            managerResult.data.mobile_number ||
            null,
        }
      : null;
  }

  const resolvedProfileCompleted =
    role === "customer"
      ? Boolean(authUser?.user_metadata?.profile_completed || customerProfile)
      : typeof roleProfile?.profile_completed === "boolean"
        ? roleProfile.profile_completed
        : true;

  const resolvedPhoneVerified =
    role === "customer"
      ? Boolean(
          authUser?.phone_confirmed_at ||
          authUser?.user_metadata?.phone_verified,
        )
      : true;

  return {
    id: authUser?.id || userRow?.id || userId,
    role,
    name: customerProfile?.username || authUser?.user_metadata?.name || null,
    email:
      roleProfile?.email ||
      customerProfile?.email ||
      userRow?.email ||
      authUser?.email ||
      authUser?.user_metadata?.email ||
      null,
    phone:
      normalizeSriLankaPhone(
        authUser?.phone ||
          roleProfile?.phone ||
          customerProfile?.phone ||
          userRow?.phone ||
          "",
      ) || null,
    address:
      roleProfile?.address ||
      customerProfile?.address ||
      authUser?.user_metadata?.address ||
      null,
    city:
      roleProfile?.city ||
      customerProfile?.city ||
      authUser?.user_metadata?.city ||
      null,
    latitude:
      customerProfile?.latitude ?? authUser?.user_metadata?.latitude ?? null,
    longitude:
      customerProfile?.longitude ?? authUser?.user_metadata?.longitude ?? null,
    phoneVerified: resolvedPhoneVerified,
    profileCompleted: resolvedProfileCompleted,
    adminStatus: roleProfile?.admin_status || null,
    driverStatus: roleProfile?.driver_status || null,
    verified:
      typeof roleProfile?.verified === "boolean" ? roleProfile.verified : null,
  };
}

export { appError, normalizeSriLankaPhone };
