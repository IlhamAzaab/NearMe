import nodemailer from "nodemailer";
import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: "../.env" });
}

// Build transporter only if SMTP is configured
let transporter = null;
let fallbackTransporter = null;
const smtpPassRaw = String(process.env.SMTP_PASS || "");
const smtpPass = smtpPassRaw.replace(/\s+/g, "");
const smtpConfigured =
  process.env.SMTP_HOST &&
  process.env.SMTP_HOST !== "smtp.example.com" &&
  process.env.SMTP_USER &&
  smtpPass;

function createSmtpTransport(port) {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    connectionTimeout: 30000, // allow slower cloud egress to establish SMTP
    greetingTimeout: 30000,
    socketTimeout: 60000,
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPass,
    },
  });
}

function isConnectionError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNECTION" ||
    code === "ESOCKET" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection")
  );
}

async function sendMailWithFallback(mailOptions) {
  if (!transporter) {
    throw new Error("SMTP transporter is not configured");
  }

  try {
    return await transporter.sendMail(mailOptions);
  } catch (primaryError) {
    if (!fallbackTransporter || !isConnectionError(primaryError)) {
      throw primaryError;
    }

    console.warn(
      `⚠️  Primary SMTP transport failed (${primaryError.message}). Retrying with fallback transport...`,
    );
    return fallbackTransporter.sendMail(mailOptions);
  }
}

if (smtpConfigured) {
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  transporter = createSmtpTransport(smtpPort);

  // Gmail fallback: if primary is 587 and the host times out in cloud, retry via 465.
  if (
    String(process.env.SMTP_HOST || "")
      .toLowerCase()
      .includes("gmail.com") &&
    smtpPort !== 465
  ) {
    fallbackTransporter = createSmtpTransport(465);
  }

  if (smtpPassRaw && smtpPassRaw !== smtpPass) {
    console.warn(
      "⚠️  SMTP_PASS contained spaces. Using normalized app password value.",
    );
  }

  // Verify SMTP on startup (non-blocking)
  transporter
    .verify()
    .then(() =>
      console.log("\u2705 SMTP transporter verified — emails will be sent"),
    )
    .catch((err) =>
      console.error("\u274c SMTP verification failed:", err.message),
    );

  if (fallbackTransporter) {
    fallbackTransporter
      .verify()
      .then(() =>
        console.log(
          "\u2705 SMTP fallback transporter verified — backup email route ready",
        ),
      )
      .catch((err) =>
        console.error(
          "\u26a0\ufe0f SMTP fallback verification failed:",
          err.message,
        ),
      );
  }
} else {
  console.warn(
    "\u26a0\ufe0f  SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable emails.",
  );
}

/**
 * Send admin invitation email with temporary password
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.tempPassword - Temporary password
 * @param {string} options.loginUrl - Login URL
 */
export async function sendAdminInviteEmail({ to, tempPassword, loginUrl }) {
  const from =
    process.env.SMTP_FROM || process.env.SMTP_USER || "support.meezo@gmail.com";
  const subject = "Your NearMe admin account";
  const text = `Welcome to NearMe!\n\nLogin URL: ${loginUrl}\nEmail: ${to}\nTemporary password: ${tempPassword}\n\nPlease sign in and change your password immediately.`;
  const html = `
    <p>Welcome to NearMe!</p>
    <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
    <p><strong>Email:</strong> ${to}</p>
    <p><strong>Temporary password:</strong> ${tempPassword}</p>
    <p>Please sign in and change your password immediately.</p>
  `;

  // Always log credentials for developer tracking
  console.log("\n========== ADMIN INVITE EMAIL ==========");
  console.log(`To: ${to}`);
  console.log(`Temp password: "${tempPassword}"`);
  console.log(`Password length: ${tempPassword.length}`);
  console.log(`Login URL: ${loginUrl}`);
  console.log("========================================\n");

  // If SMTP not configured, stop after logging
  if (!transporter) {
    const errorMessage =
      "SMTP not configured - admin invite email was not sent";
    console.error(`❌ ${errorMessage}`);
    throw new Error(errorMessage);
  }

  try {
    await sendMailWithFallback({ from, to, subject, text, html });
    console.log(`✅ Admin invite email sent successfully to ${to}\n`);
  } catch (error) {
    console.error(`❌ Failed to send admin invite email to ${to}`);
    console.error(`   Error: ${error.message}\n`);
    throw error;
  }
}

/**
 * Send email verification link to customer
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.verificationLink - Full verification URL
 */
export async function sendVerificationEmail({ to, verificationLink }) {
  const from =
    process.env.SMTP_FROM || process.env.SMTP_USER || "support.meezo@gmail.com";
  const subject = "Verify your NearMe account";
  const text = `Welcome to NearMe!\n\nClick the link below to verify your email address:\n\n${verificationLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't create this account, please ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Welcome to NearMe!</h2>
      <p>Please verify your email address by clicking the button below:</p>
      <p style="margin: 30px 0;">
        <a href="${verificationLink}" style="background-color: #22c55e; color: white; padding: 14px 32px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: bold; font-size: 16px;">Verify Email</a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="background-color: #f5f5f5; padding: 10px; word-break: break-all; font-size: 12px;">
        ${verificationLink}
      </p>
      <p style="color: #666; font-size: 12px;">This link will expire in 1 hour.</p>
      <p style="color: #999; font-size: 12px;">If you didn't create this account, please ignore this email.</p>
    </div>
  `;

  // Check transporter is available
  if (!transporter) {
    console.error("❌ SMTP not configured — cannot send verification email");
    console.log(`[DEV] Verification link for ${to}: ${verificationLink}`);
    throw new Error("SMTP not configured. Cannot send verification email.");
  }

  try {
    await sendMailWithFallback({ from, to, subject, text, html });
    console.log(`✅ Verification email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send verification email to ${to}`);
    console.error("SMTP Error:", error.message);
    throw error;
  }
}

/**
 * Send driver invitation email with temporary password
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.tempPassword - Temporary password
 * @param {string} options.loginUrl - Login URL
 */
export async function sendDriverInviteEmail({ to, tempPassword, loginUrl }) {
  const from =
    process.env.SMTP_FROM || process.env.SMTP_USER || "support.meezo@gmail.com";
  const subject = "Your NearMe driver account";
  const text = `Welcome to NearMe Drivers!\n\nLogin URL: ${loginUrl}\nEmail: ${to}\nTemporary password: ${tempPassword}\n\nPlease sign in and change your password immediately.`;
  const html = `
    <p>Welcome to NearMe Drivers!</p>
    <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
    <p><strong>Email:</strong> ${to}</p>
    <p><strong>Temporary password:</strong> ${tempPassword}</p>
    <p>Please sign in and change your password immediately.</p>
  `;

  // Always log credentials for developer tracking
  console.log("\n========== DRIVER INVITE EMAIL ==========");
  console.log(`To: ${to}`);
  console.log(`Temp password: "${tempPassword}"`);
  console.log(`Password length: ${tempPassword.length}`);
  console.log(`Login URL: ${loginUrl}`);
  console.log("========================================\n");

  // If SMTP not configured, stop after logging
  if (!transporter) {
    const errorMessage =
      "SMTP not configured - driver invite email was not sent";
    console.error(`❌ ${errorMessage}`);
    throw new Error(errorMessage);
  }

  try {
    await sendMailWithFallback({ from, to, subject, text, html });
    console.log(`✅ Driver invite email sent successfully to ${to}\n`);
  } catch (error) {
    console.error(`❌ Failed to send driver invite email to ${to}`);
    console.error(`   Error: ${error.message}\n`);
    throw error;
  }
}
