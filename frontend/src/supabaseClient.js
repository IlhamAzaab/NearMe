import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL or anon key missing. Check environment variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

// Singleton client reused across app to avoid multiple GoTrueClient instances
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default supabaseClient;
