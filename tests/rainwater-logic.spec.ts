import { describe, expect, it } from 'vitest'
import {
  LEVELS, LEVEL_COUNT, MAX_H, canLower, canRaise, createLevel, createRainwater,
  generateTerrain, lowerColumn, mulberry32, nextLevel, raiseColumn, totalWater,
  waterColumns,
} from '../src/client/games/rainwater/logic.ts'

/** 深比较辅助：JSON 序列化（纯数据状态）。 */
const json = (v: unknown): string => JSON.stringify(v)

describe('rainwater logic', () => {
  it('mulberry32 同种子序列一致、异种子不同', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    const seqA = [a(), a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b(), b()]
    const seqC = [c(), c(), c(), c(), c()]
    expect(seqA).toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('waterColumns 经典用例 [2,0,2] → [0,2,0]', () => {
    expect(waterColumns([2, 0, 2])).toEqual([0, 2, 0])
  })

  it('waterColumns 经典用例 [3,0,0,2,0,4] → [0,3,3,1,3,0]', () => {
    // 手算：leftMax=[0,3,3,3,3,3]，rightMax=[4,4,4,4,4,0]，
    // 每列 min(L,R)-h 的正部 = [0,3,3,1,3,0]。
    expect(waterColumns([3, 0, 0, 2, 0, 4])).toEqual([0, 3, 3, 1, 3, 0])
  })

  it('totalWater 求和：[2,0,2]=2、[3,0,0,2,0,4]=10、单调不蓄水=0', () => {
    expect(totalWater([2, 0, 2])).toBe(2)
    expect(totalWater([3, 0, 0, 2, 0, 4])).toBe(10)
    expect(totalWater([1, 2, 3, 4])).toBe(0)
    expect(totalWater([])).toBe(0)
  })

  it('canRaise/canLower：高度上限、预算耗尽、过关态与基座/越界边界', () => {
    const s = createRainwater(7, 1)
    expect(s.phase).toBe('playing')
    const col = 0
    // 高度到 MAX_H 后不可升。
    s.heights[col] = MAX_H
    expect(canRaise(s, col)).toBe(false)
    s.heights[col] = s.base[col]!
    // 预算耗尽后不可升。
    s.bricksUsed = s.budget
    expect(canRaise(s, col)).toBe(false)
    s.bricksUsed = 0
    // 过关后不可升不可降。
    s.phase = 'won'
    expect(canRaise(s, col)).toBe(false)
    expect(canLower(s, col)).toBe(false)
    s.phase = 'playing'
    // 地形基座本身不可降（col 从未被改动）。
    expect(canLower(s, col)).toBe(s.heights[col]! > s.base[col]!)
    // 越界列号恒不可操作。
    expect(canRaise(s, -1)).toBe(false)
    expect(canLower(s, 999)).toBe(false)
  })

  it('raise/lower 修改柱高与预算：升耗 1 砖、降返 1 砖、降回基座后不可再降', () => {
    // 找一个「升 1 格不触发过关」的种子，聚焦砖块账目本身。
    let s: ReturnType<typeof createRainwater> = createRainwater(11, 2)
    for (let sd = 1; sd < 300; sd += 1) {
      const t = createRainwater(sd, 2)
      const c = t.heights.findIndex(h => h < MAX_H)!
      raiseColumn(t, c)
      if (t.phase === 'playing') { s = t; break }
    }
    expect(s.phase).toBe('playing')
    expect(s.bricksUsed).toBe(1)
    const col = s.heights.findIndex((h, i) => h > s.base[i]!)!
    expect(s.heights[col]).toBe(s.base[col]! + 1)
    expect(canLower(s, col)).toBe(true)
    lowerColumn(s, col)
    expect(s.heights[col]).toBe(s.base[col])
    expect(s.bricksUsed).toBe(0)
    expect(canLower(s, col)).toBe(false)
    // 已降到基座再降：只写提示不动盘面。
    lowerColumn(s, col)
    expect(s.heights[col]).toBe(s.base[col])
    expect(s.bricksUsed).toBe(0)
    expect(s.hint).not.toBe('')
  })
  it('关卡生成确定性：同 seed/run/level 地形一致，且含可解盆地', () => {
    const a = createLevel(99, 3, 2, 0)
    const b = createLevel(99, 3, 2, 10)
    expect(json(a.base)).toBe(json(b.base))
    // 盆地：两侧柱基高 3、中间 3 列 ≤ 2。
    const { base, basin } = generateTerrain(mulberry32((99 * 977 + 3 * 131 + 2 * 7919) >>> 0), LEVELS[1]!.slots)
    expect(base[basin]).toBe(3)
    expect(base[basin + 4]).toBe(3)
    for (let i = basin + 1; i <= basin + 3; i += 1) expect(base[i]!).toBeLessThanOrEqual(2)
    // 两侧升到 MAX_H 后蓄水至少 3*(MAX_H-2)=12，覆盖最高目标 12。
    const solved = [...base]
    solved[basin] = MAX_H
    solved[basin + 4] = MAX_H
    expect(totalWater(solved)).toBeGreaterThanOrEqual(12)
  })

  it('整局流程：每关把盆地两侧升满即过关，LEVEL_COUNT 关后 finished', () => {
    let s = createRainwater(2024, 1)
    let advanced = 0
    while (true) {
      // 把盆地两侧柱升到 MAX_H（生成器保证预算内可解）。
      for (const col of [s.basin, s.basin + 4]) {
        while (canRaise(s, col)) raiseColumn(s, col)
      }
      expect(totalWater(s.heights)).toBeGreaterThanOrEqual(s.target)
      expect(s.phase).toBe('won')
      if (s.finished) break
      const scoreBefore = s.totalScore
      s = nextLevel(s)
      advanced += 1
      expect(s.level).toBe(advanced + 1)
      expect(s.totalScore).toBe(scoreBefore)
      expect(s.phase).toBe('playing')
    }
    expect(advanced).toBe(LEVEL_COUNT - 1)
    expect(s.level).toBe(LEVEL_COUNT)
    expect(s.totalScore).toBeGreaterThan(0)
    // 通关后 nextLevel 返回原状态。
    expect(nextLevel(s)).toBe(s)
  })
})