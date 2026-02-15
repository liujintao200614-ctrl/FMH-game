import { create } from 'zustand';

type TankSessionState = {
  mode?: string;
  tankKey?: string;
  mapKey?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
  setMode: (mode: string) => void;
  setTank: (tankKey: string) => void;
  setMap: (mapKey: string) => void;
  setDifficulty: (difficulty: 'easy' | 'normal' | 'hard') => void;
  clear: () => void;
};

export const useTankSession = create<TankSessionState>((set) => ({
  mode: undefined,
  tankKey: undefined,
  mapKey: undefined,
  difficulty: 'normal',
  setMode: (mode) => set({ mode }),
  setTank: (tankKey) => set({ tankKey }),
  setMap: (mapKey) => set({ mapKey }),
  setDifficulty: (difficulty) => set({ difficulty }),
  clear: () => set({ mode: undefined, tankKey: undefined, mapKey: undefined, difficulty: 'normal' })
}));
