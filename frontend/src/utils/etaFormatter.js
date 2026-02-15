/**
 * ETA Formatter Utility
 *
 * Converts ETA minute ranges into clock-time arrival displays.
 * Example: etaRangeMin=12, etaRangeMax=22, current time 10:30 PM
 *   → "10:42 PM - 10:52 PM"
 *
 * For exact (single) ETA (e.g. on_the_way status):
 *   etaRangeMin=6, etaRangeMax=6 → "10:36 PM"
 */

/**
 * Format ETA as clock arrival time(s).
 * @param {number} etaRangeMin - Minimum ETA in minutes
 * @param {number} etaRangeMax - Maximum ETA in minutes
 * @param {Object} [options]
 * @param {boolean} [options.isOnTheWay] - If true, append "Insha Allah" for on_the_way status
 * @returns {string} e.g. "10:42 PM - 10:52 PM" or "10:36 PM Insha Allah"
 */
export function formatETAClockTime(etaRangeMin, etaRangeMax, options = {}) {
  const now = new Date();
  const arriveEarly = new Date(now.getTime() + etaRangeMin * 60000);
  const arriveLate = new Date(now.getTime() + etaRangeMax * 60000);

  const fmt = (d) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  // Single exact time (on_the_way or when min === max)
  if (etaRangeMin === etaRangeMax || options.isOnTheWay) {
    const time = fmt(arriveEarly);
    return options.isOnTheWay ? `${time} Insha Allah` : time;
  }

  // Range: "10:42 PM - 10:52 PM"
  return `${fmt(arriveEarly)} - ${fmt(arriveLate)}`;
}

/**
 * Build the display string from backend ETA data.
 * Handles all statuses and falls back gracefully.
 *
 * @param {Object|null} etaData - Backend eta object { etaMinutes, etaRangeMin, etaRangeMax, driverStatus, ... }
 * @param {string} [fallback="Calculating..."] - Fallback text when no ETA data
 * @returns {string} Clock-time arrival string
 */
export function getFormattedETA(etaData, fallback = "Calculating...") {
  if (!etaData) return fallback;

  const { etaRangeMin, etaRangeMax, driverStatus } = etaData;

  if (etaRangeMin == null || etaRangeMax == null) return fallback;

  const isOnTheWay =
    driverStatus === "on_the_way" || driverStatus === "at_customer";

  return formatETAClockTime(etaRangeMin, etaRangeMax, { isOnTheWay });
}
