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

/**
 * Food Availability Scheduler
 * Automatically updates food is_available based on available_time slots
 * and current Sri Lanka time.
 *
 * Time slots:
 *   breakfast: 05:00 - 11:59
 *   lunch:     12:01 - 18:00
 *   dinner:    18:00 - 05:00 (overnight)
 *
 * Logic:
 *   - If a food has is_manually_unavailable = true (admin toggled off), skip it.
 *   - Otherwise, check if any of its available_time slots match the current time.
 *   - Set is_available accordingly.
 */

const FOOD_TIME_SLOTS = {
  breakfast: { start: "05:00:00", end: "11:59:00" },
  lunch: { start: "12:01:00", end: "18:00:00" },
  dinner: { start: "18:00:00", end: "05:00:00" }, // overnight
};

function isFoodAvailableNow(availableTimeSlots, currentTime) {
  if (!availableTimeSlots || availableTimeSlots.length === 0) {
    return true; // No slots defined = always available
  }

  for (const slot of availableTimeSlots) {
    const range = FOOD_TIME_SLOTS[slot];
    if (!range) continue;

    const isOvernight = compareTime(range.start, range.end) >= 0;

    if (isOvernight) {
      // e.g. dinner: 18:00 - 05:00
      if (
        compareTime(currentTime, range.start) >= 0 ||
        compareTime(currentTime, range.end) < 0
      ) {
        return true;
      }
    } else {
      // e.g. breakfast: 05:00 - 11:59, lunch: 12:01 - 18:00
      if (
        compareTime(currentTime, range.start) >= 0 &&
        compareTime(currentTime, range.end) <= 0
      ) {
        return true;
      }
    }
  }

  return false;
}

export async function runFoodAvailabilityScheduler() {
  try {
    // Fetch all foods that are NOT manually marked unavailable by admin
    const { data: foods, error } = await supabaseAdmin
      .from("foods")
      .select("id, name, available_time, is_available, is_manually_unavailable")
      .eq("is_manually_unavailable", false);

    if (error) {
      console.error("[FoodScheduler] ❌ DB error:", error.message);
      return;
    }

    if (!foods || foods.length === 0) {
      return;
    }

    const currentTime = getSriLankaTimeString();
    let updatedCount = 0;

    for (const food of foods) {
      const shouldBeAvailable = isFoodAvailableNow(
        food.available_time,
        currentTime,
      );

      if (food.is_available !== shouldBeAvailable) {
        const { error: updateError } = await supabaseAdmin
          .from("foods")
          .update({
            is_available: shouldBeAvailable,
            updated_at: new Date().toISOString(),
          })
          .eq("id", food.id);

        if (updateError) {
          console.error(
            `[FoodScheduler] ❌ Failed to update ${food.name}:`,
            updateError.message,
          );
        } else {
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      console.log(
        `[FoodScheduler] 🍽️ Updated ${updatedCount} food(s) availability (time: ${currentTime})`,
      );
    }
  } catch (err) {
    console.error("[FoodScheduler] ❌ Error:", err.message);
  }
}

// Export the helper for use in API routes (real-time check)
export { isFoodAvailableNow, FOOD_TIME_SLOTS, getSriLankaTimeString };
