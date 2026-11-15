/**
 * 镜面光线（LightPath）纯逻辑：SIZE×SIZE 网格盘，一个激光源（位置 +
 * 固定方向）、若干可旋转镜（'/' 与 '\\' 两档，点击翻转）、分光镜（一进
 * 两出：直通 + '/' 反射）、墙与目标水晶。激光从源出发沿直线传播，遇镜
 * 90° 折射、遇分光镜一分为二、遇墙或出界终止；全部水晶被光路经过即
 * 过关。光路求值是纯静态 BFS（按「格子 + 方向」做环检测，步数上限
 * MAX_BEAM_STEPS），可脱离 DOM 直接模拟验证。关卡由注入 seed（mulberry32）
 * 确定性生成：先随机「解状态」镜面朝向并求值，从被照亮的空格中挑水晶，
 * 保证该朝向组合必为解；再打乱镜面朝向作为开局（确保开局未获胜）。
 */

/** 逻辑画布宽度 px。 */
export const W = 440
/** 逻辑画布高度 px。 */
export const H = 500
/** 盘面边长格数（9×9）。 */
export const SIZE = 9
/** 单格边长 px。 */
export const CELL = 40
/** 盘面左上角 x px。 */
export const BOARD_X = 40
/** 盘面左上角 y px。 */
export const BOARD_Y = 64
/** 光路求值总步数上限（环检测兜底）。 */
export const MAX_BEAM_STEPS = 400

/** 激光源的固定发射方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right'
/** 镜面两档朝向。 */
/** 镜面朝向：'/' 与 '\\'（一键翻转，挑战在于要翻的面数多）。 */
export type MirrorKind = '/' | '\\'

/** 格坐标。 */
export interface Cell {
  /** 行号（0 起，向下）。 */
  row: number
  /** 列号（0 起，向右）。 */
  col: number
}

/** 一面可旋转镜。 */
export interface Mirror extends Cell {
  /** 当前朝向（点击在两档间翻转）。 */
  kind: MirrorKind
}

/** 激光源（位置 + 固定方向）。 */
export interface Source extends Cell {
  dir: Dir
}

/** 一局状态（翻转产生新状态，原状态不可变）。 */
export interface LightPathState {
  /** 基础 seed（与 level 联合决定布局）。 */
  seed: number
  /** 关卡号（从 1 起）。 */
  level: number
  /** SIZE×SIZE 墙矩阵：true 为墙。 */
  walls: boolean[][]
  /** 激光源。 */
  source: Source
  /** 可旋转镜列表。 */
  mirrors: Mirror[]
  /** 分光镜列表。 */
  splitters: Cell[]
  /** 目标水晶列表。 */
  crystals: Cell[]
  /** 已翻转次数。 */
  moves: number
  /** 当前潜在得分（胜利时定格为最终得分）。 */
  score: number
  /** 是否已过关（当前朝向下全部水晶被照亮）。 */
  won: boolean
}

/** 一段直线光束（含两端格子，供渲染）。 */
export interface BeamSegment {
  r0: number, c0: number, r1: number, c1: number
}

/** 一次静态光路求值的结果。 */
export interface LightResult {
  /** 被光路经过的格子 key（row*SIZE+col）集合。 */
  lit: Set<number>
  /** 被点亮的水晶数量。 */
  litCrystals: number
  /** 直线光束段列表（渲染用）。 */
  segments: BeamSegment[]
}

/** 四方向向量（与 visited 键的方向序号一致）。 */
const DIR_VEC: Record<Dir, readonly [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
}

/** 方向到序号的映射（visited 环检测键用）。 */
const DIR_INDEX: Record<Dir, number> = { up: 0, down: 1, left: 2, right: 3 }
const INDEX_DIR: readonly Dir[] = ['up', 'down', 'left', 'right']

/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
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

/**
 * 镜面方向变换：'/' 与 '\\' 各把入射 (dr,dc) 映射为 90° 出射方向。
 * @param kind - 镜面朝向。
 * @param dr - 入射行方向分量。
 * @param dc - 入射列方向分量。
 * @returns 出射 [dr,dc]。
 */
export function reflect(kind: MirrorKind, dr: number, dc: number): [number, number] {
  // + 0 归一化：-dr 在 dr=0 时产生 -0，与 toEqual 的 +0 不等（浅比较区分正负零）。
  if (kind === '/') return [-dc + 0, -dr + 0]
  return [dc + 0, dr + 0]
}

