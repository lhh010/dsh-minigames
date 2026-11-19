/**
 * 弹球台 Pinball2 纯逻辑：双球物理弹台状态机。与单球版 pinball 的区别：
 * 同时最多两颗球在场（先后发射、球与球可互撞）、3 张递进台面（bumbers
 * 更多 / 底部漏斗更宽 / 第 3 台加入磁力洞吸球偏转）、连击计分倍率、
 * 每球 3 次 nudge 超限即 TILT 没收在场的球。
 *
 * 物理为圆球-线段碰撞（反弹系数 0.65）、重力 1200、固定 240Hz 子步
 * （确定性模拟，无速度自适应分支），挡板为胶囊体，接触点表面速度的
 * 一半传给球。所有随机（台面布置抖动、nudge 抖动、卡球救援方向）都
 * 走注入 seed 的 mulberry32，同一 seed + 同一输入脚本必然重放出同一
 * 轨迹（见 hashRun）。render.ts 只画状态；index.ts 只管输入接线。
 */

/** 逻辑画布尺寸。 */
export const TABLE_W = 440
export const TABLE_H = 700
/** 球半径。 */
export const BALL_R = 9
/** 向下重力（px/s²）。 */
export const GRAVITY = 1200
/** 固定子步时长（1/240 s）。 */
export const SUBSTEP_DT = 1 / 240
/** 速度上限（防穿透：每子步位移 ≤ 7.5px < 球半径）。 */
export const MAX_SPEED = 1800
/** 墙 / 斜面反弹系数。 */
export const WALL_E = 0.65
/** 低于该法向接近速度时贴合表面不再反弹（防微抖）。 */
export const REST_SPEED = 40
/** 全局线性阻尼（每秒指数衰减系数）。 */
export const DAMPING_K = 0.1
/** 挡板：胶囊半径、摆动角速度、回摆角速度。 */
export const FLIPPER_R = 8.5
export const FLIPPER_OMEGA = 20
export const FLIPPER_RETURN = 13
/** 挡板反弹系数与表面速度传递比例（规格要求：挡板运动速度传给球一半）。 */
export const FLIPPER_E = 0.4
export const FLIPPER_SURFACE_FACTOR = 0.5
/** 发射器：充满时间与最小 / 最大弹出速度。 */
export const PLUNGER_CHARGE_S = 1.2
export const PLUNGER_MIN_SPEED = 620
export const PLUNGER_MAX_SPEED = 1500
/** 全局可用球数与同场球数上限（双球玩法）。 */
export const BALLS_TOTAL = 5
export const MAX_BALLS_IN_PLAY = 2
/** nudge 次数上限（按球计）；下一次即 TILT，没收当前在场的球。 */
export const NUDGE_LIMIT = 3
/** 球心低于此 y 判落沟。 */
export const DRAIN_Y = TABLE_H + 40
/** 卡球救援：静置多久后推一把、最多推几次、推力大小。 */
export const STUCK_RESCUE_S = 1.6
export const STUCK_KICK_MAX = 3
export const RESCUE_KICK = 320
/** 得分：bumper / slingshot / drop target / 整排清空 / 磁力洞。 */
export const BUMPER_POINTS = 150
export const SLING_POINTS = 75
export const TARGET_POINTS = 60
export const BANK_BONUS = 800
export const MAGNET_POINTS = 300
/** 触发冷却（s）：bumper / slingshot / 磁力洞。 */
export const BUMPER_COOLDOWN = 0.12
export const SLING_COOLDOWN = 0.2
export const MAGNET_COOLDOWN = 1.2
/** 连击：计分命中后 3 秒内再命中计入连击；每 5 连击 +1 倍率，封顶 5。 */
export const COMBO_WINDOW = 3
export function comboMultiplier(hits: number): number {
  return Math.min(5, 1 + Math.floor(Math.max(0, hits) / 5))
}
/** 磁力洞：吸引半径与基准吸力（第 3 台才有）。 */
export const MAGNET_RADIUS = 120
export const MAGNET_PULL = 1350
/** 升到第 t+1 台所需累计分。 */
export function levelThreshold(table: number): number {
  return 2500 * table
}
/** 底部漏斗内端随台面内移量：台面越高级漏斗越宽、救球越难。 */
function funnelInset(table: number): number {
  return (Math.min(3, Math.max(1, table)) - 1) * 12
}

