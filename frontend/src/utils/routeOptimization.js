/**
 * Smart Route Optimization Utilities
 * Optimizes delivery routes based on nearest customer distance to save money
 */

// Calculate distance between two points using Haversine formula
export const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

/**
 * Smart pickup order optimization based on ALL restaurant distances to EACH customer
 * For each customer, checks distances to ALL restaurants (not just their assigned one)
 * Picks from restaurants serving customers who are FAR from all restaurants first
 * Then delivers to customers closest to last restaurant
 *
 * @param {Array} pickupsList - Array of pickups with restaurant and customer info
 * @param {Object} driverLoc - Driver's current location {latitude, longitude}
 * @returns {Array} - Ordered pickups for optimal route
 */
export const getOptimizedRestaurantOrderByShortest = (
  pickupsList,
  driverLoc,
) => {
  if (pickupsList.length <= 1) return pickupsList;

  console.log(
    `📍 [SMART ROUTE] Analyzing ${pickupsList.length} deliveries - checking ALL restaurant distances to EACH customer...`,
  );

  // STEP 1: For each customer, find distances to ALL restaurants
  const customerRestaurantDistances = pickupsList.map((pickup, idx) => {
    const customerId = pickup.customer.id || idx;
    const customerLat = pickup.customer.latitude;
    const customerLng = pickup.customer.longitude;

    // Calculate distance from this customer to ALL restaurants
    const distancesToAllRestaurants = pickupsList.map((otherPickup) => {
      const distToRestaurant = haversineDistance(
        customerLat,
        customerLng,
        otherPickup.restaurant.latitude,
        otherPickup.restaurant.longitude,
      );
      return {
        restaurantName: otherPickup.restaurant.name,
        distance: distToRestaurant,
        pickup: otherPickup,
      };
    });

    // Find minimum distance (nearest restaurant to this customer)
    const nearestRestaurant = distancesToAllRestaurants.reduce((min, curr) =>
      curr.distance < min.distance ? curr : min,
    );

    // Find maximum distance (farthest restaurant from this customer)
    const farthestRestaurant = distancesToAllRestaurants.reduce((max, curr) =>
      curr.distance > max.distance ? curr : max,
    );

    return {
      customer: pickup.customer,
      pickup,
      customerId,
      minDistance: nearestRestaurant.distance, // Closest restaurant to customer
      maxDistance: farthestRestaurant.distance, // Farthest restaurant from customer
      nearestRestaurant,
      farthestRestaurant,
      allDistances: distancesToAllRestaurants,
    };
  });

  console.log(`📍 [SMART ROUTE] Customer Analysis:`);
  customerRestaurantDistances.forEach((cd) => {
    console.log(
      `📍 [SMART ROUTE]   ${cd.customer.name}: Nearest restaurant ${cd.nearestRestaurant.restaurantName} (${(cd.minDistance / 1000).toFixed(2)} km), Farthest ${cd.farthestRestaurant.restaurantName} (${(cd.maxDistance / 1000).toFixed(2)} km)`,
    );
  });

  // STEP 2: Sort customers by how far they are from their nearest restaurant
  // Customers far from ALL restaurants should be served first (pick from their restaurants first)
  const sortedByDistance = [...customerRestaurantDistances].sort(
    (a, b) => b.minDistance - a.minDistance, // Far customers first
  );

  // STEP 3: Build pickup order - for each customer (starting with farthest),
  // pick from their farthest restaurant first, then nearest
  const pickupOrder = [];
  const usedPickups = new Set();

  console.log(`📍 [SMART ROUTE] Pickup Order (serving far customers first):`);

  for (const customerData of sortedByDistance) {
    if (!usedPickups.has(customerData.pickup.delivery_id)) {
      // For this customer, pick from the farthest restaurant first
      const farthestForThisCustomer = customerData.farthestRestaurant.pickup;

      if (!usedPickups.has(farthestForThisCustomer.delivery_id)) {
        pickupOrder.push(farthestForThisCustomer);
        usedPickups.add(farthestForThisCustomer.delivery_id);

        console.log(
          `📍 [SMART ROUTE]   R${pickupOrder.length}. ${farthestForThisCustomer.restaurant.name} (for customer ${customerData.customer.name} who is ${(customerData.minDistance / 1000).toFixed(2)} km away)`,
        );
      }
    }
  }

  // STEP 4: Add any remaining pickups
  for (const pickup of pickupsList) {
    if (!usedPickups.has(pickup.delivery_id)) {
      pickupOrder.push(pickup);
      usedPickups.add(pickup.delivery_id);
      console.log(
        `📍 [SMART ROUTE]   R${pickupOrder.length}. ${pickup.restaurant.name}`,
      );
    }
  }

  return pickupOrder;
};

/**
 * Optimize customer delivery order based on proximity to current location after all pickups
 *
 * @param {Array} pickupsList - Array of pickups (ordered after smart restaurant optimization)
 * @returns {Array} - Ordered deliveries for optimal delivery sequence
 */
