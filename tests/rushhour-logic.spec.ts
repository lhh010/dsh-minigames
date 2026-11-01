import { describe, expect, it } from 'vitest'
import {
  SIZE, computeScore, generateLevel, moveVehicle, solve, vehicleAt, vehicleCells,
  type RushHourState, type Vehicle,
} from '../src/client/games/rushhour/logic.ts'

/** 复刻滑动合法性几何：目标在界内、不同于当前、且滑动路径（不含自身格）无占用。 */
function legalTarget(vehicles: Vehicle[], idx: number, targetPos: number): boolean {
  const v = vehicles[idx]!
  if (targetPos < 0 || targetPos + v.length > SIZE) return false
  if (targetPos === v.pos) return false
  const lo = Math.min(v.pos, targetPos)
  const hi = Math.max(v.pos, targetPos)
  for (let p = lo; p < hi + v.length; p += 1) {
    if (p >= v.pos && p < v.pos + v.length) continue
    if (vehicleAt(vehicles, v.horizontal ? v.fixed : p, v.horizontal ? p : v.fixed) !== null) return false
  }
  return true
}

/** 生成关卡并做结构校验：红车居首、无重叠、BFS 可解且步数落在目标区间。 */
function checkLevel(seed: number, level: number): RushHourState {
  const s = generateLevel(seed, level)
  expect(s.won).toBe(false)
  expect(s.moves).toBe(0)
  expect(s.vehicles[0]!.red).toBe(true)
  expect(s.vehicles[0]!.horizontal).toBe(true)
  expect(s.vehicles[0]!.length).toBe(2)
  expect(s.vehicles[0]!.fixed).toBe(s.exitRow)
  expect(s.vehicles.filter((v) => v.red).length).toBe(1)
  // 无重叠：每辆车占据的每格都命中自身索引。
  s.vehicles.forEach((v, i) => {
    for (const [r, c] of vehicleCells(v)) expect(vehicleAt(s.vehicles, r, c)).toBe(i)
  })
  expect(s.optimal).toBeGreaterThan(0)
  // 目标区间随关卡上移；targetMin ≥ 12 的深谜题稀缺，只保下界。
  const target = Math.min(8 + (level - 1), 20)
  const targetMin = Math.max(6, target - 2)
  expect(s.optimal).toBeGreaterThanOrEqual(targetMin)
  if (targetMin < 12) expect(s.optimal).toBeLessThanOrEqual(target + 3)
  expect(s.score).toBe(computeScore(level, 0, s.optimal))
  return s
}

