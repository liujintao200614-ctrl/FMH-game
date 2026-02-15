export type Direction = 'up' | 'down' | 'left' | 'right';

export type SnakeMode = 'classic' | 'wrap' | 'practice';

export type FoodKind = 'small' | 'big' | 'rare';
export type ItemKind = 'shield' | 'magnet' | 'boost' | 'foodstorm';

export interface SnakeState {
  snake: { x: number; y: number; rot?: number }[];
  playerTeamId?: number;
  teamScores?: number[];
  bots: {
    body: { x: number; y: number; rot?: number }[];
    trail: { x: number; y: number }[];
    color: number;
    teamId?: number;
    score: number;
    speedPx: number;
    segmentSpacing: number;
    lerp: number;
    aggro: number;
    safeDist: number;
    speedMul: number;
    sprintTimer: number;
    sprintDuration: number;
    sprinting: boolean;
    shieldMs?: number;
    shieldGraceTimer?: number;
    magnetMs?: number;
    boostMs?: number;
    boostCooldownMs?: number;
    invulnerableMs?: number;
  }[];
  direction: Direction;
  nextDirection: Direction;
  foods: { id: string; x: number; y: number; kind: FoodKind; value: number; radius: number; spawnAt?: number }[];
  items?: { id: string; x: number; y: number; kind: ItemKind; radius: number; spawnAt?: number }[];
  score: number;
  isAlive: boolean;
  deathReason?: 'wall' | 'self' | 'bot' | 'score' | null;
  shieldMs?: number;
  magnetMs?: number;
  boostMs?: number;
  boostCooldownMs?: number;
}

export interface SnakeEvents {
  onScore?: (score: number) => void;
  onGameOver?: (score: number, reason?: SnakeState['deathReason']) => void;
  onStateChange?: (state: Partial<SnakeState>) => void;
}
