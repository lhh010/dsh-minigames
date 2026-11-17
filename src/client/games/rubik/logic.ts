/**
 * 魔方 Rubik 纯逻辑：3×3×3 六面 54 贴纸状态、几何法层旋转置换、
 * seed 打乱、复原判定与「按历史逆序回拧」提示。全部为确定性函数——
 * 无 DOM、无计时器；随机只经注入的 mulberry32 seed 进入。
 *
 * 表示：Cube = number[54]，下标 = faceIndex*9 + r*3 + c，值为颜色
 * （复原态下面 f 的九格颜色均为 f）。面序 U,D,L,R,F,B 对应 0..5。
 *
 * 层旋转不用手写 18 张置换表，而是把每张贴纸映射为 (cubie 坐标,
 * 面法向量) 的三维几何量，绕轴旋转 90° 后反查目标下标——正确性由
 * 构造保证，测试再按环迁移语义逐面验证。
 */

/** 面名（也是转轴记号的字母）。 */
export type FaceName = 'U' | 'D' | 'L' | 'R' | 'F' | 'B'
/** 六面的固定顺序；颜色编号即面下标。 */
export const FACES: readonly FaceName[] = ['U', 'D', 'L', 'R', 'F', 'B']

/** 54 贴纸颜色数组（值 0..5）。 */
export type Cube = number[]

/** 一次层旋转：id 形如 'U0'（面字母 + 层号 0..2），turns 为 90° 步数（1 顺时针，-1 逆时针，模 4）。 */
export interface Move {
  id: string
  turns: number
}

/** 三维整向量（cubie 坐标或单位法向量，分量 ∈ {-1,0,1}）。 */
type Vec = readonly [number, number, number]

function dot(a: Vec, b: Vec): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
}

/** 各面的外法向量（右手系：x 向右、y 向上、z 朝观察者）。 */
const NORMALS: Record<FaceName, Vec> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
}

/** 贴纸格 (face, r, c) → cubie 坐标。r/c 为从该面外侧正视时的行列。 */
function gridPos(face: FaceName, r: number, c: number): Vec {
  switch (face) {
    case 'U': return [c - 1, 1, r - 1]
    case 'D': return [c - 1, -1, 1 - r]
    case 'F': return [c - 1, 1 - r, 1]
    case 'B': return [1 - c, 1 - r, -1]
    case 'L': return [-1, 1 - r, c - 1]
    case 'R': return [1, 1 - r, 1 - c]
  }
}

/** 反查表：(pos|normal) 键 → 贴纸下标。 */
const INDEX_BY_KEY = new Map<string, number>()
const POS: Vec[] = []
const NRM: Vec[] = []
for (let f = 0; f < 6; f += 1) {
  const face = FACES[f]!
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const i = f * 9 + r * 3 + c
      POS[i] = gridPos(face, r, c)
      NRM[i] = NORMALS[face]
      INDEX_BY_KEY.set(POS[i]!.join(',') + '|' + NRM[i]!.join(','), i)
    }
  }
}

function keyOf(pos: Vec, nrm: Vec): string {
  return pos.join(',') + '|' + nrm.join(',')
}

/** 绕单位轴 n 顺时针（自 n 外侧看）转 90° 后的向量。 */
function rotateCw(v: Vec, n: Vec): Vec {
  const along = dot(v, n)
  const base: Vec = [n[0]! * along, n[1]! * along, n[2]! * along]
  const q: Vec = [v[0]! - base[0]!, v[1]! - base[1]!, v[2]! - base[2]!]
  const d = cross(q, n)
  return [base[0]! + d[0]!, base[1]! + d[1]!, base[2]! + d[2]!]
}

/** 全部 18 个基础走法 id（6 面 × 3 层，层 0 为该面外层）。 */
export const MOVE_IDS: readonly string[] = FACES.flatMap((face) => [0, 1, 2].map((layer) => face + layer))

/** 解析走法 id → { face, layer }；非法 id 抛错（配置性输入，尽早失败）。 */
export function parseMoveId(id: string): { face: FaceName; layer: number } {
  const face = id.charAt(0) as FaceName
  const layer = Number(id.charAt(1))
  if (!(FACES as readonly string[]).includes(face) || !Number.isInteger(layer) || layer < 0 || layer > 2) {
    throw new Error('rubik: bad move id ' + id)
  }
  return { face, layer }
}

const PERM_CACHE = new Map<string, readonly number[]>()

/**
 * 走法的源→目标置换表：dest 下标处的值取 src 下标（next[dest] = old[src]）。
 * @param id - 走法 id（如 'U0'）。
 * @returns 长度 54 的数组，srcToDest 语义以 dest→src 存储。
 */
