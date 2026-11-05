/**
 * 弹球大师 Pinball 纯逻辑：一张竖直街机弹球台的确定性 2D 物理模拟 ——
 * 重力、固定自适应子步（快速时加密，防止穿透）、圆 vs 线段外墙、带外冲
 * 击的圆形 bumper 与小立柱、以及把接触点表面速度传给球的水滴形挡板。
 *
 * 特色规则：连击（combo）—— bumper 之间不落板连击越高倍率越高（上限
 * x5），球碰挡板或落袋即清零；球从台顶发球（空格），掉进底部通道即损
 * 失一球，共 3 球。所有随机量都走注入的 mulberry32 rng，同一种子与输
 * 入脚本必然复现同一轨迹。渲染器（render.ts）只画状态；粘合层
 * （index.ts）负责输入。
 */

/** 逻辑台面尺寸（渲染坐标同此）。 */
export const TABLE_W = 420
export const TABLE_H = 660
/** 球半径 px。 */
export const BALL_R = 8
/** 向下重力加速度 px/s²。 */
export const GRAVITY = 920
/** 基线子步长（静止时 ≥240Hz）。 */
export const BASE_SUBSTEP_DT = 1 / 240
/** 单个子步内球最多走过的距离（半径的分数）—— 防穿透。 */
export const MAX_SUBSTEP_TRAVEL = BALL_R * 0.5
/** 绝对速度上限（同时约束子步数）。 */
export const MAX_SPEED = 2200
/** 外墙恢复系数。 */
export const WALL_E = 0.5
/** 法向接近速度低于该值时贴面沉淀（避免微弹跳）。 */
export const REST_SPEED = 36
/** 全局线性阻尼（每秒 exp 形式）。 */
export const DAMPING_K = 0.1
/** Bumper：恢复系数、最小外冲 px/s、每次得分、再触发冷却 s、半径。 */
export const BUMPER_E = 1.35
export const BUMPER_KICK = 280
export const BUMPER_POINTS = 100
export const BUMPER_COOLDOWN = 0.12
export const BUMPER_R = 17
/** 小立柱：半径、得分、最小外冲。 */
export const POST_R = 8
export const POST_POINTS = 20
export const POST_KICK = 210
/** 连击倍率上限。 */
export const MAX_MULT = 5
/** 每局球数。 */
export const BALLS_PER_GAME = 3
/** 球心低于此 y 判定落袋。 */
export const DRAIN_Y = TABLE_H + 30
/** 挡板：枢轴胶囊半径、上摆角速度、回弹角速度、长度。 */
export const FLIPPER_R = 9
export const FLIPPER_OMEGA = 17
export const FLIPPER_RETURN = 11
export const FLIPPER_LEN = 66
/** 挡板碰撞恢复系数与表面速度传递比例。 */
export const FLIPPER_E = 0.42
export const FLIPPER_SURFACE_FACTOR = 0.5
/** 发球初速范围（向下 px/s）与横向抖动幅度。 */
export const SERVE_MIN_VY = 240
export const SERVE_JITTER_VY = 160
export const SERVE_JITTER_VX = 130
/** 死球搜救：静止多久后踢一下、最多踢几次后判丢、救球冲量。 */
export const STUCK_RESCUE_S = 1.6
export const STUCK_KICK_MAX = 3
export const RESCUE_KICK = 320

export type Pinball2Result = 'serving' | 'playing' | 'paused' | 'over'

export interface Ball2 { x: number; y: number; vx: number; vy: number }

/** 圆形得分柱（bumper 或小立柱）。 */
export interface Bumper2 {
  x: number
  y: number
  r: number
  /** 得分（乘连击倍率前）。 */
  points: number
  /** 最小外冲 px/s；立柱较小。 */
  kick: number
  /** 再触发冷却剩余 s。 */
  cd: number
}

export interface Wall2 { ax: number; ay: number; bx: number; by: number }

export type Flipper2Side = 'left' | 'right'

export interface Flipper2 {
  side: Flipper2Side
  px: number
  py: number
  len: number
  /** 当前 / 静置 / 抬起角度（弧度，atan2 约定，+y 向下）。 */
  angle: number
  rest: number
  active: number
  held: boolean
  /** 当前角速度 rad/s，驱动接触点表面速度。 */
  omega: number
}

