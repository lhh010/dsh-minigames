import { describe, expect, it } from 'vitest'
import {
  BLAST_SCALE,
  CLICK_BONUS,
  FIELD,
  LEVELS,
  LAYER_BASE,
  createLevelState,
  fire,
  makeOrb,
  nextLevel,
  step,
  FIXED_DT,
  type ChainRxnState,
  type Level,
} from '../src/client/games/chainrxn/logic.ts'

/** 构造最小盘面：覆写 orbs 与关卡参数，测试用确定性场景。 */
function bare(orbs: ChainRxnState['orbs'], level: Partial<Level> = {}): ChainRxnState {
  const s = createLevelState(0, 1)
  s.orbs = orbs
  s.level = { orbCount: orbs.length, goal: 999, clicks: 3, steel: 0, ...level }
  s.clicksLeft = s.level.clicks
  return s
}

/** 以固定步长推进 n 帧，收集全部引爆事件。 */
function run(s: ChainRxnState, frames: number): { layers: number[], absorbed: number } {
  const layers: number[] = []
  let absorbed = 0
  for (let i = 0; i < frames; i += 1) {
    const ev = step(s, FIXED_DT)
    absorbed += ev.absorbed
    for (const ig of ev.ignited) layers.push(ig.layer)
  }
  return { layers, absorbed }
}

