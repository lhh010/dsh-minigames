/**
 * 街头投篮（Hoop Shot）纯逻辑：从画面左下把篮球投向右上篮筐。指针在球
 * 附近按下后拖拽（弹弓式：拖得越远力越大、方向为拖拽的反方向），松手投出。
 * 飞行受恒定重力，碰篮板速度镜像衰减；球心自上而下穿过筐口区间判进球，
 * 全程未碰筐沿为空心球（基础分更高）；进球按连击数倍乘计分。篮筐的远近
 * 与高度由 seed + 回合推进的确定性随机数决定，每回合结算后移动。一局限时
 * 60 秒或投满 20 球结束。时间单位毫秒，物理单位 px / s，同 seed 同输入逐步
 * 模拟完全确定。
 */

/** 逻辑画布尺寸（横向场景）。 */
export const W = 640
export const H = 420
/** 地面 y（街头球场地面线）。 */
export const FLOOR_Y = H - 36
/** 篮球半径。 */
export const BALL_R = 11
/** 投篮出发点（画面左下、地面之上）。 */
export const ORIGIN = { x: 60, y: FLOOR_Y - BALL_R - 2 }
/** 拖拽长度上限 px（超出按上限计力）。 */
export const MAX_DRAG = 160
/** 最小有效拖拽长度 px（低于视为取消）。 */
export const MIN_DRAG = 14
/** 满力初速 px/s。 */
export const MAX_SPEED = 800
/** 重力加速度 px/s^2。 */
export const GRAVITY = 980
/** 筐口半宽 px（筐口 = rimX ± RIM_R 的水平区间，口沿高度 rimY）。 */
export const RIM_R = 26
/** 筐沿碰撞点半径 px（前后两个口沿端点各一个碰撞圆）。 */
export const RIM_PT_R = 4
/** 筐口到篮板的间隙 px。 */
export const BOARD_GAP = 8
/** 篮板厚度 px。 */
export const BOARD_T = 6
/** 篮板下沿低于筐口的 px。 */
export const BOARD_BELOW = 26
/** 篮板上沿高于筐口的 px。 */
export const BOARD_ABOVE = 66
/** 篮板反弹法向速度保留比例。 */
export const BOARD_DAMP = 0.55
/** 筐沿反弹法向速度保留比例。 */
export const RIM_DAMP = 0.55
/** 一局限时 ms。 */
export const GAME_MS = 60000
/** 一局最多投篮次数。 */
export const MAX_SHOTS = 20
/** 连击倍率上限。 */
export const COMBO_CAP = 5
/** 空心球基础分。 */
export const SWISH_BASE = 3
/** 普通进球基础分。 */
export const HIT_BASE = 2
/** 进球/脱手后的展示停留 ms。 */
export const RESULT_MS = 1100
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
export type HoopShotPhase = 'aim' | 'flying' | 'result' | 'over'

/** 单步内产生、供渲染层消费的可视事件。 */
export type HoopShotEvent =
  | { type: 'score', x: number, y: number, gained: number, swish: boolean, combo: number }
  | { type: 'miss', x: number, y: number }
  | { type: 'board', x: number, y: number }
  | { type: 'rim', x: number, y: number }

/** 上浮渐隐的飘字。 */
export interface FloatText {
  x: number
  y: number
  text: string
  life: number
}

/** 飞行中的篮球。 */
export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  /** 自转角 rad 与角速度 rad/s。 */
  rot: number
  vrot: number
}

/** 篮筐布置：筐心 (rimX, rimY) 决定筐口、篮板与篮架全部位置。 */
export interface Hoop {
  /** 筐口中心 x。 */
  rimX: number
  /** 筐口高度 y（口沿所在水平线）。 */
  rimY: number
}

/** 一局游戏的完整可测状态。 */
export interface HoopShotState {
  /** 回合内已流逝 ms（渲染闪烁用）。 */
  t: number
  seed: number
  score: number
  /** 连续进球数（脱手清零）。 */
  combo: number
  /** 已出手次数。 */
  shots: number
  /** 剩余时间 ms（只在非结束阶段倒数）。 */
  timeMs: number
  hoop: Hoop
  phase: HoopShotPhase
  /** result 阶段剩余展示 ms。 */
  resultMs: number
  ball: Ball
  /** 本投是否已碰筐沿（结算时判定空心）。 */
  rimTouched: boolean
  /** 是否正在拖拽瞄准。 */
  aiming: boolean
  /** 拖拽起点（按下处）。 */
  aimFrom: { x: number, y: number }
  /** 拖拽当前点。 */
  aimTo: { x: number, y: number }
  events: HoopShotEvent[]
  floats: FloatText[]
  rng: () => number
}

