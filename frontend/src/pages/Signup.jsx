import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import { API_URL } from "../config";

export default function Signup() {
  const navigate = useNavigate();
  const { alert, visible, showError } = useAlert();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const email = formData.email.trim().toLowerCase();
    const password = formData.password;

    if (!email || !password) {
      showError("Email and password are required");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      showError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(data?.message || "Signup failed");
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        email,
        userId: data?.userId || "",
      });
      if (data?.pendingLoginToken) {
        params.set("pendingLoginToken", data.pendingLoginToken);
      }
      navigate(`/auth/verify-pending?${params.toString()}`);
    } catch (error) {
      console.error("Signup error:", error);
      showError("Network error. Please try again.");
      setLoading(false);
      return;
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg p-8">
        <AnimatedAlert alert={alert} visible={visible} />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Create account
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Sign up with email verification.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Password</label>
            <input
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3"
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-green-600 text-white py-3 font-semibold disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="w-full mt-3 rounded-xl bg-gray-100 text-gray-700 py-3 font-medium"
        >
          Already have an account? Login
        </button>
      </div>
    </div>
  );
}
