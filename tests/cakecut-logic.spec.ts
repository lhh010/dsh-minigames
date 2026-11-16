import { describe, expect, it } from 'vitest'
import {
  LEVEL_COUNT, applyCut, blockArea, buildLevel, cakeCut, cakeDeviations, cakeIsSolved,
  cakeUndo, clipHalfPlane, computeScore, createCakeState, cutBlock, cutSegments,
  mulberry32, polygonArea, shoelace,
} from '../src/client/games/cakecut/logic.ts'

const SQUARE: { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
]

describe('cakecut logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('shoelace / polygonArea / blockArea compute exact areas', () => {
    expect(shoelace(SQUARE)).toBe(100)
    expect(polygonArea(SQUARE)).toBe(100)
    expect(polygonArea([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 4 }])).toBe(12)
    // 带孔洞的块：环形关 = 外轮廓 − 内孔。
    const ring = buildLevel(3, 7)
    const ringBlock = { id: 0, outer: ring.outline, holes: [ring.holes[0]!] }
    expect(blockArea(ringBlock)).toBe(polygonArea(ring.outline) - polygonArea(ring.holes[0]!))
    expect(ringBlock.holes[0]!.length).toBe(24)
  })

  it('clipHalfPlane halves a square and handles a concave subject', () => {
    const v = { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } }
    expect(polygonArea(clipHalfPlane(SQUARE, v.a, v.b, 1))).toBe(50)
    expect(polygonArea(clipHalfPlane(SQUARE, v.a, v.b, -1))).toBe(50)
    // 凹形（L 形，面积 10200）：竖切 x=42.5 两侧各 5100。
    const l = buildLevel(2, 1)
    const cut = { a: { x: -17.5, y: -80 }, b: { x: -17.5, y: 80 } }
    expect(polygonArea(clipHalfPlane(l.outline, cut.a, cut.b, 1))).toBeCloseTo(5100, 6)
    expect(polygonArea(clipHalfPlane(l.outline, cut.a, cut.b, -1))).toBeCloseTo(5100, 6)
  })

  it('cutBlock splits a block into two area-conserving pieces and rejects tangents', () => {
    const block = { id: 0, outer: SQUARE, holes: [] }
    const cut = { a: { x: 4, y: 0 }, b: { x: 4, y: 10 } }
    const r = cutBlock(block, cut.a, cut.b, 1, 2)
    expect(r).not.toBeNull()
    expect(blockArea(r!.left)).toBe(40)
    expect(blockArea(r!.right)).toBe(60)
    // 相切（沿边）与完全在块外的刀都切不开。
    expect(cutBlock(block, { x: 0, y: -5 }, { x: 0, y: 15 }, 3, 4)).toBeNull()
    expect(cutBlock(block, { x: 40, y: -5 }, { x: 40, y: 15 }, 5, 6)).toBeNull()
  })

  it('applyCut lets one line split several blocks and conserves total area', () => {
    let state = createCakeState(0, 5) // 圆形 2 刀 4 份
    const g = state.level.guides
    let total = state.level.totalArea
    const first = cakeCut(state, g[0]!.a, g[0]!.b)
    expect(first).not.toBeNull()
    expect(first!.blocks.length).toBe(2)
    // 第二刀与第一刀相交，同时贯穿两块 → 一次 +2 块。
    const second = cakeCut(first!, g[1]!.a, g[1]!.b)
    expect(second).not.toBeNull()
    expect(second!.blocks.length).toBe(4)
    for (const s of [state, first!, second!]) {
      const sum = s.blocks.reduce((acc, b) => acc + blockArea(b), 0)
      expect(sum).toBeCloseTo(total, 6)
    }
    expect(second!.solved).toBe(true)
    // 一刀没切到任何块 → null。
    expect(applyCut(second!.blocks, { x: 500, y: -500 }, { x: 500, y: 500 }, 99)).toBeNull()
  })

  it('every level is solved exactly by its symmetry guides', () => {
    for (let lv = 0; lv < LEVEL_COUNT; lv += 1) {
      let state = createCakeState(lv, lv * 13 + 1)
      expect(state.level.guides.length).toBe(state.level.cuts)
      for (const g of state.level.guides) {
        const next = cakeCut(state, g.a, g.b)
        expect(next).not.toBeNull()
        state = next!
      }
      expect(state.blocks.length).toBe(state.level.pieces)
      expect(state.cutsUsed).toBe(state.level.cuts)
      expect(cakeIsSolved(state)).toBe(true)
      for (const d of cakeDeviations(state)) expect(Math.abs(d)).toBeLessThan(1e-9)
    }
  })

  it('isSolved enforces piece count and the tolerance boundary', () => {
    const mk = (y: number) => {
      let s = createCakeState(1, 3) // 方形 [−70,70]²，K=4，容差 2%
      s = cakeCut(s, { x: 0, y: -100 }, { x: 0, y: 100 })!
      return cakeCut(s, { x: -100, y }, { x: 100, y })!
    }
    expect(mk(0).solved).toBe(true) // 精确四等分
    expect(mk(1).solved).toBe(true) // 偏差 70/4900 ≈ 1.43% ≤ 2%
    expect(mk(3).solved).toBe(false) // 偏差 210/4900 ≈ 4.29% 超差
    // 两条平行刀只出 3 块：份数不符即不过关。
    let s = createCakeState(1, 3)
    s = cakeCut(s, { x: -35, y: -100 }, { x: -35, y: 100 })!
    s = cakeCut(s, { x: 35, y: -100 }, { x: 35, y: 100 })!
    expect(s.blocks.length).toBe(3)
    expect(s.solved).toBe(false)
  })

  it('cut legality: no cut without a through chord, none past the limit', () => {
    let s = createCakeState(0, 9)
    expect(cakeCut(s, { x: 300, y: -300 }, { x: 300, y: 300 })).toBeNull()
    expect(cakeCut(s, { x: -90, y: 0 }, { x: 90, y: 0 })!.cutsUsed).toBe(1)
    expect(cakeCut(s, { x: -90, y: 0 }, { x: 90, y: 0 })).not.toBeNull()
    const solved = cakeCut(cakeCut(s, { x: -90, y: 0 }, { x: 90, y: 0 })!, { x: 0, y: -90 }, { x: 0, y: 90 })!
    expect(solved.solved).toBe(true)
    // 已过关或刀数用尽（1 刀关卡切完）后拒绝再切。
    expect(cakeCut(solved, { x: -90, y: 0 }, { x: 90, y: 0 })).toBeNull()
    const one = createCakeState(2, 4)
    const used = cakeCut(one, one.level.guides[0]!.a, one.level.guides[0]!.b)!
    expect(cakeCut(used, { x: -80, y: 0 }, { x: 80, y: 0 })).toBeNull()
  })

  it('undo restores the previous block set deterministically', () => {
    let s = createCakeState(0, 21)
    const cut = cakeCut(s, s.level.guides[0]!.a, s.level.guides[0]!.b)
    const undone = cakeUndo(cut!)
    expect(undone).not.toBeNull()
    expect(undone!.blocks.length).toBe(1)
    expect(undone!.cutsUsed).toBe(0)
    expect(cakeUndo(undone!)).toBeNull()
    // 重切同一刀得到完全相同的分块（序贯确定性）。
    const again = cakeCut(undone!, undone!.level.guides[0]!.a, undone!.level.guides[0]!.b)
    expect(again!.blocks.map(b => b.outer)).toEqual(cut!.blocks.map(b => b.outer))
    expect(again!.blocks.map(b => blockArea(b))).toEqual(cut!.blocks.map(b => blockArea(b)))
  })

  it('buildLevel is deterministic per seed; orientation follows the seed', () => {
    const a = buildLevel(0, 6)
    const b = buildLevel(0, 6)
    expect(a.outline).toEqual(b.outline)
    expect(a.guides).toEqual(b.guides)
    // 圆形关：不同 seed 旋转出不同辅助线角度，但都仍是可行解。
    const c = buildLevel(0, 6 + 1)
    expect(a.guides).not.toEqual(c.guides)
    let s = createCakeState(0, 6 + 1)
    for (const g of c.guides) s = cakeCut(s, g.a, g.b)!
    expect(s.solved).toBe(true)
    // 方形关与 seed 无关（无随机方位）。
    expect(buildLevel(1, 2).outline).toEqual(buildLevel(1, 99).outline)
    // 环形关孔洞在外轮廓内、凹形关面积为 10200（数据守恒）。
    expect(polygonArea(buildLevel(2, 1).outline)).toBeCloseTo(10200, 6)
  })

  it('cutSegments reports the knife path through the cake material', () => {
    const s = createCakeState(3, 8) // 圆环
    const segs = cutSegments(s.blocks, { x: -200, y: 0 }, { x: 200, y: 0 })
    // 直径穿过材料两段（孔洞断开），共四段边界围成两个 C 形材料段。
    expect(segs.length).toBe(2)
    const len = segs.reduce((acc, g) => acc + Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y), 0)
    expect(Math.abs(len - 2 * (90 - 45))).toBeLessThan(2) // 多边形逼近误差 ≤ 1 个半径单位
    // 完全在外 → 无刀路段。
    expect(cutSegments(s.blocks, { x: -300, y: 200 }, { x: 300, y: 200 })).toEqual([])
  })

  it('computeScore rewards level and unused cuts', () => {
    expect(computeScore(0, 0)).toBe(120)
    expect(computeScore(4, 0)).toBe(600)
    expect(computeScore(4, 1)).toBe(640)
  })
})
