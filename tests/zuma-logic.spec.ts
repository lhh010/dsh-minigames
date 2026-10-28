import { describe, expect, it } from 'vitest'
import {
  AIM_SPEED, BALL_R, BASE_SPEED, GAP_CLOSE_SPEED, MAX_SPEED, SHOT_SPEED, SHOOTER, SPACING,
  TRACK_LENGTH, advanceChain, colorCount, createState, fire, insertBall, levelBallCount,
  levelSeed, levelSpeed, mulberry32, resolveMatches, runAround, setAim, spawnInterval,
  startLevel, startRun, step, togglePause, trackAt,
  type Ball, type ZumaState,
} from '../src/client/games/zuma/logic.ts'

/** A playing state with a fully manual chain (no spawning interference). */
function manualState(balls: Ball[], seed = 7): ZumaState {
  const s = createState(seed)
  startRun(s)
  s.balls = balls.map(b => ({ ...b }))
  s.remaining = 0
  s.spawnTimer = 1e9
  s.events = []
  return s
}

function run(state: ZumaState, secs: number, aim?: { left?: boolean; right?: boolean }): void {
  const dt = 1 / 60
  for (let i = 0; i < Math.round(secs / dt); i += 1) {
    step(state, dt, aim === undefined ? undefined : { left: aim.left === true, right: aim.right === true })
  }
}

/** Run and accumulate every event emitted along the way. */
function runCollect(state: ZumaState, secs: number) {
  const seen: ZumaState['events'] = []
  const dt = 1 / 60
  for (let i = 0; i < Math.round(secs / dt); i += 1) {
    step(state, dt)
    seen.push(...state.events)
  }
  return seen
}

describe('zuma track', () => {
  it('trackAt is arc-length parameterized: consecutive positions are ~1px apart', () => {
    for (let s = 0; s + 2 <= TRACK_LENGTH; s += 37.3) {
      const a = trackAt(s)
      const b = trackAt(s + 1)
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      expect(d).toBeGreaterThan(0.75)
      expect(d).toBeLessThan(1.25)
    }
  })

  it('trackAt is continuous, deterministic, and monotonic in distance', () => {
    let prev = trackAt(0)
    let accum = 0
    for (let s = 5; s <= TRACK_LENGTH; s += 25) {
      const p = trackAt(s)
      accum += Math.hypot(p.x - prev.x, p.y - prev.y)
      expect(Math.abs(accum - s)).toBeLessThan(2.5)
      expect(trackAt(s)).toEqual(p) // deterministic
      prev = p
    }
  })

  it('total length is fixed and endpoints sit at spawn and sink', () => {
    expect(TRACK_LENGTH).toBeGreaterThan(1000)
    expect(TRACK_LENGTH).toBeLessThan(3000)
    const start = trackAt(0)
    const end = trackAt(TRACK_LENGTH)
    expect(start.x).toBeCloseTo(60, 0)
    expect(start.y).toBeCloseTo(70, 0)
    expect(end.x).toBeCloseTo(440, 0)
    expect(end.y).toBeCloseTo(590, 0)
    // Clamped beyond both ends.
    expect(trackAt(-50)).toEqual(start)
    expect(trackAt(TRACK_LENGTH + 50)).toEqual(end)
  })
})

