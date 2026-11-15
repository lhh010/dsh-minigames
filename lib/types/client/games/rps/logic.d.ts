/**
 * 猜拳心理战纯逻辑：15 轮制石头剪刀布的规则判定、一阶/二阶马尔可夫
 * 转移表（AI 记住「你出 A 之后常出 B」）、随轮数爬坡的学习率（前 5 轮
 * 基本随机，之后越来越准）、50% 真话的「说漏嘴」提示、连赢加成计分与
 * 完整对局流程。全部状态走注入 seed（mulberry32），确定性可重放。
 */
/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export declare function mulberry32(seed: number): () => number;
/** 拳种编号：0=石头 1=剪刀 2=布（克制关系 (a+1)%3===b 即 a 胜 b）。 */
export type Hand = 0 | 1 | 2;
/** 全部拳种，按编号顺序。 */
export declare const HANDS: readonly Hand[];
/** 拳种中文名（提示文案与复盘气泡用）。 */
export declare const HAND_LABELS: readonly string[];
/** 单轮胜负（玩家视角）。 */
export type Outcome = 'win' | 'draw' | 'loss';
/** 一轮的完整复盘信息。 */
export interface RpsRoundResult {
    /** 本轮序号（1 起）。 */
    round: number;
    /** 玩家出的拳。 */
    player: Hand;
    /** AI 出的拳（克制它预测的拳）。 */
    ai: Hand;
    /** AI 赛前对玩家本拳的预测。 */
    predicted: Hand;
    outcome: Outcome;
    /** 本轮得分增量（含连赢加成）。 */
    gained: number;
    /** 玩家是否被读心（预测 === 实际出拳）。 */
    wasRead: boolean;
}
/** AI「说漏嘴」的一句模糊提示（每 3 轮一句）。 */
export interface RpsHint {
    /** 提示原文。 */
    text: string;
    /** 是否真话（声称的拳 === AI 真正的预测）。 */
    truthful: boolean;
    /** 声称玩家接下来会出的拳。 */
    claimed: Hand;
}
/** 一局对局的全部可测状态。 */
export interface RpsState {
    /** 注入的确定性随机源。 */
    rng: () => number;
    /** 已完成轮数（0..15）。 */
    round: number;
    score: number;
    /** 当前连赢轮数（平/输清零）。 */
    streak: number;
    bestStreak: number;
    wins: number;
    draws: number;
    losses: number;
    /** 被读心总次数（AI 预测 === 玩家实际）。 */
    readCount: number;
    /** 玩家历史出拳（转移表的数据源）。 */
    history: Hand[];
    /** 一阶转移表：上一拳 -> 三种后继的计数。 */
    table1: Map<number, number[]>;
    /** 二阶转移表：上两拳（'a:b'）-> 三种后继的计数。 */
    table2: Map<string, number[]>;
    /** 提示时提前算好的下一轮预测（保证提示真假的承诺可兑现）。 */
    pendingPrediction: Hand | null;
    /** 最近一次提示（每 3 轮更新，其余轮为 null）。 */
    lastHint: RpsHint | null;
    /** 最近一轮复盘（render 用）。 */
    last: RpsRoundResult | null;
    over: boolean;
}
/** 总轮数。 */
export declare const TOTAL_ROUNDS = 15;
/**
 * 开新局：注入 seed，得到干净状态。
 * @param seed - 种子（同 seed 同输入序列完全重放）。
 */
export declare function createRpsState(seed: number): RpsState;
/**
 * 克制判定：(a+1)%3 === b 即 a 胜 b（石>剪、剪>布、布>石）。
 */
export declare function beats(a: Hand, b: Hand): boolean;
/**
 * 克制 h 的拳（石头->布、剪刀->石头、布->剪刀）。
 */
export declare function counterOf(h: Hand): Hand;
/**
 * 学习率：前 5 轮 0（纯随机），之后每轮 +0.12，封顶 0.9。
 * @param roundsDone - 已完成轮数。
 */
export declare function learningRate(roundsDone: number): number;
/**
 * 转移表更新：记录玩家一次出拳（一阶 + 二阶各记一笔）。
 * @param state - 对局状态（就地更新）。
 * @param hand - 玩家本拳。
 */
export declare function updateMarkov(state: RpsState, hand: Hand): void;
/**
 * 预测玩家下一拳：随机掷点低于学习率才启用马尔可夫，否则纯随机；
 * 二阶行样本 >=2 优先，退化到一阶行，再退化随机。行内取平滑后
 * （每拳 +0.5 伪计数）的最高频后继，平票按编号序确定性取胜。
 * @param state - 对局状态（只读）。
 * @param rand - 随机源（决定走随机还是学习分支）。
 * @returns AI 对玩家下一拳的预测。
 */
export declare function predictNext(state: RpsState, rand: () => number): Hand;
/**
 * 连赢加成：第 n 连胜额外 +50*(n-1)，封顶 +150。
 * @param streakAfterWin - 含本轮在内的连赢数。
 */
export declare function streakBonus(streakAfterWin: number): number;
/**
 * 生成一句「说漏嘴」提示：50% 真话（声称 AI 真实的预测），50% 谎话
 * （声称另外两种拳之一）；谎话句尾带「…才怪」，真话只带「…」。
 * @param predicted - AI 对玩家下一拳的真实预测。
 * @param rand - 随机源。
 */
export declare function generateHint(predicted: Hand, rand: () => number): RpsHint;
/**
 * 打一轮：复用 pendingPrediction（提示时提前算好的承诺）或现场预测，
 * AI 出克制拳，判定胜负并计分（赢 +100+连击加成、平 +20、输 0），
 * 更新转移表与统计；每到第 3 的倍数轮且未结束，提前算好下一轮预测
 * 并生成一句提示。
 * @param state - 对局状态（就地更新）。
 * @param player - 玩家本拳。
 * @returns 本轮复盘；对局已结束时返回 null。
 */
export declare function playRound(state: RpsState, player: Hand): RpsRoundResult | null;