export type Pinball2Event =
  | { kind: 'serve'; x: number; y: number }
  | { kind: 'bumper'; x: number; y: number; mult: number }
  | { kind: 'post'; x: number; y: number }
  | { kind: 'flipper'; x: number; y: number }
  | { kind: 'comboReset' }
  | { kind: 'drain' }
  | { kind: 'rescue'; x: number; y: number }
  | { kind: 'over' }

export interface Pinball2State {
  result: Pinball2Result
  /** 暂停前的阶段，恢复时还原。 */
  pausedFrom: Pinball2Result | null
  score: number
  ballsLeft: number
  /** 当前连击数（bumper 连击链）。 */
  combo: number
  ball: Ball2
  flippers: { left: Flipper2; right: Flipper2 }
  bumpers: Bumper2[]
  walls: Wall2[]
  time: number
  msg: string
  msgTimer: number
  /** 死球搜救计时与已踢次数。 */
  stuckT: number
  stuckKicks: number
  events: Pinball2Event[]
  rng: () => number
}

/** mulberry32 种子随机数发生器。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 挡板枢轴（底部两侧，出球道在其外侧）。 */
export const LEFT_PIVOT = { x: 138, y: 596 }
export const RIGHT_PIVOT = { x: 282, y: 596 }
/** 挡板静置下垂与抬起角度的幅值（自水平线起的弧度）。 */
const FLIPPER_DROOP = 0.52
const FLIPPER_LIFT = 0.58

export function makeFlipper2(side: Flipper2Side): Flipper2 {
  if (side === 'left') {
    return {
      side, px: LEFT_PIVOT.x, py: LEFT_PIVOT.y, len: FLIPPER_LEN,
      angle: FLIPPER_DROOP, rest: FLIPPER_DROOP, active: -FLIPPER_LIFT,
      held: false, omega: 0,
    }
  }
  return {
    side, px: RIGHT_PIVOT.x, py: RIGHT_PIVOT.y, len: FLIPPER_LEN,
    angle: Math.PI - FLIPPER_DROOP, rest: Math.PI - FLIPPER_DROOP,
    active: Math.PI + FLIPPER_LIFT, held: false, omega: 0,
  }
}

/** 挡板在当前角度下的末端点。 */
export function flipper2Tip(f: Flipper2): { x: number; y: number } {
  return { x: f.px + Math.cos(f.angle) * f.len, y: f.py + Math.sin(f.angle) * f.len }
}

/** 台面圆柱布局：三颗 bumper 组成三角，两颗小立柱护在斜肩旁。 */
function makeBumpers(): Bumper2[] {
  const big: { x: number; y: number }[] = [
    { x: 140, y: 190 }, { x: 280, y: 190 }, { x: 210, y: 262 },
  ]
  const posts: { x: number; y: number }[] = [{ x: 58, y: 470 }, { x: 362, y: 470 }]
  return [
    ...big.map(p => ({ x: p.x, y: p.y, r: BUMPER_R, points: BUMPER_POINTS, kick: BUMPER_KICK, cd: 0 })),
    ...posts.map(p => ({ x: p.x, y: p.y, r: POST_R, points: POST_POINTS, kick: POST_KICK, cd: 0 })),
  ]
}

/** 外墙折线：顶盖 + 两侧斜肩 + 直壁 + 底部导向斜坡（末端之外即出球道）。 */
function makeWalls(): Wall2[] {
  return [
    { ax: 70, ay: 48, bx: 350, by: 48 },
    { ax: 14, ay: 112, bx: 70, by: 48 },
    { ax: 350, ay: 48, bx: 406, by: 112 },
    { ax: 14, ay: 112, bx: 14, by: 520 },
    { ax: 406, ay: 112, bx: 406, by: 520 },
    { ax: 14, ay: 520, bx: 128, by: 596 },
    { ax: 406, ay: 520, bx: 292, by: 596 },
  ]
}

/** 发球点：台顶中央。 */
export const BALL_SPAWN = { x: 210, y: 86 }

