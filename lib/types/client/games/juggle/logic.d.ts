/**
 * 杂技抛球（Juggle）纯逻辑：底部双手拍球——点击画面任意位置，给附近
 * 的球施加向上 + 朝点击方向侧移的速度（冲量按点击点与球的距离线性
 * 衰减）；球受固定重力下落，坠出底部即丢一球（3 命）。每成功拍中一次
 * 按连击倍率得分（窗口内连拍倍率递增，封顶 8）。场上目标球数随存活
 * 时间每 10 秒 +1（最多 6），丢球后自动从顶部补齐到目标数。物理采用
 * 固定子步（≤8ms）重力积分，侧墙反弹、上行限速。所有随机走注入
 * seed（mulberry32(seed, round)），同 seed + 同输入序列重放一致。
 * 时间单位毫秒，物理单位 px / s。
 */
/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export declare const W = 480;
export declare const H = 640;
export declare const HUD_H = 30;
/** 球半径 px。 */
export declare const BALL_R = 12;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 1500;
/** 点击有效半径 px：超出该距离的球不受冲量。 */
export declare const TAP_RADIUS = 100;
/** 基础向上拍击速度 px/s（按衰减系数缩放）。 */
export declare const TAP_VY = -760;
/** 拍击侧移速度上限 px/s（朝点击方向的分量上限，按衰减系数缩放）。 */
export declare const TAP_VX_MAX = 320;
/** 球上行速度下限（防无限加速）。 */
export declare const MIN_VY = -980;
/** 球横向速度绝对值上限。 */
export declare const MAX_ABS_VX = 420;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 场上球数上限。 */
export declare const MAX_BALLS = 6;
/** 每存活多少 ms 场上目标球数 +1。 */
export declare const ADD_BALL_MS = 10000;
/** 连击窗口 ms：窗口内再拍中则连击 +1。 */
export declare const COMBO_WINDOW_MS = 1600;
/** 连击倍率上限（也是单次拍击得分上限）。 */
export declare const COMBO_CAP = 8;
/** 固定物理子步 ms 上限。 */
export declare const SUBSTEP_MS = 8;
/** 每球运动拖尾保留的点数。 */
export declare const TRAIL_LEN = 10;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 800;
/** 补球出生 y。 */
export declare const SPAWN_Y = 40;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 一个被抛起的彩球；trail 为最近若干帧位置（新点在数组末尾）。 */
export interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 配色索引（稳定取共享主题色阶）。 */
    hue: number;
    trail: {
        x: number;
        y: number;
    }[];
}
/** 上浮渐隐的飘字（得分提示）。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type JuggleEvent = {
    type: 'tap';
    x: number;
    y: number;
    strength: number;
} | {
    type: 'hit';
    x: number;
    y: number;
    hue: number;
} | {
    type: 'drop';
    x: number;
    hue: number;
} | {
    type: 'spawn';
    x: number;
    hue: number;
};
/** 一帧输入：本帧点击点（逻辑坐标），null 表示无点击。 */
export interface JuggleInput {
    tap: {
        x: number;
        y: number;
    } | null;
}
/** 一局游戏的完整可测状态。 */
export interface JuggleState {
    /** 回合内已流逝 ms。 */
    t: number;
    score: number;
    lives: number;
    dropped: number;
    combo: number;
    /** 连击失效时刻 ms（回合钟）。 */
    comboExpire: number;
    balls: Ball[];
    events: JuggleEvent[];
    floats: FloatText[];
    rng: () => number;
    /** 已使用的配色索引计数（保证新球颜色稳定递进）。 */
    hueCount: number;
    over: boolean;
}
/** 一次拍击对一球的冲量结算。 */
export interface TapImpulse {
    /** 衰减系数：点击点到球心距离 / TAP_RADIUS 的线性剩余，0 表示无效。 */
    factor: number;
    /** 横向速度增量 px/s（朝点击方向，带符号）。 */
    dvx: number;
    /** 纵向速度增量 px/s（负值向上）。 */
    dvy: number;
}
/**
 * 计算一次点击对一球的拍击冲量：factor = 1 - dist/TAP_RADIUS（截 0），
 * dvy = TAP_VY * factor（向上），dvx 朝点击方向、上限 TAP_VX_MAX * factor。
 * 纯函数，不做任何边界反射或限速。
 * @param ball - 被拍击的球。
 * @param x - 点击点逻辑 x。
 * @param y - 点击点逻辑 y。
 * @returns 冲量结算（factor=0 表示距离过远无效）。
 */
export declare function tapImpulse(ball: Ball, x: number, y: number): TapImpulse;
/**
 * 当前场上目标球数：1 + floor(t / ADD_BALL_MS)，封顶 MAX_BALLS。
 * @param tMs - 回合内毫秒钟。
 * @returns 目标球数。
 */
export declare function ballTargetOf(tMs: number): number;
/**
 * 球是否已坠出底部（丢球判定）。
 * @param ball - 待判定的球。
 * @returns 球整体越过画布底边时为 true。
 */
export declare function isDropped(ball: Ball): boolean;
/**
 * 一次拍中的得分：当前连击倍率即单次得分。
 * @param combo - 拍中后的连击数。
 * @returns 本次得分。
 */
export declare function gainOf(combo: number): number;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态（含 1 个起始球）。
 */
export declare function createJuggle(seed: number, round?: number): JuggleState;
/**
 * 推进一帧：先结算本帧点击（对所有球施加冲量、计连击得分），再按
 * 固定子步积分重力与位移（侧墙反弹、上下行限速），坠出底部的球扣命
 * 并发 drop 事件，随后把场上球数补到目标数（每帧最多补 1 个）。事件
 * 写入 state.events，调用方每帧消费后在下一帧开头被清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入（点击点或 null）。
 */
export declare function stepJuggle(state: JuggleState, dtMs: number, input: JuggleInput): void;
