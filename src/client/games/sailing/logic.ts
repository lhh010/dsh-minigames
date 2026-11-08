/**
 * 帆船远航（Sailing）纯逻辑：俯视海面，风矢量恒定方向与强度（随关卡
 * 变化，叠加由 seed 决定相位的确定性阵风扰动），玩家掌舵（转向）与调
 * 帆角（相对船身）。帆动力 = 风矢量在帆法向的投影再取船头方向分量：
 * 迎风死角区无动力、侧风约为一半、顺风满帆最快——真实帆船"抢风 /
 * 顺风"语义的简化。水阻力按一阶衰减趋近终端速度。按固定 8ms 子步推
 * 进（帧间隔累计器切分），全部函数确定性可测；时间单位毫秒，物理
 * 单位 px、px/s、px/s²。
 */

/** 逻辑画布尺寸。 */
export const W = 640
export const H = 480

/** 固定物理子步 ms（stepSailing 内部按它切分帧间隔）。 */
export const FIXED_MS = 8
/** 掌舵角速度 rad/s。 */
export const RUDDER_SPEED = 1.9
/** 帆角调整速度 rad/s。 */
export const SAIL_SPEED = 1.4
/** 帆角上限（相对船身，两侧对称）。 */
export const SAIL_MAX = 1.309
/** 迎风死角区半角 rad：风从船头 ±40° 内来时帆抖动无动力。 */
export const DEAD_ZONE = 40 * Math.PI / 180
/** 水阻力时间常数 s：v' = 动力 - v / DRAG_TAU。 */
export const DRAG_TAU = 1.6
/** 转向时的速度损失系数（每秒 35% 衰减按转向占比折算）。 */
export const TURN_BLEED = 0.35
/** 浮标通过判定半径 px。 */
export const BUOY_R = 26
/** 漏标判定余量 px：沿赛段方向越过下一浮标超过该距离仍未过圈判负。 */
export const MISS_MARGIN = 34
/** 每关时限 s：90 - (关卡-1) * 5，下限 50。 */
export const TIME_BASE = 90
export const TIME_MIN = 50
/** 过关展示 ms（之后进入下一关）。 */
export const FINISH_MS = 1800
/** 航迹拖尾最大采样点数。 */
export const TRAIL_MAX = 48

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

/** 角度归一到 [-π, π]。 */
export function normAngle(a: number): number {
  let r = a
  while (r > Math.PI) r -= Math.PI * 2
  while (r < -Math.PI) r += Math.PI * 2
  return r
}

/**
 * 确定性阵风系数：两个由 seed 决定相位的正弦叠加，恒在 [0.8, 1.2]。
 * @param seed - 外部种子。
 * @param tMs - 关卡内已流逝 ms。
 * @returns 当前有效风力 = 基础风力 × 系数。
 */
export function gustFactor(seed: number, tMs: number): number {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const p1 = rng() * Math.PI * 2
  const p2 = rng() * Math.PI * 2
  return 1 + 0.12 * Math.sin(tMs / 1900 + p1) + 0.08 * Math.sin(tMs / 700 + p2)
}

/** 一关的风：travel 为风吹向的方向角，speed px/s²（同时是加速度上限）。 */
export interface Wind {
  travel: number
  speed: number
}

/**
 * 某一关的风（seed+level 确定性）：方向随机、强度随关卡增大封顶 160。
 * @param seed - 外部种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 本关风参数。
 */
export function windOf(seed: number, level: number): Wind {
  const rng = mulberry32((Math.floor(seed) * 173 + level * 31) >>> 0)
  return { travel: rng() * Math.PI * 2, speed: Math.min(160, 60 + level * 15) }
}

/**
 * 帆动力（沿船头方向的加速度 px/s²）：风矢量在帆法向的投影，再取
 * 船头方向分量 = -风力 × sin(帆角) × sin(相对风行角 - 帆角)。
 * 迎风死角区（风从船头 ±DEAD_ZONE 内来）帆抖动，返回 0；帆角在
 * 顶风侧为负推力（倒拖）。
 * @param relWind - 风行方向相对船头的角（0 = 风吹向船头即顺风，π = 顶风）。
 * @param sail - 帆角相对船身 rad（正 = 右舷侧）。
 * @param windSpeed - 当前有效风力 px/s²。
 * @returns 沿船头方向的加速度，可正可负。
 */
