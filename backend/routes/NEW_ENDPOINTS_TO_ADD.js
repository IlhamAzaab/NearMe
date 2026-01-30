/**
 * ============================================================================
 * NEW ENDPOINTS FOR ROUTE-BASED DELIVERY SYSTEM
 * ============================================================================
 *
 * To be added to backend/routes/driverDelivery.js
 *
 * These endpoints integrate with the new delivery_stops table and
 * route context logic to implement Uber Eats-style delivery management
 *
 * ============================================================================
 */

// At the top of driverDelivery.js, add these imports:
import {
  getDriverRouteContext,
  insertDeliveryStopsIntoRoute,
  getFormattedActiveDeliveries,
  removeDeliveryStops,
} from "../utils/driverRouteContext.js";
import { getAvailableDeliveriesForDriver } from "../utils/availableDeliveriesLogic.js";

// ============================================================================
// NEW ENDPOINT 1: GET /driver/deliveries/available/v2
// ============================================================================
// NEW VERSION: Shows available deliveries as route extensions
// Returns only deliveries that fit within driver's current route
// with calculated extra distance/time/earnings
//
// Response:
// {
//   available_deliveries: [
//     {
//       delivery_id,
//       order_number,
//       restaurant: { name, address, latitude, longitude },
//       customer: { name, phone, address, latitude, longitude },
//       route_impact: {
//         extra_distance_km,
//         extra_time_minutes,
//         extra_earnings
//       },
//       pricing: { subtotal, delivery_fee, service_fee, total }
//     }
//   ],
//   total_available: number,
//   driver_location: { latitude, longitude },
//   current_route: {
//     total_stops: number,
//     active_deliveries: number
//   }
// }

router.get(
  "/deliveries/available/v2",
  authenticate,
  driverOnly,
  async (req, res) => {
    const driverId = req.user.id;
    const { driver_latitude, driver_longitude } = req.query;

    console.log(`\n\n${"=".repeat(100)}`);
    console.log(`[ENDPOINT] GET /driver/deliveries/available/v2`);
    console.log(`[DRIVER] ${driverId}`);
    console.log(`[LOCATION] lat=${driver_latitude}, lng=${driver_longitude}`);
    console.log(`${"=".repeat(100)}`);

    try {
      const availableDeliveries = await getAvailableDeliveriesForDriver(
        driverId,
        driver_latitude ? parseFloat(driver_latitude) : null,
        driver_longitude ? parseFloat(driver_longitude) : null,
        getRouteDistance, // Pass the OSRM helper function
      );

      return res.json(availableDeliveries);
    } catch (error) {
      console.error(`[ENDPOINT] ❌ Error: ${error.message}`);
      return res.status(500).json({
        message: "Failed to fetch available deliveries",
        error: error.message,
      });
    }
  },
);

// ============================================================================
// MODIFIED ENDPOINT: POST /driver/deliveries/:id/accept
// ============================================================================
// ENHANCED: Now inserts stops into delivery_stops table
// Previous behavior: Update delivery status
// New behavior: Update delivery status + create delivery_stops rows
//
// This modification adds these steps:
// 1. Update delivery (existing code)
// 2. Extract restaurant/customer locations from order
// 3. Insert both stops into delivery_stops table with sequential stop_order
// 4. Log each step to console
//
// Implementation:
// Replace the existing accept endpoint with this modified version:

// router.post(
//   "/deliveries/:id/accept",
//   authenticate,
//   driverOnly,
//   async (req, res) => {
//     const deliveryId = req.params.id;
//     const { driver_latitude, driver_longitude } = req.body;

//     console.log(`\n${"=".repeat(80)}`);
//     console.log(`[ACCEPT DELIVERY] ✅ Accepting delivery: ${deliveryId}`);
//     console.log(`[DRIVER] ${req.user.id}`);
//     console.log(`${"=".repeat(80)}`);

//     try {
//       // EXISTING CODE: Check if driver is in delivering mode
//       const { data: deliveringCheck } = await supabaseAdmin
//         .from("deliveries")
//         .select("id, status")
//         .eq("driver_id", req.user.id)
//         .in("status", ["picked_up", "on_the_way", "at_customer"])
//         .limit(1);

//       if (deliveringCheck && deliveringCheck.length > 0) {
//         return res.status(400).json({
//           message:
//             "Cannot accept new deliveries while in delivering mode. Complete current deliveries first.",
//           in_delivering_mode: true,
//         });
//       }

