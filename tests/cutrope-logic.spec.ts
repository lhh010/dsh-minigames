/**
 * 剪绳喂糖逻辑测试：Verlet 绳链悬垂、剪断响应、限剪、五关可解性
 * （含气泡关的浮空/戳破时机）、尖刺/错失/飞顶判负、命中判定与
 * seed 确定性重放。所有关卡均以离线穷举搜索验证过存在通关方案，
 * 这里固化搜索找到的具体操作帧（1 帧 = 1/60 s，与主循环一致）。
 */
import { describe, expect, it } from 'vitest'
import {
  LEVELS, createCutRope, cutRopeAt, mulberry32, popBubbleAt, segmentsIntersect, stepCutRope,
} from '../src/client/games/cutrope/logic.ts'

interface Act {
  f: number
  kind: 'cut' | 'pop'
  rope: number
}

/** 剪掉第 idx 根未剪的绳（剪刀线 = 过该绳锚点的竖直线，与主循环划线等价）。 */
function cutUncut(st: ReturnType<typeof createCutRope>, idx: number): boolean {
  const uncut = st.ropes.filter(r => !r.cut)
  if (uncut.length === 0) return false
  const pick = uncut[Math.min(idx, uncut.length - 1)]!
  return cutRopeAt(st, pick.ax, pick.ay - 40, pick.ax, pick.ay + 400)
}

/** 按帧脚本模拟一局（每帧 stepCutRope 1/60s，与 60fps 主循环一致）。 */
function simulate(seed: number, level: number, acts: Act[], frames = 500) {
  const st = createCutRope(seed, level)
  for (let f = 0; f < frames && st.phase === 'play'; f += 1) {
    for (const a of acts) {
      if (a.f !== f) continue
      if (a.kind === 'cut') cutUncut(st, a.rope)
      else if (st.bubble !== null) popBubbleAt(st, st.bubble.x, st.bubble.y)
    }
    stepCutRope(st, 1000 / 60)
  }
  return st
}

