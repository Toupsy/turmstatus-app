import { writable } from 'svelte/store';
import type { AppConfig, CurrentUser } from '@turmstatus/shared';

export const config = writable<AppConfig | null>(null);
export const currentUser = writable<CurrentUser | null>(null);

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}
export const toasts = writable<Toast[]>([]);
let toastId = 0;
export function showToast(message: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId;
  toasts.update((l) => [...l, { id, message, kind }]);
  setTimeout(() => toasts.update((l) => l.filter((t) => t.id !== id)), 4000);
}
