import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import AdminSkeleton from "../../components/AdminSkeleton";
import PageWrapper from "../../components/PageWrapper";
import { API_URL } from "../../config";

export default function PendingDeliveries() {
  const queryClient = useQueryClient();
  const [tipInputs, setTipInputs] = useState({});
  const [submittingTip, setSubmittingTip] = useState({});
  const [successMap, setSuccessMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const token = localStorage.getItem("token");

  const {
    data: deliveries = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["manager", "pending-deliveries"],
    enabled: !!token,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/manager/pending-deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch pending deliveries");
      }
      return data.deliveries || [];
    },
  });

  const tipMutation = useMutation({
    mutationFn: async ({ deliveryId, tipValue }) => {
      const res = await fetch(
        `${API_URL}/manager/pending-deliveries/${deliveryId}/tip`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tip_amount: tipValue }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to update tip");
      }
      return { deliveryId };
    },
    onSuccess: async ({ deliveryId }) => {
      setSuccessMap((prev) => ({ ...prev, [deliveryId]: true }));
      setTimeout(
        () => setSuccessMap((prev) => ({ ...prev, [deliveryId]: false })),
        2000,
      );
      setTipInputs((prev) => ({ ...prev, [deliveryId]: "" }));
      await queryClient.invalidateQueries({
        queryKey: ["manager", "pending-deliveries"],
      });
    },
  });

  const loading = isLoading && deliveries.length === 0;
  const refreshing = !loading && isFetching;

  const handleRefresh = () => {
    refetch();
  };

  const handleTipSubmit = async (deliveryId) => {
    const tipValue = parseFloat(tipInputs[deliveryId]);
    if (isNaN(tipValue) || tipValue < 0) return;

    setSubmittingTip((prev) => ({ ...prev, [deliveryId]: true }));
    try {
      await tipMutation.mutateAsync({ deliveryId, tipValue });
    } catch (err) {
      console.error("Failed to update tip:", err);
    } finally {
      setSubmittingTip((prev) => ({ ...prev, [deliveryId]: false }));
    }
  };

  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const getUrgencyColor = (minutes) => {
    if (minutes >= 30)
      return {
        bg: "bg-red-100",
        text: "text-red-700",
        border: "border-red-200",
        dot: "bg-red-500",
      };
    if (minutes >= 20)
      return {
        bg: "bg-orange-100",
        text: "text-orange-700",
        border: "border-orange-200",
        dot: "bg-orange-500",
      };
    return {
      bg: "bg-amber-100",
      text: "text-amber-700",
      border: "border-amber-200",
      dot: "bg-amber-500",
    };
  };

  if (loading) {
    return (
      <ManagerPageLayout title="Pending Deliveries">
        <AdminSkeleton type="deliveries" />
      </ManagerPageLayout>
    );
  }

  return (
    <ManagerPageLayout
      title="Pending Deliveries"
      onRefresh={handleRefresh}
      refreshing={refreshing}
    >
      <PageWrapper
        isFetching={refreshing}
        dataKey={`pending-${deliveries.length}`}
      >
        {/* Alert Banner */}
        {deliveries.length > 0 && (
          <div className="mx-4 mb-4 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-red-600 text-xl">
                  warning
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-800">
                  {deliveries.length} delivery
                  {deliveries.length !== 1 ? "ies" : ""} waiting for drivers
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  Add tips to incentivize drivers to accept these orders
                </p>
              </div>
              <div className="bg-red-500 text-white text-sm font-extrabold w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                {deliveries.length}
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {deliveries.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mx-4 mb-4">
            <div className="bg-white rounded-2xl border border-[#dbe6e3] p-3 text-center">
              <p className="text-[10px] text-[#618980] font-bold uppercase tracking-wider">
                Pending
              </p>
              <p className="text-xl font-extrabold text-[#111816] mt-1">
                {deliveries.length}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#dbe6e3] p-3 text-center">
              <p className="text-[10px] text-[#618980] font-bold uppercase tracking-wider">
                Tipped
              </p>
              <p className="text-xl font-extrabold text-[#13ecb9] mt-1">
                {
                  deliveries.filter((d) => parseFloat(d.tip_amount || 0) > 0)
                    .length
                }
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#dbe6e3] p-3 text-center">
              <p className="text-[10px] text-[#618980] font-bold uppercase tracking-wider">
                Avg Wait
              </p>
              <p className="text-xl font-extrabold text-orange-600 mt-1">
                {formatTime(
                  Math.round(
                    deliveries.reduce((sum, d) => sum + d.waiting_minutes, 0) /
                      deliveries.length,
                  ),
                )}
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {deliveries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="w-20 h-20 rounded-full bg-[#13ecb9]/10 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-4xl text-[#13ecb9]">
                check_circle
              </span>
            </div>
            <h3 className="text-lg font-bold text-[#111816] mb-2">
              All deliveries on track
            </h3>
            <p className="text-sm text-[#618980] text-center max-w-xs">
              No deliveries are waiting for drivers longer than 10 minutes. Your
              customers are being served promptly!
            </p>
            <p className="text-xs text-[#618980]/60 mt-4">
              Auto-refreshes every 30 seconds
            </p>
          </div>
        )}

        {/* Delivery Cards */}
        <div className="px-4 space-y-4 pb-4">
          {deliveries.map((d) => {
            const order = d.orders;
            if (!order) return null;

            const urgency = getUrgencyColor(d.waiting_minutes);
            const currentTip = parseFloat(d.tip_amount || 0);
            const hasTip = currentTip > 0;
            const isExpanded = expandedId === d.id;
            const items = order.order_items || [];

            return (
              <div
                key={d.id}
                className={`bg-white rounded-2xl border overflow-hidden transition-all ${
                  hasTip
                    ? "border-[#13ecb9] shadow-md shadow-[#13ecb9]/10"
                    : "border-[#dbe6e3] shadow-sm"
                }`}
              >
                {/* Header Row */}
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Urgency indicator */}
                      <div
                        className={`relative flex-shrink-0 w-10 h-10 rounded-xl ${urgency.bg} flex items-center justify-center`}
                      >
                        <span
                          className={`material-symbols-outlined text-lg ${urgency.text}`}
                        >
                          timer
                        </span>
                        <div
                          className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full ${urgency.dot} animate-pulse`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[#111816]">
                            #{order.order_number}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${urgency.bg} ${urgency.text}`}
                          >
                            {formatTime(d.waiting_minutes)} waiting
                          </span>
                        </div>
                        <p className="text-xs text-[#618980] truncate mt-0.5">
                          {order.restaurant_name}
                        </p>
                      </div>
                    </div>

                    {/* Tip Badge */}
                    {hasTip && (
                      <div className="flex-shrink-0 bg-[#13ecb9]/10 border border-[#13ecb9]/30 rounded-full px-2.5 py-1">
                        <span className="text-xs font-bold text-[#065f46]">
                          Tip Rs.{currentTip.toFixed(0)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Pending Time Banner */}
                  <div
                    className={`rounded-xl p-3 mb-3 flex items-center justify-between ${urgency.bg} border ${urgency.border}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`material-symbols-outlined text-base ${urgency.text}`}
                      >
                        hourglass_top
                      </span>
                      <div>
                        <p className={`text-xs font-bold ${urgency.text}`}>
                          Pending for {formatTime(d.waiting_minutes)}
                        </p>
                        <p className="text-[10px] text-[#618980] mt-0.5">
                          Since{" "}
                          {order.accepted_at
                            ? new Date(order.accepted_at).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                },
                              )
                            : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-extrabold ${urgency.text}`}>
                        {d.waiting_minutes}
                      </p>
                      <p
                        className={`text-[9px] font-bold uppercase ${urgency.text} opacity-70`}
                      >
                        minutes
                      </p>
                    </div>
                  </div>

                  {/* Key Info Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-[#f6f8f8] rounded-xl p-2.5 text-center">
                      <p className="text-[9px] text-[#618980] font-bold uppercase tracking-wider">
                        Total
                      </p>
                      <p className="text-sm font-bold text-[#111816] mt-0.5">
                        Rs.{parseFloat(order.total_amount || 0).toFixed(0)}
                      </p>
                    </div>
                    <div className="bg-[#f6f8f8] rounded-xl p-2.5 text-center">
                      <p className="text-[9px] text-[#618980] font-bold uppercase tracking-wider">
                        Distance
                      </p>
                      <p className="text-sm font-bold text-[#111816] mt-0.5">
                        {parseFloat(order.distance_km || 0).toFixed(1)} km
                      </p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-2.5 text-center border border-emerald-100">
                      <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">
                        Earning
                      </p>
                      <p className="text-sm font-bold text-emerald-700 mt-0.5">
                        Rs.{(d.manager_earning || 0).toFixed(0)}
                      </p>
                    </div>
                  </div>

                  {/* Food Items Preview */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-[#618980] text-sm">
                      restaurant
                    </span>
                    <p className="text-xs text-[#618980] truncate flex-1">
                      {items.length > 0
                        ? items
                            .map(
                              (item) => `${item.quantity}× ${item.food_name}`,
                            )
                            .join(", ")
                        : "No items"}
                    </p>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : d.id)}
                      className="text-[#13ecb9] text-xs font-semibold flex-shrink-0"
                    >
                      {isExpanded ? "Less" : "Details"}
                    </button>
                  </div>

                  {/* Tip Input */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#618980] text-xs font-medium">
                        Rs.
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        placeholder={
                          hasTip ? currentTip.toFixed(0) : "Enter tip"
                        }
                        value={tipInputs[d.id] || ""}
                        onChange={(e) =>
                          setTipInputs((prev) => ({
                            ...prev,
                            [d.id]: e.target.value,
                          }))
                        }
                        className="w-full pl-9 pr-3 py-2.5 bg-[#f6f8f8] border border-[#dbe6e3] rounded-xl text-sm font-bold text-[#111816] placeholder-[#618980]/40 focus:outline-none focus:ring-2 focus:ring-[#13ecb9]/30 focus:border-[#13ecb9]"
                      />
                    </div>
                    <button
                      onClick={() => handleTipSubmit(d.id)}
                      disabled={
                        submittingTip[d.id] ||
                        !tipInputs[d.id] ||
                        parseFloat(tipInputs[d.id]) < 0
                      }
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 flex-shrink-0 ${
                        successMap[d.id]
                          ? "bg-green-500 text-white"
                          : "bg-[#13ecb9] text-[#111816] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                    >
                      {submittingTip[d.id] ? (
                        <div className="w-4 h-4 border-2 border-[#111816] border-t-transparent rounded-full animate-spin" />
                      ) : successMap[d.id] ? (
                        <>
                          <span className="material-symbols-outlined text-sm">
                            check
                          </span>
                          Done
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">
                            volunteer_activism
                          </span>
                          {hasTip ? "Update" : "Add Tip"}
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quick tip presets */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-[#618980] font-medium">
                      Quick:
                    </span>
                    {[20, 30, 50, 75, 100].map((val) => (
                      <button
                        key={val}
                        onClick={() =>
                          setTipInputs((prev) => ({
                            ...prev,
                            [d.id]: val.toString(),
                          }))
                        }
                        className="px-2 py-1 bg-[#f6f8f8] border border-[#dbe6e3] rounded-lg text-[10px] font-bold text-[#618980] hover:border-[#13ecb9] hover:text-[#111816] transition-colors"
                      >
                        Rs.{val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-[#dbe6e3] bg-[#f6f8f8]/50 p-4 space-y-4">
                    {/* Customer & Restaurant */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-[#618980] font-bold uppercase tracking-wider mb-1">
                          Restaurant
                        </p>
                        <p className="text-sm font-semibold text-[#111816]">
                          {order.restaurant_name}
                        </p>
                        <p className="text-xs text-[#618980] mt-0.5 line-clamp-2">
                          {order.restaurant_address}
                        </p>
                        {order.restaurant_phone && (
                          <a
                            href={`tel:${order.restaurant_phone}`}
                            className="text-xs text-[#13ecb9] font-medium mt-1 inline-block"
                          >
                            {order.restaurant_phone}
                          </a>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-[#618980] font-bold uppercase tracking-wider mb-1">
                          Customer
                        </p>
                        <p className="text-sm font-semibold text-[#111816]">
                          {order.customer_name}
                        </p>
                        <p className="text-xs text-[#618980] mt-0.5 line-clamp-2">
                          {order.delivery_address}
                        </p>
                        {order.customer_phone && (
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="text-xs text-[#13ecb9] font-medium mt-1 inline-block"
                          >
                            {order.customer_phone}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Food Items */}
                    <div>
                      <p className="text-[10px] text-[#618980] font-bold uppercase tracking-wider mb-2">
                        Food Items
                      </p>
                      <div className="bg-white rounded-xl border border-[#dbe6e3] divide-y divide-[#dbe6e3]">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 p-3"
                          >
                            {item.food_image_url ? (
                              <img
                                src={item.food_image_url}
                                alt={item.food_name}
                                className="w-10 h-10 rounded-lg object-cover border border-[#dbe6e3]"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-[#f6f8f8] border border-[#dbe6e3] flex items-center justify-center">
                                <span className="material-symbols-outlined text-[#618980] text-sm">
                                  lunch_dining
                                </span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#111816] truncate">
                                {item.food_name}
                              </p>
                              <p className="text-xs text-[#618980]">
                                {item.size && item.size !== "regular"
                                  ? `${item.size} · `
                                  : ""}
                                Qty: {item.quantity}
                              </p>
                            </div>
                            <p className="text-sm font-bold text-[#111816]">
                              Rs.{parseFloat(item.total_price || 0).toFixed(0)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Financial Breakdown */}
                    <div>
                      <p className="text-[10px] text-[#618980] font-bold uppercase tracking-wider mb-2">
                        Financial Breakdown
                      </p>
                      <div className="bg-white rounded-xl border border-[#dbe6e3] p-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-[#618980]">Food Subtotal</span>
                          <span className="font-medium text-[#111816]">
                            Rs.{parseFloat(order.subtotal || 0).toFixed(0)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#618980]">Delivery Fee</span>
                          <span className="font-medium text-[#111816]">
                            Rs.{parseFloat(order.delivery_fee || 0).toFixed(0)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#618980]">Service Fee</span>
                          <span className="font-medium text-[#111816]">
                            Rs.{parseFloat(order.service_fee || 0).toFixed(0)}
                          </span>
                        </div>
                        <div className="h-px bg-[#dbe6e3]" />
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-[#111816]">
                            Total Collected
                          </span>
                          <span className="font-bold text-[#111816]">
                            Rs.{parseFloat(order.total_amount || 0).toFixed(0)}
                          </span>
                        </div>
                        <div className="h-px bg-[#dbe6e3]" />
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600">
                            Restaurant Payout
                          </span>
                          <span className="font-medium text-amber-600">
                            − Rs.
                            {parseFloat(order.admin_subtotal || 0).toFixed(0)}
                          </span>
                        </div>
                        {currentTip > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[#13ecb9]">
                              Driver Tip (Your Cost)
                            </span>
                            <span className="font-medium text-[#13ecb9]">
                              − Rs.{currentTip.toFixed(0)}
                            </span>
                          </div>
                        )}
                        <div className="h-px bg-[#dbe6e3]" />
                        <div className="flex justify-between">
                          <span className="font-bold text-emerald-700">
                            Your Earning
                          </span>
                          <span className="font-extrabold text-emerald-700">
                            Rs.{(d.manager_earning || 0).toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Distance & Timing */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-white rounded-xl border border-[#dbe6e3] p-3 text-center">
                        <span className="material-symbols-outlined text-[#618980] text-lg">
                          route
                        </span>
                        <p className="text-sm font-bold text-[#111816] mt-1">
                          {parseFloat(order.distance_km || 0).toFixed(1)} km
                        </p>
                        <p className="text-[9px] text-[#618980] uppercase font-bold">
                          Distance
                        </p>
                      </div>
                      <div className="bg-white rounded-xl border border-[#dbe6e3] p-3 text-center">
                        <span className="material-symbols-outlined text-[#618980] text-lg">
                          schedule
                        </span>
                        <p className="text-sm font-bold text-[#111816] mt-1">
                          {order.estimated_duration_min || "—"} min
                        </p>
                        <p className="text-[9px] text-[#618980] uppercase font-bold">
                          Est. ETA
                        </p>
                      </div>
                      <div className="bg-white rounded-xl border border-[#dbe6e3] p-3 text-center">
                        <span className="material-symbols-outlined text-[#618980] text-lg">
                          payment
                        </span>
                        <p className="text-sm font-bold text-[#111816] mt-1">
                          {order.payment_method === "cash" ? "Cash" : "Card"}
                        </p>
                        <p className="text-[9px] text-[#618980] uppercase font-bold">
                          Payment
                        </p>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="bg-white rounded-xl border border-[#dbe6e3] p-3">
                      <div className="flex items-center gap-2 text-xs text-[#618980]">
                        <span className="material-symbols-outlined text-sm">
                          history
                        </span>
                        <span>
                          Placed:{" "}
                          {order.placed_at
                            ? new Date(order.placed_at).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                },
                              )
                            : "—"}
                        </span>
                        <span>·</span>
                        <span>
                          Accepted:{" "}
                          {order.accepted_at
                            ? new Date(order.accepted_at).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                },
                              )
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PageWrapper>
    </ManagerPageLayout>
  );
}
