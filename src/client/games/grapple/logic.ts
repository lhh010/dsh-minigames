/**
 * 钩荡忍者（Grapple）纯逻辑：横版卷轴关卡，忍者借天花板锚点群钩索摆荡
 * 前进——按住 = 朝限定半径内、位于上前方的最近锚点发射钩索并绳摆（绳长
 * 固定 = 发射时距离，摆动用极坐标半隐式欧拉积分：重力沿绳切向投影加速
 * 角速度，径向由绳长硬约束）；松开 = 以当前切向速度惯性抛物线飞行。
 * 触尖刺墙或坠出屏幕底部 = 死亡回段首（每 SEG_LEN 一段）；触达终点旗
 * 过关，共 5 关递进（锚点更稀、尖刺更多），分数 = 前进距离。全部函数
 * 确定性可测：随机只出现在 seed+关卡的世界生成里；时间单位毫秒，物理
 * 单位 px / s，坐标 y 向下增大。
 */

/** 逻辑画布尺寸。 */
export const W = 640
export const H = 360

/** 重力加速度 px/s^2。 */
export const GRAVITY = 1400
/** 忍者碰撞半径 px。 */
export const PLAYER_R = 10
/** 钩索发射半径 px（超出不予吸附）。 */
export const HOOK_RANGE = 330
/** 锚点吸附半径 px（圆形判定，渲染发光圈同尺寸）。 */
export const ANCHOR_R = 14
/** 固定物理子步 ms（确定性：所有推进都切成本子步）。 */
export const SUB_MS = 5
/** 每段（检查点）长度 px，死亡回段首。 */
export const SEG_LEN = 800
/** 总关卡数。 */
export const LEVELS = 5
/** 死亡展示 ms。 */
export const DEAD_MS = 900
/** 过关展示 ms。 */
export const CLEAR_MS = 1500
/** 下坠超出屏幕底部的死亡余量 px。 */
export const FALL_MARGIN = 60
/** 速度上限 px/s（防爆数值）。 */
export const V_MAX = 1600

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

/** 天花板锚点（圆形，钩索只吸附锚点）。 */
export interface Anchor {
  x: number
  y: number
}

/** 尖刺墙（轴对齐矩形，从底部立起）。 */
export interface Spike {
  x: number
  y: number
  w: number
  h: number
}

/** 一关的世界数据（seed+关卡号确定性生成）。 */
export interface GrappleWorld {
  /** 关卡总长度 px（终点旗在 goalX）。 */
  goalX: number
  anchors: Anchor[]
  spikes: Spike[]
}

/**
 * 生成某一关的世界（seed+level 确定性；关卡越高锚点越稀、尖刺越多）。
 * 尖刺避开各段首（出生点）左右 100px，保证重生不被秒杀。
 * @param seed - 外部种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 世界数据。
 */
export function generateWorld(seed: number, level: number): GrappleWorld {
  const rng = mulberry32((Math.floor(seed) * 977 + level * 131) >>> 0)
  const goalX = 2600 + level * 500
  // 锚点水平间距：前两关密集好上手（110px 起），第 3 关起走 150px 斜率——
// 开局钩点够密容错高，后期才考验释放时机。
  const spacing = level <= 2 ? 110 + (level - 1) * 20 : 150 + (level - 1) * 15
  // 锚点高度带随关卡抬升：第 1 关低垂好够（86~186px），第 3 关起回到
  // 高位天花板（36~132px）考验摆荡衔接。
  const yBase = level === 1 ? 86 : level === 2 ? 60 : 36
  const ySpan = level === 1 ? 100 : 96
  const anchors: Anchor[] = []
  for (let x = 140; x < goalX - 80; x += spacing * (0.85 + rng() * 0.3)) {
    anchors.push({ x, y: yBase + rng() * ySpan })
  }
  // 终点前保底一个锚点。
  anchors.push({ x: goalX - 60, y: 60 + rng() * 60 })
  // 每个重生点（段首 +40px）前方保底一个可够到的锚点——防止复活后
  // 无钩可发直接坠死的挫败循环。
  for (let seg = 0; seg * SEG_LEN < goalX - 200; seg += 1) {
    const sx = seg * SEG_LEN + 40
    const covered = anchors.some(a => a.x > sx && a.x < sx + 240)
    if (!covered) anchors.push({ x: sx + 130, y: yBase + rng() * 60 })
  }
  anchors.sort((a, b) => a.x - b.x)
  // 尖刺墙：数量随关卡增长，宽度 16px，高度 60~200px。第 1 关少一截热身。
  const spikeCount = 2 + level * 3
  const spikes: Spike[] = []
  let guard = 0
  while (spikes.length < spikeCount && guard < spikeCount * 40) {
    guard += 1
    const x = 260 + rng() * (goalX - 420)
    const nearSpawn = Math.abs(((x / SEG_LEN) - Math.round(x / SEG_LEN)) * SEG_LEN) < 1
      ? true
      : Math.abs(x - (Math.round(x / SEG_LEN) * SEG_LEN + 40)) < 100
    const tooClose = spikes.some((s) => Math.abs(s.x - x) < 120)
    if (nearSpawn || tooClose) continue
    const h = 60 + rng() * 140
    spikes.push({ x: x - 8, y: H - h, w: 16, h })
  }
  return { goalX, anchors, spikes }
}

