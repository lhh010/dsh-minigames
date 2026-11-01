/**
 * 月球着陆（Lunar Lander）纯逻辑：登月舱在重力下坠向由 seed+level
 * 确定性生成的折线山脊，方向键控制姿态与点火（沿机体方向推力，消耗
 * 燃料）。山脊上嵌有 1~3 块平坦着陆 pad，pad 越窄得分倍率越高；平稳
 * （慢速、直立、在 pad 上）着陆进入下一关（山更陡、pad 更窄更少、重力
 * 更大），非 pad 或超速/倾覆坠毁 -1 命，共 3 命。全部函数确定性可测，
 * 时间单位毫秒，物理单位 px / s。
 */

/** 逻辑画布尺寸。 */
export const W = 480
export const H = 640

/** 基础重力加速度 px/s^2，每级 +GRAVITY_PER_LEVEL，封顶 GRAVITY_MAX。 */
export const GRAVITY_BASE = 80
export const GRAVITY_PER_LEVEL = 10
export const GRAVITY_MAX = 160
/** 点火推力加速度 px/s^2（机体方向）。 */
export const THRUST = 260
/** 旋转角速度 rad/s。 */
export const ROT_SPEED = 2.4
/** 燃料上限（每关 / 每次重生回满）。 */
export const FUEL_MAX = 100
/** 燃料消耗 /s。 */
export const FUEL_BURN = 26
/** 初始生命。 */
export const START_LIVES = 3
/** 平稳着陆阈值：垂直速度 px/s。 */
export const LAND_VY_MAX = 60
/** 平稳着陆阈值：水平速度 px/s。 */
export const LAND_VX_MAX = 40
/** 平稳着陆阈值：倾角 rad。 */
export const LAND_TILT_MAX = 0.35
/** 登月舱碰撞半高 px（触地判定用）。 */
export const LANDER_HALF = 11
/** 着陆结算后的停留 ms。 */
export const LANDED_MS = 1600
/** 坠毁展示 ms（之后自动重生同关）。 */
export const CRASHED_MS = 1400

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

/** 当前关卡重力加速度 px/s^2。 */
export function gravityOf(level: number): number {
  return Math.min(GRAVITY_MAX, GRAVITY_BASE + (level - 1) * GRAVITY_PER_LEVEL)
}

/** 一块平坦着陆 pad：x 区间、地面高度与得分倍率。 */
export interface Pad {
  x1: number
  x2: number
  y: number
  /** 得分倍率（窄 pad 更高，1~4）。 */
  mult: number
}

/** 折线山脊：顶点从左到右等距分布。 */
export interface Terrain {
  points: { x: number, y: number }[]
  pads: Pad[]
}

/**
 * 生成某一关的山脊与 pad（seed+level 确定性）。
 * 关卡越高：顶点越密起伏越大、pad 数 3→1、pad 越窄、倍率越高。
 * @param seed - 外部种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 山脊数据。
 */
export function generateTerrain(seed: number, level: number): Terrain {
  const rng = mulberry32((Math.floor(seed) * 131 + level * 17) >>> 0)
  const segs = Math.min(22, 12 + level)
  const rough = Math.min(120, 46 + level * 12)
  const baseY = H * 0.72
  const points: { x: number, y: number }[] = []
  for (let i = 0; i <= segs; i += 1) {
    const x = (W / segs) * i
    const y = baseY - rough / 2 + rng() * rough + Math.sin(i * 1.7 + level) * 8
    points.push({ x, y })
  }
  points[0]!.y = points[1]!.y
  points[segs]!.y = points[segs - 1]!.y

  // pad 数量：1~3 级 3 块，之后逐级减少到 1 块。
  const padCount = Math.max(1, 3 - Math.floor((level - 1) / 3))
  // pad 宽度：基础 76px，每级 -5px，下限 26px；倍率按宽度反比 1~4。
  const padWidth = Math.max(26, 76 - (level - 1) * 5)
  const mult = Math.max(1, Math.min(4, Math.round(76 / padWidth)))
  const pads: Pad[] = []
  // 可选段（避开两端各 2 段），随机挑互不相邻的段铺 pad。
  const candidates: number[] = []
  for (let i = 2; i <= segs - 3; i += 1) candidates.push(i)
  let guard = 0
  while (pads.length < padCount && candidates.length > 0 && guard < 64) {
    guard += 1
    const ci = Math.floor(rng() * candidates.length)
    const i = candidates[ci]!
    const tooClose = pads.some((p) => Math.abs((p.x1 + p.x2) / 2 - points[i]!.x) < padWidth * 2.2)
    if (!tooClose) {
      const y = (points[i]!.y + points[i + 1]!.y) / 2
      points[i]!.y = y
      points[i + 1]!.y = y
      pads.push({ x1: points[i]!.x, x2: points[i + 1]!.x, y, mult })
    }
    candidates.splice(ci, 1)
  }
  if (pads.length === 0) {
    const i = Math.floor(segs / 2)
    const y = points[i]!.y
    points[i]!.y = y
    points[i + 1]!.y = y
    pads.push({ x1: points[i]!.x, x2: points[i + 1]!.x, y, mult })
  }
  return { points, pads }
}

