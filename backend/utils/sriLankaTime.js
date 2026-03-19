const SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getSriLankaDateString(date = new Date()) {
  return new Date(date.getTime() + SRI_LANKA_OFFSET_MS)
    .toISOString()
    .split("T")[0];
}

function shiftSriLankaDateString(dateStr, daysDelta) {
  const startUtcMs = new Date(`${dateStr}T00:00:00+05:30`).getTime();
  return getSriLankaDateString(new Date(startUtcMs + daysDelta * ONE_DAY_MS));
}

function getSriLankaDayRange(date = new Date()) {
  const dateStr = getSriLankaDateString(date);
  return {
    dateStr,
    start: `${dateStr}T00:00:00+05:30`,
    end: `${dateStr}T23:59:59.999+05:30`,
  };
}

function getSriLankaDayRangeFromDateStr(dateStr) {
  return {
    dateStr,
    start: `${dateStr}T00:00:00+05:30`,
    end: `${dateStr}T23:59:59.999+05:30`,
  };
}

function getSriLankaDateKey(timestamp) {
  if (!timestamp) return null;
  return getSriLankaDateString(new Date(timestamp));
}

export {
  SRI_LANKA_OFFSET_MS,
  getSriLankaDateString,
  shiftSriLankaDateString,
  getSriLankaDayRange,
  getSriLankaDayRangeFromDateStr,
  getSriLankaDateKey,
};
