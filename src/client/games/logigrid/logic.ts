/**
 * 逻辑网格 (Einstein/斑马谜题) 纯逻辑层。
 *
 * 盘面：N 个人（行，即 1..N 号房）× 4 类属性（房子颜色/宠物/饮品/爱好），
 * 每类 N 个值，同一类内值两两不同人。格子 = (类别, 人, 值)，玩家填 ✓/✗。
 *
 * 线索引擎共 8 种模板：at(住在 N 号房)、notAt(不在 N 号房)、pet(养 Y)、
 * drink(喝 Y)、same(同一人)、adjacent(紧邻)、leftOf(正左侧)、apart(分居
 * 两侧/不同人)。全部线索对真实解为真。
 *
 * 生成器：mulberry32 注入 seed，先抽解（每类一个排列），再按模板随机生成
 * 候选线索，贪心挑选加入后解数降得最多的一条（不降即冗余、天然丢弃），
 * 用回溯求解器（约束传播 + 回溯、解数截断）验证解唯一；过早唯一时用
 * 冗余真线索补足条数，超限换种子重试。
 *
 * 本模块不触碰 DOM，全部确定性，供 render/index 与测试复用。
 */

/** 属性类别数（固定 4 类）。 */
export const CAT_COUNT = 4

/** 类别下标：颜色/宠物/饮品/爱好。 */
export const CAT_COLOR = 0
/** 类别下标：宠物。 */
export const CAT_PET = 1
/** 类别下标：饮品。 */
export const CAT_DRINK = 2
/** 类别下标：爱好。 */
export const CAT_HOBBY = 3

/** 四个类别的显示名。 */
export const CATEGORY_LABELS = ['房子颜色', '宠物', '饮品', '爱好'] as const
/** 房子颜色值池（取前 N 个）。 */
export const COLOR_VALUES = ['红', '蓝', '绿', '黄', '白'] as const
/** 宠物值池（取前 N 个）。 */
export const PET_VALUES = ['猫', '狗', '鱼', '鸟', '兔'] as const
/** 饮品值池（取前 N 个）。 */
export const DRINK_VALUES = ['红茶', '咖啡', '牛奶', '果汁', '清水'] as const
/** 爱好值池（取前 N 个）。 */
export const HOBBY_VALUES = ['下棋', '读书', '画画', '弹琴', '钓鱼'] as const
/** 人名池（取前 N 个，行即房号顺序）。 */
export const PERSON_NAMES = ['艾伦', '贝拉', '卡尔', '黛西', '伊森'] as const

/** 各类别的值名表，按下标索引。 */
const CAT_VALUE_NAMES: readonly (readonly string[])[] = [COLOR_VALUES, PET_VALUES, DRINK_VALUES, HOBBY_VALUES]

/** mulberry32 PRNG：小而快，按 seed 确定性复现。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779b9) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 一个“事物”：某类别的某个值，谜题里的最小指称单位。 */
export interface Thing {
  /** 类别下标 0..3。 */
  cat: number
  /** 类别内值下标 0..N-1。 */
  val: number
}

/** 线索种类，对应 8 种模板。 */
export type ClueKind = 'at' | 'notAt' | 'pet' | 'drink' | 'same' | 'adjacent' | 'leftOf' | 'apart'

/** 一条线索：kind 决定语义，a/b 为涉及的事物，k 为房号（仅 at/notAt 用，1 起）。 */
export interface Clue {
  /** 模板种类。 */
  kind: ClueKind
  /** 主事物。 */
  a: Thing
  /** 次事物（二元模板才有，否则 null）。 */
  b: Thing | null
  /** 房号（at/notAt 用，1 起；其余为 -1）。 */
  k: number
}

/** 渲染一个事物的自然语言短语，如「红房子的人」「养猫的人」。 */
export function thingPhrase(cat: number, val: number): string {
  const name = CAT_VALUE_NAMES[cat]![val]!
  if (cat === CAT_COLOR) return name + '房子的人'
  if (cat === CAT_PET) return '养' + name + '的人'
  if (cat === CAT_DRINK) return '喝' + name + '的人'
  return '爱好' + name + '的人'
}

