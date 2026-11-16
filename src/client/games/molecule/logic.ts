/**
 * 分子构建 (Molecule) 纯逻辑：Sokobond 式推原子。网格上有墙、若干原子
 * （H/C/O/N，各带化合价 H=1 O=2 N=3 C=4）与一个主原子（玩家）。主原子
 * 四向移动；撞上原子或原子团时按推箱子规则把该团整体推一格，推不动则
 * 整步失败。已成键的原子团刚性整体移动。两个原子正交相邻且双方都有
 * 空价时自动成键，键级 = min(2, 空价A, 空价B)（双键消耗 2 价）。全部
 * 原子连成一个团且所有价恰好饱和、元素计数符合目标式即过关。
 *
 * 全部为确定性纯函数（无 DOM、无全局随机）；随机性只经注入 seed
 * （mulberry32）暴露给渲染层的绘制顺序。单元测试直接驱动本模块，
 * 包括一个带节点预算的 BFS 求解器用于验证关卡可解性与最短步数。
 */

/** 支持的元素。 */
export type Element = 'H' | 'C' | 'O' | 'N'

/** 四个移动方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right'

/** 元素化合价（可成键总数，双键消耗 2）。 */
export const VALENCE: Record<Element, number> = { H: 1, O: 2, N: 3, C: 4 }

/** 单对原子之间的最大键级（双键简化，不支持三键）。 */
export const MAX_BOND_ORDER = 2

/** 每生成一根键的得分。 */
export const BOND_SCORE = 100
/** 过关额外得分。 */
export const CLEAR_SCORE = 500

/** 方向名 -> (dr, dc)。 */
const DIRS: Record<Dir, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
}

/** 网格坐标。 */
export interface Position { r: number; c: number }

/** 一个原子：元素、位置与到其他原子的键（原子 id -> 键级）。 */
export interface Atom {
  id: number
  el: Element
  r: number
  c: number
  bonds: Record<number, number>
}

/** 一关的手工数据：名称、分子式与初始盘面。 */
export interface MoleculeLevelDef {
  /** 目标分子中文名（如 水）。 */
  name: string
  /** 规范分子式（如 H2O），必须与盘面原子计数一致。 */
  formula: string
  /** 展示分子式（含下标字符，如 H₂O）。 */
  display: string
  /** 提示结构串（如 H–O–H）。 */
  hint: string
  /** 主原子（玩家）的元素。 */
  mainEl: Element
  /**
   * 盘面行。字符：'#' 墙、空格/'.' 空地、'@' 主原子、H/C/O/N 原子。
   * 短行右侧补空格。初始盘面禁止任意两原子正交相邻（否则成键歧义）。
   */
  grid: string[]
}

/**
 * 五个手工关卡，递进：H₂O → CO₂ → NH₃ → CH₄ → C₂H₄。
 */
export const LEVELS: MoleculeLevelDef[] = [
  {
    name: '水',
    formula: 'H2O',
    display: 'H₂O',
    hint: 'H–O–H',
    mainEl: 'O',
    grid: [
      '#######',
      '#     #',
      '# @ H #',
      '#     #',
      '# H   #',
      '#######',
    ],
  },
  {
    name: '二氧化碳',
    formula: 'CO2',
    display: 'CO₂',
    hint: 'O=C=O',
    mainEl: 'C',
    grid: [
      '#######',
      '#     #',
      '#  @  #',
      '#     #',
      '# O   #',
      '#   O #',
      '#######',
    ],
  },
  {
    name: '氨',
    formula: 'H3N',
    display: 'NH₃',
    hint: 'H–N–H 及第三个 H',
    mainEl: 'N',
    grid: [
      '########',
      '#      #',
      '#  H   #',
      '#    H #',
      '#   @  #',
      '# H    #',
      '########',
    ],
  },
  {
    name: '甲烷',
    formula: 'CH4',
    display: 'CH₄',
    hint: 'C 与四个 H 相连',
    mainEl: 'C',
    grid: [
      '#########',
      '#       #',
      '#  H H  #',
      '#   @   #',
      '#  H H  #',
      '#       #',
      '#########',
    ],
  },
  {
    name: '乙烯',
    formula: 'C2H4',
    display: 'C₂H₄',
    hint: 'H₂C=CH₂（C=C 双键）',
    mainEl: 'C',
    grid: [
      '#########',
      '#       #',
      '#  H    #',
      '#     H #',
      '#   @   #',
      '#       #',
      '#  C    #',
      '#     H #',
      '#  H    #',
      '#########',
    ],
  },
]

