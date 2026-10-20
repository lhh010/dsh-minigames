import { describe, expect, it } from 'vitest'
import {
  createDodger, stepDodger, spawnBullet, spawnLaser, setTarget, spawnInterval, bulletSpeed,
  laserInterval, laserDist, lineClip,
  W, H, HUD_H, PLAYER_R, BULLET_R, GRACE_MS, RAMP_MS, AIM_JITTER, MAX_BULLETS,
  NEAR_MISS_FACTOR, NEAR_MISS_BONUS, SCORE_PER_SECOND,
  LASER_TELEGRAPH_MS, LASER_FIRE_MS, LASER_FADE_MS, LASER_BEAM_HALF, LASER_START_MS,
  LASER_RAMP_MS, LASER_MAX_ALIVE, LASER_SOLO_FIRE_UNTIL, LASER_AIM_CHANCE,
  LASER_DIAGONAL_SCORE,
  HOMING_SCORE, HOMING_FRACTION, HOMING_TURN_RATE, HOMING_SPEED_FACTOR, HOMING_LIFE_MS,
  HOMING_MAX_ALIVE, HOMING_CULL_MARGIN,
  type Bullet, type DodgerInput, type DodgerState, type Laser, type LaserAxis,
} from '../src/client/games/dodger/logic.ts'

/** Deterministic LCG so spawns, aiming, and runs are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const idle: DodgerInput = { up: false, down: false, left: false, right: false }
const FRAME = 1000 / 60

/** A laser in an explicit phase; helper for direct construction. */
function laserAt(
  axis: LaserAxis, pos: number, phase: Laser['phase'] = 'telegraph', phaseT = 0, ax = 0, ay = 0,
): Laser {
  return { axis, pos, phase, phaseT, ax, ay }
}

/** Place one bullet at (x, y) aimed so it will pass the player: clear field. */
function bulletAt(x: number, y: number, vx: number, vy: number): Bullet {
  return { x, y, vx, vy, grazed: false }
}

