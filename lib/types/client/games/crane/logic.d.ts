/**
 * 起重机 Crane 纯逻辑：码头龙门吊码放（汉诺塔变体 + 抛物线物理）。
 * 吊钩随吊臂横向匀速往返（相位由种子决定），空格在吊钩位置抓取立柱
 * 顶部的集装箱；抓住的箱跟随摆动，再按空格按当前摆速抛下——箱沿
 * 抛物线坠落，落在柱容差内且"小上大下"合法则入柱（离柱心越近精准
 * 加成越高），落偏或压在更大的箱上则倒塔：失败 +1，箱退回原柱顶。
 * 全部箱按大小顺序（可再要求颜色分组）码到目标柱即过关，共 5 关
 * 递进（箱数 3→6、摆速加快、颜色分组）。所有随机来自注入的
 * mulberry32 种子流，同种子同输入完全可重放；渲染层只读状态，事件
 * 经 state.events 供渲染消费。
 */
/** 逻辑画布宽度（px）。 */
export declare const W = 640;
/** 逻辑画布高度（px）。 */
export declare const H = 560;
/** 三根立柱的圆心 x（索引 0 = 起始柱，2 = 目标柱）。 */
export declare const TOWER_X: readonly [130, 320, 510];
/** 目标柱索引。 */
export declare const TARGET = 2;
/** 地面 y（柱底 / 集装箱落地面，px）。 */
export declare const GROUND_Y = 470;
/** 吊臂横梁 y（px）。 */
export declare const BOOM_Y = 96;
/** 吊绳长度：吊钩悬挂高度 = BOOM_Y + ROPE_LEN（px）。 */
export declare const ROPE_LEN = 148;
/** 集装箱统一高度（px）。 */
export declare const BOX_H = 28;
/** 抓取容差：吊钩与柱心横向距离不超过该值才能抓（px）。 */
export declare const GRAB_TOL = 42;
/** 落柱容差：落点与柱心横向距离不超过该值才算入柱（px）。 */
export declare const LAND_TOL = 46;
/** 摆动中心 x 与振幅（px）：吊钩在 [mid-amp, mid+amp] 内往返。 */
export declare const SWING_MID = 320;
export declare const SWING_AMP = 238;
/** 基准摆动周期（ms；实际周期 = SWEEP_MS / 关卡速度）。 */
export declare const SWEEP_MS = 2600;
/** 抛物线重力加速度（px/s²）。 */
export declare const G = 1500;
/** 抛出水平初速 = 摆速 × 该系数（物理感：摆得越快甩得越远）。 */
export declare const THROW_VX_FACTOR = 0.9;
/** 关卡配置（箱数递增、摆速加快、后两关要求颜色分组）。 */
export interface CraneLevel {
    /** 本关集装箱数量。 */
    boxes: number;
    /** 摆速倍率（周期 = SWEEP_MS / speed）。 */
    speed: number;
    /** 过关是否额外要求同色箱在目标柱上连续。 */
    colorGroup: boolean;
}
/** 5 关递进配置。 */
export declare const LEVELS: readonly CraneLevel[];
/** 一只集装箱：size 越大箱越小（0 = 最大），宽随 size 递减。 */
export interface Box {
    /** 局内唯一 id。 */
    id: number;
    /** 大小序号：0 最大，越大越小（合法栈要求下层 size 更小）。 */
    size: number;
    /** 绘制宽度（px）。 */
    w: number;
    /** 颜色索引（取强调色）。 */
    color: number;
}
/** 逻辑向渲染广播的一次性事件。 */
export type CraneEvent = {
    type: 'grab';
    x: number;
    y: number;
    size: number;
} | {
    type: 'throw';
    x: number;
    y: number;
} | {
    type: 'land';
    x: number;
    y: number;
    tower: number;
    precision: number;
} | {
    type: 'topple';
    x: number;
    y: number;
    tower: number;
} | {
    type: 'splash';
    x: number;
    y: number;
} | {
    type: 'win';
    level: number;
    levelScore: number;
} | {
    type: 'levelStart';
    level: number;
} | {
    type: 'over';
    score: number;
};
/** 游戏阶段：待抓 → 携带 → 抛落 → 落定缓冲 → 过关切换 → 全部完成。 */
export type CranePhase = 'swing' | 'carry' | 'falling' | 'settle' | 'between' | 'over';
/** 抛落中的箱（物理积分状态）。 */
export interface FallingBox {
    box: Box;
    /** 箱左上角 x / y（px）。 */
    x: number;
    y: number;
    /** 水平 / 垂直速度（px/s）。 */
    vx: number;
    vy: number;
    /** 视觉旋转角（rad，渲染用）。 */
    spin: number;
}
/** 一局 crane 的全部可测状态。 */
export interface CraneState {
    /** 当前阶段。 */
    phase: CranePhase;
    /** 当前关卡（0 起）。 */
    level: number;
    /** 总分（过关累加）。 */
    score: number;
    /** 本关步数（每次抛下 +1）。 */
    steps: number;
    /** 本关失败次数（倒塔 / 落水）。 */
    fails: number;
    /** 本关精准加成累计（离柱心越近越高）。 */
    bonusTotal: number;
    /** 三根立柱：数组下 0 = 柱底，末位 = 柱顶。 */
    towers: Box[][];
    /** 抓住的箱（未抓为 null）。 */
    carried: Box | null;
    /** 抓取来源柱索引（失败退回该柱顶）。 */
    carryFrom: number;
    /** 吊臂摆动相位（rad，种子定初相）。 */
    hookPhase: number;
    /** 吊钩 x（px，step 内随相位刷新）。 */
    hookX: number;
    /** 吊钩水平速度（px/s，抛出初速来源）。 */
    hookVx: number;
    /** 抛落中的箱。 */
    fall: FallingBox | null;
    /** 落定缓冲剩余（ms，含落点供弹跳动画）。 */
    settle: {
        ms: number;
        x: number;
        y: number;
        tower: number;
        ok: boolean;
    } | null;
    /** 过关切换剩余（ms）。 */
    betweenMs: number;
    /** 最近一次入柱精准度（0..LAND_TOL）。 */
    lastPrecision: number;
    /** 事件队列（step 开头清空，渲染每帧消费）。 */
    events: CraneEvent[];
    /** 注入的随机流（配色 / 初相全部经由它）。 */
    rng: () => number;
    /** 关内时钟（ms）。 */
    timeMs: number;
    /** 装饰时钟（ms，渲染动画用）。 */
    animMs: number;
    /** 下一只箱 id。 */
    nextId: number;
}
/**
 * 确定性伪随机流（mulberry32）：同种子产生完全相同的 0..1 序列。
 * @param seed - 非负整数种子。
 * @returns 产生 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 箱宽随大小序号递减：size 0 最宽（px）。 */