/**
 * 每关最短解题步数（BFS 最优，测试与 PAR 常量互校验；渲染层显示为
 * “参考”步数）。
 */
export const PAR: number[] = [3, 3, 4, 7, 9]

/** 解析后的关卡：静态几何 + 初始原子布局。 */
export interface ParsedLevel {
  rows: number
  cols: number
  walls: boolean[][]
  atoms: { id: number; el: Element; r: number; c: number }[]
  mainId: number
}

const ELEMENT_CHARS = new Set<string>(['H', 'C', 'O', 'N'])

/**
 * 解析并校验一个关卡定义。
 * @param def - 关卡定义。
 * @returns 解析后的几何与原子布局。
 * @throws 当盘面为空、主原子不是恰好一个、出现非法字符、初始存在
 *   正交相邻原子对、或原子计数与 def.formula 不一致时。
 */
export function parseLevel(def: MoleculeLevelDef): ParsedLevel {
  const lines = def.grid.map(l => l.replace(/ +$/, '')).filter(l => l.length > 0)
  if (lines.length < 3) throw new Error('molecule: level too small')
  const rows = lines.length
  const cols = Math.max(...lines.map(l => l.length))
  const walls: boolean[][] = []
  const atoms: ParsedLevel['atoms'] = []
  let main = -1
  for (let r = 0; r < rows; r += 1) {
    const w: boolean[] = []
    for (let c = 0; c < cols; c += 1) {
      const ch = c < lines[r]!.length ? lines[r]![c]! : ' '
      if (ch === '#' || ch === undefined) {
        w.push(true)
        continue
      }
      w.push(false)
      if (ch === ' ' || ch === '.') continue
      if (ch === '@') {
        if (main !== -1) throw new Error('molecule: multiple main atoms')
        main = atoms.length
        atoms.push({ id: atoms.length, el: def.mainEl, r, c })
        continue
      }
      if (!ELEMENT_CHARS.has(ch)) throw new Error('molecule: unknown tile ' + ch)
      atoms.push({ id: atoms.length, el: ch as Element, r, c })
    }
    walls.push(w)
  }
  if (main === -1) throw new Error('molecule: no main atom')
  if (atoms[main]!.el !== def.mainEl) throw new Error('molecule: main element mismatch')
  const at = (r: number, c: number): boolean => atoms.some(a => a.r === r && a.c === c)
  for (const a of atoms) {
    if (at(a.r - 1, a.c) || at(a.r + 1, a.c) || at(a.r, a.c - 1) || at(a.r, a.c + 1)) {
      throw new Error('molecule: adjacent atoms at start')
    }
  }
  if (formatFormula(countsOf(atoms)) !== def.formula) {
    throw new Error('molecule: atom counts do not match ' + def.formula)
  }
  return { rows, cols, walls, atoms, mainId: main }
}

/** 元素计数表。 */
export type Formula = Partial<Record<Element, number>>

/**
 * 统计原子集合的元素计数。
 * @param atoms - 原子列表（或带 el 的等价对象）。
 * @returns 计数表。
 */
export function countsOf(atoms: { el: Element }[]): Formula {
  const counts: Formula = {}
  for (const a of atoms) counts[a.el] = (counts[a.el] ?? 0) + 1
  return counts
}

/** 分子式输出顺序：C、H 在前（Hill 记法），N、O 随后。 */
const FORMULA_ORDER: Element[] = ['C', 'H', 'N', 'O']

