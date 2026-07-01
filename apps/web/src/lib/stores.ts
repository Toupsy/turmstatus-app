import { writable, derived, get } from 'svelte/store';
import type {
  AppConfig,
  CurrentUser,
  TowerView,
  GuardView,
  BoatView,
  RequestView,
  DashboardSummary,
  UserDto
} from '@turmstatus/shared';
import { apiGet } from './api.js';

export const config = writable<AppConfig | null>(null);
export const currentUser = writable<CurrentUser | null>(null);

export const towers = writable<TowerView[]>([]);
export const guards = writable<GuardView[]>([]);
export const boats = writable<BoatView[]>([]);
export const requests = writable<RequestView[]>([]);
export const summary = writable<DashboardSummary | null>(null);
export const teamMembers = writable<UserDto[]>([]);

// --- Rollen-Helfer ---
export const isAdmin = derived(currentUser, ($u) => !!$u?.isAdmin);
export const isWachfuehrer = derived(currentUser, ($u) => $u?.role === 'WACHFUEHRER');
export const isBootsfuehrer = derived(currentUser, ($u) => $u?.role === 'BOOTSFUEHRER');
export const canManage = derived(currentUser, ($u) => $u?.role === 'WACHFUEHRER'); // operative Verwaltung

// --- Toasts ---
export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}
export const toasts = writable<Toast[]>([]);
let toastId = 0;
export function showToast(message: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId;
  toasts.update((list) => [...list, { id, message, kind }]);
  setTimeout(() => toasts.update((list) => list.filter((t) => t.id !== id)), 4000);
}

// --- Refresh-Funktionen ---
export async function refreshTowers(): Promise<void> {
  towers.set(await apiGet<TowerView[]>('/api/towers'));
}
export async function refreshGuards(): Promise<void> {
  guards.set(await apiGet<GuardView[]>('/api/guards'));
}
export async function refreshBoats(): Promise<void> {
  boats.set(await apiGet<BoatView[]>('/api/boats'));
}
export async function refreshRequests(): Promise<void> {
  requests.set(await apiGet<RequestView[]>('/api/requests'));
}
export async function refreshSummary(): Promise<void> {
  summary.set(await apiGet<DashboardSummary>('/api/dashboard/summary'));
}
export async function refreshTeam(): Promise<void> {
  if (get(currentUser)?.role !== 'WACHFUEHRER') return;
  teamMembers.set(await apiGet<UserDto[]>('/api/team/members'));
}

export async function refreshAll(): Promise<void> {
  await Promise.allSettled([
    refreshTowers(),
    refreshGuards(),
    refreshBoats(),
    refreshRequests(),
    refreshSummary(),
    refreshTeam()
  ]);
}
