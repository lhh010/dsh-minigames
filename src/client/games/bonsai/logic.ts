/**
 * 盆栽大师纯逻辑：程序化树木养成状态机。树 = 节点树（seed 生成主干基形），
 * 能量自根向上流动（每 tick 每节点获得基础能量 × 水分/肥料/修剪增益 × 光照
 * 展开度，再把储备以上的盈余按权重分流给子枝，最直上的子枝获顶端优势 ×1.4）；
 * 能量过阈值且子枝数 < 3 即萌发新枝（方向 = 父枝角度 ± 随机 spread，并按太阳
 * 方位角做趋光偏置）。照料四操作：浇水（每日 1 次额度，生长 ×2 持续 1 游戏日，
 * 超量浇水烂根，烂根 3 次树死）、修剪（剪掉整棵子树，其能量转给兄弟枝，剪得越
 * 狠剩余枝生长越快）、光照（太阳方位 ∈ [-1,1] 拖动改变）、施肥（库存 3 袋，
 * 全体生长 +50% 持续 1 游戏日）。评分 = 树冠轮廓与目标树型的网格 IoU ×40 +
 * 密度 ×25 + 健康 ×25 + 高度区间 ×10，≥70 过关；共 5 关（圆锥/层云/斜干/双干/
 * 悬崖）。全部为确定性纯函数（随机走注入 seed 的 mulberry32），无 DOM、无计时器。
 */

/** 一关的目标树型。 */
export type ShapeKind = 'cone' | 'cloud' | 'slant' | 'twin' | 'cascade'

/** 一关的难度与评分参数。 */
export interface BonsaiLevel {
  /** 中文树型名（HUD 展示）。 */
  name: string
  /** 目标轮廓种类。 */
  shape: ShapeKind
  /** 目标冠幅半宽（px，局部坐标，x 相对树根）。 */
  crownW: number
  /** 目标冠幅高度（px，局部坐标，y 向上，自土面起）。 */
  crownH: number
  /** 冠顶高度下限（高度因子满分区间的下沿）。 */
  minH: number
  /** 冠顶高度上限（高度因子满分区间的上沿）。 */
  maxH: number
  /** 目标叶片数（密度因子的满分数）。 */
  targetLeaves: number
}

/** 5 关递进：圆锥 → 层云 → 斜干 → 双干 → 悬崖。 */
export const LEVELS: BonsaiLevel[] = [
  { name: '圆锥', shape: 'cone', crownW: 170, crownH: 240, minH: 150, maxH: 260, targetLeaves: 26 },
  { name: '层云', shape: 'cloud', crownW: 210, crownH: 210, minH: 130, maxH: 230, targetLeaves: 34 },
  { name: '斜干', shape: 'slant', crownW: 170, crownH: 220, minH: 130, maxH: 240, targetLeaves: 30 },
  { name: '双干', shape: 'twin', crownW: 230, crownH: 200, minH: 120, maxH: 220, targetLeaves: 36 },
  { name: '悬崖', shape: 'cascade', crownW: 170, crownH: 220, minH: 30, maxH: 140, targetLeaves: 28 },
]