export const getOptimizedCustomerOrderByShortest = (deliveriesList) => {
  if (!deliveriesList || deliveriesList.length <= 1) return deliveriesList;

  // Filter out deliveries without customer data
  const validDeliveries = deliveriesList.filter((delivery) => {
    if (!delivery.customer) {
      console.warn(
        `⚠️ [ROUTE OPT] Delivery ${delivery.delivery_id} missing customer data, skipping`,
      );
      return false;
    }
    if (!delivery.customer.latitude || !delivery.customer.longitude) {
      console.warn(
        `⚠️ [ROUTE OPT] Delivery ${delivery.delivery_id} missing customer coordinates, skipping`,
      );
      return false;
    }
    return true;
  });

  if (validDeliveries.length <= 1) return validDeliveries;

  // Determine starting point - either from last restaurant (if mixed pickups+deliveries)
  // or from driver's current location (if only deliveries)
  let currentLat, currentLng;

  if (deliveriesList[0].restaurant) {
    // This is a pickup list - start from last restaurant
    const lastRestaurant = deliveriesList[deliveriesList.length - 1].restaurant;
    if (
      !lastRestaurant ||
      !lastRestaurant.latitude ||
      !lastRestaurant.longitude
    ) {
      console.warn(
        "⚠️ [ROUTE OPT] Invalid restaurant data, using first delivery location as start",
      );
      currentLat = validDeliveries[0].customer.latitude;
      currentLng = validDeliveries[0].customer.longitude;
    } else {
      currentLat = lastRestaurant.latitude;
      currentLng = lastRestaurant.longitude;
      console.log(
        `📍 [SMART ROUTE] Delivery order (starting from last restaurant: ${lastRestaurant.name}):`,
      );
    }
  } else {
    // This is a delivery list - start from first delivery location as reference
    currentLat = validDeliveries[0].customer.latitude;
    currentLng = validDeliveries[0].customer.longitude;
    console.log(
      `📍 [SMART ROUTE] Delivery order (starting from first delivery location):`,
    );
  }

  // Find the order to visit all customers with shortest total distance
  const remaining = [...validDeliveries];
  const ordered = [];

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    remaining.forEach((delivery, idx) => {
      const dist = haversineDistance(
        currentLat,
        currentLng,
        delivery.customer.latitude,
        delivery.customer.longitude,
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = idx;
      }
    });

    const nearest = remaining[nearestIdx];
    ordered.push(nearest);

    console.log(
      `📍 [SMART ROUTE]   C${ordered.length}. ${nearest.customer.name} (${(nearestDist / 1000).toFixed(2)} km from current location)`,
    );

    currentLat = nearest.customer.latitude;
    currentLng = nearest.customer.longitude;
    remaining.splice(nearestIdx, 1);
  }

  return ordered;
};

/**
 * Calculate total route distance for a set of optimized pickups and customers
 *
 * @param {Object} driverLoc - Driver's current location
 * @param {Array} optimizedRestaurants - Ordered restaurants
 * @param {Array} optimizedCustomers - Ordered customers
 * @returns {Object} - Route statistics with total distance and time estimate
 */
export const calculateRouteStats = (
  driverLoc,
  optimizedRestaurants,
  optimizedCustomers,
) => {
  let totalDistance = 0;

  if (!driverLoc || !optimizedRestaurants || !optimizedCustomers) {
    return { totalDistance: 0, estimatedTime: 0 };
  }

  // Driver to first restaurant
  if (optimizedRestaurants.length > 0) {
    totalDistance += haversineDistance(
      driverLoc.latitude,
      driverLoc.longitude,
      optimizedRestaurants[0].restaurant.latitude,
      optimizedRestaurants[0].restaurant.longitude,
    );

    // Restaurant to restaurant
    for (let i = 0; i < optimizedRestaurants.length - 1; i++) {
      totalDistance += haversineDistance(
        optimizedRestaurants[i].restaurant.latitude,
        optimizedRestaurants[i].restaurant.longitude,
        optimizedRestaurants[i + 1].restaurant.latitude,
        optimizedRestaurants[i + 1].restaurant.longitude,
      );
    }

    // Last restaurant to first customer
    if (optimizedCustomers.length > 0) {
      totalDistance += haversineDistance(
        optimizedRestaurants[optimizedRestaurants.length - 1].restaurant
          .latitude,
        optimizedRestaurants[optimizedRestaurants.length - 1].restaurant
          .longitude,
        optimizedCustomers[0].customer.latitude,
        optimizedCustomers[0].customer.longitude,
      );

      // Customer to customer
      for (let i = 0; i < optimizedCustomers.length - 1; i++) {
        totalDistance += haversineDistance(
          optimizedCustomers[i].customer.latitude,
          optimizedCustomers[i].customer.longitude,
          optimizedCustomers[i + 1].customer.latitude,
          optimizedCustomers[i + 1].customer.longitude,
        );
      }
    }
  }

  // Rough estimate: average speed ~30 km/h
  const estimatedTime = Math.ceil(totalDistance / 1000 / 0.5); // minutes

  return {
    totalDistance: (totalDistance / 1000).toFixed(2),
    estimatedTime,
  };
};
