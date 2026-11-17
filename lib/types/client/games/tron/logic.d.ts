/**
 * 光轮对决（Tron Light Cycles）纯逻辑引擎：格子制竞技场、双方恒速移动、
 * 身后光墙永久成墙、碰撞判定、floodfill 可达空间评估与三层确定性 AI。
 * 渲染无关、无 DOM；所有随机来自注入的 mulberry32 种子，可确定性重放。
 */
/** 方向。 */
export type Dir = 'up' | 'down' | 'left' | 'right';
/** 一方：玩家或 AI。 */
export type Side = 'player' | 'ai';
/** 方向到格位移的映射。 */
export declare const DIR_DELTA: Record<Dir, {
    dx: number;
    dy: number;
}>;
/** 竞技场列数。 */
export declare const COLS = 40;
/** 竞技场行数。 */
export declare const ROWS = 26;
/** 基础步进间隔（毫秒）。 */
export declare const STEP_MS_BASE = 110;
/** 后期最小步进间隔（速度上限）。 */
export declare const STEP_MS_MIN = 80;
/** 速度爬坡时长（格数）：间隔由 BASE 线性降到 MIN。 */
export declare const SPEED_RAMP_TICKS = 240;
/** 三局两胜所需胜场。 */
export declare const WINS_NEEDED = 2;
/** 开局抢占中央的阶段格数（第三层：先手压制）。 */
export declare const OPENING_TICKS = 18;
/** 进入封锁倾向的自由格占比阈值（第二层）。 */
export declare const LATE_FREE_RATIO = 0.4;
/** 一方的当前状态。 */
export interface Rider {
    /** 头部所在列（0 起）。 */
    x: number;
    /** 头部所在行（0 起）。 */
    y: number;
    /** 当前朝向。 */
    dir: Dir;
    /** 上一格位置（渲染插值用）。 */
    px: number;
    /** 上一格行（渲染插值用）。 */
    py: number;
}
/** 一次转向输入记录（重放用）。 */
export interface TurnInput {
    /** 第几局（1 起）。 */
    round: number;
    /** 该局第几格（0 起）。 */
    tick: number;
    /** 哪一方转向。 */
    side: Side;
    /** 目标方向。 */
    dir: Dir;
}
/** 引擎状态：一局进行中 + 整场比赛的局分与重放日志。 */
export interface TronState {
    /** 当前局数（1 起）。 */
    round: number;
    /** 当前局已步进格数。 */
    tick: number;
    /** 双方骑手。 */
    riders: Record<Side, Rider>;
    /** 墙面图：0 空、1 玩家光墙、2 AI 光墙（含双方当前头部格）。 */
    walls: Uint8Array;
    /** 双方轨迹按时间序（渲染渐隐用）。 */
    trails: Record<Side, Array<{
        x: number;
        y: number;
    }>>;
    /** 待生效转向（本回合玩家输入）。 */
    pending: Record<Side, Dir | undefined>;
    /** 局分。 */
    wins: Record<Side, number>;
    /** 本局是否已结束。 */
    roundOver: boolean;
    /** 本局胜者；'draw' 表示同格相撞平局。 */
    winner: Side | 'draw' | undefined;
    /** 撞击点（爆炸粒子用），每局结束时有 1-2 个。 */
    crashCells: Array<{
        x: number;
        y: number;
    }>;
    /** 最近一次速度档位变化的 tick（渲染提速提示用）。 */
    lastSpeedTierChange: number;
    /** 步进累加器（毫秒）。 */
    stepAccumMs: number;
    /** 注入的确定性随机源。 */
    rng: () => number;
    /** 玩家转向日志（重放用，跨局累积）。 */
    inputLog: TurnInput[];
}
/** mulberry32：种子化的确定性 [0,1) 随机源。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 某格是否在竞技场内且非墙。
 * @param x - 列。
 * @param y - 行。
 * @param walls - 墙面图。
 */
export declare function isFree(x: number, y: number, walls: Uint8Array): boolean;
/** floodfill：从某空格出发可达的空格总数（不可穿过墙）。
 * @param x - 起始列（须为空格，否则返回 0）。
 * @param y - 起始行。
 * @param walls - 墙面图。
 * @returns 可达空格数（含起点）。
 */
export declare function floodFill(x: number, y: number, walls: Uint8Array): number;
/** 当前步进间隔：随 tick 线性加快（110ms → 80ms）。
 * @param state - 引擎状态。
 */
export declare function stepIntervalMs(state: TronState): number;
/** 创建一场新比赛（第 1 局开始）。
 * @param seed - 随机种子（AI 噪声用）。
 * @returns 初始引擎状态。
 */
export declare function createTronState(seed: number): TronState;
/** 是否与 rider 当前朝向相反（180° 掉头）。
 * @param dir - 待验证方向。
 * @param facing - 当前朝向。
 */
export declare function isReverse(dir: Dir, facing: Dir): boolean;
/** 玩家转向输入：非法（掉头/同向）时忽略，否则缓存到本回合末生效并记入日志。
 * @param state - 引擎状态。
 * @param dir - 目标方向。
 */
export declare function playerTurn(state: TronState, dir: Dir): void;
/**
 * 三层 AI 决策（确定性，同 seed 同局面同选择）：
 * ①安全贪心——floodfill 评估每个非掉头方向的可达空间取最大；
 * ②封锁倾向——自由格占比低时同时压低玩家的可达区域；
 * ③先手压制——开局阶段偏向靠近场地中央。
 * @param state - 引擎状态。
 * @returns 本回合 AI 朝向。
 */
export declare function aiDecide(state: TronState): Dir;
/** 前进一格：双方同时结算；任一方出界/撞墙判负，同格相撞判平。
 * @param state - 引擎状态。
 */
export declare function stepOnce(state: TronState): void;
/** 按耗时驱动步进：累加 dt，到点自动 stepOnce（可能一帧多步）。
 * @param state - 引擎状态。
 * @param dtMs - 距上一帧毫秒数。
 * @returns 本帧实际步进的格数。
 */
export declare function advance(state: TronState, dtMs: number): number;
/** 整场比赛是否已分胜负（有人拿到 WINS_NEEDED 胜场）。
 * @param state - 引擎状态。
 */
export declare function matchOver(state: TronState): boolean;
/** 开启下一局（保留局分与随机源）。
 * @param state - 引擎状态。
 */
export declare function startNextRound(state: TronState): void;
/** 墙面指纹：确定性对比两个局面是否一致（重放校验用）。
 * @param state - 引擎状态。
 * @returns 每格墙面值的十六进制串。
 */
export declare function wallsSignature(state: TronState): string;
/** 从种子重放一场对局：按日志在对应 (round, tick) 注入玩家转向，AI 自动决策。
 * @param seed - 与原始对局相同的种子。
 * @param log - 玩家转向日志。
 * @param maxTicks - 每局安全上限（防死循环；双方永不相撞时截断）。
 * @returns 重放后的终局状态。
 */
export declare function replay(seed: number, log: TurnInput[], maxTicks?: number): TronState;
