/**
 * 收获季节逻辑测试：卡池/天气的 seed 派生、动作预算与账目、生长与过熟
 * 腐烂、连作惩罚、肥力/豆科/休耕、旱雨虫天气效果、温室双倍、季末结算
 * 与结转、整季 seed 重放一致性。全部确定性（注入 seed，无 Math.random）。
 */
import { describe, expect, it } from 'vitest'
import {
  ACTIONS_PER_WEEK, CROP_POOL, CROP_POOL_IDS, POOL_SIZE, SEASONS, START_MONEY,
  WEEKS_PER_SEASON, createHarvestState, fallowTile, harvestTile, isMature,
  nextSeason, nextWeek, plantCrop, totalAssets, waterTile,
  type HarvestState, type Weather,
} from '../src/client/games/harvest/logic.ts'

/** 扫描种子直到 predicate(状态) 为真（逻辑纯函数，扫描确定）。 */
function findSeed(seasonIndex: number, pred: (s: HarvestState) => boolean): HarvestState {
  for (let seed = 1; seed < 100000; seed += 1) {
    const s = createHarvestState(seed, seasonIndex)
    if (pred(s)) return s
  }
  throw new Error('no seed matches predicate')
}

/** 找到卡池里指定作物的卡下标，选中它。 */
function selectCrop(state: HarvestState, crop: keyof typeof CROP_POOL): boolean {
  const idx = state.cardPool.indexOf(crop)
  if (idx < 0) return false
  state.selectedCard = idx
  return true
}

/** 播种指定作物并浇水到成熟。 */
function growToMature(state: HarvestState, tileIndex: number, crop: keyof typeof CROP_POOL): void {
  state.actionsLeft = ACTIONS_PER_WEEK
  expect(selectCrop(state, crop)).toBe(true)
  expect(plantCrop(state, tileIndex)).toBe(true)
  const spec = CROP_POOL[crop]
  for (let i = 0; i < spec.growWeeks; i += 1) {
    state.actionsLeft = ACTIONS_PER_WEEK
    expect(waterTile(state, tileIndex)).toBe(true)
  }
  expect(isMature(state.tiles[tileIndex]!)).toBe(true)
}

