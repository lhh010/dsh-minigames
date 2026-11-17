/**
 * 手电迷宫（DarkMaze）纯逻辑：种子确定性迷宫生成（迭代式递归回溯）、
 * 金币 / 陷阱 / 电池道具布点、扇形光锥可见性（含格点射线遮挡简化）、
 * 探索记忆集合、移动 / 拾取 / 陷阱 / 过关判定与 0.5s 全图闪现补偿。
 * 全部随机走注入 seed（mulberry32），同 seed 重放结果完全一致；无 DOM。
 */

/** 墙位比特：每格记录「开通」的方向通道（与 maze 游戏同约定）。 */
export const DN = 1
export const DE = 2
export const DS = 4
export const DW = 8

/** 方向 → 位移与对侧墙位。 */
const DIRS: ReadonlyArray<{ dx: number; dy: number; bit: number; opp: number }> = [
  { dx: 0, dy: -1, bit: DN, opp: DS },
  { dx: 1, dy: 0, bit: DE, opp: DW },
  { dx: 0, dy: 1, bit: DS, opp: DN },
  { dx: -1, dy: 0, bit: DW, opp: DE },
]

/** 方向名（与移动键一一对应）。 */
export type DarkDir = 'up' | 'right' | 'down' | 'left'

/** 方向名 → DIRS 下标。 */
const DIR_INDEX: Record<DarkDir, 0 | 1 | 2 | 3> = { up: 0, right: 1, down: 2, left: 3 }

/** mulberry32：小型确定性 32 位 PRNG。
 * @param seed 种子（任意整数，内部取无符号 32 位）
 * @returns 返回 [0,1) 均匀随机数的函数
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 完美迷宫（w×h 格，墙为开通位掩码，行优先 y*w+x）。 */
export interface DarkMaze {
  w: number
  h: number
  walls: Uint8Array
}

/** 用迭代式递归回溯生成完美迷宫；同 seed → 同位掩码。
 * @param seed 确定性种子
 * @param w 列数（≥ 3，向下钳制）
 * @param h 行数（≥ 3，向下钳制）
 * @returns 每格恰有一条通路的生成树迷宫
 */
export function generateDarkMaze(seed: number, w: number, h: number): DarkMaze {
  const cw = Math.max(3, w | 0)
  const ch = Math.max(3, h | 0)
  const walls = new Uint8Array(cw * ch)
  const visited = new Uint8Array(cw * ch)
  const rand = mulberry32(seed)
  const stack: number[] = [0]
  visited[0] = 1
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]!
    const cx = cur % cw
    const cy = (cur / cw) | 0
    const options: number[] = []
    for (let d = 0; d < 4; d += 1) {
      const { dx, dy } = DIRS[d]!
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue
      if (visited[ny * cw + nx] === 1) continue
      options.push(d)
    }
    if (options.length === 0) {
      stack.pop()
      continue
    }
    const d = options[Math.floor(rand() * options.length)]!
    const { dx, dy, bit, opp } = DIRS[d]!
    const next = (cy + dy) * cw + (cx + dx)
    walls[cur] = walls[cur]! | bit
    walls[next] = walls[next]! | opp
    visited[next] = 1
    stack.push(next)
  }
  return { w: cw, h: ch, walls }
}

/** (x,y) 格能否朝 dir 走一步（共享墙开通且不出界）。
 * @param maze 迷宫
 * @param x 当前列
 * @param y 当前行
 * @param dir 方向名
 * @returns 可走为 true
 */
export function darkCanMove(maze: DarkMaze, x: number, y: number, dir: DarkDir): boolean {
  const { dx, dy, bit } = DIRS[DIR_INDEX[dir]]!
  const nx = x + dx
  const ny = y + dy
  if (nx < 0 || ny < 0 || nx >= maze.w || ny >= maze.h) return false
  return (maze.walls[y * maze.w + x]! & bit) !== 0
}

/** 单关参数：尺寸 / 陷阱数 / 金币数 / 电池数 / 手电基础半径（格）。 */
export interface DarkLevelConfig {
  size: number
  traps: number
  coins: number
  batteries: number
  radius: number
}

