/**
 * Tower-defense pure logic: an 11×9 tile map with a seeded corridor path
 * (left edge → right edge), three tower kinds, waves of enemies following
 * the waypoints, homing/lobbed projectiles, and a gold/lives/score economy.
 * Deterministic given (seed, commands, dt sequence); the game instance in
 * index.ts drives it with the frame loop and the unit tests drive it
 * directly.
 */
/** Deterministic 32-bit rng (map generation + spawn jitter). */
export declare function mulberry32(seed: number): () => number;
export declare const GRID_W = 11;
export declare const GRID_H = 9;
/** Waves per level; clearing wave 10 advances the level (levels wrap 1..5). */
export declare const WAVES_PER_LEVEL = 10;
export declare const LEVEL_WRAP = 5;
export declare const START_GOLD = 120;
export declare const START_LIVES = 3;
/** Seconds of build (pre-wave) time before the wave auto-starts. */
export declare const BUILD_TIME = 15;
/**
 * Combat early-call window: once this wave's spawn queue drains, Space calls
 * the NEXT wave immediately — its enemies fight alongside the survivors
 * (overlap = harder). The bonus decays with this window, so calling sooner
 * pays more. The wave never auto-overlaps: at 0 only the bonus is gone.
 */
export declare const CALL_TIME = 12;
export type TowerKind = 'arrow' | 'frost' | 'cannon';
/** Static per-kind metadata (cost / upgrade prices / display name). */
export interface TowerInfo {
    cost: number;
    /** Upgrade prices for Lv1→2 and Lv2→3. */
    upgrades: readonly [number, number];
    name: string;
}
export declare const TOWER_INFO: Record<TowerKind, TowerInfo>;
/** Combat stats of one tower at one level (all tiles/seconds). */
export interface TowerStats {
    dmg: number;
    /** Seconds between shots. */
    cooldown: number;
    /** Range in tiles (center to center). */
    range: number;
    /** Cannon only: splash radius in tiles. */
    splash?: number;
    /** Frost only: speed reduction 0..1. */
    slowFactor?: number;
    /** Frost only: slow duration in seconds. */
    slowDuration?: number;
}
/** Combat stats of `kind` at `level` (1-3). */
export declare function towerStats(kind: TowerKind, level: number): TowerStats;
/** Upgrade price from `level` to the next (0 when already Lv3). */
export declare function upgradeCost(kind: TowerKind, level: number): number;
export interface Waypoint {
    x: number;
    y: number;
}
/** Map seed for a (base seed, level) pair — the same pair replays identically. */
export declare function mapSeed(seed: number, level: number): number;
/**
 * Dig the fixed corridor path for a map seed: an alternating right/vertical
 * walk from the left edge to the right edge. Consecutive waypoints share a
 * row or column; the walk always ends at x = GRID_W - 1.
 */
