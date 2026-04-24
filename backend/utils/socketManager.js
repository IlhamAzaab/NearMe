/**
 * Socket.io Manager for Real-time Notifications
 *
 * Purpose: Broadcast new deliveries to ALL online drivers SIMULTANEOUSLY
 * AND send real-time order status notifications to customers
 */

import { Server } from "socket.io";
import dotenv from "dotenv";
import { getValidatedAuthConfig, verifyJwtWithRotation } from "./authConfig.js";
import { getEligibleDriverIdsForDeliveryNotifications } from "./driverNotificationEligibility.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { calculateCustomerETA } from "./etaCalculator.js";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

getValidatedAuthConfig();

let io = null;

// Track connected drivers with their socket IDs
const connectedDrivers = new Map(); // driverId -> { socketId, connectedAt }

// Track connected customers with their socket IDs
const connectedCustomers = new Map(); // customerId -> { socketId, connectedAt }

// Track connected admins (restaurant admins) with their socket IDs
const connectedAdmins = new Map(); // adminId -> { socketId, connectedAt }

// Track connected managers with their socket IDs
const connectedManagers = new Map(); // managerId -> { socketId, connectedAt }
const driverLiveLocationCache = new Map(); // driverId -> { latitude, longitude, heading, speed, accuracy, timestamp }
const driverActiveDeliveriesCache = new Map(); // driverId -> { fetchedAt, deliveries }
const DRIVER_ACTIVE_DELIVERIES_CACHE_TTL_MS = 10000;
const driverStreamEtaCache = new Map(); // deliveryId -> { fetchedAt, payload }
const DRIVER_STREAM_ETA_CACHE_TTL_MS = 10000;

/**
 * Verify JWT token from socket auth
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded payload or null if invalid
 */
function verifySocketToken(token) {
  if (!token || token === "null" || token === "undefined") {
    return null;
  }
  try {
    const payload = verifyJwtWithRotation(token);
    return payload;
  } catch (err) {
    console.warn("[Socket] Token verification failed:", err.message);
    return null;
  }
}

/**
 * Initialize Socket.io server
 * @param {http.Server} server - HTTP server instance
 */
