/**
 * Socket.io Manager for Real-time Notifications
 *
 * Purpose: Broadcast new deliveries to ALL online drivers SIMULTANEOUSLY
 * This ensures fair opportunity - every driver sees new deliveries at the exact same time
 */

import { Server } from "socket.io";

let io = null;

// Track connected drivers with their socket IDs
const connectedDrivers = new Map(); // driverId -> { socketId, connectedAt }

/**
 * Initialize Socket.io server
 * @param {http.Server} server - HTTP server instance
 */
export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*", // In production, restrict to your frontend URL
      methods: ["GET", "POST"],
    },
    // Optimize for real-time delivery notifications
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  console.log("🔌 Socket.io server initialized");

  io.on("connection", (socket) => {
    console.log(`🔗 New socket connection: ${socket.id}`);

    // Driver joins and registers their driver ID
    socket.on("driver:register", (driverId) => {
      if (!driverId) {
        console.log(
          `⚠️ Socket ${socket.id} tried to register without driverId`,
        );
        return;
      }

      // Store driver connection
      connectedDrivers.set(driverId, {
        socketId: socket.id,
        connectedAt: new Date(),
      });

      // Join driver-specific room
      socket.join(`driver:${driverId}`);

      // Join "all-drivers" room for broadcasts
      socket.join("all-drivers");

      console.log(`✅ Driver ${driverId} registered (socket: ${socket.id})`);
      console.log(`📊 Total online drivers: ${connectedDrivers.size}`);

      // Acknowledge registration
      socket.emit("driver:registered", {
        success: true,
        driverId,
        onlineDrivers: connectedDrivers.size,
      });
    });

    // Driver goes offline
    socket.on("driver:offline", (driverId) => {
      if (driverId && connectedDrivers.has(driverId)) {
        connectedDrivers.delete(driverId);
        socket.leave("all-drivers");
        socket.leave(`driver:${driverId}`);
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
          console.log(`❌ Driver ${driverId} disconnected (reason: ${reason})`);
          break;
        }
      }
      console.log(`📊 Total online drivers: ${connectedDrivers.size}`);
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
export function broadcastNewDelivery(deliveryData) {
  if (!io) {
    console.error("❌ Socket.io not initialized, cannot broadcast delivery");
    return { success: false, driversNotified: 0 };
  }

  const timestamp = Date.now();
  const onlineDriverCount = connectedDrivers.size;

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

  // Broadcast to ALL drivers in the "all-drivers" room SIMULTANEOUSLY
  // Socket.io broadcasts to all members of a room in a single operation
  io.to("all-drivers").emit("delivery:new", {
    ...deliveryData,
    broadcast_timestamp: timestamp,
    message: "New delivery available! Check available deliveries now.",
  });

  console.log(
    `✅ Broadcast sent to ${onlineDriverCount} online drivers at exactly the same time`,
  );

  return {
    success: true,
    driversNotified: onlineDriverCount,
    broadcastTimestamp: timestamp,
  };
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

  io.to("all-drivers").emit("delivery:taken", {
    delivery_id: deliveryId,
    taken_by: takenByDriverId,
    timestamp: Date.now(),
    message: "This delivery has been accepted by another driver",
  });

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

export default {
  initializeSocket,
  getIO,
  broadcastNewDelivery,
  notifyDriver,
  broadcastDeliveryTaken,
  getOnlineDrivers,
  getOnlineDriverCount,
  isDriverOnline,
};
