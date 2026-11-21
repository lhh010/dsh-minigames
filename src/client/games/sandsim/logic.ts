/**
 * 落沙物语（SandSim）纯逻辑：确定性元胞自动机 + 关卡生成 + 工具交互。
 *
 * 网格自底向上、从左到右固定序扫描，配合 moved 戳记保证同一粒子每帧
 * 只结算一次——同种子同输入的逐帧结果完全一致（可重放）。所有随机
 * （斜向择向、关卡生成）都走注入的 mulberry32 种子。
 */

/** 物质编号：空 / 沙 / 水 / 油 / 岩 / 火 / 金砂 / 收集桶。 */
export const EMPTY = 0
export const SAND = 1
export const WATER = 2
export const OIL = 3
export const ROCK = 4
export const FIRE = 5
export const GOLD = 6
export const BUCKET = 7

/** 玩家工具：挖掘 / 放岩 / 放水 / 放沙。 */
export type Tool = 'dig' | 'rock' | 'water' | 'sand'

/** 逻辑画布尺寸（render 与 index 共用）。 */
export const LOGICAL_W = 560
export const LOGICAL_H = 470

/** CA 固定步频（每秒 30 次整格结算）。 */
export const STEP_DT = 1 / 30

/** 火焰基础寿命（步）；点燃新油时重置。 */
const FIRE_LIFE = 90

/** 确定性伪随机：同种子产生同一 [0,1) 序列。
 * @param seed - 32 位无符号种子。
 * @returns 返回 [0,1) 浮点的生成器函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 单关配置：随关卡号递进的尺寸 / 配额 / 预算 / 火。 */
export interface LevelSpec {
  /** 1 基关卡号。 */
  level: number
  cols: number
  rows: number
  /** 过关需引入桶内的金砂数。 */
  quota: number
  /** 场上散布的金砂总数。 */
  goldTotal: number
  /** 初始水源格数（成团放置）。 */
  waterCells: number
  /** 挖掘次数上限。 */
  digBudget: number
  /** 放岩次数上限。 */
  rockBudget: number
  /** 放水次数上限（每次 1 格）。 */
  waterBudget: number
  /** 放沙次数上限。 */
  sandBudget: number
  /** 限时（秒）。 */
  timeLimit: number
  /** 是否带火源障碍。 */
  hasFire: boolean
}

/** 5 关递进配置：结构更复杂、金砂更散、后期加火源。 */
export const LEVELS: LevelSpec[] = [
  { level: 1, cols: 34, rows: 26, quota: 5, goldTotal: 8, waterCells: 24, digBudget: 40, rockBudget: 16, waterBudget: 12, sandBudget: 12, timeLimit: 100, hasFire: false },
  { level: 2, cols: 38, rows: 27, quota: 7, goldTotal: 11, waterCells: 32, digBudget: 36, rockBudget: 14, waterBudget: 10, sandBudget: 10, timeLimit: 105, hasFire: false },
  { level: 3, cols: 40, rows: 28, quota: 8, goldTotal: 13, waterCells: 36, digBudget: 34, rockBudget: 12, waterBudget: 10, sandBudget: 10, timeLimit: 110, hasFire: true },
  { level: 4, cols: 42, rows: 29, quota: 10, goldTotal: 16, waterCells: 42, digBudget: 32, rockBudget: 12, waterBudget: 8, sandBudget: 8, timeLimit: 115, hasFire: true },
  { level: 5, cols: 44, rows: 30, quota: 12, goldTotal: 20, waterCells: 50, digBudget: 30, rockBudget: 10, waterBudget: 8, sandBudget: 8, timeLimit: 120, hasFire: true },
]

/** 游戏运行态：网格 + 计数 + 进度，全部字段可被测试直接改写。 */
export interface SandSimState {
  level: number
  seed: number
  rows: number
  cols: number
  /** 物质网格 [rows][cols]，值为 EMPTY..BUCKET。 */
  grid: number[][]
  /** 火焰剩余寿命（步），与 grid 同构，仅 FIRE 格有意义。 */
  fireLife: number[][]
  /** moved 戳记：等于当前 stepStamp 的格本步已结算，跳过。 */
  moved: number[][]
  stepStamp: number
  rng: () => number
  collected: number
  quota: number
  goldTotal: number
  goldBurned: number
  /** 场上尚存金砂数（含桶外未收集）。 */
  goldInPlay: number
  timeLeft: number
  digLeft: number
  rockLeft: number
  waterLeft: number
  sandLeft: number
  /** 步进累加器（秒）。 */
  acc: number
  won: boolean
  over: boolean
}

