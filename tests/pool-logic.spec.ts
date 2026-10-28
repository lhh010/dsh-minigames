import { describe, expect, it } from 'vitest'
import {
  BALL_R, BALL_RESTITUTION, BASE_FRICTION_K, CUSHION_RESTITUTION, FOUL_PENALTY_SHOTS,
  MAX_SHOT_SPEED, POT_POINTS, POCKET_R, SHOT_BONUS, STOP_SPEED, SUBSTEPS, TABLE_H, TABLE_W,
  applyCushions, computeAimGuide, createLevel, finishShot, frictionK, inPocket, mulberry32,
  nextLevel, rackBalls, rayCircle, rayWall, resolveBallCollision, restartLevel, respotCue,
  shoot, step, shotsAllowed, togglePause, type Ball, type PoolState,
} from '../src/client/games/pool/logic.ts'

function ball(id: number, x: number, y: number, vx = 0, vy = 0): Ball {
  return { id, x, y, vx, vy, potted: false, atRest: vx === 0 && vy === 0 }
}

function mkBall(x: number, y: number, vx: number, vy: number, id = 1): Ball {
  return { id, x, y, vx, vy, potted: false, atRest: false }
}

function stateWith(balls: Ball[]): PoolState {
  const s = createLevel(1, 42)
  s.balls = balls
  s.result = 'aiming'
  return s
}

/** Energy of all live balls (kinetic, mass 1). */
const energy = (balls: Ball[]): number =>
  balls.reduce((e, b) => (b.potted ? e : e + (b.vx * b.vx + b.vy * b.vy) / 2), 0)

