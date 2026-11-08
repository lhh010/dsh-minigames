import { describe, expect, it } from 'vitest'
import {
  applyOp,
  applyOperation,
  changeDeal,
  createGame24,
  dealCards,
  hasSolution,
  selectCard,
  solve24,
  undo,
  useHint,
  winScore,
  type Game24State,
} from '../src/client/games/game24/logic.ts'

/**
 * 布面：把状态重置为指定四张初始牌（id 0-3），保留分数/连胜等跨局
 * 字段，便于测试计分。
 * @param state - 目标状态。
 * @param nums - 四张牌点数。
 */
function rig(state: Game24State, nums: number[]): void {
  state.cards = nums.map((v, i) => ({ id: i, value: v, label: String(v) }))
  state.history = []
  state.selected = []
  state.nextCardId = 4
  state.moves = 0
  state.hintUsed = false
  state.status = 'playing'
  state.lastGain = 0
  state.undoStack = []
  state.dealSolvable = hasSolution(nums)
}

/** 按 id 升序读当前牌面数值。 */
function values(state: Game24State): number[] {
  return [...state.cards].sort((a, b) => a.id - b.id).map(c => c.value)
}

/** 依次执行求解步骤（按数值找牌再合并），返回最终值。 */
function applySolution(state: Game24State, steps: { a: number, b: number, op: '+' | '-' | '*' | '/' }[]): number {
  for (const step of steps) {
    const i = state.cards.findIndex(c => c.value === step.a)
    const j = state.cards.findIndex((c, k) => k !== i && c.value === step.b)
    expect(i).toBeGreaterThanOrEqual(0)
    expect(j).toBeGreaterThanOrEqual(0)
    state.selected = [i, j]
    expect(applyOperation(state, step.op)).toBe(true)
  }
  return state.cards[0]!.value
}

