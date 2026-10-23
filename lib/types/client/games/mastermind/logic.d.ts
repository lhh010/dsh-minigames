/**
 * Mastermind 猜码纯逻辑：黑/白钉判定（重复颜色安全，同 wordle 的两遍
 * 消耗算法族：先黑钉消耗答案色，再按剩余计数封顶白钉）、mulberry32
 * 种子生成密码、行合法性与关卡配置。全部为确定性纯函数。
 */
/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export declare function mulberry32(seed: number): () => number;
/** 一关的难度参数。 */
export interface LevelConfig {
    /** 密码长度（色钉数）。 */
    pegs: number;
    /** 调色盘颜色数（色号 0..colors-1）。 */
    colors: number;
    /** 本关最多可猜行数。 */
    tries: number;
    /** 显示用短标签。 */
    label: string;
}
/**
 * 关卡序列：重复颜色在所有关卡都允许（标准 Mastermind 规则，实现最简）；
 * 难度靠次数与长度爬坡 —— L1 给足 10 次，L2 收紧到 8 次，L3 加长到 5 钉 9 次。
 */
export declare const LEVELS: readonly LevelConfig[];
/**
 * 标准 Mastermind 判定：先数黑钉（颜色与位置都对）并消耗对应答案钉，
 * 其余猜测钉按答案剩余计数标白钉（颜色对位置不对），重复颜色不会多计。
 * @param guess - 猜测色号数组。
 * @param secret - 密码色号数组（与 guess 等长）。
 * @returns 黑钉数与白钉数。
 */
export declare function judge(guess: number[], secret: number[]): {
    black: number;
    white: number;
};
/**
 * 用种子确定性生成一条密码（每个钉独立取自 0..colors-1，允许重复）。
 * @param seed - 整数种子（同种子同密码）。
 * @param len - 密码长度。
 * @param colors - 颜色数。
 * @returns 长度为 len 的色号数组。
 */
export declare function makeSecret(seed: number, len: number, colors: number): number[];
/**
 * 一行输入是否合法：长度恰为 len 且每个色号为 0..5 的整数（全关卡共用 6 色）。
 * @param row - 当前行的色号数组。
 * @param len - 本关密码长度。
 */
export declare function validRow(row: number[], len: number): boolean;
