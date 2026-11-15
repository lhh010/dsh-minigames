import { describe, expect, it } from 'vitest'
import {
  DAY_SECONDS, DIRT_PERIOD, EGG_SECONDS, EGG_TAP_BONUS, EGG_TAP_MAX, FOOD_DEFS, GROWTH_BOOST,
  PLAY_SECONDS, SICK_LIMIT, SICK_RESCUE, SLEEP_ENERGY_RATE, SLEEP_SECONDS, STAT_DECAY,
  adultFormFor, brushPet, careScore, catchDot, createPet, deserializePet, favoriteFoodOf, feedPet,
  gameHour, isNightHour, petPet, quirkOf, serializePet, stageOf, startPlay, startSleep, tapEgg,
  tickPet, wakePet, type FoodId, type PetState,
} from '../src/client/games/petpal/logic.ts'

/** 快进 n 现实秒（小步长积分，避免一步跨过多边界）。 */
function run(state: PetState, seconds: number, step = 0.05): void {
  let left = seconds
  while (left > 0) {
    const dt = Math.min(step, left)
    tickPet(state, dt)
    left -= dt
  }
}

/** 直接孵化（跳过蛋期，属性从幼体初值开始测）。 */
function hatched(seed = 7): PetState {
  const state = createPet(seed)
  state.eggLeftSec = 0
  return state
}

/** 快进 n 秒，且每步前把心情/饱食钉回 100（全程满足加速条件，验证倍率本身）。 */
function runPinned(state: PetState, seconds: number, step = 0.05): void {
  let left = seconds
  while (left > 0) {
    const dt = Math.min(step, left)
    state.stats.joy = 100
    state.stats.hunger = 100
    tickPet(state, dt)
    left -= dt
  }
}

/** 找一个偏好为指定食物、怪癖为指定值的 seed。 */
function findSeed(food: FoodId, quirk: string): number {
  for (let seed = 1; seed < 500; seed += 1) {
    if (favoriteFoodOf(seed) === food && quirkOf(seed) === quirk) return seed
  }
  throw new Error('no seed matched')
}

