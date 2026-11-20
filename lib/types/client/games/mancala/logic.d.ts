/**
 * 播棋（Kalaha 4×2 棋制）纯规则模块：棋盘 14 槽——索引 0-5 为玩家（下排）
 * 六坑、6 为玩家粮仓、7-12 为 AI（上排）六坑、13 为 AI 粮仓。逆时针播种序
 * 即 0→1→…→6→7→…→13→0，播种方跳过对侧粮仓。全部函数为纯函数，随机性
 * 一律经注入的 mulberry32 种子发生器，保证对局可确定性重放。
 */
/** 每侧坑数。 */
export declare const PIT_COUNT = 6;
/** 每坑初始籽数。 */
export declare const INITIAL_SEEDS = 4;
/** 玩家粮仓索引。 */
export declare const PLAYER_STORE = 6;
/** AI 粮仓索引。 */
export declare const AI_STORE = 13;
/** 执子一方：human=玩家（下排），ai=AI（上排）。 */
export type Side = 'human' | 'ai';
/** 终局胜者：draw=平局，null=未终局。 */
export type Winner = 'human' | 'ai' | 'draw' | null;
/** 一局盘面状态。 */
export interface MancalaState {
    /** 14 槽籽数（两排坑 + 两端粮仓）。 */
    pits: number[];
    /** 当前执子方。 */
    turn: Side;
    /** 是否已终局（含收割）。 */
    finished: boolean;
    /** 终局胜者，未终局为 null。 */
    winner: Winner;
}
/** applyMove 的完整结果，供动画与测试观测。 */
export interface MoveResult {
    state: MancalaState;
    /** 播种路径（逐籽落点索引顺序，绕圈会出现重复索引）。 */
    path: number[];
    /** 最后一籽落点索引。 */
    lastLand: number;
    /** 最后一籽落己方粮仓：获得再走一次。 */
    extraTurn: boolean;
    /** 是否触发吃子（落点籽 + 对侧全部入己方粮仓）。 */
    captured: boolean;
    /** 吃子入仓总籽数（未吃为 0）。 */
    capturedCount: number;
}
/** 某方的粮仓索引。
 * @param side - 执子方。
 * @returns 粮仓槽索引（6 或 13）。
 */
export declare function storeOf(side: Side): number;
/** 某方六个坑的索引列表（human: 0-5，ai: 7-12）。
 * @param side - 执子方。
 * @returns 坑索引数组。
 */
export declare function ownPits(side: Side): number[];
/** 槽是否属于某方的坑（非粮仓）。
 * @param side - 执子方。
 * @param index - 槽索引。
 * @returns 属于该方六坑之一时为 true。
 */
export declare function isOwnPit(side: Side, index: number): boolean;
/** 坑的对侧坑索引（0↔12、1↔11、…、5↔7）。
 * @param index - 己方坑索引（0-5 或 7-12）。
 * @returns 对侧坑索引。
 */
export declare function opposite(index: number): number;
/** 初始盘面：两排各 6 坑每坑 4 籽，粮仓为空，玩家先行。
 * @returns 初始状态。
 */
export declare function createMancala(): MancalaState;
/** 当前执子方的合法走法（己方非空坑）。
 * @param state - 盘面状态。
 * @returns 合法坑索引升序列表；终局为空数组。
 */
export declare function legalMoves(state: MancalaState): number[];
/** 播种序中的下一槽：越过对侧粮仓（human 跳过 13，ai 跳过 6）。
 * @param index - 当前槽索引。
 * @param side - 播种方。
 * @returns 下一槽索引。
 */
export declare function nextSlot(index: number, side: Side): number;
/** 收割终局：任一方六坑全空时，对侧剩余籽全入其粮仓并判定胜负。
 * @param pits - 待收割的 14 槽籽数（原地修改）。
 * @returns 胜者（'human' | 'ai' | 'draw'）；未触发收割返回 null。
 */
export declare function finishSweep(pits: number[]): Winner;
/** 执行一步走子：捡起己方坑全部籽逆时针逐坑播种，处理再走、吃子与终局收割。
 * 非法走法（终局、非己方坑、空坑）返回 null。
 * @param state - 走子前状态。
 * @param pit - 己方坑索引。
 * @returns 走子结果，非法时为 null。
 */
export declare function applyMove(state: MancalaState, pit: number): MoveResult | null;
/** mulberry32 确定性伪随机数发生器。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** AI 选步：贪心 + 一层展望（连走链、吃子、避免暴露），难度越高噪声越小、
 * 暴露惩罚越重。同种子同局面结果确定。
 * @param state - 当前局面（应为 AI 执子）。
 * @param difficulty - 难度 0-2（随局数递增）。
 * @param rng - 注入的 mulberry32 随机源。
 * @returns 选中的坑索引；无合法走法为 -1。
 */
export declare function chooseAiMove(state: MancalaState, difficulty: number, rng: () => number): number;
