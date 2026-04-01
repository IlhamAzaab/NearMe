import crypto from "crypto";
import { Webhook } from "standardwebhooks";
import { sendSmsViaSmsLenz } from "../services/smsHookSmslenzService.js";

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable]";
  }
}

function getHeader(req, key) {
  return req.headers[key] || req.headers[key.toLowerCase()] || "";
}

function toSingleHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.join(",");
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function getHeaderMapForVerification(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    headers[String(key).toLowerCase()] = toSingleHeaderValue(value);
  }
  return headers;
}

function getRawPayloadText(req) {
  if (typeof req.rawBody === "string" && req.rawBody.length > 0) {
    return req.rawBody;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  if (req.body && typeof req.body === "object") {
    try {
      return JSON.stringify(req.body);
    } catch {
      return "";
    }
  }

  return "";
}

function normalizeSecretValue(raw) {
  let value = String(raw || "").trim();
  if (!value) {
    return "";
  }

  // Supabase/UI can sometimes wrap values in quotes.
  value = value.replace(/^['\"]+|['\"]+$/g, "").trim();

  // Be tolerant of accidental repeated "Bearer " prefixes.
  while (value.toLowerCase().startsWith("bearer ")) {
    value = value.slice(7).trim();
  }

  return value;
}

function getSecretVariants(raw) {
  const normalized = normalizeSecretValue(raw);
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);

  // Some dashboards/providers may include only the whsec part without version prefix.
  if (normalized.includes(",")) {
    const parts = normalized.split(",");
    const trailing = String(parts[parts.length - 1] || "").trim();
    if (trailing) {
      variants.add(trailing);
    }
  }

  return [...variants];
}

function getStandardWebhookSecret(rawSecret) {
  const normalized = normalizeSecretValue(rawSecret);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("v1,whsec_")) {
    return normalized.slice("v1,whsec_".length).trim();
  }

  if (normalized.startsWith("whsec_")) {
    return normalized.slice("whsec_".length).trim();
  }

  return normalized;
}

function verifyStandardWebhookSignature({ expectedSecret, rawPayload, req }) {
  const webhookSecret = getStandardWebhookSecret(expectedSecret);
  if (!webhookSecret) {
    return { ok: false, reason: "missing_webhook_secret" };
  }

  if (!rawPayload) {
    return { ok: false, reason: "missing_raw_payload" };
  }

  try {
    const webhook = new Webhook(webhookSecret);
    const headers = getHeaderMapForVerification(req);
    const event = webhook.verify(rawPayload, headers);
    return { ok: true, event };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "signature_verification_failed",
    };
  }
}

function resolveSecretFromRequest(req) {
  const authHeader = normalizeSecretValue(getHeader(req, "authorization"));
  if (authHeader) {
    return authHeader;
  }

  const candidateHeaders = [
    "x-supabase-hook-secret",
    "x-hook-secret",
    "x-webhook-secret",
    "x-supabase-secret",
  ];

  for (const headerName of candidateHeaders) {
    const value = normalizeSecretValue(getHeader(req, headerName));
    if (value) {
      return value;
    }
  }

  return "";
}

function secretsMatch(expectedSecret, receivedSecret) {
  const expectedVariants = getSecretVariants(expectedSecret);
  const receivedVariants = getSecretVariants(receivedSecret);

  for (const expected of expectedVariants) {
    for (const received of receivedVariants) {
      if (constantTimeEqual(expected, received)) {
        return true;
      }
    }
  }

  return false;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function getValueByPath(source, path) {
  return path.reduce((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return acc[key];
    }
    return undefined;
  }, source);
}

function resolvePhoneAndMessage(payload) {
  const phonePaths = [
    ["phone"],
    ["phone_number"],
    ["recipient"],
    ["to"],
    ["user", "phone"],
    ["sms", "to"],
    ["sms", "phone"],
    ["data", "phone"],
    ["payload", "phone"],
    ["payload", "user", "phone"],
  ];

  const messagePaths = [
    ["message"],
    ["text"],
    ["sms", "message"],
    ["sms", "text"],
    ["data", "message"],
    ["payload", "message"],
    ["template", "message"],
  ];

  let phone = "";
  for (const path of phonePaths) {
    const value = getValueByPath(payload, path);
    if (typeof value === "string" && value.trim()) {
      phone = value.trim();
      break;
    }
  }

  let message = "";
  for (const path of messagePaths) {
    const value = getValueByPath(payload, path);
    if (typeof value === "string" && value.trim()) {
      message = value.trim();
      break;
    }
  }

  return { phone, message };
}

