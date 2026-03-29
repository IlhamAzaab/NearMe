import jwt from "jsonwebtoken";

function normalizeEnvValue(value) {
  return String(value || "").trim();
}

function isLikelyMergedEnvAssignment(value) {
  return /(^|\W)(WEB_ACCESS_TOKEN_EXPIRES_IN|MOBILE_ACCESS_TOKEN_EXPIRES_IN|ACCESS_TOKEN_EXPIRES_IN)=/i.test(
    value,
  );
}

function parseTokenExpiry(rawValue, fallback) {
  const value = normalizeEnvValue(rawValue) || fallback;
  if (!value) {
    throw new Error("[Auth Config] Token expiry value is empty.");
  }
  if (value.includes("\n") || value.includes("\r") || value.includes("=")) {
    throw new Error(
      `[Auth Config] Invalid token expiry value \"${value}\". Check .env formatting.`,
    );
  }
  return value;
}

let cachedAuthConfig = null;

export function getValidatedAuthConfig() {
  if (cachedAuthConfig) {
    return cachedAuthConfig;
  }

  const jwtSecret = normalizeEnvValue(process.env.JWT_SECRET);
  if (!jwtSecret) {
    throw new Error(
      "[Auth Config] JWT_SECRET is missing. Define it in the root .env or hosting environment settings.",
    );
  }

  if (isLikelyMergedEnvAssignment(jwtSecret)) {
    throw new Error(
      "[Auth Config] JWT_SECRET appears malformed (contains another env assignment). Ensure JWT_SECRET, WEB_ACCESS_TOKEN_EXPIRES_IN, and MOBILE_ACCESS_TOKEN_EXPIRES_IN are on separate lines.",
    );
  }

  if (jwtSecret.length < 32) {
    throw new Error(
      "[Auth Config] JWT_SECRET is too short. Use at least 32 characters of random data.",
    );
  }

  const previousJwtSecret = normalizeEnvValue(process.env.JWT_SECRET_PREVIOUS);

  cachedAuthConfig = {
    jwtSecret,
    previousJwtSecret:
      previousJwtSecret && previousJwtSecret !== jwtSecret
        ? previousJwtSecret
        : null,
    webAccessTokenExpiresIn: parseTokenExpiry(
      process.env.WEB_ACCESS_TOKEN_EXPIRES_IN,
      "14d",
    ),
    mobileAccessTokenExpiresIn: parseTokenExpiry(
      process.env.MOBILE_ACCESS_TOKEN_EXPIRES_IN ||
        process.env.ACCESS_TOKEN_EXPIRES_IN,
      "180d",
    ),
  };

  return cachedAuthConfig;
}

export function verifyJwtWithRotation(token, options = undefined) {
  const { jwtSecret, previousJwtSecret } = getValidatedAuthConfig();

  try {
    return jwt.verify(token, jwtSecret, options);
  } catch (err) {
    const canTryPreviousSecret =
      previousJwtSecret && err?.name === "JsonWebTokenError";

    if (canTryPreviousSecret) {
      return jwt.verify(token, previousJwtSecret, options);
    }

    throw err;
  }
}
