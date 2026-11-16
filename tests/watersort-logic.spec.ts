import { describe, expect, it } from 'vitest'
import {
  LEVELS, TUBE_CAPACITY, WaterSortGame, addTubes, canPour, clampLevel, createWaterSortState,
  generateLevel, hasAnyMove, isDeadlocked, isTubeComplete, isWon, mulberry32, pourAmount,
  pourTubes, solveTubes, topRun,
} from '../src/client/games/watersort/logic.ts'

/** 依次执行倾倒序列，断言每步合法，返回终盘。 */
function replay(tubes: number[][], moves: Array<[number, number]>): number[][] {
  let cur = tubes
  for (const [f, t] of moves) {
    const next = pourTubes(cur, f, t)
    expect(next).not.toBeNull()
    cur = next!
  }
  return cur
}

describe('watersort logic', () => {
  it('关卡表递进：5 关、色数 3→8 递增、空管 1→2、关卡号钳制', () => {
    expect(LEVELS).toHaveLength(5)
    const colors = LEVELS.map(l => l.colors)
    expect(colors).toEqual([3, 4, 5, 6, 8])
    for (let i = 1; i < colors.length; i += 1) expect(colors[i]!).toBeGreaterThan(colors[i - 1]!)
    expect(LEVELS.map(l => l.empties)).toEqual([1, 1, 2, 2, 2])
    expect(clampLevel(0)).toBe(1)
    expect(clampLevel(-3)).toBe(1)
    expect(clampLevel(99)).toBe(5)
    expect(clampLevel(3)).toBe(3)
  })

  it('倾倒合法性：顶色须相同或目标为空、目标容量、空源、自倒与越界', () => {
    const tubes = [[0, 1], [1, 1], []]
    expect(canPour(tubes, 0, 1)).toBe(true) // 顶色 1 == 1
    expect(canPour(tubes, 1, 0)).toBe(true) // 顶色 1 == 1
    expect(canPour(tubes, 0, 2)).toBe(true) // 目标为空管
    expect(canPour(tubes, 0, 0)).toBe(false) // 自倒
    expect(canPour(tubes, 2, 0)).toBe(false) // 空源
    expect(canPour(tubes, 0, 9)).toBe(false) // 目标越界
    expect(canPour(tubes, -1, 0)).toBe(false) // 源越界
    const full = [[1, 1, 1, 1], [2, 1]]
    expect(canPour(full, 1, 0)).toBe(false) // 目标已满
    expect(canPour(full, 0, 1)).toBe(true) // 纯管倒出规则上合法（仅是无意义倒法）
    expect(canPour([[2, 2], [1, 1]], 0, 1)).toBe(false) // 顶色 2 vs 1 不同
  })

  it('pourTubes 纯转移：顶段整体迁移、空间不足部分倾倒、输入不被修改、非法返回 null', () => {
    const before = [[1, 2, 2], [1, 2], []]
    const snapshot = JSON.parse(JSON.stringify(before)) as number[][]
    // 管 0 顶段 [2,2] 倒入管 1（2 空位）：整段迁入。
    const a = pourTubes(before, 0, 1)!
    expect(a[0]).toEqual([1])
    expect(a[1]).toEqual([1, 2, 2, 2])
    // 目标只剩 1 空位：min(顶段 2, 空位 1) = 1，部分倾倒。
    expect(pourAmount([[1, 2, 7], [7, 7]], 1, 0)).toBe(1)
    const partial = pourTubes([[1, 2, 7], [7, 7]], 1, 0)!
    expect(partial[0]).toEqual([1, 2, 7, 7])
    expect(partial[1]).toEqual([7]) // 顶段 2 层只倒出 1 层
    expect(before).toEqual(snapshot) // 输入未被修改
    expect(pourTubes(before, 2, 0)).toBeNull() // 空源
    expect(pourTubes(before, 0, 0)).toBeNull() // 自倒
  })

  it('topRun / isTubeComplete / isWon：连续段、纯色满管、空管不算完成但胜利允许空管', () => {
    expect(topRun([])).toBe(0)
    expect(topRun([1, 2, 2])).toBe(2)
    expect(topRun([3, 3, 3, 3])).toBe(4)
    expect(isTubeComplete([1, 1, 1, 1])).toBe(true)
    expect(isTubeComplete([1, 1, 1])).toBe(false)
    expect(isTubeComplete([1, 1, 2, 1])).toBe(false)
    expect(isWon([[1, 1, 1, 1], [], [2, 2, 2, 2]])).toBe(true)
    expect(isWon([[1, 1, 1, 1], [2, 2]])).toBe(false)
  })

  it('生成器可解：多种子盘面由求解器给出可行解，回放解到达全部纯色，每色恰 4 层', () => {
    for (const level of [1, 2, 3, 4]) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const def = LEVELS[level - 1]!
        const gen = generateLevel(level, mulberry32(seed * 131 + level))
        expect(gen.tubes).toHaveLength(def.colors + def.empties)
        const counts = new Map<number, number>()
        for (const t of gen.tubes) {
          expect(t.length).toBeLessThanOrEqual(TUBE_CAPACITY)
          for (const c of t) counts.set(c, (counts.get(c) ?? 0) + 1)
        }
        expect(counts.size).toBe(def.colors)
        for (const n of counts.values()) expect(n).toBe(TUBE_CAPACITY)
        expect(isWon(gen.tubes)).toBe(false)
        expect(gen.solution.length).toBeGreaterThanOrEqual(def.colors + 1)
        expect(gen.par).toBe(gen.solution.length)
        expect(isWon(replay(gen.tubes, gen.solution))).toBe(true)
      }
    }
  })

  it('求解器：独立求解生成盘面成功；死局小盘穷尽返回 null；交叉构造给出 3 步短解', () => {
    const gen = generateLevel(1, mulberry32(7))
    const solved = solveTubes(gen.tubes)
    expect(solved).not.toBeNull()
    expect(isWon(replay(gen.tubes, solved!.moves))).toBe(true)
    // 两色互相压顶且无空管：任何倾倒都不合法 → 不可解（穷尽极快）。
    expect(solveTubes([[0, 1, 0, 0], [1, 0, 1, 1]])).toBeNull()
    // 交叉构造 [a,a,b,b] / [b,b,a,a] / 空：3 步解。
    const r = solveTubes([[0, 0, 1, 1], [1, 1, 0, 0], []])
    expect(r).not.toBeNull()
    expect(r!.moves).toHaveLength(3)
  })

  it('死局检测：无空管且顶色互异 = 死局；有空管或同色顶 = 有可行倒法', () => {
    expect(isDeadlocked([[0, 1, 0, 0], [1, 0, 1, 1]])).toBe(true)
    expect(hasAnyMove([[0, 1, 0, 0], [1, 0, 1, 1]])).toBe(false)
    expect(isDeadlocked([[0, 1], [1, 0]])).toBe(true)
    expect(hasAnyMove([[0, 1], [1, 0], []])).toBe(true) // 空管可接收顶段
    expect(hasAnyMove([[0, 0, 0, 0], [1, 1, 1, 1]])).toBe(false) // 完成后无有意义倒法
    expect(isDeadlocked([[0, 0, 0, 0], [1, 1, 1, 1]])).toBe(false) // 但不算死局
  })

  it('生成器确定性：同种子严格同盘面同参考步数；不同种子至少一关换盘', () => {
    const a = createWaterSortState(2, 42)
    const b = createWaterSortState(2, 42)
    expect(a.tubes).toEqual(b.tubes)
    expect(a.par).toBe(b.par)
    const boards = new Set<string>()
    for (let seed = 1; seed <= 8; seed += 1) {
      boards.add(createWaterSortState(2, seed).tubes.map(t => t.join('.')).join('|'))
    }
    expect(boards.size).toBeGreaterThan(1)
    // 第 5 关（8 色）同样确定性重放且可解。
    const l5 = createWaterSortState(5, 99)
    expect(createWaterSortState(5, 99).tubes).toEqual(l5.tubes)
    expect(isWon(replay(l5.tubes, generateLevel(5, mulberry32((99 + 5 * 1013) >>> 0)).solution))).toBe(true)
  })

  it('撤回栈：倾倒压栈、undo 恢复上一局面与步数、空栈返回 false', () => {
    const g = new WaterSortGame(1, 5)
    const s0 = g.state
    let done = false
    for (let f = 0; f < s0.tubes.length && !done; f += 1) {
      for (let t = 0; t < s0.tubes.length && !done; t += 1) {
        if (pourAmount(s0.tubes, f, t) === 0) continue
        expect(g.pour(f, t)).toBe(true)
        done = true
      }
    }
    expect(done).toBe(true)
    expect(g.state.moves).toBe(1)
    expect(g.state.tubes).not.toEqual(s0.tubes)
    expect(g.canUndo()).toBe(true)
    expect(g.undo()).toBe(true)
    expect(g.state.tubes).toEqual(s0.tubes)
    expect(g.state.moves).toBe(0)
    expect(g.canUndo()).toBe(false)
    expect(g.undo()).toBe(false)
  })

  it('加管效果：+1 空管、每关一次、undo 移除新管但道具标记不退', () => {
    const g = new WaterSortGame(1, 9)
    const n = g.state.tubes.length
    expect(g.state.extraUsed).toBe(false)
    expect(g.addTube()).toBe(true)
    expect(g.state.tubes).toHaveLength(n + 1)
    expect(g.state.tubes[n]).toEqual([])
    expect(g.state.extraUsed).toBe(true)
    expect(g.addTube()).toBe(false) // 每关一次
    expect(g.undo()).toBe(true) // 撤回移除新管
    expect(g.state.tubes).toHaveLength(n)
    expect(g.state.extraUsed).toBe(true) // 道具标记不随撤回回退
    expect(g.addTube()).toBe(false)
  })

  it('控制器整局：按求解器解走到全部纯色，胜利后冻结输入；reset 同种子重现', () => {
    const g = new WaterSortGame(1, 3)
    const initial = g.state.tubes.map(t => t.join('.')).join('|')
    const solved = solveTubes(g.state.tubes)
    expect(solved).not.toBeNull()
    for (const [f, t] of solved!.moves) expect(g.pour(f, t)).toBe(true)
    expect(g.state.status).toBe('won')
    expect(g.state.moves).toBe(solved!.moves.length)
    expect(g.pour(0, 1)).toBe(false) // 胜利后冻结
    expect(g.addTube()).toBe(false)
    expect(g.undo()).toBe(false)
    g.reset()
    expect(g.state.status).toBe('playing')
    expect(g.state.tubes.map(t => t.join('.')).join('|')).toBe(initial)
    expect(g.canUndo()).toBe(false)
  })

  it('加管可解性增益：死局盘面加一根空管后由求解器验证重新可解', () => {
    const dead = [[0, 1, 0, 0], [1, 0, 1, 1]]
    expect(solveTubes(dead)).toBeNull()
    const revived = addTubes(dead, 1)
    expect(revived).toHaveLength(3)
    expect(revived[2]).toEqual([])
    const r = solveTubes(revived)
    expect(r).not.toBeNull()
    expect(isWon(replay(revived, r!.moves))).toBe(true)
  })
})
