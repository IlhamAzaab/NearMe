import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { API_URL } from "../config";

const DRIVER_GUARD_CACHE_TTL_MS = 5 * 60 * 1000;

const getDriverGuardCacheKey = () => {
  const userId = localStorage.getItem("userId") || "default";
  return `driver_guard_cache_${userId}`;
};

const readDriverGuardCache = () => {
  try {
    const raw = localStorage.getItem(getDriverGuardCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.cachedAt) return null;
    if (Date.now() - parsed.cachedAt > DRIVER_GUARD_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeDriverGuardCache = (payload) => {
  try {
    localStorage.setItem(
      getDriverGuardCacheKey(),
      JSON.stringify({ ...payload, cachedAt: Date.now() }),
    );
  } catch {
    // Ignore cache write failures.
  }
};

export default function DriverDashboardRoute({ children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const cachedGuard = readDriverGuardCache();

  const [loading, setLoading] = useState(
    () => !!token && role === "driver" && !cachedGuard,
  );
  const [allowed, setAllowed] = useState(
    () => cachedGuard?.allowed ?? (!!token && role === "driver"),
  );
  const [redirectTo, setRedirectTo] = useState(
    () => cachedGuard?.redirectTo || "/login",
  );

  useEffect(() => {
    if (!token || role !== "driver") {
      setAllowed(false);
      setLoading(false);
      setRedirectTo("/login");
      return;
    }

    const checkProfile = async () => {
      try {
        const res = await fetch(`${API_URL}/driver/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Only redirect to login on clear authentication errors
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("token");
          localStorage.removeItem("role");
          setRedirectTo("/login");
          setAllowed(false);
          writeDriverGuardCache({ allowed: false, redirectTo: "/login" });
          setLoading(false);
          return;
        }

        // For server errors or not-found, allow access anyway
        // (the driver is authenticated, just a transient DB issue)
        if (!res.ok) {
          console.warn("Driver /me returned", res.status, "- allowing access");
          setAllowed(true);
          writeDriverGuardCache({
            allowed: true,
            redirectTo: "/driver/dashboard",
          });
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (data.driver) {
          // Check password change
          if (data.driver.force_password_change) {
            setAllowed(false);
            setRedirectTo("/driver/profile");
            writeDriverGuardCache({
              allowed: false,
              redirectTo: "/driver/profile",
            });
          }
          // Check onboarding completion
          else if (!data.driver.onboarding_completed) {
            setAllowed(false);
            const onboardingPath = `/driver/onboarding/step-${data.driver.onboarding_step || 1}`;
            setRedirectTo(onboardingPath);
            writeDriverGuardCache({
              allowed: false,
              redirectTo: onboardingPath,
            });
          }
          // Check if driver is pending approval (not yet approved by admin)
          // Only redirect to pending page if status is 'pending' (awaiting admin approval)
          // 'inactive' and 'active' drivers can access dashboard
          else if (data.driver.driver_status === "pending") {
            setAllowed(false);
            setRedirectTo("/driver/pending");
            writeDriverGuardCache({
              allowed: false,
              redirectTo: "/driver/pending",
            });
          }
          // Check if driver is suspended or rejected
          else if (
            data.driver.driver_status === "suspended" ||
            data.driver.driver_status === "rejected"
          ) {
            setAllowed(false);
            setRedirectTo("/driver/pending");
            writeDriverGuardCache({
              allowed: false,
              redirectTo: "/driver/pending",
            });
          }
          // All checks passed - allow active AND inactive drivers to access dashboard
          // Inactive drivers can view dashboard but can't accept deliveries
          else {
            setAllowed(true);
            writeDriverGuardCache({
              allowed: true,
              redirectTo: "/driver/dashboard",
            });
          }
        } else {
          // Response OK but no driver data - still allow (transient issue)
          console.warn("Driver /me returned OK but no driver data");
          setAllowed(true);
          writeDriverGuardCache({
            allowed: true,
            redirectTo: "/driver/dashboard",
          });
        }
      } catch (e) {
        console.error("Driver profile check error:", e);
        // Network error - don't clear credentials, just allow access
        // The dashboard will handle its own error states
        setAllowed(true);
        writeDriverGuardCache({
          allowed: true,
          redirectTo: "/driver/dashboard",
        });
      } finally {
        setLoading(false);
      }
    };

    checkProfile();
  }, [token, role]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!allowed) return <Navigate to={redirectTo} />;

  return children;
}
