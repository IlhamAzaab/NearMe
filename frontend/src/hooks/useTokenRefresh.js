import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config";

/**
 * Decodes a JWT token and returns the payload
 * @param {string} token - JWT token string
 * @returns {object|null} - Decoded payload or null if invalid
 */
function decodeToken(token) {
  try {
    if (!token || token === "null" || token === "undefined") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 * @param {object} payload - Decoded JWT payload
 * @returns {boolean} - True if expired
 */
function isTokenExpired(payload) {
  if (!payload || !payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

/**
 * Check if token will expire within the specified days
 * @param {object} payload - Decoded JWT payload
 * @param {number} days - Number of days to check
 * @returns {boolean} - True if expiring within specified days
 */
function isTokenExpiringSoon(payload, days = 30) {
  if (!payload || !payload.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  const expiryThreshold = now + days * 24 * 60 * 60; // days in seconds
  return payload.exp < expiryThreshold;
}

/**
 * Hook to manage token refresh for production-level session persistence.
 * Works for all roles: customer, admin, driver, manager.
 *
 * Features:
 * - Auto-refreshes token if expiring within 30 days
 * - Refreshes on app load and every 24 hours
 * - Handles expired tokens by redirecting to login
 *
 * @param {object} options - Configuration options
 * @param {boolean} options.enabled - Whether to enable the hook (default: true)
 * @param {string} options.redirectPath - Path to redirect on logout (default: "/login")
 */
export function useTokenRefresh(options = {}) {
  const { enabled = true, redirectPath = "/login" } = options;
  const navigate = useNavigate();

  const refreshToken = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return false;

    const payload = decodeToken(token);

    // If token is already expired, clear and redirect
    if (isTokenExpired(payload)) {
      console.log("Token expired. Clearing session.");
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("userId");
      navigate(redirectPath);
      return false;
    }

    // If token is expiring within 30 days, refresh it
    if (isTokenExpiringSoon(payload, 30)) {
      try {
        console.log("Token expiring soon. Refreshing...");
        const res = await fetch(`${API_URL}/auth/refresh-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem("token", data.token);
          if (data.role) localStorage.setItem("role", data.role);
          if (data.userId) localStorage.setItem("userId", data.userId);
          console.log("Token refreshed successfully. New expiry: 180 days");
          return true;
        } else {
          // If refresh fails with 401, token is invalid
          if (res.status === 401) {
            console.log("Token refresh failed. Clearing session.");
            localStorage.removeItem("token");
            localStorage.removeItem("role");
            localStorage.removeItem("userId");
            navigate(redirectPath);
          }
          return false;
        }
      } catch (error) {
        console.error("Token refresh error:", error);
        return false;
      }
    }

    return true; // Token is still valid and not expiring soon
  }, [navigate, redirectPath]);

  useEffect(() => {
    if (!enabled) return;

    // Check and refresh token on mount
    refreshToken();

    // Set up interval to check every 24 hours
    const interval = setInterval(
      () => {
        refreshToken();
      },
      24 * 60 * 60 * 1000,
    ); // 24 hours

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

  const payload = decodeToken(token);

  if (!payload || isTokenExpired(payload)) {
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
    role: role || payload.role,
    userId: userId || payload.id,
    payload,
  };
}

/**
 * Utility function to clear auth session
 */
export function clearAuthSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
}

export default useTokenRefresh;
