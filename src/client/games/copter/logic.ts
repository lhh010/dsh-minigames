/**
 * 洞穴飞行（Copter）纯逻辑：横版自动前进的直升机，按住施加向上推力、
 * 松开只受重力。洞穴上下壁由 seed+段号确定性生成——中线随机游走、
 * 半宽随段号单调收窄至下限、每若干段出现一次急弯；机身盒（矩形）
 * 触碰任一壁折线即爆炸结束。距离（米）即分数，前进速度随距离缓慢
 * 提升并封顶。模拟以固定子步（SUB_MS）推进，帧间隔先入累加器、再按
 * 整数子步消费，同一输入时间线重放结果逐位一致。时间单位毫秒，
 * 物理单位 px / s。
 */

/** 逻辑画布尺寸。 */
export const W = 520
export const H = 360

/** 洞穴分段宽度 px（世界坐标）。 */
export const SEG_W = 40
/** 初始半宽 px（全宽 = 2 × half）。 */
export const HALF_START = 150
/** 半宽下限 px（最深处的通道宽度）。 */
export const HALF_MIN = 48
/** 每段收窄量 px。 */
export const NARROW_PER_SEG = 0.6
/** 基础段转弯幅度 px，每 BEND_EVERY 段放大为急弯幅度。 */
export const TURN_AMP = 26
export const TURN_AMP_HARD = 64
export const BEND_EVERY = 8
/** 重力加速度 px/s^2。 */
export const GRAVITY = 640
/** 按住时的向上推力加速度 px/s^2。 */
export const THRUST = 1150
/** 垂直速度上限 px/s（绝对值）。 */
export const VY_MAX = 430
/** 起始前进速度 px/s。 */
export const SPEED_BASE = 175
/** 前进速度上限 px/s。 */
export const SPEED_MAX = 360
/** 前进速度随距离（px）的提升系数。 */
export const SPEED_RAMP = 0.012
/** 机身碰撞盒半宽 / 半高 px。 */
export const HULL_HALF_W = 11
export const HULL_HALF_H = 7
/** 固定物理子步 ms。 */
export const SUB_MS = 8
/** 每 10px 记 1 米（即 1 分）。 */
export const METER_PX = 10

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

/** 一段洞穴的中线高度与半宽。 */
export interface CaveProfile {
  /** 中线 y（0 = 顶）。 */
  center: number
  /** 半宽 px。 */
  half: number
}

/** 段缓存：key 为 seed + ':' + i，避免渲染与碰撞反复迭代随机游走。 */
const profileCache = new Map<string, CaveProfile>()

/**
 * 生成第 i 段洞穴剖面（seed+i 确定性）：半宽 = max(下限, 初始 - i × 收窄量)，
 * 对 i 单调不增；中线由上一段出发随机游走——普通段幅度 TURN_AMP，每逢
 * BEND_EVERY 的倍数段取急弯幅度 TURN_AMP_HARD；单段位移受当前半宽约束
 * （可飞越坡度），并被夹在画布内（含边距）。
 * @param seed - 外部种子。
 * @param i - 段号（从 0 起）。
 * @returns 该段的中线与半宽。
 */
export function caveProfile(seed: number, i: number): CaveProfile {
  const key = seed + ':' + i
  const hit = profileCache.get(key)
  if (hit !== undefined) return hit
  const half = Math.max(HALF_MIN, HALF_START - i * NARROW_PER_SEG)
  let center: number
  if (i <= 0) {
    center = H / 2
  } else {
    const prev = caveProfile(seed, i - 1)
    const rng = mulberry32((Math.floor(seed) * 7919 + i * 104729) >>> 0)
    const amp = i % BEND_EVERY === 0 ? TURN_AMP_HARD : TURN_AMP
    let step = (rng() * 2 - 1) * amp
    // 坡度约束：单段位移不超过当前半宽的一半，保证可飞越。
    const cap = prev.half * 0.5
    if (step > cap) step = cap
    if (step < -cap) step = -cap
    center = prev.center + step
    // 画布约束：通道完整落在 [边距, H - 边距] 内。
    const lo = prev.half + 12
    const hi = H - prev.half - 12
    if (center < lo) center = lo
    if (center > hi) center = hi
  }
  const profile: CaveProfile = { center, half }
  profileCache.set(key, profile)
  return profile
}

/**
 * 世界 x 处的插值洞穴值（相邻段线性插值）。
 * @param seed - 外部种子。
 * @param x - 世界横坐标 px。
 * @param pick - 取中线('center')或半宽('half')。
 * @returns 插值结果 px。
 */
