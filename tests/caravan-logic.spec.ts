import { describe, expect, it } from 'vitest'
import {
  applyCard, buy, canMove, capacity, cargoUsed, createCaravan, drawCard, endDay,
  GOODS, LEVELS, move, netWorth, priceAt, rawPrice, roadTo, sell, visiblePrice,
  type CaravanState, type EventCard,
} from '../src/client/games/caravan/logic.ts'

/** 从 0 号城 BFS，返回可达城市集合（校验连通）。 */
function reachableSet(s: CaravanState): Set<number> {
  const seen = new Set<number>([0])
  const queue = [0]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const r of s.world.cities[cur]!.roads) {
      if (!seen.has(r.to)) {
        seen.add(r.to)
        queue.push(r.to)
      }
    }
  }
  return seen
}

/** 找一条从 0 号城出发、参数满足谓词的道路；找不到返回 null。 */
function findRoad(s: CaravanState, pred: (moveCost: number, waterCost: number, oasis: boolean) => boolean) {
  for (const r of s.world.cities[0]!.roads) {
    if (pred(r.moveCost, r.waterCost, r.oasis)) return r
  }
  return null
}

/** 确定性脚本机器人：优先移动 → 买得起的选中品 → 结束今天。 */
function playScript(s: CaravanState, steps: number): void {
  for (let i = 0; i < steps && s.phase === 'playing'; i += 1) {
    const road = s.world.cities[s.cityIdx]!.roads.find((r) => canMove(s, r.to))
    if (road !== undefined) {
      move(s, road.to)
      continue
    }
    let bought = false
    for (let g = 0; g < GOODS.length && !bought; g += 1) {
      const price = priceAt(s, s.cityIdx, g)
      if (price > 0 && s.money >= price && cargoUsed(s) < capacity(s)) bought = buy(s, g, 1)
    }
    if (!bought && cargoUsed(s) > 0) {
      for (let g = 0; g < GOODS.length; g += 1) {
        if (s.cargo[g]! > 0) {
          sell(s, g, 1)
          break
        }
      }
    }
    endDay(s)
  }
}

