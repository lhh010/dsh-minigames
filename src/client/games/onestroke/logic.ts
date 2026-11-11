/**
 * 一笔画 (One Stroke / Euler path) 纯逻辑：给定平面图（节点 + 边），玩家
 * 从任一点起笔沿边移动，每条边恰好经过一次；生成器保证图永远可解——
 * 先在网格点上建随机生成树，再添加不交叉的弦补足边数，最后用「断一条
 * 接一条」的换边操作把奇点数收敛到目标（0 或 2），换边不改变边数、不
 * 破坏连通性，也不引入交叉。
 *
 * 状态以不可变值更新（新 Set / 新数组），便于渲染快照与单元测试。
 */

/** 五个关卡的配置：边数 8→20 递进，奇点数 0/2 交替。 */
export interface OneStrokeLevel {
  /** 目标边数。 */
  edges: number
  /** 目标奇点数（0 = 欧拉回路，2 = 欧拉路径）。 */
  odd: 0 | 2
}

export const LEVELS: readonly OneStrokeLevel[] = [
  { edges: 8, odd: 2 },
  { edges: 11, odd: 0 },
  { edges: 14, odd: 2 },
  { edges: 17, odd: 0 },
  { edges: 20, odd: 2 },
]

/** 平面坐标点（网格单元坐标）。 */
export interface Point {
  x: number
  y: number
}

/** 一条边：节点数组下标，规范化为 a < b。 */
export interface Edge {
  a: number
  b: number
}

/** 一张平面图。 */
export interface OneStrokeGraph {
  nodes: Point[]
  edges: Edge[]
}

/** 一局状态：at 为 null 表示尚未起笔。 */
export interface StrokeState {
  graph: OneStrokeGraph
  /** 笔尖所在节点；null = 未起笔。 */
  at: number | null
  /** 依次经过的节点（起笔节点为 path[0]）。 */
  path: number[]
  /** 已画过的边（edgeKey 集合）。 */
  drawn: ReadonlySet<string>
}

/** 一次移动的判定结果；ok 为 false 时给出原因。 */
export type MoveResult =
  | { ok: true, state: StrokeState }
  | { ok: false, reason: 'not-started' | 'not-adjacent' | 'edge-drawn' }

/** mulberry32 伪随机数发生器：同 seed 序列完全一致，可注入测试。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 边的规范化键（与端点顺序无关）。 */
export function edgeKey(a: number, b: number): string {
  return a < b ? a + ':' + b : b + ':' + a
}

/** 两点间欧氏距离平方。 */
function dist2(a: Point, b: Point): number {
  return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)
}

/** 三点方向叉积。 */
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

/** C 是否在线段 AB 上（含端点，需先保证共线）。 */
function onSegment(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return cx >= Math.min(ax, bx) - 1e-9 && cx <= Math.max(ax, bx) + 1e-9
    && cy >= Math.min(ay, by) - 1e-9 && cy <= Math.max(ay, by) + 1e-9
}

/**
 * 两条线段是否互相阻挡（不可共存）：端点相同时允许（都接在同一节点），
 * 否则出现真交叉、内点相切或共线重叠即视为阻挡。
 * @param a1 - 线段一端点 1。
 * @param a2 - 线段一端点 2。
 * @param b1 - 线段二端点 1。
 * @param b2 - 线段二端点 2。
 */
export function segmentsBlock(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const shareEndpoint = a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2
  if (shareEndpoint) return false
  const o1 = orient(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y)
  const o2 = orient(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y)
  const o3 = orient(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y)
  const o4 = orient(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y)
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true
  if (Math.abs(o1) < 1e-9 && onSegment(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y)) return true
  if (Math.abs(o2) < 1e-9 && onSegment(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y)) return true
  if (Math.abs(o3) < 1e-9 && onSegment(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y)) return true
  if (Math.abs(o4) < 1e-9 && onSegment(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y)) return true
  return false
}

