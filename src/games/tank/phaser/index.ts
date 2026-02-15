import Phaser from 'phaser';
import { TankScene } from './TankScene';
import { createPhaserConfig, defaultTankConfig } from './config';
import { TankSceneConfig } from './types';

export interface TankGameHandle {
  game: Phaser.Game;
  scene: TankScene;
  destroy: () => void;
}

export function createTankGame(parent: HTMLElement, cfg?: Partial<TankSceneConfig>): TankGameHandle {
  const scene = new TankScene({ ...defaultTankConfig, ...cfg });
  const config = createPhaserConfig(parent, scene);
  const game = new Phaser.Game(config);
  return {
    game,
    scene,
    destroy: () => game.destroy(true)
  };
}

export type { TankSceneConfig };