describe('chainrxn logic', () => {
  it('orb 生成：seed 确定、半径 6-16、数量与关卡一致、位置在场内', () => {
    const a = createLevelState(0, 42)
    const b = createLevelState(0, 42)
    expect(a.orbs.map(o => [o.x, o.y, o.r, o.vx, o.vy])).toEqual(b.orbs.map(o => [o.x, o.y, o.r, o.vx, o.vy]))
    const c = createLevelState(0, 43)
    expect(c.orbs[0]!.x).not.toBe(a.orbs[0]!.x)
    expect(a.orbs).toHaveLength(LEVELS[0]!.orbCount)
    for (const o of a.orbs) {
      expect(o.r).toBeGreaterThanOrEqual(6)
      expect(o.r).toBeLessThanOrEqual(16)
      expect(o.x).toBeGreaterThan(FIELD.left)
      expect(o.x).toBeLessThan(FIELD.right)
      expect(o.y).toBeGreaterThan(FIELD.top)
      expect(o.y).toBeLessThan(FIELD.bottom)
      expect(o.kind).toBe('orb')
    }
  })

  it('关卡递进：5 关、orb 40-80、点击 3-5、第 4 关起有钢球', () => {
    expect(LEVELS).toHaveLength(5)
    for (const lv of LEVELS) {
      expect(lv.orbCount).toBeGreaterThanOrEqual(40)
      expect(lv.orbCount).toBeLessThanOrEqual(80)
      expect(lv.clicks).toBeGreaterThanOrEqual(3)
      expect(lv.clicks).toBeLessThanOrEqual(5)
    }
    expect(LEVELS.slice(0, 3).every(lv => lv.steel === 0)).toBe(true)
    expect(LEVELS[3]!.steel).toBeGreaterThan(0)
    const l4 = createLevelState(3, 7)
    expect(l4.orbs.filter(o => o.kind === 'steel')).toHaveLength(LEVELS[3]!.steel)
  })

  it('点击爆波：消耗点击、扩张到 30 后滞留消失、不波及远处 orb', () => {
    const s = bare([makeOrb(0, 600, 420, 8, 0, 0, 'orb')])
    expect(fire(s, 100, 100)).toBe(true)
    expect(s.clicksLeft).toBe(2)
    expect(s.phase).toBe('chain')
    let maxR = 0
    for (let i = 0; i < 12; i += 1) {
      step(s, FIXED_DT)
      maxR = Math.max(maxR, s.blasts[0]!.r)
    }
    expect(maxR).toBeGreaterThan(25) // 12 帧 × 130px/s ≈ 26px，扩张中
    run(s, 60)
    expect(s.blasts).toHaveLength(0)
    expect(s.exploded).toBe(0)
    expect(s.orbs[0]!.alive).toBe(true)
    expect(s.phase).toBe('aim') // 仍有点击，回到瞄准态
  })

  it('波及引爆：圆-圆判定、第 1 层 +10、新爆波半径 = r×3.5', () => {
    const s = bare([makeOrb(0, 100, 100, 10, 0, 0, 'orb')])
    fire(s, 100, 100)
    const { layers } = run(s, 40)
    expect(layers).toEqual([1])
    expect(s.exploded).toBe(1)
    expect(s.score).toBe(LAYER_BASE * 1)
    expect(s.orbs[0]!.alive).toBe(false)
    // 新爆波的最大半径已随引爆产生（消失前可查其扩张范围）
    expect(10 * BLAST_SCALE).toBe(35)
  })

  it('链式连锁：层序计分 10+20，逐帧逐层推进', () => {
    // orb A 半径 16（爆波 56）覆盖 40px 外的 orb B；B 的引爆层为 2。
    const s = bare([
      makeOrb(0, 100, 100, 16, 0, 0, 'orb'),
      makeOrb(1, 150, 100, 10, 0, 0, 'orb'),
    ])
    fire(s, 100, 100)
    const { layers } = run(s, 90)
    expect(layers).toEqual([1, 2])
    expect(s.exploded).toBe(2)
    expect(s.score).toBe(10 + 20)
    expect(s.phase).toBe('aim')
  })

  it('钢球阻挡：吸收爆波、不可引爆、保护身后的 orb', () => {
    const blocked = bare([
      makeOrb(0, 120, 100, 12, 0, 0, 'steel'),
      makeOrb(1, 128, 100, 8, 0, 0, 'orb'),
    ])
    fire(blocked, 100, 100)
    const r1 = run(blocked, 90)
    expect(r1.absorbed).toBe(1)
    expect(blocked.orbs[0]!.alive).toBe(true) // 钢球永不被引爆
    expect(blocked.orbs[1]!.alive).toBe(true) // 身后 orb 被保护
    expect(blocked.exploded).toBe(0)
    // 对照：没有钢球时同一 orb 会被引爆
    const open = bare([makeOrb(0, 128, 100, 8, 0, 0, 'orb')])
    fire(open, 100, 100)
    run(open, 90)
    expect(open.exploded).toBe(1)
  })

  it('目标达成：引爆数达标过关、剩余点击折算加分', () => {
    const s = bare([makeOrb(0, 320, 230, 14, 0, 0, 'orb')], { goal: 1, clicks: 3 })
    fire(s, 320, 230)
    run(s, 90)
    expect(s.phase).toBe('won')
    expect(s.score).toBe(10 + 2 * CLICK_BONUS)
  })

  it('点击耗尽且未达标：判负', () => {
    const s = bare([makeOrb(0, 600, 420, 8, 0, 0, 'orb')], { goal: 5, clicks: 1 })
    fire(s, 100, 100) // 空处引爆，打不到任何 orb
    run(s, 90)
    expect(s.phase).toBe('lost')
    expect(fire(s, 200, 200)).toBe(false) // 终局不可再点击
  })

  it('seed 重放：同 seed 同点击同帧数 → 盘面与计分完全一致', () => {
    const play = (): Record<string, unknown> => {
      const s = createLevelState(2, 999)
      fire(s, 320, 230)
      for (let i = 0; i < 600; i += 1) {
        step(s, FIXED_DT)
        if (i === 200 && s.clicksLeft > 0) fire(s, 120, 400)
      }
      return {
        score: s.score,
        exploded: s.exploded,
        phase: s.phase,
        orbs: s.orbs.map(o => [Math.round(o.x * 1000), Math.round(o.y * 1000), o.alive ? 1 : 0]),
      }
    }
    expect(play()).toEqual(play())
    const other = createLevelState(2, 1000)
    expect(other.orbs[5]!.x).not.toBe(createLevelState(2, 999).orbs[5]!.x)
  })

  it('漂移反弹：长时间漂移后全部 orb 仍在场地内', () => {
    const s = createLevelState(4, 5)
    run(s, 2000)
    for (const o of s.orbs) {
      expect(o.x).toBeGreaterThanOrEqual(FIELD.left + o.r - 0.001)
      expect(o.x).toBeLessThanOrEqual(FIELD.right - o.r + 0.001)
      expect(o.y).toBeGreaterThanOrEqual(FIELD.top + o.r - 0.001)
      expect(o.y).toBeLessThanOrEqual(FIELD.bottom - o.r + 0.001)
    }
  })

  it('nextLevel：过关推进并保留总分，末关过关进入通关，非过关拒绝', () => {
    const s = bare([makeOrb(0, 320, 230, 14, 0, 0, 'orb')], { goal: 1, clicks: 1 })
    expect(nextLevel(s)).toBe(false)
    fire(s, 320, 230)
    run(s, 90)
    expect(s.phase).toBe('won')
    expect(nextLevel(s)).toBe(true)
    expect(s.levelIndex).toBe(1)
    expect(s.score).toBe(10) // 总分保留，盘面重置
    expect(s.orbs).toHaveLength(LEVELS[1]!.orbCount)
    // 快进到末关通关
    const last = createLevelState(4, 1)
    last.phase = 'won'
    expect(nextLevel(last)).toBe(true)
    expect(last.phase).toBe('cleared')
  })
})