/** 新建一局：serving 阶段，球停在发球点等待空格。 */
export function createGame2(seed: number): Pinball2State {
  return {
    result: 'serving',
    pausedFrom: null,
    score: 0,
    ballsLeft: BALLS_PER_GAME,
    combo: 0,
    ball: { x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: 0 },
    flippers: { left: makeFlipper2('left'), right: makeFlipper2('right') },
    bumpers: makeBumpers(),
    walls: makeWalls(),
    time: 0,
    msg: '弹球大师 · 空格发球',
    msgTimer: 2.5,
    stuckT: 0,
    stuckKicks: 0,
    events: [],
    rng: mulberry32((seed >>> 0) || 1),
  }
}

/** 重开一局：同一种子，清零比分与球数。 */
export function restart2(state: Pinball2State): void {
  Object.assign(state, createGame2(1))
}

/**
 * 线段 (a→b) 上离 p 最近的点与距离平方（纯几何）。
 */
export function closestPointOnSegment2(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): { x: number; y: number; d2: number } {
  const abx = bx - ax
  const aby = by - ay
  const len2 = abx * abx + aby * aby
  let t = len2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / len2
  t = Math.min(1, Math.max(0, t))
  const cx = ax + abx * t
  const cy = ay + aby * t
  return { x: cx, y: cy, d2: (px - cx) * (px - cx) + (py - cy) * (py - cy) }
}

/**
 * 圆 vs 点碰撞：把球沿接触法线推出，法向速度按恢复系数 e 反弹；
 * minKick > 0 时保证至少留这么大的向外法向速度（bumper 冲击），
 * 否则慢接近直接沉淀。就地修改 ball。
 * @returns 是否发生了接触。
 */
export function bounceOffPoint2(
  ball: Ball2, r: number, e: number, minKick: number, cx: number, cy: number,
): boolean {
  let nx = ball.x - cx
  let ny = ball.y - cy
  const d2 = nx * nx + ny * ny
  if (d2 >= r * r) return false
  const d = Math.sqrt(d2)
  if (d < 1e-6) { nx = 0; ny = -1 } else { nx /= d; ny /= d }
  ball.x = cx + nx * r
  ball.y = cy + ny * r
  const vn = ball.vx * nx + ball.vy * ny
  if (vn < 0) {
    let out: number
    if (minKick > 0) out = Math.max(-e * vn, minKick)
    else if (-vn < REST_SPEED) out = 0
    else out = -e * vn
    ball.vx += (out - vn) * nx
    ball.vy += (out - vn) * ny
  }
  return true
}

/** 球 vs 单段外墙（恢复系数 WALL_E）。 */
function collideWall(ball: Ball2, w: Wall2): boolean {
  const cp = closestPointOnSegment2(ball.x, ball.y, w.ax, w.ay, w.bx, w.by)
  return bounceOffPoint2(ball, BALL_R, WALL_E, 0, cp.x, cp.y)
}

/**
 * 球 vs 挡板胶囊（枢轴→末端线段加半径 FLIPPER_R）。接触点表面速度
 * ω×r 参与反弹：法向相对速度按恢复系数反射，再叠加一部分表面速度的
 * 法向分量 —— 上挥的挡板把球抛上去。接触即打断连击链。
 * @returns 是否发生了接触。
 */
export function resolveFlipper2(ball: Ball2, f: Flipper2, state: Pinball2State): boolean {
  const tip = flipper2Tip(f)
  const cp = closestPointOnSegment2(ball.x, ball.y, f.px, f.py, tip.x, tip.y)
  const minD = BALL_R + FLIPPER_R
  let nx = ball.x - cp.x
  let ny = ball.y - cp.y
  const d2 = nx * nx + ny * ny
  if (d2 >= minD * minD) return false
  const d = Math.sqrt(d2)
  if (d < 1e-6) { nx = 0; ny = -1 } else { nx /= d; ny /= d }
  ball.x = cp.x + nx * minD
  ball.y = cp.y + ny * minD
  const rx = cp.x - f.px
  const ry = cp.y - f.py
  const svx = f.omega * -ry
  const svy = f.omega * rx
  const svn = svx * nx + svy * ny
  const vn = ball.vx * nx + ball.vy * ny
  const vrel = vn - svn
  if (vrel < 0) {
    const out = -FLIPPER_E * vrel + Math.max(0, svn) * FLIPPER_SURFACE_FACTOR
    ball.vx += (out - vn) * nx
    ball.vy += (out - vn) * ny
  }
  if (state.combo > 0) {
    state.combo = 0
    state.events.push({ kind: 'comboReset' })
  }
  state.events.push({ kind: 'flipper', x: cp.x, y: cp.y })
  return true
}

