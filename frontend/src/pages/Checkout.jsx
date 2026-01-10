import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Component to handle map clicks
function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position === null ? null : <Marker position={position}></Marker>;
}

// Component to handle map centering
function MapController({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, 15);
    }
  }, [center, map]);

  return null;
}

// Function to calculate road distance using OSRM routing API
async function calculateRouteDistance(lat1, lon1, lat2, lon2) {
  try {
    // OSRM expects coordinates in lon,lat format
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;

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

  // Cart data
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Order summary dropdown
  const [showOrderItems, setShowOrderItems] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);

  // Location
  const [locating, setLocating] = useState(false);

  // Route info (OSRM)
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

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
        parseFloat(cart.restaurant.longitude)
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
    navigate("/");
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
          "Unable to get your location. Please select manually on the map."
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const formatPrice = (price) => {
    return price ? `Rs. ${parseFloat(price).toFixed(2)}` : "Rs. 0.00";
  };

  // Calculate totals
  const subtotal = cart ? parseFloat(cart.cart_total) : 0;
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

  const handlePlaceOrder = async () => {
    if (!phone || !address || !position) {
      setError(
        "Please ensure all delivery details are filled and location is selected"
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
        // Order placed successfully!
        setOrderSuccess(data.order);
      } else {
        setError(data.message || "Failed to place order");
      }
    } catch (err) {
      console.error("Place order error:", err);
      setError("Failed to connect to server. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <SiteHeader
          isLoggedIn={isLoggedIn}
          role={role}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  // Order Success Screen
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        <SiteHeader
          isLoggedIn={isLoggedIn}
          role={role}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-8 text-center">
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

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Order Placed Successfully!
            </h1>
            <p className="text-gray-600 mb-6">
              Your order has been sent to the restaurant
            </p>

            {/* Order Details */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">Order Number</span>
                <span className="font-bold text-indigo-600">
                  {orderSuccess.order_number}
                </span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">Restaurant</span>
                <span className="font-medium text-gray-900">
                  {orderSuccess.restaurant_name}
                </span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">Items</span>
                <span className="font-medium text-gray-900">
                  {orderSuccess.items_count} item(s)
                </span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">Est. Delivery</span>
                <span className="font-medium text-gray-900">
                  ~{orderSuccess.estimated_duration_min} mins
                </span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">Payment</span>
                <span className="font-medium text-gray-900 capitalize">
                  {orderSuccess.payment_method === "cash"
                    ? "Cash on Delivery"
                    : "Card Payment"}
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-xl font-bold text-indigo-600">
                  {formatPrice(orderSuccess.total_amount)}
                </span>
              </div>
            </div>

            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              Waiting for restaurant to accept
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => navigate("/orders/" + orderSuccess.id)}
                className="w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
              >
                Track Order
              </button>
              <button
                onClick={() => navigate("/")}
                className="w-full px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition"
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
      <div className="min-h-screen bg-gray-50">
        <SiteHeader
          isLoggedIn={isLoggedIn}
          role={role}
          userName={userName}
          userEmail={userEmail}
          onLogout={handleLogout}
        />
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg max-w-2xl">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
            <button
              onClick={() => navigate("/cart")}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Back to Cart
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader
        isLoggedIn={isLoggedIn}
        role={role}
        userName={userName}
        userEmail={userEmail}
        onLogout={handleLogout}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate("/cart")}
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-semibold mb-4"
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Cart
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Checkout</h1>
          <p className="text-gray-600">Complete your order details</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Delivery Details */}
          <div className="space-y-6">
            {/* Delivery Information */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg
                  className="w-6 h-6 text-indigo-600"
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
                Delivery Information
              </h2>

              <div className="space-y-4">
                {/* Phone - Read Only */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    readOnly
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>

                {/* Address - Read Only */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Address
                  </label>
                  <textarea
                    value={address || "Not provided"}
                    readOnly
                    rows="2"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed resize-none"
                  />
                </div>

                {/* City - Read Only */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city || "Not provided"}
                    readOnly
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>

                {/* Map - Editable */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Delivery Location <span className="text-red-500">*</span>
                    <span className="text-xs text-gray-500 ml-2">
                      (Click map to change)
                    </span>
                  </label>
                  <div className="relative">
                    <MapContainer
                      center={position || [7.8731, 80.7718]}
                      zoom={15}
                      style={{
                        height: "300px",
                        width: "100%",
                        borderRadius: "8px",
                      }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <LocationMarker
                        position={position}
                        setPosition={setPosition}
                      />
                      <MapController center={mapCenter} />
                    </MapContainer>
                  </div>

                  {position && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Latitude
                        </label>
                        <input
                          type="text"
                          className="w-full border rounded-lg p-2 bg-gray-100 text-sm"
                          value={position[0].toFixed(6)}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Longitude
                        </label>
                        <input
                          type="text"
                          className="w-full border rounded-lg p-2 bg-gray-100 text-sm"
                          value={position[1].toFixed(6)}
                          readOnly
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={locating}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {locating
                      ? "Getting location..."
                      : "📍 Use My Current Location"}
                  </button>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg
                  className="w-6 h-6 text-indigo-600"
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
                Payment Method
              </h2>

              <div
                onClick={() => setShowPaymentOptions(!showPaymentOptions)}
                className="border border-gray-300 rounded-lg p-4 cursor-pointer hover:border-indigo-500 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {paymentMethod === "cash" ? (
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-green-600"
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
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-blue-600"
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
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-gray-900">
                        {paymentMethod === "cash"
                          ? "Cash on Delivery"
                          : "Card Payment"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {paymentMethod === "cash"
                          ? "Pay when you receive your order"
                          : "Pay now with credit/debit card"}
                      </p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      showPaymentOptions ? "rotate-180" : ""
                    }`}
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
                </div>
              </div>

              {/* Payment Options Dropdown */}
              {showPaymentOptions && (
                <div className="mt-3 space-y-2">
                  <button
                    onClick={() => {
                      setPaymentMethod("cash");
                      setShowPaymentOptions(false);
                    }}
                    className={`w-full border rounded-lg p-4 text-left transition ${
                      paymentMethod === "cash"
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-green-600"
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
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          Cash on Delivery
                        </p>
                        <p className="text-sm text-gray-500">
                          Pay when you receive your order
                        </p>
                      </div>
                      {paymentMethod === "cash" && (
                        <svg
                          className="w-5 h-5 text-indigo-600 ml-auto"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setPaymentMethod("card");
                      setShowPaymentOptions(false);
                    }}
                    className={`w-full border rounded-lg p-4 text-left transition ${
                      paymentMethod === "card"
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-blue-600"
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
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          Card Payment
                        </p>
                        <p className="text-sm text-gray-500">
                          Pay now with credit/debit card
                        </p>
                      </div>
                      {paymentMethod === "card" && (
                        <svg
                          className="w-5 h-5 text-indigo-600 ml-auto"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-md p-6 sticky top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg
                  className="w-6 h-6 text-indigo-600"
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
                Order Summary
              </h2>

              {/* Restaurant Info - Clickable Dropdown */}
              {cart && (
                <>
                  <div
                    onClick={() => setShowOrderItems(!showOrderItems)}
                    className="flex items-center gap-3 pb-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition"
                  >
                    {cart.restaurant.logo_url ? (
                      <img
                        src={cart.restaurant.logo_url}
                        alt={cart.restaurant.restaurant_name}
                        className="w-14 h-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <span className="text-xl font-bold text-indigo-600">
                          {cart.restaurant.restaurant_name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900">
                        {cart.restaurant.restaurant_name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {cart.total_items} item
                        {cart.total_items !== 1 ? "s" : ""}
                      </p>
                      {/* Distance and Duration Display */}
                      {routeLoading ? (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm text-gray-500">
                            Calculating route...
                          </span>
                        </div>
                      ) : routeInfo ? (
                        <div className="flex items-center gap-3 mt-1">
                          <div className="flex items-center gap-1">
                            <svg
                              className="w-4 h-4 text-orange-500"
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
                            <span className="text-sm font-medium text-orange-600">
                              {routeInfo.distance.toFixed(1)} km
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <svg
                              className="w-4 h-4 text-blue-500"
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
                            <span className="text-sm font-medium text-blue-600">
                              ~{Math.ceil(routeInfo.duration)} min
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        showOrderItems ? "rotate-180" : ""
                      }`}
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
                  </div>

                  {/* Order Items - Collapsible */}
                  {showOrderItems && (
                    <div className="py-4 border-b border-gray-200 max-h-64 overflow-y-auto">
                      <div className="space-y-3">
                        {cart.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3 p-2 bg-gray-50 rounded-lg"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded">
                                  {item.quantity}x
                                </span>
                                <span className="font-medium text-gray-900 text-sm">
                                  {item.food_name}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-xs text-gray-500 bg-white border px-2 py-0.5 rounded">
                                  {item.size.charAt(0).toUpperCase() +
                                    item.size.slice(1)}
                                </span>
                                <span className="text-xs text-gray-400">
                                  @ {formatPrice(item.unit_price)} each
                                </span>
                              </div>
                            </div>
                            <span className="font-semibold text-gray-900 text-sm">
                              {formatPrice(item.total_price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pricing Breakdown */}
                  <div className="py-4 space-y-2">
                    {/* Minimum Order Warning */}
                    {!isSubtotalValid && (
                      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-lg text-sm mb-3">
                        <span className="font-medium">⚠️ Minimum order:</span>{" "}
                        Rs. {MINIMUM_SUBTOTAL}. Add Rs.{" "}
                        {(MINIMUM_SUBTOTAL - subtotal).toFixed(2)} more.
                      </div>
                    )}

                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal</span>
                      <span
                        className={`font-medium ${
                          isSubtotalValid ? "text-gray-900" : "text-red-600"
                        }`}
                      >
                        {formatPrice(subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        Delivery Fee
                        {routeInfo && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({routeInfo.distance.toFixed(1)} km)
                          </span>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">
                        {routeLoading ? (
                          <span className="text-gray-400">Calculating...</span>
                        ) : deliveryFee !== null ? (
                          formatPrice(deliveryFee)
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Service Fee</span>
                      <span className="font-medium text-gray-900">
                        {isSubtotalValid ? (
                          formatPrice(serviceFee)
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-gray-900">
                        Total
                      </span>
                      <span className="text-2xl font-bold text-indigo-600">
                        {totalAmount !== null ? (
                          formatPrice(totalAmount)
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Place Order Button */}
                  <button
                    onClick={handlePlaceOrder}
                    disabled={
                      !isSubtotalValid ||
                      deliveryFee === null ||
                      routeLoading ||
                      placing
                    }
                    className={`w-full mt-6 px-6 py-4 font-bold rounded-lg transition flex items-center justify-center gap-2 ${
                      !isSubtotalValid ||
                      deliveryFee === null ||
                      routeLoading ||
                      placing
                        ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {placing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Placing Order...
                      </>
                    ) : routeLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Calculating...
                      </>
                    ) : !isSubtotalValid ? (
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
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                        Minimum Rs. {MINIMUM_SUBTOTAL} required
                      </>
                    ) : totalAmount !== null ? (
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
                        Place Order • {formatPrice(totalAmount)}
                      </>
                    ) : (
                      "Place Order"
                    )}
                  </button>

                  {/* Error message */}
                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <p className="text-xs text-gray-500 text-center mt-3">
                    By placing this order, you agree to our terms of service
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
