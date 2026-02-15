import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Settings } from 'lucide-react';
import {
  buildDispatchDots,
  applyDispatchCost,
  applyPassiveGrowth,
  CAMP_COLOR,
  cloneInitialNodeStates,
  createNodeRecord,
  NODE_IDS,
  NodeId,
  NodeState,
  resolveHit,
  type Camp,
  type DispatchDot
} from './core';
import {
  clamp,
  pointToSegmentDistance,
  SHARED_ARROW_HEAD_LENGTH,
  SHARED_ARROW_HEAD_WIDTH,
  SHARED_ARROW_SMOOTH_FOLLOW,
  SHARED_ARROW_START_OFFSET,
  SHARED_ARROW_STROKE_WIDTH,
  SHARED_CAPTURE_RADIUS,
  SHARED_LONG_PRESS_MS
} from './interactionShared';
import {
  FEEL_ABSORB_SHAKE_COOLDOWN_MS,
  FEEL_ABSORB_DISTANCE,
  FEEL_ABSORB_SHAKE_ENABLED,
  FEEL_ABSORB_SHAKE_AMP,
  FEEL_ABSORB_SHAKE_MS,
  FEEL_ARROW_COLOR_MODE,
  FEEL_ARROW_ENABLED,
  FEEL_ARROW_HEAD_LENGTH,
  FEEL_ARROW_HEAD_WIDTH,
  FEEL_ARROW_HIT_FEEDBACK_STRENGTH,
  FEEL_ARROW_MAX_DISTANCE,
  FEEL_ARROW_MIN_DISTANCE,
  FEEL_ARROW_OPACITY,
  FEEL_ARROW_SMOOTH_FOLLOW,
  FEEL_ARROW_START_OFFSET,
  FEEL_ARROW_STROKE_WIDTH,
  FEEL_CAPTURE_FILL_OPACITY,
  FEEL_CAPTURE_RADIUS,
  FEEL_CAPTURE_STROKE_OPACITY,
  FEEL_CHEVRON_DEPTH,
  FEEL_CLICK_SHAKE_ENABLED,
  FEEL_CLICK_SHAKE_AMP,
  FEEL_CLICK_SHAKE_MS,
  FEEL_DISPATCH_SHAKE_ENABLED,
  FEEL_DISPATCH_SHAKE_AMP,
  FEEL_DISPATCH_SHAKE_MS,
  FEEL_DOT_COL_GAP,
  FEEL_DOT_COLUMN_DELAY_MS,
  FEEL_DOT_EMIT_SPREAD_MS,
  FEEL_DOT_FORWARD_OFFSET,
  FEEL_DOT_RADIUS,
  FEEL_DOT_ROW_SPREAD,
  FEEL_DOT_TRAVEL_MS,
  FEEL_DOTS_PER_COLUMN,
  FEEL_EMIT_SPREAD_RANGE,
  FEEL_GROWTH_RATE_PER_SEC,
  FEEL_MOBILE_VIBRATE,
  FEEL_QUEUE_COL_GAP,
  FEEL_QUEUE_LANE_SPREAD,
  FEEL_QUEUE_ROW_GAP,
  FEEL_QUEUE_STAGGER_RATIO,
  FEEL_SHAKE_ENABLED,
  FEEL_SHAKE_FREQ_HZ
} from './feelShared';
import { CAMPAIGN_LEVELS } from './campaignMaps';
import { CampaignLegacyFeelPage } from './CampaignLegacyFeelPage';
import { NorthAmericaMapReplica, WARRING_GENERALS_BY_FACTION } from './NorthAmericaMapReplica';
import { chuInit, hanInit, qiInit, qinInit, weiInit, yanInit, zhaoInit, type FactionInitConfig } from './warringStatesData';

type SceneMode = 'home' | 'feelTest' | 'campaign' | 'campaignPlay' | 'warringDraw' | 'chinaProvince' | 'generalAtlas';
type ArrowColorMode = 'fixed' | 'team' | 'targetStatus';
type WarringStateId = 'qin' | 'chu' | 'han' | 'wei' | 'zhao' | 'qi' | 'yan';

type NodeMeta = {
  id: NodeId;
  rect: { x: number; y: number; w: number; h: number; r: number };
  center: { x: number; y: number };
};

type TroopDot = DispatchDot;

type NodeConquestPageProps = {
  onClose?: () => void;
};

type CellPoint = { x: number; y: number };

const WARRING_DRAW_POOL: Array<{ id: WarringStateId; name: string; color: string; desc: string }> = [
  { id: 'qin', name: '秦', color: '#2E3440', desc: '西陲强国，兵锋稳健' },
  { id: 'chu', name: '楚', color: '#0F766E', desc: '南方大国，资源充沛' },
  { id: 'zhao', name: '赵', color: '#7C3AED', desc: '北地劲旅，攻守均衡' },
  { id: 'yan', name: '燕', color: '#D97706', desc: '边地雄国，后劲十足' },
  { id: 'wei', name: '魏', color: '#DC2626', desc: '中原要冲，机动灵活' },
  { id: 'qi', name: '齐', color: '#1D4ED8', desc: '东海富庶，发展平稳' },
  { id: 'han', name: '韩', color: '#DB2777', desc: '小而精悍，讲究运营' }
];
const WARRING_DRAW_WEIGHT_BY_ID: Record<WarringStateId, number> = {
  qin: 5,
  chu: 5,
  zhao: 10,
  yan: 20,
  wei: 20,
  qi: 20,
  han: 20
};
const WARRING_INIT_BY_ID: Record<WarringStateId, FactionInitConfig> = {
  qin: qinInit,
  chu: chuInit,
  han: hanInit,
  wei: weiInit,
  zhao: zhaoInit,
  qi: qiInit,
  yan: yanInit
};
const WARRING_GENERAL_RULES = {
  hireSuccessRate: '65%',
  tierProb: 'S/A/B/C = 6/20/34/40',
  failRefundRate: '50%',
  tierTroopCap: 'S/A/B/C = 320/240/180/120',
  tierUpkeep: 'S/A/B/C = 36/28/22/16'
};

const clipPolygonByHalfPlane = (
  polygon: CellPoint[],
  nx: number,
  ny: number,
  c: number
): CellPoint[] => {
  if (polygon.length <= 0) return polygon;
  const inside = (p: CellPoint) => nx * p.x + ny * p.y <= c + 1e-6;
  const intersect = (a: CellPoint, b: CellPoint): CellPoint => {
    const da = nx * a.x + ny * a.y - c;
    const db = nx * b.x + ny * b.y - c;
    const denom = da - db;
    if (Math.abs(denom) < 1e-6) return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    const t = da / (da - db);
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
  };

  const output: CellPoint[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const curr = polygon[i];
    const prev = polygon[(i + polygon.length - 1) % polygon.length];
    const currIn = inside(curr);
    const prevIn = inside(prev);
    if (prevIn && currIn) output.push(curr);
    else if (prevIn && !currIn) output.push(intersect(prev, curr));
    else if (!prevIn && currIn) {
      output.push(intersect(prev, curr));
      output.push(curr);
    }
  }
  return output;
};

const buildNodeCells = (nodes: Array<{ id: string; x: number; y: number }>, width: number, height: number) => {
  const base: CellPoint[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];
  return nodes.reduce<Record<string, CellPoint[]>>((acc, node) => {
    let poly = base;
    nodes.forEach((other) => {
      if (other.id === node.id || poly.length <= 0) return;
      const nx = other.x - node.x;
      const ny = other.y - node.y;
      const c = (other.x * other.x + other.y * other.y - node.x * node.x - node.y * node.y) * 0.5;
      poly = clipPolygonByHalfPlane(poly, nx, ny, c);
    });
    acc[node.id] = poly;
    return acc;
  }, {});
};

const polygonToPath = (polygon: CellPoint[]) => {
  if (polygon.length <= 0) return '';
  return `M ${polygon.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')} Z`;
};

const toDisplayValues = (nextNodes: NodeState[]): Record<NodeId, number> =>
  nextNodes.reduce(
    (acc, node) => ({ ...acc, [node.id]: node.value }),
    { A: 0, B: 0, C: 0, D: 0 } as Record<NodeId, number>
  );

const toLegacyInitialByCampaignLevel = (levelId: string): NodeState[] => {
  const level = CAMPAIGN_LEVELS.find((item) => item.id === levelId);
  if (!level) return cloneInitialNodeStates();
  const normalizeOwner = (owner: 'blue' | 'red' | 'neutral', x: number): Camp => {
    if (owner === 'blue' || owner === 'red') return owner;
    return x < level.width / 2 ? 'blue' : 'red';
  };

  const sortedBlue = level.nodes.filter((node) => node.owner === 'blue').sort((a, b) => b.value - a.value);
  const sortedRed = level.nodes.filter((node) => node.owner === 'red').sort((a, b) => b.value - a.value);
  const sortedNeutral = level.nodes.filter((node) => node.owner === 'neutral').sort((a, b) => b.value - a.value);

  const baseBlue = sortedBlue[0] ?? level.nodes[0];
  const baseRed = sortedRed[0] ?? level.nodes[level.nodes.length - 1] ?? baseBlue;
  const neutralA = sortedNeutral[0] ?? level.nodes[Math.floor(level.nodes.length / 2)] ?? baseBlue;
  const neutralB = sortedNeutral[1] ?? sortedNeutral[0] ?? baseRed;

  return [
    { id: 'A', owner: normalizeOwner(baseBlue.owner, baseBlue.x), value: Math.max(12, Math.floor(baseBlue.value)) },
    { id: 'B', owner: normalizeOwner(baseRed.owner, baseRed.x), value: Math.max(12, Math.floor(baseRed.value)) },
    { id: 'C', owner: normalizeOwner(neutralA.owner, neutralA.x), value: Math.max(10, Math.floor(neutralA.value)) },
    { id: 'D', owner: normalizeOwner(neutralB.owner, neutralB.x), value: Math.max(10, Math.floor(neutralB.value)) }
  ];
};

