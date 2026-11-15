import { describe, expect, it } from 'vitest'
import {
  beats, counterOf, createRpsState, generateHint, learningRate, mulberry32,
  playRound, predictNext, streakBonus, updateMarkov, TOTAL_ROUNDS,
  type Hand,
} from '../src/client/games/rps/logic.ts'

describe('rps logic', () => {
  it('克制判定覆盖全部九种组合', () => {
    // 石胜剪、剪胜布、布胜石；同拳平。
    expect(beats(0, 1)).toBe(true)
    expect(beats(1, 2)).toBe(true)
    expect(beats(2, 0)).toBe(true)
    expect(beats(0, 2)).toBe(false)
    expect(beats(1, 0)).toBe(false)
    expect(beats(2, 1)).toBe(false)
    expect(beats(0, 0)).toBe(false)
    expect(beats(1, 1)).toBe(false)
    expect(beats(2, 2)).toBe(false)
  })

  it('counterOf 返回克制拳', () => {
    expect(counterOf(0)).toBe(2)
    expect(counterOf(1)).toBe(0)
    expect(counterOf(2)).toBe(1)
  })

  it('转移表按一阶/二阶各记一笔', () => {
    const s = createRpsState(1)
    updateMarkov(s, 0)
    updateMarkov(s, 0)
    updateMarkov(s, 1)
    // 一阶：出过两次 0，后继 {0:1, 1:1}。
    expect(s.table1.get(0)).toEqual([1, 1, 0])
    // 二阶：序列 0,0 之后接 1。
    expect(s.table2.get('0:0')).toEqual([0, 1, 0])
    expect(s.history).toEqual([0, 0, 1])
  })

  it('学习率前 5 轮为 0，之后爬坡封顶 0.9', () => {
    expect(learningRate(0)).toBe(0)
    expect(learningRate(5)).toBe(0)
    expect(learningRate(6)).toBeCloseTo(0.12)
    expect(learningRate(12)).toBeCloseTo(0.84)
    // 封顶：13 轮起恒为 0.9。
    expect(learningRate(13)).toBe(0.9)
    expect(learningRate(15)).toBe(0.9)
  })

  it('学成后预测惯用后继：连出石头后预测石头', () => {
    const s = createRpsState(2)
    for (let i = 0; i < 8; i += 1) updateMarkov(s, 0)
    // rand() 恒 0：必然走学习分支（0 < learningRate(8)≈0.36）。
    expect(predictNext(s, () => 0)).toBe(0)
    // rand() 恒 0.99 > learningRate：走随机分支，rand()*3 截断为 2。
    expect(predictNext(s, () => 0.99)).toBe(2)
  })

  it('计分：赢 +100、平 +20、输 0，连赢加成递增封顶', () => {
    expect(streakBonus(1)).toBe(0)
    expect(streakBonus(2)).toBe(50)
    expect(streakBonus(3)).toBe(100)
    expect(streakBonus(4)).toBe(150)
    expect(streakBonus(9)).toBe(150)
    // 完整对局验证计分路径。
    const s = createRpsState(7)
    // 学习率为 0 的前 5 轮：预测走随机分支（seed 固定，结果确定）。
    const r1 = playRound(s, 0)!
    expect([100, 20, 0]).toContain(r1.gained)
    const s2 = createRpsState(11)
    s2.round = 5 // 直接进入计分轮，随机分支由 seed 决定
    const before = s2.score
    const rr = playRound(s2, 1)!
    expect(s2.score - before).toBe(rr.gained)
  })

  it('提示生成：真话陈述真实预测，谎话声称别的拳且带「才怪」', () => {
    const truth = generateHint(0, () => 0.1)
    expect(truth.truthful).toBe(true)
    expect(truth.claimed).toBe(0)
    expect(truth.text).toBe('我觉得你接下来会出石头…')
    const lie = generateHint(0, () => 0.9)
    expect(lie.truthful).toBe(false)
    expect(lie.claimed).not.toBe(0)
    expect(lie.text.endsWith('…才怪')).toBe(true)
  })

  it('15 轮流程打满自动结束，胜负平合计等于轮数', () => {
    const s = createRpsState(42)
    const rngHands = mulberry32(99)
    let rounds = 0
    while (!s.over) {
      const r = playRound(s, Math.floor(rngHands() * 3) as Hand)
      expect(r).not.toBeNull()
      rounds += 1
    }
    expect(rounds).toBe(TOTAL_ROUNDS)
    expect(s.round).toBe(15)
    expect(s.wins + s.draws + s.losses).toBe(15)
    expect(playRound(s, 0)).toBeNull()
  })

  it('同 seed 同输入序列完全重放（确定性）', () => {
    const seq: Hand[] = [0, 1, 2, 2, 1, 0, 0, 2, 1, 1, 0, 2, 2, 0, 1]
    const a = createRpsState(1234)
    const b = createRpsState(1234)
    for (const h of seq) {
      playRound(a, h)
      playRound(b, h)
    }
    expect(a.score).toBe(b.score)
    expect(a.readCount).toBe(b.readCount)
    expect(a.history).toEqual(b.history)
    expect(a.lastHint?.text).toBe(b.lastHint?.text)
  })
})
