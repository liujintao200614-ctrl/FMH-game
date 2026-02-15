export type TankDifficulty = 'easy' | 'normal' | 'hard';

export type TankSceneConfig = {
  tileSize: number;
  cols: number;
  rows: number;
  viewPercent?: number;
  miniMapWidth?: number;
  miniMapHeight?: number;
  miniMapPercent?: number;
  miniMapCanvas?: HTMLCanvasElement | null;
  mapKey?: string;
  aiDifficulty?: TankDifficulty;
  resourcePoints?: Array<{ x: number; y: number }>;
  spawnPoints?: Array<{ x: number; y: number; team?: 'player' | 'ai' | 'neutral' }>;
  palette: {
    ground: number;
    groundAlt: number;
    water: number;
    rock: number;
    grid: number;
    base: number;
    accent: number;
  };
};
