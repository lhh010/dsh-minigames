/**
 * 真珠回路 (Masyu) 纯逻辑。与数回 (slitherlink) 同族的格点边模型：
 *   - 水平边：w 列 × (h+1) 行 → 索引 [0, w*(h+1))
 *   - 垂直边：(w+1) 列 × h 行 → 索引 [w*(h+1), ...)
 * 边状态 0 未知 / 1 画线 / 2 叉。珠规则按"格"判定：
 *   - 白珠格：回路经过（恰两条对边画线 = 直行），且沿前进方向的相邻格
 *     中至少一格转弯；
 *   - 黑珠格：回路在该格转弯（恰两条邻边画线），且两个方向中至少一侧
 *     相邻格直行。
 * 胜利 = 画线构成单一闭合回路（每点度数恰 2、单连通分量，无分叉无
 * 交叉）且所有珠满足。
 *
 * 生成：格点上生长式随机自避免闭合回路（直行偏好随机游走 + 回溯，
 * 预算封顶），按回路形状挑出合法白/黑珠候选格，随机抽珠后用预算
 * 封顶的回溯求解器验证唯一解（不足则补珠，仍不足则重掷回路；
 * 全部失败时回落到边框环 + 全候选珠、标记多解）。
 */

/** 边状态：0 未知 / 1 画线 / 2 叉。 */
export type EdgeState = 0 | 1 | 2
/** 珠类型：0 无珠 / 1 白珠 / 2 黑珠。 */
export type Pearl = 0 | 1 | 2
/** 格在当前边集下的形态。 */
export type CellKind = 'straight-h' | 'straight-v' | 'turn' | 'off' | 'partial' | 'over'

/** 五关棋盘边长（正方形棋盘）。 */
export const LEVEL_SIZES: readonly number[] = [6, 7, 8, 9, 10]

/** 求解器单次调用节点预算（生成期验证）。 */
const SOLVE_BUDGET = 26_000
/** 生成期抽珠精简（减珠复验）节点预算。 */
const THIN_BUDGET = 9_000
/** 回路生长步数预算（每次尝试）。 */
const WALK_BUDGET = 20_000
/** 回路生长尝试次数。 */
const WALK_ATTEMPTS = 6
/** 生成重掷（新回路）次数上限。 */
const GEN_ATTEMPTS = 4

/** mulberry32 种子随机数发生器。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 水平边索引。col ∈ [0,w)，row ∈ [0,h]。 */
export function hEdgeIndex(w: number, col: number, row: number): number {
  return row * w + col
}

/** 垂直边索引。col ∈ [0,w]，row ∈ [0,h)。 */
export function vEdgeIndex(w: number, h: number, col: number, row: number): number {
  return hEdgeCount(w, h) + row * (w + 1) + col
}

/** 水平边总数。 */
export function hEdgeCount(w: number, h: number): number {
  return w * (h + 1)
}

/** 边总数。 */
export function edgeCount(w: number, h: number): number {
  return hEdgeCount(w, h) + (w + 1) * h
}

/** 格 (c,r) 四条边 [N, E, S, W]。 */
export function cellEdges(w: number, h: number, c: number, r: number): [number, number, number, number] {
  return [
    hEdgeIndex(w, c, r),
    vEdgeIndex(w, h, c + 1, r),
    hEdgeIndex(w, c, r + 1),
    vEdgeIndex(w, h, c, r),
  ]
}

/** 边 i 连接的两个格点索引。 */
export function edgeDots(w: number, h: number, i: number): [number, number] {
  const hc = hEdgeCount(w, h)
  if (i < hc) {
    const row = Math.floor(i / w)
    const col = i % w
    const a = row * (w + 1) + col
    return [a, a + 1]
  }
  const j = i - hc
  const row = Math.floor(j / (w + 1))
  const col = j % (w + 1)
  const a = row * (w + 1) + col
  return [a, a + (w + 1)]
}

