/**
 * 交通堵塞（Rush Hour）纯逻辑：6×6 盘面，若干水平 / 垂直车辆（长 2-3
 * 格）只能沿自身朝向前后滑动；红色目标车位于出口行，出口在右侧边缘。
 * generateLevel(seed, level) 用 mulberry32 确定性随机布置车辆，BFS 求解
 * 验证可解且最短步数落在目标区间（关卡越高等步数越长），不可解或不在
 * 区间则重掷。moveVehicle 为纯函数（返回新状态或 null），胜利条件为红
 * 车右端到达第 SIZE 列（开出出口）；计分 = 基础分 - 超出最优步数的惩罚。
 * 同一 seed 与 level 必然生成同一关卡，可脱离 DOM 直接模拟验证。
 */

/** 逻辑画布宽度 px。 */
export const W = 440
/** 逻辑画布高度 px。 */
export const H = 484
/** HUD 条高度 px（含在 H 内）。 */
export const HUD_H = 34
/** 盘面边长格数（6×6）。 */
export const SIZE = 6
/** 单格边长 px。 */
export const CELL = 62
/** 盘面左上角 x px。 */
export const BOARD_X = 34
/** 盘面左上角 y px。 */
export const BOARD_Y = 50

/** 一辆车：朝向、长度、固定轴坐标（水平车所在行 / 垂直车所在列）与可动轴坐标（水平车左端列 / 垂直车顶端行）。 */
export interface Vehicle {
  /** true 为水平车（沿行左右滑动），false 为垂直车（沿列上下滑动）。 */
  horizontal: boolean
  /** 车长（2 或 3 格）。 */
  length: number
  /** 固定轴坐标：水平车的行号 / 垂直车的列号。 */
  fixed: number
  /** 可动轴坐标：水平车最左格列号 / 垂直车最上格行号。 */
  pos: number
  /** 是否红色目标车（唯一，长 2 格，水平，位于出口行）。 */
  red: boolean
}

/** 一局状态：车辆布局、步数、BFS 最优步数与胜利标志。 */
export interface RushHourState {
  /** 基础 seed（与 level 联合决定布局）。 */
  seed: number
  /** 关卡号（从 1 起）。 */
  level: number
  /** 出口所在行（0-5）。 */
  exitRow: number
  /** 车辆列表；索引 0 恒为红色目标车。 */
  vehicles: Vehicle[]
  /** 已走步数（每次有效移动 +1）。 */
  moves: number
  /** BFS 最短解题步数（计分基准）。 */
  optimal: number
  /** 当前潜在得分（胜利时定格为最终得分）。 */
  score: number
  /** 是否已胜利（红车开出出口）。 */
  won: boolean
}

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
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
 * 车辆占据的格子（fixed 轴 + pos..pos+length-1）。
 * @param vehicle - 车辆。
 * @returns [row, col] 数组，长度等于车长。
 */
export function vehicleCells(vehicle: Vehicle): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  for (let i = 0; i < vehicle.length; i += 1) {
    cells.push(vehicle.horizontal ? [vehicle.fixed, vehicle.pos + i] : [vehicle.pos + i, vehicle.fixed])
  }
  return cells
}

/**
 * 由车辆位置数组构建 6×6 占用矩阵（-1 为空，否则为车辆索引）。
 * @param vehicles - 车辆列表。
 * @returns SIZE×SIZE 的二维整数矩阵。
 */
function occupancy(vehicles: Vehicle[]): number[][] {
  const grid: number[][] = []
  for (let r = 0; r < SIZE; r += 1) grid.push(new Array<number>(SIZE).fill(-1))
  for (let i = 0; i < vehicles.length; i += 1) {
    for (const cell of vehicleCells(vehicles[i]!)) grid[cell[0]]![cell[1]] = i
  }
  return grid
}

/**
 * 命中检测：返回占据 (row, col) 格的车辆索引。
 * @param vehicles - 车辆列表。
 * @param row - 行号。
 * @param col - 列号。
 * @returns 车辆索引，空格返回 null。
 */
export function vehicleAt(vehicles: Vehicle[], row: number, col: number): number | null {
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return null
  const occupant = occupancy(vehicles)[row]![col]!
  return occupant < 0 ? null : occupant
}

/**
 * BFS 最短解题步数：每步把任意一辆车滑到沿朝向可达的任一新位置；目标
 * 为红车右端列 pos+length === SIZE（开出右侧出口）。
 * @param vehicles - 车辆布局。
 * @returns 最短步数；不可解返回 -1。
 */
