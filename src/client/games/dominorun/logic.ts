/**
 * 多米诺连锁 DominoRun 纯逻辑：侧视网格关卡（高度图 + 沟壑）、库存
 * 件的放置 / 拆除 / 撤回账目，以及确定性连锁传播模拟（逐拍步进，无
 * 随机、无 DOM，可独立单测）。渲染与交互在 render.ts / index.ts。
 */

/** 可放置件类型：普通骨牌 / 桥板（横跨沟壑）/ 加速器（跳过 1 格）。 */
export type PieceType = 'domino' | 'bridge' | 'booster'

/** 一件已放置库存件：占据某一列（每列至多一件）。 */
export interface Piece {
  type: PieceType
  x: number
}

/** 每关库存配额（摆放组合即谜题）。 */
export interface Inventory {
  domino: number
  bridge: number
  booster: number
}

/**
 * 侧视关卡：terrain[x] 为第 x 列自底向上的实心格数（平台 / 台阶 /
 * 障碍块堆高），0 表示沟壑。pusherX 是起点推手所在实心列，bellX 是
 * 终点铃铛所在实心列。solution 为参考摆法（可解性由测试重放保证）。
 */
export interface Level {
  name: string
  w: number
  terrain: number[]
  pusherX: number
  bellX: number
  inventory: Inventory
  solution: Array<{ x: number, type: PieceType }>
}

/** mulberry32 确定性伪随机（种子注入，供骨牌点色等装饰用途）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 某列的传导有效高度：实心列取自身高度；沟壑列取其左侧最近实心列的
 * 高度（桥板在此高度铺板传力），左侧全空则为 0。
 * @param level 关卡
 * @param x 列号
 * @returns 有效高度（格数）
 */
export function effHeight(level: Level, x: number): number {
  if (x < 0 || x >= level.w) return 0
  for (let i = x; i >= 0; i -= 1) {
    if (level.terrain[i]! > 0) return level.terrain[i]!
  }
  return 0
}

/** 连锁模拟状态：当前传导列 cursor 与已倒下列序 fallen。 */
export interface ChainState {
  cursor: number
  fallen: number[]
}

/** 一步连锁事件：倒下一件 / 撞响铃铛 / 链条断裂 / 终态空步。 */
export type ChainEvent =
  | { kind: 'fall', x: number }
  | { kind: 'win' }
  | { kind: 'break', from: number }
  | { kind: 'idle' }

/** 撤回记录：place 的逆操作是移回库存，remove 的逆操作是放回。 */
export interface UndoEntry {
  action: 'place' | 'remove'
  x: number
  type: PieceType
}

/** 游戏全部可测状态（纯数据，可整体快照比对）。 */
export interface GameState {
  level: Level
  levelIndex: number
  seed: number
  pieces: Map<number, Piece>
  used: Inventory
  undoStack: UndoEntry[]
  phase: 'build' | 'chain'
  chain: ChainState | null
  outcome: null | 'won' | 'lost'
}

/** 内置 5 关，难度递进：直道 → 单沟用桥 → 台阶+沟 → 双缝用加速器 →
 * 宽沟必须「加速器跳 + 双桥」组合。 */
