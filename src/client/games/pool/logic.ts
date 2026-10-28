/**
 * Mini Pool pure logic: a single-player 2D billiards challenge. Nine numbered
 * balls rack in a diamond on the foot spot; the player shoots the cue ball
 * with a clamped power and must pot all nine within a per-level shot budget.
 *
 * All randomness flows through an injected mulberry32 rng (rack jitter), so a
 * level seed always produces the same rack. The renderer (render.ts) only
 * draws state; the glue (index.ts) owns input and audio.
 */

/** Playfield inner size (cushion faces); the 2:1 table ratio. */
export const TABLE_W = 200
export const TABLE_H = 100
export const BALL_R = 3.2
/** Pocket radius ≈ 1.6 × ball radius: a ball pots when its center enters. */
export const POCKET_R = BALL_R * 1.6
/** Exponential friction rate per second at level 1 (v *= exp(-k·dt)). */
export const BASE_FRICTION_K = 0.9
/** Friction increase per level above 1 (harder tables run heavier cloth). */
export const FRICTION_K_PER_LEVEL = 0.06
export const FRICTION_K_MAX = 1.5
/** Cushion restitution (axis-aligned walls, except pocket mouths). */
export const CUSHION_RESTITUTION = 0.92
/** Ball-ball collision restitution (equal masses). */
export const BALL_RESTITUTION = 0.95
/** Speeds below this snap to zero and the ball is marked at-rest. */
export const STOP_SPEED = 0.6
/** Fixed physics substeps per frame (substep dt ≤ 1/48 at the dt clamp). */
export const SUBSTEPS = 4
export const MAX_SUBSTEP_DT = 1 / 48
/** Cue speed at full power. */
export const MAX_SHOT_SPEED = 260
/** Score per potted object ball. */
export const POT_POINTS = 100
/** Bonus per remaining shot on a level win. */
export const SHOT_BONUS = 20
/** Extra shots charged for potting the cue ball (a scratch). */
export const FOUL_PENALTY_SHOTS = 1
/** Rack positional jitter amplitude (fraction of ball radius). */
export const RACK_JITTER = 0.05
/** Beyond this distance past a rail rim a mouth-riding ball has drained. */
export const RIM_DRAIN = 1

export const HEAD_SPOT_X = TABLE_W * 0.25
export const FOOT_SPOT_X = TABLE_W * 0.72
export const CENTER_Y = TABLE_H / 2

export type PoolResult = 'ready' | 'aiming' | 'moving' | 'paused' | 'levelWon' | 'gameOver'

export interface Ball {
  /** 0 = cue ball, 1..9 = numbered object balls. */
  id: number
  x: number
  y: number
  vx: number
  vy: number
  potted: boolean
  atRest: boolean
}

export type PoolEvent =
  | { kind: 'pot'; id: number }
  | { kind: 'foul' }
  | { kind: 'win'; bonus: number }
  | { kind: 'lose' }

export interface PoolState {
  result: PoolResult
  level: number
  shotsUsed: number
  score: number
  /** Cumulative potted-ball count (scored already). */
  pottedCount: number
  balls: Ball[]
  aimAngle: number
  /** Charge 0..1 (held Space); a drag supplies it directly. */
  power: number
  msg: string
  msgTimer: number
  events: PoolEvent[]
  rng: () => number
  /** Result to restore when unpausing ('aiming' or 'moving'). */
  pausedFrom: PoolResult | null
}

/** mulberry32 seeded PRNG (identical to the other games' rng). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The six pocket centers: four corners plus two side middles on the long rails. */
export function pocketPositions(): { x: number; y: number }[] {
  return [
    { x: 0, y: 0 },
    { x: TABLE_W / 2, y: 0 },
    { x: TABLE_W, y: 0 },
    { x: 0, y: TABLE_H },
    { x: TABLE_W / 2, y: TABLE_H },
    { x: TABLE_W, y: TABLE_H },
  ]
}

/** Shot budget for a level: 12 + level*2. */
export function shotsAllowed(level: number): number {
  return 12 + level * 2
}

/** Exponential friction rate for a level (grows with level, capped). */
export function frictionK(level: number): number {
  return Math.min(FRICTION_K_MAX, BASE_FRICTION_K + (level - 1) * FRICTION_K_PER_LEVEL)
}

/** Level seed for a (level, runSeed) pair: same inputs → same rack. */
function levelSeed(level: number, seed: number): number {
  return ((seed ^ Math.imul(level, 0x9e3779b9)) >>> 0) || 1
}

/** True when the point is inside any pocket (ball center pots). */
export function inPocket(x: number, y: number): boolean {
  for (const p of pocketPositions()) {
    const dx = x - p.x
    const dy = y - p.y
    if (dx * dx + dy * dy < POCKET_R * POCKET_R) return true
  }
  return false
}

