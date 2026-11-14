/**
 * 套圈达人（Ring Toss）纯逻辑：侧视嘉年华摊位，玩家在左侧手持圆环，
 * 按住蓄力（力度决定水平初速，竖直初速固定），松开抛出。环飞行受重力
 * （第 2 轮起叠加风力水平加速度）；环心自上而下穿过柱顶水平线且水平
 * 距离在容差内判套中，擦到柱身则弹开落地不中。柱按远近排布：近柱 5 分、
 * 中柱 10 分、金柱 25 分，连续套中按连击数倍乘计分。每轮 5 环、共 3 轮，
 * 柱布局由 seed 驱动的确定性随机数生成。时间单位毫秒，物理单位 px/s，
 * 同 seed 同输入逐步模拟完全确定。
 */

/** 逻辑画布尺寸（横向场景）。 */
export const W = 640
export const H = 420
/** 摊位地面 y。 */
export const FLOOR_Y = H - 42
/** 抛环出手点（画面左侧、地面上方）。 */
export const HAND = { x: 74, y: FLOOR_Y - 96 }
/** 圆环内半径 px（碰撞按环心计）。 */
export const RING_R = 15
/** 套中判定容差 px（环心与柱顶 x 距离）。 */
export const HIT_TOL = 10
/** 柱顶碰撞半径 px（擦柱弹开的判定宽度）。 */
export const PEG_TOP_R = 6
/** 柱身半径 px。 */
export const SHAFT_R = 4
/** 重力加速度 px/s^2。 */
export const GRAVITY = 900
/** 出手竖直初速 px/s（固定向上）。 */
export const LAUNCH_VY = -540
/** 最小水平初速 px/s（零力度）。 */
export const MIN_VX = 140
/** 最大水平初速 px/s（满力度）。 */
export const MAX_VX = 460
/** 蓄力速度（力度/秒）。 */
export const POWER_RATE = 1.2
/** 每轮环数。 */
export const RINGS_PER_ROUND = 5
/** 总轮数。 */
export const ROUNDS = 3
/** 连击倍率上限。 */
export const COMBO_CAP = 5
/** 套中/脱手后的展示停留 ms。 */
export const RESULT_MS = 950
/** 风力最大绝对值 px/s^2（第 2 轮起启用）。 */
export const WIND_MAX = 150
/** 近柱分值。 */
export const POINT_NEAR = 5
/** 中柱分值。 */
export const POINT_MID = 10
/** 金柱分值。 */
export const POINT_GOLD = 25
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

/** 阶段：待蓄力 / 蓄力中 / 飞行 / 展示结算 / 一局结束。 */
export type RingTossPhase = 'aim' | 'charge' | 'flying' | 'settle' | 'over'

/** 单步内产生、供渲染层消费的可视事件。 */
export type RingTossEvent =
  | { type: 'hit', x: number, y: number, gained: number, value: number, combo: number }
  | { type: 'miss', x: number, y: number }
  | { type: 'clank', x: number, y: number }

/** 上浮渐隐的飘字。 */
export interface FloatText {
  x: number
  y: number
  text: string
  life: number
  /** 飘字颜色。 */
  color: string
}

/** 一根立柱：底在 FLOOR_Y，顶在 topY，分值由远近档位决定。 */
export interface Peg {
  /** 柱心 x。 */
  x: number
  /** 柱顶 y。 */
  topY: number
  /** 分值（5/10/25）。 */
  value: number
  /** 配色档（渲染用）：0 近柱 1 中柱 2 金柱。 */
  tier: 0 | 1 | 2
}

/** 飞行中的圆环。 */
export interface Ring {
  x: number
  y: number
  vx: number
  vy: number
  /** 自转角 rad 与角速度 rad/s。 */
  rot: number
  vrot: number
}

/** 套中后沿柱滑落的展示数据。 */
export interface Slide {
  /** 套中的柱在 pegs 中的下标。 */
  pegIndex: number
  /** 已滑落 ms。 */
  t: number
}

/** 一局游戏的完整可测状态。 */
export interface RingTossState {
  /** 回合内已流逝 ms。 */
  t: number
  seed: number
  score: number
  /** 连续套中数（脱手清零）。 */
  combo: number
  /** 当前轮（1 起）。 */
  round: number
  /** 本轮已投环数。 */
  ringsThrown: number
  /** 本轮剩余环数。 */
  ringsLeft: number
  pegs: Peg[]
  /** 水平风加速度 px/s^2（第 2 轮起非零）。 */
  wind: number
  phase: RingTossPhase
  /** 蓄力力度 0..1。 */
  power: number
  ring: Ring
  /** settle 阶段剩余展示 ms。 */
  settleMs: number
  /** 套中滑落展示（未套中为 null）。 */
  slide: Slide | null
  events: RingTossEvent[]
  floats: FloatText[]
  rng: () => number
}

