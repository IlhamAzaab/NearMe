/**
 * Driver Dashboard Page
 *
 * Features:
 * - Online/Offline status toggle with working time validation
 * - Today's earnings and deliveries stats
 * - Active time tracking
 * - Nearby delivery requests
 * - Bottom navigation
 * - Working time based status (full_time, day, night)
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

// Material Symbols CSS
const MaterialSymbolsCSS = () => (
  <link
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
    rel="stylesheet"
  />
);

// Working time display labels
const WORKING_TIME_LABELS = {
  full_time: "Full Time",
  day: "Day Shift (5AM - 7PM)",
  night: "Night Shift (6PM - 6AM)",
};

export default function DriverDashboard() {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(false);
  const [stats, setStats] = useState({
    todayEarnings: 0,
    todayDeliveries: 0,
    activeTime: "0.0",
  });
  const [availableDeliveries, setAvailableDeliveries] = useState([]);
  const [activeDeliveries, setActiveDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverProfile, setDriverProfile] = useState(null);
  const [acceptingOrder, setAcceptingOrder] = useState(null);
  const [withinWorkingHours, setWithinWorkingHours] = useState(true);
  const [manualOverrideActive, setManualOverrideActive] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Active time tracking
  const [activeStartTime, setActiveStartTime] = useState(null);
  const activeTimeRef = useRef(null);
  const workingHoursCheckRef = useRef(null);

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      navigate("/login");
    }
  }, [navigate]);

  // ============================================================================
  // FETCH DRIVER PROFILE
  // ============================================================================

  const fetchDriverProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:5000/driver/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDriverProfile(data.driver);
        setIsOnline(data.driver.driver_status === "active");
        setWithinWorkingHours(data.driver.within_working_hours);
        setManualOverrideActive(data.driver.manual_status_override || false);
      }
    } catch (error) {
      console.error("Profile fetch error:", error);
    }
  }, []);

  // ============================================================================
  // CHECK WORKING HOURS STATUS
  // ============================================================================

  const checkWorkingHoursStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        "http://localhost:5000/driver/working-hours-status",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setWithinWorkingHours(data.within_working_hours);
        setManualOverrideActive(data.manual_override);

        // If status was auto-updated, refresh the profile
        if (data.auto_updated) {
          setIsOnline(data.driver_status === "active");
          setStatusMessage(
            data.message || "Status changed due to working hours",
          );
          // Clear message after 5 seconds
          setTimeout(() => setStatusMessage(""), 5000);
        }
      }
    } catch (error) {
      console.error("Working hours check error:", error);
    }
  }, []);

  // ============================================================================
  // FETCH DASHBOARD DATA
  // ============================================================================

  const fetchDashboardData = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      // Fetch today's stats (earnings and deliveries)
      const statsRes = await fetch("http://localhost:5000/driver/stats/today", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats((prev) => ({
          ...prev,
          todayEarnings: statsData.earnings || 0,
          todayDeliveries: statsData.deliveries || 0,
        }));
      }

      // Fetch available deliveries (only shows for active drivers)
      const deliveriesRes = await fetch(
        "http://localhost:5000/driver/deliveries/pending",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (deliveriesRes.ok) {
        const deliveriesData = await deliveriesRes.json();
        setAvailableDeliveries(deliveriesData.deliveries || []);
      }

      // Fetch active deliveries (always fetch - inactive drivers can still have active deliveries)
      const activeDeliveriesRes = await fetch(
        "http://localhost:5000/driver/deliveries/active",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (activeDeliveriesRes.ok) {
        const activeDeliveriesData = await activeDeliveriesRes.json();
        setActiveDeliveries(activeDeliveriesData.deliveries || []);
      }
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchDriverProfile();
    fetchDashboardData();

    // Refresh data every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [fetchDriverProfile, fetchDashboardData]);

  // ============================================================================
  // WORKING HOURS CHECK (every minute)
  // ============================================================================

  useEffect(() => {
    // Check working hours status every minute
    workingHoursCheckRef.current = setInterval(checkWorkingHoursStatus, 60000);

    return () => {
      if (workingHoursCheckRef.current) {
        clearInterval(workingHoursCheckRef.current);
      }
    };
  }, [checkWorkingHoursStatus]);

  // ============================================================================
  // ACTIVE TIME TRACKING
  // ============================================================================

  useEffect(() => {
    if (isOnline && !activeStartTime) {
      setActiveStartTime(Date.now());
    } else if (!isOnline && activeStartTime) {
      setActiveStartTime(null);
    }
  }, [isOnline]);

  useEffect(() => {
    if (isOnline && activeStartTime) {
      activeTimeRef.current = setInterval(() => {
        const elapsed = (Date.now() - activeStartTime) / 1000 / 60 / 60; // hours
        setStats((prev) => ({
          ...prev,
          activeTime: elapsed.toFixed(1),
        }));
      }, 60000); // Update every minute
    }

    return () => {
      if (activeTimeRef.current) {
        clearInterval(activeTimeRef.current);
      }
    };
  }, [isOnline, activeStartTime]);

  // ============================================================================
  // TOGGLE ONLINE STATUS
  // ============================================================================

  const handleToggleOnline = async (manualOverride = false) => {
    try {
      const token = localStorage.getItem("token");
      const newStatus = !isOnline;

      // If trying to go online and outside working hours, show modal
      if (newStatus && !withinWorkingHours && !manualOverride) {
        setShowOverrideModal(true);
        return;
      }

      const res = await fetch("http://localhost:5000/driver/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus ? "active" : "inactive",
          manualOverride: manualOverride,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIsOnline(data.status === "active");
        setManualOverrideActive(data.manual_override || false);
        // Refresh deliveries after status change
        fetchDashboardData();
      } else {
        const errorData = await res.json();
        alert(errorData.message || "Failed to update status");
      }
    } catch (error) {
      console.error("Status toggle error:", error);
    }
  };

  // Handle manual override confirmation
  const handleManualOverrideConfirm = () => {
    setShowOverrideModal(false);
    handleToggleOnline(true);
  };

  // ============================================================================
  // ACCEPT DELIVERY REQUEST
  // ============================================================================

  const handleAcceptDelivery = async (deliveryId) => {
    setAcceptingOrder(deliveryId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `http://localhost:5000/driver/deliveries/${deliveryId}/accept`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (res.ok) {
        // Navigate to active deliveries
        navigate("/driver/deliveries/active");
      } else {
        const data = await res.json();
        alert(data.message || "Failed to accept delivery");
      }
    } catch (error) {
      console.error("Accept delivery error:", error);
      alert("Failed to accept delivery");
    } finally {
      setAcceptingOrder(null);
    }
  };

  // ============================================================================
  // CALCULATE DISTANCE (mock for now)
  // ============================================================================

  const calculateDistance = (delivery) => {
    // In real app, calculate based on driver's current location
    // For now, return a mock distance
    return (Math.random() * 3 + 0.5).toFixed(1);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-slate-50 font-['Work_Sans',sans-serif]">
      <MaterialSymbolsCSS />

      {/* Manual Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl text-amber-600">
                schedule
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">
              Outside Working Hours
            </h3>
            <p className="text-slate-600 text-center text-sm mb-4">
              Your working time is set to{" "}
              <strong>
                {WORKING_TIME_LABELS[driverProfile?.working_time] || "Unknown"}
              </strong>
              . You are currently outside your scheduled working hours.
            </p>
            <p className="text-slate-500 text-center text-sm mb-6">
              Do you want to go online anyway?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-medium active:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleManualOverrideConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-[#22c55e] text-white font-medium active:bg-[#16a34a]"
              >
                Go Online
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Message Toast */}
      {statusMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] animate-fade-in">
          <div className="bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400">
              info
            </span>
            <span className="text-sm">{statusMessage}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="relative flex h-auto min-h-screen w-full flex-col max-w-md mx-auto overflow-x-hidden border-x border-slate-200 bg-[#fdfdfd]">
        {/* Top App Bar */}
        <div className="flex items-center bg-white/90 p-4 pb-2 justify-between sticky top-0 z-50 border-b border-slate-100 backdrop-blur-md">
          <div className="flex size-10 shrink-0 items-center overflow-hidden">
            <div
              className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-9 ring-2 ring-primary/10 bg-slate-200"
              style={{
                backgroundImage: driverProfile?.profile_picture
                  ? `url("${driverProfile.profile_picture}")`
                  : "none",
              }}
            >
              {!driverProfile?.profile_picture && (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  <span className="material-symbols-outlined text-xl">
                    person
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 ml-3">
            <h2 className="text-slate-900 text-[17px] font-bold leading-tight tracking-tight">
              {driverProfile?.user_name || "Driver"}
            </h2>
            <p className="text-slate-500 text-xs">
              {WORKING_TIME_LABELS[driverProfile?.working_time] || ""}
            </p>
          </div>
          <div className="flex w-10 items-center justify-end">
            <button
              onClick={() => navigate("/driver/notifications")}
              className="relative flex cursor-pointer items-center justify-center rounded-full h-10 w-10 bg-slate-50 text-slate-600 active:bg-slate-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">
                notifications
              </span>
              <span className="absolute top-2.5 right-2.5 flex h-2 w-2 rounded-full bg-[#22c55e] ring-2 ring-white"></span>
            </button>
          </div>
        </div>

        {/* Online/Offline Toggle with Working Hours Info */}
        <div className="p-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <p className="text-slate-900 text-base font-bold leading-tight">
                  Status: {isOnline ? "Online" : "Offline"}
                </p>
                <p className="text-slate-500 text-sm font-normal leading-normal">
                  {isOnline
                    ? "Receiving requests nearby"
                    : "Not receiving requests"}
                </p>
              </div>
              <label className="relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full border-none bg-slate-200 p-0.5 transition-colors duration-200 has-[:checked]:bg-[#22c55e]">
                <input
                  checked={isOnline}
                  onChange={() => handleToggleOnline(false)}
                  className="sr-only peer"
                  type="checkbox"
                />
                <div className="h-[27px] w-[27px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"></div>
              </label>
            </div>

            {/* Working Hours Status */}
            {driverProfile?.working_time &&
              driverProfile.working_time !== "full_time" && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                    withinWorkingHours
                      ? "bg-green-50 border border-green-200"
                      : manualOverrideActive
                        ? "bg-amber-50 border border-amber-200"
                        : "bg-slate-50 border border-slate-200"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-lg ${
                      withinWorkingHours
                        ? "text-green-600"
                        : manualOverrideActive
                          ? "text-amber-600"
                          : "text-slate-500"
                    }`}
                  >
                    {withinWorkingHours
                      ? "check_circle"
                      : manualOverrideActive
                        ? "schedule"
                        : "schedule"}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      withinWorkingHours
                        ? "text-green-700"
                        : manualOverrideActive
                          ? "text-amber-700"
                          : "text-slate-600"
                    }`}
                  >
                    {withinWorkingHours
                      ? "Within working hours"
                      : manualOverrideActive
                        ? "Manual override active (outside working hours)"
                        : "Outside working hours"}
                  </span>
                </div>
              )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="px-4">
          <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
            {/* Earnings Card */}
            <div className="flex min-w-[145px] flex-1 flex-col gap-2 rounded-xl p-5 bg-white border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                Earnings
              </p>
              <p className="text-[#22c55e] tracking-tight text-2xl font-bold leading-tight">
                Rs. {stats.todayEarnings.toFixed(0)}
              </p>
            </div>

            {/* Deliveries Card */}
            <div className="flex min-w-[145px] flex-1 flex-col gap-2 rounded-xl p-5 bg-white border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                Deliveries
              </p>
              <p className="text-slate-900 tracking-tight text-2xl font-bold leading-tight">
                {stats.todayDeliveries}
              </p>
            </div>

            {/* Active Time Card */}
            <div className="flex min-w-[145px] flex-1 flex-col gap-2 rounded-xl p-5 bg-white border border-slate-100 shadow-sm">
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                Active
              </p>
              <p className="text-slate-900 tracking-tight text-2xl font-bold leading-tight">
                {stats.activeTime}h
              </p>
            </div>
          </div>
        </div>

        {/* Active Deliveries Section - Shows for both online and offline drivers */}
        {activeDeliveries.length > 0 && (
          <>
            <div className="flex items-center justify-between px-4 pt-6 pb-2">
              <h2 className="text-slate-900 text-[18px] font-bold leading-tight">
                Active Deliveries ({activeDeliveries.length})
              </h2>
              <button
                onClick={() => navigate("/driver/deliveries/active")}
                className="text-[#22c55e] text-sm font-bold active:opacity-60 transition-opacity"
              >
                View All
              </button>
            </div>
            <div className="flex flex-col gap-3 px-4">
              {activeDeliveries.slice(0, 3).map((delivery) => (
                <div
                  key={delivery.id}
                  onClick={() => navigate("/driver/deliveries/active")}
                  className="flex items-center gap-4 rounded-xl bg-amber-50 border border-amber-200 p-4 cursor-pointer active:bg-amber-100 transition-colors"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100">
                    <span className="material-symbols-outlined text-amber-600">
                      {delivery.status === "accepted"
                        ? "restaurant"
                        : delivery.status === "picked_up"
                          ? "directions_bike"
                          : delivery.status === "on_the_way"
                            ? "local_shipping"
                            : "location_on"}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-900 font-semibold text-sm">
                      {delivery.orders?.restaurant_name || "Restaurant"}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Order #{delivery.orders?.order_number || "N/A"}
                    </p>
                    <p className="text-amber-600 text-xs font-medium mt-1 capitalize">
                      {delivery.status?.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400">
                    chevron_right
                  </span>
                </div>
              ))}
            </div>
            {!isOnline && activeDeliveries.length > 0 && (
              <div className="mx-4 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-lg">
                    info
                  </span>
                  <p className="text-amber-700 text-xs">
                    You're offline but have active deliveries. Complete these
                    deliveries to receive your earnings.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Nearby Requests Header */}
        <div className="flex items-center justify-between px-4 pt-6 pb-2">
          <h2 className="text-slate-900 text-[18px] font-bold leading-tight">
            Nearby Requests ({availableDeliveries.length})
          </h2>
          <button
            onClick={() => navigate("/driver/deliveries")}
            className="text-[#22c55e] text-sm font-bold active:opacity-60 transition-opacity"
          >
            View All
          </button>
        </div>

        {/* Nearby Requests List */}
        <div className="flex flex-col gap-4 pb-28">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#22c55e] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : !isOnline ? (
            activeDeliveries.length > 0 ? (
              <div className="px-4 py-8 text-center">
                <span className="material-symbols-outlined text-5xl text-amber-400 mb-3">
                  pending_actions
                </span>
                <p className="text-slate-600 font-medium">
                  Complete your active deliveries
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  You can go online after completing current deliveries
                </p>
              </div>
            ) : (
              <div className="px-4 py-12 text-center">
                <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">
                  wifi_off
                </span>
                <p className="text-slate-500 font-medium">
                  You're currently offline
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  Go online to receive delivery requests
                </p>
              </div>
            )
          ) : availableDeliveries.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">
                inventory_2
              </span>
              <p className="text-slate-500 font-medium">No requests nearby</p>
              <p className="text-slate-400 text-sm mt-1">
                New orders will appear here
              </p>
            </div>
          ) : (
            availableDeliveries.slice(0, 5).map((delivery, index) => (
              <div key={delivery.id} className="px-4">
                <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <span className="bg-[#22c55e]/10 text-[#22c55e] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            New Order
                          </span>
                        )}
                        {delivery.orders?.length > 1 && (
                          <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Bulk Order
                          </span>
                        )}
                        <p className="text-slate-400 text-[11px] font-bold leading-normal uppercase">
                          {calculateDistance(delivery)} mi away
                        </p>
                      </div>
                      <p className="text-slate-900 text-2xl font-bold leading-tight">
                        Rs. {parseFloat(delivery.delivery_fee || 50).toFixed(0)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-slate-400">
                          store
                        </span>
                        <p className="text-slate-600 text-[15px] font-medium leading-normal">
                          {delivery.restaurant_name || "Restaurant"}
                        </p>
                      </div>
                      {delivery.orders && delivery.orders.length > 0 && (
                        <p className="text-slate-400 text-xs mt-1">
                          {delivery.orders.length} order
                          {delivery.orders.length > 1 ? "s" : ""} •{" "}
                          {delivery.orders.reduce(
                            (sum, o) => sum + (o.order_items?.length || 0),
                            0,
                          )}{" "}
                          items
                        </p>
                      )}
                    </div>
                    {/* Map Preview */}
                    <div className="w-24 h-24 bg-center bg-no-repeat bg-cover rounded-xl border border-slate-100 bg-slate-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl text-slate-300">
                        map
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAcceptDelivery(delivery.id)}
                    disabled={acceptingOrder === delivery.id}
                    className="flex w-full cursor-pointer items-center justify-center rounded-xl h-12 bg-[#22c55e] text-white gap-2 text-base font-bold shadow-md shadow-[#22c55e]/20 active:bg-[#16a34a] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {acceptingOrder === delivery.id ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Accepting...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[22px]">
                          check_circle
                        </span>
                        <span>Accept Request</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 border-t border-slate-100 flex justify-around items-center h-20 px-4 pb-6 backdrop-blur-lg z-50">
          <button
            onClick={() => navigate("/driver/dashboard")}
            className="flex flex-col items-center gap-1 text-[#22c55e]"
          >
            <span
              className="material-symbols-outlined text-[28px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              home
            </span>
            <span className="text-[10px] font-bold uppercase tracking-tight">
              Home
            </span>
          </button>
          <button
            onClick={() => navigate("/driver/earnings")}
            className="flex flex-col items-center gap-1 text-slate-400"
          >
            <span className="material-symbols-outlined text-[28px]">
              account_balance_wallet
            </span>
            <span className="text-[10px] font-bold uppercase tracking-tight">
              Earnings
            </span>
          </button>
          <button
            onClick={() => navigate("/driver/history")}
            className="flex flex-col items-center gap-1 text-slate-400"
          >
            <span className="material-symbols-outlined text-[28px]">
              history
            </span>
            <span className="text-[10px] font-bold uppercase tracking-tight">
              History
            </span>
          </button>
          <button
            onClick={() => navigate("/driver/profile")}
            className="flex flex-col items-center gap-1 text-slate-400"
          >
            <span className="material-symbols-outlined text-[28px]">
              person
            </span>
            <span className="text-[10px] font-bold uppercase tracking-tight">
              Account
            </span>
          </button>
        </div>
      </div>

      {/* Custom styles */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
