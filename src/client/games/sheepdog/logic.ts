/**
 * 牧羊犬（Sheepdog）纯逻辑：俯视草场上，玩家操控牧羊犬用 boids 羊群
 * （分离/对齐/聚合三力 + 对牧羊犬与狼的逃离斥力）把 N 只羊赶进带开口
 * 的围栏。5 关递进：羊数 5→12、场地变大、第 3 关起加入狼（狼追羊、
 * 犬可驱狼）、每关限时。全部入栏过关，剩余时间折算加分。
 *
 * 确定性：随机数只通过注入 seed（mulberry32）用于关卡初始布置；之后
 * 所有物理走固定子步（SUBSTEP_MS）积分，整局可按 (seed, 输入序列)
 * 完整重放。时间单位全为毫秒。
 */

/** 逻辑画布宽（px）。 */
export const W = 480
/** 逻辑画布高（px），顶部 HUD_H 为信息条。 */
export const H = 600
/** 顶部 HUD 条高度（px）。 */
export const HUD_H = 30

/** 固定物理子步长（ms）：stepSheepdog 把外部 dt 累加后按此切分。 */
export const SUBSTEP_MS = 10

// --- 羊群 boids 参数 ---

/** 羊与羊的分离半径（px）：更近则互相推开。 */
export const SEP_R = 26
/** 分离力权重（px/s^2，按距离线性衰减前的峰值）。 */
export const SEP_FORCE = 340
/** 对齐/聚合的视野半径（px）。 */
export const VIEW_R = 85
/** 对齐力权重（1/s：向邻居平均速度靠拢的转向速率）。 */
export const ALI_WEIGHT = 1.4
/** 聚合力（px/s^2，指向邻居质心）。 */
export const COH_FORCE = 60
/** 羊的碰撞半径（px），用于贴墙钳制。 */
export const SHEEP_R = 7
/** 羊速度阻尼系数（每子步乘法衰减，来自 exp(-DRAG*dt) 近似）。 */
const DRAG_PER_SUBSTEP = 0.985
/** 恐慌时羊的限速上浮系数。 */
export const PANIC_SPEED_FACTOR = 1.35
/** 恐慌每秒衰减量（panic ∈ [0,1]，渲染据此画 "!"）。 */
export const PANIC_DECAY_PER_S = 0.9

// --- 牧羊犬参数 ---

/** 犬的移动速度（px/s），略快于任何羊。 */
export const DOG_SPEED = 170
/** 羊感知犬并开始逃离的半径（px）。 */
export const DOG_R = 125
/** 犬对羊的斥力峰值（px/s^2，随距离线性衰减）。 */
export const DOG_FORCE = 1050

// --- 狼参数 ---

/** 狼的追击速度（px/s）：快于常态羊、慢于犬与恐慌羊。 */
export const WOLF_SPEED = 108
/** 狼怕犬的半径（px）：犬靠近即掉头逃离——犬可以驱狼。 */
export const WOLF_FEAR_R = 115
/** 狼追羊的期望距离（px）：贴近到此距离即算压制，羊恐慌四散。 */
export const WOLF_CATCH_R = 16

// --- 围栏参数 ---

/** 围栏宽（px），锚在场地右上角。 */
export const PEN_W = 108
/** 围栏高（px）。 */
export const PEN_H = 86
/** 围栏开口宽度（px），开在下边（朝场地内侧）。 */
export const PEN_OPEN_W = 44
/** 入栏判定半径（px）：未入栏羊距开口中心小于此值即入栏。 */
export const PEN_OPEN_R = 24
/** 已入栏羊走向栏内站位点的速度（px/s）。 */
export const PEN_SLOT_SPEED = 60

/** 过关后停留展示时长（ms），随后自动进入下一关。 */
export const WIN_LINGER_MS = 1600
/** 每入栏一只羊的即时加分。 */
export const SCORE_PER_SHEEP = 20
/** 过关时每剩余整秒的加分。 */
export const SCORE_PER_SECOND_LEFT = 10

