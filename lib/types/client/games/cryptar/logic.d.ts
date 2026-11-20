/**
 * 密码算式（Cryptarithm / Alphametic）纯逻辑：内置题库（预跑求解器验证唯一解），
 * 映射合法性、进位链逐位验算（只报冲突不剧透）、提示、计分与 seed 选关，
 * 全部为纯函数/纯数据，渲染与交互在 render.ts / index.ts。
 */
/** 一道竖式加法谜题：addends 各数位之和等于 result。 */
export interface CryptarPuzzle {
    /** 稳定 id（题面字符串）。 */
    id: string;
    /** 加数（大写英文单词），1 个以上。 */
    addends: string[];
    /** 和（大写英文单词）。 */
    result: string;
    /** 出现过的字母（首次出现序）。 */
    letters: string[];
    /** 出现在某词首位的字母集合（映射不可为 0）。 */
    leading: string[];
    /** 难度档（1 最易，5 最难），planPuzzles 按档递进取题。 */
    tier: number;
    /** 唯一解（构建期求解器验证过），提示系统据此揭示。 */
    solution: Readonly<Record<string, number>>;
}
/** 部分字母→数字映射（未填的字母无键）。 */
export type DigitMap = Record<string, number>;
/** mulberry32 确定性伪随机数发生器：同 seed 同序列，可测。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 求解字母算式：返回唯一解；无解或解不唯一返回 null。
 * @param addends - 加数单词。
 * @param result - 和单词。
 * @param maxSolutions - 内部剪枝上限（默认 2，够判唯一）。
 * @returns 唯一解映射，或 null。
 */
export declare function solveAlphametic(addends: string[], result: string, maxSolutions?: number): DigitMap | null;
/** 内置题库：8 道经典题，难度递进，全部预验证唯一解。 */
export declare const PUZZLES: readonly CryptarPuzzle[];
export declare const TOTAL_LEVELS = 5;
/**
 * 按难度档递进选 5 道题：每个难度档（1..5）内用 seed 伪随机取一道，
 * 既保证难度递增，又让不同 seed 的对局题面不同。
 * @param seed - 对局种子。
 * @returns 长度为 5 的题面序列（难度递增）。
 */
export declare function planPuzzles(seed: number): CryptarPuzzle[];
/** 逐位验算结果：只报冲突（红显），不剧透任何未填答案。 */
export interface CheckResult {
    /** 任一列冲突（含重复数字/首字母为 0）。 */
    conflict: boolean;
    /** 每列（从右往左，0 = 个位）是否有冲突。 */
    columns: boolean[];
    /** 不同字母被映射到同一数字。 */
    duplicateDigits: boolean;
    /** 已映射的首字母为 0。 */
    leadingZero: boolean;
    /** 所有字母均已映射。 */
    complete: boolean;
    /** 全部映射完成且算式成立。 */
    solved: boolean;
}
/**
 * 验算当前部分映射：未填字母视为自由数字（0-9），用进位链可达性判断
 * 每一列在当前已填数字下是否仍可能成立——不可能则该列标冲突；
 * 该判定只会漏报不会误报（自由字母忽略互异性是放宽，不是收紧）。
 * @param puzzle - 谜题。
 * @param map - 部分映射。
 * @returns 逐列冲突与过关判定。
 */
export declare function checkMapping(puzzle: CryptarPuzzle, map: DigitMap): CheckResult;
/** 单关运行时状态（纯数据，操作函数返回新对象）。 */
export interface LevelState {
    mapping: DigitMap;
    hintsUsed: number;
    /** 提示揭示的字母（渲染高亮，区别于玩家自填）。 */
    revealed: string[];
    solved: boolean;
}
export declare function createLevelState(): LevelState;
/**
 * 给字母填数字：若该数字已被其它字母占用，旧字母自动让出（保持一一映射）。
 * @returns 新状态。
 */
export declare function assignDigit(state: LevelState, letter: string, digit: number): LevelState;
/** 清除某字母的映射。 */
export declare function clearLetter(state: LevelState, letter: string): LevelState;
/**
 * 使用一次提示：按 letters 顺序揭示第一个未映射字母的答案（确定性），
 * 每关最多 2 次；揭示的字母计分时扣分。
 * @returns [新状态, 揭示的字母]；无提示额度或已填满时返回 null。
 */
export declare function applyHint(state: LevelState, puzzle: CryptarPuzzle): [LevelState, string] | null;
export declare const HINT_PENALTY = 60;
/**
 * 单关计分：基础分（随关卡递增）+ 用时奖励（每秒 -4，下限 0）− 提示罚分，最低 40。
 * @param levelIdx - 0 起关卡下标。
 * @param elapsedMs - 本关用时（毫秒）。
 * @param hintsUsed - 本关提示次数。
 */
export declare function scoreFor(levelIdx: number, elapsedMs: number, hintsUsed: number): number;
/**
 * 数值化题面：按映射把每个词转成数字串（未填字母用 '?')，过关 overlay 用。
 */
export declare function numericWords(puzzle: CryptarPuzzle, map: DigitMap): string[];
