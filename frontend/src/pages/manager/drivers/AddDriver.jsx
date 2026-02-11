import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";

export default function AddDriver() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setRawMessage] = useState(null);
  const [error, setRawError] = useState(null);
  const navigate = useNavigate();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!email) {
      setError("Email is required.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/manager/add-driver", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Failed to create driver");
      } else {
        setMessage(
          `Driver created successfully. A temporary password has been sent to ${email}.`,
        );
        setEmail("");
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ManagerPageLayout title="Add Driver">
      <div className="p-4">
        <AnimatedAlert alert={alertState} visible={alertVisible} />
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800">Add Driver</h1>
          <p className="text-gray-600 mt-2">
            Create a new driver account. A temporary password will be sent to
            the email address.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-6 bg-white rounded-xl shadow p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="driver@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
            >
              {loading ? "Creating..." : "Create Driver"}
            </button>
          </form>
        </div>
      </div>
    </ManagerPageLayout>
  );
}
