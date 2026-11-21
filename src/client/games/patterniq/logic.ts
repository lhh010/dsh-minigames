/**
 * 找规律 PatternIQ 纯逻辑：序列归纳推理问答。每节 10 题、共 5 节；每题
 * 展示数字序列（等差/等比/斐波那契型/平方数/交错双列/递推）或图形序列
 * （圆点数递增/方框旋转步进/填充交替）的前 4-5 项，4 选 1 选下一项。
 * 限时内越快答对分越高（线性）；答错扣 5 秒可重试，超时或答对后进入
 * 反馈阶段展示规律解释文案；节末回顾本节错题。全部随机走注入 seed
 * （mulberry32），同一 seed 完整重放。
 */

/** mulberry32 PRNG：小而快，按种子确定。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 每节题数。 */
export const QUESTIONS_PER_SECTION = 10
/** 总节数。 */
export const SECTIONS = 5
/** 答错扣时表（毫秒）：等比递增 ×2——第 1/2/3 次错扣 4s/8s/16s。
 * 原固定 5s 有漏洞：20s 时限内 5s 依次点完 4 个选项必过（穷举免罚）。
 * 等比后三次错共扣 28s > 20s，穷举必死。 */
export const WRONG_PENALTY_SCHEDULE_MS: readonly number[] = [4000, 8000, 16000]
/** 答对基础分。 */
export const SCORE_BASE = 40
/** 答对按剩余时间线性追加的最高分。 */
export const SCORE_TIME_BONUS = 60
/** 第 1 节每题限时（毫秒）。 */
export const SECTION_TIME_START_MS = 20000
/** 第 5 节每题限时（毫秒）。 */
export const SECTION_TIME_END_MS = 12000

/** 序列模板种类（graphic 为图形题，见 {@link PatternQuestion.graphicRule}）。 */
export type PatternKind =
  | 'arithmetic' | 'geometric' | 'fibonacci' | 'square' | 'alternating' | 'recursive' | 'graphic'

/** 生成规则参数：p[0]=首项/基数 a，p[1]=公差/公比/系数 b，p[2]=第三参数（交错列第二列首项 / 递推常数）。 */
export interface SequenceRule {
  kind: PatternKind
  p: readonly number[]
}

/** 图形序列的一格：圆点数、方框旋转角（度）、是否填充。 */
export interface GraphicCell {
  count: number
  rotation: number
  filled: boolean
}

/** 一个选项：数字或图形格。 */
export type PatternOption =
  | { kind: 'number'; value: number }
  | { kind: 'cell'; cell: GraphicCell }

/** 图形题的具体规律。 */
export type GraphicRule = 'grow' | 'rotate' | 'alternateFill'

/** 一道生成的找规律题。 */
export interface PatternQuestion {
  /** 难度档 1-4。 */
  level: number
  /** 数字序列已展示的前 4-5 项（图形题为 null）。 */
  terms: readonly number[] | null
  /** 图形序列已展示的前 4 格（数字题为 null）。 */
  cells: readonly GraphicCell[] | null
  /** 图形题规律（数字题为 null）。 */
  graphicRule: GraphicRule | null
  /** 生成规则参数（校验/解释用；图形题为 kind:'graphic' 占位）。 */
  rule: SequenceRule
  /** 正确选项。 */
  answer: PatternOption
  /** 4 个选项（含答案，已乱序）。 */
  options: readonly PatternOption[]
  /** 中文规律解释文案。 */
  explanation: string
}

/** 本节一条错题记录（题目快照 + 第一次错误选择的展示文本或"超时"）。 */
export interface WrongEntry {
  question: PatternQuestion
  wrongText: string
}

/** 局面阶段：作答中 / 反馈（含解释）/ 节末小结 / 全部结束。 */
export type PatterniqPhase = 'question' | 'feedback' | 'summary' | 'end'

