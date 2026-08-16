import { describe, expect, it } from 'vitest'
import {
  createMemoryState, flip, resetFlip, PAIRS,
} from '../src/client/games/memory/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe('memory logic', () => {
  it('creates a shuffled deck with pairs of each symbol', () => {
    const state = createMemoryState(lcg(1))
    expect(state.cards).toHaveLength(PAIRS * 2)
    const counts = new Map<number, number>()
    for (const symbol of state.cards) {
      counts.set(symbol!, (counts.get(symbol!) ?? 0) + 1)
    }
    for (let i = 0; i < PAIRS; i += 1) expect(counts.get(i)).toBe(2)
    expect(state.finished).toBe(false)
  })

  it('flips two cards and matches a pair', () => {
    const state = createMemoryState(lcg(1))
    // Force a known arrangement: symbol 0 at indices 0 and 1.
    state.cards = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]
    expect(flip(state, 0)).toBe('noop')
    const result = flip(state, 1)
    expect(result).toBe('match')
    expect(state.matched).toBe(1)
    expect(state.moves).toBe(1)
    expect(state.cards[0]).toBeNull()
    expect(state.cards[1]).toBeNull()
  })

  it('returns mismatch and keeps both cards face-up until resetFlip', () => {
    const state = createMemoryState(lcg(1))
    state.cards = [0, 1, 0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]
    flip(state, 0)
    const result = flip(state, 1)
    expect(result).toBe('mismatch')
    expect(state.moves).toBe(1)
    // Cards stay on the board.
    expect(state.cards[0]).toBe(0)
    expect(state.cards[1]).toBe(1)
    // Both cards remain face-up during the reveal window.
    expect(state.flipped).toEqual([0, 1])
    // New flips are ignored while the mismatched pair is showing.
    expect(flip(state, 2)).toBe('noop')
    // resetFlip turns them back down together; a fresh turn can start.
    resetFlip(state)
    expect(state.flipped).toEqual([])
    flip(state, 2)
    expect(flip(state, 3)).toBe('mismatch')
  })

  it('finishes when all pairs are matched', () => {
    const state = createMemoryState(lcg(1))
    state.cards = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]
    for (let i = 0; i < PAIRS; i += 1) {
      flip(state, i * 2)
      flip(state, i * 2 + 1)
    }
    expect(state.matched).toBe(PAIRS)
    expect(state.finished).toBe(true)
    expect(flip(state, 0)).toBe('noop') // inert after finish
  })

  it('ignores flips of removed or already-flipped cards', () => {
    const state = createMemoryState(lcg(1))
    state.cards = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]
    flip(state, 0)
    flip(state, 1) // matched -> removed
    expect(flip(state, 0)).toBe('noop') // removed
    expect(state.moves).toBe(1)
  })
})
