import { isDemoMode, demoFetch } from './demo.js';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  // Demo-Modus (Cloudflare-Preview): API im Browser simulieren statt fetchen.
  if (isDemoMode()) {
    const { status, data } = await demoFetch(method, url, body);
    if (status >= 400) {
      const message = (data as { error?: string })?.error ?? 'Fehler';
      throw new ApiError(message, status, data);
    }
    return data as T;
  }

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? res.statusText ?? 'Fehler';
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

export const apiGet = <T>(url: string) => req<T>('GET', url);
export const apiPost = <T>(url: string, body?: unknown) => req<T>('POST', url, body);
export const apiPatch = <T>(url: string, body?: unknown) => req<T>('PATCH', url, body);
export const apiDelete = <T>(url: string) => req<T>('DELETE', url);
