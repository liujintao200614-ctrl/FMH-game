import { GameCard, GameCardProps } from './components/GameCard';
import { AnnouncementPanel, Announcement } from './components/AnnouncementPanel';
import { useState, useMemo, useEffect, lazy, Suspense } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const placeholderImg =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="%239433ea" offset="0%"/><stop stop-color="%23f05af7" offset="100%"/></linearGradient></defs><rect width="1200" height="800" fill="url(%23g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="64" font-family="Inter" fill="white" opacity="0.8">FMH GAME</text></svg>';

type GameLaunchMode =
  | 'react-snake'
  | 'react-hangar'
  | 'react-minesweeper'
  | 'react-2048'
  | 'react-tetris'
  | 'react-flybird'
  | 'react-node-conquest';

type GameDefinition = GameCardProps & { mode: GameLaunchMode; slug: string };

const LazyTankModeSelect = lazy(() =>
  import('./ui/hangar/TankModeSelect').then((m) => ({ default: m.TankModeSelect }))
);
const LazySnakePage = lazy(() => import('./games/snake/SnakePage').then((m) => ({ default: m.SnakePage })));
const LazyTankRunPage = lazy(() => import('./pages/TankRunPage').then((m) => ({ default: m.TankRunPage })));
const LazyMinesweeperPage = lazy(() =>
  import('./games/minesweeper/MinesweeperPage').then((m) => ({ default: m.MinesweeperPage }))
);
const LazyMerge2048Page = lazy(() =>
  import('./games/merge2048/Merge2048Page').then((m) => ({ default: m.Merge2048Page }))
);
const LazyTetrisPage = lazy(() => import('./games/tetris/TetrisPage').then((m) => ({ default: m.TetrisPage })));
const LazyFlyBirdPage = lazy(() => import('./games/bird/FlyBirdPage').then((m) => ({ default: m.FlyBirdPage })));
const LazyNodeConquestPage = lazy(() =>
  import('./games/node-conquest/NodeConquestPage').then((m) => ({ default: m.NodeConquestPage }))
);

const games: GameDefinition[] = [
  {
    title: 'Tank Hangar',
    category: 'Shooter',
    description: '机库大厅 · 坦克展示台与战备控制。',
    reward: '200 Coins',
    difficulty: '中等',
    rating: 4.5,
    imageUrl: '/maps/tank-hangar-cover.svg',
    href: '#',
    previewKey: 'tank',
    mode: 'react-hangar',
    slug: 'tank-hangar'
  },
  {
    title: 'Starfield Snake',
    category: 'Arcade',
    description: '星际深空风格的贪吃蛇，支持经典/穿边/练习模式。',
    reward: '120 Coins',
    difficulty: '中等',
    rating: 4.5,
    imageUrl: placeholderImg,
    href: '#',
    previewKey: 'snake',
    mode: 'react-snake',
    slug: 'snake'
  },
  {
    title: 'Minesweeper Ops',
    category: 'Puzzle',
    description: '现代化扫雷行动面板，经典三难度与安全首击。',
    reward: '80 Coins',
    difficulty: '经典',
    rating: 4.6,
    imageUrl: placeholderImg,
    href: '#',
    previewKey: 'minesweeper',
    mode: 'react-minesweeper',
    slug: 'minesweeper'
  },
  {
    title: 'Merge 2048',
    category: 'Puzzle',
    description: '温馨柔和的数字合并，通向 2048。',
    reward: '90 Coins',
    difficulty: '经典',
    rating: 4.7,
    imageUrl: placeholderImg,
    href: '#',
    previewKey: 'merge2048',
    mode: 'react-2048',
    slug: 'merge-2048'
  },
  {
    title: 'Retro Tetris',
    category: 'Arcade',
    description: '经典 10x20 方块挑战，支持 SRS 与 7-bag。',
    reward: '150 Coins',
    difficulty: '经典',
    rating: 4.8,
    imageUrl: placeholderImg,
    href: '#',
    previewKey: 'tetris',
    mode: 'react-tetris',
    slug: 'tetris'
  },
  {
    title: 'Fly Bird Run',
    category: 'Runner',
    description: '章节关卡制飞鸟跑酷，轻点上升穿越障碍。',
    reward: '140 Coins',
    difficulty: '通关',
    rating: 4.6,
    imageUrl: placeholderImg,
    href: '#',
    previewKey: 'flybird',
    mode: 'react-flybird',
    slug: 'flybird'
  },
  {
    title: 'Node Conquest',
    category: 'Strategy',
    description: '极简数值占领战 · 节点扩张与节奏博弈。',
    reward: '220 Coins',
    difficulty: '策略',
    rating: 4.7,
    imageUrl: placeholderImg,
    href: '#',
    previewKey: 'nodeConquest',
    mode: 'react-node-conquest',
    slug: 'node-conquest'
  }
];

