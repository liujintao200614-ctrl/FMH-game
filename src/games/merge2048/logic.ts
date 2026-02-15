import { Grid, MoveDirection, Tile } from './types';

type MoveResult = {
  grid: Grid;
  scoreGained: number;
  moved: boolean;
};

export const SIZE = 4;

export const createEmptyGrid = (): Grid =>
  Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));

export const cloneGrid = (grid: Grid): Grid => grid.map((row) => row.slice());

export const getEmptyCells = (grid: Grid): Array<{ r: number; c: number }> => {
  const empties: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) empties.push({ r, c });
    }
  }
  return empties;
};

export const placeRandomTile = (grid: Grid, tile: Tile): Grid => {
  const empties = getEmptyCells(grid);
  if (empties.length === 0) return grid;
  const { r, c } = empties[Math.floor(Math.random() * empties.length)];
  const next = cloneGrid(grid);
  next[r][c] = { ...tile, row: r, col: c };
  return next;
};

const compress = (row: Array<Tile | null>) => row.filter((v): v is Tile => Boolean(v));

const mergeRow = (row: Tile[], rowIndex: number): { merged: Tile[]; score: number; moved: boolean } => {
  const result: Tile[] = [];
  let score = 0;
  let moved = false;
  let skip = false;
  for (let i = 0; i < row.length; i++) {
    if (skip) {
      skip = false;
      continue;
    }
    const current = row[i];
    const next = row[i + 1];
    if (next && current.value === next.value) {
      const mergedValue = current.value * 2;
      result.push({ ...current, value: mergedValue, row: rowIndex, col: result.length, merged: true });
      score += mergedValue;
      moved = true;
      skip = true;
    } else {
      result.push({ ...current, row: rowIndex, col: result.length, merged: false });
    }
  }
  while (result.length < SIZE) result.push(null as unknown as Tile);
  return { merged: result.filter((tile) => tile), score, moved };
};

const moveLeft = (grid: Grid): MoveResult => {
  let scoreGained = 0;
  let moved = false;
  const next = createEmptyGrid();

  for (let r = 0; r < SIZE; r++) {
    const compressed = compress(grid[r]);
    const { merged, score, moved: rowMoved } = mergeRow(compressed, r);
    scoreGained += score;
    if (rowMoved) moved = true;
    for (let c = 0; c < merged.length; c++) {
      const tile = merged[c];
      if (!tile) continue;
      if (tile.col !== c || tile.row !== r) moved = true;
      next[r][c] = tile;
    }
    for (let c = 0; c < SIZE; c++) {
      const original = grid[r][c];
      const resultTile = next[r][c];
      if (!original && !resultTile) continue;
      if (!original || !resultTile) moved = true;
      else if (original.id !== resultTile.id || original.value !== resultTile.value) moved = true;
    }
  }

  return { grid: next, scoreGained, moved };
};

const reverseGrid = (grid: Grid): Grid => {
  const next = createEmptyGrid();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const tile = grid[r][c];
      if (!tile) continue;
      const col = SIZE - 1 - c;
      next[r][col] = { ...tile, row: r, col };
    }
  }
  return next;
};

const transpose = (grid: Grid): Grid => {
  const next = createEmptyGrid();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const tile = grid[r][c];
      if (!tile) continue;
      next[c][r] = { ...tile, row: c, col: r };
    }
  }
  return next;
};

export const moveGrid = (grid: Grid, direction: MoveDirection): MoveResult => {
  let working = cloneGrid(grid);
  let result: MoveResult;

  if (direction === 'left') {
    result = moveLeft(working);
    return result;
  }

  if (direction === 'right') {
    working = reverseGrid(working);
    result = moveLeft(working);
    return {
      grid: reverseGrid(result.grid),
      scoreGained: result.scoreGained,
      moved: result.moved
    };
  }

  if (direction === 'up') {
    working = transpose(working);
    result = moveLeft(working);
    return {
      grid: transpose(result.grid),
      scoreGained: result.scoreGained,
      moved: result.moved
    };
  }

  // down
  working = transpose(working);
  working = reverseGrid(working);
  result = moveLeft(working);
  const restored = reverseGrid(result.grid);
  return {
    grid: transpose(restored),
    scoreGained: result.scoreGained,
    moved: result.moved
  };
};

export const hasWon = (grid: Grid): boolean =>
  grid.some((row) => row.some((tile) => (tile ? tile.value >= 2048 : false)));

export const hasMoves = (grid: Grid): boolean => {
  if (getEmptyCells(grid).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const value = grid[r][c]?.value ?? -1;
      if ((grid[r + 1]?.[c]?.value ?? -2) === value) return true;
      if ((grid[r]?.[c + 1]?.value ?? -2) === value) return true;
    }
  }
  return false;
};

export const initGame = (spawn: (grid: Grid) => Grid): Grid => {
  let grid = createEmptyGrid();
  grid = spawn(grid);
  grid = spawn(grid);
  return grid;
};

export const clearMergedFlags = (grid: Grid): Grid =>
  grid.map((row) =>
    row.map((tile) => (tile ? { ...tile, merged: false } : null))
  );
