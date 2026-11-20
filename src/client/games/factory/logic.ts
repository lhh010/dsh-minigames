/**
 * 传送带工厂 Factory 纯逻辑：离散 tick 的传送带布局谜题（简化 Factorio）。
 * 关卡 = 固定元素（出口源 / 需求槽 / 种子岩石）+ 玩家放置（四向传送带、
 * 多种配方机器）。每 tick：源按节拍产出原料到面朝的带、机器在周期满后
 * 吐出成品到面朝的带、带上的物品沿带向同步前移一格（依赖递归判定，
 * 长队一 tick 整体前移；对头互撞 / 目标非带 / 需求不匹配 = 堵死红显）。
 * 无 DOM、无全局随机——岩石位置走注入 seed 的 mulberry32，同一 seed
 * 永远生成同一批关卡；参考布局重放可解性由测试验证。
 */

/** 朝向：0=上 1=右 2=下 3=左（右转为 +1 mod 4）。 */
export type Dir = 0 | 1 | 2 | 3

/** 朝向 → 单位位移（下标即 Dir 值）。 */
export const DX = [0, 1, 0, -1]
export const DY = [-1, 0, 1, 0]

/** 物料编码：A/B 原料，A2/B2 精炼料，C/D 成品。 */
export type Mat = 'A' | 'B' | 'A2' | 'B2' | 'C' | 'D'

/** 一种机器配方：吞入 inputs、每 period tick 产出 1 个 output。 */
export interface MachineKind {
  /** 稳定 id（关卡内唯一，放置与命中测试引用）。 */
  readonly id: string
  /** 中文名（按钮与配方角标显示）。 */
  readonly name: string
  /** 单字图标字形（如 '熔' '组' '重'）。 */
  readonly glyph: string
  /** 配方输入（物料 → 需要数量，1..2 种物料）。 */
  readonly inputs: Readonly<Partial<Record<Mat, number>>>
  /** 产出物料。 */
  readonly output: Mat
  /** 产出周期 tick 数（吞齐原料后倒数）。 */
  readonly period: number
}

/** 出口源：面朝方向每 interval tick 产出 1 个 kind 原料。 */
export interface SourceSpec {
  readonly x: number
  readonly y: number
  readonly dir: Dir
  readonly kind: Mat
  readonly interval: number
}

/** 需求槽：收满 product×quota 即完成该槽订单。 */
export interface DemandSpec {
  readonly x: number
  readonly y: number
  readonly product: Mat
  readonly quota: number
}

/** 玩家的一次放置：传送带或机器（machine 为 MachineKind id）。 */
export interface Placement {
  readonly x: number
  readonly y: number
  readonly dir: Dir
  readonly type: 'belt' | 'machine'
  readonly machine?: string
}

/** 关卡原始规格（网格尺寸 + 固定元素 + 配方集 + 约束 + 参考布局）。 */
export interface FactoryLevelSpec {
  readonly id: number
  readonly name: string
  readonly w: number
  readonly h: number
  readonly sources: readonly SourceSpec[]
  readonly demands: readonly DemandSpec[]
  readonly machines: readonly MachineKind[]
  /** 放置数上限（带 + 机器合计，谜题核心约束）。 */
  readonly maxPieces: number
  /** 模拟 tick 上限（超时未达标 = 失败）。 */
  readonly ticks: number
  /** 岩石数量（位置由 seed 决定，避开固定格与参考布局格）。 */
  readonly rockCount: number
  /** 岩石生成种子。 */
  readonly seed: number
  /** 已验证可解的参考布局。 */
  readonly reference: readonly Placement[]
}

/** 格子类型编码（cells 数组元素）。 */
export const CELL_FLOOR = 0
export const CELL_ROCK = 1
export const CELL_SOURCE = 2
export const CELL_DEMAND = 3

/** 解析后的可运行关卡。 */
export interface FactoryLevel {
  readonly id: number
  readonly name: string
  readonly w: number
  readonly h: number
  readonly cells: Uint8Array
  readonly sources: readonly SourceSpec[]
  readonly demands: readonly DemandSpec[]
  readonly machines: readonly MachineKind[]
  readonly kindById: ReadonlyMap<string, MachineKind>
  readonly maxPieces: number
  readonly ticks: number
  readonly reference: readonly Placement[]
}

