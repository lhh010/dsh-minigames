/**
 * 建桥大师 Bridge Builder 纯逻辑：侧视峡谷上的节点—杆件结构求解器。
 * 玩家在整数网格上从两岸锚点向外放置钢梁（按长度计费、受预算约束），
 * 建好后进入测试：小车从左岸驶过，结构按质量—弹簧模型演化（弹簧 +
 * 沿轴阻尼 + 半隐式欧拉，固定 1/240s 子步），杆件应变超过断裂阈值即
 * 断裂并可连锁传播；车达右岸过关，车坠谷底失败。全部函数为纯函数或
 * 确定性状态机（不触碰 DOM / 计时器 / Math.random），同输入必得同一
 * 结果，可离线单测。
 */

/**
 * mulberry32 确定性伪随机数生成器（本游戏物理不随机，仅派生视觉杂波
 * 与测试数据）。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0, 1) 区间随机数的函数；同种子必产出同一序列。
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

/** 一个网格节点（整数格坐标；y 向下增大，0 为网格顶）。 */
export interface BridgeNode {
  /** 列（0 起，向右增大）。 */
  x: number
  /** 行（0 起，向下增大；锚点所在行为路面行）。 */
  y: number
}

/** 一关的完整定义（手工模板，五关递进）。 */
export interface BridgeLevel {
  /** 关卡名（HUD 显示）。 */
  name: string
  /** 网格列数（x 上界为 cols-1）。 */
  cols: number
  /** 网格行数（y 上界为 rows-1；路面行之下是峡谷）。 */
  rows: number
  /** 左岸锚点（固定支座，路面行上）。 */
  leftAnchor: BridgeNode
  /** 右岸锚点（固定支座，路面行上）。 */
  rightAnchor: BridgeNode
  /** 中立柱顶端锚点（固定支座，从谷底升起，供下方支撑）。 */
  pillars: BridgeNode[]
  /** 本关预算（杆件总成本不得超过它）。 */
  budget: number
}

/** 一根已放置的钢梁：两端网格节点（无序）。 */
export interface BridgeBeam {
  /** 端点 A。 */
  a: BridgeNode
  /** 端点 B。 */
  b: BridgeNode
}

// ---- 常量（物理与经济参数，测试依赖其确定性） ----

/** 网格单元边长（逻辑像素）。 */
export const CELL = 40
/** 单位长度造价（每格 10，斜梁按欧氏长度取整）。 */
export const BEAM_UNIT_COST = 10
/** 杆件最大格距（欧氏长度；≤2 覆盖直邻 / 对角 / 跨二）。 */
export const MAX_BEAM_LEN = 2.9
/** 断裂应变阈值：|len-rest|/rest 超过它杆件即断。 */
export const BREAK_STRAIN = 0.35
/** 固定物理子步（秒）。 */
export const SUB_DT = 1 / 240
/** 节点质量。 */
const NODE_MASS = 1
/** 弹簧刚度。 */
const SPRING_K = 5000
/** 沿轴阻尼系数。 */
const SPRING_C = 30
/** 重力加速度（逻辑像素 / 秒²）。 */
const GRAVITY = 800
/** 车轮质量。 */
const WHEEL_MASS = 6
/** 车轮半径（逻辑像素）。 */
export const WHEEL_R = 8
/** 车轮间距（逻辑像素）。 */
export const WHEEL_BASE = 30
/** 目标车速（逻辑像素 / 秒）。 */
const CAR_SPEED = 90
/** 车轮纵向驱动追踪系数。 */
const DRIVE_TRACK = 20
/** 车轮—杆件接触刚度。 */
const CONTACT_K = 18000
/** 接触法向阻尼。 */
const CONTACT_C = 560
/** 杆件半厚度（接触半径）。 */
const BEAM_HALF = 3
/** 单次测试最长模拟秒数。 */
export const MAX_RUN_SECONDS = 20

/**
 * 节点序列化键（网格坐标 → 唯一字符串）。
 * @param n 网格节点。
 */
export function nodeKey(n: BridgeNode): string {
  return n.x + ',' + n.y
}

/**
 * 解析节点键（nodeKey 的逆函数；非法键返回 null）。
 * @param key 形如 "x,y" 的键。
 */
export function parseNodeKey(key: string): BridgeNode | null {
  const m = /^(\d+),(\d+)$/.exec(key)
  if (m === null) return null
  return { x: Number(m[1]), y: Number(m[2]) }
}

/**
 * 杆件造价：按两端欧氏格距 × 单价向上取整（最近杆最便宜）。
 * @param a 端点 A。
 * @param b 端点 B。
 */