export function initializeSocket(server) {
  const socketAllowedOrigins = [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "https://meezo.lk",
    "https://www.meezo.lk",
  ];

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",").forEach((o) => {
      const trimmed = o.trim();
      if (trimmed) socketAllowedOrigins.push(trimmed);
    });
  }

  const normalizedSocketAllowedOrigins = socketAllowedOrigins.map((origin) =>
    String(origin || "")
      .trim()
      .replace(/\/$/, ""),
  );

  io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        const normalizedOrigin = String(origin || "")
          .trim()
          .replace(/\/$/, "");
        // Allow no-origin requests and Vercel deployments
        if (
          !origin ||
          normalizedSocketAllowedOrigins.includes(normalizedOrigin) ||
          normalizedOrigin.endsWith(".vercel.app") ||
          normalizedOrigin.startsWith("http://localhost")
        ) {
          return cb(null, true);
        }
        return cb(new Error("Not allowed by Socket CORS"));
      },
      methods: ["GET", "POST"],
    },
    // Optimize for real-time delivery notifications
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  console.log("🔌 Socket.io server initialized");

  // Add authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (token) {
      const payload = verifySocketToken(token);
      if (payload) {
        socket.userId = payload.id;
        socket.userRole = payload.role;
        console.log(
          `[Socket] Authenticated user: ${socket.userId} (role: ${socket.userRole})`,
        );
        return next();
      }
    }

    // Allow connections without token for now (backward compatibility)
    // but log it as a warning
    if (token) {
      console.warn(`[Socket] Connection with invalid token from ${socket.id}`);
    }
    next();
  });

  io.on("connection", (socket) => {
    console.log(`🔗 New socket connection: ${socket.id}`);

    // Driver joins and registers their driver ID
    socket.on("driver:register", async (driverId) => {
      const requestedDriverId = String(driverId || "").trim();
      const authenticatedDriverId = String(socket.userId || "").trim();
      const isAuthenticatedDriver =
        socket.userRole === "driver" && authenticatedDriverId.length > 0;

      if (!requestedDriverId && !isAuthenticatedDriver) {
        console.log(
          `⚠️ Socket ${socket.id} tried to register without driverId`,
        );
        socket.emit("driver:registration_error", {
          success: false,
          reason: "missing_driver_id",
          message: "Driver ID is required",
        });
        return;
      }

      // Security gate: do not allow unauthenticated sockets to subscribe to driver events.
      if (!isAuthenticatedDriver) {
        console.log(
          `⚠️ Socket ${socket.id} rejected driver registration (missing/invalid auth role)`,
        );
        socket.emit("driver:registration_error", {
          success: false,
          reason: "unauthorized",
          message: "Driver authentication required",
        });
        return;
      }

      // Prevent client-side spoofing via arbitrary driverId payload.
      if (requestedDriverId && requestedDriverId !== authenticatedDriverId) {
        console.log(
          `⚠️ Socket ${socket.id} tried to register mismatched driverId ${requestedDriverId} (auth: ${authenticatedDriverId})`,
        );
        socket.emit("driver:registration_error", {
          success: false,
          reason: "driver_id_mismatch",
          message: "Driver identity mismatch",
        });
        return;
      }

      const resolvedDriverId = authenticatedDriverId;

      // Only active drivers can subscribe to delivery broadcast channels.
      const { data: driverProfile, error: driverError } = await supabaseAdmin
        .from("drivers")
        .select("id, driver_status")
        .eq("id", resolvedDriverId)
        .maybeSingle();

      if (driverError) {
        console.error(
          `[Socket] Failed to validate driver ${resolvedDriverId}:`,
          driverError.message,
        );
        socket.emit("driver:registration_error", {
          success: false,
          reason: "driver_validation_failed",
          message: "Could not validate driver profile",
        });
        return;
      }

      const driverStatus = String(driverProfile?.driver_status || "")
        .trim()
        .toLowerCase();

      if (!driverProfile || driverStatus !== "active") {
        console.log(
          `⚠️ Driver ${resolvedDriverId} blocked from realtime delivery notifications (status: ${driverStatus || "unknown"})`,
        );
        socket.emit("driver:registration_error", {
          success: false,
          reason: "driver_not_active",
          driverStatus: driverStatus || null,
          message:
            "Driver is not active and cannot receive delivery notifications",
        });
        return;
      }

      // Store driver connection
      connectedDrivers.set(resolvedDriverId, {
        socketId: socket.id,
        connectedAt: new Date(),
        userId: socket.userId,
      });

      // Join driver-specific room
      socket.join(`driver:${resolvedDriverId}`);

      // Join "all-drivers" room for broadcasts
      socket.join("all-drivers");

      console.log(
        `✅ Driver ${resolvedDriverId} registered (socket: ${socket.id})`,
      );
      console.log(`📊 Total online drivers: ${connectedDrivers.size}`);

      // Acknowledge registration
      socket.emit("driver:registered", {
        success: true,
        driverId: resolvedDriverId,
        onlineDrivers: connectedDrivers.size,
      });
    });

    socket.on("driver:location", async (payload = {}) => {
      const authenticatedDriverId = String(socket.userId || "").trim();
      const isAuthenticatedDriver =
        socket.userRole === "driver" && authenticatedDriverId.length > 0;

      if (!isAuthenticatedDriver) {
        return;
      }

      const latitude = Number(payload?.lat ?? payload?.latitude);
      const longitude = Number(payload?.lng ?? payload?.longitude);
      const heading = Number(payload?.heading);
      const speed = Number(payload?.speed);
      const accuracy = Number(payload?.accuracy);
      const timestamp =
        Number.isFinite(Number(payload?.timestamp)) &&
        Number(payload?.timestamp) > 0
          ? Number(payload.timestamp)
          : Date.now();

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return;
      }

      driverLiveLocationCache.set(authenticatedDriverId, {
        latitude,
        longitude,
        heading: Number.isFinite(heading) ? heading : 0,
        speed: Number.isFinite(speed) ? speed : null,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        timestamp,
        updatedAt: Date.now(),
      });

      try {
        const now = Date.now();
        const cached = driverActiveDeliveriesCache.get(authenticatedDriverId);
        let activeDeliveries =
          cached &&
          now - Number(cached.fetchedAt || 0) <=
            DRIVER_ACTIVE_DELIVERIES_CACHE_TTL_MS
            ? cached.deliveries
            : null;

        if (!Array.isArray(activeDeliveries)) {
          const { data, error } = await supabaseAdmin
            .from("deliveries")
            .select(
              "id, order_id, status, orders (customer_id, order_number, delivery_latitude, delivery_longitude)",
            )
            .eq("driver_id", authenticatedDriverId)
            .in("status", [
              "accepted",
              "picked_up",
              "on_the_way",
              "at_customer",
            ]);

          if (error) {
            console.error(
              `[Socket] Failed to fetch active deliveries for live location stream (${authenticatedDriverId}):`,
              error.message,
            );
            return;
          }

          activeDeliveries = Array.isArray(data) ? data : [];
          driverActiveDeliveriesCache.set(authenticatedDriverId, {
            fetchedAt: now,
            deliveries: activeDeliveries,
          });
        }

        for (const delivery of activeDeliveries) {
          const customerId = delivery?.orders?.customer_id;
          if (!customerId) continue;

          const deliveryId = String(delivery?.id || "").trim();
          let etaPayload = null;
          if (deliveryId && delivery?.order_id) {
            const cachedEta = driverStreamEtaCache.get(deliveryId);
            if (
              cachedEta &&
              now - Number(cachedEta.fetchedAt || 0) <=
                DRIVER_STREAM_ETA_CACHE_TTL_MS
            ) {
              etaPayload = cachedEta.payload || null;
            } else {
              const eta = await calculateCustomerETA(delivery.order_id, {
                latitude,
                longitude,
              });

              etaPayload = eta
                ? {
                    etaMinutes: eta.etaMinutes,
                    etaRangeMin: eta.etaRangeMin,
                    etaRangeMax: eta.etaRangeMax,
                    etaDisplay: eta.etaDisplay,
                    stopsBeforeCustomer: eta.stopsBeforeCustomer,
                    driverStatus: eta.driverStatus,
                    isExact: Boolean(eta.isExact),
                  }
                : null;

              driverStreamEtaCache.set(deliveryId, {
                fetchedAt: now,
                payload: etaPayload,
              });
            }
          }

          io.to(`customer:${customerId}`).emit("order:driver_location", {
            type: "driver_location_stream",
            source: "socket_driver_stream",
            order_id: delivery?.order_id,
            order_number: delivery?.orders?.order_number,
            delivery_id: delivery?.id,
            status: delivery?.status,
            driver_location: {
              latitude,
              longitude,
              heading: Number.isFinite(heading) ? heading : 0,
              speed: Number.isFinite(speed) ? speed : null,
              accuracy: Number.isFinite(accuracy) ? accuracy : null,
              timestamp,
            },
            eta: etaPayload,
          });
        }
      } catch (error) {
        console.error(
          `[Socket] driver:location fan-out failed for driver ${authenticatedDriverId}:`,
          error.message,
        );
      }
    });

    // Customer joins and registers their customer ID
    socket.on("customer:register", (customerId) => {
      if (!customerId) {
        console.log(
          `⚠️ Socket ${socket.id} tried to register as customer without customerId`,
        );
        return;
      }

      // Store customer connection
      connectedCustomers.set(customerId, {
        socketId: socket.id,
        connectedAt: new Date(),
        userId: socket.userId,
      });

      // Join customer-specific room for targeted notifications
      socket.join(`customer:${customerId}`);

      console.log(
        `✅ Customer ${customerId} registered (socket: ${socket.id})`,
      );
      console.log(`📊 Total online customers: ${connectedCustomers.size}`);

      // Acknowledge registration
      socket.emit("customer:registered", {
        success: true,
        customerId,
      });
    });

    // Customer goes offline
    socket.on("customer:offline", (customerId) => {
      if (customerId && connectedCustomers.has(customerId)) {
        connectedCustomers.delete(customerId);
        socket.leave(`customer:${customerId}`);
        console.log(`📴 Customer ${customerId} went offline`);
        console.log(`📊 Total online customers: ${connectedCustomers.size}`);
      }
    });

    // Admin (restaurant) joins and registers their admin ID
    socket.on("admin:register", (adminId) => {
      if (!adminId) {
        console.log(
          `⚠️ Socket ${socket.id} tried to register as admin without adminId`,
        );
        return;
      }

      // Store admin connection
      connectedAdmins.set(adminId, {
        socketId: socket.id,
        connectedAt: new Date(),
        userId: socket.userId,
      });

      // Join admin-specific room for targeted notifications
      socket.join(`admin:${adminId}`);

      console.log(`✅ Admin ${adminId} registered (socket: ${socket.id})`);
      console.log(`📊 Total online admins: ${connectedAdmins.size}`);

      // Acknowledge registration
      socket.emit("admin:registered", {
        success: true,
        adminId,
      });
    });

    // Admin goes offline
    socket.on("admin:offline", (adminId) => {
      if (adminId && connectedAdmins.has(adminId)) {
        connectedAdmins.delete(adminId);
        socket.leave(`admin:${adminId}`);
        console.log(`📴 Admin ${adminId} went offline`);
        console.log(`📊 Total online admins: ${connectedAdmins.size}`);
      }
    });

    // Manager joins and registers
    socket.on("manager:register", (managerId) => {
      if (!managerId) {
        console.log(
          `⚠️ Socket ${socket.id} tried to register as manager without managerId`,
        );
        return;
      }

      connectedManagers.set(managerId, {
        socketId: socket.id,
        connectedAt: new Date(),
        userId: socket.userId,
      });

      socket.join(`manager:${managerId}`);
      socket.join("all-managers");

      console.log(`✅ Manager ${managerId} registered (socket: ${socket.id})`);
      console.log(`📊 Total online managers: ${connectedManagers.size}`);

      socket.emit("manager:registered", {
        success: true,
        managerId,
      });
    });

    // Manager goes offline
    socket.on("manager:offline", (managerId) => {
      if (managerId && connectedManagers.has(managerId)) {
        connectedManagers.delete(managerId);
        socket.leave(`manager:${managerId}`);
        socket.leave("all-managers");
        console.log(`📴 Manager ${managerId} went offline`);
        console.log(`📊 Total online managers: ${connectedManagers.size}`);
      }
    });

    // Driver goes offline
    socket.on("driver:offline", (driverId) => {
      if (driverId && connectedDrivers.has(driverId)) {
        connectedDrivers.delete(driverId);
        socket.leave("all-drivers");
        socket.leave(`driver:${driverId}`);
        driverLiveLocationCache.delete(String(driverId));
        driverActiveDeliveriesCache.delete(String(driverId));
        console.log(`📴 Driver ${driverId} went offline`);
        console.log(`📊 Total online drivers: ${connectedDrivers.size}`);
      }
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      // Find and remove the driver by socket ID
      for (const [driverId, data] of connectedDrivers.entries()) {
        if (data.socketId === socket.id) {
          connectedDrivers.delete(driverId);
          driverLiveLocationCache.delete(String(driverId));
          driverActiveDeliveriesCache.delete(String(driverId));
          console.log(`❌ Driver ${driverId} disconnected (reason: ${reason})`);
          break;
        }
      }
      // Find and remove the customer by socket ID
      for (const [customerId, data] of connectedCustomers.entries()) {
        if (data.socketId === socket.id) {
          connectedCustomers.delete(customerId);
          console.log(
            `❌ Customer ${customerId} disconnected (reason: ${reason})`,
          );
          break;
        }
      }
      // Find and remove the admin by socket ID
      for (const [adminId, data] of connectedAdmins.entries()) {
        if (data.socketId === socket.id) {
          connectedAdmins.delete(adminId);
          console.log(`❌ Admin ${adminId} disconnected (reason: ${reason})`);
          break;
        }
      }
      // Find and remove the manager by socket ID
      for (const [managerId, data] of connectedManagers.entries()) {
        if (data.socketId === socket.id) {
          connectedManagers.delete(managerId);
          console.log(
            `❌ Manager ${managerId} disconnected (reason: ${reason})`,
          );
          break;
        }
      }
      console.log(`📊 Total online drivers: ${connectedDrivers.size}`);
      console.log(`📊 Total online customers: ${connectedCustomers.size}`);
      console.log(`📊 Total online admins: ${connectedAdmins.size}`);
      console.log(`📊 Total online managers: ${connectedManagers.size}`);
    });

    // Ping to keep connection alive
    socket.on("ping", () => {
      socket.emit("pong", { timestamp: Date.now() });
    });
  });

  return io;
}

