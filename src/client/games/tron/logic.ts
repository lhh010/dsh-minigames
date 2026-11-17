/**
 * 光轮对决（Tron Light Cycles）纯逻辑引擎：格子制竞技场、双方恒速移动、
 * 身后光墙永久成墙、碰撞判定、floodfill 可达空间评估与三层确定性 AI。
 * 渲染无关、无 DOM；所有随机来自注入的 mulberry32 种子，可确定性重放。
 */
/** 方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right'

/** 一方：玩家或 AI。 */
export type Side = 'player' | 'ai'

/** 方向到格位移的映射。 */
export const DIR_DELTA: Record<Dir, { dx: number, dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

/** 相反方向映射（禁止 180° 掉头）。 */
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/** 竞技场列数。 */
export const COLS = 40
/** 竞技场行数。 */
export const ROWS = 26
/** 基础步进间隔（毫秒）。 */
export const STEP_MS_BASE = 110
/** 后期最小步进间隔（速度上限）。 */
export const STEP_MS_MIN = 80
/** 速度爬坡时长（格数）：间隔由 BASE 线性降到 MIN。 */
export const SPEED_RAMP_TICKS = 240
/** 三局两胜所需胜场。 */
export const WINS_NEEDED = 2
/** 开局抢占中央的阶段格数（第三层：先手压制）。 */
export const OPENING_TICKS = 18
/** 进入封锁倾向的自由格占比阈值（第二层）。 */
export const LATE_FREE_RATIO = 0.4

/** 一方的当前状态。 */
export interface Rider {
  /** 头部所在列（0 起）。 */
  x: number
  /** 头部所在行（0 起）。 */
  y: number
  /** 当前朝向。 */
  dir: Dir
  /** 上一格位置（渲染插值用）。 */
  px: number
  /** 上一格行（渲染插值用）。 */
  py: number
}

/** 一次转向输入记录（重放用）。 */
export interface TurnInput {
  /** 第几局（1 起）。 */
  round: number
  /** 该局第几格（0 起）。 */
  tick: number
  /** 哪一方转向。 */
  side: Side
  /** 目标方向。 */
  dir: Dir
}

/** 引擎状态：一局进行中 + 整场比赛的局分与重放日志。 */
export interface TronState {
  /** 当前局数（1 起）。 */
  round: number
  /** 当前局已步进格数。 */
  tick: number
  /** 双方骑手。 */
  riders: Record<Side, Rider>
  /** 墙面图：0 空、1 玩家光墙、2 AI 光墙（含双方当前头部格）。 */
  walls: Uint8Array
  /** 双方轨迹按时间序（渲染渐隐用）。 */
  trails: Record<Side, Array<{ x: number, y: number }>>
  /** 待生效转向（本回合玩家输入）。 */
  pending: Record<Side, Dir | undefined>
  /** 局分。 */
  wins: Record<Side, number>
  /** 本局是否已结束。 */
  roundOver: boolean
  /** 本局胜者；'draw' 表示同格相撞平局。 */
  winner: Side | 'draw' | undefined
  /** 撞击点（爆炸粒子用），每局结束时有 1-2 个。 */
  crashCells: Array<{ x: number, y: number }>
  /** 最近一次速度档位变化的 tick（渲染提速提示用）。 */
  lastSpeedTierChange: number
  /** 步进累加器（毫秒）。 */
  stepAccumMs: number
  /** 注入的确定性随机源。 */
  rng: () => number
  /** 玩家转向日志（重放用，跨局累积）。 */
  inputLog: TurnInput[]
}

/** mulberry32：种子化的确定性 [0,1) 随机源。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
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

function cellIndex(x: number, y: number): number {
  return y * COLS + x
}

/** 某格是否在竞技场内且非墙。
 * @param x - 列。
 * @param y - 行。
 * @param walls - 墙面图。
 */
export function isFree(x: number, y: number, walls: Uint8Array): boolean {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false
  return walls[cellIndex(x, y)] === 0
}

/** floodfill：从某空格出发可达的空格总数（不可穿过墙）。
 * @param x - 起始列（须为空格，否则返回 0）。
 * @param y - 起始行。
 * @param walls - 墙面图。
 * @returns 可达空格数（含起点）。
 */
export function floodFill(x: number, y: number, walls: Uint8Array): number {
  if (!isFree(x, y, walls)) return 0
  const seen = new Uint8Array(COLS * ROWS)
  const queue: number[] = [cellIndex(x, y)]
  seen[queue[0]!] = 1
  let count = 0
  while (queue.length > 0) {
    const idx = queue.pop()!
    count += 1
    const cx = idx % COLS
    const cy = (idx - cx) / COLS
    for (const delta of [DIR_DELTA.up, DIR_DELTA.down, DIR_DELTA.left, DIR_DELTA.right]) {
      const nx = cx + delta.dx
      const ny = cy + delta.dy
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
      const nIdx = cellIndex(nx, ny)
      if (seen[nIdx] === 1 || walls[nIdx] !== 0) continue
      seen[nIdx] = 1
      queue.push(nIdx)
    }
  }
  return count
}

/** 当前步进间隔：随 tick 线性加快（110ms → 80ms）。
 * @param state - 引擎状态。
 */
export function stepIntervalMs(state: TronState): number {
  const t = Math.min(1, state.tick / SPEED_RAMP_TICKS)
  return STEP_MS_BASE - (STEP_MS_BASE - STEP_MS_MIN) * t
}

function freshBoard(state: TronState): void {
  state.walls = new Uint8Array(COLS * ROWS)
  state.tick = 0
  state.roundOver = false
  state.winner = undefined
  state.crashCells = []
  state.stepAccumMs = 0
  state.pending.player = undefined
  state.pending.ai = undefined
  state.lastSpeedTierChange = 0
  state.trails.player = []
  state.trails.ai = []
  const midY = Math.floor(ROWS / 2)
  state.riders.player = { x: 4, y: midY, dir: 'right', px: 4, py: midY }
  state.riders.ai = { x: COLS - 5, y: midY, dir: 'left', px: COLS - 5, py: midY }
  state.walls[cellIndex(4, midY)] = 1
  state.walls[cellIndex(COLS - 5, midY)] = 2
  state.trails.player.push({ x: 4, y: midY })
  state.trails.ai.push({ x: COLS - 5, y: midY })
}

/** 创建一场新比赛（第 1 局开始）。
 * @param seed - 随机种子（AI 噪声用）。
 * @returns 初始引擎状态。
 */
export function createTronState(seed: number): TronState {
  const state: TronState = {
    round: 1,
    tick: 0,
    riders: {} as Record<Side, Rider>,
    walls: new Uint8Array(COLS * ROWS),
    trails: { player: [], ai: [] },
    pending: { player: undefined, ai: undefined },
    wins: { player: 0, ai: 0 },
    roundOver: false,
    winner: undefined,
    crashCells: [],
    lastSpeedTierChange: 0,
    stepAccumMs: 0,
    rng: mulberry32(seed),
    inputLog: [],
  }
  freshBoard(state)
  return state
}

/** 是否与 rider 当前朝向相反（180° 掉头）。
 * @param dir - 待验证方向。
 * @param facing - 当前朝向。
 */
export function isReverse(dir: Dir, facing: Dir): boolean {
  return OPPOSITE[dir] === facing
}

/** 玩家转向输入：非法（掉头/同向）时忽略，否则缓存到本回合末生效并记入日志。
 * @param state - 引擎状态。
 * @param dir - 目标方向。
 */
export function playerTurn(state: TronState, dir: Dir): void {
  if (state.roundOver) return
  if (isReverse(dir, state.riders.player.dir)) return
  if (dir === state.riders.player.dir) return
  state.pending.player = dir
  state.inputLog.push({ round: state.round, tick: state.tick, side: 'player', dir })
}

/**
 * 三层 AI 决策（确定性，同 seed 同局面同选择）：
 * ①安全贪心——floodfill 评估每个非掉头方向的可达空间取最大；
 * ②封锁倾向——自由格占比低时同时压低玩家的可达区域；
 * ③先手压制——开局阶段偏向靠近场地中央。
 * @param state - 引擎状态。
 * @returns 本回合 AI 朝向。
 */
export function aiDecide(state: TronState): Dir {
  const me = state.riders.ai
  const foe = state.riders.player
  let free = 0
  for (let i = 0; i < state.walls.length; i += 1) if (state.walls[i] === 0) free += 1
  const late = free / (COLS * ROWS) < LATE_FREE_RATIO || state.tick > 150
  const opening = state.tick < OPENING_TICKS
  const midX = (COLS - 1) / 2
  const midY = (ROWS - 1) / 2
  let best: Dir = me.dir
  let bestScore = -Infinity
  for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
    if (isReverse(dir, me.dir)) continue
    const delta = DIR_DELTA[dir]
    const nx = me.x + delta.dx
    const ny = me.y + delta.dy
    if (!isFree(nx, ny, state.walls)) continue
    let score = floodFill(nx, ny, state.walls)
    if (late) {
      // 封锁：压低玩家继续直行的可达空间，让对局滑向有利割据。
      const foeDelta = DIR_DELTA[foe.dir]
      score -= 0.6 * floodFill(foe.x + foeDelta.dx, foe.y + foeDelta.dy, state.walls)
    }
    if (opening) {
      const distNow = Math.abs(me.x - midX) + Math.abs(me.y - midY)
      const distNext = Math.abs(nx - midX) + Math.abs(ny - midY)
      score += (distNow - distNext) * 3
    }
    score += state.rng() * 2
    if (score > bestScore) {
      bestScore = score
      best = dir
    }
  }
  return best
}

