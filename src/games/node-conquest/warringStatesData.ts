export type GeneralConfig = {
  id: string;
  name: string;
  command: number;
  logistics: number;
};

export type FactionInitConfig = {
  id: string;
  name: string;
  color: string;
  provinces: string[];
  resources: {
    troops: number;
    grain: number;
    economyPerTurn: number;
  };
  generals: GeneralConfig[];
  economyCosts: {
    troopPerEconomy: number;
    grainPerEconomy: number;
    generalHireCost: number;
    generalUpkeepPerTurn: number;
  };
};

export type ProvinceTroopsPlan = Record<string, number>;

export const qinInit: FactionInitConfig = {
  id: 'qin',
  name: '秦',
  color: '#2E3440',
  provinces: ['610000', '620000', '640000', '510000', '500000'],
  resources: {
    troops: 860,
    grain: 960,
    economyPerTurn: 235
  },
  generals: [],
  economyCosts: {
    troopPerEconomy: 2,
    grainPerEconomy: 3,
    generalHireCost: 180,
    generalUpkeepPerTurn: 20
  }
};

export const chuInit: FactionInitConfig = {
  id: 'chu',
  name: '楚',
  color: '#0F766E',
  provinces: ['420000', '430000', '320000', '330000', '340000', '350000', '360000', '440000', '450000', '460000'],
  resources: {
    troops: 840,
    grain: 980,
    economyPerTurn: 240
  },
  generals: [],
  economyCosts: {
    troopPerEconomy: 2,
    grainPerEconomy: 4,
    generalHireCost: 190,
    generalUpkeepPerTurn: 22
  }
};

// 楚国开局分省兵力（总计 1000）：中心省江西 360000
export const chuProvinceTroops: ProvinceTroopsPlan = {
  '360000': 220,
  '420000': 130,
  '430000': 120,
  '320000': 100,
  '330000': 95,
  '340000': 95,
  '350000': 90,
  '440000': 70,
  '450000': 55,
  '460000': 25
};

export const hanInit: FactionInitConfig = {
  id: 'han',
  name: '韩',
  color: '#DB2777',
  provinces: ['410000'],
  resources: {
    troops: 660,
    grain: 790,
    economyPerTurn: 205
  },
  generals: [],
  economyCosts: {
    troopPerEconomy: 2,
    grainPerEconomy: 3,
    generalHireCost: 160,
    generalUpkeepPerTurn: 16
  }
};

export const weiInit: FactionInitConfig = {
  id: 'wei',
  name: '魏',
  color: '#DC2626',
  provinces: ['140000'],
  resources: {
    troops: 700,
    grain: 830,
    economyPerTurn: 210
  },
  generals: [],
  economyCosts: {
    troopPerEconomy: 2,
    grainPerEconomy: 3,
    generalHireCost: 165,
    generalUpkeepPerTurn: 17
  }
};

export const zhaoInit: FactionInitConfig = {
  id: 'zhao',
  name: '赵',
  color: '#7C3AED',
  provinces: ['130000', '150000'],
  resources: {
    troops: 780,
    grain: 900,
    economyPerTurn: 225
  },
  generals: [],
  economyCosts: {
    troopPerEconomy: 2,
    grainPerEconomy: 3,
    generalHireCost: 170,
    generalUpkeepPerTurn: 18
  }
};

export const qiInit: FactionInitConfig = {
  id: 'qi',
  name: '齐',
  color: '#1D4ED8',
  provinces: ['370000'],
  resources: {
    troops: 690,
    grain: 820,
    economyPerTurn: 210
  },
  generals: [],
  economyCosts: {
    troopPerEconomy: 2,
    grainPerEconomy: 3,
    generalHireCost: 168,
    generalUpkeepPerTurn: 17
  }
};

export const yanInit: FactionInitConfig = {
  id: 'yan',
  name: '燕',
  color: '#D97706',
  provinces: ['110000', '120000', '210000', '220000', '230000'],
  resources: {
    troops: 730,
    grain: 860,
    economyPerTurn: 215
  },
  generals: [],
  economyCosts: {
    troopPerEconomy: 2,
    grainPerEconomy: 3,
    generalHireCost: 172,
    generalUpkeepPerTurn: 18
  }
};