describe('dodger logic', () => {
  it('ramps spawn interval 900→250 and speed 90→220 over 120s, clamped after', () => {
    expect(spawnInterval(0)).toBe(900)
    expect(spawnInterval(RAMP_MS)).toBe(250)
    expect(spawnInterval(RAMP_MS * 10)).toBe(250)
    const mid = spawnInterval(RAMP_MS / 2)
    expect(mid).toBeGreaterThan(250)
    expect(mid).toBeLessThan(900)
    expect(bulletSpeed(0)).toBe(90)
    expect(bulletSpeed(RAMP_MS)).toBe(220)
    expect(bulletSpeed(RAMP_MS * 10)).toBe(220)
    expect(bulletSpeed(RAMP_MS / 2)).toBeCloseTo(155, 5)
  })

  it('spawns bullets on the edges within bounds, aimed near the player', () => {
    const state = createDodger(lcg(7))
    state.t = RAMP_MS // top speed tier for a crisp speed check
    const M = BULLET_R + 4
    for (let i = 0; i < 500; i += 1) {
      spawnBullet(state)
      const b = state.bullets[state.bullets.length - 1]!
      // On some edge ring (outside or on the arena border).
      const onEdge = b.x >= -M - 0.01 && b.x <= W + M + 0.01 && b.y >= -M - 0.01 && b.y <= H + M + 0.01
      expect(onEdge).toBe(true)
      const out = b.x < 0 || b.x > W || b.y < 0 || b.y > H
      expect(out).toBe(true)
      // Speed matches the ramp and heading stays within the jitter cone.
      expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(220, 5)
      const exact = Math.atan2(state.y - b.y, state.x - b.x)
      const heading = Math.atan2(b.vy, b.vx)
      let off = Math.abs(heading - exact)
      if (off > Math.PI) off = Math.PI * 2 - off
      expect(off).toBeLessThanOrEqual(AIM_JITTER + 1e-9)
    }
  })

  it('caps the bullet pool at 120', () => {
    const state = createDodger(lcg(3))
    state.bullets = Array.from({ length: MAX_BULLETS }, () => bulletAt(-100, -100, 0, 1))
    for (let i = 0; i < 30; i += 1) spawnBullet(state)
    expect(state.bullets.length).toBe(MAX_BULLETS)
  })

  it('kills on circle contact outside grace', () => {
    const state = createDodger(lcg(1))
    state.grace = 0
    state.bullets = [bulletAt(state.x + PLAYER_R + BULLET_R - 1, state.y, 0, 0)]
    expect(stepDodger(state, FRAME, idle)).toBe(true)
    expect(state.over).toBe(true)
  })

  it('survives contact during the grace window and decrements grace', () => {
    const state = createDodger(lcg(1))
    expect(state.grace).toBe(GRACE_MS)
    state.bullets = [bulletAt(state.x, state.y, 0, 0)] // overlapping, zero velocity
    expect(stepDodger(state, FRAME, idle)).toBe(false)
    expect(state.over).toBe(false)
    expect(state.grace).toBeCloseTo(GRACE_MS - FRAME, 5)
    // Overlap never kills while the grace window lasts (~90 frames).
    for (let i = 0; i < 85; i += 1) stepDodger(state, FRAME, idle)
    expect(state.over).toBe(false)
    // Drain the remaining grace; overlap then kills.
    while (state.grace > 0) stepDodger(state, FRAME, idle)
    // Once grace ends, the overlapping bullet is lethal again.
    state.bullets = [bulletAt(state.x, state.y, 0, 0)]
    expect(stepDodger(state, FRAME, idle)).toBe(true)
  })

  it('awards a near-miss bonus once per bullet', () => {
    const state = createDodger(lcg(1))
    state.grace = 0
    state.t = 0
    // Bullet sliding past at exactly graze distance, stationary player.
    const grazeR = (PLAYER_R + BULLET_R) * NEAR_MISS_FACTOR
    const pass = grazeR - 1
    state.bullets = [bulletAt(state.x - 100, state.y - pass, 200, 0)]
    const steps = 90 // bullet needs ~30 frames to cross the graze zone
    for (let i = 0; i < steps; i += 1) stepDodger(state, FRAME, idle)
    expect(state.grazes).toBe(1)
    expect(state.score).toBe(Math.floor(state.t / 1000) * SCORE_PER_SECOND + NEAR_MISS_BONUS)
    // A second pass of the same (already-grazed) bullet pays nothing —
    // verified by grazes staying 1 above; now a fresh grazing bullet adds 1.
    const before = state.grazes
    state.bullets.push(bulletAt(state.x - 100, state.y - pass, 200, 0))
    for (let i = 0; i < steps; i += 1) stepDodger(state, FRAME, idle)
    expect(state.grazes).toBe(before + 1)
  })

  it('awards survival score as whole seconds x10', () => {
    const state = createDodger(lcg(2))
    state.bullets = []
    for (let i = 0; i < Math.round(2500 / FRAME); i += 1) {
      state.bullets = [] // never graze, never die
      stepDodger(state, FRAME, idle)
    }
    expect(state.t).toBeGreaterThanOrEqual(2400)
    expect(state.score).toBe(Math.floor(state.t / 1000) * SCORE_PER_SECOND)
  })

  it('is inert after game over', () => {
    const state = createDodger(lcg(1))
    state.grace = 0
    state.bullets = [bulletAt(state.x, state.y, 0, 0)]
    stepDodger(state, FRAME, idle)
    expect(state.over).toBe(true)
    const t = state.t
    const score = state.score
    const x = state.x
    state.bullets = [bulletAt(state.x, state.y, 0, 0)]
    setTarget(state, 10, 100)
    expect(stepDodger(state, 1000, { up: true, down: false, left: true, right: false })).toBe(true)
    expect(state.t).toBe(t)
    expect(state.score).toBe(score)
    expect(state.x).toBe(x)
  })

  it('chases the clamped target with keyboard nudging', () => {
    const state = createDodger(lcg(5))
    setTarget(state, -50, -50)
    expect(state.tx).toBe(PLAYER_R)
    expect(state.ty).toBe(HUD_H + PLAYER_R)
    // Holding right/down moves the target and the player follows.
    const x0 = state.x
    for (let i = 0; i < 60; i += 1) stepDodger(state, FRAME, { ...idle, right: true, down: true })
    expect(state.tx).toBeGreaterThan(x0)
    expect(state.x).toBeGreaterThan(x0)
    // Target never leaves the arena.
    expect(state.tx).toBeLessThanOrEqual(W - PLAYER_R)
    expect(state.ty).toBeLessThanOrEqual(H - PLAYER_R)
  })

  it('culls far off-screen bullets', () => {
    const state = createDodger(lcg(4))
    state.grace = GRACE_MS // forgiving window: ramp spawns cannot end the run
    state.spawnCooldown = 1e9 // no ramp spawns; isolate culling
    state.bullets = [bulletAt(-200, -200, -100, 0), bulletAt(state.x + 50, state.y, 0, 0)]
    stepDodger(state, 1000, idle)
    expect(state.bullets).toHaveLength(1)
  })

  it('runs deterministically under a seeded rng', () => {
    const run = (): { t: number; score: number; grazes: number; n: number; xs: number[] } => {
      const s = createDodger(lcg(42))
      for (let i = 0; i < 3000 && !s.over; i += 1) {
        setTarget(s, s.x + Math.sin(i / 20) * 40, s.y + Math.cos(i / 17) * 30)
        stepDodger(s, FRAME, idle)
      }
      return {
        t: s.t, score: s.score, grazes: s.grazes, n: s.bullets.length,
        xs: s.bullets.map(b => Math.round(b.x)),
      }
    }
    expect(run()).toEqual(run())
    // A different seed diverges somewhere in the stream.
    const s2 = createDodger(lcg(43))
    setTarget(s2, 0, 0)
    stepDodger(s2, 900, idle)
    expect(s2.bullets.length).toBeGreaterThanOrEqual(1)
  })
})

