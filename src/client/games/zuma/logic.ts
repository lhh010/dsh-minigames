/**
 * Zuma (祖玛) pure logic: a chain of colored balls rolls along a fixed
 * S-curve track toward a sink hole. The shooter at screen center fires a
 * ball into the chain; 3+ consecutive same-color balls explode, the chain
 * splits, and the trailing segment pulls forward at a constant closing
 * speed — matching junction colors merge and can chain-react.
 *
 * All randomness flows through an injected mulberry32 rng reseeded
 * deterministically per level (baseSeed ^ level), so a restart of the same
 * level replays identically. The renderer (render.ts) only draws state.
 */

export const LOGICAL_W = 480
export const LOGICAL_H = 640
/** Ball radius in logical px; adjacent chain balls touch (SPACING = 2R). */
export const BALL_R = 11
export const SPACING = BALL_R * 2
/** Level speed model: 26 + 4N px/s, capped. */
export const BASE_SPEED = 26
export const SPEED_PER_LEVEL = 4
export const MAX_SPEED = 66
/** Extra speed a trailing segment gains while closing a gap (constant close rate). */
export const GAP_CLOSE_SPEED = 70
export const SHOT_SPEED = 460
export const AIM_SPEED = 2.2
/** Gap-closing merge award per ball of the trailing segment. */
export const MERGE_POINTS_PER_BALL = 5
/** Explosion award per ball, multiplied by the chain-reaction depth. */
export const MATCH_POINTS_PER_BALL = 10
/** The head ball is lost once it reaches the sink rim. */
export const SINK_R = 20
/** Shooter mount (screen center of the lower half, clear of the track). */
export const SHOOTER = { x: 250, y: 430 } as const

/** Stable palette; per-level color count slices a prefix. */
export const PALETTE = ['#f7768e', '#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7'] as const

// ---------------------------------------------------------------------------
// Track: two cubic Bézier segments forming an S-curve from the spawn point
// (top-left) to the sink (bottom-right), pre-sampled into an arc-length
// table so position(s) is parameterized by distance travelled.
// ---------------------------------------------------------------------------

interface BezierSeg {
  p0: [number, number]
  c1: [number, number]
  c2: [number, number]
  p1: [number, number]
}

const SEGMENTS: BezierSeg[] = [
  { p0: [60, 70], c1: [430, 40], c2: [450, 300], p1: [140, 330] },
  { p0: [140, 330], c1: [30, 380], c2: [90, 610], p1: [440, 590] },
]

function bezierPoint(seg: BezierSeg, t: number): { x: number; y: number } {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * seg.p0[0] + b * seg.c1[0] + c * seg.c2[0] + d * seg.p1[0],
    y: a * seg.p0[1] + b * seg.c1[1] + c * seg.c2[1] + d * seg.p1[1],
  }
}

interface TrackTable {
  xs: number[]
  ys: number[]
  /** Cumulative arc length at each sample. */
  cum: number[]
  length: number
}

function buildTrack(): TrackTable {
  const xs: number[] = []
  const ys: number[] = []
  const cum: number[] = []
  let total = 0
  let prevX = NaN
  let prevY = NaN
  const PER_SEG = 800
  for (const seg of SEGMENTS) {
    for (let i = 0; i <= PER_SEG; i += 1) {
      const p = bezierPoint(seg, i / PER_SEG)
      if (Number.isFinite(prevX)) total += Math.hypot(p.x - prevX, p.y - prevY)
      if (p.x === prevX && p.y === prevY) continue
      xs.push(p.x)
      ys.push(p.y)
      cum.push(total)
      prevX = p.x
      prevY = p.y
    }
  }
  return { xs, ys, cum, length: total }
}

const TRACK: TrackTable = buildTrack()

/** Total track length in px (fixed; the track itself has no randomness). */
export const TRACK_LENGTH = TRACK.length

