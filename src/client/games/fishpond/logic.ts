/**
 * 鱼塘物语纯逻辑：钓鱼双段判定状态机（力度条锁定 → 浮漂等咬钩 → 提竿时机）、
 * 六品种生长（鱼苗→成鱼 3 阶段按游戏日推进、每日喂食 1 次、连饿 2 天停滞）、
 * RGB 三通道颜色基因（子代逐通道随机取双亲之一 ±小变异并钳制 0-9）、同品种
 * 一公一母成鱼相邻自动繁殖（冷却 2 日、产 1-2 鱼苗入空格）、每日正弦 + seed
 * 噪声的品种独立行情曲线、鱼苗/鱼粮/扩塘商店与 5 关目标（L1 赚 300 → L5 集齐
 * 6 品种并赚 3000）。全部为确定性纯函数：随机走注入 seed 的 mulberry32（市场
 * 噪声走不消耗序列的整数散列），无 DOM、无计时器。
 */

/** 品种 id。 */
export type SpeciesId = 'crucian' | 'guppy' | 'carp' | 'betta' | 'koi' | 'arowana'

/** 鱼的稀有度：决定钓取池分层。 */
export type Tier = 'common' | 'rare' | 'legendary'

/** 一个品种的经济与生长参数。 */
export interface SpeciesSpec {
  /** 中文名。 */
  name: string
  /** 成鱼基准卖价（行情 ×1、颜色 ×1 时）。 */
  base: number
  /** 鱼苗喂到成鱼所需的天数（每天喂 1 次）。 */
  growDays: number
  /** 渲染主色（尾鳍/点缀）。 */
  color: string
  /** 钓取稀有度分层。 */
  tier: Tier
}

/** 六个品种：前 3 种商店有鱼苗、钓取常见；斗鱼/锦鲤稀有；龙鱼传说。 */
export const SPECIES: Record<SpeciesId, SpeciesSpec> = {
  crucian: { name: '鲫鱼', base: 30, growDays: 2, color: '#9aa5b8', tier: 'common' },
  guppy: { name: '孔雀鱼', base: 24, growDays: 2, color: '#7dcfff', tier: 'common' },
  carp: { name: '鲤鱼', base: 42, growDays: 3, color: '#e0af68', tier: 'common' },
  betta: { name: '斗鱼', base: 70, growDays: 3, color: '#bb9af7', tier: 'rare' },
  koi: { name: '锦鲤', base: 110, growDays: 4, color: '#f7768e', tier: 'rare' },
  arowana: { name: '龙鱼', base: 180, growDays: 5, color: '#ff9e64', tier: 'legendary' },
}

/** 图鉴/行情/商店的固定展示顺序。 */
export const SPECIES_ORDER: SpeciesId[] = ['crucian', 'guppy', 'carp', 'betta', 'koi', 'arowana']

/** 一关的目标。 */
export interface FishpondLevel {
  /** 目标金币（金币 ≥ 此值即满足金额条件）。 */
  target: number
  /** 是否额外要求集齐 6 品种。 */
  needAllSpecies: boolean
  /** 目标文案（渲染层直接展示）。 */
  label: string
}

/** 5 关递进：金额目标上涨，终关要求全图鉴。 */
export const LEVELS: FishpondLevel[] = [
  { target: 300, needAllSpecies: false, label: '赚到 300 币' },
  { target: 700, needAllSpecies: false, label: '赚到 700 币' },
  { target: 1200, needAllSpecies: false, label: '赚到 1200 币' },
  { target: 2000, needAllSpecies: false, label: '赚到 2000 币' },
  { target: 3000, needAllSpecies: true, label: '集齐 6 品种并赚到 3000 币' },
]

/** 颜色基因：RGB 三通道各 0-9。 */
export type Genes = [number, number, number]

/** 性别。 */
export type Sex = 'M' | 'F'

