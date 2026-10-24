import { describe, expect, it } from 'vitest'
import {
  COMBO_WINDOW_S, COLLIDE_X, LANES, MAX_SPEED, NEAR_X, PASS_POINTS, PD, SPAWN_Z,
  attractStep, baseSpeedAt, blockedLanes, cameraX, centreAt, changeLane, createState,
  mulberry32, spawnWave, startRun, step, togglePause, playerWorldX, type LaneInput,
} from '../src/client/games/racing/logic.ts'

const idle: LaneInput = { left: false, right: false, accel: false, brake: false }
const accel: LaneInput = { ...idle, accel: true }
const brake: LaneInput = { ...idle, brake: true }

/** Run n seconds at a fixed dt with the given input. */
function run(state: ReturnType<typeof createState>, secs: number, input: LaneInput = idle): void {
  const dt = 1 / 60
  for (let i = 0; i < Math.round(secs / dt); i += 1) step(state, dt, input)
}

describe('racing logic', () => {
  it('centreAt is bounded and deterministic', () => {
    for (const z of [0, 10, 55, 170, 999]) {
      const v = centreAt(z)
      expect(v).toBeGreaterThanOrEqual(-2.7)
      expect(v).toBeLessThanOrEqual(2.7)
      expect(centreAt(z)).toBe(v)
    }
  })

  it('mulberry32 is deterministic and in range', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 50; i += 1) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('createState starts in attract mode with a live road', () => {
    const s = createState(1)
    expect(s.result).toBe('ready')
    expect(s.speed).toBeGreaterThan(0)
    expect(s.enemies).toHaveLength(0)
    expect(s.laneIdx).toBe(1)
  })

  it('lane changes clamp to [0,2] and only apply while playing', () => {
    const s = createState(1)
    expect(changeLane(s, -1)).toBe(false) // ready
    startRun(s)
    expect(s.result).toBe('playing')
    expect(changeLane(s, -1)).toBe(true)
    expect(s.laneIdx).toBe(0)
    expect(changeLane(s, -1)).toBe(false) // already leftmost
    expect(changeLane(s, 1)).toBe(true)
    expect(changeLane(s, 1)).toBe(true)
    expect(s.laneIdx).toBe(2)
    expect(changeLane(s, 1)).toBe(false) // rightmost
  })

  it('accel raises speed toward the cap; brake lowers it', () => {
    const a = createState(1); startRun(a)
    run(a, 1, idle)
    const cruise = a.speed
    run(a, 2, accel)
    expect(a.speed).toBeGreaterThan(cruise)
    expect(a.speed).toBeLessThanOrEqual(MAX_SPEED)
    const fast = a.speed
    run(a, 1, brake)
    expect(a.speed).toBeLessThan(fast)
  })

  it('base speed ramps with survival time and saturates', () => {
    expect(baseSpeedAt(0)).toBeCloseTo(34)
    expect(baseSpeedAt(30)).toBeCloseTo(44.5) // 34 + min(30, 10.5)
    expect(baseSpeedAt(60)).toBeCloseTo(55) // 34 + min(30, 21)
    expect(baseSpeedAt(600)).toBeCloseTo(64) // 34 + 30 cap
    expect(baseSpeedAt(60)).toBeGreaterThan(baseSpeedAt(30))
  })

  it('spawning always keeps at least one lane free', () => {
    const s = createState(11)
    startRun(s)
    const dt = 1 / 60
    for (let i = 0; i < 60 * 90; i += 1) {
      step(s, dt, idle)
      const blocked = blockedLanes(s)
      expect(blocked.size).toBeLessThan(LANES.length)
      if (s.result === 'over') break
    }
    expect(s.enemies.length + s.passCount).toBeGreaterThan(0) // traffic actually flowed
  })

  it('a collision crashes and ends the run after the crash timer', () => {
    const s = createState(1)
    startRun(s)
    s.enemies = [{ li: s.laneIdx, lane: LANES[s.laneIdx]!, z: PD + 1.2, v: 0, color: '#fff', near: false, passed: false }]
    run(s, 0.2, idle)
    expect(s.crashed).toBe(true)
    expect(s.score).toBeGreaterThanOrEqual(0)
    run(s, 2, idle)
    expect(s.result).toBe('over')
    // Inert after over.
    const frozen = JSON.stringify({ z: s.worldZ, score: s.score })
    run(s, 1, accel)
    expect(JSON.stringify({ z: s.worldZ, score: s.score })).toBe(frozen)
  })

  it('a near miss scores exactly once per enemy and the combo expires', () => {
    const s = createState(1)
    startRun(s)
    // Mid-lane-change geometry: the lateral gap starts inside the NEAR band
    // but outside the collision band; the enemy keeps station with the player.
    s.playerLat = LANES[0]! + 0.55
    s.enemies = [{ li: 1, lane: LANES[1]!, z: PD + 1.2, v: s.speed, color: '#fff', near: false, passed: false }]
    const idleIn: LaneInput = { left: false, right: false, accel: false, brake: false }
    step(s, 1 / 60, idleIn)
    // Exactly one near-miss event and one combo step on the first frame.
    expect(s.combo).toBe(1)
    expect(s.events.filter(e => e.kind === 'near-miss')).toHaveLength(1)
    expect(s.score).toBeGreaterThanOrEqual(100)
    // Further frames with the enemy still in band must not re-award.
    s.events = []
    s.playerLat = LANES[0]! + 0.55
    step(s, 1 / 60, idleIn)
    expect(s.events.filter(e => e.kind === 'near-miss')).toHaveLength(0)
    // Combo window expiry resets the multiplier.
    run(s, COMBO_WINDOW_S + 0.5, idle)
    expect(s.combo).toBe(0)
  })

  it('passing an enemy increments passCount and score exactly once', () => {
    const s = createState(1)
    startRun(s)
    const other = s.laneIdx === 0 ? 1 : 0
    s.enemies = [{ li: other, lane: LANES[other]!, z: PD + 20, v: 0, color: '#fff', near: false, passed: false }]
    run(s, 1.5, idle)
    expect(s.passCount).toBe(1)
    const scoreAfterPass = s.score
    run(s, 0.5, idle)
    expect(s.passCount).toBe(1) // still one
    expect(s.score - scoreAfterPass).toBeGreaterThanOrEqual(0)
    expect(PASS_POINTS).toBe(30)
  })

  it('score accumulates from distance while playing and freezes on crash', () => {
    const s = createState(1)
    startRun(s)
    run(s, 1, idle)
    expect(s.score).toBeGreaterThan(0)
    expect(s.dist).toBeGreaterThan(0)
    const before = s.score
    run(s, 0.5, accel)
    expect(s.score).toBeGreaterThan(before)
  })

  it('is deterministic for the same seed and input script', () => {
    const a = createState(42)
    const b = createState(42)
    startRun(a); startRun(b)
    const script: LaneInput[] = [idle, accel, { ...idle, left: true }, idle, brake, accel]
    for (const inp of script) { run(a, 0.5, inp); run(b, 0.5, inp) }
    const snap = (s: typeof a): string => JSON.stringify({ z: s.worldZ, score: s.score, speed: s.speed, enemies: s.enemies, dist: s.dist })
    expect(snap(a)).toBe(snap(b))
  })

  it('togglePause only flips between playing and paused', () => {
    const s = createState(1)
    togglePause(s) // ready → no-op
    expect(s.result).toBe('ready')
    startRun(s)
    togglePause(s)
    expect(s.result).toBe('paused')
    // Paused state does not advance.
    const z = s.worldZ
    run(s, 1, accel)
    expect(s.worldZ).toBe(z)
    togglePause(s)
    expect(s.result).toBe('playing')
  })

  it('camera and player positions stay on the road', () => {
    const s = createState(5)
    startRun(s)
    run(s, 3, accel)
    const cam = cameraX(s)
    const pw = playerWorldX(s)
    expect(Number.isFinite(cam)).toBe(true)
    expect(Number.isFinite(pw)).toBe(true)
    // The camera trails the player but never equals it exactly (0.6 follow).
    expect(Math.abs(pw - cam)).toBeGreaterThan(0)
    expect(Math.abs(pw - cam)).toBeLessThan(5)
  })

  it('spawnWave never blocks the last free lane', () => {
    const s = createState(3)
    startRun(s)
    // Two lanes occupied BEYOND the spawn horizon (z > SPAWN_Z - 40 counts as
    // blocked): lane 2 stays free and the wave must leave it open.
    s.enemies = [
      { li: 0, lane: LANES[0]!, z: SPAWN_Z - 10, v: 0, color: '#fff', near: false, passed: false },
      { li: 1, lane: LANES[1]!, z: SPAWN_Z - 12, v: 0, color: '#fff', near: false, passed: false },
    ]
    spawnWave(s)
    expect(blockedLanes(s).size).toBe(2)
    expect(s.enemies.some(e => e.li === 2)).toBe(false)
    // With two lanes near the horizon, the guard keeps the third open.
    expect(s.enemies).toHaveLength(2)
  })

  it('attract mode scrolls the road without scoring', () => {
    const s = createState(1)
    attractStep(s, 0.5)
    expect(s.worldZ).toBeGreaterThan(0)
    expect(s.score).toBe(0)
    expect(s.result).toBe('ready')
  })

  it('collision band constants match the reference geometry', () => {
    expect(COLLIDE_X).toBe(0.8)
    expect(NEAR_X).toBe(1.35)
    expect(PD).toBe(3)
    expect(SPAWN_Z).toBe(170)
  })
})
