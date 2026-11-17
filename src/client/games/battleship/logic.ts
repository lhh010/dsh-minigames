/**
 * 海战棋（Battleship）纯逻辑：布舰合法性（边界/重叠/贴边）、seed 随机
 * 布舰、开炮命中与沉舰判定、AI 概率热图与命中追击、回合与胜负状态机。
 * 全部随机走注入 seed（mulberry32），同一 seed 重放完全一致，可测可复盘。
 */

/**
 * 确定性伪随机数生成器（mulberry32）。
 * @param seed - 32 位非负整数种子。
 * @returns 每次调用依种子产生一个 [0,1) 的确定序列值。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 海图边长（10×10）。 */
export const BOARD = 10

/** 一艘舰的静态定义。 */
export interface ShipDef {
  /** 舰名（中文，用于沉舰提示）。 */
  name: string
  /** 占格数。 */
  size: number
}

/** 标准舰队：航母5 / 战列舰4 / 巡洋舰3 / 潜艇3 / 驱逐舰2。 */
export const FLEET: readonly ShipDef[] = [
  { name: '航母', size: 5 },
  { name: '战列舰', size: 4 },
  { name: '巡洋舰', size: 3 },
  { name: '潜艇', size: 3 },
  { name: '驱逐舰', size: 2 },
]

/** 一艘舰的摆放：左上锚点 + 朝向（true 横向，false 纵向）。 */
export interface Placement {
  row: number
  col: number
  horizontal: boolean
}

/**
 * 摆放覆盖的全部格子坐标。
 * @param p - 摆放锚点与朝向。
 * @param size - 舰长。
 * @returns [行, 列] 坐标数组，按舰身顺序排列。
 */
export function shipCells(p: Placement, size: number): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  for (let i = 0; i < size; i += 1) {
    cells.push(p.horizontal ? [p.row, p.col + i] : [p.row + i, p.col])
  }
  return cells
}

/**
 * 单舰是否完整落在海图内。
 * @param p - 待检摆放。
 * @param size - 舰长。
 * @returns 越界返回 false。
 */
export function placementInBounds(p: Placement, size: number): boolean {
  const endRow = p.horizontal ? p.row : p.row + size - 1
  const endCol = p.horizontal ? p.col + size - 1 : p.col
  return p.row >= 0 && p.col >= 0 && endRow < BOARD && endCol < BOARD
}

/**
 * 候选格集合与已放舰队保持切比雪夫距离 ≥2：既不重叠也不贴边（含对角相邻）。
 * @param placed - 已放好的其余舰（下标与 FLEET 对齐）。
 * @param cells - 候选舰的占格集合。
 * @returns 合法返回 true。
 */
function separated(placed: Placement[], cells: Array<[number, number]>): boolean {
  for (let i = 0; i < placed.length; i += 1) {
    const other = shipCells(placed[i]!, FLEET[i]!.size)
    for (const [r1, c1] of cells) {
      for (const [r2, c2] of other) {
        if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) return false
      }
    }
  }
  return true
}

/**
 * 摆放是否可下子：不出界、与已放舰不重叠且不贴边（含对角）。
 * @param placed - 已放好的其余舰（下标与 FLEET 对齐）。
 * @param p - 待检摆放。
 * @param size - 待检舰长。
 * @returns 合法返回 true。
 */
export function canPlace(placed: Placement[], p: Placement, size: number): boolean {
  if (!placementInBounds(p, size)) return false
  return separated(placed, shipCells(p, size))
}

/**
 * 整支舰队是否合法：数量齐、每舰在界内、互不重叠且不贴边。
 * @param fleet - 与 FLEET 等长的摆放数组。
 * @returns 合法返回 true。
 */
export function isLegalFleet(fleet: Placement[]): boolean {
  if (fleet.length !== FLEET.length) return false
  for (let i = 0; i < fleet.length; i += 1) {
    if (!placementInBounds(fleet[i]!, FLEET[i]!.size)) return false
    if (!separated(fleet.slice(0, i), shipCells(fleet[i]!, FLEET[i]!.size))) return false
  }
  return true
}

/**
 * seed 一键随机布舰：按 FLEET 顺序（大舰优先）随机试摆到合法为止。
 * @param seed - 种子。
 * @returns 合法舰队摆放数组。
 */
export function randomFleet(seed: number): Placement[] {
  const rand = mulberry32(seed)
  const fleet: Placement[] = []
  for (let i = 0; i < FLEET.length; i += 1) {
    const size = FLEET[i]!.size
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const horizontal = rand() < 0.5
      const maxRow = horizontal ? BOARD : BOARD - size + 1
      const maxCol = horizontal ? BOARD - size + 1 : BOARD
      const p: Placement = {
        row: Math.floor(rand() * maxRow),
        col: Math.floor(rand() * maxCol),
        horizontal,
      }
      if (canPlace(fleet, p, size)) {
        fleet.push(p)
        break
      }
    }
  }
  return fleet
}