/** 一个游戏日包含的 tick 数（tick 自动推进游戏日）。 */
export const DAY_TICKS = 24
/** index 层逻辑 tick 间隔（毫秒）。 */
export const TICK_MS = 240
/** 每 tick 每节点基础能量。 */
export const BASE_ENERGY = 1
/** 光照展开度系数：增益 = 1 + LIGHT_K × min(1, |x| / SPREAD_REF)。 */
export const LIGHT_K = 0.5
/** 展开度饱和参考（px）。 */
export const SPREAD_REF = 120
/** 顶端优势加成：父枝最直上的子枝能量增益 ×1.4。 */
export const UPRIGHT_BONUS = 1.4
/** 节点能量储备下限：储备以上的盈余才向子枝分流。 */
export const FLOW_RESERVE = 4
/** 每 tick 分流给子枝的盈余份额。 */
export const FLOW_RATE = 0.5
/** 萌发所需能量阈值。 */
export const SPROUT_ENERGY = 10
/** 萌发时父枝支付的能量成本。 */
export const SPROUT_COST = 6
/** 单节点子枝数上限。 */
export const MAX_CHILDREN = 3
/** 新枝方向随机 spread（弧度）。 */
export const SPROUT_SPREAD = 0.5
/** 趋光偏置系数：新枝角度向太阳方位偏置 sunAngle × PHOTO_K 弧度。 */
export const PHOTO_K = 0.35
/** 偏角绝对值上限（弧度，约 77°）。 */
export const ANGLE_LIMIT = 1.35
/** 新枝初始长度（px）。 */
export const INITIAL_LEN = 8
/** 每 tick 枝长微伸速率（px，乘生长增益）。 */
export const EXTEND_RATE = 0.12
/** 单节枝长上限（px）。 */
export const MAX_LEN = 52
/** 修剪增益：pruneMult = 1 + PRUNE_K × 累计剪除比例（封顶 PRUNE_MAX）。 */
export const PRUNE_K = 0.6
/** 修剪增益封顶。 */
export const PRUNE_MAX = 2.5
/** 施肥开局库存（袋）。 */
export const FERT_STOCK = 3
/** 施肥生长倍率。 */
export const FERT_MULT = 1.5
/** 浇水生长倍率。 */
export const WATER_MULT = 2
/** 每次烂根的健康损失。 */
export const ROT_HEALTH = 34
/** 烂根次数上限：达到即树死。 */
export const ROT_LIMIT = 3
/** 每 tick 健康自然恢复。 */
export const HEALTH_REGEN = 1
/** 过关分数线。 */
export const SCORE_PASS = 70
/** 评分离散网格：局部坐标范围与格宽（IoU 近似用）。 */
export const GRID_X0 = -180
export const GRID_Y0 = -380
export const GRID_X1 = 180
export const GRID_Y1 = 40
export const GRID_CELL = 10
/** 树根在逻辑画布上的锚点（渲染层与交互层共用）。 */
export const ROOT_X = 480
export const SOIL_Y = 560

/** 树的一个节点（一节枝）。 */
export interface BonsaiNode {
  /** 唯一 id（创建顺序递增，父节点 id 恒小于子节点）。 */
  id: number
  /** 父节点 id；根为 null。 */
  parentId: number | null
  /** 子节点 id 列表。 */
  children: number[]
  /** 深度（根为 0）。 */
  depth: number
  /** 绝对分枝角（弧度，0 = 竖直向上，右正左负）。 */
  angle: number
  /** 本节枝长（px，逐 tick 微伸）。 */
  length: number
  /** 当前能量。 */
  energy: number
}

/** 一局阶段：playing 进行 / won 过关 / dead 树枯死。 */
export type BonsaiPhase = 'playing' | 'won' | 'dead'

/** 一局状态。 */
export interface BonsaiState {
  phase: BonsaiPhase
  /** 0 起的关卡下标。 */
  levelIndex: number
  /** 当前游戏日（1 起）。 */
  day: number
  /** 今天已流逝的 tick 数。 */
  dayTicks: number
  /** 开局以来的总 tick 数。 */
  tickTotal: number
  /** 全部存活节点（含根，id 升序）。 */
  nodes: BonsaiNode[]
  /** 下一个分配节点 id。 */
  nextId: number
  /** 今日浇水额度（每日开始时重置为 1）。 */
  waterQuota: number
  /** 浇水增益剩余游戏日（>0 时生长 ×2）。 */
  waterBoostDays: number
  /** 肥料库存。 */
  fertStock: number
  /** 施肥增益剩余游戏日（>0 时生长 ×1.5）。 */
  fertBoostDays: number
  /** 太阳方位 ∈ [-1,1]（-1 正左，0 正上，1 正右），驱动趋光性。 */
  sunAngle: number
  /** 修剪增益倍率（≥1，剪除越多越大，封顶 PRUNE_MAX）。 */
  pruneMult: number
  /** 累计剪除节点占累计总节点数的比例（修剪增益的依据）。 */
  prunedFraction: number
  /** 烂根次数。 */
  rotCount: number
  /** 健康度 0-100（烂根扣分，逐 tick 自然恢复）。 */
  health: number
  /** 最近一次评分总分（HUD 与 onScore 上报）。 */
  lastScore: number
  /** 注入的随机源（萌发方向专用，每 tick 至多每节点一次）。 */
  rng: () => number
}

