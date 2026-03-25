import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearStoredAuthSession,
  getAuthFieldsFromToken,
} from "../auth/tokenStorage";
import {
  isNetworkLikeError,
  refreshAccessTokenWithLock,
  resetRefreshFailureCount,
} from "../lib/apiClient";

const REFRESH_WINDOW_MS = 5 * 60 * 1000;
const MIN_REFRESH_INTERVAL_MS = 5000; // Minimum 5 seconds between refresh attempts

function isTokenExpiringSoon(token, thresholdMs = REFRESH_WINDOW_MS) {
  const expiryMs = getAuthFieldsFromToken(token)?.expiresAtMs;
  if (!expiryMs) return true;
  return expiryMs - Date.now() <= thresholdMs;
}

function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/**
 * Hook to manage token refresh for production-level session persistence.
 * Works for all roles: customer, admin, driver, manager.
 *
 * Features:
 * - Refreshes session on app load and periodically in background
 * - Uses httpOnly cookie refresh on web and body refresh token fallback on mobile
 * - Logs out only when refresh is explicitly rejected (invalid token, user deleted)
 * - Preserves session on transient network/server errors
 * - Rate limits refresh attempts to prevent storms
 *
 * @param {object} options - Configuration options
 * @param {boolean} options.enabled - Whether to enable the hook (default: true)
 * @param {string} options.redirectPath - Path to redirect on logout (default: "/login")
 */
export function useTokenRefresh(options = {}) {
  const {
    enabled = true,
    redirectPath = "/login",
    disableAutoInterval = false,
  } = options;
  const navigate = useNavigate();
  const lastRefreshAttemptRef = useRef(0);
  const isRefreshingRef = useRef(false);

  const refreshToken = useCallback(
    async ({ force = false, bypassCooldown = false } = {}) => {
      const token = localStorage.getItem("token");
      if (!token) {
        console.log("[AUTH] No token found, skipping refresh");
        return false;
      }

      // Check if we're online
      if (!isOnline()) {
        console.log("[AUTH] Offline, skipping refresh");
        return false;
      }

      // Rate limiting - prevent refresh storms
      const now = Date.now();
      if (!bypassCooldown && now - lastRefreshAttemptRef.current < MIN_REFRESH_INTERVAL_MS) {
        console.log("[AUTH] Refresh rate limited");
        return false;
      }

      // Avoid unnecessary refresh calls while access token is still healthy.
      if (!force && !isTokenExpiringSoon(token)) {
        return true;
      }

      // Prevent concurrent refresh attempts from this hook
      if (isRefreshingRef.current) {
        console.log("[AUTH] Already refreshing from hook");
        return false;
      }

      try {
        isRefreshingRef.current = true;
        lastRefreshAttemptRef.current = now;

        const refreshResult = await refreshAccessTokenWithLock({ bypassCooldown });

        // Handle cooldown response - not a real failure
        if (!refreshResult.ok && refreshResult.reason === "cooldown") {
          return false;
        }

        // Handle offline response - not a real failure
        if (!refreshResult.ok && refreshResult.reason === "offline") {
          return false;
        }

        if (refreshResult.ok) {
          const latestToken = localStorage.getItem("token");
          const decoded = getAuthFieldsFromToken(latestToken);
          if (decoded?.role) {
            console.log("[AUTH] Role set:", decoded.role);
          }
          return true;
        }

        if (refreshResult.shouldLogout) {
          console.log("[AUTH] Logging out user due to:", refreshResult.reason);
          await clearStoredAuthSession();
          navigate(redirectPath);
          return false;
        }

        // Non-fatal failure - don't logout, just log
        console.log("[AUTH] Refresh failed (non-fatal):", refreshResult.reason);
        return false;
      } catch (error) {
        // Preserve local auth state when backend/network is temporarily unavailable.
        if (isNetworkLikeError(error)) {
          console.log("[AUTH] Network error during refresh, preserving session");
          return false;
        }

        console.error("[AUTH] Unexpected refresh error:", error);
        return false;
      } finally {
        isRefreshingRef.current = false;
      }
    },
    [navigate, redirectPath],
  );

  useEffect(() => {
    if (!enabled || disableAutoInterval) return;

    // Check token on mount; refresh only when it is close to expiry.
    refreshToken();

    // Refresh periodically to keep long sessions active without user action.
    const interval = setInterval(
      () => {
        refreshToken();
      },
      12 * 60 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [enabled, refreshToken, disableAutoInterval]);

  return { refreshToken, resetRefreshFailureCount };
}

/**
 * Utility function to check if user is authenticated
 * Can be used outside of React components
 * @returns {object} - { isAuthenticated, token, role, userId, payload }
 */
export function getAuthState() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const userId = localStorage.getItem("userId");

  if (!token || token === "null" || token === "undefined") {
    return {
      isAuthenticated: false,
      token: null,
      role: null,
      userId: null,
      payload: null,
    };
  }

  return {
    isAuthenticated: true,
    token,
    role: role || null,
    userId: userId || null,
    payload: null,
  };
}

/**
 * Utility function to clear auth session
 */
export function clearAuthSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  void clearStoredAuthSession();
}

export default useTokenRefresh;
