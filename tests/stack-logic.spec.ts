import { describe, expect, it } from 'vitest'
import {
  createState, drop, step, mulberry32, sliderSpeed, layerTopY,
  W, BASE_Y, BLOCK_H, START_W, PERFECT_TOL,
  BASE_SPEED, SPEED_STEP, RAMP_EVERY,
  NORMAL_SCORE, PERFECT_SCORE, STREAK_BONUS, STREAK_BONUS_EVERY,
  type StackState,
} from '../src/client/games/stack/logic.ts'

const FRAME = 1000 / 60
/** Ground slab: centered START_W wide. */
const GROUND_X = (W - START_W) / 2

/** Fresh run with the slider pinned at an exact x (deterministic drops). */
function stateWithSliderAt(x: number): StackState {
  const state = createState(1)
  state.slider.x = x
  return state
}

describe('stack drop trimming', () => {
  it('trims a left overhang: overlap becomes the block, overhang falls', () => {
    const state = stateWithSliderAt(GROUND_X - 30) // 30px left of the base
    const out = drop(state)
    expect(out.result).toBe('ok')
    expect(out.overlap).toBe(START_W - 30)
    expect(state.layers).toBe(1)
    const top = state.blocks[state.blocks.length - 1]!
    // New block aligns its left edge with the base below.
    expect(top.x).toBeCloseTo(GROUND_X, 6)
    expect(top.w).toBeCloseTo(START_W - 30, 6)
    // The cut-off 30px strip detaches from the left side at the drop layer.
    const piece = state.falling[0]!
    expect(piece.x).toBeCloseTo(GROUND_X - 30, 6)
    expect(piece.w).toBeCloseTo(30, 6)
    expect(piece.y).toBeCloseTo(layerTopY(0), 6)
  })

  it('trims a right overhang symmetrically', () => {
    const state = stateWithSliderAt(GROUND_X + 30)
    const out = drop(state)
    expect(out.result).toBe('ok')
    expect(out.overlap).toBe(START_W - 30)
    const top = state.blocks[state.blocks.length - 1]!
    expect(top.x).toBeCloseTo(GROUND_X + 30, 6)
    expect(top.w).toBeCloseTo(START_W - 30, 6)
    const piece = state.falling[0]!
    // Overhang is the rightmost 30px strip.
    expect(piece.x).toBeCloseTo(GROUND_X + START_W, 6)
    expect(piece.w).toBeCloseTo(30, 6)
  })

  it('keeps the exact width when centered (offset 0 is perfect)', () => {
    const state = stateWithSliderAt(GROUND_X)
    const out = drop(state)
    expect(out.result).toBe('perfect')
    expect(out.overlap).toBe(START_W)
    const top = state.blocks[state.blocks.length - 1]!
    expect(top.x).toBeCloseTo(GROUND_X, 6)
    expect(top.w).toBe(START_W)
    expect(state.falling).toHaveLength(0)
  })

  it('perfect tolerance boundary: exactly 3 is perfect, 4 is normal', () => {
    const a = stateWithSliderAt(GROUND_X + PERFECT_TOL)
    expect(drop(a).result).toBe('perfect')
    expect(a.blocks[a.blocks.length - 1]!.w).toBe(START_W)
    const b = stateWithSliderAt(GROUND_X + PERFECT_TOL + 1)
    const out = drop(b)
    expect(out.result).toBe('ok')
    expect(out.overlap).toBe(START_W - PERFECT_TOL - 1)
    expect(b.blocks[b.blocks.length - 1]!.w).toBe(START_W - PERFECT_TOL - 1)
  })

  it('chained drops trim against the new top block, narrowing further', () => {
    const state = stateWithSliderAt(GROUND_X + 20)
    drop(state) // top: x=110, w=220
    // Next slider already has w=220 and starts at a wall; pin it +15 off.
    state.slider.x = GROUND_X + 20 + 15
    const out = drop(state)
    expect(out.result).toBe('ok')
    expect(out.overlap).toBeCloseTo(220 - 15, 6)
    expect(state.layers).toBe(2)
  })
})

describe('stack game over', () => {
  it('collapses when the overlap is exactly 0', () => {
    const state = stateWithSliderAt(GROUND_X + START_W) // touching only
    const out = drop(state)
    expect(out.result).toBe('gameover')
    expect(out.overlap).toBe(0)
    expect(state.over).toBe(true)
    expect(state.layers).toBe(0)
    // The whole slider tumbles off.
    expect(state.falling[0]!.w).toBe(START_W)
  })

  it('collapses when the slider misses entirely (negative overlap)', () => {
    const state = stateWithSliderAt(GROUND_X + START_W + 10)
    const out = drop(state)
    expect(out.result).toBe('gameover')
    expect(out.overlap).toBe(-10)
    expect(state.over).toBe(true)
  })

  it('step is inert after collapse', () => {
    const state = stateWithSliderAt(GROUND_X + START_W)
    drop(state)
    const x = state.slider.x
    const n = state.falling.length
    step(state, 1000)
    expect(state.slider.x).toBe(x)
    expect(state.falling).toHaveLength(n)
  })
})

