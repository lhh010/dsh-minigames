export declare const CELL = 58;
export declare const GAP = 10;
export declare const HUD_H = 32;
export declare const FOOT_H = 16;
/** Widest board (5×5) fixes the canvas size for every level. */
export declare const MAX_SIZE = 5;
export declare const BOARD_W: number;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Which tile a logical-space point lands on, or null. */
export declare function tileAt(x: number, y: number, size: number): number | null;
/**
 * Draw one frame.
 * @param par - scramble move count shown next to the HUD.
 * @param paused - show the pause overlay.
 * @param winText - level-clear subtitle, or null while playing.
 */
export declare function renderFifteen(ctx: CanvasRenderingContext2D, w: number, h: number, board: number[], size: number, level: number, moves: number, par: number, paused: boolean, winText: string | null): void;
