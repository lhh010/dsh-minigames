/**
 * Mini Bowling pure logic: a top-down ten-pin lane. The ball is thrown from
 * the foul line with aim (±25°) + power; lane friction is exponential, and in
 * the back third of the lane the ball's spin applies a lateral hook
 * acceleration. Pins are light circles (mass 0.25× ball) in the standard
 * triangle; collisions are elastic with restitution (0.75 ball-pin, 0.8
 * pin-pin). A pin is knocked when it is ever faster than {@link KNOCK_SPEED}
 * or displaced beyond {@link KNOCK_DISP} from its spot; knocked pins are
 * swept once the ball has passed the pin deck, and the next roll in the same
 * frame plays the survivors.
 *
 * Scoring is real ten-pin (strike = 10 + next two rolls, spare = 10 + next
 * roll) via the pure {@link scoreGame} function; a level is a 5-frame game
 * whose LAST frame uses 10th-frame bonus-roll rules (so a perfect level is
 * exactly 150), and levels advance on pinfall thresholds 60/80/100/120/150.
 *
 * All randomness (rack jitter, re-rack seeds) flows through seeded mulberry32
 * streams, so identical seeds + throw scripts produce identical pinfall.
 */
export const LANE_W = 200
export const LANE_H = 640
export const BALL_RADIUS = 13
/** Foul line y; the ball is placed just behind it. */
export const FOUL_Y = LANE_H - 32
export const PIN_R = 7
/** Ball mass; pins are 0.25× this. */
export const BALL_MASS = 1
export const PIN_MASS = 0.25
export const BALL_PIN_E = 0.75
export const PIN_PIN_E = 0.8
/** Exponential lane friction per second for the ball (v *= exp(-k·dt)). */
export const BALL_FRICTION_K = 0.35
/** Pins slide on the deck with much higher friction. */
export const PIN_FRICTION_K = 3.2
export const STOP_SPEED = 6
/** Substep ceiling: the ball is fast and pins are small — no tunneling. */
export const MAX_SUBSTEP_DT = 1 / 240
export const MAX_THROW_SPEED = 400
/** Throws below this power are ignored (taps do not launch the ball). */
export const MIN_THROW_POWER = 0.2
/** Aim range: ±25° from straight up-lane. */
export const MAX_AIM = (25 * Math.PI) / 180
/** Lateral hook acceleration (units/s²) applied in the back third while spinning. */
export const HOOK_ACCEL = 40
/** Hook region starts here (back third of the lane, y grows downward). */
export const HOOK_Y = LANE_H / 3
export const KNOCK_SPEED = 40
export const KNOCK_DISP = 4
/** Center-to-center pin spacing in the triangle. */
export const PIN_GAP = 30
export const HEAD_PIN_Y = 110
/** Ball above this y has fully passed the deck → sweep knocked pins. */
export const DECK_TOP = 20
/** A level is a 5-frame game with 10th-frame rules on its last frame. */
export const FRAMES_PER_LEVEL = 5
export const LEVEL_THRESHOLDS = [60, 80, 100, 120, 150] as const
/** Rack positional jitter amplitude (fraction of pin radius). */
export const RACK_JITTER = 0.04
/** Kickback wall restitution for pins (lane sides and the back wall). */
export const KICKBACK_E = 0.35

export type BowlingPhase = 'aiming' | 'rolling' | 'paused' | 'levelWon' | 'gameOver'

/** A moving circle participant (the ball and pins both satisfy it). */
export interface Body {
  x: number
  y: number
  vx: number
  vy: number
}

export interface BowlingBall extends Body {
  /** True once the ball is in a gutter: straight, no hook, no pin hits. */
  gutter: boolean
  /** True while the ball is on the lane (set false when it exits the top or rests). */
  live: boolean
  atRest: boolean
}

export interface Pin extends Body {
  id: number
  spotX: number
  spotY: number
  knocked: boolean
  /** Knocked AND already swept off the deck (excluded from the simulation). */
  swept: boolean
  atRest: boolean
}

