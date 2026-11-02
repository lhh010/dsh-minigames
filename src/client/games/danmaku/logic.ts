/**
 * 弹幕决战（Danmaku）纯逻辑：纵向卷轴弹幕射击。玩家慢速移动 + Shift 精确
 * 模式（缩小判定点）+ 短冷却双管射击，轮战 3 个 Boss（每个 3 阶段血条）。
 * 弹幕由参数化发射器引擎驱动（环形 / 扇形 / 螺旋 / 瞄准流 / 花瓣交错，
 * 每阶段组合 2-3 个发射器，参数随发射次数演化）；敌弹与玩家判定点做
 * 圆形碰撞（判定点半径 ~4px），擦弹（弹心距 < 18px 未命中）+10 分并只
 * 计一次。被弹 -1 命（3 命）+ 短无敌 + 全屏消弹；阶段切换与 Boss 击破
 * 均清屏。Boss 移动由 ai.ts 的分帧评估大脑规划（每帧限额评估候选）。
 * 随机数全部走
 * mulberry32(seed, round)，同 seed 同输入轨迹完全一致。时间单位毫秒，
 * 物理单位 px / s。
 */

/** 逻辑画布尺寸。 */
import { createBossBrain } from './ai.ts'

export const W = 480
export const H = 640

/** 玩家参数。 */
export const PLAYER_SPEED = 210
/** 精确模式速度倍率。 */
export const FOCUS_SLOW = 0.45
/** 精确模式判定点半径 px。 */
export const HIT_R_FOCUS = 3.5
/** 常规判定点半径 px。 */
export const HIT_R_NORMAL = 5
/** 擦弹判定半径 px（弹心到判定点中心）。 */
export const GRAZE_R = 18
/** 擦弹得分。 */
export const GRAZE_SCORE = 10
/** 开火冷却 ms。 */
export const FIRE_CD = 130
/** 玩家子弹速度 px/s（向上为负）。 */
export const PLAYER_SHOT_V = 560
/** 双管炮横向间距。 */
export const SHOT_GAP = 6

/** 生命与无敌。 */
export const START_LIVES = 3
export const INVULN_MS = 1800

/** Boss 布局。 */
export const BOSS_Y = 150
export const BOSS_ENTER_MS = 1400
/** Boss 机体受击半径 px。 */
export const BOSS_HIT_R = 34
/** 阶段切换停火展示 ms。 */
export const BREAK_MS = 900
/** Boss 间横幅 ms。 */
export const BANNER_MS = 1600
/** 同屏敌弹上限。 */
export const MAX_ENEMY_BULLETS = 480

/** 得分配置。 */
export const SHOT_SCORE = 5
export const PHASE_BONUS = 300
/** 第 i 个 Boss 击破奖励（1 起）。 */
export function bossBonus(bossIndex0: number): number {
  return 1000 * (bossIndex0 + 1)
}

/**
 * mulberry32 确定性随机数发生器（与其它游戏互不依赖的同名实现）。
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

/** 敌弹颜色（红 / 紫两色，渲染层据此发光）。 */
export type BulletColor = 'red' | 'purple'

/** 发射器几何类型。 */
export type EmitterKind = 'ring' | 'fan' | 'spiral' | 'aimed' | 'petal'

/**
 * 参数化发射器规格。角度采用画布坐标系（+x 向右、+y 向下，PI/2 即正下）。
 * 演化：speedGrow 每次齐射给 speed 递增（封顶 speedMax）；ring / petal 的
 * baseAngle 每次齐射自旋 spin 弧度；spiral 的累计角每次齐射推进 spin。
 */
export interface EmitterSpec {
  kind: EmitterKind
  /** 齐射间隔 ms。 */
  intervalMs: number
  /** 每次齐射弹数（spiral 为臂数，petal 为每层瓣数）。 */
  count: number
  speed: number
  color: BulletColor
  /** 扇形总张角 rad（fan / aimed）。 */
  spread?: number
  /** 每次齐射的角度推进 rad（ring / petal / spiral）。 */
  spin?: number
  /** 每次齐射的速度增量 px/s。 */
  speedGrow?: number
  speedMax?: number
  /** 初始基准角 rad。 */
  baseAngle?: number
}