/**
 * 分光镜的两路出射：直通（原方向）+ '/' 式反射（一进两出）。
 * @param dr - 入射行方向分量。
 * @param dc - 入射列方向分量。
 * @returns 两条出射 [dr,dc]。
 */
export function splitOutputs(dr: number, dc: number): Array<[number, number]> {
  return [[dr + 0, dc + 0], [-dc + 0, -dr + 0]]
}

/** 格子 key：row*SIZE+col。 */
const key = (row: number, col: number): number => row * SIZE + col

/**
 * 静态光路求值：从源出发 BFS 追踪所有光束（镜折射、分光镜分裂、墙与
 * 出界终止、水晶可被穿过并点亮），按「格子 + 方向」做环检测。
 * @param state - 当前局面。
 * @returns 光路结果（点亮集合 / 水晶数 / 光束段）。
 */
export function evaluate(state: LightPathState): LightResult {
  const mirrorAt = new Map<number, MirrorKind>()
  for (const m of state.mirrors) mirrorAt.set(key(m.row, m.col), m.kind)
  const splitterAt = new Set<number>()
  for (const s of state.splitters) splitterAt.add(key(s.row, s.col))
  const crystalAt = new Set<number>()
  for (const c of state.crystals) crystalAt.add(key(c.row, c.col))

  const lit = new Set<number>()
  const segments: BeamSegment[] = []
  const visited = new Set<number>()
  const sourceKey = key(state.source.row, state.source.col)
  const [sdr, sdc] = DIR_VEC[state.source.dir]
  const queue: Array<[number, number, number, number]> = [[state.source.row, state.source.col, sdr, sdc]]
  let steps = 0

  const pushSeg = (r0: number, c0: number, r1: number, c1: number): void => {
    if (r0 !== r1 || c0 !== c1) segments.push({ r0, c0, r1, c1 })
  }

  while (queue.length > 0 && steps < MAX_BEAM_STEPS) {
    const init = queue.shift()!
    let r = init[0], c = init[1], dr = init[2], dc = init[3]
    let segR = r, segC = c
    for (;;) {
      if (steps >= MAX_BEAM_STEPS) { pushSeg(segR, segC, r, c); break }
      steps += 1
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || state.walls[nr]![nc]) {
        pushSeg(segR, segC, r, c)
        break
      }
      const dirIdx = dr === -1 ? 0 : dr === 1 ? 1 : dc === -1 ? 2 : 3
      const stateKey = (nr * SIZE + nc) * 4 + dirIdx
      if (visited.has(stateKey)) { pushSeg(segR, segC, r, c); break }
      visited.add(stateKey)
      r = nr
      c = nc
      lit.add(key(r, c))
      if (key(r, c) === sourceKey) { pushSeg(segR, segC, r, c); break }
      const mk = mirrorAt.get(key(r, c))
      if (mk !== undefined) {
        pushSeg(segR, segC, r, c)
        const out = reflect(mk, dr, dc)
        dr = out[0]
        dc = out[1]
        segR = r
        segC = c
        continue
      }
      if (splitterAt.has(key(r, c))) {
        pushSeg(segR, segC, r, c)
        const outs = splitOutputs(dr, dc)
        queue.push([r, c, outs[1]![0], outs[1]![1]])
        dr = outs[0]![0]
        dc = outs[0]![1]
        segR = r
        segC = c
        continue
      }
      // 空格或水晶：光束直线穿过（水晶仅被点亮，不改变方向）。
    }
  }

  let litCrystals = 0
  for (const c of state.crystals) {
    if (lit.has(key(c.row, c.col))) litCrystals += 1
  }
  return { lit, litCrystals, segments }
}

/**
 * 计分：基础分随关卡递增，每次翻转扣 15，下限 100。
 * @param level - 关卡号。
 * @param moves - 已翻转次数。
 * @returns 得分。
 */
export function computeScore(level: number, moves: number): number {
  return Math.max(100, 500 + (level - 1) * 60 - moves * 15)
}

/**
 * 深拷贝一局状态。
 * @param state - 原状态。
 * @returns 结构相等的新状态。
 */
export function cloneState(state: LightPathState): LightPathState {
  return {
    seed: state.seed,
    level: state.level,
    walls: state.walls.map((row) => row.slice()),
    source: { ...state.source },
    mirrors: state.mirrors.map((m) => ({ ...m })),
    splitters: state.splitters.map((s) => ({ ...s })),
    crystals: state.crystals.map((c) => ({ ...c })),
    moves: state.moves,
    score: state.score,
    won: state.won,
  }
}

