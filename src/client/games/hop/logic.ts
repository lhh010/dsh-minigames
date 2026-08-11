/**
 * 跳一跳 pure logic: hold to charge a jump, release to leap onto the next
 * platform. Landing near the platform centre scores a bonus; missing the
 * platform ends the run. Deterministic functions over a plain state object.
 */

export interface Platform {
  x: number
  w: number
}

export interface HopState {
  /** Current platform index (the one the player is on). */
  index: number
  platforms: Platform[]
  /** Player horizontal position (world units). */
  playerX: number
  /** Vertical velocity during a jump (world units/s). */
  vy: number
  /** Vertical position during a jump (0 = on a platform). */
  y: number
  /** Charge power 0..1 while holding. */
  power: number
  /** Airborne flag. */
  jumping: boolean
  /** True while the fall-off animation is playing (after `over`). */
  falling: boolean
  score: number
  over: boolean
  rng: () => number
}

const PLATFORM_W = 60 // start platform width
// Platform gaps are a mixed distribution: mostly near/mid, with a minority of
// far gaps. A full-charge jump clears even the farthest gap from the platform
// centre, so the far gaps are always reachable — but a full-charge jump also
// sails right over near/mid platforms, so the player must match the charge to
// the gap instead of mashing full power.
const GAP_NEAR_MIN = 55
const GAP_NEAR_MAX = 105
const GAP_MID_MIN = 105
const GAP_MID_MAX = 140
const GAP_FAR_MIN = 140
const GAP_FAR_MAX = 160
// Generated platforms vary in width too: narrow / normal / wide. Narrow
// platforms are harder to hit precisely (smaller landing + bonus window).
const W_NARROW_MIN = 42
const W_NARROW_MAX = 52
const W_NORMAL_MIN = 56
const W_NORMAL_MAX = 64
const W_WIDE_MIN = 72
const W_WIDE_MAX = 88
// JUMP_POWER and GRAVITY are scaled together: raising both keeps the airtime
// (and therefore the landing distance) identical while lifting the arc peak —
// a higher, more visible parabola.
const JUMP_POWER = 410 // world units at full charge
const GRAVITY = 1320
/** Fall depth (world units) after which the fall-off animation ends. */
export const FALL_END = 150

/** A fresh run: start platform + two ahead. */
export function createHopState(rng: () => number = Math.random): HopState {
  const state: HopState = {
    index: 0,
    platforms: [{ x: 0, w: PLATFORM_W }],
    playerX: PLATFORM_W / 2,
    vy: 0,
    y: 0,
    power: 0,
    jumping: false,
    falling: false,
    score: 0,
    over: false,
    rng,
  }
  extendPlatforms(state)
  return state
}

/** One gap draw: near (40%), mid (35%), far (25%). */
function nextGap(rng: () => number): number {
  const roll = rng()
  if (roll < 0.4) return GAP_NEAR_MIN + rng() * (GAP_NEAR_MAX - GAP_NEAR_MIN)
  if (roll < 0.75) return GAP_MID_MIN + rng() * (GAP_MID_MAX - GAP_MID_MIN)
  return GAP_FAR_MIN + rng() * (GAP_FAR_MAX - GAP_FAR_MIN)
}

/** One platform width draw: narrow (30%), normal (40%), wide (30%). */
function nextWidth(rng: () => number): number {
  const roll = rng()
  if (roll < 0.3) return W_NARROW_MIN + rng() * (W_NARROW_MAX - W_NARROW_MIN)
  if (roll < 0.7) return W_NORMAL_MIN + rng() * (W_NORMAL_MAX - W_NORMAL_MIN)
  return W_WIDE_MIN + rng() * (W_WIDE_MAX - W_WIDE_MIN)
}

/** Append platforms far enough ahead. */
export function extendPlatforms(state: HopState): void {
  while (state.platforms.length < state.index + 3) {
    const last = state.platforms[state.platforms.length - 1]!
    const gap = nextGap(state.rng)
    state.platforms.push({ x: last.x + last.w + gap, w: nextWidth(state.rng) })
  }
}

/** Start charging (held input). */
export function startCharge(state: HopState): void {
  if (state.jumping || state.over) return
  state.power = 0
}

/** Advance the charge while held. */
export function charge(state: HopState, dt: number): void {
  if (state.jumping || state.over) return
  state.power = Math.min(1, state.power + dt * 1.6)
}

/** Release: jump with the current charge. */
export function jump(state: HopState): void {
  if (state.jumping || state.over) return
  state.jumping = true
  // Charge curve: 0.25..1.3 of JUMP_POWER, so a minimal tap just hops back
  // onto the current platform while a full charge clears the farthest gap.
  state.vy = -JUMP_POWER * (0.25 + state.power * 1.05)
  state.y = 0
}

/** Advance one frame. Returns whether the run ended this frame. */
export function stepHop(state: HopState, dt: number): boolean {
  // Fall-off animation: keep accelerating downward until the player is far
  // out of view; only then stop (the overlay shows after `falling` clears).
  if (state.over) {
    if (state.falling) {
      state.vy += GRAVITY * dt
      state.y += state.vy * dt
      if (state.y >= FALL_END) state.falling = false
    }
    return true
  }
  if (!state.jumping) return false
  // Horizontal motion is constant while airborne.
  const horizontalSpeed = 130 + state.power * 120
  state.playerX += horizontalSpeed * dt
  state.vy += GRAVITY * dt
  state.y += state.vy * dt

  // Landing: check the platform the player is over.
  if (state.y >= 0) {
    state.y = 0
    state.jumping = false
    state.power = 0
    const current = state.platforms[state.index]!
    const next = state.platforms[state.index + 1]
    // Landed on the NEXT platform: advance + score.
    if (next !== undefined && state.playerX >= next.x && state.playerX <= next.x + next.w) {
      state.index += 1
      const centre = next.x + next.w / 2
      const dist = Math.abs(state.playerX - centre)
      const bonus = dist < next.w * 0.15 ? 2 : dist < next.w * 0.35 ? 1 : 0
      state.score += 1 + bonus
      extendPlatforms(state)
      return false
    }
    // Landed back on the CURRENT platform: no score, run continues.
    if (state.playerX >= current.x && state.playerX <= current.x + current.w) {
      return false
    }
    // Between platforms or past them: fell. Keep the downward velocity so the
    // fall-off animation starts from a natural speed.
    state.falling = true
    state.over = true
    return true
  }
  return false
}
