import { describe, expect, it } from 'vitest'
import {
  BALL_R, CAPTURE_SPEED, FIELD_H, FIELD_W, FRICTION_K, HOLE_R, LEVELS, LEVEL_COUNT,
  MAX_SHOT_SPEED, SAND_MULT, STOP_SPEED, WALL_RESTITUTION, collideRect, createGolfLevel,
  getLevel, inSand, nextLevel, restartLevel, shoot, slopeAccel, starFor, step, togglePause,
  type GolfBall, type WallRect,
} from '../src/client/games/minigolf/logic.ts'

function mkBall(x: number, y: number, vx: number, vy: number): GolfBall {
  return { x, y, vx, vy, atRest: false }
}

/** 用指定球替换第 1 关状态里的球并进入 rolling 相位。 */
function rollingWith(ball: GolfBall, level = 1) {
  const s = createGolfLevel(level)
  s.ball = ball
  s.phase = 'rolling'
  return s
}

/** 以 1/60 帧推进直到球停或入洞。 */
function settle(s: ReturnType<typeof createGolfLevel>, maxFrames = 60 * 30): number {
  let frames = 0
  while (s.phase === 'rolling' && frames < maxFrames) {
    step(s, 1 / 60)
    frames += 1
  }
  return frames
}

describe('minigolf physics', () => {
  it('deterministic: identical shots replay identical trajectories', () => {
    const run = () => {
      const s = createGolfLevel(6)
      shoot(s, -0.7, 0.8)
      for (let i = 0; i < 300; i += 1) step(s, 1 / 60)
      return { x: s.ball.x, y: s.ball.y, trail: s.trail.length, strokes: s.strokes }
    }
    expect(run()).toEqual(run())
  })

  it('wall bounce flips the hit axis with restitution and pushes the ball out', () => {
    const wall: WallRect = { x: 90, y: 0, w: 12, h: 85 }
    const b = mkBall(88, 40, 50, 6)
    expect(collideRect(b, wall)).toBe(true)
    expect(b.vx).toBeCloseTo(-50 * WALL_RESTITUTION, 6)
    expect(b.vy).toBeCloseTo(6, 6)
    expect(b.x).toBeCloseTo(90 - BALL_R, 6)
    // 分离中的球不反弹。
    const passing = mkBall(88, 40, -30, 0)
    collideRect(passing, wall)
    expect(passing.vx).toBe(-30)
  })

  it('no tunneling: a full-power shot stays inside the field', () => {
    const s = rollingWith(mkBall(30, 60, MAX_SHOT_SPEED, MAX_SHOT_SPEED * 0.6), 2)
    settle(s)
    expect(s.phase).toBe('aiming')
    expect(s.ball.x).toBeGreaterThanOrEqual(BALL_R)
    expect(s.ball.x).toBeLessThanOrEqual(FIELD_W - BALL_R)
    expect(s.ball.y).toBeGreaterThanOrEqual(BALL_R)
    expect(s.ball.y).toBeLessThanOrEqual(FIELD_H - BALL_R)
    expect(s.ball.atRest).toBe(true)
  })

  it('slope applies constant acceleration inside its rect only', () => {
    const def = getLevel(4)
    expect(slopeAccel(100, 60, def)).toEqual({ x: 0, y: 60 })
    expect(slopeAccel(30, 60, def)).toEqual({ x: 0, y: 0 })
    const s = rollingWith(mkBall(100, 60, 20, 0), 4)
    step(s, 1 / 60)
    expect(s.ball.vy).toBeGreaterThan(0.3)
  })

  it('sand multiplies friction: the ball decays much faster in the bunker', () => {
    const grass = rollingWith(mkBall(90, 60, 100, 0), 1)
    const sand = rollingWith(mkBall(90, 60, 100, 0), 3)
    expect(inSand(90, 60, getLevel(3))).toBe(true)
    expect(inSand(90, 60, getLevel(1))).toBe(false)
    step(grass, 1 / 60)
    step(sand, 1 / 60)
    const vGrass = Math.hypot(grass.ball.vx, grass.ball.vy)
    const vSand = Math.hypot(sand.ball.vx, sand.ball.vy)
    expect(vGrass).toBeCloseTo(100 * Math.exp(-FRICTION_K / 60), 1)
    expect(vSand).toBeLessThan(vGrass - 3)
    expect(vSand).toBeCloseTo(100 * Math.exp(-FRICTION_K * SAND_MULT / 60), 1)
  })
})

