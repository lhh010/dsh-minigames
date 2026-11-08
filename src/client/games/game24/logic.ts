/**
 * 24点（24 Game）纯逻辑：每局由 (seed, deal) 经 mulberry32 确定性发
 * 4 张 1-13 的牌；玩家选两张牌与一个运算符（+ − × ÷）合并为中间
 * 结果牌，反复直到只剩一张，目标恰好为 24。除法仅在整除时允许
 * （b ≠ 0 且 a % b === 0，结果恒为整数），减法允许负数中间值；无解
 * 牌面可「换一局」（deal 推进重发）但扣 20 分并清零连胜，获胜后
 * 换到下一局不扣分。计分：基础 100 分 + 步数奖励（总合并次数
 * moves 越少越高，最少 3 次得 30 分）+ 连胜奖励（每次 +10，封顶
 * 100）；本局用过提示则固定 25 分且连胜不涨。所有操作直接修改
 * 传入 state（撤回走快照栈），同 seed 同操作序列必然得到同一状态，
 * 可脱离 DOM 直接模拟验证。
 */

/** 四则运算符。 */
export type Op = '+' | '-' | '*' | '/'

/** 运算符显示记号（+ − × ÷）。 */
export const OP_SYMBOL: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' }

/** 运算符表（渲染与求解顺序确定）。 */
export const OPS: readonly Op[] = ['+', '-', '*', '/']

/** 目标值：只剩一张牌时必须恰好等于它。 */
export const TARGET = 24

/** 换一局（未获胜时跳过本局）的扣分。 */
export const SKIP_PENALTY = 20

/** 用过提示后的固定得分。 */
export const HINT_SCORE = 25

/** 求解器的一步：对当前牌面中的 a、b 两张执行 a op b 得 r。 */
export interface SolveStep {
  a: number
  b: number
  op: Op
  r: number
}

/** 一张牌：value 为当前数值（可为中间结果），label 为显示表达式。 */
export interface Game24Card {
  /** 牌 id：初始四张为 0-3，中间结果牌从 4 递增（渲染按此分行）。 */
  id: number
  value: number
  /** 初始牌为数值本身，合并牌为带括号的表达式（如 "(1+2)"）。 */
  label: string
}

/** 撤回快照：一步合并前的牌面、历史与选择。 */
interface RoundSnapshot {
  cards: Game24Card[]
  history: string[]
  selected: number[]
}

/** 一局游戏的完整可测状态。 */
export interface Game24State {
  seed: number
  /** 第几局（0 起；换一局推进，R 重开回到 0）。 */
  deal: number
  /** 当前牌面（初始牌 + 中间结果牌）。 */
  cards: Game24Card[]
  /** 已执行的表达式历史（如 "1 + 2 = 3"）。 */
  history: string[]
  /** 已选牌下标（按点击顺序，先选的为左操作数）。 */
  selected: number[]
  /** 下一个中间结果牌 id。 */
  nextCardId: number
  /** 本局累计合并次数（撤回不减少，计步数奖励用）。 */
  moves: number
  /** 连胜局数（正常获胜 +1；提示获胜与跳局清零/不涨）。 */
  streak: number
  score: number
  /** 本局是否用过提示。 */
  hintUsed: boolean
  /** 开局时牌面是否可解（渲染「本局无解」提示用）。 */
  dealSolvable: boolean
  /** playing 进行中；won 已凑成 24。 */
  status: 'playing' | 'won'
  /** 最近一次获胜的得分（未获胜为 0）。 */
  lastGain: number
  message: string
  /** 撤回快照栈。 */
  undoStack: RoundSnapshot[]
}

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

/** 局号混合进种子：同 seed 不同 deal 得到独立发牌序列。 */
function dealSeed(seed: number, deal: number): number {
  return (seed + deal * 0x9e3779b9) >>> 0
}

/**
 * 确定性发 4 张牌（点数 1-13）。
 * @param seed - 基础种子。
 * @param deal - 局号。
 * @returns 4 个 1-13 的点数。
 */
export function dealCards(seed: number, deal: number): number[] {
  const rng = mulberry32(dealSeed(seed, deal))
  const values: number[] = []
  for (let i = 0; i < 4; i += 1) values.push(1 + Math.floor(rng() * 13))
  return values
}

