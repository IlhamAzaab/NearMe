import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AuthSessionWatcher() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => {
      navigate("/login", { replace: true });
    };

    window.addEventListener("auth:logout", handler);
    return () => {
      window.removeEventListener("auth:logout", handler);
    };
  }, [navigate]);

  return null;
}
