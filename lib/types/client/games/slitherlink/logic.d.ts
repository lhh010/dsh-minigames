/**
 * Slitherlink 数回 pure logic. A puzzle is a w×h CELL grid; edges live on the
 * lattice dots around them. Edge encoding (flat array, row-major):
 *   - horizontal edges: (w+1) columns × h rows   → indices [0, (w+1)*h)
 *   - vertical edges:   w columns × (h+1) rows   → indices [(w+1)*h, ...)
 * EdgeState: 0 unknown / 1 line / 2 cross. Clue cells hold 0-3 or -1 (blank).
 */
export type EdgeState = 0 | 1 | 2;
export type Clue = -1 | 0 | 1 | 2 | 3;
export interface SlitherlinkPuzzle {
    w: number;
    h: number;
    clues: Clue[];
    /** 1 on cycle edges, 0 elsewhere. */
    solution: EdgeState[];
    unique: boolean;
}
export declare function hEdgeIndex(w: number, _h: number, col: number, row: number): number;
export declare function vEdgeIndex(w: number, _h: number, col: number, row: number): number;
export declare function edgeCount(w: number, h: number): number;
/** The four edge indices around cell (c, r): [N, E, S, W]. */
export declare function cellEdges(w: number, h: number, c: number, r: number): [number, number, number, number];
/** mulberry32 seeded PRNG. */
export declare function mulberry32(seed: number): () => number;
/** Every clue cell exactly satisfied. */
export declare function checkClues(edges: EdgeState[], clues: Clue[], w: number, h: number): boolean;
/**
 * Cycle check: every dot touched by drawn edges has degree exactly 2, and all
 * drawn edges form one connected component.
 */
export declare function cycleCheck(edges: EdgeState[], w: number, h: number): {
    singleCycle: boolean;
    degreeOk: boolean;
};
export declare function isSolved(edges: EdgeState[], clues: Clue[], w: number, h: number): boolean;
/**
 * Fixpoint line solving. Two deduction families iterate to convergence:
 *  1. per-clue placement enumeration (deduceLine);
 *  2. cross-cell edge propagation — a dot where two edges are already lines
 *     forces the other two to crosses, and a dot where two are crosses
 *     forces the other two to lines (degree-2 rule at every dot).
 * Contradictions abort and return the input unchanged.
 */
export declare function lineSolve(clues: Clue[], known: EdgeState[], w: number, h: number): EdgeState[];
/** Generate a puzzle: random single cycle over the lattice, clues from it,
 * verified (optionally) by line solving. */
export declare function puzzleFromSeed(seed: number, w: number, h: number, requireUnique?: boolean): SlitherlinkPuzzle;
/** Level sizes for the five levels. */
export declare const LEVEL_SIZES: readonly [number, number][];
