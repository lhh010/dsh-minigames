/** 固定模拟步长（秒，约 30 tick/s）。 */
export declare const TICK: number;
/** 圆形世界半径。 */
export declare const WORLD_R = 1400;
/** 世界圆心坐标（放在 3000x3000 的逻辑框中心）。 */
export declare const CX = 1500;
export declare const CY = 1500;
/** 常规 / 加速速度（px/s）。 */
export declare const BASE_SPEED = 165;
export declare const BOOST_SPEED = 300;
/** 出生长度（也是最小段数基准）。 */
export declare const START_LENGTH = 14;
/** 低于该长度不允许加速。 */
export declare const MIN_BOOST_LENGTH = 16;
/** 加速每 tick 消耗的长度。 */
export declare const BOOST_COST_PER_TICK = 0.4;
/** 加速每几 tick 在尾部吐一个光点。 */
export declare const BOOST_DROP_EVERY = 3;
/** 每点光点价值的成长长度。 */
export declare const GROWTH_PER_VALUE = 0.6;
/** 场上常规光点保有量 / 硬上限（战利品可超保有量但不过上限）。 */
export declare const FOOD_TARGET = 320;
export declare const FOOD_CAP = 900;
/** AI 蛇数量（含等待复活者，保持在 6-10 区间）。 */
export declare const AI_COUNT = 8;
/** AI 死亡后复活等待 tick 数。 */
export declare const AI_RESPAWN_TICKS = 90;
/** 单条 AI 两次决策的最小间隔 tick 数。 */
export declare const AI_INTERVAL = 8;
/** 每 tick 最多决策的 AI 条数（分帧预算）。 */
export declare const AI_DECISIONS_PER_TICK = 2;
/** 蛇身点数上下限。 */
export declare const MIN_SEG = 10;
export declare const MAX_SEG = 420;
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
/** AI 三档性格：吃点 / 围猎 / 谨慎。 */
export type Personality = 'grazer' | 'hunter' | 'guardian';
/** 一条蛇（玩家或 AI）；points[0] 恒为蛇头，(x,y) 与其同步。 */
export interface SlitherSnake {
    id: number;
    /** 是否 AI（false = 玩家，恒为 snakes[0]）。 */
    ai: boolean;
    name: string;
    /** theme.ts accent 序号。 */
    color: number;
    personality: Personality;
    x: number;
    y: number;
    /** 实际朝向（弧度）。 */
    angle: number;
    /** 期望朝向；每 tick 只能以转向角速度上限逼近。 */
    targetAngle: number;
    boosting: boolean;
    /** 当前长度（分数 = floor(length)）。 */
    length: number;
    kills: number;
    /** 长度峰值。 */
    peak: number;
    alive: boolean;
    /** 头部轨迹（含头）。 */
    points: Vec[];
    /** 下次可决策的 tick（AI 分帧调度用）。 */
    nextThink: number;
}
/** 一个光点（食物 / 战利品）。 */
export interface SlitherFood {
    x: number;
    y: number;
    r: number;
    value: number;
    color: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type SlitherEvent = {
    type: 'death';
    x: number;
    y: number;
    color: number;
    victimId: number;
    killerId: number;
    length: number;
};
/** 玩家死亡结算数据。 */
export interface SlitherStats {
    peak: number;
    kills: number;
    seconds: number;
}
/** 一局游戏的完整可测状态。 */
export interface SlitherState {
    tick: number;
    rng: () => number;
    nextId: number;
    /** snakes[0] 恒为玩家；死亡 AI 保留在数组中（alive=false）。 */
    snakes: SlitherSnake[];
    foods: SlitherFood[];
    /** 待复活 AI 的到期 tick。 */
    respawns: number[];
    events: SlitherEvent[];
    over: boolean;
    stats: SlitherStats | null;
    /** AI 分帧轮转游标。 */
    aiCursor: number;
}
/** 玩家一 tick 的输入。 */
export interface SlitherInput {
    /** 期望朝向（弧度，世界坐标）。 */
    angle: number;
    /** 是否按住加速（长度不足时引擎自行忽略）。 */
    boost: boolean;
}
/** 归一化角度到 [-PI, PI)。 */
export declare function normAngle(a: number): number;
/** 蛇身粗细（渲染半径 & 碰撞判定共用）。 */
export declare function thicknessOf(s: SlitherSnake): number;
/** 转向角速度（rad/s）：越粗越慢，加速时再乘 0.8。 */
export declare function turnRate(s: SlitherSnake): number;
/** 单 tick 允许的最大转向角（弧度）。 */
export declare function turnRatePerTick(s: SlitherSnake): number;
/** 当前速度（px/s）。 */
export declare function speedOf(s: SlitherSnake): number;
/** 自撞豁免弧长：约两个当前转向直径再加余量。 */
export declare function selfClearPx(s: SlitherSnake): number;
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
    personality: Personality;
    x: number;
    y: number;
    angle: number;
    length?: number;
}): SlitherSnake;
/**
 * 重摆一条蛇（测试/摆位用）：改坐标朝向并重置为直线轨迹。
 * @param s - 目标蛇。
 * @param x - 新头 x。
 * @param y - 新头 y。
 * @param angle - 新朝向。
 * @param length - 可选新长度。
 */
export declare function placeSnake(s: SlitherSnake, x: number, y: number, angle: number, length?: number): void;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createSlither(seed: number, round?: number): SlitherState;
/** ---------------- 段碰撞空间哈希 ---------------- */
/** 蛇身段空间哈希网格；cells 按 (cx + cy*cols) 存 (蛇下标+1)*1024+段号。 */
export interface SegmentGrid {
    cells: number[][];
    cols: number;
}
/** 用所有存活蛇的当前轨迹段重建网格（每 tick 至多重建两次：AI 感知 + 碰撞）。 */
export declare function buildSegmentGrid(state: SlitherState): SegmentGrid;
/**
 * 查询 (x,y) 半径 r 内的段，逐段回调。
 * @param grid - buildSegmentGrid 的结果。
 * @param x - 查询中心 x。
 * @param y - 查询中心 y。
 * @param r - 查询半径（会扩展到覆盖单元格）。
 * @param cb - 命中回调（蛇下标 + 段号）；返回 true 提前终止。
 */
export declare function querySegmentGrid(grid: SegmentGrid, x: number, y: number, r: number, cb: (snakeIdx: number, segIdx: number) => boolean): void;
/**
 * 推进恰好一个固定步长：AI 分帧决策 -> 全蛇移动/进食 -> 碰撞死亡 ->
 * 光点补充 -> AI 复活。玩家死亡置 over 并填充 stats（之后本函数直接返回）。
 * @param state - 目标状态（原地推进）。
 * @param input - 玩家本 tick 输入。
 */
export declare function stepSlither(state: SlitherState, input: SlitherInput): void;
/**
 * 玩家当前名次（按长度，1 = 最长；含所有存活蛇）。
 * @param state - 目标状态。
 * @returns 名次；玩家死亡时返回 -1。
 */
export declare function playerRank(state: SlitherState): number;
/**
 * 确定性重放校验快照：tick、各蛇头坐标/朝向/长度、光点数。
 * @param state - 目标状态。
 * @returns 可直接字符串比较的状态摘要。
 */
export declare function slitherSnapshot(state: SlitherState): string;