describe('cutrope logic', () => {
  it('mulberry32：同种子序列一致，异种子不同', () => {
    const a1 = mulberry32(42)
    const a2 = mulberry32(42)
    const b = mulberry32(43)
    const s1 = [a1(), a1(), a1(), a1()]
    const s2 = [a2(), a2(), a2(), a2()]
    expect(s1).toEqual(s2)
    expect(s1[0]).not.toBe(b())
    for (const v of s1) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of s1) expect(v).toBeLessThan(1)
  })

  it('悬垂物理：不剪糖果不下落，绳段长度守恒', () => {
    const st = simulate(7, 1, [])
    expect(st.phase).toBe('play')
    // 糖果仍悬在锚点下方（绳长 150），远未触地。
    const d = Math.hypot(st.candy.x - st.ropes[0]!.ax, st.candy.y - st.ropes[0]!.ay)
    expect(d).toBeGreaterThan(120)
    expect(d).toBeLessThan(175)
    expect(st.candy.y).toBeLessThan(300)
    // 绳段长度守恒（约束求解有效）。
    const chain = [...st.ropes[0]!.pts.map(p => ({ x: p.x, y: p.y })), { x: st.candy.x, y: st.candy.y }]
    for (let i = 0; i + 1 < chain.length; i += 1) {
      const seg = Math.hypot(chain[i + 1]!.x - chain[i]!.x, chain[i + 1]!.y - chain[i]!.y)
      expect(Math.abs(seg - st.ropes[0]!.rest)).toBeLessThan(3)
    }
  })

  it('剪断响应：一次剪一根，已剪的绳不可再剪，剪数扣减', () => {
    const st = createCutRope(1, 2)
    expect(st.cutsLeft).toBe(2)
    expect(cutUncut(st, 0)).toBe(true)
    expect(st.cutsLeft).toBe(1)
    expect(st.ropes[0]!.cut).toBe(true)
    // 同一条剪刀线只交自己（另一绳在右侧），不再命中任何绳。
    const r0 = st.ropes[0]!
    expect(cutRopeAt(st, r0.ax, r0.ay - 40, r0.ax, r0.ay + 400)).toBe(false)
    expect(st.cutsLeft).toBe(1)
    expect(cutUncut(st, 0)).toBe(true)
    expect(st.cutsLeft).toBe(0)
    expect(st.ropes.every(r => r.cut)).toBe(true)
  })

  it('限剪：剪数用尽后不可再剪', () => {
    const st = createCutRope(1, 1)
    expect(st.cutsLeft).toBe(1)
    expect(cutUncut(st, 0)).toBe(true)
    const r = st.ropes[0]!
    expect(cutRopeAt(st, 0, 0, W_(), H_())).toBe(false)
    void r
  })

  it('关卡 1：剪断直落喂糖，顺路吃星过关', () => {
    const st = simulate(12345, 1, [{ f: 0, kind: 'cut', rope: 0 }])
    expect(st.phase).toBe('won')
    expect(st.stars.filter(s => s.got).length).toBe(1)
    expect(st.events.some(e => e.type === 'star')).toBe(true)
    expect(st.events.some(e => e.type === 'win')).toBe(true)
  })

  it('关卡 2：双绳同剪直落，两星全收', () => {
    const st = simulate(12345, 2, [
      { f: 0, kind: 'cut', rope: 0 },
      { f: 0, kind: 'cut', rope: 0 },
    ])
    expect(st.phase).toBe('won')
    expect(st.stars.filter(s => s.got).length).toBe(2)
  })

  it('关卡 3：先剪左绳借摆荡，再剪右绳抛过尖刺入嘴', () => {
    const st = simulate(12345, 3, [
      { f: 0, kind: 'cut', rope: 0 },
      { f: 152, kind: 'cut', rope: 0 },
    ])
    expect(st.phase).toBe('won')
    expect(st.stars.filter(s => s.got).length).toBe(2)
    expect(st.events.some(e => e.type === 'fail')).toBe(false)
  })

  it('关卡 3：两绳同剪直落尖刺 → 糖果碎、扣一命', () => {
    const st = simulate(12345, 3, [
      { f: 0, kind: 'cut', rope: 0 },
      { f: 0, kind: 'cut', rope: 0 },
    ])
    expect(st.phase).toBe('lost')
    expect(st.lives).toBe(2)
    const failEv = st.events.find(e => e.type === 'fail')
    expect(failEv).toEqual({ type: 'fail', reason: 'spike' })
    expect(st.events.some(e => e.type === 'shatter')).toBe(true)
  })

  it('关卡 4：气泡接糖上浮，掐时机戳破落进高台怪物', () => {
    const st = simulate(12345, 4, [
      { f: 45, kind: 'cut', rope: 0 },
      { f: 242, kind: 'pop', rope: 0 },
    ])
    expect(st.events.some(e => e.type === 'bubble')).toBe(true)
    expect(st.events.some(e => e.type === 'pop')).toBe(true)
    expect(st.phase).toBe('won')
    expect(st.stars.filter(s => s.got).length).toBeGreaterThanOrEqual(1)
  })

  it('关卡 4：不戳气泡 → 糖果被带出顶部判负', () => {
    const st = simulate(12345, 4, [{ f: 5, kind: 'cut', rope: 0 }])
    expect(st.phase).toBe('lost')
    expect(st.events.find(e => e.type === 'fail')).toEqual({ type: 'fail', reason: 'flew' })
  })

  it('关卡 5：三绳 + 气泡长程飞行可解', () => {
    const st = simulate(12345, 5, [
      { f: 0, kind: 'cut', rope: 0 },
      { f: 85, kind: 'cut', rope: 0 },
      { f: 85, kind: 'cut', rope: 0 },
      { f: 218, kind: 'pop', rope: 0 },
    ])
    expect(st.phase).toBe('won')
    expect(st.cutsLeft).toBe(0)
  })

  it('错失判负：怪物移走后糖果落地静止超时（starved）扣命', () => {
    const st = createCutRope(9, 2)
    st.monster.x = 40
    for (let f = 0; f < 500 && st.phase === 'play'; f += 1) {
      if (f === 0) {
        cutUncut(st, 0)
        cutUncut(st, 0)
      }
      stepCutRope(st, 1000 / 60)
    }
    expect(st.phase).toBe('lost')
    expect(st.events.find(e => e.type === 'fail')).toEqual({ type: 'fail', reason: 'starved' })
    expect(st.lives).toBe(2)
  })

  it('命中判定：线段相交与气泡点破边界', () => {
    expect(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true)
    expect(segmentsIntersect(0, 0, 10, 0, 0, 5, 10, 5)).toBe(false)
    expect(segmentsIntersect(0, 0, 10, 0, 5, 1, 6, 2)).toBe(false)
    expect(segmentsIntersect(0, 0, 0, 10, -1, 5, 1, 5)).toBe(true)
    const st = createCutRope(3, 4)
    const bx = st.bubble!.x
    const by = st.bubble!.y
    expect(popBubbleAt(st, bx + 40, by)).toBe(false)
    expect(popBubbleAt(st, bx, by + 20)).toBe(true)
    expect(st.bubble!.popped).toBe(true)
    expect(popBubbleAt(st, bx, by)).toBe(false)
  })

  it('seed 确定性重放：同 seed 同操作逐位一致，异 seed 剪断冲量不同', () => {
    const plan: Act[] = [
      { f: 0, kind: 'cut', rope: 0 },
      { f: 152, kind: 'cut', rope: 0 },
    ]
    const a = simulate(777, 3, plan)
    const b = simulate(777, 3, plan)
    expect(a.candy.x).toBe(b.candy.x)
    expect(a.candy.y).toBe(b.candy.y)
    expect(a.timeMs).toBe(b.timeMs)
    expect(a.events).toEqual(b.events)
    // 不同 seed：剪断瞬间质点获得的冲量幅度不同（k = rng()*2.2+0.8）。
    const s1 = createCutRope(1, 1)
    const s2 = createCutRope(999, 1)
    cutUncut(s1, 0)
    cutUncut(s2, 0)
    // 剪断瞬间只有被冲量命中的质点 px/py 偏移（开局其余质点仍静止）。
    const kOf = (st: typeof s1): number => {
      let best = 0
      for (const p of st.ropes[0]!.pts) best = Math.max(best, Math.hypot(p.x - p.px, p.y - p.py))
      return best
    }
    expect(kOf(s1)).not.toBe(kOf(s2))
  })

  it('关卡表：5 关尺寸合法，所有实体都在画布内', () => {
    expect(LEVELS.length).toBe(5)
    LEVELS.forEach((spec, i) => {
      expect(spec.cuts).toBeGreaterThanOrEqual(spec.ropes.length)
      for (const r of spec.ropes) {
        expect(r.ax).toBeGreaterThan(0)
        expect(r.ax).toBeLessThan(640)
        expect(r.ay).toBeGreaterThan(40)
      }
      expect(spec.monster.y).toBeGreaterThan(150)
      expect(spec.monster.y).toBeLessThan(400)
      for (const s of spec.stars) {
        expect(s.x).toBeGreaterThan(20)
        expect(s.x).toBeLessThan(620)
        expect(s.y).toBeGreaterThan(60)
      }
      void i
    })
  })
})

function W_(): number { return 640 }
function H_(): number { return 440 }