export function beamCost(a: BridgeNode, b: BridgeNode): number {
  const len = Math.hypot(a.x - b.x, a.y - b.y)
  return Math.max(BEAM_UNIT_COST, Math.ceil(len * BEAM_UNIT_COST))
}

/**
 * 已放置杆件的总造价。
 * @param beams 杆件列表。
 */
export function totalCost(beams: readonly BridgeBeam[]): number {
  let sum = 0
  for (const beam of beams) sum += beamCost(beam.a, beam.b)
  return sum
}

/**
 * 建造网格判定：节点是否在可建区（两锚点列之间、网格顶到路面行）。
 * @param level 关卡定义。
 * @param n 待查节点。
 */
export function inBuildGrid(level: BridgeLevel, n: BridgeNode): boolean {
  const deckRow = level.leftAnchor.y
  return n.x >= level.leftAnchor.x && n.x <= level.rightAnchor.x && n.y >= 0 && n.y <= deckRow
}

/**
 * 是否固定支座（左 / 右岸锚点或中立柱顶）。
 * @param level 关卡定义。
 * @param n 待查节点。
 */
export function isAnchor(level: BridgeLevel, n: BridgeNode): boolean {
  if (n.x === level.leftAnchor.x && n.y === level.leftAnchor.y) return true
  if (n.x === level.rightAnchor.x && n.y === level.rightAnchor.y) return true
  return level.pillars.some(p => p.x === n.x && p.y === n.y)
}

/**
 * 已有结构占据的节点键集合（所有杆件端点）。
 * @param beams 杆件列表。
 */
export function structureNodes(beams: readonly BridgeBeam[]): Set<string> {
  const set = new Set<string>()
  for (const beam of beams) {
    set.add(nodeKey(beam.a))
    set.add(nodeKey(beam.b))
  }
  return set
}

/** 放置校验失败原因。 */
export type PlaceReject = 'grid' | 'length' | 'duplicate' | 'budget' | 'connect'

/**
 * 杆件放置合法性：两端都在可建网格内、欧氏格距不超过上限、不与已有
 * 杆件重复、造价不超预算、且至少一端落在支座或已有结构上（禁止凭空
 * 悬浮杆，保证结构从锚点连通生长）。
 * @param level 关卡定义。
 * @param beams 已放置杆件。
 * @param a 端点 A。
 * @param b 端点 B。
 * @returns 合法返回 null；否则返回失败原因。
 */
export function placeReject(
  level: BridgeLevel,
  beams: readonly BridgeBeam[],
  a: BridgeNode,
  b: BridgeNode,
): PlaceReject | null {
  if (!inBuildGrid(level, a) || !inBuildGrid(level, b)) return 'grid'
  if (a.x === b.x && a.y === b.y) return 'length'
  if (Math.hypot(a.x - b.x, a.y - b.y) > MAX_BEAM_LEN) return 'length'
  const ka = nodeKey(a)
  const kb = nodeKey(b)
  for (const beam of beams) {
    const x1 = nodeKey(beam.a)
    const x2 = nodeKey(beam.b)
    if ((x1 === ka && x2 === kb) || (x1 === kb && x2 === ka)) return 'duplicate'
  }
  if (totalCost(beams) + beamCost(a, b) > level.budget) return 'budget'
  const anchors = new Set<string>([
    nodeKey(level.leftAnchor),
    nodeKey(level.rightAnchor),
    ...level.pillars.map(p => nodeKey(p)),
  ])
  const attached = structureNodes(beams)
  if (!anchors.has(ka) && !anchors.has(kb) && !attached.has(ka) && !attached.has(kb)) return 'connect'
  return null
}

// ---- 物理模拟 ----

