import { describe, expect, it } from 'vitest'
import {
  createColorLinesState, emptyCells, findClearing, hasPath, moveBall, scoreForLine,
  spawnBalls, SIZE, SPAWN_PER_TURN,
  type ColorLinesState, type Position,
} from '../src/client/games/colorlines/logic.ts'

/** Deterministic LCG so random boards are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** A state with an empty board and the given rng (for hand-built boards). */
const LAST_COL = SIZE - 1

function blankState(rng: () => number = lcg(7)): ColorLinesState {
  return { grid: Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0)), score: 0, over: false, rng }
}

function put(grid: number[][], r: number, c: number, color: number): void {
  grid[r]![c] = color
}

describe('colorlines (五连珠) logic', () => {
  it('opens with an empty-board spawn of 3 balls', () => {
    const state = createColorLinesState(lcg(1))
    const balls = state.grid.flat().filter(v => v !== 0).length
    expect(balls).toBe(SPAWN_PER_TURN)
    expect(emptyCells(state.grid).length).toBe(SIZE * SIZE - SPAWN_PER_TURN)
    expect(state.over).toBe(false)
  })

  it('spawns exactly 3 per turn and fewer only when the board runs out', () => {
    const state = blankState(lcg(3))
    expect(spawnBalls(state)).toBe(3)
    const after3 = emptyCells(state.grid).length
    expect(after3).toBe(SIZE * SIZE - 3)
    // Leave one empty cell: only one more ball fits.
    for (const cell of emptyCells(state.grid).slice(1)) put(state.grid, cell.r, cell.c, 1)
    expect(spawnBalls(state)).toBe(1)
    expect(emptyCells(state.grid).length).toBe(0)
  })

  it('finds an unblocked orthogonal path and rejects a blocked one', () => {
    const grid = blankState().grid
    put(grid, 0, 0, 1)
    put(grid, 0, 4, 0) // destination stays empty
    expect(hasPath(grid, { r: 0, c: 0 }, { r: 0, c: 4 })).toBe(true)
    expect(hasPath(grid, { r: 0, c: 0 }, { r: 8, c: 8 })).toBe(true)
    // A full-height wall across column 3 fully separates the two halves.
    for (let r = 0; r < SIZE; r += 1) put(grid, r, 3, 2)
    expect(hasPath(grid, { r: 0, c: 0 }, { r: 0, c: 4 })).toBe(false)
    expect(hasPath(grid, { r: 0, c: 0 }, { r: 4, c: 8 })).toBe(false)
    // A partial wall leaves a detour through the gap.
    const gapped = blankState().grid
    put(gapped, 0, 0, 1)
    for (let r = 0; r < SIZE - 1; r += 1) put(gapped, r, 3, 2)
    expect(hasPath(gapped, { r: 0, c: 0 }, { r: 4, c: 8 })).toBe(true)
    // Full enclosure → unreachable.
    const cage = blankState().grid
    put(cage, 4, 4, 1)
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const) {
      put(cage, 4 + dr, 4 + dc, 2)
    }
    expect(hasPath(cage, { r: 4, c: 4 }, { r: 0, c: 0 })).toBe(false)
    // Moving onto an occupied cell or from an empty cell is illegal.
    const occupied = blankState().grid
    put(occupied, 0, 0, 1)
    put(occupied, 0, 1, 2)
    expect(hasPath(occupied, { r: 0, c: 0 }, { r: 0, c: 1 })).toBe(false)
    expect(hasPath(occupied, { r: 5, c: 5 }, { r: 5, c: 6 })).toBe(false)
  })

  it('detects 5+ runs of one color in all 4 line directions', () => {
    const horizontal = blankState().grid
    for (let c = 2; c <= 6; c += 1) put(horizontal, 4, c, 1) // exactly 5
    expect(findClearing(horizontal).cells.length).toBe(5)

    const vertical = blankState().grid
    for (let r = 0; r < 5; r += 1) put(vertical, r, 3, 2)
    expect(findClearing(vertical).cells).toHaveLength(5)

    const diag = blankState().grid
    for (let i = 0; i < 5; i += 1) put(diag, i, i + 2, 3) // \
    expect(findClearing(diag).cells).toHaveLength(5)

    const anti = blankState().grid
    for (let i = 0; i < 5; i += 1) put(anti, i, 6 - i, 4) // /
    expect(findClearing(anti).cells).toHaveLength(5)

    // A length-7 run clears 7 cells and scores the 7-row.
    const seven = blankState().grid
    for (let c = 0; c < 7; c += 1) put(seven, 2, c, 5)
    const found = findClearing(seven)
    expect(found.cells).toHaveLength(7)
    expect(found.gained).toBe(scoreForLine(7))

    // Exactly 4 does not clear.
    const four = blankState().grid
    for (let c = 0; c < 4; c += 1) put(four, 1, c, 1)
    expect(findClearing(four).cells).toHaveLength(0)
  })

  it('scores cleared lines per the 10×n×(n−4) table', () => {
    expect(scoreForLine(5)).toBe(50)
    expect(scoreForLine(6)).toBe(120)
    expect(scoreForLine(7)).toBe(210)
    expect(scoreForLine(8)).toBe(320)
    expect(scoreForLine(4)).toBe(0)
  })

  it('moves legally, clears, and skips the spawn on a clearing turn', () => {
    const state = blankState(lcg(11))
    // 4 reds in row 0 cols 0..3; the movable red sits at row 1 col 0.
    for (let c = 0; c < 4; c += 1) put(state.grid, 0, c, 1)
    put(state.grid, 1, 0, 1)
    const result = moveBall(state, { r: 1, c: 0 }, { r: 0, c: 4 })
    expect(result.moved).toBe(true)
    expect(result.cleared).toHaveLength(5)
    expect(result.gained).toBe(50)
    expect(state.score).toBe(50)
    // Clearing turn: nothing respawned (board returns to fully empty).
    expect(emptyCells(state.grid).length).toBe(SIZE * SIZE)
  })

  it('spawns 3 after a non-clearing move and ends the game on a full board', () => {
    const state = blankState(lcg(5))
    put(state.grid, 0, 0, 1)
    const before = emptyCells(state.grid).length
    expect(moveBall(state, { r: 0, c: 0 }, { r: 8, c: 8 }).moved).toBe(true)
    // The move keeps the empty count; the turn's spawn removes 3 more.
    expect(emptyCells(state.grid).length).toBe(before - 3)

    // Fill the board with a 5-color pattern whose cells differ in all 4
    // line directions (no line possible), leaving one empty cell next to the
    // moved ball; after the non-clearing turn the origin cell is respawned
    // into, the board is full, and the game is over.
    const pattern = (r: number, c: number): number => ((r + 2 * c) % 5) + 1
    const full = blankState(lcg(9))
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (r === 0 && c === LAST_COL) continue // the one empty destination
        put(full.grid, r, c, pattern(r, c))
      }
    }
    const last: Position = { r: 0, c: LAST_COL }
    const res = moveBall(full, { r: 0, c: LAST_COL - 1 }, last)
    expect(res.moved).toBe(true)
    expect(res.cleared.length).toBe(0)
    expect(full.over).toBe(true)
    expect(emptyCells(full.grid).length).toBe(0)
    // No further moves after game over.
    expect(moveBall(full, last, { r: 0, c: 0 }).moved).toBe(false)
  })

  it('is deterministic under a seeded rng', () => {
    const a = createColorLinesState(lcg(42))
    const b = createColorLinesState(lcg(42))
    expect(a.grid).toEqual(b.grid)
    const move = (s: ColorLinesState): void => {
      const ball = { r: 0, c: 0 }
      const dest = { r: 8, c: 8 }
      if (s.grid[0]![0] === 0) put(s.grid, 0, 0, 1)
      else if (s.grid[8]![8] !== 0) return
      moveBall(s, ball, dest)
    }
    move(a)
    move(b)
    expect(a.grid).toEqual(b.grid)
    expect(a.score).toBe(b.score)
  })
})
