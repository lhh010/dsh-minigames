/**
 * 弹珠瀑布 Plinko 纯逻辑：确定性固定子步物理。
 *
 * 盘面（逻辑坐标 640x480）：顶部 9 个投放列，9 行交错三角钉阵
 * （偶数行 10 钉、奇数行 9 钉，行距 30），两侧竖直墙，底部 11 个
 * 倍率槽（边缘低、中央高不对称分布）。
 *
 * 确定性：弹珠-钉碰撞不做真随机——每颗弹珠生成时由 runSeed + 弹珠
 * 序号派生一个子 seed（mulberry32 流），碰钉时按碰撞侧法线 + 当前
 * 速度 + 子 seed 伪随机扰动决定反弹角；因此「同投放点 + 同子 seed」
 * 在相同步长序列下逐位可重放。
 *
 * 轮次：共 3 轮、每轮 5 颗弹珠；落槽结算 = 底注 10 × 倍率。第 1 轮
 * 结束后解锁直方图预览（各投放列的历史落槽分布，辅助选择投放点）。
 */

// ---- 盘面几何（逻辑坐标 640x480，render.ts 同步使用）----
export const BOARD_W = 640
export const BOARD_H = 480
/** 左右竖直墙（弹珠在墙内反弹）。 */
export const WALL_L = 70
export const WALL_R = 570
/** 底部倍率槽：11 槽，槽顶 SLOT_Y、槽高 SLOT_H。 */
export const SLOT_Y = 402
export const SLOT_H = 46
export const SLOT_COUNT = 11
export const SLOT_W = (WALL_R - WALL_L) / SLOT_COUNT
/** 倍率表：边缘低、中央高（不对称峰值）。 */
export const SLOT_MULTIPLIERS: readonly number[] = [
  0.2, 0.5, 1, 2, 5, 10, 5, 2, 1, 0.5, 0.2,
]
/** 钉阵：9 行，行距 30，首行 y=128。 */
export const PEG_ROWS = 9
export const PEG_Y0 = 128
export const PEG_DY = 30
export const PEG_R = 5
export const BALL_R = 6
/** 顶部投放区：9 列，与槽宽对齐展开在盘面中心两侧。 */
export const DROP_COLS = 9
export const DROP_Y = 70
export const DROP_GAP = SLOT_W
export const BOARD_CX = (WALL_L + WALL_R) / 2

// ---- 玩法参数 ----
export const ROUNDS = 3
export const BALLS_PER_ROUND = 5
export const BASE_BET = 10
/** 两次投放之间的最小间隔（模拟秒）。 */
export const DROP_COOLDOWN = 0.3

// ---- 物理参数（固定子步积分，确定性）----
export const SUB = 1 / 240
const GRAVITY = 900
const RESTITUTION = 0.55
const TANGENT_DAMP = 0.92
const WALL_DAMP = 0.6
/** 弹珠模拟寿命上限（秒）：超龄强制按当前横坐标落槽，兜底防卡钉。 */
const MAX_AGE = 12
/** 碰撞扰动角幅度（弧度，±约 0.28）。 */
const PERT_AMP = 0.55
const MIN_SPEED = 60
const TRAIL_MAX = 14

/** 一颗钉。 */
export interface Peg {
  x: number
  y: number
  row: number
  col: number
}

/**
 * 构建三角钉阵：偶数行 10 钉（槽边界上方），奇数行 9 钉（槽中心上方），
 * 两类行的横坐标互相错开半个槽宽。
 * @returns 全部钉，按行序、行内从左到右。
 */
export function buildPegs(): Peg[] {
  const pegs: Peg[] = []
  for (let row = 0; row < PEG_ROWS; row += 1) {
    const even = row % 2 === 0
    const count = even ? 10 : 9
    const offset = even ? 0.5 : 1
    for (let col = 0; col < count; col += 1) {
      pegs.push({
        x: WALL_L + SLOT_W * (offset + col),
        y: PEG_Y0 + row * PEG_DY,
        row,
        col,
      })
    }
  }
  return pegs
}

