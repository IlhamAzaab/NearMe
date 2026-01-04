import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";

export default function AdminProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    newPassword: "",
    confirmPassword: "",
  });

  const userEmail = localStorage.getItem("userEmail");

  useEffect(() => {
    // Check if password change is required
    const checkStatus = async () => {
      const token = localStorage.getItem("token");
      try {
        const res = await fetch("http://localhost:5000/admin/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.admin) {
          setForcePasswordChange(data.admin.force_password_change);

          // If password change not required and onboarding not complete, redirect
          if (
            !data.admin.force_password_change &&
            !data.admin.onboarding_completed
          ) {
            navigate(
              `/admin/restaurant/onboarding/step-${
                data.admin.onboarding_step || 1
              }`
            );
          }
          // If everything complete, go to dashboard
          else if (
            !data.admin.force_password_change &&
            data.admin.onboarding_completed &&
            data.admin.admin_status === "active"
          ) {
            navigate("/admin/dashboard");
          }
        }
      } catch (e) {
        console.error("Profile check error:", e);
      }
    };
    checkStatus();
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (!formData.username.trim()) {
      setError("Username is required");
      return;
    }

    if (formData.newPassword.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const token = localStorage.getItem("token");

    try {
      const res = await fetch("http://localhost:5000/admin/change-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: formData.username,
          newPassword: formData.newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          navigate("/admin/restaurant/onboarding/step-1");
        }, 1500);
      } else {
        setError(data.message || "Failed to change password");
      }
    } catch (e) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader
        isLoggedIn={true}
        role="admin"
        userName={userEmail?.split("@")[0]}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {forcePasswordChange ? "Change Your Password" : "Admin Profile"}
          </h1>

          {forcePasswordChange && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Password Change Required</strong>
                <br />
                For security reasons, you must change your temporary password
                before proceeding.
              </p>
            </div>
          )}

          <p className="text-gray-600 mb-6">
            Please set a new secure password for your account.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username *
              </label>
              <input
                type="text"
                name="username"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Choose a username"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password *
              </label>
              <input
                type="password"
                name="newPassword"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Enter new password (min 6 characters)"
                value={formData.newPassword}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Re-enter new password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                ✓ Password changed successfully! Redirecting to restaurant
                onboarding...
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Password Requirements:</strong>
                <ul className="list-disc list-inside mt-1">
                  <li>Minimum 6 characters</li>
                  <li>Use a mix of letters, numbers, and symbols</li>
                  <li>Avoid common words or patterns</li>
                </ul>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
            >
              {loading ? "Changing Password..." : "Change Password & Continue"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
