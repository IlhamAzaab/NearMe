import { useEffect } from "react";
import { useNotification } from "../contexts/NotificationContext";
import supabaseClient from "../supabaseClient";

const DriverDeliveryNotificationListener = () => {
  const { addNotification } = useNotification();

  useEffect(() => {
    // Check if user is a driver
    const role = localStorage.getItem("role");
    if (role !== "driver") {
      return;
    }

    // Subscribe to new pending deliveries (admin accepted orders waiting for driver to claim)
    const channel = supabaseClient
      .channel("deliveries:driver-pending")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deliveries",
          filter: "status=eq.pending",
        },
        (payload) => {
          const delivery = payload.new;
          const restaurantName = delivery.restaurant_name || "Restaurant";
          const customerName = delivery.customer_name || "Customer";

          // Show green success notification to driver - new delivery arrived
          addNotification(
            `✓ New delivery from ${restaurantName} to ${customerName}!`,
            "success",
            5000,
          );
        },
      )
      .subscribe();

    // Also listen for UPDATE events to catch status changes to pending
    const updateChannel = supabaseClient
      .channel("deliveries:driver-pending-update")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "deliveries",
          filter: "status=eq.pending",
        },
        (payload) => {
          const delivery = payload.new;

          // Only show notification if status changed TO pending (not already was pending)
          if (payload.old && payload.old.status !== "pending") {
            const restaurantName = delivery.restaurant_name || "Restaurant";
            const customerName = delivery.customer_name || "Customer";

            // Show green success notification
            addNotification(
              `✓ New delivery from ${restaurantName} to ${customerName}!`,
              "success",
              5000,
            );
          }
        },
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabaseClient.removeChannel(channel);
      supabaseClient.removeChannel(updateChannel);
    };
  }, [addNotification]);

  // This component doesn't render anything, just listens to events
  return null;
};

export default DriverDeliveryNotificationListener;