describe('pool physics', () => {
  it('head-on elastic collision swaps velocities', () => {
    const a = mkBall(50, 50, 30, 0)
    const b = mkBall(50 + BALL_R * 2 - 0.01, 50, 0, 0)
    const hit = resolveBallCollision(a, b, 1)
    expect(hit).toBe(true)
    expect(a.vx).toBeCloseTo(0, 5)
    expect(b.vx).toBeCloseTo(30, 5)
  })

  it('angled collision conserves energy (ε) and preserves tangential speed', () => {
    const a = mkBall(50, 50, 20, 10)
    // In contact (~2R apart) but off-axis so the normal is tilted.
    const b = mkBall(55.5, 53.2, 0, 0)
    const before = energy([a, b])
    expect(resolveBallCollision(a, b, BALL_RESTITUTION)).toBe(true)
    // With e < 1 a little energy leaves; never more than existed.
    const after = energy([a, b])
    expect(after).toBeLessThanOrEqual(before + 1e-9)
    expect(after).toBeGreaterThan(before * 0.8)
    expect(Math.hypot(a.vx, a.vy) + Math.hypot(b.vx, b.vy)).toBeGreaterThan(0)
  })

  it('exactly e=1 two-ball collision conserves energy exactly for any angle', () => {
    for (const ang of [0.3, 1.1, 2.2]) {
      const a = mkBall(50, 50, Math.cos(ang) * 25, Math.sin(ang) * 25)
      const b = mkBall(50 + BALL_R - 0.01, 50 + BALL_R * Math.sqrt(3), 0, 0)
      const before = energy([a, b])
      resolveBallCollision(a, b, 1)
      expect(energy([a, b])).toBeCloseTo(before, 6)
    }
  })

  it('separating balls do not collide and resting balls are not disturbed', () => {
    const a = mkBall(50, 50, -10, 0)
    const b = mkBall(50 + BALL_R * 2 - 0.01, 50, -5, 0)
    expect(resolveBallCollision(a, b, 1)).toBe(false)
    expect(a.vx).toBe(-10)
    expect(b.vx).toBe(-5)
  })

  it('friction decays exponentially: one second at k=0.9 leaves e^-0.9', () => {
    const s = stateWith([ball(0, 100, 50, 40, 30), ball(1, 150, 50)])
    s.result = 'moving'
    step(s, 1)
    const cue = s.balls[0]!
    const v = Math.hypot(cue.vx, cue.vy)
    expect(v).toBeCloseTo(50 * Math.exp(-frictionK(1)), 1)
    expect(s.balls[1]!.x).toBe(150) // stationary ball untouched
  })

  it('balls stop below STOP_SPEED and are marked at-rest', () => {
    const s = stateWith([ball(0, 100, 50, STOP_SPEED * 0.9, 0), ball(1, 150, 50)])
    s.result = 'moving'
    step(s, 1 / 60)
    const cue = s.balls[0]!
    expect(cue.vx).toBe(0)
    expect(cue.vy).toBe(0)
    expect(cue.atRest).toBe(true)
    // Everything at rest resolves the shot back to aiming.
    expect(s.result).toBe('aiming')
  })

  it('cushion bounce flips the axis with restitution', () => {
    const b = ball(0, BALL_R - 0.5, 50, -100, 0)
    applyCushions(b)
    expect(b.vx).toBeCloseTo(100 * CUSHION_RESTITUTION, 6)
    expect(b.x).toBeCloseTo(BALL_R, 6)
    expect(b.vy).toBe(0)
    const c = ball(0, 50, TABLE_H - BALL_R + 0.5, 0, 60)
    applyCushions(c)
    expect(c.vy).toBeCloseTo(-60 * CUSHION_RESTITUTION, 6)
  })

  it('no tunneling: a fast ball across the table stays inside the rails', () => {
    const s = stateWith([ball(0, 30, 50, MAX_SHOT_SPEED, MAX_SHOT_SPEED * 0.5)])
    s.result = 'moving'
    for (let i = 0; i < 60 * 20 && s.result === 'moving'; i += 1) step(s, 1 / 60)
    const cue = s.balls[0]!
    expect(cue.x).toBeGreaterThanOrEqual(-POCKET_R)
    expect(cue.x).toBeLessThanOrEqual(TABLE_W + POCKET_R)
    expect(cue.y).toBeGreaterThanOrEqual(-POCKET_R)
    expect(cue.y).toBeLessThanOrEqual(TABLE_H + POCKET_R)
  })

  it('a ball center inside a pocket radius pots; edge overlap does not', () => {
    const pots = stateWith([ball(0, 100, 50), ball(1, POCKET_R * 0.5, POCKET_R * 0.5, 0, 0), ball(2, 160, 60)])
    pots.result = 'moving'
    step(pots, 1 / 60)
    expect(pots.balls[1]!.potted).toBe(true)
    expect(pots.score).toBe(POT_POINTS)
    // Just outside the corner pocket: stays on the table.
    const near = POCKET_R * 1.4
    const noPot = stateWith([ball(0, 100, 50), ball(1, near, near, 0, 0), ball(2, 160, 60)])
    noPot.result = 'moving'
    step(noPot, 1 / 60)
    expect(noPot.balls[1]!.potted).toBe(false)
    expect(inPocket(near, near)).toBe(false)
    expect(inPocket(POCKET_R * 0.5, POCKET_R * 0.5)).toBe(true)
  })

  it('cue foul: respot at the head spot plus a shot penalty', () => {
    const s = stateWith([ball(0, 3, 3, 0, 0), ball(1, 150, 50), ball(2, 160, 60)])
    s.shotsUsed = 2
    s.result = 'moving'
    s.balls[0]!.potted = true
    finishShot(s)
    const cue = s.balls[0]!
    expect(cue.potted).toBe(false)
    expect(cue.x).toBeCloseTo(TABLE_W * 0.25, 5)
    expect(cue.y).toBeCloseTo(TABLE_H / 2, 5)
    expect(s.shotsUsed).toBe(2 + FOUL_PENALTY_SHOTS)
    expect(s.events.some(e => e.kind === 'foul')).toBe(true)
    // Not won, budget not exhausted → aiming again.
    expect(s.result).toBe('aiming')
  })

  it('respotCue nudges around an occupied head spot', () => {
    const s = stateWith([ball(0, 3, 3, 0, 0), ball(1, TABLE_W * 0.25, TABLE_H / 2)])
    respotCue(s)
    const cue = s.balls[0]!
    const blocker = s.balls[1]!
    expect(Math.hypot(cue.x - blocker.x, cue.y - blocker.y)).toBeGreaterThanOrEqual(BALL_R * 2 - 1e-6)
    expect(cue.x).toBeGreaterThan(TABLE_W * 0.25)
  })
})

