import { describe, expect, it } from 'vitest'
import {
  DUAL_FROM_SESSION, LIGHT_MS, MAX_N, MIN_N, SCORE_FALSE, SCORE_HIT, TRIALS_PER_SESSION, TRIAL_MS,
  advanceSession, createNBackState, deserializeNBack, generateStream, isAudioMatch, isDualSession,
  isPositionMatch, mulberry32, nextLevel, overallAccuracy, planSession, respond, serializeNBack,
  sessionAccuracy, tickNBack, POSITION_STREAM, AUDIO_STREAM,
  type NBackState, type SessionPlan,
} from '../src/client/games/nback/logic.ts'

/** 用手工计划替换当前节（n 保持 state.n）。 */
function withPlan(state: NBackState, positions: number[], digits?: number[], dual = false): void {
  const plan: SessionPlan = {
    n: state.n,
    dual,
    positions,
    digits: digits ?? positions.map((p) => (p % 9) + 1),
  }
  state.plan = plan
}

/** 逐 trial 推进（每个 trial 恰好一个 TRIAL_MS）。 */
function stepTrials(state: NBackState, trials: number): void {
  for (let i = 0; i < trials; i += 1) tickNBack(state, TRIAL_MS / 1000)
}

describe('nback logic', () => {
  it('mulberry32 同种子序列一致，不同种子不同', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(mulberry32(7)()).not.toBe(mulberry32(8)())
  })

  it('generateStream：非目标位绝不与 N 步前相同，目标率落在合理区间', () => {
    for (const seed of [1, 99, 2024]) {
      const n = 2
      const seq = generateStream(mulberry32(seed), 400, n, POSITION_STREAM)
      let matches = 0
      for (let i = 0; i < seq.length; i += 1) {
        const isMatch = i >= n && seq[i] === seq[i - n]
        if (isMatch) matches += 1
        else if (i >= n) expect(seq[i]).not.toBe(seq[i - n])
      }
      const rate = matches / seq.length
      expect(rate).toBeGreaterThan(0.1)
      expect(rate).toBeLessThan(0.6)
    }
  })

  it('位置流禁止同一格连续出现 3 次', () => {
    for (const seed of [3, 17, 555]) {
      for (const n of [1, 2, 3]) {
        const seq = generateStream(mulberry32(seed), 300, n, POSITION_STREAM)
        for (let i = 2; i < seq.length; i += 1) {
          expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false)
        }
      }
    }
  })

  it('防过易：有参照的 trial 中目标间隔不超过强制上限', () => {
    for (const seed of [8, 64]) {
      const seq = generateStream(mulberry32(seed), 200, 2, POSITION_STREAM)
      let lastTarget = 1
      for (let i = 2; i < seq.length; i += 1) {
        if (seq[i] === seq[i - 2]) lastTarget = i
        else expect(i - lastTarget).toBeLessThanOrEqual(7 + 1) // 计入当前非目标位
      }
    }
  })

  it('匹配判定：当前 vs N 步前；前 n 个 trial 与单流声音恒不匹配', () => {
    const state = createNBackState(1)
    withPlan(state, [0, 0, 4, 4, 0], [5, 5, 6, 7, 5], false)
    expect(isPositionMatch(state)).toBe(false) // trial0 无参照
    state.trialIndex = 1
    expect(isPositionMatch(state)).toBe(true) // 0 === 0
    expect(isAudioMatch(state)).toBe(false) // 单流
    state.trialIndex = 2
    expect(isPositionMatch(state)).toBe(false) // 4 !== 0
    state.plan.dual = true
    state.trialIndex = 1
    expect(isAudioMatch(state)).toBe(true) // 5 === 5
    state.trialIndex = 3
    expect(isAudioMatch(state)).toBe(false) // 7 !== 6
  })

  it('作答计分：命中 +10、误按 -5、重复作答与单流声音忽略、无参照误按', () => {
    const state = createNBackState(2)
    withPlan(state, [1, 1, 2], [3, 4, 5], true)
    state.trialIndex = 1
    expect(respond(state, 'position')).toBe('hit')
    expect(state.score).toBe(SCORE_HIT)
    expect(respond(state, 'position')).toBe(null) // 同流同 trial 只记一次
    expect(respond(state, 'audio')).toBe('false') // 4 与 3
    expect(state.score).toBe(SCORE_HIT + SCORE_FALSE)
    state.trialIndex = 2
    state.respondedPosition = false
    state.respondedAudio = false
    expect(respond(state, 'audio')).toBe('false') // 5 与 4
    state.trialIndex = 0 // 回到无参照位
    state.respondedPosition = false
    state.respondedAudio = false
    expect(respond(state, 'position')).toBe('false') // 无参照按即误按
  })

  it('tick 推进：漏按计数不扣分、已作答不漏按、每 TRIAL_MS 换一个 trial', () => {
    const state = createNBackState(3)
    withPlan(state, [2, 2, 7], [1, 1, 1], false)
    tickNBack(state, TRIAL_MS / 1000)
    expect(state.trialIndex).toBe(1)
    expect(state.positionCounters.misses).toBe(0) // trial0 无参照不可能漏按
    respond(state, 'position') // trial1 命中
    expect(state.flashPositionKind).toBe('hit')
    tickNBack(state, TRIAL_MS / 1000)
    expect(state.trialIndex).toBe(2)
    expect(state.positionCounters.misses).toBe(0) // 已作答，不漏按
    expect(state.score).toBe(SCORE_HIT)
    expect(state.flashPosition).toBeLessThanOrEqual(0.5)
    expect(state.trialElapsed).toBeLessThan(LIGHT_MS) // 换 trial 后重新点亮
  })

  it('档位规则：≥80% 升、<50% 降、其余保持，封顶保底', () => {
    expect(nextLevel(1, 0.85)).toBe(2)
    expect(nextLevel(3, 1)).toBe(MAX_N) // 封顶
    expect(nextLevel(2, 0.5)).toBe(2)
    expect(nextLevel(2, 0.79)).toBe(2)
    expect(nextLevel(3, 0.3)).toBe(2)
    expect(nextLevel(1, 0.1)).toBe(MIN_N) // 保底
  })

  it('整节流程：全对 → 小结准确率 1、pendingN 升档，advanceSession 换新计划并刷新计数', () => {
    const state = createNBackState(11)
    withPlan(state, new Array(TRIALS_PER_SESSION).fill(4)) // n=1：trial1 起全为匹配
    for (let trial = 0; trial < TRIALS_PER_SESSION; trial += 1) {
      if (isPositionMatch(state)) respond(state, 'position')
      tickNBack(state, TRIAL_MS / 1000)
    }
    expect(state.phase).toBe('summary')
    expect(sessionAccuracy(state)).toBe(1)
    expect(state.history[0]!.nextN).toBe(2)
    expect(state.score).toBe(SCORE_HIT * (TRIALS_PER_SESSION - 1))
    expect(advanceSession(state)).toBe(true)
    expect(state.n).toBe(2)
    expect(state.maxN).toBe(2)
    expect(state.sessionIndex).toBe(1)
    expect(state.plan.positions).toHaveLength(TRIALS_PER_SESSION)
    expect(state.positionCounters.hits).toBe(0)
    expect(state.phase).toBe('running')
    expect(advanceSession(state)).toBe(false) // 非 summary 阶段忽略
  })

  it('双流：第 3 节起启用，位置与声音独立判定独立计分', () => {
    expect(isDualSession(DUAL_FROM_SESSION - 2)).toBe(false)
    expect(isDualSession(DUAL_FROM_SESSION - 1)).toBe(true)
    const single = createNBackState(5)
    expect(single.plan.dual).toBe(false)
    const dual = createNBackState(5)
    dual.sessionIndex = DUAL_FROM_SESSION - 1
    dual.plan = planSession(dual.seed, dual.sessionIndex, dual.n, true)
    expect(dual.plan.dual).toBe(true)
    withPlan(dual, [0, 0], [7, 8], true) // trial1：位置匹配、声音不匹配
    dual.trialIndex = 1
    expect(respond(dual, 'position')).toBe('hit')
    expect(respond(dual, 'audio')).toBe('false')
    expect(dual.positionCounters.hits).toBe(1)
    expect(dual.audioCounters.falseAlarms).toBe(1)
    tickNBack(dual, TRIAL_MS / 1000)
    expect(dual.audioCounters.misses).toBe(0) // 声音本就不匹配，未按不算漏
  })

  it('序列化重放：快照字段一致，从中断点继续与不中断结局完全相同', () => {
    const play = (state: NBackState, sessions: number): NBackState => {
      for (let s = 0; s < sessions; s += 1) {
        if (state.phase === 'summary') advanceSession(state)
        for (let trial = 0; trial < TRIALS_PER_SESSION && state.phase === 'running'; trial += 1) {
          if (state.plan.dual && isAudioMatch(state)) respond(state, 'audio')
          if (isPositionMatch(state)) respond(state, 'position')
          tickNBack(state, TRIAL_MS / 1000)
        }
      }
      return state
    }
    const straight = play(createNBackState(77), 2)
    const paused = play(createNBackState(77), 1)
    const snap = serializeNBack(paused)
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap) // 纯 JSON
    const resumed = deserializeNBack(snap)
    expect(resumed.score).toBe(paused.score)
    expect(resumed.plan.positions).toEqual(paused.plan.positions)
    expect(resumed.history).toEqual(paused.history)
    play(resumed, 1)
    expect(resumed.score).toBe(straight.score)
    expect(resumed.history).toEqual(straight.history)
    expect(overallAccuracy(resumed)).toBe(overallAccuracy(straight))
  })

  it('一局四节后结束：over 阶段作答与推进均忽略', () => {
    const state = createNBackState(13)
    withPlan(state, new Array(TRIALS_PER_SESSION).fill(2).map((v, i) => (i % 2 === 0 ? v : (v + 3) % 9)))
    for (let s = 0; s < 4; s += 1) {
      if (state.phase === 'summary') advanceSession(state)
      stepTrials(state, TRIALS_PER_SESSION)
    }
    expect(state.phase).toBe('over')
    expect(state.history).toHaveLength(4)
    expect(respond(state, 'position')).toBe(null)
    expect(advanceSession(state)).toBe(false)
  })
})
