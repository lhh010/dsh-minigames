/**
 * 记独 (Hitori) pure logic. An n×n grid of numbers 1..n carries deliberate
 * duplicates; the player shades cells so that no number repeats in any row
 * or column among the WHITE cells, no two shaded cells touch orthogonally,
 * and the white cells stay connected.
 *
 * Generation: solution-first — start from a shuffled Latin square, pick a
 * no-touch black set (whites kept connected), then overwrite each black
 * cell with a neighboring white value so shading exactly that set solves
 * the board by construction. A budgeted DFS counts shadings up to two;
 * a level ships only when exactly one solution is proven, else the seed
 * advances — after the attempt cap the first roll ships with a 多解 badge
 * (the flow pattern).
 */
/** Board edge lengths of the five levels. */
export declare const LEVEL_SIZES: readonly [5, 6, 7, 8, 8];
/** A generated level. */
export interface HitoriPuzzle {
    /** Board edge length in cells. */
    size: number;
    /** grid[r][c] values 1..size with duplicates. */
    grid: readonly (readonly number[])[];
    /** The generating shading: true = black (shaded). */
    solution: readonly boolean[];
    /** Whether the solver proved exactly one solution. */
    unique: boolean;
}
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/** Board edge length of a 1-based level (levels wrap after the 5th). */
export declare function levelSize(level: number): number;
/** Win score: base 100×level plus a time bonus that decays 5/second. */
export declare function computeScore(level: number, seconds: number): number;
/** Orthogonal neighbors of a cell (grid edges only). */
export declare function neighbors(size: number, cell: number): number[];
/**
 * Full rule check for a complete shading: no orthogonally adjacent blacks,
 * every row/column has distinct white values, and the whites are one
 * connected region.
 */
export declare function isWon(puzzle: HitoriPuzzle, blacks: ReadonlySet<number>): boolean;
/** Solver outcome: shadings found (capped at 2), budget status, nodes. */
export interface SolveResult {
    solutions: number;
    /** True when the node budget ran out before the search space closed. */
    exhausted: boolean;
    nodes: number;
}
/**
 * Count rule-satisfying shadings up to two via DFS over cells in row-major
 * order. Branch white first (most cells stay white); prune on black
 * adjacency, white duplicates within a completed row (and partial columns),
 * and white-connectivity viability (whites + undecided connected through
 * whites-or-undecided). Returns count with budget status.
 */
export declare function solveCount(puzzle: HitoriPuzzle, maxNodes?: number): SolveResult;
/** Generation attempts per puzzle. */
export declare function attemptCap(size: number): number;
/**
 * Generate a puzzle deterministically from seed. Re-rolls until the solver
 * proves exactly one shading; after the attempt cap the first solvable
 * roll ships with unique: false. Returns null when no roll was solvable.
 */
export declare function puzzleFromSeed(seed: number, size: number): HitoriPuzzle | null;
