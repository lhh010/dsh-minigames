import { describe, expect, it } from 'vitest'
import {
  createDeepDiveState, stepDeepDive, mulberry32, startDive, startAscend, buyUpgrade,
  setInputX, setInputY, o2Rate, tankCapacity, moveSpeed, vertSpeed, pickRadius, upgradeCost,
  KIND_VALUE, VALUE_DEPTH, LEVELS, MAX_TIER, STING_O2, O2_BASE, O2_PER_M,
} from '../src/client/games/deepdive/logic.ts'
import type { DeepDiveState, Treasure, Jelly, Current } from '../src/client/games/deepdive/logic.ts'

const DT = 1 / 60

/** 推进 n 个固定子步。 */
function run(state: DeepDiveState, frames: number): void {
  for (let i = 0; i < frames; i += 1) stepDeepDive(state, DT)
}

/** 覆盖海域为受控布置（保留关卡/目标），便于逐项验证。 */
function craft(
  state: DeepDiveState,
  treasures: Treasure[],
  jellies: Jelly[] = [],
  currents: Current[] = [],
): void {
  state.treasures = treasures
  state.jellies = jellies
  state.currents = currents
}

describe('deepdive logic', () => {
  it('seed 生成确定性：mulberry32 序列稳定，同 seed 海域一致，异 seed 不同', () => {
    const r1 = mulberry32(7)
    const r2 = mulberry32(7)
    for (let i = 0; i < 100; i += 1) {
      const v = r1()
      expect(v).toBe(r2())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(mulberry32(7)()).not.toBe(mulberry32(8)())
    const a1 = createDeepDiveState(42)
    const a2 = createDeepDiveState(42)
    const b = createDeepDiveState(43)
    expect(JSON.stringify(a1.treasures)).toBe(JSON.stringify(a2.treasures))
    expect(JSON.stringify(a1.jellies)).toBe(JSON.stringify(a2.jellies))
    expect(JSON.stringify(a1.currents)).toBe(JSON.stringify(a2.currents))
    expect(a1.treasures.length).toBe(LEVELS[0]!.treasures)
    expect(JSON.stringify(a1.treasures)).not.toBe(JSON.stringify(b.treasures))
  })

  it('海域布置随关卡递进：越深的关越富也越险，宝物价值随深度放大', () => {
    const s1 = createDeepDiveState(9)
    expect(s1.level).toBe(1)
    const lv1 = LEVELS[0]!
    const lv5 = LEVELS[4]!
    expect(lv5.depth).toBeGreaterThan(lv1.depth)
    expect(lv5.treasures).toBeGreaterThan(lv1.treasures)
    expect(lv5.jellies).toBeGreaterThan(lv1.jellies)
    expect(lv5.target).toBeGreaterThan(lv1.target)
    // 价值 = 基础值 × (1 + 深度 / VALUE_DEPTH)：同种宝物深处更贵。
    for (const t of s1.treasures) {
      const expectValue = Math.round(KIND_VALUE[t.kind] * (1 + t.d / VALUE_DEPTH))
      expect(t.value).toBe(expectValue)
      expect(t.value).toBeGreaterThanOrEqual(KIND_VALUE[t.kind])
    }
    const deep = s1.treasures.filter((t) => t.d > VALUE_DEPTH)
    const shallow = s1.treasures.filter((t) => t.d < VALUE_DEPTH / 2)
    if (deep.length > 0 && shallow.length > 0) {
      const maxKind = Math.max(...deep.map((t) => KIND_VALUE[t.kind]))
      const minKind = Math.min(...shallow.map((t) => KIND_VALUE[t.kind]))
      expect(maxKind).toBeGreaterThanOrEqual(minKind)
    }
  })

  it('氧气消耗随当前深度线性增加：浅层省气、深层烧气', () => {
    expect(o2Rate(0)).toBeCloseTo(O2_BASE)
    expect(o2Rate(100)).toBeCloseTo(O2_BASE + 100 * O2_PER_M)
    expect(o2Rate(100)).toBeGreaterThan(o2Rate(40))
    // 同样 4 秒：停在 20m 与停在 100m 的耗氧差 = 积分差。
    const shallowState = createDeepDiveState(1)
    craft(shallowState, [])
    startDive(shallowState)
    shallowState.depth = 20
    const deepState = createDeepDiveState(1)
    craft(deepState, [])
    startDive(deepState)
    deepState.depth = 100
    const cap0 = tankCapacity(shallowState.upgrades)
    run(shallowState, 240)
    run(deepState, 240)
    const usedShallow = cap0 - shallowState.oxygen
    const usedDeep = cap0 - deepState.oxygen
    expect(usedShallow).toBeCloseTo(o2Rate(20) * 4, 1)
    expect(usedDeep).toBeCloseTo(o2Rate(100) * 4, 1)
    expect(usedDeep).toBeGreaterThan(usedShallow * 2)
  })

  it('移动与边界：水平速度/垂直速度吃脚蹼档位，横向钳制在海域内', () => {
    const s = createDeepDiveState(2)
    craft(s, [])
    startDive(s)
    s.depth = 10
    setInputX(s, 1)
    run(s, 60)
    const moved = s.x - 180 // SEA_W/2 = 180
    expect(moved).toBeGreaterThan(0)
    // 全速右压 10 秒必被钳到右边界。
    run(s, 600)
    expect(s.x).toBe(348)
    setInputX(s, 0)
    // 垂直：下潜 2 秒后深度按垂直速度推进。
    setInputY(s, 1)
    const d0 = s.depth
    run(s, 120)
    expect(s.depth).toBeCloseTo(d0 + vertSpeed(s.upgrades) * 2, 1)
    // 升级脚蹼后更快。
    s.upgrades.fins = 2
    expect(moveSpeed(s.upgrades)).toBe(95 + 2 * 26)
    expect(vertSpeed(s.upgrades)).toBeGreaterThan(vertSpeed({ tank: 0, fins: 0, lamp: 0 }))
  })

  it('暗流推移：深度进入流带被横向推动，离开流带即停', () => {
    const s = createDeepDiveState(3)
    craft(s, [], [], [{ from: 50, to: 70, vx: 120 }])
    startDive(s)
    s.depth = 20
    setInputX(s, 0)
    run(s, 60)
    expect(s.x).toBe(180)
    s.depth = 60
    run(s, 60)
    expect(s.x).toBeGreaterThan(180 + 120 * 0.9)
    expect(s.x).toBeLessThanOrEqual(348)
    const xAtEdge = s.x
    s.depth = 80
    run(s, 60)
    expect(s.x).toBe(xAtEdge)
  })

  it('宝物拾取：进入拾取半径即入袋，照明灯档位加宽半径', () => {
    const s = createDeepDiveState(4)
    const t: Treasure = { x: 200, d: 30, kind: 'coin', value: Math.round(KIND_VALUE.coin * (1 + 30 / VALUE_DEPTH)), taken: false }
    craft(s, [t])
    startDive(s)
    s.depth = 30
    // 半径 15：站在 180 够不到 200。
    setInputX(s, 1)
    let guard = 0
    while (!t.taken && guard < 600) { run(s, 1); guard += 1 }
    expect(t.taken).toBe(true)
    expect(s.haul).toBe(t.value)
    // 照明灯 3 档：更远就能吸到。
    const s2 = createDeepDiveState(4)
    const t2: Treasure = { x: 200, d: 60, kind: 'pearl', value: 10, taken: false }
    craft(s2, [t2])
    startDive(s2)
    s2.upgrades.lamp = 3
    s2.depth = 60
    const r2 = pickRadius(s2.upgrades)
    expect(r2).toBe(15 + 3 * 9)
    s2.x = 200 - (r2 - 1)
    run(s2, 1)
    expect(t2.taken).toBe(true)
  })

  it('溺水惩罚：被水母蜇穿或氧气自然耗尽，都损失本趟收获并被救回船', () => {
    const s = createDeepDiveState(5)
    const j: Jelly = { x: 180, d: 30, ampX: 0, phase: 0, spd: 1 }
    craft(s, [], [j])
    startDive(s)
    s.depth = 30
    s.oxygen = 50
    s.haul = 77
    run(s, 1)
    expect(s.oxygen).toBeCloseTo(50 - STING_O2 - o2Rate(30) / 60, 1)
    // 冷却 1.2 秒内再接触不重复扣。
    const o2 = s.oxygen
    run(s, 30)
    expect(s.oxygen).toBeLessThan(o2)
    expect(s.oxygen).toBeGreaterThan(o2 - STING_O2 - 2)
    // 氧气被蜇穿：收获清零、救援回船保命。
    s.oxygen = STING_O2 - 1
    s.stingCd = 0
    run(s, 1)
    expect(s.phase).toBe('boat')
    expect(s.haul).toBe(0)
    expect(s.lastResult).toBe('drowned')
    expect(s.oxygen).toBe(tankCapacity(s.upgrades))

    // 氧气自然耗尽（无危险）同样触发溺水惩罚并救援灌满。
    const n = createDeepDiveState(6)
    craft(n, [])
    startDive(n)
    n.depth = 80
    n.haul = 123
    n.oxygen = o2Rate(80) * 2 + 1
    run(n, 180)
    expect(n.phase).toBe('boat')
    expect(n.haul).toBe(0)
    expect(n.assets).toBe(0)
    expect(n.dives).toBe(1)
    expect(n.lastResult).toBe('drowned')
    expect(n.oxygen).toBe(tankCapacity(n.upgrades))
  })


  it('上浮结算：收获入袋、氧气灌满、回合+1 只在出发计；上浮本身无额外氧耗', () => {
    const s = createDeepDiveState(7)
    craft(s, [])
    startDive(s)
    expect(s.dives).toBe(1)
    s.depth = 40
    s.haul = 88
    // 匀速上浮：耗氧只按路径深度积分（无额外惩罚）。
    startAscend(s)
    let guard = 0
    while (s.phase === 'dive' && guard < 1200) { run(s, 1); guard += 1 }
    expect(s.phase).toBe('boat')
    expect(s.assets).toBe(88)
    expect(s.haul).toBe(0)
    expect(s.lastResult).toBe('banked')
    expect(s.oxygen).toBe(tankCapacity(s.upgrades))
    // 上浮不加额外氧耗：从 40m 匀速上浮 1 秒，消耗小于“按 40m 全程计”的上界。
    const s3 = createDeepDiveState(7)
    craft(s3, [])
    startDive(s3)
    s3.depth = 40
    startAscend(s3)
    const cap3 = tankCapacity(s3.upgrades)
    run(s3, 30) // 0.5 秒：仍在上升途中，未触发 surface() 灌满
    const used3 = cap3 - s3.oxygen
    expect(s3.phase).toBe('dive')
    expect(s3.depth).toBeLessThan(40)
    expect(used3).toBeGreaterThan(o2Rate(40) * 0.25)
    expect(used3).toBeLessThan(o2Rate(40) * 0.5)
  })

  it('商店升级：扣费生效、档位封顶、付不起或潜水中不可买', () => {
    const s = createDeepDiveState(8)
    expect(upgradeCost('tank', 0)).toBe(90)
    expect(buyUpgrade(s, 'tank')).toBe(false) // 0 资产
    s.assets = 700
    expect(buyUpgrade(s, 'tank')).toBe(true)
    expect(s.assets).toBe(700 - 90)
    expect(tankCapacity(s.upgrades)).toBe(110 + 45)
    startDive(s)
    expect(buyUpgrade(s, 'fins')).toBe(false) // 水下不可买
    // 回船后把脚蹼买到满档。
    s.phase = 'boat'
    while (s.upgrades.fins < MAX_TIER) buyUpgrade(s, 'fins')
    expect(buyUpgrade(s, 'fins')).toBe(false)
    expect(s.upgrades.fins).toBe(MAX_TIER)
    expect(moveSpeed(s.upgrades)).toBe(95 + MAX_TIER * 26)
  })

  it('关卡目标：资产达标进下一关并换海域，末关达标通关', () => {
    const s = createDeepDiveState(11)
    const before = JSON.stringify(s.treasures)
    s.assets = LEVELS[0]!.target - 1
    startDive(s)
    s.depth = 30
    s.haul = 1
    startAscend(s)
    let guard = 0
    while (s.phase === 'dive' && guard < 1200) { run(s, 1); guard += 1 }
    expect(s.level).toBe(2)
    expect(s.target).toBe(LEVELS[1]!.target)
    expect(JSON.stringify(s.treasures)).not.toBe(before)
    expect(s.treasures.length).toBe(LEVELS[1]!.treasures)
    // 直通末关：达标即通关且不再出发。
    s.level = LEVELS.length
    s.assets = LEVELS[LEVELS.length - 1]!.target - 5
    startDive(s)
    expect(s.dives).toBe(2)
    s.depth = 30
    s.haul = 10
    startAscend(s)
    guard = 0
    while (s.phase === 'dive' && guard < 1200) { run(s, 1); guard += 1 }
    expect(s.won).toBe(true)
    startDive(s)
    expect(s.dives).toBe(2)
  })

  it('整趟重放：同 seed 同输入序列状态轨迹完全一致', () => {
    const play = (seed: number): number[] => {
      const s = createDeepDiveState(seed)
      startDive(s)
      setInputY(s, 1)
      for (let i = 0; i < 300; i += 1) stepDeepDive(s, DT)
      setInputX(s, 1)
      setInputY(s, -1)
      for (let i = 0; i < 400; i += 1) stepDeepDive(s, DT)
      setInputX(s, 0)
      startAscend(s)
      for (let i = 0; i < 900; i += 1) stepDeepDive(s, DT)
      return [s.x, s.depth, s.oxygen, s.haul, s.assets, s.dives, s.treasures.filter((t) => t.taken).length]
    }
    const a = play(1234)
    const b = play(1234)
    const c = play(5678)
    expect(a).toEqual(b)
    expect(a.length).toBe(7)
    // 双倍 dt 分批（同总子步数）与 60fps 推进完全一致：固定子步保证确定性。
    const chunked = (() => {
      const s = createDeepDiveState(1234)
      startDive(s)
      setInputY(s, 1)
      for (let i = 0; i < 300; i += 1) stepDeepDive(s, DT)
      setInputX(s, 1)
      setInputY(s, -1)
      for (let i = 0; i < 200; i += 1) stepDeepDive(s, DT * 2)
      setInputX(s, 0)
      startAscend(s)
      for (let i = 0; i < 900; i += 1) stepDeepDive(s, DT)
      return [s.x, s.depth, s.oxygen, s.haul, s.assets, s.dives, s.treasures.filter((t) => t.taken).length]
    })()
    expect(chunked).toEqual(a)
    expect(c).not.toEqual(a)
  })
});
