/**
 * Commission Calculation Utility
 *
 * Commission Rules:
 * - Price ≤ 50: flat commission of Rs. 5
 * - Price > 50 and ≤ 100: flat commission of Rs. 10
 * - Price > 100: 10% commission, rounded up to nearest 10
 *
 * Examples:
 * - 30/= → 35/= (30 + 5 commission)
 * - 70/= → 80/= (70 + 10 commission)
 * - 370/= → 410/= (370 + 37 → 40 rounded commission)
 * - 1000/= → 1100/= (1000 + 100 commission, already multiple of 10)
 */

/**
 * Calculate commission for a given price
 * @param {number} price - Original price (admin's price)
 * @returns {number} Commission amount
 */
function calculateCommission(price) {
  if (price === null || price === undefined || price <= 0) {
    return 0;
  }

  const numPrice = parseFloat(price);

  // Price ≤ 50: flat commission of 5
  if (numPrice <= 50) {
    return 5;
  }

  // Price > 50 and ≤ 100: flat commission of 10
  if (numPrice <= 100) {
    return 10;
  }

  // Price > 100: 10% commission, rounded up to nearest 10
  const tenPercent = numPrice * 0.1;
  const roundedUp = Math.ceil(tenPercent / 10) * 10;
  return roundedUp;
}

/**
 * Calculate customer price (original price + commission)
 * @param {number} price - Original price (admin's price)
 * @returns {number} Customer-facing price with commission
 */
function calculateCustomerPrice(price) {
  if (price === null || price === undefined || price <= 0) {
    return 0;
  }

  const numPrice = parseFloat(price);
  const commission = calculateCommission(numPrice);
  return numPrice + commission;
}

/**
 * Get complete pricing breakdown for a food item
 * @param {Object} food - Food object with regular_price, offer_price, extra_price, extra_offer_price
 * @returns {Object} Pricing breakdown with admin prices and customer prices
 */
function getFoodPricing(food) {
  if (!food) return null;

  const pricing = {
    // Original admin prices
    admin: {
      regular_price: parseFloat(food.regular_price) || 0,
      offer_price: food.offer_price ? parseFloat(food.offer_price) : null,
      extra_price: food.extra_price ? parseFloat(food.extra_price) : null,
      extra_offer_price: food.extra_offer_price
        ? parseFloat(food.extra_offer_price)
        : null,
    },
    // Customer-facing prices (with commission)
    customer: {
      regular_price: 0,
      offer_price: null,
      extra_price: null,
      extra_offer_price: null,
    },
    // Commission breakdown
    commission: {
      regular_commission: 0,
      offer_commission: null,
      extra_commission: null,
      extra_offer_commission: null,
    },
    // Effective prices (what customer actually pays - offer if exists, otherwise regular)
    effective: {
      regular_effective_price: 0, // What customer pays for regular size
      extra_effective_price: null, // What customer pays for large size
    },
  };

  // Regular price (always exists)
  pricing.commission.regular_commission = calculateCommission(
    pricing.admin.regular_price,
  );
  pricing.customer.regular_price =
    pricing.admin.regular_price + pricing.commission.regular_commission;

  // Offer price (optional)
  if (pricing.admin.offer_price !== null) {
    pricing.commission.offer_commission = calculateCommission(
      pricing.admin.offer_price,
    );
    pricing.customer.offer_price =
      pricing.admin.offer_price + pricing.commission.offer_commission;
  }

  // Extra price (large size - optional)
  if (pricing.admin.extra_price !== null) {
    pricing.commission.extra_commission = calculateCommission(
      pricing.admin.extra_price,
    );
    pricing.customer.extra_price =
      pricing.admin.extra_price + pricing.commission.extra_commission;
  }

  // Extra offer price (large size with offer - optional)
  if (pricing.admin.extra_offer_price !== null) {
    pricing.commission.extra_offer_commission = calculateCommission(
      pricing.admin.extra_offer_price,
    );
    pricing.customer.extra_offer_price =
      pricing.admin.extra_offer_price +
      pricing.commission.extra_offer_commission;
  }

  // Calculate effective prices (what customer actually pays)
  // For regular size: use offer_price if exists, otherwise regular_price
  if (pricing.customer.offer_price !== null) {
    pricing.effective.regular_effective_price = pricing.customer.offer_price;
  } else {
    pricing.effective.regular_effective_price = pricing.customer.regular_price;
  }

  // For large size: use extra_offer_price if exists, otherwise extra_price
  if (pricing.admin.extra_price !== null) {
    if (pricing.customer.extra_offer_price !== null) {
      pricing.effective.extra_effective_price =
        pricing.customer.extra_offer_price;
    } else {
      pricing.effective.extra_effective_price = pricing.customer.extra_price;
    }
  }

  return pricing;
}