/**
 * Build the 9-ball diamond rack (rows 1-2-3-2-1; the 9 sits in the center)
 * at the foot spot with tiny seeded positional jitter.
 */
export function rackBalls(seed: number): Ball[] {
  const rng = mulberry32(seed)
  const s = BALL_R * 2 + 0.05
  const dx = s * Math.sqrt(3) / 2
  // Diamond layout: apex ball 1 at the foot spot, 9 in the middle row center.
  const layout: { id: number; row: number; col: number }[] = [
    { id: 1, row: 0, col: 0 },
    { id: 2, row: 1, col: 0 }, { id: 3, row: 1, col: 1 },
    { id: 4, row: 2, col: 0 }, { id: 9, row: 2, col: 1 }, { id: 5, row: 2, col: 2 },
    { id: 6, row: 3, col: 0 }, { id: 7, row: 3, col: 1 },
    { id: 8, row: 4, col: 0 },
  ]
  const balls: Ball[] = [{
    id: 0, x: HEAD_SPOT_X, y: CENTER_Y, vx: 0, vy: 0, potted: false, atRest: true,
  }]
  for (const e of layout) {
    const j = () => (rng() * 2 - 1) * RACK_JITTER * BALL_R
    balls.push({
      id: e.id,
      x: FOOT_SPOT_X + e.row * dx + j(),
      y: CENTER_Y + (e.col - e.row / 2) * s + j(),
      vx: 0, vy: 0, potted: false, atRest: true,
    })
  }
  return balls
}

/** Fresh state for a level (used at mount, restart, and level advance). */
export function createLevel(level: number, seed: number): PoolState {
  return {
    result: 'aiming',
    level,
    shotsUsed: 0,
    score: 0,
    pottedCount: 0,
    balls: rackBalls(levelSeed(level, seed)),
    aimAngle: 0,
    power: 0,
    msg: `第 ${level} 关 · ${shotsAllowed(level)} 杆内清台`,
    msgTimer: 2.5,
    events: [],
    rng: mulberry32((seed >>> 0) || 1),
    pausedFrom: null,
  }
}

/**
 * Equal-mass elastic collision along the contact normal with restitution e:
 * the normal velocity components are exchanged scaled by e (a head-on hit
 * swaps them); tangential components are untouched. Positions are separated
 * along the normal when the balls overlap. Returns true when a collision
 * (approaching pair in contact) was resolved.
 * @param a - first ball (mutated).
 * @param b - second ball (mutated).
 * @param e - restitution in [0, 1].
 */
export function resolveBallCollision(a: Ball, b: Ball, e: number): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d2 = dx * dx + dy * dy
  const minD = BALL_R * 2
  if (d2 >= minD * minD || d2 === 0) return false
  const d = Math.sqrt(d2)
  const nx = dx / d
  const ny = dy / d
  const van = a.vx * nx + a.vy * ny
  const vbn = b.vx * nx + b.vy * ny
  if (van - vbn <= 0) return false // already separating
  const c1 = (1 - e) / 2
  const c2 = (1 + e) / 2
  const van2 = c1 * van + c2 * vbn
  const vbn2 = c2 * van + c1 * vbn
  a.vx += (van2 - van) * nx
  a.vy += (van2 - van) * ny
  b.vx += (vbn2 - vbn) * nx
  b.vy += (vbn2 - vbn) * ny
  // Positional correction: split the overlap so balls never sink into each other.
  const overlap = (minD - d) / 2
  a.x -= nx * overlap
  a.y -= ny * overlap
  b.x += nx * overlap
  b.y += ny * overlap
  a.atRest = false
  b.atRest = false
  return true
}

/** True when the point is in the mouth of a pocket on the given axis wall. */
function inPocketMouth(x: number, y: number): boolean {
  const r = POCKET_R
  for (const p of pocketPositions()) {
    if (Math.abs(x - p.x) < r && Math.abs(y - p.y) < r) return true
  }
  return false
}

/**
 * Cushion bounce for one ball against the four rails, skipping wall segments
 * inside pocket mouths (the ball there rolls into the pocket instead).
 */
export function applyCushions(b: Ball): void {
  const e = CUSHION_RESTITUTION
  if (b.x - BALL_R < 0 && !inPocketMouth(b.x, b.y) && b.vx < 0) {
    b.x = BALL_R
    b.vx = -b.vx * e
    b.atRest = false
  }
  if (b.x + BALL_R > TABLE_W && !inPocketMouth(b.x, b.y) && b.vx > 0) {
    b.x = TABLE_W - BALL_R
    b.vx = -b.vx * e
    b.atRest = false
  }
  if (b.y - BALL_R < 0 && !inPocketMouth(b.x, b.y) && b.vy < 0) {
    b.y = BALL_R
    b.vy = -b.vy * e
    b.atRest = false
  }
  if (b.y + BALL_R > TABLE_H && !inPocketMouth(b.x, b.y) && b.vy > 0) {
    b.y = TABLE_H - BALL_R
    b.vy = -b.vy * e
    b.atRest = false
  }
}

