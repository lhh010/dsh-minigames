/**
 * 四色地图 FourColor 纯逻辑：以注入 seed 的 mulberry32 在网格上随机生长
 * 出 20-40 个连通区域并推导邻接表，同时回溯求出一组合法着色解（前三关
 * 四色、后两关限三色，三色图通过重试生成保证可解）。涂色、冲突检测、
 * 换色计步、过关判定与提示全部是确定性纯函数——无 DOM、无定时器。
 */

/** 确定性 mulberry32 伪随机数生成器（与库内其他游戏同款实现）。 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 生成网格列数。 */
export const GRID_COLS = 30
/** 生成网格行数。 */
export const GRID_ROWS = 20
/** 关卡总数。 */
export const LEVEL_COUNT = 5
/** 各关区域数：20 → 40 递进。 */
const LEVEL_REGIONS = [20, 25, 30, 35, 40]
/** 各关可用颜色数：前三关 4 色，后两关限 3 色。 */
const LEVEL_PALETTE = [4, 4, 4, 3, 3]
/** 提示次数上限。 */
export const MAX_HINTS = 2
/** 三色（及兜底四色）生成的最大重试次数。 */
const GEN_ATTEMPTS = 60
/** 单次着色求解的回溯步数预算（超出视为失败，交给上层重试）。 */
const SOLVE_BUDGET = 120000

/** 一关的静态参数。 */
export interface LevelConfig {
  /** 关卡号（1 起）。 */
  level: number
  /** 区域数。 */
  regionCount: number
  /** 可用颜色数（4 或 3）。 */
  paletteSize: number
  /** 生成网格列数。 */
  gridCols: number
  /** 生成网格行数。 */
  gridRows: number
}

/** 一张程序生成的邻接地图及其附带解。 */
export interface FourColorMap {
  /** 网格列数。 */
  gridCols: number
  /** 网格行数。 */
  gridRows: number
  /** 区域总数。 */
  regionCount: number
  /** 可用颜色数。 */
  paletteSize: number
  /** 每个网格单元所属区域下标（长度 gridCols*gridRows，均为有效区域）。 */
  cellRegion: number[]
  /** 邻接表：每个区域的相邻区域下标（升序、去重、无自环、对称）。 */
  adjacency: number[][]
  /** 附带的一组合法解（每个区域一个颜色号，相邻不同色）。 */
  solution: number[]
}

/** 一局进行中的状态（不可变风格：操作函数返回新状态）。 */
export interface FourColorState {
  /** 本局地图。 */
  map: FourColorMap
  /** 各区域当前颜色，-1 表示未涂。 */
  colors: number[]
  /** 换色次数（对已涂区域改色每次 +1；首涂与清除不计）。 */
  repaints: number
  /** 已用提示次数。 */
  hintsUsed: number
}

/** 一次提示的结果：应用后的新状态 + 被点亮的区域与颜色。 */
export interface HintResult {
  /** 应用提示（含次数 +1）后的新状态。 */
  state: FourColorState
  /** 被提示的区域下标。 */
  region: number
  /** 提示给出的颜色号。 */
  color: number
}

/**
 * 关卡参数：区域数与颜色数按 5 关递进；越界关卡号收敛到 [1, 5]。
 * @param level - 关卡号（1 起，越界取边界值）。
 * @returns 该关的区域数 / 颜色数 / 网格尺寸。
 */
export function levelConfig(level: number): LevelConfig {
  const idx = Math.min(Math.max(1, Math.floor(level)), LEVEL_COUNT) - 1
  return {
    level: idx + 1,
    regionCount: LEVEL_REGIONS[idx]!,
    paletteSize: LEVEL_PALETTE[idx]!,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
  }
}

/**
 * 多源随机生长：先随机撒 regionCount 个种子单元，再反复从边界随机取一个
 * 未分配单元归入来源区域，直到网格铺满——每个区域都连通。
 * @param seed - 注入的随机种子。
 * @param regionCount - 要生成的区域数。
 * @returns 每个单元的区域归属。
 */
