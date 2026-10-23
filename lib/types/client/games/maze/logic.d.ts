/**
 * Pure maze logic: seeded perfect-maze generation (randomized DFS spanning
 * tree — every cell reachable, exactly one path between any two cells), wall
 * queries, and BFS distances. No DOM, no state; the same seed always yields
 * the identical maze.
 */
/** Wall bits set in each Maze cell (bitwise OR of open directions). */
export declare const N = 1;
export declare const E = 2;
export declare const S = 4;
export declare const W = 8;
/**
 * A perfect maze on a w×h cell grid.
 *
 * `walls` holds one byte per cell (row-major, index y*w+x): the bitmask of
 * OPEN passages — bit 1 = north open, 2 = east, 4 = south, 8 = west. Border
 * walls never open, so neighbor pairs stay symmetric (A's E open ⇔ the
 * east neighbor's W open).
 */
export interface Maze {
    w: number;
    h: number;
    walls: Uint8Array;
}
/**
 * Generate a perfect maze of w×h cells with randomized DFS (iterative, own
 * stack). Same seed → identical wall bitmask.
 * @param seed deterministic RNG seed
 * @param w cell columns (≥ 3)
 * @param h cell rows (≥ 3)
 */
export declare function generateMaze(seed: number, w: number, h: number): Maze;
/** Direction names as used by canMove. */
export type MazeDir = 'up' | 'right' | 'down' | 'left';
/**
 * Whether the player at cell (x, y) may step one cell toward `dir`.
 * @returns true when the shared wall is open and the target is in bounds.
 */
export declare function canMove(maze: Maze, x: number, y: number, dir: MazeDir): boolean;
/**
 * BFS shortest-path length in cells between two cells of a perfect maze
 * (always connected, so every pair resolves).
 * @param from start cell {x,y}
 * @param to target cell {x,y}
 * @returns number of steps; -1 only if a cell is out of bounds
 */
export declare function bfsDistance(maze: Maze, from: {
    x: number;
    y: number;
}, to: {
    x: number;
    y: number;
}): number;
/**
 * Shortest solution length: top-left (0,0) → bottom-right (w-1,h-1).
 * @returns BFS distance in steps; positive for any w,h ≥ 2
 */
export declare function solveLength(maze: Maze): number;