/** 第三点是否严格落在线段内部（阻挡弦的穿过）。 */
function nodeOnSegment(p: Point, a: Point, b: Point): boolean {
  if (Math.abs(orient(a.x, a.y, b.x, b.y, p.x, p.y)) > 1e-9) return false
  const eps = 1e-9
  const inside = p.x > Math.min(a.x, b.x) + eps && p.x < Math.max(a.x, b.x) - eps
    || p.y > Math.min(a.y, b.y) + eps && p.y < Math.max(a.y, b.y) - eps
  return inside
}

/** 每个节点的度数数组。 */
export function degrees(graph: OneStrokeGraph): number[] {
  const deg = graph.nodes.map(() => 0)
  for (const e of graph.edges) {
    deg[e.a]! += 1
    deg[e.b]! += 1
  }
  return deg
}

/** 奇点（度为奇数的节点）下标列表。 */
export function oddNodes(graph: OneStrokeGraph): number[] {
  const deg = degrees(graph)
  const odd: number[] = []
  for (let i = 0; i < deg.length; i += 1) if (deg[i]! % 2 === 1) odd.push(i)
  return odd
}

/** 图是否连通（忽略无边孤立点；生成器产出的图每个节点都在树上）。 */
export function isConnected(graph: OneStrokeGraph): boolean {
  if (graph.nodes.length === 0) return true
  const adj: number[][] = graph.nodes.map(() => [])
  for (const e of graph.edges) {
    adj[e.a]!.push(e.b)
    adj[e.b]!.push(e.a)
  }
  const seen = new Set<number>([0])
  const queue = [0]
  while (queue.length > 0) {
    const v = queue.pop()!
    for (const w of adj[v]!) if (!seen.has(w)) { seen.add(w); queue.push(w) }
  }
  return seen.size === graph.nodes.length
}

/** 欧拉路径存在判定：连通且奇点数为 0 或 2。 */
export function hasEulerPath(graph: OneStrokeGraph): boolean {
  const odd = oddNodes(graph)
  return odd.length <= 2 && isConnected(graph)
}

function hasEdge(graph: OneStrokeGraph, a: number, b: number): boolean {
  const key = edgeKey(a, b)
  for (const e of graph.edges) if (edgeKey(e.a, e.b) === key) return true
  return false
}

function addEdge(graph: OneStrokeGraph, a: number, b: number): void {
  graph.edges.push(a < b ? { a, b } : { a: b, b: a })
}

function removeEdge(graph: OneStrokeGraph, a: number, b: number): void {
  const key = edgeKey(a, b)
  graph.edges = graph.edges.filter(e => edgeKey(e.a, e.b) !== key)
}

/** 候选边 (u,w) 是否与现有任何边交叉或穿过第三节点。 */
function addable(graph: OneStrokeGraph, u: number, w: number): boolean {
  if (u === w || hasEdge(graph, u, w)) return false
  const pu = graph.nodes[u]!
  const pw = graph.nodes[w]!
  for (const e of graph.edges) {
    if (segmentsBlock(pu, pw, graph.nodes[e.a]!, graph.nodes[e.b]!)) return false
  }
  for (let i = 0; i < graph.nodes.length; i += 1) {
    if (i !== u && i !== w && nodeOnSegment(graph.nodes[i]!, pu, pw)) return false
  }
  return true
}

/** 去掉边 (w,v) 后图是否仍连通（换边操作的前置条件）。 */
function removableKeepsConnected(graph: OneStrokeGraph, w: number, v: number): boolean {
  const key = edgeKey(w, v)
  const adj: number[][] = graph.nodes.map(() => [])
  for (const e of graph.edges) {
    if (edgeKey(e.a, e.b) === key) continue
    adj[e.a]!.push(e.b)
    adj[e.b]!.push(e.a)
  }
  const seen = new Set<number>([w])
  const queue = [w]
  while (queue.length > 0) {
    const x = queue.pop()!
    for (const y of adj[x]!) if (!seen.has(y)) { seen.add(y); queue.push(y) }
  }
  return seen.size === graph.nodes.length
}

