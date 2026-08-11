import { describe, expect, it } from 'vitest'
import {
  chooseAiMove, checkWin, createGomokuState, place, SIZE,
} from '../src/client/games/gomoku/logic.ts'

describe('gomoku logic', () => {
  it('creates an empty board with the player first', () => {
    const state = createGomokuState()
    expect(state.board.flat().every(v => v === 0)).toBe(true)
    expect(state.turn).toBe(1)
    expect(state.over).toBe(false)
  })

  it('alternates turns after a valid placement', () => {
    const state = createGomokuState()
    expect(place(state, 7, 7)).toBe(true)
    expect(state.board[7]![7]).toBe(1)
    expect(state.turn).toBe(2)
    expect(place(state, 7, 8)).toBe(true)
    expect(state.turn).toBe(1)
  })

  it('rejects placement on an occupied cell', () => {
    const state = createGomokuState()
    place(state, 7, 7)
    expect(place(state, 7, 7)).toBe(false)
    expect(state.turn).toBe(2) // unchanged
  })

  it('detects five in a row horizontally', () => {
    const state = createGomokuState()
    for (let c = 0; c < 5; c += 1) state.board[7]![c] = 1
    expect(checkWin(state.board, 7, 2)).toBe(true)
  })

  it('detects five in a row diagonally and ends the game', () => {
    const state = createGomokuState()
    for (let i = 0; i < 5; i += 1) state.board[5 + i]![5 + i] = 2
    expect(checkWin(state.board, 7, 7)).toBe(true)
    state.turn = 2
    place(state, 9, 9) // would be the 5th, but check already wins via state
    // Instead verify place() sets winner on the actual 5th move:
    const s2 = createGomokuState()
    for (let i = 0; i < 4; i += 1) {
      s2.board[3 + i]![3 + i] = 1
    }
    s2.turn = 1
    place(s2, 7, 7)
    expect(s2.over).toBe(true)
    expect(s2.winner).toBe(1)
  })

  it('AI takes the immediate winning move', () => {
    const state = createGomokuState()
    for (let c = 0; c < 4; c += 1) state.board[7]![c] = 2
    state.turn = 2
    const move = chooseAiMove(state)
    expect(move).not.toBeNull()
    expect(state.board[move!.r]![move!.c]).toBe(0)
    // Playing that move wins.
    state.board[move!.r]![move!.c] = 2
    expect(checkWin(state.board, move!.r, move!.c)).toBe(true)
  })

  it('AI blocks the player\'s immediate win', () => {
    const state = createGomokuState()
    for (let c = 0; c < 4; c += 1) state.board[7]![c] = 1
    state.turn = 2
    const move = chooseAiMove(state)
    expect(move).not.toBeNull()
    // The block is at one end of the run.
    expect(state.board[move!.r]![move!.c]).toBe(0)
    expect(move!.r).toBe(7)
    expect(move!.c === 4 || move!.c === -1 || move!.c === 5).toBe(true)
  })

  it('AI always returns a valid move on an open board', () => {
    const state = createGomokuState()
    place(state, 7, 7)
    place(state, 8, 8)
    const move = chooseAiMove(state)
    expect(move).not.toBeNull()
    expect(state.board[move!.r]![move!.c]).toBe(0)
    expect(move!.r).toBeGreaterThanOrEqual(0)
    expect(move!.r).toBeLessThan(SIZE)
  })
})
