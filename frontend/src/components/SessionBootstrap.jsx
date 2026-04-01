import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getPostAuthRoute,
  restoreSessionFromToken,
} from "../services/authService";

const AUTH_PAGES = new Set(["/login", "/signup"]);

export default function SessionBootstrap() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    let active = true;

    if (hasBootstrappedRef.current && !AUTH_PAGES.has(location.pathname)) {
      return () => {
        active = false;
      };
    }

    async function bootstrapAuthSession() {
      const result = await restoreSessionFromToken();
      if (!active) {
        return;
      }

      hasBootstrappedRef.current = true;

      if (!result.restored || !result.user) {
        if (AUTH_PAGES.has(location.pathname)) {
          return;
        }

        const hasToken = Boolean(localStorage.getItem("token"));
        if (!hasToken) {
          return;
        }

        navigate("/login", { replace: true });
        return;
      }

      const destination = getPostAuthRoute(result.user);

      if (
        result.user.role === "customer" &&
        !result.user.profileCompleted &&
        location.pathname !== "/auth/complete-profile"
      ) {
        navigate("/auth/complete-profile", { replace: true });
        return;
      }

      if (AUTH_PAGES.has(location.pathname)) {
        navigate(destination, { replace: true });
      }
    }

    bootstrapAuthSession();

    return () => {
      active = false;
    };
  }, [location.pathname, navigate]);

  return null;
}
