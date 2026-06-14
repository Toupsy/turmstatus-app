import { create } from "zustand";
import api from "./api";

// Zentraler Store: Auth-Zustand + Live-Lagedaten (Türme, Wachgänger, Boote, Anfragen).
export const useStore = create((set, get) => ({
  user: null,
  towers: [],
  guards: [],
  boats: [],
  requests: [],
  summary: null,
  loading: false,

  async loadMe() {
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data });
      return data;
    } catch {
      set({ user: null });
      return null;
    }
  },

  logout() {
    localStorage.removeItem("token");
    set({ user: null });
  },

  async refreshAll() {
    await Promise.all([
      get().refreshTowers(),
      get().refreshGuards(),
      get().refreshBoats(),
      get().refreshRequests(),
      get().refreshSummary(),
    ]);
  },

  async refreshTowers() {
    const { data } = await api.get("/towers");
    set({ towers: data });
  },
  async refreshGuards() {
    const { data } = await api.get("/guards");
    set({ guards: data });
  },
  async refreshBoats() {
    const { data } = await api.get("/boats");
    set({ boats: data });
  },
  async refreshRequests() {
    try {
      const { data } = await api.get("/requests");
      set({ requests: data });
    } catch {
      /* Rolle ohne Zugriff – ignorieren */
    }
  },
  async refreshSummary() {
    try {
      const { data } = await api.get("/dashboard/summary");
      set({ summary: data });
    } catch {
      /* nur Hauptwache */
    }
  },

  // Reagiert auf WebSocket-Events und lädt die betroffenen Listen neu.
  handleEvent(event) {
    const map = {
      towers_changed: () => {
        get().refreshTowers();
        get().refreshSummary();
      },
      guards_changed: () => {
        get().refreshGuards();
        get().refreshTowers();
        get().refreshSummary();
      },
      boats_changed: () => {
        get().refreshBoats();
        get().refreshSummary();
      },
      requests_changed: () => {
        get().refreshRequests();
        get().refreshGuards();
        get().refreshTowers();
        get().refreshSummary();
      },
    };
    (map[event] || (() => {}))();
  },
}));
