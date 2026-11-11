import { describe, expect, it } from 'vitest'
import {
  LEVELS, degrees, edgeKey, generateGraph, hasEulerPath, initialState, isConnected, isComplete,
  isStuck, legalTargets, levelGraph, mulberry32, oddNodes, remainingDegree, segmentsBlock,
  startAt, tryMove,
  type OneStrokeGraph, type Point,
} from '../src/client/games/onestroke/logic.ts'

/** 由节点坐标 + 边对构造小图（手工判据用例）。 */
function graphOf(points: [number, number][], pairs: [number, number][]): OneStrokeGraph {
  const nodes: Point[] = points.map(([x, y]) => ({ x, y }))
  const edges = pairs.map(([a, b]) => (a < b ? { a, b } : { a: b, b: a }))
  return { nodes, edges }
}

/** 测试侧独立实现的 Hierholzer 欧拉迹：验证「生成图确实可被一笔画完」。 */
function eulerTrail(graph: OneStrokeGraph): number[] | null {
  const deg = degrees(graph)
  const odd = deg.filter(d => d % 2 === 1).length
  if (odd > 2) return null
  const adj: number[][] = graph.nodes.map(() => [])
  for (const e of graph.edges) {
    adj[e.a]!.push(e.b)
    adj[e.b]!.push(e.a)
  }
  let start = deg.findIndex(d => d % 2 === 1)
  if (start === -1) start = 0
  const used = new Set<string>()
  const stack: number[] = [start]
  const trail: number[] = []
  while (stack.length > 0) {
    const v = stack[stack.length - 1]!
    const next = adj[v]!.find(w => !used.has(edgeKey(v, w)))
    if (next === undefined) {
      trail.push(stack.pop()!)
    } else {
      used.add(edgeKey(v, next))
      stack.push(next)
    }
  }
  return trail.length === graph.edges.length + 1 ? trail : null
}

// 各关图的模块级缓存（生成一次，多个用例复用）。
const levelCache = new Map<number, OneStrokeGraph>()
function level(level: number): OneStrokeGraph {
  const cached = levelCache.get(level)
  if (cached !== undefined) return cached
  const graph = levelGraph(level)
  levelCache.set(level, graph)
  return graph
}

