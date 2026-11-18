import { describe, expect, it } from 'vitest'
import {
  AI_PLAY_RATE, BASE_GAIN, CHAIN_STEP, EXACT_BONUS, EXACT_EXTRA_BONUS,
  HAND_SIZE, HOMOPHONE_BONUS, ROUNDS, WORDS,
  chainTail, createMatch, dealHand, finalResult, gainFor, linkKind,
  mulberry32, playSkipScript, playableIndices, playerPlay, playerSkip,
  replayMatch, snapshot,
} from '../src/client/games/wordchain/logic.ts'

/** 按词面查词条（测试断言用）。 */
function byWord(word: string) {
  return WORDS.find(e => e.word === word)!
}

describe('wordchain 词库结构完整性', () => {
  it('词库 300+ 条、全为双字/三字词、首尾拼音字段合法、无重复且与词面一致', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(300)
    const seen = new Set<string>()
    for (const e of WORDS) {
      expect([...e.word].length).toBeGreaterThanOrEqual(2)
      expect([...e.word].length).toBeLessThanOrEqual(3)
      expect(e.headPy).toMatch(/^[a-z]+$/)
      expect(e.tailPy).toMatch(/^[a-z]+$/)
      expect(seen.has(e.word), '重复词：' + e.word).toBe(false)
      seen.add(e.word)
    }
    expect(seen.size).toBe(WORDS.length)
    // 抽样校对首尾拼音与词首尾字一致（含三字词边界）。
    expect(byWord('太阳')).toMatchObject({ headPy: 'tai', tailPy: 'yang' })
    expect(byWord('苹果')).toMatchObject({ headPy: 'ping', tailPy: 'guo' })
    expect(byWord('出租车')).toMatchObject({ headPy: 'chu', tailPy: 'che' })
    expect(byWord('萤火虫')).toMatchObject({ headPy: 'ying', tailPy: 'chong' })
  })
})

describe('wordchain 接龙判定', () => {
  it('尾字与下一词首字同字为 exact，同音不同字为 homophone，其余不可接', () => {
    // 同字：大门(尾 门) → 门锁(首 门)；芒果(尾 果) → 果汁(首 果)。
    expect(linkKind(byWord('大门'), byWord('门锁'))).toBe('exact')
    expect(linkKind(byWord('芒果'), byWord('果汁'))).toBe('exact')
    // 同音不同字：山川(尾 川 chuan) → 穿梭(首 穿 chuan)。
    expect(linkKind(byWord('山川'), byWord('穿梭'))).toBe('homophone')
    // 不可接：太阳(尾 阳 yang) → 桌子(首 桌 zhuo)。
    expect(linkKind(byWord('太阳'), byWord('桌子'))).toBeNull()
    // 三字词边界：出租车(尾 车 che) → 车站(首 车 che) 同字。
    expect(linkKind(byWord('出租车'), byWord('车站'))).toBe('exact')
  })
})

describe('wordchain 发牌确定性', () => {
  it('mulberry32 同种子同序列；createMatch 同种子同局面，手牌可接保底、五张互异且未用过', () => {
    const a = mulberry32(4242)
    const b = mulberry32(4242)
    for (let i = 0; i < 8; i += 1) expect(a()).toBe(b())
    const s1 = createMatch(4242)
    const s2 = createMatch(4242)
    expect(snapshot(s1)).toEqual(snapshot(s2))
    expect(s1.hand).toHaveLength(HAND_SIZE)
    expect(s1.chain).toHaveLength(1)
    for (const seed of [7, 100, 99991]) {
      const s = createMatch(seed)
      dealHand(s)
      expect(s.hand).toHaveLength(HAND_SIZE)
      const words = new Set(s.hand.map(e => e.word))
      expect(words.size).toBe(HAND_SIZE)
      for (const e of s.hand) expect(s.used.has(e.word)).toBe(false)
      // 可接保底：库里还有可接的未用词时，手牌必有可接牌。
      const tail = chainTail(s)
      const anyPlayable = WORDS.some(e => !s.used.has(e.word) && linkKind(tail, e) !== null)
      if (anyPlayable) expect(playableIndices(s).length).toBeGreaterThan(0)
    }
  })

  it('手牌不随回合刷新：出牌只移除该牌，跳过不补牌', () => {
    const s = createMatch(31337)
    s.rng = () => AI_PLAY_RATE // AI 必跳过
    const idx = playableIndices(s)[0]!
    const kept = s.hand.filter((_, i) => i !== idx).map(e => e.word)
    playerPlay(s, idx)
    expect(s.hand.map(e => e.word)).toEqual(kept)
    expect(s.hand).toHaveLength(HAND_SIZE - 1)
    // 玩家跳过（AI 又跳过会死局换牌）：未触发重起时手牌原样保留。
    const before = s.hand.map(e => e.word)
    playerSkip(s)
    if (s.restarts === 0) expect(s.hand.map(e => e.word)).toEqual(before)
  })
})

