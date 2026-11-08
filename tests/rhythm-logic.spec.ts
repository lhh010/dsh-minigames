import { describe, expect, it } from 'vitest'
import {
  GOOD_MS, LANE_COUNT, MAX_BPM, MIN_BPM, MISS_LATE_MS, PERFECT_MS, SCORE_GOOD, SCORE_PERFECT,
  START_LIVES, comboMultiplier, createRhythm, createRhythmChart, hitRhythm, mulberry32, stepRhythm,
} from '../src/client/games/rhythm/logic.ts'
import type { RhythmState } from '../src/client/games/rhythm/logic.ts'

/** 推进时钟到 target ms（步长 ≤10ms；游戏结束后时钟停走，立即返回）。 */
function advance(s: RhythmState, target: number): void {
  while (s.t < target && !s.over) stepRhythm(s, Math.min(10, target - s.t))
}

/** 找一个音符数 ≥ minNotes 的种子。 */
function seedWithNotes(minNotes: number): number {
  for (let seed = 1; seed < 50; seed += 1) {
    if (createRhythmChart(seed).notes.length >= minNotes) return seed
  }
  throw new Error('no seed with enough notes')
}

/** 完美全连：每颗音符在恰好到达判定线时打击其轨道。 */
function playAllPerfect(s: RhythmState): void {
  for (const note of s.notes) {
    advance(s, note.timeMs)
    hitRhythm(s, note.lane)
    expect(note.judged).toBe('perfect')
  }
  stepRhythm(s, 10)
}

