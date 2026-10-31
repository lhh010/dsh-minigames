/**
 * 露营帐篷 (Tents and Trees) pure logic. An n×n grid holds T trees; the
 * player places exactly one tent orthogonally adjacent to each tree so that
 * no two tents touch (even diagonally) and every row/column tent count
 * matches its clue.
 *
 * Generation: trees land on spread cells (Chebyshev distance ≥ 2 apart), a
 * randomized backtracking match assigns each tree a tent, and the row/column
 * counts come from that assignment. Each roll is verified by a node-budgeted
 * deterministic solver that counts matchings up to two; a level ships only
 * when exactly one solution is proven, otherwise the seed advances — after
 * the attempt cap the first solvable roll ships with a 多解 badge (the
 * flow/slitherlink pattern).
 */
/** Board edge lengths and tree counts of the ten levels. */
export declare const LEVEL_SIZES: readonly [6, 7, 8, 9, 10, 8, 9, 10, 11, 12];
export declare const LEVEL_TREES: readonly [8, 10, 12, 14, 16, 15, 18, 20, 22, 24];
/** A generated level: trees plus the row/column tent-count clues. */
export interface TentsPuzzle {
    /** Board edge length in cells. */
    size: number;
    /** Cells occupied by trees (cell = r * size + c). */
    trees: readonly number[];
    /** Per row: required tent count. */
    rowCounts: readonly number[];
    /** Per column: required tent count. */
    colCounts: readonly number[];
    /** Whether the solver proved exactly one solution. */
    unique: boolean;
}
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/** Board edge length of a 1-based level (levels wrap after the 10th). */
export declare function levelSize(level: number): number;
/** Tree count of a 1-based level. */
export declare function levelTrees(level: number): number;
/** Win score: base 100×level plus a time bonus that decays 5/second. */
export declare function computeScore(level: number, seconds: number): number;
/** Cells sharing an edge with `cell`. */
export declare function orthNeighbors(size: number, cell: number): number[];
/** True when two distinct cells touch orthogonally or diagonally. */
export declare function touches(size: number, a: number, b: number): boolean;
/**
 * Legal tent placement check for interactive play: grass cell, no tree, and
 * no touching (8-neighborhood) tent already placed.
 */
export declare function canPlaceTent(size: number, trees: readonly number[], tents: readonly number[], cell: number): boolean;
/**
 * Win: tent count equals tree count, every tree has an adjacent tent, no
 * tent touches another, and every row/column count matches its clue.
 */
export declare function isWon(puzzle: TentsPuzzle, tents: readonly number[]): boolean;
/** Solver outcome: matchings found (capped at 2), budget status, nodes. */
export interface SolveResult {
    solutions: number;
    /** True when the node budget ran out before the search space closed. */
    exhausted: boolean;
    nodes: number;
}
/**
 * Count valid tree→tent matchings up to two via backtracking. Trees route in
 * row-major order; each tries its free orthogonal cells under the no-touch
 * and row/column-capacity rules, pruning when any unassigned tree has no
 * candidate left. Returns solution count with budget status.
 */
export declare function solveCount(puzzle: TentsPuzzle, maxNodes?: number): SolveResult;
/** Generation attempts per puzzle: uniqueness re-rolls, smaller boards more. */
export declare function attemptCap(size: number): number;
/**
 * Generate a puzzle deterministically from `seed`.
 *
 * Re-rolls derived seeds until the solver proves exactly one matching;
 * after the attempt cap the first solvable roll ships with unique: false.
 * Returns null only when no roll produced a solvable placement at all.
 */
export declare function puzzleFromSeed(seed: number, size: number, trees: number): TentsPuzzle | null;
