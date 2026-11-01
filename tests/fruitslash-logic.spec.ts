import { describe, expect, it } from 'vitest'
import {
  BOMB_CHAIN_MIN_LEVEL, FRUIT_KINDS, TRAIL_MAX, beginSwipe, bombChance,
  bombChainChance, createFruitSlash, levelOf, mulberry32, pushTrail, settleSwipe,
  stepFruitSlash, waveInterval,
} from '../src/client/games/fruitslash/logic.ts'

const snapshot = (s: ReturnType<typeof createFruitSlash>) => ({
  t: s.t, timeLeft: s.timeLeft, score: s.score, lives: s.lives,
  missed: s.missed, combo: s.combo, fruits: s.fruits, halves: s.halves,
  trail: s.trail, floats: s.floats, nextWaveAt: s.nextWaveAt, over: s.over,
})

describe('fruitslash logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('levelOf and waveInterval scale with score and clamp', () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(99)).toBe(1)
    expect(levelOf(100)).toBe(2)
    expect(levelOf(250)).toBe(3)
    expect(waveInterval(1)).toBe(1500)
    expect(waveInterval(2)).toBe(1340)
    expect(waveInterval(50)).toBe(420)
  })

  it('bomb chance and bomb-chain chance rise with level and clamp', () => {
    expect(bombChance(1)).toBe(0.15)
    expect(bombChance(5)).toBeCloseTo(0.23)
    expect(bombChance(20)).toBe(0.30)
    expect(bombChainChance(1)).toBe(0)
    expect(bombChainChance(BOMB_CHAIN_MIN_LEVEL)).toBeCloseTo(0.03)
    expect(bombChainChance(50)).toBe(0.25)
  })

  it('fruit kinds: 8 entries, smaller fruits score more', () => {
    expect(FRUIT_KINDS.length).toBe(8)
    expect(FRUIT_KINDS[0]!.name).toBe('西瓜')
    expect(FRUIT_KINDS[0]!.score).toBe(5)
    const strawberry = FRUIT_KINDS.find(k => k.name === '草莓')!
    expect(strawberry.score).toBe(15)
    expect(FRUIT_KINDS.find(k => k.name === '猕猴桃')!.score).toBe(20)
  })

  it('createFruitSlash is deterministic per seed and round', () => {
    const a = createFruitSlash(2026, 2)
    const b = createFruitSlash(2026, 2)
    expect(snapshot(a)).toEqual(snapshot(b))
    expect([a.rng(), a.rng()]).toEqual([b.rng(), b.rng()])
    expect(a.lives).toBe(5)
    expect(a.timeLeft).toBe(60_000)
    expect(a.over).toBe(false)
  })

  it('simulation is deterministic for the same seed', () => {
    const run = () => {
      const s = createFruitSlash(77, 1)
      for (let i = 0; i < 600; i += 1) stepFruitSlash(s, 16)
      return snapshot(s)
    }
    expect(run()).toEqual(run())
  })

  it('pushTrail caps the trail length', () => {
    const s = createFruitSlash(1)
    for (let i = 0; i < 40; i += 1) pushTrail(s, i, i)
    expect(s.trail.length).toBeLessThanOrEqual(TRAIL_MAX)
  })

  it('slicing a fruit scores and emits an event; a bomb costs a life', () => {
    const s = createFruitSlash(9)
    s.fruits.push({ kind: 1, x: 240, y: 300, vx: 0, vy: 0, r: 20, bomb: false })
    for (let x = 180; x <= 300; x += 20) pushTrail(s, x, 300)
    stepFruitSlash(s, 16)
    expect(s.score).toBeGreaterThanOrEqual(10)
    expect(s.events.some(e => e.type === 'slice')).toBe(true)
    expect(s.fruits.length).toBe(0)

    const b = createFruitSlash(9)
    b.fruits.push({ kind: 0, x: 240, y: 300, vx: 0, vy: 0, r: 16, bomb: true })
    for (let x = 180; x <= 300; x += 20) pushTrail(b, x, 300)
    stepFruitSlash(b, 16)
    expect(b.lives).toBe(4)
    expect(b.events.some(e => e.type === 'bomb')).toBe(true)
  })

  it('a missed fruit costs one life immediately and counts missed', () => {
    const s = createFruitSlash(9)
    s.fruits.push({ kind: 1, x: 240, y: H_DROP, vx: 0, vy: 200, r: 20, bomb: false })
    stepFruitSlash(s, 16)
    expect(s.fruits.length).toBe(0)
    expect(s.missed).toBe(1)
    expect(s.lives).toBe(4)
    expect(s.over).toBe(false)
  })

  it('settleSwipe adds same-kind bonus of 0.5x kind score per fruit', () => {
    const s = createFruitSlash(9)
    beginSwipe(s)
    // 两个苹果（kind 1，分值 10）：基础分在切开时入账 10 + 10。
    s.swipeCuts.push({ kind: 1, x: 100, y: 200 }, { kind: 1, x: 110, y: 210 })
    s.swipeBase = 20
    const r = settleSwipe(s)
    expect(r.cuts).toBe(2)
    // 同种奖励 = 2 × 10 × 0.5 = 10；多切乘 (1+0.1) → 30 × 1.1 = 33，multi = 3。
    expect(r.sameKindBonus).toBe(10)
    expect(r.multiBonus).toBe(3)
    expect(r.total).toBe(33)
    expect(s.score).toBe(13)
    expect(s.floats.some(f => f.text === '同种连击!')).toBe(true)
    expect(s.swiping).toBe(false)
  })

  it('settleSwipe: single cut has no bonus, N>=3 shows multi-cut float', () => {
    const s = createFruitSlash(9)
    beginSwipe(s)
    s.swipeCuts.push({ kind: 4, x: 100, y: 200 })
    s.swipeBase = 15
    const single = settleSwipe(s)
    expect(single.sameKindBonus).toBe(0)
    expect(single.multiBonus).toBe(0)
    expect(single.total).toBe(15)
    expect(s.score).toBe(0)

    beginSwipe(s)
    // 三种不同水果各一个：无同种奖励，×(1+0.2) 上浮。
    s.swipeCuts.push({ kind: 0, x: 100, y: 200 }, { kind: 1, x: 120, y: 220 }, { kind: 2, x: 140, y: 240 })
    s.swipeBase = 25
    const multi = settleSwipe(s)
    expect(multi.sameKindBonus).toBe(0)
    expect(multi.multiBonus).toBe(5)
    expect(multi.total).toBe(30)
    expect(s.floats.some(f => f.text === '一刀 3 切!')).toBe(true)
  })

  it('slicing during a swipe accumulates cuts and base for settleSwipe', () => {
    const s = createFruitSlash(9)
    beginSwipe(s)
    s.fruits.push({ kind: 1, x: 240, y: 300, vx: 0, vy: 0, r: 20, bomb: false })
    s.fruits.push({ kind: 1, x: 260, y: 300, vx: 0, vy: 0, r: 20, bomb: false })
    for (let x = 180; x <= 320; x += 10) pushTrail(s, x, 300)
    stepFruitSlash(s, 16)
    expect(s.swiping).toBe(true)
    expect(s.swipeCuts).toHaveLength(2)
    const r = settleSwipe(s)
    expect(r.cuts).toBe(2)
    // 基础分 10+15（第二刀连击 +5），同种 2×10×0.5=10，(10+15+10)×1.1=39（取整）。
    expect(r.base).toBe(25)
    expect(r.sameKindBonus).toBe(10)
    expect(r.multiBonus).toBe(4)
    expect(r.total).toBe(39)
  })
})

/** 漏接测试用的落底 y：已越过底部回收线。 */
const H_DROP = 700
