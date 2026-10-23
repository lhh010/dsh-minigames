/**
 * Pong (弹球对打) pure logic: player paddle at the bottom vs an AI paddle at
 * the top on a 480×640 portrait arena. First to WIN_SCORE points wins the
 * match. The ball bounces off the side walls; each paddle hit reflects the
 * outbound angle by the hit offset from the paddle center and speeds the ball
 * up 4% (capped at 2.2× base). A goal past either paddle scores a point, then
 * the ball parks at center for a short serve delay before launching toward
 * the player who lost the point. step() is copy-on-write: it returns a new
 * state and never mutates the argument. Deterministic given (seed, dt, input);
 * time is in milliseconds throughout.
 */

/** Logical arena size (HUD strip lives inside this height). */
export const W = 480
export const H = 640
export const HUD_H = 30

export const PADDLE_W = 84
export const PADDLE_H = 12
/** Gap between a goal line and the paddle's field-facing edge. */
export const PADDLE_MARGIN = 34
/** Top edge of the player paddle (bottom of the arena). */
export const PLAYER_Y = H - PADDLE_MARGIN - PADDLE_H
/** Top edge of the AI paddle (just below the HUD strip). */
export const AI_Y = HUD_H + PADDLE_MARGIN

export const BALL_R = 7
/** Ball speed at serve, px/s; every paddle hit multiplies it by SPEEDUP. */
export const BASE_SPEED = 300
export const SPEEDUP = 1.04
export const SPEED_CAP = 2.2
/** Max outbound angle off vertical at a paddle edge, radians (60°). */
export const MAX_BOUNCE = Math.PI / 3

/** Player paddle chase speed toward the pointer/target, px/s. */
export const PLAYER_SPEED = 480
/** Arrow-key target nudge speed, px/s. */
export const KEY_SPEED = 380
/** AI paddle max speed, px/s — below the ball's worst-case lateral speed. */
export const AI_SPEED = 260
/** AI does not react to targets closer than this, px. */
export const AI_DEAD_ZONE = 6

export const WIN_SCORE = 7
export const SERVE_MS = 900
/** Max serve angle off vertical, radians (36°). */
export const SERVE_ANGLE = Math.PI / 5

/** Deterministic PRNG (mulberry32) over a 32-bit state word. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One mulberry32 step on an explicit state word.
 * @param state - the current 32-bit PRNG state.
 * @returns the uniform value in [0,1) and the next state word.
 */
export function mulberry32Step(state: number): { value: number; next: number } {
  const a = (state + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, next: a }
}

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
}

/** Held input: pointer target and/or held keys for one step. */
export interface PongInput {
  playerX?: number
  left?: boolean
  right?: boolean
}

/** Match winner; null while the match runs. */
export type PongWinner = 'player' | 'ai' | null

export interface PongState {
  /** Paddle center x. */
  playerX: number
  aiX: number
  /** Player paddle chase target (pointer x or key-nudged). */
  targetX: number
  ball: Ball
  playerScore: number
  aiScore: number
  /** Paddle hits in the current rally. */
  rally: number
  /** Remaining serve countdown; the ball parks at center while > 0. */
  serveCd: number
  /** Serve direction when the countdown ends: -1 up (to the AI), 1 down. */
  serveDir: -1 | 1
  over: PongWinner
  /** 32-bit mulberry32 state word; drives serve angles. */
  rngState: number
}

/** A fresh match: paddles centered, ball parked at center serving to the player. */
export function createState(seed: number = 1): PongState {
  return {
    playerX: W / 2,
    aiX: W / 2,
    targetX: W / 2,
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    playerScore: 0,
    aiScore: 0,
    rally: 0,
    serveCd: SERVE_MS,
    serveDir: 1,
    over: null,
    rngState: seed >>> 0,
  }
}

export function clampPaddleX(x: number): number {
  return Math.min(W - PADDLE_W / 2, Math.max(PADDLE_W / 2, x))
}

/** Ball speed after one paddle hit: +4%, capped at SPEED_CAP × BASE_SPEED. */
export function nextSpeed(speed: number): number {
  return Math.min(speed * SPEEDUP, BASE_SPEED * SPEED_CAP)
}

/**
 * Classic paddle reflection: outbound angle scales with the hit offset from
 * the paddle center (edge → MAX_BOUNCE off vertical), speed preserved.
 * @param paddleCenter - paddle center x.
 * @param ballX - ball center x at the hit.
 * @param speed - outbound speed.
 * @param dir - vertical direction after the bounce: -1 up (player hit), 1 down.
 * @returns the new velocity.
 */
export function paddleReflect(
  paddleCenter: number, ballX: number, speed: number, dir: -1 | 1,
): { vx: number; vy: number } {
  const offset = Math.min(1, Math.max(-1, (ballX - paddleCenter) / (PADDLE_W / 2)))
  const angle = offset * MAX_BOUNCE
  return { vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed * dir }
}

