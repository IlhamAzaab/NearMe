import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRole }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // Not logged in - redirect to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Wrong role - redirect to their dashboard or home
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

  // Correct role - render the component
  return children;
}
