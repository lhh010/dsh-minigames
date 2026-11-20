import { describe, expect, it } from 'vitest'
import {
  CELL_ROCK, buildLevel, createSim, getLevels, runSimulation, validatePlacements,
  type FactoryLevelSpec, type Placement,
} from '../src/client/games/factory/logic.ts'

/** 造一张自定义测试关卡（默认 4×1 单行，无岩石）。 */
function makeSpec(extra?: Partial<FactoryLevelSpec>): FactoryLevelSpec {
  return {
    id: 99, name: '测试关', w: 4, h: 1,
    sources: [{ x: 0, y: 0, dir: 1, kind: 'A', interval: 1 }],
    demands: [{ x: 3, y: 0, product: 'A', quota: 5 }],
    machines: [],
    maxPieces: 32, ticks: 60, rockCount: 0, seed: 1,
    reference: [],
    ...extra,
  }
}

const rockCells = (level: ReturnType<typeof buildLevel>): string[] =>
  [...level.cells.entries()].filter(([, c]) => c === CELL_ROCK)
    .map(([i]) => (i % level.w) + ',' + Math.floor(i / level.w)).sort()

const belt = (x: number, y: number, dir: number): Placement => ({ x, y, dir: dir as Placement['dir'], type: 'belt' })

describe('factory logic', () => {
  it('带衔接传递：物料沿同向带逐 tick 前移并送入需求槽', () => {
    const level = buildLevel(makeSpec({
      w: 5, h: 1,
      sources: [{ x: 0, y: 0, dir: 1, kind: 'A', interval: 4 }],
      demands: [{ x: 4, y: 0, product: 'A', quota: 5 }],
    }))
    const sim = createSim(level, [belt(1, 0, 1), belt(2, 0, 1), belt(3, 0, 1)])
    sim.step()
    expect(sim.items().map((i) => i.x + ',' + i.y)).toEqual(['1,0'])
    sim.step()
    expect(sim.items().map((i) => i.x)).toEqual([2])
    sim.step()
    expect(sim.items().map((i) => i.x)).toEqual([3])
    sim.step()
    expect(sim.items().length).toBe(0)
    expect(sim.demandCounts[0]).toBe(1)
    while (sim.status === 'running') sim.step()
    expect(sim.status).toBe('won')
    expect(sim.demandCounts[0]).toBe(5)
    expect(sim.tick).toBe(20)
  })

  it('带末端无衔接时物品堵死（红显格 = 末端带）', () => {
    const level = buildLevel(makeSpec({ demands: [] }))
    const sim = createSim(level, [belt(1, 0, 1), belt(2, 0, 1)])
    sim.step()
    sim.step()
    sim.step()
    expect(sim.jammed()).toEqual([2])
    expect(sim.items().map((i) => i.x).sort((a, b) => a - b)).toEqual([1, 2])
    sim.step()
    expect(sim.jammed().sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('对头互撞：相向两带上的物品互相堵死，谁也不让位', () => {
    const level = buildLevel(makeSpec({
      w: 4, h: 1,
      sources: [
        { x: 0, y: 0, dir: 1, kind: 'A', interval: 99 },
        { x: 3, y: 0, dir: 3, kind: 'B', interval: 99 },
      ],
      demands: [],
    }))
    const sim = createSim(level, [belt(1, 0, 1), belt(2, 0, 3)])
    sim.step()
    expect(sim.items().length).toBe(2)
    sim.step()
    expect(sim.items().length).toBe(2)
    expect(sim.jammed().sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('同格争抢：两件物料同时挤进同一空带，扫描序先到者得、后者堵死', () => {
    const level = buildLevel(makeSpec({
      w: 5, h: 1,
      sources: [
        { x: 0, y: 0, dir: 1, kind: 'A', interval: 99 },
        { x: 4, y: 0, dir: 3, kind: 'B', interval: 99 },
      ],
      demands: [],
    }))
    const sim = createSim(level, [belt(1, 0, 1), belt(2, 0, 1), belt(3, 0, 3)])
    sim.step()
    sim.step()
    const at2 = sim.items().filter((i) => i.x === 2)
    expect(at2.length).toBe(1)
    expect(at2[0]!.kind).toBe('A')
    expect(sim.jammed()).toEqual([3])
  })

  it('长队同步前移：5 件满载一连带一个 tick 整体各前进一格', () => {
    const level = buildLevel(makeSpec({
      w: 8, h: 1,
      sources: [{ x: 0, y: 0, dir: 1, kind: 'A', interval: 1 }],
      demands: [{ x: 7, y: 0, product: 'A', quota: 99 }],
      ticks: 200,
    }))
    const sim = createSim(level, [1, 2, 3, 4, 5, 6].map((x) => belt(x, 0, 1)))
    for (let i = 0; i < 5; i += 1) sim.step()
    expect(sim.items().map((i) => i.x)).toEqual([1, 3, 5])
    expect(sim.jammed().length).toBe(0)
    sim.step()
    expect(sim.items().map((i) => i.x)).toEqual([2, 4, 6])
    sim.step()
    // 满载整线同步前移：队首交付、后件各进一格、源头同时补件
    expect(sim.demandCounts[0]).toBe(1)
    expect(sim.items().map((i) => i.x)).toEqual([1, 3, 5])
  })

  it('机器吞入节拍：只要匹配原料、缓冲满后拒收堵死', () => {
    const level = buildLevel(makeSpec({
      w: 3, h: 1,
      sources: [{ x: 0, y: 0, dir: 1, kind: 'A', interval: 1 }],
      demands: [],
      machines: [{ id: 'asm', name: '组装机', glyph: '组', inputs: { A: 1, B: 1 }, output: 'C', period: 2 }],
    }))
    const sim = createSim(level, [belt(1, 0, 1), { x: 2, y: 0, dir: 1, type: 'machine', machine: 'asm' }])
    sim.step()
    sim.step()
    expect(sim.items().length).toBe(0)
    expect(sim.machines()[0]!.buffer).toEqual({ A: 1 })
    expect(sim.machines()[0]!.complete).toBe(false)
    sim.step()
    expect(sim.items().map((i) => i.x)).toEqual([1])
    sim.step()
    expect(sim.machines()[0]!.buffer).toEqual({ A: 1 })
    expect(sim.jammed()).toEqual([1])
  })

  it('机器产出节拍与出口堵塞停机：period 满 1 tick 后吐出；出口带被占则保持成品等待', () => {
    const level = buildLevel(makeSpec({
      w: 5, h: 1,
      sources: [{ x: 0, y: 0, dir: 1, kind: 'A', interval: 1 }],
      demands: [{ x: 4, y: 0, product: 'A2', quota: 2 }],
      machines: [{ id: 'furnace', name: '熔炉', glyph: '熔', inputs: { A: 1 }, output: 'A2', period: 2 }],
    }))
    const sim = createSim(level, [belt(1, 0, 1),
      { x: 2, y: 0, dir: 1, type: 'machine', machine: 'furnace' }, belt(3, 0, 1)])
    for (let i = 0; i < 8; i += 1) sim.step()
    expect(sim.demandCounts[0]).toBe(2)

    const stuck = buildLevel(makeSpec({
      w: 5, h: 1,
      sources: [{ x: 0, y: 0, dir: 1, kind: 'A', interval: 1 }],
      demands: [{ x: 4, y: 0, product: 'C', quota: 2 }],
      machines: [{ id: 'furnace', name: '熔炉', glyph: '熔', inputs: { A: 1 }, output: 'A2', period: 2 }],
    }))
    const sim2 = createSim(stuck, [belt(1, 0, 1),
      { x: 2, y: 0, dir: 1, type: 'machine', machine: 'furnace' }, belt(3, 0, 1)])
    for (let i = 0; i < 7; i += 1) sim2.step()
    expect(sim2.items().map((i) => i.x).sort((a, b) => a - b)).toEqual([1, 3])
    expect(sim2.machines()[0]!.complete).toBe(true)
    expect(sim2.machines()[0]!.progress).toBeGreaterThan(2)
    expect(sim2.jammed().sort((a, b) => a - b)).toEqual([1, 3])
  })

  it('需求槽只收订单成品：送错物料堵在槽前且不计数', () => {
    const level = buildLevel(makeSpec({
      w: 3, h: 1,
      sources: [{ x: 0, y: 0, dir: 1, kind: 'A', interval: 99 }],
      demands: [{ x: 2, y: 0, product: 'C', quota: 1 }],
    }))
    const sim = createSim(level, [belt(1, 0, 1)])
    sim.step()
    sim.step()
    expect(sim.demandCounts[0]).toBe(0)
    expect(sim.jammed()).toEqual([1])
    expect(sim.items().map((i) => i.x)).toEqual([1])
  })

  it('放置校验：超限 / 岩石 / 固定格 / 重复 / 未知机器均被拒绝', () => {
    const level = getLevels()[0]!
    expect(validatePlacements(level, level.reference)).toBeNull()
    expect(validatePlacements(level, [])).toBeNull()
    // 找一块岩石格与一个出口源格
    const rockIdx = level.cells.findIndex((c) => c === CELL_ROCK)
    const rx = rockIdx % level.w
    const ry = Math.floor(rockIdx / level.w)
    expect(validatePlacements(level, [belt(rx, ry, 1)])).toContain('空地')
    expect(validatePlacements(level, [belt(0, 1, 1)])).toContain('空地')
    expect(validatePlacements(level, [belt(1, 1, 1), belt(1, 1, 2)])).toContain('重复')
    const many: Placement[] = []
    for (let i = 0; i <= level.maxPieces; i += 1) many.push(belt(1 + (i % 6), 1 + Math.floor(i / 6) * 2, 1))
    expect(validatePlacements(level, many)).toContain('超限')
    expect(validatePlacements(level, [{ x: 1, y: 1, dir: 1, type: 'machine', machine: 'nope' }])).toContain('未知机器')
  })

  it('过关与超时判定：参考布局过关且耗 tick 远小于上限；空放置超时且零交付', () => {
    const level = getLevels()[0]!
    const won = runSimulation(level, level.reference)
    expect(won.status).toBe('won')
    expect(won.ticksUsed).toBeLessThan(level.ticks / 2)
    const empty = runSimulation(level, [])
    expect(empty.status).toBe('timeout')
    expect(empty.ticksUsed).toBe(level.ticks)
    expect(empty.demandCounts).toEqual([0])
  })

  it('五关参考布局全部可解（含三级链与双需求槽）', () => {
    getLevels().forEach((level) => {
      const r = runSimulation(level, level.reference)
      expect(r.status).toBe('won')
      level.demands.forEach((d, i) => expect(r.demandCounts[i]).toBeGreaterThanOrEqual(d.quota))
    })
  })

  it('seed 确定性：同 seed 岩石相同、异 seed 岩石不同，且换 seed 后参考布局仍可解', () => {
    const a = getLevels().map(rockCells)
    const b = getLevels().map(rockCells)
    expect(a).toEqual(b)
    const c = getLevels(4242).map(rockCells)
    expect(c).not.toEqual(a)
    getLevels(4242).forEach((level, i) => {
      expect(rockCells(level).length).toBe([2, 3, 4, 4, 5][i])
      const r = runSimulation(level, level.reference)
      expect(r.status).toBe('won')
    })
  })
})
