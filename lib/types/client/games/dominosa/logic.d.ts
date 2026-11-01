/**
 * 多米诺分解 (Dominosa) pure logic. The grid holds the complete domino set
 * of order n — every pair (a, b) with 0 <= a <= b <= n exactly once — laid
 * out as numbers; the player partitions the grid into adjacent pairs so
 * that every domino of the set appears exactly once.
 *
 * Generation: a random perfect matching of the grid (randomized DFS),
 * values from each matched pair; a budgeted solver counts matchings whose
 * pair multiset equals the full set up to two — a level ships only when
 * exactly one solution is proven, else the seed advances; after the
 * attempt cap the first solvable roll ships with a 多解 badge (the flow
 * pattern).
 */
/** Domino-set orders of the five levels (grid = (n+1) × (n+2)). */
export declare const LEVEL_ORDERS: readonly [4, 5, 6, 7, 8];
/** A generated level. */
export interface DominoPuzzle {
    /** Domino-set order n: values 0..n, (n+1)(n+2)/2 dominoes. */
    order: number;
    /** Grid rows (values 0..n). */
    grid: readonly (readonly number[])[];
    /** The generating matching: pairs of cell indices (r * cols + c). */
    solution: readonly (readonly [number, number])[];
    /** Whether the solver proved exactly one solution. */
    unique: boolean;
}
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/** Domino-set order of a 1-based level (levels wrap after the 5th). */
export declare function levelOrder(level: number): number;
/** Win score: base 100×level plus a time bonus that decays 5/second. */
export declare function computeScore(level: number, seconds: number): number;
/** True when two cell indices are horizontally or vertically adjacent. */
export declare function adjacent(cells: number, a: number, b: number): boolean;
/** Win: every cell in exactly one adjacent pair, and the pair multiset
 * equals the complete domino set of the level order. */
export declare function isWon(puzzle: DominoPuzzle, pairs: readonly (readonly [number, number])[]): boolean;
/** Solver outcome: matchings found (capped at 2), budget status, nodes. */
export interface SolveResult {
    solutions: number;
    /** True when the node budget ran out before the search space closed. */
    exhausted: boolean;
    nodes: number;
}
/**
 * Count set-exhausting matchings up to two. The first unmatched cell (row
 * major) pairs with its right/down neighbor only when that domino is still
 * unused; the search ends when every domino of the set is consumed exactly
 * as the grid fills. Returns count with budget status.
 */
export declare function solveCount(puzzle: DominoPuzzle, maxNodes?: number): SolveResult;
/** Generation attempts per puzzle: uniqueness re-rolls. */
export declare function attemptCap(order: number): number;
/**
 * Generate a puzzle deterministically from seed. Re-rolls until the solver
 * proves exactly one set-exhausting matching; after the attempt cap the
 * first roll ships with unique: false. Returns null when no roll produced
 * a full-set tiling at all.
 */
export declare function puzzleFromSeed(seed: number, order: number): DominoPuzzle | null;
