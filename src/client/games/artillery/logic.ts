/**
 * 炮台对决（Artillery）纯逻辑：侧视正弦叠加随机地形，左右各一门 3 血炮台，
 * 回合制炮击。玩家/AI 交替发射：角度 0-90 度 + 力度 1-100 决定初速，炮弹
 * 受重力与每回合 seed 决定的水平风力做抛物线飞行；命中地形炸出圆形弹坑
 * （高度场削减，后续回合地形改变），直接命中或爆心波及炮台扣 1 血，支撑
 * 被炸空的炮台滑落到新地表再扣 1 血。一回合先耗尽对方血量者胜，共 5 局
 * 记积分。AI 采用试射修正：首发带较大随机误差，之后误差逐轮减半逼近。
 * 时间单位毫秒，物理单位 px/s，同 seed 同输入逐步模拟完全确定。
 */

/** 逻辑画布尺寸（横向战场）。 */
export const W = 720
export const H = 480
/** 地形高度场采样数（含两端，相邻采样间距 5px）。 */
export const TERRAIN_SAMPLES = 145
/** 地形采样间距 px。 */
export const TERRAIN_STEP = 5
/** 炮台碰撞半径 px。 */
export const TURRET_R = 13
/** 炮管长度 px（炮口出射点距转轴）。 */
export const BARREL_LEN = 22
/** 炮管转轴相对炮台基座的高度 px。 */
export const PIVOT_DY = 14
/** 弹坑/爆炸半径 px。 */
export const BLAST_R = 34
/** 满力初速 px/s。 */
export const MAX_SPEED = 560
/** 重力加速度 px/s^2。 */
export const GRAVITY = 420
/** 水平风力加速度上限 px/s^2（有符号，正 = 向右吹）。 */
export const WIND_MAX = 90
/** 每门炮台初始血量。 */
export const HP = 3
/** 一场比赛总局数。 */
export const ROUNDS = 5
/** 爆炸/脱靶后的结算展示 ms。 */
export const SETTLE_MS = 900
/** AI 思考（试射修正计算）延迟 ms。 */
export const AI_THINK_MS = 700
/** 一局结束后的展示 ms。 */
export const ROUND_OVER_MS = 1500
/** 一局内的回合数上限（防僵局，超出判平）。 */
export const MAX_ROUND_TURNS = 40
/** 玩家炮台 x。 */
export const P_X = 80
/** AI 炮台 x。 */
export const AI_X = W - 80
/** AI 首发误差比例（角度 ±6 度 / 力度 ±12 的基数）。 */
export const AI_ERR0 = 1
/** AI 每次试射后误差衰减系数。 */
export const AI_ERR_DECAY = 0.55
/** AI 误差下限（永不完美）。 */
export const AI_ERR_MIN = 0.06

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

/** 侧别：玩家在左，AI 在右。 */
export type Side = 'player' | 'ai'
/** 阶段：玩家瞄准 / 飞行 / 结算 / AI 思考 / 单局结束 / 比赛结束。 */
export type ArtilleryPhase = 'aim' | 'flying' | 'settle' | 'aiThink' | 'roundOver' | 'matchOver'

/** 单步内产生、供渲染层消费的可视事件。 */
export type ArtilleryEvent =
  | { type: 'fire', side: Side, x: number, y: number }
  | { type: 'explode', x: number, y: number, hitTurret: Side | null }
  | { type: 'fall', side: Side }
  | { type: 'roundEnd', winner: Side | 'draw' }

/** 一门炮台（y 为基座所在的地表高度）。 */
export interface Turret {
  x: number
  y: number
  hp: number
  /** 当前炮管仰角 0-90 度（渲染与开火共用）。 */
  angle: number
}

/** 飞行中的炮弹。 */
export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
}

