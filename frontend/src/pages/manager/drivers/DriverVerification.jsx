import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ManagerHeader from "../../../components/ManagerHeader";

export default function DriverVerification() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverDetails, setDriverDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => {
    fetchPendingDrivers();
  }, []);

  const fetchPendingDrivers = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("http://localhost:5000/manager/pending-drivers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPendingDrivers(data.drivers || []);
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError("Failed to fetch pending drivers");
    } finally {
      setLoading(false);
    }
  };

  const fetchDriverDetails = async (driverId) => {
    const token = localStorage.getItem("token");
    setDetailsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `http://localhost:5000/manager/driver-details/${driverId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (res.ok) {
        setDriverDetails(data);
        setSelectedDriver(driverId);
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError("Failed to fetch driver details");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleVerifyDriver = async (action) => {
    if (action === "reject" && !rejectReason.trim()) {
      alert("Please provide a reason for rejection");
      return;
    }

    const token = localStorage.getItem("token");
    setVerifyLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `http://localhost:5000/manager/verify-driver/${selectedDriver}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            reason:
              action === "reject"
                ? rejectReason
                : "Manager approved after verification",
          }),
        }
      );

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setSelectedDriver(null);
        setDriverDetails(null);
        setShowRejectModal(false);
        setRejectReason("");
        fetchPendingDrivers();
      } else {
        setError(data.message);
      }
    } catch (e) {
      setError("Failed to verify driver");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <ManagerHeader onLogout={handleLogout} />
        <div className="max-w-7xl mx-auto px-4 py-8 text-center">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ManagerHeader onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800">
            Driver Verification
          </h1>
          <p className="text-gray-600 mt-2">
            Review and approve pending driver applications
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pending Drivers List */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Pending Applications ({pendingDrivers.length})
            </h2>

            {pendingDrivers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No pending drivers
              </p>
            ) : (
              <div className="space-y-3">
                {pendingDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    onClick={() => fetchDriverDetails(driver.id)}
                    className={`p-4 border rounded-lg cursor-pointer transition ${
                      selectedDriver === driver.id
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-gray-200 hover:border-indigo-300"
                    }`}
                  >
                    <p className="font-semibold text-gray-800">
                      {driver.full_name || "N/A"}
                    </p>
                    <p className="text-sm text-gray-600">{driver.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {driver.driver_type || "N/A"} • {driver.city || "N/A"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Applied:{" "}
                      {new Date(driver.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Driver Details Panel */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
            {!selectedDriver ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">Select a driver to view details</p>
              </div>
            ) : detailsLoading ? (
              <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-teal-400 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
            ) : driverDetails ? (
              <div className="space-y-6">
                {/* Header with Actions */}
                <div className="flex justify-between items-start border-b pb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">
                      {driverDetails.driver.full_name}
                    </h2>
                    <p className="text-gray-600">
                      {driverDetails.driver.email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRejectModal(true)}
                      disabled={verifyLoading}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleVerifyDriver("approve")}
                      disabled={verifyLoading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {verifyLoading ? "Processing..." : "Approve"}
                    </button>
                  </div>
                </div>

                {/* Personal Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">
                    Personal Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">NIC Number</p>
                      <p className="font-medium">
                        {driverDetails.driver.nic_number || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Date of Birth</p>
                      <p className="font-medium">
                        {driverDetails.driver.date_of_birth
                          ? new Date(
                              driverDetails.driver.date_of_birth
                            ).toLocaleDateString()
                          : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Phone</p>
                      <p className="font-medium">
                        {driverDetails.driver.phone || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">City</p>
                      <p className="font-medium">
                        {driverDetails.driver.city || "N/A"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500">Address</p>
                      <p className="font-medium">
                        {driverDetails.driver.address || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Working Time</p>
                      <p className="font-medium">
                        {driverDetails.driver.working_time || "N/A"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Vehicle & License */}
                {driverDetails.vehicleLicense && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">
                      Vehicle & License Details
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Vehicle Number</p>
                        <p className="font-medium">
                          {driverDetails.vehicleLicense.vehicle_number || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Vehicle Type</p>
                        <p className="font-medium">
                          {driverDetails.vehicleLicense.vehicle_type || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Vehicle Model</p>
                        <p className="font-medium">
                          {driverDetails.vehicleLicense.vehicle_model || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">License Number</p>
                        <p className="font-medium">
                          {driverDetails.vehicleLicense
                            .driving_license_number || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Insurance Expiry</p>
                        <p className="font-medium">
                          {driverDetails.vehicleLicense.insurance_expiry
                            ? new Date(
                                driverDetails.vehicleLicense.insurance_expiry
                              ).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">License Expiry</p>
                        <p className="font-medium">
                          {driverDetails.vehicleLicense.license_expiry_date
                            ? new Date(
                                driverDetails.vehicleLicense.license_expiry_date
                              ).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Documents */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">
                    Documents ({driverDetails.documents.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {driverDetails.documents.map((doc) => (
                      <div key={doc.id} className="border rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          {doc.document_type.replace(/_/g, " ").toUpperCase()}
                        </p>
                        <a
                          href={doc.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          View Document →
                        </a>
                        {doc.verified && (
                          <p className="text-xs text-green-600 mt-1">
                            ✓ Verified
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bank Account */}
                {driverDetails.bankAccount && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">
                      Bank Account
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Account Holder</p>
                        <p className="font-medium">
                          {driverDetails.bankAccount.account_holder_name ||
                            "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Bank Name</p>
                        <p className="font-medium">
                          {driverDetails.bankAccount.bank_name || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Branch</p>
                        <p className="font-medium">
                          {driverDetails.bankAccount.branch || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Account Number</p>
                        <p className="font-medium">
                          {driverDetails.bankAccount.account_number || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contract */}
                {driverDetails.contract && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">
                      Contract
                    </h3>
                    <div className="text-sm space-y-2">
                      <p>
                        <span className="text-gray-500">Version:</span>{" "}
                        <span className="font-medium">
                          {driverDetails.contract.contract_version}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-500">Accepted:</span>{" "}
                        <span className="font-medium">
                          {new Date(
                            driverDetails.contract.accepted_at
                          ).toLocaleString()}
                        </span>
                      </p>
                      <p>
                        <span className="text-gray-500">IP Address:</span>{" "}
                        <span className="font-medium">
                          {driverDetails.contract.ip_address || "N/A"}
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </main>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              Reject Driver Application
            </h3>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejecting this application:
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
              rows="4"
              placeholder="e.g., Expired documents, incomplete information..."
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleVerifyDriver("reject")}
                disabled={verifyLoading || !rejectReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {verifyLoading ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
