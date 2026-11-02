/**
 * 迷你高尔夫纯逻辑：确定性俯视推球物理与 8 关手工关卡表。
 *
 * 物理为固定子步积分：摩擦用指数衰减（沙坑区域摩擦 ×4）、斜坡区域施加
 * 恒定加速度、墙壁与边界做圆形-AABB 反弹（镜像 + 衰减）、洞口在
 * "速度低于阈值且距洞小于洞半径" 时捕获球。所有关卡为手工参数表，
 * 无随机数——相同输入必然得到相同轨迹（渲染层只画状态，不参与模拟）。
 */

/** 球场世界坐标宽度（内部可玩区域）。 */
export const FIELD_W = 200
/** 球场世界坐标高度（内部可玩区域）。 */
export const FIELD_H = 120
/** 球半径。 */
export const BALL_R = 2.2
/** 洞口半径（捕获距离阈值）。 */
export const HOLE_R = 3.6
/** 草地摩擦率（每秒指数衰减系数 v *= exp(-k·dt)）。 */
export const FRICTION_K = 0.9
/** 沙坑摩擦倍率。 */
export const SAND_MULT = 4
/** 墙壁反弹恢复系数（镜像后乘以该系数）。 */
export const WALL_RESTITUTION = 0.78
/** 低于该速度球停住。 */
export const STOP_SPEED = 4.5
/** 洞口捕获的最大球速。 */
export const CAPTURE_SPEED = 34
/** 满蓄力对应的击球初速。 */
export const MAX_SHOT_SPEED = 250
/** 单个子步的最大时长（防穿墙）。 */
export const MAX_SUBSTEP_DT = 1 / 120
/** 关卡总数。 */
export const LEVEL_COUNT = 8

/** 平面坐标点。 */
export interface Vec {
  x: number
  y: number
}

/** 轴对齐矩形墙。 */
export interface WallRect {
  x: number
  y: number
  w: number
  h: number
}

/** 斜坡区域：球心进入后每秒获得 (ax, ay) 的恒定加速度。 */
export interface SlopeRect extends WallRect {
  ax: number
  ay: number
}

/** 沙坑区域：球心进入后摩擦 ×SAND_MULT。 */
export interface SandRect extends WallRect {
}

/** 一关的完整手工参数。 */
export interface GolfLevelDef {
  level: number
  /** 标准杆。 */
  par: number
  /** 发球点。 */
  tee: Vec
  /** 洞口位置。 */
  hole: Vec
  walls: WallRect[]
  slopes: SlopeRect[]
  sands: SandRect[]
}

export type GolfPhase = 'aiming' | 'rolling' | 'levelDone' | 'allDone' | 'paused'

export interface GolfBall {
  x: number
  y: number
  vx: number
  vy: number
  atRest: boolean
}

export type GolfEvent =
  | { kind: 'sink'; level: number; strokes: number; par: number; stars: number }
  | { kind: 'stop' }

export interface MiniGolfState {
  phase: GolfPhase
  level: number
  strokes: number
  /** 本次运行累计星数（作为上报分数）。 */
  totalStars: number
  ball: GolfBall
  hole: Vec
  /** 本杆滚动轨迹（淡痕渲染用）。 */
  trail: Vec[]
  events: GolfEvent[]
  /** 暂停前的相位（恢复用）。 */
  pausedFrom: GolfPhase | null
  msg: string
  /** 消息剩余显示秒数。 */
  msgTimer: number
}

/** 8 关手工关卡表：直道 → L 弯 → 沙坑 → 斜坡 → 组合难度递增。 */
export const LEVELS: GolfLevelDef[] = [
  {
    level: 1, par: 2, tee: { x: 30, y: 60 }, hole: { x: 170, y: 60 },
    walls: [], slopes: [], sands: [],
  },
  {
    level: 2, par: 2, tee: { x: 30, y: 25 }, hole: { x: 170, y: 95 },
    walls: [{ x: 90, y: 0, w: 12, h: 85 }], slopes: [], sands: [],
  },
  {
    level: 3, par: 3, tee: { x: 25, y: 60 }, hole: { x: 175, y: 60 },
    walls: [], slopes: [],
    sands: [{ x: 75, y: 20, w: 50, h: 80 }],
  },
  {
    level: 4, par: 2, tee: { x: 25, y: 60 }, hole: { x: 175, y: 60 },
    walls: [], sands: [],
    slopes: [{ x: 70, y: 0, w: 60, h: 120, ax: 0, ay: 60 }],
  },
  {
    level: 5, par: 3, tee: { x: 25, y: 95 }, hole: { x: 175, y: 25 },
    walls: [{ x: 140, y: 45, w: 12, h: 75 }], slopes: [], sands: [],
  },
  {
    level: 6, par: 3, tee: { x: 25, y: 95 }, hole: { x: 175, y: 25 },
    walls: [{ x: 100, y: 60, w: 12, h: 60 }],
    slopes: [{ x: 55, y: 0, w: 85, h: 120, ax: 0, ay: -55 }],
    sands: [{ x: 125, y: 60, w: 55, h: 60 }],
  },
  {
    level: 7, par: 3, tee: { x: 25, y: 60 }, hole: { x: 175, y: 60 },
    walls: [
      { x: 60, y: 30, w: 80, h: 10 },
      { x: 60, y: 80, w: 80, h: 10 },
    ],
    slopes: [], sands: [],
  },
  {
    level: 8, par: 4, tee: { x: 25, y: 100 }, hole: { x: 178, y: 15 },
    walls: [
      { x: 50, y: 40, w: 10, h: 45 },
      { x: 112, y: 62, w: 10, h: 58 },
    ],
    slopes: [{ x: 120, y: 0, w: 55, h: 52, ax: 0, ay: -50 }],
    sands: [{ x: 60, y: 0, w: 52, h: 40 }],
  },
]

