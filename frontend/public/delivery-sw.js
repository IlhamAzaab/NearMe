/**
 * Delivery Notification Service Worker
 *
 * Handles push notifications when the driver's browser/tab is in background or closed.
 * Uses the Push API and Notification API.
 */

// Cache name for offline support
const CACHE_NAME = "delivery-notifications-v1";

// Install event
self.addEventListener("install", (event) => {
  console.log("[Delivery SW] Installing...");
  self.skipWaiting();
});

// Activate event
self.addEventListener("activate", (event) => {
  console.log("[Delivery SW] Activated");
  event.waitUntil(self.clients.claim());
});

// Push notification event (from server push)
self.addEventListener("push", (event) => {
  console.log("[Delivery SW] Push received");

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "New Delivery", body: "A new delivery is available!" };
  }

  const title = data.title || "🚚 New Delivery Available!";
  const options = {
    body: data.body || "Check available deliveries for details.",
    icon: "/delivery-icon.png",
    badge: "/delivery-icon.png",
    tag: data.tag || `delivery-${Date.now()}`,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: data,
    actions: [
      { action: "accept", title: "✅ View" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click event
self.addEventListener("notificationclick", (event) => {
  console.log("[Delivery SW] Notification clicked:", event.action);
  event.notification.close();

  const url = "/driver/deliveries";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes("/driver") && "focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});

// Handle messages from the main thread
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, data } = event.data;
    self.registration.showNotification(title || "🚚 New Delivery!", {
      body: body || "A new delivery is available.",
      icon: "/delivery-icon.png",
      badge: "/delivery-icon.png",
      tag: tag || `delivery-${Date.now()}`,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      data: data || {},
      actions: [
        { action: "accept", title: "✅ View" },
        { action: "dismiss", title: "Dismiss" },
      ],
    });
  }
});
