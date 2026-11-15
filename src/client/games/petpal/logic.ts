/**
 * 电子宠物 PetPal 的纯逻辑内核：加速时钟、四维属性衰减、生病/死亡
 * 状态机、生长阶段与进化判定、喂食/玩耍/清洁/睡觉交互、seed 个性，
 * 以及 localStorage 存档的序列化往返。全部随机经状态内的 mulberry32
 * 寄存器推进，相同 seed + 相同操作序列 = 完全相同的状态（可重放）。
 *
 * 时间约定：1 现实秒 = 1 游戏分钟，1 游戏日 = 24 现实秒；离线期间
 * 不结算属性（读档后从离开时的状态继续）。
 */

/** 1 游戏日对应的现实秒数（24 游戏分钟）。 */
export const DAY_SECONDS = 24
/** 蛋孵化所需现实秒。 */
export const EGG_SECONDS = 30
/** 蛋壳最多可点击加速的次数。 */
export const EGG_TAP_MAX = 10
/** 每次点击蛋壳减少的孵化秒数。 */
export const EGG_TAP_BONUS = 3
/** 生病次数上限：达到即离世。 */
export const SICK_LIMIT = 3
/** 生病后该属性回升到的保底值（避免同一 tick 反复触发）。 */
export const SICK_RESCUE = 25
/** 一觉的最长现实秒（到时自动醒来）。 */
export const SLEEP_SECONDS = 10
/** 睡眠时精力回复速率（点/现实秒）。 */
export const SLEEP_ENERGY_RATE = 4
/** 玩耍小游戏时长（现实秒）。 */
export const PLAY_SECONDS = 15
/** 清醒时每隔多少秒生成一个污垢点。 */
export const DIRT_PERIOD = 18
/** 身上污垢点上限。 */
export const DIRT_MAX = 5
/** 心情 > 80 且饱食 > 60 时的生长加速倍率。 */
export const GROWTH_BOOST = 1.5

/** 四维属性每秒衰减速率（清醒时；睡眠时冻结）。 */
export const STAT_DECAY = {
  hunger: 0.8,
  joy: 0.6,
  clean: 0.25,
  energy: 0.15,
} as const

/** 生长阶段（累计生长日数阈值：baby 0 / child 1 / teen 3 / adult 6）。 */
export type StageId = 'egg' | 'baby' | 'child' | 'teen' | 'adult'

/** 成年形态的 4 种进化分支。 */
export type AdultForm = 'dragon' | 'cat' | 'robot' | 'slime'

/** 三种食物。 */
export const FOOD_IDS = ['meal', 'snack', 'feast'] as const
export type FoodId = (typeof FOOD_IDS)[number]

/** 食物的中文名。 */
export const FOOD_NAMES: Record<FoodId, string> = { meal: '饲料', snack: '零食', feast: '盛宴' }

/** 怪癖集合。 */
export const QUIRK_IDS = ['nightOwl', 'glutton', 'sleepyhead', 'playful'] as const
export type QuirkId = (typeof QUIRK_IDS)[number]

/** 怪癖的中文名。 */
export const QUIRK_NAMES: Record<QuirkId, string> = {
  nightOwl: '夜猫子',
  glutton: '贪吃鬼',
  sleepyhead: '贪睡虫',
  playful: '淘气包',
}

/** 成年形态的中文名。 */
export const FORM_NAMES: Record<AdultForm, string> = {
  dragon: '闪光龙',
  cat: '灵猫',
  robot: '机械兽',
  slime: '史莱姆',
}

/** 四维属性（0-100，上限 100）。 */
export interface PetStats {
  hunger: number
  joy: number
  clean: number
  energy: number
}

/** 一种食物的效果定义：正值在偏好命中时乘以 1.5，负值不乘。 */
export interface FoodDef {
  hunger: number
  joy: number
  clean: number
  energy: number
  cooldown: number
}

/** 食物效果表。 */
export const FOOD_DEFS: Record<FoodId, FoodDef> = {
  meal: { hunger: 30, joy: -5, clean: 0, energy: 0, cooldown: 3 },
  snack: { hunger: 12, joy: 18, clean: 0, energy: 0, cooldown: 5 },
  feast: { hunger: 30, joy: 20, clean: 15, energy: 10, cooldown: 60 },
}

