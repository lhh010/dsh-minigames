/**
 * 清扫规划（Vacuum）纯逻辑：seed 确定性的房间生成（家具阻挡 + 角落
 * 充电桩）、扫地机器人的移动/清扫/电量/充电规则、宠物猫的走动与碰撞，
 * 以及「覆盖全部可达格」的过关判定。不含任何 DOM/Canvas 依赖，随机
 * 全部来自注入 seed 的 mulberry32，同一 seed 完全可重放。
 */

/** 最后一关的关卡号。 */
export const FINAL_LEVEL = 5

/** 方向。 */
export type VacuumDir = 'up' | 'down' | 'left' | 'right'
/** 对局状态：进行中 / 过关（本关） / 电量耗尽卡死。 */
export type VacuumStatus = 'playing' | 'won' | 'dead'

/** 房间网格：cells[i] 为 1 表示家具阻挡，dock 为充电桩（机器人起点）。 */
export interface VacuumRoom {
  cols: number
  rows: number
  cells: Uint8Array
  dock: { x: number; y: number }
}

/** 单关配置：尺寸 / 家具数 / 电量 / 充电次数 / 是否有猫。 */
export interface VacuumLevelConfig {
  cols: number
  rows: number
  furniture: number
  battery: number
  recharges: number
  cat: boolean
  /** 每移动多少步猫走一格。 */
  catEvery: number
}

/** 宠物猫：随机游走的 1 格障碍。 */
export interface VacuumCat {
  x: number
  y: number
}

/** 一局状态。 */
export interface VacuumState {
  level: number
  cfg: VacuumLevelConfig
  room: VacuumRoom
  /** 从充电桩可达的格标记（过关分母）。 */
  reachable: Uint8Array
  /** 可达格总数。 */
  reachableCount: number
  /** 已清扫标记。 */
  cleaned: Uint8Array
  cleanedCount: number
  robot: { x: number; y: number }
  facing: VacuumDir
  battery: number
  recharges: number
  /** 累计移动步数（驱动猫的节拍）。 */
  moveCount: number
  cat: VacuumCat | null
  status: VacuumStatus
  /** 猫走动 / 弹开共用的注入随机源。 */
  rng: () => number
}

/** tryMove 的结果快照。 */
export interface VacuumMoveResult {
  moved: boolean
  /** 撞墙 / 撞家具：机器人不动、不耗电。 */
  blocked: boolean
  /** 撞猫：-5 电量，猫被弹开，机器人不动。 */
  catBump: boolean
  /** 本次移动踩进了新清扫的格。 */
  cleanedNew: boolean
  recharged: boolean
  won: boolean
  dead: boolean
}

const DIR_DELTA: Record<VacuumDir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

/**
 * mulberry32 确定性随机源：同一 seed 产生同一 [0,1) 序列。
 * @param seed - 32 位无符号种子。
 * @returns 返回 [0,1) 浮点的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 关卡配置：5 关递进——房间变大、家具更密、电量更紧、充电次数更少，
 * 第 4 关起出现宠物猫。
 * @param level - 关卡号（1..5），越界钳制到边界值。
 */
export function levelConfig(level: number): VacuumLevelConfig {
  const l = Math.max(1, Math.min(FINAL_LEVEL, Math.round(level)))
  const table: VacuumLevelConfig[] = [
    { cols: 8, rows: 8, furniture: 6, battery: 24, recharges: 3, cat: false, catEvery: 3 },
    { cols: 10, rows: 9, furniture: 10, battery: 30, recharges: 3, cat: false, catEvery: 3 },
    { cols: 12, rows: 10, furniture: 16, battery: 40, recharges: 2, cat: false, catEvery: 3 },
    { cols: 13, rows: 11, furniture: 20, battery: 46, recharges: 2, cat: true, catEvery: 3 },
    { cols: 14, rows: 12, furniture: 26, battery: 55, recharges: 2, cat: true, catEvery: 3 },
  ]
  return table[l - 1]!
}

/** 判断 (x,y) 是否在网格内。 */
function inBounds(room: VacuumRoom, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < room.cols && y < room.rows
}

/** 判断 (x,y) 是否可通行（界内且非家具）。 */
export function isFloor(room: VacuumRoom, x: number, y: number): boolean {
  return inBounds(room, x, y) && room.cells[y * room.cols + x] === 0
}