/**
 * 力度 → 出手初速（水平线性放大，竖直固定向上；渲染层的轨迹预览使用
 * 同一函数，保证所见即所投）。
 * @param power - 力度 0..1（越界按边界计）。
 * @returns 初速分量。
 */
export function powerToVelocity(power: number): { vx: number, vy: number } {
  const p = Math.max(0, Math.min(1, power))
  return { vx: MIN_VX + p * (MAX_VX - MIN_VX), vy: LAUNCH_VY }
}

/**
 * 生成本轮柱布局：5 根柱在右半场随机取位（保证最小间距），按远近排序后
 * 由近及远赋分值档（近近中中金）；柱高随远近递增（远柱更高、顶更靠上）。
 * @param rng - 布局随机源。
 * @returns 柱数组。
 */
export function layoutPegs(rng: () => number): Peg[] {
  const count = 5
  const minX = W * 0.46
  const maxX = W - 52
  const xs: number[] = []
  let guard = 0
  while (xs.length < count && guard < 400) {
    guard += 1
    const x = minX + rng() * (maxX - minX)
    if (xs.every((px) => Math.abs(px - x) >= 44)) xs.push(x)
  }
  while (xs.length < count) xs.push(minX + (xs.length / count) * (maxX - minX))
  xs.sort((a, b) => a - b)
  const values = [POINT_NEAR, POINT_NEAR, POINT_MID, POINT_MID, POINT_GOLD]
  return xs.map((x, i) => {
    const tier: 0 | 1 | 2 = i < 2 ? 0 : i < 4 ? 1 : 2
    const height = 92 + (i / (count - 1)) * 74
    return { x, topY: FLOOR_Y - height, value: values[i]!, tier }
  })
}

/**
 * 开始新一轮：刷新柱布局与剩余环数，第 2 轮起开启风力。
 * @param state - 目标状态（就地更新）。
 */
