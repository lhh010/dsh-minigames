/**
 * 数块 Suguru 纯逻辑。盘面划分为正交连通区域，每块区域大小 s ∈ [1,5]；
 * 区域内格子填 1..s 且不重复，任意正交或斜向（王步）相邻的两格数字
 * 不同。生成流程：先抽各区域目标大小（总和 = 格数，每区 1..5），撒锚
 * 后同步生长到目标（可选项最少者优先）；随后用受限回溯（候选 = 区域
 * 内未用 & 王邻域未用，MRV 选格）求出一个完整解，最后逐步揭示给定格
 * 并用同一回溯计数解，解唯一即发布；预算用尽仍未唯一则带「多解」徽
 * 章发布（胜负判定纯按规则，不依赖唯一解）。
 */
/** 五个关卡的盘面边长（5×5 → 9×9，第 5 关后循环）。 */
export declare const LEVEL_SIZES: readonly [5, 6, 7, 8, 9];
/** 区域大小上限（经典 Suguru 规则）。 */
export declare const MAX_REGION = 5;
/** 一个生成好的关卡。 */
export interface SuguruPuzzle {
    /** 盘面边长（格）。 */
    size: number;
    /** 格 → 区域编号（0 基，连续）。 */
    region: readonly number[];
    /** 区域编号 → 区域大小。 */
    regionSizes: readonly number[];
    /** 区域编号 → 成员格下标。 */
    regionCells: readonly (readonly number[])[];
    /** 给定格：格下标 → 锁定值。 */
    givens: ReadonlyMap<number, number>;
    /** 生成时的完整解（提示用）。 */
    solution: readonly number[];
    /** 求解器是否证明了唯一解（false = 多解徽章）。 */
    unique: boolean;
    /** 生成消耗的掷次（诊断）。 */
    attempts: number;
}
/** 求解计数结果。 */
export interface SolveResult {
    /** 找到的解数（封顶 2）。 */
    solutions: number;
    /** 节点预算耗尽前是否搜完了整个空间。 */
    exhausted: boolean;
    /** 消耗的搜索节点数。 */
    nodes: number;
}
/** mulberry32 PRNG：小而快，同种子确定性。 */
export declare function mulberry32(seed: number): () => number;
/** 1 基关卡的盘面边长（第 5 关后循环）。 */
export declare function levelSize(level: number): number;
/**
 * 目标区域数：max(边长, ceil(格数/5))，即恰好覆盖全盘的下限密度。经
 * 典 Suguru 区域 ≤5 格；密度更高时区域数逼近王步独立数 ceil(边长/2)²
 * （每个区域的解必含 1，两个 1 不能王步相邻），有机划分的可解率骤降，
 * 生成大量重掷后仍退条带，故取覆盖下限。
 * @param size - 盘面边长。
 * @returns 该边长的目标区域数。
 */
export declare function regionCountFor(size: number): number;
/** 过关得分：基础 100×关卡 + 每秒衰减 5 的时间奖励（下限 0）。 */
export declare function computeScore(level: number, seconds: number): number;
/** 正交（上下左右）邻居。 */
export declare function neighbors(size: number, cell: number): number[];
/** 王步邻居：正交 + 斜向共 8 格。 */
export declare function kingNeighbors(size: number, cell: number): number[];
/**
 * 划分是否是合法 Suguru 底盘：覆盖全盘、每区域正交连通、大小 ∈ [1,5]。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号。
 */
export declare function patternValid(size: number, region: readonly number[]): boolean;
/**
 * 数解（封顶 2）：空格按区域优先的固定顺序 DFS，候选升序。给定格来自
 * givens；预算耗尽返回 exhausted=true。
 */
export declare function countSolutions(size: number, regionCells: readonly (readonly number[])[], givens: ReadonlyMap<number, number>, maxNodes?: number): SolveResult;
/** 对已生成关卡的给定格数解（测试/诊断）。 */
export declare function solveCount(puzzle: SuguruPuzzle, maxNodes?: number): SolveResult;
/**
 * 胜负纯判定：每格填 1..区域大小，区域内恰好是 1..s 的排列（s 格不
 * 重复），任意王步相邻两格数字不同。
 */
export declare function isWon(puzzle: SuguruPuzzle, grid: readonly number[]): boolean;
/**
 * 冲突格清单（渲染红显用）：区域内重复、越界值、王邻域同数，双方格
 * 都标红；返回升序格下标。
 */
export declare function findConflicts(puzzle: SuguruPuzzle, grid: readonly number[]): number[];
/** 生成掷次上限：全失败时用条带兜底（仍完整可玩）。 */
export declare const ATTEMPT_CAP = 8;
/**
 * 由种子确定性生成一关：先找唯一解掷次；未命中预算内则发布最后一次
 * 生成结果（多解徽章）；全部失败退条带。
 * @param seed - 种子（关卡号 × 常量即可）。
 * @param size - 盘面边长。
 */
export declare function puzzleFromSeed(seed: number, size: number): SuguruPuzzle;