//       // EXISTING CODE: Atomically assign delivery
//       console.log(`[ACCEPT DELIVERY] → Step 1: Update delivery status`);
//       const { data: updated, error } = await supabaseAdmin
//         .from("deliveries")
//         .update({
//           driver_id: req.user.id,
//           status: "accepted",
//           assigned_at: new Date().toISOString(),
//           accepted_at: new Date().toISOString(),
//           current_latitude: driver_latitude || null,
//           current_longitude: driver_longitude || null,
//           last_location_update: new Date().toISOString(),
//         })
//         .eq("id", deliveryId)
//         .is("driver_id", null)
//         .eq("status", "pending")
//         .select(
//           `id, order_id, status, assigned_at, orders (
//           id,
//           order_number,
//           restaurant_name,
//           restaurant_address,
//           restaurant_latitude,
//           restaurant_longitude,
//           delivery_address,
//           delivery_city,
//           delivery_latitude,
//           delivery_longitude,
//           total_amount,
//           distance_km,
//           customer_id,
//           customer_name,
//           customer_phone,
//           restaurant_id
//         ), drivers!driver_id (full_name, phone, profile_photo_url)`,
//         )
//         .maybeSingle();

//       if (error) {
//         console.error(`[ACCEPT DELIVERY] ❌ Database error: ${error.message}`);
//         return res.status(500).json({ message: "Failed to accept delivery" });
//       }

//       if (!updated) {
//         console.log(`[ACCEPT DELIVERY] ⚠️  Delivery already taken or not available`);
//         return res
//           .status(409)
//           .json({ message: "Delivery already taken or not available" });
//       }

//       console.log(
//         `[ACCEPT DELIVERY]   ✓ Delivery status updated to 'accepted'`,
//       );

//       // NEW CODE: Insert delivery stops into route
//       console.log(
//         `[ACCEPT DELIVERY] → Step 2: Insert stops into driver's route`,
//       );

//       const restaurantLat = parseFloat(
//         updated.orders.restaurant_latitude,
//       );
//       const restaurantLng = parseFloat(
//         updated.orders.restaurant_longitude,
//       );
//       const customerLat = parseFloat(
//         updated.orders.delivery_latitude,
//       );
//       const customerLng = parseFloat(
//         updated.orders.delivery_longitude,
//       );

//       await insertDeliveryStopsIntoRoute(
//         req.user.id,
//         updated.id,
//         restaurantLat,
//         restaurantLng,
//         customerLat,
//         customerLng,
//       );

//       console.log(
//         `[ACCEPT DELIVERY]   ✓ Stops inserted into delivery_stops table`,
//       );

//       // EXISTING CODE: Notifications
//       console.log(
//         `[ACCEPT DELIVERY] → Step 3: Send notifications`,
//       );

//       const notifications = [];
//       const driverInfo = {
//         driver_id: req.user.id,
//         driver_name: updated.drivers?.full_name || "Driver",
//         driver_phone: updated.drivers?.phone,
//         driver_photo: updated.drivers?.profile_photo_url,
//       };

//       if (updated.orders?.customer_id) {
//         notifications.push({
//           recipient_id: updated.orders.customer_id,
//           type: "driver_assigned",
//           title: "Driver Assigned!",
//           message: `${driverInfo.driver_name} has accepted your order #${updated.orders.order_number}.`,
//           metadata: JSON.stringify({
//             order_id: updated.order_id,
//             driver: driverInfo,
//           }),
//         });
//       }

//       if (updated.orders?.restaurant_id) {
//         notifications.push({
//           recipient_id: updated.orders.restaurant_id,
//           type: "driver_assigned",
//           title: "Driver on the way",
//           message: `${driverInfo.driver_name} is coming to pick up order #${updated.orders.order_number}.`,
//           metadata: JSON.stringify({
//             order_id: updated.order_id,
//             driver: driverInfo,
//           }),
//         });
//       }

//       if (notifications.length > 0) {
//         await supabaseAdmin.from("notifications").insert(notifications);
//       }

//       console.log(`[ACCEPT DELIVERY]   ✓ Notifications sent`);

//       // Return response
//       console.log(`[ACCEPT DELIVERY] ✅ Delivery accepted successfully`);
//       console.log(`${"=".repeat(80)}\n`);

