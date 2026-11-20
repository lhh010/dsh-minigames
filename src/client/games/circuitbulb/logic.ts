/**
 * 电路点灯 CircuitBulb 纯逻辑：开关-灯泡布尔电路谜题。
 * 每个灯泡由若干开关的布尔表达式（直连/NOT/AND/OR/XOR）决定亮灭；
 * 关卡由 seed 确定性生成，并用穷举求解器验证"让全部灯泡亮起"的开关
 * 组合唯一。无 DOM、无定时器——全部函数可测。
 */

/** 确定性 mulberry32 伪随机数生成器（沿 tests/pipes-logic.spec.ts 先例）。 */
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

/** 布尔表达式节点：var 引用开关下标；not/and/or/xor 为五种运算。 */
export type Expr =
  | { kind: 'var'; index: number }
  | { kind: 'not'; inner: Expr }
  | { kind: 'and'; left: Expr; right: Expr }
  | { kind: 'or'; left: Expr; right: Expr }
  | { kind: 'xor'; left: Expr; right: Expr }

/** 关卡允许的表达式运算种类。 */
export type OpKind = 'direct' | 'not' | 'and' | 'or' | 'xor'

/** 递进关卡配置：开关数、灯泡数、可用运算、嵌套深度。 */
export interface LevelConfig {
  switches: number
  bulbs: number
  /** 允许出现的一元/二元运算（'direct' 表示允许单开关直连）。 */
  ops: OpKind[]
  /** 0：只有字面开关；1：允许 ¬开关；2：允许 ¬(子表达式) 嵌套。 */
  nest: number
}

/** 总关卡数。 */
export const LEVEL_COUNT = 5

/** 关卡难度配置：开关 6→12、灯泡 5→9、运算逐步解锁、嵌套加深。 */
export function levelConfig(level: number): LevelConfig {
  const lv = Math.min(Math.max(1, level), LEVEL_COUNT)
  if (lv === 1) return { switches: 6, bulbs: 5, ops: ['direct', 'not', 'and'], nest: 0 }
  if (lv === 2) return { switches: 7, bulbs: 6, ops: ['direct', 'not', 'and', 'or'], nest: 1 }
  if (lv === 3) return { switches: 8, bulbs: 7, ops: ['direct', 'not', 'and', 'or', 'xor'], nest: 1 }
  if (lv === 4) return { switches: 10, bulbs: 8, ops: ['direct', 'not', 'and', 'or', 'xor'], nest: 2 }
  return { switches: 12, bulbs: 9, ops: ['direct', 'not', 'and', 'or', 'xor'], nest: 2 }
}

/** 开关名：下标 0 起的字母 A、B、C…… */
export function switchName(index: number): string {
  return String.fromCharCode(65 + (index % 26))
}

/**
 * 求值布尔表达式。
 * @param expr 表达式树。
 * @param states 各开关当前状态（下标对应 expr.var.index）。
 * @returns 表达式的布尔值。
 */
export function evalExpr(expr: Expr, states: boolean[]): boolean {
  switch (expr.kind) {
    case 'var': return states[expr.index] === true
    case 'not': return !evalExpr(expr.inner, states)
    case 'and': return evalExpr(expr.left, states) && evalExpr(expr.right, states)
    case 'or': return evalExpr(expr.left, states) || evalExpr(expr.right, states)
    case 'xor': return evalExpr(expr.left, states) !== evalExpr(expr.right, states)
  }
}

/** and=1 最紧，or=2，xor=3 最松；原子不需要括号。 */
function precedence(expr: Expr): number {
  if (expr.kind === 'and') return 1
  if (expr.kind === 'or') return 2
  if (expr.kind === 'xor') return 3
  return 0
}

function formatAt(expr: Expr, parentPrec: number): string {
  if (expr.kind === 'var') return switchName(expr.index)
  if (expr.kind === 'not') {
    const inner = expr.inner.kind === 'var' ? switchName(expr.inner.index) : formatAt(expr.inner, 0)
    return '¬' + inner
  }
  const self = precedence(expr)
  const op = expr.kind === 'and' ? '·' : expr.kind === 'or' ? '+' : '⊕'
  const body = formatAt(expr.left, self) + op + formatAt(expr.right, self)
  return self > parentPrec ? '(' + body + ')' : body
}

/**
 * 符号化表达式（如 'A·¬B'、'A+(B⊕C)'、'¬(A·B)'）。
 * @param expr 表达式树。
 * @returns 人类可读的逻辑式字符串。
 */
export function formatExpr(expr: Expr): string {
  return formatAt(expr, 4)
}