/** 钉阵（纯几何，静态单例）。 */
export const PEGS: readonly Peg[] = buildPegs()

/**
 * mulberry32 单步推进（函数式，便于逐位重放与断言）。
 * @param state - 当前 32 位内部状态。
 * @returns [0,1) 伪随机值与推进后的状态。
 */
export function mulberryNext(state: number): { value: number, next: number } {
  const t0 = (state + 0x6d2b79f5) >>> 0
  let t = t0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, next: t0 }
}

/**
 * 由 runSeed 与弹珠序号派生子 seed：同 run 同序号的弹珠扰动流相同。
 * @param runSeed - 本局种子。
 * @param index - 弹珠序号（从 0 起）。
 * @returns 32 位子 seed。
 */
export function ballSubSeed(runSeed: number, index: number): number {
  return (runSeed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0
}

/** 一颗飞行中的弹珠。trail 为最近位置（渲染拖尾），长度 ≤ TRAIL_MAX。 */
export interface PlinkoBall {
  id: number
  col: number
  x: number
  y: number
  vx: number
  vy: number
  /** 模拟寿命（秒）。 */
  age: number
  /** mulberry32 内部状态（子 seed 起步）。 */
  rngState: number
  trail: { x: number, y: number }[]
}

export type PlinkoEvent =
  | { kind: 'drop', id: number, col: number, x: number }
  | { kind: 'land', id: number, col: number, slot: number, mult: number, points: number, x: number, y: number }
  | { kind: 'roundEnd', round: number, roundScore: number }
  | { kind: 'ended', score: number }

export interface PlinkoState {
  runSeed: number
  phase: 'playing' | 'ended'
  /** 当前轮（1..ROUNDS）。 */
  round: number
  ballsLeft: number
  aimCol: number
  balls: PlinkoBall[]
  score: number
  /** 本轮累计分。 */
  roundScore: number
  cooldown: number
  elapsed: number
  /** 已投出弹珠总数（子 seed 序号来源）。 */
  dropped: number
  completedRounds: number
  /** 全部落槽记录（slot + 得分）。 */
  landings: { slot: number, points: number }[]
  /** 直方图：histogram[投放列][槽] = 落槽次数。 */
  histogram: number[][]
  events: PlinkoEvent[]
}

/**
 * 投放列的横坐标。
 * @param col - 投放列（0..DROP_COLS-1）。
 * @returns 列中心的 x 坐标。
 */
export function dropColX(col: number): number {
  return BOARD_CX + (col - (DROP_COLS - 1) / 2) * DROP_GAP
}

/**
 * 横坐标对应的槽序号（钳制到 [0, SLOT_COUNT)）。
 * @param x - 横坐标。
 * @returns 槽序号。
 */
export function slotIndexForX(x: number): number {
  return Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor((x - WALL_L) / SLOT_W)))
}

/**
 * 槽 i 的落槽得分 = 底注 × 倍率。
 * @param slot - 槽序号。
 * @returns 得分（整数）。
 */
export function slotPoints(slot: number): number {
  return Math.round(BASE_BET * SLOT_MULTIPLIERS[slot]!)
}

/**
 * 创建一局新游戏。
 * @param seed - 本局随机种子（派生各弹珠子 seed）。
 * @returns 初始状态（第 1 轮、瞄准中央列）。
 */
export function createGame(seed: number): PlinkoState {
  const histogram: number[][] = []
  for (let c = 0; c < DROP_COLS; c += 1) {
    const row: number[] = []
    for (let s = 0; s < SLOT_COUNT; s += 1) row.push(0)
    histogram.push(row)
  }
  return {
    runSeed: seed >>> 0,
    phase: 'playing',
    round: 1,
    ballsLeft: BALLS_PER_ROUND,
    aimCol: Math.floor((DROP_COLS - 1) / 2),
    balls: [],
    score: 0,
    roundScore: 0,
    cooldown: 0,
    elapsed: 0,
    dropped: 0,
    completedRounds: 0,
    landings: [],
    histogram,
    events: [],
  }
}

