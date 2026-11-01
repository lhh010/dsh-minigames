/**
 * 蹦蹦跳（Jumper）纯逻辑：小家伙恒定弹跳——落到平台上 vy 重置为固定
 * 起跳速度；←→/AD 控制横向（带轻微惯性）。平台由 seed+段号确定性生成，
 * 分普通 / 移动 / 易碎 / 尖刺四种，越往上稀有平台越多；摄像机只跟随
 * 向上，向下掉出屏幕即结束（1 命）；高度即分数。全部函数确定性可测，
 * 时间单位毫秒，物理单位 px / s；世界坐标 y 向下增大，越高越小。
 */
/** 逻辑画布尺寸。 */
export declare const W = 420;
export declare const H = 640;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 1500;
/** 触板起跳速度 px/s（向上）。 */
/** 起跳速度：最大跳高 = BOUNCE_VY²/2g ≈ 163px > 2×GAP（128px），保证
 * 可以跳过一格危险平台（尖刺/碎裂）而不是被单链平台逼死。 */
export declare const BOUNCE_VY = 700;
/** 横向加速度 px/s^2。 */
export declare const LATERAL_ACC = 1600;
/** 横向速度上限 px/s。 */
export declare const MAX_VX = 280;
/** 无输入时的横向阻尼（每秒衰减比例系数）。 */
export declare const LATERAL_DAMP = 8;
/** 小家伙半宽 / 半高 px。 */
export declare const PLAYER_HALF = 12;
/** 相邻平台竖直间距 px。 */
export declare const GAP = 64;
/** 第 0 段平台（出生平台）的世界 y。 */
export declare const BASE_Y: number;
/** 稀有平台占比随高度线性增长的高度尺度 px（越高越稀有）。 */
export declare const RARITY_SCALE = 3600;
/** 单次弹跳的挤压动画时长 ms。 */
export declare const SQUASH_MS = 140;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 平台种类：普通 / 横移 / 易碎（踩一次碎裂）/ 尖刺（碰到即结束）。 */
export type PlatformKind = 'normal' | 'moving' | 'crumbly' | 'spiky';
/** 一段平台（seed+段号确定性生成，碎裂状态由对局状态单独记录）。 */
export interface Platform {
    /** 段号（0 = 出生平台）。 */
    index: number;
    /** 世界 y（平台顶面）。 */
    y: number;
    /** 宽度 px。 */
    w: number;
    kind: PlatformKind;
    /** 左边缘世界 x（moving 平台为相位基准，见 {@link platformX}）。 */
    x: number;
    /** moving 平台横移角速度 rad/s（其余为 0）。 */
    speed: number;
    /** moving 平台横移初相位 rad（其余为 0）。 */
    phase: number;
}
export declare function platformAt(seed: number, index: number): Platform;
/**
 * 平台在时刻 tMs 的左边缘 x（moving 平台在其活动区间内正弦横移）。
 * @param platform - 平台数据。
 * @param tMs - 对局内毫秒钟。
 * @returns 左边缘世界 x。
 */
export declare function platformX(platform: Platform, tMs: number): number;
/**
 * 覆盖世界 y 区间 [yTop, yBottom] 的平台段号范围（含端点）。
 * @param yTop - 较小（较高）的 y。
 * @param yBottom - 较大（较低）的 y。
 * @returns [最小段号, 最大段号]。
 */
export declare function indexRangeFor(yTop: number, yBottom: number): [number, number];
/** 帧输入：左 / 右横移（可同时为 false 表示松手滑行）。 */
export interface JumperInput {
    left: boolean;
    right: boolean;
}
/** 阶段：弹跳中 / 已结束（掉落或触刺）。 */
export type JumperPhase = 'playing' | 'dead';
/** 单步内产生、供渲染层消费的可视事件。 */
export type JumperEvent = {
    type: 'bounce';
    x: number;
    y: number;
    kind: PlatformKind;
} | {
    type: 'break';
    x: number;
    y: number;
} | {
    type: 'spike';
    x: number;
    y: number;
} | {
    type: 'fall';
    x: number;
    y: number;
};
/** 一局游戏的完整可测状态。 */
export interface JumperState {
    /** 回合内已流逝 ms（移动板相位 / 动画用）。 */
    t: number;
    seed: number;
    /** 世界坐标：x / y，速度 vx / vy（向上为负）。 */
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 屏幕顶部的世界 y（只减不增 = 只向上卷动）。 */
    cameraY: number;
    phase: JumperPhase;
    /** 已碎裂的易碎板段号集合。 */
    broken: Set<number>;
    /** 最近一次触板的 t（挤压动画用）。 */
    lastBounceT: number;
    events: JumperEvent[];
}
/**
 * 新开一局：小家伙站上出生平台并立即起跳。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export declare function createJumper(seed: number): JumperState;
/**
 * 当前高度分（1 分 ≈ 10px 攀升，出生高度为 0）。
 * @param state - 当前状态。
 * @returns 高度分。
 */
export declare function heightScore(state: JumperState): number;
/**
 * 推进一帧：横向惯性、重力、平台碰撞（单向：仅下落时踩板；尖刺板
 * 任意方向接触即结束）、摄像机上移与掉落判定。事件写入 state.events，
 * 每帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export declare function stepJumper(state: JumperState, dtMs: number, input: JumperInput): void;
