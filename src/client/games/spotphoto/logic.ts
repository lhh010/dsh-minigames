/**
 * 大家来找茬（SpotPhoto）纯逻辑：由注入 seed 程序化生成一张 60-100 个
 * 几何元素叠加的复杂"照片"，再在右图上做 5 处细微修改（微移 / 色相偏移 /
 * 缩放 / 删元素 / 加小点）。点击差异位置（半径 24px 内）标记一处，全部
 * 找齐过关；点错扣 5 秒，倒计时归零失败。全部函数都是确定性的：相同
 * seed 与关卡一定得到相同的谜题与判定结果。
 */

/** 照片内的几何元素种类。 */
export type PhotoElementKind = 'circle' | 'square' | 'triangle' | 'line' | 'texture'

/** 照片里的一个几何元素（左右两图共用同一坐标系）。 */
export interface PhotoElement {
  kind: PhotoElementKind
  /** 中心横坐标（照片内逻辑像素）。 */
  x: number
  /** 中心纵坐标（照片内逻辑像素）。 */
  y: number
  /** 特征尺寸（半径 / 半边长 / 半长），像素。 */
  size: number
  /** 旋转角度（弧度）。 */
  angle: number
  /** 色相 0-359（渲染为 hsl 颜色；色相差异即颜色差异）。 */
  hue: number
  /** 饱和度（0-100）。 */
  sat: number
  /** 亮度（0-100）。 */
  light: number
}

/** 差异修改种类。 */
export type PhotoDiffKind = 'shift' | 'hue' | 'scale' | 'delete' | 'add'

/** 一处差异的描述与判定位置。 */
export interface PhotoDiff {
  /** 基准元素在左图元素列表中的下标（add 差异除外，见下）。 */
  index: number
  /** 差异类型（见 {@link PhotoDiffKind}）。 */
  kind: PhotoDiffKind
  /** 判定圆心（照片内坐标；两侧面板共用，点哪一边都算）。 */
  x: number
  y: number
}

/** 一关的谜题：左右两张"照片" + 差异列表。 */
export interface PhotoPuzzle {
  /** 左图元素列表（基准）。 */
  left: PhotoElement[]
  /** 右图元素列表（应用 5 处修改后的变体）。 */
  right: PhotoElement[]
  /** 差异列表（恰好 5 处）。 */
  diffs: PhotoDiff[]
}

/** 单张照片的逻辑尺寸；两图共用同一坐标系。 */
export const PHOTO_W = 320
export const PHOTO_H = 320
/** 每关差异数（固定 5 处）。 */
export const DIFF_COUNT = 5
/** 命中判定半径（像素）。 */
export const HIT_RADIUS = 24
/** 点错一次的扣时（秒）。 */
export const MISS_PENALTY_S = 5
/** 差异判定点之间的最小间距（避免两处差异的判定圆大量重叠）。 */
export const MIN_DIFF_DIST = 56

/** 关卡难度：元素更多、修改幅度更小（magnitude 1→0.4）、限时更短。 */
export interface PhotoLevelConfig {
  /** 照片元素总数。 */
  elementCount: number
  /** 本关限时（秒）。 */
  timeLimitS: number
  /** 修改幅度系数（1 = 最大幅度，越小越难）。 */
  magnitude: number
}

/** 5 关难度表：元素 60→100、限时 90→50s。 */
export const LEVELS: PhotoLevelConfig[] = [
  { elementCount: 60, timeLimitS: 90, magnitude: 1 },
  { elementCount: 70, timeLimitS: 80, magnitude: 0.85 },
  { elementCount: 80, timeLimitS: 70, magnitude: 0.7 },
  { elementCount: 90, timeLimitS: 60, magnitude: 0.55 },
  { elementCount: 100, timeLimitS: 50, magnitude: 0.4 },
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

const ELEMENT_KINDS: PhotoElementKind[] = ['circle', 'square', 'triangle', 'line', 'texture']

/** 生成一个随机元素（确定性地消耗 rng）。 */
function randomElement(rng: () => number, margin: number): PhotoElement {
  return {
    kind: ELEMENT_KINDS[Math.floor(rng() * ELEMENT_KINDS.length)]!,
    x: margin + rng() * (PHOTO_W - margin * 2),
    y: margin + rng() * (PHOTO_H - margin * 2),
    size: 4 + rng() * 20,
    angle: rng() * Math.PI * 2,
    hue: Math.floor(rng() * 360),
    sat: 55 + Math.floor(rng() * 31),
    light: 42 + Math.floor(rng() * 26),
  }
}

/** 色相环上的角距离（0-180）。 */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360)
  return Math.min(d, 360 - d)
}