/**
 * Advance the simulation by dt seconds using fixed substeps (each ≤
 * MAX_SUBSTEP_DT) for tunneling-free cushions and stable contacts. Only runs
 * while balls are moving; pausing freezes everything.
 */
export function step(state: PoolState, dt: number): void {
  state.events = []
  if (state.result !== 'moving') return
  if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt)
  const k = frictionK(state.level)
  const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_DT))
  const h = dt / n
  const damp = Math.exp(-k * h)
  for (let s = 0; s < n; s += 1) {
    for (const b of state.balls) {
      if (b.potted) continue
      b.x += b.vx * h
      b.y += b.vy * h
      applyCushions(b)
    }
    for (let i = 0; i < state.balls.length; i += 1) {
      const a = state.balls[i]!
      if (a.potted) continue
      for (let j = i + 1; j < state.balls.length; j += 1) {
        const b = state.balls[j]!
        if (!b.potted) resolveBallCollision(a, b, BALL_RESTITUTION)
      }
    }
    for (const b of state.balls) {
      if (b.potted) continue
      if (inPocket(b.x, b.y)
        || b.x < -RIM_DRAIN || b.x > TABLE_W + RIM_DRAIN
        || b.y < -RIM_DRAIN || b.y > TABLE_H + RIM_DRAIN) {
        b.potted = true
        b.vx = 0
        b.vy = 0
        b.atRest = true
        if (b.id !== 0) {
          state.pottedCount += 1
          state.score += POT_POINTS
          state.events.push({ kind: 'pot', id: b.id })
        }
        continue
      }
      b.vx *= damp
      b.vy *= damp
      if (Math.hypot(b.vx, b.vy) < STOP_SPEED) {
        b.vx = 0
        b.vy = 0
        b.atRest = true
      } else {
        b.atRest = false
      }
    }
  }
  if (state.balls.every(b => b.potted || b.atRest)) finishShot(state)
}

/** Respot the cue ball at the head spot (nudged if occupied). */
export function respotCue(state: PoolState): void {
  const cue = state.balls[0]!
  cue.potted = false
  cue.vx = 0
  cue.vy = 0
  cue.atRest = true
  let x = HEAD_SPOT_X
  let y = CENTER_Y
  for (let guard = 0; guard < 64; guard += 1) {
    const hit = state.balls.some(b => b.id !== 0 && !b.potted && Math.hypot(b.x - x, b.y - y) < BALL_R * 2)
    if (!hit) break
    x += BALL_R * 0.5
    if (x > TABLE_W - BALL_R * 2) { x = HEAD_SPOT_X; y += BALL_R; }
  }
  cue.x = x
  cue.y = y
}

/**
 * Called once every ball is at rest or potted: applies the scratch penalty,
 * then resolves win (all nine potted → bonus) / lose (budget exhausted).
 */
export function finishShot(state: PoolState): void {
  const cue = state.balls[0]!
  if (cue.potted) {
    respotCue(state)
    state.shotsUsed += FOUL_PENALTY_SHOTS
    state.msg = '白球落袋 · 罚 1 杆'
    state.msgTimer = 2
    state.events.push({ kind: 'foul' })
  }
  const allPotted = state.balls.every(b => b.id === 0 || b.potted)
  if (allPotted) {
    const bonus = Math.max(0, shotsAllowed(state.level) - state.shotsUsed) * SHOT_BONUS
    state.score += bonus
    state.result = 'levelWon'
    state.msg = `清台！奖励 +${bonus}`
    state.msgTimer = 3
    state.events.push({ kind: 'win', bonus })
    return
  }
  if (state.shotsUsed >= shotsAllowed(state.level)) {
    state.result = 'gameOver'
    state.msg = '杆数用尽'
    state.msgTimer = 3
    state.events.push({ kind: 'lose' })
    return
  }
  state.result = 'aiming'
  state.power = 0
}

/**
 * Fire the cue ball: charges one shot, sets the cue velocity from the clamped
 * power, and enters the moving state. Only legal while aiming.
 * @param state - the game state (mutated).
 * @param angle - shot direction in radians (0 = +x).
 * @param power - 0..1 charge; clamped.
 */
