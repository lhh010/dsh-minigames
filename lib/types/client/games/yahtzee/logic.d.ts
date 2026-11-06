/**
 * 五骰 Yahtzee 纯逻辑：13 个计分格（一点s~六点s、三同、四同、葫芦、小顺、
 * 大顺、快艇、机会）从骰面计算合法分；mulberry32 种子掷骰（锁定骰保留
 * 原值）；上区 63 分加成与快速艇（额外五同）奖励计入总分。全部为确定性
 * 纯函数，渲染与交互层不重复实现任何判定。
 */
/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export declare function mulberry32(seed: number): () => number;
/** 计分格标识（13 格，顺序即面板展示顺序）。 */
export type Category = 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes' | 'threeKind' | 'fourKind' | 'fullHouse' | 'smallStraight' | 'largeStraight' | 'yahtzee' | 'chance';
/** 13 格的固定展示顺序（上区 6 格 + 下区 7 格）。 */
export declare const CATEGORIES: readonly Category[];
/** 计分格中文名（面板与总结共用）。 */
export declare const CATEGORY_LABELS: Record<Category, string>;
/** 已填格记录：计分格 -> 实得分（未填的格不出现在对象上）。 */
export type Scores = Partial<Record<Category, number>>;
/**
 * 统计各面出现次数。
 * @param dice - 5 颗骰面（1..6）。
 * @returns 长度 6 的数组，下标 i 为面 i+1 的次数。
 */
export declare function faceCounts(dice: readonly number[]): number[];
/** 骰面总和。 */
export declare function sumDice(dice: readonly number[]): number;
/**
 * 最长连续顺子长度（重复骰面只计一次）：小顺 >=4、大顺 >=5 的判定基础。
 * @param dice - 5 颗骰面。
 */
export declare function longestRun(dice: readonly number[]): number;
/** 是否五同（快艇牌型）。 */
export declare function isYahtzee(dice: readonly number[]): boolean;
/**
 * 计算某格在给定骰面下的合法分（不满足牌型的格子为 0；上区与机会恒为
 * 对应总和，永远合法）。
 * @param category - 计分格。
 * @param dice - 5 颗骰面（1..6）。
 * @returns 该格可填入的分值。
 */
export declare function scoreCategory(category: Category, dice: readonly number[]): number;
/**
 * 用种子确定性掷骰：未锁定的骰子重掷，锁定的骰子保留原值。
 * @param seed - 整数种子（同种子同结果）。
 * @param prev - 掷前的 5 颗骰面。
 * @param held - 每颗骰子的锁定标记（true 保留原值）。
 * @returns 新的 5 颗骰面（1..6）。
 */
export declare function rollDice(seed: number, prev: readonly number[], held: readonly boolean[]): number[];
/** 上区（一点s~六点s）已填分小计。 */
export declare function upperSubtotal(scores: Scores): number;
/** 上区加成：上区小计 >=63 时 +35。 */
export declare function upperBonus(scores: Scores): number;
/**
 * 总分：已填格实分 + 上区加成 + 快速艇奖励（每个额外五同 +50）。
 * @param scores - 已填格记录。
 * @param yahtzeeBonusCount - 快速艇奖励次数（快艇格已填后掷出的五同数）。
 */
export declare function totalScore(scores: Scores, yahtzeeBonusCount: number): number;
