/**
 * 管道连线 (Flow Free) pure logic. An n×n grid holds K color pairs; the
 * player draws a simple path between each pair so that the K paths partition
 * the grid — every cell filled, no cell shared (the classic Flow Free rule).
 *
 * Generation: K random seed cells grow simultaneously into self-avoiding
 * walks (most-constrained head first) until the walks partition the grid;
 * each walk's two ends become that color's dots, so a solution always
 * exists. Every roll is verified by a node-budgeted DFS solver that counts
 * solutions up to two (endpoint-reachability, free-cell coverage, and
 * dead-cell pruning); a level ships only when exactly one solution is
 * proven, otherwise the seed advances — after the attempt cap the first
 * solvable roll ships with a 多解 badge (mirroring the slitherlink approach).
 */
/** Board edge lengths of the five levels. */
export declare const LEVEL_SIZES: readonly [5, 6, 7, 8, 9];
/** Color-pair count of the five levels (index-aligned with LEVEL_SIZES). */
export declare const LEVEL_PAIRS: readonly [4, 5, 6, 7, 8];
/** A generated level: dots to connect plus one valid solution. */
export interface FlowPuzzle {
    /** Board edge length in cells. */
    size: number;
    /** Per color: the two dot cells (the solution path's first/last cells). */
    dots: [number, number][];
    /** Per color: the generating path — cells in order, ends are the dots. */
    solution: number[][];
    /** Whether the solver proved exactly one solution. */
    unique: boolean;
}
/** Per-color player paths: ordered cell lists (first cell is a dot), or null. */
export type CellPaths = (readonly number[] | null)[];
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/** Orthogonal neighbors of a cell (grid edges only). */
export declare function neighbors(size: number, cell: number): number[];
/** True when two distinct cells share a grid edge. */
export declare function adjacent(size: number, a: number, b: number): boolean;
/** Board edge length of a 1-based level (levels wrap after 9×9). */
export declare function levelSize(level: number): number;
/** Color-pair count of a 1-based level. */
export declare function levelPairs(level: number): number;
/** Win score: base 100×level plus a time bonus that decays 10/second. */
export declare function computeScore(level: number, seconds: number): number;
/**
 * First free cell that can no longer lie on any path, or -1.
 *
 * A free interior cell needs ≥2 neighbors that are free or the active head
 * (the one cell the current path can still extend from); `head` = -1 when no
 * path is mid-extension. Unfinished endpoints (`endpoints`, free dot cells)
 * need only ≥1 — they terminate their path. Sound necessary condition used
 * by the solver's dead-end pruning; a pure helper for tests.
 */
export declare function findDeadCell(size: number, occ: readonly number[], head?: number, endpoints?: readonly number[]): number;
/**
 * Begin (or re-grab) a color's path at a dot cell.
 *
 * If the color already has a path ending at `cell`, it is returned unchanged
 * or reversed so `cell` becomes the head (extendable end); otherwise a fresh
 * one-cell path starts there — dropping any previous path for the color.
 * Non-dot cells and foreign dots are rejected (state returned unchanged).
 */
export declare function grabPath(puzzle: FlowPuzzle, paths: CellPaths, color: number, cell: number): CellPaths;
/**
 * Extend (or truncate) a color's path to an adjacent cell.
 *
 * Rules: a cell already on the own path truncates it at that cell; another
 * path's cell or another color's dot is rejected; otherwise the cell joins
 * at the head or the tail (whichever is adjacent). Non-adjacent cells and
 * colors without a path leave the state unchanged.
 */
export declare function extendPath(puzzle: FlowPuzzle, paths: CellPaths, color: number, cell: number): CellPaths;
/** A color is connected when its path runs dot-to-dot (both ends are dots). */
export declare function pathComplete(puzzle: FlowPuzzle, color: number, path: readonly number[] | null): boolean;
/** Win: every pair connected dot-to-dot and every cell covered exactly once. */
export declare function isWon(puzzle: FlowPuzzle, paths: CellPaths): boolean;
/** Count of colors whose path currently runs dot-to-dot. */
export declare function connectedCount(puzzle: FlowPuzzle, paths: CellPaths): number;
/** Solver outcome: solution count capped at 2, plus budget status. */
export interface SolveResult {
    solutions: number;
    /** True when the node budget ran out before the search space closed. */
    exhausted: boolean;
    /** Nodes visited (0 on early stop at two solutions). */
    nodes: number;
}
/**
 * Count solutions up to two via DFS with pruning.
 *
 * Colors route in fixed order; each branch grows a simple path from the
 * color's first dot to its partner over free cells. After every placement a
 * sound prune runs: one flood from the growing head plus every future dot
 * must reach the partner and cover all free cells, and no free cell may be
 * a dead end ({@link findDeadCell}). The generated solution always sits in
 * the search space, so a full search reports solutions ≥ 1.
 */
export declare function solveCount(puzzle: FlowPuzzle, maxNodes?: number): SolveResult;
/** Generation attempts per puzzle: uniqueness re-rolls, larger boards fewer. */
export declare function attemptCap(size: number): number;
/** Solver node budget per board size: decisions on 8×8 need ~1M nodes. */
export declare function solveBudget(size: number): number;
/**
 * Generation budget per board size, in TOTAL solver nodes across all re-roll
 * attempts (a deterministic proxy for wall-clock: proofs cost seconds each on
 * big boards, so the loop is budget-boxed rather than count-boxed — same seed
 * always replays the same rolls in the same order).
 */
export declare function genNodeBudget(size: number): number;
/**
 * Generate a puzzle deterministically from `seed`.
 *
 * Re-rolls derived seeds until the solver proves exactly one solution
 * (unique: true); the loop stops at the attempt cap OR the cumulative node
 * budget, whichever first — on big boards proofs cost ~1M nodes each, so the
 * budget bounds the hang. After that the first solvable roll ships with
 * unique: false (the 多解 badge). Fully deterministic: no wall-clock input.
 */
export declare function puzzleFromSeed(seed: number, size: number, pairs: number, requireUnique?: boolean): FlowPuzzle;