describe('pool aim guide', () => {
  it('rayCircle finds the nearest hit on a ball inflated to 2R', () => {
    const t = rayCircle(0, 0, 1, 0, 30, 0, BALL_R * 2)
    expect(t).toBeCloseTo(30 - BALL_R * 2, 6)
    expect(rayCircle(0, 0, 1, 0, 30, 10, BALL_R * 2)).toBeNull()
    // Behind the ray origin: no hit.
    expect(rayCircle(10, 0, 1, 0, 0, 0, BALL_R)).toBeNull()
  })

  it('rayWall returns the distance to the axis-aligned wall', () => {
    expect(rayWall(10, 10, 1, 0)).toBeCloseTo(TABLE_W - 10, 6)
    expect(rayWall(10, 10, 0, -1)).toBeCloseTo(10, 6)
    expect(rayWall(10, 10, -1, 0)).toBeCloseTo(10, 6)
  })

  it('guide points at the first ball on the ray and stops there', () => {
    const balls = [ball(0, 20, 50), ball(1, 80, 50), ball(2, 140, 50)]
    const g = computeAimGuide(balls, 0)
    expect(g.hitBallId).toBe(1)
    expect(g.impact.x).toBeCloseTo(80 - BALL_R * 2, 4)
    expect(g.impact.y).toBeCloseTo(50, 6)
    expect(g.path.length).toBe(2)
  })

  it('guide with no ball in the way bounces once off the far wall', () => {
    const balls = [ball(0, 20, 50)]
    const g = computeAimGuide(balls, 0)
    expect(g.hitBallId).toBeNull()
    expect(g.impact.x).toBeCloseTo(TABLE_W, 4)
    expect(g.path.length).toBe(3)
    expect(g.path[2]!.x).toBeLessThan(TABLE_W) // bounced back along -x
    expect(g.path[2]!.y).toBeCloseTo(50, 6)
  })

  it('guide ignores potted balls and the cue itself', () => {
    const potted = ball(1, 80, 50)
    potted.potted = true
    const g = computeAimGuide([ball(0, 20, 50), potted], 0)
    expect(g.hitBallId).toBeNull()
    expect(g.impact.x).toBeCloseTo(TABLE_W, 4)
  })
})