/** 取指定关（1 基）的参数表；越界回环绕回。 */
export function getLevel(level: number): GolfLevelDef {
  const n = ((level - 1) % LEVEL_COUNT + LEVEL_COUNT) % LEVEL_COUNT
  return LEVELS[n]!
}

/** 星级：≤par 三星，≤par+1 两星，其余一星。 */
export function starFor(strokes: number, par: number): number {
  if (strokes <= par) return 3
  if (strokes <= par + 1) return 2
  return 1
}

/** 点是否位于某个矩形（含边界）内。 */
export function inRect(px: number, py: number, r: WallRect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
}

/** 球心是否落在某个沙坑内。 */
export function inSand(x: number, y: number, def: GolfLevelDef): boolean {
  return def.sands.some(s => inRect(x, y, s))
}

/** 取球心所在斜坡的加速度（多区域叠加）。 */
export function slopeAccel(x: number, y: number, def: GolfLevelDef): Vec {
  let ax = 0
  let ay = 0
  for (const s of def.slopes) {
    if (inRect(x, y, s)) { ax += s.ax; ay += s.ay }
  }
  return { x: ax, y: ay }
}

/** 构造某关的初始状态（杆数清零、球放发球点）。 */
export function createGolfLevel(level: number, totalStars = 0): MiniGolfState {
  const def = getLevel(level)
  return {
    phase: 'aiming',
    level,
    strokes: 0,
    totalStars,
    ball: { x: def.tee.x, y: def.tee.y, vx: 0, vy: 0, atRest: true },
    hole: { x: def.hole.x, y: def.hole.y },
    trail: [],
    events: [],
    pausedFrom: null,
    msg: '第 ' + def.level + ' 关 · 标准杆 ' + def.par,
    msgTimer: 2.5,
  }
}

/**
 * 圆形与轴对齐矩形的碰撞反弹：找最近点，沿穿透较小的轴推出并镜像该轴
 * 速度分量（乘恢复系数）。返回是否发生了一次迎面碰撞。
 * @param ball - 球（被原地修改）。
 * @param rect - 目标矩形。
 */
export function collideRect(ball: GolfBall, rect: WallRect): boolean {
  const cx = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w))
  const cy = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h))
  const dx = ball.x - cx
  const dy = ball.y - cy
  const d2 = dx * dx + dy * dy
  if (d2 >= BALL_R * BALL_R) return false
  // 球心在矩形内部（最近点退化）：沿穿透最小的轴推出。
  if (d2 === 0) {
    const left = ball.x - rect.x
    const right = rect.x + rect.w - ball.x
    const top = ball.y - rect.y
    const bottom = rect.y + rect.h - ball.y
    const m = Math.min(left, right, top, bottom)
    if (m === left) { ball.x = rect.x - BALL_R; if (ball.vx > 0) ball.vx = -ball.vx * WALL_RESTITUTION }
    else if (m === right) { ball.x = rect.x + rect.w + BALL_R; if (ball.vx < 0) ball.vx = -ball.vx * WALL_RESTITUTION }
    else if (m === top) { ball.y = rect.y - BALL_R; if (ball.vy > 0) ball.vy = -ball.vy * WALL_RESTITUTION }
    else { ball.y = rect.y + rect.h + BALL_R; if (ball.vy < 0) ball.vy = -ball.vy * WALL_RESTITUTION }
    return true
  }
  const d = Math.sqrt(d2)
  const nx = dx / d
  const ny = dy / d
  ball.x = cx + nx * BALL_R
  ball.y = cy + ny * BALL_R
  const vn = ball.vx * nx + ball.vy * ny
  if (vn < 0) {
    ball.vx -= (1 + WALL_RESTITUTION) * vn * nx
    ball.vy -= (1 + WALL_RESTITUTION) * vn * ny
  }
  return true
}

/**
 * 推进一步子步积分：位移 → 斜坡加速 → 摩擦 → 边界与墙反弹 → 洞口捕获
 * → 低速停球。返回是否已入洞。
 */
