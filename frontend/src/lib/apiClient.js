import { API_URL } from "../config";
import {
  clearStoredAuthSession,
  getAccessToken,
  getRefreshToken,
  persistAuthSession,
} from "../auth/tokenStorage";

const NETWORK_ERROR_MESSAGES = [
  "Failed to fetch",
  "NetworkError",
  "Load failed",
  "Network request failed",
];

let isInitialized = false;
let refreshPromise = null;

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

export function isNetworkLikeError(error) {
  const message = String(error?.message || "");
  return NETWORK_ERROR_MESSAGES.some((msg) => message.includes(msg));
}

async function refreshAccessToken(nativeFetch) {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getRefreshToken();
      const isWebRuntime =
        typeof window !== "undefined" && typeof window.localStorage !== "undefined";

      const refreshRes = await nativeFetch(`${API_URL}/auth/refresh-token`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          !isWebRuntime && refreshToken ? { refreshToken } : {},
        ),
      });

      if (!refreshRes.ok) {
        return { ok: false, status: refreshRes.status };
      }

      const refreshData = await refreshRes.json();
      await persistAuthSession(refreshData);
      return { ok: true, status: refreshRes.status };
    })()
      .catch((error) => {
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
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
      const accessToken = await getAccessToken();
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
        if (refreshResult.status === 401 || refreshResult.status === 403) {
          await clearStoredAuthSession();
          emitAuthFailure();
        }
        return response;
      }
    } catch (error) {
      // If refresh itself fails due network, preserve session and retry later.
      if (isNetworkLikeError(error)) {
        return response;
      }

      await clearStoredAuthSession();
      emitAuthFailure();
      return response;
    }

    const retryHeaders = new Headers(
      input instanceof Request ? input.headers : init.headers,
    );
    const latestToken = await getAccessToken();
    if (latestToken) {
      retryHeaders.set("Authorization", `Bearer ${latestToken}`);
    }

    const retryRequest = new Request(input, {
      ...init,
      headers: retryHeaders,
      credentials: "include",
    });

    return nativeFetch(retryRequest);
  };

  isInitialized = true;
}
