import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

export default function AdminDashboardRoute({ children }) {
  const [allowed, setAllowed] = useState(true); // Start optimistic
  const [redirectTo, setRedirectTo] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "admin") {
      setAllowed(false);
      setRedirectTo("/admin/profile");
      return;
    }

    const checkProfile = async () => {
      try {
        const res = await fetch(
          "http://localhost:5000/restaurant-onboarding/status",
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();

        if (res.ok) {
          if (data.force_password_change) {
            setAllowed(false);
            setRedirectTo("/admin/profile");
          } else if (!data.onboarding_completed) {
            setAllowed(false);
            setRedirectTo(
              `/admin/restaurant/onboarding/step-${data.onboarding_step || 1}`,
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
      }
    };

    checkProfile();
  }, []);

  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return children;
}
