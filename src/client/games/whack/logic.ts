/**
 * Whack-a-mole pure logic: a 5x5 grid of holes; up to five moles pop up in
 * random holes for short windows and the player clicks holes to whack them.
 * 30-second rounds, +1 per hit, -1 per miss (floor 0). Deterministic
 * functions over a plain state object driven by an explicit clock.
 */

export const HOLES = 25 // 5 x 5 grid
export const DURATION = 30 // seconds per round
export const MAX_MOLES = 5 // moles that can be up at the same time

const SPAWN_MIN = 0.35
const SPAWN_MAX = 1.1
const MOLE_MIN = 0.9
const MOLE_MAX = 1.6

export interface WhackState {
  /** Holes with a mole up right now (never more than MAX_MOLES). */
  moles: number[]
  /** Seconds until each mole retreats (parallel to `moles`). */
  moleTimes: number[]
  /** Seconds remaining in the round. */
  remaining: number
  score: number
  over: boolean
  /** Countdown until the next mole pops up (while under MAX_MOLES). */
  spawnT: number
  rng: () => number
}

function rand(lo: number, hi: number, rng: () => number): number {
  return lo + rng() * (hi - lo)
}

/** A fresh round: no moles, full timer. */
export function createWhackState(rng: () => number = Math.random): WhackState {
  return {
    moles: [],
    moleTimes: [],
    remaining: DURATION,
    score: 0,
    over: false,
    spawnT: rand(SPAWN_MIN, SPAWN_MAX, rng),
    rng,
  }
}

/** Advance the round clock: timer, mole retreats and pops. */
export function tickWhack(state: WhackState, dt: number): void {
  if (state.over) return
  state.remaining -= dt
  if (state.remaining <= 0) {
    state.remaining = 0
    state.over = true
    state.moles = []
    state.moleTimes = []
    return
  }
  // Retreat moles whose window elapsed.
  for (let i = state.moles.length - 1; i >= 0; i -= 1) {
    state.moleTimes[i]! -= dt
    if (state.moleTimes[i]! <= 0) {
      state.moles.splice(i, 1)
      state.moleTimes.splice(i, 1)
    }
  }
  // Pop a new mole when under the cap.
  if (state.moles.length < MAX_MOLES) {
    state.spawnT -= dt
    if (state.spawnT <= 0) {
      state.spawnT = rand(SPAWN_MIN, SPAWN_MAX, state.rng)
      const taken = new Set(state.moles)
      const free: number[] = []
      for (let hole = 0; hole < HOLES; hole += 1) {
        if (!taken.has(hole)) free.push(hole)
      }
      if (free.length > 0) {
        state.moles.push(free[Math.floor(state.rng() * free.length)]!)
        state.moleTimes.push(rand(MOLE_MIN, MOLE_MAX, state.rng))
      }
    }
  }
}

/** Click a hole: hit a mole +1, miss -1. Returns whether it was a hit. */
export function whack(state: WhackState, hole: number): boolean {
  if (state.over || hole < 0 || hole >= HOLES) return false
  const index = state.moles.indexOf(hole)
  if (index >= 0) {
    state.moles.splice(index, 1)
    state.moleTimes.splice(index, 1)
    state.score += 1
    return true
  }
  state.score = Math.max(0, state.score - 1)
  return false
}
