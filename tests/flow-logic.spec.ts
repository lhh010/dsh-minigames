import { describe, expect, it } from 'vitest'
import {
  LEVEL_PAIRS, LEVEL_SIZES, adjacent, attemptCap, computeScore, connectedCount,
  extendPath, findDeadCell, grabPath, isWon, levelPairs, levelSize, neighbors,
  pathComplete, puzzleFromSeed, solveCount,
  type CellPaths, type FlowPuzzle,
} from '../src/client/games/flow/logic.ts'

const emptyPaths = (puzzle: FlowPuzzle): CellPaths => puzzle.dots.map(() => null)

/** Check a puzzle's solution is a legal full-cover path partition. */
function assertValidPartition(puzzle: FlowPuzzle): void {
  const { size, dots, solution } = puzzle
  expect(solution.length).toBe(dots.length)
  const seen = new Set<number>()
  for (let c = 0; c < solution.length; c += 1) {
    const path = solution[c]!
    expect(path.length).toBeGreaterThanOrEqual(2)
    // Consecutive cells adjacent, no repeats.
    for (let i = 0; i < path.length; i += 1) {
      expect(seen.has(path[i]!)).toBe(false)
      seen.add(path[i]!)
      if (i > 0) expect(adjacent(size, path[i - 1]!, path[i]!)).toBe(true)
    }
    // Ends are exactly the pair's dots.
    expect([path[0], path[path.length - 1]]).toContain(dots[c]![0])
    expect([path[0], path[path.length - 1]]).toContain(dots[c]![1])
  }
  expect(seen.size).toBe(size * size)
}

describe('flow generation', () => {
  it('places the requested pair count as distinct dots', () => {
    const p = puzzleFromSeed(7, 5, 4)
    expect(p.size).toBe(5)
    expect(p.dots.length).toBe(4)
    const all = p.dots.flat()
    expect(new Set(all).size).toBe(8)
    for (const d of all) {
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThan(25)
    }
  })

  it('is deterministic for the same seed', () => {
    const a = puzzleFromSeed(42, 6, 5)
    const b = puzzleFromSeed(42, 6, 5)
    expect(a.dots).toEqual(b.dots)
    expect(a.solution).toEqual(b.solution)
    expect(a.unique).toBe(b.unique)
  })

  it('solutions are full-cover path partitions with the dots as ends', () => {
    assertValidPartition(puzzleFromSeed(3, 5, 4))
    assertValidPartition(puzzleFromSeed(5, 7, 6))
  })

  it('every level size generates within the attempt cap', () => {
    for (let i = 0; i < LEVEL_SIZES.length; i += 1) {
      const size = LEVEL_SIZES[i]!
      const pairs = LEVEL_PAIRS[i]!
      const p = puzzleFromSeed((i + 1) * 101, size, pairs)
      expect(p.size).toBe(size)
      expect(p.dots.length).toBe(pairs)
      assertValidPartition(p)
    }
  }, 30_000) // 8×8/9×9 uniqueness verification alone needs ~10s

  it('different seeds usually give different puzzles', () => {
    const a = puzzleFromSeed(1, 5, 4)
    const b = puzzleFromSeed(2, 5, 4)
    expect(a.dots).not.toEqual(b.dots)
  })

  it('attempt caps stay bounded and shrink for big boards', () => {
    expect(attemptCap(5)).toBe(40)
    expect(attemptCap(9)).toBe(12)
    expect(attemptCap(9)).toBeLessThan(attemptCap(5))
  })
})

