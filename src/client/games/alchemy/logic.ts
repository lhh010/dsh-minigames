/**
 * 炼金工坊纯逻辑：元素库与硬编码配方表（Little Alchemy 式合成发现）、
 * 无序配对判定（同一对可产多物）、已试组合记忆、发现里程碑（5 关递进）、
 * 种子确定性的半配方提示、状态序列化。全部为确定性纯逻辑，随机只走
 * 注入的 mulberry32 种子；不含任何 DOM / canvas 依赖，可直接单测。
 */

/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 元素类别（决定元素架分组与图鉴排序，仅展示用）。 */
export type ElementCategory = 'basic' | 'nature' | 'material' | 'life' | 'civ'

/** 类别的中文标签（元素架分组标题）。 */
export const CATEGORY_LABELS: Readonly<Record<ElementCategory, string>> = {
  basic: '基本',
  nature: '自然',
  material: '材料',
  life: '生命',
  civ: '文明',
}

/** 一个元素：稳定 id、中文名、emoji 图标、类别。 */
export interface ElementDef {
  /** 稳定唯一 id（配方表引用它）。 */
  id: string
  /** 中文显示名。 */
  name: string
 /** emoji 图标（库内唯一）。 */
  icon: string
  /** 类别。 */
  category: ElementCategory
}

/** 四个基本元素（起始即可用，不出现在任何配方产物里）。 */
export const BASE_IDS: readonly string[] = ['fire', 'water', 'earth', 'air']

