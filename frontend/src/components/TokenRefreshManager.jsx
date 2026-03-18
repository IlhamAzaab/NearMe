import { useTokenRefresh } from "../hooks/useTokenRefresh";

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
export default function TokenRefreshManager() {
  // Determine redirect path based on current role
  const role = localStorage.getItem("role");
  let redirectPath = "/login";

  // All roles redirect to /login on token expiry
  // The login page will handle role-specific redirects after re-authentication
  if (role === "admin") {
    redirectPath = "/login";
  } else if (role === "driver") {
    redirectPath = "/login";
  } else if (role === "manager") {
    redirectPath = "/login";
  }

  // Enable token refresh only if there's a token
  const hasToken = !!localStorage.getItem("token");

  useTokenRefresh({
    enabled: hasToken,
    redirectPath,
  });

  // This component doesn't render anything
  return null;
}
