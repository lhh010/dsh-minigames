/**
 * 蛇界争霸（Snake.io）确定性引擎：固定步长（TICK）的矩形竞技场蛇群模拟。
 * 与 slither 的圆形开放世界不同，本作是大逃杀规则：矩形世界四周是致命
 * 毒墙，开局宽限后中央毒圈持续收缩，圈外每 tick 掉长度；场上 AI 蛇不
 * 复活，玩家要么撞墙 / 撞蛇身而死，要么活到最后"吃鸡"。蛇身是头部位置
 * 轨迹；加速持续消耗长度并在尾部吐出光点；死亡按长度沿轨迹爆战利品。
 * AI 决策每条蛇按固定间隔轮转，随机数全部走 mulberry32(seed, round)，
 * 同 seed 同输入的 tick 序列完全一致（用 snakeioSnapshot 校验）。
 * 时间单位秒，物理单位 px。
 */
/** 固定模拟步长（秒，约 30 tick/s）。 */
export declare const TICK: number;
/** 矩形世界尺寸（四周毒墙，出界即死）。 */
export declare const WORLD_W = 2400;
export declare const WORLD_H = 1800;
/** 世界中心坐标。 */
export declare const CX: number;
export declare const CY: number;
/** 常规 / 加速速度（px/s）。 */
export declare const BASE_SPEED = 170;
export declare const BOOST_SPEED = 310;
/** 出生长度（也是最小段数基准）。 */
export declare const START_LENGTH = 12;
/** 低于该长度不允许加速。 */
export declare const MIN_BOOST_LENGTH = 14;
/** 加速每 tick 消耗的长度。 */
export declare const BOOST_COST_PER_TICK = 0.35;
/** 加速每几 tick 在尾部吐一个光点。 */
export declare const BOOST_DROP_EVERY = 3;
/** 每点光点价值的成长长度。 */
export declare const GROWTH_PER_VALUE = 0.5;
/** 场上常规光点保有量 / 硬上限（战利品可超保有量但不过上限）。 */
export declare const FOOD_TARGET = 240;
export declare const FOOD_CAP = 700;
/** AI 蛇数量（不复活：活到最后即吃鸡）。 */
export declare const AI_COUNT = 7;
/** 单条 AI 两次决策的间隔 tick 数。 */
export declare const AI_INTERVAL = 6;
/** 毒圈宽限 tick 数（宽限期内不收缩）。 */
export declare const ZONE_GRACE_TICKS = 600;
/** 毒圈每 tick 收缩的半径（px）。 */
export declare const ZONE_SHRINK_PER_TICK = 0.9;
/** 毒圈最小半径。 */
export declare const ZONE_MIN_R = 240;
/** 毒圈初始半径（覆盖整个矩形对角）。 */
export declare const ZONE_START_R: number;
/** 圈外每 tick 掉落的长度。 */
export declare const ZONE_DRAIN_PER_TICK = 0.2;
/** 长度低于该值且在圈外即被毒死。 */
export declare const ZONE_LETHAL_LENGTH = 6;
/** 蛇身点数上下限。 */
export declare const MIN_SEG = 8;
export declare const MAX_SEG = 400;
/** 出生/摆位时轨迹点的间距（= 常规速度每 tick 位移）。 */
export declare const HEAD_STEP: number;
/**
 * mulberry32 确定性随机数发生器（与其它游戏互不依赖的同名实现）。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 平面点。 */
