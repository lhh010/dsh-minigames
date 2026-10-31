import { describe, expect, it } from 'vitest'
import {
  COLS, LANES, TRACK, carCount, carRange, clampCol, crossingScore, isHit,
  laneSpeed, levelFromSeed, mulberry32,
} from '../src/client/games/frogger/logic.ts'

describe('frogger logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(99)
    const b = mulberry32(99)
    expect([a(), a()]).toEqual([b(), b()])
  })

  it('levelFromSeed is deterministic and ramps with level', () => {
    const a = levelFromSeed(5 * 0x9e3779b9, 3)
    const b = levelFromSeed(5 * 0x9e3779b9, 3)
    expect(a).toEqual(b)
    expect(a.lanes).toHaveLength(LANES)
    expect(laneSpeed(0, 2)).toBeGreaterThan(laneSpeed(0, 1))
    expect(carCount(5, 0)).toBeGreaterThanOrEqual(carCount(1, 0))
  })

  it('lane directions alternate and starts stay inside the track', () => {
    const level = levelFromSeed(1 * 0x9e3779b9, 1)
    level.lanes.forEach((lane, i) => {
      expect(lane.dir).toBe(i % 2 === 0 ? 1 : -1)
      expect(lane.starts.length).toBeGreaterThanOrEqual(2)
      for (const s of lane.starts) {
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThan(TRACK)
      }
    })
  })

  it('carRange wraps into the visible span or reports null in the margin', () => {
    const spec = { dir: 1 as const, speed: 1, starts: [0], length: 1 as const }
    expect(carRange(spec, 0, 0)).toEqual({ from: 0, to: 0 })
    // After TRACK seconds the car is back at column 0.
    expect(carRange(spec, 0, TRACK)).toEqual({ from: 0, to: 0 })
    const hidden = carRange(spec, COLS + 1, 0)
    expect(hidden).toBeNull()
  })

  it('isHit only fires on road rows and matches the car range', () => {
    const level = levelFromSeed(2 * 0x9e3779b9, 1)
    // Safe rows never hit.
    expect(isHit(level, -1, 0, 0.5)).toBe(false)
    expect(isHit(level, LANES, 0, 0.5)).toBe(false)
    // Sample every lane/time: hit implies some car covers the column.
    for (let lane = 0; lane < LANES; lane += 1) {
      for (let t = 0; t < 5; t += 0.25) {
        for (let col = 0; col < COLS; col += 3) {
          const hit = isHit(level, lane, col, t)
          const spec = level.lanes[lane]!
          const covered = spec.starts.some(s => {
            const range = carRange(spec, s, t)
            return range !== null && col >= range.from && col <= range.to
          })
          expect(hit).toBe(covered)
        }
      }
    }
  })

  it('clampCol bounds hops into the board', () => {
    expect(clampCol(-2)).toBe(0)
    expect(clampCol(99)).toBe(COLS - 1)
    expect(clampCol(5)).toBe(5)
  })

  it('crossingScore scales with the level', () => {
    expect(crossingScore(1)).toBe(100)
    expect(crossingScore(7)).toBe(700)
  })
})
