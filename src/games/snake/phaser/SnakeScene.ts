import Phaser from 'phaser';
import { defaultSnakeConfig, SnakeConfig } from './config';
import { Direction, SnakeEvents, SnakeState, FoodKind, ItemKind } from './types';
import { getSnakeConfig } from '../useSnakeConfigStore';
import { GameModes } from '../GameModes';

const dirVectors: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

export class SnakeScene extends Phaser.Scene {
  private cfg: SnakeConfig;
  private eventsBridge: SnakeEvents;
  private state: SnakeState;
  private majorMode: 'team' | 'score' | 'infinite' = 'infinite';
  private scoreTarget: number | null = null;
  private graphics!: Phaser.GameObjects.Graphics;
  private background!: Phaser.GameObjects.Graphics;
  private nebula!: Phaser.GameObjects.Graphics;
  private bgFx!: Phaser.GameObjects.Graphics;
  private resizeHandler?: () => void;
  private boardWidth = 0;
  private boardHeight = 0;
  private starfield: { x: number; y: number; size: number; alpha: number }[] = [];
  private viewportPadding = 32;
  private zoomSettings = {
    min: 0.6,
    max: 1.2,
    lerp: 0.08
  };
  private accumulator = 0;
  private fpsText!: Phaser.GameObjects.Text;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private paused = false;
  private botText!: Phaser.GameObjects.Text;
  private comboTimer = 0;
  private comboCount = 0;
  private rippleTimer = 0;
  private rippleOrigin = { x: 0, y: 0 };
  private meteorTimer = 0;
  private meteors: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private dangerPulse = 0;
  private lastBgStrength = -1;
  private lastBgUpdate = 0;
  private plankton: { x: number; y: number; size: number; alpha: number; vx: number; vy: number }[] = [];
  private ruins: { x: number; y: number; w: number; h: number }[] = [];
  private arches: { x: number; y: number; r: number }[] = [];
  private runes: { x: number; y: number; len: number; angle: number; color: number }[] = [];
  private bubbles: { x: number; y: number; r: number; speed: number; drift: number }[] = [];
  private skyIslands: { x: number; y: number; w: number; h: number }[] = [];
  private skyRunes: { x: number; y: number; len: number; angle: number; color: number }[] = [];
  private clouds: { x: number; y: number; w: number; h: number; alpha: number; speed: number }[] = [];
  private feathers: { x: number; y: number; size: number; vx: number; vy: number; alpha: number }[] = [];
  private skyPinkRatio = 0;
  private bgTheme: 'cosmic' | 'deepsea' | 'sky' = 'cosmic';
  private trail: { x: number; y: number }[] = [];
  private trailMax = 0;
  private SEGMENT_SPACING = 14;
  private MAX_TRAIL_LENGTH_FACTOR = 20;
  private LERP_FACTOR = 0.4;
  private speedPx = 180; // pixels per second
  private playerName = 'Player';
  private playerNameText?: Phaser.GameObjects.Text;
  private botColor = 0xff5c8d;
  private botSpeedPx = 150;
  private botSpacing = 14;
  private botLerp = 0.38;
  private botAggro = 0.5;
  private rainbowPalette = [
    0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x0cd5ff, 0x007aff, 0x5856d6, 0xaf52de
  ];
  private foodTarget = 30;
  private foodCheckTimer = 0;
  private foodRespawnMs = 800;
  private wallGraceTimer = 0;
  private turnGraceTimer = 0;
  private itemRespawnMs = 5200;
  private itemCheckTimer = 0;
  private itemTarget = 3;
  private shieldGraceTimer = 0; // 护盾被触发后的短暂无敌
  private BOOST_MULT = 1.35;
  private BOOST_COOLDOWN_SLOW = 0.82;
  private farPlanets: { x: number; y: number; radius: number; color: number; alpha: number }[] = [];
  private teamMode = false;
  private teamCount = 2;
  private playerTeamId = 1;
  private teamColors = [0x3b82f6, 0xf97316, 0x22c55e, 0xeab308];
  private teamScoreText?: Phaser.GameObjects.Text;
  private botRespawnQueue: number[] = [];
  private consumePlayerShield(tag: string, amount = 500) {
    if (this.state.shieldMs && this.state.shieldMs > 0) {
      this.state.shieldMs = Math.max(0, this.state.shieldMs - amount);
      this.shieldGraceTimer = 600;
      this.logShield(tag);
      return true;
    }
    return false;
  }
  private consumeBotShield(bot: SnakeState['bots'][number], amount = 500) {
    if (bot.shieldMs && bot.shieldMs > 0) {
      bot.shieldMs = Math.max(0, bot.shieldMs - amount);
      bot.shieldGraceTimer = 600;
      return true;
    }
    return false;
  }
  private logShield(event: string) {
    // 简单调试日志，便于确认护盾的生效与消耗
    // eslint-disable-next-line no-console
    console.log('[Shield]', event, { shieldMs: this.state?.shieldMs, grace: this.shieldGraceTimer });
  }
  private targetBots = 0;
  private analogHeading: { x: number; y: number } | null = null;
  private botHeadSprites: Phaser.Types.Physics.Arcade.ImageWithDynamicBody[] = [];
  private botHeadGroup!: Phaser.Physics.Arcade.Group;
  private playerHeadSprite!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

  constructor(config?: Partial<SnakeConfig>, eventsBridge: SnakeEvents = {}) {
    super('SnakeScene');
    const globalCfg = getSnakeConfig();
    this.majorMode = globalCfg.majorMode || 'infinite';
    this.scoreTarget = globalCfg.scoreTarget ?? null;
    const modeCfg = GameModes[globalCfg.mode] ?? {};
    this.teamMode = !!globalCfg.teamMode;
    this.playerTeamId = globalCfg.playerTeamId || 1;
    this.teamCount = Math.min(4, Math.max(2, globalCfg.teamCount || 2));
    const playerTeamColor = this.teamColors[(globalCfg.playerTeamId - 1 + this.teamColors.length) % this.teamColors.length] || this.teamColors[0];
    this.playerName = globalCfg.nickname || 'Player';
    // 优先应用模式配置，其次是传入的覆盖，最后是默认值
    this.cfg = { ...defaultSnakeConfig, ...modeCfg, ...config, enableBot: globalCfg.enableBot };
    if (this.teamMode) {
      this.rainbowPalette = Array(8).fill(playerTeamColor);
      this.botColor = this.teamColors[(globalCfg.playerTeamId % this.teamColors.length)] || 0xff5c8d;
      this.cfg.colors = {
        ...this.cfg.colors,
        snake: playerTeamColor,
        snakeGlow: playerTeamColor
      };
    }
    this.eventsBridge = eventsBridge;
    // apply mode overrides
    this.speedPx = this.cfg.speedPx ?? this.speedPx;
    this.SEGMENT_SPACING = this.cfg.segmentSpacing ?? this.SEGMENT_SPACING;
    this.MAX_TRAIL_LENGTH_FACTOR = this.cfg.trailFactor ?? this.MAX_TRAIL_LENGTH_FACTOR;
    this.LERP_FACTOR = this.cfg.lerpFactor ?? this.LERP_FACTOR;
    this.foodTarget = Math.floor(
      (this.cfg.foodDensity ?? 0.009) * this.cfg.gridSize.cols * this.cfg.gridSize.rows
    );
    this.foodRespawnMs = this.cfg.foodRespawnMs ?? this.foodRespawnMs;
    this.itemTarget = this.cfg.itemTarget ?? this.itemTarget;
    this.itemRespawnMs = this.cfg.itemRespawnMs ?? this.itemRespawnMs;
    this.wallGraceTimer = 0;
    this.targetBots = this.cfg.botCount ?? (this.cfg.enableBot ? 3 : 0);
    if (this.cfg.enableBot) {
      this.botSpeedPx = (this.cfg.speedPx ?? this.speedPx) * 0.8;
      this.botSpacing = this.cfg.segmentSpacing ?? this.botSpacing;
      this.botLerp = this.cfg.lerpFactor ? this.cfg.lerpFactor * 0.95 : this.botLerp;
      this.botAggro = this.cfg.botAggressiveness ?? this.botAggro;
    }
    if (this.cfg.zoom) {
      this.zoomSettings.min = this.cfg.zoom.min;
      this.zoomSettings.max = this.cfg.zoom.max;
    }
    this.state = this.createInitialState();
  }

  preload() {}

  create() {
    this.createHeadTextures();
    this.background = this.add.graphics().setDepth(0);
    this.nebula = this.add.graphics().setDepth(0.2);
    this.bgFx = this.add.graphics().setDepth(0.6);
    this.graphics = this.add.graphics().setDepth(1);
    this.botHeadGroup = this.physics.add.group({ immovable: true, allowGravity: false });
    const { cellSize, gap, gridSize } = this.cfg;
    this.boardWidth = gridSize.cols * (cellSize + gap);
    this.boardHeight = gridSize.rows * (cellSize + gap);

    const roll = Math.random();
    this.bgTheme = roll < 0.34 ? 'cosmic' : roll < 0.67 ? 'deepsea' : 'sky';
    if (this.bgTheme === 'cosmic') {
      this.generateStarfield();
      this.generatePlanets();
      this.drawNebula();
    } else if (this.bgTheme === 'deepsea') {
      this.generateDeepSeaAssets();
      this.nebula.clear();
    } else {
      this.generateSkyAssets();
      this.nebula.clear();
    }
    this.drawBackground();
    this.input.keyboard?.on('keydown', this.handleKey, this);
    this.updateCamera();
    this.updateCameraFollow(); // initial position
    this.resizeHandler = () => {
      this.updateCamera();
      this.updateCameraFollow();
      if (this.bgTheme === 'cosmic') {
        this.generateStarfield();
        this.generatePlanets();
        this.drawNebula();
      } else if (this.bgTheme === 'deepsea') {
        this.generateDeepSeaAssets();
        this.nebula.clear();
      } else {
        this.generateSkyAssets();
        this.nebula.clear();
      }
      this.drawBackground();
      this.draw();
      if (this.teamScoreText) {
        this.teamScoreText.setPosition(this.scale.width - 12, 12);
      }
    };
    this.scale.on('resize', this.resizeHandler);
    this.fillInitialFood();
    this.fillInitialItems();
    this.logShield('init');
    this.accumulator = 0;
    this.fpsText = this.add
      .text(12, 12, 'FPS', { fontFamily: 'monospace', fontSize: '14px', color: '#b3e5ff' })
      .setScrollFactor(0)
      .setDepth(5);
    this.botText = this.add
      .text(12, 32, 'BOT 0', { fontFamily: 'monospace', fontSize: '14px', color: '#ffb347', backgroundColor: '#00000055' })
      .setScrollFactor(0)
      .setDepth(5);
    if (this.teamMode) {
    this.teamScoreText = this.add
      .text(this.scale.width - 12, 12, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#c7e9ff',
        backgroundColor: '#00000055',
        padding: { x: 6, y: 4 }
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(6);
    this.updateTeamScoreText();
    this.eventsBridge.onStateChange?.({
      teamScores: this.state.teamScores,
      playerTeamId: this.playerTeamId
    });
  }
    // physics head sprite for player
    const headPx = this.state.snake[0];
    this.playerHeadSprite = this.physics.add
      .image(headPx.x + cellSize / 2, headPx.y + cellSize / 2, 'snake_head_tex')
      .setDepth(4)
      .setCircle(cellSize * 0.5)
      .setImmovable(true)
      .setVisible(false); // 物理体隐藏，视觉用 Graphics
    this.playerNameText = this.add
      .text(headPx.x + cellSize / 2, headPx.y - cellSize * 0.8, this.playerName, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff'
      })
      .setOrigin(0.5, 1)
      .setDepth(5)
      .setShadow(0, 0, '#000000', 6, false, true);
    this.initBots(this.state.snake[0]);
    // eslint-disable-next-line no-console
    console.log('[Snake] init bots target', this.targetBots, 'enableBot', this.cfg.enableBot);
    this.physics.add.collider(
      this.playerHeadSprite,
      this.botHeadGroup,
      (_, botSprite) => {
        // 只在无护盾情况下才死亡；有护盾直接击毁 bot 并保留护盾
        const idx = this.botHeadSprites.findIndex((s) => s === botSprite);
        const bot = idx >= 0 ? this.state.bots[idx] : undefined;
        if (this.teamMode && bot?.teamId && bot.teamId === this.playerTeamId) return; // 友军忽略
        if (bot?.invulnerableMs && bot.invulnerableMs > 0) return;
        if (bot && this.consumeBotShield(bot)) return;
        if (this.consumePlayerShield('collider-consume')) {
          if (idx >= 0) this.removeBot(idx, this.playerTeamId);
          return;
        }
        if (this.shieldGraceTimer > 0) return;
        this.state.isAlive = false;
        this.state.deathReason = 'bot';
        this.eventsBridge.onGameOver?.(this.state.score, this.state.deathReason);
        this.eventsBridge.onStateChange?.({ isAlive: false, deathReason: this.state.deathReason });
      },
      (_, botSprite) => {
        // 过滤保护期 & 护盾
        const idx = this.botHeadSprites.findIndex((s) => s === botSprite);
        const bot = idx >= 0 ? this.state.bots[idx] : undefined;
        if (this.teamMode && bot?.teamId && bot.teamId === this.playerTeamId) return false;
        if (bot?.invulnerableMs && bot.invulnerableMs > 0) return false;
        if (bot && bot.shieldGraceTimer && bot.shieldGraceTimer > 0) return false;
        if (bot && this.consumeBotShield(bot)) return false;
        if (this.shieldGraceTimer > 0) return false;
        if (this.state.shieldMs && this.state.shieldMs > 0) {
          this.consumePlayerShield('collider-process');
          if (idx >= 0) this.removeBot(idx, this.playerTeamId);
          return false;
        }
        return true;
      }
    );

    this.draw();
  }