export const LEVELS: Level[] = [
  {
    name: '热身直道',
    w: 14,
    terrain: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4],
    pusherX: 0,
    bellX: 13,
    inventory: { domino: 12, bridge: 0, booster: 0 },
    solution: [
      { x: 1, type: 'domino' }, { x: 2, type: 'domino' }, { x: 3, type: 'domino' },
      { x: 4, type: 'domino' }, { x: 5, type: 'domino' }, { x: 6, type: 'domino' },
      { x: 7, type: 'domino' }, { x: 8, type: 'domino' }, { x: 9, type: 'domino' },
      { x: 10, type: 'domino' }, { x: 11, type: 'domino' }, { x: 12, type: 'domino' },
    ],
  },
  {
    name: '一线之沟',
    w: 14,
    terrain: [2, 2, 2, 2, 2, 0, 3, 3, 3, 3, 3, 3, 3, 4],
    pusherX: 0,
    bellX: 13,
    inventory: { domino: 11, bridge: 1, booster: 0 },
    solution: [
      { x: 1, type: 'domino' }, { x: 2, type: 'domino' }, { x: 3, type: 'domino' },
      { x: 4, type: 'domino' }, { x: 5, type: 'bridge' }, { x: 6, type: 'domino' },
      { x: 7, type: 'domino' }, { x: 8, type: 'domino' }, { x: 9, type: 'domino' },
      { x: 10, type: 'domino' }, { x: 11, type: 'domino' }, { x: 12, type: 'domino' },
    ],
  },
  {
    name: '拾级而上',
    w: 15,
    terrain: [1, 1, 1, 2, 2, 3, 0, 4, 4, 5, 5, 5, 5, 5, 6],
    pusherX: 0,
    bellX: 14,
    inventory: { domino: 12, bridge: 1, booster: 0 },
    solution: [
      { x: 1, type: 'domino' }, { x: 2, type: 'domino' }, { x: 3, type: 'domino' },
      { x: 4, type: 'domino' }, { x: 5, type: 'domino' }, { x: 6, type: 'bridge' },
      { x: 7, type: 'domino' }, { x: 8, type: 'domino' }, { x: 9, type: 'domino' },
      { x: 10, type: 'domino' }, { x: 11, type: 'domino' }, { x: 12, type: 'domino' },
      { x: 13, type: 'domino' },
    ],
  },
  {
    name: '双缝跳跃',
    w: 16,
    terrain: [2, 2, 2, 2, 2, 2, 0, 2, 2, 2, 0, 2, 2, 2, 2, 3],
    pusherX: 0,
    bellX: 15,
    inventory: { domino: 10, bridge: 0, booster: 2 },
    solution: [
      { x: 1, type: 'domino' }, { x: 2, type: 'domino' }, { x: 3, type: 'domino' },
      { x: 4, type: 'domino' }, { x: 5, type: 'booster' }, { x: 7, type: 'domino' },
      { x: 8, type: 'domino' }, { x: 9, type: 'booster' }, { x: 11, type: 'domino' },
      { x: 12, type: 'domino' }, { x: 13, type: 'domino' }, { x: 14, type: 'domino' },
    ],
  },
  {
    name: '宽壑组合',
    w: 17,
    terrain: [2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 3],
    pusherX: 0,
    bellX: 16,
    inventory: { domino: 12, bridge: 2, booster: 1 },
    solution: [
      { x: 1, type: 'domino' }, { x: 2, type: 'domino' }, { x: 3, type: 'domino' },
      { x: 4, type: 'domino' }, { x: 5, type: 'booster' }, { x: 7, type: 'bridge' },
      { x: 8, type: 'bridge' }, { x: 9, type: 'domino' }, { x: 10, type: 'domino' },
      { x: 11, type: 'domino' }, { x: 12, type: 'domino' }, { x: 13, type: 'domino' },
      { x: 14, type: 'domino' }, { x: 15, type: 'domino' },
    ],
  },
]

/** 取某一关（索引越界时钳制到末关）。 */
export function levelFor(index: number): Level {
  return LEVELS[Math.min(Math.max(index, 0), LEVELS.length - 1)]!
}

/** 新开一局某关：空盘面、满库存、建造期。 */
export function createGameState(levelIndex: number, seed: number): GameState {
  return {
    level: levelFor(levelIndex),
    levelIndex: Math.min(Math.max(levelIndex, 0), LEVELS.length - 1),
    seed,
    pieces: new Map(),
    used: { domino: 0, bridge: 0, booster: 0 },
    undoStack: [],
    phase: 'build',
    chain: null,
    outcome: null,
  }
}

/**
 * 放置合法性（返回拒绝原因，null 表示可放）：界内、非起点/终点列、
 * 该列无件、库存充足；普通骨牌与加速器需实心支撑（沟壑不可放），
 * 桥板恰好只能铺在沟壑列上。
 */
export function placeReject(
  level: Level, pieces: Map<number, Piece>, used: Inventory, x: number, type: PieceType,
): string | null {
  if (x < 0 || x >= level.w) return '超出盘面'
  if (x === level.pusherX || x === level.bellX) return '起点 / 终点列不可放置'
  if (pieces.has(x)) return '该列已有件'
  if (used[type] >= level.inventory[type]) return '库存不足'
  const ground = level.terrain[x]!
  if (type === 'bridge') {
    if (ground !== 0) return '桥板只能横跨沟壑'
  } else if (ground <= 0) {
    return '此处需要实心支撑'
  }
  return null
}

/**
 * 放置一件（成功即扣库存并记录撤回）。
 * @returns 拒绝原因；null 表示已放置
 */
export function placePiece(state: GameState, x: number, type: PieceType): string | null {
  if (state.phase !== 'build') return '连锁进行中不可摆放'
  const reason = placeReject(state.level, state.pieces, state.used, x, type)
  if (reason !== null) return reason
  state.pieces.set(x, { type, x })
  state.used[type] += 1
  state.undoStack.push({ action: 'place', x, type })
  return null
}