export type BowlingEvent =
  | { kind: 'pin'; x: number; y: number }
  | { kind: 'gutter' }
  | { kind: 'strike' }
  | { kind: 'spare' }
  | { kind: 'levelWon'; score: number }
  | { kind: 'gameOver'; score: number }

export interface BowlingState {
  phase: BowlingPhase
  level: number
  /** Flat pinfall per roll for the whole level game (scoreGame input). */
  rolls: number[]
  /** 0-based frame index within the level. */
  frame: number
  /** Pinfall of the rolls already made in the current frame. */
  frameRolls: number[]
  /** Pins knocked by the roll currently in flight (counted at sweep/settle). */
  rollKnocked: number
  pins: Pin[]
  ball: BowlingBall
  /** Aim in radians, 0 = straight up-lane, positive = rightward. */
  aimAngle: number
  /** Charge 0..1 (Space held). */
  power: number
  /** Spin -1..1 (A = left hook, D = right hook), set while charging. */
  spin: number
  msg: string
  msgTimer: number
  events: BowlingEvent[]
  /** Seeded stream for re-rack seeds (rack itself uses derived seeds). */
  rng: () => number
  /** Level seed so restarts replay the identical rack sequence. */
  seed: number
  pausedFrom: BowlingPhase | null
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

/**
 * Real ten-pin scoring over a flat rolls array (10 per frame, strike = one
 * roll). Frame N < last: strike scores 10 + next two rolls, else two rolls
 * with spare = 10 + next roll. The LAST frame grants bonus rolls
 * (strike/spare → a third roll) exactly like the 10th frame, so a perfect
 * sheet scores 30 × frames. Missing future rolls count 0, so a partial sheet
 * scores its resolved frames only.
 * @param rolls - flat pinfall per roll.
 * @param frames - frame count (10 for a full game, 5 for a level).
 * @returns the cumulative score.
 */
export function scoreGame(rolls: readonly number[], frames = 10): number {
  let i = 0
  let total = 0
  for (let f = 0; f < frames; f += 1) {
    const last = f === frames - 1
    const r0 = rolls[i] ?? 0
    const r1 = rolls[i + 1] ?? 0
    const r2 = rolls[i + 2] ?? 0
    if (last) {
      if (r0 === 10 || r0 + r1 === 10) total += r0 + r1 + r2
      else total += r0 + r1
    } else if (r0 === 10) {
      total += 10 + r1 + r2
      i += 1
    } else if (r0 + r1 === 10) {
      total += 10 + r2
      i += 2
    } else {
      total += r0 + r1
      i += 2
    }
  }
  return total
}

/** Score threshold a level's 5-frame game must reach to advance. */
export function levelThreshold(level: number): number {
  return LEVEL_THRESHOLDS[(level - 1) % LEVEL_THRESHOLDS.length]!
}

/** Level seed for a (level, runSeed) pair: same inputs → same racks. */
function levelSeed(level: number, seed: number): number {
  return ((seed ^ Math.imul(level, 0x9e3779b9)) >>> 0) || 1
}

/**
 * The standard 10-pin triangle: 4 rows (1-2-3-4) with the head pin nearest
 * the foul line, seeded micro-jitter that never overlaps pins.
 * @param seed - seed for the jitter stream.
 */
export function rackPins(seed: number): Pin[] {
  const rng = mulberry32(seed)
  const rowGap = (PIN_GAP * Math.sqrt(3)) / 2
  const pins: Pin[] = []
  let id = 0
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      const j = () => (rng() * 2 - 1) * RACK_JITTER * PIN_R
      const x = LANE_W / 2 + (col - row / 2) * PIN_GAP + j()
      const y = HEAD_PIN_Y - row * rowGap + j()
      pins.push({
        id: (id += 1), x, y, vx: 0, vy: 0,
        spotX: LANE_W / 2 + (col - row / 2) * PIN_GAP,
        spotY: HEAD_PIN_Y - row * rowGap,
        knocked: false, swept: false, atRest: true,
      })
    }
  }
  return pins
}

