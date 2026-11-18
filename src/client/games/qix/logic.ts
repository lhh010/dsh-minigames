/**
 * 圈地争夺（Qix）纯逻辑引擎：格子制空地、边缘安全带、沿边移动 /
 * 切入拖笔迹 / 回边闭合填充的玩家状态机、墨怪在未占领区确定性游荡
 * （弹墙直线 + 注入种子随机转向）、笔迹被触碰丢命、占领率与五关递进。
 * 渲染无关、无 DOM；所有随机来自注入的 mulberry32 种子，可确定性重放。
 */

/** 方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right'

/** 玩家所处模式：沿边（已占格上滑行）或拖笔迹（空地中作画）。 */
export type PlayerMode = 'edge' | 'draw'

/** 对局阶段。 */
export type QixStatus = 'playing' | 'levelClear' | 'gameover'

/** 方向到格位移的映射。 */
export const DIR_DELTA: Record<Dir, { dx: number, dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

/** 相反方向映射（拖笔迹时禁止 180° 掉头）。 */
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/** 场地列数。 */
export const COLS = 40
/** 场地行数。 */
export const ROWS = 26
/** 玩家步进间隔（毫秒）。 */
export const PLAYER_STEP_MS = 80
/** 每关墨怪步进间隔（毫秒），随关卡递减（更快）。 */
export const QIX_STEP_MS = [340, 300, 260, 230, 200] as const
/** 每关墨怪数量，随关卡递增。 */
export const QIX_COUNT = [3, 3, 4, 4, 5] as const
/** 每关占领率过关目标。 */
export const TARGET_RATIO = [0.75, 0.78, 0.8, 0.82, 0.85] as const
/** 总关数。 */
export const LEVELS = 5
/** 初始命数。 */
export const LIVES = 3
/** 每占一格得分。 */
export const SCORE_PER_CELL = 10
/** 过关基础奖励（再乘关卡数）。 */
export const LEVEL_CLEAR_BONUS = 200

/** 一只墨怪：未占领区内直线游荡、受阻或随机时换向。 */
export interface Qix {
  /** 当前列。 */
  x: number
  /** 当前行。 */
  y: number
  /** 行进方向分量（-1/0/1，允许斜向）。 */
  dx: number
  /** 行进方向分量。 */
  dy: number
}

/** 一次按键输入记录（重放用）。 */
export interface KeyEvent {
  /** 输入生效时的引擎帧号（advance 调用序数）。 */
  cycle: number
  /** 方向键。 */
  dir: Dir
  /** true 按下 / false 松开。 */
  down: boolean
}

/** 引擎状态：一关进行中 + 整场比赛的关卡、命、得分与重放日志。 */
export interface QixState {
  /** 当前关卡（1 起）。 */
  level: number
  /** 剩余命。 */
  lives: number
  /** 总得分。 */
  score: number
  /** 对局阶段。 */
  status: QixStatus
  /** 占领图：0 空、1 己占（含初始安全带）。 */
  own: Uint8Array
  /** 玩家列。 */
  px: number
  /** 玩家行。 */
  py: number
  /** 玩家模式。 */
  mode: PlayerMode
  /** 拖笔迹中已走过的格索引（按时间序，末尾为玩家所在格）。 */
  trail: number[]
  /** 本段笔迹起笔的边缘格（丢命后回到这里）。 */
  drawStart: { x: number, y: number }
  /** 按住的方向（最近按下优先）。 */
  held: Dir[]
  /** 墨怪列表。 */
  qix: Qix[]
  /** 最近一次闭合填充的格数（渲染提示用）。 */
  lastFillCount: number
  /** 引擎帧号（每次 advance 调用 +1，重放锚点）。 */
  cycle: number
  /** 玩家步进累加器（毫秒）。 */
  playerAccumMs: number
  /** 玩家上一格（渲染插值用）。 */
  prevCell: { x: number, y: number }
  /** 墨怪步进累加器（毫秒）。 */
  qixAccumMs: number
  /** 注入的确定性随机源。 */
  rng: () => number
  /** 按键日志（重放用，跨关累积）。 */
  inputLog: KeyEvent[]
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

function idx(x: number, y: number): number {
  return y * COLS + x
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS
}

/** 某格是否属于安全带（场地最外一圈）。 */
export function isBelt(x: number, y: number): boolean {
  return x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1
}

/** 内部格总数（不含安全带），占领率的分母。 */
export function interiorCount(): number {
  return (COLS - 2) * (ROWS - 2)
}

/** 当前占领率：内部格中己占的比例（安全带不计入）。 */
export function ownedRatio(state: QixState): number {
  let owned = 0
  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (state.own[idx(x, y)] === 1) owned += 1
    }
  }
  return owned / interiorCount()
}

