/**
 * 切水果（Fruit Slash）纯逻辑：60 秒一回合，水果从底部按抛物线成波抛出
 * （重力恒定，初速度由 mulberry32(seed, round) 确定性生成，约 15% 是炸弹）。
 * 指针按住划动产生刀光轨迹，最近约 120ms 的轨迹线段扫到水果即切开：
 * +10 分并有连击加成；切到炸弹 -1 命、清屏并扣分；水果落出底部未切计一次
 * missed，missed 满 3 次再 -1 命。分数越高关卡越高，波次更密、上抛更快。
 * 全部状态可测：时间单位毫秒，物理单位 px / s。
 */
/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export declare const W = 480;
export declare const H = 600;
export declare const HUD_H = 30;
/** 重力加速度，px/s^2。 */
export declare const GRAVITY = 640;
/** 回合时长 ms。 */
export declare const ROUND_MS = 60000;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 漏接多少次扣一条命。 */
export declare const MISS_LIMIT = 3;
/** 新抛出物体是炸弹的概率。 */
export declare const BOMB_CHANCE = 0.15;
/** 切开一个水果的基础分。 */
export declare const SLICE_SCORE = 10;
/** 连击窗口 ms：窗口内再切则连击 +1。 */
export declare const COMBO_WINDOW_MS = 900;
/** 连击加成上限（封顶后每刀固定加成）。 */
export declare const COMBO_CAP = 8;
/** 轨迹保留时长 ms。 */
export declare const TRAIL_MS = 120;
/** 轨迹点数上限（超出丢最旧）。 */
export declare const TRAIL_MAX = 24;
/** 切到炸弹的扣分。 */
export declare const BOMB_PENALTY = 50;
/** 炸弹爆炸红闪时长 ms。 */
export declare const FLASH_MS = 300;
/** 半块水果最长存活 ms。 */
export declare const HALF_LIFE_MS = 900;
/** 每 100 分升一级。 */
export declare const SCORE_PER_LEVEL = 100;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 水果种类表：主色 / 半块内色 / 半径 px。索引即 kind。 */
export declare const FRUIT_KINDS: readonly [{
    readonly color: "#e5484d";
    readonly inner: "#ffd9d0";
    readonly r: 20;
}, {
    readonly color: "#ff9330";
    readonly inner: "#ffc98a";
    readonly r: 18;
}, {
    readonly color: "#ffd23f";
    readonly inner: "#fff0a8";
    readonly r: 15;
}, {
    readonly color: "#3caa5f";
    readonly inner: "#f26d7d";
    readonly r: 26;
}, {
    readonly color: "#8f6fd3";
    readonly inner: "#d9c6ff";
    readonly r: 17;
}];
/** 一个在空中的水果或炸弹。 */
export interface Fruit {
    kind: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    bomb: boolean;
}
/** 切开后飞散的半块水果。 */
export interface Half {
    kind: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    rot: number;
    vrot: number;
    life: number;
    /** 1 = 右半 / -1 = 左半，决定飞散方向与绘制相位。 */
    side: 1 | -1;
}
/** 刀光轨迹点；t 为回合内毫秒钟。 */
export interface TrailPoint {
    x: number;
    y: number;
    t: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type SlashEvent = {
    type: 'slice';
    x: number;
    y: number;
    kind: number;
} | {
    type: 'bomb';
    x: number;
    y: number;
};
/** 一局游戏的完整可测状态。 */
export interface FruitSlashState {
    /** 回合内已流逝 ms。 */
    t: number;
    timeLeft: number;
    score: number;
    lives: number;
    missed: number;
    combo: number;
    /** 连击失效时刻 ms（回合钟）。 */
    comboExpire: number;
    fruits: Fruit[];
    halves: Half[];
    trail: TrailPoint[];
    events: SlashEvent[];
    rng: () => number;
    /** 下一波抛出的时刻 ms。 */
    nextWaveAt: number;
    /** 炸弹红闪剩余 ms。 */
    flashMs: number;
    over: boolean;
}
/**
 * 当前难度关卡：随分数线性提升。
 * @param score - 当前累计分。
 * @returns 从 1 开始的关卡号。
 */
export declare function levelOf(score: number): number;
/**
 * 波次间隔 ms：1 级 1700ms，每级 -130ms，下限 550ms。
 * @param level - 当前关卡。
 * @returns 相邻两波抛出的间隔毫秒。
 */
export declare function waveInterval(level: number): number;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createFruitSlash(seed: number, round?: number): FruitSlashState;
/**
 * 指针按下 / 移动时记录刀光轨迹点。
 * @param state - 目标状态。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export declare function pushTrail(state: FruitSlashState, x: number, y: number): void;
/**
 * 推进一帧：计时、成波抛出、物理、轨迹切割判定、漏接与结算。
 * 事件写入 state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepFruitSlash(state: FruitSlashState, dtMs: number): void;