/** 单块挡板前进 h 秒：按住时以 FLIPPER_OMEGA 摆向 active，松开后回弹。 */
function stepFlipper2(f: Flipper2, h: number): void {
  const prev = f.angle
  if (f.side === 'left') {
    f.angle = f.held
      ? Math.max(f.angle - FLIPPER_OMEGA * h, f.active)
      : Math.min(f.angle + FLIPPER_RETURN * h, f.rest)
  } else {
    f.angle = f.held
      ? Math.min(f.angle + FLIPPER_OMEGA * h, f.active)
      : Math.max(f.angle - FLIPPER_RETURN * h, f.rest)
  }
  f.omega = h > 0 ? (f.angle - prev) / h : 0
}

/** 按住 / 松开一侧挡板。 */
export function setFlipper2(state: Pinball2State, side: Flipper2Side, held: boolean): void {
  state.flippers[side].held = held
}

/** 当前连击倍率（combo ≥1 时为 1..MAX_MULT）。 */
export function comboMult(combo: number): number {
  return Math.max(1, Math.min(MAX_MULT, combo))
}

/**
 * 发球：把 serving 阶段的球以带种子抖动的初速抛入台面。
 * @returns 是否成功发球（非 serving 阶段为 false）。
 */
export function serve(state: Pinball2State): boolean {
  if (state.result !== 'serving') return false
  state.result = 'playing'
  state.ball.x = BALL_SPAWN.x
  state.ball.y = BALL_SPAWN.y
  state.ball.vx = (state.rng() - 0.5) * SERVE_JITTER_VX
  state.ball.vy = SERVE_MIN_VY + state.rng() * SERVE_JITTER_VY
  state.stuckT = 0
  state.stuckKicks = 0
  state.msg = ''
  state.events.push({ kind: 'serve', x: state.ball.x, y: state.ball.y })
  return true
}

/** 落袋：扣一球，回到 serving 或结束整局。 */
function loseBall(state: Pinball2State): void {
  state.ballsLeft -= 1
  state.combo = 0
  state.events.push({ kind: 'drain' })
  if (state.ballsLeft <= 0) {
    state.result = 'over'
    state.msg = '游戏结束'
    state.msgTimer = 3
    state.events.push({ kind: 'over' })
    return
  }
  state.result = 'serving'
  state.ball.x = BALL_SPAWN.x
  state.ball.y = BALL_SPAWN.y
  state.ball.vx = 0
  state.ball.vy = 0
  state.stuckT = 0
  state.stuckKicks = 0
  state.msg = '再 来 一 球 · 空 格 发 球'
  state.msgTimer = 2
}

/**
 * 推进整个模拟 dt 秒（自适应固定子步）。仅在 playing 阶段模拟物理；
 * serving / paused / over 阶段只衰减提示计时。
 */
