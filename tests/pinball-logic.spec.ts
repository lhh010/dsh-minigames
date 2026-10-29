import { describe, expect, it } from 'vitest'
import {
  BALL_R, BALLS_PER_GAME, BANK_BONUS, BUMPER_POINTS, BUMPER_PRESETS, FLIPPER_R,
  PLUNGER_MAX_SPEED, PLUNGER_MIN_SPEED, TABLE_H, TARGET_POINTS, TILT_SECONDS, TRAP_HITS, TRAP_WINDOW, WALL_E,
  ballInLaunchZone, bounceOffPoint, closestPointOnSegment, createGame, hashRun,
  levelThreshold, mulberry32, nudge, plungerRelease, restart, resolveFlipper,
  setFlipper, step, togglePause, type PinballState,
} from '../src/client/games/pinball/logic.ts'

function game(seed = 7, level = 1): PinballState {
  return createGame(level, seed)
}

/** Step `s` in 1/60 chunks for `secs` seconds (frame-like cadence). */
function run(s: PinballState, secs: number): void {
  for (let i = 0; i < Math.round(secs * 60); i += 1) step(s, 1 / 60)
}

describe('pinball circle-vs-segment physics', () => {
  it('reflects off a flat segment with restitution and the correct normal', () => {
    const ball = { x: 50, y: 95, vx: 10, vy: 100 }
    const cp = closestPointOnSegment(50, 95, 0, 100, 100, 100)
    expect(cp.x).toBeCloseTo(50, 6)
    expect(cp.y).toBeCloseTo(100, 6)
    expect(bounceOffPoint(ball, BALL_R, WALL_E, 0, cp.x, cp.y)).toBe(true)
    // Pushed out to exactly one radius above the surface, bounced up at 0.55.
    expect(ball.y).toBeCloseTo(100 - BALL_R, 4)
    expect(ball.vy).toBeCloseTo(-100 * WALL_E, 4)
    expect(ball.vx).toBeCloseTo(10, 6) // tangential untouched
  })

  it('uses the true normal of a slanted segment', () => {
    const ball = { x: 107, y: 103, vx: 0, vy: 0 }
    // 45° wall through the origin: closest point to the ball is (105, 105).
    const cp = closestPointOnSegment(107, 103, 0, 0, 200, 200)
    expect(cp.x).toBeCloseTo(105, 6)
    expect(cp.y).toBeCloseTo(105, 6)
    expect(bounceOffPoint(ball, BALL_R, 1, 0, cp.x, cp.y)).toBe(true)
    const d = Math.hypot(ball.x - 105, ball.y - 105)
    expect(d).toBeCloseTo(BALL_R, 4)
    // Push-out direction is along the (1,-1)/√2 normal away from the wall.
    expect(ball.x - 105).toBeCloseTo(BALL_R / Math.SQRT2, 3)
    expect(ball.y - 105).toBeCloseTo(-BALL_R / Math.SQRT2, 3)
  })

  it('slow approach settles (no micro-bounce) instead of reflecting', () => {
    const ball = { x: 50, y: 95, vx: 0, vy: 20 }
    bounceOffPoint(ball, BALL_R, WALL_E, 0, 50, 100)
    expect(ball.vy).toBe(0)
    expect(ball.y).toBeCloseTo(100 - BALL_R, 4)
  })
})

describe('pinball bumpers', () => {
  it('kicks outward with at least the min impulse and scores once per contact', () => {
    const s = game()
    const b = s.bumpers[0]!
    // Ball 2px inside the bumper surface, rising toward it from below.
    s.ball.x = b.x
    s.ball.y = b.y + b.r + BALL_R - 2
    s.ball.vx = 0
    s.ball.vy = -120
    step(s, 1 / 240)
    expect(s.score).toBe(BUMPER_POINTS)
    expect(s.events.some(e => e.kind === 'bumper')).toBe(true)
    // Outward kick: ball now moves away (downward, +y) with ≥ kick speed.
    expect(s.ball.vy).toBeGreaterThan(200)
    const dist = Math.hypot(s.ball.x - b.x, s.ball.y - b.y)
    expect(dist).toBeGreaterThanOrEqual(b.r + BALL_R - 0.01)
  })

  it('does not re-score while the contact cooldown runs', () => {
    const s = game()
    const b = s.bumpers[1]!
    s.ball.x = b.x
    s.ball.y = b.y + b.r + BALL_R - 2
    s.ball.vy = -50
    step(s, 1 / 240)
    step(s, 1 / 240)
    step(s, 1 / 240)
    expect(s.score).toBe(BUMPER_POINTS)
  })
})