export function solve(vehicles: Vehicle[]): number {
  const redIdx = vehicles.findIndex((v) => v.red)
  if (redIdx < 0) return -1
  const red = vehicles[redIdx]!
  const n = vehicles.length
  // 状态键：各车可动轴坐标按 7 进制打包成数值（pos ≤ 5，13 辆车 ≤ 7^13 < 2^53）。
  const encode = (positions: number[]): number => {
    let key = 0
    for (let i = 0; i < n; i += 1) key = key * 7 + positions[i]!
    return key
  }
  const start = vehicles.map((v) => v.pos)
  if (start[redIdx]! + red.length === SIZE) return 0
  const visited = new Set<number>([encode(start)])
  let frontier: number[][] = [start]
  let depth = 0
  while (frontier.length > 0) {
    depth += 1
    const next: number[][] = []
    for (const positions of frontier) {
      const grid = new Int8Array(SIZE * SIZE).fill(-1)
      for (let i = 0; i < n; i += 1) {
        const v = vehicles[i]!
        for (let k = 0; k < v.length; k += 1) {
          if (v.horizontal) grid[v.fixed * SIZE + positions[i]! + k] = i
          else grid[(positions[i]! + k) * SIZE + v.fixed] = i
        }
      }
      for (let i = 0; i < n; i += 1) {
        const v = vehicles[i]!
        const blocked = (p: number): boolean => v.horizontal
          ? grid[v.fixed * SIZE + p]! >= 0
          : grid[p * SIZE + v.fixed]! >= 0
        // 沿负方向逐格扩展（遇到占用即停）。
        for (let p = positions[i]! - 1; p >= 0 && !blocked(p); p -= 1) {
          const cand = positions.slice()
          cand[i] = p
          const key = encode(cand)
          if (!visited.has(key)) {
            visited.add(key)
            next.push(cand)
          }
        }
        // 沿正方向逐格扩展。
        for (let p = positions[i]! + v.length; p < SIZE && !blocked(p); p += 1) {
          const cand = positions.slice()
          cand[i] = p - v.length + 1
          const key = encode(cand)
          if (!visited.has(key)) {
            visited.add(key)
            next.push(cand)
          }
        }
      }
    }
    for (const cand of next) {
      if (cand[redIdx]! + red.length === SIZE) return depth
    }
    frontier = next
  }
  return -1
}

/**
 * 计算当前潜在得分：基础分随关卡递增，超出最优步数每步扣 25，下限 100。
 * 胜利前按「若此刻通关」计，胜利后为最终得分。
 * @param level - 关卡号。
 * @param moves - 已走步数。
 * @param optimal - 最优步数。
 * @returns 得分。
 */
export function computeScore(level: number, moves: number, optimal: number): number {
  const base = 600 + (level - 1) * 40
  const over = Math.max(0, moves - optimal)
  return Math.max(100, base - over * 25)
}

/**
 * 深拷贝一局状态（undo 快照用）。
 * @param state - 原状态。
 * @returns 结构相等的新状态。
 */
export function cloneState(state: RushHourState): RushHourState {
  return {
    seed: state.seed,
    level: state.level,
    exitRow: state.exitRow,
    vehicles: state.vehicles.map((v) => ({ ...v })),
    moves: state.moves,
    optimal: state.optimal,
    score: state.score,
    won: state.won,
  }
}

/**
 * 尝试把索引 vehicleIdx 的车沿朝向滑动到 targetPos（纯函数：不改原状态）。
 * @param state - 当前状态。
 * @param vehicleIdx - 车辆索引。
 * @param targetPos - 目标可动轴坐标（水平车左端列 / 垂直车顶端行）。
 * @returns 新状态（含步数、得分与胜利更新）；越界、路径被阻挡或目标与
 * 当前位置相同返回 null。
 */
export function moveVehicle(state: RushHourState, vehicleIdx: number, targetPos: number): RushHourState | null {
  const vehicle = state.vehicles[vehicleIdx]
  if (vehicle === undefined) return null
  if (targetPos < 0 || targetPos + vehicle.length > SIZE) return null
  if (targetPos === vehicle.pos) return null
  const grid = occupancy(state.vehicles)
  // 校验从当前位置到目标位置的滑动路径上（不含自身占据格）无阻挡。
  const lo = Math.min(vehicle.pos, targetPos)
  const hi = Math.max(vehicle.pos, targetPos)
  for (let p = lo; p < hi + vehicle.length; p += 1) {
    if (p >= vehicle.pos && p < vehicle.pos + vehicle.length) continue
    const occupant = vehicle.horizontal ? grid[vehicle.fixed]![p]! : grid[p]![vehicle.fixed]!
    if (occupant >= 0) return null
  }
  const next = cloneState(state)
  next.vehicles[vehicleIdx] = { ...vehicle, pos: targetPos }
  next.moves = state.moves + 1
  const red = next.vehicles[0]!
  if (red.red && red.pos + red.length === SIZE) {
    next.won = true
    next.score = computeScore(next.level, next.moves, next.optimal)
  } else {
    next.score = computeScore(next.level, next.moves, next.optimal)
  }
  return next
}

