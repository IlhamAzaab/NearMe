// ============================================================================
// ENUM REFERENCE - Use these EXACT values throughout the entire codebase
// ============================================================================

/**
 * ORDER STATUS ENUM
 * Used in: orders table, backend validation, frontend displays
 */
export const ORDER_STATUS = {
  PLACED: "placed", // Customer submits order
  ACCEPTED: "accepted", // Restaurant accepts order
  REJECTED: "rejected", // Restaurant rejects order
  READY: "ready", // Restaurant finishes preparing
  DELIVERED: "delivered", // Driver delivers to customer
  CANCELLED: "cancelled", // Order cancelled by any party
};

/**
 * DELIVERY STATUS ENUM
 * Used in: deliveries table, backend validation, frontend displays
 */
export const DELIVERY_STATUS = {
  PENDING: "pending", // Delivery created, waiting for driver
  ACCEPTED: "accepted", // Driver accepted delivery
  PICKED_UP: "picked_up", // Driver picked up from restaurant
  ON_THE_WAY: "on_the_way", // Driver heading to customer
  AT_CUSTOMER: "at_customer", // Driver arrived at customer location
  DELIVERED: "delivered", // Order delivered to customer
  CANCELLED: "cancelled", // Delivery cancelled
};

/**
 * VALID STATE TRANSITIONS
 */
export const DELIVERY_TRANSITIONS = {
  [DELIVERY_STATUS.ACCEPTED]: [DELIVERY_STATUS.PICKED_UP],
  [DELIVERY_STATUS.PICKED_UP]: [DELIVERY_STATUS.ON_THE_WAY],
  [DELIVERY_STATUS.ON_THE_WAY]: [DELIVERY_STATUS.AT_CUSTOMER],
  [DELIVERY_STATUS.AT_CUSTOMER]: [DELIVERY_STATUS.DELIVERED],
};

/**
 * TIMESTAMP FIELDS IN DELIVERIES TABLE
 */
export const DELIVERY_TIMESTAMPS = {
  accepted_at: "When driver accepted",
  picked_up_at: "When order picked up from restaurant",
  on_the_way_at: "When driver started delivery to customer",
  arrived_customer_at: "When driver arrived at customer",
  delivered_at: "When order was delivered",
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

// ❌ DON'T USE:
// status === "heading_to_restaurant"  // OLD - REMOVED
// status === "at_restaurant"          // OLD - REMOVED
// status === "heading_to_customer"    // OLD - REMOVED

// ✅ DO USE:
// status === DELIVERY_STATUS.ACCEPTED
// status === DELIVERY_STATUS.PICKED_UP
// status === DELIVERY_STATUS.ON_THE_WAY
// status === DELIVERY_STATUS.AT_CUSTOMER
