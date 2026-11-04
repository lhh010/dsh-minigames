/**
 * 钩荡忍者（Grapple）纯逻辑：横版卷轴关卡，忍者借天花板锚点群钩索摆荡
 * 前进——按住 = 朝限定半径内、位于上前方的最近锚点发射钩索并绳摆（绳长
 * 固定 = 发射时距离，摆动用极坐标半隐式欧拉积分：重力沿绳切向投影加速
 * 角速度，径向由绳长硬约束）；松开 = 以当前切向速度惯性抛物线飞行。
 * 触尖刺墙或坠出屏幕底部 = 死亡回段首（每 SEG_LEN 一段）；触达终点旗
 * 过关，共 5 关递进（锚点更稀、尖刺更多），分数 = 前进距离。全部函数
 * 确定性可测：随机只出现在 seed+关卡的世界生成里；时间单位毫秒，物理
 * 单位 px / s，坐标 y 向下增大。
 */
/** 逻辑画布尺寸。 */
export declare const W = 640;
export declare const H = 360;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 1400;
/** 忍者碰撞半径 px。 */
export declare const PLAYER_R = 10;
/** 钩索发射半径 px（超出不予吸附）。 */
export declare const HOOK_RANGE = 330;
/** 锚点吸附半径 px（圆形判定，渲染发光圈同尺寸）。 */
export declare const ANCHOR_R = 14;
/** 固定物理子步 ms（确定性：所有推进都切成本子步）。 */
export declare const SUB_MS = 5;
/** 每段（检查点）长度 px，死亡回段首。 */
export declare const SEG_LEN = 800;
/** 总关卡数。 */
export declare const LEVELS = 5;
/** 死亡展示 ms。 */
export declare const DEAD_MS = 900;
/** 过关展示 ms。 */
export declare const CLEAR_MS = 1500;
/** 下坠超出屏幕底部的死亡余量 px。 */
export declare const FALL_MARGIN = 60;
/** 速度上限 px/s（防爆数值）。 */
export declare const V_MAX = 1600;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 天花板锚点（圆形，钩索只吸附锚点）。 */
export interface Anchor {
    x: number;
    y: number;
}
/** 尖刺墙（轴对齐矩形，从底部立起）。 */
export interface Spike {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 一关的世界数据（seed+关卡号确定性生成）。 */
export interface GrappleWorld {
    /** 关卡总长度 px（终点旗在 goalX）。 */
    goalX: number;
    anchors: Anchor[];
    spikes: Spike[];
}
/**
 * 生成某一关的世界（seed+level 确定性；关卡越高锚点越稀、尖刺越多）。
 * 尖刺避开各段首（出生点）左右 100px，保证重生不被秒杀。
 * @param seed - 外部种子。
 * @param level - 关卡号（从 1 起）。
 * @returns 世界数据。
 */
export declare function generateWorld(seed: number, level: number): GrappleWorld;
/** 帧输入：是否按住（发射 / 保持钩索）。 */
export interface GrappleInput {
    hold: boolean;
}
/** 阶段：飞行（含绳摆）/ 死亡展示 / 过关展示 / 全通关。 */
export type GrapplePhase = 'flying' | 'dead' | 'clear' | 'win';
/** 单步内产生、供渲染层消费的可视事件。 */
export type GrappleEvent = {
    type: 'attach';
    x: number;
    y: number;
} | {
    type: 'death';
    x: number;
    y: number;
} | {
    type: 'goal';
    x: number;
    y: number;
};
/** 一局游戏的完整可测状态。 */
export interface GrappleState {
    /** 回合内已流逝 ms。 */
    t: number;
    seed: number;
    level: number;
    /** 已通关关卡累计的距离 px（分数跨关累加）。 */
    baseDistance: number;
    /** 本关最远前进距离 px。 */
    maxX: number;
    deaths: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 钩索：吸附的锚点下标，-1 = 未吸附。 */
    anchorIdx: number;
    /** 吸附锚点坐标（发射时快照，摆动积分用）。 */
    anchorX: number;
    anchorY: number;
    /** 绳长 px（发射时距离，固定不变）。 */
    ropeLen: number;
    /** 摆角 rad（从锚点看玩家，+x 起算，y 向下）。 */
    phi: number;
    /** 角速度 rad/s。 */
    omega: number;
    phase: GrapplePhase;
    /** 阶段停留剩余 ms。 */
    phaseMs: number;
    world: GrappleWorld;
    events: GrappleEvent[];
    /** 子步累加器 ms（固定子步保证确定性）。 */
    accMs: number;
}
/**
 * 新开一局（level 1）。
 * @param seed - 外部种子。
 * @returns 初始状态。
 */
export declare function createGrapple(seed: number): GrappleState;
/** 当前总分（前进距离，米 = px/10，跨关累加）。 */
export declare function grappleScore(state: GrappleState): number;
/**
 * 摆动机械能（单位质量）：0.5*(omega*L)^2 + g*L*sin(phi)。
 * 仅用于测试近似能量守恒。
 * @param state - 当前状态（需处于吸附摆动态）。
 * @returns 机械能。
 */
export declare function pendulumEnergy(state: GrappleState): number;
/**
 * 测试辅助：把状态直接摆到锚点 (ax,ay) 上、摆角 phi、角速度 omega。
 * @param state - 目标状态。
 * @param ax - 锚点 x。
 * @param ay - 锚点 y。
 * @param phi - 初始摆角 rad。
 * @param omega - 初始角速度 rad/s。
 */
export declare function forceAttach(state: GrappleState, ax: number, ay: number, phi: number, omega: number): void;
/**
 * 推进一帧：把 dtMs 切成固定 SUB_MS 子步（余量进累加器），事件写入
 * state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 当前帧输入。
 */
export declare function stepGrapple(state: GrappleState, dtMs: number, input: GrappleInput): void;
