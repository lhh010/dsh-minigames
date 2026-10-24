import { describe, expect, it } from 'vitest'
import {
  LEVEL_SIZES, cellEdges, checkClues, cycleCheck, edgeCount, isSolved,
  lineSolve, puzzleFromSeed, type EdgeState, type Clue,
} from '../src/client/games/slitherlink/logic.ts'

const unknown = (n: number): EdgeState[] => new Array<EdgeState>(n).fill(0)

describe('slitherlink logic', () => {
  it('edgeCount matches the lattice encoding', () => {
    expect(edgeCount(5, 5)).toBe(6 * 5 + 5 * 6)
    expect(edgeCount(2, 2)).toBe(3 * 2 + 2 * 3)
  })

  it('cellEdges returns four distinct in-range edges', () => {
    const es = cellEdges(5, 5, 2, 2)
    expect(new Set(es).size).toBe(4)
    for (const e of es) expect(e).toBeGreaterThanOrEqual(0)
    expect(Math.max(...es)).toBeLessThan(edgeCount(5, 5))
  })

  it('cycleCheck accepts a single 2x2 loop', () => {
    // 2x2 cells: the four interior edges around the central dot form a loop.
    const w = 2, h = 2
    const edges = unknown(edgeCount(w, h))
    const loop = cellEdges(w, h, 0, 0) // N,E,S,W of cell (0,0) = the unit square
    for (const e of loop) edges[e] = 1
    const { singleCycle, degreeOk } = cycleCheck(edges, w, h)
    expect(degreeOk).toBe(true)
    expect(singleCycle).toBe(true)
  })

  it('cycleCheck rejects an open path (degree-1 dots)', () => {
    const w = 2, h = 2
    const edges = unknown(edgeCount(w, h))
    const [n, e] = cellEdges(w, h, 0, 0)
    edges[n!] = 1
    edges[e!] = 1
    expect(cycleCheck(edges, w, h).degreeOk).toBe(false)
  })

  it('cycleCheck rejects two disjoint loops', () => {
    const w = 3, h = 2
    const edges = unknown(edgeCount(w, h))
    for (const e of cellEdges(w, h, 0, 0)) edges[e] = 1
    for (const e of cellEdges(w, h, 2, 0)) edges[e] = 1
    const { singleCycle } = cycleCheck(edges, w, h)
    expect(singleCycle).toBe(false)
  })

  it('cycleCheck rejects a branched dot', () => {
    const w = 2, h = 2
    const edges = unknown(edgeCount(w, h))
    const [n, e, s] = cellEdges(w, h, 0, 0)
    edges[n!] = 1
    edges[e!] = 1
    edges[s!] = 1
    expect(cycleCheck(edges, w, h).degreeOk).toBe(false)
  })

  it('checkClues enforces exact satisfaction', () => {
    const w = 2, h = 1
    const clues: Clue[] = [2, 1]
    const edges = unknown(edgeCount(w, h))
    const e0 = cellEdges(w, h, 0, 0)
    const e1 = cellEdges(w, h, 1, 0)
    // Cell 0 needs 2, cell 1 needs 1: nothing placed yet → both unsatisfied.
    expect(checkClues(edges, clues, w, h)).toBe(false)
    edges[e0[0]!] = 1 // top of cell 0
    // Cell 0 now has 1 of 2 → still false.
    expect(checkClues(edges, clues, w, h)).toBe(false)
    edges[e0[1]!] = 1 // east of cell 0 = west of cell 1 (the shared edge)
    // Cell 0 satisfied (2/2); cell 1 counts the shared edge (1/1) → true.
    expect(checkClues(edges, clues, w, h)).toBe(true)
    // Over-satisfying cell 1 breaks it again.
    edges[e1[2]!] = 1 // south of cell 1
    expect(checkClues(edges, clues, w, h)).toBe(false)
  })

  it('lineSolve marks crosses on edges the cycle cannot use', () => {
    // Soundness on a generated puzzle: derived crosses never land on cycle
    // edges, and derived lines are always cycle edges.
    const p = puzzleFromSeed(3, 5, 5)
    const solved = lineSolve(p.clues, unknown(edgeCount(5, 5)), 5, 5)
    const wrong = solved.filter((v, i) =>
      (v === 1 && p.solution[i] !== 1) || (v === 2 && p.solution[i] === 1)).length
    expect(wrong).toBe(0)
    expect(solved.some(v => v !== 0)).toBe(true)
  })

  it('puzzleFromSeed is deterministic', () => {
    const a = puzzleFromSeed(42, 5, 5)
    const b = puzzleFromSeed(42, 5, 5)
    expect(a.clues).toEqual(b.clues)
    expect(a.solution).toEqual(b.solution)
  })

  it('generated solutions satisfy the cycle and clue checks at every size', () => {
    for (const [w, h] of LEVEL_SIZES) {
      const p = puzzleFromSeed(7, w, h)
      expect(checkClues(p.solution, p.clues, w, h)).toBe(true)
      const { singleCycle, degreeOk } = cycleCheck(p.solution, w, h)
      expect(degreeOk).toBe(true)
      expect(singleCycle).toBe(true)
    }
  })

  it('line conclusions always agree with the true cycle (never contradict)', () => {
    // The generator's uniqueness pass is best-effort (the puzzle badge shows
    // 唯一解/多解); what must hold for every size is soundness: whatever
    // line logic derives matches the true cycle exactly.
    for (const [w, h] of LEVEL_SIZES) {
      const p = puzzleFromSeed(11, w, h)
      const solved = lineSolve(p.clues, unknown(edgeCount(w, h)), w, h)
      const wrong = solved.filter((v, i) =>
        (v === 1 && p.solution[i] !== 1) || (v === 2 && p.solution[i] === 1)).length
      expect(wrong).toBe(0)
    }
  })

  it('isSolved integration', () => {
    const p = puzzleFromSeed(3, 5, 5)
    expect(isSolved(p.solution, p.clues, 5, 5)).toBe(true)
    const partial = p.solution.map(v => (v === 1 ? 0 : v)) as EdgeState[]
    expect(isSolved(partial, p.clues, 5, 5)).toBe(false)
  })
})
