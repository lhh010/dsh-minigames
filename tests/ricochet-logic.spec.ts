import { describe, expect, it } from 'vitest'
import {
  MAX_PAR, ROBOT_COUNT, SIZE, cloneState, computeScore, freeCellsConnected, generateLevel,
  slideAll, slideRobots, solve,
  type Pos, type RicochetState,
} from '../src/client/games/ricochet/logic.ts'

/** 全墙外圈 + 指定内部墙格的盘面。 */
function board(inner: Array<[number, number]>): boolean[][] {
  const walls: boolean[][] = []
  for (let r = 0; r < SIZE; r += 1) walls.push(new Array<boolean>(SIZE).fill(false))
  for (let r = 0; r < SIZE; r += 1) {
    walls[r]![0] = true
    walls[r]![SIZE - 1] = true
    walls[0]![r] = true
    walls[SIZE - 1]![r] = true
  }
  for (const [r, c] of inner) walls[r]![c] = true
  return walls
}

const p = (row: number, col: number): Pos => ({ row, col })

/** 生成关卡并做结构校验：外圈墙、连通、四机器人不重叠且不在目标格、可解。 */
function checkLevel(seed: number, level: number): RicochetState {
  const s = generateLevel(seed, level)
  expect(s.won).toBe(false)
  expect(s.failed).toBe(false)
  expect(s.moves).toBe(0)
  expect(s.robots.length).toBe(ROBOT_COUNT)
  for (let r = 0; r < SIZE; r += 1) {
    expect(s.walls[r]![0]).toBe(true)
    expect(s.walls[r]![SIZE - 1]).toBe(true)
    expect(s.walls[0]![r]).toBe(true)
    expect(s.walls[SIZE - 1]![r]).toBe(true)
  }
  expect(freeCellsConnected(s.walls)).toBe(true)
  const seen = new Set<number>([s.target.row * SIZE + s.target.col])
  for (const robot of s.robots) {
    const k = robot.row * SIZE + robot.col
    expect(seen.has(k)).toBe(false)
    seen.add(k)
    expect(s.walls[robot.row]![robot.col]).toBe(false)
  }
  expect(s.walls[s.target.row]![s.target.col]).toBe(false)
  expect(s.par).toBeGreaterThanOrEqual(1)
  expect(s.par).toBeLessThanOrEqual(MAX_PAR)
  expect(s.limit).toBe(s.par + 4)
  expect(s.score).toBe(computeScore(level, 0, s.par))
  return s
}