/** 表达式引用的全部开关下标（去重、升序）。 */
export function exprVars(expr: Expr): number[] {
  const seen = new Set<number>()
  const walk = (e: Expr): void => {
    if (e.kind === 'var') seen.add(e.index)
    else if (e.kind === 'not') walk(e.inner)
    else { walk(e.left); walk(e.right) }
  }
  walk(expr)
  return [...seen].sort((a, b) => a - b)
}

/**
 * 穷举求解：找出让全部灯泡亮起的开关组合。
 * @param bulbs 每个灯泡的表达式。
 * @param switches 开关总数。
 * @returns 唯一解对应的位掩码数组（位 i = 开关 i 闭合）。
 */
export function solveAll(bulbs: Expr[], switches: number): number[] {
  const total = 1 << switches
  const states = new Array<boolean>(switches)
  const wins: number[] = []
  for (let mask = 0; mask < total; mask += 1) {
    for (let i = 0; i < switches; i += 1) states[i] = ((mask >> i) & 1) === 1
    let all = true
    for (const bulb of bulbs) {
      if (!evalExpr(bulb, states)) { all = false; break }
    }
    if (all) wins.push(mask)
  }
  return wins
}

/** 一关的完整数据：灯泡表达式 + 唯一解 + PAR。 */
export interface Level {
  /** 关卡号（1 起）。 */
  level: number
  /** 使用的关卡配置。 */
  config: LevelConfig
  /** 每个灯泡的布尔表达式。 */
  bulbs: Expr[]
  /** 唯一解位掩码（位 i = 开关 i 应闭合）。 */
  solution: number
  /** 最少拨动次数（从全关出发 = 解中闭合开关的个数）。 */
  par: number
}

/** 位掩码中 1 的个数。 */
export function popcount(mask: number): number {
  let n = mask
  n = n - ((n >> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  n = (n + (n >> 4)) & 0x0f0f0f0f
  return (n * 0x01010101) >> 24
}

/** 把位掩码还原成开关状态数组。 */
export function maskToStates(mask: number, switches: number): boolean[] {
  return Array.from({ length: switches }, (_, i) => ((mask >> i) & 1) === 1)
}

function shufflePick(rng: () => number, switches: number, count: number): number[] {
  const pool = Array.from({ length: switches }, (_, i) => i)
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = tmp
  }
  return pool.slice(0, count)
}

/** 随机生成一个灯泡表达式（受配置的运算种类与嵌套深度约束）。 */
function buildExpr(rng: () => number, cfg: LevelConfig): Expr {
  const binary = cfg.ops.filter((op) => op !== 'direct' && op !== 'not')
  const allowNot = cfg.ops.includes('not')
  const operandCount = binary.length === 0 ? 1 : 1 + Math.floor(rng() * 3)
  const picked = shufflePick(rng, cfg.switches, operandCount)
  let cursor = 0
  const leaf = (): Expr => {
    const index = picked[cursor]!
    cursor += 1
    const v: Expr = { kind: 'var', index }
    return allowNot && cfg.nest >= 1 && rng() < 0.3 ? { kind: 'not', inner: v } : v
  }
  const binop = (l: Expr, r: Expr): Expr => {
    const op = binary[Math.floor(rng() * binary.length)]!
    return op === 'and' ? { kind: 'and', left: l, right: r }
      : op === 'or' ? { kind: 'or', left: l, right: r }
        : { kind: 'xor', left: l, right: r }
  }
  if (picked.length === 1) {
    const v: Expr = { kind: 'var', index: picked[0]! }
    return allowNot && rng() < 0.5 ? { kind: 'not', inner: v } : v
  }
  if (picked.length === 2 || cfg.nest < 2 || rng() < 0.5) return binop(leaf(), leaf())
  // 三个开关的嵌套：op(a, ¬op(b, c))——NOT 链 / XOR 组合在后期关卡出现。
  const inner = binop(leaf(), leaf())
  return allowNot
    ? binop(leaf(), { kind: 'not', inner })
    : binop(leaf(), inner)
}

/** 兜底关卡：把全部开关分成连续组，每组一个 AND 灯泡——开关多于
 * 灯泡时也约束每个开关，唯一解仍为全部闭合，永不失手。 */
function fallbackLevel(level: number, cfg: LevelConfig): Level {
  const bulbs: Expr[] = []
  for (let i = 0; i < cfg.bulbs; i += 1) {
    const start = Math.floor((i * cfg.switches) / cfg.bulbs)
    const end = Math.floor(((i + 1) * cfg.switches) / cfg.bulbs) - 1
    let expr: Expr = { kind: 'var', index: start }
    for (let j = start + 1; j <= end; j += 1) {
      expr = { kind: 'and', left: expr, right: { kind: 'var', index: j } }
    }
    bulbs.push(expr)
  }
  const solution = (1 << cfg.switches) - 1
  return { level, config: cfg, bulbs, solution, par: popcount(solution) }
}

/** 生成尝试次数上限（每关 seed 派生，超限走兜底构造）。 */
const MAX_ATTEMPTS = 400

/**
 * 生成一关：随机表达式 + 穷举验证唯一解；不唯一则换派生 seed 重试。
 * @param seed 玩家种子。
 * @param level 关卡号（1 起，钳制到 1..LEVEL_COUNT）。
 * @returns 含唯一解与 PAR 的关卡数据。
 */
export function makeLevel(seed: number, level: number): Level {
  const cfg = levelConfig(level)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const rng = mulberry32((seed * 0x9e3779b1 + level * 7919 + attempt * 104729) >>> 0)
    const bulbs = Array.from({ length: cfg.bulbs }, () => buildExpr(rng, cfg))
    const wins = solveAll(bulbs, cfg.switches)
    if (wins.length === 1) {
      return { level, config: cfg, bulbs, solution: wins[0]!, par: popcount(wins[0]!) }
    }
  }
  return fallbackLevel(level, cfg)
}

