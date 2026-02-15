import { useEffect, useMemo, useRef, useState } from 'react';
import { Grid, GameStatus, MoveDirection, Tile } from './types';
import { SIZE, initGame, moveGrid, placeRandomTile, hasWon, hasMoves, clearMergedFlags } from './logic';

const TILE_COLORS: Record<number, string> = {
  0: 'bg-[#e6d7c5]',
  2: 'bg-[#f7ead8]',
  4: 'bg-[#f2debf]',
  8: 'bg-[#f6c58a]',
  16: 'bg-[#f1ab63]',
  32: 'bg-[#eb8d4e]',
  64: 'bg-[#e46f3f]',
  128: 'bg-[#f4d06f]',
  256: 'bg-[#f0c45a]',
  512: 'bg-[#eab446]',
  1024: 'bg-[#e39f33]',
  2048: 'bg-[#d88b22]'
};

const TILE_TEXT: Record<number, string> = {
  0: 'text-transparent',
  2: 'text-[#6b4a2f]',
  4: 'text-[#6b4a2f]',
  8: 'text-[#fff7ea]',
  16: 'text-[#fff7ea]',
  32: 'text-[#fff7ea]',
  64: 'text-[#fff7ea]',
  128: 'text-[#5a3a22]',
  256: 'text-[#5a3a22]',
  512: 'text-[#5a3a22]',
  1024: 'text-[#4b2e19]',
  2048: 'text-[#4b2e19]'
};

const TILE_FONT: Record<number, string> = {
  2: 'text-5xl',
  4: 'text-5xl',
  8: 'text-5xl',
  16: 'text-5xl',
  32: 'text-5xl',
  64: 'text-5xl',
  128: 'text-4xl',
  256: 'text-4xl',
  512: 'text-4xl',
  1024: 'text-3xl',
  2048: 'text-3xl'
};

const directions: Record<string, MoveDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
  W: 'up',
  A: 'left',
  S: 'down',
  D: 'right'
};

const bestKey = 'fmh-2048-best';

type Merge2048PageProps = {
  onClose?: () => void;
};