/**
 * 山脊在 x 处的地面高度（线性插值）。
 * @param terrain - 山脊数据。
 * @param x - 横坐标。
 * @returns 地面 y（越大越低）。
 */
export function groundAt(terrain: Terrain, x: number): number {
  const pts = terrain.points
  const clamped = Math.max(0, Math.min(W, x))
  const step = W / (pts.length - 1)
  const i = Math.min(pts.length - 2, Math.floor(clamped / step))
  const a = pts[i]!
  const b = pts[i + 1]!
  const k = (clamped - a.x) / (b.x - a.x)
  return a.y + (b.y - a.y) * k
}

/**
 * x 是否落在某块 pad 上。
 * @param terrain - 山脊数据。
 * @param x - 横坐标。
 * @returns 命中的 pad，未命中返回 null。
 */
export function padAt(terrain: Terrain, x: number): Pad | null {
  for (const p of terrain.pads) {
    if (x >= p.x1 && x <= p.x2) return p
  }
  return null
}

/** 帧输入：左 / 右旋转与点火。 */
export interface LanderInput {
  left: boolean
  right: boolean
  thrust: boolean
}

/** 阶段：飞行 / 着陆成功展示 / 坠毁展示 / 命尽结束。 */
export type LanderPhase = 'flying' | 'landed' | 'crashed' | 'gameover'

/** 单步内产生、供渲染层消费的可视事件。 */
export type LanderEvent =
  | { type: 'land', x: number, y: number, points: number }
  | { type: 'crash', x: number, y: number }

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
export interface LanderState {
  /** 回合内已流逝 ms（渲染闪烁用）。 */
  t: number
  seed: number
  level: number
  score: number
  lives: number
  fuel: number
  /** 舱体位置 / 速度 / 倾角（0 = 直立，正 = 顺时针）。 */
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  /** 当前帧是否点火中（渲染火焰用，step 每帧写入）。 */
  thrusting: boolean
  terrain: Terrain
  phase: LanderPhase
  /** 阶段停留剩余 ms。 */
  phaseMs: number
  /** 着陆结算展示分（landed 阶段 HUD 用）。 */
  lastPoints: number
  events: LanderEvent[]
  floats: FloatText[]
}

/**
 * 重置舱体到出生点（新关或坠毁重生），燃料回满。
 * @param state - 目标状态。
 */
function resetLander(state: LanderState): void {
  const rng = mulberry32((state.seed * 7 + state.level * 101 + state.lives * 13) >>> 0)
  state.x = W / 2 + (rng() - 0.5) * 120
  state.y = 70
  state.vx = (rng() - 0.5) * 40
  state.vy = 0
  state.angle = 0
  state.fuel = FUEL_MAX
  state.thrusting = false
}

/**
 * 新开一局（level 1）。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export function createLander(seed: number): LanderState {
  const state: LanderState = {
    t: 0,
    seed,
    level: 1,
    score: 0,
    lives: START_LIVES,
    fuel: FUEL_MAX,
    x: W / 2,
    y: 70,
    vx: 0,
    vy: 0,
    angle: 0,
    thrusting: false,
    terrain: generateTerrain(seed, 1),
    phase: 'flying',
    phaseMs: 0,
    lastPoints: 0,
    events: [],
    floats: [],
  }
  resetLander(state)
  return state
}

/** 角度归一到 [-π, π]。 */
function normAngle(a: number): number {
  let r = a
  while (r > Math.PI) r -= Math.PI * 2
  while (r < -Math.PI) r += Math.PI * 2
  return r
}

