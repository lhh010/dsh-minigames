/**
 * 深海潜水（DeepDive）纯逻辑：push-your-luck 循环——岸上（船上）花资产升级
 * 氧气瓶 / 脚蹼 / 照明灯，下水后氧气消耗速率随当前深度线性增加（浅层省气、
 * 深层烧气）；宝物（珍珠/金币/沉箱）价值随所在深度递增，水母蜇人扣氧、
 * 暗流横向推移；随时可上浮回船结算（上浮本身不加额外氧耗，只耗时间与回合
 * 数），氧气归零仍在水下则本趟收获全部损失（救援上岸保命）。5 关海域由
 * seed 确定性布置，越深越富也越险，资产达标即进入下一关。全部随机走注入
 * seed 的 mulberry32，固定 1/60 子步推进，确定性可测、可重放。
 */

/** 海域横向宽度（逻辑像素，与渲染层共享坐标系）。 */
export const SEA_W = 360
/** 固定物理子步长（秒）。 */
export const SUB_DT = 1 / 60
/** 单帧最大模拟时长（秒），超过按卡顿丢弃。 */
export const MAX_FRAME_DT = 0.05
/** 氧气消耗基础速率（升/秒，水面处）。 */
export const O2_BASE = 1.6
/** 氧气消耗随深度的线性系数（升/秒/米）。 */
export const O2_PER_M = 0.05
/** 水母蜇一次扣除的氧气（升）。 */
export const STING_O2 = 16
/** 被蜇后的无敌冷却（秒），防止连续判定。 */
export const STING_CD = 1.2
/** 基础拾取半径（像素），照明灯每级加宽。 */
export const PICKUP_BASE = 15
/** 照明灯每级增加的拾取半径。 */
export const PICKUP_STEP = 9
/** 基础水平速度（像素/秒）。 */
export const SPEED_BASE = 95
/** 脚蹼每级增加的水平速度。 */
export const SPEED_STEP = 26
/** 基础垂直速度（米/秒，下潜与上浮同速）。 */
export const VERT_BASE = 46
/** 脚蹼每级增加的垂直速度。 */
export const VERT_STEP = 9
/** 基础氧气瓶容量（升）。 */
export const TANK_BASE = 110
/** 氧气瓶每级增加的容量。 */
export const TANK_STEP = 45
/** 每项升级的最高档位（0 起）。 */
export const MAX_TIER = 3
/** 玩家横向半宽（碰撞与边界钳制用）。 */
export const DIVER_R = 12

/** 宝物种类与基础价值（实际价值按所在深度放大）。 */
export type TreasureKind = 'pearl' | 'coin' | 'chest'
export const KIND_VALUE: Readonly<Record<TreasureKind, number>> = {
  pearl: 14,
  coin: 26,
  chest: 62,
}
/** 深度价值放大基准：价值 = 基础值 × (1 + 深度 / VALUE_DEPTH)。 */
export const VALUE_DEPTH = 80

/** 升级项与首档价格（第 n 档价格 = 首档 × n）。 */
export type UpgradeKey = 'tank' | 'fins' | 'lamp'
export const UP_COST_BASE: Readonly<Record<UpgradeKey, number>> = {
  tank: 90,
  fins: 70,
  lamp: 60,
}

/** 5 关递进参数：海深、宝物数、水母数、暗流数、过关目标资产。 */
export const LEVELS: ReadonlyArray<Readonly<{
  depth: number, treasures: number, jellies: number, currents: number, target: number,
}>> = [
  { depth: 120, treasures: 16, jellies: 3, currents: 0, target: 220 },
  { depth: 160, treasures: 20, jellies: 4, currents: 1, target: 520 },
  { depth: 200, treasures: 24, jellies: 5, currents: 1, target: 950 },
  { depth: 240, treasures: 28, jellies: 6, currents: 2, target: 1500 },
  { depth: 280, treasures: 32, jellies: 7, currents: 2, target: 2200 },
]

/** 一件宝物：位置（横向像素 + 深度米）与已拾取标记。 */
export interface Treasure {
  x: number
  d: number
  kind: TreasureKind
  /** 价值 = 基础值 × (1 + d / VALUE_DEPTH)，四舍五入取整。 */
  value: number
  taken: boolean
}

