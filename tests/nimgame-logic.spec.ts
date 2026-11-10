import { describe, expect, it } from 'vitest'
import {
  AI_MISTAKE_RATE, GAMES_PER_MATCH, MAX_ROWS, MAX_ROW_STICKS, MIN_ROWS, MIN_ROW_STICKS,
  aiChoose, bestMove, createRound, mulberry32, randomMove, take, winScore, xorSum,
  type NimState,
} from '../src/client/games/nimgame/logic.ts'

/** 深比较用的局面快照（JSON 拷贝）。 */
function snap(state: NimState): NimState {
  return JSON.parse(JSON.stringify(state)) as NimState
}

describe('nimgame logic', () => {
  it('createRound: 同种子同开局，3-5 排、每排 2-7 根、玩家先手', () => {
    const a = createRound(mulberry32(42))
    const b = createRound(mulberry32(42))
    expect(a).toEqual(b)
    expect(a.turn).toBe('player')
    expect(a.over).toBe(false)
    expect(a.loser).toBeNull()
    for (let seed = 0; seed < 40; seed += 1) {
      const rows = createRound(mulberry32(seed)).rows
      expect(rows.length).toBeGreaterThanOrEqual(MIN_ROWS)
      expect(rows.length).toBeLessThanOrEqual(MAX_ROWS)
      for (const n of rows) {
        expect(n).toBeGreaterThanOrEqual(MIN_ROW_STICKS)
        expect(n).toBeLessThanOrEqual(MAX_ROW_STICKS)
      }
    }
  })

  it('take: 合法取子减少该排并轮换走子方，不修改入参', () => {
    const start: NimState = { rows: [3, 4, 5], turn: 'player', aiSticks: 0, over: false, loser: null }
    const snapshot = snap(start)
    const next = take(start, 1, 2)
    expect(next).not.toBeNull()
    expect(next!.rows).toEqual([3, 2, 5])
    expect(next!.turn).toBe('ai')
    expect(start).toEqual(snapshot)
    const back = take(next!, 2, 5)!
    expect(back.turn).toBe('player')
    expect(back.aiSticks).toBe(5) // AI 取子数累计
  })

  it('take: 非法走法返回 null（越界 / 超量 / 空排 / 已终局）', () => {
    const state: NimState = { rows: [0, 4, 1], turn: 'player', aiSticks: 0, over: false, loser: null }
    expect(take(state, -1, 1)).toBeNull()
    expect(take(state, 3, 1)).toBeNull()
    expect(take(state, 1, 0)).toBeNull()
    expect(take(state, 1, 5)).toBeNull()
    expect(take(state, 0, 1)).toBeNull() // 空排
    const over = take({ rows: [1], turn: 'ai', aiSticks: 0, over: false, loser: null }, 0, 1)!
    expect(take(over, 0, 1)).toBeNull() // 已终局
  })

  it('Misère 终局：取到最后一根的一方输，winner 记在 loser', () => {
    const state: NimState = { rows: [0, 0, 2], turn: 'player', aiSticks: 0, over: false, loser: null }
    const next = take(state, 2, 2)!
    expect(next.over).toBe(true)
    expect(next.loser).toBe('player') // 玩家取到最后一根 → 输
    const aiTakes = take({ rows: [0, 3], turn: 'ai', aiSticks: 2, over: false, loser: null }, 1, 3)!
    expect(aiTakes.over).toBe(true)
    expect(aiTakes.loser).toBe('ai')
    expect(aiTakes.aiSticks).toBe(5)
  })

  it('bestMove: 多大排时走出异或归零；异或为零的必败位也给出合法拖步', () => {
    // [3,4,5] 异或 = 2：必胜步应让剩余异或为 0。
    const move = bestMove([3, 4, 5])!
    expect(move).not.toBeNull()
    const after = [3, 4, 5].slice()
    after[move.row]! -= move.count
    expect(xorSum(after)).toBe(0)
    // 必败位 [1,2,3]（异或 0）：仍返回合法走法。
    const drift = bestMove([1, 2, 3])!
    expect(drift.count).toBeGreaterThanOrEqual(1)
    expect(drift.count).toBeLessThanOrEqual([1, 2, 3][drift.row]!)
    // 空盘无步。
    expect(bestMove([0, 0])).toBeNull()
  })

  it('bestMove: 单大排与全 1 排的 Misère 收官调奇偶', () => {
    // 恰 1 个大排：给对手留下奇数个 1 根排。
    // [3,1]：ones=1（奇）→ 清空大排，留 [1]。
    expect(bestMove([3, 1])).toEqual({ row: 0, count: 3 })
    // [3,1,1]：ones=2（偶）→ 大排留 1，留 [1,1,1]（奇数个 1）。
    expect(bestMove([3, 1, 1])).toEqual({ row: 0, count: 2 })
    // 全 1 排：走 1。
    expect(bestMove([1, 1, 1])).toEqual({ row: 0, count: 1 })
  })

  it('aiChoose: 恒最优档从必胜位出发必不输（Misère 对弈模拟）', () => {
    // [3,4,5] 异或非零 → 先手（AI）必胜；玩家随机应对也不翻盘。
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = mulberry32(seed)
      let rows = [3, 4, 5]
      let turn: 'ai' | 'player' = 'ai'
      let loser: 'ai' | 'player' | null = null
      while (rows.reduce((s, n) => s + n, 0) > 0) {
        const move = turn === 'ai' ? aiChoose(rows, rng, 0) : randomMove(rows, rng)
        expect(move).not.toBeNull()
        const total = rows.reduce((s, n) => s + n, 0)
        if (move!.count === total) loser = turn
        rows = rows.slice()
        rows[move!.row]! -= move!.count
        turn = turn === 'ai' ? 'player' : 'ai'
      }
      expect(loser).toBe('player')
    }
  })

  it('aiChoose: 随机档位与确定性——同种子重放整局得到同一走子序列', () => {
    // 概率分流：mistakeRate 0 走必胜步；mistakeRate 1 走随机步（同种子可复现）。
    const rows = [3, 4, 5]
    const optimal = aiChoose(rows, mulberry32(7), 0)
    expect(optimal).toEqual(bestMove(rows))
    const randA = aiChoose(rows, mulberry32(7), 1)
    const randB = aiChoose(rows, mulberry32(7), 1)
    expect(randA).toEqual(randB)
    // 随机档在有替代时绝不一步取尽全场。
    for (let seed = 0; seed < 30; seed += 1) {
      const move = randomMove([2, 3], mulberry32(seed))!
      expect(move.count).toBeLessThan(5) // 总量 5，存在安全步时不取尽
    }
    // 默认档位常数为 20%。
    expect(AI_MISTAKE_RATE).toBe(0.2)
    // 整局重放：同种子下完整对弈序列逐歩一致。
    const play = (seed: number): number[] => {
      const rng = mulberry32(seed)
      let s = createRound(rng)
      const counts: number[] = []
      while (!s.over) {
        const move = s.turn === 'ai' ? aiChoose(s.rows, rng, 0.2) : randomMove(s.rows, rng)
        counts.push(move!.count)
        s = take(s, move!.row, move!.count)!
      }
      return counts
    }
    expect(play(99)).toEqual(play(99))
    expect(play(100)).not.toEqual(play(101))
  })

  it('winScore 与赛制：底分 10 + AI 取走火柴数；一赛 5 局', () => {
    expect(winScore(0)).toBe(10)
    expect(winScore(6)).toBe(16)
    expect(GAMES_PER_MATCH).toBe(5)
  })
})