describe('flow solver', () => {
  it('solves any generated puzzle (a solution exists)', () => {
    for (const [size, pairs] of [[5, 4], [7, 6], [9, 8]] as const) {
      const p = puzzleFromSeed(11, size, pairs, false)
      const { solutions, exhausted } = solveCount(p)
      expect(exhausted).toBe(false)
      expect(solutions).toBeGreaterThanOrEqual(1)
    }
  })

  it('reports a constructed board with exactly one solution as unique', () => {
    // 2×2, pair (0,1): the only full-cover path is 0-2-3-1.
    const p: FlowPuzzle = { size: 2, dots: [[0, 1]], solution: [[0, 2, 3, 1]], unique: false }
    expect(solveCount(p).solutions).toBe(1)
  })

  it('detects a constructed ambiguous board (two coverings)', () => {
    // 3×3, single pair (0, 8): at least two Hamiltonian coverings exist
    // (0-1-2-5-4-3-6-7-8 and 0-3-6-7-4-1-2-5-8 among others) → not unique.
    // (A 2×2 [0,3] board has NO covering at all — same-parity corners —
    // the solver correctly reports 0 there.)
    const p: FlowPuzzle = { size: 3, dots: [[0, 8]], solution: [[0, 1, 2, 5, 4, 3, 6, 7, 8]], unique: false }
    expect(solveCount(p).solutions).toBeGreaterThanOrEqual(2)
  })

  it('some 5×5 seeds verify as unique and ship with the badge', () => {
    let anyUnique = false
    for (let seed = 1; seed <= 15 && !anyUnique; seed += 1) {
      if (puzzleFromSeed(seed, 5, 4).unique) anyUnique = true
    }
    expect(anyUnique).toBe(true)
  })

  it('generated unique puzzles are reported unique by the solver directly', () => {
    let uniquePuzzle: FlowPuzzle | null = null
    for (let seed = 20; seed <= 40 && uniquePuzzle === null; seed += 1) {
      const p = puzzleFromSeed(seed, 5, 4)
      if (p.unique) uniquePuzzle = p
    }
    expect(uniquePuzzle).not.toBeNull()
    expect(solveCount(uniquePuzzle!).solutions).toBe(1)
  })
})

describe('flow path ops', () => {
  const p = puzzleFromSeed(3, 5, 4)
  const [a, b] = p.dots[0]!
  // Walk the generated solution path of color 0 step by step.
  const sol = p.solution[0]!

  it('grabPath starts only on that color\'s dots', () => {
    let paths = emptyPaths(p)
    paths = grabPath(p, paths, 0, sol[1]!)
    expect(paths[0]).toBe(null) // interior cell of the future path: rejected
    paths = grabPath(p, paths, 0, a)
    expect(paths[0]).toEqual([a])
    // Grabbing the other dot restarts the path there.
    paths = grabPath(p, paths, 0, b)
    expect(paths[0]).toEqual([b])
    // Foreign dot: rejected.
    paths = grabPath(p, paths, 1, p.dots[0]![0]!)
    expect(paths[1]).toBe(null)
  })

  it('extends onto adjacent free cells and rejects non-adjacent ones', () => {
    let paths = emptyPaths(p)
    paths = grabPath(p, paths, 0, sol[0]!)
    paths = extendPath(p, paths, 0, sol[1]!)
    expect(paths[0]).toEqual([sol[0]!, sol[1]!])
    const before = paths
    // A cell adjacent to neither end of [s0, s1] cannot join.
    const far = p.solution[2]!.filter(
      c => !adjacent(p.size, sol[0]!, c) && !adjacent(p.size, sol[1]!, c),
    )[0]
    expect(far).toBeDefined()
    paths = extendPath(p, paths, 0, far!)
    expect(paths).toBe(before)
  })

  it('truncates when re-entering its own path', () => {
    let paths = emptyPaths(p)
    paths = grabPath(p, paths, 0, sol[0]!)
    for (let i = 1; i <= 3; i += 1) paths = extendPath(p, paths, 0, sol[i]!)
    paths = extendPath(p, paths, 0, sol[1]!)
    expect(paths[0]).toEqual([sol[0]!, sol[1]!])
  })

  it('cannot enter another path\'s cell or a foreign dot; partner completes', () => {
    // 3×3: color 1 holds 3-4; color 0 sits at 0-1, boxed in by the foreign
    // dot 3 (tail side) and the occupied cell 4 (head side).
    const q: FlowPuzzle = {
      size: 3,
      dots: [[0, 2], [3, 5]],
      solution: [[0, 1, 2], [3, 4, 5]],
      unique: false,
    }
    let paths: CellPaths = [null, null]
    paths = grabPath(q, paths, 1, 3)
    paths = extendPath(q, paths, 1, 4)
    paths = grabPath(q, paths, 0, 0)
    paths = extendPath(q, paths, 0, 1)
    expect(paths[0]).toEqual([0, 1])
    const before = paths
    expect(adjacent(3, 1, 4)).toBe(true)
    paths = extendPath(q, paths, 0, 4) // color 1's path cell → rejected
    expect(paths).toBe(before)
    expect(adjacent(3, 0, 3)).toBe(true)
    paths = extendPath(q, paths, 0, 3) // foreign dot → rejected
    expect(paths).toBe(before)
    paths = extendPath(q, paths, 0, 2) // own partner dot → completes
    expect(paths[0]).toEqual([0, 1, 2])
    expect(pathComplete(q, 0, paths[0] ?? null)).toBe(true)
  })

  it('a path through its own partner dot pair-completes', () => {
    let paths = emptyPaths(p)
    paths = grabPath(p, paths, 0, sol[0]!)
    for (let i = 1; i < sol.length; i += 1) paths = extendPath(p, paths, 0, sol[i]!)
    expect(pathComplete(p, 0, paths[0] ?? null)).toBe(true)
    expect(connectedCount(p, paths)).toBe(1)
  })
})

