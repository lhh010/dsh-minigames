/**
 * N-Back 记忆训练纯逻辑：3×3 位置流（+后期的声音数字流）按固定节律逐个
 * 呈现刺激，玩家判断当前刺激是否与 N 步之前相同。全部随机由注入 seed 的
 * mulberry32 驱动，序列、计分、档位升降、节轮转与序列化重放均为确定性
 * 纯函数，可离线测试。
 */
/** 逻辑画布宽度（渲染层与本层共享的坐标系）。 */
export declare const LOGICAL_W = 480;
/** 逻辑画布高度。 */
export declare const LOGICAL_H = 340;
/** 3×3 网格共 9 个位置（0..8，行优先）。 */
export declare const GRID_CELLS = 9;
/** 每节 trial 数。 */
export declare const TRIALS_PER_SESSION = 20;
/** 每个 trial 的呈现时长（毫秒）。 */
export declare const TRIAL_MS = 2500;
/** trial 内格子点亮的时长（毫秒），其余时间为空档。 */
export declare const LIGHT_MS = 1200;
/** 命中加分。 */
export declare const SCORE_HIT = 10;
/** 误按扣分。 */
export declare const SCORE_FALSE = -5;
/** 漏按不扣分（常量仅作说明）。 */
export declare const SCORE_MISS = 0;
/** N 档上下限。 */
export declare const MAX_N = 3;
export declare const MIN_N = 1;
/** 节末准确率 ≥ 此值升一档。 */
export declare const PROMOTE_ACC = 0.8;
/** 节末准确率 < 此值降一档。 */
export declare const DEMOTE_ACC = 0.5;
/** 一局共几节。 */
export declare const SESSIONS_PER_GAME = 4;
/** 第几节（1 起）起启用双流（位置 + 声音数字）。 */
export declare const DUAL_FROM_SESSION = 3;
/** 反馈闪烁时长（秒）。 */
export declare const FLASH_S = 0.5;
/** 位置流约束：目标（与 N 步前相同）概率。 */
export declare const TARGET_RATE = 0.3;
/** 位置流约束：同一位置最多连续出现次数（防超长同格）。 */
export declare const MAX_RUN = 2;
/** 位置流约束：连续多少个非目标后强制插入一个目标（防过易）。 */
export declare const MAX_TARGET_GAP = 7;
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀分布的随机函数；同种子序列完全一致。
 */
export declare function mulberry32(seed: number): () => number;
/** 单条刺激流的生成约束。 */
export interface StreamConfig {
    /** 值域大小（位置流 9 格，声音流数字 1-9）。 */
    size: number;
    /** 目标（与 N 步前相同）概率。 */
    targetRate: number;
    /** 是否限制同一值连续出现的次数（位置流限制，声音流不限制）。 */
    avoidRuns: boolean;
}
/** 位置流（3×3 格）约束。 */
export declare const POSITION_STREAM: StreamConfig;
/** 声音流（数字 1-9）约束。 */
export declare const AUDIO_STREAM: StreamConfig;
/**
 * 生成一条刺激流：目标位（i ≥ n 时按概率或超长空档强制）取 i-n 位的值，
 * 非目标位避开 i-n 位的值（i ≥ n 时），avoidRuns 时同值连续不超过
 * MAX_RUN。拒绝采样用确定性 +1 回退，保证同 seed 完全可重放。
 * @param rng - 注入的随机函数。
 * @param count - trial 总数。
 * @param n - N-Back 的 N。
 * @param config - 流约束。
 * @returns 长度为 count 的值数组（位置 0..8；声音流调用方自行 +1 成数字）。
 */
export declare function generateStream(rng: () => number, count: number, n: number, config: StreamConfig): number[];
/** 一节的完整计划：位置序列 + 声音序列（单流模式声音序列生成但不启用）。 */
export interface SessionPlan {
    /** 本节使用的 N。 */
    n: number;
    /** 是否双流（位置 + 声音同时判定）。 */
    dual: boolean;
    /** 位置序列（0..8）。 */
    positions: number[];
    /** 声音数字序列（1..9）。 */
    digits: number[];
}
/**
 * 按节序号从 seed 派生该节计划：每节用 mulberry32(seed ^ (节序+1)*黄金比)
 * 独立取随机流，序列化重放时无需回放随机消费。
 * @param seed - 本局种子。
 * @param sessionIndex - 节序号（0 起）。
 * @param n - 本节 N 档。
 * @param dual - 是否双流。
 * @returns 该节的刺激计划。
 */
