import { API_URL } from "../config";
import { clearStoredAuthSession, getAccessToken } from "../auth/tokenStorage";

const NETWORK_ERROR_MESSAGES = [
  "Failed to fetch",
  "NetworkError",
  "Load failed",
  "Network request failed",
  "net::ERR_",
  "NS_ERROR_",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
];

let isInitialized = false;
let latestAccessToken = null;

function isApiRequest(url) {
  return typeof url === "string" && url.startsWith(API_URL);
}

function isAuthBypassEndpoint(url) {
  if (typeof url !== "string") return false;
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/signup") ||
    url.includes("/auth/verify-email") ||
    url.includes("/auth/verify-otp") ||
    url.includes("/auth/resend-verification-email") ||
    url.includes("/auth/verify-token") ||
    url.includes("/auth/check-email-verified") ||
    url.includes("/auth/confirm-email")
  );
}

function setLatestAccessToken(token) {
  latestAccessToken = token || null;
}

async function resolveLatestAccessToken() {
  const token = await getAccessToken();
  setLatestAccessToken(token);
  return token;
}

export function isNetworkLikeError(error) {
  const message = String(error?.message || "");
  return NETWORK_ERROR_MESSAGES.some((msg) => message.includes(msg));
}

const EXPLICIT_AUTH_FAILURE_CODES = new Set([
  "auth_token_invalid",
  "auth_token_expired",
  "invalid_token",
  "token_invalid",
  "token_expired",
]);

function isExplicitAuthFailureMessage(message = "") {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("invalid or expired token") ||
    normalized.includes("jwt expired") ||
    normalized.includes("invalid token") ||
    normalized.includes("token expired")
  );
}

async function shouldForceLogoutFor401(response) {
  try {
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    const code = String(body?.code || "")
      .trim()
      .toLowerCase();
    const message = String(body?.message || "");
    return (
      (code && EXPLICIT_AUTH_FAILURE_CODES.has(code)) ||
      isExplicitAuthFailureMessage(message)
    );
  } catch {
    return false;
  }
}

function emitAuthFailure() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("auth:logout", {
      detail: { reason: "invalid_or_expired_token" },
    }),
  );
}

function isCustomerOnboardingInProgress() {
  if (typeof window === "undefined") return false;

  const role = window.localStorage.getItem("role");
  const profileCompleted = window.localStorage.getItem("profileCompleted");
  return role === "customer" && profileCompleted === "false";
}

export function initializeApiAuthInterceptor() {
  if (isInitialized || typeof window === "undefined" || !window.fetch) return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);

    if (!isApiRequest(requestUrl)) {
      return nativeFetch(input, init);
    }

    const canAttachAuth = !isAuthBypassEndpoint(requestUrl);
    const headers = new Headers(
      input instanceof Request ? input.headers : init.headers,
    );

    if (canAttachAuth) {
      const accessToken = await resolveLatestAccessToken();
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
    }

    const request = new Request(input, {
      ...init,
      headers,
      credentials: "include",
    });

    const response = await nativeFetch(request);

    if (!canAttachAuth || response.status !== 401) {
      return response;
    }

    // Preserve session for transient/ambiguous 401 responses.
    const shouldLogout = await shouldForceLogoutFor401(response);
    if (!shouldLogout) {
      return response;
    }

    // During OTP -> complete-profile onboarding we intentionally allow
    // temporary 401s from non-onboarding endpoints without killing session.
    if (isCustomerOnboardingInProgress()) {
      return response;
    }

    await clearStoredAuthSession();
    setLatestAccessToken(null);
    emitAuthFailure();
    return response;
  };

  isInitialized = true;
}

// Compatibility exports kept as no-ops for legacy imports.
export function setApiAuthReady() {}

export async function waitForApiAuthReady() {}

export async function refreshAccessTokenWithLock() {
  return {
    ok: false,
    status: 410,
    reason: "refresh_removed",
    shouldLogout: false,
  };
}

export function resetRefreshFailureCount() {}

export function getRefreshState() {
  return {
    isRefreshing: false,
    isOnline:
      typeof navigator === "undefined" ? true : navigator.onLine !== false,
  };
}
