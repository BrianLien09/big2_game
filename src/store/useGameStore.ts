import { create } from 'zustand';

interface GameState {
  nickname: string;
  setNickname: (name: string) => void;
  roomId: string | null;
  setRoomId: (id: string | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  nickname: '',
  setNickname: (name) => set({ nickname: name }),
  roomId: null,
  setRoomId: (id) => set({ roomId: id }),
}));
