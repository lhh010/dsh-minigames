import { describe, expect, it } from 'vitest'
import {
  AI_PLAY_RATE, HAND_SIZE, IDIOMS, ROUNDS, TURNS_PER_ROUND, TURN_MS,
  aiTurn, chainTail, createMatch, dealHand, finalResult, gainFor, linkKind,
  mulberry32, playSkipScript, playableIndices, playerPlay, playerSkip,
  restartChain, snapshot,
} from '../src/client/games/idiomchain/logic.ts'

/** 按词条查（测试断言用）。 */
function byIdiom(idiom: string) {
  return IDIOMS.find(e => e.idiom === idiom)!
}

describe('idiomchain 接龙判定', () => {
  it('尾字与下一首字同字为 exact，同音不同字为 homophone，其余不可接', () => {
    // 同字：一往无前(尾 前) → 前因后果(首 前)。
    expect(linkKind(byIdiom('一往无前'), byIdiom('前因后果'))).toBe('exact')
    // 同音：一心一意(尾 yi) → 异想天开(首 yi)。
    expect(linkKind(byIdiom('一心一意'), byIdiom('异想天开'))).toBe('homophone')
    // 同音：井底之蛙(尾 wa) → 挖…库中没有；换 万紫千红(尾 hong) → 虎…不通。
    expect(linkKind(byIdiom('万紫千红'), byIdiom('虎头蛇尾'))).toBeNull()
    expect(linkKind(byIdiom('画蛇添足'), byIdiom('足智多谋'))).toBe('exact')
    expect(linkKind(byIdiom('画蛇添足'), byIdiom('足不出户'))).toBe('exact')
  })

  it('词库 160 条左右、全部四字且拼音首尾来自词库本身', () => {
    expect(IDIOMS.length).toBeGreaterThanOrEqual(150)
    expect(IDIOMS.length).toBeLessThanOrEqual(200)
    for (const e of IDIOMS) {
      expect([...e.idiom].length).toBe(4)
      expect(e.meaning.length).toBeGreaterThan(1)
      expect(e.headPy.length).toBeGreaterThan(0)
      expect(e.tailPy.length).toBeGreaterThan(0)
    }
    const ids = new Set(IDIOMS.map(e => e.idiom))
    expect(ids.size).toBe(IDIOMS.length)
  })
})

describe('idiomchain 发牌与 AI 策略确定性', () => {
  it('mulberry32 同种子同序列，createMatch 同种子同局面', () => {
    const a = mulberry32(4242)
    const b = mulberry32(4242)
    for (let i = 0; i < 8; i += 1) expect(a()).toBe(b())
    const s1 = createMatch(4242)
    const s2 = createMatch(4242)
    expect(snapshot(s1)).toEqual(snapshot(s2))
    expect(s1.hand).toHaveLength(HAND_SIZE)
    expect(s1.chain).toHaveLength(1)
    expect(playableIndices(s1).length).toBeGreaterThan(0)
  })

  it('dealHand 尽量保证有牌可接且不与已用成语重复', () => {
    const s = createMatch(7)
    dealHand(s)
    expect(s.hand).toHaveLength(HAND_SIZE)
    const ids = new Set(s.hand.map(e => e.idiom))
    expect(ids.size).toBe(HAND_SIZE)
    for (const e of s.hand) expect(s.used.has(e.idiom)).toBe(false)
  })

  it('aiTurn 70% 阈值确定性：rng<0.7 找牌接，≥0.7 跳过', () => {
    const s = createMatch(99)
    // 强制 rng ≥ AI_PLAY_RATE：必跳过。
    s.rng = () => AI_PLAY_RATE
    expect(aiTurn(s).type).toBe('skip')
    // 强制 rng = 0：必从库中找到可接牌（先把链尾固定为有下家的成语）。
    const s2 = createMatch(99)
    s2.chain = [byIdiom('一往无前')]
    s2.rng = () => 0
    const move = aiTurn(s2)
    expect(move.type).toBe('play')
    if (move.type === 'play' && move.entry !== undefined) {
      expect(linkKind(byIdiom('一往无前'), move.entry)).not.toBeNull()
      expect(s2.used.has(move.entry.idiom)).toBe(true)
    }
  })
})

describe('idiomchain 计分与行动', () => {
  it('正接得 10×链位并吃时间系数，同音接得固定 5 分', () => {
    expect(gainFor('exact', 2, TURN_MS)).toBe(20)
    expect(gainFor('exact', 2, 0)).toBe(10)
    expect(gainFor('homophone', 3, TURN_MS)).toBe(5)
    expect(gainFor('homophone', 3, 0)).toBe(3)
  })

  it('playerPlay 合法出牌加分推进，非法出牌不动状态', () => {
    const s = createMatch(1234)
    s.rng = () => AI_PLAY_RATE // AI 也必跳过，链长可控
    const good = playableIndices(s)[0]!
    const bad = s.hand.findIndex((_, i) => !playableIndices(s).includes(i))
    if (bad >= 0) {
      const before = snapshot(s)
      expect(playerPlay(s, bad, TURN_MS).ok).toBe(false)
      expect(snapshot(s)).toEqual(before)
    }
    const r = playerPlay(s, good, TURN_MS)
    expect(r.ok).toBe(true)
    expect(r.gain).toBeGreaterThan(0)
    expect(s.playerScore).toBe(r.gain)
    expect(s.chain.length).toBe(2)
  })

  it('playerSkip 送 AI 5 分；双方连续跳过触发死局重起', () => {
    const s = createMatch(5678)
    s.rng = () => AI_PLAY_RATE // AI 也必跳过
    const before = chainTail(s)
    playerSkip(s)
    expect(s.aiScore).toBeGreaterThanOrEqual(5)
    expect(s.restarts).toBe(1)
    expect(chainTail(s).idiom).not.toBe(before.idiom)
    expect(s.consecutiveSkips).toBe(0)
  })

  it('restartChain 重起链首且不计分', () => {
    const s = createMoveState()
    const len = s.chain.length
    restartChain(s)
    expect(s.chain).toHaveLength(1)
    expect(s.chain.length).not.toBe(len)
    expect(s.playerScore).toBe(0)
  })
  function createMoveState() {
    const s = createMatch(11)
    s.chain.push(byIdiom('一往无前'))
    return s
  }
})

describe('idiomchain 整局流程与重放', () => {
  it('跑满 5 局 × 每局 4 回合后终局并给出胜负', () => {
    const s = createMatch(2024)
    for (let i = 0; i < ROUNDS * TURNS_PER_ROUND; i += 1) {
      const idx = playableIndices(s)[0]
      if (idx === undefined) playerSkip(s)
      else playerPlay(s, idx, TURN_MS / 2)
    }
    expect(s.phase).toBe('over')
    expect(finalResult(s)).not.toBeNull()
    expect(['player', 'ai', 'draw']).toContain(finalResult(s))
  })

  it('同种子同脚本整局重放完全一致（确定性）', () => {
    const run = () => playSkipScript(31337, 20)
    expect(run()).toEqual(run())
  })
})
