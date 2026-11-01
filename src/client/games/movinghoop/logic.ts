/**
 * 移动篮筐（Moving Hoop）纯逻辑：从画面左下把篮球投向右上篮筐，没有防守
 * 障碍，但篮筐本身会运动。指针在球附近按下后拖拽（弹弓式：拖得越远力越
 * 大、方向为拖拽的反方向），松手投出。飞行受恒定重力，碰篮板速度镜像衰
 * 减；球心自上而下穿过筐口区间判进球（用当帧口沿位置判定），全程未碰筐
 * 沿为空心球（基础分更高）；进球按连击数倍乘计分。篮筐运动模式随投数升
 * 级：前 4 投静止热身；5-9 投上下浮沉；10-14 投左右巡逻；15 投起复合
 * 8 字轨迹且更快。一局限时 60 秒或投满 20 球结束。时间单位毫秒，物理单
 * 位 px / s，同 seed 同输入逐步模拟完全确定。
 */

/** 逻辑画布尺寸（横向场景）。 */
export const W = 640
export const H = 420
/** 地面 y（黄昏球场地面线）。 */
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
export const MAX_SPEED = 1150
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

/** 浮沉模式竖向振幅 px。 */
export const BOB_AMP = 42
/** 浮沉模式角速度 rad/s。 */
export const BOB_OMEGA = 1.6
/** 巡逻模式横向振幅 px。 */
export const PATROL_AMP = 60
/** 巡逻模式角速度 rad/s。 */
export const PATROL_OMEGA = 1.3
/** 复合模式横向振幅 px。 */
export const COMPLEX_AMP_X = 52
/** 复合模式竖向振幅 px。 */
export const COMPLEX_AMP_Y = 34
/** 复合模式角速度 rad/s（8 字轨迹，比前两档更快）。 */
export const COMPLEX_OMEGA = 2.4

/** 模式升级阈值：前 STATIC_SHOTS 投静止，之后每 PATROL_STEP 投换档，COMPLEX_FROM_SHOTS 投起复合。 */
export const STATIC_SHOTS = 4
export const BOB_FROM_SHOTS = 4
export const PATROL_FROM_SHOTS = 9
export const COMPLEX_FROM_SHOTS = 14

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

/** 篮筐运动模式：静止 / 上下浮沉 / 左右巡逻 / 复合 8 字。 */
export type HoopMotion = 'static' | 'bob' | 'patrol' | 'complex'

/** 阶段：瞄准 / 飞行 / 回合结算展示 / 一局结束。 */
export type MovingHoopPhase = 'aim' | 'flying' | 'result' | 'over'

/** 单步内产生、供渲染层消费的可视事件。 */
export type MovingHoopEvent =
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

/** 运动篮筐：基准位 (baseX, baseY) + 模式参数，瞬时位由 hoopAt 按时间求出。 */
export interface MovingHoop {
  /** 运动模式。 */
  mode: HoopMotion
  /** 筐口基准中心 x。 */
  baseX: number
  /** 筐口基准高度 y。 */
  baseY: number
  /** 横向振幅 px（静止/浮沉为 0）。 */
  ampX: number
  /** 竖向振幅 px（静止/巡逻为 0）。 */
  ampY: number
  /** 角速度 rad/s。 */
  omega: number
  /** 当前帧筐口中心 x（每帧更新）。 */
  rimX: number
  /** 当前帧筐口高度 y（每帧更新）。 */
  rimY: number
}

/**
 * 按已出手次数决定篮筐运动模式。
 * @param shots - 已出手次数。
 * @returns 运动模式。
 */
export function motionForShots(shots: number): HoopMotion {
  if (shots < BOB_FROM_SHOTS) return 'static'
  if (shots < PATROL_FROM_SHOTS) return 'bob'
  if (shots < COMPLEX_FROM_SHOTS) return 'patrol'
  return 'complex'
}

/**
 * 篮筐在时刻 tMs 的瞬时筐口位置（纯函数，与帧节奏无关）：
 * 静止 = 基准位；浮沉 = 竖向正弦；巡逻 = 横向正弦；复合 = x 主频、
 * y 倍频的 8 字轨迹。
 * @param hoop - 篮筐布置。
 * @param tMs - 一局开始以来的时刻 ms。
 * @returns 筐口中心 x 与口沿高度 y。
 */
export function hoopAt(hoop: MovingHoop, tMs: number): { rimX: number, rimY: number } {
  const t = tMs / 1000
  if (hoop.mode === 'static') return { rimX: hoop.baseX, rimY: hoop.baseY }
  if (hoop.mode === 'bob') {
    return { rimX: hoop.baseX, rimY: hoop.baseY + Math.sin(t * hoop.omega) * hoop.ampY }
  }
  if (hoop.mode === 'patrol') {
    return { rimX: hoop.baseX + Math.sin(t * hoop.omega) * hoop.ampX, rimY: hoop.baseY }
  }
  // complex：x 主频、y 倍频 —— 横 8 字。
  return {
    rimX: hoop.baseX + Math.sin(t * hoop.omega) * hoop.ampX,
    rimY: hoop.baseY + Math.sin(t * hoop.omega * 2) * hoop.ampY,
  }
}

/**
 * 本帧篮筐几何：篮板面 x（球撞反弹的竖直面）与篮板上下沿 y，跟随筐口
 * 当前瞬时位置。
 * @param rimX - 当前筐口中心 x。
 * @param rimY - 当前筐口高度 y。
 * @returns 篮板面 x、上沿 y、下沿 y。
 */
