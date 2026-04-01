import crypto from "crypto";

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = Number.parseInt(
  process.env.PHONE_OTP_MAX_ATTEMPTS || "5",
  10,
);
export const OTP_RESEND_COOLDOWN_SECONDS = Number.parseInt(
  process.env.PHONE_OTP_RESEND_COOLDOWN_SECONDS || "45",
  10,
);

export function normalizeSriLankaPhone(phone) {
  const p = String(phone || "")
    .trim()
    .replace(/[\s-]/g, "");

  let normalized = "";
  if (p.startsWith("+94")) {
    normalized = p;
  } else if (p.startsWith("94")) {
    normalized = `+${p}`;
  } else if (p.startsWith("0")) {
    normalized = `+94${p.slice(1)}`;
  } else {
    return null;
  }

  const canonicalDigits = normalized.replace(/\D/g, "");
  if (!/^947\d{8}$/.test(canonicalDigits)) {
    return null;
  }

  return `+${canonicalDigits}`;
}

export function isSriLankaPhone(phone) {
  const cleaned = String(phone || "")
    .trim()
    .replace(/[\s-]/g, "");
  return /^(\+94|94|0)7\d{8}$/.test(cleaned);
}

export function buildPhoneLookupCandidates(phone) {
  const normalized = normalizeSriLankaPhone(phone);
  if (!normalized) {
    return [];
  }

  const withoutPlus = normalized.slice(1);
  const localFormat = `0${normalized.slice(3)}`;

  return Array.from(new Set([normalized, withoutPlus, localFormat]));
}

export function generateOtpCode() {
  const min = 10 ** (OTP_LENGTH - 1);
  const maxExclusive = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(min, maxExclusive));
}

export function hashOtpCode(otp) {
  const pepper = process.env.PHONE_OTP_PEPPER || process.env.JWT_SECRET;
  if (!pepper) {
    const error = new Error("OTP pepper is not configured");
    error.statusCode = 500;
    error.code = "OTP_PEPPER_MISSING";
    throw error;
  }

  return crypto
    .createHash("sha256")
    .update(`${String(otp).trim()}:${pepper}`)
    .digest("hex");
}

export function getOtpExpiryDate(now = new Date()) {
  return new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
}
