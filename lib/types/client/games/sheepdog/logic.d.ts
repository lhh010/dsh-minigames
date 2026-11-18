/**
 * 牧羊犬（Sheepdog）纯逻辑：俯视草场上，玩家操控牧羊犬用 boids 羊群
 * （分离/对齐/聚合三力 + 对牧羊犬与狼的逃离斥力）把 N 只羊赶进带开口
 * 的围栏。5 关递进：羊数 5→12、场地变大、第 3 关起加入狼（狼追羊、
 * 犬可驱狼）、每关限时。全部入栏过关，剩余时间折算加分。
 *
 * 确定性：随机数只通过注入 seed（mulberry32）用于关卡初始布置；之后
 * 所有物理走固定子步（SUBSTEP_MS）积分，整局可按 (seed, 输入序列)
 * 完整重放。时间单位全为毫秒。
 */
/** 逻辑画布宽（px）。 */
export declare const W = 480;
/** 逻辑画布高（px），顶部 HUD_H 为信息条。 */
export declare const H = 600;
/** 顶部 HUD 条高度（px）。 */
export declare const HUD_H = 30;
/** 固定物理子步长（ms）：stepSheepdog 把外部 dt 累加后按此切分。 */
export declare const SUBSTEP_MS = 10;
/** 羊与羊的分离半径（px）：更近则互相推开。 */
export declare const SEP_R = 26;
/** 分离力权重（px/s^2，按距离线性衰减前的峰值）。 */
export declare const SEP_FORCE = 340;
/** 对齐/聚合的视野半径（px）。 */
export declare const VIEW_R = 85;
/** 对齐力权重（1/s：向邻居平均速度靠拢的转向速率）。 */
export declare const ALI_WEIGHT = 1.4;
/** 聚合力（px/s^2，指向邻居质心）。 */
export declare const COH_FORCE = 60;
/** 羊的碰撞半径（px），用于贴墙钳制。 */
export declare const SHEEP_R = 7;
/** 恐慌时羊的限速上浮系数。 */
export declare const PANIC_SPEED_FACTOR = 1.35;
/** 恐慌每秒衰减量（panic ∈ [0,1]，渲染据此画 "!"）。 */
export declare const PANIC_DECAY_PER_S = 0.9;
/** 犬的移动速度（px/s），略快于任何羊。 */
export declare const DOG_SPEED = 170;
/** 羊感知犬并开始逃离的半径（px）。 */
export declare const DOG_R = 125;
/** 犬对羊的斥力峰值（px/s^2，随距离线性衰减）。 */
export declare const DOG_FORCE = 1050;
/** 狼的追击速度（px/s）：快于常态羊、慢于犬与恐慌羊。 */
export declare const WOLF_SPEED = 108;
/** 狼怕犬的半径（px）：犬靠近即掉头逃离——犬可以驱狼。 */
export declare const WOLF_FEAR_R = 115;
/** 狼追羊的期望距离（px）：贴近到此距离即算压制，羊恐慌四散。 */
export declare const WOLF_CATCH_R = 16;
/** 围栏宽（px），锚在场地右上角。 */
export declare const PEN_W = 108;
/** 围栏高（px）。 */
export declare const PEN_H = 86;
/** 围栏开口宽度（px），开在下边（朝场地内侧）。 */
export declare const PEN_OPEN_W = 44;
/** 入栏判定半径（px）：未入栏羊距开口中心小于此值即入栏。 */
export declare const PEN_OPEN_R = 24;
/** 已入栏羊走向栏内站位点的速度（px/s）。 */
export declare const PEN_SLOT_SPEED = 60;
/** 过关后停留展示时长（ms），随后自动进入下一关。 */
export declare const WIN_LINGER_MS = 1600;
/** 每入栏一只羊的即时加分。 */
export declare const SCORE_PER_SHEEP = 20;
/** 过关时每剩余整秒的加分。 */
export declare const SCORE_PER_SECOND_LEFT = 10;
/** 一关的难度配置。 */
export interface SheepdogLevel {
    /** 本关羊数。 */
    sheepCount: number;
    /** 限时（ms）。 */
    timeLimitMs: number;
    /** 狼的数量（第 3 关起 ≥1）。 */
    wolves: number;
    /** 场地内缩（px）：越小场地越大。 */
    inset: number;
    /** 羊限速（px/s）。 */
    sheepMaxSpeed: number;
}
/** 5 关递进配置：羊变多、场地变大、后两关有狼。 */
export declare const LEVELS: SheepdogLevel[];
/** 轴对齐矩形。 */
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 一只羊：位置、速度、朝向（rad）、恐慌度 0..1、步态相位、入栏状态。 */
export interface Sheep {
    x: number;
    y: number;
    vx: number;
    vy: number;
    heading: number;
    panic: number;
    legPhase: number;
    penned: boolean;
    slotIndex: number;
}
/** 一只狼：位置与速度（朝最近未入栏的羊追；犬近则逃）。 */
export interface Wolf {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
/** 牧羊犬：位置、速度、朝向与跑动步态相位。 */
export interface Dog {
    x: number;
    y: number;
    vx: number;
    vy: number;
    heading: number;
    legPhase: number;
}
/** 草地纹理草簇（关卡开始时由 seed 生成，仅供渲染）。 */
export interface Deco {
    x: number;
    y: number;
    r: number;
    shade: number;
}
/** 游戏阶段。 */
export type SheepdogPhase = 'playing' | 'won' | 'lost' | 'campaign-won';
/** 整局状态：campaign 从第 0 关打到第 4 关，跨关累计分数。 */
export interface SheepdogState {
    seed: number;
    levelIndex: number;
    phase: SheepdogPhase;
    dog: Dog;
    sheep: Sheep[];
    wolves: Wolf[];
    timeLeftMs: number;
    elapsedMs: number;
    winTimerMs: number;
    stepAccumulatorMs: number;
    score: number;
    pennedCount: number;
    nextSlot: number;
    deco: Deco[];
}
/** 玩家方向输入（键盘方向键/WASD 归一后的四布尔）。 */
export interface SheepdogInput {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}
/**
 * mulberry32 确定性随机数发生器：同 seed 产生同一 [0,1) 序列。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 本关草地矩形（不含顶部 HUD）。
 * @param level - 关卡配置。
 * @returns 场地矩形。
 */
export declare function fieldRect(level: SheepdogLevel): Rect;
/**
 * 围栏矩形：锚在场地右上角。
 * @param level - 关卡配置。
 * @returns 围栏矩形。
 */
export declare function penRect(level: SheepdogLevel): Rect;
/**
 * 围栏开口中心：下边中点（朝场地内侧）。
 * @param level - 关卡配置。
 * @returns 开口中心坐标。
 */
export declare function penOpening(level: SheepdogLevel): {
    x: number;
    y: number;
};
/**
 * 用 seed 派生 rng 重置当前关卡：羊散布在场地左 2/3（远离围栏）、
 * 犬在底部中央、狼在左下角，全部由 (seed, levelIndex) 决定。
 * @param st - 游戏状态（levelIndex 已指向目标关）。
 */
export declare function startLevel(st: SheepdogState): void;
/**
 * 开新战役。
 * @param seed - 随机种子（默认取自 Math.random，测试注入固定值）。
 * @returns 第 0 关初始状态。
 */
export declare function createSheepdog(seed?: number): SheepdogState;
/**
 * 计算一只未入栏羊的 boids 合力：分离 + 对齐 + 聚合 + 犬斥力 + 狼斥力
 * （纯函数，不改状态；供逻辑与测试共用）。
 * @param st - 游戏状态。
 * @param index - 目标羊下标。
 * @returns 加速度 {ax, ay}（px/s^2）。
 */
export declare function sheepForces(st: SheepdogState, index: number): {
    ax: number;
    ay: number;
};
/**
 * 推进游戏：把 dtMs 累加到子步累加器并执行整数个 SUBSTEP_MS 子步
 * （余量留到下一帧），保证任意切分方式下积分确定。
 * won 阶段继续跑（栏内滑行与自动进关）；lost / campaign-won 冻结。
 * @param st - 游戏状态。
 * @param dtMs - 距上帧毫秒数（钳制到 [0,100]）。
 * @param input - 玩家方向输入。
 */
export declare function stepSheepdog(st: SheepdogState, dtMs: number, input: SheepdogInput): void;
