/**
 * 真珠回路 (Masyu) 纯逻辑。与数回 (slitherlink) 同族的格点边模型：
 *   - 水平边：w 列 × (h+1) 行 → 索引 [0, w*(h+1))
 *   - 垂直边：(w+1) 列 × h 行 → 索引 [w*(h+1), ...)
 * 边状态 0 未知 / 1 画线 / 2 叉。珠规则按"格"判定：
 *   - 白珠格：回路经过（恰两条对边画线 = 直行），且沿前进方向的相邻格
 *     中至少一格转弯；
 *   - 黑珠格：回路在该格转弯（恰两条邻边画线），且两个方向中至少一侧
 *     相邻格直行。
 * 胜利 = 画线构成单一闭合回路（每点度数恰 2、单连通分量，无分叉无
 * 交叉）且所有珠满足。
 *
 * 生成：格点上生长式随机自避免闭合回路（直行偏好随机游走 + 回溯，
 * 预算封顶），按回路形状挑出合法白/黑珠候选格，随机抽珠后用预算
 * 封顶的回溯求解器验证唯一解（不足则补珠，仍不足则重掷回路；
 * 全部失败时回落到边框环 + 全候选珠、标记多解）。
 */
/** 边状态：0 未知 / 1 画线 / 2 叉。 */
export type EdgeState = 0 | 1 | 2;
/** 珠类型：0 无珠 / 1 白珠 / 2 黑珠。 */
export type Pearl = 0 | 1 | 2;
/** 格在当前边集下的形态。 */
export type CellKind = 'straight-h' | 'straight-v' | 'turn' | 'off' | 'partial' | 'over';
/** 五关棋盘边长（正方形棋盘）。 */
export declare const LEVEL_SIZES: readonly number[];
/** mulberry32 种子随机数发生器。 */
export declare function mulberry32(seed: number): () => number;
/** 水平边索引。col ∈ [0,w)，row ∈ [0,h]。 */
export declare function hEdgeIndex(w: number, col: number, row: number): number;
/** 垂直边索引。col ∈ [0,w]，row ∈ [0,h)。 */
export declare function vEdgeIndex(w: number, h: number, col: number, row: number): number;
/** 水平边总数。 */
export declare function hEdgeCount(w: number, h: number): number;
/** 边总数。 */
export declare function edgeCount(w: number, h: number): number;
/** 格 (c,r) 四条边 [N, E, S, W]。 */
export declare function cellEdges(w: number, h: number, c: number, r: number): [number, number, number, number];
/** 边 i 连接的两个格点索引。 */
export declare function edgeDots(w: number, h: number, i: number): [number, number];
/** 格点 d 的所有关联边索引。 */
export declare function edgesAtDot(w: number, h: number, d: number): number[];
/** 回路结构检查：每点度数 0 或 2，且画线构成单连通分量。 */
export declare function cycleCheck(edges: readonly number[], w: number, h: number): {
    singleCycle: boolean;
    degreeOk: boolean;
};
/** 度数 ≥3 的格点（分叉；度数 4 同时也是交叉），用于违规红显。 */
export declare function branchDots(edges: readonly number[], w: number, h: number): number[];
/** 格形态分类：直行（水平/垂直）/ 转弯 / 未经过 / 半经过 / 超过两条。 */
export declare function classifyCell(edges: readonly number[], w: number, h: number, c: number, r: number): CellKind;
/**
 * 珠是否已被当前边集证伪（形状不可能，或形状已定而相邻规则已不可能）。
 * 只在"确定无解"时报违规，不因邻居尚未画线而误报。
 */
export declare function pearlBroken(edges: readonly number[], pearls: readonly Pearl[], w: number, h: number, c: number, r: number): boolean;
/** 已证伪的珠格列表（违规红显）。 */
export declare function pearlViolations(edges: readonly number[], pearls: readonly Pearl[], w: number, h: number): number[];
/** 纯胜利判定：单一闭合回路且所有珠满足（0 视为未画线）。 */
export declare function isWon(edges: readonly number[], pearls: readonly Pearl[], w: number, h: number): boolean;
/** 求解结果：解数（封顶 2）、预算是否耗尽、消耗节点数。 */
export interface SolveResult {
    solutions: number;
    exhausted: boolean;
    nodes: number;
}
/**
 * 预算封顶的回溯求解器：以"点度数 0/2"与"珠形状 + 相邻规则"做传播
 * 剪枝，从开放端（度数 1 的点）或首颗珠播种扩展，统计满足全部规则
 * 的单一闭合回路数（最多数到 2）。
 */
export declare function solveCount(w: number, h: number, pearls: readonly Pearl[], budget?: number): SolveResult;
/** 一局生成结果。 */
export interface MasyuPuzzle {
    w: number;
    h: number;
    /** 每格珠类型（0 无珠）。 */
    pearls: Pearl[];
    /** 生成回路：1 为回路边，0 为空。 */
    solution: EdgeState[];
    /** 求解器是否证明了唯一解。 */
    unique: boolean;
}
/** 过关得分：基础 100×关数；未用提示时叠加随时间衰减的奖励。 */
export declare function computeScore(level: number, seconds: number, hintUsed: boolean): number;
/**
 * 由种子生成一局：随机抽候选珠（约 65% 起），求解器验证唯一解，
 * 不足则逐颗补珠；证得唯一后再预算内随机减珠到下限。全部失败时
 * 回落到边框环 + 全候选珠（标记多解，仍可玩且自洽）。
 */
export declare function puzzleFromSeed(seed: number, w: number, h: number): MasyuPuzzle;
