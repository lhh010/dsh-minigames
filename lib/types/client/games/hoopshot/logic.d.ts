/**
 * 街头投篮（Hoop Shot）纯逻辑：从画面左下把篮球投向右上篮筐。指针在球
 * 附近按下后拖拽（弹弓式：拖得越远力越大、方向为拖拽的反方向），松手投出。
 * 飞行受恒定重力，碰篮板速度镜像衰减；球心自上而下穿过筐口区间判进球，
 * 全程未碰筐沿为空心球（基础分更高）；进球按连击数倍乘计分。篮筐的远近
 * 与高度由 seed + 回合推进的确定性随机数决定，每回合结算后移动。一局限时
 * 60 秒或投满 20 球结束。时间单位毫秒，物理单位 px / s，同 seed 同输入逐步
 * 模拟完全确定。
 */
/** 逻辑画布尺寸（横向场景）。 */
export declare const W = 640;
export declare const H = 420;
/** 地面 y（街头球场地面线）。 */
export declare const FLOOR_Y: number;
/** 篮球半径。 */
export declare const BALL_R = 11;
/** 投篮出发点（画面左下、地面之上）。 */
export declare const ORIGIN: {
    x: number;
    y: number;
};
/** 拖拽长度上限 px（超出按上限计力）。 */
export declare const MAX_DRAG = 160;
/** 最小有效拖拽长度 px（低于视为取消）。 */
export declare const MIN_DRAG = 14;
/** 满力初速 px/s。 */
export declare const MAX_SPEED = 800;
/** 重力加速度 px/s^2。 */
export declare const GRAVITY = 980;
/** 筐口半宽 px（筐口 = rimX ± RIM_R 的水平区间，口沿高度 rimY）。 */
export declare const RIM_R = 26;
/** 筐沿碰撞点半径 px（前后两个口沿端点各一个碰撞圆）。 */
export declare const RIM_PT_R = 4;
/** 筐口到篮板的间隙 px。 */
export declare const BOARD_GAP = 8;
/** 篮板厚度 px。 */
export declare const BOARD_T = 6;
/** 篮板下沿低于筐口的 px。 */
export declare const BOARD_BELOW = 26;
/** 篮板上沿高于筐口的 px。 */
export declare const BOARD_ABOVE = 66;
/** 篮板反弹法向速度保留比例。 */
export declare const BOARD_DAMP = 0.55;
/** 筐沿反弹法向速度保留比例。 */
export declare const RIM_DAMP = 0.55;
/** 一局限时 ms。 */
export declare const GAME_MS = 60000;
/** 一局最多投篮次数。 */
export declare const MAX_SHOTS = 20;
/** 连击倍率上限。 */
export declare const COMBO_CAP = 5;
/** 空心球基础分。 */
export declare const SWISH_BASE = 3;
/** 普通进球基础分。 */
export declare const HIT_BASE = 2;
/** 进球/脱手后的展示停留 ms。 */
export declare const RESULT_MS = 1100;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 950;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 阶段：瞄准 / 飞行 / 回合结算展示 / 一局结束。 */
export type HoopShotPhase = 'aim' | 'flying' | 'result' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type HoopShotEvent = {
    type: 'score';
    x: number;
    y: number;
    gained: number;
    swish: boolean;
    combo: number;
} | {
    type: 'miss';
    x: number;
    y: number;
} | {
    type: 'board';
    x: number;
    y: number;
} | {
    type: 'rim';
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
/** 飞行中的篮球。 */
export interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 自转角 rad 与角速度 rad/s。 */
    rot: number;
    vrot: number;
}
/** 篮筐布置：筐心 (rimX, rimY) 决定筐口、篮板与篮架全部位置。 */
export interface Hoop {
    /** 筐口中心 x。 */
    rimX: number;
    /** 筐口高度 y（口沿所在水平线）。 */
    rimY: number;
}
/** 一局游戏的完整可测状态。 */
export interface HoopShotState {
    /** 回合内已流逝 ms（渲染闪烁用）。 */
    t: number;
    seed: number;
    score: number;
    /** 连续进球数（脱手清零）。 */
    combo: number;
    /** 已出手次数。 */
    shots: number;
    /** 剩余时间 ms（只在非结束阶段倒数）。 */
    timeMs: number;
    hoop: Hoop;
    phase: HoopShotPhase;
    /** result 阶段剩余展示 ms。 */
    resultMs: number;
    ball: Ball;
    /** 本投是否已碰筐沿（结算时判定空心）。 */
    rimTouched: boolean;
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
    events: HoopShotEvent[];
    floats: FloatText[];
    rng: () => number;
}
/**
 * 本回合篮筐几何：篮板面 x（球撞反弹的竖直面）与篮板上下沿 y。
 * @param hoop - 篮筐布置。
 * @returns 篮板面 x、上沿 y、下沿 y。
 */
export declare function boardOf(hoop: Hoop): {
    boardX: number;
    topY: number;
    bottomY: number;
};
/**
 * 本回合出手点到筐口的水平距离（计分用）。
 * @param hoop - 篮筐布置。
 * @returns 水平距离 px。
 */
export declare function hoopDistance(hoop: Hoop): number;
/**
 * 拖拽向量 → 投篮初速（弹弓式：初速方向 = 起点指向反方向）。
 * 渲染层的瞄准预览轨迹使用同一函数，保证所见即所投。
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
export declare function createHoopShot(seed: number): HoopShotState;
/**
 * 开始瞄准（在篮球附近按下时调用）。
 * @param state - 目标状态。
 * @param x - 按下处逻辑坐标 x。
 * @param y - 按下处逻辑坐标 y。
 */
export declare function beginAim(state: HoopShotState, x: number, y: number): void;
/**
 * 更新瞄准拖拽点（按住移动时调用）。
 * @param state - 目标状态。
 * @param x - 当前逻辑坐标 x。
 * @param y - 当前逻辑坐标 y。
 */
export declare function updateAim(state: HoopShotState, x: number, y: number): void;
/**
 * 松手出手：按拖拽反向量计算初速（过短则取消不出手，不计投数）。
 * @param state - 目标状态。
 * @returns true 表示已出手。
 */
export declare function releaseAim(state: HoopShotState): boolean;
/**
 * 推进一帧：飞行物理（重力、篮板镜像衰减、筐沿碰撞）、进球判定（球心自上
 * 而下穿过筐口区间）、落地/出界脱手、限时倒数、结算展示计时与下一回合
 * 切换、飘字。事件写入 state.events，调用方每帧消费后由本函数在下一帧
 * 开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepHoopShot(state: HoopShotState, dtMs: number): void;
