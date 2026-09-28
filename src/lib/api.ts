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
  updateProfile: (displayName: string, avatarDataUrl?: string | null) =>
    request<{ user: AuthUser }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName, avatarDataUrl }),
    }),
  logout: () => request<{ success: true }>('/api/auth/logout', { method: 'POST' }),
};

export const dataApi = {
  load: () => request<{ data: Partial<LocalAppData> | null }>('/api/data'),
  save: (data: Partial<LocalAppData>) =>
    request<{ success: true }>('/api/data', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
