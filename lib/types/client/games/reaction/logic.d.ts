/**
 * 极速反应（Reaction）纯逻辑：多轮信号反应测试。每轮先进入「等待」
 * （随机时长），随后点亮「信号」——玩家在信号出现后立刻按键，反应毫秒
 * 数即得分依据：越快分越高。信号前按键为抢按（-1 命，本轮重试），
 * 信号后超过时限未按为超时（-1 命，本轮作废）。共 3 命 10 轮：命尽或
 * 轮次打完即结束。全部时间单位毫秒；等待时长由构造时注入的延迟表
 * 按序取值（默认随机生成），测试传入固定表即可完全确定地复现整局。
 */
/** 逻辑画布尺寸（含顶部 HUD 与底部轮次进度区域）。 */
export declare const W = 640;
export declare const H = 440;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 总轮数。 */
export declare const ROUND_COUNT = 10;
/** 信号出现后的反应时限 ms：超时判负。 */
export declare const GO_LIMIT_MS = 1200;
/** 每轮结果（命中 / 抢按 / 超时）的展示时长 ms，随后进入下一轮。 */
export declare const FEEDBACK_MS = 900;
/** 默认延迟表的等待时长区间 ms。 */
export declare const MIN_WAIT_MS = 800;
export declare const MAX_WAIT_MS = 2600;
/** 命中得分下限。 */
export declare const HIT_SCORE_MIN = 10;
/** 命中得分基数：HIT_SCORE_BASE - ms * HIT_SCORE_MS_FACTOR，下限 HIT_SCORE_MIN。 */
export declare const HIT_SCORE_BASE = 600;
export declare const HIT_SCORE_MS_FACTOR = 0.5;
/** 一轮所处的阶段。 */
export type ReactionPhase = 'wait' | 'go' | 'feedback' | 'over';
/** 单步内产生、供渲染层消费的可视事件。 */
export type ReactionEvent = {
    type: 'signal';
} | {
    type: 'hit';
    ms: number;
    gained: number;
} | {
    type: 'foul';
} | {
    type: 'miss';
} | {
    type: 'over';
} | {
    type: 'complete';
    score: number;
};
/** 一局游戏的完整可测状态。 */
export interface ReactionState {
    /** 全局动画时钟 ms（渲染动画用）。 */
    t: number;
    /** 当前阶段。 */
    phase: ReactionPhase;
    /** 当前阶段已经过的 ms。 */
    phaseMs: number;
    /** 当前轮等待时长 ms（到点切换到信号）。 */
    waitMs: number;
    /** feedback 阶段的结果种类（其余阶段为 null）。 */
    feedback: 'hit' | 'foul' | 'miss' | null;
    /** 已完成（命中或超时作废）的轮数；抢按不推进。 */
    roundIndex: number;
    /** 逐轮结果（长度 = roundIndex；'hit' 或 'miss'，抢按不记录）。 */
    results: Array<'hit' | 'miss'>;
    /** 延迟表取值游标（抢按重试也换下一个延迟）。 */
    scheduleIndex: number;
    /** 注入的等待延迟表（循环取值）。 */
    delays: number[];
    lives: number;
    score: number;
    /** 命中次数。 */
    hits: number;
    /** 命中反应时间总和 ms（求平均用）。 */
    totalMs: number;
    /** 本次会话最快单轮反应毫秒（无则 null）。 */
    bestMs: number | null;
    /** 最近一轮的反应毫秒（渲染结果用；抢按/超时清空）。 */
    lastMs: number | null;
    events: ReactionEvent[];
    over: boolean;
    /** 全部轮次打完（命未尽）。 */
    complete: boolean;
}
/**
 * 新开一局。
 * @param delays - 等待延迟表 ms（循环取值；省略或空表则随机生成 ROUND_COUNT 个）。
 * @param bestMs - 跨局保留的最快反应毫秒（可省略）。
 * @returns 初始状态（第一轮已处于等待阶段）。
 */
export declare function createReaction(delays?: number[], bestMs?: number | null): ReactionState;
/**
 * 命中一轮的得分：HIT_SCORE_BASE - ms * HIT_SCORE_MS_FACTOR，下限
 * HIT_SCORE_MIN——200ms 得 500 分、600ms 得 300 分、满时限触底。
 * @param ms - 反应毫秒。
 * @returns 该轮得分。
 */
export declare function roundScore(ms: number): number;
/**
 * 命中轮的平均反应毫秒。
 * @param state - 当前状态。
 * @returns 平均值；尚无命中时为 null。
 */
export declare function averageMs(state: ReactionState): number | null;
/**
 * 玩家按键：等待阶段为抢按（-1 命、本轮原轮重试），信号阶段记一次
 * 命中（反应毫秒 = 信号亮起至今的阶段计时），其余阶段忽略。
 * @param state - 目标状态。
 */
export declare function pressReaction(state: ReactionState): void;
/**
 * 推进一帧：等待到点点亮信号，信号超时判负（-1 命、本轮作废推进），
 * 结果展示到点进入下一轮。事件写入 state.events，调用方每帧消费后由
 * 本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepReaction(state: ReactionState, dtMs: number): void;
