import { API_URL } from "../config";
import {
  clearStoredAuthSession,
  getAccessToken,
  getRefreshToken,
  getAuthFieldsFromToken,
  persistAuthSession,
} from "../auth/tokenStorage";

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

const REFRESH_RETRY_DELAY_MS = 1000;
const MAX_CONSECUTIVE_REFRESH_FAILURES = 5; // Increased tolerance
const REFRESH_COOLDOWN_MS = 3000; // Minimum time between refresh attempts
const NETWORK_RECOVERY_DELAY_MS = 2000; // Wait after network recovery

let isInitialized = false;
let isRefreshing = false;
let refreshPromise = null;
let latestAccessToken = null;
let nativeBrowserFetch = null;
let consecutiveRefreshFailures = 0;
let lastRefreshAttemptTime = 0;
let networkWasOffline = false;

let apiAuthReady = false;
let apiAuthReadyPromise = Promise.resolve();
let resolveApiAuthReady = null;

function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

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
    url.includes("/auth/refresh-token") ||
    url.includes("/auth/verify-token")
  );
}

function setLatestAccessToken(token) {
  latestAccessToken = token || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExplicitInvalidRefresh(message = "") {
  const normalized = String(message || "").toLowerCase();
  // Only treat as explicitly invalid when:
  // 1. Token is actually invalid/expired (user needs to re-login)
  // 2. User no longer exists
  // Do NOT include "refresh token missing" here - that's often transient
  return (
    normalized.includes("invalid or expired refresh token") ||
    normalized.includes("invalid refresh token") ||
    normalized.includes("invalid refresh token type") ||
    normalized.includes("user no longer exists") ||
    normalized.includes("refresh role mismatch")
  );
}

function isTransientRefreshError(message = "") {
  const normalized = String(message || "").toLowerCase();
  // These errors are often transient and should NOT trigger immediate logout
  return (
    normalized.includes("refresh token missing") ||
    normalized.includes("failed to refresh") ||
    normalized.includes("server error") ||
    normalized === ""
  );
}

export function setApiAuthReady(isReady) {
  apiAuthReady = !!isReady;

  if (!apiAuthReady) {
    apiAuthReadyPromise = new Promise((resolve) => {
      resolveApiAuthReady = resolve;
    });
    return;
  }

  if (resolveApiAuthReady) {
    resolveApiAuthReady();
    resolveApiAuthReady = null;
  }
}

export async function waitForApiAuthReady() {
  if (apiAuthReady) return;
  await apiAuthReadyPromise;
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

async function refreshAccessToken(nativeFetch, options = {}) {
  const { bypassCooldown = false } = options;

  // Cooldown check - prevent rapid refresh attempts
  const now = Date.now();
  if (!bypassCooldown && now - lastRefreshAttemptTime < REFRESH_COOLDOWN_MS) {
    console.log("[AUTH] Refresh skipped (cooldown active)");
    return {
      ok: false,
      status: 0,
      reason: "cooldown",
      shouldLogout: false,
    };
  }

  // Check online status
  if (!isOnline()) {
    console.log("[AUTH] Refresh skipped (offline)");
    networkWasOffline = true;
    return {
      ok: false,
      status: 0,
      reason: "offline",
      shouldLogout: false,
    };
  }

  // If we just came back online, wait a bit for connection to stabilize
  if (networkWasOffline) {
    console.log("[AUTH] Network recovered, waiting for connection to stabilize...");
    networkWasOffline = false;
    await sleep(NETWORK_RECOVERY_DELAY_MS);
  }

  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  lastRefreshAttemptTime = now;

  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();

    const headers = {
      "Content-Type": "application/json",
    };

    const expectedRole =
      (typeof window !== "undefined" && window.localStorage
        ? window.localStorage.getItem("role")
        : null) || null;

    if (expectedRole) {
      headers["x-expected-role"] = expectedRole;
    }

    if (refreshToken) {
      headers.Authorization = `Bearer ${refreshToken}`;
    }

    const requestBody = refreshToken ? { refreshToken } : {};

    // Increase retries for more resilience
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log("[AUTH] Refresh attempt", { attempt });

      // Re-check online status before each attempt
      if (!isOnline()) {
        console.log("[AUTH] Went offline during refresh");
        return {
          ok: false,
          status: 0,
          reason: "offline",
          shouldLogout: false,
        };
      }

      let refreshRes;
      try {
        refreshRes = await nativeFetch(`${API_URL}/auth/refresh-token`, {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify(requestBody),
        });
      } catch (networkError) {
        console.log("[AUTH] Refresh network error:", networkError.message);

        if (attempt < 3) {
          console.log("[AUTH] Refresh failed, retrying...");
          await sleep(REFRESH_RETRY_DELAY_MS * attempt); // Exponential backoff
          continue;
        }

        return {
          ok: false,
          status: 0,
          reason: "network_error",
          shouldLogout: false,
          error: networkError,
        };
      }

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        await persistAuthSession(refreshData);

        const nextToken = await getAccessToken();
        setLatestAccessToken(nextToken);
        consecutiveRefreshFailures = 0;

        const decoded = getAuthFieldsFromToken(nextToken);
        console.log("[AUTH] Refresh success");
        if (decoded?.role) {
          console.log("[AUTH] Role set:", decoded.role);
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("auth:token_refreshed", {
              detail: {
                token: nextToken,
                role: decoded?.role || null,
                userId: decoded?.userId || null,
              },
            }),
          );
        }

        return { ok: true, status: refreshRes.status, shouldLogout: false };
      }

      const failureBody = await refreshRes.json().catch(() => ({}));
      const failureMessage = String(failureBody?.message || "");
      const explicitInvalid = isExplicitInvalidRefresh(failureMessage);
      const isTransient = isTransientRefreshError(failureMessage);

      console.log("[AUTH] Refresh response:", {
        status: refreshRes.status,
        message: failureMessage,
        explicitInvalid,
        isTransient
      });

      // Only retry if it's not an explicit invalid token error
      if (attempt < 3 && !explicitInvalid) {
        console.log("[AUTH] Refresh failed, retrying...");
        await sleep(REFRESH_RETRY_DELAY_MS * attempt);
        continue;
      }

      consecutiveRefreshFailures += 1;

      // Only logout if:
      // 1. Token is explicitly invalid (not just missing or transient error)
      // 2. OR we've had many consecutive failures (indicating persistent auth issue)
      const shouldLogout =
        explicitInvalid ||
        (consecutiveRefreshFailures >= MAX_CONSECUTIVE_REFRESH_FAILURES && !isTransient);

      if (shouldLogout) {
        console.log("[AUTH] Will logout:", {
          explicitInvalid,
          consecutiveRefreshFailures,
          isTransient
        });
      }

      return {
        ok: false,
        status: refreshRes.status,
        reason: explicitInvalid ? "invalid_refresh_token" : "refresh_failed",
        shouldLogout,
        message: failureMessage,
      };
    }

    return {
      ok: false,
      status: 500,
      reason: "refresh_failed",
      shouldLogout: false,
    };
  })();

  try {
    return await refreshPromise;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

function emitAuthFailure() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("auth:logout", {
      detail: { reason: "refresh_failed" },
    }),
  );
}

