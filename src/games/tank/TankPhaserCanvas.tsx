import { useEffect, useRef } from 'react';
import { createTankGame, TankSceneConfig, TankGameHandle } from './phaser';

interface TankPhaserCanvasProps {
  configOverride?: Partial<TankSceneConfig>;
  miniMapCanvas?: HTMLCanvasElement | null;
  onReady?: (handle: TankGameHandle | null) => void;
}

export function TankPhaserCanvas({ configOverride, miniMapCanvas, onReady }: TankPhaserCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<TankGameHandle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (handleRef.current) {
      handleRef.current.destroy();
      handleRef.current = null;
    }
    const handle = createTankGame(containerRef.current, { ...configOverride, miniMapCanvas });
    handleRef.current = handle;
    onReady?.(handle);
    return () => {
      handleRef.current = null;
      onReady?.(null);
      handle.destroy();
    };
  }, [configOverride, onReady, miniMapCanvas]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 phaser-focus"
      tabIndex={0}
      onPointerDown={() => containerRef.current?.focus()}
    />
  );
}