export function step2(state: Pinball2State, dt: number): void {
  state.events = []
  if (state.result !== 'playing') return
  state.time += dt
  if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt)

  const speed = Math.hypot(state.ball.vx, state.ball.vy)
  const n = Math.min(96, Math.max(1, Math.ceil(dt / BASE_SUBSTEP_DT), Math.ceil((dt * speed) / MAX_SUBSTEP_TRAVEL)))
  const h = dt / n
  const damp = Math.exp(-DAMPING_K * h)

  for (let i = 0; i < n; i += 1) {
    stepFlipper2(state.flippers.left, h)
    stepFlipper2(state.flippers.right, h)
    for (const b of state.bumpers) if (b.cd > 0) b.cd = Math.max(0, b.cd - h)

    const ball = state.ball
    ball.vy += GRAVITY * h
    ball.x += ball.vx * h
    ball.y += ball.vy * h

    for (const w of state.walls) collideWall(ball, w)

    for (const b of state.bumpers) {
      const dx = ball.x - b.x
      const dy = ball.y - b.y
      const rr = BALL_R + b.r
      if (dx * dx + dy * dy >= rr * rr) continue
      if (b.cd <= 0) {
        b.cd = BUMPER_COOLDOWN
        bounceOffPoint2(ball, rr, BUMPER_E, b.kick, b.x, b.y)
        state.combo += 1
        state.score += b.points * comboMult(state.combo)
        if (b.points >= BUMPER_POINTS) {
          state.events.push({ kind: 'bumper', x: b.x, y: b.y, mult: comboMult(state.combo) })
        } else {
          state.events.push({ kind: 'post', x: b.x, y: b.y })
        }
      } else {
        // 冷却中只分离位置，不冲击也不得分。
        bounceOffPoint2(ball, rr, 0, 0, b.x, b.y)
      }
    }

    resolveFlipper2(ball, state.flippers.left, state)
    resolveFlipper2(ball, state.flippers.right, state)

    ball.vx *= damp
    ball.vy *= damp
    const sp = Math.hypot(ball.vx, ball.vy)
    if (sp > MAX_SPEED) {
      ball.vx *= MAX_SPEED / sp
      ball.vy *= MAX_SPEED / sp
    }

    if (ball.y > DRAIN_Y) { loseBall(state); return }
  }

  // 死球搜救：球卡在台面死角时定时踢一下，三次无效则判丢。
  const sp = Math.hypot(state.ball.vx, state.ball.vy)
  if (sp <= REST_SPEED * 1.5) {
    state.stuckT += dt
    if (state.stuckT >= STUCK_RESCUE_S) {
      state.stuckT = 0
      state.stuckKicks += 1
      if (state.stuckKicks > STUCK_KICK_MAX) {
        state.stuckKicks = 0
        loseBall(state)
        return
      }
      const angle = -Math.PI / 2 + (state.rng() - 0.5) * 1.2
      state.ball.vx += Math.cos(angle) * RESCUE_KICK
      state.ball.vy += Math.sin(angle) * RESCUE_KICK
      state.events.push({ kind: 'rescue', x: state.ball.x, y: state.ball.y })
    }
  } else {
    state.stuckT = 0
    if (sp > REST_SPEED * 4) state.stuckKicks = 0
  }
}

/** 暂停 / 继续（记录暂停前阶段，继续时还原）。 */
export function togglePause2(state: Pinball2State): void {
  if (state.result === 'paused') {
    state.result = state.pausedFrom ?? 'playing'
    state.pausedFrom = null
  } else if (state.result === 'playing' || state.result === 'serving') {
    state.pausedFrom = state.result
    state.result = 'paused'
  }
}

/** hashRun 的脚本输入：t 秒时刻执行动作 a。 */
export interface ScriptedInput2 {
  t: number
  a: 'serve' | 'leftDown' | 'leftUp' | 'rightDown' | 'rightUp'
}

/**
 * 确定性校验：从新局出发按 60Hz 模拟 seconds 秒，按脚本施加输入，对球
 * 轨迹取哈希。同一种子 + 脚本必然得到同一哈希。
 */
export function hashRun2(seed: number, script: ScriptedInput2[], seconds: number): number {
  const state = createGame2(seed)
  const dt = 1 / 60
  let h = 0x811c9dc5
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const t = i * dt
    for (const s of script) {
      if (s.t > t - 1e-9 && s.t <= t + dt - 1e-9) {
        if (s.a === 'serve') serve(state)
        else if (s.a === 'leftDown') setFlipper2(state, 'left', true)
        else if (s.a === 'leftUp') setFlipper2(state, 'left', false)
        else if (s.a === 'rightDown') setFlipper2(state, 'right', true)
        else if (s.a === 'rightUp') setFlipper2(state, 'right', false)
      }
    }
    step2(state, dt)
    h = Math.imul(h ^ Math.round(state.ball.x * 10), 0x01000193) >>> 0
    h = Math.imul(h ^ Math.round(state.ball.y * 10), 0x01000193) >>> 0
    h = (h + Math.round(state.ball.vx) + Math.round(state.ball.vy) * 3) >>> 0
  }
  return h >>> 0
}