/**
 * 翻转指定格子上的镜（纯函数：不改原状态）。
 * @param state - 当前状态。
 * @param row - 行号。
 * @param col - 列号。
 * @returns 新状态（moves+1、重求值胜负与得分）；该格无镜或已过关返回
 * null（无变化不计步）。
 */
export function applyFlip(state: LightPathState, row: number, col: number): LightPathState | null {
  if (state.won) return null
  const idx = state.mirrors.findIndex((m) => m.row === row && m.col === col)
  if (idx < 0) return null
  const next = cloneState(state)
  const mirror = next.mirrors[idx]!
  mirror.kind = mirror.kind === '/' ? '\\' : '/'
  next.moves = state.moves + 1
  const result = evaluate(next)
  next.won = result.litCrystals === next.crystals.length
  next.score = computeScore(next.level, next.moves)
  return next
}

/**
 * 提示：贪心翻转一面镜——枚举每面镜翻转后的点亮水晶数，取严格变好的
 * 最低索引；没有任何翻转能改善时返回 null。
 * @param state - 当前状态。
 * @returns 翻转后的新状态；无改善返回 null。
 */
export function hintFlip(state: LightPathState): LightPathState | null {
  if (state.won) return null
  const current = evaluate(state).litCrystals
  let best: LightPathState | null = null
  let bestLit = current
  for (const m of state.mirrors) {
    const next = applyFlip(state, m.row, m.col)
    if (next === null) continue
    const lit = evaluate(next).litCrystals
    if (lit > bestLit) {
      bestLit = lit
      best = next
    }
  }
  return best
}

/** 各关参数：镜数 5→10（组合空间 2^n 从 32 到 1024）、水晶 3→5、
 * 第 3 关起引入分光镜、第 5 关两面；墙 6→16（遮挡直路，逼迫多段折射）。 */
export function levelSpec(level: number): { mirrors: number, crystals: number, splitters: number, walls: number } {
  return {
    mirrors: Math.min(Math.round(6 + (level - 1) * 1.5), 12),
    crystals: Math.min(2 + Math.ceil(level / 2), 5),
    splitters: level >= 5 ? 2 : level >= 3 ? 1 : 0,
    walls: Math.min(3 + level + (level >= 4 ? 2 : 0), 10),
  }
}

/**
 * 生成第 level 关：确定性随机撒墙、放激光源 / 镜 / 分光镜，随机「解
 * 状态」朝向并求值，从被照亮的空格挑水晶（保证解存在），再打乱镜面
 * 朝向作为开局（确保开局未获胜）。约束不满足则换尝试重掷。
 * @param seed - 基础种子（与 level、尝试次数联合散列）。
 * @param level - 关卡号（从 1 起）。
 * @returns 初始状态（won=false、moves=0）。
 */
