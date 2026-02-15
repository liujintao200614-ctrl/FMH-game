type CampaignOwner = 'blue' | 'red' | 'neutral';

export type CampaignNode = {
  id: string;
  x: number;
  y: number;
  owner: CampaignOwner;
  value: number;
  growth: number;
};

export type CampaignEdge = {
  a: string;
  b: string;
};

export type CampaignLevel = {
  id: string;
  name: string;
  theme: string;
  difficulty: 'easy' | 'normal' | 'hard';
  width: number;
  height: number;
  nodes: CampaignNode[];
  edges: CampaignEdge[];
  summary: string;
};

const W = 780;
const H = 360;

const withGrowth = (nodes: Array<Omit<CampaignNode, 'growth'>>): CampaignNode[] =>
  nodes.map((node) => ({ ...node, growth: 1 }));

const corridorEdges: CampaignEdge[] = [
  { a: 'N1', b: 'N2' },
  { a: 'N2', b: 'N3' },
  { a: 'N3', b: 'N4' },
  { a: 'N4', b: 'N5' },
  { a: 'N5', b: 'N6' },
  { a: 'N2', b: 'N7' },
  { a: 'N3', b: 'N7' },
  { a: 'N4', b: 'N8' },
  { a: 'N5', b: 'N8' }
];

const laneEdges: CampaignEdge[] = [
  { a: 'N1', b: 'N3' },
  { a: 'N2', b: 'N4' },
  { a: 'N3', b: 'N5' },
  { a: 'N4', b: 'N6' },
  { a: 'N5', b: 'N7' },
  { a: 'N6', b: 'N8' },
  { a: 'N3', b: 'N4' },
  { a: 'N5', b: 'N6' },
  { a: 'N2', b: 'N9' },
  { a: 'N9', b: 'N10' },
  { a: 'N10', b: 'N7' }
];

const hubEdges: CampaignEdge[] = [
  { a: 'N1', b: 'N5' },
  { a: 'N2', b: 'N5' },
  { a: 'N3', b: 'N5' },
  { a: 'N4', b: 'N5' },
  { a: 'N5', b: 'N6' },
  { a: 'N6', b: 'N7' },
  { a: 'N6', b: 'N8' },
  { a: 'N6', b: 'N9' },
  { a: 'N5', b: 'N10' },
  { a: 'N10', b: 'N11' },
  { a: 'N10', b: 'N12' },
  { a: 'N7', b: 'N13' },
  { a: 'N9', b: 'N14' }
];

const denseEdges: CampaignEdge[] = [
  { a: 'N1', b: 'N3' },
  { a: 'N2', b: 'N4' },
  { a: 'N3', b: 'N5' },
  { a: 'N4', b: 'N6' },
  { a: 'N5', b: 'N7' },
  { a: 'N6', b: 'N8' },
  { a: 'N7', b: 'N9' },
  { a: 'N8', b: 'N10' },
  { a: 'N9', b: 'N11' },
  { a: 'N10', b: 'N12' },
  { a: 'N11', b: 'N13' },
  { a: 'N12', b: 'N14' },
  { a: 'N13', b: 'N15' },
  { a: 'N14', b: 'N16' },
  { a: 'N3', b: 'N4' },
  { a: 'N5', b: 'N6' },
  { a: 'N7', b: 'N8' },
  { a: 'N9', b: 'N10' },
  { a: 'N11', b: 'N12' },
  { a: 'N6', b: 'N11' },
  { a: 'N5', b: 'N10' }
];