export declare function generatePath(seed: number): Waypoint[];
/** Boolean corridor grid (true = path tile; towers cannot be placed there). */
export declare function pathTilesOf(path: readonly Waypoint[]): boolean[][];
/** Total corridor length in tiles (axis-aligned segments). */
export declare function pathLength(path: readonly Waypoint[]): number;
/** Point on the corridor polyline at arc distance `dist` (tile units). */
export declare function positionAt(path: readonly Waypoint[], dist: number): {
    x: number;
    y: number;
};
export interface Tower {
    id: number;
    kind: TowerKind;
    tx: number;
    ty: number;
    level: number;
    /** Seconds until the tower may fire again. */
    cooldown: number;
    /** Total gold paid (base + upgrades) — the sell refund base. */
    spent: number;
}
export interface Enemy {
    id: number;
    hp: number;
    maxHp: number;
    /** Base speed in tiles/s (already brute/level-scaled). */
    speed: number;
    brute: boolean;
    /** Arc distance traveled along the corridor, in tiles. */
    dist: number;
    /** Remaining slow duration in seconds (0 = not slowed). */
    slowTime: number;
    /** Active speed reduction 0..1 (strongest applied magnitude). */
    slowFactor: number;
    alive: boolean;
}
export interface Projectile {
    kind: 'homing' | 'lob';
    x: number;
    y: number;
    dmg: number;
    /** Homing only: tracked enemy id. */
    targetId: number;
    /** Homing only: travel speed in tiles/s. */
    speed: number;
    /** Frost only: slow magnitude/duration applied on hit. */
    slowFactor: number;
    slowDuration: number;
    /** Lob only: launch point, locked impact point, flight seconds, splash radius. */
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    t: number;
    flight: number;
    splash: number;
}
/** Transient visual explosion (pure state, decayed in step). */
export interface Effect {
    x: number;
    y: number;
    t: number;
    life: number;
}
export type TdPhase = 'build' | 'wave';
export type TdResult = 'none' | 'lose';
export interface TdState {
    seed: number;
    level: number;
    wave: number;
    path: Waypoint[];
    pathTiles: boolean[][];
    towers: Tower[];
    enemies: Enemy[];
    projectiles: Projectile[];
    effects: Effect[];
    gold: number;
    lives: number;
    /** Points = gold spent on towers/upgrades + all wave/early bonuses. */
    score: number;
    phase: TdPhase;
    /** Seconds left in the build phase before the wave auto-starts. */
    buildTimer: number;
    /** Early-call bonus window left during combat (next wave overlap). */
    callTimer: number;
    /** Enemies still to spawn this wave. */
    spawnQueue: number;
    spawnTimer: number;
    /** Whether the final queued enemy of this wave is a brute. */
    brutePending: boolean;
    /** Endless mode: entered after clearing wave 10 of level LEVEL_WRAP; the
     * wave counter keeps climbing with exponentially scaling enemy HP. */
    endless: boolean;
    result: TdResult;
    t: number;
    nextId: number;
    rng: () => number;
}
/** Enemy count of wave `wave`. */
export declare function waveSize(wave: number): number;
/** Endless HP growth per extra wave beyond the level-5 campaign (×1.22). */
export declare const ENDLESS_HP_GROWTH = 1.22;
/** Endless speed growth per extra wave (×1.03, capped at 2× base). */
export declare const ENDLESS_SPEED_GROWTH = 1.03;
/** Gold granted for killing an enemy during wave `wave`. */
export declare function killGold(wave: number): number;
/** Gold granted for clearing wave `wave`. */
export declare function waveClearBonus(wave: number): number;
/** Early-send bonus for sending the wave with `remaining` build seconds left. */
export declare function earlySendBonus(remaining: number): number;
/** A fresh game state at `level` (defaults to 1) on the seeded map. */
export declare function createState(seed: number, level?: number): TdState;
/** Restart the current level: same map seed, gold back to start, wave 1. */
export declare function restartLevel(state: TdState): void;
/**
 * Start the wave now. From the build phase this runs the pending wave; from
 * combat (queue drained, a next wave exists) it OVERLAPS: the next wave's
 * enemies join the fight immediately. The early-call bonus is granted by
 * {@link sendWaveEarly}, which routes both paths.
 */
export declare function startWave(state: TdState): void;
/**
 * Send the next wave early: grants +10 gold per remaining second and starts
 * the wave immediately. In the build phase that just skips the countdown; in
 * combat (queue drained) it overlaps the next wave onto the survivors —
 * harder fight, paid for with the bonus. Calling mid-combat trades the
 * overlapped wave's clear bonus for the early bonus.
 */
export declare function sendWaveEarly(state: TdState): void;
/** Whether a tower may be built on tile (tx, ty): in bounds, off the path,
 * on a free tile. Gold is checked separately by {@link buildTower}. */
export declare function canBuild(state: TdState, tx: number, ty: number): boolean;
/** Build `kind` on (tx, ty) when allowed and affordable; adds cost to score. */
export declare function buildTower(state: TdState, kind: TowerKind, tx: number, ty: number): boolean;
/** Sell a tower for 60% of everything paid for it. */
export declare function sellTower(state: TdState, towerId: number): boolean;
/** Upgrade a tower one level (max Lv3) when affordable; adds price to score. */
export declare function upgradeTower(state: TdState, towerId: number): boolean;
/** Apply damage (+ optional slow) to an enemy; kills grant gold. Slow stacks
 * duration at the same magnitude; a stronger magnitude replaces and resets. */
export declare function hitEnemy(state: TdState, enemy: Enemy, dmg: number, slowFactor?: number, slowDuration?: number): void;
/** Effective enemy speed in tiles/s (base × slow reduction while slowed). */
export declare function enemySpeed(enemy: Enemy): number;
/** Explode a cannon shell at (x, y): every enemy within the splash radius
 * takes the full damage. */
export declare function explode(state: TdState, x: number, y: number, dmg: number, splash: number): void;
/**
 * Advance the game by dt seconds (clamp to <= 1/20 upstream).
 * @param state - the game state (mutated in place).
 * @param dt - elapsed seconds.
 */
export declare function step(state: TdState, dt: number): void;