/** 内置元素库（86 款：4 基本 + 82 合成产物），按类别成段排列。 */
export const ELEMENTS: readonly ElementDef[] = [
  { id: 'fire', name: '火', icon: '🔥', category: 'basic' },
  { id: 'water', name: '水', icon: '💧', category: 'basic' },
  { id: 'earth', name: '土', icon: '🌍', category: 'basic' },
  { id: 'air', name: '气', icon: '🌬️', category: 'basic' },
  { id: 'steam', name: '汽', icon: '💨', category: 'nature' },
  { id: 'lava', name: '岩浆', icon: '🌋', category: 'nature' },
  { id: 'energy', name: '能量', icon: '⚡', category: 'nature' },
  { id: 'dust', name: '尘', icon: '🌫️', category: 'nature' },
  { id: 'mud', name: '泥', icon: '🟤', category: 'nature' },
  { id: 'sea', name: '海', icon: '🌊', category: 'nature' },
  { id: 'wind', name: '风', icon: '🍃', category: 'nature' },
  { id: 'pressure', name: '气压', icon: '🎈', category: 'nature' },
  { id: 'cloud', name: '云', icon: '☁️', category: 'nature' },
  { id: 'stone', name: '石', icon: '🪨', category: 'nature' },
  { id: 'sand', name: '沙', icon: '🏖️', category: 'nature' },
  { id: 'rain', name: '雨', icon: '🌧️', category: 'nature' },
  { id: 'snow', name: '雪', icon: '❄️', category: 'nature' },
  { id: 'ice', name: '冰', icon: '🧊', category: 'nature' },
  { id: 'hail', name: '冰雹', icon: '🌨️', category: 'nature' },
  { id: 'fog', name: '雾', icon: '🌁', category: 'nature' },
  { id: 'storm', name: '暴风雨', icon: '⛈️', category: 'nature' },
  { id: 'lightning', name: '闪电', icon: '🌩️', category: 'nature' },
  { id: 'rainbow', name: '彩虹', icon: '🌈', category: 'nature' },
  { id: 'sky', name: '天空', icon: '🌤️', category: 'nature' },
  { id: 'sun', name: '太阳', icon: '☀️', category: 'nature' },
  { id: 'moon', name: '月亮', icon: '🌙', category: 'nature' },
  { id: 'star', name: '星星', icon: '⭐', category: 'nature' },
  { id: 'space', name: '太空', icon: '🌌', category: 'nature' },
  { id: 'planet', name: '行星', icon: '🪐', category: 'nature' },
  { id: 'meteor', name: '流星', icon: '☄️', category: 'nature' },
  { id: 'mountain', name: '山', icon: '🏔️', category: 'nature' },
  { id: 'volcano', name: '火山', icon: '⛰️', category: 'nature' },
  { id: 'glass', name: '玻璃', icon: '🪟', category: 'material' },
  { id: 'metal', name: '金属', icon: '🔩', category: 'material' },
  { id: 'gold', name: '金', icon: '🥇', category: 'material' },
  { id: 'coal', name: '煤', icon: '⚫', category: 'material' },
  { id: 'steel', name: '钢', icon: '⚒️', category: 'material' },
  { id: 'wood', name: '木头', icon: '🪵', category: 'material' },
  { id: 'brick', name: '砖', icon: '🧱', category: 'material' },
  { id: 'diamond', name: '钻石', icon: '💎', category: 'material' },
  { id: 'oil', name: '石油', icon: '🛢️', category: 'material' },
  { id: 'salt', name: '盐', icon: '🧂', category: 'material' },
  { id: 'mirror', name: '镜子', icon: '🪞', category: 'material' },
  { id: 'paper', name: '纸', icon: '📄', category: 'material' },
  { id: 'plant', name: '植物', icon: '🌱', category: 'life' },
  { id: 'tree', name: '树', icon: '🌳', category: 'life' },
  { id: 'grass', name: '草', icon: '🌿', category: 'life' },
  { id: 'flower', name: '花', icon: '🌸', category: 'life' },
  { id: 'swamp', name: '沼泽', icon: '🪷', category: 'life' },
  { id: 'life', name: '生命', icon: '🧬', category: 'life' },
  { id: 'bacteria', name: '细菌', icon: '🦠', category: 'life' },
  { id: 'fish', name: '鱼', icon: '🐟', category: 'life' },
  { id: 'egg', name: '蛋', icon: '🥚', category: 'life' },
  { id: 'bird', name: '鸟', icon: '🐦', category: 'life' },
  { id: 'lizard', name: '蜥蜴', icon: '🦎', category: 'life' },
  { id: 'dragon', name: '龙', icon: '🐉', category: 'life' },
  { id: 'human', name: '人类', icon: '🧑', category: 'life' },
  { id: 'love', name: '爱', icon: '❤️', category: 'life' },
  { id: 'tool', name: '工具', icon: '🔧', category: 'civ' },
  { id: 'machine', name: '机械', icon: '⚙️', category: 'civ' },
  { id: 'electricity', name: '电流', icon: '🔌', category: 'civ' },
  { id: 'robot', name: '机器人', icon: '🤖', category: 'civ' },
  { id: 'computer', name: '电脑', icon: '💻', category: 'civ' },
  { id: 'internet', name: '互联网', icon: '🌐', category: 'civ' },
  { id: 'wheel', name: '轮子', icon: '🛞', category: 'civ' },
  { id: 'car', name: '汽车', icon: '🚗', category: 'civ' },
  { id: 'airplane', name: '飞机', icon: '✈️', category: 'civ' },
  { id: 'rocket', name: '火箭', icon: '🚀', category: 'civ' },
  { id: 'ship', name: '船', icon: '🚢', category: 'civ' },
  { id: 'house', name: '房子', icon: '🏠', category: 'civ' },
  { id: 'village', name: '村庄', icon: '🏘️', category: 'civ' },
  { id: 'city', name: '城市', icon: '🏙️', category: 'civ' },
  { id: 'wall', name: '墙', icon: '🚧', category: 'civ' },
  { id: 'castle', name: '城堡', icon: '🏰', category: 'civ' },
  { id: 'sword', name: '剑', icon: '⚔️', category: 'civ' },
  { id: 'knight', name: '骑士', icon: '🛡️', category: 'civ' },
  { id: 'farm', name: '农场', icon: '🚜', category: 'civ' },
  { id: 'wheat', name: '小麦', icon: '🌾', category: 'civ' },
  { id: 'bread', name: '面包', icon: '🍞', category: 'civ' },
  { id: 'book', name: '书', icon: '📖', category: 'civ' },
  { id: 'garden', name: '花园', icon: '🌻', category: 'civ' },
  { id: 'wizard', name: '巫师', icon: '🧙', category: 'civ' },
  { id: 'philosopherStone', name: '贤者之石', icon: '🔮', category: 'civ' },
  { id: 'telescope', name: '望远镜', icon: '🔭', category: 'civ' },
  { id: 'gunpowder', name: '火药', icon: '🧨', category: 'civ' },
  { id: 'explosion', name: '爆炸', icon: '💥', category: 'civ' },
] as const

/** id → 元素定义。 */
export const ELEMENT_BY_ID: ReadonlyMap<string, ElementDef> = new Map(ELEMENTS.map(el => [el.id, el]))