describe('minigolf hole capture and scoring', () => {
  it('a slow ball near the hole is captured; a fast ball flies over', () => {
    const slow = rollingWith(mkBall(168, 60, 10, 0))
    step(slow, 1 / 60)
    expect(slow.phase).toBe('levelDone')
    expect(slow.ball.x).toBe(170)
    expect(slow.ball.atRest).toBe(true)

    const fast = rollingWith(mkBall(160, 60, CAPTURE_SPEED * 3, 0))
    // 高速掠过洞口上方：穿过捕获圈但不入洞。
    for (let i = 0; i < 20 && fast.phase === 'rolling'; i += 1) step(fast, 1 / 60)
    expect(fast.phase).toBe('rolling')
    expect(fast.ball.x).toBeGreaterThan(170 + HOLE_R)
  })

  it('sinking level 1 in one stroke yields 3 stars, a sink event and the score', () => {
    const s = createGolfLevel(1)
    expect(shoot(s, 0, 0.6)).toBe(true)
    settle(s)
    expect(s.phase).toBe('levelDone')
    expect(s.strokes).toBe(1)
    expect(s.totalStars).toBe(3)
    expect(s.events[0]).toEqual({ kind: 'sink', level: 1, strokes: 1, par: 2, stars: 3 })
  })

  it('starFor maps strokes to 3/2/1 stars around par', () => {
    expect(starFor(1, 2)).toBe(3)
    expect(starFor(2, 2)).toBe(3)
    expect(starFor(3, 2)).toBe(2)
    expect(starFor(4, 2)).toBe(1)
    expect(starFor(4, 4)).toBe(3)
  })

  it('shoot only fires while aiming and clamps power', () => {
    const s = createGolfLevel(1)
    expect(shoot(s, Math.PI / 4, 1.5)).toBe(true)
    expect(s.strokes).toBe(1)
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeCloseTo(MAX_SHOT_SPEED, 6)
    expect(s.ball.vx).toBeCloseTo(MAX_SHOT_SPEED * Math.SQRT1_2, 5)
    expect(shoot(s, 0, 1)).toBe(false)
    expect(s.strokes).toBe(1)
  })

  it('pause freezes the simulation; restart/next keep accumulated stars', () => {
    const s = createGolfLevel(1)
    shoot(s, 0.4, 0.7)
    togglePause(s)
    expect(s.phase).toBe('paused')
    const { x, y, vx } = s.ball
    step(s, 5)
    expect(s.ball.x).toBe(x)
    expect(s.ball.y).toBe(y)
    expect(s.ball.vx).toBe(vx)
    togglePause(s)
    expect(s.phase).toBe('rolling')

    const r = createGolfLevel(5)
    r.totalStars = 4
    restartLevel(r)
    expect(r.level).toBe(5)
    expect(r.strokes).toBe(0)
    expect(r.totalStars).toBe(4)
    nextLevel(r)
    expect(r.level).toBe(6)
    expect(r.totalStars).toBe(4)
  })
})

describe('minigolf level table', () => {
  it('has 8 well-formed levels: ids, pars, and in-field tee/hole', () => {
    expect(LEVELS).toHaveLength(LEVEL_COUNT)
    LEVELS.forEach((def, i) => {
      expect(def.level).toBe(i + 1)
      expect(def.par).toBeGreaterThanOrEqual(2)
      for (const p of [def.tee, def.hole]) {
        expect(p.x).toBeGreaterThan(BALL_R)
        expect(p.x).toBeLessThan(FIELD_W - BALL_R)
        expect(p.y).toBeGreaterThan(BALL_R)
        expect(p.y).toBeLessThan(FIELD_H - BALL_R)
        // 发球点与洞口都不能嵌在任何墙内（含球半径膨胀）。
        for (const w of def.walls) {
          const inflated = { x: w.x - BALL_R, y: w.y - BALL_R, w: w.w + BALL_R * 2, h: w.h + BALL_R * 2 }
          expect(p.x > inflated.x + inflated.w || p.x < inflated.x || p.y > inflated.y + inflated.h || p.y < inflated.y).toBe(true)
        }
      }
      expect(Math.hypot(def.tee.x - def.hole.x, def.tee.y - def.hole.y)).toBeGreaterThan(40)
    })
  })

  it('getLevel wraps around at both ends', () => {
    expect(getLevel(9).level).toBe(1)
    expect(getLevel(0).level).toBe(8)
    expect(getLevel(-1).level).toBe(7)
    expect(getLevel(3).par).toBe(LEVELS[2]!.par)
  })

  it('a stopped ball is at rest below STOP_SPEED and returns to aiming', () => {
    const s = rollingWith(mkBall(60, 60, STOP_SPEED * 0.5, 0))
    step(s, 1 / 60)
    expect(s.ball.vx).toBe(0)
    expect(s.ball.atRest).toBe(true)
    expect(s.phase).toBe('aiming')
    expect(s.events.some(e => e.kind === 'stop')).toBe(true)
  })
})
