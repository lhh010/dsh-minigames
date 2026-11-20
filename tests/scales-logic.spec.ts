import { describe, expect, it } from 'vitest'
import {
  LEVELS, accuse, candidatesAfter, createScalesState, expire, levelParams, minWeighings,
  mulberry32, scoreFor, weigh, type FakeSetup, type ScalesState, type Weighing,
} from '../src/client/games/scales/logic.ts'

describe('scales logic', () => {
  it('levelParams：前四关按表返回，第 5 关 rng 取 9-15 枚并按信息论下限定次数', () => {
    expect(levelParams(1)).toEqual({ coins: 12, weighings: 3, assistant: true, timeLimitSec: null })
    expect(levelParams(2)).toEqual({ coins: 8, weighings: 2, assistant: true, timeLimitSec: null })
    expect(levelParams(3)).toEqual({ coins: 13, weighings: 3, assistant: true, timeLimitSec: null })
    expect(levelParams(4)).toEqual({ coins: 12, weighings: 3, assistant: false, timeLimitSec: 180 })
    // 关卡号越界钳制。
    expect(levelParams(0).coins).toBe(12)
    expect(levelParams(99).assistant).toBe(false)
    // 第 5 关：9-15 枚，次数 = minWeighings(coins)。
    for (let seed = 1; seed <= 40; seed += 1) {
      const p = levelParams(5, mulberry32(seed))
      expect(p.coins).toBeGreaterThanOrEqual(9)
      expect(p.coins).toBeLessThanOrEqual(15)
      expect(p.weighings).toBe(minWeighings(p.coins))
    }
    expect(LEVELS).toHaveLength(5)
  })

  it('minWeighings：最小 k 使 3^k ≥ 2N', () => {
    expect(minWeighings(3)).toBe(2) // 6 ≤ 9
    expect(minWeighings(4)).toBe(2) // 8 ≤ 9
    expect(minWeighings(5)).toBe(3) // 10 > 9
    expect(minWeighings(12)).toBe(3) // 24 ≤ 27
    expect(minWeighings(13)).toBe(3) // 26 ≤ 27
    expect(minWeighings(14)).toBe(4) // 28 > 27
    expect(minWeighings(15)).toBe(4)
  })

  it('createScalesState：同 seed 同局面（重放）、谜底在界内、不同 seed 覆盖两种轻重', () => {
    const a = createScalesState(1, 42)
    const b = createScalesState(1, 42)
    expect(a).toEqual(b)
    expect(a.setup.coin).toBeGreaterThanOrEqual(0)
    expect(a.setup.coin).toBeLessThan(a.params.coins)
    expect(a.history).toEqual([])
    expect(a.status).toBe('playing')
    // 种子扫描：假币位置分布到首尾、轻重两态都出现。
    const coinsSeen = new Set<number>()
    let heavySeen = false
    let lightSeen = false
    for (let seed = 1; seed <= 120; seed += 1) {
      const s = createScalesState(1, seed)
      coinsSeen.add(s.setup.coin)
      if (s.setup.heavy) heavySeen = true
      else lightSeen = true
    }
    expect(coinsSeen.size).toBe(12)
    expect(heavySeen).toBe(true)
    expect(lightSeen).toBe(true)
    // 完整重放：同一 seed 下同样的称量序列得到同样的历史。
    const w = weigh(a, [0, 1, 2], [3, 4, 5])!
    const w2 = weigh(b, [0, 1, 2], [3, 4, 5])!
    expect(w.history).toEqual(w2.history)
  })

  it('weigh 校验：不等数/空盘/重复/跨盘重复/越界/次数用尽/已结束 → null 且不耗次数', () => {
    const s = createScalesState(1, 7)
    expect(weigh(s, [0], [])).toBeNull()
    expect(weigh(s, [0, 1], [2])).toBeNull()
    expect(weigh(s, [], [])).toBeNull()
    expect(weigh(s, [0, 0], [1, 2])).toBeNull()
    expect(weigh(s, [0, 1], [1, 2])).toBeNull()
    expect(weigh(s, [0, 11], [1, 12])).toBeNull() // 12 号越界
    expect(weigh(s, [-1], [0])).toBeNull()
    // 三次合法称量后第四次拒绝。
    let s2: ScalesState = s
    for (let i = 0; i < 3; i += 1) {
      const next = weigh(s2, [0], [1])
      expect(next).not.toBeNull()
      s2 = next!
    }
    expect(s2.history).toHaveLength(3)
    expect(weigh(s2, [2], [3])).toBeNull()
    // 已结束局面冻结。
    const done = accuse(s2, s2.setup.coin, s2.setup.heavy)!
    expect(done.status).toBe('won')
    expect(weigh(done, [0], [1])).toBeNull()
  })

  it('weigh 结果三态由谜底决定，且状态不可变（入参不被修改）', () => {
    // 找一枚 3 号偏重的种子。
    let heavyState: ScalesState | null = null
    for (let seed = 1; seed <= 200; seed += 1) {
      const s = createScalesState(1, seed)
      if (s.setup.coin === 3 && s.setup.heavy) { heavyState = s; break }
    }
    expect(heavyState).not.toBeNull()
    const s = heavyState!
    const snapshot = JSON.parse(JSON.stringify(s)) as ScalesState
    // 假币在左 → 左重；在右 → 右重；不在盘上 → 平衡。
    expect(weigh(s, [3], [0])!.history[0]!.result).toBe('left')
    expect(weigh(s, [0], [3])!.history[0]!.result).toBe('right')
    expect(weigh(s, [0, 1], [2, 4])!.history[0]!.result).toBe('balance')
    // 偏轻对称情形。
    let lightState: ScalesState | null = null
    for (let seed = 1; seed <= 200; seed += 1) {
      const t = createScalesState(1, seed)
      if (t.setup.coin === 3 && !t.setup.heavy) { lightState = t; break }
    }
    const l = lightState!
    expect(weigh(l, [3], [0])!.history[0]!.result).toBe('right')
    expect(weigh(l, [0], [3])!.history[0]!.result).toBe('left')
    expect(s).toEqual(snapshot)
  })

  it('candidatesAfter：空历史为全部 2N 种；平衡结果排除盘上硬币的全部假设', () => {
    const all = candidatesAfter([], 12)
    expect(all).toHaveLength(24)
    expect(all[0]).toEqual({ coin: 0, heavy: true } satisfies FakeSetup)
    const w: Weighing = { left: [0, 1, 2, 3], right: [4, 5, 6, 7], result: 'balance' }
    const cands = candidatesAfter([w], 12)
    // 盘上 8 枚全部排除，只剩 8,9,10,11 各两种。
    expect(cands).toHaveLength(8)
    expect(cands.every(c => c.coin >= 8)).toBe(true)
  })

  it('candidatesAfter：经典三步收缩到唯一谜底（手算对照）', () => {
    // 构造 0 号偏重的谜面，手算三次称量的候选收缩。
    let s: ScalesState | null = null
    for (let seed = 1; seed <= 300; seed += 1) {
      const t = createScalesState(1, seed)
      if (t.setup.coin === 0 && t.setup.heavy) { s = t; break }
    }
    expect(s).not.toBeNull()
    const st = s!
    const key = (cs: readonly FakeSetup[]): string[] => cs.map(c => (c.coin + 1) + (c.heavy ? '↑' : '↓'))
    // ① 1234 vs 5678 → 左重：候选 {1-4↑, 5-8↓}。
    const s1 = weigh(st, [0, 1, 2, 3], [4, 5, 6, 7])!
    expect(s1.history[0]!.result).toBe('left')
    expect(key(candidatesAfter(s1.history, 12))).toEqual(['1↑', '2↑', '3↑', '4↑', '5↓', '6↓', '7↓', '8↓'])
    // ② 1,2,5 vs 3,6,9 → 左重：候选 {1↑, 2↑, 6↓}。
    const s2 = weigh(s1, [0, 1, 4], [2, 5, 8])!
    expect(s2.history[1]!.result).toBe('left')
    expect(key(candidatesAfter(s2.history, 12))).toEqual(['1↑', '2↑', '6↓'])
    // ③ 1 vs 2 → 左重：唯一谜底 1↑。
    const s3 = weigh(s2, [0], [1])!
    expect(s3.history[2]!.result).toBe('left')
    const final = candidatesAfter(s3.history, 12)
    expect(final).toEqual([{ coin: 0, heavy: true }])
  })

  it('完整对局：信息论一致性——真谜底永远在候选内且候选不增；指认正确过关、错误判负', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const s0 = createScalesState(1, seed)
      let s = s0
      let prevCount = candidatesAfter([], 12).length
      for (let i = 0; i < 3; i += 1) {
        // 依次用不相交的固定三段称量（每次结果由谜底决定）。
        const left = [i * 4, i * 4 + 1, i * 4 + 2]
        const right = [(48 - i * 4 + 3) % 12, (i * 4 + 4) % 12, (i * 4 + 5) % 12]
        const next = weigh(s, left, right)
        expect(next).not.toBeNull()
        s = next!
        const cands = candidatesAfter(s.history, 12)
        expect(cands).toContainEqual(s0.setup)
        expect(cands.length).toBeLessThanOrEqual(prevCount)
        prevCount = cands.length
      }
      // 指认错误 → lost 且带 wrong 原因。
      const wrongCoin = (s0.setup.coin + 3) % 12
      const wrongHeavy = !s0.setup.heavy
      const lost = accuse(s, wrongCoin, wrongHeavy)!
      expect(lost.status).toBe('lost')
      expect(lost.lostReason).toBe('wrong')
      expect(accuse(lost, s0.setup.coin, s0.setup.heavy)).toBeNull() // 已结束冻结
    }
  })

  it('accuse：可提前指认、越界拒绝；expire 超时判负', () => {
    const s = createScalesState(2, 9)
    // 一次未称也可直接指认。
    const won = accuse(s, s.setup.coin, s.setup.heavy)!
    expect(won.status).toBe('won')
    expect(won.lostReason).toBeNull()
    expect(accuse(s, 99, true)).toBeNull()
    expect(accuse(s, -1, false)).toBeNull()
    // 超时：playing → lost/timeout；已结束原样返回。
    const t = createScalesState(4, 5)
    const timedOut = expire(t)
    expect(timedOut.status).toBe('lost')
    expect(timedOut.lostReason).toBe('timeout')
    expect(expire(timedOut)).toBe(timedOut)
    expect(expire(won)).toBe(won)
  })

  it('scoreFor：关卡 ×100，用过助手减半', () => {
    expect(scoreFor(1, false)).toBe(100)
    expect(scoreFor(5, false)).toBe(500)
    expect(scoreFor(3, true)).toBe(150)
    expect(scoreFor(5, true)).toBe(250)
  })

  it('第 5 关与第 2 关参数一致性：状态里的 params 与 levelParams 同种子一致', () => {
    for (const level of [2, 3, 5]) {
      const s = createScalesState(level, 321)
      expect(s.level).toBe(level)
      expect(s.params).toEqual(levelParams(level, mulberry32(321)))
      expect(s.setup.coin).toBeLessThan(s.params.coins)
    }
    // 第 4 关限时 180 秒。
    expect(createScalesState(4, 1).params.timeLimitSec).toBe(180)
    expect(createScalesState(1, 1).params.timeLimitSec).toBeNull()
  })
})
