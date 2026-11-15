import { describe, expect, it } from 'vitest'
import {
  ADD_PLATE_MS, DECAY_PER_S, MAX_PLATES, PLAYER_MARGIN, PLAYER_SPEED, SPAWN_SPIN_MIN, SPIN_ADD, SPIN_CD_MS, SPIN_MAX, START_LIVES, W,
  createPlates, IDLE_INPUT, isWobbling, nearestPlate, plateTargetOf, slotX, stepPlates,
  type Plate, type PlatesInput, type PlatesState,
} from '../src/client/games/plates/logic.ts'

const idle: PlatesInput = IDLE_INPUT

/** 把场上碟子替换为一只转速可控的碟（压制自然补碟的干扰）。 */
function pinPlate(s: PlatesState, spin: number, slot = 0): Plate {
  const plate: Plate = { slot, spin, phase: 0, hue: 0 }
  s.plates.length = 0
  s.plates.push(plate)
  return plate
}

function run(s: PlatesState, frames: number, input: PlatesInput = idle, dtMs = 16): void {
  for (let i = 0; i < frames; i += 1) stepPlates(s, dtMs, input)
}

function spinInput(): PlatesInput {
  return { left: false, right: false, spin: true }
}

describe('plates logic', () => {
  it('starts with one plate in slot 0 and the target schedule grows every 15s capped at 6', () => {
    expect(plateTargetOf(0)).toBe(1)
    expect(plateTargetOf(ADD_PLATE_MS - 1)).toBe(1)
    expect(plateTargetOf(ADD_PLATE_MS)).toBe(2)
    expect(plateTargetOf(5 * ADD_PLATE_MS)).toBe(MAX_PLATES)
    expect(plateTargetOf(99 * ADD_PLATE_MS)).toBe(MAX_PLATES)

    const s = createPlates(1)
    expect(s.plates.length).toBe(1)
    expect(s.plates[0]!.slot).toBe(0)
    expect(s.plates[0]!.spin).toBeGreaterThanOrEqual(SPAWN_SPIN_MIN)
    expect(s.plates[0]!.spin).toBeLessThanOrEqual(SPIN_MAX)
    expect(s.lives).toBe(START_LIVES)
    expect(s.playerX).toBe(W / 2)
    // 到点后下一帧补 1 只到最低空闲槽位。
    s.t = ADD_PLATE_MS
    stepPlates(s, 16, idle)
    expect(s.plates.length).toBe(2)
    expect(s.plates.some((p) => p.slot === 1)).toBe(true)
    expect(s.events.some((e) => e.type === 'spawn' && e.x === slotX(1))).toBe(true)
  })

  it('spin decays at 0.09 per second and the plate wobbles only below 0.25', () => {
    const s = createPlates(2)
    const plate = pinPlate(s, 0.9)
    stepPlates(s, 16, idle)
    expect(plate.spin).toBeCloseTo(0.9 - DECAY_PER_S * 0.016, 10)
    expect(isWobbling(plate)).toBe(false)
    plate.spin = 0.26
    expect(isWobbling(plate)).toBe(false)
    plate.spin = 0.24
    expect(isWobbling(plate)).toBe(true)
    plate.spin = 0
    expect(isWobbling(plate)).toBe(false)
    // 连续推进 5 秒：0.9 - 0.09×5 = 0.45。
    const s2 = createPlates(2)
    const p2 = pinPlate(s2, 0.9)
    run(s2, 1000, idle, 5) // 1000 × 5ms = 5s
    expect(p2.spin).toBeCloseTo(0.45, 8)
  })

  it('spin boost adds +0.5 to the nearest plate, caps at 1, and gates on the 1s cooldown', () => {
    const s = createPlates(3)
    const plate = pinPlate(s, 0.3)
    // 第 1 次补转成功：先 +0.5 再按帧衰减。
    stepPlates(s, 16, spinInput())
    expect(plate.spin).toBeCloseTo(0.3 + SPIN_ADD - DECAY_PER_S * 0.016, 10)
    expect(s.events.some((e) => e.type === 'spin')).toBe(true)
    expect(s.cooldownLeft).toBe(SPIN_CD_MS)
    // 冷却期内补转被拒绝：转速只按自然衰减变化并产生 deny 事件。
    stepPlates(s, 16, spinInput())
    expect(plate.spin).toBeCloseTo(0.3 + SPIN_ADD - DECAY_PER_S * 0.032, 10)
    expect(s.events.some((e) => e.type === 'deny')).toBe(true)
    // 冷却每帧递减；61 帧（976ms）后剩 24ms，62 帧当帧递减后仍拒绝，
    // 63 帧可再次补转。
    run(s, 60, idle)
    expect(s.cooldownLeft).toBeGreaterThan(0)
    stepPlates(s, 16, spinInput())
    expect(s.events.some((e) => e.type === 'deny')).toBe(true)
    stepPlates(s, 16, spinInput())
    expect(s.events.some((e) => e.type === 'spin')).toBe(true)
    // 封顶 1（清掉冷却单独验证）。
    s.cooldownLeft = 0
    plate.spin = 0.9
    stepPlates(s, 16, spinInput())
    expect(plate.spin).toBeCloseTo(SPIN_MAX - DECAY_PER_S * 0.016, 10)
  })

  it('spin targets only the plate nearest the performer', () => {
    const s = createPlates(4)
    const near: Plate = { slot: 3, spin: 0.4, phase: 0, hue: 1 }
    const far: Plate = { slot: 0, spin: 0.4, phase: 0, hue: 2 }
    s.plates.length = 0
    s.plates.push(far, near)
    s.playerX = slotX(3)
    expect(nearestPlate(s)).toBe(near)
    stepPlates(s, 16, spinInput())
    expect(near.spin).toBeCloseTo(0.4 + SPIN_ADD - DECAY_PER_S * 0.016, 10)
    expect(far.spin).toBeCloseTo(0.4 - DECAY_PER_S * 0.016, 10)
  })

  it('a plate reaching zero spin drops: -1 life, respawn fills the free slot next frame', () => {
    const s = createPlates(5)
    s.t = 2 * ADD_PLATE_MS // 目标 3 碟
    const plate = pinPlate(s, 0.0005, 1)
    stepPlates(s, 16, idle)
    expect(s.plates.some((p) => p === plate)).toBe(false)
    expect(s.lives).toBe(START_LIVES - 1)
    expect(s.dropped).toBe(1)
    expect(s.events.some((e) => e.type === 'drop' && e.x === slotX(1))).toBe(true)
    // 掉落后场上 0 碟，每帧最多补 1：3 帧补回目标 3。
    expect(s.plates.length).toBe(1)
    stepPlates(s, 16, idle)
    expect(s.plates.length).toBe(2)
    stepPlates(s, 16, idle)
    expect(s.plates.length).toBe(3)
    // 补碟优先最低空闲槽位。
    expect(s.plates.some((p) => p.slot === 0)).toBe(true)
  })

  it('the performer moves with held directions and clamps inside the stage', () => {
    const s = createPlates(6)
    const x0 = s.playerX
    stepPlates(s, 16, { left: false, right: true, spin: false })
    expect(s.playerX).toBeCloseTo(x0 + PLAYER_SPEED * 0.016, 8)
    stepPlates(s, 16, { left: true, right: true, spin: false })
    expect(s.playerX).toBeCloseTo(x0 + PLAYER_SPEED * 0.016, 8) // 左右同按抵消
    // 顶到边界并夹住。
    run(s, 100, { left: false, right: true, spin: false })
    expect(s.playerX).toBe(W - PLAYER_MARGIN)
    run(s, 100, { left: true, right: false, spin: false })
    expect(s.playerX).toBe(PLAYER_MARGIN)
  })

  it('score accumulates at 10 per plate per second and integer-floors for display', () => {
    const s = createPlates(7)
    pinPlate(s, 0.9) // 单碟：每秒 10 分
    run(s, 62, idle) // 992ms → 9.92
    expect(s.scoreAcc).toBeCloseTo(9.92, 8)
    expect(s.score).toBe(9)
    run(s, 1, idle) // 1008ms → 10.08
    expect(s.score).toBe(10)
    // 3 碟时每秒 30 分。
    const s2 = createPlates(7)
    s2.t = 2 * ADD_PLATE_MS
    stepPlates(s2, 16, idle) // 补到 2
    stepPlates(s2, 16, idle) // 补到 3
    expect(s2.plates.length).toBe(3)
    const acc0 = s2.scoreAcc
    run(s2, 62, idle)
    expect(s2.scoreAcc - acc0).toBeCloseTo(10 * 3 * 0.992, 8)
  })

  it('losing the last life ends the game and freezes clock, plates and score', () => {
    const s = createPlates(8)
    s.lives = 1
    pinPlate(s, 0.005)
    run(s, 4)
    expect(s.over).toBe(true)
    expect(s.lives).toBe(0)
    const t = s.t
    const score = s.score
    pinPlate(s, 0.9)
    run(s, 30, spinInput())
    expect(s.plates.length).toBe(1)
    expect(s.plates[0]!.spin).toBe(0.9)
    expect(s.t).toBe(t)
    expect(s.score).toBe(score)
  })

  it('the same seed and input script replay identically; other seeds or rounds diverge', () => {
    const trace = (seed: number, round: number): string => {
      const s = createPlates(seed, round)
      const marks: number[] = []
      for (let frame = 0; frame < 2000; frame += 1) {
        const input: PlatesInput = {
          left: frame % 200 < 100,
          right: frame % 200 >= 100,
          spin: frame % 37 === 0,
        }
        stepPlates(s, 16, input)
        marks.push(s.score, s.lives, s.dropped, Math.round(s.playerX), s.plates.length, s.hueCount, s.cooldownLeft > 0 ? 1 : 0)
        for (const p of s.plates) marks.push(p.slot, Math.round(p.spin * 1e6), Math.round(p.phase * 1e3))
      }
      return JSON.stringify(marks)
    }
    expect(trace(888, 1)).toBe(trace(888, 1))
    expect(trace(888, 1)).not.toBe(trace(888, 2))
    expect(trace(888, 1)).not.toBe(trace(777, 1))
  })
})
