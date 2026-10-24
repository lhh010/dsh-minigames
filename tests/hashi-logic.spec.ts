import { describe, expect, it } from 'vitest'
import {
  LEVEL_SIZES, bridgeBetween, bridgeKey, connectedCheck, countSolutions, cycleBridge, degrees,
  isSolved, legalLine, placedBridges, puzzleFromSeed, removeLastBridge,
  type Bridge, type HashiPuzzle, type Island, type Placed,
} from '../src/client/games/hashi/logic.ts'

/** Build a placed-bridge map from records (the encoding the game state uses). */
function toPlaced(bridges: Bridge[]): Placed {
  return new Map(bridges.map(b => [bridgeKey(b.a, b.b), b.count] as [string, 1 | 2]))
}

/** A puzzle from island positions and numbers; `bridges` is ignored by the solver. */
function puzzleOf(size: number, cells: [number, number, number][]): HashiPuzzle {
  const islands: Island[] = cells.map(([x, y, n]) => ({ x, y, n }))
  return { size, islands, bridges: [], unique: false }
}

/**
 * Independent crossing check (the rule under test, re-derived here so a logic
 * bug cannot validate itself): a horizontal and a vertical segment intersect
 * strictly inside both.
 */
function crosses(a: Island, b: Island, c: Island, d: Island): boolean {
  const h = a.y === b.y ? [a, b] : c.y === d.y ? [c, d] : null
  const v = a.x === b.x ? [a, b] : c.x === d.x ? [c, d] : null
  if (h === null || v === null || h[0] === v[0] || h[0] === v[1]) return false
  const hx = [Math.min(h[0]!.x, h[1]!.x), Math.max(h[0]!.x, h[1]!.x)]
  const vy = [Math.min(v[0]!.y, v[1]!.y), Math.max(v[0]!.y, v[1]!.y)]
  return hx[0]! < v[0]!.x && v[0]!.x < hx[1]! && vy[0]! < h[0]!.y && h[0]!.y < vy[1]!
}

/** Bridge ends per island, computed straight from the puzzle's own solution. */
function solutionDegrees(puzzle: HashiPuzzle): number[] {
  const deg = puzzle.islands.map(() => 0)
  for (const { a, b, count } of puzzle.bridges) {
    deg[a]! += count
    deg[b]! += count
  }
  return deg
}

// Level puzzles are generated once per module: the spec reuses them across the
// determinism, validity and uniqueness tests.
const levelCache = new Map<number, HashiPuzzle>()
function levelPuzzle(level: number): HashiPuzzle {
  const cached = levelCache.get(level)
  if (cached !== undefined) return cached
  const size = LEVEL_SIZES[level - 1]!
  const puzzle = puzzleFromSeed((level * 0x9e3779b9) >>> 0, size)
  levelCache.set(level, puzzle)
  return puzzle
}

