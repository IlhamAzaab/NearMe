import { useEffect } from "react";
import { useNotification } from "../contexts/NotificationContext";
import supabaseClient from "../supabaseClient";

const DriverRealtimeNotificationListener = ({ onNewDelivery }) => {
  const { addNotification } = useNotification();

  useEffect(() => {
    // Subscribe to new pending deliveries (accepted by admin, waiting for driver to claim)
    const channel = supabaseClient
      .channel("deliveries:pending")
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

          // Show notification to driver
          addNotification(
            `📦 New delivery from ${restaurantName} to ${customerName}!`,
            "info",
            5000,
          );

          // Trigger refresh of deliveries list
          if (onNewDelivery) {
            onNewDelivery();
          }
        },
      )
      .subscribe();

    // Also listen for UPDATE events in case status changes
    const updateChannel = supabaseClient
      .channel("deliveries:pending-update")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "deliveries",
          filter: "status=eq.pending",
        },
        (payload) => {
          // Refresh deliveries list on any updates to pending deliveries
          if (onNewDelivery) {
            onNewDelivery();
          }
        },
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabaseClient.removeChannel(channel);
      supabaseClient.removeChannel(updateChannel);
    };
  }, [addNotification, onNewDelivery]);

  // This component doesn't render anything, just listens to events
  return null;
};

export default DriverRealtimeNotificationListener;
