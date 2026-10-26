import { describe, expect, it } from 'vitest'
import {
  BASE_SPEED, HIT_MIN_Y, LANE_COUNT, MISS_Y, PREFILL_ROWS, ROW_H, SPEED_ADD_MAX,
  attractStep, comboMultiplier, createState, mulberry32, pressLane, speedAt, spawnTile,
  startRun, step, togglePause, type PianoState,
} from '../src/client/games/piano/logic.ts'

const DT = 1 / 60

/** Advance n frames. */
function run(state: PianoState, secs: number): void {
  for (let i = 0; i < Math.round(secs / DT); i += 1) step(state, DT)
}

/** Step one frame at a time until the lowest unhit tile's top is inside the
 * hit zone ([HIT_MIN_Y, MISS_Y]); returns that tile's lane. */
function waitLowestInZone(state: PianoState): number {
  for (let i = 0; i < 600; i += 1) {
    let lowest: { y: number; lane: number } | null = null
    for (const t of state.tiles) {
      if (t.hit) continue
      if (lowest === null || t.y > lowest.y) lowest = t
    }
    if (lowest !== null && lowest.y >= HIT_MIN_Y && lowest.y <= MISS_Y) return lowest.lane
    step(state, DT)
    if (state.result !== 'playing') break
  }
  throw new Error('no tile reached the hit zone')
}

/** A lane that currently has NO unhit tile in the hit zone. */
function emptyZoneLane(state: PianoState): number {
  const busy = new Set<number>()
  for (const t of state.tiles) {
    if (!t.hit && t.y >= HIT_MIN_Y && t.y <= MISS_Y) busy.add(t.lane)
  }
  for (let l = 0; l < LANE_COUNT; l += 1) if (!busy.has(l)) return l
  throw new Error('all lanes busy in zone')
}

/** Deterministic hit script: hit the lowest tile n times. */
function playHits(state: PianoState, n: number): void {
  for (let i = 0; i < n; i += 1) {
    const lane = waitLowestInZone(state)
    expect(pressLane(state, lane)).toBe(true)
  }
}