export function initializeApiAuthInterceptor() {
  if (isInitialized || typeof window === "undefined" || !window.fetch) return;

  const nativeFetch = window.fetch.bind(window);
  nativeBrowserFetch = nativeFetch;

  // Set up network status listeners
  window.addEventListener("online", () => {
    console.log("[AUTH] Network online");
    networkWasOffline = true; // Will trigger stabilization delay on next refresh
  });

  window.addEventListener("offline", () => {
    console.log("[AUTH] Network offline");
    networkWasOffline = true;
  });

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

    if (canAttachAuth) {
      await waitForApiAuthReady();
    }

    const headers = new Headers(
      input instanceof Request ? input.headers : init.headers,
    );

    if (canAttachAuth) {
      const accessToken = await resolveLatestAccessToken();
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
    }

    const firstRequest = new Request(input, {
      ...init,
      headers,
      credentials: "include",
    });

    let response;

    try {
      response = await nativeFetch(firstRequest);
    } catch (error) {
      // Keep session alive during temporary network/backend outages.
      throw error;
    }

    if (!canAttachAuth || response.status !== 401) {
      return response;
    }

    try {
      const refreshResult = await refreshAccessToken(nativeFetch);

      if (!refreshResult.ok) {
        if (refreshResult.shouldLogout) {
          console.log("[AUTH] Logging out user");
          await clearStoredAuthSession();
          setLatestAccessToken(null);
          emitAuthFailure();
        }
        return response;
      }
    } catch (error) {
      // If refresh itself fails due network, preserve session and retry later.
      if (isNetworkLikeError(error)) {
        return response;
      }
      return response;
    }

    const retryHeaders = new Headers(
      input instanceof Request ? input.headers : init.headers,
    );
    const latestToken = await resolveLatestAccessToken();
    if (latestToken) {
      retryHeaders.set("Authorization", `Bearer ${latestToken}`);
    }

    console.log("[AUTH] Retrying request");

    const retryRequest = new Request(input, {
      ...init,
      headers: retryHeaders,
      credentials: "include",
    });

    return nativeFetch(retryRequest);
  };

  isInitialized = true;
}

export async function refreshAccessTokenWithLock(options = {}) {
  if (typeof window === "undefined") {
    return { ok: false, status: 500 };
  }

  const fetchToUse = nativeBrowserFetch || window.fetch.bind(window);
  return refreshAccessToken(fetchToUse, options);
}

export function resetRefreshFailureCount() {
  consecutiveRefreshFailures = 0;
  console.log("[AUTH] Refresh failure count reset");
}

export function getRefreshState() {
  return {
    consecutiveRefreshFailures,
    lastRefreshAttemptTime,
    isRefreshing,
    isOnline: isOnline(),
  };
}
