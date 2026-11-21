import { describe, expect, it } from 'vitest'
import {
  createSandSimState, stepOnce, stepSim, applyTool, snapshotGrid, mulberry32,
  LEVELS, EMPTY, SAND, WATER, OIL, ROCK, FIRE, GOLD, BUCKET, cellAt,
  type SandSimState,
} from '../src/client/games/sandsim/logic.ts'

/** 造一张可控小棋盘：12 列 x 10 行，底行岩、桶居中（4..8），其余清空。 */
function craft(seed = 7, levelIndex = 0): SandSimState {
  const s = createSandSimState(seed, levelIndex)
  s.rows = 10
  s.cols = 12
  s.grid = []
  s.fireLife = []
  s.moved = []
  for (let r = 0; r < 10; r += 1) {
    s.grid.push(new Array<number>(12).fill(EMPTY))
    s.fireLife.push(new Array<number>(12).fill(0))
    s.moved.push(new Array<number>(12).fill(0))
  }
  for (let c = 0; c < 12; c += 1) s.grid[9]![c] = ROCK
  for (let c = 4; c <= 8; c += 1) s.grid[9]![c] = BUCKET
  s.goldInPlay = 0
  s.collected = 0
  s.quota = 3
  s.won = false
  s.over = false
  return s
}

/** 在第 3 列立一道全高岩墙，把测试区（0-2 列）与桶区（4-8 列）隔开。 */
function sealBucketSide(s: SandSimState): void {
  for (let r = 0; r < 10; r += 1) s.grid[r]![3] = ROCK
}