/** 前进一格：双方同时结算；任一方出界/撞墙判负，同格相撞判平。
 * @param state - 引擎状态。
 */
export function stepOnce(state: TronState): void {
  if (state.roundOver) return
  const player = state.riders.player
  const ai = state.riders.ai
  const prevInterval = stepIntervalMs(state)
  if (state.pending.player !== undefined && !isReverse(state.pending.player, player.dir)) {
    player.dir = state.pending.player
  }
  state.pending.player = undefined
  state.pending.ai = aiDecide(state)
  if (!isReverse(state.pending.ai, ai.dir)) ai.dir = state.pending.ai
  state.pending.ai = undefined

  const pd = DIR_DELTA[player.dir]
  const ad = DIR_DELTA[ai.dir]
  const playerNext = { x: player.x + pd.dx, y: player.y + pd.dy }
  const aiNext = { x: ai.x + ad.dx, y: ai.y + ad.dy }
  const playerHits = !isFree(playerNext.x, playerNext.y, state.walls)
  const aiHits = !isFree(aiNext.x, aiNext.y, state.walls)
  const headOn = !playerHits && !aiHits && playerNext.x === aiNext.x && playerNext.y === aiNext.y

  player.px = player.x
  player.py = player.y
  ai.px = ai.x
  ai.py = ai.y
  state.tick += 1
  const nextInterval = stepIntervalMs(state)
  if (Math.abs(nextInterval - prevInterval) > 0.5) state.lastSpeedTierChange = state.tick

  if (playerHits || aiHits || headOn) {
    state.roundOver = true
    state.crashCells = []
    if (playerHits || headOn) state.crashCells.push({ x: playerNext.x, y: playerNext.y })
    if (aiHits || headOn) state.crashCells.push({ x: aiNext.x, y: aiNext.y })
    if (headOn || (playerHits && aiHits)) state.winner = 'draw'
    else state.winner = playerHits ? 'ai' : 'player'
    if (state.winner !== 'draw') state.wins[state.winner] += 1
    return
  }
  player.x = playerNext.x
  player.y = playerNext.y
  ai.x = aiNext.x
  ai.y = aiNext.y
  state.walls[cellIndex(player.x, player.y)] = 1
  state.walls[cellIndex(ai.x, ai.y)] = 2
  state.trails.player.push({ x: player.x, y: player.y })
  state.trails.ai.push({ x: ai.x, y: ai.y })
}