describe('stack scoring', () => {
  it('normal drops score +1 each, perfect drops +3', () => {
    const state = createState(7)
    for (let i = 0; i < 3; i += 1) {
      state.slider.x = state.blocks[state.blocks.length - 1]!.x + 40
      drop(state)
    }
    expect(state.score).toBe(3 * NORMAL_SCORE)
    state.slider.x = state.blocks[state.blocks.length - 1]!.x
    drop(state)
    expect(state.score).toBe(3 * NORMAL_SCORE + PERFECT_SCORE)
  })

  it('pays +10 on every 5th consecutive perfect and resets on a normal drop', () => {
    const state = createState(7)
    for (let i = 0; i < 4; i += 1) {
      state.slider.x = state.blocks[state.blocks.length - 1]!.x
      drop(state)
    }
    expect(state.score).toBe(4 * PERFECT_SCORE)
    state.slider.x = state.blocks[state.blocks.length - 1]!.x
    drop(state) // 5th consecutive perfect: 3 + 10 bonus
    expect(state.score).toBe(5 * PERFECT_SCORE + STREAK_BONUS)
    expect(state.streak).toBe(5)
    // A normal drop resets the streak counter.
    state.slider.x = state.blocks[state.blocks.length - 1]!.x + 20
    drop(state)
    expect(state.streak).toBe(0)
    // Five more perfects hit the bonus again.
    for (let i = 0; i < STREAK_BONUS_EVERY; i += 1) {
      state.slider.x = state.blocks[state.blocks.length - 1]!.x
      drop(state)
    }
    expect(state.score).toBe(
      5 * PERFECT_SCORE + STREAK_BONUS + NORMAL_SCORE + 5 * PERFECT_SCORE + STREAK_BONUS,
    )
  })
})

describe('stack slider and falling pieces', () => {
  it('ping-pongs within [0, W - w] across fixed steps', () => {
    const state = createState(3)
    state.slider = { x: 0, w: 100, dir: 1, speed: 300 }
    let bounces = 0
    let prevDir = 1
    for (let i = 0; i < 1800; i += 1) {
      step(state, FRAME)
      expect(state.slider.x).toBeGreaterThanOrEqual(-1e-9)
      expect(state.slider.x).toBeLessThanOrEqual(W - 100 + 1e-9)
      if (state.slider.dir !== prevDir) {
        bounces += 1
        prevDir = state.slider.dir
      }
    }
    expect(bounces).toBeGreaterThanOrEqual(2) // actually reflected at both walls
  })

  it('accelerates falling pieces with gravity and culls them below the ground', () => {
    const state = stateWithSliderAt(GROUND_X - 30)
    drop(state)
    expect(state.falling).toHaveLength(1)
    const y0 = state.falling[0]!.y
    step(state, FRAME)
    expect(state.falling[0]!.y).toBeGreaterThan(y0) // moving down
    expect(state.falling[0]!.vy).toBeGreaterThan(0) // and accelerating
    // Long enough falls are culled (GRAVITY pulls past BASE_Y + FALL_CULL).
    for (let i = 0; i < 120; i += 1) step(state, FRAME)
    expect(state.falling).toHaveLength(0)
  })

  it('ramps the slider speed every 5 layers', () => {
    expect(sliderSpeed(0)).toBe(BASE_SPEED)
    expect(sliderSpeed(RAMP_EVERY - 1)).toBe(BASE_SPEED)
    expect(sliderSpeed(RAMP_EVERY)).toBe(BASE_SPEED + SPEED_STEP)
    expect(sliderSpeed(RAMP_EVERY * 3)).toBe(BASE_SPEED + 3 * SPEED_STEP)
  })
})

describe('stack determinism', () => {
  it('mulberry32 produces identical streams for identical seeds', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    for (let i = 0; i < 100; i += 1) expect(a()).toBe(b())
  })

  it('identical seeds and drop schedules produce identical runs', () => {
    const run = (): unknown => {
      const state = createState(42)
      for (let i = 0; i < 60 && !state.over; i += 1) {
        for (let k = 0; k < 20; k += 1) step(state, FRAME)
        // Wobble the drop offset deterministically.
        state.slider.x = state.blocks[state.blocks.length - 1]!.x + ((i * 7) % 30) - 8
        drop(state)
      }
      return {
        layers: state.layers, score: state.score, streak: state.streak, over: state.over,
        blocks: state.blocks.map(b => [b.x, b.w]),
        slider: [state.slider.x, state.slider.w, state.slider.dir, state.slider.speed],
        falling: state.falling.map(p => [p.x, p.w, p.y, p.vy]),
      }
    }
    expect(run()).toEqual(run())
  })

  it('new sliders alternate direction and inherit the top width', () => {
    const state = createState(9)
    const dirs: number[] = []
    let prev = state.slider.dir
    for (let i = 0; i < 10; i += 1) {
      state.slider.x = state.blocks[state.blocks.length - 1]!.x // perfect chain
      drop(state)
      expect(state.slider.dir).toBe(-prev) // strictly alternating
      prev = state.slider.dir
      dirs.push(state.slider.dir)
      expect(state.slider.w).toBe(state.blocks[state.blocks.length - 1]!.w)
    }
    for (const d of dirs) expect(Math.abs(d)).toBe(1) // valid directions
  })

  it('places layers upward from the ground line', () => {
    const state = createState(5)
    state.slider.x = state.blocks[state.blocks.length - 1]!.x
    drop(state)
    // Layer 1 sits directly on the ground slab; each layer is BLOCK_H tall.
    expect(layerTopY(0)).toBeCloseTo(BASE_Y - BLOCK_H, 6)
    expect(state.layers).toBe(1)
  })
})