/** 一关的难度配置。 */
export interface SheepdogLevel {
  /** 本关羊数。 */
  sheepCount: number
  /** 限时（ms）。 */
  timeLimitMs: number
  /** 狼的数量（第 3 关起 ≥1）。 */
  wolves: number
  /** 场地内缩（px）：越小场地越大。 */
  inset: number
  /** 羊限速（px/s）。 */
  sheepMaxSpeed: number
}

/** 5 关递进配置：羊变多、场地变大、后两关有狼。 */
export const LEVELS: SheepdogLevel[] = [
  { sheepCount: 5, timeLimitMs: 60_000, wolves: 0, inset: 44, sheepMaxSpeed: 92 },
  { sheepCount: 7, timeLimitMs: 65_000, wolves: 0, inset: 34, sheepMaxSpeed: 98 },
  { sheepCount: 9, timeLimitMs: 70_000, wolves: 1, inset: 26, sheepMaxSpeed: 102 },
  { sheepCount: 11, timeLimitMs: 75_000, wolves: 1, inset: 18, sheepMaxSpeed: 108 },
  { sheepCount: 12, timeLimitMs: 80_000, wolves: 2, inset: 10, sheepMaxSpeed: 112 },
]

/** 轴对齐矩形。 */
export interface Rect { x: number, y: number, w: number, h: number }

/** 一只羊：位置、速度、朝向（rad）、恐慌度 0..1、步态相位、入栏状态。 */
export interface Sheep {
  x: number, y: number, vx: number, vy: number
  heading: number, panic: number, legPhase: number
  penned: boolean, slotIndex: number
}

/** 一只狼：位置与速度（朝最近未入栏的羊追；犬近则逃）。 */
export interface Wolf { x: number, y: number, vx: number, vy: number }

/** 牧羊犬：位置、速度、朝向与跑动步态相位。 */
export interface Dog { x: number, y: number, vx: number, vy: number, heading: number, legPhase: number }

/** 草地纹理草簇（关卡开始时由 seed 生成，仅供渲染）。 */
export interface Deco { x: number, y: number, r: number, shade: number }

/** 游戏阶段。 */
export type SheepdogPhase = 'playing' | 'won' | 'lost' | 'campaign-won'

/** 整局状态：campaign 从第 0 关打到第 4 关，跨关累计分数。 */
export interface SheepdogState {
  seed: number
  levelIndex: number
  phase: SheepdogPhase
  dog: Dog
  sheep: Sheep[]
  wolves: Wolf[]
  timeLeftMs: number
  elapsedMs: number
  winTimerMs: number
  stepAccumulatorMs: number
  score: number
  pennedCount: number
  nextSlot: number
  deco: Deco[]
}

/** 玩家方向输入（键盘方向键/WASD 归一后的四布尔）。 */
export interface SheepdogInput { up: boolean, down: boolean, left: boolean, right: boolean }

/**
 * mulberry32 确定性随机数发生器：同 seed 产生同一 [0,1) 序列。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 终局冻结阶段：不再推进任何模拟。 */
function isFrozenPhase(phase: SheepdogPhase): boolean {
  return phase === 'lost' || phase === 'campaign-won'
}

/** 两点距离。 */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

/**
 * 本关草地矩形（不含顶部 HUD）。
 * @param level - 关卡配置。
 * @returns 场地矩形。
 */
export function fieldRect(level: SheepdogLevel): Rect {
  return { x: level.inset, y: HUD_H + level.inset, w: W - level.inset * 2, h: H - HUD_H - level.inset * 2 }
}

/**
 * 围栏矩形：锚在场地右上角。
 * @param level - 关卡配置。
 * @returns 围栏矩形。
 */
export function penRect(level: SheepdogLevel): Rect {
  const f = fieldRect(level)
  return { x: f.x + f.w - PEN_W, y: f.y, w: PEN_W, h: PEN_H }
}

