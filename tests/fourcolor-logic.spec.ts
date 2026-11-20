import { describe, expect, it } from 'vitest'
import {
  GRID_COLS, GRID_ROWS, LEVEL_COUNT, MAX_HINTS, averageDegree, clearRegion, conflicts,
  createState, deriveAdjacency, generateMap, giveHint, isComplete, levelConfig,
  paintRegion, solveColors,
} from '../src/client/games/fourcolor/logic.ts'

/** 区域连通性检查：从区域内任一单元 BFS 只在区域内走能否覆盖全部单元。 */
function regionCellsConnected(cellRegion: number[], region: number): boolean {
  const cells: number[] = []
  for (let i = 0; i < cellRegion.length; i += 1) if (cellRegion[i] === region) cells.push(i)
  if (cells.length === 0) return false
  const seen = new Set<number>([cells[0]!])
  const queue = [cells[0]!]
  while (queue.length > 0) {
    const c = queue.pop()!
    const cx = c % GRID_COLS
    const cy = Math.floor(c / GRID_COLS)
    const probe = (nx: number, ny: number): void => {
      if (nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS) return
      const n = ny * GRID_COLS + nx
      if (cellRegion[n] === region && !seen.has(n)) { seen.add(n); queue.push(n) }
    }
    probe(cx + 1, cy); probe(cx - 1, cy); probe(cx, cy + 1); probe(cx, cy - 1)
  }
  return seen.size === cells.length
}

