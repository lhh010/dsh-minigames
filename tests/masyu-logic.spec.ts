import { describe, expect, it } from 'vitest'
import {
  LEVEL_SIZES, branchDots, cellEdges, classifyCell, edgeCount, edgesAtDot,
  hEdgeIndex, isWon, pearlBroken, pearlViolations, puzzleFromSeed, solveCount,
  vEdgeIndex, type EdgeState, type Pearl,
} from '../src/client/games/masyu/logic.ts'

/** 空边集。 */
const blank = (n: number): EdgeState[] => new Array<EdgeState>(n).fill(0)

/** 全盘边框环（回路，其余边记为叉 = 完整完成的盘面）。 */
function ringEdges(w: number, h: number): EdgeState[] {
  const ed = new Array<EdgeState>(edgeCount(w, h)).fill(2)
  for (let c = 0; c < w; c += 1) {
    ed[c] = 1
    ed[h * w + c] = 1
  }
  const base = w * (h + 1)
  for (let r = 0; r < h; r += 1) {
    ed[base + r * (w + 1)] = 1
    ed[base + r * (w + 1) + w] = 1
  }
  return ed
}

/** 空珠盘。 */
const noPearls = (w: number, h: number): Pearl[] => new Array<Pearl>(w * h).fill(0)

/** 单珠盘。 */
function onePearl(w: number, c: number, r: number, p: Pearl): Pearl[] {
  const ps = noPearls(w, w)
  ps[r * w + c] = p
  return ps
}

/** 生成缓存（同一尺寸多轮断言复用，控制测试时长）。 */
const cache = new Map<string, ReturnType<typeof puzzleFromSeed>>()
function gen(seed: number, w: number) {
  const key = seed + ':' + w
  let p = cache.get(key)
  if (p === undefined) {
    p = puzzleFromSeed(seed, w, w)
    cache.set(key, p)
  }
  return p
}

