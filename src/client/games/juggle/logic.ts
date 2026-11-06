/**
 * 杂技抛球（Juggle）纯逻辑：底部双手拍球——点击画面任意位置，给附近
 * 的球施加向上 + 朝点击方向侧移的速度（冲量按点击点与球的距离线性
 * 衰减）；球受固定重力下落，坠出底部即丢一球（3 命）。每成功拍中一次
 * 按连击倍率得分（窗口内连拍倍率递增，封顶 8）。场上目标球数随存活
 * 时间每 10 秒 +1（最多 6），丢球后自动从顶部补齐到目标数。物理采用
 * 固定子步（≤8ms）重力积分，侧墙反弹、上行限速。所有随机走注入
 * seed（mulberry32(seed, round)），同 seed + 同输入序列重放一致。
 * 时间单位毫秒，物理单位 px / s。
 */

/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export const W = 480
export const H = 640
export const HUD_H = 30

/** 球半径 px。 */
export const BALL_R = 12
/** 重力加速度 px/s^2。 */
export const GRAVITY = 1500
/** 点击有效半径 px：超出该距离的球不受冲量。 */
export const TAP_RADIUS = 100
/** 基础向上拍击速度 px/s（按衰减系数缩放）。 */
export const TAP_VY = -760
/** 拍击侧移速度上限 px/s（朝点击方向的分量上限，按衰减系数缩放）。 */
export const TAP_VX_MAX = 320
/** 球上行速度下限（防无限加速）。 */
export const MIN_VY = -980
/** 球横向速度绝对值上限。 */
export const MAX_ABS_VX = 420
/** 初始生命。 */
export const START_LIVES = 3
/** 场上球数上限。 */
export const MAX_BALLS = 6
/** 每存活多少 ms 场上目标球数 +1。 */
export const ADD_BALL_MS = 10_000
/** 连击窗口 ms：窗口内再拍中则连击 +1。 */
export const COMBO_WINDOW_MS = 1600
/** 连击倍率上限（也是单次拍击得分上限）。 */
export const COMBO_CAP = 8
/** 固定物理子步 ms 上限。 */
export const SUBSTEP_MS = 8
/** 每球运动拖尾保留的点数。 */
export const TRAIL_LEN = 10
/** 飘字存活时长 ms。 */
export const FLOAT_MS = 800
/** 补球出生 y。 */
export const SPAWN_Y = 40

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

/** 一个被抛起的彩球；trail 为最近若干帧位置（新点在数组末尾）。 */
export interface Ball {
  x: number, y: number
  vx: number, vy: number
  /** 配色索引（稳定取共享主题色阶）。 */
  hue: number
  trail: { x: number, y: number }[]
}