/** 一局运行状态（不可变：每次操作返回新对象）。 */
export interface GameState {
  level: number
  levelData: Level
  /** 各开关当前状态。 */
  states: boolean[]
  /** 已拨动次数。 */
  moves: number
  /** 已用提示次数。 */
  hintsUsed: number
  /** 本关是否已达全亮。 */
  won: boolean
}

/**
 * 开局（或按同 seed 重开）：开关全部断开、零拨动。
 * @param seed 玩家种子。
 * @param level 关卡号。
 */
export function createGame(seed: number, level: number): GameState {
  const levelData = makeLevel(seed, level)
  return {
    level,
    levelData,
    states: new Array<boolean>(levelData.config.switches).fill(false),
    moves: 0,
    hintsUsed: 0,
    won: false,
  }
}

/**
 * 拨动一个开关（纯函数）。
 * @param state 当前状态。
 * @param index 开关下标；越界时原样返回。
 * @returns 拨动后的新状态（重新判定胜负）。
 */
export function toggleSwitch(state: GameState, index: number): GameState {
  if (index < 0 || index >= state.states.length || state.won) return state
  const states = [...state.states]
  states[index] = !states[index]!
  return {
    ...state,
    states,
    moves: state.moves + 1,
    won: isAllLit(state.levelData, states),
  }
}

/** 各灯泡在给定开关状态下的亮灭。 */
export function bulbStates(levelData: Level, states: boolean[]): boolean[] {
  return levelData.bulbs.map((bulb) => evalExpr(bulb, states))
}

/** 是否全部灯泡亮起（过关判定）。 */
export function isAllLit(levelData: Level, states: boolean[]): boolean {
  return levelData.bulbs.every((bulb) => evalExpr(bulb, states))
}

/** 一次提示：指出一个当前拨错的开关及其正确状态。 */
export interface Hint {
  /** 开关下标。 */
  index: number
  /** 该开关应有的状态。 */
  shouldBe: boolean
}

/**
 * 请求提示：从"与唯一解不一致"的开关里随机挑一个，告知正确状态。
 * @param state 当前状态。
 * @param rng 提示挑选用的随机源（注入保证可测）。
 * @returns 提示对象；当前已与解完全一致时返回 null。
 */
export function pickHint(state: GameState, rng: () => number): Hint | null {
  const solution = maskToStates(state.levelData.solution, state.states.length)
  const wrong: number[] = []
  for (let i = 0; i < state.states.length; i += 1) {
    if (state.states[i] !== solution[i]) wrong.push(i)
  }
  if (wrong.length === 0) return null
  const index = wrong[Math.floor(rng() * wrong.length)]!
  return { index, shouldBe: solution[index]! }
}

/** 每关提示次数上限。 */
export const MAX_HINTS = 2

/**
 * 过关得分：以 PAR 为基准，多拨一次扣分、每个提示扣分，下限 100。
 * @param state 已过关的状态。
 * @returns 本关得分。
 */
export function scoreFor(state: GameState): number {
  const over = Math.max(0, state.moves - state.levelData.par)
  return Math.max(100, 600 - over * 20 - state.hintsUsed * 40)
}
