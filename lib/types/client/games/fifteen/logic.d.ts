/**
 * 15-Puzzle 数字华容道 pure logic: an n×n board of tiles 1..n²-1 plus one
 * blank (0). A slide moves the tile adjacent to the blank into the blank; the
 * arrow direction names the TILE's movement (pressing ← slides the tile right
 * of the blank leftward). Scrambles apply seeded random legal moves from the
 * solved state, so every scramble is solvable by construction.
 */
/** mulberry32 PRNG (same construction as lightsout/logic.ts). */
export declare function mulberry32(seed: number): () => number;
/** Direction a TILE moves (the blank swaps the opposite way). */
export type Dir = 'up' | 'down' | 'left' | 'right';
/** A slide: a tile direction, or the flat index of a tile adjacent to the blank. */
export type SlideMove = Dir | number;
/** Opposite direction (undo of a dir slide). */
export declare function opposite(dir: Dir): Dir;
/** A solved board for `size`: 1..size²-1 in order, blank (0) last. */
export declare function createSolved(size: number): number[];
/** Flat index of the blank (0). */
export declare function blankIndex(board: number[]): number;
/**
 * Apply one slide (direction or adjacent tile index).
 * @returns a new board, or null for an illegal move; the input is unchanged.
 */
export declare function slide(board: number[], move: SlideMove): number[] | null;
/** True when the tiles are in solved order (blank last). */
export declare function isSolved(board: number[]): boolean;
/**
 * Inversions-rule solvability check for the goal order 1..n²-1, blank last.
 * Odd width: solvable iff inversions are even. Even width: solvable iff
 * inversions plus the blank's row counting from the bottom is odd.
 */
export declare function solvableParity(board: number[], size: number): boolean;
/** Scramble move count for a board size: 40 × size/4 (30/40/50 for 3/4/5). */
export declare function scrambleMovesFor(size: number): number;
/**
 * Scramble from `board` by n seeded random legal moves (re-rolling whenever
 * the result would be solved, so the output is never already-solved).
 * @returns the scrambled board and the number of moves actually applied (par).
 */
export declare function scrambleFrom(board: number[], seed: number, n: number): {
    board: number[];
    moves: number;
};