function resolvePhoneAndMessageFromVerifiedEvent(event) {
  const phone = String(event?.user?.phone || "").trim();
  const otp = String(event?.sms?.otp || event?.sms?.token || "").trim();
  const explicitMessage = String(event?.sms?.message || "").trim();

  const message = explicitMessage || (otp ? `Your verification code is ${otp}` : "");

  return {
    phone,
    message,
    otp,
  };
}

function shouldSendAsync() {
  const raw = String(process.env.SUPABASE_SMS_HOOK_ASYNC || "true").trim().toLowerCase();
  return raw !== "false";
}

export async function handleSupabaseSendSmsHook(req, res) {
  const expectedSecret = String(process.env.SUPABASE_SMS_HOOK_SECRET || "").trim();

  try {
    console.log("[SMS_HOOK] Incoming request", {
      method: req.method,
      path: req.path,
      contentType: req.headers?.["content-type"] || null,
    });

    if (!expectedSecret) {
      console.error("[SMS_HOOK] SUPABASE_SMS_HOOK_SECRET is not configured.");
      return res.status(500).json({
        success: false,
        message: "Server misconfiguration",
        code: "HOOK_SECRET_NOT_CONFIGURED",
      });
    }

    const rawPayload = getRawPayloadText(req);
    let verifiedEvent = null;
    let verifiedVia = "";

    const signatureVerification = verifyStandardWebhookSignature({
      expectedSecret,
      rawPayload,
      req,
    });

    if (signatureVerification.ok) {
      verifiedEvent = signatureVerification.event;
      verifiedVia = "standard-webhooks";
    } else {
      console.warn("[SMS_HOOK] Signature verification failed. Trying legacy shared-secret check.", {
        reason: signatureVerification.reason,
      });

      const receivedSecret = resolveSecretFromRequest(req);
      if (!receivedSecret || !secretsMatch(expectedSecret, receivedSecret)) {
        console.error("[SMS_HOOK] Secret validation failed.");
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
          code: "INVALID_HOOK_SECRET",
        });
      }

      verifiedEvent = req.body || {};
      verifiedVia = "legacy-shared-secret";
    }

    const fromVerified = resolvePhoneAndMessageFromVerifiedEvent(verifiedEvent || {});
    const fromGeneric = resolvePhoneAndMessage(verifiedEvent || req.body || {});

    const phone = fromVerified.phone || fromGeneric.phone;
    const message = fromVerified.message || fromGeneric.message;

    console.log("[SMS_HOOK] Payload resolved", {
      verifiedVia,
      hasPhone: Boolean(phone),
      messageLength: message ? message.length : 0,
      hasOtp: Boolean(fromVerified.otp),
    });

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: "Phone number or message is missing in hook payload",
        code: "MISSING_PHONE_OR_MESSAGE",
      });
    }

    if (shouldSendAsync()) {
      // Supabase expects the hook to respond within 5 seconds.
      // Send SMS in the background to avoid provider/network latency causing OTP failures.
      res.status(200).json({
        success: true,
        message: "SMS accepted for delivery",
        provider: "smslenz",
        queued: true,
      });

      setImmediate(async () => {
        try {
          const smsResponse = await sendSmsViaSmsLenz({ phone, message });
          console.log("[SMS_HOOK] Async SMSLenz response", {
            status: smsResponse?.status || null,
          });
        } catch (error) {
          console.error("[SMS_HOOK] Async send failed", {
            message: error?.message,
            code: error?.code,
            providerResponse: error?.providerResponse || null,
          });
        }
      });

      return;
    }

    const smsResponse = await sendSmsViaSmsLenz({ phone, message });
    console.log("[SMS_HOOK] SMSLenz response", {
      status: smsResponse?.status || null,
      data: safeJson(smsResponse?.data || null),
    });

    return res.status(200).json({
      success: true,
      message: "SMS sent successfully",
      provider: "smslenz",
      data: smsResponse,
    });
  } catch (error) {
    console.error("[SMS_HOOK] Error:", {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      providerResponse: error?.providerResponse || null,
    });

    return res.status(500).json({
      success: false,
      message: "Failed to send SMS",
      code: error?.code || "SMS_SEND_FAILED",
    });
  }
}