export type Pinball2Result = 'playing' | 'paused' | 'gameOver'

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  /** 渲染拖尾用的最近位置（每帧记录，最多 TRAIL_MAX 个）。 */
  trail: { x: number; y: number }[]
  /** 卡球检测：静置秒数与已救援次数。 */
  stuckT: number
  stuckKicks: number
}

export interface Bumper {
  x: number
  y: number
  r: number
  cd: number
}

export interface Sling {
  ax: number
  ay: number
  bx: number
  by: number
  cd: number
}

export interface DropTarget {
  x1: number
  y1: number
  x2: number
  y2: number
  down: boolean
}

export interface Wall {
  ax: number
  ay: number
  bx: number
  by: number
}

export type FlipperSide = 'left' | 'right'

export interface Flipper {
  side: FlipperSide
  px: number
  py: number
  len: number
  /** 当前 / 静置 / 抬起角度（弧度，屏幕坐标 +y 向下）。 */
  angle: number
  rest: number
  active: number
  held: boolean
  /** 当前角速度（rad/s），驱动接触点表面速度。 */
  omega: number
}

export interface Magnet {
  x: number
  y: number
  cd: number
}

export type Pinball2Event =
  | { kind: 'bumper'; x: number; y: number }
  | { kind: 'sling'; x: number; y: number }
  | { kind: 'target'; x: number; y: number }
  | { kind: 'bank'; x: number; y: number }
  | { kind: 'magnet'; x: number; y: number }
  | { kind: 'hit'; x: number; y: number }
  | { kind: 'tableUp'; table: number }
  | { kind: 'drain' }
  | { kind: 'launch'; speed: number }
  | { kind: 'tilt' }

export interface Pinball2State {
  result: Pinball2Result
  pausedFrom: Pinball2Result | null
  /** 当前台面 1..3。 */
  table: number
  score: number
  /** 尚未损失的球数（含在场与待发射）。 */
  ballsLeft: number
  /** 在场的球（最多 2）。 */
  balls: Ball[]
  flippers: { left: Flipper; right: Flipper }
  bumpers: Bumper[]
  slings: Sling[]
  targets: DropTarget[]
  walls: Wall[]
  /** 第 3 台的磁力洞；低台面为 null。 */
  magnet: Magnet | null
  /** 发射器充能 0..1。 */
  plunger: number
  plungerHeld: boolean
  /** 当前这颗球周期内已用 nudge 次数。 */
  nudgesUsed: number
  /** 连击命中数与剩余窗口（s）。 */
  combo: number
  comboTimer: number
  time: number
  msg: string
  msgTimer: number
  events: Pinball2Event[]
  rng: () => number
}

/** mulberry32 种子随机（与其它游戏一致的实现）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 拖尾最大记录点数。 */
export const TRAIL_MAX = 10

export const LEFT_PIVOT = { x: 152, y: 616 }
export const RIGHT_PIVOT = { x: 288, y: 616 }
export const FLIPPER_LEN = 62
const FLIPPER_DROOP = 0.55
const FLIPPER_LIFT = 0.6