const GROWTH_RATE = FEEL_GROWTH_RATE_PER_SEC;
const NUMBER_ANIM_SEC = 0.2;
const DOT_ROW_SPREAD = FEEL_DOT_ROW_SPREAD;
const DOT_COL_GAP = FEEL_DOT_COL_GAP;
const DOT_FORWARD_OFFSET = FEEL_DOT_FORWARD_OFFSET;
const QUEUE_LANE_SPREAD = FEEL_QUEUE_LANE_SPREAD;
const QUEUE_STAGGER_RATIO = FEEL_QUEUE_STAGGER_RATIO;
const CHEVRON_DEPTH = FEEL_CHEVRON_DEPTH;
const DEFAULT_DOT_TRAVEL_MS = FEEL_DOT_TRAVEL_MS;
const DEFAULT_DOT_COLUMN_DELAY_MS = FEEL_DOT_COLUMN_DELAY_MS;
const DEFAULT_DOTS_PER_COLUMN = FEEL_DOTS_PER_COLUMN;
const DEFAULT_DOT_RADIUS = FEEL_DOT_RADIUS;
const DEFAULT_ABSORB_DISTANCE = FEEL_ABSORB_DISTANCE;
const DEFAULT_EMIT_SPREAD_RANGE = FEEL_EMIT_SPREAD_RANGE;
const DEFAULT_QUEUE_ROW_GAP = FEEL_QUEUE_ROW_GAP;
const DEFAULT_QUEUE_COL_GAP = FEEL_QUEUE_COL_GAP;
const DOT_EMIT_SPREAD_MS = FEEL_DOT_EMIT_SPREAD_MS;
const DEFAULT_SHAKE_ENABLED = FEEL_SHAKE_ENABLED;
const DEFAULT_CLICK_SHAKE_ENABLED = FEEL_CLICK_SHAKE_ENABLED;
const DEFAULT_DISPATCH_SHAKE_ENABLED = FEEL_DISPATCH_SHAKE_ENABLED;
const DEFAULT_ABSORB_SHAKE_ENABLED = FEEL_ABSORB_SHAKE_ENABLED;
const DEFAULT_SHAKE_FREQ_HZ = FEEL_SHAKE_FREQ_HZ;
const DEFAULT_CLICK_SHAKE_AMP = FEEL_CLICK_SHAKE_AMP;
const DEFAULT_CLICK_SHAKE_MS = FEEL_CLICK_SHAKE_MS;
const DEFAULT_DISPATCH_SHAKE_AMP = FEEL_DISPATCH_SHAKE_AMP;
const DEFAULT_DISPATCH_SHAKE_MS = FEEL_DISPATCH_SHAKE_MS;
const DEFAULT_ABSORB_SHAKE_AMP = FEEL_ABSORB_SHAKE_AMP;
const DEFAULT_ABSORB_SHAKE_MS = FEEL_ABSORB_SHAKE_MS;
const DEFAULT_ABSORB_SHAKE_COOLDOWN_MS = FEEL_ABSORB_SHAKE_COOLDOWN_MS;
const DEFAULT_MOBILE_VIBRATE = FEEL_MOBILE_VIBRATE;
const DEFAULT_ARROW_ENABLED = FEEL_ARROW_ENABLED;
const DEFAULT_ARROW_START_OFFSET = FEEL_ARROW_START_OFFSET;
const DEFAULT_ARROW_STROKE_WIDTH = FEEL_ARROW_STROKE_WIDTH;
const DEFAULT_ARROW_HEAD_LENGTH = FEEL_ARROW_HEAD_LENGTH;
const DEFAULT_ARROW_HEAD_WIDTH = FEEL_ARROW_HEAD_WIDTH;
const DEFAULT_ARROW_MIN_DISTANCE = FEEL_ARROW_MIN_DISTANCE;
const DEFAULT_ARROW_MAX_DISTANCE = FEEL_ARROW_MAX_DISTANCE;
const DEFAULT_ARROW_COLOR_MODE: ArrowColorMode = FEEL_ARROW_COLOR_MODE;
const DEFAULT_ARROW_OPACITY = FEEL_ARROW_OPACITY;
const DEFAULT_ARROW_SMOOTH_FOLLOW = FEEL_ARROW_SMOOTH_FOLLOW;
const DEFAULT_ARROW_HIT_PULSE_MS = 180;
const DEFAULT_CAPTURE_RADIUS = FEEL_CAPTURE_RADIUS;
const CAPTURE_OPACITY = FEEL_CAPTURE_FILL_OPACITY;
const CAPTURE_STROKE_OPACITY = FEEL_CAPTURE_STROKE_OPACITY;
const MARCH_SOUND_INTERVAL_MS = 180;
const COLLISION_SOUND_COOLDOWN_MS = 80;
const NODE_META: NodeMeta[] = [
  { id: 'A', rect: { x: 78, y: 52, w: 254, h: 98, r: 24 }, center: { x: 205, y: 101 } },
  { id: 'B', rect: { x: 432, y: 52, w: 270, h: 98, r: 24 }, center: { x: 567, y: 101 } },
  { id: 'C', rect: { x: 78, y: 210, w: 254, h: 98, r: 24 }, center: { x: 205, y: 259 } },
  { id: 'D', rect: { x: 432, y: 210, w: 270, h: 98, r: 24 }, center: { x: 567, y: 259 } }
];
const CAMP_STYLE: Record<Camp, { areaFill: string; textFill: string }> = {
  blue: { areaFill: '#b7cee0', textFill: '#0d4f8a' },
  red: { areaFill: '#e5c3c3', textFill: '#8a1414' }
};
const NODE_META_BY_ID = NODE_META.reduce<Record<NodeId, NodeMeta>>(
  (acc, meta) => ({ ...acc, [meta.id]: meta }),
  {} as Record<NodeId, NodeMeta>
);

const getDotRenderPosition = (
  dot: TroopDot,
  now: number,
  cfg: { dotTravelMs: number; absorbDistance: number; emitSpreadRange: number; queueRowGap: number; queueColGap: number }
) => {
  if (now < dot.startAt) return null;
  const from = NODE_META_BY_ID[dot.fromId].center;
  const to = NODE_META_BY_ID[dot.toId].center;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const rowSpacing = Math.max(0, cfg.queueRowGap);
  const colSpacing = Math.max(0, cfg.queueColGap);
  const rowShift = (dot.row - (dot.rowsInColumn - 1) / 2) * rowSpacing;
  const colShift = dot.col * colSpacing;
  const sx = from.x + ux * DOT_FORWARD_OFFSET;
  const sy = from.y + uy * DOT_FORWARD_OFFSET;
  const ex = to.x;
  const ey = to.y;
  const t = clamp((now - dot.startAt) / cfg.dotTravelMs, 0, 1);
  const centerX = sx + (ex - sx) * t;
  const centerY = sy + (ey - sy) * t;

  const emitT = clamp((now - dot.startAt) / DOT_EMIT_SPREAD_MS, 0, 1);
  const distToTargetCenter = Math.hypot(to.x - centerX, to.y - centerY);
  const absorbT = clamp(1 - distToTargetCenter / Math.max(1, cfg.absorbDistance), 0, 1);

  const emitFactor = emitT;
  const absorbFactor = 1 - absorbT;
  const centeredRow = dot.row - (dot.rowsInColumn - 1) / 2;
  const laneOffset = dot.laneBias * QUEUE_LANE_SPREAD;
  const staggerOffset = dot.columnStagger * DOT_ROW_SPREAD;
  const emitSpreadOffset = dot.laneBias * cfg.emitSpreadRange * (1 - emitT);
  const chevronBackOffset = Math.abs(centeredRow) * CHEVRON_DEPTH;
  const lateralShift = (rowShift + laneOffset + staggerOffset + emitSpreadOffset - colShift * 0.05) * emitFactor * absorbFactor;
  const forwardShift = -chevronBackOffset * emitFactor * absorbFactor;

  return {
    x: centerX + nx * lateralShift + ux * forwardShift,
    y: centerY + ny * lateralShift + uy * forwardShift,
    t,
    camp: dot.owner,
    color: CAMP_COLOR[dot.owner]
  };
};

