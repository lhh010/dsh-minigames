/**
 * Tank battle pure logic: a Battle-City-style world model over a tile grid —
 * player/enemy movement with wall and tank collisions, bullets that destroy
 * brick (and die on steel), enemy AI (chase + line-of-sight shooting), wave
 * spawning, and win/lose. Deterministic given (dt, input, rng); the game
 * instance in index.ts drives it with rAF and the unit tests drive it
 * directly.
 */
export declare const TILE = 32;
export declare const GRID_W = 15;
export declare const GRID_H = 13;
/** 0 empty, 1 brick (destructible), 2 steel (indestructible). */
export type Tile = 0 | 1 | 2;
/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
export declare const DIR_DX: readonly number[];
export declare const DIR_DY: readonly number[];
export interface Tank {
    id: number;
    kind: 'player' | 'enemy';
    /** Top-left pixel position. */
    x: number;
    y: number;
    /** Actual heading (also the fire direction). */
    dir: Dir;
    /**
     * Desired heading: the tank only turns onto it once aligned with the tile
     * grid in the perpendicular axis (classic grid-locked turning), so it never
     * wedges itself straddling two lanes.
     */
    targetDir: Dir;
    hp: number;
    /** Seconds until the tank may fire again. */
    cooldown: number;
    alive: boolean;
    /** Seconds of post-hit invulnerability (player only; enemies die in one hit). */
    invuln: number;
    /**
     * Per-enemy sidestep chance against an incoming player bullet (0 = never;
     * the player tank leaves this unset).
     */
    dodge?: number;
}
export interface Bullet {
    x: number;
    y: number;
    dir: Dir;
    owner: 'player' | 'enemy';
}
export interface PlayerInput {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    /** Fire is level-triggered; the world respects the cooldown. */
    fire: boolean;
}
export type GameResult = 'none' | 'win' | 'lose';
/** Transient visual effect (explosion) — pure model state, decayed in step. */
export interface Effect {
    x: number;
    y: number;
    /** Elapsed seconds. */
    t: number;
    /** Total lifetime in seconds. */
    life: number;
}
export interface WorldState {
    grid: Tile[][];
    /** Which battle map the current wave plays on (index into {@link MAPS}). */
    mapIndex: number;
    player: Tank;
    enemies: Tank[];
    bullets: Bullet[];
    effects: Effect[];
    score: number;
    wave: number;
    /** Enemies still to spawn this wave. */
    spawnQueue: number;
    spawnTimer: number;
    /** Enemy decision accumulator (seconds since last decision). */
    aiTimer: number;
    /**
     * BFS flow field toward the player's tile, refreshed on each decision tick
     * (null before the first tick). Enemies chase by walking the gradient.
     */
    flow: Int16Array | null;
    result: GameResult;
    t: number;
    rng: () => number;
}
export declare const WAVES = 3;
export declare const ENEMIES_PER_WAVE = 5;
export declare const MAX_ALIVE = 3;
export declare const AI_TICK = 0.45;
/** Primary spawn tiles (enemies appear on these). */
export declare const SPAWN_POINTS: readonly [number, number][];
/** 2-wide pockets so a spawned tank can actually drive out of the border. */
export declare const SPAWN_POCKETS: readonly [number, number][];
export declare const PLAYER_START: [number, number];
/** Number of battle maps; waves rotate through them in order. */
export declare const MAP_COUNT: number;
/** Map index played by a wave (1-based wave number). */
export declare function mapIndexForWave(wave: number): number;
declare function buildGrid(mapIndex: number): Tile[][];
export { buildGrid };
/** A fresh world at wave 1. */
export declare function createWorld(rng?: () => number): WorldState;
/** Grid tile at tile coords; out of bounds counts as solid steel. */
export declare function tileAt(grid: Tile[][], tx: number, ty: number): Tile;
/** Try to move a tank by dist px in dir; blocked by walls and other tanks. */
export declare function tryMove(state: WorldState, tank: Tank, dir: Dir, dist: number): boolean;
/** Flow-field distance at tile coords (-1 = wall/unreachable/out of grid). */
export declare function flowAt(flow: Int16Array, tx: number, ty: number): number;
/**
 * BFS flow field of walking distances from one tile over open tiles (brick
 * counts as open: it is shootable, and the field is rebuilt every decision
 * tick anyway). Used by the enemy AI to route around walls toward the player.
 */
export declare function buildFlowField(grid: Tile[][], tx: number, ty: number): Int16Array;
/**
 * Advance the world by dt seconds under the player's held inputs.
 * @param state - the world (mutated in place).
 * @param dt - elapsed seconds (clamp to <=1/30 upstream).
 * @param input - player held keys this frame.
 */
export declare function stepWorld(state: WorldState, dt: number, input: PlayerInput): void;