describe('pinball flippers', () => {
  it('ball resting on a still flipper stays put (gravity balanced by contact)', () => {
    const s = game()
    const f = s.flippers.left
    // Flatten the flipper and pin it there for the test.
    f.rest = 0
    f.active = 0
    f.angle = 0
    f.omega = 0
    const mid = f.len / 2
    s.ball.x = f.px + mid
    s.ball.y = f.py - (BALL_R + FLIPPER_R) - 1
    s.ball.vx = 0
    s.ball.vy = 0
    run(s, 1)
    expect(s.ball.y).toBeGreaterThan(585)
    expect(s.ball.y).toBeLessThan(f.py - (BALL_R + FLIPPER_R) + 1.5)
    expect(Math.abs(s.ball.vy)).toBeLessThan(60)
    expect(s.ball.x).toBeGreaterThan(f.px) // never fell through the capsule
  })

  it('a swinging flipper imparts surface velocity to the ball', () => {
    const s = game()
    const f = s.flippers.left
    setFlipper(s, 'left', true)
    // Ball hovering 2px above the mid-flipper surface at the rest angle.
    const dirX = Math.cos(f.angle)
    const dirY = Math.sin(f.angle)
    const nX = dirY
    const nY = -dirX
    const gap = BALL_R + FLIPPER_R + 2
    s.ball.x = f.px + dirX * (f.len / 2) + nX * gap
    s.ball.y = f.py + dirY * (f.len / 2) + nY * gap
    s.ball.vx = 0
    s.ball.vy = 0
    const before = Math.hypot(s.ball.vx, s.ball.vy)
    run(s, 1 / 30)
    const after = Math.hypot(s.ball.vx, s.ball.vy)
    expect(after).toBeGreaterThan(before)
    expect(after).toBeGreaterThan(150)
  })

  it('still flipper pushes an overlapping ball out without launching it', () => {
    const s = game()
    const f = s.flippers.left
    f.held = false
    // A point 10px off the flipper axis at mid-length — inside the capsule.
    const dirX = Math.cos(f.angle)
    const dirY = Math.sin(f.angle)
    s.ball.x = f.px + dirX * 34 + dirY * 10
    s.ball.y = f.py + dirY * 34 - dirX * 10
    s.ball.vx = 0
    s.ball.vy = 0
    expect(resolveFlipper(s.ball, f)).toBe(true)
    const tip = { x: f.px + Math.cos(f.angle) * f.len, y: f.py + Math.sin(f.angle) * f.len }
    const cp = closestPointOnSegment(s.ball.x, s.ball.y, f.px, f.py, tip.x, tip.y)
    expect(Math.sqrt(cp.d2)).toBeCloseTo(BALL_R + FLIPPER_R, 2)
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeLessThan(60)
  })
})

describe('pinball gravity and tunneling', () => {
  it('a max-speed ball never tunnels through the lane floor', () => {
    const s = game()
    s.ball.x = 393
    s.ball.y = 400
    s.ball.vx = 0
    s.ball.vy = 2400
    let maxY = s.ball.y
    for (let i = 0; i < 30; i += 1) {
      step(s, 1 / 60)
      maxY = Math.max(maxY, s.ball.y)
    }
    // Caught by the floor (never sinks past it) and never drained.
    expect(maxY).toBeLessThan(660)
    expect(maxY).toBeGreaterThan(630)
    expect(s.ballsLeft).toBe(BALLS_PER_GAME)
    expect(s.result).toBe('playing')
  })
})

describe('pinball plunger', () => {
  it('charge clamps to [0, 1] while Space is held', () => {
    const s = game()
    s.plungerHeld = true
    run(s, 5)
    expect(s.plunger).toBe(1)
    expect(s.plunger).toBeLessThanOrEqual(1)
  })

  it('launch speed is proportional to the clamped charge', () => {
    const s = game()
    expect(ballInLaunchZone(s.ball)).toBe(true)
    for (const p of [0, 0.5, 1, 1.7]) {
      s.ball.x = 393
      s.ball.y = 636
      s.ball.vx = 0
      s.ball.vy = 0
      s.plunger = p
      const speed = plungerRelease(s)
      const expected = PLUNGER_MIN_SPEED + Math.min(1, Math.max(0, p)) * (PLUNGER_MAX_SPEED - PLUNGER_MIN_SPEED)
      expect(speed).toBeCloseTo(expected, 6)
      expect(-s.ball.vy).toBeCloseTo(expected, 6)
    }
  })

  it('release with the ball away from the lane fires nothing', () => {
    const s = game()
    s.ball.x = 210
    s.ball.y = 300
    s.plunger = 1
    expect(plungerRelease(s)).toBe(0)
    expect(s.ball.vy).toBe(0)
  })
})