/**
 * 把计数表格式化为分子式字符串（计数 1 省略），如 C2H4、NH3、H2O。
 * @param counts - 元素计数。
 * @returns 分子式字符串。
 */
export function formatFormula(counts: Formula): string {
  let out = ''
  for (const el of FORMULA_ORDER) {
    const n = counts[el] ?? 0
    if (n <= 0) continue
    out += el + (n === 1 ? '' : String(n))
  }
  return out
}

/**
 * mulberry32 确定性伪随机数发生器：所有随机决策的唯一来源，注入
 * seed 后完全可重放。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 一步移动的完整记录（动画与撤销用）。 */
export interface MoveEntry { id: number; from: Position; to: Position }

/** 一次施加的移动：平移了的原子与本步新生成的键。 */
export interface MoleculeMove {
  dir: Dir
  moved: MoveEntry[]
  /** 本步新生成的键（原子 id 对 + 键级）。 */
  formed: { a: number; b: number; order: number }[]
  /** 本步过关。 */
  cleared: boolean
}

/** 撤销快照：完整原子布局 + 计数。 */
interface Snapshot { atoms: Atom[]; moves: number; score: number }

/** 游戏状态：盘面、原子、键、计分与历史。 */
export interface MoleculeState {
  levelIndex: number
  rows: number
  cols: number
  walls: boolean[][]
  atoms: Atom[]
  mainId: number
  /** 目标元素计数（等于关卡原子计数）。 */
  target: Formula
  /** 本关定义（名称/展示式/提示）。 */
  def: MoleculeLevelDef
  /** 本关最短步数参考。 */
  par: number
  moves: number
  score: number
  /** 本关开始时的分数；重开回滚到它。 */
  entryScore: number
  history: Snapshot[]
  cleared: boolean
  /** 注入的确定性随机源（仅供渲染层绘制顺序等装饰用途）。 */
  rng: () => number
}

function cloneAtom(a: Atom): Atom {
  const bonds: Record<number, number> = {}
  for (const k of Object.keys(a.bonds)) bonds[Number(k)] = a.bonds[Number(k)]!
  return { id: a.id, el: a.el, r: a.r, c: a.c, bonds }
}

/**
 * 深克隆状态（walls/target/def/rng 按引用共享——它们不可变或与逻辑
 * 无关；history 一并清空，专供求解器复用）。
 * @param state - 源状态。
 * @returns 克隆状态。
 */
export function cloneState(state: MoleculeState): MoleculeState {
  return {
    levelIndex: state.levelIndex,
    rows: state.rows,
    cols: state.cols,
    walls: state.walls,
    atoms: state.atoms.map(cloneAtom),
    mainId: state.mainId,
    target: state.target,
    def: state.def,
    par: state.par,
    moves: state.moves,
    score: state.score,
    entryScore: state.entryScore,
    history: [],
    cleared: state.cleared,
    rng: state.rng,
  }
}

/**
 * 状态的规范哈希键：关卡 + 原子（元素/位置/键）+ 主原子 id。同一布局
 * 与键结构必然产生同一键；score/moves/history 故意排除。
 * @param state - 状态。
 * @returns 规范键字符串。
 */
export function stateKey(state: MoleculeState): string {
  const parts = state.atoms.map(a => {
    const bondStr = Object.keys(a.bonds).map(Number).sort((x, y) => x - y)
      .map(k => k + ':' + a.bonds[k]).join(';')
    return a.el + a.r + ',' + a.c + '|' + bondStr
  })
  return state.cols + 'x' + state.rows + '|' + state.mainId + '|' + parts.join('#')
}

function inBounds(state: MoleculeState, r: number, c: number): boolean {
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols
}

/**
 * 按 id 取原子。
 * @param state - 状态。
 * @param id - 原子 id。
 * @returns 原子。
 */
export function atomById(state: MoleculeState, id: number): Atom {
  return state.atoms[id]!
}