/** 发射器运行时状态（随局面保存，保证重放一致）。 */
export interface EmitterRuntime {
  spec: EmitterSpec
  /** 距下次齐射 ms。 */
  nextAt: number
  /** 已齐射次数。 */
  clock: number
  /** 当前演化速度 px/s。 */
  speed: number
  /** 当前演化基准角 rad。 */
  angle: number
}

/** 一颗敌弹；graze 标记该弹是否已被擦过（每弹只计一次）。 */
export interface EnemyBullet {
  x: number, y: number, vx: number, vy: number
  /** 弹体半径 px。 */
  r: number
  color: BulletColor
  grazed: boolean
}

/** 一发玩家子弹。 */
export interface PlayerShot { x: number, y: number }

/** 单步内产生、供渲染层消费的可视事件。 */
export type DanmakuEvent =
  | { type: 'graze', x: number, y: number }
  | { type: 'hit', x: number, y: number }
  | { type: 'bossHit', x: number, y: number }
  | { type: 'phase', boss: number, phase: number }
  | { type: 'bossDown', boss: number, x: number, y: number }
  | { type: 'win' }
  | { type: 'banner', boss: number }

/** 玩家一帧的输入（按住即 true）。 */
export interface DanmakuInput {
  left: boolean, right: boolean, up: boolean, down: boolean
  fire: boolean
  focus: boolean
}

// —— 发射器几何（导出供测试） ——

/**
 * 环形齐射角度：base 起均分一整圈。
 * @param count - 弹数。
 * @param base - 基准角 rad。
 * @returns count 个角度 rad。
 */
export function ringAngles(count: number, base: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i += 1) out.push(base + (Math.PI * 2 * i) / count)
  return out
}

/**
 * 扇形齐射角度：以 center 为中心张开 spread。count 为 1 时只发中心。
 * @param count - 弹数。
 * @param center - 中心角 rad。
 * @param spread - 总张角 rad。
 * @returns count 个角度 rad。
 */
export function fanAngles(count: number, center: number, spread: number): number[] {
  if (count <= 1) return [center]
  const out: number[] = []
  for (let i = 0; i < count; i += 1) out.push(center - spread / 2 + (spread * i) / (count - 1))
  return out
}

/**
 * 花瓣交错齐射角度：clock 奇偶交替两层，第二层错开半步形成交错花瓣。
 * @param count - 每层瓣数。
 * @param base - 基准角 rad。
 * @param clock - 已齐射次数（决定层）。
 * @returns count 个角度 rad。
 */
export function petalAngles(count: number, base: number, clock: number): number[] {
  const offset = clock % 2 === 0 ? 0 : Math.PI / count
  const out: number[] = []
  for (let i = 0; i < count; i += 1) out.push(base + offset + (Math.PI * 2 * i) / count)
  return out
}

/** 从 (fromX,fromY) 指向 (toX,toY) 的方位角 rad。 */
export function angleTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toY - fromY, toX - fromX)
}

/**
 * 按规格发射一次齐射（几何由上面的 helper 决定；aimed 以玩家为靶心）。
 * @param state - 目标状态。
 * @param em - 发射器运行时。
 */
