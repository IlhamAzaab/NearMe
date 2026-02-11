import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import {
  ManagerPageSkeleton,
  ManagerSkeletonList,
  ManagerSkeletonCard,
} from "../../components/ManagerSkeleton";
import supabaseClient from "../../supabaseClient";
import { useNotification } from "../../contexts/NotificationContext";

export default function ManagerDeposits() {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false); // Separate loading state for tab switches
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("pending"); // 'pending' or 'approved'
  const [selectedPeriod, setSelectedPeriod] = useState("today"); // Period filter
  const [summary, setSummary] = useState({
    total_sales_today: 0,
    todays_sales: 0,
    prev_pending: 0,
    pending: 0,
    paid: 0,
    pending_deposits_count: 0,
  });
  const [deposits, setDeposits] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const prevTabRef = useRef(activeTab);

  // Fetch deposits for a specific tab status
  const fetchDepositsForTab = useCallback(async (tabStatus) => {
    try {
      const token = localStorage.getItem("token");
      const status = tabStatus === "pending" ? "pending" : "approved";
      const url =
        tabStatus === "pending"
          ? "http://localhost:5000/driver/deposits/manager/pending"
          : `http://localhost:5000/driver/deposits/manager/all?status=${status}&limit=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        return data.deposits || [];
      }
      return [];
    } catch (error) {
      console.error("Failed to fetch deposits:", error);
      return [];
    }
  }, []);

  // Memoized fetch function for auto-refresh
  const fetchData = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      else setRefreshing(true);

      await Promise.all([fetchSummary(), fetchDeposits()]);

      setLoading(false);
      setRefreshing(false);
      setLastRefresh(new Date());
    },
    [activeTab],
  );

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "manager" && role !== "admin") {
      navigate("/login");
      return;
    }
    fetchData(true);
  }, [navigate]);

  // Handle tab changes - clear deposits and show skeleton while loading
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      // Tab changed - clear deposits immediately and show loading
      setDeposits([]);
      setTabLoading(true);
      prevTabRef.current = activeTab;

      // Fetch new data for the selected tab
      fetchDepositsForTab(activeTab).then((newDeposits) => {
        setDeposits(newDeposits);
        setTabLoading(false);
      });
    }
  }, [activeTab, fetchDepositsForTab]);

  // Subscribe to real-time deposit changes for managers
  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "manager" && role !== "admin") {
      return;
    }

    // Listen for new pending deposits (when drivers submit)
    const insertChannel = supabaseClient
      .channel("deposits:manager-new")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "driver_deposits",
          filter: "status=eq.pending",
        },
        async (payload) => {
          const newDeposit = payload.new;

          // Show notification
          addNotification(`💰 New deposit request received!`, "info", 5000);

          // Refresh the data to show the new deposit
          await fetchSummary();
          if (activeTab === "pending") {
            const updatedDeposits = await fetchDepositsForTab("pending");
            setDeposits(updatedDeposits);
          }
        },
      )
      .subscribe();

    // Listen for status updates (approved/rejected)
    const updateChannel = supabaseClient
      .channel("deposits:manager-update")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "driver_deposits",
        },
        async (payload) => {
          // Refresh summary when any deposit status changes
          await fetchSummary();

          // Refresh the current tab's deposits
          const updatedDeposits = await fetchDepositsForTab(activeTab);
          setDeposits(updatedDeposits);
        },
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(insertChannel);
      supabaseClient.removeChannel(updateChannel);
    };
  }, [addNotification, activeTab, fetchDepositsForTab]);

  const fetchSummary = async (period) => {
    try {
      const token = localStorage.getItem("token");
      const p = period || selectedPeriod;
      const res = await fetch(
        `http://localhost:5000/driver/deposits/manager/summary?period=${p}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (data.success) {
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Failed to fetch summary:", error);
    }
  };

  const fetchDeposits = async () => {
    try {
      const token = localStorage.getItem("token");
      const status = activeTab === "pending" ? "pending" : "approved";
      const url =
        activeTab === "pending"
          ? "http://localhost:5000/driver/deposits/manager/pending"
          : `http://localhost:5000/driver/deposits/manager/all?status=${status}&limit=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDeposits(data.deposits || []);
      }
    } catch (error) {
      console.error("Failed to fetch deposits:", error);
    }
  };

  const formatCurrency = (value) => `Rs.${Number(value || 0).toFixed(2)}`;

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDriverInitials = (name) => {
    if (!name) return "DR";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const isPdfDeposit = (deposit) => {
    if (!deposit) return false;
    return deposit.proof_type === "pdf" || deposit.proof_url?.includes(".pdf");
  };

  // Get image preview URL (converts PDF to image via Cloudinary)
  const getPreviewUrl = (deposit) => {
    if (!deposit?.proof_url) return "";

    if (isPdfDeposit(deposit) && deposit.proof_url.includes("cloudinary.com")) {
      let url = deposit.proof_url;

      // If it's a raw URL, convert to image URL first
      if (url.includes("/raw/upload/")) {
        url = url.replace("/raw/upload/", "/image/upload/");
      }

      // Transform: add pg_1 and resize for thumbnail
      return url
        .replace("/upload/", "/upload/pg_1,w_200,h_280,c_fill/")
        .replace(".pdf", ".jpg");
    }

    return deposit.proof_url;
  };

  const handleVerifyDeposit = (depositId) => {
    navigate(`/manager/deposits/verify/${depositId}`);
  };

  // Manual refresh function
  const handleRefresh = () => {
    fetchData(false);
  };

  if (loading) {
    return <ManagerPageSkeleton type="deposits" />;
  }

  return (
    <ManagerPageLayout
      title="Driver Deposits"
      onRefresh={handleRefresh}
      refreshing={refreshing}
    >
      <div className="max-w-2xl mx-auto lg:max-w-none">
        {/* Summary Hero Section */}
        <div className="p-4 pb-2">
          {/* Period Selector */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {[
              { key: "today", label: "Today" },
              { key: "yesterday", label: "Yesterday" },
              { key: "this_week", label: "This Week" },
              { key: "this_month", label: "This Month" },
              { key: "all_time", label: "All Time" },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setSelectedPeriod(p.key);
                  setRefreshing(true);
                  fetchSummary(p.key).then(() => setRefreshing(false));
                }}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                  selectedPeriod === p.key
                    ? "bg-[#13ecb9] text-[#111816] border-[#13ecb9]"
                    : "bg-white text-[#618980] border-[#dbe6e3] hover:border-[#13ecb9]/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="bg-[#13ecb9] rounded-xl p-6 shadow-lg shadow-[#13ecb9]/20 flex flex-col gap-4 relative overflow-hidden">
            {/* Abstract pattern overlay */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 2px 2px, black 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            ></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col gap-1">
                  <p className="text-[#111816] text-sm font-semibold uppercase tracking-wider opacity-70">
                    {selectedPeriod === "today"
                      ? "Overall Performance"
                      : selectedPeriod === "yesterday"
                        ? "Yesterday's Report"
                        : selectedPeriod === "this_week"
                          ? "This Week"
                          : selectedPeriod === "this_month"
                            ? "This Month"
                            : "All Time"}
                  </p>
                  <h2 className="text-[#111816] text-4xl font-bold leading-tight">
                    {formatCurrency(summary.total_sales_today)}
                  </h2>
                  <p className="text-[#111816] text-base font-medium">
                    {selectedPeriod === "today"
                      ? "Total Sales Today"
                      : selectedPeriod === "yesterday"
                        ? "Total Sales Yesterday"
                        : "Total Sales"}
                  </p>
                </div>
                <div className="bg-white/30 p-2 rounded-lg">
                  <span className="material-symbols-outlined text-[#111816]">
                    trending_up
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-[#111816]/10 pt-4">
                <div className="flex flex-col">
                  <p className="text-[#111816] text-xs font-medium opacity-70">
                    {selectedPeriod === "today"
                      ? "Today's Sales"
                      : selectedPeriod === "yesterday"
                        ? "Day's Sales"
                        : "Period Sales"}
                  </p>
                  <p className="text-[#111816] text-lg font-bold">
                    {formatCurrency(summary.todays_sales)}
                  </p>
                </div>
                <div className="flex flex-col border-l border-[#111816]/10 pl-4">
                  <p className="text-[#111816] text-xs font-medium opacity-70">
                    Prev. Pending
                  </p>
                  <p className="text-[#111816] text-lg font-bold">
                    {formatCurrency(summary.prev_pending)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="flex gap-4 px-4 pb-4">
          <div className="flex flex-1 flex-col gap-2 rounded-xl p-4 bg-white border border-[#dbe6e3]">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-amber-500 text-sm">
                hourglass_empty
              </span>
              <p className="text-[#618980] text-xs font-bold uppercase tracking-wider">
                Pending
              </p>
            </div>
            <p className="text-[#111816] tracking-tight text-xl font-bold">
              {formatCurrency(summary.pending)}
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-2 rounded-xl p-4 bg-white border border-[#dbe6e3]">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-[#13ecb9] text-sm">
                check_circle
              </span>
              <p className="text-[#618980] text-xs font-bold uppercase tracking-wider">
                Paid
              </p>
            </div>
            <p className="text-[#111816] tracking-tight text-xl font-bold">
              {formatCurrency(summary.paid)}
            </p>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="sticky top-[64px] bg-[#f6f8f8] z-10 px-4">
          <div className="flex bg-gray-200/50 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md font-bold text-sm transition-all ${
                activeTab === "pending"
                  ? "bg-white shadow-sm text-[#111816]"
                  : "text-[#618980]"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                pending_actions
              </span>
              Pending
              {summary.pending_deposits_count > 0 && (
                <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {summary.pending_deposits_count}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("approved")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md font-bold text-sm transition-all ${
                activeTab === "approved"
                  ? "bg-white shadow-sm text-[#111816]"
                  : "text-[#618980]"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                verified
              </span>
              Approved
            </button>
          </div>
        </div>

        {/* Scrollable Transaction List */}
        <div className="flex flex-col p-4 gap-3 pb-24">
          <p className="text-xs font-bold text-[#618980] uppercase tracking-widest mb-1">
            {activeTab === "pending"
              ? "Pending Submissions"
              : "Approved Deposits"}
          </p>

          {tabLoading ? (
            // Show skeleton while loading tab data
            <ManagerSkeletonList count={3} />
          ) : deposits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">
                {activeTab === "pending" ? "inbox" : "verified"}
              </span>
              <p className="text-gray-500 font-medium">
                {activeTab === "pending"
                  ? "No pending deposits to review"
                  : "No approved deposits yet"}
              </p>
            </div>
          ) : (
            deposits.map((deposit) => (
              <div
                key={deposit.id}
                className="flex flex-col bg-white rounded-xl border border-[#dbe6e3] overflow-hidden active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-4 p-4">
                  <div className="bg-[#13ecb9]/20 flex items-center justify-center aspect-square rounded-full h-12 w-12 text-[#13ecb9] font-bold">
                    {getDriverInitials(deposit.driver?.full_name)}
                  </div>
                  <div className="flex flex-1 flex-col justify-center">
                    <p className="text-[#111816] text-base font-bold leading-none mb-1">
                      {deposit.driver?.full_name || "Driver"}
                    </p>
                    <p className="text-[#618980] text-xs font-medium">
                      {deposit.driver?.phone || "No phone"}
                    </p>
                    <p className="text-[#618980] text-xs">
                      {formatDateTime(deposit.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#111816] font-bold">
                      {formatCurrency(
                        activeTab === "approved"
                          ? deposit.approved_amount
                          : deposit.amount,
                      )}
                    </p>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        deposit.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : deposit.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {deposit.status === "pending"
                        ? "Awaiting"
                        : deposit.status}
                    </span>
                  </div>
                </div>

                {activeTab === "pending" && (
                  <div className="px-4 pb-4 flex items-center gap-3">
                    <div className="relative h-14 w-20 rounded-lg overflow-hidden border border-[#dbe6e3] flex-shrink-0">
                      {deposit.proof_url ? (
                        <>
                          <img
                            className="h-full w-full object-cover"
                            src={getPreviewUrl(deposit)}
                            alt="Receipt"
                            onError={(e) => {
                              e.target.parentElement.innerHTML = `<div class="flex items-center justify-center h-full bg-gray-100"><span class="material-symbols-outlined text-gray-400">description</span></div>`;
                            }}
                          />
                          {isPdfDeposit(deposit) && (
                            <div className="absolute bottom-0.5 right-0.5 bg-red-500 text-white text-[8px] px-1 rounded font-bold">
                              PDF
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                            <span className="material-symbols-outlined text-white text-sm">
                              visibility
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full bg-gray-100">
                          <span className="material-symbols-outlined text-gray-400">
                            image
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <button
                        onClick={() => handleVerifyDeposit(deposit.id)}
                        className="w-full bg-[#13ecb9] py-2 rounded-lg text-[#111816] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#10d9a8] transition-colors"
                      >
                        Verify Deposit
                        <span className="material-symbols-outlined text-sm">
                          arrow_forward
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === "approved" && deposit.review_note && (
                  <div className="px-4 pb-4">
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">Note:</span>{" "}
                      {deposit.review_note}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </ManagerPageLayout>
  );
}