export function boardOf(rimX: number, rimY: number): { boardX: number, topY: number, bottomY: number } {
  return {
    boardX: rimX + RIM_R + BOARD_GAP,
    topY: rimY - BOARD_ABOVE,
    bottomY: rimY + BOARD_BELOW,
  }
}

/**
 * 本回合出手点到筐口基准位的水平距离（计分用）。
 * @param hoop - 篮筐布置。
 * @returns 水平距离 px。
 */
export function hoopDistance(hoop: MovingHoop): number {
  return Math.max(0, hoop.baseX - ORIGIN.x)
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

/** 一局游戏的完整可测状态。 */
export interface MovingHoopState {
  /** 一局开始以来已流逝 ms（篮筐运动与闪烁的时钟）。 */
  t: number
  seed: number
  score: number
  /** 连续进球数（脱手清零）。 */
  combo: number
  /** 已出手次数。 */
  shots: number
  /** 剩余时间 ms（只在非结束阶段倒数）。 */
  timeMs: number
  hoop: MovingHoop
  phase: MovingHoopPhase
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
  events: MovingHoopEvent[]
  floats: FloatText[]
  rng: () => number
}

/**
 * 按运动模式生成一个篮筐：基准位由 rand 决定并留出振幅余量，保证整个
 * 行程都落在可达的弹道窗口内。
 * @param mode - 运动模式。
 * @param rand - [0,1) 随机源。
 * @returns 初始停在 t=0 位置的篮筐。
 */
export function createHoopForMode(mode: HoopMotion, rand: () => number): MovingHoop {
  const minX = W * 0.52
  const maxX = W - 80 - RIM_R
  // 筐高下限 150 + 振幅：所有布位在最大力度最优弧线下都可进。
  const minY = 150
  const maxY = 262
  let ampX = 0
  let ampY = 0
  let omega = 0
  if (mode === 'bob') {
    ampY = BOB_AMP
    omega = BOB_OMEGA
  } else if (mode === 'patrol') {
    ampX = PATROL_AMP
    omega = PATROL_OMEGA
  } else if (mode === 'complex') {
    ampX = COMPLEX_AMP_X
    ampY = COMPLEX_AMP_Y
    omega = COMPLEX_OMEGA
  }
  const baseX = minX + ampX + rand() * (maxX - minX - ampX * 2)
  const baseY = minY + ampY + rand() * (maxY - minY - ampY * 2)
  return { mode, baseX, baseY, ampX, ampY, omega, rimX: baseX, rimY: baseY }
}

/**
 * 生成新一回合：按已投数选运动模式并随机基准位，篮球回到出手点。
 * @param state - 目标状态（就地更新）。
 */
function newRound(state: MovingHoopState): void {
  state.hoop = createHoopForMode(motionForShots(state.shots), state.rng)
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
export function createMovingHoop(seed: number): MovingHoopState {
  const state: MovingHoopState = {
    t: 0,
    seed,
    score: 0,
    combo: 0,
    shots: 0,
    timeMs: GAME_MS,
    hoop: { mode: 'static', baseX: 0, baseY: 0, ampX: 0, ampY: 0, omega: 0, rimX: 0, rimY: 0 },
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
export function beginAim(state: MovingHoopState, x: number, y: number): void {
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
export function updateAim(state: MovingHoopState, x: number, y: number): void {
  if (!state.aiming) return
  state.aimTo = { x, y }
}

/**
 * 松手出手：按拖拽反向量计算初速（过短则取消不出手，不计投数）。
 * @param state - 目标状态。
 * @returns true 表示已出手。
 */
export function releaseAim(state: MovingHoopState): boolean {
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
function settleRound(state: MovingHoopState, hit: boolean): void {
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
 * 筐沿碰撞：前后两个口沿端点各视为一个碰撞圆（跟随筐口当前瞬时位置），
 * 重叠时沿法向推出并镜像衰减速度；碰到即标记 rimTouched（取消本投空心
 * 资格）。
 * @param state - 目标状态。
 */
function collideRim(state: MovingHoopState): void {
  const b = state.ball
  const rimX = state.hoop.rimX
  const rimY = state.hoop.rimY
  const pts = [rimX - RIM_R, rimX + RIM_R]
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
 * 篮板碰撞：向右运动的球撞上篮板面（跟随筐口的竖直窄矩形）时位置回退、
 * 水平速度镜像衰减（篮板反弹不算筐沿接触，不取消空心）。
 * @param state - 目标状态。
 */
function collideBoard(state: MovingHoopState): void {
  const b = state.ball
  const { boardX, topY, bottomY } = boardOf(state.hoop.rimX, state.hoop.rimY)
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
 * 推进一帧：先把篮筐推进到本帧瞬时位置（瞄准阶段也运动，玩家可以读节
 * 奏），然后做飞行物理（重力、篮板镜像衰减、筐沿碰撞）、进球判定（球心
 * 自上而下穿过当帧筐口区间）、落地/出界脱手、限时倒数、结算展示计时与
 * 下一回合切换、飘字。事件写入 state.events，调用方每帧消费后由本函数
 * 在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepMovingHoop(state: MovingHoopState, dtMs: number): void {
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

  // 篮筐运动：位置只依赖 t，与帧节奏无关（同 seed 同输入确定）。
  const pos = hoopAt(state.hoop, state.t)
  state.hoop.rimX = pos.rimX
  state.hoop.rimY = pos.rimY

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

  // 进球：下落中球心自上而下穿过当帧筐口区间（水平落在筐口内）。
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