/** 评分四因子合成结果。 */
export interface BonsaiScore {
  /** 树冠轮廓与目标树型的网格 IoU 近似 ∈ [0,1]。 */
  iou: number
  /** 密度：叶片数 / 目标叶片数（封顶 1）。 */
  density: number
  /** 健康因子：health / 100。 */
  health: number
  /** 高度区间因子 ∈ [0,1]。 */
  height: number
  /** 总分 = iou×40 + density×25 + health×25 + height×10（0-100 取整）。 */
  total: number
  /** 是否达到过关线 SCORE_PASS。 */
  passed: boolean
}

/**
 * mulberry32 确定性伪随机数发生器（与 farm/burger 同构造）。
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

/**
 * 创建一关初始状态：单根主干（无随机消耗，全部随机性发生在 tick 内）。
 * @param seed - 注入的随机种子，同种子逐局可复现。
 * @param levelIndex - 0 起的关卡下标（越界钳到最后一关）。
 * @returns 就绪的 BonsaiState（phase='playing'）。
 */
export function createBonsaiState(seed: number, levelIndex: number): BonsaiState {
  const idx = Math.min(LEVELS.length - 1, Math.max(0, levelIndex))
  return {
    phase: 'playing',
    levelIndex: idx,
    day: 1,
    dayTicks: 0,
    tickTotal: 0,
    nodes: [{ id: 0, parentId: null, children: [], depth: 0, angle: 0, length: 32, energy: SPROUT_ENERGY * 0.5 }],
    nextId: 1,
    waterQuota: 1,
    waterBoostDays: 0,
    fertStock: FERT_STOCK,
    fertBoostDays: 0,
    sunAngle: 0,
    pruneMult: 1,
    prunedFraction: 0,
    rotCount: 0,
    health: 100,
    lastScore: 0,
    rng: mulberry32(seed),
  }
}

/**
 * 每节点末端位置（局部坐标：树根为原点，y 向上）。父节点 id 恒小于子节点，
 * 按数组顺序单遍即可求出。
 * @param state - 游戏状态。
 * @returns 节点 id → 末端位置。
 */
export function nodeEndPositions(state: BonsaiState): Map<number, { x: number, y: number }> {
  const map = new Map<number, { x: number, y: number }>()
  for (const n of state.nodes) {
    if (n.parentId === null) {
      map.set(n.id, { x: 0, y: n.length })
      continue
    }
    const p = map.get(n.parentId)!
    map.set(n.id, {
      x: p.x + Math.sin(n.angle) * n.length,
      y: p.y + Math.cos(n.angle) * n.length,
    })
  }
  return map
}

/** 每个父节点最直上子枝的 id 集合（顶端优势判定，|angle| 最小者，平取先者）。 */
function uprightChildren(state: BonsaiState): Set<number> {
  const set = new Set<number>()
  for (const n of state.nodes) {
    if (n.children.length === 0) continue
    let best = n.children[0]!
    let bestAbs = Number.POSITIVE_INFINITY
    for (const cid of n.children) {
      const c = state.nodes.find((m) => m.id === cid)
      if (c === undefined) continue
      if (Math.abs(c.angle) < bestAbs) {
        bestAbs = Math.abs(c.angle)
        best = cid
      }
    }
    set.add(best)
  }
  return set
}

