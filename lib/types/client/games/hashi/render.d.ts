/**
 * 桥 (Hashi) canvas renderer on the shared theme kit: gradient background, a
 * faint corner lattice, bridges as one or two parallel glowing strokes,
 * numbered island discs that ring green when satisfied and red when
 * over-bridged, a pulsing selection ring, the 关卡/桥数 HUD with a
 * 唯一解/多解 badge, and the shared win overlay with a particle burst.
 */
import type { HashiPuzzle, Island, Placed } from './logic.ts';
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** Cell edge for one level's board size. */
export declare function cellSize(size: number): number;
/** Logical centre of an island. */
export declare function centerOf(island: Island, size: number): {
    x: number;
    y: number;
};
/**
 * The island under a logical point, or null. The hit radius is generous so
 * small 9x9 cells stay clickable.
 * @param islands - the level's islands.
 * @param size - board edge length in cells.
 * @param x - logical x.
 * @param y - logical y.
 */
export declare function islandAt(islands: Island[], size: number, x: number, y: number): number | null;
/** Draw one frame. */
export declare function renderHashi(ctx: CanvasRenderingContext2D, puzzle: HashiPuzzle, placed: Placed, selected: number | null, level: number, elapsed: number, paused: boolean, winText: string | null): void;
