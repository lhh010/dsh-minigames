import { describe, expect, it } from 'vitest'
import {
  BASE_SPEED, CRASH_INVULN_MS, DIST_PER_GEAR, FLOAT_MS, GATE_SCORE, MAX_SPEED, MAX_VX,
  PLAYER_R, START_LIVES, STEER_AX, VX_DAMP, createSki, displayDistance, displaySpeed,
  generateSegment, stepSki, type SkiInput, type SkiState,
} from '../src/client/games/ski/logic.ts'

const idle: SkiInput = { left: false, right: false, pointerX: null }

/** 快进 n 帧空闲输入。 */
function run(s: SkiState, frames: number, input: SkiInput = idle): void {
  for (let i = 0; i < frames; i += 1) stepSki(s, 16, input)
}

describe('ski logic', () => {
  it('terrain generation is deterministic per (seed, segment) and keeps a clear gate corridor', () => {
    for (const [seed, index] of [[3, 0], [3, 1], [77, 5]] as const) {
      expect(generateSegment(seed, index)).toEqual(generateSegment(seed, index))
    }
    for (let index = 0; index < 8; index += 1) {
      const seg = generateSegment(9, index)
      expect(seg.index).toBe(index)
      expect(seg.gateDone).toBe(false)
      // 门线落在段内、缺口中心在画布内。
      expect(seg.gateY).toBeGreaterThanOrEqual(index * 300)
      expect(seg.gateY).toBeLessThan((index + 1) * 300)
      expect(seg.gapX).toBeGreaterThan(0)
      expect(seg.gapX).toBeLessThan(480)
      // 障碍不压旗门走廊。
      for (const o of seg.obstacles) {
        const nearGate = Math.abs(o.worldY - seg.gateY) < 80 && Math.abs(o.x - seg.gapX) < 52 + 26
        expect(nearGate).toBe(false)
        expect(o.x).toBeGreaterThanOrEqual(26 - 1e-9)
        expect(o.x).toBeLessThanOrEqual(480 - 26 + 1e-9)
      }
    }
  })

  it('gates crossed on the gap pay exactly once; a missed line pays nothing', () => {
    const s = createSki(21)
    const seg = s.segments.get(0)!
    s.playerX = seg.gapX
    // 只推进到穿过第 0 段门线为止，避免卷入后续段的不确定地形。
    let guard = 0
    while (!seg.gateDone && guard < 1000) { stepSki(s, 16, idle); guard += 1 }
    expect(seg.gateDone).toBe(true)
    expect(s.score).toBe(GATE_SCORE)
    expect(s.events.some((e) => e.type === 'gate' && e.gained === GATE_SCORE)).toBe(true)
    expect(s.events.filter((e) => e.type === 'gate').length).toBe(1)
    // 已结算的门不再得分：继续滑也不翻倍。
    const score = s.score
    stepSki(s, 16, idle)
    expect(s.score).toBe(score)

    const miss = createSki(21)
    const missSeg = miss.segments.get(0)!
    miss.playerX = 0
    guard = 0
    while (!missSeg.gateDone && guard < 1000) { stepSki(miss, 16, idle); guard += 1 }
    expect(missSeg.gateDone).toBe(true)
    expect(miss.score).toBe(0)
  })

  it('speed gears up with distance and is capped; display helpers convert units', () => {
    const s = createSki(4)
    expect(s.speed).toBe(BASE_SPEED)
    expect(s.gear).toBe(1)
    s.distance = DIST_PER_GEAR - 1
    stepSki(s, 16, idle)
    expect(s.gear).toBe(1)
    s.distance = DIST_PER_GEAR * 5
    stepSki(s, 16, idle)
    expect(s.gear).toBe(6)
    expect(s.speed).toBe(BASE_SPEED + 5 * 26)
    s.distance = DIST_PER_GEAR * 100
    stepSki(s, 16, idle)
    expect(s.speed).toBe(MAX_SPEED)
    expect(displaySpeed(s)).toBe(Math.round(s.speed / 4))
    expect(displayDistance(s)).toBe(Math.floor(s.distance / 10))
  })

  it('steering: keys accelerate, release decays, pointer follows, walls stop the skier', () => {
    const key = createSki(5)
    stepSki(key, 100, { left: false, right: true, pointerX: null })
    expect(key.vx).toBeGreaterThan(0)
    expect(key.vx).toBeCloseTo(Math.min(MAX_VX, 0 + STEER_AX * 0.1), 5)
    const left = createSki(5)
    stepSki(left, 100, { left: true, right: false, pointerX: null })
    expect(left.vx).toBeLessThan(0)

    // 松手指数衰减。
    const damp = createSki(5)
    damp.vx = 400
    stepSki(damp, 100, idle)
    expect(damp.vx).toBeGreaterThan(0)
    expect(damp.vx).toBeLessThan(400 * Math.pow(VX_DAMP, 0.1) + 1e-6)

    // 指针跟随：横向速度正比于偏差并夹紧。
    const ptr = createSki(5)
    stepSki(ptr, 16, { left: false, right: false, pointerX: ptr.playerX + 30 })
    expect(ptr.vx).toBeCloseTo(30 * 9, 5)
    stepSki(ptr, 16, { left: false, right: false, pointerX: ptr.playerX + 10000 })
    expect(ptr.vx).toBe(MAX_VX)

    // 撞左右墙夹紧并清零横向速度。
    const wall = createSki(5)
    for (let i = 0; i < 200; i += 1) stepSki(wall, 16, { left: false, right: false, pointerX: -999 })
    expect(wall.playerX).toBe(PLAYER_R)
    expect(wall.vx).toBe(0)
  })

  it('crashing costs a life, grants invulnerability, and the third crash ends the run', () => {
    const s = createSki(6)
    // 换成可控地形：远处旗门 + 一颗贴脸障碍。
    s.segments.clear()
    s.segments.set(0, {
      index: 0, gateY: 1e9, gapX: 240, gateDone: false,
      obstacles: [{ x: s.playerX, worldY: 3, kind: 'tree', r: 13 }],
    })
    stepSki(s, 16, idle)
    expect(s.lives).toBe(START_LIVES - 1)
    expect(s.invulnMs).toBeGreaterThan(0)
    expect(s.invulnMs).toBeLessThanOrEqual(CRASH_INVULN_MS)
    expect(s.events.some((e) => e.type === 'crash')).toBe(true)
    // 无敌期内同一障碍不再扣命。
    s.segments.get(0)!.obstacles[0]!.worldY = s.distance + 3
    stepSki(s, 16, idle)
    expect(s.lives).toBe(START_LIVES - 1)
    // 无敌解除后同一障碍再次命中；连续两次扣光并结束。
    s.invulnMs = 0
    s.segments.get(0)!.obstacles[0]!.worldY = s.distance + 3
    stepSki(s, 16, idle)
    expect(s.lives).toBe(1)
    s.invulnMs = 0
    s.segments.get(0)!.obstacles[0]!.worldY = s.distance + 3
    const score = s.score
    stepSki(s, 16, idle)
    expect(s.lives).toBe(0)
    expect(s.phase).toBe('over')
    run(s, 10)
    expect(s.lives).toBe(0)
    expect(s.score).toBe(score)
  })

  it('floats rise, expire after FLOAT_MS, and the trail is capped', () => {
    const s = createSki(8)
    s.floats.push({ x: 100, y: 400, text: '+50', life: FLOAT_MS })
    const y0 = 400
    stepSki(s, 100, idle)
    expect(s.floats.length).toBe(1)
    expect(s.floats[0]!.y).toBeLessThan(y0)
    stepSki(s, FLOAT_MS, idle)
    expect(s.floats.length).toBe(0)
    for (let i = 0; i < 400; i += 1) stepSki(s, 16, idle)
    expect(s.trail.length).toBeLessThanOrEqual(110)
    expect(s.trail[s.trail.length - 1]!.worldY).toBeCloseTo(s.distance, 6)
  })

  it('the same seed and input script replay identical frames', () => {
    const runTrace = (): string => {
      const s = createSki(314)
      const trace: number[] = []
      for (let frame = 0; frame < 900; frame += 1) {
        const input: SkiInput = frame % 3 === 0
          ? { left: false, right: false, pointerX: 80 + (frame % 7) * 40 }
          : { left: frame % 5 === 1, right: frame % 5 === 3, pointerX: null }
        stepSki(s, 16, input)
        trace.push(
          Math.round(s.score), s.lives, Math.round(s.distance * 10), Math.round(s.playerX * 10),
          Math.round(s.vx), s.phase === 'skiing' ? 0 : 1, s.segments.size,
        )
      }
      const seg = [...s.segments.entries()].map(([i, v]) => [i, Math.round(v.gateY), Math.round(v.gapX), v.gateDone ? 1 : 0, v.obstacles.length])
      return JSON.stringify([trace, seg])
    }
    expect(runTrace()).toBe(runTrace())
  })
})
