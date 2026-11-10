/**
 * 贤贤 (KenKen) 纯逻辑：6×6 拉丁方（每行每列 1-6 各出现一次），盘面划
 * 分为若干相邻格组成的「笼」（2-4 格），每笼标注目标数与运算
 * (+−×÷)；笼内数字按运算恰好得出目标数。
 *
 * 生成流程（全部随机走注入 seed 的 mulberry32，确定性可测）：
 * 1. 由随机行位移 + 随机列置换 + 随机数字置换构造合法拉丁方解；
 * 2. 贪心生长划分笼：随机起点、随机相邻扩展至目标大小；
 * 3. 从解反推每笼的运算与目标数（减/除为任意顺序的两格），保证解存在。
 */
/** 盘面边长（6×6，数字 1-6）。 */
export declare const KENKEN_SIZE = 6;
/** 关卡总数。 */
export declare const LEVEL_COUNT = 5;
/** 笼运算符：加、减、乘、除。 */
export type CageOp = '+' | '-' | '×' | '÷';
/** 一个笼：连通的同笼格子 + 目标数与运算。 */
export interface KenkenCage {
    op: CageOp;
    target: number;
    cells: {
        r: number;
        c: number;
    }[];
}
/** 一关的完整盘面。 */
export interface KenkenPuzzle {
    /** 1 基关卡号（1-5）。 */
    level: number;
    /** 笼列表（合起来恰好覆盖全盘）。 */
    cages: KenkenCage[];
    /** 每格所属笼下标 cageOf[r][c]。 */
    cageOf: readonly (readonly number[])[];
    /** 生成时的完整解（拉丁方）。 */
    solution: readonly (readonly number[])[];
}
/** mulberry32 伪随机数发生器：同 seed 序列完全一致。 */
export declare function mulberry32(seed: number): () => number;
/** 关卡难度配置：笼大小候选与本关开放的运算符（逐关加码）。 */
export interface LevelConfig {
    sizes: number[];
    ops: CageOp[];
}
/** 1 基关卡（越界循环）的难度配置。 */
export declare function levelConfig(level: number): LevelConfig;
/** 过关得分：100×关卡 + 随秒数衰减的时限奖励（每秒 -5，下限 0）。 */
export declare function computeScore(level: number, seconds: number): number;
/** 拉丁方校验：每行每列都是 1..n 的排列（0 视为已填非法值）。 */
export declare function isLatin(grid: readonly (readonly number[])[], n?: number): boolean;
/** 笼标签文本，如 '12×'、'7+'、'3-'、'2÷'。 */
export declare function cageLabel(cage: KenkenCage): string;
/** 笼内是否已全部填数。 */
export declare function cageComplete(cage: KenkenCage, grid: readonly (readonly number[])[]): boolean;
/**
 * 笼运算判定：笼内数字按运算得出目标数则 true。'-' 与 '÷' 仅用于两格
 * 笼且不区分顺序（大减小 / 大除小）；'+ / ×' 为全笼求和 / 求积。任一格
 * 未填（0）视为未达成。
 */
export declare function cageSatisfied(cage: KenkenCage, grid: readonly (readonly number[])[]): boolean;
/**
 * 实时错误格标记：同行或同列重复数字的格子、以及所在笼已填满但结果
 * 不等于目标数的格子标 true。
 */
export declare function cellErrors(puzzle: KenkenPuzzle, grid: readonly (readonly number[])[]): boolean[][];
/** 完成判定：全盘填满且无任何行/列重复或笼运算错误。 */
export declare function isWon(puzzle: KenkenPuzzle, grid: readonly (readonly number[])[]): boolean;
/**
 * 按 seed 确定性生成一关（level 1-5）：拉丁方解 + 贪心分笼 + 反推标注。
 * 同 seed 同关卡产物完全一致；解必然存在（即 puzzle.solution）。
 */
export declare function generateKenken(seed: number, level: number): KenkenPuzzle;
