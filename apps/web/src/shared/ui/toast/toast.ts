import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  message: string;
}

const SHOW_FOR_MS = 3500;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function setToasts(next: Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number) {
  setToasts(toasts.filter((toast) => toast.id !== id));
}

/**
 * A short note that an action worked: "Операция добавлена". Errors stay
 * in the form or next to the control they are about, not in a toast.
 */
export function toast(message: string) {
  const id = nextId++;
  // The last three are enough: a burst of actions must not fill the screen.
  setToasts([...toasts.slice(-2), { id, message }]);
  setTimeout(() => dismissToast(id), SHOW_FOR_MS);
}

export function clearToasts() {
  setToasts([]);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => toasts,
  );
}
