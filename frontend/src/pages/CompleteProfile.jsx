import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import SiteHeader from "../components/SiteHeader";
import {
  completeProfile,
  getPostAuthRoute,
  persistSession,
} from "../services/authService";

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { alert, visible, showError, showSuccess } = useAlert();

  const [email, setEmail] = useState(
    searchParams.get("email") || localStorage.getItem("userEmail") || "",
  );
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "customer") {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      showError("Email is required");
      return;
    }

    if (!address.trim()) {
      showError("Address is required");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      showError("Session expired. Please login again.");
      navigate("/login", { replace: true });
      return;
    }

    setLoading(true);

    try {
      const updatedUser = await completeProfile({
        email,
        address,
        token,
      });

      persistSession({
        token,
        user: updatedUser,
      });

      showSuccess("Profile completed successfully");
      setLoading(false);
      navigate(getPostAuthRoute(updatedUser), { replace: true });
    } catch (error) {
      console.error("Complete profile error:", error);
      showError(error.message || "Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <AnimatedAlert alert={alert} visible={visible} />

      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Complete Profile</h1>
          <p className="text-sm text-gray-600 mb-6">
            Add your email and delivery address to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                id="address"
                rows={4}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="No 10, Main Street, Colombo"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-70"
            >
              {loading ? "Saving..." : "Save & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
