import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CompleteProfile from "./pages/CompleteProfile";
import VerifyEmail from "./pages/VerifyEmail";
import RestaurantFoods from "./pages/RestaurantFoods";
import FoodDetail from "./pages/FoodDetail";
import Cart from "./pages/Cart";
import CheckoutWrapper from "./pages/CheckoutWrapper";
import PlacingOrder from "./pages/PlacingOrder";
import OrderReceived from "./pages/OrderReceived";
import DriverAccepted from "./pages/DriverAccepted";
import OrderPickedUp from "./pages/OrderPickedUp";
import OrderOnTheWay from "./pages/OrderOnTheWay";
import OrderDelivered from "./pages/OrderDelivered";
import PastOrderDetails from "./pages/PastOrderDetails";
import CustomerOrders from "./pages/Orders";
import TrackOrder from "./pages/TrackOrder";
import ManagerDashboard from "./pages/manager/Dashboard";
import AddAdmin from "./pages/manager/restaurants/AddAdmin";
import AdminManagement from "./pages/manager/restaurants/AdminManagement";
import RestaurantManagement from "./pages/manager/restaurants/RestaurantManagement";
import PendingRestaurants from "./pages/manager/restaurants/PendingRestaurants";
import AddDriver from "./pages/manager/drivers/AddDriver";
import DriverManagement from "./pages/manager/drivers/DriverManagement";
import DriverVerification from "./pages/manager/drivers/DriverVerification";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProfile from "./pages/admin/AdminProfile";
import RestaurantDetail from "./pages/admin/RestaurantDetail";
import Products from "./pages/admin/Products";
import Categories from "./pages/admin/Categories";
import Orders from "./pages/admin/Orders";
import Settings from "./pages/admin/Settings";
import Earnings from "./pages/admin/Earnings";
import AdminOnboardingStep1 from "./pages/admin/onboarding/Step1";
import AdminOnboardingStep2 from "./pages/admin/onboarding/Step2";
import AdminOnboardingStep3 from "./pages/admin/onboarding/Step3";
import AdminOnboardingStep4 from "./pages/admin/onboarding/Step4";
import AdminRestaurantPending from "./pages/admin/onboarding/Pending";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminDashboardRoute from "./components/AdminDashboardRoute";
import DriverDashboard from "./pages/driver/Dashboard";
import DriverProfile from "./pages/driver/Profile";
import DriverDashboardRoute from "./components/DriverDashboardRoute";
import OnboardingStep1 from "./pages/driver/OnboardingStep1";
import OnboardingStep2 from "./pages/driver/OnboardingStep2";
import OnboardingStep3 from "./pages/driver/OnboardingStep3";
import OnboardingStep4 from "./pages/driver/OnboardingStep4";
import OnboardingStep5 from "./pages/driver/OnboardingStep5";
import DriverPending from "./pages/driver/DriverPending";
import AvailableDeliveries from "./pages/driver/AvailableDeliveries";
import { NotificationProvider } from "./contexts/NotificationContext";
import NotificationBar from "./components/NotificationBar";
import RealtimeNotificationListener from "./components/RealtimeNotificationListener";
import DriverDeliveryNotificationListener from "./components/DriverDeliveryNotificationListener";
import ActiveDeliveries from "./pages/driver/ActiveDeliveries";
// Choose map implementation: Google Maps (new) or Leaflet (legacy)
// Set USE_GOOGLE_MAPS=true in .env to use Google Maps
const USE_GOOGLE_MAPS = import.meta.env.VITE_USE_GOOGLE_MAPS === "true";
import DriverMapPageLeaflet from "./pages/driver/DriverMapPage";
import DriverMapPageGoogle from "./pages/driver/DriverMapPageGoogle";
const DriverMapPage = USE_GOOGLE_MAPS
  ? DriverMapPageGoogle
  : DriverMapPageLeaflet;
import DeliveryTracking from "./pages/DeliveryTracking";
import DriverNotifications from "./pages/driver/Notifications";
import DeliveryHistory from "./pages/driver/DeliveryHistory";
import DriverEarnings from "./pages/driver/DriverEarnings";
import CustomerNotifications from "./pages/CustomerNotifications";
import AdminNotifications from "./pages/admin/AdminNotifications";
import CustomerProfile from "./pages/CustomerProfile";