/** 模拟节点（质量点）。 */
interface SimNode {
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

/** 模拟杆件（弹簧，两端为 SimNode 下标）。 */
interface SimBeam {
  ai: number
  bi: number
  rest: number
  broken: boolean
}

/** 车轮（质量点 + 目标纵向速度）。 */
interface SimWheel {
  x: number
  y: number
  vx: number
  vy: number
}

/** 单次测试的运行时世界。 */
export interface RunWorld {
  /** 全部质量点（前若干个为 pinned 支座）。 */
  nodes: SimNode[]
  /** 全部弹簧杆件。 */
  beams: SimBeam[]
  /** 两个车轮（前轮在后）。 */
  wheels: SimWheel[]
  /** 已模拟秒数。 */
  t: number
  /** running / won（车到右岸）/ failed（车坠谷或超时）。 */
  outcome: 'running' | 'won' | 'failed'
  /** 本子步新断裂杆件下标（渲染转粒子后清空）。 */
  newBreaks: number[]
  /** 全程最大应力比（0 起，≥1 即有杆断裂）。 */
  maxStress: number
  /** 已断裂杆件数。 */
  brokenCount: number
  /** 过关横坐标（右锚点再往右一点）。 */
  goalX: number
  /** 坠谷失败纵坐标。 */
  failY: number
  /** 左岸崖面右边界（其左为实地的路面行）。 */
  groundLX: number
  /** 右岸崖面左边界（其右为实地的路面行）。 */
  groundRX: number
  /** 路面行纵坐标（两岸实地高度）。 */
  deckY: number
  /** 路面行杆件下标（车轮只与它们碰撞；其余为支撑杆）。 */
  deckBeams: number[]
}

/** 谷底失败深度（车轮 y 超过该值即失败）。 */
const FAIL_Y = (deckRowY: number): number => deckRowY + 260

/**
 * 由蓝图构造测试世界：支座节点钉死，杆件按静止几何建立，车轮放在左
 * 锚点上方。
 * @param level 关卡定义。
 * @param beams 玩家蓝图杆件。
 */
export function createRunWorld(level: BridgeLevel, beams: readonly BridgeBeam[]): RunWorld {
  const keyToIndex = new Map<string, number>()
  const nodes: SimNode[] = []
  const nodeAt = (n: BridgeNode, pinned: boolean): number => {
    const key = nodeKey(n)
    const found = keyToIndex.get(key)
    if (found !== undefined) return found
    const idx = nodes.length
    nodes.push({ x: n.x * CELL, y: n.y * CELL, vx: 0, vy: 0, pinned })
    keyToIndex.set(key, idx)
    return idx
  }
  nodeAt(level.leftAnchor, true)
  nodeAt(level.rightAnchor, true)
  for (const p of level.pillars) nodeAt(p, true)
  const simBeams: SimBeam[] = beams.map(beam => {
    const ai = nodeAt(beam.a, false)
    const bi = nodeAt(beam.b, false)
    return {
      ai,
      bi,
      rest: Math.hypot(nodes[ai]!.x - nodes[bi]!.x, nodes[ai]!.y - nodes[bi]!.y),
      broken: false,
    }
  })
  const startX = level.leftAnchor.x * CELL - WHEEL_BASE - 6
  const startY = level.leftAnchor.y * CELL - WHEEL_R - BEAM_HALF - 2
  return {
    nodes,
    beams: simBeams,
    wheels: [
      { x: startX, y: startY, vx: CAR_SPEED, vy: 0 },
      { x: startX + WHEEL_BASE, y: startY, vx: CAR_SPEED, vy: 0 },
    ],
    t: 0,
    outcome: 'running',
    newBreaks: [],
    maxStress: 0,
    brokenCount: 0,
    goalX: level.rightAnchor.x * CELL + 8,
    failY: FAIL_Y(level.leftAnchor.y * CELL),
    groundLX: level.leftAnchor.x * CELL,
    groundRX: level.rightAnchor.x * CELL,
    deckY: level.leftAnchor.y * CELL,
    deckBeams: beams.map((beam, i) => (beam.a.y === DECK_ROW && beam.b.y === DECK_ROW ? i : -1)).filter(i => i >= 0),
  }
}

/**
 * 杆件当前应变应力比：|len-rest| / (rest × BREAK_STRAIN)。0 = 完全
 * 松弛，1 = 达到断裂阈值，≥1 即断。
 * @param world 运行世界。
 * @param beam 杆件下标。
 */
export function stressRatio(world: RunWorld, beam: number): number {
  const b = world.beams[beam]!
  const a = world.nodes[b.ai]!
  const c = world.nodes[b.bi]!
  const len = Math.hypot(a.x - c.x, a.y - c.y)
  return Math.abs(len - b.rest) / (b.rest * BREAK_STRAIN)
}

/**
 * 胡克弹簧轴向力（含沿轴阻尼），供测试直接校验力学。
 * @param rest 静止长度。
 * @param len 当前长度。
 * @param relVel 两端沿轴相对速度（伸长为正）。
 * @returns 轴向力（正 = 拉伸内力）。
 */
export function springForce(rest: number, len: number, relVel: number): number {
  return SPRING_K * (len - rest) + SPRING_C * relVel
}

/**
 * 是否达到断裂条件：应力比 ≥ 1。
 * @param ratio stressRatio 的返回值。
 */
export function shouldBreak(ratio: number): boolean {
  return ratio >= 1
}

/**
 * 推进一个固定子步（1/240s）：车轮驱动 + 接触 → 弹簧内力 → 积分 →
 * 断裂传播 → 胜负判定。确定性：无随机、固定遍历顺序。
 * @param world 运行世界（就地更新）。
 */
export function stepRun(world: RunWorld): void {
  if (world.outcome !== 'running') return
  const nodes = world.nodes
  const beams = world.beams
  // 轴向力累加器（每节点 x/y）。
  const fx = new Array<number>(nodes.length).fill(0)
  const fy = new Array<number>(nodes.length).fill(0)
  const wfx = [0, 0]
  const wfy = [0, 0]

  // 车轮：重力 + 纵向驱动 + 与杆件的接触。
  for (let w = 0; w < 2; w += 1) {
    const wheel = world.wheels[w]!
    wfx[w] = (CAR_SPEED - wheel.vx) * DRIVE_TRACK * WHEEL_MASS
    wfy[w] = GRAVITY * WHEEL_MASS
    // 两岸实地：路面行高的刚性路面（车轮驶上桥前 / 下桥后都有支撑）。
    if (wheel.x <= world.groundLX || wheel.x >= world.groundRX) {
      const reach = WHEEL_R + BEAM_HALF
      const pen = wheel.y - (world.deckY - reach)
      if (pen > 0) {
        const vn = wheel.vy
        const force = Math.max(0, CONTACT_K * pen - CONTACT_C * vn)
        wfy[w]! -= force
      }
    }
    for (const bi of world.deckBeams) {
      const beam = beams[bi]!
      if (beam.broken) continue
      const a = nodes[beam.ai]!
      const b = nodes[beam.bi]!
      const ex = b.x - a.x
      const ey = b.y - a.y
      const lenSq = ex * ex + ey * ey
      if (lenSq === 0) continue
      // 车轮中心到线段的最近点参数 t（钳到 [0,1]）。
      let t = ((wheel.x - a.x) * ex + (wheel.y - a.y) * ey) / lenSq
      t = Math.min(1, Math.max(0, t))
      const cx = a.x + ex * t
      const cy = a.y + ey * t
      let nx = wheel.x - cx
      let ny = wheel.y - cy
      const dist = Math.hypot(nx, ny)
      const reach = WHEEL_R + BEAM_HALF
      if (dist >= reach || dist === 0) continue
      nx /= dist
      ny /= dist
      const pen = reach - dist
      // 接触点速度（两端按 t 插值）。
      const cvx = a.vx * (1 - t) + b.vx * t
      const cvy = a.vy * (1 - t) + b.vy * t
      const vn = (wheel.vx - cvx) * nx + (wheel.vy - cvy) * ny
      const force = Math.max(0, CONTACT_K * pen - CONTACT_C * vn)
      // 车轮受推力，杆件两端按 (1-t)/t 分担反作用力。
      wfx[w]! += force * nx
      wfy[w]! += force * ny
      fx[beam.ai]! -= force * (1 - t) * nx
      fy[beam.ai]! -= force * (1 - t) * ny
      fx[beam.bi]! -= force * t * nx
      fy[beam.bi]! -= force * t * ny
    }
  }

  // 弹簧内力 + 重力。
  for (const beam of beams) {
    if (beam.broken) continue
    const a = nodes[beam.ai]!
    const b = nodes[beam.bi]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    const ux = dx / len
    const uy = dy / len
    const relVel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy
    const f = springForce(beam.rest, len, relVel)
    fx[beam.ai]! += f * ux
    fy[beam.ai]! += f * uy
    fx[beam.bi]! -= f * ux
    fy[beam.bi]! -= f * uy
  }
  for (let i = 0; i < nodes.length; i += 1) {
    if (!nodes[i]!.pinned) fy[i]! += GRAVITY * NODE_MASS
  }

  // 半隐式欧拉积分。
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!
    if (n.pinned) continue
    n.vx += (fx[i]! / NODE_MASS) * SUB_DT
    n.vy += (fy[i]! / NODE_MASS) * SUB_DT
    n.x += n.vx * SUB_DT
    n.y += n.vy * SUB_DT
  }
  for (let w = 0; w < 2; w += 1) {
    const wheel = world.wheels[w]!
    wheel.vx += (wfx[w]! / WHEEL_MASS) * SUB_DT
    wheel.vy += (wfy[w]! / WHEEL_MASS) * SUB_DT
    const wSpeed = Math.hypot(wheel.vx, wheel.vy)
    if (wSpeed > 340) {
      wheel.vx = (wheel.vx / wSpeed) * 340
      wheel.vy = (wheel.vy / wSpeed) * 340
    }
    wheel.x += wheel.vx * SUB_DT
    wheel.y += wheel.vy * SUB_DT
  }
  world.t += SUB_DT

