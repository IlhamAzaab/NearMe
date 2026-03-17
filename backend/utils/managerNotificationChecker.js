/**
 * Notification Checker
 *
 * Runs periodically to check for conditions that warrant notifications:
 *
 * MANAGER notifications:
 * 1. Unassigned deliveries (pending >10 min with no driver) → continuous alert
 * 2. Daily order completion milestones (every 10 orders TODAY) → success
 * 3. Daily manager earnings milestones (every Rs.2000 TODAY) → success
 *
 * DRIVER notifications:
 * 4. Daily driver delivery milestone (every 10 deliveries TODAY per driver) → success
 *
 * ADMIN (restaurant) notifications:
 * 5. Daily restaurant order milestone (every 10 orders TODAY per restaurant) → success
 *
 * All milestones reset at the start of each new day.
 */

import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  broadcastToManagers,
  notifyDriver,
  notifyAdmin,
} from "./socketManager.js";
import {
  sendUnassignedDeliveryAlertToManagers,
  sendMilestoneNotification,
} from "./pushNotificationService.js";

// ── State tracking ──────────────────────────────────────────────────────
const sentUnassignedAlerts = new Set();

// Daily milestone tracking – keyed by date string "YYYY-MM-DD"
let currentDay = "";
let managerOrderMilestone = 0;
let managerEarningsMilestone = 0;
const driverMilestones = new Map(); // driverId → last daily milestone
const restaurantMilestones = new Map(); // restaurantId → last daily milestone

/**
 * Get today's date string in Sri Lanka timezone (UTC+5:30)
 */
function getTodayStr() {
  const now = new Date();
  const sriLankaOffset = 5.5 * 60 * 60 * 1000;
  const sriLankaDate = new Date(now.getTime() + sriLankaOffset);
  return sriLankaDate.toISOString().split("T")[0];
}

/**
 * Get start of today in UTC (Sri Lanka midnight converted to UTC)
 */
function getTodayStartUTC() {
  const todayStr = getTodayStr();
  const sriLankaMidnight = new Date(todayStr + "T00:00:00+05:30");
  return sriLankaMidnight.toISOString();
}

/**
 * Reset milestones if it's a new day
 */