export function sailPower(relWind: number, sail: number, windSpeed: number): number {
  const r = normAngle(relWind)
  // 死角区：|r| 接近 π（风近似迎面）时无动力。
  if (Math.abs(Math.PI - Math.abs(r)) <= DEAD_ZONE) return 0
  return -windSpeed * Math.sin(sail) * Math.sin(r - sail)
}

/** 当前相对风角下的最优帆角（解析解 s = r/2 + π/4，夹到 ±SAIL_MAX）。
 * 死角区返回 0（无意义，提示层改示"转向"）。渲染层以此画推荐帆位。 */
export function optimalSail(relWind: number): number {
  const r = normAngle(relWind)
  if (Math.abs(Math.PI - Math.abs(r)) <= DEAD_ZONE) return 0
  return Math.max(-SAIL_MAX, Math.min(SAIL_MAX, r / 2 + Math.PI / 4))
}

/** 当前帆动力占该风角最大动力的比例 0~1（提示层的"调帆质量"读数）。 */
export function powerRatio(relWind: number, sail: number): number {
  const r = normAngle(relWind)
  if (Math.abs(Math.PI - Math.abs(r)) <= DEAD_ZONE) return 0
  const cur = -Math.sin(sail) * Math.sin(r - sail)
  const best = sailPower(r, optimalSail(r), 1)
  if (best <= 0) return 0
  return Math.max(0, Math.min(1, cur / best))
}

/** 一个浮标：圆心与通过判定半径。 */
export interface Buoy {
  x: number
  y: number
}

/**
 * 生成某一关的浮标航线（seed+level 确定性）：3~5 个浮标，每个距前一
 * 目标 240~340px，全部收缩在安全边距内。
 * @param seed - 外部种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 浮标坐标数组（按通过顺序）。
 */
export function generateCourse(seed: number, level: number): Buoy[] {
  const rng = mulberry32((Math.floor(seed) * 131 + level * 977) >>> 0)
  const count = Math.min(5, 3 + Math.floor((level - 1) / 2))
  const buoys: Buoy[] = []
  const margin = 80
  let from = { x: W / 2, y: H - 60 }
  for (let i = 0; i < count; i += 1) {
    let placed = false
    for (let attempt = 0; attempt < 32 && !placed; attempt += 1) {
      const ang = rng() * Math.PI * 2
      const dist = 240 + rng() * 100
      const x = from.x + Math.cos(ang) * dist
      const y = from.y + Math.sin(ang) * dist
      if (x >= margin && x <= W - margin && y >= margin && y <= H - margin
        && !(i === 0 && y > H - 140)) {
        buoys.push({ x, y })
        placed = true
      }
    }
    if (!placed) {
      // 兜底：沿画布对角线均匀铺开，保证航线总是可完成。
      const k = (i + 1) / (count + 1)
      buoys.push({ x: 100 + (W - 200) * k, y: H - 100 - (H - 200) * k })
    }
    from = buoys[i]!
  }
  return buoys
}

/** 某关时限 ms。 */
export function timeLimitOf(level: number): number {
  return Math.max(TIME_MIN, TIME_BASE - (level - 1) * 5) * 1000
}

/** 帧输入：左 / 右舵与帆角增 / 减。 */
export interface SailingInput {
  left: boolean
  right: boolean
  /** 帆角增大（向外张）。 */
  sailOut: boolean
  /** 帆角减小（向内收）。 */
  sailIn: boolean
}

/** 阶段：航行 / 过关展示 / 结束。 */
export type SailingPhase = 'racing' | 'finished' | 'gameover'

/** 失败原因（gameover 阶段）。 */
export type FailReason = 'miss' | 'timeout'

/** 单步内产生、供渲染层消费的可视事件。 */
export type SailingEvent =
  | { type: 'buoy', x: number, y: number, index: number }
  | { type: 'finish', x: number, y: number, points: number }
  | { type: 'fail', x: number, y: number, reason: FailReason }

