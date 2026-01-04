import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  async function handleLogin() {
    const res = await fetch("http://localhost:5000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data?.message || "Login failed");
      return;
    }

    // Persist session info
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);
    localStorage.setItem("userEmail", email);

    // Route by role
    if (data.role === "manager") {
      navigate("/manager/dashboard");
    } else if (data.role === "admin") {
      try {
        const statusRes = await fetch(
          "http://localhost:5000/restaurant-onboarding/status",
          {
            headers: { Authorization: `Bearer ${data.token}` },
          }
        );
        const status = await statusRes.json();

        if (statusRes.ok) {
          if (status.force_password_change && !status.profile_completed) {
            navigate("/admin/profile");
          } else if (status.admin_status !== "active") {
            // If admin is not active (pending, rejected, suspended), go to pending page
            navigate("/admin/restaurant/pending");
          } else if (!status.onboarding_completed) {
            navigate(
              `/admin/restaurant/onboarding/step-${status.onboarding_step || 1}`
            );
          } else {
            navigate("/admin/dashboard");
          }
        } else {
          navigate("/admin/dashboard");
        }
      } catch (e) {
        console.error("Admin onboarding status check error:", e);
        navigate("/admin/dashboard");
      }
    } else if (data.role === "driver") {
      // Check if driver needs to complete profile or onboarding
      try {
        const profileRes = await fetch("http://localhost:5000/driver/me", {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        const profileData = await profileRes.json();

        if (profileRes.ok && profileData.driver) {
          // Store user_name if available
          if (profileData.driver.user_name) {
            localStorage.setItem("userName", profileData.driver.user_name);
          }

          // Check password change requirement
          if (profileData.driver.force_password_change) {
            navigate("/driver/profile");
          }
          // Check onboarding completion
          else if (!profileData.driver.onboarding_completed) {
            navigate(
              `/driver/onboarding/step-${
                profileData.driver.onboarding_step || 1
              }`
            );
          }
          // Check if driver is active
          else if (profileData.driver.driver_status !== "active") {
            navigate("/driver/pending");
          }
          // All good - go to dashboard
          else {
            navigate("/driver/dashboard");
          }
        } else {
          navigate("/driver/dashboard");
        }
      } catch (e) {
        console.error("Driver profile check error:", e);
        navigate("/driver/dashboard");
      }
    } else if (data.role === "customer") {
      // Check if profile is completed
      if (!data.profileCompleted) {
        navigate(`/auth/complete-profile?userId=${data.userId}`);
        return;
      }
      // Profile completed, go to home
      navigate("/");
    } else {
      // For other roles, stay on Home until implemented
      navigate("/");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Sign In</h1>
        <input
          placeholder="Email"
          className="mb-3 p-3 border border-gray-300 rounded w-full"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="mb-4 p-3 border border-gray-300 rounded w-full"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          onClick={handleLogin}
        >
          Login
        </button>

        {/* Signup Link */}
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/signup")}
              className="text-indigo-600 hover:text-indigo-700 font-semibold"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
