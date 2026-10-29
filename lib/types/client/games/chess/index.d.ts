/**
 * Chess game definition: wires the pure rules and the negamax AI into a
 * {@link MiniGameInstance} — click a piece then a highlighted target to move;
 * the AI (Black) answers after a short delay. Four levels ramp the search
 * depth (2→5 ply, shared node budget). Promotion pops a picker; P pauses,
 * R restarts the current game; a draw replays the level.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const chessGame: MiniGameDefinition;
