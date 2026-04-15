import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../components/ManagerSkeleton";
import { API_URL } from "../../config";

const SRI_LANKA_TIME_ZONE = "Asia/Colombo";

export default function VerifyDeposit() {
  const navigate = useNavigate();
  const { depositId } = useParams();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deposit, setDeposit] = useState(null);
  const [approvedAmount, setApprovedAmount] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [showImageModal, setShowImageModal] = useState(false);
  const [error, setError] = useState("");
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "manager" && role !== "admin") {
      navigate("/login");
      return;
    }
    fetchDeposit();
  }, [navigate, depositId]);

  const fetchDeposit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/driver/deposits/manager/deposit/${depositId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (data.success) {
        setDeposit(data.deposit);
        // Pre-fill approved amount with claimed amount
        setApprovedAmount(data.deposit.amount.toString());
      } else {
        setError(data.message || "Failed to fetch deposit");
      }
    } catch (err) {
      console.error("Failed to fetch deposit:", err);
      setError("Failed to load deposit details");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!approvedAmount || parseFloat(approvedAmount) <= 0) {
      showError("Please enter a valid approved amount");
      return;
    }

    if (parseFloat(approvedAmount) > deposit.driver_pending_balance) {
      const confirm = window.confirm(
        `Warning: The approved amount (Rs.${approvedAmount}) exceeds the driver's pending balance (Rs.${deposit.driver_pending_balance.toFixed(2)}). Continue anyway?`,
      );
      if (!confirm) return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/driver/deposits/manager/review/${depositId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "approve",
            approved_amount: parseFloat(approvedAmount),
            review_note: reviewNote || null,
          }),
        },
      );

      const data = await res.json();
      if (data.success) {
        showSuccess("Deposit approved successfully!");
        navigate("/manager/deposits");
      } else {
        showError(data.message || "Failed to approve deposit");
      }
    } catch (err) {
      console.error("Approve error:", err);
      showError("Failed to approve deposit");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    const confirm = window.confirm(
      "Are you sure you want to reject this deposit?",
    );
    if (!confirm) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/driver/deposits/manager/review/${depositId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "reject",
            review_note: reviewNote || "Rejected by manager",
          }),
        },
      );

      const data = await res.json();
      if (data.success) {
        showSuccess("Deposit rejected");
        navigate("/manager/deposits");
      } else {
        showError(data.message || "Failed to reject deposit");
      }
    } catch (err) {
      console.error("Reject error:", err);
      showError("Failed to reject deposit");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (value) => `Rs.${Number(value || 0).toFixed(2)}`;

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: SRI_LANKA_TIME_ZONE,
    });
  };

  const transferId = String(deposit?.id || "-")
    .substring(0, 12)
    .toUpperCase();

  const getDriverInitials = (name) => {
    if (!name) return "DR";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Check if file is PDF - by proof_type field or URL
  const isPdf =
    deposit?.proof_type === "pdf" || deposit?.proof_url?.includes(".pdf");

  // Get image preview URL for display (converts PDF to image via Cloudinary)
  const getPreviewUrl = () => {
    if (!deposit?.proof_url) return "";

    // If it's a PDF from Cloudinary, transform to get first page as image
    if (isPdf && deposit.proof_url.includes("cloudinary.com")) {
      let url = deposit.proof_url;

      // If it's a raw URL, convert to image URL first
      if (url.includes("/raw/upload/")) {
        url = url.replace("/raw/upload/", "/image/upload/");
      }

      // Transform: add pg_1 transformation and change extension to jpg
      // From: https://res.cloudinary.com/xxx/image/upload/v123/folder/file.pdf
      // To:   https://res.cloudinary.com/xxx/image/upload/pg_1/v123/folder/file.jpg
      return url.replace("/upload/", "/upload/pg_1/").replace(".pdf", ".jpg");
    }

    return deposit.proof_url;
  };

  const openProofInNewTab = () => {
    window.open(deposit.proof_url, "_blank");
  };

  if (loading) {
    return <ManagerPageSkeleton type="form" />;
  }

  if (error || !deposit) {
    return (
      <ManagerPageLayout title="Verify Deposit">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <span className="material-symbols-outlined text-6xl text-red-400">
            error
          </span>
          <p className="text-[#618980] font-medium">
            {error || "Deposit not found"}
          </p>
          <button
            onClick={() => navigate("/manager/deposits")}
            className="px-4 py-2 bg-[#13ecb9] text-[#111816] rounded-xl font-medium"
          >
            Go Back
          </button>
        </div>
      </ManagerPageLayout>
    );
  }

  return (
    <ManagerPageLayout title="Verify Deposit">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      {/* Receipt Preview Section */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Driver Uploaded Receipt
          </span>
          <button
            onClick={() => setShowImageModal(true)}
            className="text-[#13ecb9] text-sm font-semibold flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">zoom_in</span>
            Tap to Zoom
          </button>
        </div>
        <div
          onClick={() => setShowImageModal(true)}
          className="relative aspect-[3/4] w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm cursor-pointer group"
        >
          {/* Display image preview (also works for PDFs via Cloudinary transformation) */}
          <div
            className="absolute inset-0 bg-center bg-cover bg-no-repeat transition-transform duration-300 group-hover:scale-105"
            style={{
              backgroundImage: `url("${getPreviewUrl()}")`,
            }}
          />
          <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-md text-white p-2 rounded-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">
              {isPdf ? "picture_as_pdf" : "image"}
            </span>
            <span className="text-xs font-medium">
              {isPdf ? "receipt.pdf" : "receipt.jpg"}
            </span>
          </div>
        </div>
      </div>

      {/* Driver Info Card */}
      <div className="px-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="size-14 rounded-full bg-[#13ecb9]/20 flex items-center justify-center text-[#13ecb9] font-bold text-lg border-2 border-[#13ecb9]/20">
              {getDriverInitials(deposit.driver?.full_name)}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-slate-900 text-base font-bold">
                  {deposit.driver?.full_name || "Driver"}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700">
                  Pending
                </span>
              </div>
              <p className="text-slate-500 text-sm">
                {deposit.driver?.phone || "No phone"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Reported Amount
              </p>
              <p className="text-xl font-bold text-slate-900">
                {formatCurrency(deposit.amount)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Deposit Date
              </p>
              <p className="text-sm font-medium text-slate-700">
                {formatDateTime(deposit.created_at)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 mt-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Driver's Pending Balance
              </p>
              <p className="text-lg font-bold text-amber-600">
                {formatCurrency(deposit.driver_pending_balance)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Collection Date
              </p>
              <p className="text-sm font-medium text-slate-700">
                {deposit.collection_date || "-"}
              </p>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 mt-4">
            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
              Transfer ID
            </p>
            <p className="text-sm font-semibold text-slate-700 font-mono">
              {transferId}
            </p>
          </div>
        </div>
      </div>

      {/* Verification Form */}
      <div className="px-4 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Type Verified Amount
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <span className="text-slate-400 font-medium">Rs.</span>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={approvedAmount}
              onChange={(e) => setApprovedAmount(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-4 pl-12 pr-4 text-lg font-bold text-slate-900 focus:ring-2 focus:ring-[#13ecb9] focus:border-transparent outline-none transition-all placeholder:text-slate-300"
              placeholder="0.00"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">
              error_outline
            </span>
            Enter the exact amount shown on the physical receipt. This amount
            will be deducted from the driver's pending balance.
          </p>
          {parseFloat(approvedAmount) !== parseFloat(deposit.amount) &&
            approvedAmount && (
              <p className="mt-2 text-xs text-amber-600 flex items-center gap-1 font-medium">
                <span className="material-symbols-outlined text-[14px]">
                  warning
                </span>
                Amount differs from driver's reported amount (
                {formatCurrency(deposit.amount)})
              </p>
            )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Manager's Internal Note
          </label>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-900 focus:ring-2 focus:ring-[#13ecb9] focus:border-transparent outline-none transition-all placeholder:text-slate-400"
            placeholder="Optional: Reason for discrepancies or audit notes..."
            rows={3}
          />
        </div>
      </div>

      {/* Fixed Bottom Actions - above bottom nav */}
      <div className="fixed bottom-16 left-0 right-0 bg-white p-4 border-t border-[#dbe6e3] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-md mx-auto space-y-3">
          <button
            onClick={handleApprove}
            disabled={submitting || !approvedAmount}
            className={`w-full bg-[#13ecb9] hover:bg-[#10d9a8] text-slate-900 font-bold py-4 rounded-xl shadow-lg shadow-[#13ecb9]/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              submitting || !approvedAmount
                ? "opacity-50 cursor-not-allowed"
                : ""
            }`}
          >
            {submitting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-slate-900"></div>
            ) : (
              <>
                <span className="material-symbols-outlined font-bold">
                  check_circle
                </span>
                Approve & Mark as Paid
              </>
            )}
          </button>
          <button
            onClick={handleReject}
            disabled={submitting}
            className={`w-full bg-transparent hover:bg-red-50 text-red-500 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              submitting ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <span className="material-symbols-outlined text-xl">cancel</span>
            Reject Deposit
          </button>
        </div>
      </div>

      {/* Image Modal - Works for both images and PDFs (via Cloudinary preview) */}
      {showImageModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowImageModal(false)}
        >
          <button
            onClick={() => setShowImageModal(false)}
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
          {isPdf && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openProofInNewTab();
              }}
              className="absolute top-4 left-4 text-white px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">
                open_in_new
              </span>
              <span className="text-sm font-medium">Open Original PDF</span>
            </button>
          )}
          <img
            src={getPreviewUrl()}
            alt="Receipt"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </ManagerPageLayout>
  );
}
