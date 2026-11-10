/**
 * 马踏棋盘（骑士巡游）纯逻辑：局面构造、马步合法性、Warnsdorff 出度
 * 启发与种子化巡游构造。无 DOM、无副作用，可独立于渲染测试。
 */
/** 档位棋盘边长：5x5 热身 / 6x6 进阶 / 8x8 完整挑战。 */
export declare const BOARD_SIZES: readonly number[];
/**
 * mulberry32 种子随机数发生器：同 seed 产生同一序列，供随机起点与
 * Warnsdorff 平局打破注入可测的确定性。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 巡游局面：路径为已访问格序号序列（格序号 = 行 * size + 列）。 */
export interface TourState {
    /** 棋盘边长。 */
    readonly size: number;
    /** 已访问格序号，按步序排列；最后一项为骑士当前所在格。 */
    readonly path: readonly number[];
    /** 与 path 同步的访问标记（O(1) 查询）。 */
    readonly visited: readonly boolean[];
    /** 本局已消耗的提示次数。 */
    readonly hintsUsed: number;
}
/** 局面终态：进行中 / 访满过关 / 无路可走且未访满。 */
export type TourStatus = 'playing' | 'won' | 'stuck';
/** 格序号转行列。
 * @param size - 棋盘边长。
 * @param cell - 格序号。
 * @returns 行与列（0 起）。 */
export declare function rowCol(size: number, cell: number): {
    row: number;
    col: number;
};
/** 骑士从 cell 出发的全部棋盘内马步（不排除已访问格）。
 * @param size - 棋盘边长。
 * @param cell - 起点格序号。
 * @returns 目标格序号数组（按偏移固定顺序）。 */
export declare function knightMoves(size: number, cell: number): number[];
/** 构造初始局面：骑士位于 start，已访问仅此一格。
 * @param size - 棋盘边长。
 * @param start - 起点格序号。
 * @returns 初始局面。 */
export declare function createTour(size: number, start: number): TourState;
/** 随机起点：奇数边长（5x5）仅从多数色格（行+列为偶数）出发才存在
 * 完整巡游，故限定候选；偶数边长任意格皆有已知解。
 * @param size - 棋盘边长。
 * @param rng - mulberry32 实例。
 * @returns 起点格序号。 */
export declare function randomStart(size: number, rng: () => number): number;
/** 当前可达格：从当前格出发且未访问的马步目标。
 * @param state - 当前局面。
 * @returns 可达格序号数组。 */
export declare function reachableMoves(state: TourState): number[];
/** 判定终态：访满为 won，未访满且无可达格为 stuck，否则 playing。
 * @param state - 当前局面。
 * @returns 终态标签。 */
export declare function tourStatus(state: TourState): TourStatus;
/** 走一步：目标是当前格的合法马步且未访问时返回新局面，否则返回 null。
 * @param state - 当前局面。
 * @param to - 目标格序号。
 * @returns 新局面，非法步为 null。 */
/**
 * 撤回上一步：路径退一格（保留起点），visited 重建；起点无步可撤。
 * @param state - 当前状态。
 * @returns 新状态；已在起点返回 null。
 */
export declare function undoTour(state: TourState): TourState | null;
export declare function moveTour(state: TourState, to: number): TourState | null;
/** Warnsdorff 出度：cell 的马步中未访问的目标数。
 * @param state - 当前局面。
 * @param cell - 待评估格序号（不必可达）。
 * @returns 未访问马步数。 */
export declare function warnsdorffDegree(state: TourState, cell: number): number;
/** 提示格：可达格中 Warnsdorff 出度最小者；平局取格序号最小，确定可测。
 * @param state - 当前局面。
 * @returns 提示格序号，无可达格为 null。 */
export declare function bestHint(state: TourState): number | null;
/** Warnsdorff 贪心巡游构造：每步走向出度最小的未访问马步，平局由种子
 * 随机打破。贪心不保证成功，返回实际走过的路径（可能不满）。
 * @param size - 棋盘边长。
 * @param start - 起点格序号。
 * @param seed - mulberry32 种子。
 * @returns 路径格序号数组；同参数结果完全一致。 */
export declare function warnsdorffTour(size: number, start: number, seed: number): number[];
