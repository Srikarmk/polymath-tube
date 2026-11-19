import { useSyncExternalStore } from "react";

// Everything personal lives in this browser only. Reads and writes are guarded because storage can be
// missing (private windows, blocked site data); the site then works without remembering anything.

export type Playlist = { id: string; name: string; ids: string[]; created: number };
/** Where you stopped in a video: seconds in, its length in seconds, and when. */
export type Progress = { t: number; d: number; at: number };

export type State = {
  liked: string[];
  later: string[];
  history: { id: string; at: number }[];
  hidden: string[];
  weights: Record<string, number>;
  shuffle: number;
  type: string | null;
  autoplay: boolean;
  playlists: Playlist[];
  progress: Record<string, Progress>;
};

const KEY = "polymath-tube:v1";
const empty: State = {
  liked: [],
  later: [],
  history: [],
  hidden: [],
  weights: {},
  shuffle: 0,
  type: null,
  autoplay: true,
  playlists: [],
  progress: {},
};

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

let state: State = read();
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep it in memory for this visit */
  }
  listeners.forEach((l) => l());
}

export const snapshot = () => state;

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

const toggleIn = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];

/** A video counts as finished in its last 30 seconds (end cards, credits). */
export const FINISH_MARGIN = 30;
export const isInProgress = (p?: Progress) => !!p && p.d > 0 && p.t >= 30 && p.t < p.d - FINISH_MARGIN;

const editList = (pid: string, f: (p: Playlist) => Playlist) =>
  set({ ...state, playlists: state.playlists.map((p) => (p.id === pid ? f(p) : p)) });

export const actions = {
  toggleLike: (id: string) => set({ ...state, liked: toggleIn(state.liked, id), hidden: state.hidden.filter((x) => x !== id) }),
  toggleLater: (id: string) => set({ ...state, later: toggleIn(state.later, id) }),
  hide: (id: string) => set({ ...state, hidden: [id, ...state.hidden.filter((x) => x !== id)], liked: state.liked.filter((x) => x !== id) }),
  unhide: (id: string) => set({ ...state, hidden: state.hidden.filter((x) => x !== id) }),
  watched: (id: string) =>
    set({ ...state, history: [{ id, at: Date.now() }, ...state.history.filter((h) => h.id !== id)].slice(0, 500) }),
  clearHistory: () => set({ ...state, history: [], progress: {} }),
  setWeight: (facet: string, w: number) => set({ ...state, weights: { ...state.weights, [facet]: w } }),
  resetWeights: () => set({ ...state, weights: {} }),
  shuffle: () => set({ ...state, shuffle: state.shuffle + 1 }),
  setType: (type: string | null) => set({ ...state, type }),
  toggleAutoplay: () => set({ ...state, autoplay: !state.autoplay }),

  setProgress: (id: string, t: number, d: number) => {
    if (!(d > 0) || !(t >= 0)) return;
    set({ ...state, progress: { ...state.progress, [id]: { t: Math.round(t), d: Math.round(d), at: Date.now() } } });
  },
  clearProgress: (id: string) => {
    const { [id]: _, ...rest } = state.progress;
    set({ ...state, progress: rest });
  },

  createPlaylist: (name: string, first?: string) => {
    const id = Math.random().toString(36).slice(2, 9);
    set({ ...state, playlists: [{ id, name: name.trim() || "Untitled playlist", ids: first ? [first] : [], created: Date.now() }, ...state.playlists] });
    return id;
  },
  renamePlaylist: (pid: string, name: string) => editList(pid, (p) => ({ ...p, name: name.trim() || p.name })),
  deletePlaylist: (pid: string) => set({ ...state, playlists: state.playlists.filter((p) => p.id !== pid) }),
  restorePlaylist: (p: Playlist) => set({ ...state, playlists: [p, ...state.playlists.filter((x) => x.id !== p.id)] }),
  togglePlaylistItem: (pid: string, vid: string) =>
    editList(pid, (p) => ({ ...p, ids: p.ids.includes(vid) ? p.ids.filter((x) => x !== vid) : [...p.ids, vid] })),
  moveInPlaylist: (pid: string, vid: string, by: number) =>
    editList(pid, (p) => {
      const i = p.ids.indexOf(vid);
      const j = Math.max(0, Math.min(p.ids.length - 1, i + by));
      if (i < 0 || i === j) return p;
      const ids = [...p.ids];
      ids.splice(i, 1);
      ids.splice(j, 0, vid);
      return { ...p, ids };
    }),

  /** Replace the library with an exported one; unknown fields are dropped, missing ones keep defaults. */
  importState: (raw: unknown) => {
    const r = (raw ?? {}) as Partial<State>;
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
    const progress: Record<string, Progress> = {};
    if (r.progress && typeof r.progress === "object")
      for (const [k, p] of Object.entries(r.progress))
        if (p && Number.isFinite(p.t) && Number.isFinite(p.d)) progress[k] = { t: p.t, d: p.d, at: Number(p.at) || 0 };
    set({
      ...empty,
      liked: ids(r.liked),
      later: ids(r.later),
      hidden: ids(r.hidden),
      history: Array.isArray(r.history)
        ? r.history.filter((h) => h && typeof h.id === "string").map((h) => ({ id: h.id, at: Number(h.at) || 0 }))
        : [],
      weights: r.weights && typeof r.weights === "object" ? r.weights : {},
      autoplay: r.autoplay !== false,
      playlists: Array.isArray(r.playlists)
        ? r.playlists
            .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
            .map((p) => ({ id: p.id, name: p.name, ids: ids(p.ids), created: Number(p.created) || 0 }))
        : [],
      progress,
    });
  },
};