/**
 * 取某格上的原子。
 * @param state - 状态。
 * @param r - 行。
 * @param c - 列。
 * @returns 该格原子，空格返回 null。
 */
export function atomAt(state: MoleculeState, r: number, c: number): Atom | null {
  for (const a of state.atoms) if (a.r === r && a.c === c) return a
  return null
}

/**
 * 原子的剩余空价（化合价减去已耗键级总和）。
 * @param atom - 原子。
 * @returns 空价数。
 */
export function freeBonds(atom: Atom): number {
  let used = 0
  for (const k of Object.keys(atom.bonds)) used += atom.bonds[Number(k)]!
  return VALENCE[atom.el] - used
}

/**
 * 通过键关系求原子所属的连通团（原子 id 集合）。
 * @param state - 状态。
 * @param id - 起始原子 id。
 * @returns 团内全部原子 id。
 */
export function groupOf(state: MoleculeState, id: number): Set<number> {
  const seen = new Set<number>([id])
  const queue = [id]
  for (let head = 0; head < queue.length; head += 1) {
    const cur = atomById(state, queue[head]!)
    for (const k of Object.keys(cur.bonds)) {
      const next = Number(k)
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
  }
  return seen
}

/**
 * 计算一次移动要平移的原子集合：主原子所在团，加上被它（传递性）
 * 顶住的其他团。
 * @param state - 状态。
 * @param dr - 行增量。
 * @param dc - 列增量。
 * @returns 要移动的原子 id 集合；任一目的地越界或撞墙时返回 null。
 */
function computeMoving(state: MoleculeState, dr: number, dc: number): Set<number> | null {
  const moving = groupOf(state, state.mainId)
  let grew = true
  while (grew) {
    grew = false
    for (const id of moving) {
      const a = atomById(state, id)
      const occ = atomAt(state, a.r + dr, a.c + dc)
      if (occ === null || moving.has(occ.id)) continue
      for (const m of groupOf(state, occ.id)) {
        if (!moving.has(m)) { moving.add(m); grew = true }
      }
    }
  }
  for (const id of moving) {
    const a = atomById(state, id)
    if (!inBounds(state, a.r + dr, a.c + dc) || state.walls[a.r + dr]![a.c + dc]!) return null
  }
  return moving
}

/**
 * 一步移动后扫键：所有正交相邻、尚未成键且双方都有空价的原子对，
 * 键级 = min(MAX_BOND_ORDER, 空价A, 空价B)。单遍即收敛（键级只在
 * 相邻瞬间取当时空价，不存在事后升级）。
 * @param state - 已平移完的状态。
 * @returns 本步新生成的键列表。
 */
function resolveBonds(state: MoleculeState): { a: number; b: number; order: number }[] {
  const formed: { a: number; b: number; order: number }[] = []
  for (const a of state.atoms) {
    for (const [dr, dc] of [[1, 0], [0, 1]] as const) {
      const b = atomAt(state, a.r + dr, a.c + dc)
      if (b === null || b.bonds[a.id] !== undefined) continue
      const fa = freeBonds(a)
      const fb = freeBonds(b)
      if (fa <= 0 || fb <= 0) continue
      const order = Math.min(MAX_BOND_ORDER, fa, fb)
      a.bonds[b.id] = order
      b.bonds[a.id] = order
      formed.push({ a: a.id, b: b.id, order })
    }
  }
  return formed
}

/**
 * 是否全部原子连成一个团。
 * @param state - 状态。
 * @returns 连通返回 true。
 */
export function isConnected(state: MoleculeState): boolean {
  return groupOf(state, state.mainId).size === state.atoms.length
}

/**
 * 是否达成目标：全部连通、全部原子价恰好饱和、元素计数与目标式一致。
 * @param state - 状态。
 * @returns 过关返回 true。
 */
export function isWin(state: MoleculeState): boolean {
  if (!isConnected(state)) return false
  for (const a of state.atoms) if (freeBonds(a) !== 0) return false
  return formatFormula(countsOf(state.atoms)) === formatFormula(state.target)
}

/**
 * 一个原子未来最多还能消耗多少价：每个尚未成键的正交地板邻居格最多
 * 贡献一个双键（2）。
 * @param state - 状态。
 * @param atom - 原子。
 * @returns 上界。
 */
function futureBondCapacity(state: MoleculeState, atom: Atom): number {
  let cap = 0
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const r = atom.r + dr
    const c = atom.c + dc
    if (!inBounds(state, r, c) || state.walls[r]![c]!) continue
    const occ = atomAt(state, r, c)
    if (occ !== null && occ.bonds[atom.id] !== undefined) continue
    cap += MAX_BOND_ORDER
  }
  return cap
}

