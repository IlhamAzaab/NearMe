import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const Home = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [restaurants, setRestaurants] = useState([]);
  const [allFoods, setAllFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const activeTab = searchParams.get("tab") || "home";

  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };

  const fetchRestaurants = async (search = "") => {
    try {
      setLoading(true);
      const url = new URL("http://localhost:5000/public/restaurants");
      if (search) url.searchParams.append("search", search);

      const res = await fetch(url);
      const data = await res.json();
      setRestaurants(data.restaurants || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllFoods = async (search = "") => {
    try {
      setLoading(true);
      const url = new URL("http://localhost:5000/public/foods");
      if (search) url.searchParams.append("search", search);

      const res = await fetch(url);
      const data = await res.json();
      setAllFoods(data.foods || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data base on active tab and search query
  useEffect(() => {
    const delay = setTimeout(() => {
      if (activeTab === "menu") {
        fetchAllFoods(searchQuery);
      } else if (activeTab === "home") {
        fetchRestaurants(searchQuery);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [searchQuery, activeTab]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Header - Works for both mobile and web */}
      <header className="bg-orange-500 p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button 
            onClick={() => setActiveTab("home")}
            className="text-white text-xl font-bold hidden md:block whitespace-nowrap hover:opacity-90"
          >
            NearMe
          </button>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6 ml-4">
            <button
              onClick={() => setActiveTab("home")}
              className={`text-sm font-medium transition-colors ${
                activeTab === "home" ? "text-white" : "text-white/70 hover:text-white"
              }`}
            >
              Restaurants
            </button>
            <button
              onClick={() => setActiveTab("menu")}
              className={`text-sm font-medium transition-colors ${
                activeTab === "menu" ? "text-white" : "text-white/70 hover:text-white"
              }`}
            >
              Menu
            </button>
          </div>

          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === "menu" ? "Search food items..." : "Search restaurants..."}
              className="w-full pl-10 pr-4 py-2 rounded-full text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
          
          <button 
            onClick={() => navigate("/cart")}
            className="text-white hover:opacity-80 relative"
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
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto p-4 flex flex-col items-center">
        <div className="w-full max-w-lg mx-auto mt-2">
          <div className="bg-orange-500 rounded-2xl px-6 py-5 shadow-lg flex items-center justify-between gap-4 overflow-hidden">
            {/* Text Content */}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">
                Near You
              </h2>
              <p className="text-sm text-white/90 mt-2">
                Stay safe while using our services ❤️
              </p>
            </div>

            {/* Animated Delivery Bike */}
            <div className="flex-shrink-0 animate-delivery-bike">
              <svg
                className="w-20 h-20 text-white"
                viewBox="0 0 64 64"
                fill="currentColor"
              >
                {/* Delivery Box */}
                <rect x="28" y="18" width="16" height="12" rx="2" className="text-orange-200" fill="currentColor" />
                <rect x="30" y="20" width="12" height="3" rx="1" className="text-orange-300" fill="currentColor" />

                {/* Bike Frame */}
                <path
                  d="M20 44 L28 36 L38 36 L42 44"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  fill="none"
                  className="text-white"
                />
                <line x1="28" y1="36" x2="28" y2="44" stroke="currentColor" strokeWidth="2.5" className="text-white" />
                <line x1="38" y1="36" x2="38" y2="30" stroke="currentColor" strokeWidth="2.5" className="text-white" />

                {/* Handle */}
                <path d="M36 30 L42 30 L44 28" stroke="currentColor" strokeWidth="2" fill="none" className="text-white" />

                {/* Seat */}
                <ellipse cx="28" cy="34" rx="3" ry="1.5" className="text-orange-200" fill="currentColor" />

                {/* Back Wheel */}
                <circle cx="20" cy="44" r="7" stroke="currentColor" strokeWidth="2.5" fill="none" className="text-white animate-spin-slow" />
                <circle cx="20" cy="44" r="2" fill="currentColor" className="text-white" />

                {/* Front Wheel */}
                <circle cx="44" cy="44" r="7" stroke="currentColor" strokeWidth="2.5" fill="none" className="text-white animate-spin-slow" />
                <circle cx="44" cy="44" r="2" fill="currentColor" className="text-white" />

                {/* Rider (simplified) */}
                <circle cx="32" cy="24" r="4" className="text-orange-100" fill="currentColor" />
                <path d="M30 28 L28 34 M34 28 L38 32" stroke="currentColor" strokeWidth="2" className="text-orange-100" />
              </svg>
            </div>
          </div>

          {/* CSS Animation */}
          <style>{`
            @keyframes delivery-bike {
              0%, 100% { 
                transform: translateX(0px) translateY(0px); 
              }
              25% { 
                transform: translateX(4px) translateY(-2px); 
              }
              50% { 
                transform: translateX(8px) translateY(0px); 
              }
              75% { 
                transform: translateX(4px) translateY(-1px); 
              }
            }
            
            @keyframes spin-slow {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            
            .animate-delivery-bike {
              animation: delivery-bike 2s ease-in-out infinite;
            }
            
            .animate-spin-slow {
              animation: spin-slow 1.5s linear infinite;
              transform-origin: center;
              transform-box: fill-box;
            }
          `}</style>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === "menu" ? (
          /* All Foods Grid */
          <div className="w-full mt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">All Menu Items</h3>
            {allFoods.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <p>No food items available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {allFoods.map((food) => (
                  <div
                    key={food.id}
                    onClick={() => navigate(`/restaurant/${food.restaurant_id}/foods`)}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] transition-all duration-300 ease-in-out"
                  >
                    <div className="relative">
                      <img
                        src={food.image_url || "https://via.placeholder.com/300x200?text=Food"}
                        alt={food.name}
                        className="w-full h-36 object-cover"
                      />
                      {food.restaurants && (
                        <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-medium px-2 py-1 rounded-full">
                          {food.restaurants.restaurant_name}
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-full shadow-md">
                        ₹{food.price}
                      </div>
                    </div>
                    <div className="p-4">
                      <h4 className="font-bold text-gray-800 truncate">{food.name}</h4>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {food.description || "Delicious food item"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Restaurants Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full mt-6">
            {restaurants.map((r) => (
              <div
                key={r.id}
                onClick={() => navigate(`/restaurant/${r.id}/foods`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4 cursor-pointer hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] transition-all duration-300 ease-in-out"
              >
                <div className="relative">
                  <img
                    src={r.logo_url || "https://via.placeholder.com/80"}
                    alt={r.restaurant_name}
                    className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover"
                  />
                  {r.rating && (
                    <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
                      ★{r.rating}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800">
                    {r.restaurant_name}
                  </h3>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <svg
                      className="w-3 h-3 text-orange-500"
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
                    </svg>
                    {r.city || "Nearby"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bottom Nav - Hidden on Desktop logic is handled via styling to keep it only at bottom for mobile experience */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-orange-500 flex justify-around py-3 px-2 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-50">
        <NavItem
          icon={
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          }
          label="Home"
          active={activeTab === "home"}
          onClick={() => setActiveTab("home")}
        />
        <NavItem
          icon={
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          }
          label="Menu"
          active={activeTab === "menu"}
          onClick={() => setActiveTab("menu")}
        />
        <NavItem
          icon={
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          }
          label="Cart"
          active={false}
          onClick={() => navigate("/cart")}
        />
        <NavItem
          icon={
            <svg
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          }
          label="Profile"
          active={false}
          onClick={() => navigate("/auth/complete-profile")}
        />
      </div>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 text-[10px] transition-all duration-200 ${active
      ? "text-white scale-110 font-bold"
      : "text-white/60 hover:text-white/80"
      }`}
  >
    <div className={`p-1.5 rounded-full transition-all duration-200 ${active ? "bg-white/20" : ""}`}>
      {React.cloneElement(icon, { className: "w-6 h-6" })}
    </div>
    {label}
  </button>
);

export default Home;
