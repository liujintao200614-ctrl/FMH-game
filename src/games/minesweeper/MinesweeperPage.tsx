import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cell,
  Difficulty,
  GameStatus
} from './types';
import {
  chordReveal,
  countFlags,
  createEmptyBoard,
  hasWon,
  placeMines,
  revealAllMines,
  revealCell,
  toggleFlag
} from './logic';

const difficulties: Difficulty[] = [
  { key: 'beginner', label: 'Beginner', rows: 9, cols: 9, mines: 10 },
  { key: 'intermediate', label: 'Intermediate', rows: 16, cols: 16, mines: 40 },
  { key: 'expert', label: 'Expert', rows: 16, cols: 30, mines: 99 }
];

const numberColors = [
  '#2f2f2f',
  '#0c4f80',
  '#1f6b40',
  '#8a6f00',
  '#8c5600',
  '#8d1f2f',
  '#4c3f72',
  '#2a6e77',
  '#111111'
];


type MinesweeperPageProps = {
  onClose?: () => void;
};

export function MinesweeperPage({ onClose }: MinesweeperPageProps) {
  const [difficultyKey, setDifficultyKey] = useState<Difficulty['key']>('beginner');
  const difficulty = useMemo(
    () => difficulties.find((d) => d.key === difficultyKey) ?? difficulties[0],
    [difficultyKey]
  );

  const [board, setBoard] = useState<Cell[][]>(() => createEmptyBoard(difficulty.rows, difficulty.cols));
  const [status, setStatus] = useState<GameStatus>('ready');
  const [seconds, setSeconds] = useState(0);
  const [hasSeeded, setHasSeeded] = useState(false);
  const [view, setView] = useState<'intro' | 'game'>('intro');
  const [showResult, setShowResult] = useState(true);
  const [mobileFlagMode, setMobileFlagMode] = useState(false);
  const longPressTimers = useRef<Map<string, number>>(new Map());
  const longPressTriggered = useRef<Set<string>>(new Set());
  const isTouchDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(pointer: coarse)').matches === true ||
      /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
    );
  }, []);

  useEffect(() => {
    setBoard(createEmptyBoard(difficulty.rows, difficulty.cols));
    setStatus('ready');
    setSeconds(0);
    setHasSeeded(false);
    setShowResult(true);
  }, [difficulty]);

  useEffect(() => {
    if (status !== 'playing') return;
    const id = window.setInterval(() => setSeconds((prev) => prev + 1), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const handleReset = () => {
    setBoard(createEmptyBoard(difficulty.rows, difficulty.cols));
    setStatus('ready');
    setSeconds(0);
    setHasSeeded(false);
    setShowResult(true);
    setMobileFlagMode(false);
  };

  const handleReveal = (cell: Cell) => {
    if (status === 'lost' || status === 'won') return;

    let currentBoard = board;
    if (!hasSeeded) {
      currentBoard = placeMines(board, difficulty.mines, { row: cell.row, col: cell.col });
      setHasSeeded(true);
    }

    const result = revealCell(currentBoard, { row: cell.row, col: cell.col });
    const nextBoard = result.board;

    if (result.hitMine) {
      setBoard(revealAllMines(nextBoard));
      setStatus('lost');
      setShowResult(true);
      return;
    }

    if (status === 'ready') setStatus('playing');
    if (hasWon(nextBoard)) {
      setBoard(nextBoard);
      setStatus('won');
      setShowResult(true);
      return;
    }
    setBoard(nextBoard);
  };

  const handleToggleFlag = (cell: Cell) => {
    if (status === 'lost' || status === 'won') return;
    if (!hasSeeded && status === 'ready') setStatus('playing');
    setBoard((prev) => toggleFlag(prev, { row: cell.row, col: cell.col }));
  };

  const handleChord = (cell: Cell) => {
    if (status === 'lost' || status === 'won') return;
    if (!cell.isRevealed || cell.adjacent <= 0) return;

    const result = chordReveal(board, { row: cell.row, col: cell.col });
    const nextBoard = result.board;

    if (result.hitMine) {
      setBoard(revealAllMines(nextBoard));
      setStatus('lost');
      return;
    }

    if (hasWon(nextBoard)) {
      setBoard(nextBoard);
      setStatus('won');
      return;
    }

    setBoard(nextBoard);
  };

  const flags = countFlags(board);
  const minesLeft = Math.max(difficulty.mines - flags, 0);

  const startLongPress = (cell: Cell) => {
    const key = `${cell.row}-${cell.col}`;
    if (longPressTimers.current.has(key)) return;
    const timer = window.setTimeout(() => {
      longPressTriggered.current.add(key);
      handleToggleFlag(cell);
    }, 450);
    longPressTimers.current.set(key, timer);
  };

  const clearLongPress = (cell: Cell) => {
    const key = `${cell.row}-${cell.col}`;
    const timer = longPressTimers.current.get(key);
    if (timer) {
      window.clearTimeout(timer);
      longPressTimers.current.delete(key);
    }
  };
  return (
    <div
      className="min-h-screen text-[#121212]"
      style={{
        backgroundColor: '#0062ad',
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 0.8px, transparent 0.8px)',
        backgroundSize: '12px 12px',
        fontFamily: '"Space Grotesk","Avenir Next","PingFang SC","Microsoft YaHei",sans-serif'
      }}
    >
      {view === 'intro' ? (
        <main className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-8 relative">
          <header className="text-center space-y-4">
            <div className="inline-block rounded-xl bg-[#121212] px-4 py-2 text-sm font-bold text-white">Library</div>
            <h1 className="text-4xl md:text-6xl font-black text-[#f4ecd8] leading-[1.05]" style={{ fontFamily: '"Marker Felt","Comic Sans MS",cursive' }}>
              minesweeper
              <br />
              poster kit
            </h1>
          </header>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-none border-[6px] border-[#121212] bg-[#f2ead7] p-8 shadow-[8px_8px_0_#121212]">
              <div className="h-52 border-[5px] border-[#f2ead7] bg-[#0062ad] relative mb-6">
                <div className="absolute left-10 top-11 h-20 w-20 rounded-full bg-[#f2ead7]">
                  <div className="absolute right-4 top-7 h-8 w-8 rounded-full bg-black" />
                </div>
                <div className="absolute right-10 top-11 h-20 w-20 rounded-full bg-[#f2ead7]">
                  <div className="absolute left-4 top-7 h-8 w-8 rounded-full bg-black" />
                </div>
              </div>
              <div className="text-4xl font-black tracking-tight">#0062AD</div>
              <div className="mt-1 text-lg">Minesweeper Poster</div>
              <div className="mt-6 text-xs text-[#595959]">Classic puzzle · clean geometry</div>
            </div>
            <div className="rounded-none border-[6px] border-[#121212] bg-[#f2ead7] p-8 shadow-[8px_8px_0_#121212]">
              <div className="text-xs uppercase tracking-[0.2em] text-[#4b4b4b]">规则概览</div>
              <div className="mt-6 space-y-3 text-sm text-[#222]">
                <div>左键：打开格子</div>
                <div>右键：标记雷</div>
                <div>双击数字：旗数匹配时快速展开</div>
                <div>移动端：长按插旗，或开启“插旗模式”点按插旗</div>
                <div>首击安全：首格与周围 8 格不埋雷</div>
              </div>
              <div className="mt-8 text-xs uppercase tracking-[0.2em] text-[#4b4b4b]">选择难度</div>
              <div className="mt-6 grid gap-3">
                {difficulties.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDifficultyKey(d.key)}
                    className={`w-full px-4 py-3 border-[3px] text-left transition ${
                      d.key === difficultyKey
                        ? 'border-[#121212] bg-[#0062ad] text-[#f4ecd8] shadow-[4px_4px_0_#121212]'
                        : 'border-[#121212] bg-[#f6efdd] text-[#222] hover:bg-[#efe4ca]'
                    }`}
                  >
                    <div className="text-sm font-semibold">{d.label}</div>
                    <div className="text-xs opacity-70">{d.rows} x {d.cols} · {d.mines} mines</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  setView('game');
                }}
                className="mt-6 w-full border-[4px] border-[#121212] bg-[#121212] py-3 text-[#f4ecd8] text-lg font-black shadow-[6px_6px_0_#0d477a]"
              >
                START GAME
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full border-[3px] border-[#121212] bg-[#f6efdd] py-2 text-sm font-semibold text-[#222] transition hover:bg-[#efe4ca]"
              >
                返回大厅
              </button>
            </div>
          </section>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-4 relative">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.3em] text-[#dce8f7]">Minesweeper</div>
            <div className="flex items-center gap-3">
              {isTouchDevice && (
                <button
                  type="button"
                  onClick={() => setMobileFlagMode((prev) => !prev)}
                  className={`px-4 py-2 border-[3px] text-sm font-semibold shadow-[4px_4px_0_#121212] ${
                    mobileFlagMode
                      ? 'border-[#121212] bg-[#121212] text-[#f2ead7]'
                      : 'border-[#121212] bg-[#f2ead7] text-[#222]'
                  }`}
                >
                  {mobileFlagMode ? '插旗模式：开' : '插旗模式：关'}
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border-[3px] border-[#121212] bg-[#f2ead7] transition text-sm font-semibold text-[#222] shadow-[4px_4px_0_#121212]"
              >
                重开
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('intro');
                  setStatus('ready');
                }}
                className="px-4 py-2 border-[3px] border-[#121212] bg-[#121212] text-[#f2ead7] text-sm font-semibold shadow-[4px_4px_0_#0d477a]"
              >
                返回
              </button>
            </div>
          </div>

          <div className="border-[6px] border-[#121212] bg-[#f2ead7] p-4 shadow-[8px_8px_0_#121212] flex flex-col h-[80vh]">
            <div className="flex-1 overflow-hidden">
              <div
                className="grid w-full h-full border-[4px] border-[#121212] bg-[#dbe8f4] p-2"
                style={{
                  gridTemplateColumns: `repeat(${difficulty.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${difficulty.rows}, 1fr)`
                }}
              >
                {board.flat().map((cell) => {
                  const isLostMine = status === 'lost' && cell.isMine && cell.isRevealed;
                  const showMine = cell.isMine && (cell.isRevealed || status === 'lost');
                  const showWrongFlag = status === 'lost' && cell.isFlagged && !cell.isMine;
                  const isRevealed = cell.isRevealed;
                  const isFlagged = cell.isFlagged;
                  const baseClass = isRevealed
                    ? 'bg-[#f6efdd] border-[#121212]'
                    : 'bg-[#0062ad] border-[#121212] hover:bg-[#0d6bb6]';
                  const mineClass =
                    status === 'lost' && cell.isMine
                      ? 'bg-[#eb6a5b] border-[#121212]'
                      : '';
                  return (
                    <button
                      key={`${cell.row}-${cell.col}`}
                      type="button"
                      onClick={() => {
                        if (isTouchDevice) return;
                        handleReveal(cell);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleToggleFlag(cell);
                      }}
                      onDoubleClick={() => handleChord(cell)}
                      onTouchStart={() => startLongPress(cell)}
                      onTouchEnd={() => {
                        const key = `${cell.row}-${cell.col}`;
                        clearLongPress(cell);
                        if (longPressTriggered.current.has(key)) {
                          longPressTriggered.current.delete(key);
                          return;
                        }
                        if (mobileFlagMode) {
                          handleToggleFlag(cell);
                          return;
                        }
                        handleReveal(cell);
                      }}
                      onTouchCancel={() => {
                        clearLongPress(cell);
                        longPressTriggered.current.delete(`${cell.row}-${cell.col}`);
                      }}
                      onTouchMove={() => {
                        clearLongPress(cell);
                      }}
                      className={`relative flex items-center justify-center border-2 text-[clamp(10px,1.6vw,18px)] font-bold transition ${baseClass} ${mineClass}`}
                    >
                      {showMine && (
                        <span className="text-[#121212]">●</span>
                      )}
                      {isRevealed && !cell.isMine && cell.adjacent > 0 && (
                        <span style={{ color: numberColors[cell.adjacent] }}>{cell.adjacent}</span>
                      )}
                      {!isRevealed && isFlagged && (
                        <span className="text-[#f2ead7]">⚑</span>
                      )}
                      {showWrongFlag && (
                        <span className="absolute -top-1 -right-1 text-[#121212] text-[10px]">✕</span>
                      )}
                      {isLostMine && (
                        <span className="absolute inset-0 border-2 border-[#121212]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
      )}

      {view === 'game' && status !== 'ready' && status !== 'playing' && (
        <div className={`fixed inset-0 bg-[#0a2540]/35 backdrop-blur-[2px] flex items-center justify-center z-50 ${showResult ? '' : 'hidden'}`}>
          <div className="w-full max-w-md border-[6px] border-[#121212] bg-[#f2ead7] p-6 shadow-[8px_8px_0_#121212]">
            <div className="text-xs uppercase tracking-[0.2em] text-[#4d4d4d]">结算</div>
            <div className={`mt-3 text-2xl font-black ${status === 'won' ? 'text-[#1f6b40]' : 'text-[#8d1f2f]'}`}>
              {status === 'won' ? '任务成功' : '任务失败'}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[#2d2d2d]">
              <div>难度：{difficulty.label}</div>
              <div>用时：{String(seconds).padStart(3, '0')}</div>
              <div>雷数：{difficulty.mines}</div>
              <div>剩余：{String(minesLeft).padStart(3, '0')}</div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  setStatus('ready');
                }}
                className="flex-1 border-[3px] border-[#121212] bg-[#121212] py-2 text-[#f2ead7] font-semibold"
              >
                再来一局
              </button>
              {status === 'lost' && (
                <button
                  type="button"
                  onClick={() => setShowResult(false)}
                  className="flex-1 border-[3px] border-[#121212] bg-[#f8f0de] py-2 text-sm text-[#222] transition hover:bg-[#eee2ca]"
                >
                  回到原盘
                </button>
              )}
              <button
                type="button"
                onClick={() => setView('intro')}
                className="flex-1 border-[3px] border-[#121212] bg-[#f8f0de] py-2 text-sm text-[#222] transition hover:bg-[#eee2ca]"
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
