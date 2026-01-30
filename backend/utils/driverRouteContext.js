/**
 * ============================================================================
 * DRIVER ROUTE CONTEXT UTILITIES
 * ============================================================================
 *
 * Core logic for treating deliveries as route extensions, not separate trips
 *
 * Key concept: Every driver has ONE route with multiple ordered stops
 * Available Deliveries = simulate adding new stops to existing route
 * Active Deliveries = show current route with all accepted stops
 *
 * ============================================================================
 */

import { supabaseAdmin } from "../supabaseAdmin.js";

// ============================================================================
// 1. GET DRIVER'S CURRENT ROUTE CONTEXT
// ============================================================================
/**
 * Fetch the complete route context for a driver:
 * - Current driver location
 * - All accepted deliveries
 * - Ordered stops (restaurant → customer → restaurant → customer)
 *
 * Returns:
 * {
 *   driver_location: { latitude, longitude },
 *   stops: [
 *     { delivery_id, stop_type, latitude, longitude, stop_order, ... },
 *     ...
 *   ],
 *   total_stops: number,
 *   next_stop_order: number (for new insertions)
 * }
 */
export async function getDriverRouteContext(
  driverId,
  driverLatitude = null,
  driverLongitude = null,
) {
  console.log(`\n[ROUTE CONTEXT] 🔍 Fetching route for driver: ${driverId}`);

  try {
    // Step 1: Get driver's current location from most recent delivery
    console.log(`[ROUTE CONTEXT] → Step 1: Get driver's current location`);
    const { data: activeDelivery, error: locationError } = await supabaseAdmin
      .from("deliveries")
      .select("driver_latitude, driver_longitude")
      .eq("driver_id", driverId)
      .in("status", ["accepted", "picking_up", "picked_up", "delivering"])
      .order("last_location_update", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Prefer: 1) Query params (most recent), 2) Active delivery location, 3) null
    // Query params from driver's device are more current than DB values
    const driverLat = driverLatitude ?? activeDelivery?.driver_latitude ?? null;
    const driverLng =
      driverLongitude ?? activeDelivery?.driver_longitude ?? null;

    console.log(
      `[ROUTE CONTEXT]   ✓ Driver location: lat=${driverLat}, lng=${driverLng}`,
    );
    if (driverLatitude && driverLongitude) {
      console.log(`[ROUTE CONTEXT]     (using coordinates from query params)`);
    } else if (activeDelivery?.driver_latitude) {
      console.log(
        `[ROUTE CONTEXT]     (using coordinates from active delivery)`,
      );
    }

    // Step 2: Get all ordered stops for this driver (ONLY for active deliveries)
    console.log(
      `[ROUTE CONTEXT] → Step 2: Get stops from ACTIVE deliveries only (not delivered)`,
    );

    // First, let's check what's in delivery_stops for this driver (debug query)
    const { data: allStops, error: allStopsError } = await supabaseAdmin
      .from("delivery_stops")
      .select("*")
      .eq("driver_id", driverId);

    console.log(
      `[ROUTE CONTEXT]   📊 Debug: All stops in delivery_stops for driver: ${allStops?.length || 0}`,
    );
    if (allStops && allStops.length > 0) {
      allStops.forEach((s, i) => {
        console.log(
          `[ROUTE CONTEXT]     Stop ${i + 1}: delivery_id=${s.delivery_id}, type=${s.stop_type}, order=${s.stop_order}`,
        );
      });
    }

    // Now get stops with delivery status filter
    const { data: stops, error: stopsError } = await supabaseAdmin
      .from("delivery_stops")
      .select(
        `
        id,
        delivery_id,
        stop_type,
        latitude,
        longitude,
        stop_order,
        created_at,
        deliveries!inner (
          id,
          order_id,
          status,
          orders (
            order_number,
            restaurant_name,
            restaurant_address,
            customer_name,
            customer_phone,
            delivery_address
          )
        )
      `,
      )
      .eq("driver_id", driverId)
      .in("deliveries.status", [
        "placed",
        "pending",
        "accepted",
        "picked_up",
        "on_the_way",
        "at_customer",
      ])
      .order("stop_order", { ascending: true });

    if (stopsError) {
      console.error(
        `[ROUTE CONTEXT] ❌ Error fetching stops: ${stopsError.message}`,
      );
      // Don't throw, return empty stops instead
      console.log(`[ROUTE CONTEXT]   ⚠️ Returning empty stops due to error`);
    }

    console.log(
      `[ROUTE CONTEXT]   ✓ Found ${stops?.length || 0} ACTIVE stops in route`,
    );
    if (stops && stops.length > 0) {
      stops.forEach((stop) => {
        const delivery = stop.deliveries;
        console.log(
          `[ROUTE CONTEXT]     - Stop #${stop.stop_order}: ${stop.stop_type.toUpperCase()} at (${stop.latitude}, ${stop.longitude}) [Status: ${delivery?.status}]`,
        );
      });
    }

    // Step 3: Calculate next stop order
    const nextStopOrder = (stops?.length || 0) + 1;
    console.log(
      `[ROUTE CONTEXT]   ✓ Next stop order will be: ${nextStopOrder}`,
    );

    // Return complete route context
    const routeContext = {
      driver_id: driverId,
      driver_location: {
        latitude: driverLat,
        longitude: driverLng,
      },
      stops: stops || [],
      total_stops: stops?.length || 0,
      next_stop_order: nextStopOrder,
    };

    console.log(`[ROUTE CONTEXT] ✅ Route context ready`, {
      total_stops: routeContext.total_stops,
      next_stop_order: routeContext.next_stop_order,
    });

    return routeContext;
  } catch (error) {
    console.error(`[ROUTE CONTEXT] ❌ Error: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// 2. INSERT STOPS INTO DRIVER'S ROUTE
// ============================================================================
/**
 * When driver accepts a delivery, insert 2 stops into their route:
 * - Stop 1: Restaurant (pickup)
 * - Stop 2: Customer (dropoff)
 *
 * This is atomic and maintains the route's sequential stop_order
 */
export async function insertDeliveryStopsIntoRoute(
  driverId,
  deliveryId,
  restaurantLat,
  restaurantLng,
  customerLat,
  customerLng,
) {
  console.log(
    `\n[INSERT STOPS] 🔄 Inserting stops for delivery: ${deliveryId}`,
  );
  console.log(`[INSERT STOPS]   Driver ID: ${driverId}`);

  // Debug: Check if delivery_stops table exists and we can query it
  console.log(
    `[INSERT STOPS] → Table check: Testing delivery_stops table access...`,
  );
  const { data: testQuery, error: testError } = await supabaseAdmin
    .from("delivery_stops")
    .select("id")
    .limit(1);

  if (testError) {
    console.error(`[INSERT STOPS] ❌ TABLE ERROR: ${testError.message}`);
    console.error(
      `[INSERT STOPS]   This suggests delivery_stops table does not exist!`,
    );
    console.error(
      `[INSERT STOPS]   Run the SQL from: database/delivery_stops_table.sql`,
    );
    throw new Error(`delivery_stops table error: ${testError.message}`);
  }
  console.log(
    `[INSERT STOPS]   ✓ Table accessible (found ${testQuery?.length || 0} existing rows)`,
  );
  console.log(
    `[INSERT STOPS]   Restaurant: (${restaurantLat}, ${restaurantLng})`,
  );
  console.log(`[INSERT STOPS]   Customer: (${customerLat}, ${customerLng})`);

  try {
    // Step 1: Get current route context
    console.log(`[INSERT STOPS] → Step 1: Get current route context`);
    const routeContext = await getDriverRouteContext(driverId);
    const nextOrder = routeContext.next_stop_order;
    console.log(
      `[INSERT STOPS]   Current stops: ${routeContext.total_stops}, Next order: ${nextOrder}`,
    );

    // Step 2: Insert restaurant stop
    console.log(
      `[INSERT STOPS] → Step 2: Insert restaurant stop at order ${nextOrder}`,
    );
    const { data: restaurantStop, error: restaurantError } = await supabaseAdmin
      .from("delivery_stops")
      .insert({
        driver_id: driverId,
        delivery_id: deliveryId,
        stop_type: "restaurant",
        latitude: restaurantLat,
        longitude: restaurantLng,
        stop_order: nextOrder,
      })
      .select();

    if (restaurantError) {
      console.error(
        `[INSERT STOPS] ❌ Restaurant stop error: ${restaurantError.message}`,
      );
      console.error(
        `[INSERT STOPS]   Error details:`,
        JSON.stringify(restaurantError, null, 2),
      );
      throw restaurantError;
    }

    console.log(
      `[INSERT STOPS]   ✓ Restaurant stop inserted at order ${nextOrder}`,
    );
    console.log(`[INSERT STOPS]   Restaurant stop data:`, restaurantStop);

    // Step 3: Insert customer stop
    console.log(
      `[INSERT STOPS] → Step 3: Insert customer stop at order ${nextOrder + 1}`,
    );
    const { data: customerStop, error: customerError } = await supabaseAdmin
      .from("delivery_stops")
      .insert({
        driver_id: driverId,
        delivery_id: deliveryId,
        stop_type: "customer",
        latitude: customerLat,
        longitude: customerLng,
        stop_order: nextOrder + 1,
      })
      .select();

    if (customerError) {
      console.error(
        `[INSERT STOPS] ❌ Customer stop error: ${customerError.message}`,
      );
      console.error(
        `[INSERT STOPS]   Error details:`,
        JSON.stringify(customerError, null, 2),
      );
      throw customerError;
    }

    console.log(
      `[INSERT STOPS]   ✓ Customer stop inserted at order ${nextOrder + 1}`,
    );
    console.log(`[INSERT STOPS]   Customer stop data:`, customerStop);

    console.log(`[INSERT STOPS] ✅ Both stops inserted successfully`);

    return {
      restaurant_stop_order: nextOrder,
      customer_stop_order: nextOrder + 1,
    };
  } catch (error) {
    console.error(`[INSERT STOPS] ❌ Error: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// 3. GET FORMATTED ACTIVE DELIVERIES (with ordered stops)
// ============================================================================
/**
 * Return driver's active deliveries organized by their stops
 * Frontend displays this as the current route
 */
export async function getFormattedActiveDeliveries(
  driverId,
  driverLatitude = null,
  driverLongitude = null,
) {
  console.log(
    `\n[ACTIVE DELIVERIES] 📦 Fetching formatted active deliveries for driver: ${driverId}`,
  );

  try {
    // Get the route context
    const routeContext = await getDriverRouteContext(
      driverId,
      driverLatitude,
      driverLongitude,
    );

    console.log(
      `[ACTIVE DELIVERIES] → Processing ${routeContext.total_stops} stops`,
    );

    // Calculate full route geometry if we have stops
    let fullRouteGeometry = null;
    if (
      routeContext.stops.length > 0 &&
      routeContext.driver_location.latitude &&
      routeContext.driver_location.longitude
    ) {
      try {
        const waypoints = [
          {
            lat: routeContext.driver_location.latitude,
            lng: routeContext.driver_location.longitude,
          },
          ...routeContext.stops.map((stop) => ({
            lat: stop.latitude,
            lng: stop.longitude,
          })),
        ];

        const coordinates = waypoints
          .map((wp) => `${wp.lng},${wp.lat}`)
          .join(";");
        const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;

        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.routes && data.routes[0]) {
            fullRouteGeometry = data.routes[0].geometry;
            console.log(`[ACTIVE DELIVERIES] → Full route geometry calculated`);
          }
        }
      } catch (error) {
        console.log(
          `[ACTIVE DELIVERIES] ⚠️ Could not calculate route geometry: ${error.message}`,
        );
      }
    }

    // Group stops by delivery
    const deliveriesByStop = {};

    routeContext.stops.forEach((stop) => {
      if (!deliveriesByStop[stop.delivery_id]) {
        deliveriesByStop[stop.delivery_id] = {
          delivery_id: stop.delivery_id,
          order_number: stop.deliveries.orders?.order_number || "N/A",
          delivery_status: stop.deliveries.status,
          restaurant: {
            name: stop.deliveries.orders?.restaurant_name || "N/A",
            address: stop.deliveries.orders?.restaurant_address || "N/A",
          },
          customer: {
            name: stop.deliveries.orders?.customer_name || "N/A",
            phone: stop.deliveries.orders?.customer_phone || "N/A",
            address: stop.deliveries.orders?.delivery_address || "N/A",
          },
          stops: [],
        };
      }

      deliveriesByStop[stop.delivery_id].stops.push({
        stop_order: stop.stop_order,
        stop_type: stop.stop_type,
        latitude: stop.latitude,
        longitude: stop.longitude,
      });
    });

    const formattedDeliveries = Object.values(deliveriesByStop).map(
      (delivery) => {
        // Sort stops by order
        delivery.stops.sort((a, b) => a.stop_order - b.stop_order);

        console.log(
          `[ACTIVE DELIVERIES]   - Order ${delivery.order_number}: ${delivery.stops.length} stops`,
        );

        return delivery;
      },
    );

    console.log(
      `[ACTIVE DELIVERIES] ✅ Formatted ${formattedDeliveries.length} deliveries`,
    );

    return {
      driver_location: routeContext.driver_location,
      active_deliveries: formattedDeliveries,
      total_deliveries: formattedDeliveries.length,
      total_stops: routeContext.total_stops,
      route_geometry: fullRouteGeometry, // Include full route geometry
    };
  } catch (error) {
    console.error(`[ACTIVE DELIVERIES] ❌ Error: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// 4. REMOVE DELIVERY STOPS (when delivery is completed or cancelled)
// ============================================================================
/**
 * Clean up stops when a delivery is no longer active
 */
export async function removeDeliveryStops(deliveryId) {
  console.log(`\n[REMOVE STOPS] 🗑️ Removing stops for delivery: ${deliveryId}`);

  try {
    const { error } = await supabaseAdmin
      .from("delivery_stops")
      .delete()
      .eq("delivery_id", deliveryId);

    if (error) {
      console.error(`[REMOVE STOPS] ❌ Error: ${error.message}`);
      throw error;
    }

    console.log(`[REMOVE STOPS] ✅ Stops removed successfully`);
  } catch (error) {
    console.error(`[REMOVE STOPS] ❌ Error: ${error.message}`);
    throw error;
  }
}
