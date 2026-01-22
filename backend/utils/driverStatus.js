/**
 * Driver Status Utility Functions
 * Manages driver availability based on working_time schedules
 */

/**
 * Check if driver should be active based on working_time
 * @param {string} workingTime - 'full_time', 'morning', or 'night'
 * @param {Date} currentTime - Current date/time (defaults to now)
 * @returns {boolean} - True if driver should be active
 */
export function isDriverActiveTime(workingTime, currentTime = new Date()) {
  if (!workingTime) return false;

  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  switch (workingTime) {
    case "full_time":
      // Full time drivers are always active
      return true;

    case "morning":
      // Day Time: 6:00 AM (360 min) to 6:30 PM (1110 min)
      return timeInMinutes >= 360 && timeInMinutes < 1110;

    case "night":
      // Night Time: 6:00 PM (1080 min) to 6:00 AM (360 min)
      // This crosses midnight, so we check if time is >= 18:00 OR < 06:00
      return timeInMinutes >= 1080 || timeInMinutes < 360;

    default:
      return false;
  }
}

/**
 * Get the expected driver status based on working_time and manual override
 * @param {string} workingTime - Driver's working time preference
 * @param {string} currentStatus - Current driver_status in DB
 * @param {Date} currentTime - Current date/time (defaults to now)
 * @returns {object} - { shouldBeActive, canBeActive, status }
 */
export function getDriverStatusInfo(
  workingTime,
  currentStatus,
  currentTime = new Date(),
) {
  const shouldBeActive = isDriverActiveTime(workingTime, currentTime);

  return {
    shouldBeActive,
    canBeActive: shouldBeActive,
    currentStatus,
    isActive: currentStatus === "active" && shouldBeActive,
    // Suggested status based on time (but respects manual override if within time window)
    suggestedStatus: shouldBeActive ? currentStatus : "inactive",
  };
}

/**
 * Determine if a driver status can be toggled manually
 * @param {string} workingTime - Driver's working time preference
 * @param {string} targetStatus - Status driver wants to change to
 * @param {Date} currentTime - Current date/time (defaults to now)
 * @returns {object} - { allowed, reason }
 */
export function canToggleDriverStatus(
  workingTime,
  targetStatus,
  currentTime = new Date(),
) {
  const shouldBeActiveNow = isDriverActiveTime(workingTime, currentTime);

  if (targetStatus === "active") {
    if (!shouldBeActiveNow) {
      return {
        allowed: false,
        reason: "Cannot activate outside your working time schedule",
      };
    }
    return { allowed: true, reason: null };
  }

  if (targetStatus === "inactive") {
    // Drivers can always go inactive
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: "Invalid status. Only active/inactive allowed",
  };
}

/**
 * Get human-readable working time description
 * @param {string} workingTime - 'full_time', 'morning', or 'night'
 * @returns {string} - Description of working hours
 */
export function getWorkingTimeDescription(workingTime) {
  switch (workingTime) {
    case "full_time":
      return "24/7 - Flexible Hours";
    case "morning":
      return "Day Time (6:00 AM - 6:30 PM)";
    case "night":
      return "Night Time (6:00 PM - 6:00 AM)";
    default:
      return "Not set";
  }
}

/**
 * Calculate next status change time for driver
 * @param {string} workingTime - Driver's working time preference
 * @param {Date} currentTime - Current date/time (defaults to now)
 * @returns {object} - { nextChangeTime, nextStatus }
 */
export function getNextStatusChange(workingTime, currentTime = new Date()) {
  if (workingTime === "full_time") {
    return { nextChangeTime: null, nextStatus: "active" };
  }

  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const nextChangeTime = new Date(currentTime);

  if (workingTime === "morning") {
    // Morning: 6:00 AM to 6:30 PM
    if (timeInMinutes < 360) {
      // Before 6 AM - next change is at 6 AM (active)
      nextChangeTime.setHours(6, 0, 0, 0);
      return { nextChangeTime, nextStatus: "active" };
    } else if (timeInMinutes >= 360 && timeInMinutes < 1110) {
      // During working hours - next change is at 6:30 PM (inactive)
      nextChangeTime.setHours(18, 30, 0, 0);
      return { nextChangeTime, nextStatus: "inactive" };
    } else {
      // After 6:30 PM - next change is tomorrow at 6 AM (active)
      nextChangeTime.setDate(nextChangeTime.getDate() + 1);
      nextChangeTime.setHours(6, 0, 0, 0);
      return { nextChangeTime, nextStatus: "active" };
    }
  }

  if (workingTime === "night") {
    // Night: 6:00 PM to 6:00 AM
    if (timeInMinutes < 360) {
      // During night shift (before 6 AM) - next change is at 6 AM (inactive)
      nextChangeTime.setHours(6, 0, 0, 0);
      return { nextChangeTime, nextStatus: "inactive" };
    } else if (timeInMinutes >= 360 && timeInMinutes < 1080) {
      // During day (6 AM to 6 PM) - next change is at 6 PM (active)
      nextChangeTime.setHours(18, 0, 0, 0);
      return { nextChangeTime, nextStatus: "active" };
    } else {
      // During night shift (after 6 PM) - next change is tomorrow at 6 AM (inactive)
      nextChangeTime.setDate(nextChangeTime.getDate() + 1);
      nextChangeTime.setHours(6, 0, 0, 0);
      return { nextChangeTime, nextStatus: "inactive" };
    }
  }

  return { nextChangeTime: null, nextStatus: null };
}
