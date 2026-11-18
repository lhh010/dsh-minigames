/**
 * 列车调度 Conductor 纯逻辑：侧视轨道网络上的道岔调度谜题。盘面由
 * seed 经 mulberry32 确定性生成——一条自左向右的主干加若干岔道：每个
 * 道岔 A 口沿主干直行、B 口经斜边通往上方或下方的彩色站台，主干尽头
 * 也是一座站台。列车从车库按固定间隔发车，恒速行驶不可停；玩家在列
 * 车抵达道岔前点击切换方向，把每列火车引向与自身颜色相同的站台。
 * 判定全部确定：到站颜色匹配=停靠得分；错色=失误 1 次（累计 3 次失
 * 败，列车延迟后重新发车）；两列火车进入同一节点（撞上已停靠站台、
 * 同一离散步内进同一节点、同轨道上距离过近）=相撞失败；超时失败。
 * 结构保证可解：岔道之间节点不相交、列车同速同源 FIFO，因此把各列
 * 车引向互不相同的站台即可全程无碰撞；列车颜色又无放回取自站台颜
 * 色，故任意 seed 下必存在可行调度（hasSolvableDispatch 恒真，
 * autoDispatch 给出一个贪心解并可用它通关全部 5 关）。时间单位毫秒，
 * 坐标为逻辑像素。
 */

/** 逻辑画布尺寸。 */
export const W = 800
/** 逻辑画布高度。 */
export const H = 440

/** 网格列距（主干边长，水平像素）。 */
export const P = 70
/** 网格左端 x。 */
export const X0 = 46
/** 行 y 坐标表下标即行号（主干在第 2 行）。 */
export const ROW_Y = [92, 168, 244, 320, 396]
/** 主干所在行号。 */
export const TRUNK_ROW = 2
/** 主干最后一列（尽头站台 E 的列号）。 */
export const END_COL = 10

/** 列车恒速（像素 / 秒），全程不可停。 */
export const SPEED = 85
/** 首班车发车时刻 ms。 */
export const FIRST_DEPART_MS = 900
/** 相邻列车发车间隔 ms（恒速下车间距 = 间隔 × 速度，远大于相撞阈值）。 */
export const DEPART_GAP_MS = 2600
/** 错色到站后的重新发车延迟 ms。 */
export const REDEPART_MS = 4200
/** 失误上限（达到即失败）。 */
export const MAX_MISTAKES = 3
/** 同轨道上两车距离小于该值视为相撞（像素）。 */
export const CRASH_EPS = 8
/** 道岔点击命中半径（像素）。 */
export const SWITCH_RADIUS = 26

/** 五关配置：岔道数 3→7、列车数 2→4，时限随盘面计算。 */
export const LEVELS = [
  { junctions: 3, trains: 2 },
  { junctions: 4, trains: 2 },
  { junctions: 5, trains: 3 },
  { junctions: 6, trains: 3 },
  { junctions: 7, trains: 4 },
] as const

/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 节点类型：车库（发车点）/ 主干普通点 / 道岔 / 岔道折点 / 站台。 */
export type CondNodeKind = 'source' | 'plain' | 'junction' | 'bend' | 'station'

/** 轨道网络节点。 */
export interface CondNode {
  id: number
  x: number
  y: number
  kind: CondNodeKind
  /** 网格列号（主干与岔道定位用；站台与折点也有）。 */
  col: number
  /** 网格行号（主干第 2 行，上方岔道站台第 0 行，下方第 4 行）。 */
  row: number
  /** 站台颜色（THEME.accents 下标）；仅站台节点有。 */
  color: number
  /** 出边（边 id）：道岔恰好 2 条且 [0]=A 主干直行、[1]=B 进岔道。 */
  out: number[]
}

/** 有向轨道边。 */
export interface CondEdge {
  id: number
  from: number
  to: number
  /** 边长（像素）＝两端点欧氏距离，列车按 pos 沿边推进。 */
  len: number
  /** 是否主干边（两端都在主干行上）。 */
  trunk: boolean
}