/** 一场比赛的完整可测状态。 */
export interface ArtilleryState {
  seed: number
  /** 当前第几局（1 起）。 */
  round: number
  pointsPlayer: number
  pointsAi: number
  /** 高度场：每采样点的地表 y（越大越低）。 */
  terrain: number[]
  player: Turret
  ai: Turret
  /** 本回合水平风加速度 px/s^2（正 = 向右吹）。 */
  wind: number
  /** 当前瞄准力度 1-100。 */
  power: number
  turn: Side
  phase: ArtilleryPhase
  /** settle / roundOver 阶段剩余 ms。 */
  settleMs: number
  /** aiThink 阶段剩余 ms。 */
  thinkMs: number
  /** 当前局内已进行的回合数。 */
  turnCount: number
  projectile: Projectile | null
  /** 飞行轨迹采样点（渲染拖尾）。 */
  trail: { x: number, y: number }[]
  /** AI 当前误差比例（随试射递减）。 */
  aiErrScale: number
  /** 比赛胜负（matchOver 阶段有效）。 */
  winner: Side | 'draw' | null
  events: ArtilleryEvent[]
  rng: () => number
}

/**
 * 用正弦叠加生成连绵山丘高度场，并在两门炮台脚下压出平整平台。
 * @param rng - 注入的随机源。
 * @returns 长度为 TERRAIN_SAMPLES 的地表 y 数组。
 */
export function generateTerrain(rng: () => number): number[] {
  const waves: { amp: number, freq: number, phase: number }[] = []
  for (let k = 0; k < 4; k += 1) {
    waves.push({
      amp: 18 + rng() * 52,
      freq: 0.004 + rng() * 0.016,
      phase: rng() * Math.PI * 2,
    })
  }
  const heights: number[] = []
  for (let i = 0; i < TERRAIN_SAMPLES; i += 1) {
    const x = i * TERRAIN_STEP
    let y = H * 0.58
    for (const w of waves) y += w.amp * Math.sin(w.freq * x + w.phase)
    heights.push(Math.max(H * 0.3, Math.min(H * 0.82, y)))
  }
  // 炮台平台：中心 24px 内整平，向外 16px 线性过渡回山体。
  for (const tx of [P_X, AI_X]) {
    const idx = Math.round(tx / TERRAIN_STEP)
    const padY = heights[Math.max(0, Math.min(TERRAIN_SAMPLES - 1, idx))]!
    const flat = Math.round(24 / TERRAIN_STEP)
    const blend = Math.round(40 / TERRAIN_STEP)
    for (let i = idx - blend; i <= idx + blend; i += 1) {
      if (i < 0 || i >= TERRAIN_SAMPLES) continue
      const d = Math.abs(i - idx)
      const k = d <= flat ? 1 : 1 - (d - flat) / (blend - flat)
      heights[i] = heights[i]! * (1 - k) + padY * k
    }
  }
  return heights
}

/**
 * 高度场线性插值：任意 x 处的地表 y。
 * @param terrain - 高度场。
 * @param x - 逻辑坐标 x（越界取端点）。
 * @returns 地表 y。
 */
export function terrainYAt(terrain: number[], x: number): number {
  const t = Math.max(0, Math.min(TERRAIN_SAMPLES - 1, x / TERRAIN_STEP))
  const i = Math.floor(t)
  const j = Math.min(TERRAIN_SAMPLES - 1, i + 1)
  const k = t - i
  return terrain[i]! * (1 - k) + terrain[j]! * k
}

/**
 * 炸坑：以 (cx,cy) 为圆心、r 为半径的圆内把地表削低到圆下缘。
 * @param terrain - 高度场（就地修改）。
 * @param cx - 爆心 x。
 * @param cy - 爆心 y。
 * @param r - 弹坑半径 px。
 */
export function carveCrater(terrain: number[], cx: number, cy: number, r: number): void {
  const i0 = Math.max(0, Math.floor((cx - r) / TERRAIN_STEP))
  const i1 = Math.min(TERRAIN_SAMPLES - 1, Math.ceil((cx + r) / TERRAIN_STEP))
  for (let i = i0; i <= i1; i += 1) {
    const dx = i * TERRAIN_STEP - cx
    const bottom = cy + Math.sqrt(Math.max(0, r * r - dx * dx))
    if (terrain[i]! < bottom) terrain[i] = Math.min(H * 0.94, bottom)
  }
}

