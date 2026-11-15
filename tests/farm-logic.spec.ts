import { describe, expect, it } from 'vitest'
import {
  CROPS, CROP_ORDER, DAY_TICKS, LEVELS, PRICE_MAX, PRICE_MIN, START_MONEY,
  actOnTile, buySeed, computeMarketMult, createFarmState, mulberry32, tickFarm,
  type FarmState,
} from '../src/client/games/farm/logic.ts'

/** 翻土并播种一颗指定作物（先买足种子）。 */
function plantTile(state: FarmState, index: number, crop: 'carrot' | 'tomato' | 'pumpkin' = 'carrot'): void {
  actOnTile(state, index)
  state.seedStock[crop] += 1
  state.selectedCrop = crop
  actOnTile(state, index)
}

describe('farm logic', () => {
  it('walks the tile state machine and rejects illegal skips', () => {
    const state = createFarmState(11, 0)
    state.weather = 'sunny' // 固定晴天，排除雨天免浇水分支
    expect(state.tiles[0]!.state).toBe('wasteland')
    // 荒地不能直接播种/浇水/收获：语境化动作固定先翻土
    expect(actOnTile(state, 0)).toBe('tilled')
    expect(state.tiles[0]!.state).toBe('tilled')
    // 没有种子时播种失败
    state.seedStock.carrot = 0
    expect(actOnTile(state, 0)).toBe('no-seed')
    expect(state.tiles[0]!.state).toBe('tilled')
    plantTile(state, 0)
    expect(state.tiles[0]!.state).toBe('planted')
    expect(state.seedStock.carrot).toBe(0)
    // 生长中点击无操作；未成熟不能收获（语境化动作到 growing 即停）
    expect(actOnTile(state, 0)).toBe('watered')
    expect(state.tiles[0]!.state).toBe('planted')
    tickFarm(state)
    expect(state.tiles[0]!.state).toBe('growing')
    expect(actOnTile(state, 0)).toBe('not-ready')
  })

  it('matures after exactly growTicks and harvest pays the market price into tilled', () => {
    const state = createFarmState(5, 0)
    state.weather = 'sunny'
    plantTile(state, 3)
    actOnTile(state, 3)
    tickFarm(state) // planted -> growing
    const before = state.money
    // 转 growing 的那个 tick 已带 1 点生长，故再 growTicks-2 tick 保持 growing
    for (let i = 0; i < CROPS.carrot.growTicks - 2; i += 1) {
      tickFarm(state)
      expect(state.tiles[3]!.state).toBe('growing')
    }
    tickFarm(state)
    expect(state.tiles[3]!.state).toBe('mature')
    // 卖价按收获那一刻的市场倍率结算（市场逐 tick 漂移，须事后取样）
    const price = Math.round(CROPS.carrot.sellPrice * state.marketMult)
    expect(actOnTile(state, 3)).toBe('harvested')
    expect(state.money).toBe(before + price)
    expect(state.tiles[3]!.state).toBe('tilled')
    expect(state.tiles[3]!.crop).toBeNull()
  })

  it('drought doubles water need; a second watering unlocks growth', () => {
    const state = createFarmState(9, 0)
    state.weather = 'drought'
    plantTile(state, 1)
    expect(state.tiles[1]!.waterNeed).toBe(2)
    expect(actOnTile(state, 1)).toBe('watered')
    tickFarm(state)
    expect(state.tiles[1]!.state).toBe('planted') // 只浇一次不够
    expect(actOnTile(state, 1)).toBe('watered')
    tickFarm(state)
    expect(state.tiles[1]!.state).toBe('growing')
  })

  it('rain auto-waters the whole field and makes the water action free', () => {
    const state = createFarmState(21, 0)
    plantTile(state, 0)
    plantTile(state, 1)
    state.weather = 'rain'
    tickFarm(state)
    expect(state.tiles[0]!.state).toBe('growing')
    expect(state.tiles[1]!.state).toBe('growing')
    plantTile(state, 2)
    expect(actOnTile(state, 2)).toBe('rain-free')
    tickFarm(state)
    expect(state.tiles[2]!.state).toBe('growing')
  })

  it('derives a deterministic weather sequence from the seed', () => {
    const run = (seed: number): string[] => {
      const state = createFarmState(seed, 2)
      const log = [state.weather]
      // 第 3 关共 11 天：每天打满 tick 换天
      for (let d = 1; d < LEVELS[2]!.days; d += 1) {
        for (let t = 0; t < DAY_TICKS; t += 1) tickFarm(state)
        log.push(state.weather)
      }
      return log
    }
    const a = run(777)
    const b = run(777)
    expect(a).toEqual(b)
    expect(a).toHaveLength(LEVELS[2]!.days)
    expect(a).not.toEqual(run(778)) // 不同种子（大概率）不同序列
    expect(['sunny', 'rain', 'drought']).toContain(a[0])
  })

  it('keeps the market multiplier bounded and prices scaling with it', () => {
    const state = createFarmState(3, 0)
    let ticks = 0
    for (let i = 0; i < 200 && state.phase === 'playing'; i += 1) {
      tickFarm(state)
      ticks += 1
      expect(state.marketMult).toBeGreaterThanOrEqual(PRICE_MIN)
      expect(state.marketMult).toBeLessThanOrEqual(PRICE_MAX)
    }
    expect(state.tickTotal).toBe(ticks)
    expect(state.marketHistory).toHaveLength(ticks + 1)
    // 纯正弦分量（无噪声）严格进入 ±40% 区间并周期回零
    const rng0 = () => 0.5
    expect(computeMarketMult(0, rng0)).toBeCloseTo(1, 10)
    expect(computeMarketMult(7.5, rng0)).toBeCloseTo(1.4, 10)
    expect(computeMarketMult(22.5, rng0)).toBeCloseTo(0.6, 10)
    // 买卖价与当前倍率一致（同 tick 内取整）
    for (const crop of CROP_ORDER) {
      expect(Math.max(1, Math.round(CROPS[crop].seedCost * state.marketMult))).toBeGreaterThan(0)
      expect(Math.round(CROPS[crop].sellPrice * state.marketMult)).toBeGreaterThan(0)
    }
  })

  it('balances money and seed stock through buys, planting, and harvests', () => {
    const state = createFarmState(31, 0)
    state.weather = 'sunny'
    const cost = Math.max(1, Math.round(CROPS.tomato.seedCost * state.marketMult))
    state.money = cost
    expect(buySeed(state, 'tomato')).toBe(true)
    expect(state.money).toBe(0)
    expect(state.seedStock.tomato).toBe(1)
    // 金钱不足时购买失败且不扣款
    expect(buySeed(state, 'pumpkin')).toBe(false)
    expect(state.money).toBe(0)
    // 播种消耗库存，收获按当日市价入账
    state.money = 100
    plantTile(state, 5, 'tomato')
    expect(state.seedStock.tomato).toBe(1)
    actOnTile(state, 5)
    tickFarm(state)
    for (let i = 0; i < CROPS.tomato.growTicks; i += 1) tickFarm(state)
    const expectPrice = Math.round(CROPS.tomato.sellPrice * state.marketMult)
    actOnTile(state, 5)
    expect(state.money).toBe(100 + expectPrice)
  })

  it('wins on reaching the target and loses when the days run out', () => {
    const lost = createFarmState(2, 0)
    const totalTicks = LEVELS[0]!.days * DAY_TICKS
    for (let i = 0; i < totalTicks; i += 1) {
      if (lost.phase !== 'playing') break
      tickFarm(lost)
    }
    expect(lost.phase).toBe('lost') // 不种地必然赚不到目标金额
    const won = createFarmState(2, 0)
    won.money = LEVELS[0]!.target
    tickFarm(won)
    expect(won.phase).not.toBe('won') // 未到天数不提前判胜
    won.money = LEVELS[0]!.target - 1
    won.tiles[0]!.state = 'mature'
    won.tiles[0]!.crop = 'pumpkin'
    won.marketMult = 1
    expect(actOnTile(won, 0)).toBe('harvested')
    expect(won.phase).toBe('won') // 收获入账即刻达标
  })

  it('replays identically for the same seed and scripted actions', () => {
    const script = (state: FarmState): void => {
      for (let i = 0; i < 6; i += 1) {
        buySeed(state, CROP_ORDER[i % 3]!)
        plantTile(state, i, CROP_ORDER[i % 3]!)
        actOnTile(state, i)
      }
      for (let i = 0; i < DAY_TICKS * 3; i += 1) {
        tickFarm(state)
        if (i % 5 === 0) {
          for (const tile of state.tiles) if (tile.state === 'mature') actOnTile(state, state.tiles.indexOf(tile))
        }
      }
    }
    const a = createFarmState(2024, 4)
    const b = createFarmState(2024, 4)
    script(a)
    script(b)
    expect(a.money).toBe(b.money)
    expect(a.phase).toBe(b.phase)
    expect(a.marketHistory).toEqual(b.marketHistory)
    expect(a.tiles.map(t => t.state + ':' + String(t.crop) + ':' + t.growth)).toEqual(
      b.tiles.map(t => t.state + ':' + String(t.crop) + ':' + t.growth),
    )
    expect(a.rng === b.rng).toBe(false)
  })

  it('starts each level from fresh wasteland with escalating targets', () => {
    for (const [i, level] of LEVELS.entries()) {
      const state = createFarmState(100 + i, i)
      expect(state.phase).toBe('playing')
      expect(state.day).toBe(1)
      expect(state.money).toBe(START_MONEY)
      expect(state.tiles).toHaveLength(level.cols * level.rows)
      expect(state.tiles.every(t => t.state === 'wasteland')).toBe(true)
      if (i > 0) {
        expect(level.target).toBeGreaterThan(LEVELS[i - 1]!.target)
        expect(level.droughtChance).toBeGreaterThan(LEVELS[i - 1]!.droughtChance)
      }
    }
    // mulberry32 同种子同序列（回归保护）
    const r1 = mulberry32(6)
    const r2 = mulberry32(6)
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()])
  })
})
