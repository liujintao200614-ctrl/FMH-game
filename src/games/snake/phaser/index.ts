import Phaser from 'phaser';
import { SnakeScene } from './SnakeScene';
import { createPhaserConfig, defaultSnakeConfig, SnakeConfig } from './config';
import { SnakeEvents, SnakeState, Direction, SnakeMode } from './types';

export interface SnakeGameHandle {
  game: Phaser.Game;
  scene: SnakeScene;
  destroy: () => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;
  setDirection: (direction: Direction) => void;
  setHeading: (dx: number, dy: number) => void;
}

export function createSnakeGame(parent: HTMLElement, events: SnakeEvents = {}, cfg?: Partial<SnakeConfig>): SnakeGameHandle {
  const scene = new SnakeScene({ ...defaultSnakeConfig, ...cfg }, events);
  const config = createPhaserConfig(parent, scene);
  const game = new Phaser.Game(config);
  return {
    game,
    scene,
    destroy: () => game.destroy(true),
    reset: () => scene.resetGame(),
    pause: () => scene.pauseGame(),
    resume: () => scene.resumeGame(),
    setDirection: (direction) => scene.setDirection(direction),
    setHeading: (dx, dy) => scene.setHeading(dx, dy)
  };
}

export type { SnakeEvents, SnakeState, Direction, SnakeConfig, SnakeMode };
