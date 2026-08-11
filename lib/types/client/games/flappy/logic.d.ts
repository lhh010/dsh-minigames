/**
 * Flappy pure logic: a bird at a fixed x that falls under gravity and flaps
 * upward on input; pairs of pipes scroll in from the right, each pair scores
 * when the bird passes it, and hitting a pipe (or the floor/ceiling) ends the
 * run. Deterministic functions over a plain state object.
 */
export declare const VIEW_W = 300;
export declare const VIEW_H = 450;
export declare const BIRD_X = 90;
export declare const BIRD_R = 13;
export declare const PIPE_W = 52;
export declare const GAP_H = 150;
export declare const PIPE_SPACING = 185;
export declare const GRAVITY = 620;
export declare const FLAP_VY = -270;
export interface Pipe {
    x: number;
    gapY: number;
    scored: boolean;
}
export interface FlappyState {
    /** Bird centre y (0 = top of the view). */
    y: number;
    vy: number;
    pipes: Pipe[];
    score: number;
    over: boolean;
    rng: () => number;
}
/** A fresh run: bird mid-screen, first pipe already approaching. */
export declare function createFlappyState(rng?: () => number): FlappyState;
/** A flap impulse (click / space). */
export declare function flap(state: FlappyState): void;
/** Advance one frame. Returns whether the run ended this frame. */
export declare function stepFlappy(state: FlappyState, dt: number): boolean;
