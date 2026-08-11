/**
 * Breakout pure logic: a paddle, a ball, and a brick wall. The ball bounces
 * off the paddle (with angle depending on the hit position) and off bricks,
 * which are destroyed on hit. Each brick row has a fixed color; the ball takes
 * the color of the last brick it destroyed, and destroying a brick that
 * matches the ball color scores a bonus. Losing the ball ends the run;
 * clearing the wall moves to the next level with a faster ball. Deterministic
 * functions over a plain state object.
 */

export interface Brick { x: number; y: number; hp: number; color: number }

export interface BreakoutState {
  /** Paddle centre x. */
  paddleX: number
  ball: { x: number; y: number; vx: number; vy: number; color: number }
  bricks: Brick[]
  score: number
  level: number
  lives: number
  over: boolean
  rng: () => number
}

export const VIEW_W = 480
export const VIEW_H = 320
export const PADDLE_W = 70
export const PADDLE_Y = VIEW_H - 24
export const BALL_R = 6
export const BRICK_W = 48
export const BRICK_H = 16
export const BRICK_ROWS = 5
export const BRICK_COLS = 8
const BRICK_GAP = 6
const BRICK_TOP = 36
/** Score multiplier when the destroyed brick matches the ball color. */
export const MATCH_BONUS = 3

/** The 5 brick rows, one color per row; the ball takes this palette too. */
export const BRICK_COLORS = ['#4c9ae8', '#4cd0c9', '#5abf6b', '#e8c84c', '#e88a4c'] as const

function buildWall(): Brick[] {
  const bricks: Brick[] = []
  for (let r = 0; r < BRICK_ROWS; r += 1) {
    for (let c = 0; c < BRICK_COLS; c += 1) {
      bricks.push({
        x: 24 + c * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        hp: 1,
        color: r,
      })
    }
  }
  return bricks
}

/** A fresh level-1 wall. */
export function createBreakoutState(rng: () => number = Math.random): BreakoutState {
  return {
    paddleX: VIEW_W / 2,
    ball: { x: VIEW_W / 2, y: PADDLE_Y - 16, vx: 140, vy: -200, color: -1 },
    bricks: buildWall(),
    score: 0,
    level: 1,
    lives: 3,
    over: false,
    rng,
  }
}

/** Rebuild the wall for the next level with a faster ball. */
export function nextLevel(state: BreakoutState): void {
  state.level += 1
  state.bricks = buildWall()
  state.ball.x = state.paddleX
  state.ball.y = PADDLE_Y - 16
  const speed = 250 + state.level * 20
  state.ball.vx = speed * (state.rng() < 0.5 ? -0.7 : 0.7)
  state.ball.vy = -Math.sqrt(speed * speed - state.ball.vx * state.ball.vx)
}

/** Move the paddle towards a target x (clamped to the walls). */
export function movePaddle(state: BreakoutState, targetX: number): void {
  state.paddleX = Math.max(PADDLE_W / 2, Math.min(VIEW_W - PADDLE_W / 2, targetX))
}

/**
 * Advance one frame. Returns the ball state for rendering: { lost, cleared }.
 */
export function stepBreakout(state: BreakoutState, dt: number): { lost: boolean; cleared: boolean } {
  if (state.over) return { lost: false, cleared: false }
  const ball = state.ball
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  // Wall bounce (left/right/top).
  if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) }
  if (ball.x + BALL_R > VIEW_W) { ball.x = VIEW_W - BALL_R; ball.vx = -Math.abs(ball.vx) }
  if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) }

  // Paddle bounce: angle depends on where the ball hits.
  if (ball.vy > 0 && ball.y + BALL_R >= PADDLE_Y - 4 && ball.y + BALL_R <= PADDLE_Y + 12
    && ball.x >= state.paddleX - PADDLE_W / 2 - BALL_R && ball.x <= state.paddleX + PADDLE_W / 2 + BALL_R) {
    const rel = (ball.x - state.paddleX) / (PADDLE_W / 2)
    const speed = Math.hypot(ball.vx, ball.vy)
    ball.vx = rel * speed * 0.85
    ball.vy = -Math.abs(Math.sqrt(speed * speed - ball.vx * ball.vx))
    ball.y = PADDLE_Y - 4 - BALL_R
  }

  // Brick collision.
  let cleared = false
  for (let i = 0; i < state.bricks.length; i += 1) {
    const brick = state.bricks[i]!
    if (ball.x + BALL_R > brick.x && ball.x - BALL_R < brick.x + BRICK_W
      && ball.y + BALL_R > brick.y && ball.y - BALL_R < brick.y + BRICK_H) {
      // Determine which side was hit by the deeper penetration.
      const dx = ball.x - (brick.x + BRICK_W / 2)
      const dy = ball.y - (brick.y + BRICK_H / 2)
      if (Math.abs(dx / (BRICK_W / 2)) > Math.abs(dy / (BRICK_H / 2))) {
        ball.vx = ball.vx > 0 ? -Math.abs(ball.vx) : Math.abs(ball.vx)
      } else {
        ball.vy = ball.vy > 0 ? -Math.abs(ball.vy) : Math.abs(ball.vy)
      }
      brick.hp -= 1
      if (brick.hp <= 0) {
        state.bricks.splice(i, 1)
        const base = 10 * state.level
        // Matching the ball's color scores a bonus; the ball then takes the
        // destroyed brick's color, so consecutive same-color hits chain.
        state.score += state.ball.color === brick.color ? base * MATCH_BONUS : base
        state.ball.color = brick.color
      }
      if (state.bricks.length === 0) {
        nextLevel(state)
        cleared = true
      }
      break
    }
  }

  // Lost the ball.
  if (ball.y - BALL_R > VIEW_H) {
    state.lives -= 1
    if (state.lives <= 0) {
      state.over = true
    } else {
      state.ball.x = state.paddleX
      state.ball.y = PADDLE_Y - 16
      state.ball.vx = 140
      state.ball.vy = -200
    }
    return { lost: true, cleared }
  }
  return { lost: false, cleared }
}
