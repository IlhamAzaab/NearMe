import { QueryClient } from "@tanstack/react-query";

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep cache for smooth transitions, but refresh aggressively in background.
      staleTime: 20 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: "always",
      refetchOnReconnect: true,
      refetchOnMount: "always",
      refetchInterval: 30 * 1000,
      refetchIntervalInBackground: true,
    },
  },
});