function newRound(state: RingTossState): void {
  state.pegs = layoutPegs(state.rng)
  state.ringsThrown = 0
  state.ringsLeft = RINGS_PER_ROUND
  state.wind = state.round >= 2 ? (state.rng() * 2 - 1) * WIND_MAX : 0
  state.phase = 'aim'
  state.power = 0
  state.slide = null
  state.ring = { x: HAND.x, y: HAND.y, vx: 0, vy: 0, rot: 0, vrot: 0 }
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态。
 */
export function createRingToss(seed: number): RingTossState {
  const state: RingTossState = {
    t: 0,
    seed,
    score: 0,
    combo: 0,
    round: 1,
    ringsThrown: 0,
    ringsLeft: RINGS_PER_ROUND,
    pegs: [],
    wind: 0,
    phase: 'aim',
    power: 0,
    ring: { x: HAND.x, y: HAND.y, vx: 0, vy: 0, rot: 0, vrot: 0 },
    settleMs: 0,
    slide: null,
    events: [],
    floats: [],
    rng: mulberry32(Math.floor(seed) >>> 0),
  }
  newRound(state)
  return state
}

/**
 * 按下开始蓄力（aim 阶段有效）。
 * @param state - 目标状态。
 */
export function pressCharge(state: RingTossState): void {
  if (state.phase !== 'aim') return
  state.phase = 'charge'
  state.power = 0
}

/**
 * 松开抛出：按当前力度计算初速；未在蓄力阶段不动作。
 * @param state - 目标状态。
 * @returns true 表示已抛出。
 */
export function releaseThrow(state: RingTossState): boolean {
  if (state.phase !== 'charge') return false
  const v = powerToVelocity(state.power)
  state.ring.vx = v.vx
  state.ring.vy = v.vy
  state.ring.vrot = 7
  state.ringsThrown += 1
  state.ringsLeft -= 1
  state.phase = 'flying'
  return true
}

/**
 * 回合内结算（纯数据更新）：套中按柱分值 × 连击数计分并推飘字，脱手清
 * 连击；本环计入后进入展示阶段，投满本轮环数则推进轮次或结束一局。
 * @param state - 目标状态。
 * @param hitPeg - 套中的柱（未套中传 null）。
 */
function settleRing(state: RingTossState, hitPeg: Peg | null, pegIndex: number): void {
  if (hitPeg !== null) {
    state.combo = Math.min(COMBO_CAP, state.combo + 1)
    const gained = hitPeg.value * state.combo
    state.score += gained
    state.slide = { pegIndex, t: 0 }
    const text = state.combo >= 2 ? '+' + gained + ' x' + state.combo : '+' + gained
    const color = hitPeg.tier === 2 ? '#e0af68' : hitPeg.tier === 1 ? '#7aa2f7' : '#9ece6a'
    state.floats.push({ x: hitPeg.x, y: hitPeg.topY - 16, text, life: FLOAT_MS, color })
    state.events.push({ type: 'hit', x: hitPeg.x, y: hitPeg.topY, gained, value: hitPeg.value, combo: state.combo })
  } else {
    state.combo = 0
    state.events.push({ type: 'miss', x: state.ring.x, y: state.ring.y })
  }
  state.phase = 'settle'
  state.settleMs = RESULT_MS
}

/**
 * 推进一帧：蓄力增长、飞行物理（重力 + 风力）、柱顶套中判定（环心自上
 * 而下穿过柱顶且 x 距离在容差内）、擦柱弹开、落地/出界脱手、展示计时与
 * 轮次推进、飘字。事件写入 state.events，调用方每帧消费后由本函数在下
 * 一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepRingToss(state: RingTossState, dtMs: number): void {
  state.events.length = 0
  const dt = dtMs / 1000
  state.t += dtMs

  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 30 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }

  if (state.phase === 'over') return

  if (state.phase === 'charge') {
    state.power = Math.min(1, state.power + POWER_RATE * dt)
    return
  }

  if (state.phase === 'settle') {
    if (state.slide !== null) state.slide.t += dtMs
    state.settleMs -= dtMs
    if (state.settleMs > 0) return
    if (state.ringsThrown >= RINGS_PER_ROUND) {
      if (state.round >= ROUNDS) {
        state.phase = 'over'
        return
      }
      state.round += 1
      newRound(state)
      return
    }
    // 同轮下一环：柱布局保持不变，环回到手上。
    state.phase = 'aim'
    state.power = 0
    state.slide = null
    state.ring = { x: HAND.x, y: HAND.y, vx: 0, vy: 0, rot: 0, vrot: 0 }
  }

  if (state.phase !== 'flying') return

  const r = state.ring
  const prevY = r.y
  r.vx += state.wind * dt
  r.vy += GRAVITY * dt
  r.x += r.vx * dt
  r.y += r.vy * dt
  r.rot += r.vrot * dt

  // 柱顶判定：环心自上而下穿过某柱顶水平线时，按穿越点的 x 距离分流——
  // 容差内套中；柱顶碰撞半径内擦柱弹开（水平速度反向衰减）；更远则从
  // 柱旁掠过继续飞行。
  for (let i = 0; i < state.pegs.length; i += 1) {
    const peg = state.pegs[i]!
    if (r.vy <= 0 || prevY > peg.topY || r.y <= peg.topY) continue
    // 穿越点 x：按穿越比例从当前速度回推（vy>0 已保证）。
    const cross = r.x - (r.vx * (r.y - peg.topY)) / r.vy
    const dx = cross - peg.x
    if (Math.abs(dx) <= HIT_TOL) {
      settleRing(state, peg, i)
      return
    }
    if (Math.abs(dx) <= HIT_TOL + PEG_TOP_R + 3) {
      r.vx = -Math.sign(dx || 1) * Math.abs(r.vx) * 0.35
      r.x = peg.x + Math.sign(dx || 1) * (HIT_TOL + PEG_TOP_R + 4)
      r.y = peg.topY + 1
      state.events.push({ type: 'clank', x: peg.x, y: peg.topY })
    }
  }

  // 柱身：环下落到柱顶以下且与柱身重叠时水平弹开（不中）。
  for (const peg of state.pegs) {
    if (r.y > peg.topY && r.y < FLOOR_Y && Math.abs(r.x - peg.x) < SHAFT_R + RING_R * 0.4) {
      const side = Math.sign(r.x - peg.x) || 1
      r.x = peg.x + side * (SHAFT_R + RING_R * 0.4 + 0.5)
      r.vx = side * Math.abs(r.vx) * 0.45
    }
  }

  if (r.y >= FLOOR_Y) {
    r.y = FLOOR_Y
    settleRing(state, null, -1)
    return
  }
  if (r.x < -40 || r.x > W + 20 || r.y > H + 60) {
    settleRing(state, null, -1)
  }
}
