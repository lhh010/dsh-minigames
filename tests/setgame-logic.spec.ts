import { describe, expect, it } from 'vitest'
import {
  ATTR_COUNT, BASE_SET_SCORE, CARD_COUNT, SPEED_BONUS_MAX, TABLE_MAX, TABLE_MIN,
  TUTOR_MS, WRONG_PENALTY_MS, cardAt, colorOf, countOf, createSetGameState,
  ensurePlayable, fillOf, findSet, fullDeck, harvestReplay, isSet, levelTimeMs,
  mulberry32, selectCard, shapeOf, shuffledDeck, targetSets, tick, tutorActive,
  tutorSet,
} from '../src/client/games/setgame/logic.ts'

/** 从状态里按牌面找到某张牌的桌面下标。 */
function indexOfCard(state: ReturnType<typeof createSetGameState>, card: number): number {
  return state.table.indexOf(card)
}

/** 构造一个桌面无集合的状态：移除所有集合中的牌直至无集合。 */
function stripToNoSet(state: ReturnType<typeof createSetGameState>): void {
  let set = findSet(state.table)
  while (set !== null) {
    state.table.splice(set[2]!, 1)
    set = findSet(state.table)
  }
}

describe('setgame logic', () => {
  it('enumerates the full 81-card space with every attribute combination exactly once', () => {
    const deck = fullDeck()
    expect(deck).toHaveLength(CARD_COUNT)
    expect(new Set(deck).size).toBe(CARD_COUNT)
    const seen = new Set<string>()
    for (const card of deck) {
      const key = [colorOf(card), shapeOf(card), countOf(card), fillOf(card)].join(',')
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      expect([colorOf(card), shapeOf(card), countOf(card), fillOf(card)].every((v) => v >= 0 && v <= 2)).toBe(true)
    }
    expect(seen.size).toBe(CARD_COUNT)
    // 编码往返：cardAt 与四个取值函数互逆。
    for (let c = 0; c < 3; c += 1) {
      for (let s = 0; s < 3; s += 1) {
        for (let n = 0; n < 3; n += 1) {
          for (let f = 0; f < 3; f += 1) {
            const card = cardAt(c, s, n, f)
            expect([colorOf(card), shapeOf(card), countOf(card), fillOf(card)]).toEqual([c, s, n, f])
          }
        }
      }
    }
    void ATTR_COUNT
  })

  it('shuffles a seeded deck deterministically with no duplicates across deck and table', () => {
    const a = shuffledDeck(mulberry32(42))
    const b = shuffledDeck(mulberry32(42))
    expect(a).toEqual(b)
    expect(a).not.toEqual(fullDeck())
    const state = createSetGameState(mulberry32(42))
    expect(new Set([...state.deck, ...state.table]).size).toBe(CARD_COUNT)
    expect(state.table.length).toBeGreaterThanOrEqual(TABLE_MIN)
    expect(state.deck.length).toBe(CARD_COUNT - state.table.length)
  })

  it('validates sets attribute-by-attribute (all same or all different)', () => {
    // 全同颜色、其余属性逐个全不同 → 集合。
    const redDiamond = cardAt(0, 0, 0, 0)
    const redOvalTwoStriped = cardAt(0, 1, 1, 2)
    const redSquiggleThreeOpen = cardAt(0, 2, 2, 1)
    expect(isSet(redDiamond, redOvalTwoStriped, redSquiggleThreeOpen)).toBe(true)
    // 全部四个属性都不同 → 集合。
    expect(isSet(cardAt(0, 0, 0, 0), cardAt(1, 1, 1, 1), cardAt(2, 2, 2, 2))).toBe(true)
    // 某属性两同一异 → 非集合。
    expect(isSet(cardAt(0, 0, 0, 0), cardAt(1, 1, 1, 1), cardAt(2, 2, 2, 0))).toBe(false)
    // 重复牌不是集合。
    expect(isSet(redDiamond, redDiamond, redOvalTwoStriped)).toBe(false)
  })

  it('deals an opening table that always contains at least one set', () => {
    for (const seed of [1, 7, 99, 2024, 31337]) {
      const state = createSetGameState(mulberry32(seed))
      expect(state.phase).toBe('playing')
      expect(findSet(state.table)).not.toBeNull()
    }
  })

  it('awards a set, removes the cards, refills the table and counts progress', () => {
    const state = createSetGameState(mulberry32(5))
    const set = findSet(state.table)!
    expect(set).not.toBeNull()
    const cards = set.map((i) => state.table[i]!)
    const deckBefore = state.deck.length
    expect(selectCard(state, set[0])).toBe('selected')
    expect(selectCard(state, set[1])).toBe('selected')
    // 已选可再点取消。
    expect(selectCard(state, set[1])).toBe('deselected')
    expect(selectCard(state, set[1])).toBe('selected')
    expect(selectCard(state, set[2])).toBe('set')
    expect(state.selected).toHaveLength(0)
    expect(state.setsFound).toBe(1)
    expect(state.score).toBe(BASE_SET_SCORE) // 0 秒内收割：满速度加成
    for (const card of cards) expect(indexOfCard(state, card)).toBe(-1)
    expect(state.table.length).toBeGreaterThanOrEqual(TABLE_MIN)
    expect(state.deck.length).toBeLessThanOrEqual(deckBefore)
  })

  it('penalizes a wrong selection by 3 seconds in timed mode only', () => {
    const timed = createSetGameState(mulberry32(11))
    const before = timed.timeLeftMs
    // 凑三张非集合：任选一张 + findSet 的两张 + 一张未在集合中的牌。
    const set = findSet(timed.table)!
    const odd = timed.table.findIndex((_, i) => !set.includes(i))
    expect(selectCard(timed, set[0])).toBe('selected')
    expect(selectCard(timed, odd)).toBe('selected')
    expect(selectCard(timed, set[1])).toBe('wrong')
    expect(timed.timeLeftMs).toBe(before - WRONG_PENALTY_MS)
    expect(timed.table.length).toBeGreaterThan(0) // 判错不移牌
    expect(timed.selected).toHaveLength(0)
    const practice = createSetGameState(mulberry32(11), true)
    const t2 = practice.timeLeftMs
    const s2 = findSet(practice.table)!
    const odd2 = practice.table.findIndex((_, i) => !s2.includes(i))
    selectCard(practice, s2[0]!)
    selectCard(practice, odd2)
    expect(selectCard(practice, s2[1]!)).toBe('wrong')
    expect(practice.timeLeftMs).toBe(t2) // 练习模式不扣时
  })

  it('auto-adds three cards when the table has no set, capped at 15', () => {
    const state = createSetGameState(mulberry32(23))
    stripToNoSet(state)
    const before = state.table.length
    expect(state.deck.length).toBeGreaterThan(0)
    ensurePlayable(state)
    // 12 张被剥到无集合后：先补足 12，再因无集合 +3——最终为 12（补完
    // 即有集合）或 15（顶格强补）。
    expect([TABLE_MIN, TABLE_MAX]).toContain(state.table.length)
    expect(state.table.length).toBeGreaterThan(before)
    if (state.table.length === TABLE_MIN) {
      expect(findSet(state.table)).not.toBeNull()
    }
  })

  it('ends the game when the deck is exhausted and the table has no set', () => {
    const state = createSetGameState(mulberry32(31))
    state.deck = []
    state.table = [cardAt(0, 0, 0, 0), cardAt(1, 0, 0, 0)]
    state.selected = []
    expect(findSet(state.table)).toBeNull()
    ensurePlayable(state)
    expect(state.phase).toBe('over')
    expect(selectCard(state, 0)).toBe('ignored') // 终局后点选被忽略
    expect(tick(state, 1000)).toBe('ok') // 终局后 tick 不再改状态
  })

  it('ends by timeout in timed mode and never in practice mode', () => {
    const timed = createSetGameState(mulberry32(77))
    timed.timeLeftMs = 500
    expect(tick(timed, 200)).toBe('ok')
    expect(tick(timed, 400)).toBe('over')
    expect(timed.phase).toBe('over')
    const practice = createSetGameState(mulberry32(77), true)
    for (let i = 0; i < 100; i += 1) tick(practice, 1000)
    expect(practice.phase).toBe('playing')
    expect(practice.timeLeftMs).toBe(levelTimeMs(1))
  })

  it('levels up with a tighter timer and a rising set target', () => {
    expect(levelTimeMs(1)).toBe(180000)
    expect(levelTimeMs(5)).toBe(120000) // 180 - 4*15
    expect(levelTimeMs(99)).toBe(120000) // 下限收紧
    expect(targetSets(2)).toBeGreaterThan(targetSets(1))
    const state = createSetGameState(mulberry32(101), true)
    for (let i = 0; i < targetSets(1) && state.phase === 'playing'; i += 1) {
      const set = findSet(state.table)!
      selectCard(state, set[0])
      selectCard(state, set[1])
      selectCard(state, set[2])
    }
    expect(state.level).toBe(2)
    expect(state.timeLeftMs).toBe(levelTimeMs(2))
    expect(state.levelSets).toBe(0)
  })

  it('runs the 30s tutorial window: hint set is valid, expires with time, scores without bonus', () => {
    const state = createSetGameState(mulberry32(202), true)
    expect(tutorActive(state)).toBe(true)
    const hint = tutorSet(state)!
    expect(hint).not.toBeNull()
    expect(isSet(state.table[hint[0]]!, state.table[hint[1]]!, state.table[hint[2]]!)).toBe(true)
    // 收下提示集合：有基础分但无速度加成，且记 hintUsed。
    selectCard(state, hint[0])
    selectCard(state, hint[1])
    expect(selectCard(state, hint[2])).toBe('set')
    expect(state.hintUsed).toBe(true)
    expect(state.score).toBe(BASE_SET_SCORE)
    // 30 秒后窗口关闭。
    tick(state, TUTOR_MS)
    expect(tutorActive(state)).toBe(false)
    expect(tutorSet(state)).toBeNull()
    // 窗口外的普通集合按距上个集合的间隔计速度加成：30 秒间隔加成已
    // 衰减为 0，只剩基础分。
    const set = findSet(state.table)!
    selectCard(state, set[0])
    selectCard(state, set[1])
    expect(selectCard(state, set[2])).toBe('set')
    expect(state.score).toBe(BASE_SET_SCORE * 2)
  })

  it('replays identically from the same seed and diverges across seeds', () => {
    const a = harvestReplay(1234, 12)
    const b = harvestReplay(1234, 12)
    expect(a).toEqual(b)
    expect(a.setsFound).toBe(12)
    expect(a.score).toBeGreaterThan(0)
    const c = harvestReplay(5678, 12)
    expect(c.deck).not.toEqual(a.deck)
  })
})
