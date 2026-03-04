import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../../components/AnimatedAlert";
import {
  SkeletonHeroCard,
  SkeletonMetricCards,
  SkeletonDepositCard,
  SkeletonList,
} from "../../components/Skeleton";
import supabaseClient from "../../supabaseClient";
import { useNotification } from "../../contexts/NotificationContext";
import DriverLayout from "../../components/DriverLayout";
import { API_URL } from "../../config";

export default function DriverDeposits() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { addNotification } = useNotification();
  const driverIdRef = useRef(null);
  const {
    alert: alertState,
    visible: alertVisible,
    showSuccess,
    showError,
  } = useAlert();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitForm, setSubmitForm] = useState({ amount: "" });
  const [selectedFile, setSelectedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [managerBank, setManagerBank] = useState(null);

  // Get driver ID from token
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        driverIdRef.current = payload.id || payload.userId || payload.sub;
      } catch (e) {
        console.error("Error parsing token:", e);
      }
    }
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }
    fetchData(true);
    fetchManagerBankDetails();
  }, [navigate]);

  const fetchManagerBankDetails = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_URL}/driver/deposits/manager-bank-details`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (data.success && data.bankDetails) {
        setManagerBank(data.bankDetails);
      }
    } catch (err) {
      console.error("Failed to fetch manager bank details:", err);
    }
  };

  // Subscribe to real-time deposit status changes for this driver
  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      return;
    }

    // Listen for status updates on driver's deposits
    const updateChannel = supabaseClient
      .channel("deposits:driver-status-update")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "driver_deposits",
        },
        async (payload) => {
          const updatedDeposit = payload.new;
          const oldDeposit = payload.old;

          // Only show notification if this deposit belongs to the current driver
          if (
            driverIdRef.current &&
            updatedDeposit.driver_id === driverIdRef.current
          ) {
            // Status changed
            if (oldDeposit.status !== updatedDeposit.status) {
              if (updatedDeposit.status === "approved") {
                addNotification(
                  `✅ Your deposit of ₹${Number(updatedDeposit.approved_amount || updatedDeposit.amount).toFixed(2)} has been approved!`,
                  "success",
                  5000,
                );
              } else if (updatedDeposit.status === "rejected") {
                addNotification(
                  `❌ Your deposit request was rejected. Please check details.`,
                  "error",
                  5000,
                );
              }
            }

            // Refresh data to show updated status
            await Promise.all([fetchBalance(), fetchHistory()]);
          }
        },
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(updateChannel);
    };
  }, [addNotification]);

  // Memoized fetch function for auto-refresh
  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    await Promise.all([fetchBalance(), fetchHistory()]);

    setLoading(false);
    setRefreshing(false);
    setLastRefresh(new Date());
  }, []);

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  const fetchBalance = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/driver/deposits/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setBalance(data.balance);
      }
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  };

  const fetchHistory = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/driver/deposits/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDeposits(data.deposits);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSubmitDeposit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      showError("Please select a proof file");
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("proof", selectedFile);
      formData.append("amount", submitForm.amount);

      const res = await fetch(`${API_URL}/driver/deposits/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setShowSubmitModal(false);
        setSubmitForm({ amount: "" });
        setSelectedFile(null);
        fetchData();
        showSuccess("Deposit submitted! Waiting for manager approval.");
      } else {
        showError(data.message || "Failed to submit deposit");
      }
    } catch (error) {
      console.error("Submit error:", error);
      showError("Failed to submit deposit");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Calculate pending submissions (in-process deposits)
  const pendingSubmissions = deposits.filter((d) => d.status === "pending");
  const totalPendingSubmissions = pendingSubmissions.reduce(
    (sum, d) => sum + parseFloat(d.amount || 0),
    0,
  );

  // Actual pending balance (money owed to manager)
  const actualPendingDeposit = parseFloat(balance?.pending_deposit || 0);

  // Available amount to submit (pending - already submitted)
  const availableToSubmit = Math.max(
    0,
    actualPendingDeposit - totalPendingSubmissions,
  );

  // Can submit if there's available amount
  const canSubmitNew = availableToSubmit > 0;
  const hasPendingDeposit = actualPendingDeposit > 0;

  // Loading skeleton state
  if (loading) {
    return (
      <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden max-w-md mx-auto lg:max-w-2xl bg-white shadow-xl lg:shadow-none">
        {/* Skeleton Header */}
        <div className="sticky top-0 z-10 flex items-center bg-white/90 backdrop-blur-md p-4 pb-2 justify-between border-b border-gray-100">
          <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
        </div>

        {/* Skeleton Content */}
        <div className="flex flex-col gap-6 p-4">
          <SkeletonHeroCard />
          <SkeletonMetricCards count={2} />
          <div className="space-y-3">
            <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
            <SkeletonList count={3}>
              <SkeletonDepositCard />
            </SkeletonList>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DriverLayout>
      <div
        className="relative flex w-full flex-col overflow-x-hidden max-w-md mx-auto lg:max-w-2xl bg-white shadow-xl lg:shadow-none"
        style={{ fontFamily: "'Inter', 'Work Sans', sans-serif" }}
      >
        {" "}
        <AnimatedAlert alert={alertState} visible={alertVisible} />{" "}
        {/* Top App Bar */}
        <div className="sticky top-0 z-10 flex items-center bg-white/90 backdrop-blur-md p-4 pb-2 justify-between border-b border-gray-100">
          <button
            onClick={() => navigate("/driver/dashboard")}
            className="text-[#111816] flex size-10 shrink-0 items-center justify-center"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="text-[#111816] text-lg font-bold leading-tight tracking-tight flex-1 text-center">
            Remittance History
          </h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`flex size-10 items-center justify-center ${refreshing ? "animate-spin" : ""}`}
          >
            <svg
              className="w-6 h-6 text-[#111816]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
        {/* Refreshing Indicator */}
        {refreshing && (
          <div className="bg-emerald-100 py-1 px-4 text-center">
            <span className="text-xs text-emerald-600 font-medium">
              Refreshing...
            </span>
          </div>
        )}
        <div className="flex flex-col gap-6 p-4 pb-32">
          {/* Hero Card: Pending Deposit - Shows ACTUAL pending balance (money owed to manager) */}
          <div className="relative overflow-hidden flex flex-col items-stretch justify-start rounded-xl shadow-lg bg-white border border-gray-100">
            {/* Status Icon */}
            <div className="absolute top-4 right-4 z-10">
              {pendingSubmissions.length > 0 ? (
                <div className="bg-amber-100 text-amber-600 p-2.5 rounded-full animate-pulse">
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              ) : hasPendingDeposit ? (
                <div className="bg-amber-50 text-amber-500 p-2.5 rounded-full">
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              ) : (
                <div className="bg-green-100 text-green-600 p-2.5 rounded-full">
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Gradient Background */}
            <div className="w-full h-32 bg-gradient-to-br from-[#13ecb9]/10 to-transparent"></div>

            {/* Content */}
            <div className="flex w-full flex-col items-start justify-center gap-2 p-6 -mt-10 bg-white rounded-t-2xl">
              <p className="text-[#618980] text-xs font-bold uppercase tracking-wider">
                Pending Deposit (Owed to Manager)
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-[#111816] text-4xl font-bold leading-none tracking-tight">
                  {loading ? "—" : formatCurrency(actualPendingDeposit)}
                </span>
                <span className="text-[#618980] text-sm font-medium">LKR</span>
              </div>

              {/* Show breakdown if there are pending submissions */}
              {pendingSubmissions.length > 0 && (
                <div className="w-full bg-amber-50 rounded-lg p-3 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">In Process:</span>
                    <span className="font-bold text-amber-700">
                      {formatCurrency(totalPendingSubmissions)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-amber-700">Available to Submit:</span>
                    <span className="font-bold text-amber-700">
                      {formatCurrency(availableToSubmit)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex w-full items-center gap-3 justify-between mt-4">
                <div className="flex flex-col">
                  <p className="text-[#111816] text-sm font-semibold">
                    {!hasPendingDeposit
                      ? "All deposits cleared!"
                      : pendingSubmissions.length > 0
                        ? `${pendingSubmissions.length} transfer(s) in process`
                        : "Amount to be Deposited"}
                  </p>
                  <p className="text-[#618980] text-xs">
                    {!hasPendingDeposit
                      ? "No pending deposits"
                      : pendingSubmissions.length > 0
                        ? "Waiting for manager approval"
                        : `${balance?.hours_until_midnight || 0}h until midnight deadline`}
                  </p>
                </div>
                {canSubmitNew && (
                  <button
                    onClick={() => {
                      setSubmitForm({
                        amount: availableToSubmit.toFixed(2),
                      });
                      setShowSubmitModal(true);
                    }}
                    className="flex min-w-[100px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-9 px-4 text-sm font-bold shadow-sm transition-opacity bg-[#13ecb9] text-[#111816] hover:opacity-90"
                  >
                    + New Transfer
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Manager Bank Account Details */}
          {managerBank && (
            <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-100/60 border-b border-blue-200">
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 10h18M3 6h18M3 14h18M3 18h18"
                  />
                </svg>
                <span className="text-blue-800 text-sm font-bold">
                  Deposit to This Account
                </span>
              </div>
              <div className="p-4 space-y-3">
                {/* Account Number - Large */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 mb-1">
                    Account Number
                  </p>
                  <p className="text-[#111816] text-2xl font-bold tracking-wider font-mono">
                    {managerBank.account_number}
                  </p>
                </div>
                <div className="h-px bg-blue-200/60" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 mb-0.5">
                      Account Holder
                    </p>
                    <p className="text-[#111816] text-sm font-semibold">
                      {managerBank.account_holder_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 mb-0.5">
                      Bank Name
                    </p>
                    <p className="text-[#111816] text-sm font-semibold">
                      {managerBank.bank_name}
                    </p>
                  </div>
                </div>
                {managerBank.branch_name && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 mb-0.5">
                      Branch
                    </p>
                    <p className="text-[#111816] text-sm font-semibold">
                      {managerBank.branch_name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent Transfers Section */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[#111816] text-lg font-bold leading-tight tracking-tight">
                Recent Transfers
              </h3>
              <button className="text-[#13ecb9] text-sm font-bold">
                Filter
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {loading ? (
                // Skeleton loaders
                [...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm animate-pulse"
                  >
                    <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                    <div className="flex flex-col flex-1 gap-2">
                      <div className="h-4 bg-gray-200 rounded w-24"></div>
                      <div className="h-3 bg-gray-100 rounded w-32"></div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-20"></div>
                  </div>
                ))
              ) : deposits.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-xl border border-gray-100">
                  <div className="text-4xl mb-2">📤</div>
                  <p className="text-gray-500 text-sm">No transfers yet</p>
                </div>
              ) : (
                deposits.map((deposit, index) => (
                  <div
                    key={deposit.id}
                    className={`flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm ${
                      index >= 3 ? "opacity-80" : ""
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`flex items-center justify-center rounded-lg shrink-0 size-12 ${
                        deposit.status === "pending"
                          ? "bg-amber-50 text-amber-600"
                          : deposit.status === "approved"
                            ? "bg-[#13ecb9]/10 text-[#13ecb9]"
                            : "bg-red-50 text-red-500"
                      }`}
                    >
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                        />
                      </svg>
                    </div>

                    {/* Content */}
                    <div className="flex flex-col flex-1">
                      <div className="flex justify-between items-start">
                        <p className="text-[#111816] text-base font-bold">
                          {formatCurrency(
                            deposit.approved_amount || deposit.amount,
                          )}
                        </p>
                        <span
                          className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${
                            deposit.status === "pending"
                              ? "bg-amber-50 text-amber-600"
                              : deposit.status === "approved"
                                ? "bg-green-50 text-green-600"
                                : "bg-red-50 text-red-600"
                          }`}
                        >
                          {deposit.status === "pending"
                            ? "In Process"
                            : deposit.status === "approved"
                              ? "Verified"
                              : "Rejected"}
                        </span>
                      </div>
                      <p className="text-[#618980] text-xs mt-0.5">
                        {formatDateTime(deposit.created_at)}
                      </p>
                      {deposit.review_note && (
                        <p className="text-[#618980] text-xs mt-1 italic">
                          Note: {deposit.review_note}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        {/* Floating Action Button - shows when there's available amount to submit */}
        {canSubmitNew && (
          <div className="fixed bottom-8 right-8 flex flex-col items-center z-20">
            <button
              onClick={() => {
                setSubmitForm({
                  amount: availableToSubmit.toFixed(2),
                });
                setShowSubmitModal(true);
              }}
              className="flex size-14 items-center justify-center rounded-full bg-[#13ecb9] text-[#111816] shadow-xl hover:scale-105 transition-transform active:scale-95"
            >
              <svg
                className="w-7 h-7"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            <span className="mt-2 text-[10px] font-bold uppercase text-[#111816] tracking-widest bg-white/90 backdrop-blur px-2 py-0.5 rounded shadow-sm">
              New Transfer
            </span>
          </div>
        )}
        {/* Tab Bar Spacing */}
        <div className="h-24"></div>
        {/* iOS Bottom Indicator */}
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto flex justify-center pb-2 bg-gradient-to-t from-white/80 to-transparent pointer-events-none">
          <div className="w-32 h-1.5 bg-gray-300 rounded-full"></div>
        </div>
        {/* Submit Deposit Modal */}
        {showSubmitModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={() => setShowSubmitModal(false)}
          >
            <div
              className="bg-white w-full max-w-md rounded-t-3xl p-6 animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-[#111816]">
                  Submit Bank Transfer
                </h3>
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="p-2"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <form
                onSubmit={handleSubmitDeposit}
                className="flex flex-col gap-4"
              >
                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-[#618980] mb-1">
                    Transfer Amount (LKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    max={availableToSubmit}
                    value={submitForm.amount}
                    onChange={(e) =>
                      setSubmitForm({ ...submitForm, amount: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#13ecb9] focus:border-transparent outline-none text-lg font-bold"
                    placeholder="0.00"
                    required
                  />
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-[#618980]">
                      Total Owed: {formatCurrency(actualPendingDeposit)}
                    </p>
                    {totalPendingSubmissions > 0 && (
                      <p className="text-xs text-amber-600">
                        In Process: {formatCurrency(totalPendingSubmissions)}
                      </p>
                    )}
                    <p className="text-xs text-green-600 font-medium">
                      Available to Submit: {formatCurrency(availableToSubmit)}
                    </p>
                  </div>
                </div>

                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-[#618980] mb-1">
                    Proof of Transfer *
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,.pdf"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full p-4 border-2 border-dashed rounded-xl text-center transition-colors ${
                      selectedFile
                        ? "border-[#13ecb9] bg-[#13ecb9]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <svg
                          className="w-5 h-5 text-[#13ecb9]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="text-sm font-medium text-[#111816]">
                          {selectedFile.name}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <svg
                          className="w-8 h-8 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                          />
                        </svg>
                        <span className="text-sm text-gray-500">
                          Upload screenshot or PDF
                        </span>
                      </div>
                    )}
                  </button>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting || !selectedFile}
                  className="w-full py-4 bg-[#13ecb9] text-[#111816] font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {submitting ? "Submitting..." : "Submit for Approval"}
                </button>
              </form>
            </div>
          </div>
        )}
        <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
      </div>
    </DriverLayout>
  );
}
