import { describe, expect, it } from 'vitest'
import {
  TRAIL_MAX, createFruitSlash, levelOf, mulberry32, pushTrail, stepFruitSlash,
  waveInterval,
} from '../src/client/games/fruitslash/logic.ts'

const snapshot = (s: ReturnType<typeof createFruitSlash>) => ({
  t: s.t, timeLeft: s.timeLeft, score: s.score, lives: s.lives,
  missed: s.missed, combo: s.combo, fruits: s.fruits, halves: s.halves,
  trail: s.trail, nextWaveAt: s.nextWaveAt, over: s.over,
})

describe('fruitslash logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('levelOf and waveInterval scale with score and clamp', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(99)).toBe(1)
    expect(levelOf(100)).toBe(2)
    expect(levelOf(250)).toBe(3)
    expect(waveInterval(1)).toBe(1700)
    expect(waveInterval(2)).toBe(1570)
    expect(waveInterval(50)).toBe(550)
  })

  it('createFruitSlash is deterministic per seed and round', () => {
    const a = createFruitSlash(2026, 2)
    const b = createFruitSlash(2026, 2)
    expect(snapshot(a)).toEqual(snapshot(b))
    expect([a.rng(), a.rng()]).toEqual([b.rng(), b.rng()])
    expect(a.lives).toBe(3)
    expect(a.timeLeft).toBe(60_000)
    expect(a.over).toBe(false)
  })

  it('simulation is deterministic for the same seed', () => {
    const run = () => {
      const s = createFruitSlash(77, 1)
      for (let i = 0; i < 600; i += 1) stepFruitSlash(s, 16)
      return snapshot(s)
    }
    expect(run()).toEqual(run())
  })

  it('pushTrail caps the trail length', () => {
    const s = createFruitSlash(1)
    for (let i = 0; i < 40; i += 1) pushTrail(s, i, i)
    expect(s.trail.length).toBeLessThanOrEqual(TRAIL_MAX)
  })

  it('slicing a fruit scores and emits an event; a bomb costs a life', () => {
    const s = createFruitSlash(9)
    s.fruits.push({ kind: 0, x: 240, y: 300, vx: 0, vy: 0, r: 20, bomb: false })
    for (let x = 180; x <= 300; x += 20) pushTrail(s, x, 300)
    stepFruitSlash(s, 16)
    expect(s.score).toBeGreaterThanOrEqual(10)
    expect(s.events.some(e => e.type === 'slice')).toBe(true)
    expect(s.fruits.length).toBe(0)

    const b = createFruitSlash(9)
    b.fruits.push({ kind: 0, x: 240, y: 300, vx: 0, vy: 0, r: 16, bomb: true })
    for (let x = 180; x <= 300; x += 20) pushTrail(b, x, 300)
    stepFruitSlash(b, 16)
    expect(b.lives).toBe(2)
    expect(b.events.some(e => e.type === 'bomb')).toBe(true)
  })
})