/** 当前关的墨怪数量。 */
export function qixCountFor(level: number): number {
  return QIX_COUNT[Math.min(level, LEVELS) - 1]!
}

/** 当前关的墨怪步进间隔（毫秒）。 */
export function qixStepMsFor(level: number): number {
  return QIX_STEP_MS[Math.min(level, LEVELS) - 1]!
}

/** 当前关的过关占领率目标。 */
export function targetFor(level: number): number {
  return TARGET_RATIO[Math.min(level, LEVELS) - 1]!
}

function freshBoard(state: QixState): void {
  state.own = new Uint8Array(COLS * ROWS)
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (isBelt(x, y)) state.own[idx(x, y)] = 1
    }
  }
  state.px = Math.floor(COLS / 2)
  state.py = 0
  state.prevCell = { x: state.px, y: state.py }
  state.mode = 'edge'
  state.trail = []
  state.drawStart = { x: state.px, y: state.py }
  state.held = []
  state.lastFillCount = 0
  state.playerAccumMs = 0
  state.qixAccumMs = 0
  state.status = 'playing'
  const count = qixCountFor(state.level)
  const qix: Qix[] = []
  for (let i = 0; i < count; i += 1) {
    // 沿内部横向均匀落位，避开安全带，初始朝向由种子决定。
    const x = Math.floor(((i + 1) * (COLS - 2)) / (count + 1)) + 1
    const y = 3 + (i % 3) * Math.floor((ROWS - 8) / 2)
    const dirs = [-1, 0, 1]
    qix.push({
      x,
      y,
      dx: dirs[Math.floor(state.rng() * 3)]!,
      dy: dirs[Math.floor(state.rng() * 3)]!,
    })
  }
  state.qix = qix
}

/** 创建一场新比赛（第 1 关开始）。
 * @param seed - 随机种子（墨怪初始方向与转向用）。
 * @returns 初始引擎状态。
 */
export function createQixState(seed: number): QixState {
  const state: QixState = {
    level: 1,
    lives: LIVES,
    score: 0,
    status: 'playing',
    own: new Uint8Array(COLS * ROWS),
    px: 0,
    py: 0,
    mode: 'edge',
    trail: [],
    drawStart: { x: 0, y: 0 },
    held: [],
    qix: [],
    lastFillCount: 0,
    cycle: 0,
    playerAccumMs: 0,
    prevCell: { x: 0, y: 0 },
    qixAccumMs: 0,
    rng: mulberry32(seed),
    inputLog: [],
  }
  freshBoard(state)
  return state
}

/** 按键输入：维护按住方向列表（最近按下优先）并记入重放日志。
 * @param state - 引擎状态。
 * @param dir - 方向。
 * @param down - true 按下 / false 松开。
 */
export function setHeld(state: QixState, dir: Dir, down: boolean): void {
  const at = state.held.indexOf(dir)
  if (down) {
    if (at >= 0) state.held.splice(at, 1)
    state.held.unshift(dir)
  } else if (at >= 0) {
    state.held.splice(at, 1)
  }
  state.inputLog.push({ cycle: state.cycle, dir, down })
}

/** 某格是否为当前笔迹的一部分。 */
function inTrail(state: QixState, x: number, y: number): boolean {
  const i = idx(x, y)
  for (const t of state.trail) {
    if (t === i) return true
  }
  return false
}

/**
 * 闭合填充：先把笔迹格全部置为己占，再对剩余空格做连通分量洪泛，
 * 不含墨怪的分量整体填充（即“闭合环包围的、不含敌人的一侧”）。
 * @param state - 引擎状态（笔迹非空时调用）。
 * @returns 本次新占的内部格数（含笔迹格）。
 */