/**
 * 死锁检测（不可恢复局面）：某原子剩余空价超过其未来可能的成键上界
 * （典型：把 C 推进只剩一格开口的死胡同），或主原子四个方向都动不了。
 * @param state - 状态。
 * @returns 死锁返回 true（已过关恒为 false）。
 */
export function isDeadlocked(state: MoleculeState): boolean {
  if (state.cleared) return false
  for (const a of state.atoms) {
    if (freeBonds(a) > futureBondCapacity(state, a)) return true
  }
  for (const dir of Object.keys(DIRS) as Dir[]) {
    const [dr, dc] = DIRS[dir]!
    if (computeMoving(state, dr, dc) !== null) return false
  }
  return true
}

function loadInto(state: MoleculeState, levelIndex: number, def: MoleculeLevelDef): void {
  const parsed = parseLevel(def)
  state.levelIndex = levelIndex
  state.rows = parsed.rows
  state.cols = parsed.cols
  state.walls = parsed.walls
  state.atoms = parsed.atoms.map(a => ({ id: a.id, el: a.el, r: a.r, c: a.c, bonds: {} }))
  state.mainId = parsed.mainId
  state.target = countsOf(parsed.atoms)
  state.def = def
  state.par = PAR[levelIndex] ?? 0
  state.moves = 0
  state.entryScore = state.score
  state.history = []
  state.cleared = false
}

/**
 * 从自定义关卡定义创建状态（内置关卡请用 createMoleculeState）。
 * @param def - 关卡定义。
 * @param seed - 随机种子。
 * @param score - 带入分数。
 * @returns 新状态。
 */
export function createMoleculeStateFromDef(def: MoleculeLevelDef, seed = 1, score = 0): MoleculeState {
  const state: MoleculeState = {
    levelIndex: 0,
    rows: 0,
    cols: 0,
    walls: [],
    atoms: [],
    mainId: 0,
    target: {},
    def,
    par: 0,
    moves: 0,
    score,
    entryScore: score,
    history: [],
    cleared: false,
    rng: mulberry32(seed),
  }
  loadInto(state, 0, def)
  return state
}

/**
 * 创建某个内置关卡的新状态。
 * @param levelIndex - 内置关卡下标（0 起）。
 * @param seed - 随机种子（默认 1）。
 * @param score - 带入分数。
 * @returns 新状态。
 */
export function createMoleculeState(levelIndex = 0, seed = 1, score = 0): MoleculeState {
  const state = createMoleculeStateFromDef(LEVELS[0]!, seed, score)
  loadLevel(state, levelIndex)
  return state
}

/**
 * 切换到某个内置关卡（分数保留，作为新关卡起点）。
 * @param state - 状态。
 * @param levelIndex - 目标关卡下标。
 */
export function loadLevel(state: MoleculeState, levelIndex: number): void {
  loadInto(state, levelIndex, LEVELS[levelIndex]!)
}

/**
 * 重开当前关卡：布局与分数回滚到入关时。
 * @param state - 状态。
 */
export function restartLevel(state: MoleculeState): void {
  state.score = state.entryScore
  loadLevel(state, state.levelIndex)
}

