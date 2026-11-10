/**
 * 八皇后纯逻辑：N×N 棋盘（档位 4/6/8）上放置 N 个皇后，任意两皇后
 * 不得同行、同列、同对角线。仅含确定性纯函数——无 DOM、无定时器；随机
 * 性（参考解的列序洗牌）全部经由注入的 rng（mulberry32）驱动，同种子
 * 同序列。
 */
/** 递进档位：4×4 → 6×6 → 8×8。 */
export declare const LEVELS: readonly [4, 6, 8];
/** 一个皇后所在的格子（0 起的行列下标）。 */
export interface Pos {
    row: number;
    col: number;
}
/** 一局局面：已放置的皇后按放置顺序排列。 */
export interface QueensState {
    /** 棋盘边长（档位）。 */
    size: number;
    /** 已放置的皇后。 */
    queens: Pos[];
    /** 放置次数（移除不计数，越少越优）。 */
    moves: number;
    /** 是否已过关（放满 N 个且零冲突）。 */
    won: boolean;
}
/**
 * mulberry32 确定性伪随机数生成器：返回 [0,1) 的函数，同种子同序列。
 * @param seed - 非负整数种子。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 两格是否互相攻击：同行、同列或同对角线（|Δrow| === |Δcol|）。
 * @param a - 第一格。
 * @param b - 第二格。
 */
export declare function attacks(a: Pos, b: Pos): boolean;
/**
 * 判定 (row, col) 相对已放置皇后是否安全（不与任何皇后同行/列/两对角线）。
 * @param queens - 已放置的皇后。
 * @param row - 目标行（0 起）。
 * @param col - 目标列（0 起）。
 */
export declare function queenSafe(queens: Pos[], row: number, col: number): boolean;
/**
 * 互相攻击的皇后对数（无序对计数）：零即无冲突。
 * @param queens - 已放置的皇后。
 */
export declare function conflictCount(queens: Pos[]): number;
/**
 * 每个皇后是否处于冲突中（与至少一个其他皇后互相攻击）——渲染红色标记用。
 * @param queens - 已放置的皇后。
 * @returns 与 queens 等长的布尔数组。
 */
export declare function conflictingQueens(queens: Pos[]): boolean[];
/**
 * 完成判定：恰好放满 N 个皇后且零冲突。
 * @param state - 当前局面。
 */
export declare function isSolved(state: QueensState): boolean;
/**
 * 点击格子转移：空格放置皇后（moves + 1），已有皇后的格子移除（不计步）。
 * 放满 N 个零冲突即置 won。纯函数，不修改入参。
 * @param state - 当前局面。
 * @param row - 目标行（0 起）。
 * @param col - 目标列（0 起）。
 * @returns 新局面；越界或已过关返回 null。
 */
export declare function toggle(state: QueensState, row: number, col: number): QueensState | null;
/**
 * 计时挑战计分：底分 N²×10 + 剩余时间奖励（每秒 4 分，上限 N×30 秒）-
 * 多余放置惩罚（每次 5 分），下限 N×10。
 * @param size - 棋盘边长。
 * @param seconds - 过关用时（秒）。
 * @param moves - 放置次数。
 */
export declare function winScore(size: number, seconds: number, moves: number): number;
/**
 * 回溯求解一个参考解：逐行放置，每行列候选用注入 rng 洗牌——同种子得到
 * 同一解（确定性可测），不同种子给出多样的解。
 * @param size - 棋盘边长（≥4 必有解）。
 * @param rng - 注入的确定性随机源。
 * @returns 每行一个皇后的解；无解返回 null。
 */
export declare function randomSolution(size: number, rng: () => number): Pos[] | null;
/**
 * 开新局：清空棋盘、步数归零。
 * @param size - 棋盘边长。
 */
export declare function createBoard(size: number): QueensState;
