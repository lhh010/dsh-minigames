/**
 * 套圈达人（Ring Toss）纯逻辑：侧视嘉年华摊位，玩家在左侧手持圆环，
 * 按住蓄力（力度决定水平初速，竖直初速固定），松开抛出。环飞行受重力
 * （第 2 轮起叠加风力水平加速度）；环心自上而下穿过柱顶水平线且水平
 * 距离在容差内判套中，擦到柱身则弹开落地不中。柱按远近排布：近柱 5 分、
 * 中柱 10 分、金柱 25 分，连续套中按连击数倍乘计分。每轮 5 环、共 3 轮，
 * 柱布局由 seed 驱动的确定性随机数生成。时间单位毫秒，物理单位 px/s，
 * 同 seed 同输入逐步模拟完全确定。
 */
/** 逻辑画布尺寸（横向场景）。 */
export declare const W = 640;
export declare const H = 420;
/** 摊位地面 y。 */
export declare const FLOOR_Y: number;
/** 抛环出手点（画面左侧、地面上方）。 */
export declare const HAND: {
    x: number;
    y: number;
};
/** 圆环内半径 px（碰撞按环心计）。 */
export declare const RING_R = 15;
/** 套中判定容差 px（环心与柱顶 x 距离）。 */
export declare const HIT_TOL = 10;
/** 柱顶碰撞半径 px（擦柱弹开的判定宽度）。 */
export declare const PEG_TOP_R = 6;
/** 柱身半径 px。 */
export declare const SHAFT_R = 4;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 900;
/** 出手竖直初速 px/s（固定向上）。 */
export declare const LAUNCH_VY = -540;
/** 最小水平初速 px/s（零力度）。 */
export declare const MIN_VX = 330;
/** 最大水平初速 px/s（满力度）。 */
export declare const MAX_VX = 940;
/** 蓄力速度（力度/秒）。 */
export declare const POWER_RATE = 1.2;
/** 每轮环数。 */
export declare const RINGS_PER_ROUND = 5;
/** 总轮数。 */
export declare const ROUNDS = 3;
/** 连击倍率上限。 */
export declare const COMBO_CAP = 5;
/** 套中/脱手后的展示停留 ms。 */
export declare const RESULT_MS = 950;
/** 风力最大绝对值 px/s^2（第 2 轮起启用）。 */
export declare const WIND_MAX = 150;
/** 近柱分值。 */
export declare const POINT_NEAR = 5;
/** 中柱分值。 */
export declare const POINT_MID = 10;
/** 金柱分值。 */
export declare const POINT_GOLD = 25;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 950;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 阶段：待蓄力 / 蓄力中 / 飞行 / 展示结算 / 一局结束。 */
export type RingTossPhase = 'aim' | 'charge' | 'flying' | 'settle' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type RingTossEvent = {
    type: 'hit';
    x: number;
    y: number;
    gained: number;
    value: number;
    combo: number;
} | {
    type: 'miss';
    x: number;
    y: number;
} | {
    type: 'clank';
    x: number;
    y: number;
};
/** 上浮渐隐的飘字。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
    /** 飘字颜色。 */
    color: string;
}
/** 一根立柱：底在 FLOOR_Y，顶在 topY，分值由远近档位决定。 */
export interface Peg {
    /** 柱心 x。 */
    x: number;
    /** 柱顶 y。 */
    topY: number;
    /** 分值（5/10/25）。 */
    value: number;
    /** 配色档（渲染用）：0 近柱 1 中柱 2 金柱。 */
    tier: 0 | 1 | 2;
}
/** 飞行中的圆环。 */
export interface Ring {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 自转角 rad 与角速度 rad/s。 */
    rot: number;
    vrot: number;
}
/** 套中后沿柱滑落的展示数据。 */
export interface Slide {
    /** 套中的柱在 pegs 中的下标。 */
    pegIndex: number;
    /** 已滑落 ms。 */
    t: number;
}
/** 一局游戏的完整可测状态。 */
export interface RingTossState {
    /** 回合内已流逝 ms。 */
    t: number;
    seed: number;
    score: number;
    /** 连续套中数（脱手清零）。 */
    combo: number;
    /** 当前轮（1 起）。 */
    round: number;
    /** 本轮已投环数。 */
    ringsThrown: number;
    /** 本轮剩余环数。 */
    ringsLeft: number;
    pegs: Peg[];
    /** 水平风加速度 px/s^2（第 2 轮起非零）。 */
    wind: number;
    phase: RingTossPhase;
    /** 蓄力力度 0..1。 */
    power: number;
    ring: Ring;
    /** settle 阶段剩余展示 ms。 */
    settleMs: number;
    /** 套中滑落展示（未套中为 null）。 */
    slide: Slide | null;
    events: RingTossEvent[];
    floats: FloatText[];
    rng: () => number;
}
/**
 * 力度 → 出手初速（水平线性放大，竖直固定向上；渲染层的轨迹预览使用
 * 同一函数，保证所见即所投）。
 * @param power - 力度 0..1（越界按边界计）。
 * @returns 初速分量。
 */
export declare function powerToVelocity(power: number): {
    vx: number;
    vy: number;
};
/**
 * 生成本轮柱布局：5 根柱在右半场随机取位（保证最小间距），按远近排序后
 * 由近及远赋分值档（近近中中金）；柱高随远近递增（远柱更高、顶更靠上）。
 * @param rng - 布局随机源。
 * @returns 柱数组。
 */
export declare function layoutPegs(rng: () => number): Peg[];
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态。
 */
export declare function createRingToss(seed: number): RingTossState;
/**
 * 按下开始蓄力（aim 阶段有效）。
 * @param state - 目标状态。
 */
export declare function pressCharge(state: RingTossState): void;
/**
 * 松开抛出：按当前力度计算初速；未在蓄力阶段不动作。
 * @param state - 目标状态。
 * @returns true 表示已抛出。
 */
export declare function releaseThrow(state: RingTossState): boolean;
/**
 * 推进一帧：蓄力增长、飞行物理（重力 + 风力）、柱顶套中判定（环心自上
 * 而下穿过柱顶且 x 距离在容差内）、擦柱弹开、落地/出界脱手、展示计时与
 * 轮次推进、飘字。事件写入 state.events，调用方每帧消费后由本函数在下
 * 一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepRingToss(state: RingTossState, dtMs: number): void;