/**
 * 把某列的件移回库存（右键拆除）。
 * @returns 是否真的移除了一件
 */
export function removePiece(state: GameState, x: number): boolean {
  if (state.phase !== 'build') return false
  const piece = state.pieces.get(x)
  if (piece === undefined) return false
  state.pieces.delete(x)
  state.used[piece.type] -= 1
  state.undoStack.push({ action: 'remove', x, type: piece.type })
  return true
}

/**
 * 撤回上一次摆放 / 拆除（仅建造期）。
 * @returns 是否真的撤回了一步
 */
export function undo(state: GameState): boolean {
  if (state.phase !== 'build' || state.undoStack.length === 0) return false
  const entry = state.undoStack.pop()!
  if (entry.action === 'place') {
    state.pieces.delete(entry.x)
    state.used[entry.type] -= 1
  } else {
    state.pieces.set(entry.x, { type: entry.type, x: entry.x })
    state.used[entry.type] += 1
  }
  return true
}

/** 当前剩余库存（配额减已用）。 */
export function inventoryLeft(state: GameState): Inventory {
  const inv = state.level.inventory
  return {
    domino: inv.domino - state.used.domino,
    bridge: inv.bridge - state.used.bridge,
    booster: inv.booster - state.used.booster,
  }
}

/** 从起点推手开始连锁模拟（清空上次结果，回到第 0 拍）。 */
export function startChain(state: GameState): void {
  state.phase = 'chain'
  state.chain = { cursor: state.level.pusherX, fallen: [] }
  state.outcome = null
}

/**
 * 连锁推进一步（确定性）：普通件传到相邻列；加速器优先跳到 +2 列
 * （跳过 1 格），否则退回 +1；目标（含铃铛）与当前有效高度差须 ≤ 1。
 * 命中铃铛列且高度合格 = 过关；无有效目标 = 链断。终态再步进为 idle。
 */
export function stepChain(state: GameState): ChainEvent {
  if (state.phase !== 'chain' || state.chain === null || state.outcome !== null) {
    return { kind: 'idle' }
  }
  const level = state.level
  const a = state.chain.cursor
  const pieceA = state.pieces.get(a)
  const isBooster = pieceA !== undefined && pieceA.type === 'booster'
  const fromH = effHeight(level, a)
  const candidates = isBooster ? [a + 2, a + 1] : [a + 1]
  for (const b of candidates) {
    if (b < 0 || b >= level.w) continue
    if (b === level.bellX) {
      if (Math.abs(fromH - level.terrain[level.bellX]!) <= 1) {
        state.outcome = 'won'
        state.chain.fallen.push(b)
        return { kind: 'win' }
      }
      continue
    }
    const target = state.pieces.get(b)
    if (target === undefined) continue
    if (Math.abs(fromH - effHeight(level, b)) > 1) continue
    state.chain.cursor = b
    state.chain.fallen.push(b)
    return { kind: 'fall', x: b }
  }
  state.outcome = 'lost'
  return { kind: 'break', from: a }
}

/** 结束 / 放弃连锁回到建造期（失败重摆、过关后再摆共用）。 */
export function resetToBuild(state: GameState): void {
  state.phase = 'build'
  state.chain = null
  state.outcome = null
}

/**
 * 逐列骨牌彩点配色（种子确定性）：mulberry32 派生的调色板下标。
 * @returns 长度为 level.w 的 accent 下标数组
 */
export function pipColors(level: Level, seed: number): number[] {
  const rng = mulberry32((seed ^ (0x9e3779b9 * (level.w + 7))) >>> 0)
  const out: number[] = []
  for (let i = 0; i < level.w; i += 1) out.push(Math.floor(rng() * 8))
  return out
}

/**
 * 过关得分：关卡基础分 + 剩余库存件数奖励（未用完的配件越多越好）。
 */
export function scoreFor(levelIndex: number, left: Inventory): number {
  return 100 * (levelIndex + 1) + 10 * (left.domino + left.bridge + left.booster)
}

/**
 * 把某关参考摆法原样重放到一个新状态（每个位置都必须可放）。
 * @returns 已按参考摆法摆好的状态
 */
export function applySolution(levelIndex: number, seed: number): GameState {
  const state = createGameState(levelIndex, seed)
  for (const spot of state.level.solution) {
    const reason = placePiece(state, spot.x, spot.type)
    if (reason !== null) {
      throw new Error('dominorun: 参考摆法非法: ' + reason + ' @ ' + spot.x)
    }
  }
  return state
}