/** 按耗时驱动步进：累加 dt，到点自动 stepOnce（可能一帧多步）。
 * @param state - 引擎状态。
 * @param dtMs - 距上一帧毫秒数。
 * @returns 本帧实际步进的格数。
 */
export function advance(state: TronState, dtMs: number): number {
  let steps = 0
  state.stepAccumMs += Math.max(0, dtMs)
  while (!state.roundOver && state.stepAccumMs >= stepIntervalMs(state)) {
    state.stepAccumMs -= stepIntervalMs(state)
    stepOnce(state)
    steps += 1
  }
  if (state.roundOver) state.stepAccumMs = 0
  return steps
}

/** 整场比赛是否已分胜负（有人拿到 WINS_NEEDED 胜场）。
 * @param state - 引擎状态。
 */
export function matchOver(state: TronState): boolean {
  return state.wins.player >= WINS_NEEDED || state.wins.ai >= WINS_NEEDED
}

/** 开启下一局（保留局分与随机源）。
 * @param state - 引擎状态。
 */
export function startNextRound(state: TronState): void {
  state.round += 1
  freshBoard(state)
}

/** 墙面指纹：确定性对比两个局面是否一致（重放校验用）。
 * @param state - 引擎状态。
 * @returns 每格墙面值的十六进制串。
 */
export function wallsSignature(state: TronState): string {
  let out = ''
  for (let i = 0; i < state.walls.length; i += 1) out += state.walls[i]!.toString(16)
  return out
}

/** 从种子重放一场对局：按日志在对应 (round, tick) 注入玩家转向，AI 自动决策。
 * @param seed - 与原始对局相同的种子。
 * @param log - 玩家转向日志。
 * @param maxTicks - 每局安全上限（防死循环；双方永不相撞时截断）。
 * @returns 重放后的终局状态。
 */
export function replay(seed: number, log: TurnInput[], maxTicks = 5000): TronState {
  const state = createTronState(seed)
  let i = 0
  let guard = 0
  while (!matchOver(state) && guard < maxTicks) {
    while (i < log.length && log[i]!.round === state.round && log[i]!.tick === state.tick) {
      playerTurn(state, log[i]!.dir)
      i += 1
    }
    if (state.roundOver) {
      startNextRound(state)
      guard += 1
      continue
    }
    stepOnce(state)
    guard += 1
  }
  return state
}
