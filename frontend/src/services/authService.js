import { API_URL } from "../config";
import { isPhoneLikeIdentifier, normalizeSriLankaPhone } from "../utils/phone";
import { isRealtimeAvailable, supabaseClient } from "../supabaseClient";

const AUTH_STORAGE_KEYS = {
  token: "token",
  role: "role",
  userId: "userId",
  userEmail: "userEmail",
  userPhone: "userPhone",
  profileCompleted: "profileCompleted",
};

function isNetworkError(error) {
  if (!error) {
    return false;
  }

  const message = String(error?.message || "").toLowerCase();
  return (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("err_connection_refused")
  );
}

function getStoredSessionUser() {
  const id = localStorage.getItem(AUTH_STORAGE_KEYS.userId);
  const role = localStorage.getItem(AUTH_STORAGE_KEYS.role);
  if (!id || !role) {
    return null;
  }

  const profileCompletedRaw = localStorage.getItem(
    AUTH_STORAGE_KEYS.profileCompleted,
  );
  const parsedProfileCompleted =
    profileCompletedRaw === "true"
      ? true
      : profileCompletedRaw === "false"
        ? false
        : role !== "customer";

  return {
    id,
    role,
    email: localStorage.getItem(AUTH_STORAGE_KEYS.userEmail) || null,
    phone: localStorage.getItem(AUTH_STORAGE_KEYS.userPhone) || null,
    profileCompleted: parsedProfileCompleted,
  };
}

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
  if (typeof user?.profileCompleted === "boolean") {
    localStorage.setItem(
      AUTH_STORAGE_KEYS.profileCompleted,
      String(user.profileCompleted),
    );
  }
}

export function clearSession() {
  Object.values(AUTH_STORAGE_KEYS).forEach((key) =>
    localStorage.removeItem(key),
  );
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

  if (
    message.includes("invalid api key") ||
    message.includes("invalid apikey")
  ) {
    return "Supabase API key is invalid in frontend environment. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) in Vercel Project Settings -> Environment Variables, then redeploy.";
  }

  if (
    code === "phone_provider_disabled" ||
    message.includes("unsupported phone provider")
  ) {
    return "Phone OTP is not enabled in Supabase. Enable Phone provider and configure Send SMS Hook in Supabase Authentication settings.";
  }

  if (code === "validation_failed" && message.includes("phone")) {
    return "Invalid phone number format. Use Sri Lankan format like 0771234567.";
  }

  if (
    message.includes("failed to reach hook") ||
    message.includes("unexpected status code returned from hook")
  ) {
    return "SMS hook timeout/failure detected. Check backend deploy status, SUPABASE_SMS_HOOK_SECRET, and SMSLENZ env values on Render.";
  }

  if (message.includes("hook requires authorization token")) {
    return "Supabase Send SMS hook is not signed correctly. Regenerate the hook secret in Supabase Hooks and set the same full value (v1,whsec_...) in Render SUPABASE_SMS_HOOK_SECRET.";
  }

  if (
    message.includes("invalid signature") ||
    message.includes("signature") ||
    message.includes("standard webhook")
  ) {
    return "Supabase hook signature verification failed. Ensure backend uses raw body + Standard Webhooks verification and that Supabase/Render secrets match exactly.";
  }

  if (
    message.includes("invalid hook secret") ||
    message.includes("unauthorized")
  ) {
    return "Send SMS Hook secret mismatch. Use Supabase-generated full secret (v1,whsec_...) and set the exact same value in Render SUPABASE_SMS_HOOK_SECRET.";
  }

  return error?.message || fallbackMessage;
}

export async function signupStart({ phone }) {
  if (!isRealtimeAvailable()) {
    throw new Error(
      "Supabase environment is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY), then redeploy.",
    );
  }

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
    throw new Error(
      mapSupabasePhoneAuthError(error, "OTP verification failed"),
    );
  }

  if (!data?.session?.access_token || !data?.user) {
    throw new Error(
      "OTP verification succeeded but no active session was returned",
    );
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

async function loginCustomerWithSupabase({ identifier, password }) {
  const email = String(identifier || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Customer login requires email and password");
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message || "Invalid email or password");
  }

  const token = data?.session?.access_token;
  if (!token) {
    throw new Error("Login failed. Missing session token.");
  }

  let user = normalizeSupabaseUser(data.user);
  try {
    user = await getMe(token);
  } catch {
    // Keep Supabase user fallback when profile API is temporarily unavailable.
  }

  return {
    token,
    user,
    nextStep:
      user?.role === "customer" && !user?.profileCompleted
        ? "complete_profile"
        : "home",
  };
}

async function loginLegacyRole({ identifier, password }) {
  const trimmedIdentifier = String(identifier || "").trim();
  const normalizedIdentifier = isPhoneLikeIdentifier(trimmedIdentifier)
    ? normalizeSriLankaPhone(trimmedIdentifier)
    : trimmedIdentifier.toLowerCase();

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifier: normalizedIdentifier,
      email: normalizedIdentifier,
      password,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Login failed");
  }

  return {
    token: payload?.token,
    user: {
      id: payload?.userId || null,
      role: payload?.role || null,
      email: normalizedIdentifier.includes("@") ? normalizedIdentifier : null,
      phone: null,
      profileCompleted: Boolean(payload?.profileCompleted),
    },
    nextStep: payload?.profileCompleted ? "home" : "complete_profile",
  };
}

export async function login({ identifier, password, role = "customer" }) {
  if (role === "customer") {
    return loginCustomerWithSupabase({ identifier, password });
  }

  return loginLegacyRole({ identifier, password });
}

export async function completeProfile({
  email,
  address,
  password,
  latitude,
  longitude,
  token,
}) {
  return authRequest("/auth/complete-profile", {
    method: "POST",
    token,
    body: {
      email: email.trim().toLowerCase(),
      address: address.trim(),
      password: String(password || ""),
      latitude,
      longitude,
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
    await supabaseClient.auth.signOut().catch(() => {
      // Ignore Supabase sign-out failures and still clear local app session.
    });
    clearSession();
  }
}

export async function restoreSessionFromToken() {
  const token = localStorage.getItem(AUTH_STORAGE_KEYS.token);

  if (token) {
    try {
      const user = await getMe(token);
      persistSession({ token, user });
      return { restored: true, user };
    } catch (error) {
      if (isNetworkError(error)) {
        const fallbackUser = getStoredSessionUser();
        if (fallbackUser) {
          return { restored: true, user: fallbackUser };
        }
      }

      // Try Supabase persisted session fallback before clearing user state.
    }
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    const supabaseToken = data?.session?.access_token;

    if (error || !supabaseToken) {
      const fallbackUser = getStoredSessionUser();
      if (fallbackUser && token) {
        return { restored: true, user: fallbackUser };
      }

      clearSession();
      return { restored: false, user: null };
    }

    let user;
    try {
      user = await getMe(supabaseToken);
    } catch (meError) {
      if (!isNetworkError(meError)) {
        throw meError;
      }

      const fallbackUser = getStoredSessionUser();
      if (!fallbackUser) {
        throw meError;
      }

      persistSession({ token: supabaseToken, user: fallbackUser });
      return { restored: true, user: fallbackUser };
    }

    persistSession({ token: supabaseToken, user });
    return { restored: true, user };
  } catch {
    clearSession();
    return { restored: false, user: null };
  }
}