/**
 * 围栏开口中心：下边中点（朝场地内侧）。
 * @param level - 关卡配置。
 * @returns 开口中心坐标。
 */
export function penOpening(level: SheepdogLevel): { x: number, y: number } {
  const p = penRect(level)
  return { x: p.x + p.w / 2, y: p.y + p.h }
}

/** 按黄金角铺开的栏内站位：slotIndex → 栏内相对中心的偏移。 */
function penSlot(pen: Rect, slotIndex: number): { x: number, y: number } {
  const angle = slotIndex * 2.399963
  const r = 8 + (slotIndex % 4) * 8
  return { x: pen.x + pen.w / 2 + Math.cos(angle) * r, y: pen.y + pen.h / 2 + Math.sin(angle) * r }
}

/**
 * 用 seed 派生 rng 重置当前关卡：羊散布在场地左 2/3（远离围栏）、
 * 犬在底部中央、狼在左下角，全部由 (seed, levelIndex) 决定。
 * @param st - 游戏状态（levelIndex 已指向目标关）。
 */
export function startLevel(st: SheepdogState): void {
  const level = LEVELS[st.levelIndex]!
  const rng = mulberry32((st.seed ^ 0x9e3779b9) + (st.levelIndex + 1) * 7919)
  const f = fieldRect(level)
  const pen = penRect(level)

  st.phase = 'playing'
  st.timeLeftMs = level.timeLimitMs
  st.elapsedMs = 0
  st.winTimerMs = 0
  st.stepAccumulatorMs = 0
  st.pennedCount = 0
  st.nextSlot = 0
  st.wolves = []

  st.dog = { x: f.x + f.w / 2, y: f.y + f.h - 24, vx: 0, vy: 0, heading: -Math.PI / 2, legPhase: 0 }

  st.sheep = []
  for (let i = 0; i < level.sheepCount; i += 1) {
    st.sheep.push({
      x: f.x + 14 + rng() * (f.w * 0.62 - 28),
      y: f.y + 14 + rng() * (f.h - 28),
      vx: (rng() - 0.5) * 30,
      vy: (rng() - 0.5) * 30,
      heading: 0,
      panic: 0,
      legPhase: rng() * Math.PI * 2,
      penned: false,
      slotIndex: -1,
    })
  }

  for (let i = 0; i < level.wolves; i += 1) {
    st.wolves.push({ x: f.x + 20 + i * 26, y: f.y + f.h - 18 - i * 14, vx: 0, vy: 0 })
  }

  st.deco = []
  for (let i = 0; i < 30; i += 1) {
    st.deco.push({
      x: f.x + rng() * f.w,
      y: f.y + rng() * f.h,
      r: 3 + rng() * 4,
      shade: rng(),
    })
  }
  void pen
}

/**
 * 开新战役。
 * @param seed - 随机种子（默认取自 Math.random，测试注入固定值）。
 * @returns 第 0 关初始状态。
 */
export function createSheepdog(seed: number = Math.floor(Math.random() * 0x7fffffff)): SheepdogState {
  const st: SheepdogState = {
    seed,
    levelIndex: 0,
    phase: 'playing',
    dog: { x: 0, y: 0, vx: 0, vy: 0, heading: 0, legPhase: 0 },
    sheep: [],
    wolves: [],
    timeLeftMs: 0,
    elapsedMs: 0,
    winTimerMs: 0,
    stepAccumulatorMs: 0,
    score: 0,
    pennedCount: 0,
    nextSlot: 0,
    deco: [],
  }
  startLevel(st)
  return st
}

/**
 * 计算一只未入栏羊的 boids 合力：分离 + 对齐 + 聚合 + 犬斥力 + 狼斥力
 * （纯函数，不改状态；供逻辑与测试共用）。
 * @param st - 游戏状态。
 * @param index - 目标羊下标。
 * @returns 加速度 {ax, ay}（px/s^2）。
 */
