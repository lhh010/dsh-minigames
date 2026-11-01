/**
 * 蹦蹦跳（Jumper）纯逻辑：小家伙恒定弹跳——落到平台上 vy 重置为固定
 * 起跳速度；←→/AD 控制横向（带轻微惯性）。平台由 seed+段号确定性生成，
 * 分普通 / 移动 / 易碎 / 尖刺四种，越往上稀有平台越多；摄像机只跟随
 * 向上，向下掉出屏幕即结束（1 命）；高度即分数。全部函数确定性可测，
 * 时间单位毫秒，物理单位 px / s；世界坐标 y 向下增大，越高越小。
 */

/** 逻辑画布尺寸。 */
export const W = 420
export const H = 640

/** 重力加速度 px/s^2。 */
export const GRAVITY = 1500
/** 触板起跳速度 px/s（向上）。 */
export const BOUNCE_VY = 560
/** 横向加速度 px/s^2。 */
export const LATERAL_ACC = 1600
/** 横向速度上限 px/s。 */
export const MAX_VX = 280
/** 无输入时的横向阻尼（每秒衰减比例系数）。 */
export const LATERAL_DAMP = 8
/** 小家伙半宽 / 半高 px。 */
export const PLAYER_HALF = 12
/** 相邻平台竖直间距 px。 */
export const GAP = 64
/** 第 0 段平台（出生平台）的世界 y。 */
export const BASE_Y = H - 90
/** 稀有平台占比随高度线性增长的高度尺度 px（越高越稀有）。 */
export const RARITY_SCALE = 3600
/** 单次弹跳的挤压动画时长 ms。 */
export const SQUASH_MS = 140

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

/** 平台种类：普通 / 横移 / 易碎（踩一次碎裂）/ 尖刺（碰到即结束）。 */
export type PlatformKind = 'normal' | 'moving' | 'crumbly' | 'spiky'

/** 一段平台（seed+段号确定性生成，碎裂状态由对局状态单独记录）。 */
export interface Platform {
  /** 段号（0 = 出生平台）。 */
  index: number
  /** 世界 y（平台顶面）。 */
  y: number
  /** 宽度 px。 */
  w: number
  kind: PlatformKind
  /** 左边缘世界 x（moving 平台为相位基准，见 {@link platformX}）。 */
  x: number
  /** moving 平台横移角速度 rad/s（其余为 0）。 */
  speed: number
  /** moving 平台横移初相位 rad（其余为 0）。 */
  phase: number
}

/**
 * 生成第 index 段平台（seed+段号确定性；同 seed 同段号结果恒定）。
 * 高度越高（段号越大）：尖刺 / 移动 / 易碎占比越高，普通平台越窄。
 * @param seed - 外部种子。
 * @param index - 段号（从 0 起，0 与 1 恒为普通出生平台）。
 * @returns 平台数据。
 */
export function platformAt(seed: number, index: number): Platform {
  const rng = mulberry32((Math.floor(seed) * 131 + index * 7919) >>> 0)
  const y = BASE_Y - index * GAP
  const t = Math.min(1, (index * GAP) / RARITY_SCALE)
  const margin = 8
  if (index <= 1) {
    const w = index === 0 ? 150 : 92
    return { index, y, w, kind: 'normal', x: W / 2 - w / 2, speed: 0, phase: 0 }
  }
  // 单次掷点按累计阈值分段：尖刺 → 移动 → 易碎 → 普通。
  const roll = rng()
  const pSpiky = 0.05 + 0.10 * t
  const pMoving = 0.10 + 0.10 * t
  const pCrumbly = 0.12 + 0.12 * t
  let kind: PlatformKind = 'normal'
  if (roll < pSpiky) kind = 'spiky'
  else if (roll < pSpiky + pMoving) kind = 'moving'
  else if (roll < pSpiky + pMoving + pCrumbly) kind = 'crumbly'
  const w = kind === 'normal' ? Math.round(88 - 24 * t + rng() * 18) : 68
  const x = margin + rng() * (W - margin * 2 - w)
  if (kind === 'moving') {
    return { index, y, w, kind, x, speed: 0.9 + 0.8 * t + rng() * 0.3, phase: rng() * Math.PI * 2 }
  }
  return { index, y, w, kind, x, speed: 0, phase: 0 }
}

/**
 * 平台在时刻 tMs 的左边缘 x（moving 平台在其活动区间内正弦横移）。
 * @param platform - 平台数据。
 * @param tMs - 对局内毫秒钟。
 * @returns 左边缘世界 x。
 */
export function platformX(platform: Platform, tMs: number): number {
  if (platform.kind !== 'moving') return platform.x
  const margin = 8
  const range = W - margin * 2 - platform.w
  const center = margin + range / 2
  return center + (range / 2) * Math.sin(platform.phase + (tMs / 1000) * platform.speed)
}

/**
 * 覆盖世界 y 区间 [yTop, yBottom] 的平台段号范围（含端点）。
 * @param yTop - 较小（较高）的 y。
 * @param yBottom - 较大（较低）的 y。
 * @returns [最小段号, 最大段号]。
 */
export function indexRangeFor(yTop: number, yBottom: number): [number, number] {
  const hi = Math.max(0, Math.ceil((BASE_Y - yTop) / GAP))
  const lo = Math.max(0, Math.floor((BASE_Y - yBottom) / GAP))
  return lo > hi ? [hi, lo] : [lo, hi]
}

