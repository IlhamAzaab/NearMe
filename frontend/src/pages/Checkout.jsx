import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AnimatedAlert, { useAlert } from "../components/AnimatedAlert";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Custom circle marker icon
const createCircleIcon = (color) => {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 20px;
      height: 20px;
      background-color: ${color};
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

// OpenStreetMap tile URL
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Leaflet container style
const mapContainerStyle = {
  width: "100%",
  height: "100%",
};

// Function to calculate road distance using OSRM routing API
async function calculateRouteDistance(lat1, lon1, lat2, lon2) {
  try {
    // OSRM expects coordinates in lon,lat format
    // Use FOOT profile for shortest distance (motorcycles can use walking paths in town)
    const url = `https://router.project-osrm.org/route/v1/foot/${lon1},${lat1};${lon2},${lat2}?overview=false`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distance: route.distance / 1000, // Convert meters to kilometers
        duration: route.duration / 60, // Convert seconds to minutes
        success: true,
      };
    }

    return { success: false, error: "No route found" };
  } catch (error) {
    console.error("OSRM routing error:", error);
    return { success: false, error: error.message };
  }
}

const Checkout = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cartId = searchParams.get("cartId");

  // User state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  // Customer profile
  const [customerProfile, setCustomerProfile] = useState(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [position, setPosition] = useState(null);
  const [mapCenter, setMapCenter] = useState([7.8731, 80.7718]);

  // Address edit modal
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);

  // Cart data
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setRawError] = useState(null);
  const { alert: alertState, visible: alertVisible, showError } = useAlert();

  // Wrap setError to also trigger animated toast
  const setError = (msg) => {
    setRawError(msg);
    if (msg) showError(msg);
  };

  // Order summary dropdown
  const [showOrderItems, setShowOrderItems] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);

  // Location
  const [locating, setLocating] = useState(false);
  const [isMapEditMode, setIsMapEditMode] = useState(false);

  // Route info (OSRM)
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Delivery options
  const [deliveryOption, setDeliveryOption] = useState("standard"); // priority, standard, scheduled
  const [deliveryMethod, setDeliveryMethod] = useState("meet_at_door"); // meet_at_door, leave_at_door

  // Leaflet map ref
  const mapRef = useRef(null);

  // Leaflet is always loaded (no API key needed)
  const isLoaded = true;
  const loadError = null;

  // Map click handler component for Leaflet
  function MapClickHandler({ isEditMode, onMapClick }) {
    useMapEvents({
      click: (e) => {
        if (isEditMode) {
          onMapClick([e.latlng.lat, e.latlng.lng]);
        }
      },
    });
    return null;
  }

  // Component to control map programmatically
  function MapController({ center }) {
    const map = useMap();
    useEffect(() => {
      if (center) {
        map.setView([center[0], center[1]], map.getZoom());
      }
    }, [center, map]);
    return null;
  }

  // Minimum order amount
  const MINIMUM_SUBTOTAL = 300;

  // Calculate service fee based on subtotal
  const calculateServiceFee = (subtotal) => {
    if (subtotal < 300) return 0;
    if (subtotal >= 300 && subtotal < 1000) return 31;
    if (subtotal >= 1000 && subtotal < 1500) return 42;
    if (subtotal >= 1500 && subtotal < 2500) return 56;
    return 62; // above 2500
  };

  // Calculate delivery fee based on distance in km
  const calculateDeliveryFee = (distanceKm) => {
    if (distanceKm === null || distanceKm === undefined) return null;

    if (distanceKm <= 1) return 50;
    if (distanceKm <= 2) return 80;
    if (distanceKm <= 2.5) return 87;

    // Above 2.5km: Rs.87 + Rs.2.3 per 100m
    const extraMeters = (distanceKm - 2.5) * 1000; // Convert km to meters
    const extra100mUnits = Math.ceil(extraMeters / 100); // Number of 100m units
    return 87 + extra100mUnits * 2.3;
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    const email = localStorage.getItem("userEmail");

    if (!token || storedRole !== "customer") {
      navigate("/login");
      return;
    }

    if (!cartId) {
      navigate("/cart");
      return;
    }

    setIsLoggedIn(!!token);
    setRole(storedRole || "");
    setUserEmail(email || "");

    if (email) {
      const namePart = email.split("@")[0];
      setUserName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
    }

    fetchCheckoutData();
  }, [navigate, cartId]);

  // Calculate route when position or restaurant changes
  useEffect(() => {
    const fetchRoute = async () => {
      if (
        !position ||
        !cart?.restaurant?.latitude ||
        !cart?.restaurant?.longitude
      ) {
        setRouteInfo(null);
        return;
      }

      setRouteLoading(true);
      const result = await calculateRouteDistance(
        position[0],
        position[1],
        parseFloat(cart.restaurant.latitude),
        parseFloat(cart.restaurant.longitude),
      );

      if (result.success) {
        setRouteInfo({
          distance: result.distance,
          duration: result.duration,
        });
      } else {
        setRouteInfo(null);
      }
      setRouteLoading(false);
    };

    fetchRoute();
  }, [position, cart?.restaurant?.latitude, cart?.restaurant?.longitude]);

  const fetchCheckoutData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token");

      // Fetch cart data and customer profile in parallel
      const [cartResponse, profileResponse] = await Promise.all([
        fetch("http://localhost:5000/cart", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("http://localhost:5000/cart/customer-profile", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const cartData = await cartResponse.json();
      const profileData = await profileResponse.json();

      if (!cartResponse.ok) {
        throw new Error(cartData.message || "Failed to fetch cart");
      }

      if (!profileResponse.ok) {
        throw new Error(profileData.message || "Failed to fetch profile");
      }

      // Find the specific cart
      const selectedCart = cartData.carts?.find((c) => c.id === cartId);
      if (!selectedCart) {
        throw new Error("Cart not found");
      }

      setCart(selectedCart);

      // Set customer profile data
      if (profileData.customer) {
        setCustomerProfile(profileData.customer);
        setPhone(profileData.customer.phone || "");
        setAddress(profileData.customer.address || "");
        setCity(profileData.customer.city || "");

        if (profileData.customer.latitude && profileData.customer.longitude) {
          const lat = parseFloat(profileData.customer.latitude);
          const lng = parseFloat(profileData.customer.longitude);
          setPosition([lat, lng]);
          setMapCenter([lat, lng]);
        } else {
          setPosition([7.8731, 80.7718]);
        }
      }
    } catch (err) {
      console.error("Fetch checkout data error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userEmail");
    navigate("/home");
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition([latitude, longitude]);
        setMapCenter([latitude, longitude]);
        setLocating(false);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setError(
          "Unable to get your location. Please select manually on the map.",
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  const formatPrice = (price) => {
    return price ? `Rs. ${parseFloat(price).toFixed(2)}` : "Rs. 0.00";
  };

  // Calculate totals
  const subtotal = cart ? parseFloat(cart.cart_total) : 0;
  const adminTotal = cart ? parseFloat(cart.admin_total || 0) : 0;
  const commissionTotal = cart ? parseFloat(cart.commission_total || 0) : 0;
  const serviceFee = calculateServiceFee(subtotal);
  const deliveryFee = routeInfo
    ? calculateDeliveryFee(routeInfo.distance)
    : null;
  const isSubtotalValid = subtotal >= MINIMUM_SUBTOTAL;
  const totalAmount =
    isSubtotalValid && deliveryFee !== null
      ? subtotal + serviceFee + deliveryFee
      : null;

  // Order placement state
  const [placing, setPlacing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const isPlacingRef = useRef(false); // Ref-based lock to prevent double clicks

  const handlePlaceOrder = async () => {
    // Double-click protection using ref (more reliable than state)
    if (isPlacingRef.current) {
      console.log(
        "Order placement already in progress, ignoring duplicate click",
      );
      return;
    }

    if (!phone || !address || !position) {
      setError(
        "Please ensure all delivery details are filled and location is selected",
      );
      return;
    }

    if (!isSubtotalValid) {
      setError(`Minimum order amount is Rs. ${MINIMUM_SUBTOTAL}`);
      return;
    }

    if (deliveryFee === null || !routeInfo) {
      setError("Please wait for delivery fee calculation");
      return;
    }

    // Set both state and ref lock immediately
    isPlacingRef.current = true;
    setPlacing(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:5000/orders/place", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cartId: cartId,
          delivery_latitude: position[0],
          delivery_longitude: position[1],
          delivery_address: address,
          delivery_city: city,
          payment_method: paymentMethod,
          distance_km: routeInfo.distance,
          estimated_duration_min: routeInfo.duration,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Order placed successfully! Navigate to placing-order page
        // Keep the lock set to prevent any further clicks
        navigate("/placing-order", {
          state: {
            orderPlaced: true,
            orderId: data.order.id,
            orderNumber: data.order.order_number,
            order: data.order,
            address: address,
            restaurantName: data.order.restaurant_name,
            totalAmount: data.order.total_amount,
            items:
              cart?.items?.map((item) => ({
                name: item.food_name,
                quantity: item.quantity,
                price: item.unit_price,
              })) || [],
          },
          replace: true,
        });
        return; // Exit early, don't continue processing
      } else {
        // Check if it's a duplicate order error (cart already completed)
        if (
          data.message?.includes("already") ||
          data.message?.includes("completed") ||
          response.status === 409
        ) {
          // Cart was already ordered - navigate to placing-order if we have order info
          if (data.order) {
            navigate("/placing-order", {
              state: {
                orderPlaced: true,
                orderId: data.order.id,
                orderNumber: data.order.order_number,
                order: data.order,
                address: address,
                restaurantName: data.order.restaurant_name || "Restaurant",
                totalAmount: data.order.total_amount,
              },
              replace: true,
            });
            return;
          } else {
            setError(
              "This order has already been placed. Please check your orders.",
            );
          }
        } else {
          setError(data.message || "Failed to place order");
          // Only clear the lock if it's a recoverable error
          isPlacingRef.current = false;
        }
      }
    } catch (err) {
      console.error("Place order error:", err);
      setError("Failed to connect to server. Please try again.");
      // Clear the lock so user can retry on network errors
      isPlacingRef.current = false;
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 font-poppins">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-orange-100 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-500 text-sm font-medium">
            Loading checkout...
          </p>
        </div>
      </div>
    );
  }

  // Order Success Screen
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 font-poppins">
        <div className="px-4 py-8 max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            {/* Success Icon */}
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Order Placed Successfully!
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              Your order has been sent to the restaurant
            </p>

            {/* Order Details */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-left space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Order Number</span>
                <span className="font-bold text-[#FF7A00]">
                  {orderSuccess.order_number}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Restaurant</span>
                <span className="font-medium text-gray-900">
                  {orderSuccess.restaurant_name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Items</span>
                <span className="font-medium text-gray-900">
                  {orderSuccess.items_count} item(s)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Est. Delivery</span>
                <span className="font-medium text-gray-900">
                  ~{orderSuccess.estimated_duration_min} mins
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Payment</span>
                <span className="font-medium text-gray-900 capitalize">
                  {orderSuccess.payment_method === "cash"
                    ? "Cash on Delivery"
                    : orderSuccess.payment_method === "card"}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-xl font-bold text-[#FF7A00]">
                  {formatPrice(orderSuccess.total_amount)}
                </span>
              </div>
            </div>

            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 bg-orange-100 text-[#FF7A00] px-4 py-2 rounded-full text-sm font-medium mb-6">
              <div className="w-2 h-2 bg-[#FF7A00] rounded-full animate-pulse"></div>
              Waiting for restaurant to accept
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => navigate("/orders/" + orderSuccess.id)}
                className="w-full px-6 py-3.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition shadow-lg shadow-orange-200"
              >
                Track Order
              </button>
              <button
                onClick={() => navigate("/home")}
                className="w-full px-6 py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !cart) {
    return (
      <div className="min-h-screen bg-gray-50 font-poppins">
        <div className="px-4 py-8 max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-100 text-red-600 px-5 py-4 rounded-2xl">
            <p className="font-semibold">Error</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => navigate("/cart")}
              className="mt-4 px-6 py-2.5 bg-[#FF7A00] text-white font-semibold rounded-full hover:bg-orange-600 transition"
            >
              Back to Cart
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Priority fee
  const PRIORITY_FEE = 49;

  // Calculate estimated delivery time
  const getDeliveryTimeRange = () => {
    if (!routeInfo) return "Calculating...";
    const baseTime = Math.ceil(routeInfo.duration) + 15; // Add prep time
    if (deliveryOption === "priority") {
      return `${baseTime - 5}–${baseTime + 5} min`;
    }
    return `${baseTime + 5}–${baseTime + 15} min`;
  };

  // Recalculate total with priority
  const priorityExtra = deliveryOption === "priority" ? PRIORITY_FEE : 0;
  const finalTotal = totalAmount !== null ? totalAmount + priorityExtra : null;

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-32 page-slide-up">
      <AnimatedAlert alert={alertState} visible={alertVisible} />
      {/* Main Content */}
      <main className="max-w-lg mx-auto">
        {/* Map Preview Section */}
        <div className="relative">
          <div
            className={`${isMapEditMode ? "h-64" : "h-40"} bg-gray-100 relative overflow-hidden transition-all duration-300`}
          >
            {isLoaded ? (
              <MapContainer
                center={
                  position ? [position[0], position[1]] : [7.8731, 80.7718]
                }
                zoom={16}
                style={mapContainerStyle}
                zoomControl={isMapEditMode}
                scrollWheelZoom={isMapEditMode}
                dragging={isMapEditMode}
                attributionControl={false}
              >
                <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
                <MapClickHandler
                  isEditMode={isMapEditMode}
                  onMapClick={setPosition}
                />
                <MapController center={mapCenter} />
                {position && (
                  <Marker
                    position={[position[0], position[1]]}
                    icon={createCircleIcon("#FF7A00")}
                  />
                )}
              </MapContainer>
            ) : loadError ? (
              <div className="h-full w-full flex items-center justify-center">
                <p className="text-red-500 text-sm">Failed to load map</p>
              </div>
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {/* Edit Mode Overlay */}
            {isMapEditMode && (
              <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center justify-between">
                <div className="text-black font-semibold px-3 py-1.5 rounded-full text-xs font-medium shadow-lg shadow-black-200">
                  Set location on the map
                </div>
                <button
                  onClick={handleUseMyLocation}
                  disabled={locating}
                  className="bg-white px-3 py-1.5 rounded-full shadow-lg text-xs font-medium text-[#FF7A00] flex items-center gap-1.5 hover:bg-orange-50 transition"
                >
                  {locating ? (
                    <>
                      <div className="w-3 h-3 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                      <span>Locating...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span>find Area </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Edit / Done Button */}
            <button
              onClick={async () => {
                if (isMapEditMode) {
                  // Clicking "Done" - save the location to database
                  if (position && address) {
                    setSavingAddress(true);
                    try {
                      const token = localStorage.getItem("token");
                      const response = await fetch(
                        "http://localhost:5000/customer/address",
                        {
                          method: "PUT",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            address: address,
                            city: city,
                            latitude: position[0],
                            longitude: position[1],
                          }),
                        },
                      );

                      const data = await response.json();

                      if (response.ok) {
                        console.log("✅ Location saved to database:", {
                          lat: position[0],
                          lng: position[1],
                        });
                        setError(null);
                      } else {
                        console.error("Failed to save location:", data.message);
                        setError(data.message || "Failed to save location");
                      }
                    } catch (err) {
                      console.error("Save location error:", err);
                      setError("Failed to save location");
                    } finally {
                      setSavingAddress(false);
                    }
                  }
                  setIsMapEditMode(false);
                } else {
                  // Clicking "Edit" - enter edit mode
                  setIsMapEditMode(true);
                }
              }}
              disabled={savingAddress}
              className={`absolute bottom-3 right-3 z-[1000] px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-1.5 transition ${
                isMapEditMode
                  ? "bg-[#FF7A00] text-white hover:bg-orange-600 shadow-orange-200"
                  : "bg-white text-[#FF7A00] hover:bg-orange-50"
              } ${savingAddress ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {savingAddress ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : isMapEditMode ? (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>Done</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                  <span>Edit</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Delivery Address Card */}
        <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-[#FF7A00]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Delivery Address</p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {address || "Add delivery address"}
                  </p>
                  {city && <p className="text-sm text-gray-500">{city}</p>}
                </div>
                <button
                  onClick={() => {
                    setEditAddress(address);
                    setEditCity(city);
                    setShowAddressModal(true);
                  }}
                  className="p-2 bg-orange-50 rounded-xl hover:bg-orange-100 transition"
                >
                  <svg
                    className="w-5 h-5 text-[#FF7A00]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Address Edit Modal */}
        {showAddressModal && (
          <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowAddressModal(false)}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 animate-slide-up">
              {/* Handle bar for mobile */}
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4 sm:hidden"></div>

              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">
                  Edit Delivery Address
                </h3>
                <button
                  onClick={() => setShowAddressModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  <svg
                    className="w-5 h-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
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

              <div className="space-y-4">
                {/* Address Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Street Address
                  </label>
                  <textarea
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Enter your full address"
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/40 focus:border-[#FF7A00] transition resize-none"
                  />
                </div>

                {/* City Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    placeholder="Enter city name"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/40 focus:border-[#FF7A00] transition"
                  />
                </div>

                {/* Save Button */}
                <button
                  onClick={async () => {
                    if (!editAddress.trim()) {
                      setError("Address is required");
                      return;
                    }

                    setSavingAddress(true);
                    try {
                      const token = localStorage.getItem("token");
                      const response = await fetch(
                        "http://localhost:5000/customer/address",
                        {
                          method: "PUT",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            address: editAddress,
                            city: editCity,
                            latitude: position ? position[0] : null,
                            longitude: position ? position[1] : null,
                          }),
                        },
                      );

                      const data = await response.json();

                      if (response.ok) {
                        setAddress(editAddress);
                        setCity(editCity);
                        setShowAddressModal(false);
                        setError(null);
                      } else {
                        setError(data.message || "Failed to update address");
                      }
                    } catch (err) {
                      console.error("Update address error:", err);
                      setError("Failed to update address");
                    } finally {
                      setSavingAddress(false);
                    }
                  }}
                  disabled={savingAddress}
                  className="w-full py-3.5 bg-[#FF7A00] text-white font-semibold rounded-xl hover:bg-orange-600 transition shadow-lg shadow-orange-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingAddress ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Save Address
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delivery Method */}

        {/* Phone Number */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <svg
              className="w-6 h-6 text-[#FF7A00]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            <div>
              <p className="text-xs text-gray-500">Phone Number</p>
              <p className="font-semibold text-gray-900">
                {phone || "No phone number"}
              </p>
            </div>
          </div>
        </div>

        {/* Delivery Time */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <svg
              className="w-6 h-6 text-[#FF7A00]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-xs text-gray-500">Estimated Delivery</p>
              <p className="font-semibold text-gray-900">
                {routeLoading ? (
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
                    Calculating...
                  </span>
                ) : (
                  getDeliveryTimeRange()
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-5 h-5 text-[#FF7A00]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <h3 className="font-bold text-gray-900">Order Summary</h3>
          </div>
          <button
            onClick={() => setShowOrderItems(!showOrderItems)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
          >
            <div className="flex items-center gap-3">
              {cart?.restaurant?.logo_url ? (
                <img
                  src={cart.restaurant.logo_url}
                  alt={cart.restaurant.restaurant_name}
                  className="w-12 h-12 rounded-xl object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-[#FF7A00]">
                    {cart?.restaurant?.restaurant_name?.charAt(0) || "R"}
                  </span>
                </div>
              )}
              <div className="text-left">
                <p className="font-semibold text-gray-900">
                  {cart?.restaurant?.restaurant_name || "Restaurant"}
                </p>
                <p className="text-sm text-gray-500">
                  {cart?.total_items || 0} item
                  {cart?.total_items !== 1 ? "s" : ""} • {formatPrice(subtotal)}
                </p>
              </div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showOrderItems ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* Expandable Order Items */}
          {showOrderItems && cart && (
            <div className="mt-3 space-y-2">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 bg-[#FF7A00] text-white rounded-lg text-xs font-bold flex items-center justify-center">
                      {item.quantity}x
                    </span>
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {item.food_name}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">
                        ({item.size})
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-[#FF7A00]">
                    {formatPrice(item.total_price)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-5 h-5 text-[#FF7A00]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            <h3 className="font-bold text-gray-900">Payment Method</h3>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            {paymentMethod === "cash" ? (
              <svg
                className="w-6 h-6 text-[#FF7A00]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6 text-[#FF7A00]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            )}
            <div>
              <p className="font-semibold text-gray-900">
                {paymentMethod === "cash" ? "Cash on Delivery" : "Card Payment"}
              </p>
              <p className="text-xs text-gray-500">
                {paymentMethod === "cash"
                  ? "Pay when your order arrives"
                  : "Credit/Debit card"}
              </p>
            </div>
          </div>
        </div>

        {/* Price Summary */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-5 h-5 text-[#FF7A00]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <h3 className="font-bold text-gray-900">Price Details</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-gray-900">
                {formatPrice(subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                Delivery fee
                {routeInfo && (
                  <span className="text-gray-400 ml-1">
                    ({routeInfo.distance.toFixed(1)} km)
                  </span>
                )}
              </span>
              <span className="font-medium text-gray-900">
                {routeLoading
                  ? "..."
                  : deliveryFee !== null
                    ? formatPrice(deliveryFee)
                    : "--"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Service fee</span>
              <span className="font-medium text-gray-900">
                {formatPrice(serviceFee)}
              </span>
            </div>
            {deliveryOption === "priority" && (
              <div className="flex justify-between">
                <span className="text-gray-600">Priority delivery</span>
                <span className="font-medium text-gray-900">
                  {formatPrice(PRIORITY_FEE)}
                </span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-xl font-bold text-[#FF7A00]">
                {finalTotal !== null ? formatPrice(finalTotal) : "--"}
              </span>
            </div>
          </div>
        </div>

        {/* Minimum Order Warning */}
        {!isSubtotalValid && (
          <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-amber-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-amber-800">
              <span className="font-medium">Minimum order:</span> Rs.{" "}
              {MINIMUM_SUBTOTAL}. Add Rs.{" "}
              {(MINIMUM_SUBTOTAL - subtotal).toFixed(0)} more.
            </p>
          </div>
        )}

        <AnimatedAlert alert={alertState} visible={alertVisible} />
      </main>

      {/* Sticky Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handlePlaceOrder}
            disabled={
              !isSubtotalValid ||
              deliveryFee === null ||
              routeLoading ||
              placing ||
              !phone ||
              !address
            }
            className={`w-full py-4 font-bold rounded-full transition flex items-center justify-center gap-2 text-base shadow-lg ${
              !isSubtotalValid ||
              deliveryFee === null ||
              routeLoading ||
              placing ||
              !phone ||
              !address
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-[#FF7A00] text-white hover:bg-orange-600 shadow-orange-200 active:scale-[0.98]"
            }`}
          >
            {placing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Placing order...
              </>
            ) : routeLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
                Calculating...
              </>
            ) : !isSubtotalValid ? (
              `Add Rs. ${(MINIMUM_SUBTOTAL - subtotal).toFixed(0)} more`
            ) : finalTotal !== null ? (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Place Order • {formatPrice(finalTotal)}
              </>
            ) : (
              "Place Order"
            )}
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            By placing this order, you agree to our terms of service
          </p>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
