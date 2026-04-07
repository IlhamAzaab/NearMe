function getStateKey(userId) {
  return `driver_available_unseen_state_${userId || "default"}`;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeState(parsed) {
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const lastSeenAt = Number(source.lastSeenAt || 0);
  const firstSeenById =
    source.firstSeenById && typeof source.firstSeenById === "object"
      ? source.firstSeenById
      : {};

  return {
    lastSeenAt: Number.isFinite(lastSeenAt) ? lastSeenAt : 0,
    firstSeenById,
  };
}

function readState(userId) {
  try {
    const raw = localStorage.getItem(getStateKey(userId));
    return normalizeState(safeParse(raw));
  } catch {
    return normalizeState(null);
  }
}

function writeState(userId, state) {
  try {
    localStorage.setItem(getStateKey(userId), JSON.stringify(state));
  } catch {
    // Ignore storage write failures.
  }
}

function toDeliveryId(delivery) {
  const id = delivery?.delivery_id ?? delivery?.id;
  return id != null ? String(id) : null;
}

export function syncDriverAvailableUnseenState(userId, deliveries = []) {
  const now = Date.now();
  const state = readState(userId);
  const nextFirstSeenById = {};
  const seenIds = new Set();

  for (const delivery of Array.isArray(deliveries) ? deliveries : []) {
    const id = toDeliveryId(delivery);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    nextFirstSeenById[id] = Number(state.firstSeenById[id] || now);
  }

  const nextState = {
    lastSeenAt: Number(state.lastSeenAt || 0),
    firstSeenById: nextFirstSeenById,
  };

  writeState(userId, nextState);
  return nextState;
}

export function markDriverAvailableDeliveriesSeen(userId) {
  const state = readState(userId);
  const nextState = {
    ...state,
    lastSeenAt: Date.now(),
  };
  writeState(userId, nextState);
  return nextState;
}

export function getDriverAvailableUnseenCount(userId) {
  const state = readState(userId);
  let count = 0;

  for (const id of Object.keys(state.firstSeenById || {})) {
    if (Number(state.firstSeenById[id] || 0) > Number(state.lastSeenAt || 0)) {
      count += 1;
    }
  }

  return count;
}
