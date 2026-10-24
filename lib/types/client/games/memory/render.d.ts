/**
 * Memory-match canvas renderer: a grid of face-down cards with emoji symbols,
 * face-up cards highlighted, matched pairs removed, a moves HUD, and a
 * particle burst when a pair matches. Uses the shared visual kit
 * (../theme.ts).
 */
import type { MemoryState } from './logic.ts';
export declare const CELL = 48;
export declare const HUD_H = 32;
export declare const BOARD_W: number;
export declare const BOARD_H: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/**
 * Draw one frame.
 * @param paused - show the pause overlay.
 */
export declare function renderMemory(ctx: CanvasRenderingContext2D, state: MemoryState, paused: boolean): void;
