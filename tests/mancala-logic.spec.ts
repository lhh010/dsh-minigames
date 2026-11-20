import { describe, expect, it } from 'vitest'
import {
  createMancala, applyMove, legalMoves, opposite, nextSlot, finishSweep,
  chooseAiMove, mulberry32, type MancalaState,
} from '../src/client/games/mancala/logic.ts'

/** 按槽索引覆盖籽数，构造任意盘面（玩家先行）。 */
function board(pits: number[], turn: 'human' | 'ai' = 'human'): MancalaState {
  return { pits, turn, finished: false, winner: null }
}

describe('mancala logic', () => {
  it('初始盘面：两排各 6 坑每坑 4 籽，粮仓为空，玩家先行', () => {
    const s = createMancala()
    expect(s.pits).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0])
    expect(s.pits.reduce((a, b) => a + b, 0)).toBe(48)
    expect(s.turn).toBe('human')
    expect(s.finished).toBe(false)
    expect(s.winner).toBeNull()
  })

  it('合法走法：仅当前方非空坑；空坑与对方坑不可走', () => {
    const s = board([0, 4, 0, 2, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0])
    expect(legalMoves(s)).toEqual([1, 3, 4, 5])
    const aiTurn = board([0, 4, 4, 4, 4, 4, 0, 0, 4, 4, 4, 4, 4, 0], 'ai')
    expect(legalMoves(aiTurn)).toEqual([8, 9, 10, 11, 12])
    const finished = { ...createMancala(), finished: true }
    expect(legalMoves(finished)).toEqual([])
  })

  it('基本播种：捡起全部籽逆时针逐坑 1 籽，无再走无吃子', () => {
    const res = applyMove(createMancala(), 2)!
    // 坑 2 的 4 籽落入 3、4、5、6（最后一籽入粮仓）
    expect(res.path).toEqual([3, 4, 5, 6])
    expect(res.lastLand).toBe(6)
    expect(res.extraTurn).toBe(true)
    expect(res.captured).toBe(false)
    expect(res.state.pits[2]).toBe(0)
    expect(res.state.pits[3]).toBe(5)
    expect(res.state.pits[6]).toBe(1)
    expect(res.state.turn).toBe('human')
  })

  it('再走判定：最后一籽入对方坑则换手', () => {
    const res = applyMove(createMancala(), 0)!
    expect(res.path).toEqual([1, 2, 3, 4])
    expect(res.extraTurn).toBe(false)
    expect(res.state.turn).toBe('ai')
    expect(res.state.pits[6]).toBe(0)
  })

  it('播种跳过对侧粮仓并绕圈（12+ 籽长播）', () => {
    const s = board([1, 0, 0, 0, 0, 11, 0, 1, 1, 1, 1, 1, 1, 0])
    const res = applyMove(s, 5)!
    // 11 籽路径：6,7,8,9,10,11,12,（跳过 13）,0,1,2,3
    expect(res.path).toEqual([6, 7, 8, 9, 10, 11, 12, 0, 1, 2, 3])
    expect(res.state.pits[13]).toBe(0)
    expect(res.state.pits[0]).toBe(2)
    expect(res.extraTurn).toBe(false)
    expect(nextSlot(5, 'human')).toBe(6)
    expect(nextSlot(12, 'human')).toBe(0)
    expect(nextSlot(5, 'ai')).toBe(7)
    expect(nextSlot(13, 'ai')).toBe(0)
  })

  it('吃子：最后一籽落己方空坑且对侧非空，两籽同入粮仓', () => {
    const s = board([0, 4, 0, 0, 1, 0, 0, 5, 3, 0, 0, 0, 0, 0])
    const res = applyMove(s, 4)!
    // 4 号坑 1 籽落 5（空），对侧 opposite(5)=7 有 5 籽 → 吃 6 籽（AI 侧留 3 籽不触发收割）
    expect(res.lastLand).toBe(5)
    expect(res.captured).toBe(true)
    expect(res.capturedCount).toBe(6)
    expect(res.state.pits[5]).toBe(0)
    expect(res.state.pits[7]).toBe(0)
    expect(res.state.pits[6]).toBe(6)
    expect(res.state.turn).toBe('ai')
  })

  it('对侧为空不吃：落点仅留 1 籽', () => {
    const s = board([0, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0])
    const res = applyMove(s, 4)!
    expect(res.captured).toBe(false)
    expect(res.state.pits[5]).toBe(1)
    expect(res.state.pits[6]).toBe(0)
    expect(opposite(5)).toBe(7)
    expect(opposite(0)).toBe(12)
  })

  it('终局收割：一方六坑清空，对侧余籽入仓并判胜负', () => {
    // 吃子清空玩家六坑 → AI 侧 2 籽扫入 13：1+6=7 vs 5+2=7 平局
    const s = board([0, 0, 0, 0, 1, 0, 1, 5, 2, 0, 0, 0, 0, 5])
    const res = applyMove(s, 4)!
    expect(res.captured).toBe(true)
    expect(res.state.finished).toBe(true)
    expect(res.state.winner).toBe('draw')
    expect(res.state.pits.reduce((a, b) => a + b, 0)).toBe(14)
    const win = board([0, 0, 0, 0, 1, 0, 2, 5, 2, 0, 0, 0, 0, 5])
    expect(applyMove(win, 4)!.state.winner).toBe('human')
    // 直接收割函数
    const pits = [0, 0, 0, 0, 0, 0, 3, 2, 2, 2, 0, 0, 0, 4]
    expect(finishSweep(pits)).toBe('ai')
    expect(pits[13]).toBe(10)
    expect(pits[7]).toBe(0)
  })

  it('AI 决策确定性：同种子同局面结果一致，且必为合法走法', () => {
    const s = createMancala()
    s.turn = 'ai'
    const a = chooseAiMove(s, 2, mulberry32(1234))
    const b = chooseAiMove(s, 2, mulberry32(1234))
    const c = chooseAiMove(s, 0, mulberry32(1234))
    expect(a).toBe(b)
    expect(legalMoves(s)).toContain(a)
    expect(legalMoves(s)).toContain(c)
    expect(chooseAiMove({ ...s, finished: true }, 1, mulberry32(7))).toBe(-1)
  })

  it('AI 偏好：有直接入仓（连走）机会时优先选择（高难度）', () => {
    // AI 坑 12 有 1 籽 → 恰落入 13 粮仓再走一次；其余走法无收益。
    const s = board([1, 1, 1, 1, 1, 1, 6, 2, 2, 2, 2, 2, 1, 3], 'ai')
    const pick = chooseAiMove(s, 2, mulberry32(99))
    expect(pick).toBe(12)
    const res = applyMove(s, pick)!
    expect(res.extraTurn).toBe(true)
    expect(res.state.turn).toBe('ai')
  })

  it('整局重放：固定种子双方自动对弈至终局，总籽恒 48 且胜负确定', () => {
    const rngH = mulberry32(42)
    const rngA = mulberry32(4242)
    let s = createMancala()
    let steps = 0
    while (!s.finished && steps < 300) {
      const pick = s.turn === 'human' ? humanPick(s, rngH) : chooseAiMove(s, 1, rngA)
      if (pick < 0) break
      const res = applyMove(s, pick)
      expect(res).not.toBeNull()
      s = res!.state
      expect(s.pits.reduce((a, b) => a + b, 0)).toBe(48)
      steps += 1
    }
    expect(s.finished).toBe(true)
    expect(s.winner).not.toBeNull()
    expect(steps).toBeGreaterThan(10)
  })
})

/** 玩家方测试代打：用与 AI 同构的贪心选步（种子独立注入）。 */
function humanPick(s: MancalaState, rng: () => number): number {
  const mirror: MancalaState = {
    pits: [
      s.pits[12]!, s.pits[11]!, s.pits[10]!, s.pits[9]!, s.pits[8]!, s.pits[7]!,
      s.pits[13]!,
      s.pits[5]!, s.pits[4]!, s.pits[3]!, s.pits[2]!, s.pits[1]!, s.pits[0]!,
      s.pits[6]!,
    ],
    turn: 'ai',
    finished: s.finished,
    winner: s.winner === 'human' ? 'ai' : s.winner === 'ai' ? 'human' : s.winner,
  }
  const pick = chooseAiMove(mirror, 1, rng)
  return pick < 0 ? -1 : 12 - pick
}

