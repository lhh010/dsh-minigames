/**
 * The five canonical 管道连线 puzzles, one per board size, embedded so no
 * runtime generation ever runs. Generation on 8×8/9×9 spends seconds of
 * synchronous solver time (the old freeze); these were produced offline with
 * the exact runtime recipe — seed displayLevel × 0x9e3779b9 through
 * puzzleFromSeed — so they are bit-identical to what the game used to build
 * on the fly. Levels past 5 cycle these boards (sizes already wrap
 * 5×5→9×9); regenerate via scripts/ if logic.ts generation ever changes.
 */
import type { FlowPuzzle } from './logic.ts';
/** Puzzle for 1-based display level 1..5 (index level-1). */
export declare const EMBEDDED_PUZZLES: readonly FlowPuzzle[];
