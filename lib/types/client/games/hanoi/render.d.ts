/**
 * Tower of Hanoi canvas renderer: 3 rods with rounded-rect discs in accent
 * ramp colors, a 层数/步数 HUD (with the 完美线 marker while the path is still
 * optimal), and overlays for pause and level-clear. State (selected rod, held
 * disc, toast) is caller-owned; the renderer stays stateless and uses the
 * shared visual kit (../theme.ts).
 */
import { type HanoiState } from './logic.ts';
export declare const HUD_H = 32;
export declare const GAP = 12;
export declare const DISC_H = 18;
export declare const DISC_GAP = 5;
export declare const BASE_DISC_W = 44;
export declare const STEP_DISC_W = 13;
export declare const ROD_TOP: number;
export declare const ROD_H: number;
export declare const LOGICAL_W = 460;
export declare const LOGICAL_H: number;
/** Center x of a rod in logical space. */
export declare function rodCenterX(rod: number): number;
/** Which rod a logical-space x lands on, or null (any height: rods are columns). */
export declare function rodAt(x: number): number | null;
/**
 * Draw one frame.
 * @param selected - keyboard-focused rod index, or null to hide the ring.
 * @param heldRod - rod whose top disc is lifted, or null when none is held.
 * @param par - optimal move count for the level (HUD 最少).
 * @param perfect - show the 完美线 marker (path still optimal).
 * @param toast - transient illegal-move message, or null.
 * @param paused - show the pause overlay.
 * @param winText - level-clear overlay subtitle, or null while playing.
 */
export declare function renderHanoi(ctx: CanvasRenderingContext2D, w: number, h: number, state: HanoiState, selected: number | null, heldRod: number | null, level: number, moves: number, par: number, perfect: boolean, paused: boolean, winText: string | null, toast: string | null): void;
