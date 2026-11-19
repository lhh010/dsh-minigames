/**
 * 阴阳双色 (YinYang) 纯逻辑。N×N 网格：部分格预标黑 ● / 白 ○（不可改），
 * 其余空格由玩家填黑或白。约束：所有黑格四连通成一整片、所有白格四连通
 * 成一整片、任何 2×2 区域不得同色（黑白都必须出现）。全部填满且约束满足
 * 即过关。
 *
 * 生成（构造法，seed 确定）：先随机生长黑白两团互相咬合的区域——每步只
 * 在己方团块邻旁落子并在落子前检查不会与已填格拼出同色 2×2，因此成品
 * 天然无 2×2 违例且双色各自连通；随后按随机顺序逐格"挖孔"，每挖一格用
 * 解数计数器验证剩余线索仍唯一解，否则放回，直到线索数降到目标密度
 * （关卡越高密度越低 → 提示递减）。所有随机走注入 seed（mulberry32），
 * 同 seed 完全确定可测。
 */
/** 五个关卡的盘面边长（6×6 → 10×10）。 */
export declare const LEVEL_SIZES: readonly [6, 7, 8, 9, 10];
/** 空格标记。 */
export declare const EMPTY = -1;
/** 白 ○。 */
export declare const WHITE = 0;
/** 黑 ●。 */
export declare const BLACK = 1;
/** 一张阴阳双色盘面。 */
export interface YinYangBoard {
    /** 盘面边长（格）。 */
    size: number;
    /** 每格线索：EMPTY 玩家可填、WHITE/BLACK 预标不可改。 */
    clues: Int8Array;
    /** 生成解（构造法保证恰好填满后满足全部约束）。 */
    solution: Int8Array;
}
/** 解数计数结果。 */
export interface SolveCount {
    /** 找到的解数（至多 cap）。 */
    count: number;
    /** 是否因节点上限中止（true 时 count 只是下界）。 */
    hitCap: boolean;
}
/** 一次提示：推荐格及其确定色。 */
export interface YinYangHint {
    /** 目标格下标。 */
    cell: number;
    /** 推荐颜色（WHITE/BLACK）。 */
    color: number;
    /** true = 单着推理（反色无解）确定；false = 兜底揭示生成解。 */
    deduced: boolean;
}
/** mulberry32 伪随机数发生器：小而快，同 seed 序列确定。 */
export declare function mulberry32(seed: number): () => number;
/** 1 基关卡对应的盘面边长（第 5 关后循环）。 */
export declare function levelSize(level: number): number;
/** 盘面边长对应的目标线索密度（未知边长取 0.5）。 */
export declare function clueDensity(size: number): number;
/** 过关分数：100×关卡 + 每秒衰减 5 的时间奖励（下限 0）。 */
export declare function computeScore(level: number, seconds: number): number;
/**
 * 已填满的同色 2×2 方块（以左上角下标记），扫描全部 2×2 窗口。
 * @param grid - 盘面（EMPTY/WHITE/BLACK）。
 * @param size - 盘面边长。
 * @returns 左上角下标数组（无违例为空）。
 */
export declare function monoSquares(grid: Int8Array, size: number): number[];
/**
 * 参与任一同色 2×2 违例的格集合（渲染红框警示用）。
 * @param grid - 盘面。
 * @param size - 盘面边长。
 * @returns 违例格下标集合。
 */
export declare function conflictCells(grid: Int8Array, size: number): Set<number>;
/**
 * 某颜色的已填格是否四连通（BFS）。该色无已填格视为连通（无从断裂）。
 * @param grid - 盘面。
 * @param size - 盘面边长。
 * @param color - WHITE 或 BLACK。
 * @returns 该色已填格成一整片时 true。
 */
export declare function colorConnected(grid: Int8Array, size: number, color: number): boolean;
/**
 * 双色已填区域是否各自连通（盘面边界发光指示用；只看已填格）。
 * @param grid - 盘面。
 * @param size - 盘面边长。
 */
export declare function filledConnected(grid: Int8Array, size: number): boolean;
/**
 * 胜利判定：无空格、无同色 2×2、黑白各自四连通。
 * @param grid - 盘面。
 * @param size - 盘面边长。
 */
export declare function isSolvedGrid(grid: Int8Array, size: number): boolean;
/**
 * 数解：在 givens（EMPTY 为自由格）上回溯搜索，返回至多 cap 个解。
 * 剪枝：落子即查其参与的 2×2 是否同色；叶子再做双色连通检查。
 * @param givens - 线索盘（EMPTY 待填）。
 * @param size - 盘面边长。
 * @param cap - 解数上限（找到即停）。
 * @param nodeCap - 搜索节点上限（超出中止，hitCap=true）。
 */
export declare function countSolutions(givens: Int8Array, size: number, cap?: number, nodeCap?: number): SolveCount;
/**
 * 提示：扫描空格，寻找"单着推理"格——某色落子后无解即确定另一色；
 * 找不到推理格时兜底揭示生成解的第一个空格颜色。
 * @param board - 盘面（取生成解兜底）。
 * @param grid - 当前玩家盘（含线索与已填格）。
 * @returns 提示；盘已填满返回 null。
 */
export declare function hintFromBoard(board: YinYangBoard, grid: Int8Array): YinYangHint | null;
/**
 * 由 seed 确定性生成一张盘面：生长满盘解 → 随机顺序挖孔（每孔验证唯一
 * 解），直到线索数降到目标密度。
 * @param seed - 种子（同 seed 同盘）。
 * @param size - 盘面边长。
 */
export declare function boardFromSeed(seed: number, size: number): YinYangBoard;
