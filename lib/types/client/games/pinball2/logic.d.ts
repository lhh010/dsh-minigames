/**
 * 弹球大师 Pinball 纯逻辑：一张竖直街机弹球台的确定性 2D 物理模拟 ——
 * 重力、固定自适应子步（快速时加密，防止穿透）、圆 vs 线段外墙、带外冲
 * 击的圆形 bumper 与小立柱、以及把接触点表面速度传给球的水滴形挡板。
 *
 * 特色规则：连击（combo）—— bumper 之间不落板连击越高倍率越高（上限
 * x5），球碰挡板或落袋即清零；球从台顶发球（空格），掉进底部通道即损
 * 失一球，共 3 球。所有随机量都走注入的 mulberry32 rng，同一种子与输
 * 入脚本必然复现同一轨迹。渲染器（render.ts）只画状态；粘合层
 * （index.ts）负责输入。
 */
/** 逻辑台面尺寸（渲染坐标同此）。 */
export declare const TABLE_W = 420;
export declare const TABLE_H = 660;
/** 球半径 px。 */
export declare const BALL_R = 8;
/** 向下重力加速度 px/s²。 */
export declare const GRAVITY = 920;
/** 基线子步长（静止时 ≥240Hz）。 */
export declare const BASE_SUBSTEP_DT: number;
/** 单个子步内球最多走过的距离（半径的分数）—— 防穿透。 */
export declare const MAX_SUBSTEP_TRAVEL: number;
/** 绝对速度上限（同时约束子步数）。 */
export declare const MAX_SPEED = 2200;
/** 外墙恢复系数。 */
export declare const WALL_E = 0.5;
/** 法向接近速度低于该值时贴面沉淀（避免微弹跳）。 */
export declare const REST_SPEED = 36;
/** 全局线性阻尼（每秒 exp 形式）。 */
export declare const DAMPING_K = 0.1;
/** Bumper：恢复系数、最小外冲 px/s、每次得分、再触发冷却 s、半径。 */
export declare const BUMPER_E = 1.35;
export declare const BUMPER_KICK = 280;
export declare const BUMPER_POINTS = 100;
export declare const BUMPER_COOLDOWN = 0.12;
export declare const BUMPER_R = 17;
/** 小立柱：半径、得分、最小外冲。 */
export declare const POST_R = 8;
export declare const POST_POINTS = 20;
export declare const POST_KICK = 210;
/** 连击倍率上限。 */
export declare const MAX_MULT = 5;
/** 每局球数。 */
export declare const BALLS_PER_GAME = 3;
/** 球心低于此 y 判定落袋。 */
export declare const DRAIN_Y: number;
/** 挡板：枢轴胶囊半径、上摆角速度、回弹角速度、长度。 */
export declare const FLIPPER_R = 9;
export declare const FLIPPER_OMEGA = 17;
export declare const FLIPPER_RETURN = 11;
export declare const FLIPPER_LEN = 66;
/** 挡板碰撞恢复系数与表面速度传递比例。 */
export declare const FLIPPER_E = 0.42;
export declare const FLIPPER_SURFACE_FACTOR = 0.5;
/** 发球初速范围（向下 px/s）与横向抖动幅度。 */
export declare const SERVE_MIN_VY = 240;
export declare const SERVE_JITTER_VY = 160;
export declare const SERVE_JITTER_VX = 130;
/** 死球搜救：静止多久后踢一下、最多踢几次后判丢、救球冲量。 */
export declare const STUCK_RESCUE_S = 1.6;
export declare const STUCK_KICK_MAX = 3;
export declare const RESCUE_KICK = 320;
export type Pinball2Result = 'serving' | 'playing' | 'paused' | 'over';
export interface Ball2 {
    x: number;
    y: number;
    vx: number;
    vy: number;
}
/** 圆形得分柱（bumper 或小立柱）。 */
export interface Bumper2 {
    x: number;
    y: number;
    r: number;
    /** 得分（乘连击倍率前）。 */
    points: number;
    /** 最小外冲 px/s；立柱较小。 */
    kick: number;
    /** 再触发冷却剩余 s。 */
    cd: number;
}
export interface Wall2 {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}
export type Flipper2Side = 'left' | 'right';
export interface Flipper2 {
    side: Flipper2Side;
    px: number;
    py: number;
    len: number;
    /** 当前 / 静置 / 抬起角度（弧度，atan2 约定，+y 向下）。 */
    angle: number;
    rest: number;
    active: number;
    held: boolean;
    /** 当前角速度 rad/s，驱动接触点表面速度。 */
    omega: number;
}
export type Pinball2Event = {
    kind: 'serve';
    x: number;
    y: number;
} | {
    kind: 'bumper';
    x: number;
    y: number;
    mult: number;
} | {
    kind: 'post';
    x: number;
    y: number;
} | {
    kind: 'flipper';
    x: number;
    y: number;
} | {
    kind: 'comboReset';
} | {
    kind: 'drain';
} | {
    kind: 'rescue';
    x: number;
    y: number;
} | {
    kind: 'over';
};
export interface Pinball2State {
    result: Pinball2Result;
    /** 暂停前的阶段，恢复时还原。 */
    pausedFrom: Pinball2Result | null;
    score: number;
    ballsLeft: number;
    /** 当前连击数（bumper 连击链）。 */
    combo: number;
    ball: Ball2;
    flippers: {
        left: Flipper2;
        right: Flipper2;
    };
    bumpers: Bumper2[];
    walls: Wall2[];
    time: number;
    msg: string;
    msgTimer: number;
    /** 死球搜救计时与已踢次数。 */
    stuckT: number;
    stuckKicks: number;
    events: Pinball2Event[];
    rng: () => number;
}
/** mulberry32 种子随机数发生器。 */
export declare function mulberry32(seed: number): () => number;
/** 挡板枢轴（底部两侧，出球道在其外侧）。 */
export declare const LEFT_PIVOT: {
    x: number;
    y: number;
};
export declare const RIGHT_PIVOT: {
    x: number;
    y: number;
};
export declare function makeFlipper2(side: Flipper2Side): Flipper2;
/** 挡板在当前角度下的末端点。 */
export declare function flipper2Tip(f: Flipper2): {
    x: number;
    y: number;
};
/** 发球点：台顶中央。 */
export declare const BALL_SPAWN: {
    x: number;
    y: number;
};
/** 新建一局：serving 阶段，球停在发球点等待空格。 */
export declare function createGame2(seed: number): Pinball2State;
/** 重开一局：同一种子，清零比分与球数。 */
export declare function restart2(state: Pinball2State): void;
/**
 * 线段 (a→b) 上离 p 最近的点与距离平方（纯几何）。
 */
