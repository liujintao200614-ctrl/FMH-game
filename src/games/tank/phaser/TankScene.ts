import Phaser from 'phaser';
import { TankSceneConfig } from './types';

type TankClass = 'light' | 'medium' | 'heavy';
type UnitRole =
  | 'tank'
  | 'engineer'
  | 'base'
  | 'factory_ground'
  | 'factory_air'
  | 'factory_naval'
  | 'air_fighter'
  | 'naval_ship'
  | 'tower_ground'
  | 'tower_air'
  | 'tower_coastal'
  | 'tower_hybrid';
type BuildType =
  | 'extractor'
  | 'factory_ground'
  | 'factory_air'
  | 'factory_naval'
  | 'tower_ground'
  | 'tower_air'
  | 'tower_coastal'
  | 'tower_hybrid';

export class TankScene extends Phaser.Scene {
  private cfg: TankSceneConfig;
  private worldWidth = 0;
  private worldHeight = 0;
  private mapLayer?: Phaser.GameObjects.Container;
  private seaDeepLayer: Phaser.GameObjects.RenderTexture[] = [];
  private seaShallowLayer: Phaser.GameObjects.RenderTexture[] = [];
  private seaWaveLayer: Phaser.GameObjects.RenderTexture[] = [];
  private blocked: boolean[][] = [];
  private tileTypes: number[][] = [];
  private shallowWaterMask: boolean[][] = [];
  private crowdCost: number[][] = [];
  private miniMapCanvas?: HTMLCanvasElement;
  private miniMapCtx?: CanvasRenderingContext2D | null;
  private miniMapBase?: HTMLCanvasElement;
  private miniMapDirty = false;
  private miniMapSize?: { w: number; h: number };
  private keys?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    X: Phaser.Input.Keyboard.Key;
    C: Phaser.Input.Keyboard.Key;
    B: Phaser.Input.Keyboard.Key;
  };
  private keyState = new Set<string>();
  private mapVariants = [
    { key: 'grasslands', name: '草原断带' },
    { key: 'redsoil-rift', name: '赤土裂谷' },
    { key: 'sea-island', name: '海上群岛' }
  ];
  private mapIndex = 0;
  private mapSeed = 10421;
  private hudText?: Phaser.GameObjects.Text;
  private hudUpdateTimer = 0;
  private markerLayer?: Phaser.GameObjects.Container;
  private dragging = false;
  private selecting = false;
  private pointerWasTouch = false;
  private dragStart = { x: 0, y: 0, camX: 0, camY: 0 };
  private units: Array<{
    id: number;
    body: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
    team: 'player' | 'ai';
    role: UnitRole;
    tankClass?: TankClass;
    factoryLevel?: 1 | 2 | 3;
    upgrading?: boolean;
    upgradeTimer?: number;
    airFactoryLevel?: 1 | 2 | 3;
    airUpgrading?: boolean;
    airUpgradeTimer?: number;
    navalFactoryLevel?: 1 | 2 | 3;
    navalUpgrading?: boolean;
    navalUpgradeTimer?: number;
    size: number;
    speed: number;
    hp: number;
    maxHp: number;
    damage: number;
    range: number;
    fireRate: number;
    fireTimer: number;
    shadow?: Phaser.GameObjects.Ellipse;
    hpBar?: Phaser.GameObjects.Graphics;
    airSelectRing?: Phaser.GameObjects.Graphics;
    attackRangeRing?: Phaser.GameObjects.Graphics;
    hitFlash?: number;
    target?: Phaser.Math.Vector2;
    path?: Phaser.Math.Vector2[];
    pathIndex: number;
    aiTargetKey?: string;
    forcedTargetUnitId?: number;
    forcedTargetNodeKey?: string;
    locked?: boolean;
    isInitialDefense?: boolean;
  }> = [];
  private selectedUnits: typeof this.units = [];
  private previewGfx?: Phaser.GameObjects.Graphics;
  private bulletGfx?: Phaser.GameObjects.Graphics;
  private selectionGfx?: Phaser.GameObjects.Graphics;
  private buildPreviewGfx?: Phaser.GameObjects.Graphics;
  private buildPreviewSprite?: Phaser.GameObjects.Image;
  private buildSiteGfx?: Phaser.GameObjects.Graphics;
  private buildBeamGfx?: Phaser.GameObjects.Graphics;
  private attackOrderGfx?: Phaser.GameObjects.Graphics;
  private selectionMarkerGfx?: Phaser.GameObjects.Graphics;
  private commandPathGfx?: Phaser.GameObjects.Graphics;
  private moveCommandPreview: Array<{ points: Phaser.Math.Vector2[]; expiresAt: number }> = [];
  private lastAttackPing: { x: number; y: number; until: number } | null = null;
  private unitIdCounter = 1;
  private buildMode = false;
  private buildType: BuildType | null = null;
  private towerBuildFacingIndex = 0;
  private selectedExtractor: (typeof this.resourceNodes)[number] | null = null;
  private baseQueue: Array<'tank' | 'engineer'> = [];
  private baseBuildTimer = 0;
  private baseBuildDuration = 4.5;
  private baseQueueEmitTimer = 0;
  private gameOver: 'win' | 'lose' | 'draw' | null = null;
  private factoryQueue: TankClass[] = [];
  private factoryBuildTimer = 0;
  private factoryUpgradeDuration = 6;
  private factoryQueueEmitTimer = 0;
  private airFactoryQueue: TankClass[] = [];
  private airFactoryBuildTimer = 0;
  private airFactoryUpgradeDuration = 6;
  private airFactoryQueueEmitTimer = 0;
  private navalFactoryQueue: TankClass[] = [];
  private navalFactoryBuildTimer = 0;
  private navalFactoryUpgradeDuration = 6;
  private navalFactoryQueueEmitTimer = 0;
  private factoryBuildSites: Array<{
    x: number;
    y: number;
    team: 'player' | 'ai';
    progress: number;
    builderId?: number;
    type: 'ground' | 'air' | 'naval';
  }> = [];
  private towerBuildSites: Array<{
    x: number;
    y: number;
    team: 'player' | 'ai';
    progress: number;
    builderId?: number;
    type: 'ground' | 'air' | 'coastal' | 'hybrid';
    facingIndex: number;
  }> = [];
  private bullets: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    team: 'player' | 'ai';
    damage: number;
    radius: number;
    life: number;
    drawColor?: number;
    drawRadius?: number;
    trailLength?: number;
    trailAlpha?: number;
    sourceRole:
      | 'tank'
      | 'air_fighter'
      | 'naval_ship'
      | 'tower_ground'
      | 'tower_air'
      | 'tower_coastal'
      | 'tower_hybrid';
    sourceClass?: TankClass;
  }> = [];
  private resourceNodes: Array<{
    x: number;
    y: number;
    extractorOwner: 'player' | 'ai' | null;
    extractorLevel?: 1 | 2;
    upgrading?: boolean;
    upgradeProgress?: number;
    upgraderId?: number;
    buildProgress: number;
    buildTeam: 'player' | 'ai' | null;
    builderId?: number;
    extractorHp?: number;
    extractorMaxHp?: number;
    extractorHpTimer?: number;
  }> = [];
  private resourceMarkers: Array<{
    circle: Phaser.GameObjects.Arc;
    ring: Phaser.GameObjects.Graphics;
    node: TankScene['resourceNodes'][number];
  }> = [];
  private extractorSprites: Array<{
    sprite: Phaser.GameObjects.Image;
    label: Phaser.GameObjects.Text;
    hpBar: Phaser.GameObjects.Graphics;
    node: TankScene['resourceNodes'][number];
  }> = [];
  private credits = 2000;
  private creditRemainder = 0;
  private incomePerSecond = 0;
  private lastCredits = 2000;
  private sceneReady = false;
  private aiTankSpawnTimer = 0;
  private aiNavalSpawnTimer = 0;
  private aiEngineerSpawnTimer = 0;
  private aiAttackOrderTimer = 0;
  private aiFactoryPlanTimer = 0;
  private aiNavalFactoryPlanTimer = 0;
  private aiProductionCycle = 0;
  private aiWaveState: 'idle' | 'assembling' = 'idle';
  private aiWaveAssembleTimer = 0;
  private aiTowerPlanTimer = 0;
  private audioCtx?: AudioContext;
  private lastAirShotSfxAt: Record<'light' | 'medium' | 'heavy', number> = {
    light: 0,
    medium: 0,
    heavy: 0
  };
  private lastNavalShotSfxAt: Record<'light' | 'medium' | 'heavy', number> = {
    light: 0,
    medium: 0,
    heavy: 0
  };

  constructor(cfg: TankSceneConfig) {
    super({ key: 'TankScene' });
    this.cfg = cfg;
  }

  preload() {
    this.sceneReady = false;
    this.events.emit('loadProgress', 0.04);
    this.load.on('progress', (value: number) => {
      this.events.emit('loadProgress', Phaser.Math.Clamp(value, 0, 1));
    });
    this.load.once('complete', () => {
      this.events.emit('loadProgress', 1);
      this.events.emit('loadComplete');
    });
    const base = '/assets/tiles/grass16';
    const redsoil = '/assets/tiles/redsoil';
    const sea = '/assets/tiles/sea16';
    this.load.image('tile_grass_01', `${base}/tile_grass_01.png`);
    this.load.image('tile_grass_02', `${base}/tile_grass_02.png`);
    this.load.image('tile_grass_03', `${base}/tile_grass_03.png`);
    this.load.image('tile_dirt_01', `${base}/tile_dirt_01.png`);
    this.load.image('tile_dirt_02', `${base}/tile_dirt_02.png`);
    this.load.image('tile_sand_01', `${base}/tile_sand_01.png`);
    this.load.image('tile_stone_01', `${base}/tile_stone_01.png`);
    this.load.image('tile_path_01', `${base}/tile_path_01.png`);
    this.load.image('tree_canopy_tile', `${base}/tree_canopy_tile.png`);
    this.load.image('resource_pit_tile', `${base}/resource_pit_tile.png`);
    this.load.image('redsoil_crack_tile', `${redsoil}/redsoil_crack_tile.png`);
    this.load.image('redsoil_crack_edge_tile', `${redsoil}/redsoil_crack_edge_tile.png`);
    this.load.image('canyon_floor_tile', `${redsoil}/canyon_floor_tile.png`);
    this.load.image('canyon_ramp_tile', `${redsoil}/canyon_ramp_tile.png`);
    this.load.image('canyon_wall_shadow_tile', `${redsoil}/canyon_wall_shadow_tile.png`);
    this.load.image('bridge_tile', `${redsoil}/bridge_tile.png`);
    this.load.image('water_deep_tile', `${sea}/water_deep_tile.png`);
    this.load.image('water_shallow_tile', `${sea}/water_shallow_tile.png`);
    this.load.image('shore_edge_tile', `${sea}/shore_edge_tile.png`);
    this.load.image('shore_wave_tile', `${sea}/shore_wave_tile.png`);
    this.load.image('tank_light', '/maps/tank-light-gray-96.png');
    this.load.image('tank_medium', '/maps/tank-medium-gray-144.png');
    this.load.image('tank_heavy', '/maps/tank-heavy-96x96.png');
    this.load.image('engineer_small', '/maps/engineer-small-32x32.png');
    this.load.image('engineer_medium', '/maps/engineer-medium-64x64.png');
    this.load.image('engineer_large', '/maps/engineer-large-128x128.png');
    this.load.image('hq_base', '/maps/headquarters-192x192.png');
    this.load.image('factory_ground_1', '/maps/tank-factory-256x256.png');
    this.load.image('factory_ground_2', '/maps/tank-factory-level2-256x256.png');
    this.load.image('factory_ground_3', '/maps/tank-factory-level3-256x256.png');
    this.load.image('factory_air_1', '/maps/airfactory-turret-sprite-256px-0deg.png');
    this.load.image('factory_air_2', '/maps/aircraft-factory-level2-256x256.png');
    this.load.image('factory_air_3', '/maps/aircraft-factory-lv3-240x240.png');
    this.load.image('factory_naval_1', '/maps/naval-factory-level1.png');
    this.load.image('factory_naval_2', '/maps/naval-factory-level2.png');
    this.load.image('factory_naval_3', '/maps/naval-factory-level3.png');
    this.load.image('harvester_1', '/maps/harvester-level1-256x256.png');
    this.load.image('harvester_2', '/maps/harvester-level2-256x256.png');
    this.load.image('tower_ground', '/maps/turret-sprite-256px-0deg.png');
    this.load.image('tower_air', '/maps/aa-turret-sprite-256px-0deg.png');
    this.load.image('tower_coastal', '/maps/coastal-tower.png');
    this.load.image('tower_hybrid', '/maps/hybrid-turret-tower-256x256.png');
    this.load.image('air_fighter_light', '/maps/light-fighter-96x96.png');
    this.load.image('air_fighter_medium', '/maps/medium-fighter-96x96.png');
    this.load.image('air_fighter_heavy', '/maps/heavy-fighter-120x120.png');
    this.load.image('naval_ship_light', '/maps/naval-ship-light.png');
    this.load.image('naval_ship_medium', '/maps/naval-ship-medium.png');
    this.load.image('naval_ship_heavy', '/maps/naval-ship-heavy.png');
  }

  create() {
    const { tileSize, cols, rows } = this.cfg;
    this.worldWidth = cols * tileSize;
    this.worldHeight = rows * tileSize;

    const desiredKey = this.cfg.mapKey ?? '';
    let normalizedKey = desiredKey;
    if (desiredKey.includes('redsoil')) normalizedKey = 'redsoil-rift';
    if (desiredKey.includes('sea')) normalizedKey = 'sea-island';
    const desiredIndex = this.mapVariants.findIndex((m) => m.key === normalizedKey);
    if (desiredIndex >= 0) this.mapIndex = desiredIndex;
    this.buildMap();
    this.setupCamera();
    this.setupInput();
    this.buildHud();
    this.buildMarkers();
    this.applyNavalPlaceholderTextures();
    this.buildUnits();
    this.setupMiniMapCanvas();
    this.textures.get('air_fighter_light')?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('air_fighter_medium')?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('air_fighter_heavy')?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.emitCredits();
    this.emitBaseQueue();
    this.emitFactoryQueue();
    this.emitAirFactoryQueue();
    this.emitNavalFactoryQueue();
    this.sceneReady = true;
    this.events.emit('sceneReady');
    this.events.once('shutdown', () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this.onWindowKeyDown);
        window.removeEventListener('keyup', this.onWindowKeyUp);
      }
      this.keyState.clear();
    });

  }

  private applyNavalPlaceholderTextures() {
    const defs: Array<{ key: string; size: number; fill: number; border: number }> = [
      { key: 'factory_naval_1', size: 256, fill: 0x4aaed8, border: 0x1e5b78 },
      { key: 'factory_naval_2', size: 256, fill: 0x3f97bf, border: 0x1a4f68 },
      { key: 'factory_naval_3', size: 256, fill: 0x347fa7, border: 0x17475d },
      { key: 'tower_coastal', size: 256, fill: 0x63bcd8, border: 0x275f73 },
      { key: 'naval_ship_light', size: 48, fill: 0x79d5f0, border: 0x2e6a80 },
      { key: 'naval_ship_medium', size: 58, fill: 0x5db7d2, border: 0x255769 },
      { key: 'naval_ship_heavy', size: 66, fill: 0x4898b2, border: 0x1d4655 }
    ];
    defs.forEach((def) => {
      if (this.textures.exists(def.key)) return;
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(def.fill, 1);
      g.fillRect(0, 0, def.size, def.size);
      g.lineStyle(Math.max(2, Math.floor(def.size * 0.08)), def.border, 1);
      g.strokeRect(0, 0, def.size, def.size);
      g.fillStyle(0xffffff, 0.18);
      g.fillRect(
        Math.floor(def.size * 0.12),
        Math.floor(def.size * 0.12),
        Math.floor(def.size * 0.76),
        Math.floor(def.size * 0.18)
      );
      g.generateTexture(def.key, def.size, def.size);
      g.destroy();
      this.textures.get(def.key)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    });
  }

  private buildMap() {
    const { tileSize, cols, rows } = this.cfg;
    this.blocked = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
    this.tileTypes = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
    this.shallowWaterMask = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
    this.seaDeepLayer = [];
    this.seaShallowLayer = [];
    this.seaWaveLayer = [];
    this.crowdCost = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
    const rng = this.makeRng(this.mapSeed);

    const makeStringGrid = (fill = '') =>
      Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));

    let baseGrid = makeStringGrid('tile_grass_01');
    const forestGrid = makeStringGrid();
    const resourceGrid = makeStringGrid();
    const canyonGrid = makeStringGrid();
    const canyonEdgeGrid = makeStringGrid();
    const canyonShadowGrid = makeStringGrid();
    const bridgeGrid = makeStringGrid();
    const rampGrid = makeStringGrid();

    const setTileType = (x: number, y: number, type: number) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      this.tileTypes[y][x] = type;
    };

    const placeForestRect = (x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          forestGrid[y][x] = 'tree_canopy_tile';
          setTileType(x, y, 1);
          this.blocked[y][x] = true;
        }
      }
    };

    this.resourceNodes = [];
    const placeResource = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      resourceGrid[y][x] = 'resource_pit_tile';
      setTileType(x, y, 2);
      this.blocked[y][x] = false;
      this.resourceNodes.push({
        x,
        y,
        extractorOwner: null,
        extractorLevel: 1,
        upgrading: false,
        upgradeProgress: 0,
        buildProgress: 0,
        buildTeam: null
      });
    };

    const worldW = cols * tileSize;
    const worldH = rows * tileSize;
    const maxTex = (this.game.renderer as any).getMaxTextureSize?.() ?? 2048;
    const safeMax = Math.max(512, maxTex - 16);
    const segH = worldH > safeMax ? safeMax : worldH;
    const segments = Math.ceil(worldH / segH);

    function drawLayer(grid: string[][], depth: number) {
      const rts: Phaser.GameObjects.RenderTexture[] = [];
      for (let i = 0; i < segments; i++) {
        const yOff = i * segH;
        const h = Math.min(segH, worldH - yOff);
        const rt = this.add.renderTexture(0, yOff, worldW, h);
        rt.setDepth(depth);
        rt.setOrigin(0, 0);
        const startRow = Math.floor(yOff / tileSize);
        const endRow = Math.min(rows - 1, Math.floor((yOff + h) / tileSize));
        for (let y = startRow; y <= endRow; y++) {
          for (let x = 0; x < cols; x++) {
            const key = grid[y][x];
            if (!key) continue;
            rt.draw(key, x * tileSize + tileSize / 2, y * tileSize + tileSize / 2 - yOff);
          }
        }
        rts.push(rt);
      }
      return rts;
    }

    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    if (mapKey === 'grasslands') {
      // 草地战场：三分区 + 中区三条通道（直的长方形通道）
      const topEnd = Math.floor(rows / 3) - 1;
      const midStart = topEnd + 1;
      const midEnd = Math.floor((rows * 2) / 3) - 1;
      const bottomStart = midEnd + 1;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const roll = rng();
          baseGrid[y][x] = roll > 0.85 ? 'tile_grass_02' : roll > 0.7 ? 'tile_grass_03' : 'tile_grass_01';
        }
      }

      placeForestRect(0, midStart, cols, midEnd - midStart + 1);
      const corridorWidth = 6;
      const corridor1X = Math.floor(cols * 0.2);
      const corridor2X = Math.floor(cols * 0.5) - Math.floor(corridorWidth / 2);
      const corridor3X = Math.floor(cols * 0.8);
      const clearVerticalCorridor = (x0: number) => {
        for (let y = midStart; y <= midEnd; y++) {
          for (let x = x0; x < x0 + corridorWidth; x++) {
            if (x < 0 || x >= cols) continue;
            forestGrid[y][x] = '';
            setTileType(x, y, 0);
            this.blocked[y][x] = false;
          }
        }
      };
      clearVerticalCorridor(corridor1X);
      clearVerticalCorridor(corridor2X);
      clearVerticalCorridor(corridor3X);

      const plannedResources = this.cfg.resourcePoints ?? [];
      if (plannedResources.length > 0) {
        plannedResources.forEach((pt) => placeResource(pt.x, pt.y));
      } else {
        const placeRowResources = (y: number) => {
          placeResource(Math.floor(cols * 0.2), y);
          placeResource(Math.floor(cols * 0.5), y);
          placeResource(Math.floor(cols * 0.8), y);
        };
        placeRowResources(Math.floor(topEnd * 0.5));
        placeRowResources(Math.floor((bottomStart + rows - 1) * 0.5));
        placeResource(corridor1X + Math.floor(corridorWidth / 2), Math.floor((midStart + midEnd) * 0.5));
        placeResource(corridor2X + Math.floor(corridorWidth / 2), Math.floor((midStart + midEnd) * 0.5));
        placeResource(corridor3X + Math.floor(corridorWidth / 2), Math.floor((midStart + midEnd) * 0.5));
      }
    } else if (mapKey === 'redsoil-rift') {
      // 赤土裂谷：左右红土对称，中间笔直裂谷，上方桥口
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          baseGrid[y][x] = (x + y) % 7 === 0 ? 'tile_dirt_02' : 'tile_dirt_01';
        }
      }

      const canyon = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
      const canyonWidth = 8;
      const centerX = Math.floor(cols / 2);
      const canyonLeft = centerX - Math.floor(canyonWidth / 2);
      const canyonRight = canyonLeft + canyonWidth - 1;
      for (let y = 0; y < rows; y++) {
        for (let x = canyonLeft; x <= canyonRight; x++) {
          canyon[y][x] = true;
        }
      }

      const bridgeSpecs = [
        { y: Phaser.Math.Clamp(Math.floor(rows * 0.22), 2, rows - 3), width: canyonWidth, thickness: 3 },
        // 中桥桥体扩大：更宽、更厚，强化主战场感
        { y: Phaser.Math.Clamp(Math.floor(rows * 0.5), 2, rows - 3), width: canyonWidth + 8, thickness: 5 },
        { y: Phaser.Math.Clamp(Math.floor(rows * 0.78), 2, rows - 3), width: canyonWidth, thickness: 3 }
      ];
      const plannedResources = this.cfg.resourcePoints ?? [];

      bridgeSpecs.forEach(({ y: bridgeY, width: bridgeWidth, thickness }) => {
        const bridgeCenter = centerX;
        const bridgeLeft = bridgeCenter - Math.floor(bridgeWidth / 2);
        const bridgeRight = bridgeLeft + bridgeWidth - 1;
        const halfThickness = Math.floor(thickness / 2);
        const bridgeRows = Array.from({ length: thickness }, (_, idx) => bridgeY - halfThickness + idx).filter(
          (y) => y >= 0 && y < rows
        );
        bridgeRows.forEach((row) => {
          for (let x = bridgeLeft; x <= bridgeRight; x++) {
            canyon[row][x] = false;
            bridgeGrid[row][x] = 'bridge_tile';
            setTileType(x, row, 0);
            this.blocked[row][x] = false;
          }
        });
        const leftRamp = bridgeLeft - 1;
        const rightRamp = bridgeRight + 1;
        bridgeRows.forEach((row) => {
          if (leftRamp >= 0) {
            rampGrid[row][leftRamp] = 'canyon_ramp_tile';
            setTileType(leftRamp, row, 0);
            this.blocked[row][leftRamp] = false;
          }
          if (rightRamp < cols) {
            rampGrid[row][rightRamp] = 'canyon_ramp_tile';
            setTileType(rightRamp, row, 0);
            this.blocked[row][rightRamp] = false;
          }
        });

        if (plannedResources.length === 0) {
          placeResource(leftRamp - 1, bridgeY);
          placeResource(rightRamp + 1, bridgeY);
        }
      });

      if (plannedResources.length > 0) {
        plannedResources.forEach((pt) => placeResource(pt.x, pt.y));
      }

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!canyon[y][x]) continue;
          canyonGrid[y][x] = 'canyon_floor_tile';
          setTileType(x, y, 3);
          this.blocked[y][x] = true;
        }
      }

      const isCanyon = (x: number, y: number) => canyon[y]?.[x];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (canyon[y][x]) {
            const hasEdge =
              !isCanyon(x + 1, y) || !isCanyon(x - 1, y) || !isCanyon(x, y + 1) || !isCanyon(x, y - 1);
            if (hasEdge && !bridgeGrid[y][x]) {
              canyonShadowGrid[y][x] = 'canyon_wall_shadow_tile';
            }
          } else {
            const nearCanyon =
              isCanyon(x + 1, y) || isCanyon(x - 1, y) || isCanyon(x, y + 1) || isCanyon(x, y - 1);
            if (nearCanyon) canyonEdgeGrid[y][x] = 'redsoil_crack_edge_tile';
          }
        }
      }
    } else {
      // 海上群岛：三航道岛链，中心咽喉可转线，两侧为基地群岛
      const deepWaterGrid = makeStringGrid('water_deep_tile');
      const shallowWaterGrid = makeStringGrid();
      const shoreEdgeGrid = makeStringGrid();
      const shoreWaveGrid = makeStringGrid();
      baseGrid = makeStringGrid();

      const landMask = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

      const setLand = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;
        landMask[y][x] = true;
      };

      const paintEllipseLand = (cx: number, cy: number, rx: number, ry: number) => {
        for (let y = Math.floor(cy - ry); y <= Math.floor(cy + ry); y++) {
          if (y < 0 || y >= rows) continue;
          for (let x = Math.floor(cx - rx); x <= Math.floor(cx + rx); x++) {
            if (x < 0 || x >= cols) continue;
            const nx = (x - cx) / Math.max(1, rx);
            const ny = (y - cy) / Math.max(1, ry);
            if (nx * nx + ny * ny <= 1) setLand(x, y);
          }
        }
      };

      const fillLandRect = (x0: number, y0: number, w: number, h: number) => {
        for (let y = y0; y < y0 + h; y++) {
          for (let x = x0; x < x0 + w; x++) setLand(x, y);
        }
      };

      const carveWaterRect = (x0: number, y0: number, w: number, h: number, gapX0?: number, gapX1?: number) => {
        for (let y = y0; y < y0 + h; y++) {
          if (y < 0 || y >= rows) continue;
          for (let x = x0; x < x0 + w; x++) {
            if (x < 0 || x >= cols) continue;
            if (gapX0 != null && gapX1 != null && x >= gapX0 && x <= gapX1) continue;
            landMask[y][x] = false;
          }
        }
      };

      // 双方主基地岛
      paintEllipseLand(20, Math.floor(rows * 0.5), 18, 14);
      paintEllipseLand(cols - 21, Math.floor(rows * 0.5), 18, 14);
      // 中央岛链（上中下）
      paintEllipseLand(Math.floor(cols * 0.5), Math.floor(rows * 0.24), 10, 7);
      paintEllipseLand(Math.floor(cols * 0.5), Math.floor(rows * 0.5), 14, 11);
      paintEllipseLand(Math.floor(cols * 0.5), Math.floor(rows * 0.76), 10, 7);
      // 两侧中继小岛
      paintEllipseLand(Math.floor(cols * 0.32), Math.floor(rows * 0.5), 8, 6);
      paintEllipseLand(Math.floor(cols * 0.68), Math.floor(rows * 0.5), 8, 6);

      // 三条主航道（上/中/下）
      fillLandRect(30, 14, cols - 60, 6);
      fillLandRect(30, 33, cols - 60, 7);
      fillLandRect(30, 52, cols - 60, 6);

      // 两条海峡，保留中心转线口
      carveWaterRect(24, 24, cols - 48, 6, 56, 70);
      carveWaterRect(24, 43, cols - 48, 6, 56, 70);

      const hasNearLand = (x: number, y: number, radius = 1) => {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            if (landMask[ny][nx]) return true;
          }
        }
        return false;
      };

      const distanceToWater = (x: number, y: number, maxRadius = 4) => {
        for (let r = 1; r <= maxRadius; r++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              if (!landMask[ny][nx]) return r;
            }
          }
        }
        return maxRadius + 1;
      };

      const pickGrass = (x: number, y: number) => {
        const v = (x * 13 + y * 7 + this.mapSeed) % 9;
        return v > 6 ? 'tile_grass_03' : v > 3 ? 'tile_grass_02' : 'tile_grass_01';
      };

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!landMask[y][x]) continue;
          const d = distanceToWater(x, y, 4);
          const isLane = y >= 14 && y <= 57 && x >= 30 && x <= cols - 31;
          if (d <= 1) {
            baseGrid[y][x] = 'tile_dirt_01';
          } else if (d <= 2 || (isLane && d <= 3)) {
            baseGrid[y][x] = (x + y) % 11 === 0 ? 'tile_dirt_02' : 'tile_sand_01';
          } else {
            baseGrid[y][x] = pickGrass(x, y);
          }
          setTileType(x, y, 0);
        }
      }

      const distanceToLand = (x: number, y: number, maxRadius = 8) => {
        for (let r = 1; r <= maxRadius; r++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              if (landMask[ny][nx]) return r;
            }
          }
        }
        return maxRadius + 1;
      };

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (landMask[y][x]) continue;
          const dist = distanceToLand(x, y, 8);
          // 近岸到中岸统一浅海，远海才切深海（无斑块过渡）
          const useShallow = dist <= 6;
          if (useShallow) {
            shallowWaterGrid[y][x] = 'water_shallow_tile';
            this.shallowWaterMask[y][x] = true;
          } else {
            deepWaterGrid[y][x] = 'water_deep_tile';
          }
          setTileType(x, y, 3);
          this.blocked[y][x] = true;
        }
      }

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (landMask[y][x]) continue;
          const nearLand = hasNearLand(x, y, 1);
          if (!nearLand) continue;
          if (shallowWaterGrid[y][x]) {
            shoreEdgeGrid[y][x] = 'shore_edge_tile';
            shoreWaveGrid[y][x] = 'shore_wave_tile';
          } else {
            shoreWaveGrid[y][x] = 'shore_wave_tile';
          }
        }
      }

      const plannedResources = this.cfg.resourcePoints ?? [];
      if (plannedResources.length > 0) {
        plannedResources.forEach((pt) => placeResource(pt.x, pt.y));
      } else {
        [
          { x: 63, y: 17 },
          { x: 63, y: 55 },
          { x: 63, y: 36 },
          { x: 56, y: 36 },
          { x: 70, y: 36 },
          { x: 26, y: 36 },
          { x: 100, y: 36 }
        ].forEach((pt) => placeResource(pt.x, pt.y));
      }

      const deepRts = drawLayer.call(this, deepWaterGrid, 0);
      const shallowRts = drawLayer.call(this, shallowWaterGrid, 1);
      const landRts = drawLayer.call(this, baseGrid, 2);
      const edgeRts = drawLayer.call(this, shoreEdgeGrid, 3);
      const waveRts = drawLayer.call(this, shoreWaveGrid, 4);
      const resourceRts = drawLayer.call(this, resourceGrid, 5);
      this.seaDeepLayer = deepRts;
      this.seaShallowLayer = shallowRts;
      this.seaWaveLayer = waveRts;
      const container = this.add.container(0, 0, [
        ...deepRts,
        ...shallowRts,
        ...landRts,
        ...edgeRts,
        ...waveRts,
        ...resourceRts
      ]);
      container.setDepth(0);
      this.mapLayer = container;
      this.miniMapDirty = true;
      return;
    }

    const baseRts = drawLayer.call(this, baseGrid, 0);
    const edgeRts = drawLayer.call(this, canyonEdgeGrid, 1);
    const forestRts = drawLayer.call(this, forestGrid, 2);
    const canyonRts = drawLayer.call(this, canyonGrid, 3);
    const shadowRts = drawLayer.call(this, canyonShadowGrid, 4);
    const rampRts = drawLayer.call(this, rampGrid, 5);
    const bridgeRts = drawLayer.call(this, bridgeGrid, 6);
    const resourceRts = drawLayer.call(this, resourceGrid, 7);
    const container = this.add.container(0, 0, [
      ...baseRts,
      ...edgeRts,
      ...forestRts,
      ...canyonRts,
      ...shadowRts,
      ...rampRts,
      ...bridgeRts,
      ...resourceRts
    ]);
    container.setDepth(0);
    this.mapLayer = container;
    this.miniMapDirty = true;
  }

  private updateSeaWaveAnimation() {
    if (this.seaWaveLayer.length === 0) return;
    const t = this.time.now;
    this.seaWaveLayer.forEach((rt, idx) => {
      const baseY = (rt.getData('sea_base_y') as number | undefined) ?? rt.y;
      if (rt.getData('sea_base_y') == null) rt.setData('sea_base_y', baseY);
      const bob = Math.sin(t * 0.0022 + idx * 0.9) * 1.4;
      const alpha = 0.5 + Math.sin(t * 0.002 + idx * 0.7) * 0.16;
      rt.setY(baseY + bob);
      rt.setAlpha(Phaser.Math.Clamp(alpha, 0.3, 0.76));
    });
    this.seaShallowLayer.forEach((rt, idx) => {
      const alpha = 0.94 + Math.sin(t * 0.0016 + idx * 0.55) * 0.05;
      rt.setAlpha(Phaser.Math.Clamp(alpha, 0.84, 1));
    });
    this.seaDeepLayer.forEach((rt, idx) => {
      const alpha = 0.96 + Math.sin(t * 0.0012 + idx * 0.45) * 0.035;
      rt.setAlpha(Phaser.Math.Clamp(alpha, 0.88, 1));
    });
  }

  private buildMarkers() {
    if (!this.resourceNodes.length && !this.cfg.spawnPoints?.length) return;
    this.markerLayer?.destroy();
    this.extractorSprites.forEach((e) => {
      e.sprite.destroy();
      e.label.destroy();
      e.hpBar.destroy();
    });
    this.extractorSprites = [];
    this.resourceMarkers = [];
    const markers: Phaser.GameObjects.GameObject[] = [];
    const makeDot = (x: number, y: number, color: number, size = 8, stroke = 0x0b0f18) => {
      const dot = this.add.circle(x, y, size, color, 0.85);
      dot.setStrokeStyle(2, stroke, 0.9);
      dot.setDepth(6);
      return dot;
    };
    const makeRing = () => {
      const gfx = this.add.graphics();
      gfx.setDepth(7);
      return gfx;
    };
    const makeLabel = (x: number, y: number, text: string, color = '#e9e9ff') => {
      const label = this.add.text(x, y, text, {
        fontSize: '10px',
        color,
        fontFamily: 'monospace'
      });
      label.setDepth(6);
      label.setOrigin(0.5, 0);
      label.setAlpha(0.85);
      return label;
    };
    const resourceColor = (owner: 'player' | 'ai' | null) =>
      owner === 'player' ? 0x6fe2ff : owner === 'ai' ? 0xff6b6b : 0xf4b266;
    this.resourceNodes.forEach((node) => {
      const pos = this.gridToWorld(node.x, node.y);
      const dot = makeDot(pos.x, pos.y, resourceColor(node.extractorOwner), 6, 0x3a2a14);
      dot.setAlpha(0.5);
      const ring = makeRing();
      markers.push(dot, ring);
      this.resourceMarkers.push({ circle: dot, ring, node });

      if (node.extractorOwner) {
        if (!node.extractorLevel) node.extractorLevel = 1;
        const key = node.extractorLevel === 2 ? 'harvester_2' : 'harvester_1';
        const sprite = this.add.image(pos.x, pos.y, key);
        sprite.setDisplaySize(this.getHarvesterSize(), this.getHarvesterSize());
        if (node.extractorOwner === 'ai') sprite.setTint(0xffd6d6);
        sprite.setDepth(4);
        const labelColor = node.extractorOwner === 'ai' ? '#ffb0b0' : '#cfe8ff';
        const label = this.add.text(
          pos.x,
          pos.y - this.cfg.tileSize * 0.8,
          `采集器 T${node.extractorLevel ?? 1}`,
          {
          fontSize: '10px',
          color: labelColor,
          fontFamily: 'monospace'
          }
        );
        label.setOrigin(0.5, 1);
        label.setDepth(9);
        const hpBar = this.add.graphics();
        hpBar.setDepth(9);
        if (node.extractorMaxHp == null) {
          node.extractorMaxHp = 260;
          node.extractorHp = 260;
          node.extractorHpTimer = 0;
        }
        this.extractorSprites.push({ sprite, label, hpBar, node });
      }
    });
    this.cfg.spawnPoints?.forEach((pt) => {
      const pos = this.gridToWorld(pt.x, pt.y);
      const color = pt.team === 'ai' ? 0xff6b6b : pt.team === 'player' ? 0x6fe2ff : 0xb4c3d9;
      const dot = makeDot(pos.x, pos.y, color, 7, 0x0b0f18);
      markers.push(dot);
      const label = makeLabel(pos.x, pos.y + 8, pt.team === 'ai' ? 'AI' : pt.team === 'player' ? 'P1' : 'NPC');
      markers.push(label);
    });
    this.markerLayer = this.add.container(0, 0, markers);
  }


  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldWidth, this.worldHeight);
    cam.setZoom(1);
    cam.centerOn(this.worldWidth / 2, this.worldHeight / 2);
    this.applyViewClamp(cam);
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      cam.setSize(gameSize.width, gameSize.height);
      this.applyViewClamp(cam);
      this.renderMiniMap(cam);
    });
  }

  private setupInput() {
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,Q,E,X,C,B') as typeof this.keys;
    this.input.keyboard?.addCapture(['W', 'A', 'S', 'D', 'Q', 'E', 'X', 'C', 'B']);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onWindowKeyDown);
      window.addEventListener('keyup', this.onWindowKeyUp);
    }
    this.input.mouse?.disableContextMenu();
    const isTouchPointer = (pointer: Phaser.Input.Pointer) => {
      const evt = pointer.event as PointerEvent | TouchEvent | MouseEvent | undefined;
      if (!evt) return false;
      const pointerType = (evt as PointerEvent).pointerType;
      if (typeof pointerType === 'string') {
        return pointerType === 'touch' || pointerType === 'pen';
      }
      return 'touches' in evt;
    };
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.ensureAudioReady();
      this.pointerWasTouch = isTouchPointer(pointer);
      if (pointer.leftButtonDown()) {
        this.selecting = true;
        this.dragStart = {
          x: pointer.x,
          y: pointer.y,
          camX: this.cameras.main.scrollX,
          camY: this.cameras.main.scrollY
        };
      }
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.dragging = true;
        this.dragStart = {
          x: pointer.x,
          y: pointer.y,
          camX: this.cameras.main.scrollX,
          camY: this.cameras.main.scrollY
        };
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.pointerWasTouch) {
        if (!this.dragging) {
          this.handleLeftClick(pointer);
        }
      } else if (this.selecting) {
        const dx = pointer.x - this.dragStart.x;
        const dy = pointer.y - this.dragStart.y;
        const moved = Math.hypot(dx, dy) > 6;
        if (moved) {
          this.finishSelection(pointer);
        } else {
          this.handleLeftClick(pointer);
        }
      }
      this.selecting = false;
      this.dragging = false;
      this.pointerWasTouch = false;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.pointerWasTouch && this.selecting && pointer.leftButtonDown()) {
        const dx = pointer.x - this.dragStart.x;
        const dy = pointer.y - this.dragStart.y;
        if (Math.hypot(dx, dy) > 10) {
          this.dragging = true;
          this.selecting = false;
        }
      }
      if (!this.pointerWasTouch && this.selecting && pointer.leftButtonDown()) {
        this.drawSelection(pointer);
        return;
      }
      if (!this.dragging) return;
      const cam = this.cameras.main;
      const dx = (this.dragStart.x - pointer.x) / cam.zoom;
      const dy = (this.dragStart.y - pointer.y) / cam.zoom;
      cam.setScroll(this.dragStart.camX + dx, this.dragStart.camY + dy);
    });
  }

  private onWindowKeyDown = (ev: KeyboardEvent) => {
    const key = ev.key.toUpperCase();
    if (['W', 'A', 'S', 'D', 'Q', 'E', 'X', 'C', 'B'].includes(key)) {
      this.keyState.add(key);
    }
  };

  private onWindowKeyUp = (ev: KeyboardEvent) => {
    const key = ev.key.toUpperCase();
    if (['W', 'A', 'S', 'D', 'Q', 'E', 'X', 'C', 'B'].includes(key)) {
      this.keyState.delete(key);
    }
  };

  private buildHud() {
    this.hudText = this.add.text(16, 16, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#9bb3d4'
    });
    this.hudText.setBackgroundColor('rgba(11,15,24,0.7)');
    this.hudText.setPadding(6, 4);
    this.hudText.setDepth(30);
    this.hudText.setScrollFactor(0);
    this.refreshHud();
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer) {
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;
    if (this.buildMode) {
      let placed = false;
      const node = this.findResourceNodeAt(worldX, worldY);
      if (node && this.buildType === 'extractor') {
        placed = this.startBuildExtractor(node);
      }
      if (this.buildType === 'factory_ground') {
        placed = this.startBuildFactory(worldX, worldY);
      }
      if (this.buildType === 'factory_air') {
        placed = this.startBuildAirFactory(worldX, worldY);
      }
      if (this.buildType === 'factory_naval') {
        placed = this.startBuildNavalFactory(worldX, worldY);
      }
      if (
        this.buildType === 'tower_ground' ||
        this.buildType === 'tower_air' ||
        this.buildType === 'tower_coastal' ||
        this.buildType === 'tower_hybrid'
      ) {
        placed = this.startBuildTower(worldX, worldY, this.buildType);
      }
      if (placed) {
        this.buildMode = false;
        this.buildType = null;
        this.events.emit('buildMode', false);
        this.events.emit('buildMenu', null);
      }
      return;
    }
    const extractorHit = this.findExtractorAt(worldX, worldY);
    if (extractorHit) {
      this.selectedExtractor = extractorHit;
      this.selectUnits([]);
      this.emitSelection();
      return;
    }
    const hit = this.units.find((unit) => unit.team === 'player' && unit.body.getBounds().contains(worldX, worldY));
    if (hit) {
      if (this.selectedUnits.length === 1 && this.selectedUnits[0] === hit) {
        this.selectUnits([]);
      } else {
        this.selectUnits([hit]);
      }
      return;
    }
    if (this.selectedUnits.length > 0) {
      const enemyUnit = this.findEnemyUnitAt(worldX, worldY, 'player');
      if (enemyUnit) {
        this.issueAttackOrderToUnit(enemyUnit);
        return;
      }
      const enemyExtractor = this.findEnemyExtractorAt(worldX, worldY, 'player');
      if (enemyExtractor) {
        this.issueAttackOrderToExtractor(enemyExtractor);
        return;
      }
    }
    if (this.selectedUnits.length > 0) {
      const movable = this.selectedUnits.filter((unit) => this.isMovablePlayerUnit(unit));
      if (movable.length === 0) {
        this.selectedExtractor = null;
        this.selectUnits([]);
        return;
      }
      const containsDeckRole = this.selectedUnits.some((u) => this.isCommandDeckRole(u.role));
      if (containsDeckRole) {
        this.selectedExtractor = null;
        this.selectUnits([]);
        return;
      }
      this.clearSelectedAttackOrders();
      const target = new Phaser.Math.Vector2(worldX, worldY);
      this.assignFormationTargets(target, movable);
      return;
    }
    this.selectedExtractor = null;
    this.selectUnits([]);
  }

  private isAttackCapable(unit: (typeof this.units)[number]) {
    return (
      unit.damage > 0 &&
      (unit.role === 'tank' ||
        unit.role === 'air_fighter' ||
        unit.role === 'naval_ship' ||
        unit.role === 'tower_ground' ||
        unit.role === 'tower_air' ||
        unit.role === 'tower_coastal' ||
        unit.role === 'tower_hybrid')
    );
  }

  private isMovablePlayerUnit(unit: (typeof this.units)[number]) {
    return (
      unit.team === 'player' &&
      unit.hp > 0 &&
      !unit.locked &&
      (unit.role === 'tank' || unit.role === 'engineer' || unit.role === 'air_fighter' || unit.role === 'naval_ship')
    );
  }

  private isCommandDeckRole(role: UnitRole) {
    return role === 'engineer' || role === 'base' || role === 'factory_ground' || role === 'factory_air' || role === 'factory_naval';
  }

  private findEnemyUnitAt(worldX: number, worldY: number, myTeam: 'player' | 'ai') {
    return (
      this.units.find(
        (unit) => unit.team !== myTeam && unit.hp > 0 && unit.body.getBounds().contains(worldX, worldY)
      ) ?? null
    );
  }

  private findEnemyExtractorAt(worldX: number, worldY: number, myTeam: 'player' | 'ai') {
    const radius = this.cfg.tileSize * 0.9;
    for (const node of this.resourceNodes) {
      if (!node.extractorOwner || node.extractorOwner === myTeam) continue;
      if ((node.extractorHp ?? 0) <= 0) continue;
      const pos = this.gridToWorld(node.x, node.y);
      const dx = pos.x - worldX;
      const dy = pos.y - worldY;
      if (dx * dx + dy * dy <= radius * radius) return node;
    }
    return null;
  }

  private clearSelectedAttackOrders() {
    this.selectedUnits.forEach((unit) => {
      unit.forcedTargetUnitId = undefined;
      unit.forcedTargetNodeKey = undefined;
    });
  }

  private issueAttackOrderToUnit(target: (typeof this.units)[number]) {
    const attackers = this.selectedUnits.filter((unit) => unit.team === 'player' && this.isAttackCapable(unit));
    if (attackers.length === 0) return;
    attackers.forEach((unit) => {
      unit.forcedTargetUnitId = target.id;
      unit.forcedTargetNodeKey = undefined;
    });
    this.lastAttackPing = {
      x: target.body.x,
      y: target.body.y,
      until: this.time.now + 1200
    };
  }

  private issueAttackOrderToExtractor(target: (typeof this.resourceNodes)[number]) {
    const attackers = this.selectedUnits.filter((unit) => unit.team === 'player' && this.isAttackCapable(unit));
    if (attackers.length === 0) return;
    const key = `${target.x},${target.y}`;
    const pos = this.gridToWorld(target.x, target.y);
    attackers.forEach((unit) => {
      unit.forcedTargetNodeKey = key;
      unit.forcedTargetUnitId = undefined;
    });
    this.lastAttackPing = {
      x: pos.x,
      y: pos.y,
      until: this.time.now + 1200
    };
  }

  private canAttackUnit(attacker: (typeof this.units)[number], target: (typeof this.units)[number]) {
    if (attacker.team === target.team || target.hp <= 0) return false;
    if (attacker.role === 'tank' && target.role === 'air_fighter') return false;
    if (attacker.role === 'tank' && target.role === 'naval_ship') return false;
    if (attacker.role === 'engineer' && target.role === 'naval_ship') return false;
    if (attacker.role === 'naval_ship' && target.role === 'air_fighter') return false;
    if (attacker.role === 'tower_ground' && target.role === 'air_fighter') return false;
    if (attacker.role === 'tower_air' && target.role !== 'air_fighter') return false;
    if (attacker.role === 'tower_coastal' && target.role !== 'naval_ship') return false;
    return true;
  }

  private resolveForcedTarget(unit: (typeof this.units)[number]) {
    if (unit.forcedTargetUnitId) {
      const forcedUnit = this.units.find((u) => u.id === unit.forcedTargetUnitId && u.hp > 0);
      if (forcedUnit && forcedUnit.team !== unit.team) {
        return { targetPos: new Phaser.Math.Vector2(forcedUnit.body.x, forcedUnit.body.y), targetUnit: forcedUnit };
      }
      unit.forcedTargetUnitId = undefined;
    }
    if (unit.forcedTargetNodeKey) {
      const node = this.resourceNodes.find((n) => `${n.x},${n.y}` === unit.forcedTargetNodeKey);
      if (node && node.extractorOwner && node.extractorOwner !== unit.team && (node.extractorHp ?? 0) > 0) {
        return { targetPos: this.gridToWorld(node.x, node.y), targetNode: node };
      }
      unit.forcedTargetNodeKey = undefined;
    }
    return null;
  }

  private updateForcedAttackOrders() {
    this.units.forEach((unit) => {
      if (!this.isAttackCapable(unit) || unit.locked) return;
      const forced = this.resolveForcedTarget(unit);
      if (!forced) return;
      if (
        unit.role === 'tower_ground' ||
        unit.role === 'tower_air' ||
        unit.role === 'tower_coastal' ||
        unit.role === 'tower_hybrid' ||
        unit.role === 'base' ||
        unit.role === 'factory_ground' ||
        unit.role === 'factory_air' ||
        unit.role === 'factory_naval'
      )
        return;
      const dx = forced.targetPos.x - unit.body.x;
      const dy = forced.targetPos.y - unit.body.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= unit.range * 0.88) {
        unit.target = undefined;
        unit.path = undefined;
        unit.pathIndex = 0;
        return;
      }
      if (unit.path && unit.path.length > 0) return;
      if (this.isLineClear(unit.body, forced.targetPos, unit.role === 'air_fighter', unit)) {
        unit.target = forced.targetPos;
        unit.path = [forced.targetPos];
        unit.pathIndex = 0;
      } else {
        const path = this.findPath(unit.body, forced.targetPos, unit.role === 'air_fighter', unit);
        unit.path = path && path.length > 0 ? path : [forced.targetPos];
        unit.target = forced.targetPos;
        unit.pathIndex = 0;
      }
    });
  }

  private renderAttackOrders() {
    const gfx = this.attackOrderGfx;
    if (!gfx) return;
    gfx.clear();
    const now = this.time.now;
    if (this.lastAttackPing && now <= this.lastAttackPing.until) {
      const pulse = 0.8 + Math.sin(now * 0.016) * 0.2;
      const r = 14 + Math.sin(now * 0.012) * 2;
      gfx.lineStyle(2, 0xff5b5b, pulse);
      gfx.strokeCircle(this.lastAttackPing.x, this.lastAttackPing.y, r);
      gfx.lineBetween(this.lastAttackPing.x - 8, this.lastAttackPing.y, this.lastAttackPing.x + 8, this.lastAttackPing.y);
      gfx.lineBetween(this.lastAttackPing.x, this.lastAttackPing.y - 8, this.lastAttackPing.x, this.lastAttackPing.y + 8);
    }

    this.selectedUnits.forEach((unit) => {
      if (!this.isAttackCapable(unit)) return;
      const forced = this.resolveForcedTarget(unit);
      if (!forced) return;
      gfx.lineStyle(1.5, 0xff7c6a, 0.55);
      gfx.lineBetween(unit.body.x, unit.body.y, forced.targetPos.x, forced.targetPos.y);
      gfx.lineStyle(2, 0xff6b6b, 0.85);
      gfx.strokeCircle(forced.targetPos.x, forced.targetPos.y, 10);
    });
  }

  private selectUnits(units: typeof this.units) {
    this.selectedUnits.forEach((unit) => {
      if (unit.body instanceof Phaser.GameObjects.Rectangle) {
        unit.body.setStrokeStyle(2, 0x0b0f18, 0.9);
      } else {
        unit.body.clearTint();
      }
      unit.airSelectRing?.clear();
    });
    this.selectedUnits = units;
    this.selectedUnits.forEach((unit) => {
      if (unit.body instanceof Phaser.GameObjects.Rectangle) {
        unit.body.setStrokeStyle(2, 0x6fe2ff, 1);
      } else {
        if (
          unit.role === 'tower_ground' ||
          unit.role === 'tower_air' ||
          unit.role === 'tower_hybrid'
        ) {
          unit.body.clearTint();
        } else {
          unit.body.setTint(0x6fe2ff);
        }
      }
      unit.airSelectRing?.clear();
    });
    if (this.selectedUnits.length === 0) this.buildMode = false;
    if (this.selectedUnits.length > 0) this.selectedExtractor = null;
    this.emitSelection();
  }

  private buildUnits() {
    this.units.forEach((unit) => {
      unit.body.destroy();
      unit.shadow?.destroy();
      unit.airSelectRing?.destroy();
      unit.attackRangeRing?.destroy();
    });
    this.units = [];
    this.selectedUnits = [];
    this.previewGfx?.destroy();
    this.previewGfx = this.add.graphics();
    this.previewGfx.setDepth(5);
    this.bulletGfx?.destroy();
    this.bulletGfx = this.add.graphics();
    this.bulletGfx.setDepth(6);
    this.selectionGfx?.destroy();
    this.selectionGfx = this.add.graphics();
    this.selectionGfx.setDepth(20);
    this.buildPreviewGfx?.destroy();
    this.buildPreviewGfx = this.add.graphics();
    this.buildPreviewGfx.setDepth(21);
    this.buildPreviewSprite?.destroy();
    this.buildPreviewSprite = undefined;
    this.buildSiteGfx?.destroy();
    this.buildSiteGfx = this.add.graphics();
    this.buildSiteGfx.setDepth(22);
    this.buildBeamGfx?.destroy();
    this.buildBeamGfx = this.add.graphics();
    this.buildBeamGfx.setDepth(23);
    this.attackOrderGfx?.destroy();
    this.attackOrderGfx = this.add.graphics();
    this.attackOrderGfx.setDepth(24);
    this.selectionMarkerGfx?.destroy();
    this.selectionMarkerGfx = this.add.graphics();
    this.selectionMarkerGfx.setDepth(25);
    this.commandPathGfx?.destroy();
    this.commandPathGfx = this.add.graphics();
    this.commandPathGfx.setDepth(19);
    this.moveCommandPreview = [];

    const spawnPoints = this.cfg.spawnPoints?.length
      ? this.cfg.spawnPoints
      : [
          { x: Math.floor(this.cfg.cols / 2), y: Math.floor(this.cfg.rows * 0.2), team: 'player' as const },
          { x: Math.floor(this.cfg.cols / 2), y: Math.floor(this.cfg.rows * 0.8), team: 'ai' as const }
        ];

    let aiDefensePlaced = false;
    spawnPoints.forEach((pt) => {
      if (pt.team === 'neutral') return;
      if (pt.team === 'player') return;
      this.spawnUnit(pt.team, 'base', { x: pt.x, y: pt.y });
      const aiNear = this.findFreeSpawnNear(pt.x, pt.y);
      this.spawnUnit(pt.team, 'engineer', aiNear ?? { x: pt.x, y: pt.y });
      if (!aiDefensePlaced) {
        this.placeInitialBaseDefenseTower(pt.team, { x: pt.x, y: pt.y });
        aiDefensePlaced = true;
      }
    });

    // spawn player base at spawn first
    const baseSpawn = this.findSpawnPoint('player');
    this.spawnUnit('player', 'base', { x: baseSpawn.x, y: baseSpawn.y });
    // spawn a starting engineer near base
    const near = this.findFreeSpawnNear(baseSpawn.x, baseSpawn.y);
    this.spawnUnit('player', 'engineer', near ?? { x: baseSpawn.x, y: baseSpawn.y });
    this.placeInitialBaseDefenseTower('player', { x: baseSpawn.x, y: baseSpawn.y });
  }

  private placeInitialBaseDefenseTower(team: 'player' | 'ai', baseGrid: { x: number; y: number }) {
    const existing = this.units.find(
      (u) =>
        u.team === team &&
        u.isInitialDefense &&
        u.hp > 0 &&
        (u.role === 'tower_ground' || u.role === 'tower_air' || u.role === 'tower_coastal' || u.role === 'tower_hybrid')
    );
    if (existing) return;
    const enemyTeam: 'player' | 'ai' = team === 'player' ? 'ai' : 'player';
    const enemySpawn = this.findSpawnPoint(enemyTeam);
    const dx = Phaser.Math.Clamp(Math.sign(enemySpawn.x - baseGrid.x), -1, 1);
    const dy = Phaser.Math.Clamp(Math.sign(enemySpawn.y - baseGrid.y), -1, 1);
    const anchorX = Phaser.Math.Clamp(baseGrid.x + dx * 3, 0, this.cfg.cols - 1);
    const anchorY = Phaser.Math.Clamp(baseGrid.y + dy * 3, 0, this.cfg.rows - 1);
    const cell = this.findFreeBuildCellNear(anchorX, anchorY, 4, this.getBuildFootprintSize('tower_ground'));
    if (!cell) return;
    const cellWorld = this.gridToWorld(cell.x, cell.y);
    const enemyWorld = this.gridToWorld(enemySpawn.x, enemySpawn.y);
    const angle = Phaser.Math.Angle.Between(cellWorld.x, cellWorld.y, enemyWorld.x, enemyWorld.y);
    const facingIndex = this.normalizeTowerFacingIndex(Math.round((angle - Math.PI / 2) / (Math.PI / 2)));
    this.spawnUnit(team, 'tower_ground', { x: cell.x, y: cell.y }, { towerFacingIndex: facingIndex, isInitialDefense: true });
  }

  private setupMiniMapCanvas() {
    const canvas = this.cfg.miniMapCanvas ?? null;
    if (!canvas) return;
    this.miniMapCanvas = canvas;
    this.miniMapCtx = canvas.getContext('2d');
    this.miniMapDirty = true;
    this.renderMiniMap(this.cameras.main);
  }

  private buildMiniMap() {
    this.miniMapDirty = true;
    this.renderMiniMap(this.cameras.main);
  }

  private renderMiniMap(cam: Phaser.Cameras.Scene2D.Camera) {
    if (!this.miniMapCanvas || !this.miniMapCtx) return;
    const screenW = this.scale.width || cam.width;
    const screenH = this.scale.height || cam.height;
    if (!screenW || !screenH) return;

    const percent = this.cfg.miniMapPercent ?? 0.18;
    const maxWidth = this.cfg.miniMapWidth ?? 220;
    const maxHeight = this.cfg.miniMapHeight ?? 140;
    const aspect = this.worldWidth / this.worldHeight;
    let w = screenW * percent;
    let h = Math.round(w / aspect);
    if (h > screenH * percent) {
      h = screenH * percent;
      w = Math.round(h * aspect);
    }
    if (w > maxWidth || h > maxHeight) {
      const fitW = Math.min(w, maxWidth);
      const fitH = Math.min(h, maxHeight);
      w = fitW;
      h = Math.round(w / aspect);
      if (h > fitH) {
        h = fitH;
        w = Math.round(h * aspect);
      }
    }
    w = Math.max(40, Math.floor(w));
    h = Math.max(40, Math.floor(h));
    this.miniMapSize = { w, h };

    if (this.miniMapCanvas.width !== w || this.miniMapCanvas.height !== h) {
      this.miniMapCanvas.width = w;
      this.miniMapCanvas.height = h;
      this.miniMapDirty = true;
    }

    if (this.miniMapDirty) {
      const base = document.createElement('canvas');
      base.width = w;
      base.height = h;
      const bctx = base.getContext('2d');
      if (bctx) {
        for (let row = 0; row < this.tileTypes.length; row++) {
          for (let col = 0; col < this.tileTypes[row].length; col++) {
            const type = this.tileTypes[row][col];
            const color =
              type === 3 ? '#2b1a16' : type === 2 ? '#f4b266' : type === 1 ? '#2e4a2d' : '#4c6b3f';
            const px = (col / this.cfg.cols) * w;
            const py = (row / this.cfg.rows) * h;
            bctx.fillStyle = color;
            bctx.fillRect(px, py, Math.ceil(w / this.cfg.cols) + 1, Math.ceil(h / this.cfg.rows) + 1);
          }
        }
      }
      this.miniMapBase = base;
      this.miniMapDirty = false;
    }

    const ctx = this.miniMapCtx;
    ctx.clearRect(0, 0, w, h);
    if (this.miniMapBase) ctx.drawImage(this.miniMapBase, 0, 0);
    // draw planned resources/spawns on minimap
    const drawPoint = (x: number, y: number, color: string, size = 4, shape: 'circle' | 'square' = 'circle') => {
      const px = (x / this.cfg.cols) * w;
      const py = (y / this.cfg.rows) * h;
      ctx.fillStyle = color;
      if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(px, py, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
    };
    this.resourceNodes.forEach((node) => {
      const color = node.extractorOwner === 'player' ? '#6fe2ff' : node.extractorOwner === 'ai' ? '#ff6b6b' : '#ffd36a';
      drawPoint(node.x, node.y, color, 4, 'circle');
    });
    this.cfg.spawnPoints?.forEach((pt) => {
      const color = pt.team === 'ai' ? '#ff6b6b' : pt.team === 'player' ? '#6fe2ff' : '#b4c3d9';
      drawPoint(pt.x, pt.y, color, 5, 'square');
    });
    ctx.strokeStyle = '#76d0ff';
    ctx.lineWidth = 1;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const viewX = cam.scrollX;
    const viewY = cam.scrollY;
    const vx = (viewX / this.worldWidth) * w;
    const vy = (viewY / this.worldHeight) * h;
    const vw = (viewW / this.worldWidth) * w;
    const vh = (viewH / this.worldHeight) * h;
    ctx.strokeRect(vx, vy, vw, vh);
  }

  private applyViewClamp(cam: Phaser.Cameras.Scene2D.Camera) {
    const percent = this.cfg.viewPercent ?? 1;
    if (percent <= 0 || percent >= 1) return;
    const minZoomX = cam.width / (this.worldWidth * percent);
    const minZoomY = cam.height / (this.worldHeight * percent);
    const minZoom = Math.max(minZoomX, minZoomY);
    if (cam.zoom < minZoom) {
      cam.setZoom(minZoom);
      cam.centerOn(this.worldWidth / 2, this.worldHeight / 2);
    }
  }

  private refreshHud() {
    const mapName = this.mapVariants[this.mapIndex]?.name ?? '未知';
    this.hudText?.setText([`Map · ${mapName}`, '地图已锁定（机库中选择）']);
  }

  private makeRng(seed: number) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  private computeFormationTargets(center: Phaser.Math.Vector2, selected: typeof this.units) {
    const count = selected.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const spacing = this.cfg.tileSize * 0.9;
    const halfCols = (cols - 1) / 2;
    const halfRows = (rows - 1) / 2;
    const avg = selected.reduce(
      (acc, unit) => ({ x: acc.x + unit.body.x, y: acc.y + unit.body.y }),
      { x: 0, y: 0 }
    );
    const origin = new Phaser.Math.Vector2(avg.x / count, avg.y / count);
    const angle = Phaser.Math.Angle.Between(origin.x, origin.y, center.x, center.y);

    const targets = selected.map((unit, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const localX = (col - halfCols) * spacing;
      const localY = (row - halfRows) * spacing;
      const rotated = Phaser.Math.Rotate({ x: localX, y: localY }, angle);
      const tx = center.x + rotated.x;
      const ty = center.y + rotated.y;
      const clampedX = Phaser.Math.Clamp(tx, this.cfg.tileSize * 0.5, this.worldWidth - this.cfg.tileSize * 0.5);
      const clampedY = Phaser.Math.Clamp(ty, this.cfg.tileSize * 0.5, this.worldHeight - this.cfg.tileSize * 0.5);
      return { unit, point: new Phaser.Math.Vector2(clampedX, clampedY) };
    });
    return { origin, angle, targets };
  }

  private assignFormationTargets(center: Phaser.Math.Vector2, selected: typeof this.units) {
    this.rebuildCrowdCost();
    const layout = this.computeFormationTargets(center, selected);
    this.moveCommandPreview = [];
    const expiresAt = this.time.now + 1200;
    layout.targets.forEach(({ unit, point }) => {
      unit.target = point;
      const canFly = unit.role === 'air_fighter';
      let pathPoints: Phaser.Math.Vector2[] = [];
      if (this.isLineClear(unit.body, point, canFly, unit)) {
        pathPoints = [point];
        unit.path = pathPoints;
      } else {
        const path = this.findPath(unit.body, point, canFly, unit);
        pathPoints = path && path.length > 0 ? path : [point];
        unit.path = pathPoints;
      }
      unit.pathIndex = 0;
      if (pathPoints.length > 0) {
        this.moveCommandPreview.push({
          points: [new Phaser.Math.Vector2(unit.body.x, unit.body.y), ...pathPoints.map((p) => p.clone())],
          expiresAt
        });
      }
    });
  }

  private drawFormationPreview(center: Phaser.Math.Vector2, selected: typeof this.units) {
    if (!this.previewGfx) return;
    const layout = this.computeFormationTargets(center, selected);
    this.previewGfx.clear();
    this.previewGfx.lineStyle(2, 0x76d0ff, 0.8);
    this.previewGfx.strokeCircle(center.x, center.y, this.cfg.tileSize * 0.35);
    this.previewGfx.lineStyle(1, 0x76d0ff, 0.35);
    this.previewGfx.lineBetween(layout.origin.x, layout.origin.y, center.x, center.y);
    this.previewGfx.fillStyle(0x76d0ff, 0.12);
    this.previewGfx.lineStyle(1, 0x76d0ff, 0.65);
    layout.targets.forEach(({ point }) => {
      const size = this.cfg.tileSize * 0.55;
      this.previewGfx.strokeRoundedRect(point.x - size / 2, point.y - size / 2, size, size, 6);
      this.previewGfx.fillRoundedRect(point.x - size / 2, point.y - size / 2, size, size, 6);
    });

    this.previewGfx.lineStyle(2, 0x76d0ff, 0.35);
    layout.targets.forEach(({ unit, point }) => {
      const canFly = unit.role === 'air_fighter';
      const path = this.isLineClear(unit.body, point, canFly, unit)
        ? [point]
        : this.findPath(unit.body, point, canFly, unit) ?? [];
      if (path.length === 0) return;
      this.previewGfx.beginPath();
      this.previewGfx.moveTo(unit.body.x, unit.body.y);
      path.forEach((p) => this.previewGfx.lineTo(p.x, p.y));
      this.previewGfx.strokePath();
    });
  }

  private drawSelection(pointer: Phaser.Input.Pointer) {
    if (!this.selectionGfx) return;
    const cam = this.cameras.main;
    const x0 = (this.dragStart.x / cam.zoom) + cam.scrollX;
    const y0 = (this.dragStart.y / cam.zoom) + cam.scrollY;
    const x1 = pointer.worldX;
    const y1 = pointer.worldY;
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    this.selectionGfx.clear();
    this.selectionGfx.lineStyle(1.5, 0x6fe2ff, 0.9);
    this.selectionGfx.fillStyle(0x6fe2ff, 0.12);
    this.selectionGfx.fillRect(left, top, width, height);
    this.selectionGfx.strokeRect(left, top, width, height);
  }

  private finishSelection(pointer: Phaser.Input.Pointer) {
    if (!this.selectionGfx) return;
    const cam = this.cameras.main;
    const x0 = (this.dragStart.x / cam.zoom) + cam.scrollX;
    const y0 = (this.dragStart.y / cam.zoom) + cam.scrollY;
    const x1 = pointer.worldX;
    const y1 = pointer.worldY;
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const right = Math.max(x0, x1);
    const bottom = Math.max(y0, y1);
    const selected = this.units.filter((unit) => {
      if (unit.team !== 'player') return false;
      const b = unit.body.getBounds();
      return b.centerX >= left && b.centerX <= right && b.centerY >= top && b.centerY <= bottom;
    });
    if (selected.length > 0) {
      this.selectUnits(selected);
    } else {
      this.selectUnits([]);
    }
    this.selectionGfx.clear();
  }

  private isNavalUnit(unit?: (typeof this.units)[number] | null) {
    return !!unit && unit.role === 'naval_ship';
  }

  private isWaterCell(col: number, row: number) {
    return this.tileTypes[row]?.[col] === 3;
  }

  private isShallowWaterCell(col: number, row: number) {
    return !!this.shallowWaterMask[row]?.[col];
  }

  private canRoleOccupyCell(role: UnitRole, col: number, row: number) {
    if (role === 'air_fighter') return true;
    if (role === 'naval_ship') return this.isWaterCell(col, row);
    return !this.blocked[row]?.[col] && !this.isWaterCell(col, row);
  }

  private canUnitOccupyCell(unit: (typeof this.units)[number] | undefined, col: number, row: number) {
    if (!unit) return !this.blocked[row]?.[col];
    return this.canRoleOccupyCell(unit.role, col, row);
  }

  private findPath(
    startBody: { x: number; y: number },
    target: Phaser.Math.Vector2,
    ignoreBlocked = false,
    movingUnit?: (typeof this.units)[number]
  ) {
    if (ignoreBlocked) return [target];
    const start = this.worldToGrid(startBody.x, startBody.y);
    let goal = this.worldToGrid(target.x, target.y);
    if (!start || !goal) return undefined;
    if (!this.canUnitOccupyCell(movingUnit, goal.x, goal.y)) {
      const fallback = this.findNearestWalkable(goal, 6, movingUnit);
      if (!fallback) return undefined;
      goal = fallback;
    }

    const rows = this.blocked.length;
    const cols = this.blocked[0]?.length ?? 0;
    const key = (x: number, y: number) => `${x},${y}`;
    const open: Array<{ x: number; y: number; g: number; f: number }> = [];
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();

    const startKey = key(start.x, start.y);
    gScore.set(startKey, 0);
    open.push({ x: start.x, y: start.y, g: 0, f: this.pathHeuristic(start, goal) });

    const neighbors = [
      { x: 1, y: 0, cost: 1 },
      { x: -1, y: 0, cost: 1 },
      { x: 0, y: 1, cost: 1 },
      { x: 0, y: -1, cost: 1 },
      { x: 1, y: 1, cost: Math.SQRT2 },
      { x: 1, y: -1, cost: Math.SQRT2 },
      { x: -1, y: 1, cost: Math.SQRT2 },
      { x: -1, y: -1, cost: Math.SQRT2 }
    ];

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      if (!current) break;
      if (current.x === goal.x && current.y === goal.y) {
        return this.reconstructPath(cameFrom, key(current.x, current.y));
      }
      const currentKey = key(current.x, current.y);
      for (const n of neighbors) {
        const nx = current.x + n.x;
        const ny = current.y + n.y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (n.x !== 0 && n.y !== 0) {
          if (!this.canUnitOccupyCell(movingUnit, current.x + n.x, current.y)) continue;
          if (!this.canUnitOccupyCell(movingUnit, current.x, current.y + n.y)) continue;
        }
        if (!this.canUnitOccupyCell(movingUnit, nx, ny)) continue;
        const neighborKey = key(nx, ny);
        const crowdPenalty = this.getCrowdPenalty(nx, ny, movingUnit);
        const tentativeG = (gScore.get(currentKey) ?? Infinity) + n.cost + crowdPenalty;
        if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
          cameFrom.set(neighborKey, currentKey);
          gScore.set(neighborKey, tentativeG);
          const f = tentativeG + this.pathHeuristic({ x: nx, y: ny }, goal);
          const existing = open.find((o) => o.x === nx && o.y === ny);
          if (existing) {
            existing.g = tentativeG;
            existing.f = f;
          } else {
            open.push({ x: nx, y: ny, g: tentativeG, f });
          }
        }
      }
    }
    return undefined;
  }

  private reconstructPath(cameFrom: Map<string, string>, currentKey: string) {
    const path: Phaser.Math.Vector2[] = [];
    let key = currentKey;
    while (cameFrom.has(key)) {
      const [x, y] = key.split(',').map((v) => Number(v));
      path.push(this.gridToWorld(x, y));
      const parent = cameFrom.get(key);
      if (!parent) break;
      key = parent;
    }
    return path.reverse();
  }

  private pathHeuristic(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const diag = Math.min(dx, dy);
    const straight = Math.max(dx, dy) - diag;
    return diag * Math.SQRT2 + straight;
  }

  private findNearestWalkable(goal: { x: number; y: number }, maxRadius: number, movingUnit?: (typeof this.units)[number]) {
    const rows = this.blocked.length;
    const cols = this.blocked[0]?.length ?? 0;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = goal.x + dx;
          const ny = goal.y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (this.canUnitOccupyCell(movingUnit, nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  private findNearestWaterCellNear(col: number, row: number, maxRadius: number) {
    for (let r = 0; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = col + dx;
          const ny = row + dy;
          if (nx < 0 || ny < 0 || nx >= this.cfg.cols || ny >= this.cfg.rows) continue;
          if (this.isWaterCell(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  private getCrowdPenalty(col: number, row: number, movingUnit?: (typeof this.units)[number]) {
    let penalty = this.crowdCost[row]?.[col] ?? 0;
    if (!movingUnit) return penalty;
    const selfCell = this.worldToGrid(movingUnit.body.x, movingUnit.body.y);
    if (selfCell && selfCell.x === col && selfCell.y === row) {
      penalty = Math.max(0, penalty - 1.6);
    }
    return penalty;
  }

  private isLineClear(
    startBody: { x: number; y: number },
    target: Phaser.Math.Vector2,
    ignoreBlocked = false,
    movingUnit?: (typeof this.units)[number]
  ) {
    if (ignoreBlocked) return true;
    const start = this.worldToGrid(startBody.x, startBody.y);
    const goal = this.worldToGrid(target.x, target.y);
    if (!start || !goal) return false;
    let x0 = start.x;
    let y0 = start.y;
    const x1 = goal.x;
    const y1 = goal.y;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      if (movingUnit) {
        if (!this.canUnitOccupyCell(movingUnit, x0, y0)) return false;
      } else if (this.blocked[y0]?.[x0]) {
        return false;
      }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
    return true;
  }

  private worldToGrid(x: number, y: number) {
    const col = Math.floor(x / this.cfg.tileSize);
    const row = Math.floor(y / this.cfg.tileSize);
    if (row < 0 || col < 0) return null;
    if (row >= this.cfg.rows || col >= this.cfg.cols) return null;
    return { x: col, y: row };
  }

  private gridToWorld(col: number, row: number) {
    return new Phaser.Math.Vector2(
      col * this.cfg.tileSize + this.cfg.tileSize / 2,
      row * this.cfg.tileSize + this.cfg.tileSize / 2
    );
  }

  private updateResourceEconomy(dt: number) {
    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    if (mapKey !== 'grasslands') {
      this.incomePerSecond = 0;
      return;
    }
    if (this.resourceNodes.length === 0) {
      this.incomePerSecond = 0;
      return;
    }

    const buildTime = 3.5;
    const upgradeTime = 4.5;
    this.resourceNodes.forEach((node) => {
      if (node.extractorOwner) return;
      const pos = this.gridToWorld(node.x, node.y);
      const targetSize = this.getBuildFootprintSize('extractor');
      const buildRadius = this.getBuildInteractionRadius(targetSize);
      const playerBuilder = this.units.find((unit) => {
        if (unit.team !== 'player' || unit.role !== 'engineer') return false;
        if (node.builderId && unit.id !== node.builderId) return false;
        const dx = unit.body.x - pos.x;
        const dy = unit.body.y - pos.y;
        return dx * dx + dy * dy <= buildRadius * buildRadius;
      });
      const aiNear = this.units.some((unit) => {
        if (unit.team !== 'ai' || unit.role !== 'engineer') return false;
        const dx = unit.body.x - pos.x;
        const dy = unit.body.y - pos.y;
        return dx * dx + dy * dy <= buildRadius * buildRadius;
      });

      if (node.buildTeam === null) {
        if (playerBuilder) {
          node.buildTeam = 'player';
          node.builderId = playerBuilder.id;
        } else if (aiNear) node.buildTeam = 'ai';
      }

      const sameTeamNear = node.buildTeam === 'player' ? !!playerBuilder : node.buildTeam === 'ai' ? aiNear : false;
      if (node.buildTeam && sameTeamNear) {
        if (node.buildTeam === 'player' && node.builderId) {
          const builder = this.units.find((u) => u.id === node.builderId);
          if (builder) builder.locked = true;
        }
        node.buildProgress = Math.min(1, node.buildProgress + dt / buildTime);
        if (node.buildProgress >= 1) {
          const cost = 150;
          const canPay = node.buildTeam === 'player' ? this.spendCredits(cost) : true;
          if (canPay) {
            node.extractorOwner = node.buildTeam;
            node.extractorLevel = 1;
            if (node.builderId) {
              const builder = this.units.find((u) => u.id === node.builderId);
              if (builder) builder.locked = false;
            }
            node.buildTeam = null;
            node.buildProgress = 0;
            node.builderId = undefined;
            this.buildMarkers();
          } else {
            node.buildProgress = 0.99;
          }
        }
      } else if (node.buildTeam === 'player' && node.builderId) {
        const builder = this.units.find((u) => u.id === node.builderId);
        if (builder) builder.locked = false;
      }
    });

    // upgrade progress (no engineer required)
    this.resourceNodes.forEach((node) => {
      if (!node.upgrading || node.extractorOwner !== 'player') return;
      node.upgradeProgress = Math.min(1, (node.upgradeProgress ?? 0) + dt / upgradeTime);
      if ((node.upgradeProgress ?? 0) >= 1) {
        const cost = 200;
        if (this.spendCredits(cost)) {
          node.extractorLevel = 2;
          node.upgrading = false;
          node.upgradeProgress = 0;
          this.buildMarkers();
          this.emitSelection();
        } else {
          node.upgradeProgress = 0.99;
        }
      }
    });

    // Economy boost: stronger base income and clearer payoff for extractor upgrades.
    const extractorIncomeLv1 = 2.0;
    const extractorIncomeLv2 = 4.0;
    const baseIncome = 5.0;
    const income = this.resourceNodes
      .filter((n) => n.extractorOwner === 'player')
      .reduce((sum, n) => sum + (n.extractorLevel === 2 ? extractorIncomeLv2 : extractorIncomeLv1), 0);
    const baseAlive = this.units.some((u) => u.role === 'base' && u.team === 'player' && u.hp > 0);
    this.incomePerSecond = income + (baseAlive ? baseIncome : 0);

    this.resourceMarkers.forEach(({ circle, ring, node }) => {
      const owner = node.extractorOwner ?? node.buildTeam;
      const color = owner === 'player' ? 0x6fe2ff : owner === 'ai' ? 0xff6b6b : 0xf4b266;
      const fillAlpha = node.extractorOwner ? 0.85 : node.buildProgress > 0 ? 0.55 : 0.35;
      circle.setFillStyle(color, fillAlpha);
      circle.setStrokeStyle(2, 0x0b0f18, 0.9);

      const pos = this.gridToWorld(node.x, node.y);
      const radius = this.cfg.tileSize * 0.55;
      ring.clear();
      if (node.extractorOwner) {
        ring.lineStyle(2.5, color, 0.9);
        ring.beginPath();
        ring.arc(pos.x, pos.y, radius + 3, -Math.PI / 2, Math.PI * 1.5, false);
        ring.strokePath();
        if (node.upgrading) {
          ring.lineStyle(2.5, 0xffb347, 0.95);
          const start = -Math.PI / 2;
          const end = start + Math.PI * 2 * Phaser.Math.Clamp(node.upgradeProgress ?? 0, 0, 1);
          ring.beginPath();
          ring.arc(pos.x, pos.y, radius + 7, start, end, false);
          ring.strokePath();
        }
      } else if (node.buildProgress > 0) {
        ring.lineStyle(2.5, color, 0.9);
        const start = -Math.PI / 2;
        const end = start + Math.PI * 2 * Phaser.Math.Clamp(node.buildProgress, 0, 1);
        ring.beginPath();
        ring.arc(pos.x, pos.y, radius + 3, start, end, false);
        ring.strokePath();
      }
    });
  }

  private updateAiResourceTargets() {
    if (this.resourceNodes.length === 0) return;
    const candidates = this.resourceNodes.filter((node) => node.extractorOwner !== 'ai');
    if (candidates.length === 0) return;

    this.units.forEach((unit) => {
      if (unit.team !== 'ai') return;
      const currentKey = unit.aiTargetKey;
      const currentNode = currentKey
        ? this.resourceNodes.find((n) => `${n.x},${n.y}` === currentKey)
        : null;
      const needsNew =
        !currentNode ||
        currentNode.extractorOwner === 'ai' ||
        (unit.path && unit.path.length > 0 && unit.pathIndex >= unit.path.length - 1);

      if (!needsNew) return;

      let bestNode: typeof this.resourceNodes[number] | null = null;
      let bestDist = Infinity;
      candidates.forEach((node) => {
        const pos = this.gridToWorld(node.x, node.y);
        const dx = pos.x - unit.body.x;
        const dy = pos.y - unit.body.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestNode = node;
        }
      });

      if (!bestNode) return;
      const target = this.gridToWorld(bestNode.x, bestNode.y);
      unit.aiTargetKey = `${bestNode.x},${bestNode.y}`;
      const path = this.findPath(unit.body, target, unit.role === 'air_fighter', unit);
      if (path && path.length > 0) {
        unit.path = path;
        unit.pathIndex = 0;
      } else {
        unit.target = target;
        unit.path = undefined;
        unit.pathIndex = 0;
      }
    });
  }

  private getAiDifficultyProfile() {
    const diff = this.cfg.aiDifficulty ?? 'normal';
    if (diff === 'easy') {
      return {
        engineerRespawnSec: 22,
        factoryPlanSec: 4.8,
        towerPlanSec: 3.6,
        factoryUpgradeSpeed: 1.5,
        waveAssembleSec: 3.2,
        waveIntervalScale: 1.22,
        waveSizeOffset: -2,
        combatCap: 20
      };
    }
    if (diff === 'hard') {
      return {
        engineerRespawnSec: 12,
        factoryPlanSec: 2.4,
        towerPlanSec: 2.0,
        factoryUpgradeSpeed: 0.82,
        waveAssembleSec: 1.4,
        waveIntervalScale: 0.82,
        waveSizeOffset: 2,
        combatCap: 34
      };
    }
    return {
      engineerRespawnSec: 16,
      factoryPlanSec: 3.5,
      towerPlanSec: 2.8,
      factoryUpgradeSpeed: 1.2,
      waveAssembleSec: 2.2,
      waveIntervalScale: 1,
      waveSizeOffset: 0,
      combatCap: 26
    };
  }

  private findAiBase() {
    return this.units.find((u) => u.team === 'ai' && u.role === 'base' && u.hp > 0) ?? null;
  }

  private findAiFactory() {
    return this.units.find((u) => u.team === 'ai' && u.role === 'factory_ground' && u.hp > 0) ?? null;
  }

  private findAiNavalFactory() {
    return this.units.find((u) => u.team === 'ai' && u.role === 'factory_naval' && u.hp > 0) ?? null;
  }

  private findNearestAiEngineerTo(worldX: number, worldY: number) {
    let best: (typeof this.units)[number] | null = null;
    let bestDist = Infinity;
    this.units.forEach((u) => {
      if (u.team !== 'ai' || u.role !== 'engineer' || u.hp <= 0) return;
      const dx = u.body.x - worldX;
      const dy = u.body.y - worldY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = u;
      }
    });
    return best;
  }

  private chooseAiTankClass(
    factoryLevel: 1 | 2 | 3,
    aiExtractors: number,
    aiCombatCount: number
  ): 'light' | 'medium' | 'heavy' {
    if (factoryLevel <= 1) return 'light';
    const cycle = this.aiProductionCycle++;
    if (factoryLevel === 2) {
      if (aiExtractors >= 3 && cycle % 3 === 2) return 'medium';
      if (aiCombatCount >= 10 && cycle % 2 === 1) return 'medium';
      return 'light';
    }
    if (aiExtractors >= 4 && cycle % 4 === 3) return 'heavy';
    if (cycle % 2 === 1) return 'medium';
    return 'light';
  }

  private chooseAiNavalClass(
    factoryLevel: 1 | 2 | 3,
    aiExtractors: number,
    aiNavalCount: number
  ): TankClass {
    const cycle = this.aiProductionCycle++;
    if (factoryLevel <= 1) return 'light';
    if (factoryLevel === 2) {
      if (aiExtractors >= 3 && cycle % 3 === 2) return 'medium';
      if (aiNavalCount >= 5 && cycle % 2 === 1) return 'medium';
      return 'light';
    }
    if (aiExtractors >= 4 && cycle % 4 === 3) return 'heavy';
    if (cycle % 2 === 1) return 'medium';
    return 'light';
  }

  private countAiTowers() {
    return this.units.filter(
      (u) =>
        u.team === 'ai' &&
        u.hp > 0 &&
        (u.role === 'tower_ground' || u.role === 'tower_air' || u.role === 'tower_coastal' || u.role === 'tower_hybrid')
    ).length;
  }

  private queueAiTowerBuildAt(
    grid: { x: number; y: number },
    type: 'ground' | 'air' | 'coastal' | 'hybrid',
    builder?: (typeof this.units)[number] | null
  ) {
    if (type === 'coastal' && !this.canPlaceNavalFactoryAt(grid)) return false;
    const hasSite = this.towerBuildSites.some((s) => s.x === grid.x && s.y === grid.y);
    if (hasSite) return false;
    const alreadyBuilt = this.units.some((u) => {
      if (u.team !== 'ai') return false;
      if (u.role !== 'tower_ground' && u.role !== 'tower_air' && u.role !== 'tower_coastal' && u.role !== 'tower_hybrid')
        return false;
      const c = this.worldToGrid(u.body.x, u.body.y);
      return c?.x === grid.x && c?.y === grid.y;
    });
    if (alreadyBuilt) return false;
    const cellWorld = this.gridToWorld(grid.x, grid.y);
    const facing = this.findSpawnPoint('player');
    const targetWorld = this.gridToWorld(facing.x, facing.y);
    const angle = Phaser.Math.Angle.Between(cellWorld.x, cellWorld.y, targetWorld.x, targetWorld.y);
    const facingIndex = this.normalizeTowerFacingIndex(Math.round((angle - Math.PI / 2) / (Math.PI / 2)));
    this.towerBuildSites.push({
      x: grid.x,
      y: grid.y,
      team: 'ai',
      progress: 0,
      builderId: builder?.id,
      type,
      facingIndex
    });
    if (builder) {
      const path = this.findPath(builder.body, cellWorld, false, builder);
      if (path && path.length > 0) {
        builder.path = path;
        builder.pathIndex = 0;
        builder.target = cellWorld;
      } else {
        builder.target = cellWorld;
        builder.path = undefined;
        builder.pathIndex = 0;
      }
    }
    return true;
  }

  private updateAiDefenseConstruction(dt: number) {
    const profile = this.getAiDifficultyProfile();
    this.aiTowerPlanTimer += dt;
    if (this.aiTowerPlanTimer < profile.towerPlanSec) return;
    this.aiTowerPlanTimer = 0;

    const aiBase = this.findAiBase();
    if (!aiBase) return;
    const aiEngineers = this.units.filter((u) => u.team === 'ai' && u.role === 'engineer' && u.hp > 0);
    if (aiEngineers.length === 0) return;

    const aiExtractors = this.resourceNodes.filter((n) => n.extractorOwner === 'ai');
    const aiFactoryLevel = (this.findAiFactory()?.factoryLevel ?? 1) as 1 | 2 | 3;
    const existingTowers = this.countAiTowers();
    const pendingTowerSites = this.towerBuildSites.filter((s) => s.team === 'ai').length;
    const towerCap = Math.min(
      10,
      2 + aiExtractors.length + (aiFactoryLevel >= 2 ? 1 : 0) + (aiFactoryLevel >= 3 ? 1 : 0) + Math.max(0, profile.waveSizeOffset)
    );
    if (existingTowers + pendingTowerSites >= towerCap) return;

    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    const playerAirCount = this.units.filter((u) => u.team === 'player' && u.role === 'air_fighter' && u.hp > 0).length;
    const playerNavalCount = this.units.filter((u) => u.team === 'player' && u.role === 'naval_ship' && u.hp > 0).length;
    const chooseType = (): 'ground' | 'air' | 'coastal' | 'hybrid' => {
      if (mapKey === 'sea-island' && playerNavalCount >= 2) return 'coastal';
      if (aiFactoryLevel >= 3 && playerAirCount >= 4) return 'hybrid';
      if (playerAirCount >= 3) return 'air';
      if (aiFactoryLevel >= 3 && existingTowers >= 3 && existingTowers % 3 === 2) return 'hybrid';
      return 'ground';
    };

    const baseGrid = this.worldToGrid(aiBase.body.x, aiBase.body.y);
    if (!baseGrid) return;
    const playerBase = this.findPlayerBase();

    // Priority 1: front defense between AI base and player base.
    if (playerBase) {
      const aiPos = this.gridToWorld(baseGrid.x, baseGrid.y);
      const targetPos = new Phaser.Math.Vector2(playerBase.body.x, playerBase.body.y);
      const front = new Phaser.Math.Vector2(
        aiPos.x + (targetPos.x - aiPos.x) * 0.22,
        aiPos.y + (targetPos.y - aiPos.y) * 0.22
      );
      const frontGrid = this.worldToGrid(front.x, front.y);
      if (frontGrid) {
        const towerType = chooseType();
        const towerRole =
          towerType === 'air'
            ? 'tower_air'
            : towerType === 'hybrid'
            ? 'tower_hybrid'
            : towerType === 'coastal'
            ? 'tower_coastal'
            : 'tower_ground';
        let frontCell = this.findFreeBuildCellNear(frontGrid.x, frontGrid.y, 4, this.getBuildFootprintSize(towerRole));
        if (towerType === 'coastal') {
          frontCell = null;
          for (let rr = 3; rr <= 8 && !frontCell; rr++) {
            const c = this.findFreeBuildCellNear(frontGrid.x, frontGrid.y, rr, this.getBuildFootprintSize('tower_coastal'));
            if (c && this.canPlaceNavalFactoryAt(c)) frontCell = c;
          }
        }
        if (frontCell) {
          const world = this.gridToWorld(frontCell.x, frontCell.y);
          const builder = this.findNearestAiEngineerTo(world.x, world.y);
          if (this.queueAiTowerBuildAt(frontCell, towerType, builder)) return;
        }
      }
    }

    // Priority 2: protect AI extractors that are far from existing AI towers.
    for (const node of aiExtractors) {
      const nodeWorld = this.gridToWorld(node.x, node.y);
      const hasNearbyTower = this.units.some((u) => {
        if (u.team !== 'ai') return false;
        if (u.role !== 'tower_ground' && u.role !== 'tower_air' && u.role !== 'tower_coastal' && u.role !== 'tower_hybrid')
          return false;
        const dx = u.body.x - nodeWorld.x;
        const dy = u.body.y - nodeWorld.y;
        return dx * dx + dy * dy <= Math.pow(this.cfg.tileSize * 8, 2);
      });
      if (hasNearbyTower) continue;
      const towerType = chooseType();
      const towerRole =
        towerType === 'air'
          ? 'tower_air'
          : towerType === 'hybrid'
          ? 'tower_hybrid'
          : towerType === 'coastal'
          ? 'tower_coastal'
          : 'tower_ground';
      let cell = this.findFreeBuildCellNear(node.x, node.y, 4, this.getBuildFootprintSize(towerRole));
      if (towerType === 'coastal') {
        cell = null;
        for (let rr = 3; rr <= 8 && !cell; rr++) {
          const c = this.findFreeBuildCellNear(node.x, node.y, rr, this.getBuildFootprintSize('tower_coastal'));
          if (c && this.canPlaceNavalFactoryAt(c)) cell = c;
        }
      }
      if (!cell) continue;
      const world = this.gridToWorld(cell.x, cell.y);
      const builder = this.findNearestAiEngineerTo(world.x, world.y);
      if (this.queueAiTowerBuildAt(cell, towerType, builder)) return;
    }
  }

  private findFreeBuildCellNear(x: number, y: number, rings = 8, footprintSize = this.cfg.tileSize * 2) {
    for (let r = 1; r <= rings; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const gx = Phaser.Math.Clamp(x + dx, 0, this.cfg.cols - 1);
          const gy = Phaser.Math.Clamp(y + dy, 0, this.cfg.rows - 1);
          if (this.blocked[gy]?.[gx]) continue;
          const occupiedBySite = this.factoryBuildSites.some((s) => s.x === gx && s.y === gy);
          if (occupiedBySite) continue;
          const occupiedByTowerSite = this.towerBuildSites.some((s) => s.x === gx && s.y === gy);
          if (occupiedByTowerSite) continue;
          const candidate = this.gridToWorld(gx, gy);
          const occupiedByUnit = this.units.some((u) => {
            const minDist = (u.size + footprintSize) * 0.52;
            return Phaser.Math.Distance.Between(u.body.x, u.body.y, candidate.x, candidate.y) < minDist;
          });
          if (occupiedByUnit) continue;
          return { x: gx, y: gy };
        }
      }
    }
    return null;
  }

  private updateAiEconomyAndProduction(dt: number) {
    const profile = this.getAiDifficultyProfile();
    const aiBase = this.findAiBase();
    if (!aiBase) return;
    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    const navalEnabled = mapKey === 'sea-island';

    const aiEngineers = this.units.filter((u) => u.team === 'ai' && u.role === 'engineer' && u.hp > 0);
    const aiExtractors = this.resourceNodes.filter((n) => n.extractorOwner === 'ai').length;
    const aiFactory = this.findAiFactory();
    const aiFactorySite = this.factoryBuildSites.find((s) => s.team === 'ai' && s.type === 'ground');
    const aiNavalFactory = this.findAiNavalFactory();
    const aiNavalFactorySite = this.factoryBuildSites.find((s) => s.team === 'ai' && s.type === 'naval');

    // Keep AI builder online so it can continue claiming resources.
    const targetEngineerCount = aiExtractors >= 2 ? 2 : 1;
    this.aiEngineerSpawnTimer += dt;
    if (aiEngineers.length < targetEngineerCount && this.aiEngineerSpawnTimer >= profile.engineerRespawnSec) {
      this.aiEngineerSpawnTimer = 0;
      const baseGrid = this.worldToGrid(aiBase.body.x, aiBase.body.y);
      if (baseGrid) {
        const spawn = this.findFreeSpawnNear(baseGrid.x, baseGrid.y);
        this.spawnUnit('ai', 'engineer', spawn ?? { x: baseGrid.x, y: baseGrid.y });
      }
    }

    // Build first AI ground factory once economy starts.
    this.aiFactoryPlanTimer += dt;
    if (!aiFactory && !aiFactorySite && aiExtractors >= 1 && this.aiFactoryPlanTimer >= profile.factoryPlanSec) {
      this.aiFactoryPlanTimer = 0;
      const baseGrid = this.worldToGrid(aiBase.body.x, aiBase.body.y);
      if (baseGrid) {
        const cell = this.findFreeBuildCellNear(baseGrid.x, baseGrid.y, 9, this.getBuildFootprintSize('factory_ground'));
        if (cell) {
          const world = this.gridToWorld(cell.x, cell.y);
          const builder = this.findNearestAiEngineerTo(world.x, world.y);
          if (builder) {
            const path = this.findPath(builder.body, world, false, builder);
            if (path && path.length > 0) {
              builder.path = path;
              builder.pathIndex = 0;
              builder.target = world;
            } else {
              builder.target = world;
              builder.path = undefined;
              builder.pathIndex = 0;
            }
          }
          this.factoryBuildSites.push({
            x: cell.x,
            y: cell.y,
            team: 'ai',
            progress: 0,
            builderId: builder?.id,
            type: 'ground'
          });
        }
      }
    }

    // Build AI naval factory on sea maps.
    this.aiNavalFactoryPlanTimer += dt;
    if (navalEnabled && !aiNavalFactory && !aiNavalFactorySite && aiExtractors >= 1 && this.aiNavalFactoryPlanTimer >= profile.factoryPlanSec * 1.15) {
      this.aiNavalFactoryPlanTimer = 0;
      const baseGrid = this.worldToGrid(aiBase.body.x, aiBase.body.y);
      if (baseGrid) {
        let chosen: { x: number; y: number } | null = null;
        for (let r = 4; r <= 11 && !chosen; r++) {
          const cell = this.findFreeBuildCellNear(baseGrid.x, baseGrid.y, r, this.getBuildFootprintSize('factory_naval'));
          if (cell && this.canPlaceNavalFactoryAt(cell)) chosen = cell;
        }
        if (chosen) {
          const world = this.gridToWorld(chosen.x, chosen.y);
          const builder = this.findNearestAiEngineerTo(world.x, world.y);
          if (builder) {
            const path = this.findPath(builder.body, world, false, builder);
            if (path && path.length > 0) {
              builder.path = path;
              builder.pathIndex = 0;
              builder.target = world;
            } else {
              builder.target = world;
              builder.path = undefined;
              builder.pathIndex = 0;
            }
          }
          this.factoryBuildSites.push({
            x: chosen.x,
            y: chosen.y,
            team: 'ai',
            progress: 0,
            builderId: builder?.id,
            type: 'naval'
          });
        }
      }
    }

    if (aiFactory) {
      const aiFactoryLevel = (aiFactory.factoryLevel ?? 1) as 1 | 2 | 3;
      const desiredFactoryLevel: 1 | 2 | 3 = aiExtractors >= 4 ? 3 : aiExtractors >= 2 ? 2 : 1;
      if (!aiFactory.upgrading && aiFactoryLevel < desiredFactoryLevel) {
        aiFactory.upgrading = true;
        aiFactory.upgradeTimer = 0;
        this.aiTankSpawnTimer = 0;
      }
      if (aiFactory.upgrading) {
        aiFactory.upgradeTimer = (aiFactory.upgradeTimer ?? 0) + dt;
        const aiUpgradeDuration = this.factoryUpgradeDuration * profile.factoryUpgradeSpeed;
        if ((aiFactory.upgradeTimer ?? 0) >= aiUpgradeDuration) {
          aiFactory.upgrading = false;
          aiFactory.upgradeTimer = 0;
          aiFactory.factoryLevel = Math.min(3, (aiFactory.factoryLevel ?? 1) + 1) as 1 | 2 | 3;
          if (aiFactory.body instanceof Phaser.GameObjects.Image) {
            aiFactory.body.setTexture(`factory_ground_${aiFactory.factoryLevel}`);
          }
        }
      } else {
        const aiCombatCount = this.units.filter(
          (u) =>
            u.team === 'ai' &&
            u.hp > 0 &&
            (u.role === 'tank' ||
              u.role === 'air_fighter' ||
              u.role === 'naval_ship' ||
              u.role === 'tower_ground' ||
              u.role === 'tower_air' ||
              u.role === 'tower_coastal' ||
              u.role === 'tower_hybrid')
        ).length;
        const produceKind = this.chooseAiTankClass((aiFactory.factoryLevel ?? 1) as 1 | 2 | 3, aiExtractors, aiCombatCount);
        const interval = this.getGroundFactoryBuildDuration((aiFactory.factoryLevel ?? 1) as 1 | 2 | 3, produceKind);
        this.aiTankSpawnTimer += dt;
        if (this.aiTankSpawnTimer >= interval && aiCombatCount < profile.combatCap) {
          this.aiTankSpawnTimer = 0;
          const factoryGrid = this.worldToGrid(aiFactory.body.x, aiFactory.body.y);
          if (factoryGrid) {
            const spawn = this.findFreeSpawnNear(factoryGrid.x, factoryGrid.y);
            this.spawnUnit('ai', 'tank', spawn ?? { x: factoryGrid.x, y: factoryGrid.y }, { tankClass: produceKind });
          }
        }
      }
    }

    if (navalEnabled && aiNavalFactory) {
      const navalLevel = (aiNavalFactory.navalFactoryLevel ?? 1) as 1 | 2 | 3;
      const desiredLevel: 1 | 2 | 3 = aiExtractors >= 4 ? 3 : aiExtractors >= 2 ? 2 : 1;
      if (!aiNavalFactory.navalUpgrading && navalLevel < desiredLevel) {
        aiNavalFactory.navalUpgrading = true;
        aiNavalFactory.navalUpgradeTimer = 0;
        this.aiNavalSpawnTimer = 0;
      }
      if (aiNavalFactory.navalUpgrading) {
        aiNavalFactory.navalUpgradeTimer = (aiNavalFactory.navalUpgradeTimer ?? 0) + dt;
        const aiUpgradeDuration = this.navalFactoryUpgradeDuration * profile.factoryUpgradeSpeed;
        if ((aiNavalFactory.navalUpgradeTimer ?? 0) >= aiUpgradeDuration) {
          aiNavalFactory.navalUpgrading = false;
          aiNavalFactory.navalUpgradeTimer = 0;
          aiNavalFactory.navalFactoryLevel = Math.min(3, (aiNavalFactory.navalFactoryLevel ?? 1) + 1) as 1 | 2 | 3;
          if (aiNavalFactory.body instanceof Phaser.GameObjects.Image) {
            aiNavalFactory.body.setTexture(`factory_naval_${aiNavalFactory.navalFactoryLevel}`);
          }
        }
      } else {
        const aiNavalCount = this.units.filter((u) => u.team === 'ai' && u.role === 'naval_ship' && u.hp > 0).length;
        const kind = this.chooseAiNavalClass((aiNavalFactory.navalFactoryLevel ?? 1) as 1 | 2 | 3, aiExtractors, aiNavalCount);
        const interval = this.getNavalFactoryBuildDuration((aiNavalFactory.navalFactoryLevel ?? 1) as 1 | 2 | 3, kind);
        this.aiNavalSpawnTimer += dt;
        const navalCap = 10 + Math.max(0, profile.waveSizeOffset);
        if (this.aiNavalSpawnTimer >= interval && aiNavalCount < navalCap) {
          this.aiNavalSpawnTimer = 0;
          const grid = this.worldToGrid(aiNavalFactory.body.x, aiNavalFactory.body.y);
          if (grid) {
            const spawn = this.findFreeSpawnNear(grid.x, grid.y, 'naval_ship');
            this.spawnUnit('ai', 'naval_ship', spawn ?? { x: grid.x, y: grid.y }, { tankClass: kind });
          }
        }
      }
    }
  }

  private updateAiAttackOrders(dt: number) {
    const profile = this.getAiDifficultyProfile();
    this.aiAttackOrderTimer += dt;
    const aiBase = this.findAiBase();
    const playerBase = this.findPlayerBase();
    const fallbackTarget = playerBase
      ? new Phaser.Math.Vector2(playerBase.body.x, playerBase.body.y)
      : this.gridToWorld(Math.floor(this.cfg.cols / 2), Math.floor(this.cfg.rows * 0.18));
    const aiStrikeUnits = this.units.filter(
      (u) =>
        u.team === 'ai' &&
        u.hp > 0 &&
        (u.role === 'tank' || u.role === 'air_fighter')
    );
    const aiNavalUnits = this.units.filter((u) => u.team === 'ai' && u.hp > 0 && u.role === 'naval_ship');
    if (aiStrikeUnits.length === 0 && aiNavalUnits.length === 0) return;

    const aiFactoryLevel = (this.findAiFactory()?.factoryLevel ?? 1) as 1 | 2 | 3;
    const waveSize = Math.max(4, (aiFactoryLevel >= 3 ? 12 : aiFactoryLevel === 2 ? 9 : 6) + profile.waveSizeOffset);
    const waveInterval = (aiFactoryLevel >= 3 ? 4.6 : aiFactoryLevel === 2 ? 6.2 : 8.2) * profile.waveIntervalScale;

    if (this.aiWaveState === 'assembling') {
      this.aiWaveAssembleTimer -= dt;
      if (this.aiWaveAssembleTimer > 0) return;
      this.aiWaveState = 'idle';
      aiStrikeUnits.forEach((u) => {
        const canFly = u.role === 'air_fighter';
        if (this.isLineClear(u.body, fallbackTarget, canFly, u)) {
          u.path = [fallbackTarget.clone()];
          u.pathIndex = 0;
          u.target = fallbackTarget.clone();
          return;
        }
        const path = this.findPath(u.body, fallbackTarget, canFly, u);
        if (path && path.length > 0) {
          u.path = path;
          u.pathIndex = 0;
          u.target = fallbackTarget.clone();
        }
      });
      const playerSpawn = this.findSpawnPoint('player');
      const playerWater = this.findNearestWaterCellNear(playerSpawn.x, playerSpawn.y, 22);
      if (playerWater) {
        const navalTarget = this.gridToWorld(playerWater.x, playerWater.y);
        aiNavalUnits.forEach((u) => {
          const path = this.findPath(u.body, navalTarget, false, u);
          if (path && path.length > 0) {
            u.path = path;
            u.pathIndex = 0;
            u.target = navalTarget.clone();
          }
        });
      }
      return;
    }

    if (aiStrikeUnits.length < waveSize && aiNavalUnits.length < Math.max(2, Math.floor(waveSize * 0.35))) return;
    if (this.aiAttackOrderTimer < waveInterval) return;
    this.aiAttackOrderTimer = 0;
    this.aiWaveState = 'assembling';
    this.aiWaveAssembleTimer = profile.waveAssembleSec;
    const rallyTarget =
      aiBase && playerBase
        ? new Phaser.Math.Vector2(
            aiBase.body.x + (playerBase.body.x - aiBase.body.x) * 0.32,
            aiBase.body.y + (playerBase.body.y - aiBase.body.y) * 0.32
          )
        : aiBase
        ? new Phaser.Math.Vector2(aiBase.body.x, aiBase.body.y)
        : fallbackTarget.clone();

    aiStrikeUnits.forEach((u) => {
      const canFly = u.role === 'air_fighter';
      if (this.isLineClear(u.body, rallyTarget, canFly, u)) {
        u.path = [rallyTarget.clone()];
        u.pathIndex = 0;
        u.target = rallyTarget.clone();
      } else {
        const path = this.findPath(u.body, rallyTarget, canFly, u);
        if (path && path.length > 0) {
          u.path = path;
          u.pathIndex = 0;
          u.target = rallyTarget.clone();
        }
      }
    });

    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    if (mapKey === 'sea-island') {
      const playerSpawn = this.findSpawnPoint('player');
      const coastalWater = this.findNearestWaterCellNear(playerSpawn.x, playerSpawn.y, 22);
      if (coastalWater) {
        const navalRally = this.gridToWorld(coastalWater.x, coastalWater.y);
        aiNavalUnits.forEach((u) => {
          const path = this.findPath(u.body, navalRally, false, u);
          if (path && path.length > 0) {
            u.path = path;
            u.pathIndex = 0;
            u.target = navalRally.clone();
          }
        });
      }
    }
  }

  update(_time: number, delta: number) {
    if (this.gameOver) return;
    if (!this.keys && this.input.keyboard) {
      this.keys = this.input.keyboard.addKeys('W,A,S,D,Q,E,X,C,B') as typeof this.keys;
    }
    const cam = this.cameras.main;
    const speed = 900 * (delta / 1000);
    let vx = 0;
    let vy = 0;
    const isDown = (key: 'W' | 'A' | 'S' | 'D') =>
      (this.keys?.[key]?.isDown ?? false) || this.keyState.has(key);
    if (isDown('W')) vy -= speed;
    if (isDown('S')) vy += speed;
    if (isDown('A')) vx -= speed;
    if (isDown('D')) vx += speed;
    if (vx !== 0 || vy !== 0) {
      cam.setScroll(cam.scrollX + vx, cam.scrollY + vy);
    }

    const keyTap = (key: 'Q' | 'E' | 'X' | 'C' | 'B') => {
      const target = this.keys?.[key] as Phaser.Input.Keyboard.Key | undefined;
      return target ? Phaser.Input.Keyboard.JustDown(target) : false;
    };
    if (keyTap('Q')) this.rotateTowerBuildFacing(-1);
    if (keyTap('E')) this.rotateTowerBuildFacing(1);
    if (keyTap('X')) this.selectUnits([]);
    if (keyTap('C')) {
      this.selectedUnits.forEach((u) => {
        u.target = undefined;
        u.path = undefined;
        u.pathIndex = 0;
        u.forcedTargetUnitId = undefined;
        u.forcedTargetNodeKey = undefined;
      });
      this.moveCommandPreview = [];
    }
    if (keyTap('B')) this.requestBuildAtSelection();

    const dt = delta / 1000;
    this.rebuildCrowdCost();
    this.updateAiResourceTargets();
    this.updateAiEconomyAndProduction(dt);
    this.updateAiDefenseConstruction(dt);
    this.updateAiAttackOrders(dt);
    this.updateResourceEconomy(dt);
    this.updateFactoryConstruction(dt);
    this.updateTowerConstruction(dt);
    this.updateBaseQueue(dt);
    this.updateFactoryQueue(dt);
    this.updateAirFactoryQueue(dt);
    this.updateNavalFactoryQueue(dt);
    this.updateForcedAttackOrders();
    if (this.incomePerSecond > 0) {
      const gain = this.incomePerSecond * dt + this.creditRemainder;
      const add = Math.floor(gain);
      this.creditRemainder = gain - add;
      if (add > 0) this.addCredits(add);
    }
    this.units.forEach((unit) => {
      if (unit.locked) return;
      const target = unit.path?.[unit.pathIndex] ?? unit.target;
      if (!target) return;
      const dx = target.x - unit.body.x;
      const dy = target.y - unit.body.y;
      const dist = Math.hypot(dx, dy);
      const step = unit.speed * dt;
      if (
        dist > 0.01 &&
        unit.role !== 'base' &&
        unit.role !== 'factory_ground' &&
        unit.role !== 'factory_air' &&
        unit.role !== 'factory_naval' &&
        unit.role !== 'tower_ground' &&
        unit.role !== 'tower_air' &&
        unit.role !== 'tower_coastal' &&
        unit.role !== 'tower_hybrid'
      ) {
        this.rotateUnitTowardMoving(unit, target.x, target.y, dt);
      }
      const nextX = dist <= step ? target.x : unit.body.x + (dx / dist) * step;
      const nextY = dist <= step ? target.y : unit.body.y + (dy / dist) * step;
      const hitUnit = this.units.some((other) => {
        if (other === unit) return false;
        if (unit.role === 'air_fighter' || other.role === 'air_fighter') return false;
        if (unit.role === 'naval_ship' && other.role !== 'naval_ship') return false;
        if (unit.role !== 'naval_ship' && other.role === 'naval_ship') return false;
        if (other.team === unit.team) return false;
        if (
          other.role === 'base' ||
          other.role === 'factory_ground' ||
          other.role === 'factory_air' ||
          other.role === 'factory_naval' ||
          other.role === 'tower_ground' ||
          other.role === 'tower_air' ||
          other.role === 'tower_coastal' ||
          other.role === 'tower_hybrid'
        )
          return false;
        const r = (unit.size + other.size) * 0.5;
        const ox = other.body.x - nextX;
        const oy = other.body.y - nextY;
        return ox * ox + oy * oy < r * r;
      });
      if (hitUnit) return;
      const nextCell = this.worldToGrid(nextX, nextY);
      if (nextCell && !this.canUnitOccupyCell(unit, nextCell.x, nextCell.y)) {
        if (unit.target) {
          const reroute = this.findPath(unit.body, unit.target, unit.role === 'air_fighter', unit);
          if (reroute && reroute.length > 0) {
            unit.path = reroute;
            unit.pathIndex = 0;
            return;
          }
        }
        unit.path = undefined;
        unit.target = undefined;
        return;
      }
      if (dist <= step) {
        unit.body.setPosition(nextX, nextY);
        if (unit.shadow) {
          unit.shadow.setPosition(nextX + 2, nextY + unit.size * 0.3);
        }
        unit.airSelectRing?.clear();
        if (unit.path && unit.pathIndex < unit.path.length - 1) {
          unit.pathIndex += 1;
        } else {
          unit.path = undefined;
          unit.target = undefined;
        }
        return;
      }
      unit.body.setPosition(nextX, nextY);
      if (unit.shadow) {
        unit.shadow.setPosition(nextX + 2, nextY + unit.size * 0.3);
      }
      unit.airSelectRing?.clear();
    });

    this.applyGroundSeparation(dt);
    this.applyAirSeparation(dt);

    this.units.forEach((unit) => {
      if (!unit.shadow || unit.role !== 'air_fighter') return;
      unit.shadow.setPosition(unit.body.x + 2, unit.body.y + unit.size * 0.3);
      const pulse = 0.9 + Math.sin(this.time.now * 0.006 + unit.id * 0.7) * 0.12;
      unit.shadow.setScale(pulse, pulse);
    });

    // 海船航行动画：移动时微幅起伏与摇摆，停船时回归基准。
    this.units.forEach((unit) => {
      if (unit.role !== 'naval_ship') return;
      if (!(unit.body instanceof Phaser.GameObjects.Image || unit.body instanceof Phaser.GameObjects.Rectangle)) return;
      const moveTarget = unit.path?.[unit.pathIndex] ?? unit.target;
      const moving = !!moveTarget && !unit.locked && unit.hp > 0;
      const wave = Math.sin(this.time.now * 0.008 + unit.id * 0.9);
      const targetScaleX = moving ? 1 + wave * 0.035 : 1;
      const targetScaleY = moving ? 1 - wave * 0.018 : 1;
      unit.body.setScale(
        Phaser.Math.Linear(unit.body.scaleX, targetScaleX, 0.22),
        Phaser.Math.Linear(unit.body.scaleY, targetScaleY, 0.22)
      );
    });
    this.updateSeaWaveAnimation();

    this.renderSelectionMarkers();
    this.renderCommandPaths();
    this.updateHpBars(dt);
    this.updateCombat(dt);
    this.updateBullets(dt);
    this.checkGameOver();

    if (this.previewGfx) {
      this.previewGfx.clear();
    }
    if (this.selectionGfx && !this.selecting) {
      this.selectionGfx.clear();
    }
    if (this.buildPreviewGfx) {
      if (this.buildMode) {
        const pointer = this.input.activePointer;
        const node = this.findResourceNodeAt(pointer.worldX, pointer.worldY);
        this.buildPreviewGfx.clear();
        const buildType = this.buildType ?? 'extractor';
        const ghostSize = this.getBuildFootprintSize(buildType);
        const snappedGrid = this.worldToGrid(pointer.worldX, pointer.worldY);
        const snappedPoint =
          buildType === 'extractor'
            ? node
              ? this.gridToWorld(node.x, node.y)
              : null
            : snappedGrid
            ? this.gridToWorld(snappedGrid.x, snappedGrid.y)
            : null;
        const drawX = snappedPoint?.x ?? pointer.worldX;
        const drawY = snappedPoint?.y ?? pointer.worldY;
        const canPlace =
          this.buildType === 'extractor'
            ? !!(node && !node.extractorOwner)
            : this.buildType === 'factory_naval'
            ? !!(snappedGrid && this.canPlaceNavalFactoryAt(snappedGrid))
            : this.buildType === 'tower_ground' ||
              this.buildType === 'tower_air' ||
              this.buildType === 'tower_coastal' ||
              this.buildType === 'tower_hybrid'
            ? !!(snappedGrid && this.canPlaceTowerAt(snappedGrid, this.buildType))
            : true;
        const previewKey = this.getBuildPreviewTexture(buildType);
        if (!this.buildPreviewSprite) {
          this.buildPreviewSprite = this.add.image(drawX, drawY, previewKey);
          this.buildPreviewSprite.setDepth(21);
        } else {
          if (this.buildPreviewSprite.texture.key !== previewKey) {
            this.buildPreviewSprite.setTexture(previewKey);
          }
          this.buildPreviewSprite.setPosition(drawX, drawY);
          this.buildPreviewSprite.setVisible(true);
        }
        if (
          buildType === 'tower_ground' ||
          buildType === 'tower_air' ||
          buildType === 'tower_coastal' ||
          buildType === 'tower_hybrid'
        ) {
          this.applyTowerSpriteOrigin(this.buildPreviewSprite, buildType);
        } else {
          this.buildPreviewSprite.setOrigin(0.5, 0.5);
        }
        this.buildPreviewSprite.setDisplaySize(ghostSize, ghostSize);
        if (
          buildType === 'tower_ground' ||
          buildType === 'tower_air' ||
          buildType === 'tower_coastal' ||
          buildType === 'tower_hybrid'
        ) {
          this.buildPreviewSprite.setRotation(this.getTowerRotationFromFacing(buildType, this.towerBuildFacingIndex));
        } else {
          this.buildPreviewSprite.setRotation(0);
        }
        this.buildPreviewSprite.setAlpha(canPlace ? 0.72 : 0.38);
        this.buildPreviewSprite.setTint(canPlace ? 0xb8ffe1 : 0xff6f6f);
        const half = ghostSize * 0.5;
        this.buildPreviewGfx.lineStyle(3, canPlace ? 0x6fffd5 : 0xff3f52, 0.98);
        this.buildPreviewGfx.strokeRect(drawX - half, drawY - half, ghostSize, ghostSize);
        if (!canPlace) {
          this.buildPreviewGfx.lineStyle(3.5, 0xff3f52, 0.95);
          this.buildPreviewGfx.lineBetween(drawX - half, drawY - half, drawX + half, drawY + half);
          this.buildPreviewGfx.lineBetween(drawX + half, drawY - half, drawX - half, drawY + half);
        }
      } else {
        this.buildPreviewGfx.clear();
        this.buildPreviewSprite?.setVisible(false);
      }
    }

    if (this.buildSiteGfx) {
      this.buildSiteGfx.clear();
      this.factoryBuildSites.forEach((site) => {
        if (site.progress <= 0) return;
        const pos = this.gridToWorld(site.x, site.y);
        this.buildSiteGfx.lineStyle(2.5, 0x5bd1ff, 0.9);
        const start = -Math.PI / 2;
        const end = start + Math.PI * 2 * Phaser.Math.Clamp(site.progress, 0, 1);
        const radius = (site.type === 'air'
          ? this.getUnitSize('factory_air', 'light')
          : site.type === 'naval'
          ? this.getUnitSize('factory_naval', 'light')
          : this.getUnitSize('factory_ground', 'light')) * 0.48;
        this.buildSiteGfx.beginPath();
        this.buildSiteGfx.arc(pos.x, pos.y, radius, start, end, false);
        this.buildSiteGfx.strokePath();
      });
      this.towerBuildSites.forEach((site) => {
        if (site.progress <= 0) return;
        const pos = this.gridToWorld(site.x, site.y);
        const role =
          site.type === 'air'
            ? 'tower_air'
            : site.type === 'hybrid'
            ? 'tower_hybrid'
            : site.type === 'coastal'
            ? 'tower_coastal'
            : 'tower_ground';
        const color =
          site.type === 'air' ? 0xffb347 : site.type === 'hybrid' ? 0x7ef5a6 : site.type === 'coastal' ? 0x74c8ff : 0x5bd1ff;
        this.buildSiteGfx.lineStyle(2.5, color, 0.9);
        const start = -Math.PI / 2;
        const end = start + Math.PI * 2 * Phaser.Math.Clamp(site.progress, 0, 1);
        const radius = this.getUnitSize(role, 'light') * 0.42;
        this.buildSiteGfx.beginPath();
        this.buildSiteGfx.arc(pos.x, pos.y, radius, start, end, false);
        this.buildSiteGfx.strokePath();
      });
    }
    this.renderBuildBeams();
    this.renderAttackOrders();

    this.hudUpdateTimer += delta;
    if (this.hudUpdateTimer >= 200) {
      this.hudUpdateTimer = 0;
      const mapName = this.mapVariants[this.mapIndex]?.name ?? '未知';
      const totalNodes = this.resourceNodes.length;
      const built = this.resourceNodes.filter((n) => n.extractorOwner === 'player').length;
      const incomeText =
        totalNodes > 0
          ? `资源点：${built}/${totalNodes} · +${this.incomePerSecond.toFixed(1)}/s`
          : '资源系统：未启用';
      const hudY = 16 + (this.miniMapSize?.h ?? 0) + 12;
      this.hudText?.setPosition(16, hudY);
      this.hudText?.setText([
        `Map · ${mapName}`,
        '地图已锁定（机库中选择）',
        `Credits: ${this.credits}`,
        incomeText
      ]);
    }

    this.renderMiniMap(cam);
  }

  private checkGameOver() {
    if (this.gameOver) return;
    const playerUnits = this.units.filter((u) => u.team === 'player' && u.hp > 0).length;
    const aiUnits = this.units.filter((u) => u.team === 'ai' && u.hp > 0).length;
    const playerBuildings = this.resourceNodes.filter((n) => n.extractorOwner === 'player').length;
    const aiBuildings = this.resourceNodes.filter((n) => n.extractorOwner === 'ai').length;
    const playerAlive = playerUnits > 0 || playerBuildings > 0;
    const aiAlive = aiUnits > 0 || aiBuildings > 0;
    if (!playerAlive && !aiAlive) {
      this.endGame('draw');
    } else if (!aiAlive) {
      this.endGame('win');
    } else if (!playerAlive) {
      this.endGame('lose');
    }
  }

  private endGame(result: 'win' | 'lose' | 'draw') {
    if (this.gameOver) return;
    this.gameOver = result;
    this.bullets = [];
    this.previewGfx?.clear();
    this.bulletGfx?.clear();
    this.buildPreviewGfx?.clear();
    this.buildPreviewSprite?.setVisible(false);
    this.buildBeamGfx?.clear();
    this.attackOrderGfx?.clear();
    this.selectionMarkerGfx?.clear();
    this.commandPathGfx?.clear();
    this.moveCommandPreview = [];
    this.buildMode = false;
    this.events.emit('buildMode', false);
    this.events.emit('gameOver', result);
  }

  private updateBaseQueue(dt: number) {
    if (this.baseQueue.length === 0) {
      this.baseBuildTimer = 0;
    } else {
      this.baseBuildTimer += dt;
      if (this.baseBuildTimer >= this.baseBuildDuration) {
        this.baseBuildTimer = 0;
        const kind = this.baseQueue.shift() ?? 'tank';
        const baseUnit = this.findPlayerBase();
        if (baseUnit) {
          const grid = this.worldToGrid(baseUnit.body.x, baseUnit.body.y);
          if (grid) {
            const spawn = this.findFreeSpawnNear(grid.x, grid.y);
            this.spawnUnit('player', kind === 'engineer' ? 'engineer' : 'tank', spawn ?? { x: grid.x, y: grid.y });
          }
        } else {
          this.spawnUnit('player', kind === 'engineer' ? 'engineer' : 'tank');
        }
      }
    }
    this.baseQueueEmitTimer += dt;
    if (this.baseQueueEmitTimer >= 0.2) {
      this.baseQueueEmitTimer = 0;
      this.emitBaseQueue();
    }
  }

  private updateFactoryQueue(dt: number) {
    const factory = this.findPlayerFactory();
    if (factory?.upgrading) {
      factory.upgradeTimer = (factory.upgradeTimer ?? 0) + dt;
      if ((factory.upgradeTimer ?? 0) >= this.factoryUpgradeDuration) {
        factory.upgrading = false;
        factory.upgradeTimer = 0;
        factory.factoryLevel = Math.min(3, (factory.factoryLevel ?? 1) + 1) as 1 | 2 | 3;
        if (factory.body instanceof Phaser.GameObjects.Image) {
          const key = `factory_ground_${factory.factoryLevel}`;
          factory.body.setTexture(key);
        }
      }
    }
    if (this.factoryQueue.length === 0) {
      this.factoryBuildTimer = 0;
    } else {
      if (factory?.upgrading) {
        this.factoryBuildTimer = 0;
      } else {
        const currentKind = this.factoryQueue[0] ?? 'light';
        const buildDuration = this.getGroundFactoryBuildDuration(factory?.factoryLevel ?? 1, currentKind);
        this.factoryBuildTimer += dt;
        if (this.factoryBuildTimer >= buildDuration) {
          this.factoryBuildTimer = 0;
          const kind = this.factoryQueue.shift() ?? currentKind;
          const factory = this.findPlayerFactory();
          if (factory) {
            const grid = this.worldToGrid(factory.body.x, factory.body.y);
            if (grid) {
              const spawn = this.findFreeSpawnNear(grid.x, grid.y);
              this.spawnUnit('player', 'tank', spawn ?? { x: grid.x, y: grid.y }, { tankClass: kind });
            }
          } else {
            this.spawnUnit('player', 'tank', undefined, { tankClass: kind });
          }
        }
      }
    }
    this.factoryQueueEmitTimer += dt;
    if (this.factoryQueueEmitTimer >= 0.2) {
      this.factoryQueueEmitTimer = 0;
      this.emitFactoryQueue();
    }
  }

  private updateFactoryConstruction(dt: number) {
    if (this.factoryBuildSites.length === 0) return;
    const buildTime = 4.5;
    const next: typeof this.factoryBuildSites = [];
    this.factoryBuildSites.forEach((site) => {
      const pos = this.gridToWorld(site.x, site.y);
      const targetRole =
        site.type === 'air' ? 'factory_air' : site.type === 'naval' ? 'factory_naval' : 'factory_ground';
      const targetSize = this.getBuildFootprintSize(targetRole);
      const buildRadius = this.getBuildInteractionRadius(targetSize);
      const builder = site.builderId
        ? this.units.find((u) => u.id === site.builderId)
        : this.units.find((u) => u.team === site.team && u.role === 'engineer');
      const builderNear =
        builder &&
        Math.hypot(builder.body.x - pos.x, builder.body.y - pos.y) <= buildRadius;
      if (builderNear && builder) builder.locked = true;
      if (builderNear) {
        site.progress = Math.min(1, site.progress + dt / buildTime);
      }
      if (site.progress >= 1) {
        const cost = site.type === 'air' ? 260 : site.type === 'naval' ? 240 : 220;
        const canPay = site.team === 'player' ? this.spendCredits(cost) : true;
        if (canPay) {
          this.spawnUnit(
            site.team,
            site.type === 'air' ? 'factory_air' : site.type === 'naval' ? 'factory_naval' : 'factory_ground',
            { x: site.x, y: site.y }
          );
        } else {
          site.progress = 0.99;
          if (builder) builder.locked = false;
          next.push(site);
          return;
        }
        if (builder) builder.locked = false;
        return;
      }
      next.push(site);
    });
    this.factoryBuildSites = next;
  }

  private updateTowerConstruction(dt: number) {
    if (this.towerBuildSites.length === 0) return;
    const buildTime = 3.2;
    const next: typeof this.towerBuildSites = [];
    this.towerBuildSites.forEach((site) => {
      const pos = this.gridToWorld(site.x, site.y);
      const targetRole =
        site.type === 'air'
          ? 'tower_air'
          : site.type === 'hybrid'
          ? 'tower_hybrid'
          : site.type === 'coastal'
          ? 'tower_coastal'
          : 'tower_ground';
      const targetSize = this.getBuildFootprintSize(targetRole);
      const buildRadius = this.getBuildInteractionRadius(targetSize);
      const builder = site.builderId
        ? this.units.find((u) => u.id === site.builderId)
        : this.units.find((u) => u.team === site.team && u.role === 'engineer');
      const builderNear =
        builder &&
        Math.hypot(builder.body.x - pos.x, builder.body.y - pos.y) <= buildRadius;
      if (builderNear && builder) builder.locked = true;
      if (builderNear) {
        site.progress = Math.min(1, site.progress + dt / buildTime);
      }
      if (site.progress >= 1) {
        const cost = site.type === 'air' ? 200 : site.type === 'hybrid' ? 260 : site.type === 'coastal' ? 220 : 180;
        const canPay = site.team === 'player' ? this.spendCredits(cost) : true;
        if (canPay) {
          const role =
            site.type === 'air'
              ? 'tower_air'
              : site.type === 'hybrid'
              ? 'tower_hybrid'
              : site.type === 'coastal'
              ? 'tower_coastal'
              : 'tower_ground';
          this.spawnUnit(site.team, role, { x: site.x, y: site.y }, { towerFacingIndex: site.facingIndex });
        } else {
          site.progress = 0.99;
          if (builder) builder.locked = false;
          next.push(site);
          return;
        }
        if (builder) builder.locked = false;
        return;
      }
      next.push(site);
    });
    this.towerBuildSites = next;
  }

  private updateAirFactoryQueue(dt: number) {
    const factory = this.findPlayerAirFactory();
    if (factory?.airUpgrading) {
      factory.airUpgradeTimer = (factory.airUpgradeTimer ?? 0) + dt;
      if ((factory.airUpgradeTimer ?? 0) >= this.airFactoryUpgradeDuration) {
        factory.airUpgrading = false;
        factory.airUpgradeTimer = 0;
        factory.airFactoryLevel = Math.min(3, (factory.airFactoryLevel ?? 1) + 1) as 1 | 2 | 3;
        if (factory.body instanceof Phaser.GameObjects.Image) {
          const key = `factory_air_${factory.airFactoryLevel}`;
          factory.body.setTexture(key);
        }
      }
    }
    if (this.airFactoryQueue.length === 0) {
      this.airFactoryBuildTimer = 0;
    } else {
      if (factory?.airUpgrading) {
        this.airFactoryBuildTimer = 0;
      } else {
        const currentKind = this.airFactoryQueue[0] ?? 'light';
        const buildDuration = this.getAirFactoryBuildDuration(factory?.airFactoryLevel ?? 1, currentKind);
        this.airFactoryBuildTimer += dt;
        if (this.airFactoryBuildTimer >= buildDuration) {
          this.airFactoryBuildTimer = 0;
          const kind = this.airFactoryQueue.shift() ?? currentKind;
          const factory = this.findPlayerAirFactory();
          if (factory) {
            const grid = this.worldToGrid(factory.body.x, factory.body.y);
            if (grid) {
              const spawn = this.findFreeSpawnNear(grid.x, grid.y);
              this.spawnUnit('player', 'air_fighter', spawn ?? { x: grid.x, y: grid.y }, { tankClass: kind });
            }
          } else {
            this.spawnUnit('player', 'air_fighter', undefined, { tankClass: kind });
          }
        }
      }
    }
    this.airFactoryQueueEmitTimer += dt;
    if (this.airFactoryQueueEmitTimer >= 0.2) {
      this.airFactoryQueueEmitTimer = 0;
      this.emitAirFactoryQueue();
    }
  }

  private updateNavalFactoryQueue(dt: number) {
    const factory = this.findPlayerNavalFactory();
    if (factory?.navalUpgrading) {
      factory.navalUpgradeTimer = (factory.navalUpgradeTimer ?? 0) + dt;
      if ((factory.navalUpgradeTimer ?? 0) >= this.navalFactoryUpgradeDuration) {
        factory.navalUpgrading = false;
        factory.navalUpgradeTimer = 0;
        factory.navalFactoryLevel = Math.min(3, (factory.navalFactoryLevel ?? 1) + 1) as 1 | 2 | 3;
        if (factory.body instanceof Phaser.GameObjects.Image) {
          const key = `factory_naval_${factory.navalFactoryLevel}`;
          factory.body.setTexture(key);
        }
      }
    }
    if (this.navalFactoryQueue.length === 0) {
      this.navalFactoryBuildTimer = 0;
    } else {
      if (factory?.navalUpgrading) {
        this.navalFactoryBuildTimer = 0;
      } else {
        const currentKind = this.navalFactoryQueue[0] ?? 'light';
        const buildDuration = this.getNavalFactoryBuildDuration(factory?.navalFactoryLevel ?? 1, currentKind);
        this.navalFactoryBuildTimer += dt;
        if (this.navalFactoryBuildTimer >= buildDuration) {
          this.navalFactoryBuildTimer = 0;
          const kind = this.navalFactoryQueue.shift() ?? currentKind;
          const factory = this.findPlayerNavalFactory();
          if (factory) {
            const grid = this.worldToGrid(factory.body.x, factory.body.y);
            if (grid) {
              const spawn = this.findFreeSpawnNear(grid.x, grid.y, 'naval_ship');
              this.spawnUnit('player', 'naval_ship', spawn ?? { x: grid.x, y: grid.y }, { tankClass: kind });
            }
          }
        }
      }
    }
    this.navalFactoryQueueEmitTimer += dt;
    if (this.navalFactoryQueueEmitTimer >= 0.2) {
      this.navalFactoryQueueEmitTimer = 0;
      this.emitNavalFactoryQueue();
    }
  }

  private updateCombat(dt: number) {
    const attackers = this.units.filter(
      (u) =>
        (u.role === 'tank' ||
          u.role === 'air_fighter' ||
          u.role === 'naval_ship' ||
          u.role === 'tower_ground' ||
          u.role === 'tower_air' ||
          u.role === 'tower_coastal' ||
          u.role === 'tower_hybrid') &&
        u.damage > 0 &&
        u.hp > 0
    );
    if (attackers.length === 0) return;
    attackers.forEach((unit) => {
      unit.fireTimer = Math.max(0, unit.fireTimer - dt);
      let bestUnit: typeof this.units[number] | null = null;
      let bestExtractor: (typeof this.resourceNodes)[number] | null = null;
      let bestDist = Infinity;
      const forced = this.resolveForcedTarget(unit);
      if (forced?.targetUnit && this.canAttackUnit(unit, forced.targetUnit)) {
        const dx = forced.targetUnit.body.x - unit.body.x;
        const dy = forced.targetUnit.body.y - unit.body.y;
        const dist = dx * dx + dy * dy;
        if (dist <= unit.range * unit.range) {
          bestUnit = forced.targetUnit;
          bestDist = dist;
        }
      }
      if (!bestUnit && forced?.targetNode) {
        if (unit.role !== 'tower_air' && unit.role !== 'tower_coastal') {
          const pos = this.gridToWorld(forced.targetNode.x, forced.targetNode.y);
          const dx = pos.x - unit.body.x;
          const dy = pos.y - unit.body.y;
          const dist = dx * dx + dy * dy;
          if (dist <= unit.range * unit.range) {
            bestExtractor = forced.targetNode;
            bestDist = dist;
          }
        }
      }
      this.units.forEach((enemy) => {
        if (bestUnit || bestExtractor) return;
        if (enemy.team === unit.team || enemy.hp <= 0) return;
        if (!this.canAttackUnit(unit, enemy)) return;
        const dx = enemy.body.x - unit.body.x;
        const dy = enemy.body.y - unit.body.y;
        const dist = dx * dx + dy * dy;
        if (dist <= unit.range * unit.range && dist < bestDist) {
          bestDist = dist;
          bestUnit = enemy;
          bestExtractor = null;
        }
      });
      this.resourceNodes.forEach((node) => {
        if (bestUnit || bestExtractor) return;
        if (unit.role === 'tower_air' || unit.role === 'tower_coastal') return;
        if (!node.extractorOwner || node.extractorOwner === unit.team) return;
        if ((node.extractorHp ?? 0) <= 0) return;
        const pos = this.gridToWorld(node.x, node.y);
        const dx = pos.x - unit.body.x;
        const dy = pos.y - unit.body.y;
        const dist = dx * dx + dy * dy;
        if (dist <= unit.range * unit.range && dist < bestDist) {
          bestDist = dist;
          bestExtractor = node;
          bestUnit = null;
        }
      });
      if (!bestUnit && !bestExtractor) return;
      if (bestUnit) {
        this.rotateUnitToward(unit, bestUnit.body.x, bestUnit.body.y);
      } else if (bestExtractor) {
        const pos = this.gridToWorld(bestExtractor.x, bestExtractor.y);
        this.rotateUnitToward(unit, pos.x, pos.y);
      }
      if (unit.fireTimer > 0) return;
      if (bestUnit) {
        const dx = bestUnit.body.x - unit.body.x;
        const dy = bestUnit.body.y - unit.body.y;
        if (unit.role === 'tank' && unit.tankClass === 'heavy') {
          this.spawnHeavyTankVolley(unit, dx, dy);
        } else {
          this.spawnBullet(unit, dx, dy);
        }
      } else if (bestExtractor) {
        const pos = this.gridToWorld(bestExtractor.x, bestExtractor.y);
        const dx = pos.x - unit.body.x;
        const dy = pos.y - unit.body.y;
        if (unit.role === 'tank' && unit.tankClass === 'heavy') {
          this.spawnHeavyTankVolley(unit, dx, dy);
        } else {
          this.spawnBullet(unit, dx, dy);
        }
      }
      unit.fireTimer = 1 / unit.fireRate;
    });

    const alive: typeof this.units = [];
    let changed = false;
    this.units.forEach((unit) => {
      if (unit.hitFlash && unit.hitFlash > 0) {
        unit.hitFlash = Math.max(0, unit.hitFlash - dt);
        unit.body.setAlpha(unit.hitFlash > 0 ? 0.4 : 0.9);
      } else {
        unit.body.setAlpha(0.9);
      }
      if (unit.hp > 0) {
        alive.push(unit);
      } else {
        unit.body.destroy();
        unit.shadow?.destroy();
        unit.airSelectRing?.destroy();
        unit.attackRangeRing?.destroy();
        unit.hpBar?.destroy();
        changed = true;
      }
    });
    if (changed) {
      this.units = alive;
      this.selectedUnits = this.selectedUnits.filter((u) => u.hp > 0);
      this.emitSelection();
    }
  }

  private rotateUnitToward(unit: (typeof this.units)[number], tx: number, ty: number) {
    if (!(unit.body instanceof Phaser.GameObjects.Image || unit.body instanceof Phaser.GameObjects.Rectangle)) return;
    const dx = tx - unit.body.x;
    const dy = ty - unit.body.y;
    if (Math.hypot(dx, dy) <= 0.01) return;
    const angle = Math.atan2(dy, dx);
    unit.body.setRotation(angle + this.getSpriteFacingOffset(unit));
  }

  private rotateUnitTowardMoving(unit: (typeof this.units)[number], tx: number, ty: number, dt: number) {
    if (!(unit.body instanceof Phaser.GameObjects.Image || unit.body instanceof Phaser.GameObjects.Rectangle)) return;
    const dx = tx - unit.body.x;
    const dy = ty - unit.body.y;
    if (Math.hypot(dx, dy) <= 0.01) return;
    const target = Math.atan2(dy, dx) + this.getSpriteFacingOffset(unit);
    const turnSpeedDeg =
      unit.role === 'naval_ship' ? 140 : unit.role === 'tank' ? 240 : unit.role === 'engineer' ? 220 : 260;
    const maxStep = Phaser.Math.DegToRad(turnSpeedDeg) * dt;
    const current = unit.body.rotation;
    unit.body.setRotation(Phaser.Math.Angle.RotateTo(current, target, maxStep));
  }

  private getSpriteFacingOffset(unit: (typeof this.units)[number]) {
    if (unit.role === 'tower_ground' || unit.role === 'tower_air' || unit.role === 'tower_coastal' || unit.role === 'tower_hybrid') {
      return this.getTowerSpriteOffset(unit.role);
    }
    return Math.PI / 2;
  }

  private rotateTowerToEnemyBase(unit: (typeof this.units)[number]) {
    if (unit.team !== 'player' && unit.team !== 'ai') return;
    const enemyTeam: 'player' | 'ai' = unit.team === 'player' ? 'ai' : 'player';
    const enemyBase = this.units.find((u) => u.role === 'base' && u.team === enemyTeam && u.hp > 0);
    if (enemyBase) {
      this.rotateUnitToward(unit, enemyBase.body.x, enemyBase.body.y);
      return;
    }
    const fallback = this.findSpawnPoint(enemyTeam);
    const world = this.gridToWorld(fallback.x, fallback.y);
    this.rotateUnitToward(unit, world.x, world.y);
  }

  private normalizeTowerFacingIndex(idx: number) {
    return ((Math.round(idx) % 4) + 4) % 4;
  }

  private getTowerSpriteOffset(role: 'tower_ground' | 'tower_air' | 'tower_coastal' | 'tower_hybrid') {
    // AA turret art uses a different default axis than ground/hybrid towers.
    if (role === 'tower_air') return Math.PI / 2;
    return 0;
  }

  private getTowerSpriteOrigin(role: 'tower_ground' | 'tower_air' | 'tower_coastal' | 'tower_hybrid') {
    // Compensate source-art whitespace so visual center aligns with logical center/range ring center.
    if (role === 'tower_ground') return { x: 139, y: 100 };
    if (role === 'tower_coastal') return { x: 256, y: 256 };
    if (role === 'tower_air') return { x: 128, y: 84 };
    return { x: 128, y: 131 };
  }

  private applyTowerSpriteOrigin(
    sprite: Phaser.GameObjects.Image,
    role: 'tower_ground' | 'tower_air' | 'tower_coastal' | 'tower_hybrid'
  ) {
    const o = this.getTowerSpriteOrigin(role);
    sprite.setDisplayOrigin(o.x, o.y);
  }

  // Four-way placement facing: 0=down, 1=left, 2=up, 3=right.
  private getTowerRotationFromFacing(
    role: 'tower_ground' | 'tower_air' | 'tower_coastal' | 'tower_hybrid',
    idx: number
  ) {
    const normalized = this.normalizeTowerFacingIndex(idx);
    const rotations = [Math.PI / 2, Math.PI, -Math.PI / 2, 0];
    return rotations[normalized] + this.getTowerSpriteOffset(role);
  }

  private rotateTowerBuildFacing(delta: -1 | 1) {
    if (
      !this.buildMode ||
      (this.buildType !== 'tower_ground' &&
        this.buildType !== 'tower_air' &&
        this.buildType !== 'tower_coastal' &&
        this.buildType !== 'tower_hybrid')
    )
      return;
    this.towerBuildFacingIndex = this.normalizeTowerFacingIndex(this.towerBuildFacingIndex + delta);
  }

  private spawnHeavyTankVolley(unit: (typeof this.units)[number], dx: number, dy: number) {
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.001) return;
    const dirX = dx / dist;
    const dirY = dy / dist;
    const perpX = -dirY;
    const perpY = dirX;
    const barrelOffset = unit.size * 0.15;
    const halfDamage = unit.damage * 0.5;
    this.spawnBullet(unit, dx, dy, {
      originX: unit.body.x + perpX * barrelOffset,
      originY: unit.body.y + perpY * barrelOffset,
      damage: halfDamage
    });
    this.spawnBullet(unit, dx, dy, {
      originX: unit.body.x - perpX * barrelOffset,
      originY: unit.body.y - perpY * barrelOffset,
      damage: halfDamage
    });
  }

  private spawnBullet(
    unit: (typeof this.units)[number],
    dx: number,
    dy: number,
    options?: { originX?: number; originY?: number; damage?: number }
  ) {
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.001) return;
    const spec = this.getProjectileSpec(unit);
    const speed = spec.speed;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    if (
      unit.role !== 'tank' &&
      unit.role !== 'air_fighter' &&
      unit.role !== 'naval_ship' &&
      unit.role !== 'tower_ground' &&
      unit.role !== 'tower_air' &&
      unit.role !== 'tower_coastal' &&
      unit.role !== 'tower_hybrid'
    )
      return;
    this.bullets.push({
      x: options?.originX ?? unit.body.x,
      y: options?.originY ?? unit.body.y,
      vx,
      vy,
      team: unit.team,
      damage: options?.damage ?? unit.damage,
      radius: spec.hitRadius,
      life: 1.2,
      drawColor: spec.color,
      drawRadius: spec.drawRadius,
      trailLength: spec.trailLength,
      trailAlpha: spec.trailAlpha,
      sourceRole: unit.role,
      sourceClass: unit.tankClass
    });
    if (unit.role === 'air_fighter' && unit.team === 'player') {
      this.playAirShotSfx(unit.tankClass ?? 'light');
    }
    if (unit.role === 'naval_ship' && unit.team === 'player') {
      this.playNavalShotSfx(unit.tankClass ?? 'light');
    }
  }

  private getProjectileSpec(unit: (typeof this.units)[number]) {
    if (unit.role === 'air_fighter') {
      if (unit.tankClass === 'heavy') {
        return {
          speed: 335,
          hitRadius: 4,
          drawRadius: 4.9,
          color: 0xff9b6a,
          trailLength: 14,
          trailAlpha: 0.34
        };
      }
      if (unit.tankClass === 'medium') {
        return {
          speed: 405,
          hitRadius: 3.4,
          drawRadius: 3.8,
          color: 0xffd166,
          trailLength: 10,
          trailAlpha: 0.28
        };
      }
      return {
        speed: 470,
        hitRadius: 2.6,
        drawRadius: 3.0,
        color: 0x8ec5ff,
        trailLength: 8,
        trailAlpha: 0.24
      };
    }
    if (unit.role === 'tower_air') {
      return { speed: 470, hitRadius: 2.8, drawRadius: 3.2, color: 0xffc15a, trailLength: 12, trailAlpha: 0.3 };
    }
    if (unit.role === 'tower_coastal') {
      return { speed: 360, hitRadius: 3.8, drawRadius: 4.2, color: 0x74c8ff, trailLength: 10, trailAlpha: 0.26 };
    }
    if (unit.role === 'naval_ship') {
      if (unit.tankClass === 'heavy') {
        return { speed: 345, hitRadius: 4.4, drawRadius: 5.1, color: 0x6fb1ff, trailLength: 12, trailAlpha: 0.28 };
      }
      if (unit.tankClass === 'medium') {
        return { speed: 390, hitRadius: 3.4, drawRadius: 3.9, color: 0x89ceff, trailLength: 9, trailAlpha: 0.22 };
      }
      return { speed: 430, hitRadius: 2.8, drawRadius: 3.1, color: 0xc6f0ff, trailLength: 7, trailAlpha: 0.18 };
    }
    if (unit.role === 'tower_hybrid') {
      return { speed: 390, hitRadius: 3.2, drawRadius: 3.6, color: 0x8af7b2, trailLength: 8, trailAlpha: 0.24 };
    }
    if (unit.role === 'tower_ground') {
      return { speed: 345, hitRadius: 3.8, drawRadius: 4.2, color: 0x57b7ff, trailLength: 9, trailAlpha: 0.25 };
    }
    if (unit.tankClass === 'heavy') {
      return { speed: 355, hitRadius: 3.8, drawRadius: 4.3, color: 0xff6b6b, trailLength: 7, trailAlpha: 0.2 };
    }
    if (unit.tankClass === 'medium') {
      return { speed: 370, hitRadius: 3.2, drawRadius: 3.6, color: 0xffb347, trailLength: 6, trailAlpha: 0.18 };
    }
    return {
      speed: 380,
      hitRadius: 2.8,
      drawRadius: 3.1,
      color: unit.team === 'player' ? 0x6fe2ff : 0xff6b6b,
      trailLength: 5,
      trailAlpha: 0.14
    };
  }

  private ensureAudioReady() {
    if (typeof window === 'undefined') return;
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    if (!this.audioCtx) {
      this.audioCtx = new AudioCtor();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
  }

  private playAirShotSfx(kind: 'light' | 'medium' | 'heavy') {
    this.ensureAudioReady();
    const ctx = this.audioCtx;
    if (!ctx) return;
    const nowMs = this.time.now;
    const minInterval = kind === 'light' ? 40 : kind === 'medium' ? 65 : 90;
    if (nowMs - this.lastAirShotSfxAt[kind] < minInterval) return;
    this.lastAirShotSfxAt[kind] = nowMs;

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = kind === 'heavy' ? 'square' : kind === 'medium' ? 'triangle' : 'sawtooth';
    const startFreq = kind === 'heavy' ? 160 : kind === 'medium' ? 230 : 340;
    const endFreq = kind === 'heavy' ? 110 : kind === 'medium' ? 180 : 240;
    const vol = kind === 'heavy' ? 0.08 : kind === 'medium' ? 0.055 : 0.04;
    const dur = kind === 'heavy' ? 0.13 : kind === 'medium' ? 0.1 : 0.075;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(kind === 'heavy' ? 1800 : 2400, t0);
    osc.frequency.setValueAtTime(startFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  private playNavalShotSfx(kind: 'light' | 'medium' | 'heavy') {
    this.ensureAudioReady();
    const ctx = this.audioCtx;
    if (!ctx) return;
    const nowMs = this.time.now;
    const minInterval = kind === 'light' ? 45 : kind === 'medium' ? 70 : 95;
    if (nowMs - this.lastNavalShotSfxAt[kind] < minInterval) return;
    this.lastNavalShotSfxAt[kind] = nowMs;

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = kind === 'heavy' ? 'sawtooth' : kind === 'medium' ? 'triangle' : 'square';
    const startFreq = kind === 'heavy' ? 120 : kind === 'medium' ? 190 : 280;
    const endFreq = kind === 'heavy' ? 82 : kind === 'medium' ? 145 : 230;
    const vol = kind === 'heavy' ? 0.085 : kind === 'medium' ? 0.058 : 0.038;
    const dur = kind === 'heavy' ? 0.16 : kind === 'medium' ? 0.11 : 0.075;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(kind === 'heavy' ? 1450 : kind === 'medium' ? 1900 : 2400, t0);
    osc.frequency.setValueAtTime(startFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  private updateBullets(dt: number) {
    if (this.bullets.length === 0) return;
    const next: typeof this.bullets = [];
    this.bullets.forEach((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      let hit = false;
      this.units.forEach((u) => {
        if (hit || u.team === b.team || u.hp <= 0) return;
        if (b.sourceRole === 'tank' && u.role === 'air_fighter') return;
        if (b.sourceRole === 'tank' && u.role === 'naval_ship') return;
        if (b.sourceRole === 'tower_ground' && u.role === 'air_fighter') return;
        if (b.sourceRole === 'tower_coastal' && u.role !== 'naval_ship') return;
        if (b.sourceRole === 'tower_air' && u.role !== 'air_fighter') return;
        if (b.sourceRole === 'naval_ship' && u.role === 'air_fighter') return;
        const dx = u.body.x - b.x;
        const dy = u.body.y - b.y;
          const r = b.radius + u.size * 0.5;
        if (dx * dx + dy * dy <= r * r) {
          u.hp -= b.damage;
          u.hitFlash = 0.12;
          if (u.hp <= 0) u.hp = 0;
          hit = true;
        }
      });
      if (!hit) {
        this.resourceNodes.forEach((node) => {
          if (hit || !node.extractorOwner || node.extractorOwner === b.team) return;
          if (b.sourceRole === 'tower_air') return;
          if ((node.extractorHp ?? 0) <= 0) return;
          const pos = this.gridToWorld(node.x, node.y);
          const dx = pos.x - b.x;
          const dy = pos.y - b.y;
          const r = b.radius + this.cfg.tileSize * 0.8;
          if (dx * dx + dy * dy <= r * r) {
            node.extractorHp = (node.extractorHp ?? 0) - b.damage;
            node.extractorHpTimer = 1.2;
            if ((node.extractorHp ?? 0) <= 0) {
              node.extractorHp = 0;
              node.extractorOwner = null;
              node.extractorLevel = 1;
              node.upgrading = false;
              node.upgradeProgress = 0;
              node.upgraderId = undefined;
              node.buildProgress = 0;
              node.buildTeam = null;
              node.builderId = undefined;
              if (this.selectedExtractor === node) this.selectedExtractor = null;
              this.buildMarkers();
            }
            hit = true;
          }
        });
      }

      if (!hit && b.life > 0) {
        next.push(b);
      }
    });
    this.bullets = next;
    this.renderBullets();
  }

  private renderBullets() {
    const gfx = this.bulletGfx;
    if (!gfx) return;
    gfx.clear();
    this.bullets.forEach((b) => {
      const color = b.drawColor ?? (b.team === 'player' ? 0x6fe2ff : 0xff6b6b);
      const radius = b.drawRadius ?? b.radius;
      const speedLen = Math.hypot(b.vx, b.vy);
      if ((b.trailLength ?? 0) > 0 && speedLen > 0.001) {
        const ux = b.vx / speedLen;
        const uy = b.vy / speedLen;
        const tx = b.x - ux * (b.trailLength ?? 0);
        const ty = b.y - uy * (b.trailLength ?? 0);
        gfx.lineStyle(1.4, color, b.trailAlpha ?? 0.2);
        gfx.beginPath();
        gfx.moveTo(tx, ty);
        gfx.lineTo(b.x, b.y);
        gfx.strokePath();
      }
      gfx.fillStyle(color, 0.92);
      gfx.fillCircle(b.x, b.y, radius);
      if (b.sourceClass === 'heavy' || (b.sourceRole === 'air_fighter' && b.sourceClass === 'medium')) {
        gfx.fillStyle(0xffffff, 0.5);
        gfx.fillCircle(b.x, b.y, 1.3);
      }
    });
  }

  private renderSelectionMarkers() {
    const gfx = this.selectionMarkerGfx;
    if (!gfx) return;
    gfx.clear();
    if (this.selectedUnits.length === 0) return;

    if (this.selectedUnits.length === 1) {
      const unit = this.selectedUnits[0];
      if (this.isAttackCapable(unit) && unit.range > 0) {
        gfx.lineStyle(1.8, 0x6fe2ff, 0.78);
        gfx.strokeCircle(unit.body.x, unit.body.y, unit.range);
        gfx.lineStyle(1, 0x6fe2ff, 0.25);
        gfx.strokeCircle(unit.body.x, unit.body.y, unit.range * 0.66);
      }
      return;
    }

    this.selectedUnits.forEach((unit) => {
      if (!this.isMovablePlayerUnit(unit)) return;
      const radius = Math.max(7, unit.size * 0.24);
      gfx.fillStyle(0x6fe2ff, 0.16);
      gfx.fillCircle(unit.body.x, unit.body.y, radius);
      gfx.lineStyle(1.4, 0x7dd3ff, 0.95);
      gfx.strokeCircle(unit.body.x, unit.body.y, radius);
    });
  }

  private renderCommandPaths() {
    const gfx = this.commandPathGfx;
    if (!gfx) return;
    gfx.clear();
    const now = this.time.now;
    this.moveCommandPreview = this.moveCommandPreview.filter((cmd) => cmd.expiresAt > now);
    if (this.moveCommandPreview.length === 0) return;
    this.moveCommandPreview.forEach((cmd) => {
      if (cmd.points.length < 2) return;
      const alpha = Phaser.Math.Clamp((cmd.expiresAt - now) / 1200, 0, 1);
      // Rusted Warfare style: thin route with repeated arrow segments.
      gfx.lineStyle(1.6, 0x7fd9ff, 0.65 * alpha);
      gfx.beginPath();
      gfx.moveTo(cmd.points[0].x, cmd.points[0].y);
      for (let i = 1; i < cmd.points.length; i++) {
        gfx.lineTo(cmd.points[i].x, cmd.points[i].y);
      }
      gfx.strokePath();

      const spacing = 18;
      for (let i = 1; i < cmd.points.length; i++) {
        const a = cmd.points[i - 1];
        const b = cmd.points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;
        const ux = dx / len;
        const uy = dy / len;
        const px = -uy;
        const py = ux;
        const arrowLen = 6;
        const arrowWidth = 3.2;
        const count = Math.floor(len / spacing);
        for (let s = 1; s <= count; s++) {
          const t = (s * spacing) / len;
          const cx = a.x + dx * t;
          const cy = a.y + dy * t;
          const tipX = cx + ux * arrowLen;
          const tipY = cy + uy * arrowLen;
          const leftX = cx - ux * arrowLen * 0.2 + px * arrowWidth;
          const leftY = cy - uy * arrowLen * 0.2 + py * arrowWidth;
          const rightX = cx - ux * arrowLen * 0.2 - px * arrowWidth;
          const rightY = cy - uy * arrowLen * 0.2 - py * arrowWidth;
          gfx.lineStyle(1.2, 0xa9ecff, 0.86 * alpha);
          gfx.beginPath();
          gfx.moveTo(leftX, leftY);
          gfx.lineTo(tipX, tipY);
          gfx.lineTo(rightX, rightY);
          gfx.strokePath();
        }
      }

      const end = cmd.points[cmd.points.length - 1];
      const prev = cmd.points[cmd.points.length - 2];
      const ex = end.x - prev.x;
      const ey = end.y - prev.y;
      const el = Math.hypot(ex, ey);
      if (el > 0.001) {
        const ux = ex / el;
        const uy = ey / el;
        const px = -uy;
        const py = ux;
        const tip = 8;
        const wing = 4.5;
        const cx = end.x - ux * 3;
        const cy = end.y - uy * 3;
        gfx.lineStyle(1.8, 0xb8f0ff, 0.92 * alpha);
        gfx.beginPath();
        gfx.moveTo(cx + px * wing, cy + py * wing);
        gfx.lineTo(cx + ux * tip, cy + uy * tip);
        gfx.lineTo(cx - px * wing, cy - py * wing);
        gfx.strokePath();
      }
    });
  }

  private isGroundMobile(unit: (typeof this.units)[number]) {
    return (
      unit.role !== 'air_fighter' &&
      unit.role !== 'naval_ship' &&
      unit.role !== 'base' &&
      unit.role !== 'factory_ground' &&
      unit.role !== 'factory_air' &&
      unit.role !== 'factory_naval' &&
      unit.role !== 'tower_ground' &&
      unit.role !== 'tower_air' &&
      unit.role !== 'tower_coastal' &&
      unit.role !== 'tower_hybrid'
    );
  }

  // Apply a lightweight separation step so selected groups flow instead of stacking.
  private applyGroundSeparation(dt: number) {
    const mobiles = this.units.filter((u) => this.isGroundMobile(u) && u.hp > 0);
    if (mobiles.length < 2) return;
    const maxPush = Math.max(0.6, this.cfg.tileSize * 0.12) * (dt * 60);
    for (let i = 0; i < mobiles.length; i++) {
      const a = mobiles[i];
      for (let j = i + 1; j < mobiles.length; j++) {
        const b = mobiles[j];
        const dx = b.body.x - a.body.x;
        const dy = b.body.y - a.body.y;
        const distSq = dx * dx + dy * dy;
        const minDist = (a.size + b.size) * 0.45;
        if (distSq >= minDist * minDist) continue;
        const dist = Math.sqrt(Math.max(0.0001, distSq));
        const overlap = minDist - dist;
        const ux = dx / dist;
        const uy = dy / dist;
        const push = Math.min(maxPush, overlap * 0.5);
        const ax = Phaser.Math.Clamp(a.body.x - ux * push, a.size * 0.5, this.worldWidth - a.size * 0.5);
        const ay = Phaser.Math.Clamp(a.body.y - uy * push, a.size * 0.5, this.worldHeight - a.size * 0.5);
        const bx = Phaser.Math.Clamp(b.body.x + ux * push, b.size * 0.5, this.worldWidth - b.size * 0.5);
        const by = Phaser.Math.Clamp(b.body.y + uy * push, b.size * 0.5, this.worldHeight - b.size * 0.5);
        const ag = this.worldToGrid(ax, ay);
        const bg = this.worldToGrid(bx, by);
        if (!ag || this.canUnitOccupyCell(a, ag.x, ag.y)) a.body.setPosition(ax, ay);
        if (!bg || this.canUnitOccupyCell(b, bg.x, bg.y)) b.body.setPosition(bx, by);
      }
    }
  }

  private applyAirSeparation(dt: number) {
    const flyers = this.units.filter((u) => u.role === 'air_fighter' && u.hp > 0);
    if (flyers.length < 2) return;
    const maxPush = Math.max(0.7, this.cfg.tileSize * 0.16) * (dt * 60);
    for (let i = 0; i < flyers.length; i++) {
      const a = flyers[i];
      for (let j = i + 1; j < flyers.length; j++) {
        const b = flyers[j];
        const dx = b.body.x - a.body.x;
        const dy = b.body.y - a.body.y;
        const distSq = dx * dx + dy * dy;
        const minDist = (a.size + b.size) * 0.52;
        if (distSq >= minDist * minDist) continue;
        const dist = Math.sqrt(Math.max(0.0001, distSq));
        const overlap = minDist - dist;
        const ux = dx / dist;
        const uy = dy / dist;
        const push = Math.min(maxPush, overlap * 0.5);
        const ax = Phaser.Math.Clamp(a.body.x - ux * push, a.size * 0.5, this.worldWidth - a.size * 0.5);
        const ay = Phaser.Math.Clamp(a.body.y - uy * push, a.size * 0.5, this.worldHeight - a.size * 0.5);
        const bx = Phaser.Math.Clamp(b.body.x + ux * push, b.size * 0.5, this.worldWidth - b.size * 0.5);
        const by = Phaser.Math.Clamp(b.body.y + uy * push, b.size * 0.5, this.worldHeight - b.size * 0.5);
        a.body.setPosition(ax, ay);
        b.body.setPosition(bx, by);
      }
    }
  }

  private rebuildCrowdCost() {
    const rows = this.blocked.length;
    const cols = this.blocked[0]?.length ?? 0;
    if (rows <= 0 || cols <= 0) return;
    if (this.crowdCost.length !== rows || this.crowdCost[0]?.length !== cols) {
      this.crowdCost = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
    } else {
      for (let y = 0; y < rows; y++) {
        this.crowdCost[y].fill(0);
      }
    }
    const mobiles = this.units.filter((u) => this.isGroundMobile(u) && u.hp > 0);
    mobiles.forEach((unit) => {
      const c = this.worldToGrid(unit.body.x, unit.body.y);
      if (!c) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (this.blocked[ny][nx]) continue;
          const manhattan = Math.abs(dx) + Math.abs(dy);
          let add = 0;
          if (manhattan === 0) add = 1.6;
          else if (manhattan === 1) add = 0.95;
          else if (manhattan === 2) add = 0.45;
          else continue;
          this.crowdCost[ny][nx] += add;
        }
      }
    });
  }

  private updateHpBars(dt: number) {
    this.units.forEach((unit) => {
      if (!unit.hpBar) return;
      const alwaysShowEnemy = unit.team === 'ai';
      const alwaysShowBuilding =
        unit.role === 'base' ||
        unit.role === 'factory_ground' ||
        unit.role === 'factory_air' ||
        unit.role === 'factory_naval' ||
        unit.role === 'tower_ground' ||
        unit.role === 'tower_air' ||
        unit.role === 'tower_coastal' ||
        unit.role === 'tower_hybrid';
      const shouldShow =
        alwaysShowEnemy ||
        alwaysShowBuilding ||
        (unit.hitFlash && unit.hitFlash > 0
          ? true
          : this.selectedUnits.includes(unit));
      if (!shouldShow) {
        unit.hpBar.clear();
        return;
      }
      const isBuilding =
        unit.role === 'base' ||
        unit.role === 'factory_ground' ||
        unit.role === 'factory_air' ||
        unit.role === 'factory_naval' ||
        unit.role === 'tower_ground' ||
        unit.role === 'tower_air' ||
        unit.role === 'tower_coastal' ||
        unit.role === 'tower_hybrid';
      const w = Phaser.Math.Clamp(unit.size * (isBuilding ? 0.72 : 0.9), 38, 104);
      const h = isBuilding ? 6 : 5;
      const x = unit.body.x - w / 2;
      const anchorY = unit.body.y - unit.size * (isBuilding ? 0.46 : 0.62);
      const y = anchorY - h * 0.5;
      const pct = Phaser.Math.Clamp(unit.hp / unit.maxHp, 0, 1);
      unit.hpBar.clear();
      unit.hpBar.fillStyle(0x0b0f18, 0.82);
      unit.hpBar.fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 2);
      const color = unit.team === 'player' ? 0x6fe2ff : 0xff6b6b;
      unit.hpBar.fillStyle(color, 0.9);
      unit.hpBar.fillRoundedRect(x, y, w * pct, h, 2);
    });

    this.extractorSprites.forEach(({ node, hpBar, sprite }) => {
      const show = (node.extractorHpTimer ?? 0) > 0;
      if (!show) {
        hpBar.clear();
        return;
      }
      node.extractorHpTimer = Math.max(0, (node.extractorHpTimer ?? 0) - dt);
      const w = this.getHarvesterSize() * 0.62;
      const h = 6;
      const x = sprite.x - w / 2;
      const y = sprite.y - this.getHarvesterSize() * 0.46 - h * 0.5;
      const pct = Phaser.Math.Clamp((node.extractorHp ?? 0) / (node.extractorMaxHp ?? 1), 0, 1);
      hpBar.clear();
      hpBar.fillStyle(0x0b0f18, 0.82);
      hpBar.fillRoundedRect(x - 1, y - 1, w + 2, h + 2, 2);
      const color = node.extractorOwner === 'player' ? 0x6fe2ff : 0xff6b6b;
      hpBar.fillStyle(color, 0.9);
      hpBar.fillRoundedRect(x, y, w * pct, h, 2);
    });
  }

  private addCredits(amount: number) {
    if (amount <= 0) return;
    this.credits += amount;
    this.emitCredits();
  }

  private spendCredits(amount: number) {
    if (amount <= 0) return true;
    if (this.credits < amount) return false;
    this.credits -= amount;
    this.emitCredits();
    return true;
  }

  private emitCredits() {
    if (this.lastCredits !== this.credits) {
      this.lastCredits = this.credits;
      this.events.emit('credits', this.credits);
    } else if (this.lastCredits === this.credits) {
      this.events.emit('credits', this.credits);
    }
  }

  private findSpawnPoint(team: 'player' | 'ai') {
    const spawn = this.cfg.spawnPoints?.find((pt) => pt.team === team);
    if (spawn) return spawn;
    return {
      x: Math.floor(this.cfg.cols / 2),
      y: team === 'player' ? Math.floor(this.cfg.rows * 0.2) : Math.floor(this.cfg.rows * 0.8),
      team
    };
  }

  private spawnUnit(
    team: 'player' | 'ai',
    role: UnitRole,
    preferred?: { x: number; y: number },
    options?: { tankClass?: TankClass; towerFacingIndex?: number; isInitialDefense?: boolean }
  ) {
    const base = preferred ?? this.findSpawnPoint(team);
    const offsets = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 }
    ];
    const tankClass = options?.tankClass ?? 'light';
    const spawnSize = this.getUnitSize(role, tankClass);
    let spawnPos = this.gridToWorld(base.x, base.y);
    for (const off of offsets) {
      const gx = Phaser.Math.Clamp(base.x + off.x, 0, this.cfg.cols - 1);
      const gy = Phaser.Math.Clamp(base.y + off.y, 0, this.cfg.rows - 1);
      if (!this.canRoleOccupyCell(role, gx, gy)) continue;
      const pos = this.gridToWorld(gx, gy);
      const occupied = this.units.some((u) => Phaser.Math.Distance.Between(u.body.x, u.body.y, pos.x, pos.y) < (u.size + spawnSize) * 0.5);
      if (!occupied) {
        spawnPos = pos;
        break;
      }
    }

    const tankStats =
      tankClass === 'heavy'
        ? { hp: 520, damage: 48, range: this.cfg.tileSize * 6.6, speed: 54, fireRate: 0.52 }
        : tankClass === 'medium'
        ? { hp: 300, damage: 24, range: this.cfg.tileSize * 5.8, speed: 74, fireRate: 0.9 }
        : { hp: 180, damage: 12, range: this.cfg.tileSize * 4.8, speed: 92, fireRate: 1.45 };
    const airStats =
      tankClass === 'heavy'
        ? { hp: 390, damage: 42, range: this.cfg.tileSize * 6.8, speed: 114, fireRate: 0.62 }
        : tankClass === 'medium'
        ? { hp: 240, damage: 24, range: this.cfg.tileSize * 5.8, speed: 132, fireRate: 1.05 }
        : { hp: 140, damage: 14, range: this.cfg.tileSize * 4.8, speed: 150, fireRate: 1.6 };
    const navalStats =
      tankClass === 'heavy'
        ? { hp: 560, damage: 52, range: this.cfg.tileSize * 6.8, speed: 52, fireRate: 0.55 }
        : tankClass === 'medium'
        ? { hp: 320, damage: 26, range: this.cfg.tileSize * 6.0, speed: 74, fireRate: 0.95 }
        : { hp: 190, damage: 13, range: this.cfg.tileSize * 5.2, speed: 95, fireRate: 1.5 };
    const towerStats =
      role === 'tower_air'
        ? { hp: 360, damage: 18, range: this.cfg.tileSize * 7.0, fireRate: 1.7 }
        : role === 'tower_coastal'
        ? { hp: 440, damage: 34, range: this.cfg.tileSize * 7.4, fireRate: 0.78 }
        : role === 'tower_hybrid'
        ? { hp: 460, damage: 22, range: this.cfg.tileSize * 6.4, fireRate: 1.05 }
        : { hp: 420, damage: 30, range: this.cfg.tileSize * 6.2, fireRate: 0.72 };
    const playerTankColor = tankClass === 'heavy' ? 0x6fe2ff : 0xffffff;
    const aiTankColor = tankClass === 'heavy' ? 0xff6b6b : 0xffffff;
    const color =
      team === 'ai'
        ? role === 'tank'
          ? aiTankColor
          : 0xff6b6b
        : role === 'engineer'
        ? 0x7ef5a6
        : role === 'factory_ground'
        ? 0x76d0ff
        : role === 'factory_air'
        ? 0xffb347
        : role === 'factory_naval'
        ? 0x74c8ff
        : role === 'tower_air'
        ? 0xffb347
        : role === 'tower_coastal'
        ? 0x74c8ff
        : role === 'tower_hybrid'
        ? 0x7ef5a6
        : role === 'tower_ground'
        ? 0x5bd1ff
        : role === 'base'
        ? 0xffb347
        : role === 'tank'
        ? playerTankColor
        : 0x6fe2ff;
    const tankSize = this.getUnitSize(role, tankClass);
    let body: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
    let shadow: Phaser.GameObjects.Ellipse | undefined;
    let airSelectRing: Phaser.GameObjects.Graphics | undefined;
    let attackRangeRing: Phaser.GameObjects.Graphics | undefined;
    if (role === 'tank') {
      const key = tankClass === 'heavy' ? 'tank_heavy' : tankClass === 'medium' ? 'tank_medium' : 'tank_light';
      const img = this.add.image(spawnPos.x, spawnPos.y, key);
      img.setDisplaySize(tankSize, tankSize);
      img.setDepth(8);
      body = img;
    } else if (role === 'engineer') {
      const img = this.add.image(spawnPos.x, spawnPos.y, 'engineer_small');
      img.setDisplaySize(tankSize, tankSize);
      img.setDepth(8);
      body = img;
    } else if (role === 'air_fighter') {
      const key =
        tankClass === 'heavy' ? 'air_fighter_heavy' : tankClass === 'medium' ? 'air_fighter_medium' : 'air_fighter_light';
      const img = this.add.image(spawnPos.x, spawnPos.y, key);
      img.setDisplaySize(tankSize, tankSize);
      img.setDepth(11);
      body = img;
      shadow = this.add.ellipse(spawnPos.x + 2, spawnPos.y + tankSize * 0.3, tankSize * 0.56, tankSize * 0.24, 0x000000, 0.28);
      shadow.setDepth(3);
      airSelectRing = this.add.graphics();
      airSelectRing.setDepth(12);
    } else if (role === 'naval_ship') {
      const key =
        tankClass === 'heavy' ? 'naval_ship_heavy' : tankClass === 'medium' ? 'naval_ship_medium' : 'naval_ship_light';
      const img = this.add.image(spawnPos.x, spawnPos.y, key);
      img.setDisplaySize(tankSize, tankSize);
      img.setDepth(9);
      body = img;
    } else if (role === 'tower_ground' || role === 'tower_air' || role === 'tower_coastal' || role === 'tower_hybrid') {
      const key =
        role === 'tower_air'
          ? 'tower_air'
          : role === 'tower_hybrid'
          ? 'tower_hybrid'
          : role === 'tower_coastal'
          ? 'tower_coastal'
          : 'tower_ground';
      const img = this.add.image(spawnPos.x, spawnPos.y, key);
      this.applyTowerSpriteOrigin(img, role);
      img.setDisplaySize(tankSize, tankSize);
      img.setDepth(4);
      body = img;
    } else {
      const imgKey =
        role === 'base'
          ? 'hq_base'
          : role === 'factory_air'
          ? 'factory_air_1'
          : role === 'factory_naval'
          ? 'factory_naval_1'
          : `factory_ground_${1}`;
      const imgSize = this.getUnitSize(role, tankClass);
      const img = this.add.image(spawnPos.x, spawnPos.y, imgKey);
      img.setDisplaySize(imgSize, imgSize);
      img.setDepth(4);
      body = img;
    }
    const hpBar = this.add.graphics();
    hpBar.setDepth(7);
    if (body instanceof Phaser.GameObjects.Image && team === 'ai') {
      body.setTint(0xffdfdf);
    }
    if (
      role === 'tank' ||
      role === 'air_fighter' ||
      role === 'naval_ship' ||
      role === 'tower_ground' ||
      role === 'tower_air' ||
      role === 'tower_coastal' ||
      role === 'tower_hybrid'
    ) {
      attackRangeRing = this.add.graphics();
      attackRangeRing.setDepth(10);
    }
    const unit: (typeof this.units)[number] = {
      id: this.unitIdCounter++,
      body,
      team,
      role,
      tankClass: role === 'tank' || role === 'air_fighter' || role === 'naval_ship' ? tankClass : undefined,
      factoryLevel: role === 'factory_ground' ? 1 : undefined,
      upgrading: role === 'factory_ground' ? false : undefined,
      upgradeTimer: role === 'factory_ground' ? 0 : undefined,
      airFactoryLevel: role === 'factory_air' ? 1 : undefined,
      airUpgrading: role === 'factory_air' ? false : undefined,
      airUpgradeTimer: role === 'factory_air' ? 0 : undefined,
      navalFactoryLevel: role === 'factory_naval' ? 1 : undefined,
      navalUpgrading: role === 'factory_naval' ? false : undefined,
      navalUpgradeTimer: role === 'factory_naval' ? 0 : undefined,
      size: tankSize,
      speed:
        role === 'base' ||
        role === 'factory_ground' ||
        role === 'factory_air' ||
        role === 'factory_naval' ||
        role === 'tower_ground' ||
        role === 'tower_air' ||
        role === 'tower_coastal' ||
        role === 'tower_hybrid'
          ? 0
          : role === 'engineer'
          ? 70
          : role === 'air_fighter'
          ? airStats.speed
          : role === 'naval_ship'
          ? navalStats.speed
          : tankStats.speed,
      hp:
        role === 'tank'
          ? tankStats.hp
          : role === 'air_fighter'
          ? airStats.hp
          : role === 'naval_ship'
          ? navalStats.hp
          : role === 'engineer'
          ? 120
          : role === 'factory_ground' || role === 'factory_air' || role === 'factory_naval'
          ? 520
          : role === 'tower_ground' || role === 'tower_air' || role === 'tower_coastal' || role === 'tower_hybrid'
          ? towerStats.hp
          : 600,
      maxHp:
        role === 'tank'
          ? tankStats.hp
          : role === 'air_fighter'
          ? airStats.hp
          : role === 'naval_ship'
          ? navalStats.hp
          : role === 'engineer'
          ? 120
          : role === 'factory_ground' || role === 'factory_air' || role === 'factory_naval'
          ? 520
          : role === 'tower_ground' || role === 'tower_air' || role === 'tower_coastal' || role === 'tower_hybrid'
          ? towerStats.hp
          : 600,
      damage:
        role === 'tank'
          ? tankStats.damage
          : role === 'air_fighter'
          ? airStats.damage
          : role === 'naval_ship'
          ? navalStats.damage
          : role === 'tower_ground' || role === 'tower_air' || role === 'tower_coastal' || role === 'tower_hybrid'
          ? towerStats.damage
          : 0,
      range:
        role === 'tank'
          ? tankStats.range
          : role === 'air_fighter'
          ? airStats.range
          : role === 'naval_ship'
          ? navalStats.range
          : role === 'tower_ground' || role === 'tower_air' || role === 'tower_coastal' || role === 'tower_hybrid'
          ? towerStats.range
          : 0,
      fireRate:
        role === 'tank'
          ? tankStats.fireRate
          : role === 'air_fighter'
          ? airStats.fireRate
          : role === 'naval_ship'
          ? navalStats.fireRate
          : role === 'tower_ground' || role === 'tower_air' || role === 'tower_coastal' || role === 'tower_hybrid'
          ? towerStats.fireRate
          : 0,
      fireTimer: 0,
      shadow,
      airSelectRing,
      attackRangeRing,
      hpBar,
      hitFlash: 0,
      pathIndex: 0,
      locked:
        role === 'base' ||
        role === 'factory_ground' ||
        role === 'factory_air' ||
        role === 'factory_naval' ||
        role === 'tower_ground' ||
        role === 'tower_air' ||
        role === 'tower_hybrid',
      isInitialDefense: options?.isInitialDefense === true
    };
    this.units.push(unit);
    if (role === 'tower_ground' || role === 'tower_air' || role === 'tower_coastal' || role === 'tower_hybrid') {
      if (options?.towerFacingIndex != null) {
        unit.body.setRotation(this.getTowerRotationFromFacing(role, options.towerFacingIndex));
      } else {
        this.rotateTowerToEnemyBase(unit);
      }
    }
  }

  public requestSpawnPlayerTank(cost = 90) {
    if (!this.spendCredits(cost)) return false;
    this.spawnUnit('player', 'tank');
    return true;
  }

  public requestQueueTank(cost = 90) {
    if (!this.spendCredits(cost)) return false;
    this.baseQueue.push('tank');
    this.emitBaseQueue();
    return true;
  }

  public requestQueueEngineer(cost = 80) {
    if (!this.spendCredits(cost)) return false;
    this.baseQueue.push('engineer');
    this.emitBaseQueue();
    return true;
  }

  public requestQueueFactoryTank(cost = 100) {
    if (!this.spendCredits(cost)) return false;
    this.factoryQueue.push('light');
    this.emitFactoryQueue();
    return true;
  }

  public requestQueueFactoryTankByClass(kind: TankClass, cost: number) {
    if (!this.spendCredits(cost)) return false;
    this.factoryQueue.push(kind);
    this.emitFactoryQueue();
    return true;
  }

  public requestQueueAirUnitByClass(kind: TankClass, cost: number) {
    if (!this.spendCredits(cost)) return false;
    this.airFactoryQueue.push(kind);
    this.emitAirFactoryQueue();
    return true;
  }

  public requestQueueNavalUnitByClass(kind: TankClass, cost: number) {
    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    if (mapKey !== 'sea-island') return false;
    const factory = this.findPlayerNavalFactory();
    const level = factory?.navalFactoryLevel ?? 0;
    if (!factory || factory.hp <= 0) return false;
    if (kind === 'medium' && level < 2) return false;
    if (kind === 'heavy' && level < 3) return false;
    if (!this.spendCredits(cost)) return false;
    this.navalFactoryQueue.push(kind);
    this.emitNavalFactoryQueue();
    return true;
  }

  public requestUpgradeFactory() {
    const factory = this.findPlayerFactory();
    if (!factory || factory.upgrading || !factory.factoryLevel) return false;
    if (factory.factoryLevel >= 3) return false;
    const cost = factory.factoryLevel === 1 ? 220 : 360;
    if (!this.spendCredits(cost)) return false;
    factory.upgrading = true;
    factory.upgradeTimer = 0.0001;
    this.emitFactoryQueue();
    return true;
  }

  public requestUpgradeAirFactory() {
    const factory = this.findPlayerAirFactory();
    if (!factory || factory.airUpgrading || !factory.airFactoryLevel) return false;
    if (factory.airFactoryLevel >= 3) return false;
    const cost = factory.airFactoryLevel === 1 ? 240 : 380;
    if (!this.spendCredits(cost)) return false;
    factory.airUpgrading = true;
    factory.airUpgradeTimer = 0.0001;
    this.emitAirFactoryQueue();
    return true;
  }

  public requestUpgradeNavalFactory() {
    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    if (mapKey !== 'sea-island') return false;
    const factory = this.findPlayerNavalFactory();
    if (!factory || factory.navalUpgrading || !factory.navalFactoryLevel) return false;
    if (factory.navalFactoryLevel >= 3) return false;
    const cost = factory.navalFactoryLevel === 1 ? 240 : 380;
    if (!this.spendCredits(cost)) return false;
    factory.navalUpgrading = true;
    factory.navalUpgradeTimer = 0.0001;
    this.emitNavalFactoryQueue();
    return true;
  }

  public getCredits() {
    return this.credits;
  }

  public isSceneReady() {
    return this.sceneReady;
  }

  public panCameraBy(dx: number, dy: number) {
    const cam = this.cameras.main;
    cam.setScroll(cam.scrollX + dx, cam.scrollY + dy);
    this.renderMiniMap(cam);
  }

  public zoomCameraBy(delta: number) {
    const cam = this.cameras.main;
    const nextZoom = Phaser.Math.Clamp(cam.zoom + delta, 0.65, 2.4);
    cam.setZoom(nextZoom);
    this.applyViewClamp(cam);
    this.renderMiniMap(cam);
  }

  private findPlayerBase() {
    return this.units.find((u) => u.team === 'player' && u.role === 'base') ?? null;
  }

  private findFreeSpawnNear(x: number, y: number, role: UnitRole = 'tank') {
    const rings = 4;
    for (let r = 0; r <= rings; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const gx = Phaser.Math.Clamp(x + dx, 0, this.cfg.cols - 1);
          const gy = Phaser.Math.Clamp(y + dy, 0, this.cfg.rows - 1);
          if (!this.canRoleOccupyCell(role, gx, gy)) continue;
          const pos = this.gridToWorld(gx, gy);
          const occupied = this.units.some(
            (u) => Phaser.Math.Distance.Between(u.body.x, u.body.y, pos.x, pos.y) < (u.size + this.cfg.tileSize) * 0.5
          );
          if (!occupied) return { x: gx, y: gy };
        }
      }
    }
    return null;
  }

  private findPlayerFactory() {
    return this.units.find((u) => u.team === 'player' && u.role === 'factory_ground') ?? null;
  }

  private findPlayerAirFactory() {
    return this.units.find((u) => u.team === 'player' && u.role === 'factory_air') ?? null;
  }

  private findPlayerNavalFactory() {
    return this.units.find((u) => u.team === 'player' && u.role === 'factory_naval') ?? null;
  }

  private getGroundFactoryBaseBuildDuration(kind: 'light' | 'medium' | 'heavy') {
    if (kind === 'light') return 2.8;
    if (kind === 'medium') return 4.6;
    return 7.8;
  }

  private getGroundFactoryBuildDuration(
    level: 1 | 2 | 3,
    kind: 'light' | 'medium' | 'heavy'
  ) {
    const rank = Math.max(1, Math.min(3, level));
    return this.getGroundFactoryBaseBuildDuration(kind) * Math.pow(0.5, rank - 1);
  }

  private getAirFighterBaseBuildDuration(kind: 'light' | 'medium' | 'heavy') {
    if (kind === 'light') return 3.2;
    if (kind === 'medium') return 5.2;
    return 8.4;
  }

  private getAirFactoryBuildDuration(
    level: 1 | 2 | 3,
    kind: TankClass
  ) {
    const rank = Math.max(1, Math.min(3, level));
    return this.getAirFighterBaseBuildDuration(kind) * Math.pow(0.5, rank - 1);
  }

  private getNavalShipBaseBuildDuration(kind: TankClass) {
    if (kind === 'light') return 3.0;
    if (kind === 'medium') return 4.8;
    return 7.2;
  }

  private getNavalFactoryBuildDuration(
    level: 1 | 2 | 3,
    kind: TankClass
  ) {
    const rank = Math.max(1, Math.min(3, level));
    return this.getNavalShipBaseBuildDuration(kind) * Math.pow(0.5, rank - 1);
  }

  private emitBaseQueue() {
    const active = this.baseQueue.length > 0;
    const progress = active ? Math.min(1, this.baseBuildTimer / this.baseBuildDuration) : 0;
    this.events.emit('baseQueue', {
      length: this.baseQueue.length,
      progress
    });
  }

  private emitFactoryQueue() {
    const factory = this.findPlayerFactory();
    const active = this.factoryQueue.length > 0;
    const currentKind = this.factoryQueue[0] ?? 'light';
    const duration = this.getGroundFactoryBuildDuration(factory?.factoryLevel ?? 1, currentKind);
    const progress = active ? Math.min(1, this.factoryBuildTimer / duration) : 0;
    this.events.emit('factoryQueue', {
      length: this.factoryQueue.length,
      progress,
      level: factory?.factoryLevel ?? 1,
      upgrading: factory?.upgrading ?? false,
      upgradeProgress: factory?.upgrading
        ? Math.min(1, (factory.upgradeTimer ?? 0) / this.factoryUpgradeDuration)
        : 0
    });
  }

  private emitAirFactoryQueue() {
    const factory = this.findPlayerAirFactory();
    const active = this.airFactoryQueue.length > 0;
    const currentKind = this.airFactoryQueue[0] ?? 'light';
    const duration = this.getAirFactoryBuildDuration(factory?.airFactoryLevel ?? 1, currentKind);
    const progress = active ? Math.min(1, this.airFactoryBuildTimer / duration) : 0;
    this.events.emit('airFactoryQueue', {
      length: this.airFactoryQueue.length,
      progress,
      level: factory?.airFactoryLevel ?? 1,
      upgrading: factory?.airUpgrading ?? false,
      upgradeProgress: factory?.airUpgrading
        ? Math.min(1, (factory.airUpgradeTimer ?? 0) / this.airFactoryUpgradeDuration)
        : 0
    });
  }

  private emitNavalFactoryQueue() {
    const factory = this.findPlayerNavalFactory();
    const active = this.navalFactoryQueue.length > 0;
    const currentKind = this.navalFactoryQueue[0] ?? 'light';
    const duration = this.getNavalFactoryBuildDuration(factory?.navalFactoryLevel ?? 1, currentKind);
    const progress = active ? Math.min(1, this.navalFactoryBuildTimer / duration) : 0;
    this.events.emit('navalFactoryQueue', {
      length: this.navalFactoryQueue.length,
      progress,
      level: factory?.navalFactoryLevel ?? 1,
      upgrading: factory?.navalUpgrading ?? false,
      upgradeProgress: factory?.navalUpgrading
        ? Math.min(1, (factory.navalUpgradeTimer ?? 0) / this.navalFactoryUpgradeDuration)
        : 0
    });
  }

  public debugEliminate(side: 'player' | 'ai') {
    if (this.gameOver) return;
    this.units.forEach((u) => {
      if (u.team !== side) return;
      u.hp = 0;
    });
    this.resourceNodes.forEach((n) => {
      if (n.extractorOwner === side) {
        n.extractorOwner = null;
        n.extractorHp = 0;
        n.extractorLevel = 1;
        n.upgrading = false;
        n.upgradeProgress = 0;
        n.upgraderId = undefined;
      }
    });
    this.buildMarkers();
    this.checkGameOver();
  }

  private findResourceNodeAt(worldX: number, worldY: number) {
    const radius = this.cfg.tileSize * 0.7;
    for (const node of this.resourceNodes) {
      const pos = this.gridToWorld(node.x, node.y);
      const dx = pos.x - worldX;
      const dy = pos.y - worldY;
      if (dx * dx + dy * dy <= radius * radius) return node;
    }
    return null;
  }

  private findExtractorAt(worldX: number, worldY: number) {
    const radius = this.cfg.tileSize * 0.8;
    for (const node of this.resourceNodes) {
      if (node.extractorOwner !== 'player') continue;
      const pos = this.gridToWorld(node.x, node.y);
      const dx = pos.x - worldX;
      const dy = pos.y - worldY;
      if (dx * dx + dy * dy <= radius * radius) return node;
    }
    return null;
  }

  private startBuildFactory(worldX: number, worldY: number) {
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    const builder = engineers.find((e) => !e.locked) ?? engineers[0];
    if (!builder || builder.locked) return false;
    const grid = this.worldToGrid(worldX, worldY);
    if (!grid) return false;
    if (this.blocked[grid.y]?.[grid.x]) return false;
    const occupiedFactory = this.units.some(
      (u) =>
        (u.role === 'factory_ground' || u.role === 'factory_air' || u.role === 'factory_naval') &&
        this.worldToGrid(u.body.x, u.body.y)?.x === grid.x &&
        this.worldToGrid(u.body.x, u.body.y)?.y === grid.y
    );
    if (occupiedFactory) return false;
    const hasSite = this.factoryBuildSites.some((s) => s.x === grid.x && s.y === grid.y);
    if (hasSite) return false;
    const target = this.gridToWorld(grid.x, grid.y);
    const targetSize = this.getBuildFootprintSize('factory_ground');
    if (!this.commandBuilderToBuild(builder, target, targetSize)) return false;
    this.factoryBuildSites.push({
      x: grid.x,
      y: grid.y,
      team: 'player',
      progress: 0,
      builderId: builder.id,
      type: 'ground'
    });
    return true;
  }

  private startBuildAirFactory(worldX: number, worldY: number) {
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    const builder = engineers.find((e) => !e.locked) ?? engineers[0];
    if (!builder || builder.locked) return false;
    const grid = this.worldToGrid(worldX, worldY);
    if (!grid) return false;
    if (this.blocked[grid.y]?.[grid.x]) return false;
    const occupiedFactory = this.units.some(
      (u) =>
        (u.role === 'factory_ground' || u.role === 'factory_air' || u.role === 'factory_naval') &&
        this.worldToGrid(u.body.x, u.body.y)?.x === grid.x &&
        this.worldToGrid(u.body.x, u.body.y)?.y === grid.y
    );
    if (occupiedFactory) return false;
    const hasSite = this.factoryBuildSites.some((s) => s.x === grid.x && s.y === grid.y);
    if (hasSite) return false;
    const target = this.gridToWorld(grid.x, grid.y);
    const targetSize = this.getBuildFootprintSize('factory_air');
    if (!this.commandBuilderToBuild(builder, target, targetSize)) return false;
    this.factoryBuildSites.push({
      x: grid.x,
      y: grid.y,
      team: 'player',
      progress: 0,
      builderId: builder.id,
      type: 'air'
    });
    return true;
  }

  private canPlaceNavalFactoryAt(grid: { x: number; y: number }) {
    if (this.hasBlockingStructureAt(grid)) return false;
    // 船坞支持两种选址：
    // 1) 直接放在浅海格；2) 放在陆地且紧邻浅海（岸边）。
    if (this.isShallowWaterCell(grid.x, grid.y)) return true;
    const isLand = !this.blocked[grid.y]?.[grid.x] && !this.isWaterCell(grid.x, grid.y);
    if (!isLand) return false;
    return this.hasAdjacentShallowWater(grid);
  }

  private hasAdjacentShallowWater(grid: { x: number; y: number }) {
    return (
      this.isShallowWaterCell(grid.x + 1, grid.y) ||
      this.isShallowWaterCell(grid.x - 1, grid.y) ||
      this.isShallowWaterCell(grid.x, grid.y + 1) ||
      this.isShallowWaterCell(grid.x, grid.y - 1)
    );
  }

  private hasBlockingStructureAt(grid: { x: number; y: number }) {
    const occupiedByUnit = this.units.some((u) => {
      if (
        u.role !== 'base' &&
        u.role !== 'factory_ground' &&
        u.role !== 'factory_air' &&
        u.role !== 'factory_naval' &&
        u.role !== 'tower_ground' &&
        u.role !== 'tower_air' &&
        u.role !== 'tower_coastal' &&
        u.role !== 'tower_hybrid'
      ) {
        return false;
      }
      const c = this.worldToGrid(u.body.x, u.body.y);
      return c?.x === grid.x && c?.y === grid.y;
    });
    if (occupiedByUnit) return true;
    if (this.factoryBuildSites.some((s) => s.x === grid.x && s.y === grid.y)) return true;
    if (this.towerBuildSites.some((s) => s.x === grid.x && s.y === grid.y)) return true;
    return false;
  }

  private canPlaceTowerAt(
    grid: { x: number; y: number },
    type: 'tower_ground' | 'tower_air' | 'tower_coastal' | 'tower_hybrid'
  ) {
    if (type === 'tower_coastal') {
      // 岸防炮支持浅海内与岸边两种位置。
      const inShallow = this.isShallowWaterCell(grid.x, grid.y);
      const isLand = !this.blocked[grid.y]?.[grid.x] && !this.isWaterCell(grid.x, grid.y);
      if (!inShallow && !(isLand && this.hasAdjacentShallowWater(grid))) return false;
    } else if (this.blocked[grid.y]?.[grid.x]) {
      return false;
    }
    if (this.hasBlockingStructureAt(grid)) return false;
    return true;
  }

  private startBuildNavalFactory(worldX: number, worldY: number) {
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    const builder = engineers.find((e) => !e.locked) ?? engineers[0];
    if (!builder || builder.locked) return false;
    const grid = this.worldToGrid(worldX, worldY);
    if (!grid) return false;
    if (!this.canPlaceNavalFactoryAt(grid)) return false;
    const target = this.gridToWorld(grid.x, grid.y);
    const targetSize = this.getBuildFootprintSize('factory_naval');
    if (!this.commandBuilderToBuild(builder, target, targetSize)) return false;
    this.factoryBuildSites.push({
      x: grid.x,
      y: grid.y,
      team: 'player',
      progress: 0,
      builderId: builder.id,
      type: 'naval'
    });
    return true;
  }

  private startBuildTower(
    worldX: number,
    worldY: number,
    type: 'tower_ground' | 'tower_air' | 'tower_coastal' | 'tower_hybrid'
  ) {
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    const builder = engineers.find((e) => !e.locked) ?? engineers[0];
    if (!builder || builder.locked) return false;
    const grid = this.worldToGrid(worldX, worldY);
    if (!grid) return false;
    if (!this.canPlaceTowerAt(grid, type)) return false;
    const target = this.gridToWorld(grid.x, grid.y);
    const targetSize = this.getBuildFootprintSize(type);
    if (!this.commandBuilderToBuild(builder, target, targetSize)) return false;
    const towerType =
      type === 'tower_air' ? 'air' : type === 'tower_hybrid' ? 'hybrid' : type === 'tower_coastal' ? 'coastal' : 'ground';
    this.towerBuildSites.push({
      x: grid.x,
      y: grid.y,
      team: 'player',
      progress: 0,
      builderId: builder.id,
      type: towerType,
      facingIndex: this.normalizeTowerFacingIndex(this.towerBuildFacingIndex)
    });
    return true;
  }

  public requestBuildAtSelection() {
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    if (engineers.some((e) => e.locked)) return false;
    this.buildMode = true;
    this.buildType = 'extractor';
    this.events.emit('buildMenu', 'extractor');
    this.events.emit('buildMode', true);
    return true;
  }

  public requestBuildGroundFactory() {
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    if (engineers.some((e) => e.locked)) return false;
    this.buildMode = true;
    this.buildType = 'factory_ground';
    this.events.emit('buildMenu', 'factory_ground');
    this.events.emit('buildMode', true);
    return true;
  }

  public requestBuildAirFactory() {
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    if (engineers.some((e) => e.locked)) return false;
    this.buildMode = true;
    this.buildType = 'factory_air';
    this.events.emit('buildMenu', 'factory_air');
    this.events.emit('buildMode', true);
    return true;
  }

  public requestBuildNavalFactory() {
    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    if (mapKey !== 'sea-island') return false;
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    if (engineers.some((e) => e.locked)) return false;
    this.buildMode = true;
    this.buildType = 'factory_naval';
    this.events.emit('buildMenu', 'factory_naval');
    this.events.emit('buildMode', true);
    return true;
  }

  public requestBuildTower(type: 'tower_ground' | 'tower_air' | 'tower_coastal' | 'tower_hybrid') {
    const mapKey = this.mapVariants[this.mapIndex]?.key ?? 'grasslands';
    if (type === 'tower_coastal' && mapKey !== 'sea-island') return false;
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    if (engineers.some((e) => e.locked)) return false;
    this.buildMode = true;
    this.buildType = type;
    this.towerBuildFacingIndex = 0;
    this.events.emit('buildMenu', type);
    this.events.emit('buildMode', true);
    return true;
  }

  public requestUpgradeExtractor() {
    const node = this.selectedExtractor;
    if (!node || node.extractorOwner !== 'player') return false;
    if ((node.extractorLevel ?? 1) >= 2 || node.upgrading) return false;
    node.upgrading = true;
    node.upgradeProgress = 0.0001;
    this.emitSelection();
    return true;
  }

  private startBuildExtractor(node: (typeof this.resourceNodes)[number]) {
    if (node.extractorOwner === 'player') return false;
    const engineers = this.selectedUnits.filter((u) => u.role === 'engineer' && u.team === 'player');
    if (engineers.length === 0) return false;
    const builder = engineers.find((e) => !e.locked) ?? engineers[0];
    if (!builder || builder.locked) return false;

    node.buildProgress = 0;
    node.buildTeam = 'player';
    node.builderId = builder.id;

    const target = this.gridToWorld(node.x, node.y);
    const targetSize = this.getBuildFootprintSize('extractor');
    if (!this.commandBuilderToBuild(builder, target, targetSize)) return false;
    return true;
  }

  private emitSelection() {
    const count = this.selectedUnits.length;
    const engineerCount = this.selectedUnits.filter((u) => u.role === 'engineer').length;
    const baseCount = this.selectedUnits.filter((u) => u.role === 'base').length;
    const factoryCount = this.selectedUnits.filter((u) => u.role === 'factory_ground').length;
    const airFactoryCount = this.selectedUnits.filter((u) => u.role === 'factory_air').length;
    const navalFactoryCount = this.selectedUnits.filter((u) => u.role === 'factory_naval').length;
    const primary = this.selectedUnits[0];
    const primaryName = primary
      ? primary.role === 'tank'
        ? primary.tankClass === 'heavy'
          ? '重型坦克'
          : primary.tankClass === 'medium'
          ? '中型坦克'
          : '轻型坦克'
        : primary.role === 'air_fighter'
        ? primary.tankClass === 'heavy'
          ? '重型战机'
          : primary.tankClass === 'medium'
          ? '中型战机'
          : '轻型战机'
        : primary.role === 'engineer'
        ? '工程车'
        : primary.role === 'base'
        ? '基地'
        : primary.role === 'factory_ground'
        ? '地面工厂'
        : primary.role === 'factory_air'
        ? '空军工厂'
        : primary.role === 'factory_naval'
        ? '船坞'
        : primary.role === 'naval_ship'
        ? primary.tankClass === 'heavy'
          ? '重型驱逐舰'
          : primary.tankClass === 'medium'
          ? '炮艇'
          : '侦察艇'
        : primary.role === 'tower_ground'
        ? '地面炮塔'
        : primary.role === 'tower_air'
        ? '防空炮塔'
        : primary.role === 'tower_coastal'
        ? '岸防炮'
        : '综合炮塔'
      : null;
    this.events.emit('selection', {
      count,
      engineerCount,
      hasEngineer: engineerCount > 0,
      hasBase: baseCount > 0,
      hasFactory: factoryCount > 0,
      hasAirFactory: airFactoryCount > 0,
      hasNavalFactory: navalFactoryCount > 0,
      hasExtractor: !!this.selectedExtractor,
      extractorLevel: this.selectedExtractor?.extractorLevel ?? 1,
      extractorUpgrading: this.selectedExtractor?.upgrading ?? false,
      extractorUpgradeProgress: this.selectedExtractor?.upgradeProgress ?? 0,
      primaryUnit: primary
        ? {
            name: primaryName,
            role: primary.role,
            tankClass: primary.tankClass,
            hp: primary.hp,
            maxHp: primary.maxHp,
            damage: primary.damage,
            range: primary.range,
            fireRate: primary.fireRate,
            speed: primary.speed
          }
        : null
    });
  }

  public requestBuildExtractor(cost = 150) {
    const candidates = this.resourceNodes.filter((n) => n.extractorOwner !== 'player');
    if (candidates.length === 0) return false;
    let bestNode: typeof this.resourceNodes[number] | null = null;
    let bestDist = Infinity;
    const spawn = this.findSpawnPoint('player');
    const basePos = this.gridToWorld(spawn.x, spawn.y);
    candidates.forEach((node) => {
      const pos = this.gridToWorld(node.x, node.y);
      const dx = pos.x - basePos.x;
      const dy = pos.y - basePos.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestNode = node;
      }
    });
    if (!bestNode) return false;
    if (!this.spendCredits(cost)) return false;
    bestNode.extractorOwner = 'player';
    this.buildMarkers();
    return true;
  }

  private getBuildFootprintSize(
    type: BuildType
  ) {
    if (type === 'extractor') return this.getHarvesterSize();
    return this.getUnitSize(type, 'light');
  }

  private getBuildPreviewTexture(
    type: BuildType
  ) {
    if (type === 'extractor') return 'harvester_1';
    if (type === 'factory_ground') return 'factory_ground_1';
    if (type === 'factory_air') return 'factory_air_1';
    if (type === 'factory_naval') return 'factory_naval_1';
    if (type === 'tower_air') return 'tower_air';
    if (type === 'tower_hybrid') return 'tower_hybrid';
    if (type === 'tower_coastal') return 'tower_coastal';
    return 'tower_ground';
  }

  private getBuildInteractionRadius(targetSize: number) {
    return targetSize * 0.5 + this.cfg.tileSize * 0.75;
  }

  private getBuildStandOffDistance(targetSize: number) {
    return targetSize * 0.5 + this.cfg.tileSize * 0.55;
  }

  private getBuildStandPoint(builder: { x: number; y: number }, target: Phaser.Math.Vector2, targetSize: number) {
    const dx = target.x - builder.x;
    const dy = target.y - builder.y;
    const dist = Math.hypot(dx, dy);
    const dirX = dist > 0.001 ? dx / dist : 0;
    const dirY = dist > 0.001 ? dy / dist : -1;
    const offset = this.getBuildStandOffDistance(targetSize);
    const x = Phaser.Math.Clamp(target.x - dirX * offset, this.cfg.tileSize * 0.5, this.worldWidth - this.cfg.tileSize * 0.5);
    const y = Phaser.Math.Clamp(target.y - dirY * offset, this.cfg.tileSize * 0.5, this.worldHeight - this.cfg.tileSize * 0.5);
    return new Phaser.Math.Vector2(x, y);
  }

  private findBuildStandPointForEngineer(
    builder: (typeof this.units)[number],
    target: Phaser.Math.Vector2,
    targetSize: number
  ) {
    const preferred = this.getBuildStandPoint(builder.body, target, targetSize);
    const buildRadius = this.getBuildInteractionRadius(targetSize);
    const goal = this.worldToGrid(target.x, target.y);
    const candidates: Phaser.Math.Vector2[] = [];
    const pushIfValid = (pt: Phaser.Math.Vector2) => {
      const cell = this.worldToGrid(pt.x, pt.y);
      if (!cell) return;
      if (!this.canRoleOccupyCell('engineer', cell.x, cell.y)) return;
      const dx = pt.x - target.x;
      const dy = pt.y - target.y;
      if (Math.hypot(dx, dy) > buildRadius) return;
      candidates.push(pt);
    };
    pushIfValid(preferred);
    if (goal) {
      for (let r = 1; r <= 10; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const gx = goal.x + dx;
            const gy = goal.y + dy;
            if (gx < 0 || gy < 0 || gx >= this.cfg.cols || gy >= this.cfg.rows) continue;
            if (!this.canRoleOccupyCell('engineer', gx, gy)) continue;
            pushIfValid(this.gridToWorld(gx, gy));
          }
        }
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const ap = (a.x - preferred.x) * (a.x - preferred.x) + (a.y - preferred.y) * (a.y - preferred.y);
      const bp = (b.x - preferred.x) * (b.x - preferred.x) + (b.y - preferred.y) * (b.y - preferred.y);
      if (ap !== bp) return ap - bp;
      const ab = (a.x - builder.body.x) * (a.x - builder.body.x) + (a.y - builder.body.y) * (a.y - builder.body.y);
      const bb = (b.x - builder.body.x) * (b.x - builder.body.x) + (b.y - builder.body.y) * (b.y - builder.body.y);
      return ab - bb;
    });
    return candidates[0];
  }

  private commandBuilderToBuild(
    builder: (typeof this.units)[number],
    target: Phaser.Math.Vector2,
    targetSize: number
  ) {
    const standPoint = this.findBuildStandPointForEngineer(builder, target, targetSize);
    if (!standPoint) return false;
    if (this.isLineClear(builder.body, standPoint, false, builder)) {
      builder.target = standPoint;
      builder.path = [standPoint.clone()];
    } else {
      const path = this.findPath(builder.body, standPoint, false, builder);
      builder.path = path && path.length > 0 ? path : [standPoint.clone()];
      builder.target = standPoint;
    }
    builder.pathIndex = 0;
    return true;
  }

  private renderBuildBeams() {
    const gfx = this.buildBeamGfx;
    if (!gfx) return;
    gfx.clear();
    const t = this.time.now * 0.001;
    const drawBeam = (
      builder: (typeof this.units)[number] | undefined,
      target: Phaser.Math.Vector2,
      targetSize: number,
      progress: number
    ) => {
      if (!builder || builder.hp <= 0) return;
      const dx = target.x - builder.body.x;
      const dy = target.y - builder.body.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 0.001) return;
      const dirX = dx / dist;
      const dirY = dy / dist;
      const endX = target.x - dirX * (targetSize * 0.53);
      const endY = target.y - dirY * (targetSize * 0.53);
      const pulse = 0.65 + Math.sin(t * 8 + builder.id * 0.6) * 0.2;
      gfx.lineStyle(2.2, 0x6cff8c, 0.85 * pulse);
      gfx.lineBetween(builder.body.x, builder.body.y, endX, endY);
      gfx.lineStyle(5.2, 0x1aff6b, 0.14 * pulse);
      gfx.lineBetween(builder.body.x, builder.body.y, endX, endY);
      const nodeR = 3.5 + Math.sin(t * 10 + progress * 6) * 1.2;
      gfx.fillStyle(0x7ef5a6, 0.8);
      gfx.fillCircle(endX, endY, nodeR);
    };

    this.resourceNodes.forEach((node) => {
      if (node.buildTeam !== 'player' || node.extractorOwner || !node.builderId || node.buildProgress <= 0) return;
      const builder = this.units.find((u) => u.id === node.builderId);
      drawBeam(builder, this.gridToWorld(node.x, node.y), this.getBuildFootprintSize('extractor'), node.buildProgress);
    });

    this.factoryBuildSites.forEach((site) => {
      if (site.team !== 'player' || !site.builderId || site.progress <= 0) return;
      const builder = this.units.find((u) => u.id === site.builderId);
      drawBeam(
        builder,
        this.gridToWorld(site.x, site.y),
        this.getBuildFootprintSize(site.type === 'air' ? 'factory_air' : site.type === 'naval' ? 'factory_naval' : 'factory_ground'),
        site.progress
      );
    });

    this.towerBuildSites.forEach((site) => {
      if (site.team !== 'player' || !site.builderId || site.progress <= 0) return;
      const builder = this.units.find((u) => u.id === site.builderId);
      const type = site.type === 'air' ? 'tower_air' : site.type === 'hybrid' ? 'tower_hybrid' : 'tower_ground';
      const coastalType = site.type === 'coastal' ? 'tower_coastal' : type;
      drawBeam(builder, this.gridToWorld(site.x, site.y), this.getBuildFootprintSize(coastalType), site.progress);
    });
  }

  private getUnitSize(
    role: UnitRole,
    tankClass: TankClass
  ) {
    if (role === 'base') return 112;
    if (role === 'factory_ground') return 96;
    if (role === 'factory_air') return 104;
    if (role === 'factory_naval') return 100;
    if (role === 'tower_hybrid') return 108;
    if (role === 'tower_ground' || role === 'tower_air' || role === 'tower_coastal') return 132;
    if (role === 'engineer') return 32 * 1.4;
    if (role === 'air_fighter') return tankClass === 'heavy' ? 62 : tankClass === 'medium' ? 56 : 50;
    if (role === 'naval_ship') return tankClass === 'heavy' ? 92 : tankClass === 'medium' ? 80 : 68;
    if (role === 'tank') {
      return tankClass === 'heavy' ? 62 : tankClass === 'medium' ? 56 : 50;
    }
    return this.cfg.tileSize;
  }

  private getHarvesterSize() {
    return 128;
  }

}
