/**
 * 重力翻转（Gravity Flip）纯逻辑：横版自动前进跑酷。角色固定在屏幕
 * PLAYER_X 处，世界以随距离递增的速度向左滚动；一次翻转输入反转重力
 * 方向，角色在地板与天花板两条轨道之间下坠并贴附到当前重力侧。障碍由
 * seed+段号确定性生成：地面 / 天花板尖刺、带窄窗的屏障墙（需空中二连
 * 翻微调才能穿过）、按固定周期相位发射的垂直激光。撞尖刺 / 屏障 / 发射
 * 中的激光即死；距离即分数。物理按固定 SUBSTEP_MS 子步推进（累积器
 * 模式），同种子同输入完全可重放。时间单位毫秒，物理单位 px / s。
 */

/** 逻辑画布尺寸（横版走廊）。 */
export const W = 720
export const H = 320
/** 上下发光轨道的厚度：天花板下缘 y=CEIL_BOT，地板上缘 y=FLOOR_TOP。 */
export const TRACK = 26
export const CEIL_BOT = TRACK
export const FLOOR_TOP = H - TRACK
/** 角色固定屏幕横坐标（世界滚动，角色不动）。 */
export const PLAYER_X = 150
/** 角色渲染半宽 / 半高。 */
export const PLAYER_HW = 8
export const PLAYER_HH = 11
/** 角色判定半宽 / 半高（略小于外观，判定宽容）。 */
export const HIT_HW = 7
export const HIT_HH = 9
/** 重力加速度 px/s^2（两侧同值）。 */
export const G = 2300
/** 滚动速度：随距离线性递增并封顶。 */
export const SPEED_BASE = 250
export const SPEED_GAIN = 0.03
export const SPEED_MAX = 540
/** 固定物理子步 ms（确定性保证）。 */
export const SUBSTEP_MS = 8
/** 尖刺带高度与单个尖刺宽度。 */
export const SPIKE_H = 26
export const SPIKE_W = 18
/** 屏障墙厚度。 */
export const BARRIER_W = 16
/** 屏障窗口最小高度（生成器保证可通过）。 */
export const MIN_WINDOW = 86
/** 激光参数：周期 / 发射时长 / 预警时长 / 光束宽 / 覆盖高度。 */
export const LASER_PERIOD = 2100
export const LASER_FIRE_MS = 520
export const LASER_WARN_MS = 600
export const LASER_W = 7
export const LASER_H = 120
/** 障碍段长度（世界坐标，按段号生成）。 */
export const SEG_LEN = 300
/** 翻转旋转动画时长 ms（渲染层用）。 */
export const FLIP_ANIM_MS = 220

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

/**
 * 当前滚动速度 px/s：随距离线性递增并封顶。
 * @param dist - 已滚动距离 px。
 * @returns 当前速度。
 */
export function speedOf(dist: number): number {
  return Math.min(SPEED_MAX, SPEED_BASE + dist * SPEED_GAIN)
}

/** 障碍物（世界坐标）。 */
export type Obstacle =
  | { type: 'spikes', side: 'bottom' | 'top', x1: number, x2: number }
  | { type: 'barrier', x: number, oy1: number, oy2: number }
  | { type: 'laser', x: number, side: 'bottom' | 'top', phase: number }

/** 单步内产生、供渲染层消费的可视事件。 */
export type GravFlipEvent =
  | { type: 'flip' }
  | { type: 'die', x: number, y: number, cause: 'spikes' | 'barrier' | 'laser' }

/** 残影采样点（渲染层按序淡出绘制）。 */
export interface TrailPoint { y: number, dir: number }

/** 一局游戏的完整可测状态（纯数据，可结构化克隆）。 */
export interface GravFlipState {
  /** 回合内已流逝 ms（激光相位钟）。 */
  t: number
  seed: number
  /** 已滚动距离 px（世界坐标基准）。 */
  dist: number
  /** 分数 = floor(dist / 10)。 */
  score: number
  /** 重力方向：1 = 向下（地板），-1 = 向上（天花板）。 */
  dir: number
  /** 角色中心 y。 */
  y: number
  vy: number
  phase: 'running' | 'dead'
  /** 死因（死亡时写入）。 */
  cause: 'spikes' | 'barrier' | 'laser' | null
  /** 距上次翻转的 ms（渲染旋转动画）。 */
  flipT: number
  /** 固定子步累积器 ms。 */
  acc: number
  /** 已生成到的段号（不含）。 */
  genIndex: number
  /** 当前活跃障碍（已裁剪过期段）。 */
  obstacles: Obstacle[]
  events: GravFlipEvent[]
  trail: TrailPoint[]
}