/** 列车状态。 */
export type CondTrainState = 'waiting' | 'running' | 'docked' | 'crashed'

/** 一列火车。 */
export interface CondTrain {
  id: number
  /** 颜色（THEME.accents 下标）。 */
  color: number
  /** 当前所在边 id（waiting 时为出库边）。 */
  edge: number
  /** 沿边位置（像素，0 ≤ pos ≤ len）。 */
  pos: number
  state: CondTrainState
  /** 发车时刻 ms。 */
  departAt: number
  /** 停靠的站台节点 id；未停靠为 -1。 */
  station: number
}

/** 单局状态：playing 进行中；cleared 本关完成待下一关；won/lost 终局。 */
export type CondStatus = 'playing' | 'cleared' | 'won' | 'lost'

/** 失败原因。 */
export type CondLostReason = '' | 'crash' | 'mistakes' | 'timeout'

/** 单步内产生、供渲染层消费的可视事件。 */
export type CondEvent =
  | { type: 'depart', train: number, color: number }
  | { type: 'switch', node: number, setting: number }
  | { type: 'dock', train: number, node: number, color: number, gain: number }
  | { type: 'wrong', train: number, node: number, color: number }
  | { type: 'crash', x: number, y: number }
  | { type: 'clear', level: number, bonus: number }
  | { type: 'fail', reason: CondLostReason }
  | { type: 'win', score: number }

/** 一局游戏的完整可测状态。 */
export interface ConductorState {
  level: number
  seed: number
  run: number
  /** 本关已流逝 ms。 */
  t: number
  /** 本关时限 ms。 */
  timeLimit: number
  status: CondStatus
  lostReason: CondLostReason
  /** 本关失误数。 */
  mistakes: number
  /** 跨关累计分数。 */
  score: number
  nodes: CondNode[]
  edges: CondEdge[]
  /** 按节点 id 索引的道岔方向（0=A 主干、1=B 岔道）；非道岔为 -1。 */
  switches: number[]
  junctionIds: number[]
  /** 车库节点 id。 */
  sourceId: number
  trains: CondTrain[]
  events: CondEvent[]
}

/**
 * 洗牌（Fisher–Yates，消耗传入 rng）。
 * @param rng - 随机源。
 * @param arr - 就地打乱的数组。
 * @returns 同一数组。
 */
function shuffle<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
  return arr
}

/**
 * 生成某一关的轨道网络与列车（确定性）：主干横贯第 2 行，道岔等距分
 * 布，岔道由两条斜边直达上方 / 下方站台（方向按 seed 交替），尽头
 * E 亦是站台；站台颜色从 8 色中无放回抽取，列车颜色再无放回取自站
 * 台颜色——由此保证每列车都有一座独占的同色目标站台。
 * @param seed - 外部种子。
 * @param level - 关号（1 起）。
 * @param run - 第几局（同 seed 不同局盘面不同）。
 * @returns 该关的初始状态（level/seed/run/score 之外的字段就绪）。
 */
