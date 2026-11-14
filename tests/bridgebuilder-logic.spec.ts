import { describe, expect, it } from 'vitest'
import {
  BREAK_STRAIN,
  LEVELS,
  beamCost,
  createRunWorld,
  levelFor,
  mulberry32,
  nodeKey,
  parseNodeKey,
  placeReject,
  scoreFor,
  shouldBreak,
  simulateRun,
  springForce,
  stepRun,
  stressRatio,
  totalCost,
  type BridgeBeam,
  type BridgeNode,
} from '../src/client/games/bridgebuilder/logic.ts'

const n = (x: number, y: number): BridgeNode => ({ x, y })
/** x0..x1 路面行的连续横梁。 */
const deck = (x0: number, x1: number): BridgeBeam[] => {
  const out: BridgeBeam[] = []
  for (let x = x0; x < x1; x += 1) out.push({ a: n(x, 6), b: n(x + 1, 6) })
  return out
}
/** L1 强设计：路面 + 立柱 V 形撑。 */
const strongL1 = (): BridgeBeam[] => {
  const out = [...deck(4, 10)]
  for (const x of [5, 6, 7, 8, 9]) out.push({ a: n(7, 4), b: n(x, 6) })
  return out
}

describe('bridgebuilder logic', () => {
  it('关卡模板五关递进：峡谷更宽、预算差收紧、立柱减少', () => {
    expect(LEVELS).toHaveLength(5)
    const gaps = LEVELS.map(l => l.rightAnchor.x - l.leftAnchor.x)
    const budgets = LEVELS.map(l => l.budget)
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b))
    expect(LEVELS[0]!.pillars.length).toBeGreaterThan(LEVELS[4]!.pillars.length)
    expect(LEVELS[4]!.pillars).toHaveLength(0)
    // 预算相对每格缺口越来越紧。
    const tight = LEVELS.map((l, i) => l.budget / gaps[i]!)
    expect(tight[4]!).toBeLessThan(tight[0]!)
    expect(budgets[0]!).toBeGreaterThan(0)
    expect(levelFor(9)).toBe(LEVELS[4]!)
    expect(levelFor(-1)).toBe(LEVELS[0]!)
  })

  it('杆件放置合法性：网格 / 长度 / 重复 / 预算 / 锚点连通', () => {
    const level = levelFor(0)
    const la = level.leftAnchor
    // 从左锚点出发的邻格梁合法。
    expect(placeReject(level, [], la, n(la.x + 1, la.y - 1))).toBeNull()
    // 网格外（路面行之下 / 锚点列之外）拒绝。
    expect(placeReject(level, [], la, n(la.x + 1, la.y + 1))).toBe('grid')
    expect(placeReject(level, [], la, n(la.x - 1, la.y))).toBe('grid')
    // 超长（3 格）拒绝，2 格直连与对角合法。
    expect(placeReject(level, [], la, n(la.x + 3, la.y))).toBe('length')
    expect(placeReject(level, [], la, n(la.x + 2, la.y))).toBeNull()
    // 重复拒绝。
    const one = [{ a: la, b: n(la.x + 1, la.y) }]
    expect(placeReject(level, one, one[0]!.b, la)).toBe('duplicate')
    // 不接触锚点也不接触已有结构 → 凭空悬浮拒绝。
    expect(placeReject(level, [], n(6, 2), n(6, 3))).toBe('connect')
    // 预算：L1 预算内放得下立柱撑杆方案；自定义小预算关连一根最便宜的梁都放不下。
    const strong = strongL1()
    expect(totalCost(strong)).toBeLessThanOrEqual(level.budget)
    const poor = { ...level, budget: 5 }
    expect(placeReject(poor, [], poor.leftAnchor, n(poor.leftAnchor.x + 1, poor.leftAnchor.y))).toBe('budget')
  })

  it('造价按欧氏格距计费，总造价为各杆之和', () => {
    expect(beamCost(n(4, 6), n(5, 6))).toBe(10)
    expect(beamCost(n(4, 6), n(5, 5))).toBe(15)
    expect(beamCost(n(4, 6), n(6, 6))).toBe(20)
    expect(totalCost([{ a: n(4, 6), b: n(5, 6) }, { a: n(5, 6), b: n(6, 6) }])).toBe(20)
  })

  it('胡克弹簧力与断裂阈值：应力比 ≥1 才断', () => {
    // 静止长度 40，拉伸 4（应变 0.1）→ 力 = k × 4。
    expect(springForce(40, 44, 0)).toBeCloseTo(5000 * 4, 5)
    // 阻尼项：沿轴相对速度也贡献轴向力。
    expect(springForce(40, 40, 2)).toBeCloseTo(30 * 2, 5)
    expect(shouldBreak(0.99)).toBe(false)
    expect(shouldBreak(1)).toBe(true)
    // 阈值即断裂应变：BREAK_STRAIN=0.35 时 1/0.35 应变对应力比 1。
    expect(shouldBreak(1 / BREAK_STRAIN * BREAK_STRAIN)).toBe(true)
  })

  it('空桥必败：小车从左岸冲进峡谷', () => {
    const world = simulateRun(levelFor(0), [])
    expect(world.outcome).toBe('failed')
    expect(world.brokenCount).toBe(0)
    expect(world.wheels[1]!.y).toBeGreaterThan(world.deckY + 200)
  })

  it('强桁架过关：立柱 V 撑方案让小车抵达右岸', () => {
    const world = simulateRun(levelFor(0), strongL1())
    expect(totalCost(strongL1())).toBeLessThanOrEqual(levelFor(0).budget)
    expect(world.outcome).toBe('won')
    expect(world.brokenCount).toBe(0)
  })

  it('裸桥面断裂：无支撑长跨在车载荷下坍塌', () => {
    const world = simulateRun(levelFor(0), deck(4, 10))
    expect(world.outcome).toBe('failed')
    expect(world.brokenCount).toBeGreaterThan(0)
    expect(world.maxStress).toBeGreaterThanOrEqual(1)
  })

  it('确定性：同蓝图两次完整模拟逐位一致；mulberry32 同种子同序列', () => {
    const a = simulateRun(levelFor(2), deck(3, 12))
    const b = simulateRun(levelFor(2), deck(3, 12))
    expect(a.outcome).toBe(b.outcome)
    expect(a.brokenCount).toBe(b.brokenCount)
    expect(a.maxStress).toBe(b.maxStress)
    expect(a.wheels[0]!.x).toBe(b.wheels[0]!.x)
    expect(a.wheels[1]!.y).toBe(b.wheels[1]!.y)
    // 逐步步进与一次性 simulateRun 殊途同归。
    const manual = createRunWorld(levelFor(2), deck(3, 12))
    for (let i = 0; i < 240 * 20 && manual.outcome === 'running'; i += 1) stepRun(manual)
    if (manual.outcome === 'running') manual.outcome = 'failed'
    expect(manual.outcome).toBe(a.outcome)
    expect(manual.wheels[0]!.x).toBe(a.wheels[0]!.x)
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()])
    expect(nodeKey(n(3, 7))).toBe('3,7')
    expect(parseNodeKey('3,7')).toEqual({ x: 3, y: 7 })
    expect(parseNodeKey('x,y')).toBeNull()
  })

  it('应力比与得分：松弛为零、断裂为 1；省钱提高得分', () => {
    const world = createRunWorld(levelFor(0), strongL1())
    expect(stressRatio(world, 0)).toBeCloseTo(0, 6)
    const cheap = scoreFor(0, [{ a: n(4, 6), b: n(5, 6) }])
    const dear = scoreFor(0, [])
    expect(dear - cheap).toBe(totalCost([{ a: n(4, 6), b: n(5, 6) }]))
    expect(scoreFor(0, [])).toBe(1000 + levelFor(0).budget)
    expect(scoreFor(4, [])).toBe(5000 + levelFor(4).budget)
  })
})