describe('hashi logic', () => {
  describe('legalLine', () => {
    it('allows a clear horizontal or vertical line', () => {
      const open: Island[] = [
        { x: 0, y: 0, n: 1 },
        { x: 4, y: 0, n: 1 },
        { x: 0, y: 3, n: 1 },
      ]
      expect(legalLine(open, 0, 1)).toBe(true) // same row, nothing between
      expect(legalLine(open, 0, 2)).toBe(true) // same column, nothing between
    })

    it('rejects a line blocked by an intermediate island', () => {
      const blocked: Island[] = [
        { x: 0, y: 0, n: 1 },
        { x: 4, y: 0, n: 1 },
        { x: 2, y: 0, n: 1 }, // sits between the first two
      ]
      expect(legalLine(blocked, 0, 1)).toBe(false)
      expect(legalLine(blocked, 0, 2)).toBe(true)
    })

    it('rejects a diagonal', () => {
      const open: Island[] = [
        { x: 0, y: 0, n: 1 },
        { x: 4, y: 0, n: 1 },
        { x: 0, y: 3, n: 1 },
      ]
      expect(legalLine(open, 1, 2)).toBe(false) // (4,0) to (0,3)
    })

    it('rejects the same cell', () => {
      const open: Island[] = [{ x: 0, y: 0, n: 1 }]
      expect(legalLine(open, 0, 0)).toBe(false)
    })
  })

  describe('bridge keys and placement', () => {
    it('bridgeKey is order-independent', () => {
      expect(bridgeKey(2, 7)).toBe(bridgeKey(7, 2))
      expect(bridgeKey(2, 7)).toBe('2:7')
    })

    it('cycleBridge cycles one pair 0→1→2→0 and leaves others alone', () => {
      const a: Island[] = [
        { x: 0, y: 0, n: 4 },
        { x: 2, y: 0, n: 4 },
        { x: 0, y: 2, n: 4 },
      ]
      let placed: Placed = new Map()
      expect(bridgeBetween(placed, 0, 1)).toBe(0)
      placed = cycleBridge(placed, 0, 1)
      expect(bridgeBetween(placed, 0, 1)).toBe(1)
      placed = cycleBridge(placed, 0, 1)
      expect(bridgeBetween(placed, 0, 1)).toBe(2)
      placed = cycleBridge(placed, 0, 1)
      expect(bridgeBetween(placed, 0, 1)).toBe(0)
      expect(placed.size).toBe(0)
      // A second pair is independent and records its own order.
      placed = cycleBridge(placed, 2, 0)
      placed = cycleBridge(placed, 0, 1)
      expect([...placed.keys()]).toEqual(['0:2', '0:1'])
      expect(degrees(a, placed)).toEqual([2, 1, 1]) // island 0 touches both pairs
    })

    it('removeLastBridge drops the most recently placed bridge', () => {
      let placed: Placed = new Map()
      placed = cycleBridge(placed, 0, 1)
      placed = cycleBridge(placed, 1, 2)
      placed = removeLastBridge(placed)
      expect(bridgeBetween(placed, 1, 2)).toBe(0)
      expect(bridgeBetween(placed, 0, 1)).toBe(1)
      placed = removeLastBridge(placed)
      expect(placed.size).toBe(0)
      // Removing from an empty board is a no-op.
      expect(removeLastBridge(placed)).toBe(placed)
    })
  })

  describe('countSolutions', () => {
    it('a 3-island line 1-2-1 has exactly one solution', () => {
      const puzzle = puzzleOf(3, [
        [0, 0, 1],
        [1, 0, 2],
        [2, 0, 1],
      ])
      expect(countSolutions(puzzle, 50000)).toBe(1)
    })

    it('a symmetric 4-island square of 2s has exactly one solution', () => {
      // The two "opposite double-bridge" readings satisfy every number but each
      // leaves two disconnected halves, so the single-bridge ring is the only
      // valid solution — the connectivity rule is what pins it down.
      const puzzle = puzzleOf(5, [
        [0, 0, 2],
        [4, 0, 2],
        [0, 4, 2],
        [4, 4, 2],
      ])
      expect(countSolutions(puzzle, 50000)).toBe(1)
    })

    it('a symmetric 4-island 2-2-3-3 rectangle has more than one solution', () => {
      const puzzle = puzzleOf(5, [
        [0, 0, 2],
        [4, 0, 2],
        [0, 4, 3],
        [4, 4, 3],
      ])
      expect(countSolutions(puzzle, 50000)).toBeGreaterThan(1)
    })

    it('an odd total has no solution', () => {
      const puzzle = puzzleOf(3, [
        [0, 0, 1],
        [1, 0, 1],
        [2, 0, 1],
      ])
      expect(countSolutions(puzzle, 50000)).toBe(0)
    })

    it('reports -1 when the node budget runs out', () => {
      const puzzle = puzzleOf(5, [
        [0, 0, 2],
        [4, 0, 2],
        [0, 4, 2],
        [4, 4, 2],
      ])
      expect(countSolutions(puzzle, 0)).toBe(-1)
    })
  })

  describe('puzzleFromSeed', () => {
    it('is deterministic for a seed', () => {
      const a = puzzleFromSeed(0x51ed, 7)
      const b = puzzleFromSeed(0x51ed, 7)
      expect(a).toEqual(b)
      expect(a.islands.length).toBeGreaterThan(3)
    })

    it('every level size yields a solvable, connected, crossing-free solution', () => {
      for (let level = 1; level <= LEVEL_SIZES.length; level += 1) {
        const puzzle = levelPuzzle(level)
        const size = LEVEL_SIZES[level - 1]!
        expect(puzzle.size).toBe(size)
        expect(puzzle.islands.length).toBeGreaterThanOrEqual(4)
        // Islands sit inside the board and are pairwise distinct cells.
        const seen = new Set(puzzle.islands.map(i => `${i.x},${i.y}`))
        expect(seen.size).toBe(puzzle.islands.length)
        for (const island of puzzle.islands) {
          expect(island.x).toBeGreaterThanOrEqual(0)
          expect(island.x).toBeLessThan(size)
          expect(island.y).toBeGreaterThanOrEqual(0)
          expect(island.y).toBeLessThan(size)
          expect(island.n).toBeGreaterThanOrEqual(1)
          expect(island.n).toBeLessThanOrEqual(8)
        }
        // Numbers are the solution's degrees, and the solution wins the game.
        expect(solutionDegrees(puzzle)).toEqual(puzzle.islands.map(i => i.n))
        const placed = toPlaced(puzzle.bridges)
        expect(isSolved(puzzle.islands, placed)).toBe(true)
        expect(connectedCheck(puzzle.islands, placed)).toBe(true)
        const list = placedBridges(puzzle.islands, placed)
        for (let i = 0; i < list.length; i += 1) {
          for (let j = i + 1; j < list.length; j += 1) {
            const e = list[i]!
            const f = list[j]!
            expect(crosses(puzzle.islands[e.a]!, puzzle.islands[e.b]!, puzzle.islands[f.a]!, puzzle.islands[f.b]!)).toBe(false)
          }
        }
      }
    })

    it('the unique flag agrees with the solver on a full budget (small sizes)', () => {
      for (const level of [1, 2]) {
        const puzzle = levelPuzzle(level)
        const count = countSolutions(puzzle, 2000000)
        expect(puzzle.unique).toBe(count === 1)
        expect(count).toBe(1) // generation proves uniqueness at these sizes
      }
    })

    it('different seeds give different boards', () => {
      const a = puzzleFromSeed(11, 6)
      const b = puzzleFromSeed(12, 6)
      expect(a.islands).not.toEqual(b.islands)
    })
  })

  describe('isSolved', () => {
    // Four islands on a 4x4 square, each needing 2 bridge ends: the ring of
    // single bridges is the one solution (see countSolutions above).
    const islands: Island[] = [
      { x: 0, y: 0, n: 2 },
      { x: 4, y: 0, n: 2 },
      { x: 0, y: 4, n: 2 },
      { x: 4, y: 4, n: 2 },
    ]
    const ring = toPlaced([
      { a: 0, b: 1, count: 1 },
      { a: 0, b: 2, count: 1 },
      { a: 1, b: 3, count: 1 },
      { a: 2, b: 3, count: 1 },
    ])

    it('accepts the full solution', () => {
      expect(isSolved(islands, ring)).toBe(true)
    })

    it('rejects a partial bridge set', () => {
      const partial = toPlaced([
        { a: 0, b: 1, count: 1 },
        { a: 0, b: 2, count: 1 },
        { a: 1, b: 3, count: 1 },
      ])
      expect(degrees(islands, partial)).toEqual([2, 2, 1, 1]) // island 3 short one end
      expect(isSolved(islands, partial)).toBe(false)
    })

    it('rejects an over-bridged island', () => {
      const over = toPlaced([
        { a: 0, b: 1, count: 2 }, // island 0 now has 3 ends but needs 2
        { a: 0, b: 2, count: 1 },
        { a: 1, b: 3, count: 1 },
        { a: 2, b: 3, count: 1 },
      ])
      expect(degrees(islands, over)).toEqual([3, 3, 2, 2])
      expect(isSolved(islands, over)).toBe(false)
    })

    it('rejects a satisfied but disconnected board', () => {
      // Two double bridges across opposite sides: every number is met, but the
      // board splits into two halves.
      const split = toPlaced([
        { a: 0, b: 1, count: 2 },
        { a: 2, b: 3, count: 2 },
      ])
      expect(degrees(islands, split)).toEqual([2, 2, 2, 2])
      expect(connectedCheck(islands, split)).toBe(false)
      expect(isSolved(islands, split)).toBe(false)
    })

    it('rejects crossing bridges even when every number is satisfied', () => {
      // A 6-cycle whose opposite sides cross at the empty centre (2,2):
      // all degrees are 2 and the graph is connected, so only the crossing
      // rule rejects it.
      const ring: Island[] = [
        { x: 0, y: 0, n: 2 }, // 0 top-left
        { x: 0, y: 2, n: 2 }, // 1 mid-left
        { x: 2, y: 0, n: 2 }, // 2 top-mid
        { x: 4, y: 2, n: 2 }, // 3 mid-right
        { x: 2, y: 4, n: 2 }, // 4 bottom-mid
        { x: 4, y: 4, n: 2 }, // 5 bottom-right
      ]
      const placed = toPlaced([
        { a: 0, b: 1, count: 1 },
        { a: 0, b: 2, count: 1 },
        { a: 1, b: 3, count: 1 }, // crosses 2-4 at (2,2)
        { a: 2, b: 4, count: 1 },
        { a: 3, b: 5, count: 1 },
        { a: 4, b: 5, count: 1 },
      ])
      expect(degrees(ring, placed)).toEqual([2, 2, 2, 2, 2, 2])
      expect(connectedCheck(ring, placed)).toBe(true)
      expect(crosses(ring[1]!, ring[3]!, ring[2]!, ring[4]!)).toBe(true)
      expect(isSolved(ring, placed)).toBe(false)
    })
  })
})
