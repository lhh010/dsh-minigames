/**
 * 弹球台 Pinball pure logic: a vertical table simulated with real 2D physics —
 * gravity, fixed adaptive substeps (≥240Hz at rest, faster while the ball is
 * fast so nothing tunnels), circle-vs-segment walls, round bumpers with an
 * outward impulse kick, slingshot faces, a drop-target bank, and capsule
 * flippers whose surface velocity at the contact point imparts momentum to
 * the ball (the trick that makes real pinball feel).
 *
 * All randomness flows through an injected mulberry32 rng (nudge jitter), so
 * the same seed + input script always produces the identical trajectory. The
 * renderer (render.ts) only draws state; the glue (index.ts) owns input.
 */

/** Logical playfield size. */
export const TABLE_W = 420
export const TABLE_H = 680
export const BALL_R = 9
/** Downward gravity in px/s². */
export const GRAVITY = 980
/** Baseline substep rate (dt ≤ 1/240 at rest; speed adds more substeps). */
export const BASE_SUBSTEP_DT = 1 / 240
/** Max ball travel per substep (fraction of the radius) — anti-tunneling. */
export const MAX_SUBSTEP_TRAVEL = BALL_R * 0.5
/** Absolute speed clamp (also bounds the substep count). */
export const MAX_SPEED = 2400
/** Wall / slant restitution. */
export const WALL_E = 0.55
/** Normal approach speeds below this settle instead of micro-bouncing. */
export const REST_SPEED = 40
/** Global linear damping per second (exp form) — keeps the table live but bounded. */
export const DAMPING_K = 0.12
/** Bumper: restitution, min outward kick px/s, score, re-trigger cooldown. */
export const BUMPER_E = 1.4
export const BUMPER_KICK = 260
export const BUMPER_POINTS = 150
export const BUMPER_COOLDOWN = 0.12
/** Slingshot: restitution (impulse kick along the normal), min kick, score. */
export const SLING_E = 2.0
export const SLING_KICK = 380
export const SLING_POINTS = 75
export const SLING_COOLDOWN = 0.2
/** Drop targets: score each, bonus for clearing the 3-bank. */
export const TARGET_POINTS = 50
export const BANK_BONUS = 500
/** Flippers: pivot capsule radius, swing speed, spring return speed. */
export const FLIPPER_R = 8.5
export const FLIPPER_OMEGA = 18
export const FLIPPER_RETURN = 12
/** Flipper collision restitution and how much surface velocity is imparted. */
export const FLIPPER_E = 0.4
export const FLIPPER_SURFACE_FACTOR = 0.45
/** Plunger: charge time to full, launch speed range px/s. */
export const PLUNGER_CHARGE_S = 1.4
export const PLUNGER_MIN_SPEED = 650
export const PLUNGER_MAX_SPEED = 1450
/** Balls per game. */
export const BALLS_PER_GAME = 3
/** Nudge: 3 within this window → tilt; tilt disables flippers this long. */
export const NUDGE_WINDOW = 5
export const TILT_SECONDS = 2
/** Ball is lost once its center sinks this far past the bottom. */
export const DRAIN_Y = TABLE_H + 30
/** Score needed to advance from level l (cumulative within one game). */
export function levelThreshold(level: number): number {
  return 2000 * level
}

/** Anti-trap: this many hits within TRAP_WINDOW seconds sates the bumper;
 * it stops kicking/scoring until the ball stays clear for TRAP_CLEAR seconds. */
export const TRAP_HITS = 3
export const TRAP_WINDOW = 1.0
export const TRAP_CLEAR = 0.35
/** While sated the bumper only nudges the ball out (no kick, no score). */
export const SATED_E = 0.45

export type PinballResult = 'playing' | 'paused' | 'gameOver'

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
}

export interface Bumper {
  x: number
  y: number
  r: number
  /** Re-trigger cooldown remaining (s). */
  cd: number
  /** Hits inside the current anti-trap window (resets after TRAP_WINDOW). */
  trapHits: number
  /** Time accumulated in the current anti-trap window (s). */
  trapT: number
  /** Sated: rapid re-hits detected — bumper goes quiet until the ball leaves. */
  sated: boolean
  /** Continuous time the ball has stayed clear of this bumper's margin (s). */
  clearT: number
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
  /** Current / rest / raised angles in radians (atan2 convention, +y down). */
  angle: number
  rest: number
  active: number
  held: boolean
  /** Current angular velocity (rad/s) — drives contact surface velocity. */
  omega: number
}

