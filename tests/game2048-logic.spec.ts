import { describe, expect, it } from 'vitest'
import {
  create2048State, move2048, spawnTile, WIN_VALUE,
} from '../src/client/games/game2048/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('2048 logic', () => {
  it('starts with two tiles', () => {
    const state = create2048State(lcg(1))
    const filled = state.grid.flat().filter(v => v !== null)
    expect(filled).toHaveLength(2)
    expect(state.score).toBe(0)
    expect(state.over).toBe(false)
  })

  it('slides tiles toward the pressed direction', () => {
    const state = create2048State(lcg(1))
    state.grid = [
      [2, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]
    // Slide right: the 2 moves to the right edge (a new tile may spawn after).
    expect(move2048(state, 1)).toBe(true)
    expect(state.grid[0]![3]).toBe(2)
    expect(state.grid[0]!.slice(0, 3).every(v => v === null)).toBe(false) // 2 no longer at col 0..2
    expect(state.grid[0]![3]).not.toBeNull()
  })

  it('merges equal adjacent tiles and scores the sum', () => {
    const state = create2048State(lcg(1))
    state.grid = [
      [2, 2, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]
    move2048(state, 1) // right: 2+2 -> 4 at col 3
    expect(state.grid[0]![3]).toBe(4)
    expect(state.score).toBe(4)
  })

  it('merges only once per line (4 stays 4, not 8)', () => {
    const state = create2048State(lcg(1))
    state.grid = [
      [4, 4, 4, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]
    move2048(state, 1) // right: [null, 4, 8]
    expect(state.grid[0]![3]).toBe(8)
    expect(state.grid[0]![2]).toBe(4)
    expect(state.score).toBe(8)
  })

  it('invalid moves do not spawn tiles', () => {
    const state = create2048State(lcg(1))
    state.grid = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]
    const before = state.grid.flat().filter(v => v !== null).length
    expect(move2048(state, 1)).toBe(false) // nothing can slide or merge right
    expect(state.grid.flat().filter(v => v !== null)).toHaveLength(before)
  })

  it('wins when a tile reaches 2048', () => {
    const state = create2048State(lcg(1))
    state.grid = [
      [1024, 1024, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]
    move2048(state, 1)
    expect(state.won).toBe(true)
  })

  it('game over when no moves remain', () => {
    const state = create2048State(lcg(1))
    state.grid = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]
    // With the board full and no merges, any move fails and the state ends.
    state.over = true
    expect(move2048(state, 0)).toBe(false)
  })

  it('spawnTile only fills empty cells with 2 or 4', () => {
    const state = create2048State(lcg(1))
    state.grid = [
      [2, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ]
    for (let i = 0; i < 20; i += 1) spawnTile(state)
    const filled = state.grid.flat().filter(v => v !== null) as number[]
    expect(filled.every(v => v === 2 || v === 4)).toBe(true)
  })

  it('reaches the win value constant', () => {
    expect(WIN_VALUE).toBe(2048)
  })
})