export function Merge2048Page({ onClose }: Merge2048PageProps) {
  const idRef = useRef(1);
  const spawn = (base: Grid): Grid => {
    const value = Math.random() < 0.9 ? 2 : 4;
    const tile: Tile = { id: idRef.current++, value, row: 0, col: 0, merged: false };
    return placeRandomTile(base, tile);
  };
  const [grid, setGrid] = useState<Grid>(() => initGame(spawn));
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [view, setView] = useState<'intro' | 'game'>('intro');
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState(0);
  const [cellSize, setCellSize] = useState(0);
  const gap = 16;
  const padding = 16;

  useEffect(() => {
    const saved = window.localStorage.getItem(bestKey);
    setBestScore(saved ? Number(saved) : 0);
  }, []);

  useEffect(() => {
    if (bestScore <= 0) return;
    window.localStorage.setItem(bestKey, String(bestScore));
  }, [bestScore]);

  const resetGame = () => {
    idRef.current = 1;
    setGrid(initGame(spawn));
    setScore(0);
    setStatus('playing');
  };

  const applyMove = (direction: MoveDirection) => {
    if (status !== 'playing') return;
    const cleared = clearMergedFlags(grid);
    const result = moveGrid(cleared, direction);
    if (!result.moved) {
      const hadMerged = grid.flat().some((tile) => tile?.merged);
      if (hadMerged) setGrid(cleared);
      return;
    }
    const nextGrid = spawn(result.grid);
    const nextScore = score + result.scoreGained;
    setGrid(nextGrid);
    setScore(nextScore);
    if (nextScore > bestScore) setBestScore(nextScore);
    if (hasWon(nextGrid)) {
      setStatus('won');
      return;
    }
    if (!hasMoves(nextGrid)) setStatus('lost');
  };

  useEffect(() => {
    if (view !== 'game') return;
    const handleKey = (event: KeyboardEvent) => {
      const dir = directions[event.key];
      if (!dir) return;
      event.preventDefault();
      applyMove(dir);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, grid, status, score]);

  useEffect(() => {
    if (view !== 'game') return;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [view]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const size = Math.floor(Math.min(rect.width, rect.height));
      const inner = Math.max(0, size - padding * 2);
      const cell = Math.max(0, Math.floor((inner - gap * 3) / 4));
      setBoardSize(size);
      setCellSize(cell);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    touchRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    event.preventDefault();
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const touch = event.changedTouches[0];
    const start = touchRef.current;
    touchRef.current = null;
    if (!touch || !start) return;
    event.preventDefault();
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 30) return;
    if (absX > absY) {
      applyMove(dx > 0 ? 'right' : 'left');
    } else {
      applyMove(dy > 0 ? 'down' : 'up');
    }
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    mouseRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseUp = (event: React.MouseEvent) => {
    const start = mouseRef.current;
    mouseRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 30) return;
    if (absX > absY) {
      applyMove(dx > 0 ? 'right' : 'left');
    } else {
      applyMove(dy > 0 ? 'down' : 'up');
    }
  };

  const highestTile = useMemo(
    () => grid.flat().reduce((max, tile) => Math.max(max, tile?.value ?? 0), 0),
    [grid]
  );
  const tiles = useMemo(() => grid.flat().filter(Boolean) as Tile[], [grid]);

  return (
    <div
      className="min-h-screen text-[#5c4436]"
      style={{
        backgroundColor: '#fbf4e9',
        backgroundImage:
          'radial-gradient(#e6d7c5 1px, transparent 1px), radial-gradient(#f7ead8 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        backgroundPosition: '0 0, 11px 11px',
        fontFamily: '"Trebuchet MS", "Georgia", "Times New Roman", serif'
      }}
    >
      {view === 'intro' ? (
        <main className="max-w-5xl mx-auto px-6 py-14">
          <div className="rounded-[36px] bg-white/85 shadow-[0_30px_90px_rgba(141,96,70,0.2)] border border-[#f0e3d7] p-10 md:p-14">
            <div className="text-xs uppercase tracking-[0.45em] text-[#c48e6b]">2048</div>
            <h1 className="mt-4 text-4xl md:text-6xl font-semibold text-[#5a3b2b]">2048</h1>
            <p className="mt-4 text-sm md:text-base text-[#8a6a58] max-w-xl">
              轻轻滑动，合并相同数字，触发温柔升级。4×4 固定棋盘，追逐 2048 的宁静成就。
            </p>

            <div className="mt-8 grid gap-6 md:grid-cols-[1.2fr,1fr]">
              <div className="rounded-3xl border border-[#f0e3d7] bg-[#fff6ea] p-6 shadow-[inset_0_0_30px_rgba(245,220,198,0.6)]">
                <div className="text-xs uppercase tracking-[0.2em] text-[#c48e6b]">玩法提示</div>
                <div className="mt-4 space-y-2 text-sm text-[#7b5a45]">
                  <div>方向键或滑动：移动数字块</div>
                  <div>相同数字会合并并升级</div>
                  <div>每次移动后出现新的数字块</div>
                </div>
              </div>
              <div className="rounded-3xl border border-[#f0e3d7] bg-[#fff6ea] p-6 shadow-[inset_0_0_30px_rgba(245,220,198,0.6)]">
                <div className="text-xs uppercase tracking-[0.2em] text-[#c48e6b]">目标</div>
                <div className="mt-4 text-sm text-[#7b5a45]">
                  达到 2048 即胜利。没有可合并格子时游戏结束。
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetGame();
                    setView('game');
                  }}
                  className="mt-6 w-full rounded-2xl bg-[#f0a34c] py-3 font-semibold text-white shadow-[0_12px_30px_rgba(232,176,139,0.55)]"
                >
                  开始合并
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 w-full rounded-2xl border border-[#e5d1c1] py-2 text-sm text-[#8a6a58] hover:border-[#c48e6b] transition"
                >
                  返回大厅
                </button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6 h-[100dvh] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-[#c48e6b]">2048</div>
              <h2 className="text-3xl md:text-4xl font-semibold text-[#5a3b2b]">2048</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl bg-white border border-[#ede0d1] px-4 py-3 text-center shadow-[0_10px_24px_rgba(200,165,140,0.18)]">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[#c48e6b]">Score</div>
                <div className="text-lg font-semibold text-[#5a3b2b]">{score}</div>
              </div>
              <div className="rounded-2xl bg-white border border-[#ede0d1] px-4 py-3 text-center shadow-[0_10px_24px_rgba(200,165,140,0.18)]">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[#c48e6b]">Best</div>
                <div className="text-lg font-semibold text-[#5a3b2b]">{bestScore}</div>
              </div>
              <button
                type="button"
                onClick={resetGame}
                className="rounded-2xl bg-[#f6c38b] px-4 py-3 text-sm font-semibold text-[#5a3b2b] shadow-[0_12px_26px_rgba(232,176,139,0.35)]"
              >
                重开
              </button>
              <button
                type="button"
                onClick={() => setView('intro')}
                className="rounded-2xl border border-[#e5d1c1] px-4 py-3 text-sm text-[#8a6a58] hover:border-[#c48e6b] transition"
              >
                返回
              </button>
            </div>
          </div>

          <div className="flex justify-center">
            <div
              className="w-full max-w-[560px] aspect-square rounded-[28px] bg-[#d8c5b1] border border-[#cdb8a4] p-4 shadow-[0_30px_90px_rgba(171,126,92,0.25)] overflow-hidden"
              ref={boardRef}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              style={{ touchAction: 'none' }}
            >
              <div
                className="relative w-full h-full"
              >
                {boardSize > 0 && cellSize > 0 && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <div
                      className="relative"
                      style={{
                        width: `${cellSize * SIZE + gap * (SIZE - 1)}px`,
                        height: `${cellSize * SIZE + gap * (SIZE - 1)}px`
                      }}
                    >
                      {Array.from({ length: SIZE * SIZE }).map((_, idx) => {
                        const row = Math.floor(idx / SIZE);
                        const col = idx % SIZE;
                        return (
                          <div
                            key={`bg-${idx}`}
                            className="absolute rounded-[12px] bg-[#e6d7c5]"
                            style={{
                              width: `${cellSize}px`,
                              height: `${cellSize}px`,
                              transform: `translate(${col * (cellSize + gap)}px, ${row * (cellSize + gap)}px)`
                            }}
                          />
                        );
                      })}
                      {tiles.map((tile) => (
                        <div
                          key={tile.id}
                          className="absolute"
                          style={{
                            width: `${cellSize}px`,
                            height: `${cellSize}px`,
                            transform: `translate3d(${tile.col * (cellSize + gap)}px, ${tile.row * (cellSize + gap)}px, 0)`,
                            transition: 'transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                            willChange: 'transform'
                          }}
                        >
                          <div
                            className={`w-full h-full flex items-center justify-center rounded-[12px] ${TILE_COLORS[tile.value] ?? 'bg-[#3c3a32]'} ${TILE_TEXT[tile.value] ?? 'text-[#f9f6f2]'} shadow-[0_8px_18px_rgba(120,82,52,0.35)] ${tile.merged ? 'merge-pop' : ''}`}
                          >
                            <span className={`font-semibold ${TILE_FONT[tile.value] ?? 'text-2xl'}`}>{tile.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div
                  className="sr-only"
                />
              </div>
            </div>
          </div>
        </main>
      )}

      {view === 'game' && status !== 'playing' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="w-full max-w-md rounded-3xl border border-[#f0e3d7] bg-[#fff6ea] p-6 shadow-[0_30px_80px_rgba(140,98,70,0.35)]">
            <div className="text-xs uppercase tracking-[0.2em] text-[#c48e6b]">结算</div>
            <div className={`mt-3 text-2xl font-semibold ${status === 'won' ? 'text-[#9b5d2e]' : 'text-[#b35252]'}`}>
              {status === 'won' ? '合并成功' : '无路可走'}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[#7b5a45]">
              <div>分数：{score}</div>
              <div>最高块：{highestTile}</div>
              <div>最佳：{bestScore}</div>
              <div>状态：{status === 'won' ? '胜利' : '失败'}</div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  resetGame();
                  setStatus('playing');
                }}
                className="flex-1 rounded-2xl bg-[#e8b08b] py-2 text-white font-semibold"
              >
                再来一局
              </button>
              <button
                type="button"
                onClick={() => setView('intro')}
                className="flex-1 rounded-2xl border border-[#e5d1c1] py-2 text-sm text-[#8a6a58] hover:border-[#c48e6b] transition"
              >
                返回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
