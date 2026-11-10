/**
 * 取子博弈 Nim（Misère 变体）纯逻辑：3-5 排火柴（每排 2-7 根），双方
 * 轮流从同一排取 1 根到整排，取到最后一根火柴的一方输。仅含确定性纯
 * 函数——无 DOM、无定时器；随机性（开局牌面、AI 随机档位）全部经由
 * 注入的 rng（mulberry32）驱动，同种子同序列。
 */
/** 一赛局数：5 局定胜负。 */
export declare const GAMES_PER_MATCH = 5;
/** 开局最少排数。 */
export declare const MIN_ROWS = 3;
/** 开局最多排数。 */
export declare const MAX_ROWS = 5;
/** 每排最少火柴数。 */
export declare const MIN_ROW_STICKS = 2;
/** 每排最多火柴数。 */
export declare const MAX_ROW_STICKS = 7;
/** AI 随机档位：每步以该概率走出随机步（放弃必胜，给玩家胜机）。 */
export declare const AI_MISTAKE_RATE = 0.2;
/** 对局双方。 */
export type Side = 'player' | 'ai';
/** 一步取子：从第 row 排取 count 根。 */
export interface NimMove {
    row: number;
    count: number;
}
/** 一局局面：rows 为各排剩余火柴数。 */
export interface NimState {
    rows: number[];
    /** 当前该谁取。 */
    turn: Side;
    /** AI 本局已取走的火柴根数（计分用）。 */
    aiSticks: number;
    /** 局面是否已终局（火柴取尽）。 */
    over: boolean;
    /** 终局时的输家（取到最后一根的一方），未终局为 null。 */
    loser: Side | null;
}
/**
 * mulberry32 确定性伪随机数生成器：返回 [0,1) 的函数，同种子同序列。
 * @param seed - 非负整数种子。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 生成开局：3-5 排、每排 2-7 根火柴，玩家先手。
 * @param rng - 注入的确定性随机源。
 */
export declare function createRound(rng: () => number): NimState;
/**
 * 取子转移：从第 row 排取 count 根并轮换走子方。取到最后一根即终局，
 * 取子方（终局后 turn 的对方）为输家。纯函数，不修改入参。
 * @param state - 当前局面。
 * @param row - 目标排下标（0 起）。
 * @param count - 取子数（1..该排剩余）。
 * @returns 新局面；非法走法（越界、count 越界、空排、已终局）返回 null。
 */
export declare function take(state: NimState, row: number, count: number): NimState | null;
/** 各排火柴数的异或和（Nim 安全性判据）。 */
export declare function xorSum(rows: number[]): number;
/**
 * Misère Nim 必胜步求解：多于 1 个大排（≥2 根）时按普通 Nim 异或归零；
 * 恰好 1 个大排时改调奇偶（给对手留下奇数个 1 根排）；全部为 1 根排时
 * 走 1（偶数个时为必胜调正，奇数个时为认败拖步）。
 * @param rows - 各排剩余火柴数。
 * @returns 一步必胜（或必败位下的拖延）走法；空盘返回 null。
 */
export declare function bestMove(rows: number[]): NimMove | null;
/**
 * 随机档位走法：等概率取任意合法步，但有替代项时绝不一步取尽全场
 * （避免随机档白送终局）。
 * @param rows - 各排剩余火柴数。
 * @param rng - 注入的确定性随机源。
 * @returns 随机合法走法；空盘返回 null。
 */
export declare function randomMove(rows: number[], rng: () => number): NimMove | null;
/**
 * AI 走子：以 mistakeRate 概率落入随机档位，否则走必胜步。
 * @param rows - 各排剩余火柴数。
 * @param rng - 注入的确定性随机源。
 * @param mistakeRate - 随机档概率（0 恒最优，1 恒随机）。
 * @returns 一步走法；空盘返回 null。
 */
export declare function aiChoose(rows: number[], rng: () => number, mistakeRate: number): NimMove | null;
/**
 * 玩家赢局计分：底分 10 + AI 本局取走的火柴根数——玩家逼 AI 取子越多
 * （自己路线越精简），得分越高。
 * @param aiSticks - AI 本局取走的火柴根数。
 * @returns 本局得分。
 */
export declare function winScore(aiSticks: number): number;
