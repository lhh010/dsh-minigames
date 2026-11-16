/**
 * 引力弹弓 Orbit 纯逻辑：轨道规划谜题。探针从空间站以玩家选择的初始
 * 速度发射，受所有行星平方反比引力（半刚性积分子步，固定 1/240 s），
 * 经过信标半径内过关；撞行星 / 小行星或飞出边界失败。5 关递进，每关
 * 预录参考解（重放验证）。全部函数确定性可测：同参数同轨迹位级一致，
 * 时间倍速只改变每帧执行的子步数、不改变轨迹；所有随机走注入 seed。
 */

/** 逻辑画布尺寸。 */
export const W = 640
export const H = 480
/** 固定积分子步秒长：所有轨迹按此离散步进，保证位级可重放。 */
export const SUB_DT = 1 / 240
/** 单次飞行最大子步数（15 s），超时判漂失。 */
export const MAX_FLIGHT_SUBSTEPS = 3600
/** 探针碰撞半径 px。 */
export const PROBE_RADIUS = 4
/** 撞击判定额外余量 px。 */
export const COLLIDE_PAD = 3
/** 出界余量：探针越出画布外该距离判失败。 */
export const BOUNDS_MARGIN = 60
/** 引力常数（配合行星质量量级，px/s^2 = G * mass / r^2）。 */
export const G = 4200
/** 引力软化下限：距离小于该值按该值算，避免近场数值爆炸。 */
export const MIN_R = 24
/** 发射最小速度 px/s（低于则不发射）。 */
export const MIN_LAUNCH_SPEED = 40
/** 过关 / 失败后阶段停留 ms（之后自动进入下一关 / 回到瞄准）。 */
export const PHASE_MS = 1800

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

/** 一颗行星：位置、质量（引力强度）与碰撞半径。 */
export interface Planet {
  x: number
  y: number
  mass: number
  radius: number
}

/** 一块小行星带障碍：圆形碰撞体（无引力）。 */
export interface Asteroid {
  x: number
  y: number
  radius: number
}

/** 一关的完整盘面数据。 */
export interface OrbitLevel {
  /** 关卡名（HUD 显示）。 */
  name: string
  planets: Planet[]
  asteroids: Asteroid[]
  /** 起点空间站。 */
  station: { x: number, y: number }
  /** 目标信标与捕获半径。 */
  beacon: { x: number, y: number, radius: number }
  /** 预录参考解：初始速度向量（重放验证过关）。 */
  refVx: number
  refVy: number
}

/** 5 关手工递进：单行星绕后 → 双行星接力 → 窄缝穿行 → 逆行减速捕获 → 多重弹弓链。 */
export const LEVELS: OrbitLevel[] = [
  {
    name: '1 · 单行星绕后',
    planets: [{ x: 320, y: 240, mass: 520, radius: 34 }],
    asteroids: [],
    station: { x: 80, y: 240 },
    beacon: { x: 556, y: 240, radius: 26 },
    refVx: 210.1,
    refVy: -93.5,
  },
  {
    name: '2 · 双行星接力',
    planets: [
      { x: 210, y: 150, mass: 420, radius: 26 },
      { x: 430, y: 330, mass: 420, radius: 26 },
    ],
    asteroids: [
      { x: 320, y: 240, radius: 12 },
      { x: 350, y: 205, radius: 9 },
      { x: 292, y: 276, radius: 8 },
    ],
    station: { x: 60, y: 410 },
    beacon: { x: 580, y: 110, radius: 24 },
    refVx: 10.5,
    refVy: -149.6,
  },
  {
    name: '3 · 窄缝穿行',
    planets: [
      { x: 320, y: 132, mass: 360, radius: 42 },
      { x: 320, y: 348, mass: 360, radius: 42 },
    ],
    asteroids: [
      { x: 470, y: 160, radius: 10 },
      { x: 470, y: 320, radius: 10 },
    ],
    station: { x: 60, y: 240 },
    beacon: { x: 580, y: 240, radius: 20 },
    refVx: 140,
    refVy: 0,
  },
  {
    name: '4 · 逆行减速捕获',
    planets: [{ x: 330, y: 250, mass: 950, radius: 40 }],
    asteroids: [],
    station: { x: 600, y: 420 },
    beacon: { x: 402, y: 96, radius: 18 },
    refVx: -24.3,
    refVy: -137.9,
  },
  {
    name: '5 · 多重弹弓链',
    planets: [
      { x: 150, y: 130, mass: 340, radius: 24 },
      { x: 316, y: 244, mass: 400, radius: 26 },
      { x: 482, y: 352, mass: 340, radius: 24 },
    ],
    asteroids: [
      { x: 240, y: 330, radius: 9 },
      { x: 410, y: 160, radius: 9 },
    ],
    station: { x: 44, y: 424 },
    beacon: { x: 596, y: 60, radius: 20 },
    refVx: 251.8,
    refVy: -243.1,
  },
]

