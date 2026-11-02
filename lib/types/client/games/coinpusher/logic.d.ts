/**
 * 推金币 Coin Pusher 纯逻辑：确定性固定子步物理。
 *
 * 侧视机台模型：台面顶面 PLAT_Y、前沿 EDGE_X、左侧墙 WALL_X；推板是一块
 * 垂直往复运动的板（左面 pusherX，宽 PUSH_W），右面把台面上的静态币堆向
 * 前沿推挤。币为等半径圆盘，两种状态：
 *  - fall：空中币，按重力积分（投币下落、被推过沿翻落的币）；
 *  - rest：堆内币，无速度，仅被约束（推板/邻居/台面/墙）位移——圆-圆
 *    静态堆叠近似：每子步固定 ITER 次松弛分离，位移逐层传递。
 * 中心越过 EDGE_X 的 rest 币失去支撑翻落；下落币越过 SCORE_Y 结算得分
 * 并移除（普通+1 / 银+5 / 金+20 / 奖励币+10 并触发大堆倾倒前冲）。
 * 币量以 MAX_COINS 封顶（超出时移除最后方的 rest 币），所有计算每帧
 * 有界：子步数 ≤ ceil(0.05/SUB)，配对数 ≤ MAX_COINS^2。
 */
/** 币种：普通 / 银币 / 金币 / 奖励币（触发大堆倾倒）。 */
export type CoinType = 'normal' | 'silver' | 'gold' | 'bonus';
/** 掉落结算分值表。 */
export declare const COIN_SCORES: Readonly<Record<CoinType, number>>;
export declare const WALL_X = 64;
export declare const PLAT_Y = 332;
export declare const EDGE_X = 540;
export declare const PUSH_W = 110;
/** 推板左面行程：140..300，推进面最远 410，与台沿 540 之间是币堆区。 */
export declare const PUSH_X_BACK = 140;
export declare const PUSH_TRAVEL = 160;
export declare const PUSH_H = 100;
export declare const COIN_R = 11;
/** 投币：7 列，落点 170..380（覆盖推板台的往复行程，币落在板顶或暴露的台面上）。 */
export declare const DROP_COLS = 7;
export declare const DROP_X0 = 170;
export declare const DROP_X1 = 380;
export declare const DROP_Y = 66;
export declare const SUB: number;
export declare const ROUND_MS = 60000;
export declare const START_COINS = 40;
export declare const COOLDOWN_MS = 340;
export declare const MAX_COINS = 120;
/** 一枚币。id 全局递增，保证求解顺序确定。 */
export interface Coin {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    type: CoinType;
    state: 'fall' | 'rest';
}
export type CoinPusherEvent = {
    kind: 'score';
    type: CoinType;
    x: number;
    y: number;
    points: number;
} | {
    kind: 'quake';
} | {
    kind: 'ended';
    reason: 'time' | 'coins';
};
export interface CoinPusherState {
    coins: Coin[];
    /** 推板左面位置（右面 = pusherX + PUSH_W）。 */
    pusherX: number;
    phase: number;
    score: number;
    coinsLeft: number;
    timeLeftMs: number;
    aimCol: number;
    cooldownMs: number;
    result: 'playing' | 'ended';
    /** 奖励币触发后的余震计时（ms），仅渲染用。 */
    quakeMs: number;
    dropCount: number;
    events: CoinPusherEvent[];
    /** 每局一个种子；投币类型由它驱动，保证可重放。 */
    rng: () => number;
    nextId: number;
    /** 固定子步累加器（帧切块无关的重放）。 */
    acc: number;
}
/** mulberry32 种子随机（同 slitherlink 算法，游戏内自持一份避免耦合）。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 开一局。
 * @param seed 局种子（投币类型与开局币堆）。
 */
export declare function createGame(seed: number): CoinPusherState;
/** 推板左面位置（余弦往复，前进慢回程快由波形自然给出）。 */
export declare function pusherXAt(phase: number): number;
/** 瞄准列横坐标。 */
export declare function colX(col: number): number;
/**
 * 移动瞄准列（钳制在 [0, DROP_COLS)）。
 * @param s 局状态。
 * @param dir -1 左移一列，+1 右移一列。
 */
export declare function moveAim(s: CoinPusherState, dir: number): void;
/**
 * 投一枚币：冷却中、币尽或已结束返回 false；命中则在落点生成 fall 币并
 * 进入冷却。类型由局种子决定（约 10% 金 / 24% 银，每 BONUS_EVERY 枚一枚
 * 奖励币）。超过 MAX_COINS 时移除最后方的 rest 币封顶。
 * @param s 局状态。
 * @param col 目标列，省略时用当前瞄准列。
 * @returns 是否投出。
 */
export declare function dropCoin(s: CoinPusherState, col?: number): boolean;
/**
 * 推进一帧：dt 秒（内部钳到 0.05s），按固定子步 SUB 消耗累加器执行，
 * 并扣除冷却与倒计时；结束条件为时间到，或投币用尽且最后一枚空中币已落定。
 * @param s 局状态。
 * @param dt 帧间隔秒。
 */
export declare function step(s: CoinPusherState, dt: number): void;