export function closeAndFill(state: QixState): number {
  if (state.trail.length === 0) return 0
  for (const t of state.trail) state.own[t] = 1
  const seen = new Uint8Array(COLS * ROWS)
  const qixCells = new Set<number>()
  for (const q of state.qix) qixCells.add(idx(q.x, q.y))
  let filled = 0
  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      const start = idx(x, y)
      if (seen[start] === 1 || state.own[start] === 1) continue
      // 洪泛收集本分量，并记录是否含墨怪。
      const component: number[] = []
      let hasQix = false
      const queue: number[] = [start]
      seen[start] = 1
      while (queue.length > 0) {
        const cur = queue.pop()!
        component.push(cur)
        if (qixCells.has(cur)) hasQix = true
        const cx = cur % COLS
        const cy = (cur - cx) / COLS
        for (const delta of [DIR_DELTA.up, DIR_DELTA.down, DIR_DELTA.left, DIR_DELTA.right]) {
          const nx = cx + delta.dx
          const ny = cy + delta.dy
          if (!inBounds(nx, ny)) continue
          const n = idx(nx, ny)
          if (seen[n] === 1 || state.own[n] === 1) continue
          seen[n] = 1
          queue.push(n)
        }
      }
      if (!hasQix) {
        for (const c of component) state.own[c] = 1
        filled += component.length
      }
    }
  }
  return filled
}

/** 笔迹或玩家与墨怪的碰撞：任一墨怪落在笔迹格上或与其四邻接即命中。 */
export function trailHit(state: QixState): boolean {
  if (state.mode !== 'draw' || state.trail.length === 0) return false
  for (const t of state.trail) {
    const tx = t % COLS
    const ty = (t - tx) / COLS
    for (const q of state.qix) {
      if (Math.abs(q.x - tx) + Math.abs(q.y - ty) <= 1) return true
    }
  }
  return false
}

function loseLife(state: QixState): void {
  state.lives -= 1
  state.trail = []
  state.mode = 'edge'
  state.px = state.drawStart.x
  state.py = state.drawStart.y
  state.prevCell = { x: state.px, y: state.py }
  state.held = []
  if (state.lives <= 0) state.status = 'gameover'
}

/**
 * 玩家走一格：沿边模式在已占格滑行、朝空格切入转 draw；拖笔迹模式
 * 前进/转向（禁掉头）、进已占格即闭合填充并回到沿边模式。
 * @param state - 引擎状态。
 * @returns true 表示发生了移动或闭合。
 */
export function stepPlayer(state: QixState): boolean {
  if (state.status !== 'playing') return false
  // draw 模式下禁掉头：从按住列表里去掉与首选项相反的方向。
  const lead = state.held[0]
  const list = state.held.filter((d) => {
    if (state.mode === 'edge' || lead === undefined) return true
    return d !== OPPOSITE[lead]
  })
  for (const dir of list) {
    const delta = DIR_DELTA[dir]
    const nx = state.px + delta.dx
    const ny = state.py + delta.dy
    if (!inBounds(nx, ny)) continue
    const target = state.own[idx(nx, ny)]
    const onTrail = state.mode === 'draw' && inTrail(state, nx, ny)
    if (state.mode === 'edge') {
      if (target === 1) {
        state.prevCell = { x: state.px, y: state.py }
        state.px = nx
        state.py = ny
        return true
      }
      // 空格：切入，开始拖笔迹。
      state.drawStart = { x: state.px, y: state.py }
      state.mode = 'draw'
      state.trail = [idx(state.px, state.py), idx(nx, ny)]
      state.prevCell = { x: state.px, y: state.py }
      state.px = nx
      state.py = ny
      return true
    }
    // draw 模式：笔迹格（除回环不可能，因禁掉头）不进入。
    if (onTrail) continue
    if (target === 1) {
      // 回到边缘/己占区：闭合填充。
      const trailLen = state.trail.length - 1 // 去掉起笔格（本就是己占格）
      const filled = closeAndFill(state)
      state.score += (trailLen + filled) * SCORE_PER_CELL
      state.lastFillCount = filled
      state.trail = []
      state.mode = 'edge'
      state.prevCell = { x: state.px, y: state.py }
      state.px = nx
      state.py = ny
      if (ownedRatio(state) >= targetFor(state.level)) state.status = 'levelClear'
      return true
    }
    state.prevCell = { x: state.px, y: state.py }
    state.trail.push(idx(nx, ny))
    state.px = nx
    state.py = ny
    return true
  }
  return false
}

