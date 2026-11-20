import { describe, expect, it } from 'vitest'
import {
  createTreasureState, probe, enterIdentify, identify, toggleHelper, useHint,
  mulberry32, referenceDist2, dist2, LEVELS,
  type TreasureState,
} from '../src/client/games/treasure/logic.ts'

/** 造一局受控状态：第 1 关盘面，宝藏钉死在 (4, 4)，无假宝藏。 */
function craft(treasureR = 4, treasureC = 4, fakes: Array<{ r: number, c: number }> = []): TreasureState {
  const state = createTreasureState(1)
  state.treasure = { r: treasureR, c: treasureC }
  state.fakes = fakes
  return state
}

describe('treasure logic', () => {
  it('seed 确定性：mulberry32 序列稳定，同种子布置一致，异种子不同', () => {
    const r1 = mulberry32(11)
    const r2 = mulberry32(11)
    for (let i = 0; i < 100; i += 1) {
      const v = r1()
      expect(v).toBe(r2())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const a1 = createTreasureState(42)
    const a2 = createTreasureState(42)
    expect(a1.treasure).toEqual(a2.treasure)
    expect(a1.fakes).toEqual(a2.fakes)
    expect(JSON.stringify(a1.decor)).toBe(JSON.stringify(a2.decor))
    // 多个不同种子至少产生一组不同的宝藏布置。
    const spots = new Set<string>()
    for (let s = 1; s <= 20; s += 1) {
      const st = createTreasureState(s)
      spots.add(st.treasure.r + ',' + st.treasure.c)
    }
    expect(spots.size).toBeGreaterThan(1)
  })

  it('关卡递进：探测次数 9→6 递减，第 4 关起有 2 个假宝藏', () => {
    expect(LEVELS).toHaveLength(5)
    expect(LEVELS.map(l => l.probes)).toEqual([9, 8, 7, 6, 6])
    expect(LEVELS[3]!.fakes).toBe(2)
    expect(LEVELS[4]!.fakes).toBe(2)
    // 第 1 关无假宝藏；第 4 关的假宝藏布置由过关推进测试覆盖。
    expect(createTreasureState(100).fakes).toHaveLength(0)
    // 盘面逐关增大。
    expect(LEVELS[0]!.cols).toBeLessThan(LEVELS[4]!.cols)
  })

  it('首探无比较返回 first，历史记录坐标与反馈', () => {
    const state = craft()
    const fb = probe(state, 0, 0)
    expect(fb).toBe('first')
    expect(state.history).toEqual([{ r: 0, c: 0, feedback: 'first' }])
    expect(state.probesLeft).toBe(8)
  })

  it('三态反馈：更近 hotter / 更远 colder / 等距 same（欧氏距离整数比较）', () => {
    const state = craft(4, 4)
    expect(probe(state, 0, 0)).toBe('first') // 距离平方 32
    expect(probe(state, 2, 2)).toBe('hotter') // 8 < 32
    expect(probe(state, 0, 0)).toBe('colder') // 32 > 8
    expect(probe(state, 2, 4)).toBe('hotter') // 4 < 32（与上一次 (0,0) 比）
    expect(probe(state, 4, 2)).toBe('same') // 4 == 4（等距圆环）
    expect(probe(state, 1, 4)).toBe('colder') // 9 > 4
  })

  it('探测次数门控：耗尽自动进入指认阶段，继续探测被拒', () => {
    const state = craft()
    const total = LEVELS[0]!.probes
    for (let i = 0; i < total; i += 1) expect(probe(state, 0, i % state.cols)).not.toBeNull()
    expect(state.probesLeft).toBe(0)
    expect(state.phase).toBe('identify')
    expect(probe(state, 1, 1)).toBeNull()
    expect(state.history).toHaveLength(total)
  })

  it('第 4 关起反馈按最近假宝藏计算（与真宝藏无关）', () => {
    const state = craft(5, 5, [{ r: 0, c: 0 }, { r: 0, c: 9 }])
    // 两探测点到真宝藏距离悬殊，但到最近假宝藏均为 1 → same。
    expect(probe(state, 0, 1)).toBe('first')
    expect(probe(state, 0, 8)).toBe('same')
    expect(referenceDist2(state, 0, 1)).toBe(1)
    expect(referenceDist2(state, 0, 8)).toBe(1)
    // 无假宝藏时参考即真宝藏。
    const clean = craft(5, 5)
    expect(referenceDist2(clean, 5, 7)).toBe(dist2(5, 7, 5, 5))
  })

  it('指认正确过关计分：基础分 + 剩余探测加成，助手开启减半', () => {
    const early = craft()
    probe(early, 0, 0)
    enterIdentify(early) // 提前指认，保留 8 次
    expect(early.phase).toBe('identify')
    expect(identify(early, 4, 4)).toBe('correct')
    expect(early.score).toBe(120 + 8 * 60)

    const helper = craft()
    toggleHelper(helper)
    expect(helper.helperOn).toBe(true)
    probe(helper, 0, 0)
    enterIdentify(helper)
    identify(helper, 4, 4)
    expect(helper.score).toBe(Math.floor((120 + 8 * 60) / 2))
  })

  it('指认错误（空格或假宝藏）即失败，越界/阶段错误返回 null', () => {
    const wrong = craft()
    enterIdentify(wrong)
    expect(identify(wrong, 0, 0)).toBe('wrong')
    expect(wrong.phase).toBe('lost')

    const fakeHit = craft(5, 5, [{ r: 0, c: 0 }])
    enterIdentify(fakeHit)
    expect(identify(fakeHit, 0, 0)).toBe('wrong') // 指到假宝藏同样失败

    const gated = craft()
    expect(identify(gated, 4, 4)).toBeNull() // 仍在探测阶段
    expect(identify(craft(), -1, 0)).toBeNull()
  })

  it('H 提示：排除约 1/3 且必不含真宝藏，每关限用 1 次', () => {
    const state = craft(3, 7)
    expect(useHint(state)).toBe(true)
    const cells = state.rows * state.cols
    let excluded = 0
    for (let r = 0; r < state.rows; r += 1) {
      for (let c = 0; c < state.cols; c += 1) if (state.excluded[r]![c]) excluded += 1
    }
    expect(excluded).toBeGreaterThanOrEqual(Math.floor(cells / 3))
    expect(excluded).toBeLessThanOrEqual(Math.ceil(cells / 3))
    expect(state.excluded[3]![7]).toBe(false)
    expect(useHint(state)).toBe(false)
  })

  it('过关推进：非最终关加载下一关并重置探测，第 5 关通关', () => {
    const state = craft()
    enterIdentify(state)
    identify(state, 4, 4)
    expect(state.level).toBe(2)
    expect(state.probesLeft).toBe(LEVELS[1]!.probes)
    expect(state.phase).toBe('probe')
    expect(state.history).toHaveLength(0)
    // 推进到第 4 关验证假宝藏布置存在。
    let guard = 0
    while (state.level < 4 && guard < 10) {
      guard += 1
      enterIdentify(state)
      // 指认真宝藏。
      identify(state, state.treasure.r, state.treasure.c)
    }
    expect(state.level).toBe(4)
    expect(state.fakes).toHaveLength(2)
    state.level = 5
    // 第 5 关：直接借当前盘面指认（level 已置 5）。
    enterIdentify(state)
    expect(identify(state, state.treasure.r, state.treasure.c)).toBe('correct')
    expect(state.phase).toBe('won')
  })

  it('确定性重放：同种子同探测/指认序列状态完全一致', () => {
    const run = (): string => {
      const state = createTreasureState(321)
      for (let i = 0; i < 6; i += 1) probe(state, (i * 3) % state.rows, (i * 5) % state.cols)
      enterIdentify(state)
      identify(state, state.treasure.r, state.treasure.c)
      for (let i = 0; i < 4; i += 1) probe(state, i, i)
      useHint(state)
      return JSON.stringify({
        level: state.level, treasure: state.treasure, fakes: state.fakes,
        decor: state.decor, probesLeft: state.probesLeft, history: state.history,
        phase: state.phase, excluded: state.excluded, score: state.score, hintUsed: state.hintUsed,
      })
    }
    expect(run()).toBe(run())
  })
})