/** 5 关递进表：15×15 → 25×25，陷阱渐多，后两关手电半径衰减。 */
const LEVEL_TABLE: readonly DarkLevelConfig[] = [
  { size: 15, traps: 4, coins: 6, batteries: 0, radius: 4 },
  { size: 17, traps: 6, coins: 7, batteries: 0, radius: 4 },
  { size: 19, traps: 8, coins: 8, batteries: 0, radius: 4 },
  { size: 21, traps: 11, coins: 9, batteries: 1, radius: 3.4 },
  { size: 25, traps: 14, coins: 11, batteries: 1, radius: 3 },
]

/** 取第 level 关参数（level 钳制到 1..5，越界取端点）。
 * @param level 1 起的关卡号
 * @returns 该关的尺寸与道具配置
 */
export function levelConfig(level: number): DarkLevelConfig {
  const clamped = Math.min(5, Math.max(1, Math.floor(level)))
  return LEVEL_TABLE[clamped - 1]!
}

/** 光锥半张角（±60°）。 */
export const HALF_CONE = Math.PI / 3
/** 全图闪现时长（毫秒）。 */
export const FLASH_MS = 500
/** 每颗电池补充的手电半径（格）。 */
export const BATTERY_BOOST = 1.5
/** 手电半径上限（格）。 */
export const MAX_RADIUS = 5
/** 初始生命。 */
export const START_LIVES = 3

/** 盘面道具（taken = 已拾取 / 已触发）。 */
export interface DarkItem {
  x: number
  y: number
  taken: boolean
}

/** 一局单关的完整可玩状态。 */
export interface DarkMazeState {
  maze: DarkMaze
  /** 1 起的关卡号。 */
  level: number
  player: { x: number; y: number }
  exit: { x: number; y: number }
  coins: DarkItem[]
  traps: DarkItem[]
  batteries: DarkItem[]
  /** 手电朝向（弧度，0 = 东，正角向下/南）。 */
  facing: number
  lives: number
  coinsCollected: number
  steps: number
  /** 探索记忆：见过（光锥照到或踩过）的格子索引集合。 */
  memory: Set<number>
  /** 全图闪现剩余毫秒（>0 期间整张图可见）。 */
  flashMs: number
  /** 电池累计补光（格）。 */
  radiusBoost: number
  status: 'playing' | 'cleared' | 'gameover'
}

/** 当前生效的手电半径（基础 + 电池，封顶 MAX_RADIUS）。
 * @param state 当前状态
 * @returns 半径（格）
 */
export function effectiveRadius(state: DarkMazeState): number {
  return Math.min(MAX_RADIUS, levelConfig(state.level).radius + state.radiusBoost)
}

/** 从 from 格中心到 to 格中心的连线是否通畅（格点射线简化：相邻格查墙，
 * 恰好跨角的斜跳放行）。
 * @param maze 迷宫
 * @param from 起点格
 * @param to 终点格
 * @returns 无墙阻挡为 true
 */
export function hasLineOfSight(maze: DarkMaze, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const x0 = from.x + 0.5
  const y0 = from.y + 0.5
  const x1 = to.x + 0.5
  const y1 = to.y + 0.5
  const dist = Math.hypot(x1 - x0, y1 - y0)
  if (dist < 1e-9) return true
  const steps = Math.ceil(dist * 4)
  let pcx = from.x
  let pcy = from.y
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    const cx = Math.floor(x0 + (x1 - x0) * t)
    const cy = Math.floor(y0 + (y1 - y0) * t)
    if (cx === pcx && cy === pcy) continue
    if (Math.abs(cx - pcx) + Math.abs(cy - pcy) === 1) {
      let bit = 0
      if (cx > pcx) bit = DE
      else if (cx < pcx) bit = DW
      else if (cy > pcy) bit = DS
      else bit = DN
      if ((maze.walls[pcy * maze.w + pcx]! & bit) === 0) return false
    }
    pcx = cx
    pcy = cy
  }
  return true
}