/** 生成一侧挡板：静置下垂、抬起过水平。 */
export function makeFlipper(side: FlipperSide): Flipper {
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

/** 挡板在当前角度下的尖端坐标。 */
export function flipperTip(f: Flipper): { x: number; y: number } {
  return { x: f.px + Math.cos(f.angle) * f.len, y: f.py + Math.sin(f.angle) * f.len }
}

/**
 * 种子化台面布置：同一 (table, seed) 恒得到同一布置。bumper 数随台面
 * 递增（3/4/5），位置由 rng 在上带内抖动并保持最小间距；底部漏斗随
 * 台面变宽；第 3 台附加磁力洞。
 * @param table - 台面编号 1..3。
 * @param seed - 布置种子。
 */
export function makeTableLayout(table: number, seed: number): {
  bumpers: Bumper[]
  walls: Wall[]
  slings: Sling[]
  targets: DropTarget[]
  magnet: Magnet | null
} {
  const t = Math.min(3, Math.max(1, table))
  const rng = mulberry32(((seed >>> 0) ^ Math.imul(t, 0x9e3779b9)) >>> 0 || 7)
  const count = 2 + t
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < count; i += 1) {
    let x = 90 + rng() * 230
    let y = 115 + rng() * 150
    for (let tries = 0; tries < 40; tries += 1) {
      let ok = true
      for (const p of pts) {
        if (Math.hypot(p.x - x, p.y - y) < 52) { ok = false; break }
      }
      if (ok) break
      x = 90 + rng() * 230
      y = 115 + rng() * 150
    }
    pts.push({ x, y })
  }
  const inset = funnelInset(t)
  const walls: Wall[] = [
    // 外框：顶部弧顶（两段折线近似）+ 侧墙 + 右侧发射道外墙。
    { ax: 72, ay: 70, bx: 368, by: 70 },
    { ax: 48, ay: 104, bx: 72, by: 70 },
    { ax: 14, ay: 170, bx: 48, by: 104 },
    { ax: 14, ay: 500, bx: 14, by: 170 },
    { ax: 368, ay: 70, bx: 392, by: 104 },
    { ax: 392, ay: 104, bx: 426, by: 170 },
    { ax: 426, ay: 660, bx: 426, by: 170 },
    // 发射道：内墙 + 道底。
    { ax: 396, ay: 640, bx: 396, by: 280 },
    { ax: 396, ay: 655, bx: 426, by: 655 },
    // 底部漏斗：把球导向挡板；两端之外是出局沟。
    { ax: 14, ay: 500, bx: 134 + inset, by: 602 },
    { ax: 396, ay: 500, bx: 276 - inset, by: 602 },
  ]
  const slings: Sling[] = [
    { ax: 92, ay: 540, bx: 122, by: 574, cd: 0 },
    { ax: 348, ay: 540, bx: 318, by: 574, cd: 0 },
  ]
  const targets: DropTarget[] = [180, 220, 260].map(cx => ({
    x1: cx - 13, y1: 440, x2: cx + 13, y2: 440, down: false,
  }))
  return {
    bumpers: pts.map(p => ({ x: p.x, y: p.y, r: 16, cd: 0 })),
    walls,
    slings,
    targets,
    magnet: t >= 3 ? { x: 220, y: 250, cd: 0 } : null,
  }
}

/** 发射道待发球位（道底之上一个半径）。 */
export const BALL_SPAWN = { x: 411, y: 655 - BALL_R }

/** 球是否还在发射道内（未上桌）。 */
export function ballInLaunchZone(ball: { x: number; y: number }): boolean {
  return ball.x > 396 && ball.x < 426 && ball.y > 600
}

/** 是否还有待发射的球（发射道有球且在场未满）。 */
export function laneReady(state: Pinball2State): boolean {
  return state.balls.length < MAX_BALLS_IN_PLAY && state.ballsLeft - state.balls.length > 0
}

/** 新建一局：table 台面、seed 决定布置与随机抖动。 */
export function createGame(table: number, seed: number): Pinball2State {
  const layout = makeTableLayout(table, seed)
  return {
    result: 'playing',
    pausedFrom: null,
    table,
    score: 0,
    ballsLeft: BALLS_TOTAL,
    balls: [],
    flippers: { left: makeFlipper('left'), right: makeFlipper('right') },
    bumpers: layout.bumpers,
    slings: layout.slings,
    targets: layout.targets,
    walls: layout.walls,
    magnet: layout.magnet,
    plunger: 0,
    plungerHeld: false,
    nudgesUsed: 0,
    combo: 0,
    comboTimer: 0,
    time: 0,
    msg: '第 ' + table + ' 台 · 长按空格蓄力发射',
    msgTimer: 2.5,
    events: [],
    rng: mulberry32((seed >>> 0) || 1),
  }
}