/** 渲染线索中文文本（线索卡与测试共用）。 */
export function renderClue(clue: Clue): string {
  const a = thingPhrase(clue.a.cat, clue.a.val)
  switch (clue.kind) {
    case 'at':
      return a + '住在 ' + String(clue.k) + ' 号房'
    case 'notAt':
      return a + '不住在 ' + String(clue.k) + ' 号房'
    case 'pet':
      return a + '养' + PET_VALUES[clue.b!.val]!
    case 'drink':
      return a + '喝' + DRINK_VALUES[clue.b!.val]!
    case 'same':
      return a + '和' + thingPhrase(clue.b!.cat, clue.b!.val) + '是同一个人'
    case 'adjacent':
      return a + '和' + thingPhrase(clue.b!.cat, clue.b!.val) + '的房子相邻'
    case 'leftOf':
      return a + '住在' + thingPhrase(clue.b!.cat, clue.b!.val) + '的正左边'
    case 'apart':
      return a + '和' + thingPhrase(clue.b!.cat, clue.b!.val) + '住在不同的房子'
  }
}

/** 线索涉及的事物列表（高亮相关行列用）。 */
export function clueThings(clue: Clue): Thing[] {
  return clue.b === null ? [clue.a] : [clue.a, clue.b]
}

/**
 * 判定线索在给定位置下是否成立；二元模板取 posA/posB 为两事物的主人房位
 * （0 起），一元模板只看 posA。
 * @param clue - 线索。
 * @param posA - 主事物主人房位（0 起）。
 * @param posB - 次事物主人房位（0 起，一元模板忽略）。
 * @returns 是否满足。
 */
export function clueHolds(clue: Clue, posA: number, posB: number): boolean {
  switch (clue.kind) {
    case 'at':
      return posA === clue.k - 1
    case 'notAt':
      return posA !== clue.k - 1
    case 'pet':
    case 'drink':
    case 'same':
      return posA === posB
    case 'adjacent':
      return Math.abs(posA - posB) === 1
    case 'leftOf':
      return posA === posB - 1
    case 'apart':
      return posA !== posB
  }
}

/** 计算谜题解派生的位置表：pos[cat][val] = 主人房位（0 起）。 */
export function solutionPositions(puzzle: Puzzle): number[][] {
  const pos: number[][] = []
  for (let cat = 0; cat < CAT_COUNT; cat += 1) {
    const row = new Array<number>(puzzle.n).fill(0)
    for (let p = 0; p < puzzle.n; p += 1) row[puzzle.solution[cat]![p]!] = p
    pos.push(row)
  }
  return pos
}

/** 线索的稳定去重键。 */
export function clueKey(clue: Clue): string {
  const b = clue.b === null ? '-' : String(clue.b.cat) + ':' + String(clue.b.val)
  return clue.kind + '|' + String(clue.a.cat) + ':' + String(clue.a.val) + '|' + b + '|' + String(clue.k)
}

/** 生成器两阶段的解数阈值：低于它才做精确计数贪心。 */
const SCORE_CAP = 24

function popcount(m: number): number {
  let c = 0
  let x = m
  while (x !== 0) {
    x &= x - 1
    c += 1
  }
  return c
}

function allBits(n: number): number {
  return (1 << n) - 1
}

/**
 * 用 domB 反向过滤 domA：保留存在兼容房位的位。isA 为 true 时 dom 是主事物
 * 域、other 是次事物域（谓词 (p, q)）；否则相反。
 */
function filterDomain(dom: number, other: number, clue: Clue, isA: boolean, n: number): number {
  let out = 0
  for (let i = 0; i < n; i += 1) {
    if ((dom & (1 << i)) === 0) continue
    let ok = false
    for (let j = 0; j < n; j += 1) {
      if ((other & (1 << j)) === 0) continue
      if (isA ? clueHolds(clue, i, j) : clueHolds(clue, j, i)) {
        ok = true
        break
      }
    }
    if (ok) out |= 1 << i
  }
  return out
}

/**
 * 约束传播到不动点：线索固化（一元截断 + 二元互相支撑过滤）+ 类内唯一性
 * （单例剔除 + 每人可覆盖检查）。原地修改 masks。
 * @param masks - 每个 (cat,val) 的可用房位位掩码，长度 4N。
 * @param clues - 线索集。
 * @param n - 人数。
 * @returns false 表示出现空域/不可覆盖，即矛盾。
 */
