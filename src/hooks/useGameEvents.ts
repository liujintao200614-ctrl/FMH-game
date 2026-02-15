import { useEffect, useState } from 'react';

export interface GameEventPayload {
  game: string;
  result: 'win' | 'lose';
  score?: number;
  difficulty?: string;
}

export function useGameEvents(max = 5) {
  const [events, setEvents] = useState<GameEventPayload[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as GameEventPayload | undefined;
      if (!detail) return;
      setEvents((prev) => [detail, ...prev].slice(0, max));
    };
    window.addEventListener('gameEvent', handler as EventListener);
    return () => window.removeEventListener('gameEvent', handler as EventListener);
  }, [max]);

  return { events, latest: events[0] };
}
