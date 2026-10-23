import { describe, expect, it } from 'vitest'
import {
  createState, step, mulberry32, mulberry32Step, paddleReflect, bounceWalls, nextSpeed,
  clampPaddleX,
  W, H, HUD_H, PADDLE_W, PADDLE_H, PLAYER_Y, AI_Y, BALL_R, BASE_SPEED, SPEEDUP, SPEED_CAP,
  MAX_BOUNCE, AI_SPEED, AI_DEAD_ZONE, SERVE_MS, WIN_SCORE,
  type Ball, type PongState,
} from '../src/client/games/pong/logic.ts'

const FRAME = 1000 / 60
const idle = {}

/** A state with the ball launched and scores preset, parked mid-rally. */
function rallyState(overwrites: Partial<PongState> = {}): PongState {
  const s = createState(42)
  s.serveCd = 0
  s.ball = { x: W / 2, y: H / 2, vx: 100, vy: BASE_SPEED }
  Object.assign(s, overwrites)
  return s
}

describe('pong logic', () => {
  it('mulberry32 matches the explicit state-word step and stays in [0,1)', () => {
    const rng = mulberry32(123)
    let word = 123 >>> 0
    for (let i = 0; i < 100; i += 1) {
      const stepped = mulberry32Step(word)
      expect(stepped.value).toBe(rng())
      expect(stepped.value).toBeGreaterThanOrEqual(0)
      expect(stepped.value).toBeLessThan(1)
      word = stepped.next
    }
    // Same seed → same sequence.
    expect(mulberry32(7)()).toBe(mulberry32(7)())
  })

  it('paddleReflect: center hits go straight, edge hits hit the max angle', () => {
    const cx = W / 2
    const center = paddleReflect(cx, cx, BASE_SPEED, -1)
    expect(center.vx).toBeCloseTo(0, 6)
    expect(center.vy).toBeCloseTo(-BASE_SPEED, 6)
    // Right edge of the player paddle → up and to the right at MAX_BOUNCE.
    const rightEdge = paddleReflect(cx, cx + PADDLE_W / 2, BASE_SPEED, -1)
    expect(rightEdge.vx).toBeCloseTo(Math.sin(MAX_BOUNCE) * BASE_SPEED, 6)
    expect(rightEdge.vy).toBeCloseTo(-Math.cos(MAX_BOUNCE) * BASE_SPEED, 6)
    // Left edge of the AI paddle → down and to the left.
    const leftEdge = paddleReflect(cx, cx - PADDLE_W / 2, BASE_SPEED, 1)
    expect(leftEdge.vx).toBeCloseTo(-Math.sin(MAX_BOUNCE) * BASE_SPEED, 6)
    expect(leftEdge.vy).toBeCloseTo(Math.cos(MAX_BOUNCE) * BASE_SPEED, 6)
    // Oversized offsets clamp to the edge angle.
    const beyond = paddleReflect(cx, cx + PADDLE_W, BASE_SPEED, 1)
    expect(beyond.vx).toBeCloseTo(rightEdge.vx, 6)
  })

  it('bounceWalls flips vx and keeps the ball inside the arena', () => {
    const ball: Ball = { x: BALL_R - 5, y: 300, vx: -120, vy: 0 }
    bounceWalls(ball)
    expect(ball.vx).toBe(120)
    expect(ball.x).toBeGreaterThanOrEqual(BALL_R)
    const ballR: Ball = { x: W - BALL_R + 8, y: 300, vx: 150, vy: 0 }
    bounceWalls(ballR)
    expect(ballR.vx).toBe(-150)
    expect(ballR.x).toBeLessThanOrEqual(W - BALL_R)
    const untouched: Ball = { x: 200, y: 300, vx: 90, vy: 0 }
    bounceWalls(untouched)
    expect(untouched.vx).toBe(90)
  })

  it('goal detection: ball past a goal line scores and serves toward the loser', () => {
    const s = rallyState({ ball: { x: 100, y: -BALL_R - 1, vx: 0, vy: -BASE_SPEED } })
    const next = step(s, FRAME, idle)
    expect(next.playerScore).toBe(1)
    expect(next.serveCd).toBeGreaterThan(0)
    expect(next.serveCd).toBeLessThanOrEqual(SERVE_MS)
    expect(next.serveDir).toBe(-1) // loser is the AI → serve up
    expect(next.ball.x).toBe(W / 2)
    expect(next.ball.y).toBe(H / 2)
    expect(next.rally).toBe(0)
    // Run out the countdown: the ball launches upward.
    let t = step(next, next.serveCd, idle)
    t = step(t, FRAME, idle)
    expect(t.ball.vy).toBeLessThan(0)
    expect(Math.hypot(t.ball.vx, t.ball.vy)).toBeCloseTo(BASE_SPEED, 5)
    // Mirror case: ball past the bottom → AI scores, serve toward the player.
    const s2 = rallyState({ ball: { x: 100, y: H + BALL_R + 1, vx: 0, vy: BASE_SPEED } })
    const next2 = step(s2, FRAME, idle)
    expect(next2.aiScore).toBe(1)
    expect(next2.serveDir).toBe(1)
  })

  it('player paddle bounce flips the ball up, sharpens the angle, and speeds it up 4%', () => {
    // Ball falling straight onto the player paddle's left half.
    const s = rallyState({
      playerX: W / 2,
      targetX: W / 2,
      ball: { x: W / 2 - PADDLE_W / 4, y: PLAYER_Y - BALL_R - 1, vx: 0, vy: BASE_SPEED },
    })
    const next = step(s, FRAME, idle)
    expect(next.ball.vy).toBeLessThan(0)
    expect(next.ball.vx).toBeLessThan(0) // left-half hit bends left
    expect(Math.hypot(next.ball.vx, next.ball.vy)).toBeCloseTo(BASE_SPEED * SPEEDUP, 5)
    expect(next.ball.y).toBe(PLAYER_Y - BALL_R)
    expect(next.rally).toBe(1)
    // The input state is untouched (copy-on-write).
    expect(s.ball.vy).toBe(BASE_SPEED)
  })

  it('nextSpeed caps at 2.2× base speed', () => {
    let speed = BASE_SPEED
    for (let i = 0; i < 200; i += 1) speed = nextSpeed(speed)
    expect(speed).toBeCloseTo(BASE_SPEED * SPEED_CAP, 5)
    expect(nextSpeed(speed)).toBeCloseTo(BASE_SPEED * SPEED_CAP, 5)
  })

  it('AI paddle tracks the ball within its speed cap and ignores the dead-zone', () => {
    // Ball far to the right and approaching: AI moves right, capped.
    const s = rallyState({
      aiX: W / 2,
      ball: { x: W - 40, y: 200, vx: 0, vy: -BASE_SPEED },
    })
    const dt = 100
    const next = step(s, dt, idle)
    const moved = next.aiX - s.aiX
    expect(moved).toBeGreaterThan(0)
    expect(moved).toBeLessThanOrEqual(AI_SPEED * (dt / 1000) + 1e-9)
    // Within the dead-zone: no movement at all.
    const s2 = rallyState({
      aiX: clampPaddleX(300),
      ball: { x: clampPaddleX(300) + AI_DEAD_ZONE - 1, y: 200, vx: 0, vy: -BASE_SPEED },
    })
    const next2 = step(s2, dt, idle)
    expect(next2.aiX).toBe(s2.aiX)
    // Ball receding (vy > 0): AI drifts toward center, still capped.
    const s3 = rallyState({
      aiX: 100,
      ball: { x: W - 40, y: 200, vx: 0, vy: BASE_SPEED },
    })
    const next3 = step(s3, dt, idle)
    expect(next3.aiX).toBeGreaterThan(s3.aiX)
    expect(next3.aiX - s3.aiX).toBeLessThanOrEqual(AI_SPEED * (dt / 1000) + 1e-9)
  })

  it('first to 7 points wins the match', () => {
    const s = rallyState({
      playerScore: WIN_SCORE - 1,
      aiScore: 3,
      ball: { x: 100, y: -BALL_R - 1, vx: 0, vy: -BASE_SPEED },
    })
    const next = step(s, FRAME, idle) // ball crosses the AI goal line
    expect(next.over).toBe('player')
    expect(next.playerScore).toBe(WIN_SCORE)
    expect(next.serveCd).toBe(0)
    // A finished match is frozen.
    const frozen = step(next, FRAME, idle)
    expect(frozen).toBe(next)
    const lost = rallyState({ playerScore: 2, aiScore: WIN_SCORE - 1, ball: { x: 100, y: H + BALL_R + 1, vx: 0, vy: BASE_SPEED } })
    expect(step(lost, FRAME, idle).over).toBe('ai')
  })

  it('fixed-dt determinism: same seed + inputs → identical state', () => {
    const run = (): PongState => {
      let s = createState(2026)
      // 10 seconds of mixed pointer and key input at a fixed frame rate.
      for (let f = 0; f < Math.round(10000 / FRAME); f += 1) {
        const input = {
          playerX: f % 2 === 0 ? W / 2 + Math.sin(f) * 150 : undefined,
          left: f % 7 < 3,
          right: f % 11 >= 5,
        }
        s = step(s, FRAME, input)
      }
      return s
    }
    const a = run()
    const b = run()
    expect(a).toEqual(b) // includes rngState: full deep equality
    expect(a.playerScore + a.aiScore).toBeGreaterThanOrEqual(0)
  })

  it('AI paddle geometry stays reachable: paddles and goals bracket the field', () => {
    expect(AI_Y).toBeGreaterThan(HUD_H)
    expect(PLAYER_Y).toBeLessThan(H - PADDLE_H)
    expect(PLAYER_Y).toBeGreaterThan(AI_Y + PADDLE_H)
  })
})
