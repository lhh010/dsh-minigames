import { describe, expect, it } from 'vitest'
import {
  createFlappyState, flap, stepFlappy,
  BIRD_X, BIRD_R, GAP_H, PIPE_SPACING, PIPE_W, VIEW_H, VIEW_W,
} from '../src/client/games/flappy/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('flappy logic', () => {
  it('creates a mid-screen bird with one pipe ahead', () => {
    const state = createFlappyState(lcg(1))
    expect(state.y).toBe(VIEW_H / 2)
    expect(state.vy).toBe(0)
    expect(state.pipes.length).toBe(1)
    expect(state.over).toBe(false)
  })

  it('gravity pulls the bird down and flap lifts it', () => {
    const state = createFlappyState(lcg(1))
    const before = state.y
    stepFlappy(state, 1 / 60)
    expect(state.y).toBeGreaterThan(before)
    flap(state)
    expect(state.vy).toBeLessThan(0)
    const yAfter = state.y
    stepFlappy(state, 1 / 60)
    expect(state.y).toBeLessThan(yAfter + 2) // upward motion dominates the step
  })

  it('pipes scroll left and new ones spawn to keep the pattern', () => {
    const state = createFlappyState(lcg(1))
    const x0 = state.pipes[0]!.x
    for (let i = 0; i < 120; i += 1) stepFlappy(state, 1 / 60)
    expect(state.pipes[0]!.x).toBeLessThan(x0)
    expect(state.pipes.length).toBeGreaterThanOrEqual(2)
    // Spacing between consecutive pipes is constant.
    const dx = state.pipes[1]!.x - state.pipes[0]!.x
    expect(dx).toBe(PIPE_SPACING)
  })

  it('passing a pair scores a point', () => {
    const state = createFlappyState(lcg(1))
    // Park the bird in a pipe gap, then scroll the pipe past it.
    state.y = 200
    state.pipes = [{ x: BIRD_X + 10, gapY: 200, scored: false }]
    for (let i = 0; i < 120; i += 1) stepFlappy(state, 1 / 60)
    expect(state.score).toBeGreaterThanOrEqual(1)
  })

  it('hitting a pipe ends the run', () => {
    const state = createFlappyState(lcg(1))
    // Pipe whose gap is far from the bird, positioned right on it.
    state.y = 30
    state.pipes = [{ x: BIRD_X - 10, gapY: 400, scored: false }]
    state.vy = 0
    let ended = false
    for (let i = 0; i < 10 && !ended; i += 1) ended = stepFlappy(state, 1 / 60)
    expect(state.over).toBe(true)
    expect(ended).toBe(true)
  })

  it('touching the floor ends the run', () => {
    const state = createFlappyState(lcg(1))
    state.y = VIEW_H - BIRD_R - 1
    state.vy = 500
    const ended = stepFlappy(state, 1 / 60)
    expect(state.over).toBe(true)
    expect(ended).toBe(true)
  })

  it('flap is ignored after game over', () => {
    const state = createFlappyState(lcg(1))
    state.y = VIEW_H + 100
    stepFlappy(state, 1 / 60)
    expect(state.over).toBe(true)
    flap(state)
    expect(state.vy).toBeGreaterThanOrEqual(0) // untouched
  })
})
