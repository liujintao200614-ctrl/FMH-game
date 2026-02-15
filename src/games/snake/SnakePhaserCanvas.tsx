import { useEffect, useRef } from 'react';
import { createSnakeGame, SnakeEvents, SnakeGameHandle, SnakeConfig } from './phaser';

interface SnakePhaserCanvasProps {
  onScore?: (score: number) => void;
  onGameOver?: SnakeEvents['onGameOver'];
  onStateChange?: SnakeEvents['onStateChange'];
  onReady?: (controls: Pick<SnakeGameHandle, 'reset' | 'pause' | 'resume' | 'setDirection' | 'setHeading'>) => void;
  configOverride?: Partial<SnakeConfig>;
}

export function SnakePhaserCanvas({ onScore, onGameOver, onStateChange, onReady, configOverride }: SnakePhaserCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const eventsRef = useRef<SnakeEvents>({});
  const handleRef = useRef<SnakeGameHandle | null>(null);

  eventsRef.current.onScore = onScore;
  eventsRef.current.onGameOver = onGameOver;
  eventsRef.current.onStateChange = onStateChange;

  useEffect(() => {
    if (!containerRef.current) return;
    // 如果已有实例，先销毁再重建，确保新配置生效
    if (handleRef.current) {
      handleRef.current.destroy();
      handleRef.current = null;
    }
    const events: SnakeEvents = {
      onScore: (s) => eventsRef.current.onScore?.(s),
      onGameOver: (s, r) => eventsRef.current.onGameOver?.(s, r),
      onStateChange: (st) => eventsRef.current.onStateChange?.(st)
    };
    const gameHandle = createSnakeGame(containerRef.current, events, configOverride);
    handleRef.current = gameHandle;
    onReady?.({
      reset: gameHandle.reset,
      pause: gameHandle.pause,
      resume: gameHandle.resume,
      setDirection: gameHandle.setDirection,
      setHeading: gameHandle.setHeading
    });
    return () => {
      handleRef.current = null;
      gameHandle.destroy();
    };
  }, [onReady, configOverride]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full touch-none" />;
}
