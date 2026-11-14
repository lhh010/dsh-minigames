import { describe, expect, it } from 'vitest'
import {
  buildLockPins, collapseFactorFor, createLockpick, inWindow, pinsForLock, pressPin,
  releasePin, reboundSpeedFor, selectPin, stepLockpick, windowHalfFor,
  LOCK_SCORE, MAX_LOCKS, MIN_SET_TENSION, PIN_SCORE, START_DURABILITY, UNLOCK_MS,
} from '../src/client/games/lockpick/logic.ts'

/** 把状态推到张力值（越过即停，单步速率恒定故必收敛）并断开张力输入。 */
function runToTension(state: ReturnType<typeof createLockpick>, target: number): void {
  let guard = 0
  while (guard < 500) {
    const rising = target > state.tension
    state.tensionInput = rising
    if (rising === (state.tension >= target)) break
    stepLockpick(state, 16)
    guard += 1
  }
  state.tensionInput = false
}

describe('lockpick logic', () => {
  it('builds deterministic pin specs from the seed (same seed equal, different seed differs)', () => {
    const a = buildLockPins(42, 1, 0)
    const b = buildLockPins(42, 1, 0)
    expect(a).toEqual(b)
    expect(a.length).toBe(pinsForLock(1))
    const c = buildLockPins(43, 1, 0)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
    for (const pin of a) {
      expect(pin.windowLow).toBeGreaterThan(0.4)
      expect(pin.windowHigh).toBeLessThan(0.95)
      expect(pin.windowHigh - pin.windowLow).toBeCloseTo(windowHalfFor(1) * 2, 6)
    }
  })

  it('integrates tension up while held and down when released', () => {
    const state = createLockpick(7, 1)
    expect(state.tension).toBe(0)
    state.tensionInput = true
    stepLockpick(state, 500)
    expect(state.tension).toBeGreaterThan(0.5)
    state.tensionInput = false
    for (let i = 0; i < 200; i += 1) stepLockpick(state, 16)
    expect(state.tension).toBe(0)
  })

  it('lifts the pressed pin slower under high tension', () => {
    const low = createLockpick(7, 1)
    const high = createLockpick(7, 1)
    runToTension(low, 0.05)
    runToTension(high, 0.95)
    pressPin(low)
    pressPin(high)
    for (let i = 0; i < 60; i += 1) {
      stepLockpick(low, 16)
      stepLockpick(high, 16)
    }
    expect(low.pos[0]!).toBeGreaterThan(high.pos[0]!)
    expect(high.pos[0]!).toBeGreaterThan(0)
  })

  it('releasing inside the window with enough tension sets the pin; too little tension does not', () => {
    const state = createLockpick(7, 1)
    runToTension(state, 0.8)
    const spec = state.pins[0]!
    state.pos[0] = (spec.windowLow + spec.windowHigh) / 2
    expect(inWindow(state)).toBe(true)
    pressPin(state)
    releasePin(state)
    expect(state.set[0]).toBe(true)
    expect(state.score).toBe(PIN_SCORE)
    expect(state.setOrder).toEqual([0])

    const weak = createLockpick(7, 1)
    runToTension(weak, MIN_SET_TENSION - 0.1)
    const spec2 = weak.pins[1]!
    selectPin(weak, 1)
    weak.pos[1] = (spec2.windowLow + spec2.windowHigh) / 2
    pressPin(weak)
    releasePin(weak)
    expect(weak.set[1]).toBe(false)
  })

  it('unset pins rebound to zero and higher locks rebound faster', () => {
    const state = createLockpick(7, 1)
    state.pos[0] = 0.8
    for (let i = 0; i < 240; i += 1) stepLockpick(state, 16)
    expect(state.pos[0]!).toBe(0)
    expect(reboundSpeedFor(5)).toBeGreaterThan(reboundSpeedFor(1))
    expect(windowHalfFor(5)).toBeLessThan(windowHalfFor(1))
    expect(collapseFactorFor(5)).toBeGreaterThan(collapseFactorFor(1))
    expect(pinsForLock(5)).toBe(6)
  })

  it('overshoot bounces the pin and collapses more set pins at higher tension', () => {
    const soft = createLockpick(7, 1)
    const hard = createLockpick(7, 1)
    for (const state of [soft, hard]) {
      // 预设 3 颗已设定弹子。
      state.set[0] = true; state.set[1] = true; state.set[2] = true
      state.setOrder = [0, 1, 2]
      selectPin(state, 3)
    }
    runToTension(soft, 0.3)
    runToTension(hard, 0.95)
    for (const state of [soft, hard]) {
      state.pos[3] = state.pins[3]!.windowHigh + 0.2
    }
    pressPin(soft)
    pressPin(hard)
    stepLockpick(soft, 16)
    stepLockpick(hard, 16)
    const softDown = soft.set.filter((s) => !s).length
    const hardDown = hard.set.filter((s) => !s).length
    expect(hardDown).toBeGreaterThan(softDown)
    expect(hardDown).toBeGreaterThanOrEqual(2)
    expect(soft.pos[3]!).toBe(0)
    expect(hard.pos[3]!).toBe(0)
    expect(soft.durability).toBe(START_DURABILITY - 1)
    expect(hard.durability).toBe(START_DURABILITY - 1)
  })

  it('overshoot without engagement tension bounces harmlessly (no durability loss)', () => {
    const state = createLockpick(7, 1)
    state.tension = 0.1
    selectPin(state, 2)
    state.pos[2] = state.pins[2]!.windowHigh + 0.2
    pressPin(state)
    stepLockpick(state, 16)
    expect(state.pos[2]!).toBe(0)
    expect(state.durability).toBe(START_DURABILITY)
    expect(state.over).toBe(false)
  })

  it('durability exhaustion fails the run', () => {
    const state = createLockpick(7, 1)
    state.tension = 0.9
    for (let i = 0; i < START_DURABILITY; i += 1) {
      selectPin(state, i % state.pins.length)
      state.pos[state.current] = state.pins[state.current]!.windowHigh + 0.2
      pressPin(state)
      stepLockpick(state, 16)
    }
    expect(state.durability).toBe(0)
    expect(state.over).toBe(true)
    expect(state.won).toBe(false)
  })

  it('setting every pin unlocks, advances locks, and five locks win the run', () => {
    const state = createLockpick(7, 1)
    const widths: number[] = []
    for (let lock = 0; lock < MAX_LOCKS; lock += 1) {
      const spec = state.pins.map((p) => p.windowHigh - p.windowLow)
      widths.push(spec[0]!)
      runToTension(state, 0.8)
      for (let i = 0; i < state.pins.length; i += 1) {
        selectPin(state, i)
        state.pos[i] = (state.pins[i]!.windowLow + state.pins[i]!.windowHigh) / 2
        pressPin(state)
        releasePin(state)
      }
      expect(state.set.every((s) => s)).toBe(true)
      stepLockpick(state, 16) // 全设定判定在 step 内完成。
      expect(state.unlockMs).toBeGreaterThan(0)
      expect(state.unlockMs).toBeLessThanOrEqual(UNLOCK_MS)
      // 消化开锁动画 → 装配下一把锁（或胜利）。
      for (let k = 0; k < 80; k += 1) stepLockpick(state, 16)
    }
    // 5 把锁弹子数 4+4+5+5+6 = 24 颗，每颗 PIN_SCORE，每把 LOCK_SCORE。
    expect(state.score).toBe(24 * PIN_SCORE + MAX_LOCKS * LOCK_SCORE)
    expect(state.over).toBe(true)
    expect(state.won).toBe(true)
    expect(widths[0]!).toBeGreaterThan(0)
  })
})