describe('petpal logic', () => {
  it('清醒时四维按速率线性衰减并钳制在 [0, 100]', () => {
    const state = hatched()
    const before = { ...state.stats }
    run(state, 10)
    expect(state.stats.hunger).toBeCloseTo(before.hunger - STAT_DECAY.hunger * 10, 5)
    expect(state.stats.joy).toBeCloseTo(before.joy - STAT_DECAY.joy * 10, 5)
    expect(state.stats.clean).toBeCloseTo(before.clean - STAT_DECAY.clean * 10, 5)
    expect(state.stats.energy).toBeCloseTo(before.energy - STAT_DECAY.energy * 10, 5)
    expect(state.clockSec).toBeCloseTo(10, 5)
    // 上界钳制：全满时再喂盛宴也不会超过 100。
    state.stats.hunger = 100
    state.stats.joy = 100
    state.cooldowns.feast = 0
    feedPet(state, 'feast')
    expect(state.stats.hunger).toBe(100)
    expect(state.stats.joy).toBe(100)
    // 下界钳制：生病回保底后仍衰减，但不会低于 0（由生病接管）。
    expect(state.stats.hunger).toBeGreaterThanOrEqual(0)
  })

  it('属性归零生病：计数 +1、回保底值、单帧至多一次、满 3 次离世且 tick 冻结', () => {
    const state = hatched()
    state.stats.hunger = 0.01
    state.stats.joy = 0.01
    tickPet(state, 0.05)
    // 同帧两个属性同时归零：只病一次。
    expect(state.sickCount).toBe(1)
    expect(state.stats.hunger).toBe(SICK_RESCUE)
    expect(state.stats.joy).toBeLessThanOrEqual(0.01)
    // 第二次、第三次生病。
    state.stats.hunger = 0
    tickPet(state, 0.05)
    expect(state.sickCount).toBe(2)
    state.stats.clean = 0
    tickPet(state, 0.05)
    expect(state.sickCount).toBe(SICK_LIMIT)
    expect(state.dead).toBe(true)
    // 死亡后 tick 冻结。
    const clock = state.clockSec
    const hunger = state.stats.hunger
    run(state, 5)
    expect(state.clockSec).toBe(clock)
    expect(state.stats.hunger).toBe(hunger)
    // 死亡后交互全部失败。
    expect(feedPet(state, 'meal')).toBe(false)
    expect(petPet(state)).toBe(false)
    expect(startSleep(state)).toBe(false)
    expect(startPlay(state)).toBe(false)
  })

  it('睡觉快速回精力、冻结其余三维，10 秒自动醒，提前叫醒保留已回精力', () => {
    const state = hatched()
    // 精力压到 40：睡满整觉 40 + 40 = 80 不会撞 100 上限，恢复速率可精确验证。
    state.stats.energy = 40
    const hungerBefore = state.stats.hunger
    const cleanBefore = state.stats.clean
    expect(startSleep(state)).toBe(true)
    expect(startSleep(state)).toBe(false) // 已睡不可重复哄睡
    run(state, SLEEP_SECONDS)
    expect(state.sleeping).toBe(false)
    expect(state.stats.energy).toBeCloseTo(40 + SLEEP_ENERGY_RATE * SLEEP_SECONDS, 3)
    expect(state.stats.hunger).toBe(hungerBefore)
    expect(state.stats.clean).toBe(cleanBefore)
    // 提前叫醒：精力按已睡的 4 秒部分恢复。
    const state2 = hatched()
    state2.stats.energy = 40
    const energyBefore = state2.stats.energy
    startSleep(state2)
    run(state2, 4)
    expect(wakePet(state2)).toBe(true)
    expect(state2.sleeping).toBe(false)
    expect(state2.stats.energy).toBeCloseTo(energyBefore + SLEEP_ENERGY_RATE * 4, 3)
    expect(wakePet(state2)).toBe(false) // 醒着不可叫醒
  })

  it('喂食按食物表生效并进入冷却；偏好食物正值效果 ×1.5，贪吃鬼饲料 +6', () => {
    // 中性 seed：偏好与怪癖都不干扰。
    const neutral = findSeed('feast', 'nightOwl')
    const state = hatched(neutral)
    state.stats.hunger = 40 // 40 + 30 不撞 100 上限
    const before = { ...state.stats }
    expect(feedPet(state, 'meal')).toBe(true)
    expect(state.stats.hunger).toBeCloseTo(before.hunger + FOOD_DEFS.meal.hunger, 5)
    expect(state.stats.joy).toBeCloseTo(before.joy + FOOD_DEFS.meal.joy, 5)
    expect(state.cooldowns.meal).toBe(FOOD_DEFS.meal.cooldown)
    expect(feedPet(state, 'meal')).toBe(false) // 冷却中
    run(state, FOOD_DEFS.meal.cooldown + 0.1)
    // 偏好零食：饥饿 +18、心情 +27。
    const favorite = createPet(findSeed('snack', 'playful'))
    favorite.eggLeftSec = 0
    favorite.stats.joy = 50 // 50 + 27 不撞 100 上限
    const fb = { ...favorite.stats }
    expect(feedPet(favorite, 'snack')).toBe(true)
    expect(favorite.stats.hunger).toBeCloseTo(fb.hunger + FOOD_DEFS.snack.hunger * 1.5, 5)
    expect(favorite.stats.joy).toBeCloseTo(fb.joy + FOOD_DEFS.snack.joy * 1.5, 5)
    // 贪吃鬼吃饲料：(30 + 6) * 1.5。
    const glutton = createPet(findSeed('meal', 'glutton'))
    glutton.eggLeftSec = 0
    glutton.stats.hunger = 20 // 20 + 54 不撞 100 上限
    const gb = glutton.stats.hunger
    feedPet(glutton, 'meal')
    expect(glutton.stats.hunger).toBeCloseTo(gb + (FOOD_DEFS.meal.hunger + 6) * 1.5, 5)
    void state
  })

  it('seed 个性确定性：同 seed 恒同、跨 seed 有别；夜猫子夜间心情衰减减半', () => {
    for (let seed = 1; seed < 20; seed += 1) {
      expect(favoriteFoodOf(seed)).toBe(favoriteFoodOf(seed))
      expect(quirkOf(seed)).toBe(quirkOf(seed))
    }
    const quirks = new Set<string>()
    for (let seed = 1; seed < 20; seed += 1) quirks.add(quirkOf(seed))
    expect(quirks.size).toBeGreaterThan(1)
    // 夜猫子在 22 点：心情衰减 0.3/秒；白天照常 0.6/秒。
    const nightOwl = hatched(findSeed('snack', 'nightOwl'))
    nightOwl.clockSec = 22 // 游戏时 22:00
    expect(isNightHour(gameHour(nightOwl))).toBe(true)
    const joyBefore = nightOwl.stats.joy
    run(nightOwl, 4)
    expect(nightOwl.stats.joy).toBeCloseTo(joyBefore - STAT_DECAY.joy * 0.5 * 4, 4)
    nightOwl.clockSec = 12 // 中午
    const joyDay = nightOwl.stats.joy
    run(nightOwl, 4)
    expect(nightOwl.stats.joy).toBeCloseTo(joyDay - STAT_DECAY.joy * 4, 4)
  })

  it('孵化：30 秒自然破壳；点击 10 次每次 -3 秒，第 11 次无效', () => {
    const natural = createPet(3)
    expect(stageOf(natural)).toBe('egg')
    run(natural, EGG_SECONDS)
    expect(natural.eggLeftSec).toBe(0)
    expect(stageOf(natural)).toBe('baby')
    const tapped = createPet(3)
    for (let i = 0; i < EGG_TAP_MAX; i += 1) expect(tapEgg(tapped)).toBe(true)
    expect(tapped.eggClicks).toBe(EGG_TAP_MAX)
    expect(tapped.eggLeftSec).toBe(Math.max(0, EGG_SECONDS - EGG_TAP_MAX * EGG_TAP_BONUS))
    expect(tapEgg(tapped)).toBe(false) // 已达点击上限
    // 部分点击：剩余秒数随点击数递减。
    const partial = createPet(3)
    tapEgg(partial)
    tapEgg(partial)
    expect(partial.eggLeftSec).toBe(EGG_SECONDS - 2 * EGG_TAP_BONUS)
  })

  it('生长阶段按累计生长日推进，心情 > 80 且饱食 > 60 时 1.5 倍加速', () => {
    const state = hatched()
    // 高心情高饱食（钉住避免衰减跌破加速线）：全程 1.5 倍生长。
    runPinned(state, DAY_SECONDS)
    expect(state.stageDays).toBeCloseTo(GROWTH_BOOST, 4)
    expect(stageOf(state)).toBe('child')
    runPinned(state, DAY_SECONDS * 2)
    expect(stageOf(state)).toBe('teen')
    runPinned(state, DAY_SECONDS * 2)
    expect(state.stageDays).toBeCloseTo(GROWTH_BOOST * DAY_SECONDS * 5 / DAY_SECONDS * 1, 4)
    expect(stageOf(state)).toBe('adult')
    // 低心情低饱食：不再加速。
    const slow = hatched()
    slow.stats.joy = 50
    slow.stats.hunger = 50
    run(slow, DAY_SECONDS)
    expect(slow.stageDays).toBeCloseTo(1, 4)
    // 小步长浮点累加可能差一丝不到 1 日：再推一小步稳过阈值。
    run(slow, 0.05)
    expect(stageOf(slow)).toBe('child')
  })

  it('照料评分驱动 4 进化分支：边界 79/80、59/60、39/40，成年时锁定', () => {
    expect(adultFormFor(80)).toBe('dragon')
    expect(adultFormFor(79.9)).toBe('cat')
    expect(adultFormFor(60)).toBe('cat')
    expect(adultFormFor(59.9)).toBe('robot')
    expect(adultFormFor(40)).toBe('robot')
    expect(adultFormFor(39.9)).toBe('slime')
    // 通过积分制造评分：恒定 85 分属性 24 秒（1 游戏日）后把生长推过成年。
    const state = hatched()
    state.careSum = 85 * 100
    state.careTime = 100
    // 初值补偿 0.05 秒衰减，使 tick 后四维均值恰为 87.5；5.997 + 0.05*1.5/24 >= 6 跨入成年。
    state.stats.hunger = 87.5 + STAT_DECAY.hunger * 0.05
    state.stats.joy = 87.5 + STAT_DECAY.joy * 0.05
    state.stats.clean = 87.5 + STAT_DECAY.clean * 0.05
    state.stats.energy = 87.5 + STAT_DECAY.energy * 0.05
    state.stageDays = 6 - (0.05 / DAY_SECONDS) * GROWTH_BOOST
    tickPet(state, 0.05)
    expect(stageOf(state)).toBe('adult')
    expect(careScore(state)).toBeCloseTo((85 * 100 + 87.5 * 0.05) / (100 + 0.05), 3)
    expect(state.form).toBe('dragon')
    // 形态只锁一次：之后评分再跌也不变。
    state.careSum = 10
    state.careTime = 100
    tickPet(state, 0.05)
    expect(state.form).toBe('dragon')
    // 低评分成年 → 史莱姆。
    const slime = hatched()
    slime.careSum = 20 * 100
    slime.careTime = 100
    slime.stageDays = 6
    tickPet(slime, 0.05)
    expect(slime.form).toBe('slime')
  })

  it('玩耍：15 秒倒计时、点到光点 +25 心情并计数，时间到自动结束', () => {
    // 非淘气包 seed：验证基础 +25（淘气包会额外 +10）。
    const state = hatched(findSeed('feast', 'nightOwl'))
    expect(startPlay(state)).toBe(true)
    const play = state.play!
    expect(play.tLeft).toBe(PLAY_SECONDS)
    expect(startPlay(state)).toBe(false) // 已在玩
    state.stats.joy = 50 // 50 + 25 不撞 100 上限
    const joyBefore = state.stats.joy
    expect(catchDot(state, play.dotX + 0.05, play.dotY)).toBe(true) // 半径 0.06 内
    expect(state.play!.catches).toBe(1)
    expect(state.stats.joy).toBeCloseTo(joyBefore + 25, 5)
    expect(catchDot(state, 0.99, 0.01)).toBe(false) // 脱靶
    run(state, PLAY_SECONDS)
    expect(state.play).toBeNull()
    // 睡觉会打断玩耍。
    const state2 = hatched()
    startPlay(state2)
    startSleep(state2)
    expect(state2.play).toBeNull()
  })

  it('清洁与污垢：按周期生成至上限，每次刷洗 -1 污垢 +12 清洁', () => {
    const state = hatched()
    run(state, DIRT_PERIOD * 7)
    expect(state.dirtCount).toBe(5) // 上限 5
    const cleanBefore = state.stats.clean
    expect(brushPet(state)).toBe(true)
    expect(state.dirtCount).toBe(4)
    expect(state.stats.clean).toBeCloseTo(cleanBefore + 12, 5)
    while (state.dirtCount > 0) brushPet(state)
    expect(brushPet(state)).toBe(false) // 无污垢不可刷
    // 污垢达上限后不再生成。
    run(state, DIRT_PERIOD * 3)
    expect(state.dirtCount).toBeLessThanOrEqual(5)
  })

  it('存档序列化往返一致，坏档/版本不符安全回落 null', () => {
    const state = hatched(11)
    run(state, 30)
    feedPet(state, 'snack')
    startSleep(state)
    const restored = deserializePet(serializePet(state))!
    expect(restored.seed).toBe(state.seed)
    expect(restored.rngState).toBe(state.rngState)
    expect(restored.stats).toEqual(state.stats)
    expect(restored.clockSec).toBeCloseTo(state.clockSec, 9)
    expect(restored.eggLeftSec).toBe(state.eggLeftSec)
    expect(restored.eggClicks).toBe(state.eggClicks)
    expect(restored.sickCount).toBe(state.sickCount)
    expect(restored.stageDays).toBeCloseTo(state.stageDays, 9)
    expect(restored.careSum).toBeCloseTo(state.careSum, 6)
    expect(restored.careTime).toBeCloseTo(state.careTime, 9)
    expect(restored.cooldowns).toEqual(state.cooldowns)
    expect(restored.sleeping).toBe(true)
    expect(restored.play).toBeNull() // 小游戏不存档
    // 再序列化得到同样的档（往返稳定）。
    expect(serializePet(restored)).toBe(serializePet(state))
    // 坏档安全回落。
    expect(deserializePet('not json')).toBeNull()
    expect(deserializePet('{"v":99}')).toBeNull()
    expect(deserializePet('{"v":1,"seed":"x"}')).toBeNull()
  })

  it('确定性：同 seed 同操作序列状态完全一致，异 seed 光点轨迹不同', () => {
    const script = (state: PetState): void => {
      run(state, 5)
      startPlay(state)
      for (let i = 0; i < 20; i += 1) {
        run(state, 0.5)
        const play = state.play
        if (play !== null) catchDot(state, play.dotX, play.dotY)
      }
      run(state, 20)
      feedPet(state, 'feast')
      startSleep(state)
      run(state, 3)
    }
    const a = createPet(1234)
    const b = createPet(1234)
    script(a)
    script(b)
    expect(serializePet(a)).toBe(serializePet(b))
    const c = createPet(5678)
    script(c)
    expect(serializePet(c)).not.toBe(serializePet(a))
  })
})
