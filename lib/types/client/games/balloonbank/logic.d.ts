/**
 * 气球银行（BalloonBank）纯逻辑：打气押注 push-your-luck。每轮一只
 * 气球：空格打气一次，本轮潜在奖金翻倍（10→20→40…）；Enter 兑现把
 * 潜在奖金存入银行；打气次数达到隐藏爆炸阈值（由注入 seed 派生，位
 * 于第 4-12 次之间，轮次越靠后、关卡越靠后阈值分布越低）则爆炸，本
 * 轮奖金归零。10 轮一关，关末银行余额 ≥ 目标即过关（共 5 关递进），
 * 否则整局失败。所有随机只来自注入 seed（mulberry32），同 seed 同操
 * 作序列必然得到同一状态，可脱离 DOM 确定性重放。
 */
/** 逻辑画布尺寸（含顶部 HUD、左右侧栏与底部速览条）。 */
export declare const W = 640;
export declare const H = 480;
/** 每关轮数。 */
export declare const ROUNDS_PER_LEVEL = 10;
/** 总关数。 */
export declare const LEVEL_COUNT = 5;
/** 第 0 次打气（未打）时的基础潜在奖金。 */
export declare const BASE_PAYOUT = 10;
/** 爆炸阈值下限：最早第 4 次打气就可能爆炸。 */
export declare const THRESHOLD_MIN = 4;
/** 爆炸阈值基准上限：第 12 次。 */
export declare const THRESHOLD_MAX_BASE = 12;
/** 阈值保底下限之上的最低上限（上限永远比下限多出安全空间）。 */
export declare const THRESHOLD_MAX_FLOOR = 6;
/** 各关过关目标总分（递进）。 */
export declare const LEVEL_TARGETS: readonly number[];
/**
 * mulberry32 确定性伪随机数发生器（与 blackjack/balloon 同构造）。
 * @param seed - 32 位种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 关号与轮号混合进种子：同 seed 不同 (level, round) 得到独立阈值。
 * @param seed - 对局种子。
 * @param level - 关号（1 起）。
 * @param round - 轮号（1 起）。
 * @returns 该轮专属的 32 位种子。
 */
export declare function roundSeed(seed: number, level: number, round: number): number;
/**
 * 后期轮次的阈值上限削减量：第 1-4 轮不减，第 5-8 轮减 1，第 9-10 轮
 * 减 2——一轮 10 次里越到后面越险。
 * @param round - 轮号（1 起，越界收敛）。
 * @returns 削减量（0..2）。
 */
export declare function roundPenalty(round: number): number;
/**
 * 后两关的阈值上限整体削减量：第 4 关减 1、第 5 关减 2，分布更低。
 * @param level - 关号（1 起，越界收敛）。
 * @returns 削减量（0..2）。
 */
export declare function lateLevelPenalty(level: number): number;
/**
 * 指定关/轮的阈值上限：12 − 轮次削减 − 关卡削减，下限 6。
 * @param level - 关号（1 起）。
 * @param round - 轮号（1 起）。
 * @returns 阈值上限（打气次数）。
 */
export declare function thresholdMax(level: number, round: number): number;
/**
 * 指定关/轮的爆炸阈值：mulberry32(seed, level, round) 派生，均匀落在
 * [THRESHOLD_MIN, thresholdMax] 内——玩家只知分布区间，不知确切值。
 * @param seed - 对局种子。
 * @param level - 关号（1 起）。
 * @param round - 轮号（1 起）。
 * @returns 爆炸阈值（第几次打气爆炸）。
 */
export declare function thresholdFor(seed: number, level: number, round: number): number;
/**
 * 打气 pumps 次后的潜在奖金：10 × 2^pumps。
 * @param pumps - 打气次数（0 起）。
 * @returns 潜在奖金。
 */
export declare function payout(pumps: number): number;
/**
 * 第 level 关的过关目标总分。
 * @param level - 关号（1 起，越界取边界）。
 * @returns 目标总分。
 */
export declare function levelTarget(level: number): number;
/**
 * 「再打一次就收」的期望值：阈值均匀分布于 [min,max] 时，多打一次
 * 存活（阈值 > pumps+1）的概率 × 存活后的潜在奖金；必定爆炸时为 0。
 * @param pumps - 当前打气次数。
 * @param min - 阈值区间下限。
 * @param max - 阈值区间上限。
 * @returns 期望奖金。
 */