/** 删除类差异的候选：足够小的元素（删掉后画面仍接近）。 */
function isDeletable(e: PhotoElement): boolean {
  return e.size <= 12
}

/**
 * 由 seed 确定性地生成一关谜题。
 * @param seed - 任意 32 位整数种子。
 * @param level - 关卡（1 起）；超出范围按最后一关处理。
 * @returns 谜题（左右照片 + 恰好 5 处差异）。
 */
export function createPhotoPuzzle(seed: number, level: number): PhotoPuzzle {
  const cfg = LEVELS[Math.min(Math.max(level, 1), LEVEL_COUNT) - 1]!
  const rng = mulberry32(seed)
  const margin = 14

  // 生成 N 个随机叠加的几何元素（允许重叠——照片本来就有遮挡层次）。
  const left: PhotoElement[] = []
  for (let i = 0; i < cfg.elementCount; i += 1) left.push(randomElement(rng, margin))

  // 挑 5 个判定点彼此分开的元素做差异（洗牌后按间距贪心挑选）。
  const indices: number[] = left.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = indices[i]!
    indices[i] = indices[j]!
    indices[j] = tmp
  }
  const picked: number[] = []
  for (const i of indices) {
    if (picked.length >= DIFF_COUNT) break
    const cand = left[i]!
    let ok = true
    for (const p of picked) {
      const dx = left[p]!.x - cand.x
      const dy = left[p]!.y - cand.y
      if (dx * dx + dy * dy < MIN_DIFF_DIST * MIN_DIFF_DIST) { ok = false; break }
    }
    if (ok) picked.push(i)
  }
  // 极端 seed 下凑不满 5 个分开的元素时放宽间距补齐，保证恰好 5 处差异。
  for (const i of indices) {
    if (picked.length >= DIFF_COUNT) break
    if (!picked.includes(i)) picked.push(i)
  }

  // 修改幅度随关卡收紧。
  const mag = cfg.magnitude
  const shiftPx = 3 + 5 * mag // 3-8px
  const hueDeg = 15 + 20 * mag // 15°-35°
  const scaleFrac = 0.03 + 0.05 * mag // 3%-8%

  const right: PhotoElement[] = left.map((e) => ({ ...e }))
  const diffs: PhotoDiff[] = []
  const usedKinds: PhotoDiffKind[] = []
  for (const index of picked) {
    const base = left[index]!
    let kind = (['shift', 'hue', 'scale', 'delete', 'add'] as const)[Math.floor(rng() * 5)]!
    // 删除只对小元素生效；候选不存在时降级为色相偏移（确定性规则）。
    if (kind === 'delete' && !isDeletable(base)) kind = 'hue'
    // 保持 5 种差异都能出现：前几处尽量不与已用类型重复。
    if (usedKinds.length < DIFF_COUNT - 1 && usedKinds.includes(kind)) {
      const remaining = (['shift', 'hue', 'scale', 'delete', 'add'] as const).filter((k) => !usedKinds.includes(k))
      const usable = remaining.filter((k) => k !== 'delete' || isDeletable(base))
      if (usable.length > 0) kind = usable[Math.floor(rng() * usable.length)]!
    }
    usedKinds.push(kind)

    if (kind === 'shift') {
      const mutated = right[index]!
      const angle = rng() * Math.PI * 2
      mutated.x = Math.min(PHOTO_W - margin, Math.max(margin, mutated.x + Math.cos(angle) * shiftPx))
      mutated.y = Math.min(PHOTO_H - margin, Math.max(margin, mutated.y + Math.sin(angle) * shiftPx))
    } else if (kind === 'hue') {
      const mutated = right[index]!
      const dir = rng() < 0.5 ? -1 : 1
      mutated.hue = (((mutated.hue + dir * hueDeg) % 360) + 360) % 360
    } else if (kind === 'scale') {
      const mutated = right[index]!
      const dir = mutated.size < 12 ? 1 : -1
      mutated.size = Math.max(3, mutated.size * (1 + dir * scaleFrac))
    } else if (kind === 'delete') {
      right[index] = { kind: 'circle', x: -999, y: -999, size: 0, angle: 0, hue: 0, sat: 0, light: 0 }
    } else {
      // add：右图在基准元素附近加一个小点。
      const dotAngle = rng() * Math.PI * 2
      right.push({
        kind: 'circle',
        x: Math.min(PHOTO_W - margin, Math.max(margin, base.x + Math.cos(dotAngle) * 18)),
        y: Math.min(PHOTO_H - margin, Math.max(margin, base.y + Math.sin(dotAngle) * 18)),
        size: 4 + rng() * 2,
        angle: 0,
        hue: base.hue,
        sat: base.sat,
        light: Math.min(80, base.light + 12),
      })
    }
    diffs.push({ index, kind, x: base.x, y: base.y })
  }

  // 渲染前过滤掉 delete 占位元素（位置在画面外的哨兵）。
  const visibleRight = right.filter((e) => e.size > 0)
  return { left, right: visibleRight, diffs }
}

