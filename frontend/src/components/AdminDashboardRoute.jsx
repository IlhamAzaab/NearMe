import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

export default function AdminDashboardRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [redirectTo, setRedirectTo] = useState("/admin/profile");

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "admin") {
      setAllowed(false);
      setLoading(false);
      return;
    }

    const checkProfile = async () => {
      try {
        const res = await fetch(
          "http://localhost:5000/restaurant-onboarding/status",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await res.json();

        if (res.ok) {
          if (data.force_password_change) {
            setAllowed(false);
            setRedirectTo("/admin/profile");
          } else if (!data.onboarding_completed) {
            setAllowed(false);
            setRedirectTo(
              `/admin/restaurant/onboarding/step-${data.onboarding_step || 1}`
            );
          } else if (data.admin_status !== "active") {
            setAllowed(false);
            setRedirectTo("/admin/restaurant/pending");
          } else {
            setAllowed(true);
          }
        } else {
          setAllowed(false);
        }
      } catch (e) {
        console.error("Admin status check error:", e);
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

  if (!allowed) return <Navigate to={redirectTo} replace />;

  return children;
}