export function createLevelState(seed: number, level: number, run = 1): ConductorState {
  const cfg = LEVELS[Math.min(LEVELS.length, Math.max(1, level)) - 1]!
  const rng = mulberry32(((seed >>> 0) + run * 1013 + level * 10007) >>> 0)
  const k = cfg.junctions
  const step = k > 1 ? Math.max(1, Math.floor((END_COL - 3) / (k - 1))) : 1
  const junctionCols: number[] = []
  for (let i = 0; i < k; i += 1) junctionCols.push(2 + i * step)

  const nodes: CondNode[] = []
  const edges: CondEdge[] = []
  const idAt = new Map<number, number>()
  const colRowKey = (col: number, row: number): number => col * 8 + row

  const addNode = (kind: CondNodeKind, col: number, row: number, color = -1): number => {
    const id = nodes.length
    nodes.push({ id, x: X0 + col * P, y: ROW_Y[row]!, kind, col, row, color, out: [] })
    idAt.set(colRowKey(col, row), id)
    return id
  }
  const addEdge = (from: number, to: number): number => {
    const a = nodes[from]!
    const b = nodes[to]!
    const id = edges.length
    edges.push({ id, from, to, len: Math.hypot(b.x - a.x, b.y - a.y), trunk: a.row === TRUNK_ROW && b.row === TRUNK_ROW })
    a.out.push(id)
    return id
  }

  // 主干：车库 → 普通点/道岔 → 尽头站台 E。
  let prev = addNode('source', 0, TRUNK_ROW)
  const junctionIds: number[] = []
  const junctionSet = new Set(junctionCols)
  for (let col = 1; col <= END_COL; col += 1) {
    const isStation = col === END_COL
    const id = addNode(isStation ? 'station' : junctionSet.has(col) ? 'junction' : 'plain', col, TRUNK_ROW)
    addEdge(prev, id)
    if (junctionSet.has(col)) junctionIds.push(id)
    prev = id
  }

  // 站台配色与岔道方向。
  const palette = shuffle(rng, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, k + 1)
  const endNode = nodes[prev]!
  endNode.color = palette[palette.length - 1]!
  const firstUp = rng() < 0.5
  junctionIds.forEach((jid, i) => {
    const j = nodes[jid]!
    const up = (i % 2 === 0) === firstUp
    const bend = addNode('bend', j.col + 1, up ? 1 : 3)
    const station = addNode('station', j.col + 2, up ? 0 : 4, palette[i]!)
    addEdge(jid, bend)
    addEdge(bend, station)
  })

  // 道岔初向。
  const switches = nodes.map(() => -1)
  for (const jid of junctionIds) switches[jid] = rng() < 0.5 ? 0 : 1

  // 列车：颜色无放回取自站台颜色，同色唯一。
  const trainColors = shuffle(rng, [...palette]).slice(0, cfg.trains)
  const firstEdge = nodes[0]!.out[0]!
  const trains: CondTrain[] = trainColors.map((color, i) => ({
    id: i,
    color,
    edge: firstEdge,
    pos: 0,
    state: 'waiting',
    departAt: FIRST_DEPART_MS + i * DEPART_GAP_MS,
    station: -1,
  }))

  // 时限 = 末班车发车间隔 + 最长路径行驶时间 + 缓冲（含一次错色重发）。
  let maxPath = END_COL * P
  for (const c of junctionCols) maxPath = Math.max(maxPath, c * P + 2 * Math.hypot(P, ROW_Y[1]! - ROW_Y[2]!))
  const timeLimit = Math.round(((cfg.trains - 1) * DEPART_GAP_MS + (maxPath / SPEED) * 1000 + 12000) / 1000) * 1000

  return {
    level, seed, run,
    t: 0, timeLimit,
    status: 'playing', lostReason: '',
    mistakes: 0, score: 0,
    nodes, edges, switches, junctionIds,
    sourceId: 0,
    trains,
    events: [],
  }
}

/**
 * 新开一局（从第 1 关起）。
 * @param seed - 外部种子。
 * @param run - 第几局。
 * @returns 初始状态。
 */
export function createConductor(seed: number, run = 1): ConductorState {
  return createLevelState(seed, 1, run)
}

/**
 * 本关完成后装载下一关（保留累计分）；第 5 关完成后置 won。
 * @param state - 当前状态（须处于 cleared）。
 */
export function startNextLevel(state: ConductorState): void {
  if (state.status !== 'cleared') return
  if (state.level >= LEVELS.length) {
    state.status = 'won'
    state.events.push({ type: 'win', score: state.score })
    return
  }
  const next = createLevelState(state.seed, state.level + 1, state.run)
  next.score = state.score
  Object.assign(state, next)
}

/**
 * 切换一个道岔的方向（A↔B）；仅进行中有效。
 * @param state - 当前状态。
 * @param nodeId - 道岔节点 id。
 * @returns 是否切换成功。
 */
