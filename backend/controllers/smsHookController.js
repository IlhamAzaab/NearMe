import crypto from "crypto";
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

    const receivedSecret = resolveSecretFromRequest(req);
    if (!receivedSecret || !secretsMatch(expectedSecret, receivedSecret)) {
      console.error("[SMS_HOOK] Secret validation failed.");
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        code: "INVALID_HOOK_SECRET",
      });
    }

    const { phone, message } = resolvePhoneAndMessage(req.body || {});
    console.log("[SMS_HOOK] Payload resolved", {
      hasPhone: Boolean(phone),
      messageLength: message ? message.length : 0,
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
