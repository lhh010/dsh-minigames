import { describe, expect, it } from 'vitest'
import {
  createMahjongState, findPath, canRemove, removePair, findHintPair, hasAnyMatch,
  shuffleTiles, tickTime, pairsRemaining, levelPairs, levelTimeSec, pairScore,
} from '../src/client/games/mahjong/logic.ts'

function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** 空牌面（全 0）的 rows x cols 网格。 */
function emptyGrid(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))
}

describe('mahjong link logic', () => {
  it('0 拐：同行直连可达，中间有牌则不可达', () => {
    const grid = emptyGrid(3, 7)
    grid[1]![1] = 1
    grid[1]![5] = 1
    const path = findPath(grid, { r: 1, c: 1 }, { r: 1, c: 5 })
    expect(path).toEqual([{ r: 1, c: 1 }, { r: 1, c: 5 }])
    // 中间放一张别牌后，上下两排满墙也堵死绕行 → 无路径。
    const blocked = emptyGrid(3, 7)
    blocked[0] = [1, 1, 1, 1, 1, 1, 1]
    blocked[1] = [0, 1, 0, 2, 0, 1, 0]
    blocked[2] = [1, 1, 1, 1, 1, 1, 1]
    expect(findPath(blocked, { r: 1, c: 1 }, { r: 1, c: 5 })).toBeNull()
    expect(canRemove(blocked, { r: 1, c: 1 }, { r: 1, c: 5 })).toBe(false)
  })

  it('1 拐：路径经过矩形角；两角被堵时返回 2 拐路径', () => {
    const grid = emptyGrid(4, 5)
    grid[0]![1] = 1
    grid[2]![4] = 1
    const path = findPath(grid, { r: 0, c: 1 }, { r: 2, c: 4 })
    expect(path).toEqual([{ r: 0, c: 1 }, { r: 0, c: 4 }, { r: 2, c: 4 }])
    // 堵住两个矩形角 (0,4) 与 (2,1)，仍可绕外圈两拐到达。
    const walled = emptyGrid(4, 5)
    walled[0]![1] = 1
    walled[0]![4] = 2
    walled[2]![1] = 2
    walled[2]![4] = 1
    const detour = findPath(walled, { r: 0, c: 1 }, { r: 2, c: 4 })
    expect(detour).not.toBeNull()
    expect(detour!.length).toBe(4) // a + 两个拐点 + b
    expect(canRemove(walled, { r: 0, c: 1 }, { r: 2, c: 4 })).toBe(true)
  })

  it('2 拐：可借道场外虚拟圈绕行（上侧一圈）', () => {
    const grid = emptyGrid(3, 5)
    grid[0] = [1, 1, 1, 0, 0]
    grid[1] = [1, 1, 1, 0, 0]
    grid[2] = [0, 0, 0, 0, 1]
    // a=(0,1) 的出路只有上方场外；折线 [-1,1]→[-1,4]→b 共两拐。
    const path = findPath(grid, { r: 0, c: 1 }, { r: 2, c: 4 })
    expect(path).toEqual([{ r: 0, c: 1 }, { r: -1, c: 1 }, { r: -1, c: 4 }, { r: 2, c: 4 }])
  })

  it('需要超过两次拐弯的绕行不可行（3 拐及以上无路）', () => {
    // a=(0,0)、b=(1,3)：墙 (0,3)、(1,0)、(1,1)、(1,2) 把 b 围成只有
    // 下方入口的口袋，任何连线至少 4 次拐弯 → 逻辑判定不可消。
    const grid = emptyGrid(4, 4)
    grid[0] = [1, 0, 0, 2]
    grid[1] = [2, 2, 2, 1]
    const a = { r: 0, c: 0 }
    const b = { r: 1, c: 3 }
    expect(findPath(grid, a, b)).toBeNull()
    expect(canRemove(grid, a, b)).toBe(false)
  })

  it('按 seed 成对生成牌面且布局一致', () => {
    const state = createMahjongState(lcg(3), 2)
    expect(levelPairs(2)).toBe(15)
    expect(levelTimeSec(2)).toBe(100 + 15 * 4)
    const counts = new Map<number, number>()
    let tiles = 0
    for (let r = 0; r < state.rows; r += 1) {
      for (let c = 0; c < state.cols; c += 1) {
        const kind = state.grid[r]![c]!
        expect(state.layout[r]![c] === (kind !== 0)).toBe(true)
        if (kind !== 0) {
          tiles += 1
          counts.set(kind, (counts.get(kind) ?? 0) + 1)
          expect(kind).toBeGreaterThanOrEqual(1)
          expect(kind).toBeLessThanOrEqual(27)
        }
      }
    }
    expect(tiles).toBe(levelPairs(2) * 2)
    for (const n of counts.values()) expect(n % 2).toBe(0)
    expect(pairsRemaining(state.grid)).toBe(15)
    // 生成后仍存在可消对（未直接生成死局）。
    expect(hasAnyMatch(state.grid)).toBe(true)
    expect(findHintPair(state.grid)).not.toBeNull()
  })

  it('同 seed 同关卡生成结果确定', () => {
    const a = createMahjongState(lcg(42), 3)
    const b = createMahjongState(lcg(42), 3)
    expect(a.grid).toEqual(b.grid)
    expect(a.layout).toEqual(b.layout)
    expect(a.timeLeft).toBe(b.timeLeft)
    const c = createMahjongState(lcg(43), 3)
    expect(c.grid).not.toEqual(a.grid)
  })

  it('消除后通路更新：先消障碍对，被围对变为可消直至清场', () => {
    const state = createMahjongState(lcg(7), 1)
    // 复用 3 拐口袋：墙 (0,3)(1,0) 为一对 2，(1,1)(1,2) 为另一对 2。
    const grid = emptyGrid(8, 12)
    grid[0]![0] = 1
    grid[0]![3] = 2
    grid[1] = [2, 2, 2, 1, ...Array.from({ length: 8 }, () => 0)]
    state.grid = grid
    const a = { r: 0, c: 0 }
    const b = { r: 1, c: 3 }
    expect(canRemove(state.grid, a, b)).toBe(false)
    // 相邻的一对 2 可直消；消掉后 a、b 的绕行通道打开。
    const wallPair = removePair(state, { r: 1, c: 0 }, { r: 1, c: 1 })
    expect(wallPair).not.toBeNull()
    expect(canRemove(state.grid, a, b)).toBe(true)
    expect(removePair(state, a, b)).not.toBeNull()
    expect(removePair(state, { r: 0, c: 3 }, { r: 1, c: 2 })).not.toBeNull()
    expect(state.result).toBe('win')
    // 3 对 × pairScore(1)=12，加未用提示的剩余时间奖励 148×3。
    expect(state.score).toBe(3 * pairScore(1) + 148 * 3)
    // 结算后逻辑不再接受消除。
    expect(removePair(state, { r: 0, c: 0 }, { r: 0, c: 0 })).toBeNull()
  })

  it('死局自动洗牌：保持牌面多重集并恢复可消', () => {
    // 两排满行、每个牌面上下各出现一次且不同列：任何同牌对都无法
    // 在 ≤2 拐内相连（横竖向都被邻牌堵死，绕外圈必穿第三张牌）。
    const state = createMahjongState(lcg(11), 1)
    const grid = emptyGrid(8, 12)
    for (let c = 0; c < 12; c += 1) {
      grid[0]![c] = c + 1
      grid[1]![c] = ((c + 6) % 12) + 1
    }
    state.grid = grid
    expect(pairsRemaining(grid)).toBe(12)
    expect(hasAnyMatch(grid)).toBe(false)
    const before = grid.flat().slice().sort((x, y) => x - y)
    expect(shuffleTiles(state)).toBe(true)
    const after = state.grid.flat().slice().sort((x, y) => x - y)
    expect(after).toEqual(before)
    expect(hasAnyMatch(state.grid)).toBe(true)
  })

  it('计时到零判负且停止结算', () => {
    const state = createMahjongState(lcg(5), 1)
    tickTime(state, 10)
    expect(state.timeLeft).toBeCloseTo(levelTimeSec(1) - 10, 5)
    expect(state.result).toBe('none')
    tickTime(state, 1000)
    expect(state.timeLeft).toBe(0)
    expect(state.result).toBe('lose')
    tickTime(state, 5)
    expect(state.timeLeft).toBe(0)
  })

  it('不同牌面不可消，提示对返回的两张牌确实可消', () => {
    const grid = emptyGrid(3, 6)
    grid[0]![0] = 1
    grid[0]![5] = 2
    expect(canRemove(grid, { r: 0, c: 0 }, { r: 0, c: 5 })).toBe(false)
    const state = createMahjongState(lcg(9), 4)
    const pair = findHintPair(state.grid)
    expect(pair).not.toBeNull()
    expect(canRemove(state.grid, pair![0], pair![1])).toBe(true)
    expect(state.grid[pair![0].r]![pair![0].c]).toBe(state.grid[pair![1].r]![pair![1].c])
  })
})