export function toggleSwitch(state: ConductorState, nodeId: number): boolean {
  if (state.status !== 'playing') return false
  if (nodeId < 0 || nodeId >= state.switches.length || state.switches[nodeId] === -1) return false
  const setting = state.switches[nodeId] === 0 ? 1 : 0
  state.switches[nodeId] = setting
  state.events.push({ type: 'switch', node: nodeId, setting })
  return true
}

/**
 * 道岔点击命中测试。
 * @param state - 当前状态。
 * @param x - 逻辑 x 坐标。
 * @param y - 逻辑 y 坐标。
 * @returns 命中的道岔节点 id；未命中返回 -1。
 */
export function switchHitTest(state: ConductorState, x: number, y: number): number {
  for (const jid of state.junctionIds) {
    const n = state.nodes[jid]!
    if (Math.hypot(n.x - x, n.y - y) <= SWITCH_RADIUS) return jid
  }
  return -1
}

/**
 * 计算列车的像素位置与航向角。
 * @param state - 当前状态。
 * @param train - 目标列车。
 * @returns 中心坐标与航向角（弧度，沿行驶方向）。
 */
export function trainXY(state: ConductorState, train: CondTrain): { x: number, y: number, angle: number } {
  const e = state.edges[train.edge]!
  const a = state.nodes[e.from]!
  const b = state.nodes[e.to]!
  const u = e.len > 0 ? Math.min(1, Math.max(0, train.pos / e.len)) : 0
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  }
}

/**
 * 节点处列车下一条边：道岔按当前方向，其余取唯一出边。
 * @param state - 当前状态。
 * @param node - 到达的节点。
 * @returns 出边 id；无出边返回 -1。
 */
function nextEdgeFrom(state: ConductorState, node: CondNode): number {
  if (node.out.length === 0) return -1
  if (node.kind === 'junction') return node.out[state.switches[node.id] === 1 ? 1 : 0]!
  return node.out[0]!
}

/**
 * 撞车处理：置失败并给出事件。
 * @param state - 当前状态。
 * @param x - 相撞点 x。
 * @param y - 相撞点 y。
 */
function crashAt(state: ConductorState, x: number, y: number): void {
  state.status = 'lost'
  state.lostReason = 'crash'
  state.events.push({ type: 'crash', x, y })
  state.events.push({ type: 'fail', reason: 'crash' })
}

/**
 * 到站结算：occupied（撞上已停靠列车）→ 相撞；同色 → 停靠得分；错色
 * → 失误 +1，未达上限则延迟重新发车。
 * @param state - 当前状态。
 * @param train - 到站列车。
 * @param node - 站台节点。
 */
function resolveStation(state: ConductorState, train: CondTrain, node: CondNode): void {
  const occupant = state.trains.find((o) => o.state === 'docked' && o.station === node.id)
  if (occupant !== undefined) {
    crashAt(state, node.x, node.y)
    return
  }
  if (node.color === train.color) {
    train.state = 'docked'
    train.station = node.id
    const gain = 100 + 25 * (state.level - 1)
    state.score += gain
    state.events.push({ type: 'dock', train: train.id, node: node.id, color: train.color, gain })
    return
  }
  state.mistakes += 1
  state.events.push({ type: 'wrong', train: train.id, node: node.id, color: train.color })
  if (state.mistakes >= MAX_MISTAKES) {
    state.status = 'lost'
    state.lostReason = 'mistakes'
    state.events.push({ type: 'fail', reason: 'mistakes' })
    return
  }
  train.state = 'waiting'
  train.departAt = state.t + REDEPART_MS
  train.edge = state.nodes[state.sourceId]!.out[0]!
  train.pos = 0
}

/**
 * 推进一帧：发车 → 恒速前移并沿途到达判定（同一步内两车进同一节点 =
 * 相撞）→ 同轨道追近判定 → 过关 / 超时判定。非 playing 状态直接返回。
 * @param state - 当前状态。
 * @param dtMs - 本帧毫秒。
 */