describe('caravan logic', () => {
  it('builds a connected symmetric road graph for every level config', () => {
    for (let level = 0; level < LEVELS.length; level += 1) {
      const s = createCaravan(20260101, level)
      const n = s.world.cities.length
      expect(n).toBe(LEVELS[level]!.cities)
      expect(reachableSet(s).size).toBe(n)
      // 双向对称：i 的邻接表里有 j，则 j 的邻接表里必有 i 且参数一致。
      for (let i = 0; i < n; i += 1) {
        for (const r of s.world.cities[i]!.roads) {
          const back = s.world.cities[r.to]!.roads.find((x) => x.to === i)
          expect(back).toBeDefined()
          expect(back!.moveCost).toBe(r.moveCost)
          expect(back!.waterCost).toBe(r.waterCost)
          expect(back!.oasis).toBe(r.oasis)
        }
      }
    }
  })

  it('starts each level in Chang-An with full water/movement and exact home prices', () => {
    const s = createCaravan(7, 0)
    const cfg = LEVELS[0]!
    expect(s.phase).toBe('playing')
    expect(s.day).toBe(1)
    expect(s.cityIdx).toBe(0)
    expect(s.money).toBe(cfg.money)
    expect(s.water).toBe(cfg.waterCap)
    expect(s.movePoints).toBe(cfg.camels)
    expect(s.cargo).toEqual([0, 0, 0, 0, 0])
    expect(s.visited[0]).toBe(true)
    expect(s.visited.slice(1).every((v) => v === false)).toBe(true)
    // 到访城市的可见价即精确价。
    expect(visiblePrice(s, 0, 2)).toBe(priceAt(s, 0, 2))
    expect(() => createCaravan(1, 99)).toThrow()
  })

  it('derives deterministic day-varying prices from seed and day only', () => {
    const a = createCaravan(424, 1)
    const b = createCaravan(424, 1)
    for (let d = 1; d <= 10; d += 1) {
      for (let c = 0; c < a.world.cities.length; c += 1) {
        for (let g = 0; g < GOODS.length; g += 1) {
          expect(rawPrice(a.world, c, g, d)).toBe(rawPrice(b.world, c, g, d))
          expect(rawPrice(a.world, c, g, d)).toBeGreaterThanOrEqual(1)
        }
      }
    }
    // 同城同商品的行情随天数波动（至少两天不同）。
    const series = new Set<number>()
    for (let d = 1; d <= 10; d += 1) series.add(rawPrice(a.world, 1, 3, d))
    expect(series.size).toBeGreaterThan(1)
    // 不同 seed 生成不同世界。
    const c2 = createCaravan(425, 1)
    let diff = false
    for (let c = 0; c < a.world.cities.length && !diff; c += 1) {
      for (let g = 0; g < GOODS.length && !diff; g += 1) {
        if (rawPrice(a.world, c, g, 1) !== rawPrice(c2.world, c, g, 1)) diff = true
      }
    }
    expect(diff).toBe(true)
  })

  it('gives every city both a cheap specialty and a dear shortage across days', () => {
    const s = createCaravan(99, 0)
    for (let c = 0; c < s.world.cities.length; c += 1) {
      let minRatio = Infinity
      let maxRatio = 0
      for (let g = 0; g < GOODS.length; g += 1) {
        for (let d = 1; d <= 6; d += 1) {
          const ratio = rawPrice(s.world, c, g, d) / GOODS[g]!.base
          minRatio = Math.min(minRatio, ratio)
          maxRatio = Math.max(maxRatio, ratio)
        }
      }
      expect(minRatio).toBeLessThan(0.85)
      expect(maxRatio).toBeGreaterThan(1.25)
    }
  })

  it('fogs unvisited cities within ±20% and sharpens them on arrival', () => {
    const s = createCaravan(31337, 0)
    // 远程城（未到访）：模糊价与真值同日恒定、且落在 ±20% 邻域内。
    const target = s.world.cities.length - 1
    const exact = priceAt(s, target, 4)
    const fuzzy = visiblePrice(s, target, 4)
    expect(fuzzy).toBe(visiblePrice(s, target, 4))
    expect(fuzzy).toBeGreaterThanOrEqual(Math.floor(exact * 0.8) - 1)
    expect(fuzzy).toBeLessThanOrEqual(Math.ceil(exact * 1.2) + 1)
    // 沿环道逐城走到目标城：到访后模糊价还原为精确价。
    let cur = 0
    let guard = 0
    while (cur !== target && guard < 20) {
      guard += 1
      const road = s.world.cities[cur]!.roads.find((r) => r.to === ((cur + 1) % s.world.cities.length))!
      if (!canMove(s, road.to)) endDay(s)
      expect(move(s, road.to)).toBe(true)
      cur = road.to
    }
    expect(s.cityIdx).toBe(target)
    expect(s.visited[target]).toBe(true)
    expect(visiblePrice(s, target, 4)).toBe(priceAt(s, target, 4))
  })

  it('keeps buy/sell accounting exact and enforces cargo capacity and funds', () => {
    const s = createCaravan(555, 0)
    const g = 4 // 宝石：基准价高，300 文大概率买不满仓位
    const price = priceAt(s, 0, g)
    expect(price).toBeGreaterThan(0)
    const before = s.money
    // 钱不够整数件时拒绝。
    if (price > before) expect(buy(s, g, 1)).toBe(false)
    // 钱够则成交并记账。
    if (price <= before) {
      expect(buy(s, g, 1)).toBe(true)
      expect(s.money).toBe(before - price)
      expect(s.cargo[g]).toBe(1)
      // 同价转手：金额守恒。
      expect(sell(s, g, 1)).toBe(true)
      expect(s.money).toBe(before)
      expect(s.cargo[g]).toBe(0)
    }
    // 仓位上限 = 骆驼数。
    s.money = 100000
    expect(buy(s, 0, capacity(s))).toBe(true)
    expect(cargoUsed(s)).toBe(capacity(s))
    expect(buy(s, 1, 1)).toBe(false)
    // 卖超出存货拒绝。
    expect(sell(s, 1, 5)).toBe(false)
    // 资产额 = 银钱 + 存货按当前城行情估值。
    const worth = s.money + s.cargo.reduce((sum, n, gi) => sum + n * priceAt(s, 0, gi), 0)
    expect(netWorth(s)).toBe(worth)
  })

  it('validates movement by adjacency, movement points, and water; oasis refills', () => {
    const s = createCaravan(808, 0)
    const roads = s.world.cities[0]!.roads
    const adjacent = new Set(roads.map((r) => r.to))
    const far = s.world.cities.findIndex((_, i) => !adjacent.has(i) && i !== 0)
    expect(far).toBeGreaterThanOrEqual(0)
    expect(canMove(s, far)).toBe(false)
    expect(move(s, far)).toBe(false)
    // 资源不足时拒绝，且状态不被破坏。
    const road = roads[0]!
    s.movePoints = 0
    expect(canMove(s, road.to)).toBe(false)
    s.movePoints = road.moveCost
    s.water = road.waterCost - 1
    expect(canMove(s, road.to)).toBe(false)
    expect(s.cityIdx).toBe(0)
    // 资源足够则成功并扣减。
    s.water = road.waterCost
    const pointsBefore = s.movePoints
    const waterBefore = s.water
    expect(move(s, road.to)).toBe(true)
    expect(s.cityIdx).toBe(road.to)
    expect(s.movePoints).toBe(pointsBefore - road.moveCost)
    expect(s.water).toBe(waterBefore - road.waterCost)
    // 绿洲道路：耗尽后补水但不超过上限（找到一条 0 号城邻接绿洲道的种子）。
    let oasisState: CaravanState | null = null
    let oasisRoad: { to: number; waterCost: number } | null = null
    for (let seed = 1; seed < 60 && oasisState === null; seed += 1) {
      const t = createCaravan(seed, 0)
      const r = findRoad(t, (_m, w, oasis) => oasis && w > 0)
      if (r !== null) {
        oasisState = t
        oasisRoad = r
      }
    }
    expect(oasisState).not.toBeNull()
    oasisState!.movePoints = 5
    oasisState!.water = oasisRoad!.waterCost
    expect(move(oasisState!, oasisRoad!.to)).toBe(true)
    expect(oasisState!.water).toBe(3)
    oasisState!.water = oasisState!.world.config.waterCap
    oasisState!.movePoints = 5
    const back = oasisState!.world.cities[oasisState!.cityIdx]!.roads.find((r) => r.oasis)!
    if (back !== undefined) {
      oasisState!.water = oasisState!.world.config.waterCap - 1
      move(oasisState!, back.to)
      expect(oasisState!.water).toBe(oasisState!.world.config.waterCap)
    }
  })

  it('applies event cards: war markup, harvest markdown, tax levy, expiry', () => {
    const s = createCaravan(1234, 0)
    const plain = priceAt(s, 0, 2)
    const war: EventCard = { kind: 'war', good: 2, scale: 1.5, label: '战乱' }
    applyCard(s, war)
    expect(s.lastCard).toEqual(war)
    expect(priceAt(s, 0, 2)).toBe(Math.max(1, Math.round(plain * 1.5)))
    // 其他商品不受影响（仍等于原始行情）。
    expect(priceAt(s, 0, 1)).toBe(rawPrice(s.world, 0, 1, s.day))
    // 到期失效（until 含当天）：显式按天询价验证生效区间。
    const until = s.activeEvents[0]!.until
    expect(priceAt(s, 0, 2, until)).toBe(Math.max(1, Math.round(rawPrice(s.world, 0, 2, until) * 1.5)))
    expect(priceAt(s, 0, 2, until + 1)).toBe(rawPrice(s.world, 0, 2, until + 1))
    // 丰收跌价。
    applyCard(s, { kind: 'harvest', good: 0, scale: 0.65, label: '丰收' })
    const p0 = rawPrice(s.world, 0, 0, s.day)
    expect(priceAt(s, 0, 0)).toBe(Math.max(1, Math.round(p0 * 0.65)))
    // 税吏：征收 5% 现钱（向上取整）。
    s.activeEvents = []
    s.money = 201
    applyCard(s, { kind: 'tax', good: 0, scale: 0.05, label: '税吏' })
    expect(s.money).toBe(201 - Math.ceil(201 * 0.05))
  })

  it('ends days: resupply, refill movement, draw a deterministic card, judge the deadline', () => {
    const s = createCaravan(2024, 0)
    s.movePoints = 0
    s.water = 1
    endDay(s)
    expect(s.day).toBe(2)
    expect(s.movePoints).toBe(LEVELS[0]!.camels)
    expect(s.water).toBe(LEVELS[0]!.waterCap)
    expect(s.lastCard).not.toBeNull()
    // 同 seed 同天数序列抽卡结果一致。
    const t = createCaravan(2024, 0)
    endDay(t)
    expect(drawCard(t).kind).toBe(drawCard(s).kind)
    // 期限判定：直接推到末日。
    const rich = createCaravan(2024, 0)
    rich.money = 100000
    expect(buy(rich, 0, 1)).toBe(true) // 触发一次结算，使资产达标判定生效
    expect(rich.phase).toBe('won')
    const poor = createCaravan(2024, 0)
    poor.money = 0
    for (let d = 0; d < LEVELS[0]!.days; d += 1) endDay(poor)
    expect(poor.day).toBe(LEVELS[0]!.days + 1)
    expect(poor.phase).toBe('lost')
    // 结束后 endDay/buy 均为空操作/拒绝。
    endDay(poor)
    expect(poor.day).toBe(LEVELS[0]!.days + 1)
    expect(buy(poor, 0, 1)).toBe(false)
  })

  it('escalates five levels: more cities, days, and goals', () => {
    expect(LEVELS).toHaveLength(5)
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i]!.goal).toBeGreaterThan(LEVELS[i - 1]!.goal)
      expect(LEVELS[i]!.days).toBeGreaterThan(LEVELS[i - 1]!.days)
      expect(LEVELS[i]!.camels).toBeGreaterThanOrEqual(LEVELS[i - 1]!.camels)
    }
    for (const cfg of LEVELS) {
      expect(cfg.cities).toBeGreaterThanOrEqual(6)
      expect(cfg.cities).toBeLessThanOrEqual(8)
    }
    // 每关都能正常开局且城市数与配置一致。
    for (let level = 0; level < LEVELS.length; level += 1) {
      const s = createCaravan(606, level)
      expect(s.world.cities).toHaveLength(LEVELS[level]!.cities)
      expect(roadTo(s, s.cityIdx)).toBeUndefined()
    }
  })

  it('replays an identical scripted run byte-for-byte from the same seed', () => {
    const a = createCaravan(8888, 2)
    const b = createCaravan(8888, 2)
    playScript(a, 60)
    playScript(b, 60)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // 另一 seed 的同类脚本产生不同轨迹（世界/事件不同）。
    const c = createCaravan(9999, 2)
    playScript(c, 60)
    expect(JSON.stringify(a) === JSON.stringify(c)).toBe(false)
  })
})