  private createInitialState(): SnakeState {
    const { cols, rows } = this.cfg.gridSize;
    const midX = Math.floor(cols / 2);
    const midY = Math.floor(rows / 2);
    const unit = this.cfg.cellSize + this.cfg.gap;
    const headPx = { x: midX * unit, y: midY * unit };
    // 初始化轨迹，按段距向左展开，避免重叠导致自撞
    this.trail = [];
    const initialLen = 30;
    for (let i = 0; i < initialLen; i++) {
      this.trail.push({ x: headPx.x - i * this.SEGMENT_SPACING, y: headPx.y });
    }
    const initialState: SnakeState = {
      snake: [
        { ...headPx, rot: 0 },
        { x: headPx.x - this.SEGMENT_SPACING, y: headPx.y, rot: 0 },
        { x: headPx.x - this.SEGMENT_SPACING * 2, y: headPx.y, rot: 0 }
      ],
      direction: 'right',
      nextDirection: 'right',
      foods: [],
      items: [],
      score: 0,
      shieldMs: 0,
      magnetMs: 0,
      boostMs: 0,
      boostCooldownMs: 0,
      isAlive: true,
      deathReason: null,
      bots: [],
      playerTeamId: this.teamMode ? this.playerTeamId : undefined,
      teamScores: this.teamMode ? Array.from({ length: this.teamCount }, () => 0) : undefined
    };
    this.state = initialState;
    return this.state;
  }

  private initBots(headPx: { x: number; y: number }) {
    this.state.bots = [];
    this.botHeadSprites.forEach((s) => s.destroy());
    this.botHeadSprites = [];
    this.botRespawnQueue = [];
    if (!this.cfg.enableBot || this.targetBots <= 0) return;
    for (let i = 0; i < this.targetBots; i++) {
      const botTeamId = this.teamMode ? ((i % this.teamCount) + 1) : 0;
      const bot = this.spawnBot(headPx, i, botTeamId);
      this.state.bots.push(bot);
      const headSeg = bot.body[0];
      const headSprite = this.physics.add
        .image(headSeg.x + this.cfg.cellSize / 2, headSeg.y + this.cfg.cellSize / 2, 'bot_head_tex')
        .setDepth(4)
        .setCircle(this.cfg.cellSize * 0.5)
        .setImmovable(true)
        .setVisible(false); // 物理体隐藏
      this.botHeadGroup.add(headSprite);
      this.botHeadSprites.push(headSprite as Phaser.Types.Physics.Arcade.ImageWithDynamicBody);
    }
    // eslint-disable-next-line no-console
    console.log('[Snake] bots initialized', this.state.bots.length, 'target', this.targetBots);
  }

  private startGameLoop() {
    // no-op: kept for compatibility; movement is handled via update loop
  }

