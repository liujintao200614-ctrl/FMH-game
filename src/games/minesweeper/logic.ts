import { Cell } from './types';

type Point = { row: number; col: number };

type RevealResult = {
  board: Cell[][];
  hitMine: boolean;
};

const directions = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1]
];

export const createEmptyBoard = (rows: number, cols: number): Cell[][] =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      row,
      col,
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacent: 0
    }))
  );

export const cloneBoard = (board: Cell[][]): Cell[][] =>
  board.map((row) => row.map((cell) => ({ ...cell })));

export const getNeighbors = (rows: number, cols: number, point: Point): Point[] => {
  const neighbors: Point[] = [];
  for (const [dr, dc] of directions) {
    const nr = point.row + dr;
    const nc = point.col + dc;
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
    neighbors.push({ row: nr, col: nc });
  }
  return neighbors;
};

export const placeMines = (board: Cell[][], mines: number, safe: Point): Cell[][] => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const safeSet = new Set<string>();
  safeSet.add(`${safe.row},${safe.col}`);
  for (const n of getNeighbors(rows, cols, safe)) {
    safeSet.add(`${n.row},${n.col}`);
  }

  const candidates: Point[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!safeSet.has(`${r},${c}`)) candidates.push({ row: r, col: c });
    }
  }

  const shuffled = candidates.sort(() => Math.random() - 0.5);
  const placed = shuffled.slice(0, Math.min(mines, shuffled.length));
  const next = cloneBoard(board);
  for (const p of placed) {
    next[p.row][p.col].isMine = true;
  }
  return computeAdjacents(next);
};

export const computeAdjacents = (board: Cell[][]): Cell[][] => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const next = cloneBoard(board);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (next[r][c].isMine) {
        next[r][c].adjacent = -1;
        continue;
      }
      const count = getNeighbors(rows, cols, { row: r, col: c }).reduce((acc, n) => {
        return acc + (next[n.row][n.col].isMine ? 1 : 0);
      }, 0);
      next[r][c].adjacent = count;
    }
  }
  return next;
};

export const revealCell = (board: Cell[][], point: Point): RevealResult => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const next = cloneBoard(board);
  const target = next[point.row]?.[point.col];
  if (!target || target.isRevealed || target.isFlagged) return { board: next, hitMine: false };

  if (target.isMine) {
    target.isRevealed = true;
    return { board: next, hitMine: true };
  }

  const queue: Point[] = [point];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const cell = next[current.row][current.col];
    if (cell.isRevealed || cell.isFlagged) continue;
    cell.isRevealed = true;
    if (cell.adjacent === 0) {
      for (const n of getNeighbors(rows, cols, current)) {
        const neighbor = next[n.row][n.col];
        if (!neighbor.isRevealed && !neighbor.isFlagged && !neighbor.isMine) {
          queue.push(n);
        }
      }
    }
  }

  return { board: next, hitMine: false };
};

export const toggleFlag = (board: Cell[][], point: Point): Cell[][] => {
  const next = cloneBoard(board);
  const cell = next[point.row]?.[point.col];
  if (!cell || cell.isRevealed) return next;
  cell.isFlagged = !cell.isFlagged;
  return next;
};

export const chordReveal = (board: Cell[][], point: Point): RevealResult => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  let currentBoard = cloneBoard(board);
  const cell = currentBoard[point.row]?.[point.col];
  if (!cell || !cell.isRevealed || cell.adjacent <= 0) return { board: currentBoard, hitMine: false };

  const neighbors = getNeighbors(rows, cols, point);
  const flaggedCount = neighbors.reduce((acc, n) => (currentBoard[n.row][n.col].isFlagged ? acc + 1 : acc), 0);
  if (flaggedCount !== cell.adjacent) return { board: currentBoard, hitMine: false };

  let hitMine = false;
  for (const n of neighbors) {
    const neighbor = currentBoard[n.row][n.col];
    if (neighbor.isRevealed || neighbor.isFlagged) continue;
    if (neighbor.isMine) {
      neighbor.isRevealed = true;
      hitMine = true;
      continue;
    }
    const result = revealCell(currentBoard, n);
    currentBoard = result.board;
  }

  return { board: currentBoard, hitMine };
};

export const revealAllMines = (board: Cell[][]): Cell[][] =>
  board.map((row) =>
    row.map((cell) => ({
      ...cell,
      isRevealed: cell.isMine ? true : cell.isRevealed
    }))
  );

export const countFlags = (board: Cell[][]): number =>
  board.reduce((acc, row) => acc + row.filter((cell) => cell.isFlagged).length, 0);

export const hasWon = (board: Cell[][]): boolean =>
  board.every((row) => row.every((cell) => (cell.isMine ? !cell.isRevealed : cell.isRevealed)));
