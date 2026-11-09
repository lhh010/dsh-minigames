/**
 * 关箱 Shut the Box 纯逻辑：1-9 数字板的翻板状态、mulberry32 种子掷骰
 * （两骰）、合法组合枚举（未翻数字中子和恰等于骰面总和的子集）、可行动
 * 判定与终局计分（剩余和越低越好，全翻下即关箱满分；单步翻多枚数字给
 * 连击加分）。全部为确定性纯函数，渲染与交互层不重复实现任何判定。
 */
/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export declare function mulberry32(seed: number): () => number;
/** 数字板上最大的数字（板为 1..9）。 */
export declare const TILE_MAX = 9;
/** 一场比赛的局数（5 局记总分）。 */
export declare const TOTAL_ROUNDS = 5;
/** 全部数字之和（1+2+…+9 = 45）。 */
export declare const TILES_TOTAL = 45;
/** 关箱（本局全部翻下）奖励分。 */
export declare const SHUT_BONUS = 50;
/** 连击加分：单步翻 k 枚数字得 (k-1) × COMBO_UNIT。 */
export declare const COMBO_UNIT = 5;
/** 翻板状态：下标 i 对应数字 i+1，true = 立着（未翻下）。 */
export type UpTiles = readonly boolean[];
/** 初始全部立着的 1-9 数字板。 */
export declare function initialUpTiles(): boolean[];
/**
 * 用种子确定性掷两颗骰子。
 * @param seed - 整数种子（同种子同结果）。
 * @returns 两颗骰面（各 1..6）。
 */
export declare function rollPair(seed: number): [number, number];
/**
 * 枚举一步的全部合法组合：从未翻下的数字中选出子和恰等于 target 的
 * 全部子集（每个组合升序）。
 * @param up - 翻板状态。
 * @param target - 目标和（通常为两骰之和）。
 * @returns 合法组合列表（如 [[9], [1,8], [1,2,6]]），无解为空数组。
 */
export declare function enumerateMoves(up: UpTiles, target: number): number[][];
/**
 * 可行动判定：存在至少一个合法组合。
 * @param up - 翻板状态。
 * @param target - 目标和。
 */
export declare function hasMove(up: UpTiles, target: number): boolean;
/**
 * 翻下给定组合后的新板状态（纯函数，不改原数组）。
 * @param up - 翻板状态。
 * @param tiles - 要翻下的数字（须全部立着；由调用方保证合法性）。
 */
export declare function flipTiles(up: UpTiles, tiles: readonly number[]): boolean[];
/** 剩余（仍立着）数字之和，越低越好。 */
export declare function remainingSum(up: UpTiles): number;
/** 是否关箱：全部数字已翻下。 */
export declare function allShut(up: UpTiles): boolean;
/**
 * 单步连击加分：翻 k 枚数字得 (k-1) × COMBO_UNIT。
 * @param tiles - 本步翻下的数字组合。
 */
export declare function comboBonus(tiles: readonly number[]): number;
/**
 * 一局得分：翻下数字的基础分（45 - 剩余和）+ 累计连击加分 + 关箱奖励。
 * @param up - 本局结束时的翻板状态。
 * @param comboPoints - 本局累计连击加分。
 */
export declare function roundScore(up: UpTiles, comboPoints: number): number;
