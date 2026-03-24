import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";
import {
  clearStoredAuthSession,
  getRefreshToken,
  persistAuthSession,
} from "../auth/tokenStorage";
import { isNetworkLikeError } from "../lib/apiClient";

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

function parseJwtExpiryMs(token) {
  try {
    const [, payload] = String(token).split(".");
    if (!payload) return null;

    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (!decoded?.exp) return null;

    return Number(decoded.exp) * 1000;
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token, thresholdMs = REFRESH_WINDOW_MS) {
  const expiryMs = parseJwtExpiryMs(token);
  if (!expiryMs) return true;
  return expiryMs - Date.now() <= thresholdMs;
}

/**
 * Hook to manage token refresh for production-level session persistence.
 * Works for all roles: customer, admin, driver, manager.
 *
 * Features:
 * - Refreshes session on app load and periodically in background
 * - Uses httpOnly cookie refresh on web and body refresh token fallback on mobile
 * - Logs out only when refresh is explicitly rejected (401/403)
 * - Preserves session on transient network/server errors
 *
 * @param {object} options - Configuration options
 * @param {boolean} options.enabled - Whether to enable the hook (default: true)
 * @param {string} options.redirectPath - Path to redirect on logout (default: "/login")
 */
export function useTokenRefresh(options = {}) {
  const { enabled = true, redirectPath = "/login" } = options;
  const navigate = useNavigate();

  const refreshToken = useCallback(async ({ force = false } = {}) => {
    const token = localStorage.getItem("token");
    if (!token) return false;

    // Avoid unnecessary refresh calls while access token is still healthy.
    if (!force && !isTokenExpiringSoon(token)) {
      return true;
    }

    try {
      const mobileRefreshToken = await getRefreshToken();
      const res = await fetch(`${API_URL}/auth/refresh-token`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          mobileRefreshToken ? { refreshToken: mobileRefreshToken } : {},
        ),
      });

      if (res.ok) {
        const data = await res.json();
        await persistAuthSession(data);
        return true;
      }

      if (res.status === 401 || res.status === 403) {
        // Only force logout when current access token is already expired/expiring.
        // This prevents false logouts when refresh cookie is unavailable.
        const latestToken = localStorage.getItem("token");
        if (!latestToken || isTokenExpiringSoon(latestToken, 0)) {
          await clearStoredAuthSession();
          navigate(redirectPath);
        }
      }

      return false;
    } catch (error) {
      // Preserve local auth state when backend/network is temporarily unavailable.
      if (isNetworkLikeError(error)) {
        return false;
      }

      return false;
    }
  }, [navigate, redirectPath]);

  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled, refreshToken]);

  return { refreshToken };
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
