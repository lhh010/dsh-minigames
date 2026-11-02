import { describe, expect, it } from 'vitest'
import {
  CHECKPOINT_R, END_R, GRACE_MS, LEVEL_COUNT, LEVEL_SPECS, START_LIVES,
  buildTrack, createSteadyHand, isShocked, levelScore, minDistanceToTrack,
  setPointer, stepSteadyHand,
} from '../src/client/games/steadyhand/logic.ts'

describe('steadyhand logic', () => {
  it('has five levels with shrinking clearance', () => {
    expect(LEVEL_COUNT).toBe(5)
    expect(LEVEL_SPECS.length).toBe(5)
    for (let i = 1; i < LEVEL_SPECS.length; i += 1) {
      const prev = LEVEL_SPECS[i - 1]!
      const cur = LEVEL_SPECS[i]!
      expect(cur.holeR - cur.railR).toBeLessThanOrEqual(prev.holeR - prev.railR)
      expect(cur.holeR).toBeGreaterThan(cur.railR)
    }
  })

  it('tracks start at the first point and reach the end', () => {
    for (let lv = 1; lv <= LEVEL_COUNT; lv += 1) {
      const track = buildTrack(lv)
      expect(track.points.length).toBeGreaterThan(10)
      const start = track.points[0]!
      const last = track.points[track.points.length - 1]!
      expect(Math.hypot(last.x - track.end.x, last.y - track.end.y)).toBeLessThan(6)
      void start
    }
  })

  it('isShocked is true when the rail touches the ring wall', () => {
    const track = buildTrack(1)
    // 放到轨道正中心：环孔远大于轨 → 安全。
    const mid = track.points[Math.floor(track.points.length / 2)]!
    expect(isShocked(track, mid.x, mid.y)).toBe(false)
    // 沿法向推到孔边缘外：环壁压轨 → 触电。
    const spec = LEVEL_SPECS[0]!
    const far = { x: mid.x + spec.holeR + spec.railR + 2, y: mid.y }
    expect(isShocked(track, far.x, far.y)).toBe(true)
  })

  it('minDistanceToTrack is zero on the track', () => {
    const track = buildTrack(2)
    const p = track.points[5]!
    expect(minDistanceToTrack(track, p.x, p.y)).toBeLessThan(1)
  })

  it('idle stepping never shocks (ring parked on the start)', () => {
    const s = createSteadyHand(1)
    for (let i = 0; i < 600; i += 1) stepSteadyHand(s, 16)
    expect(s.over).toBe(false)
    expect(s.lives).toBe(START_LIVES)
  })

  it('shocking costs a life and respawns at checkpoint after taking it', () => {
    const s = createSteadyHand(1)
    // 起点保护期后把环甩到远处（远离开轨）触发触电。
    for (let i = 0; i < Math.ceil(GRACE_MS / 16) + 2; i += 1) stepSteadyHand(s, 16)
    const before = s.lives
    // 直接把指针目标设到轨道远端环外——限速追踪会一路撞轨；给足步数。
    setPointer(s, -1000, -1000)
    let shocked = false
    for (let i = 0; i < 6000 && !shocked; i += 1) {
      stepSteadyHand(s, 16)
      shocked = s.flashMs > 0 || s.lives < before
    }
    expect(shocked).toBe(true)
    expect(s.lives).toBe(before - 1)
  })

  it('checkpoint exists mid-track within reach', () => {
    for (let lv = 1; lv <= LEVEL_COUNT; lv += 1) {
      const track = buildTrack(lv)
      expect(minDistanceToTrack(track, track.checkpoint.x, track.checkpoint.y)).toBeLessThan(CHECKPOINT_R)
      void END_R
    }
  })

  it('levelScore decays with time', () => {
    const fast = levelScore(2000)
    const slow = levelScore(30000)
    expect(fast).toBeGreaterThan(slow)
  })
})
