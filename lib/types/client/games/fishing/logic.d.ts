/**
 * 悠闲钓鱼（Fishing）纯逻辑：一局 120 秒或断线 3 次结束。流程为
 * 待咬（idle）→ 咬钩窗口（bite）→ 搏斗（fight）→ 结算浮字，循环往复。
 * 鱼群由 seed+round 经 mulberry32 确定性生成：品种决定重量区间、拉力
 * 基础/波动频率、体力上限与分值系数（小鱼 1~3kg 温顺，鲨鱼 15~30kg
 * 狂暴）。搏斗阶段：按住 = 收线（距离减少、线张力随鱼瞬时拉力上升、
 * 鱼体力消耗），松开 = 张力回落、鱼按拉力缓慢逃跑；张力 ≥ 100 断线
 * （记 1 次失败），距离收到 0 即捕获（得分 = 重量 × 品种系数），
 * 距离超出上限则跑鱼。全部函数确定性可测，时间单位毫秒。
 */
/** 逻辑画布尺寸。 */
export declare const W = 480;
export declare const H = 600;
/** 水面分界线 y（上为天空，下为水下）。 */
export declare const WATER_Y = 140;
/** 一局时长 ms。 */
export declare const ROUND_MS = 120000;
/** 断线次数上限，达到即结束。 */
export declare const MAX_BREAKS = 3;
/** 咬钩窗口 ms：期间按住才能刺鱼进入搏斗。 */
export declare const BITE_MS = 1600;
/** 搏斗初始收线距离（"米"，渲染深度也用它）。 */
export declare const DIST_START = 100;
/** 跑线判定：距离超过该值则跑鱼。 */
export declare const DIST_ESCAPE = 135;
/** 张力上限，达到即断线。 */
export declare const TENSION_MAX = 100;
/** 收线速度 m/s（按住时距离减少速率）。 */
export declare const REEL_SPEED = 13;
/** 松开时张力回落速率 /s。 */
export declare const TENSION_FALL = 58;
/** 张力对拉力的增益系数（按住时张力变化 = (pull - REEL_EASE) * K）。 */
export declare const TENSION_GAIN = 1.9;
/** 按住时的张力缓解基值（拉力低于它收线反而降压）。 */
export declare const REEL_EASE = 22;
/** 按住时的张力保底增益（拉力再低也至少涨这么多/s）——死按不放必然断线，
 * 必须在张力高时松线回落，形成收-放节奏。 */
export declare const HOLD_MIN_GAIN = 7;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 1400;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 鱼种表：名称 / 重量区间 kg / 拉力基础 / 拉力波动角速度 / 体力 / 分值系数。索引即 kind。 */
export declare const FISH_KINDS: readonly [{
    readonly name: "小鲫鱼";
    readonly wMin: 1;
    readonly wMax: 3;
    readonly pull: 26;
    readonly omega: 1.6;
    readonly stamina: 34;
    readonly factor: 10;
}, {
    readonly name: "鲤鱼";
    readonly wMin: 3;
    readonly wMax: 8;
    readonly pull: 36;
    readonly omega: 2.1;
    readonly stamina: 55;
    readonly factor: 8;
}, {
    readonly name: "大嘴鲈";
    readonly wMin: 5;
    readonly wMax: 12;
    readonly pull: 44;
    readonly omega: 2.6;
    readonly stamina: 70;
    readonly factor: 9;
}, {
    readonly name: "金枪鱼";
    readonly wMin: 20;
    readonly wMax: 45;
    readonly pull: 62;
    readonly omega: 3;
    readonly stamina: 120;
    readonly factor: 12;
}, {
    readonly name: "灰鲨";
    readonly wMin: 15;
    readonly wMax: 30;
    readonly pull: 80;
    readonly omega: 3.8;
    readonly stamina: 105;
    readonly factor: 15;
}];
/** 咬钩的那条鱼（品种 + 确定性属性）。 */
export interface HookedFish {
    kind: number;
    /** 重量 kg（区间内确定性取值）。 */
    weight: number;
    /** 拉力正弦相位（波动起点）。 */
    phase: number;
    /** 剩余体力。 */
    stamina: number;
    /** 体力上限。 */
    staminaMax: number;
}
/** 阶段：待咬 / 咬钩窗口 / 搏斗 / 结束。 */
export type FishingPhase = 'idle' | 'bite' | 'fight' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type FishingEvent = {
    type: 'bite';
    x: number;
} | {
    type: 'hook';
    x: number;
} | {
    type: 'catch';
    x: number;
    y: number;
    kind: number;
    weight: number;
    points: number;
} | {
    type: 'break';
    x: number;
} | {
    type: 'escape';
    x: number;
};
/** 上浮渐隐的结算浮字（鱼名+重量+分 / 断线 / 跑鱼）。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 一局游戏的完整可测状态。 */
export interface FishingState {
    /** 回合内已流逝 ms。 */
    t: number;
    timeLeft: number;
    score: number;
    /** 已断线次数。 */
    breaks: number;
    /** 已捕获条数。 */
    catches: number;
    phase: FishingPhase;
    /** 待咬剩余 ms（倒计时到 0 触发咬钩）。 */
    waitMs: number;
    /** 咬钩窗口剩余 ms。 */
    biteMs: number;
    /** 搏斗中的鱼（fight 阶段非空）。 */
    fish: HookedFish | null;
    /** 搏斗内已流逝 ms（拉力波动钟）。 */
    fightT: number;
    /** 收线距离（越大越深；收到 0 捕获）。 */
    distance: number;
    /** 线张力 0~100。 */
    tension: number;
    /** 最近一次瞬时拉力 0~100（HUD / 渲染用）。 */
    pullNow: number;
    /** 玩家当前是否按住（step 入参的镜像，渲染用）。 */
    holding: boolean;
    events: FishingEvent[];
    floats: FloatText[];
    rng: () => number;
}
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createFishing(seed: number, round?: number): FishingState;
/** 浮标 x（画布中部固定，事件定位用）。 */
export declare const BOBBER_X: number;
/**
 * 鱼的瞬时拉力 0~100：品种基础 × 正弦波动 × 体力衰减，体力耗尽后只剩微弱死拽。
 * @param fish - 搏斗中的鱼。
 * @param fightT - 搏斗内毫秒钟。
 * @returns 瞬时拉力（0~100 标度）。
 */
export declare function pullOf(fish: HookedFish, fightT: number): number;
/**
 * 松开时鱼的逃跑速度 m/s：拉力越大跑越快，体力耗尽后近乎拖行。
 * @param fish - 搏斗中的鱼。
 * @param pull - 当前瞬时拉力。
 * @returns 距离增加速率。
 */
export declare function escapeSpeed(fish: HookedFish, pull: number): number;
/**
 * 捕获结算分：重量 × 品种系数。
 * @param fish - 被捕获的鱼。
 * @returns 得分。
 */
export declare function catchPoints(fish: HookedFish): number;
/**
 * 推进一帧：计时、待咬→咬钩→搏斗状态机、张力 / 距离 / 体力物理与结算。
 * 事件写入 state.events，调用方每帧消费（下一帧开头清空）。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param holding - 玩家当前是否按住（收线）。
 */
export declare function stepFishing(state: FishingState, dtMs: number, holding: boolean): void;
/**
 * 当前渲染深度 0~1（鱼影纵向位置）：距离越近水面越小。
 * @param state - 当前状态。
 * @returns 0（水面）~1（最深处）。
 */
export declare function depthOf(state: FishingState): number;
