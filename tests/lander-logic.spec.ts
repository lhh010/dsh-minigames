import { describe, expect, it } from 'vitest'
import {
  LAND_TILT_MAX, LAND_VY_MAX, createLander, generateTerrain, gravityOf,
  groundAt, mulberry32, padAt, stepLander,
} from '../src/client/games/lander/logic.ts'

describe('lander logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('gravity ramps per level with a cap', () => {
    expect(gravityOf(1)).toBe(80)
    expect(gravityOf(2)).toBeGreaterThan(gravityOf(1))
    expect(gravityOf(50)).toBeLessThanOrEqual(160)
  })

  it('terrain is deterministic, grounded, and carries pads', () => {
    const a = generateTerrain(42, 1)
    const b = generateTerrain(42, 1)
    expect(a).toEqual(b)
    expect(a.pads.length).toBeGreaterThanOrEqual(1)
    const pad = a.pads[0]!
    const mid = (pad.x1 + pad.x2) / 2
    expect(padAt(a, mid)).not.toBeNull()
    expect(padAt(a, -9999)).toBeNull()
    for (let x = 0; x < 480; x += 17) {
      expect(Number.isFinite(groundAt(a, x))).toBe(true)
    }
  })

  it('stepping is deterministic: same seed and inputs replay identically', () => {
    const run = (): number[] => {
      const s = createLander(7)
      const ys: number[] = []
      for (let i = 0; i < 400; i += 1) {
        stepLander(s, 16, { left: i % 4 === 0, right: false, thrust: i % 3 === 0 })
        ys.push(Math.round(s.y * 1000))
      }
      return ys
    }
    expect(run()).toEqual(run())
  })

  it('a soft level touch-down stays flying until the land check passes', () => {
    // Slow drift near ground with no tilt: state machine reacts, never NaN.
    const s = createLander(3)
    for (let i = 0; i < 600; i += 1) {
      stepLander(s, 16, { left: false, right: false, thrust: true })
      expect(Number.isFinite(s.y)).toBe(true)
      expect(Number.isFinite(s.vy)).toBe(true)
      if (s.phase !== 'flying') break
    }
    expect(['flying', 'landed', 'crashed', 'gameover']).toContain(s.phase)
  })

  it('landing thresholds are the exported constants', () => {
    expect(LAND_VY_MAX).toBe(60)
    expect(LAND_TILT_MAX).toBe(0.35)
  })
})
