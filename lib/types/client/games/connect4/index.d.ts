/**
 * Connect Four game definition: wires the pure rules and the alpha-beta AI
 * into a {@link MiniGameInstance} — click a column (or press 1-7) to drop,
 * the AI replies after a short delay; levels ramp the search depth.
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const connect4Game: MiniGameDefinition;
