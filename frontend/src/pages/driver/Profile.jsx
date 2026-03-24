import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { API_URL } from "../../config";

export default function DriverProfile() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [userName, setUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isProfileCompleted, setIsProfileCompleted] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    if (!token || role !== "driver") {
      navigate("/login");
      return;
    }
  }, [navigate]);

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  const {
    data: profilePayload,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["driver", "profile"],
    enabled: !!token && role === "driver",
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/driver/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.driver) {
        throw new Error(data?.message || "Failed to load profile");
      }
      return data.driver;
    },
  });

  useEffect(() => {
    if (!profilePayload) return;
    setProfile(profilePayload);
    setIsProfileCompleted(!!profilePayload.profile_completed);
    setError(null);
  }, [profilePayload]);

  useEffect(() => {
    if (isError) {
      setError("Failed to load profile");
    }
  }, [isError]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
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

  if (isLoading && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f0fdf4] via-[#dcfce7] to-[#bbf7d0] font-display pb-20 animate-pulse">
        <div className="bg-gradient-to-r from-[#1db95b] to-[#16a34a] px-6 py-6 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-white/20" />
            <div className="space-y-2">
              <div className="h-6 w-32 bg-white/25 rounded" />
              <div className="h-4 w-24 bg-white/20 rounded" />
            </div>
          </div>
        </div>
        <div className="px-6 py-6 space-y-5">
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-gray-200" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-40 bg-gray-200 rounded" />
                <div className="h-4 w-28 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-3xl shadow-lg p-6 space-y-4">
            {[...Array(4)].map((_, idx) => (
              <div key={idx} className="h-12 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If profile is completed, show account details view
  if (isProfileCompleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f0fdf4] via-[#dcfce7] to-[#bbf7d0] font-display pb-20">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1db95b] to-[#16a34a] text-white px-6 py-6 shadow-lg">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/driver/dashboard")}
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-white">
                arrow_back
              </span>
            </button>
            <div>
              <h1 className="text-2xl font-bold">My Profile</h1>
              <p className="text-white/80 text-sm mt-0.5">Account Details</p>
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="px-6 py-6 space-y-5">
          {/* Profile Header Card */}
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#1db95b] to-[#16a34a] flex items-center justify-center shadow-lg">
                <span className="material-symbols-outlined text-white text-[42px]">
                  person
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">
                  {profile?.full_name || "Driver"}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="material-symbols-outlined text-[#1db95b] text-base">
                    alternate_email
                  </span>
                  <p className="text-gray-600 text-sm">
                    @{profile?.user_name || "username"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1db95b]">
                badge
              </span>
              Personal Information
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#1db95b]">
                    person
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium">Full Name</p>
                  <p className="text-base font-semibold text-gray-900">
                    {profile?.full_name || "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#dbeafe] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#3b82f6]">
                    mail
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium">
                    Email Address
                  </p>
                  <p className="text-base font-semibold text-gray-900 break-all">
                    {profile?.email || "N/A"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#fef3c7] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#f59e0b]">
                    phone
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium">
                    Phone Number
                  </p>
                  <p className="text-base font-semibold text-gray-900">
                    {profile?.phone || "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Work Information */}
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1db95b]">
                work
              </span>
              Work Information
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#e0e7ff] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#6366f1]">
                    schedule
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium">
                    Working Time
                  </p>
                  <p className="text-base font-semibold text-gray-900">
                    {profile?.working_time
                      ? profile.working_time === "full_time"
                        ? "Full Time"
                        : profile.working_time === "day"
                          ? "Day Shift (5AM - 7PM)"
                          : profile.working_time === "night"
                            ? "Night Shift (6PM - 6AM)"
                            : profile.working_time
                      : "Not Set"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#1db95b]">
                    pending_actions
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium">Status</p>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                        profile?.driver_status === "active"
                          ? "bg-[#dcfce7] text-[#166534]"
                          : profile?.driver_status === "inactive"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-[#fef3c7] text-[#92400e]"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                      {(profile?.driver_status || "inactive").toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#fce7f3] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#ec4899]">
                    two_wheeler
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 font-medium">
                    Vehicle Number
                  </p>
                  <p className="text-base font-semibold text-gray-900">
                    {profile?.vehicle_number || "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full h-14 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold rounded-2xl hover:from-red-600 hover:to-red-700 active:scale-[0.98] transition-all shadow-lg shadow-red-500/30 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    );
  }

  // If profile is not completed, show profile setup form
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative font-display">
      {/* Gradient background - Green at top fading to light at bottom */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1db95b] via-[#34d399] via-40% to-[#f0fdf4]"></div>

      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "url('https://grainy-gradients.vercel.app/noise.svg')",
        }}
      ></div>

      {/* Main content */}
      <div className="relative w-full max-w-[480px] px-4 py-8 z-10">
        {/* Logo/Icon */}
        <div className="flex flex-col items-center mb-6">
          <div className="h-16 w-16 bg-white rounded-full shadow-lg shadow-[#1db95b]/20 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[#1db95b] text-[32px]">
              person_add
            </span>
          </div>
        </div>

        {/* White card */}
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] p-8 sm:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Complete Your Profile
            </h1>
            <p className="text-gray-500 text-sm">
              Choose a username and set your password to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">
                Email (read-only)
              </label>
              <div className="relative">
                <input
                  className="w-full h-14 pl-12 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                  value={profile?.email || ""}
                  disabled
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined">mail</span>
                </div>
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">
                Username *
              </label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full h-14 pl-12 pr-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                  placeholder="Choose a unique username"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                  minLength={3}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined">person</span>
                </div>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">
                New Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full h-14 pl-12 pr-12 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined">lock</span>
                </div>
                <div
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1db95b] cursor-pointer transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <span className="material-symbols-outlined">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </div>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">
                Confirm Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  className="w-full h-14 pl-12 pr-12 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#1db95b] focus:ring-2 focus:ring-[#1db95b]/20 focus:bg-white transition-all duration-200"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1db95b]">
                  <span className="material-symbols-outlined">shield</span>
                </div>
                <div
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1db95b] cursor-pointer transition-colors"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <span className="material-symbols-outlined">
                    {showConfirmPassword ? "visibility_off" : "visibility"}
                  </span>
                </div>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-red-500 text-lg">
                  error
                </span>
                <span>{error}</span>
              </div>
            )}

            {/* Success message */}
            {message && (
              <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-green-500 text-lg">
                  check_circle
                </span>
                <span>{message}</span>
              </div>
            )}

            {/* Warning note */}
            <div className="p-4 bg-[#dcfce7] border border-[#86efac] rounded-xl">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[#16a34a] text-lg mt-0.5">
                  info
                </span>
                <p className="text-sm text-[#166534]">
                  <strong>Note:</strong> Username and password cannot be changed
                  later. Your onboarding details will be collected next.
                </p>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full h-14 bg-[#1db95b] text-white font-bold rounded-xl hover:bg-[#18a34a] active:scale-[0.98] transition-all shadow-lg shadow-[#1db95b]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              {saving ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save & Continue</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
