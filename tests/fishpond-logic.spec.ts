import { describe, expect, it } from 'vitest'
import {
  BASE_SLOTS, BREED_COOLDOWN_DAYS, EXPAND_COSTS, FOOD_COST, FOOD_PER_BUY, LEVELS, MAX_SLOTS,
  ESCAPE_GRACE, MULT_MAX, MULT_MIN, POWER_CENTER, POWER_HI, POWER_LO, POWER_PERIOD_S,
  START_COINS, SPECIES, SPECIES_ORDER,
  acknowledgeResult, allSpeciesCollected, beginCast, biteHalfWindow, buyExpansion, buyFood,
  buyFry, canBreed, checkLevelGoal, colorMultiplier, createFishpondState, expansionCost,
  firstEmptySlot, fryCost, isStarving, judgeBite, lockPower, mixGenes, mulberry32, nextDay,
  nextLevel, pondClick, priceMultiplier, rollFish, sellPrice, stageOf, strike, tickPower,
  tickWait, type FishpondState, type PondFish,
} from '../src/client/games/fishpond/logic.ts'

/** 队列随机源：按序吐出固定值，耗尽后返回 0（构造确定性混合序列）。 */
function seqRng(values: number[]): () => number {
  let i = 0
  return () => {
    const v = values[i]
    i += 1
    return v === undefined ? 0 : v
  }
}

/** 把一条塘中鱼直接养成成鱼（绕过逐日喂食，测试繁殖/出售用）。 */
function forceAdult(fish: PondFish): void {
  fish.growthDays = SPECIES[fish.species].growDays
  fish.hungryDays = 0
}

