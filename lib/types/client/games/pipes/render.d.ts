/**
 * Pipes canvas renderer: the board as panel cells with rounded pipe strokes
 * (water-connected tiles glow accent-blue with flowing dashes; unconnected
 * tiles draw muted panel strokes), special 源/汇 endpoint tiles, a HUD
 * (关卡/时间/得分), and win/pause/timeout overlays. Uses the shared visual
 * kit (../theme.ts).
 */
import type { PipesState } from './logic.ts';
export declare const CELL = 52;
export declare const HUD_H = 44;
export declare const MARGIN = 16;
/** Fixed logical canvas sized to the largest board; smaller boards center. */
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** What the game wants rendered this frame. */
export interface PipesView {
    paused: boolean;
    /** Keyboard cursor cell to highlight, or null. */
    cursor: {
        r: number;
        c: number;
    } | null;
}
/** Draw one frame. */
export declare function renderPipes(ctx: CanvasRenderingContext2D, state: PipesState, view: PipesView): void;