export declare function closestPointOnSegment2(px: number, py: number, ax: number, ay: number, bx: number, by: number): {
    x: number;
    y: number;
    d2: number;
};
/**
 * 圆 vs 点碰撞：把球沿接触法线推出，法向速度按恢复系数 e 反弹；
 * minKick > 0 时保证至少留这么大的向外法向速度（bumper 冲击），
 * 否则慢接近直接沉淀。就地修改 ball。
 * @returns 是否发生了接触。
 */
export declare function bounceOffPoint2(ball: Ball2, r: number, e: number, minKick: number, cx: number, cy: number): boolean;
/**
 * 球 vs 挡板胶囊（枢轴→末端线段加半径 FLIPPER_R）。接触点表面速度
 * ω×r 参与反弹：法向相对速度按恢复系数反射，再叠加一部分表面速度的
 * 法向分量 —— 上挥的挡板把球抛上去。接触即打断连击链。
 * @returns 是否发生了接触。
 */
export declare function resolveFlipper2(ball: Ball2, f: Flipper2, state: Pinball2State): boolean;
/** 按住 / 松开一侧挡板。 */
export declare function setFlipper2(state: Pinball2State, side: Flipper2Side, held: boolean): void;
/** 当前连击倍率（combo ≥1 时为 1..MAX_MULT）。 */
export declare function comboMult(combo: number): number;
/**
 * 发球：把 serving 阶段的球以带种子抖动的初速抛入台面。
 * @returns 是否成功发球（非 serving 阶段为 false）。
 */
export declare function serve(state: Pinball2State): boolean;
/**
 * 推进整个模拟 dt 秒（自适应固定子步）。仅在 playing 阶段模拟物理；
 * serving / paused / over 阶段只衰减提示计时。
 */
export declare function step2(state: Pinball2State, dt: number): void;
/** 暂停 / 继续（记录暂停前阶段，继续时还原）。 */
export declare function togglePause2(state: Pinball2State): void;
/** hashRun 的脚本输入：t 秒时刻执行动作 a。 */
export interface ScriptedInput2 {
    t: number;
    a: 'serve' | 'leftDown' | 'leftUp' | 'rightDown' | 'rightUp';
}
/**
 * 确定性校验：从新局出发按 60Hz 模拟 seconds 秒，按脚本施加输入，对球
 * 轨迹取哈希。同一种子 + 脚本必然得到同一哈希。
 */
export declare function hashRun2(seed: number, script: ScriptedInput2[], seconds: number): number;