/**
 * 生成第 level 关：确定性随机布置含红车的车辆（六成概率在红车前方投放
 * 垂直阻挡车以加深谜题），BFS 验证可解且最短步数落在目标区间
 * [targetMin, targetMax]（区间随关卡上移，上限 20：实测随机布局的最优
 * 步数很难超过 27，越深越稀缺，故 targetMin ≥ 12 的高难关卡只保下界）；
 * 不满足则换种子重掷；尝试耗尽时退回「可解且步数最大」的候选，保证
 * 必然返回有效关卡。
 * @param seed - 基础种子（与 level、尝试次数联合散列）。
 * @param level - 关卡号（从 1 起）。
 * @returns 初始状态（won=false、moves=0、score=基础分）。
 */
export function generateLevel(seed: number, level: number): RushHourState {
  const target = Math.min(8 + (level - 1), 20)
  const targetMin = Math.max(6, target - 2)
  const targetMax = target + 3
  const extraCount = Math.min(5 + Math.floor(level / 2), 11)
  // 深谜题（≥ targetMin 12）按概率每几百次尝试才出现一次，加大重掷预算；
  // 低关卡命中率约 3%，240 次已绰绰有余。
  const attempts = targetMin >= 12 ? 600 : 240
  let fallback: RushHourState | null = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rand = mulberry32((seed + level * 7919 + attempt * 104729) >>> 0)
    const exitRow = 1 + Math.floor(rand() * 4)
    const red: Vehicle = { horizontal: true, length: 2, fixed: exitRow, pos: Math.floor(rand() * 4), red: true }
    const vehicles: Vehicle[] = [red]
    // 垂直阻挡车：大概率落在红车右侧出口路径上（straddle 出口行），加深谜题。
    if (rand() < 0.6) {
      const blockCol = red.pos + 2 + Math.floor(rand() * Math.max(1, SIZE - red.pos - 2))
      if (blockCol < SIZE) {
        const blockPos = Math.max(0, Math.min(SIZE - 3, exitRow - 1 - Math.floor(rand() * 2)))
        const block: Vehicle = { horizontal: false, length: 3, fixed: blockCol, pos: blockPos, red: false }
        const grid = occupancy(vehicles)
        let overlap = false
        for (const cell of vehicleCells(block)) {
          if (grid[cell[0]]![cell[1]]! >= 0) { overlap = true; break }
        }
        if (!overlap) vehicles.push(block)
      }
    }
    let placed = 0
    for (let i = 0; i < extraCount; i += 1) {
      for (let tries = 0; tries < 20; tries += 1) {
        const horizontal = rand() < 0.5
        const length = rand() < 0.3 ? 3 : 2
        const fixed = Math.floor(rand() * SIZE)
        const pos = Math.floor(rand() * (SIZE - length + 1))
        const candidate: Vehicle = { horizontal, length, fixed, pos, red: false }
        const grid = occupancy(vehicles)
        let overlap = false
        for (const cell of vehicleCells(candidate)) {
          if (grid[cell[0]]![cell[1]]! >= 0) { overlap = true; break }
        }
        if (!overlap) {
          vehicles.push(candidate)
          placed += 1
          break
        }
      }
    }
    if (placed < 5) continue
    const optimal = solve(vehicles)
    if (optimal < 0) continue
    // 高难关卡（targetMin ≥ 12）只设下界：深谜题稀缺，抓到即用。
    if (optimal < targetMin || (targetMin < 12 && optimal > targetMax)) {
      if (fallback === null || optimal > fallback.optimal) {
        fallback = {
          seed, level, exitRow,
          vehicles: vehicles.map((v) => ({ ...v })),
          moves: 0,
          optimal,
          score: computeScore(level, 0, optimal),
          won: false,
        }
      }
      continue
    }
    return {
      seed, level, exitRow,
      vehicles,
      moves: 0,
      optimal,
      score: computeScore(level, 0, optimal),
      won: false,
    }
  }
  // 兜底：区间内无解时给出「可解且步数最大」的候选（240-600 次尝试内
  // 至少出现一个可解布局在实测中近乎必然；最后的固定布局仅为类型完备兜底）。
  if (fallback !== null) return fallback
  return {
    seed, level, exitRow: 2,
    vehicles: [
      { horizontal: true, length: 2, fixed: 2, pos: 0, red: true },
      { horizontal: false, length: 3, fixed: 3, pos: 3, red: false },
    ],
    moves: 0,
    optimal: 1,
    score: computeScore(level, 0, 1),
    won: false,
  }
}