/** 帧输入：是否按住（发射 / 保持钩索）。 */
export interface GrappleInput {
  hold: boolean
}

/** 阶段：飞行（含绳摆）/ 死亡展示 / 过关展示 / 全通关。 */
export type GrapplePhase = 'flying' | 'dead' | 'clear' | 'win'

/** 单步内产生、供渲染层消费的可视事件。 */
export type GrappleEvent =
  | { type: 'attach', x: number, y: number }
  | { type: 'death', x: number, y: number }
  | { type: 'goal', x: number, y: number }

/** 一局游戏的完整可测状态。 */
export interface GrappleState {
  /** 回合内已流逝 ms。 */
  t: number
  seed: number
  level: number
  /** 已通关关卡累计的距离 px（分数跨关累加）。 */
  baseDistance: number
  /** 本关最远前进距离 px。 */
  maxX: number
  deaths: number
  x: number
  y: number
  vx: number
  vy: number
  /** 钩索：吸附的锚点下标，-1 = 未吸附。 */
  anchorIdx: number
  /** 吸附锚点坐标（发射时快照，摆动积分用）。 */
  anchorX: number
  anchorY: number
  /** 绳长 px（发射时距离，固定不变）。 */
  ropeLen: number
  /** 摆角 rad（从锚点看玩家，+x 起算，y 向下）。 */
  phi: number
  /** 角速度 rad/s。 */
  omega: number
  phase: GrapplePhase
  /** 阶段停留剩余 ms。 */
  phaseMs: number
  world: GrappleWorld
  events: GrappleEvent[]
  /** 子步累加器 ms（固定子步保证确定性）。 */
  accMs: number
}

/**
 * 把玩家放到某段出生点（新关或死亡重生）。
 * @param state - 目标状态。
 * @param startX - 出生 x。
 */
function respawnAt(state: GrappleState, startX: number): void {
  state.x = startX
  state.y = 150
  state.vx = 60
  state.vy = 0
  state.anchorIdx = -1
  state.anchorX = 0
  state.anchorY = 0
  state.ropeLen = 0
  state.phi = 0
  state.omega = 0
}

/**
 * 新开一局（level 1）。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export function createGrapple(seed: number): GrappleState {
  const state: GrappleState = {
    t: 0,
    seed,
    level: 1,
    baseDistance: 0,
    maxX: 0,
    deaths: 0,
    x: 40,
    y: 150,
    vx: 60,
    vy: 0,
    anchorIdx: -1,
    anchorX: 0,
    anchorY: 0,
    ropeLen: 0,
    phi: 0,
    omega: 0,
    phase: 'flying',
    phaseMs: 0,
    world: generateWorld(seed, 1),
    events: [],
    accMs: 0,
  }
  return state
}

/** 当前总分（前进距离，米 = px/10，跨关累加）。 */
export function grappleScore(state: GrappleState): number {
  return Math.floor((state.baseDistance + state.maxX) / 10)
}

/**
 * 摆动机械能（单位质量）：0.5*(omega*L)^2 + g*L*sin(phi)。
 * 仅用于测试近似能量守恒。
 * @param state - 当前状态（需处于吸附摆动态）。
 * @returns 机械能。
 */
export function pendulumEnergy(state: GrappleState): number {
  const v = state.omega * state.ropeLen
  return 0.5 * v * v + GRAVITY * state.ropeLen * Math.sin(state.phi)
}

/**
 * 测试辅助：把状态直接摆到锚点 (ax,ay) 上、摆角 phi、角速度 omega。
 * @param state - 目标状态。
 * @param ax - 锚点 x。
 * @param ay - 锚点 y。
 * @param phi - 初始摆角 rad。
 * @param omega - 初始角速度 rad/s。
 */
export function forceAttach(state: GrappleState, ax: number, ay: number, phi: number, omega: number): void {
  const len = 180
  state.anchorIdx = -2
  state.anchorX = ax
  state.anchorY = ay
  state.ropeLen = len
  state.phi = phi
  state.omega = omega
  state.x = ax + len * Math.cos(phi)
  state.y = ay + len * Math.sin(phi)
  const vt = omega * len
  state.vx = -Math.sin(phi) * vt
  state.vy = Math.cos(phi) * vt
}

/**
 * 圆与轴对齐矩形是否相交。
 * @param cx - 圆心 x。
 * @param cy - 圆心 y。
 * @param r - 圆半径。
 * @param s - 矩形。
 * @returns 相交返回 true。
 */
function circleHitsSpike(cx: number, cy: number, r: number, s: Spike): boolean {
  const px = Math.max(s.x, Math.min(cx, s.x + s.w))
  const py = Math.max(s.y, Math.min(cy, s.y + s.h))
  const dx = cx - px
  const dy = cy - py
  return dx * dx + dy * dy <= r * r
}