/** 重开：回到第 1 台、固定 seed 的新一局。 */
export function restart(state: Pinball2State): void {
  Object.assign(state, createGame(1, 1))
}

/**
 * 点 p 到线段 a→b 的最近点与距离平方（纯几何）。
 * @returns 最近点坐标及 d²。
 */
export function closestPointOnSegment(
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
 * 圆-点碰撞：沿法线推出并按反弹系数反射法向速度；minKick>0 时保证至少
 * 该大小的离场法向速度（bumber/slingshot 蓄力弹射），普通表面低速贴合。
 * @param ball - 被解算的球（命中时原地修改）。
 * @param r - 碰撞等效半径。
 * @param e - 反弹系数。
 * @param minKick - 最小离场法向速度。
 * @param cx - 接触点 x。
 * @param cy - 接触点 y。
 * @returns 是否发生接触。
 */
export function bounceOffPoint(
  ball: Ball, r: number, e: number, minKick: number, cx: number, cy: number,
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

/** 球 vs 一面静态墙（反弹系数 WALL_E）。 */
function collideWall(ball: Ball, w: Wall): boolean {
  const cp = closestPointOnSegment(ball.x, ball.y, w.ax, w.ay, w.bx, w.by)
  return bounceOffPoint(ball, BALL_R, WALL_E, 0, cp.x, cp.y)
}

/**
 * 球 vs 挡板胶囊（pivot→tip 线段加 FLIPPER_R）。接触点表面速度
 * （ω ẑ × r）参与反弹：法向相对速度按反弹系数反射后，再把表面速度
 * 法向分量的一半加回给球——抬起的挡板把球甩上天。
 * @param ball - 被解算的球（命中时原地修改）。
 * @param f - 当前角度与角速度下的挡板。
 * @returns 是否发生接触。
 */
export function resolveFlipper(ball: Ball, f: Flipper): boolean {
  const tip = flipperTip(f)
  const cp = closestPointOnSegment(ball.x, ball.y, f.px, f.py, tip.x, tip.y)
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
    let out: number
    if (-vrel < REST_SPEED && Math.abs(f.omega) < 0.5) out = 0
    else out = -FLIPPER_E * vrel + Math.max(0, svn) * FLIPPER_SURFACE_FACTOR
    ball.vx += (out - vn) * nx
    ball.vy += (out - vn) * ny
  }
  return true
}

/** 等质量球-球弹性碰撞：推出重叠、交换法向分量（恢复系数 0.9）。 */
function collideBalls(a: Ball, b: Ball): boolean {
  let nx = b.x - a.x
  let ny = b.y - a.y
  const d2 = nx * nx + ny * ny
  const minD = BALL_R * 2
  if (d2 >= minD * minD || d2 === 0) return false
  const d = Math.sqrt(d2)
  nx /= d
  ny /= d
  const overlap = minD - d
  a.x -= nx * overlap / 2
  a.y -= ny * overlap / 2
  b.x += nx * overlap / 2
  b.y += ny * overlap / 2
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (vn < 0) {
    const j = (-(1 + 0.9) * vn) / 2
    a.vx -= j * nx
    a.vy -= j * ny
    b.vx += j * nx
    b.vy += j * ny
    return true
  }
  return false
}

/** 挡板推进 h 秒：抬起按住时用 FLIPPER_OMEGA、回摆用 FLIPPER_RETURN。 */
function stepFlipper(f: Flipper, held: boolean, h: number): void {
  const prev = f.angle
  if (f.side === 'left') {
    if (held) f.angle = Math.max(f.angle - FLIPPER_OMEGA * h, f.active)
    else f.angle = Math.min(f.angle + FLIPPER_RETURN * h, f.rest)
  } else {
    if (held) f.angle = Math.min(f.angle + FLIPPER_OMEGA * h, f.active)
    else f.angle = Math.max(f.angle - FLIPPER_RETURN * h, f.rest)
  }
  f.omega = h > 0 ? (f.angle - prev) / h : 0
}

/** 计分入口：连击窗口内累加命中数，得分 = 基础分 × 倍率。 */
function addScore(state: Pinball2State, base: number): number {
  state.combo += 1
  state.comboTimer = COMBO_WINDOW
  const gain = base * comboMultiplier(state.combo)
  state.score += gain
  return gain
}

/** 丢一颗球：移出在场、扣球数、重置 nudge 计数；球用尽则终局。 */
function loseBall(state: Pinball2State, index: number): void {
  state.balls.splice(index, 1)
  state.ballsLeft -= 1
  state.nudgesUsed = 0
  state.events.push({ kind: 'drain' })
  if (state.ballsLeft <= 0) {
    state.result = 'gameOver'
    state.msg = '游戏结束'
    state.msgTimer = 3
    return
  }
  state.msg = '损失一球 · 剩 ' + state.ballsLeft + ' 球'
  state.msgTimer = 2
}

/**
 * 推进整个模拟 dt 秒：固定 240Hz 子步（每帧恒定子步数，确定性模拟）。
 * 子步内依次处理重力、积分、墙、bumper、slingshot、drop target、磁力
 * 洞、挡板、球-球碰撞、阻尼与限速；帧级处理拖尾、充能、连击窗口、
 * 台面升级与卡球救援。
 * @param state - 游戏状态（原地推进）。
 * @param dt - 帧时长（秒）。
 */
export function step(state: Pinball2State, dt: number): void {
  if (state.result !== 'playing') return
  state.events = []
  state.time += dt
  if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt)
  if (state.plungerHeld) state.plunger = Math.min(1, state.plunger + dt / PLUNGER_CHARGE_S)
  if (state.comboTimer > 0) {
    state.comboTimer = Math.max(0, state.comboTimer - dt)
    if (state.comboTimer === 0) state.combo = 0
  }

  const n = Math.max(1, Math.ceil(dt / SUBSTEP_DT))
  const h = dt / n
  const damp = Math.exp(-DAMPING_K * h)

  for (let i = 0; i < n; i += 1) {
    stepFlipper(state.flippers.left, state.flippers.left.held, h)
    stepFlipper(state.flippers.right, state.flippers.right.held, h)
    for (const b of state.bumpers) if (b.cd > 0) b.cd = Math.max(0, b.cd - h)
    for (const s of state.slings) if (s.cd > 0) s.cd = Math.max(0, s.cd - h)
    if (state.magnet !== null && state.magnet.cd > 0) state.magnet.cd = Math.max(0, state.magnet.cd - h)

    for (let bi = 0; bi < state.balls.length; bi += 1) {
      const ball = state.balls[bi]!

      // 磁力洞：半径内按距离衰减吸引（第 3 台）；碰到核心则得分并弹出。
      if (state.magnet !== null) {
        const m = state.magnet
        const dx = m.x - ball.x
        const dy = m.y - ball.y
        const d = Math.hypot(dx, dy)
        if (d < MAGNET_RADIUS && d > 1e-6) {
          const pull = MAGNET_PULL * (0.3 + 0.7 * (1 - d / MAGNET_RADIUS))
          ball.vx += (dx / d) * pull * h
          ball.vy += (dy / d) * pull * h
          if (d < 16 && m.cd <= 0) {
            m.cd = MAGNET_COOLDOWN
            addScore(state, MAGNET_POINTS)
            state.events.push({ kind: 'magnet', x: m.x, y: m.y })
            const sp = Math.max(420, Math.hypot(ball.vx, ball.vy))
            ball.vx = (-dx / d) * sp
            ball.vy = (-dy / d) * sp
          }
        }
      }

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
          bounceOffPoint(ball, rr, 1.4, 260, b.x, b.y)
          addScore(state, BUMPER_POINTS)
          state.events.push({ kind: 'bumper', x: b.x, y: b.y })
        } else {
          bounceOffPoint(ball, rr, 0.45, 0, b.x, b.y)
        }
      }

      for (const s of state.slings) {
        const cp = closestPointOnSegment(ball.x, ball.y, s.ax, s.ay, s.bx, s.by)
        if (cp.d2 >= BALL_R * BALL_R) continue
        if (s.cd <= 0) {
          s.cd = SLING_COOLDOWN
          bounceOffPoint(ball, BALL_R, 2.0, 380, cp.x, cp.y)
          addScore(state, SLING_POINTS)
          state.events.push({ kind: 'sling', x: (s.ax + s.bx) / 2, y: (s.ay + s.by) / 2 })
        } else {
          bounceOffPoint(ball, BALL_R, 0.45, 0, cp.x, cp.y)
        }
      }

      for (const t of state.targets) {
        if (t.down) continue
        const cp = closestPointOnSegment(ball.x, ball.y, t.x1, t.y1, t.x2, t.y2)
        if (cp.d2 >= BALL_R * BALL_R) continue
        if (bounceOffPoint(ball, BALL_R, WALL_E, 0, cp.x, cp.y)) {
          t.down = true
          addScore(state, TARGET_POINTS)
          state.events.push({ kind: 'target', x: (t.x1 + t.x2) / 2, y: t.y1 })
          if (state.targets.every(d => d.down)) {
            addScore(state, BANK_BONUS)
            state.msg = '击落全部目标 +' + BANK_BONUS
            state.msgTimer = 2
            state.events.push({ kind: 'bank', x: 220, y: 440 })
            for (const d of state.targets) d.down = false
          }
        }
      }

      resolveFlipper(ball, state.flippers.left)
      resolveFlipper(ball, state.flippers.right)

      ball.vx *= damp
      ball.vy *= damp
      const sp = Math.hypot(ball.vx, ball.vy)
      if (sp > MAX_SPEED) {
        ball.vx *= MAX_SPEED / sp
        ball.vy *= MAX_SPEED / sp
      }
    }

    // 球-球互撞（双球玩法核心）：在场两球之间弹开。
    if (state.balls.length === 2 && collideBalls(state.balls[0]!, state.balls[1]!)) {
      const a = state.balls[0]!
      const b = state.balls[1]!
      state.events.push({ kind: 'hit', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    }

    for (let bi = state.balls.length - 1; bi >= 0; bi -= 1) {
      if (state.balls[bi]!.y > DRAIN_Y) { loseBall(state, bi); if (state.result !== 'playing') break }
    }
    if (state.result !== 'playing') break
  }

  // 帧级：拖尾记录 + 卡球救援（发射道内的球不算卡球）。
  for (const ball of state.balls) {
    ball.trail.unshift({ x: ball.x, y: ball.y })
    if (ball.trail.length > TRAIL_MAX) ball.trail.pop()
    if (ballInLaunchZone(ball) || state.plungerHeld) { ball.stuckT = 0; continue }
    const sp = Math.hypot(ball.vx, ball.vy)
    if (sp <= REST_SPEED * 1.5) {
      ball.stuckT += dt
      if (ball.stuckT >= STUCK_RESCUE_S) {
        ball.stuckT = 0
        ball.stuckKicks += 1
        if (ball.stuckKicks > STUCK_KICK_MAX) {
          ball.stuckKicks = 0
          ball.y = DRAIN_Y + 1
        } else {
          const angle = -Math.PI / 2 + (state.rng() - 0.5) * 1.2
          ball.vx += Math.cos(angle) * RESCUE_KICK
          ball.vy += Math.sin(angle) * RESCUE_KICK
        }
      }
    } else {
      ball.stuckT = 0
      if (sp > REST_SPEED * 4) ball.stuckKicks = 0
    }
  }

  // 台面递进：分数达到阈值换下一张台（保留分数与剩余球数）。
  while (state.result === 'playing' && state.table < 3 && state.score >= levelThreshold(state.table)) {
    state.table += 1
    const layout = makeTableLayout(state.table, 1)
    state.bumpers = layout.bumpers
    state.walls = layout.walls
    state.slings = layout.slings
    state.targets = layout.targets
    state.magnet = layout.magnet
    state.msg = '升级！第 ' + state.table + ' 台'
    state.msgTimer = 2
    state.events.push({ kind: 'tableUp', table: state.table })
  }
}