/** Reflect the ball off the left/right walls; keeps x inside [BALL_R, W-BALL_R]. */
export function bounceWalls(ball: Ball): void {
  if (ball.x < BALL_R) {
    ball.x = BALL_R * 2 - ball.x
    ball.vx = Math.abs(ball.vx)
  } else if (ball.x > W - BALL_R) {
    ball.x = (W - BALL_R) * 2 - ball.x
    ball.vx = -Math.abs(ball.vx)
  }
}

/** Launch the parked ball from center toward `serveDir` with a seeded angle. */
function serve(s: PongState): void {
  const { value, next } = mulberry32Step(s.rngState)
  s.rngState = next
  const angle = (value * 2 - 1) * SERVE_ANGLE
  s.ball.x = W / 2
  s.ball.y = H / 2
  s.ball.vx = Math.sin(angle) * BASE_SPEED
  s.ball.vy = Math.cos(angle) * BASE_SPEED * s.serveDir
}

/** Score a goal for `who`: bump the score, park the ball, serve to the loser. */
function scoreGoal(s: PongState, who: 'player' | 'ai'): void {
  if (who === 'player') {
    s.playerScore += 1
    s.serveDir = -1
  } else {
    s.aiScore += 1
    s.serveDir = 1
  }
  s.rally = 0
  s.ball.x = W / 2
  s.ball.y = H / 2
  s.ball.vx = 0
  s.ball.vy = 0
  if (s.playerScore >= WIN_SCORE || s.aiScore >= WIN_SCORE) {
    s.over = s.playerScore >= WIN_SCORE ? 'player' : 'ai'
    s.serveCd = 0
  } else {
    s.serveCd = SERVE_MS
  }
}

/**
 * Advance one fixed step by `dt` ms under the held input (copy-on-write).
 * @param state - the match state (never mutated).
 * @param dt - elapsed milliseconds (clamp upstream).
 * @param input - pointer target x and/or held left/right keys.
 * @returns the new state.
 */
export function step(state: PongState, dt: number, input: PongInput): PongState {
  if (state.over !== null) return state
  const s: PongState = { ...state, ball: { ...state.ball } }
  const dtSec = dt / 1000

  // Player paddle: pointer sets the chase target; keys nudge it.
  if (input.playerX !== undefined) s.targetX = input.playerX
  if (input.left) s.targetX -= KEY_SPEED * dtSec
  if (input.right) s.targetX += KEY_SPEED * dtSec
  s.targetX = clampPaddleX(s.targetX)
  const pDx = s.targetX - s.playerX
  const pStep = Math.min(Math.abs(pDx), PLAYER_SPEED * dtSec)
  s.playerX += Math.sign(pDx) * pStep

  // Serve countdown: paddles keep moving, the ball parks at center.
  if (s.serveCd > 0) {
    s.serveCd -= dt
    if (s.serveCd <= 0) {
      s.serveCd = 0
      serve(s)
    }
    return s
  }

  // AI paddle: track the ball while it approaches, otherwise drift to center;
  // capped speed plus a reaction dead-zone keep it beatable.
  const aiAim = s.ball.vy < 0 ? s.ball.x : W / 2
  const aiDx = aiAim - s.aiX
  if (Math.abs(aiDx) > AI_DEAD_ZONE) {
    const aiStep = Math.min(Math.abs(aiDx), AI_SPEED * dtSec)
    s.aiX = clampPaddleX(s.aiX + Math.sign(aiDx) * aiStep)
  }

  // Ball: move, then resolve walls, paddles, and goals in order.
  s.ball.x += s.ball.vx * dtSec
  s.ball.y += s.ball.vy * dtSec
  bounceWalls(s.ball)

  // Player paddle (bottom): only a ball moving down can bounce off it.
  if (
    s.ball.vy > 0 &&
    s.ball.y + BALL_R >= PLAYER_Y && s.ball.y - BALL_R <= PLAYER_Y + PADDLE_H &&
    Math.abs(s.ball.x - s.playerX) <= PADDLE_W / 2 + BALL_R
  ) {
    const speed = nextSpeed(Math.hypot(s.ball.vx, s.ball.vy))
    const v = paddleReflect(s.playerX, s.ball.x, speed, -1)
    s.ball.vx = v.vx
    s.ball.vy = v.vy
    s.ball.y = PLAYER_Y - BALL_R
    s.rally += 1
  }

  // AI paddle (top): only a ball moving up can bounce off it.
  if (
    s.ball.vy < 0 &&
    s.ball.y - BALL_R <= AI_Y + PADDLE_H && s.ball.y + BALL_R >= AI_Y &&
    Math.abs(s.ball.x - s.aiX) <= PADDLE_W / 2 + BALL_R
  ) {
    const speed = nextSpeed(Math.hypot(s.ball.vx, s.ball.vy))
    const v = paddleReflect(s.aiX, s.ball.x, speed, 1)
    s.ball.vx = v.vx
    s.ball.vy = v.vy
    s.ball.y = AI_Y + PADDLE_H + BALL_R
    s.rally += 1
  }

  // Goals: fully past a goal line scores for the other side.
  if (s.ball.y + BALL_R < 0) scoreGoal(s, 'player')
  else if (s.ball.y - BALL_R > H) scoreGoal(s, 'ai')

  return s
}
