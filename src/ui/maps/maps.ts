export type MapInfo = {
  key: string;
  name: string;
  theme: string;
  size: '小型' | '中型' | '大型';
  difficulty: '简单' | '中等' | '困难';
  summary: string;
  thumbnail: string;
  features?: string[];
  recommendedMode?: string;
  resourcePoints?: Array<{ x: number; y: number }>;
  spawnPoints?: Array<{ x: number; y: number; team: 'player' | 'ai' | 'neutral' }>;
  // 可选：方块地形（数字代表地形类型）
  // 0: 空地, 1: 墙体/掩体, 2: 水域, 3: 草丛, 4: 补给, 5: 出生点
  terrain?: number[][];
  palette?: Record<number, string>;
  legend?: Record<number, string>;
};

export const maps: MapInfo[] = [
  {
    key: 'skirmish-small-01',
    name: '草原断带 · 小型',
    theme: '工业地表',
    size: '中型',
    difficulty: '简单',
    summary: '1v1 小型草地战场，三分区结构。',
    thumbnail: '/maps/preview-grasslands.svg',
    features: ['路径测试', '编队移动', '随机地形'],
    recommendedMode: 'skirmish',
    spawnPoints: [
      { x: 63, y: 8, team: 'player' },
      { x: 63, y: 64, team: 'ai' }
    ],
    resourcePoints: [
      { x: 28, y: 14 },
      { x: 104, y: 14 },
      { x: 28, y: 35 },
      { x: 63, y: 35 },
      { x: 104, y: 35 },
      { x: 28, y: 58 },
      { x: 104, y: 58 }
    ]
  },
  {
    key: 'redsoil-rift-01',
    name: '赤土裂谷 · 1v1',
    theme: '干旱红土高原',
    size: '中型',
    difficulty: '中等',
    summary: '左右基地对抗，中桥高价值矿区驱动主战场，三桥为辅线。',
    thumbnail: '/maps/preview-redsoil.svg',
    features: ['三桥口', '中轴裂谷', '中桥高价值资源区'],
    recommendedMode: 'skirmish',
    spawnPoints: [
      { x: 16, y: 36, team: 'player' },
      { x: 110, y: 36, team: 'ai' }
    ],
    resourcePoints: [
      // 中桥核心（4）
      { x: 56, y: 34 },
      { x: 56, y: 38 },
      { x: 70, y: 34 },
      { x: 70, y: 38 },
      // 上桥（2）
      { x: 58, y: 16 },
      { x: 68, y: 16 },
      // 下桥（2）
      { x: 58, y: 56 },
      { x: 68, y: 56 },
      // 基地附近（2，左右各 1）
      { x: 24, y: 36 },
      { x: 102, y: 36 }
    ]
  },
  {
    key: 'sea-island-01',
    name: '海上群岛 · 1v1',
    theme: '海域岛链',
    size: '中型',
    difficulty: '中等',
    summary: '三航道岛链对抗，中央咽喉可转线；上中下资源分层，节奏更稳定。',
    thumbnail: '/maps/preview-sea-island.svg',
    features: ['三航道', '中心转线口', '双基地群岛', '岸线浅滩过渡'],
    recommendedMode: 'skirmish',
    spawnPoints: [
      { x: 18, y: 36, team: 'player' },
      { x: 108, y: 36, team: 'ai' }
    ],
    resourcePoints: [
      // 上航道争夺
      { x: 52, y: 17 },
      { x: 74, y: 17 },
      // 中航道核心
      { x: 56, y: 36 },
      { x: 63, y: 36 },
      { x: 70, y: 36 },
      // 下航道争夺
      { x: 52, y: 55 },
      { x: 74, y: 55 },
      // 基地外缘经济
      { x: 28, y: 36 },
      { x: 98, y: 36 }
    ]
  }
];