describe('flow win check', () => {
  it('all-filled + all-connected wins', () => {
    const p = puzzleFromSeed(9, 5, 4)
    let paths = emptyPaths(p)
    for (let c = 0; c < p.dots.length; c += 1) {
      const sol = p.solution[c]!
      paths = grabPath(p, paths, c, sol[0]!)
      for (let i = 1; i < sol.length; i += 1) paths = extendPath(p, paths, c, sol[i]!)
    }
    expect(isWon(p, paths)).toBe(true)
  })

  it('filled but not all pairs connected does not win', () => {
    const p = puzzleFromSeed(9, 5, 4)
    let paths = emptyPaths(p)
    // A color whose generated path is long enough to truncate mid-way.
    const c = p.solution.findIndex(sol => sol.length >= 4)
    expect(c).toBeGreaterThanOrEqual(0)
    for (let k = 0; k < p.dots.length; k += 1) {
      const sol = p.solution[k]!
      paths = grabPath(p, paths, k, sol[0]!)
      for (let i = 1; i < sol.length; i += 1) paths = extendPath(p, paths, k, sol[i]!)
    }
    expect(isWon(p, paths)).toBe(true)
    // Truncate that color mid-path: pair open, coverage lost.
    paths = extendPath(p, paths, c!, p.solution[c]![1]!)
    expect(isWon(p, paths)).toBe(false)
  })

  it('an all-cover state with a mis-paired dot does not win', () => {
    // 2×2 fully covered by one path that merely PASSES THROUGH the partner
    // dot (2) instead of ending on it.
    const p: FlowPuzzle = { size: 2, dots: [[0, 2]], solution: [[0, 1, 3, 2]], unique: false }
    expect(isWon(p, [[0, 2, 3, 1]])).toBe(false)
    expect(isWon(p, [[0, 1, 3, 2]])).toBe(true)
  })
})