/** 可推进的一局状态（可变，由本模块函数推进）。 */
export interface PatterniqState {
  phase: PatterniqPhase
  /** 1 基节号 1..5。 */
  section: number
  /** 0 基题号 0..9。 */
  questionIndex: number
  question: PatternQuestion
  /** 本题剩余时间（毫秒）。 */
  remainingMs: number
  /** 本题限时（毫秒）。 */
  timeLimitMs: number
  score: number
  /** 反馈阶段已选选项下标（超时为 -1）。 */
  chosenIndex: number
  /** 最近一次结算结果。 */
  lastOutcome: 'correct' | 'wrong' | 'timeout' | null
  /** 本题是否已答错过（结算时入错题本用）。 */
  /** 本题已答错次数（驱动等比扣时与错题记录）。 */
  wrongCount: number
  wrongText: string
  /** 本节错题。 */
  sectionWrong: readonly WrongEntry[]
  /** 全场累计答对数 / 作答题数。 */
  totalCorrect: number
  questionsAsked: number
  /** 内部随机源（seed 重放用；勿在渲染中消费）。 */
  rng: () => number
}

/** 各难度档允许的模板池。 */
export const LEVEL_KINDS: readonly PatternKind[][] = [
  ['arithmetic', 'square'],
  ['arithmetic', 'geometric', 'square', 'fibonacci', 'graphic'],
  ['arithmetic', 'geometric', 'fibonacci', 'alternating', 'graphic'],
  ['alternating', 'recursive', 'geometric', 'fibonacci', 'graphic'],
] as const

/** 节号（1 基）→ 难度档 1-4：1/2/3 节为 L1/L2/L3，4-5 节为 L4。 */
export function sectionLevel(section: number): number {
  return Math.min(4, Math.max(1, section))
}

/** 节号（1 基）→ 每题限时：第 1 节 20s 线性收紧到第 5 节 12s。 */
export function sectionTimeLimit(section: number): number {
  const s = Math.min(SECTIONS, Math.max(1, section))
  const step = (SECTION_TIME_START_MS - SECTION_TIME_END_MS) / (SECTIONS - 1)
  return Math.round(SECTION_TIME_START_MS - (s - 1) * step)
}

/**
 * 按规则计算第 i 项（0 基；i 可超出已展示长度即得答案项）。
 * @param rule - 生成规则。
 * @param i - 0 基下标。
 * @returns 第 i 项的值。
 */
export function computeTerm(rule: SequenceRule, i: number): number {
  const a = rule.p[0] ?? 0
  const b = rule.p[1] ?? 1
  const c = rule.p[2] ?? 0
  switch (rule.kind) {
    case 'arithmetic':
      return a + b * i
    case 'geometric':
      return a * b ** i
    case 'square':
      return (a + i) ** 2
    case 'fibonacci': {
      let prev = a
      let cur = b
      for (let k = 0; k < i; k += 1) {
        const next = prev + cur
        prev = cur
        cur = next
      }
      return cur
    }
    case 'alternating': {
      const k = Math.floor(i / 2)
      return i % 2 === 0 ? a + b * k : c + b * k
    }
    case 'recursive': {
      let t = a
      for (let k = 0; k < i; k += 1) t = b * t + c
      return t
    }
    case 'graphic':
      return i
    default:
      return i
  }
}

/** 规律解释文案（中文，含具体参数）。 */
export function explanationOf(rule: SequenceRule, graphicRule: GraphicRule | null): string {
  const b = rule.p[1] ?? 1
  const c = rule.p[2] ?? 0
  switch (rule.kind) {
    case 'arithmetic':
      return '等差数列，公差 ' + b
    case 'geometric':
      return '等比数列，公比 ' + b
    case 'fibonacci':
      return '斐波那契型：每项 = 前两项之和'
    case 'square':
      return '平方数列：从 ' + (rule.p[0] ?? 1) + '² 开始，依次 +3、+5、+7…'
    case 'alternating':
      return '交错双列：奇偶位各自公差 ' + b
    case 'recursive':
      return '递推数列：每项 = ' + b + '×前项' + (c === 0 ? '' : ' + ' + c)
    case 'graphic':
      if (graphicRule === 'grow') return '图形规律：圆点数每次 +1'
      if (graphicRule === 'rotate') return '图形规律：方框每次旋转 ' + b + '°'
      return '图形规律：填充色逐格交替'
    default:
      return ''
  }
}

/** 选项展示文本（数字直接转字符串，图形格描述三属性）。 */
export function optionText(option: PatternOption): string {
  if (option.kind === 'number') return String(option.value)
  return option.cell.count + '点/' + option.cell.rotation + '°/' + (option.cell.filled ? '实' : '空')
}

