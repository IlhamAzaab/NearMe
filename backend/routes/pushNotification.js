/**
 * Push Notification Routes
 * Handles Expo push token registration and management
 * Uses Expo Push Notifications with Supabase - no Firebase required!
 */

import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  registerPushToken,
  removePushToken,
  testPushNotification,
  sendPushNotification,
  getServiceStatus,
} from "../utils/pushNotificationService.js";

const router = express.Router();

/**
 * POST /push/register-token
 * Register or update Expo push token for push notifications
 * Call this after login and whenever token refreshes
 *
 * Body: { expoPushToken, deviceType, deviceId }
 * expoPushToken format: ExponentPushToken[xxx] or ExpoPushToken[xxx]
 */
router.post("/register-token", authenticate, async (req, res) => {
  try {
    const { expoPushToken, deviceType, deviceId } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ message: "Expo push token is required" });
    }

    // Validate token format
    if (
      !expoPushToken.startsWith("ExponentPushToken[") &&
      !expoPushToken.startsWith("ExpoPushToken[")
    ) {
      return res.status(400).json({
        message:
          "Invalid token format. Expected ExponentPushToken[xxx] format.",
      });
    }

    const userId = req.user.id;
    const userType = req.user.role; // 'admin', 'driver', 'customer', 'manager'

    const result = await registerPushToken(
      userId,
      userType,
      expoPushToken,
      deviceType || "android",
      deviceId,
    );

    if (result.success) {
      return res.json({
        message: "Push token registered successfully",
        data: result.data,
      });
    } else {
      return res.status(500).json({
        message: "Failed to register push token",
        error: result.error,
      });
    }
  } catch (e) {
    console.error("/push/register-token error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /push/unregister-token
 * Remove Expo push token (call on logout)
 * Body: { deviceId }
 */
router.post("/unregister-token", authenticate, async (req, res) => {
  try {
    const { deviceId } = req.body;
    const userId = req.user.id;

    const result = await removePushToken(userId, deviceId);

    if (result.success) {
      return res.json({ message: "Push token removed successfully" });
    } else {
      return res.status(500).json({
        message: "Failed to remove push token",
        error: result.error,
      });
    }
  } catch (e) {
    console.error("/push/unregister-token error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /push/status
 * Check push notification service status
 */
router.get("/status", async (req, res) => {
  try {
    const status = getServiceStatus();
    return res.json(status);
  } catch (e) {
    console.error("/push/status error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /push/send-test
 * Send a test push notification (for development/testing)
 * Only works for authenticated users
 * Body: { title?, body? }
 */
router.post("/send-test", authenticate, async (req, res) => {
  try {
    const { title, body } = req.body;
    const userId = req.user.id;

    const result = await testPushNotification(
      userId,
      title || "Test Notification",
      body || "This is a test push notification from Meezo!",
    );

    return res.json({
      message: result.success
        ? "Test notification sent"
        : "Failed to send notification",
      ...result,
    });
  } catch (e) {
    console.error("/push/send-test error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