/** 格点 d 的所有关联边索引。 */
export function edgesAtDot(w: number, h: number, d: number): number[] {
  const r = Math.floor(d / (w + 1))
  const c = d % (w + 1)
  const out: number[] = []
  if (c > 0) out.push(hEdgeIndex(w, c - 1, r))
  if (c < w) out.push(hEdgeIndex(w, c, r))
  if (r > 0) out.push(vEdgeIndex(w, h, c, r - 1))
  if (r < h) out.push(vEdgeIndex(w, h, c, r))
  return out
}

/** 回路结构检查：每点度数 0 或 2，且画线构成单连通分量。 */
export function cycleCheck(edges: readonly number[], w: number, h: number): { singleCycle: boolean; degreeOk: boolean } {
  const dots = (w + 1) * (h + 1)
  const degree = new Array<number>(dots).fill(0)
  const drawn: number[] = []
  for (let i = 0; i < edges.length; i += 1) {
    if (edges[i] !== 1) continue
    drawn.push(i)
    const [a, b] = edgeDots(w, h, i)
    degree[a]! += 1
    degree[b]! += 1
  }
  const degreeOk = drawn.length > 0 && degree.every(d => d === 0 || d === 2)
  const adj: number[][] = Array.from({ length: dots }, () => [])
  for (const i of drawn) {
    const [a, b] = edgeDots(w, h, i)
    adj[a]!.push(b)
    adj[b]!.push(a)
  }
  let singleCycle = false
  if (degreeOk && drawn.length > 0) {
    const start = edgeDots(w, h, drawn[0]!)[0]!
    const seen = new Set<number>([start])
    const stack = [start]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const n of adj[cur]!) {
        if (!seen.has(n)) { seen.add(n); stack.push(n) }
      }
    }
    singleCycle = seen.size === degree.filter(d => d > 0).length
  }
  return { singleCycle, degreeOk }
}

/** 度数 ≥3 的格点（分叉；度数 4 同时也是交叉），用于违规红显。 */
export function branchDots(edges: readonly number[], w: number, h: number): number[] {
  const dots = (w + 1) * (h + 1)
  const degree = new Array<number>(dots).fill(0)
  for (let i = 0; i < edges.length; i += 1) {
    if (edges[i] !== 1) continue
    const [a, b] = edgeDots(w, h, i)
    degree[a]! += 1
    degree[b]! += 1
  }
  const out: number[] = []
  for (let d = 0; d < dots; d += 1) if (degree[d]! >= 3) out.push(d)
  return out
}

/** 格形态分类：直行（水平/垂直）/ 转弯 / 未经过 / 半经过 / 超过两条。 */
export function classifyCell(edges: readonly number[], w: number, h: number, c: number, r: number): CellKind {
  const [n, e, s, wd] = cellEdges(w, h, c, r)
  const st = [edges[n]!, edges[e]!, edges[s]!, edges[wd]!]
  const lines = st.filter(v => v === 1).length
  if (lines === 0) return 'off'
  if (lines === 1) return 'partial'
  if (lines > 2) return 'over'
  if (st[0] === 1 && st[2] === 1) return 'straight-v'
  if (st[1] === 1 && st[3] === 1) return 'straight-h'
  return 'turn'
}

/** 一对边（相对 4 条边数组的两个索引）在当前状态下是否仍可成立。 */
function pairFeasible(ed: readonly number[], es: readonly number[], pair: [number, number]): boolean {
  for (let k = 0; k < 4; k += 1) {
    const v = ed[es[k]!]!
    if (pair.includes(k)) { if (v === 2) return false } else if (v === 1) return false
  }
  return true
}

/** 某格当前是否仍可能成为"转弯格"（某对邻边可成立）。 */
function canBeTurn(ed: readonly number[], es: readonly number[]): boolean {
  return pairFeasible(ed, es, [0, 1]) || pairFeasible(ed, es, [1, 2]) || pairFeasible(ed, es, [2, 3]) || pairFeasible(ed, es, [3, 0])
}