/**
 * 注入式确定性随机源（mulberry32）。
 * @param seed 种子。
 * @returns 返回 [0,1) 的随机函数；同 seed 同序列。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 解析关卡规格：固定元素入格，并用 spec.seed 生成 rockCount 块岩石。
 * 岩石只落在内部空地（1≤x≤w-2、1≤y≤h-2），永远避开固定格与参考布局
 * 占用的格子——因此任意 seed 下参考布局都保持可解。
 * @param spec 原始规格。
 * @param seedOverride 可选的岩石种子覆盖（测试用）。
 * @returns 解析后的关卡。
 * @throws 固定元素越界 / 机器配方引用未知 id 时抛错（内置数据应加载期暴露）。
 */
export function buildLevel(spec: FactoryLevelSpec, seedOverride?: number): FactoryLevel {
  const { w, h } = spec
  const cells = new Uint8Array(w * h)
  const put = (x: number, y: number, code: number, what: string): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) throw new Error('factory: 关卡 ' + spec.id + ' 的 ' + what + ' 越界 (' + x + ',' + y + ')')
    cells[y * w + x] = code
  }
  for (const s of spec.sources) put(s.x, s.y, CELL_SOURCE, '出口源')
  for (const d of spec.demands) put(d.x, d.y, CELL_DEMAND, '需求槽')
  const rng = mulberry32(seedOverride ?? spec.seed)
  const blocked = new Set<number>()
  spec.sources.forEach((s) => blocked.add(s.y * w + s.x))
  spec.demands.forEach((d) => blocked.add(d.y * w + d.x))
  spec.reference.forEach((p) => blocked.add(p.y * w + p.x))
  const candidates: number[] = []
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x
      if (!blocked.has(i)) candidates.push(i)
    }
  }
  let rocks = spec.rockCount
  while (rocks > 0 && candidates.length > 0) {
    const k = Math.floor(rng() * candidates.length)
    const i = candidates.splice(k, 1)[0]!
    cells[i] = CELL_ROCK
    rocks -= 1
  }
  const kindById = new Map<string, MachineKind>()
  for (const m of spec.machines) kindById.set(m.id, m)
  for (const p of spec.reference) {
    if (p.type === 'machine' && p.machine !== undefined && !kindById.has(p.machine)) {
      throw new Error('factory: 关卡 ' + spec.id + ' 参考布局引用未知机器 ' + p.machine)
    }
  }
  return {
    id: spec.id, name: spec.name, w, h, cells,
    sources: spec.sources, demands: spec.demands, machines: spec.machines,
    kindById, maxPieces: spec.maxPieces, ticks: spec.ticks, reference: spec.reference,
  }
}

/** 组装机配方基准（A+B→C）。 */
const ASM_C: MachineKind = { id: 'asm', name: '组装机', glyph: '组', inputs: { A: 1, B: 1 }, output: 'C', period: 3 }
/** 熔炉配方基准（A→A2）。 */
const FURNACE_A: MachineKind = { id: 'furnace', name: '熔炉', glyph: '熔', inputs: { A: 1 }, output: 'A2', period: 2 }
/** 熔炉 B（B→B2，三级链用）。 */
const FURNACE_B: MachineKind = { id: 'furnaceB', name: '熔炉B', glyph: '炼', inputs: { B: 1 }, output: 'B2', period: 2 }
/** 重型组装机（A2+B2→D，三级链终端）。 */
const HEAVY_D: MachineKind = { id: 'heavy', name: '重型机', glyph: '重', inputs: { A2: 1, B2: 1 }, output: 'D', period: 4 }
/** 精炼组装机（A2+B→C，熔炼链用）。 */
const ASM_A2: MachineKind = { id: 'asm2', name: '组装机', glyph: '组', inputs: { A2: 1, B: 1 }, output: 'C', period: 3 }
/** 重型组装机 B（A2+B→D，双线订单用）。 */
const HEAVY_AB: MachineKind = { id: 'heavyB', name: '重型机', glyph: '重', inputs: { A2: 1, B: 1 }, output: 'D', period: 4 }

