import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteHeader from "../../components/SiteHeader";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import DriverLayout from "../../components/DriverLayout";
import { API_URL } from "../../config";

export default function DriverProfile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [userName, setUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setRawError] = useState(null);
  const [message, setRawMessage] = useState(null);
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();

  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };
  const setMessage = (msg) => {
    setRawMessage(msg);
    if (msg) showSuccess(msg);
  };

  const userEmail = localStorage.getItem("userEmail");
  const displayName = localStorage.getItem("userName") || "Driver";

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "driver") {
      navigate("/login");
      return;
    }

    fetchProfile();
  }, [navigate]);

  const fetchProfile = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${API_URL}/driver/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Only redirect on clear authentication errors
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        navigate("/login");
        return;
      }

      if (!res.ok) {
        setError("Failed to load profile. Please try again.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.driver) {
        if (data.driver.profile_completed) {
          navigate("/driver/dashboard");
          return;
        }
        setProfile(data.driver);
      } else {
        setError("Failed to load profile");
      }
    } catch (e) {
      console.error("Profile fetch error:", e);
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!userName.trim()) {
      setError("Username is required");
      return;
    }

    if (userName.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }

    if (!newPassword) {
      setError("Password is required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    const token = localStorage.getItem("token");
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/driver/update-profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userName: userName.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage("Password updated! Redirecting to onboarding...");
        setTimeout(() => navigate("/driver/onboarding/step-1"), 1200);
      } else {
        setError(data?.message || "Failed to update profile");
      }
    } catch (e) {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <DriverLayout>
      <div className="bg-gray-50">
        <SiteHeader
          isLoggedIn={true}
          role="driver"
          userName={displayName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />

        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <h1 className="text-2xl font-bold text-gray-800">
            Complete Your Profile
          </h1>
          <p className="text-gray-600 mt-2">
            Choose a username and change your temporary password to proceed.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-6 bg-white rounded-xl shadow p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (read-only)
              </label>
              <input
                className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50"
                value={profile?.email || ""}
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username *
              </label>
              <input
                type="text"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Choose a unique username"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
                minLength={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password *
              </label>
              <input
                type="password"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password *
              </label>
              <input
                type="password"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <AnimatedAlert alert={alertState} visible={alertVisible} />

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ <strong>Note:</strong> Username and password cannot be
                changed later. Your onboarding details will be collected next.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
            >
              {saving ? "Saving..." : "Save & Continue"}
            </button>
          </form>
        </main>
      </div>
    </DriverLayout>
  );
}
