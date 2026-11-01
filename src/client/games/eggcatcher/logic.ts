/**
 * 接鸡蛋（Egg Catcher）纯逻辑：篮子沿底部横向移动（键盘步进或指针
 * 目标位插值追赶），顶部母鸡来回走动并按下落节奏下蛋。蛋分三种：
 * 普通蛋 +1、金黄蛋 +5、臭蛋碰篮 -1 命；漏接普通/金蛋也 -1 命，共 5 命。
 * 难度随回合时间升档：下落间隔缩短、速度加快、臭蛋概率上升，全部由
 * mulberry32(seed, round) 确定性驱动。同屏多蛋、微水平漂移（撞侧墙反弹）。
 * 连续接住触发连击加成（窗口 900ms，封顶 8）。时间单位毫秒，物理单位
 * px / s。输入以纯数据 Input 传入，保证同 seed + 同输入序列重放一致。
 */

/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export const W = 480
export const H = 600
export const HUD_H = 30

/** 篮子宽 / 高 / 缘口逻辑 y。 */
export const BASKET_W = 96
export const BASKET_H = 34
export const BASKET_Y = H - 56
/** 篮子平移速度 px/s（键盘步进与指针追赶同速）。 */
export const BASKET_SPEED = 430
/** 初始生命。 */
export const START_LIVES = 5
/** 连击窗口 ms：窗口内再接住则连击 +1。 */
export const COMBO_WINDOW_MS = 900
/** 连击加成上限。 */
export const COMBO_CAP = 8
/** 每级连击附加分。 */
export const COMBO_BONUS = 1
/** 每 12 秒升一档难度。 */
export const LEVEL_MS = 12_000
/** 篮子接住时的挤压动画时长 ms。 */
export const SQUASH_MS = 160
/** 母鸡走动速度 px/s。 */
export const HEN_SPEED = 72
/** 蛋半径 px。 */
export const EGG_R = 11
/** 飘字存活时长 ms。 */
export const FLOAT_MS = 800

/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 蛋种类：0 普通蛋 +1 分，1 金黄蛋 +5 分，2 臭蛋碰篮 -1 命。 */
export const EGG_KINDS = [
  { name: '普通蛋', score: 1 },
  { name: '金黄蛋', score: 5 },
  { name: '臭蛋', score: 0 },
] as const

/** 一个下落中的蛋。 */
export interface Egg {
  kind: 0 | 1 | 2
  x: number, y: number
  vy: number, vx: number
}

/** 顶部走动的母鸡。 */
export interface Hen {
  x: number
  dir: 1 | -1
}