describe('dodger lasers', () => {
  it('ramps the laser interval 6s→3.2s over 90s from the first laser, clamped after', () => {
    expect(laserInterval(LASER_START_MS)).toBe(6000)
    expect(laserInterval(LASER_START_MS + LASER_RAMP_MS)).toBe(3200)
    expect(laserInterval(LASER_START_MS + LASER_RAMP_MS * 5)).toBe(3200)
    const mid = laserInterval(LASER_START_MS + LASER_RAMP_MS / 2)
    expect(mid).toBeGreaterThan(3200)
    expect(mid).toBeLessThan(6000)
    expect(mid).toBeCloseTo(4600, 5)
    // Before the first laser the interval is the un-ramped maximum.
    expect(laserInterval(0)).toBe(6000)
  })

  it('walks telegraph→fire→fade→cull with the exact phase durations', () => {
    const state = createDodger(lcg(11))
    state.grace = 1e9 // isolation: never die during the observation
    state.spawnCooldown = 1e9
    state.laserCooldown = 1e9
    state.lasers = [laserAt('h', state.y + 200)] // far from the player
    let l = state.lasers[0]!
    // Telegraph lasts the full LASER_TELEGRAPH_MS.
    while (l.phase === 'telegraph') stepDodger(state, FRAME, idle)
    expect(state.t).toBeGreaterThanOrEqual(LASER_TELEGRAPH_MS)
    expect(state.t).toBeLessThan(LASER_TELEGRAPH_MS + FRAME)
    // Fire lasts the full LASER_FIRE_MS.
    const fireStart = state.t
    expect(l.phase).toBe('fire')
    while (l.phase === 'fire') stepDodger(state, FRAME, idle)
    expect(state.t - fireStart).toBeGreaterThanOrEqual(LASER_FIRE_MS)
    expect(state.t - fireStart).toBeLessThan(LASER_FIRE_MS + FRAME)
    // Fade culls the laser after LASER_FADE_MS.
    const fadeStart = state.t
    expect(l.phase).toBe('fade')
    while (state.lasers.length > 0) stepDodger(state, FRAME, idle)
    expect(state.t - fadeStart).toBeGreaterThanOrEqual(LASER_FADE_MS)
    expect(state.t - fadeStart).toBeLessThan(LASER_FADE_MS + FRAME)
    // Phase durations sum to the documented lifecycle.
    expect(LASER_TELEGRAPH_MS + LASER_FIRE_MS + LASER_FADE_MS).toBe(1100 + 450 + 300)
  })

  it('is lethal only in the fire phase, on both axes', () => {
    // Telegraph on the player: harmless.
    const s1 = createDodger(lcg(1))
    s1.grace = 0
    s1.bullets = []
    s1.spawnCooldown = 1e9
    s1.laserCooldown = 1e9
    s1.lasers = [laserAt('h', s1.y, 'telegraph')]
    for (let i = 0; i < 10; i += 1) expect(stepDodger(s1, FRAME, idle)).toBe(false)
    // Fade on the player: harmless.
    const s2 = createDodger(lcg(1))
    Object.assign(s2, { grace: 0, spawnCooldown: 1e9, laserCooldown: 1e9 })
    s2.bullets = []
    s2.lasers = [laserAt('v', s2.x, 'fade')]
    for (let i = 0; i < 10; i += 1) expect(stepDodger(s2, FRAME, idle)).toBe(false)
    // Fire on the player's row: lethal at circle-vs-beam contact.
    const s3 = createDodger(lcg(1))
    Object.assign(s3, { grace: 0, spawnCooldown: 1e9, laserCooldown: 1e9 })
    s3.bullets = []
    s3.lasers = [laserAt('h', s3.y + PLAYER_R + LASER_BEAM_HALF - 1, 'fire')]
    expect(stepDodger(s3, FRAME, idle)).toBe(true)
    // Fire just outside the hit band on the column axis: survivable.
    const s4 = createDodger(lcg(1))
    Object.assign(s4, { grace: 0, spawnCooldown: 1e9, laserCooldown: 1e9 })
    s4.bullets = []
    s4.lasers = [laserAt('v', s4.x + PLAYER_R + LASER_BEAM_HALF + 1, 'fire')]
    expect(stepDodger(s4, FRAME, idle)).toBe(false)
  })

  it('grace invulnerability protects from fire-phase lasers', () => {
    const state = createDodger(lcg(1))
    state.bullets = []
    state.spawnCooldown = 1e9
    state.laserCooldown = 1e9
    state.lasers = [laserAt('h', state.y, 'fire')]
    for (let i = 0; i < 30; i += 1) {
      state.grace = GRACE_MS // keep the grace window open across steps
      expect(stepDodger(state, FRAME, idle)).toBe(false)
    }
    // Grace over: the same overlapping fire beam (re-fired) kills.
    state.grace = 0
    Object.assign(state.lasers[0]!, { phase: 'fire', phaseT: 0 })
    expect(stepDodger(state, FRAME, idle)).toBe(true)
  })

  it('aims at the player row/col 60% of the time, random otherwise (seeded)', () => {
    const state = createDodger(lcg(99))
    let aimed = 0
    const N = 4000
    for (let i = 0; i < N; i += 1) {
      const l = spawnLaser(state)
      const hit = l.axis === 'h' ? Math.abs(l.pos - state.y) < 0.001 : Math.abs(l.pos - state.x) < 0.001
      if (hit) aimed += 1
      state.lasers.pop()
    }
    const ratio = aimed / N
    expect(ratio).toBeGreaterThan(0.55)
    expect(ratio).toBeLessThan(0.65)
  })

  it('spawns lasers on the playable area only, both axes', () => {
    const state = createDodger(lcg(5))
    for (let i = 0; i < 500; i += 1) {
      const l = spawnLaser(state)
      if (l.axis === 'h') {
        expect(l.pos).toBeGreaterThanOrEqual(HUD_H)
        expect(l.pos).toBeLessThanOrEqual(H)
      } else {
        expect(l.pos).toBeGreaterThanOrEqual(0)
        expect(l.pos).toBeLessThanOrEqual(W)
      }
      expect(l.phase).toBe('telegraph')
      expect(l.phaseT).toBe(0)
      state.lasers.pop()
    }
  })

  it('never fires the first laser before t=25s and then follows the ramp', () => {
    const state = createDodger(lcg(7))
    let firstSpawn = -1
    let prevSpawn = -1
    let spawns = 0
    for (let i = 0; i < Math.round(40000 / FRAME); i += 1) {
      state.grace = 1e9 // survive aimed lasers for schedule observation
      const before = state.lasers.length
      stepDodger(state, FRAME, idle)
      if (state.lasers.length > before) {
        spawns += 1
        if (firstSpawn < 0) firstSpawn = state.t
        prevSpawn = state.t
      }
    }
    expect(firstSpawn).toBeGreaterThanOrEqual(LASER_START_MS)
    expect(firstSpawn).toBeLessThan(LASER_START_MS + FRAME * 2)
    // At least two scheduled spawns inside 40s (interval ~6s there).
    expect(spawns).toBeGreaterThanOrEqual(2)
    const gap = prevSpawn - firstSpawn
    expect(gap).toBeGreaterThan(4000) // early interval ~6s, never bullet-paced
  })

  it('holds the laser while a non-fading laser blocks the solo rule before 70s', () => {
    const state = createDodger(lcg(3))
    state.t = 30_000 // pre-70s: at most one telegraph/fire laser at a time
    state.grace = 1e9
    state.bullets = []
    state.spawnCooldown = 1e9
    state.laserCooldown = 0 // scheduler wants to spawn NOW
    state.lasers = [laserAt('h', 100, 'telegraph')]
    stepDodger(state, FRAME, idle)
    expect(state.lasers).toHaveLength(1) // blocked while a telegraph is alive
    state.lasers[0]!.phase = 'fade'
    stepDodger(state, FRAME, idle)
    expect(state.lasers).toHaveLength(2) // allowed once the blocker is fading
  })

  it('caps concurrent lasers at 2 even after 70s', () => {
    const state = createDodger(lcg(3))
    state.t = LASER_SOLO_FIRE_UNTIL + 1000 // overlapping pairs permitted
    state.grace = 1e9
    state.bullets = []
    state.spawnCooldown = 1e9
    state.laserCooldown = 0
    state.lasers = [laserAt('h', 100, 'fade'), laserAt('v', 200, 'fire')]
    stepDodger(state, FRAME, idle)
    expect(state.lasers).toHaveLength(2) // cap holds: no third laser
  })

  it('keeps at most one non-fading laser before 70s and ≤2 alive across a long run', () => {
    for (const seed of [12, 34, 56]) {
      const state = createDodger(lcg(seed))
      for (let i = 0; i < Math.round(120000 / FRAME); i += 1) {
        state.grace = 1e9
        setTarget(state, state.x + Math.sin(i / 25) * 60, state.y + Math.cos(i / 21) * 50)
        stepDodger(state, FRAME, idle)
        expect(state.lasers.length).toBeLessThanOrEqual(LASER_MAX_ALIVE)
        const active = state.lasers.filter(l => l.phase !== 'fade').length
        if (state.t < LASER_SOLO_FIRE_UNTIL) expect(active).toBeLessThanOrEqual(1)
      }
    }
  })

  it('runs laser-inclusive games deterministically under a seeded rng', () => {
    const run = (): unknown => {
      const s = createDodger(lcg(42))
      // t=100s keeps derived score ≥ 800: homing bullets AND diagonal lasers
      // are both active; open grace guarantees a long observable stream.
      s.t = 100_000
      s.grace = 1e9
      const axesSeen = new Set<string>()
      let homingSeen = 0
      for (let i = 0; i < 4200 && !s.over; i += 1) {
        // 70s of play: lasers included, target wanders.
        setTarget(s, s.x + Math.sin(i / 20) * 40, s.y + Math.cos(i / 17) * 30)
        stepDodger(s, FRAME, idle)
        for (const l of s.lasers) axesSeen.add(l.axis)
        homingSeen = Math.max(homingSeen, s.bullets.filter(b => b.homing).length)
      }
      return {
        t: s.t, score: s.score, grazes: s.grazes, over: s.over,
        bullets: s.bullets.map(b => [b.x, b.y, b.vx, b.vy, b.homing === true]),
        lasers: s.lasers.map(l => [l.axis, l.pos, l.phase, l.phaseT, l.ax ?? 0, l.ay ?? 0]),
        axesSeen: [...axesSeen].sort(), homingSeen,
      }
    }
    const first = run() as { axesSeen: string[]; homingSeen: number }
    // The run actually exercised both new mechanics.
    expect(first.homingSeen).toBeGreaterThan(0)
    expect(first.axesSeen).toContain('d1')
    expect(first.axesSeen).toContain('d2')
    expect(run()).toEqual(first)
  })

  it('unlocks parallel lasers once score ≥ 500 (multi mode)', () => {
    const state = createDodger(lcg(3))
    state.t = 30_000 // still well before the 70s solo window
    state.score = 500 // the unlock
    state.grace = 1e9
    state.bullets = []
    state.spawnCooldown = 1e9
    state.laserCooldown = 0
    // Two alive lasers, one actively firing — the solo rule would block here.
    state.lasers = [laserAt('h', 100, 'telegraph'), laserAt('v', 200, 'fire')]
    stepDodger(state, FRAME, idle)
    expect(state.lasers).toHaveLength(3) // multi mode: a third laser joins
    state.laserCooldown = 0
    stepDodger(state, FRAME, idle)
    expect(state.lasers).toHaveLength(3) // multi cap of 3 holds
    // Below the unlock the same scene stays blocked.
    const early = createDodger(lcg(3))
    early.t = 30_000
    early.score = 499
    early.grace = 1e9
    early.bullets = []
    early.spawnCooldown = 1e9
    early.laserCooldown = 0
    early.lasers = [laserAt('h', 100, 'telegraph'), laserAt('v', 200, 'fire')]
    stepDodger(early, FRAME, idle)
    expect(early.lasers).toHaveLength(2)
  })
})