/**
 * Get Socket.io instance
 */
export function getIO() {
  if (!io) {
    throw new Error("Socket.io not initialized. Call initializeSocket first.");
  }
  return io;
}

/**
 * Broadcast new delivery to ALL online drivers SIMULTANEOUSLY
 * This is the key function for fair delivery distribution
 *
 * @param {Object} deliveryData - Delivery information
 * @param {string} deliveryData.delivery_id - Delivery ID
 * @param {string} deliveryData.order_id - Order ID
 * @param {string} deliveryData.order_number - Human-readable order number
 * @param {Object} deliveryData.restaurant - Restaurant details
 * @param {Object} deliveryData.customer - Customer location (for distance calc on client)
 * @param {number} deliveryData.total_amount - Order total
 */
export async function broadcastNewDelivery(deliveryData) {
  if (!io) {
    console.error("❌ Socket.io not initialized, cannot broadcast delivery");
    return { success: false, driversNotified: 0 };
  }

  const timestamp = Date.now();
  const onlineDriverIds = Array.from(connectedDrivers.keys());
  const onlineDriverCount = onlineDriverIds.length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📢 BROADCASTING NEW DELIVERY TO ALL DRIVERS`);
  console.log(`${"=".repeat(60)}`);
  console.log(`⏰ Timestamp: ${new Date(timestamp).toISOString()}`);
  console.log(`📦 Delivery ID: ${deliveryData.delivery_id}`);
  console.log(`🧾 Order #: ${deliveryData.order_number}`);
  console.log(`🍽️ Restaurant: ${deliveryData.restaurant?.name || "N/A"}`);
  console.log(`👥 Online Drivers: ${onlineDriverCount}`);
  console.log(`${"=".repeat(60)}\n`);

  if (onlineDriverCount === 0) {
    console.log("⚠️ No drivers online to receive notification");
    return { success: true, driversNotified: 0 };
  }

  const eligibleDriverIds =
    await getEligibleDriverIdsForDeliveryNotifications(onlineDriverIds);

  if (eligibleDriverIds.length === 0) {
    console.log(
      "⚠️ No eligible active/non-delivering drivers for delivery broadcast",
    );
    return { success: true, driversNotified: 0 };
  }

  const payload = {
    ...deliveryData,
    broadcast_timestamp: timestamp,
    message: "New delivery available! Check available deliveries now.",
  };

  eligibleDriverIds.forEach((driverId) => {
    io.to(`driver:${driverId}`).emit("delivery:new", payload);
  });

  console.log(
    `✅ Broadcast sent to ${eligibleDriverIds.length} eligible drivers (${onlineDriverCount} online)`,
  );

  return {
    success: true,
    driversNotified: eligibleDriverIds.length,
    broadcastTimestamp: timestamp,
  };
}

