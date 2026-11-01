/**
 * 丢纸团（Paper Toss）纯逻辑：从屏幕左下把纸团抛进右侧纸篓。指针在纸团
 * 附近按下后拖拽（弹弓式：拖得越远力越大、方向为拖拽的反方向），松手抛出。
 * 飞行受恒定重力与每回合 seed 决定的侧向风力影响；纸篓水平位置（远近）
 * 与风力每回合变化。球心在下落中进入纸篓口矩形即命中：基础分随距离增长，
 * 连续命中按连击数倍乘；纸团落地或飞出边界记一次脱手，脱手 5 次一局结束。
 * 时间单位毫秒，物理单位 px / s，同 seed 同输入逐步模拟完全确定。
 */
/** 逻辑画布尺寸（横向场景）。 */
export declare const W = 560;
export declare const H = 420;
/** 地面 y（办公室地板线）。 */
export declare const FLOOR_Y: number;
/** 纸团半径。 */
export declare const BALL_R = 9;
/** 抛出点（屏幕左下、地板之上）。 */
export declare const ORIGIN: {
    x: number;
    y: number;
};
/** 拖拽长度上限 px（超出按上限计力）。 */
export declare const MAX_DRAG = 150;
/** 最小有效拖拽长度 px（低于视为取消）。 */
export declare const MIN_DRAG = 14;
/** 满力初速 px/s。 */
export declare const MAX_SPEED = 640;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 780;
/** 侧向风力加速度上限 px/s^2（有符号）。 */
export declare const WIND_MAX = 170;
/** 纸篓口宽度 px。 */
export declare const BIN_W = 48;
/** 纸篓高度 px（立于地板上）。 */
export declare const BIN_H = 58;
/** 纸篓口判定容差 px。 */
export declare const MOUTH_TOL = 7;
/** 脱手次数上限，达到即一局结束。 */
export declare const MAX_MISSES = 5;
/** 连击倍率上限。 */
export declare const COMBO_CAP = 5;
/** 命中/脱手后的展示停留 ms。 */
export declare const RESULT_MS = 950;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 950;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 阶段：瞄准 / 飞行 / 回合结算展示 / 一局结束。 */
export type PaperTossPhase = 'aim' | 'flying' | 'result' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type PaperTossEvent = {
    type: 'hit';
    x: number;
    y: number;
    gained: number;
    combo: number;
} | {
    type: 'miss';
    x: number;
    y: number;
};
/** 上浮渐隐的飘字。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 飞行中的纸团。 */
export interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 自转角 rad 与角速度 rad/s。 */
    rot: number;
    vrot: number;
}
/** 一局游戏的完整可测状态。 */
export interface PaperTossState {
    /** 回合内已流逝 ms（渲染闪烁用）。 */
    t: number;
    seed: number;
    score: number;
    /** 连续命中数（脱手清零）。 */
    combo: number;
    /** 已脱手次数。 */
    misses: number;
    /** 本回合纸篓口左缘 x（篓口矩形 = [binX, binX+BIN_W] × mouthY 附近）。 */
    binX: number;
    /** 侧向风加速度 px/s^2（正 = 向右吹）。 */
    wind: number;
    phase: PaperTossPhase;
    /** result 阶段剩余展示 ms。 */
    resultMs: number;
    ball: Ball;
    /** 是否正在拖拽瞄准。 */
    aiming: boolean;
    /** 拖拽起点（按下处）。 */
    aimFrom: {
        x: number;
        y: number;
    };
    /** 拖拽当前点。 */
    aimTo: {
        x: number;
        y: number;
    };
    events: PaperTossEvent[];
    floats: FloatText[];
    rng: () => number;
}
/**
 * 纸篓口 y（地板上方一个篓高处的水平线）。
 */
export declare function binMouthY(): number;
/**
 * 本回合抛出点到纸篓口的水平距离（计分用）。
 * @param state - 当前状态。
 * @returns 水平距离 px。
 */
export declare function binDistance(state: PaperTossState): number;
/**
 * 拖拽向量 → 抛出初速（弹弓式：初速方向 = 起点指向反方向）。
 * 渲染层的瞄准预览轨迹使用同一函数，保证所见即所抛。
 * @param dx - 起点x - 当前点x（拖拽反向量 x 分量）。
 * @param dy - 起点y - 当前点y（拖拽反向量 y 分量）。
 * @returns 初速，拖拽过短返回 null（视为取消）。
 */
export declare function dragToVelocity(dx: number, dy: number): {
    vx: number;
    vy: number;
} | null;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态。
 */
export declare function createPaperToss(seed: number): PaperTossState;
/**
 * 开始瞄准（在纸团附近按下时调用）。
 * @param state - 目标状态。
 * @param x - 按下处逻辑坐标 x。
 * @param y - 按下处逻辑坐标 y。
 */
export declare function beginAim(state: PaperTossState, x: number, y: number): void;
/**
 * 更新瞄准拖拽点（按住移动时调用）。
 * @param state - 目标状态。
 * @param x - 当前逻辑坐标 x。
 * @param y - 当前逻辑坐标 y。
 */
export declare function updateAim(state: PaperTossState, x: number, y: number): void;
/**
 * 松手抛出：按拖拽反向量计算初速（过短则取消不抛）。
 * @param state - 目标状态。
 * @returns true 表示已抛出。
 */
export declare function releaseAim(state: PaperTossState): boolean;
/**
 * 推进一帧：飞行物理（重力 + 侧风）、进篓判定（球心进篓口矩形且下落中）、
 * 落地/出界脱手、结算展示计时与下一回合切换、飘字。事件写入 state.events，
 * 调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepPaperToss(state: PaperTossState, dtMs: number): void;
