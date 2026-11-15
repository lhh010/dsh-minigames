import { describe, expect, it } from 'vitest'
import {
  KIND_DOOR,
  KIND_WALL,
  START_ORIENTATION,
  createState,
  generateLevel,
  levelSize,
  roll,
  tryMove,
  undo,
  type Board,
  type Dir,
  type Orientation,
} from '../src/client/games/dicemaze/logic.ts'

const SEEDS = [1, 7, 42, 2026, 123456789]

/** 从初始朝向出发的全部可达朝向（翻滚图闭包）。 */
function reachableOrientations(): Orientation[] {
  const key = (o: Orientation): string => o.top + ',' + o.north + ',' + o.east
  const seen = new Map<string, Orientation>([[key(START_ORIENTATION), START_ORIENTATION]])
  const queue: Orientation[] = [START_ORIENTATION]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const dir of ['up', 'right', 'down', 'left'] as Dir[]) {
      const next = roll(cur, dir)
      const k = key(next)
      if (!seen.has(k)) {
        seen.set(k, next)
        queue.push(next)
      }
    }
  }
  return [...seen.values()]
}

/** 在棋盘上找第一个指定类型的格子。 */
function findCell(board: Board, kind: number): { x: number; y: number; idx: number } {
  for (let y = 0; y < board.h; y += 1) {
    for (let x = 0; x < board.w; x += 1) {
      const idx = y * board.w + x
      if (board.kind[idx] === kind) return { x, y, idx }
    }
  }
  throw new Error('cell kind not found: ' + String(kind))
}

/** 手工构造一张小棋盘（测试门 / 碎地板 / 终点判定）。 */
function makeBoard(opts: {
  kind: number[]
  num?: number[]
  goal: { x: number; y: number }
  goalNum: number
  w: number
  h: number
}): Board {
  return {
    w: opts.w,
    h: opts.h,
    kind: new Uint8Array(opts.kind),
    num: new Uint8Array(opts.num ?? opts.kind.map(() => 0)),
    start: { x: 0, y: 0 },
    goal: opts.goal,
    goalNum: opts.goalNum,
    solution: [],
  }
}

