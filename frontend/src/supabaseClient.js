import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL or anon key missing. Check environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

// Singleton client reused across app to avoid multiple GoTrueClient instances
// Configure realtime to be more resilient
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      "X-Client-Info": "nearme-web",
    },
  },
  auth: {
    persistSession: false, // We manage our own JWT tokens
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// Helper to check if realtime is available
export const isRealtimeAvailable = () => {
  return !!supabaseUrl && !!supabaseAnonKey;
};

// Helper to get auth headers with JWT token from localStorage
export const getSupabaseHeaders = () => {
  const token = localStorage.getItem("token");
  if (!token || token === "null" || token === "undefined") {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`,
  };
};

export default supabaseClient;
