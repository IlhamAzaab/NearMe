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
];

const REFRESH_RETRY_DELAY_MS = 1000;
const MAX_CONSECUTIVE_REFRESH_FAILURES = 3;

let isInitialized = false;
let isRefreshing = false;
let refreshPromise = null;
let latestAccessToken = null;
let nativeBrowserFetch = null;
let consecutiveRefreshFailures = 0;

let apiAuthReady = false;
let apiAuthReadyPromise = Promise.resolve();
let resolveApiAuthReady = null;

function isApiRequest(url) {
  return typeof url === "string" && url.startsWith(API_URL);
}

function isAuthBypassEndpoint(url) {
  if (typeof url !== "string") return false;
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/signup") ||
    url.includes("/auth/verify-otp") ||
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
  return (
    normalized.includes("invalid or expired refresh token") ||
    normalized.includes("invalid refresh token") ||
    normalized.includes("invalid refresh token type") ||
    normalized.includes("refresh token missing") ||
    normalized.includes("user no longer exists")
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

async function refreshAccessToken(nativeFetch) {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();

    const headers = {
      "Content-Type": "application/json",
    };

    if (refreshToken) {
      headers.Authorization = `Bearer ${refreshToken}`;
    }

    const requestBody = refreshToken ? { refreshToken } : {};

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      console.log("[AUTH] Refresh attempt", { attempt });

      let refreshRes;
      try {
        refreshRes = await nativeFetch(`${API_URL}/auth/refresh-token`, {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify(requestBody),
        });
      } catch (networkError) {
        if (attempt < 2) {
          console.log("[AUTH] Refresh failed, retrying...");
          await sleep(REFRESH_RETRY_DELAY_MS);
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

      if (attempt < 2 && !explicitInvalid) {
        console.log("[AUTH] Refresh failed, retrying...");
        await sleep(REFRESH_RETRY_DELAY_MS);
        continue;
      }

      consecutiveRefreshFailures += 1;
      const shouldLogout =
        explicitInvalid ||
        consecutiveRefreshFailures >= MAX_CONSECUTIVE_REFRESH_FAILURES;

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

export async function refreshAccessTokenWithLock() {
  if (typeof window === "undefined") {
    return { ok: false, status: 500 };
  }

  const fetchToUse = nativeBrowserFetch || window.fetch.bind(window);
  return refreshAccessToken(fetchToUse);
}