/**
 * Calculate order totals including admin payment and manager earnings
 * @param {Array} orderItems - Array of order items with admin prices and quantities
 * @returns {Object} Order totals breakdown
 */
function calculateOrderTotals(orderItems) {
  let adminPayment = 0; // What manager pays to admin (restaurant)
  let managerEarning = 0; // Commission earned by manager (system)
  let customerSubtotal = 0; // What customer pays for food (excluding delivery/service fees)

  for (const item of orderItems) {
    const quantity = parseInt(item.quantity) || 1;

    // Admin price is what restaurant set (use offer price if available)
    const adminUnitPrice = item.admin_unit_price || item.unit_price;
    const adminTotal = parseFloat(adminUnitPrice) * quantity;

    // Customer price includes commission
    const customerUnitPrice =
      item.customer_unit_price || calculateCustomerPrice(adminUnitPrice);
    const customerTotal = parseFloat(customerUnitPrice) * quantity;

    // Commission for this item
    const commission = customerTotal - adminTotal;

    adminPayment += adminTotal;
    managerEarning += commission;
    customerSubtotal += customerTotal;
  }

  return {
    admin_payment: parseFloat(adminPayment.toFixed(2)),
    manager_earning: parseFloat(managerEarning.toFixed(2)),
    customer_subtotal: parseFloat(customerSubtotal.toFixed(2)),
  };
}

/**
 * Get the price to pay for a cart item based on size and whether it has offer
 * @param {Object} food - Food object with all prices
 * @param {string} size - 'regular' or 'large'
 * @returns {Object} { adminPrice, customerPrice, commission }
 */
function getCartItemPrices(food, size = "regular") {
  const pricing = getFoodPricing(food);

  if (size === "large" && pricing.admin.extra_price !== null) {
    // Large size
    let adminPrice, customerPrice, commission;

    if (pricing.admin.extra_offer_price !== null) {
      // Has extra offer price
      adminPrice = pricing.admin.extra_offer_price;
      customerPrice = pricing.customer.extra_offer_price;
      commission = pricing.commission.extra_offer_commission;
    } else {
      // No extra offer, use regular extra price
      adminPrice = pricing.admin.extra_price;
      customerPrice = pricing.customer.extra_price;
      commission = pricing.commission.extra_commission;
    }

    return { adminPrice, customerPrice, commission };
  } else {
    // Regular size
    let adminPrice, customerPrice, commission;

    if (pricing.admin.offer_price !== null) {
      // Has offer price
      adminPrice = pricing.admin.offer_price;
      customerPrice = pricing.customer.offer_price;
      commission = pricing.commission.offer_commission;
    } else {
      // No offer, use regular price
      adminPrice = pricing.admin.regular_price;
      customerPrice = pricing.customer.regular_price;
      commission = pricing.commission.regular_commission;
    }

    return { adminPrice, customerPrice, commission };
  }
}

/**
 * Add commission pricing to a food object for customer display
 * @param {Object} food - Original food object from database
 * @returns {Object} Food object with customer prices added
 */
function addCustomerPricing(food) {
  if (!food) return null;

  const pricing = getFoodPricing(food);

  return {
    ...food,
    // Original admin prices (keep for reference)
    admin_regular_price: pricing.admin.regular_price,
    admin_offer_price: pricing.admin.offer_price,
    admin_extra_price: pricing.admin.extra_price,
    admin_extra_offer_price: pricing.admin.extra_offer_price,

    // Replace display prices with customer prices (includes commission)
    regular_price: pricing.customer.regular_price,
    offer_price: pricing.customer.offer_price,
    extra_price: pricing.customer.extra_price,
    extra_offer_price: pricing.customer.extra_offer_price,

    // Commission amounts for transparency (optional display)
    regular_commission: pricing.commission.regular_commission,
    offer_commission: pricing.commission.offer_commission,
    extra_commission: pricing.commission.extra_commission,
    extra_offer_commission: pricing.commission.extra_offer_commission,

    // Effective prices (what customer pays based on offer availability)
    effective_regular_price: pricing.effective.regular_effective_price,
    effective_extra_price: pricing.effective.extra_effective_price,
  };
}

export {
  calculateCommission,
  calculateCustomerPrice,
  getFoodPricing,
  calculateOrderTotals,
  getCartItemPrices,
  addCustomerPricing,
};
