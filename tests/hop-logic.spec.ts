import { describe, expect, it } from 'vitest'
import {
  charge, createHopState, extendPlatforms, jump, startCharge, stepHop,
} from '../src/client/games/hop/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('hop logic', () => {
  it('creates a start platform with the player on it', () => {
    const state = createHopState(lcg(1))
    expect(state.index).toBe(0)
    expect(state.platforms.length).toBeGreaterThanOrEqual(3)
    expect(state.playerX).toBeGreaterThanOrEqual(0)
    expect(state.over).toBe(false)
  })

  it('charges power while holding', () => {
    const state = createHopState(lcg(1))
    startCharge(state)
    charge(state, 0.3)
    expect(state.power).toBeGreaterThan(0)
    expect(state.power).toBeLessThanOrEqual(1)
  })

  it('a short charge jumps a short distance', () => {
    const state = createHopState(lcg(1))
    const startX = state.playerX
    startCharge(state)
    charge(state, 0.05)
    jump(state)
    // Step until landed or over.
    for (let i = 0; i < 300 && state.jumping; i += 1) stepHop(state, 1 / 60)
    expect(state.playerX).toBeGreaterThan(startX)
  })

  it('reaching the next platform advances the score', () => {
    const state = createHopState(lcg(1))
    // A medium charge (power 0.32) lands on a close platform.
    state.platforms[1] = { x: 40, w: 60 }
    state.playerX = 30
    startCharge(state)
    charge(state, 0.2)
    jump(state)
    for (let i = 0; i < 400 && state.jumping; i += 1) stepHop(state, 1 / 60)
    expect(state.index).toBe(1)
    expect(state.score).toBeGreaterThanOrEqual(1)
    expect(state.over).toBe(false)
  })

  it('a too-short jump misses and ends the run', () => {
    const state = createHopState(lcg(1))
    // Next platform far away; the player starts near the current edge, so a
    // tiny jump carries it into the gap past the current platform.
    state.platforms[1] = { x: 500, w: 60 }
    state.playerX = 58
    startCharge(state)
    charge(state, 0.02)
    jump(state)
    for (let i = 0; i < 400 && state.jumping; i += 1) stepHop(state, 1 / 60)
    expect(state.over).toBe(true)
  })

  it('landing on the current platform keeps the run alive', () => {
    const state = createHopState(lcg(1))
    // A zero-power jump lands right back on the start platform.
    state.playerX = 30
    startCharge(state)
    jump(state)
    for (let i = 0; i < 300 && state.jumping; i += 1) stepHop(state, 1 / 60)
    expect(state.over).toBe(false)
    expect(state.index).toBe(0)
  })

  it('a full-charge jump arcs high above the platform', () => {
    const state = createHopState(lcg(1))
    // Keep the next platform far away so the arc can be observed before any
    // landing check matters.
    state.platforms[1] = { x: 1000, w: 60 }
    state.playerX = 30
    startCharge(state)
    charge(state, 1)
    jump(state)
    let minY = 0
    for (let i = 0; i < 600 && state.jumping; i += 1) {
      stepHop(state, 1 / 60)
      minY = Math.min(minY, state.y)
    }
    // World units above the platform at the apex: a clearly visible arc.
    expect(minY).toBeLessThan(-65)
  })

  it('platform gaps mix near, mid and far distances', () => {
    const state = createHopState(lcg(1))
    // Slide the generation window forward so each extendPlatforms call
    // appends one more platform, producing a long run of real gaps.
    for (let i = 0; i < 400; i += 1) {
      state.index = state.platforms.length - 2
      extendPlatforms(state)
    }
    const gaps: number[] = []
    for (let i = 1; i < state.platforms.length; i += 1) {
      const prev = state.platforms[i - 1]!
      gaps.push(state.platforms[i]!.x - (prev.x + prev.w))
    }
    expect(Math.min(...gaps)).toBeLessThan(70) // near gaps exist
    expect(Math.max(...gaps)).toBeGreaterThan(140) // far gaps exist
    expect(gaps.some(g => g >= 105 && g <= 140)).toBe(true) // mid gaps exist
  })

  it('platform widths mix narrow, normal and wide', () => {
    const state = createHopState(lcg(1))
    for (let i = 0; i < 400; i += 1) {
      state.index = state.platforms.length - 2
      extendPlatforms(state)
    }
    const widths = state.platforms.slice(1).map(p => p.w)
    expect(Math.min(...widths)).toBeLessThan(52) // narrow platforms exist
    expect(Math.max(...widths)).toBeGreaterThan(72) // wide platforms exist
    expect(widths.some(w => w >= 56 && w <= 64)).toBe(true) // normal ones too
  })

  it('a full-charge jump from the centre clears the farthest gap', () => {
    const state = createHopState(lcg(1))
    // Farthest gap: next platform starts at 60 + 160 = 220. A full-charge
    // jump (≈202 world units) lands on it even from the platform centre.
    state.platforms[1] = { x: 220, w: 60 }
    state.playerX = 30
    startCharge(state)
    charge(state, 1)
    jump(state)
    for (let i = 0; i < 600 && state.jumping; i += 1) stepHop(state, 1 / 60)
    expect(state.over).toBe(false)
    expect(state.index).toBe(1)
    expect(state.score).toBeGreaterThanOrEqual(1)
  })

  it('a miss triggers a fall-off animation before the overlay', () => {
    const state = createHopState(lcg(1))
    state.platforms[1] = { x: 500, w: 60 }
    state.playerX = 58
    startCharge(state)
    charge(state, 0.02)
    jump(state)
    // Step until the player lands (misses) — the fall starts.
    for (let i = 0; i < 400 && state.jumping; i += 1) stepHop(state, 1 / 60)
    expect(state.over).toBe(true)
    expect(state.falling).toBe(true)
    const yAtStart = state.y
    // Keep stepping: the player accelerates downward past FALL_END.
    for (let i = 0; i < 600 && state.falling; i += 1) stepHop(state, 1 / 60)
    expect(state.y).toBeGreaterThan(yAtStart)
    expect(state.falling).toBe(false)
    // Animation done: state stays put.
    const yAtEnd = state.y
    stepHop(state, 1 / 60)
    expect(state.y).toBe(yAtEnd)
  })

  it('extendPlatforms keeps enough platforms ahead', () => {
    const state = createHopState(lcg(1))
    state.platforms = state.platforms.slice(0, 1)
    extendPlatforms(state)
    expect(state.platforms.length).toBeGreaterThanOrEqual(3)
  })
})