describe('fourcolor logic', () => {
  it('levelConfig：5 关区域数 20→40，前三关 4 色、后两关 3 色，越界收敛', () => {
    expect(levelConfig(1).regionCount).toBe(20)
    expect(levelConfig(2).regionCount).toBe(25)
    expect(levelConfig(3).regionCount).toBe(30)
    expect(levelConfig(4).regionCount).toBe(35)
    expect(levelConfig(5).regionCount).toBe(40)
    expect([1, 2, 3].map((lv) => levelConfig(lv).paletteSize)).toEqual([4, 4, 4])
    expect([4, 5].map((lv) => levelConfig(lv).paletteSize)).toEqual([3, 3])
    expect(levelConfig(0).level).toBe(1)
    expect(levelConfig(99).level).toBe(LEVEL_COUNT)
    expect(levelConfig(3).gridCols).toBe(GRID_COLS)
    expect(levelConfig(3).gridRows).toBe(GRID_ROWS)
  })

  it('地图生成确定：同 seed 同关完全一致，不同 seed 地图不同', () => {
    const a = generateMap(42, 2)
    const b = generateMap(42, 2)
    expect(a.cellRegion).toEqual(b.cellRegion)
    expect(a.adjacency).toEqual(b.adjacency)
    expect(a.solution).toEqual(b.solution)
    expect(generateMap(42, 2).cellRegion).not.toEqual(generateMap(43, 2).cellRegion)
  })

  it('每个区域连通且网格全覆盖（一关与五关各验多个 seed）', () => {
    for (const level of [1, 5]) {
      for (let seed = 1; seed <= 5; seed += 1) {
        const map = generateMap(seed, level)
        const counts = new Array<number>(map.regionCount).fill(0)
        for (const r of map.cellRegion) {
          expect(r).toBeGreaterThanOrEqual(0)
          expect(r).toBeLessThan(map.regionCount)
          counts[r]! += 1
        }
        expect(counts.every((c) => c > 0)).toBe(true)
        for (let r = 0; r < map.regionCount; r += 1) expect(regionCellsConnected(map.cellRegion, r)).toBe(true)
      }
    }
  })

  it('邻接表对称、无自环、去重，且与网格归属重新推导一致', () => {
    for (const level of [1, 4]) {
      const map = generateMap(7, level)
      expect(map.adjacency).toEqual(deriveAdjacency(map.cellRegion, map.regionCount))
      for (let v = 0; v < map.regionCount; v += 1) {
        const list = map.adjacency[v]!
        expect(list).not.toContain(v)
        expect(new Set(list).size).toBe(list.length)
        expect([...list].sort((p, q) => p - q)).toEqual(list)
        for (const u of list) expect(map.adjacency[u]!).toContain(v)
      }
    }
  })

  it('附带解合法：四色关每个解都是相邻不同色的正常着色', () => {
    for (const level of [1, 2, 3]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const map = generateMap(seed, level)
        expect(map.solution.every((c) => c >= 0 && c < map.paletteSize)).toBe(true)
        for (let v = 0; v < map.regionCount; v += 1) {
          for (const u of map.adjacency[v]!) expect(map.solution[u]).not.toBe(map.solution[v])
        }
      }
    }
  })

  it('三色关（4、5 关）确实生成只用 3 色的可解地图', () => {
    for (const level of [4, 5]) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const map = generateMap(seed, level)
        expect(map.paletteSize).toBe(3)
        const used = new Set(map.solution)
        expect(used.size).toBeGreaterThan(1)
        expect([...used].every((c) => c >= 0 && c <= 2)).toBe(true)
        for (let v = 0; v < map.regionCount; v += 1) {
          for (const u of map.adjacency[v]!) expect(map.solution[u]).not.toBe(map.solution[v])
        }
      }
    }
  })

  it('涂色计步：首涂免费、改色 +1、同色 no-op、清除不计，且为纯函数', () => {
    let s = createState(11, 1)
    const before = { ...s }
    s = paintRegion(s, 0, 1)
    expect(s.repaints).toBe(0)
    s = paintRegion(s, 0, 2)
    expect(s.repaints).toBe(1)
    s = paintRegion(s, 0, 2)
    expect(s.repaints).toBe(1)
    s = clearRegion(s, 0)
    expect(s.repaints).toBe(1)
    s = paintRegion(s, 0, 3)
    expect(s.repaints).toBe(1)
    expect(paintRegion(s, -1, 1)).toBe(s)
    expect(paintRegion(s, 0, 9)).toBe(s)
    expect(clearRegion(s, 5)).toBe(s)
    expect(before.colors).toEqual(createState(11, 1).colors)
    expect(before.repaints).toBe(0)
  })

  it('冲突检测：相邻同色双向标红，改色 / 清除后消失', () => {
    let s = createState(3, 1)
    const v = 0
    const u = s.map.adjacency[v]![0]!
    s = paintRegion(s, v, 0)
    s = paintRegion(s, u, 0)
    const flags = conflicts(s)
    expect(flags[v]).toBe(true)
    expect(flags[u]).toBe(true)
    s = paintRegion(s, u, 1)
    expect(conflicts(s).some(Boolean)).toBe(false)
    s = paintRegion(s, u, 0)
    s = clearRegion(s, u)
    expect(conflicts(s)[u]).toBe(false)
  })

  it('过关判定：按附带解涂满即过关；缺一块或有冲突都不算', () => {
    let s = createState(5, 2)
    for (let r = 0; r < s.map.regionCount; r += 1) s = paintRegion(s, r, s.map.solution[r]!)
    expect(isComplete(s)).toBe(true)
    s = clearRegion(s, 3)
    expect(isComplete(s)).toBe(false)
    const v = 0
    s = paintRegion(s, 3, s.map.solution[3]!)
    s = paintRegion(s, v, s.map.solution[s.map.adjacency[v]![0]!]!) // 制造相邻同色
    expect(isComplete(s)).toBe(false)
  })

  it('提示限 2 次：颜色与已涂邻居兼容且直接上色、不计换色，第三次为 null', () => {
    let s = createState(9, 1)
    // 先涂几个相邻对，制造需要兼容的上下文。
    for (let r = 0; r < 6; r += 1) s = paintRegion(s, r, r % 2)
    const h1 = giveHint(s)
    expect(h1).not.toBeNull()
    expect(h1!.state.hintsUsed).toBe(1)
    expect(h1!.state.repaints).toBe(s.repaints) // 提示不产生换色
    expect(h1!.state.colors[h1!.region]).toBe(h1!.color)
    const flags0 = conflicts(s)
    for (const nb of s.map.adjacency[h1!.region]!) {
      // 无冲突的已涂邻居必须与提示色不同（提示与当前盘面兼容）。
      if (s.colors[nb]! >= 0 && !flags0[nb]!) expect(h1!.color).not.toBe(s.colors[nb])
    }
    const h2 = giveHint(h1!.state)
    expect(h2).not.toBeNull()
    expect(giveHint(h2!.state)).toBeNull()
    expect(MAX_HINTS).toBe(2)
    // 已过关时提示无效。
    let done = h2!.state
    for (let r = 0; r < done.map.regionCount; r += 1) done = paintRegion(done, r, done.map.solution[r]!)
    expect(giveHint(done)).toBeNull()
  })

  it('平均度数随关卡上升，且同 seed 重放（状态 + 操作序列）完全一致', () => {
    const avg = (level: number): number => {
      let sum = 0
      for (let seed = 1; seed <= 10; seed += 1) sum += averageDegree(generateMap(seed, level).adjacency)
      return sum / 10
    }
    // 四色关内平均度数随区域数上升；三色关是砖墙结构（度数 ~4），难度
    // 来自颜色稀缺，单独断言其下限。
    expect(avg(3)).toBeGreaterThan(avg(1))
    expect(avg(4)).toBeGreaterThan(3.5)
    expect(avg(5)).toBeGreaterThan(3.5)

    const run = (): { repaints: number; colors: number[] } => {
      let s = createState(77, 2)
      for (let r = 0; r < 8; r += 1) s = paintRegion(s, r, r % 4)
      s = paintRegion(s, 0, 3)
      s = clearRegion(s, 2)
      return { repaints: s.repaints, colors: s.colors }
    }
    expect(run()).toEqual(run())
    // solveColors 的预涂扩展与预算行为兜底：预涂冲突直接失败。
    const map = generateMap(1, 1)
    expect(solveColors(map.adjacency, 4, map.solution.map(() => 0))).toBeNull()
    expect(solveColors(map.adjacency, 4, map.solution)).toEqual(map.solution)
  })
})
