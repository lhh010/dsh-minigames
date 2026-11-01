/**
 * 丢纸团（Paper Toss）纯逻辑：从屏幕左下把纸团抛进右侧纸篓。指针在纸团
 * 附近按下后拖拽（弹弓式：拖得越远力越大、方向为拖拽的反方向），松手抛出。
 * 飞行受恒定重力与每回合 seed 决定的侧向风力影响；纸篓水平位置（远近）
 * 与风力每回合变化。球心在下落中进入纸篓口矩形即命中：基础分随距离增长，
 * 连续命中按连击数倍乘；纸团落地或飞出边界记一次脱手，脱手 5 次一局结束。
 * 时间单位毫秒，物理单位 px / s，同 seed 同输入逐步模拟完全确定。
 */

/** 逻辑画布尺寸（横向场景）。 */
export const W = 560
export const H = 420
/** 地面 y（办公室地板线）。 */
export const FLOOR_Y = H - 34
/** 纸团半径。 */
export const BALL_R = 9
/** 抛出点（屏幕左下、地板之上）。 */
export const ORIGIN = { x: 64, y: FLOOR_Y - BALL_R - 2 }
/** 拖拽长度上限 px（超出按上限计力）。 */
export const MAX_DRAG = 150
/** 最小有效拖拽长度 px（低于视为取消）。 */
export const MIN_DRAG = 14
/** 满力初速 px/s。 */
export const MAX_SPEED = 640
/** 重力加速度 px/s^2。 */
export const GRAVITY = 780
/** 侧向风力加速度上限 px/s^2（有符号）。 */
export const WIND_MAX = 170
/** 纸篓口宽度 px。 */
export const BIN_W = 48
/** 纸篓高度 px（立于地板上）。 */
export const BIN_H = 58
/** 纸篓口判定容差 px。 */
export const MOUTH_TOL = 7
/** 脱手次数上限，达到即一局结束。 */
export const MAX_MISSES = 5
/** 连击倍率上限。 */
export const COMBO_CAP = 5
/** 命中/脱手后的展示停留 ms。 */
export const RESULT_MS = 950
/** 飘字存活时长 ms。 */
export const FLOAT_MS = 950

/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
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

/** 阶段：瞄准 / 飞行 / 回合结算展示 / 一局结束。 */
export type PaperTossPhase = 'aim' | 'flying' | 'result' | 'over'

/** 单步内产生、供渲染层消费的可视事件。 */
export type PaperTossEvent =
  | { type: 'hit', x: number, y: number, gained: number, combo: number }
  | { type: 'miss', x: number, y: number }

/** 上浮渐隐的飘字。 */
export interface FloatText {
  x: number
  y: number
  text: string
  life: number
}

/** 飞行中的纸团。 */
export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  /** 自转角 rad 与角速度 rad/s。 */
  rot: number
  vrot: number
}

/** 一局游戏的完整可测状态。 */
export interface PaperTossState {
  /** 回合内已流逝 ms（渲染闪烁用）。 */
  t: number
  seed: number
  score: number
  /** 连续命中数（脱手清零）。 */
  combo: number
  /** 已脱手次数。 */
  misses: number
  /** 本回合纸篓口左缘 x（篓口矩形 = [binX, binX+BIN_W] × mouthY 附近）。 */
  binX: number
  /** 侧向风加速度 px/s^2（正 = 向右吹）。 */
  wind: number
  phase: PaperTossPhase
  /** result 阶段剩余展示 ms。 */
  resultMs: number
  ball: Ball
  /** 是否正在拖拽瞄准。 */
  aiming: boolean
  /** 拖拽起点（按下处）。 */
  aimFrom: { x: number, y: number }
  /** 拖拽当前点。 */
  aimTo: { x: number, y: number }
  events: PaperTossEvent[]
  floats: FloatText[]
  rng: () => number
}

/**
 * 纸篓口 y（地板上方一个篓高处的水平线）。
 */
export function binMouthY(): number {
  return FLOOR_Y - BIN_H
}

/**
 * 本回合抛出点到纸篓口的水平距离（计分用）。
 * @param state - 当前状态。
 * @returns 水平距离 px。
 */
export function binDistance(state: PaperTossState): number {
  return Math.max(0, state.binX + BIN_W / 2 - ORIGIN.x)
}

/**
 * 拖拽向量 → 抛出初速（弹弓式：初速方向 = 起点指向反方向）。
 * 渲染层的瞄准预览轨迹使用同一函数，保证所见即所抛。
 * @param dx - 起点x - 当前点x（拖拽反向量 x 分量）。
 * @param dy - 起点y - 当前点y（拖拽反向量 y 分量）。
 * @returns 初速，拖拽过短返回 null（视为取消）。
 */
export function dragToVelocity(dx: number, dy: number): { vx: number, vy: number } | null {
  const len = Math.hypot(dx, dy)
  if (len < MIN_DRAG) return null
  const power = Math.min(len, MAX_DRAG) / MAX_DRAG
  const speed = power * MAX_SPEED
  return { vx: (dx / len) * speed, vy: (dy / len) * speed }
}

/**
 * 生成新一回合：纸篓远近与风向风力由 rng 决定，纸团回到抛出点。
 * @param state - 目标状态（就地更新）。
 */
