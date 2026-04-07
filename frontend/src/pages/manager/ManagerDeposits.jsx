import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import {
  ManagerPageSkeleton,
  ManagerSkeletonList,
} from "../../components/ManagerSkeleton";
import supabaseClient from "../../supabaseClient";
import { useNotification } from "../../contexts/NotificationContext";
import { API_URL } from "../../config";

const SRI_LANKA_TIME_ZONE = "Asia/Colombo";

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchSummary(period, token) {
  const res = await fetch(
    `${API_URL}/driver/deposits/manager/summary?period=${period}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Failed to fetch summary");
  return data.summary;
}

async function fetchDriversDetailed(period, token) {
  const res = await fetch(
    `${API_URL}/driver/deposits/manager/drivers-detailed?period=${period}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Failed to fetch drivers");
  return { drivers: data.drivers || [], totals: data.totals || {} };
}

async function fetchDepositsForTab(tabStatus, token) {
  const status = tabStatus === "pending" ? "pending" : "approved";
  const url =
    tabStatus === "pending"
      ? `${API_URL}/driver/deposits/manager/pending`
      : `${API_URL}/driver/deposits/manager/all?status=${status}&limit=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success)
    throw new Error(data.message || "Failed to fetch deposits");
  return data.deposits || [];
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ManagerDeposits() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotification();
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedPeriod, setSelectedPeriod] = useState("today");

  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // Redirect if not manager/admin
  useEffect(() => {
    if (role !== "manager" && role !== "admin") {
      navigate("/login");
    }
  }, [role, navigate]);

  // ============================================================================
  // REACT QUERY HOOKS
  // ============================================================================

  // Summary data query
  const {
    data: summary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
  } = useQuery({
    queryKey: ["manager", "deposits", "summary", selectedPeriod],
    queryFn: () => fetchSummary(selectedPeriod, token),
    enabled: !!token && (role === "manager" || role === "admin"),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every minute
  });

  // Drivers with balances query
  const {
    data: driversData,
    isLoading: driversLoading,
    isFetching: driversFetching,
  } = useQuery({
    queryKey: ["manager", "deposits", "drivers-detailed", selectedPeriod],
    queryFn: () => fetchDriversDetailed(selectedPeriod, token),
    enabled: !!token && (role === "manager" || role === "admin"),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Deposits list query
  const {
    data: deposits,
    isLoading: depositsLoading,
    isFetching: depositsFetching,
  } = useQuery({
    queryKey: ["manager", "deposits", "list", activeTab],
    queryFn: () => fetchDepositsForTab(activeTab, token),
    enabled: !!token && (role === "manager" || role === "admin"),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // ============================================================================
  // REAL-TIME SUBSCRIPTIONS
  // ============================================================================

  useEffect(() => {
    if (role !== "manager" && role !== "admin") return;

    // Listen for new pending deposits
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
        () => {
          addNotification("New deposit request received!", "info", 5000);
          queryClient.invalidateQueries({
            queryKey: ["manager", "deposits"],
          });
        },
      )
      .subscribe();

    // Listen for status updates
    const updateChannel = supabaseClient
      .channel("deposits:manager-update")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "driver_deposits",
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["manager", "deposits"],
          });
        },
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(insertChannel);
      supabaseClient.removeChannel(updateChannel);
    };
  }, [role, addNotification, queryClient]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["manager", "deposits"] });
  };

  const handleVerifyDeposit = (depositId) => {
    navigate(`/manager/deposits/verify/${depositId}`);
  };

  // ============================================================================
  // UTILITIES
  // ============================================================================

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

  const getTransferId = (id) =>
    String(id || "-")
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

  const isPdfDeposit = (deposit) => {
    if (!deposit) return false;
    return deposit.proof_type === "pdf" || deposit.proof_url?.includes(".pdf");
  };

  const getPreviewUrl = (deposit) => {
    if (!deposit?.proof_url) return "";
    if (isPdfDeposit(deposit) && deposit.proof_url.includes("cloudinary.com")) {
      let url = deposit.proof_url;
      if (url.includes("/raw/upload/")) {
        url = url.replace("/raw/upload/", "/image/upload/");
      }
      return url
        .replace("/upload/", "/upload/pg_1,w_200,h_280,c_fill/")
        .replace(".pdf", ".jpg");
    }
    return deposit.proof_url;
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  const isInitialLoading = summaryLoading || driversLoading || depositsLoading;
  const isRefreshing = summaryFetching || driversFetching || depositsFetching;

  if (isInitialLoading) {
    return <ManagerPageSkeleton type="deposits" />;
  }

  const driversWithBalances = driversData?.drivers || [];
  const driverTotals = driversData?.totals || {};

  return (
    <ManagerPageLayout
      title="Driver Deposits"
      onRefresh={handleRefresh}
      refreshing={isRefreshing}
    >
      <div className="max-w-2xl mx-auto lg:max-w-none">
        {/* Summary Hero Section */}
        <div className="p-4 pb-2">
          {/* Period Selector - Only Today and Yesterday */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {[
              { key: "today", label: "Today" },
              { key: "yesterday", label: "Yesterday" },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => handlePeriodChange(p.key)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all border ${
                  selectedPeriod === p.key
                    ? "bg-[#13ecb9] text-[#111816] border-[#13ecb9]"
                    : "bg-white text-[#618980] border-[#dbe6e3] hover:border-[#13ecb9]/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Main Summary Card */}
          <div className="bg-[#13ecb9] rounded-xl p-6 shadow-lg shadow-[#13ecb9]/20 flex flex-col gap-4 relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 2px 2px, black 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col gap-1">
                  <p className="text-[#111816] text-sm font-semibold uppercase tracking-wider opacity-70">
                    {selectedPeriod === "today"
                      ? "Overall Performance"
                      : "Yesterday's Report"}
                  </p>
                  <h2 className="text-[#111816] text-4xl font-bold leading-tight">
                    {formatCurrency(summary?.total_sales_today || 0)}
                  </h2>
                  <p className="text-[#111816] text-base font-medium">
                    {selectedPeriod === "today"
                      ? "Total Sales Today"
                      : "Total Sales Yesterday"}
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
                      : "Day's Sales"}
                  </p>
                  <p className="text-[#111816] text-lg font-bold">
                    {formatCurrency(summary?.todays_sales || 0)}
                  </p>
                </div>
                <div className="flex flex-col border-l border-[#111816]/10 pl-4">
                  <p className="text-[#111816] text-xs font-medium opacity-70">
                    Prev. Pending
                  </p>
                  <p className="text-[#111816] text-lg font-bold">
                    {formatCurrency(summary?.prev_pending || 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Metric Cards - Pending & Paid */}
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
              {formatCurrency(summary?.pending || 0)}
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
              {formatCurrency(summary?.paid || 0)}
            </p>
          </div>
        </div>

        {/* Driver Balances Section */}
        {driversWithBalances.length > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
              <div className="p-4 border-b border-[#dbe6e3] bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#13ecb9]">
                      group
                    </span>
                    <h3 className="text-[#111816] font-bold">
                      Driver Balances
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-[#618980] text-xs">Total Pending</p>
                    <p className="text-[#111816] font-bold">
                      {formatCurrency(driverTotals.total_pending_balance || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-[#dbe6e3]">
                {driversWithBalances.map((driver) => (
                  <div key={driver.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-[#13ecb9]/20 flex items-center justify-center aspect-square rounded-full h-10 w-10 text-[#13ecb9] font-bold text-sm">
                        {getDriverInitials(driver.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#111816] font-semibold truncate">
                          {driver.full_name || "Unknown Driver"}
                        </p>
                        <p className="text-[#618980] text-xs truncate">
                          {driver.phone || driver.email || "No contact"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p
                          className={`font-bold ${driver.pending_balance > 0 ? "text-amber-600" : "text-green-600"}`}
                        >
                          {formatCurrency(driver.pending_balance)}
                        </p>
                        <p className="text-[#618980] text-xs">Pending</p>
                      </div>
                    </div>

                    {/* Daily breakdown */}
                    <div className="mt-3 flex gap-4 text-xs">
                      <div className="flex-1 bg-gray-50 rounded-lg p-2">
                        <p className="text-[#618980]">
                          {selectedPeriod === "today"
                            ? "Collected"
                            : "Collected"}
                        </p>
                        <p className="text-[#111816] font-semibold">
                          {formatCurrency(driver.total_collected_today)}
                        </p>
                      </div>
                      <div className="flex-1 bg-gray-50 rounded-lg p-2">
                        <p className="text-[#618980]">
                          {selectedPeriod === "today" ? "Paid" : "Paid"}
                        </p>
                        <p className="text-[#111816] font-semibold">
                          {formatCurrency(driver.total_paid_today)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
              {(summary?.pending_deposits_count || 0) > 0 && (
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

          {depositsLoading ? (
            <ManagerSkeletonList count={3} />
          ) : !deposits || deposits.length === 0 ? (
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
                      {deposit.driver?.phone ||
                        deposit.driver?.email ||
                        "No contact"}
                    </p>
                    <p className="text-[#618980] text-xs">
                      {formatDateTime(deposit.created_at)}
                    </p>
                    <p className="text-[#4b5563] text-[11px] font-semibold mt-0.5">
                      {`Transfer ID: ${getTransferId(deposit.id)}`}
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
