/**
 * Push Notification Service using Expo Push Notifications + Supabase
 *
 * This service handles sending push notifications to mobile devices
 * using Expo's free push notification service instead of Firebase.
 *
 * Benefits:
 * - No Firebase setup required
 * - Free unlimited push notifications
 * - Works with both Android and iOS
 * - Simple integration with React Native/Expo
 * - Integrates directly with Supabase
 */

import { supabaseAdmin } from "../supabaseAdmin.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Send push notification via Expo Push API
 * @param {string[]} expoPushTokens - Array of Expo push tokens
 * @param {object} notification - Notification content
 * @returns {Promise<object>}
 */
async function sendExpoPushNotification(expoPushTokens, notification) {
  if (!expoPushTokens || expoPushTokens.length === 0) {
    console.log("No Expo push tokens provided");
    return { success: false, error: "No tokens" };
  }

  // Filter valid Expo tokens
  const validTokens = expoPushTokens.filter(
    (token) =>
      token &&
      (token.startsWith("ExponentPushToken[") ||
        token.startsWith("ExpoPushToken[")),
  );

  if (validTokens.length === 0) {
    console.log("No valid Expo push tokens");
    return { success: false, error: "No valid tokens" };
  }

  // Build messages for each token
  const messages = validTokens.map((token) => ({
    to: token,
    sound: notification.sound || "default",
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    priority: "high",
    // ttl: keep trying to deliver for 24 hours (covers locked screen / offline device)
    ttl: 86400,
    // expiration: Unix timestamp 24 h from now (belt-and-suspenders for some clients)
    expiration: Math.floor(Date.now() / 1000) + 86400,
    channelId:
      notification.channelId || notification.data?.channelId || "default",
    // sticky = true keeps the notification until user interacts (for Android)
    ...(notification.sticky ? { sticky: true } : {}),
    // categoryIdentifier for actionable notifications
    ...(notification.categoryIdentifier
      ? { categoryIdentifier: notification.categoryIdentifier }
      : {}),
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log("Expo Push Response:", JSON.stringify(result, null, 2));

    // Check for errors in the response
    if (result.data) {
      const errors = result.data.filter((r) => r.status === "error");
      if (errors.length > 0) {
        console.warn("Some notifications failed:", errors);

        // Handle invalid tokens
        for (const error of errors) {
          if (error.details?.error === "DeviceNotRegistered") {
            // Deactivate invalid token
            const invalidToken = messages[result.data.indexOf(error)]?.to;
            if (invalidToken) {
              await deactivateToken(invalidToken);
            }
          }
        }
      }
    }

    return { success: true, result };
  } catch (error) {
    console.error("Expo Push Error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Deactivate an invalid token
 */
async function deactivateToken(expoPushToken) {
  try {
    await supabaseAdmin
      .from("push_notification_tokens")
      .update({ is_active: false })
      .eq("expo_push_token", expoPushToken);
    console.log("Deactivated invalid token:", expoPushToken);
  } catch (error) {
    console.error("Error deactivating token:", error);
  }
}

/**
 * Register a push token for a user
 * @param {string} userId - User's ID
 * @param {string} userType - User type (admin, driver, customer, manager)
 * @param {string} expoPushToken - Expo push token
 * @param {string} deviceType - Device type (android, ios)
 * @param {string} deviceId - Unique device identifier
 */
export async function registerPushToken(
  userId,
  userType,
  expoPushToken,
  deviceType,
  deviceId,
) {
  try {
    // Validate expo token format
    if (
      !expoPushToken.startsWith("ExponentPushToken[") &&
      !expoPushToken.startsWith("ExpoPushToken[")
    ) {
      console.warn("Invalid Expo push token format:", expoPushToken);
      return {
        success: false,
        error: "Invalid token format. Expected ExponentPushToken[xxx] format.",
      };
    }

    const { data, error } = await supabaseAdmin
      .from("push_notification_tokens")
      .upsert(
        {
          user_id: userId,
          user_type: userType,
          expo_push_token: expoPushToken,
          device_type: deviceType,
          device_id: deviceId,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,device_id",
        },
      )
      .select();

    if (error) {
      console.error("Error registering push token:", error);
      return { success: false, error };
    }

    console.log(`✅ Push token registered for ${userType} ${userId}`);
    return { success: true, data };
  } catch (error) {
    console.error("Register push token error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a push token (on logout)
 * @param {string} userId - User's ID
 * @param {string} deviceId - Device identifier
 */
export async function removePushToken(userId, deviceId) {
  try {
    const { error } = await supabaseAdmin
      .from("push_notification_tokens")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("device_id", deviceId);

    if (error) {
      console.error("Error removing push token:", error);
      return { success: false, error };
    }

    console.log(`Push token deactivated for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error("Remove push token error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to a specific user
 * @param {string} userId - Target user ID
 * @param {object} notification - { title, body, data }
 */
export async function sendPushNotification(userId, notification) {
  try {
    console.log("📤 sendPushNotification called for user:", userId);

    // Get user's active push tokens
    const { data: tokens, error } = await supabaseAdmin
      .from("push_notification_tokens")
      .select("expo_push_token, user_type")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      console.error("❌ Error fetching push tokens:", error);
      await logNotification(userId, "unknown", notification, {
        success: false,
        error: "DB error fetching tokens",
      });
      return { success: false, error };
    }

    if (!tokens || tokens.length === 0) {
      console.log(`❌ No active push tokens for user ${userId}`);
      await logNotification(userId, "unknown", notification, {
        success: false,
        error: "No tokens found",
      });
      return { success: false, error: "No tokens found" };
    }

    console.log(`✅ Found ${tokens.length} token(s) for user ${userId}`);

    const expoPushTokens = tokens.map((t) => t.expo_push_token);
    console.log("📨 Sending via Expo Push API:", {
      tokenCount: expoPushTokens.length,
      title: notification.title,
    });

    const result = await sendExpoPushNotification(expoPushTokens, notification);
    console.log("📥 Expo API result:", result);

    // Log the notification
    console.log("📝 Logging notification...");
    await logNotification(
      userId,
      tokens[0]?.user_type || "unknown",
      notification,
      result,
    );

    return result;
  } catch (error) {
    console.error("❌ Send push notification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification when restaurant is approved or rejected
 * @param {string} adminUserId - The admin (restaurant owner) user ID
 * @param {string} restaurantName - Restaurant name
 * @param {boolean} isApproved - true = approved, false = rejected
 */
export async function sendAdminApprovalNotification(
  adminUserId,
  restaurantName,
  isApproved = true,
) {
  try {
    const notification = isApproved
      ? {
          title: "🎉 Restaurant Approved!",
          body: `Congratulations! ${restaurantName} has been approved. You can now start receiving orders.`,
          data: {
            type: "restaurant_approval",
            restaurantName,
            approved: "true",
            screen: "Login",
          },
        }
      : {
          title: "❌ Restaurant Not Approved",
          body: `${restaurantName} was not approved. Please check your email for details.`,
          data: {
            type: "restaurant_rejection",
            restaurantName,
            approved: "false",
            screen: "Login",
          },
        };

    return await sendPushNotification(adminUserId, notification);
  } catch (error) {
    console.error("Send admin approval notification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification when driver is approved or rejected
 * @param {string} driverId - Driver user ID
 * @param {string} driverName - Driver name
 * @param {boolean} isApproved - true = approved, false = rejected
 */
export async function sendDriverApprovalNotification(
  driverId,
  driverName,
  isApproved = true,
) {
  try {
    const notification = isApproved
      ? {
          title: "🎉 Application Approved!",
          body: `Congratulations ${driverName}! Your driver application has been approved. You can now start accepting deliveries.`,
          data: {
            type: "driver_approval",
            driverId,
            driverName,
            approved: "true",
            screen: "Login",
          },
        }
      : {
          title: "❌ Application Not Approved",
          body: `Sorry ${driverName}, your driver application was not approved. Please check your email for details.`,
          data: {
            type: "driver_rejection",
            driverId,
            driverName,
            approved: "false",
            screen: "Login",
          },
        };

    return await sendPushNotification(driverId, notification);
  } catch (error) {
    console.error("Send driver approval notification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to all users of a specific type
 * @param {string} userType - User type (admin, driver, customer)
 * @param {object} notification - { title, body, data }
 */
export async function sendBroadcastNotification(userType, notification) {
  try {
    const { data: tokens, error } = await supabaseAdmin
      .from("push_notification_tokens")
      .select("expo_push_token, user_id")
      .eq("user_type", userType)
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching tokens for broadcast:", error);
      return { success: false, error };
    }

    if (!tokens || tokens.length === 0) {
      console.log(`No active tokens for user type: ${userType}`);
      return { success: false, error: "No tokens found" };
    }

    const expoPushTokens = tokens.map((t) => t.expo_push_token);

    // Expo allows max 100 tokens per request, so batch them
    const batchSize = 100;
    const results = [];

    for (let i = 0; i < expoPushTokens.length; i += batchSize) {
      const batch = expoPushTokens.slice(i, i + batchSize);
      const result = await sendExpoPushNotification(batch, notification);
      results.push(result);
    }

    return { success: true, batches: results.length, results };
  } catch (error) {
    console.error("Broadcast notification error:", error);
    return { success: false, error: error.message };
  }
}

// ─── ORDER & DELIVERY PUSH NOTIFICATIONS ─────────────────────

/**
 * Notify restaurant admin(s) about a new order
 * Called when customer places an order
 * @param {string} restaurantId - Restaurant ID
 * @param {object} orderInfo - { orderId, orderNumber, customerName, itemsCount, totalAmount, itemsSummary }
 */
export async function sendNewOrderNotification(
  restaurantId,
  orderInfo,
  adminIds = null,
) {
  try {
    console.log(
      "📱 sendNewOrderNotification called for restaurant:",
      restaurantId,
      "adminIds:",
      adminIds,
    );

    // Use provided admin IDs (from orders.js), or fall back to DB lookup
    let resolvedAdminIds = adminIds;
    if (!resolvedAdminIds || resolvedAdminIds.length === 0) {
      console.log("🔍 No adminIds passed, looking up from admins table...");
      const { data: admins, error } = await supabaseAdmin
        .from("admins")
        .select("id")
        .eq("restaurant_id", restaurantId);

      console.log("🔍 Found admins from admins table:", {
        admins,
        error,
        restaurantId,
      });

      if (error || !admins || admins.length === 0) {
        console.log(
          `❌ No admins found for restaurant ${restaurantId}:`,
          error,
        );
        return { success: false, error: "No admins found" };
      }
      resolvedAdminIds = admins.map((a) => a.id);
    }

    console.log("✅ Resolved admin IDs:", resolvedAdminIds);

    // Build concise notification body - just show item count, NOT the full list
    // (The modal will display the structured itemsSummary separately)
    const itemsText = orderInfo.itemsCount
      ? `${orderInfo.itemsCount} item(s)`
      : "New order";

    const notification = {
      title: "🔔 New Order Received!",
      body: `Order #${orderInfo.orderNumber} · Rs. ${Number(orderInfo.restaurantAmount ?? orderInfo.totalAmount).toFixed(2)} · ${itemsText}`,
      sound: "default",
      channelId: "urgent_orders",
      sticky: true,
      data: {
        type: "new_order",
        persistent: "true",
        orderId: String(orderInfo.orderId),
        orderNumber: orderInfo.orderNumber,
        restaurantId: String(restaurantId),
        itemsSummary: orderInfo.itemsSummary || "",
        itemsCount: String(orderInfo.itemsCount || 0),
        screen: "AdminOrders",
        channelId: "urgent_orders",
      },
    };

    console.log(
      "📤 Sending push notifications to",
      resolvedAdminIds.length,
      "admin(s)",
    );

    const results = [];
    for (const adminId of resolvedAdminIds) {
      console.log("→ Sending push to admin id:", adminId);
      const result = await sendPushNotification(adminId, notification);
      console.log("→ Push result for", adminId, ":", JSON.stringify(result));
      results.push(result);
    }

    console.log(
      `✅ Push: New order notification sent to ${resolvedAdminIds.length} admin(s)`,
    );
    return { success: true, results };
  } catch (error) {
    console.error("❌ sendNewOrderNotification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify customer about order status change
 * Called when admin changes order status (accepted, preparing, ready, rejected, cancelled)
 * @param {string} customerId - Customer user ID
 * @param {object} orderInfo - { orderId, orderNumber, status, restaurantName }
 */
export async function sendOrderStatusNotification(customerId, orderInfo) {
  try {
    const customRejectedBody = orderInfo.customMessage
      ? String(orderInfo.customMessage)
      : null;

    const statusConfig = {
      accepted: {
        title: "✅ Order Accepted!",
        body: `Your order #${orderInfo.orderNumber} has been accepted and is being prepared.`,
      },
      preparing: {
        title: "👨‍🍳 Order Being Prepared",
        body: `Your order #${orderInfo.orderNumber} is being prepared right now!`,
      },
      ready: {
        title: "🍽️ Order Ready!",
        body: `Your order #${orderInfo.orderNumber} is ready and waiting for pickup!`,
      },
      rejected: {
        title: "❌ Order Rejected",
        body:
          customRejectedBody ||
          `Sorry, your order #${orderInfo.orderNumber} was rejected by the restaurant.`,
      },
      cancelled: {
        title: "🚫 Order Cancelled",
        body: `Your order #${orderInfo.orderNumber} has been cancelled.`,
      },
    };

    const config = statusConfig[orderInfo.status];
    if (!config)
      return { success: false, error: `Unknown status: ${orderInfo.status}` };

    const notification = {
      title: config.title,
      body: config.body,
      data: {
        type: "order_update",
        orderId: String(orderInfo.orderId),
        orderNumber: orderInfo.orderNumber,
        status: orderInfo.status,
        screen: "OrderTracking",
        channelId: "orders",
      },
    };

    return await sendPushNotification(customerId, notification);
  } catch (error) {
    console.error("sendOrderStatusNotification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify all active drivers about a new delivery available
 * Called when admin accepts an order
 * @param {object} deliveryInfo - { deliveryId, orderNumber, restaurantName, totalAmount, tipAmount }
 */
export async function sendNewDeliveryNotificationToDrivers(deliveryInfo) {
  try {
    const tipAmount = parseFloat(deliveryInfo.tipAmount || 0);
    let body = `Order #${deliveryInfo.orderNumber} from ${deliveryInfo.restaurantName}`;
    if (tipAmount > 0) {
      body += `\n💰 Tip included: Rs. ${tipAmount.toFixed(0)}`;
    }
    body += `\nCheck available deliveries for earnings details.`;

    return await sendBroadcastNotification("driver", {
      title: "🚗 New Delivery Available!",
      body,
      sound: "default",
      channelId: "urgent_orders",
      sticky: true,
      data: {
        type: "new_delivery",
        persistent: "true",
        deliveryId: String(deliveryInfo.deliveryId),
        orderNumber: deliveryInfo.orderNumber,
        tipAmount: tipAmount > 0 ? String(tipAmount) : undefined,
        screen: "AvailableDeliveries",
        channelId: "urgent_orders",
      },
    });
  } catch (error) {
    console.error("sendNewDeliveryNotificationToDrivers error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify customer when driver accepts their delivery
 * @param {string} customerId - Customer user ID
 * @param {object} info - { orderNumber, driverName }
 */
export async function sendDriverAssignedNotification(customerId, info) {
  try {
    return await sendPushNotification(customerId, {
      title: "🚗 Driver Assigned!",
      body: `${info.driverName} has accepted your order #${info.orderNumber} and is heading to the restaurant.`,
      data: {
        type: "driver_assigned",
        orderNumber: info.orderNumber,
        screen: "OrderTracking",
        channelId: "orders",
      },
    });
  } catch (error) {
    console.error("sendDriverAssignedNotification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify customer about delivery status changes
 * Called when driver updates status (picked_up, on_the_way, at_customer, delivered)
 * @param {string} customerId - Customer user ID
 * @param {object} info - { orderId, orderNumber, status, driverName }
 */
export async function sendDeliveryStatusNotification(customerId, info) {
  try {
    const statusConfig = {
      picked_up: {
        title: "📦 Order Picked Up!",
        body: `${info.driverName || "Your driver"} has picked up your order #${info.orderNumber} from the restaurant.`,
      },
      on_the_way: {
        title: "🏍️ Driver On The Way!",
        body: `${info.driverName || "Your driver"} is on the way with your order #${info.orderNumber}!`,
      },
      at_customer: {
        title: "📍 Driver Has Arrived!",
        body: `${info.driverName || "Your driver"} has arrived with your order #${info.orderNumber}. Please collect your food!`,
      },
      delivered: {
        title: "✅ Order Delivered!",
        body: `Your order #${info.orderNumber} has been delivered. Enjoy your meal! 🎉`,
      },
    };

    const config = statusConfig[info.status];
    if (!config)
      return { success: false, error: `Unknown status: ${info.status}` };

    return await sendPushNotification(customerId, {
      title: config.title,
      body: config.body,
      data: {
        type: "delivery_status_update",
        orderId: String(info.orderId),
        orderNumber: info.orderNumber,
        status: info.status,
        screen: "OrderTracking",
        channelId: "orders",
      },
    });
  } catch (error) {
    console.error("sendDeliveryStatusNotification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify restaurant admin about delivery status changes
 * @param {string} restaurantId - Restaurant ID
 * @param {object} info - { orderNumber, status, driverName }
 */
export async function sendDeliveryStatusToAdmin(restaurantId, info) {
  try {
    // Query admins table (same pattern as orders.js) instead of restaurants table
    const { data: admins, error } = await supabaseAdmin
      .from("admins")
      .select("id")
      .eq("restaurant_id", restaurantId);

    if (error || !admins || admins.length === 0) return { success: false };

    const statusMessages = {
      picked_up: `Driver ${info.driverName || ""} picked up order #${info.orderNumber}`,
      on_the_way: `Driver is on the way to deliver order #${info.orderNumber}`,
      delivered: `Order #${info.orderNumber} has been delivered successfully`,
    };

    const msg = statusMessages[info.status];
    if (!msg) return { success: false };

    for (const admin of admins) {
      await sendPushNotification(admin.id, {
        title: "📋 Delivery Update",
        body: msg,
        data: {
          type: "delivery_status_update",
          orderNumber: info.orderNumber,
          status: info.status,
          channelId: "orders",
        },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("sendDeliveryStatusToAdmin error:", error);
    return { success: false, error: error.message };
  }
}

// ─── NEW NOTIFICATION FUNCTIONS ──────────────────────────────

/**
 * Notify all drivers about a tipped delivery (persistent until accept/decline)
 * Called when manager adds a tip to a pending delivery
 * @param {object} deliveryInfo - { deliveryId, orderNumber, restaurantName, totalAmount, tipAmount, bonusAmount }
 */
export async function sendTipDeliveryNotificationToDrivers(deliveryInfo) {
  try {
    console.log("💰 sendTipDeliveryNotificationToDrivers:", deliveryInfo);
    const tipAmount = parseFloat(deliveryInfo.tipAmount || 0);
    const bonusAmount = parseFloat(deliveryInfo.bonusAmount || 0);

    let body = `Order #${deliveryInfo.orderNumber} from ${deliveryInfo.restaurantName}`;
    if (bonusAmount > 0) {
      body += `\n🎁 Bonus: Rs. ${bonusAmount.toFixed(0)}`;
    }
    if (tipAmount > 0) {
      body += `\n💰 Tip: Rs. ${tipAmount.toFixed(0)}`;
    }
    body += `\nCheck available deliveries for full earnings breakdown.`;

    return await sendBroadcastNotification("driver", {
      title: "💰 Tipped Delivery Available!",
      body,
      sound: "default",
      channelId: "urgent_orders",
      sticky: true,
      data: {
        type: "new_delivery",
        persistent: "true",
        deliveryId: String(deliveryInfo.deliveryId),
        orderNumber: deliveryInfo.orderNumber,
        tipAmount: String(tipAmount),
        bonusAmount: bonusAmount > 0 ? String(bonusAmount) : undefined,
        screen: "AvailableDeliveries",
        channelId: "urgent_orders",
      },
    });
  } catch (error) {
    console.error("sendTipDeliveryNotificationToDrivers error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify a specific driver about a daily payment from manager
 * Called when manager pays a driver
 * @param {string} driverId - Driver user ID
 * @param {object} paymentInfo - { amount, driverName, note }
 */
export async function sendDriverPaymentNotification(driverId, paymentInfo) {
  try {
    console.log("💵 sendDriverPaymentNotification to driver:", driverId);
    return await sendPushNotification(driverId, {
      title: "💵 Payment Received!",
      body: `You received a payment of Rs. ${Number(paymentInfo.amount).toFixed(2)}${paymentInfo.note ? ` — ${paymentInfo.note}` : ""}`,
      sound: "default",
      channelId: "payments",
      data: {
        type: "payment_received",
        amount: String(paymentInfo.amount),
        screen: "DriverEarnings",
        channelId: "payments",
      },
    });
  } catch (error) {
    console.error("sendDriverPaymentNotification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Alert managers when a delivery has been unassigned for >10 minutes
 * Persistent alert with alarm sound that keeps ringing
 * @param {object} deliveryInfo - { deliveryId, orderNumber, restaurantName, waitingMinutes }
 */
export async function sendUnassignedDeliveryAlertToManagers(deliveryInfo) {
  try {
    console.log("🚨 sendUnassignedDeliveryAlertToManagers:", deliveryInfo);
    return await sendBroadcastNotification("manager", {
      title: "🚨 ALERT: Unassigned Delivery!",
      body: `Order #${deliveryInfo.orderNumber} from ${deliveryInfo.restaurantName} has no driver for ${deliveryInfo.waitingMinutes} minutes!`,
      sound: "default",
      channelId: "alerts",
      sticky: true,
      data: {
        type: "unassigned_delivery_alert",
        persistent: "true",
        deliveryId: String(deliveryInfo.deliveryId),
        orderNumber: deliveryInfo.orderNumber,
        waitingMinutes: String(deliveryInfo.waitingMinutes),
        screen: "ManagerPendingDeliveries",
        channelId: "alerts",
      },
    });
  } catch (error) {
    console.error("sendUnassignedDeliveryAlertToManagers error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send milestone achievement notification
 * Works for admin, driver, and manager
 * @param {string} userId - User ID
 * @param {string} userType - 'admin' | 'driver' | 'manager'
 * @param {object} milestoneInfo - { milestone, todayCount, todayRevenue, message }
 */
export async function sendMilestoneNotification(
  userId,
  userType,
  milestoneInfo,
) {
  try {
    console.log(
      `🎉 sendMilestoneNotification to ${userType} ${userId}:`,
      milestoneInfo,
    );

    const screenMap = {
      admin: "AdminOrders",
      driver: "DriverEarnings",
      manager: "ManagerDashboard",
    };

    return await sendPushNotification(userId, {
      title: `🏆 Milestone: ${milestoneInfo.milestone} Completed!`,
      body:
        milestoneInfo.message ||
        `Amazing! You've completed ${milestoneInfo.milestone} orders today!`,
      sound: "default",
      channelId: "milestones",
      data: {
        type: "milestone",
        milestone: String(milestoneInfo.milestone),
        todayCount: String(milestoneInfo.todayCount || milestoneInfo.milestone),
        todayRevenue: String(milestoneInfo.todayRevenue || 0),
        screen: screenMap[userType] || "Home",
        channelId: "milestones",
      },
    });
  } catch (error) {
    console.error("sendMilestoneNotification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Log notification to database
 */
async function logNotification(userId, userType, notification, result) {
  try {
    console.log("📝 Logging notification to notification_log table...", {
      user_id: userId,
      user_type: userType,
      status: result.success ? "sent" : "failed",
    });

    const { data, error } = await supabaseAdmin
      .from("notification_log")
      .insert({
        user_id: userId,
        user_type: userType,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        status: result.success ? "sent" : "failed",
        ticket_id: result.result?.data?.[0]?.id || null,
        error_message: result.error || null,
      })
      .select();

    if (error) {
      console.error("❌ Error inserting notification log:", error);
    } else {
      console.log("✅ Notification logged successfully:", data);
    }
  } catch (error) {
    console.error("❌ Error logging notification (catch):", error);
  }
}

/**
 * Test push notification service
 */
export async function testPushNotification(
  userId,
  title = "Test Notification",
  body = "Push notifications are working!",
) {
  return await sendPushNotification(userId, {
    title,
    body,
    data: { type: "test", timestamp: new Date().toISOString() },
  });
}

/**
 * Get push notification status (no Firebase setup required)
 */
export function getServiceStatus() {
  return {
    service: "Expo Push Notifications",
    status: "ready",
    message: "Using Expo Push API - no additional configuration needed!",
  };
}

export default {
  registerPushToken,
  removePushToken,
  sendPushNotification,
  sendAdminApprovalNotification,
  sendDriverApprovalNotification,
  sendBroadcastNotification,
  sendNewOrderNotification,
  sendOrderStatusNotification,
  sendNewDeliveryNotificationToDrivers,
  sendTipDeliveryNotificationToDrivers,
  sendDriverAssignedNotification,
  sendDeliveryStatusNotification,
  sendDeliveryStatusToAdmin,
  sendDriverPaymentNotification,
  sendUnassignedDeliveryAlertToManagers,
  sendMilestoneNotification,
  testPushNotification,
  getServiceStatus,
};
