import React from "react";

export default function DriverDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800">Driver Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Welcome! Your profile is completed. More driver tools will appear here
          later.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-sm text-gray-500">Status</p>
            <p className="text-lg font-semibold text-gray-800">Active</p>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-sm text-gray-500">Assigned Orders</p>
            <p className="text-lg font-semibold text-gray-800">0</p>
          </div>
        </div>
      </div>
    </div>
  );
}