function growRegions(seed: number, regionCount: number): number[] {
  const total = GRID_COLS * GRID_ROWS
  const rng = mulberry32(seed)
  const order = Array.from({ length: total }, (_, i) => i)
  for (let i = total - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = order[i]!
    order[i] = order[j]!
    order[j] = tmp
  }
  const cellRegion = new Array<number>(total).fill(-1)
  // 边界队列：[单元下标, 区域号]；随机弹出等价于带噪声的 BFS 生长。
  const pushNeighbors = (cell: number, region: number, frontier: Array<[number, number]>): void => {
    const cx = cell % GRID_COLS
    const cy = Math.floor(cell / GRID_COLS)
    const push = (nx: number, ny: number): void => {
      if (nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS) return
      const n = ny * GRID_COLS + nx
      if (cellRegion[n] === -1) frontier.push([n, region])
    }
    push(cx + 1, cy)
    push(cx - 1, cy)
    push(cx, cy + 1)
    push(cx, cy - 1)
  }
  const frontier: Array<[number, number]> = []
  for (let r = 0; r < regionCount; r += 1) {
    const cell = order[r]!
    cellRegion[cell] = r
    pushNeighbors(cell, r, frontier)
  }
  while (frontier.length > 0) {
    const k = Math.floor(rng() * frontier.length)
    const entry = frontier[k]!
    frontier[k] = frontier[frontier.length - 1]!
    frontier.pop()
    const cell = entry[0]
    const region = entry[1]
    if (cellRegion[cell] !== -1) continue
    cellRegion[cell] = region
    pushNeighbors(cell, region, frontier)
  }
  return cellRegion
}

/**
 * 从网格归属推导邻接表：相邻单元归属不同即记一对邻接，结果升序去重。
 * @param cellRegion - 每个单元的区域归属。
 * @param regionCount - 区域总数。
 * @returns 每个区域的邻接表。
 */
export function deriveAdjacency(cellRegion: number[], regionCount: number): number[][] {
  const sets = Array.from({ length: regionCount }, () => new Set<number>())
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      const a = cellRegion[y * GRID_COLS + x]!
      if (x + 1 < GRID_COLS) {
        const b = cellRegion[y * GRID_COLS + x + 1]!
        if (a !== b) { sets[a]!.add(b); sets[b]!.add(a) }
      }
      if (y + 1 < GRID_ROWS) {
        const b = cellRegion[(y + 1) * GRID_COLS + x]!
        if (a !== b) { sets[a]!.add(b); sets[b]!.add(a) }
      }
    }
  }
  return sets.map((s) => [...s].sort((p, q) => p - q))
}

/**
 * DSATUR 回指着色：优先给「相邻已用颜色数最多（并列取度数最大）」的未涂
 * 节点上色；预算耗尽按失败返回，供生成层重试。
 * @param adj - 邻接表。
 * @param colorCount - 可用颜色数。
 * @param preset - 可选的预涂颜色（≥0 视为锁定；预涂自身冲突直接失败）。
 * @param budget - 回溯步数预算。
 * @returns 一组合法着色，或 null（无解 / 预涂冲突 / 超预算）。
 */
export function solveColors(
  adj: number[][], colorCount: number, preset?: number[], budget: number = SOLVE_BUDGET,
): number[] | null {
  const n = adj.length
  const colors = preset === undefined ? new Array<number>(n).fill(-1) : preset.slice()
  let colored = 0
  for (let v = 0; v < n; v += 1) {
    if (colors[v]! >= 0) {
      colored += 1
      for (const u of adj[v]!) if (colors[u] === colors[v]) return null
    }
  }
  // nbCount[v][c]：区域 v 的相邻区域中已涂颜色 c 的个数（计数而非布尔：
  // 两个同色且互不相邻的邻居先后回溯时，布尔标记会互相抹掉导致非法着色）。
  const nbCount: number[][] = Array.from({ length: n }, () => new Array<number>(colorCount).fill(0))
  for (let v = 0; v < n; v += 1) {
    const c = colors[v]!
    if (c < 0) continue
    for (const u of adj[v]!) nbCount[u]![c]! += 1
  }
  let steps = 0
  let aborted = false
  const rec = (): boolean => {
    if (colored === n) return true
    steps += 1
    if (steps > budget) { aborted = true; return false }
    // DSATUR 选点：饱和度高者优先，并列取度数大者（确定性并列破除）。
    let best = -1
    let bestSat = -1
    for (let v = 0; v < n; v += 1) {
      if (colors[v]! >= 0) continue
      let sat = 0
      for (let c = 0; c < colorCount; c += 1) if (nbCount[v]![c]! > 0) sat += 1
      if (sat > bestSat || (sat === bestSat && best >= 0 && adj[v]!.length > adj[best]!.length)) {
        best = v
        bestSat = sat
      }
    }
    if (best === -1) return false
    const v = best
    for (let c = 0; c < colorCount; c += 1) {
      if (nbCount[v]![c]! > 0) continue
      colors[v] = c
      colored += 1
      for (const u of adj[v]!) nbCount[u]![c]! += 1
      if (rec()) return true
      for (const u of adj[v]!) nbCount[u]![c]! -= 1
      colors[v] = -1
      colored -= 1
      if (aborted) return false
    }
    return false
  }
  if (!rec() || aborted) return null
  return colors
}

