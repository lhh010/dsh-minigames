import { describe, expect, it } from 'vitest'
import {
  DIT_MS, DAH_MS, ELEMENT_THRESHOLD_MS, LETTER_GAP_MS, LETTER_END_GAP_MS, LEVELS,
  MORSE_TABLE, answerScore, baseScore, classifyElementDuration, createMorseState,
  endPlayback, expandWord, finishEncodeLetter, gapEndsLetter, letterFromCode,
  mulberry32, pickLetter, pushElement, signalAt, startRound, speedBonus,
  totalDurationMs,
} from '../src/client/games/morse/logic.ts'

/** 完成当前一轮（按 state.word 正确作答，解码/编码两种模式都覆盖）。 */
function solveRound(state: ReturnType<typeof createMorseState>, elapsedMs: number): void {
  if (state.mode === 'decode') {
    while (state.phase === 'answer') pickLetter(state, state.word[state.filled]!, elapsedMs)
    // 播放未结束时先推进到作答。
  } else {
    while (state.phase === 'encode') {
      for (const sym of MORSE_TABLE[state.word[state.encodeIndex]!]!) {
        pushElement(state, sym === '.' ? DIT_MS - 20 : DAH_MS)
      }
      finishEncodeLetter(state, elapsedMs)
    }
  }
}

