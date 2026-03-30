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

function resolveSecretFromRequest(req) {
  const authHeader = String(getHeader(req, "authorization") || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const candidateHeaders = [
    "x-supabase-hook-secret",
    "x-hook-secret",
    "x-webhook-secret",
    "x-supabase-secret",
  ];

  for (const headerName of candidateHeaders) {
    const value = String(getHeader(req, headerName) || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
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

export async function handleSupabaseSendSmsHook(req, res) {
  const expectedSecret = String(process.env.SUPABASE_SMS_HOOK_SECRET || "").trim();

  try {
    console.log("[SMS_HOOK] Incoming headers:\n", safeJson(req.headers));
    console.log("[SMS_HOOK] Incoming body:\n", safeJson(req.body));

    if (!expectedSecret) {
      console.error("[SMS_HOOK] SUPABASE_SMS_HOOK_SECRET is not configured.");
      return res.status(500).json({
        success: false,
        message: "Server misconfiguration",
        code: "HOOK_SECRET_NOT_CONFIGURED",
      });
    }

    const receivedSecret = resolveSecretFromRequest(req);
    if (!receivedSecret || !constantTimeEqual(receivedSecret, expectedSecret)) {
      console.error("[SMS_HOOK] Secret validation failed.");
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        code: "INVALID_HOOK_SECRET",
      });
    }

    const { phone, message } = resolvePhoneAndMessage(req.body || {});
    console.log("[SMS_HOOK] Extracted phone:", phone || "<missing>");
    console.log("[SMS_HOOK] Extracted message:", message || "<missing>");

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: "Phone number or message is missing in hook payload",
        code: "MISSING_PHONE_OR_MESSAGE",
      });
    }

    const smsResponse = await sendSmsViaSmsLenz({ phone, message });
    console.log("[SMS_HOOK] SMSLenz response:\n", safeJson(smsResponse));

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
