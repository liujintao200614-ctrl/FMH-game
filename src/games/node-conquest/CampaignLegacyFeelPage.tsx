import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { CAMPAIGN_LEVELS, type CampaignLevel } from './campaignMaps';
import { clamp, pointToSegmentDistance, SHARED_LONG_PRESS_MS } from './interactionShared';
import {
  FEEL_ABSORB_DISTANCE,
  FEEL_ABSORB_SHAKE_ENABLED,
  FEEL_ABSORB_SHAKE_AMP,
  FEEL_ABSORB_SHAKE_COOLDOWN_MS,
  FEEL_ABSORB_SHAKE_MS,
  FEEL_ARROW_HEAD_LENGTH,
  FEEL_ARROW_HEAD_WIDTH,
  FEEL_ARROW_HIT_FEEDBACK_STRENGTH,
  FEEL_ARROW_MAX_DISTANCE,
  FEEL_ARROW_MIN_DISTANCE,
  FEEL_ARROW_START_OFFSET,
  FEEL_ARROW_STROKE_WIDTH,
  FEEL_CAPTURE_FILL_OPACITY,
  FEEL_CAPTURE_RADIUS,
  FEEL_CAPTURE_STROKE_OPACITY,
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
  FEEL_MOBILE_VIBRATE,
  FEEL_QUEUE_COL_GAP,
  FEEL_QUEUE_LANE_SPREAD,
  FEEL_QUEUE_ROW_GAP,
  FEEL_QUEUE_STAGGER_RATIO,
  FEEL_SHAKE_ENABLED,
  FEEL_SHAKE_FREQ_HZ
} from './feelShared';

type Owner = 'blue' | 'red' | 'neutral';

type RuntimeNode = {
  id: string;
  x: number;
  y: number;
  owner: Owner;
  value: number;
  growth: number;
};

type FlightDot = {
  id: string;
  fromId: string;
  toId: string;
  owner: 'blue' | 'red';
  row: number;
  col: number;
  rowsInColumn: number;
  startAt: number;
  laneBias: number;
  columnStagger: number;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  travelMs: number;
};

type CellPoint = { x: number; y: number };

type CampaignLegacyFeelPageProps = {
  levelId: string;
  onBack: () => void;
};

const DOT_RADIUS = FEEL_DOT_RADIUS;
const NODE_RADIUS = 14;
const CHEVRON_DEPTH = 16;
const CAPTURE_RADIUS = FEEL_CAPTURE_RADIUS;
const MARCH_SOUND_INTERVAL_MS = 180;
const COLLISION_SOUND_COOLDOWN_MS = 80;
const TEAM_GROWTH_PER_SEC = 1;
const NEUTRAL_RECOVER_BASE = 15;
const OCCUPIED_VALUE_CAP = 60;
const AI_DECISION_MS = 560;
const AI_OPENING_NO_ATTACK_MS = 18000;
const AI_ACTION_COOLDOWN_MS = 2600;
const AI_MIN_SEND = 1;
const AI_MIN_SOURCE_VALUE = 18;
const AI_MIN_GARRISON = 8;

const ownerColor: Record<Owner, string> = {
  blue: '#2d86ff',
  red: '#ff6464',
  neutral: '#e8e8e8'
};

const ownerText: Record<Owner, string> = {
  blue: '#0d4f8a',
  red: '#8a1414',
  neutral: '#3d3d3d'
};