/** 原始配方表：[原料A, 原料B, 产物数组]——同一对可产多物（岩浆+水=石/汽）。 */
const RAW_RECIPES: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ['fire', 'water', ['steam']],
  ['fire', 'earth', ['lava']],
  ['fire', 'air', ['energy']],
  ['earth', 'air', ['dust']],
  ['earth', 'water', ['mud']],
  ['water', 'water', ['sea']],
  ['air', 'air', ['wind']],
  ['earth', 'earth', ['pressure']],
  ['steam', 'air', ['cloud']],
  ['lava', 'water', ['stone', 'steam']],
  ['stone', 'wind', ['sand']],
  ['sand', 'fire', ['glass']],
  ['stone', 'fire', ['metal']],
  ['metal', 'sun', ['gold']],
  ['tree', 'fire', ['coal']],
  ['coal', 'metal', ['steel']],
  ['mud', 'fire', ['brick']],
  ['coal', 'pressure', ['diamond']],
  ['plant', 'pressure', ['oil']],
  ['sea', 'sun', ['salt']],
  ['cloud', 'water', ['rain']],
  ['rain', 'wind', ['snow']],
  ['pressure', 'water', ['ice']],
  ['cloud', 'ice', ['hail']],
  ['sea', 'wind', ['fog']],
  ['cloud', 'energy', ['storm']],
  ['rain', 'energy', ['lightning']],
  ['rain', 'sun', ['rainbow']],
  ['air', 'cloud', ['sky']],
  ['fire', 'sky', ['sun']],
  ['stone', 'sky', ['moon']],
  ['energy', 'sky', ['star']],
  ['sky', 'sky', ['space']],
  ['space', 'earth', ['planet']],
  ['space', 'stone', ['meteor']],
  ['pressure', 'stone', ['mountain']],
  ['mountain', 'lava', ['volcano']],
  ['earth', 'rain', ['plant']],
  ['plant', 'earth', ['tree', 'grass']],
  ['plant', 'sun', ['flower']],
  ['mud', 'plant', ['swamp']],
  ['energy', 'swamp', ['life']],
  ['life', 'swamp', ['bacteria']],
  ['life', 'sea', ['fish']],
  ['life', 'stone', ['egg']],
  ['egg', 'air', ['bird']],
  ['egg', 'swamp', ['lizard']],
  ['lizard', 'fire', ['dragon']],
  ['earth', 'life', ['human']],
  ['human', 'human', ['love']],
  ['metal', 'human', ['tool']],
  ['tool', 'tree', ['wood']],
  ['metal', 'tool', ['machine']],
  ['lightning', 'metal', ['electricity']],
  ['machine', 'electricity', ['robot', 'computer']],
  ['computer', 'computer', ['internet']],
  ['wood', 'stone', ['wheel']],
  ['machine', 'wheel', ['car']],
  ['metal', 'wind', ['airplane']],
  ['machine', 'space', ['rocket']],
  ['wood', 'sea', ['ship']],
  ['tool', 'wood', ['house']],
  ['house', 'house', ['village']],
  ['village', 'village', ['city']],
  ['brick', 'brick', ['wall']],
  ['stone', 'wall', ['castle']],
  ['steel', 'tool', ['sword']],
  ['sword', 'human', ['knight']],
  ['plant', 'human', ['farm']],
  ['farm', 'plant', ['wheat']],
  ['wheat', 'fire', ['bread']],
  ['wood', 'pressure', ['paper']],
  ['paper', 'paper', ['book']],
  ['flower', 'tool', ['garden']],
  ['human', 'energy', ['wizard']],
  ['gold', 'wizard', ['philosopherStone']],
  ['glass', 'star', ['telescope']],
  ['glass', 'glass', ['mirror']],
  ['dust', 'fire', ['gunpowder']],
  ['gunpowder', 'fire', ['explosion']],
]

/** 无序原料对的键（a+b 按 id 排序，双向同键）。 */
export function pairKey(a: string, b: string): string {
  return a < b ? a + '+' + b : b + '+' + a
}

/** 原料对 → 产物列表（按配方表声明顺序）。 */
export const PAIR_RESULTS: ReadonlyMap<string, readonly string[]> = new Map(
  RAW_RECIPES.map(r => [pairKey(r[0], r[1]), r[2]]),
)

/** 产物 → 全部配方（原料对，按声明顺序）——提示系统从中取样。 */
export const RECIPES_FOR: ReadonlyMap<string, ReadonlyArray<readonly [string, string]>> = (() => {
  const map = new Map<string, Array<readonly [string, string]>>()
  for (const r of RAW_RECIPES) {
    for (const result of r[2]) {
      const list = map.get(result) ?? []
      list.push([r[0], r[1]] as const)
      map.set(result, list)
    }
  }
  return map
})()