export function shoot(state: PoolState, angle: number, power: number): boolean {
  if (state.result !== 'aiming') return false
  const cue = state.balls[0]!
  if (cue.potted) return false
  const p = Math.min(1, Math.max(0, power))
  const v = p * MAX_SHOT_SPEED
  cue.vx = Math.cos(angle) * v
  cue.vy = Math.sin(angle) * v
  cue.atRest = false
  state.aimAngle = angle
  state.power = p
  state.shotsUsed += 1
  state.result = 'moving'
  state.msgTimer = 0
  return true
}

/** Restart the CURRENT level: same seed → the identical rack. */
export function restartLevel(state: PoolState, seed: number): void {
  const fresh = createLevel(state.level, seed)
  Object.assign(state, fresh)
}

/** Advance to the next level (keeps the cumulative score and run seed). */
export function nextLevel(state: PoolState, seed: number): void {
  const level = state.level + 1
  const score = state.score
  Object.assign(state, createLevel(level, seed), { score })
}

/** Toggle pause; remembers the result to restore (stored-remainder pattern). */
export function togglePause(state: PoolState): void {
  if (state.result === 'paused') {
    state.result = state.pausedFrom ?? 'aiming'
    state.pausedFrom = null
  } else if (state.result === 'aiming' || state.result === 'moving') {
    state.pausedFrom = state.result
    state.result = 'paused'
  }
}

export interface AimGuidePoint {
  x: number
  y: number
}

export interface AimGuide {
  /** Polyline from the cue ball to the first impact and one bounce beyond. */
  path: AimGuidePoint[]
  /** Id of the first object ball the ray touches, or null. */
  hitBallId: number | null
  /** Where the cue ball will first contact a ball or wall. */
  impact: AimGuidePoint
}

/**
 * Ray-circle intersection: smallest t > 0 where the ray hits a circle of
 * radius r around c, or null. Pure geometry, shared with tests.
 */
export function rayCircle(
  ox: number, oy: number, dx: number, dy: number, cx: number, cy: number, r: number,
): number | null {
  const fx = ox - cx
  const fy = oy - cy
  const b = fx * dx + fy * dy
  const c = fx * fx + fy * fy - r * r
  if (c > 0 && b > 0) return null
  const disc = b * b - c
  if (disc < 0) return null
  const sq = Math.sqrt(disc)
  const t = -b - sq
  if (t > 1e-9) return t
  const t2 = -b + sq
  if (t2 > 1e-9) return t2
  return null
}

/** Smallest t > 0 where the ray hits an axis-aligned wall (0..TABLE_W/H box). */
export function rayWall(ox: number, oy: number, dx: number, dy: number): number {
  let t = Infinity
  if (dx > 0) t = Math.min(t, (TABLE_W - ox) / dx)
  else if (dx < 0) t = Math.min(t, -ox / dx)
  if (dy > 0) t = Math.min(t, (TABLE_H - oy) / dy)
  else if (dy < 0) t = Math.min(t, -oy / dy)
  return Number.isFinite(t) && t > 0 ? t : 0
}

/**
 * Aim guide: cast the aim ray from the cue ball until the first ball contact
 * (inflated to 2R center distance) or wall, then show one bounce beyond it.
 * Pure — no state mutation.
 */
export function computeAimGuide(balls: readonly Ball[], angle: number, maxLen = TABLE_W * 2): AimGuide {
  const cue = balls.find(b => b.id === 0 && !b.potted)
  const zero: AimGuide = { path: [], hitBallId: null, impact: { x: 0, y: 0 } }
  if (cue === undefined) return zero
  let ox = cue.x
  let oy = cue.y
  let dx = Math.cos(angle)
  let dy = Math.sin(angle)
  const path: AimGuidePoint[] = [{ x: ox, y: oy }]
  let hitBallId: number | null = null
  for (let leg = 0; leg < 2; leg += 1) {
    let best = maxLen
    const tw = rayWall(ox, oy, dx, dy)
    if (tw > 0 && tw < best) best = tw
    for (const b of balls) {
      if (b.id === 0 || b.potted) continue
      const t = rayCircle(ox, oy, dx, dy, b.x, b.y, BALL_R * 2)
      if (t !== null && t < best && leg === 0) {
        best = t
        hitBallId = b.id
      }
    }
    const ix = ox + dx * best
    const iy = oy + dy * best
    path.push({ x: ix, y: iy })
    if (leg === 0) {
      if (hitBallId !== null || best >= maxLen) break
      // Reflect the direction off the wall the ray hit.
      if (ix <= 0 || ix >= TABLE_W) dx = -dx
      if (iy <= 0 || iy >= TABLE_H) dy = -dy
      ox = ix
      oy = iy
    }
  }
  const impact = path[1] ?? { x: cue.x, y: cue.y }
  return { path, hitBallId, impact }
}
