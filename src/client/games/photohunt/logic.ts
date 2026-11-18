/**
 * 找茬大师（PhotoHunt）纯逻辑：由注入 seed 程序化生成一张风景场景
 * （房屋/树木/云朵/太阳/小鸟/花朵等 16 种基元随机组合），其中 5 处被
 * 修改（颜色变化/大小变化/旋转/镜像/删除元素）。玩家点击右图差异位置
 * （半径 20px 内）标记找到，点错扣时 3 秒；5 关递进——元素更多、修改
 * 幅度更细微、限时更短。全部函数确定性：相同 seed 与关卡必然得到相同
 * 谜题与判定结果，可离线重放测试。
 */

/** 场景基元种类（16 种，渲染层各自对应一组程序绘制路径）。 */
export type PrimitiveKind =
  | 'sun' | 'cloud' | 'bird' | 'tree' | 'pine' | 'house' | 'flower' | 'bush'
  | 'mountain' | 'fence' | 'kite' | 'windmill' | 'rock' | 'balloon' | 'butterfly' | 'lake'

/** 场景中的一个基元实例（左右两图共用同一坐标系）。 */
export interface SceneElement {
  /** 基元种类。 */
  kind: PrimitiveKind
  /** 面板内中心坐标。 */
  x: number
  y: number
  /** 缩放系数（1 为基准大小）。 */
  scale: number
  /** 旋转角（度，顺时针；非对称基元才有意义）。 */
  rotation: number
  /** 是否水平镜像（仅非对称基元有效）。 */
  flip: boolean
  /** 主体色相（0-359，渲染为 hsl）。 */
  hue: number
}

/** 一处修改的描述与判定位置。 */
export interface HuntDiff {
  /** 被修改基元在左图列表中的下标。 */
  index: number
  /** 修改类型：color 颜色 / scale 大小 / rotate 旋转 / mirror 镜像 / remove 删除。 */
  kind: 'color' | 'scale' | 'rotate' | 'mirror' | 'remove'
  /** 判定圆心（等于基元中心，两侧共用）。 */
  x: number
  y: number
}

/** 一关的谜题：基准场景 + 修改后的右图场景 + 修改点列表。 */
export interface HuntScene {
  /** 左图（基准）基元列表。 */
  left: SceneElement[]
  /** 右图（应用修改后）基元列表；remove 修改会少对应个数。 */
  right: SceneElement[]
  /** 修改点列表（固定 5 处）。 */
  diffs: HuntDiff[]
}

/** 单侧画面（场景图）的逻辑尺寸；两图共用同一坐标系。 */
export const PANEL_W = 330
export const PANEL_H = 248

/** 命中判定半径（逻辑像素）。 */
export const HIT_RADIUS = 20
/** 每关修改点数量。 */
export const DIFF_COUNT = 5
/** 点错一次扣时（秒）。 */
export const MISS_PENALTY_S = 3

/** 关卡难度递进：元素更多、修改幅度更细微（色差/尺寸差/角度差更小）、限时更短。 */
export interface LevelConfig {
  /** 场景基元总数。 */
  elementCount: number
  /** 本关限时（秒）。 */
  timeS: number
  /** 颜色修改的色相偏移量（度）。 */
  colorDelta: number
  /** 大小修改的缩放变化量。 */
  scaleDelta: number
  /** 旋转修改的角度变化量（度）。 */
  rotateDelta: number
}

/** 5 关难度表。 */
export const LEVELS: LevelConfig[] = [
  { elementCount: 12, timeS: 90, colorDelta: 90, scaleDelta: 0.35, rotateDelta: 30 },
  { elementCount: 14, timeS: 80, colorDelta: 70, scaleDelta: 0.3, rotateDelta: 25 },
  { elementCount: 16, timeS: 70, colorDelta: 52, scaleDelta: 0.25, rotateDelta: 20 },
  { elementCount: 18, timeS: 60, colorDelta: 36, scaleDelta: 0.2, rotateDelta: 15 },
  { elementCount: 20, timeS: 50, colorDelta: 22, scaleDelta: 0.15, rotateDelta: 11 },
]

/** 关卡总数。 */
export const LEVEL_COUNT = LEVELS.length

/** mulberry32 确定性随机数发生器（所有随机都走注入 seed）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 基元元数据：基准半径（摆放间距用）、所属高度带、是否可旋转/镜像。 */
interface KindMeta {
  radius: number
  band: 'sky' | 'ground' | 'any'
  canRotate: boolean
  canMirror: boolean
}