function caveAt(seed: number, x: number, pick: 'center' | 'half'): number {
  const fx = Math.max(0, x) / SEG_W
  const i = Math.floor(fx)
  const k = fx - i
  const a = caveProfile(seed, i)
  const b = caveProfile(seed, i + 1)
  return a[pick] + (b[pick] - a[pick]) * k
}

/**
 * 世界 x 处的上壁（天花板）y。
 * @param seed - 外部种子。
 * @param x - 世界横坐标 px。
 * @returns 上壁 y（越小越靠上）。
 */
export function ceilingAt(seed: number, x: number): number {
  return caveAt(seed, x, 'center') - caveAt(seed, x, 'half')
}

/**
 * 世界 x 处的下壁（地面）y。
 * @param seed - 外部种子。
 * @param x - 世界横坐标 px。
 * @returns 下壁 y（越大越靠下）。
 */
export function floorAt(seed: number, x: number): number {
  return caveAt(seed, x, 'center') + caveAt(seed, x, 'half')
}

/**
 * 当前前进速度 px/s：随已飞距离缓慢提升，封顶 SPEED_MAX。
 * @param distPx - 已飞世界距离 px。
 * @returns 前进速度。
 */
export function speedOf(distPx: number): number {
  return Math.min(SPEED_MAX, SPEED_BASE + distPx * SPEED_RAMP)
}

/** 阶段：飞行 / 坠毁结束。 */
export type CopterPhase = 'flying' | 'crashed'

/** 单步内产生、供渲染层消费的可视事件。 */
export type CopterEvent =
  | { type: 'crash', x: number, y: number }

/** 一局游戏的完整可测状态。 */
export interface CopterState {
  /** 回合内已流逝 ms（旋翼动画用）。 */
  t: number
  seed: number
  /** 机体在世界坐标中的横坐标 px（屏幕位置由渲染层换算）。 */
  worldX: number
  /** 机体纵向位置 / 速度（y 增大向下）。 */
  y: number
  vy: number
  /** 距离分（米）= floor(worldX / METER_PX)。 */
  score: number
  phase: CopterPhase
  /** 子步累加器 ms：只在攒满 SUB_MS 时消费整数子步。 */
  acc: number
  events: CopterEvent[]
}

/**
 * 新开一局：出生在起点通道中央、速度为零。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export function createCopter(seed: number): CopterState {
  const p0 = caveProfile(seed, 0)
  return {
    t: 0,
    seed,
    worldX: 0,
    y: p0.center,
    vy: 0,
    score: 0,
    phase: 'flying',
    acc: 0,
    events: [],
  }
}

/**
 * 坠毁结算（纯数据更新）：固定位置、记录事件。
 * @param state - 目标状态。
 * @param x - 撞击世界横坐标。
 * @param y - 撞击纵坐标。
 */
function crash(state: CopterState, x: number, y: number): void {
  state.phase = 'crashed'
  state.vy = 0
  state.events.push({ type: 'crash', x, y })
}

/**
 * 推进一个子步：推力/重力积分、前进、机身盒对上下壁折线的碰撞判定。
 * @param state - 目标状态。
 * @param holding - 本子步是否按住（推力）。
 */
function substep(state: CopterState, holding: boolean): void {
  const dt = SUB_MS / 1000
  const a = holding ? -THRUST : GRAVITY
  state.vy += a * dt
  if (state.vy > VY_MAX) state.vy = VY_MAX
  if (state.vy < -VY_MAX) state.vy = -VY_MAX
  state.y += state.vy * dt
  state.worldX += speedOf(state.worldX) * dt
  state.score = Math.floor(state.worldX / METER_PX)

  // 机身盒左右两缘分别对上下壁插值折线做包含测试。
  for (const edge of [state.worldX - HULL_HALF_W, state.worldX + HULL_HALF_W]) {
    if (state.y - HULL_HALF_H <= ceilingAt(state.seed, edge)) {
      crash(state, edge, state.y - HULL_HALF_H)
      return
    }
    if (state.y + HULL_HALF_H >= floorAt(state.seed, edge)) {
      crash(state, edge, state.y + HULL_HALF_H)
      return
    }
  }
}

/**
 * 推进一帧：dt 先入累加器，再按 SUB_MS 固定子步消费（同一输入时间线
 * 重放逐位一致）；坠毁后只走时钟。事件写入 state.events，每帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param holding - 本帧是否按住（推力）。
 */
export function stepCopter(state: CopterState, dtMs: number, holding: boolean): void {
  state.events.length = 0
  state.t += dtMs
  if (state.phase !== 'flying') return
  state.acc += Math.max(0, dtMs)
  while (state.acc >= SUB_MS && state.phase === 'flying') {
    state.acc -= SUB_MS
    substep(state, holding)
  }
}