/** 某格当前是否仍可能成为"直行格"（某对对边可成立）。 */
function canBeStraight(ed: readonly number[], es: readonly number[]): boolean {
  return pairFeasible(ed, es, [0, 2]) || pairFeasible(ed, es, [1, 3])
}

/** 某格当前是否已确定为指定形态（两条边画线，其余为叉）。 */
function isDetermined(ed: readonly number[], es: readonly number[], pair: [number, number]): boolean {
  return ed[es[pair[0]]!] === 1 && ed[es[pair[1]]!] === 1 &&
    [0, 1, 2, 3].every(k => pair.includes(k) || ed[es[k]!] === 2)
}

/** 终局判定用：两条边画线且其余不是线（0 未知视为无线）。 */
function isCompletePair(ed: readonly number[], es: readonly number[], pair: [number, number]): boolean {
  return ed[es[pair[0]]!] === 1 && ed[es[pair[1]]!] === 1 &&
    [0, 1, 2, 3].every(k => pair.includes(k) || ed[es[k]!] !== 1)
}

/**
 * 珠是否已被当前边集证伪（形状不可能，或形状已定而相邻规则已不可能）。
 * 只在"确定无解"时报违规，不因邻居尚未画线而误报。
 */
export function pearlBroken(edges: readonly number[], pearls: readonly Pearl[], w: number, h: number, c: number, r: number): boolean {
  const p = pearls[r * w + c] ?? 0
  if (p === 0) return false
  const es = cellEdges(w, h, c, r)
  if (p === 1) {
    if (!pairFeasible(edges, es, [0, 2]) && !pairFeasible(edges, es, [1, 3])) return true
    if (isDetermined(edges, es, [0, 2])) {
      return !neighborTurn(edges, w, h, c, r - 1) && !neighborTurn(edges, w, h, c, r + 1)
    }
    if (isDetermined(edges, es, [1, 3])) {
      return !neighborTurn(edges, w, h, c - 1, r) && !neighborTurn(edges, w, h, c + 1, r)
    }
    return false
  }
  const pairs: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]]
  const feasible = pairs.filter(pr => pairFeasible(edges, es, pr))
  if (feasible.length === 0) return true
  for (const pr of feasible) {
    if (!isDetermined(edges, es, pr)) continue
    // 该转弯的两条线方向：N=0(上), E=1(右), S=2(下), W=3(左)
    const nc = pr.includes(0) ? [c, r - 1] : null
    const ec = pr.includes(1) ? [c + 1, r] : null
    const sc = pr.includes(2) ? [c, r + 1] : null
    const wc = pr.includes(3) ? [c - 1, r] : null
    const dirs = [nc, ec, sc, wc].filter((x): x is number[] => x !== null)
    const ok = dirs.every(d => neighborStraight(edges, w, h, d[0]!, d[1]!))
    if (!ok) return true
  }
  return false
}

/** 邻格是否在盘内且已是转弯格。 */
function neighborTurn(edges: readonly number[], w: number, h: number, c: number, r: number): boolean {
  if (c < 0 || c >= w || r < 0 || r >= h) return false
  return classifyCell(edges, w, h, c, r) === 'turn'
}

/** 邻格是否在盘内且已是直行格。 */
function neighborStraight(edges: readonly number[], w: number, h: number, c: number, r: number): boolean {
  if (c < 0 || c >= w || r < 0 || r >= h) return false
  const k = classifyCell(edges, w, h, c, r)
  return k === 'straight-h' || k === 'straight-v'
}

/** 已证伪的珠格列表（违规红显）。 */
export function pearlViolations(edges: readonly number[], pearls: readonly Pearl[], w: number, h: number): number[] {
  const out: number[] = []
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      if (pearlBroken(edges, pearls, w, h, c, r)) out.push(r * w + c)
    }
  }
  return out
}