/**
 * 一次构建尝试：随机网格布点 → 近邻偏好随机生成树 → 添加不交叉的弦到
 * 目标边数 → 换边收敛奇点数（奇点数只能以 2 为步长变化）。结果不保证
 * 恰达目标（极端布局下换边可能找不到落点），由 {@link generateGraph}
 * 校验并换种子重试。
 * @param attemptSeed - 本次尝试的种子。
 * @param targetEdges - 目标边数。
 * @param oddTarget - 目标奇点数 0 或 2。
 */
function buildOnce(attemptSeed: number, targetEdges: number, oddTarget: 0 | 2): OneStrokeGraph {
  const rand = mulberry32(attemptSeed)
  const nodeCount = Math.max(6, Math.ceil(targetEdges / 1.4))
  const grid = Math.max(4, Math.ceil(Math.sqrt(nodeCount)) + 1)

  // 随机取互不相同的网格单元作为节点。
  const cells: number[] = []
  for (let i = 0; i < grid * grid; i += 1) cells.push(i)
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = cells[i]!
    cells[i] = cells[j]!
    cells[j] = tmp
  }
  const nodes: Point[] = cells.slice(0, nodeCount).map(c => ({ x: c % grid, y: Math.floor(c / grid) }))

  const graph: OneStrokeGraph = { nodes, edges: [] }

  // 近邻偏好随机生成树：候选边只保留可添加的（不与已有边交叉、不穿过第
  // 三节点），在距离最近的 4 条里随机取一条——短边为主（视觉整齐）且从
  // 根上保证平面性。所有可行的 frontier 对里总存在可添加边，不致卡死。
  const visited = new Set<number>([Math.floor(rand() * nodeCount)])
  while (visited.size < nodeCount) {
    const candidates: { a: number, b: number, d: number }[] = []
    for (const a of visited) {
      for (let b = 0; b < nodeCount; b += 1) {
        if (!visited.has(b) && addable(graph, a, b)) {
          candidates.push({ a, b, d: dist2(nodes[a]!, nodes[b]!) })
        }
      }
    }
    candidates.sort((p, q) => p.d - q.d)
    const pick = candidates[Math.min(candidates.length - 1, Math.floor(rand() * 4))]!
    addEdge(graph, pick.a, pick.b)
    visited.add(pick.b)
  }

  // 添加不交叉的弦直到达到目标边数：多轮洗牌全对枚举，保证收敛。
  for (let pass = 0; pass < 10 && graph.edges.length < targetEdges; pass += 1) {
    const pairs: { u: number, w: number }[] = []
    for (let u = 0; u < nodeCount; u += 1) {
      for (let w = u + 1; w < nodeCount; w += 1) pairs.push({ u, w })
    }
    for (let i = pairs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = pairs[i]!
      pairs[i] = pairs[j]!
      pairs[j] = tmp
    }
    for (const { u, w } of pairs) {
      if (graph.edges.length >= targetEdges) break
      if (addable(graph, u, w)) addEdge(graph, u, w)
    }
  }

  // 换边收敛奇点数：取两个奇点 u、v，找一个 w 满足 w-v 相邻、u-w 可添加
  // 且删 w-v 不断图；删 (w,v) 接 (u,w) 后 u、v 翻转为偶、w 翻转两次不变，
  // 边数不变、连通性不变、不引入交叉。
  for (let round = 0; round < 8 * nodeCount; round += 1) {
    const odd = oddNodes(graph)
    if (odd.length <= oddTarget) break
    let fixed = false
    for (let i = 0; i < odd.length && !fixed; i += 1) {
      for (let j = i + 1; j < odd.length && !fixed; j += 1) {
        const u = odd[i]!
        const v = odd[j]!
        for (let w = 0; w < nodeCount && !fixed; w += 1) {
          if (w === u || w === v) continue
          if (hasEdge(graph, w, v) && addable(graph, u, w) && removableKeepsConnected(graph, w, v)) {
            removeEdge(graph, w, v)
            addEdge(graph, u, w)
            fixed = true
            break
          }
          if (hasEdge(graph, w, u) && addable(graph, v, w) && removableKeepsConnected(graph, w, u)) {
            removeEdge(graph, w, u)
            addEdge(graph, v, w)
            fixed = true
          }
        }
      }
    }
    if (!fixed) break
  }

  return graph
}

