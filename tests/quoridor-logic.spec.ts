/**
 * 鬼墙逻辑测试：开局布局、走子合法性（含对跳/斜跳/墙阻挡）、放墙合法
 * 性（边界/重叠/交叉/BFS 可达性保持）、最短路、胜负判定与墙配额、AI
 * 决策确定性与整局重放。
 */
import { describe, expect, it } from 'vitest'
import {
  BOARD, WALLS_PER_PLAYER, canPlaceWall, chooseAiAction, createGame,
  legalSteps, matchDecided, movePawn, nextDifficulty, placeWall,
  shortestPath, type Pos, type QuoridorState,
} from '../src/client/games/quoridor/logic.ts'

/** 直接摆一个局面：改棋子、行动方与墙配额（墙表手工置位）。 */
function setup(pawns: [Pos, Pos], turn: 0 | 1 = 0, stock: [number, number] = [10, 10]): QuoridorState {
  const s = createGame()
  s.pawns = [{ ...pawns[0] }, { ...pawns[1] }]
  s.turn = turn
  s.wallStock = [stock[0], stock[1]]
  return s
}

const has = (steps: Pos[], c: number, r: number): boolean =>
  steps.some(p => p.c === c && p.r === r)

describe('quoridor logic', () => {
  it('开局：双方居底边中央、各 10 墙、南方先行、最短路均为 8', () => {
    const s = createGame()
    expect(s.pawns[0]).toEqual({ c: 4, r: 8 })
    expect(s.pawns[1]).toEqual({ c: 4, r: 0 })
    expect(s.wallStock).toEqual([WALLS_PER_PLAYER, WALLS_PER_PLAYER])
    expect(s.turn).toBe(0)
    expect(s.winner).toBeNull()
    expect(shortestPath(s, 0)).toBe(8)
    expect(shortestPath(s, 1)).toBe(8)
  })

  it('基础走子：底边棋子有三步（上/左/右），远格与出盘非法', () => {
    const s = createGame()
    const steps = legalSteps(s)
    expect(steps).toHaveLength(3)
    expect(has(steps, 4, 7)).toBe(true)
    expect(has(steps, 3, 8)).toBe(true)
    expect(has(steps, 5, 8)).toBe(true)
    expect(movePawn(s, { c: 4, r: 7 })).not.toBeNull()
    expect(movePawn(s, { c: 5, r: 5 })).toBeNull()
    expect(movePawn(s, { c: 4, r: 9 })).toBeNull()
  })

  it('墙阻挡走子：棋子正前方有横墙时不可上行', () => {
    const s = createGame()
    const ns = placeWall(s, 'h', 4, 7)
    expect(ns).not.toBeNull()
    // 放墙轮转行动权后换回南方视角再验证走子。
    ns!.turn = 0
    expect(has(legalSteps(ns!), 4, 7)).toBe(false)
    expect(has(legalSteps(ns!), 3, 8)).toBe(true)
    expect(movePawn(ns!, { c: 4, r: 7 })).toBeNull()
  })

  it('面对面对跳：正对对方棋子时可直跳两格', () => {
    const s = setup([{ c: 4, r: 4 }, { c: 4, r: 3 }])
    const steps = legalSteps(s)
    expect(has(steps, 4, 2)).toBe(true)
    const ns = movePawn(s, { c: 4, r: 2 })
    expect(ns).not.toBeNull()
    expect(ns!.pawns[0]).toEqual({ c: 4, r: 2 })
    expect(ns!.turn).toBe(1)
  })

  it('斜跳：直跳被身后横墙挡住时可落到对方两侧，不可再直跳', () => {
    const s = setup([{ c: 4, r: 4 }, { c: 4, r: 3 }])
    s.hWalls[2 * 8 + 4] = 1
    const steps = legalSteps(s)
    expect(has(steps, 4, 2)).toBe(false)
    expect(has(steps, 3, 3)).toBe(true)
    expect(has(steps, 5, 3)).toBe(true)
    expect(movePawn(s, { c: 3, r: 3 })).not.toBeNull()
  })

  it('放墙几何校验：越界、重叠（同向相邻锚点）、同锚点交叉均拒绝', () => {
    const s = createGame()
    expect(canPlaceWall(s, 'h', -1, 0)).toBe(false)
    expect(canPlaceWall(s, 'h', 0, 8)).toBe(false)
    expect(canPlaceWall(s, 'v', 8, 0)).toBe(false)
    const ns = placeWall(s, 'h', 3, 3)
    expect(ns).not.toBeNull()
    expect(ns!.wallStock[0]).toBe(9)
    expect(canPlaceWall(ns!, 'h', 3, 3)).toBe(false)
    expect(canPlaceWall(ns!, 'h', 2, 3)).toBe(false)
    expect(canPlaceWall(ns!, 'h', 4, 3)).toBe(false)
    expect(canPlaceWall(ns!, 'v', 3, 3)).toBe(false)
    // 端点相接（不交叉）与错开锚点均合法。
    expect(canPlaceWall(ns!, 'v', 4, 3)).toBe(true)
    expect(canPlaceWall(ns!, 'v', 3, 4)).toBe(true)
    expect(canPlaceWall(ns!, 'h', 3, 4)).toBe(true)
  })

  it('可达性保持：把北方棋子封死在左上角的墙被 BFS 拒绝', () => {
    const s = createGame()
    // 北方棋子 (0,1)：竖墙 (0,0) 封住向右，横墙 (0,1) 封住向下——只剩
    // (0,0) 一格可退，再无路到第 8 行。
    s.pawns[1] = { c: 0, r: 1 }
    s.vWalls[0 * 8 + 0] = 1
    expect(canPlaceWall(s, 'h', 0, 1)).toBe(false)
    expect(placeWall(s, 'h', 0, 1)).toBeNull()
    // 不参与封路的远处墙仍合法。
    expect(canPlaceWall(s, 'h', 6, 1)).toBe(true)
    expect(canPlaceWall(s, 'v', 7, 7)).toBe(true)
  })

  it('最短路：开局 8 步；起点前的横墙迫使绕行变长', () => {
    const s = createGame()
    const ns = placeWall(s, 'h', 4, 0)
    expect(ns).not.toBeNull()
    // 北方 (4,0) 只需绕一格到第 3 列再回来：9 步。
    expect(shortestPath(ns!, 1)).toBe(9)
    // 南方同样只多绕一格（到对岸任意列即可）：9 步。
    expect(shortestPath(ns!, 0)).toBe(9)
  })

  it('胜负与配额：到达目标行即胜且不可再动；无墙不可放墙', () => {
    const s = setup([{ c: 4, r: 1 }, { c: 4, r: 6 }])
    const ns = movePawn(s, { c: 4, r: 0 })
    expect(ns).not.toBeNull()
    expect(ns!.winner).toBe(0)
    expect(ns!.turn).toBe(0)
    expect(legalSteps(ns!)).toEqual([])
    expect(movePawn(ns!, { c: 3, r: 0 })).toBeNull()
    // 配额耗尽后任何放墙都非法。
    const t = setup([{ c: 4, r: 8 }, { c: 4, r: 0 }], 0, [0, 10])
    expect(canPlaceWall(t, 'h', 0, 0)).toBe(false)
    expect(canPlaceWall(t, 'v', 7, 7)).toBe(false)
  })

  it('AI：同 seed 决策确定、一手致胜直接走、无墙只走子', () => {
    const s = setup([{ c: 2, r: 5 }, { c: 6, r: 3 }], 1)
    const a1 = chooseAiAction(s, 42, 1)
    const a2 = chooseAiAction(s, 42, 1)
    expect(a1).not.toBeNull()
    expect(JSON.stringify(a2)).toBe(JSON.stringify(a1))
    // 决策总是可落子的合法行动。
    const applied = a1!.type === 'move'
      ? movePawn(s, a1!.to)
      : placeWall(s, a1!.orient, a1!.c, a1!.r)
    expect(applied).not.toBeNull()
    // 北方棋子距对岸一步：直接取胜。
    const win = setup([{ c: 4, r: 4 }, { c: 4, r: 7 }], 1)
    expect(chooseAiAction(win, 42, 1)).toEqual({ type: 'move', to: { c: 4, r: 8 } })
    // 墙耗尽时只考虑走子。
    const none = setup([{ c: 2, r: 5 }, { c: 6, r: 3 }], 1, [10, 0])
    expect(chooseAiAction(none, 42, 1)!.type).toBe('move')
    expect(chooseAiAction(none, 42, 0)!.type).toBe('move')
  })

  it('整局重放：贪心南方对 0 级 AI（只走子）15 手取胜且完全确定', () => {
    const replay = (): { winner: 0 | 1 | null; moves: number; finalRow: number } => {
      let s = createGame()
      let seed = 7
      let moves = 0
      while (s.winner === null && moves < 120) {
        if (s.turn === 0) {
          let best: Pos | null = null
          let bestLen = Infinity
          for (const st of legalSteps(s)) {
            const ns = movePawn(s, st)
            if (ns === null) continue
            const len = shortestPath(ns, 0)
            if (len < bestLen) { bestLen = len; best = st }
          }
          s = movePawn(s, best!)!
        } else {
          const a = chooseAiAction(s, seed, 0)
          seed = (seed + 1) >>> 0
          if (a === null) break
          const ns = a.type === 'move'
            ? movePawn(s, a.to)
            : placeWall(s, a.orient, a.c, a.r)
          if (ns === null) break
          s = ns
        }
        moves += 1
      }
      return { winner: s.winner, moves, finalRow: s.pawns[0]!.r }
    }
    const first = replay()
    expect(first.winner).toBe(0)
    expect(first.finalRow).toBe(0)
    expect(first.moves).toBe(15)
    expect(replay()).toEqual(first)
    // 赛制与难度推进。
    expect(matchDecided([2, 0])).toBe(true)
    expect(matchDecided([1, 1])).toBe(false)
    expect(nextDifficulty(0)).toBe(0)
    expect(nextDifficulty(1)).toBe(1)
    expect(nextDifficulty(5)).toBe(2)
    expect(BOARD).toBe(9)
  })
})
