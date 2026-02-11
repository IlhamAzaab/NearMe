import express from "express";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { authenticate } from "../middleware/authenticate.js";

const router = express.Router();

// Helper: Get date range from period
function getDateRange(period, from, to) {
  const now = new Date();
  let startDate, endDate;

  if (from && to) {
    startDate = new Date(from);
    endDate = new Date(to);
  } else if (period === "daily") {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
  } else if (period === "weekly") {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
  } else if (period === "monthly") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else {
    // all time - last 365 days
    startDate = new Date(now);
    startDate.setFullYear(now.getFullYear() - 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
  }

  return { startDate, endDate };
}

// Helper: Format date for grouping
function formatDateKey(dateStr, groupBy) {
  const d = new Date(dateStr);
  if (groupBy === "hour") return d.getHours().toString();
  if (groupBy === "day") return d.toISOString().split("T")[0];
  if (groupBy === "weekday") return d.getDay().toString();
  if (groupBy === "month")
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return d.toISOString().split("T")[0];
}

/**
 * GET /manager/reports/sales
 * Sales analytics with trend data
 */
router.get("/sales", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { period = "monthly" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Fetch all orders in period
    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, restaurant_id, restaurant_name, subtotal, admin_subtotal, commission_total, delivery_fee, service_fee, total_amount, status, placed_at, delivered_at, payment_method",
      )
      .gte("placed_at", startDate.toISOString())
      .lte("placed_at", endDate.toISOString())
      .order("placed_at", { ascending: true });

    if (error) {
      console.error("Sales report error:", error);
      return res.status(500).json({ message: "Failed to fetch sales data" });
    }

    // Previous period for comparison
    const periodDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(startDate);
    prevStart.setDate(prevStart.getDate() - periodDays);

    const { data: prevOrders } = await supabaseAdmin
      .from("orders")
      .select("id, total_amount, status, placed_at")
      .gte("placed_at", prevStart.toISOString())
      .lt("placed_at", startDate.toISOString());

    const allOrders = orders || [];
    const prevOrdersList = prevOrders || [];

    // Summary metrics
    const totalSales = allOrders.reduce(
      (sum, o) => sum + parseFloat(o.total_amount || 0),
      0,
    );
    const prevTotalSales = prevOrdersList.reduce(
      (sum, o) => sum + parseFloat(o.total_amount || 0),
      0,
    );
    const totalOrders = allOrders.length;
    const prevTotalOrders = prevOrdersList.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const prevAvgOrderValue =
      prevTotalOrders > 0 ? prevTotalSales / prevTotalOrders : 0;

    const deliveredOrders = allOrders.filter(
      (o) => o.status === "delivered",
    ).length;
    const cancelledOrders = allOrders.filter(
      (o) => o.status === "cancelled" || o.status === "rejected",
    ).length;

    // Growth percentages
    const salesGrowth =
      prevTotalSales > 0
        ? ((totalSales - prevTotalSales) / prevTotalSales) * 100
        : 0;
    const ordersGrowth =
      prevTotalOrders > 0
        ? ((totalOrders - prevTotalOrders) / prevTotalOrders) * 100
        : 0;
    const avgGrowth =
      prevAvgOrderValue > 0
        ? ((avgOrderValue - prevAvgOrderValue) / prevAvgOrderValue) * 100
        : 0;

    // Daily trend data
    const groupBy =
      period === "daily" ? "hour" : period === "weekly" ? "day" : "day";
    const trendMap = {};

    for (const order of allOrders) {
      const key = formatDateKey(order.placed_at, groupBy);
      if (!trendMap[key]) {
        trendMap[key] = { date: key, sales: 0, orders: 0 };
      }
      trendMap[key].sales += parseFloat(order.total_amount || 0);
      trendMap[key].orders += 1;
    }

    const trend = Object.values(trendMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Payment method breakdown
    const paymentBreakdown = {};
    for (const order of allOrders) {
      const method = order.payment_method || "unknown";
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { method, count: 0, total: 0 };
      }
      paymentBreakdown[method].count += 1;
      paymentBreakdown[method].total += parseFloat(order.total_amount || 0);
    }

    // Top restaurants by sales
    const restaurantMap = {};
    for (const order of allOrders) {
      const rid = order.restaurant_id;
      if (!restaurantMap[rid]) {
        restaurantMap[rid] = {
          id: rid,
          name: order.restaurant_name,
          orders: 0,
          sales: 0,
        };
      }
      restaurantMap[rid].orders += 1;
      restaurantMap[rid].sales += parseFloat(order.total_amount || 0);
    }
    const topRestaurants = Object.values(restaurantMap)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    // Order status breakdown
    const statusBreakdown = {};
    for (const order of allOrders) {
      const s = order.status || "unknown";
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
    }

    return res.json({
      summary: {
        total_sales: parseFloat(totalSales.toFixed(2)),
        total_orders: totalOrders,
        avg_order_value: parseFloat(avgOrderValue.toFixed(2)),
        delivered_orders: deliveredOrders,
        cancelled_orders: cancelledOrders,
        sales_growth: parseFloat(salesGrowth.toFixed(1)),
        orders_growth: parseFloat(ordersGrowth.toFixed(1)),
        avg_growth: parseFloat(avgGrowth.toFixed(1)),
      },
      trend,
      payment_breakdown: Object.values(paymentBreakdown),
      top_restaurants: topRestaurants,
      status_breakdown: statusBreakdown,
      period,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    });
  } catch (e) {
    console.error("/manager/reports/sales error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/reports/deliveries
 * Delivery performance analytics
 */
router.get("/deliveries", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { period = "monthly" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Fetch deliveries with driver and order info
    const { data: deliveries, error } = await supabaseAdmin
      .from("deliveries")
      .select(
        `id, order_id, driver_id, status, driver_earnings, tip_amount, 
         created_at, delivered_at, picked_up_at, on_the_way_at,
         drivers(id, full_name, phone, driver_type),
         orders!inner(id, total_amount, restaurant_name, distance_km, estimated_duration_min, placed_at)`,
      )
      .gte("orders.placed_at", startDate.toISOString())
      .lte("orders.placed_at", endDate.toISOString());

    if (error) {
      console.error("Delivery report error:", error);
      return res.status(500).json({ message: "Failed to fetch delivery data" });
    }

    const allDeliveries = deliveries || [];
    const deliveredList = allDeliveries.filter((d) => d.status === "delivered");
    const pendingList = allDeliveries.filter((d) => d.status === "pending");
    const cancelledList = allDeliveries.filter((d) => d.status === "cancelled");

    // Delivery times
    const deliveryTimes = [];
    for (const d of deliveredList) {
      if (d.created_at && d.delivered_at) {
        const mins =
          (new Date(d.delivered_at) - new Date(d.created_at)) / (1000 * 60);
        if (mins > 0 && mins < 300) deliveryTimes.push(mins);
      }
    }
    const avgDeliveryTime =
      deliveryTimes.length > 0
        ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length
        : 0;

    // Driver performance
    const driverMap = {};
    for (const d of allDeliveries) {
      if (!d.driver_id || !d.drivers) continue;
      if (!driverMap[d.driver_id]) {
        driverMap[d.driver_id] = {
          id: d.driver_id,
          name: d.drivers.full_name || "Unknown",
          type: d.drivers.driver_type || "unknown",
          total: 0,
          delivered: 0,
          earnings: 0,
          tips: 0,
          total_time: 0,
          delivery_count_with_time: 0,
        };
      }
      driverMap[d.driver_id].total += 1;
      if (d.status === "delivered") {
        driverMap[d.driver_id].delivered += 1;
        driverMap[d.driver_id].earnings += parseFloat(d.driver_earnings || 0);
        driverMap[d.driver_id].tips += parseFloat(d.tip_amount || 0);
        if (d.created_at && d.delivered_at) {
          const mins =
            (new Date(d.delivered_at) - new Date(d.created_at)) / (1000 * 60);
          if (mins > 0 && mins < 300) {
            driverMap[d.driver_id].total_time += mins;
            driverMap[d.driver_id].delivery_count_with_time += 1;
          }
        }
      }
    }
    const driverPerformance = Object.values(driverMap)
      .map((d) => ({
        ...d,
        avg_time:
          d.delivery_count_with_time > 0
            ? parseFloat((d.total_time / d.delivery_count_with_time).toFixed(1))
            : 0,
        completion_rate:
          d.total > 0
            ? parseFloat(((d.delivered / d.total) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.delivered - a.delivered)
      .slice(0, 15);

    // Daily trend
    const groupBy =
      period === "daily" ? "hour" : period === "weekly" ? "day" : "day";
    const trendMap = {};
    for (const d of allDeliveries) {
      const key = formatDateKey(d.orders.placed_at, groupBy);
      if (!trendMap[key]) {
        trendMap[key] = { date: key, total: 0, delivered: 0, cancelled: 0 };
      }
      trendMap[key].total += 1;
      if (d.status === "delivered") trendMap[key].delivered += 1;
      if (d.status === "cancelled") trendMap[key].cancelled += 1;
    }
    const trend = Object.values(trendMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Distance stats
    const distances = deliveredList
      .filter((d) => d.orders?.distance_km)
      .map((d) => parseFloat(d.orders.distance_km));
    const avgDistance =
      distances.length > 0
        ? distances.reduce((a, b) => a + b, 0) / distances.length
        : 0;
    const totalDistance = distances.reduce((a, b) => a + b, 0);

    // Status breakdown
    const statusBreakdown = {};
    for (const d of allDeliveries) {
      const s = d.status || "unknown";
      statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
    }

    return res.json({
      summary: {
        total_deliveries: allDeliveries.length,
        delivered: deliveredList.length,
        pending: pendingList.length,
        cancelled: cancelledList.length,
        completion_rate:
          allDeliveries.length > 0
            ? parseFloat(
                ((deliveredList.length / allDeliveries.length) * 100).toFixed(
                  1,
                ),
              )
            : 0,
        avg_delivery_time: parseFloat(avgDeliveryTime.toFixed(1)),
        avg_distance: parseFloat(avgDistance.toFixed(2)),
        total_distance: parseFloat(totalDistance.toFixed(2)),
        total_driver_earnings: parseFloat(
          deliveredList
            .reduce((s, d) => s + parseFloat(d.driver_earnings || 0), 0)
            .toFixed(2),
        ),
        total_tips: parseFloat(
          allDeliveries
            .reduce((s, d) => s + parseFloat(d.tip_amount || 0), 0)
            .toFixed(2),
        ),
      },
      trend,
      driver_performance: driverPerformance,
      status_breakdown: statusBreakdown,
      period,
    });
  } catch (e) {
    console.error("/manager/reports/deliveries error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/reports/restaurants
 * Restaurant performance analytics
 */
router.get("/restaurants", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { period = "monthly" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get all restaurants
    const { data: restaurants } = await supabaseAdmin
      .from("restaurants")
      .select(
        "id, restaurant_name, city, restaurant_status, created_at, admin_id",
      );

    // Get orders in period
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id, restaurant_id, restaurant_name, subtotal, admin_subtotal, commission_total, delivery_fee, service_fee, total_amount, status, placed_at",
      )
      .gte("placed_at", startDate.toISOString())
      .lte("placed_at", endDate.toISOString());

    const allRestaurants = restaurants || [];
    const allOrders = orders || [];

    // Restaurant status overview
    const statusCounts = {};
    for (const r of allRestaurants) {
      const s = r.restaurant_status || "unknown";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    // Performance per restaurant
    const perfMap = {};
    for (const order of allOrders) {
      const rid = order.restaurant_id;
      if (!perfMap[rid]) {
        perfMap[rid] = {
          id: rid,
          name: order.restaurant_name,
          total_orders: 0,
          delivered_orders: 0,
          cancelled_orders: 0,
          total_sales: 0,
          commission_earned: 0,
          restaurant_payout: 0,
        };
      }
      perfMap[rid].total_orders += 1;
      perfMap[rid].total_sales += parseFloat(order.total_amount || 0);
      perfMap[rid].commission_earned += parseFloat(order.commission_total || 0);
      perfMap[rid].restaurant_payout += parseFloat(order.admin_subtotal || 0);
      if (order.status === "delivered") perfMap[rid].delivered_orders += 1;
      if (order.status === "cancelled" || order.status === "rejected")
        perfMap[rid].cancelled_orders += 1;
    }

    const restaurantPerformance = Object.values(perfMap).sort(
      (a, b) => b.total_sales - a.total_sales,
    );

    // Top 10 for chart
    const topByOrders = [...restaurantPerformance]
      .sort((a, b) => b.total_orders - a.total_orders)
      .slice(0, 10);
    const topByCommission = [...restaurantPerformance]
      .sort((a, b) => b.commission_earned - a.commission_earned)
      .slice(0, 10);

    // Overall stats
    const totalCommission = allOrders.reduce(
      (s, o) => s + parseFloat(o.commission_total || 0),
      0,
    );
    const totalPayout = allOrders.reduce(
      (s, o) => s + parseFloat(o.admin_subtotal || 0),
      0,
    );
    const activeRestaurants = restaurantPerformance.filter(
      (r) => r.total_orders > 0,
    ).length;

    // Daily trend of restaurant orders
    const groupBy = period === "daily" ? "hour" : "day";
    const trendMap = {};
    for (const order of allOrders) {
      const key = formatDateKey(order.placed_at, groupBy);
      if (!trendMap[key])
        trendMap[key] = { date: key, orders: 0, commission: 0 };
      trendMap[key].orders += 1;
      trendMap[key].commission += parseFloat(order.commission_total || 0);
    }
    const trend = Object.values(trendMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return res.json({
      summary: {
        total_restaurants: allRestaurants.length,
        active_restaurants: activeRestaurants,
        total_commission: parseFloat(totalCommission.toFixed(2)),
        total_payout: parseFloat(totalPayout.toFixed(2)),
        avg_orders_per_restaurant:
          activeRestaurants > 0
            ? parseFloat((allOrders.length / activeRestaurants).toFixed(1))
            : 0,
      },
      status_counts: statusCounts,
      restaurant_performance: restaurantPerformance,
      top_by_orders: topByOrders,
      top_by_commission: topByCommission,
      trend,
      period,
    });
  } catch (e) {
    console.error("/manager/reports/restaurants error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/reports/financial
 * Financial breakdown analytics
 */
router.get("/financial", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { period = "monthly" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Fetch orders
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id, subtotal, admin_subtotal, commission_total, delivery_fee, service_fee, total_amount, status, placed_at, payment_method",
      )
      .gte("placed_at", startDate.toISOString())
      .lte("placed_at", endDate.toISOString());

    // Fetch deliveries for driver earnings
    const orderIds = (orders || []).map((o) => o.id);
    let deliveriesMap = {};
    if (orderIds.length > 0) {
      const { data: deliveries } = await supabaseAdmin
        .from("deliveries")
        .select("order_id, driver_earnings, tip_amount, status")
        .in("order_id", orderIds)
        .eq("status", "delivered");

      for (const d of deliveries || []) {
        deliveriesMap[d.order_id] = {
          driver_earnings: parseFloat(d.driver_earnings || 0),
          tip: parseFloat(d.tip_amount || 0),
        };
      }
    }

    // Fetch driver deposits
    const { data: deposits } = await supabaseAdmin
      .from("driver_deposits")
      .select("id, amount, status, created_at")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    // Fetch driver payments
    const { data: driverPayments } = await supabaseAdmin
      .from("driver_payments")
      .select("id, amount, status, created_at")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    const allOrders = orders || [];

    // Revenue breakdown
    let totalRevenue = 0;
    let totalCommission = 0;
    let totalServiceFees = 0;
    let totalDeliveryFees = 0;
    let totalRestaurantPayout = 0;
    let totalDriverEarnings = 0;
    let totalTips = 0;
    let cashCollected = 0;
    let onlineCollected = 0;

    for (const order of allOrders) {
      const total = parseFloat(order.total_amount || 0);
      totalRevenue += total;
      totalCommission += parseFloat(order.commission_total || 0);
      totalServiceFees += parseFloat(order.service_fee || 0);
      totalDeliveryFees += parseFloat(order.delivery_fee || 0);
      totalRestaurantPayout += parseFloat(order.admin_subtotal || 0);
      if (deliveriesMap[order.id]) {
        totalDriverEarnings += deliveriesMap[order.id].driver_earnings;
        totalTips += deliveriesMap[order.id].tip;
      }
      if (order.payment_method === "cash") cashCollected += total;
      else onlineCollected += total;
    }

    const managerEarnings =
      totalRevenue - totalRestaurantPayout - totalDriverEarnings;

    // Revenue breakdown for pie chart
    const revenueBreakdown = [
      { name: "Commission", value: parseFloat(totalCommission.toFixed(2)) },
      {
        name: "Service Fees",
        value: parseFloat(totalServiceFees.toFixed(2)),
      },
      {
        name: "Delivery Fees",
        value: parseFloat(totalDeliveryFees.toFixed(2)),
      },
    ];

    // Expense breakdown for pie chart
    const expenseBreakdown = [
      {
        name: "Restaurant Payouts",
        value: parseFloat(totalRestaurantPayout.toFixed(2)),
      },
      {
        name: "Driver Earnings",
        value: parseFloat(totalDriverEarnings.toFixed(2)),
      },
      { name: "Tips", value: parseFloat(totalTips.toFixed(2)) },
    ];

    // Daily trend
    const groupBy = period === "daily" ? "hour" : "day";
    const trendMap = {};
    for (const order of allOrders) {
      const key = formatDateKey(order.placed_at, groupBy);
      if (!trendMap[key]) {
        trendMap[key] = {
          date: key,
          revenue: 0,
          commission: 0,
          service_fee: 0,
          delivery_fee: 0,
          restaurant_payout: 0,
          driver_earnings: 0,
          profit: 0,
        };
      }
      const t = trendMap[key];
      t.revenue += parseFloat(order.total_amount || 0);
      t.commission += parseFloat(order.commission_total || 0);
      t.service_fee += parseFloat(order.service_fee || 0);
      t.delivery_fee += parseFloat(order.delivery_fee || 0);
      t.restaurant_payout += parseFloat(order.admin_subtotal || 0);
      const de = deliveriesMap[order.id]?.driver_earnings || 0;
      t.driver_earnings += de;
      t.profit +=
        parseFloat(order.total_amount || 0) -
        parseFloat(order.admin_subtotal || 0) -
        de;
    }
    const trend = Object.values(trendMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Deposits summary
    const approvedDeposits = (deposits || []).filter(
      (d) => d.status === "approved",
    );
    const totalDeposited = approvedDeposits.reduce(
      (s, d) => s + parseFloat(d.amount || 0),
      0,
    );

    // Payments summary
    const completedPayments = (driverPayments || []).filter(
      (p) => p.status === "completed" || p.status === "approved",
    );
    const totalPaid = completedPayments.reduce(
      (s, p) => s + parseFloat(p.amount || 0),
      0,
    );

    return res.json({
      summary: {
        total_revenue: parseFloat(totalRevenue.toFixed(2)),
        total_commission: parseFloat(totalCommission.toFixed(2)),
        total_service_fees: parseFloat(totalServiceFees.toFixed(2)),
        total_delivery_fees: parseFloat(totalDeliveryFees.toFixed(2)),
        total_restaurant_payout: parseFloat(totalRestaurantPayout.toFixed(2)),
        total_driver_earnings: parseFloat(totalDriverEarnings.toFixed(2)),
        total_tips: parseFloat(totalTips.toFixed(2)),
        manager_earnings: parseFloat(managerEarnings.toFixed(2)),
        cash_collected: parseFloat(cashCollected.toFixed(2)),
        online_collected: parseFloat(onlineCollected.toFixed(2)),
        total_deposited: parseFloat(totalDeposited.toFixed(2)),
        total_paid_to_drivers: parseFloat(totalPaid.toFixed(2)),
      },
      revenue_breakdown: revenueBreakdown,
      expense_breakdown: expenseBreakdown,
      trend,
      period,
    });
  } catch (e) {
    console.error("/manager/reports/financial error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/reports/customers
 * Customer behavior analytics
 */
router.get("/customers", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { period = "monthly" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Fetch customers
    const { data: customers } = await supabaseAdmin
      .from("customers")
      .select("id, username, email, city, created_at");

    // Fetch orders in period
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, customer_name, total_amount, status, placed_at, payment_method, restaurant_name",
      )
      .gte("placed_at", startDate.toISOString())
      .lte("placed_at", endDate.toISOString())
      .order("placed_at", { ascending: true });

    const allCustomers = customers || [];
    const allOrders = orders || [];

    // New customers in period
    const newCustomers = allCustomers.filter((c) => {
      const created = new Date(c.created_at);
      return created >= startDate && created <= endDate;
    });

    // Customer registration trend
    const groupBy = period === "daily" ? "hour" : "day";
    const regTrendMap = {};
    for (const c of newCustomers) {
      const key = formatDateKey(c.created_at, groupBy);
      if (!regTrendMap[key]) regTrendMap[key] = { date: key, registrations: 0 };
      regTrendMap[key].registrations += 1;
    }

    // Order trend
    const orderTrendMap = {};
    for (const o of allOrders) {
      const key = formatDateKey(o.placed_at, groupBy);
      if (!orderTrendMap[key])
        orderTrendMap[key] = { date: key, orders: 0, revenue: 0 };
      orderTrendMap[key].orders += 1;
      orderTrendMap[key].revenue += parseFloat(o.total_amount || 0);
    }

    // Merge trends
    const allDates = new Set([
      ...Object.keys(regTrendMap),
      ...Object.keys(orderTrendMap),
    ]);
    const trend = [...allDates].sort().map((date) => ({
      date,
      registrations: regTrendMap[date]?.registrations || 0,
      orders: orderTrendMap[date]?.orders || 0,
      revenue: parseFloat((orderTrendMap[date]?.revenue || 0).toFixed(2)),
    }));

    // Customer order frequency
    const customerOrderMap = {};
    for (const o of allOrders) {
      if (!o.customer_id) continue;
      if (!customerOrderMap[o.customer_id]) {
        customerOrderMap[o.customer_id] = {
          id: o.customer_id,
          name: o.customer_name || "Unknown",
          orders: 0,
          total_spent: 0,
        };
      }
      customerOrderMap[o.customer_id].orders += 1;
      customerOrderMap[o.customer_id].total_spent += parseFloat(
        o.total_amount || 0,
      );
    }

    const customerList = Object.values(customerOrderMap);
    const repeatCustomers = customerList.filter((c) => c.orders > 1);

    // Top customers
    const topCustomers = [...customerList]
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10)
      .map((c) => ({
        ...c,
        avg_order: parseFloat((c.total_spent / c.orders).toFixed(2)),
      }));

    // Order frequency distribution
    const frequencyDist = {
      "1 order": 0,
      "2-3 orders": 0,
      "4-5 orders": 0,
      "6-10 orders": 0,
      "10+ orders": 0,
    };
    for (const c of customerList) {
      if (c.orders === 1) frequencyDist["1 order"]++;
      else if (c.orders <= 3) frequencyDist["2-3 orders"]++;
      else if (c.orders <= 5) frequencyDist["4-5 orders"]++;
      else if (c.orders <= 10) frequencyDist["6-10 orders"]++;
      else frequencyDist["10+ orders"]++;
    }

    // City distribution
    const cityMap = {};
    for (const c of allCustomers) {
      const city = c.city || "Unknown";
      cityMap[city] = (cityMap[city] || 0) + 1;
    }
    const cityBreakdown = Object.entries(cityMap)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Favorite restaurants (most ordered)
    const restOrderMap = {};
    for (const o of allOrders) {
      const name = o.restaurant_name || "Unknown";
      if (!restOrderMap[name]) restOrderMap[name] = { name, orders: 0 };
      restOrderMap[name].orders += 1;
    }
    const favoriteRestaurants = Object.values(restOrderMap)
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10);

    return res.json({
      summary: {
        total_customers: allCustomers.length,
        new_customers: newCustomers.length,
        active_customers: customerList.length,
        repeat_customers: repeatCustomers.length,
        repeat_rate:
          customerList.length > 0
            ? parseFloat(
                ((repeatCustomers.length / customerList.length) * 100).toFixed(
                  1,
                ),
              )
            : 0,
        avg_orders_per_customer:
          customerList.length > 0
            ? parseFloat((allOrders.length / customerList.length).toFixed(1))
            : 0,
        avg_spending:
          customerList.length > 0
            ? parseFloat(
                (
                  customerList.reduce((s, c) => s + c.total_spent, 0) /
                  customerList.length
                ).toFixed(2),
              )
            : 0,
      },
      trend,
      top_customers: topCustomers,
      frequency_distribution: Object.entries(frequencyDist).map(
        ([range, count]) => ({ range, count }),
      ),
      city_breakdown: cityBreakdown,
      favorite_restaurants: favoriteRestaurants,
      period,
    });
  } catch (e) {
    console.error("/manager/reports/customers error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /manager/reports/analytics
 * Time-based analytics (peak hours, daily patterns)
 */
router.get("/analytics", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { period = "monthly" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Fetch all orders in period
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id, total_amount, status, placed_at, restaurant_name, payment_method",
      )
      .gte("placed_at", startDate.toISOString())
      .lte("placed_at", endDate.toISOString());

    const allOrders = orders || [];

    // Hourly distribution (0-23)
    const hourlyMap = {};
    for (let h = 0; h < 24; h++) {
      hourlyMap[h] = { hour: h, orders: 0, revenue: 0, label: "" };
      // Create readable label
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      hourlyMap[h].label = `${h12}${ampm}`;
    }

    for (const o of allOrders) {
      const h = new Date(o.placed_at).getHours();
      hourlyMap[h].orders += 1;
      hourlyMap[h].revenue += parseFloat(o.total_amount || 0);
    }
    const hourlyData = Object.values(hourlyMap);

    // Find peak hours (top 3)
    const peakHours = [...hourlyData]
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 3)
      .map((h) => ({ hour: h.hour, label: h.label, orders: h.orders }));

    // Weekday distribution
    const weekdayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const weekdayMap = {};
    for (let d = 0; d < 7; d++) {
      weekdayMap[d] = {
        day: d,
        name: weekdayNames[d],
        short: weekdayNames[d].slice(0, 3),
        orders: 0,
        revenue: 0,
      };
    }

    for (const o of allOrders) {
      const d = new Date(o.placed_at).getDay();
      weekdayMap[d].orders += 1;
      weekdayMap[d].revenue += parseFloat(o.total_amount || 0);
    }
    const weekdayData = Object.values(weekdayMap);

    // Find busiest day
    const busiestDay = [...weekdayData].sort((a, b) => b.orders - a.orders)[0];

    // Heatmap data (hour x day)
    const heatmapData = [];
    for (const o of allOrders) {
      const d = new Date(o.placed_at);
      const hour = d.getHours();
      const day = d.getDay();
      heatmapData.push({ hour, day });
    }
    // Aggregate heatmap
    const heatmap = {};
    for (const point of heatmapData) {
      const key = `${point.day}-${point.hour}`;
      heatmap[key] = (heatmap[key] || 0) + 1;
    }
    const heatmapArray = Object.entries(heatmap).map(([key, count]) => {
      const [day, hour] = key.split("-").map(Number);
      return { day, dayName: weekdayNames[day].slice(0, 3), hour, count };
    });

    // Meal time distribution
    const mealTimes = {
      breakfast: {
        name: "Breakfast",
        range: "6AM-11AM",
        orders: 0,
        revenue: 0,
      },
      lunch: { name: "Lunch", range: "11AM-3PM", orders: 0, revenue: 0 },
      afternoon: { name: "Afternoon", range: "3PM-6PM", orders: 0, revenue: 0 },
      dinner: { name: "Dinner", range: "6PM-10PM", orders: 0, revenue: 0 },
      latenight: {
        name: "Late Night",
        range: "10PM-6AM",
        orders: 0,
        revenue: 0,
      },
    };

    for (const o of allOrders) {
      const h = new Date(o.placed_at).getHours();
      const rev = parseFloat(o.total_amount || 0);
      if (h >= 6 && h < 11) {
        mealTimes.breakfast.orders++;
        mealTimes.breakfast.revenue += rev;
      } else if (h >= 11 && h < 15) {
        mealTimes.lunch.orders++;
        mealTimes.lunch.revenue += rev;
      } else if (h >= 15 && h < 18) {
        mealTimes.afternoon.orders++;
        mealTimes.afternoon.revenue += rev;
      } else if (h >= 18 && h < 22) {
        mealTimes.dinner.orders++;
        mealTimes.dinner.revenue += rev;
      } else {
        mealTimes.latenight.orders++;
        mealTimes.latenight.revenue += rev;
      }
    }

    // Monthly trend (for longer periods)
    const monthlyMap = {};
    for (const o of allOrders) {
      const key = formatDateKey(o.placed_at, "month");
      if (!monthlyMap[key])
        monthlyMap[key] = { date: key, orders: 0, revenue: 0 };
      monthlyMap[key].orders += 1;
      monthlyMap[key].revenue += parseFloat(o.total_amount || 0);
    }
    const monthlyTrend = Object.values(monthlyMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return res.json({
      summary: {
        total_orders: allOrders.length,
        peak_hour: peakHours[0] || null,
        busiest_day: busiestDay || null,
        avg_orders_per_day:
          allOrders.length > 0
            ? parseFloat(
                (
                  allOrders.length /
                  Math.max(
                    1,
                    Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)),
                  )
                ).toFixed(1),
              )
            : 0,
      },
      hourly_data: hourlyData,
      weekday_data: weekdayData,
      peak_hours: peakHours,
      meal_times: Object.values(mealTimes),
      heatmap: heatmapArray,
      monthly_trend: monthlyTrend,
      period,
    });
  } catch (e) {
    console.error("/manager/reports/analytics error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