/** 造一张全空网格：底行岩、桶居底、其余 EMPTY。
 * @param cols - 列数。
 * @param rows - 行数。
 * @returns [grid, bucketStartCol]，bucketStartCol 为桶最左列。
 */
function makeGrid(cols: number, rows: number): { grid: number[][]; bucketC: number } {
  const grid: number[][] = []
  for (let r = 0; r < rows; r += 1) grid.push(new Array<number>(cols).fill(EMPTY))
  for (let c = 0; c < cols; c += 1) grid[rows - 1]![c] = ROCK
  const bucketC = Math.floor(cols / 2) - 2
  for (let c = bucketC; c < bucketC + 5; c += 1) {
    grid[rows - 1]![c] = BUCKET
    grid[rows - 2]![c] = EMPTY
  }
  return { grid, bucketC }
}

/** 生成某一关的初始状态（确定性）。
 * @param seed - 32 位种子。
 * @param levelIndex - 0 基关卡下标（LEVELS）。
 * @returns 就绪的 SandSimState（已含岩层 / 水 / 金砂 / 火源 / 桶）。
 */
export function createSandSimState(seed: number, levelIndex: number): SandSimState {
  const spec = LEVELS[Math.min(levelIndex, LEVELS.length - 1)]!
  const rng = mulberry32((seed ^ (0x9e3779b9 * (spec.level))) >>> 0)
  const { grid, bucketC } = makeGrid(spec.cols, spec.rows)
  const state: SandSimState = {
    level: spec.level, seed, rows: spec.rows, cols: spec.cols, grid,
    fireLife: [], moved: [], stepStamp: 0, rng,
    collected: 0, quota: spec.quota, goldTotal: spec.goldTotal, goldBurned: 0,
    goldInPlay: spec.goldTotal, timeLeft: spec.timeLimit,
    digLeft: spec.digBudget, rockLeft: spec.rockBudget,
    waterLeft: spec.waterBudget, sandLeft: spec.sandBudget,
    acc: 0, won: false, over: false,
  }
  for (let r = 0; r < spec.rows; r += 1) {
    state.fireLife.push(new Array<number>(spec.cols).fill(0))
    state.moved.push(new Array<number>(spec.cols).fill(0))
  }

  // 岩层平台：自上而下每隔 3-4 行一条，随机位置与长度，留出通行缺口。
  const bands: Array<{ r: number; c0: number; len: number }> = []
  let row = 5
  while (row < spec.rows - 3) {
    const len = Math.min(spec.cols - 2, 10 + Math.floor(rng() * Math.min(18, spec.cols / 2)))
    const c0 = 1 + Math.floor(rng() * (spec.cols - 2 - len))
    for (let c = c0; c < c0 + len; c += 1) grid[row]![c] = ROCK
    bands.push({ r: row, c0, len })
    row += 3 + Math.floor(rng() * 2)
  }

  // 避开桶口正上方 ±2 列，防止资源直接自流入桶。
  const nearBucket = (c: number): boolean => c >= bucketC - 2 && c <= bucketC + 6
  const bandSpots = bands.filter((b) => b.len >= 6)

  // 水团：坐在部分平台上方，被岩托住，挖开即泄。
  let placedWater = 0
  while (placedWater < spec.waterCells && bandSpots.length > 0) {
    const b = bandSpots[Math.floor(rng() * bandSpots.length)]!
    const c = b.c0 + 1 + Math.floor(rng() * Math.max(1, b.len - 3))
    if (b.r < 2) continue
    for (let dr = 1; dr <= 2; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const rr = b.r - dr, cc = c + dc
        if (rr > 0 && cc >= 0 && cc < spec.cols && grid[rr]![cc] === EMPTY && placedWater < spec.waterCells) {
          grid[rr]![cc] = WATER
          placedWater += 1
        }
      }
    }
  }

  // 金砂：散布在平台上方（落到平台上停住）。
  let placedGold = 0
  let guard = 0
  while (placedGold < spec.goldTotal && guard < 500) {
    guard += 1
    const b = bandSpots.length > 0 ? bandSpots[Math.floor(rng() * bandSpots.length)]! : { r: spec.rows - 2, c0: 1, len: spec.cols - 2 }
    const c = b.c0 + Math.floor(rng() * b.len)
    if (b.r < 2 || nearBucket(c)) continue
    const rr = b.r - 1
    if (rr > 0 && grid[rr]![c] === EMPTY) {
      grid[rr]![c] = GOLD
      placedGold += 1
    }
  }

  // 火源：油池 + 池上一点火（火会延油蔓延，碰到金砂即烧毁）；逐个
  // 候选平台尝试，确保带火关卡必成。
  if (spec.hasFire) {
    for (let attempt = 0; attempt < bandSpots.length; attempt += 1) {
      const b = bandSpots[Math.floor(rng() * bandSpots.length)]!
      const c = b.c0 + 1 + Math.floor(rng() * Math.max(1, b.len - 3))
      if (b.r < 3 || nearBucket(c)) continue
      let oilPlaced = 0
      for (let dc = -2; dc <= 2; dc += 1) {
        const cc = c + dc
        if (cc >= 0 && cc < spec.cols && grid[b.r - 1]![cc] === EMPTY) {
          grid[b.r - 1]![cc] = OIL
          oilPlaced += 1
        }
      }
      if (oilPlaced === 0) continue
      if (grid[b.r - 2]![c] === EMPTY) {
        grid[b.r - 2]![c] = FIRE
        state.fireLife[b.r - 2]![c] = FIRE_LIFE
        break
      }
    }
  }

  // 少量装饰沙堆（会像金砂一样堆积，可用来填沟改道）。
  const sandPiles = 2 + Math.floor(rng() * 3)
  for (let i = 0; i < sandPiles; i += 1) {
    const c = 1 + Math.floor(rng() * (spec.cols - 2))
    if (!nearBucket(c) && grid[1]![c] === EMPTY) grid[1]![c] = SAND
  }
  return state
}