describe('morse logic', () => {
  it('提供完整且唯一可逆的 36 字符摩斯表', () => {
    expect(Object.keys(MORSE_TABLE)).toHaveLength(36)
    const codes = new Set<string>()
    for (const [ch, code] of Object.entries(MORSE_TABLE)) {
      expect(code).toMatch(/^[.-]{1,5}$/)
      expect(letterFromCode(code)).toBe(ch)
      codes.add(code)
    }
    expect(codes.size).toBe(36)
    expect(MORSE_TABLE['S']).toBe('...')
    expect(MORSE_TABLE['O']).toBe('---')
    expect(MORSE_TABLE['5']).toBe('.....')
    expect(MORSE_TABLE['0']).toBe('-----')
    expect(letterFromCode('......')).toBeNull()
  })

  it('expandWord 把单词展开为点划信号并含正确的符号/字母间隔', () => {
    // 'EE' = 点,灭(字母隔),点。
    expect(expandWord('EE')).toEqual([
      { on: true, ms: DIT_MS }, { on: false, ms: LETTER_GAP_MS }, { on: true, ms: DIT_MS },
    ])
    // 'ET' = 点,字母隔,划。
    expect(expandWord('ET')).toEqual([
      { on: true, ms: DIT_MS }, { on: false, ms: LETTER_GAP_MS }, { on: true, ms: DAH_MS },
    ])
    // 'IE' = 两点中间是符号隔（120ms），字母隔只在字母之间。
    expect(expandWord('IE')).toEqual([
      { on: true, ms: DIT_MS }, { on: false, ms: 120 }, { on: true, ms: DIT_MS },
      { on: false, ms: LETTER_GAP_MS }, { on: true, ms: DIT_MS },
    ])
    // 总时长 = 各段之和。
    expect(totalDurationMs(expandWord('SOS'))).toBe(3340) // 2×S(600) + 2×字母隔(500×2) + O(1140)
  })

  it('signalAt 按播放进度判定指示灯亮灭', () => {
    const sched = expandWord('ET') // 亮120 | 灭500 | 亮300
    expect(signalAt(sched, 0)).toBe(true)
    expect(signalAt(sched, DIT_MS - 1)).toBe(true)
    expect(signalAt(sched, DIT_MS + 1)).toBe(false)
    expect(signalAt(sched, DIT_MS + LETTER_GAP_MS - 1)).toBe(false)
    expect(signalAt(sched, DIT_MS + LETTER_GAP_MS + 1)).toBe(true)
    expect(signalAt(sched, totalDurationMs(sched) - 1)).toBe(true)
    expect(signalAt(sched, totalDurationMs(sched) + 50)).toBe(false)
  })

  it('按压时长分桶：<180ms 为点、≥180ms 为划；停顿 375ms 判字母结束', () => {
    expect(ELEMENT_THRESHOLD_MS).toBe(180)
    expect(classifyElementDuration(30)).toBe('.')
    expect(classifyElementDuration(179)).toBe('.')
    expect(classifyElementDuration(180)).toBe('-')
    expect(classifyElementDuration(1000)).toBe('-')
    expect(LETTER_END_GAP_MS).toBe(375)
    expect(gapEndsLetter(374)).toBe(false)
    expect(gapEndsLetter(375)).toBe(true)
  })

  it('startRound 用注入种子确定性选词并交替两种模式', () => {
    const a = createMorseState(mulberry32(42))
    const b = createMorseState(mulberry32(42))
    const wordsA: string[] = []
    const modesA: string[] = []
    for (let i = 0; i < 6; i += 1) {
      startRound(a)
      wordsA.push(a.word)
      modesA.push(a.mode)
      a.phase = 'ready'
    }
    for (let i = 0; i < 6; i += 1) {
      startRound(b)
      expect(b.word).toBe(wordsA[i])
      expect(b.mode).toBe(modesA[i])
    }
    // 不同种子产生不同序列（概率上几乎必然）。
    const c = createMorseState(mulberry32(7))
    const cWords: string[] = []
    for (let i = 0; i < 6; i += 1) {
      startRound(c)
      cWords.push(c.word)
      c.phase = 'ready'
    }
    expect(cWords.join(',')).not.toBe(wordsA.join(','))
    // 词长与字符集符合关卡配置。
    const s = createMorseState(mulberry32(1))
    startRound(s)
    expect(s.word).toHaveLength(LEVELS[0]!.wordLength)
    for (const ch of s.word) expect(LEVELS[0]!.alphabet).toContain(ch)
  })

  it('endPlayback 只在 playback 阶段迁移到 answer', () => {
    const s = createMorseState(mulberry32(3))
    expect(endPlayback(s)).toBe(false)
    do { startRound(s); s.phase = 'ready'; startRound(s) } while (s.mode !== 'decode')
    expect(s.phase).toBe('playback')
    expect(endPlayback(s)).toBe(true)
    expect(s.phase).toBe('answer')
    expect(endPlayback(s)).toBe(false)
  })

  it('解码答题：正确填槽、词完成计分、错误扣命清零直至游戏结束', () => {
    const s = createMorseState(mulberry32(5))
    do { startRound(s); s.phase = 'ready'; startRound(s) } while (s.mode !== 'decode')
    endPlayback(s)
    const word = s.word
    expect(pickLetter(s, word[0]!, 0)).toBe(word.length > 1 ? 'fill' : 'round-clear')
    expect(s.filled).toBe(1)
    // 错误：扣命、进度清零、可重来。
    const cur = word[s.filled] ?? word[0]!
    const wrong = cur === 'A' ? 'B' : 'A'
    expect(pickLetter(s, wrong, 0)).toBe('wrong')
    expect(s.lives).toBe(2)
    expect(s.filled).toBe(0)
    // 重填全词 → round-clear 且计分。
    const before = s.score
    while ((s.phase as string) === 'answer') expect(['fill', 'round-clear']).toContain(pickLetter(s, s.word[s.filled]!, 1000))
    expect(s.score).toBe(before + baseScore(0, word.length) + speedBonus(0, word.length, 1000))
    expect(s.phase).toBe('ready')
    // 生命耗尽 → over 且此后作答被忽略。
    s.phase = 'answer'
    s.word = 'AT'
    s.filled = 0
    s.lives = 1
    expect(pickLetter(s, 'B', 0)).toBe('wrong')
    expect(s.phase).toBe('over')
    expect(pickLetter(s, 'A', 0)).toBe('ignored')
  })

  it('编码答题：按时长发码，正确前进、码错扣命重发', () => {
    const s = createMorseState(mulberry32(11))
    do { startRound(s); s.phase = 'ready'; startRound(s) } while (s.mode !== 'encode')
    const word = s.word
    // 第一个字母正确打出。
    for (const sym of MORSE_TABLE[word[0]!]!) {
      expect(pushElement(s, sym === '.' ? 100 : DAH_MS)).toBe(true)
    }
    const first = word.length > 1 ? 'correct' : 'round-clear'
    expect(finishEncodeLetter(s, 500)).toBe(first)
    expect(s.encodeIndex).toBe(1)
    // 缓冲未按 375ms 停顿前不结算（由调用方控制）；码错 → 扣命、缓冲清空。
    expect(pushElement(s, ELEMENT_THRESHOLD_MS)).toBe(true) // '-'
    if (MORSE_TABLE[word[1]!] === '-') {
      // 第二个字母恰好是划：补成正确的码不太方便构造，直接构造错误码。
      pushElement(s, ELEMENT_THRESHOLD_MS)
      pushElement(s, ELEMENT_THRESHOLD_MS)
      pushElement(s, ELEMENT_THRESHOLD_MS)
      pushElement(s, ELEMENT_THRESHOLD_MS) // 5 个划必错（除非是 '0'）
      if (word[1] !== '0') {
        expect(finishEncodeLetter(s, 500)).toBe('wrong')
        expect(s.lives).toBe(2)
        expect(s.encodeBuffer).toBe('')
      }
    } else {
      expect(finishEncodeLetter(s, 500)).toBe('wrong')
      expect(s.lives).toBe(2)
      expect(s.encodeBuffer).toBe('')
    }
    // 空缓冲 → pending；非编码阶段 → ignored。
    expect(finishEncodeLetter(s, 0)).toBe('pending')
    s.phase = 'answer'
    expect(finishEncodeLetter(s, 0)).toBe('ignored')
    expect(pushElement(s, 100)).toBe(false)
    // 超长缓冲被拒绝（最长 5 码）。
    s.phase = 'encode'
    s.encodeBuffer = '.....'
    expect(pushElement(s, 100)).toBe(false)
  })

  it('计分：更快更高、超窗只给基础分', () => {
    expect(answerScore(0, 2, 0)).toBe(baseScore(0, 2) + speedBonus(0, 2, 0))
    // 同轮更快 → 得分不降低。
    expect(answerScore(2, 4, 0)).toBeGreaterThanOrEqual(answerScore(2, 4, 1000))
    expect(answerScore(2, 4, 1000)).toBeGreaterThan(answerScore(2, 4, 6000))
    // 超出奖励窗口（3000 + 1500*4 = 9000ms）只给基础分。
    expect(speedBonus(2, 4, 9000)).toBe(0)
    expect(answerScore(2, 4, 9000)).toBe(baseScore(2, 4))
    // 基础分随关卡与词长递增。
    expect(baseScore(1, 3)).toBeLessThan(baseScore(4, 5))
  })

  it('关卡推进：词长 2→5、后期默认关对照表，打满 5 关获胜', () => {
    expect(LEVELS.map((l) => l.wordLength)).toEqual([2, 3, 3, 4, 5])
    expect(LEVELS.map((l) => l.hintDefault)).toEqual([true, true, true, false, false])
    expect(LEVELS[4]!.alphabet).toContain('9')
    const s = createMorseState(mulberry32(2024))
    let guard = 0
    startRound(s)
    while (s.phase !== 'won' && s.phase !== 'over' && guard < 200) {
      guard += 1
      if (s.phase === 'playback') endPlayback(s)
      else if (s.phase === 'ready') startRound(s)
      else solveRound(s, 500)
    }
    expect(s.phase).toBe('won')
    expect(s.score).toBeGreaterThan(0)
    expect(s.lives).toBeGreaterThan(0)
  })
})