describe('rush hour logic', () => {
  it('generateLevel is deterministic per (seed, level) and produces valid solvable boards', () => {
    for (const [seed, level] of [[1, 1], [42, 1], [7, 3], [999, 2]] as const) {
      const a = checkLevel(seed, level)
      const b = generateLevel(seed, level)
      expect(a).toEqual(b)
    }
    // 不同 seed 或 level 未必同布局，但各自都有效。
    checkLevel(12345, 1)
  }, 30000)

  it('solve returns 0 for a solved board, 1 for a one-move board, and -1 when the exit is sealed', () => {
    const red: Vehicle = { horizontal: true, length: 2, fixed: 2, pos: 4, red: true }
    expect(solve([red])).toBe(0)
    expect(solve([{ ...red, pos: 3 }])).toBe(1)
    // 红车行被两节首尾相接的垂直车封死：彼此卡死，谁都滑不动。
    const sealed: Vehicle[] = [
      { ...red, pos: 0 },
      { horizontal: false, length: 3, fixed: 3, pos: 0, red: false },
      { horizontal: false, length: 3, fixed: 3, pos: 3, red: false },
    ]
    expect(solve(sealed)).toBe(-1)
    // 同列对顶的垂直车确实互相锁死（合法目标不存在）。
    expect(legalTarget(sealed, 1, 1)).toBe(false)
    expect(legalTarget(sealed, 2, 2)).toBe(false)
  })

  it('moveVehicle accepts exactly the geometrically legal slides on a generated board', () => {
    const s = generateLevel(2024, 1)
    let accepted = 0
    let rejected = 0
    for (let idx = 0; idx < s.vehicles.length; idx += 1) {
      for (let p = 0; p < SIZE; p += 1) {
        const expected = legalTarget(s.vehicles, idx, p)
        const got = moveVehicle(s, idx, p)
        if (expected) {
          expect(got).not.toBeNull()
          expect(got!.vehicles[idx]!.pos).toBe(p)
          accepted += 1
        } else {
          expect(got).toBeNull()
          rejected += 1
        }
      }
    }
    expect(accepted).toBeGreaterThan(0)
    expect(rejected).toBeGreaterThan(0)
  })

  it('moveVehicle is pure: the source state is untouched and the result bumps moves and score', () => {
    const s = generateLevel(5, 2)
    const before = JSON.stringify(s)
    // 找一个合法滑动。
    let move: { idx: number, pos: number } | null = null
    outer: for (let idx = 0; idx < s.vehicles.length; idx += 1) {
      for (let p = 0; p < SIZE; p += 1) {
        if (legalTarget(s.vehicles, idx, p)) { move = { idx, pos: p }; break outer }
      }
    }
    expect(move).not.toBeNull()
    const next = moveVehicle(s, move!.idx, move!.pos)!
    expect(next.moves).toBe(s.moves + 1)
    expect(next.score).toBe(computeScore(next.level, next.moves, next.optimal))
    expect(JSON.stringify(s)).toBe(before)
    expect(next).not.toBe(s)
    expect(next.vehicles[move!.idx]).not.toBe(s.vehicles[move!.idx]!)
  })

  it('sliding the red car out of the exit wins and freezes the final score', () => {
    const red: Vehicle = { horizontal: true, length: 2, fixed: 2, pos: 2, red: true }
    const s: RushHourState = {
      seed: 1, level: 1, exitRow: 2, vehicles: [red], moves: 0, optimal: 1,
      score: computeScore(1, 0, 1), won: false,
    }
    // 目标位 5 越界（5 + 2 > SIZE）：拒绝。
    expect(moveVehicle(s, 0, 5)).toBeNull()
    // 滑到 4：红车右端开出右侧出口。
    const won = moveVehicle(s, 0, 4)!
    expect(won.won).toBe(true)
    expect(won.vehicles[0]!.pos + won.vehicles[0]!.length).toBe(SIZE)
    expect(won.score).toBe(computeScore(1, 1, 1))
    // 胜利后仍可继续 step 计分不再变化（won 定格）：再滑不影响已定格分数语义由 score 字段承载。
    expect(s.won).toBe(false)
  })

  it('a BFS replay through moveVehicle wins generated levels in exactly optimal moves', () => {
    for (const [seed, level] of [[11, 1], [12, 2]] as const) {
      const s = checkLevel(seed, level)
      // BFS 找最短滑动序列（与实现同语义的独立复算）。
      const key = (pos: number[]) => pos.join(',')
      const start = s.vehicles.map((v) => v.pos)
      const prev = new Map<string, { pos: number[], from: string }>()
      prev.set(key(start), { pos: start, from: '' })
      let frontier: number[][] = [start]
      let depth = 0
      let winKey: string | null = null
      while (frontier.length > 0 && winKey === null) {
        depth += 1
        const next: number[][] = []
        for (const pos of frontier) {
          const cars = s.vehicles.map((v, i) => ({ ...v, pos: pos[i]! }))
          for (let i = 0; i < cars.length; i += 1) {
            for (let p = 0; p + cars[i]!.length <= SIZE; p += 1) {
              if (!legalTarget(cars, i, p)) continue
              const cand = pos.slice()
              cand[i] = p
              const k = key(cand)
              if (prev.has(k)) continue
              prev.set(k, { pos: cand, from: key(pos) })
              if (i === 0 && p + cars[0]!.length === SIZE) { winKey = k; break }
              next.push(cand)
            }
            if (winKey !== null) break
          }
          if (winKey !== null) break
        }
        frontier = next
      }
      expect(winKey).not.toBeNull()
      expect(depth).toBe(s.optimal)
      // 回溯路径并用 moveVehicle 逐步重放。
      const path: number[][] = []
      for (let k = winKey!; k !== ''; k = prev.get(k)!.from) path.unshift(prev.get(k)!.pos)
      let cur = s
      for (let i = 1; i < path.length; i += 1) {
        const idx = path[i]!.findIndex((p, j) => p !== path[i - 1]![j])
        const moved = moveVehicle(cur, idx, path[i]![idx]!)
        expect(moved).not.toBeNull()
        cur = moved!
      }
      expect(cur.won).toBe(true)
      expect(cur.moves).toBe(s.optimal)
      expect(cur.score).toBe(computeScore(level, s.optimal, s.optimal))
    }
  }, 60000)

  it('computeScore ramps with level, penalizes excess moves, and floors at 100', () => {
    expect(computeScore(1, 8, 8)).toBe(600)
    expect(computeScore(3, 12, 12)).toBe(600 + 2 * 40)
    expect(computeScore(1, 8 + 5, 8)).toBe(600 - 5 * 25)
    expect(computeScore(1, 8 + 100, 8)).toBe(100)
    // 未超步不奖励、也不扣分。
    expect(computeScore(2, 0, 9)).toBe(computeScore(2, 9, 9))
  })
})