describe('sandsim logic', () => {
  it('mulberry32 与关卡生成确定性：同种子逐值一致，异种子不同', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 200; i += 1) expect(a()).toBe(b())
    expect(mulberry32(42)()).not.toBe(mulberry32(43)())
    const s1 = createSandSimState(100, 0)
    const s2 = createSandSimState(100, 0)
    const s3 = createSandSimState(101, 0)
    expect(snapshotGrid(s1)).toBe(snapshotGrid(s2))
    expect(snapshotGrid(s1)).not.toBe(snapshotGrid(s3))
    expect(s1.rows).toBe(LEVELS[0]!.rows)
  })

  it('沙下落并斜堆：直落、遇阻斜落、静置于平地', () => {
    const s = craft()
    sealBucketSide(s)
    s.grid[0]![1] = SAND
    stepOnce(s)
    expect(s.grid[0]![1]).toBe(EMPTY)
    expect(s.grid[1]![1]).toBe(SAND)
    // 连落到岩面（第 9 行岩）上静置，不滑入桶区
    for (let i = 0; i < 10; i += 1) stepOnce(s)
    expect(s.grid[8]![1]).toBe(SAND)
    // 斜堆：柱旁落下的沙会滑向空位摊开
    s.grid[2]![1] = SAND
    s.grid[2]![2] = SAND
    for (let i = 0; i < 8; i += 1) stepOnce(s)
    // 前一段落下的 1 颗 + 新 2 颗全部静置在第 8 行
    let sand = 0
    for (let c = 0; c < 3; c += 1) if (s.grid[8]![c] === SAND) sand += 1
    expect(sand).toBe(3)
  })

  it('密度交换：沙/金沉入水，水沉入油（油被压到上方）', () => {
    const s = craft()
    // 沙 -> 水：水被三面岩托住不动，沙从上方压入水下
    s.grid[4]![2] = SAND
    s.grid[5]![2] = WATER
    s.grid[6]![1] = ROCK
    s.grid[6]![2] = ROCK
    s.grid[6]![3] = ROCK
    s.grid[5]![1] = ROCK
    s.grid[5]![3] = ROCK
    stepOnce(s)
    expect(s.grid[5]![2]).toBe(SAND)
    expect(s.grid[4]![2]).toBe(WATER)
    // 水 -> 油：水沉到油下
    const s2 = craft()
    s2.grid[4]![2] = WATER
    s2.grid[5]![2] = OIL
    stepOnce(s2)
    expect(s2.grid[5]![2]).toBe(WATER)
    expect(s2.grid[4]![2]).toBe(OIL)
  })

  it('油上浮：油下方是水时，油经交换升至水面', () => {
    const s = craft()
    s.grid[7]![2] = WATER
    s.grid[6]![2] = OIL
    s.grid[5]![2] = WATER
    stepOnce(s)
    expect(s.grid[5]![2]).toBe(OIL)
    expect(s.grid[6]![2]).toBe(WATER)
  })

  it('水水平流动铺开；被岩围住时不漏', () => {
    const s = craft()
    sealBucketSide(s)
    for (let c = 0; c <= 2; c += 1) s.grid[8]![c] = WATER
    for (let i = 0; i < 60; i += 1) stepOnce(s)
    // 被围死的水在岩面上静置不漏（0-2 列被第 3 列岩墙与底行岩封闭）
    for (let i = 0; i < 20; i += 1) stepOnce(s)
    let total = 0
    const cols = new Set<number>()
    for (let r = 0; r < 10; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        if (s.grid[r]![c] === WATER) { total += 1; cols.add(c) }
      }
    }
    // 数量守恒：摊开后至少占据两列
    expect(total).toBe(3)
    expect(cols.size).toBeGreaterThanOrEqual(2)
  })

  it('火点燃油并蔓延、遇水熄灭', () => {
    const s = craft()
    s.grid[6]![2] = OIL
    s.grid[6]![3] = OIL
    s.grid[7]![2] = ROCK
    s.grid[7]![3] = ROCK
    s.grid[5]![2] = FIRE
    s.fireLife[5]![2] = 90
    stepOnce(s)
    // 相邻油至少一格被点燃
    const burning = [s.grid[5]![2], s.grid[6]![2], s.grid[6]![3]].includes(FIRE)
    expect(burning).toBe(true)
    // 水扑火：火格邻水则熄
    const s2 = craft()
    s2.grid[4]![2] = FIRE
    s2.fireLife[4]![2] = 90
    s2.grid[4]![3] = WATER
    stepOnce(s2)
    expect(s2.grid[4]![2]).toBe(EMPTY)
  })

  it('火烧毁金砂不可回收，且可收集数不足时立即判负', () => {
    const s = craft()
    s.quota = 2
    s.grid[4]![2] = GOLD
    s.grid[3]![2] = FIRE
    s.fireLife[3]![2] = 90
    s.grid[5]![1] = ROCK
    s.grid[5]![2] = ROCK
    s.grid[5]![3] = ROCK
    s.goldInPlay = 1
    s.goldTotal = 1
    stepOnce(s)
    expect(s.goldBurned).toBe(1)
    expect(s.goldInPlay).toBe(0)
    expect(s.over).toBe(true)
    expect(s.won).toBe(false)
  })

  it('金砂入桶计分；沙入桶被吸收不计分', () => {
    const s = craft()
    s.quota = 1
    s.goldInPlay = 2
    s.grid[7]![5] = GOLD
    s.grid[7]![6] = SAND
    stepOnce(s)
    expect(s.grid[8]![5]).toBe(GOLD)
    stepOnce(s)
    expect(s.collected).toBe(1)
    expect(s.goldInPlay).toBe(1)
    expect(s.grid[8]![5]).toBe(EMPTY)
    expect(s.won).toBe(true)
    expect(s.grid[9]![5]).toBe(BUCKET)
  })

  it('工具：挖掘清岩并扣次数、放岩/水/沙占用空格、预算耗尽无效果', () => {
    const s = craft()
    s.grid[3]![1] = ROCK
    expect(applyTool(s, 3, 1, 'dig')).toBe(true)
    expect(s.grid[3]![1]).toBe(EMPTY)
    expect(s.digLeft).toBe(LEVELS[0]!.digBudget - 1)
    expect(applyTool(s, 3, 1, 'dig')).toBe(false)
    expect(applyTool(s, 2, 2, 'rock')).toBe(true)
    expect(s.grid[2]![2]).toBe(ROCK)
    expect(applyTool(s, 2, 3, 'water')).toBe(true)
    expect(s.grid[2]![3]).toBe(WATER)
    expect(applyTool(s, 2, 4, 'sand')).toBe(true)
    expect(s.grid[2]![4]).toBe(SAND)
    s.digLeft = 0
    s.grid[4]![4] = ROCK
    expect(applyTool(s, 4, 4, 'dig')).toBe(false)
    expect(s.grid[4]![4]).toBe(ROCK)
    expect(applyTool(s, -1, 0, 'water')).toBe(false)
    expect(applyTool(s, 0, 99, 'water')).toBe(false)
    // 桶格与已占用格不可放置
    expect(applyTool(s, 9, 5, 'rock')).toBe(false)
    expect(applyTool(s, 2, 2, 'water')).toBe(false)
  })

  it('确定性重放：同种子同工具脚本 300 步快照一致', () => {
    const run = (): string => {
      const s = createSandSimState(2024, 2)
      applyTool(s, 3, 5, 'dig')
      applyTool(s, 4, 5, 'dig')
      applyTool(s, 2, 9, 'water')
      for (let i = 0; i < 300; i += 1) stepOnce(s)
      return snapshotGrid(s) + '#' + s.collected + '#' + s.goldBurned
    }
    expect(run()).toBe(run())
  })

  it('过关与超时：达标即胜；倒计时归零判负', () => {
    const s = craft()
    s.quota = 1
    s.goldInPlay = 1
    s.grid[7]![5] = GOLD
    for (let i = 0; i < 5; i += 1) stepOnce(s)
    expect(s.collected).toBe(1)
    expect(s.won).toBe(true)
    expect(s.over).toBe(true)
    const s2 = craft()
    s2.timeLeft = 0.05
    stepSim(s2, 0.1)
    expect(s2.over).toBe(true)
    expect(s2.won).toBe(false)
    expect(s2.timeLeft).toBe(0)
  })

  it('stepSim 按 30Hz 累积整步：半步不结算，满步结算一次', () => {
    const s = craft()
    s.grid[0]![3] = SAND
    stepSim(s, 1 / 60 - 0.001)
    expect(s.grid[0]![3]).toBe(SAND)
    stepSim(s, 1 / 30)
    expect(s.grid[0]![3]).toBe(EMPTY)
  })

  it('关卡递进：5 关配置，尺寸/配额递增，第 3 关起带火源', () => {
    expect(LEVELS).toHaveLength(5)
    expect(LEVELS[0]!.hasFire).toBe(false)
    expect(LEVELS[2]!.hasFire).toBe(true)
    expect(LEVELS[4]!.quota).toBeGreaterThan(LEVELS[0]!.quota)
    expect(LEVELS[4]!.goldTotal).toBeGreaterThan(LEVELS[0]!.goldTotal)
    const s3 = createSandSimState(9, 2)
    // 带火关卡应确实生成火与油
    let fire = 0
    let oil = 0
    for (let r = 0; r < s3.rows; r += 1) {
      for (let c = 0; c < s3.cols; c += 1) {
        if (s3.grid[r]![c] === FIRE) fire += 1
        if (s3.grid[r]![c] === OIL) oil += 1
      }
    }
    expect(oil).toBeGreaterThan(0)
    expect(fire).toBeGreaterThanOrEqual(1)
    const s3b = createSandSimState(9, 2)
    expect(snapshotGrid(s3b)).toBe(snapshotGrid(s3))
    expect(cellAt(s3, -1, 0)).toBe(ROCK)
  })
})