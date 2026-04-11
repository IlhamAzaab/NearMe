/**
 * Past Order Details Page
 *
 * Features:
 * - View complete order details for delivered/cancelled orders
 * - Restaurant info with logo
 * - Items list with quantities and prices
 * - Order summary with subtotal, delivery fee, taxes, total
 * - Reorder functionality
 */

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import {
  useAddToCartMutation,
  useCustomerCartCount,
  useCustomerOrderQuery,
} from "../hooks/useCustomerNotifications";

const PastOrderDetails = () => {
  const navigate = useNavigate();
  const { alert, visible, showError } = useAlert();
  const location = useLocation();
  const { orderId: paramOrderId } = useParams();

  // Get order data from navigation state
  const orderData = location.state || {};
  const { orderId: stateOrderId, order: stateOrder } = orderData;

  const orderId = paramOrderId || stateOrderId;
  const [order, setOrder] = useState(stateOrder || null);
  const orderQuery = useCustomerOrderQuery(orderId, {
    enabled: Boolean(orderId) && !stateOrder,
  });
  const cartCountQuery = useCustomerCartCount({ enabled: true });
  const addToCartMutation = useAddToCartMutation();
  const loading = !stateOrder ? orderQuery.isLoading : false;
  const cartCount = cartCountQuery.data || 0;

  // Fetch order details if not passed via state
  useEffect(() => {
    if (!order && orderQuery.data) {
      setOrder(orderQuery.data);
    }
  }, [order, orderQuery.data]);

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Get status icon and color
  const getStatusInfo = (status) => {
    switch (status) {
      case "delivered":
        return {
          icon: "check_circle",
          color: "text-green-500",
          label: "Delivered",
          bgColor: "bg-green-50",
        };
      case "cancelled":
      case "rejected":
        return {
          icon: "cancel",
          color: "text-red-500",
          label: "Cancelled",
          bgColor: "bg-red-50",
        };
      default:
        return {
          icon: "info",
          color: "text-gray-500",
          label: status,
          bgColor: "bg-gray-50",
        };
    }
  };

  // Calculate order totals
  const calculateTotals = () => {
    const items = order?.order_items || [];
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const deliveryFee = order?.delivery_fee || 50;
    const taxRate = 0.05; // 5% tax
    const taxes = subtotal * taxRate;
    const total = order?.total_amount || subtotal + deliveryFee + taxes;

    return { subtotal, deliveryFee, taxes, total };
  };

  // Handle reorder
  const handleReorder = async () => {
    try {
      const items = order?.order_items || [];

      // Add each item to cart
      for (const item of items) {
        await addToCartMutation.mutateAsync({
          foodId: item.food_id,
          quantity: item.quantity,
        });
      }

      navigate("/cart");
    } catch (error) {
      console.error("Reorder error:", error);
      showError("Failed to add items to cart");
    }
  };

  // Handle restaurant click
  const handleRestaurantClick = () => {
    if (order?.restaurant_id) {
      navigate(`/restaurant/${order.restaurant_id}/foods`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f8f6] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#13ec37] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f6f8f6] flex flex-col items-center justify-center">
        <span className="text-5xl mb-4">📋</span>
        <p className="text-gray-600">Order not found</p>
        <button
          onClick={() => navigate("/orders")}
          className="mt-4 px-6 py-2 bg-[#13ec37] text-white rounded-lg font-semibold"
        >
          Back to Orders
        </button>
      </div>
    );
  }

  const getDeliveryStatus = (orderData) => {
    const delivery = orderData?.deliveries?.[0] || orderData?.deliveries;
    return (
      delivery?.status ||
      orderData?.delivery_status ||
      orderData?.effective_status ||
      orderData?.status ||
      "placed"
    );
  };

  const statusInfo = getStatusInfo(getDeliveryStatus(order));
  const totals = calculateTotals();
  const items = order?.order_items || [];

  return (
    <div className="min-h-screen bg-[#f6f8f6] font-['Work_Sans',sans-serif]">
      <AnimatedAlert alert={alert} visible={visible} />
      {/* Container */}
      <div className="w-full max-w-md mx-auto bg-white min-h-screen shadow-lg flex flex-col relative overflow-x-hidden">
        {/* Top App Bar */}
        <div className="sticky top-0 z-10 flex items-center bg-white p-4 pb-2 justify-between border-b border-gray-100">
          <button
            onClick={() => navigate("/orders")}
            className="text-[#111812] flex size-12 shrink-0 items-center cursor-pointer hover:bg-gray-100 rounded-full transition"
          >
            <span className="material-symbols-outlined">arrow_back_ios</span>
          </button>
          <h2 className="text-[#111812] text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">
            Order Details
          </h2>
          <div className="flex w-12 items-center justify-end">
            <button className="text-[#13ec37] text-base font-bold leading-normal tracking-[0.015em] shrink-0 cursor-pointer hover:opacity-80 transition">
              Help
            </button>
          </div>
        </div>

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-y-auto pb-32">
          {/* Status Section */}
          <div className="px-4 pt-6">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`material-symbols-outlined ${statusInfo.color}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {statusInfo.icon}
              </span>
              <h3 className="text-[#111812] tracking-light text-2xl font-bold leading-tight">
                {statusInfo.label}
              </h3>
            </div>
            <p className="text-[#618968] text-sm font-normal leading-normal">
              {formatDate(order.delivered_at || order.placed_at)} • Order #
              {order.order_number}
            </p>
          </div>

          {/* Restaurant Section */}
          <div className="mt-6 border-b border-gray-100 pb-4">
            <div
              className="flex items-center gap-4 bg-white px-4 min-h-[72px] py-2 justify-between cursor-pointer hover:bg-gray-50 transition"
              onClick={handleRestaurantClick}
            >
              <div className="flex items-center gap-4">
                <div
                  className="bg-center bg-no-repeat aspect-square bg-cover rounded-lg size-14 shadow-sm bg-gray-100"
                  style={{
                    backgroundImage: order.restaurant_logo
                      ? `url("${order.restaurant_logo}")`
                      : "none",
                  }}
                >
                  {!order.restaurant_logo && (
                    <div className="w-full h-full flex items-center justify-center text-2xl">
                      🍽️
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[#111812] text-base font-bold leading-normal line-clamp-1">
                    {order.restaurant_name || "Restaurant"}
                  </p>
                  <p className="text-[#618968] text-sm font-normal leading-normal line-clamp-2">
                    {order.restaurant_address || "View restaurant"}
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                <div className="text-[#111812] flex size-7 items-center justify-center">
                  <span className="material-symbols-outlined">
                    chevron_right
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="px-4 pt-6">
            <h3 className="text-[#111812] text-lg font-bold leading-tight tracking-[-0.015em] mb-4">
              Your Items
            </h3>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <span className="font-bold text-[#13ec37]">
                      {item.quantity}x
                    </span>
                    <div>
                      <p className="font-medium text-[#111812]">{item.name}</p>
                      {item.notes && (
                        <p className="text-xs text-gray-500">{item.notes}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-[#111812]">
                    Rs. {(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Receipt Divider */}
          <div className="px-4 py-6">
            <div className="border-t border-dashed border-gray-300"></div>
          </div>

          {/* Summary */}
          <div className="px-4 space-y-3">
            <div className="flex justify-between text-sm">
              <p className="text-[#618968]">Subtotal</p>
              <p className="text-[#111812]">Rs. {totals.subtotal.toFixed(2)}</p>
            </div>
            <div className="flex justify-between text-sm">
              <p className="text-[#618968]">Delivery Fee</p>
              <p className="text-[#111812]">
                Rs. {totals.deliveryFee.toFixed(2)}
              </p>
            </div>
            <div className="flex justify-between text-sm">
              <p className="text-[#618968]">Taxes & Service Fees</p>
              <p className="text-[#111812]">Rs. {totals.taxes.toFixed(2)}</p>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <p className="text-lg font-bold text-[#111812]">Total</p>
              <p className="text-lg font-bold text-[#111812]">
                Rs. {totals.total.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Delivery Address */}
          {order.delivery_address && (
            <div className="mt-6 px-4">
              <h3 className="text-[#111812] text-sm font-bold mb-2">
                Delivered to
              </h3>
              <p className="text-[#618968] text-sm">{order.delivery_address}</p>
            </div>
          )}

          {/* Additional Options */}
          <div className="px-4 py-8 flex flex-col items-center">
            <button className="flex items-center gap-2 text-[#618968] text-sm py-2 hover:text-[#13ec37] transition">
              <span className="material-symbols-outlined text-lg">
                receipt_long
              </span>
              Download PDF Receipt
            </button>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-100">
          <div className="flex gap-3">
            <button
              onClick={() => navigate("/orders")}
              className="flex-1 bg-gray-100 hover:bg-gray-200 transition-all text-[#111812] font-bold py-4 rounded-xl flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Back
            </button>
            <button
              onClick={handleReorder}
              className="flex-1 bg-[#13ec37] hover:bg-[#10d632] transition-all text-white font-bold py-4 rounded-xl shadow-lg shadow-[#13ec37]/20 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">reorder</span>
              Reorder
            </button>
          </div>
          <div className="h-4"></div>
        </div>
      </div>

      {/* Material Symbols CSS */}
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />
    </div>
  );
};

export default PastOrderDetails;
