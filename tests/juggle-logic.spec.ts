import { describe, expect, it } from 'vitest'
import {
  ADD_BALL_MS, BALL_R, COMBO_CAP, COMBO_WINDOW_MS, GRAVITY, H, MAX_BALLS, MIN_VY, SPAWN_Y, START_LIVES, TAP_RADIUS, TAP_VX_MAX, TAP_VY, W,
  ballTargetOf, createJuggle, gainOf, isDropped, stepJuggle, tapImpulse,
  type Ball, type JuggleState,
} from '../src/client/games/juggle/logic.ts'

const idle = { tap: null } as const

/** 用一颗位置可控的球替换场上所有球，压制自然补球。 */
function pinBall(s: JuggleState, x = W / 2, y = 300, vx = 0, vy = 0): Ball {
  const ball: Ball = { x, y, vx, vy, hue: 0, trail: [] }
  s.balls.length = 0
  s.balls.push(ball)
  return ball
}

function run(s: JuggleState, frames: number, tap: { x: number, y: number } | null = null): void {
  for (let i = 0; i < frames; i += 1) stepJuggle(s, 16, { tap })
}

describe('juggle logic', () => {
  it('tap impulse decays linearly with distance and points up plus toward the click', () => {
    const ball: Ball = { x: 200, y: 300, vx: 0, vy: 0, hue: 0, trail: [] }
    const center = tapImpulse(ball, 200, 300)
    expect(center.factor).toBeCloseTo(1, 10)
    expect(center.dvy).toBeCloseTo(TAP_VY, 10)
    expect(center.dvx).toBe(0)
    // 右上方 60px：factor = 0.4，方向沿 (dx,dy) 归一。
    const diag = tapImpulse(ball, 248, 264) // dx=48, dy=-36, dist=60
    expect(diag.factor).toBeCloseTo(0.4, 10)
    expect(diag.dvy).toBeCloseTo(TAP_VY * 0.4, 10)
    expect(diag.dvx).toBeCloseTo((48 / 60) * TAP_VX_MAX * 0.4, 10)
    // 左侧水平 50px：dvx 为负（朝点击方向）。
    const left = tapImpulse(ball, 150, 300)
    expect(left.dvx).toBeLessThan(0)
    expect(left.dvy).toBeCloseTo(TAP_VY * 0.5, 10)
    // 超出有效半径：零冲量。
    expect(tapImpulse(ball, 200 + TAP_RADIUS, 300).factor).toBe(0)
    expect(tapImpulse(ball, 200, 300 + TAP_RADIUS + 1).factor).toBe(0)
  })

  it('gravity integrates in fixed 8ms substeps (semi-implicit Euler)', () => {
    const s = createJuggle(1)
    const ball = pinBall(s, W / 2, 300)
    stepJuggle(s, 16, idle)
    // 两个 8ms 子步：v 先加速再位移。
    const v1 = GRAVITY * 0.008
    const dy = v1 * 0.008 + (v1 + GRAVITY * 0.008) * 0.008
    expect(ball.vy).toBeCloseTo(GRAVITY * 0.016, 8)
    expect(ball.y).toBeCloseTo(300 + dy, 8)
    expect(ball.x).toBeCloseTo(W / 2, 8)
    // 连续 60 帧后明显下落、速度持续增大。
    run(s, 60)
    expect(ball.y).toBeGreaterThan(320)
    expect(ball.vy).toBeGreaterThan(0)
  })

  it('balls bounce off the side walls and vx clamps', () => {
    const s = createJuggle(2)
    const ball = pinBall(s, BALL_R + 1, 300, -300, 0)
    stepJuggle(s, 16, idle)
    // 第 1 个子步撞墙夹到 BALL_R 并反弹，第 2 个子步已向右回移 2.4。
    expect(ball.x).toBeCloseTo(BALL_R + 300 * 0.008, 8)
    expect(ball.vx).toBe(300)
    // 反复强拍限速：横向不超过上限、上行不低于 MIN_VY。
    const s2 = createJuggle(2)
    const b2 = pinBall(s2, W / 2, 300)
    for (let i = 0; i < 6; i += 1) stepJuggle(s2, 16, { tap: { x: b2.x - TAP_RADIUS + 5, y: b2.y } })
    expect(b2.vx).toBeLessThanOrEqual(420 + 1e-9)
    for (let i = 0; i < 12; i += 1) stepJuggle(s2, 16, { tap: { x: b2.x, y: b2.y } })
    expect(b2.vy).toBeGreaterThanOrEqual(MIN_VY - 1e-9)
  })

  it('ball target grows every 10s up to 6 and drops respawn to target', () => {
    expect(ballTargetOf(0)).toBe(1)
    expect(ballTargetOf(ADD_BALL_MS - 1)).toBe(1)
    expect(ballTargetOf(ADD_BALL_MS)).toBe(2)
    expect(ballTargetOf(5 * ADD_BALL_MS)).toBe(6)
    expect(ballTargetOf(99 * ADD_BALL_MS)).toBe(MAX_BALLS)

    const s = createJuggle(3)
    s.t = ADD_BALL_MS // 目标 2，场上 1。
    stepJuggle(s, 16, idle)
    expect(s.balls.length).toBe(2)
    expect(s.events.some((e) => e.type === 'spawn')).toBe(true)
    expect(s.balls.some((b) => b.y === SPAWN_Y)).toBe(true)

    // 丢球后：-1 命、combo 清零、球数在下一帧补回目标。
    const s2 = createJuggle(3)
    s2.t = ADD_BALL_MS
    s2.combo = 4
    s2.comboExpire = s2.t + 9999
    pinBall(s2, 100, H + BALL_R + 5, 0, 100)
    stepJuggle(s2, 16, idle)
    expect(s2.lives).toBe(START_LIVES - 1)
    expect(s2.dropped).toBe(1)
    expect(s2.combo).toBe(0)
    expect(s2.events.some((e) => e.type === 'drop')).toBe(true)
    expect(s2.balls.length).toBe(1) // 目标 2：场上 0 后每帧补 1
    stepJuggle(s2, 16, idle)
    expect(s2.balls.length).toBe(2)
  })

  it('drop detection uses the ball bottom edge crossing the floor', () => {
    const inside: Ball = { x: 100, y: H - BALL_R, vx: 0, vy: 0, hue: 0, trail: [] }
    expect(isDropped(inside)).toBe(false)
    const outside: Ball = { x: 100, y: H + BALL_R + 0.5, vx: 0, vy: 0, hue: 0, trail: [] }
    expect(isDropped(outside)).toBe(true)
  })

  it('successful taps build combo, score equals the multiplier, capped', () => {
    const s = createJuggle(4)
    const ball = pinBall(s)
    expect(gainOf(1)).toBe(1)
    expect(gainOf(COMBO_CAP + 5)).toBe(COMBO_CAP)
    // 连续每帧拍球心：combo 1..8，得分 = 倍率累加（events 每帧清空，逐帧累计）。
    let hits = 0
    for (let i = 1; i <= COMBO_CAP; i += 1) {
      stepJuggle(s, 16, { tap: { x: ball.x, y: ball.y } })
      expect(s.combo).toBe(i)
      hits += s.events.filter((e) => e.type === 'hit').length
    }
    expect(s.score).toBe((COMBO_CAP * (COMBO_CAP + 1)) / 2)
    expect(hits).toBe(COMBO_CAP)
    // 超过上限继续封顶。
    stepJuggle(s, 16, { tap: { x: ball.x, y: ball.y } })
    expect(s.combo).toBe(COMBO_CAP)
    expect(s.score).toBe((COMBO_CAP * (COMBO_CAP + 1)) / 2 + COMBO_CAP)
    // 连击窗口过期后再拍：combo 归 1。
    s.comboExpire = 0
    stepJuggle(s, 16, { tap: { x: ball.x, y: ball.y } })
    expect(s.combo).toBe(1)
    expect(s.score).toBe((COMBO_CAP * (COMBO_CAP + 1)) / 2 + COMBO_CAP + 1)
    // 飘字产生并随时间耗尽（10 次拍中各 1 个，均未过期）。
    expect(s.floats.length).toBe(10)
    run(s, Math.ceil(900 / 16))
    expect(s.floats.length).toBe(0)
  })

  it('a tap that reaches no ball still ripples but never scores or breaks combo', () => {
    const s = createJuggle(5)
    pinBall(s, 100, 300)
    s.combo = 3
    s.comboExpire = s.t + 9999
    stepJuggle(s, 16, { tap: { x: W - 40, y: 80 } }) // 距球远超半径
    expect(s.score).toBe(0)
    expect(s.combo).toBe(3)
    expect(s.events.some((e) => e.type === 'tap' && e.strength === 0)).toBe(true)
    expect(s.events.some((e) => e.type === 'hit')).toBe(false)
    // 飘字不产生。
    expect(s.floats.length).toBe(0)
  })

  it('losing the last life ends the game and freezes clock, balls and score', () => {
    const s = createJuggle(6)
    s.lives = 1
    pinBall(s, 100, H + BALL_R + 5, 0, 100)
    run(s, 4)
    expect(s.over).toBe(true)
    expect(s.lives).toBe(0)
    const t = s.t
    const score = s.score
    pinBall(s, W / 2, 300)
    run(s, 30)
    expect(s.balls.length).toBe(1)
    expect(s.balls[0]!.y).toBe(300)
    expect(s.t).toBe(t)
    expect(s.score).toBe(score)
  })

  it('the same seed and input script replay identically; other seeds or rounds diverge', () => {
    const trace = (seed: number, round: number): string => {
      const s = createJuggle(seed, round)
      const marks: number[] = []
      for (let frame = 0; frame < 800; frame += 1) {
        const tap = frame % 5 === 0 && s.balls.length > 0
          ? { x: s.balls[0]!.x, y: s.balls[0]!.y }
          : null
        stepJuggle(s, 16, { tap })
        marks.push(s.score, s.lives, s.dropped, s.combo, s.balls.length, s.hueCount)
        for (const b of s.balls) marks.push(b.hue, Math.round(b.x), Math.round(b.y), Math.round(b.vy))
        for (const b of s.balls) for (const p of b.trail) marks.push(Math.round(p.x), Math.round(p.y))
      }
      return JSON.stringify(marks)
    }
    expect(trace(888, 1)).toBe(trace(888, 1))
    expect(trace(888, 1)).not.toBe(trace(888, 2))
    expect(trace(888, 1)).not.toBe(trace(777, 1))
  })
})