/** 内置 5 关：单级组装 → 熔炼+组装 → 极限放置 → 三级链 → 双线订单。 */
export const FACTORY_LEVELS: readonly FactoryLevelSpec[] = [
  {
    id: 0, name: '第一件产品', w: 8, h: 6,
    sources: [
      { x: 0, y: 1, dir: 1, kind: 'A', interval: 4 },
      { x: 0, y: 3, dir: 1, kind: 'B', interval: 4 },
    ],
    demands: [{ x: 7, y: 2, product: 'C', quota: 3 }],
    machines: [ASM_C],
    maxPieces: 16, ticks: 90, rockCount: 2, seed: 11,
    reference: [
      { x: 1, y: 1, dir: 1, type: 'belt' },
      { x: 2, y: 1, dir: 1, type: 'belt' },
      { x: 3, y: 1, dir: 1, type: 'belt' },
      { x: 4, y: 1, dir: 2, type: 'belt' },
      { x: 1, y: 3, dir: 1, type: 'belt' },
      { x: 2, y: 3, dir: 1, type: 'belt' },
      { x: 3, y: 3, dir: 1, type: 'belt' },
      { x: 4, y: 3, dir: 0, type: 'belt' },
      { x: 4, y: 2, dir: 1, type: 'machine', machine: 'asm' },
      { x: 5, y: 2, dir: 1, type: 'belt' },
      { x: 6, y: 2, dir: 1, type: 'belt' },
    ],
  },
  {
    id: 1, name: '熔炼成形', w: 9, h: 6,
    sources: [
      { x: 0, y: 1, dir: 1, kind: 'A', interval: 4 },
      { x: 0, y: 4, dir: 1, kind: 'B', interval: 4 },
    ],
    demands: [{ x: 8, y: 3, product: 'C', quota: 3 }],
    machines: [FURNACE_A, ASM_A2],
    maxPieces: 18, ticks: 110, rockCount: 3, seed: 22,
    reference: [
      { x: 1, y: 1, dir: 1, type: 'belt' },
      { x: 2, y: 1, dir: 1, type: 'belt' },
      { x: 3, y: 1, dir: 1, type: 'machine', machine: 'furnace' },
      { x: 4, y: 1, dir: 2, type: 'belt' },
      { x: 4, y: 2, dir: 2, type: 'belt' },
      { x: 1, y: 4, dir: 1, type: 'belt' },
      { x: 2, y: 4, dir: 1, type: 'belt' },
      { x: 3, y: 4, dir: 1, type: 'belt' },
      { x: 4, y: 4, dir: 0, type: 'belt' },
      { x: 4, y: 3, dir: 1, type: 'machine', machine: 'asm2' },
      { x: 5, y: 3, dir: 1, type: 'belt' },
      { x: 6, y: 3, dir: 1, type: 'belt' },
      { x: 7, y: 3, dir: 1, type: 'belt' },
    ],
  },
  {
    id: 2, name: '精打细算', w: 10, h: 7,
    sources: [
      { x: 0, y: 1, dir: 1, kind: 'A', interval: 4 },
      { x: 0, y: 5, dir: 1, kind: 'B', interval: 4 },
    ],
    demands: [{ x: 9, y: 3, product: 'C', quota: 4 }],
    machines: [FURNACE_A, ASM_A2],
    maxPieces: 15, ticks: 130, rockCount: 4, seed: 33,
    reference: [
      { x: 1, y: 1, dir: 1, type: 'belt' },
      { x: 2, y: 1, dir: 1, type: 'belt' },
      { x: 3, y: 1, dir: 1, type: 'machine', machine: 'furnace' },
      { x: 4, y: 1, dir: 2, type: 'belt' },
      { x: 4, y: 2, dir: 2, type: 'belt' },
      { x: 1, y: 5, dir: 1, type: 'belt' },
      { x: 2, y: 5, dir: 1, type: 'belt' },
      { x: 3, y: 5, dir: 1, type: 'belt' },
      { x: 4, y: 5, dir: 0, type: 'belt' },
      { x: 4, y: 4, dir: 0, type: 'belt' },
      { x: 4, y: 3, dir: 1, type: 'machine', machine: 'asm2' },
      { x: 5, y: 3, dir: 1, type: 'belt' },
      { x: 6, y: 3, dir: 1, type: 'belt' },
      { x: 7, y: 3, dir: 1, type: 'belt' },
      { x: 8, y: 3, dir: 1, type: 'belt' },
    ],
  },
  {
    id: 3, name: '三级流水线', w: 10, h: 7,
    sources: [
      { x: 0, y: 0, dir: 1, kind: 'A', interval: 4 },
      { x: 0, y: 6, dir: 1, kind: 'B', interval: 4 },
    ],
    demands: [{ x: 9, y: 3, product: 'D', quota: 3 }],
    machines: [FURNACE_A, FURNACE_B, HEAVY_D],
    maxPieces: 24, ticks: 140, rockCount: 4, seed: 44,
    reference: [
      { x: 1, y: 0, dir: 1, type: 'belt' },
      { x: 2, y: 0, dir: 1, type: 'machine', machine: 'furnace' },
      { x: 3, y: 0, dir: 1, type: 'belt' },
      { x: 4, y: 0, dir: 1, type: 'belt' },
      { x: 5, y: 0, dir: 1, type: 'belt' },
      { x: 6, y: 0, dir: 2, type: 'belt' },
      { x: 6, y: 1, dir: 2, type: 'belt' },
      { x: 6, y: 2, dir: 2, type: 'belt' },
      { x: 1, y: 6, dir: 1, type: 'belt' },
      { x: 2, y: 6, dir: 1, type: 'machine', machine: 'furnaceB' },
      { x: 3, y: 6, dir: 1, type: 'belt' },
      { x: 4, y: 6, dir: 1, type: 'belt' },
      { x: 5, y: 6, dir: 1, type: 'belt' },
      { x: 6, y: 6, dir: 0, type: 'belt' },
      { x: 6, y: 5, dir: 0, type: 'belt' },
      { x: 6, y: 4, dir: 0, type: 'belt' },
      { x: 6, y: 3, dir: 1, type: 'machine', machine: 'heavy' },
      { x: 7, y: 3, dir: 1, type: 'belt' },
      { x: 8, y: 3, dir: 1, type: 'belt' },
    ],
  },
  {
    id: 4, name: '双线订单', w: 12, h: 8,
    sources: [
      { x: 0, y: 1, dir: 1, kind: 'A', interval: 4 },
      { x: 0, y: 3, dir: 1, kind: 'B', interval: 4 },
      { x: 0, y: 5, dir: 1, kind: 'A', interval: 4 },
      { x: 0, y: 7, dir: 1, kind: 'B', interval: 4 },
    ],
    demands: [
      { x: 11, y: 1, product: 'C', quota: 3 },
      { x: 11, y: 7, product: 'D', quota: 3 },
    ],
    machines: [ASM_C, FURNACE_A, HEAVY_AB],
    maxPieces: 34, ticks: 160, rockCount: 5, seed: 55,
    reference: [
      { x: 1, y: 1, dir: 1, type: 'belt' },
      { x: 2, y: 1, dir: 1, type: 'belt' },
      { x: 3, y: 1, dir: 1, type: 'machine', machine: 'asm' },
      { x: 4, y: 1, dir: 1, type: 'belt' },
      { x: 5, y: 1, dir: 1, type: 'belt' },
      { x: 6, y: 1, dir: 1, type: 'belt' },
      { x: 7, y: 1, dir: 1, type: 'belt' },
      { x: 8, y: 1, dir: 1, type: 'belt' },
      { x: 9, y: 1, dir: 1, type: 'belt' },
      { x: 10, y: 1, dir: 1, type: 'belt' },
      { x: 1, y: 3, dir: 1, type: 'belt' },
      { x: 2, y: 3, dir: 1, type: 'belt' },
      { x: 3, y: 3, dir: 0, type: 'belt' },
      { x: 3, y: 2, dir: 0, type: 'belt' },
      { x: 1, y: 5, dir: 1, type: 'belt' },
      { x: 2, y: 5, dir: 1, type: 'machine', machine: 'furnace' },
      { x: 3, y: 5, dir: 2, type: 'belt' },
      { x: 3, y: 6, dir: 2, type: 'belt' },
      { x: 3, y: 7, dir: 1, type: 'machine', machine: 'heavyB' },
      { x: 1, y: 7, dir: 1, type: 'belt' },
      { x: 2, y: 7, dir: 1, type: 'belt' },
      { x: 4, y: 7, dir: 1, type: 'belt' },
      { x: 5, y: 7, dir: 1, type: 'belt' },
      { x: 6, y: 7, dir: 1, type: 'belt' },
      { x: 7, y: 7, dir: 1, type: 'belt' },
      { x: 8, y: 7, dir: 1, type: 'belt' },
      { x: 9, y: 7, dir: 1, type: 'belt' },
      { x: 10, y: 7, dir: 1, type: 'belt' },
    ],
  },
]

