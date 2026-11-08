/**
 * 节奏打击（Rhythm）纯逻辑：4 轨道下落式节奏游戏。谱面由注入 seed
 * 经 mulberry32 确定性生成（BPM 100-140，音符密度随时间上升，同轨道
 * 最小间隔 1.5 拍）；音符到达判定线时按键：PERFECT（±30ms）500 分 /
 * GOOD（±80ms）200 分，倍率随连击每 50 递增（x1→x4 封顶）；MISS 或
 * 漏接扣 1 命，共 3 命，命尽或谱面打完即结束。全部时间单位毫秒，
 * 状态只依赖 seed 与输入序列，可确定性重放。
 */
/** 逻辑画布尺寸（纵向下落区 + 顶部 HUD + 底部按键提示）。 */
export declare const W = 560;
export declare const H = 640;
/** 轨道数（D / F / J / K）。 */
export declare const LANE_COUNT = 4;
/** 谱面 BPM 区间。 */
export declare const MIN_BPM = 100;
export declare const MAX_BPM = 140;
/** 谱面总拍数（含 4 拍前导）。 */
export declare const CHART_BEATS = 128;
/** 前导拍数：第一颗音符之前的准备时间。 */
export declare const LEAD_IN_BEATS = 4;
/** 同轨道两颗音符的最小间隔（拍）。 */
export declare const MIN_LANE_GAP_BEATS = 1.5;
/** PERFECT 判定窗口（|Δ| ≤ 30ms）。 */
export declare const PERFECT_MS = 30;
/** GOOD 判定窗口（|Δ| ≤ 80ms）。 */
export declare const GOOD_MS = 80;
/** 超过音符时刻 +120ms 未击中即判 MISS（漏接）。 */
export declare const MISS_LATE_MS = 120;
/** PERFECT 基础分。 */
export declare const SCORE_PERFECT = 500;
/** GOOD 基础分。 */
export declare const SCORE_GOOD = 200;
/** 初始生命。 */
export declare const START_LIVES = 3;
/** 连击每达到 50 的倍数升一档倍率。 */
export declare const COMBO_STEP = 50;
/** 倍率上限 x4。 */
export declare const MAX_MULTIPLIER = 4;
/** 单颗音符的判定结果。 */
export type RhythmJudgement = 'perfect' | 'good' | 'miss';
/** 谱面音符：轨道 + 判定线时刻（judged 为运行态，生成时为 null）。 */
export interface RhythmNote {
    lane: number;
    timeMs: number;
    judged: RhythmJudgement | null;
}
/** 由 seed 确定性生成的谱面。 */
export interface RhythmChart {
    seed: number;
    bpm: number;
    /** 一拍的毫秒数。 */
    beatMs: number;
    notes: RhythmNote[];
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type RhythmEvent = {
    type: 'judge';
    judgement: RhythmJudgement;
    lane: number;
    delta: number;
    gained: number;
} | {
    type: 'over';
} | {
    type: 'complete';
    score: number;
};
/** 一局游戏的完整可测状态。 */
export interface RhythmState {
    /** 全局时钟 ms（从 0 起，第一颗音符前有前导时间）。 */
    t: number;
    seed: number;
    bpm: number;
    beatMs: number;
    notes: RhythmNote[];
    combo: number;
    maxCombo: number;
    score: number;
    lives: number;
    events: RhythmEvent[];
    over: boolean;
    /** 谱面全部判定完毕（命未尽）。 */
    finished: boolean;
}
/**
 * mulberry32 伪随机数生成器：seed 相同则序列完全相同，供谱面生成与
 * 测试确定性注入。
 * @param seed - 非负整数种子。
 * @returns 返回 [0, 1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 由 seed 确定性生成谱面：BPM 在 [100, 140]；从第 4 拍起逐拍按随进度
 * 上升的概率落音符，后半段再按概率补半拍音符；轨道从「距上次使用
 * 已满 1.5 拍」的候选里随机挑，保证同轨道最小间隔。
 * @param seed - 种子（32 位整数）。
 * @returns 谱面（音符按时刻升序）。
 */
export declare function createRhythmChart(seed: number): RhythmChart;
/**
 * 新开一局。
 * @param seed - 谱面种子；省略时取当前时间派生的整数。
 * @returns 初始状态（时钟为 0，尚无判定）。
 */
export declare function createRhythm(seed?: number): RhythmState;
/**
 * 当前连击对应的得分倍率：1 + floor(combo / 50)，封顶 x4。
 * @param combo - 当前连击数。
 * @returns 倍率（1-4）。
 */
export declare function comboMultiplier(combo: number): number;
/**
 * 玩家在指定轨道按键：取该轨道未判定且 |Δ| 最小的音符，|Δ| ≤ 30 为
 * PERFECT、≤ 80 为 GOOD（得分 = 基础分 × 当前倍率），窗口外忽略；
 * 命中连击 +1。
 * @param state - 目标状态。
 * @param lane - 轨道下标（0-3）。
 */
export declare function hitRhythm(state: RhythmState, lane: number): void;
/**
 * 推进一帧：时钟前进 dtMs，超过时刻 +120ms 仍未击中的音符判 MISS；
 * 全部音符判定完毕且命未尽则 finished 并发 complete 事件。事件写入
 * state.events，调用方每帧消费后在下一帧开头被清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepRhythm(state: RhythmState, dtMs: number): void;
