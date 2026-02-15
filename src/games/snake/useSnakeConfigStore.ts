import { useSyncExternalStore } from 'react';
import type { GameModeKey } from './GameModes';

type SnakeConfigState = {
  nickname: string;
  mode: GameModeKey;
  enableBot: boolean;
  majorMode: 'team' | 'score' | 'infinite';
  scoreTarget: number | null;
  teamMode: boolean;
  teamCount: number;
  snakesPerTeam: number;
  playerTeamId: number;
};

let state: SnakeConfigState = {
  nickname: 'SpaceTraveler',
  mode: 'normal',
  enableBot: true,
  majorMode: 'infinite',
  scoreTarget: null,
  teamMode: false,
  teamCount: 2,
  snakesPerTeam: 3,
  playerTeamId: 1
};

const listeners = new Set<() => void>();

function setConfig(cfg: Partial<SnakeConfigState>) {
  state = { ...state, ...cfg };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function getSnakeConfig() {
  return state;
}

export function useSnakeConfigStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snapshot, setConfig };
}

export { setConfig };
