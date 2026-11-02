/**
 * 麻将连连看（Mahjong Link）纯逻辑：单层行列网格上按 seed+关卡生成成对牌面
 * （网格随机抽空形成孔洞图案），两张同牌且连接路径（水平/垂直线段、最多两次
 * 拐弯、不经过未消除牌；孔洞/已消格/场外一圈可通行）即可消除。包含提示对搜索、
 * 死局检测与自动洗牌、计时挑战计分（剩余时间奖励）与多关递进。全部为确定性
 * 纯函数 + 普通状态对象；index.ts 驱动动画与输入，单元测试直接驱动逻辑。
 */
/** 网格坐标（行 r、列 c；路径坐标允许 -1 / rows / cols 的场外虚拟圈）。 */
export interface Pos {
    r: number;
    c: number;
}
export type MahjongResult = 'none' | 'win' | 'lose';
export interface MahjongState {
    rows: number;
    cols: number;
    /** rows x cols；0 = 空（孔洞或已消除），> 0 = 牌面编号 1..27。 */
    grid: number[][];
    /** 原始放牌位掩码（true = 该格属于本关布局；孔洞恒为 false）。 */
    layout: boolean[][];
    /** 累计得分（跨关累加，重开清零）。 */
    score: number;
    level: number;
    /** 剩余挑战秒数。 */
    timeLeft: number;
    timeLimit: number;
    /** 本关是否用过提示（用过则过关无剩余时间奖励）。 */
    hintUsed: boolean;
    result: MahjongResult;
    rng: () => number;
}
/** 牌桌固定网格尺寸。 */
export declare const GRID_ROWS = 8;
export declare const GRID_COLS = 12;
/** 花色数：筒、条、万。 */
export declare const SUITS = 3;
/** 每花色点数 1..9。 */
export declare const RANKS = 9;
/** 编号上限 = 27。 */
export declare const MAX_KINDS: number;
/** 某关的牌对数（12 对起步，每关 +3，封顶 36 对 = 72 张）。 */
export declare function levelPairs(level: number): number;
/** 某关可用的牌面种数（图案复杂度随关卡递进，封顶 27）。 */
export declare function levelKinds(level: number): number;
/** 某关的挑战时长（秒）：基础 100 秒 + 每对 4 秒。 */
export declare function levelTimeSec(level: number): number;
/** 消掉一对的基础分（关卡越高每对分越高）。 */
export declare function pairScore(level: number): number;
/** 过关时的剩余时间奖励（每剩 1 秒 +3；用过提示则无奖励）。 */
export declare function timeBonus(state: MahjongState): number;
/** 牌面编号的花色：0=筒 1=条 2=万。 */
export declare function suitOf(kind: number): number;
/** 牌面编号的点数 1..9。 */
export declare function rankOf(kind: number): number;
/** 用 state.rng 重建指定关的布局与牌面（孔洞图案由随机抽空得到）。 */
export declare function generateBoard(state: MahjongState, level: number): void;
/** 建立指定关的全新状态（rng 决定全部随机性，同 seed 同关卡结果确定）。 */
export declare function createMahjongState(rng?: () => number, level?: number): MahjongState;
/**
 * 求两枚同牌之间的合法连接路径（水平/垂直线段，最多两次拐弯）。
 * @param grid - 当前牌面网格。
 * @param a - 起点牌格。
 * @param b - 终点牌格。
 * @returns 折线拐点序列（含两端点），无合法路径时返回 null。
 */
export declare function findPath(grid: number[][], a: Pos, b: Pos): Pos[] | null;
/** 两格是否为可消对：均为牌面、同编号且存在合法路径。 */
export declare function canRemove(grid: number[][], a: Pos, b: Pos): boolean;
/**
 * 消除一对同牌：计分并在清空全场时结算过关（含剩余时间奖励）。
 * @returns 用于动画的路径拐点序列；不可消时返回 null。
 */
export declare function removePair(state: MahjongState, a: Pos, b: Pos): Pos[] | null;
/** 剩余未消对数。 */
export declare function pairsRemaining(grid: number[][]): number;
/** 暴力搜索第一对可消牌（小牌面可直接用；大搜索请用 ai.ts 分帧版）。 */
export declare function findHintPair(grid: number[][]): [Pos, Pos] | null;
/** 是否仍存在可消对（false 即死局）。 */
export declare function hasAnyMatch(grid: number[][]): boolean;
/**
 * 死局洗牌：保持牌面多重集不变，重排各格编号，直到出现可消对（最多尝试 64 次）。
 * @returns 洗牌后是否存在可消对。
 */
export declare function shuffleTiles(state: MahjongState): boolean;
/** 计时推进：到 0 秒判负（已有结果则不动）。 */
export declare function tickTime(state: MahjongState, dtSec: number): void;
/** 进入下一关：保留累计分，重建更大更复杂（封顶前）的牌面。 */
export declare function advanceLevel(state: MahjongState): void;
/** 重开当前关：清零得分并重建本关牌面。 */
export declare function restartLevel(state: MahjongState): void;
