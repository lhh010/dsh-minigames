/**
 * Sokoban canvas renderer: the warehouse grid (panel-brick walls, glowing
 * outline goals, glowing rounded boxes, a glowing player figure), a HUD
 * (关卡/步数/得分), a clear overlay with a particle burst, and a gold win
 * overlay after the last level. Uses the shared visual kit (../theme.ts).
 */
import type { SokobanState } from './logic.ts';
export declare const CELL = 48;
export declare const HUD_H = 44;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** What the game wants rendered this frame. */
export interface SokobanView {
    totalLevels: number;
    /** Highest unlocked level number (1-based) for the progress strip. */
    unlockedThrough: number;
    /** All levels cleared: show the gold win overlay. */
    won: boolean;
    /** Paused: veil the scene with the shared pause overlay. */
    paused: boolean;
    /** The last push's animation progress (0..1), or null when idle. */
    push: {
        playerTo: {
            r: number;
            c: number;
        };
        boxTo: {
            r: number;
            c: number;
        } | null;
        t: number;
    } | null;
}
/** Draw one frame. `push` positions interpolate to their target. */
export declare function renderSokoban(ctx: CanvasRenderingContext2D, state: SokobanState, view: SokobanView): void;
