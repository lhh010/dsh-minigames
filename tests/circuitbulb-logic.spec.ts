import { describe, expect, it } from 'vitest'
import {
  LEVEL_COUNT, MAX_HINTS, createGame, evalExpr, exprVars, formatExpr, isAllLit,
  levelConfig, makeLevel, maskToStates, mulberry32, pickHint, popcount, scoreFor,
  solveAll, switchName, toggleSwitch, type Expr, type GameState,
} from '../src/client/games/circuitbulb/logic.ts'

const v = (index: number): Expr => ({ kind: 'var', index })
const not = (inner: Expr): Expr => ({ kind: 'not', inner })
const and = (left: Expr, right: Expr): Expr => ({ kind: 'and', left, right })
const or = (left: Expr, right: Expr): Expr => ({ kind: 'or', left, right })
const xor = (left: Expr, right: Expr): Expr => ({ kind: 'xor', left, right })

describe('circuitbulb logic', () => {
  it('mulberry32: same seed reproduces the stream, different seeds diverge', () => {
    const a = mulberry32(1234)
    const b = mulberry32(1234)
    const seqA = [a(), a(), a(), a()]
    expect(seqA).toEqual([b(), b(), b(), b()])
    const c = mulberry32(1235)
    expect(seqA[0]).not.toBe(c())
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true)
  })

  it('evalExpr computes var/not/and/or/xor against switch states', () => {
    const states = [true, false, true]
    expect(evalExpr(v(0), states)).toBe(true)
    expect(evalExpr(v(1), states)).toBe(false)
    expect(evalExpr(not(v(0)), states)).toBe(false)
    expect(evalExpr(not(v(1)), states)).toBe(true)
    expect(evalExpr(and(v(0), v(1)), states)).toBe(false)
    expect(evalExpr(and(v(0), v(2)), states)).toBe(true)
    expect(evalExpr(or(v(1), v(2)), states)).toBe(true)
    expect(evalExpr(or(v(1), not(v(1))), states)).toBe(true)
    expect(evalExpr(xor(v(0), v(2)), states)).toBe(false)
    expect(evalExpr(xor(v(0), v(1)), states)).toBe(true)
    expect(evalExpr(and(v(0), or(v(1), v(2))), states)).toBe(true)
  })

  it('formatExpr renders symbols with precedence-driven parentheses', () => {
    expect(formatExpr(v(0))).toBe('A')
    expect(formatExpr(not(v(1)))).toBe('¬B')
    expect(formatExpr(and(v(0), v(1)))).toBe('A·B')
    // OR 嵌在 AND 里必须加括号；AND 嵌在 XOR 里优先级更紧不加括号。
    expect(formatExpr(and(or(v(0), v(1)), v(2)))).toBe('(A+B)·C')
    expect(formatExpr(xor(and(v(0), v(1)), v(2)))).toBe('A·B⊕C')
    expect(formatExpr(not(and(v(0), v(1))))).toBe('¬(A·B)')
    expect(formatExpr(xor(v(2), not(v(0))))).toBe('C⊕¬A')
  })

  it('exprVars dedupes and sorts referenced switch indices', () => {
    expect(exprVars(and(or(v(3), v(1)), not(v(3))))).toEqual([1, 3])
    expect(exprVars(xor(v(4), and(v(0), v(4))))).toEqual([0, 4])
    expect(exprVars(not(v(0)))).toEqual([0])
  })

  it('solveAll enumerates solutions: unique when constrained, many when loose', () => {
    // A 亮且 ¬B：唯一解 = 只闭合 A（位掩码 1）。
    expect(solveAll([v(0), not(v(1))], 2)).toEqual([1])
    // A⊕B：两个解（恰好闭合一个）。
    expect(solveAll([xor(v(0), v(1))], 2)).toEqual([1, 2])
    // 恒假灯泡：无解。
    expect(solveAll([and(v(0), not(v(0)))], 1)).toEqual([])
  })

  it('makeLevel: unique solution per level/seed, par = popcount, deterministic', () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      for (let level = 1; level <= LEVEL_COUNT; level += 1) {
        const lv = makeLevel(seed, level)
        const wins = solveAll(lv.bulbs, lv.config.switches)
        expect(wins).toEqual([lv.solution])
        expect(lv.par).toBe(popcount(lv.solution))
        const states = maskToStates(lv.solution, lv.config.switches)
        expect(isAllLit(lv, states)).toBe(true)
        expect(lv.config.bulbs).toBe(lv.bulbs.length)
        expect(lv.config.switches).toBeGreaterThanOrEqual(6)
        expect(lv.config.switches).toBeLessThanOrEqual(12)
      }
    }
    // 同 seed 同关卡完全一致（含表达式树）。
    expect(makeLevel(42, 3)).toEqual(makeLevel(42, 3))
  })

  it('levelConfig: progression grows and clamps at both ends', () => {
    expect(levelConfig(0)).toEqual(levelConfig(1))
    expect(levelConfig(99)).toEqual(levelConfig(LEVEL_COUNT))
    expect(levelConfig(1).switches).toBeLessThan(levelConfig(3).switches)
    expect(levelConfig(3).switches).toBeLessThan(levelConfig(5).switches)
    expect(levelConfig(1).bulbs).toBeLessThan(levelConfig(5).bulbs)
    expect(levelConfig(5).ops).toContain('xor')
    expect(levelConfig(1).ops).not.toContain('xor')
    expect(levelConfig(5).nest).toBe(2)
  })

  it('createGame starts all-off; toggleSwitch is pure, bounded, and locks after win', () => {
    const g = createGame(7, 2)
    expect(g.states.every((s) => s === false)).toBe(true)
    expect(g.moves).toBe(0)
    expect(g.won).toBe(false)
    const next = toggleSwitch(g, 0)
    expect(next.states[0]).toBe(true)
    expect(next.moves).toBe(1)
    expect(g.states[0]).toBe(false) // 原状态不被改动
    expect(toggleSwitch(g, -1)).toBe(g)
    expect(toggleSwitch(g, 999)).toBe(g)
    // 拨到唯一解即过关，再拨被冻结。
    let cur = g
    const target = maskToStates(g.levelData.solution, g.states.length)
    for (let i = 0; i < target.length; i += 1) {
      if (target[i] && !cur.states[i]) cur = toggleSwitch(cur, i)
    }
    expect(cur.won).toBe(true)
    const frozen = toggleSwitch(cur, 0)
    expect(frozen).toBe(cur)
    expect(frozen.moves).toBe(cur.moves)
  })

  it('pickHint: null when solved-matched, else names a wrong switch with its true state', () => {
    const g = createGame(11, 3)
    const solved: GameState = { ...g, states: maskToStates(g.levelData.solution, g.states.length) }
    expect(pickHint(solved, mulberry32(1))).toBeNull()
    // 拨错两个开关后，提示必然指向其中之一并给出解中状态。
    const wrong = toggleSwitch(toggleSwitch(solved, 0), 1)
    const rng = mulberry32(5)
    const hint = pickHint(wrong, rng)
    expect(hint).not.toBeNull()
    expect([0, 1]).toContain(hint!.index)
    expect(hint!.shouldBe).toBe(maskToStates(g.levelData.solution, g.states.length)[hint!.index])
    // rng()=0 恒选第一个错误开关：确定性。
    expect(pickHint(wrong, () => 0)!.index).toBe(0)
  })

  it('scoreFor: 600 at par, -20 per extra move, -40 per hint, floored at 100', () => {
    const g = createGame(3, 1)
    const at = (moves: number, hintsUsed: number): number =>
      scoreFor({ ...g, moves, hintsUsed })
    expect(at(g.levelData.par, 0)).toBe(600)
    expect(at(g.levelData.par + 1, 0)).toBe(580)
    expect(at(g.levelData.par, 2)).toBe(520)
    expect(at(g.levelData.par + 3, 1)).toBe(500)
    expect(at(g.levelData.par + 40, 2)).toBe(100)
    expect(MAX_HINTS).toBe(2)
    expect(LEVEL_COUNT).toBe(5)
  })

  it('switchName cycles letters from A', () => {
    expect(switchName(0)).toBe('A')
    expect(switchName(1)).toBe('B')
    expect(switchName(25)).toBe('Z')
    expect(switchName(26)).toBe('A')
  })
})
