export type NodeId = 'A' | 'B' | 'C' | 'D';
export type Camp = 'blue' | 'red';

export type NodeState = {
  id: NodeId;
  value: number;
  owner: Camp;
};

export const NODE_IDS: NodeId[] = ['A', 'B', 'C', 'D'];

export const CAMP_COLOR: Record<Camp, string> = {
  blue: '#2d86ff',
  red: '#ff6464'
};

export const INITIAL_NODE_STATES: NodeState[] = [
  { id: 'A', value: 40, owner: 'blue' },
  { id: 'B', value: 25, owner: 'red' },
  { id: 'C', value: 34, owner: 'blue' },
  { id: 'D', value: 22, owner: 'red' }
];

export const createNodeRecord = <T,>(factory: (id: NodeId) => T): Record<NodeId, T> =>
  NODE_IDS.reduce((acc, id) => ({ ...acc, [id]: factory(id) }), {} as Record<NodeId, T>);

export const cloneInitialNodeStates = (): NodeState[] => INITIAL_NODE_STATES.map((node) => ({ ...node }));

export const applyPassiveGrowth = (nodes: NodeState[], growthDelta: number): NodeState[] =>
  nodes.map((node) => ({
    ...node,
    value: node.value + growthDelta
  }));

export const applyDispatchCost = (nodes: NodeState[], fromId: NodeId, cost = 1): NodeState[] =>
  nodes.map((node) => {
    if (node.id !== fromId) return node;
    return {
      ...node,
      value: Math.max(0, node.value - cost)
    };
  });

export type HitResolution = {
  nodes: NodeState[];
  captured: boolean;
};

export type DispatchDot = {
  id: string;
  fromId: NodeId;
  toId: NodeId;
  owner: Camp;
  row: number;
  col: number;
  rowsInColumn: number;
  startAt: number;
  laneBias: number;
  columnStagger: number;
};

export const resolveHit = (
  nodes: NodeState[],
  input: {
    attackerOwner: Camp;
    toId: NodeId;
    supportAmount?: number;
    damageAmount?: number;
    captureValue?: number;
  }
): HitResolution => {
  const supportAmount = input.supportAmount ?? 1;
  const damageAmount = input.damageAmount ?? 1;
  const captureValue = Math.max(1, input.captureValue ?? 1);

  let captured = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== input.toId) return node;

    if (node.owner === input.attackerOwner) {
      return {
        ...node,
        value: node.value + supportAmount
      };
    }

    const nextValue = Math.max(0, node.value - damageAmount);
    if (nextValue > 0) {
      return {
        ...node,
        value: nextValue
      };
    }

    captured = true;
    return {
      ...node,
      owner: input.attackerOwner,
      value: captureValue
    };
  });

  return { nodes: nextNodes, captured };
};

export const buildDispatchDots = (input: {
  now: number;
  fromId: NodeId;
  toId: NodeId;
  owner: Camp;
  sendAmount: number;
  dotColumnDelayMs: number;
  queueStaggerRatio: number;
}): DispatchDot[] => {
  const sendAmount = Math.max(0, Math.floor(input.sendAmount));
  if (sendAmount <= 0) return [];

  const perColumn = sendAmount < 3 ? sendAmount : 5;
  return Array.from({ length: sendAmount }, (_, i) => {
    const row = i % perColumn;
    const col = Math.floor(i / perColumn);
    const rowsInColumn = Math.min(perColumn, sendAmount - col * perColumn);
    const centeredRow = row - (rowsInColumn - 1) / 2;
    const laneBiasDivisor = Math.max(1, (Math.max(rowsInColumn, 2) - 1) / 2);
    const laneBias = centeredRow / laneBiasDivisor;
    const columnStagger = col % 2 === 0 ? 0 : input.queueStaggerRatio;
    return {
      id: `${input.now}-${input.fromId}-${input.toId}-${i}`,
      fromId: input.fromId,
      toId: input.toId,
      owner: input.owner,
      row,
      col,
      rowsInColumn,
      startAt: input.now + col * input.dotColumnDelayMs,
      laneBias,
      columnStagger
    };
  });
};