describe('harvest logic', () => {
  it('卡池与天气序列由 seed 派生且可复现', () => {
    const a = createHarvestState(1234, 0)
    const b = createHarvestState(1234, 0)
    expect(a.cardPool).toEqual(b.cardPool)
    expect(a.weatherSeq).toEqual(b.weatherSeq)
    expect(a.cardPool).toHaveLength(POOL_SIZE)
    // 无重复且都来自候选池
    expect(new Set(a.cardPool).size).toBe(POOL_SIZE)
    for (const id of a.cardPool) expect(CROP_POOL_IDS).toContain(id)
    // 不同 seed 的卡池整体上会变化（前 20 个 seed 不可能全同）
    const pools = new Set<string>()
    for (let seed = 1; seed <= 20; seed += 1) pools.add(createHarvestState(seed, 0).cardPool.join(','))
    expect(pools.size).toBeGreaterThan(1)
    expect(a.money).toBe(START_MONEY)
    expect(a.weather).toBe(a.weatherSeq[0])
  })

  it('每周 2 个动作：播种扣钱扣肥力，超额动作被拒绝', () => {
    const s = createHarvestState(1234, 0)
    expect(s.actionsLeft).toBe(ACTIONS_PER_WEEK)
    const cost = CROP_POOL[s.cardPool[0]!].seedCost
    expect(plantCrop(s, 0)).toBe(true)
    expect(s.money).toBe(START_MONEY - cost)
    expect(s.tiles[0]!.crop).toBe(s.cardPool[0])
    expect(s.actionsLeft).toBe(1)
    expect(plantCrop(s, 1)).toBe(true)
    expect(s.actionsLeft).toBe(0)
    // 动作用尽后再种失败且不扣钱
    const moneyBefore = s.money
    expect(plantCrop(s, 2)).toBe(false)
    expect(s.money).toBe(moneyBefore)
    // 已占用的格子不能再种
    s.actionsLeft = ACTIONS_PER_WEEK
    expect(plantCrop(s, 0)).toBe(false)
    // 越界下标安全拒绝
    expect(plantCrop(s, 99)).toBe(false)
  })

  it('浇水推进生长，成熟后可收获入库存且不可再浇', () => {
    const s = createHarvestState(1234, 0)
    const cropId = s.cardPool[0]!
    const spec = CROP_POOL[cropId]
    expect(plantCrop(s, 0)).toBe(true)
    // 空格浇水被拒
    expect(waterTile(s, 1)).toBe(false)
    for (let i = 0; i < spec.growWeeks - 1; i += 1) {
      s.actionsLeft = ACTIONS_PER_WEEK
      expect(waterTile(s, 0)).toBe(true)
    }
    expect(isMature(s.tiles[0]!)).toBe(false)
    expect(waterTile(s, 0)).toBe(true)
    expect(isMature(s.tiles[0]!)).toBe(true)
    // 成熟后浇水被拒
    s.actionsLeft = ACTIONS_PER_WEEK
    expect(waterTile(s, 0)).toBe(false)
    const value = harvestTile(s, 0)
    expect(value).not.toBeNull()
    expect(s.inventoryValue).toBe(value)
    expect(s.tiles[0]!.crop).toBeNull()
    // 收获后空格再收失败
    expect(harvestTile(s, 0)).toBeNull()
    expect(totalAssets(s)).toBe(s.money + s.inventoryValue)
  })

  it('过熟腐烂：成熟后再过 2 个周末烂在地里', () => {
    const s = createHarvestState(1234, 0)
    growToMature(s, 0, s.cardPool[0]!)
    // 第 1 个周末：过熟计数 1，仍可收
    nextWeek(s)
    expect(s.tiles[0]!.crop).not.toBeNull()
    expect(s.tiles[0]!.overWeeks).toBe(1)
    expect(harvestTile(s, 0)).not.toBeNull()
    // 重种后直接放烂到底
    growToMature(s, 0, s.cardPool[0]!)
    nextWeek(s)
    nextWeek(s)
    expect(s.tiles[0]!.crop).toBeNull()
    expect(s.tiles[0]!.overWeeks).toBe(0)
    expect(harvestTile(s, 0)).toBeNull()
  })

  it('连作惩罚：同科减产 30%，换科恢复全产', () => {
    const s = findSeed(0, (st) => st.cardPool.includes('radish') && st.cardPool.includes('wheat'))
    growToMature(s, 0, 'radish')
    expect(harvestTile(s, 0)).toBe(20) // round(22 * 0.91)
    // 同科（root）连种萝卜：肥力 82→64，再乘 0.7
    growToMature(s, 0, 'radish')
    expect(harvestTile(s, 0)).toBe(13) // round(22 * 0.82 * 0.7)
    // 换科（root→grass）种小麦：肥力 64→50，无连作乘数
    growToMature(s, 0, 'wheat')
    expect(harvestTile(s, 0)).toBe(15) // round(20 * 0.75)
  })

  it('肥力机制：播种耗肥、休耕恢复封顶、豆科收获养地', () => {
    const s = findSeed(0, (st) => st.cardPool.includes('radish') && st.cardPool.includes('soybean'))
    expect(selectCrop(s, 'radish')).toBe(true)
    expect(plantCrop(s, 0)).toBe(true)
    expect(s.tiles[0]!.fertility).toBe(82) // 100 - 18
    // 占用格不可休耕
    expect(fallowTile(s, 0)).toBe(false)
    // 空地休耕 +25，100 封顶
    expect(fallowTile(s, 1)).toBe(true)
    expect(s.tiles[1]!.fertility).toBe(100)
    // 萝卜浇到成熟收获（肥力保持 82），再种大豆（耗肥 0）收获 → +30 恢复到 100
    for (let i = 0; i < CROP_POOL.radish.growWeeks; i += 1) {
      s.actionsLeft = ACTIONS_PER_WEEK
      expect(waterTile(s, 0)).toBe(true)
    }
    expect(harvestTile(s, 0)).not.toBeNull()
    expect(s.tiles[0]!.fertility).toBe(82)
    growToMature(s, 0, 'soybean')
    expect(harvestTile(s, 0)).toBe(27) // round(30 * 0.91)
    expect(s.tiles[0]!.fertility).toBe(100)
  })

  it('旱周需浇水才生长，雨周免费加速，晴周正常 +1', () => {
    const drought = findSeed(0, (st) => st.weatherSeq[0] === 'drought')
    expect(plantCrop(drought, 0)).toBe(true)
    nextWeek(drought)
    expect(drought.tiles[0]!.growth).toBe(0) // 未浇水 → 停滞
    const watered = findSeed(0, (st) => st.weatherSeq[0] === 'drought')
    expect(plantCrop(watered, 0)).toBe(true)
    expect(waterTile(watered, 0)).toBe(true)
    nextWeek(watered)
    expect(watered.tiles[0]!.growth).toBe(2) // 浇水即时 +1 + 周末推进 +1
    const rain = findSeed(0, (st) => st.weatherSeq[0] === 'rain')
    expect(plantCrop(rain, 0)).toBe(true)
    nextWeek(rain)
    expect(rain.tiles[0]!.growth).toBe(2) // 正常 1 + 雨 1
    const sunny = findSeed(0, (st) => st.weatherSeq[0] === 'sunny')
    expect(plantCrop(sunny, 0)).toBe(true)
    nextWeek(sunny)
    expect(sunny.tiles[0]!.growth).toBe(1)
  })

  it('虫害周降低在种作物质量，产量按质量打折', () => {
    const s = findSeed(0, (st) => st.weatherSeq[1] === 'pest')
    const cropId = s.cardPool[0]!
    expect(plantCrop(s, 0)).toBe(true)
    nextWeek(s)
    expect(s.weather).toBe('pest')
    expect(s.tiles[0]!.quality).toBeCloseTo(0.8)
    // 长到成熟后收获：round(sell * 肥力系数 * 0.8)
    const spec = CROP_POOL[cropId]
    while (!isMature(s.tiles[0]!)) {
      s.actionsLeft = ACTIONS_PER_WEEK
      expect(waterTile(s, 0)).toBe(true)
    }
    const fertFactor = 0.5 + s.tiles[0]!.fertility / 200
    const expected = Math.max(1, Math.round(spec.sellPrice * fertFactor * 0.8))
    expect(harvestTile(s, 0)).toBe(expected)
  })

  it('温室格周末生长双倍（第 3 季起）', () => {
    const s = findSeed(2, (st) => st.weatherSeq[0] === 'sunny')
    const gh = s.tiles.findIndex((t) => t.greenhouse)
    const plain = s.tiles.findIndex((t) => !t.greenhouse)
    expect(gh).toBeGreaterThanOrEqual(0)
    expect(SEASONS[2]!.greenhouses).toBe(4)
    expect(plantCrop(s, gh)).toBe(true)
    expect(plantCrop(s, plain)).toBe(true)
    s.actionsLeft = ACTIONS_PER_WEEK
    nextWeek(s)
    expect(s.tiles[gh]!.growth).toBe(2)
    expect(s.tiles[plain]!.growth).toBe(1)
  })

  it('季末结算：库存折现、达标进下一季并结转盈余、末季通关/未达失败', () => {
    const lost = createHarvestState(1234, 0)
    for (let i = 0; i < WEEKS_PER_SEASON; i += 1) nextWeek(lost)
    expect(lost.phase).toBe('lost')
    expect(lost.seasonResult!.assets).toBe(START_MONEY)
    // 达标：库存折算进资金后按资产判定
    const pass = createHarvestState(1234, 0)
    pass.money = 150
    pass.inventoryValue = 100
    for (let i = 0; i < WEEKS_PER_SEASON; i += 1) nextWeek(pass)
    expect(pass.phase).toBe('seasonEnd')
    expect(pass.money).toBe(250)
    expect(pass.inventoryValue).toBe(0)
    expect(pass.seasonResult).toEqual({ passed: true, assets: 250, target: SEASONS[0]!.target })
    // 结转盈余 250-220=30，下一季启动资金 = 60+30
    const next = nextSeason(pass)
    expect(next).not.toBeNull()
    expect(next!.seasonIndex).toBe(1)
    expect(next!.money).toBe(START_MONEY + 30)
    expect(nextSeason(pass)).not.toBeNull()
    // 非结算期调用 nextSeason 返回 null
    expect(nextSeason(createHarvestState(1, 0))).toBeNull()
    // 末季达标 → 通关
    const won = createHarvestState(1234, SEASONS.length - 1)
    won.money = 2000
    for (let i = 0; i < WEEKS_PER_SEASON; i += 1) nextWeek(won)
    expect(won.phase).toBe('won')
  })

  it('seed 重放：同一 seed + 相同动作脚本得到完全一致的局面', () => {
    const script = (s: HarvestState): void => {
      for (let week = 0; week < WEEKS_PER_SEASON; week += 1) {
        plantCrop(s, 0)
        waterTile(s, 0)
        waterTile(s, 0)
        nextWeek(s)
      }
    }
    const a = createHarvestState(777, 0)
    const b = createHarvestState(777, 0)
    script(a)
    script(b)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // 与不同 seed 的结局不同（卡池/天气不同的局面整体不一致）
    const c = createHarvestState(778, 0)
    script(c)
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
  })

  it('天气序列覆盖 12 周且全部合法；每周动作数在换周时重置', () => {
    const s = createHarvestState(42, 0)
    expect(s.weatherSeq).toHaveLength(WEEKS_PER_SEASON)
    const legal: Weather[] = ['sunny', 'rain', 'drought', 'pest']
    for (const w of s.weatherSeq) expect(legal).toContain(w)
    expect(plantCrop(s, 5)).toBe(true)
    expect(plantCrop(s, 6)).toBe(true)
    expect(s.actionsLeft).toBe(0)
    nextWeek(s)
    expect(s.week).toBe(2)
    expect(s.actionsLeft).toBe(ACTIONS_PER_WEEK)
    expect(s.weather).toBe(s.weatherSeq[1])
  })
})