const KIND_META: Record<PrimitiveKind, KindMeta> = {
  sun: { radius: 20, band: 'sky', canRotate: false, canMirror: false },
  cloud: { radius: 22, band: 'sky', canRotate: false, canMirror: false },
  bird: { radius: 11, band: 'sky', canRotate: true, canMirror: true },
  tree: { radius: 22, band: 'ground', canRotate: false, canMirror: false },
  pine: { radius: 22, band: 'ground', canRotate: false, canMirror: false },
  house: { radius: 26, band: 'ground', canRotate: true, canMirror: true },
  flower: { radius: 9, band: 'ground', canRotate: false, canMirror: false },
  bush: { radius: 16, band: 'ground', canRotate: false, canMirror: false },
  mountain: { radius: 40, band: 'any', canRotate: false, canMirror: false },
  fence: { radius: 30, band: 'ground', canRotate: true, canMirror: false },
  kite: { radius: 13, band: 'sky', canRotate: true, canMirror: true },
  windmill: { radius: 24, band: 'ground', canRotate: true, canMirror: true },
  rock: { radius: 11, band: 'ground', canRotate: true, canMirror: true },
  balloon: { radius: 15, band: 'sky', canRotate: true, canMirror: true },
  butterfly: { radius: 9, band: 'any', canRotate: false, canMirror: false },
  lake: { radius: 28, band: 'ground', canRotate: false, canMirror: false },
}

const ALL_KINDS: PrimitiveKind[] = [
  'sun', 'cloud', 'bird', 'kite', 'balloon', 'mountain',
  'tree', 'pine', 'house', 'flower', 'bush', 'fence', 'windmill', 'rock', 'butterfly', 'lake',
]

/** 摆放外边距：保证修改点中心距画面边缘 ≥ 命中半径。 */
const MARGIN = 26

/** 环形色相差：|a-b| 折算到 0-180。 */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * 由 seed 确定性地生成一关场景与 5 处修改。
 * @param seed - 任意 32 位整数种子。
 * @param level - 关卡（1 起）；超出范围按最后一关处理。
 * @returns 场景（左右基元列表 + 修改点）。
 */
export function createScene(seed: number, level: number): HuntScene {
  const cfg = LEVELS[Math.min(Math.max(level, 1), LEVEL_COUNT) - 1]!
  const rng = mulberry32(seed)

  // 随机放置 N 个间距合理的基元（不重叠到无法点选）。
  const left: SceneElement[] = []
  let guard = 0
  while (left.length < cfg.elementCount) {
    guard += 1
    if (guard > 6000) break // 面板放不下更密的排布时接受现有间距
    const kind = ALL_KINDS[Math.floor(rng() * ALL_KINDS.length)]!
    const meta = KIND_META[kind]!
    const scale = 0.75 + rng() * 0.5
    const yMin = meta.band === 'sky' ? MARGIN : meta.band === 'ground' ? PANEL_H * 0.5 : MARGIN
    const yMax = meta.band === 'sky' ? PANEL_H * 0.45 : PANEL_H - MARGIN
    const candidate: SceneElement = {
      kind,
      x: MARGIN + rng() * (PANEL_W - MARGIN * 2),
      y: yMin + rng() * Math.max(1, yMax - yMin),
      scale,
      rotation: meta.canRotate ? (rng() * 16 - 8) : 0,
      flip: meta.canMirror ? rng() < 0.5 : false,
      hue: Math.floor(rng() * 360),
    }
    let ok = true
    for (const s of left) {
      const m = KIND_META[s.kind]!
      const need = (m.radius * s.scale + meta.radius * candidate.scale) * 0.72
      const dx = s.x - candidate.x
      const dy = s.y - candidate.y
      if (dx * dx + dy * dy < need * need) { ok = false; break }
    }
    if (ok) left.push(candidate)
  }

  // 从基元中挑 5 个互不相同的下标做修改点。
  const indices: number[] = left.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = indices[i]!
    indices[i] = indices[j]!
    indices[j] = tmp
  }
  const picked = indices.slice(0, Math.min(DIFF_COUNT, left.length))

  // 右图 = 左图按修改变异后的拷贝；remove 的基元从右图剔除。
  const copies: SceneElement[] = left.map((s) => ({ ...s }))
  const removed = new Set<number>()
  const diffs: HuntDiff[] = []
  for (const index of picked) {
    const base = left[index]!
    const meta = KIND_META[base.kind]!
    const pool: HuntDiff['kind'][] = ['color', 'scale', 'remove']
    if (meta.canRotate) pool.push('rotate')
    if (meta.canMirror) pool.push('mirror')
    const kind = pool[Math.floor(rng() * pool.length)]!
    const target = copies[index]!
    if (kind === 'remove') {
      removed.add(index)
    } else if (kind === 'color') {
      const sign = rng() < 0.5 ? -1 : 1
      target.hue = (target.hue + sign * cfg.colorDelta + 360) % 360
    } else if (kind === 'scale') {
      let dir = rng() < 0.5 ? -1 : 1
      if (target.scale + dir * cfg.scaleDelta > 1.6 || target.scale + dir * cfg.scaleDelta < 0.45) dir = -dir
      target.scale = target.scale + dir * cfg.scaleDelta
    } else if (kind === 'rotate') {
      let dir = rng() < 0.5 ? -1 : 1
      if (target.rotation + dir * cfg.rotateDelta > 35 || target.rotation + dir * cfg.rotateDelta < -35) dir = -dir
      target.rotation = target.rotation + dir * cfg.rotateDelta
    } else {
      target.flip = !target.flip
    }
    diffs.push({ index, kind, x: base.x, y: base.y })
  }

  return { left, right: copies.filter((_, i) => !removed.has(i)), diffs }
}