function fireVolley(state: DanmakuState, em: EmitterRuntime): void {
  const spec = em.spec
  const bx = state.bossX
  const by = state.bossY + 18
  let angles: number[]
  let speed = em.speed
  switch (spec.kind) {
    case 'ring':
      angles = ringAngles(spec.count, em.angle)
      break
    case 'fan':
      angles = fanAngles(spec.count, em.angle, spec.spread ?? 0.6)
      break
    case 'aimed': {
      const aim = angleTo(bx, by, state.playerX, state.playerY)
      angles = fanAngles(spec.count, aim, spec.spread ?? 0.2)
      break
    }
    case 'spiral':
      angles = ringAngles(spec.count, em.angle)
      break
    case 'petal':
      angles = petalAngles(spec.count, em.angle, em.clock)
      // 花瓣层间速度交错制造纵深。
      speed = em.clock % 2 === 0 ? em.speed : em.speed * 0.7
      break
  }
  for (const a of angles) {
    if (state.enemyBullets.length >= MAX_ENEMY_BULLETS) break
    state.enemyBullets.push({
      x: bx, y: by,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: 5,
      color: spec.color,
      grazed: false,
    })
  }
}

/**
 * 玩家当前判定点半径（精确模式缩小）。
 * @param focus - 是否精确模式。
 */
export function hitRadius(focus: boolean): number {
  return focus ? HIT_R_FOCUS : HIT_R_NORMAL
}

/** Boss 定义：名称、三阶段血量、每阶段发射器组合、移动速度。 */
export interface BossDef {
  name: string
  hp: [number, number, number]
  speed: number
  phases: [EmitterSpec[], EmitterSpec[], EmitterSpec[]]
}

/** 三个 Boss：花仙 → 月蝶 → 星焰，阶段逐级加密。 */
export const BOSSES: BossDef[] = [
  {
    name: '花仙 · Sakura',
    hp: [60, 80, 100],
    speed: 70,
    phases: [
      [
        { kind: 'ring', intervalMs: 900, count: 16, speed: 110, color: 'red', baseAngle: 0, spin: Math.PI / 8 },
        { kind: 'aimed', intervalMs: 620, count: 3, speed: 190, color: 'purple', spread: 0.3 },
      ],
      [
        { kind: 'fan', intervalMs: 520, count: 7, speed: 150, color: 'purple', spread: 1.1, baseAngle: Math.PI / 2 },
        { kind: 'ring', intervalMs: 1000, count: 20, speed: 100, color: 'red', baseAngle: Math.PI / 16, spin: Math.PI / 10 },
      ],
      [
        { kind: 'petal', intervalMs: 460, count: 10, speed: 150, color: 'red', baseAngle: 0, spin: Math.PI / 12 },
        { kind: 'aimed', intervalMs: 540, count: 5, speed: 210, color: 'purple', spread: 0.45 },
        { kind: 'spiral', intervalMs: 300, count: 3, speed: 130, color: 'purple', baseAngle: 0, spin: Math.PI / 5 },
      ],
    ],
  },
  {
    name: '月蝶 · Luna',
    hp: [90, 110, 130],
    speed: 95,
    phases: [
      [
        { kind: 'spiral', intervalMs: 260, count: 4, speed: 140, color: 'purple', baseAngle: 0, spin: 0.5, speedGrow: 1.5, speedMax: 210 },
        { kind: 'fan', intervalMs: 780, count: 9, speed: 160, color: 'red', spread: 1.4, baseAngle: Math.PI / 2 },
      ],
      [
        { kind: 'petal', intervalMs: 420, count: 12, speed: 160, color: 'purple', baseAngle: 0, spin: Math.PI / 14 },
        { kind: 'aimed', intervalMs: 460, count: 3, speed: 230, color: 'red', spread: 0.22 },
      ],
      [
        { kind: 'ring', intervalMs: 700, count: 24, speed: 120, color: 'red', baseAngle: 0, spin: Math.PI / 12 },
        { kind: 'spiral', intervalMs: 230, count: 3, speed: 150, color: 'purple', baseAngle: Math.PI, spin: -0.45, speedGrow: 1.2, speedMax: 220 },
        { kind: 'fan', intervalMs: 900, count: 11, speed: 175, color: 'purple', spread: 1.6, baseAngle: Math.PI / 2 },
      ],
    ],
  },
  {
    name: '星焰 · Nova',
    hp: [120, 150, 180],
    speed: 120,
    phases: [
      [
        { kind: 'ring', intervalMs: 600, count: 28, speed: 130, color: 'red', baseAngle: 0, spin: Math.PI / 14 },
        { kind: 'spiral', intervalMs: 240, count: 5, speed: 145, color: 'purple', baseAngle: 0, spin: 0.4 },
      ],
      [
        { kind: 'petal', intervalMs: 360, count: 14, speed: 170, color: 'purple', baseAngle: 0, spin: Math.PI / 10, speedGrow: 0.8, speedMax: 240 },
        { kind: 'aimed', intervalMs: 380, count: 7, speed: 240, color: 'red', spread: 0.55 },
      ],
      [
        { kind: 'ring', intervalMs: 520, count: 32, speed: 140, color: 'red', baseAngle: 0, spin: -Math.PI / 10 },
        { kind: 'spiral', intervalMs: 200, count: 6, speed: 160, color: 'purple', baseAngle: Math.PI / 2, spin: 0.55, speedGrow: 1, speedMax: 250 },
        { kind: 'petal', intervalMs: 480, count: 12, speed: 185, color: 'red', baseAngle: Math.PI, spin: Math.PI / 8 },
      ],
    ],
  },
]

