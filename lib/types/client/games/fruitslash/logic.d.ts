/**
 * 切水果（Fruit Slash）纯逻辑：60 秒一回合，水果从底部按抛物线成波抛出
 * （重力恒定，初速度由 mulberry32(seed, round) 确定性生成）。共 8 种水果，
 * 越小分越高；炸弹概率随关卡从 15% 升至 30%，高关卡还会出现一屏多弹的
 * "炸弹链"。指针按住划动产生刀光轨迹，最近约 120ms 的轨迹线段扫到水果
 * 即切开并得分；切到炸弹 -1 命、清屏并扣分；水果落出底部未切（missed）
 * 直接 -1 命并累计 missed 计数，共 5 条命。一次挥刀（pointerdown→up）内切开
 * ≥2 个同种水果触发同种连击奖励，切开 N 个时整刀得分上浮；奖励由
 * settleSwipe 纯函数结算并产生飘字。时间单位毫秒，物理单位 px / s。
 */
/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export declare const W = 480;
export declare const H = 600;
export declare const HUD_H = 30;
/** 重力加速度，px/s^2。 */
export declare const GRAVITY = 640;
/** 回合时长 ms。 */
export declare const ROUND_MS = 60000;
/** 初始生命（漏接直接扣 1 命，故给 5 条）。 */
export declare const START_LIVES = 5;
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
/** 同种连击奖励比例：同刀 ≥2 个同种水果时，每个按种类分值 ×0.5 加奖。 */
export declare const SAME_KIND_BONUS_RATE = 0.5;
/** 一刀多切上浮比例：切开 N 个时整刀得分 ×(1 + 0.1×(N-1))。 */
export declare const MULTI_CUT_RATE = 0.1;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 900;
/** 炸弹链出现的最低关卡。 */
export declare const BOMB_CHAIN_MIN_LEVEL = 4;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 水果种类表：名称 / 主色 / 半块内色 / 半径 px / 分值。索引即 kind。
 * 越小的水果分值越高（西瓜 +5、苹果/橙子/桃子 +10、柠檬/葡萄/草莓 +15、猕猴桃 +20）。
 */
export declare const FRUIT_KINDS: readonly [{
    readonly name: "西瓜";
    readonly color: "#3caa5f";
    readonly inner: "#f26d7d";
    readonly r: 30;
    readonly score: 5;
}, {
    readonly name: "苹果";
    readonly color: "#e5484d";
    readonly inner: "#ffd9d0";
    readonly r: 20;
    readonly score: 10;
}, {
    readonly name: "橙子";
    readonly color: "#ff9330";
    readonly inner: "#ffc98a";
    readonly r: 18;
    readonly score: 10;
}, {
    readonly name: "桃子";
    readonly color: "#ffb0c4";
    readonly inner: "#ffe3d0";
    readonly r: 22;
    readonly score: 10;
}, {
    readonly name: "柠檬";
    readonly color: "#ffd23f";
    readonly inner: "#fff0a8";
    readonly r: 15;
    readonly score: 15;
}, {
    readonly name: "葡萄";
    readonly color: "#8f6fd3";
    readonly inner: "#d9c6ff";
    readonly r: 17;
    readonly score: 15;
}, {
    readonly name: "草莓";
    readonly color: "#e5486f";
    readonly inner: "#ffe0e6";
    readonly r: 12;
    readonly score: 15;
}, {
    readonly name: "猕猴桃";
    readonly color: "#8a9b3d";
    readonly inner: "#c7e08a";
    readonly r: 14;
    readonly score: 20;
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
/** 上浮渐隐的飘字（同种连击 / 一刀多切提示）。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 一次挥刀（pointerdown→up）期间累计的切果记录。 */
export interface SwipeCut {
    kind: number;
    x: number;
    y: number;
}
/** settleSwipe 的结算结果（纯数据，便于测试）。 */
export interface SwipeSettle {
    /** 本刀切果总数。 */
    cuts: number;
    /** 切果时已立即入账的基础分（含连击加成）。 */
    base: number;
    /** 同种连击奖励分。 */
    sameKindBonus: number;
    /** 一刀多切上浮奖励分（乘数带来的增量）。 */
    multiBonus: number;
    /** 本刀最终总收益 = base + sameKindBonus + multiBonus。 */
    total: number;
}
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
    floats: FloatText[];
    rng: () => number;
    /** 下一波抛出的时刻 ms。 */
    nextWaveAt: number;
    /** 炸弹红闪剩余 ms。 */
    flashMs: number;
    /** 当前是否处于一次挥刀中。 */
    swiping: boolean;
    /** 本次挥刀已切开的水果记录。 */
    swipeCuts: SwipeCut[];
    /** 本次挥刀已立即入账的基础分。 */
    swipeBase: number;
    over: boolean;
}
/**
 * 当前难度关卡：随分数线性提升。
 * @param score - 当前累计分。
 * @returns 从 1 开始的关卡号。
 */
export declare function levelOf(score: number): number;
/**
 * 波次间隔 ms：1 级 1500ms，每级 -160ms，下限 420ms（比旧版更密）。
 * @param level - 当前关卡。
 * @returns 相邻两波抛出的间隔毫秒。
 */
export declare function waveInterval(level: number): number;
/**
 * 新抛出物体是炸弹的概率：1 级 15%，每级 +2%，封顶 30%。
 * @param level - 当前关卡。
 * @returns 该关卡单个物体为炸弹的概率。
 */
export declare function bombChance(level: number): number;
/**
 * 炸弹链触发概率：4 级起从 0 升到封顶 25%，触发时一屏额外连抛多颗炸弹。
 * @param level - 当前关卡。
 * @returns 该关卡一波触发炸弹链的概率。
 */
export declare function bombChainChance(level: number): number;
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createFruitSlash(seed: number, round?: number): FruitSlashState;
/**
 * 开始一次挥刀（pointerdown 时调用）：丢弃上一刀残留并开始累计。
 * @param state - 目标状态。
 */
export declare function beginSwipe(state: FruitSlashState): void;
/**
 * 结算一次挥刀（pointerup 时调用）的奖励，纯函数：
 * 切果基础分在切开瞬间已入账，这里补算同种连击奖励与多切上浮，
 * 把增量加进 score、生成飘字并清空挥刀累计。
 * @param state - 目标状态（就地更新 score / floats / 挥刀字段）。
 * @returns 本刀的统计与奖励明细。
 */
export declare function settleSwipe(state: FruitSlashState): SwipeSettle;
/**
 * 指针按下 / 移动时记录刀光轨迹点。
 * @param state - 目标状态。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export declare function pushTrail(state: FruitSlashState, x: number, y: number): void;
/**
 * 推进一帧：计时、成波抛出、物理、轨迹切割判定、漏接、飘字与结算。
 * 事件写入 state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepFruitSlash(state: FruitSlashState, dtMs: number): void;