/**
 * 炮弹对某侧炮台的命中判定（圆形半径，炮台中心取基座上方）。
 * @param state - 当前状态。
 * @param x - 炮弹 x。
 * @param y - 炮弹 y。
 * @returns 命中的侧别，未命中返回 null。
 */
export function hitTurret(state: ArtilleryState, x: number, y: number): Side | null {
  for (const side of ['player', 'ai'] as const) {
    const t = state[side]
    if (t.hp > 0 && Math.hypot(x - t.x, y - (t.y - PIVOT_DY)) <= TURRET_R + 2) return side
  }
  return null
}

/**
 * 某侧发射的炮口位置与初速（角度 0-90 度自水平起算，玩家向右、AI 向左）。
 * @param t - 发射炮台。
 * @param angleDeg - 仰角度数。
 * @param power - 力度 1-100。
 * @returns 炮口坐标与初速分量。
 */
export function muzzleVelocity(t: Turret, side: Side, angleDeg: number, power: number): { x: number, y: number, vx: number, vy: number } {
  const a = (Math.max(0, Math.min(90, angleDeg)) * Math.PI) / 180
  const speed = (Math.max(1, Math.min(100, power)) / 100) * MAX_SPEED
  const dir = side === 'player' ? 1 : -1
  return {
    x: t.x + dir * Math.cos(a) * BARREL_LEN,
    y: t.y - PIVOT_DY - Math.sin(a) * BARREL_LEN,
    vx: dir * Math.cos(a) * speed,
    vy: -Math.sin(a) * speed,
  }
}

/**
 * 纯模拟一次发射（AI 规划与瞄准预览共用，不改动状态）。
 * @param terrain - 高度场。
 * @param t - 发射炮台。
 * @param side - 发射侧。
 * @param angleDeg - 仰角度数。
 * @param power - 力度 1-100。
 * @param wind - 水平风加速度。
 * @returns 落点（命中地形为触地 点，出界为末位置）。
 */
export function simulateShot(terrain: number[], t: Turret, side: Side, angleDeg: number, power: number, wind: number): { x: number, y: number } {
  const m = muzzleVelocity(t, side, angleDeg, power)
  let x = m.x, y = m.y, vx = m.vx, vy = m.vy
  const dt = 0.01
  for (let i = 0; i < 3000; i += 1) {
    vy += GRAVITY * dt
    vx += wind * dt
    x += vx * dt
    y += vy * dt
    if (y >= terrainYAt(terrain, x)) return { x, y }
    if (x < -80 || x > W + 80 || y > H + 120) break
  }
  return { x, y }
}

/**
 * AI 试射修正：网格搜索最接近命中玩家的 (角度, 力度)，再叠加随
 * aiErrScale 线性缩小的随机误差（调用消耗 2 次随机数），并把误差
 * 比例衰减到下轮。
 * @param state - 当前状态（只读地形/目标，消耗 rng 与衰减 aiErrScale）。
 * @returns 本次发射的角度与力度。
 */
export function aiPlan(state: ArtilleryState): { angle: number, power: number } {
  let bestAngle = 45, bestPower = 60, bestErr = Infinity
  for (let a = 25; a <= 75; a += 5) {
    for (let p = 20; p <= 100; p += 3) {
      const impact = simulateShot(state.terrain, state.ai, 'ai', a, p, state.wind)
      const err = Math.abs(impact.x - state.player.x)
      if (err < bestErr) {
        bestErr = err
        bestAngle = a
        bestPower = p
      }
    }
  }
  const eA = state.aiErrScale * (state.rng() * 12 - 6)
  const eP = state.aiErrScale * (state.rng() * 24 - 12)
  state.aiErrScale = Math.max(AI_ERR_MIN, state.aiErrScale * AI_ERR_DECAY)
  return {
    angle: Math.max(0, Math.min(90, bestAngle + eA)),
    power: Math.max(1, Math.min(100, bestPower + eP)),
  }
}