export function NodeConquestPage({ onClose }: NodeConquestPageProps) {
  const [scene, setScene] = useState<SceneMode>('home');
  const [drawRollingNationId, setDrawRollingNationId] = useState<WarringStateId | null>(null);
  const [drawResultNationId, setDrawResultNationId] = useState<WarringStateId | null>(null);
  const [lockedNationId, setLockedNationId] = useState<WarringStateId | null>(null);
  const [isDrawingNation, setIsDrawingNation] = useState(false);
  const [drawAttemptsUsed, setDrawAttemptsUsed] = useState(0);
  const [selectedCampaignLevelId, setSelectedCampaignLevelId] = useState(CAMPAIGN_LEVELS[0]?.id ?? 'lv1');
  const [campaignPlayLevelId, setCampaignPlayLevelId] = useState(CAMPAIGN_LEVELS[0]?.id ?? 'lv1');
  const [legacyInitialNodes, setLegacyInitialNodes] = useState<NodeState[]>(() => cloneInitialNodeStates());
  const [legacyLevelLabel, setLegacyLevelLabel] = useState('手感测试面板');

  const [nodes, setNodes] = useState<NodeState[]>(() => cloneInitialNodeStates());
  const [displayValues, setDisplayValues] = useState<Record<NodeId, number>>(() => toDisplayValues(cloneInitialNodeStates()));
  const [selectedSources, setSelectedSources] = useState<NodeId[]>([]);
  const [troopDots, setTroopDots] = useState<TroopDot[]>([]);
  const [animationNow, setAnimationNow] = useState(() => performance.now());
  const [isDispatching, setIsDispatching] = useState(false);
  const dotTravelMs = DEFAULT_DOT_TRAVEL_MS;
  const dotColumnDelayMs = DEFAULT_DOT_COLUMN_DELAY_MS;
  const dotsPerColumn = DEFAULT_DOTS_PER_COLUMN;
  const dotRadius = DEFAULT_DOT_RADIUS;
  const absorbDistance = DEFAULT_ABSORB_DISTANCE;
  const emitSpreadRange = DEFAULT_EMIT_SPREAD_RANGE;
  const queueRowGap = DEFAULT_QUEUE_ROW_GAP;
  const queueColGap = DEFAULT_QUEUE_COL_GAP;
  const shakeEnabled = DEFAULT_SHAKE_ENABLED;
  const clickShakeEnabled = DEFAULT_CLICK_SHAKE_ENABLED;
  const dispatchShakeEnabled = DEFAULT_DISPATCH_SHAKE_ENABLED;
  const absorbShakeEnabled = DEFAULT_ABSORB_SHAKE_ENABLED;
  const shakeFreqHz = DEFAULT_SHAKE_FREQ_HZ;
  const clickShakeAmp = DEFAULT_CLICK_SHAKE_AMP;
  const clickShakeMs = DEFAULT_CLICK_SHAKE_MS;
  const dispatchShakeAmp = DEFAULT_DISPATCH_SHAKE_AMP;
  const dispatchShakeMs = DEFAULT_DISPATCH_SHAKE_MS;
  const absorbShakeAmp = DEFAULT_ABSORB_SHAKE_AMP;
  const absorbShakeMs = DEFAULT_ABSORB_SHAKE_MS;
  const absorbShakeCooldownMs = DEFAULT_ABSORB_SHAKE_COOLDOWN_MS;
  const mobileVibrate = DEFAULT_MOBILE_VIBRATE;
  const arrowEnabled = DEFAULT_ARROW_ENABLED;
  const arrowStartOffset = DEFAULT_ARROW_START_OFFSET;
  const arrowStrokeWidth = DEFAULT_ARROW_STROKE_WIDTH;
  const arrowHeadLength = DEFAULT_ARROW_HEAD_LENGTH;
  const arrowHeadWidth = DEFAULT_ARROW_HEAD_WIDTH;
  const arrowMinDistance = DEFAULT_ARROW_MIN_DISTANCE;
  const arrowMaxDistance = DEFAULT_ARROW_MAX_DISTANCE;
  const arrowColorMode = DEFAULT_ARROW_COLOR_MODE;
  const arrowOpacity = DEFAULT_ARROW_OPACITY;
  const arrowSmoothFollow = DEFAULT_ARROW_SMOOTH_FOLLOW;
  const [arrowHitFeedbackStrength, setArrowHitFeedbackStrength] = useState(FEEL_ARROW_HIT_FEEDBACK_STRENGTH);
  const [captureRadius, setCaptureRadius] = useState(DEFAULT_CAPTURE_RADIUS);
  const [nodeShakeOffsets, setNodeShakeOffsets] = useState<Record<NodeId, { x: number; y: number }>>(createNodeRecord(() => ({ x: 0, y: 0 })));
  const [aimPoint, setAimPoint] = useState<{ x: number; y: number } | null>(null);
  const [smoothedAimPoint, setSmoothedAimPoint] = useState<{ x: number; y: number } | null>(null);
  const [arrowHoverNode, setArrowHoverNode] = useState<NodeId | null>(null);
  const [hoverNode, setHoverNode] = useState<NodeId | null>(null);
  const [arrowPulseStartedAt, setArrowPulseStartedAt] = useState<Record<NodeId, number>>(createNodeRecord(() => 0));

  const numberAnimRafRef = useRef<number | null>(null);
  const troopAnimRafRef = useRef<number | null>(null);
  const growthTimerRef = useRef<number | null>(null);
  const hitTimerByDotRef = useRef<Record<string, number>>({});
  const dispatchTimerByDotRef = useRef<Record<string, number>>({});
  const canceledDotIdsRef = useRef<Set<string>>(new Set());
  const shakeRafRef = useRef<Record<NodeId, number | null>>(createNodeRecord(() => null));
  const lastAbsorbShakeAtRef = useRef(0);
  const aimFollowRafRef = useRef<number | null>(null);
  const lastArrowHoverNodeRef = useRef<NodeId | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const drawIntervalRef = useRef<number | null>(null);
  const drawFinalizeTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const longPressActiveRef = useRef(false);
  const pointerDownRef = useRef(false);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const marchLoopTimerRef = useRef<number | null>(null);
  const lastCollisionSoundAtRef = useRef(0);
  const nodeStateById = useMemo(
    () =>
      nodes.reduce(
        (acc, node) => ({ ...acc, [node.id]: node }),
        {} as Record<NodeId, NodeState>
      ),
    [nodes]
  );
  const ownerColorById = useMemo(
    () =>
      createNodeRecord((id) => {
        const owner = nodeStateById[id]?.owner ?? 'blue';
        return CAMP_COLOR[owner];
      }),
    [nodeStateById]
  );

  const clearHitTimers = () => {
    Object.values(hitTimerByDotRef.current).forEach((timer) => window.clearTimeout(timer));
    Object.values(dispatchTimerByDotRef.current).forEach((timer) => window.clearTimeout(timer));
    hitTimerByDotRef.current = {};
    dispatchTimerByDotRef.current = {};
    canceledDotIdsRef.current.clear();
  };

  const ensureAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
    if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const playTone = (frequency: number, durationMs: number, volume: number, type: OscillatorType) => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  };

  const playMarchSoundPulse = () => {
    playTone(240, 70, 0.04, 'triangle');
    window.setTimeout(() => playTone(310, 45, 0.03, 'triangle'), 35);
  };

  const playCollisionSound = () => {
    playTone(420, 45, 0.08, 'square');
    window.setTimeout(() => playTone(180, 60, 0.05, 'triangle'), 20);
  };

  const stopMarchLoop = () => {
    if (marchLoopTimerRef.current) {
      window.clearInterval(marchLoopTimerRef.current);
      marchLoopTimerRef.current = null;
    }
  };

  const clearWarringDrawTimers = () => {
    if (drawIntervalRef.current) {
      window.clearInterval(drawIntervalRef.current);
      drawIntervalRef.current = null;
    }
    if (drawFinalizeTimerRef.current) {
      window.clearTimeout(drawFinalizeTimerRef.current);
      drawFinalizeTimerRef.current = null;
    }
  };

  const rollRandomNationId = (): WarringStateId => {
    const totalWeight = WARRING_DRAW_POOL.reduce((sum, nation) => sum + (WARRING_DRAW_WEIGHT_BY_ID[nation.id] ?? 0), 0);
    if (totalWeight <= 0) return WARRING_DRAW_POOL[0].id;
    let roll = Math.random() * totalWeight;
    for (const nation of WARRING_DRAW_POOL) {
      roll -= WARRING_DRAW_WEIGHT_BY_ID[nation.id] ?? 0;
      if (roll <= 0) return nation.id;
    }
    return WARRING_DRAW_POOL[WARRING_DRAW_POOL.length - 1].id;
  };

  const startWarringDraw = () => {
    if (isDrawingNation || drawAttemptsUsed >= 2) return;
    clearWarringDrawTimers();
    setIsDrawingNation(true);
    setDrawAttemptsUsed((prev) => Math.min(2, prev + 1));
    setDrawResultNationId(null);
    setDrawRollingNationId(rollRandomNationId());
    drawIntervalRef.current = window.setInterval(() => {
      setDrawRollingNationId(rollRandomNationId());
    }, 80);
    drawFinalizeTimerRef.current = window.setTimeout(() => {
      const finalNationId = rollRandomNationId();
      clearWarringDrawTimers();
      setDrawRollingNationId(finalNationId);
      setDrawResultNationId(finalNationId);
      setIsDrawingNation(false);
    }, 1500);
  };

  useEffect(() => {
    growthTimerRef.current = window.setInterval(() => {
      setNodes((prev) => applyPassiveGrowth(prev, GROWTH_RATE * 0.05));
    }, 50);

    return () => {
      if (growthTimerRef.current) window.clearInterval(growthTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const targets = createNodeRecord((id) => nodes.find((n) => n.id === id)?.value ?? 0);

    if (numberAnimRafRef.current) window.cancelAnimationFrame(numberAnimRafRef.current);

    if (NUMBER_ANIM_SEC <= 0) {
      setDisplayValues(targets);
      return;
    }

    const start = performance.now();
    const durationMs = NUMBER_ANIM_SEC * 1000;
    const fromValues = displayValues;

    const tick = (now: number) => {
      const t = clamp((now - start) / durationMs, 0, 1);
      setDisplayValues(
        createNodeRecord((id) => {
          const from = fromValues[id];
          const target = targets[id];
          return from + (target - from) * t;
        })
      );
      if (t < 1) numberAnimRafRef.current = window.requestAnimationFrame(tick);
    };

    numberAnimRafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (numberAnimRafRef.current) window.cancelAnimationFrame(numberAnimRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  useEffect(() => {
    if (troopDots.length <= 0) return;
    const tick = (now: number) => {
      setAnimationNow(now);
      troopAnimRafRef.current = window.requestAnimationFrame(tick);
    };
    troopAnimRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (troopAnimRafRef.current) window.cancelAnimationFrame(troopAnimRafRef.current);
    };
  }, [troopDots.length]);

  useEffect(() => {
    setIsDispatching(troopDots.length > 0);
  }, [troopDots.length]);

  useEffect(() => {
    if (troopDots.length <= 0) {
      canceledDotIdsRef.current.clear();
      return;
    }
    const alive = new Set(troopDots.map((dot) => dot.id));
    Array.from(canceledDotIdsRef.current).forEach((id) => {
      if (!alive.has(id)) canceledDotIdsRef.current.delete(id);
    });
  }, [troopDots]);

  useEffect(() => {
    if (troopDots.length <= 0) {
      stopMarchLoop();
      return;
    }
    const ownMoving = troopDots.some((dot) => {
      if (canceledDotIdsRef.current.has(dot.id)) return false;
      if (animationNow < dot.startAt) return false;
      const t = clamp((animationNow - dot.startAt) / dotTravelMs, 0, 1);
      return t < 1;
    });
    if (!ownMoving) {
      stopMarchLoop();
      return;
    }
    ensureAudioContext();
    if (marchLoopTimerRef.current) return;
    playMarchSoundPulse();
    marchLoopTimerRef.current = window.setInterval(() => {
      playMarchSoundPulse();
    }, MARCH_SOUND_INTERVAL_MS);
  }, [troopDots, animationNow, dotTravelMs]);

  useEffect(() => {
    if (troopDots.length <= 1) return;
    const activeDots = troopDots
      .map((dot) => ({ dot, pos: getDotRenderPosition(dot, animationNow, { dotTravelMs, absorbDistance, emitSpreadRange, queueRowGap, queueColGap }) }))
      .filter((item): item is { dot: TroopDot; pos: { x: number; y: number; t: number; camp: Camp; color: string } } => Boolean(item.pos))
      .filter((item) => item.pos.t < 1 && !canceledDotIdsRef.current.has(item.dot.id));
    if (activeDots.length <= 1) return;
    const toRemove = new Set<string>();
    const collisionDistance = dotRadius * 2;
    for (let i = 0; i < activeDots.length; i += 1) {
      const a = activeDots[i];
      if (toRemove.has(a.dot.id)) continue;
      for (let j = i + 1; j < activeDots.length; j += 1) {
        const b = activeDots[j];
        if (toRemove.has(b.dot.id)) continue;
        if (a.pos.camp === b.pos.camp) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        if (d <= collisionDistance) {
          toRemove.add(a.dot.id);
          toRemove.add(b.dot.id);
          break;
        }
      }
    }
    if (toRemove.size <= 0) return;
    toRemove.forEach((id) => {
      canceledDotIdsRef.current.add(id);
      const timer = hitTimerByDotRef.current[id];
      if (timer) {
        window.clearTimeout(timer);
        delete hitTimerByDotRef.current[id];
      }
    });
    const now = performance.now();
    if (now - lastCollisionSoundAtRef.current >= COLLISION_SOUND_COOLDOWN_MS) {
      lastCollisionSoundAtRef.current = now;
      playCollisionSound();
    }
    setTroopDots((prev) => prev.filter((dot) => !toRemove.has(dot.id)));
  }, [troopDots, animationNow, dotRadius, dotTravelMs, absorbDistance, emitSpreadRange, queueRowGap, queueColGap]);

  useEffect(() => {
    if (scene === 'warringDraw') return;
    clearWarringDrawTimers();
    setIsDrawingNation(false);
  }, [scene]);

  useEffect(() => {
    if (selectedSources.length <= 0 || !aimPoint) {
      setSmoothedAimPoint(null);
      setArrowHoverNode(null);
      if (aimFollowRafRef.current) window.cancelAnimationFrame(aimFollowRafRef.current);
      return;
    }
    if (arrowSmoothFollow <= 0) {
      setSmoothedAimPoint(aimPoint);
      if (aimFollowRafRef.current) window.cancelAnimationFrame(aimFollowRafRef.current);
      return;
    }
    if (aimFollowRafRef.current) window.cancelAnimationFrame(aimFollowRafRef.current);
    const followFactor = clamp(1 - arrowSmoothFollow, 0.02, 1);
    const tick = () => {
      setSmoothedAimPoint((prev) => {
        const base = prev ?? aimPoint;
        return {
          x: base.x + (aimPoint.x - base.x) * followFactor,
          y: base.y + (aimPoint.y - base.y) * followFactor
        };
      });
      aimFollowRafRef.current = window.requestAnimationFrame(tick);
    };
    aimFollowRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (aimFollowRafRef.current) window.cancelAnimationFrame(aimFollowRafRef.current);
    };
  }, [selectedSources, aimPoint, arrowSmoothFollow]);

  useEffect(() => {
    if (!arrowHoverNode) {
      lastArrowHoverNodeRef.current = null;
      return;
    }
    if (lastArrowHoverNodeRef.current !== arrowHoverNode) {
      setArrowPulseStartedAt((prev) => ({ ...prev, [arrowHoverNode]: performance.now() }));
      triggerNodeShake(arrowHoverNode, 1.5 + arrowHitFeedbackStrength * 2.2, 50 + arrowHitFeedbackStrength * 55);
      lastArrowHoverNodeRef.current = arrowHoverNode;
    }
  }, [arrowHoverNode, arrowHitFeedbackStrength]);

  useEffect(() => {
    return () => {
      clearWarringDrawTimers();
      clearHitTimers();
      stopMarchLoop();
      NODE_IDS.forEach((id) => {
        const raf = shakeRafRef.current[id];
        if (raf) window.cancelAnimationFrame(raf);
      });
      if (aimFollowRafRef.current) window.cancelAnimationFrame(aimFollowRafRef.current);
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearSelectionState = () => {
    setSelectedSources([]);
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setArrowHoverNode(null);
    setHoverNode(null);
  };

  const onNodePointerDown = (id: NodeId, pointerPos?: { x: number; y: number }) => {
    ensureAudioContext();
    pointerDownRef.current = true;
    lastPointerPosRef.current = pointerPos ?? NODE_META_BY_ID[id].center;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      if (!pointerDownRef.current) return;
      suppressClickRef.current = true;
      longPressActiveRef.current = true;
      setSelectedSources((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setAimPoint(NODE_META_BY_ID[id].center);
      setSmoothedAimPoint(NODE_META_BY_ID[id].center);
    }, SHARED_LONG_PRESS_MS);
  };

  const onNodeHoverByPointer = (id: NodeId) => {
    if (!longPressActiveRef.current) return;
    setSelectedSources((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const onNodePointerUp = () => {
    pointerDownRef.current = false;
    if (longPressActiveRef.current) {
      if (hoverNode) {
        dispatchSelectedSourcesTo(hoverNode);
      }
      // 长按后松手，无论是否命中目标，都应退出出兵态并隐藏箭头。
      clearSelectionState();
    }
    clearLongPress();
    longPressActiveRef.current = false;
    lastPointerPosRef.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const triggerNodeShake = (nodeId: NodeId, amplitude: number, durationMs: number) => {
    if (!shakeEnabled) return;
    if (amplitude <= 0 || durationMs <= 0) return;
    const prevRaf = shakeRafRef.current[nodeId];
    if (prevRaf) window.cancelAnimationFrame(prevRaf);
    if (mobileVibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(Math.min(35, Math.max(8, Math.round(durationMs * 0.18))));
    }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        setNodeShakeOffsets((prev) => ({ ...prev, [nodeId]: { x: 0, y: 0 } }));
        shakeRafRef.current[nodeId] = null;
        return;
      }
      const decay = 1 - elapsed / durationMs;
      const phase = (elapsed / 1000) * shakeFreqHz * Math.PI * 2;
      const x = Math.sin(phase * 1.08) * amplitude * decay;
      const y = Math.cos(phase * 0.92) * amplitude * 0.65 * decay;
      setNodeShakeOffsets((prev) => ({ ...prev, [nodeId]: { x, y } }));
      shakeRafRef.current[nodeId] = window.requestAnimationFrame(tick);
    };
    shakeRafRef.current[nodeId] = window.requestAnimationFrame(tick);
  };

  const applyHit = (attackerOwner: Camp, toId: NodeId) => {
    if (absorbShakeEnabled) {
      const now = performance.now();
      if (now - lastAbsorbShakeAtRef.current >= absorbShakeCooldownMs) {
        lastAbsorbShakeAtRef.current = now;
        triggerNodeShake(toId, absorbShakeAmp, absorbShakeMs);
      }
    }
    setNodes((prev) => resolveHit(prev, { attackerOwner, toId }).nodes);
  };

  const sendFromTo = (fromId: NodeId, toId: NodeId) => {
    if (fromId === toId) return;

    const from = nodeStateById[fromId];
    if (!from) return;
    const sendAmount = Math.floor(from.value);
    if (sendAmount <= 0) return;

    if (dispatchShakeEnabled) {
      triggerNodeShake(fromId, dispatchShakeAmp, dispatchShakeMs);
    }
    const now = performance.now();
    const dots = buildDispatchDots({
      now,
      fromId,
      toId,
      owner: from.owner,
      sendAmount,
      dotColumnDelayMs,
      queueStaggerRatio: QUEUE_STAGGER_RATIO
    });
    setTroopDots((prevDots) => [...prevDots, ...dots]);
    setAnimationNow(now);
    dots.forEach((dot) => {
      const dispatchTimer = window.setTimeout(() => {
        delete dispatchTimerByDotRef.current[dot.id];
        setNodes((prev) => applyDispatchCost(prev, dot.fromId, 1));
      }, Math.max(0, dot.startAt - now));
      dispatchTimerByDotRef.current[dot.id] = dispatchTimer;

      const hitTimer = window.setTimeout(() => {
        delete hitTimerByDotRef.current[dot.id];
        if (canceledDotIdsRef.current.has(dot.id)) {
          canceledDotIdsRef.current.delete(dot.id);
          return;
        }
        applyHit(dot.owner, dot.toId);
        setTroopDots((prevDots) => prevDots.filter((item) => item.id !== dot.id));
      }, dot.startAt - now + dotTravelMs);
      hitTimerByDotRef.current[dot.id] = hitTimer;
    });
  };

  const onNodeClick = (id: NodeId) => {
    ensureAudioContext();
    if (suppressClickRef.current) return;
    if (clickShakeEnabled) triggerNodeShake(id, clickShakeAmp, clickShakeMs);

    if (selectedSources.length <= 0) {
      setSelectedSources([id]);
      setAimPoint(NODE_META_BY_ID[id].center);
      setSmoothedAimPoint(NODE_META_BY_ID[id].center);
      return;
    }

    if (selectedSources.length === 1 && selectedSources[0] === id) {
      clearSelectionState();
      return;
    }

    dispatchSelectedSourcesTo(id);
  };

  const dispatchSelectedSourcesTo = (toId: NodeId) => {
    const sources = selectedSources.filter((id) => id !== toId);
    if (sources.length <= 0) return;
    sources.forEach((fromId) => sendFromTo(fromId, toId));
    clearSelectionState();
  };

  const reset = () => {
    clearHitTimers();
    stopMarchLoop();
    const next = legacyInitialNodes.map((node) => ({ ...node }));
    setNodes(next);
    setDisplayValues(toDisplayValues(next));
    setSelectedSources([]);
    setTroopDots([]);
    setIsDispatching(false);
    setNodeShakeOffsets(createNodeRecord(() => ({ x: 0, y: 0 })));
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setArrowHoverNode(null);
    setHoverNode(null);
  };

  const renderDots = useMemo(() => {
    return troopDots
      .map((dot) => {
        const pos = getDotRenderPosition(dot, animationNow, { dotTravelMs, absorbDistance, emitSpreadRange, queueRowGap, queueColGap });
        if (!pos) return null;
        return { id: dot.id, color: pos.color, x: pos.x, y: pos.y };
      })
      .filter((dot): dot is { id: string; color: string; x: number; y: number } => Boolean(dot));
  }, [troopDots, animationNow, dotTravelMs, absorbDistance, emitSpreadRange, queueRowGap, queueColGap]);

  const baseCenters = createNodeRecord((id) => ({
    x: NODE_META_BY_ID[id].center.x + nodeShakeOffsets[id].x,
    y: NODE_META_BY_ID[id].center.y + nodeShakeOffsets[id].y
  }));
  const activeSources = selectedSources;
  const nodeRadii = createNodeRecord((id) => {
    const selectedRadius = activeSources.includes(id) ? 23 : 20;
    const pulseElapsed = performance.now() - arrowPulseStartedAt[id];
    const pulseT = clamp(pulseElapsed / DEFAULT_ARROW_HIT_PULSE_MS, 0, 1);
    const pulseEase = Math.sin(Math.PI * pulseT) * arrowHitFeedbackStrength;
    return selectedRadius * (1 + pulseEase * 0.14);
  });
  const handleBoardMove = (x: number, y: number) => {
    const prevPos = lastPointerPosRef.current;
    lastPointerPosRef.current = { x, y };
    if (activeSources.length > 0) {
      setAimPoint({ x, y });
      const pressedInsideIds = prevPos
        ? activeSources.filter((id) => {
            const prevDist = Math.hypot(prevPos.x - baseCenters[id].x, prevPos.y - baseCenters[id].y);
            const currDist = Math.hypot(x - baseCenters[id].x, y - baseCenters[id].y);
            const prevArrowLen = Math.max(0, prevDist - arrowStartOffset);
            const currArrowLen = Math.max(0, currDist - arrowStartOffset);
            return prevArrowLen >= captureRadius && currArrowLen < captureRadius;
          })
        : [];
      if (pressedInsideIds.length > 0) {
        setSelectedSources((prev) => {
          const next = prev.filter((id) => !pressedInsideIds.includes(id));
          if (next.length <= 0) {
            setAimPoint(null);
            setSmoothedAimPoint(null);
            setArrowHoverNode(null);
            setHoverNode(null);
          }
          return next;
        });
      }
    }
    const hovered = NODE_IDS.reduce<{ id: NodeId | null; dist: number }>(
      (best, id) => {
        const d = Math.hypot(x - baseCenters[id].x, y - baseCenters[id].y);
        const hitR = nodeRadii[id] + Math.max(12, captureRadius * 0.35);
        if (d <= hitR && d < best.dist) return { id, dist: d };
        return best;
      },
      { id: null, dist: Number.POSITIVE_INFINITY }
    ).id;
    setArrowHoverNode(hovered);
    setHoverNode(hovered);
    if (pointerDownRef.current && longPressActiveRef.current && prevPos) {
      const crossed = NODE_IDS.filter((id) => {
        const hitR = nodeRadii[id] + Math.max(12, captureRadius * 0.35);
        return pointToSegmentDistance(baseCenters[id], prevPos, { x, y }) <= hitR;
      });
      if (crossed.length > 0) {
        setSelectedSources((prev) => {
          const merged = new Set(prev);
          crossed.forEach((id) => merged.add(id));
          return Array.from(merged) as NodeId[];
        });
      }
    }
    if (hovered) onNodeHoverByPointer(hovered);
  };

  if (scene === 'campaignPlay') {
    return <CampaignLegacyFeelPage levelId={campaignPlayLevelId} onBack={() => setScene('campaign')} />;
  }

  if (scene === 'chinaProvince') {
    return (
      <NorthAmericaMapReplica
        onBack={() => setScene('warringDraw')}
        playerNationId={lockedNationId ?? drawResultNationId ?? undefined}
      />
    );
  }

  if (scene === 'warringDraw') {
    const displayNationId = lockedNationId ?? drawResultNationId ?? drawRollingNationId;
    const displayNation = displayNationId
      ? (WARRING_DRAW_POOL.find((item) => item.id === displayNationId) ?? null)
      : null;
    const drawLocked = Boolean(lockedNationId);
    const canDraw = !drawLocked && !isDrawingNation && drawAttemptsUsed < 2;
    return (
      <div
        className="min-h-screen text-[#161616]"
        style={{
          backgroundColor: '#f4f4f4',
          backgroundImage: 'radial-gradient(#d8d8d8 0.9px, transparent 0.9px)',
          backgroundSize: '10px 10px'
        }}
      >
        <main className="mx-auto max-w-[560px] min-h-screen px-4 pt-5 pb-8 flex flex-col gap-4">
          <header className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScene('home')}
              className="h-12 w-12 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] grid place-items-center shadow-[0_4px_0_#121212]"
              aria-label="返回"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <div className="text-center">
              <div className="inline-block rounded-lg bg-[#161616] px-3 py-1 text-xs font-bold tracking-[0.08em] text-white">Warring States</div>
              <div className="mt-2 text-4xl leading-[1.03] font-black tracking-tight" style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}>
                抽签选国
              </div>
            </div>
            <div className="h-12 w-12" />
          </header>

          <section className="rotate-[0.7deg] rounded-3xl border-[3px] border-[#131313] bg-white p-4 shadow-[0_8px_0_#131313]">
            <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">ONLY RANDOM</div>
            <div className="mt-1 text-3xl font-black text-[#111]">战国七雄</div>
            <div className="mt-2 text-sm text-[#4a4a4a]">只能抽签，不能手选</div>
            <div className="mt-1 text-xs text-[#6b7280]">
              {drawLocked ? `本局国家：${displayNation?.name ?? '？'}（剩余不可重抽）` : `剩余抽签次数：${Math.max(0, 2 - drawAttemptsUsed)} / 2`}
            </div>

            <div className="mt-4 rounded-2xl border-[3px] border-[#131313] bg-[#f8fafc] p-4 text-center">
              <div className="text-xs tracking-[0.12em] text-[#6b7280]">抽签结果</div>
              <div
                className="mt-2 text-6xl font-black leading-none"
                style={{ color: displayNation?.color ?? '#9ca3af' }}
              >
                {displayNation?.name ?? '？'}
              </div>
              <div className="mt-2 text-sm font-semibold text-[#4b5563]">
                {displayNation?.desc ?? '点击下方按钮开始抽签'}
              </div>
            </div>

            <button
              type="button"
              onClick={startWarringDraw}
              disabled={!canDraw}
              className="mt-4 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-2xl font-black bg-[#e9f0ff] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}
            >
              {drawLocked ? '本局国家已锁定' : isDrawingNation ? '抽签中...' : drawAttemptsUsed >= 2 ? '抽签次数已用完' : '开始抽签'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!drawResultNationId) return;
                setLockedNationId(drawResultNationId);
                setScene('chinaProvince');
              }}
              disabled={!drawResultNationId || isDrawingNation}
              className="mt-3 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-2xl font-black bg-[#ecfeff] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}
            >
              {drawResultNationId ? (drawLocked ? `以${displayNation?.name ?? ''}国继续` : `以${displayNation?.name ?? ''}国开局`) : '先完成抽签'}
            </button>

            <button
              type="button"
              onClick={() => setScene('generalAtlas')}
              className="mt-3 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-2xl font-black bg-[#fff7ed] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313]"
              style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}
            >
              查看全部将领数据
            </button>

            <div className="mt-4 rounded-2xl border-[3px] border-[#131313] bg-[#f8fafc] p-3">
              <div className="text-xs tracking-[0.12em] text-[#6b7280]">STATS OVERVIEW</div>
              <div className="mt-1 text-xl font-black text-[#111]">七国与将领数值说明</div>
              <div className="mt-2 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                {WARRING_DRAW_POOL.map((nation) => {
                  const initCfg = WARRING_INIT_BY_ID[nation.id];
                  return (
                    <div key={`nation-brief-${nation.id}`} className="rounded-xl border-2 border-[#d1d5db] bg-white p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-base font-black" style={{ color: nation.color }}>{nation.name}国</div>
                        <div className="text-[10px] text-[#6b7280]">省份 {initCfg.provinces.length}</div>
                      </div>
                      <div className="mt-1 text-[11px] text-[#374151]">
                        初始：兵力{initCfg.resources.troops} / 粮草{initCfg.resources.grain} / 经济{initCfg.resources.economyPerTurn}
                      </div>
                      <div className="mt-1 text-[11px] text-[#374151]">
                        运营：征兵+{initCfg.economyCosts.troopPerEconomy * 20}（-20经）/ 购粮+{initCfg.economyCosts.grainPerEconomy * 20}（-20经）
                      </div>
                      <div className="mt-1 text-[11px] text-[#374151]">
                        招将：-{initCfg.economyCosts.generalHireCost}经，成功率{WARRING_GENERAL_RULES.hireSuccessRate}，失败返{WARRING_GENERAL_RULES.failRefundRate}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border-2 border-[#d1d5db] bg-white p-2 text-[11px] text-[#374151]">
                <div>将领档位概率：{WARRING_GENERAL_RULES.tierProb}</div>
                <div className="mt-1">统兵上限：{WARRING_GENERAL_RULES.tierTroopCap}</div>
                <div className="mt-1">档位维护：{WARRING_GENERAL_RULES.tierUpkeep}</div>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (scene === 'generalAtlas') {
    return (
      <div
        className="min-h-screen text-[#161616]"
        style={{
          backgroundColor: '#f4f4f4',
          backgroundImage: 'radial-gradient(#d8d8d8 0.9px, transparent 0.9px)',
          backgroundSize: '10px 10px'
        }}
      >
        <main className="mx-auto max-w-[860px] min-h-screen px-4 pt-5 pb-8 flex flex-col gap-4">
          <header className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScene('warringDraw')}
              className="h-12 w-12 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] grid place-items-center shadow-[0_4px_0_#121212]"
              aria-label="返回"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <div className="text-center">
              <div className="inline-block rounded-lg bg-[#161616] px-3 py-1 text-xs font-bold tracking-[0.08em] text-white">General Atlas</div>
              <div className="mt-2 text-4xl leading-[1.03] font-black tracking-tight" style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}>
                全部将领数据
              </div>
            </div>
            <div className="h-12 w-12" />
          </header>

          <section className="rounded-3xl border-[3px] border-[#131313] bg-white p-4 shadow-[0_8px_0_#131313]">
            <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">ALL GENERALS</div>
            <div className="mt-1 text-sm text-[#4a4a4a]">含：档位、统率、军略、后勤、机动、招募成本、维护、统兵上限</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {WARRING_DRAW_POOL.map((nation) => {
                const generals = WARRING_GENERALS_BY_FACTION[nation.id];
                return (
                  <div key={`general-atlas-${nation.id}`} className="rounded-2xl border-[3px] p-3" style={{ borderColor: nation.color }}>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-black" style={{ color: nation.color }}>{nation.name}国</div>
                      <div className="text-xs text-[#6b7280]">{generals.length} 名</div>
                    </div>
                    <div className="mt-2 max-h-[320px] overflow-y-auto rounded-xl border border-[#d1d5db] bg-[#f8fafc]">
                      {generals.map((general) => (
                        <div key={`${nation.id}-${general.name}`} className="border-b border-[#e5e7eb] px-2 py-1.5 text-[11px] last:border-b-0">
                          <div className="font-semibold text-[#111827]">{general.name}（{general.tier}）</div>
                          <div className="text-[#4b5563]">
                            统率{general.command} 军略{general.strategy} 后勤{general.logistics} 机动{general.mobility}
                          </div>
                          <div className="text-[#4b5563]">
                            招募{general.recruitCost} 维护{general.upkeepPerTurn} 统兵上限{general.troopCap}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (scene === 'campaign') {
    const selectedLevel = CAMPAIGN_LEVELS.find((level) => level.id === selectedCampaignLevelId) ?? CAMPAIGN_LEVELS[0];
    const nodeById = new Map(selectedLevel.nodes.map((node) => [node.id, node]));
    const nodeCells = buildNodeCells(selectedLevel.nodes, selectedLevel.width, selectedLevel.height);
    const ownerColor: Record<'blue' | 'red' | 'neutral', string> = {
      blue: '#2d86ff',
      red: '#ff6464',
      neutral: '#e8e8e8'
    };
    const ownerText: Record<'blue' | 'red' | 'neutral', string> = {
      blue: '#0d4f8a',
      red: '#8a1414',
      neutral: '#444'
    };
    return (
      <div
        className="min-h-screen text-[#161616]"
        style={{
          backgroundColor: '#f4f4f4',
          backgroundImage: 'radial-gradient(#d8d8d8 0.9px, transparent 0.9px)',
          backgroundSize: '10px 10px'
        }}
      >
        <main className="mx-auto max-w-[720px] min-h-screen px-4 pt-5 pb-8 flex flex-col gap-4">
          <header className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScene('home')}
              className="h-12 w-12 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] grid place-items-center shadow-[0_4px_0_#121212]"
              aria-label="返回"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <div className="text-center">
              <div className="inline-block rounded-lg bg-[#161616] px-3 py-1 text-xs font-bold tracking-[0.08em] text-white">Campaign</div>
              <div className="mt-2 text-4xl leading-[1.03] font-black tracking-tight" style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}>
                关卡模式（新）
              </div>
            </div>
            <button
              type="button"
              className="h-12 w-12 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] grid place-items-center shadow-[0_4px_0_#121212]"
              aria-label="设置"
            >
              <Settings className="h-7 w-7" />
            </button>
          </header>

          <section className="rotate-[0.7deg] rounded-3xl border-[3px] border-[#131313] bg-white p-4 shadow-[0_8px_0_#131313]">
            <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">LEVELS</div>
            <div className="mt-1 text-3xl font-black text-[#111]">自制地图关卡（12关）</div>
            <div className="mt-2 text-sm text-[#4a4a4a]">已完成关卡地图规划：节点、连线、初始阵营与兵力。</div>
            <div className="mt-4 grid grid-cols-3 md:grid-cols-4 gap-3">
              {CAMPAIGN_LEVELS.map((level, idx) => (
                <button
                  key={level.id}
                  type="button"
                  onClick={() => setSelectedCampaignLevelId(level.id)}
                  className={`rounded-xl border-[3px] py-3 font-black shadow-[0_5px_0_#131313] ${
                    selectedCampaignLevelId === level.id
                      ? 'border-[#131313] bg-[#e9f0ff] text-[#131313]'
                      : 'border-[#131313] bg-[#f8f8f8] text-[#131313]'
                  }`}
                >
                  第 {idx + 1} 关
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setCampaignPlayLevelId(selectedCampaignLevelId);
                setScene('campaignPlay');
              }}
              className="mt-4 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-2xl font-black bg-[#e9f0ff] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313]"
              style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}
            >
              开始当前关卡（地图渲染）
            </button>
            <div className="mt-4 rounded-2xl border-[2px] border-[#1a1a1a] bg-[#efefef] p-3">
              <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">PREVIEW</div>
              <div className="mt-1 text-xl font-black text-[#111]">{selectedLevel.name}</div>
              <div className="text-xs text-[#4b4b4b] mt-1">主题：{selectedLevel.theme} · 难度：{selectedLevel.difficulty}</div>
              <svg viewBox={`0 0 ${selectedLevel.width} ${selectedLevel.height}`} className="mt-3 w-full rounded-xl border border-[#d2d2d2] bg-[#d9d9de]">
                <defs>
                  <pattern id="neutral-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#b8bdc7" strokeWidth="2" />
                  </pattern>
                </defs>
                {selectedLevel.nodes.map((node) => {
                  const path = polygonToPath(nodeCells[node.id] ?? []);
                  if (!path) return null;
                  return (
                    <g key={`${selectedLevel.id}-cell-${node.id}`}>
                      <path
                        d={path}
                        fill={node.owner === 'neutral' ? 'url(#neutral-hatch)' : ownerColor[node.owner]}
                        fillOpacity={node.owner === 'neutral' ? 0.5 : 0.35}
                        stroke="#eff3f8"
                        strokeWidth="6"
                        strokeLinejoin="round"
                      />
                      <path
                        d={path}
                        fill="transparent"
                        stroke="#8f97a5"
                        strokeWidth="2.2"
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                })}
                {selectedLevel.edges.map((edge) => {
                  const from = nodeById.get(edge.a);
                  const to = nodeById.get(edge.b);
                  if (!from || !to) return null;
                  return <line key={`${selectedLevel.id}-${edge.a}-${edge.b}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#aeb3bc" strokeWidth="4" strokeLinecap="round" />;
                })}
                {selectedLevel.nodes.map((node) => (
                  <g key={`${selectedLevel.id}-${node.id}`}>
                    <circle cx={node.x} cy={node.y} r="15" fill={ownerColor[node.owner]} opacity={node.owner === 'neutral' ? 0.85 : 1} />
                    <text x={node.x} y={node.y + 5} textAnchor="middle" fontSize="12" fontWeight="800" fill={ownerText[node.owner]}>
                      {node.value}
                    </text>
                  </g>
                ))}
              </svg>
              <div className="mt-2 text-sm text-[#404040]">{selectedLevel.summary}</div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (scene === 'feelTest') {
    const arrowTargetRaw = activeSources.length > 0 ? (arrowSmoothFollow <= 0 ? aimPoint : smoothedAimPoint ?? aimPoint) : null;
    const probeForStatus = arrowTargetRaw ?? (activeSources[0] ? baseCenters[activeSources[0]] : null);
    const hoveredForStatus: NodeId | null = probeForStatus
      ? NODE_IDS.reduce<{ id: NodeId | null; dist: number }>(
          (best, id) => {
            const d = Math.hypot(probeForStatus.x - baseCenters[id].x, probeForStatus.y - baseCenters[id].y);
            if (d < best.dist) return { id, dist: d };
            return best;
          },
          { id: null, dist: Number.POSITIVE_INFINITY }
        ).id
      : null;
    const inTargetSnapRange =
      hoveredForStatus && probeForStatus
        ? Math.hypot(probeForStatus.x - baseCenters[hoveredForStatus].x, probeForStatus.y - baseCenters[hoveredForStatus].y) <= 96
        : false;
    const fromValue = activeSources[0] ? (nodeStateById[activeSources[0]]?.value ?? 0) : 0;
    const toValue =
      hoveredForStatus && hoveredForStatus !== activeSources[0] ? (nodeStateById[hoveredForStatus]?.value ?? 0) : fromValue;
    const targetStatusColor = inTargetSnapRange ? (fromValue >= toValue ? '#20b26b' : '#f29a2f') : '#6f6f6f';
    const arrowColor =
      arrowColorMode === 'fixed'
        ? '#111111'
        : arrowColorMode === 'targetStatus'
          ? targetStatusColor
          : activeSources[0]
            ? ownerColorById[activeSources[0]]
            : '#111111';
    const arrows = arrowEnabled && arrowTargetRaw
      ? activeSources
          .map((sourceId) => {
            const arrowFrom = baseCenters[sourceId];
            const dx = arrowTargetRaw.x - arrowFrom.x;
            const dy = arrowTargetRaw.y - arrowFrom.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 0.0001) return null;
            const ux = dx / dist;
            const uy = dy / dist;
            const sx = arrowFrom.x + ux * arrowStartOffset;
            const sy = arrowFrom.y + uy * arrowStartOffset;
            const postStartDist = Math.max(0, dist - arrowStartOffset);
            const clamped = Math.min(postStartDist, arrowMaxDistance);
            if (clamped < arrowMinDistance) return null;
            const ex = sx + ux * clamped;
            const ey = sy + uy * clamped;
            const hx = ex - ux * arrowHeadLength;
            const hy = ey - uy * arrowHeadLength;
            const nx = -uy;
            const ny = ux;
            return {
              sourceId,
              line: { sx, sy, ex, ey },
              head: {
                x1: hx + nx * arrowHeadWidth,
                y1: hy + ny * arrowHeadWidth,
                x2: hx - nx * arrowHeadWidth,
                y2: hy - ny * arrowHeadWidth
              }
            };
          })
          .filter((v): v is { sourceId: NodeId; line: { sx: number; sy: number; ex: number; ey: number }; head: { x1: number; y1: number; x2: number; y2: number } } => Boolean(v))
      : [];
    const arrowProbe = arrows[0] ? { x: arrows[0].line.ex, y: arrows[0].line.ey } : arrowTargetRaw;
    const sourceCaptureIds = activeSources;
    const targetCaptureCandidate =
      arrowProbe && activeSources[0]
        ? NODE_IDS.filter((id) => !activeSources.includes(id)).reduce<{ id: NodeId | null; dist: number }>(
            (best, id) => {
              const d = Math.hypot(arrowProbe.x - baseCenters[id].x, arrowProbe.y - baseCenters[id].y);
              if (d < best.dist) return { id, dist: d };
              return best;
            },
            { id: null, dist: Number.POSITIVE_INFINITY }
          )
        : { id: null, dist: Number.POSITIVE_INFINITY };
    const targetCaptureId =
      targetCaptureCandidate.id && targetCaptureCandidate.dist <= captureRadius + 24 ? targetCaptureCandidate.id : null;
    return (
      <div
        className="min-h-screen text-[#161616]"
        style={{
          backgroundColor: '#f4f4f4',
          backgroundImage: 'radial-gradient(#d8d8d8 0.9px, transparent 0.9px)',
          backgroundSize: '10px 10px'
        }}
      >
        <main className="mx-auto max-w-[900px] min-h-screen px-4 pt-5 pb-8 flex flex-col gap-4">
          <header className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setScene('home')}
              className="h-12 w-12 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] grid place-items-center shadow-[0_4px_0_#121212]"
              aria-label="返回大厅"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <div className="text-center">
              <div className="inline-block rounded-lg bg-[#161616] px-3 py-1 text-xs font-bold tracking-[0.08em] text-white">DEV TEST</div>
              <div className="mt-2 text-3xl md:text-4xl leading-[1.03] font-black tracking-tight" style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}>
                {legacyLevelLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="h-12 px-4 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] font-bold shadow-[0_4px_0_#121212]"
            >
              重置
            </button>
          </header>

          <section className="-rotate-[1deg] rounded-3xl border-[3px] border-[#131313] bg-white p-3 shadow-[0_8px_0_#131313]">
            <div className="rounded-2xl border-[2px] border-[#1a1a1a] bg-[#dfdfdf] p-3">
              <svg
                viewBox="0 0 780 360"
                className="w-full h-[330px] rounded-xl border border-[#c9c9c9] bg-[#d5d5d5]"
                style={{ touchAction: 'none' }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 780;
                  const y = ((e.clientY - rect.top) / rect.height) * 360;
                  handleBoardMove(x, y);
                }}
                onTouchMove={(e) => {
                  const touch = e.touches[0];
                  if (!touch) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((touch.clientX - rect.left) / rect.width) * 780;
                  const y = ((touch.clientY - rect.top) / rect.height) * 360;
                  handleBoardMove(x, y);
                  e.preventDefault();
                }}
                onMouseLeave={() => {
                  if (activeSources.length > 0 && activeSources[0]) {
                    const center = NODE_META_BY_ID[activeSources[0]].center;
                    setAimPoint(center);
                    setSmoothedAimPoint(center);
                  }
                  setArrowHoverNode(null);
                  setHoverNode(null);
                  if (pointerDownRef.current) onNodePointerUp();
                }}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    clearSelectionState();
                    clearLongPress();
                    longPressActiveRef.current = false;
                    pointerDownRef.current = false;
                  }
                }}
                onMouseUp={onNodePointerUp}
                onTouchEnd={onNodePointerUp}
                onTouchCancel={onNodePointerUp}
              >
                <rect x="18" y="18" width="744" height="324" rx="24" fill="#cecece" stroke="#bfbfbf" strokeWidth="2" pointerEvents="none" />
                {NODE_META.map((meta) => {
                  const selected = activeSources.includes(meta.id);
                  const nodeOwner = nodeStateById[meta.id]?.owner ?? 'blue';
                  return (
                    <rect
                      key={`area-${meta.id}`}
                      x={meta.rect.x}
                      y={meta.rect.y}
                      width={meta.rect.w}
                      height={meta.rect.h}
                      rx={meta.rect.r}
                      fill={CAMP_STYLE[nodeOwner].areaFill}
                      stroke={selected ? ownerColorById[meta.id] : '#f2f2f2'}
                      strokeWidth={selected ? 5 : 4}
                    onClick={() => onNodeClick(meta.id)}
                    onMouseDown={(e) => {
                      const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
                      onNodePointerDown(meta.id, {
                        x: ((e.clientX - rect.left) / rect.width) * 780,
                        y: ((e.clientY - rect.top) / rect.height) * 360
                      });
                    }}
                    onMouseUp={onNodePointerUp}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      if (!touch) return;
                      const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
                      onNodePointerDown(meta.id, {
                        x: ((touch.clientX - rect.left) / rect.width) * 780,
                        y: ((touch.clientY - rect.top) / rect.height) * 360
                      });
                      e.stopPropagation();
                    }}
                    onTouchEnd={onNodePointerUp}
                    style={{ cursor: 'pointer' }}
                  />
                );
                })}
                {(sourceCaptureIds.length > 0 ? sourceCaptureIds : hoverNode ? [hoverNode] : []).map((id) => (
                  <circle
                    key={`capture-source-${id}`}
                    cx={baseCenters[id].x}
                    cy={baseCenters[id].y}
                    r={captureRadius}
                    fill={ownerColorById[id]}
                    fillOpacity={CAPTURE_OPACITY}
                    stroke={ownerColorById[id]}
                    strokeOpacity={CAPTURE_STROKE_OPACITY}
                    strokeWidth="2"
                  />
                ))}
                {targetCaptureId && (
                  <circle
                    cx={baseCenters[targetCaptureId].x}
                    cy={baseCenters[targetCaptureId].y}
                    r={captureRadius}
                    fill={ownerColorById[targetCaptureId]}
                    fillOpacity={CAPTURE_OPACITY}
                    stroke={ownerColorById[targetCaptureId]}
                    strokeOpacity={CAPTURE_STROKE_OPACITY}
                    strokeWidth="2"
                  />
                )}
                {arrows.map((a) => (
                  <line
                    key={`arrow-line-${a.sourceId}`}
                    x1={a.line.sx}
                    y1={a.line.sy}
                    x2={a.line.ex}
                    y2={a.line.ey}
                    stroke={arrowColor}
                    strokeWidth={arrowStrokeWidth}
                    opacity={arrowOpacity}
                    strokeLinecap="round"
                  />
                ))}
                {arrows.map((a) => (
                  <polygon
                    key={`arrow-head-${a.sourceId}`}
                    points={`${a.line.ex},${a.line.ey} ${a.head.x1},${a.head.y1} ${a.head.x2},${a.head.y2}`}
                    fill={arrowColor}
                    opacity={Math.min(1, arrowOpacity + 0.03)}
                  />
                ))}
                {NODE_IDS.map((id) => (
                  <circle
                    key={`node-${id}`}
                    cx={baseCenters[id].x}
                    cy={baseCenters[id].y}
                    r={nodeRadii[id]}
                    fill={ownerColorById[id]}
                    onMouseDown={(e) => {
                      const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
                      onNodePointerDown(id, {
                        x: ((e.clientX - rect.left) / rect.width) * 780,
                        y: ((e.clientY - rect.top) / rect.height) * 360
                      });
                    }}
                    onMouseUp={onNodePointerUp}
                    onMouseLeave={() => {}}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      if (!touch) return;
                      const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
                      onNodePointerDown(id, {
                        x: ((touch.clientX - rect.left) / rect.width) * 780,
                        y: ((touch.clientY - rect.top) / rect.height) * 360
                      });
                      e.stopPropagation();
                    }}
                    onTouchEnd={onNodePointerUp}
                    onClick={() => onNodeClick(id)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
                {renderDots.map((dot) => <circle key={dot.id} cx={dot.x} cy={dot.y} r={dotRadius} fill={dot.color} opacity="0.95" />)}
                {NODE_META.map((meta) => (
                  <text
                    key={`value-${meta.id}`}
                    x={meta.rect.x + meta.rect.w / 2}
                    y={meta.rect.y + meta.rect.h - 14}
                    textAnchor="middle"
                    fontSize="20"
                    fontWeight="800"
                    fill={CAMP_STYLE[nodeStateById[meta.id]?.owner ?? 'blue'].textFill}
                    style={{ pointerEvents: 'none' }}
                  >
                    {Math.round(displayValues[meta.id])}
                  </text>
                ))}
              </svg>

              <div className="mt-3 text-sm text-[#4d4d4d]">
                测试模式：四个州都可操控。规则：同阵营加兵，异阵营减兵；目标兵力归零后立即被占领并切换归属。操作：单点-单点可出兵；长按-松手可连续多选出兵。当前选中出发节点：{activeSources.length ? activeSources.join(', ') : '无'}{isDispatching ? '（出兵中）' : ''}
              </div>
            </div>
          </section>

          <section className="rotate-[0.6deg] rounded-3xl border-[3px] border-[#131313] bg-white p-4 shadow-[0_8px_0_#131313]">
            <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">CUSTOM</div>
            <div className="mt-1 text-3xl font-black text-[#111]">参数已固定</div>
            <div className="mt-3 space-y-1 text-sm text-[#3f3f3f]">
              <div>每列点数：{dotsPerColumn}</div>
              <div>出现间隔：{dotColumnDelayMs}ms</div>
              <div>飞行时长：{dotTravelMs}ms</div>
              <div>圆点大小：{dotRadius}px</div>
              <div>吸附触发距离：{absorbDistance}px</div>
              <div>扩散范围：{emitSpreadRange}px</div>
              <div>上下间隔：{queueRowGap}px</div>
              <div>前后间隔：{queueColGap}px</div>
            </div>
            <div className="mt-4 border-t border-[#cbcbcb] pt-3 space-y-3 text-sm text-[#3f3f3f]">
              <div className="text-xs tracking-[0.1em] text-[#5f5f5f]">SHAKE</div>
              <div>总震动开关：{shakeEnabled ? '开' : '关'}</div>
              <div>点击震动：{clickShakeEnabled ? '开' : '关'}</div>
              <div>出兵震动：{dispatchShakeEnabled ? '开' : '关'}</div>
              <div>吸附命中震动：{absorbShakeEnabled ? '开' : '关'}</div>
              <div>手机振动（支持时）：{mobileVibrate ? '开' : '关'}</div>
              <div>震动频率：{shakeFreqHz}Hz</div>
              <div>点击强度/时长：{clickShakeAmp}px / {clickShakeMs}ms</div>
              <div>出兵强度/时长：{dispatchShakeAmp}px / {dispatchShakeMs}ms</div>
              <div>吸附强度/时长：{absorbShakeAmp}px / {absorbShakeMs}ms</div>
              <div>吸附震动冷却：{absorbShakeCooldownMs}ms</div>
            </div>
            <div className="mt-4 border-t border-[#cbcbcb] pt-3 space-y-3 text-sm text-[#3f3f3f]">
              <div className="text-xs tracking-[0.1em] text-[#5f5f5f]">ARROW</div>
              <div>箭头开关：{arrowEnabled ? '开' : '关'}</div>
              <div>箭头起点偏移：{arrowStartOffset}px</div>
              <div>箭头厚度：{arrowStrokeWidth}px</div>
              <div>箭头头部长度：{arrowHeadLength}px</div>
              <div>箭头头部宽度：{arrowHeadWidth}px</div>
              <div>最小显示距离：{arrowMinDistance}px</div>
              <div>最大显示距离：{arrowMaxDistance}px</div>
              <div>颜色模式：{arrowColorMode === 'team' ? '跟阵营色' : arrowColorMode === 'fixed' ? '固定色（黑）' : '跟目标状态色'}</div>
              <div>透明度：{arrowOpacity.toFixed(2)}</div>
              <div>平滑跟随系数：{arrowSmoothFollow.toFixed(2)}</div>
              <div>
                <div>透明圈半径：{captureRadius}px</div>
                <input
                  type="range"
                  min={8}
                  max={120}
                  step={1}
                  value={captureRadius}
                  onChange={(e) => setCaptureRadius(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>透明圈填充透明度：{CAPTURE_OPACITY.toFixed(2)}</div>
              <div>透明圈描边透明度：{CAPTURE_STROKE_OPACITY.toFixed(2)}</div>
              <div>
                <div>命中反馈强度：{arrowHitFeedbackStrength.toFixed(2)}（一次震动+一次放大）</div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={arrowHitFeedbackStrength}
                  onChange={(e) => setArrowHitFeedbackStrength(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </section>

        </main>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-[#161616]"
      style={{
        backgroundColor: '#f4f4f4',
        backgroundImage: 'radial-gradient(#d8d8d8 0.9px, transparent 0.9px)',
        backgroundSize: '10px 10px'
      }}
    >
      <main className="mx-auto max-w-[560px] min-h-screen px-4 pt-5 pb-8 flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-12 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] grid place-items-center shadow-[0_4px_0_#121212]"
            aria-label="返回"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <div className="text-center">
            <div className="inline-block rounded-lg bg-[#161616] px-3 py-1 text-xs font-bold tracking-[0.08em] text-white">Library</div>
            <div className="mt-2 text-4xl leading-[1.03] font-black tracking-tight" style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}>
              Node Conquest
            </div>
          </div>
          <button
            type="button"
            className="h-12 w-12 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] grid place-items-center shadow-[0_4px_0_#121212]"
            aria-label="设置"
          >
            <Settings className="h-7 w-7" />
          </button>
        </header>

        <section className="rotate-[0.7deg] rounded-3xl border-[3px] border-[#131313] bg-white p-4 shadow-[0_8px_0_#131313]">
          <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">MODE SELECT</div>
          <div className="mt-1 text-3xl font-black text-[#111]">节点占领</div>
          <div className="mt-3 text-sm text-[#4a4a4a]">原版测试与新关卡入口</div>

          <button
            type="button"
            onClick={() => setScene('campaign')}
            className="mt-3 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-2xl font-black bg-[#fff] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313]"
            style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}
          >
            关卡模式（新）
          </button>

          <button
            type="button"
            onClick={() => {
              clearWarringDrawTimers();
              setDrawRollingNationId(null);
              setDrawResultNationId(null);
              setLockedNationId(null);
              setDrawAttemptsUsed(0);
              setIsDrawingNation(false);
              setScene('warringDraw');
            }}
            className="mt-3 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-2xl font-black bg-[#e8f4ff] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313]"
            style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}
          >
            战国七雄（抽签开局）
          </button>

          <button
            type="button"
            onClick={() => {
              const next = cloneInitialNodeStates();
              setLegacyInitialNodes(next);
              setNodes(next.map((node) => ({ ...node })));
              setDisplayValues(toDisplayValues(next));
              setLegacyLevelLabel('手感测试面板');
              setScene('feelTest');
            }}
            className="mt-3 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-2xl font-black bg-[#e9f0ff] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313]"
            style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}
          >
            原测试面板（旧版）
          </button>
        </section>
      </main>
    </div>
  );
}
