/**
 * Socket.io Manager for Real-time Notifications
 *
 * Purpose: Broadcast new deliveries to ALL online drivers SIMULTANEOUSLY
 * AND send real-time order status notifications to customers
 */

import { Server } from "socket.io";

let io = null;

// Track connected drivers with their socket IDs
const connectedDrivers = new Map(); // driverId -> { socketId, connectedAt }

// Track connected customers with their socket IDs
const connectedCustomers = new Map(); // customerId -> { socketId, connectedAt }

// Track connected admins (restaurant admins) with their socket IDs
const connectedAdmins = new Map(); // adminId -> { socketId, connectedAt }

// Track connected managers with their socket IDs
const connectedManagers = new Map(); // managerId -> { socketId, connectedAt }

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
 * Broadcast tip update to ALL online drivers
 * Triggered when manager sets/updates tip_amount on a pending delivery
 *
 * @param {Object} data - Delivery info with updated tip
 * @param {string} data.delivery_id - Delivery ID
 * @param {number} data.tip_amount - Tip amount set by manager
 */
export function broadcastTipUpdate(data) {
  if (!io) {
    console.error("❌ Socket.io not initialized, cannot broadcast tip update");
    return { success: false, driversNotified: 0 };
  }

  const onlineDriverCount = connectedDrivers.size;

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

  io.to("all-drivers").emit("delivery:tip_updated", {
    ...data,
    broadcast_timestamp: Date.now(),
    message: "A tip has been added to a delivery!",
  });

  console.log(`✅ Tip update broadcast sent to ${onlineDriverCount} drivers`);

  return { success: true, driversNotified: onlineDriverCount };
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
};
