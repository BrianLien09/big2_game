import { create } from 'zustand';

export interface ToastInfo {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  suggestedType?: string;
}

interface GameState {
  nickname: string;
  setNickname: (name: string) => void;
  roomId: string | null;
  setRoomId: (id: string | null) => void;
  toasts: ToastInfo[];
  addToast: (message: string, type?: ToastInfo['type'], duration?: number, extra?: Partial<ToastInfo>) => void;
  removeToast: (id: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
  nickname: '',
  setNickname: (name) => set({ nickname: name }),
  roomId: null,
  setRoomId: (id) => set({ roomId: id }),
  toasts: [],
  addToast: (message, type = 'info', duration = 4000, extra = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration, ...extra }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
}));