function freshBall(): BowlingBall {
  return { x: LANE_W / 2, y: FOUL_Y - BALL_RADIUS - 4, vx: 0, vy: 0, gutter: false, live: true, atRest: true }
}

/** Fresh state for a level (mount, restart, and level advance). */
export function createLevel(level: number, seed: number): BowlingState {
  return {
    phase: 'aiming',
    level,
    rolls: [],
    frame: 0,
    frameRolls: [],
    rollKnocked: 0,
    pins: rackPins(levelSeed(level, seed)),
    ball: freshBall(),
    aimAngle: 0,
    power: 0,
    spin: 0,
    msg: `第 ${level} 关 · 5 局 ${levelThreshold(level)} 分过关`,
    msgTimer: 2.5,
    events: [],
    rng: mulberry32(((seed >>> 0) || 1) ^ Math.imul(level, 0x85ebca6b)),
    seed,
    pausedFrom: null,
  }
}

/**
 * Elastic collision between two circles with masses ma/mb and restitution e,
 * along the contact normal. Positions are separated proportionally to inverse
 * mass when overlapping. Returns true when an approaching pair in contact was
 * resolved.
 * @param a - first body (mutated).
 * @param b - second body (mutated).
 * @param ra - radius of a.
 * @param rb - radius of b.
 * @param ma - mass of a.
 * @param mb - mass of b.
 * @param e - restitution in [0, 1].
 */
export function resolveCircleCollision(
  a: Body, b: Body, ra: number, rb: number, ma: number, mb: number, e: number,
): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const minD = ra + rb
  const d2 = dx * dx + dy * dy
  if (d2 >= minD * minD || d2 === 0) return false
  const d = Math.sqrt(d2)
  const nx = dx / d
  const ny = dy / d
  const van = a.vx * nx + a.vy * ny
  const vbn = b.vx * nx + b.vy * ny
  if (van - vbn <= 0) return false // already separating
  const j = ((1 + e) * (van - vbn)) / (1 / ma + 1 / mb)
  a.vx -= (j / ma) * nx
  a.vy -= (j / ma) * ny
  b.vx += (j / mb) * nx
  b.vy += (j / mb) * ny
  const overlap = minD - d
  const share = overlap / (1 / ma + 1 / mb)
  a.x -= nx * share / ma
  a.y -= ny * share / ma
  b.x += nx * share / mb
  b.y += ny * share / mb
  return true
}

/** Mark a pin knocked the moment it is fast or displaced beyond tolerance. */
function checkKnock(state: BowlingState, pin: Pin): void {
  if (pin.knocked) return
  const speed = Math.hypot(pin.vx, pin.vy)
  const disp = Math.hypot(pin.x - pin.spotX, pin.y - pin.spotY)
  if (speed > KNOCK_SPEED || disp > KNOCK_DISP) {
    pin.knocked = true
    state.rollKnocked += 1
    state.events.push({ kind: 'pin', x: pin.x, y: pin.y })
  }
}

/** Kickback walls: pins stay on the lane (sides + back wall), low bounce. */
function applyPinWalls(pin: Pin): void {
  const e = KICKBACK_E
  if (pin.x - PIN_R < 0 && pin.vx < 0) { pin.x = PIN_R; pin.vx = -pin.vx * e }
  if (pin.x + PIN_R > LANE_W && pin.vx > 0) { pin.x = LANE_W - PIN_R; pin.vx = -pin.vx * e }
  if (pin.y - PIN_R < 0 && pin.vy < 0) { pin.y = PIN_R; pin.vy = -pin.vy * e }
}

/** Ball leaves the lane through a side gutter: straight, hook off, no hits. */
function checkGutter(ball: BowlingBall): void {
  if (ball.gutter || !ball.live) return
  if (ball.x < BALL_RADIUS || ball.x > LANE_W - BALL_RADIUS) {
    ball.gutter = true
    ball.vx = 0
    ball.x = Math.min(Math.max(ball.x, BALL_RADIUS / 2), LANE_W - BALL_RADIUS / 2)
  }
}

