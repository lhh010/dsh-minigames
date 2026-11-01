import { describe, expect, it } from 'vitest'
import {
  BITE_MS, DIST_ESCAPE, DIST_START, FISH_KINDS, ROUND_MS, TENSION_MAX,
  BOBBER_X, catchPoints, createFishing, depthOf, mulberry32, pullOf, stepFishing,
} from '../src/client/games/fishing/logic.ts'

describe('fishing logic', () => {
  it('a new round starts idle with a bounded wait and full clock', () => {
    const s = createFishing(5, 1)
    expect(s.phase).toBe('idle')
    expect(s.timeLeft).toBe(ROUND_MS)
    expect(s.score).toBe(0)
    expect(s.breaks).toBe(0)
    expect(s.catches).toBe(0)
    expect(s.waitMs).toBeGreaterThanOrEqual(1500)
    expect(s.waitMs).toBeLessThanOrEqual(4500)
  })

  it('waiting past waitMs triggers a bite event with a valid fish', () => {
    const s = createFishing(11, 1)
    let sawBite = false
    for (let i = 0; i < 100 && !sawBite; i += 1) {
      stepFishing(s, 100, false)
      if (s.events.some((e) => e.type === 'bite')) sawBite = true
    }
    expect(sawBite).toBe(true)
    expect(s.phase).toBe('bite')
    expect(s.biteMs).toBeLessThanOrEqual(BITE_MS)
    expect(s.fish).not.toBeNull()
    const kind = FISH_KINDS[s.fish!.kind]!
    expect(s.fish!.weight).toBeGreaterThanOrEqual(kind.wMin)
    expect(s.fish!.weight).toBeLessThanOrEqual(kind.wMax)
  })

  it('holding during the bite window hooks the fish; ignoring it returns to idle', () => {
    const hooked = createFishing(3, 1)
    while (hooked.phase !== 'bite') stepFishing(hooked, 50, false)
    stepFishing(hooked, 16, true)
    expect(hooked.phase).toBe('fight')
    expect(hooked.events.some((e) => e.type === 'hook')).toBe(true)
    expect(hooked.distance).toBe(DIST_START)
    expect(hooked.tension).toBeGreaterThan(0)

    const missed = createFishing(3, 1)
    while (missed.phase !== 'bite') stepFishing(missed, 50, false)
    for (let i = 0; i * 50 <= BITE_MS + 100; i += 1) stepFishing(missed, 50, false)
    expect(missed.phase).toBe('idle')
    expect(missed.breaks).toBe(0)
  })

  it('mulberry32 and full games replay identically per seed', () => {
    const ra = mulberry32(23)
    const rb = mulberry32(23)
    expect([ra(), ra(), ra()]).toEqual([rb(), rb(), rb()])
    const run = (): number[] => {
      const s = createFishing(42, 2)
      const trace: number[] = []
      for (let i = 0; i < 1500; i += 1) {
        stepFishing(s, 33, i % 7 < 4)
        trace.push(s.score, s.catches, s.breaks, Math.round(s.distance), Math.round(s.tension))
      }
      return trace
    }
    expect(run()).toEqual(run())
  })

  it('pull stays within 0..100 and catch points scale with weight and kind factor', () => {
    const s = createFishing(9, 1)
    while (s.phase !== 'fight') stepFishing(s, 40, s.phase === 'bite')
    const fish = s.fish!
    for (let t = 0; t <= 20000; t += 250) {
      const p = pullOf(fish, t)
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThanOrEqual(100)
    }
    const pts = catchPoints(fish)
    expect(pts).toBe(Math.round(fish.weight * FISH_KINDS[fish.kind % FISH_KINDS.length]!.factor))
  })

  it('tension is clamped to the cap and depth reports 1 outside a fight', () => {
    const s = createFishing(13, 1)
    expect(depthOf(s)).toBe(1)
    while (s.phase !== 'fight') stepFishing(s, 40, s.phase === 'bite')
    stepFishing(s, 16, true)
    expect(s.tension).toBeLessThanOrEqual(TENSION_MAX)
    const d = depthOf(s)
    expect(d).toBeGreaterThanOrEqual(0)
    expect(d).toBeLessThanOrEqual(1)
    // Reeling in monotonically shrinks the reported depth.
    let prev = d
    for (let i = 0; i < 20 && s.phase === 'fight'; i += 1) {
      stepFishing(s, 16, true)
      const now = depthOf(s)
      expect(now).toBeLessThanOrEqual(prev + 1e-9)
      prev = now
    }
    expect(s.distance).toBeLessThan(DIST_ESCAPE + 1)
  })

  it('the round clock ends the game', () => {
    const s = createFishing(17, 1)
    let guard = 0
    while (s.phase !== 'over' && guard < 3000) {
      stepFishing(s, 100, s.phase === 'bite' || guard % 3 === 0)
      guard += 1
    }
    expect(s.phase).toBe('over')
    expect(s.timeLeft).toBe(0)
    const score = s.score
    stepFishing(s, 100, true)
    expect(s.score).toBe(score)
  })
})
