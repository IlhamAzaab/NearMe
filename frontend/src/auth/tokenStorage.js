const ACCESS_TOKEN_KEY = "token";
const ROLE_KEY = "role";
const USER_ID_KEY = "userId";
const USER_NAME_KEY = "userName";
const REFRESH_TOKEN_KEY = "refreshToken";

let nativeStorageAdapter = null;

export function setNativeStorageAdapter(adapter) {
  nativeStorageAdapter = adapter || null;
}

function isWebStorageAvailable() {
  return typeof window !== "undefined" && !!window.localStorage;
}

async function getFromNative(key) {
  if (!nativeStorageAdapter?.getItem) return null;
  try {
    return await nativeStorageAdapter.getItem(key);
  } catch {
    return null;
  }
}

async function setToNative(key, value) {
  if (!nativeStorageAdapter?.setItem) return;
  try {
    await nativeStorageAdapter.setItem(key, value);
  } catch {
    // Ignore native storage write failures to avoid forced logout loops.
  }
}

async function removeFromNative(key) {
  if (!nativeStorageAdapter?.removeItem) return;
  try {
    await nativeStorageAdapter.removeItem(key);
  } catch {
    // Ignore native storage delete failures.
  }
}

export async function getAccessToken() {
  if (isWebStorageAvailable()) {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return getFromNative(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken() {
  if (isWebStorageAvailable()) {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return getFromNative(REFRESH_TOKEN_KEY);
}

export async function persistAuthSession(session = {}) {
  const token = session.token || null;
  const role = session.role || null;
  const userId = session.userId || null;
  const userName = session.userName || null;
  const refreshToken = session.refreshToken || null;

  if (isWebStorageAvailable()) {
    if (token) window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    else window.localStorage.removeItem(ACCESS_TOKEN_KEY);

    if (role) window.localStorage.setItem(ROLE_KEY, role);
    else window.localStorage.removeItem(ROLE_KEY);

    if (userId) window.localStorage.setItem(USER_ID_KEY, userId);
    else window.localStorage.removeItem(USER_ID_KEY);

    if (userName) window.localStorage.setItem(USER_NAME_KEY, userName);

    if (refreshToken) {
      // Mobile/webview fallback only. On web we primarily rely on httpOnly cookie.
      window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } else {
      // Prevent stale cross-role refresh token reuse from older sessions.
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    }

    return;
  }

  if (token) await setToNative(ACCESS_TOKEN_KEY, token);
  else await removeFromNative(ACCESS_TOKEN_KEY);

  if (role) await setToNative(ROLE_KEY, role);
  else await removeFromNative(ROLE_KEY);

  if (userId) await setToNative(USER_ID_KEY, userId);
  else await removeFromNative(USER_ID_KEY);

  if (userName) await setToNative(USER_NAME_KEY, userName);
  if (refreshToken) await setToNative(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearStoredAuthSession() {
  if (isWebStorageAvailable()) {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(ROLE_KEY);
    window.localStorage.removeItem(USER_ID_KEY);
    window.localStorage.removeItem(USER_NAME_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }

  await Promise.all([
    removeFromNative(ACCESS_TOKEN_KEY),
    removeFromNative(ROLE_KEY),
    removeFromNative(USER_ID_KEY),
    removeFromNative(USER_NAME_KEY),
    removeFromNative(REFRESH_TOKEN_KEY),
  ]);
}