/**
 * 全部内置关卡（按序解析）。
 * @param seedOverride 可选岩石种子覆盖；缺省用各关自带 seed。
 * @returns 解析后的关卡数组（确定性：同 seed 同结果）。
 */
export function getLevels(seedOverride?: number): FactoryLevel[] {
  return FACTORY_LEVELS.map((spec) => buildLevel(spec, seedOverride))
}

/**
 * 校验一组放置是否可用于关卡。
 * @param level 目标关卡。
 * @param placements 待校验放置。
 * @returns null 表示合法；否则为中文错误原因。
 */
export function validatePlacements(level: FactoryLevel, placements: readonly Placement[]): string | null {
  if (placements.length > level.maxPieces) return '放置数超限（最多 ' + level.maxPieces + ' 件）'
  const seen = new Set<number>()
  for (const p of placements) {
    if (p.x < 0 || p.y < 0 || p.x >= level.w || p.y >= level.h) return '放置越界 (' + p.x + ',' + p.y + ')'
    const i = p.y * level.w + p.x
    if (seen.has(i)) return '重复占用 (' + p.x + ',' + p.y + ')'
    seen.add(i)
    if (level.cells[i] !== CELL_FLOOR) return '只能放在空地 (' + p.x + ',' + p.y + ')'
    if (p.type === 'machine') {
      if (p.machine === undefined || !level.kindById.has(p.machine)) return '未知机器种类 ' + String(p.machine)
    }
  }
  return null
}