export type PinballEvent =
  | { kind: 'bumper'; x: number; y: number }
  | { kind: 'sling'; x: number; y: number }
  | { kind: 'target'; x: number; y: number }
  | { kind: 'bank'; x: number; y: number }
  | { kind: 'levelUp'; level: number }
  | { kind: 'drain' }
  | { kind: 'launch'; speed: number }
  | { kind: 'tilt' }

export interface PinballState {
  result: PinballResult
  /** Result to restore when unpausing. */
  pausedFrom: PinballResult | null
  level: number
  score: number
  ballsLeft: number
  ball: Ball
  flippers: { left: Flipper; right: Flipper }
  bumpers: Bumper[]
  slings: Sling[]
  targets: DropTarget[]
  walls: Wall[]
  /** Plunger charge 0..1 while Space is held. */
  plunger: number
  plungerHeld: boolean
  /** Recent nudge times (s since game start) inside the tilt window. */
  nudges: number[]
  /** Tilt penalty remaining (s); flippers are disabled while > 0. */
  tiltTimer: number
  time: number
  msg: string
  msgTimer: number
  events: PinballEvent[]
  rng: () => number
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

/** Left flipper pivot (bottom-left of the playfield, just past the outlane). */
export const LEFT_PIVOT = { x: 146, y: 612 }
export const RIGHT_PIVOT = { x: 274, y: 612 }
/** Flipper rest droop and raised angle magnitudes (rad from horizontal). */
const FLIPPER_DROOP = 0.55
const FLIPPER_LIFT = 0.6

export const FLIPPER_LEN = 68

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

/** Tip of a flipper at its current angle. */
export function flipperTip(f: Flipper): { x: number; y: number } {
  return { x: f.px + Math.cos(f.angle) * f.len, y: f.py + Math.sin(f.angle) * f.len }
}

/** The three seeded bumper layouts; level N uses preset (N-1) % 3. */
export const BUMPER_PRESETS: { x: number; y: number }[][] = [
  [{ x: 140, y: 200 }, { x: 280, y: 200 }, { x: 210, y: 290 }],
  [{ x: 120, y: 250 }, { x: 300, y: 250 }, { x: 210, y: 150 }],
  [{ x: 150, y: 140 }, { x: 270, y: 240 }, { x: 200, y: 320 }],
]

function makeBumpers(level: number): Bumper[] {
  const preset = BUMPER_PRESETS[(level - 1) % BUMPER_PRESETS.length]!
  return preset.map(p => ({ x: p.x, y: p.y, r: 16, cd: 0, trapHits: 0, trapT: 0, sated: false, clearT: TRAP_CLEAR }))
}

/** Slingshot active faces (the angled kickers above each flipper). */
function makeSlings(): Sling[] {
  return [
    { ax: 86, ay: 534, bx: 114, by: 566, cd: 0 },
    { ax: 334, ay: 534, bx: 306, by: 566, cd: 0 },
  ]
}

/** Drop-target bank: three horizontal plates under the bumpers. */
function makeTargets(): DropTarget[] {
  return [172, 210, 248].map(cx => ({
    x1: cx - 13, y1: 430, x2: cx + 13, y2: 430, down: false,
  }))
}

/** Static wall polyline list: outer box, launch lane, and the bottom slants. */
function makeWalls(): Wall[] {
  return [
    // Outer box (top slants funnel down to the side walls).
    { ax: 64, ay: 60, bx: 356, by: 60 },
    { ax: 12, ay: 150, bx: 64, by: 60 },
    { ax: 12, ay: 500, bx: 12, by: 150 },
    { ax: 356, ay: 60, bx: 408, by: 150 },
    { ax: 408, ay: 650, bx: 408, by: 150 },
    // Launch lane: inner wall + floor (ball starts on the floor).
    { ax: 378, ay: 640, bx: 378, by: 260 },
    { ax: 378, ay: 645, bx: 408, by: 645 },
    // Bottom slants guiding balls to the flippers; the gaps past their ends
    // are the outlanes down to the drain.
    { ax: 12, ay: 500, bx: 128, by: 598 },
    { ax: 378, ay: 500, bx: 292, by: 598 },
  ]
}

/** Ball spawn: resting on the launch-lane floor. */
export const BALL_SPAWN = { x: 393, y: 645 - BALL_R }

/** True while the ball sits at the launch-lane bottom (plunger may fire). */
export function ballInLaunchZone(ball: Ball): boolean {
  return ball.x > 378 && ball.x < 408 && ball.y > 600
}

/** Fresh state: one game at `level` with the preset rack and a live ball. */
export function createGame(level: number, seed: number): PinballState {
  return {
    result: 'playing',
    pausedFrom: null,
    level,
    score: 0,
    ballsLeft: BALLS_PER_GAME,
    ball: { x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: 0 },
    flippers: { left: makeFlipper('left'), right: makeFlipper('right') },
    bumpers: makeBumpers(level),
    slings: makeSlings(),
    targets: makeTargets(),
    walls: makeWalls(),
    plunger: 0,
    plungerHeld: false,
    nudges: [],
    tiltTimer: 0,
    time: 0,
    msg: `第 ${level} 关 · ${levelThreshold(level)} 分升级`,
    msgTimer: 2.5,
    events: [],
    rng: mulberry32((seed >>> 0) || 1),
  }
}

/** Restart the table: same level and preset, zeroed score and balls. */
export function restart(state: PinballState): void {
  Object.assign(state, createGame(state.level, 1))
}

/**
 * Closest point on segment (a→b) to p, with the squared distance.
 * @returns the closest point and d² (pure geometry).
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
 * Circle-vs-segment collision against a static surface: push the ball out
 * along the contact normal and reflect the normal velocity with restitution
 * `e`. Surfaces with `minKick > 0` (bumpers/slingshots) always leave at least
 * that much outward speed; plain walls settle below {@link REST_SPEED}.
 * @param ball - the ball (mutated on contact).
 * @param r - ball radius.
 * @param e - restitution.
 * @param minKick - minimum outward normal speed after the bounce (0 = none).
 * @param cx - closest point on the segment.
 * @param cy - its y coordinate.
 * @returns true when a contact was resolved.
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

/** Ball vs one wall segment (restitution {@link WALL_E}). */
function collideWall(ball: Ball, w: Wall): boolean {
  const cp = closestPointOnSegment(ball.x, ball.y, w.ax, w.ay, w.bx, w.by)
  return bounceOffPoint(ball, BALL_R, WALL_E, 0, cp.x, cp.y)
}

/** True while the flipper responds to input (tilt penalty disables them). */
export function flippersEnabled(state: PinballState): boolean {
  return state.tiltTimer <= 0
}

/**
 * Ball vs flipper capsule (segment pivot→tip with radius {@link FLIPPER_R}).
 * The contact point's surface velocity ω×r participates in the bounce: the
 * normal relative velocity is reflected with restitution, then a fraction of
 * the surface velocity along the normal is added — a rising flipper throws
 * the ball up.
 * @param ball - the ball (mutated on contact).
 * @param f - the flipper at its current angle and omega.
 * @returns true when a contact was resolved.
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
  // Surface velocity of the contact point: ω ẑ × (contact − pivot).
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

/**
 * Advance one flipper by h seconds: swing to the active angle while held
 * (and not tilted) at {@link FLIPPER_OMEGA}, spring back at
 * {@link FLIPPER_RETURN}; records the effective angular velocity.
 */
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

/** Advance the whole simulation by dt seconds (adaptive fixed substeps). */
export function step(state: PinballState, dt: number): void {
  if (state.result !== 'playing') return
  state.events = []
  state.time += dt
  if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt)
  if (state.tiltTimer > 0) state.tiltTimer = Math.max(0, state.tiltTimer - dt)
  if (state.plungerHeld) state.plunger = Math.min(1, state.plunger + dt / PLUNGER_CHARGE_S)