/** 完整判定：某珠格在当前（终局）边集下是否满足规则。 */
function pearlOk(edges: readonly number[], pearls: readonly Pearl[], w: number, h: number, c: number, r: number): boolean {
  const p = pearls[r * w + c] ?? 0
  if (p === 0) return true
  const es = cellEdges(w, h, c, r)
  if (p === 1) {
    if (isCompletePair(edges, es, [0, 2])) return neighborTurn(edges, w, h, c, r - 1) || neighborTurn(edges, w, h, c, r + 1)
    if (isCompletePair(edges, es, [1, 3])) return neighborTurn(edges, w, h, c - 1, r) || neighborTurn(edges, w, h, c + 1, r)
    return false
  }
  const pairs: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]]
  for (const pr of pairs) {
    if (!isCompletePair(edges, es, pr)) continue
    const dirs: number[][] = []
    if (pr.includes(0)) dirs.push([c, r - 1])
    if (pr.includes(1)) dirs.push([c + 1, r])
    if (pr.includes(2)) dirs.push([c, r + 1])
    if (pr.includes(3)) dirs.push([c - 1, r])
    return dirs.every(d => neighborStraight(edges, w, h, d[0]!, d[1]!))
  }
  return false
}

/** 纯胜利判定：单一闭合回路且所有珠满足（0 视为未画线）。 */
export function isWon(edges: readonly number[], pearls: readonly Pearl[], w: number, h: number): boolean {
  const { singleCycle, degreeOk } = cycleCheck(edges, w, h)
  if (!singleCycle || !degreeOk) return false
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      if (!pearlOk(edges, pearls, w, h, c, r)) return false
    }
  }
  return true
}

/** 求解结果：解数（封顶 2）、预算是否耗尽、消耗节点数。 */
export interface SolveResult {
  solutions: number
  exhausted: boolean
  nodes: number
}

/**
 * 预算封顶的回溯求解器：以"点度数 0/2"与"珠形状 + 相邻规则"做传播
 * 剪枝，从开放端（度数 1 的点）或首颗珠播种扩展，统计满足全部规则
 * 的单一闭合回路数（最多数到 2）。
 */
