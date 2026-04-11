import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { estimateCustomerQueryCacheUsage } from "../hooks/useCustomerNotifications";

export default function CustomerCacheDiagnostics() {
  const queryClient = useQueryClient();
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.PROD) return;

    const role = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    if (!token || role !== "customer") return;

    const metrics = estimateCustomerQueryCacheUsage(queryClient);

    window.__customerCacheMetrics = metrics;
    window.__customerCacheQueryClient = queryClient;

    console.info("[CustomerCache] snapshot", {
      path: location.pathname,
      queryCount: metrics.queryCount,
      estimatedKB: metrics.estimatedKB,
    });
  }, [location.pathname, queryClient]);

  return null;
}
