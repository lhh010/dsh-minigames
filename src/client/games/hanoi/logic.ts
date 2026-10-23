/**
 * Tower of Hanoi 河内塔 pure logic: N discs on the leftmost of 3 rods; a move
 * takes the top disc of one rod onto another unless that would put a bigger
 * disc on a smaller one. Deterministic functions only — no DOM, no timers.
 */

/** Disc sizes per rod, bottom → top; size 1 is the smallest disc. */
export interface HanoiState {
  rods: number[][]
}

export const RODS = 3

/**
 * The opening position: discs n..1 stacked on rod 0, rods 1..2 empty.
 * @param n - disc count (>= 1).
 */
export function createStart(n: number): HanoiState {
  const first: number[] = []
  for (let size = n; size >= 1; size -= 1) first.push(size)
  return { rods: [first, [], []] }
}

/**
 * Apply one move: lift the top disc of `from` and drop it on `to`.
 * @returns the new state, or null when the move is illegal (rod out of range,
 *   same rod, empty source, or a bigger disc onto a smaller one). The input
 *   state is never mutated.
 */
export function applyMove(state: HanoiState, from: number, to: number): HanoiState | null {
  if (from < 0 || from >= RODS || to < 0 || to >= RODS || from === to) return null
  const source = state.rods[from]!
  const target = state.rods[to]!
  const disc = source[source.length - 1]
  if (disc === undefined) return null
  const top = target[target.length - 1]
  if (top !== undefined && top < disc) return null
  return {
    rods: state.rods.map((rod, i) => {
      if (i === from) return rod.slice(0, -1)
      if (i === to) return [...rod, disc]
      return [...rod]
    }),
  }
}

/** True when every disc sits on the rightmost rod. */
export function isWin(state: HanoiState): boolean {
  return state.rods[0]!.length === 0 && state.rods[1]!.length === 0 && state.rods[2]!.length > 0
}

/** The minimum move count to solve n discs: 2^n - 1. */
export function optimalFor(n: number): number {
  return 2 ** n - 1
}

/**
 * Whether the play path can still finish in optimal moves: with the optimal
 * total fixed at 2^n - 1, any move beyond it has already spoiled perfection.
 */
export function perfectSoFar(moveCount: number, n: number): boolean {
  return moveCount <= optimalFor(n)
}
