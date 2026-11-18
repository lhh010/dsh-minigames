import { describe, expect, it } from 'vitest'
import {
  FLAG_BANK, OPTION_COUNT, QUESTION_TIME_MS, QUESTIONS_PER_ROUND, TOTAL_ROUNDS,
  answer, createFlagsState, generateQuestion, mulberry32, next, scoreFor, tick,
  type FlagsState,
} from '../src/client/games/flags/logic.ts'

/** 用注入 seed 建一局。 */
function makeState(seed: number): FlagsState {
  return createFlagsState(mulberry32(seed))
}

/** 一局全自动打完：correctAt(i) 决定第 i 题（0 基）答对还是答错。 */
function playFull(state: FlagsState, correctAt: (i: number) => boolean): void {
  let i = 0
  while (state.phase !== 'over') {
    if (state.phase === 'question') {
      const pos = correctAt(i) ? state.question.answerPos : (state.question.answerPos + 1) % OPTION_COUNT
      answer(state, pos)
      i += 1
    } else {
      next(state)
    }
  }
}

describe('flags logic', () => {
  it('题库结构完整：四字段非空、emoji/国名唯一、五大洲齐备', () => {
    expect(FLAG_BANK.length).toBeGreaterThanOrEqual(60)
    const emojis = new Set<string>()
    const names = new Set<string>()
    const continents = new Set<string>()
    for (const e of FLAG_BANK) {
      expect(e.emoji.length).toBeGreaterThan(3)
      expect(e.name.length).toBeGreaterThan(0)
      expect(e.fact.length).toBeGreaterThan(3)
      continents.add(e.continent)
      emojis.add(e.emoji)
      names.add(e.name)
    }
    expect(emojis.size).toBe(FLAG_BANK.length)
    expect(names.size).toBe(FLAG_BANK.length)
    expect(continents).toEqual(new Set(['亚洲', '欧洲', '非洲', '美洲', '大洋洲']))
    const byContinent = new Map<string, number>()
    for (const e of FLAG_BANK) byContinent.set(e.continent, (byContinent.get(e.continent) ?? 0) + 1)
    expect(byContinent.get('欧洲')).toBeGreaterThanOrEqual(20)
    expect(byContinent.get('亚洲')).toBeGreaterThanOrEqual(15)
    for (const c of ['非洲', '美洲', '大洋洲']) {
      expect(byContinent.get(c)).toBeGreaterThanOrEqual(4)
    }
  })

  it('出题确定性：同一 seed 序列完全一致，不同 seed 题面可不同', () => {
    const a: unknown[] = []
    const b: unknown[] = []
    for (let q = 0; q < 12; q += 1) {
      a.push(generateQuestion(mulberry32(42), q, []))
      b.push(generateQuestion(mulberry32(42), q, []))
    }
    expect(a).toEqual(b)
    const s1 = makeState(42)
    const s2 = makeState(42)
    expect(s1.question).toEqual(s2.question)
    let differs = false
    for (let seed = 43; seed < 60 && !differs; seed += 1) {
      if (JSON.stringify(makeState(seed).question) !== JSON.stringify(s1.question)) differs = true
    }
    expect(differs).toBe(true)
  })

  it('题型按题号轮换、选项四项无重复、答案必在选项中', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const rng = mulberry32(seed)
      for (let q = 0; q < 6; q += 1) {
        const question = generateQuestion(rng, q, [])
        expect(question.kind).toBe(q % 2 === 0 ? 'flag-to-name' : 'name-to-flag')
        expect(question.options).toHaveLength(OPTION_COUNT)
        expect(new Set(question.options).size).toBe(OPTION_COUNT)
        expect(question.options[question.answerPos]).toBe(question.promptIndex)
      }
    }
  })

  it('干扰项优先同易混组、其次同洲', () => {
    // cross 组（北欧十字 + 瑞士）与 tricolor 组各 6 面：组内充足（≥5 个
    // 候选）时，题面带组的题三个干扰项必须全部来自同组。
    let grouped = 0
    for (let seed = 1; seed <= 60; seed += 1) {
      const question = generateQuestion(mulberry32(seed), seed % 2, [])
      const prompt = FLAG_BANK[question.promptIndex]
      if (prompt === undefined || prompt.group === undefined) continue
      grouped += 1
      for (const idx of question.options) {
        if (idx !== question.promptIndex) expect(FLAG_BANK[idx]?.group).toBe(prompt.group)
      }
    }
    expect(grouped).toBeGreaterThanOrEqual(5)
    // 无组或组内不足时兜底同洲：五大洲条目均 ≥4，每题至少一个干扰项
    // 来自与题面相同的大洲。
    const rng = mulberry32(99)
    for (let q = 0; q < 20; q += 1) {
      const question = generateQuestion(rng, q, [])
      const prompt = FLAG_BANK[question.promptIndex]
      const sameContinent = question.options.filter(idx => idx !== question.promptIndex && FLAG_BANK[idx]?.continent === prompt?.continent)
      expect(sameContinent.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('计分线性：剩秒×10 加连击加成', () => {
    expect(scoreFor(QUESTION_TIME_MS, 0)).toBe(100)
    expect(scoreFor(9500, 0)).toBe(100)
    expect(scoreFor(9000, 0)).toBe(90)
    expect(scoreFor(5500, 0)).toBe(60)
    expect(scoreFor(1, 0)).toBe(10)
    expect(scoreFor(0, 0)).toBe(0)
    expect(scoreFor(QUESTION_TIME_MS, 3)).toBe(115)
    expect(scoreFor(5000, 4)).toBe(70)
  })

  it('对错判定与连击：答对加分连击、答错清零记错题、越界/阶段外忽略', () => {
    const state = makeState(5)
    // 满秒答对：100 分 + 0 加成。
    expect(answer(state, state.question.answerPos)).toBe('correct')
    expect(state.score).toBe(100)
    expect(state.combo).toBe(1)
    expect(state.phase).toBe('feedback')
    // feedback 阶段再作答被忽略。
    expect(answer(state, 0)).toBe('ignored')
    next(state)
    // 错答：不扣分、清连击、记错题。
    const wrongCount = state.wrongs.length
    const wrongPos = (state.question.answerPos + 1) % OPTION_COUNT
    state.remainingMs = 4000
    expect(answer(state, wrongPos)).toBe('wrong')
    expect(state.combo).toBe(0)
    expect(state.score).toBe(100)
    expect(state.wrongs).toHaveLength(wrongCount + 1)
    expect(state.wrongs[state.wrongs.length - 1]?.chosenIndex).toBe(state.question.options[wrongPos])
    // 越界位次忽略。
    next(state)
    expect(answer(state, 9)).toBe('ignored')
    expect(answer(state, -1)).toBe('ignored')
  })

  it('倒计时推进与超时：超时记错题且 chosen 为 null', () => {
    const state = makeState(11)
    expect(tick(state, 3000)).toBe('ok')
    expect(state.remainingMs).toBe(QUESTION_TIME_MS - 3000)
    expect(tick(state, 0)).toBe('ok')
    expect(tick(state, 99999)).toBe('timeout')
    expect(state.phase).toBe('feedback')
    expect(state.combo).toBe(0)
    expect(state.remainingMs).toBe(0)
    expect(state.wrongs).toHaveLength(1)
    expect(state.wrongs[0]?.chosenIndex).toBeNull()
    expect(state.wrongs[0]?.promptIndex).toBe(state.question.promptIndex)
    // 非答题阶段 tick 无副作用。
    expect(tick(state, 500)).toBe('ok')
    expect(state.remainingMs).toBe(0)
  })

  it('连击累积与最高连击统计', () => {
    const state = makeState(20)
    for (let i = 0; i < 4; i += 1) {
      answer(state, state.question.answerPos)
      next(state)
    }
    expect(state.combo).toBe(4)
    expect(state.bestCombo).toBe(4)
    answer(state, (state.question.answerPos + 2) % OPTION_COUNT)
    expect(state.combo).toBe(0)
    expect(state.bestCombo).toBe(4)
  })

  it('节/轮转：10 题一节、3 节共 30 题、节末回顾、打满结束', () => {
    const state = makeState(33)
    let questions = 0
    let reviews = 0
    while (state.phase !== 'over') {
      if (state.phase === 'question') {
        answer(state, state.question.answerPos)
        questions += 1
        expect(state.indexInRound).toBeLessThan(QUESTIONS_PER_ROUND)
      } else if (state.phase === 'feedback') {
        next(state)
        const became: string = state.phase
        if (became === 'review') {
          reviews += 1
          expect(state.wrongs).toHaveLength(0)
        }
      } else if (state.phase === 'review') {
        next(state)
      }
    }
    expect(questions).toBe(QUESTIONS_PER_ROUND * TOTAL_ROUNDS)
    expect(reviews).toBe(TOTAL_ROUNDS)
    expect(next(state)).toBe('ignored')
  })

  it('一局内题面不重复', () => {
    const state = makeState(77)
    const prompts: number[] = []
    while (state.phase !== 'over') {
      if (state.phase === 'question') {
        prompts.push(state.question.promptIndex)
        answer(state, state.question.answerPos)
      } else {
        next(state)
      }
    }
    expect(prompts).toHaveLength(QUESTIONS_PER_ROUND * TOTAL_ROUNDS)
    expect(new Set(prompts).size).toBe(prompts.length)
  })

  it('错题收集与重放：同 seed 同答题序列结果完全一致', () => {
    const run = (): { score: number; wrongs: unknown; best: number } => {
      const state = makeState(123)
      playFull(state, i => i % 3 !== 2)
      expect(state.phase).toBe('over')
      return { score: state.score, wrongs: state.wrongs, best: state.bestCombo }
    }
    expect(run()).toEqual(run())
    const state = makeState(123)
    playFull(state, () => false)
    expect(state.wrongs).toHaveLength(QUESTIONS_PER_ROUND * TOTAL_ROUNDS)
    expect(state.score).toBe(0)
  })
})