/**
 * 应用一次四则运算。
 * @param a - 左操作数。
 * @param b - 右操作数。
 * @param op - 运算符。
 * @returns 结果；除数为 0 或除不尽（非整数）时为 null。
 */
export function applyOp(a: number, b: number, op: Op): number | null {
  if (op === '+') return a + b
  if (op === '-') return a - b
  if (op === '*') return a * b
  if (b === 0 || a % b !== 0) return null
  return a / b
}

/**
 * 24点求解器：穷举所有两两配对与运算（减法/除法双向），返回一条
 * 到 24 的最短步序列（迭代顺序确定，结果确定）。
 * @param nums - 当前牌面数值（任意长度 ≥ 1）。
 * @returns 步骤数组（第一步在前）；无解为 null。
 */
export function solve24(nums: number[]): SolveStep[] | null {
  return search(nums)
}

function search(list: number[]): SolveStep[] | null {
  if (list.length === 0) return null
  if (list.length === 1) return list[0] === TARGET ? [] : null
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const x = list[i]!
      const y = list[j]!
      const rest: number[] = []
      for (let k = 0; k < list.length; k += 1) {
        if (k !== i && k !== j) rest.push(list[k]!)
      }
      const candidates: { a: number, b: number, op: Op }[] = [
        { a: x, b: y, op: '+' },
        { a: x, b: y, op: '*' },
        { a: x, b: y, op: '-' },
        { a: y, b: x, op: '-' },
        { a: x, b: y, op: '/' },
        { a: y, b: x, op: '/' },
      ]
      for (const c of candidates) {
        const r = applyOp(c.a, c.b, c.op)
        if (r === null) continue
        const sub = search([...rest, r])
        if (sub !== null) return [{ a: c.a, b: c.b, op: c.op, r }, ...sub]
      }
    }
  }
  return null
}

/**
 * 判定牌面能否凑成 24（solve24 的布尔形式）。
 * @param nums - 当前牌面数值。
 * @returns 可解为 true。
 */
export function hasSolution(nums: number[]): boolean {
  return solve24(nums) !== null
}

/**
 * 获胜得分：基础 100 + 步数奖励（max(0, 6-moves)×10，最少 3 步得
 * 30）+ 连胜奖励（min(streak,10)×10，streak 为获胜前连胜数）；用过
 * 提示固定 25 分。
 * @param hintUsed - 本局是否用过提示。
 * @param moves - 本局累计合并次数。
 * @param streak - 获胜前的连胜局数。
 * @returns 本局得分。
 */
export function winScore(hintUsed: boolean, moves: number, streak: number): number {
  if (hintUsed) return HINT_SCORE
  const speedBonus = Math.max(0, 6 - moves) * 10
  const streakBonus = Math.min(streak, 10) * 10
  return 100 + speedBonus + streakBonus
}

function snapshot(state: Game24State): RoundSnapshot {
  return {
    cards: state.cards.map(c => ({ ...c })),
    history: [...state.history],
    selected: [...state.selected],
  }
}

/** 按当前 deal 重发并重置本局字段（不动 score/streak）。 */
function startDeal(state: Game24State): void {
  const values = dealCards(state.seed, state.deal)
  state.cards = values.map((v, i) => ({ id: i, value: v, label: String(v) }))
  state.history = []
  state.selected = []
  state.nextCardId = 4
  state.moves = 0
  state.hintUsed = false
  state.status = 'playing'
  state.lastGain = 0
  state.undoStack = []
  state.dealSolvable = hasSolution(values)
  state.message = state.dealSolvable ? '本局可解 · 选两张牌' : '本局无解 · N 换一局（-20）'
}

/**
 * 开新游戏：deal 0、分数与连胜清零。
 * @param seed - 基础种子。
 */
export function createGame24(seed: number): Game24State {
  const state: Game24State = {
    seed,
    deal: 0,
    cards: [],
    history: [],
    selected: [],
    nextCardId: 4,
    moves: 0,
    streak: 0,
    score: 0,
    hintUsed: false,
    dealSolvable: false,
    status: 'playing',
    lastGain: 0,
    message: '',
    undoStack: [],
  }
  startDeal(state)
  return state
}