/** 一方（玩家或 AI）的战场状态。 */
export interface SideState {
  /** 己方舰队摆放（按 FLEET 顺序）。 */
  fleet: Placement[]
  /** 对方对己方的炮击记录：0 未打 / 1 miss / 2 hit。 */
  shots: number[][]
}

/**
 * 格子所属舰的下标。
 * @param side - 战场状态。
 * @param row - 行。
 * @param col - 列。
 * @returns 覆盖该格的舰下标，无舰返回 -1。
 */
export function shipIndexAt(side: SideState, row: number, col: number): number {
  for (let i = 0; i < side.fleet.length; i += 1) {
    for (const [r, c] of shipCells(side.fleet[i]!, FLEET[i]!.size)) {
      if (r === row && c === col) return i
    }
  }
  return -1
}

/**
 * 各舰是否已沉（全部格被打中）。
 * @param side - 战场状态。
 * @returns 与 fleet 对齐的布尔数组。
 */
export function sunkFlags(side: SideState): boolean[] {
  return side.fleet.map((p, i) =>
    shipCells(p, FLEET[i]!.size).every(([r, c]) => side.shots[r]![c] === 2),
  )
}

/** 一次开炮的结果。 */
export interface FireResult {
  /** repeat 重复打已打过的格 / miss 未中 / hit 命中。 */
  kind: 'repeat' | 'miss' | 'hit'
  /** 本次击沉的舰名；未沉为 null。 */
  sunk: string | null
}

/**
 * 对 side 开炮并落盘（原地修改 shots）。
 * @param side - 被打一方的战场状态。
 * @param row - 行。
 * @param col - 列。
 * @returns 开炮结果；repeat 不改变任何状态。
 */
export function fireAt(side: SideState, row: number, col: number): FireResult {
  const prior = side.shots[row]![col]!
  if (prior !== 0) return { kind: 'repeat', sunk: null }
  const idx = shipIndexAt(side, row, col)
  if (idx < 0) {
    side.shots[row]![col] = 1
    return { kind: 'miss', sunk: null }
  }
  side.shots[row]![col] = 2
  const sunkNow = sunkFlags(side)[idx] === true
  return { kind: 'hit', sunk: sunkNow ? FLEET[idx]!.name : null }
}

/**
 * 概率热图：对每格统计「还有未沉舰的合法放置方式数」作权重。
 * 只统计完全避开 miss 与已 hit 格的放置；已开过炮的格权重恒 0。
 * @param side - 开炮方视角的对方战场（读 shots 与沉舰状态）。
 * @returns 10×10 权重矩阵。
 */
export function heatMap(side: SideState): number[][] {
  const weights: number[][] = Array.from({ length: BOARD }, () => Array.from({ length: BOARD }, () => 0))
  const sunk = sunkFlags(side)
  for (let i = 0; i < FLEET.length; i += 1) {
    if (sunk[i] === true) continue
    const size = FLEET[i]!.size
    for (let row = 0; row < BOARD; row += 1) {
      for (let col = 0; col < BOARD; col += 1) {
        for (const horizontal of [true, false]) {
          const p: Placement = { row, col, horizontal }
          if (!placementInBounds(p, size)) continue
          const cells = shipCells(p, size)
          if (cells.some(([r, c]) => side.shots[r]![c] !== 0)) continue
          for (const [r, c] of cells) weights[r]![c]! += 1
        }
      }
    }
  }
  return weights
}

/**
 * 追击目标格：尚未沉没的舰上的命中格的上下左右未打邻格（去重）。
 * @param side - 开炮方视角的对方战场。
 * @returns [行, 列] 列表；无未沉命中格时为空。
 */
export function huntTargets(side: SideState): Array<[number, number]> {
  const sunk = sunkFlags(side)
  const seen = new Set<number>()
  const out: Array<[number, number]> = []
  const push = (r: number, c: number): void => {
    if (r < 0 || r >= BOARD || c < 0 || c >= BOARD) return
    if (side.shots[r]![c] !== 0) return
    const key = r * BOARD + c
    if (seen.has(key)) return
    seen.add(key)
    out.push([r, c])
  }
  for (let i = 0; i < side.fleet.length; i += 1) {
    if (sunk[i] === true) continue
    for (const [r, c] of shipCells(side.fleet[i]!, FLEET[i]!.size)) {
      if (side.shots[r]![c] === 2) {
        push(r - 1, c)
        push(r + 1, c)
        push(r, c - 1)
        push(r, c + 1)
      }
    }
  }
  return out
}