/**
 * 生成某段的障碍（seed+段号确定性）。前两段留空作起步缓冲；之后按
 * 随机权重生成尖刺带 / 激光 / 带窗屏障，屏障窗口高度与位置满足可通过
 * 保证（高 ≥ MIN_WINDOW，中心处于走廊中部可达带内）。
 * @param seed - 外部种子。
 * @param index - 段号（从 0 起）。
 * @returns 该段障碍列表（可能为空）。
 */
export function genSegment(seed: number, index: number): Obstacle[] {
  if (index < 2) return []
  const rng = mulberry32((Math.floor(seed) * 7919 + index * 104729) >>> 0)
  const side: 'bottom' | 'top' = rng() < 0.5 ? 'bottom' : 'top'
  const r = rng()
  if (r < 0.36) {
    const len = 60 + rng() * 90
    const x1 = index * SEG_LEN + 80 + rng() * (SEG_LEN - 200)
    return [{ type: 'spikes', side, x1, x2: x1 + len }]
  }
  if (r < 0.68) {
    const x = index * SEG_LEN + 80 + rng() * (SEG_LEN - 160)
    const phase = Math.floor(rng() * LASER_PERIOD)
    return [{ type: 'laser', x, side, phase }]
  }
  const x = index * SEG_LEN + 120 + rng() * (SEG_LEN - 240)
  const h = MIN_WINDOW + rng() * 40
  const halfBand = H / 2 - TRACK - h / 2 - 30
  const center = H / 2 + (rng() * 2 - 1) * halfBand
  return [{ type: 'barrier', x, oy1: center - h / 2, oy2: center + h / 2 }]
}

/**
 * 激光在时刻 t 是否处于发射态（相位决定错峰）。
 * @param t - 回合内时刻 ms。
 * @param phase - 该激光的相位偏移 ms。
 * @returns true 表示正在发射。
 */
export function laserFiring(t: number, phase: number): boolean {
  return ((t + phase) % LASER_PERIOD) < LASER_FIRE_MS
}

/**
 * 激光在时刻 t 是否处于预警态（即将发射）。
 * @param t - 回合内时刻 ms。
 * @param phase - 该激光的相位偏移 ms。
 * @returns true 表示预警中。
 */
export function laserWarn(t: number, phase: number): boolean {
  if (laserFiring(t, phase)) return false
  const remain = LASER_PERIOD - ((t + phase) % LASER_PERIOD)
  return remain < LASER_WARN_MS
}

/**
 * 角色当前世界横坐标。
 * @param state - 当前状态。
 * @returns 世界 x。
 */
export function playerWorldX(state: GravFlipState): number {
  return state.dist + PLAYER_X
}

/** 障碍在世界坐标上的右端（裁剪用）。 */
function obstacleEnd(ob: Obstacle): number {
  if (ob.type === 'spikes') return ob.x2
  if (ob.type === 'barrier') return ob.x + BARRIER_W
  return ob.x + LASER_W
}

/**
 * 角色判定盒是否与某障碍相撞（激光仅在发射态判定）。
 * @param state - 当前状态。
 * @param ob - 待检测障碍。
 * @returns true 表示命中。
 */