function substep(state: MiniGolfState, def: GolfLevelDef, h: number): boolean {
  const b = state.ball
  b.x += b.vx * h
  b.y += b.vy * h

  const acc = slopeAccel(b.x, b.y, def)
  b.vx += acc.x * h
  b.vy += acc.y * h

  const k = FRICTION_K * (inSand(b.x, b.y, def) ? SAND_MULT : 1)
  const damp = Math.exp(-k * h)
  b.vx *= damp
  b.vy *= damp

  // 场地边界四壁。
  if (b.x - BALL_R < 0 && b.vx < 0) { b.x = BALL_R; b.vx = -b.vx * WALL_RESTITUTION }
  if (b.x + BALL_R > FIELD_W && b.vx > 0) { b.x = FIELD_W - BALL_R; b.vx = -b.vx * WALL_RESTITUTION }
  if (b.y - BALL_R < 0 && b.vy < 0) { b.y = BALL_R; b.vy = -b.vy * WALL_RESTITUTION }
  if (b.y + BALL_R > FIELD_H && b.vy > 0) { b.y = FIELD_H - BALL_R; b.vy = -b.vy * WALL_RESTITUTION }
  for (const w of def.walls) collideRect(b, w)

  // 洞口捕获：速度低于阈值且球心距洞心小于洞半径。
  const speed = Math.hypot(b.vx, b.vy)
  const dh = Math.hypot(b.x - state.hole.x, b.y - state.hole.y)
  if (dh < HOLE_R && speed < CAPTURE_SPEED) {
    b.x = state.hole.x
    b.y = state.hole.y
    b.vx = 0
    b.vy = 0
    b.atRest = true
    return true
  }

  if (speed < STOP_SPEED) {
    b.vx = 0
    b.vy = 0
    b.atRest = true
  } else {
    b.atRest = false
  }
  return false
}

/**
 * 推进整帧：按最大子步长切分后调用 substep；记录轨迹点；球停后回到
 * aiming 相位、入洞则进入 levelDone 并产出 sink 事件。
 * @param state - 游戏状态（被原地修改）。
 * @param dt - 帧时长（秒）。
 */
export function step(state: MiniGolfState, dt: number): void {
  state.events = []
  if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt)
  if (state.phase !== 'rolling') return
  const def = getLevel(state.level)
  const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_DT))
  const h = dt / n
  for (let i = 0; i < n; i += 1) {
    if (substep(state, def, h)) {
      const stars = starFor(state.strokes, def.par)
      state.totalStars += stars
      state.phase = 'levelDone'
      state.msg = '入洞！' + state.strokes + ' 杆 · ' + '★'.repeat(stars)
      state.msgTimer = 3
      state.events.push({ kind: 'sink', level: state.level, strokes: state.strokes, par: def.par, stars })
      state.trail.push({ x: state.ball.x, y: state.ball.y })
      return
    }
  }
  state.trail.push({ x: state.ball.x, y: state.ball.y })
  if (state.trail.length > 240) state.trail.shift()
  if (state.ball.atRest) {
    state.phase = 'aiming'
    state.events.push({ kind: 'stop' })
  }
}

/**
 * 击球：只在 aiming 相位合法。力度被钳制到 [0,1]，初速 = power ×
 * MAX_SHOT_SPEED。清空上一杆轨迹。
 * @param state - 游戏状态（被原地修改）。
 * @param angle - 击球方向（弧度，0 = +x）。
 * @param power - 蓄力 0..1。
 * @returns 是否成功击球。
 */
export function shoot(state: MiniGolfState, angle: number, power: number): boolean {
  if (state.phase !== 'aiming') return false
  const p = Math.min(1, Math.max(0, power))
  state.ball.vx = Math.cos(angle) * p * MAX_SHOT_SPEED
  state.ball.vy = Math.sin(angle) * p * MAX_SHOT_SPEED
  state.ball.atRest = false
  state.strokes += 1
  state.phase = 'rolling'
  state.trail = [{ x: state.ball.x, y: state.ball.y }]
  state.msgTimer = 0
  return true
}

/** 重开当前关（杆数清零、球回发球点；保留累计星）。 */
export function restartLevel(state: MiniGolfState): void {
  const stars = state.totalStars
  Object.assign(state, createGolfLevel(state.level, stars))
}

/** 入洞后进入下一关（第 8 关后回到第 1 关；保留累计星）。 */
export function nextLevel(state: MiniGolfState): void {
  const stars = state.totalStars
  Object.assign(state, createGolfLevel(state.level + 1, stars))
}

/** 切换暂停（记住原相位以便恢复）。 */
export function togglePause(state: MiniGolfState): void {
  if (state.phase === 'paused') {
    state.phase = state.pausedFrom ?? 'aiming'
    state.pausedFrom = null
  } else if (state.phase === 'aiming' || state.phase === 'rolling') {
    state.pausedFrom = state.phase
    state.phase = 'paused'
  }
}