/**
 * 在当前瞄准列投放一颗弹珠；受冷却与弹珠余量限制。
 * @param s - 游戏状态。
 * @returns 是否投放成功。
 */
export function dropBall(s: PlinkoState): boolean {
  return dropBallAt(s, s.aimCol)
}

/**
 * 在指定列投放一颗弹珠（子 seed 由 runSeed + 弹珠序号派生）。
 * @param s - 游戏状态。
 * @param col - 投放列（钳制到 [0, DROP_COLS)）。
 * @returns 是否投放成功（进行中、有余量、冷却结束）。
 */
export function dropBallAt(s: PlinkoState, col: number): boolean {
  if (s.phase !== 'playing' || s.ballsLeft <= 0 || s.cooldown > 0) return false
  const c = Math.max(0, Math.min(DROP_COLS - 1, col))
  const id = s.dropped
  s.dropped += 1
  s.ballsLeft -= 1
  s.cooldown = DROP_COOLDOWN
  const ball: PlinkoBall = {
    id,
    col: c,
    x: dropColX(c),
    y: DROP_Y,
    vx: 0,
    vy: 0,
    age: 0,
    rngState: ballSubSeed(s.runSeed, id),
    trail: [],
  }
  s.balls.push(ball)
  s.events.push({ kind: 'drop', id, col: c, x: ball.x })
  return true
}

/**
 * 移动瞄准列（钳制）。
 * @param s - 游戏状态。
 * @param dir - -1 左移 / +1 右移。
 */
export function moveAim(s: PlinkoState, dir: number): void {
  s.aimCol = Math.max(0, Math.min(DROP_COLS - 1, s.aimCol + dir))
}

/** 绕原点旋转速度向量 (vx, vy) 角度 ang（弧度）。 */
function rotate(vx: number, vy: number, ang: number): { vx: number, vy: number } {
  const c = Math.cos(ang)
  const si = Math.sin(ang)
  return { vx: vx * c - vy * si, vy: vx * si + vy * c }
}

/**
 * 推进一颗弹珠一个子步：重力积分、墙反弹、钉碰撞（反弹 + 子 seed 扰动）。
 * @param ball - 弹珠。
 * @param h - 子步长（秒）。
 * @returns 落槽序号（弹珠越过槽顶或超龄），未落定返回 null。
 */