/**
 * Broadcast tip update to ALL online drivers
 * Triggered when manager sets/updates tip_amount on a pending delivery
 *
 * @param {Object} data - Delivery info with updated tip
 * @param {string} data.delivery_id - Delivery ID
 * @param {number} data.tip_amount - Tip amount set by manager
 */
export async function broadcastTipUpdate(data) {
  if (!io) {
    console.error("❌ Socket.io not initialized, cannot broadcast tip update");
    return { success: false, driversNotified: 0 };
  }

  const onlineDriverIds = Array.from(connectedDrivers.keys());
  const onlineDriverCount = onlineDriverIds.length;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`💰 BROADCASTING TIP UPDATE TO ALL DRIVERS`);
  console.log(`${"=".repeat(60)}`);
  console.log(`📦 Delivery ID: ${data.delivery_id}`);
  console.log(`💵 Tip Amount: Rs.${data.tip_amount}`);
  console.log(`👥 Online Drivers: ${onlineDriverCount}`);
  console.log(`${"=".repeat(60)}\n`);

  if (onlineDriverCount === 0) {
    console.log("⚠️ No drivers online to receive tip update");
    return { success: true, driversNotified: 0 };
  }

  const eligibleDriverIds =
    await getEligibleDriverIdsForDeliveryNotifications(onlineDriverIds);

  if (eligibleDriverIds.length === 0) {
    console.log("⚠️ No eligible active/non-delivering drivers for tip update");
    return { success: true, driversNotified: 0 };
  }

  const payload = {
    ...data,
    broadcast_timestamp: Date.now(),
    message: "A tip has been added to a delivery!",
  };

  eligibleDriverIds.forEach((driverId) => {
    io.to(`driver:${driverId}`).emit("delivery:tip_updated", payload);
  });

  console.log(
    `✅ Tip update broadcast sent to ${eligibleDriverIds.length} eligible drivers (${onlineDriverCount} online)`,
  );

  return { success: true, driversNotified: eligibleDriverIds.length };
}

