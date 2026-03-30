import axios from "axios";

const SMSLENZ_ENDPOINT = "https://smslenz.lk/api/send-sms";

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    const error = new Error(`${name} is not configured`);
    error.code = "MISSING_ENV";
    throw error;
  }
  return value;
}

export async function sendSmsViaSmsLenz({ phone, message }) {
  const userId = getRequiredEnv("SMSLENZ_USER_ID");
  const apiKey = getRequiredEnv("SMSLENZ_API_KEY");
  const senderId = getRequiredEnv("SMSLENZ_SENDER_ID");

  const form = new URLSearchParams();
  form.append("user_id", userId);
  form.append("api_key", apiKey);
  form.append("sender_id", senderId);
  form.append("contact", String(phone).trim());
  form.append("message", String(message).trim());

  try {
    const response = await axios.post(SMSLENZ_ENDPOINT, form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
      validateStatus: () => true,
    });

    const payload = response.data;
    const failedByStatus = response.status < 200 || response.status >= 300;
    const failedByPayload =
      payload && typeof payload === "object" && payload.success === false;

    if (failedByStatus || failedByPayload) {
      const error = new Error("SMSLenz request failed");
      error.code = "SMSLENZ_REQUEST_FAILED";
      error.providerResponse = {
        status: response.status,
        data: payload,
      };
      throw error;
    }

    return {
      status: response.status,
      data: payload,
    };
  } catch (error) {
    if (error.code === "SMSLENZ_REQUEST_FAILED" || error.code === "MISSING_ENV") {
      throw error;
    }

    const wrapped = new Error(error.message || "SMSLenz transport error");
    wrapped.code = "SMSLENZ_TRANSPORT_ERROR";
    throw wrapped;
  }
}
