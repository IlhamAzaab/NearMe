import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRole, requireAuth = false }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // Special handling for customer-allowed routes:
  // - If requireAuth is true, require authentication
  // - If no token (guest) and requireAuth is false, allow browsing (browse-as-client behavior)
  // - If token exists and role is customer, allow
  // - If token exists and role is not customer, redirect them away
  if (allowedRole === "customer") {
    if (!token) {
      // If requireAuth is true, redirect to login
      if (requireAuth) {
        return <Navigate to="/login" replace />;
      }
      // Guest browsing allowed for customer pages when requireAuth is false
      return children;
    }

    if (role !== "customer") {
      if (role === "manager") {
        return <Navigate to="/manager/dashboard" replace />;
      } else if (role === "admin") {
        return <Navigate to="/admin/dashboard" replace />;
      } else if (role === "driver") {
        return <Navigate to="/driver/dashboard" replace />;
      } else {
        return <Navigate to="/welcome" replace />;
      }
    }

    return children;
  }

  // For all other roles, require authentication and exact role match
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (role !== allowedRole) {
    if (role === "manager") {
      return <Navigate to="/manager/dashboard" replace />;
    } else if (role === "admin") {
      return <Navigate to="/admin/dashboard" replace />;
    } else if (role === "driver") {
      return <Navigate to="/driver/dashboard" replace />;
    } else {
      return <Navigate to="/welcome" replace />;
    }
  }

  return children;
}
