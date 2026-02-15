export type Cell = {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacent: number;
};

export type Difficulty = {
  key: 'beginner' | 'intermediate' | 'expert';
  label: string;
  rows: number;
  cols: number;
  mines: number;
};

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';