/** 上浮渐隐的飘字（得分 / 连击提示）。 */
export interface FloatText {
  x: number, y: number
  text: string
  life: number
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type EggEvent =
  | { type: 'catch', x: number, y: number, kind: 0 | 1 | 2 }
  | { type: 'miss', x: number, y: number, kind: 0 | 1 | 2 }
  | { type: 'rotten', x: number, y: number }

/** 一帧输入：键盘方向（-1/0/1）或指针目标位（逻辑 x，null 表示无指针目标）。 */
export interface EggInput {
  dir: -1 | 0 | 1
  pointerX: number | null
}

/** 一局游戏的完整可测状态。 */
export interface EggCatcherState {
  /** 回合内已流逝 ms。 */
  t: number
  score: number
  lives: number
  missed: number
  combo: number
  /** 连击失效时刻 ms（回合钟）。 */
  comboExpire: number
  /** 篮子中心 x。 */
  basketX: number
  /** 挤压动画剩余 ms。 */
  squashMs: number
  eggs: Egg[]
  events: EggEvent[]
  floats: FloatText[]
  rng: () => number
  hen: Hen
  /** 下一次下蛋时刻 ms。 */
  nextDropAt: number
  over: boolean
}

/**
 * 当前难度档位：随回合时间每 12 秒 +1。
 * @param tMs - 回合内毫秒钟。
 * @returns 从 1 开始的档位。
 */
export function levelOf(tMs: number): number {
  return 1 + Math.floor(Math.max(0, tMs) / LEVEL_MS)
}

/**
 * 下蛋间隔 ms：1 档 1400ms，每档 -130ms，下限 360ms。
 * @param level - 当前档位。
 * @returns 相邻两次下蛋的间隔毫秒。
 */
export function dropInterval(level: number): number {
  return Math.max(360, 1400 - (level - 1) * 130)
}

/**
 * 蛋基础下落速度 px/s：1 档 130，每档 +26。
 * @param level - 当前档位。
 * @returns 该档位的基础下落速度。
 */
export function fallSpeed(level: number): number {
  return 130 + (level - 1) * 26
}

/**
 * 臭蛋概率：1 档 6%，每档 +1.5%，封顶 22%。
 * @param level - 当前档位。
 * @returns 该档位单颗蛋为臭蛋的概率。
 */
export function rottenChance(level: number): number {
  return Math.min(0.22, 0.06 + (level - 1) * 0.015)
}

/** 金黄蛋概率（不随档位变化）。 */
export const GOLD_CHANCE = 0.12

/**
 * 篮子可移动的左右边界（中心 x）。
 * @returns [minX, maxX]。
 */
export function basketBounds(): [number, number] {
  return [BASKET_W / 2 + 6, W - BASKET_W / 2 - 6]
}

/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createEggCatcher(seed: number, round = 1): EggCatcherState {
  return {
    t: 0,
    score: 0,
    lives: START_LIVES,
    missed: 0,
    combo: 0,
    comboExpire: 0,
    basketX: W / 2,
    squashMs: 0,
    eggs: [],
    events: [],
    floats: [],
    rng: mulberry32((Math.floor(seed) * 31 + round) >>> 0),
    hen: { x: W / 2, dir: 1 },
    nextDropAt: 500,
    over: false,
  }
}

/**
 * 母鸡下蛋：种类按档位概率滚动，落点在母鸡附近，带随机下落速度与
 * 微水平漂移。
 * @param state - 目标状态（使用其 rng 与 hen）。
 * @param level - 当前档位。
 */
function dropEgg(state: EggCatcherState, level: number): void {
  const rng = state.rng
  const roll = rng()
  let kind: 0 | 1 | 2 = 0
  if (roll < rottenChance(level)) kind = 2
  else if (roll < rottenChance(level) + GOLD_CHANCE) kind = 1
  const x = Math.max(EGG_R + 6, Math.min(W - EGG_R - 6, state.hen.x + (rng() - 0.5) * 60))
  const vy = fallSpeed(level) * (0.85 + rng() * 0.4)
  const vx = (rng() - 0.5) * 46
  state.eggs.push({ kind, x, y: 58, vy, vx })
}

/**
 * 扣 1 命；命尽置 over。
 * @param state - 目标状态。
 */
function loseLife(state: EggCatcherState): void {
  state.lives -= 1
  state.combo = 0
  if (state.lives <= 0) {
    state.lives = 0
    state.over = true
  }
}

/**
 * 推进一帧：篮子移动（指针目标位优先、否则键盘方向）、母鸡走动、按
 * 档位下蛋、蛋物理与接住 / 漏接判定、连击与飘字。事件写入
 * state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入（键盘方向 / 指针目标位）。
 */
export function stepEggCatcher(state: EggCatcherState, dtMs: number, input: EggInput): void {
  state.events.length = 0
  if (state.over) return
  const dt = dtMs / 1000
  state.t += dtMs
  const [minX, maxX] = basketBounds()

  // 篮子：指针目标位插值追赶；键盘方向直接平移并覆盖指针目标。
  if (input.dir !== 0) {
    state.basketX = Math.max(minX, Math.min(maxX, state.basketX + input.dir * BASKET_SPEED * dt))
  } else if (input.pointerX !== null) {
    const target = Math.max(minX, Math.min(maxX, input.pointerX))
    const dx = target - state.basketX
    const step = BASKET_SPEED * dt
    state.basketX += Math.abs(dx) <= step ? dx : Math.sign(dx) * step
  }
  if (state.squashMs > 0) state.squashMs = Math.max(0, state.squashMs - dtMs)

  // 母鸡来回走动。
  state.hen.x += state.hen.dir * HEN_SPEED * dt
  if (state.hen.x > W - 46) { state.hen.x = W - 46; state.hen.dir = -1 }
  else if (state.hen.x < 46) { state.hen.x = 46; state.hen.dir = 1 }

  // 按档位节奏下蛋。
  const level = levelOf(state.t)
  while (state.t >= state.nextDropAt) {
    dropEgg(state, level)
    state.nextDropAt += dropInterval(level)
  }

  // 蛋物理、接住与漏接。
  for (let i = state.eggs.length - 1; i >= 0; i -= 1) {
    const e = state.eggs[i]!
    e.y += e.vy * dt
    e.x += e.vx * dt
    if (e.x < EGG_R + 4) { e.x = EGG_R + 4; e.vx = Math.abs(e.vx) }
    else if (e.x > W - EGG_R - 4) { e.x = W - EGG_R - 4; e.vx = -Math.abs(e.vx) }

    const inMouth = e.y + EGG_R >= BASKET_Y + 4 && e.y < BASKET_Y + BASKET_H
    if (inMouth && Math.abs(e.x - state.basketX) <= BASKET_W / 2 + EGG_R - 5) {
      state.eggs.splice(i, 1)
      if (e.kind === 2) {
        state.events.push({ type: 'rotten', x: e.x, y: BASKET_Y })
        loseLife(state)
        state.squashMs = SQUASH_MS
        if (state.over) return
        continue
      }
      state.combo = state.comboExpire > state.t ? Math.min(COMBO_CAP, state.combo + 1) : 1
      state.comboExpire = state.t + COMBO_WINDOW_MS
      const gained = EGG_KINDS[e.kind].score + (state.combo - 1) * COMBO_BONUS
      state.score += gained
      state.squashMs = SQUASH_MS
      state.events.push({ type: 'catch', x: e.x, y: BASKET_Y, kind: e.kind })
      state.floats.push({ x: e.x, y: BASKET_Y - 14, text: '+' + gained, life: FLOAT_MS })
      if (state.combo >= 3) {
        state.floats.push({ x: state.basketX, y: BASKET_Y - 36, text: 'x' + state.combo + ' 连击', life: FLOAT_MS })
      }
      continue
    }
    if (e.y - EGG_R > H) {
      state.eggs.splice(i, 1)
      if (e.kind !== 2) {
        state.missed += 1
        state.events.push({ type: 'miss', x: e.x, y: H - 4, kind: e.kind })
        loseLife(state)
        if (state.over) return
      }
    }
  }

  // 飘字上浮渐隐。
  for (let i = state.floats.length - 1; i >= 0; i -= 1) {
    const fl = state.floats[i]!
    fl.y -= 34 * dt
    fl.life -= dtMs
    if (fl.life <= 0) state.floats.splice(i, 1)
  }
}
