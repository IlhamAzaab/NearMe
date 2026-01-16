import React, { useState, useEffect } from "react";
import AdminLayout from "../../components/AdminLayout";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    // TODO: Fetch orders from API
    setTimeout(() => {
      setOrders([]);
      setLoading(false);
    }, 500);
  }, []);

  const filteredOrders = orders.filter((order) => {
    return statusFilter === "all" || order.status === statusFilter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-700";
      case "confirmed":
        return "bg-blue-100 text-blue-700";
      case "preparing":
        return "bg-purple-100 text-purple-700";
      case "ready":
        return "bg-indigo-100 text-indigo-700";
      case "delivered":
        return "bg-green-100 text-green-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-green-600 via-green-500 to-green-600 bg-clip-text text-transparent">Orders</h1>
          <p className="text-gray-600 mt-1 text-sm sm:text-base">
            Manage and track customer orders in real-time.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow border border-green-100 p-3 sm:p-4 hover:shadow-lg transition-shadow duration-300">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-sm sm:text-base ${
                statusFilter === "all"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All Orders
            </button>
            <button
              onClick={() => setStatusFilter("pending")}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                statusFilter === "pending"
                  ? "bg-yellow-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter("confirmed")}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                statusFilter === "confirmed"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Confirmed
            </button>
            <button
              onClick={() => setStatusFilter("preparing")}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                statusFilter === "preparing"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Preparing
            </button>
            <button
              onClick={() => setStatusFilter("ready")}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                statusFilter === "ready"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Ready
            </button>
            <button
              onClick={() => setStatusFilter("delivered")}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                statusFilter === "delivered"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Delivered
            </button>
          </div>
        </div>

        {/* Orders List */}
        <div className="bg-white rounded-xl shadow border border-green-100 hover:shadow-xl transition-shadow duration-300">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 sm:h-12 w-10 sm:w-12 border-b-4 border-green-600 mx-auto"></div>
              <p className="text-gray-600 mt-4 text-sm sm:text-base">Loading orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg
                className="w-16 h-16 mx-auto text-gray-400 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-lg font-medium">No orders found</p>
              <p className="text-sm mt-1">
                {statusFilter === "all"
                  ? "No orders have been placed yet."
                  : `No ${statusFilter} orders at this time.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                          Order ID
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                          Customer
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap hidden md:table-cell">
                          Items
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                          Total
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap hidden lg:table-cell">
                          Status
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap hidden xl:table-cell">
                          Time
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="px-4 sm:px-6 py-4 font-medium text-gray-900 text-sm whitespace-nowrap">\n                            #{order.id}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-900 text-sm">
                                {order.customer_name}
                              </p>
                              <p className="text-xs sm:text-sm text-gray-500">
                                {order.customer_phone}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-xs sm:text-sm text-gray-700 hidden md:table-cell">
                            {order.item_count} items
                          </td>
                          <td className="px-4 sm:px-6 py-4 font-semibold text-gray-900 text-sm whitespace-nowrap">
                            Rs. {order.total}
                          </td>
                          <td className="px-4 sm:px-6 py-4 hidden lg:table-cell">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-xs sm:text-sm text-gray-600 hidden xl:table-cell">
                            {order.time}
                          </td>
                          <td className="px-4 sm:px-6 py-4">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="text-green-600 hover:text-green-800 text-xs sm:text-sm font-medium whitespace-nowrap"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </AdminLayout>
  );
}

function OrderDetailsModal({ order, onClose }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">Order #{order.id}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Customer Info */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">
              Customer Information
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-1">
              <p className="text-sm">
                <span className="text-gray-600">Name:</span>{" "}
                <span className="font-medium">{order.customer_name}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-600">Phone:</span>{" "}
                <span className="font-medium">{order.customer_phone}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-600">Address:</span>{" "}
                <span className="font-medium">{order.delivery_address}</span>
              </p>
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">Order Items</h3>
            <div className="space-y-2">
              {order.items?.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center bg-gray-50 rounded-lg p-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-600">
                      Qty: {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    Rs. {item.price * item.quantity}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-800">Total</span>
              <span className="text-2xl font-bold text-indigo-600">
                Rs. {order.total}
              </span>
            </div>
          </div>

          {/* Status Update Actions */}
          <div className="flex gap-3">
            <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Confirm Order
            </button>
            <button className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              Mark as Preparing
            </button>
            <button className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              Ready for Pickup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

