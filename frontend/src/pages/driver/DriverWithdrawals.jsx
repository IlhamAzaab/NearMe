import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DriverLayout from "../../components/DriverLayout";
import { API_URL } from "../../config";

export default function DriverWithdrawals() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({
    total_earnings: 0,
    total_withdrawals: 0,
    remaining_balance: 0,
    today_withdrawals: 0,
    payment_count: 0,
  });
  const [payments, setPayments] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [summaryRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/driver/withdrawals/my/summary`, {
          headers,
        }),
        fetch(`${API_URL}/driver/withdrawals/my/history`, {
          headers,
        }),
      ]);

      const summaryData = await summaryRes.json();
      const historyData = await historyRes.json();

      if (summaryData.success) setSummary(summaryData.summary);
      if (historyData.success) setPayments(historyData.payments || []);
    } catch (err) {
      console.error("Failed to fetch withdrawals:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
      return;
    }
    fetchData();
  }, [navigate, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("en-LK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString("en-LK", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111816] text-white">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-white/10 rounded w-48 mx-auto"></div>
            <div className="h-36 bg-white/10 rounded-2xl"></div>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-white/10 rounded-2xl"></div>
              ))}
            </div>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-white/10 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DriverLayout>
      <div className="bg-[#111816] text-white relative">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-[#111816]/95 backdrop-blur-md border-b border-white/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate(-1)}
                className="p-2 -ml-2 text-white/60 hover:text-white"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h1 className="text-lg font-bold">My Withdrawals</h1>
              <button
                onClick={handleRefresh}
                className={`p-2 -mr-2 text-white/60 hover:text-[#13ecb9] transition-transform ${refreshing ? "animate-spin" : ""}`}
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-4 py-4 space-y-5 pb-28">
            {/* Remaining Balance - Hero Card */}
            <div className="bg-gradient-to-br from-[#13ecb9]/20 to-[#0fd9a8]/10 rounded-2xl p-6 border border-[#13ecb9]/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#13ecb9]/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <p className="text-xs font-medium text-[#13ecb9] uppercase tracking-wider mb-1">
                Remaining Balance
              </p>
              <p className="text-4xl font-bold text-white">
                Rs.{summary.remaining_balance?.toFixed(2)}
              </p>
              <p className="text-xs text-white/50 mt-2">
                This is what the platform still owes you
              </p>
            </div>

            {/* Deposit Request Button */}
            <button
              onClick={() => navigate("/driver/deposits")}
              className="w-full bg-gradient-to-r from-[#13ecb9] to-[#0fd9a8] text-[#111816] font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 hover:shadow-lg hover:shadow-[#13ecb9]/20 transition-all active:scale-[0.98]"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              Request Deposit
            </button>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <p className="text-[10px] font-medium text-white/40 uppercase">
                  Total Earned
                </p>
                <p className="text-sm font-bold text-white mt-1">
                  Rs.{summary.total_earnings?.toFixed(2)}
                </p>
              </div>
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <p className="text-[10px] font-medium text-white/40 uppercase">
                  Total Received
                </p>
                <p className="text-sm font-bold text-[#13ecb9] mt-1">
                  Rs.{summary.total_withdrawals?.toFixed(2)}
                </p>
              </div>
              <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                <p className="text-[10px] font-medium text-white/40 uppercase">
                  Today
                </p>
                <p className="text-sm font-bold text-[#13ecb9] mt-1">
                  Rs.{summary.today_withdrawals?.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Balance Breakdown Bar */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-white/50">Payment Progress</span>
                <span className="text-white/50">
                  {summary.total_earnings > 0
                    ? (
                        (summary.total_withdrawals / summary.total_earnings) *
                        100
                      ).toFixed(0)
                    : 0}
                  % received
                </span>
              </div>
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#13ecb9] to-[#0fd9a8] rounded-full transition-all duration-700"
                  style={{
                    width: `${summary.total_earnings > 0 ? Math.min(100, (summary.total_withdrawals / summary.total_earnings) * 100) : 0}%`,
                  }}
                ></div>
              </div>
              <div className="flex items-center justify-between mt-2 text-[10px]">
                <span className="text-[#13ecb9]">
                  Received: Rs.{summary.total_withdrawals?.toFixed(2)}
                </span>
                <span className="text-amber-400">
                  Pending: Rs.{summary.remaining_balance?.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment History */}
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                <svg
                  className="w-4 h-4 text-[#13ecb9]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Payment History ({payments.length})
              </h2>

              {payments.length === 0 ? (
                <div className="bg-white/5 rounded-2xl border border-white/5 p-10 text-center">
                  <svg
                    className="w-12 h-12 text-white/10 mx-auto mb-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                    />
                  </svg>
                  <p className="text-sm text-white/40">No withdrawals yet</p>
                  <p className="text-xs text-white/20 mt-1">
                    Payments from management will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <button
                      key={payment.id}
                      onClick={() => setSelectedPayment(payment)}
                      className="w-full bg-white/5 rounded-2xl border border-white/5 p-4 text-left hover:bg-white/8 transition-all active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-3">
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-full bg-[#13ecb9]/10 flex items-center justify-center flex-shrink-0">
                          <svg
                            className="w-5 h-5 text-[#13ecb9]"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white">
                            Rs.{parseFloat(payment.amount).toFixed(2)}
                          </p>
                          <p className="text-[10px] text-white/40 mt-0.5">
                            {formatDate(payment.created_at)} at{" "}
                            {formatTime(payment.created_at)}
                          </p>
                        </div>

                        {/* View Receipt */}
                        <div className="flex items-center gap-1 text-[#13ecb9]/60">
                          <span className="text-[10px] font-medium">View</span>
                          <svg
                            className="w-4 h-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                      {payment.note && (
                        <p className="text-xs text-white/30 mt-2 pl-13 italic truncate">
                          {payment.note}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Payment Detail Modal */}
          {selectedPayment && (
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center"
              onClick={() => setSelectedPayment(null)}
            >
              <div
                className="bg-[#1a2420] w-full max-w-md rounded-t-3xl animate-slide-up"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Handle bar */}
                <div className="flex justify-center py-3">
                  <div className="w-10 h-1 bg-white/20 rounded-full"></div>
                </div>

                <div className="px-5 pb-8 space-y-5">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">
                      Payment Details
                    </h3>
                    <button
                      onClick={() => setSelectedPayment(null)}
                      className="p-1 text-white/40 hover:text-white"
                    >
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Amount */}
                  <div className="text-center py-4">
                    <p className="text-xs text-[#13ecb9] uppercase font-medium mb-1">
                      Amount Received
                    </p>
                    <p className="text-4xl font-bold text-white">
                      Rs.{parseFloat(selectedPayment.amount).toFixed(2)}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <div className="w-2 h-2 bg-[#13ecb9] rounded-full"></div>
                      <span className="text-xs text-white/50">Completed</span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="bg-white/5 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Date</span>
                      <span className="text-xs font-medium text-white">
                        {formatDate(selectedPayment.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Time</span>
                      <span className="text-xs font-medium text-white">
                        {formatTime(selectedPayment.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">
                        Transaction ID
                      </span>
                      <span className="text-xs font-medium text-white font-mono">
                        {selectedPayment.id?.substring(0, 12).toUpperCase()}
                      </span>
                    </div>
                    {selectedPayment.note && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/40">Note</span>
                        <span className="text-xs font-medium text-white">
                          {selectedPayment.note}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment Receipt */}
                  {selectedPayment.proof_url && (
                    <div>
                      <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                        Transfer Receipt
                      </p>
                      {selectedPayment.proof_type === "pdf" ? (
                        <a
                          href={selectedPayment.proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 bg-white/5 rounded-xl p-4 hover:bg-white/8 transition-colors"
                        >
                          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                            <svg
                              className="w-6 h-6 text-red-400"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                              />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-white">
                              View PDF Receipt
                            </p>
                            <p className="text-xs text-white/40">
                              Tap to open in browser
                            </p>
                          </div>
                          <svg
                            className="w-4 h-4 text-white/30"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      ) : (
                        <div className="rounded-xl overflow-hidden border border-white/10">
                          <img
                            src={selectedPayment.proof_url}
                            alt="Transfer receipt"
                            className="w-full max-h-64 object-contain bg-black/30"
                            onClick={() =>
                              window.open(selectedPayment.proof_url, "_blank")
                            }
                          />
                          <div className="bg-white/5 px-3 py-2 flex items-center justify-between">
                            <span className="text-[10px] text-white/30">
                              Tap image to view full size
                            </span>
                            <a
                              href={selectedPayment.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-[#13ecb9] font-medium"
                            >
                              Open
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Navigation */}
          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#111816]/95 border-t border-white/5 flex justify-around items-center h-20 px-4 pb-6 backdrop-blur-lg z-40">
            <button
              className="flex flex-col items-center gap-1 opacity-50"
              onClick={() => navigate("/driver/dashboard")}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12l9-9 9 9v9H3z"
                />
              </svg>
              <span className="text-[10px] font-bold">Home</span>
            </button>
            <button
              className="flex flex-col items-center gap-1 opacity-50"
              onClick={() => navigate("/driver/earnings")}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8c-2 0-3 1-3 2s1 2 3 2 3 1 3 2-1 2-3 2m0-8V6m0 10v2"
                />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <span className="text-[10px] font-bold">Earnings</span>
            </button>
            <div className="flex flex-col items-center gap-1 text-[#13ecb9]">
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 10h18M7 15l5 5 5-5M12 15V3"
                />
              </svg>
              <span className="text-[10px] font-bold">Withdrawals</span>
            </div>
            <button
              className="flex flex-col items-center gap-1 opacity-50"
              onClick={() => navigate("/driver/profile")}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 12a4 4 0 100-8 4 4 0 000 8zm6 8a6 6 0 00-12 0"
                />
              </svg>
              <span className="text-[10px] font-bold">Profile</span>
            </button>
          </div>
        </div>

        {/* Styles */}
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
