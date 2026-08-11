/**
 * Breakout pure logic: a paddle, a ball, and a brick wall. The ball bounces
 * off the paddle (with angle depending on the hit position) and off bricks,
 * which are destroyed on hit. Each brick row has a fixed color; the ball takes
 * the color of the last brick it destroyed, and destroying a brick that
 * matches the ball color scores a bonus. Losing the ball ends the run;
 * clearing the wall moves to the next level with a faster ball. Deterministic
 * functions over a plain state object.
 */
export interface Brick {
    x: number;
    y: number;
    hp: number;
    color: number;
}
export interface BreakoutState {
    /** Paddle centre x. */
    paddleX: number;
    ball: {
        x: number;
        y: number;
        vx: number;
        vy: number;
        color: number;
    };
    bricks: Brick[];
    score: number;
    level: number;
    lives: number;
    over: boolean;
    rng: () => number;
}
export declare const VIEW_W = 480;
export declare const VIEW_H = 320;
export declare const PADDLE_W = 70;
export declare const PADDLE_Y: number;
export declare const BALL_R = 6;
export declare const BRICK_W = 48;
export declare const BRICK_H = 16;
export declare const BRICK_ROWS = 5;
export declare const BRICK_COLS = 8;
/** Score multiplier when the destroyed brick matches the ball color. */
export declare const MATCH_BONUS = 3;
/** The 5 brick rows, one color per row; the ball takes this palette too. */
export declare const BRICK_COLORS: readonly ["#4c9ae8", "#4cd0c9", "#5abf6b", "#e8c84c", "#e88a4c"];
/** A fresh level-1 wall. */
export declare function createBreakoutState(rng?: () => number): BreakoutState;
/** Rebuild the wall for the next level with a faster ball. */
export declare function nextLevel(state: BreakoutState): void;
/** Move the paddle towards a target x (clamped to the walls). */
export declare function movePaddle(state: BreakoutState, targetX: number): void;
/**
 * Advance one frame. Returns the ball state for rendering: { lost, cleared }.
 */
export declare function stepBreakout(state: BreakoutState, dt: number): {
    lost: boolean;
    cleared: boolean;
};
