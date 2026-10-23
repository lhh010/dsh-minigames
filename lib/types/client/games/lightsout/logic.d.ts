/**
 * Lights Out 点灯 pure logic: clicking a cell toggles it and its orthogonal
 * neighbors; the board starts solved and is scrambled by applying N random
 * toggles, so every board is solvable by repeating them. Deterministic
 * functions only — no DOM, no timers.
 */
export declare const SIZE = 5;
/** Scramble toggles at level 1. */
export declare const BASE_TOGGLES = 4;
/** Scramble toggles cap. */
export declare const MAX_TOGGLES = 12;
export type Cell = boolean;
export type Board = Cell[][];
/** [row, col] of one toggled cell. */
export type Move = [number, number];
/** Deterministic mulberry32 PRNG (see tests/pipes-logic.spec.ts precedent). */
export declare function mulberry32(seed: number): () => number;
/** A solved (all-off) board. */
export declare function emptyBoard(): Board;
/** In-bounds orthogonal neighbors of a cell, excluding the cell itself. */
export declare function neighbors(r: number, c: number): Move[];
/**
 * Toggle a cell and its orthogonal neighbors.
 * @returns a new board; the input is unchanged.
 */
export declare function toggleAt(board: Board, r: number, c: number): Board;
/** True when every light is off. */
export declare function isSolved(board: Board): boolean;
/** Scramble toggle count for a level: 4 at level 1, +1 per level, capped at 12. */
export declare function scrambleCount(level: number): number;
/** The N toggle cells a scramble applies, deterministically from the seed. */
export declare function scrambleMoves(seed: number, n: number): Move[];
/**
 * Build a level board: solved board scrambled by n seed-determined toggles.
 * Applying the same toggles again solves it.
 */
export declare function scramble(seed: number, n: number): Board;