/** 一关的初始金币。 */
export const START_COINS = 120
/** 初始鱼粮数。 */
export const START_FOOD = 4
/** 体力上限。 */
export const MAX_ENERGY = 5
/** 每个游戏日回复的体力。 */
export const ENERGY_PER_DAY = 2
/** 初始塘格数。 */
export const BASE_SLOTS = 6
/** 扩塘后的最大格数（3×3）。 */
export const MAX_SLOTS = 9
/** 扩塘各阶段花费（第 7/8/9 格）。 */
export const EXPAND_COSTS = [90, 160, 280]
/** 一份鱼粮的价格与数量。 */
export const FOOD_COST = 6
export const FOOD_PER_BUY = 3
/** 繁殖冷却天数。 */
export const BREED_COOLDOWN_DAYS = 2
/** 单基因通道变异概率。 */
export const MUTATE_CHANCE = 0.18

/** 力度条全程（0→1）扫描秒数。 */
export const POWER_PERIOD_S = 0.85
/** 力度甜区（含端点）：锁定在此区间才抛竿成功。 */
export const POWER_LO = 0.62
export const POWER_HI = 0.92
/** 甜区中心与半宽：力度质量 = 1 - |p - 中心| / 半宽。 */
export const POWER_CENTER = 0.77
export const POWER_HALF = 0.15
/** 咬钩时刻区间：抛竿后 [BITE_MIN_S, BITE_MIN_S + BITE_SPAN_S) 秒。 */
export const BITE_MIN_S = 1.0
export const BITE_SPAN_S = 2.0
/** 错过咬钩后浮漂停留的宽限倍数：超过 biteAt + 半窗 ×3 自动脱钩。 */
export const ESCAPE_GRACE = 3

/** 市场正弦周期（游戏日）。 */
export const PRICE_PERIOD = 7
/** 市场正弦幅度（±30%）。 */
export const PRICE_SWING = 0.3
/** 市场 seed 噪声幅度（±18%）。 */
export const PRICE_NOISE = 0.18
/** 行情倍率上下限。 */
export const MULT_MIN = 0.6
export const MULT_MAX = 1.6

/** 一条塘中鱼。 */
export interface PondFish {
  /** 全局唯一 id（渲染游动相位、繁殖去重用）。 */
  id: number
  species: SpeciesId
  sex: Sex
  genes: Genes
  /** 累计被喂食的天数（驱动大小阶段）。 */
  growthDays: number
  /** 连续未喂食天数（≥2 停滞生长并冒饥饿气泡）。 */
  hungryDays: number
  /** 今天是否已喂（每天每鱼最多 1 次）。 */
  fedToday: boolean
  /** 上次繁殖的游戏日（-1 = 从未，不受冷却限制）。 */
  lastBredDay: number
  /** 所在塘格下标。 */
  slot: number
}

/** 钓鱼状态机：idle → power → wait → result →（确认后）idle。 */
export interface FishingState {
  status: 'idle' | 'power' | 'wait' | 'result'
  /** 力度条当前位置 0..1（ping-pong 往复）。 */
  power: number
  /** 力度条方向。 */
  powerDir: 1 | -1
  /** 力度判定质量 0..1（影响稀有权重）。 */
  quality: number
  /** 抛竿后第几秒咬钩（进入 wait 时由 rng 排定）。 */
  biteAt: number
  /** 进入 wait 以来流逝的秒数。 */
  elapsed: number
  /** 咬钩判定半窗（秒）：随关卡收窄。 */
  halfWindow: number
  /** result 状态下钓到的鱼（尚未入塘）。 */
  pending: PondFish | null
  /** result 状态下的失败原因（成功为空串）。 */
  failReason: '' | 'power' | 'early' | 'late' | 'escape'
}

/** 一局状态。 */
export interface FishpondState {
  phase: 'playing' | 'won'
  /** 0 起的关卡下标。 */
  levelIndex: number
  /** 当前游戏日（1 起）。 */
  day: number
  coins: number
  energy: number
  food: number
  /** 当前塘格数（6-9）。 */
  pondSlots: number
  /** 按行优先排列的塘格（空格为 null）。 */
  pond: (PondFish | null)[]
  /** 图鉴：是否曾经拥有过该品种（入塘即登记）。 */
  collected: Record<SpeciesId, boolean>
  fishing: FishingState
  /** 下一次繁殖/出售涉及的销售确认：塘格下标（-1 无）。 */
  pendingSell: number
  /** 渲染提示文案（动作反馈）。 */
  message: string
  /** 注入的种子（市场散列用）。 */
  seed: number
  /** 下一条鱼的 id。 */
  nextFishId: number
  rng: () => number
}