/**
 * Notify a specific driver (for targeted notifications)
 * @param {string} driverId - Driver ID to notify
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function notifyDriver(driverId, event, data) {
  if (!io) {
    console.error("❌ Socket.io not initialized");
    return false;
  }

  const driverConnection = connectedDrivers.get(driverId);
  if (!driverConnection) {
    console.log(
      `⚠️ Driver ${driverId} not online, cannot send real-time notification`,
    );
    return false;
  }

  io.to(`driver:${driverId}`).emit(event, {
    ...data,
    timestamp: Date.now(),
  });

  console.log(`📨 Sent ${event} to driver ${driverId}`);
  return true;
}

/**
 * Notify when a delivery is taken (so other drivers can remove it from their list)
 * @param {string} deliveryId - Delivery ID that was taken
 * @param {string} takenByDriverId - Driver who accepted it
 */
export function broadcastDeliveryTaken(deliveryId, takenByDriverId) {
  if (!io) return;

  const payload = {
    delivery_id: deliveryId,
    taken_by: takenByDriverId,
    timestamp: Date.now(),
    message: "This delivery has been accepted by another driver",
  };

  io.to("all-drivers").emit("delivery:taken", payload);
  io.to("all-managers").emit("delivery:taken", payload);

  console.log(
    `📢 Broadcast: Delivery ${deliveryId} taken by driver ${takenByDriverId}`,
  );
}

