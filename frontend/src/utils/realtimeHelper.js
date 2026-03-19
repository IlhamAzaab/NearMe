/**
 * Resilient Supabase Realtime Subscription Utility
 *
 * Provides error handling and retry logic for Supabase realtime subscriptions.
 * The app will work even if realtime connections fail.
 */

import supabaseClient, { getSupabaseHeaders } from "../supabaseClient";

const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff
const MAX_RETRIES = 5;

/**
 * Creates a resilient Supabase realtime subscription
 * @param {Object} config - Subscription configuration
 * @param {string} config.channelName - Unique channel name
 * @param {string} config.table - Table to subscribe to
 * @param {string} config.event - Event type (INSERT, UPDATE, DELETE, *)
 * @param {Function} config.onData - Callback when data is received
 * @param {Function} [config.onError] - Optional error callback
 * @param {Function} [config.onSubscribed] - Optional callback when subscribed
 * @returns {Object} - { subscription, unsubscribe }
 */
export function createResilientSubscription(config) {
  const { channelName, table, event, onData, onError, onSubscribed } = config;
  let subscription = null;
  let retryCount = 0;
  let retryTimeout = null;
  let isUnsubscribed = false;

  const subscribe = () => {
    if (isUnsubscribed) return;

    try {
      // Get current auth headers (includes JWT token if available)
      const headers = getSupabaseHeaders();

      subscription = supabaseClient
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: event || "*",
            schema: "public",
            table: table,
          },
          (payload) => {
            if (!isUnsubscribed) {
              onData(payload);
            }
          },
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            console.log(`[Realtime] ✅ Subscribed to ${channelName}`);
            retryCount = 0;
            onSubscribed?.();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`[Realtime] ⚠️ ${channelName} status: ${status}`, err);
            handleError(err || new Error(status));
          } else if (status === "CLOSED") {
            console.log(`[Realtime] Channel ${channelName} closed`);
            // Attempt reconnect if not deliberately unsubscribed
            if (!isUnsubscribed && retryCount < MAX_RETRIES) {
              scheduleRetry();
            }
          }
        });
    } catch (err) {
      console.error(
        `[Realtime] Failed to create subscription ${channelName}:`,
        err,
      );
      handleError(err);
    }
  };

  const handleError = (err) => {
    onError?.(err);
    if (!isUnsubscribed && retryCount < MAX_RETRIES) {
      scheduleRetry();
    } else if (retryCount >= MAX_RETRIES) {
      console.error(
        `[Realtime] Max retries reached for ${channelName}. Realtime disabled.`,
      );
    }
  };

  const scheduleRetry = () => {
    const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
    console.log(
      `[Realtime] Retrying ${channelName} in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`,
    );

    retryTimeout = setTimeout(() => {
      retryCount++;
      if (subscription) {
        try {
          subscription.unsubscribe();
        } catch {}
      }
      subscribe();
    }, delay);
  };

  const unsubscribe = () => {
    isUnsubscribed = true;
    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }
    if (subscription) {
      try {
        subscription.unsubscribe();
        console.log(`[Realtime] Unsubscribed from ${channelName}`);
      } catch (err) {
        console.warn(
          `[Realtime] Error unsubscribing from ${channelName}:`,
          err,
        );
      }
    }
  };

  // Start subscription
  subscribe();

  return { subscription, unsubscribe };
}

/**
 * Creates multiple resilient subscriptions at once
 * @param {Array} configs - Array of subscription configurations
 * @returns {Function} - Cleanup function to unsubscribe all
 */
export function createMultipleSubscriptions(configs) {
  const subscriptions = configs.map((config) =>
    createResilientSubscription(config),
  );

  return () => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  };
}

export default createResilientSubscription;
