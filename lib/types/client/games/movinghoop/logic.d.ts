/**
 * 移动篮筐（Moving Hoop）纯逻辑：从画面左下把篮球投向右上篮筐，没有防守
 * 障碍，但篮筐本身会运动。指针在球附近按下后拖拽（弹弓式：拖得越远力越
 * 大、方向为拖拽的反方向），松手投出。飞行受恒定重力，碰篮板速度镜像衰
 * 减；球心自上而下穿过筐口区间判进球（用当帧口沿位置判定），全程未碰筐
 * 沿为空心球（基础分更高）；进球按连击数倍乘计分。篮筐运动模式随投数升
 * 级：前 4 投静止热身；5-9 投上下浮沉；10-14 投左右巡逻；15 投起复合
 * 8 字轨迹且更快。一局限时 60 秒或投满 20 球结束。时间单位毫秒，物理单
 * 位 px / s，同 seed 同输入逐步模拟完全确定。
 */
/** 逻辑画布尺寸（横向场景）。 */
export declare const W = 640;
export declare const H = 420;
/** 地面 y（黄昏球场地面线）。 */
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
export declare const MAX_SPEED = 1150;
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
/** 浮沉模式竖向振幅 px。 */
export declare const BOB_AMP = 42;
/** 浮沉模式角速度 rad/s。 */
export declare const BOB_OMEGA = 1.6;
/** 巡逻模式横向振幅 px。 */
export declare const PATROL_AMP = 60;
/** 巡逻模式角速度 rad/s。 */
export declare const PATROL_OMEGA = 1.3;
/** 复合模式横向振幅 px。 */
export declare const COMPLEX_AMP_X = 52;
/** 复合模式竖向振幅 px。 */
export declare const COMPLEX_AMP_Y = 34;
/** 复合模式角速度 rad/s（8 字轨迹，比前两档更快）。 */
export declare const COMPLEX_OMEGA = 2.4;
/** 模式升级阈值：前 STATIC_SHOTS 投静止，之后每 PATROL_STEP 投换档，COMPLEX_FROM_SHOTS 投起复合。 */
export declare const STATIC_SHOTS = 4;
export declare const BOB_FROM_SHOTS = 4;
export declare const PATROL_FROM_SHOTS = 9;
export declare const COMPLEX_FROM_SHOTS = 14;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 篮筐运动模式：静止 / 上下浮沉 / 左右巡逻 / 复合 8 字。 */
export type HoopMotion = 'static' | 'bob' | 'patrol' | 'complex';
/** 阶段：瞄准 / 飞行 / 回合结算展示 / 一局结束。 */
export type MovingHoopPhase = 'aim' | 'flying' | 'result' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type MovingHoopEvent = {
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
/** 运动篮筐：基准位 (baseX, baseY) + 模式参数，瞬时位由 hoopAt 按时间求出。 */
export interface MovingHoop {
    /** 运动模式。 */
    mode: HoopMotion;
    /** 筐口基准中心 x。 */
    baseX: number;
    /** 筐口基准高度 y。 */
    baseY: number;
    /** 横向振幅 px（静止/浮沉为 0）。 */
    ampX: number;
    /** 竖向振幅 px（静止/巡逻为 0）。 */
    ampY: number;
    /** 角速度 rad/s。 */
    omega: number;
    /** 当前帧筐口中心 x（每帧更新）。 */
    rimX: number;
    /** 当前帧筐口高度 y（每帧更新）。 */
    rimY: number;
}
/**
 * 按已出手次数决定篮筐运动模式。
 * @param shots - 已出手次数。
 * @returns 运动模式。
 */
export declare function motionForShots(shots: number): HoopMotion;
/**
 * 篮筐在时刻 tMs 的瞬时筐口位置（纯函数，与帧节奏无关）：
 * 静止 = 基准位；浮沉 = 竖向正弦；巡逻 = 横向正弦；复合 = x 主频、
 * y 倍频的 8 字轨迹。
 * @param hoop - 篮筐布置。
 * @param tMs - 一局开始以来的时刻 ms。
 * @returns 筐口中心 x 与口沿高度 y。
 */
export declare function hoopAt(hoop: MovingHoop, tMs: number): {
    rimX: number;
    rimY: number;
};
/**
 * 本帧篮筐几何：篮板面 x（球撞反弹的竖直面）与篮板上下沿 y，跟随筐口
 * 当前瞬时位置。
 * @param rimX - 当前筐口中心 x。
 * @param rimY - 当前筐口高度 y。
 * @returns 篮板面 x、上沿 y、下沿 y。
 */
export declare function boardOf(rimX: number, rimY: number): {
    boardX: number;
    topY: number;
    bottomY: number;
};
/**
 * 本回合出手点到筐口基准位的水平距离（计分用）。
 * @param hoop - 篮筐布置。
 * @returns 水平距离 px。
 */
export declare function hoopDistance(hoop: MovingHoop): number;
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
/** 一局游戏的完整可测状态。 */
export interface MovingHoopState {
    /** 一局开始以来已流逝 ms（篮筐运动与闪烁的时钟）。 */
    t: number;
    seed: number;
    score: number;
    /** 连续进球数（脱手清零）。 */
    combo: number;
    /** 已出手次数。 */
    shots: number;
    /** 剩余时间 ms（只在非结束阶段倒数）。 */
    timeMs: number;
    hoop: MovingHoop;
    phase: MovingHoopPhase;
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
    events: MovingHoopEvent[];
    floats: FloatText[];
    rng: () => number;
}
/**
 * 按运动模式生成一个篮筐：基准位由 rand 决定并留出振幅余量，保证整个
 * 行程都落在可达的弹道窗口内。
 * @param mode - 运动模式。
 * @param rand - [0,1) 随机源。
 * @returns 初始停在 t=0 位置的篮筐。
 */
export declare function createHoopForMode(mode: HoopMotion, rand: () => number): MovingHoop;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @returns 初始状态。
 */
export declare function createMovingHoop(seed: number): MovingHoopState;
/**
 * 开始瞄准（在篮球附近按下时调用）。
 * @param state - 目标状态。
 * @param x - 按下处逻辑坐标 x。
 * @param y - 按下处逻辑坐标 y。
 */
export declare function beginAim(state: MovingHoopState, x: number, y: number): void;
/**
 * 更新瞄准拖拽点（按住移动时调用）。
 * @param state - 目标状态。
 * @param x - 当前逻辑坐标 x。
 * @param y - 当前逻辑坐标 y。
 */
export declare function updateAim(state: MovingHoopState, x: number, y: number): void;
/**
 * 松手出手：按拖拽反向量计算初速（过短则取消不出手，不计投数）。
 * @param state - 目标状态。
 * @returns true 表示已出手。
 */
export declare function releaseAim(state: MovingHoopState): boolean;
/**
 * 推进一帧：先把篮筐推进到本帧瞬时位置（瞄准阶段也运动，玩家可以读节
 * 奏），然后做飞行物理（重力、篮板镜像衰减、筐沿碰撞）、进球判定（球心
 * 自上而下穿过当帧筐口区间）、落地/出界脱手、限时倒数、结算展示计时与
 * 下一回合切换、飘字。事件写入 state.events，调用方每帧消费后由本函数
 * 在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepMovingHoop(state: MovingHoopState, dtMs: number): void;
