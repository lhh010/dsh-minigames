/**
 * Mini Go AI: a heuristic evaluator plus a shallow 2-ply local search.
 * Level 0 = greedy heuristic, 1 = + capture/atari handling, 2 = 2-ply search
 * with a node budget. All tie-breaks are deterministic (lowest board index).
 */
import { type GoBoard } from './logic.ts';
/**
 * Static evaluation from aiColor's perspective (positive = good for the AI):
 * stone and liberty balance, atari pressure both ways, local shape, and a
 * mild center preference while the board is still empty.
 */
export declare function evaluate(board: GoBoard, aiColor: number): number;
/**
 * Choose the AI move: a point index, or -1 to pass.
 * @param level - 0 greedy, 1 with capture/atari handling, 2 two-ply search.
 */
export declare function chooseMove(board: GoBoard, aiColor: number, level: number, prev: GoBoard | null): number;
