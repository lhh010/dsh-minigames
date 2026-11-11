import { describe, expect, it } from 'vitest'
import {
  angDiff, buildSegments, closestPointOnSegment, computeScore, createState,
  generateLevel, mulberry32, pathExists, rotatePoint, stepSubsteps,
} from '../src/client/games/tiltmaze/logic.ts'

describe('tiltmaze logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('rotatePoint rotates by the given angle', () => {
    const r = rotatePoint(1, 0, Math.PI / 2)
    expect(r.x).toBeCloseTo(0, 6)
    expect(r.y).toBeCloseTo(1, 6)
  })

  it('angDiff wraps to [-π, π]', () => {
    expect(angDiff(Math.PI * 1.5, -Math.PI * 1.5)).toBeCloseTo(Math.PI, 6)
    expect(Math.abs(angDiff(0.1, 0.2))).toBeCloseTo(0.1, 6)
  })

  it('closestPointOnSegment clamps to the segment', () => {
    const p = closestPointOnSegment(5, 5, { x1: 0, y1: 0, x2: 10, y2: 0 })
    expect(p.x).toBe(5)
    expect(p.y).toBe(0)
    const q = closestPointOnSegment(-3, 4, { x1: 0, y1: 0, x2: 10, y2: 0 })
    expect(q.x).toBe(0)
  })

  it('generateLevel is deterministic and levels ramp up', () => {
    const a = generateLevel(7, 1)
    const b = generateLevel(7, 1)
    expect(a).toEqual(b)
    const l5 = generateLevel(7, 5)
    expect(l5.rings).toBeGreaterThan(a.rings)
  })

  it('every level keeps a start-to-goal path (100 seeds × 5 levels)', () => {
    for (let s = 1; s <= 100; s += 1) {
      for (let lv = 1; lv <= 5; lv += 1) {
        const m = generateLevel(s, lv)
        expect(pathExists(m.ringWalls, m.spokeWalls, m.rings, m.spokes)).toBe(true)
      }
    }
  })

  it('buildSegments yields wall segments in board-local coordinates', () => {
    const m = generateLevel(3, 2)
    const segs = buildSegments(m)
    expect(segs.length).toBeGreaterThan(10)
  })

  it('createState spawns at center; physics pulls the ball down without spin', () => {
    const s = createState(5, 1)
    expect(s.bx).toBeCloseTo(0, 6)
    expect(s.status).toBe('playing')
    const y0 = s.by
    stepSubsteps(s, 240) // 1 second
    expect(s.by).toBeGreaterThan(y0)
  })

  it('score decreases with elapsed time', () => {
    expect(computeScore(1, 60)).toBeGreaterThan(computeScore(1, 10))
  })

  it('deterministic replay: same seed, same substeps, same trajectory', () => {
    const a = createState(99, 3)
    const b = createState(99, 3)
    a.spin = 1
    b.spin = 1
    for (let i = 0; i < 600; i += 1) {
      stepSubsteps(a, 1)
      stepSubsteps(b, 1)
    }
    expect(a.bx).toBeCloseTo(b.bx, 9)
    expect(a.by).toBeCloseTo(b.by, 9)
    expect(a.boardAngle).toBeCloseTo(b.boardAngle, 9)
  })
})
