import { useEffect, useRef } from "react";
import {
  getAuthFieldsFromToken,
  isAccessTokenExpired,
} from "../auth/tokenStorage";
import { useTokenRefresh } from "../hooks/useTokenRefresh";
import { setApiAuthReady } from "../lib/apiClient";

/**
 * TokenRefreshManager component
 * Handles automatic token refresh for all authenticated users.
 * Must be placed inside BrowserRouter.
 *
 * Features:
 * - Checks token validity on app load
 * - Auto-refreshes token if expiring within 30 days
 * - Runs refresh check every 24 hours
 * - Works for all roles: customer, admin, driver, manager
 */
export default function TokenRefreshManager({ onAuthReadyChange }) {
  const visibilityDebounceTimerRef = useRef(null);
  const lastVisibilityRefreshAtRef = useRef(0);
  const { refreshToken } = useTokenRefresh({
    enabled: false,
    redirectPath: "/login",
    disableAutoInterval: true,
  });

  useEffect(() => {
    let cancelled = false;

    const markReady = (isReady) => {
      setApiAuthReady(isReady);
      if (typeof onAuthReadyChange === "function") {
        onAuthReadyChange(isReady);
      }
    };

    const bootstrapAuth = async () => {
      markReady(false);

      const token = localStorage.getItem("token");
      if (!token) {
        markReady(true);
        return;
      }

      const decoded = getAuthFieldsFromToken(token);
      if (decoded?.role) {
        localStorage.setItem("role", decoded.role);
        console.log("[AUTH] Role set:", decoded.role);
      }
      if (decoded?.userId) {
        localStorage.setItem("userId", decoded.userId);
      }

      if (isAccessTokenExpired(token, 0)) {
        const refreshed = await refreshToken({ force: true });

        if (!refreshed) {
          console.log("[AUTH] Refresh failed, retrying...");
        }
      }

      if (!cancelled) {
        markReady(true);
      }
    };

    void bootstrapAuth();

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      if (now - lastVisibilityRefreshAtRef.current < 2000) {
        return;
      }

      if (visibilityDebounceTimerRef.current) {
        window.clearTimeout(visibilityDebounceTimerRef.current);
      }

      visibilityDebounceTimerRef.current = window.setTimeout(() => {
        lastVisibilityRefreshAtRef.current = Date.now();
        void refreshToken();
      }, 2000);
    };

    window.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (visibilityDebounceTimerRef.current) {
        window.clearTimeout(visibilityDebounceTimerRef.current);
      }
      window.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [onAuthReadyChange, refreshToken]);

  // This component doesn't render anything
  return null;
}
