/**
 * Tower-defense rendering: the tile board (corridor path, towers, range
 * circles, enemies, projectiles), the HUD strip, and the clickable toolbar
 * (three tower buttons + upgrade/sell). Pure canvas drawing driven by the
 * logic state; hit-testing helpers are exported so index.ts shares the same
 * layout constants for pointer input.
 */
import { type TdState, type TowerKind } from './logic.ts';
export declare const TILE = 48;
export declare const HUD_H = 44;
export declare const TOOLBAR_H = 68;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
export interface ToolbarHit {
    kind: TowerKind | 'upgrade' | 'sell';
}
/** Board tile under logical point (x, y), or null outside the board. */
export declare function cellAt(x: number, y: number): {
    tx: number;
    ty: number;
} | null;
/** Toolbar button under logical point (x, y), or null outside the toolbar. */
export declare function toolbarAt(x: number, y: number): ToolbarHit | null;
export interface TdView {
    state: TdState;
    paused: boolean;
    /** Toolbar tower kind currently selected for building. */
    selectedKind: TowerKind | null;
    /** Currently selected placed tower (range circle + upgrade/sell target). */
    selectedTowerId: number | null;
    /** Hovered board tile for the build ghost, or null. */
    hover: {
        tx: number;
        ty: number;
    } | null;
}
/** Draw the full game frame (board + HUD + toolbar + overlays). */
export declare function renderTd(ctx: CanvasRenderingContext2D, view: TdView): void;
