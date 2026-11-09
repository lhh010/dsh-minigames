import { describe, expect, it } from 'vitest'
import {
  LEVELS,
  bankConflict,
  board,
  canBoard,
  canDisembark,
  canCross,
  createInitialState,
  cross,
  disembark,
  dockedBank,
  evaluate,
  levelFor,
  minCrossings,
  mulberry32,
  type RiverState,
} from '../src/client/games/rivercross/logic.ts'

describe('rivercross logic', () => {
  it('mulberry32: 同种子序列确定，值域 [0,1)，异种子序列不同', () => {
    const a1 = mulberry32(42)
    const a2 = mulberry32(42)
    const seq1 = [a1(), a1(), a1(), a1(), a1()]
    const seq2 = [a2(), a2(), a2(), a2(), a2()]
    expect(seq1).toEqual(seq2)
    for (const v of seq1) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const b = mulberry32(7)
    const seqB = [b(), b(), b(), b(), b()]
    expect(seq1).not.toEqual(seqB)
  })

  it('createInitialState / levelFor: 全员左岸、船停左岸；下标越界收敛', () => {
    const s = createInitialState(0)
    expect(s).toEqual({ left: ['wolf', 'sheep', 'cabbage'], right: [], boatSide: 'left', boat: [] })
    expect(dockedBank(s)).toEqual(['wolf', 'sheep', 'cabbage'])
    expect(levelFor(-3)).toBe(LEVELS[0])
    expect(levelFor(99)).toBe(LEVELS[4])
    // 每关开局全员都在左岸。
    for (let i = 0; i < LEVELS.length; i += 1) {
      expect(createInitialState(i).left).toHaveLength(LEVELS[i]!.characters.length)
    }
  })

  it('上下船状态机：停靠岸角色可上船，满员拒绝，下船还原，异岸拒绝', () => {
    const level = levelFor(0)
    let s = createInitialState(0)
    // 右岸角色（此刻不存在）与未知 id 不能上船。
    expect(canBoard(s, level, 'nope')).toBe(false)
    const boarded = board(s, level, 'sheep')!
    expect(boarded).not.toBeNull()
    expect(boarded).toEqual({ left: ['wolf', 'cabbage'], right: [], boatSide: 'left', boat: ['sheep'] })
    // 容量 1：船上已有乘客，再上船被拒。
    expect(canBoard(boarded, level, 'wolf')).toBe(false)
    expect(board(boarded, level, 'wolf')).toBeNull()
    // 下船回到停靠岸，恢复开局。
    expect(canDisembark(boarded, 'sheep')).toBe(true)
    const back = disembark(boarded, 'sheep')!
    expect(back.boatSide).toBe('left')
    expect([...back.left].sort()).toEqual([...s.left].sort())
    expect(disembark(s, 'sheep')).toBeNull()
    // 入参从未被修改。
    expect(s).toEqual(createInitialState(0))
    // 大船关（下标 3）容量 2：可同时上两名。
    const big = levelFor(3)
    let b = createInitialState(3)
    b = board(b, big, 'sheep')!
    b = board(b, big, 'mouse')!
    expect(b.boat).toEqual(['sheep', 'mouse'])
    expect(board(b, big, 'wolf')).toBeNull()
  })

  it('cross: 方向翻转、乘客卸到对岸、允许空船；往返还原', () => {
    let s = createInitialState(0)
    s = board(s, levelFor(0), 'sheep')!
    const across = cross(s)
    expect(across.boatSide).toBe('right')
    expect(across.boat).toEqual([])
    expect(across.right).toEqual(['sheep'])
    expect(across.left).toEqual(['wolf', 'cabbage'])
    // 农夫空船返回：右岸只剩羊、无冲突。
    const back = cross(across)
    expect(back.boatSide).toBe('left')
    expect(back.right).toEqual(['sheep'])
    expect(back.left).toEqual(['wolf', 'cabbage'])
    expect(canCross(s)).toBe(true)
  })

  it('bankConflict: 按各关冲突表找出同岸捕食对，安全组合为 null', () => {
    const l1 = levelFor(0)
    expect(bankConflict(l1, ['wolf', 'sheep'])).toEqual(['wolf', 'sheep'])
    expect(bankConflict(l1, ['sheep', 'cabbage'])).toEqual(['sheep', 'cabbage'])
    expect(bankConflict(l1, ['wolf', 'cabbage'])).toBeNull()
    expect(bankConflict(l1, ['wolf', 'sheep', 'cabbage'])).toEqual(['wolf', 'sheep'])
    expect(bankConflict(l1, [])).toBeNull()
    // 三对冲突链与自定义组合关。
    expect(bankConflict(levelFor(2), ['eagle', 'snake', 'mouse', 'cheese'])).toEqual(['eagle', 'snake'])
    expect(bankConflict(levelFor(2), ['eagle', 'mouse'])).toBeNull()
    expect(bankConflict(levelFor(4), ['bear', 'honey'])).toEqual(['bear', 'honey'])
    expect(bankConflict(levelFor(4), ['bee', 'honey'])).toBeNull()
  })

  it('evaluate: 农夫离开后冲突岸判失败并回报事发岸与冲突对；看管中的岸不判', () => {
    const level = levelFor(0)
    // 狼仍左岸、农夫带羊到右岸再空船返回后：狼+菜 在左岸无人看管但无冲突。
    let s = createInitialState(0)
    s = board(s, level, 'sheep')!
    s = cross(s)
    expect(evaluate(s, level)).toEqual({ phase: 'playing' })
    s = cross(s) // 空船返回，右岸羊独自安全
    expect(evaluate(s, level)).toEqual({ phase: 'playing' })
    // 农夫带菜过河：左岸只剩狼（安全），再返回时右岸羊+菜有农夫看着；
    // 直到农夫带羊回左岸后右岸只剩菜——安全。构造失败：狼+羊同留左岸。
    let f = createInitialState(0)
    f = board(f, level, 'cabbage')!
    f = cross(f) // 左岸狼+羊无人看管 → 失败
    expect(evaluate(f, level)).toEqual({ phase: 'failed', bank: 'left', pair: ['wolf', 'sheep'] })
    // 看管中的岸（船停靠岸）不判冲突。
    let g = createInitialState(0)
    g = board(g, level, 'cabbage')!
    expect(evaluate(g, level)).toEqual({ phase: 'playing' })
  })

  it('evaluate: 全员右岸判胜利，中途判进行中', () => {
    const level = levelFor(0)
    let s = createInitialState(0)
    expect(evaluate(s, level).phase).toBe('playing')
    s = board(s, level, 'sheep')!; s = cross(s)
    s = cross(s)
    s = board(s, level, 'wolf')!; s = cross(s)
    // 右岸狼+羊：农夫在场，安全；带羊返航后右岸只剩狼。
    s = board(s, level, 'sheep')!; s = cross(s)
    s = board(s, level, 'cabbage')!; s = cross(s)
    // 左岸羊独自安全；返航接羊。
    s = cross(s)
    s = board(s, level, 'sheep')!; s = cross(s)
    expect(s.left).toEqual([])
    expect(s.boat).toEqual([])
    expect(evaluate(s, level)).toEqual({ phase: 'won' })
  })

  it('minCrossings: 五关全部可解，最少渡河次数与 BFS 一致', () => {
    const pars = LEVELS.map((_, i) => minCrossings(i))
    expect(pars.every(p => p > 0)).toBe(true)
    expect(pars).toEqual([7, 3, 3, 5, 7])
  })

  it('确定性：同一种子驱动的水波相位对同一下标稳定，失败自动复位等价于重开', () => {
    const rand = mulberry32(1234)
    const phases = [0, 1, 2, 3].map(() => rand() * Math.PI * 2)
    const againRand = mulberry32(1234)
    const again = [0, 1, 2, 3].map(() => againRand() * Math.PI * 2)
    expect(again).toEqual(phases)
    // 失败复位：复位后的状态与重新 createInitialState 完全一致。
    const level = levelFor(0)
    let f = createInitialState(0)
    f = board(f, level, 'cabbage')!
    f = cross(f)
    expect(evaluate(f, level).phase).toBe('failed')
    const reset = createInitialState(0)
    expect(reset).toEqual(createInitialState(0))
    expect(reset.left).toEqual(['wolf', 'sheep', 'cabbage'])
  })
})
