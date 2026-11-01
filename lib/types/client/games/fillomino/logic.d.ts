/**
 * 装填方块 (Fillomino) pure logic. The grid is partitioned into connected
 * regions (polyominoes); one clue cell per region carries the region size.
 * The player fills every cell with a number so that each maximal connected
 * same-number group has exactly that many cells (clues are locked).
 *
 * Generation: regions grow simultaneously from seeded anchors (most
 * constrained head first, like flow) until the grid is covered; each region
 * plants its size at a random member cell. Solvable by construction; a
 * budgeted solver counts completions only on the smallest boards — levels
 * beyond that ship with a 多解 badge (the flow pattern).
 */
/** Board edge lengths of the five levels. */
export declare const LEVEL_SIZES: readonly [6, 7, 8, 9, 10];
/** A generated level. */
export interface FilloPuzzle {
    /** Board edge length in cells. */
    size: number;
    /** Clue cells: cell index → region size (locked values). */
    clues: ReadonlyMap<number, number>;
    /** The generating fill: per-cell region size (the solution). */
    solution: readonly number[];
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
 * Win: every cell filled 1..maxRegion, every clue matches its cell value,
 * and every maximal connected same-value group's size equals its value.
 */
export declare function isWon(puzzle: FilloPuzzle, grid: readonly number[]): boolean;
/** Solver outcome: fills found (capped at 2), budget status, nodes. */
export interface SolveResult {
    solutions: number;
    /** True when the node budget ran out before the search space closed. */
    exhausted: boolean;
    nodes: number;
}
/**
 * Count rule-satisfying fills up to two via DFS over undecided cells.
 * Values range 1..maxRegion (bigger groups never pay); the group-size rule
 * is checked incrementally: a growing group may not exceed its value, and a
 * closed group must equal it. Only run on the smallest boards — larger
 * boards ship without a uniqueness proof.
 */
export declare function solveCount(puzzle: FilloPuzzle, maxNodes?: number): SolveResult;
/** Generation attempts per puzzle (a roll always ships; kept for parity). */
export declare function attemptCap(size: number): number;
/**
 * Generate a puzzle deterministically from seed. Every roll is solvable by
 * construction (the generating fill is a valid completion); uniqueness is
 * not probed — fillomino completions are plentiful, so levels ship with
 * unique: false and the win check is purely rule-based.
 */
export declare function puzzleFromSeed(seed: number, size: number): FilloPuzzle;
