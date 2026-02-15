export type TiledLayer = {
  name: string;
  type: string;
  data?: number[];
  width?: number;
  height?: number;
  objects?: Array<{
    id: number;
    name: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    gid?: number;
    properties?: Array<{ name: string; type: string; value: any }>;
  }>;
};

export type TiledMapRaw = {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: Array<{
    firstgid: number;
    columns: number;
    tilecount: number;
    tilewidth: number;
    tileheight: number;
    image: string;
    imagewidth: number;
    imageheight: number;
    name: string;
  }>;
};

export type ParsedMap = {
  width: number;
  height: number;
  tileSize: number;
  grass: number[][];
  water: number[][];
  baseTiles: number[][];
  factories: Array<{ name: string; x: number; y: number; w: number; h: number }>;
  bases: Array<{ name: string; x: number; y: number; w: number; h: number; hp?: number; gid?: number }>;
  tileset: {
    firstgid: number;
    columns: number;
    tilewidth: number;
    tileheight: number;
    image: string;
    imagewidth: number;
    imageheight: number;
  };
};

const layerToGrid = (layer?: TiledLayer): number[][] => {
  if (!layer?.data || !layer.width || !layer.height) return [];
  const grid: number[][] = [];
  for (let y = 0; y < layer.height; y++) {
    grid.push(layer.data.slice(y * layer.width, (y + 1) * layer.width));
  }
  return grid;
};

const toProps = (arr?: Array<{ name: string; value: any }>) => {
  const result: Record<string, any> = {};
  arr?.forEach((p) => {
    result[p.name] = p.value;
  });
  return result;
};

export const parseTiledMap = (raw: TiledMapRaw): ParsedMap => {
  const grassLayer = raw.layers.find((l) => l.name === '草地');
  const waterLayer = raw.layers.find((l) => l.name === '水');
  const baseLayer = raw.layers.find((l) => l.name === '基地' && l.type === 'tilelayer');
  const factoryObjs = raw.layers.find((l) => l.name === '坦克工厂' && l.type === 'objectgroup');
  const baseObjs = raw.layers.find((l) => l.name === '基地' && l.type === 'objectgroup');
  const tileset = raw.tilesets?.[0];

  return {
    width: raw.width,
    height: raw.height,
    tileSize: raw.tilewidth,
    grass: layerToGrid(grassLayer),
    water: layerToGrid(waterLayer),
    baseTiles: layerToGrid(baseLayer),
    factories:
      factoryObjs?.objects?.map((o) => ({
        name: o.name,
        x: o.x,
        y: o.y,
        w: o.width,
        h: o.height
      })) ?? [],
      bases:
        baseObjs?.objects?.map((o) => ({
          name: o.name,
          x: o.x,
          y: o.y,
          w: o.width,
          h: o.height,
          hp: toProps(o.properties).hp,
          gid: (o as any).gid
        })) ?? []
    ,
    tileset: tileset
      ? {
          firstgid: tileset.firstgid,
          columns: tileset.columns,
          tilewidth: tileset.tilewidth,
          tileheight: tileset.tileheight,
          image: tileset.image,
          imagewidth: tileset.imagewidth,
          imageheight: tileset.imageheight
        }
      : {
          firstgid: 1,
          columns: 1,
          tilewidth: raw.tilewidth,
          tileheight: raw.tileheight,
          image: '',
          imagewidth: raw.tilewidth,
          imageheight: raw.tileheight
        }
  };
};

export const loadTiledMap = async (url = '/maps/map.json'): Promise<ParsedMap> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载地图失败: ${res.status}`);
  const json = (await res.json()) as TiledMapRaw;
  return parseTiledMap(json);
};
