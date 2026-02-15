import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SnakeLobby } from '../../components/SnakeLobby';
import { useGameCoin } from '../../hooks/useGameCoin';
import { SnakeConfig, SnakeMode } from './phaser';
import { GameModes, GameModeKey } from './GameModes';
import { useSnakeConfigStore } from './useSnakeConfigStore';

const LazySnakePhaserCanvas = lazy(() =>
  import('./SnakePhaserCanvas').then((m) => ({ default: m.SnakePhaserCanvas }))
);

type SnakeStatus = 'ready' | 'playing' | 'paused' | 'over';

const modeOptions: { value: SnakeMode; label: string; desc: string }[] = [
  { value: 'classic', label: '经典', desc: '撞墙/自撞会死亡' },
  { value: 'wrap', label: '穿边', desc: '越界从另一侧出现，自撞仍然死亡' },
  { value: 'practice', label: '练习', desc: '越界穿边，自撞关闭' }
];

function getStoredBest() {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem('snake-best');
  return raw ? Number(raw) : 0;
}

export function SnakePage({ onClose }: { onClose: () => void }) {
  const { history } = useGameCoin();
  const {
    mode: storedMode,
    enableBot,
    setConfig,
    nickname,
    teamMode,
    teamCount,
    snakesPerTeam,
    playerTeamId,
    majorMode,
    scoreTarget
  } = useSnakeConfigStore();
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [status, setStatus] = useState<SnakeStatus>('playing');
  const [deathReason, setDeathReason] = useState<'wall' | 'self' | 'bot' | 'score' | null>(null);
  const [snakeMode, setSnakeMode] = useState<SnakeMode>('classic');
  const [teamScores, setTeamScores] = useState<number[]>([]);
  const [playerTeam, setPlayerTeam] = useState<number | undefined>(teamMode ? playerTeamId : undefined);
  const controlsRef = useRef<{
    reset: () => void;
    pause: () => void;
    resume: () => void;
    setDirection: (dir: 'up' | 'down' | 'left' | 'right') => void;
    setHeading: (dx: number, dy: number) => void;
  } | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const fullscreenRequested = useRef(false);
  const isTouchDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(pointer: coarse)').matches === true ||
      /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
    );
  }, []);
  const [showLobby, setShowLobby] = useState(true);
  const [isTopHudCollapsed, setIsTopHudCollapsed] = useState(false);
  const [isMobileTeamCollapsed, setIsMobileTeamCollapsed] = useState(true);
  const [modeKey, setModeKey] = useState<GameModeKey>(storedMode);
  const touchSteerRef = useRef<{ touchId: number; originX: number; originY: number } | null>(null);
  const enableBotFlag = enableBot;

  useEffect(() => {
    setBest(getStoredBest());
  }, []);

  const updateBest = useCallback((value: number) => {
    setBest((prev) => {
      const next = Math.max(prev, value);
      if (next !== prev && typeof window !== 'undefined') {
        localStorage.setItem('snake-best', String(next));
      }
      return next;
    });
  }, []);

  const handleScore = useCallback(
    (s: number) => {
      setScore(s);
      updateBest(s);
    },
    [updateBest]
  );

  const handleGameOver = useCallback(
    (s: number) => {
      setScore(s);
      updateBest(s);
      setStatus('over');
    },
    [updateBest]
  );

  const restart = () => {
    controlsRef.current?.reset();
    setScore(0);
    setStatus('playing');
    setDeathReason(null);
  };

  const toggleFullscreen = async () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    await el.requestFullscreen().catch(() => undefined);
  };

  const changeMode = (next: SnakeMode) => {
    setSnakeMode(next);
    setCanvasKey((k) => k + 1); // remount canvas to apply config
    setScore(0);
    setStatus('playing');
    setDeathReason(null);
  };

  const sidebar = useMemo(
    () => (
      <div className="space-y-3 text-sm text-purple-100">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span>得分</span>
            <span className="text-white font-semibold">{score}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>最佳</span>
            <span className="text-emerald-300 font-semibold">{best}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>状态</span>
            <span className="text-purple-200">
              {status === 'playing' ? '进行中' : status === 'paused' ? '已暂停' : status === 'over' ? '游戏结束' : '准备中'}
            </span>
          </div>
          {deathReason && (
            <div className="mt-2 text-xs text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              死亡原因：{deathReason === 'wall' ? '撞墙' : '自撞'}
            </div>
          )}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-purple-200 mb-2">模式说明</p>
          <ul className="space-y-2 text-xs text-purple-100">
            {modeOptions.map((opt) => (
              <li key={opt.value} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-purple-400" />
                <span>
                  <strong className="text-white">{opt.label}</strong>：{opt.desc}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-purple-200 mb-2">近期 GameCoin 记录</p>
          <div className="space-y-2 max-h-36 overflow-auto">
            {history.slice(0, 4).map((entry, idx) => (
              <div key={`${entry.id}-${idx}`} className="flex items-center justify-between bg-black/20 px-3 py-2 rounded-lg">
                <span>{entry.reason}</span>
                <span className={entry.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {entry.amount >= 0 ? '+' : ''}
                  {entry.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    [best, history, score, status]
  );

  const controls = (
    <>
      <label className="flex items-center gap-2 text-sm">
        模式：
        <select
          value={snakeMode}
          onChange={(e) => changeMode(e.target.value as SnakeMode)}
          className="bg-black/20 border border-purple-500/40 rounded-lg px-3 py-2"
        >
          {modeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-cyan-500 text-white"
        onClick={() => {
          controlsRef.current?.pause();
          setStatus('paused');
        }}
      >
        暂停
      </button>
      <button
        className="px-3 py-2 rounded-lg bg-white/10 border border-white/20"
        onClick={() => {
          controlsRef.current?.resume();
          setStatus('playing');
        }}
      >
        继续
      </button>
      <button
        className="px-3 py-2 rounded-lg bg-orange-500/90 text-white border border-orange-300/40"
        onClick={restart}
      >
        重开
      </button>
      <button
        className="px-3 py-2 rounded-lg bg-white/10 border border-white/20"
        onClick={toggleFullscreen}
      >
        全屏
      </button>
    </>
  );

  const statusLabel = status === 'playing' ? '进行中' : status === 'paused' ? '已暂停' : status === 'over' ? '游戏结束' : '准备中';

  const configOverride = useMemo<Partial<SnakeConfig>>(
    () => ({
      mode: snakeMode,
      ...GameModes[modeKey],
      enableBot: enableBotFlag
    }),
    [snakeMode, modeKey, enableBotFlag]
  );

  const handleReady = useCallback((controls: { reset: () => void; pause: () => void; resume: () => void; setDirection: (dir: 'up' | 'down' | 'left' | 'right') => void; setHeading: (dx: number, dy: number) => void }) => {
    controlsRef.current = controls;
  }, []);

  const getDragVector = useCallback((dx: number, dy: number): { x: number; y: number } | null => {
    const deadZone = 10;
    const len = Math.hypot(dx, dy);
    if (len < deadZone) return null;
    return { x: dx / len, y: dy / len };
  }, []);

  const handleTouchSteerStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!isTouchDevice || status !== 'playing') return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    touchSteerRef.current = {
      touchId: touch.identifier,
      originX: touch.clientX,
      originY: touch.clientY
    };
    e.preventDefault();
  }, [isTouchDevice, status]);

  const handleTouchSteerMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const steer = touchSteerRef.current;
    if (!steer || status !== 'playing') return;
    const touch = Array.from(e.changedTouches).find((t) => t.identifier === steer.touchId);
    if (!touch) return;
    const vec = getDragVector(touch.clientX - steer.originX, touch.clientY - steer.originY);
    if (vec) {
      controlsRef.current?.setHeading(vec.x, vec.y);
    }
    e.preventDefault();
  }, [getDragVector, status]);

  const handleTouchSteerEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const steer = touchSteerRef.current;
    if (!steer) return;
    const ended = Array.from(e.changedTouches).some((t) => t.identifier === steer.touchId);
    if (ended) {
      touchSteerRef.current = null;
      e.preventDefault();
    }
  }, []);

  const handleStateChange = (st: Partial<{ isAlive: boolean; deathReason?: string; teamScores?: number[]; playerTeamId?: number }>) => {
    if (st.isAlive === false) {
      setStatus('over');
      setDeathReason((st.deathReason as 'wall' | 'self' | 'bot' | 'score') || null);
    }
    if (st.isAlive === true) {
      setStatus('playing');
      setDeathReason(null);
    }
    if (st.teamScores) {
      setTeamScores(st.teamScores);
    }
    if (st.playerTeamId) setPlayerTeam(st.playerTeamId);
  };

  useEffect(() => {
    if (showLobby) return;
    if (isTouchDevice) return;
    const tryFullscreen = async () => {
      if (fullscreenRequested.current) return;
      const el = shellRef.current;
      if (!el) return;
      fullscreenRequested.current = true;
      if (!document.fullscreenElement) {
        await el.requestFullscreen().catch(() => {
          fullscreenRequested.current = false;
        });
      }
    };
    tryFullscreen();
  }, [showLobby, isTouchDevice]);

  if (showLobby) {
    return (
      <SnakeLobby
        onStart={({ nickname, mode, majorMode, scoreTarget, teamMode, teamCount, snakesPerTeam, playerTeamId }) => {
          setConfig({
            nickname,
            mode,
            enableBot: true,
            majorMode,
            scoreTarget,
            teamMode,
            teamCount,
            snakesPerTeam,
            playerTeamId
          });
          controlsRef.current = null;
          setScore(0);
          setStatus('playing');
          setDeathReason(null);
          setTeamScores([]);
          setPlayerTeam(teamMode ? playerTeamId : undefined);
          setCanvasKey((k) => k + 1);
          setModeKey(mode);
          setShowLobby(false);
        }}
        onBack={onClose}
      />
    );
  }

  return (
    <div ref={shellRef} className="relative w-screen h-screen bg-gradient-to-b from-[#05060d] via-[#080c18] to-[#04060c] text-white overflow-hidden touch-none">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 w-96 h-96 bg-purple-500/25 blur-[180px]" />
        <div className="absolute right-[-100px] bottom-[-60px] w-[480px] h-[480px] bg-cyan-500/20 blur-[200px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.05),transparent_40%),radial-gradient(circle_at_70%_40%,rgba(255,255,255,0.04),transparent_30%)]" />
      </div>

      <div
        className={`absolute top-3 left-1/2 -translate-x-1/2 rounded-2xl bg-black/30 border border-white/10 backdrop-blur-md shadow-lg z-20 ${
          isTopHudCollapsed
            ? 'px-2 py-1'
            : isTouchDevice
              ? 'max-w-[78vw] px-2 py-1'
              : 'max-w-[94vw] px-3 py-2'
        }`}
      >
        <div className={`flex items-center justify-center ${isTopHudCollapsed ? '' : 'flex-wrap gap-1'}`}>
          <button
            type="button"
            className={`${isTouchDevice ? 'text-[11px]' : 'text-xs'} px-2 py-1 rounded-lg bg-white/10 border border-white/20`}
            onClick={() => setIsTopHudCollapsed((prev) => !prev)}
          >
            {isTopHudCollapsed ? '展开面板' : '收起面板'}
          </button>
        </div>
        {!isTopHudCollapsed ? (
          <>
            <div className={`flex items-center gap-2 ${isTouchDevice ? 'text-[11px]' : 'text-xs'}`}>
              <span className="text-purple-100">模式：</span>
              <select
                value={snakeMode}
                onChange={(e) => changeMode(e.target.value as SnakeMode)}
                className={`bg-white/10 border border-white/20 rounded-lg focus:outline-none ${
                  isTouchDevice ? 'px-1.5 py-1 text-[11px]' : 'px-2 py-1 text-xs'
                }`}
              >
                {modeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={`flex items-center gap-1 ${isTouchDevice ? 'text-[11px]' : 'text-xs'} text-purple-100`}>
              <span className="px-2 py-1 rounded bg-white/10 border border-white/10">状态：{statusLabel}</span>
              <span className="px-2 py-1 rounded bg-white/10 border border-white/10">得分 {score}</span>
              <span className="px-2 py-1 rounded bg-white/10 border border-white/10">最佳 {best}</span>
              {!isTouchDevice && <span className="px-2 py-1 rounded bg-white/10 border border-white/10">昵称 {nickname || '未命名'}</span>}
              {teamMode && !isTouchDevice && (
                <span className="px-2 py-1 rounded bg-cyan-500/20 border border-cyan-400/30 text-cyan-100">
                  团队模式
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                className={`${isTouchDevice ? 'px-2 py-1 text-[11px]' : 'px-3 py-1 text-xs'} rounded-lg bg-white/10 border border-white/20`}
                onClick={() => {
                  controlsRef.current?.pause();
                  setStatus('paused');
                }}
              >
                暂停
              </button>
              <button
                className={`${isTouchDevice ? 'px-2 py-1 text-[11px]' : 'px-3 py-1 text-xs'} rounded-lg bg-white/10 border border-white/20`}
                onClick={() => {
                  controlsRef.current?.resume();
                  setStatus('playing');
                }}
              >
                继续
              </button>
              <button
                className={`${isTouchDevice ? 'px-2 py-1 text-[11px]' : 'px-3 py-1 text-xs'} rounded-lg bg-orange-500 text-white`}
                onClick={restart}
              >
                重开
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-purple-200 bg-black/30 border border-white/10 rounded-full px-4 py-2 backdrop-blur-md z-20 hidden md:block">
        方向键/WASD 控制，避免自撞与边界，收集能量球。
      </div>

      <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
        {isTouchDevice && teamMode && teamScores.length > 0 && (
          <button
            type="button"
            className="w-fit px-2 py-1 rounded-lg bg-black/35 border border-white/15 text-[11px] text-purple-100"
            onClick={() => setIsMobileTeamCollapsed((prev) => !prev)}
          >
            {isMobileTeamCollapsed ? '队伍展开' : '队伍收起'}
          </button>
        )}
        {teamMode && teamScores.length > 0 && (!isTouchDevice || !isMobileTeamCollapsed) && (
          <div className={`rounded-2xl bg-black/35 border border-white/10 backdrop-blur-md shadow-lg shadow-black/40 ${isTouchDevice ? 'px-3 py-2 min-w-[140px]' : 'px-4 py-3 min-w-[180px]'}`}>
            <div className={`text-purple-100 mb-2 font-semibold ${isTouchDevice ? 'text-[11px]' : 'text-xs'}`}>团队积分</div>
            <div className={`space-y-1 ${isTouchDevice ? 'text-[11px]' : 'text-[12px]'}`}>
              {teamScores
                .map((s, i) => ({ team: i + 1, score: s }))
                .sort((a, b) => b.score - a.score)
                .map((t) => {
                  const colors = ['#3b82f6', '#f97316', '#22c55e', '#eab308'];
                  const color = colors[(t.team - 1) % colors.length];
                  return (
                    <div
                      key={t.team}
                      className={`flex items-center justify-between rounded-xl ${isTouchDevice ? 'px-2 py-1.5' : 'px-3 py-2'} ${
                        t.team === playerTeam ? 'bg-white/10' : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-white">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span>队伍 {t.team}</span>
                      </div>
                      <span className="text-cyan-100 font-mono">{t.score}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-3 z-20">
        {!isTouchDevice && (
          <button
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-xs"
            onClick={toggleFullscreen}
          >
            全屏
          </button>
        )}
        <button
          className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-xs"
          onClick={async () => {
            if (document.fullscreenElement) {
              await document.exitFullscreen().catch(() => undefined);
            }
            setShowLobby(true);
          }}
        >
          返回
        </button>
      </div>

      <div className="w-full h-full relative z-10">
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-sm text-cyan-100">Loading Snake Engine...</div>}>
          <LazySnakePhaserCanvas
            key={canvasKey}
            onScore={handleScore}
            onGameOver={(s, reason) => {
              setDeathReason((reason as 'wall' | 'self') || null);
              handleGameOver(s);
            }}
            onStateChange={handleStateChange}
            onReady={handleReady}
            configOverride={configOverride}
          />
        </Suspense>
        {isTouchDevice && status === 'playing' && (
          <div
            className="absolute inset-0 z-[15] touch-none"
            onTouchStart={handleTouchSteerStart}
            onTouchMove={handleTouchSteerMove}
            onTouchEnd={handleTouchSteerEnd}
            onTouchCancel={handleTouchSteerEnd}
          />
        )}
        {status === 'over' && (
          <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-black/60 border border-purple-500/40 rounded-xl p-6 text-center space-y-3 shadow-[0_0_30px_rgba(147,51,234,0.35)]">
              <div className="text-lg font-mono text-purple-200 tracking-widest">
                {deathReason === 'score' ? '挑战完成' : '游戏结束'}
              </div>
              <div className="text-sm text-purple-100 font-mono">本局得分: {score}</div>
              <div className="text-sm text-purple-200 font-mono">最佳: {best}</div>
              {deathReason && (
                <div className="text-sm text-rose-200 font-mono">
                  {deathReason === 'score'
                    ? `目标达成：${scoreTarget ?? '--'}`
                    : `死亡原因：${deathReason === 'wall' ? '撞墙' : deathReason === 'bot' ? '撞到AI' : '自撞'}`}
                </div>
              )}
              <div className="flex items-center justify-center text-sm font-mono">
                <button
                  className="px-4 py-2 rounded border border-orange-500/60 bg-orange-500/20 hover:bg-orange-500/30"
                  onClick={restart}
                >
                  重开
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