/**
 * Advance the simulation by dt seconds using fixed substeps (each ≤
 * MAX_SUBSTEP_DT). Runs only while a roll is in flight; pausing freezes
 * everything. Ends the roll (via {@link finishRoll}) once the ball is gone
 * or at rest and every live pin has settled.
 */
export function step(state: BowlingState, dt: number): void {
  state.events = []
  if (state.phase !== 'rolling') return
  if (state.msgTimer > 0) state.msgTimer = Math.max(0, state.msgTimer - dt)
  const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_DT))
  const h = dt / n
  const ballDamp = Math.exp(-BALL_FRICTION_K * h)
  const pinDamp = Math.exp(-PIN_FRICTION_K * h)
  for (let s = 0; s < n; s += 1) {
    const ball = state.ball
    if (ball.live) {
      ball.x += ball.vx * h
      ball.y += ball.vy * h
      checkGutter(ball)
      // Hook: lateral acceleration in the back third, from the spin sign.
      if (!ball.gutter && ball.y < HOOK_Y) ball.vx += state.spin * HOOK_ACCEL * h
      ball.vx *= ballDamp
      ball.vy *= ballDamp
      if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
        ball.vx = 0
        ball.vy = 0
        ball.atRest = true
      } else ball.atRest = false
      if (ball.y < -BALL_RADIUS) ball.live = false // exited past the pit
    }
    for (const pin of state.pins) {
      if (pin.swept) continue
      pin.x += pin.vx * h
      pin.y += pin.vy * h
      applyPinWalls(pin)
      pin.vx *= pinDamp
      pin.vy *= pinDamp
      if (Math.hypot(pin.vx, pin.vy) < STOP_SPEED) {
        pin.vx = 0
        pin.vy = 0
        pin.atRest = true
      } else pin.atRest = false
      checkKnock(state, pin)
    }
    // Collisions: ball-pin (only a live, on-lane ball) then pin-pin pairs.
    if (state.ball.live && !state.ball.gutter) {
      for (const pin of state.pins) {
        if (pin.swept) continue
        resolveCircleCollision(state.ball, pin, BALL_RADIUS, PIN_R, BALL_MASS, PIN_MASS, BALL_PIN_E)
      }
    }
    for (let i = 0; i < state.pins.length; i += 1) {
      const a = state.pins[i]!
      if (a.swept) continue
      for (let k = i + 1; k < state.pins.length; k += 1) {
        const b = state.pins[k]!
        if (!b.swept) resolveCircleCollision(a, b, PIN_R, PIN_R, PIN_MASS, PIN_MASS, PIN_PIN_E)
      }
    }
    // Sweep: once the ball is past the deck, remove the fallen pins from play.
    if (state.ball.y < DECK_TOP) {
      for (const pin of state.pins) {
        if (pin.knocked && !pin.swept) {
          pin.swept = true
          pin.vx = 0
          pin.vy = 0
        }
      }
    }
  }
  const settled = !state.ball.live || state.ball.atRest || state.ball.gutter
  if (settled && state.pins.every(p => p.swept || p.atRest)) finishRoll(state)
}

/** Standing pins back on their spots (they survived the roll untouched). */
function respotStanding(pins: Pin[]): void {
  for (const pin of pins) {
    // A pin still unswept at settle (e.g. the ball stopped on the deck) is
    // removed now; only true survivors keep playing.
    if (pin.knocked) { pin.swept = true; continue }
    pin.x = pin.spotX
    pin.y = pin.spotY
    pin.vx = 0
    pin.vy = 0
    pin.atRest = true
  }
}

/** Full fresh rack for the next frame / bonus roll (seeded, deterministic). */
function rerack(state: BowlingState): void {
  const seed = Math.floor(state.rng() * 0xffffffff) >>> 0
  state.pins = rackPins(seed || 1)
}

/**
 * Called once the roll settles: records pinfall, sweeps the fallen pins, and
 * advances the frame bookkeeping (10th-frame rules on the last frame). Ends
 * the level game after FRAMES_PER_LEVEL frames and grades it against the
 * level threshold.
 */