/** 读取网格（越界按岩处理）。
 * @param s - 游戏状态。
 * @param r - 行。
 * @param c - 列。
 */
export function cellAt(s: SandSimState, r: number, c: number): number {
  if (r < 0 || r >= s.rows || c < 0 || c >= s.cols) return ROCK
  return s.grid[r]![c]!
}

/** 在状态上应用一次工具（无预算或目标非法时不动）。
 * @param s - 游戏状态。
 * @param r - 行。
 * @param c - 列。
 * @param tool - 工具类型。
 * @returns 是否实际改动。
 */
export function applyTool(s: SandSimState, r: number, c: number, tool: Tool): boolean {
  if (s.over || s.won) return false
  if (r < 0 || r >= s.rows || c < 0 || c >= s.cols) return false
  const cell = s.grid[r]![c]!
  if (tool === 'dig') {
    if (cell !== ROCK || s.digLeft <= 0) return false
    s.digLeft -= 1
    s.grid[r]![c] = EMPTY
    return true
  }
  if (cell !== EMPTY) return false
  if (tool === 'rock') {
    if (s.rockLeft <= 0) return false
    s.rockLeft -= 1
    s.grid[r]![c] = ROCK
    return true
  }
  if (tool === 'water') {
    if (s.waterLeft <= 0) return false
    s.waterLeft -= 1
    s.grid[r]![c] = WATER
    return true
  }
  if (s.sandLeft <= 0) return false
  s.sandLeft -= 1
  s.grid[r]![c] = SAND
  return true
}

/** 结算胜负：达标过关；金砂烧毁到剩余可收集数不足配额则判负。 */
function settle(s: SandSimState): void {
  if (s.collected >= s.quota) {
    s.won = true
    s.over = true
    return
  }
  const stillPossible = s.collected + s.goldInPlay
  if (s.goldBurned > 0 && stillPossible < s.quota) s.over = true
}

/** 一次完整 CA 扫描（确定性：自底向上、从左到右）。
 * @param s - 游戏状态（原地更新）。
 */