function newRound(state: PaperTossState): void {
  const rng = state.rng
  const minBinX = W * 0.5
  const maxBinX = W - 56 - BIN_W
  state.binX = minBinX + rng() * (maxBinX - minBinX)
  // 风力大小与方向（符号）都随机。
  const sign = rng() < 0.5 ? -1 : 1
  state.wind = sign * rng() * WIND_MAX
  state.phase = 'aim'
  state.aiming = false
  state.ball = { x: ORIGIN.x, y: ORIGIN.y, vx: 0, vy: 0, rot: 0, vrot: 0 }
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态。
 */
export function createPaperToss(seed: number): PaperTossState {
  const state: PaperTossState = {
    t: 0,
    seed,
    score: 0,
    combo: 0,
    misses: 0,
    binX: 0,
    wind: 0,
    phase: 'aim',
    resultMs: 0,
    ball: { x: ORIGIN.x, y: ORIGIN.y, vx: 0, vy: 0, rot: 0, vrot: 0 },
    aiming: false,
    aimFrom: { x: 0, y: 0 },
    aimTo: { x: 0, y: 0 },
    events: [],
    floats: [],
    rng: mulberry32(Math.floor(seed) >>> 0),
  }
  newRound(state)
  return state
}

/**
 * 开始瞄准（在纸团附近按下时调用）。
 * @param state - 目标状态。
 * @param x - 按下处逻辑坐标 x。
 * @param y - 按下处逻辑坐标 y。
 */
export function beginAim(state: PaperTossState, x: number, y: number): void {
  if (state.phase !== 'aim') return
  state.aiming = true
  state.aimFrom = { x, y }
  state.aimTo = { x, y }
}

/**
 * 更新瞄准拖拽点（按住移动时调用）。
 * @param state - 目标状态。
 * @param x - 当前逻辑坐标 x。
 * @param y - 当前逻辑坐标 y。
 */
export function updateAim(state: PaperTossState, x: number, y: number): void {
  if (!state.aiming) return
  state.aimTo = { x, y }
}

/**
 * 松手抛出：按拖拽反向量计算初速（过短则取消不抛）。
 * @param state - 目标状态。
 * @returns true 表示已抛出。
 */
export function releaseAim(state: PaperTossState): boolean {
  if (!state.aiming || state.phase !== 'aim') {
    state.aiming = false
    return false
  }
  state.aiming = false
  const v = dragToVelocity(state.aimFrom.x - state.aimTo.x, state.aimFrom.y - state.aimTo.y)
  if (v === null) return false
  state.ball.vx = v.vx
  state.ball.vy = v.vy
  state.ball.vrot = v.vx >= 0 ? 7 : -7
  state.phase = 'flying'
  return true
}

/**
 * 回合结算（纯数据更新）：命中计分（距离基础分 × 连击倍率），脱手清连击。
 * @param state - 目标状态。
 * @param hit - 是否命中。
 */
function settleRound(state: PaperTossState, hit: boolean): void {
  const mouthY = binMouthY()
  if (hit) {
    state.combo = Math.min(COMBO_CAP, state.combo + 1)
    const base = 10 + Math.round(binDistance(state) / 30)
    const gained = base * state.combo
    state.score += gained
    const text = state.combo >= 2 ? '+' + gained + ' x' + state.combo : '+' + gained
    state.floats.push({ x: state.binX + BIN_W / 2, y: mouthY - 18, text, life: FLOAT_MS })
    state.events.push({ type: 'hit', x: state.binX + BIN_W / 2, y: mouthY, gained, combo: state.combo })
    state.phase = 'result'
    state.resultMs = RESULT_MS
    return
  }
  state.combo = 0
  state.misses += 1
  state.events.push({ type: 'miss', x: state.ball.x, y: state.ball.y })
  if (state.misses >= MAX_MISSES) {
    state.phase = 'over'
    state.resultMs = 0
  } else {
    state.phase = 'result'
    state.resultMs = RESULT_MS
  }
}

/**
 * 推进一帧：飞行物理（重力 + 侧风）、进篓判定（球心进篓口矩形且下落中）、
 * 落地/出界脱手、结算展示计时与下一回合切换、飘字。事件写入 state.events，
 * 调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepPaperToss(state: PaperTossState, dtMs: number): void {
  state.events.length = 0
  const dt = dtMs / 1000
  state.t += dtMs

  // 飘字上浮渐隐（所有阶段共用）。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 30 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }

  if (state.phase === 'over') return

  if (state.phase === 'result') {
    state.resultMs -= dtMs
    if (state.resultMs <= 0) newRound(state)
    return
  }

  if (state.phase !== 'flying') return

  const b = state.ball
  const prevY = b.y
  b.vy += GRAVITY * dt
  b.vx += state.wind * dt
  b.x += b.vx * dt
  b.y += b.vy * dt
  b.rot += b.vrot * dt

  // 进篓：球心在同一帧内自上而下穿过篓口平面（水平严格在口内）——
  // 侧向擦口、上抛穿带都不算，必须真正落进篓里。
  const mouthY = binMouthY()
  if (
    b.vy > 0
    && prevY <= mouthY
    && b.y > mouthY
    && b.x >= state.binX + 4
    && b.x <= state.binX + BIN_W - 4
  ) {
    settleRound(state, true)
    return
  }
  // 落地：纸团停在地板上记脱手。
  if (b.y + BALL_R >= FLOOR_Y) {
    b.y = FLOOR_Y - BALL_R
    settleRound(state, false)
    return
  }
  // 飞出左右边界或坠落画布之外记脱手。
  if (b.x < -40 || b.x > W + 40 || b.y > H + 60) {
    settleRound(state, false)
  }
}
