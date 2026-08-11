/**
 * Pac-Man pure logic: a grid maze of walls, dots and power pellets; the
 * player moves with direction input (only turning at cell centres), the two
 * ghosts chase (or flee while a power pellet is active), eating a ghost
 * scores and sends it home, touching a ghost otherwise costs a life. Eating
 * every dot wins; losing all lives ends the run. Deterministic functions
 * over a plain state object.
 */
export declare const CELL = 20;
export declare const ROWS = 15;
export declare const COLS = 19;
export declare const PAC_SPEED = 110;
export declare const GHOST_SPEED = 95;
export declare const FRIGHT_TIME = 5;
/** Seconds at the start of a round (and after a life) during which the
 * ghosts stay put, so the player can leave the spawn corridor. */
export declare const GHOST_DELAY = 1.5;
export declare const PLAYER_SPAWN: Readonly<{
    r: number;
    c: number;
}>;
export type Dir = 0 | 1 | 2 | 3;
export interface Ghost {
    x: number;
    y: number;
    dir: Dir;
    /** Home cell centre to respawn at after being eaten. */
    homeX: number;
    homeY: number;
}
export interface PacmanState {
    /** '#' | '.' | 'o' | ' ' — dots are consumed in place. */
    grid: string[][];
    px: number;
    py: number;
    /** Current travel direction. */
    dir: Dir;
    /** Desired direction; applied at the next cell centre. */
    intent: Dir;
    ghosts: Ghost[];
    /** Seconds of power-pellet fright remaining (ghosts flee, can be eaten). */
    fright: number;
    score: number;
    lives: number;
    dotsLeft: number;
    /** Countdown before the ghosts start moving (round start / after a life). */
    ghostDelay: number;
    over: boolean;
    won: boolean;
    rng: () => number;
}
export declare function isWall(state: PacmanState, r: number, c: number): boolean;
/** A fresh run: dots placed, player and ghosts at their spawns. */
export declare function createPacmanState(rng?: () => number): PacmanState;
/** Advance one frame. Returns whether the run ended this frame. */
export declare function stepPacman(state: PacmanState, dt: number): boolean;
