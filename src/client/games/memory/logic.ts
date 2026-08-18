/**
 * Memory-match pure logic: a grid of face-down cards; flip two at a time and
 * matching pairs are removed. Finished when all pairs are matched. The deck is
 * always solvable by construction (pairs of the same symbol). Deterministic
 * functions over a plain state object.
 */

export const PAIRS = 8
export const COLS = 4
export const ROWS = 4

export interface MemoryState {
  /** Card symbol id (0..PAIRS-1); null when removed. */
  cards: (number | null)[]
  /** Indices currently face-up (max 2). */
  flipped: number[]
  matched: number
  moves: number
  finished: boolean
  rng: () => number
}

/** A fresh shuffled deck: PAIRS symbols, each appearing twice. */
export function createMemoryState(rng: () => number = Math.random): MemoryState {
  const symbols: number[] = []
  for (let i = 0; i < PAIRS; i += 1) {
    symbols.push(i, i)
  }
  // Fisher-Yates shuffle.
  for (let i = symbols.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = symbols[i]!
    symbols[i] = symbols[j]!
    symbols[j] = tmp
  }
  return { cards: symbols, flipped: [], matched: 0, moves: 0, finished: false, rng }
}

/** Flip a card. Returns 'match' | 'mismatch' | 'noop' when the flip resolved a pair. */
export function flip(state: MemoryState, index: number): 'match' | 'mismatch' | 'noop' {
  if (state.finished) return 'noop'
  const symbol = state.cards[index]
  if (symbol === null || state.flipped.includes(index)) return 'noop'
  if (state.flipped.length >= 2) {
    // A mismatched pair is still face-up for its reveal; ignore new flips
    // until the caller calls resetFlip.
    return 'noop'
  }
  state.flipped.push(index)
  if (state.flipped.length < 2) return 'noop'

  // Two cards face-up: resolve.
  state.moves += 1
  const a = state.flipped[0]!
  const b = state.flipped[1]!
  if (state.cards[a] === state.cards[b]) {
    state.cards[a] = null
    state.cards[b] = null
    state.matched += 1
    state.flipped = []
    if (state.matched === PAIRS) state.finished = true
    return 'match'
  }
  // Keep both cards face-up so the caller can reveal them, then flip them
  // back down together via resetFlip after a delay.
  return 'mismatch'
}

/** Turn any face-up cards back down (e.g. after a mismatch reveal delay). */
export function resetFlip(state: MemoryState): void {
  state.flipped = []
}
