import { describe, expect, it } from 'vitest'
import {
  LEVEL_TIME_S, MAX_SIZE, MIN_SIZE, WIN_SCORE, advanceLevel, checkWin, connectedCells,
  createPipesState, generateLevel, hasOpening, levelSize, openings, rotateTile, tick,
  type PipeTile,
} from '../src/client/games/pipes/logic.ts'

/** Deterministic mulberry32 rng. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Apply the tracked known-good rotations to a state's board. */
function applySolution(state: ReturnType<typeof createPipesState>): void {
  const { tiles, solution } = state.board
  for (let r = 0; r < tiles.length; r += 1) {
    for (let c = 0; c < tiles.length; c += 1) tiles[r]![c]!.rotation = solution[r]![c]!
  }
}

describe('pipes logic', () => {
  it('sizes boards 5..8, +1 every 3 levels', () => {
    expect(levelSize(1)).toBe(MIN_SIZE)
    expect(levelSize(3)).toBe(5)
    expect(levelSize(4)).toBe(6)
    expect(levelSize(7)).toBe(7)
    expect(levelSize(10)).toBe(MAX_SIZE)
    expect(levelSize(50)).toBe(MAX_SIZE)
  })

  it('computes openings with clockwise rotation', () => {
    const straight: PipeTile = { type: 'straight', rotation: 0 } // up|down
    expect(openings(straight)).toBe(0b0101)
    expect(openings({ ...straight, rotation: 1 })).toBe(0b1010) // right|left
    expect(openings({ ...straight, rotation: 2 })).toBe(0b0101) // 180° = same
    const elbow: PipeTile = { type: 'elbow', rotation: 0 } // up|right
    expect(openings(elbow)).toBe(0b0011)
    expect(openings({ ...elbow, rotation: 1 })).toBe(0b0110) // right|down
    expect(hasOpening({ ...elbow, rotation: 3 }, 0)).toBe(true) // left|up
    expect(openings({ type: 'cross', rotation: 3 })).toBe(0b1111) // rotation-invariant
  })

  it('generates solvable levels: the known-good config always wins', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const state = createPipesState(1, 0, mulberry32(seed))
      const { board } = state
      expect(board.source.c).toBe(0)
      expect(board.sink.c).toBe(board.size - 1)
      // A fresh board must not start already connected.
      expect(checkWin(state)).toBe(false)
      applySolution(state)
      expect(checkWin(state)).toBe(true)
      expect(state.score).toBe(WIN_SCORE)
    }
  })

  it('is deterministic under a seeded rng', () => {
    const a = generateLevel(6, mulberry32(42))
    const b = generateLevel(6, mulberry32(42))
    expect(a).toEqual(b)
    const c = generateLevel(6, mulberry32(43))
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('rotates playable tiles and refuses fixed tiles and out-of-range cells', () => {
    const state = createPipesState(1, 0, mulberry32(7))
    const { board } = state
    // Find a guaranteed rotatable tile (not source/sink/cross).
    let target: { r: number; c: number } | null = null
    outer: for (let r = 0; r < board.size; r += 1) {
      for (let c = 0; c < board.size; c += 1) {
        const t = board.tiles[r]![c]!
        if (t.type !== 'source' && t.type !== 'sink' && t.type !== 'cross') {
          target = { r, c }
          break outer
        }
      }
    }
    expect(target).not.toBeNull()
    const before = board.tiles[target!.r]![target!.c]!.rotation
    expect(rotateTile(state, target!.r, target!.c)).toBe(true)
    expect(board.tiles[target!.r]![target!.c]!.rotation).toBe((before + 1) % 4)
    expect(rotateTile(state, board.source.r, board.source.c)).toBe(false) // source fixed
    expect(rotateTile(state, board.sink.r, board.sink.c)).toBe(false) // sink fixed
    expect(rotateTile(state, -1, 0)).toBe(false) // out of bounds
    expect(rotateTile(state, 0, 99)).toBe(false)
  })

  it('runs BFS connectivity only through matching openings', () => {
    // Hand-built 2x2: source (0,0) opens right; straight at (0,1) rotated to
    // up|down blocks; rotated to right|left reaches the sink... sink is
    // placed at (1,1) opening up.
    const tiles: PipeTile[][] = [
      [{ type: 'source', rotation: 0 }, { type: 'straight', rotation: 1 }],
      [{ type: 'straight', rotation: 0 }, { type: 'sink', rotation: 1 }],
    ]
    // source opens right(1); (0,1) opens right|left; sink base left rotated 1
    // → opens up. (0,1)→(1,1) needs (0,1) to open down — blocked.
    const blocked = connectedCells(tiles, 2, { r: 0, c: 0 })
    expect(blocked[0]![1]).toBe(true)
    expect(blocked[1]![1]).toBe(false)
    // Elbow at (0,1) opening down|left connects through to the sink.
    tiles[0]![1] = { type: 'elbow', rotation: 2 } // down|left
    const open = connectedCells(tiles, 2, { r: 0, c: 0 })
    expect(open[1]![1]).toBe(true)
  })

  it('awards the win once and advances to a bigger board', () => {
    const state = createPipesState(1, 0, mulberry32(11))
    applySolution(state)
    expect(checkWin(state)).toBe(true)
    expect(checkWin(state)).toBe(false) // no double-scoring while 'won'
    expect(state.score).toBe(WIN_SCORE)
    advanceLevel(state)
    expect(state.level).toBe(2)
    expect(state.status).toBe('playing')
    expect(state.timeLeft).toBe(LEVEL_TIME_S)
    expect(state.board.size).toBe(5) // level 2 still 5x5
    advanceLevel(state) // not 'won': no-op
    expect(state.level).toBe(2)
  })

  it('counts down and ends the game at zero; frozen while not playing', () => {
    const state = createPipesState(1, 0, mulberry32(3))
    tick(state, 10)
    expect(state.timeLeft).toBeCloseTo(LEVEL_TIME_S - 10, 6)
    for (let i = 0; i < 100; i += 1) tick(state, 1)
    expect(state.status).toBe('over')
    expect(state.timeLeft).toBe(0)
    tick(state, 5) // over: timer frozen
    expect(state.timeLeft).toBe(0)
    rotateTile(state, 0, 1) // over: input frozen
    // 'won' also freezes the countdown.
    const won = createPipesState(1, 0, mulberry32(5))
    applySolution(won)
    checkWin(won)
    tick(won, 50)
    expect(won.timeLeft).toBe(LEVEL_TIME_S)
  })
})