  const speed = Math.hypot(state.ball.vx, state.ball.vy)
  const n = Math.min(96, Math.max(1, Math.ceil(dt / BASE_SUBSTEP_DT), Math.ceil((dt * speed) / MAX_SUBSTEP_TRAVEL)))
  const h = dt / n
  const damp = Math.exp(-DAMPING_K * h)

  for (let i = 0; i < n; i += 1) {
    const enabled = flippersEnabled(state)
    stepFlipper(state.flippers.left, enabled && state.flippers.left.held, h)
    stepFlipper(state.flippers.right, enabled && state.flippers.right.held, h)

    for (const b of state.bumpers) if (b.cd > 0) b.cd = Math.max(0, b.cd - h)
    for (const s of state.slings) if (s.cd > 0) s.cd = Math.max(0, s.cd - h)

    const ball = state.ball
    ball.vy += GRAVITY * h
    ball.x += ball.vx * h
    ball.y += ball.vy * h

    for (const w of state.walls) collideWall(ball, w)

    for (const b of state.bumpers) {
      // Anti-trap bookkeeping: a ball orbiting between a bumper and a wall
      // re-triggers every cooldown and farms score forever. Three hits inside
      // one window sate the bumper — quiet until the ball stays clear.
      b.trapT += h
      if (b.trapT >= TRAP_WINDOW) { b.trapT = 0; b.trapHits = 0 }
      const nearR = BALL_R + b.r + 8
      const dxw = ball.x - b.x
      const dyw = ball.y - b.y
      if (dxw * dxw + dyw * dyw < nearR * nearR) {
        b.clearT = 0
      } else {
        b.clearT += h
        if (b.sated && b.clearT >= TRAP_CLEAR) {
          b.sated = false
          b.trapHits = 0
          b.trapT = 0
        }
      }
      const cp = { x: b.x, y: b.y }
      const dx = ball.x - b.x
      const dy = ball.y - b.y
      if (dx * dx + dy * dy >= (BALL_R + b.r) * (BALL_R + b.r)) continue
      if (b.sated) {
        // Quiet separation only: no kick, no score, no orbit.
        bounceOffPoint(ball, BALL_R + b.r, SATED_E, 0, cp.x, cp.y)
        continue
      }
      if (b.cd <= 0) {
        b.cd = BUMPER_COOLDOWN
        bounceOffPoint(ball, BALL_R + b.r, BUMPER_E, BUMPER_KICK, cp.x, cp.y)
        state.score += BUMPER_POINTS
        state.events.push({ kind: 'bumper', x: b.x, y: b.y })
        b.trapHits += 1
        if (b.trapHits >= TRAP_HITS) {
          b.trapHits = 0
          b.sated = true
          b.clearT = 0
        }
      } else {
        // Cooldown: separate positions only, no re-kick and no re-score.
        bounceOffPoint(ball, BALL_R + b.r, 0, 0, cp.x, cp.y)
      }
    }

    for (const s of state.slings) {
      const cp = closestPointOnSegment(ball.x, ball.y, s.ax, s.ay, s.bx, s.by)
      if (cp.d2 >= BALL_R * BALL_R) continue
      if (s.cd <= 0) {
        s.cd = SLING_COOLDOWN
        bounceOffPoint(ball, BALL_R, SLING_E, SLING_KICK, cp.x, cp.y)
        state.score += SLING_POINTS
        state.events.push({ kind: 'sling', x: (s.ax + s.bx) / 2, y: (s.ay + s.by) / 2 })
      } else {
        bounceOffPoint(ball, BALL_R, 0, 0, cp.x, cp.y)
      }
    }

    for (const t of state.targets) {
      if (t.down) continue
      const cp = closestPointOnSegment(ball.x, ball.y, t.x1, t.y1, t.x2, t.y2)
      if (cp.d2 >= BALL_R * BALL_R) continue
      const hit = bounceOffPoint(ball, BALL_R, WALL_E, 0, cp.x, cp.y)
      if (hit) {
        t.down = true
        state.score += TARGET_POINTS
        state.events.push({ kind: 'target', x: (t.x1 + t.x2) / 2, y: t.y1 })
        if (state.targets.every(dt2 => dt2.down)) {
          state.score += BANK_BONUS
          state.msg = `击落全部目标 +${BANK_BONUS}`
          state.msgTimer = 2
          state.events.push({ kind: 'bank', x: 210, y: 430 })
          for (const dt2 of state.targets) dt2.down = false
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

    if (ball.y > DRAIN_Y) { loseBall(state); break }
  }

  // Level advance: score thresholds swap in the next bumper preset.
  while (state.result === 'playing' && state.score >= levelThreshold(state.level)) {
    state.level += 1
    state.bumpers = makeBumpers(state.level)
    state.msg = `升级！第 ${state.level} 关`
    state.msgTimer = 2
    state.events.push({ kind: 'levelUp', level: state.level })
  }
}

/** Ball drained: consume a ball, respawn in the lane or end the game. */
function loseBall(state: PinballState): void {
  state.ballsLeft -= 1
  state.events.push({ kind: 'drain' })
  if (state.ballsLeft <= 0) {
    state.result = 'gameOver'
    state.msg = '游戏结束'
    state.msgTimer = 3
    return
  }
  state.ball.x = BALL_SPAWN.x
  state.ball.y = BALL_SPAWN.y
  state.ball.vx = 0
  state.ball.vy = 0
  state.plunger = 0
  state.msg = `损失一球 · 剩 ${state.ballsLeft} 球`
  state.msgTimer = 2
}

/** Hold or release a flipper (ignored while tilted — flippers are dead then). */
export function setFlipper(state: PinballState, side: FlipperSide, held: boolean): void {
  state.flippers[side].held = held
}

/**
 * Nudge the table: a tiny seeded-random impulse. Three nudges inside
 * {@link NUDGE_WINDOW} seconds tilt the machine for {@link TILT_SECONDS}.
 * @returns true when the nudge applied.
 */
export function nudge(state: PinballState): boolean {
  if (state.result !== 'playing') return false
  const r = state.rng()
  const r2 = state.rng()
  state.ball.vx += (r - 0.5) * 130
  state.ball.vy -= 50 + r2 * 50
  state.nudges.push(state.time)
  state.nudges = state.nudges.filter(t => state.time - t <= NUDGE_WINDOW)
  if (state.nudges.length >= 3) {
    state.tiltTimer = TILT_SECONDS
    state.nudges = []
    state.msg = 'TILT！挡板暂时失灵'
    state.msgTimer = TILT_SECONDS
    state.events.push({ kind: 'tilt' })
  }
  return true
}

/**
 * Release the plunger: fire the lane ball upward with speed proportional to
 * the clamped charge. No-op (charge discarded) when the ball is elsewhere.
 * @returns the launch speed, or 0 when nothing fired.
 */
export function plungerRelease(state: PinballState): number {
  const p = Math.min(1, Math.max(0, state.plunger))
  state.plunger = 0
  state.plungerHeld = false
  if (state.result !== 'playing' || !ballInLaunchZone(state.ball)) return 0
  const speed = PLUNGER_MIN_SPEED + p * (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED)
  state.ball.vx = 0
  state.ball.vy = -speed
  state.events.push({ kind: 'launch', speed })
  return speed
}

/** Toggle pause; remembers the result to restore (stored-remainder pattern). */
export function togglePause(state: PinballState): void {
  if (state.result === 'paused') {
    state.result = state.pausedFrom ?? 'playing'
    state.pausedFrom = null
  } else if (state.result === 'playing' || state.result === 'gameOver') {
    state.pausedFrom = state.result
    state.result = 'paused'
  }
}

/** Input script entry for {@link hashRun}: fire `a` at time `t` seconds. */
export interface ScriptedInput {
  t: number
  a: 'leftDown' | 'leftUp' | 'rightDown' | 'rightUp' | 'nudge' | 'plungerDown' | 'plungerRelease'
}

/**
 * Determinism helper: simulate `seconds` at a fixed 60Hz from a fresh game,
 * applying the scripted inputs at their times, and hash the ball trajectory.
 * Same seed + script → same hash; used by tests to freeze determinism.
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
    h = Math.imul(h ^ Math.round(state.ball.x * 10), 0x01000193) >>> 0
    h = Math.imul(h ^ Math.round(state.ball.y * 10), 0x01000193) >>> 0
    h = (h + Math.round(state.ball.vx) + Math.round(state.ball.vy) * 3) >>> 0
  }
  return h >>> 0
}
