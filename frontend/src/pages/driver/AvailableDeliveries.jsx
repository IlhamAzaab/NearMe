/**
 * Driver Available Deliveries Page
 *
 * Features:
 * - List of available deliveries waiting for driver
 * - Real-time notifications for new orders
 * - Atomic order acceptance (prevents race conditions)
 * - Shows pickup location, delivery distance, payment
 */

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import DriverLayout from "../../components/DriverLayout";

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default function AvailableDeliveries() {
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(null);
  const [driverId, setDriverId] = useState(null);
  const [notifications, setNotifications] = useState([]);

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    const role = localStorage.getItem("role");
    const userId = localStorage.getItem("userId");

    if (role !== "driver") {
      navigate("/login");
      return;
    }

    setDriverId(userId);
  }, [navigate]);

  // ============================================================================
  // FETCH AVAILABLE DELIVERIES
  // ============================================================================

  const fetchDeliveries = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        "http://localhost:5000/driver/deliveries/available",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (response.ok) {
        setDeliveries(data.deliveries || []);
      } else {
        console.error("Failed to fetch deliveries:", data.message);
      }
    } catch (error) {
      console.error("Fetch deliveries error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (driverId) {
      fetchDeliveries();
      // Refresh every 30 seconds
      const interval = setInterval(fetchDeliveries, 30000);
      return () => clearInterval(interval);
    }
  }, [driverId, fetchDeliveries]);

  // ============================================================================
  // REAL-TIME NOTIFICATIONS FOR NEW ORDERS
  // ============================================================================

  useEffect(() => {
    if (!supabase || !driverId) return;

    const channel = supabase
      .channel("driver-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("New notification:", payload);
          if (payload.new.type === "new_order") {
            // Show notification toast
            showNotification(payload.new);
            // Play sound
            playNotificationSound();
            // Refresh deliveries list
            fetchDeliveries();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, fetchDeliveries]);

  const showNotification = (notification) => {
    const toast = {
      id: Date.now(),
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata,
    };

    setNotifications((prev) => [toast, ...prev]);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== toast.id));
    }, 10000);
  };

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      gainNode.gain.value = 0.3;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.15);

      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 1100;
        osc2.type = "sine";
        gain2.gain.value = 0.3;
        osc2.start();
        osc2.stop(audioContext.currentTime + 0.15);
      }, 200);
    } catch (error) {
      console.log("Sound error:", error);
    }
  };

  // ============================================================================
  // ACCEPT DELIVERY
  // ============================================================================

  const acceptDelivery = async (deliveryId) => {
    setAccepting(deliveryId);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5000/driver/deliveries/${deliveryId}/accept`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (response.ok) {
        // Navigate to tracking page
        navigate("/driver/delivery/active");
      } else {
        // Show error (likely "already taken")
        alert(data.message || "Failed to accept delivery");
        // Refresh list
        fetchDeliveries();
      }
    } catch (error) {
      console.error("Accept delivery error:", error);
      alert("Failed to accept delivery");
    } finally {
      setAccepting(null);
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return "";
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return then.toLocaleDateString();
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <DriverLayout>
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-blue-600 text-white p-4 sticky top-0 z-40">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Available Deliveries</h1>
              <p className="text-blue-100 text-sm">
                {deliveries.length} orders waiting
              </p>
            </div>
            <button
              onClick={fetchDeliveries}
              className="p-2 bg-blue-500 rounded-lg hover:bg-blue-400"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Notification Toasts */}
        {notifications.length > 0 && (
          <div className="fixed top-20 right-4 z-50 space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="bg-white rounded-xl shadow-2xl border-l-4 border-green-500 p-4 max-w-sm animate-slide-in"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-xl">🛵</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{n.title}</p>
                    <p className="text-sm text-gray-600">{n.message}</p>
                  </div>
                  <button
                    onClick={() =>
                      setNotifications((prev) =>
                        prev.filter((x) => x.id !== n.id)
                      )
                    }
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading deliveries...</p>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">📦</span>
              </div>
              <p className="text-xl font-medium text-gray-800">
                No deliveries available
              </p>
              <p className="text-gray-500 mt-1">
                New orders will appear here automatically
              </p>
            </div>
          ) : (
            deliveries.map((delivery) => (
              <div
                key={delivery.delivery_id}
                className="bg-white rounded-xl shadow-lg overflow-hidden"
              >
                {/* Restaurant Info */}
                <div className="p-4 bg-gradient-to-r from-orange-500 to-red-500 text-white">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">🍽️</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg">
                        {delivery.restaurant.name}
                      </h3>
                      <p className="text-white/80 text-sm truncate">
                        {delivery.restaurant.address}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">
                        Rs. {delivery.total_amount.toFixed(0)}
                      </p>
                      <p className="text-white/80 text-xs">
                        {getTimeAgo(delivery.placed_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Delivery Info */}
                <div className="p-4 space-y-3">
                  {/* Pickup → Delivery Route */}
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div className="w-0.5 h-8 bg-gray-300"></div>
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-xs text-gray-500 uppercase">
                          Pickup
                        </p>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {delivery.restaurant.address}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase">
                          Drop-off
                        </p>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {delivery.delivery.address}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between py-3 border-t border-gray-100">
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-600">
                        {delivery.distance_km.toFixed(1)} km
                      </p>
                      <p className="text-xs text-gray-500">Distance</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-purple-600">
                        ~{delivery.estimated_duration_min} min
                      </p>
                      <p className="text-xs text-gray-500">Est. Time</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-600">
                        {delivery.order_status.toUpperCase()}
                      </p>
                      <p className="text-xs text-gray-500">Status</p>
                    </div>
                  </div>

                  {/* Accept Button */}
                  <button
                    onClick={() => acceptDelivery(delivery.delivery_id)}
                    disabled={accepting === delivery.delivery_id}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {accepting === delivery.delivery_id ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Accepting...
                      </>
                    ) : (
                      <>
                        <span>🚀</span>
                        Accept Delivery
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
      </div>
    </DriverLayout>
  );
}
