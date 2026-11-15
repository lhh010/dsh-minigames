/**
 * 逻辑网格（Einstein 谜题）纯逻辑层测试：8 线索模板语义、求解器与真解
 * 一致性（含暴力枚举交叉验证）、冗余线索过滤、生成器多关卡多种子唯一解、
 * 自动补 ✗ 级联、过关判定、提示额度、seed 确定性与计分。
 */
import { describe, expect, it } from 'vitest'
import {
  CAT_COUNT, MARK_NO, MARK_YES, MAX_HINTS, checkWon, clueHolds, computeScore, countSolutions,
  createPlayerState, cycleCell, generateLevel, getMark, isRedundant, levelSpec,
  mulberry32, renderClue, requestHint, solutionPositions,
  type Clue, type PlayerState, type Thing,
} from '../src/client/games/logigrid/logic.ts'

/** 测试本地的 Fisher-Yates 洗牌（与生成器同算法，注入 rng）。 */
function shuffle(n: number, rng: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const t = arr[i]!
    arr[i] = arr[j]!
    arr[j] = t
  }
  return arr
}

/** 随机抽一个解：solution[cat] 是 0..n-1 的排列。 */
function randomSolution(n: number, rng: () => number): number[][] {
  const sol: number[][] = []
  for (let cat = 0; cat < CAT_COUNT; cat += 1) sol.push(shuffle(n, rng))
  return sol
}

/** 把解包成 Puzzle 形状（solutionPositions 只要 n 与 solution）。 */
function positionsOf(n: number, solution: number[][]): number[][] {
  return solutionPositions({ level: 1, n, clues: [], solution, seed: 0 })
}

/** 构造一个事物。 */
function thing(cat: number, val: number): Thing {
  return { cat, val }
}

/** 验证一条线索在给定位置表下为真。 */
function clueTrue(clue: Clue, pos: number[][]): boolean {
  const pa = pos[clue.a.cat]![clue.a.val]!
  const pb = clue.b === null ? -1 : pos[clue.b.cat]![clue.b.val]!
  return clueHolds(clue, pa, pb)
}

/**
 * 暴力枚举：穷举每类一个排列（(n!)^CAT_COUNT 个指派），数满足全部线索的个数。
 * 用作回溯求解器的独立交叉验证（仅 n=4 可承受）。
 */
function bruteCount(clues: readonly Clue[], n: number, cap: number): number {
  let total = 0
  const perms: number[][] = []
  const stack: number[][] = []
  const buildPerm = (used: number[], cur: number[]): void => {
    if (cur.length === n) {
      perms.push(cur.slice())
      return
    }
    for (let v = 0; v < n; v += 1) {
      if (used[v] !== 0) continue
      used[v] = 1
      cur.push(v)
      buildPerm(used, cur)
      cur.pop()
      used[v] = 0
    }
  }
  buildPerm(new Array<number>(n).fill(0), [])
  const rec = (cat: number, assign: number[][]): void => {
    if (total >= cap) return
    if (cat === CAT_COUNT) {
      const pos: number[][] = assign.map((row) => {
        const r = new Array<number>(n).fill(0)
        row.forEach((v, p) => { r[v] = p })
        return r
      })
      for (const clue of clues) {
        if (!clueTrue(clue, pos)) return
      }
      total += 1
      return
    }
    for (const perm of perms) {
      assign.push(perm)
      rec(cat + 1, assign)
      assign.pop()
    }
  }
  rec(0, [])
  return Math.min(total, cap)
}

