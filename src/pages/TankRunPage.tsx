import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { maps } from '../ui/maps/maps';
import { useTankSession } from '../hooks/useTankSession';
import { TankGameHandle } from '../games/tank/phaser';

const LazyTankPhaserCanvas = lazy(() =>
  import('../games/tank/TankPhaserCanvas').then((m) => ({ default: m.TankPhaserCanvas }))
);

type TankDifficulty = 'easy' | 'normal' | 'hard';

function normalizeDifficulty(value: string | null | undefined): TankDifficulty {
  if (value === 'easy' || value === 'hard' || value === 'normal') return value;
  return 'normal';
}

function difficultyLabel(value: TankDifficulty) {
  if (value === 'easy') return '简单';
  if (value === 'hard') return '困难';
  return '标准';
}

function useSelectedBattleSetup() {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const params = useMemo(() => new URLSearchParams(hash.replace(/^#/, '').split('?')[1] ?? ''), [hash]);
  const mapParam = params.get('map');
  const difficultyParam = params.get('difficulty');
  const session = useTankSession.getState();
  const mapKey = mapParam || session.mapKey || maps[0]?.key;
  const map = maps.find((m) => m.key === mapKey) ?? null;
  const difficulty = normalizeDifficulty(difficultyParam ?? session.difficulty);
  return { map, difficulty };
}

function getUnitPortrait(
  role: string,
  tankClass?: 'light' | 'medium' | 'heavy'
) {
  if (role === 'tank') {
    if (tankClass === 'heavy') return '/maps/tank-heavy-96x96.png';
    if (tankClass === 'medium') return '/maps/tank-medium-gray-144.png';
    return '/maps/tank-light-gray-96.png';
  }
  if (role === 'air_fighter') {
    if (tankClass === 'heavy') return '/maps/heavy-fighter-120x120.png';
    if (tankClass === 'medium') return '/maps/medium-fighter-96x96.png';
    return '/maps/light-fighter-96x96.png';
  }
  if (role === 'naval_ship') {
    if (tankClass === 'heavy') return '/maps/naval-ship-heavy.png';
    if (tankClass === 'medium') return '/maps/naval-ship-medium.png';
    return '/maps/naval-ship-light.png';
  }
  if (role === 'engineer') return '/maps/engineer-small-32x32.png';
  if (role === 'base') return '/maps/headquarters-192x192.png';
  if (role === 'factory_ground') return '/maps/tank-factory-256x256.png';
  if (role === 'factory_air') return '/maps/airfactory-turret-sprite-256px-0deg.png';
  if (role === 'factory_naval') return '/maps/naval-factory-level2.png';
  if (role === 'extractor') return '/maps/harvester-level1-256x256.png';
  if (role === 'tower_air') return '/maps/aa-turret-sprite-256px-0deg.png';
  if (role === 'tower_coastal') return '/maps/coastal-tower.png';
  if (role === 'tower_hybrid') return '/maps/hybrid-turret-tower-256x256.png';
  return '/maps/turret-sprite-256px-0deg.png';
}

function getUnitRoleTag(role: string) {
  if (role === 'tank') return '地面突击';
  if (role === 'air_fighter') return '空中打击';
  if (role === 'naval_ship') return '海上突击';
  if (role === 'engineer') return '建造/维修';
  if (role === 'base') return '核心建筑';
  if (role === 'factory_ground') return '地面生产';
  if (role === 'factory_air') return '空军生产';
  if (role === 'factory_naval') return '海军生产';
  if (role === 'extractor') return '资源采集';
  if (role === 'tower_air') return '防空专精';
  if (role === 'tower_coastal') return '海防专精';
  if (role === 'tower_hybrid') return '空地通用';
  if (role === 'tower_ground') return '反地专精';
  return '战术单位';
}

function isCombatRole(role: string) {
  return (
    role === 'tank' ||
    role === 'air_fighter' ||
    role === 'naval_ship' ||
    role === 'tower_ground' ||
    role === 'tower_air' ||
    role === 'tower_coastal' ||
    role === 'tower_hybrid'
  );
}

function makeTankPreview(kind: 'light' | 'medium' | 'heavy') {
  const stats =
    kind === 'heavy'
      ? { hp: 520, damage: 48, range: 16 * 6.6, speed: 54, fireRate: 0.52 }
      : kind === 'medium'
      ? { hp: 300, damage: 24, range: 16 * 5.8, speed: 74, fireRate: 0.9 }
      : { hp: 180, damage: 12, range: 16 * 4.8, speed: 92, fireRate: 1.45 };
  return {
    name: kind === 'heavy' ? '重型坦克' : kind === 'medium' ? '中型坦克' : '轻型坦克',
    role: 'tank',
    tankClass: kind,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    range: stats.range,
    fireRate: stats.fireRate,
    speed: stats.speed
  } as const;
}

function makeAirPreview(kind: 'light' | 'medium' | 'heavy') {
  const stats =
    kind === 'heavy'
      ? { hp: 390, damage: 42, range: 16 * 6.8, speed: 114, fireRate: 0.62 }
      : kind === 'medium'
      ? { hp: 240, damage: 24, range: 16 * 5.8, speed: 132, fireRate: 1.05 }
      : { hp: 140, damage: 14, range: 16 * 4.8, speed: 150, fireRate: 1.6 };
  return {
    name: kind === 'heavy' ? '重型战机' : kind === 'medium' ? '中型战机' : '轻型战机',
    role: 'air_fighter',
    tankClass: kind,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    range: stats.range,
    fireRate: stats.fireRate,
    speed: stats.speed
  } as const;
}

function makeNavalPreview(kind: 'light' | 'medium' | 'heavy') {
  const stats =
    kind === 'heavy'
      ? { hp: 560, damage: 52, range: 16 * 6.8, speed: 52, fireRate: 0.55 }
      : kind === 'medium'
      ? { hp: 320, damage: 26, range: 16 * 6.0, speed: 74, fireRate: 0.95 }
      : { hp: 190, damage: 13, range: 16 * 5.2, speed: 95, fireRate: 1.5 };
  return {
    name: kind === 'heavy' ? '重型驱逐舰' : kind === 'medium' ? '炮艇' : '侦察艇',
    role: 'naval_ship',
    tankClass: kind,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    range: stats.range,
    fireRate: stats.fireRate,
    speed: stats.speed
  } as const;
}

function makeExtractorPreview(level: 1 | 2 = 1) {
  const hp = level === 2 ? 320 : 260;
  return {
    name: `采集器 T${level}`,
    role: 'extractor',
    hp,
    maxHp: hp,
    damage: 0,
    range: 0,
    fireRate: 0,
    speed: 0
  } as const;
}

function makeFactoryPreview(type: 'ground' | 'air' | 'naval') {
  return {
    name: type === 'ground' ? '地面工厂' : type === 'air' ? '空军工厂' : '船坞',
    role: type === 'ground' ? 'factory_ground' : type === 'air' ? 'factory_air' : 'factory_naval',
    hp: 520,
    maxHp: 520,
    damage: 0,
    range: 0,
    fireRate: 0,
    speed: 0
  } as const;
}

function makeTowerPreview(type: 'ground' | 'air' | 'coastal' | 'hybrid') {
  if (type === 'air') {
    return {
      name: '防空炮塔',
      role: 'tower_air',
      hp: 360,
      maxHp: 360,
      damage: 18,
      range: 16 * 7.0,
      fireRate: 1.7,
      speed: 0
    } as const;
  }
  if (type === 'hybrid') {
    return {
      name: '综合炮塔',
      role: 'tower_hybrid',
      hp: 460,
      maxHp: 460,
      damage: 22,
      range: 16 * 6.4,
      fireRate: 1.05,
      speed: 0
    } as const;
  }
  if (type === 'coastal') {
    return {
      name: '岸防炮',
      role: 'tower_coastal',
      hp: 440,
      maxHp: 440,
      damage: 34,
      range: 16 * 7.4,
      fireRate: 0.78,
      speed: 0
    } as const;
  }
  return {
    name: '地面炮塔',
    role: 'tower_ground',
    hp: 420,
    maxHp: 420,
    damage: 30,
    range: 16 * 6.2,
    fireRate: 0.72,
    speed: 0
  } as const;
}

export function TankRunPage() {
  const { map, difficulty } = useSelectedBattleSetup();
  const { mode, tankKey, clear } = useTankSession();
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0.04);
  const realLoadProgressRef = useRef(0.04);
  const sceneReadyRef = useRef(false);
  const miniMapPercent = 18;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const fullscreenRequested = useRef(false);
  const miniMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [miniMapCanvas, setMiniMapCanvas] = useState<HTMLCanvasElement | null>(null);
  const [tankHandle, setTankHandle] = useState<TankGameHandle | null>(null);
  const [credits, setCredits] = useState(0);
  const [spawnMessage, setSpawnMessage] = useState<string | null>(null);
  const [hasEngineerSelected, setHasEngineerSelected] = useState(false);
  const [hasBaseSelected, setHasBaseSelected] = useState(false);
  const [hasFactorySelected, setHasFactorySelected] = useState(false);
  const [hasExtractorSelected, setHasExtractorSelected] = useState(false);
  const [hasAirFactorySelected, setHasAirFactorySelected] = useState(false);
  const [hasNavalFactorySelected, setHasNavalFactorySelected] = useState(false);
  const [extractorLevel, setExtractorLevel] = useState(1);
  const [extractorUpgrading, setExtractorUpgrading] = useState(false);
  const [extractorUpgradeProgress, setExtractorUpgradeProgress] = useState(0);
  const [buildMode, setBuildMode] = useState(false);
  const [isCommandDeckDismissed, setIsCommandDeckDismissed] = useState(false);
  const buildModePrevRef = useRef(false);
  const [buildMenu, setBuildMenu] = useState<
    | 'extractor'
    | 'factory_ground'
    | 'factory_air'
    | 'factory_naval'
    | 'tower_ground'
    | 'tower_air'
    | 'tower_coastal'
    | 'tower_hybrid'
    | null
  >(null);
  const [baseQueueLen, setBaseQueueLen] = useState(0);
  const [baseQueueProgress, setBaseQueueProgress] = useState(0);
  const [factoryQueueLen, setFactoryQueueLen] = useState(0);
  const [factoryQueueProgress, setFactoryQueueProgress] = useState(0);
  const [factoryLevel, setFactoryLevel] = useState(1);
  const [factoryUpgrading, setFactoryUpgrading] = useState(false);
  const [factoryUpgradeProgress, setFactoryUpgradeProgress] = useState(0);
  const [airFactoryQueueLen, setAirFactoryQueueLen] = useState(0);
  const [airFactoryQueueProgress, setAirFactoryQueueProgress] = useState(0);
  const [airFactoryLevel, setAirFactoryLevel] = useState(1);
  const [airFactoryUpgrading, setAirFactoryUpgrading] = useState(false);
  const [airFactoryUpgradeProgress, setAirFactoryUpgradeProgress] = useState(0);
  const [navalFactoryQueueLen, setNavalFactoryQueueLen] = useState(0);
  const [navalFactoryQueueProgress, setNavalFactoryQueueProgress] = useState(0);
  const [navalFactoryLevel, setNavalFactoryLevel] = useState(1);
  const [navalFactoryUpgrading, setNavalFactoryUpgrading] = useState(false);
  const [navalFactoryUpgradeProgress, setNavalFactoryUpgradeProgress] = useState(0);
  const [selectedUnitInfo, setSelectedUnitInfo] = useState<{
    name: string | null;
    role: string;
    tankClass?: 'light' | 'medium' | 'heavy';
    hp: number;
    maxHp: number;
    damage: number;
    range: number;
    fireRate: number;
    speed: number;
  } | null>(null);
  const [previewUnitInfo, setPreviewUnitInfo] = useState<{
    name: string | null;
    role: string;
    tankClass?: 'light' | 'medium' | 'heavy';
    hp: number;
    maxHp: number;
    damage: number;
    range: number;
    fireRate: number;
    speed: number;
  } | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [gameOver, setGameOver] = useState<'win' | 'lose' | 'draw' | null>(null);
  const [isViewPanelCollapsed, setIsViewPanelCollapsed] = useState(false);
  const cameraControlTimerRef = useRef<number | null>(null);
  const navalEnabled = (map?.key ?? '').includes('sea');
  const isTouchDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(pointer: coarse)').matches === true ||
      /Mobi|Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
    );
  }, []);
  const showCommandDeck =
    hasEngineerSelected || hasBaseSelected || hasFactorySelected || hasAirFactorySelected || hasNavalFactorySelected;
  const canShowCommandDeck = showCommandDeck && !isCommandDeckDismissed;
  const intelUnitInfo = previewUnitInfo ?? selectedUnitInfo;
  const showIntelCount = !previewUnitInfo && selectedCount > 1;
  const configOverride = useMemo(
    () => ({
      viewPercent: 0.75,
      miniMapPercent: miniMapPercent / 100,
      mapKey: map?.key,
      aiDifficulty: difficulty,
      resourcePoints: map?.resourcePoints,
      spawnPoints: map?.spawnPoints
    }),
    [difficulty, map?.key, map?.resourcePoints, map?.spawnPoints]
  );
  if (!map) return <div className="text-white p-6">未找到地图配置</div>;

  useEffect(() => {
    const tryFullscreen = async () => {
      if (isTouchDevice) return;
      if (fullscreenRequested.current) return;
      const el = shellRef.current;
      if (!el) return;
      fullscreenRequested.current = true;
      if (!document.fullscreenElement) {
        const width = el.clientWidth;
        const height = el.clientHeight;
        if (width < 2 || height < 2) {
          fullscreenRequested.current = false;
          return;
        }
        const maxSide = Math.max(width, height);
        if (maxSide > 4096) {
          fullscreenRequested.current = false;
          return;
        }
        await el.requestFullscreen().catch(() => {
          fullscreenRequested.current = false;
        });
      }
    };
    const timer = window.setTimeout(() => {
      tryFullscreen();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isTouchDevice]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.querySelector<HTMLElement>('.phaser-focus')?.focus();
    }, 300);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setMiniMapCanvas(miniMapCanvasRef.current);
  }, []);

  useEffect(() => {
    if (!isLoading) return;
    const fakeCap = 0.88;
    const tick = window.setInterval(() => {
      setLoadProgress((prev) => {
        if (sceneReadyRef.current) return 1;
        const real = realLoadProgressRef.current;
        let next = prev;
        if (next < fakeCap) {
          // 保底假进度：前期稳定推进，避免卡在低百分比。
          next = Math.min(fakeCap, next + 0.0045);
        }
        if (real > next) {
          const catchup = real >= 0.9 ? 0.03 : 0.012;
          next = Math.min(real, next + catchup);
        }
        return Math.max(prev, Math.min(0.995, next));
      });
    }, 50);
    return () => window.clearInterval(tick);
  }, [isLoading]);

  useEffect(() => {
    if (!tankHandle) return;
    const scene = tankHandle.scene;
    if (!scene?.events) return;
    setIsLoading(true);
    setLoadProgress(0.04);
    realLoadProgressRef.current = 0.04;
    sceneReadyRef.current = false;
    const handleSceneReady = () => {
      sceneReadyRef.current = true;
      realLoadProgressRef.current = 1;
      setLoadProgress(1);
      window.setTimeout(() => setIsLoading(false), 220);
    };
    const handleLoadProgress = (value: number) => {
      realLoadProgressRef.current = Math.max(realLoadProgressRef.current, Math.min(1, value));
    };
    const handleCredits = (value: number) => setCredits(value);
    const handleSelection = (payload: {
      count: number;
      hasEngineer: boolean;
      hasBase: boolean;
      hasFactory: boolean;
      hasAirFactory: boolean;
      hasNavalFactory: boolean;
      hasExtractor: boolean;
      extractorLevel: number;
      extractorUpgrading: boolean;
      extractorUpgradeProgress: number;
      primaryUnit: {
        name: string | null;
        role: string;
        tankClass?: 'light' | 'medium' | 'heavy';
        hp: number;
        maxHp: number;
        damage: number;
        range: number;
        fireRate: number;
        speed: number;
      } | null;
    }) => {
      setSelectedCount(payload.count);
      setHasEngineerSelected(payload.hasEngineer);
      setHasBaseSelected(payload.hasBase);
      setHasFactorySelected(payload.hasFactory);
      setHasAirFactorySelected(payload.hasAirFactory);
      setHasNavalFactorySelected(navalEnabled ? payload.hasNavalFactory : false);
      setHasExtractorSelected(payload.hasExtractor);
      setExtractorLevel(payload.extractorLevel);
      setExtractorUpgrading(payload.extractorUpgrading);
      setExtractorUpgradeProgress(payload.extractorUpgradeProgress);
      setSelectedUnitInfo(payload.primaryUnit);
    };
    const handleBuildMode = (value: boolean) => setBuildMode(value);
    const handleBuildMenu = (
      value:
        | 'extractor'
        | 'factory_ground'
        | 'factory_air'
        | 'factory_naval'
        | 'tower_ground'
        | 'tower_air'
        | 'tower_coastal'
        | 'tower_hybrid'
        | null
    ) => setBuildMenu(value);
    const handleBaseQueue = (payload: { length: number; progress: number }) => {
      setBaseQueueLen(payload.length);
      setBaseQueueProgress(payload.progress);
    };
    const handleFactoryQueue = (payload: { length: number; progress: number; level: number; upgrading: boolean; upgradeProgress: number }) => {
      setFactoryQueueLen(payload.length);
      setFactoryQueueProgress(payload.progress);
      setFactoryLevel(payload.level);
      setFactoryUpgrading(payload.upgrading);
      setFactoryUpgradeProgress(payload.upgradeProgress);
    };
    const handleAirFactoryQueue = (payload: { length: number; progress: number; level: number; upgrading: boolean; upgradeProgress: number }) => {
      setAirFactoryQueueLen(payload.length);
      setAirFactoryQueueProgress(payload.progress);
      setAirFactoryLevel(payload.level);
      setAirFactoryUpgrading(payload.upgrading);
      setAirFactoryUpgradeProgress(payload.upgradeProgress);
    };
    const handleNavalFactoryQueue = (payload: { length: number; progress: number; level: number; upgrading: boolean; upgradeProgress: number }) => {
      setNavalFactoryQueueLen(payload.length);
      setNavalFactoryQueueProgress(payload.progress);
      setNavalFactoryLevel(payload.level);
      setNavalFactoryUpgrading(payload.upgrading);
      setNavalFactoryUpgradeProgress(payload.upgradeProgress);
    };
    const handleGameOver = (result: 'win' | 'lose' | 'draw') => setGameOver(result);
    scene.events.on('loadProgress', handleLoadProgress);
    scene.events.on('sceneReady', handleSceneReady);
    scene.events.on('credits', handleCredits);
    scene.events.on('selection', handleSelection);
    scene.events.on('buildMode', handleBuildMode);
    scene.events.on('buildMenu', handleBuildMenu);
    scene.events.on('baseQueue', handleBaseQueue);
    scene.events.on('factoryQueue', handleFactoryQueue);
    scene.events.on('airFactoryQueue', handleAirFactoryQueue);
    scene.events.on('navalFactoryQueue', handleNavalFactoryQueue);
    scene.events.on('gameOver', handleGameOver);
    setCredits(scene.getCredits());
    if (scene.isSceneReady?.()) {
      handleSceneReady();
    }

    return () => {
      scene.events.off('loadProgress', handleLoadProgress);
      scene.events.off('sceneReady', handleSceneReady);
      scene.events.off('credits', handleCredits);
      scene.events.off('selection', handleSelection);
      scene.events.off('buildMode', handleBuildMode);
      scene.events.off('buildMenu', handleBuildMenu);
      scene.events.off('baseQueue', handleBaseQueue);
      scene.events.off('factoryQueue', handleFactoryQueue);
      scene.events.off('airFactoryQueue', handleAirFactoryQueue);
      scene.events.off('navalFactoryQueue', handleNavalFactoryQueue);
      scene.events.off('gameOver', handleGameOver);
    };
  }, [tankHandle, navalEnabled]);

  const stopCameraControl = () => {
    if (cameraControlTimerRef.current) {
      window.clearInterval(cameraControlTimerRef.current);
      cameraControlTimerRef.current = null;
    }
  };

  const startCameraPan = (dx: number, dy: number) => {
    if (!tankHandle) return;
    stopCameraControl();
    tankHandle.scene.panCameraBy(dx, dy);
    cameraControlTimerRef.current = window.setInterval(() => {
      tankHandle.scene.panCameraBy(dx, dy);
    }, 16);
  };

  const startCameraZoom = (delta: number) => {
    if (!tankHandle) return;
    stopCameraControl();
    tankHandle.scene.zoomCameraBy(delta);
    cameraControlTimerRef.current = window.setInterval(() => {
      tankHandle.scene.zoomCameraBy(delta);
    }, 80);
  };

  useEffect(() => stopCameraControl, []);

  useEffect(() => {
    if (!showCommandDeck) {
      setIsCommandDeckDismissed(false);
      buildModePrevRef.current = false;
      return;
    }
    const enteredBuildMode = buildMode && !buildModePrevRef.current;
    if (enteredBuildMode) {
      setIsCommandDeckDismissed(true);
    }
    buildModePrevRef.current = buildMode;
  }, [buildMode, showCommandDeck]);

  useEffect(() => {
    // Reset preview when leaving command-producing roles, or when selection context changes.
    if (!showCommandDeck) {
      setPreviewUnitInfo(null);
      return;
    }
    if (
      selectedUnitInfo?.role === 'factory_ground' ||
      selectedUnitInfo?.role === 'factory_air' ||
      selectedUnitInfo?.role === 'factory_naval' ||
      selectedUnitInfo?.role === 'base' ||
      selectedUnitInfo?.role === 'engineer'
    ) {
      setPreviewUnitInfo(null);
    }
  }, [showCommandDeck, selectedUnitInfo?.role]);

  return (
    <div ref={shellRef} className="relative w-screen h-screen bg-[#0b0f18] text-white overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0f18] via-[#0f1729] to-[#0b0f18] opacity-90" />
      <div className="relative z-10 h-full">
        <div className="relative w-full h-full bg-[#0f1624] overflow-hidden">
          {gameOver && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
              <div className="w-[420px] border-2 border-[#ff5a3c] bg-[#0c111b] p-6 text-center text-white shadow-[0_0_40px_rgba(255,90,60,0.25)]">
                <div className="text-2xl font-bold tracking-[0.2em] text-[#ffb347]">
                  {gameOver === 'win' ? '胜利' : gameOver === 'lose' ? '失败' : '平局'}
                </div>
                <div className="mt-2 text-sm text-[#c7d2e6]">战斗结束 · 所有单位与建筑已被摧毁</div>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.hash = 'game=tank-hangar';
                    }}
                    className="px-4 py-2 border-2 border-[#ff5a3c] text-[#ffb347]"
                  >
                    返回主大厅
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 border-2 border-[#5bd1ff] text-[#5bd1ff]"
                  >
                    再来一局
                  </button>
                </div>
              </div>
            </div>
          )}
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-sm text-cyan-100">Loading Tank Engine...</div>}>
            <LazyTankPhaserCanvas
              configOverride={configOverride}
              miniMapCanvas={miniMapCanvas}
              onReady={setTankHandle}
            />
          </Suspense>
          <div
            className={`absolute inset-0 z-50 transition-opacity duration-300 ${
              isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,18,0.9),rgba(8,18,30,0.84)_55%,rgba(4,8,16,0.92))]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(91,209,255,0.18),transparent_45%),radial-gradient(circle_at_20%_85%,rgba(255,106,61,0.16),transparent_42%)]" />
            <div className="absolute inset-0 opacity-15 bg-[repeating-linear-gradient(90deg,rgba(210,230,255,0.08),rgba(210,230,255,0.08)_1px,transparent_1px,transparent_28px)]" />
            <div className="relative z-10 flex h-full items-center justify-center px-5">
              <div className="w-full max-w-3xl border border-[#35506a] bg-[#081220]/86 p-6 shadow-[0_0_80px_rgba(0,0,0,0.55)]">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-[#8fb4d4]">
                  <span>Combat Uplink</span>
                  <span>Phase // Boot</span>
                </div>
                <div className="mt-4 border-l-4 border-[#ff6a3d] pl-4">
                  <div className="text-3xl font-bold tracking-[0.08em] text-[#e9f2ff]">战区部署中</div>
                  <div className="mt-2 text-sm text-[#9fb9d8]">
                    模式：{mode ?? 'skirmish'} · 地图：{map?.name ?? map?.key ?? '未知'} · 难度：{difficultyLabel(difficulty)}
                  </div>
                </div>
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs text-[#9cb4d2]">
                    <span>资源装载与地形编译</span>
                    <span>{Math.round(loadProgress * 100)}%</span>
                  </div>
                  <div className="mt-2 h-3 border border-[#2f455f] bg-[#081018] p-[2px]">
                    <div
                      className="h-full bg-[linear-gradient(90deg,#ff5a3c_0%,#ffa94f_55%,#ffe082_100%)] transition-all duration-150"
                      style={{ width: `${Math.max(6, Math.round(loadProgress * 100))}%` }}
                    />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-[11px] text-[#89a7c8]">
                  <div className="border border-[#26394d] bg-[#0a1625] px-3 py-2">单位模型校准</div>
                  <div className="border border-[#26394d] bg-[#0a1625] px-3 py-2">战术链路同步</div>
                  <div className="border border-[#26394d] bg-[#0a1625] px-3 py-2">火控系统自检</div>
                </div>
              </div>
            </div>
          </div>
          <canvas
            ref={miniMapCanvasRef}
            className="absolute left-4 top-4 z-30 rounded-md border border-[#76d0ff] bg-[#0f1624]/90"
          />
          <div className="absolute left-4 bottom-4 z-20 flex gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.hash = 'game=tank-hangar';
              }}
              className="px-3 py-2 border border-[#2c3a4a] bg-[#0f1a2a]/35 hover:border-[#ff5a3c] transition text-xs"
            >
              返回
            </button>
            <button
              type="button"
              onClick={() => {
                clear();
                window.location.hash = '';
              }}
              className="px-3 py-2 border border-[#5a0f14] bg-[#d91e2c] text-white text-xs"
            >
              离开
            </button>
          </div>
          {isTouchDevice && (
            <div className="absolute right-0 bottom-4 z-30 md:hidden">
              <div
                className={`relative transition-transform duration-300 ${
                  isViewPanelCollapsed ? 'translate-x-[126px]' : 'translate-x-0'
                }`}
              >
                <button
                  type="button"
                  className="absolute -left-7 top-1/2 -translate-y-1/2 h-14 w-7 border border-[#35506a] bg-[#081220]/92 text-[#9fc1e6]"
                  onClick={() => {
                    stopCameraControl();
                    setIsViewPanelCollapsed((prev) => !prev);
                  }}
                >
                  {isViewPanelCollapsed ? '◀' : '▶'}
                </button>
                <div className="rounded-xl border border-[#35506a] bg-[#081220]/88 p-2 backdrop-blur-sm">
                <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-[#8fb4d4]">View</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    className="col-start-2 h-9 w-9 border border-[#2c3a4a] bg-[#0f1a2a]/55"
                    onMouseDown={() => startCameraPan(0, -8)}
                    onMouseUp={stopCameraControl}
                    onMouseLeave={stopCameraControl}
                    onTouchStart={() => startCameraPan(0, -8)}
                    onTouchEnd={stopCameraControl}
                    onTouchCancel={stopCameraControl}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="col-start-1 row-start-2 h-9 w-9 border border-[#2c3a4a] bg-[#0f1a2a]/55"
                    onMouseDown={() => startCameraPan(-8, 0)}
                    onMouseUp={stopCameraControl}
                    onMouseLeave={stopCameraControl}
                    onTouchStart={() => startCameraPan(-8, 0)}
                    onTouchEnd={stopCameraControl}
                    onTouchCancel={stopCameraControl}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="col-start-2 row-start-2 h-9 w-9 border border-[#2c3a4a] bg-[#0f1a2a]/55"
                    onMouseDown={() => startCameraPan(0, 8)}
                    onMouseUp={stopCameraControl}
                    onMouseLeave={stopCameraControl}
                    onTouchStart={() => startCameraPan(0, 8)}
                    onTouchEnd={stopCameraControl}
                    onTouchCancel={stopCameraControl}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="col-start-3 row-start-2 h-9 w-9 border border-[#2c3a4a] bg-[#0f1a2a]/55"
                    onMouseDown={() => startCameraPan(8, 0)}
                    onMouseUp={stopCameraControl}
                    onMouseLeave={stopCameraControl}
                    onTouchStart={() => startCameraPan(8, 0)}
                    onTouchEnd={stopCameraControl}
                    onTouchCancel={stopCameraControl}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="col-start-1 row-start-3 h-9 w-9 border border-[#2c3a4a] bg-[#0f1a2a]/55"
                    onMouseDown={() => startCameraZoom(0.05)}
                    onMouseUp={stopCameraControl}
                    onMouseLeave={stopCameraControl}
                    onTouchStart={() => startCameraZoom(0.05)}
                    onTouchEnd={stopCameraControl}
                    onTouchCancel={stopCameraControl}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="col-start-3 row-start-3 h-9 w-9 border border-[#2c3a4a] bg-[#0f1a2a]/55"
                    onMouseDown={() => startCameraZoom(-0.05)}
                    onMouseUp={stopCameraControl}
                    onMouseLeave={stopCameraControl}
                    onTouchStart={() => startCameraZoom(-0.05)}
                    onTouchEnd={stopCameraControl}
                    onTouchCancel={stopCameraControl}
                  >
                    -
                  </button>
                </div>
              </div>
              </div>
            </div>
          )}
          {showCommandDeck && isCommandDeckDismissed && (
            <div className="absolute left-1/2 bottom-4 z-20 -translate-x-1/2">
              <button
                type="button"
                onClick={() => setIsCommandDeckDismissed(false)}
                className="px-4 py-2 border border-[#ff5a3c]/85 bg-[#081220]/85 text-[#ffb347] text-xs uppercase tracking-[0.16em] backdrop-blur-sm"
              >
                打开建造面板
              </button>
            </div>
          )}
          <div
            className={`absolute inset-x-6 bottom-4 z-20 transition-all duration-300 ${
              canShowCommandDeck
                ? buildMode
                  ? 'opacity-95 translate-y-[70%] pointer-events-none'
                  : 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-6 pointer-events-none'
            }`}
          >
            <div
              className={`mx-auto max-w-4xl border-2 border-[#ff5a3c]/85 bg-[#08101c]/22 backdrop-blur-[6px] backdrop-saturate-150 text-white shadow-[0_0_24px_rgba(255,90,60,0.1)] transition-[max-height] duration-300 ${
                buildMode ? 'max-h-[54px] overflow-hidden' : ''
              }`}
              style={{ clipPath: 'polygon(2% 0,98% 0,100% 18%,100% 100%,0 100%,0 18%)' }}
            >
              <div className="flex items-center justify-between px-5 py-3 text-xs uppercase tracking-[0.2em] text-[#ffb347]">
                <div>Command Deck</div>
                <div className="text-[#c7d2e6]">
                  {buildMode ? `选址中 · ${buildMenu ?? 'build'}` : `Credits: ${credits}`}
                </div>
              </div>
              <div className="px-5 pb-4">
                {intelUnitInfo && (
                  <div className="mb-4 grid grid-cols-[170px_1fr] gap-3 border border-[#35506a]/70 bg-[#071120]/20 backdrop-blur-[2px] p-3">
                    <div className="relative flex items-center justify-center border border-[#2c4560]/65 bg-[radial-gradient(circle_at_50%_40%,rgba(91,209,255,0.14),rgba(8,16,27,0.45)_75%)] min-h-[140px]">
                      <img
                        src={getUnitPortrait(intelUnitInfo.role, intelUnitInfo.tankClass)}
                        alt={intelUnitInfo.name ?? 'unit'}
                        className="h-[112px] w-[112px] object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)]"
                      />
                      {showIntelCount && (
                        <div className="absolute right-2 top-2 border border-[#5bd1ff] bg-[#07111d]/95 px-2 py-0.5 text-[11px] text-[#9fd8ff]">
                          x{selectedCount}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-[#ffb347]">Unit Intel</div>
                        <div className="text-[11px] text-[#8fb4d4]">{getUnitRoleTag(intelUnitInfo.role)}</div>
                      </div>
                      <div className="mt-1 text-lg font-semibold text-[#e9f2ff]">{intelUnitInfo.name ?? '单位'}</div>
                      <div className="mt-2 h-2.5 w-full bg-[#132137]/45">
                        <div
                          className="h-full bg-[linear-gradient(90deg,#5bd1ff,#8ef0ff)]"
                          style={{ width: `${Math.round((intelUnitInfo.hp / Math.max(1, intelUnitInfo.maxHp)) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-[#9bb3d4]">
                        HP: {Math.max(0, Math.round(intelUnitInfo.hp))} / {Math.round(intelUnitInfo.maxHp)} ·
                        {` ${Math.round((intelUnitInfo.hp / Math.max(1, intelUnitInfo.maxHp)) * 100)}%`}
                      </div>
                      {isCombatRole(intelUnitInfo.role) ? (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">伤害 {intelUnitInfo.damage}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">射速 {intelUnitInfo.fireRate.toFixed(2)}</div>
                          <div className="border border-[#243347] bg-[#0f1a2a]/35 px-2 py-1">
                            DPS {(intelUnitInfo.damage * intelUnitInfo.fireRate).toFixed(1)}
                          </div>
                          <div className="border border-[#243347] bg-[#0f1a2a]/35 px-2 py-1">
                            射程 {(intelUnitInfo.range / 16).toFixed(1)} 格
                          </div>
                          <div className="border border-[#243347] bg-[#0f1a2a]/35 px-2 py-1">移速 {intelUnitInfo.speed.toFixed(0)}</div>
                          <div className="border border-[#243347] bg-[#0f1a2a]/35 px-2 py-1">
                            类型 {intelUnitInfo.tankClass ? intelUnitInfo.tankClass.toUpperCase() : 'STD'}
                          </div>
                        </div>
                      ) : intelUnitInfo.role === 'factory_ground' ? (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">工厂等级 T{factoryLevel}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">生产倍率 x{factoryLevel === 1 ? '1' : factoryLevel === 2 ? '2' : '4'}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">升级状态 {factoryUpgrading ? '进行中' : '待机'}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">队列 {factoryQueueLen}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">进度 {(factoryQueueProgress * 100).toFixed(0)}%</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">
                            解锁 {factoryLevel >= 3 ? '轻/中/重' : factoryLevel >= 2 ? '轻/中' : '轻'}
                          </div>
                        </div>
                      ) : intelUnitInfo.role === 'factory_air' ? (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">工厂等级 T{airFactoryLevel}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">生产倍率 x{airFactoryLevel === 1 ? '1' : airFactoryLevel === 2 ? '2' : '4'}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">升级状态 {airFactoryUpgrading ? '进行中' : '待机'}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">队列 {airFactoryQueueLen}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">进度 {(airFactoryQueueProgress * 100).toFixed(0)}%</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">
                            解锁 {airFactoryLevel >= 3 ? '轻/中/重' : airFactoryLevel >= 2 ? '轻/中' : '轻'}
                          </div>
                        </div>
                      ) : intelUnitInfo.role === 'factory_naval' ? (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">船坞等级 T{navalFactoryLevel}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">生产倍率 x{navalFactoryLevel === 1 ? '1' : navalFactoryLevel === 2 ? '2' : '4'}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">升级状态 {navalFactoryUpgrading ? '进行中' : '待机'}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">队列 {navalFactoryQueueLen}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">进度 {(navalFactoryQueueProgress * 100).toFixed(0)}%</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">
                            解锁 {navalFactoryLevel >= 3 ? '轻/中/重' : navalFactoryLevel >= 2 ? '轻/中' : '轻'}
                          </div>
                        </div>
                      ) : intelUnitInfo.role === 'base' ? (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">基础收入 +5.0/s</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">生产队列 {baseQueueLen}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">队列进度 {(baseQueueProgress * 100).toFixed(0)}%</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">可产出 轻坦/工程车</div>
                        </div>
                      ) : intelUnitInfo.role === 'extractor' ? (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">采集效率 {extractorLevel === 2 ? '4.0/s' : '2.0/s'}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">等级 T{extractorLevel}</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">升级状态 {extractorUpgrading ? '进行中' : '待机'}</div>
                        </div>
                      ) : (
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">建造单位</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">可建采集器/工厂/炮塔</div>
                          <div className="border border-[#243347]/70 bg-[#0f1a2a]/28 px-2 py-1">移速 {intelUnitInfo.speed.toFixed(0)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {hasEngineerSelected && !hasBaseSelected && !hasFactorySelected && !hasAirFactorySelected && !hasNavalFactorySelected && (
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestBuildAtSelection();
                        setPreviewUnitInfo(makeExtractorPreview(1));
                        setSpawnMessage(ok ? '选择资源点放置采集器' : '请先选中工程车');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeExtractorPreview(1))}
                      onFocus={() => setPreviewUnitInfo(makeExtractorPreview(1))}
                      className="h-12 border-2 border-[#ffb347] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition flex items-center justify-between px-3"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-[#ffb347] border border-[#0b0f18]" />
                        采集器
                      </span>
                      <span className="text-xs text-[#ffb347]">150 {buildMode ? '选址中' : 'B'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestBuildGroundFactory();
                        setPreviewUnitInfo(makeFactoryPreview('ground'));
                        setSpawnMessage(ok ? '选择地块放置地面工厂' : '请先选中工程车');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeFactoryPreview('ground'))}
                      onFocus={() => setPreviewUnitInfo(makeFactoryPreview('ground'))}
                      className="h-12 border-2 border-[#5bd1ff] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition flex items-center justify-between px-3 col-span-1"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-[#5bd1ff] border border-[#0b0f18]" />
                        地面工厂
                      </span>
                      <span className="text-xs text-[#5bd1ff]">220 {buildMenu === 'factory_ground' ? '选址中' : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestBuildAirFactory();
                        setPreviewUnitInfo(makeFactoryPreview('air'));
                        setSpawnMessage(ok ? '选择地块放置空军工厂' : '请先选中工程车');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeFactoryPreview('air'))}
                      onFocus={() => setPreviewUnitInfo(makeFactoryPreview('air'))}
                      className="h-12 border-2 border-[#ffb347] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition flex items-center justify-between px-3"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-[#ffb347] border border-[#0b0f18]" />
                        空军工厂
                      </span>
                      <span className="text-xs text-[#ffb347]">260 {buildMenu === 'factory_air' ? '选址中' : ''}</span>
                    </button>
                    {navalEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!tankHandle) return;
                          const ok = tankHandle.scene.requestBuildNavalFactory();
                          setPreviewUnitInfo(makeFactoryPreview('naval'));
                          setSpawnMessage(ok ? '选择海岸地块放置船坞' : '需选中工程车，且选址紧邻水域');
                        }}
                        onMouseEnter={() => setPreviewUnitInfo(makeFactoryPreview('naval'))}
                        onFocus={() => setPreviewUnitInfo(makeFactoryPreview('naval'))}
                        className="h-12 border-2 border-[#74c8ff] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition flex items-center justify-between px-3"
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 bg-[#74c8ff] border border-[#0b0f18]" />
                          船坞
                        </span>
                        <span className="text-xs text-[#74c8ff]">240 {buildMenu === 'factory_naval' ? '选址中' : ''}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestBuildTower('tower_ground');
                        setPreviewUnitInfo(makeTowerPreview('ground'));
                        setSpawnMessage(ok ? '选择地块放置地面炮塔' : '请先选中工程车');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeTowerPreview('ground'))}
                      onFocus={() => setPreviewUnitInfo(makeTowerPreview('ground'))}
                      className="h-12 border-2 border-[#5bd1ff] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition flex items-center justify-between px-3"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-[#5bd1ff] border border-[#0b0f18]" />
                        地面炮塔
                      </span>
                      <span className="text-xs text-[#5bd1ff]">180</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestBuildTower('tower_air');
                        setPreviewUnitInfo(makeTowerPreview('air'));
                        setSpawnMessage(ok ? '选择地块放置防空炮塔' : '请先选中工程车');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeTowerPreview('air'))}
                      onFocus={() => setPreviewUnitInfo(makeTowerPreview('air'))}
                      className="h-12 border-2 border-[#ffb347] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition flex items-center justify-between px-3"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-[#ffb347] border border-[#0b0f18]" />
                        防空炮塔
                      </span>
                      <span className="text-xs text-[#ffb347]">200</span>
                    </button>
                    {navalEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!tankHandle) return;
                          const ok = tankHandle.scene.requestBuildTower('tower_coastal');
                          setPreviewUnitInfo(makeTowerPreview('coastal'));
                          setSpawnMessage(ok ? '选择海岸地块放置岸防炮' : '请先选中工程车，并靠近海岸');
                        }}
                        onMouseEnter={() => setPreviewUnitInfo(makeTowerPreview('coastal'))}
                        onFocus={() => setPreviewUnitInfo(makeTowerPreview('coastal'))}
                        className="h-12 border-2 border-[#74c8ff] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition flex items-center justify-between px-3"
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 bg-[#74c8ff] border border-[#0b0f18]" />
                          岸防炮
                        </span>
                        <span className="text-xs text-[#74c8ff]">220</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestBuildTower('tower_hybrid');
                        setPreviewUnitInfo(makeTowerPreview('hybrid'));
                        setSpawnMessage(ok ? '选择地块放置综合炮塔' : '请先选中工程车');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeTowerPreview('hybrid'))}
                      onFocus={() => setPreviewUnitInfo(makeTowerPreview('hybrid'))}
                      className="h-12 border-2 border-[#7ef5a6] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition flex items-center justify-between px-3"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-[#7ef5a6] border border-[#0b0f18]" />
                        综合炮塔
                      </span>
                      <span className="text-xs text-[#7ef5a6]">260</span>
                    </button>
                  </div>
                )}
                {hasBaseSelected && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestQueueTank(90);
                        setPreviewUnitInfo(makeTankPreview('light'));
                        setSpawnMessage(ok ? '已加入生产队列' : '资源不足');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeTankPreview('light'))}
                      onFocus={() => setPreviewUnitInfo(makeTankPreview('light'))}
                      className="h-12 border-2 border-[#5bd1ff] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                    >
                      轻型坦克 · 90
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestQueueEngineer(80);
                        setPreviewUnitInfo({
                          name: '工程车',
                          role: 'engineer',
                          hp: 120,
                          maxHp: 120,
                          damage: 0,
                          range: 0,
                          fireRate: 0,
                          speed: 70
                        });
                        setSpawnMessage(ok ? '工程车加入队列' : '资源不足');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo({
                        name: '工程车',
                        role: 'engineer',
                        hp: 120,
                        maxHp: 120,
                        damage: 0,
                        range: 0,
                        fireRate: 0,
                        speed: 70
                      })}
                      onFocus={() => setPreviewUnitInfo({
                        name: '工程车',
                        role: 'engineer',
                        hp: 120,
                        maxHp: 120,
                        damage: 0,
                        range: 0,
                        fireRate: 0,
                        speed: 70
                      })}
                      className="h-12 border-2 border-[#7ef5a6] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                    >
                      工程车 · 80
                    </button>
                    <div className="h-12 flex flex-col items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4] px-2">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(baseQueueLen, 5) }).map((_, idx) => (
                          <span key={idx} className="inline-block w-3 h-3 border border-[#5bd1ff] bg-[#12283d]/45" />
                        ))}
                        {baseQueueLen > 5 && <span className="text-[10px] text-[#5bd1ff]">+{baseQueueLen - 5}</span>}
                      </div>
                      <div className="mt-1 h-1 w-full bg-[#12283d]/45">
                        <div className="h-full bg-[#5bd1ff]" style={{ width: `${Math.round(baseQueueProgress * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                )}
                {hasFactorySelected && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        setPreviewUnitInfo(makeTankPreview('light'));
                        const ok = tankHandle.scene.requestQueueFactoryTankByClass('light', 90);
                        setSpawnMessage(ok ? '轻坦加入队列' : '资源不足');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeTankPreview('light'))}
                      onFocus={() => setPreviewUnitInfo(makeTankPreview('light'))}
                      className="h-12 border-2 border-[#5bd1ff] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                    >
                      轻型坦克 · 90
                    </button>
                    {factoryLevel >= 2 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!tankHandle) return;
                          setPreviewUnitInfo(makeTankPreview('medium'));
                          const ok = tankHandle.scene.requestQueueFactoryTankByClass('medium', 140);
                          setSpawnMessage(ok ? '中坦加入队列' : '资源不足');
                        }}
                        onMouseEnter={() => setPreviewUnitInfo(makeTankPreview('medium'))}
                        onFocus={() => setPreviewUnitInfo(makeTankPreview('medium'))}
                        className="h-12 border-2 border-[#7ef5a6] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                      >
                        中型坦克 · 140
                      </button>
                    ) : (
                      <div className="h-12 flex items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4]">
                        升级到 T2 解锁中坦
                      </div>
                    )}
                    {factoryLevel >= 3 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!tankHandle) return;
                          setPreviewUnitInfo(makeTankPreview('heavy'));
                          const ok = tankHandle.scene.requestQueueFactoryTankByClass('heavy', 230);
                          setSpawnMessage(ok ? '重坦加入队列' : '资源不足');
                        }}
                        onMouseEnter={() => setPreviewUnitInfo(makeTankPreview('heavy'))}
                        onFocus={() => setPreviewUnitInfo(makeTankPreview('heavy'))}
                        className="h-12 border-2 border-[#ffb347] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                      >
                        重型坦克 · 230
                      </button>
                    ) : (
                      <div className="h-12 flex items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4]">
                        升级到 T3 解锁重坦
                      </div>
                    )}
                    <div className="h-12 flex flex-col items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4] px-2">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(factoryQueueLen, 5) }).map((_, idx) => (
                          <span key={idx} className="inline-block w-3 h-3 border border-[#5bd1ff] bg-[#12283d]/45" />
                        ))}
                        {factoryQueueLen > 5 && <span className="text-[10px] text-[#5bd1ff]">+{factoryQueueLen - 5}</span>}
                      </div>
                      <div className="mt-1 h-1 w-full bg-[#12283d]/45">
                        <div className="h-full bg-[#5bd1ff]" style={{ width: `${Math.round(factoryQueueProgress * 100)}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestUpgradeFactory();
                        setSpawnMessage(ok ? '工厂升级中' : '无法升级');
                      }}
                      className="h-12 border-2 border-[#ff5a3c] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition col-span-2"
                      disabled={factoryUpgrading || factoryLevel >= 3}
                    >
                      工厂升级 · {factoryLevel === 1 ? 220 : factoryLevel === 2 ? 360 : 'MAX'}
                    </button>
                    {factoryUpgrading && (
                      <div className="col-span-2 h-2 w-full bg-[#12283d]/45">
                        <div className="h-full bg-[#ff5a3c]" style={{ width: `${Math.round(factoryUpgradeProgress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                )}
                {hasAirFactorySelected && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        setPreviewUnitInfo(makeAirPreview('light'));
                        const ok = tankHandle.scene.requestQueueAirUnitByClass('light', 130);
                        setSpawnMessage(ok ? '轻型战机加入队列' : '资源不足');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeAirPreview('light'))}
                      onFocus={() => setPreviewUnitInfo(makeAirPreview('light'))}
                      className="h-12 border-2 border-[#ffb347] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition col-span-2"
                    >
                      轻型战机 · 130
                    </button>
                    {airFactoryLevel >= 2 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!tankHandle) return;
                          setPreviewUnitInfo(makeAirPreview('medium'));
                          const ok = tankHandle.scene.requestQueueAirUnitByClass('medium', 210);
                          setSpawnMessage(ok ? '中型战机加入队列' : '资源不足');
                        }}
                        onMouseEnter={() => setPreviewUnitInfo(makeAirPreview('medium'))}
                        onFocus={() => setPreviewUnitInfo(makeAirPreview('medium'))}
                        className="h-12 border-2 border-[#7ef5a6] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                      >
                        中型战机 · 210
                      </button>
                    ) : (
                      <div className="h-12 flex items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4]">
                        升级到 T2 解锁中型
                      </div>
                    )}
                    {airFactoryLevel >= 3 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!tankHandle) return;
                          setPreviewUnitInfo(makeAirPreview('heavy'));
                          const ok = tankHandle.scene.requestQueueAirUnitByClass('heavy', 340);
                          setSpawnMessage(ok ? '重型战机加入队列' : '资源不足');
                        }}
                        onMouseEnter={() => setPreviewUnitInfo(makeAirPreview('heavy'))}
                        onFocus={() => setPreviewUnitInfo(makeAirPreview('heavy'))}
                        className="h-12 border-2 border-[#ff5a3c] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                      >
                        重型战机 · 340
                      </button>
                    ) : (
                      <div className="h-12 flex items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4]">
                        升级到 T3 解锁重型
                      </div>
                    )}
                    <div className="h-12 flex flex-col items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4] px-2 col-span-2">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(airFactoryQueueLen, 5) }).map((_, idx) => (
                          <span key={idx} className="inline-block w-3 h-3 border border-[#ffb347] bg-[#12283d]/45" />
                        ))}
                        {airFactoryQueueLen > 5 && (
                          <span className="text-[10px] text-[#ffb347]">+{airFactoryQueueLen - 5}</span>
                        )}
                      </div>
                      <div className="mt-1 h-1 w-full bg-[#12283d]/45">
                        <div className="h-full bg-[#ffb347]" style={{ width: `${Math.round(airFactoryQueueProgress * 100)}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestUpgradeAirFactory();
                        setSpawnMessage(ok ? '空军工厂升级中' : '无法升级');
                      }}
                      className="h-12 border-2 border-[#ff5a3c] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition col-span-2"
                      disabled={airFactoryUpgrading || airFactoryLevel >= 3}
                    >
                      空军工厂升级 · {airFactoryLevel === 1 ? 240 : airFactoryLevel === 2 ? 380 : 'MAX'}
                    </button>
                    {airFactoryUpgrading && (
                      <div className="col-span-2 h-2 w-full bg-[#12283d]/45">
                        <div className="h-full bg-[#ff5a3c]" style={{ width: `${Math.round(airFactoryUpgradeProgress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                )}
                {navalEnabled && hasNavalFactorySelected && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        setPreviewUnitInfo(makeNavalPreview('light'));
                        const ok = tankHandle.scene.requestQueueNavalUnitByClass('light', 120);
                        setSpawnMessage(ok ? '侦察艇加入队列' : '资源不足');
                      }}
                      onMouseEnter={() => setPreviewUnitInfo(makeNavalPreview('light'))}
                      onFocus={() => setPreviewUnitInfo(makeNavalPreview('light'))}
                      className="h-12 border-2 border-[#74c8ff] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition col-span-2"
                    >
                      侦察艇 · 120
                    </button>
                    {navalFactoryLevel >= 2 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!tankHandle) return;
                          setPreviewUnitInfo(makeNavalPreview('medium'));
                          const ok = tankHandle.scene.requestQueueNavalUnitByClass('medium', 190);
                          setSpawnMessage(ok ? '炮艇加入队列' : '资源不足');
                        }}
                        onMouseEnter={() => setPreviewUnitInfo(makeNavalPreview('medium'))}
                        onFocus={() => setPreviewUnitInfo(makeNavalPreview('medium'))}
                        className="h-12 border-2 border-[#7ef5a6] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                      >
                        炮艇 · 190
                      </button>
                    ) : (
                      <div className="h-12 flex items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4]">
                        升级到 T2 解锁炮艇
                      </div>
                    )}
                    {navalFactoryLevel >= 3 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!tankHandle) return;
                          setPreviewUnitInfo(makeNavalPreview('heavy'));
                          const ok = tankHandle.scene.requestQueueNavalUnitByClass('heavy', 320);
                          setSpawnMessage(ok ? '驱逐舰加入队列' : '资源不足');
                        }}
                        onMouseEnter={() => setPreviewUnitInfo(makeNavalPreview('heavy'))}
                        onFocus={() => setPreviewUnitInfo(makeNavalPreview('heavy'))}
                        className="h-12 border-2 border-[#ff5a3c] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                      >
                        驱逐舰 · 320
                      </button>
                    ) : (
                      <div className="h-12 flex items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4]">
                        升级到 T3 解锁驱逐舰
                      </div>
                    )}
                    <div className="h-12 flex flex-col items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4] px-2 col-span-2">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(navalFactoryQueueLen, 5) }).map((_, idx) => (
                          <span key={idx} className="inline-block w-3 h-3 border border-[#74c8ff] bg-[#12283d]/45" />
                        ))}
                        {navalFactoryQueueLen > 5 && (
                          <span className="text-[10px] text-[#74c8ff]">+{navalFactoryQueueLen - 5}</span>
                        )}
                      </div>
                      <div className="mt-1 h-1 w-full bg-[#12283d]/45">
                        <div className="h-full bg-[#74c8ff]" style={{ width: `${Math.round(navalFactoryQueueProgress * 100)}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestUpgradeNavalFactory();
                        setSpawnMessage(ok ? '船坞升级中' : '无法升级');
                      }}
                      className="h-12 border-2 border-[#ff5a3c] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition col-span-2"
                      disabled={navalFactoryUpgrading || navalFactoryLevel >= 3}
                    >
                      船坞升级 · {navalFactoryLevel === 1 ? 240 : navalFactoryLevel === 2 ? 380 : 'MAX'}
                    </button>
                    {navalFactoryUpgrading && (
                      <div className="col-span-2 h-2 w-full bg-[#12283d]/45">
                        <div className="h-full bg-[#ff5a3c]" style={{ width: `${Math.round(navalFactoryUpgradeProgress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                )}
                {hasExtractorSelected && showCommandDeck && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-12 flex items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4]">
                      采集器 T{extractorLevel} · 产出 {extractorLevel === 2 ? '2.0' : '1.0'}/s
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tankHandle) return;
                        const ok = tankHandle.scene.requestUpgradeExtractor();
                        setSpawnMessage(ok ? '采集器升级中' : '无法升级（工程车需在附近）');
                      }}
                      className="h-12 border-2 border-[#ffb347] bg-[#0f1a2a]/35 text-sm font-semibold hover:bg-[#16304a]/55 transition"
                      disabled={extractorUpgrading || extractorLevel >= 2}
                    >
                      升级采集器 · 200
                    </button>
                    {extractorUpgrading && (
                      <div className="col-span-2 h-2 w-full bg-[#12283d]/45">
                        <div
                          className="h-full bg-[#ffb347]"
                          style={{ width: `${Math.round(extractorUpgradeProgress * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {!showCommandDeck && (
                  <div className="h-12 flex items-center justify-center border border-[#2c3a4a] text-xs text-[#9bb3d4]">
                    选中工程车或基地以打开建造面板
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between text-[11px] text-[#9bb3d4]">
                  <span>测试</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => tankHandle?.scene.debugEliminate('ai')}
                      className="px-2 py-1 border border-[#2c3a4a] hover:border-[#5bd1ff]"
                    >
                      清 AI
                    </button>
                    <button
                      type="button"
                      onClick={() => tankHandle?.scene.debugEliminate('player')}
                      className="px-2 py-1 border border-[#2c3a4a] hover:border-[#ff5a3c]"
                    >
                      清 我方
                    </button>
                  </div>
                </div>
                {spawnMessage && <div className="mt-2 text-[11px] text-[#ffb347]">{spawnMessage}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