export function solveCount(w: number, h: number, pearls: readonly Pearl[], budget = SOLVE_BUDGET): SolveResult {
  const total = edgeCount(w, h)
  const dotCount = (w + 1) * (h + 1)
  const cellEs: [number, number, number, number][] = []
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) cellEs.push(cellEdges(w, h, c, r))
  }
  const dotEs: number[][] = []
  for (let d = 0; d < dotCount; d += 1) dotEs.push(edgesAtDot(w, h, d))
  const pearlCells: { cell: number; type: Pearl }[] = []
  for (let i = 0; i < cellEs.length; i += 1) {
    const p = pearls[i] ?? 0
    if (p !== 0) pearlCells.push({ cell: i, type: p })
  }
  let solutions = 0
  let exhausted = false
  let nodes = 0

  /** 传播到不动点；返回 false 表示矛盾。 */
  const propagate = (ed: number[]): boolean => {
    let changed = true
    while (changed) {
      changed = false
      for (let d = 0; d < dotCount; d += 1) {
        const es = dotEs[d]!
        let lines = 0
        let unknown = 0
        for (const e of es) {
          if (ed[e] === 1) lines += 1
          else if (ed[e] === 0) unknown += 1
        }
        if (lines > 2) return false
        if (lines === 2 && unknown > 0) {
          for (const e of es) if (ed[e] === 0) { ed[e] = 2; changed = true }
        } else if (lines === 1 && unknown === 0) return false
      }
      for (const pc of pearlCells) {
        const es = cellEs[pc.cell]!
        const c = pc.cell % w
        const r = Math.floor(pc.cell / w)
        if (pc.type === 1) {
          const nsOk = pairFeasible(ed, es, [0, 2])
          const ewOk = pairFeasible(ed, es, [1, 3])
          if (!nsOk && !ewOk) return false
          if (nsOk !== ewOk) {
            const pr: [number, number] = nsOk ? [0, 2] : [1, 3]
            for (let k = 0; k < 4; k += 1) {
              const target = pr.includes(k) ? 1 : 2
              if (ed[es[k]!] === 0) { ed[es[k]!] = target; changed = true }
            }
          }
          if (isDetermined(ed, es, [0, 2])) {
            if (!maybeTurn(ed, w, h, c, r - 1) && !maybeTurn(ed, w, h, c, r + 1)) return false
          } else if (isDetermined(ed, es, [1, 3])) {
            if (!maybeTurn(ed, w, h, c - 1, r) && !maybeTurn(ed, w, h, c + 1, r)) return false
          }
        } else {
          const pairs: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]]
          const feasible = pairs.filter(pr => pairFeasible(ed, es, pr))
          if (feasible.length === 0) return false
          if (feasible.length === 1) {
            const pr = feasible[0]!
            for (let k = 0; k < 4; k += 1) {
              const target = pr.includes(k) ? 1 : 2
              if (ed[es[k]!] === 0) { ed[es[k]!] = target; changed = true }
            }
          }
          for (const pr of feasible) {
            if (!isDetermined(ed, es, pr)) continue
            const dirs: number[][] = []
            if (pr.includes(0)) dirs.push([c, r - 1])
            if (pr.includes(1)) dirs.push([c + 1, r])
            if (pr.includes(2)) dirs.push([c, r + 1])
            if (pr.includes(3)) dirs.push([c - 1, r])
            if (!dirs.some(d => maybeStraight(ed, w, h, d[0]!, d[1]!))) return false
          }
        }
      }
    }
    return true
  }

  /** 邻格仍可能成为转弯格（传播用，只看边状态）。 */
  function maybeTurn(ed: readonly number[], w: number, h: number, c: number, r: number): boolean {
    if (c < 0 || c >= w || r < 0 || r >= h) return false
    return canBeTurn(ed, cellEdges(w, h, c, r))
  }

  /** 邻格仍可能成为直行格（传播用，只看边状态）。 */
  function maybeStraight(ed: readonly number[], w: number, h: number, c: number, r: number): boolean {
    if (c < 0 || c >= w || r < 0 || r >= h) return false
    return canBeStraight(ed, cellEdges(w, h, c, r))
  }

  /** 终局验证：把未知全视为叉后做完整胜利判定。 */
  const validateFinal = (ed: readonly number[]): boolean => {
    const lines = ed.map(v => (v === 1 ? 1 : 0))
    const cc = cycleCheck(lines, w, h)
    if (!cc.singleCycle || !cc.degreeOk) return false
    for (const pc of pearlCells) {
      const c = pc.cell % w
      const r = Math.floor(pc.cell / w)
      if (!pearlOk(lines, pearls, w, h, c, r)) return false
    }
    return true
  }

  const search = (ed: number[]): void => {
    if (solutions >= 2 || exhausted) return
    nodes += 1
    if (nodes > budget) { exhausted = true; return }
    if (!propagate(ed)) return
    // 找一个开放端（度数 1 且仍有未知关联边）。
    let open = -1
    for (let d = 0; d < dotCount; d += 1) {
      const es = dotEs[d]!
      let lines = 0
      let unknown = 0
      for (const e of es) {
        if (ed[e] === 1) lines += 1
        else if (ed[e] === 0) unknown += 1
      }
      if (lines === 1 && unknown > 0) { open = d; break }
    }
    if (open >= 0) {
      const opts = dotEs[open]!.filter(e => ed[e] === 0)
      for (const e of opts) {
        const next = ed.slice()
        next[e] = 1
        for (const other of opts) if (other !== e) next[other] = 2
        search(next)
        if (solutions >= 2 || exhausted) return
      }
      return
    }
    // 无开放端：统计画线。
    const hasLine = ed.some(v => v === 1)
    if (!hasLine) {
      // 尚无任何线：从第一颗珠（或首条边）播种。
      if (pearlCells.length === 0) {
        const first = ed.findIndex(v => v === 0)
        if (first < 0) return
        for (const v of [1, 2] as const) {
          const next = ed.slice()
          next[first] = v
          search(next)
          if (solutions >= 2 || exhausted) return
        }
        return
      }
      const pc = pearlCells[0]!
      const es = cellEs[pc.cell]!
      const pairs: [number, number][] = pc.type === 1 ? [[0, 2], [1, 3]] : [[0, 1], [1, 2], [2, 3], [3, 0]]
      for (const pr of pairs) {
        if (!pairFeasible(ed, es, pr)) continue
        const next = ed.slice()
        for (let k = 0; k < 4; k += 1) next[es[k]!] = pr.includes(k) ? 1 : 2
        search(next)
        if (solutions >= 2 || exhausted) return
      }
      return
    }
    // 有线且无开放端：画线必为若干互不相交的闭合环。
    // 多于一个环直接无效；恰一个环时未知边只能全为叉（再画线必产生
    // 度数 3+ 或第二个环），故验证该唯一候选后回溯。
    const seenDots = new Set<number>()
    let components = 0
    for (let i = 0; i < total; i += 1) {
      if (ed[i] !== 1) continue
      const [a, b] = edgeDots(w, h, i)
      if (seenDots.has(a)) continue
      components += 1
      if (components > 1) return
      const stack = [a]
      seenDots.add(a)
      while (stack.length > 0) {
        const cur = stack.pop()!
        for (const e of dotEs[cur]!) {
          if (ed[e] !== 1) continue
          const [x, y] = edgeDots(w, h, e)
          const other = x === cur ? y : x
          if (!seenDots.has(other)) { seenDots.add(other); stack.push(other) }
        }
      }
    }
    if (validateFinal(ed)) solutions += 1
  }

  search(new Array<number>(total).fill(0))
  return { solutions, exhausted, nodes }
}

