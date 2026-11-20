import { describe, expect, it } from 'vitest'
import {
  DIFF_COUNT, HIT_RADIUS, LEVELS, LEVEL_COUNT, MISS_PENALTY_S, PHOTO_H, PHOTO_W,
  createPhotoPuzzle, createSpotPhotoState, computeScore, hasNextLevel, mulberry32,
  remainingDiffs, tick, tryClick, type PhotoElement,
} from '../src/client/games/spotphoto/logic.ts'

/** 色相环角距离（0-180）。 */
function hueDist(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360)
  return Math.min(d, 360 - d)
}

/** 在右图里找左图元素的未位移对应物（同种类同位置）。 */
function sameSpot(right: PhotoElement[], base: PhotoElement): PhotoElement | undefined {
  return right.find((e) => e.kind === base.kind && e.x === base.x && e.y === base.y)
}

/** 在右图里找左图元素的位移对应物（同种类同大小，8px 内）。 */
function shiftedSpot(right: PhotoElement[], base: PhotoElement): PhotoElement | undefined {
  return right.find((e) => e.kind === base.kind && e.size === base.size && e.hue === base.hue
    && Math.hypot(e.x - base.x, e.y - base.y) <= 8 + 1e-9)
}

describe('spotphoto logic', () => {
  it('generates identical puzzles for the same seed (determinism)', () => {
    // mulberry32 输出流本身确定且落在 [0,1)。
    const ra = mulberry32(42)
    const rb = mulberry32(42)
    for (let i = 0; i < 10; i += 1) {
      const v = ra()
      expect(v).toBe(rb())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const a = createPhotoPuzzle(12345, 1)
    const b = createPhotoPuzzle(12345, 1)
    expect(b).toEqual(a)
    const c = createPhotoPuzzle(12346, 1)
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('places the configured element count, time limit, and 5 diffs per level', () => {
    expect(LEVELS.map((l) => l.elementCount)).toEqual([60, 70, 80, 90, 100])
    expect(LEVELS.map((l) => l.timeLimitS)).toEqual([90, 80, 70, 60, 50])
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const puzzle = createPhotoPuzzle(7 + level * 1000, level)
      expect(puzzle.left).toHaveLength(LEVELS[level - 1]!.elementCount)
      expect(puzzle.diffs).toHaveLength(DIFF_COUNT)
      // 差异下标互不重复且指向有效元素。
      const ids = new Set(puzzle.diffs.map((d) => d.index))
      expect(ids.size).toBe(DIFF_COUNT)
      for (const d of puzzle.diffs) {
        expect(d.index).toBeGreaterThanOrEqual(0)
        expect(d.index).toBeLessThan(puzzle.left.length)
      }
      // 元素全部落在照片内。
      for (const e of puzzle.left) {
        expect(e.x).toBeGreaterThanOrEqual(0)
        expect(e.x).toBeLessThanOrEqual(PHOTO_W)
        expect(e.y).toBeGreaterThanOrEqual(0)
        expect(e.y).toBeLessThanOrEqual(PHOTO_H)
      }
    }
  })

  it('covers all five diff kinds across seeds; delete only removes small elements', () => {
    const kindsSeen = new Set<string>()
    for (let seed = 1; seed <= 60; seed += 1) {
      const puzzle = createPhotoPuzzle(seed, 1)
      for (const d of puzzle.diffs) {
        kindsSeen.add(d.kind)
        const base = puzzle.left[d.index]!
        if (d.kind === 'delete') expect(base.size).toBeLessThanOrEqual(12)
      }
    }
    expect(kindsSeen).toEqual(new Set(['shift', 'hue', 'scale', 'delete', 'add']))
  })

  it('applies each modification within its specified magnitude', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const puzzle = createPhotoPuzzle(seed, 1)
      for (const d of puzzle.diffs) {
        const base = puzzle.left[d.index]!
        if (d.kind === 'shift') {
          const m = shiftedSpot(puzzle.right, base)
          expect(m).toBeDefined()
          const dist = Math.hypot(m!.x - base.x, m!.y - base.y)
          expect(dist).toBeGreaterThan(0)
          expect(dist).toBeLessThanOrEqual(8 + 1e-9) // 微移 3-8px
        } else if (d.kind === 'hue') {
          const m = sameSpot(puzzle.right, base)
          expect(m).toBeDefined()
          expect(hueDist(m!.hue, base.hue)).toBeGreaterThanOrEqual(15) // 色相偏移 ≥15°
        } else if (d.kind === 'scale') {
          const m = sameSpot(puzzle.right, base)
          expect(m).toBeDefined()
          const frac = Math.abs(m!.size - base.size) / base.size
          expect(frac).toBeGreaterThan(0.02) // 缩放 ±3%-8%
          expect(frac).toBeLessThanOrEqual(0.08 + 1e-9)
        } else if (d.kind === 'delete') {
          expect(sameSpot(puzzle.right, base)).toBeUndefined() // 右图删掉了该元素
        } else {
          // add：右图多出一个基准 18px 内的小点。
          const dot = puzzle.right.find((e) => Math.hypot(e.x - base.x, e.y - base.y) <= 18 + 1e-9
            && e.size >= 3 && e.size <= 7)
          expect(dot).toBeDefined()
        }
      }
    }
  })

  it('right photo length = left - deletes + adds', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const puzzle = createPhotoPuzzle(seed, 2)
      const del = puzzle.diffs.filter((d) => d.kind === 'delete').length
      const add = puzzle.diffs.filter((d) => d.kind === 'add').length
      expect(puzzle.right).toHaveLength(puzzle.left.length - del + add)
    }
  })

  it('registers a hit only within the 24px radius', () => {
    const state = createSpotPhotoState(999, 1)
    expect(state.timeLeft).toBe(90)
    const d = state.puzzle.diffs[0]!
    // 半径内（含边界）命中。
    expect(tryClick(state, d.x + HIT_RADIUS, d.y)).toBe('hit')
    // 超出半径判 miss：取离全部差异最远的角落。
    const dist = (pt: { x: number; y: number }): number => Math.min(
      ...state.puzzle.diffs.map((dd) => Math.hypot(dd.x - pt.x, dd.y - pt.y)))
    const far = [{ x: 4, y: 4 }, { x: 316, y: 4 }, { x: 4, y: 316 }, { x: 316, y: 316 }]
      .reduce((a, b) => (dist(b) > dist(a) ? b : a))
    expect(dist(far)).toBeGreaterThan(HIT_RADIUS)
    expect(tryClick(state, far.x, far.y)).toBe('miss')
    expect(state.misses).toBe(1)
    expect(state.timeLeft).toBe(90 - MISS_PENALTY_S) // 点错扣 5 秒
  })

  it('wins when all five found; clicks after the end are busy', () => {
    const state = createSpotPhotoState(4242, 1)
    for (const d of state.puzzle.diffs) {
      expect(state.status).toBe('playing')
      expect(tryClick(state, d.x, d.y)).toBe('hit')
    }
    expect(remainingDiffs(state)).toBe(0)
    expect(state.status).toBe('won')
    expect(tryClick(state, 0, 0)).toBe('busy')
    expect(state.misses).toBe(0)
  })

  it('re-clicking a found diff counts as a miss', () => {
    const state = createSpotPhotoState(31337, 2)
    const last = state.puzzle.diffs[state.puzzle.diffs.length - 1]!
    expect(tryClick(state, last.x, last.y)).toBe('hit')
    expect(remainingDiffs(state)).toBe(DIFF_COUNT - 1)
    expect(tryClick(state, last.x, last.y)).toBe('miss')
    expect(state.misses).toBe(1)
  })

  it('counts down and loses on timeout; ticks after loss are inert', () => {
    const state = createSpotPhotoState(555, 3)
    expect(state.timeLeft).toBe(70)
    expect(tick(state, 10)).toBe('playing')
    expect(state.timeLeft).toBe(60)
    expect(tick(state, 60)).toBe('lost')
    expect(state.timeLeft).toBe(0)
    expect(tryClick(state, state.puzzle.diffs[0]!.x, state.puzzle.diffs[0]!.y)).toBe('busy')
    expect(tick(state, 5)).toBe('lost')
  })

  it('loses via repeated wrong clicks eating the timer', () => {
    const state = createSpotPhotoState(808, 1)
    const dist = (pt: { x: number; y: number }): number => Math.min(
      ...state.puzzle.diffs.map((dd) => Math.hypot(dd.x - pt.x, dd.y - pt.y)))
    const far = [{ x: 4, y: 4 }, { x: 316, y: 4 }, { x: 4, y: 316 }, { x: 316, y: 316 }]
      .reduce((a, b) => (dist(b) > dist(a) ? b : a))
    let result: 'hit' | 'miss' | 'busy' = 'miss'
    for (let i = 0; i < 18; i += 1) result = tryClick(state, far.x, far.y) // 18 × 5s = 90s
    expect(result).toBe('miss')
    expect(state.status).toBe('lost')
    expect(state.misses).toBe(18)
  })

  it('scores and level progression behave', () => {
    const state = createSpotPhotoState(2024, 1)
    expect(hasNextLevel(state)).toBe(true)
    expect(computeScore(state)).toBe(180) // 初始：0 找到 + 90s×2
    const d = state.puzzle.diffs[0]!
    tryClick(state, d.x, d.y)
    expect(computeScore(state)).toBe(280) // +100 命中
    state.found.fill(true)
    state.status = 'won'
    expect(hasNextLevel(state)).toBe(true)
    expect(computeScore(state)).toBeGreaterThanOrEqual(DIFF_COUNT * 100 + 100)
    const last = createSpotPhotoState(1, LEVEL_COUNT)
    expect(hasNextLevel(last)).toBe(false)
  })

})
