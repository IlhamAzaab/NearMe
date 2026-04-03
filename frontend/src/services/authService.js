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

function isTransientSessionError(error) {
  if (isNetworkError(error)) {
    return true;
  }

  const status = Number(error?.status);
  if (!Number.isFinite(status)) {
    return false;
  }

  return status === 408 || status === 425 || status === 429 || status >= 500;
}

let restoreSessionInFlight = null;

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
  return "/";
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

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="),
    );
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isSupabaseAccessToken(token) {
  const payload = decodeJwtPayload(token);
  const issuer = String(payload?.iss || "").toLowerCase();
  return issuer.includes("/auth/v1");
}

async function exchangeSessionToken(token) {
  if (!token) {
    throw new Error("Missing session token");
  }

  const data = await authRequest("/auth/session/exchange", {
    method: "POST",
    token,
    body: {},
  });

  if (!data?.token || !data?.user) {
    throw new Error("Failed to establish authenticated app session");
  }

  return data;
}

async function ensureSessionExchangeAvailable() {
  const response = await fetch(`${API_URL}/auth/session/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  // 401/400 means route exists (token missing/invalid), which is expected.
  if (response.status === 401 || response.status === 400) {
    return;
  }

  if (response.status === 404) {
    throw new Error(
      "Auth session endpoint is unavailable (404). Restart backend from NearMe/backend before verifying OTP.",
    );
  }
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

  const otpResponse = await fetch(`${API_URL}/auth/phone/request-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone: normalizedPhone }),
  });

  const otpPayload = await otpResponse.json().catch(() => ({}));

  if (!otpResponse.ok) {
    throw new Error(
      otpPayload?.message || "Unable to send OTP. Please try again.",
    );
  }

  return {
    phone: normalizedPhone,
    serverMessage: otpPayload?.message || "OTP sent successfully",
  };
}

export async function verifyOtp({ phone, otp }) {
  await ensureSessionExchangeAvailable();

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

  const exchanged = await exchangeSessionToken(data.session.access_token);
  const user = exchanged.user;

  return {
    token: exchanged.token,
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

  const response = await fetch(`${API_URL}/auth/phone/request-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone: normalizedPhone }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || "Failed to resend OTP");
  }

  return {
    phone: normalizedPhone,
    serverMessage: payload?.message || "OTP resent successfully",
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

  const supabaseToken = data?.session?.access_token;
  if (!supabaseToken) {
    throw new Error("Login failed. Missing session token.");
  }

  const exchanged = await exchangeSessionToken(supabaseToken);
  const user = exchanged.user;

  return {
    token: exchanged.token,
    user,
    nextStep:
      user?.role === "customer" && !user?.profileCompleted
        ? "complete_profile"
        : "home",
  };
}

async function loginCustomerWithPhone({ identifier, password }) {
  const normalizedPhone = normalizeSriLankaPhone(identifier);
  if (!normalizedPhone) {
    throw new Error("Enter a valid Sri Lankan phone number");
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    phone: normalizedPhone,
    password,
  });

  if (error) {
    throw new Error(error.message || "Invalid phone number or password");
  }

  const supabaseToken = data?.session?.access_token;
  if (!supabaseToken) {
    throw new Error("Login failed. Missing session token.");
  }

  const exchanged = await exchangeSessionToken(supabaseToken);
  const user = exchanged.user;

  if (user?.role && user.role !== "customer") {
    throw new Error("Phone login is available only for customer accounts.");
  }

  const customerUser = {
    ...(user || {}),
    role: "customer",
  };

  return {
    token: exchanged.token,
    user: customerUser,
    nextStep: !customerUser?.profileCompleted ? "complete_profile" : "home",
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
    token: payload?.token || payload?.access_token,
    user: {
      id: payload?.userId || null,
      role: payload?.role || null,
      email: normalizedIdentifier.includes("@") ? normalizedIdentifier : null,
      phone: null,
      profileCompleted: Boolean(payload?.profileCompleted),
    },
    nextStep:
      payload?.role === "customer" && !payload?.profileCompleted
        ? "complete_profile"
        : "home",
  };
}

export async function login({ identifier, password }) {
  const trimmedIdentifier = String(identifier || "").trim();

  if (isPhoneLikeIdentifier(trimmedIdentifier)) {
    return loginCustomerWithPhone({ identifier: trimmedIdentifier, password });
  }

  const normalizedEmail = trimmedIdentifier.toLowerCase();

  if (!normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email or Sri Lankan phone number");
  }

  try {
    return await loginCustomerWithSupabase({
      identifier: normalizedEmail,
      password,
    });
  } catch (customerError) {
    // Non-customer roles still authenticate via legacy backend login route.
    return loginLegacyRole({ identifier: normalizedEmail, password });
  }
}

export async function completeProfile({
  name,
  email,
  city,
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
      name: String(name || "").trim(),
      email: email.trim().toLowerCase(),
      city: String(city || "").trim(),
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
  if (restoreSessionInFlight) {
    return restoreSessionInFlight;
  }

  restoreSessionInFlight = (async () => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.token);

    if (token) {
      try {
        const user = await getMe(token);

        if (isSupabaseAccessToken(token)) {
          try {
            const exchanged = await exchangeSessionToken(token);
            persistSession({ token: exchanged.token, user: exchanged.user });
            return { restored: true, user: exchanged.user };
          } catch {
            // Keep temporary compatibility with existing stored tokens.
          }
        }

        persistSession({ token, user });
        return { restored: true, user };
      } catch (error) {
        if (isTransientSessionError(error)) {
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
        const exchanged = await exchangeSessionToken(supabaseToken);
        user = exchanged.user;
        persistSession({ token: exchanged.token, user });
        return { restored: true, user };
      } catch (meError) {
        if (!isTransientSessionError(meError)) {
          throw meError;
        }

        const fallbackUser = getStoredSessionUser();
        if (!fallbackUser) {
          throw meError;
        }

        persistSession({ token: supabaseToken, user: fallbackUser });
        return { restored: true, user: fallbackUser };
      }
    } catch (error) {
      if (isTransientSessionError(error)) {
        const fallbackUser = getStoredSessionUser();
        if (fallbackUser && token) {
          return { restored: true, user: fallbackUser };
        }
      }

      clearSession();
      return { restored: false, user: null };
    }
  })();

  try {
    return await restoreSessionInFlight;
  } finally {
    restoreSessionInFlight = null;
  }
}
