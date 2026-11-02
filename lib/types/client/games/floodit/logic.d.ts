/**
 * Flood It（填色）纯逻辑：N×N 六色盘，从左上角连通片开始，每次把当前
 * 连通片整体换成一种颜色并与相邻同色格合并；整盘同色即过关。生成时用
 * BFS 贪心解校准步数上限（贪心步数 × 1.4 取整），保证贪心解必然可通关。
 * 所有函数均为纯函数，输入状态不会被修改。
 */
/** mulberry32 种子随机数（与 slitherlink 同族实现，纯函数闭包）。 */
export declare function mulberry32(seed: number): () => number;
/** 调色盘颜色数（六色）。 */
export declare const COLOR_COUNT = 6;
/** 关卡尺寸：第 1 关 8×8 起步，每关 +1，封顶 14×14（level 为 0 基）。 */
export declare function boardSizeForLevel(level: number): number;
/** 关卡基数（level 为 0 基，展示为第 level+1 关）。 */
export declare function levelBaseScore(level: number): number;
/** 过关得分：剩余步数 × 10 + 关卡基数。 */
export declare function scoreFor(level: number, movesLeft: number): number;
/** 一局游戏的可序列化状态。 */
export interface FloodItState {
    size: number;
    colorCount: number;
    /** 行优先颜色索引，length = size*size，board[0] 为左上角（当前连通片颜色）。 */
    board: number[];
    /** 已用步数。 */
    steps: number;
    /** 本关步数上限（生成时贪心解 × 1.4 取整）。 */
    maxSteps: number;
    /** 全盘同色即 true。 */
    won: boolean;
}
/**
 * 由 (seed, level) 确定性地生成一关：随机六色盘 + 贪心解校准的步数上限。
 * @param seed - 全局种子。
 * @param level - 0 基关卡号。
 * @returns 初始状态（steps=0，won 由盘面是否恰好同色决定）。
 */
export declare function createLevel(seed: number, level: number): FloodItState;
/** 盘面是否全同色。 */
export declare function isUniform(board: number[]): boolean;
/**
 * 从 (row, col) 出发颜色相同的连通格索引集合（BFS）。
 * @returns 访问标记数组（length = size*size，连通片内为 true）。
 */
export declare function componentOf(board: number[], size: number, row: number, col: number): boolean[];
/**
 * 换色一步（纯函数）：把左上连通片换成 color 并与相邻同色片合并。
 * 已胜利、颜色与当前片相同、或步数耗尽时返回原状态（不消耗步数）。
 * @param state - 当前状态（不会被修改）。
 * @param color - 目标颜色索引（0..colorCount-1）。
 * @returns 新状态；无效/无操作时返回原引用。
 */
export declare function flood(state: FloodItState, color: number): FloodItState;
/**
 * 贪心下一步色：对每个候选色模拟 flood，取换色后左上连通片最大者，
 * 并列取颜色索引最小者（确定性）。
 * @returns 颜色索引；已胜利时返回 -1。
 */
export declare function greedyNextColor(state: FloodItState): number;
/**
 * 从初始盘面用贪心策略通关所需的步数（生成关卡时校准步数上限用）。
 * @param board - 初始盘面（不会被修改）。
 * @param size - 边长。
 * @returns 贪心通关步数；对不可达的退化输入最多迭代 size*size*COLOR_COUNT 步。
 */
export declare function greedySolveLength(board: number[], size: number): number;