export function propagate(masks: number[], clues: readonly Clue[], n: number): boolean {
  let changed = true
  while (changed) {
    changed = false
    for (const clue of clues) {
      const ia = clue.a.cat * n + clue.a.val
      if (clue.kind === 'at') {
        const m = masks[ia]! & (1 << (clue.k - 1))
        if (m === 0) return false
        if (m !== masks[ia]!) {
          masks[ia] = m
          changed = true
        }
        continue
      }
      if (clue.kind === 'notAt') {
        const m = masks[ia]! & ~(1 << (clue.k - 1))
        if (m === 0) return false
        if (m !== masks[ia]!) {
          masks[ia] = m
          changed = true
        }
        continue
      }
      const ib = clue.b!.cat * n + clue.b!.val
      const fa = filterDomain(masks[ia]!, masks[ib]!, clue, true, n)
      if (fa === 0) return false
      if (fa !== masks[ia]!) {
        masks[ia] = fa
        changed = true
      }
      const fb = filterDomain(masks[ib]!, masks[ia]!, clue, false, n)
      if (fb === 0) return false
      if (fb !== masks[ib]!) {
        masks[ib] = fb
        changed = true
      }
    }
    for (let cat = 0; cat < CAT_COUNT; cat += 1) {
      // 类内唯一性：已单例的房位从同类其他值域剔除。
      for (let v = 0; v < n; v += 1) {
        const m = masks[cat * n + v]!
        if (m === 0) return false
        if ((m & (m - 1)) === 0) {
          for (let v2 = 0; v2 < n; v2 += 1) {
            if (v2 === v) continue
            const m2 = masks[cat * n + v2]!
            if ((m2 & m) !== 0) {
              const nm = m2 & ~m
              if (nm === 0) return false
              masks[cat * n + v2] = nm
              changed = true
            }
          }
        }
      }
      // 每个房位在本类至少可覆盖一次，否则无解。
      for (let p = 0; p < n; p += 1) {
        let cover = false
        for (let v = 0; v < n; v += 1) {
          if ((masks[cat * n + v]! & (1 << p)) !== 0) {
            cover = true
            break
          }
        }
        if (!cover) return false
      }
    }
  }
  return true
}

function countDom(masks: number[], clues: readonly Clue[], n: number, cap: number): number {
  let bi = -1
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < masks.length; i += 1) {
    const pc = popcount(masks[i]!)
    if (pc > 1 && pc < best) {
      best = pc
      bi = i
      if (pc === 2) break
    }
  }
  if (bi === -1) return 1
  let total = 0
  const m = masks[bi]!
  for (let p = 0; p < n; p += 1) {
    if ((m & (1 << p)) === 0) continue
    const child = masks.slice()
    child[bi] = 1 << p
    if (!propagate(child, clues, n)) continue
    total += countDom(child, clues, n, cap)
    if (total >= cap) return cap
  }
  return total
}

/**
 * 计数满足线索集的完备指派个数（每类一个排列），结果截断到 cap。
 * 约束传播 + 最小域回溯；用于唯一性验证与冗余判定。
 * @param clues - 线索集。
 * @param n - 人数。
 * @param cap - 截断上限（达到即返回，不再多算）。
 * @returns min(真实解数, cap)。
 */
export function countSolutions(clues: readonly Clue[], n: number, cap = 2): number {
  const masks = new Array<number>(CAT_COUNT * n).fill(allBits(n))
  if (!propagate(masks, clues, n)) return 0
  return countDom(masks, clues, n, cap)
}

/**
 * 冗余判定：把 clue 加入 clues 后解集不变则为冗余。
 * 因解集随约束单调收缩，等价于计数相等；计数用截断值比较（base 未截断时
 * 才可信，base 达到 cap 保守判不冗余）。
 * @param clues - 已有线索集。
 * @param clue - 候选线索。
 * @param n - 人数。
 * @returns 是否冗余（可丢弃）。
 */
export function isRedundant(clues: readonly Clue[], clue: Clue, n: number): boolean {
  const base = countSolutions(clues, n, 4)
  if (base >= 4 || base === 0) return false
  return countSolutions([...clues, clue], n, base) === base
}

