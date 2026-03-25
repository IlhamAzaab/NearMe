import { useEffect, useRef } from "react";
import {
  getAuthFieldsFromToken,
  isAccessTokenExpired,
} from "../auth/tokenStorage";
import { useTokenRefresh } from "../hooks/useTokenRefresh";
import { setApiAuthReady, resetRefreshFailureCount } from "../lib/apiClient";

const VISIBILITY_DEBOUNCE_MS = 3000; // Increased from 2000 for more stability
const VISIBILITY_COOLDOWN_MS = 10000; // Minimum time between visibility-triggered refreshes

function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

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
 * - Handles visibility changes with proper debouncing and network checks
 */
export default function TokenRefreshManager({ onAuthReadyChange }) {
  const visibilityDebounceTimerRef = useRef(null);
  const lastVisibilityRefreshAtRef = useRef(0);
  const isBootstrappingRef = useRef(false);
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
      if (isBootstrappingRef.current) return;
      isBootstrappingRef.current = true;

      markReady(false);

      const token = localStorage.getItem("token");
      if (!token) {
        markReady(true);
        isBootstrappingRef.current = false;
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
        // Wait for network to be available before attempting refresh
        if (!isOnline()) {
          console.log("[AUTH] Offline during bootstrap, skipping refresh");
          if (!cancelled) {
            markReady(true);
          }
          isBootstrappingRef.current = false;
          return;
        }

        const refreshed = await refreshToken({ force: true, bypassCooldown: true });

        if (!refreshed) {
          console.log("[AUTH] Initial refresh failed, will retry on visibility change");
        }
      }

      if (!cancelled) {
        markReady(true);
      }
      isBootstrappingRef.current = false;
    };

    void bootstrapAuth();

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      // Check if we have a token to refresh
      const token = localStorage.getItem("token");
      if (!token) {
        return;
      }

      // Check network status - don't attempt refresh if offline
      if (!isOnline()) {
        console.log("[AUTH] Visibility change: offline, skipping refresh");
        return;
      }

      const now = Date.now();

      // Increased cooldown to prevent refresh storms
      if (now - lastVisibilityRefreshAtRef.current < VISIBILITY_COOLDOWN_MS) {
        console.log("[AUTH] Visibility change: within cooldown, skipping");
        return;
      }

      // Clear any pending debounce timer
      if (visibilityDebounceTimerRef.current) {
        window.clearTimeout(visibilityDebounceTimerRef.current);
      }

      // Reset failure counter on visibility change - gives user a fresh start
      resetRefreshFailureCount();

      // Debounce the refresh to avoid rapid fire during page transitions
      visibilityDebounceTimerRef.current = window.setTimeout(async () => {
        // Re-check conditions after debounce
        if (!isOnline()) {
          console.log("[AUTH] Visibility refresh: went offline during debounce");
          return;
        }

        const currentToken = localStorage.getItem("token");
        if (!currentToken) {
          return;
        }

        lastVisibilityRefreshAtRef.current = Date.now();
        console.log("[AUTH] Visibility change: attempting refresh");

        await refreshToken();
      }, VISIBILITY_DEBOUNCE_MS);
    };

    // Listen to online event to attempt refresh when coming back online
    const onOnline = () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      console.log("[AUTH] Network online, will attempt refresh");

      // Reset failure counter when coming back online
      resetRefreshFailureCount();

      // Schedule a refresh after a short delay to let connection stabilize
      if (visibilityDebounceTimerRef.current) {
        window.clearTimeout(visibilityDebounceTimerRef.current);
      }

      visibilityDebounceTimerRef.current = window.setTimeout(() => {
        const now = Date.now();
        if (now - lastVisibilityRefreshAtRef.current >= VISIBILITY_COOLDOWN_MS) {
          lastVisibilityRefreshAtRef.current = now;
          void refreshToken();
        }
      }, VISIBILITY_DEBOUNCE_MS);
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (visibilityDebounceTimerRef.current) {
        window.clearTimeout(visibilityDebounceTimerRef.current);
      }
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [onAuthReadyChange, refreshToken]);

  // This component doesn't render anything
  return null;
}
