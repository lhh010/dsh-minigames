import { describe, expect, it } from 'vitest'
import {
  createLinkState, mulberry32, findPath, canLink, tapTile, idxToPos,
  findLinkablePair, refreshDeadlock, shuffleRemaining, tick, advanceLevel,
  currentScore, pairValue, levelKinds, LEVELS, SHUFFLES_PER_LEVEL,
  type LinkState, type Pos,
} from '../src/client/games/link/logic.ts'

/** 快速构造小尺寸手工牌面状态（尺寸/网格/对数手动覆盖，rng 保留）。 */
function craftState(rows: number, cols: number, grid: (number | null)[][]): LinkState {
  const state = createLinkState(42, 1)
  state.rows = rows
  state.cols = cols
  state.grid = grid
  state.pairsLeft = grid.flat().filter(v => v !== null).length / 2
  state.selected = null
  state.status = 'playing'
  state.deadlock = false
  return state
}

const idx = (r: number, c: number, cols: number): number => r * cols + c

describe('link logic', () => {
  it('同 seed 生成完全相同的满牌面，且每种图案成对出现', () => {
    const a = createLinkState(1234)
    const b = createLinkState(1234)
    expect(a.grid).toEqual(b.grid)
    expect(a.rows).toBe(LEVELS[0]!.rows)
    expect(a.cols).toBe(LEVELS[0]!.cols)
    expect(a.pairsLeft).toBe((a.rows * a.cols) / 2)
    expect(a.shufflesLeft).toBe(SHUFFLES_PER_LEVEL)
    const counts = new Map<number, number>()
    for (const row of a.grid) for (const face of row) counts.set(face!, (counts.get(face!) ?? 0) + 1)
    for (const n of counts.values()) expect(n % 2).toBe(0)
    // 初始局面必可解。
    expect(findLinkablePair(a)).not.toBeNull()
  })

  it('关卡配置递进（10x8 → 14x10）且图案种数封顶', () => {
    expect(LEVELS).toHaveLength(5)
    expect(LEVELS[0]!.cols).toBe(10)
    expect(LEVELS[0]!.rows).toBe(8)
    expect(LEVELS[4]!.cols).toBe(14)
    expect(LEVELS[4]!.rows).toBe(10)
    for (const conf of LEVELS) expect(conf.rows * conf.cols % 2).toBe(0)
    expect(levelKinds(1)).toBe(12)
    expect(levelKinds(5)).toBe(20)
  })

  it('路径判定：直连、一拐、两拐（借场外圈）可达，被围死与三拐以上不可达', () => {
    // 直连：同行中间无阻。
    const straight = craftState(4, 4, [
      [0, null, null, 0],
      [null, null, null, null],
      [null, null, null, null],
      [null, null, null, null],
    ])
    const p0 = findPath(straight.grid, 4, 4, { r: 0, c: 0 }, { r: 0, c: 3 })!
    expect(p0).toEqual([{ r: 0, c: 0 }, { r: 0, c: 3 }])

    // 一拐：直角拐点 (2,0)。
    const oneTurn = craftState(4, 4, [
      [0, 1, null, null],
      [null, null, null, null],
      [null, null, null, 1],
      [null, null, null, null],
    ])
    const p1 = findPath(oneTurn.grid, 4, 4, { r: 0, c: 0 }, { r: 2, c: 3 })!
    expect(p1).toEqual([{ r: 0, c: 0 }, { r: 2, c: 0 }, { r: 2, c: 3 }])

    // 两拐：内侧被墙隔开，借场外圈绕行。
    const twoTurn = craftState(4, 4, [
      [0, 1, 1, null],
      [1, null, null, null],
      [null, null, null, null],
      [null, null, null, 0],
    ])
    const p2 = findPath(twoTurn.grid, 4, 4, { r: 0, c: 0 }, { r: 3, c: 3 })
    expect(p2).not.toBeNull()
    expect(p2!.length).toBe(4)

    // 被四邻围死：任何 ≤2 拐路径都无法离开起点。
    const enclosed = craftState(4, 4, [
      [null, 1, null, null],
      [1, 0, 1, null],
      [null, 1, null, null],
      [null, null, null, 0],
    ])
    expect(findPath(enclosed.grid, 4, 4, { r: 1, c: 1 }, { r: 3, c: 3 })).toBeNull()
    expect(canLink(enclosed.grid, 4, 4, { r: 1, c: 1 }, { r: 3, c: 3 })).toBe(false)
    // 同格不算路径。
    expect(findPath(enclosed.grid, 4, 4, { r: 1, c: 1 }, { r: 1, c: 1 })).toBeNull()
  })

  it('点击选牌：选中/取消/切换，配对成功消除并记录路径与得分', () => {
    const state = craftState(4, 4, [
      [0, 0, 1, 1],
      [2, 2, 3, 3],
      [4, 4, 5, 5],
      [6, 6, 7, 7],
    ])
    expect(tapTile(state, idx(0, 1, 4))).toBe('select')
    expect(state.selected).toBe(idx(0, 1, 4))
    expect(tapTile(state, idx(0, 1, 4))).toBe('deselect')
    expect(state.selected).toBeNull()
    expect(tapTile(state, idx(0, 0, 4))).toBe('select')
    expect(tapTile(state, idx(0, 1, 4))).toBe('match')
    expect(state.grid[0]![0]).toBeNull()
    expect(state.grid[0]![1]).toBeNull()
    expect(state.pairsLeft).toBe(7)
    expect(state.lastPath).not.toBeNull()
    expect(state.earned).toBe(pairValue(1))
    // 不同图案：仅切换选中，不消除。
    expect(tapTile(state, idx(0, 2, 4))).toBe('select')
    expect(tapTile(state, idx(1, 0, 4))).toBe('select')
    expect(state.selected).toBe(idx(1, 0, 4))
    expect(state.grid[0]![2]).not.toBeNull()
    // 已消除的空格与场外索引不可点。
    expect(tapTile(state, 0)).toBe('none')
    expect(tapTile(state, 999)).toBe('none')
  })

  it('同图案但不可达也只切换选中', () => {
    const state = craftState(4, 4, [
      [null, 1, null, null],
      [1, 0, 1, null],
      [null, 1, null, null],
      [null, null, null, 0],
    ])
    expect(tapTile(state, idx(1, 1, 4))).toBe('select')
    expect(tapTile(state, idx(3, 3, 4))).toBe('select')
    expect(state.selected).toBe(idx(3, 3, 4))
    // 该手工牌面共 3 对（四张 1 + 两张 0）。
    expect(state.pairsLeft).toBe(3)
  })

  it('清场过关、空格进下一关，第 5 关清场通关', () => {
    const state = craftState(2, 2, [[0, 0], [1, 1]])
    tapTile(state, 0)
    expect(tapTile(state, 1)).toBe('match')
    tapTile(state, 2)
    expect(tapTile(state, 3)).toBe('match')
    expect(state.status).toBe('cleared')
    // 过关结算：消除分 + 剩余时间奖励 - 计时扣分。
    const base = 2 * pairValue(1)
    expect(state.earned).toBe(base + Math.floor(state.timeLeft) * 2 - Math.floor(state.elapsed))
    expect(advanceLevel(state)).toBe(true)
    expect(state.level).toBe(2)
    expect(state.status).toBe('playing')
    expect(state.rows).toBe(LEVELS[1]!.rows)
    expect(state.elapsed).toBe(0)
    // 第 5 关清场即通关。
    const final = createLinkState(7, 5)
    final.grid = [[0, 0]]
    final.rows = 1
    final.cols = 2
    final.pairsLeft = 1
    tapTile(final, 0)
    expect(tapTile(final, 1)).toBe('match')
    expect(final.status).toBe('won')
    expect(advanceLevel(final)).toBe(false)
  })

  it('洗牌：保持牌面多重集、消耗次数、洗后可解；次数用尽拒绝', () => {
    const state = createLinkState(99)
    // 用可连对搜索消掉 5 对进入中盘（确定性）。
    for (let removed = 0; removed < 5; removed += 1) {
      const pair = findLinkablePair(state)
      expect(pair).not.toBeNull()
      expect(tapTile(state, pair![0].r * state.cols + pair![0].c)).toBe('select')
      expect(tapTile(state, pair![1].r * state.cols + pair![1].c)).toBe('match')
    }
    const before = state.grid.flat().filter(v => v !== null).sort((a, b) => a! - b!)
    expect(state.pairsLeft).toBe((state.rows * state.cols) / 2 - 5)
    expect(shuffleRemaining(state)).toBe(true)
    const after = state.grid.flat().filter(v => v !== null).sort((a, b) => a! - b!)
    expect(after).toEqual(before)
    expect(state.shufflesLeft).toBe(SHUFFLES_PER_LEVEL - 1)
    expect(findLinkablePair(state)).not.toBeNull()
    // 用尽次数后拒绝且牌面不动。
    state.shufflesLeft = 0
    const frozen = state.grid.map(row => [...row])
    expect(shuffleRemaining(state)).toBe(false)
    expect(state.grid).toEqual(frozen)
  })

  it('死局检测：无可连对标记死局，无洗牌次数则判负', () => {
    // 2x2 棋盘同图案对角相隔，四条 ≤2 拐路径全部被另一对牌挡死。
    const state = craftState(2, 2, [[0, 1], [1, 0]])
    state.shufflesLeft = 3
    refreshDeadlock(state)
    expect(state.deadlock).toBe(true)
    expect(state.status).toBe('playing')
    state.shufflesLeft = 0
    refreshDeadlock(state)
    expect(state.status).toBe('lost')
    expect(tapTile(state, 0)).toBe('none')
  })

  it('计时推进与倒扣分：整秒扣 1 分、下限 0，超时判负后不再计时', () => {
    const state = createLinkState(5)
    state.earned = 5
    state.elapsed = 0
    expect(currentScore(state)).toBe(5)
    expect(tick(state, 0.5)).toBe('ok')
    expect(tick(state, 0.5)).toBe('ok')
    expect(state.elapsed).toBe(1)
    expect(currentScore(state)).toBe(4)
    tick(state, 4)
    expect(currentScore(state)).toBe(0) // 下限 0
    state.earned = 100
    state.timeLeft = 0.4
    expect(tick(state, 1)).toBe('lost')
    expect(state.status).toBe('lost')
    expect(tick(state, 1)).toBe('lost')
    expect(state.timeLeft).toBe(0)
  })

  it('mulberry32 序列确定性且分布于 [0,1)', () => {
    const a = mulberry32(777)
    const b = mulberry32(777)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
    expect(mulberry32(778)()).not.toBe(seqA[0])
    for (let i = 0; i < 100; i += 1) {
      const v = a()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('idxToPos 行优先换算', () => {
    const p: Pos = idxToPos(7, 4)
    expect(p).toEqual({ r: 1, c: 3 })
  })
})
