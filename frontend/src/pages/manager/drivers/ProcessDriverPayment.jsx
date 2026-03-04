import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";
import AnimatedAlert, { useAlert } from "../../../components/AnimatedAlert";
import { API_URL } from "../../../config";

export default function ProcessDriverPayment() {
  const navigate = useNavigate();
  const { driverId } = useParams();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [driver, setDriver] = useState(null);
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

  const fetchDriver = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [driverRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/manager/driver-payments/driver/${driverId}`, {
          headers,
        }),
        fetch(`${API_URL}/manager/driver-payments/driver/${driverId}/history`, {
          headers,
        }),
      ]);

      const driverData = await driverRes.json();
      const historyData = await historyRes.json();

      if (driverData.success) setDriver(driverData.driver);
      if (historyData.success) setHistory(historyData.payments || []);
    } catch (err) {
      console.error("Failed to fetch driver:", err);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    fetchDriver();
  }, [fetchDriver]);

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
    if (driver) {
      setAmount(driver.withdrawal_balance.toFixed(2));
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

    if (payAmount > (driver?.withdrawal_balance || 0)) {
      setError(
        `Amount exceeds available balance of Rs.${driver.withdrawal_balance.toFixed(2)}`,
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
        `${API_URL}/manager/driver-payments/pay/${driverId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );

      const data = await res.json();

      if (data.success) {
        setSuccess(data.message);
        // Update driver data locally
        setDriver((prev) => ({
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
        fetchDriver();
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

  if (!driver) {
    return (
      <ManagerPageLayout title="Process Payment">
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl text-[#618980]/30">
              person_off
            </span>
            <p className="text-[#618980] mt-2">Driver not found</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 px-4 py-2 bg-[#13ecb9] text-[#111816] rounded-xl font-bold text-sm"
            >
              Go Back
            </button>
          </div>
        </div>
      </ManagerPageLayout>
    );
  }

  return (
    <ManagerPageLayout title="Process Withdrawal">
      <div className="p-4">
        <AnimatedAlert alert={alertState} visible={alertVisible} />
        <div className="max-w-lg mx-auto">
          {/* Driver Profile */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {driver.profile_photo_url ? (
                <img
                  src={driver.profile_photo_url}
                  alt={driver.full_name}
                  className="w-20 h-20 rounded-full object-cover border-3 border-[#dbe6e3] shadow-md"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#13ecb9]/20 to-[#13ecb9]/50 flex items-center justify-center border-3 border-[#dbe6e3] shadow-md">
                  <span className="text-2xl font-bold text-[#13ecb9]">
                    {(driver.full_name || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {driver.is_verified && (
                <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 shadow-sm">
                  <span
                    className="material-symbols-outlined text-white"
                    style={{ fontSize: "14px" }}
                  >
                    check
                  </span>
                </div>
              )}
            </div>
            <h2 className="text-lg font-bold text-[#111816] mt-3">
              {driver.full_name || "Unknown Driver"}
            </h2>
            <p className="text-xs text-[#618980]">
              ID: #{driver.id?.substring(0, 8).toUpperCase()}
            </p>
            {driver.is_verified && (
              <span className="mt-1.5 px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase tracking-wider">
                Verified Partner
              </span>
            )}
          </div>

          {/* Driver Bank Account Details */}
          {driver.bank_details && (
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-100/60 border-b border-emerald-200">
                <span className="material-symbols-outlined text-emerald-600 text-base">
                  account_balance
                </span>
                <span className="text-emerald-800 text-xs font-bold">
                  Driver Bank Account — Transfer Here
                </span>
              </div>
              <div className="p-4 space-y-2.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-0.5">
                    Account Number
                  </p>
                  <p className="text-[#111816] text-xl font-bold tracking-wider font-mono">
                    {driver.bank_details.account_number}
                  </p>
                </div>
                <div className="h-px bg-emerald-200/60" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-0.5">
                      Account Holder
                    </p>
                    <p className="text-[#111816] text-xs font-semibold">
                      {driver.bank_details.account_holder_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-0.5">
                      Bank Name
                    </p>
                    <p className="text-[#111816] text-xs font-semibold">
                      {driver.bank_details.bank_name}
                    </p>
                  </div>
                </div>
                {driver.bank_details.branch_name && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-0.5">
                      Branch
                    </p>
                    <p className="text-[#111816] text-xs font-semibold">
                      {driver.bank_details.branch_name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Current Available Balance */}
          <div className="bg-gradient-to-br from-[#e8fdf6] to-[#d4f7ec] rounded-2xl p-5 border border-[#b8e8d9]">
            <p className="text-xs font-medium text-[#618980] mb-1">
              Current Available Balance
            </p>
            <p className="text-3xl font-bold text-[#111816]">
              Rs.{driver.withdrawal_balance?.toFixed(2)}
            </p>
          </div>

          {/* Earnings Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-3 border border-[#dbe6e3]">
              <p className="text-[10px] font-medium text-[#618980] uppercase">
                Total Earnings
              </p>
              <p className="text-sm font-bold text-[#111816]">
                Rs.{driver.total_earnings?.toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-[#dbe6e3]">
              <p className="text-[10px] font-medium text-[#618980] uppercase">
                Total Paid
              </p>
              <p className="text-sm font-bold text-green-600">
                Rs.{driver.total_paid?.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-[#111816] uppercase tracking-wider">
                Enter Amount to Transfer
              </label>
              <button
                onClick={handleMaxAmount}
                className="text-xs font-bold text-[#13ecb9] hover:text-[#0fd9a8] uppercase"
              >
                Max Amount
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2">
                <span className="material-symbols-outlined text-[#618980] text-lg">
                  currency_exchange
                </span>
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError("");
                }}
                placeholder="0.00"
                min="0"
                max={driver.withdrawal_balance}
                step="0.01"
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-[#dbe6e3] rounded-xl text-lg font-bold text-[#111816] placeholder-[#618980]/40 focus:outline-none focus:ring-2 focus:ring-[#13ecb9]/30 focus:border-[#13ecb9]"
              />
            </div>
          </div>

          {/* Upload Receipt */}
          <div>
            <label className="text-xs font-bold text-[#111816] uppercase tracking-wider block mb-2">
              Upload Payment Receipt
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              id="receipt-upload"
            />

            {!file ? (
              <label
                htmlFor="receipt-upload"
                className="flex flex-col items-center justify-center py-8 bg-white border-2 border-dashed border-[#dbe6e3] rounded-2xl cursor-pointer hover:border-[#13ecb9] hover:bg-[#f5faf8] transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-[#13ecb9]/10 flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[#13ecb9] text-2xl">
                    cloud_upload
                  </span>
                </div>
                <p className="text-sm font-medium text-[#111816]">
                  Click to upload transfer confirmation
                </p>
                <p className="text-xs text-[#618980] mt-1">
                  PDF, JPG or PNG (Max 5MB)
                </p>
              </label>
            ) : (
              <div className="bg-white border border-[#dbe6e3] rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  {filePreview ? (
                    <img
                      src={filePreview}
                      alt="Receipt preview"
                      className="w-16 h-16 rounded-xl object-cover border border-[#dbe6e3]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-red-50 flex items-center justify-center border border-red-200">
                      <span className="material-symbols-outlined text-red-500 text-2xl">
                        picture_as_pdf
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#111816] truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-[#618980]">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setFilePreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="p-2 text-red-400 hover:text-red-600"
                  >
                    <span className="material-symbols-outlined text-lg">
                      close
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Note (optional) */}
          <div>
            <label className="text-xs font-bold text-[#111816] uppercase tracking-wider block mb-2">
              Note (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Bank transfer ref #12345"
              className="w-full px-4 py-3 bg-white border border-[#dbe6e3] rounded-xl text-sm text-[#111816] placeholder-[#618980]/40 focus:outline-none focus:ring-2 focus:ring-[#13ecb9]/30 focus:border-[#13ecb9]"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !amount || !file}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
              submitting || !amount || !file
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-[#13ecb9] text-[#111816] hover:bg-[#0fd9a8] active:scale-[0.98] shadow-lg shadow-[#13ecb9]/25"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              "Submit Payment"
            )}
          </button>

          {/* Payment History */}
          <div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between py-3"
            >
              <h3 className="text-sm font-bold text-[#111816] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#13ecb9] text-lg">
                  history
                </span>
                Payment History ({history.length})
              </h3>
              <span
                className={`material-symbols-outlined text-[#618980] text-lg transition-transform ${showHistory ? "rotate-180" : ""}`}
              >
                expand_more
              </span>
            </button>

            {showHistory && (
              <div className="space-y-2 mt-1">
                {history.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#dbe6e3] p-6 text-center">
                    <span className="material-symbols-outlined text-3xl text-[#618980]/30">
                      receipt_long
                    </span>
                    <p className="text-sm text-[#618980] mt-1">
                      No payment history yet
                    </p>
                  </div>
                ) : (
                  history.map((payment) => (
                    <div
                      key={payment.id}
                      className="bg-white rounded-xl border border-[#dbe6e3] p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                            <span className="material-symbols-outlined text-green-600 text-sm">
                              check_circle
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#111816]">
                              Rs.{parseFloat(payment.amount).toFixed(2)}
                            </p>
                            <p className="text-[10px] text-[#618980]">
                              {new Date(payment.created_at).toLocaleDateString(
                                "en-LK",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </p>
                          </div>
                        </div>
                        {payment.proof_url && (
                          <a
                            href={payment.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-[#618980] hover:text-[#13ecb9]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="material-symbols-outlined text-lg">
                              receipt
                            </span>
                          </a>
                        )}
                      </div>
                      {payment.note && (
                        <p className="text-xs text-[#618980] mt-1.5 pl-12 italic">
                          {payment.note}
                        </p>
                      )}
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
