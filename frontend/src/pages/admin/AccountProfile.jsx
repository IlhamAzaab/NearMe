import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AdminLayout from "../../components/AdminLayout";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import { API_URL } from "../../config";

// ─── Icon helpers ──────────────────────────────────────────────────────────────
const Icon = ({ path, className = "w-5 h-5" }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.8}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

const ICONS = {
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  email:
    "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  phone:
    "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  store:
    "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  arrow: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3",
  shield:
    "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  eyeOff:
    "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21",
  id: "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2",
  calendar:
    "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  check: "M5 13l4 4L19 7",
};

// ─── Section card ──────────────────────────────────────────────────────────────
const Card = ({ children, className = "" }) => (
  <div
    className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}
  >
    {children}
  </div>
);

const SectionHeader = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50">
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-sm flex-shrink-0">
      <Icon path={icon} className="w-4.5 h-4.5 text-white" />
    </div>
    <div>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
  </div>
);

const InfoRow = ({ label, value, icon }) => (
  <div className="flex items-start gap-3 py-3 px-6 border-b border-gray-50 last:border-0">
    {icon && (
      <div className="mt-0.5 flex-shrink-0 text-green-500">
        <Icon path={icon} className="w-4 h-4" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm text-gray-800 font-medium mt-0.5 break-all">
        {value || <span className="text-gray-300 italic">Not set</span>}
      </p>
    </div>
  </div>
);

// ─── Input field ───────────────────────────────────────────────────────────────
const Field = ({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  icon,
  rightEl,
}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
      {label}
    </label>
    <div className="relative">
      {icon && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <Icon path={icon} className="w-4 h-4" />
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={`w-full ${icon ? "pl-9" : "pl-3"} ${rightEl ? "pr-10" : "pr-3"} py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 focus:bg-white transition-all`}
      />
      {rightEl && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          {rightEl}
        </div>
      )}
    </div>
  </div>
);

// ─── Main component ─────────────────────────────────────────────────────────────
export default function AccountProfile() {
  const navigate = useNavigate();
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profile, setProfile] = useState(null);

  // Password change state
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwData, setPwData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw] = useState({ cur: false, new: false, con: false });
  const [changingPw, setChangingPw] = useState(false);

  const token = localStorage.getItem("token");

  // ── Fetch admin profile ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        navigate("/login");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/admin/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.admin) {
          setProfile(data.admin);
        } else {
          showError(data.message || "Failed to load profile");
        }
      } catch {
        showError("Network error");
      } finally {
        setLoadingProfile(false);
      }
    };
    fetchProfile();
  }, []);

  // ── Change password ──────────────────────────────────────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwData.newPassword !== pwData.confirmPassword) {
      showError("New passwords do not match");
      return;
    }
    if (pwData.newPassword.length < 6) {
      showError("Password must be at least 6 characters");
      return;
    }
    setChangingPw(true);
    try {
      const res = await fetch(`${API_URL}/admin/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: profile?.username || "",
          newPassword: pwData.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showSuccess("Password changed successfully!");
        setPwData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setShowPwForm(false);
      } else {
        showError(data.message || "Failed to change password");
      }
    } catch {
      showError("Network error");
    } finally {
      setChangingPw(false);
    }
  };

  // ── Status badge ─────────────────────────────────────────────────────────────
  const statusConfig = {
    active: {
      label: "Active",
      cls: "bg-green-100 text-green-700 border-green-200",
    },
    pending: {
      label: "Pending",
      cls: "bg-yellow-100 text-yellow-700 border-yellow-200",
    },
    inactive: {
      label: "Inactive",
      cls: "bg-gray-100 text-gray-600 border-gray-200",
    },
    suspended: {
      label: "Suspended",
      cls: "bg-red-100 text-red-700 border-red-200",
    },
  };
  const status = statusConfig[profile?.admin_status] || statusConfig.pending;

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loadingProfile) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded-xl" />
          <div className="h-32 w-full bg-gray-200 rounded-2xl" />
          <div className="h-48 w-full bg-gray-200 rounded-2xl" />
          <div className="h-36 w-full bg-gray-200 rounded-2xl" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AnimatedAlert alert={alertState} visible={alertVisible} />

      <div className="max-w-2xl mx-auto">
        {/* ── Page Header ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">
            My Account
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage your admin profile and account security
          </p>
        </div>

        <div className="space-y-4">
          {/* ── Avatar + Identity Card ── */}
          <Card>
            <div className="px-6 pt-6 pb-5 flex flex-col sm:flex-row items-center sm:items-start gap-5">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center shadow-lg">
                  <span className="text-3xl font-bold text-white select-none">
                    {(profile?.email?.[0] || "A").toUpperCase()}
                  </span>
                </div>
                <div
                  className={`absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${status.cls}`}
                >
                  {status.label}
                </div>
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <p className="text-lg font-bold text-gray-900 truncate">
                  {profile?.email}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Admin Account</p>
                <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-lg border border-green-100">
                    <Icon path={ICONS.shield} className="w-3 h-3" /> Admin Role
                  </span>
                  {profile?.onboarding_completed && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-100">
                      <Icon path={ICONS.check} className="w-3 h-3" /> Onboarded
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* ── Account Info ── */}
          <Card>
            <SectionHeader
              icon={ICONS.id}
              title="Account Information"
              subtitle="Your admin account details"
            />
            <InfoRow
              label="Email Address"
              value={profile?.email}
              icon={ICONS.email}
            />
            <InfoRow
              label="Phone Number"
              value={profile?.phone}
              icon={ICONS.phone}
            />
            <InfoRow label="Account Status" value={null} icon={ICONS.shield} />
          </Card>

          {/* ── Restaurant Details Shortcut ── */}
          <Link to="/admin/restaurant" className="block group">
            <Card className="hover:shadow-md hover:border-green-200 transition-all duration-200 cursor-pointer">
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center shadow-sm flex-shrink-0">
                    <Icon path={ICONS.store} className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-green-700 transition-colors">
                      Restaurant Details
                    </p>
                    <p className="text-xs text-gray-400">
                      View &amp; manage your restaurant profile, images and
                      location
                    </p>
                  </div>
                </div>
                <div className="text-gray-300 group-hover:text-green-500 transition-colors">
                  <Icon path={ICONS.arrow} className="w-5 h-5" />
                </div>
              </div>
            </Card>
          </Link>

          {/* ── Security ── */}
          <Card>
            <SectionHeader
              icon={ICONS.lock}
              title="Security"
              subtitle="Manage your password"
            />

            {!showPwForm ? (
              <div className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Password</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    •••••••• (hidden)
                  </p>
                </div>
                <button
                  onClick={() => setShowPwForm(true)}
                  className="px-4 py-2 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl transition-colors"
                >
                  Change Password
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleChangePassword}
                className="px-6 py-5 space-y-4"
              >
                <Field
                  label="New Password"
                  type={showPw.new ? "text" : "password"}
                  value={pwData.newPassword}
                  onChange={(e) =>
                    setPwData({ ...pwData, newPassword: e.target.value })
                  }
                  placeholder="Min. 6 characters"
                  icon={ICONS.lock}
                  rightEl={
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => ({ ...s, new: !s.new }))}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Icon
                        path={showPw.new ? ICONS.eyeOff : ICONS.eye}
                        className="w-4 h-4"
                      />
                    </button>
                  }
                />
                <Field
                  label="Confirm New Password"
                  type={showPw.con ? "text" : "password"}
                  value={pwData.confirmPassword}
                  onChange={(e) =>
                    setPwData({ ...pwData, confirmPassword: e.target.value })
                  }
                  placeholder="Re-enter new password"
                  icon={ICONS.lock}
                  rightEl={
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => ({ ...s, con: !s.con }))}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Icon
                        path={showPw.con ? ICONS.eyeOff : ICONS.eye}
                        className="w-4 h-4"
                      />
                    </button>
                  }
                />
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPwForm(false);
                      setPwData({
                        currentPassword: "",
                        newPassword: "",
                        confirmPassword: "",
                      });
                    }}
                    className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={changingPw}
                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 rounded-xl shadow-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {changingPw ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />{" "}
                        Saving…
                      </>
                    ) : (
                      "Save Password"
                    )}
                  </button>
                </div>
              </form>
            )}
          </Card>

          {/* ── Account Metadata ── */}
          <Card>
            <SectionHeader
              icon={ICONS.calendar}
              title="Account Details"
              subtitle="Read-only system information"
            />
            <InfoRow label="Admin ID" value={profile?.id} icon={ICONS.id} />
            <InfoRow
              label="Onboarding"
              value={
                profile?.onboarding_completed
                  ? `Completed (Step ${profile.onboarding_step || "—"})`
                  : `In progress — Step ${profile.onboarding_step || 1}`
              }
              icon={ICONS.check}
            />
            <InfoRow
              label="Onboarding Status"
              value={
                profile?.admin_status
                  ? profile.admin_status.charAt(0).toUpperCase() +
                    profile.admin_status.slice(1)
                  : "—"
              }
              icon={ICONS.shield}
            />
          </Card>

          {/* ── Danger Zone ── */}
          <Card className="border-red-100">
            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Sign Out</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Log out of your admin account
                </p>
              </div>
              <button
                onClick={() => {
                  localStorage.clear();
                  navigate("/login");
                }}
                className="px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors"
              >
                Sign Out
              </button>
            </div>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
