import { useEffect, useState } from "react";

export default function AdminRestaurantPending() {
  const token = localStorage.getItem("token");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch(
          "http://localhost:5000/restaurant-onboarding/status",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await res.json();
        if (res.ok) setStatus(data);
      } catch (e) {
        console.error("Pending status error", e);
      } finally {
        setLoading(false);
      }
    };
    loadStatus();
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-white shadow rounded-xl p-6 text-center">
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">
          Your restaurant is under review
        </h1>
        <p className="text-gray-600 mb-4">
          A manager will verify your details and activate your account. You will
          be notified once approved.
        </p>
        {loading && <p className="text-sm text-gray-500">Loading status...</p>}
        {!loading && status && (
          <div className="bg-gray-50 border rounded-lg p-4 text-left text-sm text-gray-700">
            <p>
              <span className="font-semibold">Onboarding Step:</span>{" "}
              {status.onboarding_step}
            </p>
            <p>
              <span className="font-semibold">Admin Status:</span>{" "}
              {status.admin_status}
            </p>
            {status.restaurant && (
              <p>
                <span className="font-semibold">Restaurant Status:</span>{" "}
                {status.restaurant.restaurant_status}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
