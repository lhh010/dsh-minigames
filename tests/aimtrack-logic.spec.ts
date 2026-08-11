import { describe, expect, it } from 'vitest'
import {
  bulletPosition, createFpsTrackState, effectivePitch, effectiveYaw, hitRate, isLocked,
  normAngle, shoot, targetOffset, targetPitchOffset, targetScreenX, targetScreenY,
  tickFpsTrack, turn,
  CAM_H, CAM_X, CAM_Y, DURATION, HIT_FLASH, LOGICAL_H, LOGICAL_W, SHOT_SCORE, WORLD_H, WORLD_W,
} from '../src/client/games/aimtrack/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('fps aimtrack logic', () => {
  it('creates a fresh round looking straight ahead at the target', () => {
    const state = createFpsTrackState(lcg(1))
    expect(state.yaw).toBe(0)
    expect(state.pitch).toBe(0)
    expect(state.targetX).toBeGreaterThan(CAM_X)
    expect(state.targetH).toBe(CAM_H) // at camera height initially
    expect(state.remaining).toBe(DURATION)
    expect(state.over).toBe(false)
    expect(isLocked(state)).toBe(true)
  })

  it('turn rotates the yaw and clamps the pitch', () => {
    const state = createFpsTrackState(lcg(1))
    turn(state, 500, 0)
    expect(state.yaw).toBeGreaterThan(0)
    turn(state, 0, 100000)
    expect(state.pitch).toBeLessThan(Math.PI / 2)
    turn(state, 0, -100000)
    expect(state.pitch).toBeGreaterThan(-Math.PI / 2)
  })

  it('mouse-down pitches the view down (not inverted)', () => {
    const state = createFpsTrackState(lcg(1))
    const before = state.pitch
    turn(state, 0, 100) // mouse moves down
    expect(state.pitch).toBeLessThan(before) // view looks down
    turn(state, 0, -100) // mouse moves up
    expect(state.pitch).toBeGreaterThan(before - 0.0001)
  })

  it('normAngle wraps into (-π, π]', () => {
    expect(normAngle(0)).toBe(0)
    expect(normAngle(Math.PI * 3.5)).toBeCloseTo(-Math.PI / 2, 6)
    expect(Math.abs(normAngle(Math.PI * 8.2))).toBeLessThan(Math.PI)
  })

  it('the target drifts laterally and vertically but stays in bounds', () => {
    const state = createFpsTrackState(lcg(1))
    const startH = state.targetH
    let heightMoved = false
    for (let i = 0; i < 1200; i += 1) {
      tickFpsTrack(state, 1 / 60)
      if (Math.abs(state.targetH - startH) > 1) heightMoved = true
    }
    expect(state.targetX).toBeGreaterThanOrEqual(40)
    expect(state.targetX).toBeLessThanOrEqual(WORLD_W - 40)
    expect(state.targetY).toBeGreaterThanOrEqual(40)
    expect(state.targetY).toBeLessThanOrEqual(WORLD_H - 40)
    expect(state.targetH).toBeGreaterThanOrEqual(30)
    expect(state.targetH).toBeLessThanOrEqual(320)
    expect(heightMoved).toBe(true) // vertical drift actually happened
  })

  it('a vertical height offset breaks the lock until re-aimed', () => {
    const state = createFpsTrackState(lcg(1))
    // Raise the target far above camera height: no lock.
    state.targetH = CAM_H + 400
    expect(isLocked(state)).toBe(false)
    expect(Math.abs(targetPitchOffset(state))).toBeGreaterThan(0.2)
  })

  it('shooting while locked scores and applies recoil + shake', () => {
    const state = createFpsTrackState(lcg(1))
    expect(shoot(state)).toBe(true)
    expect(state.hits).toBe(1)
    expect(state.shots).toBe(1)
    expect(state.score).toBe(SHOT_SCORE)
    expect(state.recoilPitch).toBeGreaterThan(0)
    expect(state.shakeYaw).not.toBe(0)
    expect(state.flashT).toBeGreaterThan(0)
  })

  it('a hit shot spawns a bullet aimed at the target', () => {
    const state = createFpsTrackState(lcg(1))
    shoot(state)
    const bullet = state.bullet!
    expect(bullet.hit).toBe(true)
    expect(bullet.x1).toBe(state.targetX)
    expect(bullet.y1).toBe(state.targetY)
    expect(bullet.h1).toBe(state.targetH)
    expect(bullet.t).toBe(0)
  })

  it('a missed shot spawns a bullet flying out into the view', () => {
    const state = createFpsTrackState(lcg(1))
    state.targetH = CAM_H + 400 // off-target vertically
    shoot(state)
    const bullet = state.bullet!
    expect(bullet.hit).toBe(false)
    // The bullet end is far away, not at the target.
    expect(bullet.x1).toBeGreaterThan(CAM_X + 500)
    expect(bullet.h1).not.toBe(state.targetH)
  })

  it('the bullet flies and disappears; a hit sparks the target', () => {
    const state = createFpsTrackState(lcg(1))
    shoot(state) // locked -> hit
    expect(state.hitFlashT).toBe(0)
    // Halfway through the flight the bullet is between start and end.
    tickFpsTrack(state, state.bullet!.dur / 2)
    const mid = bulletPosition(state)
    expect(mid).not.toBeNull()
    expect(mid!.x).toBeGreaterThan(CAM_X)
    // By the end of the flight the bullet is gone and the spark is lit.
    tickFpsTrack(state, state.bullet!.dur / 2 + 0.02)
    expect(state.bullet).toBeNull()
    expect(state.hitFlashT).toBeGreaterThan(0)
    // The spark decays away.
    for (let i = 0; i < 60; i += 1) tickFpsTrack(state, 1 / 60)
    expect(state.hitFlashT).toBe(0)
  })

  it('a missed bullet also disappears without a spark', () => {
    const state = createFpsTrackState(lcg(1))
    state.targetH = CAM_H + 400
    shoot(state) // miss
    const dur = state.bullet!.dur
    for (let i = 0; i < 120; i += 1) tickFpsTrack(state, 1 / 60)
    expect(state.bullet).toBeNull()
    expect(state.hitFlashT).toBe(0)
    expect(dur).toBeGreaterThan(0)
    expect(HIT_FLASH).toBeGreaterThan(0)
  })

  it('shooting while off-target misses but still recoils', () => {
    const state = createFpsTrackState(lcg(1))
    state.targetH = CAM_H + 400 // way off vertically
    expect(shoot(state)).toBe(false)
    expect(state.hits).toBe(0)
    expect(state.shots).toBe(1)
    expect(state.recoilPitch).toBeGreaterThan(0)
  })

  it('recoil and shake decay over time', () => {
    const state = createFpsTrackState(lcg(1))
    shoot(state)
    const recoil = state.recoilPitch
    const shake = state.shakeYaw
    for (let i = 0; i < 120; i += 1) tickFpsTrack(state, 1 / 60) // 2s
    expect(state.recoilPitch).toBeLessThan(recoil)
    expect(Math.abs(state.shakeYaw)).toBeLessThan(Math.abs(shake))
    expect(state.flashT).toBe(0)
  })

  it('effective view includes recoil and shake', () => {
    const state = createFpsTrackState(lcg(1))
    const yaw0 = effectiveYaw(state)
    const pitch0 = effectivePitch(state)
    shoot(state)
    expect(effectivePitch(state)).toBeGreaterThan(pitch0)
    expect(effectiveYaw(state)).not.toBe(yaw0)
  })

  it('tracking the target scores continuously', () => {
    const state = createFpsTrackState(lcg(1))
    let scored = false
    for (let i = 0; i < 120; i += 1) {
      tickFpsTrack(state, 1 / 60)
      if (!isLocked(state)) {
        // Re-centre both axes (as a perfect player would).
        turn(state, targetOffset(state) / 0.0022, targetPitchOffset(state) / 0.0022)
      }
      if (state.score > 0) scored = true
    }
    expect(scored).toBe(true)
    expect(state.onTargetTime).toBeGreaterThan(0)
  })

  it('targetScreenX/Y centre when locked and are null far off', () => {
    const state = createFpsTrackState(lcg(1))
    expect(Math.abs(targetScreenX(state)! - LOGICAL_W / 2)).toBeLessThan(LOGICAL_W * 0.05)
    expect(Math.abs(targetScreenY(state)! - LOGICAL_H / 2)).toBeLessThan(LOGICAL_H * 0.05)
    state.targetX = CAM_X - 500 // behind the camera
    expect(targetScreenX(state)).toBeNull()
    expect(targetScreenY(state)).toBeNull()
  })

  it('a higher target renders above the centre, a lower one below', () => {
    const state = createFpsTrackState(lcg(1))
    const centre = LOGICAL_H / 2
    state.targetH = CAM_H + 200 // above the camera
    expect(targetScreenY(state)).not.toBeNull()
    expect(targetScreenY(state)!).toBeLessThan(centre)
    state.targetH = CAM_H - 200 // below the camera
    expect(targetScreenY(state)).not.toBeNull()
    expect(targetScreenY(state)!).toBeGreaterThan(centre)
  })

  it('hitRate reflects shot accuracy', () => {
    const state = createFpsTrackState(lcg(1))
    expect(hitRate(state)).toBe(0)
    shoot(state) // locked -> hit
    expect(hitRate(state)).toBe(1)
    state.targetH = CAM_H + 400
    shoot(state) // miss
    expect(hitRate(state)).toBeCloseTo(0.5, 6)
  })

  it('the round ends when time runs out', () => {
    const state = createFpsTrackState(lcg(1))
    for (let i = 0; i < 2000; i += 1) tickFpsTrack(state, 1 / 60)
    expect(state.over).toBe(true)
    expect(state.remaining).toBe(0)
    expect(shoot(state)).toBe(false) // no shooting after the end
  })
})
