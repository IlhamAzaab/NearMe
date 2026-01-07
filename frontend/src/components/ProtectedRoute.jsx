import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRole }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // Special handling for customer-allowed routes:
  // - If no token (guest), allow browsing (browse-as-client behavior)
  // - If token exists and role is customer, allow
  // - If token exists and role is not customer, redirect them away
  if (allowedRole === "customer") {
    if (!token) {
      // Guest browsing allowed for customer pages
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
        return <Navigate to="/" replace />;
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
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