function sameCell(x: GraphicCell, y: GraphicCell): boolean {
  return x.count === y.count && x.rotation % 360 === y.rotation % 360 && x.filled === y.filled
}

/**
 * 生成 4 个数字选项：正确答案 + 3 个常见错误干扰项（多走/少走一步、
 * 用错公比/公差、±1 手滑），去重后乱序。
 * @param answerValue - 正确答案。
 * @param rule - 生成规则（决定干扰项形态）。
 * @param rng - 随机源。
 * @returns 4 个选项（含答案）。
 */
export function makeNumberOptions(answerValue: number, rule: SequenceRule, rng: () => number, prevTerm?: number): PatternOption[] {
  const b = rule.p[1] ?? 1
  const c = rule.p[2] ?? 0
  let candidates: number[]
  switch (rule.kind) {
    case 'arithmetic':
      candidates = [answerValue + b, answerValue - b, answerValue + 1]
      break
    case 'geometric':
      candidates = [answerValue * b, Math.round(answerValue / b), answerValue + 1]
      break
    case 'fibonacci':
      // 常见错误：多走一步（+ 前一项）、或 ±1 手滑。
      candidates = [answerValue + (prevTerm ?? 1), answerValue + 1, answerValue - 1]
      break
    case 'square': {
      const root = Math.round(Math.sqrt(answerValue))
      const nextDiff = 2 * root + 1
      candidates = [answerValue + nextDiff + 1, answerValue - nextDiff + 1, answerValue + 1]
      break
    }
    case 'alternating':
      candidates = [answerValue + b, answerValue - b, answerValue + 1]
      break
    case 'recursive':
      candidates = [b * answerValue + c, answerValue + 1, answerValue - 1]
      break
    default:
      candidates = [answerValue + 1, answerValue - 1, answerValue + b]
      break
  }
  const used = new Set<number>([answerValue])
  const distractors: number[] = []
  let bump = 2
  for (const cand of candidates) {
    if (distractors.length >= 3) break
    if (!Number.isFinite(cand) || used.has(cand)) continue
    used.add(cand)
    distractors.push(cand)
  }
  while (distractors.length < 3) {
    for (const delta of [bump, -bump]) {
      if (distractors.length >= 3) break
      const cand = answerValue + delta
      if (!used.has(cand)) {
        used.add(cand)
        distractors.push(cand)
      }
    }
    bump += 1
  }
  const answerOption: PatternOption = { kind: 'number', value: answerValue }
  const options: PatternOption[] = distractors.map((value) => ({ kind: 'number', value }))
  options.push(answerOption)
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = options[i]!
    options[i] = options[j]!
    options[j] = tmp
  }
  return options
}

/**
 * 由随机源确定性地生成一题。
 * @param rng - 随机源（每次调用推进，同 seed 同题目序列）。
 * @param level - 难度档 1-4。
 * @returns 生成的题目。
 */
export function generateQuestion(rng: () => number, level: number): PatternQuestion {
  const lv = Math.min(4, Math.max(1, level))
  const pool = LEVEL_KINDS[lv - 1]!
  const kind = pool[Math.floor(rng() * pool.length)]!
  if (kind === 'graphic') return generateGraphicQuestion(rng, lv)
  const shown = lv >= 3 ? 5 : 4
  let p: number[]
  switch (kind) {
    case 'arithmetic': {
      const a = 1 + Math.floor(rng() * (lv >= 3 ? 15 : 10))
      const mag = 2 + Math.floor(rng() * (lv === 4 ? 6 : 4))
      const b = lv === 4 && rng() < 0.4 ? -mag : mag
      p = [a, b]
      break
    }
    case 'geometric': {
      const a = 1 + Math.floor(rng() * 4)
      const b = 2 + Math.floor(rng() * 2)
      p = [a, b]
      break
    }
    case 'fibonacci': {
      const a = 1 + Math.floor(rng() * 3)
      const b = a + 1 + Math.floor(rng() * 5)
      p = [a, b]
      break
    }
    case 'square': {
      const a = 1 + Math.floor(rng() * 7)
      p = [a, 1]
      break
    }
    case 'alternating': {
      const b = 2 + Math.floor(rng() * 5)
      const a = 1 + Math.floor(rng() * 9)
      const c = a + 1 + Math.floor(rng() * 4)
      p = [a, b, c]
      break
    }
    default: {
      const a = 1 + Math.floor(rng() * 3)
      const b = 2
      const c = rng() < 0.5 ? 0 : 1 + Math.floor(rng() * 3)
      p = [a, b, c]
      break
    }
  }
  const rule: SequenceRule = { kind, p }
  const terms: number[] = []
  for (let i = 0; i < shown; i += 1) terms.push(computeTerm(rule, i))
  const answerValue = computeTerm(rule, shown)
  const options = makeNumberOptions(answerValue, rule, rng, terms[terms.length - 2])
  const answerOption = options.find((o) => o.kind === 'number' && o.value === answerValue)!
  return {
    level: lv,
    terms,
    cells: null,
    graphicRule: null,
    rule,
    answer: answerOption,
    options,
    explanation: explanationOf(rule, null),
  }
}

