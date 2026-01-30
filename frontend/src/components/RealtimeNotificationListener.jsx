import { useEffect } from "react";
import { useNotification } from "../contexts/NotificationContext";
import supabaseClient from "../supabaseClient";

const RealtimeNotificationListener = () => {
  const { addNotification } = useNotification();

  useEffect(() => {
    // Subscribe to new orders (deliveries with status = placed)
    const channel = supabaseClient
      .channel("deliveries:order-placed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deliveries",
          filter: "status=eq.placed",
        },
        (payload) => {
          const delivery = payload.new;
          const customerName = delivery.customer_name || "New Customer";

          // Show notification to admin
          addNotification(`🔔 New order from ${customerName}!`, "info", 5000);
        },
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [addNotification]);

  // This component doesn't render anything, just listens to events
  return null;
};

export default RealtimeNotificationListener;