export function hitObstacle(state: GravFlipState, ob: Obstacle): boolean {
  const px = playerWorldX(state)
  const x1 = px - HIT_HW
  const x2 = px + HIT_HW
  const y1 = state.y - HIT_HH
  const y2 = state.y + HIT_HH
  if (ob.type === 'spikes') {
    if (x2 < ob.x1 || x1 > ob.x2) return false
    return ob.side === 'bottom'
      ? y2 > FLOOR_TOP - SPIKE_H
      : y1 < CEIL_BOT + SPIKE_H
  }
  if (ob.type === 'barrier') {
    if (x2 < ob.x || x1 > ob.x + BARRIER_W) return false
    // 窗口安全条件：判定盒完全落在窗口内。
    return !(y1 >= ob.oy1 && y2 <= ob.oy2)
  }
  if (x2 < ob.x || x1 > ob.x + LASER_W) return false
  if (!laserFiring(state.t, ob.phase)) return false
  return ob.side === 'bottom'
    ? y2 > FLOOR_TOP - LASER_H
    : y1 < CEIL_BOT + LASER_H
}

/**
 * 新开一局：角色贴地板起跑。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export function createGravFlip(seed: number): GravFlipState {
  const state: GravFlipState = {
    t: 0,
    seed,
    dist: 0,
    score: 0,
    dir: 1,
    y: FLOOR_TOP - PLAYER_HH,
    vy: 0,
    phase: 'running',
    cause: null,
    flipT: FLIP_ANIM_MS,
    acc: 0,
    genIndex: 0,
    obstacles: [],
    events: [],
    trail: [],
  }
  return state
}

/** 生成前方缺失段并裁剪身后过期障碍。 */
function ensureSegments(state: GravFlipState): void {
  const ahead = state.dist + W + 200
  while (state.genIndex * SEG_LEN < ahead) {
    state.obstacles.push(...genSegment(state.seed, state.genIndex))
    state.genIndex += 1
  }
  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    if (obstacleEnd(state.obstacles[i]!) < state.dist - 120) state.obstacles.splice(i, 1)
  }
}

/**
 * 死亡结算（冻结距离与分数）。
 * @param state - 目标状态。
 * @param cause - 死因。
 */
function die(state: GravFlipState, cause: 'spikes' | 'barrier' | 'laser'): void {
  state.phase = 'dead'
  state.cause = cause
  state.events.push({ type: 'die', x: PLAYER_X, y: state.y, cause })
}

/**
 * 推进一帧：把 dtMs 攒进累积器，按固定 8ms 子步确定性推进（翻转只在
 * 首个子步生效一次）；每个子步内完成重力、滚动、贴附、障碍生成与碰撞。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms（超量部分按子步粒度处理，不撕裂物理）。
 * @param flipPressed - 本帧是否按下了翻转。
 */
export function stepGravFlip(state: GravFlipState, dtMs: number, flipPressed: boolean): void {
  state.events.length = 0
  if (state.phase === 'dead') return
  state.acc += Math.max(0, dtMs)
  let flipped = false
  while (state.acc >= SUBSTEP_MS && state.phase === 'running') {
    state.acc -= SUBSTEP_MS
    substep(state, flipPressed && !flipped)
    flipped = true
  }
}

/**
 * 单个固定子步。
 * @param state - 目标状态。
 * @param doFlip - 本子步是否执行翻转。
 */
function substep(state: GravFlipState, doFlip: boolean): void {
  const dt = SUBSTEP_MS / 1000
  state.t += SUBSTEP_MS
  if (doFlip) {
    state.dir = -state.dir
    state.flipT = 0
    state.events.push({ type: 'flip' })
  } else {
    state.flipT += SUBSTEP_MS
  }
  const speed = speedOf(state.dist)
  state.dist += speed * dt
  state.vy += state.dir * G * dt
  state.y += state.vy * dt
  // 贴附当前重力侧轨道（越程截断）。
  if (state.y + PLAYER_HH >= FLOOR_TOP) {
    state.y = FLOOR_TOP - PLAYER_HH
    state.vy = 0
  } else if (state.y - PLAYER_HH <= CEIL_BOT) {
    state.y = CEIL_BOT + PLAYER_HH
    state.vy = 0
  }
  ensureSegments(state)
  const cause = state.obstacles.find((ob) => hitObstacle(state, ob))
  if (cause !== undefined) {
    die(state, cause.type)
    return
  }
  state.trail.push({ y: state.y, dir: state.dir })
  if (state.trail.length > 14) state.trail.shift()
  state.score = Math.floor(state.dist / 10)
}