/** 一只水母：绕锚点正弦漂浮（相位与幅度由 seed 决定，运动由时间驱动）。 */
export interface Jelly {
  x: number
  d: number
  ampX: number
  phase: number
  spd: number
}

/** 一条暗流：深度带 [from, to) 内以 vx 推移潜水员。 */
export interface Current {
  from: number
  to: number
  vx: number
}

/** 升级档位表。 */
export interface Upgrades {
  tank: number
  fins: number
  lamp: number
}

/** 阶段：船上（商店/结算）或潜水途中。 */
export type Phase = 'boat' | 'dive'

/** 上一趟结局：满载而袋 / 缺氧被救（收获损失）。 */
export type DiveResult = 'banked' | 'drowned'

export interface DeepDiveState {
  level: number
  /** 整局基础 seed（关卡布置 seed 由它与关卡号混合派生）。 */
  seedBase: number
  phase: Phase
  /** 潜水员横向位置（像素）。 */
  x: number
  /** 潜水员当前深度（米，0 = 水面）。 */
  depth: number
  /** 输入轴：横向 -1/0/1、垂直 -1（上）/0/1（下）。 */
  inputX: number
  inputY: number
  /** 空格触发的自动上浮标记，触底前持续生效；按下键取消。 */
  ascending: boolean
  /** 剩余氧气（升）。 */
  oxygen: number
  /** 本趟未入袋的收获价值。 */
  haul: number
  /** 已入袋总资产。 */
  assets: number
  /** 已完成的潜水趟数（回合数）。 */
  dives: number
  upgrades: Upgrades
  treasures: Treasure[]
  jellies: Jelly[]
  currents: Current[]
  /** 本关目标资产。 */
  target: number
  /** 通关（第 5 关达标）标记。 */
  won: boolean
  /** 最近一次结束潜水的结局（渲染提示用）。 */
  lastResult: DiveResult | null
  /** 被蜇无敌剩余秒数。 */
  stingCd: number
  /** 累计模拟时间（秒，驱动水母漂浮）。 */
  time: number
  /** 固定子步累积器（秒）。 */
  acc: number
}

/**
 * mulberry32 确定性随机数生成器：海域布置等全部随机都走它，同 seed 序列
 * 完全一致，保证可测可重放。
 * @param seed - 32 位非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
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

/** 派生能力值：氧气瓶容量（升）。 */
export function tankCapacity(up: Upgrades): number {
  return TANK_BASE + up.tank * TANK_STEP
}

/** 派生能力值：水平速度（像素/秒）。 */
export function moveSpeed(up: Upgrades): number {
  return SPEED_BASE + up.fins * SPEED_STEP
}

/** 派生能力值：垂直速度（米/秒）。 */
export function vertSpeed(up: Upgrades): number {
  return VERT_BASE + up.fins * VERT_STEP
}

/** 派生能力值：拾取半径（像素），照明灯加宽。 */
export function pickRadius(up: Upgrades): number {
  return PICKUP_BASE + up.lamp * PICKUP_STEP
}

/** 指定深度处的氧气消耗速率（升/秒）＝基础 + 深度线性项。 */
export function o2Rate(depth: number): number {
  return O2_BASE + depth * O2_PER_M
}

/** 第 key 项第 (tier+1) 档的价格。 */
export function upgradeCost(key: UpgradeKey, tier: number): number {
  return UP_COST_BASE[key] * (tier + 1)
}

/** 当前是否可购买第 key 项升级（船上、未满档、付得起）。 */
export function canBuy(state: DeepDiveState, key: UpgradeKey): boolean {
  return state.phase === 'boat'
    && !state.won
    && state.upgrades[key] < MAX_TIER
    && state.assets >= upgradeCost(key, state.upgrades[key])
}

/**
 * 购买第 key 项升级：扣资产、升一档；不满足条件时不动。
 * @returns 是否购买成功。
 */
