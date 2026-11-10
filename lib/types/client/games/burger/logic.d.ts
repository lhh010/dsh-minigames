/**
 * 汉堡师傅纯逻辑：顾客订单（首尾面包 + 中间 3-6 层夹料序列）展示一段
 * 时间后隐藏，玩家按序点击配料逐层复刻——错一层整单作废重来（-1 心，
 * 共 3 心），正确出餐得基础分 + 剩余时间加成；随进度订单变长、展示窗
 * 口变短。一赛共 15 单，出满或心耗尽结束。全部为确定性纯函数（随机走
 * 注入 seed 的 mulberry32），无 DOM、无计时器。
 */
/** 面包层 id（订单首尾固定）。 */
export declare const BUN = "bun";
/** 夹料池（订单中间层从这里抽）。 */
export declare const FILLINGS: readonly ["lettuce", "patty", "cheese", "tomato", "onion", "pickle"];
/** 夹料 id 类型。 */
export type Filling = (typeof FILLINGS)[number];
/** 任意一层配料 id。 */
export type Ingredient = typeof BUN | Filling;
/** 一赛总单数（5 局 × 3 单）。 */
export declare const TOTAL_ORDERS = 15;
/** 初始心数。 */
export declare const START_HEARTS = 3;
/** 出餐基础分。 */
export declare const BASE_SCORE = 100;
/** 每剩余整秒的加成分。 */
export declare const BONUS_PER_SEC = 10;
/** 每单制作时限（毫秒）。 */
export declare const COOK_MS = 20000;
/** 第 1 单的订单展示时长。 */
export declare const SHOW_START_MS = 2500;
/** 每进一单展示缩短的毫秒数。 */
export declare const SHOW_STEP_MS = 100;
/** 展示时长的下限。 */
export declare const SHOW_MIN_MS = 1200;
/** 展示期（订单可见）/ 制作期（玩家堆层）/ 结束。 */
export type BurgerPhase = 'showing' | 'building' | 'over';
export interface BurgerState {
    phase: BurgerPhase;
    /** 当前第几单（1 起；作废重做不推进）。 */
    orderIndex: number;
    /** 已成功出餐的单数。 */
    ordersServed: number;
    hearts: number;
    score: number;
    /** 当前订单的完整序列（首尾为面包）。 */
    order: Ingredient[];
    /** 玩家已正确堆上的层。 */
    stacked: Ingredient[];
    /** 展示期已流逝毫秒。 */
    showElapsedMs: number;
    /** 本单展示窗口总长。 */
    showMs: number;
    /** 制作期剩余毫秒。 */
    timeLeftMs: number;
    rng: () => number;
}
/**
 * mulberry32 确定性伪随机数发生器（与 balloon/avalanche 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 创建初始状态并立即生成第 1 单。
 * @param seed - 注入的随机种子，同种子逐局可复现。
 * @returns 就绪的 BurgerState（phase='showing'）。
 */
export declare function createBurgerState(seed: number): BurgerState;
/**
 * 第 orderIndex 单的订单长度：1-4 单 3 层，5-8 单 4 层，9-12 单 5 层，
 * 13 单起 6 层（首尾面包 + 中间夹料）。
 * @param orderIndex - 1 起的单号。
 * @returns 订单总层数（含首尾面包）。
 */
export declare function orderLength(orderIndex: number): number;
/**
 * 第 orderIndex 单的展示时长：从 SHOW_START_MS 起每单缩短 SHOW_STEP_MS，
 * 下限 SHOW_MIN_MS。
 * @param orderIndex - 1 起的单号。
 * @returns 展示窗口毫秒数。
 */
export declare function showWindowMs(orderIndex: number): number;
/**
 * 为当前 orderIndex 生成新订单并进入展示期（作废重来也走这里：同单号
 * 换一张新订单）。
 * @param state - 游戏状态，原地更新。
 */
export declare function generateOrder(state: BurgerState): void;
/**
 * 空格跳过展示：展示期立即进入制作期（时间从满额起算）。
 * @param state - 游戏状态。
 * @returns 是否发生了跳过。
 */
export declare function skipShow(state: BurgerState): boolean;
/**
 * 制作期点击一个配料按钮：与订单下一层比对。
 * @param state - 游戏状态。
 * @param ingredient - 玩家点的配料 id。
 * @returns 'ignored' 非制作期；'correct' 对一层继续；'served' 整单完成
 *   出餐（含终局/新单）；'wrong' 错一层作废（含终局/重开）。
 */
export declare function stackIngredient(state: BurgerState, ingredient: Ingredient): 'ignored' | 'correct' | 'served' | 'wrong';
/**
 * 推进计时：展示期累计展示时间到点转制作期；制作期倒计时归零按作废
 * 处理。
 * @param state - 游戏状态。
 * @param dtMs - 本帧毫秒（由调用方钳制）。
 * @returns 'none' 无变化；'show-done' 展示结束进入制作；'timeout' 超时
 *   作废（可能已终局）；'over' 本 tick 内整赛结束（超时扣心后心尽）。
 */
export declare function tickBurger(state: BurgerState, dtMs: number): 'none' | 'show-done' | 'timeout' | 'over';
