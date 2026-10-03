import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { LocalAppData } from '../src/lib/localDb';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface MobileTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

const configuredApiUrl = new URL(import.meta.env?.VITE_API_BASE_URL || 'https://rof.aprwatch.com');
if (configuredApiUrl.protocol !== 'https:' || configuredApiUrl.username || configuredApiUrl.password ||
  configuredApiUrl.pathname !== '/' || configuredApiUrl.search || configuredApiUrl.hash) {
  throw new Error('Mobile API URL phải là HTTPS origin hợp lệ');
}
const API_BASE_URL = configuredApiUrl.origin;
export const MOBILE_REFRESH_STORAGE_KEY = 'rofinance-mobile-refresh';
let accessToken: string | null = null;
const dataRevisions = new Map<string, string>();
let refreshPromise: Promise<boolean> | null = null;

function ensureNative() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Đăng nhập mobile chỉ hỗ trợ bản Android/iOS có lưu trữ bảo mật.');
  }
}

async function storeTokens(tokens: MobileTokens) {
  ensureNative();
  await SecureStorage.setItem(MOBILE_REFRESH_STORAGE_KEY, tokens.refreshToken);
  accessToken = tokens.accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  ensureNative();
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await SecureStorage.getItem(MOBILE_REFRESH_STORAGE_KEY);
    if (!refreshToken) return false;
    const response = await fetch(`${API_BASE_URL}/api/mobile/auth/refresh`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (response.status === 401) {
      accessToken = null;
      await SecureStorage.removeItem(MOBILE_REFRESH_STORAGE_KEY);
      return false;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Không thể gia hạn phiên đăng nhập');
    await storeTokens(result as MobileTokens);
    return true;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function mobileApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/')) throw new Error('Đường dẫn API không hợp lệ');
  if (!accessToken && !(await refreshAccessToken())) {
    throw new Error('Vui lòng đăng nhập lại');
  }
  const send = () => fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'omit',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  let response = await send();
  if (response.status === 401 && await refreshAccessToken()) {
    response = await send();
  }
  return response;
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const response = authenticated
    ? await mobileApiFetch(path, init)
    : await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        credentials: 'omit',
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Yêu cầu không thành công');
  return result as T;
}

async function hydrateAvatar(user: AuthUser): Promise<AuthUser> {
  if (!user.avatarUrl) return user;
  try {
    const response = await mobileApiFetch(user.avatarUrl);
    if (!response.ok) return { ...user, avatarUrl: null };
    const blob = await response.blob();
    const avatarUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { ...user, avatarUrl };
  } catch {
    return { ...user, avatarUrl: null };
  }
}

async function signIn(path: string, email: string, password: string) {
  ensureNative();
  const result = await request<{ user: AuthUser } & MobileTokens>(path, {
    method: 'POST', body: JSON.stringify({ email, password }),
  }, false);
  await storeTokens(result);
  dataRevisions.clear();
  return { user: await hydrateAvatar(result.user) };
}

export const authApi = {
  me: async () => {
    try {
      const result = await request<{ user: AuthUser }>('/api/mobile/auth/me');
      return { user: await hydrateAvatar(result.user) };
    } catch (error) {
      if (error instanceof Error && error.message === 'Vui lòng đăng nhập lại') return { user: null };
      throw error;
    }
  },
  providers: async () => ({ google: false, apple: false }),
  register: (email: string, password: string) => signIn('/api/mobile/auth/register', email, password),
  login: (email: string, password: string) => signIn('/api/mobile/auth/login', email, password),
  updateProfile: async (displayName: string, avatarDataUrl?: string | null) => {
    const result = await request<{ user: AuthUser }>('/api/auth/profile', {
      method: 'PATCH', body: JSON.stringify({ displayName, avatarDataUrl }),
    });
    return { user: await hydrateAvatar(result.user) };
  },
  logout: async () => {
    let revocationPending = false;
    let tokenRemovalFailed = false;
    try {
      await request<{ success: true }>('/api/mobile/auth/logout', { method: 'POST' });
    } catch {
      // Do not keep the financial UI unlocked merely because revocation could
      // not be confirmed while the device is offline or the server is down.
      revocationPending = true;
    } finally {
      accessToken = null;
      dataRevisions.clear();
      try {
        await SecureStorage.removeItem(MOBILE_REFRESH_STORAGE_KEY);
      } catch {
        tokenRemovalFailed = true;
      }
    }
    return { success: true as const, revocationPending, tokenRemovalFailed };
  },
};

export const dataApi = {
  load: async (ownerId: string) => {
    const result = await request<{ data: Partial<LocalAppData> | null; revision: string }>('/api/data');
    if (typeof result.revision !== 'string' || !/^\d+$/.test(result.revision)) {
      throw new Error('Backend chưa hỗ trợ phiên bản dữ liệu mới. Vui lòng cập nhật server.');
    }
    dataRevisions.set(ownerId, result.revision);
    return result;
  },
  save: async (ownerId: string, data: Partial<LocalAppData>) => {
    const revision = dataRevisions.get(ownerId);
    if (revision === undefined) throw new Error('Cần tải dữ liệu từ server trước khi lưu');
    const result = await request<{ success: true; revision: string }>('/api/data', {
      method: 'PUT',
      headers: { 'If-Match': `"${revision}"` },
      body: JSON.stringify(data),
    });
    dataRevisions.set(ownerId, result.revision);
    return result;
  },
};