/**
 * 尝试吸附：在 HOOK_RANGE 内、位于玩家上前方（锚点高于玩家且不在身后
 * 太远）的锚点里挑最近的一个。命中时绳长 = 当前距离，切向速度换算成
 * 角速度。
 * @param state - 目标状态。
 */
function tryAttach(state: GrappleState): void {
  let best = -1
  let bestD = HOOK_RANGE
  for (let i = 0; i < state.world.anchors.length; i += 1) {
    const a = state.world.anchors[i]!
    const dx = a.x - state.x
    const dy = a.y - state.y
    // 角度朝上前方（放宽容错）：锚点大致在玩家上方、允许落后 90px
    // 或略低于玩家——开局衔接不再苛刻。
    if (dy > -28 || dx < -90) continue
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  if (best < 0) return
  const a = state.world.anchors[best]!
  state.anchorIdx = best
  state.anchorX = a.x
  state.anchorY = a.y
  state.ropeLen = bestD
  state.phi = Math.atan2(state.y - a.y, state.x - a.x)
  // 切向单位向量 t = (-sin phi, cos phi)，角速度 = 切向速度 / 绳长。
  const vt = -Math.sin(state.phi) * state.vx + Math.cos(state.phi) * state.vy
  state.omega = vt / bestD
  state.events.push({ type: 'attach', x: a.x, y: a.y })
}

/**
 * 结算死亡：进 dead 阶段，记一次死亡。
 * @param state - 目标状态。
 */
function die(state: GrappleState): void {
  state.deaths += 1
  state.phase = 'dead'
  state.phaseMs = DEAD_MS
  state.anchorIdx = -1
  state.events.push({ type: 'death', x: state.x, y: state.y })
}

/**
 * 单个固定子步：吸附尝试 / 绳摆极坐标积分 / 惯性抛物线 / 碰撞与过关。
 * @param state - 目标状态。
 * @param dt - 子步秒（固定 SUB_MS/1000）。
 * @param input - 当前输入。
 */
function substep(state: GrappleState, dt: number, input: GrappleInput): void {
  if (state.phase !== 'flying') {
    state.phaseMs -= dt * 1000
    if (state.phaseMs <= 0) {
      if (state.phase === 'dead') {
        // 回段首：按死亡时的 x 算所在段，重生在该段起点。
        const seg = Math.max(0, Math.floor(state.x / SEG_LEN))
        state.phase = 'flying'
        state.phaseMs = 0
        respawnAt(state, seg * SEG_LEN + 40)
      } else if (state.phase === 'clear') {
        if (state.level >= LEVELS) {
          state.phase = 'win'
          state.phaseMs = 0
        } else {
          state.baseDistance += state.world.goalX
          state.level += 1
          state.world = generateWorld(state.seed, state.level)
          state.maxX = 0
          state.phase = 'flying'
          state.phaseMs = 0
          respawnAt(state, 40)
        }
      }
    }
    return
  }

  if (state.anchorIdx === -1) {
    // 自由抛物线：重力 + 位移。
    state.vy = Math.min(V_MAX, state.vy + GRAVITY * dt)
    state.x += state.vx * dt
    state.y += state.vy * dt
    if (input.hold) tryAttach(state)
  } else {
    // 绳摆：omega += (g*cos phi / L) * dt；phi += omega * dt（半隐式）。
    const ax = state.anchorX
    const ay = state.anchorY
    state.omega += (GRAVITY * Math.cos(state.phi) / state.ropeLen) * dt
    state.phi += state.omega * dt
    state.x = ax + state.ropeLen * Math.cos(state.phi)
    state.y = ay + state.ropeLen * Math.sin(state.phi)
    const vt = state.omega * state.ropeLen
    state.vx = -Math.sin(state.phi) * vt
    state.vy = Math.cos(state.phi) * vt
    if (!input.hold) state.anchorIdx = -1
  }

  // 顶部软限制。
  if (state.y < PLAYER_R) {
    state.y = PLAYER_R
    if (state.vy < 0) state.vy = 0
  }

  state.maxX = Math.max(state.maxX, state.x)

  // 致命判定：尖刺或坠出底部。
  if (state.y > H + FALL_MARGIN) {
    die(state)
    return
  }
  for (const s of state.world.spikes) {
    if (circleHitsSpike(state.x, state.y, PLAYER_R, s)) {
      die(state)
      return
    }
  }

  // 终点旗。
  if (state.x >= state.world.goalX) {
    state.phase = 'clear'
    state.phaseMs = CLEAR_MS
    state.anchorIdx = -1
    state.events.push({ type: 'goal', x: state.x, y: state.y })
  }
}

/**
 * 推进一帧：把 dtMs 切成固定 SUB_MS 子步（余量进累加器），事件写入
 * state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export function stepGrapple(state: GrappleState, dtMs: number, input: GrappleInput): void {
  state.events.length = 0
  state.t += dtMs
  state.accMs += Math.max(0, dtMs)
  const dt = SUB_MS / 1000
  while (state.accMs >= SUB_MS) {
    state.accMs -= SUB_MS
    substep(state, dt, input)
  }
}