function unshotCells(side: SideState): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let r = 0; r < BOARD; r += 1) {
    for (let c = 0; c < BOARD; c += 1) {
      if (side.shots[r]![c] === 0) out.push([r, c])
    }
  }
  return out
}

function weightedPick(
  items: Array<[number, number]>,
  weights: number[],
  rand: () => number,
): [number, number] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return items[Math.floor(rand() * items.length)]!
  let roll = rand() * total
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i]!
    if (roll <= 0) return items[i]!
  }
  return items[items.length - 1]!
}

/**
 * AI 选格开炮。难度 1–5：L1 纯随机；L2+ 命中邻域追击；L4+ 空档期按热图
 * 加权；L5 追击候选也按热图加权。
 * @param side - AI 视角的玩家战场。
 * @param difficulty - 1–5。
 * @param rand - 注入随机源。
 * @returns 选定的 [行, 列]（必为未打过的格；无格可打返回 [0,0]）。
 */
export function aiChooseShot(side: SideState, difficulty: number, rand: () => number): [number, number] {
  const heat = heatMap(side)
  const hunt = huntTargets(side)
  if (difficulty >= 2 && hunt.length > 0) {
    if (difficulty >= 5) {
      return weightedPick(hunt, hunt.map(([r, c]) => heat[r]![c]!), rand)
    }
    return hunt[Math.floor(rand() * hunt.length)]!
  }
  const open = unshotCells(side)
  if (open.length === 0) return [0, 0]
  if (difficulty < 4) return open[Math.floor(rand() * open.length)]!
  return weightedPick(open, open.map(([r, c]) => heat[r]![c]!), rand)
}

/** 一整局对局状态机。 */
export interface Battle {
  /** 本局种子（决定 AI 布舰与其随机源初值）。 */
  seed: number
  /** 1–5 难度。 */
  difficulty: number
  /** 玩家战场（AI 打这里）。 */
  player: SideState
  /** AI 战场（玩家打这里，舰队隐藏）。 */
  ai: SideState
  /** 当前回合归属。 */
  turn: 'player' | 'ai'
  /** battle 进行中 / won 玩家胜 / lost AI 胜。 */
  phase: 'battle' | 'won' | 'lost'
  /** AI 随机源（seed 派生，重放一致）。 */
  rand: () => number
}

function emptyShots(): number[][] {
  return Array.from({ length: BOARD }, () => Array.from({ length: BOARD }, () => 0))
}

/**
 * 开一局：玩家舰队已布好，AI 舰队由 seed 派生隐藏布置；玩家先手。
 * @param seed - 种子。
 * @param playerFleet - 玩家舰队摆放（须合法）。
 * @param difficulty - 1–5。
 * @returns 对局状态。
 */
export function startBattle(seed: number, playerFleet: Placement[], difficulty: number): Battle {
  return {
    seed,
    difficulty,
    player: { fleet: playerFleet.map(p => ({ ...p })), shots: emptyShots() },
    ai: { fleet: randomFleet((seed ^ 0x5f3759df) >>> 0), shots: emptyShots() },
    turn: 'player',
    phase: 'battle',
    rand: mulberry32((seed ^ 0x9e3779b9) >>> 0),
  }
}

function sideDefeated(side: SideState): boolean {
  return sunkFlags(side).every(Boolean)
}

/**
 * 玩家开炮；命中保持玩家回合，miss 换 AI。终局置 phase。
 * @param b - 对局状态。
 * @param row - 行。
 * @param col - 列。
 * @returns 开炮结果；非玩家回合或已终局返回 repeat 且不改状态。
 */
export function playerFire(b: Battle, row: number, col: number): FireResult {
  if (b.phase !== 'battle' || b.turn !== 'player') return { kind: 'repeat', sunk: null }
  const result = fireAt(b.ai, row, col)
  if (result.kind === 'repeat') return result
  if (sideDefeated(b.ai)) {
    b.phase = 'won'
    return result
  }
  if (result.kind === 'miss') b.turn = 'ai'
  return result
}

/** AI 开炮结果（带落点）。 */
export interface AiFireResult extends FireResult {
  /** 落点行。 */
  row: number
  /** 落点列。 */
  col: number
}

/**
 * AI 开炮（自动选格）；命中保持 AI 回合连开，miss 换玩家。终局置 phase。
 * @param b - 对局状态。
 * @returns 落点与开炮结果。
 */
export function aiFire(b: Battle): AiFireResult {
  const [row, col] = aiChooseShot(b.player, b.difficulty, b.rand)
  const result = fireAt(b.player, row, col)
  if (sideDefeated(b.player)) {
    b.phase = 'lost'
    return { ...result, row, col }
  }
  if (result.kind === 'miss') b.turn = 'player'
  return { ...result, row, col }
}