function checkDayReset() {
  const today = getTodayStr();
  if (today !== currentDay) {
    console.log(
      `[NotifChecker] 📅 New day detected: ${today} (was: ${currentDay || "init"})`,
    );
    currentDay = today;
    managerOrderMilestone = 0;
    managerEarningsMilestone = 0;
    driverMilestones.clear();
    restaurantMilestones.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. UNASSIGNED DELIVERIES (Manager)
// ═══════════════════════════════════════════════════════════════════════
async function checkUnassignedDeliveries() {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: unassigned, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        `
        id, order_id, status, created_at, tip_amount,
        orders!inner (
          order_number, restaurant_name, restaurant_address,
          delivery_address, delivery_city, total_amount, distance_km,
          estimated_duration_min
        )
      `,
      )
      .eq("status", "pending")
      .is("driver_id", null)
      .lt("created_at", tenMinutesAgo);

    if (error) {
      console.error("[NotifChecker] Unassigned query error:", error.message);
      return;
    }

    if (!unassigned || unassigned.length === 0) return;

    for (const delivery of unassigned) {
      if (sentUnassignedAlerts.has(delivery.id)) continue;

      const waitMinutes = Math.round(
        (Date.now() - new Date(delivery.created_at).getTime()) / 60000,
      );

      console.log(
        `[NotifChecker] ⚠️ Delivery ${delivery.id} unassigned for ${waitMinutes} mins`,
      );

      broadcastToManagers("manager:unassigned_delivery", {
        type: "unassigned_delivery",
        delivery_id: delivery.id,
        order_id: delivery.order_id,
        order_number: delivery.orders?.order_number || "N/A",
        restaurant_name: delivery.orders?.restaurant_name || "Restaurant",
        restaurant_address: delivery.orders?.restaurant_address || "",
        delivery_address: delivery.orders?.delivery_address || "",
        delivery_city: delivery.orders?.delivery_city || "",
        total_amount: parseFloat(delivery.orders?.total_amount || 0),
        distance_km: parseFloat(delivery.orders?.distance_km || 0),
        tip_amount: parseFloat(delivery.tip_amount || 0),
        waiting_minutes: waitMinutes,
        created_at: delivery.created_at,
      });

      // 📱 PUSH NOTIFICATION: Alert managers with persistent alarm
      sendUnassignedDeliveryAlertToManagers({
        deliveryId: delivery.id,
        orderNumber: delivery.orders?.order_number || "N/A",
        restaurantName: delivery.orders?.restaurant_name || "Restaurant",
        waitingMinutes: waitMinutes,
      }).catch((err) => console.error("[NotifChecker] Push alert error:", err));

      sentUnassignedAlerts.add(delivery.id);
    }

    // Cleanup resolved alerts
    for (const alertedId of sentUnassignedAlerts) {
      const stillPending = unassigned?.some((d) => d.id === alertedId);
      if (!stillPending) {
        const { data: check } = await supabaseAdmin
          .from("deliveries")
          .select("status, driver_id")
          .eq("id", alertedId)
          .single();

        if (check && (check.driver_id || check.status !== "pending")) {
          sentUnassignedAlerts.delete(alertedId);
        }
      }
    }
  } catch (err) {
    console.error("[NotifChecker] Unassigned check error:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 2. MANAGER DAILY ORDER MILESTONE (every 10 orders today)
// ═══════════════════════════════════════════════════════════════════════
async function checkManagerOrderMilestone() {
  try {
    const todayStart = getTodayStartUTC();

    const { count: todayDelivered } = await supabaseAdmin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered")
      .gte("updated_at", todayStart);

    const total = todayDelivered || 0;
    const milestone = Math.floor(total / 10) * 10;

    if (milestone > managerOrderMilestone && milestone > 0) {
      console.log(
        `[NotifChecker] 🎉 Manager daily order milestone: ${milestone} today!`,
      );

      // Today's revenue
      const { data: todayOrders } = await supabaseAdmin
        .from("orders")
        .select("total_amount")
        .eq("status", "delivered")
        .gte("delivered_at", todayStart);

      const todayRevenue = (todayOrders || []).reduce(
        (sum, o) => sum + parseFloat(o.total_amount || 0),
        0,
      );

      broadcastToManagers("manager:order_milestone", {
        type: "order_milestone",
        milestone,
        total_orders: total,
        today_revenue: parseFloat(todayRevenue.toFixed(2)),
        message: `🎉 ${milestone} Orders Completed Today!`,
        redirect: "/manager/reports/deliveries",
      });

      // 📱 PUSH NOTIFICATION: Notify all managers about milestone
      // Get all manager user IDs
      const { data: managers } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("role", "manager");

      if (managers && managers.length > 0) {
        for (const mgr of managers) {
          sendMilestoneNotification(mgr.id, "manager", {
            milestone,
            todayCount: total,
            todayRevenue: parseFloat(todayRevenue.toFixed(2)),
            message: `🎉 ${milestone} Orders Completed Today! Total revenue: Rs. ${todayRevenue.toFixed(2)}`,
          }).catch((err) =>
            console.error("[NotifChecker] Manager milestone push error:", err),
          );
        }
      }

      managerOrderMilestone = milestone;
    }
  } catch (err) {
    console.error("[NotifChecker] Manager order milestone error:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. MANAGER DAILY EARNINGS MILESTONE (every Rs.2000 today)
// ═══════════════════════════════════════════════════════════════════════
async function checkManagerEarningsMilestone() {
  try {
    const todayStart = getTodayStartUTC();

    // Get today's delivered deliveries
    const { data: deliveries } = await supabaseAdmin
      .from("deliveries")
      .select("order_id, driver_earnings")
      .eq("status", "delivered")
      .gte("updated_at", todayStart);

    if (!deliveries || deliveries.length === 0) return;

    const orderIds = deliveries.map((d) => d.order_id);
    const driverEarningsMap = {};
    for (const d of deliveries) {
      driverEarningsMap[d.order_id] = parseFloat(d.driver_earnings || 0);
    }

    let allOrders = [];
    const batchSize = 100;
    for (let i = 0; i < orderIds.length; i += batchSize) {
      const batch = orderIds.slice(i, i + batchSize);
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("id, total_amount, admin_subtotal")
        .in("id", batch);
      if (orders) allOrders = allOrders.concat(orders);
    }

    let todayEarnings = 0;
    for (const order of allOrders) {
      const total = parseFloat(order.total_amount || 0);
      const adminPayout = parseFloat(order.admin_subtotal || 0);
      const driverEarning = driverEarningsMap[order.id] || 0;
      todayEarnings += total - adminPayout - driverEarning;
    }

    const milestone = Math.floor(todayEarnings / 2000) * 2000;

    if (milestone > managerEarningsMilestone && milestone > 0) {
      console.log(
        `[NotifChecker] 💰 Manager daily earnings milestone: Rs.${milestone}!`,
      );

      broadcastToManagers("manager:earnings_milestone", {
        type: "earnings_milestone",
        milestone,
        total_earnings: parseFloat(todayEarnings.toFixed(2)),
        today_orders: deliveries.length,
        message: `💰 Today's Earnings Reached Rs.${milestone.toLocaleString()}!`,
        redirect: "/manager/earnings",
      });

      managerEarningsMilestone = milestone;
    }
  } catch (err) {
    console.error(
      "[NotifChecker] Manager earnings milestone error:",
      err.message,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. DRIVER DAILY DELIVERY MILESTONE (every 10 deliveries today per driver)
// ═══════════════════════════════════════════════════════════════════════
async function checkDriverMilestones() {
  try {
    const todayStart = getTodayStartUTC();

    const { data: rows, error } = await supabaseAdmin
      .from("deliveries")
      .select("driver_id")
      .eq("status", "delivered")
      .not("driver_id", "is", null)
      .gte("updated_at", todayStart);

    if (error || !rows || rows.length === 0) return;

    // Count per driver
    const counts = {};
    for (const r of rows) {
      counts[r.driver_id] = (counts[r.driver_id] || 0) + 1;
    }

    for (const [driverId, count] of Object.entries(counts)) {
      const milestone = Math.floor(count / 10) * 10;
      const lastMilestone = driverMilestones.get(driverId) || 0;

      if (milestone > lastMilestone && milestone > 0) {
        console.log(
          `[NotifChecker] 🚗 Driver ${driverId} daily milestone: ${milestone} deliveries today`,
        );

        notifyDriver(driverId, "driver:delivery_milestone", {
          type: "delivery_milestone",
          milestone,
          today_deliveries: count,
          message: `🎉 You completed ${milestone} deliveries today!`,
        });

        // 📱 PUSH NOTIFICATION: Notify driver about milestone
        sendMilestoneNotification(driverId, "driver", {
          milestone,
          todayCount: count,
          message: `🎉 You completed ${milestone} deliveries today! Keep it up!`,
        }).catch((err) =>
          console.error("[NotifChecker] Driver milestone push error:", err),
        );

        driverMilestones.set(driverId, milestone);
      }
    }
  } catch (err) {
    console.error("[NotifChecker] Driver milestone error:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. ADMIN (RESTAURANT) DAILY ORDER MILESTONE (every 10 orders today)
// ═══════════════════════════════════════════════════════════════════════
async function checkRestaurantMilestones() {
  try {
    const todayStart = getTodayStartUTC();

    // Only count orders where driver has picked up or beyond
    // Before pickup, money is not paid to admin
    const qualifyingStatuses = ["picked_up", "on_the_way", "at_customer", "delivered"];

    const { data: todayDeliveries, error: delError } = await supabaseAdmin
      .from("deliveries")
      .select("order_id, status")
      .in("status", qualifyingStatuses)
      .gte("updated_at", todayStart);

    if (delError || !todayDeliveries || todayDeliveries.length === 0) return;

    const qualifyingOrderIds = todayDeliveries.map((d) => d.order_id);

    // Batch fetch orders in groups of 100
    let todayOrders = [];
    const batchSize = 100;
    for (let i = 0; i < qualifyingOrderIds.length; i += batchSize) {
      const batch = qualifyingOrderIds.slice(i, i + batchSize);
      const { data: orders, error } = await supabaseAdmin
        .from("orders")
        .select("id, restaurant_id, total_amount")
        .in("id", batch)
        .not("restaurant_id", "is", null);
      if (error) continue;
      if (orders) todayOrders = todayOrders.concat(orders);
    }

    if (todayOrders.length === 0) return;

    // Group by restaurant
    const restaurantData = {};
    for (const order of todayOrders) {
      if (!order.restaurant_id) continue;
      if (!restaurantData[order.restaurant_id]) {
        restaurantData[order.restaurant_id] = { count: 0, revenue: 0 };
      }
      restaurantData[order.restaurant_id].count += 1;
      restaurantData[order.restaurant_id].revenue += parseFloat(
        order.total_amount || 0,
      );
    }

    for (const [restaurantId, data] of Object.entries(restaurantData)) {
      const milestone = Math.floor(data.count / 10) * 10;
      const lastMilestone = restaurantMilestones.get(restaurantId) || 0;

      if (milestone > lastMilestone && milestone > 0) {
        // Find the admin(s) for this restaurant
        const { data: admins } = await supabaseAdmin
          .from("admins")
          .select("id")
          .eq("restaurant_id", restaurantId);

        if (admins && admins.length > 0) {
          for (const admin of admins) {
            console.log(
              `[NotifChecker] 🍽️ Restaurant ${restaurantId} admin ${admin.id}: ${milestone} orders today`,
            );

            notifyAdmin(admin.id, "admin:order_milestone", {
              type: "order_milestone",
              milestone,
              today_orders: data.count,
              today_revenue: parseFloat(data.revenue.toFixed(2)),
              message: `🎉 ${milestone} Orders Completed Today!`,
            });

            // 📱 PUSH NOTIFICATION: Notify admin about restaurant milestone
            sendMilestoneNotification(admin.id, "admin", {
              milestone,
              todayCount: data.count,
              todayRevenue: parseFloat(data.revenue.toFixed(2)),
              message: `🎉 ${milestone} Orders Completed Today! Revenue: Rs. ${data.revenue.toFixed(2)}`,
            }).catch((err) =>
              console.error("[NotifChecker] Admin milestone push error:", err),
            );
          }
        }

        restaurantMilestones.set(restaurantId, milestone);
      }
    }
  } catch (err) {
    console.error("[NotifChecker] Restaurant milestone error:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN: Run all checks
// ═══════════════════════════════════════════════════════════════════════
export async function runManagerChecks() {
  checkDayReset();

  await Promise.allSettled([
    checkUnassignedDeliveries(),
    checkManagerOrderMilestone(),
    checkManagerEarningsMilestone(),
    checkDriverMilestones(),
    checkRestaurantMilestones(),
  ]);
}

export default { runManagerChecks };