export const CAMPAIGN_LEVELS: CampaignLevel[] = [
  {
    id: 'lv1',
    name: '边界争夺',
    theme: '单核起步',
    difficulty: 'easy',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 90, y: 260, owner: 'blue', value: 12 },
      { id: 'N2', x: 170, y: 240, owner: 'neutral', value: 15 },
      { id: 'N3', x: 260, y: 220, owner: 'neutral', value: 15 },
      { id: 'N4', x: 350, y: 200, owner: 'neutral', value: 15 },
      { id: 'N5', x: 460, y: 180, owner: 'neutral', value: 15 },
      { id: 'N6', x: 560, y: 155, owner: 'red', value: 10 },
      { id: 'N7', x: 285, y: 130, owner: 'neutral', value: 15 },
      { id: 'N8', x: 440, y: 110, owner: 'red', value: 10 }
    ]),
    edges: corridorEdges,
    summary: '蓝方单核开局，对抗双红起手，先控边界再反推。'
  },
  {
    id: 'lv2',
    name: '走廊加速',
    theme: '单中路强化',
    difficulty: 'easy',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 90, y: 275, owner: 'blue', value: 36 },
      { id: 'N2', x: 180, y: 245, owner: 'blue', value: 22 },
      { id: 'N3', x: 275, y: 215, owner: 'neutral', value: 20 },
      { id: 'N4', x: 365, y: 200, owner: 'neutral', value: 18 },
      { id: 'N5', x: 465, y: 185, owner: 'neutral', value: 18 },
      { id: 'N6', x: 575, y: 160, owner: 'red', value: 28 },
      { id: 'N7', x: 300, y: 128, owner: 'neutral', value: 16 },
      { id: 'N8', x: 452, y: 118, owner: 'red', value: 12 }
    ]),
    edges: corridorEdges,
    summary: '红方有前置点，节奏更快。'
  },
  {
    id: 'lv3',
    name: '双路试炼',
    theme: '并行推进',
    difficulty: 'easy',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 92, y: 270, owner: 'blue', value: 34 },
      { id: 'N2', x: 95, y: 160, owner: 'blue', value: 26 },
      { id: 'N3', x: 180, y: 255, owner: 'neutral', value: 16 },
      { id: 'N4', x: 190, y: 145, owner: 'neutral', value: 16 },
      { id: 'N5', x: 290, y: 250, owner: 'neutral', value: 15 },
      { id: 'N6', x: 300, y: 140, owner: 'neutral', value: 15 },
      { id: 'N7', x: 430, y: 235, owner: 'red', value: 22 },
      { id: 'N8', x: 440, y: 125, owner: 'red', value: 22 },
      { id: 'N9', x: 260, y: 70, owner: 'neutral', value: 12 },
      { id: 'N10', x: 380, y: 80, owner: 'neutral', value: 12 }
    ]),
    edges: laneEdges,
    summary: '双路都要控，任何一路崩都会被穿。'
  },
  {
    id: 'lv4',
    name: '双路反压',
    theme: '高压前线',
    difficulty: 'normal',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 86, y: 272, owner: 'blue', value: 36 },
      { id: 'N2', x: 100, y: 154, owner: 'blue', value: 24 },
      { id: 'N3', x: 184, y: 258, owner: 'neutral', value: 18 },
      { id: 'N4', x: 196, y: 146, owner: 'neutral', value: 18 },
      { id: 'N5', x: 294, y: 244, owner: 'neutral', value: 17 },
      { id: 'N6', x: 308, y: 136, owner: 'neutral', value: 17 },
      { id: 'N7', x: 438, y: 234, owner: 'red', value: 26 },
      { id: 'N8', x: 452, y: 126, owner: 'red', value: 26 },
      { id: 'N9', x: 258, y: 72, owner: 'neutral', value: 15 },
      { id: 'N10', x: 392, y: 76, owner: 'red', value: 14 }
    ]),
    edges: laneEdges,
    summary: '红方上路更凶，优先夺中继点。'
  },
  {
    id: 'lv5',
    name: '十字枢纽',
    theme: '中心争夺',
    difficulty: 'normal',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 96, y: 255, owner: 'blue', value: 32 },
      { id: 'N2', x: 118, y: 190, owner: 'blue', value: 20 },
      { id: 'N3', x: 112, y: 120, owner: 'neutral', value: 14 },
      { id: 'N4', x: 196, y: 160, owner: 'neutral', value: 16 },
      { id: 'N5', x: 296, y: 180, owner: 'neutral', value: 20 },
      { id: 'N6', x: 420, y: 182, owner: 'neutral', value: 18 },
      { id: 'N7', x: 520, y: 146, owner: 'red', value: 24 },
      { id: 'N8', x: 522, y: 218, owner: 'red', value: 24 },
      { id: 'N9', x: 440, y: 255, owner: 'neutral', value: 16 },
      { id: 'N10', x: 276, y: 258, owner: 'neutral', value: 16 },
      { id: 'N11', x: 324, y: 102, owner: 'neutral', value: 14 },
      { id: 'N12', x: 414, y: 108, owner: 'neutral', value: 14 },
      { id: 'N13', x: 590, y: 126, owner: 'red', value: 16 },
      { id: 'N14', x: 600, y: 236, owner: 'neutral', value: 12 }
    ]),
    edges: hubEdges,
    summary: '谁先控中枢，谁就控全图节奏。'
  },
  {
    id: 'lv6',
    name: '十字风暴',
    theme: '中心高碰撞',
    difficulty: 'normal',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 95, y: 262, owner: 'blue', value: 34 },
      { id: 'N2', x: 122, y: 194, owner: 'blue', value: 18 },
      { id: 'N3', x: 118, y: 120, owner: 'neutral', value: 16 },
      { id: 'N4', x: 206, y: 164, owner: 'neutral', value: 18 },
      { id: 'N5', x: 304, y: 182, owner: 'neutral', value: 22 },
      { id: 'N6', x: 434, y: 180, owner: 'neutral', value: 20 },
      { id: 'N7', x: 524, y: 144, owner: 'red', value: 25 },
      { id: 'N8', x: 530, y: 222, owner: 'red', value: 25 },
      { id: 'N9', x: 436, y: 260, owner: 'neutral', value: 17 },
      { id: 'N10', x: 278, y: 258, owner: 'neutral', value: 17 },
      { id: 'N11', x: 324, y: 102, owner: 'neutral', value: 16 },
      { id: 'N12', x: 420, y: 106, owner: 'neutral', value: 16 },
      { id: 'N13', x: 598, y: 122, owner: 'red', value: 18 },
      { id: 'N14', x: 605, y: 236, owner: 'red', value: 14 }
    ]),
    edges: hubEdges,
    summary: '红方右侧链路更硬，必须分兵切断。'
  },
  {
    id: 'lv7',
    name: '灰谷防线',
    theme: '多点推进',
    difficulty: 'hard',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 92, y: 280, owner: 'blue', value: 36 },
      { id: 'N2', x: 92, y: 142, owner: 'blue', value: 26 },
      { id: 'N3', x: 168, y: 252, owner: 'neutral', value: 18 },
      { id: 'N4', x: 176, y: 166, owner: 'neutral', value: 18 },
      { id: 'N5', x: 248, y: 236, owner: 'neutral', value: 17 },
      { id: 'N6', x: 256, y: 176, owner: 'neutral', value: 17 },
      { id: 'N7', x: 340, y: 224, owner: 'neutral', value: 18 },
      { id: 'N8', x: 348, y: 178, owner: 'neutral', value: 18 },
      { id: 'N9', x: 438, y: 214, owner: 'red', value: 22 },
      { id: 'N10', x: 448, y: 176, owner: 'red', value: 22 },
      { id: 'N11', x: 526, y: 206, owner: 'red', value: 24 },
      { id: 'N12', x: 536, y: 166, owner: 'red', value: 24 },
      { id: 'N13', x: 610, y: 192, owner: 'neutral', value: 20 },
      { id: 'N14', x: 622, y: 154, owner: 'neutral', value: 20 },
      { id: 'N15', x: 692, y: 178, owner: 'red', value: 22 },
      { id: 'N16', x: 694, y: 226, owner: 'red', value: 16 }
    ]),
    edges: denseEdges,
    summary: '中后段连续节点很多，补兵节奏最关键。'
  },
  {
    id: 'lv8',
    name: '灰谷对抗',
    theme: '拉扯博弈',
    difficulty: 'hard',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 88, y: 278, owner: 'blue', value: 38 },
      { id: 'N2', x: 100, y: 142, owner: 'blue', value: 22 },
      { id: 'N3', x: 172, y: 256, owner: 'neutral', value: 20 },
      { id: 'N4', x: 182, y: 164, owner: 'neutral', value: 20 },
      { id: 'N5', x: 250, y: 238, owner: 'neutral', value: 19 },
      { id: 'N6', x: 262, y: 174, owner: 'neutral', value: 19 },
      { id: 'N7', x: 344, y: 226, owner: 'neutral', value: 20 },
      { id: 'N8', x: 352, y: 176, owner: 'neutral', value: 20 },
      { id: 'N9', x: 444, y: 210, owner: 'red', value: 24 },
      { id: 'N10', x: 452, y: 174, owner: 'red', value: 24 },
      { id: 'N11', x: 528, y: 206, owner: 'red', value: 25 },
      { id: 'N12', x: 540, y: 164, owner: 'red', value: 25 },
      { id: 'N13', x: 612, y: 194, owner: 'red', value: 18 },
      { id: 'N14', x: 622, y: 156, owner: 'neutral', value: 22 },
      { id: 'N15', x: 696, y: 178, owner: 'red', value: 24 },
      { id: 'N16', x: 700, y: 226, owner: 'neutral', value: 18 }
    ]),
    edges: denseEdges,
    summary: '红方前排更厚，需要先拆联防再推主点。'
  },
  {
    id: 'lv9',
    name: '灰谷终局',
    theme: '前压速攻',
    difficulty: 'hard',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 86, y: 282, owner: 'blue', value: 40 },
      { id: 'N2', x: 98, y: 146, owner: 'blue', value: 24 },
      { id: 'N3', x: 170, y: 252, owner: 'neutral', value: 20 },
      { id: 'N4', x: 180, y: 168, owner: 'neutral', value: 20 },
      { id: 'N5', x: 248, y: 236, owner: 'neutral', value: 20 },
      { id: 'N6', x: 260, y: 176, owner: 'neutral', value: 20 },
      { id: 'N7', x: 340, y: 222, owner: 'neutral', value: 21 },
      { id: 'N8', x: 350, y: 178, owner: 'neutral', value: 21 },
      { id: 'N9', x: 440, y: 212, owner: 'red', value: 26 },
      { id: 'N10', x: 452, y: 176, owner: 'red', value: 26 },
      { id: 'N11', x: 530, y: 208, owner: 'red', value: 28 },
      { id: 'N12', x: 538, y: 166, owner: 'red', value: 28 },
      { id: 'N13', x: 614, y: 192, owner: 'red', value: 20 },
      { id: 'N14', x: 624, y: 154, owner: 'red', value: 20 },
      { id: 'N15', x: 698, y: 178, owner: 'red', value: 26 },
      { id: 'N16', x: 704, y: 228, owner: 'neutral', value: 18 }
    ]),
    edges: denseEdges,
    summary: '后期关卡，开局就要抢中段三点。'
  },
  {
    id: 'lv10',
    name: '双核环线',
    theme: '双核心推进',
    difficulty: 'hard',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 82, y: 260, owner: 'blue', value: 40 },
      { id: 'N2', x: 82, y: 120, owner: 'blue', value: 30 },
      { id: 'N3', x: 170, y: 230, owner: 'neutral', value: 18 },
      { id: 'N4', x: 170, y: 150, owner: 'neutral', value: 18 },
      { id: 'N5', x: 260, y: 210, owner: 'neutral', value: 20 },
      { id: 'N6', x: 260, y: 170, owner: 'neutral', value: 20 },
      { id: 'N7', x: 360, y: 200, owner: 'neutral', value: 21 },
      { id: 'N8', x: 470, y: 205, owner: 'red', value: 24 },
      { id: 'N9', x: 470, y: 155, owner: 'red', value: 24 },
      { id: 'N10', x: 360, y: 145, owner: 'neutral', value: 21 },
      { id: 'N11', x: 560, y: 210, owner: 'red', value: 27 },
      { id: 'N12', x: 560, y: 150, owner: 'red', value: 27 },
      { id: 'N13', x: 650, y: 230, owner: 'red', value: 20 },
      { id: 'N14', x: 650, y: 130, owner: 'red', value: 20 },
      { id: 'N15', x: 720, y: 200, owner: 'neutral', value: 16 },
      { id: 'N16', x: 720, y: 160, owner: 'neutral', value: 16 }
    ]),
    edges: denseEdges,
    summary: '双核带环线，绕后点价值很高。'
  },
  {
    id: 'lv11',
    name: '双核鏖战',
    theme: '高密度防守',
    difficulty: 'hard',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 80, y: 262, owner: 'blue', value: 42 },
      { id: 'N2', x: 80, y: 122, owner: 'blue', value: 28 },
      { id: 'N3', x: 166, y: 232, owner: 'neutral', value: 20 },
      { id: 'N4', x: 166, y: 152, owner: 'neutral', value: 20 },
      { id: 'N5', x: 256, y: 212, owner: 'neutral', value: 22 },
      { id: 'N6', x: 256, y: 172, owner: 'neutral', value: 22 },
      { id: 'N7', x: 360, y: 202, owner: 'neutral', value: 23 },
      { id: 'N8', x: 472, y: 206, owner: 'red', value: 26 },
      { id: 'N9', x: 472, y: 154, owner: 'red', value: 26 },
      { id: 'N10', x: 360, y: 146, owner: 'neutral', value: 23 },
      { id: 'N11', x: 566, y: 212, owner: 'red', value: 30 },
      { id: 'N12', x: 566, y: 148, owner: 'red', value: 30 },
      { id: 'N13', x: 654, y: 232, owner: 'red', value: 24 },
      { id: 'N14', x: 654, y: 128, owner: 'red', value: 24 },
      { id: 'N15', x: 724, y: 202, owner: 'red', value: 18 },
      { id: 'N16', x: 724, y: 158, owner: 'neutral', value: 18 }
    ]),
    edges: denseEdges,
    summary: '红方主干更硬，建议先剪边再推核。'
  },
  {
    id: 'lv12',
    name: '最终防线',
    theme: '终局挑战',
    difficulty: 'hard',
    width: W,
    height: H,
    nodes: withGrowth([
      { id: 'N1', x: 78, y: 264, owner: 'blue', value: 44 },
      { id: 'N2', x: 78, y: 124, owner: 'blue', value: 30 },
      { id: 'N3', x: 164, y: 234, owner: 'neutral', value: 22 },
      { id: 'N4', x: 164, y: 154, owner: 'neutral', value: 22 },
      { id: 'N5', x: 254, y: 214, owner: 'neutral', value: 24 },
      { id: 'N6', x: 254, y: 174, owner: 'neutral', value: 24 },
      { id: 'N7', x: 358, y: 204, owner: 'neutral', value: 24 },
      { id: 'N8', x: 474, y: 206, owner: 'red', value: 28 },
      { id: 'N9', x: 474, y: 154, owner: 'red', value: 28 },
      { id: 'N10', x: 358, y: 146, owner: 'neutral', value: 24 },
      { id: 'N11', x: 570, y: 214, owner: 'red', value: 32 },
      { id: 'N12', x: 570, y: 146, owner: 'red', value: 32 },
      { id: 'N13', x: 658, y: 234, owner: 'red', value: 26 },
      { id: 'N14', x: 658, y: 126, owner: 'red', value: 26 },
      { id: 'N15', x: 726, y: 202, owner: 'red', value: 22 },
      { id: 'N16', x: 726, y: 156, owner: 'red', value: 22 }
    ]),
    edges: denseEdges,
    summary: '终局图，正面推进和绕后必须同步。'
  }
];
