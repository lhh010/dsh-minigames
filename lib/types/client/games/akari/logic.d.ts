/**
 * 点灯 (Akari) 纯逻辑。网格盘：黑格为墙（可带 0-4 数字），白格可放灯。
 * 灯照亮同行/同列直到墙的整段；胜利条件是所有白格被照亮，且任意两灯
 * 不能互相看见（同行/列无墙阻隔）、数字墙周围正邻格灯数等于数字。
 *
 * 生成采用构造法（解必然存在）：先在无墙空盘上随机放一批互不同行同列
 * 的灯，随后把未被照亮的格子（其行与列均无灯）全部补墙——墙绝不会
 * 落在任何灯的照射路径上，因此补墙后所有白格仍被照亮、灯互视冲突仍
 * 为空；数字墙的数字直接取自生成解的邻灯数，约束天然满足。
 */
/** 五个关卡的盘面边长（7×7 → 10×10）。 */
export declare const LEVEL_SIZES: readonly [7, 8, 8, 9, 10];
/** 白格标记（walls 数组中非墙）。 */
export declare const WHITE = -1;
/** 无数字墙标记。 */
export declare const PLAIN_WALL = -2;
/** 一张 Akari 盘面。 */
export interface AkariBoard {
    /** 盘面边长（格）。 */
    size: number;
    /**
     * 每格内容：-1 白格、-2 无数字墙、0..4 数字墙（要求周围正邻格恰有
     * 该数目的灯）。
     */
    walls: Int8Array;
    /** 生成解的灯位（构造法保证至少存在这一个解）。 */
    solution: ReadonlySet<number>;
}
/** mulberry32 伪随机数发生器：小而快，同 seed 序列确定。 */
export declare function mulberry32(seed: number): () => number;
/** 1 基关卡对应的盘面边长（第 5 关后循环）。 */
export declare function levelSize(level: number): number;
/** 过关分数：100×关卡 + 每秒衰减 5 的时间奖励（下限 0）。 */
export declare function computeScore(level: number, seconds: number): number;
/** 正邻格（上下左右，不出盘）。 */
export declare function neighborsOf(size: number, cell: number): number[];
/** 该格是否墙（含数字墙与无数字墙）。 */
export declare function isWall(board: AkariBoard, cell: number): boolean;
/**
 * 被照亮的白格集合：从每盏灯出发沿四方向传播直到墙（或盘边），
 * 沿途白格全部照亮；灯自身也照亮。
 */
export declare function litCells(board: AkariBoard, lights: ReadonlySet<number>): Set<number>;
/**
 * 互相看见的灯集合：从每盏灯沿四方向找到的第一盏灯即冲突，
 * 双方都进入结果（红显用）。
 */
export declare function conflictingLights(board: AkariBoard, lights: ReadonlySet<number>): Set<number>;
/**
 * 违反数字约束的墙集合：数字墙周围正邻格的灯数 ≠ 数字时该墙入集。
 */
export declare function numberViolations(board: AkariBoard, lights: ReadonlySet<number>): Set<number>;
/**
 * 胜利判定：灯全在白格上、无灯互视、无数字违约、所有白格被照亮。
 */
export declare function isSolved(board: AkariBoard, lights: ReadonlySet<number>): boolean;
/**
 * 由 seed 确定性生成一张盘面（构造法，解至少为 solution）：
 * 空盘上随机贪心放互不同行同列的灯（数量随关卡提升），未照亮的
 * 格子补墙，数字墙的数字取生成解的邻灯数（约七成邻灯墙标数字，
 * 少量无邻灯墙标 0），其余墙保持无数字。
 * @param seed - 种子（同 seed 同盘）。
 * @param size - 盘面边长。
 */
export declare function boardFromSeed(seed: number, size: number): AkariBoard;
