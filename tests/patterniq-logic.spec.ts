import { describe, expect, it } from 'vitest'
import {
  LEVEL_KINDS, QUESTIONS_PER_SECTION, SCORE_BASE, SCORE_TIME_BONUS, SECTIONS,
  WRONG_PENALTY_SCHEDULE_MS, answer, computeTerm, createPatterniqState, explanationOf,
  generateQuestion, makeNumberOptions, mulberry32, nextQuestion, optionText,
  scoreFor, sectionLevel, sectionTimeLimit, tick,
  type PatternOption, type PatterniqState,
} from '../src/client/games/patterniq/logic.ts'

/** 走完一局：全对则按答案作答，否则全选固定错误项推动超时结算。 */
function playAllCorrect(state: PatterniqState): void {
  let guard = 0
  while (state.phase !== 'end' && guard < 500) {
    guard += 1
    if (state.phase === 'question') {
      const idx = state.question.options.findIndex((o) => o === state.question.answer
        || (o.kind === 'number' && state.question.answer.kind === 'number' && o.value === state.question.answer.value))
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(answer(state, idx)).toBe('correct')
      expect(state.phase).toBe('feedback')
    } else {
      nextQuestion(state)
    }
  }
}

describe('patterniq logic', () => {
  it('同一 seed 完整重放：50 题的模板、展示项、选项、解释逐一相同', () => {
    const a = createPatterniqState(20260419)
    const b = createPatterniqState(20260419)
    playAllCorrect(a)
    playAllCorrect(b)
    expect(a.score).toBe(b.score)
    expect(a.totalCorrect).toBe(b.totalCorrect)
    expect(a.questionsAsked).toBe(b.questionsAsked)
    expect(a.totalCorrect).toBe(QUESTIONS_PER_SECTION * SECTIONS)
    // 再抽 3 个 seed 验证题目序列确定。
    for (const seed of [1, 42, 999]) {
      const s1 = createPatterniqState(seed)
      const s2 = createPatterniqState(seed)
      const snap = (): string => JSON.stringify([s1.question.terms, s1.question.options, s1.question.explanation])
      for (let i = 0; i < 12; i += 1) {
        expect(snap()).toBe(JSON.stringify([s2.question.terms, s2.question.options, s2.question.explanation]))
        const pick = (s: PatterniqState): number => s.question.options.indexOf(s.question.answer)
        answer(s1, pick(s1))
        answer(s2, pick(s2))
        nextQuestion(s1)
        nextQuestion(s2)
      }
    }
  })

  it('模板计算正确：各 kind 的展示项与答案都等于 computeTerm 的展开', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 400; i += 1) {
      const level = 1 + (i % 4)
      const q = generateQuestion(rng, level)
      if (q.terms === null) continue
      expect(q.terms.length).toBeGreaterThanOrEqual(4)
      for (let k = 0; k < q.terms.length; k += 1) {
        expect(q.terms[k]).toBe(computeTerm(q.rule, k))
      }
      if (q.answer.kind === 'number') {
        expect(q.answer.value).toBe(computeTerm(q.rule, q.terms.length))
      }
    }
  })

  it('难度分级：L1 只有等差/平方；档位只升不降且池子按 LEVEL_KINDS 收敛', () => {
    expect(sectionLevel(1)).toBe(1)
    expect(sectionLevel(3)).toBe(3)
    expect(sectionLevel(4)).toBe(4)
    expect(sectionLevel(5)).toBe(4)
    const rng = mulberry32(11)
    for (let i = 0; i < 200; i += 1) {
      const q = generateQuestion(rng, 1)
      expect(LEVEL_KINDS[0]).toContain(q.rule.kind)
      expect(q.level).toBe(1)
      const q4 = generateQuestion(rng, 4)
      expect(LEVEL_KINDS[3]).toContain(q4.rule.kind)
      expect(q4.level).toBe(4)
    }
    // L3/L4 展示 5 项（数字题）。
    for (let i = 0; i < 120; i += 1) {
      const q = generateQuestion(rng, 3 + (i % 2))
      if (q.terms !== null) expect(q.terms.length).toBe(5)
    }
  })

  it('选项干扰项：4 个唯一选项含答案，且是常见错误形态（多走一步/±1/用错公比）', () => {
    // 等差：answer=19, d=4 → 干扰 {23, 15, 20}。
    const opts = makeNumberOptions(19, { kind: 'arithmetic', p: [3, 4] }, mulberry32(5))
    expect(opts).toHaveLength(4)
    const values = opts.map((o) => (o.kind === 'number' ? o.value : NaN)).sort((x, y) => x - y)
    expect(values).toEqual([15, 19, 20, 23])
    // 等比：answer=81, r=3 → 干扰 {243, 27, 82}。
    const geo = makeNumberOptions(81, { kind: 'geometric', p: [1, 3] }, mulberry32(5))
    expect(geo.map((o) => (o.kind === 'number' ? o.value : NaN)).sort((x, y) => x - y)).toEqual([27, 81, 82, 243])
    // 大批量：唯一性 + 含答案。
    const rng = mulberry32(13)
    for (let i = 0; i < 300; i += 1) {
      const level = 1 + (i % 4)
      const q = generateQuestion(rng, level)
      expect(q.options).toHaveLength(4)
      expect(q.options).toContain(q.answer)
      const texts = new Set(q.options.map((o) => optionText(o)))
      expect(texts.size).toBe(4)
    }
  })

  it('计分线性：满剩余时间得基础+满分加成，零剩余得基础分，单调递增', () => {
    expect(scoreFor(20000, 20000)).toBe(SCORE_BASE + SCORE_TIME_BONUS)
    expect(scoreFor(0, 20000)).toBe(SCORE_BASE)
    expect(scoreFor(25000, 20000)).toBe(SCORE_BASE + SCORE_TIME_BONUS)
    expect(scoreFor(-5, 20000)).toBe(SCORE_BASE)
    for (let r = 0; r < 20000; r += 500) {
      expect(scoreFor(r + 500, 20000)).toBeGreaterThanOrEqual(scoreFor(r, 20000))
    }
    // 实战：立刻答对得分高于磨蹭到底。
    const fast = createPatterniqState(3)
    const slow = createPatterniqState(3)
    const pick = (s: PatterniqState): number => s.question.options.indexOf(s.question.answer)
    answer(fast, pick(fast))
    tick(slow, 19000)
    const before = slow.score
    if (slow.phase === 'question') answer(slow, pick(slow))
    expect(fast.score).toBeGreaterThan(slow.score - before + 0)
    expect(fast.score).toBe(SCORE_BASE + SCORE_TIME_BONUS)
  })

  it('答对：立刻进入反馈、计分；答案可从选项中命中', () => {
    const state = createPatterniqState(21)
    const idx = state.question.options.indexOf(state.question.answer)
    expect(answer(state, idx)).toBe('correct')
    expect(state.phase).toBe('feedback')
    expect(state.lastOutcome).toBe('correct')
    expect(state.score).toBeGreaterThanOrEqual(SCORE_BASE)
    expect(state.chosenIndex).toBe(idx)
    expect(state.sectionWrong).toHaveLength(0)
  })

  it('答错：等比递增扣时（4s/8s/16s）、留在本题可重试，第一次错误文本记入错题本', () => {
    const state = createPatterniqState(21)
    const limit = state.timeLimitMs
    const right = state.question.options.indexOf(state.question.answer)
    const wrongIdx = (right + 1) % 4
    const wrongText = optionText(state.question.options[wrongIdx] as PatternOption)
    expect(answer(state, wrongIdx)).toBe('wrong')
    expect(state.phase).toBe('question')
    expect(state.remainingMs).toBe(limit - WRONG_PENALTY_SCHEDULE_MS[0]!)
    expect(state.wrongCount).toBe(1)
    // 第二次错扣 8s（等比 ×2）——三选项穷举共扣 28s 必超时。
    expect(answer(state, (right + 2) % 4)).toBe('wrong')
    expect(state.remainingMs).toBe(limit - WRONG_PENALTY_SCHEDULE_MS[0]! - WRONG_PENALTY_SCHEDULE_MS[1]!)
    expect(state.wrongCount).toBe(2)
    expect(state.wrongText).toBe(wrongText)
    // 重试答对：仍计分但题目入错题本（错过一次）。
    expect(answer(state, right)).toBe('correct')
    expect(state.phase).toBe('feedback')
    expect(state.sectionWrong).toHaveLength(1)
    expect(state.sectionWrong[0]?.wrongText).toBe(wrongText)
  })

  it('限时：倒计时归零按超时结算并展示解释；feedback 阶段不再倒计时', () => {
    const state = createPatterniqState(21)
    tick(state, state.remainingMs - 1)
    expect(state.phase).toBe('question')
    tick(state, 10)
    expect(state.phase).toBe('feedback')
    expect(state.lastOutcome).toBe('timeout')
    expect(state.remainingMs).toBe(0)
    expect(state.score).toBe(0)
    expect(state.sectionWrong).toHaveLength(1)
    expect(state.sectionWrong[0]?.wrongText).toBe('超时')
    const asked = state.questionsAsked
    tick(state, 5000)
    expect(state.questionsAsked).toBe(asked)
    expect(state.phase).toBe('feedback')
  })

  it('节流转：10 题入小结 → 下一节限时收紧难度升 → 5 节后结束', () => {
    expect(sectionTimeLimit(1)).toBe(20000)
    expect(sectionTimeLimit(5)).toBe(12000)
    expect(sectionTimeLimit(3)).toBe(16000)
    for (let s = 1; s < 5; s += 1) expect(sectionTimeLimit(s)).toBeGreaterThan(sectionTimeLimit(s + 1))
    const state = createPatterniqState(88)
    for (let section = 1; section <= SECTIONS; section += 1) {
      expect(state.section).toBe(section)
      expect(state.timeLimitMs).toBe(sectionTimeLimit(section))
      for (let i = 0; i < QUESTIONS_PER_SECTION; i += 1) {
        // 全靠超时结算推进（同时验证错题本累计 10 条）。
        while (state.phase === 'question') tick(state, state.remainingMs + 1)
        expect(state.phase).toBe('feedback')
        nextQuestion(state)
      }
      expect(state.phase).toBe('summary')
      expect(state.sectionWrong).toHaveLength(QUESTIONS_PER_SECTION)
      nextQuestion(state)
    }
    expect(state.phase).toBe('end')
    expect(state.score).toBe(0)
    expect(state.totalCorrect).toBe(0)
    expect(state.questionsAsked).toBe(QUESTIONS_PER_SECTION * SECTIONS)
  })

  it('规律解释正确性：每种模板的解释文案与参数一致', () => {
    expect(explanationOf({ kind: 'arithmetic', p: [2, 5] }, null)).toBe('等差数列，公差 5')
    expect(explanationOf({ kind: 'geometric', p: [2, 3] }, null)).toBe('等比数列，公比 3')
    expect(explanationOf({ kind: 'fibonacci', p: [1, 1] }, null)).toContain('前两项之和')
    expect(explanationOf({ kind: 'square', p: [3, 1] }, null)).toContain('3²')
    expect(explanationOf({ kind: 'alternating', p: [2, 4, 9] }, null)).toContain('公差 4')
    expect(explanationOf({ kind: 'recursive', p: [1, 2, 3] }, null)).toBe('递推数列：每项 = 2×前项 + 3')
    expect(explanationOf({ kind: 'recursive', p: [1, 2, 0] }, null)).not.toContain('+ 0')
    expect(explanationOf({ kind: 'graphic', p: [2, 45] }, 'rotate')).toBe('图形规律：方框每次旋转 45°')
    expect(explanationOf({ kind: 'graphic', p: [2, 45] }, 'grow')).toBe('图形规律：圆点数每次 +1')
    expect(explanationOf({ kind: 'graphic', p: [2, 45] }, 'alternateFill')).toBe('图形规律：填充色逐格交替')
  })

  it('图形题：格子按规律推进，答案格是序列下一格且选项唯一', () => {
    const rng = mulberry32(2026)
    let graphicCount = 0
    for (let i = 0; i < 600; i += 1) {
      const q = generateQuestion(rng, 2 + (i % 3))
      if (q.cells === null) continue
      graphicCount += 1
      expect(q.graphicRule).not.toBeNull()
      expect(q.cells).toHaveLength(4)
      expect(q.answer.kind).toBe('cell')
      const cells = q.cells as { count: number; rotation: number; filled: boolean }[]
      if (q.graphicRule === 'grow') {
        for (let k = 1; k < 4; k += 1) expect(cells[k]!.count).toBe(cells[k - 1]!.count + 1)
      } else if (q.graphicRule === 'rotate') {
        const step = (cells[1]!.rotation - cells[0]!.rotation + 360) % 360
        expect(step).toBeGreaterThan(0)
        for (let k = 1; k < 4; k += 1) expect((cells[k]!.rotation - cells[k - 1]!.rotation + 360) % 360).toBe(step)
      } else {
        for (let k = 0; k < 4; k += 1) expect(cells[k]!.filled).toBe(k % 2 === 0)
      }
    }
    expect(graphicCount).toBeGreaterThan(20)
  })
})