/**
 * 生成一张保证可解的一笔画平面图：逐次以派生种子调用 {@link buildOnce}
 * 并校验（边数恰为目标、奇点数恰为目标，欧拉路径随之成立）；同种子
 * 序列确定，结果逐字段一致。
 * @param seed - 种子；同种子产出完全相同的图。
 * @param targetEdges - 目标边数（结果恰等于该值）。
 * @param oddTarget - 目标奇点数 0 或 2（结果恰等于该值）。
 */
export function generateGraph(seed: number, targetEdges: number, oddTarget: 0 | 2): OneStrokeGraph {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const graph = buildOnce((seed + attempt * 0x9e3779b9) >>> 0, targetEdges, oddTarget)
    if (graph.edges.length === targetEdges && oddNodes(graph).length === oddTarget) return graph
  }
  // 理论上不可达（64 次派生种子全部失败的概率可忽略）：交回首次构建。
  return buildOnce(seed, targetEdges, oddTarget)
}

/** 关卡图：seed 由关卡号派生，同关卡重开得到完全相同的图。 */
export function levelGraph(level: number): OneStrokeGraph {
  const cfg = LEVELS[Math.min(Math.max(level, 1), LEVELS.length) - 1]!
  return generateGraph((level * 0x9e3779b9) >>> 0, cfg.edges, cfg.odd)
}

/** 一局的初始状态（未起笔）。 */
export function initialState(graph: OneStrokeGraph): StrokeState {
  return { graph, at: null, path: [], drawn: new Set() }
}

/** 从 node 节点起笔，返回新状态。 */
export function startAt(state: StrokeState, node: number): StrokeState {
  return { graph: state.graph, at: node, path: [node], drawn: new Set() }
}

/** 当前笔尖的合法目标（相邻且未画过的节点）。 */
export function legalTargets(state: StrokeState): number[] {
  if (state.at === null) return []
  const targets: number[] = []
  for (const e of state.graph.edges) {
    const other = e.a === state.at ? e.b : e.b === state.at ? e.a : null
    if (other !== null && !state.drawn.has(edgeKey(e.a, e.b))) targets.push(other)
  }
  return targets
}

/**
 * 尝试沿边移动到 to：需已起笔、与笔尖相邻且该边未画过；重复走已画的边
 * 返回 'edge-drawn'（对局失败，界面提示重开）。
 */
export function tryMove(state: StrokeState, to: number): MoveResult {
  if (state.at === null) return { ok: false, reason: 'not-started' }
  const from = state.at
  if (from === to) return { ok: false, reason: 'not-adjacent' }
  const key = edgeKey(from, to)
  const adjacent = state.graph.edges.some(e => edgeKey(e.a, e.b) === key)
  if (!adjacent) return { ok: false, reason: 'not-adjacent' }
  if (state.drawn.has(key)) return { ok: false, reason: 'edge-drawn' }
  const drawn = new Set(state.drawn)
  drawn.add(key)
  return {
    ok: true,
    state: { graph: state.graph, at: to, path: [...state.path, to], drawn },
  }
}

/** 节点的剩余度：总度数减去已画过的相邻边数（提示模式的教育信息）。 */
export function remainingDegree(state: StrokeState, node: number): number {
  let drawnEnds = 0
  for (const e of state.graph.edges) {
    if ((e.a === node || e.b === node) && state.drawn.has(edgeKey(e.a, e.b))) drawnEnds += 1
  }
  return degrees(state.graph)[node]! - drawnEnds
}

/** 是否画完全部边（过关判定）。 */
export function isComplete(state: StrokeState): boolean {
  return state.drawn.size === state.graph.edges.length && state.graph.edges.length > 0
}

/** 是否走进死点：已起笔、未画完且无任何合法移动。 */
export function isStuck(state: StrokeState): boolean {
  return state.at !== null && !isComplete(state) && legalTargets(state).length === 0
}
