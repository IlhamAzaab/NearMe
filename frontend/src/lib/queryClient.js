import { QueryClient } from "@tanstack/react-query";

function isNetworkQueryError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Load failed") ||
    message.includes("Network request failed")
  );
}

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep cache for smooth transitions, but refresh aggressively in background.
      staleTime: 20 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: (failureCount, error) => {
        if (isNetworkQueryError(error)) return false;
        return failureCount < 1;
      },
      networkMode: "online",
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
      refetchInterval: () =>
        typeof navigator !== "undefined" && navigator.onLine
          ? 30 * 1000
          : false,
      refetchIntervalInBackground: true,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (isNetworkQueryError(error)) return false;
        return failureCount < 1;
      },
      networkMode: "online",
    },
  },
});
