/**
 * Bomberman pure logic: a 13×11 tile-grid world — player/enemy movement with
 * wall, brick and actor collisions (grid-fraction dir/targetDir movement in
 * the tanks-engine spirit), cross-shaped bombs with a 2.2s fuse and chain
 * detonation, flow-field-chasing enemy AI, level progression (5 levels then
 * wrap) and scoring (100 per enemy, 10 per brick). Deterministic given
 * (dt, input, rng); the game instance in index.ts drives it with rAF and the
 * unit tests drive it directly.
 */
export declare const TILE = 32;
export declare const GRID_W = 13;
export declare const GRID_H = 11;
/** 0 empty, 1 brick (destructible), 2 wall (indestructible border/pillar). */
export type Tile = 0 | 1 | 2;
/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
export declare const DIR_DX: readonly number[];
export declare const DIR_DY: readonly number[];
export declare const FUSE_S = 2.2;
export declare const BLAST_RANGE = 2;
export declare const MAX_BOMBS = 2;
export declare const LEVELS = 5;
/** Seconds the "level cleared" overlay waits before auto-advancing. */
export declare const ADVANCE_DELAY = 1.5;
export declare const AI_TICK = 0.45;
export interface Actor {
    /** Top-left pixel position. */
    x: number;
    y: number;
    dir: Dir;
    /** Desired heading; applied like tanks (turn once the lane fits). */
    targetDir: Dir;
    alive: boolean;
}
export interface Bomb {
    tx: number;
    ty: number;
    /** Seconds remaining until detonation. */
    fuse: number;
}
/** Transient flame visual — pure model state, decayed in step. */
export interface Flame {
    tx: number;
    ty: number;
    t: number;
}
export interface PlayerInput {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}
/** 'none' playing; 'cleared' all enemies dead (advance countdown); 'lose' player dead. */
export type GameResult = 'none' | 'cleared' | 'lose';
export interface WorldState {
    grid: Tile[][];
    level: number;
    player: Actor;
    enemies: Actor[];
    bombs: Bomb[];
    flames: Flame[];
    score: number;
    result: GameResult;
    /** Countdown to the next level while {@link result} is 'cleared'. */
    advanceTimer: number;
    t: number;
    /** AI decision accumulator (seconds since last tick). */
    aiTimer: number;
    /** BFS flow field toward the player's tile, rebuilt each decision tick. */
    flow: Int16Array | null;
    rng: () => number;
}
/** Player spawn corner (bottom-left pocket). */
export declare const PLAYER_START: readonly [number, number];
/** Enemy spawn tiles (3 far corners + center), used in order. */
export declare const ENEMY_SPAWNS: readonly [number, number][];
/** 3×3 corner pockets kept clear so spawns are never walled in. */
export declare const CORNER_POCKETS: readonly [number, number][];
/** Deterministic mulberry32 PRNG (same construction as lightsout/logic.ts). */
export declare function mulberry32(seed: number): () => number;
/** Brick density for a level: denser bricks on higher levels (0.32 → 0.56). */
export declare function brickDensity(level: number): number;
/**
 * Seeded level layout: indestructible border, fixed pillars on even/even
 * inner tiles, rng-scattered bricks, clear 3×3 spawn pockets.
 * @param level - 1-based level number (drives density).
 * @param rng - injected seeded rng (layout is deterministic per seed).
 */
export declare function generateLayout(level: number, rng: () => number): Tile[][];
/** Enemies fielded on a level (2 at level 1, 3 at 2, 4 at 3+). */
export declare function enemiesForLevel(level: number): number;
/**
 * A fresh world at `level` (score starts at 0; use {@link startLevel} to
 * advance while keeping the accumulated score).
 * @param level - 1-based level number.
 * @param rng - injected seeded rng, stored on the world for AI decisions.
 */
export declare function createWorld(level: number, rng: () => number): WorldState;
/** Reset to `nextLevel` keeping the score (auto-advance uses it). */
export declare function startLevel(state: WorldState, nextLevel: number, rng: () => number): void;
/** Restart a level from scratch: same layout seed, score back to 0 (R and
 * death-restart both use it — a fresh attempt must not inherit the aborted
 * run's score). */
export declare function resetLevel(state: WorldState, rng: () => number): void;
/** Grid tile at tile coords; out of bounds counts as solid wall. */
export declare function tileAt(grid: Tile[][], tx: number, ty: number): Tile;
/** Tile an actor's center sits on. */
export declare function actorTile(actor: Actor): [number, number];
/**
 * Try to move an actor by `dist` px in `dir`; blocked by walls, bricks and
 * other living actors. A blocked move still snaps to the approached tile
 * boundary (tanks-engine convention).
 * @returns whether the actor actually moved.
 */
export declare function tryMove(state: WorldState, actor: Actor, dir: Dir, dist: number): boolean;
/**
 * Move an actor toward its desired heading. Turning is free: the actor turns
 * the moment its (inset) body fits the new lane; before stepping, the
 * perpendicular axis slides onto the nearest lane centre when walkable.
 * @returns whether the actor actually moved.
 */
export declare function moveActor(state: WorldState, actor: Actor, targetDir: Dir, dist: number): boolean;
/** Flow-field distance at tile coords (-1 = wall/unreachable/out of grid). */
export declare function flowAt(flow: Int16Array, tx: number, ty: number): number;
/**
 * BFS flow field of walking distances from one tile over OPEN tiles only
 * (bricks block the enemies — they cannot dig). Used by the enemy AI to
 * chase the player around walls.
 */
export declare function buildFlowField(grid: Tile[][], tx: number, ty: number): Int16Array;
/**
 * The blast of a bomb at (tx, ty): a cross of `range` tiles per arm. Walls
 * stop an arm with no flame; the first brick on an arm is destroyed and the
 * flame stops there. Pure — returns the flame tiles and the bricks hit.
 */
export declare function computeBlast(grid: Tile[][], tx: number, ty: number, range?: number): {
    tiles: [number, number][];
    bricks: [number, number][];
};
/**
 * Place a bomb at the player's tile (max {@link MAX_BOMBS} active, one per
 * tile). Called by the instance on Space keydown and directly by tests.
 * @returns whether a bomb was placed.
 */
export declare function placeBomb(state: WorldState): boolean;
/**
 * Advance the world by dt seconds under the player's held inputs. Inert once
 * the player is dead ('lose'): the world only ticks visual flame decay.
 * @param state - the world (mutated in place).
 * @param dt - elapsed seconds (clamp to <=1/30 upstream).
 * @param input - player held keys this frame.
 */
export declare function stepWorld(state: WorldState, dt: number, input: PlayerInput): void;
