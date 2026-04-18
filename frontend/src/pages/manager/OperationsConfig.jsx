import React, { useState, useEffect, useCallback } from "react";
import ManagerPageLayout from "../../components/ManagerPageLayout";
import { ManagerPageSkeleton } from "../../components/ManagerSkeleton";
import { API_URL } from "../../config";

// Helper to format decimal hours to readable time
function formatTime(decimalHours) {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

// Helper to parse time string like "5:00 AM" to decimal
function parseTimeToDecimal(timeStr) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h + m / 60;
}

export default function OperationsConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Section 1: Driver Earnings
  const [ratePerKm, setRatePerKm] = useState(40);
  const [rtcRateBelow5Km, setRtcRateBelow5Km] = useState(40);
  const [rtcRateAbove5Km, setRtcRateAbove5Km] = useState(40);
  const [maxDTRKm, setMaxDTRKm] = useState(1);
  const [maxDTRAmount, setMaxDTRAmount] = useState(30);
  const [maxRestProximity, setMaxRestProximity] = useState(1);
  const [secondBonus, setSecondBonus] = useState(20);
  const [additionalBonus, setAdditionalBonus] = useState(30);

  // Section 2: Delivery Availability
  const [maxExtraTime, setMaxExtraTime] = useState(10);
  const [maxExtraDistance, setMaxExtraDistance] = useState(3);
  const [maxActiveDeliveries, setMaxActiveDeliveries] = useState(5);
  const [commissionPercentage, setCommissionPercentage] = useState(10);

  // Section 3: Service Fee Tiers
  const [serviceFeeTiers, setServiceFeeTiers] = useState([
    { min: 0, max: 300, fee: 0 },
    { min: 300, max: 1000, fee: 31 },
    { min: 1000, max: 1500, fee: 42 },
    { min: 1500, max: 2500, fee: 56 },
    { min: 2500, max: "", fee: 62 },
  ]);

  // Section 4: Delivery Fee Tiers
  const [deliveryFeeTiers, setDeliveryFeeTiers] = useState([
    { max_km: 1, fee: 50 },
    { max_km: 2, fee: 80 },
    { max_km: 2.5, fee: 87 },
  ]);
  const [overflowTier, setOverflowTier] = useState({
    base_fee: 87,
    extra_per_100m: 2.3,
    base_km: 2.5,
  });

  // Section 5: Pending Alert
  const [pendingMinutes, setPendingMinutes] = useState(10);

  // Section 6: Working Hours
  const [dayStart, setDayStart] = useState("5:00 AM");
  const [dayEnd, setDayEnd] = useState("7:00 PM");
  const [nightStart, setNightStart] = useState("6:00 PM");
  const [nightEnd, setNightEnd] = useState("6:00 AM");

  // Section 7: Order Distance Constraints
  const [orderDistanceConstraints, setOrderDistanceConstraints] = useState([
    { min_km: 0, max_km: 5, min_subtotal: 300 },
    { min_km: 5, max_km: 10, min_subtotal: 1000 },
    { min_km: 10, max_km: 15, min_subtotal: 2000 },
    { min_km: 15, max_km: 25, min_subtotal: 3000 },
  ]);
  const [maxOrderDistanceKm, setMaxOrderDistanceKm] = useState(25);

  // Section 8: Launch Promotion
  const [launchPromoEnabled, setLaunchPromoEnabled] = useState(true);
  const [launchPromoFirstKmRate, setLaunchPromoFirstKmRate] = useState(1);
  const [launchPromoMaxKm, setLaunchPromoMaxKm] = useState(5);
  const [launchPromoBeyondKmRate, setLaunchPromoBeyondKmRate] = useState(40);
  const [launchPromoCustomers, setLaunchPromoCustomers] = useState([]);
  const [calculatorDistanceKm, setCalculatorDistanceKm] = useState("3.3");

  const fetchLaunchPromoCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/manager/launch-promotion/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch launch promo customers");
      const data = await res.json();
      setLaunchPromoCustomers(data.customers || []);
    } catch (err) {
      console.error("Launch promo customers fetch error:", err);
      setLaunchPromoCustomers([]);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/manager/system-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch config");
      const { config } = await res.json();

      // Section 1
      setRatePerKm(parseFloat(config.rate_per_km));
      setRtcRateBelow5Km(
        parseFloat(config.rtc_rate_below_5km ?? config.rate_per_km),
      );
      setRtcRateAbove5Km(
        parseFloat(config.rtc_rate_above_5km ?? config.rate_per_km),
      );
      setMaxDTRKm(parseFloat(config.max_driver_to_restaurant_km));
      setMaxDTRAmount(parseFloat(config.max_driver_to_restaurant_amount));
      setMaxRestProximity(parseFloat(config.max_restaurant_proximity_km));
      setSecondBonus(parseFloat(config.second_delivery_bonus));
      setAdditionalBonus(parseFloat(config.additional_delivery_bonus));

      // Section 2
      setMaxExtraTime(config.max_extra_time_minutes);
      setMaxExtraDistance(parseFloat(config.max_extra_distance_km));
      setMaxActiveDeliveries(config.max_active_deliveries);
      setCommissionPercentage(parseFloat(config.commission_percentage ?? 10));

      // Section 3
      const sft =
        typeof config.service_fee_tiers === "string"
          ? JSON.parse(config.service_fee_tiers)
          : config.service_fee_tiers;
      setServiceFeeTiers(
        sft.map((t) => ({ ...t, max: t.max === null ? "" : t.max })),
      );

      // Section 4
      const dft =
        typeof config.delivery_fee_tiers === "string"
          ? JSON.parse(config.delivery_fee_tiers)
          : config.delivery_fee_tiers;
      const fixed = dft.filter((t) => t.max_km !== null);
      const overflow = dft.find((t) => t.max_km === null);
      setDeliveryFeeTiers(fixed);
      if (overflow)
        setOverflowTier({
          base_fee: overflow.base_fee,
          extra_per_100m: overflow.extra_per_100m,
          base_km: overflow.base_km,
        });

      // Section 5
      setPendingMinutes(config.pending_alert_minutes);

      // Section 6
      setDayStart(formatTime(parseFloat(config.day_shift_start)));
      setDayEnd(formatTime(parseFloat(config.day_shift_end)));
      setNightStart(formatTime(parseFloat(config.night_shift_start)));
      setNightEnd(formatTime(parseFloat(config.night_shift_end)));

      // Section 7
      if (config.order_distance_constraints) {
        const odc =
          typeof config.order_distance_constraints === "string"
            ? JSON.parse(config.order_distance_constraints)
            : config.order_distance_constraints;
        setOrderDistanceConstraints(odc);
      }
      if (config.max_order_distance_km !== undefined) {
        setMaxOrderDistanceKm(parseFloat(config.max_order_distance_km));
      }

      // Section 8
      setLaunchPromoEnabled(Boolean(config.launch_promo_enabled ?? true));
      setLaunchPromoFirstKmRate(
        parseFloat(config.launch_promo_first_km_rate ?? 1),
      );
      setLaunchPromoMaxKm(parseFloat(config.launch_promo_max_km ?? 5));
      setLaunchPromoBeyondKmRate(
        parseFloat(config.launch_promo_beyond_km_rate ?? 40),
      );

      fetchLaunchPromoCustomers();
    } catch (err) {
      console.error(err);
      setError("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, [fetchLaunchPromoCustomers]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const token = localStorage.getItem("token");

      // Build service fee tiers JSON
      const sftPayload = serviceFeeTiers.map((t) => ({
        min: parseFloat(t.min) || 0,
        max: t.max === "" || t.max === null ? null : parseFloat(t.max),
        fee: parseFloat(t.fee) || 0,
      }));

      // Build delivery fee tiers JSON
      const dftPayload = [
        ...deliveryFeeTiers.map((t) => ({
          max_km: parseFloat(t.max_km),
          fee: parseFloat(t.fee),
        })),
        {
          max_km: null,
          base_fee: parseFloat(overflowTier.base_fee),
          extra_per_100m: parseFloat(overflowTier.extra_per_100m),
          base_km: parseFloat(overflowTier.base_km),
        },
      ];

      const body = {
        rate_per_km: parseFloat(ratePerKm),
        rtc_rate_below_5km: parseFloat(rtcRateBelow5Km),
        rtc_rate_above_5km: parseFloat(rtcRateAbove5Km),
        max_driver_to_restaurant_km: parseFloat(maxDTRKm),
        max_driver_to_restaurant_amount: parseFloat(maxDTRAmount),
        max_restaurant_proximity_km: parseFloat(maxRestProximity),
        second_delivery_bonus: parseFloat(secondBonus),
        additional_delivery_bonus: parseFloat(additionalBonus),
        max_extra_time_minutes: parseInt(maxExtraTime),
        max_extra_distance_km: parseFloat(maxExtraDistance),
        max_active_deliveries: parseInt(maxActiveDeliveries),
        commission_percentage: parseFloat(commissionPercentage),
        service_fee_tiers: sftPayload,
        delivery_fee_tiers: dftPayload,
        pending_alert_minutes: parseInt(pendingMinutes),
        day_shift_start: parseTimeToDecimal(dayStart),
        day_shift_end: parseTimeToDecimal(dayEnd),
        night_shift_start: parseTimeToDecimal(nightStart),
        night_shift_end: parseTimeToDecimal(nightEnd),
        order_distance_constraints: orderDistanceConstraints.map((c) => ({
          min_km: parseFloat(c.min_km) || 0,
          max_km: parseFloat(c.max_km) || 0,
          min_subtotal: parseFloat(c.min_subtotal) || 0,
        })),
        max_order_distance_km: parseFloat(maxOrderDistanceKm) || 25,
        launch_promo_enabled: Boolean(launchPromoEnabled),
        launch_promo_first_km_rate: parseFloat(launchPromoFirstKmRate) || 1,
        launch_promo_max_km: parseFloat(launchPromoMaxKm) || 5,
        launch_promo_beyond_km_rate: parseFloat(launchPromoBeyondKmRate) || 40,
      };

      // validate times
      if (
        body.day_shift_start === null ||
        body.day_shift_end === null ||
        body.night_shift_start === null ||
        body.night_shift_end === null
      ) {
        setError("Invalid time format. Use HH:MM AM/PM (e.g. 5:00 AM)");
        setSaving(false);
        return;
      }

      if (
        Number.isNaN(body.commission_percentage) ||
        body.commission_percentage <= 0 ||
        body.commission_percentage > 100
      ) {
        setError("Commission percentage must be between 0.01 and 100");
        setSaving(false);
        return;
      }

      const res = await fetch(`${API_URL}/manager/system-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to save");
      }

      setSaved(true);
      fetchLaunchPromoCustomers();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Service fee tier handlers
  const updateServiceTier = (idx, field, value) => {
    setServiceFeeTiers((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };
  const addServiceTier = () => {
    setServiceFeeTiers((prev) => [...prev, { min: "", max: "", fee: "" }]);
  };
  const removeServiceTier = (idx) => {
    setServiceFeeTiers((prev) => prev.filter((_, i) => i !== idx));
  };

  // Delivery fee tier handlers
  const updateDeliveryTier = (idx, field, value) => {
    setDeliveryFeeTiers((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };
  const addDeliveryTier = () => {
    setDeliveryFeeTiers((prev) => [...prev, { max_km: "", fee: "" }]);
  };
  const removeDeliveryTier = (idx) => {
    setDeliveryFeeTiers((prev) => prev.filter((_, i) => i !== idx));
  };

  // Order distance constraint handlers
  const updateConstraint = (idx, field, value) => {
    setOrderDistanceConstraints((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };
  const addConstraint = () => {
    setOrderDistanceConstraints((prev) => [
      ...prev,
      { min_km: "", max_km: "", min_subtotal: "" },
    ]);
  };
  const removeConstraint = (idx) => {
    setOrderDistanceConstraints((prev) => prev.filter((_, i) => i !== idx));
  };

  const calculateNormalDeliveryFeeForDistance = (distanceKm) => {
    if (
      distanceKm === null ||
      distanceKm === undefined ||
      Number.isNaN(distanceKm)
    ) {
      return null;
    }

    const parsedDistance = Number(distanceKm);
    if (parsedDistance < 0) return null;

    const tiers = [...deliveryFeeTiers]
      .map((t) => ({
        max_km: Number(t.max_km),
        fee: Number(t.fee),
      }))
      .filter((t) => Number.isFinite(t.max_km) && Number.isFinite(t.fee))
      .sort((a, b) => a.max_km - b.max_km);

    for (const tier of tiers) {
      if (parsedDistance <= tier.max_km) return Number(tier.fee.toFixed(2));
    }

    const baseKm = Number(overflowTier.base_km);
    const baseFee = Number(overflowTier.base_fee);
    const per100m = Number(overflowTier.extra_per_100m);

    if (
      !Number.isFinite(baseKm) ||
      !Number.isFinite(baseFee) ||
      !Number.isFinite(per100m)
    ) {
      return null;
    }

    const extraMeters = Math.max(0, (parsedDistance - baseKm) * 1000);
    const extra100mUnits = Math.ceil(extraMeters / 100);
    return Number((baseFee + extra100mUnits * per100m).toFixed(2));
  };

  const calculatePromoDeliveryFeeForDistance = (distanceKm) => {
    if (
      distanceKm === null ||
      distanceKm === undefined ||
      Number.isNaN(distanceKm)
    ) {
      return null;
    }

    const distance = Math.max(0, Number(distanceKm));
    const maxKm = Math.max(0, Number(launchPromoMaxKm));
    const firstKmRate = Math.max(0, Number(launchPromoFirstKmRate));
    const beyondRate = Math.max(0, Number(launchPromoBeyondKmRate));

    const fee =
      distance <= maxKm
        ? distance * firstKmRate
        : maxKm * firstKmRate + (distance - maxKm) * beyondRate;

    return Number(fee.toFixed(2));
  };

  const parsedCalculatorDistance = Number(calculatorDistanceKm);
  const calculatorDistanceIsValid =
    calculatorDistanceKm !== "" &&
    Number.isFinite(parsedCalculatorDistance) &&
    parsedCalculatorDistance >= 0;
  const calculatorNormalFee = calculatorDistanceIsValid
    ? calculateNormalDeliveryFeeForDistance(parsedCalculatorDistance)
    : null;
  const calculatorPromoFee = calculatorDistanceIsValid
    ? calculatePromoDeliveryFeeForDistance(parsedCalculatorDistance)
    : null;
  const calculatorDifference =
    calculatorNormalFee !== null && calculatorPromoFee !== null
      ? Number((calculatorNormalFee - calculatorPromoFee).toFixed(2))
      : null;

  if (loading) {
    return <ManagerPageSkeleton type="reports" />;
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-[#dbe6e3] bg-white text-[#111816] text-sm focus:outline-none focus:ring-2 focus:ring-[#13ecb9] focus:border-transparent";
  const labelClass =
    "text-xs font-semibold text-[#618980] uppercase tracking-wider mb-1";

  return (
    <ManagerPageLayout title="Operations Config">
      <div className="p-4 space-y-5 max-w-2xl mx-auto lg:max-w-none pb-28">
        {/* Success / Error Banners */}
        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-green-600">
              check_circle
            </span>
            <span className="text-green-800 text-sm font-medium">
              Configuration saved successfully!
            </span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-red-600">
              error
            </span>
            <span className="text-red-800 text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <span className="material-symbols-outlined text-red-400 text-lg">
                close
              </span>
            </button>
          </div>
        )}

        {/* ========== SECTION 1: Driver Earnings ========== */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-[#13ecb9]/10 to-transparent border-b border-[#dbe6e3]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#13ecb9]">
                payments
              </span>
              <h3 className="text-[#111816] font-bold text-sm">
                Driver Earnings
              </h3>
            </div>
            <p className="text-[#618980] text-xs mt-0.5">
              Rate and bonus configuration for drivers
            </p>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>RTC Rate {"<="} 5km (Rs./km)</label>
              <input
                type="number"
                step="0.01"
                value={rtcRateBelow5Km}
                onChange={(e) => setRtcRateBelow5Km(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Paid per km for Restaurant→Customer leg up to 5km
              </p>
            </div>
            <div>
              <label className={labelClass}>RTC Rate {">"} 5km (Rs./km)</label>
              <input
                type="number"
                step="0.01"
                value={rtcRateAbove5Km}
                onChange={(e) => setRtcRateAbove5Km(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Paid per km for Restaurant→Customer leg above 5km
              </p>
            </div>
            <div>
              <label className={labelClass}>Max DTR Distance (km)</label>
              <input
                type="number"
                step="0.1"
                value={maxDTRKm}
                onChange={(e) => setMaxDTRKm(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Max paid distance: Driver→Restaurant
              </p>
            </div>
            <div>
              <label className={labelClass}>Rate per KM (Rs.)</label>
              <input
                type="number"
                step="0.01"
                value={ratePerKm}
                onChange={(e) => setRatePerKm(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Used for extra-distance and legacy fallback calculations
              </p>
            </div>
            <div>
              <label className={labelClass}>DTR Amount (Rs./km)</label>
              <input
                type="number"
                step="0.01"
                value={maxDTRAmount}
                onChange={(e) => setMaxDTRAmount(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Rate per km for Driver→Restaurant leg
              </p>
            </div>
            <div>
              <label className={labelClass}>
                Max Restaurant Proximity (km)
              </label>
              <input
                type="number"
                step="0.1"
                value={maxRestProximity}
                onChange={(e) => setMaxRestProximity(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Max distance between restaurants for stacked delivery
              </p>
            </div>
            <div>
              <label className={labelClass}>2nd Delivery Bonus (Rs.)</label>
              <input
                type="number"
                step="1"
                value={secondBonus}
                onChange={(e) => setSecondBonus(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Bonus for accepting 2nd delivery
              </p>
            </div>
            <div>
              <label className={labelClass}>
                Additional Delivery Bonus (Rs.)
              </label>
              <input
                type="number"
                step="1"
                value={additionalBonus}
                onChange={(e) => setAdditionalBonus(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Bonus for 3rd, 4th, 5th delivery
              </p>
            </div>
          </div>
        </div>

        {/* ========== SECTION 2: Delivery Availability ========== */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-transparent border-b border-[#dbe6e3]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600">
                tune
              </span>
              <h3 className="text-[#111816] font-bold text-sm">
                Delivery Availability Thresholds
              </h3>
            </div>
            <p className="text-[#618980] text-xs mt-0.5">
              Controls which deliveries are shown to drivers
            </p>
          </div>
          <div className="p-4 grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Max Extra Time (min)</label>
              <input
                type="number"
                value={maxExtraTime}
                onChange={(e) => setMaxExtraTime(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max Extra Distance (km)</label>
              <input
                type="number"
                step="0.1"
                value={maxExtraDistance}
                onChange={(e) => setMaxExtraDistance(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Max Active Deliveries</label>
              <input
                type="number"
                value={maxActiveDeliveries}
                onChange={(e) => setMaxActiveDeliveries(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* ========== SECTION 3: Service Fee Tiers ========== */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-transparent border-b border-[#dbe6e3]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-600">
                receipt_long
              </span>
              <h3 className="text-[#111816] font-bold text-sm">
                Service Fee Tiers
              </h3>
              <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                Customer Facing
              </span>
            </div>
            <p className="text-[#618980] text-xs mt-0.5">
              Fee charged based on order subtotal
            </p>
          </div>
          <div className="p-4 space-y-2">
            <div className="max-w-xs mb-2">
              <label className={labelClass}>Commission Percentage (%)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={commissionPercentage}
                onChange={(e) => setCommissionPercentage(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Applied on food prices above Rs.100 (rounded up to nearest 10)
              </p>
            </div>

            {/* Header */}
            <div className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 text-[10px] font-semibold text-[#618980] uppercase tracking-wider">
              <span>Min (Rs.)</span>
              <span>Max (Rs.)</span>
              <span>Fee (Rs.)</span>
              <span></span>
            </div>
            {serviceFeeTiers.map((tier, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 items-center"
              >
                <input
                  type="number"
                  value={tier.min}
                  onChange={(e) =>
                    updateServiceTier(idx, "min", e.target.value)
                  }
                  className={inputClass}
                  placeholder="0"
                />
                <input
                  type="number"
                  value={tier.max}
                  onChange={(e) =>
                    updateServiceTier(idx, "max", e.target.value)
                  }
                  className={inputClass}
                  placeholder="∞"
                />
                <input
                  type="number"
                  step="0.01"
                  value={tier.fee}
                  onChange={(e) =>
                    updateServiceTier(idx, "fee", e.target.value)
                  }
                  className={inputClass}
                  placeholder="0"
                />
                <button
                  onClick={() => removeServiceTier(idx)}
                  className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 transition"
                >
                  <span className="material-symbols-outlined text-red-500 text-lg">
                    delete
                  </span>
                </button>
              </div>
            ))}
            <button
              onClick={addServiceTier}
              className="flex items-center gap-1 text-[#13ecb9] text-xs font-medium hover:underline mt-1"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add Tier
            </button>
          </div>
        </div>

        {/* ========== SECTION 4: Delivery Fee Tiers ========== */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-transparent border-b border-[#dbe6e3]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600">
                local_shipping
              </span>
              <h3 className="text-[#111816] font-bold text-sm">
                Delivery Fee Tiers
              </h3>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                Customer Facing
              </span>
            </div>
            <p className="text-[#618980] text-xs mt-0.5">
              Fee charged based on delivery distance
            </p>
          </div>
          <div className="p-4 space-y-2">
            {/* Fixed tiers */}
            <div className="grid grid-cols-[1fr_1fr_40px] gap-2 text-[10px] font-semibold text-[#618980] uppercase tracking-wider">
              <span>Up to (km)</span>
              <span>Fee (Rs.)</span>
              <span></span>
            </div>
            {deliveryFeeTiers.map((tier, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_1fr_40px] gap-2 items-center"
              >
                <input
                  type="number"
                  step="0.1"
                  value={tier.max_km}
                  onChange={(e) =>
                    updateDeliveryTier(idx, "max_km", e.target.value)
                  }
                  className={inputClass}
                  placeholder="km"
                />
                <input
                  type="number"
                  step="0.01"
                  value={tier.fee}
                  onChange={(e) =>
                    updateDeliveryTier(idx, "fee", e.target.value)
                  }
                  className={inputClass}
                  placeholder="Rs."
                />
                <button
                  onClick={() => removeDeliveryTier(idx)}
                  className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 transition"
                >
                  <span className="material-symbols-outlined text-red-500 text-lg">
                    delete
                  </span>
                </button>
              </div>
            ))}
            <button
              onClick={addDeliveryTier}
              className="flex items-center gap-1 text-[#13ecb9] text-xs font-medium hover:underline mt-1"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Add Tier
            </button>

            {/* Overflow / extra distance tier */}
            <div className="mt-3 pt-3 border-t border-[#dbe6e3]">
              <p className="text-[10px] font-semibold text-[#618980] uppercase tracking-wider mb-2">
                Beyond max tier (extra distance pricing)
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass}>Base KM</label>
                  <input
                    type="number"
                    step="0.1"
                    value={overflowTier.base_km}
                    onChange={(e) =>
                      setOverflowTier((p) => ({
                        ...p,
                        base_km: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Base Fee (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={overflowTier.base_fee}
                    onChange={(e) =>
                      setOverflowTier((p) => ({
                        ...p,
                        base_fee: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Per 100m Extra (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={overflowTier.extra_per_100m}
                    onChange={(e) =>
                      setOverflowTier((p) => ({
                        ...p,
                        extra_per_100m: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========== SECTION 5: Pending Alert ========== */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-red-50 to-transparent border-b border-[#dbe6e3]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500">
                notification_important
              </span>
              <h3 className="text-[#111816] font-bold text-sm">
                Pending Delivery Alert
              </h3>
              <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                Manager Facing
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="max-w-xs">
              <label className={labelClass}>
                Minutes before showing as pending
              </label>
              <input
                type="number"
                value={pendingMinutes}
                onChange={(e) => setPendingMinutes(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Deliveries without a driver after this time will appear in
                Pending Deliveries
              </p>
            </div>
          </div>
        </div>

        {/* ========== SECTION 6: Working Hours ========== */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-transparent border-b border-[#dbe6e3]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600">
                schedule
              </span>
              <h3 className="text-[#111816] font-bold text-sm">
                Driver Working Hours
              </h3>
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                Driver Facing
              </span>
            </div>
            <p className="text-[#618980] text-xs mt-0.5">
              Shift timings for day and night drivers
            </p>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Day Shift */}
              <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100">
                <div className="flex items-center gap-1 mb-2">
                  <span className="material-symbols-outlined text-amber-500 text-base">
                    light_mode
                  </span>
                  <span className="text-xs font-bold text-[#111816]">
                    Day Shift
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className={labelClass}>Start</label>
                    <input
                      type="text"
                      value={dayStart}
                      onChange={(e) => setDayStart(e.target.value)}
                      placeholder="5:00 AM"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>End</label>
                    <input
                      type="text"
                      value={dayEnd}
                      onChange={(e) => setDayEnd(e.target.value)}
                      placeholder="7:00 PM"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
              {/* Night Shift */}
              <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100">
                <div className="flex items-center gap-1 mb-2">
                  <span className="material-symbols-outlined text-indigo-500 text-base">
                    dark_mode
                  </span>
                  <span className="text-xs font-bold text-[#111816]">
                    Night Shift
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className={labelClass}>Start</label>
                    <input
                      type="text"
                      value={nightStart}
                      onChange={(e) => setNightStart(e.target.value)}
                      placeholder="6:00 PM"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>End</label>
                    <input
                      type="text"
                      value={nightEnd}
                      onChange={(e) => setNightEnd(e.target.value)}
                      placeholder="6:00 AM"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[#618980] mt-2">
              Format: HH:MM AM/PM (e.g. 5:00 AM, 7:00 PM). Full-time drivers are
              always active.
            </p>
          </div>
        </div>

        {/* ========== SECTION 7: Order Distance Constraints ========== */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-transparent border-b border-[#dbe6e3]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-600">
                straighten
              </span>
              <h3 className="text-[#111816] font-bold text-sm">
                Order Distance Constraints
              </h3>
              <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                Customer Facing
              </span>
            </div>
            <p className="text-[#618980] text-xs mt-0.5">
              Minimum order subtotal based on customer-to-restaurant distance
            </p>
          </div>
          <div className="p-4 space-y-3">
            {/* Max distance */}
            <div className="max-w-xs">
              <label className={labelClass}>Max Order Distance (km)</label>
              <input
                type="number"
                step="0.1"
                value={maxOrderDistanceKm}
                onChange={(e) => setMaxOrderDistanceKm(e.target.value)}
                className={inputClass}
              />
              <p className="text-[10px] text-[#618980] mt-0.5">
                Customers beyond this distance cannot place orders
              </p>
            </div>

            {/* Constraint tiers */}
            <div className="mt-3 pt-3 border-t border-[#dbe6e3]">
              <p className="text-[10px] font-semibold text-[#618980] uppercase tracking-wider mb-2">
                Distance-based minimum subtotal tiers
              </p>
              <div className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 text-[10px] font-semibold text-[#618980] uppercase tracking-wider mb-1">
                <span>From (km)</span>
                <span>To (km)</span>
                <span>Min Subtotal (Rs.)</span>
                <span></span>
              </div>
              {orderDistanceConstraints.map((c, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_1fr_1fr_40px] gap-2 items-center mb-1"
                >
                  <input
                    type="number"
                    step="0.1"
                    value={c.min_km}
                    onChange={(e) =>
                      updateConstraint(idx, "min_km", e.target.value)
                    }
                    className={inputClass}
                    placeholder="0"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={c.max_km}
                    onChange={(e) =>
                      updateConstraint(idx, "max_km", e.target.value)
                    }
                    className={inputClass}
                    placeholder="5"
                  />
                  <input
                    type="number"
                    step="1"
                    value={c.min_subtotal}
                    onChange={(e) =>
                      updateConstraint(idx, "min_subtotal", e.target.value)
                    }
                    className={inputClass}
                    placeholder="300"
                  />
                  <button
                    onClick={() => removeConstraint(idx)}
                    className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center hover:bg-red-100 transition"
                  >
                    <span className="material-symbols-outlined text-red-500 text-lg">
                      delete
                    </span>
                  </button>
                </div>
              ))}
              <button
                onClick={addConstraint}
                className="flex items-center gap-1 text-[#13ecb9] text-xs font-medium hover:underline mt-1"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Constraint
              </button>
            </div>
          </div>
        </div>

        {/* ========== SECTION 8: Launch Promotion ========== */}
        <div className="bg-white rounded-xl border border-[#dbe6e3] overflow-hidden">
          <div className="px-4 py-3 bg-linear-to-r from-emerald-50 to-transparent border-b border-[#dbe6e3]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">
                local_offer
              </span>
              <h3 className="text-[#111816] font-bold text-sm">
                Launch Promotion (First Delivery)
              </h3>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                Customer Facing
              </span>
            </div>
            <p className="text-[#618980] text-xs mt-0.5">
              Applies only to first-ever order after customer accepts popup
            </p>
          </div>
          <div className="p-4 space-y-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={launchPromoEnabled}
                onChange={(e) => setLaunchPromoEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#13ecb9]"
              />
              <span className="text-sm font-semibold text-[#111816]">
                Enable launch promotion
              </span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Promo price per 1km (Rs.)</label>
                <input
                  type="number"
                  step="0.01"
                  value={launchPromoFirstKmRate}
                  onChange={(e) => setLaunchPromoFirstKmRate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Promo valid up to (km)</label>
                <input
                  type="number"
                  step="1"
                  value={launchPromoMaxKm}
                  onChange={(e) => setLaunchPromoMaxKm(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Beyond promo per 1km (Rs.)</label>
                <input
                  type="number"
                  step="0.01"
                  value={launchPromoBeyondKmRate}
                  onChange={(e) => setLaunchPromoBeyondKmRate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 border border-[#dbe6e3] text-xs text-[#618980]">
              Formula: up to {launchPromoMaxKm} km = distance x Rs.{" "}
              {launchPromoFirstKmRate}. Above {launchPromoMaxKm} km = (
              {launchPromoMaxKm} x Rs. {launchPromoFirstKmRate}) + ((distance -{" "}
              {launchPromoMaxKm}) x Rs. {launchPromoBeyondKmRate}).
            </div>

            <div className="bg-[#f8fbfa] rounded-lg p-3 border border-[#dbe6e3] space-y-3">
              <p className="text-[10px] font-semibold text-[#618980] uppercase tracking-wider">
                Live Calculator
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={calculatorDistanceKm}
                    onChange={(e) => setCalculatorDistanceKm(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. 3.3"
                  />
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                    Promo Fee (1st Order)
                  </p>
                  <p className="text-lg font-bold text-emerald-800 mt-1">
                    {calculatorPromoFee === null
                      ? "--"
                      : `Rs. ${calculatorPromoFee.toFixed(2)}`}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Normal Fee (2nd+ Orders)
                  </p>
                  <p className="text-lg font-bold text-slate-800 mt-1">
                    {calculatorNormalFee === null
                      ? "--"
                      : `Rs. ${calculatorNormalFee.toFixed(2)}`}
                  </p>
                </div>
              </div>
              {calculatorDifference !== null && (
                <p
                  className={`text-xs font-medium ${
                    calculatorDifference >= 0
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }`}
                >
                  Difference (normal - promo): Rs.{" "}
                  {calculatorDifference.toFixed(2)}
                </p>
              )}
              {!calculatorDistanceIsValid && (
                <p className="text-xs text-red-600">
                  Enter a valid non-negative distance to see calculation.
                </p>
              )}
            </div>

            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-[#618980] uppercase tracking-wider">
                  Customers who accepted promotion (
                  {launchPromoCustomers.length})
                </p>
                <button
                  onClick={fetchLaunchPromoCustomers}
                  className="text-xs text-[#13ecb9] font-medium hover:underline"
                >
                  Refresh
                </button>
              </div>
              <div className="overflow-x-auto border border-[#dbe6e3] rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-[#f8fbfa] text-[#618980]">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">
                        Customer
                      </th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Phone
                      </th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Accepted
                      </th>
                      <th className="text-left px-3 py-2 font-semibold">
                        Orders
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {launchPromoCustomers.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-[#8aa39c]" colSpan={4}>
                          No customers have acknowledged this promotion yet.
                        </td>
                      </tr>
                    ) : (
                      launchPromoCustomers.map((customer) => (
                        <tr
                          key={customer.id}
                          className="border-t border-[#eef4f2]"
                        >
                          <td className="px-3 py-2 text-[#111816]">
                            <div className="font-medium">
                              {customer.username || "-"}
                            </div>
                            <div className="text-[#8aa39c]">
                              {customer.email || "-"}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[#111816]">
                            {customer.phone || "-"}
                          </td>
                          <td className="px-3 py-2 text-[#111816]">
                            {customer.launch_promo_acknowledged_at
                              ? new Date(
                                  customer.launch_promo_acknowledged_at,
                                ).toLocaleString()
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-[#111816]">
                            {customer.orders_count || 0}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ========== SAVE BUTTON ========== */}
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-white/90 backdrop-blur-sm border-t border-[#dbe6e3] z-30 max-w-2xl mx-auto lg:max-w-none lg:static lg:bg-transparent lg:border-0 lg:p-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
              saving
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-[#13ecb9] text-[#111816] hover:bg-[#0fd9a8] active:scale-[0.98] shadow-lg shadow-[#13ecb9]/20"
            }`}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                Saving...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">save</span>
                Save All Changes
              </span>
            )}
          </button>
        </div>
      </div>
    </ManagerPageLayout>
  );
}
