/**
 * 对角数独（Sudoku X）纯逻辑：标准 9×9 数独（行/列/宫 1-9 不重复）外加
 * 两条主对角线（r===c 与 r+c===8）也必须 1-9 不重复。生成器先用带对角
 * 约束的随机回溯填出完整解，再按难度逐孔挖洞——每挖一孔都用求解器确认
 * 谜题仍然唯一解，否则回退。所有随机来自注入的 mulberry32 种子，同一种
 * 子生成完全相同的谜题（可重放、可测试）。
 */
/** 盘面边长（9×9）。 */
export declare const SIZE = 9;
/** 每关保留的提示数：5 关递进（第 1 关 40 个提示 → 第 5 关 28 个）。 */
export declare const LEVEL_GIVENS: readonly [40, 37, 34, 31, 28];
/** 总关数。 */
export declare const LEVEL_COUNT: 5;
/** 最大容错次数：填错 3 次即失败。 */
export declare const MAX_ERRORS = 3;
/**
 * mulberry32 确定性伪随机数生成器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数；同一种子序列完全一致。
 */
export declare function mulberry32(seed: number): () => number;
/** 冲突的四种来源：行 / 列 / 宫 / 对角线。 */
export type ConflictKind = 'row' | 'col' | 'box' | 'diag';
/** 一局对角数独的全部可测状态。 */
export interface SudokuXState {
    /** 本局种子（重放用）。 */
    seed: number;
    /** 关卡编号（0 起）。 */
    level: number;
    /** 提示格（null = 玩家可编辑）。 */
    puzzle: (number | null)[][];
    /** 当前盘面（提示 + 玩家输入）。 */
    grid: (number | null)[][];
    /** 生成时的完整解（判错与提示用）。 */
    solution: number[][];
    /** 铅笔笔记：notes[r][c][n-1] = 格 (r,c) 上是否标了候选数 n。 */
    notes: boolean[][][];
    /** 已用秒数（过关后冻结）。 */
    elapsed: number;
    /** 已填错次数。 */
    errors: number;
    /** 已用提示次数。 */
    hintsUsed: number;
    /** 是否过关。 */
    won: boolean;
    /** 是否因容错耗尽而失败。 */
    failed: boolean;
}
/**
 * 对角数独约束检查：n 放入 (r, c) 是否与现有行/列/宫/两条主对角线冲突。
 * @param grid - 盘面。
 * @param r - 行号（0 起）。
 * @param c - 列号（0 起）。
 * @param n - 待放的数字 1-9。
 */
export declare function validX(grid: (number | null)[][], r: number, c: number, n: number): boolean;
/**
 * 生成一个满足对角数独全部约束的完整解。
 * @param rng - 注入的随机源（如 mulberry32(seed)）。
 * @returns 9×9 完整数字盘。
 */
export declare function generateSolutionX(rng: () => number): (number | null)[][];
/**
 * 数解器：统计盘面在对角数独规则下的解的数量，数到 limit 即停。
 * @param grid - 待数解的盘面（含空格 null）。
 * @param limit - 停止阈值（唯一性验证传 2：返回 1 = 唯一解，≥2 = 多解）。
 * @returns 找到的解的数量（上限 limit）。
 */
export declare function countSolutionsX(grid: (number | null)[][], limit?: number): number;
/**
 * 从完整解挖洞成谜题：随机顺序逐孔移除，每移除一孔用求解器确认仍唯一
 * 解，否则回退；直到提示数降到 givens 或无孔可挖。
 * @param solution - 完整解。
 * @param givens - 目标提示数。
 * @param rng - 注入的随机源。
 * @returns 挖好的谜题（保持唯一解）。
 */
export declare function makePuzzleX(solution: (number | null)[][], givens: number, rng: () => number): (number | null)[][];
/**
 * 创建一局新的对角数独。
 * @param seed - 随机种子；同一种子生成完全相同的谜题。
 * @param level - 关卡编号（0 起，默认 0）。
 * @returns 初始状态（计时为 0，未过关未失败）。
 */
export declare function createSudokuXState(seed: number, level?: number): SudokuXState;
/**
 * 推进计时（过关后冻结）。
 * @param state - 当前状态。
 * @param dt - 帧间隔秒数。
 */
export declare function tick(state: SudokuXState, dt: number): void;
/**
 * 检查 (r, c) 上的数字与哪些约束冲突（行/列/宫/对角线四类）。
 * @param state - 当前状态。
 * @param r - 行号。
 * @param c - 列号。
 * @returns 冲突类型数组（空格或无冲突时为空数组）。
 */
export declare function conflictsAt(state: SudokuXState, r: number, c: number): ConflictKind[];
/**
 * 是否存在任何冲突格（过关判定的否定条件之一）。
 * @param state - 当前状态。
 */
export declare function hasConflict(state: SudokuXState): boolean;
/**
 * 在 (r, c) 放入数字（0 = 清空）。提示格与已结束的局面不可改；填对即
 * 落子并同步清理笔记，填错则错误计数 +1、错满 MAX_ERRORS 判负。
 * @param state - 当前状态。
 * @param r - 行号。
 * @param c - 列号。
 * @param n - 数字 1-9（0 清空）。
 * @returns 是否实际修改了盘面。
 */
export declare function place(state: SudokuXState, r: number, c: number, n: number): boolean;
/**
 * 切换 (r, c) 上的候选数笔记 n（仅空格可标）。
 * @param state - 当前状态。
 * @param r - 行号。
 * @param c - 列号。
 * @param n - 数字 1-9。
 * @returns 是否实际切换（已填格返回 false）。
 */
export declare function toggleNote(state: SudokuXState, r: number, c: number, n: number): boolean;
/**
 * H 提示：找到候选数最少的空格——若恰有唯一候选则填它（严格确定），
 * 否则按完整解填出该格的正确值。
 * @param state - 当前状态。
 * @returns 被填的 { r, c, n }，无空格时返回 null。
 */
export declare function applyHint(state: SudokuXState): {
    r: number;
    c: number;
    n: number;
} | null;
/**
 * 过关得分：关卡越高、越快、错误与提示越少，分越高（恒为正）。
 * @param state - 已过关的状态。
 * @returns 上报给面板的分数。
 */
export declare function winScore(state: SudokuXState): number;
