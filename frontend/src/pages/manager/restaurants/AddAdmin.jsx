import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";
import { API_URL } from "../../../config";

export default function AddAdmin() {
  const [emailsInput, setEmailsInput] = useState("");
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

  const parseEmails = (rawValue) => {
    return Array.from(
      new Set(
        String(rawValue || "")
          .split(/[\n,;]/)
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const emailList = parseEmails(emailsInput);
    if (!emailList.length) {
      setError("At least one email is required.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/manager/add-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emails: emailList }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Failed to create admin");
      } else {
        const resultList = Array.isArray(data?.results) ? data.results : [];
        if (resultList.length) {
          const successCount = resultList.filter((item) => item?.ok).length;
          const failedItems = resultList.filter((item) => !item?.ok);

          if (!failedItems.length) {
            setMessage(
              `Successfully created ${successCount} admin account(s). Invite emails were attempted for all.`,
            );
          } else {
            const failedText = failedItems
              .map(
                (item) =>
                  `${item?.email || "unknown"}: ${item?.message || "failed"}`,
              )
              .join(" | ");
            setError(
              `Created ${successCount}/${resultList.length} admins. Failed: ${failedText}`,
            );
          }
        } else {
          if (data?.emailSent === false) {
            setError(
              data?.emailError ||
                "Admin was not created because invite email sending failed.",
            );
          } else {
            setMessage(
              `Admin created successfully. A temporary password has been sent to ${data?.email || "the admin email"}.`,
            );
          }
        }

        setEmailsInput("");
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ManagerPageLayout title="Add Admin">
      <div className="p-4">
        <AnimatedAlert alert={alertState} visible={alertVisible} />
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800">Add Admin</h1>
          <p className="text-gray-600 mt-2">
            Create one or multiple restaurant admin accounts. Use comma or new
            line to add multiple emails.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-6 bg-white rounded-xl shadow p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address(es)
              </label>
              <textarea
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder={"admin1@restaurant.com\nadmin2@restaurant.com"}
                rows={4}
                value={emailsInput}
                onChange={(e) => setEmailsInput(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Example: admin1@restaurant.com, admin2@restaurant.com
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
            >
              {loading ? "Creating..." : "Create Admin(s)"}
            </button>
          </form>
        </div>
      </div>
    </ManagerPageLayout>
  );
}
