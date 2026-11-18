import { useSyncExternalStore } from "react";

export type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

let current: Toast | null = null;
let timer: number | undefined;
let n = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, action?: Toast["action"]) {
  current = { id: ++n, text, action };
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    current = null;
    emit();
  }, action ? 6000 : 3000);
  emit();
}

export function dismiss() {
  window.clearTimeout(timer);
  current = null;
  emit();
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
