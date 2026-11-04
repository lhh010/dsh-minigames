/**
 * 洞穴飞行（Copter）纯逻辑：横版自动前进的直升机，按住施加向上推力、
 * 松开只受重力。洞穴上下壁由 seed+段号确定性生成——中线随机游走、
 * 半宽随段号单调收窄至下限、每若干段出现一次急弯；机身盒（矩形）
 * 触碰任一壁折线即爆炸结束。距离（米）即分数，前进速度随距离缓慢
 * 提升并封顶。模拟以固定子步（SUB_MS）推进，帧间隔先入累加器、再按
 * 整数子步消费，同一输入时间线重放结果逐位一致。时间单位毫秒，
 * 物理单位 px / s。
 */
/** 逻辑画布尺寸。 */
export declare const W = 520;
export declare const H = 360;
/** 洞穴分段宽度 px（世界坐标）。 */
export declare const SEG_W = 40;
/** 初始半宽 px（全宽 = 2 × half）。 */
export declare const HALF_START = 150;
/** 半宽下限 px（最深处的通道宽度）。 */
export declare const HALF_MIN = 48;
/** 每段收窄量 px。 */
export declare const NARROW_PER_SEG = 0.6;
/** 基础段转弯幅度 px，每 BEND_EVERY 段放大为急弯幅度。 */
export declare const TURN_AMP = 26;
export declare const TURN_AMP_HARD = 64;
export declare const BEND_EVERY = 8;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 640;
/** 按住时的向上推力加速度 px/s^2。 */
export declare const THRUST = 1150;
/** 垂直速度上限 px/s（绝对值）。 */
export declare const VY_MAX = 430;
/** 起始前进速度 px/s。 */
export declare const SPEED_BASE = 175;
/** 前进速度上限 px/s。 */
export declare const SPEED_MAX = 360;
/** 前进速度随距离（px）的提升系数。 */
export declare const SPEED_RAMP = 0.012;
/** 机身碰撞盒半宽 / 半高 px。 */
export declare const HULL_HALF_W = 11;
export declare const HULL_HALF_H = 7;
/** 固定物理子步 ms。 */
export declare const SUB_MS = 8;
/** 每 10px 记 1 米（即 1 分）。 */
export declare const METER_PX = 10;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 一段洞穴的中线高度与半宽。 */
export interface CaveProfile {
    /** 中线 y（0 = 顶）。 */
    center: number;
    /** 半宽 px。 */
    half: number;
}
/**
 * 生成第 i 段洞穴剖面（seed+i 确定性）：半宽 = max(下限, 初始 - i × 收窄量)，
 * 对 i 单调不增；中线由上一段出发随机游走——普通段幅度 TURN_AMP，每逢
 * BEND_EVERY 的倍数段取急弯幅度 TURN_AMP_HARD；单段位移受当前半宽约束
 * （可飞越坡度），并被夹在画布内（含边距）。
 * @param seed - 外部种子。
 * @param i - 段号（从 0 起）。
 * @returns 该段的中线与半宽。
 */
export declare function caveProfile(seed: number, i: number): CaveProfile;
/**
 * 世界 x 处的上壁（天花板）y。
 * @param seed - 外部种子。
 * @param x - 世界横坐标 px。
 * @returns 上壁 y（越小越靠上）。
 */
export declare function ceilingAt(seed: number, x: number): number;
/**
 * 世界 x 处的下壁（地面）y。
 * @param seed - 外部种子。
 * @param x - 世界横坐标 px。
 * @returns 下壁 y（越大越靠下）。
 */
export declare function floorAt(seed: number, x: number): number;
/**
 * 当前前进速度 px/s：随已飞距离缓慢提升，封顶 SPEED_MAX。
 * @param distPx - 已飞世界距离 px。
 * @returns 前进速度。
 */
export declare function speedOf(distPx: number): number;
/** 阶段：飞行 / 坠毁结束。 */
export type CopterPhase = 'flying' | 'crashed';
/** 单步内产生、供渲染层消费的可视事件。 */
export type CopterEvent = {
    type: 'crash';
    x: number;
    y: number;
};
/** 一局游戏的完整可测状态。 */
export interface CopterState {
    /** 回合内已流逝 ms（旋翼动画用）。 */
    t: number;
    seed: number;
    /** 机体在世界坐标中的横坐标 px（屏幕位置由渲染层换算）。 */
    worldX: number;
    /** 机体纵向位置 / 速度（y 增大向下）。 */
    y: number;
    vy: number;
    /** 距离分（米）= floor(worldX / METER_PX)。 */
    score: number;
    phase: CopterPhase;
    /** 子步累加器 ms：只在攒满 SUB_MS 时消费整数子步。 */
    acc: number;
    events: CopterEvent[];
}
/**
 * 新开一局：出生在起点通道中央、速度为零。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export declare function createCopter(seed: number): CopterState;
/**
 * 推进一帧：dt 先入累加器，再按 SUB_MS 固定子步消费（同一输入时间线
 * 重放逐位一致）；坠毁后只走时钟。事件写入 state.events，每帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param holding - 本帧是否按住（推力）。
 */
export declare function stepCopter(state: CopterState, dtMs: number, holding: boolean): void;