/** 一关的规格：人数与线索条数范围。 */
export interface LevelSpec {
  /** 人数（4 或 5）。 */
  n: number
  /** 唯一解时的最少线索数。 */
  minClues: number
  /** 放弃本种子重试的线索数上限。 */
  maxClues: number
}

/** 五关递进：4×4 线索 6-10 条 → 5×5 线索 9-14 条（贪心采样下的可达区间）。 */
export const LEVELS: readonly LevelSpec[] = [
  { n: 4, minClues: 6, maxClues: 10 },
  { n: 4, minClues: 7, maxClues: 11 },
  { n: 4, minClues: 7, maxClues: 12 },
  { n: 5, minClues: 9, maxClues: 14 },
  { n: 5, minClues: 10, maxClues: 15 },
]

/** 取关卡规格（关卡号超过 5 循环）。 */
export function levelSpec(level: number): LevelSpec {
  return LEVELS[(level - 1) % LEVELS.length]!
}

/** 生成的谜题：线索集 + 抽出的真实解 + 生效种子。 */
export interface Puzzle {
  /** 关卡号（1 起）。 */
  level: number
  /** 人数。 */
  n: number
  /** 线索集（解唯一）。 */
  clues: Clue[]
  /** 真实解：solution[cat][person] = 值下标。 */
  solution: number[][]
  /** 实际生效的种子（重试后可能不同于入参）。 */
  seed: number
}

/** Fisher-Yates 洗牌（注入 rng），返回 0..n-1 的排列。 */
function shuffled(n: number, rng: () => number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    const t = arr[i]!
    arr[i] = arr[j]!
    arr[j] = t
  }
  return arr
}

/** 随机抽一个事物，可排除某类别（二元模板要求两类不同）。 */
function randomThing(rng: () => number, n: number, excludeCat: number): Thing {
  let cat = Math.floor(rng() * CAT_COUNT)
  if (excludeCat >= 0) {
    cat = cat % (CAT_COUNT - 1)
    if (cat >= excludeCat) cat += 1
  }
  return { cat, val: Math.floor(rng() * n) }
}

/** 模板权重表：位置类与身份类线索信息量大，apart 最弱给低权。 */
const KIND_WEIGHTS: readonly (readonly [ClueKind, number])[] = [
  ['at', 3],
  ['notAt', 2],
  ['pet', 3],
  ['drink', 3],
  ['same', 3],
  ['adjacent', 3],
  ['leftOf', 3],
  ['apart', 1],
]
const WEIGHT_TOTAL = KIND_WEIGHTS.reduce((s, [, w]) => s + w, 0)

/** 按权重随机选一个模板种类。 */
function pickKind(rng: () => number): ClueKind {
  let r = rng() * WEIGHT_TOTAL
  for (const [kind, w] of KIND_WEIGHTS) {
    r -= w
    if (r <= 0) return kind
  }
  return 'same'
}

/**
 * 生成一条对真实解为真的随机候选线索；位置类模板按解的真实位置取值，
 * 采不到合意对（如 adjacent 需要房位相邻）时退化为恒可采的模板。
 */
function randomClue(rng: () => number, n: number, pos: number[][]): Clue {
  const kind = pickKind(rng)
  if (kind === 'at') {
    const a = randomThing(rng, n, -1)
    return { kind, a, b: null, k: pos[a.cat]![a.val]! + 1 }
  }
  if (kind === 'notAt') {
    const a = randomThing(rng, n, -1)
    let k = 1 + Math.floor(rng() * n)
    if (k === pos[a.cat]![a.val]! + 1) k = (k % n) + 1
    return { kind, a, b: null, k }
  }
  // 身份类（pet/drink/same）：先抽主事物，再按解反查同主人的次事物，
  // 保证线索必然为真。thingOf(cat, p) = 该类别里主人住在 p 的值。
  const thingOf = (cat: number, p: number): Thing => {
    const row = pos[cat]!
    for (let v = 0; v < n; v += 1) {
      if (row[v] === p) return { cat, val: v }
    }
    return { cat, val: 0 }
  }
  if (kind === 'pet' || kind === 'drink' || kind === 'same') {
    const bCat = kind === 'pet' ? CAT_PET : kind === 'drink' ? CAT_DRINK : -1
    const a = randomThing(rng, n, bCat)
    const person = pos[a.cat]![a.val]!
    const targetCat = bCat >= 0 ? bCat : randomThing(rng, n, a.cat).cat
    const b = thingOf(targetCat, person)
    return { kind, a, b, k: -1 }
  }
  // 二元位置类：按解的真实房位采对。
  for (let t = 0; t < 16; t += 1) {
    const a = randomThing(rng, n, -1)
    const b = randomThing(rng, n, a.cat)
    const pa = pos[a.cat]![a.val]!
    const pb = pos[b.cat]![b.val]!
    const d = pa - pb
    if (kind === 'apart' && a.cat !== b.cat && d !== 0) return { kind, a, b, k: -1 }
    if (kind === 'adjacent' && a.cat !== b.cat && Math.abs(d) === 1) return { kind, a, b, k: -1 }
    if (kind === 'leftOf' && a.cat !== b.cat && d === -1) return { kind, a, b, k: -1 }
  }
  // 采不到（如 N 太小无相邻对）退化为按解构造的身份类线索。
  const a = randomThing(rng, n, -1)
  const bCat = randomThing(rng, n, a.cat).cat
  const b = thingOf(bCat, pos[a.cat]![a.val]!)
  return { kind: 'same', a, b, k: -1 }
}