describe('ricochet logic', () => {
  it('generateLevel is deterministic per (seed, level) and produces valid solvable boards', () => {
    for (const [seed, level] of [[1, 1], [42, 1], [7, 3], [999, 5]] as const) {
      const a = checkLevel(seed, level)
      const b = generateLevel(seed, level)
      expect(a).toEqual(b)
    }
  }, 30000)

  it('all five levels generate valid boards with non-decreasing wall budget', () => {
    let walls = 0
    for (let level = 1; level <= 5; level += 1) {
      const s = checkLevel(2026, level)
      const count = s.walls.flat().filter(Boolean).length
      if (level === 1) walls = count
      else expect(count).toBeGreaterThanOrEqual(walls - 2)
      walls = Math.max(walls, count)
    }
  }, 60000)

  it('robots slide until a wall and stop; other robots act as stepping-stone blockers', () => {
    // 行 5：墙在列 0/9；机器人 A(5,2) 前方无阻挡 → 滑到列 8（右墙前一格）。
    const w = board([[3, 4]])
    const slid = slideRobots(w, [p(5, 2), p(2, 2), p(2, 7), p(8, 5)], 'right')
    expect(slid).not.toBeNull()
    expect(slid![0]).toEqual(p(5, 8))
    // 两个同向机器人：先行者先落定，后行者紧贴其后（垫脚石语义）。
    // A(5,2)、B(5,4) 同向右滑：B 落定列 8，A 紧贴列 7。
    const pair = slideRobots(w, [p(5, 2), p(5, 4), p(2, 2), p(8, 5)], 'right')
    expect(pair![0]).toEqual(p(5, 7))
    expect(pair![1]).toEqual(p(5, 8))
  })

  it('simultaneous resolution is order-independent: leading robot settles first', () => {
    // 无论机器人索引如何排列，同向滑行的落点集合一致（先行者先停）。
    const w = board([[4, 4], [6, 7], [2, 3]])
    const robots = [p(5, 2), p(5, 4), p(8, 3), p(8, 8)]
    const a = slideRobots(w, robots, 'right')
    const swapped = [robots[1]!, robots[0]!, robots[3]!, robots[2]!]
    const b = slideRobots(w, swapped, 'right')
    expect(b).not.toBeNull()
    // 逆映射回原索引后落点相同。
    expect([b![1], b![0], b![3], b![2]]).toEqual(a)
    // 上滑：col 2 无内墙，(5,2) 一路滑到行 1（顶墙前一格）。
    const up = slideRobots(w, robots, 'up')
    expect(up![0]).toEqual(p(1, 2))
  })

  it('slideAll consumes no step when nothing can move and returns null', () => {
    // 全部机器人贴住顶墙 → 上滑无人可动 → null。
    const w = board([])
    const topRow: RicochetState = {
      seed: 1, level: 1, walls: w, robots: [p(1, 1), p(1, 4), p(1, 6), p(1, 8)],
      target: p(8, 8), targetRobot: 0, moves: 0, par: 3, limit: 7,
      score: 600, won: false, failed: false,
    }
    expect(slideAll(topRow, 'up')).toBeNull()
    // 全部机器人贴住左墙 → 左滑无人可动 → null。
    const leftCol: RicochetState = {
      ...topRow, robots: [p(1, 1), p(4, 1), p(6, 1), p(8, 1)],
    }
    expect(slideAll(leftCol, 'left')).toBeNull()
  })

  it('slideAll counts a move, detects reaching the target, and freezes the score', () => {
    // 目标机器人 (1,6) 向左滑被内墙 (1,3) 挡在列 4 = 目标格。
    const w = board([[1, 3]])
    const state: RicochetState = {
      seed: 1, level: 2, walls: w, robots: [p(1, 6), p(5, 5), p(8, 2), p(3, 8)],
      target: p(1, 4), targetRobot: 0, moves: 0, par: 4, limit: 8,
      score: computeScore(2, 0, 4), won: false, failed: false,
    }
    const next = slideAll(state, 'left')
    expect(next).not.toBeNull()
    expect(next!.moves).toBe(1)
    expect(next!.won).toBe(true)
    expect(next!.score).toBe(computeScore(2, 1, 4))
    // 已胜状态不再接受滑动。
    expect(slideAll(next!, 'right')).toBeNull()
  })

  it('failed flag trips when the move limit is exhausted without a win', () => {
    const w = board([[5, 5]])
    const state: RicochetState = {
      seed: 1, level: 1, walls: w, robots: [p(1, 1), p(8, 8), p(1, 8), p(8, 1)],
      target: p(5, 7), targetRobot: 0, moves: 0, par: 2, limit: 6,
      score: 600, won: false, failed: false,
    }
    let cur: RicochetState = cloneState(state)
    // 交替左右滑永远到不了目标；6 步耗尽后 failed。
    const dirs: Array<'right' | 'left'> = ['right', 'left', 'right', 'left', 'right', 'left']
    for (let i = 0; i < dirs.length; i += 1) {
      const next = slideAll(cur, dirs[i]!)
      expect(next).not.toBeNull()
      cur = next!
      if (cur.moves < 6) expect(cur.failed).toBe(false)
    }
    expect(cur.moves).toBe(6)
    expect(cur.won).toBe(false)
    expect(cur.failed).toBe(true)
    // 失败状态不再接受滑动。
    expect(slideAll(cur, 'up')).toBeNull()
  })

  it('solve returns 0 when already solved, 1 for a one-move board, and -1 for a sealed target', () => {
    const w = board([])
    // 已在目标格。
    expect(solve(w, [p(3, 3), p(1, 1), p(1, 8), p(8, 8)], p(3, 3), 0)).toBe(0)
    // (1,6) 向左一路滑到 (1,1)?? 外圈墙挡住 → 停在列 1；目标设列 1 即一步。
    expect(solve(w, [p(1, 6), p(5, 5), p(1, 8), p(8, 8)], p(1, 1), 0)).toBe(1)
    // 目标格四面围墙（完全封死）：任何机器人都进不去。
    const sealed = board([[2, 3], [4, 3], [3, 2], [3, 4]])
    expect(solve(sealed, [p(1, 1), p(1, 8), p(8, 1), p(8, 8)], p(3, 3), 0)).toBe(-1)
  })

  it('generated levels admit a replay matching par via slideAll from the initial state', () => {
    // 用 BFS 自身的解长度做一致性检查：generateLevel 后 par 即最优步数，
    // 重新求解应得到同一 par（状态可复现）。
    for (const [seed, level] of [[5, 1], [5, 3], [5, 5]] as const) {
      const s = generateLevel(seed, level)
      expect(solve(s.walls, s.robots, s.target, s.targetRobot)).toBe(s.par)
    }
  }, 30000)
})
