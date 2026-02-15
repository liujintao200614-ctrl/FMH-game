import { SnakeConfig } from './phaser/config';

export type GameModeKey = 'casual' | 'normal' | 'fast';

export const GameModes: Record<GameModeKey, Partial<SnakeConfig>> = {
  casual: {
    gridSize: { cols: 100, rows: 100 },
    speedPx: 140,
    segmentSpacing: 16,
    trailFactor: 22,
    lerpFactor: 0.45,
    zoom: { min: 0.7, max: 1.25 },
    scoreMultiplier: 1,
    enableBot: false,
    foodDensity: 0.012, // 高密度
    itemTarget: 4,
    itemRespawnMs: 4200,
    botAggressiveness: 0.2,
    wallGraceMs: 800, // 短暂无敌
    foodRatio: { small: 0.75, big: 0.2, rare: 0.05 },
    foodRespawnMs: 800,
    botCount: 3
  },
  normal: {
    gridSize: { cols: 130, rows: 130 },
    speedPx: 180,
    segmentSpacing: 14,
    trailFactor: 20,
    lerpFactor: 0.4,
    zoom: { min: 0.6, max: 1.2 },
    scoreMultiplier: 1.2,
    enableBot: false,
    foodDensity: 0.009,
    itemTarget: 3,
    itemRespawnMs: 5200,
    botAggressiveness: 0.5,
    wallGraceMs: 0,
    foodRatio: { small: 0.7, big: 0.25, rare: 0.05 },
    foodRespawnMs: 900,
    botCount: 6
  },
  fast: {
    gridSize: { cols: 150, rows: 150 },
    speedPx: 240,
    segmentSpacing: 12,
    trailFactor: 18,
    lerpFactor: 0.35,
    zoom: { min: 0.5, max: 1.05 },
    scoreMultiplier: 2,
    enableBot: true, // 预留：极速下可生成更激进的 AI
    foodDensity: 0.0065, // 稀疏
    itemTarget: 3,
    itemRespawnMs: 6000,
    botAggressiveness: 0.8,
    wallGraceMs: 0,
    foodRatio: { small: 0.65, big: 0.3, rare: 0.05 },
    foodRespawnMs: 750,
    botCount: 9
  }
};
