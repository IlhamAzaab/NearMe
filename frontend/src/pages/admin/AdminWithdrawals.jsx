import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config";
import AdminLayout from "../../components/AdminLayout";

export default function AdminWithdrawals() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    total_earnings: 0,
    total_withdrawals: 0,
    remaining_balance: 0,
    today_withdrawals: 0,
    payment_count: 0,
  });
  const [payments, setPayments] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token");
      if (!token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const [summaryRes, paymentsRes] = await Promise.all([
        fetch(`${API_URL}/admin/withdrawals/admin/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/admin/withdrawals/admin/history`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const summaryData = await summaryRes.json();
      const paymentsData = await paymentsRes.json();

      if (summaryRes.ok && summaryData.summary) {
        setSummary(summaryData.summary);
      }
      if (paymentsRes.ok) {
        setPayments(paymentsData.payments || []);
      }
    } catch (err) {
      console.error("Error fetching withdrawal data:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="animate-pulse space-y-2">
            <div className="h-6 w-48 bg-gray-200 rounded" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
          <div className="bg-green-100 rounded-2xl p-6 animate-pulse">
            <div className="h-3 w-28 bg-green-200 rounded mb-3" />
            <div className="h-10 w-48 bg-green-200 rounded mb-2" />
            <div className="h-3 w-40 bg-green-200 rounded" />
          </div>
          <div className="grid grid-cols-3 gap-4 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-4 border border-gray-200"
              >
                <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
                <div className="h-6 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 animate-pulse">
            <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-2.5 w-full bg-gray-200 rounded-full" />
          </div>
          <div className="space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100"
              >
                <div className="w-10 h-10 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-gray-200 rounded" />
                  <div className="h-3 w-32 bg-gray-200 rounded" />
                </div>
                <div className="h-4 w-12 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <svg
              className="w-12 h-12 text-red-400 mx-auto mb-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchData}
              className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-medium hover:bg-red-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Withdrawals</h1>
            <p className="text-gray-500 text-sm mt-1">
              View your payment history
            </p>
          </div>
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-green-50 hover:bg-green-100 transition-colors text-green-600"
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

        {/* Balance Hero Card */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 border border-green-200 shadow-sm">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">
            Balance to Receive
          </p>
          <p className="text-4xl font-extrabold text-gray-900 tracking-tight">
            Rs.{summary.remaining_balance?.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            This is what the platform owes you
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Total Earned
            </p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              Rs.{summary.total_earnings?.toFixed(0)}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Total Received
            </p>
            <p className="text-lg font-bold text-green-600 mt-1">
              Rs.{summary.total_withdrawals?.toFixed(0)}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Today
            </p>
            <p className="text-lg font-bold text-green-600 mt-1">
              Rs.{summary.today_withdrawals?.toFixed(0)}
            </p>
          </div>
        </div>

        {/* Balance Breakdown Bar */}
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="text-gray-500 font-medium">Payment Progress</span>
            <span className="text-gray-500">
              {summary.total_earnings > 0
                ? (
                    (summary.total_withdrawals / summary.total_earnings) *
                    100
                  ).toFixed(0)
                : 0}
              % received
            </span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-700"
              style={{
                width: `${summary.total_earnings > 0 ? Math.min(100, (summary.total_withdrawals / summary.total_earnings) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px]">
            <span className="text-green-600 font-medium">
              Received: Rs.{summary.total_withdrawals?.toFixed(0)}
            </span>
            <span className="text-amber-600 font-medium">
              Pending: Rs.{summary.remaining_balance?.toFixed(0)}
            </span>
          </div>
        </div>

        {/* Payment History */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
            <svg
              className="w-5 h-5 text-green-600"
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
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-gray-400"
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
              </div>
              <p className="text-gray-600 font-medium">No withdrawals yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Payments from management will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <button
                  key={payment.id}
                  onClick={() => setSelectedPayment(payment)}
                  className="w-full bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                      <svg
                        className="w-5 h-5 text-green-600"
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800">
                        Rs.{parseFloat(payment.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(payment.created_at)} at{" "}
                        {formatTime(payment.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-gray-400">
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
                    <p className="text-xs text-gray-400 mt-2 pl-13 italic truncate">
                      {payment.note}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Payment Detail Modal */}
        {selectedPayment && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center"
            onClick={() => setSelectedPayment(null)}
          >
            <div
              className="bg-white w-full max-w-md rounded-t-3xl animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center py-3">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              <div className="px-5 pb-8 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-800">
                    Payment Details
                  </h3>
                  <button
                    onClick={() => setSelectedPayment(null)}
                    className="p-1 text-gray-400 hover:text-gray-600"
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

                <div className="text-center py-4">
                  <p className="text-xs text-green-600 uppercase font-semibold mb-1">
                    Amount Received
                  </p>
                  <p className="text-4xl font-bold text-gray-900">
                    Rs.{parseFloat(selectedPayment.amount).toFixed(2)}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-xs text-gray-500">Completed</span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Date</span>
                    <span className="text-xs font-medium text-gray-800">
                      {formatDate(selectedPayment.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Time</span>
                    <span className="text-xs font-medium text-gray-800">
                      {formatTime(selectedPayment.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Transaction ID
                    </span>
                    <span className="text-xs font-medium text-gray-800 font-mono">
                      {selectedPayment.id?.substring(0, 12).toUpperCase()}
                    </span>
                  </div>
                  {selectedPayment.note && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-xs text-gray-500">Note</span>
                      <span className="text-xs font-medium text-gray-800 text-right">
                        {selectedPayment.note}
                      </span>
                    </div>
                  )}
                </div>

                {selectedPayment.proof_url && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Transfer Receipt
                    </p>
                    {selectedPayment.proof_type === "pdf" ? (
                      <a
                        href={selectedPayment.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
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
                          <p className="text-sm font-medium text-gray-800">
                            View PDF Receipt
                          </p>
                          <p className="text-xs text-gray-400">
                            Tap to open in browser
                          </p>
                        </div>
                        <svg
                          className="w-4 h-4 text-gray-400"
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
                      <div className="rounded-xl overflow-hidden border border-gray-200">
                        <img
                          src={selectedPayment.proof_url}
                          alt="Transfer receipt"
                          className="w-full max-h-64 object-contain bg-gray-50"
                          onClick={() =>
                            window.open(selectedPayment.proof_url, "_blank")
                          }
                        />
                        <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                          <span className="text-[10px] text-gray-400">
                            Tap image to view full size
                          </span>
                          <a
                            href={selectedPayment.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-green-600 font-medium"
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
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </AdminLayout>
  );
}
