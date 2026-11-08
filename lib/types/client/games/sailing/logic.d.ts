/**
 * 帆船远航（Sailing）纯逻辑：俯视海面，风矢量恒定方向与强度（随关卡
 * 变化，叠加由 seed 决定相位的确定性阵风扰动），玩家掌舵（转向）与调
 * 帆角（相对船身）。帆动力 = 风矢量在帆法向的投影再取船头方向分量：
 * 迎风死角区无动力、侧风约为一半、顺风满帆最快——真实帆船"抢风 /
 * 顺风"语义的简化。水阻力按一阶衰减趋近终端速度。按固定 8ms 子步推
 * 进（帧间隔累计器切分），全部函数确定性可测；时间单位毫秒，物理
 * 单位 px、px/s、px/s²。
 */
/** 逻辑画布尺寸。 */
export declare const W = 640;
export declare const H = 480;
/** 固定物理子步 ms（stepSailing 内部按它切分帧间隔）。 */
export declare const FIXED_MS = 8;
/** 掌舵角速度 rad/s。 */
export declare const RUDDER_SPEED = 1.9;
/** 帆角调整速度 rad/s。 */
export declare const SAIL_SPEED = 1.4;
/** 帆角上限（相对船身，两侧对称）。 */
export declare const SAIL_MAX = 1.309;
/** 迎风死角区半角 rad：风从船头 ±40° 内来时帆抖动无动力。 */
export declare const DEAD_ZONE: number;
/** 水阻力时间常数 s：v' = 动力 - v / DRAG_TAU。 */
export declare const DRAG_TAU = 1.6;
/** 转向时的速度损失系数（每秒 35% 衰减按转向占比折算）。 */
export declare const TURN_BLEED = 0.35;
/** 浮标通过判定半径 px。 */
export declare const BUOY_R = 26;
/** 漏标判定余量 px：沿赛段方向越过下一浮标超过该距离仍未过圈判负。 */
export declare const MISS_MARGIN = 34;
/** 每关时限 s：90 - (关卡-1) * 5，下限 50。 */
export declare const TIME_BASE = 90;
export declare const TIME_MIN = 50;
/** 过关展示 ms（之后进入下一关）。 */
export declare const FINISH_MS = 1800;
/** 航迹拖尾最大采样点数。 */
export declare const TRAIL_MAX = 48;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 角度归一到 [-π, π]。 */
export declare function normAngle(a: number): number;
/**
 * 确定性阵风系数：两个由 seed 决定相位的正弦叠加，恒在 [0.8, 1.2]。
 * @param seed - 外部种子。
 * @param tMs - 关卡内已流逝 ms。
 * @returns 当前有效风力 = 基础风力 × 系数。
 */
export declare function gustFactor(seed: number, tMs: number): number;
/** 一关的风：travel 为风吹向的方向角，speed px/s²（同时是加速度上限）。 */
export interface Wind {
    travel: number;
    speed: number;
}
/**
 * 某一关的风（seed+level 确定性）：方向随机、强度随关卡增大封顶 160。
 * @param seed - 外部种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 本关风参数。
 */
export declare function windOf(seed: number, level: number): Wind;
/**
 * 帆动力（沿船头方向的加速度 px/s²）：风矢量在帆法向的投影，再取
 * 船头方向分量 = -风力 × sin(帆角) × sin(相对风行角 - 帆角)。
 * 迎风死角区（风从船头 ±DEAD_ZONE 内来）帆抖动，返回 0；帆角在
 * 顶风侧为负推力（倒拖）。
 * @param relWind - 风行方向相对船头的角（0 = 风吹向船头即顺风，π = 顶风）。
 * @param sail - 帆角相对船身 rad（正 = 右舷侧）。
 * @param windSpeed - 当前有效风力 px/s²。
 * @returns 沿船头方向的加速度，可正可负。
 */
export declare function sailPower(relWind: number, sail: number, windSpeed: number): number;
/** 一个浮标：圆心与通过判定半径。 */
export interface Buoy {
    x: number;
    y: number;
}
/**
 * 生成某一关的浮标航线（seed+level 确定性）：3~5 个浮标，每个距前一
 * 目标 240~340px，全部收缩在安全边距内。
 * @param seed - 外部种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 浮标坐标数组（按通过顺序）。
 */
export declare function generateCourse(seed: number, level: number): Buoy[];
/** 某关时限 ms。 */
export declare function timeLimitOf(level: number): number;
/** 帧输入：左 / 右舵与帆角增 / 减。 */
export interface SailingInput {
    left: boolean;
    right: boolean;
    /** 帆角增大（向外张）。 */
    sailOut: boolean;
    /** 帆角减小（向内收）。 */
    sailIn: boolean;
}
/** 阶段：航行 / 过关展示 / 结束。 */
export type SailingPhase = 'racing' | 'finished' | 'gameover';
/** 失败原因（gameover 阶段）。 */
export type FailReason = 'miss' | 'timeout';
/** 单步内产生、供渲染层消费的可视事件。 */
export type SailingEvent = {
    type: 'buoy';
    x: number;
    y: number;
    index: number;
} | {
    type: 'finish';
    x: number;
    y: number;
    points: number;
} | {
    type: 'fail';
    x: number;
    y: number;
    reason: FailReason;
};
/** 上浮渐隐的飘字。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 1200;
/** 一局游戏的完整可测状态。 */
export interface SailingState {
    /** 关卡内已流逝 ms（计时与阵风相位用）。 */
    t: number;
    seed: number;
    level: number;
    score: number;
    /** 船位置 / 航向（0 = 正右，-π/2 = 向上）/ 标量速度。 */
    x: number;
    y: number;
    heading: number;
    v: number;
    /** 帆角相对船身 rad。 */
    sail: number;
    wind: Wind;
    buoys: Buoy[];
    /** 下一个待通过的浮标下标（= buoys.length 表示全部通过）。 */
    next: number;
    /** 帧间隔累计器（切固定子步）。 */
    acc: number;
    phase: SailingPhase;
    /** 阶段停留剩余 ms（finished 展示用）。 */
    phaseMs: number;
    /** 过关展示分（HUD 用）。 */
    lastPoints: number;
    /** 失败原因（gameover 用）。 */
    reason: FailReason | null;
    events: SailingEvent[];
    floats: FloatText[];
    /** 航迹拖尾采样点（越靠后越新）。 */
    trail: {
        x: number;
        y: number;
    }[];
}
/**
 * 新开一局（level 1）。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export declare function createSailing(seed: number): SailingState;
/**
 * 当前剩余时间 ms（HUD 用）。
 * @param state - 当前状态。
 * @returns 剩余毫秒，最低 0。
 */
export declare function timeLeft(state: SailingState): number;
/**
 * 推进一帧：把 dtMs 计入累计器并按固定 FIXED_MS 子步确定性推进（累计
 * 器上限 200ms 防螺旋）。结束 / 展示阶段推进停留计时与飘字。事件写入
 * state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export declare function stepSailing(state: SailingState, dtMs: number, input: SailingInput): void;