function App() {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <NotificationBar />
        <RealtimeNotificationListener />
        <DriverDeliveryNotificationListener />
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRole="customer">
                <Home />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route path="/auth/verify-email" element={<VerifyEmail />} />
          <Route
            path="/restaurant/:restaurantId/foods"
            element={
              <ProtectedRoute allowedRole="customer">
                <RestaurantFoods />
              </ProtectedRoute>
            }
          />
          <Route path="/auth/complete-profile" element={<CompleteProfile />} />
          {/* Food Detail Route - Customer Only */}
          <Route
            path="/restaurant/:restaurantId/food/:foodId"
            element={
              <ProtectedRoute allowedRole="customer">
                <FoodDetail />
              </ProtectedRoute>
            }
          />

          {/* Cart Route - Customer Only */}
          <Route
            path="/cart"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <Cart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customer/notifications"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <CustomerNotifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customer/profile"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <CustomerProfile />
              </ProtectedRoute>
            }
          />

          {/* Checkout Route - Customer Only */}
          <Route
            path="/checkout"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <CheckoutWrapper />
              </ProtectedRoute>
            }
          />

          {/* Placing Order Confirmation Screen */}
          <Route
            path="/placing-order"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <PlacingOrder />
              </ProtectedRoute>
            }
          />

          {/* Order Received - Restaurant accepted */}
          <Route
            path="/order-received/:orderId"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <OrderReceived />
              </ProtectedRoute>
            }
          />

          {/* Driver Accepted - Driver accepted the order */}
          <Route
            path="/driver-accepted/:orderId"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <DriverAccepted />
              </ProtectedRoute>
            }
          />

          {/* Order Picked Up - Driver picked up the order */}
          <Route
            path="/order-picked-up/:orderId"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <OrderPickedUp />
              </ProtectedRoute>
            }
          />

          {/* Order On The Way - Driver heading to customer with live tracking */}
          <Route
            path="/order-on-the-way/:orderId"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <OrderOnTheWay />
              </ProtectedRoute>
            }
          />
          {/* Order Delivered - Receipt page when delivery is complete */}
          <Route
            path="/order-delivered/:orderId"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <OrderDelivered />
              </ProtectedRoute>
            }
          />
          {/* Past Order Details - View details of delivered/cancelled orders */}
          <Route
            path="/order-details/:orderId"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <PastOrderDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <CustomerOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:orderId"
            element={
              <ProtectedRoute allowedRole="customer" requireAuth={true}>
                <TrackOrder />
              </ProtectedRoute>
            }
          />

          {/* Manager Routes - Protected */}
          <Route
            path="/manager/dashboard"
            element={
              <ProtectedRoute allowedRole="manager">
                <ManagerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager/restaurants/addadmin"
            element={
              <ProtectedRoute allowedRole="manager">
                <AddAdmin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager/restaurants/admins"
            element={
              <ProtectedRoute allowedRole="manager">
                <AdminManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager/restaurants/manage"
            element={
              <ProtectedRoute allowedRole="manager">
                <RestaurantManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager/restaurants/pending"
            element={
              <ProtectedRoute allowedRole="manager">
                <PendingRestaurants />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager/drivers/add"
            element={
              <ProtectedRoute allowedRole="manager">
                <AddDriver />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager/drivers/manage"
            element={
              <ProtectedRoute allowedRole="manager">
                <DriverManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager/drivers/verify"
            element={
              <ProtectedRoute allowedRole="manager">
                <DriverVerification />
              </ProtectedRoute>
            }
          />
          {/* Admin Routes - Protected */}
          <Route
            path="/admin/dashboard"
            element={
              <AdminDashboardRoute>
                <AdminDashboard />
              </AdminDashboardRoute>
            }
          />
          <Route
            path="/admin/restaurant/onboarding/step-1"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminOnboardingStep1 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/restaurant/onboarding/step-2"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminOnboardingStep2 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/restaurant/onboarding/step-3"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminOnboardingStep3 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/restaurant/onboarding/step-4"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminOnboardingStep4 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/restaurant/pending"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminRestaurantPending />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/profile" element={<AdminProfile />} />
          <Route
            path="/admin/restaurant"
            element={
              <AdminDashboardRoute>
                <RestaurantDetail />
              </AdminDashboardRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <AdminDashboardRoute>
                <Products />
              </AdminDashboardRoute>
            }
          />
          <Route
            path="/admin/categories"
            element={
              <AdminDashboardRoute>
                <Categories />
              </AdminDashboardRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <AdminDashboardRoute>
                <Orders />
              </AdminDashboardRoute>
            }
          />
          <Route
            path="/admin/earnings"
            element={
              <AdminDashboardRoute>
                <Earnings />
              </AdminDashboardRoute>
            }
          />
          <Route
            path="/admin/notifications"
            element={
              <AdminDashboardRoute>
                <AdminNotifications />
              </AdminDashboardRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminDashboardRoute>
                <Settings />
              </AdminDashboardRoute>
            }
          />
          {/* Driver Routes - Protected */}
          <Route
            path="/driver/dashboard"
            element={
              <DriverDashboardRoute>
                <DriverDashboard />
              </DriverDashboardRoute>
            }
          />
          <Route
            path="/driver/profile"
            element={
              <ProtectedRoute allowedRole="driver">
                <DriverProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/onboarding/step-1"
            element={
              <ProtectedRoute allowedRole="driver">
                <OnboardingStep1 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/onboarding/step-2"
            element={
              <ProtectedRoute allowedRole="driver">
                <OnboardingStep2 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/onboarding/step-3"
            element={
              <ProtectedRoute allowedRole="driver">
                <OnboardingStep3 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/onboarding/step-4"
            element={
              <ProtectedRoute allowedRole="driver">
                <OnboardingStep4 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/onboarding/step-5"
            element={
              <ProtectedRoute allowedRole="driver">
                <OnboardingStep5 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/pending"
            element={
              <ProtectedRoute allowedRole="driver">
                <DriverPending />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/deliveries"
            element={
              <ProtectedRoute allowedRole="driver">
                <AvailableDeliveries />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/deliveries/active"
            element={
              <ProtectedRoute allowedRole="driver">
                <ActiveDeliveries />
              </ProtectedRoute>
            }
          />

          <Route
            path="/driver/delivery/active/:deliveryId/map"
            element={
              <ProtectedRoute allowedRole="driver">
                <DriverMapPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/delivery/active/map"
            element={
              <ProtectedRoute allowedRole="driver">
                <DeliveryTracking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/notifications"
            element={
              <ProtectedRoute allowedRole="driver">
                <DriverNotifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/history"
            element={
              <ProtectedRoute allowedRole="driver">
                <DeliveryHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver/earnings"
            element={
              <ProtectedRoute allowedRole="driver">
                <DriverEarnings />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}

export default App;
