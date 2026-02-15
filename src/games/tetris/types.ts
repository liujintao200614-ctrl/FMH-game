export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Board = Cell[][];

export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export type Rotation = 0 | 1 | 2 | 3;

export type Piece = {
  type: PieceType;
  rotation: Rotation;
  x: number;
  y: number;
};

export type GameStatus = 'ready' | 'playing' | 'paused' | 'gameover';

export type Move = 'left' | 'right' | 'down' | 'hard' | 'rotateCW' | 'rotateCCW' | 'hold';