/** 上浮渐隐的飘字。 */
export interface FloatText {
  x: number
  y: number
  text: string
  life: number
}

/** 飘字存活时长 ms。 */
export const FLOAT_MS = 1200

/** 一局游戏的完整可测状态。 */
export interface SailingState {
  /** 关卡内已流逝 ms（计时与阵风相位用）。 */
  t: number
  seed: number
  level: number
  score: number
  /** 船位置 / 航向（0 = 正右，-π/2 = 向上）/ 标量速度。 */
  x: number
  y: number
  heading: number
  v: number
  /** 帆角相对船身 rad。 */
  sail: number
  wind: Wind
  buoys: Buoy[]
  /** 下一个待通过的浮标下标（= buoys.length 表示全部通过）。 */
  next: number
  /** 帧间隔累计器（切固定子步）。 */
  acc: number
  phase: SailingPhase
  /** 阶段停留剩余 ms（finished 展示用）。 */
  phaseMs: number
  /** 过关展示分（HUD 用）。 */
  lastPoints: number
  /** 失败原因（gameover 用）。 */
  reason: FailReason | null
  events: SailingEvent[]
  floats: FloatText[]
  /** 航迹拖尾采样点（越靠后越新）。 */
  trail: { x: number, y: number }[]
}

/**
 * 重置船到出发位并生成本关风与航线（新关或重开时调用）。
 * @param state - 目标状态。
 */
function resetRound(state: SailingState): void {
  state.t = 0
  state.x = W / 2
  state.y = H - 60
  state.heading = -Math.PI / 2
  state.v = 0
  state.sail = 0
  state.wind = windOf(state.seed, state.level)
  state.buoys = generateCourse(state.seed, state.level)
  state.next = 0
  state.acc = 0
  state.phase = 'racing'
  state.phaseMs = 0
  state.lastPoints = 0
  state.reason = null
  state.trail.length = 0
}

/**
 * 新开一局（level 1）。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export function createSailing(seed: number): SailingState {
  const state: SailingState = {
    t: 0,
    seed,
    level: 1,
    score: 0,
    x: W / 2,
    y: H - 60,
    heading: -Math.PI / 2,
    v: 0,
    sail: 0,
    wind: windOf(seed, 1),
    buoys: generateCourse(seed, 1),
    next: 0,
    acc: 0,
    phase: 'racing',
    phaseMs: 0,
    lastPoints: 0,
    reason: null,
    events: [],
    floats: [],
    trail: [],
  }
  return state
}

/**
 * 当前剩余时间 ms（HUD 用）。
 * @param state - 当前状态。
 * @returns 剩余毫秒，最低 0。
 */
export function timeLeft(state: SailingState): number {
  return Math.max(0, timeLimitOf(state.level) - state.t)
}

/**
 * 下一浮标所在赛段方向（起点 → 下一浮标单位向量）；无下一浮标返回 null。
 * @param state - 当前状态。
 * @returns 赛段方向单位向量。
 */
function legDir(state: SailingState): { x: number, y: number } | null {
  if (state.next >= state.buoys.length) return null
  const target = state.buoys[state.next]!
  const from = state.next === 0
    ? { x: W / 2, y: H - 60 }
    : state.buoys[state.next - 1]!
  const dx = target.x - from.x
  const dy = target.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { x: 0, y: -1 }
  return { x: dx / len, y: dy / len }
}

/**
 * 推进一个 8ms 固定子步：掌舵与帆角积分、帆动力与水阻力、越界软
 * 反弹、浮标顺序通过判定、漏标与超时判负、过关结算。
 * @param state - 目标状态。
 */
