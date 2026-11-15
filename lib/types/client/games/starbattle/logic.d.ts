/**
 * 星之战 (Star Battle) 纯逻辑。N×N 盘划分为 N 个正交连通区域（每格恰
 * 属一区、恰 N 个区域，区域大小可不等——等大区域约束过松，大盘解数
 * 爆炸、唯一解不可达）；玩家放 k = N ≥ 8 ? 2 : 1 颗星（物
 * 理上限：k 颗互邻禁区要求 N ≥ 4k-4，故 6 盘 k=1、8/9/10 盘 k=2），
 * 使每
 * 行、每列、每个区域恰好 k 颗，且任意两颗星王步（八邻接）不相邻。生
 * 成流程：随机种子格 BFS 同步生长划分（可选项最少区域优先）→ 随机
 * 分支序回溯种植一个完整解 → 同一回溯求解器计数解（封顶 2）验证唯
 * 一；不唯一则扰动种子重掷，掷次用尽发布最后一掷（多解徽章）。胜负
 * 与冲突判定纯按规则，不依赖唯一解。所有随机经注入 rng，同种子确定。
 */
/** 五个关卡的盘面边长（6/8/8/9/10，第 5 关后循环）。 */
export declare const LEVEL_SIZES: readonly [6, 8, 8, 9, 10];
/** 生成掷次上限：用尽后发布最后一次生成结果（多解徽章）。 */
export declare const ATTEMPT_CAP = 12;
/** 格面标记：0 空、1 星、2 ✗。 */
export type CellMark = 0 | 1 | 2;
/** 一个生成好的关卡。 */
export interface StarPuzzle {
    /** 盘面边长（格）。 */
    size: number;
    /** 每行/列/区域的星数（size ≥ 9 ? 2 : 1：6/8→1，9/10→2）。 */
    k: number;
    /** 格 → 区域编号（0 基，连续；每区非空正交连通，大小可不等）。 */
    region: readonly number[];
    /** 区域编号 → 成员格下标。 */
    regionCells: readonly (readonly number[])[];
    /** 生成时种植的完整解（星格下标，长度 k×size）。 */
    solution: readonly number[];
    /** 求解器是否证明了唯一解（false = 多解徽章）。 */
    unique: boolean;
    /** 消耗的掷次（诊断）。 */
    attempts: number;
}
/** 求解计数结果。 */
export interface SolveResult {
    /** 找到的解数（封顶 maxSolutions）。 */
    solutions: number;
    /** 节点预算耗尽前是否搜完了整个空间。 */
    exhausted: boolean;
    /** 消耗的搜索节点数。 */
    nodes: number;
}
/** mulberry32 PRNG：小而快，同种子确定性。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 每行/列/区域的星数：N ≥ 9 取 2，否则取 1（6/8→1，9/10→2）。穷举可
 * 证 k=2 需 N ≥ 8、k=3 需 N ≥ 12，故 round(N/3) 之类配比对 6/8/9/10
 * 盘全部无解；且 8×8 满足行列约束的布局仅 2 种，叠加区域约束后几乎
 * 不可解，这里按「盘面下实际可生成唯一解的最大 k」取值。
 * @param size - 盘面边长。
 * @returns 每行/列/区域的星数。
 */
export declare function starsFor(size: number): number;
/** 1 基关卡的盘面边长（第 5 关后循环）。 */
export declare function levelSize(level: number): number;
/** 过关得分：基础 100×关卡 + 每秒衰减 5 的时间奖励（下限 0）。 */
export declare function computeScore(level: number, seconds: number): number;
/**
 * 点击循环状态机：空 → 星 → ✗ → 空。
 * @param mark - 当前格标记。
 * @returns 下一格标记。
 */
export declare function cycleMark(mark: CellMark): CellMark;
/** 正交（上下左右）邻居。 */
export declare function neighbors(size: number, cell: number): number[];
/** 王步邻居：正交 + 斜向共 8 格。 */
export declare function kingNeighbors(size: number, cell: number): number[];
/** 两格是否王步相邻（含自身算 false：a === b 不算相邻）。 */
export declare function touches(size: number, a: number, b: number): boolean;
/**
 * 划分是否合法：覆盖全盘、恰好 size 个区域（编号 0..size-1 各至少一
 * 格）、每区正交连通；区域大小可不等。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号。
 */
export declare function partitionValid(size: number, region: readonly number[]): boolean;
/**
 * 区域划分：单掷雕刻（见 carveOnce）失败就在函数内换随机流重试（上限
 * 32 掷，单掷成功率约 98%）；size 6–10 的盘基本总能成功，全部失败才
 * 返回 null。
 * @param rng - 注入随机源。
 * @param size - 盘面边长。
 * @returns 格 → 区域编号，或 null（32 掷全卡死，实际不可达）。
 */
export declare function generatePartition(rng: () => number, size: number): number[] | null;
/**
 * 数解（封顶 2，确定性）：同一回溯核心按放-first 分支序穷举，用于唯
 * 一性验证与小盘全解计数。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号。
 * @param k - 每行/列/区域的星数。
 * @param maxNodes - 节点预算（耗尽返回 exhausted=true）。
 */
export declare function solveCount(size: number, region: readonly number[], k: number, maxNodes?: number): SolveResult;
/** 对已生成关卡数解（测试/诊断）。 */
export declare function solvePuzzle(puzzle: StarPuzzle, maxNodes?: number): SolveResult;
/**
 * 种植一个完整解：随机分支序回溯找第一个合法星集（放-first 或
 * 放-last 每节点随机掷），预算内无解返回 null 由外层重掷。
 * @param rng - 注入随机源。
 * @param size - 盘面边长。
 * @param region - 格 → 区域编号。
 * @param k - 每行/列/区域的星数。
 * @param maxNodes - 节点预算。
 */
export declare function plantSolution(rng: () => number, size: number, region: readonly number[], k: number, maxNodes?: number): number[] | null;
/**
 * 由种子确定性生成一关：逐掷扰动种子（+attempt×常量）直到求解器证
 * 明唯一解；掷次用尽发布最后一掷（多解徽章）；全部失败退条带兜底。
 * @param seed - 种子（关卡号 × 常量即可）。
 * @param size - 盘面边长。
 */
export declare function puzzleFromSeed(seed: number, size: number): StarPuzzle;
/**
 * 胜负纯判定：星数恰为 k×size，每行/列/区域恰 k 颗，任意两颗不王步
 * 相邻。
 */
export declare function isWon(puzzle: StarPuzzle, stars: readonly number[]): boolean;
/**
 * 冲突格清单（即时红显用，不强制阻止）：所在行/列/区域计数超 k 的
 * 星、以及王步相邻星对（双方），全部标红；返回升序格下标。合法或
 * 未完成的中局返回空数组。
 */
export declare function findConflicts(puzzle: StarPuzzle, stars: readonly number[]): number[];