/** 机器运行态（渲染与测试读取）。 */
export interface MachineView {
  readonly x: number
  readonly y: number
  readonly dir: Dir
  readonly kindId: string
  /** 当前缓冲的各物料数。 */
  readonly buffer: Readonly<Partial<Record<Mat, number>>>
  /** 原料是否已吞齐（吞齐后 progress 递增至 period 产出）。 */
  readonly complete: boolean
  readonly progress: number
  readonly period: number
}

/** 一件在带物品（渲染读取）。 */
export interface ItemView {
  readonly x: number
  readonly y: number
  readonly kind: Mat
  /** 本 tick 刚产出（不参与本 tick 移动，渲染做出现动画）。 */
  readonly fresh: boolean
}

/** 机器内部运行态。 */
interface MachineRT {
  x: number
  y: number
  dir: Dir
  kind: MachineKind
  buffer: Partial<Record<Mat, number>>
  complete: boolean
  progress: number
}

/** 模拟器句柄（index.ts 逐帧驱动，测试直接步进）。 */
export interface FactorySim {
  /** 推进一个 tick（won/timeout 后再调用为空操作）。 */
  step(): void
  /** 已推进的 tick 数（从 0 起，每次 step +1）。 */
  readonly tick: number
  /** running=进行中；won=全部需求槽达标；timeout=tick 耗尽未达标。 */
  readonly status: 'running' | 'won' | 'timeout'
  /** 各需求槽已收数量（与 level.demands 同序）。 */
  readonly demandCounts: readonly number[]
  /** 全部在带物品。 */
  items(): ItemView[]
  /** 本 tick 堵死的格子索引数组（渲染红闪）。 */
  jammed(): number[]
  /** 全部机器运行态（放置序）。 */
  machines(): MachineView[]
}

/**
 * 创建确定性模拟器。
 * @param level 目标关卡。
 * @param placements 玩家放置（需先通过 validatePlacements）。
 * @returns 模拟器句柄。
 * @throws 放置非法时抛错（调用方应先校验）。
 */