/**
 * 当前生长总倍率：浇水 × 施肥 × 修剪增益合成。
 * @param state - 游戏状态。
 * @returns ≥1 的生长倍率。
 */
export function growthMult(state: BonsaiState): number {
  const waterMult = state.waterBoostDays > 0 ? WATER_MULT : 1
  const fertMult = state.fertBoostDays > 0 ? FERT_MULT : 1
  return waterMult * fertMult * state.pruneMult
}

/**
 * 某节点本 tick 的能量增益：基础能量 × 生长倍率 × 光照展开度（越外越晒）
 * × 顶端优势（父枝最直上子枝 ×UPRIGHT_BONUS）。供 tickBonsai 与测试共用。
 * @param state - 游戏状态。
 * @param node - 目标节点。
 * @returns 本 tick 应获得的能量。
 */
export function nodeGain(state: BonsaiState, node: BonsaiNode): number {
  const pos = nodeEndPositions(state)
  const upright = uprightChildren(state)
  return gainFor(state, node, pos, upright)
}

function gainFor(
  state: BonsaiState,
  node: BonsaiNode,
  pos: Map<number, { x: number, y: number }>,
  upright: Set<number>,
): number {
  const end = pos.get(node.id) ?? { x: 0, y: 0 }
  const spread = Math.min(1, Math.abs(end.x) / SPREAD_REF)
  let g = BASE_ENERGY * growthMult(state) * (1 + LIGHT_K * spread)
  if (upright.has(node.id)) g *= UPRIGHT_BONUS
  return g
}

/** 游戏日翻页：日计数、浇水额度重置、浇水/施肥增益各减 1 游戏日。 */
function rollDay(state: BonsaiState): void {
  state.day += 1
  state.dayTicks = 0
  state.waterQuota = 1
  if (state.waterBoostDays > 0) state.waterBoostDays -= 1
  if (state.fertBoostDays > 0) state.fertBoostDays -= 1
}

/** 翻页后评分并判定过关。 */
function evaluate(state: BonsaiState): void {
  const score = scoreBonsai(state)
  state.lastScore = score.total
  if (score.passed) state.phase = 'won'
}

/**
 * 推进一个逻辑 tick：计时/翻页 → 能量增益（基础 × 倍率 × 光照 × 顶端优势）
 * → 能量自根向上分流（储备以上盈余按 1 / 1.4 权重给子枝）→ 萌发新枝（阈值
 * + 子数上限 + 随机 spread + 趋光偏置）→ 枝长微伸 → 健康恢复。翻页时评分。
 * @param state - 游戏状态（原地突变）。
 */