/**
 * 本回合篮筐几何：篮板面 x（球撞反弹的竖直面）与篮板上下沿 y。
 * @param hoop - 篮筐布置。
 * @returns 篮板面 x、上沿 y、下沿 y。
 */
export function boardOf(hoop: Hoop): { boardX: number, topY: number, bottomY: number } {
  return {
    boardX: hoop.rimX + RIM_R + BOARD_GAP,
    topY: hoop.rimY - BOARD_ABOVE,
    bottomY: hoop.rimY + BOARD_BELOW,
  }
}

/**
 * 本回合出手点到筐口的水平距离（计分用）。
 * @param hoop - 篮筐布置。
 * @returns 水平距离 px。
 */
export function hoopDistance(hoop: Hoop): number {
  return Math.max(0, hoop.rimX - ORIGIN.x)
}

/**
 * 拖拽向量 → 投篮初速（弹弓式：初速方向 = 起点指向反方向）。
 * 渲染层的瞄准预览轨迹使用同一函数，保证所见即所投。
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
 * 生成新一回合：筐口远近与高度由 rng 决定，篮球回到出手点。
 * @param state - 目标状态（就地更新）。
 */
function newRound(state: HoopShotState): void {
  const rng = state.rng
  const minX = W * 0.52
  const maxX = W - 80 - RIM_R
  const minY = 112
  const maxY = 262
  state.hoop = {
    rimX: minX + rng() * (maxX - minX),
    rimY: minY + rng() * (maxY - minY),
  }
  state.phase = 'aim'
  state.aiming = false
  state.rimTouched = false
  state.ball = { x: ORIGIN.x, y: ORIGIN.y, vx: 0, vy: 0, rot: 0, vrot: 0 }
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态。
 */
export function createHoopShot(seed: number): HoopShotState {
  const state: HoopShotState = {
    t: 0,
    seed,
    score: 0,
    combo: 0,
    shots: 0,
    timeMs: GAME_MS,
    hoop: { rimX: 0, rimY: 0 },
    phase: 'aim',
    resultMs: 0,
    ball: { x: ORIGIN.x, y: ORIGIN.y, vx: 0, vy: 0, rot: 0, vrot: 0 },
    rimTouched: false,
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
 * 开始瞄准（在篮球附近按下时调用）。
 * @param state - 目标状态。
 * @param x - 按下处逻辑坐标 x。
 * @param y - 按下处逻辑坐标 y。
 */
export function beginAim(state: HoopShotState, x: number, y: number): void {
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
export function updateAim(state: HoopShotState, x: number, y: number): void {
  if (!state.aiming) return
  state.aimTo = { x, y }
}

/**
 * 松手出手：按拖拽反向量计算初速（过短则取消不出手，不计投数）。
 * @param state - 目标状态。
 * @returns true 表示已出手。
 */
export function releaseAim(state: HoopShotState): boolean {
  if (!state.aiming || state.phase !== 'aim') {
    state.aiming = false
    return false
  }
  state.aiming = false
  const v = dragToVelocity(state.aimFrom.x - state.aimTo.x, state.aimFrom.y - state.aimTo.y)
  if (v === null) return false
  state.ball.vx = v.vx
  state.ball.vy = v.vy
  state.ball.vrot = v.vx >= 0 ? 9 : -9
  state.rimTouched = false
  state.shots += 1
  state.phase = 'flying'
  return true
}

/**
 * 回合结算（纯数据更新）：进球计分（基础分 + 距离分，按连击倍乘；空心球
 * 基础分更高并附浮字），脱手清连击。投满次数即一局结束。
 * @param state - 目标状态。
 * @param hit - 是否进球。
 */
function settleRound(state: HoopShotState, hit: boolean): void {
  if (hit) {
    const swish = !state.rimTouched
    state.combo = Math.min(COMBO_CAP, state.combo + 1)
    const base = swish ? SWISH_BASE : HIT_BASE
    const distBonus = Math.round(hoopDistance(state.hoop) / 90)
    const gained = (base + distBonus) * state.combo
    state.score += gained
    const cx = state.hoop.rimX
    const mouthY = state.hoop.rimY
    if (swish) {
      state.floats.push({ x: cx, y: mouthY - 40, text: 'Swish!', life: FLOAT_MS })
    }
    const text = state.combo >= 2 ? '+' + gained + ' x' + state.combo : '+' + gained
    state.floats.push({ x: cx, y: mouthY - 18, text, life: FLOAT_MS })
    state.events.push({ type: 'score', x: cx, y: mouthY, gained, swish, combo: state.combo })
  } else {
    state.combo = 0
    state.events.push({ type: 'miss', x: state.ball.x, y: state.ball.y })
  }
  if (state.shots >= MAX_SHOTS) {
    state.phase = 'over'
    state.resultMs = 0
  } else {
    state.phase = 'result'
    state.resultMs = RESULT_MS
  }
}

/**
 * 筐沿碰撞：前后两个口沿端点各视为一个碰撞圆，重叠时沿法向推出并镜像
 * 衰减速度；碰到即标记 rimTouched（取消本投空心资格）。
 * @param state - 目标状态。
 */
function collideRim(state: HoopShotState): void {
  const b = state.ball
  const rimY = state.hoop.rimY
  const pts = [state.hoop.rimX - RIM_R, state.hoop.rimX + RIM_R]
  for (const px of pts) {
    const dx = b.x - px
    const dy = b.y - rimY
    const d = Math.hypot(dx, dy)
    const minD = BALL_R + RIM_PT_R
    if (d >= minD || d === 0) continue
    const nx = dx / d
    const ny = dy / d
    b.x = px + nx * minD
    b.y = rimY + ny * minD
    const vn = b.vx * nx + b.vy * ny
    if (vn < 0) {
      b.vx -= (1 + RIM_DAMP) * vn * nx
      b.vy -= (1 + RIM_DAMP) * vn * ny
      b.vx *= 0.92
      b.vy *= 0.92
    }
    if (!state.rimTouched) {
      state.rimTouched = true
      state.events.push({ type: 'rim', x: px, y: rimY })
    }
  }
}

/**
 * 篮板碰撞：向右运动的球撞上篮板面（竖直窄矩形）时位置回退、水平速度
 * 镜像衰减（篮板反弹不算筐沿接触，不取消空心）。
 * @param state - 目标状态。
 */
function collideBoard(state: HoopShotState): void {
  const b = state.ball
  const { boardX, topY, bottomY } = boardOf(state.hoop)
  if (
    b.vx > 0
    && b.x + BALL_R >= boardX
    && b.x - BALL_R <= boardX + BOARD_T
    && b.y >= topY - BALL_R
    && b.y <= bottomY + BALL_R
  ) {
    b.x = boardX - BALL_R
    b.vx = -b.vx * BOARD_DAMP
    b.vy *= 0.92
    state.events.push({ type: 'board', x: boardX, y: b.y })
  }
}

/**
 * 推进一帧：飞行物理（重力、篮板镜像衰减、筐沿碰撞）、进球判定（球心自上
 * 而下穿过筐口区间）、落地/出界脱手、限时倒数、结算展示计时与下一回合
 * 切换、飘字。事件写入 state.events，调用方每帧消费后由本函数在下一帧
 * 开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepHoopShot(state: HoopShotState, dtMs: number): void {
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

  // 限时倒数（瞄准、飞行、展示都计时）。
  state.timeMs -= dtMs
  if (state.timeMs <= 0) {
    state.timeMs = 0
    state.combo = 0
    state.phase = 'over'
    return
  }

  if (state.phase === 'result') {
    state.resultMs -= dtMs
    if (state.resultMs <= 0) newRound(state)
    return
  }

  if (state.phase !== 'flying') return

  const b = state.ball
  const prevY = b.y
  b.vy += GRAVITY * dt
  b.x += b.vx * dt
  b.y += b.vy * dt
  b.rot += b.vrot * dt

  collideBoard(state)
  collideRim(state)

  // 进球：下落中球心自上而下穿过筐口区间（水平落在筐口内）。
  if (
    b.vy > 0
    && prevY <= state.hoop.rimY
    && b.y > state.hoop.rimY
    && Math.abs(b.x - state.hoop.rimX) <= RIM_R - 4
  ) {
    settleRound(state, true)
    return
  }
  // 落地：球停在地面记脱手。
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