/** 一局（单关）状态。 */
export interface SpotPhotoState {
  /** 当前谜题。 */
  puzzle: PhotoPuzzle
  /** 每处差异是否已被找到（与 puzzle.diffs 下标对应）。 */
  found: boolean[]
  /** 点错次数（每次扣 MISS_PENALTY_S 秒）。 */
  misses: number
  /** 剩余时间（秒）。 */
  timeLeft: number
  /** 本关限时（秒）。 */
  timeLimitS: number
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
export function createSpotPhotoState(seed: number, level: number): SpotPhotoState {
  const cfg = LEVELS[Math.min(Math.max(level, 1), LEVEL_COUNT) - 1]!
  return {
    puzzle: createPhotoPuzzle(seed, level),
    found: Array.from({ length: DIFF_COUNT }, () => false),
    misses: 0,
    timeLeft: cfg.timeLimitS,
    timeLimitS: cfg.timeLimitS,
    level,
    status: 'playing',
    seed,
  }
}

/** 剩余未找到的差异数。 */
export function remainingDiffs(state: SpotPhotoState): number {
  let n = 0
  for (const f of state.found) if (!f) n += 1
  return n
}

/** 两点距离是否在命中半径内。 */
function withinHit(x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS
}

/**
 * 判定一次点击：命中半径内存在未找到的差异则标记一处；否则记一次点错并扣
 * {@link MISS_PENALTY_S} 秒。两侧照片共用差异坐标，点任一侧同一位置都算。
 * @param state - 当前局面（原地更新）。
 * @param x - 照片内横坐标。
 * @param y - 照片内纵坐标。
 * @returns 'hit' 命中一处差异；'miss' 点错（已扣时）；'busy' 局面已结束。
 */
export function tryClick(state: SpotPhotoState, x: number, y: number): 'hit' | 'miss' | 'busy' {
  if (state.status !== 'playing') return 'busy'
  for (let i = 0; i < state.puzzle.diffs.length; i += 1) {
    if (state.found[i]) continue
    const d = state.puzzle.diffs[i]!
    if (withinHit(d.x, d.y, x, y)) {
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
 * 推进倒计时。时间归零且尚有未找差异时判负。
 * @param state - 当前局面（原地更新）。
 * @param dtS - 经过秒数（非负）。
 * @returns 更新后的状态字段 status。
 */
export function tick(state: SpotPhotoState, dtS: number): 'playing' | 'won' | 'lost' {
  if (state.status !== 'playing') return state.status
  state.timeLeft = Math.max(0, state.timeLeft - Math.max(0, dtS))
  if (state.timeLeft <= 0) state.status = 'lost'
  return state.status
}

/**
 * 结算得分：已找差异 ×100 + 剩余时间取整 ×2 + 通关关卡奖励。
 * @param state - 当前局面。
 */
export function computeScore(state: SpotPhotoState): number {
  const foundCount = state.found.filter(Boolean).length
  const levelBonus = state.status === 'won' ? state.level * 100 : 0
  return foundCount * 100 + Math.floor(state.timeLeft) * 2 + levelBonus
}

/** 是否还有下一关。 */
export function hasNextLevel(state: SpotPhotoState): boolean {
  return state.level < LEVEL_COUNT
}