export function buyUpgrade(state: DeepDiveState, key: UpgradeKey): boolean {
  if (!canBuy(state, key)) return false
  state.assets -= upgradeCost(key, state.upgrades[key])
  state.upgrades[key] += 1
  return true
}

/** 按关卡号派生布置 seed 并重铺海域（保留资产、升级与趟数）。 */
function loadOcean(state: DeepDiveState): void {
  const cfg = LEVELS[state.level - 1]!
  state.target = cfg.target
  const rng = mulberry32((state.seedBase ^ Math.imul(state.level, 0x9e3779b9)) >>> 0)
  const treasures: Treasure[] = []
  for (let i = 0; i < cfg.treasures; i += 1) {
    const d = 18 + rng() * (cfg.depth - 30)
    const x = 22 + rng() * (SEA_W - 44)
    const v = rng()
    const kind: TreasureKind = v < 0.5 ? 'pearl' : v < 0.85 ? 'coin' : 'chest'
    treasures.push({ x, d, kind, value: Math.round(KIND_VALUE[kind] * (1 + d / VALUE_DEPTH)), taken: false })
  }
  const jellies: Jelly[] = []
  for (let i = 0; i < cfg.jellies; i += 1) {
    const d = cfg.depth * 0.3 + rng() * cfg.depth * 0.65
    jellies.push({
      x: 30 + rng() * (SEA_W - 60),
      d,
      ampX: 14 + rng() * 26,
      phase: rng() * Math.PI * 2,
      spd: 0.6 + rng() * 0.9,
    })
  }
  const currents: Current[] = []
  for (let i = 0; i < cfg.currents; i += 1) {
    const from = cfg.depth * 0.35 + rng() * cfg.depth * 0.4
    const to = Math.min(cfg.depth - 8, from + 34 + rng() * 30)
    const vx = (rng() < 0.5 ? -1 : 1) * (34 + rng() * 18 + state.level * 5)
    currents.push({ from, to, vx })
  }
  state.treasures = treasures
  state.jellies = jellies
  state.currents = currents
}

/**
 * 创建整局状态：第 1 关、零资产零升级、船上待命。
 * @param seed - 基础 seed（32 位非负整数）。
 */
export function createDeepDiveState(seed: number): DeepDiveState {
  const state: DeepDiveState = {
    level: 1,
    seedBase: seed >>> 0,
    phase: 'boat',
    x: SEA_W / 2,
    depth: 0,
    inputX: 0,
    inputY: 0,
    ascending: false,
    oxygen: tankCapacity({ tank: 0, fins: 0, lamp: 0 }),
    haul: 0,
    assets: 0,
    dives: 0,
    upgrades: { tank: 0, fins: 0, lamp: 0 },
    treasures: [],
    jellies: [],
    currents: [],
    target: LEVELS[0]!.target,
    won: false,
    lastResult: null,
    stingCd: 0,
    time: 0,
    acc: 0,
  }
  loadOcean(state)
  return state
}

/**
 * 从船上出发开始一趟潜水：氧气灌满、回水面中央、趟数 +1。
 * 船上阶段调用才有效。
 */
export function startDive(state: DeepDiveState): void {
  if (state.phase !== 'boat' || state.won) return
  state.phase = 'dive'
  state.dives += 1
  state.depth = 0
  state.x = SEA_W / 2
  state.haul = 0
  state.ascending = false
  state.inputX = 0
  state.inputY = 0
  state.oxygen = tankCapacity(state.upgrades)
  state.stingCd = 0
  state.lastResult = null
}

/** 水母当前横向位置（绕锚点正弦漂浮）。 */
function jellyX(j: Jelly, t: number): number {
  return j.x + Math.sin(t * j.spd + j.phase) * j.ampX
}

/** 缺氧溺水：损失本趟全部收获，救援回船保命。 */
function drown(state: DeepDiveState): void {
  state.haul = 0
  state.phase = 'boat'
  state.depth = 0
  state.x = SEA_W / 2
  state.oxygen = tankCapacity(state.upgrades)
  state.lastResult = 'drowned'
}