function substep(state: SailingState, input: SailingInput): void {
  const h = FIXED_MS / 1000
  state.t += FIXED_MS

  let turning = false
  if (input.left) { state.heading -= RUDDER_SPEED * h; turning = true }
  if (input.right) { state.heading += RUDDER_SPEED * h; turning = true }
  if (input.sailOut) state.sail = Math.min(SAIL_MAX, state.sail + SAIL_SPEED * h)
  if (input.sailIn) state.sail = Math.max(-SAIL_MAX, state.sail - SAIL_SPEED * h)

  // 有效风力 = 关卡风力 × 确定性阵风系数；帆动力沿船头，水阻力一阶衰减。
  const wind = state.wind.speed * gustFactor(state.seed, state.t)
  const power = sailPower(state.wind.travel - state.heading, state.sail, wind)
  state.v += (power - state.v / DRAG_TAU) * h
  if (state.v < 0) state.v = 0
  if (turning) state.v *= Math.max(0, 1 - TURN_BLEED * h * 4)

  state.x += Math.cos(state.heading) * state.v * h
  state.y += Math.sin(state.heading) * state.v * h

  // 越界软反弹（贴边掉头损耗少量速度）。
  if (state.x < 24) { state.x = 24; state.v *= 0.4; state.heading = 0 }
  else if (state.x > W - 24) { state.x = W - 24; state.v *= 0.4; state.heading = Math.PI }
  if (state.y < 24) { state.y = 24; state.v *= 0.4; state.heading = Math.PI / 2 }
  else if (state.y > H - 24) { state.y = H - 24; state.v *= 0.4; state.heading = -Math.PI / 2 }

  // 航迹拖尾。
  state.trail.push({ x: state.x, y: state.y })
  if (state.trail.length > TRAIL_MAX) state.trail.shift()

  // 浮标通过判定（圆 + 顺序）：先判通过，再判漏标。
  if (state.next < state.buoys.length) {
    const buoy = state.buoys[state.next]!
    if (Math.hypot(state.x - buoy.x, state.y - buoy.y) <= BUOY_R) {
      const pts = 100 * state.level
      state.score += pts
      state.floats.push({ x: buoy.x, y: buoy.y - 26, text: '浮标 +' + pts, life: FLOAT_MS })
      state.events.push({ type: 'buoy', x: buoy.x, y: buoy.y, index: state.next })
      state.next += 1
      if (state.next >= state.buoys.length) {
        const bonus = Math.round(timeLeft(state) / 10) + 200
        state.score += bonus
        state.lastPoints = bonus
        state.phase = 'finished'
        state.phaseMs = FINISH_MS
        state.events.push({ type: 'finish', x: buoy.x, y: buoy.y, points: bonus })
        return
      }
    } else {
      // 漏标：沿赛段方向越过浮标超过 MISS_MARGIN 仍未进圈。
      const dir = legDir(state)
      if (dir !== null) {
        const along = (state.x - buoy.x) * dir.x + (state.y - buoy.y) * dir.y
        if (along > MISS_MARGIN) {
          state.phase = 'gameover'
          state.reason = 'miss'
          state.events.push({ type: 'fail', x: state.x, y: state.y, reason: 'miss' })
          return
        }
      }
    }
  }

  // 超时判负。
  if (state.t >= timeLimitOf(state.level)) {
    state.phase = 'gameover'
    state.reason = 'timeout'
    state.events.push({ type: 'fail', x: state.x, y: state.y, reason: 'timeout' })
  }
}

/**
 * 推进一帧：把 dtMs 计入累计器并按固定 FIXED_MS 子步确定性推进（累计
 * 器上限 200ms 防螺旋）。结束 / 展示阶段推进停留计时与飘字。事件写入
 * state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export function stepSailing(state: SailingState, dtMs: number, input: SailingInput): void {
  state.events.length = 0
  const dt = dtMs / 1000

  // 飘字上浮渐隐（所有阶段共用）。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 26 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }

  // 阶段停留：过关 → 下一关；gameover 停留等 R。
  if (state.phase !== 'racing') {
    if (state.phase === 'finished') {
      state.phaseMs -= dtMs
      if (state.phaseMs <= 0) {
        state.level += 1
        resetRound(state)
      }
    }
    return
  }

  state.acc = Math.min(200, state.acc + dtMs)
  while (state.acc >= FIXED_MS && state.phase === 'racing') {
    state.acc -= FIXED_MS
    substep(state, input)
  }
}