export interface Vec {
    x: number;
    y: number;
}
/** 一条蛇（玩家或 AI）；points[0] 恒为蛇头，(x,y) 与其同步。 */
export interface IoSnake {
    id: number;
    /** 是否 AI（false = 玩家，恒为 snakes[0]）。 */
    ai: boolean;
    name: string;
    /** theme.ts accent 序号。 */
    color: number;
    x: number;
    y: number;
    /** 实际朝向（弧度）。 */
    angle: number;
    /** 期望转向指令：-1 左转 / 0 直行 / 1 右转。 */
    turn: -1 | 0 | 1;
    boosting: boolean;
    /** 当前长度（分数 = floor(length)）。 */
    length: number;
    kills: number;
    /** 长度峰值。 */
    peak: number;
    alive: boolean;
    /** 头部轨迹（含头）。 */
    points: Vec[];
    /** 下次可决策的 tick（AI 轮转调度用）。 */
    nextThink: number;
}
/** 一个光点（食物 / 战利品）。 */
export interface IoFood {
    x: number;
    y: number;
    r: number;
    value: number;
    color: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type IoEvent = {
    type: 'death';
    x: number;
    y: number;
    color: number;
    victimId: number;
    killerId: number;
    length: number;
};
/** 玩家死亡/吃鸡结算数据。 */
export interface IoStats {
    peak: number;
    kills: number;
    seconds: number;
    /** true = 吃鸡（活到最后）。 */
    win: boolean;
    /** 最终名次（1 = 第一）。 */
    rank: number;
}
/** 一局游戏的完整可测状态。 */
export interface IoState {
    tick: number;
    rng: () => number;
    nextId: number;
    /** snakes[0] 恒为玩家；死亡蛇保留在数组中（alive=false）。 */
    snakes: IoSnake[];
    foods: IoFood[];
    events: IoEvent[];
    over: boolean;
    stats: IoStats | null;
}
/** 玩家一 tick 的输入。 */
export interface IoInput {
    /** 转向指令：-1 左转 / 0 直行 / 1 右转。 */
    turn: -1 | 0 | 1;
    /** 是否按住加速（长度不足时引擎自行忽略）。 */
    boost: boolean;
}
/** 归一化角度到 [-PI, PI)。 */
export declare function normAngle(a: number): number;
/** 蛇身粗细（渲染半径 & 碰撞判定共用）。 */
export declare function thicknessOf(s: IoSnake): number;
/** 转向角速度（rad/s）：越粗越慢，加速时再乘 0.82。 */
export declare function turnRate(s: IoSnake): number;
/** 单 tick 允许的最大转向角（弧度）。 */
export declare function turnRatePerTick(s: IoSnake): number;
/** 当前速度（px/s）。 */
export declare function speedOf(s: IoSnake): number;
/**
 * 当前毒圈半径（px）：宽限期内恒为初始值，之后线性收缩到 ZONE_MIN_R。
 * @param tick - 当前 tick 数。
 * @returns 毒圈半径。
 */
export declare function zoneRadiusAt(tick: number): number;
/** 点是否在毒圈外。 */
export declare function outsideZone(tick: number, x: number, y: number): boolean;
/** 长度对应的轨迹点数。 */
export declare function needSegments(length: number): number;
/**
 * 构造一条蛇（轨迹为头后方的一条直线）。
 * @param opts - id/坐标/朝向等必填字段与可选覆盖。
 * @returns 新蛇（alive=true）。
 */
export declare function makeSnake(opts: {
    id: number;
    ai: boolean;
    name: string;
    color: number;
    x: number;
    y: number;
    angle: number;
    length?: number;
}): IoSnake;
/**
 * 重摆一条蛇（测试/摆位用）：改坐标朝向并重置为直线轨迹。
 * @param s - 目标蛇。
 * @param x - 新头 x。
 * @param y - 新头 y。
 * @param angle - 新朝向。
 * @param length - 可选新长度。
 */
export declare function placeSnake(s: IoSnake, x: number, y: number, angle: number, length?: number): void;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createSnakeio(seed: number, round?: number): IoState;
/**
 * 玩家当前名次（按长度，1 = 最长；含所有存活蛇）。
 * @param state - 目标状态。
 * @returns 名次；玩家死亡时返回 -1。
 */
export declare function playerRank(state: IoState): number;
/**
 * 推进恰好一个固定步长：AI 轮转决策 -> 全蛇移动/进食/圈外掉长 ->
 * 碰撞死亡 -> 光点补充 -> 结算（玩家死 / 吃鸡）。
 * 玩家死亡或吃鸡置 over 并填充 stats（之后本函数直接返回）。
 * @param state - 目标状态（原地推进）。
 * @param input - 玩家本 tick 输入。
 */
export declare function stepSnakeio(state: IoState, input: IoInput): void;
/**
 * 确定性重放校验快照：tick、各蛇头坐标/朝向/长度、光点数、结束态。
 * @param state - 目标状态。
 * @returns 可直接字符串比较的状态摘要。
 */
export declare function snakeioSnapshot(state: IoState): string;