export function tickBonsai(state: BonsaiState): void {
  if (state.phase !== 'playing') return
  state.tickTotal += 1
  state.dayTicks += 1
  let newDay = false
  if (state.dayTicks >= DAY_TICKS) {
    rollDay(state)
    newDay = true
  }
  const mult = growthMult(state)
  const pos = nodeEndPositions(state)
  const upright = uprightChildren(state)
  // 1) 能量增益
  for (const n of state.nodes) n.energy += gainFor(state, n, pos, upright)
  // 2) 能量自根向上分流：储备以上盈余的 FLOW_RATE 份额按权重给子枝
  for (const n of [...state.nodes]) {
    if (n.children.length === 0) continue
    const surplus = n.energy - FLOW_RESERVE
    if (surplus <= 0) continue
    const distribute = surplus * FLOW_RATE
    let weightSum = 0
    for (const cid of n.children) weightSum += upright.has(cid) ? UPRIGHT_BONUS : 1
    if (weightSum <= 0) continue
    for (const cid of n.children) {
      const w = upright.has(cid) ? UPRIGHT_BONUS : 1
      const child = state.nodes.find((m) => m.id === cid)
      if (child !== undefined) child.energy += (distribute * w) / weightSum
    }
    n.energy -= distribute
  }
  // 3) 萌发新枝（遍历快照，新枝不进本次遍历）
  for (const n of [...state.nodes]) {
    if (n.energy < SPROUT_ENERGY || n.children.length >= MAX_CHILDREN) continue
    const r = state.rng()
    const offset = (r * 2 - 1) * SPROUT_SPREAD + state.sunAngle * PHOTO_K
    const angle = Math.max(-ANGLE_LIMIT, Math.min(ANGLE_LIMIT, n.angle + offset))
    const child: BonsaiNode = {
      id: state.nextId,
      parentId: n.id,
      children: [],
      depth: n.depth + 1,
      angle,
      length: INITIAL_LEN,
      energy: 0,
    }
    state.nextId += 1
    n.energy -= SPROUT_COST
    n.children.push(child.id)
    state.nodes.push(child)
  }
  // 4) 枝长微伸（根干固定在盆土中不伸）
  for (const n of state.nodes) {
    if (n.parentId === null) continue
    n.length = Math.min(MAX_LEN, n.length + EXTEND_RATE * mult)
  }
  // 5) 健康恢复
  if (state.health < 100) state.health = Math.min(100, state.health + HEALTH_REGEN)
  if (newDay) evaluate(state)
}

/**
 * 立即推进 1 个游戏日（空格键）：翻页、重置浇水额度、衰减增益并评分。
 * @param state - 游戏状态。
 * @returns 是否成功推进（非 playing 阶段返回 false）。
 */
export function advanceDay(state: BonsaiState): boolean {
  if (state.phase !== 'playing') return false
  rollDay(state)
  evaluate(state)
  return true
}

/**
 * 浇水：有今日额度则消耗之并获得 1 游戏日 ×2 生长增益；额度已尽再浇即烂根
 * （健康 -ROT_HEALTH，烂根达 ROT_LIMIT 次树死）。
 * @param state - 游戏状态。
 * @returns 'watered' 浇上 / 'rotted' 烂根 / 'rotted-dead' 烂根致死 / 'not-playing'。
 */
export function water(state: BonsaiState): 'watered' | 'rotted' | 'rotted-dead' | 'not-playing' {
  if (state.phase !== 'playing') return 'not-playing'
  if (state.waterQuota > 0) {
    state.waterQuota -= 1
    state.waterBoostDays = 1
    return 'watered'
  }
  state.rotCount += 1
  state.health = Math.max(0, state.health - ROT_HEALTH)
  if (state.rotCount >= ROT_LIMIT || state.health <= 0) {
    state.phase = 'dead'
    return 'rotted-dead'
  }
  return 'rotted'
}

/**
 * 施肥：消耗 1 袋库存，全体生长 ×FERT_MULT 持续 1 游戏日。
 * @param state - 游戏状态。
 * @returns 'fertilized' / 'empty' 库存耗尽 / 'not-playing'。
 */
export function fertilize(state: BonsaiState): 'fertilized' | 'empty' | 'not-playing' {
  if (state.phase !== 'playing') return 'not-playing'
  if (state.fertStock <= 0) return 'empty'
  state.fertStock -= 1
  state.fertBoostDays = 1
  return 'fertilized'
}

/**
 * 修剪：剪掉目标节点的整棵子树（根节点不可剪），被剪子树的能量全部转给
 * 其父枝的剩余子枝（兄弟枝），并按累计剪除比例提升全局修剪增益。
 * @param state - 游戏状态。
 * @param nodeId - 待剪节点 id。
 * @returns 实际剪除的节点数（非法目标返回 0）。
 */
