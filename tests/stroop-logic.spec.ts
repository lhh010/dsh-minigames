import { describe, expect, it } from 'vitest'
import {
  BASE_SCORE, COLOR_COUNT, COMBO_BONUS, MAX_LIVES, MIN_TIME_MS, START_CONGRUENT, END_CONGRUENT,
  START_TIME_MS, TOTAL_ROUNDS,
  answer, congruentChance, createStroopState, difficultyLevel, mulberry32, roundTimeLimit, tick,
} from '../src/client/games/stroop/logic.ts'

/** 一局全对的重放：始终按墨色作答。 */
function answerAll(state: ReturnType<typeof createStroopState>): void {
  while (state.phase === 'prompt') {
    expect(answer(state, state.ink)).toBe('correct')
  }
}

describe('stroop logic', () => {
  it('同一 seed 生成完全一致的词序 + 墨色序列，且取值合法', () => {
    const a = createStroopState(mulberry32(123))
    const b = createStroopState(mulberry32(123))
    const cards: Array<[number, number]> = []
    for (let i = 0; i < TOTAL_ROUNDS; i += 1) {
      cards.push([a.word, a.ink])
      answer(a, a.ink)
    }
    for (const [word, ink] of cards) {
      expect(b.word).toBe(word)
      expect(b.ink).toBe(ink)
      expect(word).toBeGreaterThanOrEqual(0)
      expect(word).toBeLessThan(COLOR_COUNT)
      expect(ink).toBeGreaterThanOrEqual(0)
      expect(ink).toBeLessThan(COLOR_COUNT)
      answer(b, b.ink)
    }
    expect(a.phase).toBe('won')
    expect(b.phase).toBe('won')
    expect(a.score).toBe(b.score)
  })

  it('限时从 2000ms 线性收紧到 900ms 并在两端夹紧', () => {
    expect(roundTimeLimit(0)).toBe(START_TIME_MS)
    expect(roundTimeLimit(TOTAL_ROUNDS - 1)).toBe(MIN_TIME_MS)
    expect(roundTimeLimit(-3)).toBe(START_TIME_MS)
    expect(roundTimeLimit(99)).toBe(MIN_TIME_MS)
    for (let r = 0; r < TOTAL_ROUNDS - 1; r += 1) {
      expect(roundTimeLimit(r)).toBeGreaterThan(roundTimeLimit(r + 1))
    }
    // 新卡片的剩余时间即该轮限时。
    const state = createStroopState(mulberry32(1))
    expect(state.remainingMs).toBe(START_TIME_MS)
  })

  it('一致率从 50% 线性降到 10%，难度档位 1-3 递进', () => {
    expect(congruentChance(0)).toBeCloseTo(START_CONGRUENT)
    expect(congruentChance(TOTAL_ROUNDS - 1)).toBeCloseTo(END_CONGRUENT)
    for (let r = 0; r < TOTAL_ROUNDS - 1; r += 1) {
      expect(congruentChance(r)).toBeGreaterThan(congruentChance(r + 1))
    }
    expect(difficultyLevel(0)).toBe(1)
    expect(difficultyLevel(10)).toBe(2)
    expect(difficultyLevel(19)).toBe(3)
  })

  it('按墨色答对得分并累积连击加成；按字义误答即答错', () => {
    const state = createStroopState(mulberry32(7))
    // 推进到一张冲突卡（字义 != 墨色），途中的一致卡按墨色答对也计连击。
    while (state.word === state.ink) answer(state, state.ink)
    const comboBefore = state.combo
    const scoreBefore = state.score
    expect(answer(state, state.ink)).toBe('correct')
    expect(state.combo).toBe(comboBefore + 1)
    expect(state.score).toBe(scoreBefore + BASE_SCORE + comboBefore * COMBO_BONUS)
    // 连击中再答对：基础分 + 当前连击层数的加成。
    const prev = state.score
    while (state.word === state.ink) answer(state, state.ink)
    const combo2 = state.combo
    answer(state, state.ink)
    expect(state.score).toBe(prev + BASE_SCORE + combo2 * COMBO_BONUS)
    expect(state.bestCombo).toBe(state.combo)
  })

  it('答错扣 1 命、清连击并进入下一轮；冲突卡按字义答必然算错', () => {
    const state = createStroopState(mulberry32(42))
    while (state.word === state.ink) answer(state, state.ink)
    const roundBefore = state.round
    expect(answer(state, state.word)).toBe('wrong') // 字义 != 墨色
    expect(state.lives).toBe(MAX_LIVES - 1)
    expect(state.combo).toBe(0)
    expect(state.phase).toBe('prompt')
    expect(state.round).toBe(roundBefore + 1)
  })

  it('超时由 tick 驱动：扣命并换下一张卡，时间未到不受影响', () => {
    const state = createStroopState(mulberry32(9))
    expect(tick(state, 100)).toBe('ok')
    expect(state.remainingMs).toBe(START_TIME_MS - 100)
    expect(tick(state, START_TIME_MS)).toBe('timeout')
    expect(state.lives).toBe(MAX_LIVES - 1)
    expect(state.phase).toBe('prompt')
    expect(state.remainingMs).toBe(roundTimeLimit(1)) // 换成了第 2 轮的限时
  })

  it('3 命耗尽后结束，此后作答与 tick 均被忽略', () => {
    const state = createStroopState(mulberry32(5))
    for (let i = 0; i < MAX_LIVES; i += 1) {
      while (state.word === state.ink) answer(state, state.ink)
      expect(answer(state, state.word)).toBe('wrong')
    }
    expect(state.phase).toBe('over')
    expect(state.lives).toBe(0)
    expect(answer(state, state.ink)).toBe('ignored')
    expect(tick(state, 99999)).toBe('ok')
  })

  it('20 轮全部答对即通关，总分符合连击公式', () => {
    const state = createStroopState(mulberry32(2024))
    answerAll(state)
    expect(state.phase).toBe('won')
    expect(state.round).toBe(TOTAL_ROUNDS)
    expect(state.lives).toBe(MAX_LIVES)
    expect(state.bestCombo).toBe(TOTAL_ROUNDS)
    // sum_{n=0..19} (100 + 20n)
    expect(state.score).toBe(TOTAL_ROUNDS * BASE_SCORE + COMBO_BONUS * ((TOTAL_ROUNDS * (TOTAL_ROUNDS - 1)) / 2))
  })

  it('不同 seed 产生不同卡片序列（避免 seed 被静默忽略）', () => {
    const a = createStroopState(mulberry32(1))
    const b = createStroopState(mulberry32(2))
    const aCards: number[] = []
    const bCards: number[] = []
    for (let i = 0; i < TOTAL_ROUNDS; i += 1) {
      aCards.push(a.word * 10 + a.ink)
      bCards.push(b.word * 10 + b.ink)
      answer(a, a.ink)
      answer(b, b.ink)
    }
    expect(aCards).not.toEqual(bCards)
  })
})
