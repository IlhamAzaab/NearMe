import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load .env file only if NODE_ENV is not production and .env exists
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase credentials in environment variables");
  console.error(
    "SUPABASE_URL:",
    process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing"
  );
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY:",
    process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓ Set" : "✗ Missing"
  );
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