/**
 * mulberry32 确定性伪随机数发生器（与 farm 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 不消耗 rng 序列的整数散列（种子 + 两个坐标 → [0,1)）：市场逐日噪声用。 */
function hash01(seed: number, a: number, b: number): number {
  let h = (seed ^ Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

/**
 * 某品种在第 day 天的行情倍率：1 ± 30% 正弦（品种独立相位）± 18% seed
 * 噪声（整数散列，不消耗 rng 序列），钳制在 [MULT_MIN, MULT_MAX]。
 * @param species - 品种 id。
 * @param day - 游戏日（1 起）。
 * @param seed - 种子。
 * @returns 当日行情倍率。
 */
export function priceMultiplier(species: SpeciesId, day: number, seed: number): number {
  const idx = SPECIES_ORDER.indexOf(species)
  const phase = idx / SPECIES_ORDER.length + hash01(seed, idx, 777) * 0.5
  const base = 1 + PRICE_SWING * Math.sin(2 * Math.PI * (day / PRICE_PERIOD + phase))
  const noise = (hash01(seed, idx, day) - 0.5) * 2 * PRICE_NOISE
  return Math.min(MULT_MAX, Math.max(MULT_MIN, base + noise))
}

/**
 * 颜色加成：三通道均值映射到 ×1.0 - ×1.5（越鲜艳越贵）。
 * @param genes - 颜色基因。
 * @returns 售价倍率。
 */
export function colorMultiplier(genes: Genes): number {
  return 1 + ((genes[0] + genes[1] + genes[2]) / 27) * 0.5
}

/**
 * 鱼的大小阶段：0 鱼苗 → 1 成长期 → 2 成鱼；由累计喂食天数驱动，
 * 中期阈值 = ceil(growDays / 2)，成鱼阈值 = growDays。
 * @param fish - 塘中鱼。
 * @returns 大小阶段（0-2）。
 */
export function stageOf(fish: PondFish): 0 | 1 | 2 {
  const need = SPECIES[fish.species].growDays
  if (fish.growthDays >= need) return 2
  if (fish.growthDays >= Math.ceil(need / 2)) return 1
  return 0
}

/** 是否停滞生长（连饿 2 天）。 */
export function isStarving(fish: PondFish): boolean {
  return fish.hungryDays >= 2
}

/**
 * 当前关卡下咬钩判定的半窗（秒）：0.55 起步、每关收窄 0.09，最低 0.16。
 * @param levelIndex - 0 起的关卡下标。
 * @returns 半窗秒数。
 */
export function biteHalfWindow(levelIndex: number): number {
  return Math.max(0.16, 0.55 - levelIndex * 0.09)
}

/**
 * 提竿时机判定：elapsed 在咬钩时刻 ±半窗内命中，之前为早、之后为晚。
 * @param elapsed - 抛竿后流逝秒数。
 * @param biteAt - 咬钩时刻。
 * @param halfWindow - 半窗秒数。
 * @returns 判定结果。
 */
export function judgeBite(elapsed: number, biteAt: number, halfWindow: number): 'hit' | 'early' | 'late' {
  if (elapsed < biteAt - halfWindow) return 'early'
  if (elapsed > biteAt + halfWindow) return 'late'
  return 'hit'
}

/** 随机 roll 一组颜色基因（三通道各 0-9）。 */
export function rollGenes(rng: () => number): Genes {
  return [Math.floor(rng() * 10), Math.floor(rng() * 10), Math.floor(rng() * 10)]
}

/**
 * 双亲基因混合：每个通道先随机取父或母，再以小概率 ±1 变异并钳制 0-9。
 * 每通道固定消耗 2-3 次 rng（取亲本 1 次、变异判定 1 次、变异方向 1 次）。
 * @param a - 亲本 A 基因。
 * @param b - 亲本 B 基因。
 * @param rng - 注入的随机源。
 * @returns 子代基因。
 */
export function mixGenes(a: Genes, b: Genes, rng: () => number): Genes {
  const out = [0, 0, 0] as Genes
  for (let i = 0; i < 3; i += 1) {
    let v = rng() < 0.5 ? a[i]! : b[i]!
    if (rng() < MUTATE_CHANCE) {
      v += rng() < 0.5 ? -1 : 1
      v = Math.min(9, Math.max(0, v))
    }
    out[i] = v
  }
  return out
}

/**
 * 按钓取池抽取一条鱼：先按层权重（普通/稀有/传说）定层——力度质量放大
 * 稀有与传说权重——再按层内权重定品种，最后随机性别与颜色基因。
 * @param rng - 注入的随机源。
 * @param quality - 力度质量 0..1。
 * @param id - 鱼 id。
 * @returns 新钓到的鱼（鱼苗阶段）。
 */
export function rollFish(rng: () => number, quality: number, id: number): PondFish {
  const qf = 0.6 + 0.8 * Math.max(0, Math.min(1, quality))
  const tiers: { tier: Tier, weight: number }[] = [
    { tier: 'common', weight: 70 },
    { tier: 'rare', weight: 24 * qf },
    { tier: 'legendary', weight: 6 * qf },
  ]
  let roll = rng() * (tiers[0]!.weight + tiers[1]!.weight + tiers[2]!.weight)
  let tier: Tier = 'common'
  for (const t of tiers) {
    if (roll < t.weight) { tier = t.tier; break }
    roll -= t.weight
  }
  const pool: { species: SpeciesId, weight: number }[] = tier === 'common'
    ? [{ species: 'crucian', weight: 4 }, { species: 'guppy', weight: 3 }, { species: 'carp', weight: 3 }]
    : tier === 'rare'
      ? [{ species: 'betta', weight: 3 }, { species: 'koi', weight: 2 }]
      : [{ species: 'arowana', weight: 1 }]
  let pick = rng() * pool.reduce((sum, p) => sum + p.weight, 0)
  let species: SpeciesId = pool[0]!.species
  for (const p of pool) {
    if (pick < p.weight) { species = p.species; break }
    pick -= p.weight
  }
  return {
    id,
    species,
    sex: rng() < 0.5 ? 'M' : 'F',
    genes: rollGenes(rng),
    growthDays: 0,
    hungryDays: 0,
    fedToday: false,
    lastBredDay: -1,
    slot: -1,
  }
}

/** 建一条指定品种的鱼（商店鱼苗/测试用），基因由 rng 随机。 */
export function makeFish(id: number, species: SpeciesId, rng: () => number): PondFish {
  return {
    id,
    species,
    sex: rng() < 0.5 ? 'M' : 'F',
    genes: rollGenes(rng),
    growthDays: 0,
    hungryDays: 0,
    fedToday: false,
    lastBredDay: -1,
    slot: -1,
  }
}

/** 空闲塘格下标（行优先第一个空格）。 */
export function firstEmptySlot(state: FishpondState): number {
  for (let i = 0; i < state.pondSlots; i += 1) {
    if (state.pond[i] === null || state.pond[i] === undefined) return i
  }
  return -1
}

/**
 * 创建一局初始状态：开局一公一母两条鲫鱼苗与 4 份鱼粮，塘 6 格。
 * @param seed - 注入的随机种子，同种子逐局可复现。
 * @param levelIndex - 0 起的关卡下标（越界钳制）。
 * @returns 就绪的 FishpondState（phase='playing'）。
 */
export function createFishpondState(seed: number, levelIndex = 0): FishpondState {
  const idx = Math.min(LEVELS.length - 1, Math.max(0, levelIndex))
  const rng = mulberry32(seed)
  const male = makeFish(1, 'crucian', rng)
  male.sex = 'M'
  male.slot = 0
  const female = makeFish(2, 'crucian', rng)
  female.sex = 'F'
  female.slot = 1
  const pond: (PondFish | null)[] = [male, female]
  while (pond.length < BASE_SLOTS) pond.push(null)
  return {
    phase: 'playing',
    levelIndex: idx,
    day: 1,
    coins: START_COINS,
    energy: MAX_ENERGY,
    food: START_FOOD,
    pondSlots: BASE_SLOTS,
    pond,
    collected: {
      crucian: true, guppy: false, carp: false,
      betta: false, koi: false, arowana: false,
    },
    fishing: {
      status: 'idle', power: 0, powerDir: 1, quality: 0,
      biteAt: 0, elapsed: 0, halfWindow: biteHalfWindow(idx),
      pending: null, failReason: '',
    },
    pendingSell: -1,
    message: '喂鱼、钓鱼、等好价钱——鱼塘物语开始了',
    seed: seed >>> 0,
    nextFishId: 3,
    rng,
  }
}

/** 是否集齐 6 品种。 */
export function allSpeciesCollected(state: FishpondState): boolean {
  return SPECIES_ORDER.every(s => state.collected[s])
}

/**
 * 关卡目标判定：金额达标（终关还需集齐 6 品种）即 phase='won'。
 * 在金币增加或新品种入塘后调用。
 * @param state - 游戏状态，原地更新。
 */
export function checkLevelGoal(state: FishpondState): void {
  if (state.phase !== 'playing') return
  const level = LEVELS[state.levelIndex]!
  if (state.coins < level.target) return
  if (level.needAllSpecies && !allSpeciesCollected(state)) return
  state.phase = 'won'
}

/** 过关后进入下一关（保留塘、金币与图鉴；终关不再推进）。 */
export function nextLevel(state: FishpondState): void {
  if (state.phase !== 'won' || state.levelIndex >= LEVELS.length - 1) return
  state.levelIndex += 1
  state.phase = 'playing'
  state.message = '第 ' + (state.levelIndex + 1) + ' 关目标：' + LEVELS[state.levelIndex]!.label
}

/** 钓鱼的当前结果是否成功（result 状态下查询）。 */
export function fishingSucceeded(fishing: FishingState): boolean {
  return fishing.status === 'result' && fishing.pending !== null
}

/**
 * 开始一次抛竿：消耗 1 体力进入力度扫描。体力不足或状态机未空闲返回 false。
 * @param state - 游戏状态，原地更新。
 * @returns 是否成功进入力度扫描。
 */
export function beginCast(state: FishpondState): boolean {
  if (state.phase !== 'playing') return false
  const f = state.fishing
  if (f.status !== 'idle') return false
  if (state.energy <= 0) {
    state.message = '体力不足——结束今天可以回复体力'
    return false
  }
  state.energy -= 1
  f.status = 'power'
  f.power = 0
  f.powerDir = 1
  f.pending = null
  f.failReason = ''
  state.message = '力度条往复——在亮色区点击锁定！'
  return true
}

/**
 * 推进力度条 ping-pong 扫描（index 层按 dt 驱动）。
 * @param state - 游戏状态，原地更新。
 * @param dt - 秒。
 */
export function tickPower(state: FishpondState, dt: number): void {
  const f = state.fishing
  if (f.status !== 'power') return
  f.power += f.powerDir * (dt / POWER_PERIOD_S)
  if (f.power >= 1) { f.power = 1; f.powerDir = -1 }
  if (f.power <= 0) { f.power = 0; f.powerDir = 1 }
}

/** 力度判定失败收尾（内部）。 */
function failCast(state: FishpondState, reason: FishingState['failReason'], message: string): void {
  const f = state.fishing
  f.status = 'result'
  f.pending = null
  f.failReason = reason
  state.message = message
}

/**
 * 锁定力度：在甜区内排定咬钩时刻进入等待；区外线断，立即失败（体力已扣）。
 * @param state - 游戏状态，原地更新。
 * @returns 是否抛竿成功（进入等待咬钩）。
 */
export function lockPower(state: FishpondState): boolean {
  const f = state.fishing
  if (f.status !== 'power') return false
  const p = f.power
  if (p < POWER_LO || p > POWER_HI) {
    failCast(state, 'power', '力度没控制好，鱼线断了……再试一次（耗 1 体力）')
    return false
  }
  f.quality = 1 - Math.abs(p - POWER_CENTER) / POWER_HALF
  f.status = 'wait'
  f.biteAt = BITE_MIN_S + state.rng() * BITE_SPAN_S
  f.elapsed = 0
  f.halfWindow = biteHalfWindow(state.levelIndex)
  state.message = '浮漂下沉的一瞬提竿！'
  return true
}

/**
 * 推进等咬钩时间：超过咬钩时刻 + 半窗 ×宽限仍不提竿，鱼自动脱钩。
 * @param state - 游戏状态，原地更新。
 * @param dt - 秒。
 */
export function tickWait(state: FishpondState, dt: number): void {
  const f = state.fishing
  if (f.status !== 'wait') return
  f.elapsed += dt
  if (f.elapsed > f.biteAt + f.halfWindow * ESCAPE_GRACE) {
    failCast(state, 'escape', '鱼咬钩后脱钩逃走了……')
  }
}

/**
 * 提竿：按 judgeBite 判定时机；命中则从钓取池抽鱼进入 result，
 * 早/晚都失败（体力已扣，可重试）。
 * @param state - 游戏状态，原地更新。
 * @returns 判定结果。
 */
export function strike(state: FishpondState): 'caught' | 'early' | 'late' | 'not-casting' {
  const f = state.fishing
  if (f.status !== 'wait') return 'not-casting'
  const judged = judgeBite(f.elapsed, f.biteAt, f.halfWindow)
  if (judged === 'early') {
    failCast(state, 'early', '提竿太早，鱼受惊跑了')
    return 'early'
  }
  if (judged === 'late') {
    failCast(state, 'late', '提竿太慢，鱼吐钩跑了')
    return 'late'
  }
  const fish = rollFish(state.rng, f.quality, state.nextFishId)
  state.nextFishId += 1
  f.status = 'result'
  f.pending = fish
  f.failReason = ''
  state.message = '钓到了 ' + SPECIES[fish.species].name + '！'
  return 'caught'
}

/**
 * 确认钓鱼结果：钓到的鱼放入第一个空格并登记图鉴（满塘则放生）；
 * 失败结果直接收杆。状态机回到 idle。
 * @param state - 游戏状态，原地更新。
 * @returns 钓到的鱼是否成功入塘。
 */
export function acknowledgeResult(state: FishpondState): boolean {
  const f = state.fishing
  if (f.status !== 'result') return false
  const fish = f.pending
  f.status = 'idle'
  f.pending = null
  if (fish === null) return false
  const slot = firstEmptySlot(state)
  if (slot < 0) {
    state.message = '鱼塘满了，' + SPECIES[fish.species].name + '被放生了'
    return false
  }
  fish.slot = slot
  state.pond[slot] = fish
  if (!state.collected[fish.species]) {
    state.collected[fish.species] = true
    state.message = '新品种入图鉴：' + SPECIES[fish.species].name + '！'
  }
  checkLevelGoal(state)
  return true
}

/**
 * 当前卖出一条成鱼的实收价：基准价 × 当日行情 × 颜色加成 × 阶段倍率。
 * @param state - 游戏状态。
 * @param fish - 待估价的鱼。
 * @returns 取整后的卖价（鱼苗/成长期也有估价，但仅成鱼可卖）。
 */
export function sellPrice(state: FishpondState, fish: PondFish): number {
  const stage = stageOf(fish)
  const stageMult = stage === 2 ? 1 : stage === 1 ? 0.7 : 0.4
  const raw = SPECIES[fish.species].base
    * priceMultiplier(fish.species, state.day, state.seed)
    * colorMultiplier(fish.genes)
    * stageMult
  return Math.max(1, Math.round(raw))
}

/** 塘内点击结果（渲染层给粒子/提示）。 */
export type PondClickResult =
  | 'fed' | 'already-fed' | 'no-food'
  | 'sell-pending' | 'sold'
  | 'empty' | 'none'

/**
 * 点击塘格的语境化动作：幼鱼（鱼苗/成长期）→ 喂食（每天 1 次、耗 1 鱼粮）；
 * 成鱼 → 第一次点击挂起出售确认，再点一次卖出并按当日行情入账。
 * @param state - 游戏状态，原地更新。
 * @param slot - 塘格下标（越界/空格返回 'empty'）。
 * @returns 动作结果。
 */
export function pondClick(state: FishpondState, slot: number): PondClickResult {
  if (state.phase !== 'playing') return 'none'
  const fish = state.pond[slot]
  if (slot < 0 || slot >= state.pondSlots || fish === null || fish === undefined) {
    state.pendingSell = -1
    return 'empty'
  }
  if (stageOf(fish) < 2) {
    if (fish.fedToday) {
      state.message = SPECIES[fish.species].name + '今天已经喂过了'
      return 'already-fed'
    }
    if (state.food <= 0) {
      state.message = '鱼粮不够了——去市场买一点'
      return 'no-food'
    }
    state.food -= 1
    fish.fedToday = true
    state.message = '喂了 ' + SPECIES[fish.species].name + '（今天还能长一截）'
    return 'fed'
  }
  if (state.pendingSell === slot) {
    const price = sellPrice(state, fish)
    state.coins += price
    state.pond[slot] = null
    state.pendingSell = -1
    state.message = '卖出 ' + SPECIES[fish.species].name + '，入账 ' + price + ' 币'
    checkLevelGoal(state)
    return 'sold'
  }
  state.pendingSell = slot
  state.message = '再点一次以 ' + sellPrice(state, fish) + ' 币卖出这条' + SPECIES[fish.species].name
  return 'sell-pending'
}

/** 商店鱼苗价（基准价的一半，取整至少 1）。 */
export function fryCost(species: SpeciesId): number {
  return Math.max(1, Math.round(SPECIES[species].base * 0.5))
}

/** 当前扩塘花费（满塘或无后续档位返回 -1）。 */
export function expansionCost(state: FishpondState): number {
  const step = state.pondSlots - BASE_SLOTS
  if (step < 0 || step >= EXPAND_COSTS.length) return -1
  return EXPAND_COSTS[step]!
}

/**
 * 买鱼苗：扣款放入第一个空格并登记图鉴。
 * @param state - 游戏状态，原地更新。
 * @param species - 品种 id（仅限商店 3 种常见鱼）。
 * @returns 是否购买成功。
 */
export function buyFry(state: FishpondState, species: SpeciesId): boolean {
  if (state.phase !== 'playing') return false
  if (SPECIES[species].tier !== 'common') return false
  const slot = firstEmptySlot(state)
  if (slot < 0) return false
  const cost = fryCost(species)
  if (state.coins < cost) return false
  state.coins -= cost
  const fish = makeFish(state.nextFishId, species, state.rng)
  state.nextFishId += 1
  fish.slot = slot
  state.pond[slot] = fish
  if (!state.collected[species]) {
    state.collected[species] = true
    state.message = '新品种入图鉴：' + SPECIES[species].name + '！'
  } else {
    state.message = '买了 ' + SPECIES[species].name + ' 鱼苗'
  }
  return true
}

/**
 * 买一份鱼粮。
 * @param state - 游戏状态，原地更新。
 * @returns 是否购买成功。
 */
export function buyFood(state: FishpondState): boolean {
  if (state.phase !== 'playing') return false
  if (state.coins < FOOD_COST) return false
  state.coins -= FOOD_COST
  state.food += FOOD_PER_BUY
  state.message = '买了 ' + FOOD_PER_BUY + ' 份鱼粮'
  return true
}

/**
 * 扩塘一格（6 → 9 封顶，逐格涨价）。
 * @param state - 游戏状态，原地更新。
 * @returns 是否扩建成功。
 */
export function buyExpansion(state: FishpondState): boolean {
  if (state.phase !== 'playing') return false
  const cost = expansionCost(state)
  if (cost < 0 || state.coins < cost) return false
  state.coins -= cost
  state.pond.push(null)
  state.pondSlots += 1
  state.message = '鱼塘扩大到 ' + state.pondSlots + ' 格'
  return true
}

/** 塘格的正交邻居（3 列网格，越界与未扩建格不计）。 */
export function slotNeighbors(slot: number, slots: number): number[] {
  const cols = 3
  const rows = Math.ceil(slots / cols)
  const r = Math.floor(slot / cols)
  const c = slot % cols
  const out: number[] = []
  if (r > 0) out.push(slot - cols)
  if (r < rows - 1 && slot + cols < slots) out.push(slot + cols)
  if (c > 0) out.push(slot - 1)
  if (c < cols - 1 && slot + 1 < slots) out.push(slot + 1)
  return out
}

/**
 * 繁殖配对检查：两条成鱼同品种、异性、相邻，且双方都已过冷却期。
 * @param a - 鱼 A。
 * @param b - 鱼 B。
 * @param day - 当前游戏日。
 * @returns 是否可繁殖。
 */
export function canBreed(a: PondFish, b: PondFish, day: number): boolean {
  if (stageOf(a) !== 2 || stageOf(b) !== 2) return false
  if (a.species !== b.species || a.sex === b.sex) return false
  for (const fish of [a, b]) {
    if (fish.lastBredDay >= 0 && day - fish.lastBredDay < BREED_COOLDOWN_DAYS) return false
  }
  return true
}

/**
 * 结束今天：逐鱼结算生长（喂过的 +1 天并清零饥饿，没喂的累计饥饿）→
 * 自动繁殖（产 1-2 条混合基因鱼苗入空格、双方进入冷却）→ 回复体力 →
 * 翻到新的一天并刷新行情。随机只走 rng，逐日可重放。
 * @param state - 游戏状态，原地更新。
 */
export function nextDay(state: FishpondState): void {
  if (state.phase !== 'playing') return
  // 跨日取消进行中的抛竿（力度/等待/结果态一并复位）——否则半途翻日
  // 留下悬空状态机，钓点视图再也点不出新动作。
  state.fishing.status = 'idle'
  state.fishing.pending = null
  state.fishing.failReason = ''
  for (const fish of state.pond) {
    if (fish === null || fish === undefined) continue
    if (fish.fedToday) {
      fish.growthDays += 1
      fish.hungryDays = 0
    } else {
      fish.hungryDays += 1
    }
    fish.fedToday = false
  }
  const notes: string[] = []
  const bredToday = new Set<number>()
  for (let i = 0; i < state.pondSlots; i += 1) {
    const a = state.pond[i]
    if (a === null || a === undefined) continue
    if (bredToday.has(a.id) || stageOf(a) !== 2) continue
    for (const n of slotNeighbors(i, state.pondSlots)) {
      const b = state.pond[n]
      if (b === null || b === undefined) continue
      if (bredToday.has(b.id) || !canBreed(a, b, state.day)) continue
      if (!slotNeighbors(n, state.pondSlots).includes(i)) continue
      const count = 1 + (state.rng() < 0.5 ? 1 : 0)
      let born = 0
      for (let k = 0; k < count; k += 1) {
        const slot = firstEmptySlot(state)
        if (slot < 0) break
        const fry: PondFish = {
          id: state.nextFishId,
          species: a.species,
          sex: state.rng() < 0.5 ? 'M' : 'F',
          genes: mixGenes(a.genes, b.genes, state.rng),
          growthDays: 0,
          hungryDays: 0,
          fedToday: false,
          lastBredDay: -1,
          slot,
        }
        state.nextFishId += 1
        fry.slot = slot
        state.pond[slot] = fry
        born += 1
      }
      a.lastBredDay = state.day
      b.lastBredDay = state.day
      bredToday.add(a.id)
      bredToday.add(b.id)
      if (born > 0) notes.push(SPECIES[a.species].name + ' ×' + born)
      break
    }
  }
  state.energy = Math.min(MAX_ENERGY, state.energy + ENERGY_PER_DAY)
  state.pendingSell = -1
  state.day += 1
  const starving = state.pond.some(f => f !== null && f !== undefined && isStarving(f))
  let message = ''
  if (notes.length > 0) message = '新生命降生：' + notes.join('、') + '！ '
  if (starving) message += '有鱼饿坏了（连饿 2 天停止生长）'
  state.message = message === '' ? '第 ' + state.day + ' 天，行情已刷新' : message
}
