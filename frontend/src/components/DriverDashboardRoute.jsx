import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

export default function DriverDashboardRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [redirectTo, setRedirectTo] = useState("/driver/profile");

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
        const res = await fetch("http://localhost:5000/driver/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.driver) {
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
          setAllowed(false);
        }
      } catch (e) {
        console.error("Driver profile check error:", e);
        setAllowed(false);
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