describe('wordchain 计分', () => {
  it('接出 +10 + 每 +1 链 +2；同音接 +5；首字完全相同（非同音）+5 且额外 +5', () => {
    expect(BASE_GAIN).toBe(10)
    expect(CHAIN_STEP).toBe(2)
    expect(HOMOPHONE_BONUS).toBe(5)
    expect(EXACT_BONUS + EXACT_EXTRA_BONUS).toBe(10)
    // 链位 1：无链长加成。
    expect(gainFor('homophone', 1)).toBe(15)
    expect(gainFor('exact', 1)).toBe(20)
    // 链位 2：+2；链位 5：+8。
    expect(gainFor('exact', 2)).toBe(22)
    expect(gainFor('homophone', 2)).toBe(17)
    expect(gainFor('homophone', 5)).toBe(23)
    expect(gainFor('exact', 5)).toBe(28)
  })

  it('playerPlay 按链位精确加分，非法出牌不动状态', () => {
    const s = createMatch(1234)
    s.rng = () => AI_PLAY_RATE // AI 必跳过
    const bad = s.hand.findIndex((_, i) => !playableIndices(s).includes(i))
    if (bad >= 0) {
      const before = snapshot(s)
      expect(playerPlay(s, bad).ok).toBe(false)
      expect(snapshot(s)).toEqual(before)
    }
    const good = playableIndices(s)[0]!
    const kind = linkKind(chainTail(s), s.hand[good]!)
    const expectGain = gainFor(kind!, 2) // 链上只有起头词，新词链位 2
    const r = playerPlay(s, good)
    expect(r.ok).toBe(true)
    expect(r.gain).toBe(expectGain)
    expect(s.playerScore).toBe(expectGain)
    expect(s.chain).toHaveLength(2)
  })
})

describe('wordchain 跳过与死局', () => {
  it('playerSkip 送 AI 5 分；双方连续跳过触发死局重起并换牌', () => {
    const s = createMatch(5678)
    s.rng = () => AI_PLAY_RATE // AI 也必跳过
    const headBefore = chainTail(s).word
    playerSkip(s)
    expect(s.aiScore).toBeGreaterThanOrEqual(5)
    expect(s.restarts).toBe(1)
    expect(chainTail(s).word).not.toBe(headBefore)
    expect(s.consecutiveSkips).toBe(0)
    // 换牌：旧链首已用，新发满 5 张且不含旧链首。
    expect(s.used.has(headBefore)).toBe(true)
    expect(s.hand).toHaveLength(HAND_SIZE)
    expect(s.hand.some(e => e.word === headBefore)).toBe(false)
  })
})

describe('wordchain AI 策略确定性', () => {
  it('rng≥0.7 必跳过；rng<0.7 从词库找词接上并清零连跳计数', () => {
    const s = createMatch(99)
    s.rng = () => AI_PLAY_RATE
    const move = playerSkip(s)
    expect(move.type).toBe('skip')
    const s2 = createMatch(99)
    // 钉死链尾为「苹果」(尾 guo)：库里必有可接词（如果汁），rng=0 必接。
    s2.chain = [byWord('苹果')]
    s2.used = new Set(['苹果'])
    s2.rng = () => 0
    const move2 = playerSkip(s2)
    expect(move2.type).toBe('play')
    const ai = s2.aiLastMove
    expect(ai?.type).toBe('play')
    if (ai?.type === 'play' && ai.entry) {
      expect(linkKind(byWord('苹果'), ai.entry)).not.toBeNull()
      expect(s2.used.has(ai.entry.word)).toBe(true)
    }
    expect(s2.consecutiveSkips).toBe(0)
  })
})

describe('wordchain 整局流程与重放', () => {
  it('10 回合跑满终局并给出胜负', () => {
    const s = createMatch(2024)
    for (let i = 0; i < ROUNDS; i += 1) {
      const idx = playableIndices(s)[0]
      if (idx === undefined) playerSkip(s)
      else playerPlay(s, idx)
      if (s.phase === 'over') break
    }
    expect(s.phase).toBe('over')
    expect(finalResult(s)).not.toBeNull()
    expect(['player', 'ai', 'draw']).toContain(finalResult(s))
  })

  it('序列化重放：记录动作序列，同种子重放每个快照完全一致', () => {
    const run = playSkipScript(31337, 24)
    expect(run.actions.length).toBe(run.snapshots.length)
    const replayed = replayMatch(31337, run.actions)
    expect(replayed).toEqual(run.snapshots)
    // 不同种子产生不同轨迹（词库 300+，几乎必然不同）。
    const other = playSkipScript(31338, 24)
    expect(JSON.stringify(other.snapshots)).not.toEqual(JSON.stringify(run.snapshots))
  })
})