describe('onestroke logic', () => {
  it('mulberry32 同种子序列一致、异种子不同', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
    const c = mulberry32(43)
    expect([c(), c()]).not.toEqual([seqA[0], seqA[1]])
  })

  it('五个关卡：边数恰为目标、无重边、奇点数恰为 0/2、且欧拉路径存在', () => {
    LEVELS.forEach((cfg, i) => {
      const graph = level(i + 1)
      expect(graph.edges.length).toBe(cfg.edges)
      const keys = graph.edges.map(e => edgeKey(e.a, e.b))
      expect(new Set(keys).size).toBe(keys.length) // 无重边/自环
      const odd = oddNodes(graph)
      expect(odd.length).toBe(cfg.odd)
      expect(hasEulerPath(graph)).toBe(true)
      expect(isConnected(graph)).toBe(true)
    })
  })

  it('生成图是平面布局：任何两条边不交叉、边不穿过第三节点', () => {
    for (let l = 1; l <= LEVELS.length; l += 1) {
      const graph = level(l)
      for (let i = 0; i < graph.edges.length; i += 1) {
        for (let j = i + 1; j < graph.edges.length; j += 1) {
          const ei = graph.edges[i]!
          const ej = graph.edges[j]!
          const block = segmentsBlock(
            graph.nodes[ei.a]!, graph.nodes[ei.b]!,
            graph.nodes[ej.a]!, graph.nodes[ej.b]!,
          )
          expect(block).toBe(false)
        }
      }
    }
  })

  it('生成图可被 Hierholzer 一笔画完（可解性不只在判据上成立）', () => {
    for (let l = 1; l <= LEVELS.length; l += 1) {
      const trail = eulerTrail(level(l))
      expect(trail).not.toBeNull()
    }
  })

  it('oddNodes / hasEulerPath 手工判据：路径 2 奇点、环 0 奇点、断图不可解', () => {
    const path = graphOf([[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 2]])
    expect(oddNodes(path)).toEqual([0, 2])
    expect(hasEulerPath(path)).toBe(true)
    const cycle = graphOf([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 1], [1, 2], [2, 3], [3, 0]])
    expect(oddNodes(cycle)).toEqual([])
    expect(hasEulerPath(cycle)).toBe(true)
    const k13 = graphOf([[0, 0], [1, -1], [1, 1], [-1, 0]], [[0, 1], [0, 2], [0, 3]])
    expect(oddNodes(k13).length).toBe(4)
    expect(hasEulerPath(k13)).toBe(false) // 四奇点
    const split = graphOf([[0, 0], [1, 0], [3, 0], [4, 0]], [[0, 1], [2, 3]])
    expect(hasEulerPath(split)).toBe(false) // 不连通
  })

  it('tryMove 合法性：未起笔 / 不相邻 / 重复边拒绝，合法移动更新状态', () => {
    const square = graphOf([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 1], [1, 2], [2, 3], [3, 0]])
    let state = initialState(square)
    expect(tryMove(state, 1)).toEqual({ ok: false, reason: 'not-started' })
    state = startAt(state, 0)
    expect(tryMove(state, 2)).toEqual({ ok: false, reason: 'not-adjacent' }) // 对角
    const ok = tryMove(state, 1)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      state = ok.state
      expect(state.at).toBe(1)
      expect(state.path).toEqual([0, 1])
      expect(state.drawn.has(edgeKey(0, 1))).toBe(true)
    }
    expect(tryMove(state, 0)).toEqual({ ok: false, reason: 'edge-drawn' }) // 原路返回
  })

  it('沿 Hierholzer 迹走完生成图：isComplete 为真', () => {
    const graph = generateGraph(7, 10, 2)
    const trail = eulerTrail(graph)!
    let state = startAt(initialState(graph), trail[0]!)
    for (let i = 1; i < trail.length; i += 1) {
      const step = tryMove(state, trail[i]!)
      expect(step.ok).toBe(true)
      if (step.ok) state = step.state
    }
    expect(isComplete(state)).toBe(true)
    expect(isStuck(state)).toBe(false)
  })

  it('死点判定：星图从叶出发走进另一叶即无路可走', () => {
    const star = graphOf([[0, 0], [1, -1], [1, 1], [-1, 0]], [[0, 1], [0, 2], [0, 3]])
    let state = startAt(initialState(star), 1)
    const step = tryMove(state, 0)
    expect(step.ok).toBe(true)
    if (step.ok) state = step.state
    expect(legalTargets(state)).toEqual([2, 3])
    const step2 = tryMove(state, 2)
    expect(step2.ok).toBe(true)
    if (step2.ok) state = step2.state
    expect(legalTargets(state)).toEqual([])
    expect(isStuck(state)).toBe(true)
    expect(isComplete(state)).toBe(false)
  })

  it('remainingDegree 随已画边递减，legalTargets 排除已画邻居', () => {
    const graph = level(1)
    const trail = eulerTrail(graph)!
    let state = startAt(initialState(graph), trail[0]!)
    const before = remainingDegree(state, trail[0]!)
    expect(before).toBe(degrees(graph)[trail[0]!])
    for (let i = 1; i <= 3; i += 1) {
      const step = tryMove(state, trail[i]!)
      expect(step.ok).toBe(true)
      if (step.ok) state = step.state
    }
    // 起笔点可能在路径中途被再次经过：期望值按「已画邻接边数」独立统计。
    let usedFromStart = 0
    for (const e of graph.edges) {
      if ((e.a === trail[0] || e.b === trail[0]) && state.drawn.has(edgeKey(e.a, e.b))) usedFromStart += 1
    }
    expect(remainingDegree(state, trail[0]!)).toBe(before - usedFromStart)
    // 简单图中刚离开的节点只与笔尖共边一次：该边已画，故不再是合法目标。
    expect(legalTargets(state)).not.toContain(trail[2]!)
  })

  it('确定性：levelGraph 与 generateGraph 同种子产出逐字段一致的图', () => {
    expect(levelGraph(3)).toEqual(levelGraph(3))
    expect(generateGraph(123, 12, 0)).toEqual(generateGraph(123, 12, 0))
    expect(generateGraph(123, 12, 0)).not.toEqual(generateGraph(124, 12, 0))
  })
})