/**
 * 生成一关：同种子下确定性产出。逐种子尝试——抽解、按模板随机生成候选
 * 线索（求解器判冗余即丢弃）、逐条加入并用回溯求解器验证解唯一；线索达到
 * 上限仍未唯一或过早唯一（少于 minClues）都换种子重试。
 * @param level - 关卡号（1 起，超 5 循环）。
 * @param seed - 随机种子。
 * @returns 解唯一的谜题。
 * @throws 连续 80 个种子都失败时抛错（规格不可达）。
 */
export function generateLevel(level: number, seed: number): Puzzle {
  const spec = levelSpec(level)
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const s = (seed + attempt * 7919) >>> 0
    const rng = mulberry32(s)
    const solution: number[][] = []
    for (let cat = 0; cat < CAT_COUNT; cat += 1) solution.push(shuffled(spec.n, rng))
    const pos = solutionPositions({ level, n: spec.n, clues: [], solution, seed: s })
    const clues: Clue[] = []
    const seen = new Set<string>()
    let guard = 0
    // 阶段一：解数还很多（精确计数贵）时先加入去重后的真线索，
    // 直到解数降到 SCORE_CAP 以下。
    while (clues.length < spec.maxClues && guard < 400) {
      if (countSolutions(clues, spec.n, SCORE_CAP) < SCORE_CAP) break
      guard += 1
      const clue = randomClue(rng, spec.n, pos)
      const key = clueKey(clue)
      if (seen.has(key)) continue
      clues.push(clue)
      seen.add(key)
    }
    // 阶段二：贪心选线索——采样若干候选，挑加入后解数降得最多的一条；
    // 不降解的候选即冗余，天然被跳过。
    let cur = countSolutions(clues, spec.n, SCORE_CAP)
    while (clues.length < spec.maxClues && guard < 400 && cur > 1) {
      guard += 1
      let best: Clue | null = null
      let bestCount = cur
      for (let t = 0; t < 8 && guard < 400; t += 1) {
        guard += 1
        const clue = randomClue(rng, spec.n, pos)
        if (seen.has(clueKey(clue))) continue
        const after = countSolutions([...clues, clue], spec.n, cur)
        if (after < bestCount) {
          best = clue
          bestCount = after
        }
      }
      if (best === null) continue
      clues.push(best)
      seen.add(clueKey(best))
      cur = bestCount
    }
    if (cur !== 1 || countSolutions(clues, spec.n, 2) !== 1) continue
    // 过早唯一：用对解集无影响的真线索补到 minClues。
    while (clues.length < spec.minClues && guard < 600) {
      guard += 1
      const clue = randomClue(rng, spec.n, pos)
      const key = clueKey(clue)
      if (seen.has(key) || !isRedundant(clues, clue, spec.n)) continue
      clues.push(clue)
      seen.add(key)
    }
    if (clues.length >= spec.minClues && clues.length <= spec.maxClues) {
      return { level, n: spec.n, clues, solution, seed: s }
    }
  }
  throw new Error('logigrid: 无法生成唯一解谜题（80 个种子均失败）')
}