describe('fishpond logic', () => {
  it('双段钓鱼判定：力度甜区锁定 → 咬钩窗口提竿（早/中/晚/脱钩/断线）', () => {
    const state = createFishpondState(42, 0)
    // 体力不足拒绝抛竿
    state.energy = 0
    expect(beginCast(state)).toBe(false)
    state.energy = 1
    expect(beginCast(state)).toBe(true)
    expect(state.energy).toBe(0)
    expect(state.fishing.status).toBe('power')
    // 力度条 ping-pong：扫过 1 后折返
    tickPower(state, 10)
    expect(state.fishing.power).toBe(1)
    expect(state.fishing.powerDir).toBe(-1)
    // 甜区外锁定 → 断线失败
    state.fishing.power = 0.3
    expect(lockPower(state)).toBe(false)
    expect(state.fishing.failReason).toBe('power')
    expect(state.fishing.status).toBe('result')
    // 确认失败收杆后重新抛竿，甜区内锁定成功
    expect(acknowledgeResult(state)).toBe(false)
    state.energy = 1
    beginCast(state)
    tickPower(state, POWER_PERIOD_S * POWER_CENTER)
    expect(lockPower(state)).toBe(true)
    expect(state.fishing.status).toBe('wait')
    expect(state.fishing.biteAt).toBeGreaterThanOrEqual(1)
    expect(state.fishing.biteAt).toBeLessThan(3)
    // 太早提竿
    state.fishing.biteAt = 1.5
    state.fishing.halfWindow = 0.3
    state.fishing.elapsed = 0.5
    expect(strike(state)).toBe('early')
    // 重新抛竿 → 咬钩瞬间命中
    acknowledgeResult(state)
    state.energy = 1
    beginCast(state)
    state.fishing.power = POWER_LO
    lockPower(state)
    state.fishing.biteAt = 1.5
    state.fishing.halfWindow = 0.3
    state.fishing.elapsed = 1.5
    expect(strike(state)).toBe('caught')
    expect(state.fishing.pending === null).toBe(false)
    // 太晚提竿（另一轮）
    acknowledgeResult(state)
    state.energy = 1
    beginCast(state)
    state.fishing.power = POWER_HI
    lockPower(state)
    state.fishing.biteAt = 1.0
    state.fishing.halfWindow = 0.2
    state.fishing.elapsed = 1.5
    expect(strike(state)).toBe('late')
    // 超宽限不提竿 → 自动脱钩
    acknowledgeResult(state)
    state.energy = 1
    beginCast(state)
    state.fishing.power = 0.77
    lockPower(state)
    state.fishing.biteAt = 1.0
    state.fishing.halfWindow = 0.2
    tickWait(state, 2)
    expect(state.fishing.failReason).toBe('escape')
  })

  it('咬钩窗口判定：端点命中、半窗逐关收窄、超宽限自动脱钩', () => {
    // 窗口端点含端点命中，窗外判定早/晚
    expect(judgeBite(1.2, 1.5, 0.3)).toBe('hit')
    expect(judgeBite(1.2, 1.5, 0.3 - 0.0001)).toBe('early')
    expect(judgeBite(1.8, 1.5, 0.3)).toBe('hit')
    expect(judgeBite(1.81, 1.5, 0.3)).toBe('late')
    // 半窗 0.55 起步、每关 -0.09、最低 0.16
    expect(biteHalfWindow(0)).toBe(0.55)
    expect(biteHalfWindow(1)).toBeCloseTo(0.46, 10)
    expect(biteHalfWindow(4)).toBeCloseTo(0.19, 10)
    expect(biteHalfWindow(99)).toBe(0.16)
    // 不提竿超过 biteAt + 半窗 × 宽限倍数 → escape
    const state = createFishpondState(21, 2)
    state.energy = 1
    beginCast(state)
    state.fishing.power = 0.77
    lockPower(state)
    state.fishing.biteAt = 1
    state.fishing.halfWindow = 0.3
    tickWait(state, 1 + 0.3 * ESCAPE_GRACE - 0.01)
    expect(state.fishing.failReason).toBe('')
    tickWait(state, 0.02)
    expect(state.fishing.status).toBe('result')
    expect(state.fishing.failReason).toBe('escape')
  })

  it('钓取池分层权重：质量放大稀有/传说，成鱼池里只有合法品种', () => {
    const counts: { common: number, rare: number, legendary: number } = { common: 0, rare: 0, legendary: 0 }
    const speciesSeen = new Set<string>()
    let rng = mulberry32(7)
    for (let i = 0; i < 2000; i += 1) {
      const fish = rollFish(rng, 0, i)
      counts[SPECIES[fish.species].tier] += 1
      speciesSeen.add(fish.species)
      expect(fish.growthDays).toBe(0)
      expect(fish.slot).toBe(-1)
      expect(fish.genes.every(v => v >= 0 && v <= 9)).toBe(true)
    }
    // 低质量（qf=0.6）：传说权重 3.6/94.8，2000 次约 76 条
    expect(counts.common).toBeGreaterThan(counts.rare)
    expect(counts.rare).toBeGreaterThan(counts.legendary)
    expect(counts.legendary).toBeGreaterThan(20)
    expect(speciesSeen.size).toBe(6)
    // 高质量（qf=1.4）：传说权重占比从 3.6/94.8 升到 8.4/107.6
    const rng2 = mulberry32(7)
    let legendaryHi = 0
    for (let i = 0; i < 2000; i += 1) {
      if (SPECIES[rollFish(rng2, 1, i).species].tier === 'legendary') legendaryHi += 1
    }
    expect(legendaryHi).toBeGreaterThan(counts.legendary)
  })

  it('生长/喂食/饥饿：每日一次喂食、断粮拒绝、连饿两天停滞并冒泡', () => {
    const state = createFishpondState(9, 0)
    const fry = state.pond[0]!
    expect(stageOf(fry)).toBe(0)
    expect(pondClick(state, 0)).toBe('fed')
    expect(state.food).toBe(3)
    expect(fry.fedToday).toBe(true)
    expect(pondClick(state, 0)).toBe('already-fed')
    // 断粮后另一条幼鱼拒绝喂食
    state.food = 0
    expect(pondClick(state, 1)).toBe('no-food')
    // 空格与越界
    expect(pondClick(state, 2)).toBe('empty')
    expect(pondClick(state, 99)).toBe('empty')
    // 结束今天：喂过的长 1 天，没喂的饿 1 天
    nextDay(state)
    expect(fry.growthDays).toBe(1)
    expect(stageOf(fry)).toBe(1) // 鲫鱼 ceil(2/2)=1 即成长期
    expect(state.pond[1]!.hungryDays).toBe(1)
    // 再饿一天 → 停滞状态
    state.food = 1
    pondClick(state, 0)
    nextDay(state)
    expect(stageOf(fry)).toBe(2) // 喂满 growDays 成成鱼
    state.pond[1]!.hungryDays = 2
    expect(isStarving(state.pond[1]!)).toBe(true)
    expect(isStarving(fry)).toBe(false)
    // 成鱼点击进入出售确认而非喂食
    expect(pondClick(state, 0)).toBe('sell-pending')
    expect(state.pendingSell).toBe(0)
  })

  it('繁殖：同品种异性成鱼相邻 + 冷却；子代基因为双亲逐通道混合', () => {
    const state = createFishpondState(3, 0)
    const a = state.pond[0]!
    const b = state.pond[1]!
    forceAdult(a)
    forceAdult(b)
    a.genes = [2, 8, 5]
    b.genes = [4, 2, 5]
    // 幼鱼 / 同性 / 未成鱼不可繁殖
    const fryCopy: PondFish = { ...a, sex: 'F', growthDays: 0 }
    expect(canBreed(a, fryCopy, 1)).toBe(false)
    const sameSex: PondFish = { ...b, sex: 'M' }
    expect(canBreed(a, sameSex, 1)).toBe(false)
    expect(canBreed(a, b, 1)).toBe(true)
    // 冷却期内拒绝
    a.lastBredDay = 1
    expect(canBreed(a, b, 1 + BREED_COOLDOWN_DAYS - 1)).toBe(false)
    expect(canBreed(a, b, 1 + BREED_COOLDOWN_DAYS)).toBe(true)
    a.lastBredDay = -1
    // 混合：固定序列取亲本并触发 ±1 变异（每通道 取亲本/变异判定/方向 3 个值）
    const mixed = mixGenes([2, 8, 5], [4, 2, 5], seqRng([
      0.1, 0.1, 0.4, // 取 a=2，变异 -1 → 1
      0.9, 0.1, 0.9, // 取 b=2，变异 +1 → 3
      0.1, 0.9, 0.5, // 取 a=5，不变异 → 5
    ]))
    expect(mixed).toEqual([1, 3, 5])
    // 钳制 0-9：边界亲本 ±1 不越界
    const clamped = mixGenes([0, 9, 0], [0, 9, 9], seqRng([
      0.1, 0.1, 0.4, // 0 - 1 → 钳 0
      0.9, 0.1, 0.9, // 9 + 1 → 钳 9
      0.9, 0.1, 0.4, // 9 - 1 → 8
    ]))
    expect(clamped).toEqual([0, 9, 8])
    // 全取父本且不变异：每通道 取亲本 0.4（父）/ 变异判定 0.9（不触发）
    expect(mixGenes([2, 8, 5], [4, 2, 5], seqRng([0.4, 0.9, 0.4, 0.9, 0.4, 0.9]))).toEqual([2, 8, 5])
    // nextDay 自动繁殖：相邻一公一母成鱼产 1-2 条同品种鱼苗，双方进入冷却
    const born = nextDay
    born(state)
    const children = state.pond.filter(f => f !== null && f.id > 2)
    expect(children.length).toBeGreaterThanOrEqual(1)
    expect(children.every(f => f!.species === 'crucian' && stageOf(f!) === 0)).toBe(true)
    expect(a.lastBredDay).toBe(1)
    expect(b.lastBredDay).toBe(1)
    // 冷却期内第二天不再繁殖
    const childCount = state.pond.filter(f => f !== null).length
    nextDay(state)
    expect(state.pond.filter(f => f !== null).length).toBe(childCount)
  })

  it('市场价格曲线：正弦 + 种子噪声，钳制在区间内且逐日/逐品种独立', () => {
    for (const s of SPECIES_ORDER) {
      for (let day = 1; day <= 21; day += 1) {
        const m = priceMultiplier(s, day, 123)
        expect(m).toBeGreaterThanOrEqual(MULT_MIN)
        expect(m).toBeLessThanOrEqual(MULT_MAX)
        // 确定性：同参数重算一致
        expect(priceMultiplier(s, day, 123)).toBe(m)
      }
    }
    // 不同 seed 影响噪声相位
    const some = priceMultiplier('koi', 3, 1) !== priceMultiplier('koi', 3, 2)
      || priceMultiplier('koi', 5, 1) !== priceMultiplier('koi', 5, 2)
    expect(some).toBe(true)
    // 品种独立相位：同日不同品种不全相等
    const day3 = SPECIES_ORDER.map(s => priceMultiplier(s, 3, 77))
    expect(new Set(day3).size).toBeGreaterThan(1)
    // 颜色加成：均值映射 1.0 - 1.5
    expect(colorMultiplier([0, 0, 0])).toBe(1)
    expect(colorMultiplier([9, 9, 9])).toBe(1.5)
  })

  it('买卖账目：鱼苗/鱼粮/扩塘扣款正确，成鱼两次点击按当日行情入账', () => {
    const state = createFishpondState(5, 0)
    expect(firstEmptySlot(state)).toBe(2)
    // 买鲫鱼苗：扣半价基准、入格、登记图鉴
    const coins0 = state.coins
    expect(buyFry(state, 'crucian')).toBe(true)
    expect(state.coins).toBe(coins0 - fryCost('crucian'))
    expect(state.pond[2]!.species).toBe('crucian')
    expect(state.collected.crucian).toBe(true)
    // 稀有品种不卖
    expect(buyFry(state, 'koi')).toBe(false)
    // 鱼粮：6 币买 3 份
    const coins1 = state.coins
    expect(buyFood(state)).toBe(true)
    expect(state.coins).toBe(coins1 - FOOD_COST)
    expect(state.food).toBe(4 + FOOD_PER_BUY)
    // 扩塘：逐档涨价、9 格封顶（补足资金验证三档全开）
    state.coins += 1000
    const coins2 = state.coins
    expect(buyExpansion(state)).toBe(true)
    expect(state.coins).toBe(coins2 - EXPAND_COSTS[0]!)
    expect(state.pondSlots).toBe(BASE_SLOTS + 1)
    buyExpansion(state)
    buyExpansion(state)
    expect(state.pondSlots).toBe(MAX_SLOTS)
    expect(expansionCost(state)).toBe(-1)
    expect(buyExpansion(state)).toBe(false)
    // 出售：养成成鱼，两次点击入账 sellPrice
    const seller = state.pond[0]!
    forceAdult(seller)
    seller.genes = [9, 9, 9]
    const before = state.coins
    const price = sellPrice(state, seller)
    expect(price).toBeGreaterThanOrEqual(Math.round(SPECIES.crucian.base * MULT_MIN * 1.5))
    pondClick(state, 0)
    expect(pondClick(state, 0)).toBe('sold')
    expect(state.coins).toBe(before + price)
    expect(state.pond[0]).toBeNull()
    expect(state.pendingSell).toBe(-1)
  })

  it('关卡目标：金额达标过关，终关还需集齐 6 品种；nextLevel 保留进度', () => {
    const state = createFishpondState(6, 0)
    state.coins = LEVELS[0]!.target - 1
    checkLevelGoal(state)
    expect(state.phase).toBe('playing')
    state.coins = LEVELS[0]!.target
    checkLevelGoal(state)
    expect(state.phase).toBe('won')
    nextLevel(state)
    expect(state.levelIndex).toBe(1)
    expect(state.phase).toBe('playing')
    expect(state.coins).toBe(LEVELS[0]!.target) // 塘与金币保留
    // 终关：钱够但图鉴缺 → 不过关
    const last = createFishpondState(6, LEVELS.length - 1)
    last.coins = LEVELS[LEVELS.length - 1]!.target
    expect(allSpeciesCollected(last)).toBe(false)
    checkLevelGoal(last)
    expect(last.phase).toBe('playing')
    for (const s of SPECIES_ORDER) last.collected[s] = true
    checkLevelGoal(last)
    expect(last.phase).toBe('won')
    nextLevel(last) // 终关不再推进
    expect(last.levelIndex).toBe(LEVELS.length - 1)
  })

  it('seed 全程重放：同种子同操作序列得到完全一致的世界', () => {
    /** 跑一段确定性脚本并导出可比较快照。 */
    const runGame = (seed: number): unknown => {
      const state: FishpondState = createFishpondState(seed, 0)
      // 喂两天把两条鲫鱼苗养成成鱼
      for (let d = 0; d < 2; d += 1) {
        pondClick(state, 0)
        pondClick(state, 1)
        nextDay(state)
      }
      // 市场买卖
      buyFood(state)
      buyFry(state, 'guppy')
      // 钓一条鱼：力度正中甜区、咬钩瞬间提竿
      beginCast(state)
      state.fishing.power = 0.77
      lockPower(state)
      state.fishing.elapsed = state.fishing.biteAt
      strike(state)
      acknowledgeResult(state)
      // 出售一条成鱼
      pondClick(state, 0)
      pondClick(state, 0)
      return {
        coins: state.coins, day: state.day, food: state.food,
        energy: state.energy, nextFishId: state.nextFishId,
        collected: { ...state.collected },
        pond: state.pond.map(f => f === null ? null : {
          id: f.id, species: f.species, sex: f.sex, genes: [...f.genes],
          growthDays: f.growthDays, hungryDays: f.hungryDays, lastBredDay: f.lastBredDay,
        }),
      }
    }
    expect(runGame(20260101)).toEqual(runGame(20260101))
    // 不同种子至少存在分歧（繁殖条数/基因/钓取品种随种子变化）
    let diverged = false
    for (let s = 2; s <= 9 && !diverged; s += 1) {
      diverged = JSON.stringify(runGame(1)) !== JSON.stringify(runGame(s))
    }
    expect(diverged).toBe(true)
    expect(START_COINS).toBe(120)
  })
})
