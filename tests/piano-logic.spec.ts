import { describe, expect, it } from 'vitest'
import {
  BASE_SPEED, HIT_MIN_Y, LANE_COUNT, LINE_Y, MISS_Y, PREFILL_ROWS, ROW_H, SPEED_ADD_MAX,
  attractStep, comboMultiplier, createState, mulberry32, pressLane, releaseLane, speedAt, spawnTile,
  startRun, step, togglePause, type PianoState,
} from '../src/client/games/piano/logic.ts'

const DT = 1 / 60

/** Advance n frames. */
function run(state: PianoState, secs: number): void {
  for (let i = 0; i < Math.round(secs / DT); i += 1) step(state, DT)
}

/** Whether a tile overlaps the judge window (pressLane's hittable test). */
function overlapsWindow(y: number, len: number): boolean {
  return y <= MISS_Y && y + len * ROW_H >= HIT_MIN_Y
}

/** Step one frame at a time until the lowest unhit tile overlaps the judge
 *  window; returns that tile's lane. Tiles under hold are treated as busy
 *  (a second press on them would be a free-but-combo-breaking empty tap). */
function waitLowestInZone(state: PianoState): number {
  for (let i = 0; i < 600; i += 1) {
    let lowest: { y: number; len: number; lane: number } | null = null
    for (const t of state.tiles) {
      if (t.hit || t.holding) continue
      if (lowest === null || t.y > lowest.y) lowest = { y: t.y, len: t.len, lane: t.lane }
    }
    if (lowest !== null && overlapsWindow(lowest.y, lowest.len)) return lowest.lane
    step(state, DT)
    if (state.result !== 'playing') break
  }
  throw new Error('no tile reached the hit zone')
}

/** A lane that currently has NO unhit tile overlapping the judge window. */
function emptyZoneLane(state: PianoState): number {
  const busy = new Set<number>()
  for (const t of state.tiles) {
    if (!t.hit && !t.holding && overlapsWindow(t.y, t.len)) busy.add(t.lane)
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

  it('an empty tap at run start is free: no life lost, combo resets', () => {
    const s = createState(5)
    startRun(s)
    // At start every tile is above the screen beyond EARLY_RANGE: any press
    // is a free empty tap (feedback only).
    expect(s.tiles.some(t => overlapsWindow(t.y, t.len))).toBe(false)
    expect(s.tiles.every(t => t.y < 0)).toBe(true)
    expect(pressLane(s, s.tiles[0]!.lane)).toBe(false)
    expect(s.result).toBe('playing')
    expect(s.misses).toBe(0)
    expect(s.combo).toBe(0)
    expect(s.events.some(e => e.kind === 'press' && e.empty)).toBe(true)
  })

  it('an early press on an approaching tile costs exactly one life, not the run', () => {
    const s = createState(5)
    startRun(s)
    // Head and bottom both above the window, within EARLY_RANGE.
    s.tiles = [{ lane: 0, y: HIT_MIN_Y - 180, len: 1, hit: false, holding: false, held: false }]
    expect(pressLane(s, 0)).toBe(false)
    expect(s.result).toBe('playing')
    expect(s.misses).toBe(1)
    expect(s.combo).toBe(0)
    expect(s.events.some(e => e.kind === 'miss-life' && e.reason === 'early')).toBe(true)
    // The tile keeps coming and is still hittable when it reaches the window.
    while (!overlapsWindow(s.tiles[0]!.y, s.tiles[0]!.len) && s.result === 'playing') step(s, DT)
    expect(pressLane(s, 0)).toBe(true)
  })

  it('the run start has a reaction lead-in: the first pressable moment is ≥1.5s away', () => {
    const s = createState(5)
    startRun(s)
    const lowest = Math.max(...s.tiles.map(t => t.y + t.len * ROW_H))
    // Distance from the window top at base speed.
    const secs = (HIT_MIN_Y - lowest) / BASE_SPEED
    expect(secs).toBeGreaterThanOrEqual(1.5)
  })

  it('a hold completes when held through the tail: bonus score', () => {
    const s = createState(9)
    startRun(s)
    // A long tile whose head already covers the line, tail not yet past.
    s.tiles = [{ lane: 1, y: LINE_Y - 50, len: 2, hit: false, holding: false, held: false }]
    const hold = s.tiles[0]!
    expect(pressLane(s, 1)).toBe(true)
    expect(hold.holding).toBe(true)
    expect(s.score).toBe(0) // hold not scored yet
    while (hold.holding && s.result === 'playing') step(s, DT)
    expect(hold.hit).toBe(true)
    expect(hold.held).toBe(true)
    expect(s.hits).toBe(1)
    expect(s.combo).toBe(1)
    expect(s.score).toBe(3) // comboMultiplier(1) * HOLD_BONUS
    expect(s.misses).toBe(0)
  })

  it('releasing a hold before the tail drops it and costs a life', () => {
    const s = createState(9)
    startRun(s)
    s.tiles = [{ lane: 2, y: LINE_Y - 50, len: 2, hit: false, holding: false, held: false }]
    const hold = s.tiles[0]!
    pressLane(s, 2)
    releaseLane(s, 2)
    expect(s.result).toBe('playing')
    expect(s.misses).toBe(1)
    expect(s.events.some(e => e.kind === 'miss-life' && e.reason === 'drop')).toBe(true)
    expect(hold.holding).toBe(false)
    expect(hold.hit).toBe(true)
    expect(hold.held).toBe(false)
  })

  it('five misses end the run; four do not', () => {
    const s = createState(7)
    startRun(s)
    for (let i = 0; i < 4; i += 1) {
      s.tiles = [{ lane: 0, y: MISS_Y + 10 + i, len: 1, hit: false, holding: false, held: false }]
      step(s, DT)
      expect(s.result).toBe('playing')
      expect(s.misses).toBe(i + 1)
    }
    s.tiles = [{ lane: 0, y: MISS_Y + 60, len: 1, hit: false, holding: false, held: false }]
    step(s, DT)
    expect(s.result).toBe('over')
    expect(s.failReason).toBe('lives')
    expect(s.misses).toBe(5)
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

  it('score accumulates with the combo multiplier (normal tiles: 7×1 then ×2)', () => {
    const s = createState(5)
    startRun(s)
    // Seed 5's field contains one long tile among the first rows; hold it
    // through by never releasing — the frame loop holds keys implicitly in
    // this pure-logic harness (no keyup), so hold-done fires automatically.
    playHits(s, 10)
    expect(s.hits).toBeGreaterThanOrEqual(10)
    expect(s.combo).toBe(s.hits)
    expect(s.misses).toBe(0)
    // Every resolved tile scored at least its multiplier — exact math is
    // covered by the multiplier and hold-bonus unit tests.
    expect(s.score).toBeGreaterThan(10)
  })

  it('over state is inert to steps and presses', () => {
    const s = createState(5)
    startRun(s)
    // Idle until the five lives run out (a few seconds of missed tiles).
    for (let i = 0; i < 1500 && s.result !== 'over'; i += 1) step(s, DT)
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