/** 格标记：空。 */
export const MARK_EMPTY = 0
/** 格标记：✓。 */
export const MARK_YES = 1
/** 格标记：✗。 */
export const MARK_NO = 2
/** 每关提示次数上限。 */
export const MAX_HINTS = 3

/** 玩家对一题的操作状态（纯数据，可重建）。 */
export interface PlayerState {
  /** 本局谜题。 */
  readonly puzzle: Puzzle
  /** 人数。 */
  readonly n: number
  /** 平铺格标记，下标 (cat*n + p)*n + v，取 MARK_*。 */
  marks: number[]
  /** 剩余提示次数。 */
  hintsLeft: number
  /** 是否已过关（全部自洽填满且满足全部线索）。 */
  won: boolean
  /** 当前矛盾行（同类同人两个 ✓ 或同行全 ✗），用于高亮。 */
  conflicts: { cat: number; p: number }[]
  /** 累计点击次数。 */
  moves: number
}

/** 一次推演新落下的格。 */
export interface Deduced {
  /** 类别。 */
  cat: number
  /** 人。 */
  p: number
  /** 值。 */
  v: number
  /** 落下的标记（只可能是 MARK_YES 或 MARK_NO）。 */
  mark: number
}

/** 点击循环的结果。 */
export interface CycleResult {
  /** 本次点击后该格的标记。 */
  mark: number
  /** 由此次点击推演落下的格（淡入动画用）。 */
  deduced: Deduced[]
  /** 是否因此产生矛盾行。 */
  contradiction: boolean
}

/** 玩家状态里 (cat,p,v) 的平铺下标（fade 动画键）。 */
export function cellIndex(n: number, cat: number, p: number, v: number): number {
  return (cat * n + p) * n + v
}

/** 取某格当前标记。 */
export function getMark(st: PlayerState, cat: number, p: number, v: number): number {
  return st.marks[cellIndex(st.n, cat, p, v)]!
}

/** 新建一题的空白玩家状态。 */
export function createPlayerState(puzzle: Puzzle): PlayerState {
  return {
    puzzle,
    n: puzzle.n,
    marks: new Array<number>(CAT_COUNT * puzzle.n * puzzle.n).fill(MARK_EMPTY),
    hintsLeft: MAX_HINTS,
    won: false,
    conflicts: [],
    moves: 0,
  }
}

/** 扫描一行/一列，返回 { yesV, yesCount, noCount, emptyV, emptyCount }。 */
function scanLine(st: PlayerState, cat: number, fixed: number, isRow: boolean): { yesV: number; yesCount: number; noCount: number; emptyV: number; emptyCount: number } {
  let yesV = -1
  let yesCount = 0
  let noCount = 0
  let emptyV = -1
  let emptyCount = 0
  for (let i = 0; i < st.n; i += 1) {
    const mark = isRow ? getMark(st, cat, fixed, i) : getMark(st, cat, i, fixed)
    if (mark === MARK_YES) {
      yesV = i
      yesCount += 1
    } else if (mark === MARK_NO) {
      noCount += 1
    } else {
      emptyV = i
      emptyCount += 1
    }
  }
  return { yesV, yesCount, noCount, emptyV, emptyCount }
}

/**
 * 推演到不动点：✓ 的格把同行（同人同类）与同列（同值）其余格补 ✗；
 * 某行/列只剩一个非 ✗ 格时强制 ✓（级联）。记录矛盾行但不回滚——错误 ✓
 * 是玩家自己的推理负担，游戏只高亮矛盾。
 */