/**
 * 计算一点处的多体引力加速度（平方反比，软化下限 MIN_R）。
 * @param level - 关卡数据。
 * @param x - 位置 x px。
 * @param y - 位置 y px。
 * @returns 加速度 { ax, ay } px/s^2。
 */
export function gravityAt(level: OrbitLevel, x: number, y: number): { ax: number, ay: number } {
  let ax = 0
  let ay = 0
  for (const p of level.planets) {
    const dx = p.x - x
    const dy = p.y - y
    const d2 = dx * dx + dy * dy
    const d = Math.sqrt(d2)
    const r = Math.max(d, MIN_R)
    const a = (G * p.mass) / (r * r)
    if (d > 0.0001) {
      ax += (dx / d) * a
      ay += (dy / d) * a
    }
  }
  return { ax, ay }
}

/** 探针状态。 */
export interface Probe {
  x: number
  y: number
  vx: number
  vy: number
}

/** 一次飞行的结局。 */
export type FlightResult = 'flying' | 'won' | 'crash' | 'out' | 'timeout'

/** 终局检测：信标捕获 / 行星小行星撞击 / 出界。 */
function terminalOf(level: OrbitLevel, p: Probe): FlightResult {
  const db = Math.hypot(p.x - level.beacon.x, p.y - level.beacon.y)
  if (db <= level.beacon.radius) return 'won'
  for (const pl of level.planets) {
    if (Math.hypot(p.x - pl.x, p.y - pl.y) <= pl.radius + PROBE_RADIUS + COLLIDE_PAD) return 'crash'
  }
  for (const a of level.asteroids) {
    if (Math.hypot(p.x - a.x, p.y - a.y) <= a.radius + PROBE_RADIUS + COLLIDE_PAD) return 'crash'
  }
  if (p.x < -BOUNDS_MARGIN || p.x > W + BOUNDS_MARGIN || p.y < -BOUNDS_MARGIN || p.y > H + BOUNDS_MARGIN) return 'out'
  return 'flying'
}

/**
 * 完整模拟一次发射（用于参考解验证 / 提示回放），逐子步确定性推进。
 * @param level - 关卡数据。
 * @param vx - 初始速度 x px/s。
 * @param vy - 初始速度 y px/s。
 * @param maxSubsteps - 子步上限（默认全程）。
 * @param recordEvery - 每隔多少子步记录一个轨迹点（0 不记录）。
 * @returns 结局、信标最小接近距离、子步数、轨迹点。
 */
export function simulateFlight(
  level: OrbitLevel, vx: number, vy: number,
  maxSubsteps = MAX_FLIGHT_SUBSTEPS, recordEvery = 0,
): { result: FlightResult, minDist: number, substeps: number, path: { x: number, y: number }[] } {
  const p: Probe = { x: level.station.x, y: level.station.y, vx, vy }
  let minDist = Math.hypot(p.x - level.beacon.x, p.y - level.beacon.y)
  const path: { x: number, y: number }[] = []
  let result: FlightResult = 'flying'
  let i = 0
  for (; i < maxSubsteps; i += 1) {
    const g = gravityAt(level, p.x, p.y)
    p.vx += g.ax * SUB_DT
    p.vy += g.ay * SUB_DT
    p.x += p.vx * SUB_DT
    p.y += p.vy * SUB_DT
    const d = Math.hypot(p.x - level.beacon.x, p.y - level.beacon.y)
    if (d < minDist) minDist = d
    if (recordEvery > 0 && (i + 1) % recordEvery === 0) path.push({ x: p.x, y: p.y })
    result = terminalOf(level, p)
    if (result !== 'flying') { i += 1; break }
  }
  if (result === 'flying') result = i >= maxSubsteps ? 'timeout' : 'flying'
  return { result, minDist, substeps: i, path }
}

/**
 * 发射前预测虚线：前 steps 个子步的探针位置（逐步供渲染衰减透明度）。
 * @param level - 关卡数据。
 * @param vx - 初始速度 x px/s。
 * @param vy - 初始速度 y px/s。
 * @param steps - 预测子步数（默认 60）。
 * @returns 轨迹点数组（遇终局提前截断）。
 */
export function predictPath(level: OrbitLevel, vx: number, vy: number, steps = 60): { x: number, y: number }[] {
  const sim = simulateFlight(level, vx, vy, steps, 1)
  return sim.path
}