/** 一局游戏的完整可测状态。 */
export interface DanmakuState {
  /** 局内已流逝 ms。 */
  t: number
  score: number
  lives: number
  over: boolean
  /** 全胜通关。 */
  win: boolean
  playerX: number
  playerY: number
  fireCd: number
  invulnMs: number
  /** 擦弹次数。 */
  graze: number
  /** 当前 Boss 下标（0 起，2 = 星焰）。 */
  bossIndex: number
  /** 当前阶段下标（0 起）。 */
  phase: number
  bossHp: number
  bossMaxHp: number
  bossX: number
  bossY: number
  /** Boss 入场剩余 ms（>0 时无敌不发射）。 */
  bossEnterMs: number
  /** 横幅剩余 ms。 */
  bannerMs: number
  /** 阶段切换停火剩余 ms。 */
  breakMs: number
  bossAlive: boolean
  enemyBullets: EnemyBullet[]
  playerShots: PlayerShot[]
  emitters: EmitterRuntime[]
  events: DanmakuEvent[]
  rng: () => number
  /** Boss 移动大脑（ai.ts），随局面保存保证重放一致。 */
  brain: BossBrainLike
}

/** 逻辑层依赖的大脑接口（ai.ts 实现，接口隔离便于测试替身）。 */
export interface BossBrainLike {
  /** 供逻辑层每帧调用：推进大脑并给出当前移动目标。 */
  step(state: DanmakuState, dtMs: number): void
  targetX: number
  targetY: number
}

/** 由 BossDef 构造一组发射器运行时。 */
function createEmitters(def: BossDef, phase: number): EmitterRuntime[] {
  return def.phases[phase]!.map((spec) => ({
    spec,
    nextAt: spec.intervalMs,
    clock: 0,
    speed: spec.speed,
    angle: spec.baseAngle ?? 0,
  }))
}

/**
 * 新开一局（第 1 个 Boss 入场中）。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @param makeBrain - 大脑工厂（默认用 ai.ts 的分帧大脑；测试可注入替身）。
 * @returns 初始状态。
 */
export function createDanmaku(
  seed: number,
  round = 1,
  makeBrain: () => BossBrainLike = createBossBrain,
): DanmakuState {
  const def = BOSSES[0]!
  const state: DanmakuState = {
    t: 0,
    score: 0,
    lives: START_LIVES,
    over: false,
    win: false,
    playerX: W / 2,
    playerY: H - 70,
    fireCd: 0,
    invulnMs: 0,
    graze: 0,
    bossIndex: 0,
    phase: 0,
    bossHp: def.hp[0]!,
    bossMaxHp: def.hp[0]!,
    bossX: W / 2,
    bossY: -60,
    bossEnterMs: BOSS_ENTER_MS,
    bannerMs: BANNER_MS,
    breakMs: 0,
    bossAlive: true,
    enemyBullets: [],
    playerShots: [],
    emitters: createEmitters(def, 0),
    events: [{ type: 'banner', boss: 1 }],
    rng: mulberry32((Math.floor(seed) * 131 + round * 17) >>> 0),
    brain: makeBrain(),
  }
  return state
}

