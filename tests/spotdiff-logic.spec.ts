import { describe, expect, it } from 'vitest'
import {
  LEVELS, LEVEL_COUNT, MISS_PENALTY_S, PANEL_H, PANEL_W, createPuzzle, createSpotDiffState,
  computeScore, hasNextLevel, mulberry32, remainingDiffs, tick, tryClick,
} from '../src/client/games/spotdiff/logic.ts'

describe('spotdiff logic', () => {
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
    const a = createPuzzle(12345, 1)
    const b = createPuzzle(12345, 1)
    expect(b).toEqual(a)
    const c = createPuzzle(12346, 1)
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('places the configured shape and diff counts for every level', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const puzzle = createPuzzle(7 + level * 100, level)
      const cfg = LEVELS[level - 1]!
      expect(puzzle.left).toHaveLength(cfg.shapeCount)
      expect(puzzle.diffs).toHaveLength(cfg.diffCount)
      expect(puzzle.tolerance).toBe(cfg.tolerance)
      // 差异下标互不重复。
      const ids = new Set(puzzle.diffs.map((d) => d.index))
      expect(ids.size).toBe(cfg.diffCount)
      // 形状全部落在面板内。
      for (const s of puzzle.left) {
        expect(s.x).toBeGreaterThanOrEqual(0)
        expect(s.x).toBeLessThanOrEqual(PANEL_W)
        expect(s.y).toBeGreaterThanOrEqual(0)
        expect(s.y).toBeLessThanOrEqual(PANEL_H)
      }
    }
  })

  it('applies each diff kind correctly to the right panel', () => {
    // 扫描多个 seed 覆盖三种差异类型。
    const kindsSeen = new Set<string>()
    for (let seed = 1; seed <= 40; seed += 1) {
      const puzzle = createPuzzle(seed, 1)
      const missing = puzzle.diffs.filter((d) => d.kind === 'missing').length
      expect(puzzle.right).toHaveLength(puzzle.left.length - missing)
      for (const d of puzzle.diffs) {
        kindsSeen.add(d.kind)
        const base = puzzle.left[d.index]!
        if (d.kind === 'missing') continue
        const mutated = puzzle.right.find((s) => s.x === base.x && s.y === base.y)!
        if (d.kind === 'color') expect(mutated.color).not.toBe(base.color)
        if (d.kind === 'size') expect(mutated.size).not.toBe(base.size)
      }
    }
    expect(kindsSeen).toEqual(new Set(['missing', 'color', 'size']))
  })

  it('registers a hit only within the tolerance radius', () => {
    const state = createSpotDiffState(999, 1)
    const d = state.puzzle.diffs[0]!
    // 容差边界内（含边界）命中。
    expect(tryClick(state, d.x + state.puzzle.tolerance - 1, d.y)).toBe('hit')
    // 距离超过容差判 miss（取离全部差异最远的角落）。
    const far = { x: 4, y: 4 }
    for (const c of [{ x: 296, y: 4 }, { x: 4, y: 296 }, { x: 296, y: 296 }]) {
      const dist = (pt: { x: number; y: number }): number => Math.min(
        ...state.puzzle.diffs.map((dd) => Math.hypot(dd.x - pt.x, dd.y - pt.y)))
      if (dist(c) > dist(far)) Object.assign(far, c)
    }
    expect(tryClick(state, far.x, far.y)).toBe('miss')
    expect(state.misses).toBe(1)
    expect(state.timeLeft).toBe(60 - MISS_PENALTY_S)
  })

  it('does not re-count an already found diff and wins when all found', () => {
    const state = createSpotDiffState(4242, 1)
    for (const d of state.puzzle.diffs) {
      expect(state.status).toBe('playing')
      expect(tryClick(state, d.x, d.y)).toBe('hit')
    }
    expect(remainingDiffs(state)).toBe(0)
    expect(state.status).toBe('won')
    // 结束后点击为 busy，不再改变任何状态。
    expect(tryClick(state, 0, 0)).toBe('busy')
    expect(state.misses).toBe(0)
  })

  it('clicking another unfound diff first keeps earlier ones unfound', () => {
    const state = createSpotDiffState(31337, 2)
    // 先点最后一个差异，其余仍为未找到。
    const last = state.puzzle.diffs[state.puzzle.diffs.length - 1]!
    expect(tryClick(state, last.x, last.y)).toBe('hit')
    expect(remainingDiffs(state)).toBe(state.puzzle.diffs.length - 1)
    // 已找到的差异位置再点一次算 miss（扣时）。
    expect(tryClick(state, last.x, last.y)).toBe('miss')
  })

  it('counts down and loses on timeout; hits are inert after loss', () => {
    const state = createSpotDiffState(555, 1)
    expect(tick(state, 10)).toBe('playing')
    expect(state.timeLeft).toBe(50)
    expect(tick(state, 60)).toBe('lost')
    expect(state.timeLeft).toBe(0)
    expect(tryClick(state, state.puzzle.diffs[0]!.x, state.puzzle.diffs[0]!.y)).toBe('busy')
    expect(tick(state, 5)).toBe('lost') // 已结束不再变化
  })

  it('loses via repeated wrong clicks eating the timer', () => {
    const state = createSpotDiffState(808, 1)
    // 远离所有差异的位置连点 60 次：每次 -1s，时间归零判负。
    const far = { x: 4, y: 4 }
    let result: 'hit' | 'miss' | 'busy' = 'miss'
    for (let i = 0; i < 60; i += 1) result = tryClick(state, far.x, far.y)
    expect(result).toBe('miss')
    expect(state.status).toBe('lost')
    expect(state.misses).toBe(60)
  })

  it('scores and level progression behave', () => {
    const state = createSpotDiffState(2024, 1)
    expect(hasNextLevel(state)).toBe(true)
    expect(computeScore(state)).toBe(120) // 初始：0 找到 + 60s×2
    const d = state.puzzle.diffs[0]!
    tryClick(state, d.x, d.y)
    expect(computeScore(state)).toBe(220) // +100 命中
    state.found.fill(true)
    state.status = 'won'
    expect(hasNextLevel(state)).toBe(true)
    expect(computeScore(state)).toBeGreaterThanOrEqual(state.puzzle.diffs.length * 100 + 100)
    const last = createSpotDiffState(1, LEVEL_COUNT)
    expect(hasNextLevel(last)).toBe(false)
  })

})