/** 进行中的追逐光点小游戏（坐标为场地内归一化 0-1）。 */
export interface PlaySession {
  tLeft: number
  catches: number
  dotX: number
  dotY: number
  targetX: number
  targetY: number
}

/** 宠物完整状态（可序列化字段全部进存档）。 */
export interface PetState {
  /** 个性种子。 */
  seed: number
  /** mulberry32 寄存器（推进即消耗随机数，可序列化保确定性）。 */
  rngState: number
  stats: PetStats
  /** 累计现实秒（= 累计游戏分钟）。 */
  clockSec: number
  /** 剩余孵化秒；> 0 表示仍在蛋中。 */
  eggLeftSec: number
  /** 已点击蛋壳次数。 */
  eggClicks: number
  /** 累计生病次数。 */
  sickCount: number
  /** 离世后 tick 与交互全部冻结。 */
  dead: boolean
  sleeping: boolean
  /** 本次睡眠已进行的秒数。 */
  sleepSec: number
  /** 身上污垢点数。 */
  dirtCount: number
  /** 生成下一个污垢点的计时器。 */
  dirtTimer: number
  /** 累计生长日数（心情 > 80 且饱食 > 60 时加速 1.5 倍）。 */
  stageDays: number
  /** 四维时间加权和（careSum / careTime = careScore）。 */
  careSum: number
  /** 参与照料评分累计的现实秒。 */
  careTime: number
  /** 进入成年时锁定的进化形态。 */
  form: AdultForm | null
  /** 进行中的玩耍小游戏；null 表示未在玩耍。 */
  play: PlaySession | null
  /** 各食物剩余冷却秒。 */
  cooldowns: Record<FoodId, number>
}