/**
 * 点牌：切换选中（再点取消）；已选两张时点第三张被拒。
 * @param state - 目标状态。
 * @param index - cards 下标。
 * @returns 选中状态发生变化为 true。
 */
export function selectCard(state: Game24State, index: number): boolean {
  if (state.status !== 'playing') return false
  if (index < 0 || index >= state.cards.length) return false
  const at = state.selected.indexOf(index)
  if (at >= 0) {
    state.selected.splice(at, 1)
    return true
  }
  if (state.selected.length >= 2) {
    state.message = '已选两张 · 先点运算符或再点取消'
    return false
  }
  state.selected.push(index)
  state.message = state.selected.length === 2 ? '选一个运算符' : '再选一张牌'
  return true
}

/**
 * 合并：按选择顺序（先选的为左操作数）执行运算，两张牌替换为中间
 * 结果牌；只剩一张且恰为 24 时判胜并计分。
 * @param state - 目标状态。
 * @param op - 运算符。
 * @returns 合并成功为 true（除不尽/未选满两张/已获胜为 false）。
 */
export function applyOperation(state: Game24State, op: Op): boolean {
  if (state.status !== 'playing' || state.selected.length !== 2) return false
  const i = state.selected[0]!
  const j = state.selected[1]!
  const a = state.cards[i]!
  const b = state.cards[j]!
  const r = applyOp(a.value, b.value, op)
  if (r === null) {
    state.message = a.value + ' ÷ ' + b.value + ' 除不尽 · 换运算或换顺序'
    return false
  }
  state.undoStack.push(snapshot(state))
  const sym = OP_SYMBOL[op]
  const line = a.label + ' ' + sym + ' ' + b.label + ' = ' + String(r)
  const merged: Game24Card = { id: state.nextCardId, value: r, label: '(' + a.label + sym + b.label + ')' }
  state.cards = state.cards.filter((_, k) => k !== i && k !== j)
  state.cards.push(merged)
  state.nextCardId += 1
  state.history.push(line)
  state.moves += 1
  state.selected = []
  if (state.cards.length === 1 && r === TARGET) {
    const gain = winScore(state.hintUsed, state.moves, state.streak)
    state.status = 'won'
    state.lastGain = gain
    state.score += gain
    if (!state.hintUsed) state.streak += 1
    state.message = '达成 24！+' + gain + ' 分 · N 下一局'
  } else if (state.cards.length === 1) {
    state.message = '剩 ' + r + ' · U 撤回 / N 换一局'
  } else {
    state.message = line
  }
  return true
}

/**
 * 撤回上一步合并（快照恢复牌面/历史/选择；moves 不回退）。
 * @param state - 目标状态。
 * @returns 撤回成功为 true；栈空或已获胜为 false。
 */
export function undo(state: Game24State): boolean {
  if (state.status !== 'playing') return false
  const snap = state.undoStack.pop()
  if (snap === undefined) return false
  state.cards = snap.cards.map(c => ({ ...c }))
  state.history = [...snap.history]
  state.selected = [...snap.selected]
  state.message = '已撤回 · ' + state.cards.length + ' 张牌'
  return true
}

/**
 * 换一局：deal 推进重发。未获胜（跳局）扣 20 分并清零连胜；获胜后
 * 进入下一局不扣分。
 * @param state - 目标状态。
 */
export function changeDeal(state: Game24State): void {
  if (state.status !== 'won') {
    state.score = Math.max(0, state.score - SKIP_PENALTY)
    state.streak = 0
  }
  state.deal += 1
  startDeal(state)
}

/**
 * 提示：给出当前牌面求解的第一步并标记本局弃奖励（固定 25 分、
 * 连胜不涨）。
 * @param state - 目标状态。
 * @returns 正确操作一步；当前无解或已获胜为 null。
 */
export function useHint(state: Game24State): SolveStep | null {
  if (state.status !== 'playing') return null
  const solution = solve24(state.cards.map(c => c.value))
  if (solution === null || solution.length === 0) return null
  state.hintUsed = true
  state.message = '已提示 · 本局奖励降为 25 分'
  return solution[0]!
}