describe('piano tiles logic', () => {
  it('mulberry32 is deterministic and in range', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 50; i += 1) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('createState prefills one seeded tile per row, tops spaced ROW_H apart', () => {
    const s = createState(42)
    expect(s.result).toBe('ready')
    expect(s.tiles).toHaveLength(PREFILL_ROWS)
    for (const t of s.tiles) {
      expect(t.lane).toBeGreaterThanOrEqual(0)
      expect(t.lane).toBeLessThan(LANE_COUNT)
      expect(t.len).toBeGreaterThanOrEqual(1)
      expect(t.len).toBeLessThanOrEqual(2)
      expect(t.hit).toBe(false)
    }
    const tops = s.tiles.map(t => t.y).sort((a, b) => a - b)
    for (let i = 1; i < tops.length; i += 1) expect(tops[i]! - tops[i - 1]!).toBeCloseTo(ROW_H)
  })

  it('spawnTile always yields exactly one valid lane per row', () => {
    const rng = mulberry32(99)
    const lanes = new Set<number>()
    for (let i = 0; i < 400; i += 1) {
      const t = spawnTile(rng, -i * ROW_H)
      expect(Number.isInteger(t.lane)).toBe(true)
      expect(t.lane).toBeGreaterThanOrEqual(0)
      expect(t.lane).toBeLessThan(LANE_COUNT)
      lanes.add(t.lane)
    }
    expect(lanes.size).toBe(LANE_COUNT) // every lane occurs
  })

  it('seeded generation is deterministic (same seed → same tiles)', () => {
    const snap = (s: PianoState): string =>
      JSON.stringify(s.tiles.map(t => [t.lane, t.len]))
    expect(snap(createState(1234))).toBe(snap(createState(1234)))
    expect(snap(createState(1234))).not.toBe(snap(createState(1235)))
  })

  it('a press in the hit zone scores and builds combo', () => {
    const s = createState(5)
    startRun(s)
    expect(s.result).toBe('playing')
    const lane = waitLowestInZone(s)
    expect(pressLane(s, lane)).toBe(true)
    expect(s.combo).toBe(1)
    expect(s.hits).toBe(1)
    expect(s.score).toBe(1)
    expect(s.events.filter(e => e.kind === 'hit')).toHaveLength(1)
  })

  it('a press above the zone (too early) ends the run', () => {
    const s = createState(5)
    startRun(s)
    // At start the lowest tile top is well above the zone.
    expect(s.tiles.some(t => t.y >= HIT_MIN_Y)).toBe(false)
    pressLane(s, s.tiles[0]!.lane) // its tile exists but is above the zone
    expect(s.result).toBe('over')
    expect(s.failReason).toBe('wrong')
  })

  it('a wrong-lane press with no tile in the zone ends the run', () => {
    const s = createState(5)
    startRun(s)
    waitLowestInZone(s)
    pressLane(s, emptyZoneLane(s))
    expect(s.result).toBe('over')
    expect(s.failReason).toBe('wrong')
  })

  it('a tile scrolling fully past the hit zone is a miss and ends the run', () => {
    const s = createState(5)
    startRun(s)
    run(s, 5) // never press
    expect(s.result).toBe('over')
    expect(s.failReason).toBe('miss')
  })

  it('hit tiles scroll past harmlessly (no miss after a hit)', () => {
    const s = createState(5)
    startRun(s)
    playHits(s, 3)
    const hitTiles = s.tiles.filter(t => t.hit)
    expect(hitTiles.length).toBeGreaterThan(0)
    // Keep hitting subsequent tiles while the earlier hit tiles travel past
    // the bottom edge; a hit tile crossing MISS_Y must not end the run.
    const first = hitTiles[0]!
    for (let i = 0; i < 120 && s.result === 'playing'; i += 1) {
      const lane = waitLowestInZone(s)
      expect(pressLane(s, lane)).toBe(true)
    }
    expect(s.result).toBe('playing')
    expect(first.y).toBeGreaterThan(MISS_Y)
    expect(s.failReason).toBe('')
  })

  it('combo multiplier math: +1 per 8 combo, capped at 8', () => {
    expect(comboMultiplier(0)).toBe(1)
    expect(comboMultiplier(1)).toBe(1)
    expect(comboMultiplier(7)).toBe(1)
    expect(comboMultiplier(8)).toBe(2)
    expect(comboMultiplier(15)).toBe(2)
    expect(comboMultiplier(16)).toBe(3)
    expect(comboMultiplier(56)).toBe(8)
    expect(comboMultiplier(64)).toBe(8)
    expect(comboMultiplier(1000)).toBe(8)
    expect(comboMultiplier(-3)).toBe(1)
  })

  it('speed ramp: linear from BASE, capped at BASE + SPEED_ADD_MAX', () => {
    expect(speedAt(0)).toBe(BASE_SPEED)
    expect(speedAt(10)).toBe(BASE_SPEED + 70)
    expect(speedAt(66)).toBe(BASE_SPEED + SPEED_ADD_MAX)
    expect(speedAt(10000)).toBe(BASE_SPEED + SPEED_ADD_MAX)
    for (let h = 0; h < 70; h += 7) expect(speedAt(h + 1)).toBeGreaterThanOrEqual(speedAt(h))
  })

  it('score accumulates with the combo multiplier (7×1 then 2 per hit)', () => {
    const s = createState(5)
    startRun(s)
    playHits(s, 10)
    expect(s.hits).toBe(10)
    expect(s.combo).toBe(10)
    // hits 1-7 score 1 each; hits 8-10 (combo ≥ 8) score 2 each.
    expect(s.score).toBe(7 * 1 + 3 * 2)
  })

  it('over state is inert to steps and presses', () => {
    const s = createState(5)
    startRun(s)
    run(s, 5)
    expect(s.result).toBe('over')
    const frozen = JSON.stringify({ tiles: s.tiles, score: s.score, t: s.t })
    run(s, 1)
    expect(pressLane(s, 0)).toBe(false)
    expect(JSON.stringify({ tiles: s.tiles, score: s.score, t: s.t })).toBe(frozen)
  })

  it('same seed + input script → identical snapshots', () => {
    const play = (seed: number): string => {
      const s = createState(seed)
      startRun(s)
      playHits(s, 12)
      run(s, 0.25)
      return JSON.stringify({ tiles: s.tiles, score: s.score, combo: s.combo, hits: s.hits, t: s.t })
    }
    expect(play(777)).toBe(play(777))
    expect(play(777)).not.toBe(play(778))
  })

  it('startRun replays the same seed identically (R restart)', () => {
    const s = createState(31337)
    startRun(s)
    playHits(s, 6)
    startRun(s) // restart mid-run: same seed → same initial field
    const fresh = createState(31337)
    startRun(fresh)
    expect(JSON.stringify(s.tiles)).toBe(JSON.stringify(fresh.tiles))
    expect(s.score).toBe(0)
    expect(s.result).toBe('playing')
  })

  it('pause freezes scrolling: no dt advance while paused', () => {
    const s = createState(5)
    startRun(s)
    togglePause(s)
    expect(s.result).toBe('paused')
    const frozen = JSON.stringify(s.tiles)
    run(s, 2)
    attractStep(s, 0.5)
    expect(pressLane(s, 0)).toBe(false)
    expect(JSON.stringify(s.tiles)).toBe(frozen)
    expect(s.score).toBe(0)
    togglePause(s)
    expect(s.result).toBe('playing')
  })

  it('togglePause is a no-op outside playing/paused', () => {
    const s = createState(5)
    togglePause(s)
    expect(s.result).toBe('ready')
    attractStep(s, 0.5)
    expect(s.result).toBe('ready')
    expect(s.score).toBe(0)
  })
})
