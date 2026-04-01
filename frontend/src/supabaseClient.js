import { createClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://kkavlrxlkvwpmujwjzxl.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYXZscnhsa3Z3cG11andqenhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MzM1NDUsImV4cCI6MjA4MjUwOTU0NX0.FX6sk8LvYno6a-MYF-RgdcoGJjgm42XF3NoX9hC2L2s";

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

const getProjectRefFromUrl = (url) => {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
};

const getProjectRefFromAnonKey = (key) => {
  try {
    const parts = String(key || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded));
    return parsed?.ref || null;
  } catch {
    return null;
  }
};

const resolveSupabaseConfig = () => {
  const envUrl = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
  const envKey = sanitizeEnvValue(
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );

  if (!envUrl || !envKey) {
    console.warn(
      "Supabase env missing. Falling back to built-in project config.",
    );
    return {
      url: FALLBACK_SUPABASE_URL,
      key: FALLBACK_SUPABASE_ANON_KEY,
    };
  }

  const urlRef = getProjectRefFromUrl(envUrl);
  const keyRef = getProjectRefFromAnonKey(envKey);

  if (urlRef && keyRef && urlRef !== keyRef) {
    console.warn(
      "Supabase env ref mismatch (URL and key point to different projects). Falling back to built-in project config.",
    );
    return {
      url: FALLBACK_SUPABASE_URL,
      key: FALLBACK_SUPABASE_ANON_KEY,
    };
  }

  return { url: envUrl, key: envKey };
};

const { url: supabaseUrl, key: supabaseAnonKey } = resolveSupabaseConfig();

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
