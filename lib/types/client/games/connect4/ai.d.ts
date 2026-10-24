/**
 * Connect Four AI: negamax with alpha-beta pruning, window-based evaluation,
 * center-first move ordering, iterative deepening, and a node budget. Fully
 * deterministic — the same position and depth always yield the same column.
 */
import { type Board } from './logic.ts';
export declare const NODE_BUDGET = 200000;
/** Static evaluation from `color`'s perspective (positive = good for color). */
export declare function evaluate(board: Board, color: number): number;
/**
 * Choose the AI's column. Iterative deepening to maxDepth with the node
 * budget; ties break by center-first column order (deterministic).
 */
export declare function chooseMove(board: Board, aiColor: 1 | 2, maxDepth: number, budget?: number): number;