/**
 * 生成图形题：圆点数递增 / 方框旋转步进 / 填充交替，展示前 4 格。
 * @param rng - 随机源。
 * @param level - 难度档（入档文案用）。
 * @returns 生成的图形题。
 */
export function generateGraphicQuestion(rng: () => number, level: number): PatternQuestion {
  const rules: GraphicRule[] = ['grow', 'rotate', 'alternateFill']
  const graphicRule = rules[Math.floor(rng() * rules.length)]!
  const step = rng() < 0.5 ? 45 : 90
  const startCount = 1 + Math.floor(rng() * 3)
  const cells: GraphicCell[] = []
  for (let i = 0; i < 4; i += 1) {
    cells.push({
      count: graphicRule === 'grow' ? startCount + i : startCount,
      rotation: graphicRule === 'rotate' ? step * i : 0,
      filled: graphicRule === 'alternateFill' ? i % 2 === 0 : i % 2 === 0,
    })
  }
  const answerCell: GraphicCell = {
    count: graphicRule === 'grow' ? startCount + 4 : startCount,
    rotation: graphicRule === 'rotate' ? step * 4 : 0,
    filled: graphicRule === 'alternateFill' ? false : true,
  }
  // 干扰格：按规律各造一个典型错误格。
  const d1: GraphicCell = { ...answerCell, count: answerCell.count + 1 }
  const d2: GraphicCell = { ...answerCell, rotation: (answerCell.rotation + step) % 360 }
  const d3: GraphicCell = { ...answerCell, filled: !answerCell.filled, count: Math.max(1, answerCell.count - 1) }
  const cand: GraphicCell[] = [d1, d2, d3]
  const picked: GraphicCell[] = []
  for (const cell of cand) {
    if (picked.length >= 3) break
    if (sameCell(cell, answerCell)) continue
    if (picked.some((x) => sameCell(x, cell))) continue
    picked.push(cell)
  }
  let extra = 2
  while (picked.length < 3) {
    const cell: GraphicCell = { ...answerCell, count: answerCell.count + extra }
    if (!sameCell(cell, answerCell) && !picked.some((x) => sameCell(x, cell))) picked.push(cell)
    extra += 1
  }
  const answerOption: PatternOption = { kind: 'cell', cell: answerCell }
  const options: PatternOption[] = picked.map((cell) => ({ kind: 'cell', cell }))
  options.push(answerOption)
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = options[i]!
    options[i] = options[j]!
    options[j] = tmp
  }
  const rule: SequenceRule = { kind: 'graphic', p: [startCount, step] }
  return {
    level,
    terms: null,
    cells,
    graphicRule,
    rule,
    answer: answerOption,
    options,
    explanation: explanationOf(rule, graphicRule),
  }
}

/** 答对得分：基础 40 + 剩余时间比例 × 60（线性），两端夹紧。 */
export function scoreFor(remainingMs: number, timeLimitMs: number): number {
  const ratio = timeLimitMs <= 0 ? 0 : Math.min(1, Math.max(0, remainingMs / timeLimitMs))
  return SCORE_BASE + Math.round(SCORE_TIME_BONUS * ratio)
}

/**
 * 由种子构造开局（第 1 节第 1 题）。
 * @param seed - 随机种子。
 * @returns 游玩中的初始状态。
 */
