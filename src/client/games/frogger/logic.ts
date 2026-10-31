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
export const COLS = 13
/** Road lanes between the bottom safe row and the top goal row. */
export const LANES = 6
/**
 * Wrap track length per lane in cells: cars circulate on a loop longer than
 * the visible span, so gaps enter and exit the screen instead of syncing up.
 */
export const TRACK = COLS + 6

/** One road lane's deterministic spec. */
export interface LaneSpec {
  /** 1 = left→right, -1 = right→left. */
  dir: 1 | -1
  /** Track cells per second (already level-scaled). */
  speed: number
  /** Car start positions on the track (cells), spaced apart. */
  starts: readonly number[]
  /** Car length in cells (1 or 2). */
  length: 1 | 2
}

/** A generated level's lanes (deterministic from the seed). */
export interface FroggerLevel {
  lanes: readonly LaneSpec[]
}

/** mulberry32 PRNG: small, fast, deterministic per seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Lane speed per lane index and level: 2.2 cells/s base, alternating lanes
 * slightly faster, +7% per level.
 */
export function laneSpeed(lane: number, level: number): number {
  const base = 2.2 + (lane % 2 === 0 ? 0.5 : 0)
  return base * (1 + 0.07 * (level - 1))
}

/** Car count per lane for a level (density ramp, clamped 2..4). */
export function carCount(level: number, lane: number): number {
  return Math.min(4, 2 + Math.floor((level - 1) / 2) + (lane % 3 === 0 ? 1 : 0))
}

/**
 * Build the level spec deterministically: alternating lane directions,
 * speeds by {@link laneSpeed}, cars evenly spread on the track with seeded
 * jitter (≥ car length + 2 apart so every lane always has a gap).
 */
export function levelFromSeed(seed: number, level: number): FroggerLevel {
  const rng = mulberry32(seed)
  const lanes: LaneSpec[] = []
  for (let lane = 0; lane < LANES; lane += 1) {
    const dir: 1 | -1 = lane % 2 === 0 ? 1 : -1
    const count = carCount(level, lane)
    const length: 1 | 2 = rng() < 0.35 ? 2 : 1
    const slot = TRACK / count
    const starts: number[] = []
    for (let i = 0; i < count; i += 1) {
      const jitter = (rng() - 0.5) * (slot - length - 3)
      starts.push((i * slot + Math.max(0, slot / 2 - length / 2) + jitter) % TRACK)
    }
    lanes.push({ dir, speed: laneSpeed(lane, level), starts, length })
  }
  return { lanes }
}

/** A car's visible column range on a lane at time t, or null when in margin. */
export function carRange(spec: LaneSpec, start: number, t: number): { from: number; to: number } | null {
  const pos = (((start + spec.dir * spec.speed * t) % TRACK) + TRACK) % TRACK
  const from = Math.floor(pos)
  const to = from + spec.length - 1
  if (to < 0 || from >= COLS) return null // fully inside the wrap margin
  return { from: Math.max(0, from), to: Math.min(COLS - 1, to) }
}

/**
 * Whether the frog on road row (0 = lane nearest the goal) at column `col`
 * is hit at time t. Row 0..LANES-1 map to lanes; other rows are safe.
 */
export function isHit(level: FroggerLevel, laneRow: number, col: number, t: number): boolean {
  if (laneRow < 0 || laneRow >= LANES) return false
  const spec = level.lanes[laneRow]!
  for (const start of spec.starts) {
    const range = carRange(spec, start, t)
    if (range !== null && col >= range.from && col <= range.to) return true
  }
  return false
}

/** Clamp a hop target into 0..COLS-1. */
export function clampCol(col: number): number {
  return Math.max(0, Math.min(COLS - 1, col))
}

/** Score for one safe crossing at a level. */
export function crossingScore(level: number): number {
  return 100 * level
}