/** 按住 / 松开一侧挡板。 */
export function setFlipper(state: Pinball2State, side: FlipperSide, held: boolean): void {
  state.flippers[side].held = held
}

/**
 * 轻推台面：所有在场球获得一个种子随机的小冲量。每颗球周期内最多
 * NUDGE_LIMIT 次，超限触发 TILT——没收全部在场球并重置计数。
 * @returns true 表示推台生效；false 表示当前无可推的球或已终局。
 */
export function nudge(state: Pinball2State): boolean {
  if (state.result !== 'playing') return false
  if (state.balls.length === 0) return false
  if (state.nudgesUsed >= NUDGE_LIMIT) {
    state.events.push({ kind: 'tilt' })
    state.msg = 'TILT！没收在场球'
    state.msgTimer = 2.5
    for (let bi = state.balls.length - 1; bi >= 0; bi -= 1) loseBall(state, bi)
    return true
  }
  state.nudgesUsed += 1
  const r = state.rng()
  const r2 = state.rng()
  for (const ball of state.balls) {
    ball.vx += (r - 0.5) * 160
    ball.vy -= 40 + r2 * 60
  }
  return true
}

/**
 * 松开发射器：把待发球以充能比例的初速弹出（充能 0 也按最小力度）。
 * 发射道无球或在场已满 2 颗时蓄力作废。
 * @returns 弹出速度；未发射返回 0。
 */