  private handleKey(event: KeyboardEvent) {
    if (!this.state.isAlive) return;
    const map: Record<string, Direction> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right'
    };
    const dir = map[event.key];
    if (!dir) return;
    this.analogHeading = null;
    this.queueDirection(dir);
  }

  private queueDirection(dir: Direction) {
    const current = this.state.direction;
    if (
      (dir === 'up' && current === 'down') ||
      (dir === 'down' && current === 'up') ||
      (dir === 'left' && current === 'right') ||
      (dir === 'right' && current === 'left')
    ) {
      return;
    }
    this.state.nextDirection = dir;
  }

  public setDirection(dir: Direction) {
    if (!this.state.isAlive) return;
    this.analogHeading = null;
    this.queueDirection(dir);
  }

  public setHeading(dx: number, dy: number) {
    if (!this.state.isAlive) return;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    this.analogHeading = { x: dx / len, y: dy / len };
  }

  private wrapPosition(pos: { x: number; y: number }) {
    const { cols, rows } = this.cfg.gridSize;
    return {
      x: (pos.x + cols) % cols,
      y: (pos.y + rows) % rows
    };
  }

  update(_: number, delta: number) {
    if (!this.state.isAlive || this.paused) return;
    this.comboTimer = Math.max(0, this.comboTimer - delta);
    this.rippleTimer = Math.max(0, this.rippleTimer - delta);
    this.meteorTimer = Math.max(0, this.meteorTimer - delta);
    this.dangerPulse += delta;
    // wall grace timer countdown
    if (this.wallGraceTimer > 0) {
      this.wallGraceTimer = Math.max(0, this.wallGraceTimer - delta);
    }
    if (this.turnGraceTimer > 0) {
      this.turnGraceTimer = Math.max(0, this.turnGraceTimer - delta);
    }
    if (this.shieldGraceTimer > 0) {
      this.shieldGraceTimer = Math.max(0, this.shieldGraceTimer - delta);
    }
    if (this.state.shieldMs && this.state.shieldMs > 0) {
      this.state.shieldMs = Math.max(0, this.state.shieldMs - delta);
      if (this.state.shieldMs === 0) this.logShield('expired');
    }
    if (this.state.boostMs && this.state.boostMs > 0) {
      this.state.boostMs = Math.max(0, this.state.boostMs - delta);
      if (this.state.boostMs === 0) {
        this.state.boostCooldownMs = 1200;
      }
    } else if (this.state.boostCooldownMs && this.state.boostCooldownMs > 0) {
      this.state.boostCooldownMs = Math.max(0, this.state.boostCooldownMs - delta);
    }
    if (this.state.magnetMs && this.state.magnetMs > 0) {
      this.state.magnetMs = Math.max(0, this.state.magnetMs - delta);
      this.pullFoodToHead();
    }
    this.updateHead(delta);
    this.recordTrail();
    this.updateBodyFromTrail();
    this.checkCollisions();
    // sync physics head positions
    if (this.playerHeadSprite) {
      const head = this.state.snake[0];
      this.playerHeadSprite.setPosition(head.x + this.cfg.cellSize / 2, head.y + this.cfg.cellSize / 2);
    }
    if (this.playerNameText) {
      const head = this.state.snake[0];
      this.playerNameText.setPosition(head.x + this.cfg.cellSize / 2, head.y - this.cfg.cellSize * 0.8);
      const camZoom = this.cameras.main.zoom || 1;
      this.playerNameText.setScale(1 / camZoom);
    }
    if (this.state.bots.length) {
      this.updateBots(delta);
      this.checkBotInteractions();
    }
    // food auto refill
    this.foodCheckTimer += delta;
    if (this.foodCheckTimer > this.foodRespawnMs) {
      this.foodCheckTimer = 0;
      this.refillFood();
    }
    // item auto refill
    this.itemCheckTimer += delta;
    if (this.itemCheckTimer > this.itemRespawnMs) {
      this.itemCheckTimer = 0;
      this.refillItems();
    }
    this.updateCameraFollow();
    this.draw();
  }

  // 检查玩家与 AI、AI 与 AI 的身体碰撞，并处理死亡与掉落食物
  private checkBotInteractions() {
    // 如果护盾刚触发且处于短暂无敌，跳过本帧所有碰撞判定
    if (this.shieldGraceTimer > 0) return;

    const radiusPlayer = this.cfg.cellSize * 0.55;
    const radiusBot = this.cfg.cellSize * 0.55;
    const toRemove = new Set<number>();
    let playerShieldHit = false;

    const playerHead = this.state.snake[0];

    // player head vs bot head（正面对撞，长的赢）
    this.state.bots.forEach((bot, idx) => {
      if (bot.invulnerableMs && bot.invulnerableMs > 0) return;
      if (bot.shieldGraceTimer && bot.shieldGraceTimer > 0) return;
      if (this.teamMode && bot.teamId && bot.teamId === this.playerTeamId) return;
      const head = bot.body[0];
      const d = Phaser.Math.Distance.Between(playerHead.x, playerHead.y, head.x, head.y);
      if (d < radiusBot + radiusPlayer) {
        const playerScore = this.state.snake.length;
        const botScore = bot.body.length;
        if (playerScore >= botScore) {
          if (bot.shieldMs && bot.shieldMs > 0) {
            bot.shieldMs = Math.max(0, bot.shieldMs - 500);
            bot.shieldGraceTimer = 600;
          } else {
            toRemove.add(idx);
          }
        } else if (this.state.isAlive) {
          if (this.state.shieldMs && this.state.shieldMs > 0) {
            // 护盾抵挡一次头撞
            this.state.shieldMs = Math.max(0, this.state.shieldMs - 500);
            this.shieldGraceTimer = 600;
            this.logShield('head-on');
            playerShieldHit = true;
          } else {
            this.state.isAlive = false;
            this.state.deathReason = 'bot';
            this.eventsBridge.onGameOver?.(this.state.score, this.state.deathReason);
            this.eventsBridge.onStateChange?.({ isAlive: false, deathReason: this.state.deathReason });
          }
        }
      }
    });

    if (playerShieldHit) return;

    // player head vs bot body（排除已标记移除的 bot，且跳过 bot 头）
    this.state.bots.forEach((bot, idx) => {
      if (toRemove.has(idx)) return;
      if (bot.invulnerableMs && bot.invulnerableMs > 0) return;
      if (bot.shieldGraceTimer && bot.shieldGraceTimer > 0) return;
      if (this.teamMode && bot.teamId && bot.teamId === this.playerTeamId) return;
      bot.body.forEach((seg, segIdx) => {
        if (segIdx === 0) return; // 头部已在 head-on 逻辑处理
        const d = Phaser.Math.Distance.Between(playerHead.x, playerHead.y, seg.x, seg.y);
        if (d < radiusBot + radiusPlayer && this.state.isAlive) {
          // bot 有护盾：只扣 bot 护盾并给宽限
          if (bot.shieldMs && bot.shieldMs > 0) {
            bot.shieldMs = Math.max(0, bot.shieldMs - 500);
            bot.shieldGraceTimer = 600;
            return;
          }
          if (this.consumePlayerShield('player-hit-bot-body')) {
            if (bot.shieldMs && bot.shieldMs > 0) {
              bot.shieldMs = Math.max(0, bot.shieldMs - 500);
              bot.shieldGraceTimer = 600;
            } else {
              toRemove.add(idx);
            }
            playerShieldHit = true;
          } else {
            this.state.isAlive = false;
            this.state.deathReason = 'bot';
            this.eventsBridge.onGameOver?.(this.state.score, this.state.deathReason);
            this.eventsBridge.onStateChange?.({ isAlive: false, deathReason: this.state.deathReason });
          }
        }
      });
    });

    if (playerShieldHit) return;

    // bot head vs player body -> bot 死亡
    this.state.bots.forEach((bot, idx) => {
      if (toRemove.has(idx)) return;
      if (bot.invulnerableMs && bot.invulnerableMs > 0) return;
      if (bot.shieldGraceTimer && bot.shieldGraceTimer > 0) return;
      if (this.teamMode && bot.teamId && bot.teamId === this.playerTeamId) return;
      const head = bot.body[0];
      for (let i = 0; i < this.state.snake.length; i++) {
        const seg = this.state.snake[i];
        const d = Phaser.Math.Distance.Between(head.x, head.y, seg.x, seg.y);
        if (d < radiusBot + radiusPlayer) {
          // 玩家有护盾则免疫一次，否则 AI 撞死
          if (this.state.shieldMs && this.state.shieldMs > 0) {
            this.state.shieldMs = Math.max(0, this.state.shieldMs - 500);
            this.shieldGraceTimer = 600;
            this.logShield('bot-hit-player-body');
          } else {
            if (bot.shieldMs && bot.shieldMs > 0) {
              bot.shieldMs = Math.max(0, bot.shieldMs - 500);
              bot.shieldGraceTimer = 600;
            } else {
              toRemove.add(idx);
            }
          }
          break;
        }
      }
    });

    // bot head vs other bot body -> 撞的那条死亡（考虑护盾）
    this.state.bots.forEach((bot, idx) => {
      if (toRemove.has(idx)) return;
      if (bot.invulnerableMs && bot.invulnerableMs > 0) return;
      if (bot.shieldGraceTimer && bot.shieldGraceTimer > 0) return;
      const head = bot.body[0];
      this.state.bots.forEach((other, j) => {
        if (idx === j) return;
        if (toRemove.has(j)) return;
        if (other.invulnerableMs && other.invulnerableMs > 0) return;
        if (other.shieldGraceTimer && other.shieldGraceTimer > 0) return;
        if (this.teamMode && bot.teamId && other.teamId && bot.teamId === other.teamId) return;
        other.body.forEach((seg) => {
          const d = Phaser.Math.Distance.Between(head.x, head.y, seg.x, seg.y);
          if (d < radiusBot + radiusBot) {
            if (bot.shieldMs && bot.shieldMs > 0) {
              bot.shieldMs = Math.max(0, bot.shieldMs - 500);
              bot.shieldGraceTimer = 600;
              // 如果玩家有护盾，击毁这条 bot
              if (this.state.shieldMs && this.state.shieldMs > 0) {
                toRemove.add(idx);
              }
            } else {
              toRemove.add(idx);
            }
          }
        });
      });
    });

    // bot head vs bot head（正面对撞，长的赢，平局同归）
    for (let i = 0; i < this.state.bots.length; i++) {
      for (let j = i + 1; j < this.state.bots.length; j++) {
        const a = this.state.bots[i];
        const b = this.state.bots[j];
        if ((a.invulnerableMs && a.invulnerableMs > 0) || (b.invulnerableMs && b.invulnerableMs > 0)) {
          continue;
        }
        if ((a.shieldGraceTimer && a.shieldGraceTimer > 0) || (b.shieldGraceTimer && b.shieldGraceTimer > 0)) {
          continue;
        }
        const d = Phaser.Math.Distance.Between(a.body[0].x, a.body[0].y, b.body[0].x, b.body[0].y);
        if (d < radiusBot * 2) {
          const aShield = a.shieldMs && a.shieldMs > 0;
          const bShield = b.shieldMs && b.shieldMs > 0;
          if (aShield || bShield) {
            if (aShield) {
              a.shieldMs = Math.max(0, a.shieldMs - 500);
              a.shieldGraceTimer = 600;
            }
            if (bShield) {
              b.shieldMs = Math.max(0, b.shieldMs - 500);
              b.shieldGraceTimer = 600;
            }
            continue;
          }
          if (a.body.length > b.body.length) {
            toRemove.add(j);
          } else if (a.body.length < b.body.length) {
            toRemove.add(i);
          } else {
            toRemove.add(i);
            toRemove.add(j);
          }
        }
      }
    }

    if (toRemove.size) {
      const removeList = Array.from(toRemove).sort((a, b) => b - a);
      removeList.forEach((idx) => {
        this.removeBot(idx);
      });
      // eslint-disable-next-line no-console
      console.log('[Snake] bots removed via collision', removeList.length);
    }
  }

  private updateHead(delta: number) {
    const head = this.state.snake[0];
    let vel = this.analogHeading;
    if (!vel) {
      if (this.state.direction !== this.state.nextDirection) {
        this.turnGraceTimer = 180; // ms: 转向后的短暂无敌
      }
      this.state.direction = this.state.nextDirection;
      vel = dirVectors[this.state.direction];
    }
    let speedMul = 1;
    if (this.state.boostMs && this.state.boostMs > 0) {
      speedMul = this.BOOST_MULT;
    } else if (this.state.boostCooldownMs && this.state.boostCooldownMs > 0) {
      speedMul = this.BOOST_COOLDOWN_SLOW;
    }
    const dist = (this.speedPx * speedMul * delta) / 1000;
    head.x += vel.x * dist;
    head.y += vel.y * dist;
    head.rot = Phaser.Math.Angle.Between(0, 0, vel.x, vel.y);
    if (this.cfg.mode === 'wrap' || this.cfg.mode === 'practice') {
      head.x = Phaser.Math.Wrap(head.x, 0, this.boardWidth);
      head.y = Phaser.Math.Wrap(head.y, 0, this.boardHeight);
    }
  }

  private recordTrail() {
    const head = this.state.snake[0];
    this.trail.unshift({ x: head.x, y: head.y });
    const targetLen = Math.max(this.state.snake.length * this.MAX_TRAIL_LENGTH_FACTOR, 200);
    this.trailMax = targetLen;
    if (this.trail.length > targetLen) {
      this.trail.length = targetLen;
    }
  }

  private getTrailPointAt(distanceFromHead: number) {
    let distAcc = 0;
    for (let i = 0; i < this.trail.length - 1; i++) {
      const p1 = this.trail[i];
      const p2 = this.trail[i + 1];
      const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      distAcc += d;
      if (distAcc >= distanceFromHead) {
        return p2;
      }
    }
    return this.trail[this.trail.length - 1] || this.trail[0];
  }

  private updateBodyFromTrail() {
    for (let i = 1; i < this.state.snake.length; i++) {
      const seg = this.state.snake[i];
      const targetDist = i * this.SEGMENT_SPACING;
      const target = this.getTrailPointAt(targetDist);
      seg.x = Phaser.Math.Linear(seg.x, target.x, this.LERP_FACTOR);
      seg.y = Phaser.Math.Linear(seg.y, target.y, this.LERP_FACTOR);
      const prev = this.state.snake[i - 1];
      seg.rot = Phaser.Math.Angle.Between(seg.x, seg.y, prev.x, prev.y);
    }
  }

  private checkCollisions() {
    const head = this.state.snake[0];
    const cellX = Math.floor(head.x / (this.cfg.cellSize + this.cfg.gap));
    const cellY = Math.floor(head.y / (this.cfg.cellSize + this.cfg.gap));
    const hitWall =
      this.cfg.mode === 'classic' &&
      (cellX < 0 || cellY < 0 || cellX >= this.cfg.gridSize.cols || cellY >= this.cfg.gridSize.rows);
    const unit = this.cfg.cellSize + this.cfg.gap;
    const eatingIdx = this.state.foods.findIndex((f) => {
      const dx = head.x - f.x;
      const dy = head.y - f.y;
      const headRadius = this.cfg.cellSize * 0.6;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= headRadius + f.radius;
    });
    // 取消自撞死亡判定
    const hitSelf = false;

    if (hitWall || hitSelf) {
      if (hitWall && this.cfg.wallGraceMs && this.wallGraceTimer <= 0) {
        this.wallGraceTimer = this.cfg.wallGraceMs;
      } else if (this.state.shieldMs && this.state.shieldMs > 0) {
        // 护盾抵挡一次，自撞/撞墙忽略本次
        this.state.shieldMs = Math.max(0, this.state.shieldMs - 200);
        this.shieldGraceTimer = 600; // 护盾触发后的短暂无敌
        this.logShield('hit-self/wall');
      } else {
        this.state.isAlive = false;
        this.state.deathReason = hitWall ? 'wall' : 'self';
        this.eventsBridge.onGameOver?.(this.state.score, this.state.deathReason);
        this.eventsBridge.onStateChange?.({ isAlive: false, deathReason: this.state.deathReason });
        return;
      }
    }

    if (eatingIdx >= 0) {
      const food = this.state.foods[eatingIdx];
      const base = food.value;
      const scoreGain = base * (this.cfg.scoreMultiplier ?? 1);
      this.state.score += scoreGain;
      this.addTeamScore(this.teamMode ? this.playerTeamId : undefined, scoreGain);
      this.eventsBridge.onScore?.(this.state.score);
      this.grow(food.kind);
      this.state.foods.splice(eatingIdx, 1);
      if (this.comboTimer > 0) {
        this.comboCount += 1;
      } else {
        this.comboCount = 1;
      }
      this.comboTimer = 1200;
      if (this.comboCount >= 2) {
        const head = this.state.snake[0];
        this.rippleOrigin = { x: head.x + this.cfg.cellSize / 2, y: head.y + this.cfg.cellSize / 2 };
        this.rippleTimer = 800;
      }
      if (this.majorMode === 'score' && this.scoreTarget && this.state.score >= this.scoreTarget) {
        this.state.isAlive = false;
        this.state.deathReason = 'score';
        this.eventsBridge.onGameOver?.(this.state.score, this.state.deathReason);
        this.eventsBridge.onStateChange?.({ isAlive: false, deathReason: this.state.deathReason });
        return;
      }
    }

    // items pickup
    const itemIdx = this.state.items?.findIndex((it) => {
      const dx = head.x - it.x;
      const dy = head.y - it.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const headRadius = this.cfg.cellSize * 0.6;
      return dist <= headRadius + (it.radius || this.cfg.cellSize * 0.6);
    });
    if (itemIdx !== undefined && itemIdx >= 0 && this.state.items) {
      const item = this.state.items[itemIdx];
      this.applyItem(item.kind);
      this.state.items.splice(itemIdx, 1);
    }

    // player vs bot 碰撞交由物理 collider 处理
  }

  private grow(kind: FoodKind = 'small') {
    const tail = this.state.snake[this.state.snake.length - 1];
    const growBy = kind === 'big' ? 3 : 1;
    for (let g = 0; g < growBy; g++) {
      const newSeg = { x: tail.x, y: tail.y, rot: tail.rot };
      this.state.snake.push(newSeg);
    }
    // 额外填充一些轨迹点，避免新段立即贴头导致自撞
    const extraPoints = 20;
    for (let i = 0; i < extraPoints; i++) {
      const last = this.trail[this.trail.length - 1] || tail;
      this.trail.push({ x: last.x, y: last.y });
    }
  }

  private hitSelfContinuous(pos: { x: number; y: number }) {
    // simple radius check against segments, ignoring head
    const radius = this.cfg.cellSize * 0.48;
    for (let i = 1; i < this.state.snake.length; i++) {
      const seg = this.state.snake[i];
      const d = Phaser.Math.Distance.Between(pos.x, pos.y, seg.x, seg.y);
      if (d < radius) return true;
    }
    return false;
  }

  private drawBackground() {
    const { colors } = this.cfg;
    this.background.clear();
    const score = this.state.score;
    const effectStrength = Phaser.Math.Clamp((score - 1000) / 2500, 0, 1);
    if (this.bgTheme === 'cosmic') {
      const baseColor = colors.bg;
      const stageBoost = 0.24 * effectStrength;
      const bgColor = Phaser.Display.Color.IntegerToColor(baseColor).clone();
      bgColor.red = Math.min(255, bgColor.red + stageBoost * 255);
      bgColor.green = Math.min(255, bgColor.green + stageBoost * 255);
      bgColor.blue = Math.min(255, bgColor.blue + stageBoost * 255);
      const bgTint = Phaser.Display.Color.GetColor(bgColor.red, bgColor.green, bgColor.blue);
      this.background.fillStyle(bgTint, 1);
      this.background.fillRect(0, 0, this.boardWidth, this.boardHeight);
      // 远景行星
      this.farPlanets.forEach((p) => {
        this.background.fillStyle(p.color, p.alpha);
        this.background.fillCircle(p.x, p.y, p.radius);
      });
      this.starfield.forEach((star) => {
        this.background.fillStyle(0xffffff, star.alpha);
        this.background.fillCircle(star.x, star.y, star.size);
      });
      // hex pattern overlay
      const hexSize = 28;
      const hexHeight = Math.sqrt(3) * hexSize;
      this.background.lineStyle(1, 0x11203c, 0.22 + 0.28 * effectStrength);
      for (let y = -hexHeight; y < this.boardHeight + hexHeight; y += hexHeight) {
        for (let x = -hexSize * 2; x < this.boardWidth + hexSize * 2; x += hexSize * 1.5) {
          const offsetX = (Math.floor(y / hexHeight) % 2) * hexSize * 0.75;
          const cx = x + offsetX;
          const cy = y;
          // manual hex draw
          const pts = [
            { x: cx + hexSize, y: cy },
            { x: cx + hexSize / 2, y: cy + hexHeight / 2 },
            { x: cx - hexSize / 2, y: cy + hexHeight / 2 },
            { x: cx - hexSize, y: cy },
            { x: cx - hexSize / 2, y: cy - hexHeight / 2 },
            { x: cx + hexSize / 2, y: cy - hexHeight / 2 }
          ];
          this.background.beginPath();
          this.background.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            this.background.lineTo(pts[i].x, pts[i].y);
          }
          this.background.closePath();
          this.background.strokePath();
        }
      }
      return;
    }

    if (this.bgTheme === 'deepsea') {
      const baseColor = 0x07162c;
      const stageBoost = 0.14 * effectStrength;
      const bgColor = Phaser.Display.Color.IntegerToColor(baseColor).clone();
      bgColor.red = Math.min(255, bgColor.red + stageBoost * 255);
      bgColor.green = Math.min(255, bgColor.green + stageBoost * 255);
      bgColor.blue = Math.min(255, bgColor.blue + stageBoost * 255);
      const bgTint = Phaser.Display.Color.GetColor(bgColor.red, bgColor.green, bgColor.blue);
      this.background.fillStyle(bgTint, 1);
      this.background.fillRect(0, 0, this.boardWidth, this.boardHeight);
      // 深海雾层（静态）
      this.background.fillStyle(0x0b2a3d, 0.22);
      this.background.fillRect(0, 0, this.boardWidth, this.boardHeight);
      this.background.fillStyle(0x0b2a3d, 0.18);
      this.background.fillRect(0, this.boardHeight * 0.2, this.boardWidth, this.boardHeight * 0.6);

      // 遗迹剪影
      this.background.fillStyle(0x050f1e, 0.55);
      this.ruins.forEach((r) => {
        this.background.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
      });
      // 断裂拱门
      this.background.lineStyle(3, 0x071726, 0.6);
      this.arches.forEach((a) => {
        this.background.beginPath();
        this.background.arc(a.x, a.y, a.r, Math.PI, Math.PI * 2, false);
        this.background.strokePath();
      });

      // 暗角（压迫感）
      this.background.fillStyle(0x000000, 0.25);
      this.background.fillRect(0, 0, this.boardWidth, 40);
      this.background.fillRect(0, this.boardHeight - 40, this.boardWidth, 40);
      this.background.fillRect(0, 0, 40, this.boardHeight);
      this.background.fillRect(this.boardWidth - 40, 0, 40, this.boardHeight);
      return;
    }

    // sky city
    this.skyPinkRatio = Phaser.Math.Clamp(score / 10000, 0, 1);
    const baseBlue = Phaser.Display.Color.ValueToColor(0x6ea7e8);
    const basePink = Phaser.Display.Color.ValueToColor(0xe88fb9);
    const mix = this.skyPinkRatio;
    const base = Phaser.Display.Color.Interpolate.ColorWithColor(baseBlue, basePink, 100, Math.round(mix * 100));
    const baseTint = Phaser.Display.Color.GetColor(base.r, base.g, base.b);
    const boost = 0.08 + 0.08 * effectStrength;
    const boosted = Phaser.Display.Color.IntegerToColor(baseTint).clone();
    boosted.red = Math.min(255, boosted.red + boost * 255);
    boosted.green = Math.min(255, boosted.green + boost * 255);
    boosted.blue = Math.min(255, boosted.blue + boost * 255);
    this.background.fillStyle(Phaser.Display.Color.GetColor(boosted.red, boosted.green, boosted.blue), 1);
    this.background.fillRect(0, 0, this.boardWidth, this.boardHeight);

    // soft blended mist patches (blue/pink random, no hard split)
    const mistCount = 9;
    for (let i = 0; i < mistCount; i++) {
      const usePink = Math.random() < mix;
      const tint = usePink ? 0xf3a6c8 : 0x7fb7ff;
      const alpha = usePink ? 0.12 : 0.16;
      const w = Phaser.Math.Between(220, 420);
      const h = Phaser.Math.Between(120, 240);
      const x = Phaser.Math.Between(-40, this.boardWidth - w + 40);
      const y = Phaser.Math.Between(0, Math.floor(this.boardHeight * 0.65));
      this.background.fillStyle(tint, alpha);
      this.background.fillRoundedRect(x, y, w, h, h * 0.6);
    }

    // 浮空岛剪影
    this.background.fillStyle(0xdbe7f5, 0.35);
    this.skyIslands.forEach((i) => {
      this.background.fillRoundedRect(i.x, i.y, i.w, i.h, 18);
    });

    // 暗角（轻微）
    this.background.fillStyle(0x000000, 0.12);
    this.background.fillRect(0, 0, this.boardWidth, 24);
    this.background.fillRect(0, this.boardHeight - 24, this.boardWidth, 24);
    this.background.fillRect(0, 0, 24, this.boardHeight);
    this.background.fillRect(this.boardWidth - 24, 0, 24, this.boardHeight);
  }

  private fillInitialFood() {
    const ratio = this.cfg.foodRatio ?? { small: 0.7, big: 0.2, rare: 0.1 };
    const targetSmall = Math.max(1, Math.floor(this.foodTarget * ratio.small));
    for (let i = 0; i < targetSmall; i++) {
      this.spawnFood('small');
    }
    const targetBig = Math.max(1, Math.floor(this.foodTarget * ratio.big));
    for (let i = 0; i < targetBig; i++) {
      this.spawnFood('big');
    }
    const targetRare = Math.max(0, Math.floor(this.foodTarget * ratio.rare));
    for (let i = 0; i < targetRare; i++) {
      this.spawnFood('rare');
    }
  }

  private fillInitialItems() {
    const target = this.itemTarget;
    for (let i = 0; i < target; i++) {
      this.spawnItem(this.randomItemKind());
    }
  }

  private spawnFood(kind: FoodKind) {
    const { cols, rows } = this.cfg.gridSize;
    const unit = this.cfg.cellSize + this.cfg.gap;
    const occupied = new Set(this.state.snake.map((s) => `${Math.floor(s.x / unit)},${Math.floor(s.y / unit)}`));
    const free: { x: number; y: number }[] = [];
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (!free.length) return;
    const spot = free[Math.floor(Math.random() * free.length)];
    const radius =
      kind === 'big' ? this.cfg.cellSize * 0.9 : kind === 'rare' ? this.cfg.cellSize * 0.7 : this.cfg.cellSize * 0.5;
    const value = kind === 'big' ? 30 : kind === 'rare' ? 50 : 10;
    this.state.foods.push({
      id: `${kind}-${Date.now()}-${Math.random()}`,
      x: spot.x * unit,
      y: spot.y * unit,
      kind,
      value,
      radius,
      spawnAt: this.time.now
    });
  }

  private applyItem(kind: ItemKind) {
    if (kind === 'shield') {
      this.state.shieldMs = Math.max(0, this.state.shieldMs || 0) + 3000;
      this.logShield('pickup-shield');
    } else if (kind === 'magnet') {
      this.state.magnetMs = Math.max(0, this.state.magnetMs || 0) + 3500; // 延长磁力持续
    } else if (kind === 'boost') {
      this.state.boostMs = Math.max(0, this.state.boostMs || 0) + 1800;
      this.state.boostCooldownMs = 0;
    } else if (kind === 'foodstorm') {
      this.spawnFoodStorm(this.state.snake[0]);
    }
    this.eventsBridge.onStateChange?.({
      shieldMs: this.state.shieldMs,
      magnetMs: this.state.magnetMs,
      boostMs: this.state.boostMs
    });
  }

  private applyBotItem(bot: SnakeState['bots'][number], kind: ItemKind) {
    if (kind === 'shield') {
      bot.shieldMs = Math.max(0, bot.shieldMs || 0) + 3000;
      bot.shieldGraceTimer = 0;
    } else if (kind === 'magnet') {
      bot.magnetMs = Math.max(0, bot.magnetMs || 0) + 3500;
    } else if (kind === 'boost') {
      bot.boostMs = Math.max(0, bot.boostMs || 0) + 1800;
      bot.boostCooldownMs = 0;
    } else if (kind === 'foodstorm') {
      this.spawnFoodStorm(bot.body[0]);
    }
  }

  private pullFoodToHead() {
    const head = this.state.snake[0];
    const radius = this.cfg.cellSize * 14; // 吸附范围更大
    const pullStrength = 0.5; // 吸附加速度更强
    this.state.foods.forEach((f) => {
      const dx = head.x - f.x;
      const dy = head.y - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius && dist > 1) {
        const nx = dx / dist;
        const ny = dy / dist;
        f.x += nx * (radius - dist) * pullStrength * 0.05;
        f.y += ny * (radius - dist) * pullStrength * 0.05;
      }
    });
  }

  private pullFoodToBot(bot: SnakeState['bots'][number]) {
    const head = bot.body[0];
    const radius = this.cfg.cellSize * 12;
    const pullStrength = 0.4;
    this.state.foods.forEach((f) => {
      const dx = head.x - f.x;
      const dy = head.y - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius && dist > 1) {
        const nx = dx / dist;
        const ny = dy / dist;
        f.x += nx * (radius - dist) * pullStrength * 0.05;
        f.y += ny * (radius - dist) * pullStrength * 0.05;
      }
    });
  }

  private spawnFoodStorm(center: { x: number; y: number }) {
    const count = 8 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 140;
      const kind: FoodKind = Math.random() < 0.3 ? 'big' : 'small';
      this.state.foods.push({
        id: `storm-${Date.now()}-${Math.random()}`,
        x: Phaser.Math.Wrap(center.x + Math.cos(ang) * dist, 0, this.boardWidth - (this.cfg.cellSize + this.cfg.gap)),
        y: Phaser.Math.Wrap(center.y + Math.sin(ang) * dist, 0, this.boardHeight - (this.cfg.cellSize + this.cfg.gap)),
        kind,
        value: kind === 'big' ? 30 : 10,
        radius: kind === 'big' ? this.cfg.cellSize * 0.9 : this.cfg.cellSize * 0.5
      });
    }
  }

  private spawnItem(kind: ItemKind) {
    if (!this.state.items) this.state.items = [];
    const { cols, rows } = this.cfg.gridSize;
    const unit = this.cfg.cellSize + this.cfg.gap;
    const occupied = new Set(this.state.snake.map((s) => `${Math.floor(s.x / unit)},${Math.floor(s.y / unit)}`));
    const free: { x: number; y: number }[] = [];
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (!free.length) return;
    const spot = free[Math.floor(Math.random() * free.length)];
    const radius = this.cfg.cellSize * 0.6;
    this.state.items.push({
      id: `${kind}-${Date.now()}-${Math.random()}`,
      x: spot.x * unit,
      y: spot.y * unit,
      kind,
      radius,
      spawnAt: this.time.now
    });
  }

  private refillItems() {
    if (!this.state.items) this.state.items = [];
    if (this.state.items.length < this.itemTarget) {
      const missing = this.itemTarget - this.state.items.length;
      for (let i = 0; i < missing; i++) {
        this.spawnItem(this.randomItemKind());
      }
    }
  }

  private randomItemKind(): ItemKind {
    const r = Math.random();
    if (r < 0.25) return 'shield';
    if (r < 0.5) return 'magnet';
    if (r < 0.75) return 'boost';
    return 'foodstorm';
  }

  private refillFood() {
    const ratio = this.cfg.foodRatio ?? { small: 0.7, big: 0.2, rare: 0.1 };
    const smallCount = this.state.foods.filter((f) => f.kind === 'small').length;
    const bigCount = this.state.foods.filter((f) => f.kind === 'big').length;
    const rareCount = this.state.foods.filter((f) => f.kind === 'rare').length;
    const targetSmall = Math.max(1, Math.floor(this.foodTarget * ratio.small));
    const targetBig = Math.max(1, Math.floor(this.foodTarget * ratio.big));
    const targetRare = Math.max(0, Math.floor(this.foodTarget * ratio.rare));
    if (smallCount < targetSmall) {
      this.spawnFood('small');
    }
    if (bigCount < targetBig) {
      this.spawnFood('big');
    }
    if (rareCount < targetRare) {
      this.spawnFood('rare');
    }
  }

  private updateBots(delta: number) {
    if (!this.state.bots.length) return;
    const toRemove: number[] = [];
    this.state.bots.forEach((bot, botIdx) => {
      if (bot.invulnerableMs && bot.invulnerableMs > 0) {
        bot.invulnerableMs = Math.max(0, bot.invulnerableMs - delta);
      }
      if (bot.shieldGraceTimer && bot.shieldGraceTimer > 0) {
        bot.shieldGraceTimer = Math.max(0, bot.shieldGraceTimer - delta);
      }
      if (bot.shieldMs && bot.shieldMs > 0) {
        bot.shieldMs = Math.max(0, bot.shieldMs - delta);
      }
      if (bot.shieldMs && bot.shieldMs > 0) {
        bot.shieldMs = Math.max(0, bot.shieldMs - delta);
      }
      if (bot.magnetMs && bot.magnetMs > 0) {
        bot.magnetMs = Math.max(0, bot.magnetMs - delta);
        this.pullFoodToBot(bot);
      }
      const head = bot.body[0];
    const target = this.findNearestPickup(head);
      // choose direction: attract to food, avoid player head
      const playerHead = this.state.snake[0];
      let avoidX = 0;
      let avoidY = 0;
      const distPlayer = Phaser.Math.Distance.Between(head.x, head.y, playerHead.x, playerHead.y);
      if (distPlayer < bot.safeDist) {
        avoidX = (head.x - playerHead.x) / Math.max(1, distPlayer);
        avoidY = (head.y - playerHead.y) / Math.max(1, distPlayer);
      }

      let vx = Math.cos(head.rot || 0);
      let vy = Math.sin(head.rot || 0);
      if (target) {
        const dirX = target.x - head.x;
        const dirY = target.y - head.y;
        const len = Math.max(0.0001, Math.sqrt(dirX * dirX + dirY * dirY));
        const tx = dirX / len;
        const ty = dirY / len;
        const foodWeight = avoidX !== 0 || avoidY !== 0 ? 0.5 : 1;
        const avoidWeight = avoidX !== 0 || avoidY !== 0 ? 0.5 * bot.aggro : 0;
        const combinedX = tx * foodWeight + avoidX * avoidWeight;
        const combinedY = ty * foodWeight + avoidY * avoidWeight;
        const clen = Math.max(0.0001, Math.sqrt(combinedX * combinedX + combinedY * combinedY));
        vx = combinedX / clen;
        vy = combinedY / clen;
      }
    // sprint logic
    if (bot.sprinting) {
      bot.sprintDuration -= delta;
      if (bot.sprintDuration <= 0) {
        bot.sprinting = false;
        bot.sprintTimer = 2000 + Math.random() * 1500;
      }
    } else {
      bot.sprintTimer -= delta;
      if (bot.sprintTimer <= 0 && Math.random() < bot.aggro * 0.5) {
        bot.sprinting = true;
        bot.sprintDuration = 600 + Math.random() * 400;
      }
    }
    const sprintMul = bot.sprinting ? 1.2 : 1;
    const dist = (bot.speedPx * sprintMul * delta) / 1000;
    head.x += vx * dist;
    head.y += vy * dist;
    head.rot = Phaser.Math.Angle.Between(0, 0, vx, vy);
    head.x = Phaser.Math.Wrap(head.x, 0, this.boardWidth);
    head.y = Phaser.Math.Wrap(head.y, 0, this.boardHeight);
    bot.trail.unshift({ x: head.x, y: head.y });
    const maxTrail = Math.max(bot.body.length * this.MAX_TRAIL_LENGTH_FACTOR, 150);
    if (bot.trail.length > maxTrail) bot.trail.length = maxTrail;
    for (let i = 1; i < bot.body.length; i++) {
      const seg = bot.body[i];
      const targetDist = i * bot.segmentSpacing;
      const tp = this.getTrailPointAtDistance(bot.trail, targetDist);
      seg.x = Phaser.Math.Linear(seg.x, tp.x, bot.lerp);
      seg.y = Phaser.Math.Linear(seg.y, tp.y, bot.lerp);
      const prev = bot.body[i - 1];
      seg.rot = Phaser.Math.Angle.Between(seg.x, seg.y, prev.x, prev.y);
    }
    // bot eats food
    const eatenIdx = this.state.foods.findIndex((f) => {
      const dx = head.x - f.x;
      const dy = head.y - f.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const headRadius = this.cfg.cellSize * 0.6;
      return d <= headRadius + f.radius;
    });
    if (eatenIdx >= 0) {
      const food = this.state.foods[eatenIdx];
      const scoreGain = food.value * (this.cfg.scoreMultiplier ?? 1);
      bot.score += scoreGain;
      this.growBot(bot, food.kind);
      this.recomputeTeamScores();
      this.state.foods.splice(eatenIdx, 1);
    }

    // 更新 bot 头部物理 sprite
    const headSprite = this.botHeadSprites[botIdx];
    if (headSprite) {
      headSprite.setPosition(head.x + this.cfg.cellSize / 2, head.y + this.cfg.cellSize / 2);
    }
    });

    // remove bots after iteration
    if (toRemove.length) {
      const removeList = Array.from(new Set(toRemove)).sort((a, b) => b - a);
      removeList.forEach((idx) => this.removeBot(idx));
      // eslint-disable-next-line no-console
      console.log('[Snake] bot removed, now', this.state.bots.length, 'target', this.targetBots);
    }

    // maintain bot count
    if (this.cfg.enableBot && this.state.bots.length < this.targetBots) {
      const spawnBase = this.state.snake[0];
      const queuedTeamId = this.botRespawnQueue.shift();
      const botTeamId = this.teamMode ? (queuedTeamId || ((this.state.bots.length % this.teamCount) + 1)) : 0;
      const newBot = this.spawnBot({ x: spawnBase.x + 150, y: spawnBase.y + 80 }, Date.now(), botTeamId);
      this.state.bots.push(newBot);
      const headSeg = newBot.body[0];
      const headSprite = this.physics.add
        .image(headSeg.x + this.cfg.cellSize / 2, headSeg.y + this.cfg.cellSize / 2, 'bot_head_tex')
        .setDepth(4)
        .setCircle(this.cfg.cellSize * 0.5)
        .setImmovable(true)
        .setVisible(false);
      this.botHeadGroup.add(headSprite);
      this.botHeadSprites.push(headSprite as Phaser.Types.Physics.Arcade.ImageWithDynamicBody);
      // eslint-disable-next-line no-console
      console.log('[Snake] bot spawned, now', this.state.bots.length, 'target', this.targetBots);
      this.recomputeTeamScores();
    }

    // bot pickup items
    if (this.state.items && this.state.items.length) {
      for (let b = 0; b < this.state.bots.length; b++) {
        const bot = this.state.bots[b];
        const head = bot.body[0];
        const itemIdx = this.state.items.findIndex((it) => {
          const dx = head.x - it.x;
          const dy = head.y - it.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const headRadius = this.cfg.cellSize * 0.6;
          return dist <= headRadius + (it.radius || this.cfg.cellSize * 0.6);
        });
        if (itemIdx >= 0) {
          const item = this.state.items[itemIdx];
          this.applyBotItem(bot, item.kind);
          this.state.items.splice(itemIdx, 1);
        }
      }
    }
  }

  private growBot(bot: SnakeState['bots'][number], kind: FoodKind) {
    const growBy = kind === 'big' ? 3 : kind === 'rare' ? 2 : 1;
    const tail = bot.body[bot.body.length - 1];
    for (let i = 0; i < growBy; i++) {
      bot.body.push({ x: tail.x, y: tail.y, rot: tail.rot });
    }
    // 填充轨迹，避免新段重叠
    const extra = 20;
    for (let i = 0; i < extra; i++) {
      const last = bot.trail[bot.trail.length - 1] || tail;
      bot.trail.push({ x: last.x, y: last.y });
    }
  }

  // 根据 bot 的长度生成若干食物
  private spawnFoodFromBot(bot: SnakeState['bots'][number]) {
    const dropCount = Math.max(3, Math.floor(bot.body.length / 3));
    for (let i = 0; i < dropCount; i++) {
      const seg = bot.body[Math.floor((i / dropCount) * bot.body.length)] || bot.body[0];
      // 随机掉落大/小球
      const kind: FoodKind = Math.random() < 0.25 ? 'big' : 'small';
      this.state.foods.push({
        id: `bot-drop-${Date.now()}-${Math.random()}`,
        x: seg.x,
        y: seg.y,
        kind,
        value: kind === 'big' ? 30 : 10,
        radius: kind === 'big' ? this.cfg.cellSize * 0.9 : this.cfg.cellSize * 0.5
      });
    }
  }

  private removeBot(idx: number, killerTeamId?: number, scoreGain = 30) {
    if (idx < 0 || idx >= this.state.bots.length) return;
    const bot = this.state.bots[idx];
    if (this.teamMode && bot.teamId) {
      this.botRespawnQueue.push(bot.teamId);
    }
    this.spawnFoodFromBot(bot);
    if (killerTeamId) this.addTeamScore(killerTeamId, scoreGain);
    const sprite = this.botHeadSprites[idx];
    if (sprite) sprite.destroy();
    this.botHeadSprites.splice(idx, 1);
    this.state.bots.splice(idx, 1);
    this.recomputeTeamScores();
  }

  private findNearestPickup(pos: { x: number; y: number }) {
    let best: { x: number; y: number } | null = null;
    let bestDist = Number.MAX_VALUE;
    const consider = [...this.state.foods];
    if (this.state.items && this.state.items.length) {
      // items 优先：视作高权重（距离乘以系数）
      this.state.items.forEach((it) => {
        const d = Phaser.Math.Distance.Between(pos.x, pos.y, it.x, it.y) * 0.6;
        if (d < bestDist) {
          bestDist = d;
          best = it;
        }
      });
    }
    consider.forEach((f) => {
      const d = Phaser.Math.Distance.Between(pos.x, pos.y, f.x, f.y);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    });
    return best;
  }

  private addTeamScore(_: number | undefined, __: number) {
    this.recomputeTeamScores();
  }

  private recomputeTeamScores() {
    if (!this.teamMode || !this.state.teamScores) return;
    const next = Array.from({ length: this.teamCount }, () => 0);
    if (this.state.isAlive && this.playerTeamId > 0 && this.playerTeamId <= this.teamCount) {
      next[this.playerTeamId - 1] += this.state.score;
    }
    this.state.bots.forEach((bot) => {
      if (!bot.teamId) return;
      const idx = bot.teamId - 1;
      if (idx < 0 || idx >= next.length) return;
      next[idx] += bot.score || 0;
    });
    this.state.teamScores = next;
    this.updateTeamScoreText();
    this.eventsBridge.onStateChange?.({
      teamScores: [...this.state.teamScores],
      playerTeamId: this.playerTeamId
    });
  }

  private updateTeamScoreText() {
    if (!this.teamMode || !this.teamScoreText || !this.state.teamScores) return;
    const lines = this.state.teamScores
      .map((score, i) => ({ team: i + 1, score }))
      .sort((a, b) => b.score - a.score)
      .map((t, rank) => {
        const color = Phaser.Display.Color.IntegerToColor(this.teamColors[(t.team - 1) % this.teamColors.length]).rgba;
        return `#${rank + 1} 队${t.team}: ${t.score}`;
      });
    this.teamScoreText.setText(lines.join('\n'));
  }

  private spawnBot(base: { x: number; y: number }, seed: number, teamId = 0) {
    // 在玩家附近随机生成，确保不超出边界
    const rng = () => Math.sin(seed++ * 16807) * 0.5 + 0.5;
    const radius = 250 + rng() * 150;
    const angle = rng() * Math.PI * 2;
    let bx = base.x + Math.cos(angle) * radius;
    let by = base.y + Math.sin(angle) * radius;
    bx = Phaser.Math.Clamp(bx, 50, this.boardWidth - 50);
    by = Phaser.Math.Clamp(by, 50, this.boardHeight - 50);
    const aggro = this.botAggro;
    const safeDist = this.cfg.cellSize * (2.5 - 1.2 * aggro);
    const speedMul = 0.75 + 0.35 * aggro;
    const turnLerp = (this.cfg.lerpFactor ?? this.botLerp) * (0.8 + 0.3 * aggro);
    const body = [
      { x: bx, y: by, rot: 0 },
      { x: bx - this.botSpacing, y: by, rot: 0 },
      { x: bx - this.botSpacing * 2, y: by, rot: 0 }
    ];
    const trail = Array.from({ length: 30 }, (_, i) => ({
      x: bx - i * this.botSpacing,
      y: by
    }));
    const colorIdx = Math.floor(rng() * this.rainbowPalette.length) % this.rainbowPalette.length;
    const teamColor =
      this.teamMode && teamId > 0
        ? this.teamColors[(teamId - 1) % this.teamColors.length]
        : this.rainbowPalette[colorIdx] ?? this.botColor;
    return {
      body,
      trail,
      teamId: teamId || undefined,
      color: teamColor,
      score: 0,
      speedPx: this.botSpeedPx * speedMul,
      segmentSpacing: this.botSpacing,
      lerp: turnLerp,
      aggro,
      safeDist,
      speedMul,
      sprintTimer: 2000 + Math.random() * 2000,
      sprintDuration: 0,
      sprinting: false,
      invulnerableMs: 3000
    };
  }

  private getTrailPointAtDistance(trail: { x: number; y: number }[], distanceFromHead: number) {
    let distAcc = 0;
    for (let i = 0; i < trail.length - 1; i++) {
      const p1 = trail[i];
      const p2 = trail[i + 1];
      const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      distAcc += d;
      if (distAcc >= distanceFromHead) {
        return p2;
      }
    }
    return trail[trail.length - 1] || trail[0];
  }

  private generateStarfield() {
    const count = 80;
    this.starfield = [];
    for (let i = 0; i < count; i++) {
      this.starfield.push({
        x: Math.random() * this.boardWidth,
        y: Math.random() * this.boardHeight,
        size: Math.random() * 1.6 + 0.4,
        alpha: Math.random() * 0.5 + 0.2
      });
    }
  }

  private generatePlanets() {
    const count = 3;
    this.farPlanets = [];
    for (let i = 0; i < count; i++) {
      this.farPlanets.push({
        x: Math.random() * this.boardWidth,
        y: Math.random() * this.boardHeight,
        radius: Phaser.Math.Between(140, 220),
        color: Phaser.Display.Color.GetColor(
          40 + Math.random() * 40,
          60 + Math.random() * 60,
          120 + Math.random() * 60
        ),
        alpha: 0.08 + Math.random() * 0.07
      });
    }
  }

  private generateDeepSeaAssets() {
    const planktonCount = Math.floor((this.boardWidth * this.boardHeight) / 3800);
    this.plankton = Array.from({ length: planktonCount }, () => ({
      x: Phaser.Math.Between(0, this.boardWidth),
      y: Phaser.Math.Between(0, this.boardHeight),
      size: Phaser.Math.FloatBetween(0.6, 1.6),
      alpha: Phaser.Math.FloatBetween(0.08, 0.24),
      vx: Phaser.Math.FloatBetween(-4, 6),
      vy: Phaser.Math.FloatBetween(6, 16)
    }));

    const bubbleCount = Math.floor((this.boardWidth * this.boardHeight) / 18000) + 6;
    this.bubbles = Array.from({ length: bubbleCount }, () => ({
      x: Phaser.Math.Between(0, this.boardWidth),
      y: Phaser.Math.Between(0, this.boardHeight),
      r: Phaser.Math.FloatBetween(3, 8),
      speed: Phaser.Math.FloatBetween(8, 18),
      drift: Phaser.Math.FloatBetween(-4, 4)
    }));

    this.ruins = [];
    const baseY = this.boardHeight * 0.66;
    const pillarCount = 5;
    for (let i = 0; i < pillarCount; i++) {
      const w = Phaser.Math.Between(70, 130);
      const h = Phaser.Math.Between(140, 240);
      const x = Phaser.Math.Between(0, this.boardWidth - w);
      const y = Phaser.Math.Clamp(baseY + Phaser.Math.Between(-20, 40), 0, this.boardHeight - h);
      this.ruins.push({ x, y, w, h });
    }

    this.arches = [
      { x: this.boardWidth * 0.5, y: this.boardHeight * 0.6, r: Math.min(this.boardWidth, this.boardHeight) * 0.22 },
      { x: this.boardWidth * 0.78, y: this.boardHeight * 0.52, r: Math.min(this.boardWidth, this.boardHeight) * 0.16 }
    ];

    const runeCount = 22;
    this.runes = Array.from({ length: runeCount }, (_, i) => {
      const zone = i % 2 === 0 ? 'left' : 'right';
      const x =
        zone === 'left'
          ? Phaser.Math.Between(40, Math.floor(this.boardWidth * 0.35))
          : Phaser.Math.Between(Math.floor(this.boardWidth * 0.65), this.boardWidth - 40);
      const y =
        zone === 'left'
          ? Phaser.Math.Between(Math.floor(this.boardHeight * 0.62), this.boardHeight - 60)
          : Phaser.Math.Between(40, Math.floor(this.boardHeight * 0.38));
      return {
        x,
        y,
        len: Phaser.Math.Between(8, 20),
        angle: Phaser.Math.FloatBetween(-0.6, 0.6),
        color: i % 3 === 0 ? 0x7dffa8 : 0x6fe2ff
      };
    });
  }

  private generateSkyAssets() {
    const islandCount = 5;
    this.skyIslands = [];
    for (let i = 0; i < islandCount; i++) {
      const w = Phaser.Math.Between(120, 220);
      const h = Phaser.Math.Between(70, 120);
      const x = Phaser.Math.Between(0, this.boardWidth - w);
      const y = Phaser.Math.Between(Math.floor(this.boardHeight * 0.15), Math.floor(this.boardHeight * 0.55));
      this.skyIslands.push({ x, y, w, h });
    }

    const runeCount = 18;
    this.skyRunes = Array.from({ length: runeCount }, (_, i) => ({
      x: Phaser.Math.Between(30, this.boardWidth - 30),
      y: Phaser.Math.Between(Math.floor(this.boardHeight * 0.6), this.boardHeight - 40),
      len: Phaser.Math.Between(10, 22),
      angle: Phaser.Math.FloatBetween(-0.5, 0.5),
      color: i % 2 === 0 ? 0x7bd2ff : 0xb7ffd6
    }));

    const cloudCount = Math.floor((this.boardWidth * this.boardHeight) / 200000) + 1;
    this.clouds = Array.from({ length: cloudCount }, () => ({
      x: Phaser.Math.Between(-80, this.boardWidth + 80),
      y: Phaser.Math.Between(0, this.boardHeight),
      w: Phaser.Math.Between(260, 520),
      h: Phaser.Math.Between(90, 200),
      alpha: Phaser.Math.FloatBetween(0.07, 0.14),
      speed: Phaser.Math.FloatBetween(3, 8)
    }));

    const featherCount = Math.floor((this.boardWidth * this.boardHeight) / 9000);
    this.feathers = Array.from({ length: featherCount }, () => ({
      x: Phaser.Math.Between(0, this.boardWidth),
      y: Phaser.Math.Between(0, this.boardHeight),
      size: Phaser.Math.FloatBetween(1.4, 2.6),
      vx: Phaser.Math.FloatBetween(-6, 6),
      vy: Phaser.Math.FloatBetween(6, 14),
      alpha: Phaser.Math.FloatBetween(0.1, 0.2)
    }));
  }

  private drawNebula() {
    this.nebula.clear();
    const blobs = 6;
    for (let i = 0; i < blobs; i++) {
      const x = Math.random() * this.boardWidth;
      const y = Math.random() * this.boardHeight;
      const radius = Phaser.Math.Between(180, 320);
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(124, 58, 237),
        new Phaser.Display.Color(59, 130, 246),
        blobs,
        i
      );
      const tint = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
      this.nebula.fillStyle(tint, 0.14);
      this.nebula.fillCircle(x, y, radius);
    }
  }

  private draw() {
    const { cellSize, gap, colors } = this.cfg;
    this.graphics.clear();
    this.bgFx.clear();
    const score = this.state.score;
    const effectStrength = Phaser.Math.Clamp((score - 1000) / 2500, 0, 1);
    const now = this.time.now;
    if (Math.abs(effectStrength - this.lastBgStrength) > 0.015 || now - this.lastBgUpdate > 1200) {
      this.lastBgStrength = effectStrength;
      this.lastBgUpdate = now;
      this.drawBackground();
    }

    const camZoom = this.cameras.main.zoom || 1;
    const minScale = Math.max(1, 0.8 / camZoom);

    // food render (multiple kinds) with spawn闪烁和轻微脉动
    const timeNow = this.time.now;
    this.state.foods.forEach((food, idx) => {
      const baseX = food.x + cellSize / 2;
      const baseY = food.y + cellSize / 2;
      const spawnT = food.spawnAt ? Phaser.Math.Clamp((timeNow - food.spawnAt) / 400, 0, 1) : 1;
      const ease = Phaser.Math.Easing.Back.Out(spawnT);
      const pulse = 1 + 0.08 * Math.sin(timeNow / 320 + idx * 1.7);
      const radius = food.radius * ease * pulse * minScale;
      const fill =
        food.kind === 'big' ? 0xffb347 : food.kind === 'rare' ? 0xff5cf0 : colors.food;
      this.graphics.fillStyle(fill, 1);
      this.graphics.fillCircle(baseX, baseY, radius);
      this.graphics.lineStyle(2, 0xffffff, 0.35);
      this.graphics.strokeCircle(baseX, baseY, radius);
    });

    // item render：不同道具不同形态/颜色
    (this.state.items || []).forEach((item, idx) => {
      const baseX = item.x + cellSize / 2;
      const baseY = item.y + cellSize / 2;
      const spawnT = item.spawnAt ? Phaser.Math.Clamp((timeNow - item.spawnAt) / 350, 0, 1) : 1;
      const ease = Phaser.Math.Easing.Back.Out(spawnT);
      const pulse = 1 + 0.1 * Math.sin(timeNow / 300 + idx * 2.1);
      const radius = (item.radius || cellSize * 0.6) * ease * pulse * minScale;
      if (item.kind === 'shield') {
        const tint = 0x4ade80;
        this.graphics.lineStyle(3, tint, 0.9);
        this.graphics.strokeCircle(baseX, baseY, radius);
        this.graphics.fillStyle(tint, 0.25);
        this.graphics.fillCircle(baseX, baseY, radius * 0.7);
        // 盾牌 icon
        this.graphics.lineStyle(2, 0xffffff, 0.9);
        this.graphics.beginPath();
        this.graphics.moveTo(baseX, baseY - radius * 0.4);
        this.graphics.lineTo(baseX + radius * 0.45, baseY - radius * 0.05);
        this.graphics.lineTo(baseX, baseY + radius * 0.5);
        this.graphics.lineTo(baseX - radius * 0.45, baseY - radius * 0.05);
        this.graphics.closePath();
        this.graphics.strokePath();
      } else if (item.kind === 'magnet') {
        const tint = 0x38bdf8;
        this.graphics.fillStyle(tint, 0.9);
        this.graphics.fillCircle(baseX, baseY, radius * 0.9);
        this.graphics.lineStyle(2, 0xffffff, 0.9);
        // U 型磁铁简化
        this.graphics.beginPath();
        this.graphics.moveTo(baseX - radius * 0.4, baseY + radius * 0.2);
        this.graphics.arc(baseX, baseY, radius * 0.4, Math.PI * 0.6, Math.PI * 0.4, true);
        this.graphics.strokePath();
      } else if (item.kind === 'boost') {
        const tint = 0xf97316; // 橙色
        this.graphics.fillStyle(tint, 0.9);
        // 菱形
        this.graphics.beginPath();
        this.graphics.moveTo(baseX, baseY - radius);
        this.graphics.lineTo(baseX + radius, baseY);
        this.graphics.lineTo(baseX, baseY + radius);
        this.graphics.lineTo(baseX - radius, baseY);
        this.graphics.closePath();
        this.graphics.fillPath();
        this.graphics.lineStyle(2, 0xffffff, 0.9);
        this.graphics.strokePath();
      } else if (item.kind === 'foodstorm') {
        const tint = 0xa855f7; // 紫色
        this.graphics.fillStyle(tint, 0.85);
        // 星形
        const spikes = 5;
        const outerR = radius;
        const innerR = radius * 0.5;
        this.graphics.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const ang = (Math.PI / spikes) * i;
          const x = baseX + Math.cos(ang) * r;
          const y = baseY + Math.sin(ang) * r;
          if (i === 0) this.graphics.moveTo(x, y);
          else this.graphics.lineTo(x, y);
        }
        this.graphics.closePath();
        this.graphics.fillPath();
        this.graphics.lineStyle(2, 0xffffff, 0.8);
        this.graphics.strokePath();
      }
    });

    // bot render (all bots)
    this.state.bots.forEach((bot) => {
      const total = bot.body.length || 1;
      const invul = bot.invulnerableMs && bot.invulnerableMs > 0;
      const blinkAlpha = invul && Math.floor((bot.invulnerableMs || 0) / 150) % 2 === 0 ? 0.35 : 1;
      bot.body.forEach((seg, idx) => {
        const sx = seg.x + cellSize / 2;
        const sy = seg.y + cellSize / 2;
        const isHead = idx === 0;
        const t = idx / Math.max(1, total - 1);
        const tint = bot.color ?? this.botColor;
        const radius = cellSize * (isHead ? 0.65 : 0.6);
        const baseAlpha = isHead ? 1 : Phaser.Math.Clamp(1 - t * 0.5, 0.5, 1);
        const alpha = baseAlpha * (invul ? blinkAlpha : 1);

        // glow + body
        this.graphics.fillStyle(tint, 0.25 * alpha);
        this.graphics.fillCircle(sx, sy, radius + 6);
        this.graphics.fillStyle(tint, alpha);
        this.graphics.fillCircle(sx, sy, radius);

        // highlight
        this.graphics.fillStyle(0xffffff, 0.2 * alpha);
        this.graphics.fillCircle(sx - radius * 0.25, sy - radius * 0.25, radius * 0.3);

        if (isHead) {
          this.graphics.lineStyle(2, tint, 0.5);
          this.graphics.strokeCircle(sx, sy, radius + 2);
          const eyeOffset = radius * 0.42;
          const eyeRadius = radius * 0.32;
          const pupilRadius = eyeRadius * 0.52;
          const dx = Math.cos(seg.rot || 0);
          const dy = Math.sin(seg.rot || 0);
          const eye1x = sx + eyeOffset * -dy * 0.8 + dx * radius * 0.1;
        const eye1y = sy + eyeOffset * dx * 0.8 + dy * radius * 0.1;
        const eye2x = sx - eyeOffset * -dy * 0.8 + dx * radius * 0.1;
        const eye2y = sy - eyeOffset * dx * 0.8 + dy * radius * 0.1;
        [[eye1x, eye1y], [eye2x, eye2y]].forEach(([ex, ey]) => {
          this.graphics.fillStyle(0xffffff, 1);
          this.graphics.fillCircle(ex, ey, eyeRadius);
          this.graphics.lineStyle(1.4, 0x0f0f0f, 0.8);
          this.graphics.strokeCircle(ex, ey, eyeRadius);
          this.graphics.fillStyle(0x0f0f0f, 1);
          this.graphics.fillCircle(ex + dx * pupilRadius * 0.6, ey + dy * pupilRadius * 0.6, pupilRadius);
        });
        if (bot.shieldMs && bot.shieldMs > 0) {
          const ringR = radius + 10;
          this.graphics.lineStyle(4, 0x4ade80, 0.9);
          this.graphics.strokeCircle(sx, sy, ringR);
          const ratio = Phaser.Math.Clamp(bot.shieldMs / 3000, 0, 1);
          this.graphics.beginPath();
          this.graphics.lineStyle(4, 0xffffff, 0.7);
          this.graphics.arc(sx, sy, ringR + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
          this.graphics.strokePath();
          this.graphics.closePath();
        }
      }
    });
  });

    // border
    if (this.cfg.mode === 'wrap') {
      this.graphics.lineStyle(2, colors.border, 0.3);
      this.graphics.strokeRect(2, 2, this.boardWidth - 4, this.boardHeight - 4);
    } else {
      this.graphics.lineStyle(3, colors.border, 0.85);
      this.graphics.strokeRoundedRect(0.5, 0.5, this.boardWidth - gap, this.boardHeight - gap, 10);
      this.graphics.lineStyle(6, colors.border, 0.15);
      this.graphics.strokeRoundedRect(3, 3, this.boardWidth - 6, this.boardHeight - 6, 14);
    }

    // stage effects (cosmic)
    if (this.bgTheme === 'cosmic' && effectStrength > 0.1) {
      if (this.meteorTimer <= 0 && this.meteors.length < 2) {
        this.meteorTimer = 9000 - effectStrength * 5000;
        const startX = Phaser.Math.Between(-50, this.boardWidth + 50);
        const startY = Phaser.Math.Between(-50, this.boardHeight * 0.3);
        this.meteors.push({ x: startX, y: startY, vx: 90, vy: 180, life: 1400 });
      }
      this.meteors.forEach((m) => {
        m.x += (m.vx * this.game.loop.delta) / 1000;
        m.y += (m.vy * this.game.loop.delta) / 1000;
        m.life -= this.game.loop.delta;
        this.graphics.lineStyle(2, 0x6fe2ff, 0.35 + 0.25 * effectStrength);
        this.graphics.beginPath();
        this.graphics.moveTo(m.x, m.y);
        this.graphics.lineTo(m.x - 18, m.y - 36);
        this.graphics.strokePath();
      });
      this.meteors = this.meteors.filter((m) => m.life > 0);
    }

    if (this.bgTheme === 'cosmic' && effectStrength > 0.35) {
      const pulse = (0.12 + 0.12 * effectStrength) * (1 + 0.35 * Math.sin(this.dangerPulse / 320));
      this.graphics.lineStyle(10, 0x6fe2ff, pulse);
      this.graphics.strokeRoundedRect(6, 6, this.boardWidth - 12, this.boardHeight - 12, 18);
    }

    // deep sea effects
    if (this.bgTheme === 'deepsea') {
      const fogDrift = 0.06 * Math.sin(this.dangerPulse / 900);
      const planktonAlphaBoost = 0.2 + 0.6 * effectStrength;
      this.plankton.forEach((p) => {
        p.x += (p.vx * this.game.loop.delta) / 1000;
        p.y += (p.vy * this.game.loop.delta) / 1000 + fogDrift;
        if (p.x < -10) p.x = this.boardWidth + 10;
        if (p.x > this.boardWidth + 10) p.x = -10;
        if (p.y > this.boardHeight + 10) p.y = -10;
        this.bgFx.fillStyle(0x39d5ff, p.alpha * planktonAlphaBoost);
        this.bgFx.fillCircle(p.x, p.y, p.size);
      });

      // rune pulse (1000+)
      if (effectStrength > 0.1) {
        const runePulse = 0.15 + 0.35 * effectStrength;
        this.runes.forEach((r, idx) => {
          const pulse = runePulse * (0.6 + 0.4 * Math.sin(this.dangerPulse / 500 + idx));
          const x2 = r.x + Math.cos(r.angle) * r.len;
          const y2 = r.y + Math.sin(r.angle) * r.len;
          this.bgFx.lineStyle(2, r.color, pulse);
          this.bgFx.beginPath();
          this.bgFx.moveTo(r.x, r.y);
          this.bgFx.lineTo(x2, y2);
          this.bgFx.strokePath();
        });
      }

      // bubbles (slow)
      this.bubbles.forEach((b) => {
        b.y -= (b.speed * this.game.loop.delta) / 1000;
        b.x += (b.drift * this.game.loop.delta) / 1000;
        if (b.y < -20) {
          b.y = this.boardHeight + 20;
          b.x = Phaser.Math.Between(0, this.boardWidth);
        }
        this.bgFx.lineStyle(1, 0x9fe7ff, 0.25);
        this.bgFx.strokeCircle(b.x, b.y, b.r);
      });

      // light beam sweep (3000+)
      if (effectStrength > 0.6) {
        const beamPhase = (this.dangerPulse / 9000) % 1;
        const beamX = -this.boardWidth * 0.2 + beamPhase * this.boardWidth * 1.4;
        this.bgFx.fillStyle(0x6fe2ff, 0.08 + 0.12 * effectStrength);
        this.bgFx.beginPath();
        this.bgFx.moveTo(beamX, -50);
        this.bgFx.lineTo(beamX + 180, -50);
        this.bgFx.lineTo(beamX + 380, this.boardHeight + 50);
        this.bgFx.lineTo(beamX + 200, this.boardHeight + 50);
        this.bgFx.closePath();
        this.bgFx.fillPath();
      }

      // edge electric flicker (4000+)
      if (effectStrength > 0.85 && Math.random() < 0.08) {
        const alpha = 0.12 + 0.2 * Math.random();
        this.bgFx.lineStyle(2, 0x7dffa8, alpha);
        const y = Phaser.Math.Between(10, this.boardHeight - 10);
        this.bgFx.beginPath();
        this.bgFx.moveTo(6, y);
        this.bgFx.lineTo(26, y + Phaser.Math.Between(-6, 6));
        this.bgFx.strokePath();
      }
    }

    if (this.bgTheme === 'sky') {
      // clouds drift
      this.clouds.forEach((c) => {
        const speedBoost = 1 + effectStrength * 1.8;
        c.x += (c.speed * speedBoost * this.game.loop.delta) / 1000;
        if (c.x > this.boardWidth + 120) c.x = -c.w - 120;
        this.bgFx.fillStyle(0xffffff, c.alpha);
        this.bgFx.fillRoundedRect(c.x, c.y, c.w, c.h, c.h * 0.6);
      });

      // feathers
      this.feathers.forEach((f) => {
        f.x += (f.vx * this.game.loop.delta) / 1000;
        f.y += (f.vy * this.game.loop.delta) / 1000;
        if (f.x < -10) f.x = this.boardWidth + 10;
        if (f.x > this.boardWidth + 10) f.x = -10;
        if (f.y > this.boardHeight + 10) f.y = -10;
        this.bgFx.fillStyle(0xffffff, f.alpha);
        this.bgFx.fillEllipse(f.x, f.y, f.size * 2.2, f.size);
      });

      // rune pulse
      if (effectStrength > 0.1) {
        const pulseBase = 0.12 + 0.35 * effectStrength;
        this.skyRunes.forEach((r, idx) => {
          const pulse = pulseBase * (0.6 + 0.4 * Math.sin(this.dangerPulse / 520 + idx));
          const x2 = r.x + Math.cos(r.angle) * r.len;
          const y2 = r.y + Math.sin(r.angle) * r.len;
          this.bgFx.lineStyle(2, r.color, pulse);
          this.bgFx.beginPath();
          this.bgFx.moveTo(r.x, r.y);
          this.bgFx.lineTo(x2, y2);
          this.bgFx.strokePath();
        });
      }

      // light beam sweep
      if (effectStrength > 0.6) {
        const beamPhase = (this.dangerPulse / 9000) % 1;
        const beamX = -this.boardWidth * 0.2 + beamPhase * this.boardWidth * 1.4;
        this.bgFx.fillStyle(0xfff1b8, 0.08 + 0.12 * effectStrength);
        this.bgFx.beginPath();
        this.bgFx.moveTo(beamX, -40);
        this.bgFx.lineTo(beamX + 180, -40);
        this.bgFx.lineTo(beamX + 420, this.boardHeight + 40);
        this.bgFx.lineTo(beamX + 240, this.boardHeight + 40);
        this.bgFx.closePath();
        this.bgFx.fillPath();
      }

      // edge wind flicker
      if (effectStrength > 0.85 && Math.random() < 0.08) {
        const alpha = 0.08 + 0.18 * Math.random();
        this.bgFx.lineStyle(2, 0xffffff, alpha);
        const y = Phaser.Math.Between(12, this.boardHeight - 12);
        this.bgFx.beginPath();
        this.bgFx.moveTo(8, y);
        this.bgFx.lineTo(28, y + Phaser.Math.Between(-5, 5));
        this.bgFx.strokePath();
      }
    }

    // combo ripple
    if (this.rippleTimer > 0) {
      const progress = 1 - this.rippleTimer / 800;
      const radius = progress * Math.min(this.boardWidth, this.boardHeight) * 0.35;
      this.graphics.lineStyle(2, 0x6fe2ff, 0.6 * (1 - progress));
      this.graphics.strokeCircle(this.rippleOrigin.x, this.rippleOrigin.y, radius);
    }

    // danger glow when space tight
    const occupancy = this.state.snake.length / (this.cfg.gridSize.cols * this.cfg.gridSize.rows);
    if (occupancy >= 0.6) {
      const alpha = 0.2 + 0.15 * Math.sin(this.dangerPulse / 300);
      this.graphics.lineStyle(10, 0xff4d5a, alpha);
      this.graphics.strokeRoundedRect(2, 2, this.boardWidth - 4, this.boardHeight - 4, 14);
    }

    // food
    const firstFood = this.state.foods[0];
    if (firstFood) {
      const fx = firstFood.x * (cellSize + gap);
      const fy = firstFood.y * (cellSize + gap);
      this.graphics.fillStyle(colors.food, 1);
      this.graphics.fillRoundedRect(fx + gap, fy + gap, cellSize - gap * 2, cellSize - gap * 2, 4);
      this.graphics.lineStyle(1.6, 0xffffff, 0.35);
      this.graphics.strokeRoundedRect(fx + gap, fy + gap, cellSize - gap * 2, cellSize - gap * 2, 4);
    }

    // snake (soft orbs style instead of hard grid blocks)
    const total = this.state.snake.length || 1;
    this.state.snake.forEach((seg, idx) => {
      const sx = seg.x + cellSize / 2;
      const sy = seg.y + cellSize / 2;
      const isHead = idx === 0;
      const t = idx / Math.max(1, total - 1);
      const colorIdx = idx % this.rainbowPalette.length;
      const tint = this.rainbowPalette[colorIdx];
      const radius = cellSize * (isHead ? 0.7 : 0.65);
      const alpha = isHead ? 1 : Phaser.Math.Clamp(1 - t * 0.5, 0.5, 1);

      // outer glow
      this.graphics.fillStyle(colors.snakeGlow, 0.25 * alpha);
      this.graphics.fillCircle(sx, sy, radius + 8);

      // body orb
      this.graphics.fillStyle(tint, alpha);
      this.graphics.fillCircle(sx, sy, radius);

      // inner highlight
      this.graphics.fillStyle(0xffffff, 0.2 * alpha);
      this.graphics.fillCircle(sx - radius * 0.25, sy - radius * 0.25, radius * 0.3);

      if (isHead) {
        this.graphics.lineStyle(3, colors.snakeGlow, 0.5);
        this.graphics.strokeCircle(sx, sy, radius + 3);
        // eyes
        const eyeOffset = radius * 0.42;
        const eyeRadius = radius * 0.32;
        const pupilRadius = eyeRadius * 0.52;
        const dx = Math.cos(seg.rot || 0);
        const dy = Math.sin(seg.rot || 0);
        const eye1x = sx + eyeOffset * -dy * 0.8 + dx * radius * 0.1;
        const eye1y = sy + eyeOffset * dx * 0.8 + dy * radius * 0.1;
        const eye2x = sx - eyeOffset * -dy * 0.8 + dx * radius * 0.1;
        const eye2y = sy - eyeOffset * dx * 0.8 + dy * radius * 0.1;
        [ [eye1x, eye1y], [eye2x, eye2y] ].forEach(([ex, ey]) => {
          this.graphics.fillStyle(0xffffff, 1);
          this.graphics.fillCircle(ex, ey, eyeRadius);
          this.graphics.lineStyle(1.4, 0x0f0f0f, 0.8);
          this.graphics.strokeCircle(ex, ey, eyeRadius);
          this.graphics.fillStyle(0x0f0f0f, 1);
          this.graphics.fillCircle(ex + dx * pupilRadius * 0.6, ey + dy * pupilRadius * 0.6, pupilRadius);
        });

        // shield indicator on head
        if ((this.state.shieldMs || 0) > 0) {
          const shieldRatio = Phaser.Math.Clamp((this.state.shieldMs || 0) / 3000, 0, 1);
          const ringR = radius + 10;
          this.graphics.lineStyle(4, 0x4ade80, 0.9);
          this.graphics.strokeCircle(sx, sy, ringR);
          // progress arc
          this.graphics.beginPath();
          this.graphics.lineStyle(4, 0xffffff, 0.8);
          this.graphics.arc(sx, sy, ringR + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shieldRatio, false);
          this.graphics.strokePath();
          this.graphics.closePath();
        }
      }
    });
  }


  public resetGame() {
    // 清理 bot 相关的物理实体
    this.botHeadSprites.forEach((s) => s.destroy());
    this.botHeadSprites = [];
    this.botHeadGroup.clear(true, true);
    this.playerNameText?.destroy();
    this.playerNameText = undefined;

    // 重建状态、食物与 bot
    this.state = this.createInitialState();
    this.fillInitialFood();
    this.fillInitialItems();
    this.itemCheckTimer = 0;
    if (this.playerHeadSprite) {
      const head = this.state.snake[0];
      this.playerHeadSprite.setPosition(head.x + this.cfg.cellSize / 2, head.y + this.cfg.cellSize / 2);
    }
    this.playerNameText = this.add
      .text(this.state.snake[0].x + this.cfg.cellSize / 2, this.state.snake[0].y - this.cfg.cellSize * 0.8, this.playerName, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff'
      })
      .setOrigin(0.5, 1)
      .setDepth(5)
      .setShadow(0, 0, '#000000', 6, false, true);
    this.initBots(this.state.snake[0]);
    this.wallGraceTimer = 0;
    this.paused = false;
    this.startGameLoop();
    this.draw();
    this.eventsBridge.onStateChange?.({ isAlive: true, score: 0 });
    this.recomputeTeamScores();
  }

  public pauseGame() {
    this.paused = true;
  }

  public resumeGame() {
    this.paused = false;
  }



  private updateCamera() {
    const boardWidth = this.boardWidth;
    const boardHeight = this.boardHeight;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, boardWidth, boardHeight);
    const viewportWidth = Math.max(1, this.scale.width);
    const viewportHeight = Math.max(1, this.scale.height);
    const fitZoom = Math.min(viewportWidth / boardWidth, viewportHeight / boardHeight);

    // 移动端横屏会频繁触发 resize（地址栏显隐），这里不再每次强制重置 zoom。
    // 只在越界时修正，避免与 updateCameraFollow 的动态缩放互相拉扯造成“呼吸式放大缩小”。
    const currentZoom = cam.zoom || this.zoomSettings.max;
    const safeZoom = Phaser.Math.Clamp(currentZoom, fitZoom, this.zoomSettings.max);
    cam.setZoom(safeZoom);

    const halfW = cam.width / (2 * cam.zoom);
    const halfH = cam.height / (2 * cam.zoom);
    const cx = Phaser.Math.Clamp(cam.midPoint.x, halfW, boardWidth - halfW);
    const cy = Phaser.Math.Clamp(cam.midPoint.y, halfH, boardHeight - halfH);
    cam.centerOn(cx, cy);
  }

  private updateCameraFollow() {
    const head = this.state.snake[0];
    if (!head) return;

    const cam = this.cameras.main;
    const { cellSize, gap } = this.cfg;
    const centerX = head.x + cellSize / 2;
    const centerY = head.y + cellSize / 2;

    // zoom based on length/score
    const len = this.state.snake.length;
    const targetZoom = Phaser.Math.Clamp(
      this.zoomSettings.max - (len - 3) * 0.01,
      this.zoomSettings.min,
      this.zoomSettings.max
    );
    const currentZoom = cam.zoom || targetZoom;
    const nextZoom = Phaser.Math.Linear(currentZoom, targetZoom, this.zoomSettings.lerp);
    cam.setZoom(nextZoom);

    // clamp camera center to board bounds to avoid black borders
    const halfW = cam.width / (2 * cam.zoom);
    const halfH = cam.height / (2 * cam.zoom);
    const clampedX = Phaser.Math.Clamp(centerX, halfW, this.boardWidth - halfW);
    const clampedY = Phaser.Math.Clamp(centerY, halfH, this.boardHeight - halfH);
    cam.centerOn(clampedX, clampedY);

    // FPS overlay update
    if (this.fpsText) {
      this.fpsAccumulator += 1;
      this.fpsFrames += this.game.loop.delta;
      if (this.fpsAccumulator >= 20) {
        const avgDelta = this.fpsFrames / this.fpsAccumulator;
        const fps = avgDelta > 0 ? 1000 / avgDelta : 0;
        this.fpsText.setText(`FPS ${fps.toFixed(0)}`);
        this.fpsAccumulator = 0;
        this.fpsFrames = 0;
      }
    }
    if (this.botText) {
      this.botText.setText(`BOT ${this.state.bots.length}/${this.targetBots}`);
    }
  }

  shutdown() {
    if (this.resizeHandler) {
      this.scale.off('resize', this.resizeHandler);
    }
    this.input.keyboard?.off('keydown', this.handleKey, this);
    this.playerHeadSprite?.destroy();
    this.playerNameText?.destroy();
    this.botHeadSprites.forEach((s) => s.destroy());
  }

  private createHeadTextures() {
    if (!this.textures.exists('snake_head_tex')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x2cf0ff, 1);
      g.fillCircle(20, 20, 18);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(14, 14, 6);
      g.generateTexture('snake_head_tex', 40, 40);
      g.clear();
      g.fillStyle(this.botColor, 1);
      g.fillCircle(20, 20, 18);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(14, 14, 6);
      g.generateTexture('bot_head_tex', 40, 40);
      g.destroy();
    }
  }
}
