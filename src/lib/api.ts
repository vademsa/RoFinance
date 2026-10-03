import type { LocalAppData } from './localDb';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Yêu cầu không thành công');
  return data as T;
}

export const authApi = {
  me: () => request<{ user: AuthUser | null }>('/api/auth/me'),
  providers: () => request<{ google: boolean; apple: boolean }>('/api/auth/providers'),
  register: (email: string, password: string) =>
    request<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  googleLogin: async (): Promise<{ user: AuthUser } | null> => {
    window.location.assign('/api/auth/google');
    return null;
  },
  updateProfile: (displayName: string, avatarDataUrl?: string | null) =>
    request<{ user: AuthUser }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName, avatarDataUrl }),
    }),
  logout: async () => {
    const result = await request<{ success: true }>('/api/auth/logout', { method: 'POST' });
    dataRevisions.clear();
    return result;
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

const dataRevisions = new Map<string, string>();