  // 断裂传播 + 应力统计。
  for (let bi = 0; bi < beams.length; bi += 1) {
    const beam = beams[bi]!
    if (beam.broken) continue
    const ratio = stressRatio(world, bi)
    if (ratio > world.maxStress) world.maxStress = ratio
    if (shouldBreak(ratio)) {
      beam.broken = true
      world.brokenCount += 1
      world.newBreaks.push(bi)
    }
  }

  // 胜负：双轮都越过右锚 → won；任一轮坠过谷底深度或超时 → failed。
  const flying = world.wheels[0]!.y < world.deckY - 150 || world.wheels[1]!.y < world.deckY - 150
  if (world.wheels[0]!.x >= world.goalX && world.wheels[1]!.x >= world.goalX && !flying) {
    world.outcome = 'won'
    return
  }
  if (world.wheels[0]!.y > world.failY || world.wheels[1]!.y > world.failY || world.t >= MAX_RUN_SECONDS) {
    world.outcome = 'failed'
  }
}

/**
 * 一次性跑完整场测试（确定性）：步进到出胜负或步数上限。
 * @param level 关卡定义。
 * @param beams 玩家蓝图。
 * @param maxSubsteps 子步上限（默认 20s × 240）。
 * @returns 结束后的世界快照（含 outcome / brokenCount / maxStress）。
 */
