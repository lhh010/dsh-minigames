import { describe, expect, it } from 'vitest'
import {
  chooseAiMove, createOthelloState, flipsAt, legalMoves, passTurn, place,
  SIZE,
} from '../src/client/games/othello/logic.ts'
import type { Cell, OthelloState } from '../src/client/games/othello/logic.ts'

/** Build a board from 8-char rows: `.` empty, `B` black, `W` white. */
function boardFrom(rows: string[]): Cell[][] {
  return rows.map(line =>
    line.split('').map(ch => (ch === 'B' ? 1 : ch === 'W' ? 2 : 0)),
  )
}

/** A minimal state for hand-built boards. */
function stateFrom(board: Cell[][], turn: 1 | 2): OthelloState {
  return { board, turn, winner: 0, over: false, passes: 0 }
}

describe('othello logic', () => {
  it('creates the classic four-disc opening with black to move', () => {
    const state = createOthelloState()
    expect(state.board[3]![3]).toBe(1)
    expect(state.board[4]![4]).toBe(1)
    expect(state.board[3]![4]).toBe(2)
    expect(state.board[4]![3]).toBe(2)
    expect(state.turn).toBe(1)
    expect(state.over).toBe(false)
  })

  it('the opening position has exactly four legal black moves', () => {
    const state = createOthelloState()
    expect(legalMoves(state, 1).length).toBe(4)
  })

  it('flipsAt returns the flanked discs along one line', () => {
    const board = boardFrom([
      'BWW......',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ])
    const flips = flipsAt(board, 0, 3, 1)
    expect(flips).toEqual([[0, 2], [0, 1]])
  })

  it('place flips the flanked discs and switches the turn', () => {
    // A line `B W W .` — playing the far end flips both whites.
    const s = stateFrom(boardFrom([
      '........',
      '........',
      '..BWW...',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]), 1)
    expect(place(s, 2, 5)).toBe(true)
    expect(s.board[2]![3]).toBe(1)
    expect(s.board[2]![4]).toBe(1)
    expect(s.board[2]![5]).toBe(1)
    expect(s.turn).toBe(2)
  })

  it('an illegal move is rejected without changing the board', () => {
    const state = createOthelloState()
    const before = state.board.map(row => [...row])
    expect(place(state, 0, 0)).toBe(false)
    expect(state.board).toEqual(before)
  })

  it('a side with no legal move passes automatically', () => {
    // Black has one disc and no flanking move; white can still play at (7,7).
    const s = stateFrom(boardFrom([
      'WWWWWWWW',
      'WWWWWWWW',
      'WWWWWWWW',
      'WWWWWWWW',
      'WWWWWWWW',
      'WWWWWWWW',
      'WWWWWWWW',
      'WWWWWWB.',
    ]), 1)
    expect(legalMoves(s, 1).length).toBe(0)
    passTurn(s)
    expect(s.turn).toBe(2)
    expect(s.over).toBe(false)
  })

  it('two consecutive passes end the game and count discs', () => {
    const s = stateFrom(boardFrom([
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
    ]), 1)
    passTurn(s) // white has no move either
    passTurn(s)
    expect(s.over).toBe(true)
    expect(s.winner).toBe(1)
  })

  it('the heuristic picks an open corner when legal', () => {
    const s = stateFrom(boardFrom([
      '.WWB.....',
      '........',
      'B.W......',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]), 1)
    const move = chooseAiMove(s)
    expect(move).not.toBeNull()
    expect(legalMoves(s, 1).some(m => m.r === move!.r && m.c === move!.c)).toBe(true)
    // (0,0) is a legal corner grab and must win the heuristic.
    expect(move).toEqual({ r: 0, c: 0 })
  })

  it('AI has no move on a full board (passes)', () => {
    const s = stateFrom(boardFrom([
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
      'BBBBBBBB',
    ]), 2)
    expect(chooseAiMove(s)).toBeNull()
    expect(SIZE).toBe(8)
  })
})
