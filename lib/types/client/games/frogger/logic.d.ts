/**
 * 过河青蛙 (Frogger) pure logic. A frog hops across road lanes full of
 * moving cars from the bottom safe row to the top goal row; touching a car
 * costs a life. Level ramps raise lane speed and car density.
 *
 * Fully deterministic per level seed: each lane's direction, speed, and
 * initial car spacing come from the seed, and positions are a pure function
 * of elapsed seconds — no runtime randomness, so replays are identical.
 */
/** Visible columns (the frog's horizontal range). */
export declare const COLS = 13;
/** Road lanes between the bottom safe row and the top goal row. */
export declare const LANES = 6;
/**
 * Wrap track length per lane in cells: cars circulate on a loop longer than
 * the visible span, so gaps enter and exit the screen instead of syncing up.
 */
export declare const TRACK: number;
/** One road lane's deterministic spec. */
export interface LaneSpec {
    /** 1 = left→right, -1 = right→left. */
    dir: 1 | -1;
    /** Track cells per second (already level-scaled). */
    speed: number;
    /** Car start positions on the track (cells), spaced apart. */
    starts: readonly number[];
    /** Car length in cells (1 or 2). */
    length: 1 | 2;
}
/** A generated level's lanes (deterministic from the seed). */
export interface FroggerLevel {
    lanes: readonly LaneSpec[];
}
/** mulberry32 PRNG: small, fast, deterministic per seed. */
export declare function mulberry32(seed: number): () => number;
/**
 * Lane speed per lane index and level: 2.2 cells/s base, alternating lanes
 * slightly faster, +7% per level.
 */
export declare function laneSpeed(lane: number, level: number): number;
/** Car count per lane for a level (density ramp, clamped 2..4). */
export declare function carCount(level: number, lane: number): number;
/**
 * Build the level spec deterministically: alternating lane directions,
 * speeds by {@link laneSpeed}, cars evenly spread on the track with seeded
 * jitter (≥ car length + 2 apart so every lane always has a gap).
 */
export declare function levelFromSeed(seed: number, level: number): FroggerLevel;
/** A car's visible column range on a lane at time t, or null when in margin. */
export declare function carRange(spec: LaneSpec, start: number, t: number): {
    from: number;
    to: number;
} | null;
/**
 * Whether the frog on road row (0 = lane nearest the goal) at column `col`
 * is hit at time t. Row 0..LANES-1 map to lanes; other rows are safe.
 */
export declare function isHit(level: FroggerLevel, laneRow: number, col: number, t: number): boolean;
/** Clamp a hop target into 0..COLS-1. */
export declare function clampCol(col: number): number;
/** Score for one safe crossing at a level. */
export declare function crossingScore(level: number): number;
