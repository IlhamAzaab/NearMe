import { appError } from "../services/authService.js";
import {
  isSriLankaPhone,
  normalizeSriLankaPhone,
} from "../services/otpService.js";

function ensureNonEmptyString(value, message, code) {
  if (typeof value !== "string" || !value.trim()) {
    throw appError(400, message, code);
  }
  return value.trim();
}

export function validateCustomerSignupStart(body) {
  const rawPhone = ensureNonEmptyString(
    body?.phone,
    "Phone number is required",
    "PHONE_REQUIRED",
  );
  const password = ensureNonEmptyString(
    body?.password,
    "Password is required",
    "PASSWORD_REQUIRED",
  );

  const normalizedPhone = normalizeSriLankaPhone(rawPhone);
  if (!normalizedPhone) {
    throw appError(
      400,
      "Invalid phone format. Use a Sri Lankan number like 0771234567",
      "INVALID_PHONE",
    );
  }

  if (password.length < 6 || password.length > 72) {
    throw appError(
      400,
      "Password must be between 6 and 72 characters",
      "INVALID_PASSWORD_LENGTH",
    );
  }

  return {
    phone: normalizedPhone,
    password,
  };
}

export function validateOtpVerification(body) {
  const rawPhone = ensureNonEmptyString(
    body?.phone,
    "Phone number is required",
    "PHONE_REQUIRED",
  );
  const otp = ensureNonEmptyString(
    body?.otp,
    "OTP is required",
    "OTP_REQUIRED",
  );

  const normalizedPhone = normalizeSriLankaPhone(rawPhone);
  if (!normalizedPhone) {
    throw appError(400, "Invalid phone format", "INVALID_PHONE");
  }

  if (!/^\d{6}$/.test(otp)) {
    throw appError(400, "OTP must be a 6-digit code", "INVALID_OTP_FORMAT");
  }

  return {
    phone: normalizedPhone,
    otp,
  };
}

export function validateResendOtp(body) {
  const rawPhone = ensureNonEmptyString(
    body?.phone,
    "Phone number is required",
    "PHONE_REQUIRED",
  );

  const normalizedPhone = normalizeSriLankaPhone(rawPhone);
  if (!normalizedPhone) {
    throw appError(400, "Invalid phone format", "INVALID_PHONE");
  }

  return {
    phone: normalizedPhone,
  };
}

export function validateLogin(body) {
  const identifier = ensureNonEmptyString(
    body?.identifier,
    "identifier (phone or email) is required",
    "IDENTIFIER_REQUIRED",
  );
  const password = ensureNonEmptyString(
    body?.password,
    "Password is required",
    "PASSWORD_REQUIRED",
  );

  if (password.length < 6 || password.length > 72) {
    throw appError(
      400,
      "Password must be between 6 and 72 characters",
      "INVALID_PASSWORD_LENGTH",
    );
  }

  const trimmedIdentifier = identifier.trim();
  const isEmail = trimmedIdentifier.includes("@");
  if (!isEmail && !isSriLankaPhone(trimmedIdentifier)) {
    throw appError(
      400,
      "Identifier must be a valid email or Sri Lankan phone number",
      "INVALID_IDENTIFIER",
    );
  }

  return {
    identifier: trimmedIdentifier,
    password,
  };
}

export function validateCompleteProfile(body) {
  const name = ensureNonEmptyString(
    body?.name,
    "Name is required",
    "NAME_REQUIRED",
  );
  const email = ensureNonEmptyString(
    body?.email,
    "Email is required",
    "EMAIL_REQUIRED",
  );
  const password = ensureNonEmptyString(
    body?.password,
    "Password is required",
    "PASSWORD_REQUIRED",
  );

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw appError(400, "Invalid email address", "INVALID_EMAIL");
  }

  if (name.length < 2 || name.length > 80) {
    throw appError(
      400,
      "Name must be between 2 and 80 characters",
      "INVALID_NAME_LENGTH",
    );
  }

  if (password.length < 6 || password.length > 72) {
    throw appError(
      400,
      "Password must be between 6 and 72 characters",
      "INVALID_PASSWORD_LENGTH",
    );
  }

  const cityRaw = ensureNonEmptyString(
    body?.city,
    "City is required",
    "CITY_REQUIRED",
  );
  const addressRaw = ensureNonEmptyString(
    body?.address,
    "Address is required",
    "ADDRESS_REQUIRED",
  );

  if (cityRaw.length < 2 || cityRaw.length > 80) {
    throw appError(
      400,
      "City must be between 2 and 80 characters",
      "INVALID_CITY_LENGTH",
    );
  }

  if (addressRaw.length < 5 || addressRaw.length > 255) {
    throw appError(
      400,
      "Address must be between 5 and 255 characters",
      "INVALID_ADDRESS_LENGTH",
    );
  }

  const hasLatitude =
    body?.latitude !== undefined &&
    body?.latitude !== null &&
    String(body.latitude).trim() !== "";
  const hasLongitude =
    body?.longitude !== undefined &&
    body?.longitude !== null &&
    String(body.longitude).trim() !== "";

  if (hasLatitude !== hasLongitude) {
    throw appError(
      400,
      "Both latitude and longitude are required together",
      "INCOMPLETE_COORDINATES",
    );
  }

  let latitude = null;
  let longitude = null;

  if (hasLatitude && hasLongitude) {
    latitude = Number(body.latitude);
    longitude = Number(body.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw appError(400, "Valid latitude is required", "INVALID_LATITUDE");
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw appError(400, "Valid longitude is required", "INVALID_LONGITUDE");
    }
  }

  return {
    name,
    email,
    password,
    city: cityRaw,
    address: addressRaw,
    latitude,
    longitude,
  };
}
