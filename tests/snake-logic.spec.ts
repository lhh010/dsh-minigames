import { describe, expect, it } from 'vitest'
import {
  createSnakeState, placeFood, stepSnake, turn,
} from '../src/client/games/snake/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('snake logic', () => {
  it('creates a snake with food on the board', () => {
    const state = createSnakeState(lcg(1))
    expect(state.snake).toHaveLength(3)
    expect(state.dir).toBe(1)
    expect(state.over).toBe(false)
    expect(state.food.r).toBeGreaterThanOrEqual(0)
    expect(state.food.c).toBeGreaterThanOrEqual(0)
  })

  it('moves forward each tick', () => {
    const state = createSnakeState(lcg(1))
    const head = state.snake[0]!
    stepSnake(state)
    expect(state.snake[0]!.r).toBe(head.r)
    expect(state.snake[0]!.c).toBe(head.c + 1)
    expect(state.snake).toHaveLength(3) // no food, tail moves
  })

  it('grows and scores when eating food', () => {
    const state = createSnakeState(lcg(1))
    state.snake = [{ r: 2, c: 3 }, { r: 2, c: 2 }, { r: 2, c: 1 }]
    state.dir = 1
    state.food = { r: 2, c: 4 }
    stepSnake(state)
    expect(state.score).toBe(1)
    expect(state.snake).toHaveLength(4)
    expect(state.snake[0]).toEqual({ r: 2, c: 4 })
  })

  it('wraps around the wall to the opposite side', () => {
    const state = createSnakeState(lcg(1))
    state.snake = [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }]
    state.dir = 0 // up over the top edge
    stepSnake(state)
    expect(state.over).toBe(false)
    expect(state.snake[0]).toEqual({ r: state.rows - 1, c: 0 }) // mirrored at the bottom
  })

  it('wraps horizontally as well', () => {
    const state = createSnakeState(lcg(1))
    state.snake = [{ r: 0, c: state.cols - 1 }, { r: 0, c: state.cols - 2 }, { r: 0, c: state.cols - 3 }]
    state.dir = 1 // right over the right edge
    stepSnake(state)
    expect(state.over).toBe(false)
    expect(state.snake[0]).toEqual({ r: 0, c: 0 }) // mirrored at the left edge
  })

  it('dies on its own body', () => {
    const state = createSnakeState(lcg(1))
    // Head at (3,3) moving down into the neck segment at (4,3) — not the tail.
    state.snake = [{ r: 3, c: 3 }, { r: 3, c: 2 }, { r: 4, c: 2 }, { r: 4, c: 3 }, { r: 5, c: 3 }]
    state.dir = 2
    stepSnake(state)
    expect(state.over).toBe(true)
  })

  it('allows moving into the vacating tail when not growing', () => {
    const state = createSnakeState(lcg(1))
    // Head at (3,3) moving left into the tail at (3,2), which vacates this tick.
    state.snake = [{ r: 3, c: 3 }, { r: 4, c: 3 }, { r: 4, c: 2 }, { r: 3, c: 2 }]
    state.dir = 3
    stepSnake(state)
    expect(state.over).toBe(false)
    expect(state.snake[0]).toEqual({ r: 3, c: 2 })
  })

  it('rejects a 180-degree reversal', () => {
    const state = createSnakeState(lcg(1))
    state.dir = 1 // moving right
    turn(state, 3) // try left
    expect(state.dir).toBe(1)
    turn(state, 0) // up is fine
    expect(state.dir).toBe(0)
  })

  it('food never spawns on the snake', () => {
    const state = createSnakeState(lcg(1))
    for (let i = 0; i < 50; i += 1) {
      placeFood(state)
      const onSnake = state.snake.some(p => p.r === state.food.r && p.c === state.food.c)
      expect(onSnake).toBe(false)
    }
  })
})
