/**
 * Restaurant Auto Open/Close Scheduler
 * Automatically updates restaurant is_open status based on opening_time and close_time
 * Respects is_manually_overridden - restaurants with manual override are skipped
 */

import { supabaseAdmin } from "../supabaseAdmin.js";

/**
 * Get current time in Sri Lanka (UTC+5:30) as HH:MM:SS string
 */
function getSriLankaTimeString() {
  const now = new Date();
  // Sri Lanka is UTC+5:30
  const sriLankaOffset = 5.5 * 60; // in minutes
  const utcOffset = now.getTimezoneOffset(); // in minutes (negative for east)
  const sriLankaTime = new Date(
    now.getTime() + (sriLankaOffset + utcOffset) * 60 * 1000,
  );

  const hours = sriLankaTime.getHours().toString().padStart(2, "0");
  const minutes = sriLankaTime.getMinutes().toString().padStart(2, "0");
  const seconds = sriLankaTime.getSeconds().toString().padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Compare two time strings (HH:MM:SS or HH:MM format)
 * Returns: negative if a < b, 0 if equal, positive if a > b
 */
function compareTime(a, b) {
  const [aH, aM, aS = 0] = a.split(":").map(Number);
  const [bH, bM, bS = 0] = b.split(":").map(Number);

  const aSeconds = aH * 3600 + aM * 60 + aS;
  const bSeconds = bH * 3600 + bM * 60 + bS;

  return aSeconds - bSeconds;
}

/**
 * Check if current time is between opening and closing time
 * Handles overnight cases (e.g., 22:00 to 06:00)
 */
function isWithinOperatingHours(openingTime, closeTime, currentTime) {
  if (!openingTime || !closeTime) {
    // If times not set, default to open
    return true;
  }

  const openCmp = compareTime(currentTime, openingTime);
  const closeCmp = compareTime(currentTime, closeTime);
  const openVsClose = compareTime(openingTime, closeTime);

  if (openVsClose < 0) {
    // Normal case: opening time is before closing time (e.g., 09:00 - 22:00)
    return openCmp >= 0 && closeCmp < 0;
  } else {
    // Overnight case: opening time is after closing time (e.g., 22:00 - 06:00)
    return openCmp >= 0 || closeCmp < 0;
  }
}

/**
 * Run the auto open/close check for all restaurants
 */
export async function runRestaurantScheduler() {
  try {
    // Fetch all active restaurants that are NOT manually overridden
    const { data: restaurants, error } = await supabaseAdmin
      .from("restaurants")
      .select(
        "id, restaurant_name, opening_time, close_time, is_open, is_manually_overridden",
      )
      .eq("restaurant_status", "active")
      .eq("is_manually_overridden", false);

    if (error) {
      console.error("[RestaurantScheduler] ❌ DB error:", error.message);
      return;
    }

    if (!restaurants || restaurants.length === 0) {
      return; // No restaurants to check
    }

    const currentTime = getSriLankaTimeString();

    for (const r of restaurants) {
      const shouldBeOpen = isWithinOperatingHours(
        r.opening_time,
        r.close_time,
        currentTime,
      );

      // Only update if status differs
      if (r.is_open !== shouldBeOpen) {
        const { error: updateError } = await supabaseAdmin
          .from("restaurants")
          .update({
            is_open: shouldBeOpen,
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);

        if (updateError) {
          console.error(
            `[RestaurantScheduler] ❌ Failed to update ${r.restaurant_name}:`,
            updateError.message,
          );
        } else {
          console.log(
            `[RestaurantScheduler] ${shouldBeOpen ? "🟢 Opened" : "🔴 Closed"} ${r.restaurant_name} (time: ${currentTime})`,
          );
        }
      }
    }
  } catch (err) {
    console.error("[RestaurantScheduler] ❌ Error:", err.message);
  }
}