export function createSim(level: FactoryLevel, placements: readonly Placement[]): FactorySim {
  const error = validatePlacements(level, placements)
  if (error !== null) throw new Error('factory: ' + error)
  const { w, h } = level
  const pieceAt = new Map<number, Placement>()
  const machinesRT: MachineRT[] = []
  for (const p of placements) {
    pieceAt.set(p.y * w + p.x, p)
    if (p.type === 'machine') {
      const kind = p.machine !== undefined ? level.kindById.get(p.machine) : undefined
      if (kind !== undefined) machinesRT.push({ x: p.x, y: p.y, dir: p.dir, kind, buffer: {}, complete: false, progress: 0 })
    }
  }
  const machineAt = new Map<number, MachineRT>()
  machinesRT.forEach((m) => machineAt.set(m.y * w + m.x, m))
  const demandIndexAt = new Map<number, number>()
  level.demands.forEach((d, i) => demandIndexAt.set(d.y * w + d.x, i))

  const items = new Map<number, Mat>()
  const fresh = new Set<number>()
  const jammedNow = new Set<number>()
  const counts = level.demands.map(() => 0)
  let tick = 0
  let status: FactorySim['status'] = 'running'

  const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h

  /** 机器是否还愿意收该物料（未吞齐且该物料未收满）。 */
  const accepts = (m: MachineRT, kind: Mat): boolean => {
    if (m.complete) return false
    const need = m.kind.inputs[kind]
    if (need === undefined) return false
    return (m.buffer[kind] ?? 0) < need
  }

  /** 吞入一件原料；吞齐则开始产出倒数。 */
  const feed = (m: MachineRT, kind: Mat): void => {
    m.buffer[kind] = (m.buffer[kind] ?? 0) + 1
    for (const mat of Object.keys(m.kind.inputs) as Mat[]) {
      if ((m.buffer[mat] ?? 0) < (m.kind.inputs[mat] ?? 0)) return
    }
    m.complete = true
    m.progress = 0
  }

  /** 尝试向面朝格放出一件物料（目标须为空带）。 */
  const emit = (x: number, y: number, dir: Dir, kind: Mat): boolean => {
    const tx = x + DX[dir]!
    const ty = y + DY[dir]!
    if (!inBounds(tx, ty)) return false
    const ti = ty * w + tx
    const target = pieceAt.get(ti)
    if (target === undefined || target.type !== 'belt') return false
    if (items.has(ti)) return false
    items.set(ti, kind)
    fresh.add(ti)
    return true
  }

  const sim: FactorySim = {
    step(): void {
      if (status !== 'running') return
      tick += 1
      jammedNow.clear()
      // 移动判定前先记录本 tick 的占用让位集合（claimed 兼作产出占位）。
      const claimed = new Set<number>()
      fresh.clear()
      // 1. 出口源按节拍产出（首个 tick 即产出，之后每 interval 一件）。
      for (const src of level.sources) {
        if ((tick - 1) % src.interval !== 0) continue
        const ti = (src.y + DY[src.dir]!) * w + (src.x + DX[src.dir]!)
        const tx = src.x + DX[src.dir]!
        const ty = src.y + DY[src.dir]!
        if (!inBounds(tx, ty)) continue
        const target = pieceAt.get(ty * w + tx)
        if (target === undefined || target.type !== 'belt') continue
        if (items.has(ty * w + tx) || claimed.has(ty * w + tx)) continue
        items.set(ty * w + tx, src.kind)
        fresh.add(ty * w + tx)
        claimed.add(ty * w + tx)
      }
      // 2. 机器周期满后向面朝带吐出成品（带满则停机等待）。
      for (const m of machinesRT) {
        if (!m.complete) continue
        m.progress += 1
        if (m.progress < m.kind.period) continue
        if (emit(m.x, m.y, m.dir, m.kind.output)) {
          m.buffer = {}
          m.complete = false
          m.progress = 0
        }
      }
      // 3. 在带物品同步前移：依赖递归判定——后件等前件让位，长队一 tick
      //    整体前移；对头互撞（环依赖）双方都判堵死。
      const memo = new Map<number, 0 | 1 | 2 | 3>()
      const moveGrants: Array<{ from: number; to: number; kind: Mat }> = []
      const machineGrants: Array<{ from: number; m: MachineRT }> = []
      const demandGrants: Array<{ from: number; d: number }> = []
      const resolve = (i: number): boolean => {
        const st = memo.get(i) ?? 0
        if (st === 2) return true
        if (st === 1 || st === 3) return false
        memo.set(i, 1)
        const kind = items.get(i)!
        const piece = pieceAt.get(i)
        const dir: Dir = piece !== undefined && piece.type === 'belt' ? piece.dir : 1
        const tx = (i % w) + DX[dir]!
        const ty = Math.floor(i / w) + DY[dir]!
        let granted = false
        let to = -1
        if (inBounds(tx, ty)) {
          const ti = ty * w + tx
          const target = pieceAt.get(ti)
          if (target !== undefined && target.type === 'belt') {
            if (!claimed.has(ti)) {
              let free = false
              if (!items.has(ti)) free = true
              else if (fresh.has(ti)) free = false
              else free = resolve(ti)
              if (free) {
                claimed.add(ti)
                granted = true
                to = ti
              }
            }
          } else if (target !== undefined && target.type === 'machine') {
            const m = machineAt.get(ti)
            if (m !== undefined && accepts(m, kind)) {
              granted = true
              to = ti
              machineGrants.push({ from: i, m })
            }
          } else {
            const di = demandIndexAt.get(ti)
            if (di !== undefined && level.demands[di]!.product === kind) {
              granted = true
              to = ti
              demandGrants.push({ from: i, d: di })
            }
          }
        }
        if (granted) {
          memo.set(i, 2)
          if (to >= 0 && pieceAt.get(to) !== undefined && pieceAt.get(to)!.type === 'belt') {
            moveGrants.push({ from: i, to, kind })
          }
        } else {
          memo.set(i, 3)
          jammedNow.add(i)
        }
        return granted
      }
      const keys = [...items.keys()].sort((a, b) => a - b)
      for (const k of keys) {
        if (fresh.has(k)) continue
        resolve(k)
      }
      for (const g of demandGrants) {
        items.delete(g.from)
        counts[g.d] = (counts[g.d] ?? 0) + 1
      }
      for (const g of machineGrants) {
        const kind = items.get(g.from)!
        items.delete(g.from)
        feed(g.m, kind)
      }
      for (const g of moveGrants) {
        items.delete(g.from)
        items.set(g.to, g.kind)
      }
      // 4. 过关 / 超时判定。
      if (level.demands.length > 0 && level.demands.every((d, di) => (counts[di] ?? 0) >= d.quota)) status = 'won'
      else if (tick >= level.ticks) status = 'timeout'
    },
    get tick(): number { return tick },
    get status(): FactorySim['status'] { return status },
    get demandCounts(): readonly number[] { return counts },
    items(): ItemView[] {
      return [...items.entries()].map(([i, kind]) => ({
        x: i % w, y: Math.floor(i / w), kind, fresh: fresh.has(i),
      }))
    },
    jammed(): number[] { return [...jammedNow] },
    machines(): MachineView[] {
      return machinesRT.map((m) => ({
        x: m.x, y: m.y, dir: m.dir, kindId: m.kind.id, buffer: { ...m.buffer },
        complete: m.complete, progress: m.progress, period: m.kind.period,
      }))
    },
  }
  return sim
}

/** runSimulation 的返回摘要。 */
export interface SimSummary {
  status: 'won' | 'timeout'
  ticksUsed: number
  demandCounts: number[]
}

/**
 * 一步到位跑完整局（测试与关卡可解性验证）。
 * @param level 目标关卡。
 * @param placements 玩家放置。
 * @returns 终局摘要（确定性：同输入同输出）。
 */
export function runSimulation(level: FactoryLevel, placements: readonly Placement[]): SimSummary {
  const sim = createSim(level, placements)
  while (sim.status === 'running') sim.step()
  return { status: sim.status, ticksUsed: sim.tick, demandCounts: [...sim.demandCounts] }
}