export function pruneNode(state: BonsaiState, nodeId: number): number {
  if (state.phase !== 'playing') return 0
  const target = state.nodes.find((n) => n.id === nodeId)
  if (target === undefined || target.parentId === null) return 0
  const removedIds = new Set<number>()
  const stack = [nodeId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (removedIds.has(id)) continue
    removedIds.add(id)
    const node = state.nodes.find((n) => n.id === id)
    if (node !== undefined) stack.push(...node.children)
  }
  let removedEnergy = 0
  for (const n of state.nodes) if (removedIds.has(n.id)) removedEnergy += n.energy
  const total = state.nodes.length
  state.nodes = state.nodes.filter((n) => !removedIds.has(n.id))
  const parent = state.nodes.find((n) => n.id === target.parentId)
  if (parent !== undefined) {
    parent.children = parent.children.filter((cid) => cid !== nodeId)
    if (parent.children.length > 0) {
      const share = removedEnergy / parent.children.length
      for (const cid of parent.children) {
        const sibling = state.nodes.find((m) => m.id === cid)
        if (sibling !== undefined) sibling.energy += share
      }
    }
  }
  state.prunedFraction += removedIds.size / total
  state.pruneMult = Math.min(PRUNE_MAX, 1 + PRUNE_K * state.prunedFraction)
  return removedIds.size
}

/**
 * 设置太阳方位（拖动太阳）。
 * @param state - 游戏状态。
 * @param value - 目标方位，钳制到 [-1,1]。
 */
export function setSun(state: BonsaiState, value: number): void {
  state.sunAngle = Math.max(-1, Math.min(1, value))
}

/**
 * 目标树型轮廓判定（局部坐标，树根为原点，y 向上）。
 * @param level - 关卡参数。
 * @param x - 局部横坐标。
 * @param y - 局部纵坐标（向上为正，土面为 0）。
 * @returns 该点是否在目标树冠轮廓内。
 */
export function isInsideTarget(level: BonsaiLevel, x: number, y: number): boolean {
  const hw = level.crownW / 2
  const ch = level.crownH
  switch (level.shape) {
    case 'cone':
      // 圆锥：窄顶宽底的三角冠
      if (y < -10 || y > ch) return false
      return Math.abs(x) <= hw * (1 - y / ch) + 6
    case 'cloud': {
      // 层云：三朵水平云片椭圆（自下而上收窄）
      const pads: Array<[number, number, number, number]> = [
        [0, ch * 0.3, hw, ch * 0.16],
        [0, ch * 0.58, hw * 0.85, ch * 0.16],
        [0, ch * 0.86, hw * 0.6, ch * 0.14],
      ]
      return pads.some(([cx, cy, a, b]) => ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1)
    }
    case 'slant': {
      // 斜干：沿约 31° 斜轴的椭圆冠
      const tilt = 0.55
      const cx = Math.sin(tilt) * ch * 0.55
      const cy = Math.cos(tilt) * ch * 0.55
      const dx = x - cx
      const dy = y - cy
      const rx = dx * Math.cos(tilt) + dy * Math.sin(tilt)
      const ry = -dx * Math.sin(tilt) + dy * Math.cos(tilt)
      return (rx / hw) ** 2 + (ry / (ch * 0.5)) ** 2 <= 1
    }
    case 'twin': {
      // 双干：顶部左右两团冠
      const a = hw * 0.52
      const b = ch * 0.34
      const cy = ch * 0.62
      const off = hw * 0.56
      return ((x - off) / a) ** 2 + ((y - cy) / b) ** 2 <= 1
        || ((x + off) / a) ** 2 + ((y - cy) / b) ** 2 <= 1
    }
    case 'cascade':
      // 悬崖：主冠悬垂于盆沿一侧之下，顶端一小簇
      return ((x - hw * 0.7) / (hw * 0.6)) ** 2 + ((y + ch * 0.25) / (ch * 0.45)) ** 2 <= 1
        || (x / 34) ** 2 + ((y - ch * 0.3) / 26) ** 2 <= 1
  }
}