/** 上浮到水面：收获入袋、灌满氧气；达标则过关（末关即通关）。 */
function surface(state: DeepDiveState): void {
  state.assets += state.haul
  state.haul = 0
  state.phase = 'boat'
  state.depth = 0
  state.oxygen = tankCapacity(state.upgrades)
  state.lastResult = 'banked'
  if (state.assets >= state.target) {
    if (state.level >= LEVELS.length) {
      state.won = true
    } else {
      state.level += 1
      loadOcean(state)
    }
  }
}

/**
 * 推进一帧：内部按固定 SUB_DT 子步模拟，dt 超过 MAX_FRAME_DT 的部分丢弃。
 * @param state - 游戏状态（原地推进）。
 * @param dt - 帧间隔秒。
 */
export function stepDeepDive(state: DeepDiveState, dt: number): void {
  state.acc += Math.min(Math.max(dt, 0), MAX_FRAME_DT)
  while (state.acc >= SUB_DT) {
    state.acc -= SUB_DT
    substep(state)
  }
}

/** 单个固定子步：先时间，再氧气，再运动与碰撞，最后水面/溺水判定。 */
function substep(state: DeepDiveState): void {
  state.time += SUB_DT
  if (state.phase !== 'dive') return
  const cfg = LEVELS[state.level - 1]!
  const hadDepth = state.depth > 0

  // 氧气：速率随当前深度线性增加。
  state.oxygen -= o2Rate(state.depth) * SUB_DT
  if (state.oxygen <= 0) {
    state.oxygen = 0
    if (state.depth > 0) {
      drown(state)
      return
    }
  }
  if (state.stingCd > 0) state.stingCd = Math.max(0, state.stingCd - SUB_DT)

  // 横向：输入 + 暗流推移，钳制在海域内。
  const sx = moveSpeed(state.upgrades)
  state.x += state.inputX * sx * SUB_DT
  for (const cur of state.currents) {
    if (state.depth >= cur.from && state.depth < cur.to) {
      state.x += cur.vx * SUB_DT
    }
  }
  state.x = Math.min(SEA_W - DIVER_R, Math.max(DIVER_R, state.x))

  // 垂直：空格上浮标记优先，手动按键可覆盖。
  const dirY = state.ascending ? -1 : state.inputY
  const vy = vertSpeed(state.upgrades)
  state.depth = Math.min(cfg.depth, Math.max(0, state.depth + dirY * vy * SUB_DT))

  // 宝物拾取：横向与深度都进入拾取半径（照明灯加宽）。
  const r = pickRadius(state.upgrades)
  for (const t of state.treasures) {
    if (t.taken) continue
    if (Math.abs(t.x - state.x) <= r && Math.abs(t.d - state.depth) <= r * 0.9) {
      t.taken = true
      state.haul += t.value
    }
  }

  // 水母：漂浮中接触即蜇（扣氧 + 无敌冷却），扣到 0 且在水下即溺水。
  for (const j of state.jellies) {
    if (Math.abs(jellyX(j, state.time) - state.x) <= 16 && Math.abs(j.d - state.depth) <= 13) {
      if (state.stingCd <= 0) {
        state.oxygen = Math.max(0, state.oxygen - STING_O2)
        state.stingCd = STING_CD
        if (state.oxygen <= 0 && state.depth > 0) {
          drown(state)
          return
        }
      }
    }
  }

  // 上浮抵达水面（此前确在水下）→ 结算。
  if (state.depth <= 0 && dirY < 0 && hadDepth) surface(state)
}

/** 设置水平输入轴（-1/0/1）。 */
export function setInputX(state: DeepDiveState, dir: number): void {
  state.inputX = Math.min(1, Math.max(-1, dir))
}

/**
 * 设置垂直输入轴（-1 上 / 0 / 1 下）。按“下”同时取消空格的自动上浮，
 * 允许临门又贪一把再往下。
 */
export function setInputY(state: DeepDiveState, dir: number): void {
  state.inputY = Math.min(1, Math.max(-1, dir))
  if (state.inputY > 0) state.ascending = false
}

/** 空格：开始/维持自动上浮，直到水面或被 ↓ 取消。 */
export function startAscend(state: DeepDiveState): void {
  if (state.phase === 'dive') state.ascending = true
}
