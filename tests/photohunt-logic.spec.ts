import { describe, expect, it } from 'vitest'
import {
  DIFF_COUNT, HIT_RADIUS, LEVELS, LEVEL_COUNT, MISS_PENALTY_S, PANEL_H, PANEL_W,
  computeScore, createPhotoHuntState, createScene, hasNextLevel, mulberry32,
  remainingDiffs, tick, tryClick,
} from '../src/client/games/photohunt/logic.ts'

describe('photohunt logic', () => {
  it('generates identical scenes for the same seed (determinism)', () => {
    // mulberry32 输出流本身确定且落在 [0,1)。
    const ra = mulberry32(7)
    const rb = mulberry32(7)
    for (let i = 0; i < 10; i += 1) {
      const v = ra()
      expect(v).toBe(rb())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const a = createScene(4242, 1)
    const b = createScene(4242, 1)
    expect(b).toEqual(a)
    const c = createScene(4243, 1)
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('places the configured element and diff counts for every level', () => {
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const scene = createScene(11 * level + 3, level)
      const cfg = LEVELS[level - 1]!
      expect(scene.left).toHaveLength(cfg.elementCount)
      expect(scene.diffs).toHaveLength(DIFF_COUNT)
      expect(scene.diffs).toHaveLength(5)
      // 修改点下标互不重复。
      const ids = new Set(scene.diffs.map((d) => d.index))
      expect(ids.size).toBe(DIFF_COUNT)
      // 基元全部落在画面内，且中心距边缘 ≥ 命中半径。
      for (const el of scene.left) {
        expect(el.x).toBeGreaterThanOrEqual(HIT_RADIUS)
        expect(el.x).toBeLessThanOrEqual(PANEL_W - HIT_RADIUS)
        expect(el.y).toBeGreaterThanOrEqual(HIT_RADIUS)
        expect(el.y).toBeLessThanOrEqual(PANEL_H - HIT_RADIUS)
      }
    }
  })

  it('applies each diff kind correctly to the right picture', () => {
    const kindsSeen = new Set<string>()
    for (let seed = 1; seed <= 60; seed += 1) {
      const scene = createScene(seed, 1)
      const removed = scene.diffs.filter((d) => d.kind === 'remove').length
      expect(scene.right).toHaveLength(scene.left.length - removed)
      for (const d of scene.diffs) {
        kindsSeen.add(d.kind)
        const base = scene.left[d.index]!
        if (d.kind === 'remove') continue
        // remove 会改变右图下标对齐，按位置回查修改后的基元。
        const mutated = scene.right.find((r) => r.x === base.x && r.y === base.y)!
        if (d.kind === 'color') {
          const delta = Math.abs(mutated.hue - base.hue) % 360
          const dist = delta > 180 ? 360 - delta : delta
          expect(dist).toBeGreaterThanOrEqual(LEVELS[0]!.colorDelta - 0.5)
        } else if (d.kind === 'scale') {
          expect(Math.abs(mutated.scale - base.scale)).toBeGreaterThanOrEqual(LEVELS[0]!.scaleDelta - 1e-9)
          expect(mutated.scale).toBeGreaterThanOrEqual(0.45)
          expect(mutated.scale).toBeLessThanOrEqual(1.6)
        } else if (d.kind === 'rotate') {
          expect(Math.abs(mutated.rotation - base.rotation)).toBeGreaterThanOrEqual(LEVELS[0]!.rotateDelta - 0.5)
          expect(Math.abs(mutated.rotation)).toBeLessThanOrEqual(35)
        } else {
          expect(mutated.flip).toBe(!base.flip)
        }
      }
      // 未被修改的基元保持原样（按位置回查；remove 会改变下标对齐）。
      const diffIdx = new Set(scene.diffs.map((d) => d.index))
      for (let i = 0; i < scene.left.length; i += 1) {
        if (diffIdx.has(i)) continue
        const el = scene.left[i]!
        const twin = scene.right.find((r) => r.x === el.x && r.y === el.y)
        expect(twin).toEqual(el)
      }
    }
    expect(kindsSeen).toEqual(new Set(['color', 'scale', 'rotate', 'mirror', 'remove']))
  })

  it('only assigns rotate/mirror diffs to asymmetric primitives', () => {
    // 对称基元（左右翻转/旋转后视觉不变）不应被分配 mirror/rotate。
    const symmetric = new Set(['sun', 'cloud', 'tree', 'pine', 'flower', 'bush', 'mountain', 'butterfly', 'lake'])
    for (let seed = 1; seed <= 120; seed += 1) {
      const scene = createScene(seed, 1)
      for (const d of scene.diffs) {
        if (d.kind !== 'rotate' && d.kind !== 'mirror') continue
        expect(symmetric.has(scene.left[d.index]!.kind)).toBe(false)
      }
    }
  })

  it('makes modifications subtler and clocks tighter at higher levels', () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      const prev = LEVELS[i - 1]!
      const next = LEVELS[i]!
      expect(next.elementCount).toBeGreaterThan(prev.elementCount)
      expect(next.colorDelta).toBeLessThan(prev.colorDelta)
      expect(next.scaleDelta).toBeLessThan(prev.scaleDelta)
      expect(next.rotateDelta).toBeLessThan(prev.rotateDelta)
      expect(next.timeS).toBeLessThan(prev.timeS)
    }
    // 各关初始时间来自难度表。
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const state = createPhotoHuntState(5, level)
      expect(state.timeLeft).toBe(LEVELS[level - 1]!.timeS)
      expect(state.timeLimit).toBe(state.timeLeft)
      expect(state.status).toBe('playing')
    }
  })

  it('registers a hit only within the 20px radius', () => {
    const state = createPhotoHuntState(999, 1)
    const d = state.scene.diffs[0]!
    // 半径边界内（含边界）命中。
    expect(tryClick(state, d.x + (HIT_RADIUS - 1) * Math.SQRT1_2, d.y + (HIT_RADIUS - 1) * Math.SQRT1_2)).toBe('hit')
    // 取离全部修改点最远的角落必为 miss。
    let far = { x: 2, y: 2 }
    for (const c of [{ x: PANEL_W - 2, y: 2 }, { x: 2, y: PANEL_H - 2 }, { x: PANEL_W - 2, y: PANEL_H - 2 }]) {
      const dist = (pt: { x: number; y: number }): number => Math.min(
        ...state.scene.diffs.map((dd) => Math.hypot(dd.x - pt.x, dd.y - pt.y)))
      if (dist(c) > dist(far)) far = c
    }
    expect(Math.hypot(far.x - d.x, far.y - d.y)).toBeGreaterThan(HIT_RADIUS)
    expect(tryClick(state, far.x, far.y)).toBe('miss')
    expect(state.misses).toBe(1)
    expect(state.timeLeft).toBe(LEVELS[0]!.timeS - MISS_PENALTY_S)
  })

  it('does not re-count a found diff and wins when all 5 found', () => {
    const state = createPhotoHuntState(2026, 2)
    for (const d of state.scene.diffs) {
      expect(state.status).toBe('playing')
      expect(tryClick(state, d.x, d.y)).toBe('hit')
    }
    expect(remainingDiffs(state)).toBe(0)
    expect(state.status).toBe('won')
    // 结束后点击为 busy，不再改变任何状态。
    expect(tryClick(state, 0, 0)).toBe('busy')
    expect(state.misses).toBe(0)
    // 已找到的修改位置再点一次算 miss（扣时）——用全新状态验证。
    const other = createPhotoHuntState(777, 1)
    const first = other.scene.diffs[0]!
    expect(tryClick(other, first.x, first.y)).toBe('hit')
    expect(tryClick(other, first.x, first.y)).toBe('miss')
    expect(other.misses).toBe(1)
  })

  it('counts down and loses on timeout; clicks are inert after loss', () => {
    const state = createPhotoHuntState(555, 5)
    expect(state.timeLeft).toBe(LEVELS[4]!.timeS)
    expect(tick(state, 10)).toBe('playing')
    expect(state.timeLeft).toBe(LEVELS[4]!.timeS - 10)
    expect(tick(state, 999)).toBe('lost')
    expect(state.timeLeft).toBe(0)
    expect(tryClick(state, state.scene.diffs[0]!.x, state.scene.diffs[0]!.y)).toBe('busy')
    expect(tick(state, 5)).toBe('lost') // 已结束不再变化
  })

  it('loses via repeated wrong clicks eating the timer', () => {
    const state = createPhotoHuntState(808, 1)
    // 远离全部修改点的位置连点：每次 -3s，时间归零判负。
    let far = { x: 2, y: 2 }
    for (const c of [{ x: PANEL_W - 2, y: 2 }, { x: 2, y: PANEL_H - 2 }, { x: PANEL_W - 2, y: PANEL_H - 2 }]) {
      const dist = (pt: { x: number; y: number }): number => Math.min(
        ...state.scene.diffs.map((dd) => Math.hypot(dd.x - pt.x, dd.y - pt.y)))
      if (dist(c) > dist(far)) far = c
    }
    const missesToLose = Math.ceil(state.timeLeft / MISS_PENALTY_S)
    let result: 'hit' | 'miss' | 'busy' = 'miss'
    for (let i = 0; i < missesToLose; i += 1) result = tryClick(state, far.x, far.y)
    expect(result).toBe('miss')
    expect(state.status).toBe('lost')
    expect(state.timeLeft).toBe(0)
    expect(state.misses).toBe(missesToLose)
  })

  it('scores and level progression behave', () => {
    const state = createPhotoHuntState(31337, 1)
    expect(hasNextLevel(state)).toBe(true)
    expect(computeScore(state)).toBe(LEVELS[0]!.timeS * 2) // 初始：0 找到 + 时间分
    const d = state.scene.diffs[0]!
    tryClick(state, d.x, d.y)
    expect(computeScore(state)).toBe(LEVELS[0]!.timeS * 2 + 150) // +150 命中
    state.found.fill(true)
    state.status = 'won'
    expect(computeScore(state)).toBeGreaterThanOrEqual(DIFF_COUNT * 150 + 200)
    const last = createPhotoHuntState(1, LEVEL_COUNT)
    expect(hasNextLevel(last)).toBe(false)
  })

  it('replays an identical game transcript from the same seed', () => {
    // 相同 seed 下按同一点击序列完整对局，结果轨迹完全一致（确定性重放）。
    const play = (seed: number): string => {
      const state = createPhotoHuntState(seed, 3)
      const events: string[] = []
      for (const d of state.scene.diffs) {
        events.push(tryClick(state, d.x + 5, d.y - 5))
        events.push(tryClick(state, 3, 3)) // 一次点错
      }
      events.push(state.status)
      events.push(String(computeScore(state)))
      events.push(String(state.misses))
      return events.join('|')
    }
    const first = play(60631)
    const second = play(60631)
    expect(second).toBe(first)
    const parts = first.split('|')
    // 5×(hit+miss) 交错轨迹，第 5 次命中后立即判胜。
    expect(parts.slice(0, 10)).toEqual(['hit', 'miss', 'hit', 'miss', 'hit', 'miss', 'hit', 'miss', 'hit', 'busy'])
    expect(parts[10]).toBe('won')
    expect(parts[12]).toBe('4') // 胜前 4 次点错
  })
})