export declare function boxWidth(size: number): number;
/** 柱顶表面 y（px）：空柱即地面。 */
export declare function stackTopY(tower: Box[]): number;
/**
 * 栈是否合法：自底向上 size 严格递增（大下小上）。
 * @param tower - 一根立柱的箱序列（下 0 .. 顶末）。
 */
export declare function isStackOrdered(tower: Box[]): boolean;
/**
 * 同色箱是否各自连续（颜色分组关的过关附加条件）。
 * @param tower - 一根立柱的箱序列。
 */
export declare function isColorGrouped(tower: Box[]): boolean;
/**
 * 过关判定：全部箱都在目标柱上、大下小上，且（该关要求时）同色连续。
 * @param state - 当前状态。
 */
export declare function isLevelWon(state: CraneState): boolean;
/**
 * 创建一局新状态：第 0 关、箱堆起始柱、吊臂初相由种子决定。
 * @param seed - 种子（与局号组合决定随机流）。
 * @param run - 局号（重开递增，避免同种子完全重演）。
 */
export declare function createCrane(seed: number, run?: number): CraneState;
/**
 * 推进一帧模拟：吊臂相位积分、抛落物理、落定缓冲与过关切换。事件
 * 写入 state.events（每帧开头清空）。
 * @param state - 当前状态。
 * @param dtMs - 帧时长（ms）。
 */
export declare function stepCrane(state: CraneState, dtMs: number): void;
/**
 * 玩家按空格 / 点击：swing 时抓取吊钩容差内最近非空柱的顶箱；carry
 * 时按当前摆速抛下；其余阶段忽略。
 * @param state - 当前状态。
 */
export declare function pressCrane(state: CraneState): void;