export function sheepForces(st: SheepdogState, index: number): { ax: number, ay: number } {
  const s = st.sheep[index]!
  const level = LEVELS[st.levelIndex]!
  let ax = 0
  let ay = 0
  let cohX = 0
  let cohY = 0
  let aliVx = 0
  let aliVy = 0
  let neighbors = 0

  for (let i = 0; i < st.sheep.length; i += 1) {
    if (i === index) continue
    const o = st.sheep[i]!
    if (o.penned) continue
    const d = dist(s.x, s.y, o.x, o.y)
    if (d < 1e-6) continue
    const ux = (o.x - s.x) / d
    const uy = (o.y - s.y) / d
    if (d < SEP_R) {
      // 分离：越近推得越狠。
      const w = (1 - d / SEP_R) * SEP_FORCE
      ax -= ux * w
      ay -= uy * w
    }
    if (d < VIEW_R) {
      cohX += o.x
      cohY += o.y
      aliVx += o.vx
      aliVy += o.vy
      neighbors += 1
    }
  }
  if (neighbors > 0) {
    // 聚合：指向邻居质心。
    const cx = cohX / neighbors
    const cy = cohY / neighbors
    const dc = dist(s.x, s.y, cx, cy)
    if (dc > 1) {
      ax += ((cx - s.x) / dc) * COH_FORCE
      ay += ((cy - s.y) / dc) * COH_FORCE
    }
    // 对齐：转向邻居平均速度。
    ax += (aliVx / neighbors - s.vx) * ALI_WEIGHT
    ay += (aliVy / neighbors - s.vy) * ALI_WEIGHT
  }

  // 犬斥力：半径内按距离线性衰减地推开。
  const dd = dist(s.x, s.y, st.dog.x, st.dog.y)
  if (dd < DOG_R && dd > 1e-6) {
    const w = (1 - dd / DOG_R) * DOG_FORCE
    ax += ((s.x - st.dog.x) / dd) * w
    ay += ((s.y - st.dog.y) / dd) * w
  }

  // 狼斥力：同形状、稍弱（狼主要靠贴身引发恐慌）。
  for (const wolf of st.wolves) {
    const dw = dist(s.x, s.y, wolf.x, wolf.y)
    if (dw < DOG_R && dw > 1e-6) {
      const w = (1 - dw / DOG_R) * DOG_FORCE * 0.8
      ax += ((s.x - wolf.x) / dw) * w
      ay += ((s.y - wolf.y) / dw) * w
    }
  }

  // 无 rng 的轻微游荡：按时间与下标的正弦扰动，让静止羊群缓缓打转。
  const wob = Math.sin(st.elapsedMs / 900 + index * 2.1) * 14
  ax += Math.cos(index * 1.7 + st.elapsedMs / 2300) * wob
  ay += Math.sin(index * 1.3 + st.elapsedMs / 1900) * wob
  void level
  return { ax, ay }
}

/** 点钳制在矩形内（含半径边距），返回是否被钳制。 */
function clampToRect(p: { x: number, y: number }, f: Rect, r: number): boolean {
  const minX = f.x + r, maxX = f.x + f.w - r
  const minY = f.y + r, maxY = f.y + f.h - r
  let hit = false
  if (p.x < minX) { p.x = minX; hit = true }
  if (p.x > maxX) { p.x = maxX; hit = true }
  if (p.y < minY) { p.y = minY; hit = true }
  if (p.y > maxY) { p.y = maxY; hit = true }
  return hit
}

/**
 * 单个固定子步：犬移动、羊 boids 积分、狼追逃、入栏判定、计时与
 * 过关推进。全部确定性，不使用随机数。
 * @param st - 游戏状态。
 * @param input - 玩家方向输入。
 */