export function stepOnce(s: SandSimState): void {
  if (s.over || s.won) return
  s.stepStamp += 1
  const stamp = s.stepStamp
  const { grid, cols, rows, rng, moved, fireLife } = s

  // 把 (r,c) 的物质移到 (nr,nc)：目标为桶则按物质收集 / 吸收。
  const tryMove = (r: number, c: number, nr: number, nc: number): void => {
    const dest = grid[nr]![nc]!
    if (dest === BUCKET) {
      const v = grid[r]![c]!
      grid[r]![c] = EMPTY
      if (v === GOLD) {
        s.collected += 1
        s.goldInPlay -= 1
      }
      moved[r]![c] = stamp
      return
    }
    const v = grid[r]![c]!
    grid[r]![c] = dest
    grid[nr]![nc] = v
    const life = fireLife[r]![c]!
    fireLife[r]![c] = fireLife[nr]![nc]!
    fireLife[nr]![nc] = life
    moved[r]![c] = stamp
    moved[nr]![nc] = stamp
  }

  const isLiquid = (v: number): boolean => v === WATER || v === OIL
  // 可落入目标：空格 / 液体（密度交换）/ 桶（收集或吸收）。
  const canSink = (v: number): boolean => v === EMPTY || isLiquid(v) || v === BUCKET

  for (let r = rows - 1; r >= 0; r -= 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = grid[r]![c]!
      if (v === EMPTY || v === ROCK || v === BUCKET) continue
      if (moved[r]![c] === stamp) continue

      if (v === SAND || v === GOLD) {
        const below = cellAt(s, r + 1, c)
        if (canSink(below)) { tryMove(r, c, r + 1, c); continue }
        const d = rng() < 0.5 ? -1 : 1
        const b1 = cellAt(s, r + 1, c + d)
        if (canSink(b1)) tryMove(r, c, r + 1, c + d)
        else {
          const b2 = cellAt(s, r + 1, c - d)
          if (canSink(b2)) tryMove(r, c, r + 1, c - d)
        }
        continue
      }

      if (v === WATER) {
        const below = cellAt(s, r + 1, c)
        if (canSink(below)) { tryMove(r, c, r + 1, c); continue }
        const d = rng() < 0.5 ? -1 : 1
        if (canSink(cellAt(s, r + 1, c + d))) { tryMove(r, c, r + 1, c + d); continue }
        if (canSink(cellAt(s, r + 1, c - d))) { tryMove(r, c, r + 1, c - d); continue }
        if (cellAt(s, r, c + d) === EMPTY) tryMove(r, c, r, c + d)
        else if (cellAt(s, r, c - d) === EMPTY) tryMove(r, c, r, c - d)
        continue
      }

      if (v === OIL) {
        // 油比水轻：下方空则下落，上方是水则上浮，否则水平扩散。
        const above = cellAt(s, r - 1, c)
        if (above === WATER) { tryMove(r, c, r - 1, c); continue }
        const below = cellAt(s, r + 1, c)
        if (below === EMPTY || below === BUCKET) { tryMove(r, c, r + 1, c); continue }
        const d = rng() < 0.5 ? -1 : 1
        if (cellAt(s, r + 1, c + d) === EMPTY || cellAt(s, r + 1, c + d) === BUCKET) { tryMove(r, c, r + 1, c + d); continue }
        if (cellAt(s, r, c + d) === EMPTY) tryMove(r, c, r, c + d)
        else if (cellAt(s, r, c - d) === EMPTY) tryMove(r, c, r, c - d)
        continue
      }

      if (v === FIRE) {
        // 火焰：邻水熄灭；点燃油邻；烧毁金砂；寿命尽或无依托时消散。
        const neighbors: Array<[number, number]> = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]
        let extinguished = false
        for (const [nr, nc] of neighbors) {
          const nv = cellAt(s, nr, nc)
          if (nv === WATER) { extinguished = true; break }
        }
        if (extinguished) {
          grid[r]![c] = EMPTY
          fireLife[r]![c] = 0
          moved[r]![c] = stamp
          continue
        }
        let relit = false
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
          const nv = grid[nr]![nc]!
          if (nv === OIL) {
            grid[nr]![nc] = FIRE
            fireLife[nr]![nc] = FIRE_LIFE
            moved[nr]![nc] = stamp
            relit = true
          } else if (nv === GOLD) {
            grid[nr]![nc] = EMPTY
            moved[nr]![nc] = stamp
            s.goldBurned += 1
            s.goldInPlay -= 1
          }
        }
        const life = fireLife[r]![c]! - 1
        fireLife[r]![c] = relit ? FIRE_LIFE : life
        if (fireLife[r]![c]! <= 0 || cellAt(s, r + 1, c) === EMPTY) {
          // 火无依托下坠一步（附着在燃烧面上），到寿命即灭。
          if (cellAt(s, r + 1, c) === EMPTY && r + 1 < rows) tryMove(r, c, r + 1, c)
          else { grid[r]![c] = EMPTY; fireLife[r]![c] = 0 }
        }
        continue
      }
    }
  }
  settle(s)
}

/** 时间驱动步进：按 STEP_DT 累积整步结算并扣倒计时。
 * @param s - 游戏状态。
 * @param dt - 本帧秒数（建议已钳制）。
 */
export function stepSim(s: SandSimState, dt: number): void {
  if (s.over || s.won) return
  s.timeLeft -= dt
  if (s.timeLeft <= 0) {
    s.timeLeft = 0
    s.over = true
    return
  }
  s.acc += dt
  while (s.acc >= STEP_DT && !s.over && !s.won) {
    stepOnce(s)
    s.acc -= STEP_DT
  }
}

/** 网格快照（可重放对比用）：每行物质编号拼成一串。
 * @param s - 游戏状态。
 */
export function snapshotGrid(s: SandSimState): string {
  return s.grid.map((row) => row.join('')).join('|')
}