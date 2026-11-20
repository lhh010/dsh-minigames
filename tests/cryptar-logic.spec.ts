/**
 * 密码算式纯逻辑测试：题库结构与唯一解、求解器、seed 选关、映射操作、
 * 逐位验算（进位链/冲突/过关判定）、提示系统与计分。
 */
import { describe, expect, it } from 'vitest'
import {
  PUZZLES,
  TOTAL_LEVELS,
  planPuzzles,
  solveAlphametic,
  mulberry32,
  createLevelState,
  assignDigit,
  clearLetter,
  applyHint,
  checkMapping,
  scoreFor,
  numericWords,
  type CryptarPuzzle,
  type DigitMap,
} from '../src/client/games/cryptar/logic.ts'

const byId = (id: string): CryptarPuzzle => PUZZLES.find(p => p.id === id)!

const SEND = byId('SEND + MORE = MONEY')

const SEND_SOLUTION: DigitMap = { S: 9, E: 5, N: 6, D: 7, M: 1, O: 0, R: 8, Y: 2 }

function wordValue(map: DigitMap, word: string): number {
  return Number([...word].map(ch => String(map[ch])).join(''))
}

describe('cryptar logic', () => {
  it('题库：8 道题，结构自洽且 solution 让等式成立', () => {
    expect(PUZZLES.length).toBe(8)
    for (const p of PUZZLES) {
      expect(p.letters.length).toBeLessThanOrEqual(10)
      expect(new Set(p.letters).size).toBe(p.letters.length)
      // 首字母约束集合确实来自各词首位。
      const words = [...p.addends, p.result]
      for (const w of words) expect(p.leading).toContain(w[0])
      // solution 覆盖全部字母、首字母非 0、加法成立。
      for (const l of p.letters) {
        expect(p.solution[l]).toBeGreaterThanOrEqual(0)
        expect(p.solution[l]).toBeLessThanOrEqual(9)
      }
      for (const l of p.leading) expect(p.solution[l]).not.toBe(0)
      const addendSum = p.addends.reduce((acc, w) => acc + wordValue(p.solution, w), 0)
      expect(addendSum).toBe(wordValue(p.solution, p.result))
    }
  })

  it('题库：重跑求解器确认每题唯一解', () => {
    for (const p of PUZZLES) {
      const again = solveAlphametic(p.addends, p.result)
      expect(again, p.id).not.toBeNull()
      expect(again, p.id).toEqual(p.solution)
    }
  })

  it('求解器：无解与多解都返回 null', () => {
    // 数字上不可能成立。
    expect(solveAlphametic(['ELEVEN', 'TWO'], 'TWELVE')).toBeNull()
    // 多于一个解。
    expect(solveAlphametic(['CAT', 'CAT'], 'DOG')).toBeNull()
    // 经典唯一解内容正确。
    expect(solveAlphametic(['SEND', 'MORE'], 'MONEY')).toEqual(SEND_SOLUTION)
  })

  it('mulberry32 同 seed 同序列；planPuzzles 5 关难度递增且可复现', () => {
    const a = Array.from({ length: 5 }, () => mulberry32(7)())
    const b = Array.from({ length: 5 }, () => mulberry32(7)())
    expect(a).toEqual(b)
    expect(a.every(v => v >= 0 && v < 1)).toBe(true)
    // 不同 seed 序列不同。
    const c = Array.from({ length: 5 }, () => mulberry32(8)())
    expect(c).not.toEqual(a)

    expect(TOTAL_LEVELS).toBe(5)
    const plan = planPuzzles(1234)
    expect(plan).toHaveLength(5)
    expect(plan.map(p => p.tier)).toEqual([1, 2, 3, 4, 5])
    expect(plan).toEqual(planPuzzles(1234))
    for (const p of plan) expect(PUZZLES).toContain(p)
    // seed 翻转后第 2 档（SEND/MONEY 与 BASE/GAMES 二选一）应有机会变化。
    const ids = new Set([...planPuzzles(1), ...planPuzzles(2), ...planPuzzles(3)].map(p => p.id))
    expect(ids.size).toBeGreaterThanOrEqual(6)
  })

  it('映射操作：填数一一替换、清除不影响其它字母', () => {
    let s = createLevelState()
    s = assignDigit(s, 'S', 9)
    s = assignDigit(s, 'E', 5)
    // 5 已被 E 占用：S 抢 5 则 E 让出。
    s = assignDigit(s, 'S', 5)
    expect(s.mapping.S).toBe(5)
    expect(s.mapping.E).toBeUndefined()
    s = assignDigit(s, 'E', 9)
    expect(s.mapping.E).toBe(9)
    s = clearLetter(s, 'S')
    expect(s.mapping.S).toBeUndefined()
    expect(s.mapping.E).toBe(9)
    // 越界数字拒绝。
    expect(assignDigit(s, 'N', 10).mapping.N).toBeUndefined()
  })

  it('逐位验算：部分正确映射不误报冲突', () => {
    const partial: DigitMap = { M: 1, O: 0 }
    const r = checkMapping(SEND, partial)
    expect(r.conflict).toBe(false)
    expect(r.complete).toBe(false)
    expect(r.solved).toBe(false)
  })

  it('逐位验算：重复数字与进位矛盾按列红显', () => {
    // 个位 D+R=7+8 应得 5：把 Y 填成 3 制造个位进位矛盾。
    const wrongOnes: DigitMap = { ...SEND_SOLUTION, Y: 3 }
    const r1 = checkMapping(SEND, wrongOnes)
    expect(r1.conflict).toBe(true)
    expect(r1.columns[0]).toBe(true)
    expect(r1.duplicateDigits).toBe(false)
    expect(r1.solved).toBe(false)

    // 不同字母同数字：整体冲突 + duplicateDigits。
    const dup: DigitMap = { ...SEND_SOLUTION, O: 1 }
    const r2 = checkMapping(SEND, dup)
    expect(r2.duplicateDigits).toBe(true)
    expect(r2.conflict).toBe(true)
    expect(r2.solved).toBe(false)
  })

  it('逐位验算：首字母为 0 报冲突；完整正确映射过关', () => {
    const zeroLead: DigitMap = { ...SEND_SOLUTION, M: 0, O: 2 }
    const r = checkMapping(SEND, zeroLead)
    expect(r.leadingZero).toBe(true)
    expect(r.conflict).toBe(true)

    const ok = checkMapping(SEND, SEND_SOLUTION)
    expect(ok.complete).toBe(true)
    expect(ok.conflict).toBe(false)
    expect(ok.solved).toBe(true)
  })

  it('提示：按序揭示唯一解字母，每关限 2 次', () => {
    let s = createLevelState()
    const first = applyHint(s, SEND)!
    expect(first[1]).toBe('S')
    expect(first[0].mapping.S).toBe(9)
    expect(first[0].hintsUsed).toBe(1)
    expect(first[0].revealed).toEqual(['S'])
    const second = applyHint(first[0], SEND)!
    expect(second[1]).toBe('E')
    expect(second[0].hintsUsed).toBe(2)
    // 第 3 次拒绝。
    expect(applyHint(second[0], SEND)).toBeNull()
    // 全填满也拒绝。
    expect(applyHint({ ...createLevelState(), mapping: { ...SEND_SOLUTION } }, SEND)).toBeNull()
  })

  it('计分：基础+时间奖励-提示罚，时间越长奖励越少，下限 40', () => {
    const fast = scoreFor(0, 5000, 0)
    expect(fast).toBe(200 + 300 - 20)
    const slow = scoreFor(0, 200000, 0)
    expect(slow).toBe(200) // 奖励耗尽
    const hinted = scoreFor(0, 5000, 2)
    expect(hinted).toBe(fast - 120)
    expect(scoreFor(4, 5000, 2)).toBe(600 + 280 - 120)
    expect(scoreFor(0, 999999, 2)).toBeGreaterThanOrEqual(40)
  })

  it('numericWords：未填字母渲染为 ?，已填转为数字串', () => {
    const partial: DigitMap = { M: 1, O: 0 }
    expect(numericWords(SEND, partial)).toEqual(['????', '10??', '10???'])
    expect(numericWords(SEND, SEND_SOLUTION)).toEqual(['9567', '1085', '10652'])
  })
})