/** 把树冠栅格化进评分网格：枝段按粗细打点，叶节点末端画圆盘。 */
function rasterizeTree(state: BonsaiState, grid: boolean[], cols: number, rows: number): void {
  const pos = nodeEndPositions(state)
  const mark = (x: number, y: number, radiusCells: number): void => {
    const cx = (x - GRID_X0) / GRID_CELL
    const cy = (GRID_Y1 - y) / GRID_CELL
    const r = Math.ceil(radiusCells)
    for (let gy = Math.floor(cy) - r; gy <= Math.floor(cy) + r; gy += 1) {
      for (let gx = Math.floor(cx) - r; gx <= Math.floor(cx) + r; gx += 1) {
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue
        if ((gx + 0.5 - cx) ** 2 + (gy + 0.5 - cy) ** 2 > radiusCells * radiusCells) continue
        grid[gy * cols + gx] = true
      }
    }
  }
  const byId = new Map(state.nodes.map((n) => [n.id, n]))
  for (const n of state.nodes) {
    const end = pos.get(n.id)!
    if (n.parentId !== null) {
      const start = pos.get(n.parentId)!
      const steps = Math.max(1, Math.ceil((Math.hypot(end.x - start.x, end.y - start.y) / GRID_CELL) * 2))
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps
        mark(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t, 1)
      }
    }
    if (n.children.length === 0 && byId.get(n.parentId ?? -1) !== undefined) {
      mark(end.x, end.y, 2.5)
    }
  }
}

/**
 * 评分：轮廓匹配（树冠与目标树型在固定网格上的 IoU 近似）×40 + 密度
 * （叶片数 / 目标叶片数）×25 + 健康 ×25 + 高度区间 ×10，≥ SCORE_PASS 过关。
 * @param state - 游戏状态。
 * @returns 四因子与总分合成结果。
 */
export function scoreBonsai(state: BonsaiState): BonsaiScore {
  const level = LEVELS[state.levelIndex]!
  const cols = Math.round((GRID_X1 - GRID_X0) / GRID_CELL)
  const rows = Math.round((GRID_Y1 - GRID_Y0) / GRID_CELL)
  const treeGrid = new Array<boolean>(cols * rows).fill(false)
  rasterizeTree(state, treeGrid, cols, rows)
  let inter = 0
  let union = 0
  for (let gy = 0; gy < rows; gy += 1) {
    for (let gx = 0; gx < cols; gx += 1) {
      const x = GRID_X0 + (gx + 0.5) * GRID_CELL
      const y = GRID_Y1 - (gy + 0.5) * GRID_CELL
      const inTree = treeGrid[gy * cols + gx]!
      const inTarget = isInsideTarget(level, x, y)
      if (inTree && inTarget) inter += 1
      if (inTree || inTarget) union += 1
    }
  }
  const iou = union > 0 ? inter / union : 0
  const leaves = state.nodes.filter((n) => n.children.length === 0).length
  const density = Math.min(1, leaves / level.targetLeaves)
  const health = Math.max(0, Math.min(1, state.health / 100))
  const pos = nodeEndPositions(state)
  let top = 0
  for (const n of state.nodes) {
    const end = pos.get(n.id)!
    if (end.y > top) top = end.y
  }
  let height: number
  if (top >= level.minH && top <= level.maxH) height = 1
  else if (top < level.minH) height = level.minH > 0 ? Math.max(0, top / level.minH) : 0
  else height = Math.max(0, 1 - (top - level.maxH) / (0.6 * level.maxH))
  const total = Math.max(0, Math.min(100, Math.round(iou * 40 + density * 25 + health * 25 + height * 10)))
  return { iou, density, health, height, total, passed: total >= SCORE_PASS }
}

/**
 * 树结构快照（深拷贝，可 JSON 序列化）：长 tick 重放确定性对比用。
 * @param state - 游戏状态。
 * @returns 节点数组快照（含子 id 列表副本）。
 */
export function snapshotTree(state: BonsaiState): BonsaiNode[] {
  return state.nodes.map((n) => ({ ...n, children: [...n.children] }))
}