/** 扇形光锥可见格集合：以 origin 为顶点、朝 facing ±60°、半径 radius 格，
 * 中心距超界或角度超界或射线被墙截断的格子不可见；自身格恒可见。
 * @param maze 迷宫
 * @param origin 玩家格
 * @param facing 朝向弧度
 * @param radius 半径（格）
 * @returns 可见格索引集合（y*w+x）
 */
export function visibleCells(maze: DarkMaze, origin: { x: number; y: number }, facing: number, radius: number): Set<number> {
  const out = new Set<number>()
  out.add(origin.y * maze.w + origin.x)
  const r = Math.ceil(radius) + 1
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const x = origin.x + dx
      const y = origin.y + dy
      if (x < 0 || y < 0 || x >= maze.w || y >= maze.h) continue
      const d = Math.hypot(dx, dy)
      if (d > radius) continue
      let diff = Math.atan2(dy, dx) - facing
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      if (Math.abs(diff) > HALF_CONE) continue
      if (!hasLineOfSight(maze, origin, { x, y })) continue
      out.add(y * maze.w + x)
    }
  }
  return out
}

/** 创建一关初始状态：生成迷宫、布道具、朝向指向出口、记忆 = 初始光锥。
 * @param seed 确定性种子（同 seed + 同 level → 完全同盘）
 * @param level 关卡号（1..5，越界钳制）
 * @param lives 初始生命（默认 START_LIVES；跨关沿用上一关剩余生命）
 * @returns 就绪的游玩状态
 */
export function createDarkMazeState(seed: number, level: number, lives: number = START_LIVES): DarkMazeState {
  const cfg = levelConfig(level)
  const maze = generateDarkMaze(seed, cfg.size, cfg.size)
  const exit = { x: maze.w - 1, y: maze.h - 1 }
  const rand = mulberry32((seed ^ Math.imul(level, 0x85ebca6b)) >>> 0)

  // 候选格：非起点、非出口、且离起点曼哈顿距离 > 2（陷阱保命缓冲）。
  const candidates: number[] = []
  for (let i = 0; i < maze.w * maze.h; i += 1) {
    const x = i % maze.w
    const y = (i / maze.w) | 0
    if (x === 0 && y === 0) continue
    if (x === exit.x && y === exit.y) continue
    if (x + y <= 2) continue
    candidates.push(i)
  }
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = candidates[i]!
    candidates[i] = candidates[j]!
    candidates[j] = tmp
  }
  const take = (count: number): DarkItem[] => {
    const items: DarkItem[] = []
    for (let k = 0; k < count && candidates.length > 0; k += 1) {
      const idx = candidates.shift()!
      items.push({ x: idx % maze.w, y: (idx / maze.w) | 0, taken: false })
    }
    return items
  }
  const traps = take(cfg.traps)
  const coins = take(cfg.coins)
  const batteries = take(cfg.batteries)

  const state: DarkMazeState = {
    maze,
    level,
    player: { x: 0, y: 0 },
    exit,
    coins,
    traps,
    batteries,
    facing: Math.atan2(exit.y, exit.x),
    lives,
    coinsCollected: 0,
    steps: 0,
    memory: new Set<number>(),
    flashMs: 0,
    radiusBoost: 0,
    status: 'playing',
  }
  for (const c of visibleCells(maze, state.player, state.facing, effectiveRadius(state))) state.memory.add(c)
  return state
}

/** 一次移动的结果事件（一次移动至多触发其中一个物品事件）。 */
export interface DarkMoveResult {
  /** 是否发生了位移。 */
  moved: boolean
  /** 拾取了金币。 */
  coin: boolean
  /** 踩中未触发过的陷阱。 */
  trap: boolean
  /** 拾取了电池。 */
  battery: boolean
  /** 到达出口过关。 */
  cleared: boolean
  /** 生命耗尽游戏结束。 */
  gameover: boolean
}

