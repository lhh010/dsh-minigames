/**
 * 数块分帧求解器（演示 AI）：与 logic.ts 同一受限回溯（候选 = 区域内
 * 未用 & 王邻域未用），但做成可恢复的迭代栈 —— 每次 step(maxNodes) 只
 * 消耗有限节点即返回，调用方每帧喂一点预算，绝不在一帧内算完整个
 * 搜索。搜索从当前盘面（含玩家已填格）出发，找任意规则成立的完整填
 * 法，因此也能当「从残局提示到底」的演示引擎。
 */
import {
  kingNeighbors,
  type SuguruPuzzle,
} from './logic.ts'

/** 单步求解状态。 */
export type StepStatus = 'solving' | 'done' | 'stuck'

/** 可恢复的受限回溯求解器。 */
export interface StepSolver {
  /** 消耗至多 maxNodes 个节点后返回当前状态。 */
  step(maxNodes: number): StepStatus
  /** 求解工作盘（含给定格与已试填的值；done 时即完整解）。 */
  readonly grid: readonly number[]
  /** 累计消耗的节点数（诊断/测试）。 */
  readonly nodes: number
}

/**
 * 建一个从 `start` 盘面出发的分帧求解器。
 * @param puzzle - 当前关卡。
 * @param start - 起始盘面（玩家当前填数，给定格为锁定值）。非规则值
 *   （区域重复 / 邻域同数 / 越界）的格子会被清空后参与搜索。
 */
export function createStepSolver(puzzle: SuguruPuzzle, start: readonly number[]): StepSolver {
  const size = puzzle.size
  const total = size * size
  const regionOf = new Array<number>(total).fill(-1)
  puzzle.regionCells.forEach((members, id) => members.forEach(cell => { regionOf[cell] = id }))
  const grid = new Array<number>(total).fill(0)
  // 保留相容的玩家填数：给定格恒保留；玩家格只要不与既有盘面冲突就保留。
  for (let cell = 0; cell < total; cell += 1) {
    const v = start[cell] ?? 0
    if (v === 0) continue
    if (v < 1 || v > puzzle.regionCells[regionOf[cell]!]!.length) continue
    let clash = false
    for (const member of puzzle.regionCells[regionOf[cell]!]!) {
      if (member !== cell && grid[member] === v) clash = true
    }
    for (const n of kingNeighbors(size, cell)) {
      if (grid[n] === v) clash = true
    }
    if (!clash) grid[cell] = v
  }
  // 空格固定顺序：行优先（与 logic.ts 的求解器一致）。
  const empties: number[] = []
  for (let cell = 0; cell < total; cell += 1) if (grid[cell] === 0) empties.push(cell)
  // 每层的下一个候选值游标（回溯恢复用）。
  const cursor = new Array<number>(empties.length).fill(1)
  let pos = 0
  let nodes = 0

  /** 值 v 放入 cell 是否相容（只看已放置的格子）。 */
  const fits = (cell: number, v: number): boolean => {
    for (const member of puzzle.regionCells[regionOf[cell]!]!) {
      if (grid[member] === v) return false
    }
    for (const n of kingNeighbors(size, cell)) {
      if (grid[n] === v) return false
    }
    return true
  }

  const solver: StepSolver = {
    get grid(): readonly number[] { return grid },
    get nodes(): number { return nodes },
    step(maxNodes: number): StepStatus {
      let used = 0
      for (;;) {
        if (pos === empties.length) return 'done'
        if (used >= maxNodes) return 'solving'
        used += 1
        nodes += 1
        const cell = empties[pos]!
        const span = puzzle.regionCells[regionOf[cell]!]!.length
        let advanced = false
        for (let v = cursor[pos]!; v <= span; v += 1) {
          if (fits(cell, v)) {
            grid[cell] = v
            cursor[pos] = v + 1
            pos += 1
            advanced = true
            break
          }
        }
        if (advanced) continue
        // 本层候选耗尽：回退一层并撤销父层已放的值。
        cursor[pos] = 1
        pos -= 1
        if (pos < 0) return 'stuck'
        grid[empties[pos]!] = 0
      }
    },
  }
  return solver
}
