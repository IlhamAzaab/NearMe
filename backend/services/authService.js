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
const BCRYPT_SALT_ROUNDS = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || "12", 10);
const CUSTOMER_AUTH_SELECT =
  "id, email, phone, password_hash, role, address, profile_completed, phone_verified, phone_otp_code_hash, phone_otp_expires_at, phone_otp_attempts, phone_otp_last_sent_at, phone_otp_verified_at";
const LOGIN_SELECT = "id, email, phone, role, address, profile_completed, phone_verified, password_hash";

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
  const rank = new Map(candidates.map((value, index) => [value, candidates.length - index]));

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
    throw appError(500, "Failed to normalize stored phone", "PHONE_NORMALIZE_SAVE_FAILED");
  }
}

async function findUserByPhone(phone, { role, selectFields, logTag }) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    return null;
  }

  const candidates = buildPhoneLookupCandidates(normalizedPhone);
  let query = supabaseAdmin.from("users").select(selectFields).in("phone", candidates).limit(10);
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

  const matchedUser = data?.length ? pickBestPhoneMatch(data, candidates) : null;
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
  const shouldExposeDevOtp = process.env.NODE_ENV !== "production" && smsSkipped;
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
      throw appError(409, "Phone number is already registered", "DUPLICATE_PHONE");
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
      throw appError(500, "Failed to reuse pending signup record", "USER_REUSE_FAILED");
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
    throw appError(400, "OTP not generated. Please request a new OTP.", "OTP_MISSING");
  }

  const attempts = Number(user.phone_otp_attempts || 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    throw appError(429, "Maximum OTP attempts exceeded. Please resend OTP.", "OTP_LIMIT_EXCEEDED");
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
    .select("id, email, phone, role, address, profile_completed, phone_verified")
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

export async function completeCustomerProfile({ userId, email, address }) {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedAddress = address.trim();

  const { data: authUserData, error: authUserError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (authUserError || !authUserData?.user) {
    throw appError(404, "User not found", "USER_NOT_FOUND");
  }

  const authUser = authUserData.user;
  const role = authUser.user_metadata?.role || "customer";
  if (role !== "customer") {
    throw appError(403, "Only customer profile can be completed here", "FORBIDDEN_ROLE");
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

  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
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
    const { data: updatedProfile, error: updateProfileError } = await supabaseAdmin
      .from("customers")
      .update({
        email: normalizedEmail,
        address: normalizedAddress,
        phone: normalizedPhone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id, username, email, phone, address")
      .single();

    if (updateProfileError || !updatedProfile) {
      throw appError(500, "Failed to complete profile", "PROFILE_UPDATE_FAILED", {
        dbMessage: updateProfileError?.message || null,
        dbHint: updateProfileError?.hint || null,
        dbDetails: updateProfileError?.details || null,
        dbCode: updateProfileError?.code || null,
      });
    }

    customerProfile = updatedProfile;
  } else {
    const generatedUsername = `user_${userId.slice(0, 8)}`;
    const { data: insertedProfile, error: insertProfileError } = await supabaseAdmin
      .from("customers")
      .insert({
        id: userId,
        username: generatedUsername,
        email: normalizedEmail,
        phone: normalizedPhone,
        address: normalizedAddress,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, username, email, phone, address")
      .single();

    if (insertProfileError || !insertedProfile) {
      throw appError(500, "Failed to create customer profile", "PROFILE_CREATE_FAILED", {
        dbMessage: insertProfileError?.message || null,
        dbHint: insertProfileError?.hint || null,
        dbDetails: insertProfileError?.details || null,
        dbCode: insertProfileError?.code || null,
      });
    }

    customerProfile = insertedProfile;
  }

  const mergedMetadata = {
    ...(authUser.user_metadata || {}),
    role,
    email: normalizedEmail,
    address: normalizedAddress,
    profile_completed: true,
  };

  const { data: updatedAuthData, error: updatedAuthError } =
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: mergedMetadata,
    });

  if (updatedAuthError) {
    throw appError(500, "Failed to update auth user metadata", "AUTH_USER_UPDATE_FAILED", {
      providerMessage: updatedAuthError.message,
      providerStatus: updatedAuthError.status || null,
    });
  }

  const updatedAuthUser = updatedAuthData?.user || {
    ...authUser,
    user_metadata: mergedMetadata,
  };

  return {
    id: userId,
    role,
    email: customerProfile.email || updatedAuthUser.email || mergedMetadata.email || null,
    phone: normalizedPhone,
    address: customerProfile.address || mergedMetadata.address || null,
    phoneVerified: Boolean(updatedAuthUser.phone_confirmed_at),
    profileCompleted: true,
  };
}

export async function getCurrentUser(userId) {
  const { data: authUserData, error: authUserError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (authUserError || !authUserData?.user) {
    throw appError(404, "User not found", "USER_NOT_FOUND");
  }

  const authUser = authUserData.user;
  const { data: customerProfile, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("id, email, phone, address")
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

  const role = authUser.user_metadata?.role || "customer";

  return {
    id: authUser.id,
    role,
    email:
      customerProfile?.email || authUser.email || authUser.user_metadata?.email || null,
    phone: normalizeSriLankaPhone(authUser.phone || customerProfile?.phone || "") || null,
    address: customerProfile?.address || authUser.user_metadata?.address || null,
    phoneVerified: Boolean(authUser.phone_confirmed_at),
    profileCompleted: Boolean(
      authUser.user_metadata?.profile_completed || customerProfile,
    ),
  };
}

export { appError, normalizeSriLankaPhone };