export default function App() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [isTankRun, setIsTankRun] = useState<boolean>(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      setIsTankRun(hash.startsWith('tank-run'));
      if (!hash) {
        setActiveSlug(null);
        return;
      }
      const params = new URLSearchParams(hash);
      const slug = params.get('game');
      setActiveSlug(slug);
    };
    window.addEventListener('hashchange', applyHash);
    applyHash();
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua);
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsIOS(ios);
    setIsStandalone(standalone);
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    };
  }, []);

  const announcements: Announcement[] = useMemo(() => {
    if (!isIOS) return [];
    return [
      {
        title: 'iPhone 安装教程',
        description: 'Safari 打开本页后，点击底部“分享”按钮，再点“添加到主屏幕”。',
        time: 'PWA 指南',
        isNew: true
      }
    ];
  }, [isIOS]);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  };

  const openGame = (game: GameDefinition) => {
    window.location.hash = `game=${game.slug}`;
  };

  const closeReactGame = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setActiveSlug(null);
  };

  const activeGame = useMemo(() => games.find((game) => game.slug === activeSlug), [activeSlug]);
  const loadingFallback = (
    <div className="min-h-screen grid place-items-center bg-[#0a0f14] text-[#d3e6ff] text-sm tracking-[0.08em]">
      LOADING MISSION...
    </div>
  );

  if (isTankRun) {
    return (
      <Suspense fallback={loadingFallback}>
        <LazyTankRunPage />
      </Suspense>
    );
  }

  if (activeGame) {
    return (
      <Suspense fallback={loadingFallback}>
        {activeGame.mode === 'react-snake' && <LazySnakePage onClose={closeReactGame} />}
        {activeGame.mode === 'react-hangar' && <LazyTankModeSelect onClose={closeReactGame} />}
        {activeGame.mode === 'react-minesweeper' && <LazyMinesweeperPage onClose={closeReactGame} />}
        {activeGame.mode === 'react-2048' && <LazyMerge2048Page onClose={closeReactGame} />}
        {activeGame.mode === 'react-tetris' && <LazyTetrisPage onClose={closeReactGame} />}
        {activeGame.mode === 'react-flybird' && <LazyFlyBirdPage onClose={closeReactGame} />}
        {activeGame.mode === 'react-node-conquest' && <LazyNodeConquestPage onClose={closeReactGame} />}
      </Suspense>
    );
  }

  return (
    <div className="lobby-theme">
      <main className="lobby-shell">
        <div className="lobby-header">
          <div>PROJECT_SNAKE_OPS // LOBBY</div>
          <div className="text-[#9aa0ff]">STATUS: ONLINE</div>
        </div>
        <div className="lobby-divider" />

        <section>
          <AnnouncementPanel announcements={announcements} />
        </section>

        <section>
          <div className="grid gap-8 md:grid-cols-2">
            {games.map((game) => (
              <GameCard key={game.title} {...game} onPlay={() => openGame(game)} />
            ))}
          </div>
        </section>

        {!isIOS && !isStandalone && (
          <section className="pt-2 pb-6">
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={!installPrompt}
              className={`w-full rounded-2xl border-2 border-white/40 px-4 py-3 text-base font-semibold transition ${
                installPrompt
                  ? 'bg-white/20 text-white hover:bg-white/30'
                  : 'bg-white/10 text-white/70 cursor-not-allowed'
              }`}
            >
              安装 App
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