describe('logigrid logic', () => {
  it('mulberry32 同种子同序列、值域 [0,1)', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    const seq = [a(), a(), a(), a(), a()]
    expect(seq).toEqual([b(), b(), b(), b(), b()])
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('8 种线索模板的方向与同一性语义（clueHolds）', () => {
    // at / notAt：房号 k 从 1 起，posA 从 0 起。
    expect(clueHolds({ kind: 'at', a: thing(0, 0), b: null, k: 3 }, 2, -1)).toBe(true)
    expect(clueHolds({ kind: 'at', a: thing(0, 0), b: null, k: 3 }, 1, -1)).toBe(false)
    expect(clueHolds({ kind: 'notAt', a: thing(0, 0), b: null, k: 3 }, 2, -1)).toBe(false)
    expect(clueHolds({ kind: 'notAt', a: thing(0, 0), b: null, k: 3 }, 0, -1)).toBe(true)
    // pet / drink / same：同一人（房位相等）。
    for (const kind of ['pet', 'drink', 'same'] as const) {
      expect(clueHolds({ kind, a: thing(1, 0), b: thing(2, 1), k: -1 }, 2, 2)).toBe(true)
      expect(clueHolds({ kind, a: thing(1, 0), b: thing(2, 1), k: -1 }, 2, 3)).toBe(false)
    }
    // adjacent：绝对差恰为 1（左右皆可）。
    expect(clueHolds({ kind: 'adjacent', a: thing(0, 0), b: thing(1, 0), k: -1 }, 1, 2)).toBe(true)
    expect(clueHolds({ kind: 'adjacent', a: thing(0, 0), b: thing(1, 0), k: -1 }, 2, 1)).toBe(true)
    expect(clueHolds({ kind: 'adjacent', a: thing(0, 0), b: thing(1, 0), k: -1 }, 0, 2)).toBe(false)
    // leftOf：a 在 b 的正左边（房号小 1），方向不可交换。
    expect(clueHolds({ kind: 'leftOf', a: thing(0, 0), b: thing(1, 0), k: -1 }, 1, 2)).toBe(true)
    expect(clueHolds({ kind: 'leftOf', a: thing(0, 0), b: thing(1, 0), k: -1 }, 2, 1)).toBe(false)
    expect(clueHolds({ kind: 'leftOf', a: thing(0, 0), b: thing(1, 0), k: -1 }, 0, 2)).toBe(false)
    // apart：不同房（含相邻）。
    expect(clueHolds({ kind: 'apart', a: thing(0, 0), b: thing(1, 0), k: -1 }, 0, 1)).toBe(true)
    expect(clueHolds({ kind: 'apart', a: thing(0, 0), b: thing(1, 0), k: -1 }, 1, 1)).toBe(false)
  })

  it('renderClue 输出包含方向/房号的中文文本', () => {
    expect(renderClue({ kind: 'at', a: thing(0, 0), b: null, k: 2 })).toBe('红房子的人住在 2 号房')
    expect(renderClue({ kind: 'leftOf', a: thing(1, 0), b: thing(3, 1), k: -1 })).toBe('养猫的人住在爱好读书的人的正左边')
    expect(renderClue({ kind: 'same', a: thing(2, 0), b: thing(0, 1), k: -1 })).toBe('喝红茶的人和蓝房子的人是同一个人')
  })

  it('随机解 + 真线索集合：求解器从不把真盘数成 0（自检）', () => {
    for (const seed of [1, 7, 42, 99, 2024]) {
      const rng = mulberry32(seed)
      const n = seed % 2 === 0 ? 4 : 5
      const solution = randomSolution(n, rng)
      const pos = positionsOf(n, solution)
      const clues: Clue[] = []
      // 每种模板至少一条对真解成立的线索。
      for (let p = 0; p < n; p += 1) {
        clues.push({ kind: 'at', a: thing(0, solution[0]![p]!), b: null, k: p + 1 })
        clues.push({ kind: 'notAt', a: thing(1, solution[1]![p]!), b: null, k: ((p + 1) % n) + 1 })
      }
      for (let p = 0; p + 1 < n; p += 1) {
        clues.push({ kind: 'same', a: thing(2, solution[2]![p]!), b: thing(3, solution[3]![p]!), k: -1 })
        clues.push({ kind: 'pet', a: thing(0, solution[0]![p]!), b: thing(1, solution[1]![p]!), k: -1 })
        clues.push({ kind: 'drink', a: thing(3, solution[3]![p]!), b: thing(2, solution[2]![p]!), k: -1 })
        clues.push({ kind: 'adjacent', a: thing(0, solution[0]![p]!), b: thing(1, solution[1]![p + 1]!), k: -1 })
        clues.push({ kind: 'leftOf', a: thing(2, solution[2]![p]!), b: thing(3, solution[3]![p + 1]!), k: -1 })
      }
      clues.push({ kind: 'apart', a: thing(0, solution[0]![0]!), b: thing(1, solution[1]![n - 1]!), k: -1 })
      for (const clue of clues) expect(clueTrue(clue, pos)).toBe(true)
      expect(countSolutions(clues, n, 2)).toBeGreaterThanOrEqual(1)
    }
  })

  it('求解器与暴力枚举交叉验证（n=4，多组线索集）', () => {
    for (const seed of [3, 11, 77]) {
      const p = generateLevel(1, seed)
      expect(p.n).toBe(4)
      expect(countSolutions(p.clues, 4, 10)).toBe(bruteCount(p.clues, 4, 10))
    }
    // 无线索：全部指派都满足。
    expect(countSolutions([], 4, 100)).toBe(bruteCount([], 4, 100))
    // 矛盾线索：同一个人既在 1 号房又不在 1 号房。
    const bad: Clue[] = [
      { kind: 'at', a: thing(0, 0), b: null, k: 1 },
      { kind: 'notAt', a: thing(0, 0), b: null, k: 1 },
    ]
    expect(countSolutions(bad, 4, 10)).toBe(0)
  })

  it('生成器 5 关 × 多种子：解唯一、线索数在规格内、每条线索对真解成立', () => {
    for (let level = 1; level <= 5; level += 1) {
      const spec = levelSpec(level)
      for (const seed of [11, 22, 33]) {
        const p = generateLevel(level, seed)
        expect(p.n).toBe(spec.n)
        expect(p.clues.length).toBeGreaterThanOrEqual(spec.minClues)
        expect(p.clues.length).toBeLessThanOrEqual(spec.maxClues)
        expect(countSolutions(p.clues, p.n, 2)).toBe(1)
        const pos = positionsOf(p.n, p.solution)
        for (const clue of p.clues) expect(clueTrue(clue, pos)).toBe(true)
      }
    }
  }, 60000)

  it('isRedundant：重复/已含信息判冗余，新约束与矛盾线索判不冗余', () => {
    const p = generateLevel(2, 5)
    // 已唯一解：再加任何一条已满足的旧线索（复制）都不改变解集 → 冗余。
    const dup = p.clues[0]!
    expect(isRedundant(p.clues, { ...dup, a: { ...dup.a }, b: dup.b === null ? null : { ...dup.b } }, p.n)).toBe(true)
    // 空线索集上（解空间巨大）任何线索都收缩解集 → 不冗余。
    expect(isRedundant([], { kind: 'at', a: thing(0, 0), b: null, k: 1 }, p.n)).toBe(false)
    // 与已知真解矛盾（真实位置 1 号房却说不住在那）→ 解集归零，计数不等 → 不冗余。
    const pos = positionsOf(p.n, p.solution)
    const truth = p.solution[0]![0]!
    const falseClue: Clue = { kind: 'notAt', a: thing(0, truth), b: null, k: pos[0]![truth]! + 1 }
    expect(clueTrue(falseClue, pos)).toBe(false)
    expect(isRedundant(p.clues, falseClue, p.n)).toBe(false)
  })

  it('cycleCell：✓ 自动补同行/同列 ✗，行内只剩一格时级联强制 ✓', () => {
    const p = generateLevel(1, 8)
    const st = createPlayerState(p)
    const v0 = p.solution[0]![0]!
    const r1 = cycleCell(st, 0, 0, v0)
    expect(r1.mark).toBe(MARK_YES)
    // 同人同类其余值自动 ✗。
    for (let v = 0; v < p.n; v += 1) {
      if (v !== v0) expect(getMark(st, 0, 0, v)).toBe(MARK_NO)
    }
    // 同值其他人自动 ✗。
    for (let pr = 1; pr < p.n; pr += 1) expect(getMark(st, 0, pr, v0)).toBe(MARK_NO)
    // 手动铺满一行的 n-1 个 ✗ 后，点击别处触发推演：最后一格自动 ✓。
    const vLast = p.solution[1]![1]!
    for (let v = 0; v < p.n; v += 1) {
      if (v !== vLast) st.marks[(1 * p.n + 1) * p.n + v] = MARK_NO
    }
    const r2 = cycleCell(st, 3, 0, p.solution[3]![0]!)
    const forced = r2.deduced.find((d) => d.cat === 1 && d.p === 1 && d.v === vLast)
    expect(forced).toBeDefined()
    expect(forced!.mark).toBe(MARK_YES)
    expect(getMark(st, 1, 1, vLast)).toBe(MARK_YES)
  })

  it('checkWon：完整正确盘过关，任一错盘不过关', () => {
    const p = generateLevel(3, 13)
    const good = createPlayerState(p)
    for (let cat = 0; cat < CAT_COUNT; cat += 1) {
      for (let pr = 0; pr < p.n; pr += 1) {
        for (let v = 0; v < p.n; v += 1) {
          good.marks[(cat * p.n + pr) * p.n + v] = v === p.solution[cat]![pr]! ? MARK_YES : MARK_NO
        }
      }
    }
    expect(checkWon(good)).toBe(true)
    // 交换某一类的两个值：行内 ✓ 数仍对但列冲突且线索不再全真。
    const bad = createPlayerState(p)
    const t = bad.puzzle.solution[0]![0]!
    bad.puzzle.solution[0]![0] = bad.puzzle.solution[0]![1]!
    bad.puzzle.solution[0]![1] = t
    for (let cat = 0; cat < CAT_COUNT; cat += 1) {
      for (let pr = 0; pr < p.n; pr += 1) {
        for (let v = 0; v < p.n; v += 1) {
          bad.marks[(cat * p.n + pr) * p.n + v] = v === bad.puzzle.solution[cat]![pr]! ? MARK_YES : MARK_NO
        }
      }
    }
    expect(checkWon(bad)).toBe(false)
    // 空盘不过关。
    expect(checkWon(createPlayerState(p))).toBe(false)
  })

  it('requestHint：给出真解 ✓ 格、递减额度、耗尽返回 null', () => {
    const p = generateLevel(1, 21)
    const st: PlayerState = createPlayerState(p)
    expect(st.hintsLeft).toBe(MAX_HINTS)
    const h1 = requestHint(st)
    expect(h1).toEqual({ cat: 0, p: 0, v: p.solution[0]![0]! })
    expect(st.hintsLeft).toBe(MAX_HINTS - 1)
    cycleCell(st, h1!.cat, h1!.p, h1!.v)
    const h2 = requestHint(st)
    expect(h2).toEqual({ cat: 0, p: 1, v: p.solution[0]![1]! })
    // 额度耗尽。
    st.hintsLeft = 0
    expect(requestHint(st)).toBeNull()
  })

  it('generateLevel 同 seed 完全一致，异 seed 产出不同', () => {
    const a1 = generateLevel(4, 500)
    const a2 = generateLevel(4, 500)
    expect(a2).toEqual(a1)
    const b = generateLevel(4, 501)
    expect(JSON.stringify(b) === JSON.stringify(a1)).toBe(false)
    // 关卡超 5 循环回规格。
    expect(levelSpec(6).n).toBe(levelSpec(1).n)
  }, 60000)

  it('computeScore：关卡加成 + 时间/提示惩罚，下限 0', () => {
    const s = 1 * 1000 + 600 - 10 * 5 - 0 * 200
    expect(computeScore(1, 10, 0)).toBe(s)
    expect(computeScore(5, 10, 3)).toBe(5 * 1000 + 600 - 50 - 600)
    expect(computeScore(1, 99999, 3)).toBe(0)
  })
})