describe('masyu logic', () => {
  it('边编码数量与 cellEdges 范围正确', () => {
    expect(edgeCount(6, 6)).toBe(6 * 7 + 7 * 6)
    expect(edgeCount(2, 3)).toBe(2 * 4 + 3 * 3)
    const es = cellEdges(6, 6, 2, 2)
    expect(new Set(es).size).toBe(4)
    for (const e of es) expect(e).toBeGreaterThanOrEqual(0)
    expect(Math.max(...es)).toBeLessThan(edgeCount(6, 6))
  })

  it('边模型语义：边框环角格转弯、边格单边 partial；细走廊给直行格', () => {
    const w = 3, h = 3
    const ed = ringEdges(w, h)
    expect(classifyCell(ed, w, h, 0, 0)).toBe('turn')
    expect(classifyCell(ed, w, h, 2, 2)).toBe('turn')
    // 边模型下边框环只贴着边格的一条边：不是直行而是单线 partial。
    expect(classifyCell(ed, w, h, 1, 0)).toBe('partial')
    expect(classifyCell(ed, w, h, 0, 1)).toBe('partial')
    expect(classifyCell(ed, w, h, 1, 1)).toBe('off')
    // L 形多联骨牌的周界：拐角格 = 转弯、走廊格 = 直行、蛇端格 = 3 边 over。
    const cw = 6, ch = 7
    const lcells: [number, number][] = [[1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4]]
    const cor = blank(edgeCount(cw, ch))
    const seen = new Map<number, number>()
    for (const [c, r] of lcells) for (const e2 of cellEdges(cw, ch, c, r)) seen.set(e2, (seen.get(e2) ?? 0) + 1)
    for (const [e2, n] of seen) if (n === 1) cor[e2] = 1
    expect(classifyCell(cor, cw, ch, 1, 4)).toBe('turn')
    expect(classifyCell(cor, cw, ch, 1, 2)).toBe('straight-h')
    expect(classifyCell(cor, cw, ch, 1, 3)).toBe('straight-h')
    expect(classifyCell(cor, cw, ch, 2, 4)).toBe('straight-v')
    expect(classifyCell(cor, cw, ch, 1, 1)).toBe('over')
    expect(classifyCell(cor, cw, ch, 3, 3)).toBe('partial') // 贴着 L 下沿的单边格
    expect(classifyCell(cor, cw, ch, 4, 1)).toBe('off')
  })

  it('白珠放在转弯格违规；黑珠放在直行格违规', () => {
    const w = 3, h = 3
    const ed = ringEdges(w, h)
    expect(pearlBroken(ed, onePearl(w, 0, 0, 1), w, h, 0, 0)).toBe(true)
    expect(pearlBroken(ed, onePearl(w, 1, 0, 2), w, h, 1, 0)).toBe(true)
    // 白珠放在边格（仅北边一条线、其余叉）：直行形状不可能 → 也违规。
    expect(pearlBroken(ed, onePearl(w, 1, 0, 1), w, h, 1, 0)).toBe(true)
  })

  it('白珠直行但前进方向相邻格均不转弯 → 违规', () => {
    const w = 5, h = 5
    const ed = ringEdges(w, h)
    // (2,0) 水平直行，两侧 (1,0)/(3,0) 也都是直行 → 白珠违规。
    expect(pearlBroken(ed, onePearl(w, 2, 0, 1), w, h, 2, 0)).toBe(true)
    // (1,0) 同样只有单边（直行不可能）→ 违规。
    expect(pearlBroken(ed, onePearl(w, 1, 0, 1), w, h, 1, 0)).toBe(true)
    expect(pearlViolations(ed, onePearl(w, 2, 0, 1), w, h)).toEqual([2])
  })

  it('黑珠转弯但两方向邻格皆非直行 → 违规', () => {
    const w = 2, h = 2
    const ed = ringEdges(w, h)
    // 2x2 环四格都是朝外的转弯，两方向均出界 → 黑珠违规。
    for (const [c, r] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      expect(pearlBroken(ed, onePearl(w, c, r, 2), w, h, c, r)).toBe(true)
    }
  })

  it('branchDots 检测分叉（度 3）与交叉（度 4）', () => {
    const w = 2, h = 2
    // 中心点 (1,1) = 索引 1*(w+1)+1：入射 4 条边 = 交叉。
    const center = 1 * (w + 1) + 1
    const cross = blank(edgeCount(w, h))
    for (const e of edgesAtDot(w, h, center)) cross[e] = 1
    expect(branchDots(cross, w, h)).toEqual([center])
    // 去掉一条 = 度 3 分叉。
    const fork = blank(edgeCount(w, h))
    const incident = edgesAtDot(w, h, center)
    for (const e of incident.slice(0, 3)) fork[e] = 1
    expect(branchDots(fork, w, h)).toEqual([center])
    // 度 2 的点不算分叉。
    const line = blank(edgeCount(w, h))
    for (const e of incident.slice(0, 2)) line[e] = 1
    expect(branchDots(line, w, h)).toEqual([])
  })

  it('各尺寸生成盘自解成立：单一闭合回路且全部珠满足', { timeout: 30000 }, () => {
    for (const size of LEVEL_SIZES) {
      const p = gen(7, size)
      expect(isWon(p.solution, p.pearls, size, size)).toBe(true)
      expect(pearlViolations(p.solution, p.pearls, size, size)).toEqual([])
      expect(p.pearls.some(x => x !== 0)).toBe(true)
    }
  })

  it('唯一性：unique 为真时求解器恰好一解（或回落自洽）', () => {
    for (const size of LEVEL_SIZES) {
      const p = gen(7, size)
      if (!p.unique) {
        // 回落：解仍须自洽。
        expect(isWon(p.solution, p.pearls, size, size)).toBe(true)
        continue
      }
      const res = solveCount(size, size, p.pearls)
      expect(res.solutions).toBe(1)
      expect(res.exhausted).toBe(false)
    }
  })

  it('同种子生成结果确定', () => {
    const a = puzzleFromSeed(42, 6, 6)
    const b = puzzleFromSeed(42, 6, 6)
    expect(a.pearls).toEqual(b.pearls)
    expect(a.solution).toEqual(b.solution)
    expect(a.unique).toBe(b.unique)
  })

  it('isWon 负例：回路开口即不成立', () => {
    const p = gen(7, 6)
    expect(isWon(p.solution, p.pearls, 6, 6)).toBe(true)
    const idx = p.solution.findIndex(v => v === 1)
    const broken = p.solution.slice() as EdgeState[]
    broken[idx] = 0
    expect(isWon(broken, p.pearls, 6, 6)).toBe(false)
  })
})