export function finishRoll(state: BowlingState): void {
  const count = state.rollKnocked
  state.rolls.push(count)
  state.frameRolls.push(count)
  const fr = state.frameRolls
  const last = state.frame === FRAMES_PER_LEVEL - 1
  const strike = fr.length === 1 && fr[0] === 10
  const spare = fr.length === 2 && fr[0]! + fr[1]! === 10
  if (state.ball.gutter) state.events.push({ kind: 'gutter' })
  if (strike) state.events.push({ kind: 'strike' })
  else if (spare) state.events.push({ kind: 'spare' })
  let frameOver: boolean
  if (last) {
    // Last frame: strike or spare earns a bonus roll (up to three rolls).
    frameOver = fr.length === 3 || (fr.length === 2 && fr[0]! + fr[1]! < 10)
  } else {
    frameOver = strike || fr.length === 2
  }
  if (frameOver) {
    state.frame += 1
    state.frameRolls = []
  }
  // Fresh rack for a new frame, or in the last frame whenever the deck was
  // cleared (strike / spare); otherwise survivors play the next roll.
  const standing = state.pins.filter(p => !p.knocked).length
  if (frameOver || standing === 0) rerack(state)
  else respotStanding(state.pins)
  state.rollKnocked = 0
  state.ball = freshBall()
  state.power = 0
  state.spin = 0
  if (state.frame >= FRAMES_PER_LEVEL) {
    const score = scoreGame(state.rolls, FRAMES_PER_LEVEL)
    if (score >= levelThreshold(state.level)) {
      state.phase = 'levelWon'
      state.msg = `过关！本局 ${score} 分`
      state.msgTimer = 3
      state.events.push({ kind: 'levelWon', score })
    } else {
      state.phase = 'gameOver'
      state.msg = `${score} 分 · 未达 ${levelThreshold(state.level)} 分`
      state.msgTimer = 3
      state.events.push({ kind: 'gameOver', score })
    }
    return
  }
  state.phase = 'aiming'
}

/**
 * Throw the ball with the current aim, power, and spin. Only legal while
 * aiming; power is clamped to [MIN_THROW_POWER, 1].
 * @param state - the game state (mutated).
 * @returns true when the throw fired.
 */
export function throwBall(state: BowlingState): boolean {
  if (state.phase !== 'aiming') return false
  const p = Math.min(1, Math.max(MIN_THROW_POWER, state.power))
  const v = p * MAX_THROW_SPEED
  const a = Math.min(MAX_AIM, Math.max(-MAX_AIM, state.aimAngle))
  state.ball = {
    x: LANE_W / 2, y: FOUL_Y - BALL_RADIUS - 4,
    vx: Math.sin(a) * v, vy: -Math.cos(a) * v,
    gutter: false, live: true, atRest: false,
  }
  state.aimAngle = a
  state.power = p
  state.phase = 'rolling'
  state.rollKnocked = 0
  state.msgTimer = 0
  return true
}

/** Current running score of the level game (resolved frames only). */
export function currentScore(state: Readonly<BowlingState>): number {
  return scoreGame(state.rolls, FRAMES_PER_LEVEL)
}

/** Restart the CURRENT level: same seed → identical rack sequence. */
export function restartLevel(state: BowlingState): void {
  Object.assign(state, createLevel(state.level, state.seed))
}

/** Advance to the next level (fresh 5-frame game, thresholds wrap). */
export function nextLevel(state: BowlingState): void {
  Object.assign(state, createLevel(state.level + 1, state.seed))
}

/** Toggle pause; remembers the phase to restore (stored-remainder pattern). */
export function togglePause(state: BowlingState): void {
  if (state.phase === 'paused') {
    state.phase = state.pausedFrom ?? 'aiming'
    state.pausedFrom = null
  } else if (state.phase === 'aiming' || state.phase === 'rolling') {
    state.pausedFrom = state.phase
    state.phase = 'paused'
  }
}