function permutation(id: string): readonly number[] {
  let cached = PERM_CACHE.get(id)
  if (cached !== undefined) return cached
  const { face, layer } = parseMoveId(id)
  const n = NORMALS[face]
  const destOfSrc = new Array<number>(54)
  for (let i = 0; i < 54; i += 1) {
    if (dot(POS[i]!, n) !== 1 - layer) {
      destOfSrc[i] = i // 不在该层上的贴纸原地不动
      continue
    }
    const dest = INDEX_BY_KEY.get(keyOf(rotateCw(POS[i]!, n), rotateCw(NRM[i]!, n)))
    if (dest === undefined) throw new Error('rubik: permutation miss for ' + id)
    destOfSrc[i] = dest
  }
  const destToSrc = new Array<number>(54)
  for (let src = 0; src < 54; src += 1) destToSrc[destOfSrc[src]!] = src
  cached = destToSrc
  PERM_CACHE.set(id, cached)
  return cached
}

/**
 * 对魔方执行层旋转（纯函数）。
 * @param cube - 当前状态。
 * @param id - 走法 id（如 'F2' 表示 F 面数第 3 层）。
 * @param turns - 顺时针 90° 步数，可为负（逆时针）；模 4 归一。
 * @returns 新 Cube，入参不变。
 */
export function applyMove(cube: Cube, id: string, turns = 1): Cube {
  const perm = permutation(id)
  const steps = ((turns % 4) + 4) % 4
  let current = cube.slice()
  for (let s = 0; s < steps; s += 1) {
    const next = new Array<number>(54)
    for (let d = 0; d < 54; d += 1) next[d] = current[perm[d]!]!
    current = next
  }
  return current
}

/** 该走法涉及的贴纸下标集合（转层内全部贴纸；渲染高亮用，也可测置换覆盖）。 */
export function layerIndices(id: string): readonly number[] {
  const { face, layer } = parseMoveId(id)
  const n = NORMALS[face]
  const out: number[] = []
  for (let i = 0; i < 54; i += 1) {
    if (dot(POS[i]!, n) === 1 - layer) out.push(i)
  }
  return out
}

/** 复原态：面 f 的九格颜色均为 f。 */
export function solvedCube(): Cube {
  return Array.from({ length: 54 }, (_, i) => Math.floor(i / 9))
}

/** 复原判定：每面九格纯色（不要求等于复原配色，纯色即过关）。 */
export function isSolved(cube: Cube): boolean {
  for (let f = 0; f < 6; f += 1) {
    const color = cube[f * 9]!
    for (let k = 1; k < 9; k += 1) {
      if (cube[f * 9 + k] !== color) return false
    }
  }
  return true
}

/** 行方向（r 增大）与列方向（c 增大）在各面上的三维单位向量。 */
const ROW_DIR: Record<FaceName, Vec> = {
  U: [0, 0, 1], D: [0, 0, -1], F: [0, -1, 0], B: [0, -1, 0], L: [0, -1, 0], R: [0, -1, 0],
}
const COL_DIR: Record<FaceName, Vec> = {
  U: [1, 0, 0], D: [1, 0, 0], F: [1, 0, 0], B: [-1, 0, 0], L: [0, 0, 1], R: [0, 0, -1],
}

/** 与单位轴同向（或反向）的面。 */
function axisFace(axis: Vec): { face: FaceName; k: number } {
  // 优先取与轴同向的面（法向 = axis），使走法 id 为规范表示（如 -y 轴记 D0 而非 U2）。
  for (const face of FACES) {
    if (dot(axis, NORMALS[face]) === 1) return { face, k: 1 }
  }
  for (const face of FACES) {
    if (dot(axis, NORMALS[face]) === -1) return { face, k: -1 }
  }
  throw new Error('rubik: axis without face')
}

/**
 * 面上箭头 → 等价层旋转：行箭头绕行的变化轴转层，列箭头绕列的变化轴转层；
 * 方向按「贴纸初始位移与箭头指向一致」用 ω×q 点乘判定。
 * @param face - 箭头所在面。
 * @param axis - 'row'（左右边缘箭头）或 'col'（上下边缘箭头）。
 * @param index - 行号或列号 0..2。
 * @param dir - 箭头指向：行 +1 向右 / -1 向左；列 +1 向下 / -1 向上。
 * @returns 等价走法（id + turns）。
 */
export function arrowMove(face: FaceName, axis: 'row' | 'col', index: number, dir: number): Move {
  const along = axis === 'row' ? ROW_DIR[face] : COL_DIR[face]
  const across = axis === 'row' ? COL_DIR[face] : ROW_DIR[face]
  const r = axis === 'row' ? index : 1
  const c = axis === 'row' ? 1 : index
  const p = gridPos(face, r, c)
  const v = dot(p, along)
  const { face: af, k } = axisFace(along)
  // 层号：贴纸在转轴面法向上的坐标 = k*v（k 为 along 与该法向的点积）。
  const layer = 1 - k * v
  // 代表贴纸相对转轴的垂直分量 q；选 ω 符号使初始位移与期望屏幕方向一致。
  const q: Vec = [p[0]! - along[0]! * v, p[1]! - along[1]! * v, p[2]! - along[2]! * v]
  const wanted: Vec = [across[0]! * dir, across[1]! * dir, across[2]! * dir]
  const sign = dot(cross(along, q), wanted) > 0 ? 1 : -1
  // ω = sign*along；顺时针约定 ω = -n_axis，即 sign = -k。
  const turns = sign === -k ? 1 : -1
  return { id: af + layer, turns }
}

