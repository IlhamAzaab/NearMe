import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ManagerLayout from "../../../components/ManagerLayout";

export default function PendingRestaurants() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null); // For image preview modal

  // Fetch pending restaurants
  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const res = await fetch(
          "http://localhost:5000/manager/pending-restaurants",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await res.json();
        if (res.ok) {
          setRestaurants(data.restaurants || []);
        }
      } catch (e) {
        console.error("Fetch pending restaurants error", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRestaurants();
  }, [token]);

  // Fetch restaurant details
  const handleSelectRestaurant = async (restaurantId) => {
    setSelectedRestaurant(restaurantId);
    setDetailsLoading(true);
    try {
      const res = await fetch(
        `http://localhost:5000/manager/restaurant-details/${restaurantId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (res.ok) {
        setDetails(data);
      }
    } catch (e) {
      console.error("Fetch restaurant details error", e);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRestaurant) return;

    setApproving(true);
    try {
      const res = await fetch(
        `http://localhost:5000/manager/verify-restaurant/${selectedRestaurant}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "approve",
          }),
        }
      );

      const data = await res.json();
      if (res.ok) {
        alert("Restaurant approved successfully!");
        // Remove from list
        setRestaurants((prev) =>
          prev.filter((r) => r.id !== selectedRestaurant)
        );
        setSelectedRestaurant(null);
        setDetails(null);
      } else {
        alert(data?.message || "Failed to approve restaurant");
      }
    } catch (e) {
      console.error("Approve error", e);
      alert("Something went wrong");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRestaurant || !rejectionReason.trim()) {
      alert("Please provide a reason for rejection");
      return;
    }

    setRejecting(true);
    try {
      const res = await fetch(
        `http://localhost:5000/manager/verify-restaurant/${selectedRestaurant}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "reject",
            reason: rejectionReason,
          }),
        }
      );

      const data = await res.json();
      if (res.ok) {
        alert("Restaurant rejected");
        // Remove from list
        setRestaurants((prev) =>
          prev.filter((r) => r.id !== selectedRestaurant)
        );
        setSelectedRestaurant(null);
        setDetails(null);
        setShowRejectModal(false);
        setRejectionReason("");
      } else {
        alert(data?.message || "Failed to reject restaurant");
      }
    } catch (e) {
      console.error("Reject error", e);
      alert("Something went wrong");
    } finally {
      setRejecting(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  // Format time
  const formatTime = (timeString) => {
    if (!timeString) return "N/A";
    return timeString;
  };

  return (
  <ManagerLayout>
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          Pending Restaurant Approvals
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Restaurants List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-gray-800">
                  Pending ({restaurants.length})
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {loading ? (
                  <p className="p-4 text-gray-500">Loading restaurants...</p>
                ) : restaurants.length === 0 ? (
                  <p className="p-4 text-gray-500">No pending restaurants</p>
                ) : (
                  restaurants.map((restaurant) => (
                    <div
                      key={restaurant.id}
                      className={`p-4 border-b cursor-pointer transition ${
                        selectedRestaurant === restaurant.id
                          ? "bg-indigo-50 border-l-4 border-l-indigo-600"
                          : "hover:bg-gray-50"
                      }`}
                      onClick={() => handleSelectRestaurant(restaurant.id)}
                    >
                      <p className="font-semibold text-gray-800">
                        {restaurant.restaurant_name}
                      </p>
                      <p className="text-sm text-gray-500">{restaurant.city}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(restaurant.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Details Panel */}
          <div className="lg:col-span-2">
            {!selectedRestaurant ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                <p>Select a restaurant to view details</p>
              </div>
            ) : detailsLoading ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-500">Loading details...</p>
              </div>
            ) : details ? (
              <div className="space-y-6 max-h-[85vh] overflow-y-auto">
                {/* Admin/Owner Information */}
                {details.admin && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Admin/Owner Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 font-medium">Full Name</p>
                        <p className="text-gray-800">
                          {details.admin.full_name || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Email</p>
                        <p className="text-gray-800">{details.admin.email}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Phone</p>
                        <p className="text-gray-800">
                          {details.admin.phone || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">
                          Home Address
                        </p>
                        <p className="text-gray-800">
                          {details.admin.home_address || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">NIC Number</p>
                        <p className="text-gray-800">
                          {details.admin.nic_number || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">
                          Date of Birth
                        </p>
                        <p className="text-gray-800">
                          {formatDate(details.admin.date_of_birth)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* KYC Documents - Images Only */}
                {(details.admin?.profile_photo_url ||
                  details.admin?.nic_front ||
                  details.admin?.nic_back) && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      KYC Documents
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {details.admin.profile_photo_url && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 mb-2">
                            Profile Photo
                          </p>
                          <img
                            src={details.admin.profile_photo_url}
                            alt="Profile"
                            className="w-full h-32 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-80 transition"
                            onClick={() =>
                              setSelectedImage({
                                src: details.admin.profile_photo_url,
                                alt: "Profile Photo",
                              })
                            }
                          />
                        </div>
                      )}
                      {details.admin.nic_front && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 mb-2">
                            NIC Front
                          </p>
                          <img
                            src={details.admin.nic_front}
                            alt="NIC Front"
                            className="w-full h-32 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-80 transition"
                            onClick={() =>
                              setSelectedImage({
                                src: details.admin.nic_front,
                                alt: "NIC Front",
                              })
                            }
                          />
                        </div>
                      )}
                      {details.admin.nic_back && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 mb-2">NIC Back</p>
                          <img
                            src={details.admin.nic_back}
                            alt="NIC Back"
                            className="w-full h-32 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-80 transition"
                            onClick={() =>
                              setSelectedImage({
                                src: details.admin.nic_back,
                                alt: "NIC Back",
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Restaurant Information */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Restaurant Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 font-medium">
                        Restaurant Name
                      </p>
                      <p className="text-gray-800">
                        {details.restaurant.restaurant_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">
                        Business Registration Number
                      </p>
                      <p className="text-gray-800">
                        {details.restaurant.business_registration_number ||
                          "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Address</p>
                      <p className="text-gray-800">
                        {details.restaurant.address || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">City</p>
                      <p className="text-gray-800">
                        {details.restaurant.city || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Postal Code</p>
                      <p className="text-gray-800">
                        {details.restaurant.postal_code || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Latitude</p>
                      <p className="text-gray-800">
                        {details.restaurant.latitude || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Longitude</p>
                      <p className="text-gray-800">
                        {details.restaurant.longitude || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Opening Time</p>
                      <p className="text-gray-800">
                        {formatTime(details.restaurant.opening_time)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Closing Time</p>
                      <p className="text-gray-800">
                        {formatTime(details.restaurant.close_time)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Restaurant Images - Logo & Cover Only */}
                {(details.restaurant.logo_url ||
                  details.restaurant.cover_image_url) && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Restaurant Images
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {details.restaurant.logo_url && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 mb-2">Logo</p>
                          <img
                            src={details.restaurant.logo_url}
                            alt="Logo"
                            className="w-full h-32 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-80 transition"
                            onClick={() =>
                              setSelectedImage({
                                src: details.restaurant.logo_url,
                                alt: "Logo",
                              })
                            }
                          />
                        </div>
                      )}
                      {details.restaurant.cover_image_url && (
                        <div className="text-center">
                          <p className="text-sm text-gray-500 mb-2">
                            Cover Image
                          </p>
                          <img
                            src={details.restaurant.cover_image_url}
                            alt="Cover"
                            className="w-full h-32 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-80 transition"
                            onClick={() =>
                              setSelectedImage({
                                src: details.restaurant.cover_image_url,
                                alt: "Cover Image",
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bank Account Details */}
                {details.bankAccount && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Bank Account Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 font-medium">
                          Account Holder Name
                        </p>
                        <p className="text-gray-800">
                          {details.bankAccount.account_holder_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Bank Name</p>
                        <p className="text-gray-800">
                          {details.bankAccount.bank_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">Branch</p>
                        <p className="text-gray-800">
                          {details.bankAccount.branch || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 font-medium">
                          Account Number
                        </p>
                        <p className="text-gray-800">
                          {details.bankAccount.account_number}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex gap-4">
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {approving ? "Approving..." : "✓ Approve"}
                    </button>
                    <button
                      onClick={() => setShowRejectModal(true)}
                      disabled={rejecting}
                      className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {rejecting ? "Rejecting..." : "✗ Reject"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center px-4 z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {selectedImage.alt}
              </h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-500 hover:text-gray-800 text-2xl"
              >
                ✕
              </button>
            </div>
            <img
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="w-full rounded border border-gray-300"
            />
            <div className="mt-4 text-center">
              <button
                onClick={() => setSelectedImage(null)}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Reject Restaurant
            </h3>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejection:
            </p>
            <textarea
              className="w-full border rounded-lg p-3 mb-4"
              rows="4"
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason("");
                }}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectionReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejecting ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </ManagerLayout>
  );
}