/**
 * 从四基本元素出发沿配方表广度优先搜索。
 * @returns 可达元素的 id 集合（配方表完整性校验用）。
 */
export function reachableFromBase(): Set<string> {
  const reached = new Set(BASE_IDS)
  let grew = true
  while (grew) {
    grew = false
    for (const [key, results] of PAIR_RESULTS) {
      const [a, b] = key.split('+') as [string, string]
      if (!reached.has(a) || !reached.has(b)) continue
      for (const result of results) {
        if (!reached.has(result)) {
          reached.add(result)
          grew = true
        }
      }
    }
  }
  return reached
}

/** 元素库中不可从基本元素合成的 id 列表（应为空）。 */
export function unreachableElements(): string[] {
  const reached = reachableFromBase()
  return ELEMENTS.filter(el => !reached.has(el.id)).map(el => el.id)
}

/** 五关里程碑：累计发现 15/25/35/45/55 种元素。 */
export const MILESTONES: readonly number[] = [15, 25, 35, 45, 55]

/**
 * 发现数对应的里程碑关卡（0..5）。
 * @param discoveredCount 已发现元素种数（含 4 基本元素）。
 */
export function milestoneLevel(discoveredCount: number): number {
  let level = 0
  for (const m of MILESTONES) {
    if (discoveredCount >= m) level += 1
  }
  return level
}

/** 一局游戏的全部可序列化状态。 */
export interface AlchemyState {
  /** 已发现元素 id（按发现顺序，含 4 基本元素）。 */
  discovered: string[]
  /** 已尝试过的原料对键（a+b 排序），避免反复试错无解组合。 */
  tried: string[]
  /** 已消耗的提示次数。 */
  hintsUsed: number
  /** 元素 id → 已揭示的配方原料 id（半提示）。 */
  hints: Record<string, string>
  /** 提示随机种子（决定提示选取顺序，可测）。 */
  hintSeed: number
}

/**
 * 新建一局：只发现四基本元素、无已试组合、无提示。
 * @param hintSeed - 提示种子（0 也合法；同种子同提示序列）。
 */
export function createInitialState(hintSeed: number): AlchemyState {
  return {
    discovered: [...BASE_IDS],
    tried: [],
    hintsUsed: 0,
    hints: {},
    hintSeed: hintSeed >>> 0,
  }
}

/** 一次合成尝试的结果。 */
export type CombineResult =
  | { type: 'new'; element: string }
  | { type: 'repeat'; element: string }
  | { type: 'none' }

/**
 * 尝试合成（就地更新状态：记 tried，新元素入 discovered）。
 * 判定与原料顺序无关：fire+water 与 water+fire 同键。
 * @param state - 一局状态（就地修改）。
 * @param a - 原料 A 的元素 id（须已发现，调用方保证）。
 * @param b - 原料 B 的元素 id。
 * @returns new=首次发现；repeat=配方存在但产物全部已发现；none=无配方。
 */
export function combine(state: AlchemyState, a: string, b: string): CombineResult {
  const key = pairKey(a, b)
  const results = PAIR_RESULTS.get(key)
  if (results === undefined) {
    if (!state.tried.includes(key)) state.tried.push(key)
    return { type: 'none' }
  }
  const fresh = results.find(id => !state.discovered.includes(id))
  if (fresh === undefined) return { type: 'repeat', element: results[0]! }
  state.discovered.push(fresh)
  return { type: 'new', element: fresh }
}

/**
 * 剩余可用提示次数：已达成的里程碑关卡数即总配额。
 * @param state - 一局状态。
 */
export function hintBudget(state: AlchemyState): number {
  return milestoneLevel(state.discovered.length) - state.hintsUsed
}

/** 一次提示请求的结果。 */
export type HintResult =
  | { type: 'hint'; element: string; ingredient: string }
  | { type: 'exhausted' }
  | { type: 'none' }

/**
 * 元素的「就绪」配方：两原料均已发现——提示优先指向这类元素，
 * 玩家立即可以照做。
 * @param element - 目标元素 id。
 * @param discovered - 已发现 id 集合。
 */
function readyRecipe(element: string, discovered: Set<string>): readonly [string, string] | null {
  const recipes = RECIPES_FOR.get(element)
  if (recipes === undefined) return null
  for (const pair of recipes) {
    if (discovered.has(pair[0]) && discovered.has(pair[1])) return pair
  }
  return null
}

/**
 * 请求一条半配方提示（就地更新状态：hintsUsed+1、记录揭示的原料）。
 * 选取确定性：mulberry32(hintSeed ^ (hintsUsed+1)*黄金比例) 在候选集上
 * 取下标；候选优先「就绪」元素，排除已提示过的元素。
 * @param state - 一局状态（就地修改）。
 * @returns hint=目标元素与揭示的一个原料；exhausted=配额不足；none=无候选。
 */