/** 一局（单关）状态。 */
export interface PhotoHuntState {
  /** 当前场景谜题。 */
  scene: HuntScene
  /** 每处修改是否已被找到（与 scene.diffs 下标对应）。 */
  found: boolean[]
  /** 点错次数（每次扣 MISS_PENALTY_S 秒）。 */
  misses: number
  /** 剩余时间（秒）。 */
  timeLeft: number
  /** 本关限时（秒）。 */
  timeLimit: number
  /** 当前关卡（1 起）。 */
  level: number
  /** 局面：playing 进行中 / won 本关找齐 / lost 超时。 */
  status: 'playing' | 'won' | 'lost'
  /** 本局 seed。 */
  seed: number
}

/**
 * 生成某一关的初始状态。
 * @param seed - 谜题种子。
 * @param level - 关卡（1 起）。
 */
export function createPhotoHuntState(seed: number, level: number): PhotoHuntState {
  const cfg = LEVELS[Math.min(Math.max(level, 1), LEVEL_COUNT) - 1]!
  const scene = createScene(seed, level)
  return {
    scene,
    found: scene.diffs.map(() => false),
    misses: 0,
    timeLeft: cfg.timeS,
    timeLimit: cfg.timeS,
    level,
    status: 'playing',
    seed,
  }
}

/** 剩余未找到的修改数。 */
export function remainingDiffs(state: PhotoHuntState): number {
  let n = 0
  for (const f of state.found) if (!f) n += 1
  return n
}

/**
 * 判定一次右图点击：半径 HIT_RADIUS 内存在未找到的修改则标记找到；
 * 否则记一次点错并扣时 MISS_PENALTY_S 秒。
 * @param state - 当前局面（原地更新）。
 * @param x - 右图内横坐标。
 * @param y - 右图内纵坐标。
 * @returns 'hit' 命中一处修改；'miss' 点错（已扣时）；'busy' 局面已结束。
 */
export function tryClick(state: PhotoHuntState, x: number, y: number): 'hit' | 'miss' | 'busy' {
  if (state.status !== 'playing') return 'busy'
  const r2 = HIT_RADIUS * HIT_RADIUS
  for (let i = 0; i < state.scene.diffs.length; i += 1) {
    if (state.found[i]) continue
    const d = state.scene.diffs[i]!
    const dx = d.x - x
    const dy = d.y - y
    if (dx * dx + dy * dy <= r2) {
      state.found[i] = true
      if (remainingDiffs(state) === 0) state.status = 'won'
      return 'hit'
    }
  }
  state.misses += 1
  state.timeLeft = Math.max(0, state.timeLeft - MISS_PENALTY_S)
  if (state.timeLeft <= 0) state.status = 'lost'
  return 'miss'
}

/**
 * 推进倒计时。时间归零且尚有未找修改时判负。
 * @param state - 当前局面（原地更新）。
 * @param dtS - 经过秒数（非负）。
 * @returns 更新后的状态字段 status。
 */
export function tick(state: PhotoHuntState, dtS: number): 'playing' | 'won' | 'lost' {
  if (state.status !== 'playing') return state.status
  state.timeLeft = Math.max(0, state.timeLeft - Math.max(0, dtS))
  if (state.timeLeft <= 0) state.status = 'lost'
  return state.status
}

/**
 * 结算本关得分：已找修改 ×150 + 剩余时间取整 ×2 + 过关关卡奖励 ×200。
 * @param state - 当前局面。
 */
export function computeScore(state: PhotoHuntState): number {
  const foundCount = state.found.filter(Boolean).length
  const levelBonus = state.status === 'won' ? state.level * 200 : 0
  return foundCount * 150 + Math.floor(state.timeLeft) * 2 + levelBonus
}

/** 是否还有下一关。 */
export function hasNextLevel(state: PhotoHuntState): boolean {
  return state.level < LEVEL_COUNT
}