/** mulberry32 的独立流形式（供纯函数按 seed 取样个性）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 推进状态内的随机寄存器并返回 0-1 均匀随机数。 */
export function nextRandom(state: PetState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) | 0
  let t = Math.imul(state.rngState ^ (state.rngState >>> 15), 1 | state.rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** 按 seed 确定偏好食物（稳定、与状态内的随机流无关）。 */
export function favoriteFoodOf(seed: number): FoodId {
  return FOOD_IDS[Math.floor(mulberry32(seed)() * FOOD_IDS.length)]!
}

/** 按 seed 确定怪癖（稳定、与状态内的随机流无关）。 */
export function quirkOf(seed: number): QuirkId {
  return QUIRK_IDS[Math.floor(mulberry32(seed ^ 0x51ab3d)() * QUIRK_IDS.length)]!
}

/** 当前游戏时刻（0-23 的游戏小时；1 现实秒 = 1 游戏小时）。 */
export function gameHour(state: PetState): number {
  return Math.floor(state.clockSec % DAY_SECONDS)
}

/** 该游戏小时是否属于夜晚（20:00-06:00）。 */
export function isNightHour(hour: number): boolean {
  return hour >= 20 || hour < 6
}

/** 创建一只新宠物（从蛋开始）。 */
export function createPet(seed: number): PetState {
  return {
    seed: seed | 0,
    rngState: (seed ^ 0x9e3779b9) | 0,
    stats: { hunger: 80, joy: 80, clean: 90, energy: 90 },
    clockSec: 0,
    eggLeftSec: EGG_SECONDS,
    eggClicks: 0,
    sickCount: 0,
    dead: false,
    sleeping: false,
    sleepSec: 0,
    dirtCount: 0,
    dirtTimer: 0,
    stageDays: 0,
    careSum: 0,
    careTime: 0,
    form: null,
    play: null,
    cooldowns: { meal: 0, snack: 0, feast: 0 },
  }
}

/** 数值钳制到 [0, 100]。 */
function clampStat(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v
}

/** 当前生长阶段（由剩余孵化秒与累计生长日数推导，无独立状态）。 */
export function stageOf(state: PetState): StageId {
  if (state.eggLeftSec > 0) return 'egg'
  if (state.stageDays < 1) return 'baby'
  if (state.stageDays < 3) return 'child'
  if (state.stageDays < 6) return 'teen'
  return 'adult'
}

/** 照料评分：四维均值对时间积分的时间加权平均（无记录时满分 100）。 */
export function careScore(state: PetState): number {
  return state.careTime > 0 ? state.careSum / state.careTime : 100
}

/** 照料评分 → 成年进化形态（边界 80/60/40，左闭区间取高档）。 */
export function adultFormFor(score: number): AdultForm {
  if (score >= 80) return 'dragon'
  if (score >= 60) return 'cat'
  if (score >= 40) return 'robot'
  return 'slime'
}

/** 生病一次：计数 +1、该属性回保底值；满 3 次离世。 */
function sickOnce(state: PetState, key: keyof PetStats): void {
  state.sickCount += 1
  state.stats[key] = SICK_RESCUE
  if (state.sickCount >= SICK_LIMIT) {
    state.dead = true
    state.sleeping = false
    state.play = null
  }
}

/**
 * 推进一帧模拟。dt 为现实秒（调用方保证为小步长；帧调度器已钳制）。
 * 死亡后为空操作；蛋期只走孵化倒计时；睡眠只回精力并冻结其余三维；
 * 清醒时四维衰减 + 生长/照料积分 + 污垢生成，单帧至多触发一次生病。
 */
export function tickPet(state: PetState, dtSec: number): void {
  if (state.dead || dtSec <= 0) return
  state.clockSec += dtSec
  for (const food of FOOD_IDS) {
    if (state.cooldowns[food] > 0) state.cooldowns[food] = Math.max(0, state.cooldowns[food] - dtSec)
  }
  // 蛋期：只孵化，属性冻结。
  if (state.eggLeftSec > 0) {
    state.eggLeftSec = Math.max(0, state.eggLeftSec - dtSec)
    return
  }
  // 睡眠：精力回升，其余三维冻结，到时自动醒来。
  if (state.sleeping) {
    state.stats.energy = clampStat(state.stats.energy + SLEEP_ENERGY_RATE * dtSec)
    state.sleepSec += dtSec
    // 浮点累加误差容差：名义上睡满 SLEEP_SECONDS 秒即算到时（小步长多次相加可能略小于阈值）。
    if (state.sleepSec >= SLEEP_SECONDS - 1e-6) state.sleeping = false
    return
  }
  // 清醒：四维衰减（夜猫子夜间心情衰减减半）。
  const night = isNightHour(gameHour(state))
  const joyRate = night && quirkOf(state.seed) === 'nightOwl' ? STAT_DECAY.joy * 0.5 : STAT_DECAY.joy
  state.stats.hunger = clampStat(state.stats.hunger - STAT_DECAY.hunger * dtSec)
  state.stats.joy = clampStat(state.stats.joy - joyRate * dtSec)
  state.stats.clean = clampStat(state.stats.clean - STAT_DECAY.clean * dtSec)
  state.stats.energy = clampStat(state.stats.energy - STAT_DECAY.energy * dtSec)
  // 生长：心情 > 80 且饱食 > 60 时加速。
  const boost = state.stats.joy > 80 && state.stats.hunger > 60 ? GROWTH_BOOST : 1
  state.stageDays += (dtSec / DAY_SECONDS) * boost
  // 照料评分的时间积分。
  const avg = (state.stats.hunger + state.stats.joy + state.stats.clean + state.stats.energy) / 4
  state.careSum += avg * dtSec
  state.careTime += dtSec
  // 污垢按周期生成。
  state.dirtTimer += dtSec
  while (state.dirtTimer >= DIRT_PERIOD) {
    state.dirtTimer -= DIRT_PERIOD
    if (state.dirtCount < DIRT_MAX) state.dirtCount += 1
  }
  // 进入成年：锁定进化形态（只锁一次）。
  if (state.form === null && state.stageDays >= 6) {
    state.form = adultFormFor(careScore(state))
  }
  // 追逐小游戏的倒计时与光点漂移。
  const play = state.play
  if (play !== null) {
    play.tLeft -= dtSec
    const ease = Math.min(1, dtSec * 2.5)
    play.dotX += (play.targetX - play.dotX) * ease
    play.dotY += (play.targetY - play.dotY) * ease
    if (Math.abs(play.targetX - play.dotX) < 0.02 && Math.abs(play.targetY - play.dotY) < 0.02) {
      play.targetX = nextRandom(state)
      play.targetY = nextRandom(state)
    }
    if (play.tLeft <= 0) state.play = null
  }
  // 归零生病：单帧至多一次，先归零者优先。
  const s = state.stats
  if (s.hunger <= 0) sickOnce(state, 'hunger')
  else if (s.joy <= 0) sickOnce(state, 'joy')
  else if (s.clean <= 0) sickOnce(state, 'clean')
  else if (s.energy <= 0) sickOnce(state, 'energy')
}

/** 点击蛋壳加速孵化：每击 -3 秒，最多 10 次；非蛋期返回 false。 */
export function tapEgg(state: PetState): boolean {
  if (state.dead || state.eggLeftSec <= 0 || state.eggClicks >= EGG_TAP_MAX) return false
  state.eggClicks += 1
  state.eggLeftSec = Math.max(0, state.eggLeftSec - EGG_TAP_BONUS)
  return true
}

/** 效果正值部分乘偏好倍率（负值不乘）。 */
function scaled(base: number, mult: number): number {
  return base > 0 ? base * mult : base
}

/**
 * 喂食。蛋期/睡眠/死亡/冷却中失败返回 false；偏好食物正值效果 ×1.5，
 * 贪吃鬼吃饲料额外 +6 饱食；所有属性钳制到 [0, 100]。
 */
export function feedPet(state: PetState, food: FoodId): boolean {
  if (state.dead || state.sleeping || state.eggLeftSec > 0 || state.cooldowns[food] > 0) return false
  const def = FOOD_DEFS[food]
  const mult = favoriteFoodOf(state.seed) === food ? 1.5 : 1
  const bonus = quirkOf(state.seed) === 'glutton' && food === 'meal' ? 6 : 0
  const s = state.stats
  s.hunger = clampStat(s.hunger + scaled(def.hunger + bonus, mult))
  s.joy = clampStat(s.joy + scaled(def.joy, mult))
  s.clean = clampStat(s.clean + scaled(def.clean, mult))
  s.energy = clampStat(s.energy + scaled(def.energy, mult))
  state.cooldowns[food] = def.cooldown
  return true
}

/** 抚摸：+2 心情（蛋期/死亡不可抚摸）。 */
export function petPet(state: PetState): boolean {
  if (state.dead || state.eggLeftSec > 0) return false
  state.stats.joy = clampStat(state.stats.joy + 2)
  return true
}

/** 开始追逐光点小游戏（蛋期/睡眠/死亡/已在玩时失败）。 */
export function startPlay(state: PetState): boolean {
  if (state.dead || state.sleeping || state.eggLeftSec > 0 || state.play !== null) return false
  state.play = {
    tLeft: PLAY_SECONDS,
    catches: 0,
    dotX: 0.2 + nextRandom(state) * 0.6,
    dotY: 0.2 + nextRandom(state) * 0.6,
    targetX: nextRandom(state),
    targetY: nextRandom(state),
  }
  return true
}

/**
 * 尝试点击光点：归一化场地坐标落在光点半径（0.06）内则捕获成功，
 * +25 心情（淘气包额外 +10）并以状态随机流重刷光点位置。
 */
export function catchDot(state: PetState, x: number, y: number): boolean {
  const play = state.play
  if (play === null || state.dead) return false
  const dx = play.dotX - x
  const dy = play.dotY - y
  if (Math.sqrt(dx * dx + dy * dy) > 0.06) return false
  play.catches += 1
  const bonus = quirkOf(state.seed) === 'playful' ? 10 : 0
  state.stats.joy = clampStat(state.stats.joy + 25 + bonus)
  play.dotX = nextRandom(state)
  play.dotY = nextRandom(state)
  play.targetX = nextRandom(state)
  play.targetY = nextRandom(state)
  return true
}

/** 刷洗：清掉一个污垢点 +12 清洁；无污垢或不可交互时返回 false。 */
export function brushPet(state: PetState): boolean {
  if (state.dead || state.eggLeftSec > 0 || state.dirtCount <= 0) return false
  state.dirtCount -= 1
  state.stats.clean = clampStat(state.stats.clean + 12)
  return true
}

/** 哄睡（关灯 10 秒快速回精力）；蛋期/已睡/死亡失败。 */
export function startSleep(state: PetState): boolean {
  if (state.dead || state.eggLeftSec > 0 || state.sleeping) return false
  state.sleeping = true
  state.sleepSec = 0
  state.play = null
  return true
}

/** 叫醒：提前结束睡眠，已回的精力保留。 */
export function wakePet(state: PetState): boolean {
  if (!state.sleeping || state.dead) return false
  state.sleeping = false
  return true
}

/** 存档版本号（读档时校验，不匹配拒绝）。 */
export const SAVE_VERSION = 1
/** localStorage 键。 */
export const SAVE_KEY = 'dsh-minigames:petpal'

/** 存档形状：PetState 的纯数据子集（play 不存档，重载即结束小游戏）。 */
interface PetSave {
  v: number
  seed: number
  rngState: number
  stats: PetStats
  clockSec: number
  eggLeftSec: number
  eggClicks: number
  sickCount: number
  dead: boolean
  sleeping: boolean
  sleepSec: number
  dirtCount: number
  dirtTimer: number
  stageDays: number
  careSum: number
  careTime: number
  form: AdultForm | null
  cooldowns: Record<FoodId, number>
}

/** 序列化为可持久化 JSON 字符串。 */
export function serializePet(state: PetState): string {
  const save: PetSave = {
    v: SAVE_VERSION,
    seed: state.seed,
    rngState: state.rngState,
    stats: { ...state.stats },
    clockSec: state.clockSec,
    eggLeftSec: state.eggLeftSec,
    eggClicks: state.eggClicks,
    sickCount: state.sickCount,
    dead: state.dead,
    sleeping: state.sleeping,
    sleepSec: state.sleepSec,
    dirtCount: state.dirtCount,
    dirtTimer: state.dirtTimer,
    stageDays: state.stageDays,
    careSum: state.careSum,
    careTime: state.careTime,
    form: state.form,
    cooldowns: { ...state.cooldowns },
  }
  return JSON.stringify(save)
}

/** 数字字段校验（拒绝 NaN/Infinity，防止坏档污染状态机）。 */
function finiteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * 反序列化：解析并校验存档，成功返回完整状态（play 重置为 null），
 * 坏 JSON / 版本不符 / 字段非法返回 null（调用方回落到新宠物）。
 */
export function deserializePet(json: string): PetState | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch { /* 坏 JSON 按无档处理 */ }
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Record<string, unknown>
  if (s.v !== SAVE_VERSION) return null
  const stats = s.stats as Record<string, unknown> | undefined
  const cooldowns = s.cooldowns as Record<string, unknown> | undefined
  if (stats === undefined || cooldowns === undefined) return null
  const form = s.form
  const formOk = form === null || form === 'dragon' || form === 'cat' || form === 'robot' || form === 'slime'
  const fieldsOk =
    finiteNumber(s.seed) && finiteNumber(s.rngState) &&
    finiteNumber(stats.hunger) && finiteNumber(stats.joy) && finiteNumber(stats.clean) && finiteNumber(stats.energy) &&
    finiteNumber(s.clockSec) && finiteNumber(s.eggLeftSec) && finiteNumber(s.eggClicks) &&
    finiteNumber(s.sickCount) && finiteNumber(s.sleepSec) && finiteNumber(s.dirtCount) &&
    finiteNumber(s.dirtTimer) && finiteNumber(s.stageDays) && finiteNumber(s.careSum) && finiteNumber(s.careTime) &&
    finiteNumber(cooldowns.meal) && finiteNumber(cooldowns.snack) && finiteNumber(cooldowns.feast) &&
    typeof s.dead === 'boolean' && typeof s.sleeping === 'boolean' && formOk
  if (!fieldsOk) return null
  return {
    seed: (s.seed as number) | 0,
    rngState: (s.rngState as number) | 0,
    stats: {
      hunger: stats.hunger as number,
      joy: stats.joy as number,
      clean: stats.clean as number,
      energy: stats.energy as number,
    },
    clockSec: s.clockSec as number,
    eggLeftSec: s.eggLeftSec as number,
    eggClicks: s.eggClicks as number,
    sickCount: s.sickCount as number,
    dead: s.dead as boolean,
    sleeping: s.sleeping as boolean,
    sleepSec: s.sleepSec as number,
    dirtCount: s.dirtCount as number,
    dirtTimer: s.dirtTimer as number,
    stageDays: s.stageDays as number,
    careSum: s.careSum as number,
    careTime: s.careTime as number,
    form: form as AdultForm | null,
    play: null,
    cooldowns: {
      meal: cooldowns.meal as number,
      snack: cooldowns.snack as number,
      feast: cooldowns.feast as number,
    },
  }
}
