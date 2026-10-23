/**
 * Maze canvas renderer: neon wall segments on a dark grid, a glowing player
 * dot with a fading trail, a pulsing exit marker at the far corner, and the
 * 关卡/步数 HUD. Uses the shared visual kit (../theme.ts).
 */
import { type Maze } from './logic.ts';
export declare const CELL = 34;
export declare const HUD_H = 44;
/** Fixed logical canvas sized to the largest level maze; smaller mazes center. */
export declare const MAX_COLS = 19;
export declare const MAX_ROWS = 17;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Trail length (positions kept fading behind the player). */
export declare const TRAIL_MAX = 14;
/** What the game wants rendered this frame. */
export interface MazeView {
    /** Player cell position. */
    player: {
        x: number;
        y: number;
    };
    /** Recent player positions, oldest first (length ≤ TRAIL_MAX). */
    trail: {
        x: number;
        y: number;
    }[];
    /** 1-based level number for the HUD. */
    level: number;
    /** Steps taken this level. */
    moves: number;
    /** Shortest possible path length for the current maze. */
    shortest: number;
    /** Level-complete overlay text (null while playing). */
    winText: string | null;
}
/** Top-left pixel of the maze grid region for a w×h maze. */
export declare function gridOffset(maze: Maze): {
    ox: number;
    oy: number;
};
/** Cell center in canvas pixels. */
export declare function cellCenter(maze: Maze, x: number, y: number): {
    px: number;
    py: number;
};
/** Draw one frame. */
export declare function renderMaze(ctx: CanvasRenderingContext2D, maze: Maze, view: MazeView): void;