export function generateLevel(seed: number, level: number): LightPathState {
  const spec = levelSpec(level)
  for (let attempt = 0; attempt < 4000; attempt += 1) {
    const rand = mulberry32((seed + level * 7919 + attempt * 104729) >>> 0)
    const walls: boolean[][] = []
    for (let r = 0; r < SIZE; r += 1) walls.push(new Array<boolean>(SIZE).fill(false))
    const taken = new Set<number>()
    for (let i = 0; i < spec.walls; i += 1) {
      const r = Math.floor(rand() * SIZE)
      const c = Math.floor(rand() * SIZE)
      if (taken.has(key(r, c))) { i -= 1; continue }
      taken.add(key(r, c))
      walls[r]![c] = true
    }
    const freeCells: Cell[] = []
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (!walls[r]![c]) freeCells.push({ row: r, col: c })
      }
    }
    if (freeCells.length < 1 + spec.mirrors + spec.splitters + spec.crystals) continue
    const pick = (): Cell => {
      for (;;) {
        const cell = freeCells[Math.floor(rand() * freeCells.length)]!
        if (!taken.has(key(cell.row, cell.col))) {
          taken.add(key(cell.row, cell.col))
          return cell
        }
      }
    }
    const source: Source = { ...pick(), dir: INDEX_DIR[Math.floor(rand() * 4)]! }
    const mirrors: Mirror[] = []
    for (let i = 0; i < spec.mirrors; i += 1) {
      mirrors.push({ ...pick(), kind: rand() < 0.5 ? '/' : '\\' })
    }
    const splitters: Cell[] = []
    for (let i = 0; i < spec.splitters; i += 1) splitters.push({ ...pick() })
    const solution: MirrorKind[] = mirrors.map((m) => m.kind)

    // 从「解状态」的照亮空格中挑水晶：该朝向组合必为解。
    const solvedEval = evaluate({
      seed, level, walls, source, mirrors: mirrors.map((m, i) => ({ ...m, kind: solution[i]! })),
      splitters, crystals: [], moves: 0, score: 0, won: false,
    })
    const occupied = new Set<number>([key(source.row, source.col)])
    for (const m of mirrors) occupied.add(key(m.row, m.col))
    for (const s of splitters) occupied.add(key(s.row, s.col))
    let litEmpty: Cell[] = []
    for (const k of solvedEval.lit) {
      if (occupied.has(k)) continue
      const cell = { row: Math.floor(k / SIZE), col: k % SIZE }
      // 水晶避开光源的十字直线（否则开局直射即亮、点一面镜就赢）。
      if (cell.row === source.row || cell.col === source.col) continue
      litEmpty.push(cell)
    }
    // 稀有度过滤：随机采样 40 种镜面配置统计每格被照亮频率，只留
    // 「少数配置才能照亮」的格作水晶候选——普通格几乎任何朝向都亮，
    // 开局直接全亮/一两翻可胜的根源。
    if (litEmpty.length > spec.crystals) {
      const freq = new Map<number, number>()
      const SAMPLES = 40
      const savedKinds = mirrors.map((m) => m.kind)
      for (let s2 = 0; s2 < SAMPLES; s2 += 1) {
        for (const m of mirrors) m.kind = rand() < 0.5 ? '/' : '\\'
        const sample = evaluate({
          seed, level, walls, source, mirrors, splitters, crystals: [], moves: 0,
          score: 0, won: false,
        })
        for (const k of sample.lit) freq.set(k, (freq.get(k) ?? 0) + 1)
      }
      for (let i = 0; i < mirrors.length; i += 1) mirrors[i]!.kind = savedKinds[i]!
      const rare = litEmpty.filter((c) => (freq.get(key(c.row, c.col)) ?? 0) <= SAMPLES * 0.25)
      if (rare.length >= spec.crystals) litEmpty = rare
    }
    if (litEmpty.length < spec.crystals) {
      // 离线照亮格不足：回退补光源十字线上的照亮格（保可解优先）。
      for (const k of solvedEval.lit) {
        if (occupied.has(k)) continue
        const cell = { row: Math.floor(k / SIZE), col: k % SIZE }
        if (cell.row === source.row || cell.col === source.col) litEmpty.push(cell)
      }
      if (litEmpty.length < spec.crystals) continue
    }
    // 洗牌取前 N 个照亮空格作水晶。
    for (let i = litEmpty.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = litEmpty[i]!
      litEmpty[i] = litEmpty[j]!
      litEmpty[j] = tmp
    }
    const crystals = litEmpty.slice(0, spec.crystals).map((c) => ({ ...c }))

    // 开局=解状态定向翻转 ≥4 面不同镜（而非均匀随机——后者常直接就是
    // 获胜态或一步可胜，730/2000 的开局即刻全亮）。
    for (let i = 0; i < mirrors.length; i += 1) mirrors[i]!.kind = solution[i]!
    const flipCount = Math.min(mirrors.length, Math.max(4, Math.ceil(mirrors.length / 2)))
    const flipIdx = new Set<number>()
    while (flipIdx.size < flipCount) flipIdx.add(Math.floor(rand() * mirrors.length))
    for (const i of flipIdx) mirrors[i]!.kind = mirrors[i]!.kind === '/' ? '\\' : '/'
    const start: LightPathState = {
      seed, level, walls, source, mirrors, splitters, crystals, moves: 0,
      score: computeScore(level, 0), won: false,
    }
    // 难度闸门：拒绝任何 0/1/2 翻即可全亮的开局——保证通关至少点 3 次
    // 镜（0 翻 n + 1 翻 n + 2 翻 n²/2 组合枚举，代价可忽略）。
    const winOf = (s: LightPathState): boolean => evaluate(s).litCrystals === crystals.length
    if (winOf(start))continue
    let easy = false
    oneFlip: for (let i = 0; i < mirrors.length && !easy; i += 1) {
      for (let j = i; j < mirrors.length; j += 1) {
        const probe = cloneState(start)
        const mi = mirrors[i]!
        const mj = mirrors[j]!
        probe.mirrors[i]!.kind = mi.kind === '/' ? '\\' : '/'
        if (j !== i) probe.mirrors[j]!.kind = mj.kind === '/' ? '\\' : '/'
        if (winOf(probe)) { easy = true; break oneFlip }
      }
    }
    if (easy)continue
    return start
  }
  throw new Error('lightpath: generateLevel failed to produce a solvable level')
}
