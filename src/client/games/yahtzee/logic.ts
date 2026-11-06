/**
 * 五骰 Yahtzee 纯逻辑：13 个计分格（一点s~六点s、三同、四同、葫芦、小顺、
 * 大顺、快艇、机会）从骰面计算合法分；mulberry32 种子掷骰（锁定骰保留
 * 原值）；上区 63 分加成与快速艇（额外五同）奖励计入总分。全部为确定性
 * 纯函数，渲染与交互层不重复实现任何判定。
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

/** 计分格标识（13 格，顺序即面板展示顺序）。 */
export type Category =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'threeKind' | 'fourKind' | 'fullHouse' | 'smallStraight' | 'largeStraight'
  | 'yahtzee' | 'chance'

/** 13 格的固定展示顺序（上区 6 格 + 下区 7 格）。 */
export const CATEGORIES: readonly Category[] = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight',
  'yahtzee', 'chance',
] as const

/** 计分格中文名（面板与总结共用）。 */
export const CATEGORY_LABELS: Record<Category, string> = {
  ones: '一点', twos: '二点', threes: '三点', fours: '四点', fives: '五点', sixes: '六点',
  threeKind: '三同', fourKind: '四同', fullHouse: '葫芦', smallStraight: '小顺',
  largeStraight: '大顺', yahtzee: '快艇', chance: '机会',
}

/** 已填格记录：计分格 -> 实得分（未填的格不出现在对象上）。 */
export type Scores = Partial<Record<Category, number>>

/**
 * 统计各面出现次数。
 * @param dice - 5 颗骰面（1..6）。
 * @returns 长度 6 的数组，下标 i 为面 i+1 的次数。
 */
export function faceCounts(dice: readonly number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0]
  for (const d of dice) counts[d - 1] = (counts[d - 1] ?? 0) + 1
  return counts
}

/** 骰面总和。 */
export function sumDice(dice: readonly number[]): number {
  return dice.reduce((a, b) => a + b, 0)
}

/**
 * 最长连续顺子长度（重复骰面只计一次）：小顺 >=4、大顺 >=5 的判定基础。
 * @param dice - 5 颗骰面。
 */
export function longestRun(dice: readonly number[]): number {
  const present = new Set(dice)
  let best = 0
  for (const start of present) {
    let len = 0
    while (present.has(start + len)) len += 1
    if (len > best) best = len
  }
  return best
}

/** 是否五同（快艇牌型）。 */
export function isYahtzee(dice: readonly number[]): boolean {
  return faceCounts(dice).some(c => c === 5)
}

/**
 * 计算某格在给定骰面下的合法分（不满足牌型的格子为 0；上区与机会恒为
 * 对应总和，永远合法）。
 * @param category - 计分格。
 * @param dice - 5 颗骰面（1..6）。
 * @returns 该格可填入的分值。
 */
export function scoreCategory(category: Category, dice: readonly number[]): number {
  const counts = faceCounts(dice)
  const total = sumDice(dice)
  const maxCount = Math.max(...counts)
  switch (category) {
    case 'ones': case 'twos': case 'threes': case 'fours': case 'fives': case 'sixes': {
      const face = CATEGORIES.indexOf(category) + 1
      return face * (counts[face - 1] ?? 0)
    }
    case 'threeKind':
      return maxCount >= 3 ? total : 0
    case 'fourKind':
      return maxCount >= 4 ? total : 0
    case 'fullHouse':
      // 严格葫芦：恰好三同 + 一对（五同不算，需走快艇格）。
      return counts.some(c => c === 3) && counts.some(c => c === 2) ? 25 : 0
    case 'smallStraight':
      return longestRun(dice) >= 4 ? 30 : 0
    case 'largeStraight':
      return longestRun(dice) >= 5 ? 40 : 0
    case 'yahtzee':
      return maxCount === 5 ? 50 : 0
    case 'chance':
      return total
  }
}

/**
 * 用种子确定性掷骰：未锁定的骰子重掷，锁定的骰子保留原值。
 * @param seed - 整数种子（同种子同结果）。
 * @param prev - 掷前的 5 颗骰面。
 * @param held - 每颗骰子的锁定标记（true 保留原值）。
 * @returns 新的 5 颗骰面（1..6）。
 */
export function rollDice(seed: number, prev: readonly number[], held: readonly boolean[]): number[] {
  const rng = mulberry32(seed)
  return prev.map((face, i) => (held[i] === true ? face : 1 + Math.floor(rng() * 6)))
}

/** 上区（一点s~六点s）已填分小计。 */
export function upperSubtotal(scores: Scores): number {
  let sum = 0
  for (let i = 0; i < 6; i += 1) sum += scores[CATEGORIES[i]!] ?? 0
  return sum
}

/** 上区加成：上区小计 >=63 时 +35。 */
export function upperBonus(scores: Scores): number {
  return upperSubtotal(scores) >= 63 ? 35 : 0
}

/**
 * 总分：已填格实分 + 上区加成 + 快速艇奖励（每个额外五同 +50）。
 * @param scores - 已填格记录。
 * @param yahtzeeBonusCount - 快速艇奖励次数（快艇格已填后掷出的五同数）。
 */
export function totalScore(scores: Scores, yahtzeeBonusCount: number): number {
  let sum = 0
  for (const c of CATEGORIES) sum += scores[c] ?? 0
  return sum + upperBonus(scores) + yahtzeeBonusCount * 50
}
