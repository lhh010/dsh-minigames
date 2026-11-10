/**
 * 不等数独（Futoshiki）纯逻辑：拉丁方校验、相邻格不等号约束、种子化
 * 谜面生成（先构造拉丁方解，再撒不等号、按唯一解性回退删除提示数）、
 * 冲突定位与完成判定。无 DOM、无副作用，可独立于渲染测试。
 *
 * 盘面用一维数组表示：格子序号 = 行 * size + 列，值为 1..size，0 表示空。
 */
/** mulberry32 种子随机数发生器：同 seed 产生同一序列，全部随机经它注入，
 * 生成器可复现、可测试。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。 */
export declare function mulberry32(seed: number): () => number;
/** 一条不等号约束：格子 a 与相邻格 b 之间，grid[a] op grid[b]。 */
export interface Inequality {
    /** 一侧格子序号。 */
    readonly a: number;
    /** 另一侧相邻格子序号。 */
    readonly b: number;
    /** 比较方向：'<' 表示 a < b，'>' 表示 a > b。 */
    readonly op: '<' | '>';
}
/** 关卡配置：边长与不等号密度（占全部相邻对的比例）。 */
export interface FutoshikiLevelConfig {
    /** 盘面边长 N（数字 1..N）。 */
    readonly size: number;
    /** 不等号密度（0..1，越高越难、提示数自然越少）。 */
    readonly inequalityRatio: number;
    /** HUD 关卡标签。 */
    readonly label: string;
}
/** 5 关递进：前三关 5×5 密度递增，后两关扩到 6×6。 */
export declare const LEVELS: readonly FutoshikiLevelConfig[];
/** 一张谜面：提示数、不等号与来自构造的解（生成期保证解存在且唯一）。 */
export interface FutoshikiPuzzle {
    /** 盘面边长。 */
    readonly size: number;
    /** 关卡下标（LEVELS 索引）。 */
    readonly level: number;
    /** 提示数盘面（一维，0 为空格）。 */
    readonly givens: readonly number[];
    /** 不等号约束列表。 */
    readonly constraints: readonly Inequality[];
    /** 构造出的完整拉丁方解（一维）。 */
    readonly solution: readonly number[];
}
/** 拉丁方完整校验：全部填满且每行每列都是 1..N 的排列。
 * @param grid - 一维盘面。
 * @param size - 盘面边长。
 * @returns 完整合法拉丁方为 true。 */
export declare function checkLatinComplete(grid: readonly number[], size: number): boolean;
/** 不等号校验：只检查两端都已填的约束（空格忽略）。
 * @param grid - 一维盘面。
 * @param constraints - 约束列表。
 * @returns 已填部分全部满足为 true。 */
export declare function satisfiesInequalities(grid: readonly number[], constraints: readonly Inequality[]): boolean;
/** 冲突定位：行/列重复的格子与两端已填但违反的约束。
 * @param grid - 一维盘面。
 * @param constraints - 约束列表。
 * @returns cells 与盘面同长的红显标记，signs 与约束同长的红显标记。 */
export declare function findConflicts(grid: readonly number[], constraints: readonly Inequality[]): {
    cells: boolean[];
    signs: boolean[];
};
/** 完成判定：全部填满且无任何行列重复或不等号违反。
 * @param grid - 一维盘面。
 * @param constraints - 约束列表。
 * @returns 过关为 true。 */
export declare function isSolved(grid: readonly number[], constraints: readonly Inequality[]): boolean;
/** 置数（不可变）：返回填入 v 的新盘面；v 越界或格子已有同值返回原引用。
 * @param grid - 一维盘面。
 * @param cell - 格子序号。
 * @param v - 1..N 的数字（0 视为清除）。
 * @returns 新盘面或原引用。 */
export declare function setCell(grid: readonly number[], cell: number, v: number): readonly number[];
/** 解数统计（求解器）：在提示数与不等号约束下回溯统计解的个数，到达
 * cap 提前返回（用于唯一性判定与非法提示检测）。
 * @param size - 盘面边长。
 * @param clues - 提示数盘面（0 为空）。
 * @param constraints - 约束列表。
 * @param cap - 统计上限（默认 2，只需判断唯一）。
 * @returns 解的个数（最多计到 cap）。 */
export declare function countSolutions(size: number, clues: readonly number[], constraints: readonly Inequality[], cap?: number): number;
/** 生成一张谜面：循环拉丁方经行/列/符号随机置换得到解，相邻对洗牌后按
 * 密度取前 K 个撒不等号（方向从解反推），再按随机顺序逐格尝试删提示，
 * 删除后解仍唯一才保留——保证解存在且唯一，同 (关卡, seed) 完全可复现。
 * @param levelIndex - LEVELS 关卡下标。
 * @param seed - mulberry32 种子。
 * @returns 谜面。 */
export declare function createPuzzle(levelIndex: number, seed: number): FutoshikiPuzzle;
