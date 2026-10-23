/**
 * Tower of Hanoi 河内塔 pure logic: N discs on the leftmost of 3 rods; a move
 * takes the top disc of one rod onto another unless that would put a bigger
 * disc on a smaller one. Deterministic functions only — no DOM, no timers.
 */
/** Disc sizes per rod, bottom → top; size 1 is the smallest disc. */
export interface HanoiState {
    rods: number[][];
}
export declare const RODS = 3;
/**
 * The opening position: discs n..1 stacked on rod 0, rods 1..2 empty.
 * @param n - disc count (>= 1).
 */
export declare function createStart(n: number): HanoiState;
/**
 * Apply one move: lift the top disc of `from` and drop it on `to`.
 * @returns the new state, or null when the move is illegal (rod out of range,
 *   same rod, empty source, or a bigger disc onto a smaller one). The input
 *   state is never mutated.
 */
export declare function applyMove(state: HanoiState, from: number, to: number): HanoiState | null;
/** True when every disc sits on the rightmost rod. */
export declare function isWin(state: HanoiState): boolean;
/** The minimum move count to solve n discs: 2^n - 1. */
export declare function optimalFor(n: number): number;
/**
 * Whether the play path can still finish in optimal moves: with the optimal
 * total fixed at 2^n - 1, any move beyond it has already spoiled perfection.
 */
export declare function perfectSoFar(moveCount: number, n: number): boolean;
