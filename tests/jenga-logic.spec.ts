import { describe, expect, it } from 'vitest'
import {
  CAP_PER_BLOCK, MAX_STAGE, blockAt, canPull, createTower, isCollapsed,
  legalPulls, levelCount, mulberry32, previewStress, pull, safePulls, scoreFor, stressOf, towerStress,
} from '../src/client/games/jenga/logic.ts'

/** 满员塔每层上方总重（近似，块均重约 1）。 */
const aboveWeight = (levels: number, level: number): number => 3 * (levels - level)

describe('jenga logic', () => {
  it('生成确定性：同 seed 同塔，异 seed 重量不同', () => {
    const a = createTower(1234, 5)
    const b = createTower(1234, 5)
    expect(b.blocks.map(x => x.weight)).toEqual(a.blocks.map(x => x.weight))
    expect(b.blocks.map(x => x.fragility)).toEqual(a.blocks.map(x => x.fragility))
    const c = createTower(5678, 5)
    expect(c.blocks.map(x => x.weight)).not.toEqual(a.blocks.map(x => x.weight))
  })

  it('结构：N 层 × 3 块、重量与脆弱度在区间内、初始塔稳定', () => {
    const s = createTower(7, 6)
    expect(s.blocks).toHaveLength(18)
    expect(s.status).toBe('playing')
    expect(s.score).toBe(0)
    for (const b of s.blocks) {
      expect(b.present).toBe(true)
      expect(b.weight).toBeGreaterThanOrEqual(0.75)
      expect(b.weight).toBeLessThan(1.25)
      expect(b.fragility).toBeGreaterThanOrEqual(0.85)
      expect(b.fragility).toBeLessThan(1.15)
      expect(blockAt(s, b.level, b.slot)).toBe(b)
    }
    expect(blockAt(s, 0, 0)).toBeNull()
    expect(blockAt(s, 1, 3)).toBeNull()
    // 满员对称塔：各层质心居中，应力比 = W/cap < 1
    expect(isCollapsed(s)).toBe(false)
    expect(towerStress(s)).toBeLessThan(1)
  })

  it('顶层满 3 块时不可抽顶层，其余层可抽', () => {
    const s = createTower(42, 5)
    expect(canPull(s, 5, -1)).toBe(false)
    expect(canPull(s, 5, 0)).toBe(false)
    expect(canPull(s, 5, 1)).toBe(false)
    expect(canPull(s, 4, 0)).toBe(true)
    expect(canPull(s, 1, -1)).toBe(true)
    // 顶层不满 3（假设被上层压住前先抽走一块）后，顶层变为可抽
    expect(pull(s, 4, 1).ok).toBe(true)
    blockAt(s, 5, 1)!.present = false
    expect(canPull(s, 5, 0)).toBe(true)
    expect(canPull(s, 5, 1)).toBe(false) // 已不在位
    // 游戏结束后的一切点击都非法
    expect(canPull(s, 4, 0)).toBe(true)
    s.status = 'collapsed'
    expect(canPull(s, 2, 0)).toBe(false)
    s.status = 'collapsed'
    expect(canPull(s, 2, 0)).toBe(false)
  })

  it('底层中块可安全抽出，底层边块抽出即倒（偏心力矩）', () => {
    const s = createTower(99, 5)
    // 预览：底层中块抽出后应力比 < 1，底层边块 > 1
    expect(previewStress(s, 1, 0)).toBeLessThan(1)
    expect(previewStress(s, 1, 1)).toBeGreaterThan(1)
    // previewStress 不改状态
    expect(blockAt(s, 1, 1)!.present).toBe(true)
    const safe = pull(s, 1, 0)
    expect(safe.ok).toBe(true)
    expect(safe.collapsed).toBe(false)
    expect(safe.gained).toBe(scoreFor(5, 1))
    expect(s.score).toBe(safe.gained)
    // 新塔：直接抽底层边块 → 塔倒、不得分、状态结束
    const t = createTower(99, 5)
    const dead = pull(t, 1, -1)
    expect(dead.ok).toBe(true)
    expect(dead.collapsed).toBe(true)
    expect(dead.gained).toBe(0)
    expect(t.status).toBe('collapsed')
    expect(t.score).toBe(0)
    expect(towerStress(t)).toBeGreaterThan(1)
  })

  it('应力模型：应力比 = 载重/容量 + 偏心项，高层风险更低', () => {
    const s = createTower(2024, 5)
    // 满员第 1 层：质心居中 d=0，比值恰为 W/cap
    const cap1 = s.blocks.filter(b => b.level === 1).reduce((sum, b) => sum + b.fragility, 0) * CAP_PER_BLOCK
    expect(stressOf(s, 1)).toBeCloseTo(aboveWeight(5, 1) / cap1, 1)
    // 空层上有重量 → ∞；无载重 → 0
    const e = createTower(5, 4)
    e.blocks.filter(b => b.level === 2).forEach(b => { b.present = false })
    expect(stressOf(e, 2)).toBe(Infinity)
    expect(isCollapsed(e)).toBe(true)
    e.blocks.filter(b => b.level > 2).forEach(b => { b.present = false })
    expect(stressOf(e, 2)).toBe(0)
    // 抽走高层边块风险低于同操作在底层（分值则相反）
    expect(previewStress(s, 4, 1)).toBeLessThan(previewStress(s, 1, 1))
    expect(scoreFor(5, 1)).toBeGreaterThan(scoreFor(5, 4))
  })

  it('计分累积、越低分越多、collapsed 后停止计分', () => {
    const s = createTower(31337, 5)
    const first = pull(s, 4, 0)
    expect(first.gained).toBe(scoreFor(5, 4))
    const second = pull(s, 3, 0)
    expect(s.score).toBe(first.gained + second.gained)
    expect(s.pulled).toBe(2)
    expect(scoreFor(5, 1)).toBe(10 + 4 * 5)
    expect(scoreFor(5, 5)).toBe(10)
    const dead = pull(s, 1, 1) // 大概率塔倒；若没倒也继续抽到倒为止
    let last = dead
    while (!last.collapsed && s.status === 'playing' && legalPulls(s).length > 0) {
      const next = legalPulls(s)[0]!
      last = pull(s, next.level, next.slot)
    }
    expect(s.status).toBe('collapsed')
    const frozen = s.score
    expect(pull(s, 2, 0).ok).toBe(false)
    expect(s.score).toBe(frozen)
  })

  it('无安全块可抽时判定收手（cleared）', () => {
    // 4 层塔：每次都抽安全块（优先中块），直到无安全块可抽
    const s = createTower(777, 4)
    let guard = 100
    while (s.status === 'playing' && guard > 0) {
      const safe = safePulls(s)
      if (safe.length === 0) break
      const choice = safe.find(m => m.slot === 0) ?? safe[0]!
      const r = pull(s, choice.level, choice.slot)
      expect(r.collapsed).toBe(false) // 安全预览在安全策略下确实不倒
      guard -= 1
    }
    // 终局：要么塔倒，要么收手；收手时已无安全块但可能仍有可抽块
    expect(s.status).not.toBe('playing')
    expect(safePulls(s)).toHaveLength(0)
    expect(s.pulled).toBeGreaterThan(0)
    expect(s.score).toBeGreaterThan(0)
  })

  it('关卡递进 5 → 8 层与 mulberry32 确定性', () => {
    expect([1, 2, 3, 4, 5].map(levelCount)).toEqual([5, 6, 7, 8, 8])
    expect(MAX_STAGE).toBe(4)
    const rng = mulberry32(42)
    const a = rng()
    const b = rng()
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
    expect(b).not.toBe(a)
    const rng2 = mulberry32(42)
    expect([rng2(), rng2()]).toEqual([a, b])
  })

  it('同一 seed + 同一抽取序列 → 同一结果（端到端确定性）', () => {
    const run = (): { score: number, status: string } => {
      const s = createTower(20260101, 6)
      const moves: Array<{ level: number, slot: number }> = [
        { level: 5, slot: 0 }, { level: 4, slot: -1 }, { level: 1, slot: 0 }, { level: 3, slot: 1 },
      ]
      for (const m of moves) pull(s, m.level, m.slot)
      return { score: s.score, status: s.status }
    }
    expect(run()).toEqual(run())
  })
})
