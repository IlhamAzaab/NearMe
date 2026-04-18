const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "meezo_access_token";

const MOBILE_PLATFORMS = new Set(["react-native", "mobile", "android", "ios"]);

function normalizePlatform(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function isMobilePlatform(platform) {
  return MOBILE_PLATFORMS.has(normalizePlatform(platform));
}

export function shouldUseCookieAuth(req) {
  const platform = normalizePlatform(req?.headers?.["x-client-platform"]);
  return !isMobilePlatform(platform);
}

export function parseDurationToMs(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multiplierByUnit = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  const multiplier = multiplierByUnit[unit];
  if (!multiplier || !Number.isFinite(amount)) {
    return null;
  }

  return amount * multiplier;
}

function getBaseCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  const authCookieDomain = String(process.env.AUTH_COOKIE_DOMAIN || "").trim();

  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };

  if (authCookieDomain) {
    options.domain = authCookieDomain;
  }

  return options;
}

export function setAuthCookie(res, token, maxAgeMs = null) {
  if (!res || !token) {
    return;
  }

  const cookieOptions = getBaseCookieOptions();
  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
    cookieOptions.maxAge = maxAgeMs;
  }

  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
}

export function clearAuthCookie(res) {
  if (!res) {
    return;
  }

  res.clearCookie(AUTH_COOKIE_NAME, getBaseCookieOptions());
}

export function extractTokenFromCookies(req) {
  const cookies = req?.cookies || {};
  const cookieToken =
    cookies[AUTH_COOKIE_NAME] || cookies.access_token || cookies.token || null;

  if (!cookieToken) {
    return null;
  }

  return String(cookieToken).trim() || null;
}

export { AUTH_COOKIE_NAME };
