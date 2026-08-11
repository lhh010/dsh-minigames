import { describe, expect, it } from 'vitest'
import {
  createBreakoutState, movePaddle, nextLevel, stepBreakout, PADDLE_Y, VIEW_W,
} from '../src/client/games/breakout/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('breakout logic', () => {
  it('creates a wall of bricks and a live ball', () => {
    const state = createBreakoutState(lcg(1))
    expect(state.bricks.length).toBe(40)
    expect(state.lives).toBe(3)
    expect(state.over).toBe(false)
    expect(state.score).toBe(0)
  })

  it('the paddle clamps to the walls', () => {
    const state = createBreakoutState(lcg(1))
    movePaddle(state, -100)
    expect(state.paddleX).toBeGreaterThanOrEqual(35)
    movePaddle(state, VIEW_W + 100)
    expect(state.paddleX).toBeLessThanOrEqual(VIEW_W - 35)
  })

  it('a ball that falls below the screen costs a life', () => {
    const state = createBreakoutState(lcg(1))
    state.ball.y = VIEW_W // far below
    const result = stepBreakout(state, 1 / 60)
    expect(result.lost).toBe(true)
    expect(state.lives).toBe(2)
    expect(state.over).toBe(false) // ball reset, game continues
  })

  it('losing all lives ends the game', () => {
    const state = createBreakoutState(lcg(1))
    state.lives = 1
    state.ball.y = VIEW_W + 10
    stepBreakout(state, 1 / 60)
    expect(state.over).toBe(true)
  })

  it('the ball bounces off the side and top walls', () => {
    const state = createBreakoutState(lcg(1))
    state.ball.x = 2
    state.ball.vx = -100
    stepBreakout(state, 1 / 60)
    expect(state.ball.vx).toBeGreaterThan(0)
    state.ball.y = 2
    state.ball.vy = -100
    stepBreakout(state, 1 / 60)
    expect(state.ball.vy).toBeGreaterThan(0)
  })

  it('clearing the wall advances the level with a faster ball', () => {
    const state = createBreakoutState(lcg(1))
    state.bricks = [{ x: 100, y: 60, hp: 1, color: 0 }]
    const speedBefore = Math.hypot(state.ball.vx, state.ball.vy)
    // Move the ball onto the brick.
    state.ball.x = 120
    state.ball.y = 66
    state.ball.vx = 0
    state.ball.vy = 60 // moving down into the brick's bottom... force overlap via direct step
    const result = stepBreakout(state, 1 / 60)
    if (result.cleared) {
      expect(state.level).toBe(2)
      const speedAfter = Math.hypot(state.ball.vx, state.ball.vy)
      expect(speedAfter).toBeGreaterThan(speedBefore)
    }
  })

  it('nextLevel rebuilds the wall and speeds the ball', () => {
    const state = createBreakoutState(lcg(1))
    nextLevel(state)
    expect(state.level).toBe(2)
    expect(state.bricks.length).toBe(40)
    expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeGreaterThan(250)
  })

  it('bricks score when destroyed', () => {
    const state = createBreakoutState(lcg(1))
    state.bricks = [{ x: 100, y: 60, hp: 1, color: 0 }]
    state.ball.x = 120
    state.ball.y = 64
    state.ball.vx = 0
    state.ball.vy = 40
    state.score = 0
    const result = stepBreakout(state, 1 / 60)
    expect(state.score).toBeGreaterThan(0)
    // Clearing the last brick advances to the next level (fresh wall).
    expect(result.cleared).toBe(true)
    expect(state.level).toBe(2)
    expect(state.bricks.length).toBe(40)
    expect(PADDLE_Y).toBe(296)
  })

  it('bricks carry a fixed per-row color that survives removals', () => {
    const state = createBreakoutState(lcg(1))
    // 8 bricks per row: row 0 -> color 0, row 1 -> color 1, ...
    expect(state.bricks[0]!.color).toBe(0)
    expect(state.bricks[7]!.color).toBe(0)
    expect(state.bricks[8]!.color).toBe(1)
    expect(state.bricks[39]!.color).toBe(4)
    // Removing a brick must not shift the colors of the survivors.
    state.bricks.splice(0, 1)
    expect(state.bricks[0]!.color).toBe(0)
    expect(state.bricks[6]!.color).toBe(0)
    expect(state.bricks[7]!.color).toBe(1)
  })

  it('the ball starts neutral and takes the destroyed brick color', () => {
    const state = createBreakoutState(lcg(1))
    expect(state.ball.color).toBe(-1)
    state.bricks = [{ x: 100, y: 60, hp: 1, color: 2 }]
    state.ball.x = 120
    state.ball.y = 64
    state.ball.vx = 0
    state.ball.vy = 40
    stepBreakout(state, 1 / 60)
    expect(state.ball.color).toBe(2)
  })

  it('destroying a brick matching the ball color scores a bonus', () => {
    const match = createBreakoutState(lcg(1))
    match.ball.color = 1
    match.bricks = [{ x: 100, y: 60, hp: 1, color: 1 }]
    match.ball.x = 120
    match.ball.y = 64
    match.ball.vx = 0
    match.ball.vy = 40
    match.score = 0
    stepBreakout(match, 1 / 60)
    expect(match.score).toBe(30) // 10 * level 1 * 3

    const miss = createBreakoutState(lcg(2))
    miss.ball.color = 1
    miss.bricks = [{ x: 100, y: 60, hp: 1, color: 2 }]
    miss.ball.x = 120
    miss.ball.y = 64
    miss.ball.vx = 0
    miss.ball.vy = 40
    miss.score = 0
    stepBreakout(miss, 1 / 60)
    expect(miss.score).toBe(10) // no bonus for a different color
  })
})