export function stepBall(ball: PlinkoBall, h: number): number | null {
  ball.age += h
  ball.vy += GRAVITY * h
  ball.x += ball.vx * h
  ball.y += ball.vy * h
  // 墙反弹
  if (ball.x < WALL_L + BALL_R) {
    ball.x = WALL_L + BALL_R
    ball.vx = Math.abs(ball.vx) * WALL_DAMP
  } else if (ball.x > WALL_R - BALL_R) {
    ball.x = WALL_R - BALL_R
    ball.vx = -Math.abs(ball.vx) * WALL_DAMP
  }
  // 钉碰撞：法线反弹 + 确定性扰动（碰撞侧 × 速度 × 子 seed 伪随机）
  const rr = BALL_R + PEG_R
  for (const peg of PEGS) {
    const dy = ball.y - peg.y
    if (dy > rr || dy < -rr) continue
    const dx = ball.x - peg.x
    if (dx > rr || dx < -rr) continue
    const d2 = dx * dx + dy * dy
    if (d2 >= rr * rr) continue
    const d = Math.sqrt(d2)
    const nx = d < 0.0001 ? 0 : dx / d
    const ny = d < 0.0001 ? -1 : dy / d
    ball.x = peg.x + nx * rr
    ball.y = peg.y + ny * rr
    const dot = ball.vx * nx + ball.vy * ny
    if (dot < 0) {
      ball.vx -= (1 + RESTITUTION) * dot * nx
      ball.vy -= (1 + RESTITUTION) * dot * ny
      const draw = mulberryNext(ball.rngState)
      ball.rngState = draw.next
      const r = draw.value
      // 碰撞侧：法线 x 分量为 0（正顶）时由扰动流自身分边，保证对称必破
      const side = nx > 0 ? 1 : nx < 0 ? -1 : (r < 0.5 ? -1 : 1)
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
      const ang = (r - 0.5) * PERT_AMP * side * Math.min(1, speed / 300)
      const spun = rotate(ball.vx, ball.vy, ang)
      ball.vx = spun.vx * TANGENT_DAMP
      ball.vy = spun.vy * TANGENT_DAMP
      if (ball.vx * ball.vx + ball.vy * ball.vy < MIN_SPEED * MIN_SPEED) {
        ball.vy = Math.max(ball.vy, MIN_SPEED)
      }
    }
  }
  ball.trail.push({ x: ball.x, y: ball.y })
  if (ball.trail.length > TRAIL_MAX) ball.trail.shift()
  // 落槽：越过槽顶或超龄兜底
  if (ball.y + BALL_R >= SLOT_Y || ball.age >= MAX_AGE) {
    return slotIndexForX(ball.x)
  }
  return null
}

/**
 * 推进一帧（内部固定子步，确定性）：积分全部弹珠、落槽结算、轮次推进。
 * @param s - 游戏状态。
 * @param dt - 帧时长（秒，内部按 SUB 子步积分）。
 */
export function step(s: PlinkoState, dt: number): void {
  const clamped = Math.max(0, Math.min(0.05, dt))
  s.elapsed += clamped
  if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - clamped)
  const n = Math.max(1, Math.min(240, Math.ceil(clamped / SUB)))
  const h = clamped / n
  const settled: number[] = []
  for (let i = s.balls.length - 1; i >= 0; i -= 1) {
    const ball = s.balls[i]!
    let slot: number | null = null
    for (let k = 0; k < n && slot === null; k += 1) {
      slot = stepBall(ball, h)
    }
    if (slot !== null) {
      settled.push(i)
      const points = slotPoints(slot)
      const mult = SLOT_MULTIPLIERS[slot]!
      s.landings.push({ slot, points })
      s.histogram[ball.col]![slot]! += 1
      s.score += points
      s.roundScore += points
      s.events.push({
        kind: 'land', id: ball.id, col: ball.col, slot,
        mult, points, x: ball.x, y: ball.y,
      })
    }
  }
  for (const i of settled) s.balls.splice(i, 1)
  // 轮次推进：弹珠投尽且全部落定
  if (s.phase === 'playing' && s.ballsLeft <= 0 && s.balls.length === 0) {
    s.completedRounds += 1
    s.events.push({ kind: 'roundEnd', round: s.round, roundScore: s.roundScore })
    if (s.round >= ROUNDS) {
      s.phase = 'ended'
      s.events.push({ kind: 'ended', score: s.score })
    } else {
      s.round += 1
      s.ballsLeft = BALLS_PER_ROUND
      s.roundScore = 0
    }
  }
}

/**
 * 直方图预览是否已解锁（完成至少一轮后开放）。
 * @param s - 游戏状态。
 * @returns 是否解锁。
 */
export function previewUnlocked(s: PlinkoState): boolean {
  return s.completedRounds >= 1
}

/**
 * 某投放列的历史落槽分布。
 * @param s - 游戏状态。
 * @param col - 投放列。
 * @returns 各槽落槽次数（长度 SLOT_COUNT）。
 */
export function colDistribution(s: PlinkoState, col: number): number[] {
  return s.histogram[Math.max(0, Math.min(DROP_COLS - 1, col))]!
}