/** 三色关的砖块行数（网格 20 行 → 每行带 4 行单元格）。 */
const BRICK_ROWS = 5

/**
 * 三色关专用生成（单独生成，保证三色可解）：交错砖墙——把网格切成 5 条
 * 横向砖带，每条砖带切成等量砖块，下一行的切缝严格落在上一行对应砖块
 * 内部（向右错缝）。于是任一砖块至多与上一行的同号 / +1 号砖块相邻，
 * 着色 c(row, brick) = (2*row + brick) mod 3 可证合法：行内相邻砖号差 1；
 * 右错缝使下行砖 j 至多触上行砖 j（色差 2）与 j+1（色差 1），均 mod 3
 * 不等。砖墙布局仍是政区观感（赤陶砖墙）。
 * @param seed - 注入的随机种子。
 * @param regionCount - 区域总数（须为 BRICK_ROWS 的倍数）。
 * @returns 单元归属、邻接表与构造解。
 */
function brickMap(seed: number, regionCount: number): {
  cellRegion: number[]; adjacency: number[][]; solution: number[]
} {
  const cols = Math.floor(regionCount / BRICK_ROWS)
  const bandH = Math.floor(GRID_ROWS / BRICK_ROWS)
  const rng = mulberry32(seed)
  // 首行切缝：把 GRID_COLS 随机分成 cols 段（每段 ≥1），切缝严格递增。
  let cuts = new Array<number>(cols + 1)
  cuts[0] = 0
  cuts[cols] = GRID_COLS
  {
    const weights = Array.from({ length: cols }, () => 1 + rng())
    const sum = weights.reduce((a, b) => a + b, 0)
    let acc = 0
    for (let k = 1; k < cols; k += 1) {
      acc += weights[k - 1]!
      cuts[k] = Math.max(cuts[k - 1]! + 1, Math.min(GRID_COLS - (cols - k), Math.round((acc / sum) * GRID_COLS)))
    }
  }
  const cellRegion = new Array<number>(GRID_COLS * GRID_ROWS).fill(-1)
  const solution: number[] = []
  for (let r = 0; r < BRICK_ROWS; r += 1) {
    if (r > 0) {
      // 向右错缝：切缝 k 落在上一行第 k 号砖块内部（[cuts[k], cuts[k+1])）
      // 随机右移。由 cuts[k] ≤ next[k] < cuts[k+1] ≤ next[k+1] 知严格递增，
      // 无需修补；该不变量即跨行相邻只落在同号 / +1 号砖块上（着色合法的依据）。
      const next = new Array<number>(cols + 1)
      next[0] = 0
      next[cols] = GRID_COLS
      for (let k = 1; k < cols; k += 1) {
        const span = cuts[k + 1]! - cuts[k]! // 上一行第 k 号砖块的宽度
        const jitter = span <= 2 ? 0 : Math.floor(rng() * (span - 1))
        next[k] = cuts[k]! + jitter
      }
      cuts = next
    }
    for (let i = 0; i < cols; i += 1) {
      const region = r * cols + i
      solution.push((2 * r + i) % 3)
      for (let y = r * bandH; y < (r + 1) * bandH; y += 1) {
        for (let x = cuts[i]!; x < cuts[i + 1]!; x += 1) cellRegion[y * GRID_COLS + x] = region
      }
    }
  }
  return { cellRegion, adjacency: deriveAdjacency(cellRegion, regionCount), solution }
}

/**
 * 生成一关地图：四色关用随机生长 + 回溯求附带解（无解 / 超预算时换派生
 * 种子重试，最多 GEN_ATTEMPTS 次）；三色关用构造性交错砖墙（必三色可解）。
 * @param seed - 注入的随机种子。
 * @param level - 关卡号（越界收敛）。
 * @returns 带合法解的地图。
 */
export function generateMap(seed: number, level: number): FourColorMap {
  const cfg = levelConfig(level)
  if (cfg.paletteSize === 3) {
    const brick = brickMap((Math.imul(seed >>> 0, 0x9e3779b1) + 0x7c4d3d1) >>> 0, cfg.regionCount)
    return {
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
      regionCount: cfg.regionCount,
      paletteSize: cfg.paletteSize,
      cellRegion: brick.cellRegion,
      adjacency: brick.adjacency,
      solution: brick.solution,
    }
  }
  for (let attempt = 0; attempt < GEN_ATTEMPTS; attempt += 1) {
    const mapSeed = (Math.imul(seed >>> 0, 0x9e3779b1) + Math.imul(attempt + 1, 0x85ebca6b)) >>> 0
    const cellRegion = growRegions(mapSeed, cfg.regionCount)
    const adjacency = deriveAdjacency(cellRegion, cfg.regionCount)
    const solution = solveColors(adjacency, cfg.paletteSize)
    if (solution !== null) {
      return {
        gridCols: GRID_COLS,
        gridRows: GRID_ROWS,
        regionCount: cfg.regionCount,
        paletteSize: cfg.paletteSize,
        cellRegion,
        adjacency,
        solution,
      }
    }
  }
  throw new Error('fourcolor: generateMap exhausted retries')
}