export function simulateRun(
  level: BridgeLevel,
  beams: readonly BridgeBeam[],
  maxSubsteps: number = Math.floor(MAX_RUN_SECONDS / SUB_DT),
): RunWorld {
  const world = createRunWorld(level, beams)
  for (let i = 0; i < maxSubsteps; i += 1) {
    stepRun(world)
    if (world.outcome !== 'running') break
  }
  if (world.outcome === 'running') world.outcome = 'failed'
  return world
}

// ---- 手工关卡模板（五关递进：峡谷更宽 / 预算更紧 / 立柱更少） ----

/** 路面行（所有关卡统一，y=6）。 */
export const DECK_ROW = 6
/** 谷底行（渲染用；y=10 以下为深渊）。 */
export const FLOOR_ROW = 10

/** 五关模板：间隙 6 → 11 格，中立柱 1 → 0 根，预算按难度收紧。 */
export const LEVELS: readonly BridgeLevel[] = [
  {
    name: '新手浅谷',
    cols: 15,
    rows: 11,
    leftAnchor: { x: 4, y: DECK_ROW },
    rightAnchor: { x: 10, y: DECK_ROW },
    pillars: [{ x: 7, y: 4 }],
    budget: 420,
  },
  {
    name: '双墩峡谷',
    cols: 16,
    rows: 11,
    leftAnchor: { x: 4, y: DECK_ROW },
    rightAnchor: { x: 11, y: DECK_ROW },
    pillars: [{ x: 7, y: 4 }],
    budget: 440,
  },
  {
    name: '无墩深涧',
    cols: 17,
    rows: 11,
    leftAnchor: { x: 3, y: DECK_ROW },
    rightAnchor: { x: 12, y: DECK_ROW },
    pillars: [],
    budget: 470,
  },
  {
    name: '狂风裂谷',
    cols: 18,
    rows: 11,
    leftAnchor: { x: 3, y: DECK_ROW },
    rightAnchor: { x: 13, y: DECK_ROW },
    pillars: [],
    budget: 500,
  },
  {
    name: '大师天堑',
    cols: 19,
    rows: 11,
    leftAnchor: { x: 3, y: DECK_ROW },
    rightAnchor: { x: 14, y: DECK_ROW },
    pillars: [],
    budget: 530,
  },
]

/**
 * 取关卡定义（越界收敛到首 / 末关）。
 * @param index 0 起的关卡下标。
 */
export function levelFor(index: number): BridgeLevel {
  const clamped = Math.min(Math.max(index, 0), LEVELS.length - 1)
  return LEVELS[clamped]!
}

/**
 * 过关得分：关卡基础分 + 剩余预算（省钱有奖励）。
 * @param levelIndex 0 起关卡下标。
 * @param beams 玩家蓝图（计算造价）。
 */
export function scoreFor(levelIndex: number, beams: readonly BridgeBeam[]): number {
  return (levelIndex + 1) * 1000 + (levelFor(levelIndex).budget - totalCost(beams))
}