describe('dodger diagonal lasers', () => {
  it('computes perpendicular line distance for both diagonals', () => {
    const d1 = laserAt('d1', 0, 'fire', 0, 100, 100)
    expect(laserDist(d1, 100, 100)).toBeCloseTo(0, 6) // anchor on the line
    expect(laserDist(d1, 110, 110)).toBeCloseTo(0, 6) // along the beam
    expect(laserDist(d1, 110, 100)).toBeCloseTo(10 * Math.SQRT1_2, 6)
    expect(laserDist(d1, 90, 100)).toBeCloseTo(10 * Math.SQRT1_2, 6)
    const d2 = laserAt('d2', 0, 'fire', 0, 100, 100)
    expect(laserDist(d2, 90, 110)).toBeCloseTo(0, 6) // along the down-left beam
    expect(laserDist(d2, 110, 100)).toBeCloseTo(10 * Math.SQRT1_2, 6)
    expect(laserDist(d2, 110, 110)).toBeCloseTo(20 * Math.SQRT1_2, 6)
    // h/v keep the exact axis math.
    expect(laserDist(laserAt('h', 40), 12, 52)).toBe(12)
    expect(laserDist(laserAt('v', 40), 52, 12)).toBe(12)
  })

  it('kills at the diagonal beam band edge and spares just outside it', () => {
    const band = PLAYER_R + LASER_BEAM_HALF
    // d1 anchored one band-width above the player: perpendicular distance = band.
    const mk = (s: DodgerState, off: number): Laser =>
      laserAt('d1', 0, 'fire', 0, s.x, s.y - (band + off) * Math.SQRT2)
    const s1 = createDodger(lcg(1))
    Object.assign(s1, { grace: 0, spawnCooldown: 1e9, laserCooldown: 1e9, bullets: [], lasers: [mk(s1, -1)] })
    expect(stepDodger(s1, FRAME, idle)).toBe(true) // distance band-1: lethal
    const s2 = createDodger(lcg(1))
    Object.assign(s2, { grace: 0, spawnCooldown: 1e9, laserCooldown: 1e9, bullets: [], lasers: [mk(s2, 1)] })
    expect(stepDodger(s2, FRAME, idle)).toBe(false) // distance band+1: spared
    // Aimed d2 through the player: distance 0, lethal in fire.
    const s3 = createDodger(lcg(1))
    Object.assign(s3, {
      grace: 0, spawnCooldown: 1e9, laserCooldown: 1e9, bullets: [],
      lasers: [laserAt('d2', 0, 'fire', 0, s3.x, s3.y)],
    })
    expect(stepDodger(s3, FRAME, idle)).toBe(true)
  })

  it('clips diagonal beams to boundary-to-boundary segments inside the field', () => {
    const s = Math.SQRT1_2
    // d1 through (240,300): line y = x + 60 → (0,60)–(480,540).
    const seg1 = lineClip(240, 300, s, s, 0, HUD_H, W, H)
    expect(seg1).not.toBeNull()
    expect(seg1!.x0).toBeCloseTo(0, 6)
    expect(seg1!.y0).toBeCloseTo(60, 6)
    expect(seg1!.x1).toBeCloseTo(480, 6)
    expect(seg1!.y1).toBeCloseTo(540, 6)
    // d2 through (240,300): line y = -x + 540 → (480,60)–(0,540) along dir.
    const seg2 = lineClip(240, 300, -s, s, 0, HUD_H, W, H)
    expect(seg2).not.toBeNull()
    expect(seg2!.x0).toBeCloseTo(480, 6)
    expect(seg2!.y0).toBeCloseTo(60, 6)
    expect(seg2!.x1).toBeCloseTo(0, 6)
    expect(seg2!.y1).toBeCloseTo(540, 6)
    // Corner-adjacent anchors still land exactly on the boundary, in-bounds.
    for (const [axU, ayU] of [[0, HUD_H], [W, HUD_H], [0, H], [W, H], [W / 2, H / 2]]) {
      const ax = axU!
      const ay = ayU!
      for (const dir of [[s, s], [-s, s]] as const) {
        const seg = lineClip(ax, ay, dir[0]!, dir[1]!, 0, HUD_H, W, H)
        expect(seg).not.toBeNull()
        for (const [px, py] of [[seg!.x0, seg!.y0], [seg!.x1, seg!.y1]]) {
          expect(px!).toBeGreaterThanOrEqual(-1e-6)
          expect(px!).toBeLessThanOrEqual(W + 1e-6)
          expect(py!).toBeGreaterThanOrEqual(HUD_H - 1e-6)
          expect(py!).toBeLessThanOrEqual(H + 1e-6)
          // Each endpoint sits on some rect boundary.
          const onBoundary = Math.abs(px!) < 1e-6 || Math.abs(px! - W) < 1e-6
            || Math.abs(py! - HUD_H) < 1e-6 || Math.abs(py! - H) < 1e-6
          expect(onBoundary).toBe(true)
        }
      }
    }
    // Degenerate direction yields no segment.
    expect(lineClip(240, 300, 0, 0, 0, HUD_H, W, H)).toBeNull()
  })

  it('unlocks diagonals at score 350: h/v only below, uniform 4-axis after', () => {
    const state = createDodger(lcg(5))
    state.score = LASER_DIAGONAL_SCORE - 1
    for (let i = 0; i < 600; i += 1) {
      const l = spawnLaser(state)
      expect(l.axis === 'h' || l.axis === 'v').toBe(true)
      state.lasers.pop()
    }
    state.score = LASER_DIAGONAL_SCORE
    const counts: Record<string, number> = { h: 0, v: 0, d1: 0, d2: 0 }
    const N = 4000
    for (let i = 0; i < N; i += 1) {
      counts[spawnLaser(state).axis]! += 1
      state.lasers.pop()
    }
    for (const axis of Object.keys(counts)) {
      expect(counts[axis]!).toBeGreaterThan(0.22 * N)
      expect(counts[axis]!).toBeLessThan(0.28 * N)
    }
  })

  it('aims diagonals through the player and randoms stay inside the field', () => {
    // Forced rng stream: first call 0.0 (< aim chance → aimed), second 0.55
    // (floor(0.55*4)=2 → d1).
    const vals = [0.0, 0.55]
    let i = 0
    const s1 = createDodger(() => vals[i++ % vals.length]!)
    s1.score = LASER_DIAGONAL_SCORE
    const aimed = spawnLaser(s1)
    expect(aimed.axis).toBe('d1')
    expect(aimed.ax).toBeCloseTo(s1.x, 6)
    expect(aimed.ay).toBeCloseTo(s1.y, 6)
    expect(laserDist(aimed, s1.x, s1.y)).toBeCloseTo(0, 6)
    const s2 = createDodger(lcg(8))
    s2.score = LASER_DIAGONAL_SCORE
    for (let k = 0; k < 1000; k += 1) {
      const l = spawnLaser(s2)
      if (l.axis === 'd1' || l.axis === 'd2') {
        expect(l.ax).toBeGreaterThanOrEqual(0)
        expect(l.ax).toBeLessThanOrEqual(W)
        expect(l.ay).toBeGreaterThanOrEqual(HUD_H)
        expect(l.ay).toBeLessThanOrEqual(H)
      }
      s2.lasers.pop()
    }
  })
})

