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
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Animated Loading */}
        <div className="relative mb-6">
          {/* Food truck animation */}
          <div className="w-24 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg relative">
            {/* Truck body */}
            <div className="absolute -top-3 left-2 w-20 h-4 bg-orange-600 rounded-t-lg"></div>
            {/* Windows */}
            <div className="absolute top-2 left-4 w-6 h-3 bg-blue-300 rounded"></div>
            <div className="absolute top-2 left-12 w-6 h-3 bg-blue-300 rounded"></div>
            {/* Wheels */}
            <div className="absolute -bottom-2 left-4 w-5 h-5 bg-gray-800 rounded-full border-2 border-gray-900 animate-spin-slow"></div>
            <div className="absolute -bottom-2 right-4 w-5 h-5 bg-gray-800 rounded-full border-2 border-gray-900 animate-spin-slow"></div>
          </div>
          
          {/* Delivery animation line */}
          <div className="absolute top-1/2 left-full w-32 h-0.5 bg-gradient-to-r from-orange-500 to-transparent animate-pulse"></div>
        </div>
        
        <p className="text-gray-700 font-medium text-lg">Loading your dashboard...</p>
        <p className="text-gray-500 text-sm mt-2">Preparing delicious data for you</p>
        
        {/* Progress bar */}
        <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden mt-6">
          <div className="h-full bg-gradient-to-r from-orange-500 to-red-500 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!allowed) return <Navigate to={redirectTo} replace />;

  return children;
}