export function requestHint(state: AlchemyState): HintResult {
  if (hintBudget(state) <= 0) return { type: 'exhausted' }
  const discovered = new Set(state.discovered)
  let candidates = ELEMENTS
    .map(el => el.id)
    .filter(id => !discovered.has(id) && !(id in state.hints) && RECIPES_FOR.has(id))
    .filter(id => readyRecipe(id, discovered) !== null)
  if (candidates.length === 0) {
    candidates = ELEMENTS
      .map(el => el.id)
      .filter(id => !discovered.has(id) && !(id in state.hints) && RECIPES_FOR.has(id))
  }
  if (candidates.length === 0) return { type: 'none' }
  const rng = mulberry32((state.hintSeed ^ Math.imul(state.hintsUsed + 1, 0x9e3779b9)) >>> 0)
  rng()
  const element = candidates[Math.floor(rng() * candidates.length)]!
  const recipe = readyRecipe(element, discovered)
    ?? RECIPES_FOR.get(element)![0]! as readonly [string, string]
  let ingredient: string
  const aKnown = discovered.has(recipe[0])
  const bKnown = discovered.has(recipe[1])
  if (aKnown !== bKnown) ingredient = aKnown ? recipe[0] : recipe[1]
  else ingredient = rng() < 0.5 ? recipe[0] : recipe[1]
  state.hintsUsed += 1
  state.hints[element] = ingredient
  return { type: 'hint', element, ingredient }
}

/** 序列化格式版本（结构变更时递增）。 */
const SERIALIZE_VERSION = 'alchemy1'

/**
 * 状态序列化为 JSON 字符串（版本包裹，供本地存档/恢复）。
 * @param state - 一局状态。
 */
export function serializeState(state: AlchemyState): string {
  return JSON.stringify({
    v: SERIALIZE_VERSION,
    discovered: state.discovered,
    tried: state.tried,
    hintsUsed: state.hintsUsed,
    hints: state.hints,
    hintSeed: state.hintSeed,
  })
}

/**
 * 反序列化（严格校验：版本不符、未知元素 id、负数计数均拒绝）。
 * @param json - serializeState 的输出。
 * @returns 状态；任何字段非法返回 null。
 */
export function deserializeState(json: string): AlchemyState | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const data = raw as Record<string, unknown>
  if (data.v !== SERIALIZE_VERSION) return null
  if (!Array.isArray(data.discovered) || !Array.isArray(data.tried)) return null
  if (typeof data.hintsUsed !== 'number' || !Number.isInteger(data.hintsUsed) || data.hintsUsed < 0) return null
  if (typeof data.hintSeed !== 'number' || !Number.isInteger(data.hintSeed) || data.hintSeed < 0) return null
  if (typeof data.hints !== 'object' || data.hints === null) return null
  const validId = (v: unknown): v is string => typeof v === 'string' && ELEMENT_BY_ID.has(v)
  if (!data.discovered.every(validId) || !data.tried.every(v => typeof v === 'string')) return null
  const hints: Record<string, string> = {}
  for (const [k, v] of Object.entries(data.hints)) {
    if (!validId(k) || !validId(v)) return null
    hints[k] = v
  }
  return {
    discovered: [...data.discovered],
    tried: [...data.tried],
    hintsUsed: data.hintsUsed,
    hints,
    hintSeed: data.hintSeed,
  }
}

/**
 * 计分：每发现一种元素 10 分，每个已达成的里程碑再奖 100 分。
 * @param state - 一局状态。
 */
export function scoreOf(state: AlchemyState): number {
  return state.discovered.length * 10 + milestoneLevel(state.discovered.length) * 100
}

/**
 * 局面是否通关（第 5 个里程碑达成）。
 * @param state - 一局状态。
 */
export function isComplete(state: AlchemyState): boolean {
  return milestoneLevel(state.discovered.length) >= MILESTONES.length
}

/**
 * 元素显示名（未知 id 返回 '?'，渲染兜底）。
 * @param id - 元素 id。
 */
export function nameOf(id: string): string {
  return ELEMENT_BY_ID.get(id)?.name ?? '?'
}

/**
 * 元素图标（未知 id 返回 '❓'，渲染兜底）。
 * @param id - 元素 id。
 */
export function iconOf(id: string): string {
  return ELEMENT_BY_ID.get(id)?.icon ?? '❓'
}
