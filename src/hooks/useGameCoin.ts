import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'fmh_game_coin_state_react';
const UPDATE_EVENT = 'gamecoin:updated';

interface CoinState {
  balance: number;
  history: { id: string; amount: number; reason: string; ts: number }[];
}

interface SyncDetail {
  state: CoinState;
  sender: string;
}

const defaultState: CoinState = {
  balance: 0,
  history: []
};

function loadState(): CoinState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

function saveState(state: CoinState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function useGameCoin() {
  const [state, setState] = useState<CoinState>(() => loadState());
  const instanceId = useRef(`gc_${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const syncFromStorage = () => {
      setState(loadState());
    };
    const syncFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<SyncDetail>).detail;
      if (!detail || detail.sender === instanceId) return;
      setState(detail.state ?? loadState());
    };
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(UPDATE_EVENT, syncFromEvent as EventListener);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(UPDATE_EVENT, syncFromEvent as EventListener);
    };
  }, [instanceId]);

  useEffect(() => {
    saveState(state);
    window.dispatchEvent(
      new CustomEvent<SyncDetail>(UPDATE_EVENT, { detail: { state, sender: instanceId } })
    );
  }, [state, instanceId]);

  const add = (amount: number, reason = 'game_reward') => {
    setState((prev) => {
      const next = {
        balance: Math.max(0, prev.balance + amount),
        history: [
          { id: `entry_${Date.now()}`, amount, reason, ts: Date.now() },
          ...prev.history
        ].slice(0, 20)
      };
      return next;
    });
  };

  return {
    balance: state.balance,
    history: state.history,
    add
  };
}
