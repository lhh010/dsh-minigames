/**
 * 磁极迷宫（Magnet）纯逻辑：钢球携带与活动磁铁相同的极性，同时受
 * 场上所有磁铁的磁力（平方反比，同性相斥异性相吸）与摩擦力作用；
 * 空格翻转活动磁铁极性会同步翻转钢球极性，因此所有固定磁铁的
 * 吸引 / 排斥关系全局反转——全场唯一操作，效果取决于布局。把钢球
 * 引进终点槽过关，碰到尖刺损失一命重来。5 个手工关卡磁铁数 2→5
 * 递进，固定子步确定性物理（合力积分、速度上限、边界反弹）。全部
 * 函数确定性可测，时间单位毫秒，物理单位 px / s。
 */
/** 逻辑画布尺寸。 */
export declare const W = 480;
export declare const H = 600;
/** 钢球半径 px。 */
export declare const BALL_R = 7;
/** 磁力计算的最小距离平方 px^2（近场限幅，避免奇点爆炸）。 */
export declare const MIN_D2 = 1600;
/** 速度上限 px/s。 */
export declare const MAX_SPEED = 440;
/** 指数摩擦系数（每秒速度衰减率）。 */
export declare const FRICTION = 0.3;
/** 边界反弹恢复系数。 */
export declare const WALL_BOUNCE = 0.55;
/** 每帧固定物理子步数（确定性积分）。 */
export declare const SUBSTEPS = 4;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 尖刺失败展示 ms。 */
export declare const DEAD_MS = 1200;
/** 过关展示 ms。 */
export declare const WON_MS = 1500;
/** 磁铁视觉半径 px。 */
export declare const MAGNET_R = 13;
/** 手工关卡总数。 */
export declare const LEVEL_COUNT = 5;
/** 磁极：N（红）/ S（蓝）。 */
export type Polarity = 'N' | 'S';
/** 一块磁铁：位置、强度与极性。 */
export interface MagnetDef {
    x: number;
    y: number;
    /** 磁力强度（加速度比例系数，px^3/s^2）。 */
    strength: number;
    polarity: Polarity;
}
/** 一枚尖刺：圆形判定区。 */
export interface SpikeDef {
    x: number;
    y: number;
    r: number;
}
/** 终点槽：圆形捕获区。 */
export interface GoalDef {
    x: number;
    y: number;
    r: number;
}
/** 一关的手工布局：活动磁铁 + 固定磁铁 + 尖刺 + 终点 + 出生点。 */
export interface MagnetLevel {
    /** 活动磁铁（玩家可翻转其极性；渲染层高亮）。 */
    player: MagnetDef;
    fixed: MagnetDef[];
    spikes: SpikeDef[];
    goal: GoalDef;
    start: {
        x: number;
        y: number;
    };
}
/**
 * 5 个手工关卡：磁铁总数 2→5（活动 1 + 固定 1..4）递进。固定磁铁
 * 沿通关路线交替极性排布——靠近当前吸引自己的磁铁时翻转极性即可
 * 把自己弹射向下一段；活动磁铁恒为斥力支点，位置塑造弹道。每关
 * 均可由「贴近吸引磁铁即翻转」策略在有限时间内解出。
 */
export declare const MAGNET_LEVELS: MagnetLevel[];
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 取第 level 关的布局定义。
 * @param level - 关卡号（从 1 起）。
 * @returns 关卡布局。
 */
export declare function levelAt(level: number): MagnetLevel;
/**
 * 计算某点处钢球受到的磁场合力（平方反比 + 同性相斥异性相吸）。
 * 活动磁铁的极性取当前 polarity 参数（钢球与活动磁铁同极，故其对
 * 钢球恒为斥力，位置构成固定斥力支点）。
 * @param level - 关卡布局。
 * @param x - 钢球横坐标。
 * @param y - 钢球纵坐标。
 * @param polarity - 钢球（= 活动磁铁）当前极性。
 * @returns 合力加速度向量 px/s^2。
 */
export declare function forceAt(level: MagnetLevel, x: number, y: number, polarity: Polarity): {
    fx: number;
    fy: number;
};
/** 阶段：飞行 / 撞刺展示 / 过关展示 / 全关通关 / 命尽结束。 */
export type MagnetPhase = 'flying' | 'dead' | 'won' | 'cleared' | 'gameover';
/** 单步内产生、供渲染层消费的可视事件。 */
export type MagnetEvent = {
    type: 'flip';
    x: number;
    y: number;
} | {
    type: 'dead';
    x: number;
    y: number;
} | {
    type: 'won';
    x: number;
    y: number;
    points: number;
} | {
    type: 'cleared';
    points: number;
};
/** 一局游戏的完整可测状态。 */
export interface MagnetState {
    /** 回合内已流逝 ms（渲染动画用）。 */
    t: number;
    seed: number;
    /** 关卡号（从 1 起）。 */
    level: number;
    score: number;
    lives: number;
    /** 钢球位置 / 速度。 */
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 钢球（= 活动磁铁）当前极性。 */
    polarity: Polarity;
    phase: MagnetPhase;
    /** 阶段停留剩余 ms。 */
    phaseMs: number;
    /** 过关结算展示分（HUD 用）。 */
    lastPoints: number;
    /** 翻转动画剩余 ms（>0 时活动磁铁高亮脉冲）。 */
    flipFlash: number;
    events: MagnetEvent[];
}
/**
 * 新开一局（level 1，极性 N，命回满）。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export declare function createMagnet(seed: number): MagnetState;
/**
 * 翻转活动磁铁（与钢球）极性；仅飞行阶段有效。
 * @param state - 目标状态。
 */
export declare function flipPolarity(state: MagnetState): void;
/**
 * 推进一帧：固定 SUBSTEPS 子步积分（磁力合力 → 摩擦 → 速度上限 →
 * 位移 → 边界反弹），尖刺 / 终点判定，阶段停留与过关 / 重生切换。
 * 事件写入 state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepMagnet(state: MagnetState, dtMs: number): void;