describe('zuma level model', () => {
  it('level speed ramps as 26 + 4N and caps', () => {
    expect(levelSpeed(1)).toBe(BASE_SPEED + 4)
    expect(levelSpeed(3)).toBe(BASE_SPEED + 12)
    for (let n = 1; n <= 20; n += 1) {
      expect(levelSpeed(n)).toBeLessThanOrEqual(MAX_SPEED)
      expect(levelSpeed(n)).toBeGreaterThanOrEqual(levelSpeed(n - 1))
    }
    expect(levelSpeed(10)).toBe(MAX_SPEED)
    expect(levelSpeed(50)).toBe(MAX_SPEED)
  })

  it('colors and spawn interval ramp with the level', () => {
    expect(colorCount(1)).toBe(4)
    expect(colorCount(2)).toBe(4)
    expect(colorCount(3)).toBe(5)
    expect(colorCount(9)).toBe(5)
    expect(spawnInterval(3)).toBeGreaterThan(spawnInterval(1))
    expect(levelBallCount(1)).toBeLessThan(levelBallCount(5))
  })

  it('per-level seeds are deterministic and level-dependent', () => {
    expect(levelSeed(42, 3)).toBe(levelSeed(42, 3))
    expect(levelSeed(42, 3)).not.toBe(levelSeed(42, 4))
    expect(mulberry32(levelSeed(42, 3))()).toBe(mulberry32(levelSeed(42, 3))())
  })
})

describe('zuma chain motion', () => {
  it('the head advances at the level speed', () => {
    const s = manualState([{ s: 100, color: 0 }])
    const v = levelSpeed(s.level)
    step(s, 0.5)
    expect(s.balls[0]!.s).toBeCloseTo(100 + v * 0.5, 5)
  })

  it('a gap between segments closes at the constant GAP_CLOSE_SPEED and snaps flush', () => {
    // Leading pair at 400/378; trailing pair at 120/98 → gap 378-120-22 = 236.
    const s = manualState([
      { s: 400, color: 1 }, { s: 378, color: 2 },
      { s: 120, color: 1 }, { s: 98, color: 2 },
    ])
    const gapBefore = s.balls[1]!.s - SPACING - s.balls[2]!.s
    step(s, 0.5)
    const gapAfter = s.balls[1]!.s - SPACING - s.balls[2]!.s
    // Gap shrinks by exactly GAP_CLOSE_SPEED * dt (both segments move).
    expect(gapBefore - gapAfter).toBeCloseTo(GAP_CLOSE_SPEED * 0.5, 5)
    // Run to contact: the trailing segment snaps flush (gap exactly 0).
    const seen = runCollect(s, 10)
    expect(s.balls[1]!.s - SPACING - s.balls[2]!.s).toBeCloseTo(0, 6)
    expect(seen.some(e => e.kind === 'merge')).toBe(true)
  })

  it('gap closure awards 5 per trailing ball and a matching junction chain-reacts', () => {
    // Junction after closing: leading tail 1,1 + trailing front 1 → 3× color1.
    const s = manualState([
      { s: 300, color: 1 }, { s: 278, color: 1 },
      { s: 100, color: 1 }, { s: 78, color: 2 }, { s: 56, color: 2 },
    ])
    const seen = runCollect(s, 12)
    const merges = seen.filter(e => e.kind === 'merge')
    expect(merges).toHaveLength(1)
    const matches = seen.filter(e => e.kind === 'match')
    expect(matches).toHaveLength(1)
    const m = matches[0] as Extract<ZumaState['events'][number], { kind: 'match' }>
    expect(m.count).toBe(3)
    expect(m.depth).toBe(2) // chain reaction depth
    // 5/ball merge (3 trailing balls × depth 1) + 10/ball × 3 × depth 2.
    expect(s.score).toBe(5 * 3 * 1 + 10 * 3 * 2)
    // Only the two 2s survive.
    expect(s.balls.map(b => b.color)).toEqual([2, 2])
  })
})