/**
 * 掷下一次回合的风向风力（消耗 2 次随机数）。
 * @param state - 目标状态。
 */
function rollWind(state: ArtilleryState): void {
  const sign = state.rng() < 0.5 ? -1 : 1
  state.wind = sign * state.rng() * WIND_MAX
}

/**
 * 开启新的一局：重生成地形、满血复位、玩家先手、AI 误差复位。
 * @param state - 目标状态。
 */
function startRound(state: ArtilleryState): void {
  state.terrain = generateTerrain(state.rng)
  state.player = { x: P_X, y: terrainYAt(state.terrain, P_X), hp: HP, angle: 45 }
  state.ai = { x: AI_X, y: terrainYAt(state.terrain, AI_X), hp: HP, angle: 45 }
  state.aiErrScale = AI_ERR0
  state.turn = 'player'
  state.phase = 'aim'
  state.turnCount = 0
  state.projectile = null
  state.trail.length = 0
  rollWind(state)
}

/**
 * 新开一场比赛。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态。
 */
export function createArtillery(seed: number): ArtilleryState {
  const state: ArtilleryState = {
    seed,
    round: 1,
    pointsPlayer: 0,
    pointsAi: 0,
    terrain: [],
    player: { x: P_X, y: 0, hp: HP, angle: 45 },
    ai: { x: AI_X, y: 0, hp: HP, angle: 45 },
    wind: 0,
    power: 60,
    turn: 'player',
    phase: 'aim',
    settleMs: 0,
    thinkMs: 0,
    turnCount: 0,
    projectile: null,
    trail: [],
    aiErrScale: AI_ERR0,
    winner: null,
    events: [],
    rng: mulberry32(Math.floor(seed) >>> 0),
  }
  startRound(state)
  return state
}

/**
 * 发射：按当前回合方的角度与力度射出炮弹（只在对应瞄准/思考阶段有效）。
 * @param state - 目标状态。
 * @param angleDeg - 仰角度数 0-90。
 * @param power - 力度 1-100。
 * @returns true 表示已发射。
 */
export function fireShot(state: ArtilleryState, angleDeg: number, power: number): boolean {
  const canPlayer = state.phase === 'aim' && state.turn === 'player'
  const canAi = state.phase === 'aiThink' && state.turn === 'ai'
  if (!canPlayer && !canAi) return false
  const side = state.turn
  const t = state[side]
  t.angle = Math.max(0, Math.min(90, angleDeg))
  const p = Math.max(1, Math.min(100, power))
  if (canPlayer) state.power = p
  const m = muzzleVelocity(t, side, t.angle, p)
  state.projectile = { x: m.x, y: m.y, vx: m.vx, vy: m.vy }
  state.trail.length = 0
  state.trail.push({ x: m.x, y: m.y })
  state.phase = 'flying'
  state.events.push({ type: 'fire', side, x: m.x, y: m.y })
  return true
}

/**
 * 爆炸结算：炸坑、波及扣血、支撑塌空的炮台滑落再扣 1 血。
 * @param state - 目标状态。
 * @param x - 爆心 x。
 * @param y - 爆心 y。
 */
function explode(state: ArtilleryState, x: number, y: number, direct: Side | null): void {
  carveCrater(state.terrain, x, y, BLAST_R)
  for (const side of ['player', 'ai'] as const) {
    const t = state[side]
    if (t.hp > 0 && Math.hypot(x - t.x, y - (t.y - PIVOT_DY)) <= BLAST_R) {
      t.hp = Math.max(0, t.hp - 1)
    }
  }
  // 滑落：脚下地表被炸低超过阈值则坠落到新地表并额外扣 1 血。
  for (const side of ['player', 'ai'] as const) {
    const t = state[side]
    if (t.hp <= 0) continue
    const ground = terrainYAt(state.terrain, t.x)
    if (ground > t.y + 8) {
      t.y = ground
      t.hp = Math.max(0, t.hp - 1)
      state.events.push({ type: 'fall', side })
    }
  }
  state.events.push({ type: 'explode', x, y, hitTurret: direct })
}