export function stepConductor(state: ConductorState, dtMs: number): void {
  if (state.status !== 'playing') return
  state.events.length = 0
  state.t += dtMs

  for (const tr of state.trains) {
    if (tr.state === 'waiting' && tr.departAt <= state.t) {
      tr.state = 'running'
      tr.edge = state.nodes[state.sourceId]!.out[0]!
      tr.pos = 0
      state.events.push({ type: 'depart', train: tr.id, color: tr.color })
    }
  }

  const arrivals: { node: number, train: number }[] = []
  for (const tr of state.trains) {
    if (state.status !== 'playing') return
    if (tr.state !== 'running') continue
    tr.pos += (SPEED * dtMs) / 1000
    let guard = 0
    while (tr.state === 'running' && guard < 8) {
      guard += 1
      const e = state.edges[tr.edge]!
      if (tr.pos <= e.len) break
      const over = tr.pos - e.len
      const node = state.nodes[e.to]!
      if (node.kind === 'station') {
        resolveStation(state, tr, node)
        break
      }
      arrivals.push({ node: node.id, train: tr.id })
      const next = nextEdgeFrom(state, node)
      if (next === -1) break
      tr.edge = next
      tr.pos = over
    }
  }

  // 同一步内两列火车进入同一节点 = 相撞。
  for (let i = 0; i < arrivals.length && state.status === 'playing'; i += 1) {
    for (let j = i + 1; j < arrivals.length; j += 1) {
      if (arrivals[i]!.node === arrivals[j]!.node) {
        crashAt(state, state.nodes[arrivals[i]!.node]!.x, state.nodes[arrivals[i]!.node]!.y)
        return
      }
    }
  }
  if (state.status !== 'playing') return

  // 同轨道上距离过近 = 相撞（恒速同源正常调度下不触发，防手工构造）。
  const byEdge = new Map<number, CondTrain[]>()
  for (const tr of state.trains) {
    if (tr.state !== 'running') continue
    const list = byEdge.get(tr.edge)
    if (list === undefined) byEdge.set(tr.edge, [tr])
    else list.push(tr)
  }
  for (const list of byEdge.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => a.pos - b.pos)
    for (let i = 1; i < list.length; i += 1) {
      if (list[i]!.pos - list[i - 1]!.pos < CRASH_EPS) {
        const p = trainXY(state, list[i]!)
        crashAt(state, p.x, p.y)
        return
      }
    }
  }

  // 过关：全部列车正确停靠。
  if (state.trains.every((tr) => tr.state === 'docked')) {
    const bonus = 150 + 50 * state.level
    state.score += bonus
    state.status = 'cleared'
    state.events.push({ type: 'clear', level: state.level, bonus })
    return
  }
  // 超时。
  if (state.t >= state.timeLimit) {
    state.status = 'lost'
    state.lostReason = 'timeout'
    state.events.push({ type: 'fail', reason: 'timeout' })
  }
}

/**
 * 列车到目标列号之间沿主干的剩余距离（用于 eta 估计）。
 * @param state - 当前状态。
 * @param train - 目标列车。
 * @param targetCol - 主干目标列号。
 * @returns 剩余像素距离；列车已离开主干（到不了目标）返回 null。
 */
function trunkDist(state: ConductorState, train: CondTrain, targetCol: number): number | null {
  let d = 0
  let node: CondNode
  if (train.state === 'waiting') {
    node = state.nodes[state.sourceId]!
  } else if (train.state === 'running') {
    const e = state.edges[train.edge]!
    if (!e.trunk) return null
    d = e.len - train.pos
    node = state.nodes[e.to]!
  } else {
    return null
  }
  let guard = 0
  while (node.col < targetCol && guard < 32) {
    guard += 1
    if (node.kind === 'station') return null
    let next: CondEdge | undefined
    for (const eid of node.out) {
      const e = state.edges[eid]!
      if (e.trunk) { next = e; break }
    }
    if (next === undefined) return null
    d += next.len
    node = state.nodes[next.to]!
  }
  return node.col === targetCol ? d : null
}