/** 帧输入：左 / 右横移（可同时为 false 表示松手滑行）。 */
export interface JumperInput {
  left: boolean
  right: boolean
}

/** 阶段：弹跳中 / 已结束（掉落或触刺）。 */
export type JumperPhase = 'playing' | 'dead'

/** 单步内产生、供渲染层消费的可视事件。 */
export type JumperEvent =
  | { type: 'bounce', x: number, y: number, kind: PlatformKind }
  | { type: 'break', x: number, y: number }
  | { type: 'spike', x: number, y: number }
  | { type: 'fall', x: number, y: number }

/** 一局游戏的完整可测状态。 */
export interface JumperState {
  /** 回合内已流逝 ms（移动板相位 / 动画用）。 */
  t: number
  seed: number
  /** 世界坐标：x / y，速度 vx / vy（向上为负）。 */
  x: number
  y: number
  vx: number
  vy: number
  /** 屏幕顶部的世界 y（只减不增 = 只向上卷动）。 */
  cameraY: number
  phase: JumperPhase
  /** 已碎裂的易碎板段号集合。 */
  broken: Set<number>
  /** 最近一次触板的 t（挤压动画用）。 */
  lastBounceT: number
  events: JumperEvent[]
}

/**
 * 新开一局：小家伙站上出生平台并立即起跳。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export function createJumper(seed: number): JumperState {
  const start = platformAt(seed, 0)
  return {
    t: 0,
    seed,
    x: W / 2,
    y: start.y - PLAYER_HALF,
    vx: 0,
    vy: -BOUNCE_VY,
    cameraY: start.y + PLAYER_HALF - H + 60,
    phase: 'playing',
    broken: new Set<number>(),
    lastBounceT: -SQUASH_MS,
    events: [],
  }
}

/**
 * 当前高度分（1 分 ≈ 10px 攀升，出生高度为 0）。
 * @param state - 当前状态。
 * @returns 高度分。
 */
export function heightScore(state: JumperState): number {
  return Math.max(0, Math.floor((BASE_Y - state.y) / 10))
}

/**
 * 推进一帧：横向惯性、重力、平台碰撞（单向：仅下落时踩板；尖刺板
 * 任意方向接触即结束）、摄像机上移与掉落判定。事件写入 state.events，
 * 每帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export function stepJumper(state: JumperState, dtMs: number, input: JumperInput): void {
  state.events.length = 0
  if (state.phase !== 'playing') return
  const dt = dtMs / 1000
  state.t += dtMs

  // 横向：按住加速，松手阻尼滑行，速度封顶。
  if (input.left && !input.right) state.vx -= LATERAL_ACC * dt
  else if (input.right && !input.left) state.vx += LATERAL_ACC * dt
  else state.vx *= Math.max(0, 1 - LATERAL_DAMP * dt)
  state.vx = Math.max(-MAX_VX, Math.min(MAX_VX, state.vx))

  const prevBottom = state.y + PLAYER_HALF
  state.vy += GRAVITY * dt
  state.x += state.vx * dt
  state.y += state.vy * dt

  // 侧壁：贴边停住（不掉出画布）。
  if (state.x < PLAYER_HALF) {
    state.x = PLAYER_HALF
    state.vx = 0
  } else if (state.x > W - PLAYER_HALF) {
    state.x = W - PLAYER_HALF
    state.vx = 0
  }

  // 与附近平台段碰撞。
  const bottom = state.y + PLAYER_HALF
  const [lo, hi] = indexRangeFor(state.y - PLAYER_HALF * 2, bottom + 4)
  for (let i = lo; i <= hi; i += 1) {
    const platform = platformAt(state.seed, i)
    if (state.broken.has(i)) continue
    const px = platformX(platform, state.t)
    const overlapX = state.x + PLAYER_HALF - 2 > px && state.x - PLAYER_HALF + 2 < px + platform.w
    if (!overlapX) continue
    if (platform.kind === 'spiky') {
      // 尖刺板：任意方向碰到即结束（刺高按 4px 内缩）。
      if (bottom >= platform.y - 4 && state.y - PLAYER_HALF <= platform.y + 10) {
        state.phase = 'dead'
        state.events.push({ type: 'spike', x: state.x, y: platform.y })
        return
      }
      continue
    }
    // 其余平台单向：仅下落且上一帧底边在板上方时踩板反弹。
    if (state.vy > 0 && prevBottom <= platform.y + 6 && bottom >= platform.y) {
      state.y = platform.y - PLAYER_HALF
      state.vy = -BOUNCE_VY
      state.lastBounceT = state.t
      if (platform.kind === 'crumbly') {
        state.broken.add(i)
        state.events.push({ type: 'break', x: px + platform.w / 2, y: platform.y })
      } else {
        state.events.push({ type: 'bounce', x: state.x, y: platform.y, kind: platform.kind })
      }
    }
  }

  // 摄像机：只向上跟随（把小家伙维持在屏幕中下部附近）。
  const desired = state.y - H * 0.62
  if (desired < state.cameraY) state.cameraY = desired

  // 向下掉出屏幕 = 结束（1 命）。
  if (state.y - PLAYER_HALF > state.cameraY + H + 24) {
    state.phase = 'dead'
    state.events.push({ type: 'fall', x: state.x, y: state.cameraY + H })
  }
}