/** 一局生成结果。 */
export interface MasyuPuzzle {
  w: number
  h: number
  /** 每格珠类型（0 无珠）。 */
  pearls: Pearl[]
  /** 生成回路：1 为回路边，0 为空。 */
  solution: EdgeState[]
  /** 求解器是否证明了唯一解。 */
  unique: boolean
}

/** 过关得分：基础 100×关数；未用提示时叠加随时间衰减的奖励。 */
export function computeScore(level: number, seconds: number, hintUsed: boolean): number {
  return 100 * level + (hintUsed ? 0 : Math.max(0, 3000 - Math.floor(seconds) * 5))
}

/** 相邻格点对 → 边索引；不相邻返回 -1。 */
function dotEdgeIndex(w: number, h: number, a: number, b: number): number {
  const ar = Math.floor(a / (w + 1))
  const ac = a % (w + 1)
  const br = Math.floor(b / (w + 1))
  const bc = b % (w + 1)
  if (ar === br && Math.abs(ac - bc) === 1) return hEdgeIndex(w, Math.min(ac, bc), ar)
  if (ac === bc && Math.abs(ar - br) === 1) return vEdgeIndex(w, h, ac, Math.min(ar, br))
  return -1
}

/** 由点序列（含闭合）构造边集。 */
function edgesFromPath(path: number[], w: number, h: number): EdgeState[] {
  const sol = new Array<EdgeState>(edgeCount(w, h)).fill(0)
  for (let i = 0; i < path.length; i += 1) {
    const a = path[i]!
    const b = path[(i + 1) % path.length]!
    const e = dotEdgeIndex(w, h, a, b)
    if (e >= 0) sol[e] = 1
  }
  return sol
}

/**
 * 细胞蛇回路：在内部格（1..w-2 × 1..h-2）上生长一条自避免且不自触
 * （除前后相邻外无邻接）的细胞路径；路径格集合是一个细长多联骨牌，
 * 其周界天然就是一条单一闭合回路——比在格点图上随机游走稳定得多。
 * 直行偏好让蛇足够长；死端回溯；尝试封顶失败回落边框环。
 */
