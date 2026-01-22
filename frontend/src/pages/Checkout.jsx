import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
      <div className="min-h-screen bg-gray-50 font-poppins">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate("/cart")}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
                <p className="text-xs text-gray-500">Complete your order</p>
              </div>
            </div>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-orange-100 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-500 text-sm font-medium">Loading checkout...</p>
        </div>
      </div>
    );
  }

  // Order Success Screen
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 font-poppins">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
              <span className="text-white text-lg font-bold">N</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Order Placed</h1>
              <p className="text-xs text-gray-500">Thank you for your order!</p>
            </div>
          </div>
        </header>

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
                    : orderSuccess.payment_method === "card"
                    ? "Card Payment"
                    : "UPI / Wallet"}
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
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate("/cart")}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                <span className="text-white text-lg font-bold">N</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
                <p className="text-xs text-gray-500">Complete your order</p>
              </div>
            </div>
          </div>
        </header>

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

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-28">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate("/cart")}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF7A00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
              <span className="text-white text-lg font-bold">N</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
              <p className="text-xs text-gray-500">Complete your order details</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-5 max-w-lg mx-auto">
        <div className="space-y-5">
          {/* Delivery Address Card */}
          <div 
            className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] p-5 cursor-pointer hover:shadow-[0_6px_24px_rgba(0,0,0,0.08)] transition-shadow duration-300"
            onClick={() => navigate("/profile")}
          >
            {/* Header Row */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-50 to-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">Delivery Address</h2>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/profile");
                }}
                className="text-[#FF7A00] text-sm font-semibold hover:text-orange-600 transition-colors"
              >
                Change
              </button>
            </div>

            {/* Content Rows */}
            <div className="space-y-4">
              {/* Row 1 - Phone */}
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-orange-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Phone</p>
                  <p className="text-[15px] font-semibold text-gray-900 truncate">{phone || "Not provided"}</p>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gray-100 mx-2"></div>

              {/* Row 2 - Address */}
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 bg-orange-50 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Address</p>
                  <p className="text-[15px] font-bold text-gray-900 leading-snug">{address || "Not provided"}</p>
                  {city && <p className="text-sm text-gray-500 mt-1">{city}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Location Hint */}
          <div className="flex items-center gap-2 px-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-xs text-gray-400">Delivery Location <span className="text-gray-500">(Tap map to adjust)</span></p>
          </div>

          {/* Map Card */}
          <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="relative">
              <MapContainer
                center={position || [7.8731, 80.7718]}
                zoom={15}
                style={{ height: "180px", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker position={position} setPosition={setPosition} />
                <MapController center={mapCenter} />
              </MapContainer>
            </div>
            <div className="p-4">
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={locating}
                className="w-full py-3.5 bg-gradient-to-r from-orange-50 to-orange-100 text-[#FF7A00] font-semibold rounded-2xl hover:from-orange-100 hover:to-orange-150 disabled:from-gray-100 disabled:to-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2.5"
              >
                {locating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
                    <span>Getting location...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Use My Current Location</span>
                  </>
                )}
              </button>
            </div>
          </div>

            {/* Payment Method Card */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-[#FF7A00]"
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
                Payment Method
              </h2>

              <div className="space-y-3">
                {/* Cash on Delivery */}
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                    paymentMethod === "cash"
                      ? "border-[#FF7A00] bg-orange-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === "cash" ? "border-[#FF7A00]" : "border-gray-300"
                  }`}>
                    {paymentMethod === "cash" && (
                      <div className="w-3 h-3 bg-[#FF7A00] rounded-full"></div>
                    )}
                  </div>
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900">Cash on Delivery</p>
                    <p className="text-xs text-gray-500">Pay when you receive</p>
                  </div>
                </button>

                {/* Card Payment */}
                <button
                  onClick={() => setPaymentMethod("card")}
                  className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                    paymentMethod === "card"
                      ? "border-[#FF7A00] bg-orange-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === "card" ? "border-[#FF7A00]" : "border-gray-300"
                  }`}>
                    {paymentMethod === "card" && (
                      <div className="w-3 h-3 bg-[#FF7A00] rounded-full"></div>
                    )}
                  </div>
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900">Card Payment</p>
                    <p className="text-xs text-gray-500">Credit/Debit card</p>
                  </div>
                </button>

                {/* UPI/Wallet */}
                
                 
              </div>
            </div>

            {/* Promo Code Card */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                Promo Code
              </h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Enter promo code"
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF7A00]/40 focus:border-[#FF7A00] transition-all text-sm"
                />
                <button className="px-6 py-3 bg-[#FF7A00] text-white font-semibold rounded-xl hover:bg-orange-600 transition">
                  Apply
                </button>
              </div>
            </div>

            {/* Order Summary Card */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              Order Summary
            </h2>

            {/* Restaurant Info - Clickable Dropdown */}
            {cart && (
              <>
                <div
                  onClick={() => setShowOrderItems(!showOrderItems)}
                  className="flex items-center gap-3 pb-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 rounded-xl p-3 -mx-1 transition"
                >
                  {cart.restaurant.logo_url ? (
                    <img
                      src={cart.restaurant.logo_url}
                      alt={cart.restaurant.restaurant_name}
                      className="w-14 h-14 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-orange-100 flex items-center justify-center">
                      <span className="text-xl font-bold text-[#FF7A00]">
                        {cart.restaurant.restaurant_name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900">
                      {cart.restaurant.restaurant_name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {cart.total_items} item{cart.total_items !== 1 ? "s" : ""}
                    </p>
                    {/* Distance and Duration Display */}
                    {routeLoading ? (
                      <div className="flex items-center gap-1 mt-1">
                        <div className="w-3 h-3 border-2 border-[#FF7A00] border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-500">Calculating route...</span>
                      </div>
                    ) : routeInfo ? (
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-[#FF7A00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-sm font-medium text-[#FF7A00]">{routeInfo.distance.toFixed(1)} km</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-600">~{Math.ceil(routeInfo.duration)} min</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${showOrderItems ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Order Items - Collapsible */}
                {showOrderItems && (
                  <div className="py-4 border-b border-gray-100 max-h-64 overflow-y-auto">
                    <div className="space-y-3">
                      {cart.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-xl"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#FF7A00] text-white text-xs font-bold px-2 py-1 rounded-lg">
                                {item.quantity}x
                              </span>
                              <span className="font-medium text-gray-900 text-sm">
                                {item.food_name}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-lg">
                                {item.size.charAt(0).toUpperCase() + item.size.slice(1)}
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
                <div className="py-4 space-y-3">
                  {/* Minimum Order Warning */}
                  {!isSubtotalValid && (
                    <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-xl text-sm mb-3 flex items-center gap-2">
                      <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>
                        <span className="font-medium">Minimum order:</span> Rs. {MINIMUM_SUBTOTAL}. Add Rs. {(MINIMUM_SUBTOTAL - subtotal).toFixed(2)} more.
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className={`font-medium ${isSubtotalValid ? "text-gray-900" : "text-red-600"}`}>
                      {formatPrice(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Delivery Fee
                      {routeInfo && (
                        <span className="text-xs text-gray-400 ml-1">({routeInfo.distance.toFixed(1)} km)</span>
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
                  <div className="flex justify-between">
                    <span className="text-gray-600">Service Fee</span>
                    <span className="font-medium text-gray-900">
                      {isSubtotalValid ? formatPrice(serviceFee) : <span className="text-gray-400">--</span>}
                    </span>
                  </div>
                </div>

                {/* Total */}
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Total</span>
                    <span className="text-2xl font-bold text-[#FF7A00]">
                      {totalAmount !== null ? formatPrice(totalAmount) : <span className="text-gray-400">--</span>}
                    </span>
                  </div>
                </div>

                {/* Error message */}
                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {error}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Fixed Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 pb-6 shadow-lg">
          <button
            onClick={handlePlaceOrder}
            disabled={!isSubtotalValid || deliveryFee === null || routeLoading || placing}
            className={`w-full py-4 font-bold rounded-full transition flex items-center justify-center gap-2 shadow-lg ${
              !isSubtotalValid || deliveryFee === null || routeLoading || placing
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-[#FF7A00] text-white hover:bg-orange-600 shadow-orange-200"
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Minimum Rs. {MINIMUM_SUBTOTAL} required
              </>
            ) : totalAmount !== null ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Place Order • {formatPrice(totalAmount)}
              </>
            ) : (
              "Place Order"
            )}
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            By placing this order, you agree to our terms of service
          </p>
        </div>
      </div>
  );
};

export default Checkout;
