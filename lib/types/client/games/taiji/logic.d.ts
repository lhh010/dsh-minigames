/**
 * 太极 (Taiji) 纯逻辑。本实现采用简化规则（经典 Taiji 的双格 tile 规则
 * 过于复杂，见棋盘化说明）：n×n 盘（n 为偶数），盘面分预置白圈格（锁定
 * 颜色的给定格，必须放置）与自由格；玩家在自由格放置黑/白 tile，胜利
 * 条件为 ——① 全盘填满；② 每行每列恰好一半黑一半白；③ 任意正交相邻
 * 两格颜色不同（因此终局必为棋盘着色）。
 *
 * 生成：随机选一个棋盘着色（两种极性之一）作为唯一解，随机抽取若干格
 * 作为白圈预置格（密度随关卡下降）；受限求解器枚举两种棋盘着色对给定
 * 格的一致性以验证唯一解，不唯一则重掷（只要存在至少一个给定格，两种
 * 极性必然互斥，解必唯一）。
 */
/** 各关卡的盘面边长（n 为偶数，共 5 关，5→8 表示关卡数与最大边长）。 */
export declare const LEVEL_SIZES: readonly [4, 6, 6, 8, 8];
/** 格子颜色：0 空、1 黑、2 白。 */
export declare const EMPTY = 0;
export declare const BLACK = 1;
export declare const WHITE = 2;
export type CellValue = 0 | 1 | 2;
/** 一个生成的太极关卡。 */
export interface TaijiPuzzle {
    /** 盘面边长（偶数）。 */
    size: number;
    /** 白圈预置格：格下标 → 锁定颜色（黑 1 / 白 2），不可更改。 */
    clues: ReadonlyMap<number, CellValue>;
    /** 生成解（棋盘着色，黑 1 / 白 2）。 */
    solution: readonly CellValue[];
    /** 求解器是否证明恰好一个解。 */
    unique: boolean;
}
/** mulberry32 PRNG：小而快，按种子确定。 */
export declare function mulberry32(seed: number): () => number;
/** 1 基关卡的盘面边长（超过第 5 关后循环）。 */
export declare function levelSize(level: number): number;
/** 过关得分：基础 100×关卡 + 随秒衰减的时间奖励（5/秒，封顶 3000）。 */
export declare function computeScore(level: number, seconds: number): number;
/**
 * 受限求解器：枚举两种棋盘着色（极性 0/1），统计与全部给定格一致的
 * 数量，最多数到 2。棋盘着色格值：极性 p 下 (r+c+p)%2===0 为黑。
 * @param size - 盘面边长。
 * @param clues - 给定格（下标 → 颜色）。
 * @returns 与给定格一致的棋盘着色数量（0..2）。
 */
export declare function countSolutions(size: number, clues: ReadonlyMap<number, CellValue>): number;
/**
 * 纯胜利判定：全盘填满、每行每列黑白各半、任意正交相邻两格不同色，
 * 且所有给定格保持锁定颜色。
 * @param puzzle - 当前关卡。
 * @param grid - 玩家盘面（0 空 / 1 黑 / 2 白）。
 * @returns 是否满足全部胜利条件。
 */
export declare function isWon(puzzle: TaijiPuzzle, grid: readonly CellValue[]): boolean;
/** 冲突报告：越界行列与相邻同色对，供渲染红色提示。 */
export interface TaijiConflicts {
    /** 黑格数不等于 n/2 的行下标集合。 */
    rows: ReadonlySet<number>;
    /** 黑格数不等于 n/2 的列下标集合。 */
    cols: ReadonlySet<number>;
    /** 处在冲突行/列或与邻格同色的格下标集合。 */
    cells: ReadonlySet<number>;
}
/**
 * 找出当前盘面的冲突（仅统计已放置格；空格不计入黑白数）。行/列越界
 * 判定：已满且黑数≠n/2，或黑数>n/2（仍可补救的欠数不算冲突）。
 * @param size - 盘面边长。
 * @param grid - 玩家盘面。
 * @returns 冲突行列与冲突格集合。
 */
export declare function findConflicts(size: number, grid: readonly CellValue[]): TaijiConflicts;
/**
 * 由种子确定性地生成一关：随机棋盘着色极性为解，按关卡密度随机抽取
 * 白圈给定格；受限求解器验证唯一解，否则换种子重掷（保底尝试 8 次）。
 * @param seed - 种子（不同关卡用不同种子）。
 * @param size - 盘面边长（偶数）。
 * @param level - 1 基关卡号，决定给定格密度。
 * @returns 唯一解的关卡。
 */
export declare function puzzleFromSeed(seed: number, size: number, level: number): TaijiPuzzle;