/**
 * 从充电桩做 BFS，标记所有可达格（被家具完全围死的区域不计入）。
 * @param room - 房间网格。
 * @returns 可达标记数组和可达格总数。
 */
export function analyzeRoom(room: VacuumRoom): { reachable: Uint8Array; count: number } {
  const flags = new Uint8Array(room.cols * room.rows)
  const queue: number[] = [room.dock.y * room.cols + room.dock.x]
  flags[queue[0]!] = 1
  let count = 0
  while (queue.length > 0) {
    const i = queue.shift()!
    count += 1
    const x = i % room.cols
    const y = (i - x) / room.cols
    for (const delta of [DIR_DELTA.up, DIR_DELTA.down, DIR_DELTA.left, DIR_DELTA.right]) {
      const nx = x + delta[0]
      const ny = y + delta[1]
      if (!isFloor(room, nx, ny)) continue
      const ni = ny * room.cols + nx
      if (flags[ni] === 1) continue
      flags[ni] = 1
      queue.push(ni)
    }
  }
  return { reachable: flags, count }
}

/**
 * 用注入随机源生成一间房：充电桩固定 (0,0) 角落，家具随机撒放并保留
 * 桩位；可达格占比过低（大片区域被围死）时换一批布局重试，保证盘面
 * 可玩。同一 (rng 序列) 完全确定。
 * @param rng - 注入随机源。
 * @param cfg - 关卡配置。
 * @returns 生成的房间。
 */
export function generateRoom(rng: () => number, cfg: VacuumLevelConfig): VacuumRoom {
  const total = cfg.cols * cfg.rows
  const dock = { x: 0, y: 0 }
  let best: VacuumRoom | null = null
  let bestCount = -1
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const cells = new Uint8Array(total)
    let placed = 0
    while (placed < cfg.furniture) {
      const i = Math.floor(rng() * total)
      if (i === 0 || cells[i] === 1) continue
      cells[i] = 1
      placed += 1
    }
    const room: VacuumRoom = { cols: cfg.cols, rows: cfg.rows, cells, dock }
    const { count } = analyzeRoom(room)
    if (count >= Math.max(10, Math.ceil((total - cfg.furniture) * 0.68))) return room
    if (count > bestCount) {
      bestCount = count
      best = room
    }
  }
  return best!
}

/**
 * 由已定房间（可手工构造，便于测试围死区域）+ 配置 + 随机源创建对局。
 * 机器人在充电桩出发，起点格视为已清扫。
 * @param room - 房间。
 * @param cfg - 关卡配置（cat 为 true 时在距桩 ≥3 的可达格放猫）。
 * @param rng - 注入随机源（猫走动共用）。
 */
export function createVacuumStateFromRoom(
  room: VacuumRoom,
  cfg: VacuumLevelConfig,
  rng: () => number,
): VacuumState {
  const { reachable, count } = analyzeRoom(room)
  const cleaned = new Uint8Array(room.cols * room.rows)
  const dockIndex = room.dock.y * room.cols + room.dock.x
  cleaned[dockIndex] = 1
  const state: VacuumState = {
    level: 1,
    cfg,
    room,
    reachable,
    reachableCount: count,
    cleaned,
    cleanedCount: 1,
    robot: { x: room.dock.x, y: room.dock.y },
    facing: 'right',
    battery: cfg.battery,
    recharges: cfg.recharges,
    moveCount: 0,
    cat: null,
    status: 'playing',
    rng,
  }
  if (cfg.cat) {
    const candidates: number[] = []
    for (let i = 0; i < room.cells.length; i += 1) {
      if (reachable[i] !== 1 || i === dockIndex) continue
      const x = i % room.cols
      const y = (i - x) / room.cols
      if (Math.abs(x - room.dock.x) + Math.abs(y - room.dock.y) >= 3) candidates.push(i)
    }
    if (candidates.length > 0) {
      const i = candidates[Math.floor(rng() * candidates.length)]!
      state.cat = { x: i % room.cols, y: Math.floor(i / room.cols) }
    }
  }
  return state
}

/**
 * 创建某一关的完整对局（生成房间 + 放猫），同 seed 同关卡完全一致。
 * @param seed - 32 位种子。
 * @param level - 关卡号。
 */