/** 朝 dir 走一步：撞墙不动；成功则朝向对齐移动方向并触发格上事件。
 * @param state 当前状态（就地修改）
 * @param dir 方向名
 * @returns 本次移动触发的事件
 */
export function moveDarkPlayer(state: DarkMazeState, dir: DarkDir): DarkMoveResult {
  const result: DarkMoveResult = { moved: false, coin: false, trap: false, battery: false, cleared: false, gameover: false }
  if (state.status !== 'playing') return result
  if (!darkCanMove(state.maze, state.player.x, state.player.y, dir)) return result
  const { dx, dy } = DIRS[DIR_INDEX[dir]]!
  state.player = { x: state.player.x + dx, y: state.player.y + dy }
  state.facing = Math.atan2(dy, dx)
  state.steps += 1
  result.moved = true
  const idx = state.player.y * state.maze.w + state.player.x
  state.memory.add(idx)
  for (const coin of state.coins) {
    if (!coin.taken && coin.x === state.player.x && coin.y === state.player.y) {
      coin.taken = true
      state.coinsCollected += 1
      result.coin = true
      break
    }
  }
  for (const battery of state.batteries) {
    if (!battery.taken && battery.x === state.player.x && battery.y === state.player.y) {
      battery.taken = true
      state.radiusBoost += BATTERY_BOOST
      result.battery = true
      break
    }
  }
  for (const trap of state.traps) {
    if (!trap.taken && trap.x === state.player.x && trap.y === state.player.y) {
      trap.taken = true
      state.lives -= 1
      state.flashMs = FLASH_MS
      result.trap = true
      // 记忆补偿：闪现期间整张图进记忆。
      for (let i = 0; i < state.maze.w * state.maze.h; i += 1) state.memory.add(i)
      break
    }
  }
  if (state.lives <= 0) {
    state.status = 'gameover'
    result.gameover = true
    return result
  }
  if (state.player.x === state.exit.x && state.player.y === state.exit.y) {
    state.status = 'cleared'
    result.cleared = true
  }
  return result
}

/** 旋转手电朝向（仅进行中状态生效）。
 * @param state 当前状态（就地修改）
 * @param facing 目标朝向弧度
 */
export function rotateDarkPlayer(state: DarkMazeState, facing: number): void {
  if (state.status !== 'playing') return
  state.facing = facing
}

/** 推进计时：衰减全图闪现剩余时间。
 * @param state 当前状态（就地修改）
 * @param dtMs 本帧毫秒
 */
export function tickDarkMaze(state: DarkMazeState, dtMs: number): void {
  if (state.flashMs <= 0) return
  state.flashMs = Math.max(0, state.flashMs - Math.max(0, dtMs))
}

/** 计分：金币 ×10 + 已过关数 ×100。
 * @param state 当前状态
 * @param levelsCleared 累计已通关数
 * @returns 当前得分
 */
export function computeScore(state: DarkMazeState, levelsCleared: number): number {
  return state.coinsCollected * 10 + levelsCleared * 100
}

/** 状态的 JSON 可比对快照（确定性重放测试用）。
 * @param state 当前状态
 * @returns 不含迷宫位掩码冗余、可直接 toEqual 比较的快照对象
 */
export function darkStateSnapshot(state: DarkMazeState): Record<string, unknown> {
  return {
    level: state.level,
    player: { ...state.player },
    exit: { ...state.exit },
    coins: state.coins.map(c => c.x + ',' + c.y + ',' + (c.taken ? 1 : 0)),
    traps: state.traps.map(t => t.x + ',' + t.y + ',' + (t.taken ? 1 : 0)),
    batteries: state.batteries.map(b => b.x + ',' + b.y + ',' + (b.taken ? 1 : 0)),
    facing: Math.round(state.facing * 1e6) / 1e6,
    lives: state.lives,
    coinsCollected: state.coinsCollected,
    steps: state.steps,
    memory: [...state.memory].sort((a, b) => a - b),
    flashMs: state.flashMs,
    radiusBoost: state.radiusBoost,
    status: state.status,
  }
}