export function plungerRelease(state: Pinball2State): number {
  const p = Math.min(1, Math.max(0, state.plunger))
  state.plunger = 0
  state.plungerHeld = false
  if (state.result !== 'playing' || !laneReady(state)) return 0
  const speed = PLUNGER_MIN_SPEED + p * (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED)
  state.balls.push({
    x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: -speed,
    trail: [], stuckT: 0, stuckKicks: 0,
  })
  state.events.push({ kind: 'launch', speed })
  return speed
}

/** 暂停 / 恢复切换（记住暂停前的结果以便恢复）。 */
export function togglePause(state: Pinball2State): void {
  if (state.result === 'paused') {
    state.result = state.pausedFrom ?? 'playing'
    state.pausedFrom = null
  } else if (state.result === 'playing' || state.result === 'gameOver') {
    state.pausedFrom = state.result
    state.result = 'paused'
  }
}

/** hashRun 的输入脚本条目：t 秒时刻触发动作 a。 */
export interface ScriptedInput {
  t: number
  a: 'leftDown' | 'leftUp' | 'rightDown' | 'rightUp' | 'nudge' | 'plungerDown' | 'plungerRelease'
}

/**
 * 确定性重放辅助：从新局起按 60Hz 步进 seconds 秒，按脚本时刻注入输入，
 * 对全部球的轨迹取哈希。同 seed + 同脚本必得同哈希（测试冻结确定性）。
 */
export function hashRun(seed: number, script: ScriptedInput[], seconds: number): number {
  const state = createGame(1, seed)
  const dt = 1 / 60
  let h = 0x811c9dc5
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    const t = i * dt
    for (const s of script) {
      if (s.t > t - 1e-9 && s.t <= t + dt - 1e-9) {
        if (s.a === 'leftDown') setFlipper(state, 'left', true)
        else if (s.a === 'leftUp') setFlipper(state, 'left', false)
        else if (s.a === 'rightDown') setFlipper(state, 'right', true)
        else if (s.a === 'rightUp') setFlipper(state, 'right', false)
        else if (s.a === 'nudge') nudge(state)
        else if (s.a === 'plungerDown') state.plungerHeld = true
        else if (s.a === 'plungerRelease') plungerRelease(state)
      }
    }
    step(state, dt)
    for (const b of state.balls) {
      h = Math.imul(h ^ Math.round(b.x * 10), 0x01000193) >>> 0
      h = Math.imul(h ^ Math.round(b.y * 10), 0x01000193) >>> 0
      h = (h + Math.round(b.vx) + Math.round(b.vy) * 3) >>> 0
    }
    h = (h ^ state.score) >>> 0
  }
  return h >>> 0
}