/** 墨怪候选方向序列：8 邻域，由注入 rng 洗牌。 */
function shuffledDirs(rng: () => number): Array<{ dx: number, dy: number }> {
  const dirs = [
    { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
  ]
  for (let i = dirs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = dirs[i]!
    dirs[i] = dirs[j]!
    dirs[j] = tmp
  }
  return dirs
}

/**
 * 所有墨怪走一格：目标为空格则直线前进（小概率随机转向），受阻则从
 * rng 洗牌的 8 邻域里选第一个可行的空格方向；随后检查笔迹碰撞。
 * @param state - 引擎状态。
 */
export function stepQix(state: QixState): void {
  if (state.status !== 'playing') return
  for (const q of state.qix) {
    const free = (x: number, y: number): boolean =>
      inBounds(x, y) && state.own[idx(x, y)] === 0
    let moved = false
    if (free(q.x + q.dx, q.y + q.dy)) {
      // 8% 概率随机转向（种子驱动），否则直线前进。
      if (state.rng() >= 0.08) {
        q.x += q.dx
        q.y += q.dy
        moved = true
      }
    }
    if (!moved) {
      for (const d of shuffledDirs(state.rng)) {
        if (free(q.x + d.dx, q.y + d.dy)) {
          q.dx = d.dx
          q.dy = d.dy
          q.x += q.dx
          q.y += q.dy
          break
        }
      }
    }
  }
  if (trailHit(state)) loseLife(state)
}

/**
 * 推进引擎（由渲染帧驱动）：按各自步进间隔推进玩家与墨怪。
 * @param state - 引擎状态。
 * @param dtMs - 距上一帧的毫秒数。
 */
export function advance(state: QixState, dtMs: number): void {
  if (state.status !== 'playing') return
  state.cycle += 1
  state.playerAccumMs += dtMs
  while (state.playerAccumMs >= PLAYER_STEP_MS) {
    state.playerAccumMs -= PLAYER_STEP_MS
    if (state.held.length > 0) stepPlayer(state)
    if (trailHit(state)) {
      loseLife(state)
      return
    }
  }
  state.qixAccumMs += dtMs
  const interval = qixStepMsFor(state.level)
  while (state.qixAccumMs >= interval) {
    state.qixAccumMs -= interval
    stepQix(state)
    if (state.status !== 'playing') return
  }
}

/** 进入下一关：盘面重置、墨怪更多更快、目标更高，得分与命保留并加过关奖励。
 * @param state - 引擎状态（须处于 levelClear 且还有下一关）。
 */
export function startNextLevel(state: QixState): void {
  if (state.status !== 'levelClear' || state.level >= LEVELS) return
  state.score += state.level * LEVEL_CLEAR_BONUS
  state.level += 1
  freshBoard(state)
}

/** 整场比赛是否已通关（最后一关过关）。 */
export function matchWon(state: QixState): boolean {
  return state.status === 'levelClear' && state.level >= LEVELS
}

/**
 * 确定性重放：按固定 dt 序列重演按键日志，复现局面。
 * @param seed - 与原始对局相同的种子。
 * @param log - 原始对局记录的按键日志。
 * @param cycles - 重放帧数。
 * @param dtMs - 每帧毫秒数（须与记录时的节奏一致才有意义；测试用固定值）。
 * @returns 重放得到的引擎状态。
 */
export function replay(seed: number, log: KeyEvent[], cycles: number, dtMs: number): QixState {
  const state = createQixState(seed)
  let next = 0
  for (let c = 0; c < cycles; c += 1) {
    while (next < log.length && log[next]!.cycle === c) {
      setHeld(state, log[next]!.dir, log[next]!.down)
      next += 1
    }
    advance(state, dtMs)
    if (state.status !== 'playing') break
  }
  return state
}

/** 局面签名：占领图 + 墨怪位置的确定性摘要（重放比对用）。 */
export function signature(state: QixState): string {
  const qixPart = state.qix.map((q) => q.x + ',' + q.y + ',' + q.dx + ',' + q.dy).join(';')
  let hash = 2166136261
  for (const v of state.own) {
    hash ^= v
    hash = Math.imul(hash, 16777619)
  }
  return state.level + '|' + state.lives + '|' + state.score + '|' + state.status + '|' +
    state.px + ',' + state.py + '|' + state.mode + '|' + qixPart + '|' + (hash >>> 0).toString(16)
}
