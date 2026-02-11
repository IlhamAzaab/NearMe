import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ManagerPageLayout from "../../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../../components/ManagerSkeleton";

export default function ManagerDriverPayments() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [summary, setSummary] = useState({
    total_to_pay: 0,
    paid_today: 0,
    driver_count: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [summaryRes, driversRes] = await Promise.all([
        fetch("http://localhost:5000/manager/driver-payments/summary", {
          headers,
        }),
        fetch("http://localhost:5000/manager/driver-payments/drivers", {
          headers,
        }),
      ]);

      const summaryData = await summaryRes.json();
      const driversData = await driversRes.json();

      if (summaryData.success) setSummary(summaryData.summary);
      if (driversData.success) setDrivers(driversData.drivers);
    } catch (error) {
      console.error("Failed to fetch driver payments data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const filteredDrivers = drivers.filter((d) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (d.full_name || "").toLowerCase().includes(q) ||
      (d.user_name || "").toLowerCase().includes(q) ||
      (d.phone || "").includes(q)
    );
  });

  // Skeleton loader
  if (loading) {
    return (
      <ManagerPageLayout title="Driver Payments">
        <ManagerPageSkeleton type="payments" />
      </ManagerPageLayout>
    );
  }

  return (
    <ManagerPageLayout
      title="Driver Payments"
      onRefresh={handleRefresh}
      refreshing={refreshing}
    >
      <div className="p-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Total to Pay */}
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-red-500 text-lg">
                account_balance_wallet
              </span>
              <span className="text-xs font-medium text-red-600">
                Total to Pay
              </span>
            </div>
            <p className="text-xl font-bold text-red-700">
              Rs.{summary.total_to_pay?.toFixed(2)}
            </p>
            <p className="text-[10px] text-red-500 mt-1">
              {summary.driver_count} active driver
              {summary.driver_count !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Paid Today */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-4 border border-green-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-green-500 text-lg">
                payments
              </span>
              <span className="text-xs font-medium text-green-600">
                Paid Today
              </span>
            </div>
            <p className="text-xl font-bold text-green-700">
              Rs.{summary.paid_today?.toFixed(2)}
            </p>
            <p className="text-[10px] text-green-500 mt-1">
              Transfers completed today
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#618980] text-lg">
            search
          </span>
          <input
            type="text"
            placeholder="Search drivers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#dbe6e3] rounded-xl text-sm text-[#111816] placeholder-[#618980]/50 focus:outline-none focus:ring-2 focus:ring-[#13ecb9]/30 focus:border-[#13ecb9]"
          />
        </div>

        {/* Driver List */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[#111816] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#13ecb9] text-lg">
              group
            </span>
            Drivers ({filteredDrivers.length})
          </h2>

          {filteredDrivers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#dbe6e3] p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-[#618980]/30 mb-2">
                person_off
              </span>
              <p className="text-sm text-[#618980]">
                {searchQuery
                  ? "No drivers match your search"
                  : "No active drivers found"}
              </p>
            </div>
          ) : (
            filteredDrivers.map((driver) => (
              <button
                key={driver.id}
                onClick={() =>
                  navigate(`/manager/driver-payments/${driver.id}`)
                }
                className="w-full bg-white rounded-2xl border border-[#dbe6e3] p-4 text-left hover:border-[#13ecb9] hover:shadow-md transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {driver.profile_photo_url ? (
                      <img
                        src={driver.profile_photo_url}
                        alt={driver.full_name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-[#dbe6e3]"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#13ecb9]/20 to-[#13ecb9]/40 flex items-center justify-center border-2 border-[#dbe6e3]">
                        <span className="text-lg font-bold text-[#13ecb9]">
                          {(driver.full_name || "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* Verified badge */}
                    {driver.is_verified && (
                      <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5">
                        <span
                          className="material-symbols-outlined text-white text-xs"
                          style={{ fontSize: "12px" }}
                        >
                          check
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Driver Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#111816] truncate">
                        {driver.full_name || "Unknown Driver"}
                      </h3>
                      {driver.is_verified && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold rounded-full uppercase">
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#618980] truncate">
                      {driver.phone || "No phone"} &middot;{" "}
                      {driver.delivery_count} deliveries
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <p
                      className={`text-sm font-bold ${
                        driver.withdrawal_balance > 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      Rs.{driver.withdrawal_balance?.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-[#618980]">pending</p>
                  </div>

                  <span className="material-symbols-outlined text-[#618980] text-lg">
                    chevron_right
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </ManagerPageLayout>
  );
}