/** A point on the track at arc length s (clamped), with the tangent angle. */
export function trackAt(s: number): { x: number; y: number; a: number } {
  const clamped = Math.min(Math.max(s, 0), TRACK.length)
  // Binary search the arc-length table.
  let lo = 0
  let hi = TRACK.cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (TRACK.cum[mid]! < clamped) lo = mid + 1
    else hi = mid
  }
  const i = lo
  if (i === 0) {
    const a = Math.atan2(TRACK.ys[1]! - TRACK.ys[0]!, TRACK.xs[1]! - TRACK.xs[0]!)
    return { x: TRACK.xs[0]!, y: TRACK.ys[0]!, a }
  }
  const c0 = TRACK.cum[i - 1]!
  const c1 = TRACK.cum[i]!
  const f = c1 > c0 ? (clamped - c0) / (c1 - c0) : 0
  const j = Math.min(i + 1, TRACK.xs.length - 1)
  const a = Math.atan2(TRACK.ys[j]! - TRACK.ys[i - 1]!, TRACK.xs[j]! - TRACK.xs[i - 1]!)
  return {
    x: TRACK.xs[i - 1]! + (TRACK.xs[i]! - TRACK.xs[i - 1]!) * f,
    y: TRACK.ys[i - 1]! + (TRACK.ys[i]! - TRACK.ys[i - 1]!) * f,
    a,
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** One chain ball: track position s (head-first array: index 0 = largest s). */
export interface Ball {
  s: number
  /** Palette color index. */
  color: number
}

export interface Shot {
  x: number
  y: number
  vx: number
  vy: number
  color: number
}

export type GameResult = 'ready' | 'playing' | 'paused' | 'over'

export type ZumaEvent =
  | { kind: 'fire' }
  | { kind: 'insert'; at: number }
  | { kind: 'match'; count: number; depth: number; points: number; x: number; y: number }
  | { kind: 'merge'; count: number; points: number; x: number; y: number }
  | { kind: 'miss' }
  | { kind: 'level'; level: number }
  | { kind: 'over' }

export interface ZumaState {
  result: GameResult
  baseSeed: number
  level: number
  score: number
  /** Chain-reaction depth for combo scoring; resets on each player insert. */
  chainDepth: number
  balls: Ball[]
  /** Balls still to spawn this level. */
  remaining: number
  spawnTimer: number
  shot: Shot | null
  /** Shooter aim angle (radians; -PI/2 points up). */
  angle: number
  current: number
  next: number
  t: number
  msg: string
  msgTimer: number
  events: ZumaEvent[]
  rng: () => number
}

export interface ZumaInput {
  left: boolean
  right: boolean
}

/** mulberry32 seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Level speed in px/s: 26 + 4N, capped at MAX_SPEED. */
export function levelSpeed(level: number): number {
  return Math.min(BASE_SPEED + SPEED_PER_LEVEL * level, MAX_SPEED)
}

/** Color count: 4 on levels 1-2, 5 from level 3. */
export function colorCount(level: number): number {
  return level <= 2 ? 4 : 5
}

/** Spawn interval grows slightly with the level. */
export function spawnInterval(level: number): number {
  return 0.8 + level * 0.05
}

/** Total chain balls a level spawns. */
export function levelBallCount(level: number): number {
  return 36 + level * 6
}

/** Deterministic per-level seed: restart replays the same layout. */
export function levelSeed(baseSeed: number, level: number): number {
  return ((baseSeed >>> 0) ^ Math.imul(level, 0x9e3779b9)) >>> 0
}

function pickColor(state: ZumaState): number {
  const present = new Set(state.balls.map(b => b.color))
  const pool = present.size > 0 ? [...present] : Array.from({ length: colorCount(state.level) }, (_, i) => i)
  return pool[(state.rng() * pool.length) | 0]!
}

/** (Re)start a level: fresh chain, deterministic rng, shooter reloaded. */
export function startLevel(state: ZumaState, level: number): void {
  state.level = level
  state.rng = mulberry32(levelSeed(state.baseSeed, level))
  state.balls = []
  state.remaining = levelBallCount(level)
  state.spawnTimer = 0.45
  state.shot = null
  state.chainDepth = 1
  state.current = pickColor(state)
  state.next = pickColor(state)
  state.msg = `第 ${level} 关`
  state.msgTimer = 1.4
}

/** A fresh game in the ready state at level 1 (glue overrides the level). */
export function createState(seed = 1): ZumaState {
  const state: ZumaState = {
    result: 'ready',
    baseSeed: seed >>> 0,
    level: 1,
    score: 0,
    chainDepth: 1,
    balls: [],
    remaining: 0,
    spawnTimer: 0,
    shot: null,
    angle: -Math.PI / 2,
    current: 0,
    next: 1,
    t: 0,
    msg: '',
    msgTimer: 0,
    events: [],
    rng: mulberry32(seed),
  }
  startLevel(state, 1)
  state.result = 'ready'
  return state
}

/** Start (or restart after over) the current level; resets the score. */
export function startRun(state: ZumaState): void {
  if (state.result !== 'ready' && state.result !== 'over') return
  state.score = 0
  startLevel(state, state.level)
  state.result = 'playing'
}

/** Toggle between playing and paused; no-op otherwise. */
export function togglePause(state: ZumaState): void {
  if (state.result === 'playing') state.result = 'paused'
  else if (state.result === 'paused') state.result = 'playing'
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function touching(a: Ball, b: Ball): boolean {
  return a.s - b.s <= SPACING + 0.5
}

/** Maximal same-color run (of touching balls) containing index idx: [lo, hi]. */
export function runAround(balls: readonly Ball[], idx: number): [number, number] {
  const color = balls[idx]!.color
  let lo = idx
  let hi = idx
  while (lo > 0 && balls[lo - 1]!.color === color && touching(balls[lo - 1]!, balls[lo]!)) lo -= 1
  while (hi < balls.length - 1 && balls[hi + 1]!.color === color && touching(balls[hi]!, balls[hi + 1]!)) hi += 1
  return [lo, hi]
}

/**
 * Resolve a potential match around idx; explodes a 3+ run and awards
 * 10/ball × depth. Returns the exploded count (0 when no match).
 */
export function resolveMatches(state: ZumaState, idx: number, depth: number): number {
  const balls = state.balls
  if (idx < 0 || idx >= balls.length) return 0
  const [lo, hi] = runAround(balls, idx)
  const count = hi - lo + 1
  if (count < 3) return 0
  const mid = balls[(lo + hi) >> 1]!
  const p = trackAt(mid.s)
  balls.splice(lo, count)
  const points = MATCH_POINTS_PER_BALL * count * depth
  state.score += points
  state.chainDepth = depth
  state.events.push({ kind: 'match', count, depth, points, x: p.x, y: p.y })
  return count
}

// ---------------------------------------------------------------------------
// Chain motion
// ---------------------------------------------------------------------------

/**
 * Advance the chain one dt: the head group moves at the level speed; each
 * trailing group gains GAP_CLOSE_SPEED so its gap to the group ahead closes
 * at a constant rate. On contact the group snaps flush, a gap-closed merge
 * awards 5/ball of the trailing segment, and matching junction colors
 * chain-react (explode at depth+1).
 */
export function advanceChain(state: ZumaState, dt: number): void {
  const balls = state.balls
  if (balls.length === 0) return
  const spd = levelSpeed(state.level)
  let i = 0
  while (i < balls.length) {
    let j = i + 1
    while (j < balls.length && touching(balls[j - 1]!, balls[j]!)) j += 1
    const v = i === 0 ? spd : spd + GAP_CLOSE_SPEED
    for (let k = i; k < j; k += 1) balls[k]!.s += v * dt
    if (i > 0) {
      const prevTail = balls[i - 1]!
      const front = balls[i]!
      // Remaining gap to the contact point; separate groups always start a
      // frame with > 0.5 left (smaller gaps count as touching = one group),
      // so anything below that here is a closure this frame: snap flush.
      const gapLeft = prevTail.s - SPACING - front.s
      if (gapLeft < 0.5) {
        const size = j - i
        for (let k = i; k < j; k += 1) balls[k]!.s += gapLeft
        const p = trackAt(front.s)
        const points = MERGE_POINTS_PER_BALL * size * state.chainDepth
        state.score += points
        state.events.push({ kind: 'merge', count: size, points, x: p.x, y: p.y })
        if (prevTail.color === front.color) resolveMatches(state, i, state.chainDepth + 1)
      }
    }
    i = j
  }
}

// ---------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------

/**
 * Insert a fired ball directly after chain ball hitIdx: it takes position
 * hit.s - SPACING and the whole tail side shifts back by SPACING (spacing
 * behind is preserved). Then the insertion match resolves at depth 1.
 */
export function insertBall(state: ZumaState, hitIdx: number, color: number): void {
  const balls = state.balls
  const hit = balls[hitIdx]!
  balls.splice(hitIdx + 1, 0, { s: hit.s - SPACING, color })
  for (let k = hitIdx + 2; k < balls.length; k += 1) balls[k]!.s -= SPACING
  state.events.push({ kind: 'insert', at: hitIdx + 1 })
  state.chainDepth = 1
  resolveMatches(state, hitIdx + 1, 1)
}

/** Aim the shooter at a logical-space point. */
export function setAim(state: ZumaState, x: number, y: number): void {
  state.angle = Math.atan2(y - SHOOTER.y, x - SHOOTER.x)
}

/**
 * Fire the current ball along the aim angle. The shooter never fires a
 * color absent from the chain (rerolled from chain colors when stale).
 */
export function fire(state: ZumaState): boolean {
  if (state.result !== 'playing' || state.shot !== null) return false
  const present = new Set(state.balls.map(b => b.color))
  if (present.size > 0 && !present.has(state.current)) state.current = pickColor(state)
  state.shot = {
    x: SHOOTER.x,
    y: SHOOTER.y,
    vx: Math.cos(state.angle) * SHOT_SPEED,
    vy: Math.sin(state.angle) * SHOT_SPEED,
    color: state.current,
  }
  state.current = state.next
  state.next = pickColor(state)
  state.events.push({ kind: 'fire' })
  return true
}

function updateShot(state: ZumaState, dt: number): void {
  const shot = state.shot
  if (shot === null) return
  shot.x += shot.vx * dt
  shot.y += shot.vy * dt
  if (shot.x < -40 || shot.x > LOGICAL_W + 40 || shot.y < -40 || shot.y > LOGICAL_H + 40) {
    state.shot = null
    state.events.push({ kind: 'miss' })
    return
  }
  // First intersection: the chain ball nearest the shot center within
  // contact distance (sum of radii).
  let best = -1
  let bestD = BALL_R * 2
  for (let i = 0; i < state.balls.length; i += 1) {
    const p = trackAt(Math.min(Math.max(state.balls[i]!.s, 0), TRACK_LENGTH))
    const d = Math.hypot(p.x - shot.x, p.y - shot.y)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  if (best >= 0) {
    insertBall(state, best, shot.color)
    state.shot = null
  }
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

/**
 * Advance the game by dt seconds under the held aim inputs. Mutates the
 * state in place; only runs while playing.
 */
export function step(state: ZumaState, dt: number, input?: ZumaInput): void {
  state.events = []
  if (state.result !== 'playing') return
  state.t += dt
  if (input?.left === true) state.angle -= AIM_SPEED * dt
  if (input?.right === true) state.angle += AIM_SPEED * dt

  advanceChain(state, dt)

  // Spawning: a new ball appears at s=0 once the tail has moved clear and
  // the spawn timer has elapsed (a blocked tail holds a due spawn).
  state.spawnTimer -= dt
  for (;;) {
    if (state.remaining <= 0) break
    const tail = state.balls[state.balls.length - 1]
    if (tail !== undefined && tail.s < SPACING - 0.001) break
    if (state.spawnTimer > 0) break
    state.balls.push({ s: 0, color: pickColor(state) })
    state.remaining -= 1
    state.spawnTimer = spawnInterval(state.level)
  }

  updateShot(state, dt)

  const head = state.balls[0]
  if (head !== undefined && head.s >= TRACK_LENGTH - SINK_R) {
    state.result = 'over'
    state.msg = '彩珠掉进了黑洞…'
    state.events.push({ kind: 'over' })
    return
  }

  if (state.remaining === 0 && state.balls.length === 0) {
    state.events.push({ kind: 'level', level: state.level + 1 })
    startLevel(state, state.level + 1)
  }

  if (state.msgTimer > 0) state.msgTimer -= dt
}