/**
 * 某颜色对应的（唯一）站台。
 * @param state - 当前状态。
 * @param color - 颜色下标。
 * @returns 站台节点；盘面无此色返回 null。
 */
function stationOfColor(state: ConductorState, color: number): CondNode | null {
  for (const n of state.nodes) {
    if (n.kind === 'station' && n.color === color) return n
  }
  return null
}

/**
 * 站台的目标列号：尽头站台 E 取主干末列，岔道站台取其道岔列号。
 * @param node - 站台节点。
 * @returns 目标列号。
 */
function stationTargetCol(node: CondNode): number {
  return node.row === TRUNK_ROW ? END_COL : node.col - 2
}

/**
 * 贪心自动调度：为每列车锁定同色目标站台，再对每个道岔选出「下一个
 * 经过该道岔的列车」并按其目标设向（目标即该岔道→B，否则→A）。由
 * 于主干上列车 FIFO、岔道互不相交，该策略可无碰撞完成整关。
 * @param state - 当前状态。
 */
export function autoDispatch(state: ConductorState): void {
  if (state.status !== 'playing') return
  const targets = new Map<number, number>()
  for (const tr of state.trains) {
    if (tr.state !== 'waiting' && tr.state !== 'running') continue
    const st = stationOfColor(state, tr.color)
    if (st === null) continue
    targets.set(tr.id, stationTargetCol(st))
  }
  for (const jid of state.junctionIds) {
    const j = state.nodes[jid]!
    let best: CondTrain | null = null
    let bestEta = Infinity
    for (const tr of state.trains) {
      const targetCol = targets.get(tr.id)
      if (targetCol === undefined || targetCol < j.col) continue
      const d = trunkDist(state, tr, j.col)
      if (d === null) continue
      const eta = (d / SPEED) * 1000 + (tr.state === 'waiting' ? Math.max(0, tr.departAt - state.t) : 0)
      if (eta < bestEta) {
        bestEta = eta
        best = tr
      }
    }
    if (best !== null) state.switches[jid] = targets.get(best.id) === j.col ? 1 : 0
  }
}

/**
 * 当前局面是否仍可解：未完列车与空闲同色可达站台之间存在完美匹配。
 * @param state - 当前状态。
 * @returns 可解返回 true。
 */
export function hasSolvableDispatch(state: ConductorState): boolean {
  if (state.status !== 'playing') return false
  const free = state.nodes.filter((n) => n.kind === 'station' && !state.trains.some((tr) => tr.state === 'docked' && tr.station === n.id))
  const pending = state.trains.filter((tr) => tr.state === 'waiting' || tr.state === 'running')
  // 可达站台：等车=全部；主干上=目标列不小于当前前进列号的站台；岔道上=该岔道站台。
  const reach = (tr: CondTrain): CondNode[] => {
    if (tr.state === 'waiting') return free
    const e = state.edges[tr.edge]!
    if (e.trunk) {
      return free.filter((st) => stationTargetCol(st) >= state.nodes[e.to]!.col)
    }
    let node = state.nodes[e.to]!
    let guard = 0
    while (node.kind !== 'station' && guard < 8) {
      guard += 1
      const out = node.out[0]
      if (out === undefined) return []
      node = state.nodes[state.edges[out]!.to]!
    }
    return node.kind === 'station' ? free.filter((st) => st.id === node.id) : []
  }
  const options = pending.map((tr) => free.filter((st) => st.color === tr.color && reach(tr).includes(st)))
  // 小规模回溯匹配（列车 ≤4、站台 ≤8）。
  const used = new Set<number>()
  const matchFrom = (i: number): boolean => {
    if (i >= options.length) return true
    for (const st of options[i]!) {
      if (used.has(st.id)) continue
      used.add(st.id)
      if (matchFrom(i + 1)) return true
      used.delete(st.id)
    }
    return false
  }
  return matchFrom(0)
}