/** 参考解整段回放（H 提示与关卡校验用）。 */
export function replayReference(level: OrbitLevel): { result: FlightResult, minDist: number, path: { x: number, y: number }[] } {
  const sim = simulateFlight(level, level.refVx, level.refVy, MAX_FLIGHT_SUBSTEPS, 4)
  return { result: sim.result, minDist: sim.minDist, path: sim.path }
}

/**
 * 校验一关数据合法性：几何不重叠、参考解重放确实过关。
 * @param level - 关卡数据。
 * @returns 错误列表（空数组即合法）。
 */
export function validateLevel(level: OrbitLevel): string[] {
  const errors: string[] = []
  const inBounds = (x: number, y: number): boolean => x >= 0 && x <= W && y >= 0 && y <= H
  for (const p of level.planets) {
    if (!inBounds(p.x, p.y)) errors.push('planet out of bounds: ' + p.x + ',' + p.y)
    if (p.mass <= 0 || p.radius <= 0) errors.push('planet mass/radius must be positive')
    if (Math.hypot(p.x - level.station.x, p.y - level.station.y) < p.radius + 30) errors.push('station inside planet')
    if (Math.hypot(p.x - level.beacon.x, p.y - level.beacon.y) < p.radius + level.beacon.radius + 6) errors.push('beacon overlaps planet')
  }
  for (const a of level.asteroids) {
    if (Math.hypot(a.x - level.station.x, a.y - level.station.y) < a.radius + 20) errors.push('station inside asteroid')
    if (Math.hypot(a.x - level.beacon.x, a.y - level.beacon.y) < a.radius + level.beacon.radius + 6) errors.push('beacon overlaps asteroid')
  }
  if (Math.hypot(level.station.x - level.beacon.x, level.station.y - level.beacon.y) < level.beacon.radius + 10) {
    errors.push('beacon overlaps station')
  }
  const replay = replayReference(level)
  if (replay.result !== 'won') errors.push('reference solution does not win: ' + replay.result)
  return errors
}

/** 游戏阶段。 */
export type OrbitPhase = 'aim' | 'flying' | 'won' | 'lost'

/** 一局运行时状态（含跨关卡累计）。 */
export interface OrbitState {
  /** 注入种子（渲染星空等用途，逻辑侧可复现）。 */
  seed: number
  levelIndex: number
  phase: OrbitPhase
  /** 本关已发射次数。 */
  launches: number
  /** 瞄准中的初始速度向量 px/s。 */
  aimVx: number
  aimVy: number
  /** 飞行中的探针（aim 阶段为 null）。 */
  probe: Probe | null
  /** 尾迹（每 4 子步一点，渐隐绘制）。 */
  trail: { x: number, y: number }[]
  /** 全关卡累计最佳（最小）接近距离 px，Infinity 表示尚无飞行。 */
  bestDistance: number
  /** 失败原因（lost 阶段有效）。 */
  lostReason: '' | 'crash' | 'out' | 'timeout'
  /** won/lost 阶段停留 ms（满 PHASE_MS 自动流转）。 */
  phaseMs: number
  /** 动画时钟 ms（脉冲等，不随倍速缩放）。 */
  timeMs: number
  /** 累计得分。 */
  score: number
  /** 提示开关（H 键）。 */
  hintVisible: boolean
  /** 时间倍速 1/2/4。 */
  speed: 1 | 2 | 4
  /** 5 关全部完成。 */
  allDone: boolean
  /** 子步累加器 ms（倍速换算入口，保证轨迹与倍速无关）。 */
  accMs: number
  /** 本次发射已飞行子步数（超时判漂失）。 */
  flownSubsteps: number
}

/**
 * 创建一局新状态。
 * @param seed - 注入种子。
 * @returns 初始状态（第 1 关、瞄准阶段）。
 */
export function createOrbit(seed: number): OrbitState {
  return {
    seed: seed >>> 0,
    levelIndex: 0,
    phase: 'aim',
    launches: 0,
    aimVx: 200,
    aimVy: 0,
    probe: null,
    trail: [],
    bestDistance: Infinity,
    lostReason: '',
    phaseMs: 0,
    timeMs: 0,
    score: 0,
    hintVisible: false,
    speed: 1,
    allDone: false,
    accMs: 0,
    flownSubsteps: 0,
  }
}

/** 当前关卡数据。 */
export function currentLevel(state: OrbitState): OrbitLevel {
  return LEVELS[Math.min(state.levelIndex, LEVELS.length - 1)]!
}

/**
 * 设定瞄准向量（发射前调用）。
 * @param state - 游戏状态。
 * @param vx - 初始速度 x px/s。
 * @param vy - 初始速度 y px/s。
 */
export function setAim(state: OrbitState, vx: number, vy: number): void {
  if (state.phase !== 'aim') return
  state.aimVx = vx
  state.aimVy = vy
}

