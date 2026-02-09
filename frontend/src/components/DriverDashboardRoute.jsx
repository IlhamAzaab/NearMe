import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { API_URL } from "../config";

export default function DriverDashboardRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [redirectTo, setRedirectTo] = useState("/login");

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "driver") {
      setAllowed(false);
      setLoading(false);
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
          setLoading(false);
          return;
        }

        // For server errors or not-found, allow access anyway
        // (the driver is authenticated, just a transient DB issue)
        if (!res.ok) {
          console.warn("Driver /me returned", res.status, "- allowing access");
          setAllowed(true);
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (data.driver) {
          // Check password change
          if (data.driver.force_password_change) {
            setAllowed(false);
            setRedirectTo("/driver/profile");
          }
          // Check onboarding completion
          else if (!data.driver.onboarding_completed) {
            setAllowed(false);
            setRedirectTo(
              `/driver/onboarding/step-${data.driver.onboarding_step || 1}`,
            );
          }
          // Check if driver is pending approval (not yet approved by admin)
          // Only redirect to pending page if status is 'pending' (awaiting admin approval)
          // 'inactive' and 'active' drivers can access dashboard
          else if (data.driver.driver_status === "pending") {
            setAllowed(false);
            setRedirectTo("/driver/pending");
          }
          // Check if driver is suspended or rejected
          else if (
            data.driver.driver_status === "suspended" ||
            data.driver.driver_status === "rejected"
          ) {
            setAllowed(false);
            setRedirectTo("/driver/pending");
          }
          // All checks passed - allow active AND inactive drivers to access dashboard
          // Inactive drivers can view dashboard but can't accept deliveries
          else {
            setAllowed(true);
          }
        } else {
          // Response OK but no driver data - still allow (transient issue)
          console.warn("Driver /me returned OK but no driver data");
          setAllowed(true);
        }
      } catch (e) {
        console.error("Driver profile check error:", e);
        // Network error - don't clear credentials, just allow access
        // The dashboard will handle its own error states
        setAllowed(true);
      } finally {
        setLoading(false);
      }
    };

    checkProfile();
  }, []);

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