/** 确定性 mulberry32 PRNG（沿 tests/pipes-logic.spec.ts 先例）。 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 第 level 关的打乱步数：6 起步，每关 +1.5 取整，封顶 12。 */
export function scrambleCount(level: number): number {
  return Math.min(12, 6 + Math.round((Math.max(1, level) - 1) * 1.5))
}

/**
 * seed 确定的打乱走法序列：从 18 个基础走法中逐步抽取，禁止同面连续
 * （避免相邻抵消），且结果不得已是复原态。
 * @param seed - 注入的随机种子。
 * @param level - 关卡（决定步数）。
 * @returns 打乱走法 id 列表（每步顺时针一次）。
 */
export function scrambleMoves(seed: number, level: number): string[] {
  const rng = mulberry32(seed)
  const n = scrambleCount(level)
  const moves: string[] = []
  let lastFace = ''
  for (;;) {
    moves.length = 0
    lastFace = ''
    for (let i = 0; i < n; i += 1) {
      let id = MOVE_IDS[Math.floor(rng() * MOVE_IDS.length)]!
      while (id.charAt(0) === lastFace) id = MOVE_IDS[Math.floor(rng() * MOVE_IDS.length)]!
      lastFace = id.charAt(0)
      moves.push(id)
    }
    let cube = solvedCube()
    for (const id of moves) cube = applyMove(cube, id)
    if (!isSolved(cube)) break
  }
  return moves
}

/** 一局的可测状态机快照（index.ts 持有并驱动）。 */
export interface RubikState {
  /** 54 贴纸颜色。 */
  cube: Cube
  /** 当前关卡 1..5。 */
  level: number
  /** 打乱序列（也是已知复原步数上界）。 */
  scramble: readonly string[]
  /** 全部已执行走法（打乱在前）；提示按其逆序回拧。 */
  history: readonly Move[]
  /** 玩家步数（含提示步）。 */
  moves: number
  /** 已用提示次数。 */
  hintsUsed: number
  /** 提示上限。 */
  readonly maxHints: number
  /** 是否已复原（过关后冻结）。 */
  solved: boolean
}

/**
 * 开新局：从复原态执行 seed 打乱。
 * @param seed - 注入的随机种子（确定性）。
 * @param level - 关卡号。
 */
export function newGame(seed: number, level: number): RubikState {
  const scramble = scrambleMoves(seed, level)
  let cube = solvedCube()
  for (const id of scramble) cube = applyMove(cube, id)
  return {
    cube,
    level,
    scramble,
    history: scramble.map((id) => ({ id, turns: 1 })),
    moves: 0,
    hintsUsed: 0,
    maxHints: 3,
    solved: false,
  }
}

/**
 * 玩家拧一层：记录历史、步数 +1，并更新复原判定（过关后拒绝输入）。
 * @param state - 当前状态。
 * @param id - 走法 id。
 * @param turns - 90° 步数（1 或 -1）。
 * @returns 新状态；入参不变。
 */
export function userMove(state: RubikState, id: string, turns: number): RubikState {
  if (state.solved) return state
  const cube = applyMove(state.cube, id, turns)
  const history = [...state.history, { id, turns }]
  return {
    ...state,
    cube,
    history,
    moves: state.moves + 1,
    solved: isSolved(cube),
  }
}

/**
 * 下一步提示 = 历史末条的逆走法（等价于对打乱逆序回拧：先撤销玩家自
 * 己的最后一步，再逐步撤销打乱），保证沿提示走必达复原。
 * @param state - 当前状态。
 * @returns 建议走法，或 null（历史已空 / 复原 / 提示用尽时交给调用方判定）。
 */
export function hintMove(state: RubikState): Move | null {
  const last = state.history[state.history.length - 1]
  if (last === undefined) return null
  return { id: last.id, turns: -last.turns }
}

/**
 * 执行提示：弹掉历史末条并施加其逆走法（步数 +1、提示计数 +1）。
 * 提示用尽或已复原时原样返回。
 * @param state - 当前状态。
 * @returns 新状态；入参不变。
 */
export function applyHint(state: RubikState): RubikState {
  if (state.solved || state.hintsUsed >= state.maxHints) return state
  const hint = hintMove(state)
  if (hint === null) return state
  const cube = applyMove(state.cube, hint.id, hint.turns)
  const history = state.history.slice(0, -1)
  return {
    ...state,
    cube,
    history,
    moves: state.moves + 1,
    hintsUsed: state.hintsUsed + 1,
    solved: isSolved(cube),
  }
}

/**
 * 序列化：54 位数字串（每格颜色 0..5）。
 * @param cube - 待序列化状态。
 */
export function serializeCube(cube: Cube): string {
  return cube.join('')
}

/**
 * 反序列化：仅接受 54 位、字符均在 0..5 的串。
 * @param text - 候选串。
 * @returns Cube，或 null（格式非法）。
 */
export function parseCube(text: string): Cube | null {
  if (!/^[0-5]{54}$/.test(text)) return null
  return [...text].map((ch) => Number(ch))
}
