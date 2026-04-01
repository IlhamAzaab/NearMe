import { OTP_EXPIRY_MINUTES } from "./otpService.js";

function resolveSmsLenzUrl() {
  const raw = (process.env.SMSLENZ_BASE_URL || "https://smslenz.lk/api/send-sms").trim();
  return raw.endsWith("/send-sms") ? raw : `${raw.replace(/\/+$/, "")}/send-sms`;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

export async function sendOtpSms({ phone, otp }) {
  const userId = process.env.SMSLENZ_USER_ID;
  const apiKey = process.env.SMSLENZ_API_KEY;
  const senderId = process.env.SMSLENZ_SENDER_ID;

  if (!userId || !apiKey) {
    if (process.env.NODE_ENV !== "production" && !isTruthy(process.env.SMSLENZ_REQUIRED)) {
      return {
        delivered: false,
        skipped: true,
        reason: "SMS credentials are missing in non-production",
      };
    }

    const error = new Error("SMS provider credentials are not configured");
    error.statusCode = 500;
    error.code = "SMS_CONFIG_MISSING";
    throw error;
  }

  const smsUrl = resolveSmsLenzUrl();
  const message = `Meezo verification code: ${otp}. This code will expire in ${OTP_EXPIRY_MINUTES} minutes.`;

  const form = new URLSearchParams({
    user_id: userId,
    api_key: apiKey,
    contact: phone,
    message,
  });

  if (senderId) {
    form.append("sender_id", senderId);
  }

  try {
    const response = await fetch(smsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    const rawText = await response.text();
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }

    const explicitFailure = payload && payload.success === false;
    if (!response.ok || explicitFailure) {
      const providerMessage =
        payload?.message || payload?.error || "Failed to send OTP via SMSLenz";

      if (process.env.NODE_ENV !== "production" && !isTruthy(process.env.SMSLENZ_REQUIRED)) {
        return {
          delivered: false,
          skipped: true,
          reason: `SMS provider error: ${providerMessage}`,
        };
      }

      const error = new Error(providerMessage);
      error.statusCode = 502;
      error.code = "SMS_SEND_FAILED";
      throw error;
    }

    return {
      delivered: true,
      skipped: false,
      providerResponse: payload || rawText || null,
    };
  } catch (err) {
    if (process.env.NODE_ENV !== "production" && !isTruthy(process.env.SMSLENZ_REQUIRED)) {
      return {
        delivered: false,
        skipped: true,
        reason: `SMS transport failure: ${err.message}`,
      };
    }

    const error = new Error(err.message || "Failed to send OTP via SMSLenz");
    error.statusCode = err.statusCode || 502;
    error.code = err.code || "SMS_SEND_FAILED";
    throw error;
  }
}
