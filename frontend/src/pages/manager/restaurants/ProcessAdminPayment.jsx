import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import { API_URL } from "../../../config";

export default function ProcessAdminPayment() {
  const navigate = useNavigate();
  const { restaurantId } = useParams();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [restaurant, setRestaurant] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [error, setRawError] = useState("");
  const [success, setRawSuccess] = useState("");
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
  const setSuccess = (msg) => {
    setRawSuccess(msg);
    if (msg) showSuccess(msg);
  };
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const fetchRestaurant = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [restaurantRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/manager/admin-payments/restaurant/${restaurantId}`, {
          headers,
        }),
        fetch(
          `${API_URL}/manager/admin-payments/restaurant/${restaurantId}/history`,
          { headers },
        ),
      ]);

      const restaurantData = await restaurantRes.json();
      const historyData = await historyRes.json();

      if (restaurantData.success) setRestaurant(restaurantData.restaurant);
      if (historyData.success) setHistory(historyData.payments || []);
    } catch (err) {
      console.error("Failed to fetch restaurant:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchRestaurant();
  }, [fetchRestaurant]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    // Validate size (5MB)
    if (selected.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB");
      return;
    }

    // Validate type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(selected.type)) {
      setError("Only JPEG, PNG, WebP, or PDF files are allowed");
      return;
    }

    setFile(selected);
    setError("");

    // Create preview
    if (selected.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => setFilePreview(reader.result);
      reader.readAsDataURL(selected);
    } else {
      setFilePreview(null);
    }
  };

  const handleMaxAmount = () => {
    if (restaurant) {
      setAmount(restaurant.withdrawal_balance.toFixed(2));
    }
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (payAmount > (restaurant?.withdrawal_balance || 0)) {
      setError(
        `Amount exceeds available balance of Rs.${restaurant.withdrawal_balance.toFixed(2)}`,
      );
      return;
    }

    if (!file) {
      setError("Please upload a payment receipt");
      return;
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("amount", payAmount.toString());
      formData.append("proof", file);
      if (note) formData.append("note", note);

      const res = await fetch(
        `${API_URL}/manager/admin-payments/pay/${restaurantId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );

      const data = await res.json();

      if (data.success) {
        setSuccess(data.message);
        // Update restaurant data locally
        setRestaurant((prev) => ({
          ...prev,
          withdrawal_balance: data.new_withdrawal_balance,
          total_paid: (prev.total_paid || 0) + payAmount,
        }));
        // Reset form
        setAmount("");
        setNote("");
        setFile(null);
        setFilePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        // Refresh history
        fetchRestaurant();
      } else {
        setError(data.message || "Payment failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ManagerPageLayout title="Process Payment">
        <ManagerPageSkeleton type="form" />
      </ManagerPageLayout>
    );
  }

  if (!restaurant) {
    return (
      <ManagerPageLayout title="Process Payment">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <span className="material-symbols-outlined text-6xl text-[#618980] mb-4 block">
              store
            </span>
            <p className="text-[#618980] mb-4">Restaurant not found</p>
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-2 bg-[#13ecb9] text-[#111816] rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              Go Back
            </button>
          </div>
        </div>
      </ManagerPageLayout>
    );
  }

  return (
    <ManagerPageLayout title="Process Payment">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Restaurant info & Balance */}
        <div className="lg:col-span-1 space-y-4">
          {/* Restaurant Profile */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-col items-center text-center">
              {restaurant.logo_url ? (
                <img
                  src={restaurant.logo_url}
                  alt={restaurant.name}
                  className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 mb-4"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center border-2 border-gray-200 mb-4">
                  <span className="text-2xl font-bold text-blue-600">
                    {(restaurant.name || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <h2 className="text-lg font-bold text-gray-800">
                {restaurant.name || "Unknown Restaurant"}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {restaurant.admin_email || "No admin email"}
              </p>
              {/* Admin Details */}
              {(restaurant.admin_name || restaurant.admin_phone) && (
                <div className="mt-3 pt-3 border-t border-gray-100 w-full">
                  {restaurant.admin_name && (
                    <div className="flex items-center justify-center gap-1.5 text-sm text-gray-700">
                      <span
                        className="material-symbols-outlined text-gray-400"
                        style={{ fontSize: "16px" }}
                      >
                        person
                      </span>
                      <span className="font-medium">
                        {restaurant.admin_name}
                      </span>
                    </div>
                  )}
                  {restaurant.admin_phone && (
                    <div className="flex items-center justify-center gap-1.5 text-sm text-gray-600 mt-1">
                      <span
                        className="material-symbols-outlined text-gray-400"
                        style={{ fontSize: "16px" }}
                      >
                        call
                      </span>
                      <span>{restaurant.admin_phone}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bank Account Details */}
          {restaurant.bank_details && (
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-100/60 border-b border-emerald-200">
                <span
                  className="material-symbols-outlined text-emerald-600"
                  style={{ fontSize: "18px" }}
                >
                  account_balance
                </span>
                <span className="text-emerald-800 text-xs font-bold">
                  Bank Account — Transfer Here
                </span>
              </div>
              <div className="p-4 space-y-2.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-0.5">
                    Account Number
                  </p>
                  <p className="text-[#111816] text-xl font-bold tracking-wider font-mono">
                    {restaurant.bank_details.account_number}
                  </p>
                </div>
                <div className="h-px bg-emerald-200/60" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-0.5">
                      Account Holder
                    </p>
                    <p className="text-[#111816] text-xs font-semibold">
                      {restaurant.bank_details.account_holder_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-0.5">
                      Bank Name
                    </p>
                    <p className="text-[#111816] text-xs font-semibold">
                      {restaurant.bank_details.bank_name}
                    </p>
                  </div>
                </div>
                {restaurant.bank_details.branch_name && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-0.5">
                      Branch
                    </p>
                    <p className="text-[#111816] text-xs font-semibold">
                      {restaurant.bank_details.branch_name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Current Balance */}
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200 p-6">
            <p className="text-sm font-medium text-red-600 mb-2">
              Amount to Pay
            </p>
            <p className="text-3xl font-bold text-red-700">
              Rs.{restaurant.withdrawal_balance?.toFixed(2)}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-600 mb-1">
                Total Earnings
              </p>
              <p className="text-lg font-bold text-gray-800">
                Rs.{restaurant.total_earnings?.toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-600 mb-1">
                Total Paid
              </p>
              <p className="text-lg font-bold text-gray-800">
                Rs.{restaurant.total_paid?.toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2">
              <p className="text-xs font-medium text-gray-600 mb-1">
                Total Orders
              </p>
              <p className="text-lg font-bold text-gray-800">
                {restaurant.order_count || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Right column - Payment form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Payment Form */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Payment Details
            </h3>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Amount (Rs.)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleMaxAmount}
                  className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Max
                </button>
              </div>
            </div>

            {/* Note Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Note (Optional)
              </label>
              <textarea
                placeholder="Add a note about this payment..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Receipt (Required)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-2">
                Upload image (JPEG, PNG, WebP) or PDF. Max size: 5MB
              </p>

              {/* File Preview */}
              {filePreview && (
                <div className="mt-4">
                  <img
                    src={filePreview}
                    alt="Receipt preview"
                    className="max-w-full h-auto rounded-lg border border-gray-200"
                  />
                </div>
              )}
              {file && file.type === "application/pdf" && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                  <svg
                    className="w-8 h-8 text-red-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M4 18h12V6h-4V2H4v16zm-2 1V0h12l4 4v16H2v-1z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Processing..." : "Process Payment"}
            </button>
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between text-left"
            >
              <h3 className="text-lg font-semibold text-gray-800">
                Payment History ({history.length})
              </h3>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${showHistory ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showHistory && (
              <div className="mt-4 space-y-3">
                {history.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No payment history
                  </p>
                ) : (
                  history.map((payment) => (
                    <div
                      key={payment.id}
                      className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">
                            Rs.{parseFloat(payment.amount).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(payment.created_at).toLocaleString()}
                          </p>
                          {payment.note && (
                            <p className="text-sm text-gray-600 mt-2">
                              {payment.note}
                            </p>
                          )}
                        </div>
                        {payment.proof_url && (
                          <a
                            href={payment.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-4 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ManagerPageLayout>
  );
}
