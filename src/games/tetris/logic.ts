import { Board, Cell, Piece, PieceType, Rotation } from './types';

const PIECE_IDS: Record<PieceType, Cell> = {
  I: 1,
  J: 2,
  L: 3,
  O: 4,
  S: 5,
  T: 6,
  Z: 7
};

const SHAPES: Record<PieceType, number[][][]> = {
  I: [
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0]
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0]
    ],
    [
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0]
    ]
  ],
  J: [
    [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0]
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 1]
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 0]
    ]
  ],
  L: [
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0]
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1]
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0]
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 0]
    ]
  ],
  O: [
    [
      [1, 1],
      [1, 1]
    ],
    [
      [1, 1],
      [1, 1]
    ],
    [
      [1, 1],
      [1, 1]
    ],
    [
      [1, 1],
      [1, 1]
    ]
  ],
  S: [
    [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0]
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1]
    ],
    [
      [0, 0, 0],
      [0, 1, 1],
      [1, 1, 0]
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0]
    ]
  ],
  T: [
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0]
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0]
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0]
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 0]
    ]
  ],
  Z: [
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0]
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0]
    ],
    [
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 1]
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0]
    ]
  ]
};

const JLSTZ_KICKS: Record<string, Array<[number, number]>> = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};

const I_KICKS: Record<string, Array<[number, number]>> = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};

export const createBoard = (rows: number, cols: number): Board =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0 as Cell));

export const getShape = (piece: Piece): number[][] => {
  const shape = SHAPES[piece.type][piece.rotation];
  return shape;
};

export const collide = (board: Board, piece: Piece, offsetX = 0, offsetY = 0): boolean => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const shape = getShape(piece);
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const nx = piece.x + x + offsetX;
      const ny = piece.y + y + offsetY;
      if (nx < 0 || nx >= cols) return true;
      if (ny >= rows) return true;
      if (ny < 0) continue;
      if (board[ny][nx] !== 0) return true;
    }
  }
  return false;
};

export const mergePiece = (board: Board, piece: Piece): Board => {
  const next = board.map((row) => row.slice()) as Board;
  const shape = getShape(piece);
  const id = PIECE_IDS[piece.type];
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const nx = piece.x + x;
      const ny = piece.y + y;
      if (ny < 0) continue;
      next[ny][nx] = id;
    }
  }
  return next;
};

export const getPieceCells = (piece: Piece): Array<{ x: number; y: number }> => {
  const shape = getShape(piece);
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (!shape[y][x]) continue;
      const nx = piece.x + x;
      const ny = piece.y + y;
      if (ny < 0) continue;
      cells.push({ x: nx, y: ny });
    }
  }
  return cells;
};

export const clearLines = (board: Board): { board: Board; cleared: number } => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const remaining = board.filter((row) => row.some((cell) => cell === 0));
  const cleared = rows - remaining.length;
  const newRows = Array.from({ length: cleared }, () => Array.from({ length: cols }, () => 0 as Cell));
  return { board: [...newRows, ...remaining], cleared };
};

export const rotatePiece = (board: Board, piece: Piece, dir: 1 | -1): Piece | null => {
  const from = piece.rotation;
  const to = (((from + dir) % 4) + 4) % 4 as Rotation;
  const kicks = piece.type === 'I' ? I_KICKS : JLSTZ_KICKS;
  const key = `${from}>${to}`;
  const tests = piece.type === 'O' ? [[0,0]] : (kicks[key] ?? [[0,0]]);

  for (const [dx, dy] of tests) {
    const candidate: Piece = { ...piece, rotation: to, x: piece.x + dx, y: piece.y + dy };
    if (!collide(board, candidate)) return candidate;
  }
  return null;
};

export const spawnPiece = (type: PieceType, cols: number): Piece => {
  const baseX = Math.max(0, Math.floor(cols / 2) - 2);
  return {
    type,
    rotation: 0,
    x: baseX,
    y: -1
  };
};

export const ghostY = (board: Board, piece: Piece): number => {
  let offset = 0;
  while (!collide(board, piece, 0, offset + 1)) {
    offset++;
  }
  return piece.y + offset;
};

export const createBag = (avoid?: PieceType): PieceType[] => {
  const bag: PieceType[] = ['I','J','L','O','S','T','Z'];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  if (avoid && bag[0] === avoid) {
    const swapIndex = bag.findIndex((t) => t !== avoid);
    if (swapIndex > 0) [bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]];
  }
  return bag;
};

export const scoreForLines = (lines: number, level: number): number => {
  const base = [0, 100, 300, 500, 800][lines] ?? 0;
  return base * level;
};

export const dropIntervalForLevel = (level: number): number => {
  const base = 1000;
  return Math.max(80, Math.floor(base * Math.pow(0.88, level - 1)));
};
