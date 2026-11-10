import { describe, expect, it } from 'vitest'
import {
  LEVELS, applyOp, createJugsState, isSolved, mulberry32, optimalMoves, type JugsState,
} from '../src/client/games/jugs/logic.ts'

/** 依次应用一组操作，忽略 null（测试里所有操作都应合法）。 */
function play(start: JugsState, ops: Array<{ kind: string; from?: number; to?: number; jug?: number }>): JugsState {
  let s = start
  for (const raw of ops) {
    const op = raw as Parameters<typeof applyOp>[1]
    const next = applyOp(s, op)
    expect(next).not.toBeNull()
    s = next!
  }
  return s
}

describe('jugs logic', () => {
  it('createJugsState：全空开局、钳制关卡号、par/maxMoves 来自 BFS', () => {
    const s = createJugsState(1)
    expect(s.capacities).toEqual([5, 3])
    expect(s.amounts).toEqual([0, 0])
    expect(s.target).toBe(4)
    expect(s.status).toBe('playing')
    expect(s.moves).toBe(0)
    expect(s.par).toBe(6)
    expect(s.maxMoves).toBe(12)
    // 越界关卡号钳制到末关。
    expect(createJugsState(99).level).toBe(LEVELS.length)
    expect(createJugsState(0).level).toBe(1)
  })

  it('六种操作纯转移：装满/倒空/壶间倾倒直到一方满或一方空，入参不被修改', () => {
    const s0 = createJugsState(1)
    const snapshot = JSON.parse(JSON.stringify(s0)) as JugsState
    const s1 = applyOp(s0, { kind: 'fill', jug: 0 })!
    expect(s1.amounts).toEqual([5, 0])
    // 倾倒：3L 壶只能接收 3 升，5L 壶剩 2。
    const s2 = applyOp(s1, { kind: 'pour', from: 0, to: 1 })!
    expect(s2.amounts).toEqual([2, 3])
    // 一方空即停。
    const s3 = applyOp(s2, { kind: 'empty', jug: 1 })!
    expect(s3.amounts).toEqual([2, 0])
    const s4 = applyOp(s3, { kind: 'pour', from: 0, to: 1 })!
    expect(s4.amounts).toEqual([0, 2])
    expect(s0).toEqual(snapshot)
    expect(s4).not.toBe(s0)
  })

  it('无效操作返回 null 且不计步：已满装/已空倒/空源/满目标/自倒/越界/已结束', () => {
    const s = createJugsState(1)
    expect(applyOp(s, { kind: 'empty', jug: 0 })).toBeNull() // 空壶倒不掉
    const full = applyOp(s, { kind: 'fill', jug: 0 })!
    expect(applyOp(full, { kind: 'fill', jug: 0 })).toBeNull() // 已满
    expect(applyOp(full, { kind: 'pour', from: 1, to: 0 })).toBeNull() // 源空
    expect(applyOp(full, { kind: 'pour', from: 0, to: 0 })).toBeNull() // 自倒
    expect(applyOp(full, { kind: 'fill', jug: 2 })).toBeNull() // 越界
    expect(applyOp(full, { kind: 'pour', from: 0, to: 9 })).toBeNull()
    expect(full.moves).toBe(1) // 上述 null 均未计步
    // 已结束的局面冻结输入。
    const won = play(s, [
      { kind: 'fill', jug: 0 }, { kind: 'pour', from: 0, to: 1 }, { kind: 'empty', jug: 1 },
      { kind: 'pour', from: 0, to: 1 }, { kind: 'fill', jug: 0 }, { kind: 'pour', from: 0, to: 1 },
    ])
    expect(won.status).toBe('won')
    expect(applyOp(won, { kind: 'empty', jug: 1 })).toBeNull()
  })

  it('经典解法：5L/3L 六步量出 4 升，任一壶=目标即过关', () => {
    const s = play(createJugsState(1), [
      { kind: 'fill', jug: 0 }, { kind: 'pour', from: 0, to: 1 }, { kind: 'empty', jug: 1 },
      { kind: 'pour', from: 0, to: 1 }, { kind: 'fill', jug: 0 }, { kind: 'pour', from: 0, to: 1 },
    ])
    expect(s.amounts).toEqual([4, 3])
    expect(s.moves).toBe(6)
    expect(s.status).toBe('won')
    expect(isSolved(s.amounts, 4)).toBe(true)
  })

  it('超 par×2 步判负：反复装满/倒空 12 步不达目标 → lost', () => {
    let s = createJugsState(1)
    for (let i = 0; i < 6; i += 1) {
      s = applyOp(s, { kind: 'fill', jug: 0 })!
      expect(s.status).toBe('playing') // 5 升与 0 升都不是目标 4
      s = applyOp(s, { kind: 'empty', jug: 0 })!
    }
    expect(s.moves).toBe(12)
    expect(s.maxMoves).toBe(12)
    expect(s.status).toBe('lost')
    // 判负后输入冻结。
    expect(applyOp(s, { kind: 'fill', jug: 0 })).toBeNull()
  })

  it('optimalMoves：BFS 最优步数与不可达判定', () => {
    expect(optimalMoves([5, 3], 4)).toBe(6)
    expect(optimalMoves([7, 4], 5)).toBe(8)
    expect(optimalMoves([13, 8, 5], 4)).toBe(10)
    expect(optimalMoves([15, 8, 7], 4)).toBe(12)
    expect(optimalMoves([17, 12, 5], 11)).toBe(14)
    expect(optimalMoves([8, 6], 5)).toBe(-1) // gcd=2 不整除 5
    expect(optimalMoves([5, 3], 0)).toBe(-1) // 非正目标
    expect(optimalMoves([5, 3], 5)).toBe(1) // 装满即达
  })

  it('关卡表：全部可解、par 严格递增、壶数 2→3、目标不是整容量', () => {
    expect(LEVELS).toHaveLength(5)
    let prevPar = 0
    for (const [i, def] of LEVELS.entries()) {
      const par = optimalMoves(def.capacities, def.target)
      expect(par).toBeGreaterThan(0)
      expect(par).toBeGreaterThan(prevPar)
      prevPar = par
      expect(def.capacities).not.toContain(def.target)
      expect(def.target).toBeLessThanOrEqual(Math.max(...def.capacities))
      expect(new Set(def.capacities).size).toBe(def.capacities.length) // 容量各异
      // 生成器给的可解关卡由 BFS 状态空间验证（与 createJugsState 的 par 一致）。
      expect(createJugsState(i + 1).par).toBe(par)
    }
    expect(LEVELS[0]!.capacities).toHaveLength(2)
    expect(LEVELS[1]!.capacities).toHaveLength(2)
    expect(LEVELS[2]!.capacities).toHaveLength(3)
  })

  it('确定性：mulberry32 同种子同排列、容量多重集不变、省略 rng 保持表序', () => {
    const a = createJugsState(3, mulberry32(42))
    const b = createJugsState(3, mulberry32(42))
    expect(a.capacities).toEqual(b.capacities)
    expect(a.amounts).toEqual(b.amounts)
    expect([...a.capacities].sort((x, y) => x - y)).toEqual([5, 8, 13]) // 多重集不变
    // 不注入 rng：按关卡表原序。
    expect(createJugsState(3).capacities).toEqual([13, 8, 5])
    // 不同种子至少改变过某一关的顺序（10 个种子里找得到一种不同排列）。
    const orders = new Set<string>()
    for (let seed = 1; seed <= 10; seed += 1) {
      orders.add(createJugsState(3, mulberry32(seed)).capacities.join(','))
    }
    expect(orders.size).toBeGreaterThan(1)
    // 洗牌后的关卡同样可解（BFS par 与容量顺序无关）。
    for (let seed = 1; seed <= 5; seed += 1) {
      expect(createJugsState(5, mulberry32(seed)).par).toBe(14)
    }
  })
})