describe('zuma matching', () => {
  it('runAround expands only over touching same-color balls', () => {
    const balls: Ball[] = [
      { s: 300, color: 0 }, { s: 278, color: 0 }, { s: 256, color: 1 },
      { s: 200, color: 0 }, { s: 178, color: 0 },
    ]
    expect(runAround(balls, 0)).toEqual([0, 1])
    expect(runAround(balls, 2)).toEqual([2, 2])
    // The split pair behind the gap is its own run.
    expect(runAround(balls, 3)).toEqual([3, 4])
  })

  it('3 same-color consecutive balls explode for 10 each; 2 does not', () => {
    const a = manualState([{ s: 300, color: 0 }, { s: 278, color: 0 }, { s: 256, color: 1 }])
    const exploded = resolveMatches(a, 0, 1)
    expect(exploded).toBe(0) // only two 0s → no explosion
    expect(a.balls).toHaveLength(3)

    const b = manualState([{ s: 300, color: 0 }, { s: 278, color: 0 }, { s: 256, color: 0 }])
    const n = resolveMatches(b, 1, 1)
    expect(n).toBe(3)
    expect(b.balls).toHaveLength(0)
    expect(b.score).toBe(30)
  })

  it('no cross-color false match: neighbors of a different color survive', () => {
    const s = manualState([{ s: 300, color: 0 }, { s: 278, color: 0 }, { s: 256, color: 2 }])
    resolveMatches(s, 1, 1) // 0,0 + inserted context — insert a third 0 via resolve on run of 2: no explode
    // Build a real 3-run of 0s next to a 2 and explode it.
    const t = manualState([{ s: 300, color: 2 }, { s: 278, color: 0 }, { s: 256, color: 0 }, { s: 234, color: 0 }])
    const n = resolveMatches(t, 2, 1)
    expect(n).toBe(3)
    expect(t.balls).toEqual([{ s: 300, color: 2 }])
    expect(t.score).toBe(30)
  })
})

describe('zuma shooting', () => {
  it('fire launches the current ball along the aim angle; a miss is discarded', () => {
    const s = manualState([{ s: TRACK_LENGTH - 200, color: 0 }])
    setAim(s, SHOOTER.x, SHOOTER.y - 100) // straight up, off the chain
    expect(fire(s)).toBe(true)
    expect(s.shot).not.toBeNull()
    expect(s.shot!.vy).toBeCloseTo(-SHOT_SPEED, 3)
    const seen = runCollect(s, 3)
    expect(s.shot).toBeNull()
    expect(seen.some(e => e.kind === 'miss')).toBe(true)
    expect(s.balls).toHaveLength(1) // chain untouched
  })

  it('fire is refused while paused or with a shot in flight', () => {
    const s = createState(3)
    startRun(s)
    expect(fire(s)).toBe(true)
    expect(fire(s)).toBe(false) // shot already airborne
    s.shot = null
    togglePause(s)
    expect(fire(s)).toBe(false)
  })

  it('a shot hitting a chain ball inserts after it and shifts the tail back', () => {
    const s = manualState([
      { s: 300, color: 0 }, { s: 278, color: 1 }, { s: 256, color: 1 },
    ])
    // Place the shot exactly on ball index 1.
    const p = trackAt(278)
    s.shot = { x: p.x, y: p.y, vx: 0, vy: 0, color: 3 }
    step(s, 1 / 60)
    expect(s.shot).toBeNull()
    expect(s.events.some(e => e.kind === 'insert')).toBe(true)
    // Inserted after the hit ball; the old tail shifted back by SPACING.
    expect(s.balls[1]!.color).toBe(1)
    expect(s.balls[2]!.color).toBe(3)
    expect(s.balls[2]!.s).toBeCloseTo(s.balls[1]!.s - SPACING, 4)
    expect(s.balls[3]!.s).toBeCloseTo(s.balls[2]!.s - SPACING, 4)
  })

  it('an insertion completing a 3-run explodes immediately (10 × depth)', () => {
    const s = manualState([{ s: 300, color: 0 }, { s: 278, color: 0 }, { s: 256, color: 1 }])
    insertBall(s, 1, 0) // third 0 lands between ball1 and ball2
    expect(s.balls.map(b => b.color)).toEqual([1])
    expect(s.score).toBe(30)
  })

  it('an insertion forming only a pair does not explode', () => {
    const s = manualState([{ s: 300, color: 0 }, { s: 278, color: 1 }, { s: 256, color: 1 }])
    insertBall(s, 0, 0)
    expect(s.balls).toHaveLength(4)
    expect(s.score).toBe(0)
  })

  it('the shooter never fires a color absent from the chain', () => {
    const s = manualState([{ s: 300, color: 0 }, { s: 278, color: 0 }])
    s.current = 4 // stale color, not on the chain
    setAim(s, SHOOTER.x, SHOOTER.y - 100)
    fire(s)
    expect(s.shot!.color).toBe(0)
  })
})

