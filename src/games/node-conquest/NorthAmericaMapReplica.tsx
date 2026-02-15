import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { geoMercator, geoPath } from 'd3-geo';
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
  FEEL_ABSORB_SHAKE_AMP,
  FEEL_ABSORB_SHAKE_MS,
  FEEL_CHEVRON_DEPTH,
  FEEL_CLICK_SHAKE_AMP,
  FEEL_CLICK_SHAKE_MS,
  FEEL_DISPATCH_SHAKE_AMP,
  FEEL_DISPATCH_SHAKE_MS,
  FEEL_DOT_COL_GAP,
  FEEL_DOT_COLUMN_DELAY_MS,
  FEEL_DOT_EMIT_SPREAD_MS,
  FEEL_DOT_FORWARD_OFFSET,
  FEEL_DOT_ROW_SPREAD,
  FEEL_DOT_TRAVEL_MS,
  FEEL_QUEUE_LANE_SPREAD,
  FEEL_QUEUE_STAGGER_RATIO,
  FEEL_SHAKE_FREQ_HZ
} from './feelShared';
import { chuInit, chuProvinceTroops, hanInit, qiInit, qinInit, weiInit, yanInit, zhaoInit } from './warringStatesData';

type Owner = 'neutral' | 'blue' | 'red';

type NorthAmericaMapReplicaProps = {
  onBack: () => void;
  playerNationId?: WarringStateId;
};

type GeoFeature = {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties?: {
    adcode?: string | number;
    name?: string;
    adm0_a3?: string;
    iso_3166_2?: string;
    name_en?: string;
    地名?: string;
    区划码?: string | number;
    id?: string | number;
    [key: string]: unknown;
  };
};

type GeoFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoFeature[];
};

type RegionDef = {
  key: string;
  label: string;
  iso3: string;
  adm1: string;
  path: string;
  cx: number;
  cy: number;
  area: number;
};

type RegionState = {
  owner: Owner;
  value: number;
};
type GeneralTier = 'S' | 'A' | 'B' | 'C';
type QinGeneral = {
  id: string;
  name: string;
  status: 'idle' | 'marching';
  locationKey: string | null;
  tier?: GeneralTier;
  command?: number;
  strategy?: number;
  logistics?: number;
  mobility?: number;
  recruitCost?: number;
  upkeepPerTurn?: number;
  troopCap?: number;
  assignedTroops?: number;
};

type QinGeneralProfile = {
  tier: GeneralTier;
  command: number;
  strategy: number;
  logistics: number;
  mobility: number;
  recruitCost: number;
  upkeepPerTurn: number;
};

type Dispatch = {
  id: string;
  groupId?: string;
  fromKey: string;
  toKey: string;
  factionId: WarringStateId;
  commanderName?: string;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  owner: Owner;
  row: number;
  col: number;
  rowsInColumn: number;
  laneBias: number;
  columnStagger: number;
  startAt: number;
  travelMs: number;
};

type LevelRegionConfig = {
  id: string; // `${iso3}-${adm1}`
  owner: Owner;
  value: number;
};
type SharedLevelRuntime = {
  byLevelId: Record<string, RegionState>;
  result: 'playing' | 'victory' | 'defeat';
};

const OWNER_STYLE: Record<Owner, { fill: string; stroke: string; label: string }> = {
  neutral: { fill: '#8e8e92', stroke: '#c2c2c5', label: '#ececef' },
  blue: { fill: '#b9def6', stroke: '#9fb9ca', label: '#1b5f8d' },
  red: { fill: '#f4c2c2', stroke: '#c89a9a', label: '#7f2626' }
};

const SEED_REGION_CONFIGS: LevelRegionConfig[] = [
  { id: 'CHN-110000', owner: 'blue', value: 52 }, // 北京
  { id: 'CHN-120000', owner: 'blue', value: 38 }, // 天津
  { id: 'CHN-310000', owner: 'blue', value: 46 }, // 上海
  { id: 'CHN-130000', owner: 'red', value: 48 }, // 河北
  { id: 'CHN-320000', owner: 'red', value: 44 }, // 江苏
  { id: 'CHN-370000', owner: 'red', value: 42 }, // 山东
  { id: 'CHN-410000', owner: 'red', value: 45 }, // 河南
  { id: 'CHN-140000', owner: 'neutral', value: 28 }, // 山西
  { id: 'CHN-610000', owner: 'neutral', value: 24 }, // 陕西
  { id: 'CHN-340000', owner: 'neutral', value: 30 }, // 安徽
  { id: 'CHN-420000', owner: 'neutral', value: 30 }, // 湖北
  { id: 'CHN-430000', owner: 'neutral', value: 26 }, // 湖南
  { id: 'CHN-360000', owner: 'neutral', value: 24 }, // 江西
  { id: 'CHN-330000', owner: 'neutral', value: 30 }, // 浙江
  { id: 'CHN-350000', owner: 'neutral', value: 24 }, // 福建
  { id: 'CHN-440000', owner: 'neutral', value: 28 } // 广东
];

const NEUTRAL_TROOPS_BY_ADM1: Partial<Record<string, number>> = {
  // 可按需继续补充中立州初始兵力
  '140000': 28, // 山西
  '340000': 30, // 安徽
  '350000': 24, // 福建
  '360000': 24, // 江西
  '420000': 30, // 湖北
  '430000': 26, // 湖南
  '440000': 28, // 广东
  '610000': 24 // 陕西
};
const DEFAULT_NEUTRAL_TROOPS = 20;
const DEFAULT_NEUTRAL_RECOVER_PER_SEC = 0.45;
const NEUTRAL_RECOVER_PER_SEC_BY_ADM1: Partial<Record<string, number>> = {
  // 可按需继续补充中立州回补速度（仅回补到固定兵力，不会无限增长）
  '140000': 0.45,
  '340000': 0.5,
  '350000': 0.35,
  '360000': 0.4,
  '420000': 0.55,
  '430000': 0.45,
  '440000': 0.5,
  '610000': 0.35
};

const LEVEL_1_CONFIG_BY_ID = SEED_REGION_CONFIGS.reduce<Record<string, LevelRegionConfig>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

const WARRING_STATES = [
  { id: 'qin', name: '秦', color: '#2E3440', anchorAdm1: '610000', dx: -10, dy: -10 },
  { id: 'qi', name: '齐', color: '#1D4ED8', anchorAdm1: '370000', dx: 8, dy: -8 },
  { id: 'chu', name: '楚', color: '#0F766E', anchorAdm1: '360000', dx: -8, dy: 10 },
  { id: 'yan', name: '燕', color: '#D97706', anchorAdm1: '110000', dx: 0, dy: -14 },
  { id: 'zhao', name: '赵', color: '#7C3AED', anchorAdm1: '130000', dx: -16, dy: 8 },
  { id: 'wei', name: '魏', color: '#DC2626', anchorAdm1: '140000', dx: 12, dy: -8 },
  { id: 'han', name: '韩', color: '#DB2777', anchorAdm1: '410000', dx: -12, dy: 14 }
] as const;
type WarringStateId = (typeof WARRING_STATES)[number]['id'];
type OwnerCamp = Owner;
const WARRING_ECONOMY_FACTOR_BY_FACTION: Record<WarringStateId, number> = {
  qin: 0.4094,
  chu: 0.2688,
  han: 2.05,
  wei: 2.0588,
  zhao: 0.5344,
  qi: 2.0192,
  yan: 0.43
};

const WARRING_TERRITORY_BY_ADM1: Partial<Record<string, WarringStateId>> = {
  // Qin
  '610000': 'qin',
  '620000': 'qin',
  '640000': 'qin',
  '510000': 'qin',
  '500000': 'qin',
  // Qi
  '370000': 'qi',
  // Chu
  '420000': 'chu',
  '430000': 'chu',
  '320000': 'chu',
  '340000': 'chu',
  '360000': 'chu',
  '330000': 'chu',
  '350000': 'chu',
  '440000': 'chu',
  '450000': 'chu',
  '460000': 'chu',
  // Yan
  '110000': 'yan',
  '120000': 'yan',
  '210000': 'yan',
  '220000': 'yan',
  '230000': 'yan',
  // Zhao
  '150000': 'zhao',
  '130000': 'zhao',
  // Wei
  '140000': 'wei',
  // Han
  '410000': 'han'
  // buffer/neutral: 630000,650000,540000,520000,530000,710000,810000,820000
};
const WARRING_TERRITORY_BASE_BY_ADM1: Partial<Record<string, WarringStateId>> = { ...WARRING_TERRITORY_BY_ADM1 };
const resetWarringTerritoryRuntime = () => {
  Object.keys(WARRING_TERRITORY_BY_ADM1).forEach((key) => {
    delete WARRING_TERRITORY_BY_ADM1[key];
  });
  Object.entries(WARRING_TERRITORY_BASE_BY_ADM1).forEach(([adm1, factionId]) => {
    if (!factionId) return;
    WARRING_TERRITORY_BY_ADM1[adm1] = factionId;
  });
};

const FACTION_OWNER_BY_ID: Record<WarringStateId, OwnerCamp> = {
  qin: 'blue',
  qi: 'red',
  chu: 'red',
  yan: 'red',
  zhao: 'red',
  wei: 'red',
  han: 'red'
};

const WARRING_INITIAL_POWER: Record<WarringStateId, { totalTroops: number; minorTroops: number; capitalAdm1: string }> = {
  qin: { totalTroops: qinInit.resources.troops, minorTroops: 70, capitalAdm1: '610000' },
  qi: { totalTroops: qiInit.resources.troops, minorTroops: 55, capitalAdm1: '370000' },
  chu: { totalTroops: chuInit.resources.troops, minorTroops: 55, capitalAdm1: '360000' },
  yan: { totalTroops: yanInit.resources.troops, minorTroops: 50, capitalAdm1: '110000' },
  zhao: { totalTroops: zhaoInit.resources.troops, minorTroops: 70, capitalAdm1: '130000' },
  wei: { totalTroops: weiInit.resources.troops, minorTroops: 60, capitalAdm1: '140000' },
  han: { totalTroops: hanInit.resources.troops, minorTroops: 60, capitalAdm1: '410000' }
};

const WARRING_INITIAL_PROVINCE_TROOPS: Partial<Record<WarringStateId, Record<string, number>>> = {
  chu: chuProvinceTroops
};

const FLIGHT_MS = FEEL_DOT_TRAVEL_MS;
const VIEWBOX_W = 1800;
const VIEWBOX_H = 1500;
const LONG_PRESS_MS = SHARED_LONG_PRESS_MS;
const CAPTURE_RADIUS_PX = SHARED_CAPTURE_RADIUS;
const ARROW_WIDTH_PX = SHARED_ARROW_STROKE_WIDTH;
const ARROW_HEAD_LEN_PX = SHARED_ARROW_HEAD_LENGTH;
const ARROW_HEAD_W_PX = SHARED_ARROW_HEAD_WIDTH;
const ARROW_START_OFFSET_PX = SHARED_ARROW_START_OFFSET;
const ARROW_HIT_PULSE_MS = 180;
const SHAKE_FREQ_HZ = FEEL_SHAKE_FREQ_HZ;
const MARCH_SOUND_INTERVAL_MS = 180;
const COLLISION_SOUND_COOLDOWN_MS = 80;

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.trim();
  const safeAlpha = clamp(alpha, 0, 1);
  const fullHex = normalized.length === 4
    ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
    : normalized;
  const matched = /^#([0-9a-fA-F]{6})$/.exec(fullHex);
  if (!matched) return `rgba(17,17,17,${safeAlpha})`;
  const raw = matched[1];
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
};

const factionPanelShellStyle = (color: string) => ({
  borderColor: color,
  boxShadow: `0 8px 0 ${hexToRgba(color, 0.92)}, 0 0 0 3px ${hexToRgba(color, 0.42)}`
});
const DOT_ROW_SPREAD = FEEL_DOT_ROW_SPREAD;
const DOT_COL_GAP = FEEL_DOT_COL_GAP;
const DOT_FORWARD_OFFSET = FEEL_DOT_FORWARD_OFFSET;
const QUEUE_LANE_SPREAD = FEEL_QUEUE_LANE_SPREAD;
const QUEUE_STAGGER_RATIO = FEEL_QUEUE_STAGGER_RATIO;
const CHEVRON_DEPTH = FEEL_CHEVRON_DEPTH;
const DOT_EMIT_SPREAD_MS = FEEL_DOT_EMIT_SPREAD_MS;
const DOT_COLUMN_DELAY_MS = FEEL_DOT_COLUMN_DELAY_MS;
const NUMBER_ANIM_SEC = 0.2;
const NODE_RADIUS_PX = 9;
const NODE_SELECTED_RADIUS_PX = 10.5;
const NODE_FONT_SIZE_PX = 7.5;
const PRESET_DEFAULT_ZOOM = 2.45;
const PRESET_MIN_ZOOM = 1.35;
const PRESET_MAX_ZOOM = 3.6;
const PRESET_WASD_SPEED = 1000;
const PRESET_MAP_INSET_X = 60;
const PRESET_MAP_INSET_Y = 60;
const PINCH_ZOOM_SENSITIVITY = 2.2;
const PINCH_ZOOM_STEP_MIN = 0.82;
const PINCH_ZOOM_STEP_MAX = 1.22;
const DISPATCH_QIN_GLYPH_SIZE_PX = 30;
const QIN_GENERAL_POOL = [
  '白起',
  '王翦',
  '王贲',
  '蒙骜',
  '蒙武',
  '蒙恬',
  '司马错',
  '樗里疾',
  '甘茂',
  '张唐',
  '内史腾',
  '麃公',
  '杜挚',
  '章邯',
  '李信',
  '嬴华'
];
const QIN_GENERAL_PROFILE_BY_NAME: Record<string, QinGeneralProfile> = {
  白起: { tier: 'S', command: 99, strategy: 96, logistics: 88, mobility: 86, recruitCost: 180, upkeepPerTurn: 36 },
  王翦: { tier: 'A', command: 94, strategy: 91, logistics: 89, mobility: 82, recruitCost: 180, upkeepPerTurn: 28 },
  蒙恬: { tier: 'A', command: 92, strategy: 87, logistics: 84, mobility: 90, recruitCost: 180, upkeepPerTurn: 28 },
  司马错: { tier: 'A', command: 90, strategy: 89, logistics: 85, mobility: 83, recruitCost: 180, upkeepPerTurn: 28 },
  王贲: { tier: 'B', command: 86, strategy: 80, logistics: 76, mobility: 84, recruitCost: 180, upkeepPerTurn: 22 },
  蒙武: { tier: 'B', command: 85, strategy: 76, logistics: 79, mobility: 75, recruitCost: 180, upkeepPerTurn: 22 },
  甘茂: { tier: 'B', command: 81, strategy: 84, logistics: 78, mobility: 74, recruitCost: 180, upkeepPerTurn: 22 },
  章邯: { tier: 'B', command: 84, strategy: 79, logistics: 74, mobility: 82, recruitCost: 180, upkeepPerTurn: 22 },
  李信: { tier: 'B', command: 83, strategy: 77, logistics: 72, mobility: 86, recruitCost: 180, upkeepPerTurn: 22 },
  蒙骜: { tier: 'C', command: 76, strategy: 70, logistics: 77, mobility: 68, recruitCost: 180, upkeepPerTurn: 16 },
  樗里疾: { tier: 'C', command: 74, strategy: 75, logistics: 73, mobility: 70, recruitCost: 180, upkeepPerTurn: 16 },
  张唐: { tier: 'C', command: 71, strategy: 68, logistics: 70, mobility: 69, recruitCost: 180, upkeepPerTurn: 16 },
  内史腾: { tier: 'C', command: 72, strategy: 71, logistics: 74, mobility: 67, recruitCost: 180, upkeepPerTurn: 16 },
  麃公: { tier: 'C', command: 73, strategy: 67, logistics: 66, mobility: 73, recruitCost: 180, upkeepPerTurn: 16 },
  杜挚: { tier: 'C', command: 68, strategy: 66, logistics: 69, mobility: 65, recruitCost: 180, upkeepPerTurn: 16 },
  嬴华: { tier: 'C', command: 70, strategy: 69, logistics: 68, mobility: 71, recruitCost: 180, upkeepPerTurn: 16 }
};
const QIN_GENERAL_TIER_DRAW_WEIGHT: Record<GeneralTier, number> = {
  S: 0.06,
  A: 0.2,
  B: 0.34,
  C: 0.4
};
const QIN_GENERAL_TROOP_CAP_BY_TIER: Record<GeneralTier, number> = {
  S: 320,
  A: 240,
  B: 180,
  C: 120
};
const QIN_GENERAL_HIRE_SUCCESS_RATE = 0.65;
const QIN_GENERAL_FAIL_REFUND_RATE = 0.5;
const CHU_GENERAL_POOL = [
  '项燕',
  '昭阳',
  '景阳',
  '屈丐',
  '唐昧',
  '斗贲',
  '屈匄',
  '子兰',
  '庄蹻',
  '景缺',
  '昭滑',
  '屈原',
  '项梁',
  '项羽',
  '龙且',
  '英布'
];
const CHU_GENERAL_PROFILE_BY_NAME: Record<string, QinGeneralProfile> = {
  项羽: { tier: 'S', command: 99, strategy: 88, logistics: 66, mobility: 94, recruitCost: 180, upkeepPerTurn: 36 },
  项燕: { tier: 'A', command: 93, strategy: 89, logistics: 82, mobility: 84, recruitCost: 180, upkeepPerTurn: 28 },
  项梁: { tier: 'A', command: 90, strategy: 83, logistics: 80, mobility: 85, recruitCost: 180, upkeepPerTurn: 28 },
  龙且: { tier: 'A', command: 91, strategy: 80, logistics: 77, mobility: 87, recruitCost: 180, upkeepPerTurn: 28 },
  英布: { tier: 'B', command: 86, strategy: 76, logistics: 74, mobility: 88, recruitCost: 180, upkeepPerTurn: 22 },
  昭阳: { tier: 'B', command: 84, strategy: 82, logistics: 78, mobility: 75, recruitCost: 180, upkeepPerTurn: 22 },
  景阳: { tier: 'B', command: 83, strategy: 80, logistics: 76, mobility: 74, recruitCost: 180, upkeepPerTurn: 22 },
  屈丐: { tier: 'B', command: 82, strategy: 78, logistics: 79, mobility: 73, recruitCost: 180, upkeepPerTurn: 22 },
  唐昧: { tier: 'B', command: 81, strategy: 77, logistics: 75, mobility: 76, recruitCost: 180, upkeepPerTurn: 22 },
  庄蹻: { tier: 'C', command: 76, strategy: 72, logistics: 74, mobility: 77, recruitCost: 180, upkeepPerTurn: 16 },
  屈匄: { tier: 'C', command: 75, strategy: 70, logistics: 73, mobility: 72, recruitCost: 180, upkeepPerTurn: 16 },
  子兰: { tier: 'C', command: 71, strategy: 69, logistics: 70, mobility: 68, recruitCost: 180, upkeepPerTurn: 16 },
  景缺: { tier: 'C', command: 73, strategy: 71, logistics: 72, mobility: 69, recruitCost: 180, upkeepPerTurn: 16 },
  昭滑: { tier: 'C', command: 70, strategy: 68, logistics: 71, mobility: 67, recruitCost: 180, upkeepPerTurn: 16 },
  屈原: { tier: 'C', command: 66, strategy: 78, logistics: 72, mobility: 64, recruitCost: 180, upkeepPerTurn: 16 },
  斗贲: { tier: 'C', command: 72, strategy: 67, logistics: 68, mobility: 71, recruitCost: 180, upkeepPerTurn: 16 }
};
const CHU_GENERAL_TIER_DRAW_WEIGHT: Record<GeneralTier, number> = {
  S: 0.06,
  A: 0.2,
  B: 0.34,
  C: 0.4
};
const CHU_GENERAL_TROOP_CAP_BY_TIER: Record<GeneralTier, number> = {
  S: 320,
  A: 240,
  B: 180,
  C: 120
};
const CHU_GENERAL_HIRE_SUCCESS_RATE = 0.65;
const CHU_GENERAL_FAIL_REFUND_RATE = 0.5;
const HAN_GENERAL_POOL = [
  '申不害',
  '韩非',
  '暴鸢',
  '韩遂',
  '公仲侈',
  '韩聂',
  '韩明',
  '段干',
  '孔宁',
  '冯亭',
  '韩严',
  '韩无忌'
];
const HAN_GENERAL_PROFILE_BY_NAME: Record<string, QinGeneralProfile> = {
  韩非: { tier: 'S', command: 68, strategy: 98, logistics: 90, mobility: 62, recruitCost: 180, upkeepPerTurn: 36 },
  申不害: { tier: 'A', command: 79, strategy: 92, logistics: 88, mobility: 70, recruitCost: 180, upkeepPerTurn: 28 },
  暴鸢: { tier: 'A', command: 90, strategy: 82, logistics: 74, mobility: 83, recruitCost: 180, upkeepPerTurn: 28 },
  韩遂: { tier: 'B', command: 84, strategy: 77, logistics: 76, mobility: 80, recruitCost: 180, upkeepPerTurn: 22 },
  公仲侈: { tier: 'B', command: 81, strategy: 80, logistics: 79, mobility: 73, recruitCost: 180, upkeepPerTurn: 22 },
  韩聂: { tier: 'B', command: 83, strategy: 75, logistics: 77, mobility: 78, recruitCost: 180, upkeepPerTurn: 22 },
  韩明: { tier: 'B', command: 80, strategy: 76, logistics: 78, mobility: 74, recruitCost: 180, upkeepPerTurn: 22 },
  冯亭: { tier: 'C', command: 76, strategy: 71, logistics: 73, mobility: 72, recruitCost: 180, upkeepPerTurn: 16 },
  段干: { tier: 'C', command: 73, strategy: 70, logistics: 75, mobility: 70, recruitCost: 180, upkeepPerTurn: 16 },
  孔宁: { tier: 'C', command: 72, strategy: 69, logistics: 72, mobility: 71, recruitCost: 180, upkeepPerTurn: 16 },
  韩严: { tier: 'C', command: 71, strategy: 68, logistics: 71, mobility: 69, recruitCost: 180, upkeepPerTurn: 16 },
  韩无忌: { tier: 'C', command: 74, strategy: 70, logistics: 73, mobility: 72, recruitCost: 180, upkeepPerTurn: 16 }
};
const HAN_GENERAL_TIER_DRAW_WEIGHT: Record<GeneralTier, number> = {
  S: 0.06,
  A: 0.2,
  B: 0.34,
  C: 0.4
};
const HAN_GENERAL_TROOP_CAP_BY_TIER: Record<GeneralTier, number> = {
  S: 320,
  A: 240,
  B: 180,
  C: 120
};
const HAN_GENERAL_HIRE_SUCCESS_RATE = 0.65;
const HAN_GENERAL_FAIL_REFUND_RATE = 0.5;
const WEI_GENERAL_POOL = [
  '吴起',
  '乐羊',
  '庞涓',
  '公叔痤',
  '魏无忌',
  '段干木',
  '西门豹',
  '李悝',
  '田需',
  '公孙衍',
  '魏章',
  '魏遫'
];
const WEI_GENERAL_PROFILE_BY_NAME: Record<string, QinGeneralProfile> = {
  吴起: { tier: 'S', command: 97, strategy: 96, logistics: 89, mobility: 90, recruitCost: 180, upkeepPerTurn: 36 },
  魏无忌: { tier: 'A', command: 90, strategy: 90, logistics: 86, mobility: 84, recruitCost: 180, upkeepPerTurn: 28 },
  庞涓: { tier: 'A', command: 91, strategy: 84, logistics: 78, mobility: 85, recruitCost: 180, upkeepPerTurn: 28 },
  乐羊: { tier: 'A', command: 89, strategy: 82, logistics: 80, mobility: 83, recruitCost: 180, upkeepPerTurn: 28 },
  公叔痤: { tier: 'B', command: 84, strategy: 79, logistics: 82, mobility: 74, recruitCost: 180, upkeepPerTurn: 22 },
  段干木: { tier: 'B', command: 81, strategy: 83, logistics: 80, mobility: 72, recruitCost: 180, upkeepPerTurn: 22 },
  西门豹: { tier: 'B', command: 80, strategy: 78, logistics: 86, mobility: 73, recruitCost: 180, upkeepPerTurn: 22 },
  李悝: { tier: 'B', command: 79, strategy: 85, logistics: 84, mobility: 70, recruitCost: 180, upkeepPerTurn: 22 },
  公孙衍: { tier: 'C', command: 77, strategy: 74, logistics: 73, mobility: 76, recruitCost: 180, upkeepPerTurn: 16 },
  田需: { tier: 'C', command: 74, strategy: 72, logistics: 71, mobility: 75, recruitCost: 180, upkeepPerTurn: 16 },
  魏章: { tier: 'C', command: 73, strategy: 70, logistics: 72, mobility: 73, recruitCost: 180, upkeepPerTurn: 16 },
  魏遫: { tier: 'C', command: 72, strategy: 69, logistics: 70, mobility: 72, recruitCost: 180, upkeepPerTurn: 16 }
};
const WEI_GENERAL_TIER_DRAW_WEIGHT: Record<GeneralTier, number> = {
  S: 0.06,
  A: 0.2,
  B: 0.34,
  C: 0.4
};
const WEI_GENERAL_TROOP_CAP_BY_TIER: Record<GeneralTier, number> = {
  S: 320,
  A: 240,
  B: 180,
  C: 120
};
const WEI_GENERAL_HIRE_SUCCESS_RATE = 0.65;
const WEI_GENERAL_FAIL_REFUND_RATE = 0.5;
const ZHAO_GENERAL_POOL = [
  '李牧',
  '廉颇',
  '赵奢',
  '乐乘',
  '赵葱',
  '司马尚',
  '庞煖',
  '扈辄',
  '公孙龙',
  '许历',
  '赵括',
  '武安君'
];
const ZHAO_GENERAL_PROFILE_BY_NAME: Record<string, QinGeneralProfile> = {
  李牧: { tier: 'S', command: 98, strategy: 95, logistics: 88, mobility: 90, recruitCost: 180, upkeepPerTurn: 36 },
  廉颇: { tier: 'A', command: 95, strategy: 84, logistics: 82, mobility: 80, recruitCost: 180, upkeepPerTurn: 28 },
  赵奢: { tier: 'A', command: 92, strategy: 86, logistics: 80, mobility: 82, recruitCost: 180, upkeepPerTurn: 28 },
  司马尚: { tier: 'A', command: 90, strategy: 82, logistics: 79, mobility: 84, recruitCost: 180, upkeepPerTurn: 28 },
  庞煖: { tier: 'B', command: 86, strategy: 80, logistics: 76, mobility: 81, recruitCost: 180, upkeepPerTurn: 22 },
  乐乘: { tier: 'B', command: 84, strategy: 76, logistics: 75, mobility: 79, recruitCost: 180, upkeepPerTurn: 22 },
  赵葱: { tier: 'B', command: 83, strategy: 75, logistics: 74, mobility: 78, recruitCost: 180, upkeepPerTurn: 22 },
  武安君: { tier: 'B', command: 85, strategy: 77, logistics: 73, mobility: 76, recruitCost: 180, upkeepPerTurn: 22 },
  扈辄: { tier: 'C', command: 76, strategy: 71, logistics: 72, mobility: 74, recruitCost: 180, upkeepPerTurn: 16 },
  公孙龙: { tier: 'C', command: 70, strategy: 79, logistics: 71, mobility: 68, recruitCost: 180, upkeepPerTurn: 16 },
  许历: { tier: 'C', command: 73, strategy: 70, logistics: 73, mobility: 71, recruitCost: 180, upkeepPerTurn: 16 },
  赵括: { tier: 'C', command: 75, strategy: 68, logistics: 69, mobility: 72, recruitCost: 180, upkeepPerTurn: 16 }
};
const ZHAO_GENERAL_TIER_DRAW_WEIGHT: Record<GeneralTier, number> = {
  S: 0.06,
  A: 0.2,
  B: 0.34,
  C: 0.4
};
const ZHAO_GENERAL_TROOP_CAP_BY_TIER: Record<GeneralTier, number> = {
  S: 320,
  A: 240,
  B: 180,
  C: 120
};
const ZHAO_GENERAL_HIRE_SUCCESS_RATE = 0.65;
const ZHAO_GENERAL_FAIL_REFUND_RATE = 0.5;
const QI_GENERAL_POOL = [
  '孙膑',
  '田忌',
  '匡章',
  '田单',
  '司马穰苴',
  '邹忌',
  '陈轸',
  '段干朋',
  '触子',
  '淳于髡',
  '田婴',
  '孟尝君'
];
const QI_GENERAL_PROFILE_BY_NAME: Record<string, QinGeneralProfile> = {
  孙膑: { tier: 'S', command: 92, strategy: 99, logistics: 87, mobility: 89, recruitCost: 180, upkeepPerTurn: 36 },
  田单: { tier: 'A', command: 90, strategy: 92, logistics: 84, mobility: 85, recruitCost: 180, upkeepPerTurn: 28 },
  司马穰苴: { tier: 'A', command: 94, strategy: 86, logistics: 82, mobility: 80, recruitCost: 180, upkeepPerTurn: 28 },
  田忌: { tier: 'A', command: 88, strategy: 84, logistics: 80, mobility: 86, recruitCost: 180, upkeepPerTurn: 28 },
  匡章: { tier: 'B', command: 85, strategy: 79, logistics: 78, mobility: 82, recruitCost: 180, upkeepPerTurn: 22 },
  邹忌: { tier: 'B', command: 77, strategy: 87, logistics: 79, mobility: 72, recruitCost: 180, upkeepPerTurn: 22 },
  陈轸: { tier: 'B', command: 80, strategy: 83, logistics: 77, mobility: 74, recruitCost: 180, upkeepPerTurn: 22 },
  孟尝君: { tier: 'B', command: 78, strategy: 82, logistics: 86, mobility: 73, recruitCost: 180, upkeepPerTurn: 22 },
  段干朋: { tier: 'C', command: 74, strategy: 71, logistics: 73, mobility: 70, recruitCost: 180, upkeepPerTurn: 16 },
  触子: { tier: 'C', command: 73, strategy: 70, logistics: 72, mobility: 71, recruitCost: 180, upkeepPerTurn: 16 },
  淳于髡: { tier: 'C', command: 71, strategy: 76, logistics: 70, mobility: 69, recruitCost: 180, upkeepPerTurn: 16 },
  田婴: { tier: 'C', command: 72, strategy: 72, logistics: 75, mobility: 68, recruitCost: 180, upkeepPerTurn: 16 }
};
const QI_GENERAL_TIER_DRAW_WEIGHT: Record<GeneralTier, number> = {
  S: 0.06,
  A: 0.2,
  B: 0.34,
  C: 0.4
};
const QI_GENERAL_TROOP_CAP_BY_TIER: Record<GeneralTier, number> = {
  S: 320,
  A: 240,
  B: 180,
  C: 120
};
const QI_GENERAL_HIRE_SUCCESS_RATE = 0.65;
const QI_GENERAL_FAIL_REFUND_RATE = 0.5;
const YAN_GENERAL_POOL = [
  '乐毅',
  '剧辛',
  '骑劫',
  '秦开',
  '鞠武',
  '太子丹',
  '荆轲',
  '高渐离',
  '荣蚠',
  '栗腹',
  '昌国君',
  '子之'
];
const YAN_GENERAL_PROFILE_BY_NAME: Record<string, QinGeneralProfile> = {
  乐毅: { tier: 'S', command: 96, strategy: 96, logistics: 86, mobility: 88, recruitCost: 180, upkeepPerTurn: 36 },
  秦开: { tier: 'A', command: 91, strategy: 84, logistics: 80, mobility: 85, recruitCost: 180, upkeepPerTurn: 28 },
  剧辛: { tier: 'A', command: 89, strategy: 83, logistics: 79, mobility: 82, recruitCost: 180, upkeepPerTurn: 28 },
  鞠武: { tier: 'B', command: 83, strategy: 81, logistics: 84, mobility: 73, recruitCost: 180, upkeepPerTurn: 22 },
  太子丹: { tier: 'B', command: 79, strategy: 82, logistics: 76, mobility: 72, recruitCost: 180, upkeepPerTurn: 22 },
  骑劫: { tier: 'B', command: 82, strategy: 75, logistics: 74, mobility: 80, recruitCost: 180, upkeepPerTurn: 22 },
  昌国君: { tier: 'B', command: 81, strategy: 77, logistics: 78, mobility: 74, recruitCost: 180, upkeepPerTurn: 22 },
  荆轲: { tier: 'C', command: 72, strategy: 74, logistics: 65, mobility: 86, recruitCost: 180, upkeepPerTurn: 16 },
  高渐离: { tier: 'C', command: 69, strategy: 71, logistics: 68, mobility: 79, recruitCost: 180, upkeepPerTurn: 16 },
  荣蚠: { tier: 'C', command: 74, strategy: 69, logistics: 70, mobility: 72, recruitCost: 180, upkeepPerTurn: 16 },
  栗腹: { tier: 'C', command: 73, strategy: 68, logistics: 69, mobility: 71, recruitCost: 180, upkeepPerTurn: 16 },
  子之: { tier: 'C', command: 70, strategy: 70, logistics: 71, mobility: 68, recruitCost: 180, upkeepPerTurn: 16 }
};
const YAN_GENERAL_TIER_DRAW_WEIGHT: Record<GeneralTier, number> = {
  S: 0.06,
  A: 0.2,
  B: 0.34,
  C: 0.4
};
const YAN_GENERAL_TROOP_CAP_BY_TIER: Record<GeneralTier, number> = {
  S: 320,
  A: 240,
  B: 180,
  C: 120
};
const YAN_GENERAL_HIRE_SUCCESS_RATE = 0.65;
const YAN_GENERAL_FAIL_REFUND_RATE = 0.5;
export type WarringGeneralDisplay = {
  name: string;
  tier: GeneralTier;
  command: number;
  strategy: number;
  logistics: number;
  mobility: number;
  recruitCost: number;
  upkeepPerTurn: number;
  troopCap: number;
};
export const WARRING_GENERALS_BY_FACTION: Record<WarringStateId, WarringGeneralDisplay[]> = {
  qin: QIN_GENERAL_POOL.map((name) => {
    const profile = QIN_GENERAL_PROFILE_BY_NAME[name];
    return {
      name,
      tier: profile.tier,
      command: profile.command,
      strategy: profile.strategy,
      logistics: profile.logistics,
      mobility: profile.mobility,
      recruitCost: profile.recruitCost,
      upkeepPerTurn: profile.upkeepPerTurn,
      troopCap: QIN_GENERAL_TROOP_CAP_BY_TIER[profile.tier]
    };
  }),
  chu: CHU_GENERAL_POOL.map((name) => {
    const profile = CHU_GENERAL_PROFILE_BY_NAME[name];
    return {
      name,
      tier: profile.tier,
      command: profile.command,
      strategy: profile.strategy,
      logistics: profile.logistics,
      mobility: profile.mobility,
      recruitCost: profile.recruitCost,
      upkeepPerTurn: profile.upkeepPerTurn,
      troopCap: CHU_GENERAL_TROOP_CAP_BY_TIER[profile.tier]
    };
  }),
  han: HAN_GENERAL_POOL.map((name) => {
    const profile = HAN_GENERAL_PROFILE_BY_NAME[name];
    return {
      name,
      tier: profile.tier,
      command: profile.command,
      strategy: profile.strategy,
      logistics: profile.logistics,
      mobility: profile.mobility,
      recruitCost: profile.recruitCost,
      upkeepPerTurn: profile.upkeepPerTurn,
      troopCap: HAN_GENERAL_TROOP_CAP_BY_TIER[profile.tier]
    };
  }),
  wei: WEI_GENERAL_POOL.map((name) => {
    const profile = WEI_GENERAL_PROFILE_BY_NAME[name];
    return {
      name,
      tier: profile.tier,
      command: profile.command,
      strategy: profile.strategy,
      logistics: profile.logistics,
      mobility: profile.mobility,
      recruitCost: profile.recruitCost,
      upkeepPerTurn: profile.upkeepPerTurn,
      troopCap: WEI_GENERAL_TROOP_CAP_BY_TIER[profile.tier]
    };
  }),
  zhao: ZHAO_GENERAL_POOL.map((name) => {
    const profile = ZHAO_GENERAL_PROFILE_BY_NAME[name];
    return {
      name,
      tier: profile.tier,
      command: profile.command,
      strategy: profile.strategy,
      logistics: profile.logistics,
      mobility: profile.mobility,
      recruitCost: profile.recruitCost,
      upkeepPerTurn: profile.upkeepPerTurn,
      troopCap: ZHAO_GENERAL_TROOP_CAP_BY_TIER[profile.tier]
    };
  }),
  qi: QI_GENERAL_POOL.map((name) => {
    const profile = QI_GENERAL_PROFILE_BY_NAME[name];
    return {
      name,
      tier: profile.tier,
      command: profile.command,
      strategy: profile.strategy,
      logistics: profile.logistics,
      mobility: profile.mobility,
      recruitCost: profile.recruitCost,
      upkeepPerTurn: profile.upkeepPerTurn,
      troopCap: QI_GENERAL_TROOP_CAP_BY_TIER[profile.tier]
    };
  }),
  yan: YAN_GENERAL_POOL.map((name) => {
    const profile = YAN_GENERAL_PROFILE_BY_NAME[name];
    return {
      name,
      tier: profile.tier,
      command: profile.command,
      strategy: profile.strategy,
      logistics: profile.logistics,
      mobility: profile.mobility,
      recruitCost: profile.recruitCost,
      upkeepPerTurn: profile.upkeepPerTurn,
      troopCap: YAN_GENERAL_TROOP_CAP_BY_TIER[profile.tier]
    };
  })
};
const ZOOM_HARD_MIN = 0.7;
const ZOOM_HARD_MAX = 4.2;
let sharedLevel1Runtime: SharedLevelRuntime | null = null;
const normalizeAdminCode = (rawCode: string): string => {
  if (/^\d{2}$/.test(rawCode)) return `${rawCode}0000`;
  return rawCode;
};
const getFeatureAdm1 = (feature: GeoFeature): string | null => {
  const rawCode = feature.properties?.区划码
    ?? feature.properties?.adcode
    ?? feature.properties?.id
    ?? null;
  if (rawCode == null) return null;
  const code = String(rawCode);
  if (!/^\d{6}$/.test(code) && !/^\d{2}$/.test(code)) return null;
  return normalizeAdminCode(code);
};
const ringPointKey = (x: number, y: number): string => `${Math.round(x * 10000)}:${Math.round(y * 10000)}`;
const edgeKey = (a: [number, number], b: [number, number]): string => {
  const aKey = ringPointKey(a[0], a[1]);
  const bKey = ringPointKey(b[0], b[1]);
  return aKey <= bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
};
const collectPolygonRings = (coords: unknown, out: number[][][]): void => {
  if (!Array.isArray(coords) || coords.length <= 0) return;
  const first = coords[0];
  if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'number') {
    out.push(coords as number[][]);
    return;
  }
  (coords as unknown[]).forEach((item) => collectPolygonRings(item, out));
};
const buildAdjacencyByAdm1 = (geo: GeoFeatureCollection): Record<string, Set<string>> => {
  const edgeOwners = new Map<string, Set<string>>();
  const allAdm1 = new Set<string>();
  geo.features.forEach((feature) => {
    const adm1 = getFeatureAdm1(feature);
    if (!adm1) return;
    allAdm1.add(adm1);
    const rings: number[][][] = [];
    collectPolygonRings(feature.geometry?.coordinates, rings);
    const localEdges = new Set<string>();
    rings.forEach((ring) => {
      if (!Array.isArray(ring) || ring.length < 2) return;
      for (let i = 1; i < ring.length; i += 1) {
        const prev = ring[i - 1];
        const curr = ring[i];
        if (!Array.isArray(prev) || !Array.isArray(curr) || prev.length < 2 || curr.length < 2) continue;
        if (typeof prev[0] !== 'number' || typeof prev[1] !== 'number' || typeof curr[0] !== 'number' || typeof curr[1] !== 'number') continue;
        localEdges.add(edgeKey([prev[0], prev[1]], [curr[0], curr[1]]));
      }
    });
    localEdges.forEach((edge) => {
      const owners = edgeOwners.get(edge) ?? new Set<string>();
      owners.add(adm1);
      edgeOwners.set(edge, owners);
    });
  });
  const adjacencyByAdm1 = Array.from(allAdm1).reduce((acc, adm1) => {
    acc[adm1] = new Set<string>();
    return acc;
  }, {} as Record<string, Set<string>>);
  edgeOwners.forEach((owners) => {
    const ownerList = Array.from(owners);
    if (ownerList.length < 2) return;
    for (let i = 0; i < ownerList.length; i += 1) {
      for (let j = i + 1; j < ownerList.length; j += 1) {
        const a = ownerList[i];
        const b = ownerList[j];
        adjacencyByAdm1[a]?.add(b);
        adjacencyByAdm1[b]?.add(a);
      }
    }
  });
  return adjacencyByAdm1;
};

const buildRegionDefs = (geo: GeoFeatureCollection, insetX: number, insetY: number): RegionDef[] => {
  const provinceFeatures = geo.features.filter((feature) => {
    const adm1 = getFeatureAdm1(feature);
    return Boolean(adm1);
  });
  const provinceGeo: GeoFeatureCollection = {
    type: 'FeatureCollection',
    features: provinceFeatures
  };
  const safeInsetX = clamp(insetX, 10, VIEWBOX_W * 0.42);
  const safeInsetY = clamp(insetY, 10, VIEWBOX_H * 0.42);
  const projection = geoMercator().fitExtent(
    [
      [safeInsetX, safeInsetY],
      [VIEWBOX_W - safeInsetX, VIEWBOX_H - safeInsetY]
    ],
    provinceGeo as unknown as { type: string }
  );
  const pathBuilder = geoPath(projection);

  return provinceFeatures
    .map((feature, idx) => {
      const label = feature.properties?.地名 ?? feature.properties?.name_en ?? feature.properties?.name ?? 'Unknown';
      const iso3 = feature.properties?.adm0_a3 ?? 'CHN';
      const adm1 = getFeatureAdm1(feature) ?? String(
        feature.properties?.iso_3166_2
        ?? label
      );
      const path = pathBuilder(feature as never) ?? '';
      const [cx, cy] = pathBuilder.centroid(feature as never);
      const area = pathBuilder.area(feature as never);
      return {
        key: `${iso3}-${adm1}-${label}-${idx}`,
        label,
        iso3,
        adm1,
        path,
        cx,
        cy,
        area
      };
    })
    .filter((r) => r.path.length > 0 && Number.isFinite(r.cx) && Number.isFinite(r.cy));
};

const initStateForRegion = (region: RegionDef): RegionState => {
  const factionId = WARRING_TERRITORY_BY_ADM1[region.adm1];
  if (factionId) {
    const provinceTroops = WARRING_INITIAL_PROVINCE_TROOPS[factionId]?.[region.adm1];
    if (typeof provinceTroops === 'number' && provinceTroops > 0) {
      return { owner: FACTION_OWNER_BY_ID[factionId], value: provinceTroops };
    }
    return { owner: FACTION_OWNER_BY_ID[factionId], value: WARRING_INITIAL_POWER[factionId].minorTroops };
  }
  const id = `${region.iso3}-${region.adm1}`;
  const neutralTroops = NEUTRAL_TROOPS_BY_ADM1[region.adm1];
  if (typeof neutralTroops === 'number') {
    return { owner: 'neutral', value: neutralTroops };
  }
  const cfg = LEVEL_1_CONFIG_BY_ID[id];
  if (!cfg) return { owner: 'neutral', value: DEFAULT_NEUTRAL_TROOPS };
  return { owner: cfg.owner, value: cfg.value };
};
const buildInitialStateByKey = (defs: RegionDef[]): Record<string, RegionState> =>
  {
    const byFactionRegions: Record<WarringStateId, RegionDef[]> = {
      qin: [],
      qi: [],
      chu: [],
      yan: [],
      zhao: [],
      wei: [],
      han: []
    };
    defs.forEach((region) => {
      const factionId = WARRING_TERRITORY_BY_ADM1[region.adm1];
      if (!factionId) return;
      byFactionRegions[factionId].push(region);
    });

    return defs.reduce((acc, region) => {
      const factionId = WARRING_TERRITORY_BY_ADM1[region.adm1];
      if (!factionId) {
        acc[region.key] = initStateForRegion(region);
        return acc;
      }
      const provinceTroops = WARRING_INITIAL_PROVINCE_TROOPS[factionId]?.[region.adm1];
      if (typeof provinceTroops === 'number' && provinceTroops > 0) {
        acc[region.key] = { owner: FACTION_OWNER_BY_ID[factionId], value: provinceTroops };
        return acc;
      }
      const factionCfg = WARRING_INITIAL_POWER[factionId];
      const regions = byFactionRegions[factionId];
      const nonCapitalCount = Math.max(0, regions.length - 1);
      const maxMinor = nonCapitalCount > 0 ? Math.floor((factionCfg.totalTroops - 60) / nonCapitalCount) : factionCfg.minorTroops;
      const minorTroops = nonCapitalCount > 0 ? Math.max(25, Math.min(factionCfg.minorTroops, maxMinor)) : 0;
      const capitalTroops = Math.max(60, factionCfg.totalTroops - minorTroops * nonCapitalCount);
      const isCapital = region.adm1 === factionCfg.capitalAdm1;
      acc[region.key] = {
        owner: FACTION_OWNER_BY_ID[factionId],
        value: isCapital ? capitalTroops : minorTroops
      };
      return acc;
    }, {} as Record<string, RegionState>);
  };
const buildStateByKeyFromShared = (defs: RegionDef[]): Record<string, RegionState> => {
  if (!sharedLevel1Runtime) return buildInitialStateByKey(defs);
  const next = buildInitialStateByKey(defs);
  defs.forEach((region) => {
    const levelId = `${region.iso3}-${region.adm1}`;
    const cached = sharedLevel1Runtime?.byLevelId[levelId];
    if (cached) next[region.key] = cached;
  });
  return next;
};
const syncSharedRuntime = (
  defs: RegionDef[],
  byKey: Record<string, RegionState>,
  result: 'playing' | 'victory' | 'defeat'
) => {
  const byLevelId: Record<string, RegionState> = {};
  defs.forEach((region) => {
    const levelId = `${region.iso3}-${region.adm1}`;
    byLevelId[levelId] = byKey[region.key] ?? initStateForRegion(region);
  });
  sharedLevel1Runtime = { byLevelId, result };
};

const getDispatchRenderPosition = (
  dot: Dispatch,
  from: { x: number; y: number },
  to: { x: number; y: number },
  now: number,
  cfg: { travelMs: number; absorbDistance: number; emitSpreadRange: number; queueRowGap: number; queueColGap: number }
) => {
  if (now < dot.startAt) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const rowShift = (dot.row - (dot.rowsInColumn - 1) / 2) * Math.max(0, cfg.queueRowGap);
  const colShift = dot.col * Math.max(0, cfg.queueColGap);
  const sx = from.x + ux * DOT_FORWARD_OFFSET;
  const sy = from.y + uy * DOT_FORWARD_OFFSET;
  const t = clamp((now - dot.startAt) / cfg.travelMs, 0, 1);
  const centerX = sx + (to.x - sx) * t;
  const centerY = sy + (to.y - sy) * t;
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
    t
  };
};

const computeGeneralCombatMultiplier = (general: QinGeneral | null): number => {
  if (!general) return 1;
  const command = general.command ?? 70;
  const strategy = general.strategy ?? 70;
  return 1 + (command - 70) * 0.006 + (strategy - 70) * 0.004;
};

const computeArmyCombatPower = (troops: number, general: QinGeneral | null): number => {
  if (troops <= 0) return 0;
  return Math.max(0, Math.floor(troops * computeGeneralCombatMultiplier(general)));
};

export function NorthAmericaMapReplica({ onBack, playerNationId }: NorthAmericaMapReplicaProps) {
  const playerFactionId: WarringStateId = playerNationId ?? 'qin';
  const [geoData, setGeoData] = useState<GeoFeatureCollection | null>(null);
  const [regions, setRegions] = useState<RegionDef[]>([]);
  const [regionStateByKey, setRegionStateByKey] = useState<Record<string, RegionState>>({});
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [displayValuesByKey, setDisplayValuesByKey] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => performance.now());
  const [result, setResult] = useState<'playing' | 'victory' | 'defeat'>('playing');
  const [aimPoint, setAimPoint] = useState<{ x: number; y: number } | null>(null);
  const [smoothedAimPoint, setSmoothedAimPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverTargetKey, setHoverTargetKey] = useState<string | null>(null);
  const [nodeShakeOffsets, setNodeShakeOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [hitPulseAtByKey, setHitPulseAtByKey] = useState<Record<string, number>>({});
  const [captureRadiusPx, setCaptureRadiusPx] = useState(SHARED_CAPTURE_RADIUS);
  const [arrowStartOffsetPx, setArrowStartOffsetPx] = useState(SHARED_ARROW_START_OFFSET);
  const [arrowStrokeWidthPx, setArrowStrokeWidthPx] = useState(SHARED_ARROW_STROKE_WIDTH);
  const [arrowHeadLengthPx, setArrowHeadLengthPx] = useState(SHARED_ARROW_HEAD_LENGTH);
  const [arrowHeadWidthPx, setArrowHeadWidthPx] = useState(SHARED_ARROW_HEAD_WIDTH);
  const [arrowSmoothFollow, setArrowSmoothFollow] = useState(SHARED_ARROW_SMOOTH_FOLLOW);
  const [hitPulseStrength, setHitPulseStrength] = useState(1);
  const [clickShakeAmp, setClickShakeAmp] = useState(FEEL_CLICK_SHAKE_AMP);
  const [clickShakeMs, setClickShakeMs] = useState(FEEL_CLICK_SHAKE_MS);
  const [dispatchShakeAmp, setDispatchShakeAmp] = useState(FEEL_DISPATCH_SHAKE_AMP);
  const [dispatchShakeMs, setDispatchShakeMs] = useState(FEEL_DISPATCH_SHAKE_MS);
  const [absorbShakeAmp, setAbsorbShakeAmp] = useState(FEEL_ABSORB_SHAKE_AMP);
  const [absorbShakeMs, setAbsorbShakeMs] = useState(FEEL_ABSORB_SHAKE_MS);
  const [zoom, setZoom] = useState(1);
  const [cameraCenterWorld, setCameraCenterWorld] = useState<{ x: number; y: number } | null>(null);
  const [cameraDefaultZoom, setCameraDefaultZoom] = useState(PRESET_DEFAULT_ZOOM);
  const [cameraMinZoom, setCameraMinZoom] = useState(PRESET_MIN_ZOOM);
  const [cameraMaxZoom, setCameraMaxZoom] = useState(PRESET_MAX_ZOOM);
  const [keyboardPanSpeed, setKeyboardPanSpeed] = useState(PRESET_WASD_SPEED);
  const [mapInsetX, setMapInsetX] = useState(PRESET_MAP_INSET_X);
  const [mapInsetY, setMapInsetY] = useState(PRESET_MAP_INSET_Y);
  const [qinEconomy, setQinEconomy] = useState(qinInit.resources.economyPerTurn);
  const [qinGrain, setQinGrain] = useState(qinInit.resources.grain);
  const [qinGenerals, setQinGenerals] = useState<QinGeneral[]>([]);
  const [qinHireResult, setQinHireResult] = useState<string>('');
  const [activeOpButton, setActiveOpButton] = useState<'recruit' | 'grain' | 'hire' | 'dispatch' | 'assign' | 'dispatchConfirm' | null>(null);
  const [qinOpMode, setQinOpMode] = useState<'ops' | 'dispatch' | 'assign'>('ops');
  const [qinDispatchPickStage, setQinDispatchPickStage] = useState<'to' | 'config'>('to');
  const [qinDispatchFromKey, setQinDispatchFromKey] = useState<string>('');
  const [qinDispatchToKey, setQinDispatchToKey] = useState<string>('');
  const [qinDispatchGeneralId, setQinDispatchGeneralId] = useState<string>('');
  const [qinAssignProvinceKey, setQinAssignProvinceKey] = useState<string>('');
  const [qinAssignGeneralId, setQinAssignGeneralId] = useState<string>('');
  const [qinAssignTroops, setQinAssignTroops] = useState<number>(0);
  const [chuEconomy, setChuEconomy] = useState(chuInit.resources.economyPerTurn);
  const [chuGrain, setChuGrain] = useState(chuInit.resources.grain);
  const [chuGenerals, setChuGenerals] = useState<QinGeneral[]>([]);
  const [chuHireResult, setChuHireResult] = useState<string>('');
  const [chuOpMode, setChuOpMode] = useState<'ops' | 'dispatch' | 'assign'>('ops');
  const [chuDispatchPickStage, setChuDispatchPickStage] = useState<'to' | 'config'>('to');
  const [chuDispatchFromKey, setChuDispatchFromKey] = useState<string>('');
  const [chuDispatchToKey, setChuDispatchToKey] = useState<string>('');
  const [chuDispatchGeneralId, setChuDispatchGeneralId] = useState<string>('');
  const [chuAssignProvinceKey, setChuAssignProvinceKey] = useState<string>('');
  const [chuAssignGeneralId, setChuAssignGeneralId] = useState<string>('');
  const [chuAssignTroops, setChuAssignTroops] = useState<number>(0);
  const [hanEconomy, setHanEconomy] = useState(hanInit.resources.economyPerTurn);
  const [hanGrain, setHanGrain] = useState(hanInit.resources.grain);
  const [hanGenerals, setHanGenerals] = useState<QinGeneral[]>([]);
  const [hanHireResult, setHanHireResult] = useState<string>('');
  const [hanOpMode, setHanOpMode] = useState<'ops' | 'dispatch' | 'assign'>('ops');
  const [hanDispatchPickStage, setHanDispatchPickStage] = useState<'to' | 'config'>('to');
  const [hanDispatchFromKey, setHanDispatchFromKey] = useState<string>('');
  const [hanDispatchToKey, setHanDispatchToKey] = useState<string>('');
  const [hanDispatchGeneralId, setHanDispatchGeneralId] = useState<string>('');
  const [hanAssignProvinceKey, setHanAssignProvinceKey] = useState<string>('');
  const [hanAssignGeneralId, setHanAssignGeneralId] = useState<string>('');
  const [hanAssignTroops, setHanAssignTroops] = useState<number>(0);
  const [weiEconomy, setWeiEconomy] = useState(weiInit.resources.economyPerTurn);
  const [weiGrain, setWeiGrain] = useState(weiInit.resources.grain);
  const [weiGenerals, setWeiGenerals] = useState<QinGeneral[]>([]);
  const [weiHireResult, setWeiHireResult] = useState<string>('');
  const [weiOpMode, setWeiOpMode] = useState<'ops' | 'dispatch' | 'assign'>('ops');
  const [weiDispatchPickStage, setWeiDispatchPickStage] = useState<'to' | 'config'>('to');
  const [weiDispatchFromKey, setWeiDispatchFromKey] = useState<string>('');
  const [weiDispatchToKey, setWeiDispatchToKey] = useState<string>('');
  const [weiDispatchGeneralId, setWeiDispatchGeneralId] = useState<string>('');
  const [weiAssignProvinceKey, setWeiAssignProvinceKey] = useState<string>('');
  const [weiAssignGeneralId, setWeiAssignGeneralId] = useState<string>('');
  const [weiAssignTroops, setWeiAssignTroops] = useState<number>(0);
  const [zhaoEconomy, setZhaoEconomy] = useState(zhaoInit.resources.economyPerTurn);
  const [zhaoGrain, setZhaoGrain] = useState(zhaoInit.resources.grain);
  const [zhaoGenerals, setZhaoGenerals] = useState<QinGeneral[]>([]);
  const [zhaoHireResult, setZhaoHireResult] = useState<string>('');
  const [zhaoOpMode, setZhaoOpMode] = useState<'ops' | 'dispatch' | 'assign'>('ops');
  const [zhaoDispatchPickStage, setZhaoDispatchPickStage] = useState<'to' | 'config'>('to');
  const [zhaoDispatchFromKey, setZhaoDispatchFromKey] = useState<string>('');
  const [zhaoDispatchToKey, setZhaoDispatchToKey] = useState<string>('');
  const [zhaoDispatchGeneralId, setZhaoDispatchGeneralId] = useState<string>('');
  const [zhaoAssignProvinceKey, setZhaoAssignProvinceKey] = useState<string>('');
  const [zhaoAssignGeneralId, setZhaoAssignGeneralId] = useState<string>('');
  const [zhaoAssignTroops, setZhaoAssignTroops] = useState<number>(0);
  const [qiEconomy, setQiEconomy] = useState(qiInit.resources.economyPerTurn);
  const [qiGrain, setQiGrain] = useState(qiInit.resources.grain);
  const [qiGenerals, setQiGenerals] = useState<QinGeneral[]>([]);
  const [qiHireResult, setQiHireResult] = useState<string>('');
  const [qiOpMode, setQiOpMode] = useState<'ops' | 'dispatch' | 'assign'>('ops');
  const [qiDispatchPickStage, setQiDispatchPickStage] = useState<'to' | 'config'>('to');
  const [qiDispatchFromKey, setQiDispatchFromKey] = useState<string>('');
  const [qiDispatchToKey, setQiDispatchToKey] = useState<string>('');
  const [qiDispatchGeneralId, setQiDispatchGeneralId] = useState<string>('');
  const [qiAssignProvinceKey, setQiAssignProvinceKey] = useState<string>('');
  const [qiAssignGeneralId, setQiAssignGeneralId] = useState<string>('');
  const [qiAssignTroops, setQiAssignTroops] = useState<number>(0);
  const [yanEconomy, setYanEconomy] = useState(yanInit.resources.economyPerTurn);
  const [yanGrain, setYanGrain] = useState(yanInit.resources.grain);
  const [yanGenerals, setYanGenerals] = useState<QinGeneral[]>([]);
  const [yanHireResult, setYanHireResult] = useState<string>('');
  const [yanOpMode, setYanOpMode] = useState<'ops' | 'dispatch' | 'assign'>('ops');
  const [yanDispatchPickStage, setYanDispatchPickStage] = useState<'to' | 'config'>('to');
  const [yanDispatchFromKey, setYanDispatchFromKey] = useState<string>('');
  const [yanDispatchToKey, setYanDispatchToKey] = useState<string>('');
  const [yanDispatchGeneralId, setYanDispatchGeneralId] = useState<string>('');
  const [yanAssignProvinceKey, setYanAssignProvinceKey] = useState<string>('');
  const [yanAssignGeneralId, setYanAssignGeneralId] = useState<string>('');
  const [yanAssignTroops, setYanAssignTroops] = useState<number>(0);
  const [selectedProvinceKey, setSelectedProvinceKey] = useState<string | null>(null);
  const [selectedNationId, setSelectedNationId] = useState<WarringStateId | null>(null);
  const [showAllGeneralTags, setShowAllGeneralTags] = useState(false);
  const [hoverProvinceKey, setHoverProvinceKey] = useState<string | null>(null);
  const [territoryVersion, setTerritoryVersion] = useState(0);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressActiveRef = useRef(false);
  const pointerDownRef = useRef(false);
  const suppressClickRef = useRef(false);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const aimFollowRafRef = useRef<number | null>(null);
  const numberAnimRafRef = useRef<number | null>(null);
  const lastHoverKeyRef = useRef<string | null>(null);
  const [hoverPulseAt, setHoverPulseAt] = useState(0);
  const shakeRafByKeyRef = useRef<Record<string, number | null>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const marchLoopTimerRef = useRef<number | null>(null);
  const lastCollisionSoundAtRef = useRef(0);
  const emittedDispatchIdsRef = useRef<Set<string>>(new Set());
  const canceledDispatchIdsRef = useRef<Set<string>>(new Set());
  const cameraInitializedRef = useRef(false);
  const panActiveRef = useRef(false);
  const panLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const pinchActiveRef = useRef(false);
  const pinchLastDistanceRef = useRef<number | null>(null);
  const keyMoveRef = useRef({ w: false, a: false, s: false, d: false });
  const keyPanRafRef = useRef<number | null>(null);
  const keyPanLastTsRef = useRef<number | null>(null);
  const zoomRef = useRef(zoom);
  const pinchRafRef = useRef<number | null>(null);
  const pinchPendingRef = useRef<{ zoom: number; anchor: { x: number; y: number } } | null>(null);
  const generalReturnTimersRef = useRef<number[]>([]);
  const opButtonTimerRef = useRef<number | null>(null);
  const aiLoopTimerRef = useRef<number | null>(null);
  const aiTickRef = useRef<() => void>(() => {});
  const cameraRuntimeRef = useRef<{ scale: number; worldCenter: { x: number; y: number } }>({
    scale: 1,
    worldCenter: { x: VIEWBOX_W * 0.5, y: VIEWBOX_H * 0.53 }
  });

  useEffect(() => {
    resetWarringTerritoryRuntime();
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch('/maps/china-provinces.geojson');
      if (!res.ok) return;
      const geo = (await res.json()) as GeoFeatureCollection;
      if (!active) return;
      setGeoData(geo);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!geoData) return;
    const defs = buildRegionDefs(geoData, mapInsetX, mapInsetY);
    setRegions(defs);
    const initialState = buildStateByKeyFromShared(defs);
    setRegionStateByKey(initialState);
    setDisplayValuesByKey(
      Object.keys(initialState).reduce((acc, key) => {
        acc[key] = initialState[key].value;
        return acc;
      }, {} as Record<string, number>)
    );
    setResult(sharedLevel1Runtime?.result ?? 'playing');
  }, [geoData, mapInsetX, mapInsetY]);

  useEffect(() => {
    if (regions.length <= 0) return;
    syncSharedRuntime(regions, regionStateByKey, result);
  }, [regions, regionStateByKey, result]);

  useEffect(() => {
    if (result !== 'playing') return;
    if (dispatches.length <= 0) return;
    const raf = window.requestAnimationFrame(function tick(ts) {
      setNow(ts);
      window.requestAnimationFrame(tick);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [dispatches.length]);

  useEffect(() => {
    if (dispatches.length <= 0 || result !== 'playing') {
      stopMarchLoop();
      return;
    }
    const ownMoving = dispatches.some((d) => {
      if (canceledDispatchIdsRef.current.has(d.id)) return false;
      if (!emittedDispatchIdsRef.current.has(d.id) && now < d.startAt) return false;
      const t = clamp((now - d.startAt) / d.travelMs, 0, 1);
      return now >= d.startAt && t < 1;
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
  }, [dispatches, now, result]);

  useEffect(() => {
    if (dispatches.length <= 0) {
      emittedDispatchIdsRef.current.clear();
      canceledDispatchIdsRef.current.clear();
      return;
    }
    const alive = new Set(dispatches.map((d) => d.id));
    Array.from(emittedDispatchIdsRef.current).forEach((id) => {
      if (!alive.has(id)) emittedDispatchIdsRef.current.delete(id);
    });
    Array.from(canceledDispatchIdsRef.current).forEach((id) => {
      if (!alive.has(id)) canceledDispatchIdsRef.current.delete(id);
    });
  }, [dispatches]);

  useEffect(() => {
    if (dispatches.length <= 0 || result !== 'playing') return;
    const ready = dispatches.filter((d) => now >= d.startAt && !emittedDispatchIdsRef.current.has(d.id));
    if (ready.length <= 0) return;
    emittedDispatchIdsRef.current = new Set([...emittedDispatchIdsRef.current, ...ready.map((d) => d.id)]);
    setRegionStateByKey((prev) => {
      const next: Record<string, RegionState> = { ...prev };
      ready.forEach((d) => {
        const from = next[d.fromKey];
        if (!from) return;
        next[d.fromKey] = { ...from, value: Math.max(0, from.value - 1) };
      });
      return next;
    });
  }, [dispatches, now, result]);

  useEffect(() => {
    if (dispatches.length <= 0) return;
    const due = dispatches.filter((d) => now - d.startAt >= d.travelMs);
    if (due.length <= 0) return;
    let territoryChanged = false;

    setRegionStateByKey((prev) => {
      const next: Record<string, RegionState> = { ...prev };
      due.forEach((d) => {
        if (canceledDispatchIdsRef.current.has(d.id)) return;
        const target = next[d.toKey];
        const toRegion = regionsByKeyRef.current[d.toKey];
        if (!target || !toRegion) return;
        const attackerFactionId = d.factionId;
        const defenderFactionId = WARRING_TERRITORY_BY_ADM1[toRegion.adm1];
        if (defenderFactionId === attackerFactionId) {
          next[d.toKey] = { ...target, value: target.value + 1 };
          triggerNodeShake(d.toKey, absorbShakeAmp, absorbShakeMs);
          return;
        }
        if (target.value > 1) {
          next[d.toKey] = { ...target, value: target.value - 1 };
          triggerNodeShake(d.toKey, absorbShakeAmp, absorbShakeMs);
          return;
        }
        WARRING_TERRITORY_BY_ADM1[toRegion.adm1] = attackerFactionId;
        territoryChanged = true;
        next[d.toKey] = {
          owner: FACTION_OWNER_BY_ID[attackerFactionId],
          value: 1
        };
        triggerNodeShake(d.toKey, absorbShakeAmp, absorbShakeMs);
      });
      return next;
    });
    if (territoryChanged) setTerritoryVersion((prev) => prev + 1);
    setHitPulseAtByKey((prev) => {
      const next = { ...prev };
      due.forEach((d) => {
        if (canceledDispatchIdsRef.current.has(d.id)) return;
        next[d.toKey] = performance.now();
      });
      return next;
    });
    const doneIds = new Set(due.map((d) => d.id));
    setDispatches((prev) => prev.filter((d) => !doneIds.has(d.id)));
  }, [dispatches, now, result, absorbShakeAmp, absorbShakeMs]);

  useEffect(() => {
    if (dispatches.length <= 1) return;
    const active = dispatches
      .map((d) => {
        if (!emittedDispatchIdsRef.current.has(d.id)) return null;
        if (canceledDispatchIdsRef.current.has(d.id)) return null;
        const from = d.fromPos;
        const to = d.toPos;
        const t = clamp((now - d.startAt) / d.travelMs, 0, 1);
        if (t >= 1 || now < d.startAt) return null;
        const pos = getDispatchRenderPosition(
          d,
          from,
          to,
          now,
          { travelMs: d.travelMs, absorbDistance: 80 / camera.scale, emitSpreadRange: 50 / camera.scale, queueRowGap: 10 / camera.scale, queueColGap: 10 / camera.scale }
        );
        if (!pos) return null;
        return {
          id: d.id,
          factionId: d.factionId,
          x: pos.x,
          y: pos.y
        };
      })
      .filter((d): d is { id: string; factionId: WarringStateId; x: number; y: number } => Boolean(d));
    if (active.length <= 1) return;
    const toRemove = new Set<string>();
    const collisionDistance = 3.8;
    for (let i = 0; i < active.length; i += 1) {
      const a = active[i];
      if (toRemove.has(a.id)) continue;
      for (let j = i + 1; j < active.length; j += 1) {
        const b = active[j];
        if (toRemove.has(b.id)) continue;
        if (a.factionId === b.factionId) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist <= collisionDistance) {
          toRemove.add(a.id);
          toRemove.add(b.id);
          break;
        }
      }
    }
    if (toRemove.size <= 0) return;
    canceledDispatchIdsRef.current = new Set([...canceledDispatchIdsRef.current, ...Array.from(toRemove)]);
    const nowTs = performance.now();
    if (nowTs - lastCollisionSoundAtRef.current >= COLLISION_SOUND_COOLDOWN_MS) {
      lastCollisionSoundAtRef.current = nowTs;
      playCollisionSound();
    }
    setDispatches((prev) => prev.filter((d) => !toRemove.has(d.id)));
  }, [dispatches, now]);

  const regionsByKey = useMemo(
    () =>
      regions.reduce((acc, r) => {
        acc[r.key] = r;
        return acc;
      }, {} as Record<string, RegionDef>),
    [regions]
  );
  const adjacencyByAdm1 = useMemo(
    () => (geoData ? buildAdjacencyByAdm1(geoData) : {}),
    [geoData]
  );
  const adjacencyByRegionKey = useMemo(() => {
    const keysByAdm1 = regions.reduce((acc, region) => {
      const bucket = acc[region.adm1] ?? [];
      bucket.push(region.key);
      acc[region.adm1] = bucket;
      return acc;
    }, {} as Record<string, string[]>);
    return regions.reduce((acc, region) => {
      const neighborKeys = new Set<string>();
      const neighborAdm1Set = adjacencyByAdm1[region.adm1] ?? new Set<string>();
      neighborAdm1Set.forEach((neighborAdm1) => {
        const linkedKeys = keysByAdm1[neighborAdm1] ?? [];
        linkedKeys.forEach((key) => {
          if (key !== region.key) neighborKeys.add(key);
        });
      });
      acc[region.key] = neighborKeys;
      return acc;
    }, {} as Record<string, Set<string>>);
  }, [regions, adjacencyByAdm1]);
  const isAdjacentAttack = (fromKey: string, toKey: string) => Boolean(adjacencyByRegionKey[fromKey]?.has(toKey));
  const regionsByKeyRef = (globalThis as unknown as { __na_regionsByKeyRef?: { current: Record<string, RegionDef> } }).__na_regionsByKeyRef
    ?? ((globalThis as unknown as { __na_regionsByKeyRef?: { current: Record<string, RegionDef> } }).__na_regionsByKeyRef = { current: {} });
  regionsByKeyRef.current = regionsByKey;

  const levelRegionKeys = useMemo(() => regions.map((r) => r.key), [regions]);
  const levelRegionKeySet = useMemo(() => new Set(levelRegionKeys), [levelRegionKeys]);
  const levelRegions = useMemo(
    () => regions.filter((r) => levelRegionKeySet.has(r.key)),
    [regions, levelRegionKeySet]
  );
  useEffect(() => {
    if (result !== 'playing') return;
    if (levelRegions.length <= 0) return;
    let playerOwned = 0;
    levelRegions.forEach((region) => {
      if (WARRING_TERRITORY_BY_ADM1[region.adm1] === playerFactionId) playerOwned += 1;
    });
    if (playerOwned <= 0) {
      setResult('defeat');
      return;
    }
    if (playerOwned >= levelRegions.length) {
      setResult('victory');
    }
  }, [result, levelRegions, territoryVersion, playerFactionId]);
  const qinEconomyPerSec = useMemo(() => {
    const qinRegions = levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'qin');
    return qinRegions.reduce((sum, region) => sum + Math.max(1.2, Math.sqrt(Math.max(1, region.area)) / 12), 0) * WARRING_ECONOMY_FACTOR_BY_FACTION.qin;
  }, [levelRegions, territoryVersion]);
  const chuEconomyPerSec = useMemo(() => {
    const chuRegions = levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'chu');
    return chuRegions.reduce((sum, region) => sum + Math.max(1.2, Math.sqrt(Math.max(1, region.area)) / 12), 0) * WARRING_ECONOMY_FACTOR_BY_FACTION.chu;
  }, [levelRegions, territoryVersion]);
  const hanEconomyPerSec = useMemo(() => {
    const hanRegions = levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'han');
    return hanRegions.reduce((sum, region) => sum + Math.max(1.2, Math.sqrt(Math.max(1, region.area)) / 12), 0) * WARRING_ECONOMY_FACTOR_BY_FACTION.han;
  }, [levelRegions, territoryVersion]);
  const weiEconomyPerSec = useMemo(() => {
    const weiRegions = levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'wei');
    return weiRegions.reduce((sum, region) => sum + Math.max(1.2, Math.sqrt(Math.max(1, region.area)) / 12), 0) * WARRING_ECONOMY_FACTOR_BY_FACTION.wei;
  }, [levelRegions, territoryVersion]);
  const zhaoEconomyPerSec = useMemo(() => {
    const zhaoRegions = levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'zhao');
    return zhaoRegions.reduce((sum, region) => sum + Math.max(1.2, Math.sqrt(Math.max(1, region.area)) / 12), 0) * WARRING_ECONOMY_FACTOR_BY_FACTION.zhao;
  }, [levelRegions, territoryVersion]);
  const qiEconomyPerSec = useMemo(() => {
    const qiRegions = levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'qi');
    return qiRegions.reduce((sum, region) => sum + Math.max(1.2, Math.sqrt(Math.max(1, region.area)) / 12), 0) * WARRING_ECONOMY_FACTOR_BY_FACTION.qi;
  }, [levelRegions, territoryVersion]);
  const yanEconomyPerSec = useMemo(() => {
    const yanRegions = levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'yan');
    return yanRegions.reduce((sum, region) => sum + Math.max(1.2, Math.sqrt(Math.max(1, region.area)) / 12), 0) * WARRING_ECONOMY_FACTOR_BY_FACTION.yan;
  }, [levelRegions, territoryVersion]);
  const qinIdleGeneralCount = useMemo(
    () => qinGenerals.filter((general) => general.status === 'idle').length,
    [qinGenerals]
  );
  const qinMarchingGeneralCount = useMemo(
    () => qinGenerals.filter((general) => general.status === 'marching').length,
    [qinGenerals]
  );
  const chuIdleGeneralCount = useMemo(
    () => chuGenerals.filter((general) => general.status === 'idle').length,
    [chuGenerals]
  );
  const chuMarchingGeneralCount = useMemo(
    () => chuGenerals.filter((general) => general.status === 'marching').length,
    [chuGenerals]
  );
  const hanIdleGeneralCount = useMemo(
    () => hanGenerals.filter((general) => general.status === 'idle').length,
    [hanGenerals]
  );
  const hanMarchingGeneralCount = useMemo(
    () => hanGenerals.filter((general) => general.status === 'marching').length,
    [hanGenerals]
  );
  const weiIdleGeneralCount = useMemo(
    () => weiGenerals.filter((general) => general.status === 'idle').length,
    [weiGenerals]
  );
  const weiMarchingGeneralCount = useMemo(
    () => weiGenerals.filter((general) => general.status === 'marching').length,
    [weiGenerals]
  );
  const zhaoIdleGeneralCount = useMemo(
    () => zhaoGenerals.filter((general) => general.status === 'idle').length,
    [zhaoGenerals]
  );
  const zhaoMarchingGeneralCount = useMemo(
    () => zhaoGenerals.filter((general) => general.status === 'marching').length,
    [zhaoGenerals]
  );
  const qiIdleGeneralCount = useMemo(
    () => qiGenerals.filter((general) => general.status === 'idle').length,
    [qiGenerals]
  );
  const qiMarchingGeneralCount = useMemo(
    () => qiGenerals.filter((general) => general.status === 'marching').length,
    [qiGenerals]
  );
  const yanIdleGeneralCount = useMemo(
    () => yanGenerals.filter((general) => general.status === 'idle').length,
    [yanGenerals]
  );
  const yanMarchingGeneralCount = useMemo(
    () => yanGenerals.filter((general) => general.status === 'marching').length,
    [yanGenerals]
  );
  useEffect(() => {
    if (result !== 'playing') return;
    const t = window.setInterval(() => {
      setQinEconomy((prev) => prev + qinEconomyPerSec * 0.2);
      setChuEconomy((prev) => prev + chuEconomyPerSec * 0.2);
      setHanEconomy((prev) => prev + hanEconomyPerSec * 0.2);
      setWeiEconomy((prev) => prev + weiEconomyPerSec * 0.2);
      setZhaoEconomy((prev) => prev + zhaoEconomyPerSec * 0.2);
      setQiEconomy((prev) => prev + qiEconomyPerSec * 0.2);
      setYanEconomy((prev) => prev + yanEconomyPerSec * 0.2);
    }, 200);
    return () => window.clearInterval(t);
  }, [result, qinEconomyPerSec, chuEconomyPerSec, hanEconomyPerSec, weiEconomyPerSec, zhaoEconomyPerSec, qiEconomyPerSec, yanEconomyPerSec]);
  useEffect(() => {
    if (result !== 'playing') return;
    if (levelRegions.length <= 0) return;
    const neutralRecoverConfigByKey = levelRegions.reduce((acc, region) => {
      const factionId = WARRING_TERRITORY_BY_ADM1[region.adm1];
      if (factionId) return acc;
      acc[region.key] = {
        target: NEUTRAL_TROOPS_BY_ADM1[region.adm1] ?? DEFAULT_NEUTRAL_TROOPS,
        recoverPerSec: NEUTRAL_RECOVER_PER_SEC_BY_ADM1[region.adm1] ?? DEFAULT_NEUTRAL_RECOVER_PER_SEC
      };
      return acc;
    }, {} as Record<string, { target: number; recoverPerSec: number }>);
    const activeNeutralKeys = Object.keys(neutralRecoverConfigByKey).filter((key) => {
      const cfg = neutralRecoverConfigByKey[key];
      return (cfg?.target ?? 0) > 0 && (cfg?.recoverPerSec ?? 0) > 0;
    });
    if (activeNeutralKeys.length <= 0) return;
    const t = window.setInterval(() => {
      setRegionStateByKey((prev) => {
        let changed = false;
        const next = { ...prev };
        activeNeutralKeys.forEach((key) => {
          const region = next[key];
          if (!region || region.owner !== 'neutral') return;
          const cfg = neutralRecoverConfigByKey[key];
          if (!cfg) return;
          if (region.value >= cfg.target) return;
          const delta = cfg.recoverPerSec * 0.2;
          if (delta <= 0) return;
          next[key] = { ...region, value: Math.min(cfg.target, region.value + delta) };
          changed = true;
        });
        return changed ? next : prev;
      });
    }, 200);
    return () => window.clearInterval(t);
  }, [result, levelRegions]);
  const cameraBase = useMemo(() => {
    if (levelRegions.length <= 0) {
      return { baseScale: 1, centerX: VIEWBOX_W * 0.5, centerY: VIEWBOX_H * 0.53 };
    }
    const xs = levelRegions.map((r) => r.cx);
    const ys = levelRegions.map((r) => r.cy);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const clusterW = Math.max(120, maxX - minX);
    const clusterH = Math.max(120, maxY - minY);
    const fitScale = Math.min((VIEWBOX_W - 64) / clusterW, (VIEWBOX_H - 64) / clusterH);
    void fitScale;
    const baseScale = 1;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return { baseScale, centerX, centerY };
  }, [levelRegions, territoryVersion]);
  useEffect(() => {
    if (levelRegions.length <= 0) return;
    setCameraCenterWorld({ x: cameraBase.centerX, y: cameraBase.centerY });
    setZoom((z) => clamp(z, cameraMinZoom, cameraMaxZoom));
    cameraInitializedRef.current = true;
  }, [levelRegions, cameraBase.centerX, cameraBase.centerY, mapInsetX, mapInsetY, cameraMinZoom, cameraMaxZoom]);
  useEffect(() => {
    if (cameraMinZoom > cameraMaxZoom) {
      setCameraMaxZoom(cameraMinZoom);
      return;
    }
    setZoom((z) => clamp(z, cameraMinZoom, cameraMaxZoom));
    setCameraDefaultZoom((z) => clamp(z, cameraMinZoom, cameraMaxZoom));
  }, [cameraMinZoom, cameraMaxZoom]);
  const camera = useMemo(() => {
    const scale = cameraBase.baseScale * zoom;
    const worldCenter = cameraCenterWorld ?? { x: cameraBase.centerX, y: cameraBase.centerY };
    const tx = VIEWBOX_W * 0.5 - worldCenter.x * scale;
    const ty = VIEWBOX_H * 0.53 - worldCenter.y * scale;
    return { scale, tx, ty, worldCenter };
  }, [cameraBase, cameraCenterWorld, zoom]);
  zoomRef.current = zoom;
  cameraRuntimeRef.current = { scale: camera.scale, worldCenter: camera.worldCenter };
  const ownerRatio = useMemo(() => {
    if (levelRegionKeys.length <= 0) return { blue: 0, red: 0, neutral: 100 };
    const counts = { blue: 0, red: 0, neutral: 0 };
    levelRegionKeys.forEach((key) => {
      const state = regionStateByKey[key];
      if (!state) return;
      counts[state.owner] += 1;
    });
    return {
      blue: (counts.blue / levelRegionKeys.length) * 100,
      red: (counts.red / levelRegionKeys.length) * 100,
      neutral: (counts.neutral / levelRegionKeys.length) * 100
    };
  }, [levelRegionKeys, regionStateByKey]);
  const levelCenters = useMemo(
    () =>
      levelRegions.reduce((acc, region) => {
        acc[region.key] = { x: region.cx, y: region.cy };
        return acc;
      }, {} as Record<string, { x: number; y: number }>),
    [levelRegions]
  );
  const provinceCenterByAdm1 = useMemo(
    () =>
      levelRegions.reduce((acc, region) => {
        acc[region.adm1] = { x: region.cx, y: region.cy };
        return acc;
      }, {} as Record<string, { x: number; y: number }>),
    [levelRegions]
  );
  const regionKeyByAdm1 = useMemo(
    () =>
      levelRegions.reduce((acc, region) => {
        acc[region.adm1] = region.key;
        return acc;
      }, {} as Record<string, string>),
    [levelRegions]
  );
  const qinProvinceOptions = useMemo(
    () => levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'qin'),
    [levelRegions, territoryVersion]
  );
  const chuProvinceOptions = useMemo(
    () => levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'chu'),
    [levelRegions, territoryVersion]
  );
  const hanProvinceOptions = useMemo(
    () => levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'han'),
    [levelRegions, territoryVersion]
  );
  const weiProvinceOptions = useMemo(
    () => levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'wei'),
    [levelRegions, territoryVersion]
  );
  const zhaoProvinceOptions = useMemo(
    () => levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'zhao'),
    [levelRegions, territoryVersion]
  );
  const qiProvinceOptions = useMemo(
    () => levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'qi'),
    [levelRegions, territoryVersion]
  );
  const yanProvinceOptions = useMemo(
    () => levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === 'yan'),
    [levelRegions, territoryVersion]
  );
  const qinAssignedTroopsByProvince = useMemo(
    () => qinGenerals.reduce<Record<string, number>>((acc, general) => {
      if (general.status !== 'idle' || !general.locationKey) return acc;
      const assigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
      if (assigned <= 0) return acc;
      acc[general.locationKey] = (acc[general.locationKey] ?? 0) + assigned;
      return acc;
    }, {}),
    [qinGenerals]
  );
  const qinIdleGeneralsInAssignProvince = useMemo(
    () => qinGenerals.filter((general) => general.status === 'idle' && general.locationKey === qinAssignProvinceKey),
    [qinGenerals, qinAssignProvinceKey]
  );
  const qinSelectedAssignGeneral = useMemo(
    () => qinGenerals.find((general) => general.id === qinAssignGeneralId) ?? null,
    [qinGenerals, qinAssignGeneralId]
  );
  const qinAssignProvinceTroops = qinAssignProvinceKey ? Math.floor(regionStateByKey[qinAssignProvinceKey]?.value ?? 0) : 0;
  const qinAssignCurrentAssigned = Math.max(0, Math.floor(qinSelectedAssignGeneral?.assignedTroops ?? 0));
  const qinAssignOtherAssigned = Math.max(
    0,
    Math.floor((qinAssignedTroopsByProvince[qinAssignProvinceKey] ?? 0) - qinAssignCurrentAssigned)
  );
  const qinAssignGeneralCap = Math.max(
    0,
    Math.floor(qinSelectedAssignGeneral?.troopCap ?? (qinSelectedAssignGeneral?.tier ? QIN_GENERAL_TROOP_CAP_BY_TIER[qinSelectedAssignGeneral.tier] : 0))
  );
  const qinAssignMaxTroops = Math.max(
    0,
    Math.min(qinAssignGeneralCap, qinAssignProvinceTroops - qinAssignOtherAssigned + qinAssignCurrentAssigned)
  );
  const qinAssignCombatPower = useMemo(
    () => computeArmyCombatPower(qinAssignTroops, qinSelectedAssignGeneral),
    [qinAssignTroops, qinSelectedAssignGeneral]
  );
  const qinAssignProvinceCombatPower = useMemo(
    () => qinGenerals
      .filter((general) => general.status === 'idle' && general.locationKey === qinAssignProvinceKey)
      .reduce((sum, general) => sum + computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general), 0),
    [qinGenerals, qinAssignProvinceKey]
  );
  const qinDispatchFromState = qinDispatchFromKey ? regionStateByKey[qinDispatchFromKey] : null;
  const qinDispatchAvailableGenerals = useMemo(
    () => qinGenerals.filter(
      (general) => general.status === 'idle' && general.locationKey === qinDispatchFromKey && Math.floor(general.assignedTroops ?? 0) > 0
    ),
    [qinGenerals, qinDispatchFromKey]
  );
  const qinDispatchGeneral = useMemo(
    () => qinGenerals.find((general) => general.id === qinDispatchGeneralId) ?? null,
    [qinGenerals, qinDispatchGeneralId]
  );
  const qinDispatchAssignedTroops = Math.max(0, Math.floor(qinDispatchGeneral?.assignedTroops ?? 0));
  const qinDispatchCanConfirm = useMemo(() => {
    const fromTroops = Math.floor(qinDispatchFromState?.value ?? 0);
    return qinDispatchAssignedTroops > 0
      && fromTroops >= qinDispatchAssignedTroops
      && Math.floor(qinGrain) >= qinDispatchAssignedTroops;
  }, [qinDispatchFromState, qinGrain, qinDispatchAssignedTroops]);
  const chuAssignedTroopsByProvince = useMemo(
    () => chuGenerals.reduce<Record<string, number>>((acc, general) => {
      if (general.status !== 'idle' || !general.locationKey) return acc;
      const assigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
      if (assigned <= 0) return acc;
      acc[general.locationKey] = (acc[general.locationKey] ?? 0) + assigned;
      return acc;
    }, {}),
    [chuGenerals]
  );
  const chuIdleGeneralsInAssignProvince = useMemo(
    () => chuGenerals.filter((general) => general.status === 'idle' && general.locationKey === chuAssignProvinceKey),
    [chuGenerals, chuAssignProvinceKey]
  );
  const chuSelectedAssignGeneral = useMemo(
    () => chuGenerals.find((general) => general.id === chuAssignGeneralId) ?? null,
    [chuGenerals, chuAssignGeneralId]
  );
  const chuAssignProvinceTroops = chuAssignProvinceKey ? Math.floor(regionStateByKey[chuAssignProvinceKey]?.value ?? 0) : 0;
  const chuAssignCurrentAssigned = Math.max(0, Math.floor(chuSelectedAssignGeneral?.assignedTroops ?? 0));
  const chuAssignOtherAssigned = Math.max(0, Math.floor((chuAssignedTroopsByProvince[chuAssignProvinceKey] ?? 0) - chuAssignCurrentAssigned));
  const chuAssignGeneralCap = Math.max(
    0,
    Math.floor(chuSelectedAssignGeneral?.troopCap ?? (chuSelectedAssignGeneral?.tier ? CHU_GENERAL_TROOP_CAP_BY_TIER[chuSelectedAssignGeneral.tier] : 0))
  );
  const chuAssignMaxTroops = Math.max(
    0,
    Math.min(chuAssignGeneralCap, chuAssignProvinceTroops - chuAssignOtherAssigned + chuAssignCurrentAssigned)
  );
  const chuAssignCombatPower = useMemo(
    () => computeArmyCombatPower(chuAssignTroops, chuSelectedAssignGeneral),
    [chuAssignTroops, chuSelectedAssignGeneral]
  );
  const chuAssignProvinceCombatPower = useMemo(
    () => chuGenerals
      .filter((general) => general.status === 'idle' && general.locationKey === chuAssignProvinceKey)
      .reduce((sum, general) => sum + computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general), 0),
    [chuGenerals, chuAssignProvinceKey]
  );
  const chuDispatchFromState = chuDispatchFromKey ? regionStateByKey[chuDispatchFromKey] : null;
  const chuDispatchAvailableGenerals = useMemo(
    () => chuGenerals.filter(
      (general) => general.status === 'idle' && general.locationKey === chuDispatchFromKey && Math.floor(general.assignedTroops ?? 0) > 0
    ),
    [chuGenerals, chuDispatchFromKey]
  );
  const chuDispatchGeneral = useMemo(
    () => chuGenerals.find((general) => general.id === chuDispatchGeneralId) ?? null,
    [chuGenerals, chuDispatchGeneralId]
  );
  const chuDispatchAssignedTroops = Math.max(0, Math.floor(chuDispatchGeneral?.assignedTroops ?? 0));
  const chuDispatchCanConfirm = useMemo(() => {
    const fromTroops = Math.floor(chuDispatchFromState?.value ?? 0);
    return chuDispatchAssignedTroops > 0
      && fromTroops >= chuDispatchAssignedTroops
      && Math.floor(chuGrain) >= chuDispatchAssignedTroops;
  }, [chuDispatchFromState, chuGrain, chuDispatchAssignedTroops]);
  const hanAssignedTroopsByProvince = useMemo(
    () => hanGenerals.reduce<Record<string, number>>((acc, general) => {
      if (general.status !== 'idle' || !general.locationKey) return acc;
      const assigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
      if (assigned <= 0) return acc;
      acc[general.locationKey] = (acc[general.locationKey] ?? 0) + assigned;
      return acc;
    }, {}),
    [hanGenerals]
  );
  const hanIdleGeneralsInAssignProvince = useMemo(
    () => hanGenerals.filter((general) => general.status === 'idle' && general.locationKey === hanAssignProvinceKey),
    [hanGenerals, hanAssignProvinceKey]
  );
  const hanSelectedAssignGeneral = useMemo(
    () => hanGenerals.find((general) => general.id === hanAssignGeneralId) ?? null,
    [hanGenerals, hanAssignGeneralId]
  );
  const hanAssignProvinceTroops = hanAssignProvinceKey ? Math.floor(regionStateByKey[hanAssignProvinceKey]?.value ?? 0) : 0;
  const hanAssignCurrentAssigned = Math.max(0, Math.floor(hanSelectedAssignGeneral?.assignedTroops ?? 0));
  const hanAssignOtherAssigned = Math.max(0, Math.floor((hanAssignedTroopsByProvince[hanAssignProvinceKey] ?? 0) - hanAssignCurrentAssigned));
  const hanAssignGeneralCap = Math.max(
    0,
    Math.floor(hanSelectedAssignGeneral?.troopCap ?? (hanSelectedAssignGeneral?.tier ? HAN_GENERAL_TROOP_CAP_BY_TIER[hanSelectedAssignGeneral.tier] : 0))
  );
  const hanAssignMaxTroops = Math.max(
    0,
    Math.min(hanAssignGeneralCap, hanAssignProvinceTroops - hanAssignOtherAssigned + hanAssignCurrentAssigned)
  );
  const hanAssignCombatPower = useMemo(
    () => computeArmyCombatPower(hanAssignTroops, hanSelectedAssignGeneral),
    [hanAssignTroops, hanSelectedAssignGeneral]
  );
  const hanAssignProvinceCombatPower = useMemo(
    () => hanGenerals
      .filter((general) => general.status === 'idle' && general.locationKey === hanAssignProvinceKey)
      .reduce((sum, general) => sum + computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general), 0),
    [hanGenerals, hanAssignProvinceKey]
  );
  const hanDispatchFromState = hanDispatchFromKey ? regionStateByKey[hanDispatchFromKey] : null;
  const hanDispatchAvailableGenerals = useMemo(
    () => hanGenerals.filter(
      (general) => general.status === 'idle' && general.locationKey === hanDispatchFromKey && Math.floor(general.assignedTroops ?? 0) > 0
    ),
    [hanGenerals, hanDispatchFromKey]
  );
  const hanDispatchGeneral = useMemo(
    () => hanGenerals.find((general) => general.id === hanDispatchGeneralId) ?? null,
    [hanGenerals, hanDispatchGeneralId]
  );
  const hanDispatchAssignedTroops = Math.max(0, Math.floor(hanDispatchGeneral?.assignedTroops ?? 0));
  const hanDispatchCanConfirm = useMemo(() => {
    const fromTroops = Math.floor(hanDispatchFromState?.value ?? 0);
    return hanDispatchAssignedTroops > 0
      && fromTroops >= hanDispatchAssignedTroops
      && Math.floor(hanGrain) >= hanDispatchAssignedTroops;
  }, [hanDispatchFromState, hanGrain, hanDispatchAssignedTroops]);
  const weiAssignedTroopsByProvince = useMemo(
    () => weiGenerals.reduce<Record<string, number>>((acc, general) => {
      if (general.status !== 'idle' || !general.locationKey) return acc;
      const assigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
      if (assigned <= 0) return acc;
      acc[general.locationKey] = (acc[general.locationKey] ?? 0) + assigned;
      return acc;
    }, {}),
    [weiGenerals]
  );
  const weiIdleGeneralsInAssignProvince = useMemo(
    () => weiGenerals.filter((general) => general.status === 'idle' && general.locationKey === weiAssignProvinceKey),
    [weiGenerals, weiAssignProvinceKey]
  );
  const weiSelectedAssignGeneral = useMemo(
    () => weiGenerals.find((general) => general.id === weiAssignGeneralId) ?? null,
    [weiGenerals, weiAssignGeneralId]
  );
  const weiAssignProvinceTroops = weiAssignProvinceKey ? Math.floor(regionStateByKey[weiAssignProvinceKey]?.value ?? 0) : 0;
  const weiAssignCurrentAssigned = Math.max(0, Math.floor(weiSelectedAssignGeneral?.assignedTroops ?? 0));
  const weiAssignOtherAssigned = Math.max(0, Math.floor((weiAssignedTroopsByProvince[weiAssignProvinceKey] ?? 0) - weiAssignCurrentAssigned));
  const weiAssignGeneralCap = Math.max(
    0,
    Math.floor(weiSelectedAssignGeneral?.troopCap ?? (weiSelectedAssignGeneral?.tier ? WEI_GENERAL_TROOP_CAP_BY_TIER[weiSelectedAssignGeneral.tier] : 0))
  );
  const weiAssignMaxTroops = Math.max(
    0,
    Math.min(weiAssignGeneralCap, weiAssignProvinceTroops - weiAssignOtherAssigned + weiAssignCurrentAssigned)
  );
  const weiAssignCombatPower = useMemo(
    () => computeArmyCombatPower(weiAssignTroops, weiSelectedAssignGeneral),
    [weiAssignTroops, weiSelectedAssignGeneral]
  );
  const weiAssignProvinceCombatPower = useMemo(
    () => weiGenerals
      .filter((general) => general.status === 'idle' && general.locationKey === weiAssignProvinceKey)
      .reduce((sum, general) => sum + computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general), 0),
    [weiGenerals, weiAssignProvinceKey]
  );
  const weiDispatchFromState = weiDispatchFromKey ? regionStateByKey[weiDispatchFromKey] : null;
  const weiDispatchAvailableGenerals = useMemo(
    () => weiGenerals.filter(
      (general) => general.status === 'idle' && general.locationKey === weiDispatchFromKey && Math.floor(general.assignedTroops ?? 0) > 0
    ),
    [weiGenerals, weiDispatchFromKey]
  );
  const weiDispatchGeneral = useMemo(
    () => weiGenerals.find((general) => general.id === weiDispatchGeneralId) ?? null,
    [weiGenerals, weiDispatchGeneralId]
  );
  const weiDispatchAssignedTroops = Math.max(0, Math.floor(weiDispatchGeneral?.assignedTroops ?? 0));
  const weiDispatchCanConfirm = useMemo(() => {
    const fromTroops = Math.floor(weiDispatchFromState?.value ?? 0);
    return weiDispatchAssignedTroops > 0
      && fromTroops >= weiDispatchAssignedTroops
      && Math.floor(weiGrain) >= weiDispatchAssignedTroops;
  }, [weiDispatchFromState, weiGrain, weiDispatchAssignedTroops]);
  const zhaoAssignedTroopsByProvince = useMemo(
    () => zhaoGenerals.reduce<Record<string, number>>((acc, general) => {
      if (general.status !== 'idle' || !general.locationKey) return acc;
      const assigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
      if (assigned <= 0) return acc;
      acc[general.locationKey] = (acc[general.locationKey] ?? 0) + assigned;
      return acc;
    }, {}),
    [zhaoGenerals]
  );
  const zhaoIdleGeneralsInAssignProvince = useMemo(
    () => zhaoGenerals.filter((general) => general.status === 'idle' && general.locationKey === zhaoAssignProvinceKey),
    [zhaoGenerals, zhaoAssignProvinceKey]
  );
  const zhaoSelectedAssignGeneral = useMemo(
    () => zhaoGenerals.find((general) => general.id === zhaoAssignGeneralId) ?? null,
    [zhaoGenerals, zhaoAssignGeneralId]
  );
  const zhaoAssignProvinceTroops = zhaoAssignProvinceKey ? Math.floor(regionStateByKey[zhaoAssignProvinceKey]?.value ?? 0) : 0;
  const zhaoAssignCurrentAssigned = Math.max(0, Math.floor(zhaoSelectedAssignGeneral?.assignedTroops ?? 0));
  const zhaoAssignOtherAssigned = Math.max(0, Math.floor((zhaoAssignedTroopsByProvince[zhaoAssignProvinceKey] ?? 0) - zhaoAssignCurrentAssigned));
  const zhaoAssignGeneralCap = Math.max(
    0,
    Math.floor(zhaoSelectedAssignGeneral?.troopCap ?? (zhaoSelectedAssignGeneral?.tier ? ZHAO_GENERAL_TROOP_CAP_BY_TIER[zhaoSelectedAssignGeneral.tier] : 0))
  );
  const zhaoAssignMaxTroops = Math.max(
    0,
    Math.min(zhaoAssignGeneralCap, zhaoAssignProvinceTroops - zhaoAssignOtherAssigned + zhaoAssignCurrentAssigned)
  );
  const zhaoAssignCombatPower = useMemo(
    () => computeArmyCombatPower(zhaoAssignTroops, zhaoSelectedAssignGeneral),
    [zhaoAssignTroops, zhaoSelectedAssignGeneral]
  );
  const zhaoAssignProvinceCombatPower = useMemo(
    () => zhaoGenerals
      .filter((general) => general.status === 'idle' && general.locationKey === zhaoAssignProvinceKey)
      .reduce((sum, general) => sum + computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general), 0),
    [zhaoGenerals, zhaoAssignProvinceKey]
  );
  const zhaoDispatchFromState = zhaoDispatchFromKey ? regionStateByKey[zhaoDispatchFromKey] : null;
  const zhaoDispatchAvailableGenerals = useMemo(
    () => zhaoGenerals.filter(
      (general) => general.status === 'idle' && general.locationKey === zhaoDispatchFromKey && Math.floor(general.assignedTroops ?? 0) > 0
    ),
    [zhaoGenerals, zhaoDispatchFromKey]
  );
  const zhaoDispatchGeneral = useMemo(
    () => zhaoGenerals.find((general) => general.id === zhaoDispatchGeneralId) ?? null,
    [zhaoGenerals, zhaoDispatchGeneralId]
  );
  const zhaoDispatchAssignedTroops = Math.max(0, Math.floor(zhaoDispatchGeneral?.assignedTroops ?? 0));
  const zhaoDispatchCanConfirm = useMemo(() => {
    const fromTroops = Math.floor(zhaoDispatchFromState?.value ?? 0);
    return zhaoDispatchAssignedTroops > 0
      && fromTroops >= zhaoDispatchAssignedTroops
      && Math.floor(zhaoGrain) >= zhaoDispatchAssignedTroops;
  }, [zhaoDispatchFromState, zhaoGrain, zhaoDispatchAssignedTroops]);
  const qiAssignedTroopsByProvince = useMemo(
    () => qiGenerals.reduce<Record<string, number>>((acc, general) => {
      if (general.status !== 'idle' || !general.locationKey) return acc;
      const assigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
      if (assigned <= 0) return acc;
      acc[general.locationKey] = (acc[general.locationKey] ?? 0) + assigned;
      return acc;
    }, {}),
    [qiGenerals]
  );
  const qiIdleGeneralsInAssignProvince = useMemo(
    () => qiGenerals.filter((general) => general.status === 'idle' && general.locationKey === qiAssignProvinceKey),
    [qiGenerals, qiAssignProvinceKey]
  );
  const qiSelectedAssignGeneral = useMemo(
    () => qiGenerals.find((general) => general.id === qiAssignGeneralId) ?? null,
    [qiGenerals, qiAssignGeneralId]
  );
  const qiAssignProvinceTroops = qiAssignProvinceKey ? Math.floor(regionStateByKey[qiAssignProvinceKey]?.value ?? 0) : 0;
  const qiAssignCurrentAssigned = Math.max(0, Math.floor(qiSelectedAssignGeneral?.assignedTroops ?? 0));
  const qiAssignOtherAssigned = Math.max(0, Math.floor((qiAssignedTroopsByProvince[qiAssignProvinceKey] ?? 0) - qiAssignCurrentAssigned));
  const qiAssignGeneralCap = Math.max(
    0,
    Math.floor(qiSelectedAssignGeneral?.troopCap ?? (qiSelectedAssignGeneral?.tier ? QI_GENERAL_TROOP_CAP_BY_TIER[qiSelectedAssignGeneral.tier] : 0))
  );
  const qiAssignMaxTroops = Math.max(
    0,
    Math.min(qiAssignGeneralCap, qiAssignProvinceTroops - qiAssignOtherAssigned + qiAssignCurrentAssigned)
  );
  const qiAssignCombatPower = useMemo(
    () => computeArmyCombatPower(qiAssignTroops, qiSelectedAssignGeneral),
    [qiAssignTroops, qiSelectedAssignGeneral]
  );
  const qiAssignProvinceCombatPower = useMemo(
    () => qiGenerals
      .filter((general) => general.status === 'idle' && general.locationKey === qiAssignProvinceKey)
      .reduce((sum, general) => sum + computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general), 0),
    [qiGenerals, qiAssignProvinceKey]
  );
  const qiDispatchFromState = qiDispatchFromKey ? regionStateByKey[qiDispatchFromKey] : null;
  const qiDispatchAvailableGenerals = useMemo(
    () => qiGenerals.filter(
      (general) => general.status === 'idle' && general.locationKey === qiDispatchFromKey && Math.floor(general.assignedTroops ?? 0) > 0
    ),
    [qiGenerals, qiDispatchFromKey]
  );
  const qiDispatchGeneral = useMemo(
    () => qiGenerals.find((general) => general.id === qiDispatchGeneralId) ?? null,
    [qiGenerals, qiDispatchGeneralId]
  );
  const qiDispatchAssignedTroops = Math.max(0, Math.floor(qiDispatchGeneral?.assignedTroops ?? 0));
  const qiDispatchCanConfirm = useMemo(() => {
    const fromTroops = Math.floor(qiDispatchFromState?.value ?? 0);
    return qiDispatchAssignedTroops > 0
      && fromTroops >= qiDispatchAssignedTroops
      && Math.floor(qiGrain) >= qiDispatchAssignedTroops;
  }, [qiDispatchFromState, qiGrain, qiDispatchAssignedTroops]);
  const yanAssignedTroopsByProvince = useMemo(
    () => yanGenerals.reduce<Record<string, number>>((acc, general) => {
      if (general.status !== 'idle' || !general.locationKey) return acc;
      const assigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
      if (assigned <= 0) return acc;
      acc[general.locationKey] = (acc[general.locationKey] ?? 0) + assigned;
      return acc;
    }, {}),
    [yanGenerals]
  );
  const yanIdleGeneralsInAssignProvince = useMemo(
    () => yanGenerals.filter((general) => general.status === 'idle' && general.locationKey === yanAssignProvinceKey),
    [yanGenerals, yanAssignProvinceKey]
  );
  const yanSelectedAssignGeneral = useMemo(
    () => yanGenerals.find((general) => general.id === yanAssignGeneralId) ?? null,
    [yanGenerals, yanAssignGeneralId]
  );
  const yanAssignProvinceTroops = yanAssignProvinceKey ? Math.floor(regionStateByKey[yanAssignProvinceKey]?.value ?? 0) : 0;
  const yanAssignCurrentAssigned = Math.max(0, Math.floor(yanSelectedAssignGeneral?.assignedTroops ?? 0));
  const yanAssignOtherAssigned = Math.max(0, Math.floor((yanAssignedTroopsByProvince[yanAssignProvinceKey] ?? 0) - yanAssignCurrentAssigned));
  const yanAssignGeneralCap = Math.max(
    0,
    Math.floor(yanSelectedAssignGeneral?.troopCap ?? (yanSelectedAssignGeneral?.tier ? YAN_GENERAL_TROOP_CAP_BY_TIER[yanSelectedAssignGeneral.tier] : 0))
  );
  const yanAssignMaxTroops = Math.max(
    0,
    Math.min(yanAssignGeneralCap, yanAssignProvinceTroops - yanAssignOtherAssigned + yanAssignCurrentAssigned)
  );
  const yanAssignCombatPower = useMemo(
    () => computeArmyCombatPower(yanAssignTroops, yanSelectedAssignGeneral),
    [yanAssignTroops, yanSelectedAssignGeneral]
  );
  const yanAssignProvinceCombatPower = useMemo(
    () => yanGenerals
      .filter((general) => general.status === 'idle' && general.locationKey === yanAssignProvinceKey)
      .reduce((sum, general) => sum + computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general), 0),
    [yanGenerals, yanAssignProvinceKey]
  );
  const yanDispatchFromState = yanDispatchFromKey ? regionStateByKey[yanDispatchFromKey] : null;
  const yanDispatchAvailableGenerals = useMemo(
    () => yanGenerals.filter(
      (general) => general.status === 'idle' && general.locationKey === yanDispatchFromKey && Math.floor(general.assignedTroops ?? 0) > 0
    ),
    [yanGenerals, yanDispatchFromKey]
  );
  const yanDispatchGeneral = useMemo(
    () => yanGenerals.find((general) => general.id === yanDispatchGeneralId) ?? null,
    [yanGenerals, yanDispatchGeneralId]
  );
  const yanDispatchAssignedTroops = Math.max(0, Math.floor(yanDispatchGeneral?.assignedTroops ?? 0));
  const yanDispatchCanConfirm = useMemo(() => {
    const fromTroops = Math.floor(yanDispatchFromState?.value ?? 0);
    return yanDispatchAssignedTroops > 0
      && fromTroops >= yanDispatchAssignedTroops
      && Math.floor(yanGrain) >= yanDispatchAssignedTroops;
  }, [yanDispatchFromState, yanGrain, yanDispatchAssignedTroops]);
  const qinDispatchCombatPower = useMemo(
    () => computeArmyCombatPower(qinDispatchAssignedTroops, qinDispatchGeneral),
    [qinDispatchAssignedTroops, qinDispatchGeneral]
  );
  const chuDispatchCombatPower = useMemo(
    () => computeArmyCombatPower(chuDispatchAssignedTroops, chuDispatchGeneral),
    [chuDispatchAssignedTroops, chuDispatchGeneral]
  );
  const hanDispatchCombatPower = useMemo(
    () => computeArmyCombatPower(hanDispatchAssignedTroops, hanDispatchGeneral),
    [hanDispatchAssignedTroops, hanDispatchGeneral]
  );
  const weiDispatchCombatPower = useMemo(
    () => computeArmyCombatPower(weiDispatchAssignedTroops, weiDispatchGeneral),
    [weiDispatchAssignedTroops, weiDispatchGeneral]
  );
  const zhaoDispatchCombatPower = useMemo(
    () => computeArmyCombatPower(zhaoDispatchAssignedTroops, zhaoDispatchGeneral),
    [zhaoDispatchAssignedTroops, zhaoDispatchGeneral]
  );
  const qiDispatchCombatPower = useMemo(
    () => computeArmyCombatPower(qiDispatchAssignedTroops, qiDispatchGeneral),
    [qiDispatchAssignedTroops, qiDispatchGeneral]
  );
  const yanDispatchCombatPower = useMemo(
    () => computeArmyCombatPower(yanDispatchAssignedTroops, yanDispatchGeneral),
    [yanDispatchAssignedTroops, yanDispatchGeneral]
  );
  const activeDispatchGroups = useMemo(() => {
    const grouped = new Map<string, {
      groupId: string;
      factionId: WarringStateId;
      commanderName: string;
      fromKey: string;
      toKey: string;
      fromPos: { x: number; y: number };
      toPos: { x: number; y: number };
      startAt: number;
      endAt: number;
    }>();
    dispatches.forEach((d) => {
      if (canceledDispatchIdsRef.current.has(d.id)) return;
      if (now < d.startAt || now >= d.startAt + d.travelMs) return;
      const key = d.groupId ?? d.id;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          groupId: key,
          factionId: d.factionId,
          commanderName: d.commanderName ?? '',
          fromKey: d.fromKey,
          toKey: d.toKey,
          fromPos: d.fromPos,
          toPos: d.toPos,
          startAt: d.startAt,
          endAt: d.startAt + d.travelMs
        });
        return;
      }
      existing.startAt = Math.min(existing.startAt, d.startAt);
      existing.endAt = Math.max(existing.endAt, d.startAt + d.travelMs);
      if (!existing.commanderName && d.commanderName) existing.commanderName = d.commanderName;
    });
    return Array.from(grouped.values());
  }, [dispatches, now]);
  const qinInTransitGroups = useMemo(
    () => activeDispatchGroups.filter((item) => item.factionId === 'qin'),
    [activeDispatchGroups]
  );
  const chuInTransitGroups = useMemo(
    () => activeDispatchGroups.filter((item) => item.factionId === 'chu'),
    [activeDispatchGroups]
  );
  const hanInTransitGroups = useMemo(
    () => activeDispatchGroups.filter((item) => item.factionId === 'han'),
    [activeDispatchGroups]
  );
  const weiInTransitGroups = useMemo(
    () => activeDispatchGroups.filter((item) => item.factionId === 'wei'),
    [activeDispatchGroups]
  );
  const zhaoInTransitGroups = useMemo(
    () => activeDispatchGroups.filter((item) => item.factionId === 'zhao'),
    [activeDispatchGroups]
  );
  const qiInTransitGroups = useMemo(
    () => activeDispatchGroups.filter((item) => item.factionId === 'qi'),
    [activeDispatchGroups]
  );
  const yanInTransitGroups = useMemo(
    () => activeDispatchGroups.filter((item) => item.factionId === 'yan'),
    [activeDispatchGroups]
  );
  useEffect(() => {
    if (qinDispatchAvailableGenerals.length <= 0) {
      setQinDispatchGeneralId('');
      return;
    }
    if (!qinDispatchGeneralId || !qinDispatchAvailableGenerals.some((general) => general.id === qinDispatchGeneralId)) {
      setQinDispatchGeneralId(qinDispatchAvailableGenerals[0].id);
    }
  }, [qinDispatchAvailableGenerals, qinDispatchGeneralId]);
  useEffect(() => {
    if (qinOpMode !== 'assign') return;
    if (qinIdleGeneralsInAssignProvince.length <= 0) {
      setQinAssignGeneralId('');
      setQinAssignTroops(0);
      return;
    }
    if (!qinAssignGeneralId || !qinIdleGeneralsInAssignProvince.some((general) => general.id === qinAssignGeneralId)) {
      setQinAssignGeneralId(qinIdleGeneralsInAssignProvince[0].id);
      return;
    }
    setQinAssignTroops(Math.min(qinAssignMaxTroops, Math.max(0, Math.floor(qinSelectedAssignGeneral?.assignedTroops ?? 0))));
  }, [qinOpMode, qinIdleGeneralsInAssignProvince, qinAssignGeneralId, qinSelectedAssignGeneral, qinAssignMaxTroops]);
  useEffect(() => {
    if (qinOpMode !== 'assign') return;
    if (qinAssignTroops > qinAssignMaxTroops) {
      setQinAssignTroops(qinAssignMaxTroops);
    }
  }, [qinOpMode, qinAssignTroops, qinAssignMaxTroops]);
  useEffect(() => {
    if (chuDispatchAvailableGenerals.length <= 0) {
      setChuDispatchGeneralId('');
      return;
    }
    if (!chuDispatchGeneralId || !chuDispatchAvailableGenerals.some((general) => general.id === chuDispatchGeneralId)) {
      setChuDispatchGeneralId(chuDispatchAvailableGenerals[0].id);
    }
  }, [chuDispatchAvailableGenerals, chuDispatchGeneralId]);
  useEffect(() => {
    if (chuOpMode !== 'assign') return;
    if (chuIdleGeneralsInAssignProvince.length <= 0) {
      setChuAssignGeneralId('');
      setChuAssignTroops(0);
      return;
    }
    if (!chuAssignGeneralId || !chuIdleGeneralsInAssignProvince.some((general) => general.id === chuAssignGeneralId)) {
      setChuAssignGeneralId(chuIdleGeneralsInAssignProvince[0].id);
      return;
    }
    setChuAssignTroops(Math.min(chuAssignMaxTroops, Math.max(0, Math.floor(chuSelectedAssignGeneral?.assignedTroops ?? 0))));
  }, [chuOpMode, chuIdleGeneralsInAssignProvince, chuAssignGeneralId, chuSelectedAssignGeneral, chuAssignMaxTroops]);
  useEffect(() => {
    if (chuOpMode !== 'assign') return;
    if (chuAssignTroops > chuAssignMaxTroops) {
      setChuAssignTroops(chuAssignMaxTroops);
    }
  }, [chuOpMode, chuAssignTroops, chuAssignMaxTroops]);
  useEffect(() => {
    if (hanDispatchAvailableGenerals.length <= 0) {
      setHanDispatchGeneralId('');
      return;
    }
    if (!hanDispatchGeneralId || !hanDispatchAvailableGenerals.some((general) => general.id === hanDispatchGeneralId)) {
      setHanDispatchGeneralId(hanDispatchAvailableGenerals[0].id);
    }
  }, [hanDispatchAvailableGenerals, hanDispatchGeneralId]);
  useEffect(() => {
    if (hanOpMode !== 'assign') return;
    if (hanIdleGeneralsInAssignProvince.length <= 0) {
      setHanAssignGeneralId('');
      setHanAssignTroops(0);
      return;
    }
    if (!hanAssignGeneralId || !hanIdleGeneralsInAssignProvince.some((general) => general.id === hanAssignGeneralId)) {
      setHanAssignGeneralId(hanIdleGeneralsInAssignProvince[0].id);
      return;
    }
    setHanAssignTroops(Math.min(hanAssignMaxTroops, Math.max(0, Math.floor(hanSelectedAssignGeneral?.assignedTroops ?? 0))));
  }, [hanOpMode, hanIdleGeneralsInAssignProvince, hanAssignGeneralId, hanSelectedAssignGeneral, hanAssignMaxTroops]);
  useEffect(() => {
    if (hanOpMode !== 'assign') return;
    if (hanAssignTroops > hanAssignMaxTroops) {
      setHanAssignTroops(hanAssignMaxTroops);
    }
  }, [hanOpMode, hanAssignTroops, hanAssignMaxTroops]);
  useEffect(() => {
    if (weiDispatchAvailableGenerals.length <= 0) {
      setWeiDispatchGeneralId('');
      return;
    }
    if (!weiDispatchGeneralId || !weiDispatchAvailableGenerals.some((general) => general.id === weiDispatchGeneralId)) {
      setWeiDispatchGeneralId(weiDispatchAvailableGenerals[0].id);
    }
  }, [weiDispatchAvailableGenerals, weiDispatchGeneralId]);
  useEffect(() => {
    if (weiOpMode !== 'assign') return;
    if (weiIdleGeneralsInAssignProvince.length <= 0) {
      setWeiAssignGeneralId('');
      setWeiAssignTroops(0);
      return;
    }
    if (!weiAssignGeneralId || !weiIdleGeneralsInAssignProvince.some((general) => general.id === weiAssignGeneralId)) {
      setWeiAssignGeneralId(weiIdleGeneralsInAssignProvince[0].id);
      return;
    }
    setWeiAssignTroops(Math.min(weiAssignMaxTroops, Math.max(0, Math.floor(weiSelectedAssignGeneral?.assignedTroops ?? 0))));
  }, [weiOpMode, weiIdleGeneralsInAssignProvince, weiAssignGeneralId, weiSelectedAssignGeneral, weiAssignMaxTroops]);
  useEffect(() => {
    if (weiOpMode !== 'assign') return;
    if (weiAssignTroops > weiAssignMaxTroops) {
      setWeiAssignTroops(weiAssignMaxTroops);
    }
  }, [weiOpMode, weiAssignTroops, weiAssignMaxTroops]);
  useEffect(() => {
    if (zhaoDispatchAvailableGenerals.length <= 0) {
      setZhaoDispatchGeneralId('');
      return;
    }
    if (!zhaoDispatchGeneralId || !zhaoDispatchAvailableGenerals.some((general) => general.id === zhaoDispatchGeneralId)) {
      setZhaoDispatchGeneralId(zhaoDispatchAvailableGenerals[0].id);
    }
  }, [zhaoDispatchAvailableGenerals, zhaoDispatchGeneralId]);
  useEffect(() => {
    if (zhaoOpMode !== 'assign') return;
    if (zhaoIdleGeneralsInAssignProvince.length <= 0) {
      setZhaoAssignGeneralId('');
      setZhaoAssignTroops(0);
      return;
    }
    if (!zhaoAssignGeneralId || !zhaoIdleGeneralsInAssignProvince.some((general) => general.id === zhaoAssignGeneralId)) {
      setZhaoAssignGeneralId(zhaoIdleGeneralsInAssignProvince[0].id);
      return;
    }
    setZhaoAssignTroops(Math.min(zhaoAssignMaxTroops, Math.max(0, Math.floor(zhaoSelectedAssignGeneral?.assignedTroops ?? 0))));
  }, [zhaoOpMode, zhaoIdleGeneralsInAssignProvince, zhaoAssignGeneralId, zhaoSelectedAssignGeneral, zhaoAssignMaxTroops]);
  useEffect(() => {
    if (zhaoOpMode !== 'assign') return;
    if (zhaoAssignTroops > zhaoAssignMaxTroops) {
      setZhaoAssignTroops(zhaoAssignMaxTroops);
    }
  }, [zhaoOpMode, zhaoAssignTroops, zhaoAssignMaxTroops]);
  useEffect(() => {
    if (qiDispatchAvailableGenerals.length <= 0) {
      setQiDispatchGeneralId('');
      return;
    }
    if (!qiDispatchGeneralId || !qiDispatchAvailableGenerals.some((general) => general.id === qiDispatchGeneralId)) {
      setQiDispatchGeneralId(qiDispatchAvailableGenerals[0].id);
    }
  }, [qiDispatchAvailableGenerals, qiDispatchGeneralId]);
  useEffect(() => {
    if (qiOpMode !== 'assign') return;
    if (qiIdleGeneralsInAssignProvince.length <= 0) {
      setQiAssignGeneralId('');
      setQiAssignTroops(0);
      return;
    }
    if (!qiAssignGeneralId || !qiIdleGeneralsInAssignProvince.some((general) => general.id === qiAssignGeneralId)) {
      setQiAssignGeneralId(qiIdleGeneralsInAssignProvince[0].id);
      return;
    }
    setQiAssignTroops(Math.min(qiAssignMaxTroops, Math.max(0, Math.floor(qiSelectedAssignGeneral?.assignedTroops ?? 0))));
  }, [qiOpMode, qiIdleGeneralsInAssignProvince, qiAssignGeneralId, qiSelectedAssignGeneral, qiAssignMaxTroops]);
  useEffect(() => {
    if (qiOpMode !== 'assign') return;
    if (qiAssignTroops > qiAssignMaxTroops) {
      setQiAssignTroops(qiAssignMaxTroops);
    }
  }, [qiOpMode, qiAssignTroops, qiAssignMaxTroops]);
  useEffect(() => {
    if (yanDispatchAvailableGenerals.length <= 0) {
      setYanDispatchGeneralId('');
      return;
    }
    if (!yanDispatchGeneralId || !yanDispatchAvailableGenerals.some((general) => general.id === yanDispatchGeneralId)) {
      setYanDispatchGeneralId(yanDispatchAvailableGenerals[0].id);
    }
  }, [yanDispatchAvailableGenerals, yanDispatchGeneralId]);
  useEffect(() => {
    if (yanOpMode !== 'assign') return;
    if (yanIdleGeneralsInAssignProvince.length <= 0) {
      setYanAssignGeneralId('');
      setYanAssignTroops(0);
      return;
    }
    if (!yanAssignGeneralId || !yanIdleGeneralsInAssignProvince.some((general) => general.id === yanAssignGeneralId)) {
      setYanAssignGeneralId(yanIdleGeneralsInAssignProvince[0].id);
      return;
    }
    setYanAssignTroops(Math.min(yanAssignMaxTroops, Math.max(0, Math.floor(yanSelectedAssignGeneral?.assignedTroops ?? 0))));
  }, [yanOpMode, yanIdleGeneralsInAssignProvince, yanAssignGeneralId, yanSelectedAssignGeneral, yanAssignMaxTroops]);
  useEffect(() => {
    if (yanOpMode !== 'assign') return;
    if (yanAssignTroops > yanAssignMaxTroops) {
      setYanAssignTroops(yanAssignMaxTroops);
    }
  }, [yanOpMode, yanAssignTroops, yanAssignMaxTroops]);
  const warringStateMarkers = useMemo(
    () =>
      WARRING_STATES
        .map((state) => {
          const center = provinceCenterByAdm1[state.anchorAdm1];
          if (!center) return null;
          return {
            ...state,
            x: center.x + state.dx,
            y: center.y + state.dy
          };
        })
        .filter((state): state is (typeof WARRING_STATES)[number] & { x: number; y: number } => Boolean(state)),
    [provinceCenterByAdm1]
  );
  const warringColorById = useMemo(
    () => WARRING_STATES.reduce((acc, item) => {
      acc[item.id] = item.color;
      return acc;
    }, {} as Record<WarringStateId, string>),
    []
  );
  const warringStateById = useMemo(
    () => WARRING_STATES.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {} as Record<WarringStateId, (typeof WARRING_STATES)[number]>),
    []
  );
  const playerNation = warringStateById[playerFactionId];
  const provinceFactionLabels = useMemo(() => {
    const capitalFactionByAdm1 = Object.entries(WARRING_INITIAL_POWER).reduce((acc, [factionId, cfg]) => {
      acc[cfg.capitalAdm1] = factionId as WarringStateId;
      return acc;
    }, {} as Record<string, WarringStateId>);
    return levelRegions.reduce<Array<{ key: string; x: number; y: number; name: string; color: string; fontSize: number; nationId: WarringStateId }>>((acc, region) => {
      const factionId = capitalFactionByAdm1[region.adm1];
      if (!factionId) return acc;
      const occupiedBy = WARRING_TERRITORY_BY_ADM1[region.adm1] ?? factionId;
      const faction = warringStateById[occupiedBy];
      acc.push({
        key: region.key,
        x: region.cx,
        y: region.cy,
        name: faction.name,
        color: faction.color,
        fontSize: 40,
        nationId: factionId
      });
      return acc;
    }, []);
  }, [levelRegions, regionStateByKey, territoryVersion, warringStateById]);
  const mergedDisplayNodes = useMemo(() => {
    if (levelRegions.length <= 0) return [] as Array<{ id: string; memberKeys: string[]; x: number; y: number }>;
    const areas = levelRegions.map((r) => r.area).sort((a, b) => a - b);
    const tinyThreshold = areas[Math.max(0, Math.floor(areas.length * 0.65) - 1)] ?? 0;
    const used = new Set<string>();
    const nodes: Array<{ id: string; memberKeys: string[]; x: number; y: number }> = [];
    const getInitialOwner = (r: RegionDef) => LEVEL_1_CONFIG_BY_ID[`${r.iso3}-${r.adm1}`]?.owner ?? 'neutral';

    levelRegions.forEach((region) => {
      if (used.has(region.key)) return;
      const members: RegionDef[] = [region];
      used.add(region.key);
      if (region.area <= tinyThreshold) {
        const owner = getInitialOwner(region);
        levelRegions.forEach((candidate) => {
          if (used.has(candidate.key) || candidate.key === region.key) return;
          if (candidate.iso3 !== region.iso3) return;
          if (getInitialOwner(candidate) !== owner) return;
          if (candidate.area > tinyThreshold) return;
          const dist = Math.hypot(candidate.cx - region.cx, candidate.cy - region.cy);
          if (dist > 72) return;
          used.add(candidate.key);
          members.push(candidate);
        });
      }
      const totalArea = members.reduce((s, m) => s + Math.max(1, m.area), 0);
      const x = members.reduce((s, m) => s + m.cx * Math.max(1, m.area), 0) / totalArea;
      const y = members.reduce((s, m) => s + m.cy * Math.max(1, m.area), 0) / totalArea;
      nodes.push({ id: members[0].key, memberKeys: members.map((m) => m.key), x, y });
    });
    return nodes;
  }, [levelRegions]);
  const displayNodeById = useMemo(
    () =>
      mergedDisplayNodes.reduce((acc, n) => {
        acc[n.id] = n;
        return acc;
      }, {} as Record<string, { id: string; memberKeys: string[]; x: number; y: number }>),
    [mergedDisplayNodes]
  );
  const stationedGeneralMapTags = useMemo(() => {
    const grouped = new Map<string, { factionId: WarringStateId; names: string[] }>();
    const ingest = (factionId: WarringStateId, generals: QinGeneral[]) => {
      generals.forEach((general) => {
        if (general.status !== 'idle' || !general.locationKey) return;
        const key = `${factionId}::${general.locationKey}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.names.push(general.name);
          return;
        }
        grouped.set(key, { factionId, names: [general.name] });
      });
    };
    ingest('qin', qinGenerals);
    ingest('chu', chuGenerals);
    ingest('han', hanGenerals);
    ingest('wei', weiGenerals);
    ingest('zhao', zhaoGenerals);
    ingest('qi', qiGenerals);
    ingest('yan', yanGenerals);

    return Array.from(grouped.entries()).map(([key, item]) => {
      const splitAt = key.indexOf('::');
      const locationKey = splitAt >= 0 ? key.slice(splitAt + 2) : '';
      const node = displayNodeById[locationKey] ?? levelCenters[locationKey];
      if (!node) return null;
      const x = (node?.x ?? 0) + 18;
      const y = (node?.y ?? 0) - 28;
      const label = item.names.length <= 2
        ? item.names.join('、')
        : `${item.names.slice(0, 2).join('、')}+${item.names.length - 2}`;
      return {
        key,
        locationKey,
        factionId: item.factionId,
        x,
        y,
        names: item.names,
        count: item.names.length,
        label
      };
    }).filter((item): item is {
      key: string;
      locationKey: string;
      factionId: WarringStateId;
      x: number;
      y: number;
      names: string[];
      count: number;
      label: string;
    } => Boolean(item));
  }, [qinGenerals, chuGenerals, hanGenerals, weiGenerals, zhaoGenerals, qiGenerals, yanGenerals, displayNodeById, levelCenters]);
  const visibleStationedGeneralMapTags = useMemo(() => {
    const focusedFaction = selectedNationId
      ?? (selectedProvinceKey ? WARRING_TERRITORY_BY_ADM1[regionsByKey[selectedProvinceKey]?.adm1 ?? ''] ?? null : null)
      ?? playerFactionId
      ?? 'qin';
    if (showAllGeneralTags) return stationedGeneralMapTags;
    return stationedGeneralMapTags.filter((tag) => tag.factionId === focusedFaction);
  }, [showAllGeneralTags, selectedNationId, selectedProvinceKey, regionsByKey, stationedGeneralMapTags, playerFactionId]);
  const generalTagLod = useMemo<'dot' | 'compact' | 'full'>(() => {
    if (zoom < 1.6) return 'dot';
    if (zoom < 2.25) return 'compact';
    return 'full';
  }, [zoom]);
  const regionToDisplayNodeId = useMemo(() => {
    const acc: Record<string, string> = {};
    mergedDisplayNodes.forEach((n) => {
      n.memberKeys.forEach((k) => {
        acc[k] = n.id;
      });
    });
    return acc;
  }, [mergedDisplayNodes]);
  const capitalDisplayNodeIdSet = useMemo(() => {
    const ids = new Set<string>();
    WARRING_STATES.forEach((state) => {
      const regionKey = regionKeyByAdm1[state.anchorAdm1];
      if (!regionKey) return;
      ids.add(regionToDisplayNodeId[regionKey] ?? regionKey);
    });
    return ids;
  }, [regionKeyByAdm1, regionToDisplayNodeId]);
  const capitalDisplayNodes = useMemo(
    () => mergedDisplayNodes.filter((node) => capitalDisplayNodeIdSet.has(node.id)),
    [mergedDisplayNodes, capitalDisplayNodeIdSet]
  );
  const qinCapitalNodeId = useMemo(() => {
    const regionKey = regionKeyByAdm1[WARRING_INITIAL_POWER.qin.capitalAdm1];
    if (!regionKey) return null;
    return regionToDisplayNodeId[regionKey] ?? regionKey;
  }, [regionKeyByAdm1, regionToDisplayNodeId]);
  const chuCapitalNodeId = useMemo(() => {
    const regionKey = regionKeyByAdm1[WARRING_INITIAL_POWER.chu.capitalAdm1];
    if (!regionKey) return null;
    return regionToDisplayNodeId[regionKey] ?? regionKey;
  }, [regionKeyByAdm1, regionToDisplayNodeId]);
  const hanCapitalNodeId = useMemo(() => {
    const regionKey = regionKeyByAdm1[WARRING_INITIAL_POWER.han.capitalAdm1];
    if (!regionKey) return null;
    return regionToDisplayNodeId[regionKey] ?? regionKey;
  }, [regionKeyByAdm1, regionToDisplayNodeId]);
  const weiCapitalNodeId = useMemo(() => {
    const regionKey = regionKeyByAdm1[WARRING_INITIAL_POWER.wei.capitalAdm1];
    if (!regionKey) return null;
    return regionToDisplayNodeId[regionKey] ?? regionKey;
  }, [regionKeyByAdm1, regionToDisplayNodeId]);
  const zhaoCapitalNodeId = useMemo(() => {
    const regionKey = regionKeyByAdm1[WARRING_INITIAL_POWER.zhao.capitalAdm1];
    if (!regionKey) return null;
    return regionToDisplayNodeId[regionKey] ?? regionKey;
  }, [regionKeyByAdm1, regionToDisplayNodeId]);
  const qiCapitalNodeId = useMemo(() => {
    const regionKey = regionKeyByAdm1[WARRING_INITIAL_POWER.qi.capitalAdm1];
    if (!regionKey) return null;
    return regionToDisplayNodeId[regionKey] ?? regionKey;
  }, [regionKeyByAdm1, regionToDisplayNodeId]);
  const yanCapitalNodeId = useMemo(() => {
    const regionKey = regionKeyByAdm1[WARRING_INITIAL_POWER.yan.capitalAdm1];
    if (!regionKey) return null;
    return regionToDisplayNodeId[regionKey] ?? regionKey;
  }, [regionKeyByAdm1, regionToDisplayNodeId]);
  const getGeneralLocationLabel = (general: QinGeneral): string => {
    if (general.status === 'marching') return '行军中';
    if (!general.locationKey) return '未驻扎';
    return regionsByKey[general.locationKey]?.label ?? '未知省';
  };
  const selectedProvincePanel = useMemo(() => {
    if (!selectedProvinceKey) return null;
    const region = regionsByKey[selectedProvinceKey];
    if (!region) return null;
    const factionId = WARRING_TERRITORY_BY_ADM1[region.adm1];
    const faction = factionId ? warringStateById[factionId] : null;
    const troops = Math.floor(regionStateByKey[region.key]?.value ?? 0);
    const areaSum = regionsByKey[region.key]?.area ?? 0;
    const baseEconomyPerSec = Math.max(1.2, Math.sqrt(Math.max(1, areaSum)) / 12);
    const economyFactor = factionId ? WARRING_ECONOMY_FACTOR_BY_FACTION[factionId] : 1;
    const economyPerSec = Math.max(1, Math.round(baseEconomyPerSec * economyFactor));
    const grain = factionId === 'qin'
      ? Math.floor(qinGrain)
      : factionId === 'chu'
        ? Math.floor(chuGrain)
        : factionId === 'han'
          ? Math.floor(hanGrain)
        : factionId === 'wei'
            ? Math.floor(weiGrain)
            : factionId === 'zhao'
              ? Math.floor(zhaoGrain)
              : factionId === 'qi'
                ? Math.floor(qiGrain)
                : factionId === 'yan'
                  ? Math.floor(yanGrain)
        : Math.floor(Math.max(80, troops * 0.9 + Math.sqrt(Math.max(1, areaSum)) * 0.45));
    return {
      nodeId: selectedProvinceKey,
      provinceName: region.label,
      factionName: faction?.name ?? '中立',
      factionId,
      factionColor: faction?.color ?? '#9CA3AF',
      troops,
      grain,
      economyPerSec,
      generals: factionId === 'qin' ? qinGenerals.length : factionId === 'chu' ? chuGenerals.length : factionId === 'han' ? hanGenerals.length : factionId === 'wei' ? weiGenerals.length : factionId === 'zhao' ? zhaoGenerals.length : factionId === 'qi' ? qiGenerals.length : factionId === 'yan' ? yanGenerals.length : 0
    };
  }, [selectedProvinceKey, regionsByKey, regionStateByKey, qinGrain, qinGenerals, chuGrain, chuGenerals, hanGrain, hanGenerals, weiGrain, weiGenerals, zhaoGrain, zhaoGenerals, qiGrain, qiGenerals, yanGrain, yanGenerals, territoryVersion, warringStateById]);
  const selectedNationPanel = useMemo(() => {
    if (selectedNationId !== 'qin' && selectedNationId !== 'chu' && selectedNationId !== 'han' && selectedNationId !== 'wei' && selectedNationId !== 'zhao' && selectedNationId !== 'qi' && selectedNationId !== 'yan') return null;
    const targetNation = selectedNationId;
    const nationRegions = levelRegions.filter((region) => WARRING_TERRITORY_BY_ADM1[region.adm1] === targetNation);
    if (nationRegions.length <= 0) return null;
    const totalTroops = Math.floor(
      nationRegions.reduce((sum, region) => sum + (regionStateByKey[region.key]?.value ?? 0), 0)
    );
    const economyFactor = WARRING_ECONOMY_FACTOR_BY_FACTION[targetNation];
    const economyPerSec = Math.max(
      1,
      Math.round(
        nationRegions.reduce((sum, region) => sum + Math.max(1.2, Math.sqrt(Math.max(1, region.area)) / 12), 0)
          * economyFactor
      )
    );
    return {
      factionId: targetNation,
      factionName: warringStateById[targetNation].name,
      factionColor: warringStateById[targetNation].color,
      totalTroops,
      grain: Math.floor(targetNation === 'qin' ? qinGrain : targetNation === 'chu' ? chuGrain : targetNation === 'han' ? hanGrain : targetNation === 'wei' ? weiGrain : targetNation === 'zhao' ? zhaoGrain : targetNation === 'qi' ? qiGrain : yanGrain),
      economyStock: Math.floor(targetNation === 'qin' ? qinEconomy : targetNation === 'chu' ? chuEconomy : targetNation === 'han' ? hanEconomy : targetNation === 'wei' ? weiEconomy : targetNation === 'zhao' ? zhaoEconomy : targetNation === 'qi' ? qiEconomy : yanEconomy),
      economyPerSec,
      generals: targetNation === 'qin' ? qinGenerals.length : targetNation === 'chu' ? chuGenerals.length : targetNation === 'han' ? hanGenerals.length : targetNation === 'wei' ? weiGenerals.length : targetNation === 'zhao' ? zhaoGenerals.length : targetNation === 'qi' ? qiGenerals.length : yanGenerals.length,
      generalIdle: targetNation === 'qin' ? qinIdleGeneralCount : targetNation === 'chu' ? chuIdleGeneralCount : targetNation === 'han' ? hanIdleGeneralCount : targetNation === 'wei' ? weiIdleGeneralCount : targetNation === 'zhao' ? zhaoIdleGeneralCount : targetNation === 'qi' ? qiIdleGeneralCount : yanIdleGeneralCount,
      generalMarching: targetNation === 'qin' ? qinMarchingGeneralCount : targetNation === 'chu' ? chuMarchingGeneralCount : targetNation === 'han' ? hanMarchingGeneralCount : targetNation === 'wei' ? weiMarchingGeneralCount : targetNation === 'zhao' ? zhaoMarchingGeneralCount : targetNation === 'qi' ? qiMarchingGeneralCount : yanMarchingGeneralCount,
      generalNames: targetNation === 'qin'
        ? qinGenerals.map((general) => `${general.name}（${getGeneralLocationLabel(general)}）`)
        : targetNation === 'chu'
          ? chuGenerals.map((general) => `${general.name}（${getGeneralLocationLabel(general)}）`)
          : targetNation === 'han'
            ? hanGenerals.map((general) => `${general.name}（${getGeneralLocationLabel(general)}）`)
            : targetNation === 'wei'
              ? weiGenerals.map((general) => `${general.name}（${getGeneralLocationLabel(general)}）`)
              : targetNation === 'zhao'
                ? zhaoGenerals.map((general) => `${general.name}（${getGeneralLocationLabel(general)}）`)
                : targetNation === 'qi'
                  ? qiGenerals.map((general) => `${general.name}（${getGeneralLocationLabel(general)}）`)
                  : yanGenerals.map((general) => `${general.name}（${getGeneralLocationLabel(general)}）`),
      occupiedProvinceCount: nationRegions.length,
      capitalName: nationRegions.find((region) => region.adm1 === WARRING_INITIAL_POWER[targetNation].capitalAdm1)?.label ?? (targetNation === 'qin' ? '陕西' : targetNation === 'chu' ? '江西' : targetNation === 'han' ? '河南' : targetNation === 'wei' ? '山西' : targetNation === 'zhao' ? '河北' : targetNation === 'qi' ? '山东' : '北京')
    };
  }, [selectedNationId, levelRegions, regionStateByKey, qinGrain, qinEconomy, qinGenerals, qinIdleGeneralCount, qinMarchingGeneralCount, chuGrain, chuEconomy, chuGenerals, chuIdleGeneralCount, chuMarchingGeneralCount, hanGrain, hanEconomy, hanGenerals, hanIdleGeneralCount, hanMarchingGeneralCount, weiGrain, weiEconomy, weiGenerals, weiIdleGeneralCount, weiMarchingGeneralCount, zhaoGrain, zhaoEconomy, zhaoGenerals, zhaoIdleGeneralCount, zhaoMarchingGeneralCount, qiGrain, qiEconomy, qiGenerals, qiIdleGeneralCount, qiMarchingGeneralCount, yanGrain, yanEconomy, yanGenerals, yanIdleGeneralCount, yanMarchingGeneralCount, territoryVersion, warringStateById, regionsByKey]);
  const captureRadius = captureRadiusPx / camera.scale;
  const arrowStrokeWidth = arrowStrokeWidthPx / camera.scale;
  const arrowHeadLength = arrowHeadLengthPx / camera.scale;
  const arrowHeadWidth = arrowHeadWidthPx / camera.scale;
  const arrowStartOffset = arrowStartOffsetPx / camera.scale;
  useEffect(() => {
    if (levelRegionKeys.length <= 0) return;
    setNodeShakeOffsets((prev) => {
      const next = { ...prev };
      levelRegionKeys.forEach((key) => {
        if (!next[key]) next[key] = { x: 0, y: 0 };
      });
      return next;
    });
    setHitPulseAtByKey((prev) => {
      const next = { ...prev };
      levelRegionKeys.forEach((key) => {
        if (!next[key]) next[key] = 0;
      });
      return next;
    });
  }, [levelRegionKeys]);

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
    playTone(240, 70, 0.03, 'triangle');
    window.setTimeout(() => playTone(310, 45, 0.025, 'triangle'), 35);
  };
  const playCollisionSound = () => {
    playTone(420, 45, 0.06, 'square');
    window.setTimeout(() => playTone(180, 60, 0.04, 'triangle'), 20);
  };
  const stopMarchLoop = () => {
    if (marchLoopTimerRef.current) {
      window.clearInterval(marchLoopTimerRef.current);
      marchLoopTimerRef.current = null;
    }
  };
  const triggerNodeShake = (key: string, amplitude: number, durationMs: number) => {
    if (!levelRegionKeySet.has(key) || amplitude <= 0 || durationMs <= 0) return;
    const prev = shakeRafByKeyRef.current[key];
    if (prev) window.cancelAnimationFrame(prev);
    const start = performance.now();
    const tick = (ts: number) => {
      const elapsed = ts - start;
      if (elapsed >= durationMs) {
        setNodeShakeOffsets((old) => ({ ...old, [key]: { x: 0, y: 0 } }));
        shakeRafByKeyRef.current[key] = null;
        return;
      }
      const decay = 1 - elapsed / durationMs;
      const phase = (elapsed / 1000) * SHAKE_FREQ_HZ * Math.PI * 2;
      const x = Math.sin(phase * 1.05) * amplitude * decay;
      const y = Math.cos(phase * 0.91) * amplitude * 0.65 * decay;
      setNodeShakeOffsets((old) => ({ ...old, [key]: { x, y } }));
      shakeRafByKeyRef.current[key] = window.requestAnimationFrame(tick);
    };
    shakeRafByKeyRef.current[key] = window.requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (selectedSources.length <= 0 || !aimPoint) {
      setSmoothedAimPoint(null);
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
  }, [selectedSources, qinOpMode, qinDispatchPickStage, chuOpMode, chuDispatchPickStage, hanOpMode, hanDispatchPickStage, weiOpMode, weiDispatchPickStage, zhaoOpMode, zhaoDispatchPickStage, qiOpMode, qiDispatchPickStage, yanOpMode, yanDispatchPickStage, aimPoint, arrowSmoothFollow]);

  useEffect(() => {
    if (!hoverTargetKey) {
      lastHoverKeyRef.current = null;
      return;
    }
    if (lastHoverKeyRef.current !== hoverTargetKey) {
      setHoverPulseAt(performance.now());
      lastHoverKeyRef.current = hoverTargetKey;
    }
  }, [hoverTargetKey]);

  useEffect(() => {
    const targetKeys = levelRegionKeys;
    if (targetKeys.length <= 0) return;
    if (NUMBER_ANIM_SEC <= 0) {
      setDisplayValuesByKey((prev) => {
        const next = { ...prev };
        targetKeys.forEach((key) => {
          next[key] = regionStateByKey[key]?.value ?? 0;
        });
        return next;
      });
      return;
    }
    const start = performance.now();
    const durationMs = NUMBER_ANIM_SEC * 1000;
    const from = displayValuesByKey;
    if (numberAnimRafRef.current) window.cancelAnimationFrame(numberAnimRafRef.current);
    const tick = (ts: number) => {
      const t = clamp((ts - start) / durationMs, 0, 1);
      setDisplayValuesByKey((prev) => {
        const next = { ...prev };
        targetKeys.forEach((key) => {
          const fv = from[key] ?? regionStateByKey[key]?.value ?? 0;
          const tv = regionStateByKey[key]?.value ?? 0;
          next[key] = fv + (tv - fv) * t;
        });
        return next;
      });
      if (t < 1) numberAnimRafRef.current = window.requestAnimationFrame(tick);
    };
    numberAnimRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (numberAnimRafRef.current) window.cancelAnimationFrame(numberAnimRafRef.current);
    };
  }, [regionStateByKey, levelRegionKeys]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
      if (aimFollowRafRef.current) window.cancelAnimationFrame(aimFollowRafRef.current);
      if (numberAnimRafRef.current) window.cancelAnimationFrame(numberAnimRafRef.current);
      stopMarchLoop();
      Object.values(shakeRafByKeyRef.current).forEach((raf) => {
        if (raf) window.cancelAnimationFrame(raf);
      });
      generalReturnTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      generalReturnTimersRef.current = [];
      if (opButtonTimerRef.current) window.clearTimeout(opButtonTimerRef.current);
      if (aiLoopTimerRef.current) window.clearInterval(aiLoopTimerRef.current);
      if (pinchRafRef.current) window.cancelAnimationFrame(pinchRafRef.current);
    };
  }, []);

  const flashOpButton = (key: 'recruit' | 'grain' | 'hire' | 'dispatch' | 'assign' | 'dispatchConfirm') => {
    setActiveOpButton(key);
    if (opButtonTimerRef.current) window.clearTimeout(opButtonTimerRef.current);
    opButtonTimerRef.current = window.setTimeout(() => setActiveOpButton(null), 280);
  };

  const dispatchSelectedSourcesTo = (toKey: string) => {
    if (result !== 'playing') return;
    const target = regionStateByKey[toKey];
    if (!target) return;
    const sources = selectedSources.filter((key) => key !== toKey);
    if (sources.length <= 0) return;

    type DispatchPlan = {
      fromKey: string;
      from: RegionState;
      fromAnchor: { x: number; y: number };
      toAnchor: { x: number; y: number };
      sendAmount: number;
    };
    const plans: DispatchPlan[] = sources
      .map((fromKey) => {
        const from = regionStateByKey[fromKey];
        if (!from || from.owner !== 'blue') return null;
        if (!isAdjacentAttack(fromKey, toKey)) return null;
        const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
        const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
        if (!fromAnchor || !toAnchor) return null;
        const sendAmount = Math.floor(from.value);
        if (sendAmount <= 0) return null;
        return { fromKey, from, fromAnchor, toAnchor, sendAmount };
      })
      .filter((item): item is DispatchPlan => Boolean(item));
    if (plans.length <= 0) {
      setQinHireResult('出征失败：仅可攻击相邻省份');
      return;
    }

    const requiredGenerals = plans.length;
    const idleGenerals = qinGenerals.filter((general) => general.status === 'idle');
    if (idleGenerals.length < requiredGenerals) {
      setQinHireResult(`出征失败：需${requiredGenerals}名将领，当前空闲${idleGenerals.length}`);
      return;
    }
    const totalTroops = plans.reduce((sum, plan) => sum + plan.sendAmount, 0);
    if (qinGrain < totalTroops) {
      setQinHireResult(`出征失败：粮草不足（需${totalTroops}，现有${Math.floor(qinGrain)}）`);
      return;
    }

    const assignedGenerals = idleGenerals.slice(0, requiredGenerals);
    const assignedGeneralIds = new Set(assignedGenerals.map((general) => general.id));
    setQinGrain((prev) => prev - totalTroops);
    setQinGenerals((prev) => prev.map((general) => (
      assignedGeneralIds.has(general.id)
        ? { ...general, status: 'marching', locationKey: null }
        : general
    )));
    setQinHireResult(`出征成功：派出${totalTroops}兵，消耗${totalTroops}粮草，出动${requiredGenerals}将领`);

    const created: Dispatch[] = [];
    plans.forEach((plan, idx) => {
      const { fromKey, from, fromAnchor, toAnchor, sendAmount } = plan;
      triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
      const baseNow = performance.now();
      const perColumn = sendAmount < 3 ? sendAmount : 5;
      const maxCol = Math.max(0, Math.ceil(sendAmount / perColumn) - 1);
      const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
      const assignedGeneral = assignedGenerals[idx];
      const groupId = `${baseNow}-${fromKey}-${toKey}-${assignedGeneral?.id ?? `plan-${idx}`}`;
      if (assignedGeneral) {
        const timerId = window.setTimeout(() => {
          const targetRegion = regionsByKey[toKey];
          const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === 'qin'
            ? toKey
            : fromKey;
          setQinGenerals((prev) => prev.map((general) => (
            general.id === assignedGeneral.id
              ? { ...general, status: 'idle', locationKey: returnKey }
              : general
          )));
        }, releaseInMs);
        generalReturnTimersRef.current.push(timerId);
      }
      for (let i = 0; i < sendAmount; i += 1) {
        const row = i % perColumn;
        const col = Math.floor(i / perColumn);
        const rowsInColumn = Math.min(perColumn, sendAmount - col * perColumn);
        const centeredRow = row - (rowsInColumn - 1) / 2;
        const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
        const laneBias = centeredRow / laneBiasDivisor;
        const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
        created.push({
          id: `${baseNow}-${fromKey}-${toKey}-${i}`,
          groupId,
          fromKey,
          toKey,
          factionId: 'qin',
          commanderName: assignedGeneral?.name ?? '',
          fromPos: { x: fromAnchor.x, y: fromAnchor.y },
          toPos: { x: toAnchor.x, y: toAnchor.y },
          owner: from.owner,
          row,
          col,
          rowsInColumn,
          laneBias,
          columnStagger,
          startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
          travelMs: FLIGHT_MS
        });
      }
    });

    if (created.length > 0) setDispatches((prev) => [...prev, ...created]);
    setSelectedSources([]);
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setHoverTargetKey(null);
  };

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
    setHoverTargetKey(null);
  };

  const onRegionPointerDown = (rawKey: string, pointerPos?: { x: number; y: number }) => {
    void rawKey;
    void pointerPos;
  };

  const onBoardPointerUp = () => {
    if (pinchActiveRef.current) {
      pinchActiveRef.current = false;
      pinchLastDistanceRef.current = null;
      pinchPendingRef.current = null;
      if (pinchRafRef.current) {
        window.cancelAnimationFrame(pinchRafRef.current);
        pinchRafRef.current = null;
      }
      panActiveRef.current = false;
      panLastPointRef.current = null;
      touchStartPointRef.current = null;
      return;
    }
    if (panActiveRef.current) {
      panActiveRef.current = false;
      panLastPointRef.current = null;
      touchStartPointRef.current = null;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      return;
    }
    pointerDownRef.current = false;
    if (longPressActiveRef.current) {
      if (hoverTargetKey) dispatchSelectedSourcesTo(hoverTargetKey);
      // 长按后松手统一退出出兵态，避免箭头与选中残留。
      clearSelectionState();
    }
    clearLongPress();
    longPressActiveRef.current = false;
    lastPointerPosRef.current = null;
    touchStartPointRef.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const onRegionClick = (rawKey: string) => {
    const region = regionsByKey[rawKey];
    if (!region) return;
    const isQinRegion = WARRING_TERRITORY_BY_ADM1[region.adm1] === 'qin';
    const isChuRegion = WARRING_TERRITORY_BY_ADM1[region.adm1] === 'chu';
    const isHanRegion = WARRING_TERRITORY_BY_ADM1[region.adm1] === 'han';
    const isWeiRegion = WARRING_TERRITORY_BY_ADM1[region.adm1] === 'wei';
    const isZhaoRegion = WARRING_TERRITORY_BY_ADM1[region.adm1] === 'zhao';
    const isQiRegion = WARRING_TERRITORY_BY_ADM1[region.adm1] === 'qi';
    const isYanRegion = WARRING_TERRITORY_BY_ADM1[region.adm1] === 'yan';
    if (qinOpMode === 'dispatch') {
      if (qinDispatchPickStage === 'to') {
        if (isQinRegion) {
          setQinHireResult('出兵省已固定为当前选中省，请点敌对/中立省作为目标');
          return;
        }
        if (qinDispatchFromKey && !isAdjacentAttack(qinDispatchFromKey, rawKey)) {
          setQinHireResult('出征失败：仅可攻击相邻省份');
          return;
        }
        setQinDispatchToKey(rawKey);
        setQinDispatchPickStage('config');
        setQinHireResult(`已选目标省：${region.label}，请确认兵力与将领`);
        return;
      }
      if (qinDispatchPickStage === 'config') {
        if (isQinRegion) {
          setQinHireResult('出兵省固定为已选省，若要更换请先退出出征并重新选省');
        } else {
          if (qinDispatchFromKey && !isAdjacentAttack(qinDispatchFromKey, rawKey)) {
            setQinHireResult('出征失败：仅可攻击相邻省份');
            return;
          }
          setQinDispatchToKey(rawKey);
          setQinHireResult(`改为目标省：${region.label}`);
        }
        return;
      }
    }
    if (chuOpMode === 'dispatch') {
      if (chuDispatchPickStage === 'to') {
        if (isChuRegion) {
          setChuHireResult('出兵省已固定为当前选中省，请点敌对/中立省作为目标');
          return;
        }
        if (chuDispatchFromKey && !isAdjacentAttack(chuDispatchFromKey, rawKey)) {
          setChuHireResult('出征失败：仅可攻击相邻省份');
          return;
        }
        setChuDispatchToKey(rawKey);
        setChuDispatchPickStage('config');
        setChuHireResult(`已选目标省：${region.label}，请确认兵力与将领`);
        return;
      }
      if (chuDispatchPickStage === 'config') {
        if (isChuRegion) {
          setChuHireResult('出兵省固定为已选省，若要更换请先退出出征并重新选省');
        } else {
          if (chuDispatchFromKey && !isAdjacentAttack(chuDispatchFromKey, rawKey)) {
            setChuHireResult('出征失败：仅可攻击相邻省份');
            return;
          }
          setChuDispatchToKey(rawKey);
          setChuHireResult(`改为目标省：${region.label}`);
        }
        return;
      }
    }
    if (hanOpMode === 'dispatch') {
      if (hanDispatchPickStage === 'to') {
        if (isHanRegion) {
          setHanHireResult('出兵省已固定为当前选中省，请点敌对/中立省作为目标');
          return;
        }
        if (hanDispatchFromKey && !isAdjacentAttack(hanDispatchFromKey, rawKey)) {
          setHanHireResult('出征失败：仅可攻击相邻省份');
          return;
        }
        setHanDispatchToKey(rawKey);
        setHanDispatchPickStage('config');
        setHanHireResult(`已选目标省：${region.label}，请确认兵力与将领`);
        return;
      }
      if (hanDispatchPickStage === 'config') {
        if (isHanRegion) {
          setHanHireResult('出兵省固定为已选省，若要更换请先退出出征并重新选省');
        } else {
          if (hanDispatchFromKey && !isAdjacentAttack(hanDispatchFromKey, rawKey)) {
            setHanHireResult('出征失败：仅可攻击相邻省份');
            return;
          }
          setHanDispatchToKey(rawKey);
          setHanHireResult(`改为目标省：${region.label}`);
        }
        return;
      }
    }
    if (weiOpMode === 'dispatch') {
      if (weiDispatchPickStage === 'to') {
        if (isWeiRegion) {
          setWeiHireResult('出兵省已固定为当前选中省，请点敌对/中立省作为目标');
          return;
        }
        if (weiDispatchFromKey && !isAdjacentAttack(weiDispatchFromKey, rawKey)) {
          setWeiHireResult('出征失败：仅可攻击相邻省份');
          return;
        }
        setWeiDispatchToKey(rawKey);
        setWeiDispatchPickStage('config');
        setWeiHireResult(`已选目标省：${region.label}，请确认兵力与将领`);
        return;
      }
      if (weiDispatchPickStage === 'config') {
        if (isWeiRegion) {
          setWeiHireResult('出兵省固定为已选省，若要更换请先退出出征并重新选省');
        } else {
          if (weiDispatchFromKey && !isAdjacentAttack(weiDispatchFromKey, rawKey)) {
            setWeiHireResult('出征失败：仅可攻击相邻省份');
            return;
          }
          setWeiDispatchToKey(rawKey);
          setWeiHireResult(`改为目标省：${region.label}`);
        }
        return;
      }
    }
    if (zhaoOpMode === 'dispatch') {
      if (zhaoDispatchPickStage === 'to') {
        if (isZhaoRegion) {
          setZhaoHireResult('出兵省已固定为当前选中省，请点敌对/中立省作为目标');
          return;
        }
        if (zhaoDispatchFromKey && !isAdjacentAttack(zhaoDispatchFromKey, rawKey)) {
          setZhaoHireResult('出征失败：仅可攻击相邻省份');
          return;
        }
        setZhaoDispatchToKey(rawKey);
        setZhaoDispatchPickStage('config');
        setZhaoHireResult(`已选目标省：${region.label}，请确认兵力与将领`);
        return;
      }
      if (zhaoDispatchPickStage === 'config') {
        if (isZhaoRegion) {
          setZhaoHireResult('出兵省固定为已选省，若要更换请先退出出征并重新选省');
        } else {
          if (zhaoDispatchFromKey && !isAdjacentAttack(zhaoDispatchFromKey, rawKey)) {
            setZhaoHireResult('出征失败：仅可攻击相邻省份');
            return;
          }
          setZhaoDispatchToKey(rawKey);
          setZhaoHireResult(`改为目标省：${region.label}`);
        }
        return;
      }
    }
    if (qiOpMode === 'dispatch') {
      if (qiDispatchPickStage === 'to') {
        if (isQiRegion) {
          setQiHireResult('出兵省已固定为当前选中省，请点敌对/中立省作为目标');
          return;
        }
        if (qiDispatchFromKey && !isAdjacentAttack(qiDispatchFromKey, rawKey)) {
          setQiHireResult('出征失败：仅可攻击相邻省份');
          return;
        }
        setQiDispatchToKey(rawKey);
        setQiDispatchPickStage('config');
        setQiHireResult(`已选目标省：${region.label}，请确认兵力与将领`);
        return;
      }
      if (qiDispatchPickStage === 'config') {
        if (isQiRegion) {
          setQiHireResult('出兵省固定为已选省，若要更换请先退出出征并重新选省');
        } else {
          if (qiDispatchFromKey && !isAdjacentAttack(qiDispatchFromKey, rawKey)) {
            setQiHireResult('出征失败：仅可攻击相邻省份');
            return;
          }
          setQiDispatchToKey(rawKey);
          setQiHireResult(`改为目标省：${region.label}`);
        }
        return;
      }
    }
    if (yanOpMode === 'dispatch') {
      if (yanDispatchPickStage === 'to') {
        if (isYanRegion) {
          setYanHireResult('出兵省已固定为当前选中省，请点敌对/中立省作为目标');
          return;
        }
        if (yanDispatchFromKey && !isAdjacentAttack(yanDispatchFromKey, rawKey)) {
          setYanHireResult('出征失败：仅可攻击相邻省份');
          return;
        }
        setYanDispatchToKey(rawKey);
        setYanDispatchPickStage('config');
        setYanHireResult(`已选目标省：${region.label}，请确认兵力与将领`);
        return;
      }
      if (yanDispatchPickStage === 'config') {
        if (isYanRegion) {
          setYanHireResult('出兵省固定为已选省，若要更换请先退出出征并重新选省');
        } else {
          if (yanDispatchFromKey && !isAdjacentAttack(yanDispatchFromKey, rawKey)) {
            setYanHireResult('出征失败：仅可攻击相邻省份');
            return;
          }
          setYanDispatchToKey(rawKey);
          setYanHireResult(`改为目标省：${region.label}`);
        }
        return;
      }
    }
    setSelectedNationId(null);
    setSelectedProvinceKey((prev) => (prev === rawKey ? null : rawKey));
  };
  const isAnyDispatchMode = qinOpMode === 'dispatch'
    || chuOpMode === 'dispatch'
    || hanOpMode === 'dispatch'
    || weiOpMode === 'dispatch'
    || zhaoOpMode === 'dispatch'
    || qiOpMode === 'dispatch'
    || yanOpMode === 'dispatch';
  const onNationNodeClick = (nationId: WarringStateId) => {
    if (isAnyDispatchMode) return;
    setSelectedProvinceKey(null);
    setSelectedNationId((prev) => (prev === nationId ? null : nationId));
  };
  const arrowColor = useMemo(() => {
    const sourceKey = selectedSources[0];
    if (!sourceKey || !hoverTargetKey) return '#2d86ff';
    const from = regionStateByKey[sourceKey];
    const to = regionStateByKey[hoverTargetKey];
    if (!from || !to) return '#2d86ff';
    if (hoverTargetKey === sourceKey) return '#2d86ff';
    return from.value >= to.value ? '#20b26b' : '#f29a2f';
  }, [selectedSources, hoverTargetKey, regionStateByKey]);
  const applyZoomAt = (targetZoom: number, anchorScreen: { x: number; y: number }) => {
    const nextZoom = clamp(targetZoom, cameraMinZoom, cameraMaxZoom);
    const prevScale = camera.scale;
    const nextScale = cameraBase.baseScale * nextZoom;
    const screenCenter = { x: VIEWBOX_W * 0.5, y: VIEWBOX_H * 0.53 };
    const wx = camera.worldCenter.x + (anchorScreen.x - screenCenter.x) / prevScale;
    const wy = camera.worldCenter.y + (anchorScreen.y - screenCenter.y) / prevScale;
    const nextCenter = {
      x: wx - (anchorScreen.x - screenCenter.x) / nextScale,
      y: wy - (anchorScreen.y - screenCenter.y) / nextScale
    };
    setZoom(nextZoom);
    setCameraCenterWorld(nextCenter);
  };
  const schedulePinchZoom = (targetZoom: number, anchorScreen: { x: number; y: number }) => {
    pinchPendingRef.current = { zoom: targetZoom, anchor: anchorScreen };
    if (pinchRafRef.current) return;
    pinchRafRef.current = window.requestAnimationFrame(() => {
      pinchRafRef.current = null;
      const pending = pinchPendingRef.current;
      pinchPendingRef.current = null;
      if (!pending) return;
      applyZoomAt(pending.zoom, pending.anchor);
    });
  };
  useEffect(() => {
    const stopKeyPanLoop = () => {
      if (keyPanRafRef.current) {
        window.cancelAnimationFrame(keyPanRafRef.current);
        keyPanRafRef.current = null;
      }
      keyPanLastTsRef.current = null;
    };
    const hasMoveKey = () => {
      const k = keyMoveRef.current;
      return k.w || k.a || k.s || k.d;
    };
    const tick = (ts: number) => {
      const prevTs = keyPanLastTsRef.current ?? ts;
      const dtMs = Math.min(34, ts - prevTs);
      keyPanLastTsRef.current = ts;
      const keys = keyMoveRef.current;
      let vx = 0;
      let vy = 0;
      if (keys.w) vy -= 1;
      if (keys.s) vy += 1;
      if (keys.a) vx -= 1;
      if (keys.d) vx += 1;
      if (vx === 0 && vy === 0) {
        stopKeyPanLoop();
        return;
      }
      const len = Math.hypot(vx, vy) || 1;
      vx /= len;
      vy /= len;
      const screenSpeedPerSec = keyboardPanSpeed;
      const worldStep = (screenSpeedPerSec / cameraRuntimeRef.current.scale) * (dtMs / 1000);
      setCameraCenterWorld((prev) => {
        const base = prev ?? cameraRuntimeRef.current.worldCenter;
        return {
          x: base.x + vx * worldStep,
          y: base.y + vy * worldStep
        };
      });
      keyPanRafRef.current = window.requestAnimationFrame(tick);
    };
    const startKeyPanLoop = () => {
      if (keyPanRafRef.current) return;
      keyPanLastTsRef.current = null;
      keyPanRafRef.current = window.requestAnimationFrame(tick);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key !== 'w' && key !== 'a' && key !== 's' && key !== 'd') return;
      e.preventDefault();
      keyMoveRef.current[key] = true;
      startKeyPanLoop();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key !== 'w' && key !== 'a' && key !== 's' && key !== 'd') return;
      keyMoveRef.current[key] = false;
      if (!hasMoveKey()) stopKeyPanLoop();
    };
    const onBlur = () => {
      keyMoveRef.current = { w: false, a: false, s: false, d: false };
      stopKeyPanLoop();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      stopKeyPanLoop();
    };
  }, [keyboardPanSpeed]);

  const handleBoardMove = (x: number, y: number) => {
    if (panActiveRef.current) {
      const last = panLastPointRef.current ?? { x, y };
      const dx = x - last.x;
      const dy = y - last.y;
      panLastPointRef.current = { x, y };
      setCameraCenterWorld((prev) => {
        const base = prev ?? camera.worldCenter;
        return { x: base.x - dx / camera.scale, y: base.y - dy / camera.scale };
      });
      return;
    }
    const world = { x: (x - camera.tx) / camera.scale, y: (y - camera.ty) / camera.scale };
    const prevPos = lastPointerPosRef.current;
    lastPointerPosRef.current = world;
    if (
      selectedSources.length > 0
      || (qinOpMode === 'dispatch' && qinDispatchPickStage === 'to')
      || (chuOpMode === 'dispatch' && chuDispatchPickStage === 'to')
      || (hanOpMode === 'dispatch' && hanDispatchPickStage === 'to')
      || (weiOpMode === 'dispatch' && weiDispatchPickStage === 'to')
      || (zhaoOpMode === 'dispatch' && zhaoDispatchPickStage === 'to')
      || (qiOpMode === 'dispatch' && qiDispatchPickStage === 'to')
      || (yanOpMode === 'dispatch' && yanDispatchPickStage === 'to')
    ) setAimPoint(world);

    const hovered = capitalDisplayNodes.reduce<{ key: string | null; dist: number }>(
      (best, node) => {
        const d = Math.hypot(world.x - node.x, world.y - node.y);
        if (d <= captureRadius * 1.35 && d < best.dist) return { key: node.id, dist: d };
        return best;
      },
      { key: null, dist: Number.POSITIVE_INFINITY }
    ).key;
    setHoverTargetKey(hovered);

    if (pointerDownRef.current && longPressActiveRef.current && prevPos) {
      const crossedBlue = capitalDisplayNodes
        .filter((node) => {
          const first = node.memberKeys[0];
          const state = regionStateByKey[first];
          if (!state || state.owner !== 'blue') return false;
          return pointToSegmentDistance({ x: node.x, y: node.y }, prevPos, world) <= captureRadius;
        })
        .map((node) => node.id);
      if (crossedBlue.length > 0) {
        setSelectedSources((prev) => {
          const next = new Set(prev);
          crossedBlue.forEach((key) => next.add(key));
          return Array.from(next);
        });
      }
    }
  };
  const recruitQinTroops = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (qinEconomy < economySpend) return;
    const qinCoreKey = regionKeyByAdm1['610000'];
    if (!qinCoreKey) return;
    const troopsGain = economySpend * qinInit.economyCosts.troopPerEconomy;
    setQinEconomy((prev) => prev - economySpend);
    setRegionStateByKey((prev) => {
      const current = prev[qinCoreKey] ?? { owner: 'blue' as Owner, value: 0 };
      return {
        ...prev,
        [qinCoreKey]: { ...current, owner: 'blue', value: current.value + troopsGain }
      };
    });
  };
  const hireQinGeneral = () => {
    const cost = qinInit.economyCosts.generalHireCost;
    if (qinEconomy < cost) {
      setQinHireResult(`经济不足，需 ${cost}`);
      return;
    }
    const availableProfiles = QIN_GENERAL_POOL
      .filter((name) => !qinGenerals.some((general) => general.name === name))
      .map((name) => ({ name, profile: QIN_GENERAL_PROFILE_BY_NAME[name] }))
      .filter((item): item is { name: string; profile: QinGeneralProfile } => Boolean(item.profile));
    if (availableProfiles.length <= 0) {
      setQinHireResult('将领池已抽空');
      return;
    }
    const totalWeight = availableProfiles.reduce((sum, item) => sum + QIN_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier], 0);
    let roll = Math.random() * totalWeight;
    let picked = availableProfiles[availableProfiles.length - 1];
    for (let i = 0; i < availableProfiles.length; i += 1) {
      const item = availableProfiles[i];
      roll -= QIN_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier];
      if (roll <= 0) {
        picked = item;
        break;
      }
    }
    const success = Math.random() < QIN_GENERAL_HIRE_SUCCESS_RATE;
    if (success) {
      const qinCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.qin.capitalAdm1] ?? null;
      setQinEconomy((prev) => prev - cost);
      setQinGenerals((prev) => [
        ...prev,
        {
          id: `qin-general-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: picked.name,
          status: 'idle',
          locationKey: qinCoreKey,
          tier: picked.profile.tier,
          command: picked.profile.command,
          strategy: picked.profile.strategy,
          logistics: picked.profile.logistics,
          mobility: picked.profile.mobility,
          recruitCost: cost,
          upkeepPerTurn: picked.profile.upkeepPerTurn,
          troopCap: QIN_GENERAL_TROOP_CAP_BY_TIER[picked.profile.tier],
          assignedTroops: 0
        }
      ]);
      setQinHireResult(`招募成功：${picked.name}（${picked.profile.tier}档）`);
      return;
    }
    const refund = Math.floor(cost * QIN_GENERAL_FAIL_REFUND_RATE);
    setQinEconomy((prev) => prev - cost + refund);
    setQinHireResult(`招募失败（${picked.profile.tier}档），返还 ${refund} 经济`);
  };
  const buyQinGrain = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (qinEconomy < economySpend) return;
    const grainGain = economySpend * qinInit.economyCosts.grainPerEconomy;
    setQinEconomy((prev) => prev - economySpend);
    setQinGrain((prev) => prev + grainGain);
  };
  const openQinDispatchPanel = () => {
    if (qinIdleGeneralCount <= 0) {
      setQinHireResult('无法出征：没有空闲将领');
      return;
    }
    if (qinGrain < 1) {
      setQinHireResult('无法出征：粮草不足');
      return;
    }
    if (qinProvinceOptions.length <= 0) {
      setQinHireResult('无法出征：暂无秦国可出发省');
      return;
    }
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'qin') {
      setQinHireResult('请先在地图选中一个秦国省作为出兵省');
      return;
    }
    const idleGeneral = qinGenerals.find(
      (general) => general.status === 'idle' && general.locationKey === selectedRegion.key && Math.floor(general.assignedTroops ?? 0) > 0
    );
    if (!idleGeneral) {
      setQinHireResult('无法出征：当前省没有已分配兵力的空闲将领');
      return;
    }
    setQinDispatchFromKey(selectedRegion.key);
    setQinDispatchToKey('');
    setQinDispatchGeneralId(idleGeneral?.id ?? '');
    setQinDispatchPickStage('to');
    setQinOpMode('dispatch');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setQinHireResult(`已锁定出兵省：${selectedRegion.label}，请在地图点击目标省`);
  };
  const openQinAssignPanel = () => {
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'qin') {
      setQinHireResult('请先在地图选中一个秦国省后再分配兵力');
      return;
    }
    const idleGeneral = qinGenerals.find((general) => general.status === 'idle' && general.locationKey === selectedRegion.key);
    setQinAssignProvinceKey(selectedRegion.key);
    setQinAssignGeneralId(idleGeneral?.id ?? '');
    setQinAssignTroops(Math.max(0, Math.floor(idleGeneral?.assignedTroops ?? 0)));
    setQinOpMode('assign');
    setQinHireResult(
      idleGeneral
        ? `已进入兵力分配：${selectedRegion.label}`
        : `已进入兵力分配：${selectedRegion.label}（该省暂无空闲将领）`
    );
  };
  const applyQinTroopAssignment = () => {
    if (!qinAssignProvinceKey) {
      setQinHireResult('分配失败：请先选择省份');
      return;
    }
    const province = regionsByKey[qinAssignProvinceKey];
    if (!province || WARRING_TERRITORY_BY_ADM1[province.adm1] !== 'qin') {
      setQinHireResult('分配失败：仅可在秦国省分配');
      return;
    }
    const general = qinGenerals.find((item) => item.id === qinAssignGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== qinAssignProvinceKey) {
      setQinHireResult('分配失败：请选择该省空闲将领');
      return;
    }
    const nextAssigned = Math.max(0, Math.min(Math.floor(qinAssignTroops), qinAssignMaxTroops));
    setQinGenerals((prev) => prev.map((item) => (
      item.id === general.id ? { ...item, assignedTroops: nextAssigned } : item
    )));
    setQinHireResult(`分配完成：${general.name} 统领 ${nextAssigned}/${qinAssignGeneralCap} 兵`);
  };
  const confirmQinDispatch = () => {
    if (qinDispatchPickStage !== 'config') {
      setQinHireResult('请先在地图完成出发省与目标省点选');
      return;
    }
    const fromKey = qinDispatchFromKey;
    const toKey = qinDispatchToKey;
    if (!fromKey || !toKey) {
      setQinHireResult('出征失败：请选择出发省和目标省');
      return;
    }
    const fromRegion = regionsByKey[fromKey];
    const toRegion = regionsByKey[toKey];
    if (!fromRegion || !toRegion) {
      setQinHireResult('出征失败：省份无效');
      return;
    }
    if (WARRING_TERRITORY_BY_ADM1[fromRegion.adm1] !== 'qin' || WARRING_TERRITORY_BY_ADM1[toRegion.adm1] === 'qin') {
      setQinHireResult('出征失败：请从秦地出发并选择非秦目标');
      return;
    }
    if (!isAdjacentAttack(fromKey, toKey)) {
      setQinHireResult('出征失败：仅可攻击相邻省份');
      return;
    }
    const general = qinGenerals.find((item) => item.id === qinDispatchGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== fromKey) {
      setQinHireResult('出征失败：请选择空闲将领');
      return;
    }
    const troops = Math.max(0, Math.floor(general.assignedTroops ?? 0));
    if (troops <= 0) {
      setQinHireResult('出征失败：该将领未分配兵力');
      return;
    }
    const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
    if (fromTroops < troops) {
      setQinHireResult(`出征失败：该省兵力不足（需${troops}，现有${fromTroops}）`);
      return;
    }
    if (Math.floor(qinGrain) < troops) {
      setQinHireResult(`出征失败：粮草不足（需${troops}，现有${Math.floor(qinGrain)}）`);
      return;
    }
    const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
    const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
    if (!fromAnchor || !toAnchor) {
      setQinHireResult('出征失败：路径锚点缺失');
      return;
    }

    setQinGrain((prev) => prev - troops);
    setQinGenerals((prev) => prev.map((item) => (
      item.id === general.id
        ? { ...item, status: 'marching', locationKey: null, assignedTroops: Math.max(0, Math.floor(item.assignedTroops ?? 0) - troops) }
        : item
    )));
    triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
    const baseNow = performance.now();
    const perColumn = troops < 3 ? troops : 5;
    const groupId = `${baseNow}-${fromKey}-${toKey}-${general.id}`;
    const created: Dispatch[] = [];
    for (let i = 0; i < troops; i += 1) {
      const row = i % perColumn;
      const col = Math.floor(i / perColumn);
      const rowsInColumn = Math.min(perColumn, troops - col * perColumn);
      const centeredRow = row - (rowsInColumn - 1) / 2;
      const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
      const laneBias = centeredRow / laneBiasDivisor;
      const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
      created.push({
        id: `${baseNow}-${fromKey}-${toKey}-${i}`,
        groupId,
        fromKey,
        toKey,
        factionId: 'qin',
        commanderName: general.name,
        fromPos: { x: fromAnchor.x, y: fromAnchor.y },
        toPos: { x: toAnchor.x, y: toAnchor.y },
        owner: 'blue',
        row,
        col,
        rowsInColumn,
        laneBias,
        columnStagger,
        startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
        travelMs: FLIGHT_MS
      });
    }
    const maxCol = Math.max(0, Math.ceil(troops / perColumn) - 1);
    const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
    const timerId = window.setTimeout(() => {
      const targetRegion = regionsByKey[toKey];
      const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === 'qin'
        ? toKey
        : fromKey;
      setQinGenerals((prev) => prev.map((item) => (
        item.id === general.id ? { ...item, status: 'idle', locationKey: returnKey } : item
      )));
    }, releaseInMs);
    generalReturnTimersRef.current.push(timerId);

    setDispatches((prev) => [...prev, ...created]);
    setQinHireResult(`出征成功：${general.name} 率 ${troops} 兵，耗粮 ${troops}`);
    setQinOpMode('ops');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    flashOpButton('dispatchConfirm');
  };
  const recruitChuTroops = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (chuEconomy < economySpend) return;
    const chuCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.chu.capitalAdm1];
    if (!chuCoreKey) return;
    const troopsGain = economySpend * chuInit.economyCosts.troopPerEconomy;
    setChuEconomy((prev) => prev - economySpend);
    setRegionStateByKey((prev) => {
      const current = prev[chuCoreKey] ?? { owner: 'red' as Owner, value: 0 };
      return {
        ...prev,
        [chuCoreKey]: { ...current, owner: 'red', value: current.value + troopsGain }
      };
    });
  };
  const hireChuGeneral = () => {
    const cost = chuInit.economyCosts.generalHireCost;
    if (chuEconomy < cost) {
      setChuHireResult(`经济不足，需 ${cost}`);
      return;
    }
    const available = CHU_GENERAL_POOL.filter((name) => !chuGenerals.some((general) => general.name === name));
    if (available.length <= 0) {
      setChuHireResult('将领池已抽空');
      return;
    }
    const availableProfiles = available.map((name) => ({
      name,
      profile: CHU_GENERAL_PROFILE_BY_NAME[name] ?? { tier: 'C' as GeneralTier, command: 70, strategy: 70, logistics: 70, mobility: 70, recruitCost: cost, upkeepPerTurn: 16 }
    }));
    const totalWeight = availableProfiles.reduce((sum, item) => sum + CHU_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier], 0);
    let roll = Math.random() * totalWeight;
    let picked = availableProfiles[availableProfiles.length - 1];
    for (const item of availableProfiles) {
      roll -= CHU_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier];
      if (roll <= 0) {
        picked = item;
        break;
      }
    }
    const success = Math.random() < CHU_GENERAL_HIRE_SUCCESS_RATE;
    if (success) {
      const chuCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.chu.capitalAdm1] ?? null;
      setChuEconomy((prev) => prev - cost);
      setChuGenerals((prev) => [
        ...prev,
        {
          id: `chu-general-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: picked.name,
          status: 'idle',
          locationKey: chuCoreKey,
          tier: picked.profile.tier,
          command: picked.profile.command,
          strategy: picked.profile.strategy,
          logistics: picked.profile.logistics,
          mobility: picked.profile.mobility,
          recruitCost: cost,
          upkeepPerTurn: picked.profile.upkeepPerTurn,
          troopCap: CHU_GENERAL_TROOP_CAP_BY_TIER[picked.profile.tier],
          assignedTroops: 0
        }
      ]);
      setChuHireResult(`招募成功：${picked.name}（${picked.profile.tier}档）`);
      return;
    }
    const refund = Math.floor(cost * CHU_GENERAL_FAIL_REFUND_RATE);
    setChuEconomy((prev) => prev - cost + refund);
    setChuHireResult(`招募失败（${picked.profile.tier}档），返还 ${refund} 经济`);
  };
  const buyChuGrain = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (chuEconomy < economySpend) return;
    const grainGain = economySpend * chuInit.economyCosts.grainPerEconomy;
    setChuEconomy((prev) => prev - economySpend);
    setChuGrain((prev) => prev + grainGain);
  };
  const openChuDispatchPanel = () => {
    if (chuIdleGeneralCount <= 0) {
      setChuHireResult('无法出征：没有空闲将领');
      return;
    }
    if (chuGrain < 1) {
      setChuHireResult('无法出征：粮草不足');
      return;
    }
    if (chuProvinceOptions.length <= 0) {
      setChuHireResult('无法出征：暂无楚国可出发省');
      return;
    }
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'chu') {
      setChuHireResult('请先在地图选中一个楚国省作为出兵省');
      return;
    }
    const idleGeneralWithTroops = chuGenerals.find(
      (general) => general.status === 'idle' && general.locationKey === selectedRegion.key && Math.floor(general.assignedTroops ?? 0) > 0
    );
    if (!idleGeneralWithTroops) {
      setChuHireResult('无法出征：当前省没有已分配兵力的空闲将领');
      return;
    }
    setChuDispatchFromKey(selectedRegion.key);
    setChuDispatchToKey('');
    setChuDispatchGeneralId(idleGeneralWithTroops?.id ?? '');
    setChuDispatchPickStage('to');
    setChuOpMode('dispatch');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setChuHireResult(`已锁定出兵省：${selectedRegion.label}，请在地图点击目标省`);
  };
  const openChuAssignPanel = () => {
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'chu') {
      setChuHireResult('请先在地图选中一个楚国省后再分配兵力');
      return;
    }
    const idleGeneral = chuGenerals.find((general) => general.status === 'idle' && general.locationKey === selectedRegion.key);
    setChuAssignProvinceKey(selectedRegion.key);
    setChuAssignGeneralId(idleGeneral?.id ?? '');
    setChuAssignTroops(Math.max(0, Math.floor(idleGeneral?.assignedTroops ?? 0)));
    setChuOpMode('assign');
    setChuHireResult(
      idleGeneral
        ? `已进入兵力分配：${selectedRegion.label}`
        : `已进入兵力分配：${selectedRegion.label}（该省暂无空闲将领）`
    );
  };
  const applyChuTroopAssignment = () => {
    if (!chuAssignProvinceKey) {
      setChuHireResult('分配失败：请先选择省份');
      return;
    }
    const province = regionsByKey[chuAssignProvinceKey];
    if (!province || WARRING_TERRITORY_BY_ADM1[province.adm1] !== 'chu') {
      setChuHireResult('分配失败：仅可在楚国省分配');
      return;
    }
    const general = chuGenerals.find((item) => item.id === chuAssignGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== chuAssignProvinceKey) {
      setChuHireResult('分配失败：请选择该省空闲将领');
      return;
    }
    const nextAssigned = Math.max(0, Math.min(Math.floor(chuAssignTroops), chuAssignMaxTroops));
    setChuGenerals((prev) => prev.map((item) => (
      item.id === general.id ? { ...item, assignedTroops: nextAssigned } : item
    )));
    setChuHireResult(`分配完成：${general.name} 统领 ${nextAssigned}/${chuAssignGeneralCap} 兵`);
  };
  const confirmChuDispatch = () => {
    if (chuDispatchPickStage !== 'config') {
      setChuHireResult('请先在地图完成出发省与目标省点选');
      return;
    }
    const fromKey = chuDispatchFromKey;
    const toKey = chuDispatchToKey;
    if (!fromKey || !toKey) {
      setChuHireResult('出征失败：请选择出发省和目标省');
      return;
    }
    const fromRegion = regionsByKey[fromKey];
    const toRegion = regionsByKey[toKey];
    if (!fromRegion || !toRegion) {
      setChuHireResult('出征失败：省份无效');
      return;
    }
    if (WARRING_TERRITORY_BY_ADM1[fromRegion.adm1] !== 'chu' || WARRING_TERRITORY_BY_ADM1[toRegion.adm1] === 'chu') {
      setChuHireResult('出征失败：请从楚地出发并选择非楚目标');
      return;
    }
    if (!isAdjacentAttack(fromKey, toKey)) {
      setChuHireResult('出征失败：仅可攻击相邻省份');
      return;
    }
    const general = chuGenerals.find((item) => item.id === chuDispatchGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== fromKey) {
      setChuHireResult('出征失败：请选择空闲将领');
      return;
    }
    const troops = Math.max(0, Math.floor(general.assignedTroops ?? 0));
    if (troops <= 0) {
      setChuHireResult('出征失败：该将领未分配兵力');
      return;
    }
    const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
    if (fromTroops < troops) {
      setChuHireResult(`出征失败：该省兵力不足（需${troops}，现有${fromTroops}）`);
      return;
    }
    if (Math.floor(chuGrain) < troops) {
      setChuHireResult(`出征失败：粮草不足（需${troops}，现有${Math.floor(chuGrain)}）`);
      return;
    }
    const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
    const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
    if (!fromAnchor || !toAnchor) {
      setChuHireResult('出征失败：路径锚点缺失');
      return;
    }

    setChuGrain((prev) => prev - troops);
    setChuGenerals((prev) => prev.map((item) => (
      item.id === general.id
        ? { ...item, status: 'marching', locationKey: null, assignedTroops: Math.max(0, Math.floor(item.assignedTroops ?? 0) - troops) }
        : item
    )));
    triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
    const baseNow = performance.now();
    const perColumn = troops < 3 ? troops : 5;
    const groupId = `${baseNow}-${fromKey}-${toKey}-${general.id}`;
    const created: Dispatch[] = [];
    for (let i = 0; i < troops; i += 1) {
      const row = i % perColumn;
      const col = Math.floor(i / perColumn);
      const rowsInColumn = Math.min(perColumn, troops - col * perColumn);
      const centeredRow = row - (rowsInColumn - 1) / 2;
      const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
      const laneBias = centeredRow / laneBiasDivisor;
      const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
      created.push({
        id: `${baseNow}-${fromKey}-${toKey}-${i}`,
        groupId,
        fromKey,
        toKey,
        factionId: 'chu',
        commanderName: general.name,
        fromPos: { x: fromAnchor.x, y: fromAnchor.y },
        toPos: { x: toAnchor.x, y: toAnchor.y },
        owner: 'red',
        row,
        col,
        rowsInColumn,
        laneBias,
        columnStagger,
        startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
        travelMs: FLIGHT_MS
      });
    }
    const maxCol = Math.max(0, Math.ceil(troops / perColumn) - 1);
    const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
    const timerId = window.setTimeout(() => {
      const targetRegion = regionsByKey[toKey];
      const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === 'chu'
        ? toKey
        : fromKey;
      setChuGenerals((prev) => prev.map((item) => (
        item.id === general.id ? { ...item, status: 'idle', locationKey: returnKey } : item
      )));
    }, releaseInMs);
    generalReturnTimersRef.current.push(timerId);

    setDispatches((prev) => [...prev, ...created]);
    setChuHireResult(`出征成功：${general.name} 率 ${troops} 兵，耗粮 ${troops}`);
    setChuOpMode('ops');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    flashOpButton('dispatchConfirm');
  };
  const recruitHanTroops = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (hanEconomy < economySpend) return;
    const hanCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.han.capitalAdm1];
    if (!hanCoreKey) return;
    const troopsGain = economySpend * hanInit.economyCosts.troopPerEconomy;
    setHanEconomy((prev) => prev - economySpend);
    setRegionStateByKey((prev) => {
      const current = prev[hanCoreKey] ?? { owner: 'red' as Owner, value: 0 };
      return {
        ...prev,
        [hanCoreKey]: { ...current, owner: 'red', value: current.value + troopsGain }
      };
    });
  };
  const hireHanGeneral = () => {
    const cost = hanInit.economyCosts.generalHireCost;
    if (hanEconomy < cost) {
      setHanHireResult(`经济不足，需 ${cost}`);
      return;
    }
    const available = HAN_GENERAL_POOL.filter((name) => !hanGenerals.some((general) => general.name === name));
    if (available.length <= 0) {
      setHanHireResult('将领池已抽空');
      return;
    }
    const availableProfiles = available.map((name) => ({
      name,
      profile: HAN_GENERAL_PROFILE_BY_NAME[name] ?? { tier: 'C' as GeneralTier, command: 70, strategy: 70, logistics: 70, mobility: 70, recruitCost: cost, upkeepPerTurn: 16 }
    }));
    const totalWeight = availableProfiles.reduce((sum, item) => sum + HAN_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier], 0);
    let roll = Math.random() * totalWeight;
    let picked = availableProfiles[availableProfiles.length - 1];
    for (const item of availableProfiles) {
      roll -= HAN_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier];
      if (roll <= 0) {
        picked = item;
        break;
      }
    }
    const success = Math.random() < HAN_GENERAL_HIRE_SUCCESS_RATE;
    if (success) {
      const hanCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.han.capitalAdm1] ?? null;
      setHanEconomy((prev) => prev - cost);
      setHanGenerals((prev) => [
        ...prev,
        {
          id: `han-general-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: picked.name,
          status: 'idle',
          locationKey: hanCoreKey,
          tier: picked.profile.tier,
          command: picked.profile.command,
          strategy: picked.profile.strategy,
          logistics: picked.profile.logistics,
          mobility: picked.profile.mobility,
          recruitCost: cost,
          upkeepPerTurn: picked.profile.upkeepPerTurn,
          troopCap: HAN_GENERAL_TROOP_CAP_BY_TIER[picked.profile.tier],
          assignedTroops: 0
        }
      ]);
      setHanHireResult(`招募成功：${picked.name}（${picked.profile.tier}档）`);
      return;
    }
    const refund = Math.floor(cost * HAN_GENERAL_FAIL_REFUND_RATE);
    setHanEconomy((prev) => prev - cost + refund);
    setHanHireResult(`招募失败（${picked.profile.tier}档），返还 ${refund} 经济`);
  };
  const buyHanGrain = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (hanEconomy < economySpend) return;
    const grainGain = economySpend * hanInit.economyCosts.grainPerEconomy;
    setHanEconomy((prev) => prev - economySpend);
    setHanGrain((prev) => prev + grainGain);
  };
  const openHanDispatchPanel = () => {
    if (hanIdleGeneralCount <= 0) {
      setHanHireResult('无法出征：没有空闲将领');
      return;
    }
    if (hanGrain < 1) {
      setHanHireResult('无法出征：粮草不足');
      return;
    }
    if (hanProvinceOptions.length <= 0) {
      setHanHireResult('无法出征：暂无韩国可出发省');
      return;
    }
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'han') {
      setHanHireResult('请先在地图选中一个韩国省作为出兵省');
      return;
    }
    const idleGeneralWithTroops = hanGenerals.find(
      (general) => general.status === 'idle' && general.locationKey === selectedRegion.key && Math.floor(general.assignedTroops ?? 0) > 0
    );
    if (!idleGeneralWithTroops) {
      setHanHireResult('无法出征：当前省没有已分配兵力的空闲将领');
      return;
    }
    setHanDispatchFromKey(selectedRegion.key);
    setHanDispatchToKey('');
    setHanDispatchGeneralId(idleGeneralWithTroops?.id ?? '');
    setHanDispatchPickStage('to');
    setHanOpMode('dispatch');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setHanHireResult(`已锁定出兵省：${selectedRegion.label}，请在地图点击目标省`);
  };
  const openHanAssignPanel = () => {
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'han') {
      setHanHireResult('请先在地图选中一个韩国省后再分配兵力');
      return;
    }
    const idleGeneral = hanGenerals.find((general) => general.status === 'idle' && general.locationKey === selectedRegion.key);
    setHanAssignProvinceKey(selectedRegion.key);
    setHanAssignGeneralId(idleGeneral?.id ?? '');
    setHanAssignTroops(Math.max(0, Math.floor(idleGeneral?.assignedTroops ?? 0)));
    setHanOpMode('assign');
    setHanHireResult(
      idleGeneral
        ? `已进入兵力分配：${selectedRegion.label}`
        : `已进入兵力分配：${selectedRegion.label}（该省暂无空闲将领）`
    );
  };
  const applyHanTroopAssignment = () => {
    if (!hanAssignProvinceKey) {
      setHanHireResult('分配失败：请先选择省份');
      return;
    }
    const province = regionsByKey[hanAssignProvinceKey];
    if (!province || WARRING_TERRITORY_BY_ADM1[province.adm1] !== 'han') {
      setHanHireResult('分配失败：仅可在韩国省分配');
      return;
    }
    const general = hanGenerals.find((item) => item.id === hanAssignGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== hanAssignProvinceKey) {
      setHanHireResult('分配失败：请选择该省空闲将领');
      return;
    }
    const nextAssigned = Math.max(0, Math.min(Math.floor(hanAssignTroops), hanAssignMaxTroops));
    setHanGenerals((prev) => prev.map((item) => (
      item.id === general.id ? { ...item, assignedTroops: nextAssigned } : item
    )));
    setHanHireResult(`分配完成：${general.name} 统领 ${nextAssigned}/${hanAssignGeneralCap} 兵`);
  };
  const confirmHanDispatch = () => {
    if (hanDispatchPickStage !== 'config') {
      setHanHireResult('请先在地图完成出发省与目标省点选');
      return;
    }
    const fromKey = hanDispatchFromKey;
    const toKey = hanDispatchToKey;
    if (!fromKey || !toKey) {
      setHanHireResult('出征失败：请选择出发省和目标省');
      return;
    }
    const fromRegion = regionsByKey[fromKey];
    const toRegion = regionsByKey[toKey];
    if (!fromRegion || !toRegion) {
      setHanHireResult('出征失败：省份无效');
      return;
    }
    if (WARRING_TERRITORY_BY_ADM1[fromRegion.adm1] !== 'han' || WARRING_TERRITORY_BY_ADM1[toRegion.adm1] === 'han') {
      setHanHireResult('出征失败：请从韩地出发并选择非韩目标');
      return;
    }
    if (!isAdjacentAttack(fromKey, toKey)) {
      setHanHireResult('出征失败：仅可攻击相邻省份');
      return;
    }
    const general = hanGenerals.find((item) => item.id === hanDispatchGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== fromKey) {
      setHanHireResult('出征失败：请选择空闲将领');
      return;
    }
    const troops = Math.max(0, Math.floor(general.assignedTroops ?? 0));
    if (troops <= 0) {
      setHanHireResult('出征失败：该将领未分配兵力');
      return;
    }
    const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
    if (fromTroops < troops) {
      setHanHireResult(`出征失败：该省兵力不足（需${troops}，现有${fromTroops}）`);
      return;
    }
    if (Math.floor(hanGrain) < troops) {
      setHanHireResult(`出征失败：粮草不足（需${troops}，现有${Math.floor(hanGrain)}）`);
      return;
    }
    const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
    const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
    if (!fromAnchor || !toAnchor) {
      setHanHireResult('出征失败：路径锚点缺失');
      return;
    }

    setHanGrain((prev) => prev - troops);
    setHanGenerals((prev) => prev.map((item) => (
      item.id === general.id
        ? { ...item, status: 'marching', locationKey: null, assignedTroops: Math.max(0, Math.floor(item.assignedTroops ?? 0) - troops) }
        : item
    )));
    triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
    const baseNow = performance.now();
    const perColumn = troops < 3 ? troops : 5;
    const groupId = `${baseNow}-${fromKey}-${toKey}-${general.id}`;
    const created: Dispatch[] = [];
    for (let i = 0; i < troops; i += 1) {
      const row = i % perColumn;
      const col = Math.floor(i / perColumn);
      const rowsInColumn = Math.min(perColumn, troops - col * perColumn);
      const centeredRow = row - (rowsInColumn - 1) / 2;
      const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
      const laneBias = centeredRow / laneBiasDivisor;
      const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
      created.push({
        id: `${baseNow}-${fromKey}-${toKey}-${i}`,
        groupId,
        fromKey,
        toKey,
        factionId: 'han',
        commanderName: general.name,
        fromPos: { x: fromAnchor.x, y: fromAnchor.y },
        toPos: { x: toAnchor.x, y: toAnchor.y },
        owner: 'red',
        row,
        col,
        rowsInColumn,
        laneBias,
        columnStagger,
        startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
        travelMs: FLIGHT_MS
      });
    }
    const maxCol = Math.max(0, Math.ceil(troops / perColumn) - 1);
    const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
    const timerId = window.setTimeout(() => {
      const targetRegion = regionsByKey[toKey];
      const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === 'han'
        ? toKey
        : fromKey;
      setHanGenerals((prev) => prev.map((item) => (
        item.id === general.id ? { ...item, status: 'idle', locationKey: returnKey } : item
      )));
    }, releaseInMs);
    generalReturnTimersRef.current.push(timerId);

    setDispatches((prev) => [...prev, ...created]);
    setHanHireResult(`出征成功：${general.name} 率 ${troops} 兵，耗粮 ${troops}`);
    setHanOpMode('ops');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    flashOpButton('dispatchConfirm');
  };
  const recruitWeiTroops = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (weiEconomy < economySpend) return;
    const weiCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.wei.capitalAdm1];
    if (!weiCoreKey) return;
    const troopsGain = economySpend * weiInit.economyCosts.troopPerEconomy;
    setWeiEconomy((prev) => prev - economySpend);
    setRegionStateByKey((prev) => {
      const current = prev[weiCoreKey] ?? { owner: 'red' as Owner, value: 0 };
      return {
        ...prev,
        [weiCoreKey]: { ...current, owner: 'red', value: current.value + troopsGain }
      };
    });
  };
  const hireWeiGeneral = () => {
    const cost = weiInit.economyCosts.generalHireCost;
    if (weiEconomy < cost) {
      setWeiHireResult(`经济不足，需 ${cost}`);
      return;
    }
    const available = WEI_GENERAL_POOL.filter((name) => !weiGenerals.some((general) => general.name === name));
    if (available.length <= 0) {
      setWeiHireResult('将领池已抽空');
      return;
    }
    const availableProfiles = available.map((name) => ({
      name,
      profile: WEI_GENERAL_PROFILE_BY_NAME[name] ?? { tier: 'C' as GeneralTier, command: 70, strategy: 70, logistics: 70, mobility: 70, recruitCost: cost, upkeepPerTurn: 16 }
    }));
    const totalWeight = availableProfiles.reduce((sum, item) => sum + WEI_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier], 0);
    let roll = Math.random() * totalWeight;
    let picked = availableProfiles[availableProfiles.length - 1];
    for (const item of availableProfiles) {
      roll -= WEI_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier];
      if (roll <= 0) {
        picked = item;
        break;
      }
    }
    const success = Math.random() < WEI_GENERAL_HIRE_SUCCESS_RATE;
    if (success) {
      const weiCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.wei.capitalAdm1] ?? null;
      setWeiEconomy((prev) => prev - cost);
      setWeiGenerals((prev) => [
        ...prev,
        {
          id: `wei-general-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: picked.name,
          status: 'idle',
          locationKey: weiCoreKey,
          tier: picked.profile.tier,
          command: picked.profile.command,
          strategy: picked.profile.strategy,
          logistics: picked.profile.logistics,
          mobility: picked.profile.mobility,
          recruitCost: cost,
          upkeepPerTurn: picked.profile.upkeepPerTurn,
          troopCap: WEI_GENERAL_TROOP_CAP_BY_TIER[picked.profile.tier],
          assignedTroops: 0
        }
      ]);
      setWeiHireResult(`招募成功：${picked.name}（${picked.profile.tier}档）`);
      return;
    }
    const refund = Math.floor(cost * WEI_GENERAL_FAIL_REFUND_RATE);
    setWeiEconomy((prev) => prev - cost + refund);
    setWeiHireResult(`招募失败（${picked.profile.tier}档），返还 ${refund} 经济`);
  };
  const buyWeiGrain = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (weiEconomy < economySpend) return;
    const grainGain = economySpend * weiInit.economyCosts.grainPerEconomy;
    setWeiEconomy((prev) => prev - economySpend);
    setWeiGrain((prev) => prev + grainGain);
  };
  const openWeiDispatchPanel = () => {
    if (weiIdleGeneralCount <= 0) {
      setWeiHireResult('无法出征：没有空闲将领');
      return;
    }
    if (weiGrain < 1) {
      setWeiHireResult('无法出征：粮草不足');
      return;
    }
    if (weiProvinceOptions.length <= 0) {
      setWeiHireResult('无法出征：暂无魏国可出发省');
      return;
    }
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'wei') {
      setWeiHireResult('请先在地图选中一个魏国省作为出兵省');
      return;
    }
    const idleGeneralWithTroops = weiGenerals.find(
      (general) => general.status === 'idle' && general.locationKey === selectedRegion.key && Math.floor(general.assignedTroops ?? 0) > 0
    );
    if (!idleGeneralWithTroops) {
      setWeiHireResult('无法出征：当前省没有已分配兵力的空闲将领');
      return;
    }
    setWeiDispatchFromKey(selectedRegion.key);
    setWeiDispatchToKey('');
    setWeiDispatchGeneralId(idleGeneralWithTroops?.id ?? '');
    setWeiDispatchPickStage('to');
    setWeiOpMode('dispatch');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setWeiHireResult(`已锁定出兵省：${selectedRegion.label}，请在地图点击目标省`);
  };
  const openWeiAssignPanel = () => {
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'wei') {
      setWeiHireResult('请先在地图选中一个魏国省后再分配兵力');
      return;
    }
    const idleGeneral = weiGenerals.find((general) => general.status === 'idle' && general.locationKey === selectedRegion.key);
    setWeiAssignProvinceKey(selectedRegion.key);
    setWeiAssignGeneralId(idleGeneral?.id ?? '');
    setWeiAssignTroops(Math.max(0, Math.floor(idleGeneral?.assignedTroops ?? 0)));
    setWeiOpMode('assign');
    setWeiHireResult(
      idleGeneral
        ? `已进入兵力分配：${selectedRegion.label}`
        : `已进入兵力分配：${selectedRegion.label}（该省暂无空闲将领）`
    );
  };
  const applyWeiTroopAssignment = () => {
    if (!weiAssignProvinceKey) {
      setWeiHireResult('分配失败：请先选择省份');
      return;
    }
    const province = regionsByKey[weiAssignProvinceKey];
    if (!province || WARRING_TERRITORY_BY_ADM1[province.adm1] !== 'wei') {
      setWeiHireResult('分配失败：仅可在魏国省分配');
      return;
    }
    const general = weiGenerals.find((item) => item.id === weiAssignGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== weiAssignProvinceKey) {
      setWeiHireResult('分配失败：请选择该省空闲将领');
      return;
    }
    const nextAssigned = Math.max(0, Math.min(Math.floor(weiAssignTroops), weiAssignMaxTroops));
    setWeiGenerals((prev) => prev.map((item) => (
      item.id === general.id ? { ...item, assignedTroops: nextAssigned } : item
    )));
    setWeiHireResult(`分配完成：${general.name} 统领 ${nextAssigned}/${weiAssignGeneralCap} 兵`);
  };
  const confirmWeiDispatch = () => {
    if (weiDispatchPickStage !== 'config') {
      setWeiHireResult('请先在地图完成出发省与目标省点选');
      return;
    }
    const fromKey = weiDispatchFromKey;
    const toKey = weiDispatchToKey;
    if (!fromKey || !toKey) {
      setWeiHireResult('出征失败：请选择出发省和目标省');
      return;
    }
    const fromRegion = regionsByKey[fromKey];
    const toRegion = regionsByKey[toKey];
    if (!fromRegion || !toRegion) {
      setWeiHireResult('出征失败：省份无效');
      return;
    }
    if (WARRING_TERRITORY_BY_ADM1[fromRegion.adm1] !== 'wei' || WARRING_TERRITORY_BY_ADM1[toRegion.adm1] === 'wei') {
      setWeiHireResult('出征失败：请从魏地出发并选择非魏目标');
      return;
    }
    if (!isAdjacentAttack(fromKey, toKey)) {
      setWeiHireResult('出征失败：仅可攻击相邻省份');
      return;
    }
    const general = weiGenerals.find((item) => item.id === weiDispatchGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== fromKey) {
      setWeiHireResult('出征失败：请选择空闲将领');
      return;
    }
    const troops = Math.max(0, Math.floor(general.assignedTroops ?? 0));
    if (troops <= 0) {
      setWeiHireResult('出征失败：该将领未分配兵力');
      return;
    }
    const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
    if (fromTroops < troops) {
      setWeiHireResult(`出征失败：该省兵力不足（需${troops}，现有${fromTroops}）`);
      return;
    }
    if (Math.floor(weiGrain) < troops) {
      setWeiHireResult(`出征失败：粮草不足（需${troops}，现有${Math.floor(weiGrain)}）`);
      return;
    }
    const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
    const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
    if (!fromAnchor || !toAnchor) {
      setWeiHireResult('出征失败：路径锚点缺失');
      return;
    }

    setWeiGrain((prev) => prev - troops);
    setWeiGenerals((prev) => prev.map((item) => (
      item.id === general.id
        ? { ...item, status: 'marching', locationKey: null, assignedTroops: Math.max(0, Math.floor(item.assignedTroops ?? 0) - troops) }
        : item
    )));
    triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
    const baseNow = performance.now();
    const perColumn = troops < 3 ? troops : 5;
    const groupId = `${baseNow}-${fromKey}-${toKey}-${general.id}`;
    const created: Dispatch[] = [];
    for (let i = 0; i < troops; i += 1) {
      const row = i % perColumn;
      const col = Math.floor(i / perColumn);
      const rowsInColumn = Math.min(perColumn, troops - col * perColumn);
      const centeredRow = row - (rowsInColumn - 1) / 2;
      const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
      const laneBias = centeredRow / laneBiasDivisor;
      const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
      created.push({
        id: `${baseNow}-${fromKey}-${toKey}-${i}`,
        groupId,
        fromKey,
        toKey,
        factionId: 'wei',
        commanderName: general.name,
        fromPos: { x: fromAnchor.x, y: fromAnchor.y },
        toPos: { x: toAnchor.x, y: toAnchor.y },
        owner: 'red',
        row,
        col,
        rowsInColumn,
        laneBias,
        columnStagger,
        startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
        travelMs: FLIGHT_MS
      });
    }
    const maxCol = Math.max(0, Math.ceil(troops / perColumn) - 1);
    const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
    const timerId = window.setTimeout(() => {
      const targetRegion = regionsByKey[toKey];
      const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === 'wei'
        ? toKey
        : fromKey;
      setWeiGenerals((prev) => prev.map((item) => (
        item.id === general.id ? { ...item, status: 'idle', locationKey: returnKey } : item
      )));
    }, releaseInMs);
    generalReturnTimersRef.current.push(timerId);

    setDispatches((prev) => [...prev, ...created]);
    setWeiHireResult(`出征成功：${general.name} 率 ${troops} 兵，耗粮 ${troops}`);
    setWeiOpMode('ops');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    flashOpButton('dispatchConfirm');
  };
  const recruitZhaoTroops = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (zhaoEconomy < economySpend) return;
    const zhaoCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.zhao.capitalAdm1];
    if (!zhaoCoreKey) return;
    const troopsGain = economySpend * zhaoInit.economyCosts.troopPerEconomy;
    setZhaoEconomy((prev) => prev - economySpend);
    setRegionStateByKey((prev) => {
      const current = prev[zhaoCoreKey] ?? { owner: 'red' as Owner, value: 0 };
      return {
        ...prev,
        [zhaoCoreKey]: { ...current, owner: 'red', value: current.value + troopsGain }
      };
    });
  };
  const hireZhaoGeneral = () => {
    const cost = zhaoInit.economyCosts.generalHireCost;
    if (zhaoEconomy < cost) {
      setZhaoHireResult(`经济不足，需 ${cost}`);
      return;
    }
    const available = ZHAO_GENERAL_POOL.filter((name) => !zhaoGenerals.some((general) => general.name === name));
    if (available.length <= 0) {
      setZhaoHireResult('将领池已抽空');
      return;
    }
    const availableProfiles = available.map((name) => ({
      name,
      profile: ZHAO_GENERAL_PROFILE_BY_NAME[name] ?? { tier: 'C' as GeneralTier, command: 70, strategy: 70, logistics: 70, mobility: 70, recruitCost: cost, upkeepPerTurn: 16 }
    }));
    const totalWeight = availableProfiles.reduce((sum, item) => sum + ZHAO_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier], 0);
    let roll = Math.random() * totalWeight;
    let picked = availableProfiles[availableProfiles.length - 1];
    for (const item of availableProfiles) {
      roll -= ZHAO_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier];
      if (roll <= 0) {
        picked = item;
        break;
      }
    }
    const success = Math.random() < ZHAO_GENERAL_HIRE_SUCCESS_RATE;
    if (success) {
      const zhaoCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.zhao.capitalAdm1] ?? null;
      setZhaoEconomy((prev) => prev - cost);
      setZhaoGenerals((prev) => [
        ...prev,
        {
          id: `zhao-general-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: picked.name,
          status: 'idle',
          locationKey: zhaoCoreKey,
          tier: picked.profile.tier,
          command: picked.profile.command,
          strategy: picked.profile.strategy,
          logistics: picked.profile.logistics,
          mobility: picked.profile.mobility,
          recruitCost: cost,
          upkeepPerTurn: picked.profile.upkeepPerTurn,
          troopCap: ZHAO_GENERAL_TROOP_CAP_BY_TIER[picked.profile.tier],
          assignedTroops: 0
        }
      ]);
      setZhaoHireResult(`招募成功：${picked.name}（${picked.profile.tier}档）`);
      return;
    }
    const refund = Math.floor(cost * ZHAO_GENERAL_FAIL_REFUND_RATE);
    setZhaoEconomy((prev) => prev - cost + refund);
    setZhaoHireResult(`招募失败（${picked.profile.tier}档），返还 ${refund} 经济`);
  };
  const buyZhaoGrain = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (zhaoEconomy < economySpend) return;
    const grainGain = economySpend * zhaoInit.economyCosts.grainPerEconomy;
    setZhaoEconomy((prev) => prev - economySpend);
    setZhaoGrain((prev) => prev + grainGain);
  };
  const openZhaoDispatchPanel = () => {
    if (zhaoIdleGeneralCount <= 0) {
      setZhaoHireResult('无法出征：没有空闲将领');
      return;
    }
    if (zhaoGrain < 1) {
      setZhaoHireResult('无法出征：粮草不足');
      return;
    }
    if (zhaoProvinceOptions.length <= 0) {
      setZhaoHireResult('无法出征：暂无赵国可出发省');
      return;
    }
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'zhao') {
      setZhaoHireResult('请先在地图选中一个赵国省作为出兵省');
      return;
    }
    const idleGeneralWithTroops = zhaoGenerals.find(
      (general) => general.status === 'idle' && general.locationKey === selectedRegion.key && Math.floor(general.assignedTroops ?? 0) > 0
    );
    if (!idleGeneralWithTroops) {
      setZhaoHireResult('无法出征：当前省没有已分配兵力的空闲将领');
      return;
    }
    setZhaoDispatchFromKey(selectedRegion.key);
    setZhaoDispatchToKey('');
    setZhaoDispatchGeneralId(idleGeneralWithTroops?.id ?? '');
    setZhaoDispatchPickStage('to');
    setZhaoOpMode('dispatch');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setZhaoHireResult(`已锁定出兵省：${selectedRegion.label}，请在地图点击目标省`);
  };
  const openZhaoAssignPanel = () => {
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'zhao') {
      setZhaoHireResult('请先在地图选中一个赵国省后再分配兵力');
      return;
    }
    const idleGeneral = zhaoGenerals.find((general) => general.status === 'idle' && general.locationKey === selectedRegion.key);
    setZhaoAssignProvinceKey(selectedRegion.key);
    setZhaoAssignGeneralId(idleGeneral?.id ?? '');
    setZhaoAssignTroops(Math.max(0, Math.floor(idleGeneral?.assignedTroops ?? 0)));
    setZhaoOpMode('assign');
    setZhaoHireResult(
      idleGeneral
        ? `已进入兵力分配：${selectedRegion.label}`
        : `已进入兵力分配：${selectedRegion.label}（该省暂无空闲将领）`
    );
  };
  const applyZhaoTroopAssignment = () => {
    if (!zhaoAssignProvinceKey) {
      setZhaoHireResult('分配失败：请先选择省份');
      return;
    }
    const province = regionsByKey[zhaoAssignProvinceKey];
    if (!province || WARRING_TERRITORY_BY_ADM1[province.adm1] !== 'zhao') {
      setZhaoHireResult('分配失败：仅可在赵国省分配');
      return;
    }
    const general = zhaoGenerals.find((item) => item.id === zhaoAssignGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== zhaoAssignProvinceKey) {
      setZhaoHireResult('分配失败：请选择该省空闲将领');
      return;
    }
    const nextAssigned = Math.max(0, Math.min(Math.floor(zhaoAssignTroops), zhaoAssignMaxTroops));
    setZhaoGenerals((prev) => prev.map((item) => (
      item.id === general.id ? { ...item, assignedTroops: nextAssigned } : item
    )));
    setZhaoHireResult(`分配完成：${general.name} 统领 ${nextAssigned}/${zhaoAssignGeneralCap} 兵`);
  };
  const confirmZhaoDispatch = () => {
    if (zhaoDispatchPickStage !== 'config') {
      setZhaoHireResult('请先在地图完成出发省与目标省点选');
      return;
    }
    const fromKey = zhaoDispatchFromKey;
    const toKey = zhaoDispatchToKey;
    if (!fromKey || !toKey) {
      setZhaoHireResult('出征失败：请选择出发省和目标省');
      return;
    }
    const fromRegion = regionsByKey[fromKey];
    const toRegion = regionsByKey[toKey];
    if (!fromRegion || !toRegion) {
      setZhaoHireResult('出征失败：省份无效');
      return;
    }
    if (WARRING_TERRITORY_BY_ADM1[fromRegion.adm1] !== 'zhao' || WARRING_TERRITORY_BY_ADM1[toRegion.adm1] === 'zhao') {
      setZhaoHireResult('出征失败：请从赵地出发并选择非赵目标');
      return;
    }
    if (!isAdjacentAttack(fromKey, toKey)) {
      setZhaoHireResult('出征失败：仅可攻击相邻省份');
      return;
    }
    const general = zhaoGenerals.find((item) => item.id === zhaoDispatchGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== fromKey) {
      setZhaoHireResult('出征失败：请选择空闲将领');
      return;
    }
    const troops = Math.max(0, Math.floor(general.assignedTroops ?? 0));
    if (troops <= 0) {
      setZhaoHireResult('出征失败：该将领未分配兵力');
      return;
    }
    const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
    if (fromTroops < troops) {
      setZhaoHireResult(`出征失败：该省兵力不足（需${troops}，现有${fromTroops}）`);
      return;
    }
    if (Math.floor(zhaoGrain) < troops) {
      setZhaoHireResult(`出征失败：粮草不足（需${troops}，现有${Math.floor(zhaoGrain)}）`);
      return;
    }
    const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
    const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
    if (!fromAnchor || !toAnchor) {
      setZhaoHireResult('出征失败：路径锚点缺失');
      return;
    }

    setZhaoGrain((prev) => prev - troops);
    setZhaoGenerals((prev) => prev.map((item) => (
      item.id === general.id
        ? { ...item, status: 'marching', locationKey: null, assignedTroops: Math.max(0, Math.floor(item.assignedTroops ?? 0) - troops) }
        : item
    )));
    triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
    const baseNow = performance.now();
    const perColumn = troops < 3 ? troops : 5;
    const groupId = `${baseNow}-${fromKey}-${toKey}-${general.id}`;
    const created: Dispatch[] = [];
    for (let i = 0; i < troops; i += 1) {
      const row = i % perColumn;
      const col = Math.floor(i / perColumn);
      const rowsInColumn = Math.min(perColumn, troops - col * perColumn);
      const centeredRow = row - (rowsInColumn - 1) / 2;
      const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
      const laneBias = centeredRow / laneBiasDivisor;
      const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
      created.push({
        id: `${baseNow}-${fromKey}-${toKey}-${i}`,
        groupId,
        fromKey,
        toKey,
        factionId: 'zhao',
        commanderName: general.name,
        fromPos: { x: fromAnchor.x, y: fromAnchor.y },
        toPos: { x: toAnchor.x, y: toAnchor.y },
        owner: 'red',
        row,
        col,
        rowsInColumn,
        laneBias,
        columnStagger,
        startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
        travelMs: FLIGHT_MS
      });
    }
    const maxCol = Math.max(0, Math.ceil(troops / perColumn) - 1);
    const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
    const timerId = window.setTimeout(() => {
      const targetRegion = regionsByKey[toKey];
      const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === 'zhao'
        ? toKey
        : fromKey;
      setZhaoGenerals((prev) => prev.map((item) => (
        item.id === general.id ? { ...item, status: 'idle', locationKey: returnKey } : item
      )));
    }, releaseInMs);
    generalReturnTimersRef.current.push(timerId);

    setDispatches((prev) => [...prev, ...created]);
    setZhaoHireResult(`出征成功：${general.name} 率 ${troops} 兵，耗粮 ${troops}`);
    setZhaoOpMode('ops');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    flashOpButton('dispatchConfirm');
  };
  const recruitQiTroops = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (qiEconomy < economySpend) return;
    const qiCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.qi.capitalAdm1];
    if (!qiCoreKey) return;
    const troopsGain = economySpend * qiInit.economyCosts.troopPerEconomy;
    setQiEconomy((prev) => prev - economySpend);
    setRegionStateByKey((prev) => {
      const current = prev[qiCoreKey] ?? { owner: 'red' as Owner, value: 0 };
      return {
        ...prev,
        [qiCoreKey]: { ...current, owner: 'red', value: current.value + troopsGain }
      };
    });
  };
  const hireQiGeneral = () => {
    const cost = qiInit.economyCosts.generalHireCost;
    if (qiEconomy < cost) {
      setQiHireResult(`经济不足，需 ${cost}`);
      return;
    }
    const available = QI_GENERAL_POOL.filter((name) => !qiGenerals.some((general) => general.name === name));
    if (available.length <= 0) {
      setQiHireResult('将领池已抽空');
      return;
    }
    const availableProfiles = available.map((name) => ({
      name,
      profile: QI_GENERAL_PROFILE_BY_NAME[name] ?? { tier: 'C' as GeneralTier, command: 70, strategy: 70, logistics: 70, mobility: 70, recruitCost: cost, upkeepPerTurn: 16 }
    }));
    const totalWeight = availableProfiles.reduce((sum, item) => sum + QI_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier], 0);
    let roll = Math.random() * totalWeight;
    let picked = availableProfiles[availableProfiles.length - 1];
    for (const item of availableProfiles) {
      roll -= QI_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier];
      if (roll <= 0) {
        picked = item;
        break;
      }
    }
    const success = Math.random() < QI_GENERAL_HIRE_SUCCESS_RATE;
    if (success) {
      const qiCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.qi.capitalAdm1] ?? null;
      setQiEconomy((prev) => prev - cost);
      setQiGenerals((prev) => [
        ...prev,
        {
          id: `qi-general-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: picked.name,
          status: 'idle',
          locationKey: qiCoreKey,
          tier: picked.profile.tier,
          command: picked.profile.command,
          strategy: picked.profile.strategy,
          logistics: picked.profile.logistics,
          mobility: picked.profile.mobility,
          recruitCost: cost,
          upkeepPerTurn: picked.profile.upkeepPerTurn,
          troopCap: QI_GENERAL_TROOP_CAP_BY_TIER[picked.profile.tier],
          assignedTroops: 0
        }
      ]);
      setQiHireResult(`招募成功：${picked.name}（${picked.profile.tier}档）`);
      return;
    }
    const refund = Math.floor(cost * QI_GENERAL_FAIL_REFUND_RATE);
    setQiEconomy((prev) => prev - cost + refund);
    setQiHireResult(`招募失败（${picked.profile.tier}档），返还 ${refund} 经济`);
  };
  const buyQiGrain = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (qiEconomy < economySpend) return;
    const grainGain = economySpend * qiInit.economyCosts.grainPerEconomy;
    setQiEconomy((prev) => prev - economySpend);
    setQiGrain((prev) => prev + grainGain);
  };
  const openQiDispatchPanel = () => {
    if (qiIdleGeneralCount <= 0) {
      setQiHireResult('无法出征：没有空闲将领');
      return;
    }
    if (qiGrain < 1) {
      setQiHireResult('无法出征：粮草不足');
      return;
    }
    if (qiProvinceOptions.length <= 0) {
      setQiHireResult('无法出征：暂无齐国可出发省');
      return;
    }
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'qi') {
      setQiHireResult('请先在地图选中一个齐国省作为出兵省');
      return;
    }
    const idleGeneralWithTroops = qiGenerals.find(
      (general) => general.status === 'idle' && general.locationKey === selectedRegion.key && Math.floor(general.assignedTroops ?? 0) > 0
    );
    if (!idleGeneralWithTroops) {
      setQiHireResult('无法出征：当前省没有已分配兵力的空闲将领');
      return;
    }
    setQiDispatchFromKey(selectedRegion.key);
    setQiDispatchToKey('');
    setQiDispatchGeneralId(idleGeneralWithTroops?.id ?? '');
    setQiDispatchPickStage('to');
    setQiOpMode('dispatch');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setQiHireResult(`已锁定出兵省：${selectedRegion.label}，请在地图点击目标省`);
  };
  const openQiAssignPanel = () => {
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'qi') {
      setQiHireResult('请先在地图选中一个齐国省后再分配兵力');
      return;
    }
    const idleGeneral = qiGenerals.find((general) => general.status === 'idle' && general.locationKey === selectedRegion.key);
    setQiAssignProvinceKey(selectedRegion.key);
    setQiAssignGeneralId(idleGeneral?.id ?? '');
    setQiAssignTroops(Math.max(0, Math.floor(idleGeneral?.assignedTroops ?? 0)));
    setQiOpMode('assign');
    setQiHireResult(
      idleGeneral
        ? `已进入兵力分配：${selectedRegion.label}`
        : `已进入兵力分配：${selectedRegion.label}（该省暂无空闲将领）`
    );
  };
  const applyQiTroopAssignment = () => {
    if (!qiAssignProvinceKey) {
      setQiHireResult('分配失败：请先选择省份');
      return;
    }
    const province = regionsByKey[qiAssignProvinceKey];
    if (!province || WARRING_TERRITORY_BY_ADM1[province.adm1] !== 'qi') {
      setQiHireResult('分配失败：仅可在齐国省分配');
      return;
    }
    const general = qiGenerals.find((item) => item.id === qiAssignGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== qiAssignProvinceKey) {
      setQiHireResult('分配失败：请选择该省空闲将领');
      return;
    }
    const nextAssigned = Math.max(0, Math.min(Math.floor(qiAssignTroops), qiAssignMaxTroops));
    setQiGenerals((prev) => prev.map((item) => (
      item.id === general.id ? { ...item, assignedTroops: nextAssigned } : item
    )));
    setQiHireResult(`分配完成：${general.name} 统领 ${nextAssigned}/${qiAssignGeneralCap} 兵`);
  };
  const confirmQiDispatch = () => {
    if (qiDispatchPickStage !== 'config') {
      setQiHireResult('请先在地图完成出发省与目标省点选');
      return;
    }
    const fromKey = qiDispatchFromKey;
    const toKey = qiDispatchToKey;
    if (!fromKey || !toKey) {
      setQiHireResult('出征失败：请选择出发省和目标省');
      return;
    }
    const fromRegion = regionsByKey[fromKey];
    const toRegion = regionsByKey[toKey];
    if (!fromRegion || !toRegion) {
      setQiHireResult('出征失败：省份无效');
      return;
    }
    if (WARRING_TERRITORY_BY_ADM1[fromRegion.adm1] !== 'qi' || WARRING_TERRITORY_BY_ADM1[toRegion.adm1] === 'qi') {
      setQiHireResult('出征失败：请从齐地出发并选择非齐目标');
      return;
    }
    if (!isAdjacentAttack(fromKey, toKey)) {
      setQiHireResult('出征失败：仅可攻击相邻省份');
      return;
    }
    const general = qiGenerals.find((item) => item.id === qiDispatchGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== fromKey) {
      setQiHireResult('出征失败：请选择空闲将领');
      return;
    }
    const troops = Math.max(0, Math.floor(general.assignedTroops ?? 0));
    if (troops <= 0) {
      setQiHireResult('出征失败：该将领未分配兵力');
      return;
    }
    const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
    if (fromTroops < troops) {
      setQiHireResult(`出征失败：该省兵力不足（需${troops}，现有${fromTroops}）`);
      return;
    }
    if (Math.floor(qiGrain) < troops) {
      setQiHireResult(`出征失败：粮草不足（需${troops}，现有${Math.floor(qiGrain)}）`);
      return;
    }
    const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
    const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
    if (!fromAnchor || !toAnchor) {
      setQiHireResult('出征失败：路径锚点缺失');
      return;
    }

    setQiGrain((prev) => prev - troops);
    setQiGenerals((prev) => prev.map((item) => (
      item.id === general.id
        ? { ...item, status: 'marching', locationKey: null, assignedTroops: Math.max(0, Math.floor(item.assignedTroops ?? 0) - troops) }
        : item
    )));
    triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
    const baseNow = performance.now();
    const perColumn = troops < 3 ? troops : 5;
    const groupId = `${baseNow}-${fromKey}-${toKey}-${general.id}`;
    const created: Dispatch[] = [];
    for (let i = 0; i < troops; i += 1) {
      const row = i % perColumn;
      const col = Math.floor(i / perColumn);
      const rowsInColumn = Math.min(perColumn, troops - col * perColumn);
      const centeredRow = row - (rowsInColumn - 1) / 2;
      const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
      const laneBias = centeredRow / laneBiasDivisor;
      const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
      created.push({
        id: `${baseNow}-${fromKey}-${toKey}-${i}`,
        groupId,
        fromKey,
        toKey,
        factionId: 'qi',
        commanderName: general.name,
        fromPos: { x: fromAnchor.x, y: fromAnchor.y },
        toPos: { x: toAnchor.x, y: toAnchor.y },
        owner: 'red',
        row,
        col,
        rowsInColumn,
        laneBias,
        columnStagger,
        startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
        travelMs: FLIGHT_MS
      });
    }
    const maxCol = Math.max(0, Math.ceil(troops / perColumn) - 1);
    const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
    const timerId = window.setTimeout(() => {
      const targetRegion = regionsByKey[toKey];
      const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === 'qi'
        ? toKey
        : fromKey;
      setQiGenerals((prev) => prev.map((item) => (
        item.id === general.id ? { ...item, status: 'idle', locationKey: returnKey } : item
      )));
    }, releaseInMs);
    generalReturnTimersRef.current.push(timerId);

    setDispatches((prev) => [...prev, ...created]);
    setQiHireResult(`出征成功：${general.name} 率 ${troops} 兵，耗粮 ${troops}`);
    setQiOpMode('ops');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    flashOpButton('dispatchConfirm');
  };
  const recruitYanTroops = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (yanEconomy < economySpend) return;
    const yanCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.yan.capitalAdm1];
    if (!yanCoreKey) return;
    const troopsGain = economySpend * yanInit.economyCosts.troopPerEconomy;
    setYanEconomy((prev) => prev - economySpend);
    setRegionStateByKey((prev) => {
      const current = prev[yanCoreKey] ?? { owner: 'red' as Owner, value: 0 };
      return {
        ...prev,
        [yanCoreKey]: { ...current, owner: 'red', value: current.value + troopsGain }
      };
    });
  };
  const hireYanGeneral = () => {
    const cost = yanInit.economyCosts.generalHireCost;
    if (yanEconomy < cost) {
      setYanHireResult(`经济不足，需 ${cost}`);
      return;
    }
    const available = YAN_GENERAL_POOL.filter((name) => !yanGenerals.some((general) => general.name === name));
    if (available.length <= 0) {
      setYanHireResult('将领池已抽空');
      return;
    }
    const availableProfiles = available.map((name) => ({
      name,
      profile: YAN_GENERAL_PROFILE_BY_NAME[name] ?? { tier: 'C' as GeneralTier, command: 70, strategy: 70, logistics: 70, mobility: 70, recruitCost: cost, upkeepPerTurn: 16 }
    }));
    const totalWeight = availableProfiles.reduce((sum, item) => sum + YAN_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier], 0);
    let roll = Math.random() * totalWeight;
    let picked = availableProfiles[availableProfiles.length - 1];
    for (const item of availableProfiles) {
      roll -= YAN_GENERAL_TIER_DRAW_WEIGHT[item.profile.tier];
      if (roll <= 0) {
        picked = item;
        break;
      }
    }
    const success = Math.random() < YAN_GENERAL_HIRE_SUCCESS_RATE;
    if (success) {
      const yanCoreKey = regionKeyByAdm1[WARRING_INITIAL_POWER.yan.capitalAdm1] ?? null;
      setYanEconomy((prev) => prev - cost);
      setYanGenerals((prev) => [
        ...prev,
        {
          id: `yan-general-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: picked.name,
          status: 'idle',
          locationKey: yanCoreKey,
          tier: picked.profile.tier,
          command: picked.profile.command,
          strategy: picked.profile.strategy,
          logistics: picked.profile.logistics,
          mobility: picked.profile.mobility,
          recruitCost: cost,
          upkeepPerTurn: picked.profile.upkeepPerTurn,
          troopCap: YAN_GENERAL_TROOP_CAP_BY_TIER[picked.profile.tier],
          assignedTroops: 0
        }
      ]);
      setYanHireResult(`招募成功：${picked.name}（${picked.profile.tier}档）`);
      return;
    }
    const refund = Math.floor(cost * YAN_GENERAL_FAIL_REFUND_RATE);
    setYanEconomy((prev) => prev - cost + refund);
    setYanHireResult(`招募失败（${picked.profile.tier}档），返还 ${refund} 经济`);
  };
  const buyYanGrain = (economySpend: number) => {
    if (economySpend <= 0) return;
    if (yanEconomy < economySpend) return;
    const grainGain = economySpend * yanInit.economyCosts.grainPerEconomy;
    setYanEconomy((prev) => prev - economySpend);
    setYanGrain((prev) => prev + grainGain);
  };
  const openYanDispatchPanel = () => {
    if (yanIdleGeneralCount <= 0) {
      setYanHireResult('无法出征：没有空闲将领');
      return;
    }
    if (yanGrain < 1) {
      setYanHireResult('无法出征：粮草不足');
      return;
    }
    if (yanProvinceOptions.length <= 0) {
      setYanHireResult('无法出征：暂无燕国可出发省');
      return;
    }
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'yan') {
      setYanHireResult('请先在地图选中一个燕国省作为出兵省');
      return;
    }
    const idleGeneralWithTroops = yanGenerals.find(
      (general) => general.status === 'idle' && general.locationKey === selectedRegion.key && Math.floor(general.assignedTroops ?? 0) > 0
    );
    if (!idleGeneralWithTroops) {
      setYanHireResult('无法出征：当前省没有已分配兵力的空闲将领');
      return;
    }
    setYanDispatchFromKey(selectedRegion.key);
    setYanDispatchToKey('');
    setYanDispatchGeneralId(idleGeneralWithTroops?.id ?? '');
    setYanDispatchPickStage('to');
    setYanOpMode('dispatch');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    setYanHireResult(`已锁定出兵省：${selectedRegion.label}，请在地图点击目标省`);
  };
  const openYanAssignPanel = () => {
    const selectedRegion = selectedProvinceKey ? regionsByKey[selectedProvinceKey] : null;
    if (!selectedRegion || WARRING_TERRITORY_BY_ADM1[selectedRegion.adm1] !== 'yan') {
      setYanHireResult('请先在地图选中一个燕国省后再分配兵力');
      return;
    }
    const idleGeneral = yanGenerals.find((general) => general.status === 'idle' && general.locationKey === selectedRegion.key);
    setYanAssignProvinceKey(selectedRegion.key);
    setYanAssignGeneralId(idleGeneral?.id ?? '');
    setYanAssignTroops(Math.max(0, Math.floor(idleGeneral?.assignedTroops ?? 0)));
    setYanOpMode('assign');
    setYanHireResult(
      idleGeneral
        ? `已进入兵力分配：${selectedRegion.label}`
        : `已进入兵力分配：${selectedRegion.label}（该省暂无空闲将领）`
    );
  };
  const applyYanTroopAssignment = () => {
    if (!yanAssignProvinceKey) {
      setYanHireResult('分配失败：请先选择省份');
      return;
    }
    const province = regionsByKey[yanAssignProvinceKey];
    if (!province || WARRING_TERRITORY_BY_ADM1[province.adm1] !== 'yan') {
      setYanHireResult('分配失败：仅可在燕国省分配');
      return;
    }
    const general = yanGenerals.find((item) => item.id === yanAssignGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== yanAssignProvinceKey) {
      setYanHireResult('分配失败：请选择该省空闲将领');
      return;
    }
    const nextAssigned = Math.max(0, Math.min(Math.floor(yanAssignTroops), yanAssignMaxTroops));
    setYanGenerals((prev) => prev.map((item) => (
      item.id === general.id ? { ...item, assignedTroops: nextAssigned } : item
    )));
    setYanHireResult(`分配完成：${general.name} 统领 ${nextAssigned}/${yanAssignGeneralCap} 兵`);
  };
  const confirmYanDispatch = () => {
    if (yanDispatchPickStage !== 'config') {
      setYanHireResult('请先在地图完成出发省与目标省点选');
      return;
    }
    const fromKey = yanDispatchFromKey;
    const toKey = yanDispatchToKey;
    if (!fromKey || !toKey) {
      setYanHireResult('出征失败：请选择出发省和目标省');
      return;
    }
    const fromRegion = regionsByKey[fromKey];
    const toRegion = regionsByKey[toKey];
    if (!fromRegion || !toRegion) {
      setYanHireResult('出征失败：省份无效');
      return;
    }
    if (WARRING_TERRITORY_BY_ADM1[fromRegion.adm1] !== 'yan' || WARRING_TERRITORY_BY_ADM1[toRegion.adm1] === 'yan') {
      setYanHireResult('出征失败：请从燕地出发并选择非燕目标');
      return;
    }
    if (!isAdjacentAttack(fromKey, toKey)) {
      setYanHireResult('出征失败：仅可攻击相邻省份');
      return;
    }
    const general = yanGenerals.find((item) => item.id === yanDispatchGeneralId);
    if (!general || general.status !== 'idle' || general.locationKey !== fromKey) {
      setYanHireResult('出征失败：请选择空闲将领');
      return;
    }
    const troops = Math.max(0, Math.floor(general.assignedTroops ?? 0));
    if (troops <= 0) {
      setYanHireResult('出征失败：该将领未分配兵力');
      return;
    }
    const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
    if (fromTroops < troops) {
      setYanHireResult(`出征失败：该省兵力不足（需${troops}，现有${fromTroops}）`);
      return;
    }
    if (Math.floor(yanGrain) < troops) {
      setYanHireResult(`出征失败：粮草不足（需${troops}，现有${Math.floor(yanGrain)}）`);
      return;
    }
    const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
    const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
    if (!fromAnchor || !toAnchor) {
      setYanHireResult('出征失败：路径锚点缺失');
      return;
    }

    setYanGrain((prev) => prev - troops);
    setYanGenerals((prev) => prev.map((item) => (
      item.id === general.id
        ? { ...item, status: 'marching', locationKey: null, assignedTroops: Math.max(0, Math.floor(item.assignedTroops ?? 0) - troops) }
        : item
    )));
    triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
    const baseNow = performance.now();
    const perColumn = troops < 3 ? troops : 5;
    const groupId = `${baseNow}-${fromKey}-${toKey}-${general.id}`;
    const created: Dispatch[] = [];
    for (let i = 0; i < troops; i += 1) {
      const row = i % perColumn;
      const col = Math.floor(i / perColumn);
      const rowsInColumn = Math.min(perColumn, troops - col * perColumn);
      const centeredRow = row - (rowsInColumn - 1) / 2;
      const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
      const laneBias = centeredRow / laneBiasDivisor;
      const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
      created.push({
        id: `${baseNow}-${fromKey}-${toKey}-${i}`,
        groupId,
        fromKey,
        toKey,
        factionId: 'yan',
        commanderName: general.name,
        fromPos: { x: fromAnchor.x, y: fromAnchor.y },
        toPos: { x: toAnchor.x, y: toAnchor.y },
        owner: 'red',
        row,
        col,
        rowsInColumn,
        laneBias,
        columnStagger,
        startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
        travelMs: FLIGHT_MS
      });
    }
    const maxCol = Math.max(0, Math.ceil(troops / perColumn) - 1);
    const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
    const timerId = window.setTimeout(() => {
      const targetRegion = regionsByKey[toKey];
      const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === 'yan'
        ? toKey
        : fromKey;
      setYanGenerals((prev) => prev.map((item) => (
        item.id === general.id ? { ...item, status: 'idle', locationKey: returnKey } : item
      )));
    }, releaseInMs);
    generalReturnTimersRef.current.push(timerId);

    setDispatches((prev) => [...prev, ...created]);
    setYanHireResult(`出征成功：${general.name} 率 ${troops} 兵，耗粮 ${troops}`);
    setYanOpMode('ops');
    setAimPoint(null);
    setSmoothedAimPoint(null);
    flashOpButton('dispatchConfirm');
  };
  const getFactionEconomy = (factionId: WarringStateId): number => (
    factionId === 'qin' ? qinEconomy
      : factionId === 'chu' ? chuEconomy
        : factionId === 'han' ? hanEconomy
          : factionId === 'wei' ? weiEconomy
            : factionId === 'zhao' ? zhaoEconomy
              : factionId === 'qi' ? qiEconomy
                : yanEconomy
  );
  const getFactionGrain = (factionId: WarringStateId): number => (
    factionId === 'qin' ? qinGrain
      : factionId === 'chu' ? chuGrain
        : factionId === 'han' ? hanGrain
          : factionId === 'wei' ? weiGrain
            : factionId === 'zhao' ? zhaoGrain
              : factionId === 'qi' ? qiGrain
                : yanGrain
  );
  const getFactionGenerals = (factionId: WarringStateId): QinGeneral[] => (
    factionId === 'qin' ? qinGenerals
      : factionId === 'chu' ? chuGenerals
        : factionId === 'han' ? hanGenerals
          : factionId === 'wei' ? weiGenerals
            : factionId === 'zhao' ? zhaoGenerals
              : factionId === 'qi' ? qiGenerals
                : yanGenerals
  );
  const runFactionEconomyOps = (factionId: WarringStateId) => {
    const economy = getFactionEconomy(factionId);
    if (economy < 20) return;
    const grain = getFactionGrain(factionId);
    if (grain < 120 && Math.random() < 0.45) {
      if (factionId === 'qin') buyQinGrain(20);
      else if (factionId === 'chu') buyChuGrain(20);
      else if (factionId === 'han') buyHanGrain(20);
      else if (factionId === 'wei') buyWeiGrain(20);
      else if (factionId === 'zhao') buyZhaoGrain(20);
      else if (factionId === 'qi') buyQiGrain(20);
      else buyYanGrain(20);
      return;
    }
    if (Math.random() < 0.5) {
      if (factionId === 'qin') recruitQinTroops(20);
      else if (factionId === 'chu') recruitChuTroops(20);
      else if (factionId === 'han') recruitHanTroops(20);
      else if (factionId === 'wei') recruitWeiTroops(20);
      else if (factionId === 'zhao') recruitZhaoTroops(20);
      else if (factionId === 'qi') recruitQiTroops(20);
      else recruitYanTroops(20);
    }
  };
  const runFactionHireGeneral = (factionId: WarringStateId) => {
    const economy = getFactionEconomy(factionId);
    const cost = factionId === 'qin' ? qinInit.economyCosts.generalHireCost
      : factionId === 'chu' ? chuInit.economyCosts.generalHireCost
        : factionId === 'han' ? hanInit.economyCosts.generalHireCost
          : factionId === 'wei' ? weiInit.economyCosts.generalHireCost
            : factionId === 'zhao' ? zhaoInit.economyCosts.generalHireCost
              : factionId === 'qi' ? qiInit.economyCosts.generalHireCost
                : yanInit.economyCosts.generalHireCost;
    const generals = getFactionGenerals(factionId);
    if (economy < cost) return;
    if (generals.length >= 4 && Math.random() < 0.9) return;
    if (Math.random() < 0.14) {
      if (factionId === 'qin') hireQinGeneral();
      else if (factionId === 'chu') hireChuGeneral();
      else if (factionId === 'han') hireHanGeneral();
      else if (factionId === 'wei') hireWeiGeneral();
      else if (factionId === 'zhao') hireZhaoGeneral();
      else if (factionId === 'qi') hireQiGeneral();
      else hireYanGeneral();
    }
  };
  const applyAIGeneralAssignment = (factionId: WarringStateId) => {
    const assignFn = (prev: QinGeneral[]) => prev.map((general) => {
      if (general.status !== 'idle' || !general.locationKey) return general;
      const provinceTroops = Math.floor(regionStateByKey[general.locationKey]?.value ?? 0);
      if (provinceTroops <= 0) return general;
      const cap = Math.max(60, Math.floor(general.troopCap ?? 120));
      const desired = Math.min(cap, Math.max(40, Math.floor(provinceTroops * 0.38)));
      const currentAssigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
      if (desired <= currentAssigned) return general;
      return { ...general, assignedTroops: desired };
    });
    if (factionId === 'qin') setQinGenerals(assignFn);
    else if (factionId === 'chu') setChuGenerals(assignFn);
    else if (factionId === 'han') setHanGenerals(assignFn);
    else if (factionId === 'wei') setWeiGenerals(assignFn);
    else if (factionId === 'zhao') setZhaoGenerals(assignFn);
    else if (factionId === 'qi') setQiGenerals(assignFn);
    else setYanGenerals(assignFn);
  };
  const dispatchFactionArmy = (
    factionId: WarringStateId,
    general: QinGeneral,
    fromKey: string,
    toKey: string,
    troops: number
  ): boolean => {
    const fromRegion = regionsByKey[fromKey];
    const toRegion = regionsByKey[toKey];
    if (!fromRegion || !toRegion) return false;
    if (!isAdjacentAttack(fromKey, toKey)) return false;
    if (WARRING_TERRITORY_BY_ADM1[fromRegion.adm1] !== factionId || WARRING_TERRITORY_BY_ADM1[toRegion.adm1] === factionId) return false;
    const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
    const useTroops = Math.max(0, Math.min(troops, fromTroops, Math.floor(general.troopCap ?? 120)));
    if (useTroops <= 0) return false;
    const grain = Math.floor(getFactionGrain(factionId));
    if (grain < useTroops) return false;
    const fromAnchor = displayNodeById[fromKey] ?? levelCenters[fromKey];
    const toAnchor = displayNodeById[toKey] ?? levelCenters[toKey];
    if (!fromAnchor || !toAnchor) return false;

    if (factionId === 'qin') setQinGrain((prev) => prev - useTroops);
    else if (factionId === 'chu') setChuGrain((prev) => prev - useTroops);
    else if (factionId === 'han') setHanGrain((prev) => prev - useTroops);
    else if (factionId === 'wei') setWeiGrain((prev) => prev - useTroops);
    else if (factionId === 'zhao') setZhaoGrain((prev) => prev - useTroops);
    else if (factionId === 'qi') setQiGrain((prev) => prev - useTroops);
    else setYanGrain((prev) => prev - useTroops);

    const updateGeneral = (prev: QinGeneral[]) => prev.map((item) => (
      item.id === general.id
        ? {
            ...item,
            status: 'marching',
            locationKey: null,
            assignedTroops: Math.max(0, Math.floor(item.assignedTroops ?? 0) - useTroops)
          }
        : item
    ));
    if (factionId === 'qin') setQinGenerals(updateGeneral);
    else if (factionId === 'chu') setChuGenerals(updateGeneral);
    else if (factionId === 'han') setHanGenerals(updateGeneral);
    else if (factionId === 'wei') setWeiGenerals(updateGeneral);
    else if (factionId === 'zhao') setZhaoGenerals(updateGeneral);
    else if (factionId === 'qi') setQiGenerals(updateGeneral);
    else setYanGenerals(updateGeneral);

    const owner: Owner = FACTION_OWNER_BY_ID[factionId];
    triggerNodeShake(fromKey, dispatchShakeAmp / camera.scale, dispatchShakeMs);
    const baseNow = performance.now();
    const perColumn = useTroops < 3 ? useTroops : 5;
    const groupId = `${baseNow}-${fromKey}-${toKey}-${general.id}`;
    const created: Dispatch[] = [];
    for (let i = 0; i < useTroops; i += 1) {
      const row = i % perColumn;
      const col = Math.floor(i / perColumn);
      const rowsInColumn = Math.min(perColumn, useTroops - col * perColumn);
      const centeredRow = row - (rowsInColumn - 1) / 2;
      const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
      const laneBias = centeredRow / laneBiasDivisor;
      const columnStagger = col % 2 === 0 ? 0 : QUEUE_STAGGER_RATIO;
      created.push({
        id: `${baseNow}-${fromKey}-${toKey}-${i}`,
        groupId,
        fromKey,
        toKey,
        factionId,
        commanderName: general.name,
        fromPos: { x: fromAnchor.x, y: fromAnchor.y },
        toPos: { x: toAnchor.x, y: toAnchor.y },
        owner,
        row,
        col,
        rowsInColumn,
        laneBias,
        columnStagger,
        startAt: baseNow + col * DOT_COLUMN_DELAY_MS,
        travelMs: FLIGHT_MS
      });
    }
    const maxCol = Math.max(0, Math.ceil(useTroops / perColumn) - 1);
    const releaseInMs = Math.max(220, maxCol * DOT_COLUMN_DELAY_MS + FLIGHT_MS + 120);
    const timerId = window.setTimeout(() => {
      const targetRegion = regionsByKey[toKey];
      const returnKey = targetRegion && WARRING_TERRITORY_BY_ADM1[targetRegion.adm1] === factionId ? toKey : fromKey;
      const returnFn = (prev: QinGeneral[]) => prev.map((item) => (
        item.id === general.id ? { ...item, status: 'idle', locationKey: returnKey } : item
      ));
      if (factionId === 'qin') setQinGenerals(returnFn);
      else if (factionId === 'chu') setChuGenerals(returnFn);
      else if (factionId === 'han') setHanGenerals(returnFn);
      else if (factionId === 'wei') setWeiGenerals(returnFn);
      else if (factionId === 'zhao') setZhaoGenerals(returnFn);
      else if (factionId === 'qi') setQiGenerals(returnFn);
      else setYanGenerals(returnFn);
    }, releaseInMs);
    generalReturnTimersRef.current.push(timerId);
    setDispatches((prev) => [...prev, ...created]);
    return true;
  };
  const runFactionAttackAi = (factionId: WarringStateId) => {
    const generals = getFactionGenerals(factionId).filter((general) => general.status === 'idle' && Boolean(general.locationKey));
    if (generals.length <= 0) return;
    type Candidate = { general: QinGeneral; fromKey: string; toKey: string; score: number; sendTroops: number };
    let best: Candidate | null = null;
    generals.forEach((general) => {
      const fromKey = general.locationKey;
      if (!fromKey) return;
      const fromTroops = Math.floor(regionStateByKey[fromKey]?.value ?? 0);
      if (fromTroops < 65) return;
      const neighborKeys = Array.from(adjacencyByRegionKey[fromKey] ?? []);
      neighborKeys.forEach((toKey) => {
        const targetRegion = regionsByKey[toKey];
        if (!targetRegion) return;
        const targetFaction = WARRING_TERRITORY_BY_ADM1[targetRegion.adm1];
        if (targetFaction === factionId) return;
        const enemyTroops = Math.floor(regionStateByKey[toKey]?.value ?? 0);
        const assigned = Math.max(0, Math.floor(general.assignedTroops ?? 0));
        const cap = Math.max(60, Math.floor(general.troopCap ?? 120));
        const available = Math.max(assigned, Math.min(cap, Math.floor(fromTroops * 0.32)));
        const sendTroops = Math.min(available, Math.max(40, enemyTroops + 16), fromTroops - 18);
        if (sendTroops <= 0) return;
        if (Math.floor(getFactionGrain(factionId)) < sendTroops) return;
        const pressure = targetFaction === playerFactionId ? 8 : targetFaction ? 4 : 7;
        const score = (sendTroops - enemyTroops) + pressure + Math.random() * 6;
        if (!best || score > best.score) best = { general, fromKey, toKey, score, sendTroops };
      });
    });
    if (!best) return;
    if (best.sendTroops < 45) return;
    void dispatchFactionArmy(factionId, best.general, best.fromKey, best.toKey, best.sendTroops);
  };
  aiTickRef.current = () => {
    if (result !== 'playing') return;
    WARRING_STATES.forEach((state) => {
      const factionId = state.id;
      if (factionId === playerFactionId) return;
      if (Math.random() < 0.6) runFactionEconomyOps(factionId);
      runFactionHireGeneral(factionId);
      applyAIGeneralAssignment(factionId);
      if (Math.random() < 0.42) runFactionAttackAi(factionId);
    });
  };
  useEffect(() => {
    if (aiLoopTimerRef.current) {
      window.clearInterval(aiLoopTimerRef.current);
      aiLoopTimerRef.current = null;
    }
    if (result !== 'playing') return;
    aiLoopTimerRef.current = window.setInterval(() => {
      aiTickRef.current();
    }, 4600);
    return () => {
      if (aiLoopTimerRef.current) {
        window.clearInterval(aiLoopTimerRef.current);
        aiLoopTimerRef.current = null;
      }
    };
  }, [result]);
  const qinDispatchArrow = useMemo(() => {
    if (qinOpMode !== 'dispatch') return null;
    if (!qinDispatchFromKey) return null;
    const from = (displayNodeById[qinDispatchFromKey] ?? levelCenters[qinDispatchFromKey]) ?? null;
    if (!from) return null;
    const to = qinDispatchToKey
      ? ((displayNodeById[qinDispatchToKey] ?? levelCenters[qinDispatchToKey]) ?? null)
      : (smoothedAimPoint ?? aimPoint ?? null);
    if (!to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return null;
    const ux = dx / len;
    const uy = dy / len;
    const startOffset = 16 / camera.scale;
    const endOffset = 12 / camera.scale;
    return {
      x1: from.x + ux * startOffset,
      y1: from.y + uy * startOffset,
      x2: to.x - ux * endOffset,
      y2: to.y - uy * endOffset
    };
  }, [qinOpMode, qinDispatchFromKey, qinDispatchToKey, displayNodeById, levelCenters, smoothedAimPoint, aimPoint, camera.scale]);
  const chuDispatchArrow = useMemo(() => {
    if (chuOpMode !== 'dispatch') return null;
    if (!chuDispatchFromKey) return null;
    const from = (displayNodeById[chuDispatchFromKey] ?? levelCenters[chuDispatchFromKey]) ?? null;
    if (!from) return null;
    const to = chuDispatchToKey
      ? ((displayNodeById[chuDispatchToKey] ?? levelCenters[chuDispatchToKey]) ?? null)
      : (smoothedAimPoint ?? aimPoint ?? null);
    if (!to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return null;
    const ux = dx / len;
    const uy = dy / len;
    const startOffset = 16 / camera.scale;
    const endOffset = 12 / camera.scale;
    return {
      x1: from.x + ux * startOffset,
      y1: from.y + uy * startOffset,
      x2: to.x - ux * endOffset,
      y2: to.y - uy * endOffset
    };
  }, [chuOpMode, chuDispatchFromKey, chuDispatchToKey, displayNodeById, levelCenters, smoothedAimPoint, aimPoint, camera.scale]);
  const hanDispatchArrow = useMemo(() => {
    if (hanOpMode !== 'dispatch') return null;
    if (!hanDispatchFromKey) return null;
    const from = (displayNodeById[hanDispatchFromKey] ?? levelCenters[hanDispatchFromKey]) ?? null;
    if (!from) return null;
    const to = hanDispatchToKey
      ? ((displayNodeById[hanDispatchToKey] ?? levelCenters[hanDispatchToKey]) ?? null)
      : (smoothedAimPoint ?? aimPoint ?? null);
    if (!to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return null;
    const ux = dx / len;
    const uy = dy / len;
    const startOffset = 16 / camera.scale;
    const endOffset = 12 / camera.scale;
    return {
      x1: from.x + ux * startOffset,
      y1: from.y + uy * startOffset,
      x2: to.x - ux * endOffset,
      y2: to.y - uy * endOffset
    };
  }, [hanOpMode, hanDispatchFromKey, hanDispatchToKey, displayNodeById, levelCenters, smoothedAimPoint, aimPoint, camera.scale]);
  const weiDispatchArrow = useMemo(() => {
    if (weiOpMode !== 'dispatch') return null;
    if (!weiDispatchFromKey) return null;
    const from = (displayNodeById[weiDispatchFromKey] ?? levelCenters[weiDispatchFromKey]) ?? null;
    if (!from) return null;
    const to = weiDispatchToKey
      ? ((displayNodeById[weiDispatchToKey] ?? levelCenters[weiDispatchToKey]) ?? null)
      : (smoothedAimPoint ?? aimPoint ?? null);
    if (!to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return null;
    const ux = dx / len;
    const uy = dy / len;
    const startOffset = 16 / camera.scale;
    const endOffset = 12 / camera.scale;
    return {
      x1: from.x + ux * startOffset,
      y1: from.y + uy * startOffset,
      x2: to.x - ux * endOffset,
      y2: to.y - uy * endOffset
    };
  }, [weiOpMode, weiDispatchFromKey, weiDispatchToKey, displayNodeById, levelCenters, smoothedAimPoint, aimPoint, camera.scale]);
  const zhaoDispatchArrow = useMemo(() => {
    if (zhaoOpMode !== 'dispatch') return null;
    if (!zhaoDispatchFromKey) return null;
    const from = (displayNodeById[zhaoDispatchFromKey] ?? levelCenters[zhaoDispatchFromKey]) ?? null;
    if (!from) return null;
    const to = zhaoDispatchToKey
      ? ((displayNodeById[zhaoDispatchToKey] ?? levelCenters[zhaoDispatchToKey]) ?? null)
      : (smoothedAimPoint ?? aimPoint ?? null);
    if (!to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return null;
    const ux = dx / len;
    const uy = dy / len;
    const startOffset = 16 / camera.scale;
    const endOffset = 12 / camera.scale;
    return {
      x1: from.x + ux * startOffset,
      y1: from.y + uy * startOffset,
      x2: to.x - ux * endOffset,
      y2: to.y - uy * endOffset
    };
  }, [zhaoOpMode, zhaoDispatchFromKey, zhaoDispatchToKey, displayNodeById, levelCenters, smoothedAimPoint, aimPoint, camera.scale]);
  const qiDispatchArrow = useMemo(() => {
    if (qiOpMode !== 'dispatch') return null;
    if (!qiDispatchFromKey) return null;
    const from = (displayNodeById[qiDispatchFromKey] ?? levelCenters[qiDispatchFromKey]) ?? null;
    if (!from) return null;
    const to = qiDispatchToKey
      ? ((displayNodeById[qiDispatchToKey] ?? levelCenters[qiDispatchToKey]) ?? null)
      : (smoothedAimPoint ?? aimPoint ?? null);
    if (!to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return null;
    const ux = dx / len;
    const uy = dy / len;
    const startOffset = 16 / camera.scale;
    const endOffset = 12 / camera.scale;
    return {
      x1: from.x + ux * startOffset,
      y1: from.y + uy * startOffset,
      x2: to.x - ux * endOffset,
      y2: to.y - uy * endOffset
    };
  }, [qiOpMode, qiDispatchFromKey, qiDispatchToKey, displayNodeById, levelCenters, smoothedAimPoint, aimPoint, camera.scale]);
  const yanDispatchArrow = useMemo(() => {
    if (yanOpMode !== 'dispatch') return null;
    if (!yanDispatchFromKey) return null;
    const from = (displayNodeById[yanDispatchFromKey] ?? levelCenters[yanDispatchFromKey]) ?? null;
    if (!from) return null;
    const to = yanDispatchToKey
      ? ((displayNodeById[yanDispatchToKey] ?? levelCenters[yanDispatchToKey]) ?? null)
      : (smoothedAimPoint ?? aimPoint ?? null);
    if (!to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 8) return null;
    const ux = dx / len;
    const uy = dy / len;
    const startOffset = 16 / camera.scale;
    const endOffset = 12 / camera.scale;
    return {
      x1: from.x + ux * startOffset,
      y1: from.y + uy * startOffset,
      x2: to.x - ux * endOffset,
      y2: to.y - uy * endOffset
    };
  }, [yanOpMode, yanDispatchFromKey, yanDispatchToKey, displayNodeById, levelCenters, smoothedAimPoint, aimPoint, camera.scale]);

  return (
    <div className="h-[100dvh] w-screen overflow-hidden text-[#1e1e1e]" style={{ backgroundColor: '#bfc0c4' }}>
      <main className="h-full w-full">
        <section className="relative h-full w-full min-h-0 bg-[#b8b9bd]">
          <button
            type="button"
            onClick={onBack}
            className="absolute left-4 top-4 z-20 h-11 w-11 rounded-xl border border-white/30 bg-[#7b7d85]/65 text-white grid place-items-center backdrop-blur-sm"
            aria-label="返回"
          >
            <ChevronLeft className="h-9 w-9" strokeWidth={3.4} />
          </button>
          <div className="absolute left-16 right-4 top-4 z-20 flex justify-end">
            <div className="rounded-xl border border-white/30 bg-[#7b7d85]/65 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur-sm">
              本局国家：<span style={{ color: playerNation?.color ?? '#ffffff' }}>{playerNation?.name ?? '？'}</span>（剩余不可重抽）
            </div>
          </div>
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            className="w-full h-full"
            style={{ touchAction: 'none' }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * VIEWBOX_W;
              const y = ((e.clientY - rect.top) / rect.height) * VIEWBOX_H;
              handleBoardMove(x, y);
            }}
            onTouchMove={(e) => {
              if (e.touches.length >= 2) {
                const t0 = e.touches[0];
                const t1 = e.touches[1];
                if (!t0 || !t1) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x0 = ((t0.clientX - rect.left) / rect.width) * VIEWBOX_W;
                const y0 = ((t0.clientY - rect.top) / rect.height) * VIEWBOX_H;
                const x1 = ((t1.clientX - rect.left) / rect.width) * VIEWBOX_W;
                const y1 = ((t1.clientY - rect.top) / rect.height) * VIEWBOX_H;
                const center = { x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5 };
                const dist = Math.hypot(x1 - x0, y1 - y0);
                if (pinchActiveRef.current && pinchLastDistanceRef.current && pinchLastDistanceRef.current > 0 && dist > 0) {
                  const rawFactor = dist / pinchLastDistanceRef.current;
                  const boostedFactor = clamp(
                    1 + (rawFactor - 1) * PINCH_ZOOM_SENSITIVITY,
                    PINCH_ZOOM_STEP_MIN,
                    PINCH_ZOOM_STEP_MAX
                  );
                  if (Number.isFinite(boostedFactor) && boostedFactor > 0) {
                    schedulePinchZoom(zoomRef.current * boostedFactor, center);
                  }
                }
                pinchActiveRef.current = true;
                pinchLastDistanceRef.current = dist;
                panActiveRef.current = false;
                panLastPointRef.current = null;
                touchStartPointRef.current = null;
                e.preventDefault();
                return;
              }
              if (pinchActiveRef.current) return;
              const touch = e.touches[0];
              if (!touch) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((touch.clientX - rect.left) / rect.width) * VIEWBOX_W;
              const y = ((touch.clientY - rect.top) / rect.height) * VIEWBOX_H;
              const start = touchStartPointRef.current ?? { x, y };
              const moved = Math.hypot(x - start.x, y - start.y);
              if (moved >= 10) {
                panActiveRef.current = true;
                handleBoardMove(x, y);
                e.preventDefault();
              }
            }}
            onMouseUp={onBoardPointerUp}
            onMouseLeave={onBoardPointerUp}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedProvinceKey(null);
                setSelectedNationId(null);
                if (selectedSources.length > 0 || longPressActiveRef.current) {
                  clearSelectionState();
                  clearLongPress();
                  longPressActiveRef.current = false;
                  pointerDownRef.current = false;
                } else {
                  panActiveRef.current = true;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * VIEWBOX_W;
                  const y = ((e.clientY - rect.top) / rect.height) * VIEWBOX_H;
                  panLastPointRef.current = { x, y };
                  suppressClickRef.current = true;
                }
              }
            }}
            onTouchEnd={onBoardPointerUp}
            onTouchCancel={onBoardPointerUp}
            onTouchStart={(e) => {
              if (e.touches.length >= 2) {
                const t0 = e.touches[0];
                const t1 = e.touches[1];
                if (!t0 || !t1) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x0 = ((t0.clientX - rect.left) / rect.width) * VIEWBOX_W;
                const y0 = ((t0.clientY - rect.top) / rect.height) * VIEWBOX_H;
                const x1 = ((t1.clientX - rect.left) / rect.width) * VIEWBOX_W;
                const y1 = ((t1.clientY - rect.top) / rect.height) * VIEWBOX_H;
                pinchActiveRef.current = true;
                pinchLastDistanceRef.current = Math.hypot(x1 - x0, y1 - y0);
                panActiveRef.current = false;
                panLastPointRef.current = null;
                touchStartPointRef.current = null;
                return;
              }
              pinchActiveRef.current = false;
              pinchLastDistanceRef.current = null;
              if (e.target === e.currentTarget) {
                setSelectedProvinceKey(null);
                setSelectedNationId(null);
              }
              if (selectedSources.length > 0 || longPressActiveRef.current) {
                clearSelectionState();
                clearLongPress();
                longPressActiveRef.current = false;
                pointerDownRef.current = false;
                return;
              }
              panActiveRef.current = false;
              const touch = e.touches[0];
              if (!touch) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((touch.clientX - rect.left) / rect.width) * VIEWBOX_W;
              const y = ((touch.clientY - rect.top) / rect.height) * VIEWBOX_H;
              touchStartPointRef.current = { x, y };
              panLastPointRef.current = { x, y };
              suppressClickRef.current = false;
            }}
          >
            <defs>
              <filter id="selectedProvinceGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="3.2" floodColor="#60a5fa" floodOpacity="0.75" />
              </filter>
              <filter id="selectedProvinceStrongGlow" x="-45%" y="-45%" width="190%" height="190%">
                <feDropShadow dx="0" dy="0" stdDeviation="7.5" floodColor="#93c5fd" floodOpacity="0.95" />
              </filter>
              <marker id="qinDispatchArrowHead" markerWidth="10" markerHeight="8" refX="8.2" refY="4" orient="auto">
                <path d="M 0 0 L 10 4 L 0 8 z" fill="#3b82f6" />
              </marker>
            </defs>
            <g transform={`translate(${camera.tx} ${camera.ty}) scale(${camera.scale})`}>
              {levelRegions.map((region) => {
                const rs = regionStateByKey[region.key] ?? { owner: 'neutral' as Owner, value: 0 };
                const isSelected = selectedSources.includes(region.key);
                const territoryFaction = WARRING_TERRITORY_BY_ADM1[region.adm1];
                const territoryFill = territoryFaction ? warringColorById[territoryFaction] : OWNER_STYLE[rs.owner].fill;
                const isProvinceSelected = selectedProvinceKey === region.key;
                const isProvinceHovered = hoverProvinceKey === region.key;
                return (
                  <path
                    key={region.key}
                    d={region.path}
                    fill={territoryFill}
                    fillOpacity={isProvinceSelected ? 1 : isProvinceHovered ? 0.93 : 0.9}
                    stroke={isProvinceSelected ? '#ffffff' : isProvinceHovered ? '#f8fafc' : isSelected ? '#ffffff' : '#e5e7eb'}
                    strokeWidth={isProvinceSelected ? 3.8 : isProvinceHovered ? 2.3 : isSelected ? 1.45 : 1.2}
                    filter={isProvinceSelected ? 'url(#selectedProvinceStrongGlow)' : isProvinceHovered ? 'url(#selectedProvinceGlow)' : undefined}
                    onClick={() => onRegionClick(region.key)}
                    onMouseEnter={() => setHoverProvinceKey(region.key)}
                    onMouseLeave={() => setHoverProvinceKey((prev) => (prev === region.key ? null : prev))}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * VIEWBOX_W;
                      const y = ((e.clientY - rect.top) / rect.height) * VIEWBOX_H;
                      onRegionPointerDown(region.key, { x: (x - camera.tx) / camera.scale, y: (y - camera.ty) / camera.scale });
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      if (!touch) return;
                      const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
                      const x = ((touch.clientX - rect.left) / rect.width) * VIEWBOX_W;
                      const y = ((touch.clientY - rect.top) / rect.height) * VIEWBOX_H;
                      onRegionPointerDown(region.key, { x: (x - camera.tx) / camera.scale, y: (y - camera.ty) / camera.scale });
                    }}
                    style={{ cursor: 'pointer', opacity: 1 }}
                  />
                );
              })}
              {selectedProvinceKey && regionsByKey[selectedProvinceKey] && (
                <>
                  <path
                    d={regionsByKey[selectedProvinceKey].path}
                    fill="#ffffff"
                    fillOpacity={0.12}
                    stroke="none"
                    pointerEvents="none"
                  />
                  <path
                    d={regionsByKey[selectedProvinceKey].path}
                    fill="none"
                    stroke="#dbeafe"
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.65}
                    pointerEvents="none"
                  />
                  <path
                    d={regionsByKey[selectedProvinceKey].path}
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth={3.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.98}
                    pointerEvents="none"
                  />
                </>
              )}
              {qinDispatchArrow && (
                <line
                  x1={qinDispatchArrow.x1}
                  y1={qinDispatchArrow.y1}
                  x2={qinDispatchArrow.x2}
                  y2={qinDispatchArrow.y2}
                  stroke="#3b82f6"
                  strokeWidth={4 / camera.scale}
                  strokeLinecap="round"
                  markerEnd="url(#qinDispatchArrowHead)"
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
              {chuDispatchArrow && (
                <line
                  x1={chuDispatchArrow.x1}
                  y1={chuDispatchArrow.y1}
                  x2={chuDispatchArrow.x2}
                  y2={chuDispatchArrow.y2}
                  stroke="#0F766E"
                  strokeWidth={4 / camera.scale}
                  strokeLinecap="round"
                  markerEnd="url(#qinDispatchArrowHead)"
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
              {hanDispatchArrow && (
                <line
                  x1={hanDispatchArrow.x1}
                  y1={hanDispatchArrow.y1}
                  x2={hanDispatchArrow.x2}
                  y2={hanDispatchArrow.y2}
                  stroke="#DB2777"
                  strokeWidth={4 / camera.scale}
                  strokeLinecap="round"
                  markerEnd="url(#qinDispatchArrowHead)"
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
              {weiDispatchArrow && (
                <line
                  x1={weiDispatchArrow.x1}
                  y1={weiDispatchArrow.y1}
                  x2={weiDispatchArrow.x2}
                  y2={weiDispatchArrow.y2}
                  stroke="#DC2626"
                  strokeWidth={4 / camera.scale}
                  strokeLinecap="round"
                  markerEnd="url(#qinDispatchArrowHead)"
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
              {zhaoDispatchArrow && (
                <line
                  x1={zhaoDispatchArrow.x1}
                  y1={zhaoDispatchArrow.y1}
                  x2={zhaoDispatchArrow.x2}
                  y2={zhaoDispatchArrow.y2}
                  stroke="#7C3AED"
                  strokeWidth={4 / camera.scale}
                  strokeLinecap="round"
                  markerEnd="url(#qinDispatchArrowHead)"
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
              {qiDispatchArrow && (
                <line
                  x1={qiDispatchArrow.x1}
                  y1={qiDispatchArrow.y1}
                  x2={qiDispatchArrow.x2}
                  y2={qiDispatchArrow.y2}
                  stroke="#1D4ED8"
                  strokeWidth={4 / camera.scale}
                  strokeLinecap="round"
                  markerEnd="url(#qinDispatchArrowHead)"
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
              {yanDispatchArrow && (
                <line
                  x1={yanDispatchArrow.x1}
                  y1={yanDispatchArrow.y1}
                  x2={yanDispatchArrow.x2}
                  y2={yanDispatchArrow.y2}
                  stroke="#D97706"
                  strokeWidth={4 / camera.scale}
                  strokeLinecap="round"
                  markerEnd="url(#qinDispatchArrowHead)"
                  opacity={0.95}
                  pointerEvents="none"
                />
              )}
              {provinceFactionLabels.map((label) => (
                <text
                  key={`territory-label-${label.key}`}
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={label.fontSize}
                  fontWeight={900}
                  fill={label.color}
                  stroke="rgba(0,0,0,0.45)"
                  strokeWidth={2.4}
                  paintOrder="stroke"
                  pointerEvents="auto"
                  opacity={0.9}
                  onClick={() => onNationNodeClick(label.nationId)}
                  style={{ cursor: isAnyDispatchMode ? 'default' : 'pointer' }}
                >
                  {label.name}
                </text>
              ))}
              {visibleStationedGeneralMapTags.map((tag) => {
                const fill = warringColorById[tag.factionId];
                const text = generalTagLod === 'full'
                  ? `将:${tag.label}`
                  : generalTagLod === 'compact'
                    ? `将:${tag.names[0]}${tag.count > 1 ? `+${tag.count - 1}` : ''}`
                    : '';
                const boxH = generalTagLod === 'full' ? 28 / camera.scale : 22 / camera.scale;
                const fontSize = generalTagLod === 'full'
                  ? clamp(11, 17 / camera.scale, 20)
                  : clamp(10, 14 / camera.scale, 16);
                const width = generalTagLod === 'dot'
                  ? 10 / camera.scale
                  : Math.max(92 / camera.scale, (text.length * (generalTagLod === 'full' ? 16 : 12.5)) / camera.scale);
                return (
                  <g key={`stationed-general-${tag.key}`} pointerEvents="none">
                    {generalTagLod === 'dot' ? (
                      <circle
                        cx={tag.x}
                        cy={tag.y - 2 / camera.scale}
                        r={5.5 / camera.scale}
                        fill={fill}
                        stroke="#f8fafc"
                        strokeWidth={1.2 / camera.scale}
                      />
                    ) : (
                      <>
                        <rect
                          x={tag.x - width * 0.5}
                          y={tag.y - boxH * 0.7}
                          width={width}
                          height={boxH}
                          rx={6 / camera.scale}
                          fill={fill}
                          stroke="rgba(255,255,255,0.95)"
                          strokeWidth={2.2 / camera.scale}
                        />
                        <text
                          x={tag.x}
                          y={tag.y + 1.8 / camera.scale}
                          textAnchor="middle"
                          fontSize={fontSize}
                          fontWeight={900}
                          fill="#f8fafc"
                          paintOrder="stroke"
                          stroke="rgba(0,0,0,0.4)"
                          strokeWidth={0.8 / camera.scale}
                        >
                          {text}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
              {activeDispatchGroups.map((group) => {
                const dx = group.toPos.x - group.fromPos.x;
                const dy = group.toPos.y - group.fromPos.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const nx = -uy;
                const ny = ux;
                const mx = group.fromPos.x + dx * 0.5 + nx * (28 / camera.scale);
                const my = group.fromPos.y + dy * 0.5 + ny * (28 / camera.scale);
                const factionLabel = group.factionId === 'qin'
                  ? '秦'
                  : group.factionId === 'chu'
                    ? '楚'
                    : group.factionId === 'han'
                      ? '韩'
                      : group.factionId === 'wei'
                        ? '魏'
                        : group.factionId === 'zhao'
                          ? '赵'
                          : group.factionId === 'qi'
                            ? '齐'
                            : '燕';
                const labelText = `${factionLabel}·${group.commanderName || '未知将领'}`;
                const labelW = Math.max(120 / camera.scale, (labelText.length * 17) / camera.scale);
                const groupFill = warringColorById[group.factionId];
                return (
                  <g key={`dispatch-group-label-${group.groupId}`} pointerEvents="none">
                    <rect
                      x={mx - labelW * 0.5}
                      y={my - 18 / camera.scale}
                      width={labelW}
                      height={28 / camera.scale}
                      rx={6 / camera.scale}
                      fill={groupFill}
                      stroke="rgba(255,255,255,0.95)"
                      strokeWidth={1.6 / camera.scale}
                    />
                    <text
                      x={mx}
                      y={my + 1.5 / camera.scale}
                      textAnchor="middle"
                      fontSize={16 / camera.scale}
                      fontWeight={900}
                      fill="#f8fafc"
                      paintOrder="stroke"
                      stroke="rgba(0,0,0,0.35)"
                      strokeWidth={0.8 / camera.scale}
                    >
                      {labelText}
                    </text>
                  </g>
                );
              })}
              {dispatches.map((d) => {
                if (canceledDispatchIdsRef.current.has(d.id)) return null;
                const from = d.fromPos;
                const to = d.toPos;
                const pos = getDispatchRenderPosition(
                  d,
                  from,
                  to,
                  now,
                  { travelMs: d.travelMs, absorbDistance: 80 / camera.scale, emitSpreadRange: 50 / camera.scale, queueRowGap: 10 / camera.scale, queueColGap: 10 / camera.scale }
                );
                if (!pos || pos.t >= 1) return null;
                const x = pos.x;
                const y = pos.y;
                const glyph = d.factionId === 'qin'
                  ? '秦'
                  : d.factionId === 'chu'
                    ? '楚'
                    : d.factionId === 'han'
                      ? '韩'
                      : d.factionId === 'wei'
                        ? '魏'
                        : d.factionId === 'zhao'
                          ? '赵'
                          : d.factionId === 'qi'
                            ? '齐'
                            : '燕';
                const color = d.factionId === 'qin'
                  ? '#111111'
                  : d.factionId === 'chu'
                    ? '#0F766E'
                    : d.factionId === 'han'
                      ? '#DB2777'
                      : d.factionId === 'wei'
                        ? '#DC2626'
                        : d.factionId === 'zhao'
                          ? '#7C3AED'
                          : d.factionId === 'qi'
                            ? '#1D4ED8'
                            : '#D97706';
                return (
                  <text
                    key={d.id}
                    x={x}
                    y={y + (DISPATCH_QIN_GLYPH_SIZE_PX * 0.22) / camera.scale}
                    textAnchor="middle"
                    fontSize={Math.max(14 / camera.scale, DISPATCH_QIN_GLYPH_SIZE_PX / camera.scale)}
                    fontWeight={900}
                    fill={color}
                    opacity={0.96}
                  >
                    {glyph}
                  </text>
                );
              })}
            </g>
          </svg>
          <div className="absolute right-2 bottom-24 z-20 flex flex-col gap-2 md:right-6 md:bottom-6">
            <button
              type="button"
              onClick={() => applyZoomAt(zoom * 1.12, { x: VIEWBOX_W * 0.5, y: VIEWBOX_H * 0.53 })}
              className="h-10 w-10 rounded-lg border border-[#8f9198] bg-[#d8d9de] text-[#2e3139] text-xl font-bold"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => applyZoomAt(zoom * 0.9, { x: VIEWBOX_W * 0.5, y: VIEWBOX_H * 0.53 })}
              className="h-10 w-10 rounded-lg border border-[#8f9198] bg-[#d8d9de] text-[#2e3139] text-xl font-bold"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(cameraDefaultZoom);
                setCameraCenterWorld({ x: cameraBase.centerX, y: cameraBase.centerY });
              }}
              className="h-8 px-2 rounded-lg border border-[#8f9198] bg-[#d8d9de] text-[#2e3139] text-[10px] font-semibold"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => setShowAllGeneralTags((prev) => !prev)}
              className="h-8 px-2 rounded-lg border border-[#8f9198] bg-[#d8d9de] text-[#2e3139] text-[10px] font-semibold"
            >
              将领标签:{showAllGeneralTags ? '全部' : '当前国'}
            </button>
          </div>
          {selectedProvincePanel && (
            <aside
              className="absolute left-2 right-2 top-16 z-20 max-h-[46dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:top-6 md:w-[280px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(selectedProvincePanel.factionColor)}
            >
              <div className="mb-2 h-1.5 w-full rounded-full" style={{ backgroundColor: selectedProvincePanel.factionColor }} />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.1em] text-[#6b7280]">省点详情</div>
                  <div className="mt-1 text-2xl font-black leading-none" style={{ color: selectedProvincePanel.factionColor }}>
                    {selectedProvincePanel.provinceName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProvinceKey(null)}
                  className="h-8 w-8 rounded-lg border-2 text-sm font-black"
                  style={{ borderColor: selectedProvincePanel.factionColor, color: selectedProvincePanel.factionColor }}
                  aria-label="关闭详情"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-1"
                    style={{ borderColor: hexToRgba(selectedProvincePanel.factionColor, 0.45) }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedProvincePanel.factionColor }} />
                    {selectedProvincePanel.factionName}
                  </span>
                  <span
                    className="rounded-full border px-2 py-1"
                    style={{ borderColor: hexToRgba(selectedProvincePanel.factionColor, 0.45) }}
                  >
                    省份详情
                  </span>
                </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border p-2" style={{ borderColor: hexToRgba(selectedProvincePanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">兵力</div>
                  <div className="mt-1 text-xl font-black">{selectedProvincePanel.troops}</div>
                </div>
                <div className="rounded-xl border p-2" style={{ borderColor: hexToRgba(selectedProvincePanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">粮草</div>
                  <div className="mt-1 text-xl font-black">{selectedProvincePanel.grain}</div>
                </div>
                <div className="rounded-xl border p-2" style={{ borderColor: hexToRgba(selectedProvincePanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">经济产量</div>
                  <div className="mt-1 text-xl font-black">+{selectedProvincePanel.economyPerSec}/s</div>
                </div>
                <div className="rounded-xl border p-2" style={{ borderColor: hexToRgba(selectedProvincePanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">将领</div>
                  <div className="mt-1 text-xl font-black">{selectedProvincePanel.generals}</div>
                </div>
              </div>
            </aside>
          )}
          {selectedNationPanel && (
            <aside
              className="absolute left-2 right-2 top-16 z-20 max-h-[52dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:top-6 md:w-[310px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(selectedNationPanel.factionColor)}
            >
              <div className="mb-2 h-1.5 w-full rounded-full" style={{ backgroundColor: selectedNationPanel.factionColor }} />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.1em] text-[#6b7280]">国家总览</div>
                  <div className="mt-1 text-2xl font-black leading-none" style={{ color: selectedNationPanel.factionColor }}>
                    {selectedNationPanel.factionName}国军政总览
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNationId(null)}
                  className="h-8 w-8 rounded-lg border-2 text-sm font-black"
                  style={{ borderColor: selectedNationPanel.factionColor, color: selectedNationPanel.factionColor }}
                  aria-label="关闭国家总览"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-1"
                  style={{ borderColor: hexToRgba(selectedNationPanel.factionColor, 0.45) }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectedNationPanel.factionColor }} />
                  首都：{selectedNationPanel.capitalName}
                </span>
                <span
                  className="rounded-full border px-2 py-1"
                  style={{ borderColor: hexToRgba(selectedNationPanel.factionColor, 0.45) }}
                >
                  占领省：{selectedNationPanel.occupiedProvinceCount}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border p-2" style={{ borderColor: hexToRgba(selectedNationPanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">总兵力</div>
                  <div className="mt-1 text-xl font-black">{selectedNationPanel.totalTroops}</div>
                </div>
                <div className="rounded-xl border p-2" style={{ borderColor: hexToRgba(selectedNationPanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">总粮草</div>
                  <div className="mt-1 text-xl font-black">{selectedNationPanel.grain}</div>
                </div>
                <div className="rounded-xl border p-2" style={{ borderColor: hexToRgba(selectedNationPanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">经济库存</div>
                  <div className="mt-1 text-xl font-black">{selectedNationPanel.economyStock}</div>
                </div>
                <div className="rounded-xl border p-2" style={{ borderColor: hexToRgba(selectedNationPanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">经济产出</div>
                  <div className="mt-1 text-xl font-black">+{selectedNationPanel.economyPerSec}/s</div>
                </div>
                <div className="rounded-xl border p-2 col-span-2" style={{ borderColor: hexToRgba(selectedNationPanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">将领数</div>
                  <div className="mt-1 text-xl font-black">{selectedNationPanel.generals}（空闲{selectedNationPanel.generalIdle}/出征{selectedNationPanel.generalMarching}）</div>
                </div>
                <div className="rounded-xl border p-2 col-span-2" style={{ borderColor: hexToRgba(selectedNationPanel.factionColor, 0.45) }}>
                  <div className="text-[11px] text-[#6b7280]">将领名单</div>
                  <div className="mt-1 text-sm font-semibold leading-5">
                    {selectedNationPanel.generalNames.length > 0 ? selectedNationPanel.generalNames.join('、') : '暂无'}
                  </div>
                </div>
              </div>
            </aside>
          )}
          {playerFactionId === 'qin' && (selectedProvincePanel?.factionId === 'qin' || selectedNationPanel?.factionId === 'qin') && (
            <aside
              className="absolute left-2 right-2 bottom-2 z-20 max-h-[38dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:bottom-6 md:w-[420px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(warringColorById.qin)}
            >
              <div className="text-[11px] text-[#6b7280]">
                {qinOpMode === 'ops' ? '秦国运营操作（经济驱动）' : qinOpMode === 'dispatch' ? '秦国出征面板（需将领已配兵）' : '秦国兵力分配面板'}
              </div>
              {qinOpMode === 'ops' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('recruit');
                      recruitQinTroops(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'recruit'
                        ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1e3a8a] ring-2 ring-[#93c5fd] shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    征兵+40（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('grain');
                      buyQinGrain(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'grain'
                        ? 'border-[#0f766e] bg-[#ccfbf1] text-[#134e4a] ring-2 ring-[#5eead4] shadow-[0_0_0_2px_rgba(20,184,166,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    购粮+60（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('hire');
                      hireQinGeneral();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'hire'
                        ? 'border-[#7c3aed] bg-[#ede9fe] text-[#4c1d95] ring-2 ring-[#c4b5fd] shadow-[0_0_0_2px_rgba(124,58,237,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    招将65%（-{qinInit.economyCosts.generalHireCost}经，S/A/B/C概率6/20/34/40，失败返50%）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('dispatch');
                      openQinDispatchPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'dispatch'
                        ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    出征
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('assign');
                      openQinAssignPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'assign'
                        ? 'border-[#15803d] bg-[#dcfce7] text-[#14532d] ring-2 ring-[#86efac] shadow-[0_0_0_2px_rgba(34,197,94,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    分配兵力
                  </button>
                </div>
              ) : qinOpMode === 'dispatch' ? (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    {qinDispatchPickStage === 'to' && '步骤1：在地图点击目标省，箭头会从当前选中出兵省指向目标'}
                    {qinDispatchPickStage === 'config' && '步骤2：选择将领后直接派其已分配部队出征'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">出发省</div>
                      <div className="mt-1 font-semibold">{qinDispatchFromKey ? (regionsByKey[qinDispatchFromKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">目标省</div>
                      <div className="mt-1 font-semibold">{qinDispatchToKey ? (regionsByKey[qinDispatchToKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px]">
                    <div className="text-[#6b7280]">出征兵力</div>
                    <div className="mt-1 font-semibold">将领已分配部队：{qinDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#6b7280]">消耗粮草：{qinDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#374151]">部队总战斗力：{qinDispatchCombatPower}</div>
                  </div>
                  <label className="block">
                    出征将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={qinDispatchGeneralId}
                      onChange={(e) => setQinDispatchGeneralId(e.target.value)}
                    >
                      {qinDispatchAvailableGenerals.map((general) => (
                        <option key={`general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（{getGeneralLocationLabel(general)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQinDispatchPickStage('to')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      重选目标省
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!qinDispatchGeneralId || !qinDispatchCanConfirm}
                      onClick={() => {
                        flashOpButton('dispatchConfirm');
                        confirmQinDispatch();
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                        activeOpButton === 'dispatchConfirm'
                          ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                          : 'border-[#131313] bg-white text-[#111827]'
                      }`}
                    >
                      确认出征
                    </button>
                    <button
                      type="button"
                      onClick={() => setQinOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    步骤：先选择将领，再分配统领兵力；未被将领统领的兵力不可出征
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">分配省</div>
                      <div className="mt-1 font-semibold">{qinAssignProvinceKey ? (regionsByKey[qinAssignProvinceKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">省兵力</div>
                      <div className="mt-1 font-semibold">{qinAssignProvinceTroops}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px] text-[#4b5563]">
                    已分配：{qinAssignedTroopsByProvince[qinAssignProvinceKey] ?? 0}，未分配：{Math.max(0, qinAssignProvinceTroops - (qinAssignedTroopsByProvince[qinAssignProvinceKey] ?? 0))}
                    <div className="mt-1">该省已分配总战斗力：{qinAssignProvinceCombatPower}</div>
                  </div>
                  <label className="block">
                    分配将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={qinAssignGeneralId}
                      onChange={(e) => setQinAssignGeneralId(e.target.value)}
                    >
                      {qinIdleGeneralsInAssignProvince.length <= 0 && (
                        <option value="">该省暂无空闲将领</option>
                      )}
                      {qinIdleGeneralsInAssignProvince.map((general) => (
                        <option key={`assign-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（上限{Math.floor(general.troopCap ?? 0)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    统领兵力
                    <input
                      className="mt-1 w-full"
                      type="range"
                      min={0}
                      max={Math.max(0, qinAssignMaxTroops)}
                      step={1}
                      value={Math.min(qinAssignTroops, qinAssignMaxTroops)}
                      onChange={(e) => setQinAssignTroops(Number(e.target.value))}
                    />
                    <div className="mt-1 text-[10px] text-[#6b7280]">
                      当前分配：{qinAssignTroops}，该将上限：{qinAssignGeneralCap}，当前最大可配：{qinAssignMaxTroops}
                    </div>
                    <div className="mt-1 text-[10px] text-[#374151]">当前分配战斗力：{qinAssignCombatPower}</div>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!qinAssignGeneralId}
                      onClick={applyQinTroopAssignment}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      确认分配
                    </button>
                    <button
                      type="button"
                      onClick={() => setQinOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 text-[10px] text-[#374151]">{qinHireResult || '尚未招募将领'}</div>
              <div className="mt-2 text-[10px] text-[#6b7280]">秦国经济库存：{Math.floor(qinEconomy)}</div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                已招募：{qinGenerals.length > 0 ? qinGenerals.map((general) => `${general.name}(${getGeneralLocationLabel(general)})`).join('、') : '无'}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                将领状态：空闲 {qinIdleGeneralCount} / 出征中 {qinMarchingGeneralCount}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">在途部队：{qinInTransitGroups.length}</div>
              {qinInTransitGroups.length > 0 && (
                <div className="mt-2 max-h-[110px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {qinInTransitGroups.map((group) => {
                    const remainSec = Math.max(0, (group.endAt - now) / 1000);
                    const fromLabel = regionsByKey[group.fromKey]?.label ?? '未知省';
                    const toLabel = regionsByKey[group.toKey]?.label ?? '未知省';
                    return (
                      <div key={`qin-transit-${group.groupId}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                        <div className="font-semibold text-[#111827]">{group.commanderName || '未知将领'}</div>
                        <div className="text-[#6b7280]">{fromLabel} → {toLabel}（剩余{remainSec.toFixed(1)}s）</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {qinGenerals.length > 0 && (
                <div className="mt-2 max-h-[120px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {qinGenerals.map((general) => (
                    <div key={`qin-general-stat-${general.id}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                      <div className="font-semibold text-[#111827]">
                        {general.name} {general.tier ? `(${general.tier}档)` : ''}
                      </div>
                      <div className="text-[#6b7280]">
                        统率{general.command ?? '-'} 军略{general.strategy ?? '-'} 后勤{general.logistics ?? '-'} 机动{general.mobility ?? '-'} 维护{general.upkeepPerTurn ?? '-'} 统兵{Math.floor(general.assignedTroops ?? 0)}/{Math.floor(general.troopCap ?? 0)}
                      </div>
                      <div className="text-[#6b7280]">所在：{getGeneralLocationLabel(general)}</div>
                      <div className="text-[#374151]">当前战斗力：{computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general)}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
          {playerFactionId === 'chu' && (selectedProvincePanel?.factionId === 'chu' || selectedNationPanel?.factionId === 'chu') && (
            <aside
              className="absolute left-2 right-2 bottom-2 z-20 max-h-[38dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:bottom-6 md:w-[420px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(warringColorById.chu)}
            >
              <div className="text-[11px] text-[#6b7280]">
                {chuOpMode === 'ops' ? '楚国运营操作（经济驱动）' : chuOpMode === 'dispatch' ? '楚国出征面板（需将领已配兵）' : '楚国兵力分配面板'}
              </div>
              {chuOpMode === 'ops' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('recruit');
                      recruitChuTroops(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'recruit'
                        ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1e3a8a] ring-2 ring-[#93c5fd] shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    征兵+40（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('grain');
                      buyChuGrain(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'grain'
                        ? 'border-[#0f766e] bg-[#ccfbf1] text-[#134e4a] ring-2 ring-[#5eead4] shadow-[0_0_0_2px_rgba(20,184,166,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    购粮+80（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('hire');
                      hireChuGeneral();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'hire'
                        ? 'border-[#7c3aed] bg-[#ede9fe] text-[#4c1d95] ring-2 ring-[#c4b5fd] shadow-[0_0_0_2px_rgba(124,58,237,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    招将65%（-{chuInit.economyCosts.generalHireCost}经，S/A/B/C概率6/20/34/40，失败返50%）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('dispatch');
                      openChuDispatchPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'dispatch'
                        ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    出征
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('assign');
                      openChuAssignPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'assign'
                        ? 'border-[#15803d] bg-[#dcfce7] text-[#14532d] ring-2 ring-[#86efac] shadow-[0_0_0_2px_rgba(34,197,94,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    分配兵力
                  </button>
                </div>
              ) : chuOpMode === 'dispatch' ? (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    {chuDispatchPickStage === 'to' && '步骤1：在地图点击目标省，箭头会从当前选中出兵省指向目标'}
                    {chuDispatchPickStage === 'config' && '步骤2：选择将领后直接派其已分配部队出征'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">出发省</div>
                      <div className="mt-1 font-semibold">{chuDispatchFromKey ? (regionsByKey[chuDispatchFromKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">目标省</div>
                      <div className="mt-1 font-semibold">{chuDispatchToKey ? (regionsByKey[chuDispatchToKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px]">
                    <div className="text-[#6b7280]">出征兵力</div>
                    <div className="mt-1 font-semibold">将领已分配部队：{chuDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#6b7280]">消耗粮草：{chuDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#374151]">部队总战斗力：{chuDispatchCombatPower}</div>
                  </div>
                  <label className="block">
                    出征将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={chuDispatchGeneralId}
                      onChange={(e) => setChuDispatchGeneralId(e.target.value)}
                    >
                      {chuDispatchAvailableGenerals.length <= 0 && (
                        <option value="">该省暂无可出征将领</option>
                      )}
                      {chuDispatchAvailableGenerals.map((general) => (
                        <option key={`chu-dispatch-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（{getGeneralLocationLabel(general)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setChuDispatchPickStage('to')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      重选目标省
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!chuDispatchGeneralId || !chuDispatchCanConfirm}
                      onClick={() => {
                        flashOpButton('dispatchConfirm');
                        confirmChuDispatch();
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                        activeOpButton === 'dispatchConfirm'
                          ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                          : 'border-[#131313] bg-white text-[#111827]'
                      }`}
                    >
                      确认出征
                    </button>
                    <button
                      type="button"
                      onClick={() => setChuOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    步骤：先选择将领，再分配统领兵力；未被将领统领的兵力不可出征
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">分配省</div>
                      <div className="mt-1 font-semibold">{chuAssignProvinceKey ? (regionsByKey[chuAssignProvinceKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">省兵力</div>
                      <div className="mt-1 font-semibold">{chuAssignProvinceTroops}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px] text-[#4b5563]">
                    已分配：{chuAssignedTroopsByProvince[chuAssignProvinceKey] ?? 0}，未分配：{Math.max(0, chuAssignProvinceTroops - (chuAssignedTroopsByProvince[chuAssignProvinceKey] ?? 0))}
                    <div className="mt-1">该省已分配总战斗力：{chuAssignProvinceCombatPower}</div>
                  </div>
                  <label className="block">
                    分配将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={chuAssignGeneralId}
                      onChange={(e) => setChuAssignGeneralId(e.target.value)}
                    >
                      {chuIdleGeneralsInAssignProvince.length <= 0 && (
                        <option value="">该省暂无空闲将领</option>
                      )}
                      {chuIdleGeneralsInAssignProvince.map((general) => (
                        <option key={`chu-assign-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（上限{Math.floor(general.troopCap ?? 0)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    统领兵力
                    <input
                      className="mt-1 w-full"
                      type="range"
                      min={0}
                      max={Math.max(0, chuAssignMaxTroops)}
                      step={1}
                      value={Math.min(chuAssignTroops, chuAssignMaxTroops)}
                      onChange={(e) => setChuAssignTroops(Number(e.target.value))}
                    />
                    <div className="mt-1 text-[10px] text-[#6b7280]">
                      当前分配：{chuAssignTroops}，该将上限：{chuAssignGeneralCap}，当前最大可配：{chuAssignMaxTroops}
                    </div>
                    <div className="mt-1 text-[10px] text-[#374151]">当前分配战斗力：{chuAssignCombatPower}</div>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!chuAssignGeneralId}
                      onClick={applyChuTroopAssignment}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      确认分配
                    </button>
                    <button
                      type="button"
                      onClick={() => setChuOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 text-[10px] text-[#374151]">{chuHireResult || '尚未招募将领'}</div>
              <div className="mt-2 text-[10px] text-[#6b7280]">楚国经济库存：{Math.floor(chuEconomy)}</div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                已招募：{chuGenerals.length > 0 ? chuGenerals.map((general) => `${general.name}(${getGeneralLocationLabel(general)})`).join('、') : '无'}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                将领状态：空闲 {chuIdleGeneralCount} / 出征中 {chuMarchingGeneralCount}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">在途部队：{chuInTransitGroups.length}</div>
              {chuInTransitGroups.length > 0 && (
                <div className="mt-2 max-h-[110px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {chuInTransitGroups.map((group) => {
                    const remainSec = Math.max(0, (group.endAt - now) / 1000);
                    const fromLabel = regionsByKey[group.fromKey]?.label ?? '未知省';
                    const toLabel = regionsByKey[group.toKey]?.label ?? '未知省';
                    return (
                      <div key={`chu-transit-${group.groupId}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                        <div className="font-semibold text-[#111827]">{group.commanderName || '未知将领'}</div>
                        <div className="text-[#6b7280]">{fromLabel} → {toLabel}（剩余{remainSec.toFixed(1)}s）</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {chuGenerals.length > 0 && (
                <div className="mt-2 max-h-[120px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {chuGenerals.map((general) => (
                    <div key={`chu-general-stat-${general.id}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                      <div className="font-semibold text-[#111827]">
                        {general.name} {general.tier ? `(${general.tier}档)` : ''}
                      </div>
                      <div className="text-[#6b7280]">
                        统率{general.command ?? '-'} 军略{general.strategy ?? '-'} 后勤{general.logistics ?? '-'} 机动{general.mobility ?? '-'} 维护{general.upkeepPerTurn ?? '-'} 统兵{Math.floor(general.assignedTroops ?? 0)}/{Math.floor(general.troopCap ?? 0)}
                      </div>
                      <div className="text-[#6b7280]">所在：{getGeneralLocationLabel(general)}</div>
                      <div className="text-[#374151]">当前战斗力：{computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general)}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
          {playerFactionId === 'han' && (selectedProvincePanel?.factionId === 'han' || selectedNationPanel?.factionId === 'han') && (
            <aside
              className="absolute left-2 right-2 bottom-2 z-20 max-h-[38dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:bottom-6 md:w-[420px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(warringColorById.han)}
            >
              <div className="text-[11px] text-[#6b7280]">
                {hanOpMode === 'ops' ? '韩国运营操作（经济驱动）' : hanOpMode === 'dispatch' ? '韩国出征面板（需将领已配兵）' : '韩国兵力分配面板'}
              </div>
              {hanOpMode === 'ops' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('recruit');
                      recruitHanTroops(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'recruit'
                        ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1e3a8a] ring-2 ring-[#93c5fd] shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    征兵+40（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('grain');
                      buyHanGrain(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'grain'
                        ? 'border-[#0f766e] bg-[#ccfbf1] text-[#134e4a] ring-2 ring-[#5eead4] shadow-[0_0_0_2px_rgba(20,184,166,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    购粮+60（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('hire');
                      hireHanGeneral();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'hire'
                        ? 'border-[#7c3aed] bg-[#ede9fe] text-[#4c1d95] ring-2 ring-[#c4b5fd] shadow-[0_0_0_2px_rgba(124,58,237,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    招将65%（-{hanInit.economyCosts.generalHireCost}经，S/A/B/C概率6/20/34/40，失败返50%）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('dispatch');
                      openHanDispatchPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'dispatch'
                        ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    出征
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('assign');
                      openHanAssignPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'assign'
                        ? 'border-[#15803d] bg-[#dcfce7] text-[#14532d] ring-2 ring-[#86efac] shadow-[0_0_0_2px_rgba(34,197,94,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    分配兵力
                  </button>
                </div>
              ) : hanOpMode === 'dispatch' ? (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    {hanDispatchPickStage === 'to' && '步骤1：在地图点击目标省，箭头会从当前选中出兵省指向目标'}
                    {hanDispatchPickStage === 'config' && '步骤2：选择将领后直接派其已分配部队出征'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">出发省</div>
                      <div className="mt-1 font-semibold">{hanDispatchFromKey ? (regionsByKey[hanDispatchFromKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">目标省</div>
                      <div className="mt-1 font-semibold">{hanDispatchToKey ? (regionsByKey[hanDispatchToKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px]">
                    <div className="text-[#6b7280]">出征兵力</div>
                    <div className="mt-1 font-semibold">将领已分配部队：{hanDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#6b7280]">消耗粮草：{hanDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#374151]">部队总战斗力：{hanDispatchCombatPower}</div>
                  </div>
                  <label className="block">
                    出征将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={hanDispatchGeneralId}
                      onChange={(e) => setHanDispatchGeneralId(e.target.value)}
                    >
                      {hanDispatchAvailableGenerals.length <= 0 && (
                        <option value="">该省暂无可出征将领</option>
                      )}
                      {hanDispatchAvailableGenerals.map((general) => (
                        <option key={`han-dispatch-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（{getGeneralLocationLabel(general)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setHanDispatchPickStage('to')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      重选目标省
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!hanDispatchGeneralId || !hanDispatchCanConfirm}
                      onClick={() => {
                        flashOpButton('dispatchConfirm');
                        confirmHanDispatch();
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                        activeOpButton === 'dispatchConfirm'
                          ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                          : 'border-[#131313] bg-white text-[#111827]'
                      }`}
                    >
                      确认出征
                    </button>
                    <button
                      type="button"
                      onClick={() => setHanOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    步骤：先选择将领，再分配统领兵力；未被将领统领的兵力不可出征
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">分配省</div>
                      <div className="mt-1 font-semibold">{hanAssignProvinceKey ? (regionsByKey[hanAssignProvinceKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">省兵力</div>
                      <div className="mt-1 font-semibold">{hanAssignProvinceTroops}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px] text-[#4b5563]">
                    已分配：{hanAssignedTroopsByProvince[hanAssignProvinceKey] ?? 0}，未分配：{Math.max(0, hanAssignProvinceTroops - (hanAssignedTroopsByProvince[hanAssignProvinceKey] ?? 0))}
                    <div className="mt-1">该省已分配总战斗力：{hanAssignProvinceCombatPower}</div>
                  </div>
                  <label className="block">
                    分配将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={hanAssignGeneralId}
                      onChange={(e) => setHanAssignGeneralId(e.target.value)}
                    >
                      {hanIdleGeneralsInAssignProvince.length <= 0 && (
                        <option value="">该省暂无空闲将领</option>
                      )}
                      {hanIdleGeneralsInAssignProvince.map((general) => (
                        <option key={`han-assign-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（上限{Math.floor(general.troopCap ?? 0)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    统领兵力
                    <input
                      className="mt-1 w-full"
                      type="range"
                      min={0}
                      max={Math.max(0, hanAssignMaxTroops)}
                      step={1}
                      value={Math.min(hanAssignTroops, hanAssignMaxTroops)}
                      onChange={(e) => setHanAssignTroops(Number(e.target.value))}
                    />
                    <div className="mt-1 text-[10px] text-[#6b7280]">
                      当前分配：{hanAssignTroops}，该将上限：{hanAssignGeneralCap}，当前最大可配：{hanAssignMaxTroops}
                    </div>
                    <div className="mt-1 text-[10px] text-[#374151]">当前分配战斗力：{hanAssignCombatPower}</div>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!hanAssignGeneralId}
                      onClick={applyHanTroopAssignment}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      确认分配
                    </button>
                    <button
                      type="button"
                      onClick={() => setHanOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 text-[10px] text-[#374151]">{hanHireResult || '尚未招募将领'}</div>
              <div className="mt-2 text-[10px] text-[#6b7280]">韩国经济库存：{Math.floor(hanEconomy)}</div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                已招募：{hanGenerals.length > 0 ? hanGenerals.map((general) => `${general.name}(${getGeneralLocationLabel(general)})`).join('、') : '无'}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                将领状态：空闲 {hanIdleGeneralCount} / 出征中 {hanMarchingGeneralCount}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">在途部队：{hanInTransitGroups.length}</div>
              {hanInTransitGroups.length > 0 && (
                <div className="mt-2 max-h-[110px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {hanInTransitGroups.map((group) => {
                    const remainSec = Math.max(0, (group.endAt - now) / 1000);
                    const fromLabel = regionsByKey[group.fromKey]?.label ?? '未知省';
                    const toLabel = regionsByKey[group.toKey]?.label ?? '未知省';
                    return (
                      <div key={`han-transit-${group.groupId}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                        <div className="font-semibold text-[#111827]">{group.commanderName || '未知将领'}</div>
                        <div className="text-[#6b7280]">{fromLabel} → {toLabel}（剩余{remainSec.toFixed(1)}s）</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {hanGenerals.length > 0 && (
                <div className="mt-2 max-h-[120px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {hanGenerals.map((general) => (
                    <div key={`han-general-stat-${general.id}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                      <div className="font-semibold text-[#111827]">
                        {general.name} {general.tier ? `(${general.tier}档)` : ''}
                      </div>
                      <div className="text-[#6b7280]">
                        统率{general.command ?? '-'} 军略{general.strategy ?? '-'} 后勤{general.logistics ?? '-'} 机动{general.mobility ?? '-'} 维护{general.upkeepPerTurn ?? '-'} 统兵{Math.floor(general.assignedTroops ?? 0)}/{Math.floor(general.troopCap ?? 0)}
                      </div>
                      <div className="text-[#6b7280]">所在：{getGeneralLocationLabel(general)}</div>
                      <div className="text-[#374151]">当前战斗力：{computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general)}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
          {playerFactionId === 'wei' && (selectedProvincePanel?.factionId === 'wei' || selectedNationPanel?.factionId === 'wei') && (
            <aside
              className="absolute left-2 right-2 bottom-2 z-20 max-h-[38dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:bottom-6 md:w-[420px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(warringColorById.wei)}
            >
              <div className="text-[11px] text-[#6b7280]">
                {weiOpMode === 'ops' ? '魏国运营操作（经济驱动）' : weiOpMode === 'dispatch' ? '魏国出征面板（需将领已配兵）' : '魏国兵力分配面板'}
              </div>
              {weiOpMode === 'ops' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('recruit');
                      recruitWeiTroops(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'recruit'
                        ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1e3a8a] ring-2 ring-[#93c5fd] shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    征兵+40（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('grain');
                      buyWeiGrain(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'grain'
                        ? 'border-[#0f766e] bg-[#ccfbf1] text-[#134e4a] ring-2 ring-[#5eead4] shadow-[0_0_0_2px_rgba(20,184,166,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    购粮+60（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('hire');
                      hireWeiGeneral();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'hire'
                        ? 'border-[#7c3aed] bg-[#ede9fe] text-[#4c1d95] ring-2 ring-[#c4b5fd] shadow-[0_0_0_2px_rgba(124,58,237,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    招将65%（-{weiInit.economyCosts.generalHireCost}经，S/A/B/C概率6/20/34/40，失败返50%）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('dispatch');
                      openWeiDispatchPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'dispatch'
                        ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    出征
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('assign');
                      openWeiAssignPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'assign'
                        ? 'border-[#15803d] bg-[#dcfce7] text-[#14532d] ring-2 ring-[#86efac] shadow-[0_0_0_2px_rgba(34,197,94,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    分配兵力
                  </button>
                </div>
              ) : weiOpMode === 'dispatch' ? (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    {weiDispatchPickStage === 'to' && '步骤1：在地图点击目标省，箭头会从当前选中出兵省指向目标'}
                    {weiDispatchPickStage === 'config' && '步骤2：选择将领后直接派其已分配部队出征'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">出发省</div>
                      <div className="mt-1 font-semibold">{weiDispatchFromKey ? (regionsByKey[weiDispatchFromKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">目标省</div>
                      <div className="mt-1 font-semibold">{weiDispatchToKey ? (regionsByKey[weiDispatchToKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px]">
                    <div className="text-[#6b7280]">出征兵力</div>
                    <div className="mt-1 font-semibold">将领已分配部队：{weiDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#6b7280]">消耗粮草：{weiDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#374151]">部队总战斗力：{weiDispatchCombatPower}</div>
                  </div>
                  <label className="block">
                    出征将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={weiDispatchGeneralId}
                      onChange={(e) => setWeiDispatchGeneralId(e.target.value)}
                    >
                      {weiDispatchAvailableGenerals.length <= 0 && (
                        <option value="">该省暂无可出征将领</option>
                      )}
                      {weiDispatchAvailableGenerals.map((general) => (
                        <option key={`wei-dispatch-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（{getGeneralLocationLabel(general)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setWeiDispatchPickStage('to')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      重选目标省
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!weiDispatchGeneralId || !weiDispatchCanConfirm}
                      onClick={() => {
                        flashOpButton('dispatchConfirm');
                        confirmWeiDispatch();
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                        activeOpButton === 'dispatchConfirm'
                          ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                          : 'border-[#131313] bg-white text-[#111827]'
                      }`}
                    >
                      确认出征
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeiOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    步骤：先选择将领，再分配统领兵力；未被将领统领的兵力不可出征
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">分配省</div>
                      <div className="mt-1 font-semibold">{weiAssignProvinceKey ? (regionsByKey[weiAssignProvinceKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">省兵力</div>
                      <div className="mt-1 font-semibold">{weiAssignProvinceTroops}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px] text-[#4b5563]">
                    已分配：{weiAssignedTroopsByProvince[weiAssignProvinceKey] ?? 0}，未分配：{Math.max(0, weiAssignProvinceTroops - (weiAssignedTroopsByProvince[weiAssignProvinceKey] ?? 0))}
                    <div className="mt-1">该省已分配总战斗力：{weiAssignProvinceCombatPower}</div>
                  </div>
                  <label className="block">
                    分配将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={weiAssignGeneralId}
                      onChange={(e) => setWeiAssignGeneralId(e.target.value)}
                    >
                      {weiIdleGeneralsInAssignProvince.length <= 0 && (
                        <option value="">该省暂无空闲将领</option>
                      )}
                      {weiIdleGeneralsInAssignProvince.map((general) => (
                        <option key={`wei-assign-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（上限{Math.floor(general.troopCap ?? 0)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    统领兵力
                    <input
                      className="mt-1 w-full"
                      type="range"
                      min={0}
                      max={Math.max(0, weiAssignMaxTroops)}
                      step={1}
                      value={Math.min(weiAssignTroops, weiAssignMaxTroops)}
                      onChange={(e) => setWeiAssignTroops(Number(e.target.value))}
                    />
                    <div className="mt-1 text-[10px] text-[#6b7280]">
                      当前分配：{weiAssignTroops}，该将上限：{weiAssignGeneralCap}，当前最大可配：{weiAssignMaxTroops}
                    </div>
                    <div className="mt-1 text-[10px] text-[#374151]">当前分配战斗力：{weiAssignCombatPower}</div>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!weiAssignGeneralId}
                      onClick={applyWeiTroopAssignment}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      确认分配
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeiOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 text-[10px] text-[#374151]">{weiHireResult || '尚未招募将领'}</div>
              <div className="mt-2 text-[10px] text-[#6b7280]">魏国经济库存：{Math.floor(weiEconomy)}</div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                已招募：{weiGenerals.length > 0 ? weiGenerals.map((general) => `${general.name}(${getGeneralLocationLabel(general)})`).join('、') : '无'}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                将领状态：空闲 {weiIdleGeneralCount} / 出征中 {weiMarchingGeneralCount}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">在途部队：{weiInTransitGroups.length}</div>
              {weiInTransitGroups.length > 0 && (
                <div className="mt-2 max-h-[110px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {weiInTransitGroups.map((group) => {
                    const remainSec = Math.max(0, (group.endAt - now) / 1000);
                    const fromLabel = regionsByKey[group.fromKey]?.label ?? '未知省';
                    const toLabel = regionsByKey[group.toKey]?.label ?? '未知省';
                    return (
                      <div key={`wei-transit-${group.groupId}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                        <div className="font-semibold text-[#111827]">{group.commanderName || '未知将领'}</div>
                        <div className="text-[#6b7280]">{fromLabel} → {toLabel}（剩余{remainSec.toFixed(1)}s）</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {weiGenerals.length > 0 && (
                <div className="mt-2 max-h-[120px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {weiGenerals.map((general) => (
                    <div key={`wei-general-stat-${general.id}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                      <div className="font-semibold text-[#111827]">
                        {general.name} {general.tier ? `(${general.tier}档)` : ''}
                      </div>
                      <div className="text-[#6b7280]">
                        统率{general.command ?? '-'} 军略{general.strategy ?? '-'} 后勤{general.logistics ?? '-'} 机动{general.mobility ?? '-'} 维护{general.upkeepPerTurn ?? '-'} 统兵{Math.floor(general.assignedTroops ?? 0)}/{Math.floor(general.troopCap ?? 0)}
                      </div>
                      <div className="text-[#6b7280]">所在：{getGeneralLocationLabel(general)}</div>
                      <div className="text-[#374151]">当前战斗力：{computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general)}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
          {playerFactionId === 'zhao' && (selectedProvincePanel?.factionId === 'zhao' || selectedNationPanel?.factionId === 'zhao') && (
            <aside
              className="absolute left-2 right-2 bottom-2 z-20 max-h-[38dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:bottom-6 md:w-[420px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(warringColorById.zhao)}
            >
              <div className="text-[11px] text-[#6b7280]">
                {zhaoOpMode === 'ops' ? '赵国运营操作（经济驱动）' : zhaoOpMode === 'dispatch' ? '赵国出征面板（需将领已配兵）' : '赵国兵力分配面板'}
              </div>
              {zhaoOpMode === 'ops' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('recruit');
                      recruitZhaoTroops(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'recruit'
                        ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1e3a8a] ring-2 ring-[#93c5fd] shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    征兵+40（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('grain');
                      buyZhaoGrain(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'grain'
                        ? 'border-[#0f766e] bg-[#ccfbf1] text-[#134e4a] ring-2 ring-[#5eead4] shadow-[0_0_0_2px_rgba(20,184,166,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    购粮+60（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('hire');
                      hireZhaoGeneral();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'hire'
                        ? 'border-[#7c3aed] bg-[#ede9fe] text-[#4c1d95] ring-2 ring-[#c4b5fd] shadow-[0_0_0_2px_rgba(124,58,237,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    招将65%（-{zhaoInit.economyCosts.generalHireCost}经，S/A/B/C概率6/20/34/40，失败返50%）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('dispatch');
                      openZhaoDispatchPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'dispatch'
                        ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    出征
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('assign');
                      openZhaoAssignPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'assign'
                        ? 'border-[#15803d] bg-[#dcfce7] text-[#14532d] ring-2 ring-[#86efac] shadow-[0_0_0_2px_rgba(34,197,94,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    分配兵力
                  </button>
                </div>
              ) : zhaoOpMode === 'dispatch' ? (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    {zhaoDispatchPickStage === 'to' && '步骤1：在地图点击目标省，箭头会从当前选中出兵省指向目标'}
                    {zhaoDispatchPickStage === 'config' && '步骤2：选择将领后直接派其已分配部队出征'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">出发省</div>
                      <div className="mt-1 font-semibold">{zhaoDispatchFromKey ? (regionsByKey[zhaoDispatchFromKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">目标省</div>
                      <div className="mt-1 font-semibold">{zhaoDispatchToKey ? (regionsByKey[zhaoDispatchToKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px]">
                    <div className="text-[#6b7280]">出征兵力</div>
                    <div className="mt-1 font-semibold">将领已分配部队：{zhaoDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#6b7280]">消耗粮草：{zhaoDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#374151]">部队总战斗力：{zhaoDispatchCombatPower}</div>
                  </div>
                  <label className="block">
                    出征将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={zhaoDispatchGeneralId}
                      onChange={(e) => setZhaoDispatchGeneralId(e.target.value)}
                    >
                      {zhaoDispatchAvailableGenerals.length <= 0 && (
                        <option value="">该省暂无可出征将领</option>
                      )}
                      {zhaoDispatchAvailableGenerals.map((general) => (
                        <option key={`zhao-dispatch-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（{getGeneralLocationLabel(general)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setZhaoDispatchPickStage('to')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      重选目标省
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!zhaoDispatchGeneralId || !zhaoDispatchCanConfirm}
                      onClick={() => {
                        flashOpButton('dispatchConfirm');
                        confirmZhaoDispatch();
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                        activeOpButton === 'dispatchConfirm'
                          ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                          : 'border-[#131313] bg-white text-[#111827]'
                      }`}
                    >
                      确认出征
                    </button>
                    <button
                      type="button"
                      onClick={() => setZhaoOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    步骤：先选择将领，再分配统领兵力；未被将领统领的兵力不可出征
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">分配省</div>
                      <div className="mt-1 font-semibold">{zhaoAssignProvinceKey ? (regionsByKey[zhaoAssignProvinceKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">省兵力</div>
                      <div className="mt-1 font-semibold">{zhaoAssignProvinceTroops}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px] text-[#4b5563]">
                    已分配：{zhaoAssignedTroopsByProvince[zhaoAssignProvinceKey] ?? 0}，未分配：{Math.max(0, zhaoAssignProvinceTroops - (zhaoAssignedTroopsByProvince[zhaoAssignProvinceKey] ?? 0))}
                    <div className="mt-1">该省已分配总战斗力：{zhaoAssignProvinceCombatPower}</div>
                  </div>
                  <label className="block">
                    分配将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={zhaoAssignGeneralId}
                      onChange={(e) => setZhaoAssignGeneralId(e.target.value)}
                    >
                      {zhaoIdleGeneralsInAssignProvince.length <= 0 && (
                        <option value="">该省暂无空闲将领</option>
                      )}
                      {zhaoIdleGeneralsInAssignProvince.map((general) => (
                        <option key={`zhao-assign-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（上限{Math.floor(general.troopCap ?? 0)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    统领兵力
                    <input
                      className="mt-1 w-full"
                      type="range"
                      min={0}
                      max={Math.max(0, zhaoAssignMaxTroops)}
                      step={1}
                      value={Math.min(zhaoAssignTroops, zhaoAssignMaxTroops)}
                      onChange={(e) => setZhaoAssignTroops(Number(e.target.value))}
                    />
                    <div className="mt-1 text-[10px] text-[#6b7280]">
                      当前分配：{zhaoAssignTroops}，该将上限：{zhaoAssignGeneralCap}，当前最大可配：{zhaoAssignMaxTroops}
                    </div>
                    <div className="mt-1 text-[10px] text-[#374151]">当前分配战斗力：{zhaoAssignCombatPower}</div>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!zhaoAssignGeneralId}
                      onClick={applyZhaoTroopAssignment}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      确认分配
                    </button>
                    <button
                      type="button"
                      onClick={() => setZhaoOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 text-[10px] text-[#374151]">{zhaoHireResult || '尚未招募将领'}</div>
              <div className="mt-2 text-[10px] text-[#6b7280]">赵国经济库存：{Math.floor(zhaoEconomy)}</div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                已招募：{zhaoGenerals.length > 0 ? zhaoGenerals.map((general) => `${general.name}(${getGeneralLocationLabel(general)})`).join('、') : '无'}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                将领状态：空闲 {zhaoIdleGeneralCount} / 出征中 {zhaoMarchingGeneralCount}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">在途部队：{zhaoInTransitGroups.length}</div>
              {zhaoInTransitGroups.length > 0 && (
                <div className="mt-2 max-h-[110px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {zhaoInTransitGroups.map((group) => {
                    const remainSec = Math.max(0, (group.endAt - now) / 1000);
                    const fromLabel = regionsByKey[group.fromKey]?.label ?? '未知省';
                    const toLabel = regionsByKey[group.toKey]?.label ?? '未知省';
                    return (
                      <div key={`zhao-transit-${group.groupId}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                        <div className="font-semibold text-[#111827]">{group.commanderName || '未知将领'}</div>
                        <div className="text-[#6b7280]">{fromLabel} → {toLabel}（剩余{remainSec.toFixed(1)}s）</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {zhaoGenerals.length > 0 && (
                <div className="mt-2 max-h-[120px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {zhaoGenerals.map((general) => (
                    <div key={`zhao-general-stat-${general.id}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                      <div className="font-semibold text-[#111827]">
                        {general.name} {general.tier ? `(${general.tier}档)` : ''}
                      </div>
                      <div className="text-[#6b7280]">
                        统率{general.command ?? '-'} 军略{general.strategy ?? '-'} 后勤{general.logistics ?? '-'} 机动{general.mobility ?? '-'} 维护{general.upkeepPerTurn ?? '-'} 统兵{Math.floor(general.assignedTroops ?? 0)}/{Math.floor(general.troopCap ?? 0)}
                      </div>
                      <div className="text-[#6b7280]">所在：{getGeneralLocationLabel(general)}</div>
                      <div className="text-[#374151]">当前战斗力：{computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general)}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
          {playerFactionId === 'qi' && (selectedProvincePanel?.factionId === 'qi' || selectedNationPanel?.factionId === 'qi') && (
            <aside
              className="absolute left-2 right-2 bottom-2 z-20 max-h-[38dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:bottom-6 md:w-[420px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(warringColorById.qi)}
            >
              <div className="text-[11px] text-[#6b7280]">
                {qiOpMode === 'ops' ? '齐国运营操作（经济驱动）' : qiOpMode === 'dispatch' ? '齐国出征面板（需将领已配兵）' : '齐国兵力分配面板'}
              </div>
              {qiOpMode === 'ops' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('recruit');
                      recruitQiTroops(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'recruit'
                        ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1e3a8a] ring-2 ring-[#93c5fd] shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    征兵+40（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('grain');
                      buyQiGrain(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'grain'
                        ? 'border-[#0f766e] bg-[#ccfbf1] text-[#134e4a] ring-2 ring-[#5eead4] shadow-[0_0_0_2px_rgba(20,184,166,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    购粮+60（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('hire');
                      hireQiGeneral();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'hire'
                        ? 'border-[#7c3aed] bg-[#ede9fe] text-[#4c1d95] ring-2 ring-[#c4b5fd] shadow-[0_0_0_2px_rgba(124,58,237,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    招将65%（-{qiInit.economyCosts.generalHireCost}经，S/A/B/C概率6/20/34/40，失败返50%）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('dispatch');
                      openQiDispatchPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'dispatch'
                        ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    出征
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('assign');
                      openQiAssignPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'assign'
                        ? 'border-[#15803d] bg-[#dcfce7] text-[#14532d] ring-2 ring-[#86efac] shadow-[0_0_0_2px_rgba(34,197,94,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    分配兵力
                  </button>
                </div>
              ) : qiOpMode === 'dispatch' ? (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    {qiDispatchPickStage === 'to' && '步骤1：在地图点击目标省，箭头会从当前选中出兵省指向目标'}
                    {qiDispatchPickStage === 'config' && '步骤2：选择将领后直接派其已分配部队出征'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">出发省</div>
                      <div className="mt-1 font-semibold">{qiDispatchFromKey ? (regionsByKey[qiDispatchFromKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">目标省</div>
                      <div className="mt-1 font-semibold">{qiDispatchToKey ? (regionsByKey[qiDispatchToKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px]">
                    <div className="text-[#6b7280]">出征兵力</div>
                    <div className="mt-1 font-semibold">将领已分配部队：{qiDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#6b7280]">消耗粮草：{qiDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#374151]">部队总战斗力：{qiDispatchCombatPower}</div>
                  </div>
                  <label className="block">
                    出征将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={qiDispatchGeneralId}
                      onChange={(e) => setQiDispatchGeneralId(e.target.value)}
                    >
                      {qiDispatchAvailableGenerals.length <= 0 && (
                        <option value="">该省暂无可出征将领</option>
                      )}
                      {qiDispatchAvailableGenerals.map((general) => (
                        <option key={`qi-dispatch-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（{getGeneralLocationLabel(general)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQiDispatchPickStage('to')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      重选目标省
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!qiDispatchGeneralId || !qiDispatchCanConfirm}
                      onClick={() => {
                        flashOpButton('dispatchConfirm');
                        confirmQiDispatch();
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                        activeOpButton === 'dispatchConfirm'
                          ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                          : 'border-[#131313] bg-white text-[#111827]'
                      }`}
                    >
                      确认出征
                    </button>
                    <button
                      type="button"
                      onClick={() => setQiOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    步骤：先选择将领，再分配统领兵力；未被将领统领的兵力不可出征
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">分配省</div>
                      <div className="mt-1 font-semibold">{qiAssignProvinceKey ? (regionsByKey[qiAssignProvinceKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">省兵力</div>
                      <div className="mt-1 font-semibold">{qiAssignProvinceTroops}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px] text-[#4b5563]">
                    已分配：{qiAssignedTroopsByProvince[qiAssignProvinceKey] ?? 0}，未分配：{Math.max(0, qiAssignProvinceTroops - (qiAssignedTroopsByProvince[qiAssignProvinceKey] ?? 0))}
                    <div className="mt-1">该省已分配总战斗力：{qiAssignProvinceCombatPower}</div>
                  </div>
                  <label className="block">
                    分配将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={qiAssignGeneralId}
                      onChange={(e) => setQiAssignGeneralId(e.target.value)}
                    >
                      {qiIdleGeneralsInAssignProvince.length <= 0 && (
                        <option value="">该省暂无空闲将领</option>
                      )}
                      {qiIdleGeneralsInAssignProvince.map((general) => (
                        <option key={`qi-assign-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（上限{Math.floor(general.troopCap ?? 0)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    统领兵力
                    <input
                      className="mt-1 w-full"
                      type="range"
                      min={0}
                      max={Math.max(0, qiAssignMaxTroops)}
                      step={1}
                      value={Math.min(qiAssignTroops, qiAssignMaxTroops)}
                      onChange={(e) => setQiAssignTroops(Number(e.target.value))}
                    />
                    <div className="mt-1 text-[10px] text-[#6b7280]">
                      当前分配：{qiAssignTroops}，该将上限：{qiAssignGeneralCap}，当前最大可配：{qiAssignMaxTroops}
                    </div>
                    <div className="mt-1 text-[10px] text-[#374151]">当前分配战斗力：{qiAssignCombatPower}</div>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!qiAssignGeneralId}
                      onClick={applyQiTroopAssignment}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      确认分配
                    </button>
                    <button
                      type="button"
                      onClick={() => setQiOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 text-[10px] text-[#374151]">{qiHireResult || '尚未招募将领'}</div>
              <div className="mt-2 text-[10px] text-[#6b7280]">齐国经济库存：{Math.floor(qiEconomy)}</div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                已招募：{qiGenerals.length > 0 ? qiGenerals.map((general) => `${general.name}(${getGeneralLocationLabel(general)})`).join('、') : '无'}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                将领状态：空闲 {qiIdleGeneralCount} / 出征中 {qiMarchingGeneralCount}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">在途部队：{qiInTransitGroups.length}</div>
              {qiInTransitGroups.length > 0 && (
                <div className="mt-2 max-h-[110px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {qiInTransitGroups.map((group) => {
                    const remainSec = Math.max(0, (group.endAt - now) / 1000);
                    const fromLabel = regionsByKey[group.fromKey]?.label ?? '未知省';
                    const toLabel = regionsByKey[group.toKey]?.label ?? '未知省';
                    return (
                      <div key={`qi-transit-${group.groupId}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                        <div className="font-semibold text-[#111827]">{group.commanderName || '未知将领'}</div>
                        <div className="text-[#6b7280]">{fromLabel} → {toLabel}（剩余{remainSec.toFixed(1)}s）</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {qiGenerals.length > 0 && (
                <div className="mt-2 max-h-[120px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {qiGenerals.map((general) => (
                    <div key={`qi-general-stat-${general.id}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                      <div className="font-semibold text-[#111827]">
                        {general.name} {general.tier ? `(${general.tier}档)` : ''}
                      </div>
                      <div className="text-[#6b7280]">
                        统率{general.command ?? '-'} 军略{general.strategy ?? '-'} 后勤{general.logistics ?? '-'} 机动{general.mobility ?? '-'} 维护{general.upkeepPerTurn ?? '-'} 统兵{Math.floor(general.assignedTroops ?? 0)}/{Math.floor(general.troopCap ?? 0)}
                      </div>
                      <div className="text-[#6b7280]">所在：{getGeneralLocationLabel(general)}</div>
                      <div className="text-[#374151]">当前战斗力：{computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general)}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
          {playerFactionId === 'yan' && (selectedProvincePanel?.factionId === 'yan' || selectedNationPanel?.factionId === 'yan') && (
            <aside
              className="absolute left-2 right-2 bottom-2 z-20 max-h-[38dvh] overflow-y-auto rounded-3xl border-[3px] bg-white/68 p-3 backdrop-blur-[2px] text-[#1e1e1e] md:left-6 md:right-auto md:bottom-6 md:w-[420px] md:max-h-none md:overflow-visible"
              style={factionPanelShellStyle(warringColorById.yan)}
            >
              <div className="text-[11px] text-[#6b7280]">
                {yanOpMode === 'ops' ? '燕国运营操作（经济驱动）' : yanOpMode === 'dispatch' ? '燕国出征面板（需将领已配兵）' : '燕国兵力分配面板'}
              </div>
              {yanOpMode === 'ops' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('recruit');
                      recruitYanTroops(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'recruit'
                        ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1e3a8a] ring-2 ring-[#93c5fd] shadow-[0_0_0_2px_rgba(59,130,246,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    征兵+40（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('grain');
                      buyYanGrain(20);
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'grain'
                        ? 'border-[#0f766e] bg-[#ccfbf1] text-[#134e4a] ring-2 ring-[#5eead4] shadow-[0_0_0_2px_rgba(20,184,166,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    购粮+60（-20经）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('hire');
                      hireYanGeneral();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'hire'
                        ? 'border-[#7c3aed] bg-[#ede9fe] text-[#4c1d95] ring-2 ring-[#c4b5fd] shadow-[0_0_0_2px_rgba(124,58,237,0.2)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    招将65%（-{yanInit.economyCosts.generalHireCost}经，S/A/B/C概率6/20/34/40，失败返50%）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('dispatch');
                      openYanDispatchPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'dispatch'
                        ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    出征
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flashOpButton('assign');
                      openYanAssignPanel();
                    }}
                    className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] ${
                      activeOpButton === 'assign'
                        ? 'border-[#15803d] bg-[#dcfce7] text-[#14532d] ring-2 ring-[#86efac] shadow-[0_0_0_2px_rgba(34,197,94,0.18)] scale-[1.02]'
                        : 'border-[#131313] bg-white text-[#111827]'
                    }`}
                  >
                    分配兵力
                  </button>
                </div>
              ) : yanOpMode === 'dispatch' ? (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    {yanDispatchPickStage === 'to' && '步骤1：在地图点击目标省，箭头会从当前选中出兵省指向目标'}
                    {yanDispatchPickStage === 'config' && '步骤2：选择将领后直接派其已分配部队出征'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">出发省</div>
                      <div className="mt-1 font-semibold">{yanDispatchFromKey ? (regionsByKey[yanDispatchFromKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">目标省</div>
                      <div className="mt-1 font-semibold">{yanDispatchToKey ? (regionsByKey[yanDispatchToKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px]">
                    <div className="text-[#6b7280]">出征兵力</div>
                    <div className="mt-1 font-semibold">将领已分配部队：{yanDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#6b7280]">消耗粮草：{yanDispatchAssignedTroops}</div>
                    <div className="mt-1 text-[#374151]">部队总战斗力：{yanDispatchCombatPower}</div>
                  </div>
                  <label className="block">
                    出征将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={yanDispatchGeneralId}
                      onChange={(e) => setYanDispatchGeneralId(e.target.value)}
                    >
                      {yanDispatchAvailableGenerals.length <= 0 && (
                        <option value="">该省暂无可出征将领</option>
                      )}
                      {yanDispatchAvailableGenerals.map((general) => (
                        <option key={`yan-dispatch-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（{getGeneralLocationLabel(general)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setYanDispatchPickStage('to')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      重选目标省
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!yanDispatchGeneralId || !yanDispatchCanConfirm}
                      onClick={() => {
                        flashOpButton('dispatchConfirm');
                        confirmYanDispatch();
                      }}
                      className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-all duration-150 active:translate-y-[1px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                        activeOpButton === 'dispatchConfirm'
                          ? 'border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d] ring-2 ring-[#fca5a5] shadow-[0_0_0_2px_rgba(239,68,68,0.18)] scale-[1.02]'
                          : 'border-[#131313] bg-white text-[#111827]'
                      }`}
                    >
                      确认出征
                    </button>
                    <button
                      type="button"
                      onClick={() => setYanOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-[11px]">
                  <div className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] p-2 text-[10px] text-[#4b5563]">
                    步骤：先选择将领，再分配统领兵力；未被将领统领的兵力不可出征
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">分配省</div>
                      <div className="mt-1 font-semibold">{yanAssignProvinceKey ? (regionsByKey[yanAssignProvinceKey]?.label ?? '未选择') : '未选择'}</div>
                    </div>
                    <div className="rounded-lg border border-[#d1d5db] p-2">
                      <div className="text-[#6b7280]">省兵力</div>
                      <div className="mt-1 font-semibold">{yanAssignProvinceTroops}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d1d5db] p-2 text-[10px] text-[#4b5563]">
                    已分配：{yanAssignedTroopsByProvince[yanAssignProvinceKey] ?? 0}，未分配：{Math.max(0, yanAssignProvinceTroops - (yanAssignedTroopsByProvince[yanAssignProvinceKey] ?? 0))}
                    <div className="mt-1">该省已分配总战斗力：{yanAssignProvinceCombatPower}</div>
                  </div>
                  <label className="block">
                    分配将领
                    <select
                      className="mt-1 w-full rounded-md border border-[#131313] bg-white px-2 py-1"
                      value={yanAssignGeneralId}
                      onChange={(e) => setYanAssignGeneralId(e.target.value)}
                    >
                      {yanIdleGeneralsInAssignProvince.length <= 0 && (
                        <option value="">该省暂无空闲将领</option>
                      )}
                      {yanIdleGeneralsInAssignProvince.map((general) => (
                        <option key={`yan-assign-general-${general.id}`} value={general.id}>
                          {general.name}{general.tier ? `·${general.tier}档` : ''}（上限{Math.floor(general.troopCap ?? 0)}，已配{Math.floor(general.assignedTroops ?? 0)}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    统领兵力
                    <input
                      className="mt-1 w-full"
                      type="range"
                      min={0}
                      max={Math.max(0, yanAssignMaxTroops)}
                      step={1}
                      value={Math.min(yanAssignTroops, yanAssignMaxTroops)}
                      onChange={(e) => setYanAssignTroops(Number(e.target.value))}
                    />
                    <div className="mt-1 text-[10px] text-[#6b7280]">
                      当前分配：{yanAssignTroops}，该将上限：{yanAssignGeneralCap}，当前最大可配：{yanAssignMaxTroops}
                    </div>
                    <div className="mt-1 text-[10px] text-[#374151]">当前分配战斗力：{yanAssignCombatPower}</div>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!yanAssignGeneralId}
                      onClick={applyYanTroopAssignment}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      确认分配
                    </button>
                    <button
                      type="button"
                      onClick={() => setYanOpMode('ops')}
                      className="rounded-md border border-[#131313] bg-white px-2 py-1 text-[10px] font-semibold"
                    >
                      返回运营
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 text-[10px] text-[#374151]">{yanHireResult || '尚未招募将领'}</div>
              <div className="mt-2 text-[10px] text-[#6b7280]">燕国经济库存：{Math.floor(yanEconomy)}</div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                已招募：{yanGenerals.length > 0 ? yanGenerals.map((general) => `${general.name}(${getGeneralLocationLabel(general)})`).join('、') : '无'}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">
                将领状态：空闲 {yanIdleGeneralCount} / 出征中 {yanMarchingGeneralCount}
              </div>
              <div className="mt-1 text-[10px] text-[#6b7280]">在途部队：{yanInTransitGroups.length}</div>
              {yanInTransitGroups.length > 0 && (
                <div className="mt-2 max-h-[110px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {yanInTransitGroups.map((group) => {
                    const remainSec = Math.max(0, (group.endAt - now) / 1000);
                    const fromLabel = regionsByKey[group.fromKey]?.label ?? '未知省';
                    const toLabel = regionsByKey[group.toKey]?.label ?? '未知省';
                    return (
                      <div key={`yan-transit-${group.groupId}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                        <div className="font-semibold text-[#111827]">{group.commanderName || '未知将领'}</div>
                        <div className="text-[#6b7280]">{fromLabel} → {toLabel}（剩余{remainSec.toFixed(1)}s）</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {yanGenerals.length > 0 && (
                <div className="mt-2 max-h-[120px] overflow-y-auto rounded-lg border border-[#d1d5db] bg-white/70 p-2 text-[10px]">
                  {yanGenerals.map((general) => (
                    <div key={`yan-general-stat-${general.id}`} className="border-b border-[#e5e7eb] py-1 last:border-b-0">
                      <div className="font-semibold text-[#111827]">
                        {general.name} {general.tier ? `(${general.tier}档)` : ''}
                      </div>
                      <div className="text-[#6b7280]">
                        统率{general.command ?? '-'} 军略{general.strategy ?? '-'} 后勤{general.logistics ?? '-'} 机动{general.mobility ?? '-'} 维护{general.upkeepPerTurn ?? '-'} 统兵{Math.floor(general.assignedTroops ?? 0)}/{Math.floor(general.troopCap ?? 0)}
                      </div>
                      <div className="text-[#6b7280]">所在：{getGeneralLocationLabel(general)}</div>
                      <div className="text-[#374151]">当前战斗力：{computeArmyCombatPower(Math.max(0, Math.floor(general.assignedTroops ?? 0)), general)}</div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          )}
        </section>

        {result !== 'playing' && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4">
            <div className="w-full max-w-[420px] rounded-3xl border-[3px] border-[#131313] bg-white p-5 shadow-[0_10px_0_#131313]">
              <div className="text-xs tracking-[0.14em] text-[#5f5f5f]">LEVEL 1</div>
              <div className="mt-1 text-3xl font-black text-[#111]">{result === 'victory' ? '胜利' : '失败'}</div>
              <div className="mt-3 text-sm text-[#3f3f3f]">
                {result === 'victory'
                  ? `你（${playerNation?.name ?? '未知国家'}）已统一天下。`
                  : `你（${playerNation?.name ?? '未知国家'}）已灭国。`}
              </div>
              <button
                type="button"
                onClick={() => {
                  resetWarringTerritoryRuntime();
                  setTerritoryVersion((prev) => prev + 1);
                  const resetState = buildInitialStateByKey(regions);
                  sharedLevel1Runtime = null;
                  setRegionStateByKey(resetState);
                  setDisplayValuesByKey(
                    Object.keys(resetState).reduce((acc, key) => {
                      acc[key] = resetState[key].value;
                      return acc;
                    }, {} as Record<string, number>)
                  );
                  setDispatches([]);
                  emittedDispatchIdsRef.current.clear();
                  canceledDispatchIdsRef.current.clear();
                  clearSelectionState();
                  generalReturnTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
                  generalReturnTimersRef.current = [];
                  setQinEconomy(qinInit.resources.economyPerTurn);
                  setQinGrain(qinInit.resources.grain);
                  setQinGenerals([]);
                  setQinHireResult('');
                  setQinOpMode('ops');
                  setQinDispatchPickStage('to');
                  setQinDispatchFromKey('');
                  setQinDispatchToKey('');
                  setQinDispatchGeneralId('');
                  setQinAssignProvinceKey('');
                  setQinAssignGeneralId('');
                  setQinAssignTroops(0);
                  setChuEconomy(chuInit.resources.economyPerTurn);
                  setChuGrain(chuInit.resources.grain);
                  setChuGenerals([]);
                  setChuHireResult('');
                  setChuOpMode('ops');
                  setChuDispatchPickStage('to');
                  setChuDispatchFromKey('');
                  setChuDispatchToKey('');
                  setChuDispatchGeneralId('');
                  setChuAssignProvinceKey('');
                  setChuAssignGeneralId('');
                  setChuAssignTroops(0);
                  setHanEconomy(hanInit.resources.economyPerTurn);
                  setHanGrain(hanInit.resources.grain);
                  setHanGenerals([]);
                  setHanHireResult('');
                  setHanOpMode('ops');
                  setHanDispatchPickStage('to');
                  setHanDispatchFromKey('');
                  setHanDispatchToKey('');
                  setHanDispatchGeneralId('');
                  setHanAssignProvinceKey('');
                  setHanAssignGeneralId('');
                  setHanAssignTroops(0);
                  setWeiEconomy(weiInit.resources.economyPerTurn);
                  setWeiGrain(weiInit.resources.grain);
                  setWeiGenerals([]);
                  setWeiHireResult('');
                  setWeiOpMode('ops');
                  setWeiDispatchPickStage('to');
                  setWeiDispatchFromKey('');
                  setWeiDispatchToKey('');
                  setWeiDispatchGeneralId('');
                  setWeiAssignProvinceKey('');
                  setWeiAssignGeneralId('');
                  setWeiAssignTroops(0);
                  setZhaoEconomy(zhaoInit.resources.economyPerTurn);
                  setZhaoGrain(zhaoInit.resources.grain);
                  setZhaoGenerals([]);
                  setZhaoHireResult('');
                  setZhaoOpMode('ops');
                  setZhaoDispatchPickStage('to');
                  setZhaoDispatchFromKey('');
                  setZhaoDispatchToKey('');
                  setZhaoDispatchGeneralId('');
                  setZhaoAssignProvinceKey('');
                  setZhaoAssignGeneralId('');
                  setZhaoAssignTroops(0);
                  setQiEconomy(qiInit.resources.economyPerTurn);
                  setQiGrain(qiInit.resources.grain);
                  setQiGenerals([]);
                  setQiHireResult('');
                  setQiOpMode('ops');
                  setQiDispatchPickStage('to');
                  setQiDispatchFromKey('');
                  setQiDispatchToKey('');
                  setQiDispatchGeneralId('');
                  setQiAssignProvinceKey('');
                  setQiAssignGeneralId('');
                  setQiAssignTroops(0);
                  setYanEconomy(yanInit.resources.economyPerTurn);
                  setYanGrain(yanInit.resources.grain);
                  setYanGenerals([]);
                  setYanHireResult('');
                  setYanOpMode('ops');
                  setYanDispatchPickStage('to');
                  setYanDispatchFromKey('');
                  setYanDispatchToKey('');
                  setYanDispatchGeneralId('');
                  setYanAssignProvinceKey('');
                  setYanAssignGeneralId('');
                  setYanAssignTroops(0);
                  setResult('playing');
                }}
                className="mt-4 w-full rounded-2xl border-[3px] border-[#131313] py-3 text-[#131313] text-xl font-black bg-[#fff] shadow-[0_7px_0_#131313] transition active:translate-y-[2px] active:shadow-[0_4px_0_#131313]"
                style={{ fontFamily: '\"Marker Felt\", \"Comic Sans MS\", cursive' }}
              >
                重新开始
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
