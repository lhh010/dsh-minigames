import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_MS, GO_LIMIT_MS, HIT_SCORE_MIN, MAX_WAIT_MS, MIN_WAIT_MS, ROUND_COUNT,
  START_LIVES, averageMs, createReaction, pressReaction, roundScore, stepReaction,
} from '../src/client/games/reaction/logic.ts'

/** 把状态步进到指定阶段（每次 25ms，最多 40s 模拟时间）。 */
function runUntil(s: ReturnType<typeof createReaction>, phase: string): void {
  for (let i = 0; i < 1600 && s.phase !== phase; i += 1) stepReaction(s, 25)
}

/** 完成一次命中：等到信号，再精确推进 reactionMs 后按键。 */
function playHit(s: ReturnType<typeof createReaction>, reactionMs: number): void {
  runUntil(s, 'go')
  stepReaction(s, reactionMs)
  pressReaction(s)
}

describe('reaction logic', () => {
  it('starts in wait with the first injected delay and default delays stay in range', () => {
    const s = createReaction([1234, 5678])
    expect(s.phase).toBe('wait')
    expect(s.waitMs).toBe(1234)
    expect(s.lives).toBe(START_LIVES)
    expect(s.roundIndex).toBe(0)
    const rnd = createReaction()
    expect(rnd.delays).toHaveLength(ROUND_COUNT)
    for (const d of rnd.delays) {
      expect(d).toBeGreaterThanOrEqual(MIN_WAIT_MS)
      expect(d).toBeLessThanOrEqual(MAX_WAIT_MS)
    }
  })

  it('pressing during wait is a foul: loses a life, round not consumed', () => {
    const s = createReaction([1000])
    pressReaction(s)
    expect(s.lives).toBe(START_LIVES - 1)
    expect(s.phase).toBe('feedback')
    expect(s.feedback).toBe('foul')
    expect(s.roundIndex).toBe(0)
    expect(s.results).toEqual([])
    expect(s.events.some(e => e.type === 'foul')).toBe(true)
  })

  it('a hit records the elapsed ms, gains score and consumes the round', () => {
    const s = createReaction([1000])
    stepReaction(s, 1000)
    expect(s.phase).toBe('go')
    stepReaction(s, 250)
    pressReaction(s)
    const hit = s.events.find(e => e.type === 'hit')
    expect(hit).toBeDefined()
    expect(hit && hit.type === 'hit' && hit.ms).toBe(250)
    expect(hit && hit.type === 'hit' && hit.gained).toBe(roundScore(250))
    expect(s.score).toBe(roundScore(250))
    expect(s.roundIndex).toBe(1)
    expect(s.results).toEqual(['hit'])
    expect(s.bestMs).toBe(250)
    expect(averageMs(s)).toBe(250)
  })

  it('not pressing before the limit is a miss that consumes the round and a life', () => {
    const s = createReaction([1000])
    // 一次步进完成等待切换（同帧不再判定信号超时），下一次步进推进信号计时。
    stepReaction(s, 1000)
    stepReaction(s, GO_LIMIT_MS)
    expect(s.feedback).toBe('miss')
    expect(s.phase).toBe('feedback')
    expect(s.lives).toBe(START_LIVES - 1)
    expect(s.roundIndex).toBe(1)
    expect(s.results).toEqual(['miss'])
    expect(s.events.some(e => e.type === 'miss')).toBe(true)
  })

  it('three fouls end the game and further presses are ignored', () => {
    const s = createReaction([1000])
    pressReaction(s)
    stepReaction(s, FEEDBACK_MS)
    pressReaction(s)
    stepReaction(s, FEEDBACK_MS)
    pressReaction(s)
    expect(s.over).toBe(true)
    expect(s.lives).toBe(0)
    expect(s.roundIndex).toBe(0)
    expect(s.complete).toBe(false)
    const scoreBefore = s.score
    pressReaction(s)
    stepReaction(s, 5000)
    expect(s.score).toBe(scoreBefore)
    expect(s.phase).toBe('over')
  })

  it('feedback auto-advances to the next wait using the next delay (cycling)', () => {
    const s = createReaction([1000, 2000])
    playHit(s, 300)
    stepReaction(s, FEEDBACK_MS)
    expect(s.phase).toBe('wait')
    expect(s.waitMs).toBe(2000)
    // 第三次取值循环回表首。
    playHit(s, 300)
    stepReaction(s, FEEDBACK_MS)
    expect(s.waitMs).toBe(1000)
  })

  it('playing all rounds to hits completes the game with correct aggregates', () => {
    const s = createReaction([1000])
    let expectedScore = 0
    for (let i = 0; i < ROUND_COUNT; i += 1) {
      playHit(s, 200 + i * 50)
      expectedScore += roundScore(200 + i * 50)
      stepReaction(s, FEEDBACK_MS)
    }
    expect(s.over).toBe(true)
    expect(s.complete).toBe(true)
    expect(s.lives).toBe(START_LIVES)
    expect(s.hits).toBe(ROUND_COUNT)
    expect(s.score).toBe(expectedScore)
    expect(s.bestMs).toBe(200)
    // ms_i = 200 + 50i（i=0..9），均值 = 425。
    expect(averageMs(s)).toBeCloseTo(425, 5)
    expect(s.results.every(r => r === 'hit')).toBe(true)
    const complete = s.events.find(e => e.type === 'complete')
    expect(complete && complete.type === 'complete' && complete.score).toBe(expectedScore)
  })

  it('roundScore decreases with slower reactions and floors at the minimum', () => {
    expect(roundScore(200)).toBeGreaterThan(roundScore(600))
    expect(roundScore(600)).toBeGreaterThan(roundScore(1100))
    expect(roundScore(GO_LIMIT_MS * 3)).toBe(HIT_SCORE_MIN)
    expect(roundScore(0)).toBe(600)
  })

  it('averageMs is null before any hit', () => {
    const s = createReaction([1000])
    expect(averageMs(s)).toBeNull()
    expect(s.bestMs).toBeNull()
  })
})