export declare function evNextPump(pumps: number, min: number, max: number): number;
/** 单步内产生、供渲染层消费的可视事件。 */
export type BalloonBankEvent = {
    type: 'pump';
    pumps: number;
    potential: number;
} | {
    type: 'cash';
    round: number;
    pumps: number;
    gained: number;
    bank: number;
} | {
    type: 'pop';
    round: number;
    pumps: number;
    threshold: number;
} | {
    type: 'levelup';
    level: number;
    bank: number;
} | {
    type: 'levelFail';
    level: number;
    bank: number;
    target: number;
} | {
    type: 'runComplete';
    bank: number;
};
/** 一轮的结算记录（供历史气压计复盘）。 */
export interface RoundRecord {
    /** 轮号（1 起）。 */
    round: number;
    /** 结束时的打气次数（爆掉时即爆炸那次）。 */
    pumps: number;
    /** 是否爆炸。 */
    popped: boolean;
    /** 存入银行的奖金（爆炸为 0）。 */
    banked: number;
    /** 该轮隐藏阈值（结算后揭晓，供复盘）。 */
    threshold: number;
}
/** 轮末复盘数据：兑现/爆炸后「如果继续打」的推演。 */
export interface ReviewInfo {
    /** 本轮存入金额（爆炸为 0）。 */
    banked: number;
    /** 结束时的打气次数。 */
    pumps: number;
    /** 该轮阈值。 */
    threshold: number;
    /** 再打一次的潜在奖金（未爆前提下）。 */
    nextPayout: number;
    /** 打到阈值前一刻（第 threshold-1 次）的最大可得奖金。 */
    maxPayout: number;
    /** 结束时刻「再打一次就收」的期望值。 */
    evNext: number;
}
/** 对局阶段。 */
export type BalloonBankPhase = 'pumping' | 'review' | 'levelup' | 'gameover' | 'gamewin';
/** 一局游戏的完整可测状态。 */
export interface BalloonBankState {
    /** 对局种子（阈值的唯一随机源）。 */
    seed: number;
    /** 当前关号（1..LEVEL_COUNT）。 */
    level: number;
    /** 当前轮号（1..ROUNDS_PER_LEVEL）。 */
    round: number;
    /** 本轮已打气次数。 */
    pumps: number;
    /** 本轮潜在奖金（= payout(pumps)）。 */
    potential: number;
    /** 本关银行余额（各轮兑现累计）。 */
    bank: number;
    /** 各已完成关的银行余额。 */
    levelBanks: number[];
    /** 本关每轮结算记录（历史气压计数据源）。 */
    history: RoundRecord[];
    /** 当前轮隐藏阈值（逻辑判定用；渲染仅用于复盘揭晓）。 */
    threshold: number;
    /** 轮末复盘（phase === 'review' 时非空）。 */
    review: ReviewInfo | null;
    phase: BalloonBankPhase;
    events: BalloonBankEvent[];
}
/**
 * 新开一局（第 1 关第 1 轮）。
 * @param seed - 对局种子。
 * @returns 初始状态。
 */
export declare function createBalloonBank(seed: number): BalloonBankState;
/**
 * 复盘后的推进：轮次未满则开下一轮（阈值按 seed 重派生）；第 10 轮结
 * 束则结算本关——达标进下一关（第 5 关达标则整局胜利），未达标整局
 * 失败。
 * @param state - 目标状态。
 */
export declare function advance(state: BalloonBankState): void;
/**
 * 过关确认后的开新关：银行清零、历史清空、轮次复位。
 * @param state - 目标状态。
 */
export declare function beginLevel(state: BalloonBankState): void;
/**
 * 打气：pumping 阶段打一次气（达到阈值即爆、进入复盘）；review 阶段
 * 等同推进下一轮；levelup 阶段等同开新关；结束阶段忽略。
 * @param state - 目标状态。
 */
export declare function pump(state: BalloonBankState): void;
/**
 * 兑现：把当前潜在奖金存入银行并进入复盘；非 pumping 阶段忽略。
 * @param state - 目标状态。
 */
export declare function cash(state: BalloonBankState): void;
/**
 * 本关还差多少分过关（负数表示已达标）。
 * @param state - 目标状态。
 * @returns 目标 − 银行余额。
 */
export declare function remaining(state: BalloonBankState): number;
/**
 * 本关历史中已爆气球的爆炸打气次数列表（历史气压计直方图数据）。
 * @param state - 目标状态。
 * @returns 爆炸记录的打气次数升序列表。
 */
export declare function popCounts(state: BalloonBankState): number[];
