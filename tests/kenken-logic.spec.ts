import { describe, expect, it } from 'vitest'
import {
  KENKEN_SIZE, cageLabel, cageSatisfied, cellErrors, computeScore,
  generateKenken, isLatin, isWon, levelConfig, mulberry32,
  type KenkenCage,
} from '../src/client/games/kenken/logic.ts'

const emptyGrid = (): number[][] =>
  Array.from({ length: KENKEN_SIZE }, () => new Array<number>(KENKEN_SIZE).fill(0))

/** BFS 验证笼内格子四连通。 */
function cageConnected(cage: KenkenCage): boolean {
  const inCage = new Set(cage.cells.map(p => p.r * KENKEN_SIZE + p.c))
  const seen = new Set<number>([cage.cells[0]!.r * KENKEN_SIZE + cage.cells[0]!.c])
  const queue = [cage.cells[0]!]
  while (queue.length > 0) {
    const p = queue.shift()!
    for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = p.r + d[0]!
      const c = p.c + d[1]!
      if (r < 0 || r >= KENKEN_SIZE || c < 0 || c >= KENKEN_SIZE) continue
      const key = r * KENKEN_SIZE + c
      if (!inCage.has(key) || seen.has(key)) continue
      seen.add(key)
      queue.push({ r, c })
    }
  }
  return seen.size === cage.cells.length
}

describe('kenken logic', () => {
  it('mulberry32 is deterministic per seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('generateKenken is deterministic for the same seed and level', () => {
    const p1 = generateKenken(1234 * 0x9e3779b9, 3)
    const p2 = generateKenken(1234 * 0x9e3779b9, 3)
    expect(p2).toEqual(p1)
  })

  it('every level generates a latin-square solution', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = generateKenken(lv * 0x9e3779b9, lv)
      expect(p.solution.length).toBe(KENKEN_SIZE)
      expect(isLatin(p.solution)).toBe(true)
    }
  })

  it('cages cover the board exactly once, are connected, sized 2-4, and open ops only', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = generateKenken(lv * 0x9e3779b9, lv)
      const cfg = levelConfig(lv)
      expect(new Set(p.cages.flatMap(cage => cage.cells.map(cell => cell.r * KENKEN_SIZE + cell.c))).size)
        .toBe(KENKEN_SIZE * KENKEN_SIZE)
      for (const cage of p.cages) {
        expect(cage.cells.length).toBeGreaterThanOrEqual(2)
        expect(cage.cells.length).toBeLessThanOrEqual(4)
        expect(cageConnected(cage)).toBe(true)
        expect(cfg.ops).toContain(cage.op)
        expect(Number.isInteger(cage.target)).toBe(true)
      }
    }
  })

  it('the generated solution satisfies every cage and wins', () => {
    for (let lv = 1; lv <= 5; lv += 1) {
      const p = generateKenken(lv * 0x9e3779b9, lv)
      for (const cage of p.cages) expect(cageSatisfied(cage, p.solution)).toBe(true)
      expect(isWon(p, p.solution)).toBe(true)
    }
  })

  it('isLatin rejects a duplicated row or column value', () => {
    const good = generateKenken(7, 1).solution.map(row => [...row])
    expect(isLatin(good)).toBe(true)
    const badRow = good.map(row => [...row])
    badRow[0]![0] = badRow[0]![1]!
    expect(isLatin(badRow)).toBe(false)
    const badCol = good.map(row => [...row])
    badCol[0]![0] = badCol[1]![0]!
    expect(isLatin(badCol)).toBe(false)
  })

  it('cageSatisfied handles - and ÷ in any cell order', () => {
    const grid = [[6, 0], [2, 0]]
    const sub: KenkenCage = { op: '-', target: 4, cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }] }
    const div: KenkenCage = { op: '÷', target: 3, cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }] }
    expect(cageSatisfied(sub, grid)).toBe(true)
    expect(cageSatisfied(div, grid)).toBe(true)
    const swapped = [[2, 0], [6, 0]]
    expect(cageSatisfied(sub, swapped)).toBe(true)
    expect(cageSatisfied(div, swapped)).toBe(true)
    const wrong: KenkenCage = { op: '÷', target: 4, cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }] }
    expect(cageSatisfied(wrong, grid)).toBe(false)
    const partial: KenkenCage = { op: '-', target: 4, cells: [{ r: 0, c: 1 }, { r: 1, c: 1 }] }
    expect(cageSatisfied(partial, grid)).toBe(false)
  })

  it('cellErrors flags row/column duplicates and broken complete cages only', () => {
    const p = generateKenken(11, 2)
    const grid = emptyGrid()
    expect(cellErrors(p, grid).every(row => row.every(v => !v))).toBe(true)
    // 同行重复：0,0 与 0,1 同值。
    const dup = emptyGrid()
    dup[0]![0] = 5
    dup[0]![1] = 5
    const bad = cellErrors(p, dup)
    expect(bad[0]![0]!).toBe(true)
    expect(bad[0]![1]!).toBe(true)
    // 未填满的笼不参与红显：解填一半应无错误。
    const half = p.solution.map(row => [...row])
    half[5] = new Array<number>(KENKEN_SIZE).fill(0)
    expect(cellErrors(p, half).every(row => row.every(v => !v))).toBe(true)
    // 填满但某笼结果错误：该笼全部格子标红。
    const broken = p.solution.map(row => [...row])
    const cage = p.cages[0]!
    broken[cage.cells[0]!.r]![cage.cells[0]!.c] =
      broken[cage.cells[0]!.r]![cage.cells[0]!.c]! === 6 ? 5 : 6
    const cageBad = cellErrors(p, broken)
    expect(cageBad[cage.cells[0]!.r]![cage.cells[0]!.c]!).toBe(true)
    expect(isWon(p, broken)).toBe(false)
  })

  it('isWon is false for empty and partial grids', () => {
    const p = generateKenken(3, 1)
    expect(isWon(p, emptyGrid())).toBe(false)
    const one = emptyGrid()
    one[0]![0] = p.solution[0]![0]!
    expect(isWon(p, one)).toBe(false)
  })

  it('computeScore and cageLabel basics', () => {
    expect(computeScore(1, 0)).toBe(3100)
    expect(computeScore(2, 10_000)).toBe(200)
    expect(cageLabel({ op: '×', target: 12, cells: [] })).toBe('12×')
    expect(cageLabel({ op: '+', target: 7, cells: [] })).toBe('7+')
  })
})
