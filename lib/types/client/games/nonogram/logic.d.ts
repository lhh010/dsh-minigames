/**
 * Nonogram (数织) pure logic: a 10x10 boolean pattern whose row/column run
 * clues uniquely determine it. Patterns come from a mulberry32 PRNG at
 * ~50-60% density and are re-rolled until a line solver deduces every cell
 * from the clues alone, so each level has exactly one solution. Cell marks
 * are 0 empty / 1 filled / 2 crossed; crosses never affect the win check.
 */
export declare const SIZE = 10;
/** Seeded levels offered by the game panel. */
export declare const LEVELS = 6;
/** Player cell mark: 0 empty, 1 filled, 2 crossed (X). */
export type Cell = 0 | 1 | 2;
/** Row and column clues: run lengths, [0] for an empty line. */
export interface Clues {
    rows: number[][];
    cols: number[][];
}
/** One solver line: null unknown, true filled, false empty. */
export type Known = (boolean | null)[];
/** Derive the row and column clues of a square pattern. */
export declare function cluesFrom(pattern: boolean[][]): Clues;
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/**
 * Deduce every cell of a line that all valid placements agree on.
 * Contradictory input (no valid placement) returns `known` unchanged.
 * @param clue - run lengths for the line ([0] means empty).
 * @param known - current deductions for the line.
 * @returns the refined line (null where still ambiguous).
 */
export declare function lineSolveLine(clue: number[], known: Known): Known;
/**
 * Iterate the line solver over all rows and columns from an empty grid
 * until no cell changes; classic nonogram line-deduction convergence.
 * @returns the deduced grid, null where the clues are insufficient.
 */
export declare function solveFromClues(clues: Clues): Known[];
/**
 * A deterministic 10x10 pattern for one seed: ~50-60% density, re-rolled
 * (advancing the PRNG) until its clues uniquely determine it by line solving.
 */
export declare function makePattern(seed: number): boolean[][];
/**
 * Win check: filled cells must exactly match the pattern; crosses (2) and
 * empties (0) are both "not filled" and never block or grant a win.
 */
export declare function checkWin(cells: Cell[][], pattern: boolean[][]): boolean;
