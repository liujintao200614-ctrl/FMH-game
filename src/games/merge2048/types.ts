export type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  merged?: boolean;
};

export type Grid = (Tile | null)[][];

export type GameStatus = 'playing' | 'won' | 'lost';

export type MoveDirection = 'up' | 'down' | 'left' | 'right';