/** 上浮渐隐的飘字（得分提示）。 */
export interface FloatText {
  x: number, y: number
  text: string
  life: number
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type JuggleEvent =
  | { type: 'tap', x: number, y: number, strength: number }
  | { type: 'hit', x: number, y: number, hue: number }
  | { type: 'drop', x: number, hue: number }
  | { type: 'spawn', x: number, hue: number }

/** 一帧输入：本帧点击点（逻辑坐标），null 表示无点击。 */
export interface JuggleInput {
  tap: { x: number, y: number } | null
}

/** 一局游戏的完整可测状态。 */
export interface JuggleState {
  /** 回合内已流逝 ms。 */
  t: number
  score: number
  lives: number
  dropped: number
  combo: number
  /** 连击失效时刻 ms（回合钟）。 */
  comboExpire: number
  balls: Ball[]
  events: JuggleEvent[]
  floats: FloatText[]
  rng: () => number
  /** 已使用的配色索引计数（保证新球颜色稳定递进）。 */
  hueCount: number
  over: boolean
}

/** 一次拍击对一球的冲量结算。 */
export interface TapImpulse {
  /** 衰减系数：点击点到球心距离 / TAP_RADIUS 的线性剩余，0 表示无效。 */
  factor: number
  /** 横向速度增量 px/s（朝点击方向，带符号）。 */
  dvx: number
  /** 纵向速度增量 px/s（负值向上）。 */
  dvy: number
}

/**
 * 计算一次点击对一球的拍击冲量：factor = 1 - dist/TAP_RADIUS（截 0），
 * dvy = TAP_VY * factor（向上），dvx 朝点击方向、上限 TAP_VX_MAX * factor。
 * 纯函数，不做任何边界反射或限速。
 * @param ball - 被拍击的球。
 * @param x - 点击点逻辑 x。
 * @param y - 点击点逻辑 y。
 * @returns 冲量结算（factor=0 表示距离过远无效）。
 */
export function tapImpulse(ball: Ball, x: number, y: number): TapImpulse {
  const dx = x - ball.x
  const dy = y - ball.y
  const dist = Math.hypot(dx, dy)
  if (dist >= TAP_RADIUS) return { factor: 0, dvx: 0, dvy: 0 }
  const factor = 1 - dist / TAP_RADIUS
  const dvy = TAP_VY * factor
  let dvx = 0
  if (dist > 1e-9) dvx = (dx / dist) * TAP_VX_MAX * factor
  return { factor, dvx, dvy }
}

/**
 * 当前场上目标球数：1 + floor(t / ADD_BALL_MS)，封顶 MAX_BALLS。
 * @param tMs - 回合内毫秒钟。
 * @returns 目标球数。
 */
export function ballTargetOf(tMs: number): number {
  return Math.min(MAX_BALLS, 1 + Math.floor(Math.max(0, tMs) / ADD_BALL_MS))
}

/**
 * 球是否已坠出底部（丢球判定）。
 * @param ball - 待判定的球。
 * @returns 球整体越过画布底边时为 true。
 */
export function isDropped(ball: Ball): boolean {
  return ball.y - BALL_R > H
}

/**
 * 一次拍中的得分：当前连击倍率即单次得分。
 * @param combo - 拍中后的连击数。
 * @returns 本次得分。
 */
export function gainOf(combo: number): number {
  return Math.min(COMBO_CAP, Math.max(1, combo))
}

/** 新球初始拖尾为空。 */
function freshTrail(): { x: number, y: number }[] {
  return []
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态（含 1 个起始球）。
 */
export function createJuggle(seed: number, round = 1): JuggleState {
  const state: JuggleState = {
    t: 0,
    score: 0,
    lives: START_LIVES,
    dropped: 0,
    combo: 0,
    comboExpire: 0,
    balls: [],
    events: [],
    floats: [],
    rng: mulberry32((Math.floor(seed) * 31 + round) >>> 0),
    hueCount: 0,
    over: false,
  }
  spawnBall(state)
  return state
}

/**
 * 从顶部补一个新球：x 由 rng 决定，vy 缓降、vx 微漂移，颜色索引递进。
 * @param state - 目标状态（使用其 rng 与 hueCount）。
 */
function spawnBall(state: JuggleState): void {
  const hue = state.hueCount % 8
  state.hueCount += 1
  const x = BALL_R + 20 + state.rng() * (W - BALL_R * 2 - 40)
  const vy = 40 + state.rng() * 60
  const vx = (state.rng() - 0.5) * 80
  state.balls.push({ x, y: SPAWN_Y, vx, vy, hue, trail: freshTrail() })
  state.events.push({ type: 'spawn', x, hue })
}

/**
 * 扣 1 命并重置连击；命尽置 over。
 * @param state - 目标状态。
 */
function loseLife(state: JuggleState): void {
  state.lives -= 1
  state.combo = 0
  if (state.lives <= 0) {
    state.lives = 0
    state.over = true
  }
}

/**
 * 推进一帧：先结算本帧点击（对所有球施加冲量、计连击得分），再按
 * 固定子步积分重力与位移（侧墙反弹、上下行限速），坠出底部的球扣命
 * 并发 drop 事件，随后把场上球数补到目标数（每帧最多补 1 个）。事件
 * 写入 state.events，调用方每帧消费后在下一帧开头被清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入（点击点或 null）。
 */
export function stepJuggle(state: JuggleState, dtMs: number, input: JuggleInput): void {
  state.events.length = 0
  if (state.over) return
  state.t += dtMs

  // 点击：对所有在有效半径内的球施加冲量；拍中任意球即计连击得分。
  if (input.tap !== null) {
    let strength = 0
    let hitAny = false
    for (const ball of state.balls) {
      const imp = tapImpulse(ball, input.tap.x, input.tap.y)
      if (imp.factor <= 0) continue
      ball.vx = Math.max(-MAX_ABS_VX, Math.min(MAX_ABS_VX, ball.vx + imp.dvx))
      ball.vy = Math.max(MIN_VY, ball.vy + imp.dvy)
      strength = Math.max(strength, imp.factor)
      hitAny = true
      state.events.push({ type: 'hit', x: ball.x, y: ball.y, hue: ball.hue })
    }
    state.events.push({ type: 'tap', x: input.tap.x, y: input.tap.y, strength })
    if (hitAny) {
      state.combo = state.comboExpire > state.t ? Math.min(COMBO_CAP, state.combo + 1) : 1
      state.comboExpire = state.t + COMBO_WINDOW_MS
      const gained = gainOf(state.combo)
      state.score += gained
      state.floats.push({ x: input.tap.x, y: input.tap.y - 18, text: '+' + gained, life: FLOAT_MS })
    }
  }

  // 固定子步物理：重力积分 + 位移 + 侧墙反弹 + 丢球判定。
  let ms = Math.max(0, dtMs)
  while (ms > 0) {
    const s = Math.min(SUBSTEP_MS, ms)
    ms -= s
    const dt = s / 1000
    for (let i = state.balls.length - 1; i >= 0; i -= 1) {
      const ball = state.balls[i]!
      ball.vy += GRAVITY * dt
      ball.x += ball.vx * dt
      ball.y += ball.vy * dt
      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) }
      else if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) }
      if (isDropped(ball)) {
        const dropped = state.balls.splice(i, 1)[0]!
        state.dropped += 1
        state.events.push({ type: 'drop', x: dropped.x, hue: dropped.hue })
        loseLife(state)
        if (state.over) return
      }
    }
  }

  // 补球到目标数（每帧最多 1 个，避免瞬间倾泻）。
  if (state.balls.length < ballTargetOf(state.t)) spawnBall(state)

  // 拖尾：每帧记录一次位置，保留最近 TRAIL_LEN 个点。
  for (const ball of state.balls) {
    ball.trail.push({ x: ball.x, y: ball.y })
    if (ball.trail.length > TRAIL_LEN) ball.trail.shift()
  }

  // 连击窗口过期仅在后续拍中时结算；飘字上浮渐隐。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 34 * (dtMs / 1000)
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }
}
