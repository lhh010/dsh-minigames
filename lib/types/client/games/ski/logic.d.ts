/**
 * 高山滑雪（Ski）纯逻辑：SkiFree 风格的俯视竖版卷轴。滑雪者固定在屏幕
 * 下部，雪道持续向下卷动（距离随速度增长）；地形按 seed+段号确定性生成，
 * 每段包含成对旗门与若干树木/岩石障碍。穿过旗门 +50，撞障碍 -1 命（共
 * 3 命）并获得短暂无敌；速度随距离每 DIST_PER_GEAR 升一档，越来越快。
 * 横向控制：按住 ←→/AD 施加横向加速度，或跟随指针目标 x。时间单位毫秒，
 * 物理单位 px / s，同 seed 同输入逐步模拟完全确定。
 */
/** 逻辑画布尺寸（竖版卷轴）。 */
export declare const W = 480;
export declare const H = 640;
/** 滑雪者在屏幕上的固定 y。 */
export declare const PLAYER_Y = 470;
/** 滑雪者碰撞半径。 */
export declare const PLAYER_R = 10;
/** 每段地形的世界高度 px（段号 i 覆盖世界 y ∈ [i*SEG_H, (i+1)*SEG_H)）。 */
export declare const SEG_H = 300;
/** 基础下滑速度 px/s。 */
export declare const BASE_SPEED = 175;
/** 每升一档增加的速度 px/s。 */
export declare const GEAR_STEP = 26;
/** 速度上限 px/s。 */
export declare const MAX_SPEED = 430;
/** 每滑多远升一档 px。 */
export declare const DIST_PER_GEAR = 2200;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 穿过旗门得分。 */
export declare const GATE_SCORE = 50;
/** 旗门缺口半宽 px（两杆间距的一半）。 */
export declare const GAP_HALF = 52;
/** 横向转向加速度 px/s^2。 */
export declare const STEER_AX = 1500;
/** 横向速度上限 px/s。 */
export declare const MAX_VX = 400;
/** 松手后横向速度衰减系数（每秒保留比例）。 */
export declare const VX_DAMP = 0.02;
/** 撞障碍后的无敌时长 ms。 */
export declare const CRASH_INVULN_MS = 1300;
/** 身后雪痕点数上限（超出丢最旧）。 */
export declare const TRAIL_MAX = 110;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 900;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 阶段：滑行 / 一局结束。 */
export type SkiPhase = 'skiing' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type SkiEvent = {
    type: 'gate';
    x: number;
    y: number;
    gained: number;
} | {
    type: 'crash';
    x: number;
    y: number;
};
/** 障碍种类：树 / 岩石。 */
export type ObstacleKind = 'tree' | 'rock';
/** 一个障碍（世界坐标）。 */
export interface Obstacle {
    x: number;
    worldY: number;
    kind: ObstacleKind;
    /** 碰撞半径。 */
    r: number;
}
/** 一段地形（世界坐标）：一个旗门 + 若干障碍。 */
export interface SkiSegment {
    index: number;
    /** 旗门中心线世界 y。 */
    gateY: number;
    /** 旗门缺口中心 x。 */
    gapX: number;
    /** 是否已结算过（穿门判定只做一次）。 */
    gateDone: boolean;
    obstacles: Obstacle[];
}
/** 上浮渐隐的飘字。 */
export interface SkiFloat {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 身后雪痕采样点（世界坐标）。 */
export interface TrailPoint {
    x: number;
    worldY: number;
}
/** 一局游戏的完整可测状态。 */
export interface SkiState {
    /** 回合内已流逝 ms。 */
    t: number;
    seed: number;
    score: number;
    lives: number;
    /** 已下滑的世界距离 px（滑雪者所在世界 y）。 */
    distance: number;
    /** 当前速度 px/s。 */
    speed: number;
    /** 当前档位（1 起，随距离升）。 */
    gear: number;
    /** 滑雪者逻辑 x 与横向速度。 */
    playerX: number;
    vx: number;
    phase: SkiPhase;
    /** 剩余无敌 ms（撞障碍后的保护期）。 */
    invulnMs: number;
    events: SkiEvent[];
    floats: SkiFloat[];
    trail: TrailPoint[];
    /** 已生成的地形段，按段号索引。 */
    segments: Map<number, SkiSegment>;
}
/** 每帧输入：按键与指针目标（指针存在时优先于按键的松弛模型）。 */
export interface SkiInput {
    left: boolean;
    right: boolean;
    /** 指针目标逻辑 x；无指针为 null。 */
    pointerX: number | null;
}
/**
 * 确定性生成一段地形：一个旗门 + 3~5 个障碍。障碍避开旗门缺口附近
 * 与两侧边界，保证每段必有可走路线。
 * @param seed - 一局种子。
 * @param index - 段号（≥0）。
 * @returns 该段地形。
 */
export declare function generateSegment(seed: number, index: number): SkiSegment;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态（含首屏地形段）。
 */
export declare function createSki(seed: number): SkiState;
/**
 * 推进一帧：速度随距离升档、距离增长、横向控制（按键加速度 / 指针跟随）、
 * 旗门过线判定（+50 或错过）、障碍碰撞（-1 命 + 无敌期）、无敌倒计时、
 * 雪痕采样与飘字。事件写入 state.events，调用方每帧消费。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入。
 */
export declare function stepSki(state: SkiState, dtMs: number, input: SkiInput): void;
/**
 * 当前速度对应的显示速度值（HUD 用，稳定整数）。
 * @param state - 当前状态。
 * @returns 显示速度。
 */
export declare function displaySpeed(state: SkiState): number;
/**
 * 当前已滑距离（米，HUD 用）：10px 记 1 米。
 * @param state - 当前状态。
 * @returns 距离米数。
 */
export declare function displayDistance(state: SkiState): number;
