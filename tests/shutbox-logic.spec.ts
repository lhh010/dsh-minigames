import { describe, expect, it } from 'vitest'
import {
  COMBO_UNIT, SHUT_BONUS, TILE_MAX, TILES_TOTAL, TOTAL_ROUNDS,
  allShut, comboBonus, enumerateMoves, flipTiles, hasMove, initialUpTiles,
  mulberry32, remainingSum, rollPair, roundScore,
} from '../src/client/games/shutbox/logic.ts'

describe('shutbox 掷骰', () => {
  it('rollPair 同种子确定，面值均在 1..6 且跨种子覆盖多面', () => {
    const a = rollPair(4242)
    const b = rollPair(4242)
    expect(a).toEqual(b)
    const seen = new Set<number>()
    for (let seed = 0; seed < 80; seed += 1) {
      const [d1, d2] = rollPair(seed)
      expect(d1).toBeGreaterThanOrEqual(1)
      expect(d1).toBeLessThanOrEqual(6)
      expect(d2).toBeGreaterThanOrEqual(1)
      expect(d2).toBeLessThanOrEqual(6)
      seen.add(d1)
      seen.add(d2)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('mulberry32 同种子序列一致、不同种子不同', () => {
    const r1 = mulberry32(9)
    const r2 = mulberry32(9)
    for (let i = 0; i < 10; i += 1) expect(r1()).toBe(r2())
    const r3 = mulberry32(10)
    expect(r3()).not.toBe(mulberry32(9)())
  })
})

describe('shutbox 合法组合', () => {
  it('全板目标和 9 枚举全部子和为 9 的子集', () => {
    const moves = enumerateMoves(initialUpTiles(), 9)
    expect(moves).toContainEqual([9])
    expect(moves).toContainEqual([1, 8])
    expect(moves).toContainEqual([4, 5])
    expect(moves).toContainEqual([1, 2, 6])
    expect(moves).toContainEqual([2, 3, 4])
    expect(moves).toContainEqual([1, 3, 5])
    expect(moves).toHaveLength(8)
    for (const m of moves) {
      expect(m.reduce((x, y) => x + y, 0)).toBe(9)
    }
  })

  it('已翻下的数字不再出现在组合里', () => {
    // 1、2、9 已翻下：目标和 9 只剩 [3,6] 与 [4,5]。
    const up = flipTiles(initialUpTiles(), [1, 2, 9])
    const moves = enumerateMoves(up, 9)
    expect(moves).toEqual([[3, 6], [4, 5]])
  })

  it('hasMove 判定存在性：无可凑子集返回 false', () => {
    // 只剩 [3]：掷出 6 无法凑出。
    const up = flipTiles(initialUpTiles(), [1, 2, 4, 5, 6, 7, 8, 9])
    expect(hasMove(up, 3)).toBe(true)
    expect(hasMove(up, 6)).toBe(false)
    // 只剩 [2,3]：可凑 2、3、5，不可凑 4。
    const up2 = flipTiles(initialUpTiles(), [1, 4, 5, 6, 7, 8, 9])
    expect(hasMove(up2, 5)).toBe(true)
    expect(hasMove(up2, 4)).toBe(false)
  })
})

describe('shutbox 状态与计分', () => {
  it('flipTiles 纯函数不改原板，翻下即不可再翻', () => {
    const up = initialUpTiles()
    const next = flipTiles(up, [1, 9])
    expect(up).toEqual(initialUpTiles())
    expect(next[0]).toBe(false)
    expect(next[8]).toBe(false)
    expect(next[4]).toBe(true)
  })

  it('remainingSum / allShut 按立着数字求和与判关箱', () => {
    expect(remainingSum(initialUpTiles())).toBe(TILES_TOTAL)
    expect(allShut(initialUpTiles())).toBe(false)
    const up = flipTiles(initialUpTiles(), [2, 3, 5])
    expect(remainingSum(up)).toBe(TILES_TOTAL - 10)
    const shut = new Array<boolean>(TILE_MAX).fill(false)
    expect(remainingSum(shut)).toBe(0)
    expect(allShut(shut)).toBe(true)
  })

  it('连击加分 (k-1)×5，一局得分含基础分与关箱奖励', () => {
    expect(comboBonus([9])).toBe(0)
    expect(comboBonus([1, 8])).toBe(COMBO_UNIT)
    expect(comboBonus([1, 2, 6])).toBe(2 * COMBO_UNIT)
    // 未关箱：基础分 = 45 - 剩余和 + 连击。
    const up = flipTiles(initialUpTiles(), [1, 8])
    expect(roundScore(up, COMBO_UNIT)).toBe(TILES_TOTAL - 36 + COMBO_UNIT)
    // 关箱：基础 45 + 连击 + 50。
    const shut = new Array<boolean>(TILE_MAX).fill(false)
    expect(roundScore(shut, 3 * COMBO_UNIT)).toBe(TILES_TOTAL + 3 * COMBO_UNIT + SHUT_BONUS)
  })

  it('常量齐备：1-9 板、5 局一赛、总和 45、关箱奖励 50', () => {
    expect(TILE_MAX).toBe(9)
    expect(TOTAL_ROUNDS).toBe(5)
    expect(TILES_TOTAL).toBe(45)
    expect(SHUT_BONUS).toBe(50)
    expect(initialUpTiles()).toHaveLength(9)
  })
})