/**
 * 施加一步移动：主原子（连同其团）向 dir 平移一格，路径上顶住的
 * 原子团被推一格；随后扫键。任何被推原子撞墙则整步拒绝。
 * @param state - 状态。
 * @param dir - 方向。
 * @returns 移动记录；被挡或已过关时返回 null。
 */
export function applyMove(state: MoleculeState, dir: Dir): MoleculeMove | null {
  if (state.cleared) return null
  const [dr, dc] = DIRS[dir]!
  const moving = computeMoving(state, dr, dc)
  if (moving === null) return null
  const snapshot: Snapshot = {
    atoms: state.atoms.map(cloneAtom),
    moves: state.moves,
    score: state.score,
  }
  const moved: MoveEntry[] = []
  for (const id of moving) {
    const a = atomById(state, id)
    moved.push({ id, from: { r: a.r, c: a.c }, to: { r: a.r + dr, c: a.c + dc } })
    a.r += dr
    a.c += dc
  }
  const formed = resolveBonds(state)
  state.moves += 1
  state.score += BOND_SCORE * formed.length
  const cleared = isWin(state)
  if (cleared) {
    state.cleared = true
    state.score += CLEAR_SCORE
  }
  state.history.push(snapshot)
  return { dir, moved, formed, cleared }
}

/**
 * 撤销上一步：原子布局、键、步数与分数完整恢复。
 * @param state - 状态。
 * @returns 撤销成功返回 true；无步可撤返回 false。
 */
export function undoMove(state: MoleculeState): boolean {
  const snap = state.history.pop()
  if (snap === undefined) return false
  state.atoms = snap.atoms.map(cloneAtom)
  state.moves = snap.moves
  state.score = snap.score
  state.cleared = false
  return true
}

/**
 * 渲染装饰用：按注入 seed 确定性地重排原子绘制顺序（Fisher-Yates）。
 * 逻辑结果与 seed 无关；本函数保证同 seed 同序。
 * @param state - 状态。
 * @returns 原子 id 的一个确定性排列。
 */
export function shimmerOrder(state: MoleculeState): number[] {
  const ids = state.atoms.map(a => a.id)
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(state.rng() * (i + 1))
    const t = ids[i]!
    ids[i] = ids[j]!
    ids[j] = t
  }
  return ids
}

/**
 * 从主原子出发深度优先遍历键图，生成 H–O–H / H₂C=CH₂ 风格的结构串。
 * @param state - 状态。
 * @returns 结构串（未成键时只有主元素符号）。
 */
export function structureString(state: MoleculeState): string {
  const visited = new Set<number>()
  const dfs = (id: number): string => {
    visited.add(id)
    const a = atomById(state, id)
    let out = a.el
    for (const k of Object.keys(a.bonds).map(Number).sort((x, y) => x - y)) {
      if (visited.has(k)) continue
      out += (a.bonds[k]! >= 2 ? '=' : '–') + dfs(k)
    }
    return out
  }
  return dfs(state.mainId)
}

/**
 * 带节点预算的 BFS 求解器：从给定状态出发找最短过关步数。用于测试
 * 验证关卡可解性与 PAR。
 * @param state - 起始状态（不会被修改）。
 * @param budget - 最大展开节点数。
 * @returns 最短步数；预算内无解返回 -1。
 */
export function solve(state: MoleculeState, budget: number): number {
  const start = cloneState(state)
  if (start.cleared) return 0
  const visited = new Set<string>([stateKey(start)])
  const queue: MoleculeState[] = [start]
  const depth: number[] = [0]
  for (let head = 0; head < queue.length; head += 1) {
    if (head > budget) return -1
    const cur = queue[head]!
    const d = depth[head]!
    for (const dir of Object.keys(DIRS) as Dir[]) {
      const next = cloneState(cur)
      if (applyMove(next, dir) === null) continue
      next.history = []
      if (next.cleared) return d + 1
      const key = stateKey(next)
      if (visited.has(key)) continue
      visited.add(key)
      queue.push(next)
      depth.push(d + 1)
    }
  }
  return -1
}
