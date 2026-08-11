/**
 * Flappy pure logic: a bird at a fixed x that falls under gravity and flaps
 * upward on input; pairs of pipes scroll in from the right, each pair scores
 * when the bird passes it, and hitting a pipe (or the floor/ceiling) ends the
 * run. Deterministic functions over a plain state object.
 */

export const VIEW_W = 300
export const VIEW_H = 450
export const BIRD_X = 90
export const BIRD_R = 13
export const PIPE_W = 52
export const GAP_H = 150
export const PIPE_SPACING = 185
export const GRAVITY = 620
export const FLAP_VY = -270

export interface Pipe { x: number; gapY: number; scored: boolean }

export interface FlappyState {
  /** Bird centre y (0 = top of the view). */
  y: number
  vy: number
  pipes: Pipe[]
  score: number
  over: boolean
  rng: () => number
}

function rand(lo: number, hi: number, rng: () => number): number {
  return lo + rng() * (hi - lo)
}

/** A fresh run: bird mid-screen, first pipe already approaching. */
export function createFlappyState(rng: () => number = Math.random): FlappyState {
  const state: FlappyState = {
    y: VIEW_H / 2,
    vy: 0,
    pipes: [],
    score: 0,
    over: false,
    rng,
  }
  state.pipes.push({ x: VIEW_W + 40, gapY: rand(GAP_H / 2 + 30, VIEW_H - GAP_H / 2 - 30, rng), scored: false })
  return state
}

/** A flap impulse (click / space). */
export function flap(state: FlappyState): void {
  if (state.over) return
  state.vy = FLAP_VY
}

/** Advance one frame. Returns whether the run ended this frame. */
export function stepFlappy(state: FlappyState, dt: number): boolean {
  if (state.over) return true
  state.vy += GRAVITY * dt
  state.y += state.vy * dt

  // Scroll pipes; spawn new ones to keep the pattern ahead.
  const speed = 150 + state.score * 3
  for (const pipe of state.pipes) pipe.x -= speed * dt
  const last = state.pipes[state.pipes.length - 1]!
  if (last.x < VIEW_W + PIPE_SPACING) {
    state.pipes.push({ x: last.x + PIPE_SPACING, gapY: rand(GAP_H / 2 + 30, VIEW_H - GAP_H / 2 - 30, state.rng), scored: false })
  }
  if (state.pipes[0]!.x + PIPE_W < 0) state.pipes.shift()

  // Scoring: pass a pair.
  for (const pipe of state.pipes) {
    if (!pipe.scored && pipe.x + PIPE_W < BIRD_X) {
      pipe.scored = true
      state.score += 1
    }
  }

  // Collisions: ceiling, floor, pipes.
  if (state.y - BIRD_R < 0) {
    state.y = BIRD_R
    state.vy = 0
  }
  if (state.y + BIRD_R > VIEW_H) {
    state.y = VIEW_H - BIRD_R
    state.over = true
    return true
  }
  for (const pipe of state.pipes) {
    if (BIRD_X + BIRD_R > pipe.x && BIRD_X - BIRD_R < pipe.x + PIPE_W) {
      const inGap = state.y > pipe.gapY - GAP_H / 2 && state.y < pipe.gapY + GAP_H / 2
      if (!inGap) {
        state.over = true
        return true
      }
    }
  }
  return false
}