/**
 * 开一局：生成地图、清空涂色。
 * @param seed - 注入的随机种子。
 * @param level - 关卡号。
 * @returns 初始状态。
 */
export function createState(seed: number, level: number): FourColorState {
  const map = generateMap(seed, level)
  return {
    map,
    colors: new Array<number>(map.regionCount).fill(-1),
    repaints: 0,
    hintsUsed: 0,
  }
}

/**
 * 逐区域冲突标记：已涂且存在同色相邻区域即为冲突（红显依据）。
 * @param state - 当前状态。
 * @returns 每个区域一个布尔值。
 */
export function conflicts(state: FourColorState): boolean[] {
  const { colors, map } = state
  return colors.map((c, v) => {
    if (c < 0) return false
    return map.adjacency[v]!.some((u) => colors[u] === c)
  })
}

/**
 * 给一个区域涂色：首涂不计换色，对已涂区域改色每次 +1，涂同色为 no-op；
 * 非法区域 / 颜色返回原状态。
 * @param state - 当前状态。
 * @param region - 区域下标。
 * @param color - 颜色号。
 * @returns 新状态（或原状态）。
 */
export function paintRegion(state: FourColorState, region: number, color: number): FourColorState {
  const { map } = state
  if (region < 0 || region >= map.regionCount) return state
  if (color < 0 || color >= map.paletteSize) return state
  const cur = state.colors[region]!
  if (cur === color) return state
  const colors = state.colors.slice()
  colors[region] = color
  return {
    ...state,
    colors,
    repaints: state.repaints + (cur === -1 ? 0 : 1),
  }
}

/**
 * 清除一个区域的颜色（右键）；未涂区域与清除均不计换色。
 * @param state - 当前状态。
 * @param region - 区域下标。
 * @returns 新状态（或原状态）。
 */
export function clearRegion(state: FourColorState, region: number): FourColorState {
  const { map } = state
  if (region < 0 || region >= map.regionCount) return state
  if (state.colors[region] === -1) return state
  const colors = state.colors.slice()
  colors[region] = -1
  return { ...state, colors }
}

/**
 * 过关判定：全部区域已涂且无任何冲突。
 * @param state - 当前状态。
 * @returns 是否过关。
 */
export function isComplete(state: FourColorState): boolean {
  if (state.colors.some((c) => c < 0)) return false
  return !conflicts(state).some(Boolean)
}

/**
 * 使用一次提示：优先指向第一个未涂区域（否则第一个冲突区域），颜色取
 * 「以当前无冲突涂色为约束求出的完整解」在该处的取值——与玩家已有涂色
 * 兼容；无完整解时退回第一个不与相邻已涂区域撞色的颜色。提示直接替该
 * 区域上色且不计换色。
 * @param state - 当前状态。
 * @returns 提示结果，或 null（次数用尽 / 已过关）。
 */
export function giveHint(state: FourColorState): HintResult | null {
  if (state.hintsUsed >= MAX_HINTS) return null
  if (isComplete(state)) return null
  const flags = conflicts(state)
  let region = state.colors.findIndex((c) => c === -1)
  if (region === -1) region = flags.findIndex(Boolean)
  if (region === -1) return null
  const { adjacency, paletteSize } = state.map
  const base = state.colors.map((c, i) => (flags[i] ? -1 : c))
  const completion = solveColors(adjacency, paletteSize, base)
  let color: number
  if (completion !== null) {
    color = completion[region]!
  } else {
    color = 0
    for (let c = 0; c < paletteSize; c += 1) {
      if (!adjacency[region]!.some((u) => state.colors[u] === c)) { color = c; break }
    }
  }
  const colors = state.colors.slice()
  colors[region] = color
  return {
    state: { ...state, colors, hintsUsed: state.hintsUsed + 1 },
    region,
    color,
  }
}

/**
 * 邻接表平均度数（关卡难度递进的可测指标）。
 * @param adj - 邻接表。
 * @returns 平均度数。
 */
export function averageDegree(adj: number[][]): number {
  if (adj.length === 0) return 0
  const total = adj.reduce((sum, list) => sum + list.length, 0)
  return total / adj.length
}