describe('pinball nudge and tilt', () => {
  it('nudge applies a seeded impulse', () => {
    const s = game(11)
    s.ball.x = 210
    s.ball.y = 400
    s.ball.vx = 0
    s.ball.vy = 0
    expect(nudge(s)).toBe(true)
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeGreaterThan(10)
  })

  it('3 nudges within 5s tilt the machine and disable the flippers', () => {
    const s = game(3)
    nudge(s)
    nudge(s)
    nudge(s)
    expect(s.tiltTimer).toBeCloseTo(TILT_SECONDS, 6)
    expect(s.events.some(e => e.kind === 'tilt')).toBe(true)
    const restAngle = s.flippers.left.angle
    setFlipper(s, 'left', true)
    step(s, 1 / 60)
    expect(s.flippers.left.angle).toBe(restAngle) // dead flippers do not swing
  })

  it('flippers come back after the tilt penalty expires', () => {
    const s = game(3)
    nudge(s)
    nudge(s)
    nudge(s)
    setFlipper(s, 'left', true)
    run(s, TILT_SECONDS + 0.1)
    expect(s.tiltTimer).toBe(0)
    expect(s.flippers.left.angle).toBeLessThan(s.flippers.left.rest)
    expect(s.result).toBe('playing')
  })

  it('nudges older than the window do not accumulate into a tilt', () => {
    const s = game(5)
    nudge(s)
    nudge(s)
    s.time += 6 // window elapsed
    nudge(s)
    expect(s.tiltTimer).toBe(0)
    expect(s.events.some(e => e.kind === 'tilt')).toBe(false)
  })
})

describe('pinball drain and game over', () => {
  it('a ball below the bottom is lost and respawns in the launch lane', () => {
    const s = game()
    s.ball.x = 210
    s.ball.y = TABLE_H + 40
    step(s, 1 / 60)
    expect(s.ballsLeft).toBe(BALLS_PER_GAME - 1)
    expect(s.events.some(e => e.kind === 'drain')).toBe(true)
    expect(ballInLaunchZone(s.ball)).toBe(true)
    expect(s.result).toBe('playing')
  })

  it('losing all 3 balls ends the game', () => {
    const s = game()
    for (let i = 0; i < 3; i += 1) {
      s.ball.x = 210
      s.ball.y = TABLE_H + 40
      step(s, 1 / 60)
    }
    expect(s.result).toBe('gameOver')
    expect(s.ballsLeft).toBe(0)
  })
})

describe('pinball drop targets', () => {
  /** Drop the ball onto target `i` with a single tiny step. */
  function hitTarget(s: PinballState, i: number): void {
    const t = s.targets[i]!
    s.ball.x = (t.x1 + t.x2) / 2
    s.ball.y = t.y1 - BALL_R + 3 // overlapping the plate
    s.ball.vx = 0
    s.ball.vy = 0
    step(s, 1 / 240)
  }

  it('each target registers exactly once', () => {
    const s = game()
    hitTarget(s, 0)
    expect(s.targets[0]!.down).toBe(true)
    expect(s.score).toBe(TARGET_POINTS)
    // Hitting the already-down target again scores nothing.
    hitTarget(s, 0)
    expect(s.score).toBe(TARGET_POINTS)
  })

  it('clearing the bank pays the bonus and resets the bank', () => {
    const s = game()
    hitTarget(s, 0)
    hitTarget(s, 1)
    hitTarget(s, 2)
    expect(s.score).toBe(3 * TARGET_POINTS + BANK_BONUS)
    expect(s.events.some(e => e.kind === 'bank')).toBe(true)
    expect(s.targets.every(t => !t.down)).toBe(true)
  })
})