export declare function planSession(seed: number, sessionIndex: number, n: number, dual: boolean): SessionPlan;
/** 反馈类别：命中 / 误按 / 漏按。 */
export type FeedbackKind = 'hit' | 'false' | 'miss';
/** 单条流（位置或声音）的节内计数。 */
export interface StreamCounters {
    hits: number;
    misses: number;
    falseAlarms: number;
}
/** 一节结束的小结记录。 */
export interface SessionSummary {
    /** 本节 N 档。 */
    n: number;
    /** 本节是否双流。 */
    dual: boolean;
    /** 本节准确率（0..1）。 */
    accuracy: number;
    /** 节后决定的下一节 N 档。 */
    nextN: number;
}
/** 游戏阶段：trial 进行中 / 节间小结 / 一局结束。 */
export type NBackPhase = 'running' | 'summary' | 'over';
/** N-Back 完整可变状态（纯数据，可序列化）。 */
export interface NBackState {
    /** 本局种子（每节随机流由此派生）。 */
    seed: number;
    /** 当前 N 档。 */
    n: number;
    /** 本局到达过的最高 N 档。 */
    maxN: number;
    /** 节序号（0 起）。 */
    sessionIndex: number;
    /** 节内 trial 序号（0 起）。 */
    trialIndex: number;
    /** 当前 trial 已流逝毫秒。 */
    trialElapsed: number;
    /** 全局累计秒（动画用）。 */
    elapsed: number;
    phase: NBackPhase;
    /** 当前节计划。 */
    plan: SessionPlan;
    score: number;
    /** 小结阶段暂存的下一节 N 档（running/over 阶段无意义）。 */
    pendingN: number;
    /** 本 trial 位置流是否已作答。 */
    respondedPosition: boolean;
    /** 本 trial 声音流是否已作答。 */
    respondedAudio: boolean;
    /** 位置流节内计数。 */
    positionCounters: StreamCounters;
    /** 声音流节内计数。 */
    audioCounters: StreamCounters;
    /** 全局（跨节跨流）计数。 */
    total: StreamCounters;
    /** 位置流反馈闪烁剩余秒。 */
    flashPosition: number;
    /** 声音流反馈闪烁剩余秒。 */
    flashAudio: number;
    flashPositionKind: FeedbackKind | null;
    flashAudioKind: FeedbackKind | null;
    /** 已完成各节的小结。 */
    history: SessionSummary[];
}
/**
 * 某节序号（0 起）是否为双流（位置 + 声音）。
 * @param sessionIndex - 节序号（0 起）。
 * @returns 双流返回 true。
 */
export declare function isDualSession(sessionIndex: number): boolean;
/**
 * 生成初始状态：第 1 节、N=1、单流。
 * @param seed - 种子（默认取当前时间，测试必须显式传入）。
 * @returns 初始 NBackState。
 */
export declare function createNBackState(seed?: number): NBackState;
/**
 * 当前 trial 的位置是否与 N 步前相同（前 n 个 trial 无参照，恒 false）。
 * @param state - 当前状态。
 * @returns 相同返回 true。
 */
export declare function isPositionMatch(state: NBackState): boolean;
/**
 * 当前 trial 的声音数字是否与 N 步前相同（单流模式恒 false）。
 * @param state - 当前状态。
 * @returns 双流且相同时返回 true。
 */
export declare function isAudioMatch(state: NBackState): boolean;
/**
 * 玩家对当前 trial 作答：命中 +10；不匹配时误按 -5（前 n 个 trial 无参照，
 * 作答同样记误按）。同一流同一 trial 只记第一次；非 running 阶段或单流模式
 * 按声音均忽略。
 * @param state - 当前状态。
 * @param stream - 作答的流。
 * @returns 'hit' | 'false'，忽略时 null。
 */
export declare function respond(state: NBackState, stream: 'position' | 'audio'): FeedbackKind | null;
/**
 * 计数流的准确率：命中 / (命中 + 漏按 + 误按)，无判定时为 0。
 * @param counters - 计数流。
 * @returns 0..1 的准确率。
 */
export declare function streamAccuracy(counters: StreamCounters): number;
/**
 * 当前节准确率（位置 + 声音合并）。
 * @param state - 当前状态。
 * @returns 0..1 的节内准确率。
 */
export declare function sessionAccuracy(state: NBackState): number;
/**
 * 全局准确率（跨节跨流）。
 * @param state - 当前状态。
 * @returns 0..1 的总准确率。
 */
export declare function overallAccuracy(state: NBackState): number;
/**
 * 按节末准确率决定下一节 N 档：≥ PROMOTE_ACC 升一档（封顶 MAX_N），
 * < DEMOTE_ACC 降一档（保底 MIN_N），其余保持。
 * @param n - 本节 N 档。
 * @param accuracy - 本节准确率。
 * @returns 下一节 N 档。
 */
export declare function nextLevel(n: number, accuracy: number): number;
/**
 * 小结后进入下一节：应用 pendingN（并更新 maxN），换新计划与计数。
 * 仅在 summary 阶段有效。
 * @param state - 当前状态。
 * @returns 是否成功推进。
 */
export declare function advanceSession(state: NBackState): boolean;
/**
 * 推进一帧：衰减反馈闪烁；running 时累计 trial 计时，trial 到期先结算漏按
 * 再切下一个 trial；一节最后一个 trial 结束后进入 summary/over。
 * @param state - 当前状态。
 * @param dt - 帧间隔秒。
 */
export declare function tickNBack(state: NBackState, dt: number): void;
/**
 * 序列化快照：纯 JSON 数据，用于重放/持久化。
 * @param state - 当前状态。
 * @returns 可 JSON 化的快照对象。
 */
export interface NBackSnapshot {
    seed: number;
    n: number;
    maxN: number;
    sessionIndex: number;
    trialIndex: number;
    trialElapsed: number;
    elapsed: number;
    phase: NBackPhase;
    pendingN: number;
    score: number;
    respondedPosition: boolean;
    respondedAudio: boolean;
    positionCounters: StreamCounters;
    audioCounters: StreamCounters;
    total: StreamCounters;
    history: SessionSummary[];
    plan: SessionPlan;
}
export declare function serializeNBack(state: NBackState): NBackSnapshot;
/**
 * 从快照重建状态（后续各节随机流仍由 seed 派生，重放确定）。
 * @param snapshot - serializeNBack 的输出。
 * @returns 重建的 NBackState。
 */
export declare function deserializeNBack(snapshot: NBackSnapshot): NBackState;