//       return res.json({
//         message: "Delivery accepted successfully",
//         delivery: {
//           delivery_id: updated.id,
//           order_id: updated.order_id,
//           order_number: updated.orders.order_number,
//           restaurant: {
//             name: updated.orders.restaurant_name,
//             address: updated.orders.restaurant_address,
//             latitude: restaurantLat,
//             longitude: restaurantLng,
//           },
//           delivery: {
//             address: updated.orders.delivery_address,
//             latitude: customerLat,
//             longitude: customerLng,
//           },
//           customer: {
//             name: updated.orders.customer_name,
//             phone: updated.orders.customer_phone,
//           },
//           driver: driverInfo,
//         },
//       });
//     } catch (error) {
//       console.error(`[ACCEPT DELIVERY] ❌ Error: ${error.message}`);
//       return res.status(500).json({ message: "Server error" });
//     }
//   },
// );

// ============================================================================
// NEW ENDPOINT 2: GET /driver/deliveries/active/v2
// ============================================================================
// NEW VERSION: Returns active deliveries with properly ordered stops
//
// This endpoint queries the delivery_stops table and returns:
// - Driver's current location
// - Ordered list of stops (restaurant → customer → restaurant → customer)
// - Each stop with location, delivery details, order info
//
// Response:
// {
//   driver_location: { latitude, longitude },
//   active_deliveries: [
//     {
//       delivery_id,
//       order_number,
//       delivery_status,
//       restaurant: { name, address },
//       customer: { name, phone, address },
//       stops: [
//         { stop_order: 1, stop_type: 'restaurant', latitude, longitude },
//         { stop_order: 2, stop_type: 'customer', latitude, longitude },
//         ...
//       ]
//     }
//   ],
//   total_deliveries: number,
//   total_stops: number
// }

router.get(
  "/deliveries/active/v2",
  authenticate,
  driverOnly,
  async (req, res) => {
    const driverId = req.user.id;

    console.log(`\n${"=".repeat(80)}`);
    console.log(`[ACTIVE DELIVERIES V2] 📦 Fetching active deliveries`);
    console.log(`[DRIVER] ${driverId}`);
    console.log(`${"=".repeat(80)}`);

    try {
      const formattedDeliveries = await getFormattedActiveDeliveries(driverId);

      console.log(`${"=".repeat(80)}\n`);
      return res.json(formattedDeliveries);
    } catch (error) {
      console.error(`[ACTIVE DELIVERIES V2] ❌ Error: ${error.message}`);
      return res.status(500).json({
        message: "Failed to fetch active deliveries",
        error: error.message,
      });
    }
  },
);

// ============================================================================
// NEW ENDPOINT 3: GET /driver/route-context
// ============================================================================
// Debug endpoint: Returns raw route context data
// Useful for frontend debugging and understanding driver's current route

router.get("/route-context", authenticate, driverOnly, async (req, res) => {
  const driverId = req.user.id;

  console.log(`\n[ROUTE CONTEXT] 🔍 Debug endpoint called`);

  try {
    const routeContext = await getDriverRouteContext(driverId);
    return res.json(routeContext);
  } catch (error) {
    console.error(`[ROUTE CONTEXT] ❌ Error: ${error.message}`);
    return res.status(500).json({
      message: "Failed to fetch route context",
      error: error.message,
    });
  }
});

// ============================================================================
// IMPLEMENTATION CHECKLIST
// ============================================================================
//
// To fully implement this system:
//
// 1. ✅ CREATE delivery_stops table
//    - Run: database/delivery_stops_table.sql
//
// 2. ✅ CREATE utility functions
//    - backend/utils/driverRouteContext.js (already created)
//    - backend/utils/availableDeliveriesLogic.js (already created)
//
// 3. ⏳ UPDATE driverDelivery.js
//    - Add imports at the top
//    - Add new endpoints (1, 2, 3 above)
//    - Modify POST /driver/deliveries/:id/accept (see commented code above)
//
// 4. ⏳ UPDATE frontend
//    - Create new "AvailableDeliveries-v2.jsx" component
//    - Update to use /deliveries/available/v2 endpoint
//    - Display extra_distance_km, extra_time_minutes, extra_earnings
//    - Add route preview functionality
//
// 5. ⏳ UPDATE frontend
//    - Modify ActiveDeliveries.jsx to use /deliveries/active/v2
//    - Display ordered stops from delivery_stops table
//    - Show stops in proper sequence with stop_order
//
// 6. ⏳ TEST
//    - Run database migrations
//    - Test accept delivery endpoint (should populate delivery_stops)
//    - Test available deliveries (should evaluate as route extensions)
//    - Test active deliveries (should show ordered stops)
//    - Check console output for debugging
//
// ============================================================================
