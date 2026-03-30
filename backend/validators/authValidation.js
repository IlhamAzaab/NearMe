import { appError } from "../services/authService.js";
import { isSriLankaPhone, normalizeSriLankaPhone } from "../services/otpService.js";

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
  const otp = ensureNonEmptyString(body?.otp, "OTP is required", "OTP_REQUIRED");

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
  const email = ensureNonEmptyString(body?.email, "Email is required", "EMAIL_REQUIRED");
  const address = ensureNonEmptyString(
    body?.address,
    "Address is required",
    "ADDRESS_REQUIRED",
  );

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw appError(400, "Invalid email address", "INVALID_EMAIL");
  }

  if (address.length < 5 || address.length > 255) {
    throw appError(
      400,
      "Address must be between 5 and 255 characters",
      "INVALID_ADDRESS_LENGTH",
    );
  }

  return {
    email,
    address,
  };
}