describe('dicemaze logic', () => {
  it('翻滚朝向按标准骰规则转移（显式转移表）', () => {
    // 初始 1/2/3：向北翻 → 南面(5)朝上、原顶面(1)朝北。
    expect(roll(START_ORIENTATION, 'up')).toEqual({ top: 5, north: 1, east: 3 })
    // 向南翻 → 原北面(2)朝上。
    expect(roll(START_ORIENTATION, 'down')).toEqual({ top: 2, north: 6, east: 3 })
    // 向东翻 → 西面(4)朝上、原顶面(1)朝东。
    expect(roll(START_ORIENTATION, 'right')).toEqual({ top: 4, north: 2, east: 1 })
    // 向西翻 → 原东面(3)朝上。
    expect(roll(START_ORIENTATION, 'left')).toEqual({ top: 3, north: 2, east: 6 })
    // 中间态再验证一组：1,2,3 连翻两次北。
    const once = roll(START_ORIENTATION, 'up')
    expect(roll(once, 'up')).toEqual({ top: 6, north: 5, east: 3 })
  })

  it('翻滚封闭性：可达朝向共 24 种（立方体全部旋转），每个三元组自洽', () => {
    const states = reachableOrientations()
    expect(states).toHaveLength(24)
    for (const o of states) {
      const nums = [o.top, o.north, o.east]
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(6)
      }
      expect(new Set(nums).size).toBe(3)
      // 顶/北/东互不为对面：任意两面的和不得为 7。
      const pairs = [nums[0]! + nums[1]!, nums[0]! + nums[2]!, nums[1]! + nums[2]!]
      for (const sum of pairs) expect(sum).not.toBe(7)
    }
    // 同向四连翻回到原朝向；往返（右→左）恢复原状。
    let o = START_ORIENTATION
    for (let i = 0; i < 4; i += 1) o = roll(o, 'right')
    expect(o).toEqual(START_ORIENTATION)
    expect(roll(roll(START_ORIENTATION, 'right'), 'left')).toEqual(START_ORIENTATION)
  })

  it('数字门：顶面匹配才能通过，不匹配或墙不可通过', () => {
    // 3 列单行：起点 | 门5 | 地板。初始顶面 1，向东翻后顶面 4。
    // 东侧再放一扇门 4（匹配）与门 5（不匹配）分两次验证。
    const board = makeBoard({
      w: 3,
      h: 1,
      kind: [4, KIND_DOOR, 1],
      num: [0, 4, 0],
      goal: { x: 2, y: 0 },
      goalNum: 9, // 顶面 4 ≠ 9，进入终点也不算赢
    })
    const state = createState(board)
    expect(tryMove(state, 'right')).toBe('moved') // 翻滚后顶面 4 = 门数字
    expect(state.x).toBe(1)
    // 换一门数字 5：翻上来的顶面是 4，被挡。
    const blocked = makeBoard({
      w: 3,
      h: 1,
      kind: [4, KIND_DOOR, 1],
      num: [0, 5, 0],
      goal: { x: 2, y: 0 },
      goalNum: 9,
    })
    const s2 = createState(blocked)
    expect(tryMove(s2, 'right')).toBe('blocked')
    expect(s2.x).toBe(0)
    // 墙与越界恒不可通过。
    const walled = makeBoard({
      w: 2,
      h: 1,
      kind: [4, KIND_WALL],
      goal: { x: 1, y: 0 },
      goalNum: 1,
    })
    const s3 = createState(walled)
    expect(tryMove(s3, 'right')).toBe('blocked')
    expect(tryMove(s3, 'left')).toBe('blocked')
    expect(tryMove(s3, 'up')).toBe('blocked')
  })

  it('碎地板：首次进入即碎、不可再次进入，离开不受影响', () => {
    const board = makeBoard({
      w: 4,
      h: 1,
      kind: [4, 3, 1, 4], // 起点 | 碎地板 | 地板 | （备用）
      goal: { x: 2, y: 0 },
      goalNum: 9,
    })
    const state = createState(board)
    expect(tryMove(state, 'right')).toBe('moved') // 踏上碎地板
    expect(state.broken[1]!).toBe(1)
    expect(tryMove(state, 'right')).toBe('moved') // 离开（去往地板）
    expect(tryMove(state, 'left')).toBe('blocked') // 碎了，回不去
    expect(state.x).toBe(2)
  })

  it('过关判定：终点格 + 顶面恰好等于终点数字', () => {
    // 初始顶面 1，向东一翻顶面 4：终点数字 4 → won；5 → 仅进入。
    const win = makeBoard({ w: 2, h: 1, kind: [4, 5], num: [0, 0], goal: { x: 1, y: 0 }, goalNum: 4 })
    const s1 = createState(win)
    expect(tryMove(s1, 'right')).toBe('won')
    expect(s1.won).toBe(true)
    expect(tryMove(s1, 'right')).toBe('blocked') // 通关后输入失效
    const miss = makeBoard({ w: 2, h: 1, kind: [4, 5], num: [0, 0], goal: { x: 1, y: 0 }, goalNum: 5 })
    const s2 = createState(miss)
    expect(tryMove(s2, 'right')).toBe('moved') // 站上终点但顶面不符
    expect(s2.won).toBe(false)
  })

  it('种子确定性：同 seed 两次生成逐位一致，关卡尺寸正确', () => {
    for (const seed of SEEDS) {
      const a = generateLevel(seed, 3)
      const b = generateLevel(seed, 3)
      expect([...b.kind]).toEqual([...a.kind])
      expect([...b.num]).toEqual([...a.num])
      expect(b.goalNum).toBe(a.goalNum)
      expect(b.solution).toEqual(a.solution)
      expect(b.goal).toEqual(a.goal)
      expect(b.start).toEqual(a.start)
    }
    expect(levelSize(1)).toEqual({ w: 9, h: 7 })
    expect(levelSize(5)).toEqual({ w: 17, h: 15 })
  })

  it('生成的关卡保证可解：重放解路径全部通关（5 关 × 多种子）', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      for (let level = 1; level <= 5; level += 1) {
        const board = generateLevel(seed, level)
        const state = createState(board)
        for (let i = 0; i < board.solution.length; i += 1) {
          const dir = board.solution[i]!
          const result = tryMove(state, dir)
          if (i === board.solution.length - 1) expect(result).toBe('won')
          else expect(result).toBe('moved')
        }
        expect(state.won).toBe(true)
        expect(state.steps).toBe(board.solution.length)
        expect(state.x).toBe(board.goal.x)
        expect(state.y).toBe(board.goal.y)
      }
    }
  })

  it('关卡递进：门数与棋盘随关卡增大', () => {
    const countKind = (board: Board, kind: number): number => {
      let n = 0
      for (let i = 0; i < board.kind.length; i += 1) if (board.kind[i] === kind) n += 1
      return n
    }
    const l1 = generateLevel(42, 1)
    const l5 = generateLevel(42, 5)
    expect(l5.w).toBeGreaterThan(l1.w)
    expect(l5.h).toBeGreaterThan(l1.h)
    expect(countKind(l5, KIND_DOOR)).toBeGreaterThan(countKind(l1, KIND_DOOR))
    expect(countKind(l5, 3)).toBeGreaterThanOrEqual(countKind(l1, 3)) // 碎地板
    // 每关都有起点与终点，且门数字均为 1-6。
    for (let level = 1; level <= 5; level += 1) {
      const b = generateLevel(7, level)
      findCell(b, 4)
      const goal = findCell(b, 5)
      expect(b.goalNum).toBeGreaterThanOrEqual(1)
      expect(b.goalNum).toBeLessThanOrEqual(6)
      expect(b.kind[goal.idx]!).toBe(5)
    }
  })

  it('撤回：恢复位置/朝向/步数/碎地板，阻挡步不入历史', () => {
    const board = generateLevel(42, 3)
    const state = createState(board)
    expect(undo(state)).toBe(false) // 无步可撤
    const before = { x: state.x, y: state.y, orient: { ...state.orient }, steps: state.steps }
    // 找一个能走的方向走一步，再撤回。
    const dirs: Dir[] = ['up', 'right', 'down', 'left']
    let moved = false
    for (const dir of dirs) {
      if (tryMove(state, dir) !== 'blocked') { moved = true; break }
    }
    expect(moved).toBe(true)
    expect(state.steps).toBe(before.steps + 1)
    expect(undo(state)).toBe(true)
    expect(state.x).toBe(before.x)
    expect(state.y).toBe(before.y)
    expect(state.orient).toEqual(before.orient)
    expect(state.steps).toBe(before.steps)
    // 阻挡的尝试不污染历史。
    for (const dir of dirs) if (tryMove(state, dir) === 'blocked') break
    expect(undo(state)).toBe(false)
  })
})