describe('zuma win / lose / determinism', () => {
  it('the head reaching the sink ends the game', () => {
    const s = manualState([{ s: TRACK_LENGTH - 5, color: 0 }])
    const seen = runCollect(s, 0.2)
    expect(s.result).toBe('over')
    expect(seen.some(e => e.kind === 'over')).toBe(true)
    // Inert after over.
    const frozen = s.balls[0]!.s
    run(s, 1)
    expect(s.balls[0]!.s).toBe(frozen)
  })

  it('clearing the last ball with nothing left to spawn advances the level', () => {
    const s = manualState([])
    const before = s.level
    const seen = runCollect(s, 0.2)
    expect(s.level).toBe(before + 1)
    expect(s.result).toBe('playing')
    expect(seen.some(e => e.kind === 'level')).toBe(true)
    expect(s.remaining).toBe(levelBallCount(s.level))
  })

  it('aim keys rotate at 2.2 rad/s', () => {
    const s = createState(5)
    startRun(s)
    const a0 = s.angle
    run(s, 1, { right: true })
    expect(s.angle - a0).toBeCloseTo(AIM_SPEED, 5)
    const a1 = s.angle
    run(s, 1, { left: true })
    expect(s.angle).toBeCloseTo(a1 - AIM_SPEED, 5)
  })

  it('togglePause only flips between playing and paused and freezes the sim', () => {
    const s = createState(1)
    togglePause(s)
    expect(s.result).toBe('ready') // no-op
    startRun(s)
    togglePause(s)
    expect(s.result).toBe('paused')
    const head = s.balls
    run(s, 1)
    expect(s.balls).toBe(head)
    togglePause(s)
    expect(s.result).toBe('playing')
  })

  it('the same seed and fire script produce identical snapshots', () => {
    const play = (seed: number): string => {
      const s = createState(seed)
      startRun(s)
      const dt = 1 / 60
      for (let i = 0; i < 600; i += 1) {
        if (i === 60) setAim(s, 120, 90)
        if (i === 120 || i === 300) fire(s)
        step(s, dt, i % 40 < 20 ? { left: true, right: false } : { left: false, right: true })
      }
      return JSON.stringify({
        score: s.score, level: s.level, balls: s.balls, remaining: s.remaining,
        current: s.current, next: s.next, angle: s.angle,
      })
    }
    expect(play(1234)).toBe(play(1234))
    expect(play(1234)).not.toBe(play(5678))
  })

  it('spawned chains never self-assemble a 3-run at the tail (anti-autoplay)', () => {
    // Simulate long idle spawning at several levels: with the tail-color
    // exclusion the chain must never hold 3 consecutive same-color balls
    // anywhere it built by spawning alone (a natural 3-run plus one player
    // shot cascaded gap-merge reactions that cleared whole boards).
    for (const level of [1, 3, 5]) {
      const s = createState(99)
      startRun(s)
      startLevel(s, level)
      for (let i = 0; i < 60 * 90 && s.remaining > 0 && s.result === 'playing'; i += 1) step(s, 1 / 60)
      for (let i = 0; i + 2 < s.balls.length; i += 1) {
        const run3 = s.balls[i]!.color === s.balls[i + 1]!.color && s.balls[i + 1]!.color === s.balls[i + 2]!.color
        expect(run3).toBe(false)
      }
    }
  })
})
