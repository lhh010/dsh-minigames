/**
 * 点灯 (Akari) 纯逻辑。网格盘：黑格为墙（可带 0-4 数字），白格可放灯。
 * 灯照亮同行/同列直到墙的整段；胜利条件是所有白格被照亮，且任意两灯
 * 不能互相看见（同行/列无墙阻隔）、数字墙周围正邻格灯数等于数字。
 *
 * 生成采用构造法（解必然存在）：先在无墙空盘上随机放一批互不同行同列
 * 的灯，随后把未被照亮的格子（其行与列均无灯）全部补墙——墙绝不会
 * 落在任何灯的照射路径上，因此补墙后所有白格仍被照亮、灯互视冲突仍
 * 为空；数字墙的数字直接取自生成解的邻灯数，约束天然满足。
 */

/** 五个关卡的盘面边长（7×7 → 10×10）。 */
export const LEVEL_SIZES = [7, 8, 8, 9, 10] as const

/** 白格标记（walls 数组中非墙）。 */
export const WHITE = -1
/** 无数字墙标记。 */
export const PLAIN_WALL = -2

/** 一张 Akari 盘面。 */
export interface AkariBoard {
  /** 盘面边长（格）。 */
  size: number
  /**
   * 每格内容：-1 白格、-2 无数字墙、0..4 数字墙（要求周围正邻格恰有
   * 该数目的灯）。
   */
  walls: Int8Array
  /** 生成解的灯位（构造法保证至少存在这一个解）。 */
  solution: ReadonlySet<number>
}

/** mulberry32 伪随机数发生器：小而快，同 seed 序列确定。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 1 基关卡对应的盘面边长（第 5 关后循环）。 */
export function levelSize(level: number): number {
  return LEVEL_SIZES[(level - 1) % LEVEL_SIZES.length]!
}

/** 过关分数：100×关卡 + 每秒衰减 5 的时间奖励（下限 0）。 */
export function computeScore(level: number, seconds: number): number {
  return 100 * level + Math.max(0, 3000 - Math.floor(seconds) * 5)
}

/** 正邻格（上下左右，不出盘）。 */
export function neighborsOf(size: number, cell: number): number[] {
  const r = Math.floor(cell / size)
  const c = cell % size
  const out: number[] = []
  if (r > 0) out.push(cell - size)
  if (r < size - 1) out.push(cell + size)
  if (c > 0) out.push(cell - 1)
  if (c < size - 1) out.push(cell + 1)
  return out
}

/** 该格是否墙（含数字墙与无数字墙）。 */
export function isWall(board: AkariBoard, cell: number): boolean {
  return board.walls[cell] !== WHITE
}

/**
 * 被照亮的白格集合：从每盏灯出发沿四方向传播直到墙（或盘边），
 * 沿途白格全部照亮；灯自身也照亮。
 */
export function litCells(board: AkariBoard, lights: ReadonlySet<number>): Set<number> {
  const size = board.size
  const lit = new Set<number>()
  const spread = (start: number, dr: number, dc: number): void => {
    let r = Math.floor(start / size) + dr
    let c = (start % size) + dc
    while (r >= 0 && r < size && c >= 0 && c < size) {
      const cell = r * size + c
      if (board.walls[cell] !== WHITE) break
      lit.add(cell)
      r += dr
      c += dc
    }
  }
  for (const light of lights) {
    if (board.walls[light] !== WHITE) continue
    lit.add(light)
    spread(light, -1, 0)
    spread(light, 1, 0)
    spread(light, 0, -1)
    spread(light, 0, 1)
  }
  return lit
}

/**
 * 互相看见的灯集合：从每盏灯沿四方向找到的第一盏灯即冲突，
 * 双方都进入结果（红显用）。
 */
export function conflictingLights(board: AkariBoard, lights: ReadonlySet<number>): Set<number> {
  const size = board.size
  const bad = new Set<number>()
  const see = (start: number, dr: number, dc: number): void => {
    let r = Math.floor(start / size) + dr
    let c = (start % size) + dc
    while (r >= 0 && r < size && c >= 0 && c < size) {
      const cell = r * size + c
      if (board.walls[cell] !== WHITE) return
      if (lights.has(cell)) {
        bad.add(start)
        bad.add(cell)
        return
      }
      r += dr
      c += dc
    }
  }
  for (const light of lights) {
    if (board.walls[light] !== WHITE) continue
    see(light, -1, 0)
    see(light, 1, 0)
    see(light, 0, -1)
    see(light, 0, 1)
  }
  return bad
}

/**
 * 违反数字约束的墙集合：数字墙周围正邻格的灯数 ≠ 数字时该墙入集。
 */
