/**
 * Piano Tiles renderer: 4 lanes with divider lines, the judge window at the
 * bottom, glowing tiles (dimmed once resolved), lane press-flash feedback,
 * hold progress, lives HUD, and the ready/pause/over overlays. All drawing
 * happens in the fixed logical space (LOGICAL_W x FIELD_H).
 */
import { type PianoState } from './logic.ts';
export declare const LOGICAL_W = 360;
export declare const LOGICAL_H = 640;
export interface PianoView {
    state: PianoState;
    paused: boolean;
    /** Best score to show in the corner (panel-managed). */
    best: number;
}
/** Center x of a lane column. */
export declare function laneCenter(lane: number): number;
/** Draw one frame. */
export declare function renderPiano(ctx: CanvasRenderingContext2D, view: PianoView): void;