describe('pinball levels and determinism', () => {
  it('crossing the score threshold advances the level and swaps the preset', () => {
    const s = game()
    s.score = levelThreshold(1)
    step(s, 1 / 240)
    expect(s.level).toBe(2)
    expect(s.events.some(e => e.kind === 'levelUp')).toBe(true)
    const expected = BUMPER_PRESETS[1]!
    expect(s.bumpers.map(b => b.x)).toEqual(expected.map(p => p.x))
  })

  it('same seed + input script → identical trajectory hash', () => {
    const script = [
      { t: 0, a: 'plungerDown' as const },
      { t: 0.7, a: 'plungerRelease' as const },
      { t: 1.2, a: 'nudge' as const },
      { t: 1.5, a: 'leftDown' as const },
      { t: 1.9, a: 'leftUp' as const },
    ]
    const h1 = hashRun(1234, script, 3)
    const h2 = hashRun(1234, script, 3)
    expect(h1).toBe(h2)
    expect(h1).not.toBe(hashRun(99, script, 3))
  })

  it('mulberry32 is the standard deterministic rng', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('pinball pause and restart', () => {
  it('pause freezes and restore resumes the same mode', () => {
    const s = game()
    togglePause(s)
    expect(s.result).toBe('paused')
    const y = s.ball.y
    step(s, 1 / 60) // no-op while paused
    expect(s.ball.y).toBe(y)
    togglePause(s)
    expect(s.result).toBe('playing')
  })

  it('restart resets score and balls but keeps the level', () => {
    const s = game()
    s.level = 3
    s.score = 1234
    s.ballsLeft = 1
    restart(s)
    expect(s.level).toBe(3)
    expect(s.score).toBe(0)
    expect(s.ballsLeft).toBe(BALLS_PER_GAME)
    expect(s.result).toBe('playing')
  })

  it('a bumper trapped against a wall stops farming score (anti-trap sating)', () => {
    // Simulate the trapped geometry deterministically: every time the bumper
    // kicks the ball away, the "wall" puts it right back (in-game this is a
    // corner orbit). Three rapid hits inside TRAP_WINDOW must sate it.
    const s = game(7)
    s.ball.vx = 0
    s.ball.vy = 0
    const onBumper = (): void => {
      const b = s.bumpers[0]!
      s.ball.x = b.x
      s.ball.y = b.y + (BALL_R + b.r) - 1
      // The wall bounce kills the outward velocity — the ball returns to the
      // bumper with a fresh (approaching) velocity each cycle.
      s.ball.vx = 0
      s.ball.vy = 0
    }
    const score0 = s.score
    let hits = 0
    onBumper()
    for (let f = 0; f < Math.round(1.0 * 60); f += 1) {
      const before = s.score
      step(s, 1 / 60)
      if (s.score > before) hits += 1
      // The wall bounces it straight back onto the bumper (trap geometry).
      onBumper()
    }
    expect(hits).toBeGreaterThanOrEqual(TRAP_HITS)
    expect(s.bumpers[0]!.sated).toBe(true)
    // Once sated, further "returns" farm nothing beyond a small margin.
    const sated = s.score
    for (let f = 0; f < 30; f += 1) { step(s, 1 / 60); onBumper() }
    expect(s.score - sated).toBeLessThanOrEqual(BUMPER_POINTS * 2)
    // Staying genuinely clear for TRAP_CLEAR+ seconds un-sates it.
    s.ball.x = 20
    s.ball.y = 20
    run(s, 0.6)
    expect(s.bumpers[0]!.sated).toBe(false)
    expect(s.score - score0).toBeGreaterThan(0)
  })

  it('ball search rescues a ball wedged at rest outside the lane', () => {
    const s = game(11)
    // Wedge: a ball pinned at rest in dead territory (sling corner) —
    // position AND velocity re-pinned each frame, as a true wedge is.
    const pin = (): void => {
      s.ball.x = 90
      s.ball.y = 545
      s.ball.vx = 0
      s.ball.vy = 0
    }
    pin()
    for (let f = 0; f < Math.round(2.2 * 60); f += 1) {
      step(s, 1 / 60)
      pin()
    }
    // The rescue window elapsed at least once: the kick counter advanced.
    expect(s.stuckKicks).toBeGreaterThanOrEqual(1)
  })

  it('three failed ball-search rescues count the ball as lost', () => {
    const s = game(11)
    const balls0 = s.ballsLeft
    const pin = (): void => {
      s.ball.x = 90
      s.ball.y = 545
      s.ball.vx = 0
      s.ball.vy = 0
    }
    pin()
    let drained = false
    for (let f = 0; f < Math.round(9 * 60) && !drained; f += 1) {
      step(s, 1 / 60)
      if (s.ballsLeft < balls0) drained = true
      else pin()
    }
    expect(drained).toBe(true)
    // The respawned ball in the launch lane is NOT stuck-searched.
    expect(ballInLaunchZone(s.ball)).toBe(true)
    expect(s.stuckKicks).toBe(0)
  })
})
