/**
 * 推箱子 (Sokoban) pure logic: grid parsing/validation, player moves with
 * single-box pushes, undo with full state restore, and clear detection.
 * Deterministic functions over a plain state object; no DOM. The game
 * instance in index.ts drives rendering and level flow, and the unit tests
 * drive the logic directly (including a BFS solvability check over the
 * built-in levels).
 */
export interface Position {
    r: number;
    c: number;
}
/** A parsed level: static geometry plus the initial box/player layout. */
export interface SokobanLevel {
    rows: number;
    cols: number;
    /** true = wall. */
    walls: boolean[][];
    /** true = goal cell. */
    goals: boolean[][];
    /** true = box (initial layout). */
    boxes: boolean[][];
    player: Position;
}
/** One applied move, kept for undo and animation. */
export interface SokobanMove {
    playerFrom: Position;
    playerTo: Position;
    boxFrom: Position | null;
    boxTo: Position | null;
    /** A box landed on a goal this move (+100). */
    scored: boolean;
    /** This push cleared the level (+500). */
    cleared: boolean;
}
export interface SokobanState {
    levelIndex: number;
    rows: number;
    cols: number;
    walls: boolean[][];
    goals: boolean[][];
    boxes: boolean[][];
    player: Position;
    moves: number;
    score: number;
    /** Score when the current level started; restart rolls back to it. */
    entryScore: number;
    history: SokobanMove[];
    cleared: boolean;
}
/** Score awarded when a box lands on a goal. */
export declare const BOX_SCORE = 100;
/** Score awarded when the level is cleared. */
export declare const CLEAR_SCORE = 500;
/**
 * The 10 built-in levels, microban-style, ≤ 12x12, ordered by difficulty.
 * Tiles: # wall, space floor, $ box, . goal, * box-on-goal, @ player,
 * + player-on-goal.
 */
export declare const LEVELS: string[];
/**
 * Parse level text into geometry + initial layout. Rows are padded to the
 * widest row; any non-wall character is walkable floor.
 * @param text - the level tiles.
 * @returns the parsed level.
 * @throws when the text has no rows, not exactly one player, or the box and
 *   goal counts differ.
 */
export declare function parseLevel(text: string): SokobanLevel;
/** Parse all built-in levels (validation happens in parseLevel). */
export declare function parseBuiltinLevels(): SokobanLevel[];
/** Whether every box sits on a goal cell. */
export declare function isCleared(state: SokobanState): boolean;
/** Reset the state to the given level's initial layout, keeping the score. */
export declare function loadLevel(state: SokobanState, levelIndex: number): void;
/** Restart the current level (rolls the score back to the level entry). */
export declare function restartLevel(state: SokobanState): void;
/**
 * A fresh state on the given level.
 * @param levelIndex - built-in level to load (0-based).
 * @param score - score carried in from previous levels.
 */
export declare function createSokobanState(levelIndex?: number, score?: number): SokobanState;
/**
 * Try to move the player one cell in `dir` (up/down/left/right), pushing a
 * single box when the target cell holds one and the cell beyond it is free
 * (floor or goal). Updates moves/score/history/cleared on success.
 * @returns the applied move, or null when blocked (wall, box-into-wall,
 *   box-into-box) or the level is already cleared.
 */
export declare function applyMove(state: SokobanState, dir: 'up' | 'down' | 'left' | 'right'): SokobanMove | null;
/**
 * Undo the last move: restore the player, the pushed box, the move count,
 * the score, and the cleared flag exactly.
 * @returns the undone move, or null when there is nothing to undo.
 */
export declare function undoMove(state: SokobanState): SokobanMove | null;
