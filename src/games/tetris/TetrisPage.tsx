import { useEffect, useMemo, useRef, useState } from 'react';
import { Board, Cell, GameStatus, Move, Piece, PieceType } from './types';
import {
  clearLines,
  collide,
  createBag,
  createBoard,
  dropIntervalForLevel,
  getShape,
  ghostY,
  mergePiece,
  rotatePiece,
  scoreForLines,
  spawnPiece
} from './logic';

const COLORS: Record<number, string> = {
  0: 'bg-[#10131a]',
  1: 'bg-[#7fe7ff]',
  2: 'bg-[#8fb8ff]',
  3: 'bg-[#ffc38a]',
  4: 'bg-[#7fe7ff]',
  5: 'bg-[#8fb8ff]',
  6: 'bg-[#ffc38a]',
  7: 'bg-[#7fe7ff]'
};

const PIECE_COLOR: Record<PieceType, Cell> = {
  I: 1,
  J: 2,
  L: 3,
  O: 4,
  S: 5,
  T: 6,
  Z: 7
};

type TetrisPageProps = {
  onClose?: () => void;
};

type TetrisDifficulty = {
  key: 'easy' | 'normal' | 'hard';
  label: string;
  rows: number;
  cols: number;
};

const difficulties: TetrisDifficulty[] = [
  { key: 'easy', label: 'Easy', rows: 18, cols: 12 },
  { key: 'normal', label: 'Normal', rows: 20, cols: 16 },
  { key: 'hard', label: 'Hard', rows: 24, cols: 16 }
];

