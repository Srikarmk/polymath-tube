import { useSyncExternalStore } from "react";

// Everything personal lives in this browser only. Reads and writes are guarded because storage can be
// missing (private windows, blocked site data); the site then works without remembering anything.

export type State = {
  liked: string[];
  later: string[];
  history: { id: string; at: number }[];
  hidden: string[];
  weights: Record<string, number>;
  shuffle: number;
  type: string | null;
};

const KEY = "polymath-tube:v1";
const empty: State = { liked: [], later: [], history: [], hidden: [], weights: {}, shuffle: 0, type: null };

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

export const actions = {
  toggleLike: (id: string) => set({ ...state, liked: toggleIn(state.liked, id), hidden: state.hidden.filter((x) => x !== id) }),
  toggleLater: (id: string) => set({ ...state, later: toggleIn(state.later, id) }),
  hide: (id: string) => set({ ...state, hidden: [id, ...state.hidden.filter((x) => x !== id)], liked: state.liked.filter((x) => x !== id) }),
  unhide: (id: string) => set({ ...state, hidden: state.hidden.filter((x) => x !== id) }),
  watched: (id: string) =>
    set({ ...state, history: [{ id, at: Date.now() }, ...state.history.filter((h) => h.id !== id)].slice(0, 500) }),
  clearHistory: () => set({ ...state, history: [] }),
  setWeight: (facet: string, w: number) => set({ ...state, weights: { ...state.weights, [facet]: w } }),
  resetWeights: () => set({ ...state, weights: {} }),
  shuffle: () => set({ ...state, shuffle: state.shuffle + 1 }),
  setType: (type: string | null) => set({ ...state, type }),
};
