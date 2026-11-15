/**
 * 成语接龙 IdiomChain 纯逻辑：内置带拼音首尾的精选成语库，玩家与 AI
 * 轮流接龙（尾字与下一成语首字同音即可接，同字为正接；正接按链位计
 * 分，同音接得固定小分），玩家从 seed 发的 6 张手牌候选中出牌或跳过
 * （跳过送 AI 得分），双方都无牌可接即死局重新起头；5 局累计分定胜负。
 * 全部随机走注入 seed（mulberry32），任何种子下的整局都可以确定性重放。
 */
/** 单条成语词条：成语、简注，以及首字/尾字的无声调拼音（同音判定用）。 */
export interface IdiomEntry {
    /** 四字成语本体。 */
    idiom: string;
    /** 一句简注。 */
    meaning: string;
    /** 首字无声调拼音。 */
    headPy: string;
    /** 尾字无声调拼音。 */
    tailPy: string;
}
/** 精选常用四字成语库（160 条，硬编码，含拼音首尾）。 */
export declare const IDIOMS: readonly IdiomEntry[];
/** 总局数。 */
export declare const ROUNDS = 5;
/** 每局玩家的出牌/跳过次数。 */
export declare const TURNS_PER_ROUND = 4;
/** 手牌候选数量。 */
export declare const HAND_SIZE = 6;
/** 每回合时限（毫秒）。 */
export declare const TURN_MS = 20000;
/** 玩家跳过时 AI 得到的分数。 */
export declare const SKIP_GIFT = 5;
/** 同音（不同字）接龙的固定得分（正接为 10×链位）。 */
export declare const HOMOPHONE_GAIN = 5;
/** AI 找到接龙的概率（其余情况跳过）。 */
export declare const AI_PLAY_RATE = 0.7;
/** 接龙判定结果：exact 同字正接 / homophone 同音不同字 / null 不可接。 */
export type LinkKind = 'exact' | 'homophone';
/** mulberry32 确定性随机数发生器。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 接龙判定：上一条成语的尾字与下一条的首字同字为 exact，同音不同字为
 * homophone，否则不可接。
 * @param prev - 链上上一条成语。
 * @param next - 待接的成语。
 * @returns 接法，或 null 表示接不上。
 */
export declare function linkKind(prev: IdiomEntry, next: IdiomEntry): LinkKind | null;
/** 时间计分递减系数：满时 1.0，耗尽时 0.5（线性）。 */
export declare function timeFactor(remainingMs: number): number;
/** 正接得 10×链位、同音接得固定 5 分，再乘时间系数。 */
export declare function gainFor(kind: LinkKind, chainPos: number, remainingMs: number): number;
/** AI 的一步棋描述（渲染层做动画与提示用）。 */
export interface AiMove {
    type: 'play' | 'skip';
    /** 出牌时的成语（type 为 play 时有效）。 */
    entry?: IdiomEntry;
    /** 出牌时的接法。 */
    kind?: LinkKind;
    /** 本次得分。 */
    gain: number;
}
/** 一局 match 的全部可变状态（rng 注入，纯数据可重放）。 */
export interface MatchState {
    /** 当前局（1..ROUNDS）。 */
    round: number;
    /** 本局已进行的玩家回数（0..TURNS_PER_ROUND）。 */
    turnInRound: number;
    /** playing 进行中 / over 五局结束。 */
    phase: 'playing' | 'over';
    /** 当前链条（chain[0] 为起头成语）。 */
    chain: IdiomEntry[];
    /** 当前 6 张手牌候选。 */
    hand: IdiomEntry[];
    /** 已用过的成语（不得重复出）。 */
    used: Set<string>;
    playerScore: number;
    aiScore: number;
    /** 双方连续跳过计数（≥2 触发死局重起）。 */
    consecutiveSkips: number;
    /** 死局重起次数。 */
    restarts: number;
    /** AI 最近一步（渲染层展示）。 */
    aiLastMove: AiMove | null;
    /** 注入的随机流。 */
    rng: () => number;
}
/** 链条尾部的成语（链为空时取库里第一条，仅类型兜底）。 */
export declare function chainTail(state: MatchState): IdiomEntry;
/** 手牌中可接当前链尾的下标列表。 */
export declare function playableIndices(state: MatchState): number[];
/**
 * 发一手 6 张候选（确定性）：对未用成语下标做局部 Fisher–Yates 洗牌取
 * 前 6 张；若洗出的 6 张全部接不上且库中还有可接的未用成语，则随机换
 * 入一张可接的，保证玩家绝大多数回合有牌可出。全程有界，任何 rng 都
 * 不会死循环。
 * @param state - 比赛状态（就地更新 hand）。
 */
export declare function dealHand(state: MatchState): void;
/** 死局或新局起头：从未用成语里随机挑一条做链首。 */
export declare function restartChain(state: MatchState): void;
/**
 * AI 一步（确定性）：收集可接成语，rng < AI_PLAY_RATE 时按 rng 挑一条
 * 接上（正接 10×链位、同音 5 分，不吃时间系数），否则跳过。
 * @param state - 比赛状态（就地更新链与分数）。
 * @returns 这一步的描述。
 */
export declare function aiTurn(state: MatchState): AiMove;
/**
 * 玩家从手牌出牌接龙。
 * @param state - 比赛状态。
 * @param handIndex - 手牌下标（0..5）。
 * @param remainingMs - 剩余时间（毫秒），用于计分递减。
 * @returns ok 是否成功，gain 得分，kind 接法。
 */
export declare function playerPlay(state: MatchState, handIndex: number, remainingMs: number): {
    ok: boolean;
    gain: number;
    kind: LinkKind | null;
};
/**
 * 玩家跳过：AI 得 SKIP_GIFT 分，随后 AI 行动（可能死局重起）。
 * @param state - 比赛状态。
 * @returns AI 这一步的描述。
 */
export declare function playerSkip(state: MatchState): AiMove;
/**
 * 建立一场 match：起头一条链、发 6 张手牌（全部由 seed 决定）。
 * @param seed - 种子（同一 seed 得到完全相同的局面与走向）。
 * @returns 初始比赛状态。
 */
export declare function createMatch(seed: number): MatchState;
/**
 * 确定性整局脚本（测试重放用）：每回合一律出第一张可接的手牌（按
 * remainingMs 接牌），无牌可接则跳过，直到没有动作可做或终局。
 * @param seed - 比赛种子。
 * @param maxTurns - 最多执行的玩家回合数（防死循环）。
 * @returns 每回合之后的快照序列。
 */
export declare function playSkipScript(seed: number, maxTurns: number): Array<ReturnType<typeof snapshot>>;
/** 终局判定：玩家胜 / AI 胜 / 平局；未结束时为 null。 */
export declare function finalResult(state: MatchState): 'player' | 'ai' | 'draw' | null;
/** 重放对比快照：与随机无关的可比较纯数据（测试确定性用）。 */
export declare function snapshot(state: MatchState): {
    round: number;
    turnInRound: number;
    phase: string;
    chain: string[];
    hand: string[];
    playerScore: number;
    aiScore: number;
    restarts: number;
};