/**
 * 发射：按瞄准向量从空间站射出探针。速度过低时不发射。
 * @param state - 游戏状态。
 * @returns 是否成功发射。
 */
export function launch(state: OrbitState): boolean {
  if (state.phase !== 'aim') return false
  if (Math.hypot(state.aimVx, state.aimVy) < MIN_LAUNCH_SPEED) return false
  const level = currentLevel(state)
  state.phase = 'flying'
  state.launches += 1
  state.probe = { x: level.station.x, y: level.station.y, vx: state.aimVx, vy: state.aimVy }
  state.trail = [{ x: level.station.x, y: level.station.y }]
  state.accMs = 0
  state.flownSubsteps = 0
  return true
}

/**
 * 推进一帧：倍速只放大每帧注入的模拟毫秒数，子步按累加器整数推进，
 * 因此任意倍速 / 任意分帧下轨迹位级一致。
 * @param state - 游戏状态。
 * @param dtMs - 帧时长 ms（建议 ≤ 50）。
 */
export function stepOrbit(state: OrbitState, dtMs: number): void {
  state.timeMs += dtMs
  if (state.phase === 'won' || state.phase === 'lost') {
    state.phaseMs += dtMs
    return
  }
  if (state.phase !== 'flying') return
  const level = currentLevel(state)
  const probe = state.probe
  if (probe === null) return
  state.accMs += dtMs * state.speed
  const subMs = SUB_DT * 1000
  while (state.accMs >= subMs && state.phase === 'flying') {
    state.accMs -= subMs
    const g = gravityAt(level, probe.x, probe.y)
    probe.vx += g.ax * SUB_DT
    probe.vy += g.ay * SUB_DT
    probe.x += probe.vx * SUB_DT
    probe.y += probe.vy * SUB_DT
    state.flownSubsteps += 1
    const d = Math.hypot(probe.x - level.beacon.x, probe.y - level.beacon.y)
    if (d < state.bestDistance) state.bestDistance = d
    const last = state.trail[state.trail.length - 1]!
    if (Math.hypot(probe.x - last.x, probe.y - last.y) > 3) {
      state.trail.push({ x: probe.x, y: probe.y })
      if (state.trail.length > 900) state.trail.shift()
    }
    const result = terminalOf(level, probe)
    if (result === 'won') {
      state.phase = 'won'
      state.phaseMs = 0
      const bonus = Math.max(200, 1000 - (state.launches - 1) * 150)
      state.score += bonus
    } else if (result === 'crash' || result === 'out') {
      state.phase = 'lost'
      state.lostReason = result
      state.phaseMs = 0
    } else if (state.flownSubsteps >= MAX_FLIGHT_SUBSTEPS) {
      state.phase = 'lost'
      state.lostReason = 'timeout'
      state.phaseMs = 0
    }
  }
}

/**
 * 失败后回到瞄准阶段（保留最佳距离与发射数）。
 * @param state - 游戏状态。
 */
export function retryLevel(state: OrbitState): void {
  state.phase = 'aim'
  state.probe = null
  state.trail = []
  state.lostReason = ''
  state.accMs = 0
  state.flownSubsteps = 0
}

/**
 * 过关后进入下一关；最后一关则标记 allDone 并停留在过关画面。
 * @param state - 游戏状态。
 */
export function advanceLevel(state: OrbitState): void {
  if (state.phase !== 'won' || state.allDone) return
  if (state.levelIndex >= LEVELS.length - 1) {
    state.allDone = true
    return
  }
  state.levelIndex += 1
  state.launches = 0
  state.phase = 'aim'
  state.probe = null
  state.trail = []
  state.accMs = 0
  state.flownSubsteps = 0
}

/**
 * 重开本关：发射数清零（R 键）。
 * @param state - 游戏状态。
 */
export function restartLevel(state: OrbitState): void {
  state.phase = 'aim'
  state.launches = 0
  state.probe = null
  state.trail = []
  state.lostReason = ''
  state.accMs = 0
  state.flownSubsteps = 0
}

/** 一颗背景星：位置、亮度、视差层。 */
export interface Star { x: number, y: number, r: number, alpha: number, layer: number }

/**
 * 确定性生成背景星空（渲染消费；seed 注入，可复现）。
 * @param seed - 种子。
 * @param count - 星数（默认 110）。
 * @returns 星数组。
 */
export function generateStarfield(seed: number, count = 110): Star[] {
  const rng = mulberry32(seed >>> 0)
  const stars: Star[] = []
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: rng() * W,
      y: rng() * H,
      r: 0.4 + rng() * 1.3,
      alpha: 0.25 + rng() * 0.6,
      layer: Math.floor(rng() * 3),
    })
  }
  return stars
}