describe('dodger homing bullets', () => {
  it('unlocks at 800: ~35% seeded fraction, 0.75x tier speed; none below', () => {
    const state = createDodger(lcg(77))
    state.t = RAMP_MS // top speed tier: 220
    state.score = HOMING_SCORE - 1
    for (let i = 0; i < 2000; i += 1) {
      spawnBullet(state)
      expect(state.bullets[state.bullets.length - 1]!.homing).toBeFalsy()
      state.bullets.pop()
    }
    state.score = HOMING_SCORE
    let homing = 0
    const N = 3000
    for (let i = 0; i < N; i += 1) {
      spawnBullet(state)
      const b = state.bullets[state.bullets.length - 1]!
      if (b.homing) homing += 1
      expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(b.homing ? 220 * HOMING_SPEED_FACTOR : 220, 5)
      state.bullets.pop()
    }
    const ratio = homing / N
    expect(ratio).toBeGreaterThan(0.31)
    expect(ratio).toBeLessThan(0.39)
  })

  it('turns toward the player at most HOMING_TURN_RATE·dt, speed preserved', () => {
    const state = createDodger(lcg(21))
    Object.assign(state, { grace: 1e9, spawnCooldown: 1e9, laserCooldown: 1e9 })
    const speed = 165
    // Heading straight down while the player sits due east: 90° correction due.
    state.bullets = [{ x: state.x - 100, y: state.y, vx: 0, vy: speed, grazed: false, homing: true, age: 0 }]
    const before = Math.atan2(state.bullets[0]!.vy, state.bullets[0]!.vx)
    stepDodger(state, FRAME, idle)
    const b = state.bullets[0]!
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(speed, 6)
    const after = Math.atan2(b.vy, b.vx)
    let off = Math.abs(after - before)
    if (off > Math.PI) off = Math.PI * 2 - off
    expect(off).toBeGreaterThan(0.01) // actually steering
    expect(off).toBeLessThanOrEqual(HOMING_TURN_RATE * FRAME / 1000 + 1e-9)
  })

  it('lives 6000ms, never culls at the spawn edge, culls in the far field', () => {
    const state = createDodger(lcg(9))
    Object.assign(state, { grace: 1e9, spawnCooldown: 1e9, laserCooldown: 1e9 })
    state.bullets = [
      { x: -200, y: 100, vx: -10, vy: 0, grazed: false, homing: true, age: HOMING_LIFE_MS - 1 }, // expires this step
      { x: -HOMING_CULL_MARGIN + 50, y: 200, vx: 0, vy: 0, grazed: false, homing: true, age: 0 }, // inside far margin: kept
      { x: -HOMING_CULL_MARGIN - 50, y: 300, vx: -10, vy: 0, grazed: false, homing: true, age: 0 }, // far field: culled
    ]
    stepDodger(state, FRAME, idle)
    expect(state.bullets).toHaveLength(1)
    // Kept homing bullet survives well past the normal 80px cull margin.
    for (let i = 0; i < 60; i += 1) stepDodger(state, FRAME, idle)
    expect(state.bullets.some(b => b.homing && b.x! < -BULLET_R)).toBe(true)
  })

  it('grazes a homing bullet once under the same near-miss rule', () => {
    const state = createDodger(lcg(13))
    state.grace = 0
    state.t = 0
    state.spawnCooldown = 1e9
    state.laserCooldown = 1e9
    const grazeR = (PLAYER_R + BULLET_R) * NEAR_MISS_FACTOR
    state.bullets = [{
      x: state.x - 6, y: state.y - (grazeR - 1), vx: 200, vy: 0, grazed: false, homing: true, age: 0,
    }]
    stepDodger(state, FRAME, idle)
    expect(state.grazes).toBe(1)
    expect(state.over).toBe(false)
    expect(state.score).toBe(Math.floor(state.t / 1000) * SCORE_PER_SECOND + NEAR_MISS_BONUS)
    for (let i = 0; i < 5; i += 1) stepDodger(state, FRAME, idle)
    expect(state.grazes).toBe(1) // once per bullet
  })

  it('uses its own pool cap and does not count against MAX_BULLETS', () => {
    const state = createDodger(lcg(3))
    state.score = HOMING_SCORE
    state.bullets = Array.from({ length: HOMING_MAX_ALIVE }, () => ({
      x: -200, y: -200, vx: 0, vy: 0, grazed: true, homing: true, age: 0,
    }))
    for (let i = 0; i < 50; i += 1) spawnBullet(state)
    expect(state.bullets.filter(b => b.homing)).toHaveLength(HOMING_MAX_ALIVE) // cap holds
    // Homing spawns continue with a full normal pool (rng 0.0 → always homing).
    const full = createDodger(() => 0)
    full.score = HOMING_SCORE
    full.bullets = Array.from({ length: MAX_BULLETS }, () => ({
      x: -300, y: -300, vx: -10, vy: 0, grazed: true,
    }))
    spawnBullet(full)
    expect(full.bullets).toHaveLength(MAX_BULLETS + 1)
    expect(full.bullets[full.bullets.length - 1]!.homing).toBe(true)
  })
})
