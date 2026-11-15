import { describe, expect, it } from 'vitest'
import {
  BOMB_SCORE, buildBomb, createDefuse, cutWire, CUT_SCORE, DEFUSE_MS, evaluateRules, MAX_BOMBS,
  mulberry32, panelFacts, remainingMustCuts, ruleText, rulesFor, stepDefuse, timeFor, WIN_SCORE,
  wiresFor, type DefuseRule, type WireColor,
} from '../src/client/games/defuse/logic.ts'

/** 便捷造事实：默认 5 根线、无标记、无重复字母序列号、1 节电池。 */
function factsOf(
  wires: WireColor[], mark = '', serial = 'ABC12', batteries = 1,
): ReturnType<typeof panelFacts> {
  return panelFacts(wires, mark, serial, batteries)
}

describe('defuse logic', () => {
  it('derives panel facts: color counts, star mark, duplicate letters, last color', () => {
    const f = factsOf(['red', 'blue', 'red', 'white', 'blue'], '★', 'ABA33', 2)
    expect(f.wireCount).toBe(5)
    expect(f.colorCount.red).toBe(2)
    expect(f.colorCount.blue).toBe(2)
    expect(f.colorCount.white).toBe(1)
    expect(f.colorCount.green).toBe(0)
    expect(f.hasStar).toBe(true)
    expect(f.duplicateLetter).toBe(true)
    expect(f.lastColor).toBe('blue')
    const g = factsOf(['green'], '●', 'XYZ99', 0)
    expect(g.hasStar).toBe(false)
    expect(g.duplicateLetter).toBe(false)
    expect(g.lastColor).toBe('green')
  })

  it('evaluates every rule type: condition gates must/forbid colors', () => {
    const odd = factsOf(['red', 'blue', 'green'], '', 'ABC12', 1)
    // 无星 → 剪红；线数奇 → 剪最右线颜色（绿）。
    const v1 = evaluateRules([{ type: 'noStarCutRed' }, { type: 'oddWiresCutLast' }], odd)
    expect(v1.mustColors).toEqual(['red', 'green'])
    // 有星 → noStarCutRed 不生效。
    const star = factsOf(['red', 'blue', 'green'], '★', 'ABC12', 1)
    expect(evaluateRules([{ type: 'noStarCutRed' }], star).mustColors).toEqual([])
    // 蓝偶数 → 禁绿；蓝奇数 → 不禁。
    const twoBlue = factsOf(['blue', 'blue', 'red'], '', 'ABC12', 0)
    const oneBlue = factsOf(['blue', 'red', 'yellow'], '', 'ABC12', 0)
    expect(evaluateRules([{ type: 'evenBlueForbidGreen' }], twoBlue).forbidColors).toEqual(['green'])
    expect(evaluateRules([{ type: 'evenBlueForbidGreen' }], oneBlue).forbidColors).toEqual([])
    // 重复字母 → 红、黄都禁。
    const dup = factsOf(['red', 'yellow', 'blue'], '', 'ABA33', 0)
    expect(evaluateRules([{ type: 'dupLetterForbidRedYellow' }], dup).forbidColors).toEqual(['red', 'yellow'])
    // 电池 ≥2 → 剪黄；电池奇数 → 剪蓝。
    expect(evaluateRules([{ type: 'batteries2CutYellow' }], factsOf(['yellow'], '', 'ABC12', 2)).mustColors).toEqual(['yellow'])
    expect(evaluateRules([{ type: 'oddBatteriesCutBlue' }], factsOf(['blue'], '', 'ABC12', 3)).mustColors).toEqual(['blue'])
    // 无白线 → 禁蓝；恰一根绿 → 剪绿。
    const noWhite = factsOf(['red', 'blue', 'green'], '', 'ABC12', 0)
    expect(evaluateRules([{ type: 'noWhiteForbidBlue' }], noWhite).forbidColors).toEqual(['blue'])
    expect(evaluateRules([{ type: 'noWhiteForbidBlue' }], factsOf(['white', 'blue'], '', 'ABC12', 0)).forbidColors).toEqual([])
    expect(evaluateRules([{ type: 'singleGreenCutGreen' }], factsOf(['green', 'red'], '', 'ABC12', 0)).mustColors).toEqual(['green'])
    expect(evaluateRules([{ type: 'singleGreenCutGreen' }], factsOf(['green', 'green'], '', 'ABC12', 0)).mustColors).toEqual([])
    // 每种规则都有非空展示文本。
    const allTypes = ['noStarCutRed', 'evenBlueForbidGreen', 'dupLetterForbidRedYellow', 'batteries2CutYellow',
      'oddWiresCutLast', 'noWhiteForbidBlue', 'singleGreenCutGreen', 'oddBatteriesCutBlue'] as const
    for (const t of allTypes) expect(ruleText({ type: t } as DefuseRule).length).toBeGreaterThan(6)
  })

  it('builds deterministic, solvable, non-contradictory bombs with progressive difficulty', () => {
    const a = buildBomb(42, 1, 0)
    const b = buildBomb(42, 1, 0)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(buildBomb(43, 1, 0)))
    for (let i = 0; i < MAX_BOMBS; i += 1) {
      const bomb = buildBomb(7, 1, i)
      expect(bomb.wires.length).toBe(wiresFor(i))
      expect(bomb.rules.length).toBe(rulesFor(i))
      expect(bomb.rules.length).toBeGreaterThanOrEqual(2)
      expect(bomb.rules.length).toBeLessThanOrEqual(3)
      // 规则类型不重复。
      const types = bomb.rules.map((r) => r.type)
      expect(new Set(types).size).toBe(types.length)
      // 有解：至少一根应剪线。
      expect(bomb.mustCut.some((m) => m)).toBe(true)
      // 无矛盾：没有颜色同时落在必须剪与禁止剪集合。
      const verdict = evaluateRules(bomb.rules, bomb.facts)
      for (const c of bomb.wires) {
        expect(verdict.mustColors.includes(c) && verdict.forbidColors.includes(c)).toBe(false)
      }
    }
    // 递进：线数不减、规则不减、时限收紧。
    for (let i = 1; i < MAX_BOMBS; i += 1) {
      expect(wiresFor(i)).toBeGreaterThanOrEqual(wiresFor(i - 1))
      expect(rulesFor(i)).toBeGreaterThanOrEqual(rulesFor(i - 1))
      expect(timeFor(i)).toBeLessThan(timeFor(i - 1))
    }
    expect(wiresFor(0)).toBeGreaterThanOrEqual(4)
    expect(wiresFor(4)).toBeLessThanOrEqual(7)
    expect(timeFor(0)).toBe(60000)
  })

  it('cutting all must-cut wires defuses the bomb and advances after the transition', () => {
    const state = createDefuse(11, 1)
    const bomb = state.bombs[0]!
    const mustIdx = bomb.mustCut.map((m, i) => (m ? i : -1)).filter((i) => i >= 0)
    let eventsCut = 0
    for (const i of mustIdx) {
      cutWire(state, i)
      if (state.events.some((e) => e.type === 'cut')) eventsCut += 1
      stepDefuse(state, 0)
    }
    expect(eventsCut).toBe(mustIdx.length)
    expect(state.over).toBe(false)
    expect(state.defuseMs).toBe(DEFUSE_MS)
    expect(state.score).toBe(mustIdx.length * CUT_SCORE + BOMB_SCORE)
    // 过渡期间输入忽略。
    cutWire(state, 0)
    stepDefuse(state, 16)
    expect(state.bombIndex).toBe(0)
    // 消化过渡 → 装配下一颗。
    for (let k = 0; k < 80; k += 1) stepDefuse(state, 16)
    expect(state.bombIndex).toBe(1)
    // 新弹满时限起步；过渡消化后的富余步数会正常扣时。
    expect(state.timeLeft).toBeLessThanOrEqual(timeFor(1))
    expect(state.timeLeft).toBeGreaterThan(timeFor(1) - 1000)
    expect(state.cut.every((c) => !c)).toBe(true)
  })

  it('cutting a forbidden (non must-cut) wire explodes immediately', () => {
    const state = createDefuse(3, 1)
    const bomb = state.bombs[0]!
    const forbidden = bomb.mustCut.findIndex((m) => !m)
    expect(forbidden).toBeGreaterThanOrEqual(0)
    cutWire(state, forbidden)
    expect(state.over).toBe(true)
    expect(state.won).toBe(false)
    expect(state.events.some((e) => e.type === 'explode')).toBe(true)
    // 结束后输入与推进不再改变状态。
    const score = state.score
    cutWire(state, 0)
    stepDefuse(state, 100)
    expect(state.score).toBe(score)
  })

  it('countdown reaching zero explodes the run', () => {
    const state = createDefuse(5, 1)
    stepDefuse(state, timeFor(0) - 1)
    expect(state.over).toBe(false)
    stepDefuse(state, 2)
    expect(state.timeLeft).toBe(0)
    expect(state.over).toBe(true)
    expect(state.won).toBe(false)
    expect(state.events.some((e) => e.type === 'explode')).toBe(true)
  })

  it('the defuse transition freezes the countdown', () => {
    const state = createDefuse(11, 1)
    const bomb = state.bombs[0]!
    for (let i = 0; i < bomb.mustCut.length; i += 1) {
      if (bomb.mustCut[i]) cutWire(state, i)
    }
    expect(state.defuseMs).toBe(DEFUSE_MS)
    const before = state.timeLeft
    for (let k = 0; k < 40; k += 1) stepDefuse(state, 16)
    expect(state.timeLeft).toBe(before)
    expect(state.defuseMs).toBeLessThanOrEqual(DEFUSE_MS)
  })

  it('a full clean run defuses all five bombs and wins', () => {
    const state = createDefuse(19, 1)
    let totalCuts = 0
    for (let b = 0; b < MAX_BOMBS; b += 1) {
      const bomb = state.bombs[state.bombIndex]!
      expect(remainingMustCuts(state)).toBeGreaterThan(0)
      for (let i = 0; i < bomb.mustCut.length; i += 1) {
        if (bomb.mustCut[i]) { cutWire(state, i); totalCuts += 1 }
      }
      expect(remainingMustCuts(state)).toBe(0)
      for (let k = 0; k < 80; k += 1) stepDefuse(state, 16)
    }
    expect(state.over).toBe(true)
    expect(state.won).toBe(true)
    expect(state.score).toBe(totalCuts * CUT_SCORE + MAX_BOMBS * BOMB_SCORE + WIN_SCORE)
  })

  it('same seed replays identically; a different round diverges', () => {
    const play = (round: number): number => {
      const state = createDefuse(77, round)
      for (let b = 0; b < 2; b += 1) {
        const bomb = state.bombs[state.bombIndex]!
        for (let i = 0; i < bomb.mustCut.length; i += 1) {
          if (bomb.mustCut[i]) cutWire(state, i)
        }
        for (let k = 0; k < 80; k += 1) stepDefuse(state, 16)
      }
      return state.score
    }
    expect(play(1)).toBe(play(1))
    const s1 = JSON.stringify(createDefuse(77, 1))
    const s2 = JSON.stringify(createDefuse(77, 1))
    const s3 = JSON.stringify(createDefuse(77, 2))
    expect(s1).toBe(s2)
    expect(s1).not.toBe(s3)
    // mulberry32 本身确定性。
    const r1 = mulberry32(9)
    const r2 = mulberry32(9)
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()])
  })
})
