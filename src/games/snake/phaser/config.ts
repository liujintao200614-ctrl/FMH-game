import Phaser from 'phaser';
import { SnakeScene } from './SnakeScene';
import { SnakeMode } from './types';

export type SnakeConfig = {
  gridSize: { cols: number; rows: number };
  cellSize: number;
  gap: number;
  speedMs: number;
  speedPx?: number;
  segmentSpacing?: number;
  trailFactor?: number;
  lerpFactor?: number;
  zoom?: { min: number; max: number };
  scoreMultiplier?: number;
  enableBot?: boolean;
  foodDensity?: number; // 0~1 占比
  itemTarget?: number;
  itemRespawnMs?: number;
  botAggressiveness?: number;
  wallGraceMs?: number;
  foodRatio?: { small: number; big: number; rare: number };
  foodRespawnMs?: number;
  botCount?: number;
  colors: {
    bg: number;
    snake: number;
    snakeGlow: number;
    food: number;
    border: number;
  };
  mode: SnakeMode;
};

export const defaultSnakeConfig: SnakeConfig = {
  gridSize: { cols: 80, rows: 80 },
  cellSize: 22,
  gap: 1,
  speedMs: 120,
  speedPx: 180,
  segmentSpacing: 14,
  trailFactor: 20,
  lerpFactor: 0.4,
  zoom: { min: 0.6, max: 1.2 },
  scoreMultiplier: 1,
  enableBot: false,
  foodDensity: 0.009,
  itemTarget: 3,
  itemRespawnMs: 5200,
  colors: {
    bg: 0x0b1224,
    snake: 0x2cf0ff,
    snakeGlow: 0x7c3aed,
    food: 0xff7a00,
    border: 0x3b82f6
  },
  mode: 'classic'
};

export function createPhaserConfig(parent: HTMLElement, scene: SnakeScene): Phaser.Types.Core.GameConfig {
  const width = parent.clientWidth || defaultSnakeConfig.gridSize.cols * defaultSnakeConfig.cellSize;
  const height = parent.clientHeight || defaultSnakeConfig.gridSize.rows * defaultSnakeConfig.cellSize;
  return {
    type: Phaser.CANVAS,
    width,
    height,
    backgroundColor: defaultSnakeConfig.colors.bg,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      parent
    },
    audio: { noAudio: true, disableWebAudio: true },
    physics: { default: 'arcade' },
    scene
  };
}