const clipPolygonByHalfPlane = (polygon: CellPoint[], nx: number, ny: number, c: number): CellPoint[] => {
  if (polygon.length <= 0) return polygon;
  const inside = (p: CellPoint) => nx * p.x + ny * p.y <= c + 1e-6;
  const intersect = (a: CellPoint, b: CellPoint): CellPoint => {
    const da = nx * a.x + ny * a.y - c;
    const db = nx * b.x + ny * b.y - c;
    const denom = da - db;
    if (Math.abs(denom) < 1e-6) return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    const t = da / (da - db);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
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

const buildFlightDots = (
  now: number,
  fromNode: RuntimeNode,
  toNode: RuntimeNode,
  owner: 'blue' | 'red',
  sendAmount: number
): FlightDot[] => {
  const amount = Math.max(0, Math.floor(sendAmount));
  if (amount <= 0) return [];
  const perColumn = amount < 3 ? amount : 5;
  return Array.from({ length: amount }, (_, i) => {
    const row = i % perColumn;
    const col = Math.floor(i / perColumn);
    const rowsInColumn = Math.min(perColumn, amount - col * perColumn);
    const centeredRow = row - (rowsInColumn - 1) / 2;
    const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
    const laneBias = centeredRow / laneBiasDivisor;
    const columnStagger = col % 2 === 0 ? 0 : FEEL_QUEUE_STAGGER_RATIO;
    return {
      id: `${now}-${fromNode.id}-${toNode.id}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      fromId: fromNode.id,
      toId: toNode.id,
      owner,
      row,
      col,
      rowsInColumn,
      startAt: now + col * FEEL_DOT_COLUMN_DELAY_MS,
      laneBias,
      columnStagger,
      fromPos: { x: fromNode.x, y: fromNode.y },
      toPos: { x: toNode.x, y: toNode.y },
      travelMs: FEEL_DOT_TRAVEL_MS
    };
  });
};

const getDotRenderPosition = (dot: FlightDot, now: number) => {
  if (now < dot.startAt) return null;
  const from = dot.fromPos;
  const to = dot.toPos;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const rowShift = (dot.row - (dot.rowsInColumn - 1) / 2) * FEEL_QUEUE_ROW_GAP;
  const colShift = dot.col * FEEL_QUEUE_COL_GAP;
  const sx = from.x + ux * FEEL_DOT_FORWARD_OFFSET;
  const sy = from.y + uy * FEEL_DOT_FORWARD_OFFSET;
  const t = clamp((now - dot.startAt) / dot.travelMs, 0, 1);
  const centerX = sx + (to.x - sx) * t;
  const centerY = sy + (to.y - sy) * t;
  const emitT = clamp((now - dot.startAt) / FEEL_DOT_EMIT_SPREAD_MS, 0, 1);
  const distToTarget = Math.hypot(to.x - centerX, to.y - centerY);
  const absorbT = clamp(1 - distToTarget / FEEL_ABSORB_DISTANCE, 0, 1);
  const emitFactor = emitT;
  const absorbFactor = 1 - absorbT;
  const centeredRow = dot.row - (dot.rowsInColumn - 1) / 2;
  const laneOffset = dot.laneBias * FEEL_QUEUE_LANE_SPREAD;
  const staggerOffset = dot.columnStagger * FEEL_DOT_ROW_SPREAD;
  const emitSpreadOffset = dot.laneBias * 50 * (1 - emitT);
  const chevronBackOffset = Math.abs(centeredRow) * CHEVRON_DEPTH;
  const lateralShift = (rowShift + laneOffset + staggerOffset + emitSpreadOffset - colShift * 0.05) * emitFactor * absorbFactor;
  const forwardShift = -chevronBackOffset * emitFactor * absorbFactor;
  return { x: centerX + nx * lateralShift + ux * forwardShift, y: centerY + ny * lateralShift + uy * forwardShift, t };
};

export function CampaignLegacyFeelPage({ levelId, onBack }: CampaignLegacyFeelPageProps) {
  const level: CampaignLevel = CAMPAIGN_LEVELS.find((item) => item.id === levelId) ?? CAMPAIGN_LEVELS[0];
  const [nodes, setNodes] = useState<RuntimeNode[]>(() => level.nodes.map((node) => ({ ...node })));
  const [dots, setDots] = useState<FlightDot[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [aimPoint, setAimPoint] = useState<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const [result, setResult] = useState<'playing' | 'victory' | 'defeat'>('playing');
  const [nodeShakeOffsets, setNodeShakeOffsets] = useState<Record<string, { x: number; y: number }>>(
    () =>
      level.nodes.reduce(
        (acc, node) => ({ ...acc, [node.id]: { x: 0, y: 0 } }),
        {} as Record<string, { x: number; y: number }>
      )
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const levelNodeById = useMemo(() => new Map(level.nodes.map((node) => [node.id, node])), [level.nodes]);
  const nodeCells = useMemo(() => buildNodeCells(level.nodes, level.width, level.height), [level.height, level.nodes, level.width]);

  const rafRef = useRef<number | null>(null);
  const shakeRafByIdRef = useRef<Record<string, number | null>>({});
  const longPressTimerRef = useRef<number | null>(null);
  const pointerDownRef = useRef(false);
  const longPressActiveRef = useRef(false);
  const suppressClickRef = useRef(false);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const dispatchTimerByDotRef = useRef<Record<string, number>>({});
  const hitTimerByDotRef = useRef<Record<string, number>>({});
  const canceledDotIdsRef = useRef<Set<string>>(new Set());
  const nodesRef = useRef<RuntimeNode[]>(nodes);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const marchLoopTimerRef = useRef<number | null>(null);
  const blueEmitUntilRef = useRef(0);
  const lastHoverNodeIdRef = useRef<string | null>(null);
  const lastCollisionSoundAtRef = useRef(0);
  const lastAbsorbShakeAtRef = useRef(0);
  const roundStartAtRef = useRef(performance.now());
  const aiNextActionAtRef = useRef(0);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    roundStartAtRef.current = performance.now();
    aiNextActionAtRef.current = 0;
  }, [level.id]);

  const clearTimers = () => {
    Object.values(dispatchTimerByDotRef.current).forEach((timer) => window.clearTimeout(timer));
    Object.values(hitTimerByDotRef.current).forEach((timer) => window.clearTimeout(timer));
    dispatchTimerByDotRef.current = {};
    hitTimerByDotRef.current = {};
    canceledDotIdsRef.current.clear();
  };

  const clearSelection = () => {
    setSelectedSources([]);
    setHoverNodeId(null);
    setAimPoint(null);
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
    const t = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.02);
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

  const triggerNodeShake = (nodeId: string, amplitude: number, durationMs: number) => {
    if (!FEEL_SHAKE_ENABLED) return;
    if (amplitude <= 0 || durationMs <= 0) return;
    const prev = shakeRafByIdRef.current[nodeId];
    if (prev) window.cancelAnimationFrame(prev);
    if (FEEL_MOBILE_VIBRATE && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(Math.min(35, Math.max(8, Math.round(durationMs * 0.18))));
    }
    const start = performance.now();
    const tick = (ts: number) => {
      const elapsed = ts - start;
      if (elapsed >= durationMs) {
        setNodeShakeOffsets((old) => ({ ...old, [nodeId]: { x: 0, y: 0 } }));
        shakeRafByIdRef.current[nodeId] = null;
        return;
      }
      const decay = 1 - elapsed / durationMs;
      const phase = (elapsed / 1000) * FEEL_SHAKE_FREQ_HZ * Math.PI * 2;
      const x = Math.sin(phase * 1.08) * amplitude * decay;
      const y = Math.cos(phase * 0.92) * amplitude * 0.65 * decay;
      setNodeShakeOffsets((old) => ({ ...old, [nodeId]: { x, y } }));
      shakeRafByIdRef.current[nodeId] = window.requestAnimationFrame(tick);
    };
    shakeRafByIdRef.current[nodeId] = window.requestAnimationFrame(tick);
  };

  const queueDispatch = (fromId: string, toId: string, owner: 'blue' | 'red', sendAmount: number) => {
    if (result !== 'playing') return;
    if (fromId === toId) return;
    const fromNode = levelNodeById.get(fromId);
    const toNode = levelNodeById.get(toId);
    if (!fromNode || !toNode) return;
    const amount = Math.max(0, Math.floor(sendAmount));
    if (amount <= 0) return;

    const ts = performance.now();
    if (owner === 'blue') ensureAudioContext();
    const created = buildFlightDots(ts, fromNode, toNode, owner, amount);
    if (created.length <= 0) return;
    if (owner === 'blue') {
      const latestStartAt = created.reduce((max, dot) => Math.max(max, dot.startAt), ts);
      blueEmitUntilRef.current = Math.max(blueEmitUntilRef.current, latestStartAt);
    }
    if (FEEL_DISPATCH_SHAKE_ENABLED) triggerNodeShake(fromId, FEEL_DISPATCH_SHAKE_AMP, FEEL_DISPATCH_SHAKE_MS);

    created.forEach((dot) => {
      dispatchTimerByDotRef.current[dot.id] = window.setTimeout(() => {
        delete dispatchTimerByDotRef.current[dot.id];
        setNodes((prev) =>
          prev.map((node) => {
            if (node.id !== dot.fromId) return node;
            return { ...node, value: Math.max(0, node.value - 1) };
          })
        );
      }, Math.max(0, dot.startAt - ts));

      hitTimerByDotRef.current[dot.id] = window.setTimeout(() => {
        delete hitTimerByDotRef.current[dot.id];
        if (canceledDotIdsRef.current.has(dot.id)) {
          canceledDotIdsRef.current.delete(dot.id);
          return;
        }
        setNodes((prev) => {
          const byId = new Map(prev.map((node) => [node.id, { ...node }]));
          const target = byId.get(dot.toId);
          if (!target) return prev;
          if (target.owner === dot.owner) {
            target.value = Math.min(OCCUPIED_VALUE_CAP, target.value + 1);
          } else {
            const nextValue = Math.max(0, target.value - 1);
            if (nextValue > 0) target.value = nextValue;
            else {
              target.owner = dot.owner;
              target.value = 1;
            }
          }
          return Array.from(byId.values());
        });
        if (FEEL_ABSORB_SHAKE_ENABLED) {
          const shakeNow = performance.now();
          if (shakeNow - lastAbsorbShakeAtRef.current >= FEEL_ABSORB_SHAKE_COOLDOWN_MS) {
            lastAbsorbShakeAtRef.current = shakeNow;
            triggerNodeShake(dot.toId, FEEL_ABSORB_SHAKE_AMP, FEEL_ABSORB_SHAKE_MS);
          }
        }
        setDots((prevDots) => prevDots.filter((item) => item.id !== dot.id));
      }, dot.startAt - ts + dot.travelMs);
    });
    setDots((prevDots) => [...prevDots, ...created]);
    setNow(ts);
  };

  const dispatchSelectedSourcesTo = (toId: string, actor: 'blue' | 'red') => {
    const sources = selectedSources.filter((id) => id !== toId);
    if (sources.length <= 0) return;
    sources.forEach((fromId) => {
      const from = nodesRef.current.find((node) => node.id === fromId);
      if (!from || from.owner !== actor) return;
      const sendAmount = Math.floor(from.value);
      if (sendAmount <= 0) return;
      queueDispatch(fromId, toId, actor, sendAmount);
    });
    clearSelection();
  };

  useEffect(() => {
    if (result !== 'playing') return;
    const timer = window.setInterval(() => {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.owner === 'neutral') {
            if (node.value >= NEUTRAL_RECOVER_BASE) return node;
            return { ...node, value: Math.min(NEUTRAL_RECOVER_BASE, node.value + 0.05) };
          }
          return { ...node, value: Math.min(OCCUPIED_VALUE_CAP, node.value + TEAM_GROWTH_PER_SEC * 0.05) };
        })
      );
    }, 50);
    return () => window.clearInterval(timer);
  }, [result]);

  useEffect(() => {
    if (dots.length <= 0 || result !== 'playing') {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      setNow(ts);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [dots.length, result]);

  useEffect(() => {
    if (result !== 'playing') {
      stopMarchLoop();
      return;
    }
    if (now >= blueEmitUntilRef.current) {
      stopMarchLoop();
      return;
    }
    ensureAudioContext();
    if (marchLoopTimerRef.current) return;
    playMarchSoundPulse();
    marchLoopTimerRef.current = window.setInterval(playMarchSoundPulse, MARCH_SOUND_INTERVAL_MS);
  }, [now, result]);

  useEffect(() => {
    if (!hoverNodeId) {
      lastHoverNodeIdRef.current = null;
      return;
    }
    if (lastHoverNodeIdRef.current === hoverNodeId) return;
    lastHoverNodeIdRef.current = hoverNodeId;
    triggerNodeShake(
      hoverNodeId,
      1.5 + FEEL_ARROW_HIT_FEEDBACK_STRENGTH * 2.2,
      50 + FEEL_ARROW_HIT_FEEDBACK_STRENGTH * 55
    );
  }, [hoverNodeId]);

  useEffect(() => {
    if (dots.length <= 1 || result !== 'playing') return;
    const active = dots
      .map((dot) => {
        const pos = getDotRenderPosition(dot, now);
        if (!pos || pos.t >= 1) return null;
        return { id: dot.id, owner: dot.owner, x: pos.x, y: pos.y };
      })
      .filter((item): item is { id: string; owner: 'blue' | 'red'; x: number; y: number } => Boolean(item));
    if (active.length <= 1) return;
    const removeIds = new Set<string>();
    for (let i = 0; i < active.length; i += 1) {
      const a = active[i];
      if (removeIds.has(a.id)) continue;
      for (let j = i + 1; j < active.length; j += 1) {
        const b = active[j];
        if (removeIds.has(b.id)) continue;
        if (a.owner === b.owner) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) <= DOT_RADIUS * 2) {
          removeIds.add(a.id);
          removeIds.add(b.id);
          break;
        }
      }
    }
    if (removeIds.size <= 0) return;
    removeIds.forEach((id) => {
      canceledDotIdsRef.current.add(id);
      const timer = hitTimerByDotRef.current[id];
      if (timer) {
        window.clearTimeout(timer);
        delete hitTimerByDotRef.current[id];
      }
    });
    const soundNow = performance.now();
    if (soundNow - lastCollisionSoundAtRef.current >= COLLISION_SOUND_COOLDOWN_MS) {
      lastCollisionSoundAtRef.current = soundNow;
      playCollisionSound();
    }
    setDots((prevDots) => prevDots.filter((item) => !removeIds.has(item.id)));
  }, [dots, now, result]);

  useEffect(() => {
    if (result !== 'playing') return;
    const allBlue = nodes.every((node) => node.owner === 'blue');
    const anyBlue = nodes.some((node) => node.owner === 'blue');
    if (allBlue) {
      setResult('victory');
      clearSelection();
      clearTimers();
      setDots([]);
      return;
    }
    if (!anyBlue) {
      setResult('defeat');
      clearSelection();
      clearTimers();
      setDots([]);
    }
  }, [nodes, result]);

  useEffect(() => {
    if (result !== 'playing') return;
    const timer = window.setInterval(() => {
      const nowTs = performance.now();
      if (nowTs < aiNextActionAtRef.current) return;
      const current = nodesRef.current;
      const candidates: Array<{ fromId: string; toId: string; ratio: number; score: number }> = [];
      const openingProtected = nowTs - roundStartAtRef.current < AI_OPENING_NO_ATTACK_MS;
      const hasNeutral = current.some((node) => node.owner === 'neutral');
      current.forEach((from) => {
        const sourceValue = Math.floor(from.value);
        if (from.owner !== 'red' || sourceValue < AI_MIN_SOURCE_VALUE) return;
        current.forEach((to) => {
          if (to.id === from.id) return;
          if (!to || to.owner === 'red') return;
          if (openingProtected && to.owner === 'blue') return;
          if (hasNeutral && to.owner === 'blue') return;
          const distance = Math.hypot(from.x - to.x, from.y - to.y);
          const nearbyBlueThreat = current
            .filter((node) => node.owner === 'blue')
            .reduce((sum, node) => sum + Math.max(0, 210 - Math.hypot(node.x - to.x, node.y - to.y)) / 210 * node.value, 0);
          const ownerBonus = to.owner === 'neutral' ? 160 : 110;
          const distPenalty = distance * 0.018;
          const sourceBonus = (from.value - AI_MIN_GARRISON) * 0.42;
          const score = ownerBonus + nearbyBlueThreat * 0.1 - to.value * 1.35 + sourceBonus + Math.random() * 6;
          const finalScore = score - distPenalty;
          const ratio = to.owner === 'neutral' ? 0.58 : 0.44;
          candidates.push({ fromId: from.id, toId: to.id, ratio, score: finalScore });
        });
      });
      if (candidates.length <= 0) return;
      candidates.sort((a, b) => b.score - a.score);
      let dispatched = false;
      for (let i = 0; i < candidates.length; i += 1) {
        const action = candidates[i];
        const from = nodesRef.current.find((node) => node.id === action.fromId);
        if (!from || from.owner !== 'red') continue;
        const maxSend = Math.max(0, Math.floor(from.value) - AI_MIN_GARRISON);
        if (maxSend < AI_MIN_SEND) continue;
        const sendAmount = Math.max(AI_MIN_SEND, Math.min(maxSend, Math.floor(from.value * action.ratio)));
        if (sendAmount < AI_MIN_SEND) continue;
        queueDispatch(action.fromId, action.toId, 'red', sendAmount);
        dispatched = true;
        break;
      }
      if (dispatched) aiNextActionAtRef.current = nowTs + AI_ACTION_COOLDOWN_MS;
    }, AI_DECISION_MS);
    return () => window.clearInterval(timer);
  }, [result]);

  useEffect(() => {
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      stopMarchLoop();
      clearTimers();
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
      Object.values(shakeRafByIdRef.current).forEach((raf) => {
        if (raf) window.cancelAnimationFrame(raf);
      });
    };
  }, []);

  const findHoverNode = (point: { x: number; y: number }) =>
    nodes.reduce<{ id: string | null; dist: number }>(
      (best, node) => {
        const d = Math.hypot(point.x - node.x, point.y - node.y);
        if (d < best.dist && d <= NODE_RADIUS + 16) return { id: node.id, dist: d };
        return best;
      },
      { id: null, dist: Number.POSITIVE_INFINITY }
    ).id;

  const onNodePointerDown = (id: string, pointerPos: { x: number; y: number }) => {
    const node = nodeById.get(id);
    if (!node || node.owner !== 'blue' || result !== 'playing') return;
    ensureAudioContext();
    pointerDownRef.current = true;
    lastPointerPosRef.current = pointerPos;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      if (!pointerDownRef.current) return;
      suppressClickRef.current = true;
      longPressActiveRef.current = true;
      setSelectedSources((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setAimPoint({ x: node.x, y: node.y });
    }, SHARED_LONG_PRESS_MS);
  };

  const onPointerUp = () => {
    pointerDownRef.current = false;
    if (longPressActiveRef.current) {
      if (hoverNodeId) dispatchSelectedSourcesTo(hoverNodeId, 'blue');
      // 长按松手后统一清掉选中，避免箭头残留。
      clearSelection();
    }
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressActiveRef.current = false;
    lastPointerPosRef.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const onNodeClick = (id: string) => {
    if (result !== 'playing') return;
    if (FEEL_CLICK_SHAKE_ENABLED) triggerNodeShake(id, FEEL_CLICK_SHAKE_AMP, FEEL_CLICK_SHAKE_MS);
    if (suppressClickRef.current) return;
    ensureAudioContext();
    const node = nodeById.get(id);
    if (!node) return;
    if (selectedSources.length <= 0) {
      if (node.owner === 'blue') {
        setSelectedSources([id]);
        setAimPoint({ x: node.x, y: node.y });
      }
      return;
    }
    if (selectedSources.length === 1 && selectedSources[0] === id) {
      clearSelection();
      return;
    }
    dispatchSelectedSourcesTo(id, 'blue');
  };

  const ratios = useMemo(() => {
    const total = nodes.length || 1;
    const blue = nodes.filter((node) => node.owner === 'blue').length;
    const red = nodes.filter((node) => node.owner === 'red').length;
    const neutral = nodes.filter((node) => node.owner === 'neutral').length;
    return {
      blue: (blue / total) * 100,
      red: (red / total) * 100,
      neutral: (neutral / total) * 100
    };
  }, [nodes]);

  const reset = () => {
    clearTimers();
    stopMarchLoop();
    blueEmitUntilRef.current = 0;
    roundStartAtRef.current = performance.now();
    aiNextActionAtRef.current = 0;
    const next = level.nodes.map((node) => ({ ...node }));
    setNodes(next);
    nodesRef.current = next;
    setNodeShakeOffsets(
      level.nodes.reduce(
        (acc, node) => ({ ...acc, [node.id]: { x: 0, y: 0 } }),
        {} as Record<string, { x: number; y: number }>
      )
    );
    setDots([]);
    clearSelection();
    setResult('playing');
    setNow(performance.now());
  };

  const arrowColor = '#2d86ff';
  const handleBoardMove = (world: { x: number; y: number }) => {
    const prev = lastPointerPosRef.current;
    lastPointerPosRef.current = world;
    setAimPoint(world);
    const hovered = findHoverNode(world);
    setHoverNodeId(hovered);

    if (pointerDownRef.current && longPressActiveRef.current && prev) {
      const crossed = nodes
        .filter((node) => node.owner === 'blue')
        .filter((node) => pointToSegmentDistance({ x: node.x, y: node.y }, prev, world) <= NODE_RADIUS + 10)
        .map((node) => node.id);
      if (crossed.length > 0) {
        setSelectedSources((prevSelected) => {
          const next = new Set(prevSelected);
          crossed.forEach((id) => next.add(id));
          return Array.from(next);
        });
      }
    }
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
      <main className="mx-auto max-w-[960px] min-h-screen px-4 pt-5 pb-8 flex flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="h-12 w-12 rounded-xl bg-white border-[3px] border-[#121212] text-[#121212] grid place-items-center shadow-[0_4px_0_#121212]"
            aria-label="返回"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <div className="flex-1 rounded-full border-[4px] border-[#f0f0f0] bg-[#9e9ea3] overflow-hidden h-8 flex">
            <div className="bg-[#a7abb3]" style={{ width: `${ratios.neutral.toFixed(2)}%` }} />
            <div className="bg-[#ff6464]" style={{ width: `${ratios.red.toFixed(2)}%` }} />
            <div className="bg-[#2d86ff]" style={{ width: `${ratios.blue.toFixed(2)}%` }} />
          </div>
        </header>

        <section className="rounded-3xl border-[3px] border-[#131313] bg-white p-3 shadow-[0_8px_0_#131313]">
          <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">LEVEL PLAY</div>
          <div className="mt-1 text-3xl font-black text-[#111]">{level.name}</div>
          <div className="mt-1 text-sm text-[#4a4a4a]">渲染用州边界地图，交互与出兵机制对齐原版测试面板。</div>

          <svg
            viewBox={`0 0 ${level.width} ${level.height}`}
            className="mt-3 w-full rounded-xl border border-[#d2d2d2] bg-[#d9d9de]"
            style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
            onContextMenu={(e) => e.preventDefault()}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * level.width;
              const y = ((e.clientY - rect.top) / rect.height) * level.height;
              handleBoardMove({ x, y });
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((touch.clientX - rect.left) / rect.width) * level.width;
              const y = ((touch.clientY - rect.top) / rect.height) * level.height;
              handleBoardMove({ x, y });
              e.preventDefault();
            }}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchEnd={onPointerUp}
            onTouchCancel={onPointerUp}
            onMouseDown={(e) => {
              e.preventDefault();
              if (e.target === e.currentTarget) clearSelection();
            }}
            onTouchStart={(e) => {
              if (e.target === e.currentTarget) clearSelection();
            }}
          >
            <defs>
              <pattern id="neutral-hatch-campaign" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="#b8bdc7" strokeWidth="2" />
              </pattern>
            </defs>

            {nodes.map((node) => {
              const path = polygonToPath(nodeCells[node.id] ?? []);
              if (!path) return null;
              return (
                <g key={`cell-${node.id}`}>
                  <path
                    d={path}
                    fill={node.owner === 'neutral' ? 'url(#neutral-hatch-campaign)' : ownerColor[node.owner]}
                    fillOpacity={node.owner === 'neutral' ? 0.48 : 0.33}
                    stroke="#eff3f8"
                    strokeWidth="6"
                    strokeLinejoin="round"
                  />
                  <path d={path} fill="transparent" stroke="#8f97a5" strokeWidth="2.2" strokeLinejoin="round" />
                </g>
              );
            })}

            {(selectedSources.length > 0 ? selectedSources : hoverNodeId ? [hoverNodeId] : []).map((id) => {
              const node = nodeById.get(id);
              if (!node) return null;
              const offset = nodeShakeOffsets[id] ?? { x: 0, y: 0 };
              return (
                <circle
                  key={`capture-${id}`}
                  cx={node.x + offset.x}
                  cy={node.y + offset.y}
                  r={CAPTURE_RADIUS}
                  fill={ownerColor[node.owner]}
                  fillOpacity={FEEL_CAPTURE_FILL_OPACITY}
                  stroke={ownerColor[node.owner]}
                  strokeOpacity={FEEL_CAPTURE_STROKE_OPACITY}
                  strokeWidth={2}
                />
              );
            })}

            {selectedSources.length > 0 && aimPoint && selectedSources.map((sourceId) => {
              const source = nodeById.get(sourceId);
              if (!source) return null;
              const sourceOffset = nodeShakeOffsets[sourceId] ?? { x: 0, y: 0 };
              const sx0 = source.x + sourceOffset.x;
              const sy0 = source.y + sourceOffset.y;
              const dx = aimPoint.x - sx0;
              const dy = aimPoint.y - sy0;
              const dist = Math.hypot(dx, dy);
              if (dist <= 0.0001) return null;
              const ux = dx / dist;
              const uy = dy / dist;
              const sx = sx0 + ux * FEEL_ARROW_START_OFFSET;
              const sy = sy0 + uy * FEEL_ARROW_START_OFFSET;
              const postStartDist = Math.max(0, dist - FEEL_ARROW_START_OFFSET);
              const clamped = Math.min(postStartDist, FEEL_ARROW_MAX_DISTANCE);
              if (clamped < FEEL_ARROW_MIN_DISTANCE) return null;
              const ex = sx + ux * clamped;
              const ey = sy + uy * clamped;
              const hx = ex - ux * FEEL_ARROW_HEAD_LENGTH;
              const hy = ey - uy * FEEL_ARROW_HEAD_LENGTH;
              const nx = -uy;
              const ny = ux;
              return (
                <g key={`aim-${sourceId}`}>
                  <line
                    x1={sx}
                    y1={sy}
                    x2={ex}
                    y2={ey}
                    stroke={arrowColor}
                    strokeWidth={FEEL_ARROW_STROKE_WIDTH}
                    strokeLinecap="round"
                    opacity={1}
                  />
                  <polygon
                    points={`${ex},${ey} ${hx + nx * FEEL_ARROW_HEAD_WIDTH},${hy + ny * FEEL_ARROW_HEAD_WIDTH} ${hx - nx * FEEL_ARROW_HEAD_WIDTH},${hy - ny * FEEL_ARROW_HEAD_WIDTH}`}
                    fill={arrowColor}
                    opacity={1}
                  />
                </g>
              );
            })}

            {dots.map((dot) => {
              const pos = getDotRenderPosition(dot, now);
              if (!pos || pos.t >= 1) return null;
              return <circle key={dot.id} cx={pos.x} cy={pos.y} r={DOT_RADIUS} fill={dot.owner === 'blue' ? '#2d86ff' : '#ff6464'} opacity={0.96} />;
            })}

            {nodes.map((node) => {
              const selected = selectedSources.includes(node.id);
              const hovered = hoverNodeId === node.id;
              const offset = nodeShakeOffsets[node.id] ?? { x: 0, y: 0 };
              const nodeCx = node.x + offset.x;
              const nodeCy = node.y + offset.y;
              return (
                <g
                  key={`node-${node.id}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
                    onNodePointerDown(node.id, {
                      x: ((e.clientX - rect.left) / rect.width) * level.width,
                      y: ((e.clientY - rect.top) / rect.height) * level.height
                    });
                  }}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    if (!touch) return;
                    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
                    onNodePointerDown(node.id, {
                      x: ((touch.clientX - rect.left) / rect.width) * level.width,
                      y: ((touch.clientY - rect.top) / rect.height) * level.height
                    });
                    e.stopPropagation();
                  }}
                  onTouchEnd={onPointerUp}
                  onClick={() => onNodeClick(node.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    cx={nodeCx}
                    cy={nodeCy}
                    r={selected ? NODE_RADIUS + 2 : NODE_RADIUS}
                    fill={ownerColor[node.owner]}
                    stroke={selected ? '#ffe066' : hovered ? '#f4f4f4' : '#ffffff'}
                    strokeWidth={selected ? 4 : hovered ? 3 : 2}
                  />
                  <text
                    x={nodeCx}
                    y={nodeCy + 5}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="800"
                    fill={ownerText[node.owner]}
                    style={{ pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                  >
                    {Math.round(node.value)}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="mt-3 text-sm text-[#4d4d4d]">
            操作：单点出兵；长按拖拽可多选蓝方节点，松手到目标点一键发兵。任意节点都可直接出兵。
          </div>
        </section>

        {result !== 'playing' && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
            <div className="w-full max-w-[420px] rounded-3xl border-[3px] border-[#131313] bg-white p-5 shadow-[0_10px_0_#131313]">
              <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">{level.name}</div>
              <div className="mt-1 text-3xl font-black text-[#111]">{result === 'victory' ? '胜利' : '失败'}</div>
              <div className="mt-3 text-sm text-[#3f3f3f]">
                {result === 'victory' ? '你已完成该关卡。' : '我方据点已全部失守。'}
              </div>
              <button
                type="button"
                onClick={reset}
                className="mt-4 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-xl font-black bg-[#fff] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313]"
                style={{ fontFamily: '"Marker Felt", "Comic Sans MS", cursive' }}
              >
                再来一局
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