export function numberViolations(board: AkariBoard, lights: ReadonlySet<number>): Set<number> {
  const bad = new Set<number>()
  for (let cell = 0; cell < board.walls.length; cell += 1) {
    const digit = board.walls[cell]!
    if (digit < 0) continue
    let count = 0
    for (const n of neighborsOf(board.size, cell)) if (lights.has(n)) count += 1
    if (count !== digit) bad.add(cell)
  }
  return bad
}

/**
 * 胜利判定：灯全在白格上、无灯互视、无数字违约、所有白格被照亮。
 */
export function isSolved(board: AkariBoard, lights: ReadonlySet<number>): boolean {
  for (const light of lights) {
    if (board.walls[light] !== WHITE) return false
  }
  if (conflictingLights(board, lights).size > 0) return false
  if (numberViolations(board, lights).size > 0) return false
  const lit = litCells(board, lights)
  for (let cell = 0; cell < board.walls.length; cell += 1) {
    if (board.walls[cell] === WHITE && !lit.has(cell)) return false
  }
  return true
}

/**
 * 由 seed 确定性生成一张盘面（构造法，解至少为 solution）：
 * 空盘上随机贪心放互不同行同列的灯（数量随关卡提升），未照亮的
 * 格子补墙，数字墙的数字取生成解的邻灯数（约七成邻灯墙标数字，
 * 少量无邻灯墙标 0），其余墙保持无数字。
 * @param seed - 种子（同 seed 同盘）。
 * @param size - 盘面边长。
 */
export function boardFromSeed(seed: number, size: number): AkariBoard {
  const rng = mulberry32(seed)
  const total = size * size
  const walls = new Int8Array(total).fill(WHITE)
  // ① 先随机立若干障碍墙（位置任意——灯的铺设随后适应墙）。
  const blockers = Math.max(2, Math.round(size * 0.5))
  for (let i = 0; i < blockers; i += 1) {
    walls[Math.floor(rng() * total)] = PLAIN_WALL
  }
  // ② 行/列段（被墙切断的白格连续段）逐段贪心：每次挑一个未覆盖白格，
  // 在其行段与列段的交点（该格本身或同段任意格）放灯，同时照亮两段；
  // 灯只放在段交点上，同段最多一灯 → 互视冲突构造性避免。
  const covered = new Uint8Array(total)
  const lights = new Set<number>()
  const segCells = (cell: number, horizontal: boolean): number[] => {
    const r = Math.floor(cell / size)
    const c = cell % size
    const out: number[] = []
    if (horizontal) {
      for (let cc = c - 1; cc >= 0 && walls[r * size + cc] === WHITE; cc -= 1) out.push(r * size + cc)
      for (let cc = c + 1; cc < size && walls[r * size + cc] === WHITE; cc += 1) out.push(r * size + cc)
    } else {
      for (let rr = r - 1; rr >= 0 && walls[rr * size + c] === WHITE; rr -= 1) out.push(rr * size + c)
      for (let rr = r + 1; rr < size && walls[rr * size + c] === WHITE; rr += 1) out.push(rr * size + c)
    }
    return out
  }
  const coverAround = (cell: number): void => {
    covered[cell] = 1
    for (const n of segCells(cell, true)) covered[n] = 1
    for (const n of segCells(cell, false)) covered[n] = 1
  }
  for (let cell = 0; cell < total; cell += 1) {
    if (walls[cell] !== WHITE || covered[cell] === 1) continue
    // 首选：本格放灯（同时覆盖行段+列段）。
    lights.add(cell)
    coverAround(cell)
  }
  // ③ 剩余未覆盖白格（理论上无——任何白格自身放灯必覆盖自己）兜底转墙。
  for (let cell = 0; cell < total; cell += 1) {
    if (walls[cell] === WHITE && covered[cell] === 0) walls[cell] = PLAIN_WALL
  }
  // ④ 数字墙：邻灯墙七成标真实邻灯数；无邻灯墙两成标 0（线索可推）。
  for (let cell = 0; cell < total; cell += 1) {
    if (walls[cell] !== PLAIN_WALL) continue
    let count = 0
    for (const n of neighborsOf(size, cell)) if (lights.has(n)) count += 1
    const numbered = count > 0 ? rng() < 0.7 : rng() < 0.2
    if (numbered) walls[cell] = count
  }
  // ⑤ 保底：若整盘无数字墙（种子运气），把任一邻灯墙强制标数——
  // 没有数字线索的 Akari 无从推理。
  let anyDigit = false
  for (let i = 0; i < total; i += 1) if ((walls[i] ?? -1) >= 0) { anyDigit = true; break }
  if (!anyDigit) {
    outer: for (let cell = 0; cell < total; cell += 1) {
      if (walls[cell] !== PLAIN_WALL) continue
      let count = 0
      for (const n of neighborsOf(size, cell)) if (lights.has(n)) count += 1
      if (count > 0) { walls[cell] = count; break outer }
    }
  }
  return { size, walls, solution: lights }
}