export function createPatterniqState(seed: number): PatterniqState {
  const rng = mulberry32(seed)
  const state: PatterniqState = {
    phase: 'question',
    section: 1,
    questionIndex: 0,
    question: generateQuestion(rng, sectionLevel(1)),
    remainingMs: sectionTimeLimit(1),
    timeLimitMs: sectionTimeLimit(1),
    score: 0,
    chosenIndex: -1,
    lastOutcome: null,
    wrongCount: 0,
    wrongText: '',
    sectionWrong: [],
    totalCorrect: 0,
    questionsAsked: 0,
    rng,
  }
  return state
}

/** 结算本题：答对入分；答错过或超时则进本节错题本。 */
function settle(state: PatterniqState, outcome: 'correct' | 'timeout'): void {
  state.lastOutcome = outcome
  if (outcome === 'correct') {
    state.score += scoreFor(state.remainingMs, state.timeLimitMs)
    state.totalCorrect += 1
  } else {
    state.chosenIndex = -1
  }
  if (outcome === 'timeout' || state.wrongCount > 0) {
    state.sectionWrong = [...state.sectionWrong, { question: state.question, wrongText: state.wrongText }]
  }
  state.questionsAsked += 1
  state.phase = 'feedback'
}

/**
 * 推进限时：作答阶段倒计时，归零即按超时结算并展示解释。
 * @param state - 局面。
 * @param dtMs - 经过的毫秒数。
 */
export function tick(state: PatterniqState, dtMs: number): void {
  if (state.phase !== 'question') return
  state.remainingMs -= dtMs
  if (state.remainingMs <= 0) {
    state.remainingMs = 0
    if (state.wrongCount === 0) state.wrongText = '超时'
    settle(state, 'timeout')
  }
}

/**
 * 作答：答对按剩余时间线性计分进入反馈；答错扣 5 秒留在本题可重试
 * （扣到 0 直接连带超时结算），第一次错误文本记入错题本。
 * @param state - 局面。
 * @param optionIndex - 选项下标 0-3。
 * @returns 'correct' | 'wrong' | 'idle'（非作答阶段）。
 */
export function answer(state: PatterniqState, optionIndex: number): 'correct' | 'wrong' | 'idle' {
  if (state.phase !== 'question') return 'idle'
  const picked = state.question.options[optionIndex]
  if (picked === undefined) return 'idle'
  if (picked.kind === state.question.answer.kind
    && (picked.kind === 'number'
      ? picked.value === (state.question.answer as { kind: 'number'; value: number }).value
      : sameCell(picked.cell, (state.question.answer as { kind: 'cell'; cell: GraphicCell }).cell))) {
    state.chosenIndex = optionIndex
    settle(state, 'correct')
    return 'correct'
  }
  if (state.wrongCount === 0) state.wrongText = optionText(picked)
  // 等比递增扣时：第 n 次错扣 SCHEDULE[n-1]（越界取末位）。
  const penalty = WRONG_PENALTY_SCHEDULE_MS[Math.min(state.wrongCount, WRONG_PENALTY_SCHEDULE_MS.length - 1)]!
  state.wrongCount += 1
  state.remainingMs = Math.max(0, state.remainingMs - penalty)
  if (state.remainingMs <= 0) {
    settle(state, 'timeout')
    return 'wrong'
  }
  return 'wrong'
}

/**
 * 空格推进：反馈 → 下一题；第 10 题反馈 → 节末小结；小结 → 下一节
 * （第 5 节小结 → 全部结束）。结束阶段为空操作。
 * @param state - 局面。
 */
export function nextQuestion(state: PatterniqState): void {
  if (state.phase === 'feedback') {
    state.questionIndex += 1
    if (state.questionIndex >= QUESTIONS_PER_SECTION) {
      state.phase = 'summary'
      return
    }
    startQuestion(state)
    return
  }
  if (state.phase === 'summary') {
    state.section += 1
    if (state.section > SECTIONS) {
      state.phase = 'end'
      return
    }
    state.questionIndex = 0
    state.sectionWrong = []
    startQuestion(state)
  }
}

/** 载入当前节当前题（重置限时与作答状态）。 */
function startQuestion(state: PatterniqState): void {
  state.question = generateQuestion(state.rng, sectionLevel(state.section))
  state.timeLimitMs = sectionTimeLimit(state.section)
  state.remainingMs = state.timeLimitMs
  state.chosenIndex = -1
  state.lastOutcome = null
  state.wrongCount = 0
  state.wrongText = ''
  state.phase = 'question'
}