function growLoop(rng: () => number, w: number, h: number): EdgeState[] {
  const cw = w - 2
  const ch = h - 2
  if (cw < 2 || ch < 2) return ringLoop(w, h)
  const target = Math.max(6, Math.round(cw * ch * 0.45))
  const used = new Uint8Array(w * h)
  const inBoard = (c: number, r: number): boolean => c >= 1 && c <= w - 2 && r >= 1 && r <= h - 2
  const stepVec: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (let att = 0; att < 12; att += 1) {
    const sc = 1 + Math.floor(rng() * cw)
    const sr = 1 + Math.floor(rng() * ch)
    const path: number[] = [sr * w + sc]
    used.fill(0)
    used[path[0]!] = 1
    let dirC = 1
    let dirR = 0
    let backtracks = 0
    while (path.length < target && backtracks < 24) {
      const cur = path[path.length - 1]!
      const cc = cur % w
      const cr = Math.floor(cur / w)
      // 候选：界内、未用、且除当前格外不与任何路径格相邻（不自触）。
      const opts: [number, number, number, number][] = []
      for (const [dx, dy] of stepVec) {
        const nc = cc + dx
        const nr = cr + dy
        if (!inBoard(nc, nr)) continue
        const ni = nr * w + nc
        if (used[ni] === 1) continue
        let touch = false
        for (const [mx, my] of stepVec) {
          const mc = nc + mx
          const mr = nr + my
          if (mc < 0 || mc >= w || mr < 0 || mr >= h) continue
          const mi = mr * w + mc
          if (used[mi] === 1 && mi !== cur) { touch = true; break }
        }
        if (touch) continue
        opts.push([ni, dx, dy, dx === dirC && dy === dirR ? 1 : 0])
      }
      if (opts.length === 0) {
        if (path.length <= 2) break
        const removed = path.pop()!
        used[removed] = 0
        backtracks += 1
        const prev = path[path.length - 1]!
        const pn = path.length >= 2 ? path[path.length - 2]! : prev
        dirC = (prev % w) - (pn % w)
        dirR = Math.floor(prev / w) - Math.floor(pn / w)
        continue
      }
      // 直行偏好 0.55。
      const straight = opts.find((o) => o[3] === 1)
      const pick = straight !== undefined && rng() < 0.55 ? straight : opts[Math.floor(rng() * opts.length)]!
      path.push(pick[0])
      used[pick[0]] = 1
      dirC = pick[1]
      dirR = pick[2]
    }
    if (path.length < 6) continue
    // 周界 = 恰好属于一个路径格的边（共享边抵消）。
    const sol = new Array<EdgeState>(edgeCount(w, h)).fill(0)
    const seen = new Map<number, number>()
    for (const cell of path) {
      const c = cell % w
      const r = Math.floor(cell / w)
      for (const e of cellEdges(w, h, c, r)) seen.set(e, (seen.get(e) ?? 0) + 1)
    }
    for (const [e, n] of seen) if (n === 1) sol[e] = 1
    const cc2 = cycleCheck(sol, w, h)
    if (cc2.singleCycle && cc2.degreeOk) return sol
  }
  return ringLoop(w, h)
}

/** 边框环（保底回路）。 */
function ringLoop(w: number, h: number): EdgeState[] {
  const sol = new Array<EdgeState>(edgeCount(w, h)).fill(0)
  for (let c = 0; c < w; c += 1) {
    sol[hEdgeIndex(w, c, 0)] = 1
    sol[hEdgeIndex(w, c, h)] = 1
  }
  for (let r = 0; r < h; r += 1) {
    sol[vEdgeIndex(w, h, 0, r)] = 1
    sol[vEdgeIndex(w, h, w, r)] = 1
  }
  return sol
}

/** 候选珠：格与类型（白=直行且邻格有转弯；黑=转弯且某方向邻格直行）。 */
interface Candidate { cell: number; type: Pearl }