describe('rhythm logic', () => {
  it('mulberry32 and chart generation are deterministic and well-formed', () => {
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    const seq1 = [r1(), r1(), r1()]
    const seq2 = [r2(), r2(), r2()]
    expect(seq1).toEqual(seq2)
    for (const v of seq1) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const a = createRhythmChart(7)
    const b = createRhythmChart(7)
    expect(a.bpm).toBe(b.bpm)
    expect(a.notes).toEqual(b.notes)
    expect(a.bpm).toBeGreaterThanOrEqual(MIN_BPM)
    expect(a.bpm).toBeLessThanOrEqual(MAX_BPM)
    expect(a.notes.length).toBeGreaterThan(0)
    let prev = -Infinity
    for (const note of a.notes) {
      expect(note.lane).toBeGreaterThanOrEqual(0)
      expect(note.lane).toBeLessThan(LANE_COUNT)
      expect(note.judged).toBeNull()
      expect(note.timeMs).toBeGreaterThan(prev)
      prev = note.timeMs
    }
    expect(createRhythmChart(8).notes).not.toEqual(a.notes)
  })

  it('respects the minimum same-lane gap of 1.5 beats', () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const chart = createRhythmChart(seed)
      const last: number[] = new Array(LANE_COUNT).fill(-Infinity)
      for (const note of chart.notes) {
        if (last[note.lane]! !== -Infinity) {
          expect(note.timeMs - last[note.lane]!).toBeGreaterThanOrEqual(1.5 * chart.beatMs - 1e-6)
        }
        last[note.lane] = note.timeMs
      }
    }
  })

  it('note density rises over the chart', () => {
    let firstHalf = 0
    let secondHalf = 0
    for (const seed of [1, 2, 3, 7, 42]) {
      const chart = createRhythmChart(seed)
      // 以最后一颗音符时刻的一半划分前后半段。
      const midTime = chart.notes[chart.notes.length - 1]!.timeMs / 2
      for (const note of chart.notes) {
        if (note.timeMs < midTime) firstHalf += 1
        else secondHalf += 1
      }
    }
    expect(secondHalf).toBeGreaterThan(firstHalf)
  })

  it('judges PERFECT within ±30ms, GOOD within ±80ms, and ignores presses outside the window', () => {
    const seed = seedWithNotes(1)
    const first = createRhythmChart(seed).notes[0]!
    for (const delta of [0, -PERFECT_MS, PERFECT_MS]) {
      const s = createRhythm(seed)
      advance(s, first.timeMs + delta)
      hitRhythm(s, first.lane)
      expect(s.notes[0]!.judged).toBe('perfect')
      expect(s.combo).toBe(1)
      expect(s.score).toBe(SCORE_PERFECT)
    }
    for (const delta of [-GOOD_MS, GOOD_MS]) {
      const s = createRhythm(seed)
      advance(s, first.timeMs + delta)
      hitRhythm(s, first.lane)
      expect(s.notes[0]!.judged).toBe('good')
      expect(s.score).toBe(SCORE_GOOD)
    }
    const s = createRhythm(seed)
    advance(s, first.timeMs + GOOD_MS + 1)
    hitRhythm(s, first.lane)
    expect(s.notes[0]!.judged).toBeNull()
    expect(s.combo).toBe(0)
    expect(s.score).toBe(0)
    expect(s.events).toEqual([])
  })

  it('scales score with the combo multiplier (x1→x2 at 50, capped at x4)', () => {
    expect(comboMultiplier(1)).toBe(1)
    expect(comboMultiplier(49)).toBe(1)
    expect(comboMultiplier(50)).toBe(2)
    expect(comboMultiplier(100)).toBe(3)
    expect(comboMultiplier(150)).toBe(4)
    expect(comboMultiplier(999)).toBe(4)
    const seed = seedWithNotes(60)
    const s = createRhythm(seed)
    let expected = 0
    let index = 0
    for (const note of s.notes) {
      advance(s, note.timeMs)
      hitRhythm(s, note.lane)
      index += 1
      expected += SCORE_PERFECT * comboMultiplier(index)
      expect(s.score).toBe(expected)
    }
    expect(s.maxCombo).toBe(s.notes.length)
  })

  it('auto-misses a passed note: combo resets and a life is lost', () => {
    const seed = seedWithNotes(4)
    const s = createRhythm(seed)
    // 先完美命中一颗建立连击。
    const first = s.notes[0]!
    advance(s, first.timeMs)
    hitRhythm(s, first.lane)
    expect(s.combo).toBe(1)
    // 放掉下一颗：过判定时刻 +120ms 判 MISS。
    const second = s.notes.find(n => n.judged === null)!
    advance(s, second.timeMs + MISS_LATE_MS + 1)
    expect(second.judged).toBe('miss')
    expect(s.combo).toBe(0)
    expect(s.lives).toBe(START_LIVES - 1)
    const ev = s.events.find(e => e.type === 'judge' && e.judgement === 'miss')
    expect(ev).toBeDefined()
  })

  it('ends the game when all lives are lost', () => {
    const seed = seedWithNotes(6)
    const s = createRhythm(seed)
    for (let i = 0; i < START_LIVES; i += 1) {
      const note = s.notes.find(n => n.judged === null)!
      advance(s, note.timeMs + MISS_LATE_MS + 1)
    }
    expect(s.over).toBe(true)
    expect(s.lives).toBe(0)
    expect(s.events.some(e => e.type === 'over')).toBe(true)
    // 结束后按键与推进均无效果。
    const score = s.score
    hitRhythm(s, 0)
    stepRhythm(s, 50)
    expect(s.score).toBe(score)
    expect(s.finished).toBe(false)
  })

  it('completes the chart with a perfect full-combo run and replays deterministically', () => {
    const run = (): { score: number, maxCombo: number, finished: boolean, over: boolean } => {
      const s = createRhythm(42)
      playAllPerfect(s)
      return { score: s.score, maxCombo: s.maxCombo, finished: s.finished, over: s.over }
    }
    const first = run()
    const second = run()
    expect(first.finished).toBe(true)
    expect(first.over).toBe(false)
    expect(first.maxCombo).toBe(createRhythmChart(42).notes.length)
    expect(first).toEqual(second)
    const s = createRhythm(42)
    playAllPerfect(s)
    expect(s.events.some(e => e.type === 'complete')).toBe(true)
    expect(s.lives).toBe(START_LIVES)
  })
})