function substep(st: SheepdogState, input: SheepdogInput): void {
  const level = LEVELS[st.levelIndex]!
  const f = fieldRect(level)
  const dt = SUBSTEP_MS / 1000

  // 犬：方向键归一化连续移动，贴墙钳制。
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0)
  const dl = Math.hypot(dx, dy)
  if (dl > 0) { dx /= dl; dy /= dl }
  st.dog.vx = dx * DOG_SPEED
  st.dog.vy = dy * DOG_SPEED
  st.dog.x += st.dog.vx * dt
  st.dog.y += st.dog.vy * dt
  clampToRect(st.dog, f, 9)
  if (dl > 0) st.dog.heading = Math.atan2(dy, dx)
  st.dog.legPhase += Math.hypot(st.dog.vx, st.dog.vy) * dt * 0.06

  // 未入栏羊：boids 力 → 限速 → 积分 → 贴墙反弹。
  const opening = penOpening(level)
  for (let i = 0; i < st.sheep.length; i += 1) {
    const s = st.sheep[i]!
    if (s.penned) continue
    const force = sheepForces(st, i)
    // 贴墙避让：离场边越近，指向场内的转向力越强（叠加在 boids 力上）。
    // 原实现只钳制位置+反弹 ×0.4——犬从内侧逼近时逃离力持续把羊压在墙上
    // 卡死（玩家无法再赶离边缘）。避让力让羊沿墙滑走而非钉死。
    const WALL_AVOID_R = 70
    const wallF = 260
    const minX = f.x + SHEEP_R + WALL_AVOID_R, maxX = f.x + f.w - SHEEP_R - WALL_AVOID_R
    const minY = f.y + SHEEP_R + WALL_AVOID_R, maxY = f.y + f.h - SHEEP_R - WALL_AVOID_R
    let wax = 0
    let way = 0
    if (s.x < minX) wax += (minX - s.x) / WALL_AVOID_R
    if (s.x > maxX) wax -= (s.x - maxX) / WALL_AVOID_R
    if (s.y < minY) way += (minY - s.y) / WALL_AVOID_R
    if (s.y > maxY) way -= (s.y - maxY) / WALL_AVOID_R
    s.vx += (force.ax + wax * wallF) * dt
    s.vy += (force.ay + way * wallF) * dt
    s.vx *= DRAG_PER_SUBSTEP
    s.vy *= DRAG_PER_SUBSTEP
    const maxV = level.sheepMaxSpeed * (1 + s.panic * (PANIC_SPEED_FACTOR - 1))
    const sp = Math.hypot(s.vx, s.vy)
    if (sp > maxV) { s.vx = (s.vx / sp) * maxV; s.vy = (s.vy / sp) * maxV }
    s.x += s.vx * dt
    s.y += s.vy * dt
    if (clampToRect(s, f, SHEEP_R)) { s.vx *= -0.4; s.vy *= -0.4 }
    if (sp > 6) s.heading = Math.atan2(s.vy, s.vx)
    s.legPhase += sp * dt * 0.07
    s.panic = Math.max(0, s.panic - PANIC_DECAY_PER_S * dt)

    if (dist(s.x, s.y, st.dog.x, st.dog.y) < DOG_R) s.panic = 1

    // 入栏判定：距开口中心不足半径即锁定入栏。
    if (dist(s.x, s.y, opening.x, opening.y) < PEN_OPEN_R) {
      s.penned = true
      s.slotIndex = st.nextSlot
      st.nextSlot += 1
      st.pennedCount += 1
      st.score += SCORE_PER_SHEEP
    }
  }

  // 已入栏羊：滑向栏内站位，不再受任何力，永不出栏。
  const pen = penRect(level)
  for (const s of st.sheep) {
    if (!s.penned) continue
    const slot = penSlot(pen, s.slotIndex)
    const d = dist(s.x, s.y, slot.x, slot.y)
    if (d > 2) {
      s.x += ((slot.x - s.x) / d) * Math.min(PEN_SLOT_SPEED * dt, d)
      s.y += ((slot.y - s.y) / d) * Math.min(PEN_SLOT_SPEED * dt, d)
      s.heading = Math.atan2(slot.y - s.y, slot.x - s.x)
      s.legPhase += 0.5 * dt * 10
    }
    s.panic = Math.max(0, s.panic - PANIC_DECAY_PER_S * dt)
    s.vx = 0
    s.vy = 0
  }

  // 狼：犬在恐惧半径内 → 逃离犬；否则追最近的未入栏羊；
  // 贴身则羊恐慌并被打飞一股冲量（但不移除，仍可入栏）。
  for (const wolf of st.wolves) {
    const dd = dist(wolf.x, wolf.y, st.dog.x, st.dog.y)
    let tx: number, ty: number
    if (dd < WOLF_FEAR_R && dd > 1e-6) {
      tx = wolf.x + (wolf.x - st.dog.x) / dd * 50
      ty = wolf.y + (wolf.y - st.dog.y) / dd * 50
    } else {
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < st.sheep.length; i += 1) {
        const s = st.sheep[i]!
        if (s.penned) continue
        const d = dist(wolf.x, wolf.y, s.x, s.y)
        if (d < bestD) { bestD = d; best = i }
      }
      if (best >= 0) {
        tx = st.sheep[best]!.x
        ty = st.sheep[best]!.y
      } else {
        tx = f.x + f.w / 2
        ty = f.y + f.h / 2
      }
    }
    const dw = dist(wolf.x, wolf.y, tx, ty)
    if (dw > 1e-6) {
      wolf.vx = ((tx - wolf.x) / dw) * WOLF_SPEED
      wolf.vy = ((ty - wolf.y) / dw) * WOLF_SPEED
    } else {
      wolf.vx = 0
      wolf.vy = 0
    }
    wolf.x += wolf.vx * dt
    wolf.y += wolf.vy * dt
    clampToRect(wolf, f, 8)
    for (const s of st.sheep) {
      if (s.penned) continue
      if (dist(wolf.x, wolf.y, s.x, s.y) < WOLF_CATCH_R) {
        const d2 = dist(wolf.x, wolf.y, s.x, s.y)
        if (d2 > 1e-6) {
          s.panic = 1
          s.vx += ((s.x - wolf.x) / d2) * 140
          s.vy += ((s.y - wolf.y) / d2) * 140
        }
      }
    }
  }

  st.elapsedMs += SUBSTEP_MS

  if (st.phase === 'playing') {
    st.timeLeftMs -= SUBSTEP_MS
    if (st.timeLeftMs <= 0) {
      st.timeLeftMs = 0
      st.phase = 'lost'
      return
    }
    if (st.pennedCount >= st.sheep.length && st.sheep.length > 0) {
      st.phase = 'won'
      st.winTimerMs = 0
      st.score += Math.ceil(st.timeLeftMs / 1000) * SCORE_PER_SECOND_LEFT
      return
    }
  } else if (st.phase === 'won') {
    st.winTimerMs += SUBSTEP_MS
    if (st.winTimerMs >= WIN_LINGER_MS) {
      if (st.levelIndex >= LEVELS.length - 1) {
        st.phase = 'campaign-won'
      } else {
        st.levelIndex += 1
        startLevel(st)
      }
    }
  }
}

/**
 * 推进游戏：把 dtMs 累加到子步累加器并执行整数个 SUBSTEP_MS 子步
 * （余量留到下一帧），保证任意切分方式下积分确定。
 * won 阶段继续跑（栏内滑行与自动进关）；lost / campaign-won 冻结。
 * @param st - 游戏状态。
 * @param dtMs - 距上帧毫秒数（钳制到 [0,100]）。
 * @param input - 玩家方向输入。
 */
export function stepSheepdog(st: SheepdogState, dtMs: number, input: SheepdogInput): void {
  if (isFrozenPhase(st.phase)) return
  const clamped = Math.max(0, Math.min(100, dtMs))
  st.stepAccumulatorMs += clamped
  while (st.stepAccumulatorMs >= SUBSTEP_MS) {
    st.stepAccumulatorMs -= SUBSTEP_MS
    substep(st, input)
    if (isFrozenPhase(st.phase)) break
  }
}