/** 按回路形状挑合法候选珠格。 */
function candidatesOf(sol: readonly number[], w: number, h: number): Candidate[] {
  const out: Candidate[] = []
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      const kind = classifyCell(sol, w, h, c, r)
      if (kind === 'straight-h') {
        if (neighborTurn(sol, w, h, c - 1, r) || neighborTurn(sol, w, h, c + 1, r)) out.push({ cell: r * w + c, type: 1 })
      } else if (kind === 'straight-v') {
        if (neighborTurn(sol, w, h, c, r - 1) || neighborTurn(sol, w, h, c, r + 1)) out.push({ cell: r * w + c, type: 1 })
      } else if (kind === 'turn') {
        const es = cellEdges(w, h, c, r)
        const dirs: number[][] = []
        if (sol[es[0]!] === 1) dirs.push([c, r - 1])
        if (sol[es[1]!] === 1) dirs.push([c + 1, r])
        if (sol[es[2]!] === 1) dirs.push([c, r + 1])
        if (sol[es[3]!] === 1) dirs.push([c - 1, r])
        if (dirs.every(d => neighborStraight(sol, w, h, d[0]!, d[1]!))) out.push({ cell: r * w + c, type: 2 })
      }
    }
  }
  return out
}

/** 由候选子集构造珠数组。 */
function pearlsFrom(cands: readonly Candidate[], w: number, h: number): Pearl[] {
  const pearls = new Array<Pearl>(w * h).fill(0)
  for (const cd of cands) pearls[cd.cell] = cd.type
  return pearls
}

/**
 * 由种子生成一局：随机抽候选珠（约 65% 起），求解器验证唯一解，
 * 不足则逐颗补珠；证得唯一后再预算内随机减珠到下限。全部失败时
 * 回落到边框环 + 全候选珠（标记多解，仍可玩且自洽）。
 */
export function puzzleFromSeed(seed: number, w: number, h: number): MasyuPuzzle {
  let lastLoop: EdgeState[] | null = null
  let lastCands: Candidate[] = []
  for (let att = 0; att < GEN_ATTEMPTS; att += 1) {
    const rng = mulberry32((seed + att * 0x9e3779b9) >>> 0)
    const sol = growLoop(rng, w, h)
    if (sol === null) continue
    const cands = candidatesOf(sol, w, h)
    if (cands.length > lastCands.length) { lastLoop = sol; lastCands = cands }
    if (cands.length < 4) continue
    const order = cands.slice()
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }
    const startCount = Math.max(4, Math.round(order.length * 0.65))
    let take = startCount
    let proven: Pearl[] | null = null
    while (take <= order.length) {
      const pearls = pearlsFrom(order.slice(0, take), w, h)
      const res = solveCount(w, h, pearls)
      if (res.solutions >= 2 || res.exhausted || res.solutions === 0) { take += 1; continue }
      proven = pearls
      break
    }
    if (proven === null) continue
    // 预算内随机减珠（更接近经典 Masyu 的稀疏观感）。
    const minKeep = Math.max(4, Math.round(order.length * 0.3))
    let kept = order.slice(0, take)
    let tries = 0
    while (kept.length > minKeep && tries < 10) {
      tries += 1
      const idx = Math.floor(rng() * kept.length)
      const trial = kept.slice()
      trial.splice(idx, 1)
      const res = solveCount(w, h, pearlsFrom(trial, w, h), THIN_BUDGET)
      if (res.solutions === 1 && !res.exhausted) kept = trial
    }
    return { w, h, pearls: pearlsFrom(kept, w, h), solution: sol, unique: true }
  }
  // 回落：用候选最多的已生长回路 + 全候选珠（标记多解）；从未生长出
  // 回路时才退到边框环（无珠，仅保底可玩）。
  const sol = lastLoop ?? ringLoop(w, h)
  return { w, h, pearls: pearlsFrom(lastCands, w, h), solution: sol, unique: false }
}