export function createVacuumState(seed: number, level: number): VacuumState {
  const rng = mulberry32(seed)
  const cfg = levelConfig(level)
  const room = generateRoom(rng, cfg)
  const state = createVacuumStateFromRoom(room, cfg, rng)
  state.level = level
  return state
}

/** 猫的候选落点：界内、非家具、非充电桩、非机器人当前格。 */
function catCandidates(state: VacuumState): { x: number; y: number }[] {
  if (state.cat === null) return []
  const out: { x: number; y: number }[] = []
  for (const delta of [DIR_DELTA.up, DIR_DELTA.down, DIR_DELTA.left, DIR_DELTA.right]) {
    const nx = state.cat.x + delta[0]
    const ny = state.cat.y + delta[1]
    if (!isFloor(state.room, nx, ny)) continue
    if (nx === state.room.dock.x && ny === state.room.dock.y) continue
    if (nx === state.robot.x && ny === state.robot.y) continue
    out.push({ x: nx, y: ny })
  }
  return out
}

/** 猫按注入随机源走一格（无路可走则原地不动）。 */
function stepCat(state: VacuumState): void {
  const candidates = catCandidates(state)
  if (candidates.length === 0) return
  const next = candidates[Math.floor(state.rng() * candidates.length)]!
  state.cat!.x = next.x
  state.cat!.y = next.y
}

/** 撞猫后猫被弹开：随机跳到相邻自由格（无路则忍着不动）。 */
function bounceCat(state: VacuumState): void {
  stepCat(state)
}

/** 移动后的统一结算：先判过关（清扫分母只算可达格），再判电量卡死。 */
function settle(state: VacuumState): { won: boolean; dead: boolean } {
  if (state.cleanedCount >= state.reachableCount) {
    state.status = 'won'
    return { won: true, dead: false }
  }
  if (state.battery <= 0) {
    const onDock = state.robot.x === state.room.dock.x && state.robot.y === state.room.dock.y
    const canCharge = onDock && state.recharges > 0
    if (!canCharge) {
      state.status = 'dead'
      return { won: false, dead: true }
    }
  }
  return { won: false, dead: false }
}

/**
 * 机器人朝 dir 移动一格的完整规则结算：
 * 界外/家具 = 阻挡不动不耗电；目标是猫 = -5 电量、猫被弹开、机器人
 * 不动；否则移动 -1 电量、经过即清扫（新格计数一次）。踩回充电桩且
 * 电量未满且有剩余次数时自动充满并消耗一次。每 catEvery 步猫走一格。
 * @param state - 对局状态。
 * @param dir - 方向。
 */
export function tryMove(state: VacuumState, dir: VacuumDir): VacuumMoveResult {
  const result: VacuumMoveResult = {
    moved: false, blocked: false, catBump: false, cleanedNew: false, recharged: false, won: false, dead: false,
  }
  state.facing = dir
  if (state.status !== 'playing') return result
  const delta = DIR_DELTA[dir]
  const nx = state.robot.x + delta[0]
  const ny = state.robot.y + delta[1]
  if (!isFloor(state.room, nx, ny)) {
    result.blocked = true
    return result
  }
  if (state.cat !== null && state.cat.x === nx && state.cat.y === ny) {
    result.catBump = true
    state.battery = Math.max(0, state.battery - 5)
    bounceCat(state)
    const after = settle(state)
    result.dead = after.dead
    result.won = after.won
    return result
  }
  state.robot.x = nx
  state.robot.y = ny
  state.battery -= 1
  result.moved = true
  const i = ny * state.room.cols + nx
  if (state.cleaned[i] === 0) {
    state.cleaned[i] = 1
    state.cleanedCount += 1
    result.cleanedNew = true
  }
  const onDock = nx === state.room.dock.x && ny === state.room.dock.y
  if (onDock && state.battery < state.cfg.battery && state.recharges > 0) {
    state.battery = state.cfg.battery
    state.recharges -= 1
    result.recharged = true
  }
  state.moveCount += 1
  if (state.cat !== null && state.cfg.catEvery > 0 && state.moveCount % state.cfg.catEvery === 0) {
    stepCat(state)
  }
  const after = settle(state)
  result.won = after.won
  result.dead = after.dead
  return result
}

/**
 * 清扫覆盖率（0..1，分母为可达格总数）。
 * @param state - 对局状态。
 */
export function coverage(state: VacuumState): number {
  return state.cleanedCount / state.reachableCount
}
