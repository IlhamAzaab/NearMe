// Status configuration for all order tracking pages

export const ORDER_STATUSES = {
  PLACED: "placed",
  PENDING: "pending",
  ACCEPTED: "accepted",
  PICKED_UP: "picked_up",
  ON_THE_WAY: "on_the_way",
  DELIVERED: "delivered",
};

// Progress steps shown in the stepper - EXACTLY 6 STEPS
export const PROGRESS_STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "pending", label: "Preparing your order" },
  { key: "accepted", label: "Driver accepted" },
  { key: "picked_up", label: "Picked up" },
  { key: "on_the_way", label: "Heading your way" },
  { key: "delivered", label: "Delivered" }
];

// Status-specific icons (SVG paths)
export const STATUS_ICONS = {
  placed: {
    path: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    type: "check",
  },
  pending: {
    path: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
    type: "building",
  },
  accepted: {
    paths: ["M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z", "M12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"],
    type: "driver",
  },
  picked_up: {
    path: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
    type: "package",
  },
  on_the_way: {
    paths: ["M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z", "M12 13a3 3 0 100-6 3 3 0 000 6z"],
    type: "location",
  },
  delivered: {
    path: "M20 6L9 17l-5-5",
    type: "success",
  },
};

export const STATUS_CONFIG = {
  placed: {
    statusKey: "placed",
    title: "Order Placed!",
    subtitle: "We've received your order",
    messageText: "Your order has been placed successfully. We're notifying the restaurant.",
    currentStepIndex: 0,
    showDriverInfo: false,
    showTrackButton: false,
    showRating: false,
  },
  pending: {
    statusKey: "pending",
    title: "Preparing Your Order",
    subtitle: "The restaurant is cooking your meal",
    messageText: "Your delicious meal is being prepared with care.",
    currentStepIndex: 1,
    showDriverInfo: false,
    showTrackButton: false,
    showRating: false,
  },
  accepted: {
    statusKey: "accepted",
    title: "Driver Accepted",
    subtitle: "A driver has accepted your order",
    messageText: "Your driver is on the way to pick up your order.",
    currentStepIndex: 2,
    showDriverInfo: true,
    showTrackButton: false,
    showRating: false,
  },
  picked_up: {
    statusKey: "picked_up",
    title: "Order Picked Up",
    subtitle: "Driver has picked up your order",
    messageText: "Your order is now with the driver and on the way.",
    currentStepIndex: 3,
    showDriverInfo: true,
    showTrackButton: true,
    showRating: false,
  },
  on_the_way: {
    statusKey: "on_the_way",
    title: "On The Way",
    subtitle: "Your order is heading to you",
    messageText: "Your driver is on the way to your location.",
    currentStepIndex: 4,
    showDriverInfo: true,
    showTrackButton: true,
    showRating: false,
  },
  delivered: {
    statusKey: "delivered",
    title: "Delivered!",
    subtitle: "Enjoy your meal",
    messageText: "Your order has been delivered. Bon appétit!",
    currentStepIndex: 5,
    showDriverInfo: false,
    showTrackButton: false,
    showRating: true,
  },
};

// Helper function to get status configuration
export const getStatusConfig = (statusKey) => {
  const configs = {
    placed: {
      title: "Order Placed!",
      subtitle: "We've received your order",
      messageText: "Your order has been placed successfully. We're notifying the restaurant.",
      currentStepIndex: 0,
      showDriverInfo: false,
      showTrackButton: false,
      showRating: false,
    },
    pending: {
      title: "Preparing Your Order",
      subtitle: "The restaurant is cooking your meal",
      messageText: "Your delicious meal is being prepared with care.",
      currentStepIndex: 1,
      showDriverInfo: false,
      showTrackButton: false,
      showRating: false,
    },
    accepted: {
      title: "Driver Accepted",
      subtitle: "A driver has accepted your order",
      messageText: "Your driver is on the way to pick up your order.",
      currentStepIndex: 2,
      showDriverInfo: true,
      showTrackButton: false,
      showRating: false,
    },
    picked_up: {
      title: "Order Picked Up",
      subtitle: "Driver has picked up your order",
      messageText: "Your order is now with the driver and on the way.",
      currentStepIndex: 3,
      showDriverInfo: true,
      showTrackButton: true,
      showRating: false,
    },
    on_the_way: {
      title: "On The Way",
      subtitle: "Your order is heading to you",
      messageText: "Your driver is on the way to your location.",
      currentStepIndex: 4,
      showDriverInfo: true,
      showTrackButton: true,
      showRating: false,
    },
    delivered: {
      title: "Delivered!",
      subtitle: "Enjoy your meal",
      messageText: "Your order has been delivered. Bon appétit!",
      currentStepIndex: 5,
      showDriverInfo: false,
      showTrackButton: false,
      showRating: true,
    },
  };

  return configs[statusKey] || configs.placed;
};

// Helper to calculate ETA text
export const getEtaDisplayText = (statusKey, estimatedMinutes = null) => {
  const config = STATUS_CONFIG[statusKey];
  if (!config) return "Estimated arrival";
  
  if (statusKey === "delivered") {
    return "Delivered";
  }
  
  if (estimatedMinutes) {
    return `${config.etaText} ${estimatedMinutes} min`;
  }
  
  // Calculate default ETA (30-45 mins from now)
  const now = new Date();
  const start = new Date(now.getTime() + 30 * 60000);
  const format = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${config.etaText} ${format(start)}`;
};