/**
 * 着陆 / 坠毁结算（纯数据更新）。
 * @param state - 目标状态。
 * @param pad - 命中的 pad（null 表示非 pad）。
 */
function settleTouchdown(state: LanderState, pad: Pad | null): void {
  const ground = groundAt(state.terrain, state.x)
  state.y = ground - LANDER_HALF
  const safeVy = state.vy < LAND_VY_MAX
  const safeVx = Math.abs(state.vx) < LAND_VX_MAX
  const safeTilt = Math.abs(normAngle(state.angle)) < LAND_TILT_MAX
  if (pad !== null && safeVy && safeVx && safeTilt) {
    // 成功：剩余燃料 + 落点精度（离 pad 中心越近越高）计分，乘 pad 倍率。
    const center = (pad.x1 + pad.x2) / 2
    const half = Math.max(1, (pad.x2 - pad.x1) / 2)
    const accuracy = Math.max(0, 1 - Math.abs(state.x - center) / half)
    const pts = Math.round((40 + state.fuel * 0.8 + 60 * accuracy) * pad.mult)
    state.score += pts
    state.lastPoints = pts
    state.phase = 'landed'
    state.phaseMs = LANDED_MS
    state.events.push({ type: 'land', x: state.x, y: state.y, points: pts })
    state.floats.push({ x: state.x, y: state.y - 30, text: '+' + pts + (pad.mult > 1 ? ' x' + pad.mult : ''), life: FLOAT_MS })
  } else {
    state.lives -= 1
    state.phase = state.lives <= 0 ? 'gameover' : 'crashed'
    state.phaseMs = CRASHED_MS
    state.events.push({ type: 'crash', x: state.x, y: state.y })
  }
  state.vx = 0
  state.vy = 0
}

/**
 * 推进一帧：飞行物理（重力 / 推力 / 旋转 / 燃料）、触地判定、
 * 阶段停留与过关切换、飘字。事件写入 state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export function stepLander(state: LanderState, dtMs: number, input: LanderInput): void {
  state.events.length = 0
  const dt = dtMs / 1000
  state.t += dtMs

  // 飘字上浮渐隐（所有阶段共用）。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 26 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }

  // 阶段停留：着陆 → 下一关；坠毁 → 同关重生。
  if (state.phase !== 'flying') {
    if (state.phase !== 'gameover') {
      state.phaseMs -= dtMs
      if (state.phaseMs <= 0) {
        if (state.phase === 'landed') {
          state.level += 1
          state.terrain = generateTerrain(state.seed, state.level)
        }
        state.phase = 'flying'
        state.phaseMs = 0
        resetLander(state)
      }
    }
    return
  }

  // 姿态旋转。
  if (input.left) state.angle -= ROT_SPEED * dt
  if (input.right) state.angle += ROT_SPEED * dt

  // 点火：有燃料才生效，沿机体方向（angle=0 时向上）。
  state.thrusting = input.thrust && state.fuel > 0
  const ax = state.thrusting ? Math.sin(state.angle) * THRUST : 0
  const ay = state.thrusting ? -Math.cos(state.angle) * THRUST : 0
  if (state.thrusting) state.fuel = Math.max(0, state.fuel - FUEL_BURN * dt)

  // 物理。
  const g = gravityOf(state.level)
  state.vx += ax * dt
  state.vy += (ay + g) * dt
  state.x += state.vx * dt
  state.y += state.vy * dt

  // 侧壁软反弹（不让舱体飞出画布）。
  if (state.x < LANDER_HALF) {
    state.x = LANDER_HALF
    state.vx = Math.abs(state.vx) * 0.3
  } else if (state.x > W - LANDER_HALF) {
    state.x = W - LANDER_HALF
    state.vx = -Math.abs(state.vx) * 0.3
  }
  if (state.y < LANDER_HALF) {
    state.y = LANDER_HALF
    state.vy = Math.max(0, state.vy)
  }

  // 触地判定。
  const ground = groundAt(state.terrain, state.x)
  if (state.y + LANDER_HALF >= ground) {
    settleTouchdown(state, padAt(state.terrain, state.x))
  }
}

/**
 * 当前离地高度 px（HUD 用）。
 * @param state - 当前状态。
 * @returns 舱底到地面的竖直距离。
 */
export function altitude(state: LanderState): number {
  return Math.max(0, groundAt(state.terrain, state.x) - (state.y + LANDER_HALF))
}