/**
 * 结算结束后的流转：判局（分胜负/僵局平）、换手 + 掷新风、或进入下一局。
 * @param state - 目标状态。
 */
function afterSettle(state: ArtilleryState): void {
  const pDead = state.player.hp <= 0
  const aDead = state.ai.hp <= 0
  if (pDead || aDead || state.turnCount >= MAX_ROUND_TURNS) {
    const winner: Side | 'draw' = aDead && !pDead ? 'player' : pDead && !aDead ? 'ai' : 'draw'
    if (winner === 'player') state.pointsPlayer += 1
    else if (winner === 'ai') state.pointsAi += 1
    state.phase = 'roundOver'
    state.settleMs = ROUND_OVER_MS
    state.events.push({ type: 'roundEnd', winner })
    return
  }
  state.turn = state.turn === 'player' ? 'ai' : 'player'
  state.turnCount += 1
  rollWind(state)
  if (state.turn === 'ai') {
    state.phase = 'aiThink'
    state.thinkMs = AI_THINK_MS
  } else {
    state.phase = 'aim'
  }
}

/**
 * 推进一帧：飞行物理（重力 + 风，8ms 子步防穿透）、命中判定（炮台半径
 * 优先于地形）、出界脱靶、结算计时、AI 思考后自动开火、单局与比赛流转。
 * 事件写入 state.events，调用方每帧消费后在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepArtillery(state: ArtilleryState, dtMs: number): void {
  state.events.length = 0
  if (state.phase === 'matchOver') return

  if (state.phase === 'settle' || state.phase === 'roundOver') {
    state.settleMs -= dtMs
    if (state.settleMs > 0) return
    if (state.phase === 'settle') {
      afterSettle(state)
      return
    }
    // roundOver 到期：还有下一局则重开，否则收场。
    if (state.round >= ROUNDS) {
      state.phase = 'matchOver'
      state.winner = state.pointsPlayer > state.pointsAi ? 'player' : state.pointsAi > state.pointsPlayer ? 'ai' : 'draw'
    } else {
      state.round += 1
      startRound(state)
    }
    return
  }

  if (state.phase === 'aiThink') {
    state.thinkMs -= dtMs
    if (state.thinkMs <= 0) {
      const plan = aiPlan(state)
      fireShot(state, plan.angle, plan.power)
    }
    return
  }

  if (state.phase !== 'flying' || state.projectile === null) return
  const sub = Math.max(1, Math.ceil(dtMs / 8))
  const h = dtMs / sub
  const p = state.projectile
  for (let s = 0; s < sub; s += 1) {
    p.vy += GRAVITY * (h / 1000)
    p.vx += state.wind * (h / 1000)
    p.x += p.vx * (h / 1000)
    p.y += p.vy * (h / 1000)
    const hit = hitTurret(state, p.x, p.y)
    if (hit !== null) {
      const t = state[hit]
      explode(state, t.x, t.y - PIVOT_DY, hit)
      state.projectile = null
      state.phase = 'settle'
      state.settleMs = SETTLE_MS
      return
    }
    const ground = terrainYAt(state.terrain, p.x)
    if (p.y >= ground && p.x >= 0 && p.x <= W) {
      explode(state, p.x, ground, null)
      state.projectile = null
      state.phase = 'settle'
      state.settleMs = SETTLE_MS
      return
    }
    state.trail.push({ x: p.x, y: p.y })
    if (state.trail.length > 90) state.trail.shift()
    if (p.x < -60 || p.x > W + 60 || p.y > H + 100 || p.y < -2400) {
      // 出界脱靶：无爆炸，直接换手。
      state.projectile = null
      state.phase = 'settle'
      state.settleMs = SETTLE_MS
      return
    }
  }
}