export function TetrisPage({ onClose }: TetrisPageProps) {
  const [difficultyKey, setDifficultyKey] = useState<TetrisDifficulty['key']>('normal');
  const difficulty = useMemo(
    () => difficulties.find((d) => d.key === difficultyKey) ?? difficulties[1],
    [difficultyKey]
  );

  const [board, setBoard] = useState<Board>(() => createBoard(difficulty.rows, difficulty.cols));
  const [queue, setQueue] = useState<PieceType[]>(() => createBag());
  const [current, setCurrent] = useState<Piece>(() => spawnPiece('T', difficulty.cols));
  const [hold, setHold] = useState<PieceType | null>(null);
  const [canHold, setCanHold] = useState(true);
  const [status, setStatus] = useState<GameStatus>('ready');
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [view, setView] = useState<'intro' | 'game'>('intro');
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const boardRef = useRef(board);
  const currentRef = useRef(current);
  const dropRef = useRef<number | null>(null);
  const lastSpawnRef = useRef<PieceType | null>(null);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const nextPieces = useMemo(() => queue.slice(0, 1), [queue]);

  const ensureQueue = (list: PieceType[]) => {
    if (list.length >= 7) return list;
    const avoid = list[list.length - 1];
    return [...list, ...createBag(avoid)];
  };

  const spawnNext = (nextType?: PieceType, boardState: Board = board) => {
    let nextQueue = queue;
    let type = nextType;
    if (!type) {
      type = nextQueue[0];
      nextQueue = nextQueue.slice(1);
    }
    if (lastSpawnRef.current && type === lastSpawnRef.current) {
      if (nextQueue.length > 0) {
        const swap = nextQueue[0];
        nextQueue = nextQueue.slice(1);
        nextQueue.push(type);
        type = swap;
      } else {
        const refill = createBag(type);
        type = refill[0];
        nextQueue = refill.slice(1);
      }
    }
    nextQueue = ensureQueue(nextQueue);
    setQueue(nextQueue);
    const piece = spawnPiece(type as PieceType, difficulty.cols);
    setCurrent(piece);
    setCanHold(true);
    lastSpawnRef.current = type as PieceType;
    if (collide(boardState, piece)) setStatus('gameover');
  };

  const startGame = () => {
    const initialQueue = createBag();
    setBoard(createBoard(difficulty.rows, difficulty.cols));
    setQueue(initialQueue.slice(1));
    setHold(null);
    setCanHold(true);
    setScore(0);
    setLines(0);
    setLevel(1);
    setStatus('playing');
    setCurrent(spawnPiece(initialQueue[0], difficulty.cols));
  };

  const lockPiece = (piece: Piece) => {
    const merged = mergePiece(board, piece);
    const cleared = clearLines(merged);
    setBoard(cleared.board);
    if (cleared.cleared > 0) {
      const newLines = lines + cleared.cleared;
      const newLevel = 1 + Math.floor(newLines / 10);
      setLines(newLines);
      setLevel(newLevel);
      setScore((prev) => prev + scoreForLines(cleared.cleared, level));
    }
    spawnNext(undefined, cleared.board);
  };

  const movePiece = (move: Move) => {
    if (status !== 'playing') return;
    if (move === 'left' || move === 'right' || move === 'down') {
      const dx = move === 'left' ? -1 : move === 'right' ? 1 : 0;
      const dy = move === 'down' ? 1 : 0;
      if (!collide(board, current, dx, dy)) {
        setCurrent({ ...current, x: current.x + dx, y: current.y + dy });
      } else if (move === 'down') {
        lockPiece(current);
      }
      return;
    }
    if (move === 'hard') {
      let drop = 0;
      while (!collide(board, current, 0, drop + 1)) drop++;
      const landed = { ...current, y: current.y + drop };
      setCurrent(landed);
      lockPiece(landed);
      return;
    }
    if (move === 'rotateCW' || move === 'rotateCCW') {
      const rotated = rotatePiece(board, current, move === 'rotateCW' ? 1 : -1);
      if (rotated) setCurrent(rotated);
      return;
    }
    if (move === 'hold') {
      if (!canHold) return;
      setCanHold(false);
      if (!hold) {
        setHold(current.type);
        spawnNext(undefined, board);
        return;
      }
      const swapType = hold;
      setHold(current.type);
      const swapped = spawnPiece(swapType, difficulty.cols);
      setCurrent(swapped);
      if (collide(board, swapped)) setStatus('gameover');
    }
  };

  useEffect(() => {
    if (status !== 'playing') return;
    const interval = dropIntervalForLevel(level);
    if (dropRef.current) window.clearInterval(dropRef.current);
    dropRef.current = window.setInterval(() => {
      const liveBoard = boardRef.current;
      const livePiece = currentRef.current;
      if (!collide(liveBoard, livePiece, 0, 1)) {
        setCurrent((prev) => ({ ...prev, y: prev.y + 1 }));
      } else {
        lockPiece(livePiece);
      }
    }, interval);
    return () => {
      if (dropRef.current) window.clearInterval(dropRef.current);
    };
  }, [status, level]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (status === 'ready') return;
      if (status === 'paused') {
        if (event.key.toLowerCase() === 'p') setStatus('playing');
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') movePiece('left');
      if (key === 'arrowright' || key === 'd') movePiece('right');
      if (key === 'arrowdown' || key === 's') movePiece('down');
      if ((key === ' ' || key === 'arrowup') && !event.repeat) movePiece('hard');
      if (key === 'w' || key === 'x') movePiece('rotateCW');
      if (key === 'z') movePiece('rotateCCW');
      if (key === 'c' || key === 'shift') movePiece('hold');
      if (key === 'p') setStatus('paused');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [status, current, board, hold, canHold]);

  const ghost = useMemo(() => {
    if (status !== 'playing') return null;
    const y = ghostY(board, current);
    return { ...current, y };
  }, [board, current, status]);

  const ghostCells = useMemo(() => {
    if (!ghost) return new Set<string>();
    const shape = getShape(ghost);
    const set = new Set<string>();
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const nx = ghost.x + x;
        const ny = ghost.y + y;
        if (ny < 0) continue;
        set.add(`${ny},${nx}`);
      }
    }
    return set;
  }, [ghost]);

  const composed = useMemo(() => {
    const grid = board.map((row) => row.slice()) as Board;
    const placePiece = (piece: Piece | null, ghosted = false) => {
      if (!piece) return;
      const shape = getShape(piece);
      const id = PIECE_COLOR[piece.type];
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (!shape[y][x]) continue;
          const nx = piece.x + x;
          const ny = piece.y + y;
          if (ny < 0) continue;
          if (!ghosted) grid[ny][nx] = id;
        }
      }
    };
    if (ghost) placePiece(ghost, true);
    placePiece(current, false);
    return grid;
  }, [board, current, ghost]);

  const gap = 2;
  const padding = 8;
  const isMobile = viewport.width > 0 && viewport.width < 1024;
  const isLandscapeMobile = isMobile && viewport.width > viewport.height;
  const cellSize = useMemo(() => {
    if (!viewport.width || !viewport.height) return 32;
    const boardMaxHeight = Math.min(
      viewport.height * (isMobile ? (isLandscapeMobile ? 0.56 : 0.62) : 0.85),
      980
    );
    const boardMaxWidth = Math.min(viewport.width * (isMobile ? 0.96 : 0.72), 1200);
    const rows = board.length || difficulty.rows;
    const cols = board[0]?.length ?? difficulty.cols;
    const sizeByHeight = (boardMaxHeight - padding * 2 - gap * (rows - 1)) / rows;
    const sizeByWidth = (boardMaxWidth - padding * 2 - gap * (cols - 1)) / cols;
    return Math.max(20, Math.floor(Math.min(sizeByHeight, sizeByWidth)));
  }, [viewport.height, viewport.width, board, difficulty, isMobile, isLandscapeMobile]);

  const renderBoard = (className: string) => (
    <div className={className}>
      <div
        className="grid bg-[#f0e3cf] rounded-2xl"
        style={{
          gridTemplateColumns: `repeat(${board[0]?.length ?? difficulty.cols}, ${cellSize}px)`,
          gap: `${gap}px`,
          padding: `${padding}px`
        }}
      >
        {Array.from({ length: board.length * (board[0]?.length ?? difficulty.cols) }).map((_, idx) => {
          const cols = board[0]?.length ?? difficulty.cols;
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          const value = composed[row][col];
          const ghosted = ghostCells.has(`${row},${col}`) && value === 0;
          return (
            <div
              key={idx}
              className={`${COLORS[value]} border-[2px] border-[#1b1b1b] ${
                ghosted ? 'outline outline-2 outline-[#1b1b1b]/40' : ''
              }`}
              style={{ width: cellSize, height: cellSize }}
            />
          );
        })}
      </div>
    </div>
  );
  const renderMiniPiece = (type: PieceType | undefined) => {
    if (!type) {
      return <div className="h-20 flex items-center justify-center text-xs text-[#6b6b6b]">--</div>;
    }
    const shape = getShape({ type, rotation: 0, x: 0, y: 0 });
    const size = 14;
    return (
      <div
        className="grid place-content-center"
        style={{
          gridTemplateColumns: `repeat(${shape[0]?.length ?? 4}, ${size}px)`,
          gap: '2px',
          padding: '6px'
        }}
      >
        {shape.flatMap((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${type}-${y}-${x}`}
              className={`${cell ? `${COLORS[PIECE_COLOR[type]]} border border-[#1b1b1b]` : 'bg-transparent'}`}
              style={{ width: size, height: size }}
            />
          ))
        )}
      </div>
    );
  };

  return (
    <div
      className="min-h-screen text-[#1b1b1b]"
      style={{
        backgroundColor: '#f7f4ef',
        backgroundImage:
          'radial-gradient(#d9d1c4 1px, transparent 1px), radial-gradient(#d9d1c4 1px, transparent 1px)',
        backgroundSize: '26px 26px',
        backgroundPosition: '0 0, 13px 13px',
        fontFamily: '"Comic Sans MS", "Trebuchet MS", "Segoe UI", sans-serif'
      }}
    >
      {view === 'intro' ? (
        <main className="min-h-screen flex flex-col">
          <div className="max-w-5xl mx-auto px-6 py-16">
            <div className="border-[3px] border-[#1b1b1b] rounded-[28px] bg-[#fff7e3] p-10 md:p-14 shadow-[8px_10px_0_#1b1b1b]">
              <div className="text-xs uppercase tracking-[0.45em] text-[#6b6b6b]">Tetris</div>
              <h1 className="mt-4 text-4xl md:text-5xl font-black text-[#1b1b1b]">现代街机方块</h1>
              <p className="mt-4 text-sm md:text-base text-[#4b4b4b] max-w-2xl">
                10×20 标准棋盘，7-bag 随机，SRS 旋转，Hold 与 Ghost 预览。向上挑战更高等级与速度。
              </p>
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border-[2px] border-[#1b1b1b] bg-white p-6 text-sm text-[#4b4b4b] space-y-2 shadow-[4px_5px_0_#1b1b1b]">
                  <div>← → / A D 移动</div>
                  <div>W / X 旋转（顺时针）</div>
                  <div>Z 旋转（逆时针）</div>
                  <div>C 或 Shift 保留</div>
                  <div>P 暂停</div>
                </div>
                <div className="rounded-2xl border-[2px] border-[#1b1b1b] bg-white p-6 shadow-[4px_5px_0_#1b1b1b]">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#6b6b6b]">开始</div>
                  <div className="mt-4 grid gap-2 text-sm text-[#4b4b4b]">
                    {difficulties.map((d) => (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setDifficultyKey(d.key)}
                        className={`w-full rounded-xl border-[2px] px-4 py-2 text-left transition ${
                          d.key === difficultyKey
                            ? 'border-[#ff7a5a] bg-[#fff1e8] text-[#1b1b1b] shadow-[3px_4px_0_#1b1b1b]'
                            : 'border-[#1b1b1b] bg-white text-[#4b4b4b]'
                        }`}
                      >
                        <div className="font-semibold">{d.label}</div>
                        <div className="text-xs opacity-70">{d.cols} × {d.rows}</div>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      startGame();
                      setView('game');
                    }}
                    className="mt-4 w-full rounded-xl bg-[#ff7a5a] text-[#1b1b1b] py-3 font-black border-[2px] border-[#1b1b1b] shadow-[4px_5px_0_#1b1b1b]"
                  >
                    进入游戏
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-3 w-full rounded-xl border-[2px] border-[#1b1b1b] text-sm text-[#1b1b1b] py-2 bg-white shadow-[4px_5px_0_#1b1b1b]"
                  >
                    返回大厅
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="min-h-screen px-3 md:px-6 py-3 md:py-8 flex items-start justify-center overflow-x-hidden">
          <div className="w-full max-w-[1280px]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex flex-wrap gap-2 text-sm font-black">
                <div className="px-3 py-2 rounded-full bg-white border-[2px] border-[#1b1b1b] shadow-[4px_5px_0_#1b1b1b]">
                  得分 {score}
                </div>
                <div className="px-3 py-2 rounded-full bg-white border-[2px] border-[#1b1b1b] shadow-[4px_5px_0_#1b1b1b]">
                  行数 {lines}
                </div>
                <div className="px-3 py-2 rounded-full bg-white border-[2px] border-[#1b1b1b] shadow-[4px_5px_0_#1b1b1b]">
                  等级 {level}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startGame}
                  className="px-4 py-2 rounded-full bg-[#ff7a5a] text-[#1b1b1b] text-sm font-black border-[2px] border-[#1b1b1b] shadow-[4px_5px_0_#1b1b1b]"
                >
                  {status === 'ready' ? '开始' : '重开'}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(status === 'paused' ? 'playing' : 'paused')}
                  className="px-4 py-2 rounded-full border-[2px] border-[#1b1b1b] text-sm text-[#1b1b1b] bg-white shadow-[4px_5px_0_#1b1b1b]"
                >
                  {status === 'paused' ? '继续' : '暂停'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('ready');
                    setView('intro');
                  }}
                  className="px-4 py-2 rounded-full border-[2px] border-[#1b1b1b] text-sm text-[#1b1b1b] bg-white shadow-[4px_5px_0_#1b1b1b]"
                >
                  返回
                </button>
              </div>
            </div>

            <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-3 md:gap-6 items-start`}>
              {renderBoard('w-full flex justify-center')}
              <div className={`${isMobile ? 'w-full grid grid-cols-2 gap-3' : 'w-40 flex flex-col gap-4'}`}>
                <div className="rounded-2xl border-[2px] border-[#1b1b1b] bg-white p-3 shadow-[4px_5px_0_#1b1b1b] min-h-[126px]">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#6b6b6b]">HOLD</div>
                  <div className="mt-2 flex items-center justify-center h-20 text-2xl font-black">
                    {hold ? renderMiniPiece(hold) : '--'}
                  </div>
                </div>
                <div className="rounded-2xl border-[2px] border-[#1b1b1b] bg-white p-3 shadow-[4px_5px_0_#1b1b1b] min-h-[126px]">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#6b6b6b]">NEXT / 下一块</div>
                  <div className="mt-2 flex items-center justify-center">{renderMiniPiece(nextPieces[0])}</div>
                </div>
              </div>
            </div>

            {status === 'paused' && (
              <div className="fixed inset-0 flex items-center justify-center z-30">
                <div className="rounded-2xl border-[2px] border-[#1b1b1b] bg-white/90 px-6 py-4 text-lg font-black shadow-[4px_5px_0_#1b1b1b]">
                  已暂停
                </div>
              </div>
            )}
            {status === 'gameover' && (
              <div className="fixed inset-0 flex items-center justify-center z-30">
                <div className="rounded-2xl border-[2px] border-[#1b1b1b] bg-white/90 px-6 py-4 text-lg font-black shadow-[4px_5px_0_#1b1b1b]">
                  游戏结束
                </div>
              </div>
            )}

            <div className="mt-3 md:hidden">
              <div className={`grid ${isLandscapeMobile ? 'grid-cols-6' : 'grid-cols-4'} gap-2 rounded-2xl border-[2px] border-[#1b1b1b] bg-white/95 p-2 shadow-[4px_5px_0_#1b1b1b]`}>
                <button
                  type="button"
                  className="px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black"
                  onClick={() => movePiece('left')}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black"
                  onClick={() => movePiece('down')}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black"
                  onClick={() => movePiece('right')}
                >
                  →
                </button>
                <button
                  type="button"
                  className="px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#ffe9de] font-black"
                  onClick={() => movePiece('rotateCW')}
                >
                  旋
                </button>
                <button
                  type="button"
                  className={`${isLandscapeMobile ? 'col-span-1' : 'col-span-2'} px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black`}
                  onClick={() => movePiece('hard')}
                >
                  速降
                </button>
                <button
                  type="button"
                  className={`${isLandscapeMobile ? 'col-span-1' : 'col-span-2'} px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black`}
                  onClick={() => movePiece('hold')}
                >
                  Hold
                </button>
              </div>
            </div>
          </div>
          <div className="hidden md:block fixed bottom-4 left-1/2 -translate-x-1/2 z-20">
            <div className="grid grid-cols-4 gap-2 rounded-2xl border-[2px] border-[#1b1b1b] bg-white/95 p-2 shadow-[4px_5px_0_#1b1b1b]">
              <button
                type="button"
                className="px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black"
                onClick={() => movePiece('left')}
              >
                ←
              </button>
              <button
                type="button"
                className="px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black"
                onClick={() => movePiece('down')}
              >
                ↓
              </button>
              <button
                type="button"
                className="px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black"
                onClick={() => movePiece('right')}
              >
                →
              </button>
              <button
                type="button"
                className="px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#ffe9de] font-black"
                onClick={() => movePiece('rotateCW')}
              >
                旋
              </button>
              <button
                type="button"
                className="col-span-2 px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black"
                onClick={() => movePiece('hard')}
              >
                速降
              </button>
              <button
                type="button"
                className="col-span-2 px-3 py-3 rounded-xl border-[2px] border-[#1b1b1b] bg-[#fff7e3] font-black"
                onClick={() => movePiece('hold')}
              >
                Hold
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
