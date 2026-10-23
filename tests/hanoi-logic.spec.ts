import { describe, expect, it } from 'vitest'
import {
  applyMove, createStart, isWin, optimalFor, perfectSoFar, type HanoiState,
} from '../src/client/games/hanoi/logic.ts'

describe('hanoi logic', () => {
  it('createStart: n discs on rod 0, descending bottom→top, others empty', () => {
    expect(createStart(3)).toEqual({ rods: [[3, 2, 1], [], []] })
    expect(createStart(5)).toEqual({ rods: [[5, 4, 3, 2, 1], [], []] })
  })

  it('applyMove: legal move moves the top disc and returns a new state', () => {
    const start = createStart(3)
    const next = applyMove(start, 0, 2)
    expect(next).toEqual({ rods: [[3, 2], [], [1]] })
    // Input state unchanged.
    expect(start).toEqual({ rods: [[3, 2, 1], [], []] })
    expect(next).not.toBe(start)
    expect(next!.rods).not.toBe(start.rods)
  })

  it('applyMove: null on empty source rod', () => {
    expect(applyMove(createStart(3), 1, 2)).toBeNull()
  })

  it('applyMove: null putting a bigger disc onto a smaller one', () => {
    let s = createStart(3)
    s = applyMove(s, 0, 2)! // disc 1 → rod 2
    s = applyMove(s, 0, 1)! // disc 2 → rod 1
    expect(applyMove(s, 0, 2)).toBeNull() // disc 3 onto disc 1
    expect(applyMove(s, 1, 2)).toBeNull() // disc 2 onto disc 1
  })

  it('applyMove: null on same rod or out-of-range indices', () => {
    expect(applyMove(createStart(3), 1, 1)).toBeNull()
    expect(applyMove(createStart(3), -1, 2)).toBeNull()
    expect(applyMove(createStart(3), 0, 3)).toBeNull()
    expect(applyMove(createStart(3), 3, 0)).toBeNull()
  })

  it('isWin: false at start, true only when all discs are on the rightmost rod', () => {
    expect(isWin(createStart(3))).toBe(false)
    const partial: HanoiState = { rods: [[], [1], [3, 2]] }
    expect(isWin(partial)).toBe(false)
    expect(isWin({ rods: [[], [], [3, 2, 1]] })).toBe(true)
    // Empty board (degenerate) is not a win.
    expect(isWin({ rods: [[], [], []] })).toBe(false)
  })

  it('optimalFor: 2^n - 1 for every level disc count', () => {
    for (const [n, par] of [[3, 7], [4, 15], [5, 31], [6, 63], [7, 127]] as const) {
      expect(optimalFor(n)).toBe(par)
    }
  })

  it('perfectSoFar: true at 0 and exactly par, false beyond', () => {
    expect(perfectSoFar(0, 4)).toBe(true)
    expect(perfectSoFar(optimalFor(4), 4)).toBe(true)
    expect(perfectSoFar(optimalFor(4) + 1, 4)).toBe(false)
    expect(perfectSoFar(optimalFor(7) + 1, 7)).toBe(false)
  })

  it('an optimal 3-disc game reaches isWin in exactly par moves', () => {
    let s = createStart(3)
    const optimal: Array<[number, number]> = [
      [0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2],
    ]
    let count = 0
    for (const [from, to] of optimal) {
      const next = applyMove(s, from, to)
      expect(next).not.toBeNull()
      s = next!
      count += 1
    }
    expect(isWin(s)).toBe(true)
    expect(count).toBe(optimalFor(3))
  })

  it('legal sequences keep each rod strictly decreasing bottom→top', () => {
    let s = createStart(5)
    // Arbitrary legal wandering: shuttle small discs around.
    const seq: Array<[number, number]> = [
      [0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2],
      // Reverse the tower back to rod 0, then shuttle again.
      [2, 1], [2, 0], [1, 0], [0, 2], [0, 1], [2, 1],
    ]
    for (const [from, to] of seq) {
      const next = applyMove(s, from, to)
      expect(next).not.toBeNull()
      s = next!
    }
    for (const rod of s.rods) {
      for (let i = 1; i < rod.length; i += 1) {
        expect(rod[i]!).toBeLessThan(rod[i - 1]!)
      }
    }
    // Disc multiset preserved.
    expect(s.rods.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('applyMove never mutates the input state (deep check)', () => {
    const start = createStart(4)
    const snapshot = JSON.parse(JSON.stringify(start)) as HanoiState
    let s = start
    s = applyMove(s, 0, 1)!
    s = applyMove(s, 0, 2)!
    s = applyMove(s, 1, 2)!
    expect(start).toEqual(snapshot)
  })

  it('undo basis: replaying the inverse of a move restores the prior state', () => {
    const start = createStart(3)
    const moved = applyMove(start, 0, 1)!
    const back = applyMove(moved, 1, 0)!
    expect(back.rods).toEqual(start.rods)
  })
})