/**
 * Get list of online driver IDs
 */
export function getOnlineDrivers() {
  return Array.from(connectedDrivers.keys());
}

/**
 * Get count of online drivers
 */
export function getOnlineDriverCount() {
  return connectedDrivers.size;
}

/**
 * Check if a specific driver is online
 */
export function isDriverOnline(driverId) {
  return connectedDrivers.has(driverId);
}

/**
 * Notify a specific customer with a delivery status update
 * @param {string} customerId - Customer ID to notify
 * @param {string} event - Event name (e.g., 'order:status_update')
 * @param {Object} data - Event data including status, message, etc.
 */
export function notifyCustomer(customerId, event, data) {
  if (!io) {
    console.error("❌ Socket.io not initialized, cannot notify customer");
    return false;
  }

  const customerConnection = connectedCustomers.get(customerId);
  if (!customerConnection) {
    console.log(
      `⚠️ Customer ${customerId} not online, cannot send real-time notification`,
    );
    return false;
  }

  io.to(`customer:${customerId}`).emit(event, {
    ...data,
    timestamp: Date.now(),
  });

  console.log(`📨 Sent ${event} to customer ${customerId}`);
  return true;
}

/**
 * Notify a specific admin (restaurant) with a real-time event
 * @param {string} adminId - Admin ID to notify
 * @param {string} event - Event name (e.g., 'order:new_order')
 * @param {Object} data - Event data
 */
