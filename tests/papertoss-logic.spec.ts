import { describe, expect, it } from 'vitest'
import {
  BIN_W, GRAVITY, MAX_DRAG, MAX_MISSES, MAX_SPEED, MIN_DRAG, ORIGIN, RESULT_MS,
  W, WIND_MAX, beginAim, binMouthY, createPaperToss, dragToVelocity, releaseAim,
  stepPaperToss, updateAim,
} from '../src/client/games/papertoss/logic.ts'

describe('papertoss logic', () => {
  it('a new game starts aiming at the origin with in-range bin and wind', () => {
    const s = createPaperToss(7)
    expect(s.phase).toBe('aim')
    expect(s.score).toBe(0)
    expect(s.misses).toBe(0)
    expect(s.ball).toMatchObject({ x: ORIGIN.x, y: ORIGIN.y, vx: 0, vy: 0 })
    expect(s.binX).toBeGreaterThanOrEqual(W * 0.5)
    expect(s.binX).toBeLessThanOrEqual(W - 56 - BIN_W)
    expect(Math.abs(s.wind)).toBeLessThanOrEqual(WIND_MAX)
  })

  it('same seed replays the same round layout and script', () => {
    const a = createPaperToss(21)
    const b = createPaperToss(21)
    expect(a.binX).toBe(b.binX)
    expect(a.wind).toBe(b.wind)
    const script = (s: typeof a): number[] => {
      const trace: number[] = []
      for (let i = 0; i < 400; i += 1) {
        stepPaperToss(s, 16)
        trace.push(Math.round(s.ball.x), Math.round(s.ball.y), s.score, s.misses, s.combo)
      }
      return trace
    }
    expect(script(createPaperToss(21))).toEqual(script(createPaperToss(21)))
  })

  it('drag maps to a slingshot velocity with cutoffs', () => {
    expect(dragToVelocity(MIN_DRAG - 1, 0)).toBeNull()
    const full = dragToVelocity(MAX_DRAG, 0)
    expect(full).toEqual({ vx: MAX_SPEED, vy: 0 })
    const over = dragToVelocity(MAX_DRAG * 3, 0)
    expect(Math.hypot(over!.vx, over!.vy)).toBeCloseTo(MAX_SPEED, 6)
    const diag = dragToVelocity(100, -100)
    expect(diag!.vx).toBeGreaterThan(0)
    expect(diag!.vy).toBeLessThan(0)
  })

  it('aiming only works from aim phase; a tiny drag cancels the throw', () => {
    const s = createPaperToss(4)
    beginAim(s, ORIGIN.x, ORIGIN.y)
    updateAim(s, ORIGIN.x - 5, ORIGIN.y + 5)
    expect(s.aiming).toBe(true)
    expect(releaseAim(s)).toBe(false)
    expect(s.phase).toBe('aim')
    // A committed drag launches into flight.
    beginAim(s, ORIGIN.x, ORIGIN.y)
    updateAim(s, ORIGIN.x - 100, ORIGIN.y + 100)
    expect(releaseAim(s)).toBe(true)
    expect(s.phase).toBe('flying')
    expect(s.ball.vx).toBeGreaterThan(0)
    expect(s.ball.vy).toBeLessThan(0)
    // Aim calls are ignored while flying.
    beginAim(s, 0, 0)
    expect(s.aiming).toBe(false)
  })

  it('a ball solved to arc into the bin mouth scores a hit', () => {
    const s = createPaperToss(9)
    const target = s.binX + BIN_W / 2
    const c = ORIGIN.y - binMouthY()
    // Find an upward launch speed whose solved arc fits inside MAX_SPEED.
    let vy0 = 0
    let t = 0
    for (const cand of [-340, -380, -420, -460, -500]) {
      const disc = cand * cand - 2 * GRAVITY * c
      if (disc <= 0) continue
      const tt = (-cand + Math.sqrt(disc)) / GRAVITY
      const vx = (target - ORIGIN.x - 0.5 * s.wind * tt * tt) / tt
      if (Math.hypot(vx, cand) <= MAX_SPEED) {
        vy0 = cand
        t = tt
        break
      }
    }
    expect(vy0).not.toBe(0)
    const vx = (target - ORIGIN.x - 0.5 * s.wind * t * t) / t
    const speed = Math.hypot(vx, vy0)
    const len = (speed / MAX_SPEED) * MAX_DRAG
    const dx = (vx / speed) * len
    const dy = (vy0 / speed) * len
    beginAim(s, 0, 0)
    updateAim(s, -dx, -dy)
    expect(releaseAim(s)).toBe(true)
    let settled = false
    for (let i = 0; i < 500 && !settled; i += 1) {
      stepPaperToss(s, 16)
      settled = s.phase !== 'flying'
    }
    expect(settled).toBe(true)
    expect(s.phase).toBe('result')
    expect(s.combo).toBe(1)
    expect(s.score).toBeGreaterThan(0)
    expect(s.events.some((e) => e.type === 'hit')).toBe(true)
    // After the result pause a fresh round begins at the origin.
    for (let i = 0; i * 16 <= RESULT_MS + 100; i += 1) stepPaperToss(s, 16)
    expect(s.phase).toBe('aim')
    expect(s.ball).toMatchObject({ x: ORIGIN.x, y: ORIGIN.y })
  })

  it('grounded throws miss, reset the combo, and five misses end the game', () => {
    const s = createPaperToss(6)
    const throwDown = (): void => {
      beginAim(s, 0, 0)
      updateAim(s, 0, -60)
      expect(releaseAim(s)).toBe(true)
    }
    for (let round = 1; round <= MAX_MISSES; round += 1) {
      expect(s.phase).toBe('aim')
      throwDown()
      let guard = 0
      while (s.phase === 'flying' && guard < 500) {
        stepPaperToss(s, 16)
        guard += 1
      }
      expect(s.misses).toBe(round)
      expect(s.combo).toBe(0)
      expect(s.events.some((e) => e.type === 'miss')).toBe(true)
      if (round < MAX_MISSES) {
        for (let i = 0; i * 16 <= RESULT_MS + 100; i += 1) stepPaperToss(s, 16)
        expect(s.phase).toBe('aim')
      }
    }
    expect(s.phase).toBe('over')
    expect(s.score).toBe(0)
    const t = s.t
    stepPaperToss(s, 100)
    expect(s.t).toBe(t + 100)
    expect(s.misses).toBe(MAX_MISSES)
  })
})