/**
 * 进入第 bossIndex 个 Boss 的第 phase 阶段：换血条、换发射器、清弹。
 * @param state - 目标状态。
 */
function enterPhase(state: DanmakuState): void {
  const def = BOSSES[state.bossIndex]!
  state.bossMaxHp = def.hp[state.phase]!
  state.bossHp = state.bossMaxHp
  state.emitters = createEmitters(def, state.phase)
  state.enemyBullets.length = 0
  state.playerShots.length = 0
  state.breakMs = BREAK_MS
  state.events.push({ type: 'phase', boss: state.bossIndex + 1, phase: state.phase + 1 })
}

/**
 * 当前 Boss 阶段血量打空后的流转：下一阶段、或击破 Boss、或通关。
 * @param state - 目标状态。
 */
function advanceBoss(state: DanmakuState): void {
  state.score += PHASE_BONUS
  if (state.phase < 2) {
    state.phase += 1
    enterPhase(state)
    return
  }
  // Boss 击破：奖励 + 横幅，进入下一个或通关。
  state.score += bossBonus(state.bossIndex)
  state.events.push({ type: 'bossDown', boss: state.bossIndex + 1, x: state.bossX, y: state.bossY })
  state.enemyBullets.length = 0
  state.playerShots.length = 0
  state.bossAlive = false
  if (state.bossIndex >= BOSSES.length - 1) {
    state.win = true
    state.over = true
    state.events.push({ type: 'win' })
    return
  }
  state.bossIndex += 1
  state.phase = 0
  const def = BOSSES[state.bossIndex]!
  state.bossMaxHp = def.hp[0]!
  state.bossHp = def.hp[0]!
  state.emitters = createEmitters(def, 0)
  state.bossX = W / 2
  state.bossY = -60
  state.bossEnterMs = BOSS_ENTER_MS
  state.bannerMs = BANNER_MS
  state.bossAlive = true
  state.events.push({ type: 'banner', boss: state.bossIndex + 1 })
}

/**
 * 推进一帧：玩家移动 / 开火、Boss 入场与移动、发射器齐射、双方子弹飞行、
 * 玩家弹打 Boss、敌弹命中与擦弹、被弹处理、阶段 / Boss 流转。事件写入
 * state.events，调用方每帧消费（下一帧开头清空）。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧玩家输入。
 */