describe('game24 logic', () => {
  it('applyOp：四则语义；除法仅整除允许，除数为 0 或除不尽为 null，减法允许负数', () => {
    expect(applyOp(6, 4, '*')).toBe(24)
    expect(applyOp(10, 4, '-')).toBe(6)
    expect(applyOp(1, 8, '-')).toBe(-7)
    expect(applyOp(8, 2, '/')).toBe(4)
    expect(applyOp(9, 3, '/')).toBe(3)
    expect(applyOp(8, 3, '/')).toBeNull()
    expect(applyOp(7, 0, '/')).toBeNull()
    expect(applyOp(0, 5, '/')).toBe(0)
  })

  it('求解器：可解牌面给出可执行步链，分数解牌型在整数除法规则下判无解', () => {
    const sol = solve24([1, 2, 3, 4])
    expect(sol).not.toBeNull()
    expect(sol!).toHaveLength(3)
    const state = createGame24(1)
    rig(state, [1, 2, 3, 4])
    expect(applySolution(state, sol!)).toBe(24)
    // 经典 3,3,8,8 需要 8/(3-8/3) 分数中间值，整数除法下无解。
    expect(solve24([3, 3, 8, 8])).toBeNull()
    expect(hasSolution([3, 3, 8, 8])).toBe(false)
    expect(hasSolution([1, 1, 1, 8])).toBe(true)
    expect(hasSolution([7, 7, 7, 7])).toBe(false)
  })

  it('提示链可走通：连续三次 useHint 并执行提示步，恰好凑成 24', () => {
    const state = createGame24(2)
    rig(state, [1, 2, 3, 4])
    for (let step = 0; step < 3; step += 1) {
      const hint = useHint(state)
      expect(hint).not.toBeNull()
      const i = state.cards.findIndex(c => c.value === hint!.a)
      const j = state.cards.findIndex((c, k) => k !== i && c.value === hint!.b)
      state.selected = [i, j]
      expect(applyOperation(state, hint!.op)).toBe(true)
    }
    expect(state.status).toBe('won')
    // 无解牌面不给提示。
    const stuck = createGame24(3)
    rig(stuck, [7, 7, 7, 7])
    expect(useHint(stuck)).toBeNull()
  })

  it('发牌确定性：同 (seed, deal) 同牌，deal 推进换牌，点数均在 1-13', () => {
    const a = dealCards(42, 0)
    expect(a).toHaveLength(4)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(13)
    }
    expect(dealCards(42, 0)).toEqual(a)
    expect(dealCards(43, 0)).not.toEqual(a)
    // 相邻局几乎必然不同（13^4 空间下连续碰撞概率可忽略）。
    const later = [1, 2, 3, 4, 5].some(d => dealCards(42, d).join(',') !== a.join(','))
    expect(later).toBe(true)
    // 同 seed 完整状态重放一致。
    expect(JSON.stringify(createGame24(424242))).toBe(JSON.stringify(createGame24(424242)))
  })

  it('完整获胜流程：((1+2)+3)×4，三步得 130 分（100 基础 + 30 步数奖励）', () => {
    const state = createGame24(5)
    rig(state, [1, 2, 3, 4])
    // 第三张在已选两张时不可再选。
    expect(selectCard(state, 0)).toBe(true)
    expect(selectCard(state, 1)).toBe(true)
    expect(selectCard(state, 2)).toBe(false)
    expect(applyOperation(state, '+')).toBe(true)
    expect(values(state)).toEqual([3, 4, 3])
    expect(state.history).toEqual(['1 + 2 = 3'])
    expect(state.cards.find(c => c.id >= 4)!.label).toBe('(1+2)')
    const merged = state.cards.findIndex(c => c.id >= 4)
    state.selected = [merged, state.cards.findIndex(c => c.id === 2)!]
    expect(applyOperation(state, '+')).toBe(true)
    state.selected = [0, 1]
    expect(applyOperation(state, '*')).toBe(true)
    expect(state.status).toBe('won')
    expect(state.lastGain).toBe(130)
    expect(state.score).toBe(130)
    expect(state.streak).toBe(1)
    expect(state.history).toEqual(['1 + 2 = 3', '(1+2) + 3 = 6', '4 × ((1+2)+3) = 24'])
  })

  it('非法操作被拒：除不尽不改动牌面、不清选择、不入历史', () => {
    const state = createGame24(6)
    rig(state, [3, 8, 8, 3])
    state.selected = [0, 1]
    expect(applyOperation(state, '/')).toBe(false)
    expect(state.cards).toHaveLength(4)
    expect(state.selected).toEqual([0, 1])
    expect(state.history).toHaveLength(0)
    expect(state.moves).toBe(0)
    expect(state.message).toContain('除不尽')
    // 未选满两张不可运算；已获胜不可再动。
    state.selected = [0]
    expect(applyOperation(state, '+')).toBe(false)
    state.selected = [0, 1]
    state.status = 'won'
    expect(applyOperation(state, '+')).toBe(false)
  })

  it('撤回：快照恢复牌面/历史/选择；moves 不回退并压低步数奖励', () => {
    const state = createGame24(7)
    rig(state, [1, 2, 3, 4])
    expect(undo(state)).toBe(false) // 空栈
    state.selected = [0, 1]
    expect(applyOperation(state, '+')).toBe(true)
    expect(state.moves).toBe(1)
    expect(undo(state)).toBe(true)
    expect(values(state)).toEqual([1, 2, 3, 4])
    expect(state.history).toHaveLength(0)
    expect(state.moves).toBe(1) // 撤回不回退累计步数
    // 重放并走绕路：多一次合并再撤回，最终 4 步获胜 → 步数奖励 20。
    state.selected = [0, 1]
    expect(applyOperation(state, '+')).toBe(true)
    const merged = state.cards.findIndex(c => c.id >= 4)
    state.selected = [merged, state.cards.findIndex(c => c.id === 2)!]
    expect(applyOperation(state, '-')).toBe(true) // (1+2)-3 = 0
    expect(undo(state)).toBe(true)
    state.selected = [merged, state.cards.findIndex(c => c.id === 2)!]
    expect(applyOperation(state, '+')).toBe(true)
    state.selected = [0, 1]
    expect(applyOperation(state, '*')).toBe(true)
    expect(state.status).toBe('won')
    expect(state.moves).toBe(5)
    expect(state.lastGain).toBe(100 + 1 * 10)
  })

  it('换一局：无解跳局扣 20 分清连胜；获胜后进下一局不扣分', () => {
    const state = createGame24(8)
    rig(state, [1, 2, 3, 4])
    state.score = 130
    state.streak = 1
    state.selected = [0, 1]
    applyOperation(state, '+')
    changeDeal(state) // 中途跳局：扣分清连胜
    expect(state.score).toBe(110)
    expect(state.streak).toBe(0)
    expect(state.deal).toBe(1)
    expect(state.cards).toHaveLength(4)
    expect(state.status).toBe('playing')
    // 获胜后换下一局：不扣分。
    rig(state, [1, 2, 3, 4])
    state.score = 110
    applySolution(state, solve24([1, 2, 3, 4])!)
    const wonScore = state.score
    changeDeal(state)
    expect(state.score).toBe(wonScore)
    expect(state.streak).toBe(1)
    // 分数不足 20 时跳局扣到 0 为止。
    state.score = 10
    changeDeal(state)
    expect(state.score).toBe(0)
  })

  it('计分规则：提示固定 25 分且连胜不涨；正常连胜每次 +10 奖励', () => {
    expect(winScore(false, 3, 0)).toBe(130)
    expect(winScore(false, 5, 0)).toBe(110)
    expect(winScore(false, 3, 2)).toBe(150)
    expect(winScore(false, 3, 20)).toBe(230) // 连胜奖励封顶 100
    expect(winScore(true, 3, 9)).toBe(25)

    const state = createGame24(9)
    // 第一局正常获胜（streak 0 → 130，连胜 1）。
    rig(state, [1, 2, 3, 4])
    applySolution(state, solve24([1, 2, 3, 4])!)
    expect(state.score).toBe(130)
    expect(state.streak).toBe(1)
    // 第二局用提示获胜：固定 25 分，连胜不涨。
    changeDeal(state)
    rig(state, [1, 2, 3, 4])
    expect(useHint(state)).not.toBeNull()
    applySolution(state, solve24([1, 2, 3, 4])!)
    expect(state.score).toBe(155)
    expect(state.streak).toBe(1)
    // 第三局正常获胜：含 streak 1 的 +10 连胜奖励与 30 步数奖励 → 140。
    changeDeal(state)
    rig(state, [1, 2, 3, 4])
    applySolution(state, solve24([1, 2, 3, 4])!)
    expect(state.score).toBe(295)
    expect(state.streak).toBe(2)
  })
})