export function notifyAdmin(adminId, event, data) {
  if (!io) {
    console.error("❌ Socket.io not initialized, cannot notify admin");
    return false;
  }

  const adminConnection = connectedAdmins.get(adminId);
  if (!adminConnection) {
    console.log(
      `⚠️ Admin ${adminId} not online, cannot send real-time notification`,
    );
    return false;
  }

  io.to(`admin:${adminId}`).emit(event, {
    ...data,
    timestamp: Date.now(),
  });

  console.log(`📨 Sent ${event} to admin ${adminId}`);
  return true;
}

/**
 * Check if a specific customer is online
 */
export function isCustomerOnline(customerId) {
  return connectedCustomers.has(customerId);
}

/**
 * Get count of online customers
 */
export function getOnlineCustomerCount() {
  return connectedCustomers.size;
}

/**
 * Broadcast to all connected managers
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function broadcastToManagers(event, data) {
  if (!io) {
    console.error("❌ Socket.io not initialized, cannot broadcast to managers");
    return false;
  }

  const onlineManagerCount = connectedManagers.size;
  if (onlineManagerCount === 0) {
    console.log(`⚠️ No managers online to receive ${event}`);
    return false;
  }

  io.to("all-managers").emit(event, {
    ...data,
    timestamp: Date.now(),
  });

  console.log(`📨 Broadcast ${event} to ${onlineManagerCount} online managers`);
  return true;
}

/**
 * Notify a specific manager
 * @param {string} managerId - Manager ID to notify
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function notifyManager(managerId, event, data) {
  if (!io) {
    console.error("❌ Socket.io not initialized, cannot notify manager");
    return false;
  }

  const managerConnection = connectedManagers.get(managerId);
  if (!managerConnection) {
    console.log(`⚠️ Manager ${managerId} not online`);
    return false;
  }

  io.to(`manager:${managerId}`).emit(event, {
    ...data,
    timestamp: Date.now(),
  });

  console.log(`📨 Sent ${event} to manager ${managerId}`);
  return true;
}

/**
 * Get count of online managers
 */
export function getOnlineManagerCount() {
  return connectedManagers.size;
}

export function getLatestDriverLiveLocation(driverId) {
  const key = String(driverId || "").trim();
  if (!key) return null;
  return driverLiveLocationCache.get(key) || null;
}

export default {
  initializeSocket,
  getIO,
  broadcastNewDelivery,
  broadcastTipUpdate,
  notifyDriver,
  notifyCustomer,
  notifyAdmin,
  broadcastDeliveryTaken,
  getOnlineDrivers,
  getOnlineDriverCount,
  isDriverOnline,
  isCustomerOnline,
  getOnlineCustomerCount,
  broadcastToManagers,
  notifyManager,
  getOnlineManagerCount,
  getLatestDriverLiveLocation,
};