export function stepDanmaku(state: DanmakuState, dtMs: number, input: DanmakuInput): void {
  state.events.length = 0
  if (state.over) return
  const dt = dtMs / 1000
  state.t += dtMs
  if (state.invulnMs > 0) state.invulnMs = Math.max(0, state.invulnMs - dtMs)
  if (state.bannerMs > 0) state.bannerMs = Math.max(0, state.bannerMs - dtMs)
  if (state.fireCd > 0) state.fireCd = Math.max(0, state.fireCd - dtMs)

  // 玩家移动：精确模式减速，画布内夹紧。
  let dx = 0
  let dy = 0
  if (input.left && !input.right) dx = -1
  else if (input.right && !input.left) dx = 1
  if (input.up && !input.down) dy = -1
  else if (input.down && !input.up) dy = 1
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2
    dy *= Math.SQRT1_2
  }
  const speed = PLAYER_SPEED * (input.focus ? FOCUS_SLOW : 1)
  state.playerX += dx * speed * dt
  state.playerY += dy * speed * dt
  if (state.playerX < 12) state.playerX = 12
  if (state.playerX > W - 12) state.playerX = W - 12
  if (state.playerY < 60) state.playerY = 60
  if (state.playerY > H - 16) state.playerY = H - 16

  // 双管开火（短冷却）。
  if (input.fire && state.fireCd <= 0) {
    state.playerShots.push({ x: state.playerX - SHOT_GAP, y: state.playerY - 12 })
    state.playerShots.push({ x: state.playerX + SHOT_GAP, y: state.playerY - 12 })
    state.fireCd = FIRE_CD
  }

  // Boss 入场 / 停火 / 移动。
  if (state.bossAlive) {
    if (state.bossEnterMs > 0) {
      state.bossEnterMs = Math.max(0, state.bossEnterMs - dtMs)
      const k = 1 - state.bossEnterMs / BOSS_ENTER_MS
      state.bossY = -60 + (BOSS_Y + 60) * k
      state.bossX = W / 2
    } else if (state.breakMs > 0) {
      state.breakMs = Math.max(0, state.breakMs - dtMs)
    } else {
      state.brain.step(state, dtMs)
      const def = BOSSES[state.bossIndex]!
      const tx = state.brain.targetX
      const ty = state.brain.targetY
      const ddx = tx - state.bossX
      const ddy = ty - state.bossY
      const dist = Math.hypot(ddx, ddy)
      if (dist > 1) {
        const step = Math.min(dist, def.speed * dt)
        state.bossX += (ddx / dist) * step
        state.bossY += (ddy / dist) * step
      }
      // 发射器推进（停火 / 入场期不发射）。
      for (const em of state.emitters) {
        em.nextAt -= dtMs
        let guard = 0
        while (em.nextAt <= 0 && guard < 8) {
          fireVolley(state, em)
          em.nextAt += em.spec.intervalMs
          em.clock += 1
          if (em.spec.spin !== undefined) em.angle += em.spec.spin
          if (em.spec.speedGrow !== undefined) {
            em.speed = Math.min(em.spec.speedMax ?? em.speed, em.speed + em.spec.speedGrow)
          }
          guard += 1
        }
      }
    }
  }

  // 玩家子弹：飞行、出界、打 Boss。
  for (let i = state.playerShots.length - 1; i >= 0; i -= 1) {
    const s = state.playerShots[i]!
    s.y += -PLAYER_SHOT_V * dt
    if (s.y < 8) { state.playerShots.splice(i, 1); continue }
    if (!state.bossAlive || state.bossEnterMs > 0) continue
    if (Math.hypot(s.x - state.bossX, s.y - state.bossY) <= BOSS_HIT_R) {
      state.playerShots.splice(i, 1)
      state.bossHp -= 1
      state.score += SHOT_SCORE
      state.events.push({ type: 'bossHit', x: s.x, y: s.y })
      if (state.bossHp <= 0) {
        // 流转会清空玩家子弹：立即跳出，避免迭代悬空下标。
        advanceBoss(state)
        break
      }
    }
  }

  // 敌弹：飞行、出界、命中 / 擦弹。
  const hr = hitRadius(input.focus)
  for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = state.enemyBullets[i]!
    b.x += b.vx * dt
    b.y += b.vy * dt
    if (b.x < -30 || b.x > W + 30 || b.y < -40 || b.y > H + 30) {
      state.enemyBullets.splice(i, 1)
      continue
    }
    const dist = Math.hypot(b.x - state.playerX, b.y - state.playerY)
    if (state.invulnMs <= 0 && dist <= hr + b.r) {
      // 被弹：-1 命 + 无敌 + 全屏消弹。
      state.enemyBullets.splice(i, 1)
      state.lives -= 1
      state.invulnMs = INVULN_MS
      state.events.push({ type: 'hit', x: state.playerX, y: state.playerY })
      state.enemyBullets.length = 0
      if (state.lives <= 0) {
        state.lives = 0
        state.over = true
        return
      }
      break
    }
    if (!b.grazed && dist < GRAZE_R) {
      b.grazed = true
      state.graze += 1
      state.score += GRAZE_SCORE
      state.events.push({ type: 'graze', x: b.x, y: b.y })
    }
  }
}