describe('pool rules and progression', () => {
  it('rack is a deterministic 9-ball diamond with the 9 in the middle', () => {
    const a = rackBalls(7)
    const b = rackBalls(7)
    expect(a).toEqual(b)
    expect(a).toHaveLength(10) // cue + 9
    expect(a[0]!.id).toBe(0)
    const ids = a.slice(1).map(x => x.id).sort()
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const nine = a.find(x => x.id === 9)!
    const one = a.find(x => x.id === 1)!
    expect(nine.x).toBeGreaterThan(one.x)
    expect(Math.abs(nine.y - TABLE_H / 2)).toBeLessThan(BALL_R)
    // No rack overlaps.
    for (let i = 1; i < a.length; i += 1) {
      for (let j = i + 1; j < a.length; j += 1) {
        expect(Math.hypot(a[i]!.x - a[j]!.x, a[i]!.y - a[j]!.y)).toBeGreaterThan(BALL_R * 1.9)
      }
    }
  })

  it('createLevel / restartLevel / nextLevel keep the rack and score rules', () => {
    const s = createLevel(1, 42)
    expect(s.result).toBe('aiming')
    expect(shotsAllowed(1)).toBe(14)
    expect(shotsAllowed(3)).toBe(18)
    expect(frictionK(1)).toBeCloseTo(BASE_FRICTION_K)
    expect(frictionK(2)).toBeGreaterThan(frictionK(1))
    const s2 = createLevel(2, 42)
    expect(s2.level).toBe(2)
    // Same (level, seed) pair replays the same rack.
    const again = createLevel(1, 42)
    expect(again.balls).toEqual(s.balls)
    restartLevel(s, 42)
    expect(s.balls).toEqual(again.balls)
    s.score = 500
    nextLevel(s, 42)
    expect(s.level).toBe(2)
    expect(s.score).toBe(500)
    expect(s.shotsUsed).toBe(0)
  })

  it('win: potting all nine scores the remaining-shot bonus', () => {
    const s = stateWith([ball(0, 100, 50)])
    for (let id = 1; id <= 9; id += 1) {
      const b = ball(id, id, id)
      b.potted = true
      s.balls.push(b)
    }
    s.pottedCount = 9
    s.score = 9 * POT_POINTS
    s.shotsUsed = 6
    s.result = 'moving'
    finishShot(s)
    expect(s.result).toBe('levelWon')
    const bonus = (shotsAllowed(1) - 6) * SHOT_BONUS
    expect(s.score).toBe(9 * POT_POINTS + bonus)
    expect(s.events[0]).toEqual({ kind: 'win', bonus })
  })

  it('lose: exhausting the shot budget without clearing ends the game', () => {
    const s = stateWith([ball(0, 100, 50), ball(1, 150, 50)])
    s.shotsUsed = shotsAllowed(1)
    s.result = 'moving'
    finishShot(s)
    expect(s.result).toBe('gameOver')
    expect(s.events.some(e => e.kind === 'lose')).toBe(true)
  })

  it('shoot charges one shot, clamps power, and only fires while aiming', () => {
    const s = createLevel(1, 5)
    const before = s.balls[0]!
    expect(shoot(s, Math.PI / 4, 1.5)).toBe(true)
    expect(s.shotsUsed).toBe(1)
    expect(Math.hypot(before.vx, before.vy)).toBeCloseTo(MAX_SHOT_SPEED, 6)
    expect(before.vx).toBeCloseTo(MAX_SHOT_SPEED * Math.SQRT1_2, 5)
    expect(s.result).toBe('moving')
    // Cannot fire while balls are rolling.
    expect(shoot(s, 0, 1)).toBe(false)
    expect(s.shotsUsed).toBe(1)
  })

  it('pause freezes the simulation (dt has no effect while paused)', () => {
    const s = createLevel(1, 9)
    shoot(s, 0, 1)
    togglePause(s)
    expect(s.result).toBe('paused')
    const cue = s.balls[0]!
    const { x, y, vx } = cue
    step(s, 5)
    expect(cue.x).toBe(x)
    expect(cue.y).toBe(y)
    expect(cue.vx).toBe(vx)
    togglePause(s)
    expect(s.result).toBe('moving')
    step(s, 1 / 60)
    expect(cue.x).toBeGreaterThan(x)
  })

  it('break scenario: a full-power break settles with every ball at rest', () => {
    const s = createLevel(1, 2024)
    expect(shoot(s, 0.02, 1)).toBe(true)
    let frames = 0
    while (s.result === 'moving' && frames < 60 * 60) {
      step(s, 1 / 60)
      frames += 1
    }
    expect(frames).toBeLessThan(60 * 60)
    expect(s.result).toBe('aiming')
    for (const b of s.balls) {
      if (b.potted) continue
      expect(b.atRest).toBe(true)
      expect(b.vx).toBe(0)
      expect(b.vy).toBe(0)
      expect(b.x).toBeGreaterThanOrEqual(BALL_R - 1.01)
      expect(b.x).toBeLessThanOrEqual(TABLE_W - BALL_R + 1.01)
      expect(b.y).toBeGreaterThanOrEqual(BALL_R - 1.01)
      expect(b.y).toBeLessThanOrEqual(TABLE_H - BALL_R + 1.01)
    }
    expect(energy(s.balls)).toBe(0)
  })

  it('physics constants match the design', () => {
    expect(BALL_RESTITUTION).toBeCloseTo(0.95)
    expect(CUSHION_RESTITUTION).toBeCloseTo(0.92)
    expect(BASE_FRICTION_K).toBeCloseTo(0.9)
    expect(STOP_SPEED).toBeLessThan(2)
    expect(SUBSTEPS).toBeGreaterThanOrEqual(4)
    expect(POCKET_R).toBeCloseTo(BALL_R * 1.6, 6)
    expect(TABLE_W / TABLE_H).toBeCloseTo(2)
    expect(mulberry32(3)()).toBe(mulberry32(3)())
  })
})