function deduce(st: PlayerState): { deduced: Deduced[]; contradiction: boolean } {
  const deduced: Deduced[] = []
  const conflicts: { cat: number; p: number }[] = []
  let contradiction = false
  const setCell = (cat: number, p: number, v: number, mark: number): void => {
    st.marks[cellIndex(st.n, cat, p, v)] = mark
    deduced.push({ cat, p, v, mark })
  }
  let changed = true
  while (changed && !contradiction) {
    changed = false
    for (let cat = 0; cat < CAT_COUNT; cat += 1) {
      for (let p = 0; p < st.n; p += 1) {
        const s = scanLine(st, cat, p, true)
        if (s.yesCount > 1) {
          contradiction = true
          conflicts.push({ cat, p })
          break
        }
        if (s.yesCount === 1) {
          for (let v = 0; v < st.n; v += 1) {
            if (v !== s.yesV && getMark(st, cat, p, v) === MARK_EMPTY) {
              setCell(cat, p, v, MARK_NO)
              changed = true
            }
          }
        } else if (s.noCount === st.n) {
          contradiction = true
          conflicts.push({ cat, p })
          break
        } else if (s.noCount === st.n - 1 && s.emptyCount === 1) {
          setCell(cat, p, s.emptyV, MARK_YES)
          changed = true
        }
      }
      if (contradiction) break
      for (let v = 0; v < st.n; v += 1) {
        const s = scanLine(st, cat, v, false)
        if (s.yesCount > 1) {
          contradiction = true
          break
        }
        if (s.yesCount === 1) {
          for (let p = 0; p < st.n; p += 1) {
            if (p !== s.yesV && getMark(st, cat, p, v) === MARK_EMPTY) {
              setCell(cat, p, v, MARK_NO)
              changed = true
            }
          }
        } else if (s.noCount === st.n) {
          contradiction = true
          break
        } else if (s.noCount === st.n - 1 && s.emptyCount === 1) {
          setCell(cat, s.emptyV, v, MARK_YES)
          changed = true
        }
      }
      if (contradiction) break
    }
  }
  st.conflicts = conflicts
  if (!contradiction) st.won = checkWon(st)
  return { deduced, contradiction }
}

/** 过关判定：每行（同人同类）恰一个 ✓（双射自动完备），且全部线索满足。 */
export function checkWon(st: PlayerState): boolean {
  if (st.conflicts.length > 0) return false
  const n = st.n
  const pos: number[][] = []
  for (let cat = 0; cat < CAT_COUNT; cat += 1) {
    const row = new Array<number>(n).fill(-1)
    for (let p = 0; p < n; p += 1) {
      for (let v = 0; v < n; v += 1) {
        if (getMark(st, cat, p, v) === MARK_YES) {
          if (row[v] !== -1) return false
          row[v] = p
        }
      }
      // 同行必须恰一个 ✓。
      let yesCount = 0
      for (let v = 0; v < n; v += 1) if (getMark(st, cat, p, v) === MARK_YES) yesCount += 1
      if (yesCount !== 1) return false
    }
    pos.push(row)
  }
  for (const clue of st.puzzle.clues) {
    const pa = pos[clue.a.cat]![clue.a.val]!
    const pb = clue.b === null ? -1 : pos[clue.b.cat]![clue.b.val]!
    if (pa === -1) return false
    if (!clueHolds(clue, pa, pb)) return false
  }
  return true
}

/**
 * 点击一格：标记按 空 → ✓ → ✗ → 空 循环；随后跑推演（✓ 自动补 ✗、级联
 * 强制 ✓、矛盾检测与过关判定都在推演内完成）。
 * @returns 本次结果（新标记、推演格、是否矛盾）。
 */
export function cycleCell(st: PlayerState, cat: number, p: number, v: number): CycleResult {
  const i = cellIndex(st.n, cat, p, v)
  const next = (st.marks[i]! + 1) % 3
  st.marks[i] = next
  st.moves += 1
  const res = deduce(st)
  return { mark: next, deduced: res.deduced, contradiction: res.contradiction }
}

/**
 * 请求提示：标出一个真实解中必为 ✓ 而尚未标记的格；每次消耗一次额度。
 * @returns 被标出的格；额度耗尽或已无未标 ✓ 格时返回 null。
 */
export function requestHint(st: PlayerState): { cat: number; p: number; v: number } | null {
  if (st.hintsLeft <= 0) return null
  for (let cat = 0; cat < CAT_COUNT; cat += 1) {
    for (let p = 0; p < st.n; p += 1) {
      const v = st.puzzle.solution[cat]![p]!
      if (getMark(st, cat, p, v) !== MARK_YES) {
        st.hintsLeft -= 1
        return { cat, p, v }
      }
    }
  }
  return null
}

/** 过关得分：关卡基础分 + 时间余量 - 提示惩罚，下限 0。 */
export function computeScore(level: number, seconds: number, hintsUsed: number): number {
  return Math.max(0, level * 1000 + 600 - Math.floor(seconds) * 5 - hintsUsed * 200)
}