describe('flow pruning helpers', () => {
  it('finds a dead free cell on a constructed board', () => {
    // 3×3 with the middle column occupied: corner 0 has one free neighbor.
    const occ = new Array<number>(9).fill(-1)
    occ[1] = 0
    occ[4] = 0
    occ[7] = 0
    expect(findDeadCell(3, occ)).toBe(0)
  })

  it('a fully free board has no dead cells (corners keep 2)', () => {
    expect(findDeadCell(3, new Array<number>(9).fill(-1))).toBe(-1)
    expect(findDeadCell(5, new Array<number>(25).fill(-1))).toBe(-1)
  })

  it('the active head rescues cells only it can serve', () => {
    const occ = new Array<number>(9).fill(-1)
    occ[1] = 0
    // No head: cells 0 and 2 have one free neighbor each → dead.
    expect(findDeadCell(3, occ)).toBe(0)
    // head = 1: both flanking cells count the head → alive everywhere.
    expect(findDeadCell(3, occ, 1)).toBe(-1)
    // A non-adjacent head rescues nothing.
    expect(findDeadCell(3, occ, 4)).toBe(0)
  })

  it('unfinished endpoints need only one live neighbor', () => {
    const occ = new Array<number>(9).fill(-1)
    occ[1] = 0
    occ[3] = 0
    // Cell 0 has zero free neighbors; as an endpoint it still needs ≥1 → dead.
    expect(findDeadCell(3, occ, -1, [0])).toBe(0)
    expect(findDeadCell(3, occ, -1, [6])).toBe(0)
  })
})

describe('flow score and levels', () => {
  it('score math: base 100×level + decaying time bonus', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(5, 100)).toBe(2500)
    expect(computeScore(3, 300)).toBe(300)
    expect(computeScore(2, 400)).toBe(200) // bonus clamped at 0
  })

  it('level sizes and pair counts advance and wrap', () => {
    expect(LEVEL_SIZES).toEqual([5, 6, 7, 8, 9])
    expect(LEVEL_PAIRS).toEqual([4, 5, 6, 7, 8])
    expect(levelSize(1)).toBe(5)
    expect(levelSize(3)).toBe(7)
    expect(levelSize(5)).toBe(9)
    expect(levelSize(6)).toBe(5)
    expect(levelSize(10)).toBe(9)
    expect(levelPairs(1)).toBe(4)
    expect(levelPairs(6)).toBe(4)
    expect(levelPairs(8)).toBe(6)
  })
})

describe('flow determinism of play', () => {
  it('same seed → identical puzzle and identical scripted outcome', () => {
    const run = (): { puzzle: FlowPuzzle, paths: CellPaths, won: boolean } => {
      const puzzle = puzzleFromSeed(99, 6, 5)
      let paths = emptyPaths(puzzle)
      // Script: fully draw colors 0..1, truncate color 0, then finish all.
      for (let c = 0; c < 2; c += 1) {
        const sol = puzzle.solution[c]!
        paths = grabPath(puzzle, paths, c, sol[0]!)
        for (let i = 1; i < sol.length; i += 1) paths = extendPath(puzzle, paths, c, sol[i]!)
      }
      paths = extendPath(puzzle, paths, 0, puzzle.solution[0]![2]!)
      // Fresh redraw of every color from clean state (the truncated path
      // would otherwise resume from a mid-path head and never re-anchor on
      // its start dot).
      paths = emptyPaths(puzzle)
      for (let c = 0; c < puzzle.dots.length; c += 1) {
        const sol = puzzle.solution[c]!
        paths = grabPath(puzzle, paths, c, sol[0]!)
        for (let i = 1; i < sol.length; i += 1) paths = extendPath(puzzle, paths, c, sol[i]!)
      }
      return { puzzle, paths, won: isWon(puzzle, paths) }
    }
    const first = run()
    const second = run()
    expect(second.puzzle.dots).toEqual(first.puzzle.dots)
    expect(second.puzzle.solution).toEqual(first.puzzle.solution)
    expect(second.paths).toEqual(first.paths)
    expect(second.won).toBe(first.won)
    expect(first.won).toBe(true)
  })
})

describe('flow grid helpers', () => {
  it('neighbors and adjacency', () => {
    expect(neighbors(3, 0)).toEqual([3, 1])
    expect(neighbors(3, 4)).toEqual([1, 7, 3, 5])
    expect(adjacent(3, 0, 1)).toBe(true)
    expect(adjacent(3, 0, 3)).toBe(true)
    expect(adjacent(3, 0, 4)).toBe(false)
    expect(adjacent(3, 0, 2)).toBe(false)
    expect(adjacent(3, 0, 0)).toBe(false)
  })
})
