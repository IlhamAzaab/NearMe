import { createClient } from "@supabase/supabase-js";

const sanitizeEnvValue = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  // Handle values pasted with surrounding quotes in cloud env dashboards.
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const supabaseUrl = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = sanitizeEnvValue(
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL or key missing. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY).",
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
