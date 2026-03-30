import { API_URL } from "../config";
import { isPhoneLikeIdentifier, normalizeSriLankaPhone } from "../utils/phone";
import { supabaseClient } from "../supabaseClient";

const AUTH_STORAGE_KEYS = {
  token: "token",
  role: "role",
  userId: "userId",
  userEmail: "userEmail",
  userPhone: "userPhone",
};

async function parseApiResponse(response, { includeMeta = false } = {}) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const error = new Error(payload?.message || "Request failed");
    error.status = response.status;
    error.code = payload?.code;
    error.details = payload?.details;
    throw error;
  }
  if (includeMeta) {
    return {
      data: payload?.data,
      message: payload?.message,
      code: payload?.code,
      success: payload?.success,
    };
  }

  return payload?.data;
}

async function authRequest(path, options = {}) {
  const includeMeta = Boolean(options.includeMeta);
  const token = options.token || localStorage.getItem(AUTH_STORAGE_KEYS.token);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return parseApiResponse(response, { includeMeta });
}

export function persistSession({ token, user }) {
  if (token) {
    localStorage.setItem(AUTH_STORAGE_KEYS.token, token);
  }

  if (user?.role) {
    localStorage.setItem(AUTH_STORAGE_KEYS.role, user.role);
  }
  if (user?.id) {
    localStorage.setItem(AUTH_STORAGE_KEYS.userId, user.id);
  }
  if (user?.email) {
    localStorage.setItem(AUTH_STORAGE_KEYS.userEmail, user.email);
  }
  if (user?.phone) {
    localStorage.setItem(AUTH_STORAGE_KEYS.userPhone, user.phone);
  }
}

export function clearSession() {
  Object.values(AUTH_STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem("pendingSignupPhone");
}

export function getDashboardRouteByRole(role) {
  if (role === "admin") {
    return "/admin/dashboard";
  }
  if (role === "manager") {
    return "/manager/dashboard";
  }
  if (role === "driver") {
    return "/driver/dashboard";
  }
  return "/home";
}

export function getPostAuthRoute(user) {
  if (!user) {
    return "/login";
  }

  if (user.role === "customer" && !user.profileCompleted) {
    return "/auth/complete-profile";
  }

  return getDashboardRouteByRole(user.role);
}

function normalizeSupabaseUser(user) {
  if (!user) {
    return null;
  }

  const metadata = user.user_metadata || {};
  return {
    id: user.id,
    role: metadata.role || "customer",
    email: user.email || null,
    phone: user.phone || null,
    profileCompleted: Boolean(metadata.profile_completed),
  };
}

function mapSupabasePhoneAuthError(error, fallbackMessage) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  if (code === "phone_provider_disabled" || message.includes("unsupported phone provider")) {
    return "Phone OTP is not enabled in Supabase. Enable Phone provider and configure Send SMS Hook in Supabase Authentication settings.";
  }

  if (code === "validation_failed" && message.includes("phone")) {
    return "Invalid phone number format. Use Sri Lankan format like 0771234567.";
  }

  if (message.includes("failed to reach hook") || message.includes("unexpected status code returned from hook")) {
    return "SMS hook timeout/failure detected. Check backend deploy status, SUPABASE_SMS_HOOK_SECRET, and SMSLENZ env values on Render.";
  }

  if (message.includes("hook requires authorization token")) {
    return "Supabase Send SMS Hook auth token is missing. In Supabase Auth -> Hooks -> Send SMS, set Authorization token to the same value as SUPABASE_SMS_HOOK_SECRET.";
  }

  if (message.includes("invalid hook secret") || message.includes("unauthorized")) {
    return "Send SMS Hook secret mismatch. Ensure Supabase hook token and backend SUPABASE_SMS_HOOK_SECRET are exactly the same value.";
  }

  return error?.message || fallbackMessage;
}

export async function signupStart({ phone }) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    throw new Error("Enter a valid Sri Lankan phone number (0771234567)");
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    phone: normalizedPhone,
    options: {
      channel: "sms",
    },
  });

  if (error) {
    throw new Error(mapSupabasePhoneAuthError(error, "Failed to send OTP"));
  }

  return {
    phone: normalizedPhone,
    serverMessage: "OTP sent successfully",
  };
}

export async function verifyOtp({ phone, otp }) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    throw new Error("Invalid phone number");
  }

  const { data, error } = await supabaseClient.auth.verifyOtp({
    phone: normalizedPhone,
    token: String(otp || "").trim(),
    type: "sms",
  });

  if (error) {
    throw new Error(mapSupabasePhoneAuthError(error, "OTP verification failed"));
  }

  if (!data?.session?.access_token || !data?.user) {
    throw new Error("OTP verification succeeded but no active session was returned");
  }

  const user = normalizeSupabaseUser(data.user);

  return {
    token: data.session.access_token,
    user,
    nextStep:
      user.role === "customer" && !user.profileCompleted
        ? "complete_profile"
        : "home",
  };
}

export async function resendOtp({ phone }) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    throw new Error("Invalid phone number");
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    phone: normalizedPhone,
    options: {
      channel: "sms",
    },
  });

  if (error) {
    throw new Error(mapSupabasePhoneAuthError(error, "Failed to resend OTP"));
  }

  return {
    phone: normalizedPhone,
    serverMessage: "OTP resent successfully",
  };
}

export async function login({ identifier, password }) {
  const trimmedIdentifier = String(identifier || "").trim();
  const normalizedIdentifier = isPhoneLikeIdentifier(trimmedIdentifier)
    ? normalizeSriLankaPhone(trimmedIdentifier)
    : trimmedIdentifier.toLowerCase();

  const data = await authRequest("/auth/login", {
    method: "POST",
    body: {
      identifier: normalizedIdentifier,
      password,
    },
  });

  return data;
}

export async function completeProfile({ email, address, token }) {
  return authRequest("/auth/complete-profile", {
    method: "POST",
    token,
    body: {
      email: email.trim().toLowerCase(),
      address: address.trim(),
    },
  });
}

export async function getMe(token) {
  return authRequest("/auth/me", {
    method: "GET",
    token,
  });
}

export async function logout(token) {
  try {
    await authRequest("/auth/logout", {
      method: "POST",
      token,
      body: {},
    });
  } catch {
    // Logout is stateless; clear local session even if API is unavailable.
  } finally {
    clearSession();
  }
}

export async function restoreSessionFromToken() {
  const token = localStorage.getItem(AUTH_STORAGE_KEYS.token);
  if (!token) {
    return { restored: false, user: null };
  }

  try {
    const user = await getMe(token);
    persistSession({ token, user });
    return { restored: true, user };
  } catch {
    clearSession();
    return { restored: false, user: null };
  }
}
